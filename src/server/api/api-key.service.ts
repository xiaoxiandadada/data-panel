import { Injectable, OnModuleInit } from "@nestjs/common";
import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import type { ApiKeyRecord } from "../core/types.js";
import { LedgerStoreService } from "../infra/ledger-store.service.js";

interface ApiClient {
  name: string;
  key: string;
}

export interface ResolvedClient {
  name: string;
  /** Present only for database-backed credentials; used to stamp last-used. */
  id: string;
  source: "env" | "database";
}

/** SHA-256 hex. A credential is only ever stored and compared as this digest. */
export function hashApiKey(key: string): string {
  return createHash("sha256").update(String(key || ""), "utf8").digest("hex");
}

/**
 * Bearer-token auth for the outward-facing `/api/v1` surface.
 *
 * Two sources, checked in this order:
 *
 * 1. `PUBLIC_API_KEYS` — comma-separated, each entry either `name:key` or a bare `key`. Simple, but it
 *    lives in the GitOps repository's values.yaml, which most of this project's developers cannot write
 *    to, and every rotation costs a rolling restart.
 * 2. The `api_keys` collection — created and revoked by a super administrator at runtime, stored as a
 *    SHA-256 digest so neither a database dump nor an admin listing yields a working credential.
 *
 * With neither configured the API answers 501 for every request. It deliberately does not fall back to
 * "open when unconfigured": this endpoint serves the whole requirement ledger, and an unconfigured
 * deployment silently publishing it is the one failure mode worth designing against.
 */
@Injectable()
export class ApiKeyService implements OnModuleInit {
  private readonly clients: ApiClient[] = parseClients(process.env.PUBLIC_API_KEYS);
  private readonly windowMs = Math.max(Number(process.env.PUBLIC_API_RATE_WINDOW_MS || 60_000), 1_000);
  private readonly limit = Math.max(Number(process.env.PUBLIC_API_RATE_LIMIT || 600), 1);
  private readonly hits = new Map<string, { count: number; resetAt: number }>();
  private databaseKeyCount = 0;

  constructor(private readonly store: LedgerStoreService) {}

  /**
   * States the configured surface at boot. Configuring the environment variable means editing a
   * values.yaml in a separate GitOps repository, where a typo is invisible until someone's request
   * 401s — so the log names the clients it parsed (names only, never the keys) to make "did my change
   * land" answerable from logs.
   */
  async onModuleInit() {
    await this.refreshDatabaseKeyCount();
    const parts = [
      this.clients.length ? `环境变量 ${this.clients.length} 个（${this.clients.map((client) => client.name).join(", ")}）` : "",
      this.databaseKeyCount ? `数据库 ${this.databaseKeyCount} 个` : ""
    ].filter(Boolean);
    if (!parts.length) {
      console.log("Public API disabled: no key from PUBLIC_API_KEYS or the api_keys collection, /api/v1 will answer 501");
      return;
    }
    console.log(`Public API enabled: ${parts.join("，")}（limit ${this.limit}/${this.windowMs}ms）`);
  }

  /**
   * Whether any credential exists at all. Checks the live count rather than a boot-time snapshot, so a
   * key created through the admin API takes effect immediately instead of after the next restart —
   * which is the entire reason the database path exists.
   */
  async isConfigured(): Promise<boolean> {
    if (this.clients.length) return true;
    await this.refreshDatabaseKeyCount();
    return this.databaseKeyCount > 0;
  }

  clientCount(): number {
    return this.clients.length;
  }

  /**
   * Resolves a presented credential. Environment keys are compared in constant time against every
   * configured entry so a wrong key cannot be distinguished from a wrong-length one by timing; database
   * keys are looked up by digest, which is a constant-shape index probe.
   */
  async resolve(presented: string): Promise<ResolvedClient | null> {
    const candidate = String(presented || "").trim();
    if (!candidate) return null;
    let matched: ApiClient | null = null;
    for (const client of this.clients) {
      if (secureEqual(candidate, client.key) && !matched) matched = client;
    }
    if (matched) return { name: matched.name, id: "", source: "env" };

    const stored = await this.store.findApiKeyByHash(hashApiKey(candidate));
    if (!stored) return null;
    void this.store.touchApiKey(stored.id);
    return { name: stored.name, id: stored.id, source: "database" };
  }

  /**
   * Mints a credential. The plaintext is returned exactly once and never stored — only its digest is,
   * so there is no route by which this key can be recovered later, including for whoever created it.
   */
  async issue(name: string, createdBy: string): Promise<{ record: ApiKeyRecord; key: string }> {
    const cleanName = String(name || "").trim().slice(0, 60) || "unnamed";
    // 32 bytes of hex: the same shape `openssl rand -hex 32` produces, and free of the comma that
    // would otherwise split one credential into two when read from PUBLIC_API_KEYS.
    const key = randomBytes(32).toString("hex");
    const record: ApiKeyRecord = {
      id: randomUUID(),
      name: cleanName,
      keyHash: hashApiKey(key),
      createdAt: new Date().toISOString(),
      createdBy: String(createdBy || "").trim(),
      lastUsedAt: "",
      revokedAt: ""
    };
    await this.store.createApiKey(record);
    this.databaseKeyCount += 1;
    return { record, key };
  }

  async list(): Promise<ApiKeyRecord[]> {
    return this.store.listApiKeys();
  }

  async revoke(id: string): Promise<boolean> {
    const revoked = await this.store.revokeApiKey(String(id || "").trim());
    if (revoked) await this.refreshDatabaseKeyCount();
    return revoked;
  }

  /** Fixed-window counter, per client. Enough to stop a runaway caller; not a billing mechanism. */
  consume(clientName: string): { allowed: boolean; remaining: number; resetAt: number } {
    const now = Date.now();
    const current = this.hits.get(clientName);
    if (!current || current.resetAt <= now) {
      const resetAt = now + this.windowMs;
      this.hits.set(clientName, { count: 1, resetAt });
      return { allowed: true, remaining: this.limit - 1, resetAt };
    }
    current.count += 1;
    return { allowed: current.count <= this.limit, remaining: Math.max(this.limit - current.count, 0), resetAt: current.resetAt };
  }

  limits() {
    return { limit: this.limit, windowMs: this.windowMs };
  }

  private async refreshDatabaseKeyCount(): Promise<void> {
    try {
      const keys = await this.store.listApiKeys();
      this.databaseKeyCount = keys.filter((key) => !key.revokedAt).length;
    } catch {
      // Without Mongo the collection is simply unavailable; the environment variable still works.
      this.databaseKeyCount = 0;
    }
  }
}

function parseClients(raw: string | undefined): ApiClient[] {
  return String(raw || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry, index) => {
      const separator = entry.indexOf(":");
      // A bare key is allowed; it just gets a positional name so the rate limiter can key on it.
      // A leading colon means the operator wrote `:key` with the name left blank — strip it, or the
      // credential would silently become ":key" and every `Bearer key` request would 401.
      if (separator < 0) return { name: `client-${index + 1}`, key: entry };
      if (separator === 0) return { name: `client-${index + 1}`, key: entry.slice(1).trim() };
      return { name: entry.slice(0, separator).trim() || `client-${index + 1}`, key: entry.slice(separator + 1).trim() };
    })
    .filter((client) => client.key.length > 0);
}

function secureEqual(value: string, expected: string): boolean {
  const left = Buffer.from(value);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

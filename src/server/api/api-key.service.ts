import { Injectable } from "@nestjs/common";
import { timingSafeEqual } from "node:crypto";

interface ApiClient {
  name: string;
  key: string;
}

/**
 * Bearer-token auth for the outward-facing `/api/v1` surface.
 *
 * Keys come from `PUBLIC_API_KEYS` as a comma-separated list, each entry either `name:key` or a bare
 * `key`. The name is only ever used for logging and for telling one caller apart from another in the
 * rate limiter — it is not a secret and it is not part of the credential.
 *
 * With no keys configured the API answers 501 for every request. It deliberately does not fall back to
 * "open when unconfigured": this endpoint serves the whole requirement ledger, and an unconfigured
 * deployment silently publishing it is the one failure mode worth designing against.
 */
@Injectable()
export class ApiKeyService {
  private readonly clients: ApiClient[] = parseClients(process.env.PUBLIC_API_KEYS);
  private readonly windowMs = Math.max(Number(process.env.PUBLIC_API_RATE_WINDOW_MS || 60_000), 1_000);
  private readonly limit = Math.max(Number(process.env.PUBLIC_API_RATE_LIMIT || 600), 1);
  private readonly hits = new Map<string, { count: number; resetAt: number }>();

  isConfigured(): boolean {
    return this.clients.length > 0;
  }

  clientCount(): number {
    return this.clients.length;
  }

  /**
   * Resolves a presented credential to a client name, comparing in constant time against every
   * configured key so a wrong key cannot be distinguished from a wrong-length key by timing.
   */
  resolve(presented: string): ApiClient | null {
    const candidate = String(presented || "").trim();
    if (!candidate) return null;
    let matched: ApiClient | null = null;
    for (const client of this.clients) {
      if (secureEqual(candidate, client.key) && !matched) matched = client;
    }
    return matched;
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
}

function parseClients(raw: string | undefined): ApiClient[] {
  return String(raw || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry, index) => {
      const separator = entry.indexOf(":");
      // A bare key is allowed; it just gets a positional name so the rate limiter can key on it.
      if (separator <= 0) return { name: `client-${index + 1}`, key: entry };
      return { name: entry.slice(0, separator).trim() || `client-${index + 1}`, key: entry.slice(separator + 1).trim() };
    })
    .filter((client) => client.key.length > 0);
}

function secureEqual(value: string, expected: string): boolean {
  const left = Buffer.from(value);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

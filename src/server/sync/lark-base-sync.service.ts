import { Injectable, OnApplicationBootstrap, OnModuleDestroy } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { LarkOAuthService } from "../auth/lark-oauth.service.js";
import type { ImportBatch } from "../core/types.js";
import { LedgerStoreService } from "../infra/ledger-store.service.js";
import { QueueService } from "../infra/queue.service.js";
import { mergeImportedDataset } from "../ledger/parse-utils.js";

export interface LarkSyncResult {
  source: string;
  tableId: string;
  batch: ImportBatch;
}

export interface LarkSyncSource {
  key: "ledger" | "project-245" | "gaofeng";
  source: string;
  tableId: string;
  viewId: string;
  url: string;
  configured: boolean;
}

@Injectable()
export class LarkBaseSyncService implements OnApplicationBootstrap, OnModuleDestroy {
  private timer: NodeJS.Timeout | null = null;
  private eventTimer: NodeJS.Timeout | null = null;
  private syncing = false;
  private syncQueue: Promise<void> = Promise.resolve();
  private readonly pendingEventSources = new Map<LarkSyncSource["key"], string>();
  private resolvedAppToken = "";
  private lastSyncedAt = "";
  private lastError = "";

  constructor(
    private readonly store: LedgerStoreService,
    private readonly lark: LarkOAuthService,
    private readonly queue: QueueService
  ) {}

  onApplicationBootstrap() {
    if (!this.isConfigured()) return;
    const interval = Math.max(Number(process.env.LARK_SYNC_INTERVAL_MS || 300_000), 60_000);
    void this.syncAll("系统自动同步").catch((error) => console.warn(`Initial Lark Base sync failed: ${(error as Error).message}`));
    this.timer = setInterval(() => {
      void this.syncAll("系统自动同步").catch((error) => console.warn(`Lark Base sync failed: ${(error as Error).message}`));
    }, interval);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    if (this.eventTimer) clearTimeout(this.eventTimer);
  }

  isConfigured(): boolean {
    return Boolean(
      (process.env.LARK_BASE_TOKEN || this.wikiNodeToken())
      && this.sourceConfigurations().some((source) => source.configured)
      && this.lark.isBotConfigured()
    );
  }

  status() {
    return {
      configured: this.isConfigured(),
      syncing: this.syncing,
      eventPushConfigured: Boolean(String(process.env.LARK_BASE_WEBHOOK_SECRET || "").trim()),
      pendingEventCount: this.pendingEventSources.size,
      lastSyncedAt: this.lastSyncedAt,
      lastError: this.lastError
    };
  }

  sourceConfigurations(): LarkSyncSource[] {
    const baseUrl = String(
      process.env.LARK_BASE_WEB_URL
      || "https://aicarrier.feishu.cn/wiki/ZqC3whTTXiU2rUkLdRycTtmhnYE"
    ).trim();
    const source = (
      key: LarkSyncSource["key"],
      name: string,
      tableIdEnv: string,
      viewIdEnv: string,
      urlEnv: string,
      defaultTableId: string,
      defaultViewId: string
    ): LarkSyncSource => {
      const tableId = String(process.env[tableIdEnv] || defaultTableId).trim();
      const viewId = String(process.env[viewIdEnv] || defaultViewId).trim();
      const configuredUrl = String(process.env[urlEnv] || "").trim();
      return {
        key,
        source: name,
        tableId,
        viewId,
        url: configuredUrl || this.tableUrl(baseUrl, tableId, viewId),
        configured: Boolean(tableId)
      };
    };
    return [
      source(
        "ledger",
        "总台账",
        "LARK_LEDGER_TABLE_ID",
        "LARK_LEDGER_VIEW_ID",
        "LARK_LEDGER_URL",
        "tbl7FrAYMpseNuPA",
        "vewkBG8gpp"
      ),
      source(
        "project-245",
        "245",
        "LARK_245_TABLE_ID",
        "LARK_245_VIEW_ID",
        "LARK_245_URL",
        "tbl6dWpodWYuWNq7",
        "vew41dhWuZ"
      ),
      source(
        "gaofeng",
        "高峰加入",
        "LARK_GAOFENG_TABLE_ID",
        "LARK_GAOFENG_VIEW_ID",
        "LARK_GAOFENG_URL",
        "tbl8iFcCizgi0YrU",
        "vewkBG8gpp"
      )
    ];
  }

  async syncAll(actor = "系统"): Promise<LarkSyncResult[]> {
    if (!this.isConfigured()) throw new Error("飞书 Base 自动同步配置不完整");
    return this.enqueueSync(this.sourceConfigurations().filter((item) => item.configured), actor);
  }

  scheduleTableSync(tableId: string, actor = "飞书实时推送"): LarkSyncSource | null {
    const source = this.sourceConfigurations().find((item) => item.configured && item.tableId === tableId);
    if (!source) return null;
    this.pendingEventSources.set(source.key, actor);
    if (!this.eventTimer) {
      this.eventTimer = setTimeout(() => {
        this.eventTimer = null;
        void this.flushEventSources();
      }, 300);
      this.eventTimer.unref();
    }
    return source;
  }

  private enqueueSync(sources: LarkSyncSource[], actor: string): Promise<LarkSyncResult[]> {
    let resolveTask!: (results: LarkSyncResult[]) => void;
    let rejectTask!: (error: unknown) => void;
    const task = new Promise<LarkSyncResult[]>((resolve, reject) => {
      resolveTask = resolve;
      rejectTask = reject;
    });
    this.syncQueue = this.syncQueue
      .then(async () => {
        try {
          resolveTask(await this.performSync(sources, actor));
        } catch (error) {
          rejectTask(error);
        }
      })
      .catch(() => undefined);
    return task;
  }

  private async performSync(sources: LarkSyncSource[], actor: string): Promise<LarkSyncResult[]> {
    this.syncing = true;
    try {
      const appToken = await this.baseAppToken();
      const results: LarkSyncResult[] = [];
      for (const source of sources) {
        const incoming = await this.lark.listBaseDataset(appToken, source.tableId, source.viewId);
        const existing = await this.store.readDataset();
        const merged = mergeImportedDataset(existing, incoming, source.source);
        const batch: ImportBatch = {
          id: randomUUID(),
          source: source.source,
          fileName: source.tableId,
          mode: "lark",
          ...merged.summary,
          actor,
          createdAt: new Date().toISOString()
        };
        await this.store.saveDataset(merged.dataset);
        await this.store.appendImportBatch(batch);
        await this.queue.enqueue("dataset.synced", { source: source.source, count: incoming.records.length });
        results.push({ source: source.source, tableId: source.tableId, batch });
      }
      this.lastSyncedAt = new Date().toISOString();
      this.lastError = "";
      return results;
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : "飞书 Base 同步失败";
      throw error;
    } finally {
      this.syncing = false;
    }
  }

  private async flushEventSources(): Promise<void> {
    const pending = new Map(this.pendingEventSources);
    this.pendingEventSources.clear();
    const sources = this.sourceConfigurations().filter((source) => pending.has(source.key));
    if (!sources.length) return;
    const actor = [...pending.values()].at(-1) || "飞书实时推送";
    try {
      await this.enqueueSync(sources, actor);
    } catch (error) {
      console.warn(`Lark Base event sync failed: ${(error as Error).message}`);
    }
    if (this.pendingEventSources.size && !this.eventTimer) {
      this.eventTimer = setTimeout(() => {
        this.eventTimer = null;
        void this.flushEventSources();
      }, 300);
      this.eventTimer.unref();
    }
  }

  private async baseAppToken(): Promise<string> {
    if (this.resolvedAppToken) return this.resolvedAppToken;
    const configured = String(process.env.LARK_BASE_TOKEN || "").trim();
    this.resolvedAppToken = configured || await this.lark.resolveWikiNodeObjectToken(this.wikiNodeToken());
    return this.resolvedAppToken;
  }

  private wikiNodeToken(): string {
    return String(process.env.LARK_WIKI_NODE_TOKEN || "ZqC3whTTXiU2rUkLdRycTtmhnYE").trim();
  }

  private tableUrl(baseUrl: string, tableId: string, viewId: string): string {
    if (!baseUrl || !tableId) return "";
    try {
      const url = new URL(baseUrl);
      url.searchParams.set("table", tableId);
      if (viewId) url.searchParams.set("view", viewId);
      else url.searchParams.delete("view");
      return url.toString();
    } catch {
      return "";
    }
  }
}

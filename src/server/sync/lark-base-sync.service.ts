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

@Injectable()
export class LarkBaseSyncService implements OnApplicationBootstrap, OnModuleDestroy {
  private timer: NodeJS.Timeout | null = null;
  private syncing = false;
  private resolvedAppToken = "";

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
  }

  isConfigured(): boolean {
    return Boolean(
      (process.env.LARK_BASE_TOKEN || process.env.LARK_WIKI_NODE_TOKEN)
      && process.env.LARK_LEDGER_TABLE_ID
      && this.lark.isBotConfigured()
    );
  }

  async syncAll(actor = "系统"): Promise<LarkSyncResult[]> {
    if (!this.isConfigured()) throw new Error("飞书 Base 自动同步配置不完整");
    if (this.syncing) return [];
    this.syncing = true;
    try {
      const appToken = await this.baseAppToken();
      const sources = [
        {
          source: "总台账",
          tableId: String(process.env.LARK_LEDGER_TABLE_ID || "").trim(),
          viewId: String(process.env.LARK_LEDGER_VIEW_ID || "").trim()
        },
        {
          source: "数据团队总表",
          tableId: String(process.env.LARK_DATA_TEAM_TABLE_ID || "").trim(),
          viewId: String(process.env.LARK_DATA_TEAM_VIEW_ID || "").trim()
        }
      ].filter((item) => item.tableId);
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
      return results;
    } finally {
      this.syncing = false;
    }
  }

  private async baseAppToken(): Promise<string> {
    if (this.resolvedAppToken) return this.resolvedAppToken;
    const configured = String(process.env.LARK_BASE_TOKEN || "").trim();
    this.resolvedAppToken = configured || await this.lark.resolveWikiNodeObjectToken(String(process.env.LARK_WIKI_NODE_TOKEN || ""));
    return this.resolvedAppToken;
  }
}

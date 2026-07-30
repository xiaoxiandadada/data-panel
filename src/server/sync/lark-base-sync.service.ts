import { Injectable, OnApplicationBootstrap, OnModuleDestroy } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { LarkOAuthService } from "../auth/lark-oauth.service.js";
import { stringifyCell } from "../core/ledger-utils.js";
import type { FieldValue, ImportBatch, LedgerRecord } from "../core/types.js";
import { LedgerStoreService } from "../infra/ledger-store.service.js";
import { QueueService } from "../infra/queue.service.js";
import { importBusinessKey, mergeFields, mergeImportedDataset } from "../ledger/parse-utils.js";

export interface LarkSyncResult {
  source: string;
  tableId: string;
  batch: ImportBatch;
}

export interface LarkSyncSourceStatus {
  source: string;
  tableId: string;
  lastSyncedAt: string;
  lastError: string;
}

export interface LarkSyncSource {
  key: "ledger" | "project-245" | "gaofeng";
  source: string;
  tableId: string;
  viewId: string;
  url: string;
  configured: boolean;
}

// One table's coalesced webhook events. Record ids accumulate so a burst of edits on the same
// table costs one round of single-record reads; fullTable is set when an event arrives without a
// record id, which forces the whole table to be re-read.
interface PendingTableEvent {
  actor: string;
  recordIds: Set<string>;
  fullTable: boolean;
}

@Injectable()
export class LarkBaseSyncService implements OnApplicationBootstrap, OnModuleDestroy {
  private timer: NodeJS.Timeout | null = null;
  private eventTimer: NodeJS.Timeout | null = null;
  private syncing = false;
  private syncQueue: Promise<void> = Promise.resolve();
  private readonly pendingEventSources = new Map<LarkSyncSource["key"], PendingTableEvent>();
  private readonly sourceStatuses = new Map<LarkSyncSource["key"], LarkSyncSourceStatus>();
  private resolvedAppToken = "";
  private lastSyncedAt = "";
  private lastError = "";
  // Notification baseline, tracked per table: the first successful full read only establishes what
  // that table currently looks like. It has to be per table, not global — a table whose permission
  // is granted later than its siblings would otherwise inherit their baseline and replay its entire
  // history as status changes on its first successful sync.
  private readonly notificationBaselines = new Set<LarkSyncSource["key"]>();

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
    const configuredSources = this.sourceConfigurations().filter((source) => source.configured);
    return {
      configured: this.isConfigured(),
      syncing: this.syncing,
      eventPushConfigured: Boolean(String(process.env.LARK_BASE_WEBHOOK_SECRET || "").trim()),
      pendingEventCount: this.pendingEventSources.size,
      pendingRecordCount: [...this.pendingEventSources.values()].reduce((sum, event) => sum + event.recordIds.size, 0),
      // True only once every configured table has been read successfully at least once, so a table
      // still waiting on its permissions keeps this false and stays visible as unfinished setup.
      notificationBaselineReady: configuredSources.length > 0
        && configuredSources.every((source) => this.notificationBaselines.has(source.key)),
      lastSyncedAt: this.lastSyncedAt,
      lastError: this.lastError,
      sources: this.sourceConfigurations().map((source) => ({
        ...(this.sourceStatuses.get(source.key) || {
          source: source.source,
          tableId: source.tableId,
          lastSyncedAt: "",
          lastError: ""
        }),
        notificationBaseline: this.notificationBaselines.has(source.key)
      }))
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

  scheduleTableSync(tableId: string, recordId = "", actor = "飞书实时推送"): LarkSyncSource | null {
    const source = this.sourceConfigurations().find((item) => item.configured && item.tableId === tableId);
    if (!source) return null;
    const pending = this.pendingEventSources.get(source.key)
      || { actor, recordIds: new Set<string>(), fullTable: false };
    pending.actor = actor;
    const cleanRecordId = String(recordId || "").trim();
    if (cleanRecordId) pending.recordIds.add(cleanRecordId);
    else pending.fullTable = true;
    this.pendingEventSources.set(source.key, pending);
    if (!this.eventTimer) {
      this.eventTimer = setTimeout(() => {
        this.eventTimer = null;
        void this.flushEventSources();
      }, 300);
      this.eventTimer.unref();
    }
    return source;
  }

  private enqueueTask<T>(run: () => Promise<T>): Promise<T> {
    let resolveTask!: (value: T) => void;
    let rejectTask!: (error: unknown) => void;
    const task = new Promise<T>((resolve, reject) => {
      resolveTask = resolve;
      rejectTask = reject;
    });
    this.syncQueue = this.syncQueue
      .then(async () => {
        try {
          resolveTask(await run());
        } catch (error) {
          rejectTask(error);
        }
      })
      .catch(() => undefined);
    return task;
  }

  private enqueueSync(sources: LarkSyncSource[], actor: string): Promise<LarkSyncResult[]> {
    return this.enqueueTask(() => this.performSync(sources, actor));
  }

  private async performSync(sources: LarkSyncSource[], actor: string): Promise<LarkSyncResult[]> {
    this.syncing = true;
    try {
      const appToken = await this.baseAppToken();
      const results: LarkSyncResult[] = [];
      const errors: string[] = [];
      const initialDataset = await this.store.readDataset();
      const ledgerSeeded = initialDataset.records.length > 0;
      for (const source of sources) {
        try {
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
          // Only a table that already has a baseline can produce a meaningful diff. Reading a table
          // for the first time — a fresh deploy, or one table's permission arriving later than the
          // others — would otherwise report every historical status as a change.
          if (ledgerSeeded && this.notificationBaselines.has(source.key)) {
            await this.enqueueStatusChanges(existing.records, merged.dataset.records, incoming.records, source.source);
          }
          await this.queue.enqueue("dataset.synced", { source: source.source, count: incoming.records.length });
          const syncedAt = new Date().toISOString();
          this.sourceStatuses.set(source.key, {
            source: source.source,
            tableId: source.tableId,
            lastSyncedAt: syncedAt,
            lastError: ""
          });
          this.notificationBaselines.add(source.key);
          results.push({ source: source.source, tableId: source.tableId, batch });
        } catch (error) {
          const message = error instanceof Error ? error.message : "飞书 Base 同步失败";
          const sourceError = `${source.source}：${message}`;
          errors.push(sourceError);
          this.sourceStatuses.set(source.key, {
            source: source.source,
            tableId: source.tableId,
            lastSyncedAt: this.sourceStatuses.get(source.key)?.lastSyncedAt || "",
            lastError: message
          });
          console.warn(`Lark Base source sync failed: ${sourceError}`);
        }
      }
      if (!results.length && errors.length) throw new Error(errors.join("；"));
      if (results.length) this.lastSyncedAt = new Date().toISOString();
      this.lastError = errors.join("；");
      return results;
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : "飞书 Base 同步失败";
      throw error;
    } finally {
      this.syncing = false;
    }
  }

  private async enqueueStatusChanges(
    beforeRecords: LedgerRecord[],
    afterRecords: LedgerRecord[],
    incomingRecords: LedgerRecord[],
    source: string
  ): Promise<void> {
    const beforeByKey = new Map(beforeRecords.map((record) => [importBusinessKey(record.fields || {}), record]));
    const afterByKey = new Map(afterRecords.map((record) => [importBusinessKey(record.fields || {}), record]));
    const changedKeys = new Set((incomingRecords || []).map((record) => importBusinessKey(record.fields || {})));

    for (const key of changedKeys) {
      const before = beforeByKey.get(key);
      const after = afterByKey.get(key);
      if (!before || !after) continue;
      const beforeStatus = stringifyCell(before.fields?.["获取状态"]).trim();
      const afterStatus = stringifyCell(after.fields?.["获取状态"]).trim();
      if (beforeStatus === afterStatus) continue;
      await this.queue.enqueue("record.updated", {
        recordId: after.record_id,
        fields: ["获取状态"],
        beforeStatus: beforeStatus || "未设置",
        afterStatus: afterStatus || "未设置",
        source
      });
    }
  }

  /**
   * Webhook fast path: read only the records the event named and merge them one at a time.
   * A full-table sync pages every record and rewrites the whole collection, which costs seconds
   * on the 245 table; this touches one document per event. Any failure falls back to the full
   * table sync for that source so an event is never silently dropped.
   */
  private async performRecordSync(source: LarkSyncSource, recordIds: string[], actor: string): Promise<LarkSyncResult | null> {
    this.syncing = true;
    try {
      const appToken = await this.baseAppToken();
      const summary = { total: recordIds.length, inserted: 0, updated: 0, unchanged: 0, conflicts: 0 };
      let missing = 0;
      // Feishu's single-record read costs ~2s, so a burst of edits is fetched concurrently.
      // Only the merge stays serial — it is a read-modify-write that must not interleave.
      const fetched = await this.fetchRecords(appToken, source.tableId, recordIds);
      for (const incoming of fetched) {
        if (!incoming) {
          missing += 1;
          continue;
        }
        const result = await this.store.upsertRecordByBusinessKey(
          incoming.fields || {},
          (before) => mergeFields(before, incoming.fields || {}, source.source),
          {
            status: "ok",
            syncedAt: new Date().toLocaleString("zh-CN", { hour12: false }),
            message: `${source.source}：实时同步 ${recordIds.length} 条记录`
          }
        );
        summary[result.action] += 1;
        // New records carry no prior status, matching the full-sync rule of only notifying on change.
        // Deliberately not gated on the notification baseline: an event means someone just edited
        // this one record, and one record cannot flood anybody — the baseline only exists to stop a
        // first full read from replaying a whole table's history.
        if (result.action === "updated") {
          await this.enqueueRecordStatusChange(result.beforeFields, result.record, source.source);
        }
      }
      const batch: ImportBatch = {
        id: randomUUID(),
        source: source.source,
        fileName: `${source.tableId}（实时 ${recordIds.length} 条）`,
        mode: "lark",
        ...summary,
        actor,
        createdAt: new Date().toISOString()
      };
      await this.store.appendImportBatch(batch);
      await this.queue.enqueue("dataset.synced", { source: source.source, count: recordIds.length - missing });
      const syncedAt = new Date().toISOString();
      this.sourceStatuses.set(source.key, {
        source: source.source,
        tableId: source.tableId,
        lastSyncedAt: syncedAt,
        lastError: ""
      });
      this.lastSyncedAt = syncedAt;
      return { source: source.source, tableId: source.tableId, batch };
    } catch (error) {
      const message = error instanceof Error ? error.message : "飞书 Base 单记录同步失败";
      console.warn(`Lark Base record sync failed, falling back to full table: ${source.source}：${message}`);
      this.syncing = false;
      const results = await this.performSync([source], actor);
      return results[0] || null;
    } finally {
      this.syncing = false;
    }
  }

  private async fetchRecords(appToken: string, tableId: string, recordIds: string[]): Promise<Array<LedgerRecord | null>> {
    const results: Array<LedgerRecord | null> = [];
    // Bounded so a large burst cannot trip Feishu's rate limit.
    const batchSize = 5;
    for (let index = 0; index < recordIds.length; index += batchSize) {
      const batch = recordIds.slice(index, index + batchSize);
      results.push(...await Promise.all(batch.map((recordId) => this.lark.getBaseRecord(appToken, tableId, recordId))));
    }
    return results;
  }

  private async enqueueRecordStatusChange(
    beforeFields: Record<string, FieldValue>,
    record: LedgerRecord,
    source: string
  ): Promise<void> {
    const beforeStatus = stringifyCell(beforeFields?.["获取状态"]).trim();
    const afterStatus = stringifyCell(record.fields?.["获取状态"]).trim();
    if (beforeStatus === afterStatus) return;
    await this.queue.enqueue("record.updated", {
      recordId: record.record_id,
      fields: ["获取状态"],
      beforeStatus: beforeStatus || "未设置",
      afterStatus: afterStatus || "未设置",
      source
    });
  }

  private async flushEventSources(): Promise<void> {
    const pending = new Map(this.pendingEventSources);
    this.pendingEventSources.clear();
    const sources = this.sourceConfigurations().filter((source) => pending.has(source.key));
    if (!sources.length) return;
    const fullTableSources = sources.filter((source) => pending.get(source.key)?.fullTable);
    // Each source is awaited on its own: one table failing must not discard the events that
    // arrived for the others in the same window.
    for (const source of sources.filter((item) => !pending.get(item.key)?.fullTable)) {
      const event = pending.get(source.key)!;
      try {
        await this.enqueueTask(() => this.performRecordSync(source, [...event.recordIds], event.actor));
      } catch (error) {
        // performSync already prefixes the source name.
        console.warn(`Lark Base record event sync failed: ${(error as Error).message}`);
      }
    }
    if (fullTableSources.length) {
      const actor = pending.get(fullTableSources.at(-1)!.key)?.actor || "飞书实时推送";
      try {
        await this.enqueueSync(fullTableSources, actor);
      } catch (error) {
        console.warn(`Lark Base event sync failed: ${(error as Error).message}`);
      }
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

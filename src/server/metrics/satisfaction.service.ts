import { Injectable, OnApplicationBootstrap, OnModuleDestroy } from "@nestjs/common";
import { cell, createLog, ensureFields, normalizeText, stringifyCell } from "../core/ledger-utils.js";
import type { FieldValue, LedgerRecord } from "../core/types.js";
import { LedgerStoreService } from "../infra/ledger-store.service.js";
import { QueueService } from "../infra/queue.service.js";

const satisfactionFields = ["满意度", "满意度评价", "满意度评价来源", "满意度评价时间", "满意度待评价时间"];
const completionDateFields = ["实际验收通过时间", "实际交付完成日期", "首次全量交付时间", "计划验收完成时间"];

export function isCompletedStatus(value: unknown): boolean {
  const status = normalizeText(value);
  return ["已完结", "已完成", "已有", "交付完成", "验收通过", "已验收"].some((item) => status.includes(item));
}

function parseDate(value: string): Date | null {
  const clean = String(value || "").trim();
  if (!clean) return null;
  const timestamp = Date.parse(clean.replace(/\//g, "-"));
  return Number.isFinite(timestamp) ? new Date(timestamp) : null;
}

@Injectable()
export class SatisfactionService implements OnApplicationBootstrap, OnModuleDestroy {
  private timer: NodeJS.Timeout | null = null;
  private readonly graceDays = Math.max(Number(process.env.SATISFACTION_AUTO_GOOD_DAYS || 7), 1);

  constructor(
    private readonly store: LedgerStoreService,
    private readonly queue: QueueService
  ) {}

  async onApplicationBootstrap() {
    await this.applyDefaults();
    this.timer = setInterval(() => void this.applyDefaults(), 60 * 60 * 1000);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  completionTrackingPatch(before: Record<string, FieldValue>, after: Record<string, FieldValue>): Record<string, FieldValue> {
    const nextStatus = after["获取状态"] ?? before["获取状态"];
    if (!isCompletedStatus(nextStatus) || isCompletedStatus(before["获取状态"])) return {};
    if (stringifyCell(after["满意度"] ?? before["满意度"])) return {};
    return { "满意度待评价时间": new Date().toISOString() };
  }

  async applyDefaults(now = new Date()): Promise<number> {
    const dataset = await this.store.readDataset();
    ensureFields(dataset, satisfactionFields);
    const defaulted: LedgerRecord[] = [];
    let changed = false;
    for (const record of dataset.records || []) {
      if (!isCompletedStatus(cell(record, "获取状态")) || cell(record, "满意度")) continue;
      let waitingSince = parseDate(cell(record, "满意度待评价时间"));
      if (!waitingSince) {
        waitingSince = completionDateFields.map((field) => parseDate(cell(record, field))).find(Boolean) || now;
        record.fields["满意度待评价时间"] = waitingSince.toISOString();
        changed = true;
      }
      const elapsedDays = (now.getTime() - waitingSince.getTime()) / 86_400_000;
      if (elapsedDays < this.graceDays) continue;
      record.fields = {
        ...record.fields,
        "满意度": 5,
        "满意度评价": "系统默认好评",
        "满意度评价来源": "系统自动",
        "满意度评价时间": now.toISOString()
      };
      defaulted.push(record);
      changed = true;
    }
    if (!changed) return 0;
    await this.store.saveDataset(dataset);
    for (const record of defaulted) {
      await this.store.appendLog(createLog({
        record_id: record.record_id,
        type: "满意度自动评价",
        field: "满意度",
        before: "",
        after: "5",
        actor: "系统",
        role: "system",
        note: `交付完成 ${this.graceDays} 天未评价，自动记为好评`
      }));
      await this.queue.enqueue("satisfaction.defaulted", { recordId: record.record_id });
    }
    return defaulted.length;
  }

  getGraceDays(): number {
    return this.graceDays;
  }
}

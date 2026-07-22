import { Injectable } from "@nestjs/common";
import { cell, normalizeText } from "../core/ledger-utils.js";
import type { LedgerRecord, NotificationLog, QueueEvent } from "../core/types.js";
import { LarkOAuthService } from "../auth/lark-oauth.service.js";
import { LedgerStoreService } from "../infra/ledger-store.service.js";

const recipientFields = ["需求负责人", "需求人", "关注人", "PM", "项目对接人", "解决方案负责人"];

function splitNames(value: string): string[] {
  return value.split(/[、,，;；/\n]+/).map((item) => item.trim()).filter(Boolean);
}

function eventLabel(eventName: string): string {
  const labels: Record<string, string> = {
    "request.submitted": "新需求已提交",
    "followers.updated": "需求关注人已更新",
    "record.created": "台账新增需求",
    "record.updated": "需求状态或信息已更新",
    "dataset.imported": "台账数据已导入",
    "dataset.synced": "飞书台账已同步",
    "satisfaction.defaulted": "满意度已自动评价"
  };
  return labels[eventName] || "交付管线有新动态";
}

@Injectable()
export class LarkNotificationService {
  constructor(
    private readonly store: LedgerStoreService,
    private readonly lark: LarkOAuthService
  ) {}

  async process(event: QueueEvent): Promise<void> {
    const dataset = await this.store.readDataset();
    const recordId = String(event.payload.recordId || "");
    const record = dataset.records.find((item) => item.record_id === recordId);
    const recipients = record ? await this.recipientOpenIds(record, event.payload) : this.payloadRecipients(event.payload);
    const text = this.messageText(event, record ? {
      name: cell(record, "项目名称") || record.record_id,
      status: cell(record, "获取状态") || "未设置",
      sprint: cell(record, "Sprint")
    } : null);
    const errors: string[] = [];
    let sent = 0;

    for (const openId of recipients) {
      if (!this.lark.isBotConfigured()) break;
      try {
        await this.lark.sendTextMessage(openId, text);
        sent += 1;
      } catch (error) {
        errors.push(error instanceof Error ? error.message : String(error));
      }
    }

    try {
      if (await this.lark.sendWebhookMessage(text)) sent += 1;
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }

    const configured = this.lark.isBotConfigured() || Boolean(process.env.LARK_WEBHOOK_URL);
    const status: NotificationLog["status"] = !configured
      ? "skipped"
      : errors.length && sent === 0
        ? "failed"
        : errors.length
          ? "partial"
          : "sent";
    await this.store.appendNotificationLog({
      id: `${event.id}:${event.attempts}`,
      eventName: event.eventName,
      recordId,
      status,
      recipients,
      attempts: event.attempts,
      error: errors.join("；"),
      createdAt: new Date().toISOString()
    });
    if (status === "failed") throw new Error(errors.join("；") || "飞书通知发送失败");
  }

  private async recipientOpenIds(record: LedgerRecord, payload: Record<string, unknown>): Promise<string[]> {
    const names = [...new Set(recipientFields.flatMap((field) => splitNames(cell(record, field))))];
    const known = await this.store.findUsersByNames(names);
    const byName = new Map(known.map((user) => [normalizeText(user.name), user.openId]));
    const missing = names.filter((name) => !byName.has(normalizeText(name)));
    for (const name of missing.slice(0, 20)) {
      try {
        const users = await this.lark.searchUsers(name, 5);
        const exact = users.find((user) => normalizeText(user.name) === normalizeText(name));
        if (exact) byName.set(normalizeText(name), exact.openId);
      } catch {
        // A missing directory permission should not prevent other recipients from receiving the event.
      }
    }
    return [...new Set([
      ...this.payloadRecipients(payload),
      ...names.map((name) => byName.get(normalizeText(name)) || "").filter(Boolean)
    ])].slice(0, 50);
  }

  private payloadRecipients(payload: Record<string, unknown>): string[] {
    const values = [payload.actorOpenId, payload.requesterOpenId, payload.ownerOpenId];
    const extra = Array.isArray(payload.recipientOpenIds) ? payload.recipientOpenIds : [];
    return [...new Set([...values, ...extra].map((value) => String(value || "").trim()).filter(Boolean))];
  }

  private messageText(event: QueueEvent, record: { name: string; status: string; sprint: string } | null): string {
    const lines = [`【交付管线】${eventLabel(event.eventName)}`];
    if (record) {
      lines.push(`需求：${record.name}`, `状态：${record.status}`);
      if (record.sprint) lines.push(`Sprint：${record.sprint}`);
    }
    const fields = Array.isArray(event.payload.fields) ? event.payload.fields.map(String).filter(Boolean) : [];
    if (fields.length) lines.push(`变更字段：${fields.join("、")}`);
    if (event.payload.source) lines.push(`数据来源：${String(event.payload.source)}`);
    if (process.env.PUBLIC_APP_URL && record) lines.push(`查看：${String(process.env.PUBLIC_APP_URL).replace(/\/+$/, "")}/`);
    return lines.join("\n");
  }
}

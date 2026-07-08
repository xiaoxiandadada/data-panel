import { randomUUID } from "node:crypto";
import type { Dataset, DatasetField, FieldValue, LedgerLog, LedgerRecord } from "./types.js";

export const publicFields = [
  "项目名称",
  "获取状态",
  "隶属部门",
  "需求负责人",
  "需求人",
  "关注人",
  "项目对接人",
  "解决方案负责人",
  "需求提出时间",
  "期望交付日期",
  "Sprint",
  "需求文档",
  "任务耗时"
];

export const searchFields = [
  "项目名称",
  "任务代码",
  "获取状态",
  "隶属部门",
  "部门负责人",
  "项目对接人",
  "解决方案负责人",
  "获取渠道",
  "Sprint",
  "承接方",
  "承接方责任人",
  "需求文档",
  "阻塞项",
  "项目备注",
  "数据平台ID",
  "数据平台地址",
  "2026需求编码"
];

export function stringifyCell(value: FieldValue): string {
  if (value == null) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(stringifyCell).filter(Boolean).join("、");
  if (typeof value === "object") {
    const objectValue = value as Record<string, unknown>;
    const candidates = ["text", "name", "en_name", "email", "title", "value", "url", "id"];
    for (const key of candidates) {
      if (objectValue[key] != null) return String(objectValue[key]);
    }
    return JSON.stringify(value);
  }
  return String(value);
}

export function cell(record: LedgerRecord, fieldName: string): string {
  return stringifyCell(record.fields?.[fieldName]);
}

export function normalizeText(value: unknown): string {
  return String(value || "").replace(/\u200B/g, "").trim().toLowerCase();
}

export function todayText(): string {
  return new Date().toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
}

export function uniqueRequesterNames(dataset: Dataset): string[] {
  return [...new Set((dataset.records || [])
    .flatMap((record) => [
      cell(record, "需求负责人"),
      cell(record, "需求人"),
      cell(record, "关注人"),
      cell(record, "项目对接人"),
      cell(record, "部门负责人")
    ])
    .filter(Boolean)
    .flatMap((value) => value.split(/[、,，]/).map((name) => name.trim()).filter(Boolean)))]
    .sort((a, b) => a.localeCompare(b, "zh-CN"));
}

export function requesterRecords(dataset: Dataset, requesterName: string): LedgerRecord[] {
  const normalized = normalizeText(requesterName);
  if (!normalized) return [];
  return (dataset.records || []).filter((record) => {
    const visibleFields = ["需求负责人", "需求人", "关注人", "项目对接人", "部门负责人"];
    return visibleFields.some((field) => normalizeText(cell(record, field)).includes(normalized));
  });
}

export function publicDataset(dataset: Dataset, records: LedgerRecord[] = []): Dataset {
  return {
    meta: {
      ...(dataset.meta || {}),
      totalRecords: (dataset.records || []).length,
      message: records.length ? `公开查询返回 ${records.length} 条记录` : "访客模式仅返回查询结果"
    },
    fields: publicFields.map((name) => ({ id: name, name, type: "text" })),
    records: records.map((record) => ({
      record_id: record.record_id,
      fields: Object.fromEntries(publicFields.map((field) => [field, cell(record, field)]))
    }))
  };
}

export function searchPublicRecords(dataset: Dataset, query: string, limit = 100): LedgerRecord[] {
  const normalized = normalizeText(query);
  if (!normalized) return [];
  return (dataset.records || [])
    .filter((record) => searchFields.some((field) => normalizeText(cell(record, field)).includes(normalized)))
    .slice(0, limit);
}

export function ensureFields(dataset: Dataset, names: string[]): void {
  const current = new Set((dataset.fields || []).map((field) => field.name || field.id));
  names.forEach((name) => {
    if (!current.has(name)) {
      dataset.fields = [...(dataset.fields || []), { id: name, name, type: "text" }];
      current.add(name);
    }
  });
}

export function normalizeRecordFields(fields: Record<string, FieldValue>, knownFields: DatasetField[]): Record<string, FieldValue> {
  const knownNames = knownFields.map((field) => field.name || field.id);
  return Object.fromEntries(knownNames.map((name) => [name, fields?.[name] ?? ""]));
}

export function nextRecordId(records: LedgerRecord[]): string {
  const maxImportId = records.reduce((max, record) => {
    const match = String(record.record_id || "").match(/^import-(\d+)$/);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
  return `import-${maxImportId + 1}`;
}

export function rowsToDataset(rows: Array<Record<string, FieldValue>>, syncedAt: string, title = "导入数据"): Dataset {
  const headers = [...new Set(rows.flatMap((row) => Object.keys(row || {})))];
  return {
    meta: {
      status: "ok",
      title,
      sourceUrl: "",
      syncedAt,
      message: `本地导入 ${rows.length} 条记录`
    },
    fields: headers.map((name) => ({ id: name, name, type: "text" })),
    records: rows.map((row, index) => ({
      record_id: `import-${index + 1}`,
      fields: Object.fromEntries(headers.map((header) => [header, row?.[header] ?? ""]))
    }))
  };
}

export function datasetStats(dataset: Dataset) {
  const records = dataset.records || [];
  const statuses = records.reduce<Record<string, number>>((acc, record) => {
    const status = cell(record, "获取状态") || "未设置";
    acc[status] = (acc[status] || 0) + 1;
    return acc;
  }, {});
  return {
    ok: true,
    service: "delivery-pipeline",
    totalRecords: records.length,
    requesterCount: uniqueRequesterNames(dataset).length,
    statusCount: statuses,
    syncedAt: dataset.meta?.syncedAt || "",
    uptimeSeconds: Math.round(process.uptime())
  };
}

export function metricsText(dataset: Dataset): string {
  const stats = datasetStats(dataset);
  const lines = [
    "# HELP delivery_pipeline_records_total Total records in local delivery pipeline dataset.",
    "# TYPE delivery_pipeline_records_total gauge",
    `delivery_pipeline_records_total ${stats.totalRecords}`,
    "# HELP delivery_pipeline_requesters_total Total unique requester-related users.",
    "# TYPE delivery_pipeline_requesters_total gauge",
    `delivery_pipeline_requesters_total ${stats.requesterCount}`,
    "# HELP delivery_pipeline_uptime_seconds Process uptime in seconds.",
    "# TYPE delivery_pipeline_uptime_seconds counter",
    `delivery_pipeline_uptime_seconds ${stats.uptimeSeconds}`
  ];
  Object.entries(stats.statusCount).forEach(([status, count]) => {
    lines.push(`delivery_pipeline_status_records{status="${String(status).replace(/"/g, '\\"')}"} ${count}`);
  });
  return `${lines.join("\n")}\n`;
}

export function createLog(entry: Partial<LedgerLog> & Pick<LedgerLog, "record_id">): LedgerLog {
  return {
    id: randomUUID(),
    record_id: entry.record_id,
    type: entry.type || "更新",
    field: entry.field || "",
    before: entry.before ?? "",
    after: entry.after ?? "",
    actor: entry.actor || "系统",
    role: entry.role || "system",
    note: entry.note || "",
    createdAt: new Date().toLocaleString("zh-CN", { hour12: false })
  };
}

export function actorFromPayload(payload: Record<string, unknown>, fallback = "管理员"): string {
  return String(payload.actor || payload.requesterName || fallback).trim() || fallback;
}

export function demandToLedgerFields(payload: Record<string, unknown>, knownFields: DatasetField[]): Record<string, FieldValue> {
  const fields = (payload.fields || {}) as Record<string, FieldValue>;
  const requesterName = String(payload.requesterName || fields["需求方"] || "").trim();
  const demandOwner = String(fields["需求负责人"] || requesterName).trim();
  const demandPeople = String(fields["需求人"] || requesterName).trim();
  const followers = String(fields["关注人"] || "").trim();
  const description = String(fields["需求描述"] || "").trim();
  const projectName = String(fields["245项目名称"] || fields["项目名称"] || description.slice(0, 28) || "未命名需求").trim();
  const remarkParts = [
    fields["备注"] ? `备注：${fields["备注"]}` : "",
    fields["需求类型"] ? `需求类型：${fields["需求类型"]}` : "",
    fields["数量"] ? `数量：${fields["数量"]}${fields["数据量单位"] || ""}` : "",
    fields["存储容量（GB）"] ? `存储容量：${fields["存储容量（GB）"]}GB` : "",
    fields["交付路径"] ? `交付路径：${fields["交付路径"]}` : ""
  ].filter(Boolean);
  const mapped: Record<string, FieldValue> = {
    "项目名称": projectName,
    "获取状态": "需求澄清中",
    "隶属部门": fields["所属部门"] || "",
    "部门负责人": fields["部门负责人"] || "",
    "需求负责人": demandOwner,
    "需求人": demandPeople,
    "关注人": followers,
    "项目对接人": requesterName,
    "领域或学科": fields["学科"] || "",
    "需求提出时间": fields["提出时间"] || todayText(),
    "期望交付日期": fields["期望交付时间"] || fields["完成日期"] || "",
    "预算金额": fields["预算（任务确认对接填写）"] || "",
    "项目备注": [description, ...remarkParts].filter(Boolean).join("\n"),
    "获取渠道": fields["获取渠道"] || "",
    "需求文档": fields["需求文档"] || "",
    "作业技能标签": fields["需求类型"] || "",
    "预计任务量": fields["数量"] || fields["存储容量（GB）"] || "",
    "Sprint": fields["Sprint"] || "",
    "2026需求编码": fields["2026需求编码"] || ""
  };
  const knownNames = knownFields.map((field) => field.name || field.id);
  return Object.fromEntries(knownNames.map((name) => [name, mapped[name] ?? ""]));
}

import { randomUUID } from "node:crypto";
import type { Dataset, DatasetField, FieldValue, LedgerLog, LedgerRecord } from "./types.js";

export const publicFields = [
  "项目名称",
  "获取状态",
  "隶属部门",
  "需求负责人",
  "需求人",
  "关注人",
  "PM",
  "项目对接人",
  "解决方案负责人",
  "需求提出时间",
  "期望交付日期",
  "Sprint",
  "需求文档",
  "任务耗时",
  "满意度",
  "满意度评价",
  "满意度评价来源",
  "数据来源"
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

/**
 * Every person column in this ledger is a list. \u9700\u6C42\u4EBA, \u5173\u6CE8\u4EBA and now PM routinely hold several
 * names, and the separator depends on who typed them: \u987F\u53F7 from the Feishu picker, commas from Excel
 * paste, semicolons and slashes from people typing by hand, newlines from multi-line cells.
 *
 * One splitter for all of them, because the two call sites had drifted apart: the visibility check
 * split on \u3001,\uFF0C;\uFF1B/ and newline while the requester roster split on \u3001,\uFF0C only, so a PM entered as
 * "\u5F20\u4E09;\u674E\u56DB" could open a requirement they were not offered in the requester list.
 *
 * Both the halfwidth and fullwidth solidus are separators: a Chinese IME produces \uFF0F by default, and
 * "\u674E\u56DB\uFF0F\u738B\u4E94" left unsplit is one person named \u674E\u56DB\uFF0F\u738B\u4E94 who matches nobody.
 */
export const nameListSeparator = /[\u3001,\uFF0C;\uFF1B/\uFF0F\n]+/;

export function splitNameList(value: unknown): string[] {
  return stringifyCell(value as FieldValue)
    .split(nameListSeparator)
    .map((name) => name.trim())
    .filter(Boolean);
}

/** Re-joins a person list into the one spelling the ledger stores, so later splits are stable. */
export function normalizeNameList(value: unknown): string {
  return [...new Set(splitNameList(value))].join("\u3001");
}

const dayMillis = 86_400_000;
const dateFieldPattern = /\u65F6\u95F4|\u65E5\u671F|\u65F6\u671F/;
// A window wide enough for anything this ledger records, narrow enough that quantities and
// durations never look like instants.
const epochFloor = Date.UTC(2000, 0, 1);
const epochCeiling = Date.UTC(2100, 0, 1);

/**
 * Renders one Feishu Base timestamp the way the ledger already stores dates (`2026/07/01`).
 *
 * Base anchors date-only fields at UTC midnight and stores datetime fields as real instants, so
 * the two need different zones to land on the calendar day a person sees in the Base: formatting a
 * UTC-midnight value in Asia/Shanghai is still the same day, but formatting a Shanghai-evening
 * instant in UTC would report the day before.
 */
function epochToLedgerDate(millis: number): string {
  const timeZone = millis % dayMillis === 0 ? "UTC" : "Asia/Shanghai";
  const parts = new Intl.DateTimeFormat("zh-CN", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date(millis));
  const part = (type: string) => parts.find((item) => item.type === type)?.value || "";
  return `${part("year")}/${part("month")}/${part("day")}`;
}

/**
 * Converts the epoch milliseconds Feishu Base returns for date fields into the ledger's own date
 * text. Without this the first successful full sync overwrites every date the Excel import seeded
 * as `2026/07/01` with a raw `1785919697711`, which both the requester view and the delivery
 * metrics then fail to read.
 *
 * Two guards, because neither is sufficient alone. The field name must look like a date, or numeric
 * fields such as `\u7ED3\u7B97\u91D1\u989D` would be mangled into dates. The value must also be a plausible instant,
 * because `\u671F\u671B\u4EA4\u4ED8\u65E5\u671F` is a text field in the \u603B\u8868 holding values like `\u6700\u5927\u503C\uFF08\u5F85\u586B\uFF09`, and short
 * numbers such as durations must survive untouched.
 *
 * Every other column gets its invisible characters stripped on the way in — see
 * `stripInvisibleCharacters` for why that matters more than it sounds.
 */
export function normalizeBaseFieldValues(fields: Record<string, FieldValue>): Record<string, FieldValue> {
  const normalized: Record<string, FieldValue> = {};
  for (const [field, value] of Object.entries(fields || {})) {
    normalized[field] = dateFieldPattern.test(field)
      ? normalizeBaseDateValue(value)
      : stripInvisibleCharacters(value);
  }
  return normalized;
}

// Zero-width space / non-joiner / joiner / BOM — they copy-paste into Feishu cells and are invisible
// to whoever typed them. Written as escapes so they stay visible in this source file.
const invisiblePattern = /[\u200B-\u200D\uFEFF]/g;

/**
 * Removes zero-width characters from incoming text. They carry no meaning but they do split a status
 * in two: 采购调研中 and 采购调研中<U+200B> counted as separate buckets in the stage view, and the
 * contaminated spelling matched none of the client's status colours or progress weights. `normalizeText`
 * already strips them for key comparison, so cleaning on ingest is what makes the stored value agree
 * with the value the rest of the code compares against.
 */
function stripInvisibleCharacters(value: FieldValue): FieldValue {
  if (typeof value === "string") {
    const cleaned = value.replace(invisiblePattern, "").trim();
    return cleaned === value ? value : cleaned;
  }
  if (Array.isArray(value)) return value.map((item) => stripInvisibleCharacters(item as FieldValue)) as FieldValue;
  return value;
}

function normalizeBaseDateValue(value: FieldValue): FieldValue {
  if (Array.isArray(value)) return value.map((item) => normalizeBaseDateValue(item as FieldValue)) as FieldValue;
  const raw = typeof value === "number" ? value : /^\d{10,13}$/.test(String(value ?? "").trim())
    ? Number(String(value).trim())
    : Number.NaN;
  if (!Number.isFinite(raw)) return value;
  // Tolerate second precision: a ten-digit value is seconds, anything longer is already millis.
  const millis = raw < 1e11 ? raw * 1000 : raw;
  if (millis < epochFloor || millis > epochCeiling) return value;
  return epochToLedgerDate(millis);
}

export const businessKeyFields = ["\u4EFB\u52A1\u4EE3\u7801", "2026\u9700\u6C42\u7F16\u7801", "\u9700\u6C42\u7F16\u7801", "\u9879\u76EE\u540D\u79F0"];

// Identifies the same requirement across the three Feishu tables and Excel imports.
// Lives in core because both the ledger merge logic and the store index depend on it.
export function importBusinessKey(fields: Record<string, FieldValue>): string {
  for (const field of businessKeyFields) {
    const value = normalizeText(stringifyCell(fields?.[field]));
    if (value) return `${field}:${value}`;
  }
  const proposedAt = normalizeText(stringifyCell(fields?.["\u9700\u6C42\u63D0\u51FA\u65F6\u95F4"]));
  const department = normalizeText(stringifyCell(fields?.["\u96B6\u5C5E\u90E8\u95E8"]));
  return `fallback:${proposedAt}:${department}:${normalizeText(JSON.stringify(fields || {}))}`;
}

export function todayText(): string {
  return new Date().toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
}

/** Person columns that decide whether a requirement shows up in someone's requester view. */
export const requesterVisibilityFields = ["需求负责人", "需求人", "关注人", "PM", "项目对接人", "部门负责人"];

export function uniqueRequesterNames(dataset: Dataset): string[] {
  return [...new Set((dataset.records || [])
    .flatMap((record) => requesterVisibilityFields.flatMap((field) => splitNameList(record.fields?.[field]))))]
    .sort((a, b) => a.localeCompare(b, "zh-CN"));
}

export function requesterRecords(dataset: Dataset, requesterName: string): LedgerRecord[] {
  const normalized = normalizeText(requesterName);
  if (!normalized) return [];
  return (dataset.records || []).filter((record) => requesterVisibilityFields.some((field) =>
    splitNameList(record.fields?.[field]).some((name) => normalizeText(name) === normalized)));
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
  const satisfactionScores = records.map((record) => Number(cell(record, "满意度"))).filter((score) => score >= 1 && score <= 5);
  const autoGoodCount = records.filter((record) => cell(record, "满意度评价来源") === "系统自动").length;
  return {
    ok: true,
    service: "delivery-pipeline",
    totalRecords: records.length,
    requesterCount: uniqueRequesterNames(dataset).length,
    statusCount: statuses,
    satisfactionCount: satisfactionScores.length,
    satisfactionAverage: satisfactionScores.length ? Number((satisfactionScores.reduce((sum, score) => sum + score, 0) / satisfactionScores.length).toFixed(2)) : 0,
    satisfactionAutoGoodCount: autoGoodCount,
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
    `delivery_pipeline_uptime_seconds ${stats.uptimeSeconds}`,
    "# HELP delivery_pipeline_satisfaction_average Average satisfaction score from 1 to 5.",
    "# TYPE delivery_pipeline_satisfaction_average gauge",
    `delivery_pipeline_satisfaction_average ${stats.satisfactionAverage}`,
    "# HELP delivery_pipeline_satisfaction_auto_good_total Satisfaction ratings automatically defaulted to good.",
    "# TYPE delivery_pipeline_satisfaction_auto_good_total gauge",
    `delivery_pipeline_satisfaction_auto_good_total ${stats.satisfactionAutoGoodCount}`
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
  const demandPeople = normalizeNameList(fields["需求人"] || requesterName);
  const followers = normalizeNameList(fields["关注人"]);
  const needsPm = String(fields["是否设置PM"] || "").trim() === "是";
  // A requirement may name several PMs, and each of them has to be able to open it: every name here
  // is matched independently by `requesterRecords`, so the list is stored in the one separator that
  // `splitNameList` round-trips rather than whatever the submitter happened to type.
  const pm = needsPm ? normalizeNameList(fields["PM"]) : "";
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
    "PM": pm,
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

import readXlsxFile from "read-excel-file/node";
import type { Dataset, FieldValue, LedgerRecord } from "../core/types.js";
import { importBusinessKey, nextRecordId, rowsToDataset, stringifyCell } from "../core/ledger-utils.js";

export { importBusinessKey };

export interface ImportMergeSummary {
  total: number;
  inserted: number;
  updated: number;
  unchanged: number;
  conflicts: number;
}

export interface ImportMergeResult {
  dataset: Dataset;
  summary: ImportMergeSummary;
  /**
   * Only the records this merge actually inserted or changed.
   *
   * Exists so a caller can persist the delta instead of rewriting the whole collection. The full-table
   * rewrite (`saveDataset`, which is `deleteMany` + `insertMany`) is a lost-update hazard: a
   * requirement submitted between the merge's read and its write is silently deleted, because the
   * snapshot being written back never contained it. Measured: a 5-source sync round has five such
   * windows, every five minutes.
   */
  changed: LedgerRecord[];
  /** Column names the merge introduced, so the field list can be extended without a full rewrite. */
  fields: Dataset["fields"];
}

function excelCell(value: unknown): FieldValue {
  if (value instanceof Date) {
    const date = new Date(value.getTime() - value.getTimezoneOffset() * 60_000);
    return date.toISOString().slice(0, 19).replace("T", " ");
  }
  if (value == null) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  return String(value);
}

export async function parseExcel(buffer: Buffer): Promise<Array<Record<string, FieldValue>>> {
  const rows = await readXlsxFile(buffer);
  const headerRow = rows.shift() || [];
  const headers = headerRow.map((value, index) => String(value || "").replace(/^\uFEFF/, "").trim() || `字段${index + 1}`);
  if (!headers.length) throw new Error("Excel 文件没有表头");
  return rows
    .filter((row) => row.some((value) => value != null && String(value).trim() !== ""))
    .map((row) => Object.fromEntries(headers.map((header, index) => [header, excelCell(row[index])])));
}

function mergeSources(before: FieldValue, source: string): string {
  return [...new Set(`${stringifyCell(before)}、${source}`.split(/[、,，]/).map((item) => item.trim()).filter(Boolean))].join("、");
}

export function mergeFields(before: Record<string, FieldValue>, incoming: Record<string, FieldValue>, source: string): Record<string, FieldValue> {
  const merged = { ...before };
  for (const [field, value] of Object.entries(incoming || {})) {
    if (stringifyCell(value).trim() !== "") merged[field] = value;
  }
  merged["数据来源"] = mergeSources(before["数据来源"], source);
  return merged;
}

export function mergeImportedDataset(existing: Dataset, incoming: Dataset, source: string): ImportMergeResult {
  const cleanSource = String(source || "未标记来源").trim() || "未标记来源";
  const records = (existing.records || []).map((record) => ({ ...record, fields: { ...(record.fields || {}) } }));
  const index = new Map(records.map((record) => [importBusinessKey(record.fields), record]));
  const incomingKeys = new Set<string>();
  const summary: ImportMergeSummary = { total: incoming.records?.length || 0, inserted: 0, updated: 0, unchanged: 0, conflicts: 0 };

  // Records this round inserted or changed. Collected so the caller can write just these instead of
  // rewriting the whole collection — see ImportMergeResult.changed for why that matters.
  const changed: LedgerRecord[] = [];

  for (const item of incoming.records || []) {
    const key = importBusinessKey(item.fields || {});
    if (incomingKeys.has(key)) summary.conflicts += 1;
    incomingKeys.add(key);
    const current = index.get(key);
    if (!current) {
      const record = {
        record_id: nextRecordId(records),
        fields: mergeFields({}, item.fields || {}, cleanSource)
      };
      records.push(record);
      index.set(key, record);
      changed.push(record);
      summary.inserted += 1;
      continue;
    }
    const merged = mergeFields(current.fields || {}, item.fields || {}, cleanSource);
    if (JSON.stringify(merged) === JSON.stringify(current.fields || {})) {
      summary.unchanged += 1;
    } else {
      current.fields = merged;
      changed.push(current);
      summary.updated += 1;
    }
  }

  const fieldNames = [...new Set([
    ...(existing.fields || []).map((field) => field.name || field.id),
    ...(incoming.fields || []).map((field) => field.name || field.id),
    "数据来源"
  ])];
  const fields = fieldNames.map((name) => ({ id: name, name, type: existing.fields.find((field) => (field.name || field.id) === name)?.type || "text" }));
  return {
    dataset: {
      meta: {
        ...(existing.meta || {}),
        status: "ok",
        syncedAt: new Date().toLocaleString("zh-CN", { hour12: false }),
        message: `${cleanSource}：新增 ${summary.inserted}，更新 ${summary.updated}，未变化 ${summary.unchanged}`
      },
      fields,
      records
    },
    summary,
    changed,
    fields
  };
}

export function parseCsv(text: string): Array<Record<string, FieldValue>> {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (quoted) {
      if (char === '"' && next === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
      continue;
    }

    if (char === '"') quoted = true;
    else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (char !== "\r") {
      cell += char;
    }
  }

  row.push(cell);
  if (row.some((value) => value.trim() !== "")) rows.push(row);
  const headers = rows.shift()?.map((header, index) => header.replace(/^\uFEFF/, "").trim() || `字段${index + 1}`) || [];
  return rows.map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""])));
}

export function normalizeImport(payload: unknown): Dataset {
  const now = new Date().toLocaleString("zh-CN", { hour12: false });
  if (Array.isArray(payload)) return rowsToDataset(payload as Array<Record<string, FieldValue>>, now);
  const objectPayload = payload as Record<string, unknown>;
  if (Array.isArray(objectPayload?.records) && Array.isArray(objectPayload?.fields)) {
    return {
      meta: {
        title: (objectPayload.meta as Record<string, string> | undefined)?.title || "导入数据",
        status: "ok",
        sourceUrl: (objectPayload.meta as Record<string, string> | undefined)?.sourceUrl || "",
        syncedAt: now,
        message: `本地导入 ${objectPayload.records.length} 条记录`
      },
      fields: objectPayload.fields as Dataset["fields"],
      records: objectPayload.records as Dataset["records"]
    };
  }
  if (Array.isArray(objectPayload?.rows)) {
    return rowsToDataset(objectPayload.rows as Array<Record<string, FieldValue>>, now, String(objectPayload.title || "导入数据"));
  }
  throw new Error("不支持的数据格式");
}

import type { Dataset, FieldValue } from "../core/types.js";
import { rowsToDataset } from "../core/ledger-utils.js";

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

import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const outputPath = resolve(root, "data/project-data.json");

const config = {
  sourceUrl: "https://aicarrier.feishu.cn/wiki/ZqC3whTTXiU2rUkLdRycTtmhnYE?table=tbl7FrAYMpseNuPA&view=vewkBG8gpp",
  wikiToken: "ZqC3whTTXiU2rUkLdRycTtmhnYE",
  tableId: "tbl7FrAYMpseNuPA",
  viewId: "vewkBG8gpp"
};

function runLark(args) {
  try {
    const output = execFileSync("lark-cli", args, {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"]
    });
    return JSON.parse(output);
  } catch (error) {
    const payloadText = error.stdout?.toString() || error.stderr?.toString() || "";
    try {
      const payload = JSON.parse(payloadText);
      const message = payload.error?.message || "lark-cli request failed";
      const wrapped = new Error(message);
      wrapped.payload = payload;
      throw wrapped;
    } catch (parseError) {
      if (parseError.payload) throw parseError;
      throw new Error(payloadText.trim() || error.message);
    }
  }
}

function readWithFallback(args) {
  try {
    return runLark([...args, "--as", "user"]);
  } catch (error) {
    if (error.payload?.error?.code === 91403) throw error;
    return runLark([...args, "--as", "bot"]);
  }
}

function unwrap(payload) {
  if (payload?.ok === false) {
    throw new Error(payload.error?.message || "lark-cli request failed");
  }
  return payload?.data || payload;
}

function extractItems(payload) {
  const data = unwrap(payload);
  return data.items || data.records || data.fields || data.data?.items || data.data || [];
}

function hasMore(payload, itemCount, limit) {
  const data = unwrap(payload);
  if (typeof data.has_more === "boolean") return data.has_more;
  if (typeof data.hasMore === "boolean") return data.hasMore;
  if (typeof data.total === "number" && typeof data.offset === "number") return data.offset + itemCount < data.total;
  return itemCount >= limit;
}

function listAllFields(baseToken) {
  const fields = [];
  const limit = 200;
  let offset = 0;

  while (true) {
    const page = readWithFallback([
      "base",
      "+field-list",
      "--base-token",
      baseToken,
      "--table-id",
      config.tableId,
      "--offset",
      String(offset),
      "--limit",
      String(limit),
      "--jq",
      "."
    ]);
    const items = extractItems(page).map(normalizeField);
    fields.push(...items);
    if (!hasMore(page, items.length, limit) || items.length === 0) break;
    offset += items.length;
  }

  return fields;
}

function listAllRecords(baseToken, fields) {
  const records = [];
  const limit = 200;
  let offset = 0;

  while (true) {
    const page = readWithFallback([
      "base",
      "+record-list",
      "--base-token",
      baseToken,
      "--table-id",
      config.tableId,
      "--view-id",
      config.viewId,
      "--offset",
      String(offset),
      "--limit",
      String(limit),
      "--format",
      "json"
    ]);
    const items = normalizeRecordList(page, fields);
    records.push(...items);
    if (!hasMore(page, items.length, limit) || items.length === 0) break;
    offset += items.length;
  }

  return records;
}

function normalizeField(field) {
  return {
    id: field.field_id || field.id || field.name,
    name: field.field_name || field.name || field.id,
    type: field.type || field.field_type || ""
  };
}

function normalizeRecordList(recordPayload, fields) {
  const data = unwrap(recordPayload);
  const items = data.items || data.records || data.record_list;
  if (Array.isArray(items)) {
    return items.map((item) => ({
      record_id: item.record_id || item.id,
      fields: normalizeFieldMap(item.fields || item.record || item, fields)
    }));
  }

  const rows = data.data || data.rows;
  const recordIds = data.record_id_list || [];
  const fieldIds = data.field_id_list || data.fields?.map((field) => field.field_id || field.id || field.name) || fields.map((field) => field.id);
  if (Array.isArray(rows)) {
    return rows.map((row, rowIndex) => {
      const mapped = {};
      fieldIds.forEach((fieldId, index) => {
        const field = fields.find((candidate) => candidate.id === fieldId || candidate.name === fieldId);
        mapped[field?.name || fieldId] = row[index];
      });
      return {
        record_id: recordIds[rowIndex] || `row-${rowIndex + 1}`,
        fields: mapped
      };
    });
  }

  return [];
}

function normalizeFieldMap(values, fields) {
  const mapped = {};
  for (const [key, value] of Object.entries(values || {})) {
    const field = fields.find((candidate) => candidate.id === key || candidate.name === key);
    mapped[field?.name || key] = value;
  }
  return mapped;
}

function writeDataset(dataset) {
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(dataset, null, 2)}\n`, "utf8");
}

function writeError(error) {
  const payload = error.payload;
  const detail = payload?.error?.code
    ? `[${payload.error.code}] ${payload.error.message}`
    : error.message;
  writeDataset({
    meta: {
      status: "error",
      title: "飞书项目进展数据",
      ...config,
      syncedAt: new Date().toLocaleString("zh-CN", { hour12: false }),
      message: detail
    },
    fields: [],
    records: []
  });
}

try {
  const nodePayload = readWithFallback([
    "wiki",
    "spaces",
    "get_node",
    "--params",
    JSON.stringify({ token: config.wikiToken, obj_type: "wiki" }),
    "--format",
    "json"
  ]);
  const node = unwrap(nodePayload).node || unwrap(nodePayload);
  if (node.obj_type !== "bitable") {
    throw new Error(`Wiki 节点不是多维表格，当前类型：${node.obj_type || "unknown"}`);
  }

  const baseToken = node.obj_token;
  const fields = listAllFields(baseToken);
  const records = listAllRecords(baseToken, fields);

  writeDataset({
    meta: {
      status: "ok",
      title: node.title || "飞书项目进展数据",
      ...config,
      baseToken,
      syncedAt: new Date().toLocaleString("zh-CN", { hour12: false }),
      message: ""
    },
    fields,
    records
  });
  console.log(`Synced ${records.length} records to ${outputPath}`);
} catch (error) {
  writeError(error);
  console.error(error.payload?.error?.message || error.message);
  process.exitCode = 1;
}

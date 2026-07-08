import { createReadStream, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));
const dataPath = resolve(root, "data/project-data.json");
const ledgerLogPath = resolve(root, "data/ledger-logs.json");
const clientRoot = resolve(root, "dist/client");
const port = Number(process.env.PORT || 5173);
const host = process.env.HOST || "0.0.0.0";
const adminPassword = process.env.ADMIN_PASSWORD || "admin123";
const adminTokens = new Set();
const publicFields = [
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
const searchFields = [
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

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg"
};

function sendJson(response, status, payload) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(`${JSON.stringify(payload, null, 2)}\n`);
}

function readBody(request) {
  return new Promise((resolveBody, rejectBody) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 25 * 1024 * 1024) {
        request.destroy();
        rejectBody(new Error("导入文件过大"));
      }
    });
    request.on("end", () => resolveBody(body));
    request.on("error", rejectBody);
  });
}

function parseCsv(text) {
  const rows = [];
  let row = [];
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

    if (char === '"') {
      quoted = true;
    } else if (char === ",") {
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
  const headers = rows.shift()?.map((header, index) => header.trim() || `字段${index + 1}`) || [];
  return rows.map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""])));
}

function normalizeImport(payload) {
  const now = new Date().toLocaleString("zh-CN", { hour12: false });
  if (Array.isArray(payload)) {
    return rowsToDataset(payload, now);
  }

  if (payload?.records && payload?.fields) {
    return {
      meta: {
        title: payload.meta?.title || "导入数据",
        status: "ok",
        sourceUrl: payload.meta?.sourceUrl || "",
        syncedAt: now,
        message: `本地导入 ${payload.records.length} 条记录`
      },
      fields: payload.fields,
      records: payload.records
    };
  }

  if (Array.isArray(payload?.rows)) {
    return rowsToDataset(payload.rows, now, payload.title);
  }

  throw new Error("不支持的数据格式");
}

function rowsToDataset(rows, syncedAt, title = "导入数据") {
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

function saveDataset(dataset) {
  mkdirSync(resolve(root, "data"), { recursive: true });
  writeFileSync(dataPath, `${JSON.stringify(dataset, null, 2)}\n`, "utf8");
}

function readDataset() {
  return existsSync(dataPath) ? JSON.parse(readFileSync(dataPath, "utf8")) : rowsToDataset([], "");
}

function readJsonFile(filePath, fallback) {
  return existsSync(filePath) ? JSON.parse(readFileSync(filePath, "utf8")) : fallback;
}

function writeJsonFile(filePath, payload) {
  mkdirSync(resolve(root, "data"), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function readLedgerLogs() {
  return readJsonFile(ledgerLogPath, []);
}

function saveLedgerLogs(logs) {
  writeJsonFile(ledgerLogPath, logs);
}

function stringifyCell(value) {
  if (value == null) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(stringifyCell).filter(Boolean).join("、");
  if (typeof value === "object") {
    return value.text || value.name || value.en_name || value.email || value.title || value.value || value.url || value.id || JSON.stringify(value);
  }
  return String(value);
}

function cell(record, fieldName) {
  return stringifyCell(record.fields?.[fieldName]);
}

function normalizeText(value) {
  return String(value || "").trim().toLowerCase();
}

function hasAdminToken(request) {
  const token = request.headers["x-admin-token"];
  return typeof token === "string" && adminTokens.has(token);
}

function normalizeRecordFields(fields, knownFields) {
  const knownNames = knownFields.map((field) => field.name || field.id);
  return Object.fromEntries(knownNames.map((name) => [name, fields?.[name] ?? ""]));
}

function ensureFields(dataset, names) {
  const current = new Set((dataset.fields || []).map((field) => field.name || field.id));
  names.forEach((name) => {
    if (!current.has(name)) {
      dataset.fields = [...(dataset.fields || []), { id: name, name, type: "text" }];
      current.add(name);
    }
  });
}

function nextRecordId(records) {
  const maxImportId = records.reduce((max, record) => {
    const match = String(record.record_id || "").match(/^import-(\d+)$/);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
  return `import-${maxImportId + 1}`;
}

function requireAdmin(request, response) {
  if (hasAdminToken(request)) return true;
  sendJson(response, 403, { ok: false, message: "需要管理员权限" });
  return false;
}

function actorFromPayload(payload, fallback = "管理员") {
  return String(payload.actor || payload.requesterName || fallback).trim() || fallback;
}

function appendLedgerLog(entry) {
  const logs = readLedgerLogs();
  const normalized = {
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
  logs.unshift(normalized);
  saveLedgerLogs(logs);
  return normalized;
}

function appendFieldChangeLogs(recordId, beforeFields, afterFields, actor, role, note = "") {
  Object.entries(afterFields || {}).forEach(([field, after]) => {
    const before = stringifyCell(beforeFields?.[field]);
    const next = stringifyCell(after);
    if (before !== next) {
      appendLedgerLog({
        record_id: recordId,
        type: "字段更新",
        field,
        before,
        after: next,
        actor,
        role,
        note
      });
    }
  });
}

function publicDataset(dataset, records = []) {
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

function searchPublicRecords(dataset, query, limit = 100) {
  const normalized = normalizeText(query);
  if (!normalized) return [];
  return (dataset.records || [])
    .filter((record) => searchFields.some((field) => normalizeText(cell(record, field)).includes(normalized)))
    .slice(0, limit);
}

function uniqueRequesterNames(dataset) {
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

function requesterRecords(dataset, requesterName) {
  const normalized = normalizeText(requesterName);
  if (!normalized) return [];
  return (dataset.records || []).filter((record) => {
    const visibleFields = ["需求负责人", "需求人", "关注人", "项目对接人", "部门负责人"];
    return visibleFields.some((field) => normalizeText(cell(record, field)).includes(normalized));
  });
}

function datasetStats(dataset) {
  const records = dataset.records || [];
  const statuses = records.reduce((acc, record) => {
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

function metricsText(dataset) {
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

function todayText() {
  return new Date().toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).replace(/\//g, "/");
}

function demandToLedgerFields(payload, knownFields) {
  const fields = payload.fields || {};
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

  const mapped = {
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

function serveStatic(request, response) {
  const url = new URL(request.url, "http://localhost");
  const pathname = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
  const clientPath = normalize(join(clientRoot, pathname));
  const filePath = existsSync(clientPath) ? clientPath : normalize(join(root, pathname));

  if ((!filePath.startsWith(root) && !filePath.startsWith(clientRoot)) || !existsSync(filePath)) {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }

  response.writeHead(200, {
    "content-type": mimeTypes[extname(filePath)] || "application/octet-stream",
    "cache-control": "no-store"
  });
  if (request.method === "HEAD") {
    response.end();
    return;
  }
  createReadStream(filePath).pipe(response);
}

export async function handleRequest(request, response) {
  try {
    const url = new URL(request.url, "http://localhost");

    if (request.method === "GET" && url.pathname === "/healthz") {
      const data = readDataset();
      sendJson(response, 200, datasetStats(data));
      return;
    }

    if (request.method === "GET" && url.pathname === "/metrics") {
      const data = readDataset();
      response.writeHead(200, { "content-type": "text/plain; version=0.0.4; charset=utf-8" });
      response.end(metricsText(data));
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/data") {
      const data = readDataset();
      sendJson(response, 200, hasAdminToken(request) ? data : publicDataset(data));
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/search") {
      const data = readDataset();
      const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || 100), 1), 200);
      const records = searchPublicRecords(data, url.searchParams.get("q") || "", limit);
      sendJson(response, 200, publicDataset(data, records));
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/requesters") {
      const data = readDataset();
      sendJson(response, 200, { ok: true, requesters: uniqueRequesterNames(data) });
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/my-records") {
      const data = readDataset();
      const records = requesterRecords(data, url.searchParams.get("name") || "");
      sendJson(response, 200, publicDataset(data, records));
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/requests") {
      const body = await readBody(request);
      const payload = JSON.parse(body || "{}");
      const dataset = readDataset();
      ensureFields(dataset, ["需求负责人", "需求人", "关注人"]);
      const record = {
        record_id: nextRecordId(dataset.records || []),
        fields: demandToLedgerFields(payload, dataset.fields || [])
      };
      dataset.records = [record, ...(dataset.records || [])];
      dataset.meta = {
        ...(dataset.meta || {}),
        status: "ok",
        syncedAt: new Date().toLocaleString("zh-CN", { hour12: false }),
        message: `需求方提交 ${record.fields["项目名称"] || record.record_id}`
      };
      saveDataset(dataset);
      appendLedgerLog({
        record_id: record.record_id,
        type: "新需求提交",
        field: "项目名称",
        before: "",
        after: record.fields["项目名称"] || record.record_id,
        actor: actorFromPayload(payload, "需求方"),
        role: "requester",
        note: "需求方自助提交，自动进入交付管线"
      });
      sendJson(response, 200, { ok: true, record, data: publicDataset(dataset, requesterRecords(dataset, payload.requesterName || "")) });
      return;
    }

    const requestFollowerMatch = url.pathname.match(/^\/api\/requests\/([^/]+)\/followers$/);
    if (request.method === "PATCH" && requestFollowerMatch) {
      const body = await readBody(request);
      const payload = JSON.parse(body || "{}");
      const requesterName = String(payload.requesterName || "").trim();
      const dataset = readDataset();
      ensureFields(dataset, ["需求负责人", "需求人", "关注人"]);
      const recordId = decodeURIComponent(requestFollowerMatch[1]);
      const record = (dataset.records || []).find((item) => item.record_id === recordId);
      if (!record) {
        sendJson(response, 404, { ok: false, message: "需求不存在" });
        return;
      }
      const owner = normalizeText(cell(record, "需求负责人") || cell(record, "项目对接人"));
      if (!owner.includes(normalizeText(requesterName))) {
        sendJson(response, 403, { ok: false, message: "只有需求负责人可以维护关注人" });
        return;
      }
      const beforeFields = { ...(record.fields || {}) };
      record.fields = {
        ...record.fields,
        "关注人": String(payload.followers || "").trim()
      };
      dataset.meta = {
        ...(dataset.meta || {}),
        status: "ok",
        syncedAt: new Date().toLocaleString("zh-CN", { hour12: false }),
        message: `已更新关注人：${record.fields["项目名称"] || record.record_id}`
      };
      saveDataset(dataset);
      appendFieldChangeLogs(recordId, beforeFields, { "关注人": record.fields["关注人"] }, requesterName, "requester", "需求负责人维护关注人");
      sendJson(response, 200, { ok: true, record, data: publicDataset(dataset, requesterRecords(dataset, requesterName)) });
      return;
    }

    const recordLogMatch = url.pathname.match(/^\/api\/records\/([^/]+)\/logs$/);
    if (request.method === "GET" && recordLogMatch) {
      if (!requireAdmin(request, response)) return;
      const data = readDataset();
      const recordId = decodeURIComponent(recordLogMatch[1]);
      const record = (data.records || []).find((item) => item.record_id === recordId);
      if (!record) {
        sendJson(response, 404, { ok: false, message: "记录不存在" });
        return;
      }
      const logs = readLedgerLogs().filter((log) => log.record_id === recordId);
      sendJson(response, 200, { ok: true, logs });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/import") {
      if (!requireAdmin(request, response)) return;
      const body = await readBody(request);
      const contentType = request.headers["content-type"] || "";
      const payload = contentType.includes("text/csv") ? parseCsv(body) : JSON.parse(body);
      const dataset = normalizeImport(payload);
      if (url.searchParams.get("dryRun") === "1") {
        sendJson(response, 200, { ok: true, count: dataset.records.length, data: dataset });
        return;
      }
      saveDataset(dataset);
      sendJson(response, 200, { ok: true, count: dataset.records.length, data: dataset });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/admin/login") {
      const body = await readBody(request);
      const payload = JSON.parse(body || "{}");
      if (payload.password !== adminPassword) {
        sendJson(response, 401, { ok: false, message: "管理员口令错误" });
        return;
      }
      const token = randomUUID();
      adminTokens.add(token);
      sendJson(response, 200, { ok: true, token });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/records") {
      if (!requireAdmin(request, response)) return;
      const body = await readBody(request);
      const payload = JSON.parse(body || "{}");
      const dataset = readDataset();
      const record = {
        record_id: nextRecordId(dataset.records || []),
        fields: normalizeRecordFields(payload.fields || {}, dataset.fields || [])
      };
      dataset.records = [...(dataset.records || []), record];
      dataset.meta = {
        ...(dataset.meta || {}),
        status: "ok",
        syncedAt: new Date().toLocaleString("zh-CN", { hour12: false }),
        message: `本地共 ${dataset.records.length} 条记录`
      };
      saveDataset(dataset);
      appendLedgerLog({
        record_id: record.record_id,
        type: "管理员新增",
        field: "项目名称",
        before: "",
        after: record.fields["项目名称"] || record.record_id,
        actor: actorFromPayload(payload),
        role: "admin",
        note: "管理员手动新增台账记录"
      });
      sendJson(response, 200, { ok: true, record, data: dataset });
      return;
    }

    const recordMatch = url.pathname.match(/^\/api\/records\/([^/]+)$/);
    if (request.method === "PATCH" && recordMatch) {
      if (!requireAdmin(request, response)) return;
      const body = await readBody(request);
      const payload = JSON.parse(body || "{}");
      const dataset = readDataset();
      const recordId = decodeURIComponent(recordMatch[1]);
      const record = (dataset.records || []).find((item) => item.record_id === recordId);
      if (!record) {
        sendJson(response, 404, { ok: false, message: "记录不存在" });
        return;
      }
      const beforeFields = { ...(record.fields || {}) };
      const patchFields = payload.fields || {};
      record.fields = {
        ...normalizeRecordFields(record.fields || {}, dataset.fields || []),
        ...patchFields
      };
      dataset.meta = {
        ...(dataset.meta || {}),
        status: "ok",
        syncedAt: new Date().toLocaleString("zh-CN", { hour12: false }),
        message: `已更新 ${record.fields["项目名称"] || record.record_id}`
      };
      saveDataset(dataset);
      appendFieldChangeLogs(recordId, beforeFields, patchFields, actorFromPayload(payload), "admin");
      sendJson(response, 200, { ok: true, record, data: dataset });
      return;
    }

    if (request.method === "GET" || request.method === "HEAD") {
      serveStatic(request, response);
      return;
    }

    response.writeHead(405, { "content-type": "text/plain; charset=utf-8" });
    response.end("Method not allowed");
  } catch (error) {
    sendJson(response, 400, { ok: false, message: error.message });
  }
}

export function startLegacyServer() {
  const server = createServer(handleRequest);
  server.listen(port, host, () => {
    console.log(`Data panel running at http://${host}:${port}`);
  });
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startLegacyServer();
}

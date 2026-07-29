import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";

const baseUrl = process.env.LARK_BASE_WEB_URL
  || "https://aicarrier.feishu.cn/wiki/ZqC3whTTXiU2rUkLdRycTtmhnYE";
const publicAppUrl = String(process.env.PUBLIC_APP_URL || "").replace(/\/+$/, "");
const webhookUrl = process.env.LARK_BASE_WEBHOOK_URL
  || (publicAppUrl ? `${publicAppUrl}/api/webhooks/lark/base` : "");
const webhookSecret = String(process.env.LARK_BASE_WEBHOOK_SECRET || "").trim();

if (!webhookUrl) throw new Error("请设置 PUBLIC_APP_URL 或 LARK_BASE_WEBHOOK_URL");
if (webhookSecret.length < 32) throw new Error("LARK_BASE_WEBHOOK_SECRET 至少需要 32 个字符");

const sources = [
  {
    name: "总台账",
    tableId: process.env.LARK_LEDGER_TABLE_ID || "tbl7FrAYMpseNuPA"
  },
  {
    name: "245",
    tableId: process.env.LARK_245_TABLE_ID || "tbl6dWpodWYuWNq7"
  },
  {
    name: "高峰加入",
    tableId: process.env.LARK_GAOFENG_TABLE_ID || "tbl8iFcCizgi0YrU"
  }
];

function runJson(args) {
  try {
    const output = execFileSync("lark-cli", args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"]
    });
    return JSON.parse(output);
  } catch (error) {
    const output = `${error.stdout || ""}\n${error.stderr || ""}`.replaceAll(webhookSecret, "***");
    throw new Error(output.trim() || error.message);
  }
}

function listFrom(data, keys) {
  if (Array.isArray(data)) return data;
  for (const key of keys) {
    if (Array.isArray(data?.[key])) return data[key];
  }
  return [];
}

function baseToken() {
  if (process.env.LARK_BASE_TOKEN) return process.env.LARK_BASE_TOKEN;
  const resolved = runJson(["base", "+url-resolve", "--url", baseUrl, "--as", "user", "--json"]);
  const token = resolved.data?.base_token;
  if (!token) throw new Error("无法从 LARK_BASE_WEB_URL 解析 Base token");
  return token;
}

function tableIdOf(item) {
  return item?.table_id || item?.tableId || item?.id || "";
}

const token = baseToken();
const tableResult = runJson(["base", "+table-list", "--base-token", token, "--as", "user", "--json"]);
const tables = listFrom(tableResult.data, ["items", "tables", "table_list"]);
const workflowResult = runJson(["base", "+workflow-list", "--base-token", token, "--as", "user", "--json"]);
const workflows = listFrom(workflowResult.data, ["items", "workflows", "workflow_list"]);

for (const source of sources) {
  const table = tables.find((item) => tableIdOf(item) === source.tableId);
  if (!table) throw new Error(`未找到数据表 ${source.name}（${source.tableId}）`);
  const tableName = table.name || table.table_name || table.tableName;
  if (!tableName) throw new Error(`数据表 ${source.tableId} 缺少名称`);

  const title = `交付管线实时同步 · ${source.name}`;
  const existing = workflows.find((item) => item.title === title || item.name === title);
  if (existing) {
    const workflowId = existing.workflow_id || existing.workflowId || existing.id;
    const enabled = existing.status === "enabled" || existing.enabled === true;
    if (!enabled && workflowId) {
      runJson([
        "base",
        "+workflow-enable",
        "--base-token",
        token,
        "--workflow-id",
        workflowId,
        "--as",
        "user",
        "--json"
      ]);
      console.log(`已启用：${title}`);
    } else {
      console.log(`已存在：${title}`);
    }
    continue;
  }

  const workflow = {
    client_token: randomUUID(),
    title,
    steps: [
      {
        id: "trigger",
        type: "ChangeRecordTrigger",
        title: `${tableName} 新增或修改时触发`,
        next: "push_sync",
        data: {
          table_name: tableName,
          trigger_control_list: ["pasteUpdate", "automationBatchUpdate", "syncUpdate", "appendImport"],
          condition_list: null
        }
      },
      {
        id: "push_sync",
        type: "HTTPClientAction",
        title: "通知交付管线同步",
        next: null,
        data: {
          method: "POST",
          url: [{ value_type: "text", value: webhookUrl }],
          headers: [
            { key: "Content-Type", value: [{ value_type: "text", value: "application/json" }] },
            { key: "X-Lark-Sync-Secret", value: [{ value_type: "text", value: webhookSecret }] }
          ],
          body_type: "raw",
          raw_body: [
            { value_type: "text", value: `{"tableId":"${source.tableId}","recordId":"` },
            { value_type: "ref", value: "$.trigger.recordId" },
            { value_type: "text", value: "\"}" }
          ],
          response_type: "json",
          response_value: "{\"ok\":true,\"accepted\":true}"
        }
      }
    ]
  };
  const created = runJson([
    "base",
    "+workflow-create",
    "--base-token",
    token,
    "--json",
    JSON.stringify(workflow),
    "--as",
    "user"
  ]);
  const workflowId = created.data?.workflow_id
    || created.data?.workflowId
    || created.data?.workflow?.workflow_id
    || created.data?.workflow?.id;
  if (!workflowId) throw new Error(`已创建 ${title}，但未返回 workflow_id`);
  runJson([
    "base",
    "+workflow-enable",
    "--base-token",
    token,
    "--workflow-id",
    workflowId,
    "--as",
    "user",
    "--json"
  ]);
  console.log(`已创建并启用：${title}`);
}

import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mergeImportedDataset, importBusinessKey } from "../dist/server/ledger/parse-utils.js";
import { isCompletedStatus } from "../dist/server/metrics/satisfaction.service.js";
import { demandToLedgerFields, requesterRecords } from "../dist/server/core/ledger-utils.js";
import { hasAdminRole, normalizeUserRoles, primaryUserRole } from "../dist/server/core/user-roles.js";
import { LarkOAuthService } from "../dist/server/auth/lark-oauth.service.js";
import { LarkBaseSyncService } from "../dist/server/sync/lark-base-sync.service.js";

function dataset(rows) {
  const names = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  return {
    meta: {},
    fields: names.map((name) => ({ id: name, name, type: "text" })),
    records: rows.map((fields, index) => ({ record_id: `test-${index + 1}`, fields }))
  };
}

test("incremental import updates matching records and inserts new records", () => {
  const existing = dataset([
    { "项目名称": "Alpha", "任务代码": "PJ-001", "获取状态": "需求澄清中", "数据来源": "总台账" }
  ]);
  const incoming = dataset([
    { "项目名称": "Alpha", "任务代码": "PJ-001", "获取状态": "已完结" },
    { "项目名称": "Beta", "任务代码": "PJ-002", "获取状态": "进行中" }
  ]);
  const result = mergeImportedDataset(existing, incoming, "数据团队总表");

  assert.deepEqual(result.summary, { total: 2, inserted: 1, updated: 1, unchanged: 0, conflicts: 0 });
  assert.equal(result.dataset.records.length, 2);
  assert.equal(result.dataset.records[0].fields["获取状态"], "已完结");
  assert.equal(result.dataset.records[0].fields["数据来源"], "总台账、数据团队总表");
});

test("incremental import reports duplicate business keys", () => {
  const incoming = dataset([
    { "任务代码": "PJ-003", "项目名称": "Gamma" },
    { "任务代码": "PJ-003", "项目名称": "Gamma updated" }
  ]);
  const result = mergeImportedDataset(dataset([]), incoming, "总台账");
  assert.equal(result.summary.conflicts, 1);
  assert.equal(result.dataset.records.length, 1);
});

test("business key prioritizes task code over project name", () => {
  assert.equal(
    importBusinessKey({ "任务代码": " PJ-009 ", "项目名称": "Anything" }),
    "任务代码:pj-009"
  );
});

test("completed status recognition covers delivery terminal states", () => {
  assert.equal(isCompletedStatus("已完结"), true);
  assert.equal(isCompletedStatus("验收通过"), true);
  assert.equal(isCompletedStatus("需求澄清中"), false);
});

test("requester visibility includes assigned PM but does not use partial name matches", () => {
  const source = dataset([
    { "项目名称": "PM demand", "PM": "张三", "需求负责人": "李四" },
    { "项目名称": "Similar name", "PM": "张三丰", "需求负责人": "李四" }
  ]);
  assert.deepEqual(requesterRecords(source, "张三").map((record) => record.fields["项目名称"]), ["PM demand"]);
});

test("request form only stores PM when requester explicitly enables it", () => {
  const fields = ["项目名称", "需求负责人", "需求人", "关注人", "PM"].map((name) => ({ id: name, name }));
  const enabled = demandToLedgerFields({ requesterName: "需求方", fields: { "需求描述": "测试", "是否设置PM": "是", "PM": "项目经理" } }, fields);
  const disabled = demandToLedgerFields({ requesterName: "需求方", fields: { "需求描述": "测试", "是否设置PM": "否", "PM": "项目经理" } }, fields);
  assert.equal(enabled.PM, "项目经理");
  assert.equal(disabled.PM, "");
});

test("administrator roles always retain requester capability", () => {
  const roles = normalizeUserRoles(["delivery_admin"]);
  const user = { openId: "ou_test", name: "管理员", email: "", department: "", role: primaryUserRole(roles), roles };
  assert.deepEqual(roles, ["delivery_admin", "requester"]);
  assert.equal(hasAdminRole(user), true);
});

test("three Feishu tables expose stable online links and sync in authority order", () => {
  const keys = [
    "LARK_BASE_WEB_URL",
    "LARK_REQUEST_TABLE_ID",
    "LARK_REQUEST_VIEW_ID",
    "LARK_DATA_TEAM_TABLE_ID",
    "LARK_DATA_TEAM_VIEW_ID",
    "LARK_LEDGER_TABLE_ID",
    "LARK_LEDGER_VIEW_ID"
  ];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  Object.assign(process.env, {
    LARK_BASE_WEB_URL: "https://example.feishu.cn/wiki/base-node",
    LARK_REQUEST_TABLE_ID: "request-table",
    LARK_REQUEST_VIEW_ID: "request-view",
    LARK_DATA_TEAM_TABLE_ID: "team-table",
    LARK_DATA_TEAM_VIEW_ID: "team-view",
    LARK_LEDGER_TABLE_ID: "ledger-table",
    LARK_LEDGER_VIEW_ID: "ledger-view"
  });
  try {
    const service = new LarkBaseSyncService({}, {}, {});
    const sources = service.sourceConfigurations();
    assert.deepEqual(sources.map((source) => source.key), ["request", "data-team", "ledger"]);
    assert.equal(sources.every((source) => source.configured), true);
    assert.equal(sources[0].url, "https://example.feishu.cn/wiki/base-node?table=request-table&view=request-view");
    assert.equal(sources[2].url, "https://example.feishu.cn/wiki/base-node?table=ledger-table&view=ledger-view");
  } finally {
    for (const key of keys) {
      if (previous[key] == null) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
});

test("three Feishu tables merge in request, data-team, ledger order", async () => {
  const keys = [
    "LARK_BASE_TOKEN",
    "LARK_REQUEST_TABLE_ID",
    "LARK_DATA_TEAM_TABLE_ID",
    "LARK_LEDGER_TABLE_ID"
  ];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  Object.assign(process.env, {
    LARK_BASE_TOKEN: "base-token",
    LARK_REQUEST_TABLE_ID: "request-table",
    LARK_DATA_TEAM_TABLE_ID: "team-table",
    LARK_LEDGER_TABLE_ID: "ledger-table"
  });
  let stored = dataset([]);
  const reads = [];
  const service = new LarkBaseSyncService(
    {
      readDataset: async () => stored,
      saveDataset: async (next) => { stored = next; },
      appendImportBatch: async () => {}
    },
    {
      isBotConfigured: () => true,
      listBaseDataset: async (_appToken, tableId) => {
        reads.push(tableId);
        return dataset([{ "任务代码": "PJ-001", "项目名称": "Alpha", "获取状态": tableId }]);
      }
    },
    { enqueue: async () => {} }
  );
  try {
    const results = await service.syncAll("测试");
    assert.deepEqual(reads, ["request-table", "team-table", "ledger-table"]);
    assert.deepEqual(results.map((item) => item.source), ["提需求表", "数据团队总表", "总台账"]);
    assert.equal(stored.records[0].fields["获取状态"], "ledger-table");
  } finally {
    for (const key of keys) {
      if (previous[key] == null) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
});

test("Feishu client reads Base records and sends bot messages through OpenAPI", async () => {
  const requests = [];
  const server = createServer((request, response) => {
    let body = "";
    request.on("data", (chunk) => { body += chunk; });
    request.on("end", () => {
      requests.push({ method: request.method, url: request.url, body });
      response.setHeader("content-type", "application/json");
      if (request.url === "/open-apis/auth/v3/tenant_access_token/internal") {
        response.end(JSON.stringify({ code: 0, tenant_access_token: "tenant-token", expire: 3600 }));
        return;
      }
      if (request.url?.startsWith("/open-apis/bitable/v1/apps/base-token/tables/table-id/records")) {
        response.end(JSON.stringify({ code: 0, data: { has_more: false, items: [{ record_id: "rec-1", fields: { "项目名称": "测试需求" } }] } }));
        return;
      }
      if (request.url === "/open-apis/wiki/v2/spaces/get_node?token=wiki-token&obj_type=wiki") {
        response.end(JSON.stringify({ code: 0, data: { node: { obj_type: "bitable", obj_token: "base-token" } } }));
        return;
      }
      if (request.url === "/open-apis/im/v1/messages?receive_id_type=open_id") {
        response.end(JSON.stringify({ code: 0, data: { message_id: "message-1" } }));
        return;
      }
      response.statusCode = 404;
      response.end(JSON.stringify({ code: 404 }));
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const host = `http://127.0.0.1:${address.port}`;
  const previous = {
    id: process.env.LARK_APP_ID,
    secret: process.env.LARK_APP_SECRET,
    redirect: process.env.LARK_REDIRECT_URI,
    api: process.env.LARK_API_HOST
  };
  process.env.LARK_APP_ID = "test-app";
  process.env.LARK_APP_SECRET = "test-secret";
  process.env.LARK_REDIRECT_URI = `${host}/callback`;
  process.env.LARK_API_HOST = host;
  try {
    const lark = new LarkOAuthService();
    assert.equal(await lark.resolveWikiNodeObjectToken("wiki-token"), "base-token");
    const base = await lark.listBaseDataset("base-token", "table-id");
    await lark.sendTextMessage("ou_test", "测试通知");
    assert.equal(base.records.length, 1);
    assert.equal(base.records[0].fields["项目名称"], "测试需求");
    const message = requests.find((item) => item.url?.startsWith("/open-apis/im/v1/messages"));
    assert.ok(message);
    assert.equal(JSON.parse(message.body).receive_id, "ou_test");
  } finally {
    await new Promise((resolve) => server.close(resolve));
    for (const [key, value] of Object.entries({
      LARK_APP_ID: previous.id,
      LARK_APP_SECRET: previous.secret,
      LARK_REDIRECT_URI: previous.redirect,
      LARK_API_HOST: previous.api
    })) {
      if (value == null) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

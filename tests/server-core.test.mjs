import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { mergeImportedDataset, importBusinessKey } from "../dist/server/ledger/parse-utils.js";
import { analyzeDeliveryEfficiency } from "../dist/server/metrics/delivery-efficiency.service.js";
import { isCompletedStatus } from "../dist/server/metrics/satisfaction.service.js";
import { demandToLedgerFields, requesterRecords } from "../dist/server/core/ledger-utils.js";
import { projectDatasetForAdmin } from "../dist/server/core/admin-views.js";
import { hasAdminRole, mergeAdministrativeRoles, normalizeUserRoles, primaryUserRole } from "../dist/server/core/user-roles.js";
import { LarkOAuthService } from "../dist/server/auth/lark-oauth.service.js";
import { AuthService } from "../dist/server/auth/auth.service.js";
import { LarkBaseSyncService } from "../dist/server/sync/lark-base-sync.service.js";
import { LedgerController } from "../dist/server/ledger/ledger.controller.js";
import { LarkNotificationService } from "../dist/server/notifications/lark-notification.service.js";

function dataset(rows) {
  const names = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  return {
    meta: {},
    fields: names.map((name) => ({ id: name, name, type: "text" })),
    records: rows.map((fields, index) => ({ record_id: `test-${index + 1}`, fields }))
  };
}

function withAuthEnvironment(overrides, callback) {
  const keys = ["NODE_ENV", "AUTH_MOCK_ENABLED", "ADMIN_PASSWORD", "AUTH_SECRET"];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  for (const [key, value] of Object.entries(overrides)) {
    if (value == null) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    return callback();
  } finally {
    for (const key of keys) {
      if (previous[key] == null) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
}

test("production OAuth-only mode does not require an administrator password", () => {
  withAuthEnvironment({
    NODE_ENV: "production",
    AUTH_MOCK_ENABLED: "false",
    ADMIN_PASSWORD: null,
    AUTH_SECRET: "a".repeat(64)
  }, () => assert.doesNotThrow(() => new AuthService()));
});

test("production mock authentication still requires a non-default administrator password", () => {
  withAuthEnvironment({
    NODE_ENV: "production",
    AUTH_MOCK_ENABLED: "true",
    ADMIN_PASSWORD: "admin123",
    AUTH_SECRET: "b".repeat(64)
  }, () => assert.throws(() => new AuthService(), /ADMIN_PASSWORD/));
});

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

test("administrator and requester capabilities are assigned independently", () => {
  const roles = normalizeUserRoles(["delivery_admin"]);
  const user = { openId: "ou_test", name: "管理员", email: "", department: "", role: primaryUserRole(roles), roles };
  assert.deepEqual(roles, ["delivery_admin"]);
  assert.equal(hasAdminRole(user), true);
  assert.deepEqual(normalizeUserRoles([]), ["member"]);
});

test("every delivery administrator receives the complete ledger dataset", () => {
  const source = dataset([
    { "项目名称": "甲", "项目对接人": "顾语莺" },
    { "项目名称": "乙", "项目对接人": "其他管理员" }
  ]);
  const admin = { openId: "ou_admin", name: "顾语莺", role: "delivery_admin", roles: ["delivery_admin"] };
  assert.deepEqual(projectDatasetForAdmin(source, admin).records.map((record) => record.fields["项目名称"]), ["甲", "乙"]);
});

test("administrator custom view preserves more than four selected fields", async () => {
  const fields = ["项目名称", "获取状态", "隶属部门", "项目对接人", "解决方案负责人", "Sprint"];
  const admin = {
    openId: "ou_admin",
    name: "管理员",
    role: "delivery_admin",
    roles: ["delivery_admin"]
  };
  let storedPreferences;
  const controller = new LedgerController(
    {
      readDataset: async () => dataset([Object.fromEntries(fields.map((field) => [field, field]))]),
      saveUserFieldPreferences: async (preferences) => {
        storedPreferences = preferences;
        return preferences;
      }
    },
    {
      sessionCookieName: "delivery_session",
      verifyToken: () => admin,
      isAdminUser: () => true
    },
    {},
    {},
    {},
    {},
    {}
  );

  const result = await controller.updateFieldPreferences(
    { headers: { cookie: "delivery_session=test" } },
    undefined,
    { hiddenFields: [], fieldOrder: fields, pinnedFields: fields }
  );

  assert.deepEqual(storedPreferences.pinnedFields, fields);
  assert.deepEqual(result.preferences.pinnedFields, fields);
});

test("delivery efficiency follows the six-stage Q1 and Q2 calculation rules", () => {
  const source = dataset([
    {
      "项目名称": "Q1 项目",
      "Sprint": "SP20",
      "需求提出时间": "2026-01-01",
      "需求澄清完成时间": "2026-01-06",
      "解决方案对接时间": "2026-01-04",
      "采购反馈预报价时间": "2026-01-08",
      "开始执行时间": "2026-01-10",
      "期望交付日期": "2026-01-20",
      "实际交付完成日期": "2026-01-25",
      "数据来源": "总台账"
    },
    {
      "项目名称": "Q2 项目",
      "Sprint": "SP30",
      "需求提出时间": "2026-04-01",
      "需求澄清完成时间": "2026-04-04",
      "解决方案对接时间": "2026-04-03",
      "采购反馈预报价时间": "2026-04-06",
      "开始执行时间": "2026-04-08",
      "期望交付日期": "2026-04-20",
      "实际交付完成日期": "2026-04-18",
      "数据来源": "245"
    }
  ]);
  const result = analyzeDeliveryEfficiency(source);
  const full = result.stages.find((stage) => stage.key === "proposed_to_delivered");
  assert.equal(result.analyzableRecords, 2);
  assert.equal(full.q1.averageDays, 24);
  assert.equal(full.q2.averageDays, 17);
  assert.equal(full.improvementPercent, 29.17);
  assert.equal(result.deliveryDeviation.q1.averageDays, 5);
  assert.equal(result.deliveryDeviation.q2.averageDays, -2);
});

test("satisfaction below four stars requires a reason", async () => {
  const requester = {
    openId: "ou_requester",
    name: "需求方",
    role: "requester",
    roles: ["requester"]
  };
  const controller = new LedgerController(
    {},
    {
      sessionCookieName: "delivery_session",
      verifyToken: () => requester,
      hasRole: (user, role) => user?.roles?.includes(role)
    },
    {},
    {},
    {},
    {},
    {}
  );
  await assert.rejects(
    () => controller.submitSatisfaction(
      { headers: { cookie: "delivery_session=test" } },
      "record-1",
      { score: 3, comment: "" }
    ),
    (error) => error?.response?.message === "满意度低于 4 星时必须填写理由"
  );
});

test("super administrator appointment updates roles and writes an audit log", async () => {
  const superAdmin = {
    openId: "ou_super",
    name: "超级管理员",
    email: "",
    department: "",
    role: "super_admin",
    roles: ["super_admin"]
  };
  const target = {
    openId: "ou_member",
    name: "测试成员",
    email: "",
    department: "",
    role: "requester",
    roles: ["requester"]
  };
  let storedRoles = target.roles;
  const logs = [];
  const controller = new LedgerController(
    {
      findUserByOpenId: async (openId) => openId === superAdmin.openId ? superAdmin : target,
      updateUserRoles: async (_openId, roles) => {
        storedRoles = roles;
        return { ...target, role: "delivery_admin", roles };
      },
      appendLog: async (log) => logs.push(log)
    },
    {
      sessionCookieName: "delivery_session",
      verifyToken: () => superAdmin,
      isAdminUser: () => true,
      hasRole: (user, role) => user?.roles?.includes(role)
    },
    {},
    {},
    {},
    {}
  );

  const result = await controller.updateUserRole(
    { headers: { cookie: "delivery_session=test" } },
    undefined,
    target.openId,
    { roles: ["delivery_admin"], note: "测试任命" }
  );

  assert.deepEqual(storedRoles, ["delivery_admin"]);
  assert.deepEqual(result.user.roles, ["delivery_admin"]);
  assert.equal(logs.length, 1);
  assert.equal(logs[0].type, "管理员任命");
  assert.equal(logs[0].record_id, "user:ou_member");
});

test("three Feishu business tables expose stable online links", () => {
  const keys = [
    "LARK_BASE_WEB_URL",
    "LARK_LEDGER_TABLE_ID",
    "LARK_LEDGER_VIEW_ID",
    "LARK_245_TABLE_ID",
    "LARK_245_VIEW_ID",
    "LARK_GAOFENG_TABLE_ID",
    "LARK_GAOFENG_VIEW_ID"
  ];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  Object.assign(process.env, {
    LARK_BASE_WEB_URL: "https://example.feishu.cn/wiki/base-node",
    LARK_LEDGER_TABLE_ID: "ledger-table",
    LARK_LEDGER_VIEW_ID: "ledger-view",
    LARK_245_TABLE_ID: "245-table",
    LARK_245_VIEW_ID: "245-view",
    LARK_GAOFENG_TABLE_ID: "gaofeng-table",
    LARK_GAOFENG_VIEW_ID: "gaofeng-view"
  });
  try {
    const service = new LarkBaseSyncService({}, {}, {});
    const sources = service.sourceConfigurations();
    assert.deepEqual(sources.map((source) => source.key), ["ledger", "project-245", "gaofeng"]);
    assert.equal(sources.every((source) => source.configured), true);
    assert.equal(sources[0].url, "https://example.feishu.cn/wiki/base-node?table=ledger-table&view=ledger-view");
    assert.equal(sources[2].url, "https://example.feishu.cn/wiki/base-node?table=gaofeng-table&view=gaofeng-view");
  } finally {
    for (const key of keys) {
      if (previous[key] == null) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
});

test("administrator add action redirects to the primary Feishu ledger", async () => {
  const admin = {
    openId: "ou_admin",
    name: "管理员",
    role: "delivery_admin",
    roles: ["delivery_admin"]
  };
  let redirectedTo = "";
  const controller = new LedgerController(
    {},
    {
      sessionCookieName: "delivery_session",
      verifyToken: () => admin,
      isAdminUser: () => true
    },
    {},
    {},
    {},
    {
      sourceConfigurations: () => [{
        key: "ledger",
        source: "总台账",
        url: "https://example.feishu.cn/base/ledger",
        configured: true
      }]
    },
    {}
  );

  await controller.openLarkSource(
    { headers: { cookie: "delivery_session=test" } },
    undefined,
    "ledger",
    { redirect: (target) => { redirectedTo = target; } }
  );

  assert.equal(redirectedTo, "https://example.feishu.cn/base/ledger");
});

test("three Feishu business tables merge serially", async () => {
  const keys = [
    "LARK_BASE_TOKEN",
    "LARK_LEDGER_TABLE_ID",
    "LARK_245_TABLE_ID",
    "LARK_GAOFENG_TABLE_ID"
  ];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  Object.assign(process.env, {
    LARK_BASE_TOKEN: "base-token",
    LARK_LEDGER_TABLE_ID: "ledger-table",
    LARK_245_TABLE_ID: "245-table",
    LARK_GAOFENG_TABLE_ID: "gaofeng-table"
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
    assert.deepEqual(reads, ["ledger-table", "245-table", "gaofeng-table"]);
    assert.deepEqual(results.map((item) => item.source), ["总台账", "245", "高峰加入"]);
    assert.equal(stored.records[0].fields["获取状态"], "gaofeng-table");
  } finally {
    for (const key of keys) {
      if (previous[key] == null) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
});

test("one inaccessible Feishu table does not block the other data sources", async () => {
  const keys = [
    "LARK_BASE_TOKEN",
    "LARK_LEDGER_TABLE_ID",
    "LARK_245_TABLE_ID",
    "LARK_GAOFENG_TABLE_ID"
  ];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  Object.assign(process.env, {
    LARK_BASE_TOKEN: "base-token",
    LARK_LEDGER_TABLE_ID: "ledger-table",
    LARK_245_TABLE_ID: "245-table",
    LARK_GAOFENG_TABLE_ID: "gaofeng-table"
  });
  let stored = dataset([]);
  const service = new LarkBaseSyncService(
    {
      readDataset: async () => stored,
      saveDataset: async (next) => { stored = next; },
      appendImportBatch: async () => {}
    },
    {
      isBotConfigured: () => true,
      listBaseDataset: async (_appToken, tableId) => {
        if (tableId === "gaofeng-table") throw new Error("not_found");
        return dataset([{ "任务代码": tableId, "项目名称": tableId }]);
      }
    },
    { enqueue: async () => {} }
  );
  try {
    const results = await service.syncAll("测试");
    assert.deepEqual(results.map((item) => item.source), ["总台账", "245"]);
    assert.equal(stored.records.length, 2);
    assert.match(service.status().lastError, /高峰加入：not_found/);
    assert.equal(service.status().sources.find((source) => source.source === "高峰加入").lastError, "not_found");
  } finally {
    for (const key of keys) {
      if (previous[key] == null) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
});

test("Feishu sync establishes a quiet baseline before emitting status-change events", async () => {
  const keys = [
    "LARK_BASE_TOKEN",
    "LARK_LEDGER_TABLE_ID",
    "LARK_245_TABLE_ID",
    "LARK_GAOFENG_TABLE_ID"
  ];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  Object.assign(process.env, {
    LARK_BASE_TOKEN: "base-token",
    LARK_LEDGER_TABLE_ID: "ledger-table",
    LARK_245_TABLE_ID: "245-table",
    LARK_GAOFENG_TABLE_ID: "gaofeng-table"
  });
  let stored = dataset([
    { "任务代码": "PJ-001", "项目名称": "Alpha", "获取状态": "需求澄清中" }
  ]);
  let upstreamStatus = "已完结";
  const events = [];
  const service = new LarkBaseSyncService(
    {
      readDataset: async () => stored,
      saveDataset: async (next) => { stored = next; },
      appendImportBatch: async () => {}
    },
    {
      isBotConfigured: () => true,
      listBaseDataset: async () => dataset([
        { "任务代码": "PJ-001", "项目名称": "Alpha", "获取状态": upstreamStatus }
      ])
    },
    { enqueue: async (eventName, payload) => { events.push({ eventName, payload }); } }
  );
  try {
    await service.syncAll("系统启动同步");
    assert.equal(events.filter((event) => event.eventName === "record.updated").length, 0);
    assert.equal(service.status().notificationBaselineReady, true);

    upstreamStatus = "验收中";
    await service.syncAll("系统兜底同步");
    const statusEvents = events.filter((event) => event.eventName === "record.updated");
    assert.equal(statusEvents.length, 1);
    assert.deepEqual(statusEvents[0].payload.fields, ["获取状态"]);
    assert.equal(statusEvents[0].payload.beforeStatus, "已完结");
    assert.equal(statusEvents[0].payload.afterStatus, "验收中");
    assert.equal(statusEvents[0].payload.source, "总台账");
  } finally {
    for (const key of keys) {
      if (previous[key] == null) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
});

test("a table whose permission arrives late does not replay its history as status changes", async () => {
  const keys = [
    "LARK_BASE_TOKEN",
    "LARK_LEDGER_TABLE_ID",
    "LARK_245_TABLE_ID",
    "LARK_GAOFENG_TABLE_ID"
  ];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  Object.assign(process.env, {
    LARK_BASE_TOKEN: "base-token",
    LARK_LEDGER_TABLE_ID: "ledger-table",
    LARK_245_TABLE_ID: "245-table",
    LARK_GAOFENG_TABLE_ID: "gaofeng-table"
  });
  let stored = dataset([
    { "任务代码": "PJ-001", "项目名称": "Alpha", "获取状态": "需求澄清中" },
    { "任务代码": "GF-001", "项目名称": "高峰一号", "获取状态": "采购调研中" }
  ]);
  let gaofengReadable = false;
  let gaofengStatus = "已完结";
  const events = [];
  const service = new LarkBaseSyncService(
    {
      readDataset: async () => stored,
      saveDataset: async (next) => { stored = next; },
      appendImportBatch: async () => {}
    },
    {
      isBotConfigured: () => true,
      listBaseDataset: async (_appToken, tableId) => {
        if (tableId === "gaofeng-table") {
          if (!gaofengReadable) throw new Error("1254302 RolePermNotAllow");
          return dataset([{ "任务代码": "GF-001", "项目名称": "高峰一号", "获取状态": gaofengStatus }]);
        }
        return dataset([{ "任务代码": "PJ-001", "项目名称": "Alpha", "获取状态": "需求澄清中" }]);
      }
    },
    { enqueue: async (eventName, payload) => { events.push({ eventName, payload }); } }
  );
  try {
    // 高峰加入 is not authorized yet, so only the other two tables establish a baseline.
    await service.syncAll("系统启动同步");
    const baselineAfterStart = service.status();
    assert.equal(baselineAfterStart.notificationBaselineReady, false);
    assert.equal(baselineAfterStart.sources.find((item) => item.source === "高峰加入").notificationBaseline, false);
    assert.equal(baselineAfterStart.sources.find((item) => item.source === "总台账").notificationBaseline, true);

    // Permission granted. Its first successful read differs from the stored ledger, but that is a
    // baseline rather than a change — announcing it would notify everyone about historical rows.
    gaofengReadable = true;
    await service.syncAll("系统兜底同步");
    assert.equal(events.filter((event) => event.eventName === "record.updated").length, 0);
    assert.equal(service.status().notificationBaselineReady, true);

    // Once the baseline exists a genuine change is reported normally.
    gaofengStatus = "验收中";
    await service.syncAll("系统兜底同步");
    const statusEvents = events.filter((event) => event.eventName === "record.updated");
    assert.equal(statusEvents.length, 1);
    assert.equal(statusEvents[0].payload.source, "高峰加入");
    assert.equal(statusEvents[0].payload.beforeStatus, "已完结");
    assert.equal(statusEvents[0].payload.afterStatus, "验收中");
  } finally {
    for (const key of keys) {
      if (previous[key] == null) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
});

test("deployment configuration appoints super administrators but never restores a removed delivery admin", () => {
  // A first login bootstraps whatever the deployment configuration says.
  assert.deepEqual(mergeAdministrativeRoles([], ["delivery_admin"], false), ["delivery_admin"]);

  // The super administrator removed the role; the name whitelist must not hand it back at login.
  assert.deepEqual(mergeAdministrativeRoles(["member"], ["delivery_admin"], true), ["member"]);

  // Appointing a new super administrator still works for a user who has logged in before — the
  // appointment endpoint refuses to create one, so this is the only path that exists.
  assert.deepEqual(mergeAdministrativeRoles(["member"], ["super_admin"], true), ["super_admin"]);

  // An administrator appointed in the page keeps the role even though no environment lists them.
  assert.deepEqual(mergeAdministrativeRoles(["delivery_admin"], [], true), ["delivery_admin"]);

  // requester is tracked by requesterRegistered and never travels through this merge.
  assert.deepEqual(mergeAdministrativeRoles(["requester"], ["requester"], true), ["member"]);
});

test("the sync setup script refuses a callback address Feishu cannot reach", () => {
  const script = fileURLToPath(new URL("../scripts/setup-lark-sync-workflows.mjs", import.meta.url));
  const rejected = [
    { url: "http://127.0.0.1:5173", reason: "必须使用 https" },
    { url: "https://localhost:5173", reason: "本地或内网地址" },
    { url: "https://192.168.1.20", reason: "本地或内网地址" },
    { url: "https://10.0.0.5", reason: "本地或内网地址" },
    { url: "https://panel.internal", reason: "本地或内网地址" }
  ];
  for (const item of rejected) {
    const result = spawnSync(process.execPath, [script], {
      encoding: "utf8",
      env: {
        ...process.env,
        PUBLIC_APP_URL: item.url,
        LARK_BASE_WEBHOOK_URL: "",
        LARK_BASE_WEBHOOK_SECRET: "s".repeat(48)
      }
    });
    assert.notEqual(result.status, 0, `${item.url} 应该被拒绝`);
    assert.match(result.stderr, new RegExp(item.reason), `${item.url} 的报错应说明原因`);
  }
});

test("revoked administrator loses protected access without waiting for session expiry", async () => {
  const staleAdmin = {
    openId: "ou_revoked",
    name: "原管理员",
    role: "delivery_admin",
    roles: ["delivery_admin"]
  };
  const storedRequester = {
    ...staleAdmin,
    role: "requester",
    roles: ["requester"],
    requesterRegistered: true
  };
  const controller = new LedgerController(
    {
      findUserByOpenId: async () => storedRequester
    },
    {
      sessionCookieName: "delivery_session",
      verifyToken: () => staleAdmin,
      isAdminUser: (user) => user?.roles?.includes("delivery_admin")
    },
    {},
    {},
    {},
    {},
    {}
  );

  await assert.rejects(
    () => controller.fieldPreferences(
      { headers: { cookie: "delivery_session=stale" } },
      undefined
    ),
    (error) => error?.response?.message === "需要管理员权限"
  );
});

test("status bot notifies requesters and assigned administrators only", async () => {
  const messages = [];
  const logs = [];
  const service = new LarkNotificationService(
    {
      readDataset: async () => dataset([{
        "项目名称": "Alpha",
        "获取状态": "已完结",
        "需求人": "需求方甲",
        "项目对接人": "顾语莺、普通协作人"
      }]),
      findUsersByNames: async () => [
        { openId: "ou_requester", name: "需求方甲", role: "requester", roles: ["requester"] },
        { openId: "ou_admin", name: "顾语莺", role: "delivery_admin", roles: ["delivery_admin"] },
        { openId: "ou_collaborator", name: "普通协作人", role: "requester", roles: ["requester"] }
      ],
      appendNotificationLog: async (log) => { logs.push(log); }
    },
    {
      isBotConfigured: () => true,
      sendTextMessage: async (openId, text) => { messages.push({ openId, text }); },
      sendWebhookMessage: async () => false,
      searchUsers: async () => []
    }
  );
  await service.process({
    id: "event-1",
    eventName: "record.updated",
    payload: {
      recordId: "test-1",
      fields: ["获取状态"],
      beforeStatus: "需求澄清中",
      afterStatus: "已完结"
    },
    attempts: 1,
    createdAt: new Date().toISOString()
  });
  assert.deepEqual(messages.map((message) => message.openId).sort(), ["ou_admin", "ou_requester"]);
  assert.equal(messages[0].text.includes("需求澄清中 → 已完结"), true);
  assert.equal(logs[0].status, "sent");
});

test("bot skips non-status record updates", async () => {
  const logs = [];
  const service = new LarkNotificationService(
    { appendNotificationLog: async (log) => logs.push(log) },
    {}
  );
  await service.process({
    id: "event-non-status",
    eventName: "record.updated",
    payload: { recordId: "test-1", fields: ["项目备注"] },
    attempts: 1,
    createdAt: new Date().toISOString()
  });
  assert.equal(logs.length, 1);
  assert.equal(logs[0].status, "skipped");
  assert.match(logs[0].error, /非需求状态变更/);
});

test("Feishu Base webhook validates its secret and schedules the matching table", () => {
  const previous = process.env.LARK_BASE_WEBHOOK_SECRET;
  process.env.LARK_BASE_WEBHOOK_SECRET = "test-sync-secret";
  const scheduled = [];
  const controller = new LedgerController({}, {}, {}, {}, {}, {
    scheduleTableSync: (tableId) => {
      scheduled.push(tableId);
      return tableId === "tbl245" ? { source: "245", tableId } : null;
    }
  });
  try {
    const result = controller.larkBaseWebhook(
      undefined,
      "test-sync-secret",
      { tableId: "tbl245", recordId: "rec1" }
    );
    assert.equal(result.accepted, true);
    assert.equal(result.source, "245");
    assert.deepEqual(scheduled, ["tbl245"]);
  } finally {
    if (previous == null) delete process.env.LARK_BASE_WEBHOOK_SECRET;
    else process.env.LARK_BASE_WEBHOOK_SECRET = previous;
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

test("Feishu administrator search uses tenant contact directory APIs", async () => {
  const requests = [];
  const server = createServer((request, response) => {
    requests.push(request.url);
    response.setHeader("content-type", "application/json");
    if (request.url === "/open-apis/auth/v3/tenant_access_token/internal") {
      response.end(JSON.stringify({ code: 0, tenant_access_token: "tenant-token", expire: 3600 }));
      return;
    }
    if (request.url?.startsWith("/open-apis/contact/v3/departments/0/children")) {
      response.end(JSON.stringify({
        code: 0,
        data: {
          has_more: false,
          items: [{ open_department_id: "od_delivery", name: "交付中心" }]
        }
      }));
      return;
    }
    if (request.url?.includes("/open-apis/contact/v3/users/find_by_department")) {
      const url = new URL(request.url, "http://127.0.0.1");
      const departmentId = url.searchParams.get("department_id");
      response.end(JSON.stringify({
        code: 0,
        data: {
          has_more: false,
          items: departmentId === "od_delivery"
            ? [{
                open_id: "ou_delivery_admin",
                name: "顾语莺",
                email: "admin@example.com",
                department_ids: ["od_delivery"]
              }]
            : []
        }
      }));
      return;
    }
    response.statusCode = 404;
    response.end(JSON.stringify({ code: 404, msg: "not found" }));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const host = `http://127.0.0.1:${address.port}`;
  const keys = ["LARK_APP_ID", "LARK_APP_SECRET", "LARK_REDIRECT_URI", "LARK_API_HOST"];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  Object.assign(process.env, {
    LARK_APP_ID: "test-app",
    LARK_APP_SECRET: "test-secret",
    LARK_REDIRECT_URI: `${host}/callback`,
    LARK_API_HOST: host
  });
  try {
    const lark = new LarkOAuthService();
    const users = await lark.searchUsers("顾语莺");
    assert.deepEqual(users, [{
      openId: "ou_delivery_admin",
      name: "顾语莺",
      email: "admin@example.com",
      department: "交付中心",
      avatar: undefined
    }]);
    assert.equal(requests.some((url) => url?.startsWith("/open-apis/search/v1/user")), false);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    for (const key of keys) {
      if (previous[key] == null) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
});

test("Feishu administrator search tolerates redacted department names", async () => {
  const server = createServer((request, response) => {
    response.setHeader("content-type", "application/json");
    if (request.url === "/open-apis/auth/v3/tenant_access_token/internal") {
      response.end(JSON.stringify({ code: 0, tenant_access_token: "tenant-token", expire: 3600 }));
      return;
    }
    if (request.url?.startsWith("/open-apis/contact/v3/departments/0/children")) {
      response.end(JSON.stringify({
        code: 0,
        data: {
          has_more: false,
          items: [{ open_department_id: "od_delivery" }]
        }
      }));
      return;
    }
    if (request.url?.includes("/open-apis/contact/v3/users/find_by_department")) {
      const url = new URL(request.url, "http://127.0.0.1");
      response.end(JSON.stringify({
        code: 0,
        data: {
          has_more: false,
          items: url.searchParams.get("department_id") === "od_delivery"
            ? [{ open_id: "ou_delivery_admin", name: "顾语莺", department_ids: ["od_delivery"] }]
            : []
        }
      }));
      return;
    }
    response.statusCode = 404;
    response.end(JSON.stringify({ code: 404, msg: "not found" }));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const host = `http://127.0.0.1:${address.port}`;
  const keys = ["LARK_APP_ID", "LARK_APP_SECRET", "LARK_REDIRECT_URI", "LARK_API_HOST"];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  Object.assign(process.env, {
    LARK_APP_ID: "test-app",
    LARK_APP_SECRET: "test-secret",
    LARK_REDIRECT_URI: `${host}/callback`,
    LARK_API_HOST: host
  });
  try {
    const lark = new LarkOAuthService();
    assert.deepEqual(await lark.searchUsers("顾语莺"), [{
      openId: "ou_delivery_admin",
      name: "顾语莺",
      email: undefined,
      department: undefined,
      avatar: undefined
    }]);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    for (const key of keys) {
      if (previous[key] == null) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
});

test("Feishu administrator search reports redacted user base fields", async () => {
  const server = createServer((request, response) => {
    response.setHeader("content-type", "application/json");
    if (request.url === "/open-apis/auth/v3/tenant_access_token/internal") {
      response.end(JSON.stringify({ code: 0, tenant_access_token: "tenant-token", expire: 3600 }));
      return;
    }
    if (request.url?.startsWith("/open-apis/contact/v3/departments/0/children")) {
      response.end(JSON.stringify({ code: 0, data: { has_more: false, items: [{ open_department_id: "od_delivery" }] } }));
      return;
    }
    if (request.url?.includes("/open-apis/contact/v3/users/find_by_department")) {
      response.end(JSON.stringify({ code: 0, data: { has_more: false, items: [{ open_id: "ou_delivery_admin" }] } }));
      return;
    }
    response.statusCode = 404;
    response.end(JSON.stringify({ code: 404, msg: "not found" }));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const host = `http://127.0.0.1:${address.port}`;
  const keys = ["LARK_APP_ID", "LARK_APP_SECRET", "LARK_REDIRECT_URI", "LARK_API_HOST"];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  Object.assign(process.env, {
    LARK_APP_ID: "test-app",
    LARK_APP_SECRET: "test-secret",
    LARK_REDIRECT_URI: `${host}/callback`,
    LARK_API_HOST: host
  });
  try {
    const lark = new LarkOAuthService();
    await assert.rejects(() => lark.searchUsers("顾语莺"), (error) => {
      assert.equal(error.code, "LARK_CONTACT_USER_FIELDS_REDACTED");
      assert.deepEqual(error.requiredScopes, ["contact:user.base:readonly"]);
      return true;
    });
  } finally {
    await new Promise((resolve) => server.close(resolve));
    for (const key of keys) {
      if (previous[key] == null) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
});

import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { mergeImportedDataset, importBusinessKey } from "../dist/server/ledger/parse-utils.js";
import { analyzeDeliveryEfficiency } from "../dist/server/metrics/delivery-efficiency.service.js";
import { isCompletedStatus } from "../dist/server/metrics/satisfaction.service.js";
import { demandToLedgerFields, normalizeBaseFieldValues, requesterRecords, splitNameList, uniqueRequesterNames } from "../dist/server/core/ledger-utils.js";
import { attachProgress, progressDetail, progressModel, progressStages, progressSummary } from "../dist/server/core/progress.js";
import { applySourceAliasesToDataset, applySourceFieldAliases } from "../dist/server/core/source-fields.js";
import { projectDatasetForAdmin } from "../dist/server/core/admin-views.js";
import { hasAdminRole, mergeAdministrativeRoles, normalizeUserRoles, primaryUserRole } from "../dist/server/core/user-roles.js";
import { LarkOAuthService } from "../dist/server/auth/lark-oauth.service.js";
import { AuthService } from "../dist/server/auth/auth.service.js";
import { LarkBaseSyncService } from "../dist/server/sync/lark-base-sync.service.js";
import { LedgerController } from "../dist/server/ledger/ledger.controller.js";
import { LarkNotificationService } from "../dist/server/notifications/lark-notification.service.js";
import { ApiKeyService, hashApiKey } from "../dist/server/api/api-key.service.js";
import { SnapshotService } from "../dist/server/infra/snapshot.service.js";

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
    { "项目名称": "Alpha", "任务代码": "PJ-001", "获取状态": "需求澄清中", "数据来源": "数据团队需求池" }
  ]);
  const incoming = dataset([
    { "项目名称": "Alpha", "任务代码": "PJ-001", "获取状态": "已完结" },
    { "项目名称": "Beta", "任务代码": "PJ-002", "获取状态": "进行中" }
  ]);
  const result = mergeImportedDataset(existing, incoming, "数据团队总表");

  assert.deepEqual(result.summary, { total: 2, inserted: 1, updated: 1, unchanged: 0, conflicts: 0 });
  assert.equal(result.dataset.records.length, 2);
  assert.equal(result.dataset.records[0].fields["获取状态"], "已完结");
  assert.equal(result.dataset.records[0].fields["数据来源"], "数据团队需求池、数据团队总表");
});

test("incremental import reports duplicate business keys", () => {
  const incoming = dataset([
    { "任务代码": "PJ-003", "项目名称": "Gamma" },
    { "任务代码": "PJ-003", "项目名称": "Gamma updated" }
  ]);
  const result = mergeImportedDataset(dataset([]), incoming, "数据团队总表");
  assert.equal(result.summary.conflicts, 1);
  assert.equal(result.dataset.records.length, 1);
});

test("Feishu Base timestamps become ledger date strings", () => {
  // Base returns every date and datetime field as epoch milliseconds. Writing that through unchanged
  // would replace 需求提出时间 and 期望交付日期 — both requester-visible — with a bare number.
  const normalized = normalizeBaseFieldValues({
    "需求提出时间": 1785715200000,
    "供应商承诺交付时期": "1785715200000",
    "期望交付日期": "最大值（待填）",
    "签收交付量（GB）": 1024,
    "预算金额": 1785715200000
  });
  assert.equal(normalized["需求提出时间"], "2026/08/03");
  assert.equal(normalized["供应商承诺交付时期"], "2026/08/03");
  // A text column that merely happens to be named like a date keeps whatever a person typed.
  assert.equal(normalized["期望交付日期"], "最大值（待填）");
  // Quantities and money are never converted, however large: only date-named columns are candidates.
  assert.equal(normalized["签收交付量（GB）"], 1024);
  assert.equal(normalized["预算金额"], 1785715200000);
});

test("zero-width characters never split one status into two buckets", () => {
  // Measured on the live Base: 采购调研中 appeared 7 times clean and 18 times with a trailing U+200B,
  // which the stage view counted as two unrelated statuses and the client coloured as neither.
  const normalized = normalizeBaseFieldValues({
    "\u83b7\u53d6\u72b6\u6001": "\u91c7\u8d2d\u8c03\u7814\u4e2d\u200b",
    "\u9879\u76ee\u540d\u79f0": "\ufeff\u8bed\u6599\u91c7\u96c6 ",
    "\u9700\u6c42\u4eba": ["\u5f20\u4e09\u200b", "\u674e\u56db"],
    "\u9884\u7b97\u91d1\u989d": 1024
  });
  assert.equal(normalized["\u83b7\u53d6\u72b6\u6001"], "\u91c7\u8d2d\u8c03\u7814\u4e2d");
  assert.equal(normalized["\u9879\u76ee\u540d\u79f0"], "\u8bed\u6599\u91c7\u96c6");
  assert.deepEqual(normalized["\u9700\u6c42\u4eba"], ["\u5f20\u4e09", "\u674e\u56db"]);
  // Non-text values are handed through untouched.
  assert.equal(normalized["\u9884\u7b97\u91d1\u989d"], 1024);
});

test("date-only Feishu fields keep their calendar day instead of shifting back one", () => {
  // Base anchors date-only fields at UTC midnight, so formatting them in Asia/Shanghai is still the
  // same day, while a real datetime has to be read in Shanghai time or it reports the previous day.
  assert.equal(normalizeBaseFieldValues({ "期望交付时间": Date.UTC(2026, 6, 1) })["期望交付时间"], "2026/07/01");
  assert.equal(
    normalizeBaseFieldValues({ "实际验收通过时间": Date.UTC(2026, 6, 1, 15, 30) })["实际验收通过时间"],
    "2026/07/01"
  );
});

test("source field aliases translate table-specific columns without discarding the original", () => {
  const aliased = applySourceFieldAliases("pool", {
    "需求描述": "示例语音采集需求",
    "需求方": "张三",
    "进展状态": "需求澄清中"
  });
  // The canonical column is what the business key and the requester view read.
  assert.equal(aliased["项目名称"], "示例语音采集需求");
  assert.equal(aliased["需求人"], "张三");
  assert.equal(aliased["获取状态"], "需求澄清中");
  // The source column stays so nothing that was visible in Feishu disappears from the ledger.
  assert.equal(aliased["需求描述"], "示例语音采集需求");
});

test("an alias never overwrites a canonical value the record already carries", () => {
  const aliased = applySourceFieldAliases("pool", { "需求描述": "别名来源", "项目名称": "原始值" });
  assert.equal(aliased["项目名称"], "原始值");
});

test("aliasing a dataset also republishes the field list the merge reads", () => {
  // mergeImportedDataset builds the merged column list from dataset.fields, so a record-only
  // translation would key correctly and then still be filed under the untranslated column name.
  const aliased = applySourceAliasesToDataset("gaofeng", dataset([{ "验收通过交付量（GB）": "12" }]));
  const names = aliased.fields.map((field) => field.name);
  assert.equal(names.includes("验收通过交付量(GB)"), true);
  assert.equal(aliased.records[0].fields["验收通过交付量(GB)"], "12");
});

test("待澄清项目 rows arrive with 需求澄清中 rather than an empty status", () => {
  // The table has no status column at all, so without a default its rows land under 未设置 and
  // vanish from every stage view.
  const aliased = applySourceFieldAliases("clarify", {
    "需求名称": "示例语料采集需求",
    "需求方": "需求方丙",
    "需求部门": "数据部",
    "需求类型": "内部采集"
  });
  assert.equal(aliased["项目名称"], "示例语料采集需求");
  assert.equal(aliased["需求人"], "需求方丙");
  assert.equal(aliased["隶属部门"], "数据部");
  // 需求类型 only ever holds 内部采集 / 外部采集 / 外部采购, which is the 获取渠道 vocabulary.
  assert.equal(aliased["获取渠道"], "内部采集");
  assert.equal(aliased["获取状态"], "需求澄清中");
});

test("a default never overwrites a status the record already carries", () => {
  const aliased = applySourceFieldAliases("clarify", { "需求名称": "已在推进", "获取状态": "验收中" });
  assert.equal(aliased["获取状态"], "验收中");
});

test("the 待澄清项目 default status also reaches the dataset field list", () => {
  const aliased = applySourceAliasesToDataset("clarify", dataset([{ "需求名称": "待澄清一号" }]));
  assert.equal(aliased.fields.map((field) => field.name).includes("获取状态"), true);
  assert.equal(aliased.records[0].fields["获取状态"], "需求澄清中");
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
    { "项目名称": "甲", "项目对接人": "交付管理员乙" },
    { "项目名称": "乙", "项目对接人": "其他管理员" }
  ]);
  const admin = { openId: "ou_admin", name: "交付管理员乙", role: "delivery_admin", roles: ["delivery_admin"] };
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
      "数据来源": "数据团队总表"
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
      "数据来源": "战略语料库获取表"
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

test("OAuth-only administrator list excludes legacy mock identities", async () => {
  const previous = process.env.AUTH_MOCK_ENABLED;
  process.env.AUTH_MOCK_ENABLED = "false";
  const superAdmin = { openId: "ou_super", name: "超级管理员", role: "super_admin", roles: ["super_admin"] };
  const controller = new LedgerController(
    {
      findUserByOpenId: async () => superAdmin,
      listUsers: async () => [
        superAdmin,
        { openId: "ou_delivery", name: "交付管理员", role: "delivery_admin", roles: ["delivery_admin"] },
        { openId: "mock_super-admin", name: "模拟管理员", role: "super_admin", roles: ["super_admin"] }
      ]
    },
    {
      sessionCookieName: "delivery_session",
      verifyToken: () => superAdmin,
      isAdminUser: (user) => user?.roles?.some((role) => role === "super_admin" || role === "delivery_admin"),
      hasRole: (user, role) => user?.roles?.includes(role)
    },
    {},
    {},
    {},
    {}
  );
  try {
    const result = await controller.adminUsers({ headers: { cookie: "delivery_session=test" } }, undefined);
    assert.deepEqual(result.users.map((user) => user.openId), ["ou_super", "ou_delivery"]);
  } finally {
    if (previous == null) delete process.env.AUTH_MOCK_ENABLED;
    else process.env.AUTH_MOCK_ENABLED = previous;
  }
});

test("five Feishu business tables expose stable online links", () => {
  const keys = [
    "LARK_BASE_WEB_URL",
    "LARK_LEDGER_TABLE_ID",
    "LARK_LEDGER_VIEW_ID",
    "LARK_CLARIFY_TABLE_ID",
    "LARK_CLARIFY_VIEW_ID",
    "LARK_POOL_TABLE_ID",
    "LARK_POOL_VIEW_ID",
    "LARK_CORPUS_TABLE_ID",
    "LARK_CORPUS_VIEW_ID",
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
    LARK_CLARIFY_TABLE_ID: "clarify-table",
    LARK_CLARIFY_VIEW_ID: "clarify-view",
    LARK_POOL_TABLE_ID: "pool-table",
    LARK_POOL_VIEW_ID: "pool-view",
    LARK_CORPUS_TABLE_ID: "corpus-table",
    LARK_CORPUS_VIEW_ID: "corpus-view",
    LARK_GAOFENG_TABLE_ID: "gaofeng-table",
    LARK_GAOFENG_VIEW_ID: "gaofeng-view"
  });
  delete process.env.LARK_245_TABLE_ID;
  delete process.env.LARK_245_VIEW_ID;
  try {
    const service = new LarkBaseSyncService({}, {}, {});
    const sources = service.sourceConfigurations();
    assert.deepEqual(sources.map((source) => source.key), ["clarify", "pool", "corpus", "gaofeng", "ledger"]);
    assert.equal(sources.every((source) => source.configured), true);
    assert.equal(sources[0].url, "https://example.feishu.cn/wiki/base-node?table=clarify-table&view=clarify-view");
    assert.equal(sources[4].url, "https://example.feishu.cn/wiki/base-node?table=ledger-table&view=ledger-view");
  } finally {
    for (const key of keys) {
      if (previous[key] == null) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
});

test("the retired LARK_245_* configuration still points at 战略语料库获取表", () => {
  const keys = ["LARK_CORPUS_TABLE_ID", "LARK_CORPUS_VIEW_ID", "LARK_245_TABLE_ID", "LARK_245_VIEW_ID"];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  delete process.env.LARK_CORPUS_TABLE_ID;
  delete process.env.LARK_CORPUS_VIEW_ID;
  Object.assign(process.env, { LARK_245_TABLE_ID: "legacy-table", LARK_245_VIEW_ID: "legacy-view" });
  try {
    // The table was renamed, not replaced. A deployment that still carries the old variable names
    // must keep syncing the same table instead of silently falling back to the built-in default.
    const corpus = new LarkBaseSyncService({}, {}, {}).sourceConfigurations().find((source) => source.key === "corpus");
    assert.equal(corpus.tableId, "legacy-table");
    assert.equal(corpus.viewId, "legacy-view");
    assert.equal(corpus.source, "战略语料库获取表");
  } finally {
    for (const key of keys) {
      if (previous[key] == null) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
});

test("the Feishu share form is published only when configured with an https URL", async () => {
  const previous = process.env.LARK_REQUEST_FORM_URL;
  const controller = new LedgerController(
    {},
    { sessionCookieName: "delivery_session", verifyToken: () => null, mockLoginUsers: () => [] },
    { isConfigured: () => true },
    {},
    {},
    {},
    {}
  );
  const session = async () => (await controller.me({ headers: {} })).requestFormUrl;
  try {
    process.env.LARK_REQUEST_FORM_URL = "https://aicarrier.feishu.cn/share/base/form/shr-test";
    assert.equal(await session(), "https://aicarrier.feishu.cn/share/base/form/shr-test");

    // The value lands in an anchor href, so anything that is not plain https must not be published.
    process.env.LARK_REQUEST_FORM_URL = "javascript:alert(1)";
    assert.equal(await session(), "");
    process.env.LARK_REQUEST_FORM_URL = "not a url";
    assert.equal(await session(), "");

    // Unconfigured means the entry point disappears rather than rendering a dead link.
    delete process.env.LARK_REQUEST_FORM_URL;
    assert.equal(await session(), "");
  } finally {
    if (previous == null) delete process.env.LARK_REQUEST_FORM_URL;
    else process.env.LARK_REQUEST_FORM_URL = previous;
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
        source: "数据团队总表",
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

test("five Feishu business tables merge serially, with 数据团队总表 last", async () => {
  const keys = [
    "LARK_BASE_TOKEN",
    "LARK_LEDGER_TABLE_ID",
    "LARK_CLARIFY_TABLE_ID",
    "LARK_POOL_TABLE_ID",
    "LARK_CORPUS_TABLE_ID",
    "LARK_GAOFENG_TABLE_ID"
  ];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  Object.assign(process.env, {
    LARK_BASE_TOKEN: "base-token",
    LARK_LEDGER_TABLE_ID: "ledger-table",
    LARK_CLARIFY_TABLE_ID: "clarify-table",
    LARK_POOL_TABLE_ID: "pool-table",
    LARK_CORPUS_TABLE_ID: "corpus-table",
    LARK_GAOFENG_TABLE_ID: "gaofeng-table"
  });
  let stored = dataset([]);
  const reads = [];
  const service = new LarkBaseSyncService(
    {
      // Every read is a fresh snapshot, exactly as the Mongo-backed store behaves: it rebuilds records
      // from documents. Handing out the live object instead would let an in-place write mutate a
      // caller's earlier snapshot, and the whole-round status diff compares two such snapshots.
      readDataset: async () => structuredClone(stored),
      saveDataset: async (next) => { stored = next; },
      // Mirrors the real store: applies only the changed records and never deletes, which is what
      // stops a sync from wiping a requirement submitted while it was running.
      writeChangedRecords: async (changed, fields) => {
        const byKey = new Map(stored.records.map((record) => [importBusinessKey(record.fields || {}), record]));
        for (const record of changed) {
          const key = importBusinessKey(record.fields || {});
          const current = byKey.get(key);
          if (current) current.fields = record.fields;
          else { stored.records.push(record); byKey.set(key, record); }
        }
        if (fields?.length) stored.fields = fields;
        return changed.length;
      },
      publishDataVersion: async () => {},
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
    assert.deepEqual(reads, ["clarify-table", "pool-table", "corpus-table", "gaofeng-table", "ledger-table"]);
    assert.deepEqual(
      results.map((item) => item.source),
      ["待澄清项目", "数据团队需求池", "战略语料库获取表", "高峰项目获取表", "数据团队总表"]
    );
    // mergeFields is last-writer-wins, so the order above is what makes 数据团队总表 authoritative on
    // delivery progress rather than whichever table happened to be read last.
    assert.equal(stored.records[0].fields["获取状态"], "ledger-table");
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
    "LARK_CLARIFY_TABLE_ID",
    "LARK_POOL_TABLE_ID",
    "LARK_CORPUS_TABLE_ID",
    "LARK_GAOFENG_TABLE_ID"
  ];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  Object.assign(process.env, {
    LARK_BASE_TOKEN: "base-token",
    LARK_LEDGER_TABLE_ID: "ledger-table",
    LARK_CLARIFY_TABLE_ID: "clarify-table",
    LARK_POOL_TABLE_ID: "pool-table",
    LARK_CORPUS_TABLE_ID: "corpus-table",
    LARK_GAOFENG_TABLE_ID: "gaofeng-table"
  });
  let stored = dataset([]);
  const service = new LarkBaseSyncService(
    {
      // Every read is a fresh snapshot, exactly as the Mongo-backed store behaves: it rebuilds records
      // from documents. Handing out the live object instead would let an in-place write mutate a
      // caller's earlier snapshot, and the whole-round status diff compares two such snapshots.
      readDataset: async () => structuredClone(stored),
      saveDataset: async (next) => { stored = next; },
      // Mirrors the real store: applies only the changed records and never deletes, which is what
      // stops a sync from wiping a requirement submitted while it was running.
      writeChangedRecords: async (changed, fields) => {
        const byKey = new Map(stored.records.map((record) => [importBusinessKey(record.fields || {}), record]));
        for (const record of changed) {
          const key = importBusinessKey(record.fields || {});
          const current = byKey.get(key);
          if (current) current.fields = record.fields;
          else { stored.records.push(record); byKey.set(key, record); }
        }
        if (fields?.length) stored.fields = fields;
        return changed.length;
      },
      publishDataVersion: async () => {},
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
    assert.deepEqual(
      results.map((item) => item.source),
      ["待澄清项目", "数据团队需求池", "战略语料库获取表", "数据团队总表"]
    );
    assert.equal(stored.records.length, 4);
    assert.match(service.status().lastError, /高峰项目获取表：not_found/);
    assert.equal(service.status().sources.find((source) => source.source === "高峰项目获取表").lastError, "not_found");
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
    "LARK_CLARIFY_TABLE_ID",
    "LARK_POOL_TABLE_ID",
    "LARK_CORPUS_TABLE_ID",
    "LARK_GAOFENG_TABLE_ID"
  ];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  Object.assign(process.env, {
    LARK_BASE_TOKEN: "base-token",
    LARK_LEDGER_TABLE_ID: "ledger-table",
    LARK_CLARIFY_TABLE_ID: "clarify-table",
    LARK_POOL_TABLE_ID: "pool-table",
    LARK_CORPUS_TABLE_ID: "corpus-table",
    LARK_GAOFENG_TABLE_ID: "gaofeng-table"
  });
  let stored = dataset([
    { "任务代码": "PJ-001", "项目名称": "Alpha", "获取状态": "需求澄清中" }
  ]);
  let upstreamStatus = "已完结";
  const events = [];
  const service = new LarkBaseSyncService(
    {
      // Every read is a fresh snapshot, exactly as the Mongo-backed store behaves: it rebuilds records
      // from documents. Handing out the live object instead would let an in-place write mutate a
      // caller's earlier snapshot, and the whole-round status diff compares two such snapshots.
      readDataset: async () => structuredClone(stored),
      saveDataset: async (next) => { stored = next; },
      // Mirrors the real store: applies only the changed records and never deletes, which is what
      // stops a sync from wiping a requirement submitted while it was running.
      writeChangedRecords: async (changed, fields) => {
        const byKey = new Map(stored.records.map((record) => [importBusinessKey(record.fields || {}), record]));
        for (const record of changed) {
          const key = importBusinessKey(record.fields || {});
          const current = byKey.get(key);
          if (current) current.fields = record.fields;
          else { stored.records.push(record); byKey.set(key, record); }
        }
        if (fields?.length) stored.fields = fields;
        return changed.length;
      },
      publishDataVersion: async () => {},
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
    // Five sources touched this key in the same round; the diff runs once at the end, so the record
    // is attributed to the source that actually won the merge rather than to every source in turn.
    assert.equal(statusEvents[0].payload.source, "数据团队总表");
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
    "LARK_CLARIFY_TABLE_ID",
    "LARK_POOL_TABLE_ID",
    "LARK_CORPUS_TABLE_ID",
    "LARK_GAOFENG_TABLE_ID"
  ];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  Object.assign(process.env, {
    LARK_BASE_TOKEN: "base-token",
    LARK_LEDGER_TABLE_ID: "ledger-table",
    LARK_CLARIFY_TABLE_ID: "clarify-table",
    LARK_POOL_TABLE_ID: "pool-table",
    LARK_CORPUS_TABLE_ID: "corpus-table",
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
      // Every read is a fresh snapshot, exactly as the Mongo-backed store behaves: it rebuilds records
      // from documents. Handing out the live object instead would let an in-place write mutate a
      // caller's earlier snapshot, and the whole-round status diff compares two such snapshots.
      readDataset: async () => structuredClone(stored),
      saveDataset: async (next) => { stored = next; },
      // Mirrors the real store: applies only the changed records and never deletes, which is what
      // stops a sync from wiping a requirement submitted while it was running.
      writeChangedRecords: async (changed, fields) => {
        const byKey = new Map(stored.records.map((record) => [importBusinessKey(record.fields || {}), record]));
        for (const record of changed) {
          const key = importBusinessKey(record.fields || {});
          const current = byKey.get(key);
          if (current) current.fields = record.fields;
          else { stored.records.push(record); byKey.set(key, record); }
        }
        if (fields?.length) stored.fields = fields;
        return changed.length;
      },
      publishDataVersion: async () => {},
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
    // 高峰项目获取表 is not authorized yet, so only the other four tables establish a baseline.
    await service.syncAll("系统启动同步");
    const baselineAfterStart = service.status();
    assert.equal(baselineAfterStart.notificationBaselineReady, false);
    assert.equal(baselineAfterStart.sources.find((item) => item.source === "高峰项目获取表").notificationBaseline, false);
    assert.equal(baselineAfterStart.sources.find((item) => item.source === "数据团队总表").notificationBaseline, true);

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
    assert.equal(statusEvents[0].payload.source, "高峰项目获取表");
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
        "项目对接人": "交付管理员乙、普通协作人"
      }]),
      findUsersByNames: async () => [
        { openId: "ou_requester", name: "需求方甲", role: "requester", roles: ["requester"] },
        { openId: "ou_admin", name: "交付管理员乙", role: "delivery_admin", roles: ["delivery_admin"] },
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
      return tableId === "tblCorpus" ? { source: "战略语料库获取表", tableId } : null;
    }
  });
  try {
    const result = controller.larkBaseWebhook(
      undefined,
      "test-sync-secret",
      { tableId: "tblCorpus", recordId: "rec1" }
    );
    assert.equal(result.accepted, true);
    assert.equal(result.source, "战略语料库获取表");
    assert.deepEqual(scheduled, ["tblCorpus"]);
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
                name: "交付管理员乙",
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
    const users = await lark.searchUsers("交付管理员乙");
    assert.deepEqual(users, [{
      openId: "ou_delivery_admin",
      name: "交付管理员乙",
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
            ? [{ open_id: "ou_delivery_admin", name: "交付管理员乙", department_ids: ["od_delivery"] }]
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
    assert.deepEqual(await lark.searchUsers("交付管理员乙"), [{
      openId: "ou_delivery_admin",
      name: "交付管理员乙",
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
    await assert.rejects(() => lark.searchUsers("交付管理员乙"), (error) => {
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

test("每一个线上实际出现的获取状态都能落到某个阶段", () => {
  // Measured on data-panel-dev 2026-08-06. The flat table this replaced covered 18 spellings and
  // reported every one of the other 12 as exactly 60%.
  const live = ["已完结", "验收中", "解决方案中", "需求取消", "数据采集中", "pending", "返工", "需求澄清中",
    "历史已入库", "已有", "内采排队中", "待结算", "采购调研中", "数据标注中", "转语料库执行", "供应商选择中",
    "标注中", "合同OA审批中", "采集中", "采购中", "已停滞", "数据采购中", "方案审批中"];
  for (const status of live) {
    const detail = progressDetail({ record_id: "x", fields: { "获取状态": status } });
    const placed = detail.stageKey != null || detail.outcome === "cancelled";
    assert.equal(placed, true, `${status} 没有落到任何阶段`);
  }
});

test("阶段区间互不重叠且单调递增，0% 与 100% 都是专用值", () => {
  // 0% is reserved for requirements that cannot be placed, and 100% for delivered ones only, so the
  // ladder starts at 3 and 结算收尾 deliberately tops out at 99 — a requirement still being settled
  // must never be able to report 100%.
  assert.equal(progressStages[0].start, 3);
  assert.equal(progressStages.at(-1).end, 100);
  assert.equal(progressStages.at(-1).key, "closed");
  for (let index = 1; index < progressStages.length; index += 1) {
    const previous = progressStages[index - 1];
    const current = progressStages[index];
    assert.equal(current.start >= previous.end, true, `第 ${index} 段与上一段重叠`);
    assert.equal(current.end >= current.start, true, `第 ${index} 段区间为负`);
  }
  // Only the terminal stage may reach 100.
  for (const stage of progressStages.slice(0, -1)) {
    assert.equal(stage.end < 100, true, `${stage.key} 的上限触达了 100%`);
  }
  // No status may be claimed by two stages, or the percentage would depend on iteration order.
  const seen = new Set();
  for (const stage of progressStages) {
    for (const status of stage.statuses) {
      assert.equal(seen.has(status), false, `${status} 被两个阶段同时声明`);
      seen.add(status);
    }
  }
});

test("里程碑证据把同一状态的需求拉开差距", () => {
  const at = (fields) => progressDetail({ record_id: "x", fields }).percent;
  const none = at({ "获取状态": "数据采集中" });
  const one = at({ "获取状态": "数据采集中", "开始执行时间": "2026/03/01" });
  const both = at({ "获取状态": "数据采集中", "开始执行时间": "2026/03/01", "期望交付日期": "2026/09/01" });
  assert.equal(none < one && one < both, true, `进度未随里程碑递增：${none}/${one}/${both}`);
  assert.equal(none, 58);
  assert.equal(both, 80);
  // 期望交付日期 is a text column in the 总表 and really does hold this placeholder.
  assert.equal(at({ "获取状态": "数据采集中", "开始执行时间": "2026/03/01", "期望交付日期": "最大值（待填）" }), one);
});

test("返工与阻塞不会被里程碑推到阶段顶部", () => {
  const rework = progressDetail({ record_id: "x", fields: { "获取状态": "返工", "开始执行时间": "2026/03/01", "期望交付日期": "2026/09/01" } });
  assert.deepEqual(rework.flags, ["rework"]);
  // Capped at the band midpoint: without the cap this would report 80%.
  assert.equal(rework.percent, 69);
  const blocked = progressDetail({ record_id: "x", fields: { "获取状态": "数据采集中", "阻塞项": "供应商未交付" } });
  assert.deepEqual(blocked.flags, ["blocked"]);
});

test("取消的需求不再算作 100%，也不进平均值", () => {
  // The old flat table scored 需求取消 at 100, which inflated every average it appeared in.
  const cancelled = progressDetail({ record_id: "x", fields: { "获取状态": "需求取消" } });
  assert.equal(cancelled.percent, 0);
  assert.equal(cancelled.outcome, "cancelled");
  assert.equal(cancelled.countsTowardAverage, false);
  const unknown = progressDetail({ record_id: "x", fields: { "获取状态": "" } });
  assert.equal(unknown.outcome, "unknown");
  assert.equal(unknown.countsTowardAverage, false);
});

test("零宽字符污染的状态仍然落在同一个阶段", () => {
  const clean = progressDetail({ record_id: "x", fields: { "获取状态": "解决方案中" } });
  const dirty = progressDetail({ record_id: "x", fields: { "获取状态": "解决方案中​" } });
  assert.equal(dirty.stageKey, clean.stageKey);
  assert.equal(dirty.percent, clean.percent);
});

test("进度汇总的分母是可量化条数，而不是总条数", () => {
  const records = [
    { record_id: "1", fields: { "获取状态": "已完结" } },
    { record_id: "2", fields: { "获取状态": "已完结" } },
    { record_id: "3", fields: { "获取状态": "需求取消" } },
    { record_id: "4", fields: { "获取状态": "" } }
  ];
  const summary = progressSummary(records);
  assert.equal(summary.total, 4);
  assert.equal(summary.measured, 2);
  // 100, not 50: the cancelled and the statusless row are reported separately, not averaged in as 0.
  assert.equal(summary.averagePercent, 100);
  assert.equal(summary.cancelledCount, 1);
  assert.equal(summary.unknownCount, 1);
  assert.equal(summary.measured, summary.total - summary.cancelledCount - summary.unknownCount);
});

test("阶段模型可序列化，浏览器据此复算得到同一个百分比", () => {
  const model = progressModel();
  const serialized = JSON.parse(JSON.stringify(model));
  assert.deepEqual(serialized.stages.map((stage) => stage.key), progressStages.map((stage) => stage.key));
  // The client evaluator is driven entirely by these three pieces; if any went missing it would
  // silently fall back to "未设置" for every record.
  assert.equal(serialized.stages.every((stage) => Array.isArray(stage.statuses) && Array.isArray(stage.evidence)), true);
  assert.equal(typeof serialized.placeholderPattern, "string");
  assert.deepEqual(serialized.cancelledStatuses.includes("需求取消"), true);
});

test("一个需求可以填多位 PM，每位都能看到它", () => {
  const data = dataset([
    { "项目名称": "多 PM 需求", "PM": "张三、李四", "需求人": "需求方甲" },
    { "项目名称": "单 PM 需求", "PM": "赵五", "需求人": "需求方甲" }
  ]);
  // Both PMs of the first requirement resolve it, and neither picks up the other requirement.
  assert.deepEqual(requesterRecords(data, "张三").map((record) => record.fields["项目名称"]), ["多 PM 需求"]);
  assert.deepEqual(requesterRecords(data, "李四").map((record) => record.fields["项目名称"]), ["多 PM 需求"]);
  assert.deepEqual(requesterRecords(data, "赵五").map((record) => record.fields["项目名称"]), ["单 PM 需求"]);
  // Every PM must also appear in the requester roster, or they cannot be selected in the first place.
  const roster = uniqueRequesterNames(data);
  for (const name of ["张三", "李四", "赵五"]) assert.equal(roster.includes(name), true, `${name} 不在需求方名单里`);
});

test("人名列表的分隔符在可见性判定和名单里保持一致", () => {
  // These two used to disagree: visibility split on 、,，;；/ and newline, the roster only on 、,，, so a
  // PM entered with a semicolon could open a requirement they were never offered.
  const data = dataset([{ "项目名称": "分隔符混用", "PM": "张三;李四／王五", "关注人": "赵六\n钱七" }]);
  assert.deepEqual(splitNameList("张三;李四"), ["张三", "李四"]);
  const roster = uniqueRequesterNames(data);
  for (const name of ["张三", "李四", "赵六", "钱七"]) {
    assert.equal(roster.includes(name), true, `${name} 不在名单里`);
    assert.equal(requesterRecords(data, name).length, 1, `${name} 看不到这条需求`);
  }
});

test("提交需求时多位 PM 被规范化成同一种分隔符", () => {
  const fields = demandToLedgerFields(
    { requesterName: "需求方甲", fields: { "需求描述": "多 PM", "是否设置PM": "是", "PM": "张三;李四、张三" } },
    [{ id: "PM", name: "PM" }, { id: "需求人", name: "需求人" }]
  );
  // Deduplicated and re-joined, so the value round-trips through splitNameList unchanged.
  assert.equal(fields["PM"], "张三、李四");
  const notNeeded = demandToLedgerFields(
    { requesterName: "需求方甲", fields: { "需求描述": "无 PM", "是否设置PM": "否", "PM": "张三" } },
    [{ id: "PM", name: "PM" }]
  );
  assert.equal(notNeeded["PM"], "");
});

function apiWithKeys(keys, callback) {
  const previous = process.env.PUBLIC_API_KEYS;
  if (keys == null) delete process.env.PUBLIC_API_KEYS;
  else process.env.PUBLIC_API_KEYS = keys;
  try {
    // ApiKeyService reads the environment in its field initialisers, so it has to be built per case.
    // The store stands in for the database path, which these three cases do not exercise.
    return callback(new ApiKeyService(fakeApiKeyStore()));
  } finally {
    if (previous == null) delete process.env.PUBLIC_API_KEYS;
    else process.env.PUBLIC_API_KEYS = previous;
  }
}

test("未配置 PUBLIC_API_KEYS 时对外 API 关闭，而不是开放", async () => {
  // The single most important property here: this surface serves the whole ledger, so an
  // unconfigured deployment must publish nothing rather than everything.
  await apiWithKeys(null, async (service) => {
    assert.equal(await service.isConfigured(), false);
    assert.equal(await service.resolve("anything"), null);
  });
  await apiWithKeys("", async (service) => assert.equal(await service.isConfigured(), false));
});

test("API Key 支持 name:key 与裸 key 两种写法", async () => {
  await apiWithKeys("bi-team:key-abc-123,key-bare-456", async (service) => {
    assert.equal(service.clientCount(), 2);
    assert.equal((await service.resolve("key-abc-123"))?.name, "bi-team");
    // A bare key still gets a stable name so the rate limiter has something to key on.
    assert.equal((await service.resolve("key-bare-456"))?.name, "client-2");
    assert.equal(await service.resolve("key-abc"), null);
    assert.equal(await service.resolve(""), null);
    // The client name is not a credential and must never authenticate on its own.
    assert.equal(await service.resolve("bi-team"), null);
  });
});

test("限流按客户端独立计数并在窗口内耗尽", () => {
  const previousLimit = process.env.PUBLIC_API_RATE_LIMIT;
  process.env.PUBLIC_API_RATE_LIMIT = "2";
  try {
    apiWithKeys("a:key-a,b:key-b", (service) => {
      assert.equal(service.consume("a").allowed, true);
      assert.equal(service.consume("a").allowed, true);
      assert.equal(service.consume("a").allowed, false);
      // One client exhausting its budget must not spend another client's.
      assert.equal(service.consume("b").allowed, true);
      assert.equal(service.limits().limit, 2);
    });
  } finally {
    if (previousLimit == null) delete process.env.PUBLIC_API_RATE_LIMIT;
    else process.env.PUBLIC_API_RATE_LIMIT = previousLimit;
  }
});

test("进度按未收窄的记录计算，不受字段投影影响", () => {
  // The regression this guards: attachProgress used to run after publicDataset, so it evaluated the
  // milestone columns against a payload that had already dropped them. 缅甸语视频 then read 80% in the
  // browser and 88% through /api/v1 — two answers for one requirement.
  const full = dataset([{
    "项目名称": "缅甸语视频",
    "获取状态": "验收中",
    "需求人": "需求方甲",
    // None of these three survive the requester projection, and all three are stage evidence.
    "实际交付完成日期": "2026/07/01",
    "验收通过交付量(GB)": "12",
    "结算金额": "100000"
  }]);
  const authoritative = progressDetail(full.records[0]);
  assert.equal(authoritative.evidenceFilled, 2);
  assert.equal(authoritative.evidenceTotal, 3);
  assert.equal(authoritative.percent, 88);

  // Simulate the projection: same record_id, evidence columns gone.
  const narrowed = { records: [{ record_id: full.records[0].record_id, fields: { "项目名称": "缅甸语视频", "获取状态": "验收中" } }] };
  const attached = attachProgress(narrowed, full.records);
  assert.equal(attached.records[0].progress.percent, 88);
  assert.equal(attached.records[0].progress.evidenceFilled, 2);
  // The narrowed fields themselves are untouched — nothing the recipient may not see gets added back.
  assert.equal("结算金额" in attached.records[0].fields, false);
  assert.equal("实际交付完成日期" in attached.records[0].fields, false);

  // Without the source records it can only see the narrowed payload, which is the old wrong answer.
  assert.equal(attachProgress(narrowed).records[0].progress.percent, 80);
});

test("附加的进度块不携带逐条重复的阶段梯", () => {
  // 6974 records × 8 stage objects would be 55k redundant objects in one admin payload; the client
  // rebuilds the ladder from stageIndex plus the model it already fetched.
  const attached = attachProgress(dataset([{ "项目名称": "任意", "获取状态": "验收中" }]));
  const progress = attached.records[0].progress;
  assert.equal("stages" in progress, false);
  assert.equal(progress.stageCount, progressStages.length);
  assert.equal(progress.stageIndex >= 0, true);
});

test("写成 :key 的凭据不会变成一个永远匹配不上的 key", async () => {
  // Configuring this means editing a values.yaml in a separate GitOps repo. `:key` (name left blank)
  // used to parse into the literal credential ":key", so every `Bearer key` request 401'd while the
  // startup log still reported one client configured — a typo with no visible cause.
  await apiWithKeys(":key-no-name", async (service) => {
    assert.equal(service.clientCount(), 1);
    assert.equal((await service.resolve("key-no-name"))?.name, "client-1");
  });
  // A name with no key is still dropped: there is no credential to compare against.
  await apiWithKeys("only-a-name:", (service) => assert.equal(service.clientCount(), 0));
  // A colon inside the key is fine — only the first one separates.
  await apiWithKeys("bi:aa:bb:cc", async (service) => assert.equal((await service.resolve("aa:bb:cc"))?.name, "bi"));
});

// Minimal stand-in for LedgerStoreService: models only what ApiKeyService touches, including the
// revoked filter and the keyHash projection the real Mongo queries perform.
function fakeApiKeyStore() {
  const rows = [];
  return {
    rows,
    isMongoReady: () => true,
    async createApiKey(record) {
      if (rows.some((row) => row.keyHash === record.keyHash)) throw new Error("duplicate key hash");
      rows.push({ ...record });
    },
    async listApiKeys() {
      return rows.map(({ keyHash, ...rest }) => rest);
    },
    async findApiKeyByHash(keyHash) {
      return rows.find((row) => row.keyHash === keyHash && !row.revokedAt) || null;
    },
    async revokeApiKey(id) {
      const hit = rows.find((row) => row.id === id && !row.revokedAt);
      if (!hit) return false;
      hit.revokedAt = new Date().toISOString();
      return true;
    },
    async touchApiKey(id) {
      const hit = rows.find((row) => row.id === id);
      if (hit) hit.lastUsedAt = new Date().toISOString();
    }
  };
}

function apiServiceWithStore(store, envKeys = null) {
  const previous = process.env.PUBLIC_API_KEYS;
  if (envKeys == null) delete process.env.PUBLIC_API_KEYS;
  else process.env.PUBLIC_API_KEYS = envKeys;
  try {
    return new ApiKeyService(store);
  } finally {
    if (previous == null) delete process.env.PUBLIC_API_KEYS;
    else process.env.PUBLIC_API_KEYS = previous;
  }
}

test("数据库签发的密钥只以哈希落库，明文只返回一次", () => {
  // This is the point of the database path: adding a caller must not require write access to the
  // GitOps repository, and a database dump must not yield a working credential.
  const store = fakeApiKeyStore();
  const service = apiServiceWithStore(store);
  return service.issue("bi-team", "超级管理员").then(async ({ record, key }) => {
    assert.equal(/^[0-9a-f]{64}$/.test(key), true, "签发的密钥应是 64 位十六进制");
    // No comma, so the value is still safe if someone later pastes it into PUBLIC_API_KEYS.
    assert.equal(key.includes(","), false);
    assert.equal(record.keyHash, hashApiKey(key));
    assert.notEqual(record.keyHash, key);
    // The stored row holds the digest and nothing resembling the plaintext.
    assert.equal(store.rows[0].keyHash, hashApiKey(key));
    assert.equal(JSON.stringify(store.rows[0]).includes(key), false);
    // And the admin listing never carries the digest either.
    const listed = await service.list();
    assert.equal("keyHash" in listed[0], false);
    assert.equal(listed[0].name, "bi-team");
    assert.equal(listed[0].createdBy, "超级管理员");
  });
});

test("数据库密钥可用于鉴权，吊销后立即失效", async () => {
  const store = fakeApiKeyStore();
  const service = apiServiceWithStore(store);
  assert.equal(await service.isConfigured(), false, "没有任何密钥时必须报未启用");
  const { record, key } = await service.issue("ops-bot", "超级管理员");
  assert.equal(await service.isConfigured(), true, "新建密钥应立即生效，无需重启");
  const resolved = await service.resolve(key);
  assert.equal(resolved?.name, "ops-bot");
  assert.equal(resolved?.source, "database");
  // Using it stamps last-used, which is what makes an unused stale key identifiable.
  assert.equal(Boolean(store.rows[0].lastUsedAt), true);
  assert.equal(await service.resolve(`${key}x`), null);
  assert.equal(await service.revoke(record.id), true);
  assert.equal(await service.resolve(key), null, "吊销后必须立即拒绝");
  assert.equal(await service.revoke(record.id), false, "重复吊销应返回 false");
  assert.equal(await service.isConfigured(), false);
});

test("环境变量密钥优先于数据库，且两者可并存", async () => {
  const store = fakeApiKeyStore();
  const service = apiServiceWithStore(store, "env-client:env-key-value");
  const { key } = await service.issue("db-client", "超级管理员");
  const fromEnv = await service.resolve("env-key-value");
  assert.equal(fromEnv?.name, "env-client");
  assert.equal(fromEnv?.source, "env");
  const fromDb = await service.resolve(key);
  assert.equal(fromDb?.name, "db-client");
  assert.equal(fromDb?.source, "database");
  // Rate limiting buckets on the client name, so the two are accounted separately.
  assert.notEqual(fromEnv?.name, fromDb?.name);
});

test("同一个密钥不会被注册两次", async () => {
  // Unique index on keyHash in Mongo; without it, revoking one registration would leave the other
  // working and the credential would appear revoked while still being accepted.
  const store = fakeApiKeyStore();
  const service = apiServiceWithStore(store);
  const { record } = await service.issue("first", "超级管理员");
  await assert.rejects(() => store.createApiKey({ ...record, id: "different-id" }), /duplicate key hash/);
});

test("hashApiKey 是稳定的 SHA-256", () => {
  // Pinned so a future change to the digest cannot silently invalidate every stored credential.
  assert.equal(hashApiKey("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  assert.equal(hashApiKey("abc"), hashApiKey("abc"));
  assert.notEqual(hashApiKey("abc"), hashApiKey("abd"));
  assert.equal(hashApiKey(""), hashApiKey(null));
});

test("同步只写变化的记录，不会覆盖掉同时提交的需求", async () => {
  // 这是「需求方加了需求，第二次登录就看不到了」的根因。
  // 同步过去是 读快照 → 合并 → saveDataset（deleteMany + insertMany 整表覆盖），
  // 在「读」和「写」之间提交的需求会被那份旧快照静默覆盖掉。
  // 一轮同步 5 张源表 = 5 个窗口，每 5 分钟一轮。
  const existing = dataset([
    { "项目名称": "已有需求", "任务代码": "TK0001", "获取状态": "已完结" }
  ]);
  // 同步读到的快照 —— 此刻还没有那条新需求
  const syncSnapshot = structuredClone(existing);

  // 窗口期内需求方提交，落库
  const submitted = { record_id: "import-99", fields: demandToLedgerFields(
    { requesterName: "需求方甲", fields: { "需求描述": "窗口期提交" } },
    [{ id: "项目名称", name: "项目名称" }, { id: "需求人", name: "需求人" }, { id: "需求负责人", name: "需求负责人" }, { id: "获取状态", name: "获取状态" }]
  ) };
  const live = structuredClone(existing);
  live.records.push(submitted);

  // 同步基于旧快照合并，只拿出真正变化的记录
  const merged = mergeImportedDataset(syncSnapshot, dataset([
    { "项目名称": "飞书来的需求", "任务代码": "TK0002", "获取状态": "验收中" }
  ]), "数据团队总表");

  // 关键断言：changed 里只有飞书那条新记录，不包含（也不会抹掉）需求方提交的那条
  assert.equal(merged.changed.length, 1);
  assert.equal(merged.changed[0].fields["任务代码"], "TK0002");
  assert.equal(merged.changed.some((record) => record.fields["需求人"] === "需求方甲"), false);

  // 把 changed 应用到「含新需求」的真实库上，两条都在
  const byKey = new Map(live.records.map((record) => [importBusinessKey(record.fields || {}), record]));
  for (const record of merged.changed) {
    const key = importBusinessKey(record.fields || {});
    if (byKey.has(key)) byKey.get(key).fields = record.fields;
    else live.records.push(record);
  }
  assert.equal(live.records.length, 3);
  assert.equal(requesterRecords(live, "需求方甲").length, 1, "需求方提交的需求必须还在");
  // 反过来，整表覆盖写会丢：这正是修复前的行为
  assert.equal(requesterRecords(merged.dataset, "需求方甲").length, 0);
});

test("合并结果里未变化的记录不会进入 changed", async () => {
  // writeChangedRecords 写的量直接取决于这个：一轮同步只改了 60 条，就该写 60 条，
  // 而不是把 6020 条全部重写一遍。
  const existing = dataset([
    { "项目名称": "Alpha", "任务代码": "TK0001", "获取状态": "已完结", "数据来源": "数据团队总表" },
    { "项目名称": "Beta", "任务代码": "TK0002", "获取状态": "验收中", "数据来源": "数据团队总表" }
  ]);
  const merged = mergeImportedDataset(existing, dataset([
    { "项目名称": "Alpha", "任务代码": "TK0001", "获取状态": "已完结" },
    { "项目名称": "Beta", "任务代码": "TK0002", "获取状态": "待结算" }
  ]), "数据团队总表");
  assert.equal(merged.summary.unchanged, 1);
  assert.equal(merged.summary.updated, 1);
  // 只有 Beta 变了
  assert.deepEqual(merged.changed.map((record) => record.fields["任务代码"]), ["TK0002"]);
  assert.equal(merged.changed[0].fields["获取状态"], "待结算");
});

function withOssEnvironment(overrides, callback) {
  const keys = ["OSS_ACCESS_KEY_ID", "OSS_ACCESS_KEY_SECRET", "OSS_BUCKET", "OSS_ENDPOINT", "OSS_PREFIX"];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  for (const key of keys) delete process.env[key];
  Object.assign(process.env, overrides);
  try {
    return callback(new SnapshotService());
  } finally {
    for (const key of keys) {
      if (previous[key] == null) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
}

test("未配置对象存储时快照静默跳过，不阻塞写入", async () => {
  // 这是刻意的：备份是安全网，安全网不可用不该让本来合法的写入失败。
  const result = await withOssEnvironment({}, async (service) => {
    assert.equal(service.isConfigured(), false);
    return service.capture("test", [{ record_id: "1", fields: {} }]);
  });
  assert.equal(result, null);
});

test("对象存储配置齐全才算启用", () => {
  const full = { OSS_ACCESS_KEY_ID: "ak", OSS_ACCESS_KEY_SECRET: "sk", OSS_BUCKET: "b", OSS_ENDPOINT: "oss-cn-shanghai.aliyuncs.com" };
  withOssEnvironment(full, (service) => assert.equal(service.isConfigured(), true));
  // 缺任何一项都不算启用，避免半配置状态下以为有备份其实没有
  for (const missing of Object.keys(full)) {
    const partial = { ...full };
    delete partial[missing];
    withOssEnvironment(partial, (service) => assert.equal(service.isConfigured(), false, `缺 ${missing} 时不应算启用`));
  }
});

test("describe() 只报桶名与 endpoint，绝不泄露密钥", () => {
  withOssEnvironment({
    OSS_ACCESS_KEY_ID: "LTAI-should-never-appear",
    OSS_ACCESS_KEY_SECRET: "secret-should-never-appear",
    OSS_BUCKET: "my-bucket",
    OSS_ENDPOINT: "https://oss-cn-shanghai.aliyuncs.com/"
  }, (service) => {
    const described = JSON.stringify(service.describe());
    assert.equal(described.includes("should-never-appear"), false, "describe() 泄露了密钥");
    assert.equal(described.includes("my-bucket"), true);
    // endpoint 的协议与尾部斜杠会被剥掉，否则拼出来的 host 会带上 https:// 前缀
    assert.equal(service.describe().endpoint, "oss-cn-shanghai.aliyuncs.com");
  });
});

test("快照前缀可配置，默认落在 data-panel/snapshots 下", () => {
  const base = { OSS_ACCESS_KEY_ID: "ak", OSS_ACCESS_KEY_SECRET: "sk", OSS_BUCKET: "b", OSS_ENDPOINT: "e.com" };
  withOssEnvironment(base, (service) => assert.equal(service.describe().target, "oss://b/data-panel/snapshots"));
  withOssEnvironment({ ...base, OSS_PREFIX: "/custom/path/" }, (service) => {
    // 前后斜杠都剥掉，否则会拼出 oss://b//custom/path//xxx 这样的双斜杠对象名
    assert.equal(service.describe().target, "oss://b/custom/path");
  });
});

test("科学计数法的数量值不会原样显示给用户", () => {
  // 飞书把大数字导出成科学计数法字符串，实测线上 340 条「签收数量（个）」里有 18 条是这个形式。
  // 前端原样 escapeHtml 输出，读者看到的是 5.2398268e+07 —— 看不出这是 5239 万个文件。
  // 这里验证解析逻辑；格式化本身在客户端，用同一套规则。
  const parse = (text) => {
    const clean = String(text).replace(/[\s,]/g, "");
    if (!/^\d+(\.\d+)?(e[+-]?\d+)?$/i.test(clean)) return "";
    const value = Number(clean);
    if (!Number.isFinite(value)) return "";
    return Number.isInteger(value) ? value.toLocaleString("zh-CN") : Number(value.toFixed(2)).toLocaleString("zh-CN");
  };
  assert.equal(parse("5.2398268e+07"), "52,398,268");
  assert.equal(parse("1.648519e+06"), "1,648,519");
  assert.equal(parse("996716"), "996,716");
  assert.equal(parse("1,234"), "1,234");
  // 小数收敛到两位，避免 147.00000000000003 这类浮点噪声
  assert.equal(parse("147.00000000000003"), "147");
  assert.equal(parse("92.456"), "92.46");
  // 这些列里确实混着人写的内容，不能强行当数字解析 —— 返回空串让调用方原样显示
  assert.equal(parse("最大值（待填）"), "");
  assert.equal(parse("待确认"), "");
  assert.equal(parse(""), "");
});

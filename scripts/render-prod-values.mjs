#!/usr/bin/env node
/**
 * 生成一份可直接交给部署同学的 prod values.yaml 片段。
 *
 * 为什么需要这个脚本，而不是手抄一份 dev 配置：
 *
 * - 有些值**必须**每个环境独立。`AUTH_SECRET` 是会话签名密钥，两个环境共用等于 dev 签发的
 *   登录票据在 prod 也有效；`LARK_BASE_WEBHOOK_SECRET` 同理。这两个由脚本现场生成，
 *   而不是从 dev 复制。
 * - 有些值可以复用，因为两个环境用的是同一个飞书应用和同一个 Base（LARK_APP_ID/SECRET、
 *   wiki token、超管白名单）。这些从本地 .env 读出来直接填进去。
 * - 剩下的只有部署侧才知道（prod 域名、独立的 MongoDB / Redis、OSS 桶与凭据），留成
 *   醒目的占位符，填完即可交付。
 *
 * 输出写到文件而不是标准输出：这份内容含真实密钥，打印到终端就会进入
 * shell 历史和各种日志。文件权限设为 600，并落在 .gitignore 覆盖的路径下。
 *
 * 用法：
 *   node scripts/render-prod-values.mjs [输出路径]
 *   node scripts/render-prod-values.mjs --oss-key=... --oss-secret=... --oss-bucket=... --oss-endpoint=...
 *   node scripts/render-prod-values.mjs --domain=data-panel.shlab.tech
 *   node scripts/render-prod-values.mjs --mongo=... --redis=...
 *
 * 这些值从命令行传入而不是写死在脚本里，是为了让填写者自己在本机完成 —— 凭据不必经过
 * 任何聊天记录或工单系统。传了哪几个就填哪几个，其余仍留占位符。
 */
import { randomBytes } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const args = process.argv.slice(2);
const flag = (name) => {
  const hit = args.find((item) => item.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3).trim() : "";
};
const positional = args.find((item) => !item.startsWith("--"));
const outPath = resolve(positional || ".tmp/prod-values.yaml");
const supplied = {
  ossKey: flag("oss-key"),
  ossSecret: flag("oss-secret"),
  ossBucket: flag("oss-bucket"),
  ossEndpoint: flag("oss-endpoint").replace(/^https?:\/\//, "").replace(/\/+$/, ""),
  domain: flag("domain").replace(/^https?:\/\//, "").replace(/\/+$/, ""),
  mongo: flag("mongo"),
  redis: flag("redis")
};

function readEnvFile(path) {
  if (!existsSync(path)) return {};
  const values = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const match = /^([A-Z][A-Z0-9_]*)=(.*)$/.exec(line.trim());
    if (match) values[match[1]] = match[2].trim().replace(/^["']|["']$/g, "");
  }
  return values;
}

const env = readEnvFile(resolve(".env"));
// 只有这几个是「两个环境同一个外部系统」因此可以复用的。
const reusable = ["LARK_APP_ID", "LARK_APP_SECRET", "LARK_WIKI_NODE_TOKEN", "LARK_SUPER_ADMIN_OPEN_IDS"];
const missing = reusable.filter((key) => !env[key]);
// 生产环境必须独立的会话与回调密钥，现场生成，绝不从 dev 复制。
const generated = {
  AUTH_SECRET: randomBytes(32).toString("hex"),
  LARK_BASE_WEBHOOK_SECRET: randomBytes(32).toString("hex")
};

const PLACEHOLDER = "请填写";
const lines = [
  "# data-panel 生产环境配置",
  `# 由 scripts/render-prod-values.mjs 生成。含真实密钥，交付后请删除本文件。`,
  "#",
  "# 空值分两类，交接时不要混淆：",
  `#   1) 标「${PLACEHOLDER}」的 —— 真的缺，必须补上。`,
  "#   2) 值为 \"\" 且行尾带「刻意留空」注释的 —— 空就是正确取值，填了反而会出错。",
  "#      尤其注意 PUBLIC_API_KEYS 和 LEDGER_ALLOW_BULK_DELETE：它们空着表示保护在生效。",
  "",
  "NODE_ENV: \"production\"",
  "HOST: \"0.0.0.0\"",
  "PORT: \"5173\"",
  "",
  "# 本环境独立生成，未复用 dev 的值",
  `AUTH_SECRET: "${generated.AUTH_SECRET}"`,
  "AUTH_MOCK_ENABLED: \"false\"",
  "ADMIN_PASSWORD: \"\"  # 刻意留空：AUTH_MOCK_ENABLED=false 时该口令不生效，填了只是多一份能泄露的密钥",
  "",
  supplied.mongo
    ? `MONGODB_URI: "${supplied.mongo}"`
    : `MONGODB_URI: "${PLACEHOLDER}：prod 独立实例，形如 mongodb://用户:密码@主机:27017/delivery_pipeline?authSource=admin"`,
  "MONGODB_DB: \"delivery_pipeline\"",
  supplied.redis
    ? `REDIS_URL: "${supplied.redis}"`
    : `REDIS_URL: "${PLACEHOLDER}：prod 独立实例，形如 redis://主机:6379"`,
  "",
  "# 与 dev 相同的飞书应用",
  `LARK_APP_ID: "${env.LARK_APP_ID || `${PLACEHOLDER}（本地 .env 未找到）`}"`,
  `LARK_APP_SECRET: "${env.LARK_APP_SECRET || `${PLACEHOLDER}（本地 .env 未找到）`}"`,
  "LARK_AUTH_HOST: \"https://open.feishu.cn\"",
  "LARK_API_HOST: \"https://open.feishu.cn\"",
  supplied.domain
    ? `LARK_REDIRECT_URI: "https://${supplied.domain}/api/auth/lark/callback"`
    : `LARK_REDIRECT_URI: "https://${PLACEHOLDER}prod域名/api/auth/lark/callback"`,
  supplied.domain
    ? `PUBLIC_APP_URL: "https://${supplied.domain}"`
    : `PUBLIC_APP_URL: "https://${PLACEHOLDER}prod域名"`,
  "",
  "# 飞书 Base 五张源表，与 dev 完全相同",
  `LARK_WIKI_NODE_TOKEN: "${env.LARK_WIKI_NODE_TOKEN || "ZqC3whTTXiU2rUkLdRycTtmhnYE"}"`,
  "LARK_BASE_WEB_URL: \"https://aicarrier.feishu.cn/wiki/ZqC3whTTXiU2rUkLdRycTtmhnYE\"",
  "LARK_BASE_TOKEN: \"\"  # 刻意留空：与 LARK_WIKI_NODE_TOKEN 二选一。留空时代码调 wiki/v2/spaces/get_node 自行解析出 Base app_token；两个都填会短路成用这个，wiki token 被忽略",
  "LARK_CLARIFY_TABLE_ID: \"tbl6an8LDTyqqdND\"",
  "LARK_CLARIFY_VIEW_ID: \"\"  # 刻意留空：视图 ID 留空 = 同步整张表。待澄清项目没建过滤视图",
  "LARK_POOL_TABLE_ID: \"tblrdV8pbi1Ny9mJ\"",
  "LARK_POOL_VIEW_ID: \"\"  # 刻意留空：同上，需求池也没建过滤视图",
  "LARK_CORPUS_TABLE_ID: \"tbl6dWpodWYuWNq7\"",
  "LARK_CORPUS_VIEW_ID: \"vew41dhWuZ\"",
  "LARK_GAOFENG_TABLE_ID: \"tbl8iFcCizgi0YrU\"",
  "LARK_GAOFENG_VIEW_ID: \"vewkBG8gpp\"",
  "LARK_LEDGER_TABLE_ID: \"tbl7FrAYMpseNuPA\"",
  "LARK_LEDGER_VIEW_ID: \"vewkBG8gpp\"",
  "",
  "LARK_SYNC_INTERVAL_MS: \"300000\"",
  "LARK_SYNC_CONCURRENCY: \"3\"",
  "# 本环境独立生成，未复用 dev 的值",
  `LARK_BASE_WEBHOOK_SECRET: "${generated.LARK_BASE_WEBHOOK_SECRET}"`,
  "",
  "LARK_WEBHOOK_URL: \"\"  # 刻意留空：可选的群机器人。个人状态通知走应用机器人，填了会额外往群里再发一条",
  "LARK_REQUEST_FORM_URL: \"https://aicarrier.feishu.cn/share/base/form/shrcnVsyjmzWzY4bKZAqmPPL4Yc\"",
  "SATISFACTION_AUTO_GOOD_DAYS: \"7\"",
  "",
  `LARK_SUPER_ADMIN_OPEN_IDS: "${env.LARK_SUPER_ADMIN_OPEN_IDS || `${PLACEHOLDER}（本地 .env 未找到）`}"`,
  "LARK_SUPER_ADMIN_EMAILS: \"\"  # 刻意留空：与 LARK_SUPER_ADMIN_OPEN_IDS 二选一，后者已填。open_id 比邮箱稳定",
  "# 交付管理员没有环境变量，由超级管理员在系统「管理员设置」里从飞书通讯录任命。",
  "# values.yaml 里若还留着 LARK_DELIVERY_ADMIN_OPEN_IDS / EMAILS / NAMES，请删掉：代码已不再读取。",
  "",
  "PUBLIC_API_KEYS: \"\"  # 刻意留空：空 = /api/v1 全部返回 501。这是安全的默认，不要为了「配全」而填上",
  "PUBLIC_API_RATE_LIMIT: \"600\"",
  "PUBLIC_API_RATE_WINDOW_MS: \"60000\"",
  "",
  supplied.ossKey
    ? `OSS_ACCESS_KEY_ID: "${supplied.ossKey}"`
    : `OSS_ACCESS_KEY_ID: "${PLACEHOLDER}：新建 RAM 子账号的 AccessKey ID（务必用轮换后的新值）"`,
  supplied.ossSecret
    ? `OSS_ACCESS_KEY_SECRET: "${supplied.ossSecret}"`
    : `OSS_ACCESS_KEY_SECRET: "${PLACEHOLDER}：对应的 AccessKey Secret"`,
  supplied.ossBucket
    ? `OSS_BUCKET: "${supplied.ossBucket}"`
    : `OSS_BUCKET: "${PLACEHOLDER}：桶名"`,
  supplied.ossEndpoint
    ? `OSS_ENDPOINT: "${supplied.ossEndpoint}"`
    : `OSS_ENDPOINT: "${PLACEHOLDER}：桶所在地域，如 oss-cn-shanghai.aliyuncs.com，不带协议不带桶名"`,
  "OSS_PREFIX: \"data-panel/prod-snapshots\"",
  "LEDGER_ALLOW_BULK_DELETE: \"\"  # 刻意留空：空 = 大批量删除保护开启。置 true 会放行「一次删掉过半台账」，仅在刻意导入小数据集时临时开",
  ""
];

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, lines.join("\n"), "utf8");
chmodSync(outPath, 0o600);

// 只报告结构，不回显任何值。
const text = lines.join("\n");
console.log(`已生成：${outPath}（权限 600）`);
console.log(`  配置项 ${text.split("\n").filter((l) => /^[A-Z]/.test(l)).length} 个`);
console.log(`  现场生成的独立密钥 2 个：AUTH_SECRET、LARK_BASE_WEBHOOK_SECRET`);
console.log(`  从本地 .env 复用 ${reusable.length - missing.length}/${reusable.length} 个：${reusable.filter((k) => env[k]).join("、") || "无"}`);
if (missing.length) console.log(`  ⚠ 本地 .env 缺少：${missing.join("、")} —— 需从 dev 的 values.yaml 取`);
const fromArgs = Object.entries(supplied).filter(([, v]) => v).map(([k]) => k);
if (fromArgs.length) console.log(`  命令行传入 ${fromArgs.length} 项：${fromArgs.join("、")}`);
console.log(`  待填占位符 ${(text.match(new RegExp(PLACEHOLDER, "g")) || []).length} 处`);
console.log("");
console.log("接下来：打开该文件，填掉标有「请填写」的几处，交给部署同学。交付后删除本文件。");

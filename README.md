# 交付管线

这是一个本地项目进展数据看板。外部人员默认以访客模式查询项目进展，内部人员进入管理员模式后可以录入和编辑项目数据。

新版需求已整理为：[交付管线功能建设说明](./docs/交付管线功能建设说明.md)。

部署和飞书集成方案见：[交付管线部署与飞书集成方案](./docs/部署与飞书集成方案.md)。

## 运行

```bash
npm run build
npm run start
```

打开：

```text
http://127.0.0.1:5173
```

同一局域网内的项目成员可访问：

```text
http://10.1.233.119:5173
```

## Docker 部署

复制环境变量模板：

```bash
cp .env.example .env
```

至少修改 `.env` 里的管理员口令：

```text
ADMIN_PASSWORD=你的强口令
```

构建并启动：

```bash
docker compose up -d --build
```

查看日志：

```bash
docker compose logs -f delivery-pipeline
```

停止服务：

```bash
docker compose down
```

Docker Compose 会同时启动应用、PostgreSQL 和 Redis。PostgreSQL 保存台账主数据和台账日志，Redis 用于后续飞书通知、同步任务等异步事件队列；`./data:/app/data` 仍保留为初始化种子数据和降级备份目录。

健康检查：

```bash
curl http://127.0.0.1:5173/healthz
```

监控指标：

```bash
curl http://127.0.0.1:5173/metrics
```

## 查询与筛选

访客模式只显示一个全局查询入口，可按项目名称、任务代码、负责人、项目对接人、部门、状态等信息查询。输入关键词后才显示匹配项目，且只返回公开进展字段。

管理员模式会显示完整看板、全量事项列表和筛选区。筛选字段限制为：

- 获取状态
- 隶属部门
- 部门负责人
- 项目对接人
- 解决方案负责人
- 获取渠道
- 需求提出时间
- 期望交付日期
- Sprint
- 承接方
- 承接方责任人

完成度按「获取状态」统计：已完成/已有类状态数量 ÷ 当前视图总事项数量。右侧状态分布同样来自「获取状态」字段。

## 管理员模式

本地开发默认开启模拟飞书登录：

- 需求方登录：选择或输入模拟需求方姓名，后端写入 session cookie，刷新页面后仍能看到自己的需求。
- 需求方注册：创建一个本地模拟需求方身份，并可提交新需求。
- 管理员登录：当前仍保留口令作为开发兜底，登录成功后同样写入 session cookie。

点击右上角「管理员登录」进入管理员登录弹窗。

默认管理员口令：

```text
admin123
```

也可以启动服务时用环境变量覆盖：

```bash
ADMIN_PASSWORD=你的口令 npm run start
```

进入管理员模式后：

- 点击「导入数据」打开飞书表格字段对应的录入弹窗。
- 获取状态、隶属部门、负责人、获取渠道、Sprint、承接方等字段会提供已有值候选项，也可以直接输入新值。
- 点击表格行右侧「编辑」修改项目。
- 在表格中可直接快速修改「获取状态」。

## 实现技术栈

- 前端：React + TypeScript + Vite。React 页面承载需求方入口、管理员台账、台账日志等交互。
- 后端：NestJS + TypeScript。API 已拆为 Controller、Service、Store 层，便于继续接入鉴权、队列和外部系统。
- 数据存储：PostgreSQL 为主存储，保存台账记录和变更日志；无 `DATABASE_URL` 时自动降级到本地 JSON。
- 异步能力：Redis 用于事件队列，当前记录需求提交、关注人变更、导入和字段更新事件，后续可接飞书通知和同步任务。
- 权限模式：本地通过 session cookie 识别当前用户；需求方只读取本人相关需求，管理员可读取完整 `/api/data` 并写入数据。旧的 `x-admin-token` 仍保留用于接口调试。
- 部署方式：React 构建产物 + NestJS API 单镜像，配套 PostgreSQL、Redis 使用 Docker Compose 部署。
- 生产化预留：真实飞书 OAuth login/callback 入口、飞书通讯录、飞书 Base 同步、Prometheus 指标、Nginx HTTPS 和横向扩容。

## 飞书集成方向

后续正式部署建议接入飞书：

- 登录：当前已实现本地 mock 登录、session cookie 和 `/api/auth/me`；正式环境用飞书 OAuth 替代 mock 登录和管理员口令。
- 人员选择：`需求负责人`、`需求人`、`关注人`、`解决方案负责人` 等字段使用飞书通讯录搜索选择，保存 `open_id`，页面展示姓名。
- 数据：需求提交写入飞书提需求表，交付台账读取和更新飞书总表。
- 通知：新需求、状态变更、关注人变更通过飞书机器人或消息能力通知相关人员。
- 监控：用 `/healthz` 做服务健康检查，用 `/metrics` 接 Prometheus 或其他监控系统。

本地认证接口：

```text
GET  /api/auth/me
POST /api/auth/mock-login
POST /api/auth/logout
GET  /api/auth/lark/login
GET  /api/auth/lark/callback
```

正式接飞书 OAuth 前，需要设置：

```env
AUTH_MOCK_ENABLED=false
LARK_APP_ID=飞书应用 App ID
LARK_APP_SECRET=飞书应用 App Secret
LARK_REDIRECT_URI=https://你的域名/api/auth/lark/callback
```

## 接口写入数据

写接口需要管理员 token。先登录：

```bash
curl -X POST http://127.0.0.1:5173/api/admin/login \
  -H "content-type: application/json" \
  --data '{"password":"admin123"}'
```

新增记录：

```bash
curl -X POST http://127.0.0.1:5173/api/records \
  -H "content-type: application/json" \
  -H "x-admin-token: 上一步返回的token" \
  --data '{"fields":{"项目名称":"示例项目","获取状态":"需求澄清中"}}'
```

访客公开查询：

```bash
curl "http://127.0.0.1:5173/api/search?q=CIRCL"
```

管理员读取完整数据：

```bash
curl http://127.0.0.1:5173/api/data \
  -H "x-admin-token: 上一步返回的token"
```

## 同步飞书数据

```bash
npm run sync
```

同步脚本会读取：

- Wiki token: `ZqC3whTTXiU2rUkLdRycTtmhnYE`
- Table: `tbl7FrAYMpseNuPA`
- View: `vewkBG8gpp`

同步脚本会分页读取所有字段和记录，写入 `data/project-data.json`。

当前本机 `lark-cli` 对该 Wiki 节点没有读权限。需要先确认当前飞书用户或当前飞书应用拥有该 Wiki/Base 的读取权限，然后再运行同步。没有飞书权限时，直接用网页或接口导入导出的 CSV/JSON。

# 交付管线

面向需求方和交付管理员的需求交付系统。需求方通过飞书登录后提交需求并查看本人相关进展；所有管理员查看统一完整台账，并按账号保存自己的词条配置。

## 技术栈

- 前端：React、TypeScript、Vite
- 后端：NestJS、TypeScript
- 主存储：MongoDB
- 异步队列：Redis
- 企业集成：飞书 OAuth、通讯录、机器人消息、Wiki/Base OpenAPI

## 本地运行

```bash
npm install
npm run build
AUTH_MOCK_ENABLED=true npm start
```

打开 `http://127.0.0.1:5173`。未配置 MongoDB 时使用 `data/project-data.json` 作为本地降级数据源；真实数据目录已被 `.gitignore` 排除。

完整依赖环境可使用：

```bash
cp .env.example .env
docker compose up -d --build
```

## 验证

```bash
npm run check
npm test
curl http://127.0.0.1:5173/healthz
curl http://127.0.0.1:5173/metrics
```

## 核心能力

- 飞书 OAuth 自动注册，需求方和管理员权限可叠加
- 需求提交、多需求人、关注人和按需求可选 PM
- 个人需求进度、数据下载、满意度评价、关闭或超时默认五星、低分理由
- 管理员完整台账和个人字段显示偏好
- 四张同步源表的 Excel 增量导入
- 飞书四表（数据团队需求池、战略语料库获取表、高峰项目获取表、数据团队总表）实时 webhook 同步、启动与定时兜底全量同步和在线入口
- 需求方可选择在系统内提交，或直接填写飞书需求表单
- Redis 可靠队列和飞书机器人通知
- 六环节 Q1/Q2 交付效率与交付偏差分析
- 管理员个性化词条拖拽、隐藏与固定列
- MongoDB 台账、日志、用户、导入和通知结果持久化

部署、飞书权限和环境变量说明见 [部署与飞书集成方案](./docs/部署与飞书集成方案.md)。

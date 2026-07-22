# 交付管线

面向需求方和交付管理员的需求交付系统。需求方通过飞书登录后提交需求并查看本人相关进展；管理员按负责人视图维护台账，并可切换到自己的需求工作台。

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
- 个人需求进度、数据下载、满意度评价与超时默认好评
- 按字段负责人拆分的管理员视图和个人字段显示偏好
- 总台账与数据团队总表 Excel 增量导入
- 飞书 Wiki/Base 定时增量同步
- Redis 可靠队列和飞书机器人通知
- MongoDB 台账、日志、用户、导入和通知结果持久化

部署、飞书权限和环境变量说明见 [部署与飞书集成方案](./docs/部署与飞书集成方案.md)。

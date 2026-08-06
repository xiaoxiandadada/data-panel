# 对外 API（/api/v1）

供外部系统调用的只读接口。台账数据仍然只有一个来源（飞书五表 → MongoDB），这一层不写入、不改状态，只把已经同步进来的需求和进度读出去。

## 启用

```bash
# 生成一个 key
openssl rand -hex 32

# 部署环境配置（逗号分隔，可配多个调用方）
PUBLIC_API_KEYS=bi-team:<key1>,ops-bot:<key2>
PUBLIC_API_RATE_LIMIT=600
PUBLIC_API_RATE_WINDOW_MS=60000
```

`name:key` 里的 `name` 不是凭据，只用于日志标注和限流分桶；也可以只写裸 key，此时自动获得 `client-1` 这样的位置名。

**未配置 `PUBLIC_API_KEYS` 时，`/api/v1` 下所有路由返回 501。** 这是刻意的：这个接口吐的是整份需求台账，漏配的部署应该什么都不发布，而不是全部发布。即使请求带了看起来正确的 key 也一样拒绝——因为服务端根本没有可比对的凭据。

## 鉴权

两种写法等价：

```bash
curl -H "Authorization: Bearer $KEY" https://data-panel-dev.shlab.tech/api/v1/requirements
curl -H "X-Api-Key: $KEY"           https://data-panel-dev.shlab.tech/api/v1/requirements
```

key 比对走 `timingSafeEqual`，长度不同直接判否，所以无法通过响应时间区分「key 错」和「key 长度错」。

限流是按调用方独立的固定窗口，响应头带 `X-RateLimit-Remaining` 和 `X-RateLimit-Reset`（后者是 Unix 秒）。超限返回 429。

## 端点

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/v1` | 自描述索引，列出全部端点、可用字段和限流配置 |
| GET | `/api/v1/requirements` | 需求列表，可过滤、排序、分页 |
| GET | `/api/v1/requirements/:key` | 单条，`key` 可以是 `record_id`、`任务代码`、`2026需求编码` 或 `需求编码` |
| GET | `/api/v1/stats` | 总量、状态分布、阶段进度汇总 |
| GET | `/api/v1/progress-stages` | 阶段模型定义，用于自行复算进度 |

先打 `/api/v1` 就能拿到完整的参数说明，不必回来读这份文档。

### 列表参数

| 参数 | 说明 |
| --- | --- |
| `q` | 在 项目名称 / 任务代码 / 编码 / 隶属部门 / 获取状态 / Sprint / 数据来源 中模糊匹配 |
| `status` | 获取状态精确匹配，多值逗号分隔 |
| `stage` | 阶段 key，多值逗号分隔 |
| `outcome` | `delivered` \| `in-progress` \| `cancelled` \| `unknown` |
| `department` | 隶属部门 |
| `person` | 在 需求负责人/需求人/关注人/PM/项目对接人/部门负责人 中匹配任一人名 |
| `pm` | 只在 PM 列匹配。**一个需求可以有多位 PM，任一命中即返回** |
| `channel` / `sprint` / `source` | 获取渠道 / Sprint / 数据来源 |
| `blocked` | `true` 只返回存在阻塞或已停滞的需求 |
| `fields` | 限定返回列，逗号分隔 |
| `page` / `pageSize` | 从 1 开始；`pageSize` 默认 50，上限 200 |
| `sort` | `progress` \| `-progress` \| `name` \| `-name` |

中文参数值记得 URL 编码，`curl` 用 `-G --data-urlencode`。

### 字段范围

返回列是**白名单**，不是整个数据集。台账有 130+ 列，其中包含预算金额、供应商联系人、内部备注等；一个来查交付进度的调用方不该拿到这些。`fields=` 只能在白名单内收窄，写了白名单外的列名会被静默丢弃，不会报错也不会返回。

完整白名单见 `/api/v1` 的 `fields`，当前 21 列：项目名称、任务代码、2026需求编码、获取状态、隶属部门、需求负责人、需求人、关注人、PM、项目对接人、解决方案负责人、部门负责人、获取渠道、Sprint、需求提出时间、期望交付日期、实际交付完成日期、需求文档、满意度、数据来源、专项归口。

## 响应示例

```bash
curl -s -G -H "Authorization: Bearer $KEY" \
  https://data-panel-dev.shlab.tech/api/v1/requirements \
  --data-urlencode "pm=张三" --data-urlencode "pageSize=2"
```

```json
{
  "ok": true,
  "syncedAt": "2026/8/6 16:21:41",
  "total": 29,
  "page": 1,
  "pageSize": 2,
  "pageCount": 15,
  "items": [
    {
      "id": "import-1",
      "taskCode": "TK0001",
      "demandCode": null,
      "name": "缅甸语视频采集",
      "status": "数据采集中",
      "progress": {
        "percent": 69,
        "stageKey": "production",
        "stageLabel": "数据生产",
        "outcome": "in-progress",
        "countsTowardAverage": true,
        "evidenceFilled": 1,
        "evidenceTotal": 2,
        "flags": []
      },
      "pms": ["张三", "李四"],
      "fields": { "项目名称": "缅甸语视频采集", "获取状态": "数据采集中", "PM": "张三、李四" }
    }
  ]
}
```

`pms` 是拆好的数组，调用方不需要自己猜分隔符。

## 进度口径

`percent` 来自阶段模型，不是简单的状态映射。要点：

- **`countsTowardAverage: false` 的行不进任何平均值。** 已取消的需求从来没有交付，旧口径把它算成 100% 会抬高每一个它出现的平均数；状态为空的需求无法定位到阶段，算成 0% 又会压低同一个平均数。两者都单独计数并在 `/api/v1/stats` 里分别报出。
- `/api/v1/stats` 的 `progress.measured` 恒等于 `total - cancelledCount - unknownCount`，可以直接手工复算核对。
- `0%` 专门留给无法量化的需求，`100%` 只有 `closed` 阶段能达到——`结算收尾` 上限是 99%，正在结算的需求永远不会和真的做完的需求报同一个数。
- `flags` 里的 `rework` / `blocked` 会把进度压在所处阶段的中点，不让里程碑把返工或停滞的需求推到阶段顶部。

阶段定义随时可以从 `/api/v1/progress-stages` 取，含每个阶段的区间、归属状态和里程碑列，调用方据此可以完全复算出同一个百分比。详见 [进度阶段模型](./进度阶段模型.md)。

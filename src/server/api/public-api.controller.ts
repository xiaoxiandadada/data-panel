import { Controller, Get, Headers, HttpException, HttpStatus, Param, Query, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import {
  businessKeyFields,
  cell,
  normalizeText,
  requesterVisibilityFields,
  splitNameList,
  stringifyCell
} from "../core/ledger-utils.js";
import { progressDetail, progressModel, progressSummary } from "../core/progress.js";
import type { Dataset, FieldValue, LedgerRecord } from "../core/types.js";
import { LedgerStoreService } from "../infra/ledger-store.service.js";
import { ApiKeyService } from "./api-key.service.js";

/**
 * Columns the outward-facing API publishes. An explicit allow-list rather than "everything in the
 * dataset": the ledger carries 130+ columns including budget figures, supplier contacts and internal
 * remarks, and a caller asking for requirement progress has no business receiving those. `fields=`
 * narrows this list; nothing can widen it.
 */
const apiFields = [
  "项目名称",
  "任务代码",
  "2026需求编码",
  "获取状态",
  "隶属部门",
  "需求负责人",
  "需求人",
  "关注人",
  "PM",
  "项目对接人",
  "解决方案负责人",
  "部门负责人",
  "获取渠道",
  "Sprint",
  "需求提出时间",
  "期望交付日期",
  "实际交付完成日期",
  "需求文档",
  "满意度",
  "数据来源",
  "专项归口"
];

const maxPageSize = 200;

@Controller("api/v1")
export class PublicApiController {
  constructor(
    private readonly store: LedgerStoreService,
    private readonly apiKeys: ApiKeyService
  ) {}

  /** Self-describing index, so a caller can discover the surface without reading this file. */
  @Get()
  index(@Req() request: Request, @Headers("authorization") authorization?: string, @Headers("x-api-key") apiKey?: string) {
    this.authorize(authorization, apiKey);
    const { limit, windowMs } = this.apiKeys.limits();
    return {
      ok: true,
      service: "delivery-pipeline",
      version: "v1",
      auth: "Authorization: Bearer <key>，或 X-Api-Key: <key>",
      rateLimit: { limit, windowMs },
      fields: apiFields,
      endpoints: [
        { method: "GET", path: "/api/v1", description: "本说明" },
        {
          method: "GET",
          path: "/api/v1/requirements",
          description: "需求列表，按业务字段过滤并分页",
          query: {
            q: "在项目名称/任务代码/编码/部门等字段中模糊匹配",
            status: "获取状态精确匹配，多值用逗号分隔",
            stage: "阶段 key（见 /api/v1/progress-stages），多值用逗号分隔",
            outcome: "delivered | in-progress | cancelled | unknown",
            department: "隶属部门",
            person: "在需求负责人/需求人/关注人/PM/项目对接人/部门负责人中匹配任一人名",
            pm: "只在 PM 列匹配；一个需求可有多位 PM，任一命中即返回",
            channel: "获取渠道",
            sprint: "Sprint",
            source: "数据来源（飞书源表名）",
            blocked: "true 只返回存在阻塞或已停滞的需求",
            fields: "限定返回列，逗号分隔，只能从 fields 中取子集",
            page: "从 1 开始，默认 1",
            pageSize: `默认 50，上限 ${maxPageSize}`,
            sort: "progress | -progress | name | -name，默认按台账顺序"
          }
        },
        { method: "GET", path: "/api/v1/requirements/:key", description: "按 record_id、任务代码、2026需求编码 或 需求编码 取单条" },
        { method: "GET", path: "/api/v1/stats", description: "总量、状态分布与阶段进度汇总" },
        { method: "GET", path: "/api/v1/progress-stages", description: "阶段模型定义，用于自行复算进度" }
      ]
    };
  }

  @Get("progress-stages")
  stages(@Headers("authorization") authorization?: string, @Headers("x-api-key") apiKey?: string) {
    this.authorize(authorization, apiKey);
    return { ok: true, model: progressModel() };
  }

  @Get("stats")
  async stats(@Headers("authorization") authorization?: string, @Headers("x-api-key") apiKey?: string) {
    this.authorize(authorization, apiKey);
    const dataset = await this.store.readDataset();
    const records = dataset.records || [];
    const statusCount: Record<string, number> = {};
    for (const record of records) {
      const status = cell(record, "获取状态") || "未设置";
      statusCount[status] = (statusCount[status] || 0) + 1;
    }
    return {
      ok: true,
      syncedAt: dataset.meta?.syncedAt || "",
      totalRecords: records.length,
      statusCount,
      progress: progressSummary(records)
    };
  }

  @Get("requirements")
  async requirements(
    @Query() query: Record<string, string>,
    @Res({ passthrough: true }) response: Response,
    @Headers("authorization") authorization?: string,
    @Headers("x-api-key") apiKey?: string
  ) {
    const client = this.authorize(authorization, apiKey);
    const quota = this.apiKeys.consume(client);
    response.setHeader("X-RateLimit-Remaining", String(quota.remaining));
    response.setHeader("X-RateLimit-Reset", String(Math.round(quota.resetAt / 1000)));
    if (!quota.allowed) {
      throw new HttpException({ ok: false, message: "请求过于频繁，请稍后重试" }, HttpStatus.TOO_MANY_REQUESTS);
    }

    const dataset = await this.store.readDataset();
    const filtered = this.applyFilters(dataset.records || [], query);
    const sorted = this.applySort(filtered, query.sort || "");
    const page = Math.max(Number(query.page || 1) || 1, 1);
    const pageSize = Math.min(Math.max(Number(query.pageSize || 50) || 50, 1), maxPageSize);
    const start = (page - 1) * pageSize;
    const fields = this.requestedFields(query.fields);

    return {
      ok: true,
      syncedAt: dataset.meta?.syncedAt || "",
      total: sorted.length,
      page,
      pageSize,
      pageCount: Math.max(Math.ceil(sorted.length / pageSize), 1),
      items: sorted.slice(start, start + pageSize).map((record) => this.project(record, fields))
    };
  }

  @Get("requirements/:key")
  async requirement(
    @Param("key") key: string,
    @Query("fields") fieldsQuery: string | undefined,
    @Headers("authorization") authorization?: string,
    @Headers("x-api-key") apiKey?: string
  ) {
    this.authorize(authorization, apiKey);
    const dataset = await this.store.readDataset();
    const record = this.findByKey(dataset, key);
    if (!record) throw new HttpException({ ok: false, message: "需求不存在" }, HttpStatus.NOT_FOUND);
    return { ok: true, syncedAt: dataset.meta?.syncedAt || "", item: this.project(record, this.requestedFields(fieldsQuery)) };
  }

  /**
   * Accepts a record id or any of the business keys, because an external caller almost never holds the
   * internal `import-123` id — it holds the 任务代码 or 2026需求编码 it read off the Feishu table.
   */
  private findByKey(dataset: Dataset, key: string): LedgerRecord | null {
    const wanted = normalizeText(key);
    if (!wanted) return null;
    const records = dataset.records || [];
    return records.find((record) => normalizeText(record.record_id) === wanted)
      || records.find((record) => businessKeyFields.some((field) => normalizeText(cell(record, field)) === wanted))
      || null;
  }

  private requestedFields(raw: string | undefined): string[] {
    const requested = String(raw || "").split(",").map((item) => item.trim()).filter(Boolean);
    if (!requested.length) return apiFields;
    // Intersection, never union: an unknown or non-public column is dropped rather than honoured.
    const allowed = new Set(apiFields);
    const narrowed = requested.filter((field) => allowed.has(field));
    return narrowed.length ? narrowed : apiFields;
  }

  private project(record: LedgerRecord, fields: string[]) {
    const detail = progressDetail(record);
    return {
      id: record.record_id,
      taskCode: cell(record, "任务代码") || null,
      demandCode: cell(record, "2026需求编码") || cell(record, "需求编码") || null,
      name: cell(record, "项目名称") || null,
      status: detail.status,
      progress: {
        percent: detail.percent,
        stageKey: detail.stageKey,
        stageLabel: detail.stageLabel,
        outcome: detail.outcome,
        // Names the denominator question for the caller: false means this row is excluded from any
        // average the API reports, so a caller aggregating on their side matches our numbers.
        countsTowardAverage: detail.countsTowardAverage,
        evidenceFilled: detail.evidenceFilled,
        evidenceTotal: detail.evidenceTotal,
        flags: detail.flags
      },
      pms: splitNameList(record.fields?.["PM"]),
      fields: Object.fromEntries(fields.map((field) => [field, stringifyCell(record.fields?.[field] as FieldValue)]))
    };
  }

  private applyFilters(records: LedgerRecord[], query: Record<string, string>): LedgerRecord[] {
    const list = (raw: string | undefined) => String(raw || "").split(",").map((item) => normalizeText(item)).filter(Boolean);
    const statuses = list(query.status);
    const stages = list(query.stage);
    const outcomes = list(query.outcome);
    const department = normalizeText(query.department);
    const person = normalizeText(query.person);
    const pm = normalizeText(query.pm);
    const channel = normalizeText(query.channel);
    const sprint = normalizeText(query.sprint);
    const source = normalizeText(query.source);
    const blockedOnly = String(query.blocked || "").trim().toLowerCase() === "true";
    const text = normalizeText(query.q);
    const searchable = ["项目名称", "任务代码", "2026需求编码", "需求编码", "隶属部门", "获取状态", "Sprint", "数据来源"];

    return records.filter((record) => {
      const detail = progressDetail(record);
      if (statuses.length && !statuses.includes(normalizeText(detail.status))) return false;
      if (stages.length && !stages.includes(normalizeText(detail.stageKey || ""))) return false;
      if (outcomes.length && !outcomes.includes(normalizeText(detail.outcome))) return false;
      if (blockedOnly && !detail.flags.includes("blocked")) return false;
      if (department && normalizeText(cell(record, "隶属部门")) !== department) return false;
      if (channel && normalizeText(cell(record, "获取渠道")) !== channel) return false;
      if (sprint && normalizeText(cell(record, "Sprint")) !== sprint) return false;
      if (source && !splitNameList(record.fields?.["数据来源"]).some((item) => normalizeText(item) === source)) return false;
      if (pm && !splitNameList(record.fields?.["PM"]).some((name) => normalizeText(name) === pm)) return false;
      if (person && !requesterVisibilityFields.some((field) =>
        splitNameList(record.fields?.[field]).some((name) => normalizeText(name) === person))) return false;
      if (text && !searchable.some((field) => normalizeText(cell(record, field)).includes(text))) return false;
      return true;
    });
  }

  private applySort(records: LedgerRecord[], sort: string): LedgerRecord[] {
    const key = sort.replace(/^-/, "");
    if (key !== "progress" && key !== "name") return records;
    const descending = sort.startsWith("-");
    const sorted = [...records].sort((left, right) => {
      if (key === "progress") return progressDetail(left).percent - progressDetail(right).percent;
      return cell(left, "项目名称").localeCompare(cell(right, "项目名称"), "zh-CN");
    });
    return descending ? sorted.reverse() : sorted;
  }

  /** Returns the client name so the rate limiter can attribute the call. */
  private authorize(authorization: string | undefined, apiKey: string | undefined): string {
    if (!this.apiKeys.isConfigured()) {
      throw new HttpException({
        ok: false,
        message: "对外 API 尚未启用：请在部署环境配置 PUBLIC_API_KEYS 后重试",
        code: "PUBLIC_API_DISABLED"
      }, HttpStatus.NOT_IMPLEMENTED);
    }
    const bearer = /^Bearer\s+(.+)$/i.exec(String(authorization || "").trim());
    const client = this.apiKeys.resolve(bearer ? bearer[1] : String(apiKey || ""));
    if (!client) {
      throw new HttpException({
        ok: false,
        message: "缺少或无效的 API Key",
        code: "PUBLIC_API_UNAUTHORIZED"
      }, HttpStatus.UNAUTHORIZED);
    }
    return client.name;
  }
}

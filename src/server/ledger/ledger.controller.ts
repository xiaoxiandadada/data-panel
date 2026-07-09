import { Body, Controller, Get, Headers, HttpCode, HttpException, HttpStatus, Param, Patch, Post, Query, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { AuthService } from "../auth/auth.service.js";
import { LarkOAuthService } from "../auth/lark-oauth.service.js";
import {
  actorFromPayload,
  createLog,
  datasetStats,
  demandToLedgerFields,
  ensureFields,
  metricsText,
  nextRecordId,
  normalizeRecordFields,
  publicDataset,
  requesterRecords,
  searchPublicRecords,
  stringifyCell,
  uniqueRequesterNames
} from "../core/ledger-utils.js";
import type { AppUser, FieldValue, LedgerRecord } from "../core/types.js";
import { LedgerStoreService } from "../infra/ledger-store.service.js";
import { QueueService } from "../infra/queue.service.js";
import { normalizeImport, parseCsv } from "./parse-utils.js";

@Controller()
export class LedgerController {
  constructor(
    private readonly store: LedgerStoreService,
    private readonly auth: AuthService,
    private readonly larkOAuth: LarkOAuthService,
    private readonly queue: QueueService
  ) {}

  @Get("healthz")
  async healthz() {
    const dataset = await this.store.readDataset();
    return {
      ...datasetStats(dataset),
      mongodb: this.store.isMongoReady() ? "ready" : "fallback-json",
      redis: this.queue.isReady() ? "ready" : "disabled"
    };
  }

  @Get("metrics")
  async metrics(@Res() response: Response) {
    const dataset = await this.store.readDataset();
    response.type("text/plain; version=0.0.4; charset=utf-8").send(metricsText(dataset));
  }

  @Get("api/data")
  async data(@Req() request: Request, @Headers("x-admin-token") token?: string) {
    const dataset = await this.store.readDataset();
    return this.isAdminRequest(request, token) ? dataset : publicDataset(dataset);
  }

  @Get("api/search")
  async search(@Query("q") q = "", @Query("limit") limit = "100") {
    const dataset = await this.store.readDataset();
    const safeLimit = Math.min(Math.max(Number(limit || 100), 1), 200);
    return publicDataset(dataset, searchPublicRecords(dataset, q, safeLimit));
  }

  @Get("api/requesters")
  async requesters() {
    const dataset = await this.store.readDataset();
    return { ok: true, requesters: uniqueRequesterNames(dataset) };
  }

  @Get("api/lark/users/search")
  async searchLarkUsers(@Req() request: Request, @Query("q") q = "", @Query("limit") limit = "10") {
    if (!this.currentUser(request)) {
      throw new HttpException({ ok: false, message: "请先通过飞书登录" }, HttpStatus.UNAUTHORIZED);
    }
    if (!this.larkOAuth.isConfigured()) {
      throw new HttpException({ ok: false, message: "飞书应用尚未配置，无法搜索企业通讯录" }, HttpStatus.NOT_IMPLEMENTED);
    }
    const safeLimit = Math.min(Math.max(Number(limit || 10), 1), 20);
    try {
      return { ok: true, users: await this.larkOAuth.searchUsers(q, safeLimit) };
    } catch (error) {
      throw new HttpException({
        ok: false,
        message: error instanceof Error ? error.message : "飞书通讯录搜索失败"
      }, HttpStatus.BAD_GATEWAY);
    }
  }

  @Get("api/my-records")
  async myRecords(@Req() request: Request, @Query("name") name = "") {
    const dataset = await this.store.readDataset();
    const user = this.currentUser(request);
    const requesterName = name || user?.name || "";
    return publicDataset(dataset, requesterRecords(dataset, requesterName));
  }

  @Post("api/admin/login")
  @HttpCode(200)
  async login(@Body() body: { password?: string }, @Res({ passthrough: true }) response: Response) {
    const result = this.auth.login(String(body?.password || ""));
    if (!result.ok) throw new HttpException(result, HttpStatus.UNAUTHORIZED);
    await this.store.upsertUser(result.user);
    this.setSessionCookie(response, result.token);
    return result;
  }

  @Get("api/auth/me")
  me(@Req() request: Request) {
    const user = this.currentUser(request);
    return {
      ok: true,
      authenticated: Boolean(user),
      user,
      larkOAuthEnabled: this.larkOAuth.isConfigured(),
      mockUsers: process.env.AUTH_MOCK_ENABLED === "false" ? [] : this.auth.mockLoginUsers()
    };
  }

  @Post("api/auth/logout")
  @HttpCode(200)
  logout(@Res({ passthrough: true }) response: Response) {
    response.setHeader("Set-Cookie", `${this.auth.sessionCookieName}=; ${this.auth.clearCookieOptions()}`);
    return { ok: true };
  }

  @Post("api/auth/mock-login")
  @HttpCode(200)
  async mockLogin(@Body() body: { name?: string; role?: AppUser["role"]; department?: string; register?: boolean }, @Res({ passthrough: true }) response: Response) {
    if (process.env.AUTH_MOCK_ENABLED === "false") {
      throw new HttpException({ ok: false, message: "当前环境未开启模拟登录" }, HttpStatus.FORBIDDEN);
    }
    const result = this.auth.mockLogin(String(body?.name || ""), {
      role: body?.role,
      department: body?.department,
      register: Boolean(body?.register)
    });
    if (!result.ok) throw new HttpException(result, HttpStatus.UNAUTHORIZED);
    await this.store.upsertUser(result.user);
    this.setSessionCookie(response, result.token);
    return result;
  }

  @Get("api/auth/lark/login")
  larkLogin(@Query("next") next = "/", @Res() response: Response) {
    if (!this.larkOAuth.isConfigured()) {
      response.status(501).json({
        ok: false,
        missing: this.larkOAuth.missingConfig(),
        message: "飞书 OAuth 尚未配置，请先设置 LARK_APP_ID、LARK_APP_SECRET、LARK_REDIRECT_URI。本地开发可使用模拟登录。"
      });
      return;
    }
    response.redirect(this.larkOAuth.authorizationUrl(this.auth.signOAuthState(next)));
  }

  @Get("api/auth/lark/callback")
  async larkCallback(@Query("code") code = "", @Query("state") state = "", @Res() response: Response) {
    if (!code) {
      response.status(400).json({ ok: false, message: "飞书 OAuth 回调缺少 code" });
      return;
    }
    const verifiedState = this.auth.verifyOAuthState(state);
    if (!verifiedState) {
      response.status(400).json({ ok: false, message: "飞书 OAuth state 无效或已过期，请重新登录" });
      return;
    }
    try {
      const user = await this.larkOAuth.exchangeCodeForUser(code);
      await this.store.upsertUser(user);
      this.setSessionCookie(response, this.auth.tokenForUser(user));
      response.redirect(verifiedState.next);
    } catch (error) {
      response.status(502).json({
        ok: false,
        message: error instanceof Error ? error.message : "飞书 OAuth 登录失败"
      });
    }
  }

  @Post("api/requests")
  @HttpCode(200)
  async submitRequest(@Req() request: Request, @Body() payload: Record<string, unknown>) {
    const user = this.currentUser(request);
    const requesterName = String(payload.requesterName || user?.name || "").trim();
    if (!requesterName) throw new HttpException({ ok: false, message: "请先登录需求方账号" }, HttpStatus.UNAUTHORIZED);
    const dataset = await this.store.readDataset();
    ensureFields(dataset, ["需求负责人", "需求人", "关注人"]);
    const record: LedgerRecord = {
      record_id: nextRecordId(dataset.records || []),
      fields: demandToLedgerFields({ ...payload, requesterName }, dataset.fields || [])
    };
    dataset.records = [record, ...(dataset.records || [])];
    dataset.meta = {
      ...(dataset.meta || {}),
      status: "ok",
      syncedAt: new Date().toLocaleString("zh-CN", { hour12: false }),
      message: `需求方提交 ${String(record.fields["项目名称"] || record.record_id)}`
    };
    await this.store.saveDataset(dataset);
    await this.store.appendLog(createLog({
      record_id: record.record_id,
      type: "新需求提交",
      field: "项目名称",
      before: "",
      after: String(record.fields["项目名称"] || record.record_id),
      actor: requesterName,
      role: "requester",
      note: "需求方自助提交，自动进入交付管线"
    }));
    await this.queue.enqueue("request.submitted", { recordId: record.record_id });
    return { ok: true, record, data: publicDataset(dataset, requesterRecords(dataset, requesterName)) };
  }

  @Patch("api/requests/:id/followers")
  async updateFollowers(@Req() request: Request, @Param("id") recordId: string, @Body() payload: { requesterName?: string; followers?: string }) {
    const user = this.currentUser(request);
    const requesterName = String(payload.requesterName || user?.name || "").trim();
    if (!requesterName) throw new HttpException({ ok: false, message: "请先登录需求方账号" }, HttpStatus.UNAUTHORIZED);
    const dataset = await this.store.readDataset();
    ensureFields(dataset, ["需求负责人", "需求人", "关注人"]);
    const record = dataset.records.find((item) => item.record_id === recordId);
    if (!record) throw new HttpException({ ok: false, message: "需求不存在" }, HttpStatus.NOT_FOUND);
    const owner = `${stringifyCell(record.fields["需求负责人"])} ${stringifyCell(record.fields["项目对接人"])}`.toLowerCase();
    if (!owner.includes(requesterName.toLowerCase())) {
      throw new HttpException({ ok: false, message: "只有需求负责人可以维护关注人" }, HttpStatus.FORBIDDEN);
    }
    const beforeFields = { ...(record.fields || {}) };
    record.fields = { ...record.fields, "关注人": String(payload.followers || "").trim() };
    dataset.meta = {
      ...(dataset.meta || {}),
      status: "ok",
      syncedAt: new Date().toLocaleString("zh-CN", { hour12: false }),
      message: `已更新关注人：${String(record.fields["项目名称"] || record.record_id)}`
    };
    await this.store.saveDataset(dataset);
    await this.store.appendFieldChangeLogs(recordId, beforeFields, { "关注人": record.fields["关注人"] }, requesterName, "requester", "需求负责人维护关注人");
    await this.queue.enqueue("followers.updated", { recordId });
    return { ok: true, record, data: publicDataset(dataset, requesterRecords(dataset, requesterName)) };
  }

  @Get("api/records/:id/logs")
  async logs(@Req() request: Request, @Headers("x-admin-token") token: string | undefined, @Param("id") recordId: string) {
    this.requireAdmin(request, token);
    const dataset = await this.store.readDataset();
    if (!dataset.records.some((record) => record.record_id === recordId)) {
      throw new HttpException({ ok: false, message: "记录不存在" }, HttpStatus.NOT_FOUND);
    }
    return { ok: true, logs: await this.store.readLogs(recordId) };
  }

  @Post("api/import")
  @HttpCode(200)
  async importData(
    @Headers("x-admin-token") token: string | undefined,
    @Req() request: Request,
    @Query("dryRun") dryRun: string | undefined,
    @Body() parsedBody: unknown
  ) {
    this.requireAdmin(request, token);
    const contentType = request.headers["content-type"] || "";
    const payload = contentType.includes("text/csv") ? parseCsv(await this.readRawBody(request)) : parsedBody;
    const dataset = normalizeImport(payload);
    if (dryRun === "1") return { ok: true, count: dataset.records.length, data: dataset };
    await this.store.saveDataset(dataset);
    await this.queue.enqueue("dataset.imported", { count: dataset.records.length });
    return { ok: true, count: dataset.records.length, data: dataset };
  }

  @Post("api/records")
  @HttpCode(200)
  async createRecord(@Req() request: Request, @Headers("x-admin-token") token: string | undefined, @Body() payload: { fields?: Record<string, FieldValue>; actor?: string }) {
    this.requireAdmin(request, token);
    const user = this.currentUser(request);
    const dataset = await this.store.readDataset();
    const record: LedgerRecord = {
      record_id: nextRecordId(dataset.records || []),
      fields: normalizeRecordFields(payload.fields || {}, dataset.fields || [])
    };
    dataset.records = [...(dataset.records || []), record];
    dataset.meta = {
      ...(dataset.meta || {}),
      status: "ok",
      syncedAt: new Date().toLocaleString("zh-CN", { hour12: false }),
      message: `本地共 ${dataset.records.length} 条记录`
    };
    await this.store.saveDataset(dataset);
    await this.store.appendLog(createLog({
      record_id: record.record_id,
      type: "管理员新增",
      field: "项目名称",
      before: "",
      after: String(record.fields["项目名称"] || record.record_id),
      actor: actorFromPayload(payload, user?.name || "管理员"),
      role: user?.role || "admin",
      note: "管理员手动新增台账记录"
    }));
    await this.queue.enqueue("record.created", { recordId: record.record_id });
    return { ok: true, record, data: dataset };
  }

  @Patch("api/records/:id")
  async updateRecord(@Req() request: Request, @Headers("x-admin-token") token: string | undefined, @Param("id") recordId: string, @Body() payload: { fields?: Record<string, FieldValue>; actor?: string }) {
    this.requireAdmin(request, token);
    const user = this.currentUser(request);
    const { dataset, beforeFields, record } = await this.store.updateRecord(recordId, payload.fields || {});
    if (!record) throw new HttpException({ ok: false, message: "记录不存在" }, HttpStatus.NOT_FOUND);
    await this.store.appendFieldChangeLogs(recordId, beforeFields, payload.fields || {}, actorFromPayload(payload, user?.name || "管理员"), user?.role || "admin");
    await this.queue.enqueue("record.updated", { recordId, fields: Object.keys(payload.fields || {}) });
    return { ok: true, record, data: dataset };
  }

  private requireAdmin(request: Request, token: string | undefined) {
    if (!this.isAdminRequest(request, token)) {
      throw new HttpException({ ok: false, message: "需要管理员权限" }, HttpStatus.FORBIDDEN);
    }
  }

  private isAdminRequest(request: Request, token: string | undefined): boolean {
    return this.auth.isAdmin(token) || this.auth.isAdminUser(this.currentUser(request));
  }

  private currentUser(request: Request): AppUser | null {
    return this.auth.verifyToken(this.cookieValue(request, this.auth.sessionCookieName));
  }

  private cookieValue(request: Request, name: string): string | undefined {
    const cookieHeader = request.headers.cookie || "";
    return cookieHeader
      .split(";")
      .map((part) => part.trim())
      .map((part) => {
        const separator = part.indexOf("=");
        return separator >= 0 ? [part.slice(0, separator), decodeURIComponent(part.slice(separator + 1))] : [part, ""];
      })
      .find(([key]) => key === name)?.[1];
  }

  private setSessionCookie(response: Response, token: string) {
    response.setHeader("Set-Cookie", `${this.auth.sessionCookieName}=${encodeURIComponent(token)}; ${this.auth.cookieOptions()}`);
  }

  private readRawBody(request: Request): Promise<string> {
    return new Promise((resolveBody, rejectBody) => {
      let body = "";
      request.setEncoding("utf8");
      request.on("data", (chunk: Buffer | string) => {
        body += String(chunk);
        if (body.length > 25 * 1024 * 1024) {
          rejectBody(new Error("导入文件过大"));
        }
      });
      request.on("end", () => resolveBody(body));
      request.on("error", rejectBody);
    });
  }
}

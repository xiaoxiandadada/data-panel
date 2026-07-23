import { Body, Controller, Get, Headers, HttpCode, HttpException, HttpStatus, Param, Patch, Post, Query, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { randomUUID } from "node:crypto";
import { AuthService } from "../auth/auth.service.js";
import { LarkOAuthService } from "../auth/lark-oauth.service.js";
import { canEditAdminFields, canReadLogField, isSuperAdmin, projectDatasetForAdmin } from "../core/admin-views.js";
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
import type { AppUser, FieldValue, ImportBatch, LedgerRecord, UserRole } from "../core/types.js";
import { LedgerStoreService } from "../infra/ledger-store.service.js";
import { QueueService } from "../infra/queue.service.js";
import { isCompletedStatus, SatisfactionService } from "../metrics/satisfaction.service.js";
import { LarkBaseSyncService } from "../sync/lark-base-sync.service.js";
import { mergeImportedDataset, normalizeImport, parseCsv, parseExcel } from "./parse-utils.js";

@Controller()
export class LedgerController {
  constructor(
    private readonly store: LedgerStoreService,
    private readonly auth: AuthService,
    private readonly larkOAuth: LarkOAuthService,
    private readonly queue: QueueService,
    private readonly satisfaction: SatisfactionService,
    private readonly larkSync: LarkBaseSyncService
  ) {}

  @Get("healthz")
  async healthz() {
    const dataset = await this.store.readDataset();
    return {
      ...datasetStats(dataset),
      mongodb: this.store.isMongoReady() ? "ready" : "fallback-json",
      redis: this.queue.isReady() ? "ready" : "disabled",
      larkSync: this.larkSync.isConfigured() ? "configured" : "disabled",
      satisfactionAutoGoodDays: this.satisfaction.getGraceDays()
    };
  }

  @Get("metrics")
  async metrics(@Res() response: Response) {
    const dataset = await this.store.readDataset();
    response.type("text/plain; version=0.0.4; charset=utf-8").send(metricsText(dataset));
  }

  @Get("api/data")
  async data(@Req() request: Request, @Headers("x-admin-token") token?: string, @Query("mode") mode = "") {
    const dataset = await this.store.readDataset();
    const user = this.currentUser(request);
    if (mode === "mine") return publicDataset(dataset, user ? requesterRecords(dataset, user.name) : []);
    const admin = this.adminUser(request, token);
    if (admin) return projectDatasetForAdmin(dataset, admin);
    return publicDataset(dataset, user ? requesterRecords(dataset, user.name) : []);
  }

  @Get("api/search")
  async search(@Req() request: Request, @Query("q") q = "", @Query("limit") limit = "100") {
    const user = this.requireUser(request);
    const dataset = await this.store.readDataset();
    const safeLimit = Math.min(Math.max(Number(limit || 100), 1), 200);
    const allowed = this.auth.isAdminUser(user) ? dataset.records : requesterRecords(dataset, user.name);
    const allowedIds = new Set(allowed.map((record) => record.record_id));
    return publicDataset(dataset, searchPublicRecords(dataset, q, safeLimit).filter((record) => allowedIds.has(record.record_id)));
  }

  @Get("api/requesters")
  async requesters(@Req() request: Request, @Headers("x-admin-token") token?: string) {
    this.requireAdmin(request, token);
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
  async myRecords(@Req() request: Request) {
    const dataset = await this.store.readDataset();
    const user = this.requireUser(request);
    return publicDataset(dataset, requesterRecords(dataset, user.name));
  }

  @Get("api/my-records/export")
  async exportMyRecords(@Req() request: Request, @Res() response: Response) {
    const dataset = await this.store.readDataset();
    const user = this.requireUser(request);
    const records = requesterRecords(dataset, user.name);
    const exported = publicDataset(dataset, records);
    response.setHeader("Content-Type", "text/csv; charset=utf-8");
    response.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent("我的需求.csv")}`);
    response.send(this.datasetCsv(exported));
  }

  @Post("api/admin/login")
  @HttpCode(200)
  async login(@Body() body: { password?: string }, @Res({ passthrough: true }) response: Response) {
    if (process.env.AUTH_MOCK_ENABLED === "false") {
      throw new HttpException({ ok: false, message: "当前环境已关闭管理员口令登录，请使用飞书管理员登录" }, HttpStatus.FORBIDDEN);
    }
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
    const sessionUser = await this.store.findUserByOpenId(result.user.openId) || result.user;
    const token = this.auth.tokenForUser(sessionUser);
    this.setSessionCookie(response, token);
    return { ...result, token, user: sessionUser };
  }

  @Get("api/auth/lark/login")
  larkLogin(@Query("next") next = "/", @Query("adminOnly") adminOnly = "", @Res() response: Response) {
    if (!this.larkOAuth.isConfigured()) {
      response.status(501).json({
        ok: false,
        missing: this.larkOAuth.missingConfig(),
        message: "飞书 OAuth 尚未配置，请先设置 LARK_APP_ID、LARK_APP_SECRET、LARK_REDIRECT_URI。本地开发可使用模拟登录。"
      });
      return;
    }
    this.clearSessionCookie(response);
    response.redirect(this.larkOAuth.authorizationUrl(this.auth.signOAuthState(next, adminOnly === "1")));
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
      const sessionUser = await this.store.findUserByOpenId(user.openId) || user;
      if (verifiedState.adminOnly && !this.auth.isAdminUser(sessionUser)) {
        this.clearSessionCookie(response);
        response.redirect(`${verifiedState.next}${verifiedState.next.includes("?") ? "&" : "?"}auth_error=admin_only`);
        return;
      }
      this.setSessionCookie(response, this.auth.tokenForUser(sessionUser));
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
    const user = this.requireUser(request);
    const requesterName = user.name;
    const dataset = await this.store.readDataset();
    ensureFields(dataset, ["需求负责人", "需求人", "关注人", "PM"]);
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
    await this.queue.enqueue("request.submitted", { recordId: record.record_id, requesterOpenId: user.openId });
    return { ok: true, record, data: publicDataset(dataset, requesterRecords(dataset, requesterName)) };
  }

  @Patch("api/requests/:id/followers")
  async updateFollowers(@Req() request: Request, @Param("id") recordId: string, @Body() payload: { followers?: string }) {
    const user = this.requireUser(request);
    const requesterName = user.name;
    const dataset = await this.store.readDataset();
    ensureFields(dataset, ["需求负责人", "需求人", "关注人", "PM"]);
    const record = dataset.records.find((item) => item.record_id === recordId);
    if (!record) throw new HttpException({ ok: false, message: "需求不存在" }, HttpStatus.NOT_FOUND);
    const owners = ["需求负责人", "项目对接人"]
      .flatMap((field) => stringifyCell(record.fields[field]).split(/[、,，;；/\n]+/))
      .map((name) => name.trim().toLowerCase())
      .filter(Boolean);
    if (!owners.includes(requesterName.toLowerCase())) {
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
    await this.queue.enqueue("followers.updated", { recordId, actorOpenId: user.openId });
    return { ok: true, record, data: publicDataset(dataset, requesterRecords(dataset, requesterName)) };
  }

  @Post("api/requests/:id/satisfaction")
  @HttpCode(200)
  async submitSatisfaction(
    @Req() request: Request,
    @Param("id") recordId: string,
    @Body() payload: { score?: number; comment?: string }
  ) {
    const user = this.requireUser(request);
    const score = Math.round(Number(payload.score || 0));
    if (score < 1 || score > 5) throw new HttpException({ ok: false, message: "满意度必须为 1 到 5 分" }, HttpStatus.BAD_REQUEST);
    const dataset = await this.store.readDataset();
    const record = dataset.records.find((item) => item.record_id === recordId);
    if (!record) throw new HttpException({ ok: false, message: "需求不存在" }, HttpStatus.NOT_FOUND);
    if (!isCompletedStatus(stringifyCell(record.fields["获取状态"]))) {
      throw new HttpException({ ok: false, message: "需求完成后才能评价" }, HttpStatus.BAD_REQUEST);
    }
    if (!requesterRecords({ ...dataset, records: [record] }, user.name).length) {
      throw new HttpException({ ok: false, message: "只能评价与本人相关的需求" }, HttpStatus.FORBIDDEN);
    }
    const before = { ...(record.fields || {}) };
    const fields: Record<string, FieldValue> = {
      "满意度": score,
      "满意度评价": String(payload.comment || "").trim(),
      "满意度评价来源": "需求方主动评价",
      "满意度评价时间": new Date().toISOString()
    };
    const updated = await this.store.updateRecord(recordId, fields);
    await this.store.appendFieldChangeLogs(recordId, before, fields, user.name, "requester", "需求方提交满意度评价");
    await this.queue.enqueue("record.updated", { recordId, fields: Object.keys(fields), actorOpenId: user.openId });
    return { ok: true, record: updated.record, data: publicDataset(updated.dataset, requesterRecords(updated.dataset, user.name)) };
  }

  @Get("api/records/:id/logs")
  async logs(@Req() request: Request, @Headers("x-admin-token") token: string | undefined, @Param("id") recordId: string) {
    this.requireAdmin(request, token);
    const user = this.adminUser(request, token);
    const dataset = await this.store.readDataset();
    if (!dataset.records.some((record) => record.record_id === recordId)) {
      throw new HttpException({ ok: false, message: "记录不存在" }, HttpStatus.NOT_FOUND);
    }
    return { ok: true, logs: (await this.store.readLogs(recordId)).filter((log) => canReadLogField(user, log.field)) };
  }

  @Post("api/import")
  @HttpCode(200)
  async importData(
    @Headers("x-admin-token") token: string | undefined,
    @Headers("x-file-name") fileNameHeader: string | undefined,
    @Req() request: Request,
    @Query("dryRun") dryRun: string | undefined,
    @Query("source") sourceQuery: string | undefined,
    @Body() parsedBody: unknown
  ) {
    this.requireSuperAdmin(request, token);
    const contentType = request.headers["content-type"] || "";
    const fileName = decodeURIComponent(String(fileNameHeader || "").trim() || "数据导入");
    const source = this.importSource(sourceQuery);
    let incoming;
    let mode: ImportBatch["mode"] = "api";
    if (contentType.includes("spreadsheetml") || fileName.toLowerCase().endsWith(".xlsx")) {
      incoming = normalizeImport(await parseExcel(await this.readRawBuffer(request)));
      mode = "excel";
    } else if (contentType.includes("text/csv")) {
      incoming = normalizeImport(parseCsv(await this.readRawBody(request)));
    } else {
      incoming = normalizeImport(parsedBody);
    }
    const existing = await this.store.readDataset();
    const merged = mergeImportedDataset(existing, incoming, source);
    if (dryRun === "1") {
      return {
        ok: true,
        count: incoming.records.length,
        summary: merged.summary,
        fields: incoming.fields,
        preview: incoming.records.slice(0, 20)
      };
    }
    const user = this.currentUser(request);
    const batch: ImportBatch = {
      id: randomUUID(),
      source,
      fileName,
      mode,
      ...merged.summary,
      actor: user?.name || "超级管理员",
      createdAt: new Date().toISOString()
    };
    await this.store.saveDataset(merged.dataset);
    await this.store.appendImportBatch(batch);
    await this.satisfaction.applyDefaults();
    await this.queue.enqueue("dataset.imported", { source, count: incoming.records.length });
    return { ok: true, count: incoming.records.length, summary: merged.summary, batch, data: await this.store.readDataset() };
  }

  @Get("api/import/history")
  async importHistory(@Req() request: Request, @Headers("x-admin-token") token?: string) {
    this.requireSuperAdmin(request, token);
    return { ok: true, batches: await this.store.readImportBatches() };
  }

  @Post("api/sync/lark")
  @HttpCode(200)
  async syncLark(@Req() request: Request, @Headers("x-admin-token") token?: string) {
    this.requireSuperAdmin(request, token);
    const user = this.currentUser(request);
    return { ok: true, results: await this.larkSync.syncAll(user?.name || "超级管理员") };
  }

  @Get("api/sync/lark/sources")
  async larkSyncSources(@Req() request: Request, @Headers("x-admin-token") token?: string) {
    this.requireAdminUser(request, token);
    return {
      ok: true,
      intervalMs: Math.max(Number(process.env.LARK_SYNC_INTERVAL_MS || 300_000), 60_000),
      sources: this.larkSync.sourceConfigurations()
    };
  }

  @Get("api/preferences/fields")
  async fieldPreferences(@Req() request: Request, @Headers("x-admin-token") token?: string) {
    const user = this.requireAdminUser(request, token);
    const dataset = projectDatasetForAdmin(await this.store.readDataset(), user);
    return {
      ok: true,
      fields: dataset.fields.map((field) => field.name || field.id),
      preferences: await this.store.readUserFieldPreferences(user.openId)
    };
  }

  @Patch("api/preferences/fields")
  async updateFieldPreferences(
    @Req() request: Request,
    @Headers("x-admin-token") token: string | undefined,
    @Body() payload: { hiddenFields?: string[]; fieldOrder?: string[]; pinnedFields?: string[] }
  ) {
    const user = this.requireAdminUser(request, token);
    const dataset = projectDatasetForAdmin(await this.store.readDataset(), user);
    const allowed = new Set(dataset.fields.map((field) => field.name || field.id));
    const hiddenFields = (payload.hiddenFields || []).map(String).filter((field) => allowed.has(field));
    const fieldOrder = (payload.fieldOrder || []).map(String).filter((field) => allowed.has(field));
    const hidden = new Set(hiddenFields);
    const pinnedFields = (payload.pinnedFields || [])
      .map(String)
      .filter((field) => allowed.has(field) && !hidden.has(field))
      .slice(0, 4);
    return {
      ok: true,
      preferences: await this.store.saveUserFieldPreferences({ openId: user.openId, hiddenFields, fieldOrder, pinnedFields, updatedAt: "" })
    };
  }

  @Get("api/admin/users")
  async adminUsers(@Req() request: Request, @Headers("x-admin-token") token?: string) {
    this.requireSuperAdmin(request, token);
    return { ok: true, users: await this.store.listUsers() };
  }

  @Patch("api/admin/users/:openId/role")
  async updateUserRole(
    @Req() request: Request,
    @Headers("x-admin-token") token: string | undefined,
    @Param("openId") openId: string,
    @Body() payload: { role?: UserRole; roles?: UserRole[] }
  ) {
    this.requireSuperAdmin(request, token);
    const allowed: UserRole[] = ["requester", "delivery_admin", "super_admin"];
    const roles = Array.isArray(payload.roles) ? payload.roles : payload.role ? [payload.role] : [];
    if (!roles.length || roles.some((role) => !allowed.includes(role))) {
      throw new HttpException({ ok: false, message: "不支持的角色" }, HttpStatus.BAD_REQUEST);
    }
    const target = await this.store.findUserByOpenId(openId);
    const targetIsSuperAdmin = this.auth.hasRole(target, "super_admin");
    if (roles.includes("super_admin") && !targetIsSuperAdmin) {
      throw new HttpException({ ok: false, message: "超级管理员仅通过部署环境配置，不支持在页面新增" }, HttpStatus.FORBIDDEN);
    }
    if (targetIsSuperAdmin && !roles.includes("super_admin")) {
      throw new HttpException({ ok: false, message: "不能移除唯一超级管理员权限" }, HttpStatus.FORBIDDEN);
    }
    const user = await this.store.updateUserRoles(openId, roles);
    if (!user) throw new HttpException({ ok: false, message: "用户不存在或数据库未连接" }, HttpStatus.NOT_FOUND);
    return { ok: true, user };
  }

  @Post("api/records")
  @HttpCode(200)
  async createRecord(@Req() request: Request, @Headers("x-admin-token") token: string | undefined, @Body() payload: { fields?: Record<string, FieldValue>; actor?: string }) {
    this.requireSuperAdmin(request, token);
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
    const admin = this.adminUser(request, token);
    const user = this.currentUser(request);
    const currentDataset = await this.store.readDataset();
    const currentRecord = currentDataset.records.find((item) => item.record_id === recordId);
    if (!currentRecord) throw new HttpException({ ok: false, message: "记录不存在" }, HttpStatus.NOT_FOUND);
    const tracking = this.satisfaction.completionTrackingPatch(currentRecord.fields || {}, payload.fields || {});
    const updatedFields = { ...(payload.fields || {}), ...tracking };
    if (!canEditAdminFields(admin, payload.fields || {})) {
      throw new HttpException({ ok: false, message: "只能维护分配给当前管理员的字段" }, HttpStatus.FORBIDDEN);
    }
    const { dataset, beforeFields, record } = await this.store.updateRecord(recordId, updatedFields);
    if (!record) throw new HttpException({ ok: false, message: "记录不存在" }, HttpStatus.NOT_FOUND);
    await this.store.appendFieldChangeLogs(recordId, beforeFields, updatedFields, actorFromPayload(payload, user?.name || "管理员"), user?.role || "admin");
    await this.queue.enqueue("record.updated", { recordId, fields: Object.keys(updatedFields), actorOpenId: user?.openId || "" });
    const projected = projectDatasetForAdmin(dataset, admin);
    return {
      ok: true,
      record: projected.records.find((item) => item.record_id === recordId),
      data: projected
    };
  }

  private requireAdmin(request: Request, token: string | undefined) {
    if (!this.isAdminRequest(request, token)) {
      throw new HttpException({ ok: false, message: "需要管理员权限" }, HttpStatus.FORBIDDEN);
    }
  }

  private requireAdminUser(request: Request, token: string | undefined): AppUser {
    const user = this.adminUser(request, token);
    if (!user) throw new HttpException({ ok: false, message: "需要管理员权限" }, HttpStatus.FORBIDDEN);
    return user;
  }

  private requireUser(request: Request): AppUser {
    const user = this.currentUser(request);
    if (!user) throw new HttpException({ ok: false, message: "请先使用飞书登录" }, HttpStatus.UNAUTHORIZED);
    return user;
  }

  private requireSuperAdmin(request: Request, token: string | undefined) {
    if (!isSuperAdmin(this.adminUser(request, token))) {
      throw new HttpException({ ok: false, message: "需要超级管理员权限" }, HttpStatus.FORBIDDEN);
    }
  }

  private isAdminRequest(request: Request, token: string | undefined): boolean {
    return Boolean(this.adminUser(request, token));
  }

  private adminUser(request: Request, token: string | undefined): AppUser | null {
    const tokenUser = this.auth.verifyToken(token);
    if (this.auth.isAdminUser(tokenUser)) return tokenUser;
    const sessionUser = this.currentUser(request);
    return this.auth.isAdminUser(sessionUser) ? sessionUser : null;
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

  private clearSessionCookie(response: Response) {
    response.setHeader("Set-Cookie", `${this.auth.sessionCookieName}=; ${this.auth.clearCookieOptions()}`);
  }

  private readRawBody(request: Request): Promise<string> {
    return this.readRawBuffer(request).then((buffer) => buffer.toString("utf8"));
  }

  private readRawBuffer(request: Request): Promise<Buffer> {
    return new Promise((resolveBody, rejectBody) => {
      const chunks: Buffer[] = [];
      let size = 0;
      request.on("data", (chunk: Buffer | string) => {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        size += buffer.length;
        if (size > 25 * 1024 * 1024) {
          rejectBody(new Error("导入文件超过 25MB"));
          request.destroy();
          return;
        }
        chunks.push(buffer);
      });
      request.on("end", () => resolveBody(Buffer.concat(chunks)));
      request.on("error", rejectBody);
    });
  }

  private importSource(source: string | undefined): string {
    const normalized = String(source || "总台账").trim().toLowerCase();
    if (["data-team", "team", "数据团队总表"].includes(normalized)) return "数据团队总表";
    if (["request", "requests", "提需求表"].includes(normalized)) return "提需求表";
    if (["ledger", "总台账"].includes(normalized)) return "总台账";
    return String(source || "总台账").trim().slice(0, 40) || "总台账";
  }

  private datasetCsv(dataset: { fields: Array<{ name?: string; id: string }>; records: LedgerRecord[] }): string {
    const fields = dataset.fields.map((field) => field.name || field.id);
    const csvCell = (value: FieldValue) => {
      let text = stringifyCell(value).replace(/\r?\n/g, " ");
      if (/^[=+\-@]/.test(text)) text = `'${text}`;
      return `"${text.replace(/"/g, '""')}"`;
    };
    const rows = [fields.map(csvCell).join(",")];
    for (const record of dataset.records) rows.push(fields.map((field) => csvCell(record.fields?.[field])).join(","));
    return `\uFEFF${rows.join("\r\n")}\r\n`;
  }
}

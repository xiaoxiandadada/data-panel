import { Body, Controller, Get, Headers, HttpCode, HttpException, HttpStatus, Param, Patch, Post, Query, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { randomUUID, timingSafeEqual } from "node:crypto";
import { AuthService } from "../auth/auth.service.js";
import { LarkIntegrationError, LarkOAuthService } from "../auth/lark-oauth.service.js";
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
  normalizeNameList,
  publicDataset,
  requesterRecords,
  searchPublicRecords,
  splitNameList,
  stringifyCell,
  uniqueRequesterNames
} from "../core/ledger-utils.js";
import type { AppUser, FieldValue, ImportBatch, LedgerRecord, UserRole } from "../core/types.js";
import { attachProgress, progressModel, progressSummary } from "../core/progress.js";
import { LedgerStoreService } from "../infra/ledger-store.service.js";
import { QueueService } from "../infra/queue.service.js";
import { DeliveryEfficiencyService } from "../metrics/delivery-efficiency.service.js";
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
    private readonly larkSync: LarkBaseSyncService,
    private readonly efficiency: DeliveryEfficiencyService
  ) {}

  @Get("healthz")
  async healthz() {
    const dataset = await this.store.readDataset();
    return {
      ...datasetStats(dataset),
      mongodb: this.store.isMongoReady() ? "ready" : "fallback-json",
      redis: this.queue.isReady() ? "ready" : "disabled",
      larkSync: this.larkSync.isConfigured() ? "configured" : "disabled",
      larkSyncStatus: this.larkSync.status(),
      // Surfaces how much of the ledger the stage model can actually place. `unknownCount` climbing is
      // the signal that the Base grew a status nobody taught this model about.
      progress: progressSummary(dataset.records || []),
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
    const user = await this.currentUser(request);
    if (mode === "mine") return attachProgress(publicDataset(dataset, user ? requesterRecords(dataset, user.name) : []), dataset.records);
    const admin = await this.adminUser(request, token);
    if (admin) return attachProgress(projectDatasetForAdmin(dataset, admin), dataset.records);
    return attachProgress(publicDataset(dataset, user ? requesterRecords(dataset, user.name) : []), dataset.records);
  }

  // Cheap change detector for the browser: one counter instead of re-downloading the dataset.
  // Deliberately unauthenticated — it exposes a write counter and nothing about the records.
  @Get("api/data/version")
  async dataVersion() {
    return { ok: true, version: await this.store.readDataVersion() };
  }

  /**
   * The stage ladder and its status vocabulary. Unauthenticated because it is a definition table with
   * no record data in it, and the browser needs it before it can draw a single progress bar. Serving
   * it instead of shipping a copy in the bundle is what keeps the client from re-growing its own
   * status→percent table, which had already drifted from the server's.
   */
  @Get("api/progress/model")
  progressModel() {
    return { ok: true, model: progressModel() };
  }

  @Get("api/search")
  async search(@Req() request: Request, @Query("q") q = "", @Query("limit") limit = "100") {
    const user = await this.requireUser(request);
    const dataset = await this.store.readDataset();
    const safeLimit = Math.min(Math.max(Number(limit || 100), 1), 200);
    const allowed = this.auth.isAdminUser(user) ? dataset.records : requesterRecords(dataset, user.name);
    const allowedIds = new Set(allowed.map((record) => record.record_id));
    return attachProgress(publicDataset(dataset, searchPublicRecords(dataset, q, safeLimit).filter((record) => allowedIds.has(record.record_id))), dataset.records);
  }

  @Get("api/requesters")
  async requesters(@Req() request: Request, @Headers("x-admin-token") token?: string) {
    await this.requireAdmin(request, token);
    const dataset = await this.store.readDataset();
    return { ok: true, requesters: uniqueRequesterNames(dataset) };
  }

  @Get("api/analytics/delivery-efficiency")
  async deliveryEfficiency(@Req() request: Request, @Headers("x-admin-token") token?: string) {
    await this.requireAdmin(request, token);
    return {
      ok: true,
      generatedAt: new Date().toISOString(),
      ...this.efficiency.analyze(await this.store.readDataset())
    };
  }

  @Get("api/lark/users/search")
  async searchLarkUsers(@Req() request: Request, @Query("q") q = "", @Query("limit") limit = "10") {
    if (!await this.currentUser(request)) {
      throw new HttpException({ ok: false, message: "请先通过飞书登录" }, HttpStatus.UNAUTHORIZED);
    }
    if (!this.larkOAuth.isConfigured()) {
      throw new HttpException({ ok: false, message: "飞书应用尚未配置，无法搜索企业通讯录" }, HttpStatus.NOT_IMPLEMENTED);
    }
    const safeLimit = Math.min(Math.max(Number(limit || 10), 1), 20);
    try {
      const users = await this.larkOAuth.searchUsers(q, safeLimit);
      // The directory only ever contains the departments granted to the application in 飞书 admin
      // console (通讯录权限范围). Someone outside that boundary is absent from every contact API, which
      // looks exactly like "no such person" — so an empty result ships the boundary with it and the
      // client can say which of the two happened.
      const scope = users.length ? null : this.larkOAuth.directoryScope();
      return { ok: true, users, ...(scope ? { scope } : {}) };
    } catch (error) {
      const integration = error instanceof LarkIntegrationError ? error : null;
      throw new HttpException({
        ok: false,
        message: error instanceof Error ? error.message : "飞书通讯录搜索失败",
        code: integration?.code || "LARK_DIRECTORY_SEARCH_FAILED",
        requiredScopes: integration?.requiredScopes || [],
        action: integration?.action || "检查飞书应用通讯录权限与可用范围"
      }, HttpStatus.BAD_GATEWAY);
    }
  }

  @Get("api/my-records")
  async myRecords(@Req() request: Request) {
    const dataset = await this.store.readDataset();
    const user = await this.requireRequester(request);
    return attachProgress(publicDataset(dataset, requesterRecords(dataset, user.name)), dataset.records);
  }

  @Get("api/my-records/export")
  async exportMyRecords(@Req() request: Request, @Res() response: Response) {
    const dataset = await this.store.readDataset();
    const user = await this.requireRequester(request);
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
  async me(@Req() request: Request) {
    const user = await this.currentUser(request);
    return {
      ok: true,
      authenticated: Boolean(user),
      user,
      larkOAuthEnabled: this.larkOAuth.isConfigured(),
      requestFormUrl: this.requestFormUrl(),
      mockUsers: process.env.AUTH_MOCK_ENABLED === "false" ? [] : this.auth.mockLoginUsers()
    };
  }

  /**
   * The Feishu share form requesters can fill in without logging into this application. Empty when
   * unconfigured so the entry point disappears rather than rendering a dead link, and restricted to
   * https because the value ends up in an anchor href.
   */
  private requestFormUrl(): string {
    const configured = String(process.env.LARK_REQUEST_FORM_URL || "").trim();
    if (!configured) return "";
    try {
      return new URL(configured).protocol === "https:" ? configured : "";
    } catch {
      return "";
    }
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
      role: "requester",
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
      const user = await this.larkOAuth.exchangeCodeForUser(code, !verifiedState.adminOnly);
      if (verifiedState.adminOnly && !this.auth.isAdminUser(user)) {
        const configured = await this.store.findUserByOpenId(user.openId);
        if (!this.auth.isAdminUser(configured)) {
          this.clearSessionCookie(response);
          response.redirect(`${verifiedState.next}${verifiedState.next.includes("?") ? "&" : "?"}auth_error=admin_only`);
          return;
        }
      }
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
    const user = await this.requireRequester(request);
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
    return { ok: true, record, data: attachProgress(publicDataset(dataset, requesterRecords(dataset, requesterName)), dataset.records) };
  }

  @Patch("api/requests/:id/followers")
  async updateFollowers(@Req() request: Request, @Param("id") recordId: string, @Body() payload: { followers?: string }) {
    const user = await this.requireRequester(request);
    const requesterName = user.name;
    const dataset = await this.store.readDataset();
    ensureFields(dataset, ["需求负责人", "需求人", "关注人", "PM"]);
    const record = dataset.records.find((item) => item.record_id === recordId);
    if (!record) throw new HttpException({ ok: false, message: "需求不存在" }, HttpStatus.NOT_FOUND);
    const owners = ["需求负责人", "项目对接人"]
      .flatMap((field) => splitNameList(record.fields[field]))
      .map((name) => name.toLowerCase());
    if (!owners.includes(requesterName.toLowerCase())) {
      throw new HttpException({ ok: false, message: "只有需求负责人可以维护关注人" }, HttpStatus.FORBIDDEN);
    }
    const beforeFields = { ...(record.fields || {}) };
    record.fields = { ...record.fields, "关注人": normalizeNameList(payload.followers) };
    dataset.meta = {
      ...(dataset.meta || {}),
      status: "ok",
      syncedAt: new Date().toLocaleString("zh-CN", { hour12: false }),
      message: `已更新关注人：${String(record.fields["项目名称"] || record.record_id)}`
    };
    await this.store.saveDataset(dataset);
    await this.store.appendFieldChangeLogs(recordId, beforeFields, { "关注人": record.fields["关注人"] }, requesterName, "requester", "需求负责人维护关注人");
    await this.queue.enqueue("followers.updated", { recordId, actorOpenId: user.openId });
    return { ok: true, record, data: attachProgress(publicDataset(dataset, requesterRecords(dataset, requesterName)), dataset.records) };
  }

  @Post("api/requests/:id/satisfaction")
  @HttpCode(200)
  async submitSatisfaction(
    @Req() request: Request,
    @Param("id") recordId: string,
    @Body() payload: { score?: number; comment?: string; defaulted?: boolean }
  ) {
    const user = await this.requireRequester(request);
    const score = Math.round(Number(payload.score || 0));
    if (score < 1 || score > 5) throw new HttpException({ ok: false, message: "满意度必须为 1 到 5 分" }, HttpStatus.BAD_REQUEST);
    const comment = String(payload.comment || "").trim();
    if (score < 4 && !comment) {
      throw new HttpException({ ok: false, message: "满意度低于 4 星时必须填写理由" }, HttpStatus.BAD_REQUEST);
    }
    if (payload.defaulted && score !== 5) {
      throw new HttpException({ ok: false, message: "关闭评价只能默认记为 5 星" }, HttpStatus.BAD_REQUEST);
    }
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
      "满意度评价": payload.defaulted ? "用户关闭评价，默认五星好评" : comment,
      "满意度评价来源": payload.defaulted ? "用户关闭默认" : "需求方主动评价",
      "满意度评价时间": new Date().toISOString()
    };
    const updated = await this.store.updateRecord(recordId, fields);
    await this.store.appendFieldChangeLogs(recordId, before, fields, user.name, "requester", "需求方提交满意度评价");
    return { ok: true, record: updated.record, data: attachProgress(publicDataset(updated.dataset, requesterRecords(updated.dataset, user.name)), updated.dataset.records) };
  }

  @Get("api/records/:id/logs")
  async logs(@Req() request: Request, @Headers("x-admin-token") token: string | undefined, @Param("id") recordId: string) {
    await this.requireAdmin(request, token);
    const user = await this.adminUser(request, token);
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
    await this.requireSuperAdmin(request, token);
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
    const user = await this.currentUser(request);
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
    await this.requireSuperAdmin(request, token);
    return { ok: true, batches: await this.store.readImportBatches() };
  }

  @Post("api/sync/lark")
  @HttpCode(200)
  async syncLark(@Req() request: Request, @Headers("x-admin-token") token?: string) {
    await this.requireSuperAdmin(request, token);
    const user = await this.currentUser(request);
    return { ok: true, results: await this.larkSync.syncAll(user?.name || "超级管理员") };
  }

  @Get("api/sync/lark/sources")
  async larkSyncSources(@Req() request: Request, @Headers("x-admin-token") token?: string) {
    await this.requireAdminUser(request, token);
    const batches = (await this.store.readImportBatches(100)).filter((batch) => batch.mode === "lark");
    const status = this.larkSync.status();
    return {
      ok: true,
      intervalMs: Math.max(Number(process.env.LARK_SYNC_INTERVAL_MS || 300_000), 60_000),
      status,
      sources: this.larkSync.sourceConfigurations().map((source) => ({
        ...source,
        status: status.sources.find((item) => item.tableId === source.tableId) || null,
        lastBatch: batches.find((batch) => batch.source === source.source) || null
      }))
    };
  }

  @Get("api/sync/lark/sources/:key/open")
  async openLarkSource(
    @Req() request: Request,
    @Headers("x-admin-token") token: string | undefined,
    @Param("key") key: string,
    @Res() response: Response
  ) {
    await this.requireAdminUser(request, token);
    const source = this.larkSync.sourceConfigurations().find((item) => item.key === key);
    if (!source?.url) {
      throw new HttpException({ ok: false, message: "飞书数据源链接尚未配置" }, HttpStatus.NOT_FOUND);
    }
    let target: URL;
    try {
      target = new URL(source.url);
    } catch {
      throw new HttpException({ ok: false, message: "飞书数据源链接格式错误" }, HttpStatus.INTERNAL_SERVER_ERROR);
    }
    if (!["https:", "http:"].includes(target.protocol)) {
      throw new HttpException({ ok: false, message: "飞书数据源链接协议不受支持" }, HttpStatus.INTERNAL_SERVER_ERROR);
    }
    response.redirect(target.toString());
  }

  @Post("api/webhooks/lark/base")
  @HttpCode(HttpStatus.ACCEPTED)
  larkBaseWebhook(
    @Headers("authorization") authorization: string | undefined,
    @Headers("x-lark-sync-secret") syncSecret: string | undefined,
    @Body() payload: { tableId?: string; table_id?: string; recordId?: string; record_id?: string }
  ) {
    const expected = String(process.env.LARK_BASE_WEBHOOK_SECRET || "").trim();
    if (!expected) {
      throw new HttpException({ ok: false, message: "飞书实时同步入口尚未配置" }, HttpStatus.SERVICE_UNAVAILABLE);
    }
    const bearer = String(authorization || "").replace(/^Bearer\s+/i, "").trim();
    const provided = String(syncSecret || bearer).trim();
    if (!this.secureEqual(provided, expected)) {
      throw new HttpException({ ok: false, message: "飞书实时同步签名无效" }, HttpStatus.UNAUTHORIZED);
    }
    const tableId = String(payload?.tableId || payload?.table_id || "").trim();
    const recordId = String(payload?.recordId || payload?.record_id || "").trim();
    const source = this.larkSync.scheduleTableSync(tableId, recordId);
    if (!source) {
      throw new HttpException({ ok: false, message: "未识别的数据表" }, HttpStatus.BAD_REQUEST);
    }
    return {
      ok: true,
      accepted: true,
      source: source.source,
      tableId: source.tableId,
      recordId,
      mode: recordId ? "record" : "table"
    };
  }

  @Get("api/preferences/fields")
  async fieldPreferences(@Req() request: Request, @Headers("x-admin-token") token?: string) {
    const user = await this.requireAdminUser(request, token);
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
    const user = await this.requireAdminUser(request, token);
    const dataset = projectDatasetForAdmin(await this.store.readDataset(), user);
    const allowed = new Set(dataset.fields.map((field) => field.name || field.id));
    const hiddenFields = (payload.hiddenFields || []).map(String).filter((field) => allowed.has(field));
    const fieldOrder = (payload.fieldOrder || []).map(String).filter((field) => allowed.has(field));
    const hidden = new Set(hiddenFields);
    const pinnedFields = (payload.pinnedFields || [])
      .map(String)
      .filter((field) => allowed.has(field) && !hidden.has(field));
    return {
      ok: true,
      preferences: await this.store.saveUserFieldPreferences({ openId: user.openId, hiddenFields, fieldOrder, pinnedFields, updatedAt: "" })
    };
  }

  @Get("api/admin/users")
  async adminUsers(@Req() request: Request, @Headers("x-admin-token") token?: string) {
    await this.requireSuperAdmin(request, token);
    const productionOAuthOnly = process.env.AUTH_MOCK_ENABLED === "false";
    return {
      ok: true,
      users: (await this.store.listUsers()).filter((user) =>
        this.auth.isAdminUser(user) && (!productionOAuthOnly || !user.openId.startsWith("mock_"))
      )
    };
  }

  @Patch("api/admin/users/:openId/role")
  async updateUserRole(
    @Req() request: Request,
    @Headers("x-admin-token") token: string | undefined,
    @Param("openId") openId: string,
    @Body() payload: {
      role?: UserRole;
      roles?: UserRole[];
      note?: string;
      user?: Pick<AppUser, "openId" | "name" | "email" | "department" | "avatar">
    }
  ) {
    await this.requireSuperAdmin(request, token);
    const actor = await this.adminUser(request, token);
    const allowed: UserRole[] = ["member", "requester", "delivery_admin", "super_admin"];
    const roles = Array.isArray(payload.roles) ? payload.roles : payload.role ? [payload.role] : [];
    if (!roles.length || roles.some((role) => !allowed.includes(role))) {
      throw new HttpException({ ok: false, message: "不支持的角色" }, HttpStatus.BAD_REQUEST);
    }
    let target = await this.store.findUserByOpenId(openId);
    if (!target && payload.user?.openId === openId) {
      const seedRoles = roles.includes("delivery_admin") ? ["delivery_admin" as UserRole] : ["member" as UserRole];
      await this.store.upsertUser({
        openId,
        name: String(payload.user.name || "未命名用户"),
        email: String(payload.user.email || ""),
        department: String(payload.user.department || "未设置"),
        avatar: payload.user.avatar,
        role: seedRoles[0],
        roles: seedRoles,
        requesterRegistered: false
      });
      target = await this.store.findUserByOpenId(openId);
    }
    const targetIsSuperAdmin = this.auth.hasRole(target, "super_admin");
    if (roles.includes("super_admin") && !targetIsSuperAdmin) {
      throw new HttpException({ ok: false, message: "超级管理员仅通过部署环境配置，不支持在页面新增" }, HttpStatus.FORBIDDEN);
    }
    if (targetIsSuperAdmin && !roles.includes("super_admin")) {
      throw new HttpException({ ok: false, message: "不能移除唯一超级管理员权限" }, HttpStatus.FORBIDDEN);
    }
    const user = await this.store.updateUserRoles(openId, roles);
    if (!user) throw new HttpException({ ok: false, message: "用户不存在或数据库未连接" }, HttpStatus.NOT_FOUND);
    const beforeRoles = target?.roles?.length ? target.roles : target?.role ? [target.role] : ["member"];
    await this.store.appendLog(createLog({
      record_id: `user:${openId}`,
      type: roles.includes("delivery_admin") ? "管理员任命" : "管理员移除",
      field: "用户角色",
      before: beforeRoles.join("、"),
      after: roles.join("、"),
      actor: actor?.name || "超级管理员",
      role: "super_admin",
      note: String(payload.note || "超级管理员通过管理员设置页面操作").slice(0, 200)
    }));
    return { ok: true, user };
  }

  @Post("api/records")
  @HttpCode(200)
  async createRecord(@Req() request: Request, @Headers("x-admin-token") token: string | undefined, @Body() payload: { fields?: Record<string, FieldValue>; actor?: string }) {
    await this.requireSuperAdmin(request, token);
    const user = await this.currentUser(request);
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
    await this.requireAdmin(request, token);
    const admin = await this.adminUser(request, token);
    const user = await this.currentUser(request);
    const currentDataset = await this.store.readDataset();
    const currentRecord = currentDataset.records.find((item) => item.record_id === recordId);
    if (!currentRecord) throw new HttpException({ ok: false, message: "记录不存在" }, HttpStatus.NOT_FOUND);
    const tracking = this.satisfaction.completionTrackingPatch(currentRecord.fields || {}, payload.fields || {});
    const updatedFields = { ...(payload.fields || {}), ...tracking };
    if (!canEditAdminFields(admin, payload.fields || {})) {
      throw new HttpException({ ok: false, message: "当前账号没有台账编辑权限" }, HttpStatus.FORBIDDEN);
    }
    const { dataset, beforeFields, record } = await this.store.updateRecord(recordId, updatedFields);
    if (!record) throw new HttpException({ ok: false, message: "记录不存在" }, HttpStatus.NOT_FOUND);
    await this.store.appendFieldChangeLogs(recordId, beforeFields, updatedFields, actorFromPayload(payload, user?.name || "管理员"), user?.role || "admin");
    const beforeStatus = stringifyCell(beforeFields["获取状态"]).trim() || "未设置";
    const afterStatus = stringifyCell(record.fields["获取状态"]).trim() || "未设置";
    if (Object.hasOwn(updatedFields, "获取状态") && beforeStatus !== afterStatus) {
      await this.queue.enqueue("record.updated", {
        recordId,
        fields: ["获取状态"],
        beforeStatus,
        afterStatus,
        actorOpenId: user?.openId || ""
      });
    }
    const projected = attachProgress(projectDatasetForAdmin(dataset, admin), dataset.records);
    return {
      ok: true,
      record: projected.records.find((item) => item.record_id === recordId),
      data: projected
    };
  }

  private async requireAdmin(request: Request, token: string | undefined) {
    if (!await this.isAdminRequest(request, token)) {
      throw new HttpException({ ok: false, message: "需要管理员权限" }, HttpStatus.FORBIDDEN);
    }
  }

  private async requireAdminUser(request: Request, token: string | undefined): Promise<AppUser> {
    const user = await this.adminUser(request, token);
    if (!user) throw new HttpException({ ok: false, message: "需要管理员权限" }, HttpStatus.FORBIDDEN);
    return user;
  }

  private async requireUser(request: Request): Promise<AppUser> {
    const user = await this.currentUser(request);
    if (!user) throw new HttpException({ ok: false, message: "请先使用飞书登录" }, HttpStatus.UNAUTHORIZED);
    return user;
  }

  private async requireRequester(request: Request): Promise<AppUser> {
    const user = await this.requireUser(request);
    if (!this.auth.hasRole(user, "requester")) {
      throw new HttpException({ ok: false, message: "请先从需求方入口登录并建立需求方身份" }, HttpStatus.FORBIDDEN);
    }
    return user;
  }

  private async requireSuperAdmin(request: Request, token: string | undefined) {
    if (!isSuperAdmin(await this.adminUser(request, token))) {
      throw new HttpException({ ok: false, message: "需要超级管理员权限" }, HttpStatus.FORBIDDEN);
    }
  }

  private async isAdminRequest(request: Request, token: string | undefined): Promise<boolean> {
    return Boolean(await this.adminUser(request, token));
  }

  private async adminUser(request: Request, token: string | undefined): Promise<AppUser | null> {
    const tokenUser = await this.refreshSessionUser(this.auth.verifyToken(token));
    if (this.auth.isAdminUser(tokenUser)) return tokenUser;
    const sessionUser = await this.currentUser(request);
    return this.auth.isAdminUser(sessionUser) ? sessionUser : null;
  }

  private async currentUser(request: Request): Promise<AppUser | null> {
    return this.refreshSessionUser(
      this.auth.verifyToken(this.cookieValue(request, this.auth.sessionCookieName))
    );
  }

  private async refreshSessionUser(tokenUser: AppUser | null): Promise<AppUser | null> {
    if (!tokenUser) return null;
    try {
      return await this.store.findUserByOpenId(tokenUser.openId) || tokenUser;
    } catch {
      return tokenUser;
    }
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

  /**
   * Excel imports and Base syncs both stamp `数据来源`, so they have to agree on one vocabulary or the
   * column ends up carrying two names for the same table. The canonical names are the Feishu table
   * names; the older labels stay accepted as input so existing clients and saved forms keep working.
   */
  private importSource(source: string | undefined): string {
    const normalized = String(source || "数据团队总表").trim().toLowerCase();
    if (["ledger", "总台账", "数据团队总表"].includes(normalized)) return "数据团队总表";
    if (["corpus", "245", "project-245", "项目245", "request", "requests", "战略语料库", "战略语料库获取表"].includes(normalized)) return "战略语料库获取表";
    if (["pool", "需求池", "数据团队需求池"].includes(normalized)) return "数据团队需求池";
    if (["gaofeng", "高峰", "高峰加入", "高峰项目获取表", "data-team", "team"].includes(normalized)) return "高峰项目获取表";
    if (["clarify", "待澄清", "待澄清项目"].includes(normalized)) return "待澄清项目";
    return String(source || "数据团队总表").trim().slice(0, 40) || "数据团队总表";
  }

  private secureEqual(value: string, expected: string): boolean {
    const left = Buffer.from(value);
    const right = Buffer.from(expected);
    return left.length === right.length && timingSafeEqual(left, right);
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

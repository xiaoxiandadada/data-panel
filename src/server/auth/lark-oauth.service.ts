import { Injectable } from "@nestjs/common";
import type { AppUser, Dataset, LedgerRecord, UserRole } from "../core/types.js";
import { normalizeUserRoles, primaryUserRole } from "../core/user-roles.js";

interface LarkOAuthTokenResponse {
  code?: number;
  error?: string;
  error_description?: string;
  msg?: string;
  message?: string;
  access_token?: string;
  token_type?: string;
  expires_in?: number;
  refresh_token?: string;
  data?: {
    access_token?: string;
    token_type?: string;
    expires_in?: number;
    refresh_token?: string;
  };
}

interface LarkUserInfoResponse {
  code?: number;
  msg?: string;
  message?: string;
  data?: {
    name?: string;
    en_name?: string;
    open_id?: string;
    union_id?: string;
    user_id?: string;
    email?: string;
    avatar_url?: string;
    avatar_thumb?: string;
    department_ids?: string[];
    department?: string;
  };
}

interface LarkTenantTokenResponse {
  code?: number;
  msg?: string;
  message?: string;
  tenant_access_token?: string;
  expire?: number;
}

export interface LarkContactUser {
  openId: string;
  name: string;
  email?: string;
  department?: string;
  avatar?: string;
}

type RoleConfig = {
  role: UserRole;
  openIds: Set<string>;
  emails: Set<string>;
};

function cleanEnv(value: string | undefined): string {
  return String(value || "").trim();
}

function splitEnvSet(value: string | undefined): Set<string> {
  return new Set(
    cleanEnv(value)
      .split(",")
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean)
  );
}

@Injectable()
export class LarkOAuthService {
  private readonly appId = cleanEnv(process.env.LARK_APP_ID);
  private readonly appSecret = cleanEnv(process.env.LARK_APP_SECRET);
  private readonly redirectUri = cleanEnv(process.env.LARK_REDIRECT_URI);
  private readonly authHost = cleanEnv(process.env.LARK_AUTH_HOST) || "https://open.feishu.cn";
  private readonly apiHost = cleanEnv(process.env.LARK_API_HOST) || "https://open.feishu.cn";
  private tenantTokenCache: { token: string; expiresAt: number } | null = null;

  isConfigured(): boolean {
    return Boolean(this.appId && this.appSecret && this.redirectUri);
  }

  isBotConfigured(): boolean {
    return Boolean(this.appId && this.appSecret);
  }

  missingConfig(): string[] {
    return [
      ["LARK_APP_ID", this.appId],
      ["LARK_APP_SECRET", this.appSecret],
      ["LARK_REDIRECT_URI", this.redirectUri]
    ]
      .filter(([, value]) => !value)
      .map(([key]) => key);
  }

  authorizationUrl(state: string): string {
    const url = new URL("/open-apis/authen/v1/index", this.authHost);
    url.searchParams.set("app_id", this.appId);
    url.searchParams.set("redirect_uri", this.redirectUri);
    url.searchParams.set("state", state);
    return url.toString();
  }

  async exchangeCodeForUser(code: string, registerRequester = true): Promise<AppUser> {
    const accessToken = await this.exchangeCode(code);
    const profile = await this.fetchUserInfo(accessToken);
    return this.toAppUser(profile, registerRequester);
  }

  async searchUsers(query: string, limit = 10): Promise<LarkContactUser[]> {
    const keyword = cleanEnv(query);
    if (!keyword) return [];
    const token = await this.tenantAccessToken();
    const url = new URL("/open-apis/search/v1/user", this.apiHost);
    url.searchParams.set("user_id_type", "open_id");
    const response = await fetch(url, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json; charset=utf-8"
      },
      body: JSON.stringify({
        query: keyword,
        page_size: Math.min(Math.max(Number(limit || 10), 1), 20)
      })
    });
    const payload = (await response.json().catch(() => null)) as Record<string, any> | null;
    if (!response.ok || !payload || (typeof payload.code === "number" && payload.code !== 0)) {
      throw new Error(`飞书通讯录搜索失败：${payload?.msg || payload?.message || response.statusText}`);
    }
    const users = this.extractSearchUsers(payload);
    return users.slice(0, Math.min(Math.max(Number(limit || 10), 1), 20));
  }

  async sendTextMessage(openId: string, text: string): Promise<void> {
    const receiver = cleanEnv(openId);
    if (!receiver) return;
    const token = await this.tenantAccessToken();
    const url = new URL("/open-apis/im/v1/messages", this.apiHost);
    url.searchParams.set("receive_id_type", "open_id");
    const response = await fetch(url, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json; charset=utf-8"
      },
      body: JSON.stringify({
        receive_id: receiver,
        msg_type: "text",
        content: JSON.stringify({ text })
      })
    });
    const payload = (await response.json().catch(() => null)) as Record<string, any> | null;
    if (!response.ok || !payload || (typeof payload.code === "number" && payload.code !== 0)) {
      throw new Error(`飞书个人通知失败：${payload?.msg || payload?.message || response.statusText}`);
    }
  }

  async sendWebhookMessage(text: string): Promise<boolean> {
    const webhook = cleanEnv(process.env.LARK_WEBHOOK_URL);
    if (!webhook) return false;
    const response = await fetch(webhook, {
      method: "POST",
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify({ msg_type: "text", content: { text } })
    });
    const payload = (await response.json().catch(() => null)) as Record<string, any> | null;
    const code = payload?.code ?? payload?.StatusCode;
    if (!response.ok || (code != null && Number(code) !== 0)) {
      throw new Error(`飞书群通知失败：${payload?.msg || payload?.StatusMessage || response.statusText}`);
    }
    return true;
  }

  async listBaseDataset(appToken: string, tableId: string, viewId = ""): Promise<Dataset> {
    const cleanAppToken = cleanEnv(appToken);
    const cleanTableId = cleanEnv(tableId);
    if (!cleanAppToken || !cleanTableId) throw new Error("飞书 Base 同步缺少 app token 或 table id");
    const token = await this.tenantAccessToken();
    const records: LedgerRecord[] = [];
    let pageToken = "";
    do {
      const url = new URL(`/open-apis/bitable/v1/apps/${encodeURIComponent(cleanAppToken)}/tables/${encodeURIComponent(cleanTableId)}/records`, this.apiHost);
      url.searchParams.set("page_size", "500");
      if (viewId) url.searchParams.set("view_id", viewId);
      if (pageToken) url.searchParams.set("page_token", pageToken);
      const response = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
      const payload = (await response.json().catch(() => null)) as Record<string, any> | null;
      if (!response.ok || !payload || payload.code !== 0) {
        throw new Error(`飞书 Base 同步失败：${payload?.msg || payload?.message || response.statusText}`);
      }
      const items = Array.isArray(payload.data?.items) ? payload.data.items : [];
      records.push(...items.map((item: Record<string, any>, index: number) => ({
        record_id: cleanEnv(item.record_id || item.id) || `lark-${records.length + index + 1}`,
        fields: item.fields || {}
      })));
      pageToken = payload.data?.has_more ? cleanEnv(payload.data?.page_token) : "";
    } while (pageToken);
    const names = [...new Set(records.flatMap((record) => Object.keys(record.fields || {})))];
    return {
      meta: {
        status: "ok",
        title: cleanTableId,
        syncedAt: new Date().toLocaleString("zh-CN", { hour12: false }),
        message: `飞书 Base 同步 ${records.length} 条记录`
      },
      fields: names.map((name) => ({ id: name, name, type: "text" })),
      records
    };
  }

  async resolveWikiNodeObjectToken(wikiNodeToken: string): Promise<string> {
    const cleanToken = cleanEnv(wikiNodeToken);
    if (!cleanToken) throw new Error("飞书 Wiki 节点 token 为空");
    const token = await this.tenantAccessToken();
    const url = new URL("/open-apis/wiki/v2/spaces/get_node", this.apiHost);
    url.searchParams.set("token", cleanToken);
    url.searchParams.set("obj_type", "wiki");
    const response = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
    const payload = (await response.json().catch(() => null)) as Record<string, any> | null;
    const node = payload?.data?.node;
    if (!response.ok || !payload || payload.code !== 0 || !node?.obj_token) {
      throw new Error(`飞书 Wiki 节点解析失败：${payload?.msg || payload?.message || response.statusText}`);
    }
    if (node.obj_type && node.obj_type !== "bitable") {
      throw new Error(`飞书 Wiki 节点不是多维表格：${node.obj_type}`);
    }
    return cleanEnv(node.obj_token);
  }

  private async tenantAccessToken(): Promise<string> {
    if (this.tenantTokenCache && this.tenantTokenCache.expiresAt > Date.now() + 60_000) {
      return this.tenantTokenCache.token;
    }
    if (!this.appId || !this.appSecret) {
      throw new Error("飞书应用尚未配置 LARK_APP_ID 或 LARK_APP_SECRET");
    }
    const response = await fetch(new URL("/open-apis/auth/v3/tenant_access_token/internal", this.apiHost), {
      method: "POST",
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify({
        app_id: this.appId,
        app_secret: this.appSecret
      })
    });
    const payload = (await response.json().catch(() => null)) as LarkTenantTokenResponse | null;
    if (!response.ok || !payload || payload.code !== 0 || !payload.tenant_access_token) {
      throw new Error(`飞书 tenant_access_token 获取失败：${payload?.msg || payload?.message || response.statusText}`);
    }
    this.tenantTokenCache = {
      token: payload.tenant_access_token,
      expiresAt: Date.now() + Math.max(Number(payload.expire || 3600) - 120, 60) * 1000
    };
    return payload.tenant_access_token;
  }

  private extractSearchUsers(payload: Record<string, any>): LarkContactUser[] {
    const candidates =
      payload.data?.users ||
      payload.data?.items ||
      payload.data?.result?.users ||
      payload.users ||
      [];
    if (!Array.isArray(candidates)) return [];
    return candidates
      .map((item) => {
        const user = item.user || item;
        const name = cleanEnv(user.name || user.cn_name || user.en_name || user.display_name || user.email);
        const openId = cleanEnv(user.open_id || user.openId || user.user_id || user.userId || user.id);
        if (!name || !openId) return null;
        const departments = user.departments || user.department_ids || user.department_path || user.department;
        return {
          openId,
          name,
          email: cleanEnv(user.email) || undefined,
          department: Array.isArray(departments) ? departments.map((item) => cleanEnv(item.name || item)).filter(Boolean).join(" / ") : cleanEnv(departments) || undefined,
          avatar: cleanEnv(user.avatar_url || user.avatar_thumb || user.avatar?.avatar_72 || user.avatar?.avatar_origin) || undefined
        };
      })
      .filter(Boolean) as LarkContactUser[];
  }

  private async exchangeCode(code: string): Promise<string> {
    const response = await fetch(new URL("/open-apis/authen/v2/oauth/token", this.apiHost), {
      method: "POST",
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify({
        grant_type: "authorization_code",
        client_id: this.appId,
        client_secret: this.appSecret,
        code,
        redirect_uri: this.redirectUri
      })
    });
    const payload = (await response.json().catch(() => null)) as LarkOAuthTokenResponse | null;
    const accessToken = payload?.data?.access_token || payload?.access_token;
    if (!response.ok || !payload || !accessToken) {
      throw new Error(`飞书 OAuth 换取 token 失败：${payload?.error_description || payload?.error || payload?.msg || payload?.message || response.statusText}`);
    }
    return accessToken;
  }

  private async fetchUserInfo(accessToken: string): Promise<NonNullable<LarkUserInfoResponse["data"]>> {
    const response = await fetch(new URL("/open-apis/authen/v1/user_info", this.apiHost), {
      headers: { authorization: `Bearer ${accessToken}` }
    });
    const payload = (await response.json().catch(() => null)) as LarkUserInfoResponse | null;
    if (!response.ok || !payload || payload.code !== 0 || !payload.data?.open_id) {
      throw new Error(`飞书用户信息获取失败：${payload?.msg || payload?.message || response.statusText}`);
    }
    return payload.data;
  }

  private toAppUser(profile: NonNullable<LarkUserInfoResponse["data"]>, registerRequester: boolean): AppUser {
    const name = cleanEnv(profile.name) || cleanEnv(profile.en_name) || cleanEnv(profile.email) || profile.open_id || "飞书用户";
    const email = cleanEnv(profile.email);
    const roles = this.resolveRoles(profile, registerRequester);
    return {
      openId: profile.open_id || profile.union_id || profile.user_id || email || name,
      name,
      email,
      avatar: cleanEnv(profile.avatar_url) || cleanEnv(profile.avatar_thumb) || undefined,
      department: cleanEnv(profile.department) || cleanEnv(profile.department_ids?.join(",")) || "未设置",
      role: primaryUserRole(roles),
      roles,
      requesterRegistered: registerRequester
    };
  }

  private resolveRoles(profile: NonNullable<LarkUserInfoResponse["data"]>, registerRequester: boolean): UserRole[] {
    const openId = cleanEnv(profile.open_id).toLowerCase();
    const email = cleanEnv(profile.email).toLowerCase();
    const name = cleanEnv(profile.name).toLowerCase();
    const configuredDeliveryNames = splitEnvSet(
      process.env.LARK_DELIVERY_ADMIN_NAMES || "顾语莺,高骊骏,王志,郭显淼"
    );
    const roleConfigs: RoleConfig[] = [
      {
        role: "super_admin",
        openIds: splitEnvSet(process.env.LARK_SUPER_ADMIN_OPEN_IDS),
        emails: splitEnvSet(process.env.LARK_SUPER_ADMIN_EMAILS)
      },
      {
        role: "delivery_admin",
        openIds: splitEnvSet(process.env.LARK_DELIVERY_ADMIN_OPEN_IDS),
        emails: splitEnvSet(process.env.LARK_DELIVERY_ADMIN_EMAILS)
      }
    ];
    const matched = roleConfigs
      .filter((item) => item.openIds.has(openId) || item.emails.has(email))
      .map((item) => item.role);
    if (configuredDeliveryNames.has(name)) matched.push("delivery_admin");
    if (registerRequester) matched.push("requester");
    return normalizeUserRoles(matched);
  }
}

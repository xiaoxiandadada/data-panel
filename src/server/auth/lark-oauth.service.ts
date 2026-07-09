import { Injectable } from "@nestjs/common";
import type { AppUser, UserRole } from "../core/types.js";

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

  isConfigured(): boolean {
    return Boolean(this.appId && this.appSecret && this.redirectUri);
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

  async exchangeCodeForUser(code: string): Promise<AppUser> {
    const accessToken = await this.exchangeCode(code);
    const profile = await this.fetchUserInfo(accessToken);
    return this.toAppUser(profile);
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

  private toAppUser(profile: NonNullable<LarkUserInfoResponse["data"]>): AppUser {
    const name = cleanEnv(profile.name) || cleanEnv(profile.en_name) || cleanEnv(profile.email) || profile.open_id || "飞书用户";
    const email = cleanEnv(profile.email);
    return {
      openId: profile.open_id || profile.union_id || profile.user_id || email || name,
      name,
      email,
      avatar: cleanEnv(profile.avatar_url) || cleanEnv(profile.avatar_thumb) || undefined,
      department: cleanEnv(profile.department) || cleanEnv(profile.department_ids?.join(",")) || "未设置",
      role: this.resolveRole(profile)
    };
  }

  private resolveRole(profile: NonNullable<LarkUserInfoResponse["data"]>): UserRole {
    const openId = cleanEnv(profile.open_id).toLowerCase();
    const email = cleanEnv(profile.email).toLowerCase();
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
      },
      {
        role: "purchase_admin",
        openIds: splitEnvSet(process.env.LARK_PURCHASE_ADMIN_OPEN_IDS),
        emails: splitEnvSet(process.env.LARK_PURCHASE_ADMIN_EMAILS)
      }
    ];
    const matched = roleConfigs.find((item) => item.openIds.has(openId) || item.emails.has(email));
    return matched?.role || "requester";
  }
}

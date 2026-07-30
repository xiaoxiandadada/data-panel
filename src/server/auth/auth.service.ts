import { Injectable } from "@nestjs/common";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import type { AppUser, UserRole } from "../core/types.js";
import { hasAdminRole, hasUserRole, normalizeUserRoles, primaryUserRole, rolesForUser } from "../core/user-roles.js";

interface TokenPayload {
  role: "admin" | UserRole;
  exp: number;
  ver: number;
  user?: AppUser;
}

interface OAuthStatePayload {
  exp: number;
  nonce: string;
  next: string;
  adminOnly?: boolean;
}

function base64url(input: string | Buffer): string {
  return Buffer.from(input).toString("base64url");
}

function normalizeOpenId(name: string): string {
  return `mock_${Buffer.from(name.trim().toLowerCase()).toString("base64url").slice(0, 24)}`;
}

@Injectable()
export class AuthService {
  readonly sessionCookieName = "delivery_pipeline_session";
  private readonly adminPassword = process.env.ADMIN_PASSWORD || "admin123";
  private readonly secret = process.env.AUTH_SECRET || this.adminPassword;
  private readonly sessionMaxAgeSeconds = 8 * 60 * 60;

  constructor() {
    const production = ["production", "prod"].includes(String(process.env.NODE_ENV || "").toLowerCase());
    if (production && (this.secret.length < 32 || this.secret === "local-dev-change-before-production")) {
      throw new Error("生产环境 AUTH_SECRET 必须设置为至少 32 字符的随机密钥");
    }
    if (production && (!process.env.ADMIN_PASSWORD || this.adminPassword === "admin123")) {
      throw new Error("生产环境 ADMIN_PASSWORD 不能使用默认值");
    }
  }

  private readonly mockUsers: AppUser[] = [
    { openId: "mock_wang-guanchu", name: "王冠楚", email: "wangguanchu@example.local", department: "安全可信AGI", role: "requester", roles: ["requester"], requesterRegistered: true },
    { openId: "mock_gu-yuying", name: "顾语莺", email: "guyuying@example.local", department: "数据平台中心", role: "delivery_admin", roles: ["delivery_admin"], requesterRegistered: false },
    { openId: "mock_super-admin", name: "超级管理员", email: "super@example.local", department: "管理", role: "super_admin", roles: ["super_admin"], requesterRegistered: false }
  ];

  login(password: string): { ok: true; token: string; user: AppUser } | { ok: false; message: string } {
    if (password !== this.adminPassword) {
      return { ok: false, message: "管理员口令错误" };
    }
    const user = this.mockUsers.find((item) => item.role === "super_admin") as AppUser;
    const payload: TokenPayload = {
      role: "super_admin",
      user,
      ver: 2,
      exp: this.expiresAt()
    };
    return { ok: true, token: this.sign(payload), user };
  }

  isAdmin(token: string | undefined): boolean {
    const user = this.verifyToken(token);
    return Boolean(user && this.isAdminRole(user.role));
  }

  isAdminUser(user: AppUser | null | undefined): boolean {
    return hasAdminRole(user);
  }

  isAdminRole(role: string | undefined): boolean {
    return role === "delivery_admin" || role === "super_admin" || role === "admin";
  }

  hasRole(user: AppUser | null | undefined, role: UserRole): boolean {
    return hasUserRole(user, role);
  }

  rolesForUser(user: AppUser | null | undefined): UserRole[] {
    return rolesForUser(user);
  }

  tokenForUser(user: AppUser): string {
    return this.sign({
      role: user.role,
      user,
      ver: 2,
      exp: this.expiresAt()
    });
  }

  mockLogin(name: string, options: { role?: UserRole; department?: string; register?: boolean } = {}): { ok: true; token: string; user: AppUser } | { ok: false; message: string } {
    const cleanName = name.trim();
    if (!cleanName) return { ok: false, message: "请输入姓名或账号" };
    const known = this.mockUsers.find((item) => item.name === cleanName);
    if (!known && !options.register) return { ok: false, message: "未找到该模拟账号，可先注册或选择已有需求方" };
    const requestedRoles = normalizeUserRoles([options.role || known?.role || "requester"]);
    const role = primaryUserRole(requestedRoles);
    const user: AppUser = known || {
      openId: normalizeOpenId(cleanName),
      name: cleanName,
      email: `${normalizeOpenId(cleanName)}@example.local`,
      department: options.department?.trim() || "未设置",
      role,
      roles: requestedRoles,
      requesterRegistered: requestedRoles.includes("requester")
    };
    const sessionUser = requestedRoles.includes("requester")
      ? { ...user, requesterRegistered: true }
      : user;
    return { ok: true, token: this.tokenForUser(sessionUser), user: sessionUser };
  }

  verifyToken(token: string | undefined): AppUser | null {
    const payload = this.verifySignedPayload<TokenPayload>(token);
    if (!payload || payload.ver !== 2) return null;
    if (payload.user) return payload.user;
    if (payload.role === "admin") return this.mockUsers.find((item) => item.role === "super_admin") || null;
    return null;
  }

  signOAuthState(next = "/", adminOnly = false): string {
    return this.sign({
      exp: Math.floor(Date.now() / 1000) + 10 * 60,
      nonce: randomUUID(),
      next: this.safeNextPath(next),
      adminOnly
    });
  }

  verifyOAuthState(state: string | undefined): { next: string; adminOnly: boolean } | null {
    const payload = this.verifySignedPayload<OAuthStatePayload>(state);
    if (!payload) return null;
    return { next: this.safeNextPath(payload.next), adminOnly: Boolean(payload.adminOnly) };
  }

  cookieOptions(): string {
    return `HttpOnly; Path=/; SameSite=Lax; Max-Age=${this.sessionMaxAgeSeconds}${this.secureCookieSuffix()}`;
  }

  clearCookieOptions(): string {
    return `HttpOnly; Path=/; SameSite=Lax; Max-Age=0${this.secureCookieSuffix()}`;
  }

  mockLoginUsers(): AppUser[] {
    return this.mockUsers;
  }

  private sign(payload: TokenPayload | OAuthStatePayload): string {
    const payloadPart = base64url(JSON.stringify(payload));
    return `${payloadPart}.${this.signature(payloadPart)}`;
  }

  private verifySignedPayload<T extends { exp: number }>(token: string | undefined): T | null {
    if (!token) return null;
    const parts = token.split(".");
    if (parts.length !== 2) return null;
    const [payloadPart, signature] = parts;
    const expected = this.signature(payloadPart);
    const signatureBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expected);
    if (signatureBuffer.length !== expectedBuffer.length || !timingSafeEqual(signatureBuffer, expectedBuffer)) return null;
    try {
      const payload = JSON.parse(Buffer.from(payloadPart, "base64url").toString("utf8")) as T;
      if (payload.exp <= Math.floor(Date.now() / 1000)) return null;
      return payload;
    } catch {
      return null;
    }
  }

  private safeNextPath(next: string): string {
    return next.startsWith("/") && !next.startsWith("//") ? next : "/";
  }

  private expiresAt(): number {
    return Math.floor(Date.now() / 1000) + this.sessionMaxAgeSeconds;
  }

  private signature(payloadPart: string): string {
    return createHmac("sha256", this.secret).update(payloadPart).digest("base64url");
  }

  private secureCookieSuffix(): string {
    const production = ["production", "prod"].includes(String(process.env.NODE_ENV || "").toLowerCase());
    return production ? "; Secure" : "";
  }
}

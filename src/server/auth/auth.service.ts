import { Injectable } from "@nestjs/common";
import { createHmac, timingSafeEqual } from "node:crypto";
import type { AppUser, UserRole } from "../core/types.js";

interface TokenPayload {
  role: "admin" | UserRole;
  exp: number;
  user?: AppUser;
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

  private readonly mockUsers: AppUser[] = [
    { openId: "mock_wang-guanchu", name: "王冠楚", email: "wangguanchu@example.local", department: "安全可信AGI", role: "requester" },
    { openId: "mock_gu-yuying", name: "顾语莺", email: "guyuying@example.local", department: "数据平台中心", role: "delivery_admin" },
    { openId: "mock_purchase-admin", name: "采购负责人", email: "purchase@example.local", department: "采购", role: "purchase_admin" },
    { openId: "mock_super-admin", name: "超级管理员", email: "super@example.local", department: "管理", role: "super_admin" }
  ];

  login(password: string): { ok: true; token: string; user: AppUser } | { ok: false; message: string } {
    if (password !== this.adminPassword) {
      return { ok: false, message: "管理员口令错误" };
    }
    const user = this.mockUsers.find((item) => item.role === "super_admin") as AppUser;
    const payload: TokenPayload = {
      role: "super_admin",
      user,
      exp: this.expiresAt()
    };
    return { ok: true, token: this.sign(payload), user };
  }

  isAdmin(token: string | undefined): boolean {
    const user = this.verifyToken(token);
    return Boolean(user && this.isAdminRole(user.role));
  }

  isAdminUser(user: AppUser | null | undefined): boolean {
    return Boolean(user && this.isAdminRole(user.role));
  }

  isAdminRole(role: string | undefined): boolean {
    return role === "delivery_admin" || role === "purchase_admin" || role === "super_admin" || role === "admin";
  }

  tokenForUser(user: AppUser): string {
    return this.sign({
      role: user.role,
      user,
      exp: this.expiresAt()
    });
  }

  mockLogin(name: string, options: { role?: UserRole; department?: string; register?: boolean } = {}): { ok: true; token: string; user: AppUser } | { ok: false; message: string } {
    const cleanName = name.trim();
    if (!cleanName) return { ok: false, message: "请输入姓名或账号" };
    const known = this.mockUsers.find((item) => item.name === cleanName);
    if (!known && !options.register) return { ok: false, message: "未找到该模拟账号，可先注册或选择已有需求方" };
    const role = options.role || known?.role || "requester";
    const user: AppUser = known || {
      openId: normalizeOpenId(cleanName),
      name: cleanName,
      email: `${normalizeOpenId(cleanName)}@example.local`,
      department: options.department?.trim() || "未设置",
      role
    };
    return { ok: true, token: this.tokenForUser(user), user };
  }

  verifyToken(token: string | undefined): AppUser | null {
    if (!token) return null;
    const parts = token.split(".");
    if (parts.length !== 2) return null;
    const [payloadPart, signature] = parts;
    const expected = this.signature(payloadPart);
    const signatureBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expected);
    if (signatureBuffer.length !== expectedBuffer.length || !timingSafeEqual(signatureBuffer, expectedBuffer)) return null;
    try {
      const payload = JSON.parse(Buffer.from(payloadPart, "base64url").toString("utf8")) as TokenPayload;
      if (payload.exp <= Math.floor(Date.now() / 1000)) return null;
      if (payload.user) return payload.user;
      if (payload.role === "admin") return this.mockUsers.find((item) => item.role === "super_admin") || null;
      return null;
    } catch {
      return null;
    }
  }

  cookieOptions(): string {
    return `HttpOnly; Path=/; SameSite=Lax; Max-Age=${this.sessionMaxAgeSeconds}`;
  }

  clearCookieOptions(): string {
    return "HttpOnly; Path=/; SameSite=Lax; Max-Age=0";
  }

  mockLoginUsers(): AppUser[] {
    return this.mockUsers;
  }

  private sign(payload: TokenPayload): string {
    const payloadPart = base64url(JSON.stringify(payload));
    return `${payloadPart}.${this.signature(payloadPart)}`;
  }

  private expiresAt(): number {
    return Math.floor(Date.now() / 1000) + this.sessionMaxAgeSeconds;
  }

  private signature(payloadPart: string): string {
    return createHmac("sha256", this.secret).update(payloadPart).digest("base64url");
  }
}

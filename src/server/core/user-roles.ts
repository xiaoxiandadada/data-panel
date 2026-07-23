import type { AppUser, UserRole } from "./types.js";

const rolePriority: UserRole[] = ["super_admin", "delivery_admin", "requester", "member"];
const adminRoles = new Set<UserRole>(["super_admin", "delivery_admin"]);

export function rolesForUser(user: AppUser | null | undefined): UserRole[] {
  if (!user) return [];
  return normalizeUserRoles([...(user.roles || []), user.role]);
}

export function hasUserRole(user: AppUser | null | undefined, role: UserRole): boolean {
  return rolesForUser(user).includes(role);
}

export function hasAdminRole(user: AppUser | null | undefined): boolean {
  return rolesForUser(user).some((role) => adminRoles.has(role));
}

export function normalizeUserRoles(roles: UserRole[]): UserRole[] {
  const normalized = new Set<UserRole>(roles.filter(Boolean));
  if (normalized.size > 1) normalized.delete("member");
  if (!normalized.size) normalized.add("member");
  return rolePriority.filter((role) => normalized.has(role));
}

export function primaryUserRole(roles: UserRole[]): UserRole {
  return normalizeUserRoles(roles)[0] || "member";
}

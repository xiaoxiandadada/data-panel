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

/**
 * Decides which administrative roles a login writes back, reconciling deployment configuration
 * against what the super administrator has since changed in MongoDB.
 *
 * `delivery_admin` from the environment (open_id, email or the name whitelist) only bootstraps a
 * user the first time they log in; afterwards MongoDB wins, so a role the super administrator
 * removed is not silently restored on the next login. `super_admin` is the exception: the
 * appointment endpoint refuses to create one, which makes deployment configuration the only path
 * that exists — ignoring it for an existing user would make appointing a new super administrator
 * impossible for anyone who has ever logged in.
 */
export function mergeAdministrativeRoles(
  storedRoles: UserRole[],
  configuredRoles: UserRole[],
  userExists: boolean
): UserRole[] {
  const administrative = (roles: UserRole[]) => roles.filter((role) => adminRoles.has(role));
  const configured = administrative(configuredRoles);
  if (!userExists) return normalizeUserRoles(configured);
  return normalizeUserRoles([
    ...administrative(storedRoles),
    ...configured.filter((role) => role === "super_admin")
  ]);
}

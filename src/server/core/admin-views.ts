import type { AppUser, Dataset, FieldValue } from "./types.js";
import { hasAdminRole, hasUserRole } from "./user-roles.js";

export function isSuperAdmin(user: AppUser | null | undefined): boolean {
  return hasUserRole(user, "super_admin");
}

export function projectDatasetForAdmin(dataset: Dataset, user: AppUser | null | undefined): Dataset {
  return hasAdminRole(user) ? dataset : { ...dataset, fields: [], records: [] };
}

export function canEditAdminFields(
  user: AppUser | null | undefined,
  fields: Record<string, FieldValue>
): boolean {
  return hasAdminRole(user) && Boolean(fields);
}

export function canReadLogField(user: AppUser | null | undefined, field: string | undefined): boolean {
  return hasAdminRole(user) || !field;
}

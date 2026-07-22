export type FieldValue = string | number | boolean | null | undefined | FieldValue[] | Record<string, unknown>;

export interface DatasetField {
  id: string;
  name: string;
  type?: string;
}

export interface LedgerRecord {
  record_id: string;
  fields: Record<string, FieldValue>;
}

export interface DatasetMeta {
  status?: string;
  title?: string;
  sourceUrl?: string;
  syncedAt?: string;
  message?: string;
  totalRecords?: number;
}

export interface Dataset {
  meta: DatasetMeta;
  fields: DatasetField[];
  records: LedgerRecord[];
}

export interface LedgerLog {
  id: string;
  record_id: string;
  type: string;
  field: string;
  before: string;
  after: string;
  actor: string;
  role: string;
  note: string;
  createdAt: string;
}

export type UserRole = "requester" | "delivery_admin" | "super_admin";

export interface AppUser {
  openId: string;
  name: string;
  email: string;
  avatar?: string;
  department: string;
  role: UserRole;
  roles?: UserRole[];
}

export interface UserFieldPreferences {
  openId: string;
  hiddenFields: string[];
  fieldOrder: string[];
  updatedAt: string;
}

export interface ImportBatch {
  id: string;
  source: string;
  fileName: string;
  mode: "excel" | "lark" | "api";
  total: number;
  inserted: number;
  updated: number;
  unchanged: number;
  conflicts: number;
  actor: string;
  createdAt: string;
}

export interface NotificationLog {
  id: string;
  eventName: string;
  recordId: string;
  status: "sent" | "partial" | "skipped" | "failed";
  recipients: string[];
  attempts: number;
  error: string;
  createdAt: string;
}

export interface QueueEvent {
  id: string;
  eventName: string;
  payload: Record<string, unknown>;
  attempts: number;
  createdAt: string;
}

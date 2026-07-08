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

export type UserRole = "requester" | "delivery_admin" | "purchase_admin" | "super_admin";

export interface AppUser {
  openId: string;
  name: string;
  email: string;
  avatar?: string;
  department: string;
  role: UserRole;
}

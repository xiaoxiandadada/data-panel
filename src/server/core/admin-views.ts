import type { AppUser, Dataset, FieldValue } from "./types.js";
import { hasAdminRole, hasUserRole } from "./user-roles.js";

export interface AdminFieldView {
  id: string;
  owner: string;
  fields: string[];
}

// Mirrors the field ownership defined in the source ledger. Super admins are
// intentionally excluded here because they receive the complete ledger.
export const adminFieldViews: AdminFieldView[] = [
  {
    id: "gu-yuying",
    owner: "顾语莺",
    fields: ["需求澄清完成时间", "需求文档", "获取渠道", "解决方案负责人", "正式询价邮件时间", "采购反馈预报价时间", "获取状态"]
  },
  {
    id: "gao-wang",
    owner: "高骊骏 王志",
    fields: ["开始执行时间", "承接方", "数据平台ID", "需求异常原因", "入库地址", "交付异常反馈", "交付异常原因", "实际交付完成日期", "数据平台地址", "期望交付日期", "阻塞项", "一验通过时间", "实际验收通过时间", "项目备注", "承接方责任人", "计划验收完成时间", "供应商承诺交付日期", "获取状态"]
  },
  {
    id: "guo-xianmiao",
    owner: "郭显淼",
    fields: ["Sprint", "预算金额", "需求OA完成时间", "任务代码", "获取状态"]
  },
  {
    id: "acceptance",
    owner: "高骊骏",
    fields: ["验收结论", "验收备注", "实际验收通过时间", "验收通过数据量（个）", "验收通过交付量(GB)"]
  },
  {
    id: "skill",
    owner: "王志",
    fields: ["作业技能标签", "领域或学科", "需求异常原因", "项目备注"]
  }
];

const contextFields = ["项目名称", "获取状态", "隶属部门", "项目对接人", "需求负责人", "需求人", "关注人", "Sprint"];

function normalize(value: string | undefined): string {
  return String(value || "").trim().toLowerCase();
}

function ownerNames(owner: string): string[] {
  return owner.split(/[、,，/\s]+/).map((name) => normalize(name)).filter(Boolean);
}

export function isSuperAdmin(user: AppUser | null | undefined): boolean {
  return hasUserRole(user, "super_admin");
}

export function fieldViewsForUser(user: AppUser | null | undefined): AdminFieldView[] {
  if (!user || !hasAdminRole(user)) return [];
  if (isSuperAdmin(user)) return adminFieldViews;
  const name = normalize(user.name);
  return adminFieldViews.filter((view) => ownerNames(view.owner).includes(name));
}

export function editableFieldsForUser(user: AppUser | null | undefined): Set<string> {
  if (isSuperAdmin(user)) return new Set(["*"]);
  return new Set(fieldViewsForUser(user).flatMap((view) => view.fields));
}

export function projectDatasetForAdmin(dataset: Dataset, user: AppUser | null | undefined): Dataset {
  if (isSuperAdmin(user)) return dataset;
  const visible = new Set([...contextFields, ...editableFieldsForUser(user)]);
  const fields = dataset.fields.filter((field) => visible.has(field.name || field.id));
  return {
    ...dataset,
    fields,
    records: dataset.records.map((record) => ({
      ...record,
      fields: Object.fromEntries(
        Object.entries(record.fields || {}).filter(([field]) => visible.has(field))
      ) as Record<string, FieldValue>
    }))
  };
}

export function canEditAdminFields(user: AppUser | null | undefined, fields: Record<string, FieldValue>): boolean {
  const editable = editableFieldsForUser(user);
  return editable.has("*") || Object.keys(fields || {}).every((field) => editable.has(field));
}

export function canReadLogField(user: AppUser | null | undefined, field: string | undefined): boolean {
  if (isSuperAdmin(user) || !field) return true;
  return editableFieldsForUser(user).has(field);
}

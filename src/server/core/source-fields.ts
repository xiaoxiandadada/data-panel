import type { Dataset, FieldValue, LedgerRecord } from "./types.js";

export type LarkSourceKey = "ledger" | "corpus" | "pool" | "gaofeng" | "clarify";

/**
 * Column-name translation from each Feishu source table into the 数据团队总表 vocabulary, which is the
 * ledger's canonical one.
 *
 * The four tables describe the same requirements but were built by different teams, so the same
 * concept carries a different column name in each. Without translating on read, a merged row ends up
 * with two half-populated columns for one fact — and, more importantly, 需求池's `需求方` never lands
 * in `需求人`, the field `requesterRecords` matches on, so a requester cannot see their own
 * requirement at all.
 *
 * Only mappings backed by a measured field inventory are listed. Two candidates were deliberately
 * rejected: `corpus.接口人` shares just 4 of 9 names with `ledger.项目对接人`, and
 * `pool.当前状态跟进人员` shares 4 of 10 with `ledger.内部责任人` — too little overlap to be the same
 * role, and aliasing them would fabricate ownership and hand people visibility they should not have.
 */
const sourceFieldAliases: Record<LarkSourceKey, Array<readonly [string, string]>> = {
  // The canonical table needs no translation.
  ledger: [],
  pool: [
    // 需求池 has no 项目名称 at all; 需求描述 is its title column (689/689).
    ["需求描述", "项目名称"],
    // The whole point of syncing this table: it is the only source of requester identity.
    ["需求方", "需求人"],
    ["进展状态", "获取状态"],
    ["提出时间", "需求提出时间"],
    ["期望交付时间", "期望交付日期"],
    ["完成日期", "实际交付完成日期"],
    ["所属部门", "隶属部门"],
    ["学科", "领域或学科"],
    ["预算（任务确认对接填写）", "预算金额"]
  ],
  corpus: [
    // 17 of 25 names also appear in ledger.项目对接人, so this is the requester side.
    ["内部需求方", "需求人"],
    ["供应商承诺交付完成时期", "供应商承诺交付日期"],
    ["签收数量（GB）", "签收交付量（GB）"]
  ],
  gaofeng: [
    // Same concept, different brackets: 高峰 writes full-width （GB）, the ledger half-width (GB).
    // Left unaliased these stay two separate columns forever.
    ["验收通过交付量（GB）", "验收通过交付量(GB)"]
  ],
  clarify: [
    // 待澄清项目 is a 7-column triage table; every one of its columns except 专项归口 has a ledger
    // equivalent under a different name.
    ["需求名称", "项目名称"],
    ["需求方", "需求人"],
    ["需求部门", "隶属部门"],
    // Same {link, text} shape as ledger.需求文档, just scoped "对外".
    ["需求文档（对外）", "需求文档"],
    // Measured, not guessed: 需求类型 only ever holds 内部采集 / 外部采集 / 外部采购, which is the
    // 获取渠道 vocabulary. It is emphatically not 作业技能标签 — that column holds 学历-本科 style tags.
    ["需求类型", "获取渠道"]
  ]
};

/**
 * Constants a source contributes to every one of its rows, applied only where the record has no value
 * of its own.
 *
 * 待澄清项目 has no status column, because the table itself *is* the status: a requirement sitting in
 * it is by definition still being clarified. Its 34 rows that exist in no other table would otherwise
 * land in the ledger under 未设置 and disappear from every stage view. 需求澄清中 is the same status
 * `demandToLedgerFields` stamps on a requirement submitted through this application, so the two intake
 * paths stay consistent, and because 待澄清项目 syncs before the tables that own delivery progress, a
 * real status always wins over this default.
 */
const sourceFieldDefaults: Partial<Record<LarkSourceKey, Array<readonly [string, FieldValue]>>> = {
  clarify: [["获取状态", "需求澄清中"]]
};

function isEmpty(value: FieldValue): boolean {
  if (value === null || value === undefined) return true;
  if (Array.isArray(value)) return value.length === 0;
  return String(typeof value === "object" ? JSON.stringify(value) : value).trim() === "";
}

/**
 * Copies aliased values onto their canonical column names, keeping the original column too: the
 * source spelling still carries information an admin may want, and dropping data is worse than an
 * extra column an admin can hide. An alias never overwrites a canonical value that is already
 * present, so a table holding both spellings keeps its canonical one.
 */
export function applySourceFieldAliases(key: LarkSourceKey, fields: Record<string, FieldValue>): Record<string, FieldValue> {
  const aliases = sourceFieldAliases[key];
  const defaults = sourceFieldDefaults[key];
  if (!aliases?.length && !defaults?.length) return fields;
  const mapped: Record<string, FieldValue> = { ...fields };
  for (const [from, to] of aliases || []) {
    if (isEmpty(mapped[from]) || !isEmpty(mapped[to])) continue;
    mapped[to] = mapped[from];
  }
  // After the aliases, so a column the source actually carries always beats the constant.
  for (const [name, value] of defaults || []) {
    if (!isEmpty(mapped[name])) continue;
    mapped[name] = value;
  }
  return mapped;
}

/** Dataset-level wrapper: aliases every record, then rebuilds the field list so the merge picks up
 * the canonical names as real columns. */
export function applySourceAliasesToDataset(key: LarkSourceKey, dataset: Dataset): Dataset {
  if (!sourceFieldAliases[key]?.length && !sourceFieldDefaults[key]?.length) return dataset;
  const records: LedgerRecord[] = (dataset.records || []).map((record) => ({
    ...record,
    fields: applySourceFieldAliases(key, record.fields || {})
  }));
  const names = [...new Set(records.flatMap((record) => Object.keys(record.fields || {})))];
  return {
    ...dataset,
    fields: names.map((name) => ({
      id: name,
      name,
      type: (dataset.fields || []).find((field) => (field.name || field.id) === name)?.type || "text"
    })),
    records
  };
}

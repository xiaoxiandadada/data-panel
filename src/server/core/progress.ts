import { cell, normalizeText, stringifyCell } from "./ledger-utils.js";
import type { FieldValue, LedgerRecord } from "./types.js";

/**
 * One quantified delivery stage.
 *
 * `start`/`end` carve the 0–100 axis into bands so a percentage always says which stage a
 * requirement is in — 63% can only ever mean "生产中", never "somewhere between 验收 and 结算".
 * `evidence` are the milestone columns that refine the position *inside* the band, which is what
 * turns a coarse status into a number: two requirements both reading 数据采集中 no longer report the
 * same 68% when one of them has an 开始执行时间 on record and the other does not.
 */
export interface ProgressStage {
  key: string;
  label: string;
  description: string;
  start: number;
  end: number;
  statuses: readonly string[];
  evidence: readonly string[];
}

/**
 * The stage ladder, in order. Bands are deliberately uneven: 数据生产 is the longest span because it
 * is where requirements actually spend their time, and 结算收尾 is narrow because a requirement that
 * reaches it is effectively delivered.
 *
 * The ladder starts at 3, not 0. 0% is reserved for requirements that could not be placed at all —
 * cancelled, or carrying a status this model does not know — so a caller can read 0 as "no measurable
 * progress" without having to also check the outcome.
 */
export const progressStages: readonly ProgressStage[] = [
  {
    key: "intake",
    label: "需求受理",
    description: "需求已登记，尚未开始澄清",
    start: 3,
    end: 12,
    statuses: ["待开始", "pending", "需求提出", "排队中"],
    evidence: ["需求提出时间"]
  },
  {
    key: "clarify",
    label: "需求澄清",
    description: "与需求方对齐范围、口径与验收标准",
    start: 12,
    end: 26,
    statuses: ["需求澄清中", "内采排队中"],
    evidence: ["需求澄清完成时间"]
  },
  {
    key: "solution",
    label: "方案与审批",
    description: "解决方案设计及 OA / 合同审批",
    start: 26,
    end: 44,
    statuses: ["解决方案中", "方案审批中", "需求OA中", "合同OA审批中"],
    evidence: ["解决方案对接时间", "解决方案对接完成时间"]
  },
  {
    key: "sourcing",
    label: "采购与供应商",
    description: "采购调研、比价与供应商确定",
    start: 44,
    end: 58,
    statuses: ["采购调研中", "供应商选择中", "数据采购中", "采购中"],
    evidence: ["采购反馈预报价时间", "采购预报价时间", "合同签订时间"]
  },
  {
    key: "production",
    label: "数据生产",
    description: "采集、标注、入库执行中",
    start: 58,
    end: 80,
    // 返工 and 已停滞 live here rather than in 交付验收: rework sends the work back to production, and
    // reporting a stalled requirement at 88% would be the single most misleading number in the view.
    // Both carry a flag so the stage bar can show *why* they sit lower than their status suggests.
    statuses: ["进行中", "数据采集中", "采集中", "数据标注中", "标注中", "转语料库执行", "返工", "已停滞", "风险/异常"],
    evidence: ["开始执行时间", "期望交付日期"]
  },
  {
    key: "acceptance",
    label: "交付验收",
    description: "已交付，需求方验收中",
    start: 80,
    end: 92,
    statuses: ["验收中"],
    evidence: ["实际交付完成日期", "首次全量交付时间", "验收通过交付量(GB)"]
  },
  {
    key: "settlement",
    label: "结算收尾",
    description: "验收通过，结算与归档中",
    start: 92,
    // Stops at 99, not 100: the gap to `closed` is deliberate, so a requirement still being settled can
    // never report the same number as one that is actually done.
    end: 99,
    statuses: ["待结算"],
    evidence: ["结算金额", "结算完成时间"]
  },
  {
    key: "closed",
    label: "已完结",
    description: "交付完成并归档",
    start: 100,
    end: 100,
    statuses: ["已完结", "已完成/已有", "已有", "历史已入库", "已上线", "验收通过"],
    evidence: []
  }
];

/** Statuses that end the requirement without delivering it. */
export const cancelledStatuses: readonly string[] = ["需求取消", "取消", "已取消", "作废"];

const blockedStatuses = new Set(["已停滞", "风险/异常"].map(normalizeText));
const reworkStatuses = new Set(["返工"].map(normalizeText));

export type ProgressOutcome = "delivered" | "cancelled" | "in-progress" | "unknown";
export type ProgressStageState = "done" | "current" | "todo";

export interface ProgressStageView {
  key: string;
  label: string;
  description: string;
  start: number;
  end: number;
  state: ProgressStageState;
}

export interface ProgressDetail {
  /** 0–100. Cancelled and unplaceable requirements report 0 — see `countsTowardAverage`. */
  percent: number;
  status: string;
  stageKey: string | null;
  stageLabel: string;
  stageIndex: number;
  outcome: ProgressOutcome;
  /**
   * False for cancelled and unknown-status requirements. A cancelled requirement was never delivered,
   * so scoring it 100% (which the old flat map did) inflated every average it appeared in; a
   * requirement with no status at all cannot be placed on the ladder, so counting it as 0% would
   * understate the same average. Both are reported separately instead of quietly folded in.
   */
  countsTowardAverage: boolean;
  /** Milestone columns for the current stage that carry a value, and how many were expected. */
  evidenceFilled: number;
  evidenceTotal: number;
  flags: string[];
  stages: ProgressStageView[];
}

const stageByStatus = new Map<string, number>();
for (const [index, stage] of progressStages.entries()) {
  for (const status of stage.statuses) stageByStatus.set(normalizeText(status), index);
}
const cancelledSet = new Set(cancelledStatuses.map(normalizeText));

function hasValue(record: LedgerRecord, field: string): boolean {
  const text = stringifyCell(record.fields?.[field] as FieldValue).trim();
  // 期望交付日期 is a text column in the 总表 and legitimately holds placeholders like 最大值（待填）,
  // which must not count as a milestone having been reached.
  return Boolean(text) && !/^(待填|最大值|n\/a|无|-)/i.test(text);
}

function stageViews(currentIndex: number): ProgressStageView[] {
  return progressStages.map((stage, index) => ({
    key: stage.key,
    label: stage.label,
    description: stage.description,
    start: stage.start,
    end: stage.end,
    state: index < currentIndex ? "done" : index === currentIndex ? "current" : "todo"
  }));
}

function detailFlags(record: LedgerRecord, statusKey: string): string[] {
  const flags: string[] = [];
  if (blockedStatuses.has(statusKey)) flags.push("blocked");
  if (reworkStatuses.has(statusKey)) flags.push("rework");
  if (cell(record, "阻塞项").trim() && !flags.includes("blocked")) flags.push("blocked");
  return flags;
}

/**
 * Places one requirement on the stage ladder and turns that position into a percentage.
 *
 * Replaces a flat status→percent table that only covered 18 spellings: of the 26 statuses actually
 * present in the Base, 12 were missing and fell through to a group heuristic that reported every
 * unrecognised in-flight status as exactly 60%. Anything still unknown here reports 0% and is
 * excluded from averages rather than guessed at.
 */
export function progressDetail(record: LedgerRecord): ProgressDetail {
  const status = cell(record, "获取状态").trim();
  const statusKey = normalizeText(status);
  const base = {
    status: status || "未设置",
    evidenceFilled: 0,
    evidenceTotal: 0,
    flags: [] as string[]
  };

  if (!statusKey) {
    return { ...base, percent: 0, stageKey: null, stageLabel: "未设置", stageIndex: -1, outcome: "unknown", countsTowardAverage: false, stages: stageViews(-1) };
  }
  if (cancelledSet.has(statusKey)) {
    return { ...base, percent: 0, stageKey: null, stageLabel: status, stageIndex: -1, outcome: "cancelled", countsTowardAverage: false, stages: stageViews(-1) };
  }

  const index = stageByStatus.get(statusKey);
  if (index == null) {
    return { ...base, percent: 0, stageKey: null, stageLabel: status, stageIndex: -1, outcome: "unknown", countsTowardAverage: false, stages: stageViews(-1) };
  }

  const stage = progressStages[index];
  const evidenceTotal = stage.evidence.length;
  const evidenceFilled = stage.evidence.filter((field) => hasValue(record, field)).length;
  // A stage with no milestone columns of its own sits mid-band: we know which stage it is in and have
  // no evidence to place it more precisely, and claiming either edge would be inventing precision.
  const fraction = evidenceTotal ? evidenceFilled / evidenceTotal : 0.5;
  const flags = detailFlags(record, statusKey);
  const span = stage.end - stage.start;
  // A flagged requirement never advances past the middle of its band — 返工 and 已停滞 describe work
  // that moved backwards, so letting milestone evidence push them to the band ceiling would report
  // them as nearly done.
  const effective = flags.length ? Math.min(fraction, 0.5) : fraction;

  return {
    ...base,
    percent: Math.round(stage.start + (span * effective)),
    stageKey: stage.key,
    stageLabel: stage.label,
    stageIndex: index,
    outcome: stage.key === "closed" ? "delivered" : "in-progress",
    countsTowardAverage: true,
    evidenceFilled,
    evidenceTotal,
    flags,
    stages: stageViews(index)
  };
}

export interface ProgressSummary {
  total: number;
  /** Requirements the average is computed over: total minus cancelled minus unplaceable. */
  measured: number;
  averagePercent: number;
  deliveredCount: number;
  inProgressCount: number;
  cancelledCount: number;
  unknownCount: number;
  blockedCount: number;
  reworkCount: number;
  byStage: Array<{ key: string; label: string; count: number }>;
}

/** Aggregate for the requester header and the public API, so both quote the same denominator. */
export function progressSummary(records: LedgerRecord[]): ProgressSummary {
  const details = records.map((record) => progressDetail(record));
  const measured = details.filter((detail) => detail.countsTowardAverage);
  const stageCounts = new Map(progressStages.map((stage) => [stage.key, 0]));
  for (const detail of details) {
    if (detail.stageKey == null) continue;
    stageCounts.set(detail.stageKey, (stageCounts.get(detail.stageKey) || 0) + 1);
  }
  return {
    total: details.length,
    measured: measured.length,
    averagePercent: measured.length
      ? Math.round(measured.reduce((sum, detail) => sum + detail.percent, 0) / measured.length)
      : 0,
    deliveredCount: details.filter((detail) => detail.outcome === "delivered").length,
    inProgressCount: details.filter((detail) => detail.outcome === "in-progress").length,
    cancelledCount: details.filter((detail) => detail.outcome === "cancelled").length,
    unknownCount: details.filter((detail) => detail.outcome === "unknown").length,
    blockedCount: details.filter((detail) => detail.flags.includes("blocked")).length,
    reworkCount: details.filter((detail) => detail.flags.includes("rework")).length,
    byStage: progressStages.map((stage) => ({ key: stage.key, label: stage.label, count: stageCounts.get(stage.key) || 0 }))
  };
}

/**
 * The whole vocabulary, serialized. The browser and external callers evaluate progress against this
 * instead of carrying their own copy of the status table — the client used to keep a second,
 * already-diverged copy of the percentages, and two tables mean two answers for the same requirement.
 */
export function progressModel() {
  return {
    version: 2,
    statusField: "获取状态",
    blockerField: "阻塞项",
    placeholderPattern: "^(待填|最大值|n/a|无|-)",
    cancelledStatuses,
    blockedStatuses: ["已停滞", "风险/异常"],
    reworkStatuses: ["返工"],
    stages: progressStages.map((stage) => ({
      key: stage.key,
      label: stage.label,
      description: stage.description,
      start: stage.start,
      end: stage.end,
      statuses: stage.statuses,
      evidence: stage.evidence
    }))
  };
}

/** Per-record progress without the `stages` array, which the client rebuilds from the model. */
export type CompactProgress = Omit<ProgressDetail, "stages"> & { stageCount: number };

export interface RecordWithProgress extends LedgerRecord {
  progress: CompactProgress;
}

/**
 * Attaches the authoritative progress to each record on its way to a client.
 *
 * `source` must be the *unnarrowed* records. This is the whole point of the function: both
 * `publicDataset` and `projectDatasetForAdmin` drop columns the recipient is not entitled to, and the
 * milestone columns the stage refinement reads are among them — 结算金额 and 实际交付完成日期 have no
 * business being in a requester's browser. Computing progress from the narrowed record instead
 * silently under-reports it: 缅甸语视频 came out 80% in the browser and 88% through `/api/v1`, the same
 * two-answers-per-requirement problem this module exists to remove. Records are matched by
 * `record_id`, which every projection preserves.
 *
 * `stages` is dropped because it is identical for every record at the same stage; the client
 * reconstructs it from `stageIndex` plus the model it already fetched, which keeps a 6974-record admin
 * payload from carrying 55k redundant stage objects.
 */
export function attachProgress<T extends { records: LedgerRecord[] }>(
  projected: T,
  source: readonly LedgerRecord[] = projected.records
): T & { records: RecordWithProgress[] } {
  const byId = new Map((source || []).map((record) => [record.record_id, record]));
  return {
    ...projected,
    records: (projected.records || []).map((record) => {
      const { stages, ...compact } = progressDetail(byId.get(record.record_id) || record);
      return { ...record, progress: { ...compact, stageCount: stages.length } };
    })
  };
}

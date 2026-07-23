import { Injectable } from "@nestjs/common";
import { cell, stringifyCell } from "../core/ledger-utils.js";
import type { Dataset, LedgerRecord } from "../core/types.js";

const DAY_MS = 86_400_000;

const dateFields = {
  proposed: ["需求提出时间"],
  clarified: ["需求澄清完成时间"],
  solution: ["解决方案对接时间", "解决方案对接完成时间", "解决方案对接日期"],
  quotation: ["采购反馈预报价时间", "采购预报价时间"],
  started: ["开始执行时间"],
  expected: ["预计交付时间", "期望交付日期", "供应商承诺交付日期", "计划交付日期"],
  delivered: ["实际交付完成日期", "首次全量交付时间", "实际交付", "实际完成日期"]
} as const;

const stages = [
  { key: "proposed_to_clarified", label: "需求提出→需求澄清完成", start: dateFields.proposed, end: dateFields.clarified },
  { key: "clarified_to_quotation", label: "需求澄清→采购反馈预报价", start: dateFields.clarified, end: dateFields.quotation },
  { key: "proposed_to_solution", label: "需求提出→解决方案对接", start: dateFields.proposed, end: dateFields.solution },
  { key: "quotation_to_started", label: "采购反馈预报价→开始执行", start: dateFields.quotation, end: dateFields.started },
  { key: "started_to_delivered", label: "开始执行→实际交付", start: dateFields.started, end: dateFields.delivered },
  { key: "proposed_to_delivered", label: "需求提出→实际交付（全流程）", start: dateFields.proposed, end: dateFields.delivered }
] as const;

interface Summary {
  sampleCount: number;
  averageDays: number | null;
  medianDays: number | null;
  standardDeviationDays: number | null;
}

function rounded(value: number): number {
  return Number(value.toFixed(2));
}

function summarize(values: number[]): Summary {
  if (!values.length) {
    return { sampleCount: 0, averageDays: null, medianDays: null, standardDeviationDays: null };
  }
  const sorted = [...values].sort((left, right) => left - right);
  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  const middle = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  const variance = values.length > 1
    ? values.reduce((sum, value) => sum + ((value - average) ** 2), 0) / (values.length - 1)
    : 0;
  return {
    sampleCount: values.length,
    averageDays: rounded(average),
    medianDays: rounded(median),
    standardDeviationDays: rounded(Math.sqrt(variance))
  };
}

export function parseLedgerDate(value: unknown): Date | null {
  const text = stringifyCell(value as never).trim();
  if (!text || /待填|最大值|n\/a/i.test(text)) return null;
  if (/^\d{10,13}$/.test(text)) {
    const numeric = Number(text);
    const date = new Date(text.length === 10 ? numeric * 1000 : numeric);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const timestamp = Date.parse(text.replace(/\//g, "-").replace(/\./g, "-"));
  return Number.isFinite(timestamp) ? new Date(timestamp) : null;
}

function firstDate(record: LedgerRecord, fields: readonly string[]): Date | null {
  for (const field of fields) {
    const date = parseLedgerDate(record.fields?.[field]);
    if (date) return date;
  }
  return null;
}

function recordQuarter(record: LedgerRecord): string {
  const sprintMatch = cell(record, "Sprint").match(/(?:SP)?\s*(\d+)/i);
  const sprint = sprintMatch ? Number(sprintMatch[1]) : 0;
  if (sprint >= 18 && sprint <= 27) return "Q1";
  if (sprint >= 28 && sprint <= 38) return "Q2";
  if (sprint >= 39 && sprint <= 51) return "Q3";
  if (sprint >= 52) return "Q4";
  const proposed = firstDate(record, dateFields.proposed);
  return proposed ? `Q${Math.floor(proposed.getMonth() / 3) + 1}` : "未分组";
}

function durationDays(record: LedgerRecord, startFields: readonly string[], endFields: readonly string[]): number | null {
  const start = firstDate(record, startFields);
  const end = firstDate(record, endFields);
  if (!start || !end) return null;
  const duration = (end.getTime() - start.getTime()) / DAY_MS;
  return Number.isFinite(duration) && duration >= 0 ? duration : null;
}

function improvement(q1: Summary, q2: Summary): number | null {
  if (q1.averageDays == null || q2.averageDays == null || q1.averageDays <= 0) return null;
  return rounded(((q1.averageDays - q2.averageDays) / q1.averageDays) * 100);
}

function deviationSummary(values: number[]) {
  const summary = summarize(values);
  return {
    ...summary,
    earlyCount: values.filter((value) => value < 0).length,
    onTimeCount: values.filter((value) => Math.abs(value) < 0.01).length,
    delayedCount: values.filter((value) => value > 0).length
  };
}

export function analyzeDeliveryEfficiency(dataset: Dataset) {
  const records = dataset.records || [];
  const stageMetrics = stages.map((stage) => {
    const q1Values: number[] = [];
    const q2Values: number[] = [];
    for (const record of records) {
      const value = durationDays(record, stage.start, stage.end);
      if (value == null) continue;
      const quarter = recordQuarter(record);
      if (quarter === "Q1") q1Values.push(value);
      if (quarter === "Q2") q2Values.push(value);
    }
    const q1 = summarize(q1Values);
    const q2 = summarize(q2Values);
    return { key: stage.key, label: stage.label, q1, q2, improvementPercent: improvement(q1, q2) };
  });

  const deviations: Record<string, number[]> = { Q1: [], Q2: [] };
  const sourceDeviations = new Map<string, Record<string, number[]>>();
  const sprintCounts = new Map<string, number>();
  let analyzableRecords = 0;

  for (const record of records) {
    if (stages.some((stage) => durationDays(record, stage.start, stage.end) != null)) analyzableRecords += 1;
    const sprint = cell(record, "Sprint").trim();
    if (sprint) sprintCounts.set(sprint, (sprintCounts.get(sprint) || 0) + 1);
    const expected = firstDate(record, dateFields.expected);
    const delivered = firstDate(record, dateFields.delivered);
    if (!expected || !delivered) continue;
    const deviation = (delivered.getTime() - expected.getTime()) / DAY_MS;
    const quarter = recordQuarter(record);
    if (quarter === "Q1" || quarter === "Q2") deviations[quarter].push(deviation);
    const sources = cell(record, "数据来源").split(/[、,，]/).map((item) => item.trim()).filter(Boolean);
    for (const source of sources.length ? sources : ["未标记来源"]) {
      const byQuarter = sourceDeviations.get(source) || { Q1: [], Q2: [] };
      if (quarter === "Q1" || quarter === "Q2") byQuarter[quarter].push(deviation);
      sourceDeviations.set(source, byQuarter);
    }
  }

  return {
    totalRecords: records.length,
    analyzableRecords,
    stages: stageMetrics,
    deliveryDeviation: {
      q1: deviationSummary(deviations.Q1),
      q2: deviationSummary(deviations.Q2)
    },
    bySource: [...sourceDeviations.entries()]
      .map(([source, values]) => ({ source, q1: deviationSummary(values.Q1), q2: deviationSummary(values.Q2) }))
      .sort((left, right) => left.source.localeCompare(right.source, "zh-CN")),
    sprintCounts: [...sprintCounts.entries()]
      .map(([sprint, count]) => ({ sprint, count }))
      .sort((left, right) => {
        const leftNumber = Number(left.sprint.match(/\d+/)?.[0] || 0);
        const rightNumber = Number(right.sprint.match(/\d+/)?.[0] || 0);
        return leftNumber - rightNumber;
      })
  };
}

@Injectable()
export class DeliveryEfficiencyService {
  analyze(dataset: Dataset) {
    return analyzeDeliveryEfficiency(dataset);
  }
}

const DATA_URL = "./api/data";
const SEARCH_URL = "./api/search";
const TABLE_COLUMNS = [
  "项目名称",
  "任务代码",
  "获取状态",
  "隶属部门",
  "部门负责人",
  "项目对接人",
  "解决方案负责人",
  "获取渠道",
  "需求提出时间",
  "期望交付日期",
  "Sprint",
  "承接方",
  "承接方责任人",
  "2026需求编码",
  "任务耗时"
];
const VISITOR_COLUMNS = [
  "项目名称",
  "任务代码",
  "获取状态",
  "隶属部门",
  "项目对接人",
  "解决方案负责人",
  "需求提出时间",
  "期望交付日期",
  "Sprint"
];
const FILTER_FIELDS = [
  "获取状态",
  "隶属部门",
  "部门负责人",
  "项目对接人",
  "解决方案负责人",
  "获取渠道",
  "需求提出时间",
  "期望交付日期",
  "Sprint",
  "承接方",
  "承接方责任人"
];
const CORE_COLUMNS = ["项目名称", "获取状态", "隶属部门", "项目对接人", "解决方案负责人", "Sprint"];
const REQUESTER_COLUMNS = ["项目名称", "获取状态", "隶属部门", "需求负责人", "需求人", "关注人", "项目对接人", "解决方案负责人", "需求提出时间", "期望交付日期", "Sprint"];
const OWNER_FIELD_GROUPS = [
  {
    id: "gu-yuying",
    name: "顾语莺视图",
    owner: "顾语莺",
    description: "来自总表字段说明，负责方案澄清、需求文档、获取渠道、询价与方案负责人等词条。",
    fields: ["需求澄清完成时间", "需求文档", "获取渠道", "解决方案负责人", "正式询价邮件时间", "采购反馈预报价时间", "获取状态"]
  },
  {
    id: "gao-wang",
    name: "高骊骏/王志视图",
    owner: "高骊骏 王志",
    description: "来自总表字段说明，负责承接执行、交付节点、异常、验收与入库平台等词条。",
    fields: ["开始执行时间", "承接方", "数据平台ID", "需求异常原因", "入库地址", "交付异常反馈", "交付异常原因", "实际交付完成日期", "数据平台地址", "期望交付日期", "阻塞项", "一验通过时间", "实际验收通过时间", "项目备注", "承接方责任人", "计划验收完成时间", "供应商承诺交付日期", "获取状态"]
  },
  {
    id: "guo-xianmiao",
    name: "郭显淼视图",
    owner: "郭显淼",
    description: "来自总表字段说明，负责 Sprint、预算、OA 节点、任务代码等词条。",
    fields: ["Sprint", "预算金额", "需求OA完成时间", "任务代码", "获取状态"]
  },
  {
    id: "acceptance",
    name: "验收视图",
    owner: "高骊骏",
    description: "来自总表字段说明，聚合验收结论、验收备注等验收侧维护词条。",
    fields: ["验收结论", "验收备注", "实际验收通过时间", "验收通过数据量（个）", "验收通过交付量(GB)"]
  },
  {
    id: "skill",
    name: "标签视图",
    owner: "王志",
    description: "来自总表字段说明，负责作业技能标签等需求分类词条。",
    fields: ["作业技能标签", "领域或学科", "需求异常原因", "项目备注"]
  },
  {
    id: "super",
    name: "超级管理员",
    owner: "超级管理员",
    description: "查看和编辑全部台账字段。",
    fields: TABLE_COLUMNS
  }
];
const DEMAND_FORM_FIELDS = [
  { name: "需求描述", type: "textarea", required: true, placeholder: "说明需要什么数据、用途、范围、质量要求" },
  { name: "需求负责人", type: "text", required: true, defaultCurrentUser: true, placeholder: "负责维护该需求和添加关注人" },
  { name: "需求人", type: "text", required: true, defaultCurrentUser: true, placeholder: "可填写多人，用顿号分隔，例如：张三、李四" },
  { name: "关注人", type: "text", placeholder: "可选，后续需求负责人也可以维护" },
  { name: "需求类型", type: "select", multiple: true, options: ["采集", "自动采集", "采购", "标注", "其他", "245"] },
  { name: "学科", type: "select", multiple: true, options: ["数学", "物理", "化学", "材料", "生命科学", "地球科学", "全部学科", "通用数据", "医学", "其他"] },
  { name: "获取渠道", type: "select", options: ["外部采集", "内部采集", "自动采集", "外部采购", "外部标注"] },
  { name: "所属部门", type: "select", options: ["数据平台中心", "大模型中心", "前沿探索中心", "自主可控", "AI4S", "生态平台中心", "安全可信AGI", "战略规划部", "战略研究与品牌", "科研服务部", "物理智能中心", "解决方案与产品中心"] },
  { name: "需求侧", type: "select", options: ["语音组", "浦语", "浦语-其他", "多模态", "灵笔组", "数据组", "其他（外部）", "其他（实验室）", "X语料库", "H语料库", "评测", "AI4S", "解决方案中心", "物理智能中心", "前沿探索", "安全可信AI中心", "生态平台中心", "数据平台中心", "大模型中心", "高原项目"] },
  { name: "期望交付时间", type: "date" },
  { name: "优先级", type: "select", options: ["P0", "P1", "P2", "P3"], description: "P0：2周内；P1：2周-1月；P2：1月以上" },
  { name: "需求文档", type: "url", placeholder: "飞书文档或说明链接" },
  { name: "245项目名称", type: "text" },
  { name: "预算归口", type: "select", options: ["245", "公共"] },
  { name: "预算（任务确认对接填写）", type: "number" },
  { name: "数量", type: "number" },
  { name: "数据量单位", type: "text", placeholder: "条、份、小时、GB 等" },
  { name: "存储容量（GB）", type: "number" },
  { name: "交付路径", type: "text" },
  { name: "备注", type: "textarea", placeholder: "当前状态阻塞项、进度说明等" }
];
const FORM_OPTION_FIELDS = new Set([
  "获取状态",
  "隶属部门",
  "部门负责人",
  "项目对接人",
  "解决方案负责人",
  "获取渠道",
  "Sprint",
  "承接方",
  "承接方责任人"
]);
const FORM_PRESET_OPTIONS = {
  "获取状态": ["需求澄清中", "需求OA中", "进行中", "已完成/已有", "待开始", "风险/异常", "已完结", "取消"],
  "获取渠道": ["内部采集", "业务提出", "飞书需求", "人工录入"],
  "承接方": ["内部", "外部供应商", "待确认"]
};
const SEARCH_FIELDS = [
  "项目名称",
  "任务代码",
  "获取状态",
  "隶属部门",
  "部门负责人",
  "项目对接人",
  "解决方案负责人",
  "获取渠道",
  "Sprint",
  "承接方",
  "承接方责任人",
  "需求文档",
  "阻塞项",
  "项目备注",
  "数据平台ID",
  "数据平台地址",
  "2026需求编码"
];
const LONG_FIELDS = new Set(["项目备注", "需求异常原因", "阻塞项", "验收备注", "交付异常原因", "入库地址", "数据平台地址"]);
const PERSON_FIELDS = new Set(["需求负责人", "需求人", "关注人", "部门负责人", "项目对接人", "解决方案负责人", "承接方责任人"]);
const MULTI_PERSON_FIELDS = new Set(["需求人", "关注人"]);
const LINK_FIELDS = new Set(["需求文档", "入库地址", "数据平台地址", "交付路径"]);
const STATUS_COLORS = {
  done: "#2f855a",
  active: "#2563eb",
  risk: "#c2410c",
  pending: "#667085",
  unknown: "#176b87"
};
const STATUS_LABEL_COLORS = {
  "已完结": "#16a34a",
  "已有": "#059669",
  "需求取消": "#dc2626",
  "待结算": "#f59e0b",
  "验收中": "#7c3aed",
  "需求澄清中": "#2563eb",
  "采购调研中": "#0891b2",
  "供应商选择中": "#ea580c",
  "数据采集中": "#4f46e5",
  "数据标注中": "#db2777",
  "数据采购中": "#be123c",
  "转语料库执行": "#0f766e",
  "pending": "#64748b",
  "未设置": "#334155"
};
const STATUS_FALLBACK_COLORS = [
  "#16a34a",
  "#dc2626",
  "#f59e0b",
  "#7c3aed",
  "#2563eb",
  "#0891b2",
  "#ea580c",
  "#4f46e5",
  "#db2777",
  "#0f766e",
  "#65a30d",
  "#be123c"
];
const STATUS_PROGRESS = {
  "未设置": 0,
  "需求取消": 100,
  "取消": 100,
  "待开始": 10,
  "pending": 10,
  "需求澄清中": 25,
  "需求OA中": 35,
  "采购调研中": 45,
  "供应商选择中": 52,
  "数据采购中": 58,
  "进行中": 62,
  "数据采集中": 68,
  "数据标注中": 72,
  "转语料库执行": 78,
  "验收中": 88,
  "待结算": 94,
  "已完成/已有": 100,
  "已有": 100,
  "已完结": 100
};

let state = {
  fields: [],
  records: [],
  publicRecords: [],
  suggestionRecords: [],
  meta: {},
  authError: "",
  authRole: "",
  currentUser: null,
  mockUsers: [],
  larkOAuthEnabled: false,
  requesterAuthMode: "login",
  query: "",
  draft: "",
  activeView: "requester",
  requesterName: "",
  requesters: [],
  requesterRecords: [],
  ownerGroupId: "gu-yuying",
  suggestionIndex: -1,
  filters: {},
  adminMode: false,
  adminToken: "",
  editingRecordId: null,
  detailRecordId: null,
  detailLogs: [],
  suggestionRequestId: 0,
  personPickerTarget: null,
  personSearchRequestId: 0,
  personPickerTimer: 0
};

const el = (id) => document.getElementById(id);

function isOAuthMode() {
  return state.larkOAuthEnabled && !state.mockUsers.length;
}

function isSuperAdmin() {
  return state.currentUser?.role === "super_admin";
}

function ownerNames(owner) {
  return String(owner || "")
    .split(/[、,，/\s]+/)
    .map((name) => normalizeText(name))
    .filter(Boolean);
}

function availableOwnerGroups() {
  if (!state.adminMode) return [];
  if (isSuperAdmin()) return OWNER_FIELD_GROUPS;
  const currentName = normalizeText(state.currentUser?.name || "");
  return OWNER_FIELD_GROUPS.filter((group) => group.id !== "super" && ownerNames(group.owner).includes(currentName));
}

function activeOwnerGroup() {
  const groups = availableOwnerGroups();
  return groups.find((item) => item.id === state.ownerGroupId) || groups[0] || null;
}

function canEditOwnerField(field) {
  if (isSuperAdmin()) return true;
  return Boolean(activeOwnerGroup()?.fields.includes(field));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/`/g, "&#096;");
}

function isUrl(value) {
  return /^https?:\/\/\S+$/i.test(String(value || "").trim());
}

function renderFieldValue(field, value) {
  const text = stringifyCell(value);
  if (!text) return "-";
  if (LINK_FIELDS.has(field) && isUrl(text)) {
    const label = field === "需求文档" ? "打开飞书文档" : "打开链接";
    return `<a class="field-link" href="${escapeAttr(text)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>`;
  }
  return escapeHtml(text);
}

function normalizeText(value) {
  return String(value || "").replace(/\u200B/g, "").trim().toLowerCase();
}

function cell(record, fieldName) {
  return stringifyCell(record.fields?.[fieldName]);
}

function stringifyCell(value) {
  if (value == null) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(stringifyCell).filter(Boolean).join("、");
  if (typeof value === "object") {
    return value.text || value.name || value.en_name || value.email || value.title || value.value || value.url || value.id || JSON.stringify(value);
  }
  return String(value);
}

function statusGroup(statusText) {
  const text = normalizeText(statusText);
  if (!text) return "unknown";
  if (/已有|已完结|完成|已上线|验收通过|done|closed|complete|resolved/.test(text)) return "done";
  if (/异常|风险|阻塞|延期|逾期|blocked|risk|delay|overdue/.test(text)) return "risk";
  if (/待|pending|未开始|计划|排期|取消|结算|todo|planned|backlog/.test(text)) return "pending";
  return "active";
}

function statusLabel(statusText) {
  return String(statusText || "").replace(/\u200B/g, "").trim() || "未设置";
}

function statusColor(label, index = 0) {
  const normalized = statusLabel(label);
  return STATUS_LABEL_COLORS[normalized] || STATUS_FALLBACK_COLORS[index % STATUS_FALLBACK_COLORS.length] || STATUS_COLORS[statusGroup(normalized)];
}

function statusProgress(statusText) {
  const label = statusLabel(statusText);
  if (Object.hasOwn(STATUS_PROGRESS, label)) return STATUS_PROGRESS[label];
  const group = statusGroup(label);
  if (group === "done") return 100;
  if (group === "risk") return 35;
  if (group === "pending") return 15;
  if (group === "active") return 60;
  return 0;
}

function averageProgress(records) {
  return records.length
    ? Math.round(records.reduce((total, record) => total + statusProgress(cell(record, "获取状态")), 0) / records.length)
    : 0;
}

function renderRequesterOptions(selectId) {
  const target = el(selectId);
  if (!target) return;
  target.innerHTML = state.requesters.length
    ? state.requesters.map((name) => `<option value="${escapeHtml(name)}" ${name === state.requesterName ? "selected" : ""}>${escapeHtml(name)}</option>`).join("")
    : `<option value="">暂无需求方</option>`;
}

function renderRequesterNameOptions() {
  const list = el("requesterNameOptions");
  if (!list) return;
  const names = [...new Set([
    ...state.mockUsers.filter((user) => user.role === "requester").map((user) => user.name),
    ...state.requesters
  ].filter(Boolean))];
  list.innerHTML = names.map((name) => `<option value="${escapeHtml(name)}"></option>`).join("");
}

function defaultRequesterName() {
  const mock = state.mockUsers.find((user) => user.role === "requester")?.name;
  return state.requesters.includes("王冠楚") ? "王冠楚" : mock || state.requesters[0] || "王冠楚";
}

function renderMeta(meta) {
  const sourceMeta = el("sourceMeta");
  if (sourceMeta) sourceMeta.textContent = `数据源：${meta.title || "本地数据"} · 最后更新：${meta.syncedAt || "未同步"}`;
}

function updateNotice(meta) {
  const notice = el("notice");
  if (state.authError || meta.status === "error" || (state.adminMode && !state.records.length)) {
    notice.classList.remove("hidden");
    notice.innerHTML = state.authError
      ? escapeHtml(state.authError)
      : meta.status === "error"
      ? `数据尚未导入：${escapeHtml(meta.message || "当前本地数据为空")}。管理员可进入管理员模式后点击“导入数据”录入。`
      : "当前本地数据为空。管理员可进入管理员模式后点击“导入数据”录入。";
  } else {
    notice.classList.add("hidden");
  }
}

function summarize(records) {
  const total = records.length;
  const done = records.filter((record) => statusGroup(cell(record, "获取状态")) === "done").length;
  const active = records.filter((record) => statusGroup(cell(record, "获取状态")) === "active").length;
  const risk = records.filter((record) => statusGroup(cell(record, "获取状态")) === "risk").length;
  const pending = records.filter((record) => statusGroup(cell(record, "获取状态")) === "pending").length;
  const unknown = records.filter((record) => statusGroup(cell(record, "获取状态")) === "unknown").length;
  const avg = total ? Math.round((done / total) * 100) : 0;
  return { total, done, active, risk, pending, unknown, avg };
}

function renderKpis(records) {
  const summary = summarize(records);
  el("totalCount").textContent = summary.total;
  el("activeCount").textContent = summary.active;
  el("doneCount").textContent = summary.done;
  el("riskCount").textContent = summary.risk;
  el("doneRatio").textContent = `${summary.total ? Math.round((summary.done / summary.total) * 100) : 0}%`;
  el("avgProgress").textContent = `${summary.avg}%`;
  el("donutValue").style.strokeDashoffset = 301.59 * (1 - summary.avg / 100);
}

function renderLegend(records) {
  const counts = records.reduce((acc, record) => {
    const label = statusLabel(cell(record, "获取状态"));
    acc[label] = (acc[label] || 0) + 1;
    return acc;
  }, {});
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "zh-CN"));
  el("statusLegend").innerHTML = entries.length ? entries.map(([label, count], index) => {
    const percent = records.length ? Math.round((count / records.length) * 100) : 0;
    const color = statusColor(label, index);
    return `
      <div class="legend-item">
        <span><i class="dot" style="background:${color}"></i>${escapeHtml(label)}</span>
        <div class="track"><div class="fill" style="width:${percent}%;min-width:${count ? "8px" : "0"};background:${color}"></div></div>
        <strong>${count}</strong>
      </div>
    `;
  }).join("") : `<div class="empty compact">暂无获取状态数据</div>`;
}

function renderOwners(records) {
  const counts = records.reduce((acc, record) => {
    const names = [cell(record, "项目对接人"), cell(record, "部门负责人"), cell(record, "解决方案负责人")]
      .join("、")
      .split(/[、,，]/)
      .map((name) => name.trim())
      .filter(Boolean);
    names.forEach((name) => {
      acc[name] = (acc[name] || 0) + 1;
    });
    return acc;
  }, {});
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const max = Math.max(1, ...entries.map(([, count]) => count));
  el("ownerCount").textContent = `${Object.keys(counts).length} 人`;
  el("ownerBars").innerHTML = entries.length ? entries.map(([name, count]) => `
    <div class="bar-row">
      <span>${escapeHtml(name)}</span>
      <div class="track"><div class="fill" style="width:${Math.round((count / max) * 100)}%"></div></div>
      <strong>${count}</strong>
    </div>
  `).join("") : `<div class="empty">暂无负责人数据</div>`;
}

function parseDate(value) {
  const text = String(value || "").trim();
  if (!text || /待填|最大值/.test(text)) return null;
  const date = new Date(text.replace(/\//g, "-").replace(/\./g, "-"));
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDate(date) {
  return new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit" }).format(date);
}

function renderTimeline(records) {
  const dated = records
    .map((record) => ({ record, date: parseDate(cell(record, "期望交付日期") || cell(record, "供应商承诺交付日期")) }))
    .filter((item) => item.date)
    .sort((a, b) => a.date - b.date)
    .slice(0, 6);
  el("timeline").innerHTML = dated.length ? dated.map(({ record, date }) => `
    <article class="timeline-item">
      <div class="timeline-date">${formatDate(date)}</div>
      <div class="timeline-title">${escapeHtml(cell(record, "项目名称"))}</div>
      <div class="timeline-foot">${escapeHtml(cell(record, "项目对接人") || cell(record, "部门负责人"))} · ${escapeHtml(cell(record, "获取状态"))}</div>
    </article>
  `).join("") : `<div class="empty">暂无截止时间数据</div>`;
}

function uniqueValues(fieldName) {
  return [...new Set(state.records.map((record) => cell(record, fieldName)).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, "zh-CN"))
    .slice(0, 200);
}

function formOptions(fieldName) {
  return [...new Set([...(FORM_PRESET_OPTIONS[fieldName] || []), ...uniqueValues(fieldName)])]
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, "zh-CN"))
    .slice(0, 120);
}

function renderFilters() {
  el("filterGrid").innerHTML = FILTER_FIELDS.map((field) => {
    const options = uniqueValues(field);
    return `
      <label class="filter-control">
        <span>${escapeHtml(field)}</span>
        <select data-filter-field="${escapeHtml(field)}">
          <option value="">全部</option>
          ${options.map((value) => `<option value="${escapeHtml(value)}" ${state.filters[field] === value ? "selected" : ""}>${escapeHtml(value)}</option>`).join("")}
        </select>
      </label>
    `;
  }).join("");

  const active = Object.entries(state.filters).filter(([, value]) => value);
  el("activeFilters").innerHTML = active.length ? `
    ${active.map(([field, value]) => `<button class="chip" type="button" data-clear-filter="${escapeHtml(field)}">${escapeHtml(field)}：${escapeHtml(value)} ×</button>`).join("")}
    <button class="chip clear" type="button" id="clearAllFilters">清空筛选</button>
  ` : "";
}

function matchesQuery(record, query) {
  const normalized = normalizeText(query);
  if (!normalized) return true;
  return SEARCH_FIELDS.some((field) => normalizeText(cell(record, field)).includes(normalized));
}

function filteredRecords() {
  const hasQuery = Boolean(state.query.trim());
  if (!state.adminMode) return state.requesterRecords;
  const sourceRecords = state.adminMode ? state.records : state.publicRecords;
  return sourceRecords.filter((record) => {
    const queryMatch = matchesQuery(record, state.query);
    const filtersMatch = state.adminMode
      ? Object.entries(state.filters).every(([field, value]) => !value || cell(record, field) === value)
      : true;
    return queryMatch && filtersMatch;
  });
}

function getSuggestions(query) {
  const normalized = normalizeText(query);
  if (!normalized) return [];
  const suggestions = [];
  const sourceRecords = state.adminMode ? state.records : state.suggestionRecords;

  sourceRecords.forEach((record) => {
    SEARCH_FIELDS.forEach((field) => {
      const value = cell(record, field);
      const index = normalizeText(value).indexOf(normalized);
      if (value && index >= 0) {
        suggestions.push({ record, field, value, score: index, title: cell(record, "项目名称") });
      }
    });
  });

  return suggestions
    .sort((a, b) => a.score - b.score || a.field.localeCompare(b.field, "zh-CN") || a.title.localeCompare(b.title, "zh-CN"))
    .slice(0, 10);
}

function highlight(value, query) {
  const text = String(value || "");
  const index = text.toLowerCase().indexOf(query.toLowerCase());
  if (index < 0) return escapeHtml(text);
  return `${escapeHtml(text.slice(0, index))}<mark>${escapeHtml(text.slice(index, index + query.length))}</mark>${escapeHtml(text.slice(index + query.length))}`;
}

function hideSuggestions() {
  const list = el("projectSuggestions");
  list.classList.add("hidden");
  list.innerHTML = "";
  el("projectSearchInput").setAttribute("aria-expanded", "false");
}

function renderSuggestions() {
  const suggestions = getSuggestions(state.draft);
  const list = el("projectSuggestions");
  if (!state.draft.trim() || !suggestions.length) {
    hideSuggestions();
    return;
  }
  list.classList.remove("hidden");
  el("projectSearchInput").setAttribute("aria-expanded", "true");
  list.innerHTML = suggestions.map((item, index) => `
    <button class="suggestion ${state.suggestionIndex === index ? "active" : ""}" type="button" data-query="${escapeHtml(item.value)}">
      <span class="suggestion-title">${highlight(item.value, state.draft)}</span>
      <span class="suggestion-meta">${escapeHtml(item.field)} · ${escapeHtml(item.title)} · ${escapeHtml(cell(item.record, "获取状态"))}</span>
    </button>
  `).join("");
}

async function fetchJson(url, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (state.adminToken) headers["x-admin-token"] = state.adminToken;
  const response = await fetch(url, { credentials: "same-origin", ...options, headers });
  const result = await response.json().catch(() => null);
  if (!response.ok) throw new Error(result?.message || "请求失败");
  return result;
}

function ensurePersonPickerDialog() {
  if (el("personPickerDialog")) return;
  const style = document.createElement("style");
  style.textContent = `
    .field-link{color:#116b83;font-weight:700;text-decoration:none}.field-link:hover{text-decoration:underline}
    .person-input-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;align-items:center;width:100%}
    .person-input-row input{min-width:0}.person-picker-dialog{width:min(680px,calc(100vw - 32px));border:1px solid #d8e1e8;border-radius:14px;padding:0;box-shadow:0 24px 70px rgba(15,23,42,.22)}
    .person-picker-body{padding:18px 22px 22px}.person-picker-search{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;margin-bottom:14px}
    .person-picker-search input{height:46px;border:1px solid #d8e1e8;border-radius:10px;padding:0 14px;font:inherit}
    .person-results{display:grid;gap:8px;max-height:360px;overflow:auto}.person-result{display:grid;grid-template-columns:1fr auto;gap:12px;text-align:left;border:1px solid #e3eaf0;background:#fff;border-radius:10px;padding:12px 14px;cursor:pointer}
    .person-result:hover{border-color:#116b83;background:#f4fbfd}.person-result strong{display:block;color:#111827}.person-result span{color:#667085;font-size:13px}.person-result small{color:#116b83;font-weight:700}.person-picker-empty{border:1px dashed #d8e1e8;border-radius:10px;padding:18px;color:#667085;text-align:center}
  `;
  document.head.appendChild(style);
  const dialog = document.createElement("dialog");
  dialog.id = "personPickerDialog";
  dialog.className = "person-picker-dialog";
  dialog.innerHTML = `
    <div class="dialog-head">
      <div>
        <h2>选择飞书人员</h2>
        <p>从企业通讯录搜索后写入当前字段</p>
      </div>
      <button id="closePersonPicker" class="icon-button" type="button" title="关闭">×</button>
    </div>
    <div class="person-picker-body">
      <div class="person-picker-search">
        <input id="personPickerSearch" type="search" autocomplete="off" placeholder="输入姓名、邮箱或账号搜索" />
        <button id="personPickerSearchButton" class="button primary" type="button">搜索</button>
      </div>
      <div id="personPickerResults" class="person-results">
        <div class="person-picker-empty">输入关键词搜索飞书人员</div>
      </div>
    </div>
  `;
  document.body.appendChild(dialog);
  el("closePersonPicker").addEventListener("click", closePersonPicker);
  el("personPickerSearchButton").addEventListener("click", () => searchPersonPicker(el("personPickerSearch").value));
  el("personPickerSearch").addEventListener("input", (event) => {
    window.clearTimeout(state.personPickerTimer);
    state.personPickerTimer = window.setTimeout(() => searchPersonPicker(event.target.value), 260);
  });
  el("personPickerSearch").addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      searchPersonPicker(event.target.value);
    }
  });
  el("personPickerResults").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-person-name]");
    if (!button || !state.personPickerTarget?.input) return;
    writePickedPerson(state.personPickerTarget.input, button.dataset.personName, Boolean(state.personPickerTarget.multiple));
    if (!state.personPickerTarget.multiple) closePersonPicker();
  });
}

function openPersonPicker(input, multiple = false) {
  if (!input) return;
  ensurePersonPickerDialog();
  state.personPickerTarget = { input, multiple };
  const query = String(input.value || "").split(/[、,，]/).pop().trim();
  el("personPickerSearch").value = query;
  el("personPickerResults").innerHTML = `<div class="person-picker-empty">输入关键词搜索飞书人员</div>`;
  el("personPickerDialog").showModal();
  el("personPickerSearch").focus();
  if (query) searchPersonPicker(query);
}

function closePersonPicker() {
  el("personPickerDialog")?.close();
  state.personPickerTarget = null;
}

function writePickedPerson(input, name, multiple) {
  const picked = String(name || "").trim();
  if (!picked) return;
  if (!multiple) {
    input.value = picked;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    return;
  }
  const names = String(input.value || "")
    .split(/[、,，]/)
    .map((item) => item.trim())
    .filter(Boolean);
  if (!names.includes(picked)) names.push(picked);
  input.value = names.join("、");
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

async function searchPersonPicker(query) {
  const keyword = String(query || "").trim();
  const container = el("personPickerResults");
  if (!keyword) {
    container.innerHTML = `<div class="person-picker-empty">输入关键词搜索飞书人员</div>`;
    return;
  }
  const requestId = ++state.personSearchRequestId;
  container.innerHTML = `<div class="person-picker-empty">正在搜索...</div>`;
  try {
    const result = await fetchJson(`/api/lark/users/search?q=${encodeURIComponent(keyword)}&limit=12`);
    if (requestId !== state.personSearchRequestId) return;
    const users = result.users || [];
    container.innerHTML = users.length ? users.map((user) => `
      <button class="person-result" type="button" data-person-name="${escapeAttr(user.name)}">
        <span>
          <strong>${escapeHtml(user.name)}</strong>
          <span>${escapeHtml([user.department, user.email].filter(Boolean).join(" · ") || user.openId || "")}</span>
        </span>
        <small>选择</small>
      </button>
    `).join("") : `<div class="person-picker-empty">没有匹配的飞书人员</div>`;
  } catch (error) {
    if (requestId !== state.personSearchRequestId) return;
    container.innerHTML = `<div class="person-picker-empty">${escapeHtml(error.message || "飞书人员搜索失败")}</div>`;
  }
}

async function loadPublicSearch(query, limit = 100) {
  const data = await fetchJson(`${SEARCH_URL}?q=${encodeURIComponent(query)}&limit=${limit}`);
  return data.records || [];
}

async function loadRequesterRecords(name) {
  if (!name) return [];
  const data = await fetchJson(`/api/my-records?name=${encodeURIComponent(name)}&t=${Date.now()}`);
  return data.records || [];
}

async function loadRequesterBootstrap() {
  if (state.adminMode) return;
  const data = await fetchJson(`/api/requesters?t=${Date.now()}`);
  state.requesters = data.requesters || [];
  if (state.authRole === "requester" && state.requesterName) {
    if (!state.requesters.includes(state.requesterName)) {
      state.requesters = [...state.requesters, state.requesterName].sort((a, b) => a.localeCompare(b, "zh-CN"));
    }
    state.requesterRecords = await loadRequesterRecords(state.requesterName);
    return;
  }
  if (!state.requesterName || !state.requesters.includes(state.requesterName)) {
    state.requesterName = state.requesters[0] || "";
  }
  state.requesterRecords = await loadRequesterRecords(state.requesterName);
}

async function refreshVisitorSuggestions(query) {
  const currentRequest = state.suggestionRequestId + 1;
  state.suggestionRequestId = currentRequest;
  if (state.adminMode || !query.trim()) {
    state.suggestionRecords = [];
    renderSuggestions();
    return;
  }
  try {
    const records = await loadPublicSearch(query, 10);
    if (state.suggestionRequestId !== currentRequest || state.adminMode) return;
    state.suggestionRecords = records;
    renderSuggestions();
  } catch {
    if (state.suggestionRequestId === currentRequest) state.suggestionRecords = [];
  }
}

async function applyQuery(query) {
  state.query = query.trim();
  state.draft = state.query;
  state.suggestionIndex = -1;
  el("projectSearchInput").value = state.query;
  hideSuggestions();
  if (!state.adminMode) {
    state.publicRecords = state.query ? await loadPublicSearch(state.query) : [];
  }
  renderWorkspace();
}

function renderSearchHint(records) {
  if (!state.query) {
    el("projectSearchHint").textContent = state.adminMode
      ? "可按项目名称、任务代码、负责人、项目对接人、部门、状态等信息查询"
      : "可按项目名称、任务代码、负责人、项目对接人、部门、状态等信息查询";
    return;
  }
  const prefix = state.adminMode ? "全局查询" : "查询";
  el("projectSearchHint").textContent = `${prefix}“${state.query}”，匹配 ${records.length} 条记录`;
}

function renderHeaderCell(column) {
  if (!state.adminMode || !FILTER_FIELDS.includes(column)) {
    return `<th>${escapeHtml(column)}</th>`;
  }

  const options = uniqueValues(column);
  return `
    <th class="filterable-head">
      <label class="table-head-control">
        <span>${escapeHtml(column)}</span>
        <select class="table-filter-select" data-filter-field="${escapeHtml(column)}">
          <option value="">全部</option>
          ${options.map((value) => `<option value="${escapeHtml(value)}" ${state.filters[column] === value ? "selected" : ""}>${escapeHtml(statusLabel(value))}</option>`).join("")}
        </select>
      </label>
    </th>
  `;
}

function renderTable(records) {
  const tableColumns = state.adminMode ? TABLE_COLUMNS : VISITOR_COLUMNS;
  el("recordSummary").textContent = `${records.length} 条记录`;
  if (!records.length) {
    el("records").innerHTML = `<div class="empty">没有符合条件的项目</div>`;
    return;
  }

  const columns = state.adminMode ? [...tableColumns, "操作"] : tableColumns;
  el("records").innerHTML = `
    <table class="data-table ${state.adminMode ? "admin-table" : "visitor-table"}">
      <thead>
        <tr>${columns.map((column) => renderHeaderCell(column)).join("")}</tr>
      </thead>
      <tbody>
        ${records.map((record) => renderRow(record)).join("")}
      </tbody>
    </table>
  `;
}

function renderRow(record) {
  const status = cell(record, "获取状态");
  const group = statusGroup(status);
  const tableColumns = state.adminMode ? TABLE_COLUMNS : VISITOR_COLUMNS;
  const cells = tableColumns.map((column) => {
    const value = cell(record, column);
    if (column === "获取状态" && state.adminMode) {
      return `<td class="status-cell">${renderStatusSelect(record, value)}</td>`;
    }
    const className = column === "项目名称" ? "project-name-cell" : "";
    return `<td class="${className}" title="${escapeHtml(value)}">${renderFieldValue(column, value)}</td>`;
  }).join("");

  return `
    <tr data-record-id="${escapeHtml(record.record_id)}">
      ${cells}
      ${state.adminMode ? `
        <td class="row-actions">
          <button class="button mini" type="button" data-detail-record="${escapeHtml(record.record_id)}">详情</button>
          <button class="button mini" type="button" data-edit-record="${escapeHtml(record.record_id)}">编辑</button>
        </td>
      ` : ""}
    </tr>
  `;
}

function renderStatusSelect(record, value) {
  const options = uniqueValues("获取状态");
  const badgeClass = statusGroup(value);
  return `
    <select class="inline-select ${badgeClass}" data-status-record="${escapeHtml(record.record_id)}">
      <option value="" ${!value ? "selected" : ""}>未设置</option>
      ${options.map((option) => `<option value="${escapeHtml(option)}" ${option === value ? "selected" : ""}>${escapeHtml(option)}</option>`).join("")}
    </select>
  `;
}

function renderMiniProgress(record) {
  const status = cell(record, "获取状态");
  const progress = statusProgress(status);
  const color = statusColor(status);
  return `
    <div class="mini-progress" aria-label="当前进度 ${progress}%">
      <div class="mini-progress-top">
        <span>${escapeHtml(statusLabel(status))}</span>
        <strong>${progress}%</strong>
      </div>
      <div class="track"><div class="fill" style="width:${progress}%;background:${color}"></div></div>
    </div>
  `;
}

function nameListIncludes(value, name) {
  const target = normalizeText(name);
  if (!target) return false;
  return String(value || "")
    .split(/[、,，]/)
    .map((item) => normalizeText(item))
    .some((item) => item && (item === target || item.includes(target) || target.includes(item)));
}

function canManageFollowers(record) {
  const owner = cell(record, "需求负责人") || cell(record, "项目对接人");
  return nameListIncludes(owner, state.requesterName);
}

function renderFollowerEditor(record) {
  const followers = cell(record, "关注人");
  if (!canManageFollowers(record)) {
    return followers ? `
      <div class="follower-readonly">
        <b>关注人</b>
        <span>${escapeHtml(followers)}</span>
      </div>
    ` : "";
  }
  return `
    <div class="follower-editor">
      <label>
        <span>关注人</span>
        <div class="person-input-row">
          <input data-follower-input="${escapeHtml(record.record_id)}" data-person-input value="${escapeHtml(followers)}" placeholder="输入多人，用顿号分隔" />
          <button class="button mini" type="button" data-pick-person data-person-multiple="true">飞书选择</button>
        </div>
      </label>
      <button class="button mini" type="button" data-save-followers="${escapeHtml(record.record_id)}">保存关注人</button>
    </div>
  `;
}

function renderRequesterView() {
  const section = el("requesterSection");
  section.classList.remove("hidden");
  el("currentRequesterName").textContent = state.requesterName || "-";

  const records = state.requesterRecords;
  const avg = averageProgress(records);
  el("requesterTotal").textContent = records.length;
  el("requesterAverage").textContent = `${avg}%`;
  el("requesterDone").textContent = records.filter((record) => statusProgress(cell(record, "获取状态")) >= 100).length;

  el("requesterCards").innerHTML = records.length ? records.map((record) => `
    <article class="requester-card">
      <div class="record-top">
        <div>
          <h3>${escapeHtml(cell(record, "项目名称") || "未命名需求")}</h3>
          <p>${escapeHtml(cell(record, "隶属部门") || "未设置部门")} · ${escapeHtml(cell(record, "Sprint") || "未进入 Sprint")}</p>
        </div>
        <span class="badge ${statusGroup(cell(record, "获取状态"))}">${escapeHtml(statusLabel(cell(record, "获取状态")))}</span>
      </div>
      ${renderMiniProgress(record)}
      <div class="requester-card-grid">
        ${REQUESTER_COLUMNS.filter((column) => column !== "项目名称" && column !== "获取状态").map((column) => `
          <span><b>${escapeHtml(column)}</b>${renderFieldValue(column, cell(record, column))}</span>
        `).join("")}
      </div>
      ${renderFollowerEditor(record)}
    </article>
  `).join("") : `<div class="empty">当前需求方暂无需求进展</div>`;
}

function columnsForOwnerGroup(group) {
  return [...new Set([...CORE_COLUMNS, ...(group?.fields || [])])].filter((column) => state.fields.some((field) => (field.name || field.id) === column) || TABLE_COLUMNS.includes(column));
}

function renderGenericTable(containerId, records, columns, editable = false) {
  const container = el(containerId);
  if (!records.length) {
    container.innerHTML = `<div class="empty">没有符合条件的项目</div>`;
    return;
  }
  const finalColumns = editable ? [...columns, "操作"] : columns;
  container.innerHTML = `
    <table class="data-table admin-table">
      <thead>
        <tr>${finalColumns.map((column) => editable ? renderHeaderCell(column) : `<th>${escapeHtml(column)}</th>`).join("")}</tr>
      </thead>
      <tbody>
        ${records.map((record) => renderRowWithColumns(record, columns, editable)).join("")}
      </tbody>
    </table>
  `;
}

function renderRowWithColumns(record, columns, editable = false) {
  const cells = columns.map((column) => {
    const value = cell(record, column);
    if (column === "获取状态" && editable && canEditOwnerField(column)) {
      return `<td class="status-cell">${renderStatusSelect(record, value)}</td>`;
    }
    const className = column === "项目名称" ? "project-name-cell" : "";
    return `<td class="${className}" title="${escapeHtml(value)}">${renderFieldValue(column, value)}</td>`;
  }).join("");
  return `
    <tr data-record-id="${escapeHtml(record.record_id)}">
      ${cells}
      ${editable ? `
        <td class="row-actions">
          <button class="button mini" type="button" data-detail-record="${escapeHtml(record.record_id)}">详情</button>
          <button class="button mini" type="button" data-edit-record="${escapeHtml(record.record_id)}">编辑</button>
        </td>
      ` : ""}
    </tr>
  `;
}

function renderOwnerView(records) {
  const groups = availableOwnerGroups();
  const group = activeOwnerGroup();
  el("ownerViewSection").classList.remove("hidden");
  el("ownerViewCount").textContent = `${groups.length} 组`;
  if (!group) {
    el("ownerTabs").innerHTML = "";
    el("ownerFieldChips").innerHTML = `<div class="owner-description">当前飞书账号已是管理员，但尚未匹配到负责字段视图。请由超级管理员为该账号配置对应负责人权限。</div>`;
    el("ownerRecords").innerHTML = `<div class="empty">暂无可维护的字段视图</div>`;
    return;
  }
  state.ownerGroupId = group.id;
  el("ownerTabs").innerHTML = groups.map((item) => `
    <button class="role-tab ${item.id === group.id ? "active" : ""}" type="button" data-owner-group="${escapeHtml(item.id)}">
      <span>${escapeHtml(item.name)}</span>
      <small>${escapeHtml(item.owner)}</small>
    </button>
  `).join("");
  el("ownerFieldChips").innerHTML = `
    <div class="owner-description">${escapeHtml(group.description)}</div>
    ${group.fields.map((field) => `<span class="field-chip">${escapeHtml(field)}</span>`).join("")}
  `;
  const columns = group.id === "super" ? TABLE_COLUMNS : columnsForOwnerGroup(group);
  renderGenericTable("ownerRecords", records, columns, true);
}

function daysBetween(startText, endText) {
  const start = parseDate(startText);
  const end = parseDate(endText);
  if (!start || !end) return null;
  return Math.max(0, Math.round((end - start) / 86400000));
}

function averageDays(records, startField, endField) {
  const values = records
    .map((record) => daysBetween(cell(record, startField), cell(record, endField)))
    .filter((value) => value != null);
  return values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : null;
}

function renderAnalytics(records) {
  el("analyticsSection").classList.remove("hidden");
  const solutionDays = averageDays(records, "需求提出时间", "需求澄清完成时间");
  const firstDeliveryDays = averageDays(records, "开始执行时间", "实际交付完成日期");
  const totalDeliveryDays = averageDays(records, "需求提出时间", "实际验收通过时间");
  const satisfactionReady = records.filter((record) => statusProgress(cell(record, "获取状态")) >= 100).length;
  const cards = [
    ["方案处理耗时", solutionDays == null ? "待统计" : `${solutionDays} 天`, "需求提出到需求澄清完成"],
    ["首次全量交付", firstDeliveryDays == null ? "待统计" : `${firstDeliveryDays} 天`, "开始执行到实际交付完成"],
    ["整体交付周期", totalDeliveryDays == null ? "待统计" : `${totalDeliveryDays} 天`, "需求提出到验收通过"],
    ["满意度待评价", satisfactionReady, "完成后由需求方评价交付结果"]
  ];
  el("analyticsCards").innerHTML = cards.map(([title, value, hint]) => `
    <article class="analytics-card">
      <span>${escapeHtml(title)}</span>
      <strong>${escapeHtml(value)}</strong>
      <p>${escapeHtml(hint)}</p>
    </article>
  `).join("");
}

function renderWorkspace() {
  const records = filteredRecords();
  const superAdmin = isSuperAdmin();
  if (state.adminMode && !superAdmin && state.activeView !== "owners") {
    state.activeView = "owners";
  }
  const showAdminData = state.adminMode && superAdmin && state.activeView === "ledger";

  el("loginGate").classList.toggle("hidden", Boolean(state.authRole));
  el("requesterSection").classList.toggle("hidden", state.authRole !== "requester");
  el("searchSection").classList.add("hidden");
  el("kpiSection").classList.toggle("hidden", !showAdminData);
  el("dashboardSection").classList.toggle("hidden", !showAdminData);
  el("worklistSection").classList.toggle("hidden", !showAdminData);
  el("ownerViewSection").classList.toggle("hidden", !state.adminMode || state.activeView !== "owners");
  el("analyticsSection").classList.toggle("hidden", !state.adminMode || !superAdmin || state.activeView !== "analytics");
  el("adminTabs").classList.toggle("hidden", !state.adminMode || !superAdmin);
  el("importButton").classList.toggle("hidden", !superAdmin);
  el("filterGrid").classList.add("hidden");
  el("activeFilters").classList.add("hidden");

  renderRequesterOptions("loginRequesterSelect");
  renderRequesterNameOptions();

  if (!state.authRole) {
    updateModeUI();
    return;
  }

  if (state.authRole === "requester") {
    renderRequesterView();
    updateModeUI();
    return;
  }

  if (superAdmin) {
    el("adminTabs").querySelectorAll("[data-view]").forEach((button) => {
      button.classList.toggle("active", button.dataset.view === state.activeView);
    });
  }

  if (showAdminData) {
    renderKpis(records);
    renderLegend(records);
    renderOwners(records);
    renderTimeline(records);
    renderTable(records);
  } else if (state.activeView === "owners") {
    renderOwnerView(records);
  } else if (superAdmin && state.activeView === "analytics") {
    renderAnalytics(records);
  }
  updateModeUI();
}

function renderAll() {
  renderMeta(state.meta);
  updateNotice(state.meta);
  renderWorkspace();
}

async function loadData() {
  const data = await fetchJson(`${DATA_URL}?t=${Date.now()}`);
  state.fields = data.fields || [];
  state.records = data.records || [];
  state.meta = data.meta || {};
  await loadRequesterBootstrap();
  renderAll();
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cellValue = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (quoted) {
      if (char === '"' && next === '"') {
        cellValue += '"';
        index += 1;
      } else if (char === '"') quoted = false;
      else cellValue += char;
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === ",") {
      row.push(cellValue);
      cellValue = "";
    } else if (char === "\n") {
      row.push(cellValue);
      rows.push(row);
      row = [];
      cellValue = "";
    } else if (char !== "\r") cellValue += char;
  }
  row.push(cellValue);
  if (row.some((value) => value.trim() !== "")) rows.push(row);
  const headers = rows.shift()?.map((header, index) => header.replace(/^\uFEFF/, "").trim() || `字段${index + 1}`) || [];
  return rows.map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""])));
}

async function importFile(file) {
  const text = await file.text();
  const payload = file.name.toLowerCase().endsWith(".csv") ? parseCsv(text) : JSON.parse(text);
  const response = await fetch("/api/import", {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json", "x-admin-token": state.adminToken },
    body: JSON.stringify(payload)
  });
  const result = await response.json();
  if (!response.ok || result.ok === false) throw new Error(result.message || "导入失败");
  state.fields = result.data.fields || [];
  state.records = result.data.records || [];
  state.meta = result.data.meta || {};
  state.query = "";
  state.draft = "";
  state.filters = {};
  el("projectSearchInput").value = "";
  renderAll();
}

function updateModeUI() {
  document.body.classList.toggle("login-mode", !state.authRole);
  document.body.classList.toggle("requester-mode", state.authRole === "requester");
  document.body.classList.toggle("admin-mode", state.adminMode);
  el("modeButton").textContent = state.authRole ? "退出登录" : "管理员登录";
  el("modeButton").classList.toggle("primary", state.adminMode);
  updateLoginGate();
}

function updateLoginGate() {
  const oauthMode = isOAuthMode();
  const loginGate = el("loginGate");
  const copy = loginGate.querySelector(".login-copy > p:not(.eyebrow)");
  const requesterLoginLabel = el("requesterLoginButton").querySelector("span");
  const requesterLoginHint = el("requesterLoginButton").querySelector("small");
  const adminLoginLabel = el("adminLoginButton").querySelector("span");
  const adminLoginHint = el("adminLoginButton").querySelector("small");

  if (copy) {
    copy.textContent = oauthMode
      ? "需求方登录后查看个人进展；仅预先配置的负责人可进入对应工作台。"
      : "需求方可注册或登录后查看自己的需求进展并提交新需求，管理员维护台账和负责人视图。";
  }
  if (requesterLoginLabel) requesterLoginLabel.textContent = "需求方登录";
  if (requesterLoginHint) requesterLoginHint.textContent = oauthMode ? "使用飞书账号验证身份" : "查看我的需求进展";
  if (adminLoginLabel) adminLoginLabel.textContent = oauthMode ? "管理员登录" : "管理员登录";
  if (adminLoginHint) adminLoginHint.textContent = oauthMode ? "仅已配置管理员可进入" : "维护台账与负责人视图";

  if (oauthMode && el("requesterAuthDialog").open) {
    el("requesterAuthDialog").close();
  }
}

function applyUser(user) {
  state.currentUser = user || null;
  if (!user) {
    state.authRole = "";
    state.adminMode = false;
    state.requesterName = "";
    return;
  }
  const adminRoles = ["delivery_admin", "purchase_admin", "super_admin"];
  state.authRole = adminRoles.includes(user.role) ? "admin" : "requester";
  state.adminMode = state.authRole === "admin";
  state.requesterName = state.authRole === "requester" ? user.name : "";
  state.activeView = state.authRole === "admin" ? (user.role === "super_admin" ? "ledger" : "owners") : "requester";
}

async function loadSession() {
  const session = await fetchJson(`/api/auth/me?t=${Date.now()}`);
  state.mockUsers = session.mockUsers || [];
  state.larkOAuthEnabled = Boolean(session.larkOAuthEnabled);
  if (session.authenticated) {
    applyUser(session.user);
  }
  const params = new URLSearchParams(window.location.search);
  if (params.get("auth_error") === "admin_only") {
    state.authError = "该飞书账号未被配置为管理员，请从需求方入口登录。";
    window.history.replaceState({}, "", window.location.pathname);
  }
}

async function logout() {
  await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" });
  state.adminMode = false;
  state.adminToken = "";
  state.authRole = "";
  state.currentUser = null;
  state.activeView = "ledger";
  state.filters = {};
  state.query = "";
  state.draft = "";
  state.records = [];
  state.fields = [];
  state.publicRecords = [];
  state.suggestionRecords = [];
  state.requesterRecords = [];
  el("projectSearchInput").value = "";
  hideSuggestions();
}

function openRequesterAuthDialog(mode) {
  if (isOAuthMode()) {
    window.location.href = `/api/auth/lark/login?next=${encodeURIComponent("/")}`;
    return;
  }
  state.requesterAuthMode = mode;
  const isRegister = mode === "register";
  el("requesterAuthTitle").textContent = isRegister ? "需求方注册" : "需求方登录";
  el("requesterAuthHint").textContent = isRegister
    ? "本地演示会创建一个模拟需求方身份，注册后可提交并查看自己的需求"
    : "本地演示可用已有姓名登录，例如王冠楚";
  el("requesterAuthSubmit").textContent = isRegister ? "注册并进入" : "登录";
  el("requesterAuthName").value = isRegister ? "" : defaultRequesterName();
  el("requesterAuthDepartment").value = "";
  el("requesterAuthError").classList.add("hidden");
  document.querySelectorAll(".register-only").forEach((node) => node.classList.toggle("hidden", !isRegister));
  renderRequesterNameOptions();
  el("requesterAuthDialog").showModal();
}

function closeRequesterAuthDialog() {
  el("requesterAuthDialog").close();
}

function openAdminLogin() {
  if (isOAuthMode()) {
    window.location.href = `/api/auth/lark/login?adminOnly=1&next=${encodeURIComponent("/")}`;
    return;
  }
  el("adminPassword").value = "";
  el("adminError").classList.add("hidden");
  el("adminDialog").showModal();
}

async function enterRequester(name) {
  const cleanName = String(name || "").trim();
  if (!cleanName) throw new Error("请输入姓名或账号");
  const result = await fetchJson("/api/auth/mock-login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: cleanName,
      department: el("requesterAuthDepartment")?.value || "",
      register: state.requesterAuthMode === "register"
    })
  });
  applyUser(result.user);
  state.requesterName = result.user?.name || cleanName;
  if (!state.requesters.includes(cleanName)) {
    state.requesters = [...state.requesters, cleanName].sort((a, b) => a.localeCompare(b, "zh-CN"));
  }
  state.adminToken = "";
  state.requesterRecords = await loadRequesterRecords(state.requesterName);
  renderWorkspace();
}

function renderDemandControl(field) {
  const required = field.required ? "required" : "";
  const placeholder = field.placeholder ? `placeholder="${escapeHtml(field.placeholder)}"` : "";
  const defaultValue = field.defaultCurrentUser ? state.requesterName : "";
  if (field.type === "textarea") {
    return `<textarea name="${escapeHtml(field.name)}" ${required} ${placeholder}>${escapeHtml(defaultValue)}</textarea>`;
  }
  if (field.type === "select") {
    return `
      <select name="${escapeHtml(field.name)}" ${field.multiple ? "multiple" : ""} ${required}>
        ${field.multiple ? "" : `<option value="">请选择</option>`}
        ${(field.options || []).map((option) => `<option value="${escapeHtml(option)}">${escapeHtml(option)}</option>`).join("")}
      </select>
    `;
  }
  const type = field.type === "date" ? "date" : field.type === "number" ? "number" : field.type === "url" ? "url" : "text";
  if (PERSON_FIELDS.has(field.name)) {
    return `
      <div class="person-input-row">
        <input name="${escapeHtml(field.name)}" type="${type}" value="${escapeHtml(defaultValue)}" ${required} ${placeholder} data-person-input />
        <button class="button mini" type="button" data-pick-person data-person-multiple="${MULTI_PERSON_FIELDS.has(field.name) ? "true" : "false"}">飞书选择</button>
      </div>
    `;
  }
  return `<input name="${escapeHtml(field.name)}" type="${type}" value="${escapeHtml(defaultValue)}" ${required} ${placeholder} />`;
}

function renderRequestForm() {
  el("requestFormFields").innerHTML = DEMAND_FORM_FIELDS.map((field) => `
    <label class="${field.type === "textarea" ? "span-2" : ""}">
      <span>${escapeHtml(field.name)}${field.required ? " *" : ""}</span>
      ${renderDemandControl(field)}
      ${field.description ? `<small>${escapeHtml(field.description)}</small>` : ""}
    </label>
  `).join("");
}

function openRequestDialog() {
  renderRequestForm();
  el("requestDialog").showModal();
}

function closeRequestDialog() {
  el("requestDialog").close();
}

function renderRecordControl(name, value, index) {
  const personButton = PERSON_FIELDS.has(name)
    ? `<button class="button mini" type="button" data-pick-person data-person-multiple="${MULTI_PERSON_FIELDS.has(name) ? "true" : "false"}">飞书选择</button>`
    : "";
  if (LONG_FIELDS.has(name)) {
    return `<textarea name="${escapeHtml(name)}">${escapeHtml(value)}</textarea>`;
  }

  if (FORM_OPTION_FIELDS.has(name)) {
    const options = formOptions(name);
    const listId = `form-options-${index}`;
    return `
      <div class="${PERSON_FIELDS.has(name) ? "person-input-row" : ""}">
        <input name="${escapeHtml(name)}" value="${escapeHtml(value)}" list="${listId}" placeholder="选择已有选项或直接输入" ${PERSON_FIELDS.has(name) ? "data-person-input" : ""} />
        ${personButton}
      </div>
      <datalist id="${listId}">
        ${options.map((option) => `<option value="${escapeHtml(option)}"></option>`).join("")}
      </datalist>
    `;
  }

  if (PERSON_FIELDS.has(name)) {
    return `
      <div class="person-input-row">
        <input name="${escapeHtml(name)}" value="${escapeHtml(value)}" data-person-input />
        ${personButton}
      </div>
    `;
  }

  return `<input name="${escapeHtml(name)}" value="${escapeHtml(value)}" />`;
}

function openRecordDialog(record = null) {
  if (!state.adminMode) return;
  if (!record && !isSuperAdmin()) return;
  state.editingRecordId = record?.record_id || null;
  el("recordDialogTitle").textContent = record ? "编辑项目数据" : "导入项目数据";
  const editableFields = isSuperAdmin()
    ? state.fields
    : state.fields.filter((field) => canEditOwnerField(field.name || field.id));
  el("recordFormFields").innerHTML = editableFields.map((field, index) => {
    const name = field.name || field.id;
    const value = record ? cell(record, name) : "";
    const control = renderRecordControl(name, value, index);
    return `<label><span>${escapeHtml(name)}</span>${control}</label>`;
  }).join("");
  el("recordDialog").showModal();
}

function closeRecordDialog() {
  el("recordDialog").close();
  state.editingRecordId = null;
}

function formToFields(form) {
  const fields = {};
  const data = new FormData(form);
  [...data.keys()].forEach((key) => {
    const values = data.getAll(key).map((value) => String(value)).filter(Boolean);
    fields[key] = values.join("、");
  });
  return fields;
}

async function submitDemand(fields) {
  const response = await fetch("/api/requests", {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ requesterName: state.requesterName, fields })
  });
  const result = await response.json();
  if (!response.ok || result.ok === false) throw new Error(result.message || "提交失败");
  state.requesterRecords = result.data?.records || await loadRequesterRecords(state.requesterName);
  state.meta = result.data?.meta || state.meta;
  renderAll();
}

async function saveFollowers(recordId, followers) {
  const response = await fetch(`/api/requests/${encodeURIComponent(recordId)}/followers`, {
    method: "PATCH",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ requesterName: state.requesterName, followers })
  });
  const result = await response.json();
  if (!response.ok || result.ok === false) throw new Error(result.message || "保存关注人失败");
  state.requesterRecords = result.data?.records || await loadRequesterRecords(state.requesterName);
  state.meta = result.data?.meta || state.meta;
  renderAll();
}

async function loadRecordActivity(recordId) {
  const logData = await fetchJson(`/api/records/${encodeURIComponent(recordId)}/logs`);
  state.detailLogs = logData.logs || [];
}

function renderLedgerLogs() {
  el("ledgerLogCount").textContent = `${state.detailLogs.length} 条`;
  el("ledgerLogList").innerHTML = state.detailLogs.length ? state.detailLogs.map((log) => `
    <article class="ledger-log-item">
      <time>${escapeHtml(log.createdAt || "-")}</time>
      <div>
        <strong>${escapeHtml(log.type || "更新")}${log.field ? ` · ${escapeHtml(log.field)}` : ""}</strong>
        <p>${escapeHtml(log.actor || "系统")}（${escapeHtml(log.role || "-")}）</p>
        ${log.before || log.after ? `
          <div class="change-line">
            <span>${escapeHtml(log.before || "空")}</span>
            <i>→</i>
            <span>${escapeHtml(log.after || "空")}</span>
          </div>
        ` : ""}
        ${log.note ? `<p class="log-note">${escapeHtml(log.note)}</p>` : ""}
      </div>
    </article>
  `).join("") : `<div class="empty compact">暂无台账日志，后续状态和字段变更会自动记录。</div>`;
}

async function openDetailDialog(record) {
  if (!record || !state.adminMode) return;
  state.detailRecordId = record.record_id;
  el("detailDialogTitle").textContent = compactTitle(cell(record, "项目名称"));
  el("detailDialogSubtitle").textContent = `${cell(record, "获取状态") || "未设置状态"} · ${cell(record, "项目对接人") || cell(record, "需求负责人") || "未设置负责人"}`;
  el("ledgerLogList").innerHTML = `<div class="empty compact">正在加载日志...</div>`;
  el("detailDialog").showModal();
  await loadRecordActivity(record.record_id);
  renderLedgerLogs();
}

function closeDetailDialog() {
  el("detailDialog").close();
  state.detailRecordId = null;
  state.detailLogs = [];
}

function compactTitle(value) {
  const firstLine = String(value || "").split(/\n/).map((line) => line.trim()).find(Boolean) || "需求详情";
  return firstLine.length > 42 ? `${firstLine.slice(0, 42)}...` : firstLine;
}

async function saveRecord(fields) {
  const isEdit = Boolean(state.editingRecordId);
  const response = await fetch(isEdit ? `/api/records/${encodeURIComponent(state.editingRecordId)}` : "/api/records", {
    method: isEdit ? "PATCH" : "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json", "x-admin-token": state.adminToken },
    body: JSON.stringify({ fields })
  });
  const result = await response.json();
  if (!response.ok || result.ok === false) throw new Error(result.message || "保存失败");
  state.fields = result.data.fields || [];
  state.records = result.data.records || [];
  state.meta = result.data.meta || {};
  renderAll();
}

async function updateRecord(recordId, patch) {
  const response = await fetch(`/api/records/${encodeURIComponent(recordId)}`, {
    method: "PATCH",
    credentials: "same-origin",
    headers: { "content-type": "application/json", "x-admin-token": state.adminToken },
    body: JSON.stringify({ fields: patch })
  });
  const result = await response.json();
  if (!response.ok || result.ok === false) throw new Error(result.message || "更新失败");
  state.fields = result.data.fields || [];
  state.records = result.data.records || [];
  state.meta = result.data.meta || {};
  renderAll();
}

el("refreshButton").addEventListener("click", loadData);
el("importButton").addEventListener("click", () => openRecordDialog());
el("adminTabs").addEventListener("click", (event) => {
  const button = event.target.closest("button[data-view]");
  if (!button) return;
  state.activeView = button.dataset.view;
  renderWorkspace();
});
el("ownerTabs").addEventListener("click", (event) => {
  const button = event.target.closest("button[data-owner-group]");
  if (!button) return;
  if (!availableOwnerGroups().some((group) => group.id === button.dataset.ownerGroup)) return;
  state.ownerGroupId = button.dataset.ownerGroup;
  renderWorkspace();
});
el("requesterLoginButton").addEventListener("click", () => openRequesterAuthDialog("login"));
el("adminLoginButton").addEventListener("click", openAdminLogin);
el("requestSubmitButton").addEventListener("click", () => {
  openRequestDialog();
});
document.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-pick-person]");
  if (!button) return;
  const scope = button.closest(".person-input-row") || button.closest(".follower-editor") || button.closest("label");
  const input = scope?.querySelector("input[data-person-input], input[data-follower-input]");
  openPersonPicker(input, button.dataset.personMultiple === "true");
});
el("requesterCards").addEventListener("click", async (event) => {
  const saveId = event.target.closest("button[data-save-followers]")?.dataset.saveFollowers;
  if (!saveId) return;
  const input = el("requesterCards").querySelector(`input[data-follower-input="${CSS.escape(saveId)}"]`);
  try {
    await saveFollowers(saveId, input?.value || "");
  } catch (error) {
    alert(error.message);
  }
});
el("modeButton").addEventListener("click", async () => {
  if (state.authRole) {
    await logout();
    loadData().catch((error) => {
      state.meta = { status: "error", message: error.message };
      renderAll();
    });
    return;
  }
  openAdminLogin();
});
el("projectSearchInput").addEventListener("input", (event) => {
  state.draft = event.target.value;
  state.suggestionIndex = -1;
  refreshVisitorSuggestions(state.draft);
  renderSuggestions();
});
el("projectSearchInput").addEventListener("focus", () => {
  state.draft = el("projectSearchInput").value;
  refreshVisitorSuggestions(state.draft);
  renderSuggestions();
});
el("projectSearchInput").addEventListener("keydown", (event) => {
  const suggestions = getSuggestions(state.draft);
  if (event.key === "ArrowDown" && suggestions.length) {
    event.preventDefault();
    state.suggestionIndex = Math.min(state.suggestionIndex + 1, suggestions.length - 1);
    renderSuggestions();
  } else if (event.key === "ArrowUp" && suggestions.length) {
    event.preventDefault();
    state.suggestionIndex = Math.max(state.suggestionIndex - 1, 0);
    renderSuggestions();
  } else if (event.key === "Enter") {
    event.preventDefault();
    const selected = suggestions[state.suggestionIndex];
    applyQuery(selected?.value || state.draft).catch((error) => {
      state.meta = { status: "error", message: error.message };
      renderAll();
    });
  } else if (event.key === "Escape") {
    hideSuggestions();
  }
});
el("projectSearchButton").addEventListener("click", () => {
  applyQuery(el("projectSearchInput").value).catch((error) => {
    state.meta = { status: "error", message: error.message };
    renderAll();
  });
});
el("clearProjectSearch").addEventListener("click", () => {
  applyQuery("").catch((error) => {
    state.meta = { status: "error", message: error.message };
    renderAll();
  });
});
el("projectSuggestions").addEventListener("mousedown", (event) => event.preventDefault());
el("projectSuggestions").addEventListener("click", (event) => {
  const button = event.target.closest("button[data-query]");
  if (!button) return;
  applyQuery(button.dataset.query).catch((error) => {
    state.meta = { status: "error", message: error.message };
    renderAll();
  });
});
el("filterGrid").addEventListener("change", (event) => {
  const select = event.target.closest("select[data-filter-field]");
  if (!select) return;
  state.filters[select.dataset.filterField] = select.value;
  renderWorkspace();
});
el("activeFilters").addEventListener("click", (event) => {
  const clearField = event.target.closest("button[data-clear-filter]")?.dataset.clearFilter;
  if (clearField) {
    delete state.filters[clearField];
    renderWorkspace();
  } else if (event.target.id === "clearAllFilters") {
    state.filters = {};
    renderWorkspace();
  }
});
el("records").addEventListener("click", (event) => {
  const detailId = event.target.closest("button[data-detail-record]")?.dataset.detailRecord;
  if (detailId) {
    const record = state.records.find((item) => item.record_id === detailId);
    openDetailDialog(record).catch((error) => {
      alert(error.message);
      closeDetailDialog();
    });
    return;
  }
  const editId = event.target.closest("button[data-edit-record]")?.dataset.editRecord;
  if (!editId) return;
  const record = state.records.find((item) => item.record_id === editId);
  openRecordDialog(record);
});
el("records").addEventListener("change", async (event) => {
  const filterSelect = event.target.closest("select[data-filter-field]");
  if (filterSelect) {
    state.filters[filterSelect.dataset.filterField] = filterSelect.value;
    renderWorkspace();
    return;
  }

  const select = event.target.closest("select[data-status-record]");
  if (!select) return;
  await updateRecord(select.dataset.statusRecord, { "获取状态": select.value });
});
el("closeRecordDialog").addEventListener("click", closeRecordDialog);
el("cancelRecordForm").addEventListener("click", closeRecordDialog);
el("recordForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    await saveRecord(formToFields(event.currentTarget));
    closeRecordDialog();
  } catch (error) {
    alert(error.message);
  }
});
el("closeRequesterAuthDialog").addEventListener("click", closeRequesterAuthDialog);
el("cancelRequesterAuthForm").addEventListener("click", closeRequesterAuthDialog);
el("requesterAuthForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const errorEl = el("requesterAuthError");
  errorEl.classList.add("hidden");
  try {
    await enterRequester(el("requesterAuthName").value);
    closeRequesterAuthDialog();
  } catch (error) {
    errorEl.textContent = error.message;
    errorEl.classList.remove("hidden");
  }
});
el("closeRequestDialog").addEventListener("click", closeRequestDialog);
el("cancelRequestForm").addEventListener("click", closeRequestDialog);
el("requestForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    await submitDemand(formToFields(event.currentTarget));
    closeRequestDialog();
    event.currentTarget.reset();
  } catch (error) {
    alert(error.message);
  }
});
el("closeDetailDialog").addEventListener("click", closeDetailDialog);
el("cancelDetailDialog").addEventListener("click", closeDetailDialog);
el("closeAdminDialog").addEventListener("click", () => el("adminDialog").close());
el("cancelAdminForm").addEventListener("click", () => el("adminDialog").close());
el("adminForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const errorEl = el("adminError");
  errorEl.classList.add("hidden");
  const response = await fetch("/api/admin/login", {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ password: el("adminPassword").value })
  });
  const result = await response.json();
  if (!response.ok || result.ok === false) {
    errorEl.textContent = result.message || "管理员口令错误";
    errorEl.classList.remove("hidden");
    return;
  }
  state.adminToken = result.token;
  applyUser(result.user || { name: "超级管理员", role: "super_admin" });
  state.activeView = "ledger";
  state.publicRecords = [];
  state.suggestionRecords = [];
  el("adminDialog").close();
  await loadData();
});

function attachRecordHandlers(containerId) {
  el(containerId).addEventListener("click", (event) => {
    const detailId = event.target.closest("button[data-detail-record]")?.dataset.detailRecord;
    if (detailId) {
      const record = state.records.find((item) => item.record_id === detailId);
      openDetailDialog(record).catch((error) => {
        alert(error.message);
        closeDetailDialog();
      });
      return;
    }
    const editId = event.target.closest("button[data-edit-record]")?.dataset.editRecord;
    if (!editId) return;
    const record = state.records.find((item) => item.record_id === editId);
    openRecordDialog(record);
  });
  el(containerId).addEventListener("change", async (event) => {
    const filterSelect = event.target.closest("select[data-filter-field]");
    if (filterSelect) {
      state.filters[filterSelect.dataset.filterField] = filterSelect.value;
      renderWorkspace();
      return;
    }

    const select = event.target.closest("select[data-status-record]");
    if (!select) return;
    await updateRecord(select.dataset.statusRecord, { "获取状态": select.value });
  });
}

attachRecordHandlers("ownerRecords");

async function bootstrap() {
  await loadSession();
  await loadData();
}

bootstrap().catch((error) => {
  state.meta = { status: "error", message: error.message };
  renderAll();
});

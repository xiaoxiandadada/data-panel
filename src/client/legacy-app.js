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
const REQUESTER_COLUMNS = ["项目名称", "获取状态", "隶属部门", "需求负责人", "需求人", "关注人", "PM", "项目对接人", "解决方案负责人", "需求提出时间", "期望交付日期", "Sprint", "满意度", "满意度评价来源"];
const DEMAND_FORM_FIELDS = [
  { name: "需求描述", type: "textarea", required: true, placeholder: "说明需要什么数据、用途、范围、质量要求" },
  { name: "需求负责人", type: "text", required: true, defaultCurrentUser: true, placeholder: "负责维护该需求和添加关注人" },
  { name: "需求人", type: "text", required: true, defaultCurrentUser: true, placeholder: "可填写多人，用顿号分隔，例如：张三、李四" },
  { name: "关注人", type: "text", placeholder: "可选，后续需求负责人也可以维护" },
  { name: "是否设置PM", type: "select", required: true, options: ["否", "是"] },
  { name: "PM", type: "text", placeholder: "从飞书通讯录选择本需求的 PM", pmDependent: true },
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
const PERSON_FIELDS = new Set(["需求负责人", "需求人", "关注人", "PM", "部门负责人", "项目对接人", "解决方案负责人", "承接方责任人"]);
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
  suggestionIndex: -1,
  filters: {},
  sortField: "",
  sortDirection: "",
  adminMode: false,
  adminToken: "",
  editingRecordId: null,
  detailRecordId: null,
  detailLogs: [],
  suggestionRequestId: 0,
  personPickerTarget: null,
  personSearchRequestId: 0,
  personPickerTimer: 0,
  fieldPreferences: { hiddenFields: [], fieldOrder: [], pinnedFields: [] },
  fieldPreferencesBackup: null,
  draggedField: "",
  larkSources: [],
  larkSyncIntervalMs: 300000,
  larkSyncStatus: {},
  adminUsers: [],
  adminCandidates: [],
  adminUserQuery: "",
  importPreview: null,
  importFile: null,
  efficiency: null,
  efficiencyLoading: false
};

const el = (id) => document.getElementById(id);

function isOAuthMode() {
  return state.larkOAuthEnabled && !state.mockUsers.length;
}

function isSuperAdmin() {
  return userRoles(state.currentUser).includes("super_admin");
}

function userRoles(user) {
  return [...new Set([...(user?.roles || []), user?.role].filter(Boolean))];
}

function hasAdminCapability(user = state.currentUser) {
  return userRoles(user).some((role) => ["delivery_admin", "super_admin"].includes(role));
}

function visibleAdminColumns() {
  const hidden = new Set(state.fieldPreferences.hiddenFields || []);
  const configured = (state.fieldPreferences.fieldOrder || []).filter((field) => state.fields.some((item) => (item.name || item.id) === field));
  const source = configured.length ? configured : TABLE_COLUMNS;
  const visible = orderAndPinColumns([...new Set(source)].filter((field) => !hidden.has(field)));
  const fixed = (state.fieldPreferences.pinnedFields || []).filter((field) => visible.includes(field)).slice(0, 4);
  return fixed.length ? fixed : visible;
}

function orderAndPinColumns(columns) {
  const allowed = new Set(columns);
  const preferred = (state.fieldPreferences.fieldOrder || []).filter((field) => allowed.has(field));
  const ordered = [...preferred, ...columns.filter((field) => !preferred.includes(field))];
  const pinned = (state.fieldPreferences.pinnedFields || []).filter((field) => allowed.has(field)).slice(0, 4);
  return [...pinned, ...ordered.filter((field) => !pinned.includes(field))];
}

function pinnedColumnPresentation(column, columns) {
  const configured = new Set((state.fieldPreferences.pinnedFields || []).slice(0, 4));
  const pinned = columns.filter((item) => configured.has(item)).slice(0, 4);
  const index = pinned.indexOf(column);
  if (index < 0) return { className: "", style: "" };
  let left = 0;
  for (let cursor = 0; cursor < index; cursor += 1) {
    left += pinned[cursor] === "项目名称" ? 220 : 180;
  }
  const width = column === "项目名称" ? 220 : 180;
  return {
    className: "pinned-column",
    style: `left:${left}px;min-width:${width}px;width:${width}px;max-width:${width}px`
  };
}

function canEditAdminField(field) {
  return state.adminMode && Boolean(field);
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
    ...state.mockUsers.map((user) => user.name),
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
      ? `数据读取失败：${escapeHtml(meta.message || "暂时无法连接服务")}。请确认前端与后端服务均已启动后刷新。`
      : "当前台账为空。管理员可通过“去飞书添加”维护在线表格，或上传 Excel。";
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
  if (!state.adminMode) return state.requesterRecords;
  const sourceRecords = state.adminMode ? state.records : state.publicRecords;
  const filtered = sourceRecords.filter((record) => {
    const queryMatch = matchesQuery(record, state.query);
    const filtersMatch = state.adminMode
      ? Object.entries(state.filters).every(([field, value]) => !value || cell(record, field) === value)
      : true;
    return queryMatch && filtersMatch;
  });
  if (!state.sortField || !state.sortDirection) return filtered;
  const direction = state.sortDirection === "desc" ? -1 : 1;
  return [...filtered].sort((left, right) => {
    const a = cell(left, state.sortField);
    const b = cell(right, state.sortField);
    const dateA = parseDate(a);
    const dateB = parseDate(b);
    if (dateA && dateB) return (dateA - dateB) * direction;
    return String(a).localeCompare(String(b), "zh-CN", { numeric: true, sensitivity: "base" }) * direction;
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

async function loadRequesterRecords() {
  if (!state.authRole || state.adminMode) return [];
  const data = await fetchJson(`/api/my-records?t=${Date.now()}`);
  return data.records || [];
}

async function loadRequesterBootstrap() {
  if (state.adminMode) return;
  state.requesters = state.mockUsers
    .filter((user) => userRoles(user).includes("requester"))
    .map((user) => user.name);
  if (state.authRole === "requester" && state.currentUser) {
    state.requesterName = state.currentUser.name;
    state.requesterRecords = await loadRequesterRecords();
    return;
  }
  state.requesterRecords = [];
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

function renderHeaderCell(column, columns = []) {
  const pin = pinnedColumnPresentation(column, columns);
  if (!state.adminMode || column === "操作") {
    return `<th class="${pin.className}" style="${pin.style}">${escapeHtml(column)}</th>`;
  }

  const filterable = FILTER_FIELDS.includes(column);
  const options = filterable ? uniqueValues(column) : [];
  const pinned = (state.fieldPreferences.pinnedFields || []).includes(column);
  const sortLabel = state.sortField === column
    ? (state.sortDirection === "asc" ? "升序" : "降序")
    : "排序";
  return `
    <th class="filterable-head ${pin.className}" style="${pin.style}">
      <label class="table-head-control">
        <span class="table-head-title">
          <b>${escapeHtml(column)}</b>
          <span class="table-head-actions">
            <button class="column-action ${state.sortField === column ? "active" : ""}" type="button"
              data-sort-column="${escapeAttr(column)}" title="${escapeAttr(sortLabel)}">${state.sortField === column && state.sortDirection === "desc" ? "↓" : "↑"}</button>
            <button class="column-action ${pinned ? "active" : ""}" type="button"
              data-pin-column="${escapeAttr(column)}" title="${pinned ? "取消固定并恢复常规视图" : "固定后仅显示所选词条"}">⌖</button>
            <button class="column-action" type="button" data-hide-column="${escapeAttr(column)}" title="隐藏列">−</button>
          </span>
        </span>
        ${filterable ? `
          <select class="table-filter-select" data-filter-field="${escapeHtml(column)}">
            <option value="">全部</option>
            ${options.map((value) => `<option value="${escapeHtml(value)}" ${state.filters[column] === value ? "selected" : ""}>${escapeHtml(statusLabel(value))}</option>`).join("")}
          </select>
        ` : ""}
      </label>
    </th>
  `;
}

function renderTable(records) {
  const tableColumns = state.adminMode ? visibleAdminColumns() : VISITOR_COLUMNS;
  el("recordSummary").textContent = `${records.length} 条记录`;
  if (!records.length) {
    el("records").innerHTML = `<div class="empty">没有符合条件的项目</div>`;
    return;
  }

  const columns = state.adminMode ? [...tableColumns, "操作"] : tableColumns;
  el("records").innerHTML = `
    <table class="data-table ${state.adminMode ? "admin-table" : "visitor-table"}">
      <thead>
        <tr>${columns.map((column) => renderHeaderCell(column, tableColumns)).join("")}</tr>
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
  const tableColumns = state.adminMode ? visibleAdminColumns() : VISITOR_COLUMNS;
  const cells = tableColumns.map((column) => {
    const value = cell(record, column);
    const pin = pinnedColumnPresentation(column, tableColumns);
    if (column === "获取状态" && state.adminMode) {
      return `<td class="status-cell ${pin.className}" style="${pin.style}">${renderStatusSelect(record, value)}</td>`;
    }
    const className = `${column === "项目名称" ? "project-name-cell" : ""} ${pin.className}`;
    return `<td class="${className}" style="${pin.style}" title="${escapeHtml(value)}">${renderFieldValue(column, value)}</td>`;
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
  const heading = section.querySelector(".requester-hero h2");
  const description = section.querySelector(".requester-hero > div > p:not(.eyebrow)");
  const userLabel = section.querySelector(".current-user span");
  if (heading) heading.textContent = "我的需求进展";
  if (description) description.textContent = "仅展示本人提交、负责、关注或担任 PM 的需求，系统按获取状态转换为进度条。";
  if (userLabel) userLabel.textContent = "当前用户";
  el("requestSubmitButton").classList.remove("hidden");
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
      ${renderSatisfactionControl(record)}
    </article>
  `).join("") : `<div class="empty">当前暂无与本人相关的需求</div>`;
}

function renderSatisfactionControl(record) {
  const score = cell(record, "满意度");
  if (score) {
    return `<div class="satisfaction-result"><b>满意度</b><span>${escapeHtml(score)} / 5 · ${escapeHtml(cell(record, "满意度评价来源") || "需求方评价")}</span></div>`;
  }
  if (statusProgress(cell(record, "获取状态")) < 100) return "";
  return `
    <form class="satisfaction-form" data-satisfaction-record="${escapeHtml(record.record_id)}">
      <label><span>交付满意度</span><select name="score" required><option value="">请选择</option><option value="5">5 分</option><option value="4">4 分</option><option value="3">3 分</option><option value="2">2 分</option><option value="1">1 分</option></select></label>
      <label><span>评价说明</span><input name="comment" placeholder="1–3 星必须填写理由" /></label>
      <button class="button mini" type="submit">提交评价</button>
      <button class="button mini subtle" type="button" data-default-satisfaction="${escapeHtml(record.record_id)}">关闭并默认五星</button>
    </form>`;
}

async function submitSatisfaction(recordId, score, comment, defaulted = false) {
  const result = await fetchJson(`/api/requests/${encodeURIComponent(recordId)}/satisfaction`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ score: Number(score), comment, defaulted })
  });
  state.requesterRecords = result.data?.records || await loadRequesterRecords();
  renderAll();
}

function metricValue(value, suffix = "天") {
  return value == null ? "N/A" : `${Number(value).toFixed(2).replace(/\.?0+$/, "")}${suffix}`;
}

function renderEfficiency() {
  const target = el("efficiencySection");
  if (!state.efficiency) {
    target.classList.remove("hidden");
    el("efficiencyKpis").innerHTML = `<div class="empty">${state.efficiencyLoading ? "正在计算交付效率…" : "暂无交付效率数据"}</div>`;
    el("efficiencyStages").innerHTML = "";
    el("efficiencyDeviation").innerHTML = "";
    el("efficiencySources").innerHTML = "";
    return;
  }
  const data = state.efficiency;
  const fullStage = data.stages.find((stage) => stage.key === "proposed_to_delivered");
  el("efficiencyGeneratedAt").textContent = `计算时间 ${new Date(data.generatedAt).toLocaleString("zh-CN", { hour12: false })}`;
  el("efficiencyKpis").innerHTML = `
    <article><span>合并台账</span><strong>${data.totalRecords}</strong><small>去重后的需求数</small></article>
    <article><span>可分析项目</span><strong>${data.analyzableRecords}</strong><small>至少具备一组有效节点</small></article>
    <article><span>Q1 全流程</span><strong>${metricValue(fullStage?.q1.averageDays)}</strong><small>${fullStage?.q1.sampleCount || 0} 个样本</small></article>
    <article><span>Q2 全流程</span><strong>${metricValue(fullStage?.q2.averageDays)}</strong><small>${fullStage?.q2.sampleCount || 0} 个样本</small></article>
  `;
  el("efficiencyStages").innerHTML = `
    <table class="efficiency-table">
      <thead><tr><th>交付环节</th><th>Q1 样本</th><th>Q1 平均</th><th>Q2 样本</th><th>Q2 平均</th><th>效率提升</th></tr></thead>
      <tbody>${data.stages.map((stage) => `
        <tr>
          <td>${escapeHtml(stage.label)}</td>
          <td>${stage.q1.sampleCount}</td>
          <td>${metricValue(stage.q1.averageDays)}</td>
          <td>${stage.q2.sampleCount}</td>
          <td>${metricValue(stage.q2.averageDays)}</td>
          <td class="${stage.improvementPercent > 0 ? "positive" : stage.improvementPercent < 0 ? "negative" : ""}">${metricValue(stage.improvementPercent, "%")}</td>
        </tr>`).join("")}</tbody>
    </table>`;
  el("efficiencyDeviation").innerHTML = ["q1", "q2"].map((quarter) => {
    const item = data.deliveryDeviation[quarter];
    return `
      <div class="deviation-row">
        <strong>${quarter.toUpperCase()}</strong>
        <span>平均 ${metricValue(item.averageDays)}</span>
        <span>${item.sampleCount} 个样本</span>
        <span class="early">提前 ${item.earlyCount}</span>
        <span>准时 ${item.onTimeCount}</span>
        <span class="late">延期 ${item.delayedCount}</span>
      </div>`;
  }).join("");
  el("efficiencySources").innerHTML = `
    <table class="efficiency-table compact">
      <thead><tr><th>数据来源</th><th>Q1 样本 / 平均偏差</th><th>Q2 样本 / 平均偏差</th></tr></thead>
      <tbody>${data.bySource.map((source) => `
        <tr>
          <td>${escapeHtml(source.source)}</td>
          <td>${source.q1.sampleCount} / ${metricValue(source.q1.averageDays)}</td>
          <td>${source.q2.sampleCount} / ${metricValue(source.q2.averageDays)}</td>
        </tr>`).join("") || `<tr><td colspan="3">暂无可分析数据</td></tr>`}</tbody>
    </table>`;
}

async function loadEfficiency() {
  if (state.efficiencyLoading) return;
  state.efficiencyLoading = true;
  renderEfficiency();
  try {
    state.efficiency = await fetchJson("/api/analytics/delivery-efficiency");
  } finally {
    state.efficiencyLoading = false;
  }
  renderEfficiency();
}

function renderWorkspace() {
  const records = filteredRecords();
  const superAdmin = isSuperAdmin();
  const showAdminData = state.adminMode && state.activeView === "ledger";
  const showEfficiency = state.adminMode && state.activeView === "efficiency";

  el("loginGate").classList.toggle("hidden", Boolean(state.authRole));
  el("requesterSection").classList.toggle("hidden", state.authRole !== "requester");
  el("searchSection").classList.add("hidden");
  el("kpiSection").classList.toggle("hidden", !showAdminData);
  el("dashboardSection").classList.toggle("hidden", !showAdminData);
  el("worklistSection").classList.toggle("hidden", !showAdminData);
  el("efficiencySection").classList.toggle("hidden", !showEfficiency);
  el("adminTabs").classList.toggle("hidden", !state.adminMode);
  el("importButton").classList.toggle("hidden", !superAdmin);
  el("addRecordButton").classList.toggle("hidden", !state.adminMode);
  el("fieldSettingsButton").classList.toggle("hidden", !state.adminMode);
  el("larkSourcesButton").classList.toggle("hidden", !state.adminMode);
  el("userManagementButton").classList.toggle("hidden", !state.adminMode || !superAdmin);
  el("downloadMyDataButton").classList.toggle("hidden", state.authRole !== "requester");
  el("workspaceModeButton").classList.toggle(
    "hidden",
    !hasAdminCapability() || !userRoles(state.currentUser).includes("requester")
  );
  el("workspaceModeButton").textContent = state.adminMode ? "切换到我的需求" : "切换到管理员视图";
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

  el("adminTabs").querySelectorAll("[data-view]").forEach((button) => {
    button.classList.toggle("active", button.dataset.view === state.activeView);
  });

  if (showAdminData) {
    renderKpis(records);
    renderLegend(records);
    renderOwners(records);
    renderTimeline(records);
    renderTable(records);
  }
  if (showEfficiency) renderEfficiency();
  updateModeUI();
}

function renderAll() {
  renderMeta(state.meta);
  updateNotice(state.meta);
  renderWorkspace();
}

async function loadData() {
  const mode = state.adminMode ? "admin" : "mine";
  const data = await fetchJson(`${DATA_URL}?mode=${mode}&t=${Date.now()}`);
  state.fields = data.fields || [];
  state.records = data.records || [];
  state.meta = data.meta || {};
  if (state.adminMode) await loadFieldPreferences();
  await loadRequesterBootstrap();
  renderAll();
}

async function loadFieldPreferences() {
  const result = await fetchJson("/api/preferences/fields");
  state.fieldPreferences = result.preferences || { hiddenFields: [], fieldOrder: [], pinnedFields: [] };
}

async function openUserManagement() {
  const result = await fetchJson("/api/admin/users");
  state.adminUsers = result.users || [];
  state.adminCandidates = [];
  state.adminUserQuery = "";
  el("userManagementSearch").value = "";
  el("userManagementSearchStatus").textContent = "在系统内查询飞书企业通讯录，不会跳转新页面。";
  el("userManagementSearchStatus").classList.remove("error");
  renderUserManagement();
  el("userManagementDialog").showModal();
}

function renderUserManagement() {
  const query = normalizeText(state.adminUserQuery);
  const users = state.adminUsers.filter((user) => !query || normalizeText([
    user.name,
    user.department,
    user.email
  ].filter(Boolean).join(" ")).includes(query));
  const existingIds = new Set(state.adminUsers.map((user) => user.openId));
  const candidates = state.adminCandidates.filter((user) => !existingIds.has(user.openId));
  const adminCount = state.adminUsers.filter((user) => userRoles(user).includes("delivery_admin")).length;
  el("userManagementSummary").textContent = query
    ? `${candidates.length} 位可任命成员`
    : `${adminCount} 位交付管理员`;
  const adminRows = users.map((user) => {
    const roles = userRoles(user);
    const superAdmin = roles.includes("super_admin");
    return `
      <article class="user-management-row">
        <div class="user-profile">
          <strong>${escapeHtml(user.name || "未命名用户")}</strong>
          <span>${escapeHtml([user.department, user.email, user.openId].filter(Boolean).join(" · "))}</span>
        </div>
        <div class="user-role-controls">
          ${superAdmin
            ? `<span class="role-badge super">超级管理员</span>`
            : `<span class="role-badge admin">交付管理员</span>
              <button class="button mini danger-action" type="button" data-admin-action="revoke" data-admin-open-id="${escapeAttr(user.openId)}">移除管理员</button>`
          }
        </div>
      </article>`;
  }).join("");
  const candidateRows = candidates.map((user) => `
    <article class="user-management-row candidate">
      <div class="user-profile">
        <strong>${escapeHtml(user.name || "未命名用户")}</strong>
        <span>${escapeHtml([user.department, user.email].filter(Boolean).join(" · ") || user.openId)}</span>
      </div>
      <div class="user-role-controls">
        <span class="role-badge pending">飞书成员</span>
        <button class="button mini primary" type="button" data-admin-action="grant" data-admin-open-id="${escapeAttr(user.openId)}">任命管理员</button>
      </div>
    </article>
  `).join("");
  const empty = query
    ? `<div class="empty compact">${state.adminCandidates.length ? "匹配成员已是管理员。" : "输入姓名后从飞书通讯录查找。"}</div>`
    : `<div class="empty compact">输入姓名可从飞书通讯录任命新的管理员。</div>`;
  el("userManagementList").innerHTML = [adminRows, candidateRows].filter(Boolean).join("") || empty;
}

async function updateAdminAccess(openId, action) {
  const user = [...state.adminUsers, ...state.adminCandidates].find((item) => item.openId === openId);
  if (!user) return;
  const granting = action === "grant";
  const confirmed = window.confirm(
    granting
      ? `确认任命“${user.name || "该成员"}”为交付管理员？`
      : `确认撤销“${user.name || "该成员"}”的交付管理员权限？`
  );
  if (!confirmed) return;
  const currentRoles = userRoles(user).filter((role) => !["member", "delivery_admin"].includes(role));
  const roles = granting ? [...currentRoles, "delivery_admin"] : (currentRoles.length ? currentRoles : ["member"]);
  const result = await fetchJson(`/api/admin/users/${encodeURIComponent(openId)}/role`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      roles,
      user: {
        openId: user.openId,
        name: user.name,
        email: user.email || "",
        department: user.department || "未设置",
        avatar: user.avatar
      },
      note: granting ? "超级管理员任命" : "超级管理员移除"
    })
  });
  state.adminUsers = granting
    ? [...state.adminUsers.filter((item) => item.openId !== openId), result.user]
    : state.adminUsers.filter((item) => item.openId !== openId);
  state.adminCandidates = state.adminCandidates.filter((item) => item.openId !== openId);
  renderUserManagement();
}

async function searchAdminCandidates(query) {
  const keyword = String(query || "").trim();
  if (!keyword) {
    state.adminCandidates = [];
    el("userManagementSearchStatus").textContent = "请输入企业成员姓名后搜索。";
    el("userManagementSearchStatus").classList.remove("error");
    renderUserManagement();
    return;
  }
  el("userManagementSearchStatus").textContent = "正在查询飞书企业通讯录…";
  el("userManagementSearchStatus").classList.remove("error");
  try {
    const result = await fetchJson(`/api/lark/users/search?q=${encodeURIComponent(keyword)}&limit=12`);
    state.adminCandidates = result.users || [];
    el("userManagementSearchStatus").textContent = state.adminCandidates.length
      ? `找到 ${state.adminCandidates.length} 位飞书企业成员，请在下方任命。`
      : `飞书通讯录中没有找到“${keyword}”。`;
    renderUserManagement();
  } catch (error) {
    state.adminCandidates = [];
    el("userManagementSearchStatus").textContent = `飞书通讯录查询失败：${error.message}`;
    el("userManagementSearchStatus").classList.add("error");
    renderUserManagement();
  }
}

function fieldPreferenceOrder() {
  const available = state.fields.map((field) => field.name || field.id);
  const configured = (state.fieldPreferences.fieldOrder || []).filter((field) => available.includes(field));
  return [...configured, ...available.filter((field) => !configured.includes(field))];
}

function fieldSettingRow(field, visible) {
  const pinned = visible && (state.fieldPreferences.pinnedFields || []).includes(field);
  return `
    <div class="field-setting-row ${pinned ? "is-pinned" : ""}" draggable="true"
      data-field-setting="${escapeAttr(field)}" data-pinned="${pinned ? "true" : "false"}">
      <button class="drag-handle" type="button" title="拖动排序" aria-label="拖动 ${escapeAttr(field)}">⋮⋮</button>
      <span class="field-setting-name">${escapeHtml(field)}</span>
      <div class="field-order-actions">
        <button class="icon-button mini-icon" type="button" data-move-field="up" title="上移" aria-label="上移 ${escapeAttr(field)}">↑</button>
        <button class="icon-button mini-icon" type="button" data-move-field="down" title="下移" aria-label="下移 ${escapeAttr(field)}">↓</button>
        ${visible ? `<button class="button mini pin-field ${pinned ? "active" : ""}" type="button" data-pin-field title="${pinned ? "取消固定" : "固定后仅显示所选词条"}">${pinned ? "取消固定" : "固定"}</button>` : ""}
        <button class="button mini field-visibility-button" type="button" data-toggle-field="${visible ? "hidden" : "visible"}"
          title="${visible ? "隐藏词条" : "恢复词条"}" aria-label="${visible ? "隐藏" : "恢复"} ${escapeAttr(field)}">${visible ? "隐藏" : "恢复"}</button>
      </div>
    </div>`;
}

function renderFieldSettings() {
  const hidden = new Set(state.fieldPreferences.hiddenFields || []);
  const visibleFields = fieldPreferenceOrder().filter((field) => !hidden.has(field));
  const hiddenFields = fieldPreferenceOrder().filter((field) => hidden.has(field));
  el("visibleFieldSettings").innerHTML = visibleFields.map((field) => fieldSettingRow(field, true)).join("")
    || `<div class="field-drop-empty">把需要显示的词条拖到这里</div>`;
  el("hiddenFieldSettings").innerHTML = hiddenFields.map((field) => fieldSettingRow(field, false)).join("")
    || `<div class="field-drop-empty">暂无隐藏词条</div>`;
  el("visibleFieldCount").textContent = visibleFields.length;
  el("hiddenFieldCount").textContent = hiddenFields.length;
}

function openFieldSettings() {
  state.fieldPreferencesBackup = {
    hiddenFields: [...(state.fieldPreferences.hiddenFields || [])],
    fieldOrder: [...(state.fieldPreferences.fieldOrder || [])],
    pinnedFields: [...(state.fieldPreferences.pinnedFields || [])]
  };
  state.fieldPreferences = {
    hiddenFields: [...(state.fieldPreferences.hiddenFields || [])],
    fieldOrder: [...fieldPreferenceOrder()],
    pinnedFields: [...(state.fieldPreferences.pinnedFields || [])]
  };
  renderFieldSettings();
  el("fieldSettingsDialog").showModal();
}

function captureFieldSettings() {
  const visible = [...el("visibleFieldSettings").querySelectorAll("[data-field-setting]")].map((row) => row.dataset.fieldSetting);
  const hidden = [...el("hiddenFieldSettings").querySelectorAll("[data-field-setting]")].map((row) => row.dataset.fieldSetting);
  const pinned = [...el("visibleFieldSettings").querySelectorAll('[data-field-setting][data-pinned="true"]')]
    .map((row) => row.dataset.fieldSetting)
    .slice(0, 4);
  state.fieldPreferences = {
    hiddenFields: hidden,
    fieldOrder: [...visible, ...hidden],
    pinnedFields: pinned
  };
}

async function saveFieldSettings() {
  captureFieldSettings();
  const result = await fetchJson("/api/preferences/fields", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(state.fieldPreferences)
  });
  state.fieldPreferences = result.preferences;
  state.fieldPreferencesBackup = null;
  el("fieldSettingsDialog").close();
  renderWorkspace();
}

async function persistFieldPreferences() {
  const result = await fetchJson("/api/preferences/fields", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(state.fieldPreferences)
  });
  state.fieldPreferences = result.preferences;
  renderWorkspace();
}

async function hideTableColumn(column) {
  if (visibleAdminColumns().length <= 1) {
    alert("台账至少保留一个显示词条");
    return;
  }
  state.fieldPreferences.hiddenFields = [...new Set([...(state.fieldPreferences.hiddenFields || []), column])];
  state.fieldPreferences.pinnedFields = (state.fieldPreferences.pinnedFields || []).filter((field) => field !== column);
  await persistFieldPreferences();
}

async function togglePinnedTableColumn(column) {
  const pinned = new Set(state.fieldPreferences.pinnedFields || []);
  if (pinned.has(column)) pinned.delete(column);
  else {
    if (pinned.size >= 4) {
      alert("最多固定 4 个词条");
      return;
    }
    pinned.add(column);
  }
  state.fieldPreferences.pinnedFields = [...pinned];
  await persistFieldPreferences();
}

function toggleTableSort(column) {
  if (state.sortField !== column) {
    state.sortField = column;
    state.sortDirection = "asc";
  } else if (state.sortDirection === "asc") {
    state.sortDirection = "desc";
  } else {
    state.sortField = "";
    state.sortDirection = "";
  }
  renderWorkspace();
}

function cancelFieldSettings() {
  if (state.fieldPreferencesBackup) {
    state.fieldPreferences = state.fieldPreferencesBackup;
    state.fieldPreferencesBackup = null;
  }
  state.draggedField = "";
  el("fieldSettingsDialog").close();
}

function safeExternalUrl(value) {
  try {
    const url = new URL(String(value || ""));
    return ["https:", "http:"].includes(url.protocol) ? url.toString() : "";
  } catch {
    return "";
  }
}

async function openLarkSources(mode = "sync") {
  const result = await fetchJson("/api/sync/lark/sources");
  state.larkSources = result.sources || [];
  state.larkSyncIntervalMs = Number(result.intervalMs || 300000);
  state.larkSyncStatus = result.status || {};
  const minutes = Math.max(1, Math.round(state.larkSyncIntervalMs / 60000));
  const addMode = mode === "add";
  const syncState = state.larkSyncStatus.configured
    ? `同步服务已启用${state.larkSyncStatus.lastSyncedAt ? ` · 最近同步 ${new Date(state.larkSyncStatus.lastSyncedAt).toLocaleString("zh-CN", { hour12: false })}` : ""}`
    : "同步服务尚未完整配置";
  const pushState = state.larkSyncStatus.eventPushConfigured ? "飞书变更会秒级触发同步" : "实时推送密钥待配置";
  const syncError = state.larkSyncStatus.lastError ? `；最近同步失败：${state.larkSyncStatus.lastError}` : "";
  el("larkSourcesTitle").textContent = addMode ? "选择飞书表格" : "飞书在线数据源";
  el("larkSourcesHint").textContent = addMode
    ? "选择要维护的数据表，新增和修改操作将在飞书中完成。"
    : `${syncState}；${pushState}，并每 ${minutes} 分钟自动校准${syncError}。`;
  el("larkSourcesList").innerHTML = state.larkSources.map((source, index) => {
    const url = safeExternalUrl(source.url);
    const batch = source.lastBatch;
    return `
      <article class="lark-source-row">
        <div class="lark-source-copy">
          <b>${String(index + 1).padStart(2, "0")}</b>
          <div>
            <strong>${escapeHtml(source.source)}</strong>
            <span>${source.configured ? escapeHtml(source.tableId) : "尚未配置 table_id"}${source.viewId ? ` · ${escapeHtml(source.viewId)}` : ""}</span>
            <span>${batch ? `最近读取 ${Number(batch.total || 0)} 条 · ${new Date(batch.createdAt).toLocaleString("zh-CN", { hour12: false })}` : "尚无成功同步批次"}</span>
          </div>
        </div>
        <div class="lark-source-actions">
          <span class="source-state ${source.configured ? "ready" : "missing"}">${source.configured ? "表已配置" : "待配置"}</span>
          ${url ? `<a class="button mini${addMode ? " primary" : ""}" href="${escapeAttr(url)}" target="_blank" rel="noreferrer">${addMode ? "打开并添加" : "打开在线表格"}</a>` : `<button class="button mini" type="button" disabled>未配置链接</button>`}
        </div>
      </article>`;
  }).join("");
  el("syncLarkNow").classList.toggle("hidden", addMode || !isSuperAdmin());
  el("larkSourcesDialog").showModal();
}

async function syncLarkNow() {
  const button = el("syncLarkNow");
  button.disabled = true;
  button.textContent = "同步中…";
  try {
    const result = await fetchJson("/api/sync/lark", { method: "POST" });
    const changed = (result.results || []).reduce((sum, item) => sum + Number(item.batch?.inserted || 0) + Number(item.batch?.updated || 0), 0);
    button.textContent = `已同步 ${changed} 条变更`;
    await loadData();
  } finally {
    setTimeout(() => {
      button.disabled = false;
      button.textContent = "立即同步";
    }, 1200);
  }
}

function openImportDialog() {
  state.importPreview = null;
  state.importFile = null;
  el("excelImportForm").reset();
  el("importPreview").innerHTML = `<div class="empty compact">选择 Excel 文件后先进行预检</div>`;
  el("confirmExcelImport").disabled = true;
  el("excelImportDialog").showModal();
}

async function uploadExcel(file, source, dryRun) {
  const response = await fetch(`/api/import?source=${encodeURIComponent(source)}&dryRun=${dryRun ? "1" : "0"}`, {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "x-file-name": encodeURIComponent(file.name),
      ...(state.adminToken ? { "x-admin-token": state.adminToken } : {})
    },
    body: file
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || result?.ok === false) throw new Error(result?.message || "Excel 导入失败");
  return result;
}

function renderImportPreview(result) {
  const summary = result.summary || {};
  el("importPreview").innerHTML = `
    <div class="import-summary-grid">
      <span><b>${summary.total || 0}</b>读取</span>
      <span><b>${summary.inserted || 0}</b>新增</span>
      <span><b>${summary.updated || 0}</b>更新</span>
      <span><b>${summary.unchanged || 0}</b>未变化</span>
      <span><b>${summary.conflicts || 0}</b>重复</span>
    </div>
    <p>识别字段：${escapeHtml((result.fields || []).map((field) => field.name || field.id).slice(0, 12).join("、"))}${(result.fields || []).length > 12 ? "…" : ""}</p>`;
}

async function previewExcelImport() {
  const file = el("excelImportFile").files?.[0];
  if (!file) throw new Error("请选择 .xlsx 文件");
  if (!file.name.toLowerCase().endsWith(".xlsx")) throw new Error("仅支持 .xlsx Excel 文件");
  state.importFile = file;
  const result = await uploadExcel(file, el("excelImportSource").value, true);
  state.importPreview = result;
  renderImportPreview(result);
  el("confirmExcelImport").disabled = false;
}

async function confirmExcelImport() {
  if (!state.importFile || !state.importPreview) throw new Error("请先完成导入预检");
  const result = await uploadExcel(state.importFile, el("excelImportSource").value, false);
  state.fields = result.data.fields || [];
  state.records = result.data.records || [];
  state.meta = result.data.meta || {};
  state.query = "";
  state.draft = "";
  state.filters = {};
  el("projectSearchInput").value = "";
  el("excelImportDialog").close();
  renderAll();
}

function updateModeUI() {
  document.body.classList.toggle("login-mode", !state.authRole);
  document.body.classList.toggle("requester-mode", state.authRole === "requester");
  document.body.classList.remove("pm-mode");
  document.body.classList.toggle("admin-mode", state.adminMode);
  el("modeButton").textContent = state.authRole ? "退出登录" : "管理员登录";
  el("modeButton").classList.toggle("primary", state.adminMode);
  el("sessionContext").classList.toggle("hidden", !state.authRole);
  el("sessionUserName").textContent = state.currentUser?.name || "-";
  el("sessionRoleLabel").textContent = state.adminMode
    ? (isSuperAdmin() ? "超级管理员" : "交付管理员")
    : "需求方";
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
      ? "需求方登录后查看个人进展；仅由超级管理员任命的成员可进入管理员台账。"
      : "需求方登录后查看自己的需求进展并提交新需求，管理员维护交付台账。";
  }
  if (requesterLoginLabel) requesterLoginLabel.textContent = "需求方登录";
  if (requesterLoginHint) requesterLoginHint.textContent = oauthMode ? "使用飞书账号验证身份" : "查看我的需求进展";
  if (adminLoginLabel) adminLoginLabel.textContent = oauthMode ? "管理员登录" : "管理员登录";
  if (adminLoginHint) adminLoginHint.textContent = oauthMode ? "仅已任命管理员可进入" : "维护交付台账";
  el("authMethodLabel").textContent = oauthMode ? "Feishu OAuth" : "Local Preview";
  el("authMethodHint").textContent = oauthMode ? "企业身份认证" : "本地演示身份";
  el("requesterRegisterButton").classList.toggle("hidden", oauthMode);

  if (oauthMode && el("requesterAuthDialog").open) {
    el("requesterAuthDialog").close();
  }
}

function applyUser(user, preferredMode = "") {
  state.currentUser = user || null;
  if (!user) {
    state.authRole = "";
    state.adminMode = false;
    state.requesterName = "";
    return;
  }
  const roles = userRoles(user);
  const useAdminMode = hasAdminCapability(user) && (preferredMode === "admin" || !roles.includes("requester"));
  state.authRole = useAdminMode ? "admin" : "requester";
  state.adminMode = state.authRole === "admin";
  state.requesterName = user.name;
  state.activeView = state.authRole === "admin" ? "ledger" : state.authRole;
}

async function loadSession() {
  const session = await fetchJson(`/api/auth/me?t=${Date.now()}`);
  state.mockUsers = session.mockUsers || [];
  state.larkOAuthEnabled = Boolean(session.larkOAuthEnabled);
  const params = new URLSearchParams(window.location.search);
  if (session.authenticated) {
    applyUser(session.user, params.get("mode") || "");
  }
  if (params.get("auth_error") === "admin_only") {
    state.authError = "该飞书账号未被配置为管理员，请从需求方入口登录。";
    params.delete("auth_error");
    window.history.replaceState({}, "", `${window.location.pathname}${params.toString() ? `?${params}` : ""}`);
  }
}

async function logout() {
  await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" });
  window.history.replaceState({}, "", "/");
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
    window.location.href = `/api/auth/lark/login?next=${encodeURIComponent("/?mode=requester")}`;
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
    window.location.href = `/api/auth/lark/login?adminOnly=1&next=${encodeURIComponent("/?mode=admin")}`;
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
  applyUser(result.user, "requester");
  state.requesterName = result.user?.name || cleanName;
  if (!state.requesters.includes(cleanName)) {
    state.requesters = [...state.requesters, cleanName].sort((a, b) => a.localeCompare(b, "zh-CN"));
  }
  state.adminToken = "";
  state.requesterRecords = await loadRequesterRecords();
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
    <label class="${field.type === "textarea" ? "span-2" : ""} ${field.pmDependent ? "pm-dependent hidden" : ""}">
      <span>${escapeHtml(field.name)}${field.required ? " *" : ""}</span>
      ${renderDemandControl(field)}
      ${field.description ? `<small>${escapeHtml(field.description)}</small>` : ""}
    </label>
  `).join("");
  el("requestFormFields").querySelector('[name="是否设置PM"]')?.addEventListener("change", updatePmFieldVisibility);
  updatePmFieldVisibility();
}

function updatePmFieldVisibility() {
  const enabled = el("requestFormFields").querySelector('[name="是否设置PM"]')?.value === "是";
  const wrapper = el("requestFormFields").querySelector(".pm-dependent");
  const input = wrapper?.querySelector('[name="PM"]');
  wrapper?.classList.toggle("hidden", !enabled);
  if (input) {
    input.required = enabled;
    if (!enabled) input.value = "";
  }
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
  el("recordDialogTitle").textContent = record ? "编辑项目数据" : "添加项目数据";
  const hidden = new Set(state.fieldPreferences.hiddenFields || []);
  const editableFields = isSuperAdmin()
    ? state.fields.filter((field) => !hidden.has(field.name || field.id))
    : state.fields.filter((field) => canEditAdminField(field.name || field.id) && !hidden.has(field.name || field.id));
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
    body: JSON.stringify({ fields })
  });
  const result = await response.json();
  if (!response.ok || result.ok === false) throw new Error(result.message || "提交失败");
  state.requesterRecords = result.data?.records || await loadRequesterRecords();
  state.meta = result.data?.meta || state.meta;
  renderAll();
}

async function saveFollowers(recordId, followers) {
  const response = await fetch(`/api/requests/${encodeURIComponent(recordId)}/followers`, {
    method: "PATCH",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ followers })
  });
  const result = await response.json();
  if (!response.ok || result.ok === false) throw new Error(result.message || "保存关注人失败");
  state.requesterRecords = result.data?.records || await loadRequesterRecords();
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
el("importButton").addEventListener("click", openImportDialog);
el("addRecordButton").addEventListener("click", () => openLarkSources("add").catch((error) => alert(error.message)));
el("fieldSettingsButton").addEventListener("click", openFieldSettings);
el("larkSourcesButton").addEventListener("click", () => openLarkSources().catch((error) => alert(error.message)));
el("userManagementButton").addEventListener("click", () => openUserManagement().catch((error) => alert(error.message)));
el("downloadMyDataButton").addEventListener("click", () => {
  window.location.href = "/api/my-records/export";
});
el("workspaceModeButton").addEventListener("click", async () => {
  const nextMode = state.adminMode ? "requester" : "admin";
  applyUser(state.currentUser, nextMode);
  window.history.replaceState({}, "", `/?mode=${nextMode}`);
  await loadData();
});
el("closeUserManagementDialog").addEventListener("click", () => el("userManagementDialog").close());
el("cancelUserManagement").addEventListener("click", () => el("userManagementDialog").close());
el("userManagementList").addEventListener("click", (event) => {
  const button = event.target.closest("button[data-admin-action]");
  if (!button) return;
  updateAdminAccess(button.dataset.adminOpenId, button.dataset.adminAction).catch((error) => alert(error.message));
});
el("userManagementSearch").addEventListener("input", (event) => {
  state.adminUserQuery = event.target.value;
  if (!state.adminUserQuery.trim()) {
    state.adminCandidates = [];
    el("userManagementSearchStatus").textContent = "在系统内查询飞书企业通讯录，不会跳转新页面。";
    el("userManagementSearchStatus").classList.remove("error");
    renderUserManagement();
  }
});
el("userManagementSearchForm").addEventListener("submit", (event) => {
  event.preventDefault();
  searchAdminCandidates(state.adminUserQuery);
});
el("adminTabs").addEventListener("click", (event) => {
  const button = event.target.closest("button[data-view]");
  if (!button) return;
  state.activeView = button.dataset.view;
  renderWorkspace();
  if (state.activeView === "efficiency" && !state.efficiency) {
    loadEfficiency().catch((error) => alert(error.message));
  }
});
el("requesterLoginButton").addEventListener("click", () => openRequesterAuthDialog("login"));
el("requesterRegisterButton").addEventListener("click", () => openRequesterAuthDialog("register"));
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
  const defaultSatisfactionId = event.target.closest("button[data-default-satisfaction]")?.dataset.defaultSatisfaction;
  if (defaultSatisfactionId) {
    try {
      await submitSatisfaction(defaultSatisfactionId, 5, "用户关闭评价，默认五星好评", true);
    } catch (error) {
      alert(error.message);
    }
    return;
  }
  const saveId = event.target.closest("button[data-save-followers]")?.dataset.saveFollowers;
  if (!saveId) return;
  const input = el("requesterCards").querySelector(`input[data-follower-input="${CSS.escape(saveId)}"]`);
  try {
    await saveFollowers(saveId, input?.value || "");
  } catch (error) {
    alert(error.message);
  }
});
el("requesterCards").addEventListener("submit", async (event) => {
  const form = event.target.closest("form[data-satisfaction-record]");
  if (!form) return;
  event.preventDefault();
  const data = new FormData(form);
  try {
    const score = Number(data.get("score"));
    const comment = String(data.get("comment") || "").trim();
    if (score < 4 && !comment) throw new Error("满意度低于 4 星时必须填写理由");
    await submitSatisfaction(form.dataset.satisfactionRecord, score, comment);
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
  const sortColumn = event.target.closest("button[data-sort-column]")?.dataset.sortColumn;
  if (sortColumn) {
    toggleTableSort(sortColumn);
    return;
  }
  const pinColumn = event.target.closest("button[data-pin-column]")?.dataset.pinColumn;
  if (pinColumn) {
    togglePinnedTableColumn(pinColumn).catch((error) => alert(error.message));
    return;
  }
  const hideColumn = event.target.closest("button[data-hide-column]")?.dataset.hideColumn;
  if (hideColumn) {
    hideTableColumn(hideColumn).catch((error) => alert(error.message));
    return;
  }
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
el("closeFieldSettingsDialog").addEventListener("click", cancelFieldSettings);
el("cancelFieldSettings").addEventListener("click", cancelFieldSettings);
el("saveFieldSettings").addEventListener("click", () => saveFieldSettings().catch((error) => alert(error.message)));
el("restoreAllFields").addEventListener("click", () => {
  [...el("hiddenFieldSettings").querySelectorAll("[data-field-setting]")].forEach((row) => {
    el("visibleFieldSettings").appendChild(row);
  });
  captureFieldSettings();
  renderFieldSettings();
});
el("fieldSettingsList").addEventListener("click", (event) => {
  const row = event.target.closest("[data-field-setting]");
  if (!row) return;
  const move = event.target.closest("button[data-move-field]")?.dataset.moveField;
  if (move) {
    if (move === "up" && row.previousElementSibling?.matches("[data-field-setting]")) {
      row.parentElement.insertBefore(row, row.previousElementSibling);
    }
    if (move === "down" && row.nextElementSibling?.matches("[data-field-setting]")) {
      row.parentElement.insertBefore(row.nextElementSibling, row);
    }
    captureFieldSettings();
    renderFieldSettings();
    return;
  }
  const targetZone = event.target.closest("button[data-toggle-field]")?.dataset.toggleField;
  if (targetZone) {
    if (targetZone === "hidden") row.dataset.pinned = "false";
    el(targetZone === "hidden" ? "hiddenFieldSettings" : "visibleFieldSettings").appendChild(row);
    captureFieldSettings();
    renderFieldSettings();
    return;
  }
  if (event.target.closest("button[data-pin-field]")) {
    captureFieldSettings();
    const pinned = new Set(state.fieldPreferences.pinnedFields || []);
    if (pinned.has(row.dataset.fieldSetting)) pinned.delete(row.dataset.fieldSetting);
    else {
      if (pinned.size >= 4) {
        alert("最多固定 4 个词条");
        return;
      }
      pinned.add(row.dataset.fieldSetting);
    }
    state.fieldPreferences.pinnedFields = [...pinned];
    renderFieldSettings();
  }
});
el("fieldSettingsList").addEventListener("dragstart", (event) => {
  const row = event.target.closest("[data-field-setting]");
  if (!row) return;
  state.draggedField = row.dataset.fieldSetting;
  row.classList.add("dragging");
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", state.draggedField);
  }
});
el("fieldSettingsList").addEventListener("dragover", (event) => {
  const zone = event.target.closest("[data-field-zone]");
  if (!zone || !state.draggedField) return;
  event.preventDefault();
  const row = el("fieldSettingsList").querySelector(`[data-field-setting="${CSS.escape(state.draggedField)}"]`);
  if (!row) return;
  const target = event.target.closest("[data-field-setting]");
  if (target === row) return;
  if (!target) zone.appendChild(row);
  else {
    const rect = target.getBoundingClientRect();
    zone.insertBefore(row, event.clientY < rect.top + rect.height / 2 ? target : target.nextElementSibling);
  }
  if (zone.dataset.fieldZone === "hidden") row.dataset.pinned = "false";
});
el("fieldSettingsList").addEventListener("drop", (event) => {
  if (!event.target.closest("[data-field-zone]")) return;
  event.preventDefault();
  captureFieldSettings();
  state.draggedField = "";
  renderFieldSettings();
});
el("fieldSettingsList").addEventListener("dragend", () => {
  if (state.draggedField) captureFieldSettings();
  state.draggedField = "";
  renderFieldSettings();
});
el("closeLarkSourcesDialog").addEventListener("click", () => el("larkSourcesDialog").close());
el("cancelLarkSources").addEventListener("click", () => el("larkSourcesDialog").close());
el("syncLarkNow").addEventListener("click", () => syncLarkNow().catch((error) => alert(error.message)));
el("closeExcelImportDialog").addEventListener("click", () => el("excelImportDialog").close());
el("cancelExcelImport").addEventListener("click", () => el("excelImportDialog").close());
el("previewExcelImport").addEventListener("click", () => previewExcelImport().catch((error) => alert(error.message)));
el("confirmExcelImport").addEventListener("click", () => confirmExcelImport().catch((error) => alert(error.message)));
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
  applyUser(result.user || { name: "超级管理员", role: "super_admin" }, "admin");
  state.activeView = "ledger";
  state.publicRecords = [];
  state.suggestionRecords = [];
  el("adminDialog").close();
  await loadData();
});

async function bootstrap() {
  await loadSession();
  await loadData();
}

bootstrap().catch((error) => {
  state.meta = { status: "error", message: error.message };
  renderAll();
});

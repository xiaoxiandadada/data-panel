export const legacyShell = `<div class="data-atmosphere" aria-hidden="true">
      <div class="data-grid-floor"></div>
      <svg class="data-signal" viewBox="0 0 1200 360" preserveAspectRatio="none">
        <path class="signal-fill" d="M0 310 L0 230 C120 198 210 242 330 198 C450 154 540 188 650 150 C780 106 900 138 1020 96 C1100 68 1160 78 1200 52 L1200 360 L0 360 Z"></path>
        <path class="signal-line signal-line-a" d="M0 230 C120 198 210 242 330 198 C450 154 540 188 650 150 C780 106 900 138 1020 96 C1100 68 1160 78 1200 52"></path>
        <path class="signal-line signal-line-b" d="M0 276 C140 238 230 272 350 230 C460 192 570 228 690 186 C800 148 910 174 1040 132 C1118 106 1168 110 1200 96"></path>
        <g class="signal-bars">
          <rect x="80" y="244" width="18" height="62"></rect>
          <rect x="128" y="218" width="18" height="88"></rect>
          <rect x="176" y="258" width="18" height="48"></rect>
          <rect x="956" y="196" width="20" height="110"></rect>
          <rect x="1010" y="164" width="20" height="142"></rect>
          <rect x="1064" y="218" width="20" height="88"></rect>
        </g>
        <g class="data-points">
          <rect x="324" y="192" width="10" height="10"></rect>
          <rect x="646" y="145" width="10" height="10"></rect>
          <rect x="1016" y="91" width="10" height="10"></rect>
          <rect x="686" y="181" width="8" height="8"></rect>
          <rect x="1036" y="128" width="8" height="8"></rect>
        </g>
      </svg>
    </div>
    <main class="shell">
      <header class="topbar">
        <div>
          <p class="eyebrow">AICarrier Delivery Pipeline</p>
          <h1>交付管线</h1>
          <div id="sessionContext" class="session-context hidden" aria-label="当前登录身份">
            <span id="sessionRoleLabel">需求方</span>
            <strong id="sessionUserName">-</strong>
          </div>
        </div>
        <div class="actions">
          <button id="workspaceModeButton" class="button hidden" type="button">切换到我的需求</button>
          <button id="modeButton" class="button" type="button">管理员登录</button>
        </div>
      </header>

      <nav id="adminCommandBar" class="admin-command-bar admin-only" aria-label="管理员工具">
        <div class="command-bar-copy">
          <span>管理员工作台</span>
          <strong>统一台账与个人视图</strong>
        </div>
        <div class="command-group" aria-label="视图与权限">
          <button id="fieldSettingsButton" class="button admin-only hidden" type="button">自定义词条</button>
          <button id="larkSourcesButton" class="button admin-only hidden" type="button">同步状态</button>
          <button id="userManagementButton" class="button admin-only hidden" type="button">管理员设置</button>
        </div>
        <div class="command-group command-group-primary" aria-label="数据维护">
          <button id="addRecordButton" class="button admin-only hidden" type="button" title="在飞书中打开数据团队总台账">打开总台账</button>
          <button id="importButton" class="button admin-only hidden" type="button">上传 Excel</button>
          <button id="refreshButton" class="button primary admin-only" type="button">刷新数据</button>
        </div>
      </nav>

      <section id="loginGate" class="login-gate" aria-label="登录入口">
        <div class="login-data-backdrop" aria-hidden="true">
          <svg class="login-data-lines" viewBox="0 0 1000 360" preserveAspectRatio="none">
            <path d="M0 230 C110 178 190 218 310 166 C430 114 530 156 650 102 C780 44 880 82 1000 36"></path>
            <path d="M0 292 C140 236 250 260 390 214 C520 172 610 206 760 148 C870 106 930 112 1000 86"></path>
            <g>
              <circle cx="310" cy="166" r="5"></circle>
              <circle cx="650" cy="102" r="5"></circle>
              <circle cx="760" cy="148" r="4"></circle>
              <circle cx="390" cy="214" r="4"></circle>
            </g>
          </svg>
          <div class="backdrop-table">
            <i></i><i></i><i></i><i></i><i></i><i></i>
            <i></i><i></i><i></i><i></i><i></i><i></i>
          </div>
          <div class="backdrop-bars">
            <i></i><i></i><i></i><i></i><i></i>
          </div>
        </div>
        <div class="login-card">
          <div class="login-card-head">
            <div class="login-copy">
              <p class="eyebrow">身份入口</p>
              <h2>进入交付管线</h2>
              <p>企业成员完成身份认证后进入个人需求；已任命管理员进入交付台账。</p>
            </div>
            <div class="login-protocol" aria-label="身份验证方式">
              <i aria-hidden="true"></i>
              <div>
                <span id="authMethodLabel">Feishu OAuth</span>
                <small id="authMethodHint">企业身份认证</small>
              </div>
            </div>
          </div>
          <div class="login-actions">
            <button id="requesterLoginButton" class="login-entry primary" type="button">
              <span>需求方登录</span>
              <small>查看我的需求进展</small>
            </button>
            <button id="requesterRegisterButton" class="login-entry" type="button">
              <span>需求方注册</span>
              <small>创建账号并提交需求</small>
            </button>
            <button id="adminLoginButton" class="login-entry" type="button">
              <span>管理员登录</span>
              <small>维护交付台账</small>
            </button>
          </div>
        </div>
      </section>

      <section id="notice" class="notice hidden" aria-live="polite"></section>

      <nav id="adminTabs" class="view-tabs admin-only" aria-label="管理员视图">
        <button class="view-tab active" type="button" data-view="ledger">管理员台账</button>
        <button class="view-tab" type="button" data-view="efficiency">交付效率</button>
      </nav>

      <section id="requesterSection" class="requester-section hidden" aria-label="需求方进展">
        <div class="requester-hero">
          <div>
            <p class="eyebrow">需求方入口</p>
            <h2>我的需求进展</h2>
            <p>登录后只展示本人提交或对接的需求，系统按获取状态转换为进度条。</p>
          </div>
          <div class="requester-login">
            <div class="current-user">
              <span>当前需求方</span>
              <strong id="currentRequesterName">-</strong>
            </div>
            <button id="requestSubmitButton" class="button primary" type="button">提交新需求</button>
            <button id="downloadMyDataButton" class="button" type="button">下载数据</button>
          </div>
        </div>
        <div class="requester-summary">
          <article>
            <span>我的需求</span>
            <strong id="requesterTotal">0</strong>
          </article>
          <article>
            <span>平均进度</span>
            <strong id="requesterAverage">0%</strong>
          </article>
          <article>
            <span>已完成</span>
            <strong id="requesterDone">0</strong>
          </article>
        </div>
        <div id="requesterCards" class="requester-cards"></div>
      </section>

      <section id="kpiSection" class="kpi-grid hidden" aria-label="项目概览">
        <article class="kpi">
          <span>总事项</span>
          <strong id="totalCount">0</strong>
          <small id="totalHint">当前视图</small>
        </article>
        <article class="kpi">
          <span>进行中</span>
          <strong id="activeCount">0</strong>
          <small>需要持续推进</small>
        </article>
        <article class="kpi">
          <span>已完成</span>
          <strong id="doneCount">0</strong>
          <small id="doneRatio">0%</small>
        </article>
        <article class="kpi accent">
          <span>风险/延期</span>
          <strong id="riskCount">0</strong>
          <small>需关注</small>
        </article>
      </section>

      <section id="dashboardSection" class="dashboard-grid hidden">
        <div class="panel overview-panel">
          <div class="panel-head">
            <h2>完成度</h2>
            <span id="avgProgress">0%</span>
          </div>
          <div class="progress-wrap">
            <svg class="donut" viewBox="0 0 120 120" role="img" aria-label="平均完成度">
              <circle class="donut-bg" cx="60" cy="60" r="48"></circle>
              <circle id="donutValue" class="donut-value" cx="60" cy="60" r="48"></circle>
            </svg>
            <div class="legend" id="statusLegend"></div>
          </div>
        </div>

        <div class="panel">
          <div class="panel-head">
            <h2>负责人负载</h2>
            <span id="ownerCount">0 人</span>
          </div>
          <div id="ownerBars" class="bars"></div>
        </div>

        <div class="panel wide">
          <div class="panel-head">
            <h2>近期节点</h2>
            <span id="timelineHint">按截止时间排序</span>
          </div>
          <div id="timeline" class="timeline"></div>
        </div>
      </section>

      <section id="efficiencySection" class="efficiency-section hidden" aria-label="交付效率分析">
        <div class="efficiency-heading">
          <div>
            <p class="eyebrow">Delivery Efficiency</p>
            <h2>交付效率分析</h2>
            <p>按 Q1 / Q2 对比六个交付环节，并统计预计与实际交付偏差。</p>
          </div>
          <span id="efficiencyGeneratedAt">尚未计算</span>
        </div>
        <div id="efficiencyKpis" class="efficiency-kpis"></div>
        <div class="efficiency-block">
          <div class="panel-head">
            <h3>六个环节耗时</h3>
            <span>效率提升 =（Q1 − Q2）/ Q1</span>
          </div>
          <div id="efficiencyStages" class="table-wrap"></div>
        </div>
        <div class="efficiency-grid">
          <div class="efficiency-block">
            <div class="panel-head">
              <h3>预计与实际交付偏差</h3>
              <span>负值提前，正值延期</span>
            </div>
            <div id="efficiencyDeviation"></div>
          </div>
          <div class="efficiency-block">
            <div class="panel-head">
              <h3>按数据来源</h3>
              <span>合并台账口径</span>
            </div>
            <div id="efficiencySources" class="table-wrap"></div>
          </div>
        </div>
      </section>

      <section id="searchSection" class="project-search-section hidden" aria-label="全局查询">
        <div class="project-search-head">
          <div>
            <h2>全局查询</h2>
            <p id="projectSearchHint">可按项目名称、任务代码、负责人、项目对接人、部门、状态等信息查询</p>
          </div>
          <button id="clearProjectSearch" class="button subtle" type="button">清空</button>
        </div>
        <div class="project-search-box">
          <input
            id="projectSearchInput"
            type="search"
            autocomplete="off"
            placeholder="搜索项目、任务代码、负责人、对接人、部门、状态"
            aria-autocomplete="list"
            aria-controls="projectSuggestions"
            aria-expanded="false"
          />
          <button id="projectSearchButton" class="button primary" type="button">查询</button>
          <div id="projectSuggestions" class="suggestions hidden" role="listbox"></div>
        </div>
      </section>

      <section id="worklistSection" class="worklist-section hidden">
        <p id="recordSummary" class="hidden">0 条记录</p>
        <div id="filterGrid" class="filter-grid hidden" aria-label="字段筛选"></div>
        <div id="activeFilters" class="filter-chips hidden"></div>
        <div id="records" class="records table-wrap"></div>
      </section>

      <dialog id="recordDialog" class="record-dialog">
        <form id="recordForm" method="dialog">
          <div class="dialog-head">
            <div>
              <h2 id="recordDialogTitle">添加数据</h2>
              <p>按飞书表格字段录入，保存后写入本地看板</p>
            </div>
            <button id="closeRecordDialog" class="icon-button" type="button" title="关闭">×</button>
          </div>
          <div id="recordFormFields" class="form-grid"></div>
          <div class="dialog-actions">
            <button class="button" type="button" id="cancelRecordForm">取消</button>
            <button class="button primary" type="submit">保存</button>
          </div>
        </form>
      </dialog>

      <dialog id="excelImportDialog" class="admin-dialog wide-dialog">
        <form id="excelImportForm" method="dialog">
          <div class="dialog-head">
            <div>
              <h2>上传 Excel 数据</h2>
              <p>选择数据来源并预检，系统会按业务标识增量新增或更新，不覆盖整张台账。</p>
            </div>
            <button id="closeExcelImportDialog" class="icon-button" type="button" title="关闭">×</button>
          </div>
          <div class="admin-form-body import-form-body">
            <label>
              <span>数据来源</span>
              <select id="excelImportSource">
                <option value="ledger">总台账</option>
                <option value="245">245</option>
                <option value="gaofeng">高峰加入</option>
              </select>
            </label>
            <label>
              <span>Excel 文件</span>
              <input id="excelImportFile" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" />
            </label>
            <div id="importPreview" class="import-preview"><div class="empty compact">选择 Excel 文件后先进行预检</div></div>
          </div>
          <div class="dialog-actions">
            <button class="button" type="button" id="cancelExcelImport">取消</button>
            <button class="button" type="button" id="previewExcelImport">预检</button>
            <button class="button primary" type="button" id="confirmExcelImport" disabled>确认导入</button>
          </div>
        </form>
      </dialog>

      <dialog id="fieldSettingsDialog" class="admin-dialog field-settings-dialog wide-dialog">
        <div>
          <div class="dialog-head">
            <div>
              <h2>自定义词条</h2>
              <p>常用词条数量不限，设置后台账仅显示所选词条；可拖动或使用上下按钮排序，取消全部常用词条即可恢复完整视图。</p>
            </div>
            <button id="closeFieldSettingsDialog" class="icon-button" type="button" title="关闭">×</button>
          </div>
          <div id="fieldSettingsList" class="field-settings-board">
            <section class="field-settings-column">
              <header>
                <div><strong>显示词条</strong><span>常用词条数量不限，前 4 个滚动时固定</span></div>
                <b id="visibleFieldCount">0</b>
              </header>
              <div id="visibleFieldSettings" class="field-drop-zone" data-field-zone="visible"></div>
            </section>
            <section class="field-settings-column">
              <header>
                <div><strong>隐藏词条</strong><span>可逐项恢复或全部恢复</span></div>
                <div class="field-column-actions">
                  <b id="hiddenFieldCount">0</b>
                  <button id="restoreAllFields" class="button mini" type="button">恢复全部</button>
                </div>
              </header>
              <div id="hiddenFieldSettings" class="field-drop-zone" data-field-zone="hidden"></div>
            </section>
          </div>
          <div class="dialog-actions">
            <button class="button" type="button" id="cancelFieldSettings">取消</button>
            <button class="button primary" type="button" id="saveFieldSettings">保存设置</button>
          </div>
        </div>
      </dialog>

      <dialog id="larkSourcesDialog" class="admin-dialog wide-dialog">
        <div>
          <div class="dialog-head">
            <div>
              <h2 id="larkSourcesTitle">飞书在线数据源</h2>
              <p id="larkSourcesHint">服务启动后立即同步，之后按配置间隔自动增量同步。</p>
            </div>
            <button id="closeLarkSourcesDialog" class="icon-button" type="button" title="关闭">×</button>
          </div>
          <div id="larkSourcesList" class="lark-sources-list"></div>
          <div class="dialog-actions">
            <button class="button" type="button" id="cancelLarkSources">关闭</button>
            <button class="button primary" type="button" id="syncLarkNow">立即同步</button>
          </div>
        </div>
      </dialog>

      <dialog id="userManagementDialog" class="admin-dialog wide-dialog">
        <div>
          <div class="dialog-head">
            <div>
              <h2>管理员设置</h2>
              <p>仅超级管理员可以从飞书通讯录任命管理员；需求方身份由成员从需求方入口登录后单独建立。</p>
            </div>
            <button id="closeUserManagementDialog" class="icon-button" type="button" title="关闭">×</button>
          </div>
          <div class="user-management-toolbar">
            <form id="userManagementSearchForm" class="user-management-search">
              <label>
                <span>添加管理员</span>
                <input id="userManagementSearch" type="search" placeholder="输入企业成员姓名" autocomplete="off" />
              </label>
              <button class="button primary" type="submit">搜索飞书通讯录</button>
            </form>
            <span id="userManagementSummary" class="muted-label">0 位成员</span>
          </div>
          <p id="userManagementSearchStatus" class="user-management-search-status">在系统内查询飞书企业通讯录，不会跳转新页面。</p>
          <div id="userManagementList" class="user-management-list"></div>
          <div class="dialog-actions">
            <button class="button" type="button" id="cancelUserManagement">关闭</button>
          </div>
        </div>
      </dialog>

      <dialog id="requesterAuthDialog" class="admin-dialog">
        <form id="requesterAuthForm" method="dialog">
          <div class="dialog-head">
            <div>
              <h2 id="requesterAuthTitle">需求方登录</h2>
              <p id="requesterAuthHint">本地演示使用模拟账号登录</p>
            </div>
            <button id="closeRequesterAuthDialog" class="icon-button" type="button" title="关闭">×</button>
          </div>
          <div class="admin-form-body">
            <label>
              <span>姓名 / 账号</span>
              <input id="requesterAuthName" type="text" list="requesterNameOptions" autocomplete="name" />
              <datalist id="requesterNameOptions"></datalist>
            </label>
            <label class="register-only hidden">
              <span>所属部门</span>
              <input id="requesterAuthDepartment" type="text" autocomplete="organization" />
            </label>
            <p id="requesterAuthError" class="form-error hidden"></p>
          </div>
          <div class="dialog-actions">
            <button class="button" type="button" id="cancelRequesterAuthForm">取消</button>
            <button class="button primary" type="submit" id="requesterAuthSubmit">登录</button>
          </div>
        </form>
      </dialog>

      <dialog id="requestDialog" class="record-dialog">
        <form id="requestForm" method="dialog">
          <div class="dialog-head">
            <div>
              <h2>提交新需求</h2>
              <p>参考飞书提需求表录入，提交后自动进入交付管线初始阶段</p>
            </div>
            <button id="closeRequestDialog" class="icon-button" type="button" title="关闭">×</button>
          </div>
          <div id="requestFormFields" class="form-grid"></div>
          <div class="dialog-actions">
            <button class="button" type="button" id="cancelRequestForm">取消</button>
            <button class="button primary" type="submit">提交需求</button>
          </div>
        </form>
      </dialog>

      <dialog id="detailDialog" class="record-dialog detail-dialog">
        <div class="detail-dialog-body">
          <div class="dialog-head">
            <div>
              <h2 id="detailDialogTitle">台账日志</h2>
              <p id="detailDialogSubtitle">管理员查看关键字段和状态变更记录</p>
            </div>
            <button id="closeDetailDialog" class="icon-button" type="button" title="关闭">×</button>
          </div>
          <div class="detail-content ledger-only">
            <section>
              <div class="detail-section-head">
                <div>
                  <h3>台账日志</h3>
                  <p>系统自动记录管理员维护、字段更新、状态变化和需求流转动作</p>
                </div>
                <span id="ledgerLogCount" class="muted-label">0 条</span>
              </div>
              <div id="ledgerLogList" class="ledger-log-list"></div>
            </section>
          </div>
          <div class="dialog-actions">
            <button class="button" type="button" id="cancelDetailDialog">关闭</button>
          </div>
        </div>
      </dialog>

      <dialog id="adminDialog" class="admin-dialog">
        <form id="adminForm" method="dialog">
          <div class="dialog-head">
            <div>
              <h2>进入管理员模式</h2>
              <p>管理员可导入、编辑项目情况</p>
            </div>
            <button id="closeAdminDialog" class="icon-button" type="button" title="关闭">×</button>
          </div>
          <div class="admin-form-body">
            <label>
              <span>管理员口令</span>
              <input id="adminPassword" type="password" autocomplete="current-password" />
            </label>
            <p id="adminError" class="form-error hidden"></p>
          </div>
          <div class="dialog-actions">
            <button class="button" type="button" id="cancelAdminForm">取消</button>
            <button class="button primary" type="submit">进入</button>
          </div>
        </form>
      </dialog>
    </main>`;

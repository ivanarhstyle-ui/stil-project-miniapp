
(() => {
  "use strict";

  const tg = window.Telegram?.WebApp;
  if (tg) {
    tg.ready();
    tg.expand();
    try { tg.setHeaderColor("secondary_bg_color"); } catch (_) {}
    try { tg.setBackgroundColor("secondary_bg_color"); } catch (_) {}
  }

  const STORAGE_KEY = "stil_project_state_v1";
  const routeState = { route: "home", projectId: "efimova21", projectTab: "summary", stage: "P", sectionId: null };

  let state = loadState();
  migrateState();

  function migrateState() {
    state.projects.forEach(p => {
      if (!Array.isArray(p.documents)) p.documents = [];
      if (!Array.isArray(p.priceChanges)) p.priceChanges = [];
    });
    saveState();
  }

  function deepClone(value) { return JSON.parse(JSON.stringify(value)); }
  function loadState() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? JSON.parse(saved) : deepClone(STIL_SEED);
    } catch (_) { return deepClone(STIL_SEED); }
  }
  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  const FILE_DB = "stil_project_files_v1";
  const FILE_STORE = "files";
  function openFileDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(FILE_DB, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(FILE_STORE)) db.createObjectStore(FILE_STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  async function putBlob(id, blob) {
    const db = await openFileDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(FILE_STORE, "readwrite");
      tx.objectStore(FILE_STORE).put(blob, id);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  }
  async function getBlob(id) {
    const db = await openFileDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(FILE_STORE, "readonly");
      const req = tx.objectStore(FILE_STORE).get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }
  async function deleteBlob(id) {
    const db = await openFileDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(FILE_STORE, "readwrite");
      tx.objectStore(FILE_STORE).delete(id);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  }
  async function clearBlobs() {
    const db = await openFileDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(FILE_STORE, "readwrite");
      tx.objectStore(FILE_STORE).clear();
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  }

  async function resetState() {
    state = deepClone(STIL_SEED);
    migrateState();
    try { await clearBlobs(); } catch (_) {}
    saveState();
    toast("Тестовые данные восстановлены");
    render();
  }

  function documentIcon(meta) {
    const type = meta?.type || "";
    const name = (meta?.name || "").toLowerCase();
    if (type.includes("pdf") || name.endsWith(".pdf")) return "PDF";
    if (type.startsWith("image/")) return "▧";
    if (name.endsWith(".doc") || name.endsWith(".docx")) return "W";
    if (name.endsWith(".xls") || name.endsWith(".xlsx")) return "X";
    if (name.endsWith(".dwg") || name.endsWith(".dxf")) return "CAD";
    return "⌑";
  }
  function formatBytes(bytes = 0) {
    if (bytes < 1024) return `${bytes} Б`;
    if (bytes < 1024*1024) return `${Math.round(bytes/1024)} КБ`;
    return `${(bytes/1024/1024).toFixed(1)} МБ`;
  }
  function documentsFor(p, targetType, targetId) {
    return (p.documents || []).filter(d => d.targetType === targetType && d.targetId === targetId);
  }
  function documentRowsHTML(p, targetType, targetId) {
    const docs = documentsFor(p, targetType, targetId);
    if (!docs.length) return '<div class="empty">Документов пока нет</div>';
    return docs.map(d => `
      <div class="doc-row">
        <div class="doc-icon">${documentIcon(d)}</div>
        <div class="grow"><div class="doc-name">${escapeHtml(d.name)}</div><div class="doc-meta">${escapeHtml(d.createdAt || "")} · ${formatBytes(d.size)}</div></div>
        <div class="doc-actions"><button class="mini-btn" data-open-doc="${d.id}">Открыть</button></div>
      </div>`).join("");
  }
  async function storeAttachment(file, targetType, targetId, label = "") {
    if (!file) throw new Error("Файл не выбран");
    if (file.size > 50 * 1024 * 1024) throw new Error("Максимальный размер файла в тестовой версии — 50 МБ");
    const p = project();
    const id = `doc-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
    await putBlob(id, file);
    const meta = {
      id, targetType, targetId, label,
      name: file.name || `Фото ${new Date().toLocaleString("ru-RU")}`,
      type: file.type || "application/octet-stream",
      size: file.size || 0,
      createdAt: new Date().toLocaleString("ru-RU")
    };
    p.documents.push(meta);
    saveState();
    return meta;
  }

  const $ = (sel) => document.querySelector(sel);
  const view = $("#view");
  const sheetBackdrop = $("#sheetBackdrop");
  const sheet = $("#sheet");
  const toastEl = $("#toast");

  const fmt = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 });
  const money = (n) => `${fmt.format(Number(n || 0))} ₽`;
  const numberValue = (v) => Number(String(v ?? "").replace(/[^\d.-]/g, "")) || 0;
  function stageById(p, id) { return p.stages.find(s => s.id === id); }
  function sectionValue(s) { return Number(s.advance || 0) + Number(s.closing || 0); }
  function sectionsTotal(p, stageId) { return stageSections(p, stageId).reduce((sum,s) => sum + sectionValue(s), 0); }
  function stagesTotal(p) { return p.stages.reduce((sum,s) => sum + Number(s.value || 0), 0); }
  function priceTargetTitle(p, change) {
    if (change.level === "contract") return "Договор";
    if (change.level === "stage") return stageById(p, change.targetId)?.title || "Этап";
    if (change.level === "section") {
      const s = section(p, change.targetId);
      return s ? `${s.code} — ${s.name}` : "Раздел";
    }
    return "Стоимость";
  }

  const percent = (n) => `${Math.round(n * 100)}%`;
  const escapeHtml = (s = "") => String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));

  function haptic(type = "light") {
    try { tg?.HapticFeedback?.impactOccurred(type); } catch (_) {}
  }

  function toast(message) {
    toastEl.textContent = message;
    toastEl.hidden = false;
    setTimeout(() => { toastEl.hidden = true; }, 1700);
  }

  function userName() {
    const user = tg?.initDataUnsafe?.user;
    return user?.first_name ? `${user.first_name}${user.last_name ? " " + user.last_name : ""}` : "Роман";
  }
  $("#telegramUser").textContent = tg ? `${userName()} · Telegram Mini App` : "Демо в браузере";

  function project(id = routeState.projectId) { return state.projects.find(p => p.id === id) || state.projects[0]; }
  function section(p, id) { return p.sections.find(s => s.id === id); }

  function statusLabel(code) {
    return ({todo:"Не начато",work:"В работе",review:"На проверке",waiting:"Ожидание",issued:"Выдано",approved:"Согласовано",paused:"Приостановлено"}[code] || code);
  }
  function statusPill(code) {
    const cls = ({todo:"",work:"blue",review:"yellow",waiting:"yellow",issued:"blue",approved:"green",paused:"red"}[code] || "");
    return `<span class="pill ${cls}">${statusLabel(code)}</span>`;
  }
  function dataStatusPill(code) {
    const map = {waiting:["yellow","Ожидаем"],received:["green","Получено"],na:["","Не требуется"]};
    const [cls, text] = map[code] || ["", code];
    return `<span class="pill ${cls}">${text}</span>`;
  }

  function stageSections(p, stage = p.currentStage) { return p.sections.filter(s => s.stage === stage); }
  function stageProgress(p, stage = p.currentStage) {
    const arr = stageSections(p, stage);
    if (!arr.length) return 0;
    const weights = {todo:0, waiting:.15, paused:.15, work:.45, review:.7, issued:.88, approved:1};
    return arr.reduce((sum,s) => sum + (weights[s.status] ?? 0), 0) / arr.length;
  }
  function projectAttention(p) {
    const items = [];
    const pSections = stageSections(p, p.currentStage);
    pSections.filter(s => !s.executor).forEach(s => items.push({
      type:"yellow", title:`${s.code} — нет исполнителя`, sub:s.name, action:() => openSection(s.id)
    }));
    p.initialData.filter(d => d.status === "waiting" && d.blocks?.length).forEach(d => items.push({
      type:"red", title:`Не получено: ${d.title}`, sub:`Блокирует ${d.blocks.map(id => section(p,id)?.code).filter(Boolean).join(", ") || "разделы"}`,
      action:() => openInitialData(d.id)
    }));
    state.tasks.filter(t => t.projectId===p.id && !t.done && t.priority==="critical").forEach(t => items.unshift({
      type:"red", title:t.title, sub:`Задача · ${t.owner}`, action:() => route("tasks")
    }));
    const waitingPayment = p.payments.find(x => x.status==="waiting");
    if (waitingPayment) items.push({type:"yellow", title:`${money(waitingPayment.amount)} — ожидаем оплату`, sub:waitingPayment.title, action:() => route("finance")});
    return items;
  }

  function setActiveNav(routeName) {
    document.querySelectorAll(".nav-item").forEach(btn => btn.classList.toggle("active", btn.dataset.route === routeName));
  }

  function route(name, opts = {}) {
    routeState.route = name;
    Object.assign(routeState, opts);
    setActiveNav(["home","projects","tasks","finance","attention"].includes(name) ? name : "projects");
    window.scrollTo({top:0, behavior:"instant"});
    render();
    haptic("light");
  }

  function openProject(id) { route("project", { projectId:id, projectTab:"summary" }); }
  function openSection(id) { route("section", { sectionId:id }); }

  function render() {
    const renderers = {
      home: renderHome, projects: renderProjects, project: renderProject,
      section: renderSection, tasks: renderTasks, finance: renderFinance, attention: renderAttention
    };
    view.innerHTML = (renderers[routeState.route] || renderHome)();
    bindDynamicEvents();
    $("#fab").style.display = ["home","project","tasks"].includes(routeState.route) ? "block" : "none";
  }

  function renderHome() {
    const p = project();
    const attention = projectAttention(p).slice(0,4);
    const activeTasks = state.tasks.filter(t => !t.done).length;
    const critical = state.tasks.filter(t => !t.done && t.priority==="critical").length;
    return `
      <div class="page-head">
        <div class="eyebrow">${new Date().toLocaleDateString("ru-RU",{day:"numeric",month:"long"})}</div>
        <h1>Добрый день, ${escapeHtml(userName())}</h1>
        <div class="subtitle">${attention.length} вопроса по проектам требуют внимания.</div>
      </div>
      <div class="kpi-grid">
        <div class="kpi"><div class="kpi-value">${state.projects.length}</div><div class="kpi-label">проектов</div></div>
        <div class="kpi"><div class="kpi-value" style="color:var(--red)">${critical}</div><div class="kpi-label">критично</div></div>
        <div class="kpi"><div class="kpi-value">${activeTasks}</div><div class="kpi-label">задач</div></div>
      </div>

      <div class="section-head"><h2>Приоритетный проект</h2><button class="link-btn" data-open-project="${p.id}">Открыть</button></div>
      ${projectCard(p)}

      <div class="section-head"><h2>Требуют внимания</h2><button class="link-btn" data-route="attention">Все</button></div>
      <div class="card">
        ${attention.length ? attention.map((i,idx) => issueHTML(i, idx)).join("") : '<div class="empty">Критичных вопросов нет</div>'}
      </div>
    `;
  }

  function projectCard(p) {
    const prog = stageProgress(p);
    const attention = projectAttention(p).length;
    return `
      <article class="card clickable" data-open-project="${p.id}">
        <div class="row-between">
          <div><div class="project-title">${escapeHtml(p.title)}</div><div class="small">№ ${escapeHtml(p.code)} · ${escapeHtml(p.client)}</div></div>
          <span class="pill ${attention ? "red" : "green"}">${attention ? attention+" вопросов" : "По графику"}</span>
        </div>
        <div class="progress"><span style="width:${Math.round(prog*100)}%"></span></div>
        <div class="meta"><span>${p.currentStage==="P" ? "Стадия П" : p.currentStage}</span><span>${percent(prog)}</span></div>
      </article>
    `;
  }

  function issueHTML(i, idx) {
    return `
      <div class="issue clickable" data-attention-index="${idx}">
        <i class="dot ${i.type}"></i>
        <div class="grow"><div class="row-title">${escapeHtml(i.title)}</div><div class="row-sub">${escapeHtml(i.sub || "")}</div></div>
        <div class="chev">›</div>
      </div>`;
  }

  function renderProjects() {
    return `
      <div class="page-head"><h1>Проекты</h1><div class="subtitle">Портфель текущих объектов.</div></div>
      <input class="search" id="projectSearch" placeholder="Найти проект, шифр или заказчика" />
      <div id="projectList">${state.projects.map(projectCard).join("")}</div>
    `;
  }

  function renderProject() {
    const p = project();
    const prog = stageProgress(p);
    const noExecutor = stageSections(p).filter(s => !s.executor).length;
    const waitingIRD = p.initialData.filter(d => d.status==="waiting").length;
    const tab = routeState.projectTab;
    return `
      <button class="back" data-route="projects">‹ Проекты</button>
      <section class="hero">
        <div class="row-between">
          <div><div class="project-title">${escapeHtml(p.title)}</div><div class="small">№ ${escapeHtml(p.code)} · ${escapeHtml(p.address)}</div></div>
          <span class="pill yellow">Стадия П</span>
        </div>
        <div class="progress"><span style="width:${Math.round(prog*100)}%"></span></div>
        <div class="meta"><span>${escapeHtml(p.client)}</span><span>${percent(prog)}</span></div>
      </section>

      <div class="tabs">
        ${["summary","sections","ird","money"].map(t => `<button class="tab ${tab===t?"active":""}" data-project-tab="${t}">${({summary:"Сводка",sections:"Разделы",ird:"ИРД",money:"Финансы"}[t])}</button>`).join("")}
      </div>
      ${tab==="summary" ? projectSummary(p,noExecutor,waitingIRD) : ""}
      ${tab==="sections" ? projectSections(p) : ""}
      ${tab==="ird" ? projectIRD(p) : ""}
      ${tab==="money" ? projectMoney(p) : ""}
    `;
  }

  function projectSummary(p,noExecutor,waitingIRD) {
    const attention = projectAttention(p).slice(0,5);
    return `
      <div class="kpi-grid">
        <div class="kpi"><div class="kpi-value">${stageSections(p).length}</div><div class="kpi-label">разделов П</div></div>
        <div class="kpi"><div class="kpi-value" style="color:var(--red)">${noExecutor}</div><div class="kpi-label">без исполнителя</div></div>
        <div class="kpi"><div class="kpi-value">${waitingIRD}</div><div class="kpi-label">ИРД ожидаем</div></div>
      </div>

      <div class="section-head"><h2>Этапы</h2></div>
      <div class="card">
        ${p.stages.map(s => {
          const docs = documentsFor(p, "stage", s.id).length;
          return `
          <div class="list-row clickable" data-stage-docs="${s.id}">
            <div class="section-code">${s.status==="done" ? "✓" : escapeHtml(s.id)}</div>
            <div class="grow"><div class="row-title">${escapeHtml(s.title)}</div><div class="row-sub">${escapeHtml(s.note)}${docs ? ` · 📎 ${docs}` : ""}</div></div>
            <div style="text-align:right"><div class="row-title">${money(s.value)}</div><div class="row-sub">${s.status==="done"?"Завершено":s.status==="work"?"В работе":"Не начато"}</div></div>
            <div class="chev">›</div>
          </div>`;
        }).join("")}
      </div>

      <div class="section-head"><h2>Быстрые действия</h2></div>
      <div class="action-grid">
        <button class="action" data-new-task><div class="action-icon">＋</div><div class="action-title">Новая задача</div><div class="action-sub">Срок, исполнитель, приоритет</div></button>
        <button class="action" data-route="attention"><div class="action-icon">!</div><div class="action-title">Проблемы</div><div class="action-sub">${attention.length} требуют внимания</div></button>
        <button class="action" data-project-tab-direct="ird"><div class="action-icon">⇧</div><div class="action-title">Исходные данные</div><div class="action-sub">Отметить получение ИРД</div></button>
        <button class="action" data-project-tab-direct="money"><div class="action-icon">₽</div><div class="action-title">Финансы</div><div class="action-sub">${money(p.contractValue)}</div></button>
      </div>
    `;
  }

  function projectSections(p) {
    const stages = ["P","RD"];
    const stage = routeState.stage || "P";
    const arr = stageSections(p, stage);
    return `
      <div class="filters">
        ${stages.map(s => `<button class="filter ${stage===s?"active":""}" data-stage="${s}">${s==="P"?"Стадия П":"Стадия РД"} · ${stageSections(p,s).length}</button>`).join("")}
      </div>
      <div class="card">
        ${arr.map(s => `
          <div class="list-row clickable" data-open-section="${s.id}">
            <div class="section-code">${escapeHtml(s.code)}</div>
            <div class="grow"><div class="row-title">${escapeHtml(s.name)}</div><div class="row-sub">${escapeHtml(s.executor || "Исполнитель не назначен")}</div></div>
            <div>${statusPill(s.status)}</div>
          </div>`).join("")}
      </div>
    `;
  }

  function projectIRD(p) {
    const waiting = p.initialData.filter(d => d.status==="waiting").length;
    return `
      <div class="row-between" style="margin:4px 2px 12px">
        <div><div class="row-title">Исходные данные</div><div class="row-sub">Ожидаем: ${waiting}</div></div>
        <button class="link-btn" data-reset-demo>Сбросить демо</button>
      </div>
      <div class="card">
        ${p.initialData.map(d => `
          <div class="list-row clickable" data-ird="${d.id}">
            <i class="dot ${d.status==="received"?"green":d.status==="waiting"?"yellow":""}"></i>
            <div class="grow"><div class="row-title">${escapeHtml(d.title)}</div><div class="row-sub">${escapeHtml(d.provider || "")}${d.blocks?.length ? " · блокирует "+d.blocks.map(id=>section(p,id)?.code).filter(Boolean).join(", ") : ""}${documentsFor(p,"ird",d.id).length ? " · 📎 "+documentsFor(p,"ird",d.id).length : ""}</div></div>
            ${dataStatusPill(d.status)}
          </div>`).join("")}
      </div>
    `;
  }

  function projectMoney(p) {
    const paid = p.payments.filter(x => x.status==="paid").reduce((a,b)=>a+b.amount,0);
    const waiting = p.payments.filter(x => x.status==="waiting").reduce((a,b)=>a+b.amount,0);
    const stageSum = stagesTotal(p);
    const diff = p.contractValue - stageSum;
    return `
      <div class="card">
        <div class="row-between">
          <div><div class="small">Текущая стоимость договора</div><div class="money-value">${money(p.contractValue)}</div></div>
          <button class="mini-btn" data-edit-contract>Изменить</button>
        </div>
        <div class="progress"><span style="width:${Math.min(100,Math.round(paid/p.contractValue*100))}%"></span></div>
        <div class="meta"><span>Отмечено оплачено: ${money(paid)}</span><span>${Math.round(paid/p.contractValue*100)}%</span></div>
        <div class="sum-check ${Math.abs(diff)>1 ? "warn":""}">
          Сумма этапов: ${money(stageSum)}${Math.abs(diff)>1 ? ` · расхождение с договором: ${money(diff)}` : " · совпадает с договором"}
        </div>
      </div>
      <div class="money-grid">
        <div class="kpi"><div class="kpi-value" style="font-size:19px">${money(waiting)}</div><div class="kpi-label">ожидаем оплату</div></div>
        <div class="kpi"><div class="kpi-value" style="font-size:19px">${p.payments.filter(x=>x.status==="future").length}</div><div class="kpi-label">будущих платежа</div></div>
      </div>

      <div class="section-head"><h2>Стоимость этапов</h2></div>
      <div class="card">
        ${p.stages.map(s=>`
          <div class="list-row clickable" data-stage-docs="${s.id}">
            <div class="grow"><div class="row-title">${escapeHtml(s.title)}</div><div class="row-sub">Документов: ${documentsFor(p,"stage",s.id).length}</div></div>
            <div style="text-align:right"><div class="row-title">${money(s.value)}</div><div class="row-sub">Открыть</div></div>
          </div>`).join("")}
      </div>

      <div class="section-head"><h2>Платежи</h2></div>
      <div class="card">
        ${p.payments.map(x=>`
          <div class="list-row clickable" data-payment="${x.id}">
            <i class="dot ${x.status==="paid"?"green":x.status==="waiting"?"yellow":"blue"}"></i>
            <div class="grow"><div class="row-title">${escapeHtml(x.title)}</div><div class="row-sub">${escapeHtml(x.note)}</div></div>
            <div style="text-align:right"><div class="row-title">${money(x.amount)}</div><div class="row-sub">${x.status==="paid"?"Оплачено":x.status==="waiting"?"Ожидаем":"План"}</div></div>
          </div>`).join("")}
      </div>

      <div class="section-head"><h2>История изменения цены</h2></div>
      <div class="card price-history">
        ${(p.priceChanges || []).length ? p.priceChanges.slice().reverse().map(c=>`
          <div class="price-change">
            <div class="row-between"><div class="row-title">${escapeHtml(priceTargetTitle(p,c))}</div><div class="row-sub">${escapeHtml(c.date)}</div></div>
            <div style="margin-top:6px"><b>${money(c.oldValue)}</b><span class="price-arrow">→</span><b>${money(c.newValue)}</b></div>
            <div class="row-sub">${escapeHtml(c.reason)}</div>
            ${c.documentId ? `<button class="mini-btn" style="margin-top:8px" data-open-doc="${c.documentId}">Документ-основание</button>` : ""}
          </div>`).join("") : '<div class="empty">Изменений стоимости пока нет</div>'}
      </div>
    `;
  }

  function renderSection() {
    const p = project();
    const s = section(p, routeState.sectionId);
    if (!s) return `<button class="back" data-open-project="${p.id}">‹ Проект</button><div class="empty">Раздел не найден</div>`;
    const stage = stageById(p, s.stage);
    const sum = sectionsTotal(p, s.stage);
    const stageDiff = Number(stage?.value || 0) - sum;
    return `
      <button class="back" data-open-project="${p.id}">‹ ${escapeHtml(p.title)}</button>
      <div class="page-head"><div class="eyebrow">${s.stage==="P"?"Стадия П":"Стадия РД"}</div><h1>${escapeHtml(s.code)}</h1><div class="subtitle">${escapeHtml(s.name)}</div></div>
      <div class="card">
        <div class="row-between">
          <div><div class="row-title">Статус раздела</div><div class="row-sub">Изменения сохраняются на устройстве</div></div>
          <select class="status-select" id="sectionStatus">
            ${["todo","work","review","waiting","issued","approved","paused"].map(v=>`<option value="${v}" ${s.status===v?"selected":""}>${statusLabel(v)}</option>`).join("")}
          </select>
        </div>
      </div>
      <div class="money-grid">
        <div class="kpi"><div class="kpi-value" style="font-size:17px">${escapeHtml(s.executor || "—")}</div><div class="kpi-label">исполнитель</div></div>
        <div class="kpi"><div class="kpi-value" style="font-size:17px">${money(sectionValue(s))}</div><div class="kpi-label">стоимость раздела</div></div>
      </div>
      <div class="section-head"><h2>Финансирование</h2><button class="link-btn" data-edit-section-cost>Изменить</button></div>
      <div class="card">
        <div class="list-row"><div class="grow"><div class="row-title">Аванс</div></div><div class="row-title">${money(s.advance)}</div></div>
        <div class="list-row"><div class="grow"><div class="row-title">Закрытие</div></div><div class="row-title">${money(s.closing)}</div></div>
        <div class="sum-check ${Math.abs(stageDiff)>1 ? "warn":""}">Сумма разделов этапа: ${money(sum)} · стоимость этапа: ${money(stage?.value || 0)}</div>
      </div>

      <div class="section-head"><h2>Документы раздела</h2><button class="link-btn" data-show-section-docs>Добавить</button></div>
      <div class="card doc-list">${documentRowsHTML(p,"section",s.id)}</div>

      <button class="primary" data-edit-executor>Изменить исполнителя</button>
      <button class="secondary" data-new-task data-section-id="${s.id}">Добавить задачу по разделу</button>
    `;
  }

  function renderTasks() {
    const p = project();
    const tasks = state.tasks;
    return `
      <div class="page-head"><h1>Задачи</h1><div class="subtitle">Текущие поручения по проектам.</div></div>
      <div class="filters"><button class="filter active">Все ${tasks.filter(t=>!t.done).length}</button><button class="filter">Критичные ${tasks.filter(t=>!t.done&&t.priority==="critical").length}</button></div>
      <div class="card">
        ${tasks.length ? tasks.map(t => `
          <div class="task-row ${t.done?"task-done":""}">
            <button class="check ${t.done?"done":""}" data-toggle-task="${t.id}">${t.done?"✓":""}</button>
            <div class="grow"><div class="row-title">${escapeHtml(t.title)}</div><div class="row-sub">${escapeHtml(p.title)} · ${escapeHtml(t.owner)} · ${escapeHtml(t.due)}</div></div>
            ${t.priority==="critical" ? '<span class="pill red">Важно</span>' : ""}
          </div>`).join("") : '<div class="empty">Задач пока нет</div>'}
      </div>
    `;
  }

  function renderFinance() {
    const p = project();
    return `
      <div class="page-head"><h1>Финансы</h1><div class="subtitle">Доходная часть и платежи по проектам.</div></div>
      ${projectMoney(p)}
    `;
  }

  function renderAttention() {
    const p = project();
    const items = projectAttention(p);
    return `
      <div class="page-head"><div class="eyebrow">${escapeHtml(p.title)}</div><h1>Требуют внимания</h1><div class="subtitle">Только отклонения, по которым нужно принять решение.</div></div>
      <div class="card">
        ${items.length ? items.map((i,idx)=>issueHTML(i,idx)).join("") : '<div class="empty">Все спокойно — критичных вопросов нет</div>'}
      </div>
      <button class="primary" id="reviewIssues">Разобрать по очереди</button>
    `;
  }

  function openSheet(html) {
    sheet.innerHTML = `<div class="handle"></div>${html}`;
    sheetBackdrop.hidden = false;
  }
  function closeSheet() { sheetBackdrop.hidden = true; sheet.innerHTML = ""; }

  function taskForm(sectionId = "") {
    const p = project();
    const s = sectionId ? section(p, sectionId) : null;
    openSheet(`
      <h2>Новая задача</h2>
      <label class="form-label">Проект</label>
      <input class="form-input" value="${escapeHtml(p.title)}" disabled />
      <label class="form-label">Что нужно сделать</label>
      <textarea class="form-textarea" id="taskTitle" placeholder="Например: проверить план парковки">${s ? `Проверить раздел ${s.code}` : ""}</textarea>
      <label class="form-label">Ответственный</label>
      <input class="form-input" id="taskOwner" value="${s?.executor ? escapeHtml(s.executor.split(",")[0]) : "Роман"}" />
      <label class="form-label">Срок</label>
      <input class="form-input" id="taskDue" type="date" value="2026-09-25" />
      <label class="form-label">Приоритет</label>
      <select class="form-select" id="taskPriority"><option value="normal">Обычный</option><option value="critical">Критично</option><option value="low">Низкий</option></select>
      <button class="primary" id="createTask">Создать задачу</button>
      <button class="secondary" id="cancelSheet">Отмена</button>
    `);
    $("#createTask").onclick = () => {
      const title = $("#taskTitle").value.trim();
      if (!title) { toast("Введите задачу"); return; }
      state.tasks.unshift({
        id:"task-"+Date.now(), projectId:p.id, title,
        detail:s ? s.code : "", owner:$("#taskOwner").value.trim() || "Роман",
        due:$("#taskDue").value, priority:$("#taskPriority").value, done:false
      });
      saveState(); closeSheet(); toast("Задача создана"); render();
      haptic("medium");
    };
    $("#cancelSheet").onclick = closeSheet;
  }

  function openInitialData(id) {
    const p = project();
    const item = p.initialData.find(x=>x.id===id);
    if (!item) return;
    showTargetDocuments(
      item.title,
      "ird",
      item.id,
      `${item.provider || "Поставщик не указан"}${item.blocks?.length ? " · блокирует "+item.blocks.map(sid=>section(p,sid)?.code).filter(Boolean).join(", ") : ""}`,
      () => {
        const current = p.initialData.find(x=>x.id===id);
        return `
          <button class="secondary" id="toggleIRDStatus">${current.status==="received" ? "Вернуть в ожидание" : "Отметить полученным"}</button>
        `;
      },
      () => {
        const btn = $("#toggleIRDStatus");
        if (btn) btn.onclick = () => {
          item.status = item.status==="received" ? "waiting" : "received";
          saveState(); closeSheet(); toast(item.status==="received" ? "Отмечено как получено" : "Возвращено в ожидание"); render();
        };
      }
    );
  }


  function fileInputsHTML() {
    return `
      <input class="hidden-input" id="regularFileInput" type="file" accept="*/*" />
      <input class="hidden-input" id="cameraFileInput" type="file" accept="image/*" capture="environment" />
    `;
  }

  function showTargetDocuments(title, targetType, targetId, subtitle = "", extraHTML = null, afterExtraBind = null) {
    const p = project();
    const renderSheet = () => {
      openSheet(`
        <h2>${escapeHtml(title)}</h2>
        ${subtitle ? `<div class="subtitle">${escapeHtml(subtitle)}</div>` : ""}
        <div class="card doc-list" style="margin-top:14px">${documentRowsHTML(p,targetType,targetId)}</div>
        <div class="upload-grid">
          <button class="upload-btn" id="chooseFile">＋ Файл / PDF</button>
          <button class="upload-btn" id="takePhoto">▧ Фото / скан</button>
        </div>
        ${fileInputsHTML()}
        <div class="storage-note">Тестовая версия: файлы хранятся только на этом устройстве. Для общей папки команды позже подключим серверное хранилище.</div>
        ${extraHTML ? extraHTML() : ""}
        <button class="secondary" id="cancelSheet">Закрыть</button>
      `);
      bindDocumentButtons(renderSheet);
      $("#chooseFile").onclick = () => $("#regularFileInput").click();
      $("#takePhoto").onclick = () => $("#cameraFileInput").click();
      $("#regularFileInput").onchange = async e => {
        try { await storeAttachment(e.target.files?.[0], targetType, targetId); toast("Документ добавлен"); renderSheet(); render(); }
        catch(err) { toast(err.message || "Не удалось сохранить файл"); }
      };
      $("#cameraFileInput").onchange = async e => {
        try { await storeAttachment(e.target.files?.[0], targetType, targetId, "Фото/скан"); toast("Фото добавлено"); renderSheet(); render(); }
        catch(err) { toast(err.message || "Не удалось сохранить фото"); }
      };
      $("#cancelSheet").onclick = closeSheet;
      if (afterExtraBind) afterExtraBind();
    };
    renderSheet();
  }

  function bindDocumentButtons(refresh = null) {
    document.querySelectorAll("[data-open-doc]").forEach(el => el.onclick = () => openDocument(el.dataset.openDoc));
  }

  async function openDocument(id) {
    const p = project();
    const meta = (p.documents || []).find(d => d.id === id);
    if (!meta) return toast("Документ не найден");
    const blob = await getBlob(id);
    if (!blob) return toast("Файл отсутствует на этом устройстве");
    const url = URL.createObjectURL(blob);
    const isImage = (meta.type || "").startsWith("image/");
    const isPDF = (meta.type || "").includes("pdf") || (meta.name || "").toLowerCase().endsWith(".pdf");
    openSheet(`
      <h2>${escapeHtml(meta.name)}</h2>
      <div class="subtitle">${formatBytes(meta.size)} · ${escapeHtml(meta.createdAt || "")}</div>
      ${isImage ? `<img class="doc-preview" src="${url}" alt="${escapeHtml(meta.name)}" />` :
        isPDF ? `<iframe class="pdf-frame" src="${url}"></iframe>` :
        `<div class="file-placeholder">Предпросмотр этого формата внутри Mini App может быть недоступен.<br>Нажмите «Открыть файл».</div>`}
      <button class="primary" id="openNativeFile">Открыть файл</button>
      <button class="danger" id="deleteDocument">Удалить документ</button>
      <button class="secondary" id="cancelSheet">Закрыть</button>
    `);
    $("#openNativeFile").onclick = () => {
      const a = document.createElement("a");
      a.href = url; a.target = "_blank"; a.rel = "noopener"; a.download = meta.name || "document";
      document.body.appendChild(a); a.click(); a.remove();
    };
    $("#deleteDocument").onclick = async () => {
      p.documents = p.documents.filter(d => d.id !== id);
      p.priceChanges.forEach(c => { if (c.documentId === id) c.documentId = null; });
      try { await deleteBlob(id); } catch (_) {}
      saveState(); closeSheet(); toast("Документ удален"); render();
    };
    $("#cancelSheet").onclick = () => { closeSheet(); setTimeout(()=>URL.revokeObjectURL(url),500); };
  }

  function stageDocuments(stageId) {
    const p = project();
    const st = stageById(p, stageId);
    if (!st) return;
    showTargetDocuments(
      st.title,
      "stage",
      st.id,
      `${money(st.value)} · ${st.note}`,
      () => `
        <button class="primary" id="editStageCost">Изменить стоимость этапа</button>
      `,
      () => {
        const b = $("#editStageCost");
        if (b) b.onclick = () => editPrice("stage", st.id);
      }
    );
  }

  function editPrice(level, targetId = null) {
    const p = project();
    let oldValue = 0, title = "", sectionObj = null, stageObj = null;
    if (level === "contract") { oldValue = p.contractValue; title = "Стоимость договора"; }
    if (level === "stage") { stageObj = stageById(p,targetId); oldValue = Number(stageObj?.value || 0); title = stageObj?.title || "Этап"; }
    if (level === "section") { sectionObj = section(p,targetId); oldValue = sectionValue(sectionObj); title = `${sectionObj?.code || ""} — стоимость раздела`; }

    openSheet(`
      <h2>${escapeHtml(title)}</h2>
      <div class="subtitle">Текущая стоимость: ${money(oldValue)}</div>
      ${level==="section" ? `
        <label class="form-label">Новый аванс, ₽</label>
        <input class="form-input" id="priceAdvance" inputmode="numeric" value="${Number(sectionObj.advance||0)}" />
        <label class="form-label">Новое закрытие, ₽</label>
        <input class="form-input" id="priceClosing" inputmode="numeric" value="${Number(sectionObj.closing||0)}" />
      ` : `
        <label class="form-label">Новая стоимость, ₽</label>
        <input class="form-input" id="newPrice" inputmode="numeric" value="${oldValue}" />
      `}
      <label class="form-label">Причина изменения</label>
      <textarea class="form-textarea" id="priceReason" placeholder="Например: Дополнительное соглашение №2 от 21.09.2026"></textarea>
      <label class="form-label">Дата изменения</label>
      <input class="form-input" id="priceDate" type="date" value="${new Date().toISOString().slice(0,10)}" />
      <label class="form-label">Документ-основание — обязательно</label>
      <button class="upload-btn" style="width:100%" id="chooseBasis">＋ Прикрепить доп. соглашение / письмо / иной документ</button>
      <input class="hidden-input" id="basisFile" type="file" accept="*/*" />
      <div id="basisPicked"></div>
      <button class="primary" id="savePriceChange">Сохранить изменение</button>
      <button class="secondary" id="cancelSheet">Отмена</button>
    `);
    let selectedFile = null;
    $("#chooseBasis").onclick = () => $("#basisFile").click();
    $("#basisFile").onchange = e => {
      selectedFile = e.target.files?.[0] || null;
      $("#basisPicked").innerHTML = selectedFile ? `<div class="file-picked">📎 ${escapeHtml(selectedFile.name)} · ${formatBytes(selectedFile.size)}</div>` : "";
    };
    $("#savePriceChange").onclick = async () => {
      const reason = $("#priceReason").value.trim();
      if (!reason) return toast("Укажите причину изменения");
      if (!selectedFile) return toast("Прикрепите документ-основание");
      let newValue;
      let newAdvance = null, newClosing = null;
      if (level === "section") {
        newAdvance = numberValue($("#priceAdvance").value);
        newClosing = numberValue($("#priceClosing").value);
        newValue = newAdvance + newClosing;
      } else {
        newValue = numberValue($("#newPrice").value);
      }
      if (newValue <= 0) return toast("Проверьте новую стоимость");
      const changeId = `price-${Date.now()}`;
      try {
        const doc = await storeAttachment(selectedFile, "priceChange", changeId, "Основание изменения цены");
        const change = {
          id:changeId, level, targetId, oldValue, newValue,
          reason, date:$("#priceDate").value || new Date().toISOString().slice(0,10),
          documentId:doc.id
        };
        if (level === "contract") p.contractValue = newValue;
        if (level === "stage") stageObj.value = newValue;
        if (level === "section") { sectionObj.advance = newAdvance; sectionObj.closing = newClosing; }
        p.priceChanges.push(change);
        saveState(); closeSheet(); toast("Новая стоимость сохранена"); render(); haptic("medium");
      } catch(err) {
        toast(err.message || "Не удалось сохранить изменение");
      }
    };
    $("#cancelSheet").onclick = closeSheet;
  }
  function editExecutor() {
    const p = project(), s = section(p, routeState.sectionId);
    openSheet(`
      <h2>Исполнитель · ${escapeHtml(s.code)}</h2>
      <label class="form-label">ФИО / компания</label>
      <input class="form-input" id="executorValue" value="${escapeHtml(s.executor)}" placeholder="Введите исполнителя" />
      <button class="primary" id="saveExecutor">Сохранить</button>
      <button class="secondary" id="cancelSheet">Отмена</button>
    `);
    $("#saveExecutor").onclick = () => {
      s.executor = $("#executorValue").value.trim();
      saveState(); closeSheet(); toast("Исполнитель обновлен"); render();
    };
    $("#cancelSheet").onclick = closeSheet;
  }

  function paymentSheet(id) {
    const p = project(), pay = p.payments.find(x=>x.id===id);
    openSheet(`
      <h2>${escapeHtml(pay.title)}</h2>
      <div class="money-value">${money(pay.amount)}</div>
      <div class="subtitle">${escapeHtml(pay.note)}</div>
      <button class="primary" id="togglePayment">${pay.status==="paid"?"Отметить неоплаченным":"Отметить оплату"}</button>
      <button class="secondary" id="cancelSheet">Закрыть</button>
    `);
    $("#togglePayment").onclick = () => {
      pay.status = pay.status==="paid" ? "waiting" : "paid";
      saveState(); closeSheet(); toast(pay.status==="paid"?"Оплата отмечена":"Статус изменен"); render();
    };
    $("#cancelSheet").onclick = closeSheet;
  }

  function bindDynamicEvents() {
    document.querySelectorAll("[data-route]").forEach(el => el.onclick = () => route(el.dataset.route));
    document.querySelectorAll("[data-open-project]").forEach(el => el.onclick = (e) => { e.stopPropagation(); openProject(el.dataset.openProject); });
    document.querySelectorAll("[data-open-section]").forEach(el => el.onclick = () => openSection(el.dataset.openSection));
    document.querySelectorAll("[data-project-tab]").forEach(el => el.onclick = () => { routeState.projectTab = el.dataset.projectTab; render(); });
    document.querySelectorAll("[data-project-tab-direct]").forEach(el => el.onclick = () => { routeState.projectTab = el.dataset.projectTabDirect; render(); });
    document.querySelectorAll("[data-stage]").forEach(el => el.onclick = () => { routeState.stage = el.dataset.stage; render(); });
    document.querySelectorAll("[data-new-task]").forEach(el => el.onclick = () => taskForm(el.dataset.sectionId || ""));
    document.querySelectorAll("[data-ird]").forEach(el => el.onclick = () => openInitialData(el.dataset.ird));
    document.querySelectorAll("[data-payment]").forEach(el => el.onclick = () => paymentSheet(el.dataset.payment));
    document.querySelectorAll("[data-stage-docs]").forEach(el => el.onclick = () => stageDocuments(el.dataset.stageDocs));
    bindDocumentButtons();
    const editContract = $("[data-edit-contract]"); if (editContract) editContract.onclick = () => editPrice("contract");
    const editSectionCost = $("[data-edit-section-cost]"); if (editSectionCost) editSectionCost.onclick = () => editPrice("section", routeState.sectionId);
    const sectionDocs = $("[data-show-section-docs]"); if (sectionDocs) sectionDocs.onclick = () => {
      const p = project(), s = section(p, routeState.sectionId);
      showTargetDocuments(`${s.code} — документы`, "section", s.id, s.name);
    };

    document.querySelectorAll("[data-toggle-task]").forEach(el => el.onclick = () => {
      const t = state.tasks.find(x=>x.id===el.dataset.toggleTask); t.done=!t.done; saveState(); render(); haptic("light");
    });
    document.querySelectorAll("[data-reset-demo]").forEach(el => el.onclick = resetState);

    const status = $("#sectionStatus");
    if (status) status.onchange = () => {
      const p = project(), s = section(p, routeState.sectionId); s.status = status.value; saveState(); toast("Статус сохранен"); render();
    };
    const edit = $("[data-edit-executor]"); if (edit) edit.onclick = editExecutor;

    const search = $("#projectSearch");
    if (search) search.oninput = () => {
      const q = search.value.toLowerCase().trim();
      const list = $("#projectList");
      list.innerHTML = state.projects.filter(p => [p.title,p.code,p.client,p.address].join(" ").toLowerCase().includes(q)).map(projectCard).join("") || '<div class="empty">Ничего не найдено</div>';
      list.querySelectorAll("[data-open-project]").forEach(el => el.onclick = () => openProject(el.dataset.openProject));
    };

    document.querySelectorAll("[data-attention-index]").forEach(el => el.onclick = () => {
      const items = projectAttention(project());
      const item = items[Number(el.dataset.attentionIndex)];
      if (item?.action) item.action();
    });

    const review = $("#reviewIssues");
    if (review) review.onclick = () => {
      const items = projectAttention(project());
      if (!items.length) return toast("Нет вопросов для разбора");
      openSheet(`
        <h2>Разбор проблем</h2>
        <div class="subtitle">Первый вопрос из ${items.length}</div>
        <div class="card" style="margin-top:14px"><div class="row-title">${escapeHtml(items[0].title)}</div><div class="row-sub">${escapeHtml(items[0].sub)}</div></div>
        <button class="primary" id="openIssue">Открыть вопрос</button>
        <button class="secondary" id="cancelSheet">Закрыть</button>
      `);
      $("#openIssue").onclick = () => { closeSheet(); items[0].action?.(); };
      $("#cancelSheet").onclick = closeSheet;
    };
  }

  document.querySelectorAll(".nav-item").forEach(btn => btn.onclick = () => route(btn.dataset.route));
  $("#fab").onclick = () => taskForm("");
  $("#themeButton").onclick = () => {
    document.documentElement.classList.toggle("manual-dark");
    toast("Тема Telegram применяется автоматически");
  };
  sheetBackdrop.addEventListener("click", e => { if (e.target === sheetBackdrop) closeSheet(); });

  // Telegram BackButton for inner pages.
  if (tg?.BackButton) {
    tg.BackButton.onClick(() => {
      if (routeState.route === "section") openProject(routeState.projectId);
      else if (routeState.route === "project") route("projects");
      else route("home");
    });
  }
  const originalRoute = route;
  const updateBackButton = () => {
    if (!tg?.BackButton) return;
    if (["project","section"].includes(routeState.route)) tg.BackButton.show(); else tg.BackButton.hide();
  };
  const oldRender = render;
  render = function() { oldRender(); updateBackButton(); };

  render();
})();


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
      if (!Array.isArray(p.sections)) p.sections = [];
      if (!Array.isArray(p.initialData)) p.initialData = [];
      if (!Array.isArray(p.stages)) p.stages = [];
      if (!Array.isArray(p.payments)) p.payments = [];
    });
    if (!Array.isArray(state.tasks)) state.tasks = [];
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
  function projectById(id) { return state.projects.find(p => p.id === id); }
  function uid(prefix) { return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2,7)}`; }
  function moveItem(arr, index, delta) {
    const to = index + delta;
    if (index < 0 || to < 0 || to >= arr.length) return false;
    [arr[index], arr[to]] = [arr[to], arr[index]];
    return true;
  }

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
      <button class="primary project-create" data-new-project>＋ Создать новый проект</button>
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
    const availableStages = p.stages.filter(s => ["P","RD"].includes(s.id)).map(s=>s.id);
    const stages = availableStages.length ? availableStages : ["P","RD"];
    if (!stages.includes(routeState.stage)) routeState.stage = stages[0];
    const stage = routeState.stage || stages[0];
    const arr = stageSections(p, stage);
    return `
      <div class="filters">
        ${stages.map(s => `<button class="filter ${stage===s?"active":""}" data-stage="${s}">${s==="P"?"Стадия П":s==="RD"?"Стадия РД":escapeHtml(s)} · ${stageSections(p,s).length}</button>`).join("")}
      </div>
      <div class="manage-toolbar">
        <button class="secondary" data-add-section>＋ Добавить раздел</button>
      </div>
      <div class="structure-note">Порядок разделов можно менять стрелками. Удаление доступно в режиме редактирования каждой строки.</div>
      <div class="card">
        ${arr.length ? arr.map((s,idx) => `
          <div class="list-row">
            <div class="click-body" data-open-section="${s.id}">
              <div class="section-code">${escapeHtml(s.code)}</div>
              <div class="grow"><div class="row-title">${escapeHtml(s.name)}</div><div class="row-sub">${escapeHtml(s.executor || "Исполнитель не назначен")}</div></div>
              <div>${statusPill(s.status)}</div>
            </div>
            <div class="order-controls">
              <button class="order-btn" data-move-section="${s.id}" data-delta="-1" ${idx===0?"disabled":""}>↑</button>
              <button class="order-btn" data-move-section="${s.id}" data-delta="1" ${idx===arr.length-1?"disabled":""}>↓</button>
              <button class="order-btn danger-lite" data-delete-section="${s.id}">×</button>
            </div>
          </div>`).join("") : '<div class="empty">В этом этапе пока нет разделов</div>'}
      </div>
    `;
  }

  function projectIRD(p) {
    const waiting = p.initialData.filter(d => d.status==="waiting").length;
    return `
      <div class="row-between" style="margin:4px 2px 12px">
        <div><div class="row-title">Исходные данные</div><div class="row-sub">Ожидаем: ${waiting} · всего: ${p.initialData.length}</div></div>
        <button class="link-btn" data-reset-demo>Сбросить демо</button>
      </div>
      <div class="manage-toolbar">
        <button class="secondary" data-add-ird>＋ Добавить ИРД</button>
      </div>
      <div class="structure-note">Стрелки меняют последовательность ИРД. Ненужный пункт можно удалить или оставить со статусом «Не требуется».</div>
      <div class="card">
        ${p.initialData.length ? p.initialData.map((d,idx) => `
          <div class="list-row">
            <div class="click-body" data-ird="${d.id}">
              <i class="dot ${d.status==="received"?"green":d.status==="waiting"?"yellow":""}"></i>
              <div class="grow"><div class="row-title">${escapeHtml(d.title)}</div><div class="row-sub">${escapeHtml(d.provider || "")}${d.blocks?.length ? " · блокирует "+d.blocks.map(id=>section(p,id)?.code).filter(Boolean).join(", ") : ""}${documentsFor(p,"ird",d.id).length ? " · 📎 "+documentsFor(p,"ird",d.id).length : ""}</div></div>
              ${dataStatusPill(d.status)}
            </div>
            <div class="order-controls">
              <button class="order-btn" data-move-ird="${d.id}" data-delta="-1" ${idx===0?"disabled":""}>↑</button>
              <button class="order-btn" data-move-ird="${d.id}" data-delta="1" ${idx===p.initialData.length-1?"disabled":""}>↓</button>
              <button class="order-btn danger-lite" data-delete-ird="${d.id}">×</button>
            </div>
          </div>`).join("") : '<div class="empty">Исходные данные пока не добавлены</div>'}
      </div>
    `;
  }

  function projectMoney(p) {
    const paid = p.payments.filter(x => x.status==="paid").reduce((a,b)=>a+b.amount,0);
    const waiting = p.payments.filter(x => x.status==="waiting").reduce((a,b)=>a+b.amount,0);
    const stageSum = stagesTotal(p);
    const diff = p.contractValue - stageSum;
    const paidRatio = p.contractValue > 0 ? Math.min(100, Math.round(paid/p.contractValue*100)) : 0;
    return `
      <div class="card">
        <div class="row-between">
          <div><div class="small">Текущая стоимость договора</div><div class="money-value">${money(p.contractValue)}</div></div>
          <button class="mini-btn" data-edit-contract>Изменить</button>
        </div>
        <div class="progress"><span style="width:${paidRatio}%"></span></div>
        <div class="meta"><span>Отмечено оплачено: ${money(paid)}</span><span>${paidRatio}%</span></div>
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

      <button class="primary" data-edit-section-details>Редактировать раздел</button>
      <button class="secondary" data-edit-executor>Изменить исполнителя</button>
      <button class="secondary" data-new-task data-section-id="${s.id}">Добавить задачу по разделу</button>
    `;
  }

  function renderTasks() {
    const tasks = state.tasks;
    return `
      <div class="page-head"><h1>Задачи</h1><div class="subtitle">Нажмите на задачу, чтобы изменить срок, исполнителя или содержание.</div></div>
      <div class="filters"><button class="filter active">Все ${tasks.filter(t=>!t.done).length}</button><button class="filter">Критичные ${tasks.filter(t=>!t.done&&t.priority==="critical").length}</button></div>
      <div class="card">
        ${tasks.length ? tasks.map(t => {
          const tp = projectById(t.projectId);
          return `
          <div class="task-row ${t.done?"task-done":""}">
            <button class="check ${t.done?"done":""}" data-toggle-task="${t.id}">${t.done?"✓":""}</button>
            <div class="task-main" data-edit-task="${t.id}">
              <div class="row-title">${escapeHtml(t.title)}</div>
              <div class="row-sub">${escapeHtml(t.owner)} · ${escapeHtml(t.due || "без срока")}</div>
              <span class="project-badge">${escapeHtml(tp?.title || "Проект удалён")}${t.detail ? " · "+escapeHtml(t.detail) : ""}</span>
            </div>
            ${t.priority==="critical" ? '<span class="pill red">Важно</span>' : ""}
            <div class="chev" data-edit-task="${t.id}">›</div>
          </div>`;
        }).join("") : '<div class="empty">Задач пока нет</div>'}
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
    const todayPlus = new Date(Date.now()+4*86400000).toISOString().slice(0,10);
    openSheet(`
      <h2>Новая задача</h2>
      <label class="form-label">Проект</label>
      <select class="form-select" id="taskProject">
        ${state.projects.map(pr=>`<option value="${pr.id}" ${pr.id===p.id?"selected":""}>${escapeHtml(pr.title)}</option>`).join("")}
      </select>
      <label class="form-label">Что нужно сделать</label>
      <textarea class="form-textarea" id="taskTitle" placeholder="Например: проверить план парковки">${s ? `Проверить раздел ${s.code}` : ""}</textarea>
      <label class="form-label">Ответственный</label>
      <input class="form-input" id="taskOwner" value="${s?.executor ? escapeHtml(s.executor.split(",")[0]) : "Роман"}" />
      <label class="form-label">Срок</label>
      <input class="form-input" id="taskDue" type="date" value="${todayPlus}" />
      <label class="form-label">Приоритет</label>
      <select class="form-select" id="taskPriority"><option value="normal">Обычный</option><option value="critical">Критично</option><option value="low">Низкий</option></select>
      <button class="primary" id="createTask">Создать задачу</button>
      <button class="secondary" id="cancelSheet">Отмена</button>
    `);
    $("#createTask").onclick = () => {
      const title = $("#taskTitle").value.trim();
      if (!title) { toast("Введите задачу"); return; }
      state.tasks.unshift({
        id:uid("task"), projectId:$("#taskProject").value, title,
        detail:s ? s.code : "", owner:$("#taskOwner").value.trim() || "Роман",
        due:$("#taskDue").value, priority:$("#taskPriority").value, done:false
      });
      saveState(); closeSheet(); toast("Задача создана"); render();
      haptic("medium");
    };
    $("#cancelSheet").onclick = closeSheet;
  }

  function editTaskForm(taskId) {
    const t = state.tasks.find(x=>x.id===taskId);
    if (!t) return toast("Задача не найдена");
    openSheet(`
      <h2>Редактировать задачу</h2>
      <label class="form-label">Проект</label>
      <select class="form-select" id="editTaskProject">
        ${state.projects.map(pr=>`<option value="${pr.id}" ${pr.id===t.projectId?"selected":""}>${escapeHtml(pr.title)}</option>`).join("")}
      </select>
      <label class="form-label">Задача</label>
      <textarea class="form-textarea" id="editTaskTitle">${escapeHtml(t.title)}</textarea>
      <label class="form-label">Ответственный</label>
      <input class="form-input" id="editTaskOwner" value="${escapeHtml(t.owner || "")}" />
      <label class="form-label">Срок</label>
      <input class="form-input" id="editTaskDue" type="date" value="${escapeHtml(t.due || "")}" />
      <label class="form-label">Приоритет</label>
      <select class="form-select" id="editTaskPriority">
        <option value="normal" ${t.priority==="normal"?"selected":""}>Обычный</option>
        <option value="critical" ${t.priority==="critical"?"selected":""}>Критично</option>
        <option value="low" ${t.priority==="low"?"selected":""}>Низкий</option>
      </select>
      <label class="form-label">Статус</label>
      <select class="form-select" id="editTaskDone">
        <option value="false" ${!t.done?"selected":""}>В работе</option>
        <option value="true" ${t.done?"selected":""}>Выполнено</option>
      </select>
      <button class="primary" id="saveTaskEdit">Сохранить</button>
      <button class="danger" id="deleteTask">Удалить задачу</button>
      <button class="secondary" id="cancelSheet">Отмена</button>
    `);
    $("#saveTaskEdit").onclick = () => {
      const title = $("#editTaskTitle").value.trim();
      if (!title) return toast("Введите название задачи");
      t.projectId = $("#editTaskProject").value;
      t.title = title;
      t.owner = $("#editTaskOwner").value.trim() || "Не назначен";
      t.due = $("#editTaskDue").value;
      t.priority = $("#editTaskPriority").value;
      t.done = $("#editTaskDone").value === "true";
      saveState(); closeSheet(); toast("Задача обновлена"); render(); haptic("light");
    };
    $("#deleteTask").onclick = () => confirmDelete(
      "Удалить задачу?",
      t.title,
      () => { state.tasks = state.tasks.filter(x=>x.id!==taskId); saveState(); closeSheet(); toast("Задача удалена"); render(); }
    );
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
          <button class="secondary" id="editIRDItem">Изменить ИРД</button>
          <button class="secondary" id="toggleIRDStatus">${current.status==="received" ? "Вернуть в ожидание" : "Отметить полученным"}</button>
          <button class="secondary" id="markIRDNotRequired">${current.status==="na" ? "Вернуть в ожидание" : "Не требуется по проекту"}</button>
        `;
      },
      () => {
        const edit = $("#editIRDItem");
        if (edit) edit.onclick = () => editIRDForm(item.id);
        const btn = $("#toggleIRDStatus");
        if (btn) btn.onclick = () => {
          item.status = item.status==="received" ? "waiting" : "received";
          saveState(); closeSheet(); toast(item.status==="received" ? "Отмечено как получено" : "Возвращено в ожидание"); render();
        };
        const na = $("#markIRDNotRequired");
        if (na) na.onclick = () => {
          item.status = item.status==="na" ? "waiting" : "na";
          saveState(); closeSheet(); toast(item.status==="na" ? "Отмечено: не требуется" : "Возвращено в ожидание"); render();
        };
      }
    );
  }



  function createProjectForm() {
    openSheet(`
      <h2>Новый проект</h2>
      <div class="subtitle">Можно начать с пустой структуры или скопировать перечень разделов и ИРД из «Ефимова, 21».</div>
      <label class="form-label">Название проекта *</label>
      <input class="form-input" id="newProjectTitle" placeholder="Например: Советская, 12" />
      <label class="form-label">Шифр проекта</label>
      <input class="form-input" id="newProjectCode" placeholder="2250-26" />
      <label class="form-label">Наименование объекта</label>
      <textarea class="form-textarea" id="newProjectObject" placeholder="Многоквартирный жилой дом..."></textarea>
      <label class="form-label">Адрес</label>
      <input class="form-input" id="newProjectAddress" />
      <label class="form-label">Заказчик</label>
      <input class="form-input" id="newProjectClient" />
      <label class="form-label">Стоимость договора, ₽</label>
      <input class="form-input" id="newProjectValue" inputmode="numeric" value="0" />
      <label class="form-label">Структура</label>
      <select class="form-select" id="newProjectTemplate">
        <option value="template">Скопировать структуру «Ефимова, 21»</option>
        <option value="empty">Пустой проект</option>
      </select>
      <button class="primary" id="createProjectNow">Создать проект</button>
      <button class="secondary" id="cancelSheet">Отмена</button>
    `);
    $("#createProjectNow").onclick = () => {
      const title = $("#newProjectTitle").value.trim();
      if (!title) return toast("Введите название проекта");
      const mode = $("#newProjectTemplate").value;
      const tpl = state.projects.find(x=>x.id==="efimova21") || state.projects[0];
      const id = uid("project");
      let stages, sections, initialData;
      if (mode === "template" && tpl) {
        stages = [
          {id:"concept",title:"Концепция",value:0,status:"todo",note:"Концептуальные решения"},
          {id:"sketch",title:"Эскиз",value:0,status:"todo",note:"Эскизный проект"},
          {id:"P",title:"Стадия П",value:0,status:"todo",note:"Проектная документация"},
          {id:"RD",title:"Стадия РД",value:0,status:"todo",note:"Рабочая документация"}
        ];
        const idMap = {};
        sections = deepClone(tpl.sections).map(s=>{
          const newId = uid("section");
          idMap[s.id] = newId;
          return {...s, id:newId, executor:"", status:"todo", advance:0, closing:0};
        });
        initialData = deepClone(tpl.initialData).map(d=>({
          ...d,
          id:uid("ird"),
          status:d.status==="na"?"na":"waiting",
          blocks:(d.blocks || []).map(oldId=>idMap[oldId]).filter(Boolean)
        }));
      } else {
        stages = [
          {id:"concept",title:"Концепция",value:0,status:"todo",note:"Концептуальные решения"},
          {id:"sketch",title:"Эскиз",value:0,status:"todo",note:"Эскизный проект"},
          {id:"P",title:"Стадия П",value:0,status:"todo",note:"Проектная документация"},
          {id:"RD",title:"Стадия РД",value:0,status:"todo",note:"Рабочая документация"}
        ];
        sections = [];
        initialData = [];
      }
      const np = {
        id,
        code:$("#newProjectCode").value.trim(),
        title,
        objectName:$("#newProjectObject").value.trim(),
        address:$("#newProjectAddress").value.trim(),
        client:$("#newProjectClient").value.trim(),
        currentStage:"P",
        contractValue:numberValue($("#newProjectValue").value),
        stages, sections, initialData, documents:[], priceChanges:[], payments:[]
      };
      state.projects.push(np);
      routeState.projectId = id;
      routeState.projectTab = "summary";
      routeState.stage = "P";
      saveState(); closeSheet(); toast("Проект создан"); route("project",{projectId:id}); haptic("medium");
    };
    $("#cancelSheet").onclick = closeSheet;
  }

  function addIRDForm() {
    const p = project();
    openSheet(`
      <h2>Добавить исходные данные</h2>
      <label class="form-label">Наименование *</label>
      <input class="form-input" id="newIRDTitle" placeholder="Например: ТУ на теплоснабжение" />
      <label class="form-label">Кто предоставляет</label>
      <input class="form-input" id="newIRDProvider" placeholder="Заказчик / проектировщик / подрядчик" />
      <label class="form-label">Статус</label>
      <select class="form-select" id="newIRDStatus">
        <option value="waiting">Ожидаем</option>
        <option value="received">Получено</option>
        <option value="na">Не требуется</option>
      </select>
      <button class="primary" id="saveNewIRD">Добавить</button>
      <button class="secondary" id="cancelSheet">Отмена</button>
    `);
    $("#saveNewIRD").onclick = () => {
      const title = $("#newIRDTitle").value.trim();
      if (!title) return toast("Введите название ИРД");
      p.initialData.push({id:uid("ird"),title,provider:$("#newIRDProvider").value.trim(),status:$("#newIRDStatus").value,blocks:[]});
      saveState(); closeSheet(); toast("ИРД добавлено"); render();
    };
    $("#cancelSheet").onclick = closeSheet;
  }

  function editIRDForm(id) {
    const p = project(), item = p.initialData.find(x=>x.id===id);
    if (!item) return;
    openSheet(`
      <h2>Изменить ИРД</h2>
      <label class="form-label">Наименование</label>
      <input class="form-input" id="editIRDTitle" value="${escapeHtml(item.title)}" />
      <label class="form-label">Кто предоставляет</label>
      <input class="form-input" id="editIRDProvider" value="${escapeHtml(item.provider || "")}" />
      <label class="form-label">Статус</label>
      <select class="form-select" id="editIRDStatus">
        <option value="waiting" ${item.status==="waiting"?"selected":""}>Ожидаем</option>
        <option value="received" ${item.status==="received"?"selected":""}>Получено</option>
        <option value="na" ${item.status==="na"?"selected":""}>Не требуется</option>
      </select>
      <button class="primary" id="saveIRDChanges">Сохранить</button>
      <button class="danger" id="deleteIRDFromForm">Удалить ИРД</button>
      <button class="secondary" id="cancelSheet">Отмена</button>
    `);
    $("#saveIRDChanges").onclick = () => {
      const title = $("#editIRDTitle").value.trim();
      if (!title) return toast("Введите название");
      item.title = title;
      item.provider = $("#editIRDProvider").value.trim();
      item.status = $("#editIRDStatus").value;
      saveState(); closeSheet(); toast("ИРД обновлено"); render();
    };
    $("#deleteIRDFromForm").onclick = () => deleteIRD(id);
    $("#cancelSheet").onclick = closeSheet;
  }

  function deleteIRD(id) {
    const p = project(), item = p.initialData.find(x=>x.id===id);
    if (!item) return;
    confirmDelete("Удалить ИРД?", item.title, async () => {
      const docs = documentsFor(p,"ird",id);
      for (const d of docs) { try { await deleteBlob(d.id); } catch(_){} }
      p.documents = p.documents.filter(d=>!(d.targetType==="ird" && d.targetId===id));
      p.initialData = p.initialData.filter(x=>x.id!==id);
      saveState(); closeSheet(); toast("ИРД удалено"); render();
    });
  }

  function addSectionForm() {
    const p = project();
    const stage = routeState.stage || "P";
    openSheet(`
      <h2>Добавить раздел</h2>
      <label class="form-label">Этап</label>
      <select class="form-select" id="newSectionStage">
        ${p.stages.filter(s=>["P","RD"].includes(s.id)).map(s=>`<option value="${s.id}" ${s.id===stage?"selected":""}>${escapeHtml(s.title)}</option>`).join("")}
      </select>
      <label class="form-label">Шифр раздела *</label>
      <input class="form-input" id="newSectionCode" placeholder="Например: ТХ" />
      <label class="form-label">Наименование *</label>
      <input class="form-input" id="newSectionName" placeholder="Технологические решения" />
      <label class="form-label">Исполнитель</label>
      <input class="form-input" id="newSectionExecutor" />
      <label class="form-label">Аванс, ₽</label>
      <input class="form-input" id="newSectionAdvance" inputmode="numeric" value="0" />
      <label class="form-label">Закрытие, ₽</label>
      <input class="form-input" id="newSectionClosing" inputmode="numeric" value="0" />
      <button class="primary" id="saveNewSection">Добавить раздел</button>
      <button class="secondary" id="cancelSheet">Отмена</button>
    `);
    $("#saveNewSection").onclick = () => {
      const code = $("#newSectionCode").value.trim(), name = $("#newSectionName").value.trim();
      if (!code || !name) return toast("Укажите шифр и наименование");
      const newSection = {
        id:uid("section"), stage:$("#newSectionStage").value, code, name,
        executor:$("#newSectionExecutor").value.trim(), status:"todo",
        advance:numberValue($("#newSectionAdvance").value), closing:numberValue($("#newSectionClosing").value)
      };
      // Insert after last section of chosen stage.
      const indices = p.sections.map((s,i)=>s.stage===newSection.stage?i:-1).filter(i=>i>=0);
      const insertAt = indices.length ? Math.max(...indices)+1 : p.sections.length;
      p.sections.splice(insertAt,0,newSection);
      routeState.stage = newSection.stage;
      saveState(); closeSheet(); toast("Раздел добавлен"); render();
    };
    $("#cancelSheet").onclick = closeSheet;
  }

  function editSectionDetails(id) {
    const p = project(), s = section(p,id);
    if (!s) return;
    openSheet(`
      <h2>Редактировать раздел</h2>
      <label class="form-label">Этап</label>
      <select class="form-select" id="editSectionStage">
        ${p.stages.filter(st=>["P","RD"].includes(st.id)).map(st=>`<option value="${st.id}" ${st.id===s.stage?"selected":""}>${escapeHtml(st.title)}</option>`).join("")}
      </select>
      <label class="form-label">Шифр</label>
      <input class="form-input" id="editSectionCode" value="${escapeHtml(s.code)}" />
      <label class="form-label">Наименование</label>
      <input class="form-input" id="editSectionName" value="${escapeHtml(s.name)}" />
      <label class="form-label">Исполнитель</label>
      <input class="form-input" id="editSectionExecutor" value="${escapeHtml(s.executor || "")}" />
      <button class="primary" id="saveSectionDetails">Сохранить</button>
      <button class="danger" id="deleteSectionFromCard">Удалить раздел</button>
      <button class="secondary" id="cancelSheet">Отмена</button>
    `);
    $("#saveSectionDetails").onclick = () => {
      const code = $("#editSectionCode").value.trim(), name = $("#editSectionName").value.trim();
      if (!code || !name) return toast("Укажите шифр и наименование");
      const oldCode = s.code;
      s.stage = $("#editSectionStage").value;
      s.code = code; s.name = name; s.executor = $("#editSectionExecutor").value.trim();
      state.tasks.forEach(t => { if (t.projectId===p.id && t.detail===oldCode) t.detail=code; });
      routeState.stage = s.stage;
      saveState(); closeSheet(); toast("Раздел обновлён"); render();
    };
    $("#deleteSectionFromCard").onclick = () => deleteSection(id);
    $("#cancelSheet").onclick = closeSheet;
  }

  function deleteSection(id) {
    const p = project(), s = section(p,id);
    if (!s) return;
    confirmDelete("Удалить раздел?", `${s.code} — ${s.name}`, async () => {
      const docs = documentsFor(p,"section",id);
      for (const d of docs) { try { await deleteBlob(d.id); } catch(_){} }
      p.documents = p.documents.filter(d=>!(d.targetType==="section" && d.targetId===id));
      p.initialData.forEach(d => { if (Array.isArray(d.blocks)) d.blocks = d.blocks.filter(x=>x!==id); });
      state.tasks.forEach(t => { if (t.projectId===p.id && t.detail===s.code) t.detail=""; });
      p.sections = p.sections.filter(x=>x.id!==id);
      saveState(); closeSheet(); toast("Раздел удалён"); render();
    });
  }

  function moveSection(id, delta) {
    const p = project();
    const s = section(p,id);
    if (!s) return;
    const same = p.sections.filter(x=>x.stage===s.stage);
    const localIndex = same.findIndex(x=>x.id===id);
    const target = same[localIndex + delta];
    if (!target) return;
    const a = p.sections.findIndex(x=>x.id===id), b = p.sections.findIndex(x=>x.id===target.id);
    [p.sections[a],p.sections[b]]=[p.sections[b],p.sections[a]];
    saveState(); render(); haptic("light");
  }

  function moveIRD(id, delta) {
    const p = project();
    const idx = p.initialData.findIndex(x=>x.id===id);
    if (moveItem(p.initialData,idx,Number(delta))) { saveState(); render(); haptic("light"); }
  }

  function confirmDelete(title, detail, onConfirm) {
    openSheet(`
      <h2>${escapeHtml(title)}</h2>
      <div class="confirm-box">${escapeHtml(detail)}<br><br>Действие нельзя отменить в текущей тестовой версии.</div>
      <button class="danger" id="confirmDeleteNow">Удалить</button>
      <button class="secondary" id="cancelSheet">Отмена</button>
    `);
    $("#confirmDeleteNow").onclick = () => onConfirm();
    $("#cancelSheet").onclick = closeSheet;
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
    const newProject = $("[data-new-project]"); if (newProject) newProject.onclick = createProjectForm;
    const addIRD = $("[data-add-ird]"); if (addIRD) addIRD.onclick = addIRDForm;
    const addSection = $("[data-add-section]"); if (addSection) addSection.onclick = addSectionForm;
    document.querySelectorAll("[data-edit-task]").forEach(el => el.onclick = (e) => { e.stopPropagation(); editTaskForm(el.dataset.editTask); });
    document.querySelectorAll("[data-move-ird]").forEach(el => el.onclick = (e) => { e.stopPropagation(); moveIRD(el.dataset.moveIrd, Number(el.dataset.delta)); });
    document.querySelectorAll("[data-delete-ird]").forEach(el => el.onclick = (e) => { e.stopPropagation(); deleteIRD(el.dataset.deleteIrd); });
    document.querySelectorAll("[data-move-section]").forEach(el => el.onclick = (e) => { e.stopPropagation(); moveSection(el.dataset.moveSection, Number(el.dataset.delta)); });
    document.querySelectorAll("[data-delete-section]").forEach(el => el.onclick = (e) => { e.stopPropagation(); deleteSection(el.dataset.deleteSection); });

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
    const editSectionDetailsBtn = $("[data-edit-section-details]"); if (editSectionDetailsBtn) editSectionDetailsBtn.onclick = () => editSectionDetails(routeState.sectionId);

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

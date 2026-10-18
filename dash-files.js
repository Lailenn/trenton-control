/* Home page files area: invoice archive table, hours archive table, cheque receipts with tabs
   and the registered devices strip. It only reads the records the other modules keep and calls
   their own view / download / edit / delete functions. */
window.DashFiles = (function () {
  "use strict";
  const $ = selector => document.querySelector(selector);
  const esc = value => String(value ?? "").replace(/[&<>'"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#039;", '"': "&quot;" }[char]));
  const money = value => `$${Number(value || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const isoDate = value => /^\d{4}-\d{2}-\d{2}/.test(String(value || "")) ? String(value).slice(0, 10) : "";
  const dmy = iso => iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "Sin fecha";
  const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  const short = iso => `${iso.slice(8, 10)} ${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;
  const ROWS = 5;
  const tc = () => window.TrentonControl;
  const company = () => window.CompanyApp?.isOtras?.() ? "" : "Trenton Builders LLC";

  const ICON = {
    invoice: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M9 13h6M9 17h6M9 9h2"/></svg>',
    clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="7" width="18" height="11" rx="2"/><path d="M6 11h5M6 14h3M14 14h4"/><path d="M15 4l3 3"/></svg>',
    upload: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15V4"/><path d="M7 9l5-5 5 5"/><path d="M4 15v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4"/></svg>',
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg>',
    pdf: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M8.5 16.5c1.5-1 3-3.5 3.5-6 .5 2.5 2 4.5 3.5 5-1.5 0-4.5 0-7 1z"/></svg>',
    dots: '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="12" cy="19" r="1.7"/></svg>',
    download: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v11"/><path d="M7 10l5 5 5-5"/><path d="M5 20h14"/></svg>',
    trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16"/><path d="M10 11v6M14 11v6"/><path d="M6 7l1 13h10l1-13"/><path d="M9 7V4h6v3"/></svg>',
    camera: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>',
    gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
    finger: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 11v3a8 8 0 0 1-1.5 4.7"/><path d="M8.5 9.5A4 4 0 0 1 16 11v2.5a11 11 0 0 1-.9 4.4"/><path d="M5.3 16.5A10 10 0 0 0 6 13v-2a6 6 0 0 1 9.4-4.9"/><path d="M18.5 8.5A6 6 0 0 1 18 11v2a14 14 0 0 1-.4 3.4"/><path d="M3.5 12.5V11a8.5 8.5 0 0 1 14-6.5"/></svg>'
  };

  /* ---------- data ---------- */
  const invoiceDate = r => window.InvoiceCore?.issuedDate?.(r) || isoDate(r.issuedDate);
  const invoiceClient = r => r.invoiceData?.billName || r.billName || company() || "—";
  const invoices = () => (tc()?.records?.() || []).map(r => ({
    kind: "invoice", record: r, id: r.id, date: invoiceDate(r), client: invoiceClient(r),
    number: r.invoiceNumber || "Sin número", address: r.address || "Sin dirección", total: Number(r.amount || 0),
    hasPdf: Boolean(r.pdfBlob || r.pdfPath)
  })).sort((a, b) => (b.date || "").localeCompare(a.date || "") || String(b.number).localeCompare(String(a.number), "en", { numeric: true }));

  function reportInfo(r, kind) {
    const entries = (r.entries || []).filter(e => String(e?.employee || "") !== "Imported PDF" || !e.timeIn);
    const hours = entries.reduce((sum, e) => sum + Number(e.hours || 0), 0);
    const calc = (r.entries || []).reduce((sum, e) => sum + Number(e.hours || 0) * Number(e.rate || 0), 0);
    const stored = Number(r.received || 0) + Number(r.due || 0);
    const dates = [r.startDate, r.reportDate, ...(r.entries || []).map(e => e.date), r.endDate].map(isoDate).filter(Boolean).sort();
    return {
      kind, record: r, id: r.id, date: dates[dates.length - 1] || "", first: dates[0] || "",
      client: r.client || company() || "—", address: r.jobAddress || "Sin dirección", hours,
      total: stored > 0 && (!calc || Math.abs(stored - calc) <= 1) ? stored : calc,
      hasPdf: Boolean(r.pdfBlob || r.pdfPath)
    };
  }
  const hoursReports = () => (window.HoursApp?.reports?.() || []).filter(r => r.hoursFormat !== "a3" && !String(r.id || "").startsWith("job-"))
    .map(r => reportInfo(r, "hours")).sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  const jobReports = () => (window.JobApp?.reports?.() || []).map(r => reportInfo(r, "job")).sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  function range(item) {
    if (!item.date) return "Sin fecha";
    if (!item.first || item.first === item.date) return short(item.date);
    const a = item.first, b = item.date;
    if (a.slice(0, 7) === b.slice(0, 7)) return `${a.slice(8, 10)} – ${short(b)}`;
    return `${short(a)} – ${short(b)}`;
  }
  const stageOf = item => {
    const s = item.record.stage;
    if (s === "paid") return { id: "paid", text: "Pagado" };
    if (s === "waiting" || s === "sent") return { id: "waiting", text: item.kind === "job" ? `Enviado ${window.CompanyApp?.toClient?.() || "a Trenton"}` : "Esperando cheque" };
    return { id: "other", text: "Con comprobante" };
  };

  /* ---------- filters ---------- */
  const state = { inv: { year: "", client: "all", q: "" }, hrs: { year: "", client: "all", q: "" }, chk: { year: "", client: "all", q: "", tab: "invoice" } };
  function years(items) { return [...new Set(items.map(i => (i.date || "").slice(0, 4)).filter(Boolean))].sort().reverse(); }
  function applyFilters(items, f, text) {
    const q = f.q.trim().toLowerCase();
    return items.filter(i => (!f.year || f.year === "all" || (i.date || "").startsWith(f.year)) &&
      (f.client === "all" || i.client === f.client) && (!q || text(i).toLowerCase().includes(q)));
  }
  function filterBar(key, items, placeholder) {
    const f = state[key], ys = years(items);
    // Newest year by default until the user picks one; a picked year that no longer exists falls back too.
    if (!f.picked || (f.year !== "all" && !ys.includes(f.year))) f.year = ys[0] || "all";
    const clients = [...new Set(items.map(i => i.client))].sort();
    if (f.client !== "all" && !clients.includes(f.client)) f.client = "all";
    return `<div class="df-filters" data-filters="${key}">
      <label class="df-select"><span>Año:</span><select data-f="year"><option value="all"${f.year === "all" ? " selected" : ""}>Todos</option>${ys.map(y => `<option${y === f.year ? " selected" : ""}>${y}</option>`).join("")}</select></label>
      <label class="df-select df-client"><select data-f="client" aria-label="Cliente"><option value="all">Todos los clientes</option>${clients.map(c => `<option${c === f.client ? " selected" : ""} value="${esc(c)}">${esc(c)}</option>`).join("")}</select></label>
      <label class="df-search">${ICON.search}<input type="search" data-f="q" placeholder="${placeholder}" value="${esc(f.q)}" aria-label="${placeholder}"></label>
    </div>`;
  }
  const empty = (cols, text) => `<tr class="df-empty"><td colspan="${cols}">${text}</td></tr>`;
  const more = (count, shown, target, label) => count > shown ? `<button type="button" class="df-more" data-open="${target}">${label} (${count}) →</button>` : "";
  const menu = (kind, id) => `<button type="button" class="df-icon df-menu-btn" data-menu="${kind}" data-id="${esc(id)}" aria-label="Más opciones">${ICON.dots}</button>`;
  const pdfCell = (item) => item.hasPdf ? `<button type="button" class="df-icon df-pdf" data-act="view" data-kind="${item.kind}" data-id="${esc(item.id)}" aria-label="Ver PDF">${ICON.pdf}</button>` : `<span class="df-nopdf" title="Falta el PDF">—</span>`;

  /* ---------- sections ---------- */
  function invoiceCard() {
    const all = invoices(), list = applyFilters(all, state.inv, i => `${i.number} ${i.client} ${i.address} ${i.record.pdfName || ""}`);
    const rows = list.slice(0, ROWS).map((i, n) => `<tr class="${n === 0 ? "is-latest" : ""}">
      <td class="df-strong">${esc(i.number)}</td><td class="df-client-cell">${esc(i.client)}</td><td class="df-wrap">${esc(i.address)}</td><td>${dmy(i.date)}</td>
      <td class="df-money">${money(i.total)}</td><td class="df-c">${pdfCell(i)}</td><td class="df-c">${menu("invoice", i.id)}</td></tr>`).join("");
    return `<article class="df-card" data-card="inv">
      <header class="df-head"><span class="df-badge is-orange">${ICON.invoice}</span><div><h2>Archivo de invoices</h2><p>Aquí se guarda el PDF de cada factura. También puedes subir facturas anteriores y ver cuánto facturaste cada año.</p></div>
        <button type="button" class="df-upload" data-upload="invoice">${ICON.upload} Subir invoice</button></header>
      ${filterBar("inv", all, "Buscar invoice…")}
      <div class="df-table-wrap"><table class="df-table"><thead><tr><th>#</th><th>Cliente</th><th>Dirección</th><th>Fecha</th><th>Total</th><th>Archivo</th><th><span class="sr-only">Opciones</span></th></tr></thead>
      <tbody>${rows || empty(7, all.length ? "No hay invoices con estos filtros." : "Todavía no hay invoices guardadas.")}</tbody></table></div>
      ${more(list.length, ROWS, "archive", "Ver todas")}
    </article>`;
  }
  function hoursCard() {
    const all = hoursReports(), list = applyFilters(all, state.hrs, i => `${i.address} ${i.client} ${(i.record.entries || []).map(e => e.employee).join(" ")}`);
    const rows = list.slice(0, ROWS).map((i, n) => `<tr class="${n === 0 ? "is-latest" : ""}">
      <td class="df-wrap"><span class="df-strong-soft">${range(i)}</span><small>${esc(i.address)}</small></td><td class="df-client-cell">${esc(i.client)}</td><td>${Number(i.hours.toFixed(2)).toLocaleString("en-US", { minimumFractionDigits: 1 })}</td>
      <td class="df-money">${money(i.total)}</td><td class="df-c">${pdfCell(i)}</td><td class="df-c">${menu("hours", i.id)}</td></tr>`).join("");
    const note = document.querySelector("#openHoursArchiveButton")?.closest("section")?.querySelector("p")?.textContent || "Aquí se guarda el PDF de cada reporte de horas.";
    return `<article class="df-card" data-card="hrs">
      <header class="df-head"><span class="df-badge is-green">${ICON.clock}</span><div><h2>Archivo de reportes de horas</h2><p>${esc(note)}</p></div>
        <button type="button" class="df-upload" data-upload="hours">${ICON.upload} Subir reporte</button></header>
      ${filterBar("hrs", all, "Buscar reporte…")}
      <div class="df-table-wrap"><table class="df-table"><thead><tr><th>Rango de fechas</th><th>Cliente</th><th>Horas</th><th>Total</th><th>Archivo</th><th><span class="sr-only">Opciones</span></th></tr></thead>
      <tbody>${rows || empty(6, all.length ? "No hay reportes con estos filtros." : "Todavía no hay reportes de horas.")}</tbody></table></div>
      ${more(list.length, ROWS, "hours-archive", "Ver todos")}
    </article>`;
  }
  function checkItems(tab) {
    const source = tab === "invoice" ? invoices() : tab === "hours" ? hoursReports() : jobReports();
    return source.filter(i => ["waiting", "sent", "paid"].includes(i.record.stage) || (i.record.checkPhotos || []).length)
      .map(i => { const photo = (i.record.checkPhotos || [])[0]; return { ...i, photo, date: isoDate(photo?.captured_at || photo?.created_at) || i.date }; })
      .sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  }
  function checksCard() {
    const f = state.chk, all = checkItems(f.tab);
    const list = applyFilters(all, f, i => `${i.number || ""} ${i.address} ${i.client} ${i.photo?.file_name || ""}`);
    const toClient = window.CompanyApp?.toClient?.() || "a Trenton";
    const tabs = [["invoice", "Cheques de invoices"], ["hours", "Cheques de reportes de horas"], ["job", `Enviados ${toClient}`]];
    const concept = i => i.kind === "invoice" ? `Invoice ${esc(i.number)}` : `${i.kind === "hours" ? "Horas" : "Reporte"} · ${range(i)}`;
    const rows = list.slice(0, f.all ? list.length : ROWS).map(i => {
      const st = stageOf(i), photos = (i.record.checkPhotos || []).length;
      const proof = i.photo
        ? `<button type="button" class="df-proof check-view" data-check-kind="${i.kind}" data-id="${esc(i.id)}"><span class="df-thumb" data-thumb="${esc(i.photo.id)}"></span><span class="df-proof-name">${esc(i.photo.file_name || "cheque.jpg")}</span>${photos > 1 ? `<em>+${photos - 1}</em>` : ""}</button>`
        : `<span class="df-proof is-none"><span class="df-thumb is-empty">–</span><span class="df-proof-name">Sin comprobante</span></span>`;
      const actions = i.photo
        ? `<button type="button" class="df-icon df-box" data-act="photo-download" data-kind="${i.kind}" data-id="${esc(i.id)}" aria-label="Descargar foto">${ICON.download}</button><button type="button" class="df-icon df-box is-danger" data-act="photo-delete" data-kind="${i.kind}" data-id="${esc(i.id)}" aria-label="Quitar foto">${ICON.trash}</button>`
        : `<button type="button" class="df-icon df-box" data-act="photo-add" data-kind="${i.kind}" data-id="${esc(i.id)}" aria-label="Subir foto del cheque">${ICON.camera}</button>`;
      return `<tr><td>${dmy(i.date)}</td><td class="df-client-cell">${esc(i.client)}</td><td class="df-wrap">${concept(i)}</td><td class="df-money-soft">${money(i.total)}</td>
        <td><span class="df-state is-${st.id}">${st.text}</span></td><td>${proof}</td><td class="df-actions">${actions}</td></tr>`;
    }).join("");
    return `<article class="df-card df-wide" data-card="chk">
      <header class="df-head"><span class="df-badge is-green">${ICON.check}</span><div><h2>Comprobantes de cheques y pagos</h2><p>Sube aquí la foto del cheque cuando una invoice esté en Esperando cheque o Pagado.</p></div>
        <button type="button" class="df-upload" data-upload="check">${ICON.upload} Subir comprobante</button></header>
      <div class="df-tabbar"><div class="df-tabs" role="tablist">${tabs.map(([id, label]) => `<button type="button" role="tab" class="df-tab${id === f.tab ? " is-active" : ""}" aria-selected="${id === f.tab}" data-tab="${id}">${esc(label)}</button>`).join("")}</div>
      ${filterBar("chk", all, "Buscar cheque…")}</div>
      <div class="df-desk-slot"></div>
      <div class="df-table-wrap"><table class="df-table df-checks"><thead><tr><th>Fecha</th><th>Cliente</th><th>Concepto</th><th>Monto</th><th>Estado</th><th>Comprobante</th><th><span class="sr-only">Acciones</span></th></tr></thead>
      <tbody>${rows || empty(7, all.length ? "No hay cheques con estos filtros." : "Todavía no hay registros en Esperando cheque o Pagado.")}</tbody></table></div>
      ${list.length > ROWS ? `<button type="button" class="df-more" data-more="chk">${f.all ? "Ver menos ↑" : `Ver más (${list.length - ROWS} más) →`}</button>` : ""}
    </article>`;
  }
  function devicesCard() {
    return `<article class="df-card df-wide df-devices"><span class="df-badge is-blue">${ICON.finger}</span>
      <div><h2>Dispositivos registrados (Windows Hello)</h2><p class="df-passkey-text"></p></div>
      <button type="button" class="df-manage" data-act="passkey">${ICON.gear} <span>Registrar este aparato</span></button></article>`;
  }

  /* ---------- render ---------- */
  let root = null, thumbUrls = [], openDesk = "";
  function mount() {
    if (root) return root;
    const board = $("#boardView");
    const first = board?.querySelector(".dash-archive");
    if (!board || !first) return null;
    root = document.createElement("div");
    root.className = "dash-files";
    root.id = "dashFiles";
    first.before(root);
    board.classList.add("has-dash-files");
    root.addEventListener("click", onClick);
    root.addEventListener("change", onFilter);
    root.addEventListener("input", event => { if (event.target.dataset.f === "q") onFilter(event); });
    document.addEventListener("click", event => { if (!event.target.closest(".df-menu, .df-menu-btn")) closeMenu(); });
    return root;
  }
  function render() {
    if (!mount()) return;
    const focus = document.activeElement && root.contains(document.activeElement) && document.activeElement.dataset.f === "q"
      ? { card: document.activeElement.closest("[data-card]")?.dataset.card, pos: document.activeElement.selectionStart } : null;
    // The desk panel is moved inside the cheques card; put it back before redrawing.
    const desk = root.querySelector(".df-desk-slot > .check-callout");
    if (desk) $("#boardView").append(desk);
    closeMenu();
    root.innerHTML = `<div class="df-grid">${invoiceCard()}${hoursCard()}</div>${checksCard()}${devicesCard()}`;
    syncPasskey();
    placeDesk();
    loadThumbs();
    if (focus) { const input = root.querySelector(`[data-card="${focus.card}"] [data-f="q"]`); if (input) { input.focus(); try { input.setSelectionRange(focus.pos, focus.pos); } catch (_) {} } }
  }
  let timer = 0;
  const schedule = () => { clearTimeout(timer); timer = setTimeout(render, 80); };

  async function loadThumbs() {
    thumbUrls.splice(0).forEach(url => URL.revokeObjectURL(url));
    const tab = state.chk.tab;
    for (const item of checkItems(tab)) {
      const slot = item.photo && root.querySelector(`[data-thumb="${CSS.escape(item.photo.id)}"]`);
      if (!slot) continue;
      try {
        const blob = item.photo.blob || await window.CloudDB?.ensureCheckPhoto?.(item.photo);
        if (!blob || !slot.isConnected) continue;
        const url = URL.createObjectURL(blob); thumbUrls.push(url);
        slot.style.backgroundImage = `url("${url}")`;
      } catch (_) { slot.classList.add("is-empty"); slot.textContent = "!"; }
    }
  }
  function syncPasskey() {
    const text = $("#passkeyStatus")?.textContent?.trim() || "";
    const label = $("#registerPasskeyButton")?.textContent?.trim() || "Registrar este aparato";
    const p = root.querySelector(".df-passkey-text"); if (p) p.textContent = text;
    const b = root.querySelector('[data-act="passkey"] span'); if (b) b.textContent = label;
    const btn = root.querySelector('[data-act="passkey"]'); if (btn) btn.disabled = Boolean($("#registerPasskeyButton")?.disabled);
    const hidden = $("#passkeyPanel")?.classList.contains("hidden") || $("#passkeyPanel")?.hidden;
    root.querySelector(".df-devices")?.toggleAttribute("hidden", Boolean(hidden));
  }
  const DESKS = { invoice: "#checkDesk", hours: "#hoursCheckDesk", job: "#jobCheckDesk" };
  function placeDesk() {
    Object.values(DESKS).forEach(sel => $(sel)?.classList.remove("is-open"));
    if (openDesk !== state.chk.tab) return;
    const desk = $(DESKS[openDesk]);
    const slot = root.querySelector(".df-desk-slot");
    if (desk && slot) { slot.append(desk); desk.classList.add("is-open"); }
  }

  /* ---------- actions ---------- */
  function find(kind, id) {
    const list = kind === "invoice" ? invoices() : kind === "hours" ? hoursReports() : jobReports();
    return list.find(i => i.id === id)?.record || null;
  }
  const archiveOf = kind => kind === "invoice" ? tc()?.archive : kind === "hours" ? tc()?.hoursArchive : tc()?.jobArchive;
  function act(task, kind, id) {
    const record = find(kind, id); if (!record) return;
    const archive = archiveOf(kind);
    if (task === "view") return archive?.view?.(record);
    if (task === "download") return archive?.download?.(record);
    if (task === "delete") return Promise.resolve(archive?.remove?.(record)).then(schedule);
    if (task === "edit") return kind === "invoice" ? tc()?.edit?.(record) : kind === "hours" ? window.HoursApp?.edit?.(record) : window.JobApp?.edit?.(record);
  }
  function closeMenu() { document.querySelector(".df-menu")?.remove(); }
  function openMenu(button) {
    const already = document.querySelector(".df-menu")?.dataset.for === button.dataset.id;
    closeMenu(); if (already) return;
    const record = find(button.dataset.menu, button.dataset.id);
    const hasPdf = Boolean(record?.pdfBlob || record?.pdfPath);
    const menuEl = document.createElement("div");
    menuEl.className = "df-menu"; menuEl.dataset.for = button.dataset.id; menuEl.setAttribute("role", "menu");
    menuEl.innerHTML = [hasPdf && ["view", "Ver PDF"], hasPdf && ["download", "Descargar PDF"], ["edit", "Editar datos"], ["delete", "Eliminar"]].filter(Boolean)
      .map(([task, label]) => `<button type="button" role="menuitem" class="${task === "delete" ? "is-danger" : ""}" data-task="${task}">${label}</button>`).join("");
    document.body.append(menuEl);
    const box = button.getBoundingClientRect();
    menuEl.style.top = `${box.bottom + window.scrollY + 4}px`;
    menuEl.style.left = `${Math.max(8, box.right + window.scrollX - menuEl.offsetWidth)}px`;
    menuEl.addEventListener("click", event => {
      const item = event.target.closest("[data-task]"); if (!item) return;
      closeMenu(); act(item.dataset.task, button.dataset.menu, button.dataset.id);
    });
  }
  async function photoAction(task, kind, id) {
    const record = find(kind, id); const photo = record?.checkPhotos?.[0];
    if (task === "photo-add") {
      const picker = kind === "invoice" ? $("#checkDeskFile") : kind === "hours" ? $("#hoursCheckDeskFile") : $("#jobCheckDeskFile");
      if (!picker) return;
      if (kind === "invoice") picker.dataset.invoiceId = id; else picker.dataset.reportId = id;
      return picker.click();
    }
    if (!photo) return;
    if (task === "photo-download") {
      try {
        const blob = photo.blob || await window.CloudDB.ensureCheckPhoto(photo);
        const url = URL.createObjectURL(blob), a = document.createElement("a");
        a.href = url; a.download = photo.file_name || "cheque.jpg"; document.body.append(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 4000);
      } catch (error) { tc()?.toast?.(error.message || "No se pudo descargar la foto."); }
      return;
    }
    if (task === "photo-delete") {
      if (kind === "invoice") return tc()?.removeInvoiceCheck?.(id, photo.id);
      if (!confirm("¿Quitar esta foto del cheque?")) return;
      try {
        await (kind === "hours" ? window.CloudDB.removeHoursCheckPhoto(photo) : window.CloudDB.removeJobCheckPhoto(photo));
        record.checkPhotos = record.checkPhotos.filter(item => item.id !== photo.id);
        (kind === "hours" ? window.HoursApp : window.JobApp)?.render?.();
        render();
      } catch (error) { tc()?.toast?.(error.message || "No se pudo quitar la foto."); }
    }
  }
  function upload(kind) {
    if (kind === "check") { openDesk = openDesk === state.chk.tab ? "" : state.chk.tab; return render(); }
    if (kind === "invoice") { tc()?.navClick?.("archive"); return $("#importInvoicesButton")?.click(); }
    tc()?.navClick?.("hours-archive"); $("#importHoursArchiveButton")?.click();
  }
  function onClick(event) {
    const t = event.target;
    const menuBtn = t.closest(".df-menu-btn"); if (menuBtn) return openMenu(menuBtn);
    const a = t.closest("[data-act]");
    if (a) {
      if (a.dataset.act === "passkey") return $("#registerPasskeyButton")?.click();
      if (a.dataset.act.startsWith("photo-")) return photoAction(a.dataset.act, a.dataset.kind, a.dataset.id);
      return act(a.dataset.act, a.dataset.kind, a.dataset.id);
    }
    const up = t.closest("[data-upload]"); if (up) return upload(up.dataset.upload);
    const tab = t.closest("[data-tab]"); if (tab) { state.chk.tab = tab.dataset.tab; state.chk.picked = false; state.chk.all = false; if (openDesk) openDesk = state.chk.tab; return render(); }
    const moreBtn = t.closest("[data-more]"); if (moreBtn) { state.chk.all = !state.chk.all; return render(); }
    const open = t.closest("[data-open]"); if (open) return tc()?.navClick?.(open.dataset.open);
  }
  function onFilter(event) {
    const el = event.target, bar = el.closest("[data-filters]"); if (!bar || !el.dataset.f) return;
    state[bar.dataset.filters][el.dataset.f] = el.value;
    if (el.dataset.f === "year") state[bar.dataset.filters].picked = true;
    if (el.dataset.f === "q") schedule(); else render();
  }

  function boot() {
    // Re-render whenever the boards or the cheque desks redraw (records changed).
    const observer = new MutationObserver(schedule);
    ["#board", "#hoursHomeBoard", "#jobHomeBoard", "#hoursBoard", "#checkDeskStatus", "#hoursCheckDeskStatus", "#jobCheckDeskStatus", "#passkeyStatus", "#registerPasskeyButton"]
      .forEach(sel => { const el = $(sel); if (el) observer.observe(el, { childList: true, characterData: true, subtree: sel.includes("Status") || sel.includes("Passkey") }); });
    const panel = $("#passkeyPanel"); if (panel) observer.observe(panel, { attributes: true, attributeFilter: ["class", "hidden"] });
    window.CompanyApp?.onChange?.(schedule);
    render();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => setTimeout(boot, 0)); else setTimeout(boot, 0);
  return { render: schedule };
})();

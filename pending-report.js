/* "Reporte de pendientes": a live report of the invoices (and hours reports) waiting for a check
   that still have a balance due. The address opens the PDF, the payment column shows the check
   photos. It can be downloaded as a PDF (addresses link to each invoice preview) or shared as a link. */
(function () {
  "use strict";
  const $ = selector => document.querySelector(selector);
  const esc = value => String(value ?? "").replace(/[&<>'"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#039;", '"': "&quot;" }[char]));
  const money = value => `$${Number(value || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const cents = value => Math.round((Number(value) || 0) * 100) / 100;
  const isoDate = value => /^\d{4}-\d{2}-\d{2}/.test(String(value || "")) ? String(value).slice(0, 10) : "";
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const usDate = iso => iso ? `${MONTHS[Number(iso.slice(5, 7)) - 1]} ${Number(iso.slice(8, 10))}, ${iso.slice(0, 4)}` : "No date";
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
  const tc = () => window.TrentonControl;
  const toast = text => tc()?.toast?.(text);
  let tab = "invoice";

  /* ---------- data ---------- */
  function invoiceRows() {
    const C = window.InvoiceCore;
    return (tc()?.records?.() || []).filter(r => r.stage === "waiting").map(r => {
      const total = cents(r.amount);
      const due = cents(C?.owed ? C.owed(r) : Math.max(0, total - Number(r.received || 0)));
      return { kind: "invoice", record: r, label: r.invoiceNumber || "—", date: C?.issuedDate?.(r) || isoDate(r.issuedDate), address: r.address || "", total, due, paid: cents(total - due), photos: r.checkPhotos || [] };
    }).filter(row => row.due > 0.004).sort((a, b) => String(b.label).localeCompare(String(a.label), "en", { numeric: true }));
  }
  function reportRow(r, kind) {
    const stored = Number(r.received || 0) + Number(r.due || 0);
    const calc = (r.entries || []).reduce((sum, e) => sum + Number(e.hours || 0) * Number(e.rate || 0), 0);
    const total = cents(stored > 0 ? stored : calc);
    const received = Math.min(cents(r.received), total);
    const dates = [r.startDate, r.reportDate, ...(r.entries || []).map(e => e.date), r.endDate].map(isoDate).filter(Boolean).sort();
    return { kind, record: r, label: kind === "job" ? "Report" : "Hours", date: dates[dates.length - 1] || "", first: dates[0] || "", address: r.jobAddress || "", total, due: cents(total - received), paid: received, photos: r.checkPhotos || [] };
  }
  const byDate = (a, b) => (b.date || "").localeCompare(a.date || "");
  function hoursRows() {
    return (window.HoursApp?.reports?.() || []).filter(r => r.stage === "waiting" && r.hoursFormat !== "a3" && !String(r.id || "").startsWith("job-"))
      .map(r => reportRow(r, "hours")).filter(row => row.due > 0.004).sort(byDate);
  }
  function jobRows() {
    return (window.JobApp?.reports?.() || []).filter(r => r.stage === "sent").map(r => reportRow(r, "job")).filter(row => row.due > 0.004).sort(byDate);
  }
  const rowsFor = which => which === "invoice" ? invoiceRows() : which === "job" ? jobRows() : hoursRows();
  const toClient = () => window.CompanyApp?.toClient?.() || "a Trenton";
  const summary = rows => ({ count: rows.length, total: rows.reduce((s, r) => s + r.total, 0), due: rows.reduce((s, r) => s + r.due, 0), paid: rows.reduce((s, r) => s + r.paid, 0) });
  const dateText = row => row.first && row.first !== row.date ? `${usDate(row.first)} – ${usDate(row.date)}` : usDate(row.date);
  const photoText = n => n ? `${n} check${n === 1 ? "" : "s"}` : "No photo";

  /* ---------- window ---------- */
  const UI = {
    doc: "M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5M9 12h3M9 15.5h6M9 19h4",
    clock: "M12 3a9 9 0 1 1 0 18a9 9 0 1 1 0-18zM12 7v5l3.2 2",
    send: "M21 3 10 14M21 3l-7 18-4-7-7-4z",
    download: "M12 4v11M7 10l5 5 5-5M5 20h14",
    link: "M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1.1 1.1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1.1-1.1",
    clipboard: "M9 3h6v4H9zM9 5H6.5A1.5 1.5 0 0 0 5 6.5v13A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5v-13A1.5 1.5 0 0 0 17.5 5H15M8.5 11.5h7M8.5 15h5",
    search: "M11 4a7 7 0 1 1 0 14 7 7 0 0 1 0-14zM20 20l-4-4",
    filter: "M3.5 5h17l-6.5 7.5V19l-4 2v-8.5z",
    chevron: "M6 9l6 6 6-6",
    sort: "M8 9.5l4-4 4 4M8 14.5l4 4 4-4",
    calendar: "M4.5 6h15v14h-15zM4.5 10h15M8.5 3.5v4M15.5 3.5v4",
    pin: "M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11zM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z",
    image: "M4.5 5h15v14h-15zM4.5 16l4.5-4.5 4 4 2.5-2.5 4 4M15.2 9.3h.01",
    eye: "M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
    external: "M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5",
    close: "M6 6l12 12M18 6 6 18"
  };
  const icon = (name, cls = "") => `<svg class="pr-i ${cls}" viewBox="0 0 24 24" aria-hidden="true"><path d="${UI[name]}"/></svg>`;
  const DOTS = `<svg class="pr-i" viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg>`;
  // Search, filter and sort of the details table (per open window).
  const view = { q: "", filter: "all", sort: { key: "", dir: 1 } };
  const FILTERS = [["all", "All"], ["photo", "With check photo"], ["nophoto", "No photo"]];
  const SORTS = { label: r => String(r.label), date: r => r.date || "", total: r => r.total, due: r => r.due };
  const tabTitle = which => which === "invoice" ? "Pending Invoices Report" : which === "job" ? "Pending Reports Report" : "Pending Hours Report";
  const noun = which => which === "invoice" ? "invoices" : "reports";
  const sentLabel = () => window.CompanyApp?.isOtras?.() ? "Sent to client" : "Sent to Trenton";

  let panel = null, thumbUrls = [];
  function build() {
    panel = document.createElement("div");
    panel.className = "pending-report";
    panel.hidden = true;
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-modal", "true");
    panel.setAttribute("aria-labelledby", "pendingReportTitle");
    panel.innerHTML = `<section class="pr-card">
      <div class="pr-scroll">
        <header class="pr-brand">
          <img class="pr-logo" src="assets/logo-ruben-clear.png" alt="">
          <div class="pr-brand-text"><strong>Ruben Perla</strong><span>Invoice Control</span></div>
          <button type="button" class="pr-close" aria-label="Cerrar">${icon("close")}</button>
        </header>
        <div class="pr-titlebar">
          <span class="pr-title-ico">${icon("doc")}</span>
          <div><h2 id="pendingReportTitle">Pending Invoices Report</h2><p class="pr-sub">Summary of invoices awaiting payment by check · All amounts in USD</p></div>
        </div>
        <div class="pr-bar">
          <div class="pr-tabs" role="tablist">
            <button type="button" role="tab" data-pr-tab="invoice">${icon("doc")}<span>Invoices</span></button>
            <button type="button" role="tab" data-pr-tab="hours">${icon("clock")}<span>Hours</span></button>
            <button type="button" role="tab" data-pr-tab="job">${icon("send")}<span class="pr-sent">Sent to Trenton</span></button>
          </div>
          <div class="pr-actions">
            <button type="button" class="pr-btn" data-pr-act="pdf">${icon("download")}<span>Download PDF</span></button>
            <button type="button" class="pr-btn is-primary" data-pr-act="link">${icon("link")}<span>Copy report link</span></button>
          </div>
        </div>
        <div class="pr-body"></div>
      </div>
    </section>`;
    document.body.append(panel);
    panel.addEventListener("click", onClick);
    panel.addEventListener("input", event => {
      if (!event.target.matches(".pr-search input")) return;
      view.q = event.target.value;
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => renderTable(true), 120);
    });
    document.addEventListener("click", event => { if (!event.target.closest?.(".pr-pop, [data-pr-filters], [data-pr-more]")) closePops(); });
    document.addEventListener("keydown", event => {
      // The PDF and check viewers sit above this window and close first.
      if (event.key !== "Escape" || panel.hidden) return;
      if (document.querySelector(".pr-pop")) return closePops();
      if (!document.querySelector(".check-viewer:not([hidden]), .pdf-viewer:not([hidden]), dialog[open]")) close();
    });
  }
  let searchTimer = 0;
  function open(which) {
    if (!panel) build();
    if (which && which !== tab) { tab = which; resetView(); }
    panel.hidden = false;
    document.body.classList.add("pr-open");
    render();
  }
  function close() {
    if (!panel) return;
    closePops();
    panel.hidden = true;
    document.body.classList.remove("pr-open");
    thumbUrls.splice(0).forEach(url => URL.revokeObjectURL(url));
  }
  function resetView() { view.q = ""; view.filter = "all"; view.sort = { key: "", dir: 1 }; }

  // Rows of the table after search, filter and sort (the summary cards use all rows).
  function visibleRows(rows) {
    const q = view.q.trim().toLowerCase().replace(/[$,]/g, "");
    let list = rows.filter(r => view.filter === "all" || (view.filter === "photo" ? r.photos.length : !r.photos.length));
    if (q) list = list.filter(r => [r.label, r.address, dateText(r), r.total.toFixed(2), r.due.toFixed(2)].join(" ").toLowerCase().replace(/[$,]/g, "").includes(q));
    if (view.sort.key) {
      const get = SORTS[view.sort.key];
      list = [...list].sort((a, b) => { const x = get(a), y = get(b); return (typeof x === "number" ? x - y : String(x).localeCompare(String(y), "en", { numeric: true })) * view.sort.dir; });
    }
    return list;
  }
  function render() {
    if (!panel || panel.hidden) return;
    const rows = rowsFor(tab), s = summary(rows), isInv = tab === "invoice";
    panel.querySelector("#pendingReportTitle").textContent = tabTitle(tab);
    panel.querySelector(".pr-sub").textContent = `Summary of ${isInv ? "invoices" : tab === "job" ? "reports sent" : "hours reports"} awaiting payment by check · All amounts in USD`;
    panel.querySelector(".pr-sent").textContent = sentLabel();
    panel.querySelectorAll("[data-pr-tab]").forEach(b => { b.classList.toggle("is-active", b.dataset.prTab === tab); b.setAttribute("aria-selected", String(b.dataset.prTab === tab)); });
    const filterLabel = FILTERS.find(([id]) => id === view.filter)?.[1] || "All";
    panel.querySelector(".pr-body").innerHTML = `
      <div class="pr-summary">${summaryHtml(isInv, s)}</div>
      <div class="pr-details-head">
        <h3 class="pr-h3">${icon("clipboard")}<span>${isInv ? "Invoice Details" : "Report Details"}</span></h3>
        <div class="pr-tools">
          <label class="pr-search">${icon("search")}<input type="search" placeholder="Search ${isInv ? "invoice" : "report"}, address or amount…" value="${esc(view.q)}" aria-label="Buscar"></label>
          <button type="button" class="pr-filter-btn${view.filter !== "all" ? " is-on" : ""}" data-pr-filters aria-haspopup="true">${icon("filter")}<span>${view.filter === "all" ? "Filters" : esc(filterLabel)}</span>${icon("chevron", "pr-chev")}</button>
        </div>
      </div>
      <div class="pr-table-slot"></div>`;
    renderTable(false);
  }
  // Redraws only the table, so typing in the search box keeps its focus.
  function renderTable() {
    const slot = panel.querySelector(".pr-table-slot");
    if (!slot) return;
    const all = rowsFor(tab), rows = visibleRows(all), isInv = tab === "invoice";
    const sortHead = (key, label, cls = "") => {
      const on = view.sort.key === key;
      return `<th class="${cls}"><button type="button" class="pr-sort${on ? " is-on" : ""}" data-pr-sort="${key}">${label}${icon("sort", on ? (view.sort.dir > 0 ? "is-asc" : "is-desc") : "")}</button></th>`;
    };
    const body = rows.map(r => {
      const hasPdf = Boolean(r.record.pdfBlob || r.record.pdfPath);
      const id = esc(r.record.id);
      return `<tr>
        <td data-l="${isInv ? "Invoice" : "Report"}"><span class="pr-pill">${esc(r.label)}</span></td>
        <td data-l="Date"><span class="pr-date-cell">${icon("calendar")}${esc(dateText(r))}</span></td>
        <td class="pr-addr" data-l="Job address">${icon("pin", "pr-pin")}${hasPdf
          ? `<button type="button" class="pr-link" data-pr-view="${id}" title="Ver PDF">${esc(r.address || "Sin dirección")}${icon("external")}</button>`
          : `<span>${esc(r.address || "Sin dirección")}</span>`}</td>
        <td class="pr-num" data-l="${isInv ? "Invoice total" : "Total"}">${money(r.total)}</td>
        <td class="pr-num" data-l="Balance due"><span class="pr-due-pill">${money(r.due)}</span></td>
        <td data-l="Payment record">${r.photos.length
          ? `<button type="button" class="pr-checks check-view" data-check-kind="${r.kind}" data-id="${id}" title="Ver cheques"><span class="pr-thumb" data-photo="${esc(r.photos[0].id)}"></span><span>${photoText(r.photos.length)}</span></button>`
          : `<span class="pr-nophoto">${icon("image")}No photo</span>`}</td>
        <td class="pr-row-actions" data-l="Actions">
          <button type="button" class="pr-icon-btn" data-pr-view="${id}" title="Ver PDF" aria-label="Ver PDF"${hasPdf ? "" : " disabled"}>${icon("eye")}</button>
          <button type="button" class="pr-icon-btn" data-pr-more="${id}" title="Más opciones" aria-label="Más opciones" aria-haspopup="true">${DOTS}</button>
        </td>
      </tr>`;
    }).join("");
    const shownDue = rows.reduce((sum, r) => sum + r.due, 0);
    slot.innerHTML = !all.length
      ? `<p class="pr-empty">No hay ${isInv ? "invoices" : "reportes"} en Esperando cheque con saldo pendiente.</p>`
      : `<div class="pr-table-wrap"><table class="pr-table"><thead><tr>
          ${sortHead("label", isInv ? "Invoice" : "Report")}${sortHead("date", "Date")}<th>Job Address</th>${sortHead("total", isInv ? "Invoice Total" : "Total", "pr-num")}${sortHead("due", "Balance Due", "pr-num")}<th>Payment Record</th><th class="pr-actions-head">Actions</th>
        </tr></thead><tbody>${body || `<tr class="pr-none"><td colspan="7">No ${noun(tab)} match this search.</td></tr>`}</tbody></table></div>
        <div class="pr-foot">
          <span>Showing ${rows.length ? `1–${rows.length}` : "0"} of ${all.length} ${noun(tab)}</span>
          <span class="pr-total-pill">Total Pending: <strong>${money(shownDue)}</strong></span>
        </div>
        <p class="pr-note">Report date: ${usDate(today())} · Tap an address or 👁 to see its PDF, and a check to see the photos.</p>`;
    loadThumbs(rows);
  }
  async function loadThumbs(rows) {
    thumbUrls.splice(0).forEach(url => URL.revokeObjectURL(url));
    for (const row of rows) for (const photo of row.photos.slice(0, 1)) {
      const slot = panel.querySelector(`.pr-thumb[data-photo="${CSS.escape(photo.id)}"]`);
      if (!slot) continue;
      try {
        const blob = photo.blob || await window.CloudDB?.ensureCheckPhoto?.(photo);
        if (!blob || !slot.isConnected) continue;
        const url = URL.createObjectURL(blob); thumbUrls.push(url);
        slot.style.backgroundImage = `url("${url}")`;
      } catch (_) { /* thumbnail is optional */ }
    }
  }

  /* ---------- popups: filters and row options ---------- */
  function closePops() { document.querySelectorAll(".pr-pop").forEach(pop => pop.remove()); }
  function popAt(button, html, onPick) {
    const already = document.querySelector(".pr-pop")?.dataset.for === (button.dataset.prMore || "filters");
    closePops();
    if (already) return;
    const pop = document.createElement("div");
    pop.className = "pr-pop";
    pop.dataset.for = button.dataset.prMore || "filters";
    pop.setAttribute("role", "menu");
    pop.innerHTML = html;
    document.body.append(pop);
    const box = button.getBoundingClientRect();
    const left = Math.max(8, Math.min(box.right - pop.offsetWidth, document.documentElement.clientWidth - pop.offsetWidth - 8));
    const below = box.bottom + 6 + pop.offsetHeight < window.innerHeight;
    pop.style.left = `${left}px`;
    pop.style.top = `${below ? box.bottom + 6 : Math.max(8, box.top - pop.offsetHeight - 6)}px`;
    pop.addEventListener("click", event => { const item = event.target.closest("[data-pick]"); if (!item) return; closePops(); onPick(item.dataset.pick); });
  }
  function openFilters(button) {
    popAt(button, FILTERS.map(([id, label]) => `<button type="button" role="menuitemradio" aria-checked="${view.filter === id}" class="${view.filter === id ? "is-on" : ""}" data-pick="${id}">${label}</button>`).join(""), id => { view.filter = id; render(); });
  }
  function openMore(button) {
    const row = rowsFor(tab).find(r => r.record.id === button.dataset.prMore);
    if (!row) return;
    const hasPdf = Boolean(row.record.pdfBlob || row.record.pdfPath);
    const items = [hasPdf && ["pdf", "Ver PDF"], hasPdf && ["link", "Copiar link de vista previa"], row.photos.length && ["checks", "Ver cheques"], ["edit", "Editar datos"]].filter(Boolean);
    popAt(button, items.map(([id, label]) => `<button type="button" role="menuitem" data-pick="${id}">${label}</button>`).join(""), id => {
      if (id === "pdf") return archiveOf(row.kind)?.view?.(row.record);
      if (id === "link") return window.ShareLink?.copy(row.kind, row.record);
      if (id === "checks") return panel.querySelector(`.check-view[data-id="${CSS.escape(row.record.id)}"]`)?.click();
      if (id === "edit") {
        // The edit windows sit below this one.
        close();
        return row.kind === "invoice" ? tc()?.edit?.(row.record) : row.kind === "hours" ? window.HoursApp?.edit?.(row.record) : window.JobApp?.edit?.(row.record);
      }
    });
  }

  const archiveOf = kind => kind === "invoice" ? tc()?.archive : kind === "hours" ? tc()?.hoursArchive : tc()?.jobArchive;
  async function onClick(event) {
    const t = event.target;
    if (t === panel || t.closest(".pr-close")) return close();
    const tabBtn = t.closest("[data-pr-tab]");
    if (tabBtn) { if (tabBtn.dataset.prTab !== tab) { tab = tabBtn.dataset.prTab; resetView(); } return render(); }
    const sortBtn = t.closest("[data-pr-sort]");
    if (sortBtn) {
      const key = sortBtn.dataset.prSort;
      view.sort = view.sort.key === key ? (view.sort.dir > 0 ? { key, dir: -1 } : { key: "", dir: 1 }) : { key, dir: 1 };
      return renderTable();
    }
    const filterBtn = t.closest("[data-pr-filters]"); if (filterBtn) return openFilters(filterBtn);
    const more = t.closest("[data-pr-more]"); if (more) return openMore(more);
    const viewBtn = t.closest("[data-pr-view]");
    if (viewBtn) { const row = rowsFor(tab).find(r => r.record.id === viewBtn.dataset.prView); return row && archiveOf(row.kind)?.view?.(row.record); }
    const act = t.closest("[data-pr-act]");
    if (act) {
      act.disabled = true;
      try { act.dataset.prAct === "pdf" ? await downloadPdf() : await shareLink(); }
      finally { act.disabled = false; }
    }
  }

  /* ---------- summary cards (window + PDF) ---------- */
  // tile: icon square, fg: icon/chart color, border: card edge, wash: soft corner glow.
  const TONES = {
    orange: { tile: "#fdecdd", fg: "#d9741f", border: "#f8e3d2", wash: "#fde3cc", chart: "#f7c08a" },
    purple: { tile: "#eeecfd", fg: "#6c5ce7", border: "#e6e3fb", wash: "#e4e0fb", chart: "#7c6cf0" },
    plum: { tile: "#fbe9f1", fg: "#a8467e", border: "#f5dde8", wash: "#f9dbe8", chart: "#b05088" },
    green: { tile: "#e2f6ec", fg: "#1f9d61", border: "#d8f0e3", wash: "#d4f1e2", chart: "#8fd8b2" }
  };
  // 24 x 24 stroke icons: document, dollar sign, clock, check circle.
  const ICONS = {
    doc: "M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5M9 12h3M9 15.5h6M9 19h4",
    dollar: "M16.5 7.5C15.8 6 14.1 5 12 5c-2.8 0-4.5 1.4-4.5 3.3 0 4.3 9 2.4 9 7 0 1.9-1.9 3.4-4.5 3.4-2.3 0-4.1-1-4.8-2.6M12 2.5v19",
    clock: "M12 3a9 9 0 1 1 0 18a9 9 0 1 1 0-18zM12 7v5l3.2 2",
    check: "M12 3a9 9 0 1 1 0 18a9 9 0 1 1 0-18zM8 12.4l2.7 2.7L16.2 9.6"
  };
  const SUMMARY_CARDS = (isInv, s) => [
    { label: isInv ? "PENDING INVOICES" : "PENDING REPORTS", value: String(s.count), caption: isInv ? "Invoices waiting for payment" : "Reports waiting for payment", tone: "orange", icon: "doc", chart: "bars" },
    { label: "TOTAL INVOICED", value: money(s.total), caption: "Total amount invoiced", tone: "purple", icon: "dollar", chart: "line" },
    { label: "OUTSTANDING BALANCE", value: money(s.due), caption: "Amount pending to be paid", tone: "plum", icon: "clock", chart: "line" },
    { label: "AMOUNT PAID", value: money(s.paid), caption: "Confirmed payments", tone: "green", icon: "check", chart: "bars" }
  ];
  // Small decorative charts, drawn in a 64 x 40 box.
  const CHART_LINE = "M2 36C10 22 18 18 26 24S40 32 48 22 58 8 62 4";
  const CHART_BARS = [[4, 26, 10, 14], [20, 16, 10, 24], [36, 4, 10, 36]];
  function summaryHtml(isInv, s) {
    return SUMMARY_CARDS(isInv, s).map(c => {
      const t = TONES[c.tone];
      const chart = c.chart === "bars"
        ? CHART_BARS.map(([x, y, w, h]) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="3"/>`).join("")
        : `<path d="${CHART_LINE}" fill="none"/><circle cx="62" cy="4" r="3.2"/>`;
      return `<div class="pr-card-sum is-${c.chart}" style="--t-tile:${t.tile};--t-fg:${t.fg};--t-border:${t.border};--t-wash:${t.wash};--t-chart:${t.chart}">
        <span class="pr-ico"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="${ICONS[c.icon]}"/></svg></span>
        <div class="pr-sum-text"><span class="pr-lbl">${c.label.toLowerCase().replace(/(^|\s)\w/g, m => m.toUpperCase())}</span><strong>${c.value}</strong><small>${c.caption}</small></div>
        <svg class="pr-chart" viewBox="0 0 66 42" aria-hidden="true">${chart}</svg>
      </div>`;
    }).join("");
  }

  /* ---------- PDF ---------- */
  const safe = text => String(text ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[–—]/g, "-").replace(/[^\x20-\x7E]/g, " ");
  // Logo bytes for the PDF header (same file the invoices use).
  let logoBytes = null;
  function loadLogo() {
    if (logoBytes) return Promise.resolve(logoBytes);
    return new Promise(resolve => {
      const xhr = new XMLHttpRequest();
      xhr.open("GET", "assets/logo-ruben-clear.png");
      xhr.responseType = "arraybuffer";
      xhr.onload = () => { logoBytes = xhr.status === 200 || (xhr.status === 0 && xhr.response) ? new Uint8Array(xhr.response) : null; resolve(logoBytes); };
      xhr.onerror = () => resolve(null);
      xhr.send();
    });
  }
  // Who sends the report: the "De" fields of the invoice builder, with Ruben's defaults.
  function sender() {
    const val = (id, fallback) => (document.getElementById(id)?.value || "").trim() || fallback;
    return {
      name: val("builderFromName", "Ruben Perla"),
      phone: val("builderFromPhone", "+1 (469) 650-4958"),
      email: val("builderFromEmail", "pr391665@gmail.com"),
      client: window.CompanyApp?.isOtras?.() ? "" : "Trenton Builders LLC"
    };
  }
  async function makePdf(rows, which, withLinks) {
    const L = window.PDFLib;
    if (!L) throw new Error("Falta la librería de PDF. Recarga la página.");
    const isInv = which === "invoice";
    const doc = await L.PDFDocument.create();
    const font = await doc.embedFont(L.StandardFonts.Helvetica), bold = await doc.embedFont(L.StandardFonts.HelveticaBold);
    const rgb = hex => L.rgb(parseInt(hex.slice(1, 3), 16) / 255, parseInt(hex.slice(3, 5), 16) / 255, parseInt(hex.slice(5, 7), 16) / 255);
    const INK = rgb("#1f2340"), MUTED = rgb("#6b6f85"), SOFT = rgb("#9a9db0"), LINE = rgb("#ece6df"), ZEBRA = rgb("#fcf7f2"),
      HEAD = rgb("#f6e6d6"), ACCENT = rgb("#e2602a"), RED = rgb("#c0392b"), GREEN = rgb("#23874a"), BLUE = rgb("#3d4fd6"), WHITE = rgb("#ffffff");
    const W = 792, H = 612, M = 40, RIGHT = W - M;
    const s = summary(rows), from = sender();
    const title = isInv ? "PENDING INVOICES REPORT" : which === "job" ? "PENDING REPORTS" : "PENDING HOURS REPORT";

    let logo = null;
    try { const bytes = await loadLogo(); if (bytes) logo = await doc.embedPng(bytes); } catch (_) { logo = null; }

    // Links (best effort): each address opens its PDF preview, each payment record its first check photo.
    const links = new Map();
    if (withLinks) await Promise.all(rows.map(async (row, i) => {
      const item = {};
      try { if (row.record.pdfPath) item.pdf = await window.ShareLink.link(row.kind, row.record); } catch (_) {}
      try { if (row.photos[0]?.storage_path) item.photo = await window.CloudDB.signedUrl("check-photos", row.photos[0].storage_path, window.ShareLink.days * 24 * 3600); } catch (_) {}
      links.set(i, item);
    }));
    const addLink = (page, x, y, w, h, url) => {
      if (!url) return;
      const annot = doc.context.obj({ Type: "Annot", Subtype: "Link", Rect: [x, y, x + w, y + h], Border: [0, 0, 0], A: { Type: "Action", S: "URI", URI: L.PDFString.of(url) } });
      page.node.addAnnot(doc.context.register(annot));
    };
    const width = (t, f, size) => f.widthOfTextAtSize(t, size);
    const fit = (text, f, size, max) => { let t = safe(text); if (width(t, f, size) <= max) return t; while (t.length > 1 && width(t + "...", f, size) > max) t = t.slice(0, -1); return t + "..."; };
    // Up to two lines; the second one ends in "..." if it still does not fit.
    const wrap2 = (text, f, size, max) => {
      const words = safe(text).split(/\s+/).filter(Boolean), lines = [""];
      for (const word of words) {
        const next = lines[lines.length - 1] ? lines[lines.length - 1] + " " + word : word;
        if (width(next, f, size) <= max || !lines[lines.length - 1]) lines[lines.length - 1] = next;
        else if (lines.length < 2) lines.push(word);
        else { lines[1] = fit(lines[1] + " " + word, f, size, max); break; }
      }
      return lines.map(line => fit(line, f, size, max));
    };
    const rightText = (page, text, xRight, y, size, f, color) => page.drawText(text, { x: xRight - width(text, f, size), y, size, font: f, color });
    const roundRect = (page, x, top, w, h, r, opts) => page.drawSvgPath(`M${r},0 H${w - r} Q${w},0 ${w},${r} V${h - r} Q${w},${h} ${w - r},${h} H${r} Q0,${h} 0,${h - r} V${r} Q0,0 ${r},0 Z`, { x, y: top, ...opts });

    // Columns: [x, width, align]
    const cols = isInv
      ? [[M, 64, "l"], [M + 64, 96, "l"], [M + 160, 270, "l"], [M + 430, 96, "r"], [M + 526, 96, "r"], [M + 622, RIGHT - (M + 622), "l"]]
      : [[M, 60, "l"], [M + 60, 118, "l"], [M + 178, 262, "l"], [M + 440, 92, "r"], [M + 532, 92, "r"], [M + 624, RIGHT - (M + 624), "l"]];
    const heads = [isInv ? "INVOICE" : "REPORT", "DATE", "JOB ADDRESS", isInv ? "INVOICE TOTAL" : "TOTAL", "BALANCE DUE", "PAYMENT RECORD"];
    const PAD = 10;
    const cellX = (i, text, f, size) => cols[i][2] === "r" ? cols[i][0] + cols[i][1] - PAD - width(text, f, size) : cols[i][0] + PAD;

    let page, y;
    const tableHead = () => {
      roundRect(page, M, y, RIGHT - M, 26, 6, { color: HEAD });
      heads.forEach((h, i) => page.drawText(h, { x: cellX(i, h, bold, 7.5), y: y - 16.5, size: 7.5, font: bold, color: INK }));
      y -= 26;
    };
    const newPage = first => {
      page = doc.addPage([W, H]);
      y = H - M;
      if (first) {
        // Header: logo + sender on the left, title + date on the right.
        let logoH = 0;
        if (logo) {
          const factor = Math.min(150 / logo.width, 54 / logo.height);
          logoH = logo.height * factor;
          page.drawImage(logo, { x: M - 6, y: y - logoH, width: logo.width * factor, height: logoH });
        }
        const infoY = y - Math.max(logoH, 40) - 14;
        page.drawText(safe(from.name), { x: M, y: infoY, size: 10, font: bold, color: INK });
        page.drawText(safe(`${from.phone}   |   ${from.email}`), { x: M, y: infoY - 13, size: 8.5, font, color: MUTED });
        rightText(page, title, RIGHT, y - 22, 22, bold, INK);
        rightText(page, `Summary of ${isInv ? "invoices" : "reports"} awaiting payment by check - All amounts in USD`, RIGHT, y - 38, 9, font, MUTED);
        rightText(page, `Report date: ${usDate(today())}`, RIGHT, y - 56, 9, bold, INK);
        if (from.client) rightText(page, `Bill to: ${from.client}`, RIGHT, y - 69, 9, font, MUTED);
        y = infoY - 26;
        page.drawRectangle({ x: M, y, width: RIGHT - M, height: 2.5, color: ACCENT });
        y -= 22;

        // Summary cards: white card, soft corner wash, tinted icon tile, small decorative chart.
        const gap = 12, cardW = (RIGHT - M - gap * 3) / 4, cardH = 84;
        SUMMARY_CARDS(isInv, s).forEach((card, i) => {
          const x = M + i * (cardW + gap), tone = TONES[card.tone], fg = rgb(tone.fg);
          roundRect(page, x, y, cardW, cardH, 12, { color: WHITE, borderColor: rgb(tone.border), borderWidth: 0.8 });
          const w = cardW, h = cardH;
          page.drawSvgPath(`M${w * .38},${h} C${w * .62},${h - 2} ${w * .78},${h * .62} ${w},${h * .3} V${h - 12} Q${w},${h} ${w - 12},${h} Z`, { x, y, color: rgb(tone.wash), opacity: 0.55 });
          roundRect(page, x + 12, y - 12, 30, 30, 8, { color: rgb(tone.tile) });
          page.drawSvgPath(ICONS[card.icon], { x: x + 19, y: y - 19, scale: 16 / 24, borderColor: fg, borderWidth: 1.5 });
          const tx = x + 52;
          page.drawText(card.label, { x: tx, y: y - 23, size: 7, font, color: MUTED });
          page.drawText(card.value, { x: tx, y: y - 43, size: 16, font: bold, color: INK });
          page.drawText(card.caption, { x: tx, y: y - 58, size: 6.8, font, color: SOFT });
          // Chart box: 30 x 19 pt in the bottom-right corner (from a 64 x 40 drawing).
          const k = 30 / 64, cx = x + w - 40, ctop = y - 60;
          if (card.chart === "bars") CHART_BARS.forEach(([bx, by, bw, bh]) => page.drawRectangle({ x: cx + bx * k, y: ctop - (by + bh) * k, width: bw * k, height: bh * k, color: rgb(tone.chart), opacity: 0.75 }));
          else {
            page.drawSvgPath(CHART_LINE, { x: cx, y: ctop, scale: k, borderColor: rgb(tone.chart), borderWidth: 1.2 });
            page.drawCircle({ x: cx + 62 * k, y: ctop - 4 * k, size: 2, color: rgb(tone.chart) });
          }
        });
        y -= cardH + 22;
        page.drawText(isInv ? "INVOICE DETAILS" : "REPORT DETAILS", { x: M, y, size: 12, font: bold, color: INK });
        y -= 12;
      }
      tableHead();
    };

    newPage(true);
    const SIZE = 9.5;
    rows.forEach((row, i) => {
      const link = links.get(i) || {};
      const addrLines = wrap2(row.address || "No address", font, SIZE, cols[2][1] - PAD * 2);
      const rowH = addrLines.length > 1 ? 34 : 25;
      if (y - rowH < M + 40) { newPage(false); }
      if (i % 2 === 1) page.drawRectangle({ x: M, y: y - rowH, width: RIGHT - M, height: rowH, color: ZEBRA });
      page.drawLine({ start: { x: M, y: y - rowH }, end: { x: RIGHT, y: y - rowH }, thickness: .6, color: LINE });
      const ty = y - (rowH === 25 ? 16 : 14.5);
      const mid = y - rowH / 2 - 3.5;
      page.drawText(fit(row.label, bold, SIZE, cols[0][1] - PAD * 2), { x: cellX(0, "", bold, SIZE), y: mid, size: SIZE, font: bold, color: INK });
      page.drawText(fit(dateText(row), font, SIZE, cols[1][1] - PAD * 2), { x: cellX(1, "", font, SIZE), y: mid, size: SIZE, font, color: INK });
      addrLines.forEach((line, n) => {
        const ly = ty - n * 12.5, lx = cols[2][0] + PAD;
        page.drawText(line, { x: lx, y: ly, size: SIZE, font, color: link.pdf ? BLUE : INK });
        if (link.pdf) {
          const w = width(line, font, SIZE);
          page.drawLine({ start: { x: lx, y: ly - 2 }, end: { x: lx + w, y: ly - 2 }, thickness: .5, color: BLUE });
          addLink(page, lx, ly - 4, w, 14, link.pdf);
        }
      });
      const total = money(row.total), due = money(row.due);
      page.drawText(total, { x: cellX(3, total, font, SIZE), y: mid, size: SIZE, font, color: INK });
      page.drawText(due, { x: cellX(4, due, bold, SIZE), y: mid, size: SIZE, font: bold, color: RED });
      const rec = photoText(row.photos.length);
      page.drawText(rec, { x: cellX(5, rec, font, SIZE), y: mid, size: SIZE, font, color: link.photo ? BLUE : SOFT });
      if (link.photo) addLink(page, cellX(5, rec, font, SIZE), mid - 4, width(rec, font, SIZE), 14, link.photo);
      y -= rowH;
    });
    if (!rows.length) { page.drawText("No pending items.", { x: M + PAD, y: y - 18, size: 10, font, color: MUTED }); y -= 28; }
    else {
      // Totals row.
      // Keep room for the totals row, the note and the footer.
      if (y - 30 < 72) newPage(false);
      roundRect(page, M, y - 4, RIGHT - M, 26, 6, { color: HEAD });
      page.drawText("TOTAL", { x: cols[0][0] + PAD, y: y - 21, size: 9.5, font: bold, color: INK });
      const t = money(s.total), d = money(s.due);
      page.drawText(t, { x: cellX(3, t, bold, 9.5), y: y - 21, size: 9.5, font: bold, color: INK });
      page.drawText(d, { x: cellX(4, d, bold, 9.5), y: y - 21, size: 9.5, font: bold, color: RED });
      y -= 30;
    }
    if (y - 24 < 44) newPage(false);
    page.drawText("Note:", { x: M, y: y - 24, size: 9, font: bold, color: INK });
    page.drawText(safe(`Only ${isInv ? "invoices" : "reports"} waiting for a check with an outstanding balance are included.${withLinks ? " Click an address to open its PDF." : ""}`), { x: M + 30, y: y - 24, size: 9, font, color: MUTED });

    // Footer on every page.
    const pages = doc.getPages();
    pages.forEach((p, n) => {
      p.drawLine({ start: { x: M, y: 30 }, end: { x: RIGHT, y: 30 }, thickness: .6, color: LINE });
      p.drawText(safe(`${from.name} - ${title.toLowerCase().replace(/^\w|\s\w/g, c => c.toUpperCase())}`), { x: M, y: 18, size: 8, font, color: SOFT });
      const label = `Page ${n + 1} of ${pages.length}`;
      p.drawText(label, { x: RIGHT - width(label, font, 8), y: 18, size: 8, font, color: SOFT });
    });
    return new Blob([await doc.save()], { type: "application/pdf" });
  }
  const fileName = which => `pending-${which === "invoice" ? "invoices" : "hours"}-${today()}.pdf`;
  async function downloadPdf() {
    try {
      toast("Preparando el PDF…");
      const blob = await makePdf(rowsFor(tab), tab, true);
      if (tc()?.download) tc().download(blob, fileName(tab), { share: true });
      else { const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: fileName(tab) }); a.click(); }
    } catch (error) { toast(error.message || "No se pudo crear el PDF."); }
  }
  async function shareLink() {
    try {
      toast("Creando el link del reporte…");
      const rows = rowsFor(tab);
      const blob = await makePdf(rows, tab, true);
      const stored = await window.CloudDB.uploadReportPdf(blob, fileName(tab));
      const s = summary(rows);
      const url = await window.ShareLink.fromPath(stored.bucket, stored.path, tab === "invoice" ? "Pending invoices report" : "Pending hours report", `${s.count} pending · ${money(s.due)} due · ${usDate(today())}`);
      await window.ShareLink.copyText(url, `Link del reporte copiado. Sirve ${window.ShareLink.days} días.`);
    } catch (error) { toast(error.message || "No se pudo crear el link."); }
  }

  /* ---------- button next to the search ---------- */
  // One button per board: invoices, hours and the reports sent to Trenton.
  const BOARDS = [["#board", "invoice"], ["#hoursHomeBoard", "hours"], ["#jobHomeBoard", "job"]];
  function mountButton() {
    BOARDS.forEach(([boardSel, which]) => {
      const controls = $(boardSel)?.closest(".board-section")?.querySelector(".toolbar-controls");
      if (!controls || controls.querySelector(".pr-open-btn")) return;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "pr-open-btn";
      button.dataset.prWhich = which;
      button.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5M9 13h6M9 17h4"/></svg><span>Reporte de pendientes</span><b class="pr-count"></b>`;
      button.addEventListener("click", () => open(which));
      controls.prepend(button);
    });
    updateCount();
  }
  function updateCount() {
    document.querySelectorAll(".pr-open-btn[data-pr-which]").forEach(button => {
      const badge = button.querySelector(".pr-count"), n = rowsFor(button.dataset.prWhich).length;
      badge.textContent = n ? String(n) : ""; badge.hidden = !n;
    });
  }
  function boot() {
    mountButton();
    // Keep the count and an open report up to date when the boards redraw.
    let timer = 0;
    const refresh = () => { clearTimeout(timer); timer = setTimeout(() => { updateCount(); render(); }, 120); };
    ["#board", "#hoursHomeBoard", "#jobHomeBoard"].forEach(sel => { const el = $(sel); if (el) new MutationObserver(refresh).observe(el, { childList: true }); });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => setTimeout(boot, 0)); else setTimeout(boot, 0);
  window.PendingReport = { open, close, render };
})();

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
  let panel = null, thumbUrls = [];
  function build() {
    panel = document.createElement("div");
    panel.className = "pending-report";
    panel.hidden = true;
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-modal", "true");
    panel.setAttribute("aria-labelledby", "pendingReportTitle");
    panel.innerHTML = `<section class="pr-card">
      <header class="pr-head">
        <div><h2 id="pendingReportTitle">PENDING INVOICES REPORT</h2><p class="pr-sub">Summary of invoices awaiting payment by check · All amounts in USD</p></div>
        <button type="button" class="pr-close" aria-label="Cerrar">×</button>
      </header>
      <div class="pr-bar">
        <div class="pr-tabs" role="tablist"><button type="button" role="tab" data-pr-tab="invoice">Invoices</button><button type="button" role="tab" data-pr-tab="hours">Horas</button><button type="button" role="tab" data-pr-tab="job">Enviados a Trenton</button></div>
        <div class="pr-actions"><button type="button" class="pr-btn" data-pr-act="pdf">Descargar PDF</button><button type="button" class="pr-btn is-primary" data-pr-act="link">Copiar link del reporte</button></div>
      </div>
      <div class="pr-body"></div>
    </section>`;
    document.body.append(panel);
    panel.addEventListener("click", onClick);
    document.addEventListener("keydown", event => {
      // The PDF and check viewers sit above this window and close first.
      if (event.key === "Escape" && !panel.hidden && !document.querySelector(".check-viewer:not([hidden]), .pdf-viewer:not([hidden]), dialog[open]")) close();
    });
  }
  function open(which) {
    if (!panel) build();
    if (which) tab = which;
    panel.hidden = false;
    document.body.classList.add("pr-open");
    render();
  }
  function close() {
    if (!panel) return;
    panel.hidden = true;
    document.body.classList.remove("pr-open");
    thumbUrls.splice(0).forEach(url => URL.revokeObjectURL(url));
  }
  function render() {
    if (!panel || panel.hidden) return;
    const rows = rowsFor(tab), s = summary(rows), isInv = tab === "invoice";
    panel.querySelector("#pendingReportTitle").textContent = isInv ? "PENDING INVOICES REPORT" : "PENDING HOURS REPORT";
    panel.querySelector(".pr-sub").textContent = `Summary of ${isInv ? "invoices" : "hours reports"} awaiting payment by check · All amounts in USD`;
    const jobTab = panel.querySelector('[data-pr-tab="job"]'); if (jobTab) jobTab.textContent = `Enviados ${toClient()}`;
    panel.querySelectorAll("[data-pr-tab]").forEach(b => { b.classList.toggle("is-active", b.dataset.prTab === tab); b.setAttribute("aria-selected", String(b.dataset.prTab === tab)); });
    const body = rows.map((r, i) => `<tr>
        <td class="pr-strong" data-l="${isInv ? "Invoice" : "Report"}">${esc(r.label)}</td>
        <td data-l="Date">${esc(dateText(r))}</td>
        <td class="pr-addr" data-l="Job address">${r.record.pdfBlob || r.record.pdfPath
          ? `<button type="button" class="pr-link" data-pr-view="${i}" title="Ver PDF">${esc(r.address || "Sin dirección")}<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg></button>`
          : esc(r.address || "Sin dirección")}</td>
        <td data-l="${isInv ? "Invoice total" : "Total"}">${money(r.total)}</td>
        <td class="pr-due" data-l="Balance due">${money(r.due)}</td>
        <td data-l="Payment record">${r.photos.length
          ? `<button type="button" class="pr-checks check-view" data-check-kind="${r.kind}" data-id="${esc(r.record.id)}" title="Ver cheques">${r.photos.slice(0, 3).map(p => `<span class="pr-thumb" data-photo="${esc(p.id)}"></span>`).join("")}<span>${photoText(r.photos.length)}</span></button>`
          : `<span class="pr-muted">No photo</span>`}</td>
      </tr>`).join("");
    panel.querySelector(".pr-body").innerHTML = `
      <div class="pr-summary">
        <div><span>${isInv ? "Pending invoices" : "Pending reports"}</span><strong>${s.count}</strong></div>
        <div><span>Total invoiced</span><strong>${money(s.total)}</strong></div>
        <div><span>Outstanding balance</span><strong class="is-due">${money(s.due)}</strong></div>
        <div><span>Amount paid</span><strong class="is-paid">${money(s.paid)}</strong></div>
      </div>
      <h3 class="pr-h3">${isInv ? "INVOICE DETAILS" : "REPORT DETAILS"}</h3>
      ${rows.length ? `<div class="pr-table-wrap"><table class="pr-table"><thead><tr><th>${isInv ? "Invoice" : "Report"}</th><th>Date</th><th>Job address</th><th>${isInv ? "Invoice total" : "Total"}</th><th>Balance due</th><th>Payment record</th></tr></thead><tbody>${body}</tbody></table></div>`
        : `<p class="pr-empty">No hay ${isInv ? "invoices" : "reportes de horas"} en Esperando cheque con saldo pendiente.</p>`}
      <p class="pr-note"><strong>Note:</strong> Only ${isInv ? "invoices" : "reports"} waiting for a check with an outstanding balance are included. Tap an address to see its PDF and the payment record to see the checks.</p>
      <p class="pr-date">Report date: ${usDate(today())}</p>`;
    loadThumbs(rows);
  }
  async function loadThumbs(rows) {
    thumbUrls.splice(0).forEach(url => URL.revokeObjectURL(url));
    for (const row of rows) for (const photo of row.photos.slice(0, 3)) {
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
  const archiveOf = kind => kind === "invoice" ? tc()?.archive : kind === "hours" ? tc()?.hoursArchive : tc()?.jobArchive;
  async function onClick(event) {
    const t = event.target;
    if (t === panel || t.closest(".pr-close")) return close();
    const tabBtn = t.closest("[data-pr-tab]"); if (tabBtn) { tab = tabBtn.dataset.prTab; return render(); }
    const view = t.closest("[data-pr-view]");
    if (view) { const row = rowsFor(tab)[Number(view.dataset.prView)]; return row && archiveOf(row.kind)?.view?.(row.record); }
    const act = t.closest("[data-pr-act]");
    if (act) {
      act.disabled = true;
      try { act.dataset.prAct === "pdf" ? await downloadPdf() : await shareLink(); }
      finally { act.disabled = false; }
    }
  }

  /* ---------- PDF ---------- */
  const safe = text => String(text ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[–—]/g, "-").replace(/[^\x20-\x7E]/g, " ");
  async function makePdf(rows, which, withLinks) {
    const L = window.PDFLib;
    if (!L) throw new Error("Falta la librería de PDF. Recarga la página.");
    const isInv = which === "invoice";
    const doc = await L.PDFDocument.create();
    const font = await doc.embedFont(L.StandardFonts.Helvetica), bold = await doc.embedFont(L.StandardFonts.HelveticaBold);
    const rgb = hex => L.rgb(parseInt(hex.slice(1, 3), 16) / 255, parseInt(hex.slice(3, 5), 16) / 255, parseInt(hex.slice(5, 7), 16) / 255);
    const INK = rgb("#241f3a"), MUTED = rgb("#5f5a72"), PEACH = rgb("#fbe8da"), ORANGE = rgb("#f8bf90"), RED = rgb("#b83a3a"), GREEN = rgb("#2b8a5c"), BLUE = rgb("#3d4fd6");
    const W = 792, H = 612, M = 44;
    const s = summary(rows);
    // Links (best effort): each address opens its invoice preview, each payment record its first check photo.
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
    const fit = (text, f, size, max) => { let t = safe(text); if (f.widthOfTextAtSize(t, size) <= max) return t; while (t.length > 1 && f.widthOfTextAtSize(t + "...", size) > max) t = t.slice(0, -1); return t + "..."; };
    const cols = [{ x: M, w: 60 }, { x: M + 60, w: isInv ? 92 : 150 }, { x: M + (isInv ? 152 : 210), w: isInv ? 262 : 204 }, { x: 458, w: 88 }, { x: 546, w: 86 }, { x: 632, w: W - M - 632 }];
    const heads = [isInv ? "INVOICE" : "REPORT", "DATE", "JOB ADDRESS", isInv ? "INVOICE TOTAL" : "TOTAL", "BALANCE DUE", "PAYMENT RECORD"];
    let page, y;
    const header = first => {
      page = doc.addPage([W, H]);
      y = H - M;
      if (first) {
        page.drawText(isInv ? "PENDING INVOICES REPORT" : "PENDING HOURS REPORT", { x: M, y: y - 22, size: 24, font: bold, color: INK });
        page.drawText(`Summary of ${isInv ? "invoices" : "hours reports"} awaiting payment by check - All amounts in USD`, { x: M, y: y - 42, size: 10.5, font, color: MUTED });
        y -= 66;
        const boxW = (W - 2 * M) / 4;
        page.drawRectangle({ x: M, y: y - 74, width: W - 2 * M, height: 74, color: PEACH });
        [[isInv ? "PENDING INVOICES" : "PENDING REPORTS", String(s.count), INK], ["TOTAL INVOICED", money(s.total), INK], ["OUTSTANDING BALANCE", money(s.due), RED], ["AMOUNT PAID", money(s.paid), GREEN]].forEach(([label, value, color], i) => {
          page.drawText(label, { x: M + 12 + i * boxW, y: y - 20, size: 8.5, font: bold, color: MUTED });
          page.drawText(value, { x: M + 12 + i * boxW, y: y - 56, size: 20, font: bold, color });
        });
        y -= 100;
        page.drawText(isInv ? "INVOICE DETAILS" : "REPORT DETAILS", { x: M, y, size: 13, font: bold, color: INK });
        y -= 14;
      }
      page.drawRectangle({ x: M, y: y - 26, width: W - 2 * M, height: 26, color: ORANGE });
      heads.forEach((h, i) => page.drawText(h, { x: cols[i].x + 8, y: y - 17, size: 8, font: bold, color: INK }));
      y -= 26;
    };
    header(true);
    rows.forEach((row, i) => {
      if (y - 26 < M + 40) header(false);
      if (i % 2 === 1) page.drawRectangle({ x: M, y: y - 26, width: W - 2 * M, height: 26, color: PEACH });
      const ty = y - 17, link = links.get(i) || {};
      page.drawText(fit(row.label, bold, 9.5, cols[0].w - 12), { x: cols[0].x + 8, y: ty, size: 9.5, font: bold, color: INK });
      page.drawText(fit(dateText(row), font, 9.5, cols[1].w - 12), { x: cols[1].x + 8, y: ty, size: 9.5, font, color: INK });
      const addr = fit(row.address || "No address", font, 9.5, cols[2].w - 12);
      page.drawText(addr, { x: cols[2].x + 8, y: ty, size: 9.5, font, color: link.pdf ? BLUE : INK });
      if (link.pdf) {
        const w = font.widthOfTextAtSize(addr, 9.5);
        page.drawLine({ start: { x: cols[2].x + 8, y: ty - 2 }, end: { x: cols[2].x + 8 + w, y: ty - 2 }, thickness: .6, color: BLUE });
        addLink(page, cols[2].x + 8, ty - 4, w, 14, link.pdf);
      }
      page.drawText(money(row.total), { x: cols[3].x + 8, y: ty, size: 9.5, font, color: INK });
      page.drawText(money(row.due), { x: cols[4].x + 8, y: ty, size: 9.5, font: bold, color: RED });
      const rec = photoText(row.photos.length);
      page.drawText(rec, { x: cols[5].x + 8, y: ty, size: 9.5, font, color: link.photo ? BLUE : INK });
      if (link.photo) addLink(page, cols[5].x + 8, ty - 4, font.widthOfTextAtSize(rec, 9.5), 14, link.photo);
      y -= 26;
    });
    if (!rows.length) { page.drawText("No pending items.", { x: M + 8, y: y - 20, size: 10, font, color: MUTED }); y -= 30; }
    if (y < M + 46) { page = doc.addPage([W, H]); y = H - M; }
    page.drawText("Note:", { x: M, y: y - 30, size: 10, font: bold, color: INK });
    page.drawText(safe(`Only ${isInv ? "invoices" : "reports"} waiting for a check with an outstanding balance are included.${withLinks ? " Click an address to open its PDF." : ""}`), { x: M + 32, y: y - 30, size: 9.5, font, color: MUTED });
    page.drawText(`Report date: ${usDate(today())}`, { x: M, y: y - 46, size: 9, font, color: MUTED });
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

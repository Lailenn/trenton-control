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
        <div><img class="pr-logo" src="assets/logo-ruben-clear.png" alt="Ruben Perla"><h2 id="pendingReportTitle">PENDING INVOICES REPORT</h2><p class="pr-sub">Summary of invoices awaiting payment by check · All amounts in USD</p></div>
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

        // Summary cards with a colored bar.
        const gap = 12, cardW = (RIGHT - M - gap * 3) / 4, cardH = 62;
        [[isInv ? "PENDING INVOICES" : "PENDING REPORTS", String(s.count), INK, INK], ["TOTAL INVOICED", money(s.total), INK, BLUE], ["OUTSTANDING BALANCE", money(s.due), RED, RED], ["AMOUNT PAID", money(s.paid), GREEN, GREEN]]
          .forEach(([label, value, color, bar], i) => {
            const x = M + i * (cardW + gap);
            roundRect(page, x, y, cardW, cardH, 8, { color: WHITE, borderColor: LINE, borderWidth: 1 });
            page.drawRectangle({ x: x + 1, y: y - cardH + 10, width: 3, height: cardH - 20, color: bar });
            page.drawText(label, { x: x + 16, y: y - 22, size: 7.5, font: bold, color: MUTED });
            page.drawText(value, { x: x + 16, y: y - 50, size: 19, font: bold, color });
          });
        y -= cardH + 24;
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

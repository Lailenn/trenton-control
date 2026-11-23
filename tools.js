/* Papelera (restore deleted invoices and reports) and Exportar (CSV that opens in Excel).
   Deleted items are only marked in the cloud, so restoring brings them back as they were.
   Export uses the records already loaded in the app for the active company. */
(function () {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const esc = v => String(v ?? "").replace(/[&<>'"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#039;", '"': "&quot;" }[c]));
  const toast = t => window.TrentonControl?.toast?.(t);
  const money = n => "$" + (Number(n) || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const STAGES = { created: "Factura creada", working: "En trabajo", waiting: "Esperando cheque", paid: "Pagado" };
  const KINDS = [["invoices", "Invoices"], ["hours", "Horas"], ["jobs", "Reportes"]];
  const ic = d => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${d}"/></svg>`;
  const I = {
    trash: "M4 7h16M10 11v6M14 11v6M6 7l1 12.5A1.5 1.5 0 0 0 8.5 21h7a1.5 1.5 0 0 0 1.5-1.5L18 7M9 7V4.5h6V7",
    restore: "M4 12a8 8 0 1 0 2.4-5.7M4 4v4h4",
    x: "M6 6l12 12M18 6 6 18",
    sheet: "M5 3.5h10l4 4V20.5H5zM15 3.5V8h4M8.5 12h7M8.5 15.5h7M12 12v7"
  };

  function shell(id, title, sub, icon) {
    let el = document.getElementById(id);
    if (el) return el;
    el = document.createElement("div");
    el.id = id;
    el.className = "tl-modal";
    el.setAttribute("role", "dialog");
    el.setAttribute("aria-modal", "true");
    el.innerHTML = `<div class="tl-card"><header class="tl-head"><span class="tl-head-i">${ic(I[icon])}</span><div><h3>${title}</h3><p>${sub}</p></div><button type="button" class="tl-x" data-tl="close" aria-label="Cerrar">${ic(I.x)}</button></header><div class="tl-body"></div></div>`;
    el.addEventListener("click", e => { if (e.target === el || e.target.closest('[data-tl="close"]')) close(el); });
    document.addEventListener("keydown", e => { if (e.key === "Escape" && el.classList.contains("is-open")) close(el); });
    document.body.appendChild(el);
    return el;
  }
  function openEl(el) { el.classList.add("is-open"); document.body.classList.add("pr-open"); setTimeout(() => el.querySelector("button, select")?.focus(), 60); }
  function close(el) { el.classList.remove("is-open"); if (!document.querySelector(".tl-modal.is-open")) document.body.classList.remove("pr-open"); }
  const dateText = iso => { if (!iso) return "—"; const d = new Date(iso); return isNaN(d) ? String(iso) : d.toLocaleDateString("es", { day: "numeric", month: "short", year: "numeric" }); };

  /* ---------- Papelera ---------- */
  let trashKind = "invoices";
  function trashRow(kind, r) {
    const address = r.address || r.job_address || "Sin dirección";
    const extra = kind === "invoices" ? `${esc(r.invoice_number || "")}${r.amount_cents != null ? ` · ${money(r.amount_cents / 100)}` : ""}` : esc(dateText(r.report_date || r.start_date));
    return `<div class="tl-row"><div class="tl-row-main"><strong>${esc(address)}</strong><small>${extra}</small></div><span class="tl-when">Borrado ${esc(dateText(r.deleted_at))}</span><button type="button" class="tl-btn" data-restore="${esc(r.id)}">${ic(I.restore)} Restaurar</button></div>`;
  }
  async function renderTrash(el) {
    const body = $(".tl-body", el);
    body.innerHTML = `<div class="tl-tabs" role="tablist">${KINDS.map(([k, l]) => `<button type="button" role="tab" data-kind="${k}" class="${k === trashKind ? "is-on" : ""}" aria-selected="${k === trashKind}">${l}</button>`).join("")}</div><div class="tl-list"><div class="tl-skel"></div><div class="tl-skel"></div></div><p class="tl-note">Lo que borras queda aquí. Al restaurarlo vuelve al tablero y al archivo como estaba.</p>`;
    let rows = [];
    try { rows = await window.CloudDB.listDeleted(trashKind); }
    catch (error) { $(".tl-list", body).innerHTML = `<div class="tl-empty"><strong>No se pudo abrir la papelera</strong><small>${esc(error.message || "Revisa tu conexión e inténtalo otra vez.")}</small></div>`; return; }
    $(".tl-list", body).innerHTML = rows.length ? rows.map(r => trashRow(trashKind, r)).join("")
      : `<div class="tl-empty"><span>${ic(I.trash)}</span><strong>La papelera está vacía</strong><small>No hay ${trashKind === "invoices" ? "invoices" : "reportes"} borrados.</small></div>`;
  }
  async function restore(el, btn) {
    btn.disabled = true;
    btn.textContent = "Restaurando…";
    try {
      await window.CloudDB.restoreDeleted(trashKind, btn.dataset.restore);
      if (trashKind === "invoices") await window.TrentonControl?.reload?.();
      if (trashKind === "hours") await window.HoursApp?.boot?.();
      if (trashKind === "jobs") await window.JobApp?.boot?.();
      const row = btn.closest(".tl-row");
      row.classList.add("is-gone");
      setTimeout(() => { row.remove(); if (!$(".tl-row", el)) renderTrash(el); }, 320);
      toast("Restaurado. Ya está otra vez en el tablero.");
    } catch (error) {
      btn.disabled = false;
      btn.innerHTML = `${ic(I.restore)} Restaurar`;
      toast(error.message || "No se pudo restaurar.");
    }
  }
  function openTrash(kind) {
    if (!window.CloudDB?.listDeleted) return toast("Recarga la página e inténtalo de nuevo.");
    const el = shell("trashPanel", "Papelera", "Recupera invoices y reportes que borraste.", "trash");
    if (!el.dataset.bound) {
      el.dataset.bound = "1";
      el.addEventListener("click", e => {
        const tab = e.target.closest("[data-kind]");
        if (tab) { trashKind = tab.dataset.kind; renderTrash(el); return; }
        const r = e.target.closest("[data-restore]");
        if (r) restore(el, r);
      });
    }
    if (kind) trashKind = kind;
    openEl(el);
    renderTrash(el);
  }

  /* ---------- Exportar ---------- */
  const csvCell = v => { const s = String(v ?? ""); return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const num = n => (Math.round((Number(n) || 0) * 100) / 100).toFixed(2);
  const entryHours = e => { const o = e.hoursOverride; return o !== "" && o != null && !isNaN(Number(o)) ? Number(o) : Number(e.hours) || 0; };
  const yearOf = d => String(d || "").slice(0, 4);
  function sources() {
    return {
      invoices: (window.TrentonControl?.records?.() || []).filter(r => !r.deletedAt),
      hours: window.HoursApp?.reports?.() || [],
      jobs: window.JobApp?.reports?.() || []
    };
  }
  function rowsFor(kind, year) {
    const src = sources();
    const keep = d => !year || yearOf(d) === year;
    if (kind === "invoices") {
      const head = ["Invoice", "Fecha", "Dirección", "Cliente", "Descripción", "Estado", "Total", "Recibido", "Pendiente", "Pagada el"];
      const rows = src.invoices.filter(r => keep(r.issuedDate)).sort((a, b) => String(a.issuedDate).localeCompare(String(b.issuedDate))).map(r => [
        r.invoiceNumber, r.issuedDate, r.address, r.invoiceData?.billName || "", r.description || r.invoiceData?.description || "",
        STAGES[r.stage] || r.stage, num(r.amount), num(r.stage === "paid" && !r.received ? r.amount : r.received),
        num(r.stage === "paid" ? 0 : (r.due ?? Math.max(0, (r.amount || 0) - (r.received || 0)))), r.paidAt ? String(r.paidAt).slice(0, 10) : ""]);
      return { head, rows };
    }
    const list = kind === "hours" ? src.hours : src.jobs;
    const head = kind === "hours" ? ["Fecha", "Dirección", "Empleado", "Entrada", "Salida", "Almuerzo (min)", "Horas", "Tarifa", "Pago", "Estado"]
      : ["Fecha", "Dirección", "Empleado", "Descripción", "Horas", "Tarifa", "Pago", "Estado"];
    const rows = [];
    list.forEach(r => (r.entries || []).forEach(e => {
      const date = e.date || r.reportDate || r.startDate;
      if (!keep(date)) return;
      const h = entryHours(e), rate = Number(e.rate) || Number(r.defaultRate) || 0;
      rows.push(kind === "hours" ? [date, r.jobAddress, e.employee, e.timeIn || "", e.timeOut || "", e.lunch || 0, num(h), num(rate), num(h * rate), STAGES[r.stage] || r.stage || ""]
        : [date, r.jobAddress, e.employee, e.description || "", num(h), num(rate), num(h * rate), STAGES[r.stage] || r.stage || ""]);
    }));
    rows.sort((a, b) => String(a[0]).localeCompare(String(b[0])));
    return { head, rows };
  }
  function years() {
    const src = sources(), set = new Set();
    src.invoices.forEach(r => yearOf(r.issuedDate) && set.add(yearOf(r.issuedDate)));
    [...src.hours, ...src.jobs].forEach(r => (r.entries || []).forEach(e => { const y = yearOf(e.date || r.reportDate || r.startDate); if (y) set.add(y); }));
    return [...set].filter(y => /^\d{4}$/.test(y)).sort().reverse();
  }
  let exportKind = "invoices", exportYear = "";
  function renderExport(el) {
    const ys = years(), { rows } = rowsFor(exportKind, exportYear);
    $(".tl-body", el).innerHTML = `
      <div class="tl-tabs" role="tablist">${KINDS.map(([k, l]) => `<button type="button" role="tab" data-ekind="${k}" class="${k === exportKind ? "is-on" : ""}" aria-selected="${k === exportKind}">${l}</button>`).join("")}</div>
      <label class="tl-field"><span>Año</span><select id="tlYear"><option value="">Todos los años</option>${ys.map(y => `<option value="${y}" ${y === exportYear ? "selected" : ""}>${y}</option>`).join("")}</select></label>
      <div class="tl-count"><strong>${rows.length}</strong><span>${exportKind === "invoices" ? "invoices" : "filas de jornada"} para exportar</span></div>
      <button type="button" class="tl-primary" data-tl="download" ${rows.length ? "" : "disabled"}>${ic(I.sheet)} Descargar para Excel (.csv)</button>
      <p class="tl-note">Se abre en Excel, Numbers o Google Sheets. Útil para el contador o los impuestos de fin de año.</p>`;
  }
  function download(el) {
    const year = exportYear;
    const { head, rows } = rowsFor(exportKind, year);
    if (!rows.length) return toast("No hay datos para ese año.");
    const csv = "﻿" + [head, ...rows].map(r => r.map(csvCell).join(",")).join("\r\n");
    const name = `${{ invoices: "invoices", hours: "horas", jobs: "reportes" }[exportKind]}-${window.CompanyApp?.id?.() || "trenton"}-${year || "todos"}.csv`;
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    if (window.TrentonControl?.download) window.TrentonControl.download(blob, name);
    else { const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); }
    toast(`Descargado: ${name}`);
  }
  function openExport(kind) {
    const el = shell("exportPanel", "Exportar", "Descarga tus datos en una hoja de cálculo.", "sheet");
    if (!el.dataset.bound) {
      el.dataset.bound = "1";
      el.addEventListener("click", e => {
        const tab = e.target.closest("[data-ekind]");
        if (tab) { exportKind = tab.dataset.ekind; renderExport(el); return; }
        if (e.target.closest('[data-tl="download"]')) download(el);
      });
      el.addEventListener("change", e => { if (e.target.id === "tlYear") { exportYear = e.target.value; renderExport(el); $("#tlYear", el).focus(); } });
    }
    if (kind) exportKind = kind;
    openEl(el);
    renderExport(el);
  }

  document.addEventListener("click", e => {
    const t = e.target.closest("[data-open-trash]");
    if (t) { e.preventDefault(); openTrash(t.dataset.openTrash || ""); return; }
    const x = e.target.closest("[data-open-export]");
    if (x) { e.preventDefault(); openExport(x.dataset.openExport || ""); }
  });
  window.TrashPanel = { open: openTrash };
  window.ExportPanel = { open: openExport, rows: rowsFor };
})();

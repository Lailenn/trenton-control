/* Job PDF archive. Independent from invoices and hours_reports. */
window.JobArchive = function (app) {
  "use strict";
  const $ = selector => document.querySelector(selector);
  const esc = app.esc, money = app.money;
  const pdfUrls = new Map();
  const isoDate = value => /^\d{4}-\d{2}-\d{2}$/.test(String(value || "")) ? String(value) : "";
  const startDate = record => isoDate(record?.startDate) || isoDate(record?.entries?.[0]?.date);
  const dateLabel = value => isoDate(value) ? value.slice(8, 10) + "/" + value.slice(5, 7) + "/" + value.slice(0, 4) : "Sin fecha";
  const formatHours = value => Number(value || 0).toLocaleString("en-US", {maximumFractionDigits: 2});
  const fileName = record => record.pdfName || window.JobApp?.fileName?.(record) || "job.pdf";
  const totals = record => {
    const entries = record.entries || [];
    return {
      hours: entries.reduce((sum, entry) => sum + Number(entry.hours || 0), 0),
      pay: entries.reduce((sum, entry) => sum + Number(entry.hours || 0) * Number(entry.rate || 0), 0),
      people: [...new Set(entries.map(entry => String(entry.employee || "").trim()).filter(Boolean))]
    };
  };
  const haystack = record => [record.jobAddress, record.pdfName, ...(record.entries || []).map(entry => `${entry.employee} ${entry.description}`)].join(" ").toLowerCase();
  function select(records, year, query) {
    const needle = String(query || "").trim().toLowerCase();
    return records.filter(record => {
      const date = startDate(record);
      if (year === "undated") { if (date) return false; }
      else if (year && year !== "all" && date.slice(0, 4) !== year) return false;
      return !needle || haystack(record).includes(needle);
    });
  }
  function pdfUrl(record) {
    if (!record.pdfBlob) return "";
    const cached = pdfUrls.get(record.id);
    if (cached?.blob === record.pdfBlob) return cached.url;
    if (cached?.url) URL.revokeObjectURL(cached.url);
    const url = URL.createObjectURL(record.pdfBlob);
    pdfUrls.set(record.id, { blob: record.pdfBlob, url });
    return url;
  }

  function render() {
    const yearSelect = $("#jobArchiveYear"), grid = $("#jobArchiveGrid");
    if (!yearSelect || !grid) return;
    const records = app.records(), chosenYear = yearSelect.value;
    const years = [...new Set(records.map(startDate).filter(Boolean).map(date => date.slice(0, 4)))].sort().reverse();
    yearSelect.innerHTML = '<option value="all">Todos los años</option>' + years.map(year => `<option value="${year}">${year}</option>`).join("") + (records.some(record => !startDate(record)) ? '<option value="undated">Sin fecha · revisar</option>' : "");
    yearSelect.value = ["all", "undated", ...years].includes(chosenYear) ? chosenYear : "all";
    if (!yearSelect.value) yearSelect.value = "all";
    const visible = select(records, yearSelect.value, $("#jobArchiveSearch")?.value);
    const hours = visible.reduce((sum, record) => sum + totals(record).hours, 0);
    const pay = visible.reduce((sum, record) => sum + totals(record).pay, 0);
    $("#jobArchiveTitle").textContent = yearSelect.value === "all" ? "Todos los reportes de este formato" : yearSelect.value === "undated" ? "Reportes sin fecha" : `Otro formato ${yearSelect.value}`;
    $("#jobArchiveCount").textContent = visible.length;
    $("#jobArchiveHours").textContent = `${formatHours(hours)} HRS`;
    $("#jobArchivePay").textContent = money(pay);
    grid.innerHTML = visible.length ? visible.map(record => {
      const stats = totals(record);
      const hasPdf = Boolean(record.pdfBlob || record.pdfPath);
      const range = window.JobPDF?.rangeLabel?.((record.entries || []).map(entry => entry.date)) || dateLabel(startDate(record));
      return `<article class="archive-card">
        <div class="archive-card-top"><span class="stage-tag">${stats.people.length || 1} ${stats.people.length === 1 ? "empleado" : "empleados"}</span><span>${esc(range)}</span></div>
        <button class="archive-address" type="button" data-job-record="${esc(record.id)}" data-task="${hasPdf ? "view" : "download"}">${esc(record.jobAddress || "Sin dirección")}</button>
        <p class="archive-date">${esc(range)} · ${hasPdf ? "PDF de job guardado" : "Falta el PDF"}</p>
        <strong class="archive-amount">${esc(formatHours(stats.hours))} HRS · ${money(stats.pay)}</strong>
        <p class="archive-file">${esc(record.pdfName || fileName(record))}</p>
        <div class="archive-card-actions">${hasPdf ? `<button type="button" class="button button-primary" data-job-record="${esc(record.id)}" data-task="view">Ver PDF</button><button type="button" class="button button-ghost" data-job-record="${esc(record.id)}" data-task="download">Descargar</button>` : ""}<button type="button" class="button button-danger" data-job-record="${esc(record.id)}" data-task="delete">Eliminar</button></div>
      </article>`;
    }).join("") : '<div class="archive-empty"><span>◷</span><h2>No hay reportes de este formato en esta selección</h2><p>Crea uno en Otro formato de horas. Este archivo no se mezcla con invoices ni con Horas / PDFs.</p></div>';
  }

  function open() {
    if ($("#jobArchiveYear")) $("#jobArchiveYear").value = "all";
    if ($("#jobArchiveSearch")) $("#jobArchiveSearch").value = "";
    app.showView("jobArchive");
    render();
  }

  async function view(record) {
    if (app.ensurePdf) {
      try { await app.ensurePdf(record); } catch (error) { return app.toast(error.message || "No se pudo abrir el PDF de job."); }
    }
    if (!record.pdfBlob) return app.toast("Este reporte todavía no tiene PDF.");
    const stats = totals(record);
    $("#pdfDialog").dataset.kind = "job";
    $("#pdfDialog").dataset.recordId = record.id;
    if ($("#pdfDialogEdit")) $("#pdfDialogEdit").hidden = true;
    $("#pdfDialogTitle").textContent = record.jobAddress || "Otro formato de horas";
    $("#pdfDialogInfo").textContent = `${window.JobPDF?.rangeLabel?.((record.entries || []).map(entry => entry.date)) || ""} · ${formatHours(stats.hours)} HRS · ${money(stats.pay)}`;
    $("#pdfDialogFrame").src = pdfUrl(record);
    $("#pdfDialogFrame").title = "PDF de job";
    $("#pdfDialog").showModal();
  }

  async function downloadRecord(record) {
    try {
      if (app.ensurePdf) await app.ensurePdf(record);
      if (!record.pdfBlob) return app.toast("No hay PDF de job para descargar.");
      await app.download(record.pdfBlob, fileName(record), { share: true });
    } catch (error) {
      app.toast(error.message || "No se pudo descargar el PDF de job.");
    }
  }

  async function deleteRecord(record) {
    if (!confirm(`¿Eliminar el reporte de otro formato de horas de ${record.jobAddress || "esta dirección"}? Saldrá de la web y de la nube.`)) return;
    try {
      await app.remove(record);
      render();
      app.toast("Reporte de otro formato de horas eliminado.");
    } catch (error) {
      app.toast(error.message || "No se pudo eliminar el reporte.");
    }
  }

  $("#jobArchiveGrid")?.addEventListener("click", event => {
    const button = event.target.closest("[data-job-record]"); if (!button) return;
    const record = app.records().find(item => item.id === button.dataset.jobRecord); if (!record) return;
    if (button.dataset.task === "view") view(record);
    else if (button.dataset.task === "delete") deleteRecord(record);
    else downloadRecord(record);
  });
  $("#jobArchiveYear")?.addEventListener("change", render);
  $("#jobArchiveSearch")?.addEventListener("input", render);
  $("#openJobFormButton")?.addEventListener("click", () => app.openJob?.());
  $("#importJobArchiveButton")?.addEventListener("click", () => $("#importJobFiles")?.click());
  $("#importJobFiles")?.addEventListener("change", async event => {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    if (!files.length) return;
    try {
      await window.JobApp.importJobFiles(files);
      render();
    } catch (error) {
      app.toast(error.message || "No se pudo importar el PDF de job.");
    }
  });

  return {open, render, view};
};

/* Hours PDF archive. Uses hours_reports / hours-pdfs only — never invoices. */
window.HoursArchive = function (app) {
  "use strict";
  const $ = selector => document.querySelector(selector);
  const esc = app.esc, money = app.money;
  const MAX_BATCH = 200 * 1024 * 1024, MAX_COUNT = 500;
  const pdfUrls = new Map();
  const isoDate = value => /^\d{4}-\d{2}-\d{2}$/.test(String(value || "")) ? String(value) : "";
  const reportDate = record => isoDate(record?.reportDate);
  const dateLabel = value => isoDate(value) ? value.slice(8, 10) + "/" + value.slice(5, 7) + "/" + value.slice(0, 4) : "Sin fecha";
  const formatHours = value => Number(value || 0).toLocaleString("en-US", {maximumFractionDigits: 2});
  const fileName = record => {
    if (record.pdfName) return record.pdfName;
    const address = String(record.jobAddress || "reporte").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 85) || "reporte";
    return `${address}_horas_${record.reportDate || "sin-fecha"}.pdf`;
  };
  const totals = record => {
    const entries = record.entries || [];
    return {
      hours: entries.reduce((sum, entry) => sum + Number(entry.hours || 0), 0),
      pay: entries.reduce((sum, entry) => sum + Number(entry.hours || 0) * Number(entry.rate || 0), 0),
      people: [...new Set(entries.map(entry => String(entry.employee || "").trim()).filter(Boolean))]
    };
  };
  const haystack = record => [record.jobAddress, record.pdfName, record.description, ...(record.entries || []).map(entry => entry.employee)].join(" ").toLowerCase();
  function select(records, year, query) {
    const needle = String(query || "").trim().toLowerCase();
    return records.filter(record => {
      const date = reportDate(record);
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
    const yearSelect = $("#hoursArchiveYear"), grid = $("#hoursArchiveGrid");
    if (!yearSelect || !grid) return;
    const records = app.records(), chosenYear = yearSelect.value;
    const years = [...new Set(records.map(reportDate).filter(Boolean).map(date => date.slice(0, 4)))].sort().reverse();
    yearSelect.innerHTML = '<option value="all">Todos los años</option>' + years.map(year => `<option value="${year}">${year}</option>`).join("") + (records.some(record => !reportDate(record)) ? '<option value="undated">Sin fecha · revisar</option>' : "");
    yearSelect.value = ["all", "undated", ...years].includes(chosenYear) ? chosenYear : "all";
    if (!yearSelect.value) yearSelect.value = "all";
    const visible = select(records, yearSelect.value, $("#hoursArchiveSearch")?.value);
    const hours = visible.reduce((sum, record) => sum + totals(record).hours, 0);
    const pay = visible.reduce((sum, record) => sum + totals(record).pay, 0);
    const undated = records.filter(record => !reportDate(record)).length;
    $("#hoursArchiveTitle").textContent = yearSelect.value === "all" ? "Todos los reportes de horas" : yearSelect.value === "undated" ? "Reportes sin fecha" : `Horas ${yearSelect.value}`;
    $("#hoursArchiveCount").textContent = visible.length;
    $("#hoursArchiveHours").textContent = `${formatHours(hours)} HRS`;
    $("#hoursArchivePay").textContent = money(pay);
    $("#hoursArchiveYearHelp").textContent = "Cada reporte de horas cuenta una sola vez, según la fecha del trabajo. Estos PDFs no se mezclan con las invoices." + (undated ? ` Hay ${undated} sin fecha; completa sus datos para incluirlos en un año.` : "");
    grid.innerHTML = visible.length ? visible.map(record => {
      const stats = totals(record);
      const hasPdf = Boolean(record.pdfBlob || record.pdfPath);
      return `<article class="archive-card">
        <div class="archive-card-top"><span class="stage-tag">${stats.people.length || 1} ${stats.people.length === 1 ? "empleado" : "empleados"}</span><span>${esc(dateLabel(reportDate(record)))}</span></div>
        <button class="archive-address" type="button" data-hours-record="${esc(record.id)}" data-task="${hasPdf ? "view" : "download"}">${esc(record.jobAddress || "Sin dirección")}</button>
        <p class="archive-date">${esc(dateLabel(reportDate(record)))} · ${hasPdf ? "PDF de horas guardado" : "Falta el PDF"}</p>
        <strong class="archive-amount">${esc(formatHours(stats.hours))} HRS · ${money(stats.pay)}</strong>
        <p class="archive-file">${esc(record.pdfName || fileName(record))}</p>
        <div class="archive-card-actions">${hasPdf ? `<button type="button" class="button button-primary" data-hours-record="${esc(record.id)}" data-task="view">Ver PDF</button><button type="button" class="button button-ghost" data-hours-record="${esc(record.id)}" data-task="download">Descargar</button>` : ""}</div>
      </article>`;
    }).join("") : '<div class="archive-empty"><span>◷</span><h2>No hay reportes de horas en esta selección</h2><p>Prueba otro año o crea un reporte en Horas trabajadas. Los PDFs de invoices viven en otro archivo.</p></div>';
  }

  function open() {
    if ($("#hoursArchiveYear")) $("#hoursArchiveYear").value = "all";
    if ($("#hoursArchiveSearch")) $("#hoursArchiveSearch").value = "";
    app.showView("hoursArchive");
    render();
  }

  async function view(record) {
    if (app.ensurePdf) {
      try { await app.ensurePdf(record); } catch (error) { return app.toast(error.message || "No se pudo abrir el PDF de horas."); }
    }
    if (!record.pdfBlob) return app.toast("Este reporte todavía no tiene PDF.");
    const stats = totals(record);
    $("#pdfDialog").dataset.kind = "hours";
    $("#pdfDialog").dataset.recordId = record.id;
    if ($("#pdfDialogEdit")) $("#pdfDialogEdit").hidden = true;
    $("#pdfDialogTitle").textContent = record.jobAddress || "Horas trabajadas";
    $("#pdfDialogInfo").textContent = `${dateLabel(reportDate(record))} · ${formatHours(stats.hours)} HRS · ${money(stats.pay)}`;
    $("#pdfDialogFrame").src = pdfUrl(record);
    $("#pdfDialogFrame").title = "PDF de horas trabajadas";
    $("#pdfDialog").showModal();
  }

  async function downloadRecord(record) {
    try {
      if (app.ensurePdf) await app.ensurePdf(record);
      if (!record.pdfBlob) return app.toast("No hay PDF de horas para descargar.");
      await app.download(record.pdfBlob, fileName(record), { share: true });
    } catch (error) {
      app.toast(error.message || "No se pudo descargar el PDF de horas.");
    }
  }

  async function backup() {
    const records = app.records();
    if (!records.length) return app.toast("Todavía no hay reportes de horas para respaldar.");
    $("#backupHoursButton").disabled = true;
    try {
      const zip = new JSZip(), metadata = [];
      let bytes = 0;
      for (const record of records) { if (app.ensurePdf) await app.ensurePdf(record); }
      records.forEach((record, index) => {
        bytes += record.pdfBlob?.size || 0;
        if (bytes > MAX_BATCH || records.length > MAX_COUNT) throw new Error("El respaldo supera 500 reportes o 200 MB. Descarga los PDFs uno por uno.");
        const pdfPath = record.pdfBlob ? `pdfs/${String(index + 1).padStart(4, "0")}_${fileName(record)}` : "";
        if (record.pdfBlob) zip.file(pdfPath, record.pdfBlob);
        const {pdfBlob, ...rest} = record;
        metadata.push({...rest, reportDate: reportDate(record), pdfPath});
      });
      zip.file("trenton-horas-respaldo.json", JSON.stringify({format: "trenton-hours-backup", version: 1, exportedAt: new Date().toISOString(), records: metadata}, null, 2));
      const blob = await zip.generateAsync({type: "blob", compression: "STORE"});
      await app.download(blob, `Trenton-horas-${new Date().toISOString().slice(0, 10)}.zip`);
      app.toast("Respaldo de horas descargado. No uses este ZIP en Invoices / PDFs.");
    } catch (error) { app.toast(error.message || "No se pudo generar el respaldo de horas."); }
    finally { $("#backupHoursButton").disabled = false; }
  }

  $("#hoursArchiveGrid")?.addEventListener("click", event => {
    const button = event.target.closest("[data-hours-record]"); if (!button) return;
    const record = app.records().find(item => item.id === button.dataset.hoursRecord); if (!record) return;
    if (button.dataset.task === "view") view(record);
    else downloadRecord(record);
  });
  $("#hoursArchiveYear")?.addEventListener("change", render);
  $("#hoursArchiveSearch")?.addEventListener("input", render);
  $("#backupHoursButton")?.addEventListener("click", backup);
  $("#openHoursFormButton")?.addEventListener("click", () => app.openHours?.());
  return {open, render, view};
};

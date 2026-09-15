/* Job report form: several days, description, preview, save and download. */
(function (root) {
  "use strict";
  const $ = selector => document.querySelector(selector);
  const esc = value => String(value ?? "").replace(/[&<>'"]/g, char => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#039;", '"': "&quot;"}[char]));
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
  const money = value => `$${Number(value || 0).toLocaleString("en-US", {minimumFractionDigits: Number.isInteger(Number(value || 0)) ? 0 : 2, maximumFractionDigits: 2})}`;
  const formatHours = value => Number(value || 0).toLocaleString("en-US", {maximumFractionDigits: 2});
  const makeId = () => `job-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const defaultEntries = () => [
    {date: "2026-09-11", employee: "Pablo Matamoros", description: "Plywood demolition", timeIn: "11:00", timeOut: "19:00", lunch: 30, rate: 30, hoursOverride: 8},
    {date: "2026-09-11", employee: "Esteban Lemus", description: "Plywood demolition", timeIn: "11:00", timeOut: "19:00", lunch: 30, rate: 30, hoursOverride: 8},
    {date: "2026-09-11", employee: "Erick Maradiaga", description: "Plywood demolition", timeIn: "11:00", timeOut: "19:00", lunch: 30, rate: 30, hoursOverride: 8},
    {date: "2026-09-11", employee: "Rubén Perla", description: "Purchase of materials", timeIn: "", timeOut: "", lunch: 0, rate: 30, hoursOverride: 4},
    {date: "2026-09-11", employee: "Corina", description: "Purchase of materials", timeIn: "", timeOut: "", lunch: 0, rate: 30, hoursOverride: 4},
    {date: "2026-09-11", employee: "Rubén Perla", description: "Purchase of materials", timeIn: "", timeOut: "", lunch: 0, rate: 30, hoursOverride: 4},
    {date: "2026-09-11", employee: "Corina", description: "Purchase of materials", timeIn: "", timeOut: "", lunch: 0, rate: 30, hoursOverride: 4},
    {date: "2026-09-12", employee: "Pablo Matamoros", description: "Plywood demolition", timeIn: "08:00", timeOut: "16:30", lunch: 30, rate: 30, hoursOverride: 8},
    {date: "2026-09-12", employee: "Esteban Lemus", description: "Plywood demolition", timeIn: "08:00", timeOut: "16:30", lunch: 30, rate: 30, hoursOverride: 8},
    {date: "2026-09-12", employee: "Erick Maradiaga", description: "Plywood demolition", timeIn: "08:00", timeOut: "16:30", lunch: 30, rate: 30, hoursOverride: 8},
    {date: "2026-09-12", employee: "Rubén Perla", description: "Purchase of materials", timeIn: "", timeOut: "", lunch: 0, rate: 30, hoursOverride: 2},
    {date: "2026-09-12", employee: "Corina", description: "Purchase of materials", timeIn: "", timeOut: "", lunch: 0, rate: 30, hoursOverride: 2},
    {date: "2026-09-12", employee: "Rubén Perla", description: "Trash removal", timeIn: "", timeOut: "", lunch: 0, rate: 30, hoursOverride: 6},
    {date: "2026-09-12", employee: "Corina", description: "Trash removal", timeIn: "", timeOut: "", lunch: 0, rate: 30, hoursOverride: 6}
  ];
  let reports = [], entries = [], saving = false;

  async function load() {
    reports = await root.CloudDB.listJobs();
  }

  function reset() {
    $("#jobAddress").setAttribute("list", "addressHistory");
    $("#jobAddress").value = "1117 C St SE, Washington, DC 20003";
    $("#jobDefaultRate").value = "30";
    $("#jobWhatsAppText").value = "";
    $("#jobWhatsAppResult").textContent = "";
    $("#jobWhatsAppResult").classList.add("hidden");
    entries = defaultEntries();
    $("#jobError").textContent = "";
    renderEntries(); renderPreview();
  }

  function renderEntries() {
    const fallbackRate = Number($("#jobDefaultRate").value) || 0;
    $("#jobEntries").innerHTML = entries.map((entry, index) => `<div class="hours-entry-row" data-job-entry="${index}">
      <div class="hours-entry-row-top"><strong>Registro ${index + 1}</strong><button class="mini-action delete" type="button" data-job-action="remove" data-index="${index}" aria-label="Eliminar registro">×</button></div>
      <div class="hours-entry-grid job-entry-grid">
        <label class="field"><span>Fecha</span><input type="date" data-job-field="date" data-index="${index}" value="${esc(entry.date || "")}"></label>
        <label class="field"><span>Empleado</span><input type="text" data-job-field="employee" data-index="${index}" value="${esc(entry.employee)}" placeholder="Nombre completo"></label>
        <label class="field job-desc-field"><span>Descripción</span><input type="text" data-job-field="description" data-index="${index}" value="${esc(entry.description || "")}" placeholder="Plywood demolition"></label>
        <label class="field"><span>Entrada</span><input type="time" data-job-field="timeIn" data-index="${index}" value="${esc(entry.timeIn || "")}"></label>
        <label class="field"><span>Salida</span><input type="time" data-job-field="timeOut" data-index="${index}" value="${esc(entry.timeOut || "")}"></label>
        <label class="field"><span>Almuerzo (min)</span><input type="number" min="0" step="5" data-job-field="lunch" data-index="${index}" value="${esc(entry.lunch || 0)}"></label>
        <label class="field"><span>Tarifa USD/h</span><div class="money-input"><b>$</b><input type="number" min="0" step="0.01" data-job-field="rate" data-index="${index}" value="${esc(entry.rate ?? fallbackRate)}"></div></label>
        <label class="field"><span>Horas (si no hay horario)</span><input type="number" min="0" step="0.25" data-job-field="hoursOverride" data-index="${index}" value="${esc(entry.hoursOverride === "" || entry.hoursOverride == null ? "" : entry.hoursOverride)}" placeholder="Automático"></label>
      </div>
      <p class="hours-calculated">Total: ${formatHours(JobPDF.calcHours(entry))} horas · ${money(JobPDF.calcHours(entry) * Number(entry.rate ?? fallbackRate))}</p>
    </div>`).join("");
  }

  function updateEntry(index, field, value) {
    const entry = entries[index]; if (!entry) return;
    if (field === "lunch" || field === "rate") entry[field] = Number(value) || 0;
    else if (field === "hoursOverride") entry[field] = value === "" ? "" : Math.max(0, Number(value) || 0);
    else entry[field] = value;
    renderEntries();
    renderPreview();
  }

  function datesOf(list) {
    return [...new Set((list || []).map(entry => entry.date).filter(Boolean))].sort();
  }

  function renderPreview() {
    const address = $("#jobAddress").value.trim() || "Dirección del trabajo";
    $("#jobPreviewAddress").textContent = address;
    const ready = entries.filter(entry => entry.employee.trim());
    const groups = new Map();
    ready.forEach(entry => {
      const key = entry.date || "";
      const list = groups.get(key) || [];
      const hours = JobPDF.calcHours(entry);
      list.push({...entry, hours, rate: Number(entry.rate ?? $("#jobDefaultRate").value) || 0});
      groups.set(key, list);
    });
    const days = [...groups.entries()].sort((a, b) => String(a[0]).localeCompare(String(b[0])));
    const payTable = rows => {
      const map = new Map();
      rows.forEach(row => {
        const cur = map.get(row.employee) || {employee: row.employee, hours: 0, pay: 0, rates: []};
        cur.hours += row.hours;
        cur.pay += row.hours * row.rate;
        if (!cur.rates.includes(row.rate)) cur.rates.push(row.rate);
        map.set(row.employee, cur);
      });
      const summary = [...map.values()];
      const hours = summary.reduce((sum, row) => sum + row.hours, 0);
      const pay = summary.reduce((sum, row) => sum + row.pay, 0);
      return `<table class="hours-summary-table"><thead><tr><th>EMPLOYEE</th><th>TOTAL HOURS</th><th>HOURLY RATE</th><th>TOTAL PAY</th></tr></thead><tbody>${summary.map(row => `<tr><td>${esc(row.employee)}</td><td>${esc(formatHours(row.hours))} HRS</td><td>${row.rates.length === 1 ? esc(money(row.rates[0]) + "/HR") : "VARIES"}</td><td>${esc(money(row.pay))}</td></tr>`).join("")}</tbody><tfoot><tr><td>TOTAL</td><td>${esc(formatHours(hours))} HRS</td><td></td><td>${esc(money(pay))}</td></tr></tfoot></table>`;
    };
    const blocks = days.map(([date, rows]) => {
      const hours = rows.reduce((sum, row) => sum + row.hours, 0);
      return `<p class="hours-report-date job-day-title">${esc(JobPDF.fullDate(date))}</p>
        <table class="hours-work-table job-work-table"><thead><tr><th>DATE</th><th>EMPLOYEE</th><th>DESCRIPTION</th><th>TIME IN</th><th>TIME OUT</th><th>LUNCH</th><th>TOTAL HOURS</th></tr></thead><tbody>${rows.map(row => `<tr><td>${esc(JobPDF.dayName(row.date))}</td><td>${esc(row.employee)}</td><td>${esc(row.description || "—")}</td><td>${esc(JobPDF.timeLabel12(row.timeIn))}</td><td>${esc(JobPDF.timeLabel12(row.timeOut))}</td><td>${esc(!row.timeIn && !row.timeOut && !(Number(row.lunch) > 0) ? "—" : `${row.lunch || 0} MIN`)}</td><td>${esc(formatHours(row.hours))} HRS</td></tr>`).join("")}</tbody><tfoot><tr><td>TOTAL</td><td></td><td></td><td></td><td></td><td></td><td>${esc(formatHours(hours))} HRS</td></tr></tfoot></table>
        ${payTable(rows)}`;
    });
    $("#jobPreviewDays").innerHTML = blocks.join("") || '<p class="hours-empty-preview">Agrega registros para ver el reporte.</p>';
    $("#jobGrandTitle").textContent = ready.length ? `GRAND TOTAL — ${JobPDF.rangeLabel(datesOf(ready))}` : "GRAND TOTAL";
    $("#jobGrandTable").innerHTML = ready.length ? payTable(ready.map(entry => ({...entry, hours: JobPDF.calcHours(entry), rate: Number(entry.rate ?? $("#jobDefaultRate").value) || 0}))) : "";
  }

  async function logoBytes() {
    try {
      const response = await fetch("assets/arrento-carpentry.png");
      if (!response.ok) return null;
      const buffer = await response.arrayBuffer();
      if (!buffer || buffer.byteLength < 32 || buffer.byteLength > 1500000) return null;
      return buffer;
    } catch (error) {
      console.warn("No se pudo preparar el logo", error);
      return null;
    }
  }
  const fileName = data => {
    const address = String(data.jobAddress || "job").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 85) || "job";
    const dates = datesOf(data.entries || []);
    return `${address}_${dates[0] || "job"}${dates.length > 1 ? "_" + dates[dates.length - 1] : ""}.pdf`;
  };
  function download(blob, name, options = {}) {
    if (!blob) {
      if ($("#jobError")) $("#jobError").textContent = "No hay PDF para descargar.";
      return Promise.resolve();
    }
    if (root.TrentonFiles?.saveBlob) {
      return root.TrentonFiles.saveBlob(blob, name, options).catch(error => {
        $("#jobError").textContent = error.message || "No se pudo descargar el PDF.";
      });
    }
    const file = blob instanceof Blob ? blob : new Blob([blob], {type: "application/pdf"});
    const url = URL.createObjectURL(file), link = document.createElement("a");
    link.href = url; link.download = name || "job.pdf"; link.rel = "noopener"; link.style.display = "none";
    document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    return Promise.resolve();
  }

  function parseJobText() {
    const raw = $("#jobWhatsAppText")?.value.trim();
    if (!raw) {
      $("#jobWhatsAppResult").innerHTML = "<p>Pega primero el texto del job o del PDF.</p>";
      $("#jobWhatsAppResult").classList.remove("hidden");
      return;
    }
    const parsed = JobPDF.parseJobText(raw);
    if (parsed.fields.jobAddress) $("#jobAddress").value = parsed.fields.jobAddress;
    if (parsed.fields.defaultRate != null) $("#jobDefaultRate").value = parsed.fields.defaultRate;
    if (parsed.entries.length) entries = parsed.entries.map(entry => ({
      ...entry,
      rate: Number(entry.rate) || Number($("#jobDefaultRate").value) || 30
    }));
    renderEntries(); renderPreview();
    const result = $("#jobWhatsAppResult");
    result.innerHTML = `<p>${parsed.entries.length ? `${parsed.entries.length} registro(s) colocados.` : "No se encontraron filas."}${parsed.warnings.length ? " " + parsed.warnings.map(esc).join(" ") : ""}</p>`;
    result.classList.remove("hidden");
  }

  function recordFromForm() {
    const jobAddress = $("#jobAddress").value.trim();
    const defaultRate = Number($("#jobDefaultRate").value) || 0;
    const list = entries.map(entry => ({
      ...entry,
      employee: String(entry.employee || "").trim(),
      description: String(entry.description || "").trim(),
      rate: Number(entry.rate ?? defaultRate) || 0,
      hours: JobPDF.calcHours(entry)
    })).filter(entry => entry.employee);
    const dates = datesOf(list);
    return {
      id: makeId(),
      jobAddress,
      startDate: dates[0] || "",
      endDate: dates[dates.length - 1] || dates[0] || "",
      defaultRate,
      entries: list,
      updatedAt: new Date().toISOString()
    };
  }

  function jobReady(record) {
    return Boolean(record?.jobAddress && record.entries?.length && record.entries.every(entry =>
      entry.employee && entry.date && JobPDF.calcHours(entry) > 0 && Number(entry.rate) > 0
    ));
  }

  function applyImported(record) {
    if (!record) return;
    $("#jobAddress").value = record.jobAddress || "";
    $("#jobDefaultRate").value = record.defaultRate || 30;
    entries = record.entries?.length ? record.entries.map(entry => ({ ...entry })) : [{
      date: today(), employee: "", description: "", timeIn: "", timeOut: "", lunch: 0, rate: 30, hoursOverride: ""
    }];
    renderEntries();
    renderPreview();
  }

  function recordFromImport(file, parsed, id) {
    const fields = parsed.fields || {};
    const defaultRate = Number(fields.defaultRate) || 30;
    const imported = (parsed.entries || []).map(entry => ({
      date: entry.date || "",
      employee: String(entry.employee || "").trim(),
      description: String(entry.description || "").trim(),
      timeIn: entry.timeIn || "",
      timeOut: entry.timeOut || "",
      lunch: Number(entry.lunch) || 0,
      rate: Number(entry.rate) || defaultRate,
      hoursOverride: entry.hoursOverride === "" || entry.hoursOverride == null ? (entry.hours ?? "") : entry.hoursOverride,
      hours: JobPDF.calcHours(entry)
    })).filter(entry => entry.employee);
    const dates = datesOf(imported);
    return {
      id,
      sourceId: parsed.sourceId || "",
      jobAddress: String(fields.jobAddress || "").trim(),
      startDate: dates[0] || "",
      endDate: dates[dates.length - 1] || "",
      defaultRate,
      entries: imported,
      pdfBlob: file,
      pdfName: file?.name || fileName({ jobAddress: fields.jobAddress, entries: imported }),
      pdfHash: parsed.pdfHash || "",
      updatedAt: new Date().toISOString(),
      source: "imported"
    };
  }

  async function importJobFiles(fileList) {
    const files = Array.from(fileList || []).filter(file => file && /\.pdf$/i.test(file.name));
    if (!files.length) {
      $("#jobError").textContent = "Elige un PDF de job.";
      return [];
    }
    const saved = [];
    let lastRecord = null;
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      $("#jobError").textContent = `Leyendo ${i + 1} de ${files.length}: ${file.name}`;
      const parsed = await JobPDF.read(file);
      const record = recordFromImport(file, parsed, parsed.sourceId || makeId());
      lastRecord = record;
      applyImported(record);
      if (!jobReady(record)) {
        $("#jobError").textContent = (parsed.warnings.join(" ") || "Faltan datos del PDF.") + " Completa el formulario y pulsa Guardar.";
        return saved;
      }
      await root.CloudDB.saveJob(record);
      saved.push(record);
    }
    await load();
    renderHistory();
    window.TrentonControl?.jobArchive?.render?.();
    if (lastRecord) applyImported(lastRecord);
    $("#jobError").textContent = saved.length === 1 ? "PDF de job guardado en la nube." : `${saved.length} reportes de job guardados.`;
    return saved;
  }

  async function save(downloadAfter = false) {
    if (saving) return;
    const record = recordFromForm();
    if (!jobReady(record)) {
      $("#jobError").textContent = "Completa dirección, fecha, empleado, descripción del trabajo y horas (horario o total) con tarifa mayor que cero.";
      return;
    }
    saving = true;
    $("#saveJobButton").disabled = true;
    $("#downloadJobButton").disabled = true;
    $("#jobError").textContent = "Generando PDF…";
    try {
      record.pdfBlob = await JobPDF.generate({...record, recordId: record.id}, await logoBytes());
      if (!record.pdfBlob || record.pdfBlob.size < 80) throw new Error("El PDF salió vacío. Vuelve a intentar.");
      record.pdfHash = await JobPDF.hash(record.pdfBlob);
      record.pdfName = fileName(record);
      $("#jobError").textContent = "Guardando en la nube…";
      let cloudOk = false;
      try {
        await root.CloudDB.saveJob(record);
        cloudOk = true;
        await load(); renderHistory();
        window.TrentonControl?.jobArchive?.render?.();
        if (root.TrentonControl?.toast) root.TrentonControl.toast("Reporte de job guardado en la nube");
      } catch (cloudError) {
        console.error(cloudError);
        try { await load(); renderHistory(); } catch (_) { /* local copy */ }
        $("#jobError").textContent = "El reporte quedó en este aparato, pero no en la nube: " + (cloudError.message || "revisa la conexión") + ". Corre supabase/schema-job-reports.sql y vuelve a guardar.";
        if (root.TrentonControl?.toast) root.TrentonControl.toast("PDF listo; la nube falló");
      }
      try { await download(record.pdfBlob, record.pdfName, { share: downloadAfter }); }
      catch (downloadError) { console.warn(downloadError); }
      if (cloudOk) {
        $("#jobError").textContent = downloadAfter
          ? "PDF guardado en la nube, en este aparato y descargado. También queda en Jobs / PDFs."
          : "Reporte y PDF guardados en la nube. Si no se bajó, ábrelo en Jobs / PDFs.";
      }
    } catch (error) {
      console.error(error);
      $("#jobError").textContent = error.message || "No se pudo generar el PDF de job.";
    } finally {
      saving = false;
      $("#saveJobButton").disabled = false;
      $("#downloadJobButton").disabled = false;
    }
  }

  function renderHistory() {
    if (!$("#jobHistoryGrid")) return;
    $("#jobHistoryGrid").innerHTML = reports.length ? reports.map(record => {
      const rows = record.entries || [];
      const hours = rows.reduce((sum, entry) => sum + Number(entry.hours || JobPDF.calcHours(entry)), 0);
      const pay = rows.reduce((sum, entry) => sum + Number(entry.hours || JobPDF.calcHours(entry)) * Number(entry.rate || 0), 0);
      const range = JobPDF.rangeLabel(datesOf(rows)) || record.startDate || "";
      return `<article class="hours-history-card"><div><strong>${esc(record.jobAddress)}</strong><span>${esc(range)}${record.cloudSynced === false ? " · solo en este aparato" : ""}</span></div><b>${esc(formatHours(hours))} HRS · ${esc(money(pay))}</b><div class="hours-history-actions"><button class="button button-ghost" type="button" data-job-download="${esc(record.id)}">Descargar PDF</button><button class="button button-danger" type="button" data-job-delete="${esc(record.id)}">Eliminar</button></div></article>`;
    }).join("") : '<div class="hours-empty-history">Todavía no hay reportes de job guardados.</div>';
  }

  async function removeReport(record) {
    if (!record?.id) return;
    await root.CloudDB.softDeleteJob(record);
    reports = reports.filter(item => item.id !== record.id);
    renderHistory();
    window.TrentonControl?.jobArchive?.render?.();
  }

  async function open() { try { await load(); renderHistory(); } catch (error) { $("#jobError").textContent = error.message || "No se pudo abrir el archivo de jobs."; } renderPreview(); }
  async function boot() { await load(); renderHistory(); window.TrentonControl?.jobArchive?.render?.(); }
  function render() { renderHistory(); renderPreview(); }

  $("#jobEntries")?.addEventListener("input", event => {
    const field = event.target.dataset.jobField;
    if (field) updateEntry(Number(event.target.dataset.index), field, event.target.value);
  });
  $("#jobEntries")?.addEventListener("click", event => {
    const button = event.target.closest("[data-job-action=remove]");
    if (!button || entries.length === 1) return;
    entries.splice(Number(button.dataset.index), 1);
    renderEntries(); renderPreview();
  });
  $("#addJobEntryButton")?.addEventListener("click", () => {
    const last = entries[entries.length - 1];
    entries.push({
      date: last?.date || today(), employee: "", description: last?.description || "",
      timeIn: last?.timeIn || "07:00", timeOut: last?.timeOut || "15:30",
      lunch: last?.lunch ?? 30, rate: Number($("#jobDefaultRate").value) || 30, hoursOverride: ""
    });
    renderEntries(); renderPreview();
  });
  ["jobAddress", "jobDefaultRate"].forEach(id => $("#" + id)?.addEventListener("input", () => { if (id === "jobDefaultRate") renderEntries(); renderPreview(); }));
  $("#parseJobWhatsAppButton")?.addEventListener("click", parseJobText);
  $("#jobWhatsAppText")?.addEventListener("paste", () => setTimeout(parseJobText, 80));
  $("#saveJobButton")?.addEventListener("click", () => save(false));
  $("#downloadJobButton")?.addEventListener("click", () => save(true));
  $("#resetJobButton")?.addEventListener("click", reset);
  $("#importJobPdfButton")?.addEventListener("click", () => $("#importJobPdfFile")?.click());
  $("#importJobPdfFile")?.addEventListener("change", async event => {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    if (!files.length) return;
    try { await importJobFiles(files); }
    catch (error) { $("#jobError").textContent = error.message || "No se pudo importar el PDF de job."; }
  });
  $("#jobHistoryGrid")?.addEventListener("click", async event => {
    const del = event.target.closest("[data-job-delete]");
    if (del) {
      const record = reports.find(item => item.id === del.dataset.jobDelete);
      if (!record || !confirm(`¿Eliminar el reporte de job de ${record.jobAddress || "esta dirección"}? Saldrá de la web y de la nube.`)) return;
      try { await removeReport(record); }
      catch (error) { $("#jobError").textContent = error.message || "No se pudo eliminar el reporte."; }
      return;
    }
    const button = event.target.closest("[data-job-download]"); if (!button) return;
    const record = reports.find(item => item.id === button.dataset.jobDownload);
    if (!record) return;
    try {
      await root.CloudDB.ensureJobPdf(record);
      if (record.pdfBlob) await download(record.pdfBlob, record.pdfName || fileName(record), { share: true });
      else $("#jobError").textContent = "No hay PDF para descargar.";
    } catch (error) { $("#jobError").textContent = error.message || "No se pudo descargar el PDF."; }
  });

  function resetSession() { reports = []; renderHistory(); window.TrentonControl?.jobArchive?.render?.(); }
  reset();
  root.JobApp = {open, render, boot, resetSession, reports: () => reports, importJobFiles, applyImported, jobReady, recordFromImport, removeReport, fileName, download};
})(typeof globalThis !== "undefined" ? globalThis : this);

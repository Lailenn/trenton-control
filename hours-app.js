/* Work-hours form, preview, local storage and PDF download. */
(function (root) {
  "use strict";
  const $ = selector => document.querySelector(selector);
  const esc = value => String(value ?? "").replace(/[&<>'"]/g, char => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#039;", '"': "&quot;"}[char]));
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
  const money = value => `$${Number(value || 0).toLocaleString("en-US", {minimumFractionDigits: Number.isInteger(Number(value || 0)) ? 0 : 2, maximumFractionDigits: 2})}`;
  const formatHours = value => Number(value || 0).toLocaleString("en-US", {maximumFractionDigits: 2});
  const dateText = value => HoursPDF.fullDate(value) || "Selecciona una fecha";
  const makeId = () => `hours-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const defaultEntries = () => [
    {date: "2026-08-26", employee: "Josué Zúñiga", timeIn: "07:00", timeOut: "18:30", lunch: 30, rate: 30, scheduleAuto: true},
    {date: "2026-08-26", employee: "Pablo Matamoros", timeIn: "07:00", timeOut: "18:30", lunch: 30, rate: 30, scheduleAuto: true}
  ];
  let reports = [], entries = [], saving = false;

  function addHoursToClock(time, hours, lunchMinutes) {
    const match = String(time || "07:00").match(/^(\d{1,2}):(\d{2})$/);
    const start = match ? Number(match[1]) * 60 + Number(match[2]) : 7 * 60;
    const minutes = (start + Math.max(0, Math.round(Number(hours || 0) * 60)) + Math.max(0, Number(lunchMinutes) || 0)) % (24 * 60);
    return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
  }

  async function load() {
    reports = await root.CloudDB.listHours();
  }

  function reset() {
    $("#hoursJobAddress").setAttribute("list", "addressHistory");
    $("#hoursJobAddress").value = "4406 Woodfield Rd, Kensington, MD 20895";
    $("#hoursReportDate").value = "2026-08-26";
    $("#hoursDefaultRate").value = "30";
    $("#hoursDescription").value = "";
    $("#hoursWhatsAppText").value = "";
    $("#hoursWhatsAppResult").textContent = "";
    $("#hoursWhatsAppResult").classList.add("hidden");
    entries = defaultEntries();
    $("#hoursError").textContent = "";
    renderEntries(); renderPreview();
  }

  function renderEntries() {
    const fallbackRate = Number($("#hoursDefaultRate").value) || 0;
    $("#hoursEntries").innerHTML = entries.map((entry, index) => `<div class="hours-entry-row" data-entry="${index}">
      <div class="hours-entry-row-top"><strong>Registro ${index + 1}</strong><button class="mini-action delete" type="button" data-hours-action="remove" data-index="${index}" aria-label="Eliminar registro">×</button></div>
      <div class="hours-entry-grid">
        <label class="field"><span>Fecha</span><input type="date" data-hours-field="date" data-index="${index}" value="${esc(entry.date || $("#hoursReportDate").value)}"></label>
        <label class="field hours-employee"><span>Empleado</span><input type="text" data-hours-field="employee" data-index="${index}" value="${esc(entry.employee)}" placeholder="Nombre completo"></label>
        <label class="field"><span>Entrada</span><input type="time" data-hours-field="timeIn" data-index="${index}" value="${esc(entry.timeIn)}"></label>
        <label class="field"><span>Salida</span><input type="time" data-hours-field="timeOut" data-index="${index}" value="${esc(entry.timeOut)}"></label>
        <label class="field"><span>Almuerzo (min)</span><input type="number" min="0" step="5" data-hours-field="lunch" data-index="${index}" value="${esc(entry.lunch)}"></label>
        <label class="field"><span>Tarifa USD/h</span><div class="money-input"><b>$</b><input type="number" min="0" step="0.01" data-hours-field="rate" data-index="${index}" value="${esc(entry.rate ?? fallbackRate)}"></div></label>
        <label class="field"><span>Horas totales (editar)</span><input type="number" min="0" step="0.25" data-hours-field="hoursOverride" data-index="${index}" value="${esc(entry.hoursOverride === "" || entry.hoursOverride == null ? "" : entry.hoursOverride)}" placeholder="Automático"></label>
      </div>
      <p class="hours-calculated" data-hours-total="${index}">Total: ${formatHours(HoursPDF.calcHours(entry))} horas · ${money(HoursPDF.calcHours(entry) * Number(entry.rate ?? fallbackRate))}</p>
    </div>`).join("");
  }

  function updateEntry(index, field, value) {
    const entry = entries[index]; if (!entry) return;
    if (field === "lunch" || field === "rate") entry[field] = Number(value) || 0;
    else if (field === "hoursOverride") entry[field] = value === "" ? "" : Math.max(0, Number(value) || 0);
    else entry[field] = value;
    let scheduleChanged = false;
    if (["timeIn", "timeOut"].includes(field)) entry.scheduleAuto = false;
    if (field === "lunch" && entry.scheduleAuto && entry.hoursOverride !== "") {
      entry.timeOut = addHoursToClock(entry.timeIn || "07:00", entry.hoursOverride, entry.lunch);
      scheduleChanged = true;
    } else if (field === "lunch") entry.scheduleAuto = false;
    if (field === "hoursOverride" && value !== "" && entry.scheduleAuto) {
      if (!entry.timeIn) entry.timeIn = "07:00";
      if (Number(entry.lunch) === 30) entry.lunch = 60;
      entry.timeOut = addHoursToClock(entry.timeIn, entry.hoursOverride, entry.lunch);
      scheduleChanged = true;
    }
    if (field === "date" && index === 0 && value) $("#hoursReportDate").value = value;
    if (scheduleChanged) { renderEntries(); renderPreview(); return; }
    const total = $("[data-hours-total=\"" + index + "\"]");
    if (total) total.textContent = `Total: ${formatHours(HoursPDF.calcHours(entry))} horas · ${money(HoursPDF.calcHours(entry) * Number(entry.rate ?? $("#hoursDefaultRate").value ?? 0))}`;
    renderPreview();
  }

  function groupEntries() {
    const map = new Map();
    entries.filter(entry => entry.employee.trim()).forEach(entry => { const key = entry.employee.trim(); const list = map.get(key) || []; list.push({...entry, hours: HoursPDF.calcHours(entry), rate: Number(entry.rate ?? $("#hoursDefaultRate").value) || 0}); map.set(key, list); });
    return map;
  }

  function renderPreview() {
    const address = $("#hoursJobAddress").value.trim() || "Dirección del trabajo";
    $("#hoursPreviewAddress").textContent = address;
    $("#hoursPreviewDate").textContent = dateText($("#hoursReportDate").value);
    const groups = groupEntries();
    const tables = [];
    groups.forEach((rows, employee) => {
      const total = rows.reduce((sum, row) => sum + row.hours, 0);
      tables.push(`<table class="hours-work-table"><thead><tr><th>DATE</th><th>EMPLOYEE</th><th>TIME IN</th><th>TIME OUT</th><th>LUNCH</th><th>TOTAL HOURS</th></tr></thead><tbody>${rows.map(row => `<tr><td>${esc(HoursPDF.dayName(row.date))}</td><td>${esc(employee)}</td><td>${esc(HoursPDF.timeLabel(row.timeIn))}</td><td>${esc(HoursPDF.timeLabel(row.timeOut))}</td><td>${esc(row.lunch)} MIN</td><td>${esc(formatHours(row.hours))} HRS</td></tr>`).join("")}</tbody><tfoot><tr><td>TOTAL</td><td colspan="4"></td><td>${esc(formatHours(total))} HRS</td></tr></tfoot></table>`);
    });
    $("#hoursPreviewTables").innerHTML = tables.join("") || '<p class="hours-empty-preview">Agrega empleados para ver las tablas.</p>';
    const summary = [...groups].map(([employee, rows]) => { const hours = rows.reduce((sum, row) => sum + row.hours, 0); const rate = [...new Set(rows.map(row => Number(row.rate) || 0))]; const pay = rows.reduce((sum, row) => sum + row.hours * (Number(row.rate) || 0), 0); return {employee, hours, rate: rate.length === 1 ? rate[0] : null, pay}; });
    $("#hoursSummaryRows").innerHTML = summary.map(row => `<tr><td>${esc(row.employee)}</td><td>${esc(formatHours(row.hours))} HRS</td><td>${row.rate == null ? "VARIES" : esc(money(row.rate) + "/HR")}</td><td>${esc(money(row.pay))}</td></tr>`).join("");
    const totalHours = summary.reduce((sum, row) => sum + row.hours, 0), totalPay = summary.reduce((sum, row) => sum + row.pay, 0);
    $("#hoursSummaryTotal").innerHTML = `<tr><td>TOTAL</td><td>${esc(formatHours(totalHours))} HRS</td><td></td><td>${esc(money(totalPay))}</td></tr>`;
    $("#hoursPreviewDescription").textContent = $("#hoursDescription").value.trim();
    requestAnimationFrame(fitPreview);
  }

  let fittingHours = false;
  let lastHoursKey = "";
  function fitPreview() {
    const viewport = $("#hoursPreviewViewport"), paper = $("#hoursPaper");
    if (!viewport || !paper || fittingHours) return;
    if ($("#hoursView")?.classList.contains("hidden")) return;
    const width = viewport.clientWidth, paperWidth = paper.offsetWidth, paperHeight = paper.offsetHeight;
    if (!width || !paperWidth || !paperHeight) return;
    const scale = Math.min(1, width / paperWidth);
    const height = Math.ceil(paperHeight * scale);
    const key = width + ":" + paperWidth + ":" + paperHeight + ":" + scale.toFixed(4) + ":" + height;
    if (key === lastHoursKey) return;
    fittingHours = true;
    lastHoursKey = key;
    paper.style.transform = `scale(${scale})`;
    viewport.style.height = height + "px";
    requestAnimationFrame(() => { fittingHours = false; });
  }

  async function logoBytes() {
    try {
      const response = await fetch("assets/arrento-carpentry.png");
      if (!response.ok) return null;
      const blob = await response.blob();
      const bitmap = await createImageBitmap(blob);
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, bitmap.width);
      canvas.height = Math.max(1, bitmap.height);
      canvas.getContext("2d").drawImage(bitmap, 0, 0);
      bitmap.close();
      const converted = await new Promise(resolve => canvas.toBlob(resolve, "image/png"));
      return converted ? converted.arrayBuffer() : await blob.arrayBuffer();
    } catch (error) {
      console.warn("No se pudo preparar el logo de Arrento", error);
      return null;
    }
  }
  const fileName = data => {
    const address = String(data.jobAddress || "reporte").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 85) || "reporte";
    return `${address}_horas_${data.reportDate || "sin-fecha"}.pdf`;
  };
  function download(blob, name, options = {}) {
    if (!blob) {
      if ($("#hoursError")) $("#hoursError").textContent = "No hay PDF para descargar.";
      return Promise.resolve();
    }
    if (root.TrentonFiles?.saveBlob) {
      return root.TrentonFiles.saveBlob(blob, name, options).catch(error => {
        $("#hoursError").textContent = error.message || "No se pudo descargar el PDF de horas.";
      });
    }
    const file = blob instanceof Blob ? blob : new Blob([blob], {type: "application/pdf"});
    const url = URL.createObjectURL(file), link = document.createElement("a");
    link.href = url; link.download = name || "horas.pdf"; link.rel = "noopener"; link.style.display = "none";
    document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    return Promise.resolve();
  }

  function showWhatsAppResult(parsed, applied) {
    const result = $("#hoursWhatsAppResult");
    if (!result) return;
    const detected = [];
    if (parsed.fields.address) detected.push(`dirección: <strong>${esc(parsed.fields.address)}</strong>`);
    if (parsed.fields.reportDate) detected.push(`fecha: <strong>${esc(dateText(parsed.fields.reportDate))}</strong>`);
    if (parsed.fields.defaultRate != null) detected.push(`tarifa: <strong>${esc(money(parsed.fields.defaultRate) + "/HR")}</strong>`);
    if (parsed.entries.length) detected.push(`<strong>${parsed.entries.length}</strong> registro(s)`);
    const warnings = parsed.warnings.length ? `<p class="import-review"><strong>Revisa:</strong> ${parsed.warnings.map(esc).join(" · ")}</p>` : "";
    result.innerHTML = `<p>${applied ? "Datos desglosados y colocados en el formulario." : "Datos detectados:"} ${detected.join(" · ") || "No se encontraron datos suficientes."}</p>${warnings}`;
    result.classList.remove("hidden");
  }

  function parseHoursWhatsAppText() {
    const raw = $("#hoursWhatsAppText")?.value.trim();
    if (!raw) {
      $("#hoursWhatsAppResult").innerHTML = "<p>Pega primero el texto de WhatsApp.</p>";
      $("#hoursWhatsAppResult").classList.remove("hidden");
      return;
    }
    const parsed = root.HoursWhatsAppParser?.parse(raw, {defaultDate: $("#hoursReportDate").value}) || {fields: {}, entries: [], warnings: ["No se cargó el lector de WhatsApp."]};
    if (parsed.fields.address) $("#hoursJobAddress").value = parsed.fields.address;
    if (parsed.fields.reportDate) $("#hoursReportDate").value = parsed.fields.reportDate;
    if (parsed.fields.defaultRate != null) $("#hoursDefaultRate").value = parsed.fields.defaultRate;
    if (parsed.fields.description) $("#hoursDescription").value = parsed.fields.description;
    if (parsed.entries.length) entries = parsed.entries;
    renderEntries(); renderPreview(); showWhatsAppResult(parsed, Boolean(parsed.entries.length || parsed.fields.address || parsed.fields.reportDate || parsed.fields.defaultRate != null || parsed.fields.description));
  }

  async function save(downloadAfter = false) {
    if (saving) return;
    const jobAddress = $("#hoursJobAddress").value.trim(), reportDate = $("#hoursReportDate").value, description = $("#hoursDescription").value.trim(), defaultRate = Number($("#hoursDefaultRate").value) || 0;
    const invalid = !jobAddress || !reportDate || !entries.length || entries.some(entry => !entry.employee.trim() || !entry.date || !entry.timeIn || !entry.timeOut || HoursPDF.calcHours(entry) <= 0 || Number(entry.rate ?? defaultRate) <= 0);
    if (invalid) { $("#hoursError").textContent = "Completa dirección, fecha, empleado, entrada, salida, almuerzo y una tarifa mayor que cero."; return; }
    saving = true; $("#saveHoursButton").disabled = true; $("#downloadHoursButton").disabled = true; $("#hoursError").textContent = "Generando PDF…";
    const record = {id: makeId(), jobAddress, reportDate, description, defaultRate, entries: entries.map(entry => ({...entry, rate: Number(entry.rate ?? defaultRate) || 0, hours: HoursPDF.calcHours(entry)})), updatedAt: new Date().toISOString()};
    try {
      record.pdfBlob = await HoursPDF.generate({...record, recordId: record.id}, await logoBytes());
      record.pdfHash = await HoursPDF.hash(record.pdfBlob);
      record.pdfName = fileName(record);
      try {
        await root.CloudDB.saveHours(record); await load(); renderHistory();
        window.TrentonControl?.hoursArchive?.render?.();
        if (downloadAfter) await download(record.pdfBlob, record.pdfName, { share: true });
        else await download(record.pdfBlob, record.pdfName);
        $("#hoursError").textContent = downloadAfter
          ? "PDF guardado en la nube y descargado. También queda en Horas de trabajo / PDFs."
          : "Reporte y PDF guardados en la nube. Si no se bajó al teléfono, ábrelo en Horas de trabajo / PDFs.";
        if (root.TrentonControl?.toast) root.TrentonControl.toast("Reporte de horas guardado");
      } catch (cloudError) {
        console.error(cloudError);
        await download(record.pdfBlob, record.pdfName, { share: true });
        $("#hoursError").textContent = "El PDF se generó, pero no se pudo guardar en la nube: " + (cloudError.message || "revisa la conexión.");
      }
    } catch (error) { console.error(error); $("#hoursError").textContent = error.message || "No se pudo generar el PDF de horas."; }
    finally { saving = false; $("#saveHoursButton").disabled = false; $("#downloadHoursButton").disabled = false; }
  }

  function renderHistory() {
    $("#hoursHistoryGrid").innerHTML = reports.length ? reports.map(record => `<article class="hours-history-card"><div><strong>${esc(record.jobAddress)}</strong><span>${esc(dateText(record.reportDate))}</span></div><b>${esc(formatHours(record.entries.reduce((sum, entry) => sum + Number(entry.hours || 0), 0)))} HRS · ${esc(money(record.entries.reduce((sum, entry) => sum + Number(entry.hours || 0) * Number(entry.rate || 0), 0)))}</b><button class="button button-ghost" type="button" data-hours-download="${esc(record.id)}">Descargar PDF</button></article>`).join("") : '<div class="hours-empty-history">Todavía no hay reportes guardados.</div>';
  }

  async function open() { try { await load(); renderHistory(); } catch (error) { $("#hoursError").textContent = error.message || "No se pudo abrir el almacenamiento de horas."; } renderPreview(); }
  async function boot() { await load(); renderHistory(); window.TrentonControl?.hoursArchive?.render?.(); }
  function render() { renderHistory(); renderPreview(); }
  $("#hoursEntries").addEventListener("input", event => { const field = event.target.dataset.hoursField; if (field) updateEntry(Number(event.target.dataset.index), field, event.target.value); });
  $("#hoursEntries").addEventListener("click", event => { const button = event.target.closest("[data-hours-action=remove]"); if (!button || entries.length === 1) return; entries.splice(Number(button.dataset.index), 1); renderEntries(); renderPreview(); });
  $("#addHoursEntryButton").addEventListener("click", () => { entries.push({date: $("#hoursReportDate").value || today(), employee: "", timeIn: "07:00", timeOut: "15:30", lunch: 30, rate: Number($("#hoursDefaultRate").value) || 30, scheduleAuto: true}); renderEntries(); renderPreview(); });
  ["hoursJobAddress", "hoursReportDate", "hoursDefaultRate", "hoursDescription"].forEach(id => $("#" + id).addEventListener("input", () => { if (id === "hoursDefaultRate") renderEntries(); renderPreview(); }));
  $("#parseHoursWhatsAppButton").addEventListener("click", parseHoursWhatsAppText);
  $("#hoursWhatsAppText").addEventListener("paste", () => setTimeout(parseHoursWhatsAppText, 80));
  $("#saveHoursButton").addEventListener("click", () => save(false)); $("#downloadHoursButton").addEventListener("click", () => save(true)); $("#resetHoursButton").addEventListener("click", reset);
  $("#hoursHistoryGrid").addEventListener("click", async event => {
    const button = event.target.closest("[data-hours-download]"); if (!button) return;
    const record = reports.find(item => item.id === button.dataset.hoursDownload);
    if (!record) return;
    try {
      await root.CloudDB.ensureHoursPdf(record);
      if (record.pdfBlob) await download(record.pdfBlob, record.pdfName || fileName(record), { share: true });
      else $("#hoursError").textContent = "No hay PDF de horas para descargar.";
    } catch (error) { $("#hoursError").textContent = error.message || "No se pudo descargar el PDF."; }
  });
  window.addEventListener("resize", () => { lastHoursKey = ""; fitPreview(); });
  function resetSession() { reports = []; renderHistory(); window.TrentonControl?.hoursArchive?.render?.(); }
  reset();
  root.HoursApp = {open, render, boot, resetSession, reports: () => reports};
})(typeof globalThis !== "undefined" ? globalThis : this);

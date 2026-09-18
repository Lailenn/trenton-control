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
  const HOURS_DRAFT_KEY = "trenton.draft.hours";
  let hoursDraftTimer = 0;
  let applyingHoursDraft = false;
  let hoursDraftDismissed = false;

  function hoursDraftDefaults() {
    return {
      jobAddress: "4406 Woodfield Rd, Kensington, MD 20895",
      reportDate: "2026-08-26",
      defaultRate: "30",
      description: "",
      whatsappText: "",
      entries: defaultEntries()
    };
  }

  function hoursEntrySnap(entry) {
    return {
      date: entry?.date || "",
      employee: entry?.employee || "",
      timeIn: entry?.timeIn || "",
      timeOut: entry?.timeOut || "",
      lunch: Number(entry?.lunch) || 0,
      rate: entry?.rate,
      scheduleAuto: Boolean(entry?.scheduleAuto),
      hoursOverride: entry?.hoursOverride === "" || entry?.hoursOverride == null ? "" : Number(entry.hoursOverride)
    };
  }

  function collectHoursDraft() {
    return {
      savedAt: Date.now(),
      jobAddress: $("#hoursJobAddress")?.value || "",
      reportDate: $("#hoursReportDate")?.value || "",
      defaultRate: $("#hoursDefaultRate")?.value || "",
      description: $("#hoursDescription")?.value || "",
      whatsappText: $("#hoursWhatsAppText")?.value || "",
      entries: entries.map(hoursEntrySnap)
    };
  }

  function hoursDraftIsDirty(draft) {
    if (!draft) return false;
    const defaults = hoursDraftDefaults();
    if ((draft.whatsappText || "").trim()) return true;
    if (String(draft.jobAddress || "").trim() !== defaults.jobAddress) return true;
    if (String(draft.reportDate || "") !== defaults.reportDate) return true;
    if (String(draft.defaultRate || "") !== defaults.defaultRate) return true;
    if (String(draft.description || "").trim()) return true;
    return JSON.stringify((draft.entries || []).map(hoursEntrySnap)) !== JSON.stringify(defaults.entries.map(hoursEntrySnap));
  }

  function readHoursDraft() {
    try { return JSON.parse(localStorage.getItem(HOURS_DRAFT_KEY) || "null"); }
    catch (_) { return null; }
  }

  function clearHoursDraft() {
    try { localStorage.removeItem(HOURS_DRAFT_KEY); } catch (_) { /* ignore */ }
    $("#hoursDraftBanner")?.classList.add("hidden");
  }

  function revealHoursDraftBanner() {
    if (hoursDraftDismissed) return;
    $("#hoursDraftBanner")?.classList.remove("hidden");
  }

  function persistHoursDraft(immediate) {
    if (applyingHoursDraft) return;
    const write = () => {
      const draft = collectHoursDraft();
      if (!hoursDraftIsDirty(draft)) {
        clearHoursDraft();
        return;
      }
      try { localStorage.setItem(HOURS_DRAFT_KEY, JSON.stringify(draft)); }
      catch (error) { console.warn("No se pudo guardar el borrador de horas", error); }
      if (!$("#hoursView")?.classList.contains("hidden")) revealHoursDraftBanner();
    };
    if (immediate) {
      clearTimeout(hoursDraftTimer);
      write();
      return;
    }
    clearTimeout(hoursDraftTimer);
    hoursDraftTimer = setTimeout(write, 280);
  }

  function applyHoursDraft(draft) {
    if (!draft) return false;
    applyingHoursDraft = true;
    if ($("#hoursJobAddress")) $("#hoursJobAddress").value = draft.jobAddress || "";
    if ($("#hoursReportDate")) $("#hoursReportDate").value = draft.reportDate || "";
    if ($("#hoursDefaultRate")) $("#hoursDefaultRate").value = draft.defaultRate || "30";
    if ($("#hoursDescription")) $("#hoursDescription").value = draft.description || "";
    if ($("#hoursWhatsAppText") && draft.whatsappText != null) $("#hoursWhatsAppText").value = draft.whatsappText;
    entries = (draft.entries || []).length ? draft.entries.map(entry => ({ ...entry })) : defaultEntries();
    renderEntries();
    renderPreview();
    window.growTextareas?.();
    applyingHoursDraft = false;
    return true;
  }

  function restoreHoursDraft() {
    hoursDraftDismissed = false;
    const stored = readHoursDraft();
    if (hoursDraftIsDirty(collectHoursDraft())) {
      persistHoursDraft(true);
      return true;
    }
    if (hoursDraftIsDirty(stored)) {
      applyHoursDraft(stored);
      revealHoursDraftBanner();
      return true;
    }
    clearHoursDraft();
    return false;
  }

  function flushDraft() {
    persistHoursDraft(true);
  }

  function addHoursToClock(time, hours, lunchMinutes) {
    const match = String(time || "07:00").match(/^(\d{1,2}):(\d{2})$/);
    const start = match ? Number(match[1]) * 60 + Number(match[2]) : 7 * 60;
    const minutes = (start + Math.max(0, Math.round(Number(hours || 0) * 60)) + Math.max(0, Number(lunchMinutes) || 0)) % (24 * 60);
    return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
  }

  async function load() {
    reports = await root.CloudDB.listHours();
  }

  function reset(options = {}) {
    applyingHoursDraft = true;
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
    window.growTextareas?.();
    applyingHoursDraft = false;
    if (!options.keepDraft) clearHoursDraft();
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
    if (scheduleChanged) { renderEntries(); renderPreview(); persistHoursDraft(); return; }
    const total = $("[data-hours-total=\"" + index + "\"]");
    if (total) total.textContent = `Total: ${formatHours(HoursPDF.calcHours(entry))} horas · ${money(HoursPDF.calcHours(entry) * Number(entry.rate ?? $("#hoursDefaultRate").value ?? 0))}`;
    renderPreview();
    persistHoursDraft();
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
      tables.push(`<table class="hours-work-table"><thead><tr><th>DATE</th><th>EMPLOYEE</th><th>TIME IN</th><th>TIME OUT</th><th>LUNCH</th><th>TOTAL HOURS</th></tr></thead><tbody>${rows.map(row => `<tr><td>${esc(HoursPDF.dayName(row.date))}</td><td>${esc(employee)}</td><td>${esc(HoursPDF.timeLabel(row.timeIn))}</td><td>${esc(HoursPDF.timeLabel(row.timeOut))}</td><td>${esc(row.lunch)} MIN</td><td>${esc(formatHours(row.hours))} HRS</td></tr>`).join("")}</tbody><tfoot><tr><td>TOTAL</td><td></td><td></td><td></td><td></td><td>${esc(formatHours(total))} HRS</td></tr></tfoot></table>`);
    });
    $("#hoursPreviewTables").innerHTML = tables.join("") || '<p class="hours-empty-preview">Agrega empleados para ver las tablas.</p>';
    const summary = [...groups].map(([employee, rows]) => { const hours = rows.reduce((sum, row) => sum + row.hours, 0); const rate = [...new Set(rows.map(row => Number(row.rate) || 0))]; const pay = rows.reduce((sum, row) => sum + row.hours * (Number(row.rate) || 0), 0); return {employee, hours, rate: rate.length === 1 ? rate[0] : null, pay}; });
    $("#hoursSummaryRows").innerHTML = summary.map(row => `<tr><td>${esc(row.employee)}</td><td>${esc(formatHours(row.hours))} HRS</td><td>${row.rate == null ? "VARIES" : esc(money(row.rate) + "/HR")}</td><td>${esc(money(row.pay))}</td></tr>`).join("");
    const totalHours = summary.reduce((sum, row) => sum + row.hours, 0), totalPay = summary.reduce((sum, row) => sum + row.pay, 0);
    $("#hoursSummaryTotal").innerHTML = `<tr><td>TOTAL</td><td>${esc(formatHours(totalHours))} HRS</td><td></td><td>${esc(money(totalPay))}</td></tr>`;
    $("#hoursPreviewDescription").textContent = $("#hoursDescription").value.trim();
  }

  async function logoBytes() {
    try {
      const response = await fetch("assets/arrento-carpentry.png");
      if (!response.ok) return null;
      const buffer = await response.arrayBuffer();
      if (!buffer || buffer.byteLength < 32 || buffer.byteLength > 1500000) return null;
      return buffer;
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
    persistHoursDraft(true);
  }

  function recordFromImport(file, parsed, id) {
    const fields = parsed.fields || {};
    const defaultRate = Number(fields.defaultRate) || 0;
    const reportDate = fields.reportDate || today();
    const importedEntries = (parsed.entries || []).map(entry => {
      const hours = HoursPDF.calcHours({ ...entry, hoursOverride: entry.hoursOverride ?? entry.hours });
      return {
        date: entry.date || reportDate,
        employee: String(entry.employee || "").trim(),
        timeIn: entry.timeIn || "07:00",
        timeOut: entry.timeOut || "15:30",
        lunch: Number(entry.lunch) || 0,
        rate: Number(entry.rate) || defaultRate || 30,
        hoursOverride: entry.hoursOverride === "" || entry.hoursOverride == null ? hours : Number(entry.hoursOverride),
        hours
      };
    }).filter(entry => entry.employee);
    return {
      id,
      sourceId: parsed.sourceId || "",
      jobAddress: String(fields.jobAddress || "").trim(),
      reportDate,
      description: String(fields.description || "").trim(),
      defaultRate: defaultRate || (importedEntries[0]?.rate) || 30,
      entries: importedEntries,
      pdfBlob: file,
      pdfName: file?.name || fileName({ jobAddress: fields.jobAddress, reportDate }),
      pdfHash: parsed.pdfHash || "",
      updatedAt: new Date().toISOString(),
      source: "imported"
    };
  }

  function applyImported(record) {
    if (!record) return;
    $("#hoursJobAddress").value = record.jobAddress || "";
    $("#hoursReportDate").value = record.reportDate || today();
    $("#hoursDefaultRate").value = record.defaultRate || 30;
    $("#hoursDescription").value = record.description || "";
    entries = record.entries?.length ? record.entries.map(entry => ({ ...entry })) : [{
      date: record.reportDate || today(), employee: "", timeIn: "07:00", timeOut: "15:30", lunch: 30,
      rate: record.defaultRate || 30, scheduleAuto: true
    }];
    renderEntries();
    renderPreview();
    window.growTextareas?.();
    persistHoursDraft(true);
  }

  function hoursReady(record) {
    return Boolean(record?.jobAddress && record?.reportDate && record.entries?.length && record.entries.every(entry =>
      entry.employee && entry.date && entry.timeIn && entry.timeOut && HoursPDF.calcHours(entry) > 0 && Number(entry.rate) > 0
    ));
  }

  async function saveImportedRecord(record) {
    if (!record.pdfHash && record.pdfBlob) record.pdfHash = await HoursPDF.hash(record.pdfBlob);
    record.pdfName = record.pdfName || fileName(record);
    await root.CloudDB.saveHours(record);
    return record;
  }

  async function importHoursFiles(fileList) {
    const files = Array.from(fileList || []).filter(file => file && /\.pdf$/i.test(file.name));
    if (!files.length) {
      $("#hoursError").textContent = "Elige un PDF de horas (formato Arrento / este programa).";
      return [];
    }
    $("#hoursError").textContent = `Leyendo ${files.length === 1 ? "el PDF" : files.length + " PDFs"}…`;
    const saved = [];
    let lastRecord = null;
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      $("#hoursError").textContent = `Leyendo ${i + 1} de ${files.length}: ${file.name}`;
      const parsed = await HoursPDF.read(file);
      const record = recordFromImport(file, parsed, parsed.sourceId || makeId());
      lastRecord = record;
      applyImported(record);
      const parsedDate = /^\d{4}-\d{2}-\d{2}$/.test(String(parsed.fields?.reportDate || "")) ? parsed.fields.reportDate : "";
      if (parsedDate) record.reportDate = parsedDate;
      const canArchive = Boolean(record.jobAddress && parsedDate && record.pdfBlob);
      if (!hoursReady(record) && !canArchive) {
        $("#hoursError").textContent = (parsed.warnings.join(" ") || "Faltan datos del PDF.") + " Completa dirección y fecha en Horas / PDFs y pulsa Guardar reportes seleccionados.";
        if (root.TrentonControl?.toast) root.TrentonControl.toast("Revisa los datos del PDF antes de guardar.");
        return saved;
      }
      if (!hoursReady(record) && canArchive) {
        record.description = record.description || "PDF anterior importado. Se conservó el archivo original.";
      }
      try {
        await saveImportedRecord(record);
        saved.push(record);
      } catch (error) {
        $("#hoursError").textContent = error.message || "No se pudo guardar el reporte en la nube.";
        throw error;
      }
    }
    await load();
    renderHistory();
    window.TrentonControl?.hoursArchive?.render?.();
    if (lastRecord) applyImported(lastRecord);
    $("#hoursError").textContent = saved.length === 1
      ? "PDF adaptado al formulario y guardado en la nube. También queda en Horas de trabajo / PDFs."
      : `${saved.length} reportes de horas guardados en la web y en Supabase.`;
    if (root.TrentonControl?.toast) root.TrentonControl.toast($("#hoursError").textContent);
    return saved;
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
      if (!record.pdfBlob || record.pdfBlob.size < 80) throw new Error("El PDF salió vacío. Vuelve a intentar.");
      record.pdfHash = await HoursPDF.hash(record.pdfBlob);
      record.pdfName = fileName(record);
      $("#hoursError").textContent = "Guardando en la nube…";
      let cloudOk = false;
      try {
        await root.CloudDB.saveHours(record);
        cloudOk = true;
        await load(); renderHistory();
        window.TrentonControl?.hoursArchive?.render?.();
        $("#hoursError").textContent = "Guardado en la nube. Descargando PDF…";
        if (root.TrentonControl?.toast) root.TrentonControl.toast("Reporte de horas guardado en la nube");
        clearHoursDraft();
      } catch (cloudError) {
        console.error(cloudError);
        try { await load(); renderHistory(); } catch (_) { /* local copy may still show */ }
        $("#hoursError").textContent = "El reporte quedó en este teléfono, pero no en la nube: " + (cloudError.message || "revisa la conexión") + ". Si hours_reports está vacía, corre supabase/schema-fix-hours-cloud.sql y vuelve a guardar. Descargando PDF…";
        if (root.TrentonControl?.toast) root.TrentonControl.toast("PDF listo en el teléfono; la nube falló");
      }
      try { await download(record.pdfBlob, record.pdfName, { share: downloadAfter }); }
      catch (downloadError) { console.warn(downloadError); }
      if (cloudOk) {
        $("#hoursError").textContent = downloadAfter
          ? "PDF guardado en la nube, en este teléfono y descargado. También queda en Horas de trabajo / PDFs."
          : "Reporte y PDF guardados en la nube y en este teléfono. Si no se bajó, ábrelo en Horas de trabajo / PDFs.";
      }
    } catch (error) { console.error(error); $("#hoursError").textContent = error.message || "No se pudo generar el PDF de horas."; }
    finally { saving = false; $("#saveHoursButton").disabled = false; $("#downloadHoursButton").disabled = false; }
  }

  function renderHistory() {
    $("#hoursHistoryGrid").innerHTML = reports.length ? reports.map(record => {
      const rows = record.entries || [];
      const hours = rows.reduce((sum, entry) => sum + Number(entry.hours || 0), 0);
      const pay = rows.reduce((sum, entry) => sum + Number(entry.hours || 0) * Number(entry.rate || 0), 0);
      return `<article class="hours-history-card"><div><strong>${esc(record.jobAddress)}</strong><span>${esc(dateText(record.reportDate))}${record.cloudSynced === false ? " · solo en este teléfono" : ""}</span></div><b>${esc(formatHours(hours))} HRS · ${esc(money(pay))}</b><div class="hours-history-actions"><button class="button button-ghost" type="button" data-hours-download="${esc(record.id)}">Descargar PDF</button><button class="button button-danger" type="button" data-hours-delete="${esc(record.id)}">Eliminar</button></div></article>`;
    }).join("") : '<div class="hours-empty-history">Todavía no hay reportes guardados.</div>';
  }

  async function removeReport(record) {
    if (!record?.id) return;
    await root.CloudDB.softDeleteHours(record);
    reports = reports.filter(item => item.id !== record.id);
    renderHistory();
    window.TrentonControl?.hoursArchive?.render?.();
  }

  async function open() {
    try { await load(); renderHistory(); }
    catch (error) { $("#hoursError").textContent = error.message || "No se pudo abrir el almacenamiento de horas."; }
    restoreHoursDraft();
    renderPreview();
    window.growTextareas?.();
  }
  async function boot() {
    try {
      await load();
      renderHistory();
      window.TrentonControl?.hoursArchive?.render?.();
    } catch (error) {
      console.warn(error);
    } finally {
      restoreHoursDraft();
    }
  }
  function render() { renderHistory(); renderPreview(); }
  $("#hoursEntries").addEventListener("input", event => { const field = event.target.dataset.hoursField; if (field) updateEntry(Number(event.target.dataset.index), field, event.target.value); });
  $("#hoursEntries").addEventListener("click", event => { const button = event.target.closest("[data-hours-action=remove]"); if (!button || entries.length === 1) return; entries.splice(Number(button.dataset.index), 1); renderEntries(); renderPreview(); persistHoursDraft(); });
  $("#addHoursEntryButton").addEventListener("click", () => { entries.push({date: $("#hoursReportDate").value || today(), employee: "", timeIn: "07:00", timeOut: "15:30", lunch: 30, rate: Number($("#hoursDefaultRate").value) || 30, scheduleAuto: true}); renderEntries(); renderPreview(); persistHoursDraft(); });
  ["hoursJobAddress", "hoursReportDate", "hoursDefaultRate", "hoursDescription"].forEach(id => $("#" + id).addEventListener("input", () => { if (id === "hoursDefaultRate") renderEntries(); renderPreview(); window.growTextareas?.(); persistHoursDraft(); }));
  $("#hoursWhatsAppText")?.addEventListener("input", () => persistHoursDraft(true));
  $("#parseHoursWhatsAppButton").addEventListener("click", parseHoursWhatsAppText);
  $("#hoursWhatsAppText").addEventListener("paste", () => setTimeout(parseHoursWhatsAppText, 80));
  $("#saveHoursButton").addEventListener("click", () => save(false)); $("#downloadHoursButton").addEventListener("click", () => save(true));
  $("#resetHoursButton").addEventListener("click", () => {
    if (hoursDraftIsDirty(collectHoursDraft()) && !confirm("¿Limpiar este reporte? Se pierde el trabajo sin guardar.")) return;
    reset();
  });
  $("#keepHoursDraftButton")?.addEventListener("click", () => {
    hoursDraftDismissed = true;
    $("#hoursDraftBanner")?.classList.add("hidden");
  });
  $("#discardHoursDraftButton")?.addEventListener("click", () => {
    if (!confirm("¿Descartar este reporte de horas sin guardar?")) return;
    reset();
  });
  $("#importHoursPdfButton")?.addEventListener("click", () => $("#importHoursPdfFile")?.click());
  $("#importHoursPdfFile")?.addEventListener("change", async event => {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    if (!files.length) return;
    if (files.some(file => /\.zip$/i.test(file.name))) {
      window.TrentonControl?.hoursArchive?.importFiles?.(files);
      return;
    }
    try { await importHoursFiles(files); }
    catch (error) { $("#hoursError").textContent = error.message || "No se pudo importar el PDF de horas."; }
  });
  $("#hoursHistoryGrid").addEventListener("click", async event => {
    const del = event.target.closest("[data-hours-delete]");
    if (del) {
      const record = reports.find(item => item.id === del.dataset.hoursDelete);
      if (!record || !confirm(`¿Eliminar el reporte de horas de ${record.jobAddress || "esta dirección"}? Saldrá de la web y de la nube.`)) return;
      try { await removeReport(record); }
      catch (error) { $("#hoursError").textContent = error.message || "No se pudo eliminar el reporte."; }
      return;
    }
    const button = event.target.closest("[data-hours-download]"); if (!button) return;
    const record = reports.find(item => item.id === button.dataset.hoursDownload);
    if (!record) return;
    try {
      await root.CloudDB.ensureHoursPdf(record);
      if (record.pdfBlob) await download(record.pdfBlob, record.pdfName || fileName(record), { share: true });
      else $("#hoursError").textContent = "No hay PDF de horas para descargar.";
    } catch (error) { $("#hoursError").textContent = error.message || "No se pudo descargar el PDF."; }
  });
  function resetSession() { reports = []; renderHistory(); window.TrentonControl?.hoursArchive?.render?.(); }
  document.addEventListener("visibilitychange", () => { if (document.hidden) persistHoursDraft(true); });
  window.addEventListener("pagehide", () => persistHoursDraft(true));
  reset({ keepDraft: true });
  restoreHoursDraft();
  root.HoursApp = {open, render, boot, resetSession, flushDraft, restoreHoursDraft, reports: () => reports, importHoursFiles, applyImported, hoursReady, recordFromImport, removeReport};
})(typeof globalThis !== "undefined" ? globalThis : this);

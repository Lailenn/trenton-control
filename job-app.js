/* Job report form: several days, description, preview, save and download. */
(function (root) {
  "use strict";
  const $ = selector => document.querySelector(selector);
  const esc = value => String(value ?? "").replace(/[&<>'"]/g, char => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#039;", '"': "&quot;"}[char]));
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
  const money = value => `$${Number(value || 0).toLocaleString("en-US", {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
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
  const JOB_DRAFT_KEY = "trenton.draft.job";
  function jobDraftKey() {
    return root.CompanyApp?.draftKey?.("job") || JOB_DRAFT_KEY;
  }
  let jobDraftTimer = 0;
  let applyingJobDraft = false;
  let jobDraftDismissed = false;

  function jobDraftDefaults() {
    return {
      jobAddress: "1117 C St SE, Washington, DC 20003",
      defaultRate: "30",
      whatsappText: "",
      entries: defaultEntries()
    };
  }

  function jobEntrySnap(entry) {
    return {
      date: String(entry?.date || ""),
      employee: String(entry?.employee || "").trim(),
      description: String(entry?.description || "").trim(),
      timeIn: String(entry?.timeIn || ""),
      timeOut: String(entry?.timeOut || ""),
      lunch: Number(entry?.lunch) || 0,
      rate: Number(entry?.rate ?? 30),
      hoursOverride: entry?.hoursOverride === "" || entry?.hoursOverride == null ? "" : Number(entry.hoursOverride)
    };
  }

  function collectJobDraft() {
    return {
      savedAt: Date.now(),
      jobAddress: $("#jobAddress")?.value || "",
      defaultRate: $("#jobDefaultRate")?.value || "",
      whatsappText: $("#jobWhatsAppText")?.value || "",
      entries: entries.map(jobEntrySnap)
    };
  }

  function jobDraftIsDirty(draft) {
    if (!draft) return false;
    const defaults = jobDraftDefaults();
    if ((draft.whatsappText || "").trim()) return true;
    if (String(draft.jobAddress || "").trim() !== defaults.jobAddress) return true;
    if (String(draft.defaultRate || "") !== defaults.defaultRate) return true;
    return JSON.stringify((draft.entries || []).map(jobEntrySnap)) !== JSON.stringify(defaults.entries.map(jobEntrySnap));
  }

  function readJobDraft() {
    try { return JSON.parse(localStorage.getItem(jobDraftKey()) || "null"); }
    catch (_) { return null; }
  }

  function clearJobDraft() {
    try { localStorage.removeItem(jobDraftKey()); } catch (_) { /* ignore */ }
    $("#jobDraftBanner")?.classList.add("hidden");
  }

  function revealJobDraftBanner() {
    if (jobDraftDismissed) return;
    $("#jobDraftBanner")?.classList.remove("hidden");
  }

  function persistJobDraft(immediate) {
    if (applyingJobDraft) return;
    const write = () => {
      const draft = collectJobDraft();
      if (!jobDraftIsDirty(draft)) {
        clearJobDraft();
        return;
      }
      try { localStorage.setItem(jobDraftKey(), JSON.stringify(draft)); }
      catch (error) { console.warn("No se pudo guardar el borrador de otro formato de horas", error); }
      if (!$("#jobView")?.classList.contains("hidden")) revealJobDraftBanner();
    };
    if (immediate) {
      clearTimeout(jobDraftTimer);
      write();
      return;
    }
    clearTimeout(jobDraftTimer);
    jobDraftTimer = setTimeout(write, 280);
  }

  function applyJobDraft(draft) {
    if (!draft) return false;
    applyingJobDraft = true;
    if ($("#jobAddress")) $("#jobAddress").value = draft.jobAddress || "";
    if ($("#jobDefaultRate")) $("#jobDefaultRate").value = draft.defaultRate || "30";
    if ($("#jobWhatsAppText") && draft.whatsappText != null) $("#jobWhatsAppText").value = draft.whatsappText;
    entries = (draft.entries || []).length ? draft.entries.map(entry => ({ ...entry })) : defaultEntries();
    renderEntries();
    renderPreview();
    applyingJobDraft = false;
    return true;
  }

  function restoreJobDraft() {
    jobDraftDismissed = false;
    const stored = readJobDraft();
    if (jobDraftIsDirty(collectJobDraft())) {
      persistJobDraft(true);
      return true;
    }
    if (jobDraftIsDirty(stored)) {
      applyJobDraft(stored);
      revealJobDraftBanner();
      return true;
    }
    clearJobDraft();
    return false;
  }

  function flushDraft() {
    persistJobDraft(true);
  }

  async function load() {
    reports = await root.CloudDB.listJobs();
    reports.forEach(record => {
      if (isOriginalPdfJob(record)) {
        record.keepOriginalPdf = true;
        record.source = "imported";
      }
    });
  }

  function reset(options = {}) {
    applyingJobDraft = true;
    $("#jobAddress").setAttribute("list", "addressHistory");
    $("#jobAddress").value = "1117 C St SE, Washington, DC 20003";
    $("#jobDefaultRate").value = "30";
    $("#jobWhatsAppText").value = "";
    $("#jobWhatsAppResult").textContent = "";
    $("#jobWhatsAppResult").classList.add("hidden");
    entries = defaultEntries();
    $("#jobError").textContent = "";
    renderEntries(); renderPreview();
    applyingJobDraft = false;
    if (!options.keepDraft) clearJobDraft();
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
    persistJobDraft();
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
      $("#jobWhatsAppResult").innerHTML = "<p>Pega primero el texto del reporte o del PDF.</p>";
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
    persistJobDraft(true);
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
      stage: "created",
      received: 0,
      due: 0,
      note: "",
      checkPhotos: [],
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
    persistJobDraft(true);
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
      stage: "created",
      received: 0,
      due: 0,
      note: "",
      checkPhotos: [],
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
    $("#jobError").textContent = saved.length === 1 ? "PDF de otro formato de horas guardado en la nube." : `${saved.length} reportes de otro formato de horas guardados.`;
    return saved;
  }

  async function rebuildPdf(record, persist = false, fromPaper = false) {
    if (!record) return null;
    if (!fromPaper && isOriginalPdfJob(record)) {
      if (!record.pdfBlob) await root.CloudDB.ensureJobPdf(record);
      return record.pdfBlob || null;
    }
    const canBuild = (record.entries || []).some(entry => String(entry.employee || "").trim());
    if (!canBuild) {
      if (!record.pdfBlob) await root.CloudDB.ensureJobPdf(record);
      return record.pdfBlob || null;
    }
    const blob = await JobPDF.generate({...record, recordId: record.id}, await logoBytes(), {fromPaper});
    if (!blob || blob.size < 80) throw new Error("El PDF salió vacío. Vuelve a intentar.");
    record.pdfBlob = blob;
    record.pdfHash = await JobPDF.hash(blob);
    record.pdfName = fileName(record);
    if (persist) {
      try { await root.CloudDB.saveJob(record); }
      catch (error) { console.warn("PDF A3 listo; no se pudo actualizar la nube.", error); }
    }
    return blob;
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
      await rebuildPdf(record, false, true);
      if (!record.pdfBlob || record.pdfBlob.size < 80) throw new Error("El PDF salió vacío. Vuelve a intentar.");
      $("#jobError").textContent = "Guardando en la nube…";
      let cloudOk = false;
      try {
        await root.CloudDB.saveJob(record);
        cloudOk = true;
        await load(); renderHistory(); renderJobBoard();
        window.TrentonControl?.jobArchive?.render?.();
        if (root.TrentonControl?.toast) root.TrentonControl.toast("Otro formato de horas guardado en la nube");
        clearJobDraft();
      } catch (cloudError) {
        console.error(cloudError);
        try { await load(); renderHistory(); renderJobBoard(); } catch (_) { /* local copy */ }
        $("#jobError").textContent = "El reporte quedó en este aparato, pero no en la nube: " + (cloudError.message || "revisa la conexión") + ". Corre supabase/schema-job-reports.sql y vuelve a guardar.";
        if (root.TrentonControl?.toast) root.TrentonControl.toast("PDF listo; la nube falló");
      }
      try { await download(record.pdfBlob, record.pdfName, { share: downloadAfter }); }
      catch (downloadError) { console.warn(downloadError); }
      if (cloudOk) {
        $("#jobError").textContent = downloadAfter
          ? "PDF A3 guardado en la nube, en este aparato y descargado. También queda en Horas / PDFs."
          : "Reporte y PDF A3 guardados en la nube. Si no se bajó, ábrelo en Horas / PDFs.";
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

  const jobStages = [
    { id: "created", title: "Reporte creado", className: "column-created" },
    { id: "sent", title: "Enviado a Trenton", className: "column-working" },
    { id: "paid", title: "Pagado", className: "column-paid" }
  ];
  const JOB_COLUMN_PREVIEW = 5;
  const expandedJobColumns = new Set();
  let editingJobId = null;
  let draggedJobId = null;
  let creatingJob = false;
  let creatingJobStage = "created";
  let pendingJobPdf = null;
  const IMPORTED_PDF_EMPLOYEE = "Imported PDF";
  const MAX_JOB_PDF_BYTES = 15 * 1024 * 1024;

  function isOriginalPdfJob(record) {
    if (!record) return false;
    if (record.keepOriginalPdf || record.source === "imported") return true;
    const rows = record.entries || [];
    return rows.length === 1 && String(rows[0].employee || "") === IMPORTED_PDF_EMPLOYEE;
  }
  function importedPdfEntry(address, date, amount) {
    return {
      date,
      employee: IMPORTED_PDF_EMPLOYEE,
      description: address,
      timeIn: "",
      timeOut: "",
      lunch: 0,
      rate: amount,
      hoursOverride: 1,
      hours: 1
    };
  }
  function jobPay(record) {
    return (record.entries || []).reduce((sum, entry) => sum + Number(entry.hours || JobPDF.calcHours(entry) || 0) * Number(entry.rate || 0), 0);
  }
  function jobTotalHours(record) {
    if (isOriginalPdfJob(record)) return 0;
    return (record.entries || []).reduce((sum, entry) => sum + Number(entry.hours || JobPDF.calcHours(entry) || 0), 0);
  }
  function jobDollars(value) {
    return Math.max(0, Math.round((Number(value) || 0) * 100) / 100);
  }
  function parseJobMoney(value) {
    if (value == null || value === "") return 0;
    const parsed = root.InvoiceCore?.amount?.(value);
    if (parsed != null) return jobDollars(parsed);
    const fallback = Number(String(value).replace(/[^\d.]/g, ""));
    return Number.isFinite(fallback) ? jobDollars(fallback) : 0;
  }
  function jobDueAmount(record) {
    return jobDollars(jobPay(record) - Number(record.received || 0));
  }
  function jobStageId(record) {
    const stage = record?.stage || "created";
    return stage === "waiting" ? "sent" : stage;
  }
  function jobDateText(record) {
    if (isOriginalPdfJob(record) && record.startDate) return record.startDate;
    return JobPDF.rangeLabel((record.entries || []).map(entry => entry.date)) || record.startDate || "Sin fecha";
  }
  function matchesJobSearch(record) {
    const q = ($("#jobBoardSearch")?.value || "").trim().toLowerCase();
    if (!q) return true;
    return [record.jobAddress, record.note, jobDateText(record)].some(value => String(value || "").toLowerCase().includes(q));
  }
  function syncJobBalance() {
    const total = parseJobMoney($("#jobEditTotal")?.value);
    const received = parseJobMoney($("#jobEditReceived")?.value);
    const due = jobDollars(total - received);
    if ($("#jobEditDue")) $("#jobEditDue").value = due.toFixed(2);
    if ($("#jobBalanceLive")) $("#jobBalanceLive").textContent = `Total ${money(total)} · recibido ${money(received)} · se debe ${money(due)}`;
    return { received, due, total };
  }
  function jobCard(record) {
    const hours = jobTotalHours(record);
    const pay = jobPay(record);
    const due = jobDueAmount(record);
    const received = Number(record.received || 0);
    const dueHtml = received > 0 || due > 0
      ? (due > 0.004 ? `<p class="card-due">Se debe ${money(due)}</p>` : `<p class="card-due is-clear">Saldo cubierto</p>`)
      : "";
    const checks = record.stage === "sent" || record.stage === "paid" || (record.checkPhotos || []).length
      ? `<div class="card-check">${(record.checkPhotos || []).length ? `<span class="check-badge">Cheque ×${record.checkPhotos.length}</span>` : `<span class="check-badge" style="background:#eef1fb;color:#5b6580">Sin foto</span>`}<button class="card-check-btn" type="button" data-job-home="attach-check" data-id="${esc(record.id)}">Subir cheque</button></div>`
      : "";
    return `<article class="invoice-card" draggable="true" data-job-id="${esc(record.id)}" tabindex="0">
      <div class="card-top"><span class="card-invoice"><i class="card-dot"></i>TRENTON</span><button class="card-menu" type="button" data-job-home="menu" data-id="${esc(record.id)}" aria-label="Editar reporte">•••</button></div>
      <p class="card-date">${esc(jobDateText(record))}</p>
      <h4 class="card-address">${esc(record.jobAddress || "Sin dirección")}</h4>
      <div class="card-details"><span class="card-hours">${isOriginalPdfJob(record) ? "PDF" : `${esc(formatHours(hours))} hrs`}</span><span class="card-amount">${money(pay)}</span></div>
      ${dueHtml}
      ${record.note ? `<p class="card-date">${esc(record.note)}</p>` : ""}
      ${checks}
    </article>`;
  }
  function renderJobBoard() {
    const board = $("#jobHomeBoard");
    if (!board) return;
    const visible = reports.filter(matchesJobSearch);
    board.innerHTML = jobStages.map(stage => {
      const items = visible.filter(record => jobStageId(record) === stage.id);
      const expanded = expandedJobColumns.has(stage.id);
      const shown = expanded ? items : items.slice(0, JOB_COLUMN_PREVIEW);
      const hiddenCount = Math.max(0, items.length - shown.length);
      const more = items.length > JOB_COLUMN_PREVIEW
        ? `<button class="column-more" type="button" data-job-home="toggle-column" data-stage="${stage.id}">${expanded ? "Ver menos" : `Ver más (${hiddenCount})`}</button>`
        : "";
      return `<section class="kanban-column ${stage.className}${expanded ? " is-expanded" : ""}" data-stage="${stage.id}"><header class="column-head"><div class="column-title"><h3>${stage.title}</h3></div><span class="column-count">${items.length}</span></header><div class="column-cards">${items.length ? shown.map(jobCard).join("") + more : `<div class="empty-column">Sin reportes en esta fase</div>`}</div><button class="add-card-button" type="button" data-job-home="add" data-stage="${stage.id}">+ Agregar reporte</button></section>`;
    }).join("");
    wireJobHomeBoard();
    renderJobCheckDesk();
  }
  function wireJobHomeBoard() {
    const board = $("#jobHomeBoard");
    if (!board) return;
    board.querySelectorAll(".invoice-card").forEach(card => {
      card.addEventListener("dragstart", event => {
        draggedJobId = card.dataset.jobId;
        card.classList.add("dragging");
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", draggedJobId);
      });
      card.addEventListener("dragend", () => {
        draggedJobId = null;
        card.classList.remove("dragging");
        board.querySelectorAll(".kanban-column").forEach(column => column.classList.remove("drag-over"));
      });
    });
    board.querySelectorAll(".kanban-column").forEach(column => {
      column.addEventListener("dragover", event => { event.preventDefault(); column.classList.add("drag-over"); });
      column.addEventListener("dragleave", event => { if (!column.contains(event.relatedTarget)) column.classList.remove("drag-over"); });
      column.addEventListener("drop", event => {
        event.preventDefault();
        event.stopPropagation();
        column.classList.remove("drag-over");
        const id = draggedJobId || event.dataTransfer.getData("text/plain");
        moveJobToStage(id, column.dataset.stage);
      });
    });
  }
  async function moveJobToStage(id, stage) {
    const record = reports.find(item => item.id === id);
    if (!record || !stage || record.stage === stage) return;
    if (stage === "paid" && !(record.checkPhotos || []).length) {
      if (!confirm("¿Ya adjuntaste la foto del cheque? Puedes marcar pagado ahora y subirla después.")) return;
    }
    record.stage = stage;
    try {
      await root.CloudDB.saveJob(record);
      renderJobBoard();
      renderHistory();
      if (root.TrentonControl?.toast) root.TrentonControl.toast(`Movido a “${jobStages.find(item => item.id === stage)?.title || stage}”`);
    } catch (error) {
      if (root.TrentonControl?.toast) root.TrentonControl.toast(error.message || "No se pudo mover el reporte.");
    }
  }
  async function renderJobEditChecks(record) {
    const grid = $("#jobEditCheckGrid");
    if (!grid) return;
    const photos = record?.checkPhotos || [];
    if (!photos.length) { grid.innerHTML = "<p class=\"check-empty\">Todavía no hay fotos de cheque.</p>"; return; }
    const cards = [];
    for (const photo of photos) {
      try {
        const blob = await root.CloudDB.ensureCheckPhoto(photo);
        const url = URL.createObjectURL(blob);
        cards.push(`<figure class="check-thumb"><img src="${url}" alt="${esc(photo.file_name || "Cheque")}"><button type="button" class="mini-action delete" data-job-check-id="${esc(photo.id)}" aria-label="Quitar foto">×</button></figure>`);
      } catch (_) {
        cards.push(`<figure class="check-thumb"><span>No se pudo abrir</span></figure>`);
      }
    }
    grid.innerHTML = cards.join("");
  }
  function setJobPdfStatus(file, existingName) {
    const status = $("#jobBoardFileStatus");
    const current = $("#jobCurrentFile");
    if (file) {
      if (status) status.textContent = `PDF listo: ${file.name}`;
      if (current) {
        current.classList.remove("hidden");
        current.textContent = `Se adjuntará ${file.name} al guardar.`;
      }
      return;
    }
    if (existingName) {
      if (status) status.textContent = "Puedes dejar este PDF o elegir otro.";
      if (current) {
        current.classList.remove("hidden");
        current.textContent = `PDF actual: ${existingName}`;
      }
      return;
    }
    if (status) status.textContent = "Formato PDF · hasta 15 MB";
    current?.classList.add("hidden");
  }
  function fillJobModalFromParsed(parsed, file) {
    const fields = parsed?.fields || {};
    const imported = (parsed?.entries || []);
    const dates = datesOf(imported);
    const pay = imported.reduce((sum, entry) => sum + Number(entry.hours || JobPDF.calcHours(entry) || 0) * Number(entry.rate || 0), 0);
    if ($("#jobEditAddress") && !$("#jobEditAddress").value.trim()) {
      $("#jobEditAddress").value = String(fields.jobAddress || "").trim();
    }
    if ($("#jobEditDate") && !$("#jobEditDate").value) {
      $("#jobEditDate").value = dates[0] || today();
    }
    if ($("#jobEditTotal") && !String($("#jobEditTotal").value || "").trim() && pay > 0) {
      $("#jobEditTotal").value = jobDollars(pay).toFixed(2);
    }
    setJobPdfStatus(file, "");
    syncJobBalance();
  }
  function showJobModal() {
    $("#jobBoardFormError").textContent = "";
    $("#jobModalBackdrop")?.classList.remove("hidden");
    if (root.setModalOpen) root.setModalOpen(true);
    else document.body.classList.add("modal-open");
  }
  function openJobCreateModal(stage = "created") {
    creatingJob = true;
    creatingJobStage = stage || "created";
    editingJobId = null;
    $("#jobModalTitle").textContent = "Nuevo reporte a Trenton";
    $("#jobEditAddress").value = "";
    if ($("#jobEditDate")) $("#jobEditDate").value = today();
    if ($("#jobEditTotal")) $("#jobEditTotal").value = "";
    $("#jobEditStage").value = creatingJobStage;
    $("#jobEditReceived").value = "";
    $("#jobEditOpenForm")?.classList.add("hidden");
    if ($("#saveJobBoardButton")) $("#saveJobBoardButton").textContent = "Guardar reporte";
    setJobPdfStatus(pendingJobPdf, "");
    renderJobEditChecks(null);
    syncJobBalance();
    showJobModal();
  }
  function openJobModal(record) {
    if (!record) return;
    creatingJob = false;
    pendingJobPdf = null;
    editingJobId = record.id;
    $("#jobModalTitle").textContent = "Editar reporte final";
    $("#jobEditAddress").value = record.jobAddress || "";
    if ($("#jobEditDate")) $("#jobEditDate").value = record.startDate || (record.entries || []).map(entry => entry.date).filter(Boolean).sort()[0] || "";
    if ($("#jobEditTotal")) $("#jobEditTotal").value = jobDollars(jobPay(record)).toFixed(2);
    $("#jobEditStage").value = jobStageId(record);
    $("#jobEditReceived").value = jobDollars(record.received).toFixed(2);
    $("#jobEditOpenForm")?.classList.add("hidden");
    if ($("#saveJobBoardButton")) $("#saveJobBoardButton").textContent = "Guardar cambios";
    setJobPdfStatus(null, record.pdfName || "");
    syncJobBalance();
    renderJobEditChecks(record);
    showJobModal();
  }
  function closeJobModal() {
    $("#jobModalBackdrop")?.classList.add("hidden");
    if (root.setModalOpen) root.setModalOpen(false);
    else document.body.classList.remove("modal-open");
    editingJobId = null;
    creatingJob = false;
    pendingJobPdf = null;
    const picker = $("#jobBoardPdfFile");
    if (picker) picker.value = "";
  }
  async function acceptJobPdf(file) {
    if (!file) return;
    if (file.size > MAX_JOB_PDF_BYTES) {
      $("#jobBoardFormError").textContent = "El PDF supera el límite de 15 MB.";
      return;
    }
    if (file.type && file.type !== "application/pdf" && !/\.pdf$/i.test(file.name)) {
      $("#jobBoardFormError").textContent = "Solo puedes subir archivos PDF.";
      return;
    }
    pendingJobPdf = file;
    $("#jobBoardFormError").textContent = "Leyendo el PDF…";
    try {
      const parsed = await JobPDF.read(file);
      fillJobModalFromParsed(parsed, file);
      $("#jobBoardFormError").textContent = "";
    } catch (_) {
      fillJobModalFromParsed({}, file);
      $("#jobBoardFormError").textContent = "No se pudieron leer los datos. Completa nombre, fecha y monto a mano; el PDF sí se adjuntará.";
    }
  }
  async function saveJobBoardForm(event) {
    event.preventDefault();
    const address = $("#jobEditAddress").value.trim();
    const date = $("#jobEditDate")?.value || "";
    const balance = syncJobBalance();
    if (!address) { $("#jobBoardFormError").textContent = "Escribe el nombre o la dirección."; return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { $("#jobBoardFormError").textContent = "Elige la fecha del reporte."; return; }
    if (!(balance.total > 0)) { $("#jobBoardFormError").textContent = "Escribe un monto válido."; return; }
    const record = creatingJob ? null : reports.find(item => item.id === editingJobId);
    if (!creatingJob && !record) return;
    if (creatingJob && !pendingJobPdf) {
      $("#jobBoardFormError").textContent = "Sube el PDF antiguo antes de guardar.";
      return;
    }
    const target = record || {
      id: makeId(),
      source: "imported",
      keepOriginalPdf: true,
      note: "",
      checkPhotos: [],
      defaultRate: 30,
      updatedAt: new Date().toISOString()
    };
    target.jobAddress = address;
    target.startDate = date;
    target.endDate = date;
    target.stage = $("#jobEditStage").value || target.stage || creatingJobStage || "created";
    target.received = balance.received;
    target.due = balance.due;
    target.keepOriginalPdf = true;
    target.source = "imported";
    target.entries = [importedPdfEntry(address, date, balance.total)];
    if (pendingJobPdf) {
      target.pdfBlob = pendingJobPdf;
      target.pdfName = pendingJobPdf.name;
      try { target.pdfHash = JobPDF.hash ? await JobPDF.hash(pendingJobPdf) : `pdf-${Date.now()}`; }
      catch (_) { target.pdfHash = `pdf-${Date.now()}`; }
    }
    const wasCreate = creatingJob;
    try {
      await root.CloudDB.saveJob(target);
      if (wasCreate) reports = [target, ...reports.filter(item => item.id !== target.id)];
      closeJobModal();
      renderJobBoard();
      renderHistory();
      window.TrentonControl?.jobArchive?.render?.();
      if (root.TrentonControl?.toast) root.TrentonControl.toast(wasCreate ? "PDF adjunto y reporte en el tablero." : "Reporte a Trenton actualizado");
    } catch (error) {
      $("#jobBoardFormError").textContent = error.message || "No se pudo guardar. Corre el SQL de reportes a Trenton.";
    }
  }
  async function renderJobCheckDesk() {
    const select = $("#jobCheckDeskReport");
    const status = $("#jobCheckDeskStatus");
    const grid = $("#jobCheckDeskGrid");
    if (!select || !status || !grid) return;
    const list = reports.filter(record => record.stage === "sent" || record.stage === "paid" || (record.checkPhotos || []).length);
    const current = select.value;
    const empty = !list.length;
    $("#jobCheckDesk")?.classList.toggle("is-empty", empty);
    select.disabled = empty;
    if ($("#jobCheckDeskGalleryButton")) $("#jobCheckDeskGalleryButton").disabled = empty;
    if ($("#jobCheckDeskCameraButton")) $("#jobCheckDeskCameraButton").disabled = empty;
    select.innerHTML = list.length
      ? list.map(record => `<option value="${esc(record.id)}">${esc(record.jobAddress || "Reporte")} · ${esc(jobDateText(record))}</option>`).join("")
      : `<option value="">Elige un reporte</option>`;
    if (current && list.some(record => record.id === current)) select.value = current;
    const record = reports.find(item => item.id === select.value);
    if (!record) {
      status.textContent = "Mueve un reporte a Enviado a Trenton o Pagado y aquí podrás subir la foto.";
      grid.innerHTML = "";
      return;
    }
    const photos = record.checkPhotos || [];
    status.textContent = photos.length
      ? `${photos.length} foto${photos.length === 1 ? "" : "s"} para ${record.jobAddress}.`
      : `Aún no hay foto del cheque de ${record.jobAddress}.`;
    if (!photos.length) { grid.innerHTML = ""; return; }
    const cards = [];
    for (const photo of photos) {
      try {
        const blob = await root.CloudDB.ensureCheckPhoto(photo);
        const url = URL.createObjectURL(blob);
        cards.push(`<figure class="check-thumb"><img src="${url}" alt="${esc(photo.file_name || "Cheque")}"><button type="button" class="mini-action delete" data-job-desk-check="${esc(photo.id)}" aria-label="Quitar foto">×</button></figure>`);
      } catch (_) {
        cards.push(`<figure class="check-thumb"><span>No se pudo abrir</span></figure>`);
      }
    }
    grid.innerHTML = cards.join("");
  }
  function openJobCheckPicker(reportId, camera) {
    const picker = camera ? $("#jobCheckDeskCamera") : $("#jobCheckDeskFile");
    if (!picker) return;
    picker.dataset.reportId = reportId || "";
    picker.click();
  }
  async function addJobCheck(reportId, files) {
    const record = reports.find(item => item.id === reportId);
    if (!record) throw new Error("Elige primero un reporte enviado a Trenton.");
    for (const file of Array.from(files || []).filter(Boolean)) {
      const photo = await root.CloudDB.addJobCheckPhoto(record.id, file);
      record.checkPhotos = [photo, ...(record.checkPhotos || [])];
    }
    renderJobBoard();
    if (editingJobId === record.id) renderJobEditChecks(record);
    return record;
  }

  function renderHistory() {
    if (!$("#jobHistoryGrid")) return;
    $("#jobHistoryGrid").innerHTML = reports.length ? reports.map(record => {
      const rows = record.entries || [];
      const hours = rows.reduce((sum, entry) => sum + Number(entry.hours || JobPDF.calcHours(entry)), 0);
      const pay = rows.reduce((sum, entry) => sum + Number(entry.hours || JobPDF.calcHours(entry)) * Number(entry.rate || 0), 0);
      const range = JobPDF.rangeLabel(datesOf(rows)) || record.startDate || "";
      return `<article class="hours-history-card"><div><strong>${esc(record.jobAddress)}</strong><span>${esc(range)}${record.cloudSynced === false ? " · solo en este aparato" : ""}</span></div><b>${esc(formatHours(hours))} HRS · ${esc(money(pay))}</b><div class="hours-history-actions"><button class="button button-ghost" type="button" data-job-download="${esc(record.id)}">Descargar PDF</button><button class="button button-danger" type="button" data-job-delete="${esc(record.id)}">Eliminar</button></div></article>`;
    }).join("") : '<div class="hours-empty-history">Todavía no hay reportes de este formato guardados.</div>';
  }

  async function removeReport(record) {
    if (!record?.id) return;
    await root.CloudDB.softDeleteJob(record);
    reports = reports.filter(item => item.id !== record.id);
    renderHistory();
    renderJobBoard();
    window.TrentonControl?.jobArchive?.render?.();
  }

  async function open() {
    try { await load(); renderHistory(); renderJobBoard(); }
    catch (error) { $("#jobError").textContent = error.message || "No se pudo abrir el archivo de este formato."; }
    restoreJobDraft();
    renderPreview();
  }
  async function boot() {
    try {
      await load();
      renderHistory();
      renderJobBoard();
      window.TrentonControl?.jobArchive?.render?.();
    } catch (error) {
      console.warn(error);
    } finally {
      restoreJobDraft();
    }
  }
  function render() { renderHistory(); renderJobBoard(); renderPreview(); }

  $("#jobEntries")?.addEventListener("input", event => {
    const field = event.target.dataset.jobField;
    if (field) updateEntry(Number(event.target.dataset.index), field, event.target.value);
  });
  $("#jobEntries")?.addEventListener("change", event => {
    const field = event.target.dataset.jobField;
    if (field) updateEntry(Number(event.target.dataset.index), field, event.target.value);
  });
  $("#jobEntries")?.addEventListener("click", event => {
    const button = event.target.closest("[data-job-action=remove]");
    if (!button || entries.length === 1) return;
    entries.splice(Number(button.dataset.index), 1);
    renderEntries(); renderPreview(); persistJobDraft();
  });
  $("#addJobEntryButton")?.addEventListener("click", () => {
    const last = entries[entries.length - 1];
    entries.push({
      date: last?.date || today(), employee: "", description: last?.description || "",
      timeIn: last?.timeIn || "07:00", timeOut: last?.timeOut || "15:30",
      lunch: last?.lunch ?? 30, rate: Number($("#jobDefaultRate").value) || 30, hoursOverride: ""
    });
    renderEntries(); renderPreview(); persistJobDraft();
  });
  ["jobAddress", "jobDefaultRate"].forEach(id => $("#" + id)?.addEventListener("input", () => { if (id === "jobDefaultRate") renderEntries(); renderPreview(); persistJobDraft(); }));
  $("#jobWhatsAppText")?.addEventListener("input", () => persistJobDraft(true));
  $("#parseJobWhatsAppButton")?.addEventListener("click", parseJobText);
  $("#jobWhatsAppText")?.addEventListener("paste", () => setTimeout(parseJobText, 80));
  $("#saveJobButton")?.addEventListener("click", () => save(false));
  $("#downloadJobButton")?.addEventListener("click", () => save(true));
  $("#resetJobButton")?.addEventListener("click", () => {
    if (jobDraftIsDirty(collectJobDraft()) && !confirm("¿Limpiar este reporte? Se pierde el trabajo sin guardar.")) return;
    reset();
  });
  $("#keepJobDraftButton")?.addEventListener("click", () => {
    jobDraftDismissed = true;
    $("#jobDraftBanner")?.classList.add("hidden");
  });
  $("#discardJobDraftButton")?.addEventListener("click", () => {
    if (!confirm("¿Descartar este reporte de otro formato sin guardar?")) return;
    reset();
  });
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
      if (!record || !confirm(`¿Eliminar el reporte de otro formato de horas de ${record.jobAddress || "esta dirección"}? Saldrá de la web y de la nube.`)) return;
      try { await removeReport(record); }
      catch (error) { $("#jobError").textContent = error.message || "No se pudo eliminar el reporte."; }
      return;
    }
    const button = event.target.closest("[data-job-download]"); if (!button) return;
    const record = reports.find(item => item.id === button.dataset.jobDownload);
    if (!record) return;
    try {
      await rebuildPdf(record, true, false);
      if (record.pdfBlob) await download(record.pdfBlob, record.pdfName || fileName(record), { share: true });
      else $("#jobError").textContent = "No hay PDF para descargar.";
    } catch (error) { $("#jobError").textContent = error.message || "No se pudo descargar el PDF."; }
  });

  function resetSession() { reports = []; renderHistory(); renderJobBoard(); window.TrentonControl?.jobArchive?.render?.(); }
  $("#jobHomeBoard")?.addEventListener("click", event => {
    const button = event.target.closest("[data-job-home]");
    if (button) {
      const action = button.dataset.jobHome;
      const record = reports.find(item => item.id === button.dataset.id);
      if (action === "toggle-column") {
        const stage = button.dataset.stage;
        if (expandedJobColumns.has(stage)) expandedJobColumns.delete(stage);
        else expandedJobColumns.add(stage);
        renderJobBoard();
        return;
      }
      if (action === "add") {
        pendingJobPdf = null;
        openJobCreateModal(button.dataset.stage || "created");
        return;
      }
      if (action === "menu" && record) openJobModal(record);
      if (action === "attach-check" && record) openJobCheckPicker(record.id, false);
      return;
    }
    const card = event.target.closest(".invoice-card[data-job-id]");
    if (card) {
      const record = reports.find(item => item.id === card.dataset.jobId);
      if (record) openJobModal(record);
    }
  });
  $("#jobBoardUploadButton")?.addEventListener("click", () => {
    pendingJobPdf = null;
    openJobCreateModal("created");
    $("#jobBoardPdfFile")?.click();
  });
  $("#jobChoosePdfButton")?.addEventListener("click", event => {
    event.preventDefault();
    event.stopPropagation();
    $("#jobBoardPdfFile")?.click();
  });
  $("#jobBoardPdfFile")?.addEventListener("change", event => {
    const file = event.target.files && event.target.files[0];
    if (file) acceptJobPdf(file);
    event.target.value = "";
  });
  $("#jobUploadArea")?.addEventListener("click", event => {
    if (event.target.closest("button, input")) return;
    $("#jobBoardPdfFile")?.click();
  });
  $("#jobUploadArea")?.addEventListener("dragover", event => { event.preventDefault(); $("#jobUploadArea").classList.add("dragging"); });
  $("#jobUploadArea")?.addEventListener("dragleave", () => $("#jobUploadArea")?.classList.remove("dragging"));
  $("#jobUploadArea")?.addEventListener("drop", event => {
    event.preventDefault();
    $("#jobUploadArea")?.classList.remove("dragging");
    const file = event.dataTransfer?.files && event.dataTransfer.files[0];
    if (file) acceptJobPdf(file);
  });
  $("#jobBoardSearch")?.addEventListener("input", () => renderJobBoard());
  $("#jobBoardForm")?.addEventListener("submit", saveJobBoardForm);
  $("#closeJobModalButton")?.addEventListener("click", closeJobModal);
  $("#cancelJobModalButton")?.addEventListener("click", closeJobModal);
  $("#jobModalBackdrop")?.addEventListener("click", event => { if (event.target === $("#jobModalBackdrop")) closeJobModal(); });
  $("#jobEditReceived")?.addEventListener("input", syncJobBalance);
  $("#jobEditTotal")?.addEventListener("input", syncJobBalance);
  $("#jobEditReceived")?.addEventListener("blur", event => {
    event.target.value = jobDollars(parseJobMoney(event.target.value)).toFixed(2);
    syncJobBalance();
  });
  $("#jobEditTotal")?.addEventListener("blur", event => {
    event.target.value = jobDollars(parseJobMoney(event.target.value)).toFixed(2);
    syncJobBalance();
  });
  $("#jobEditOpenForm")?.addEventListener("click", () => {
    const record = reports.find(item => item.id === editingJobId);
    closeJobModal();
    if (record) applyImported(record);
    window.TrentonControl?.navClick?.("job") || window.TrentonControl?.showView?.("job");
  });
  $("#jobEditCheckGallery")?.addEventListener("click", () => {
    if (editingJobId) $("#jobEditCheckFile")?.click();
  });
  $("#jobEditCheckCameraButton")?.addEventListener("click", () => {
    if (editingJobId) $("#jobEditCheckCamera")?.click();
  });
  async function onJobEditCheckFiles(event) {
    try {
      await addJobCheck(editingJobId, event.target.files);
      if (root.TrentonControl?.toast) root.TrentonControl.toast("Foto del cheque guardada.");
    } catch (error) {
      $("#jobBoardFormError").textContent = error.message || "No se pudo subir la foto.";
    }
    event.target.value = "";
  }
  $("#jobEditCheckFile")?.addEventListener("change", onJobEditCheckFiles);
  $("#jobEditCheckCamera")?.addEventListener("change", onJobEditCheckFiles);
  $("#jobEditCheckGrid")?.addEventListener("click", async event => {
    const button = event.target.closest("[data-job-check-id]");
    if (!button) return;
    const record = reports.find(item => item.id === editingJobId);
    const photo = record?.checkPhotos?.find(item => item.id === button.dataset.jobCheckId);
    if (!photo || !confirm("¿Quitar esta foto del cheque?")) return;
    await root.CloudDB.removeJobCheckPhoto(photo);
    record.checkPhotos = record.checkPhotos.filter(item => item.id !== photo.id);
    renderJobEditChecks(record);
    renderJobBoard();
  });
  $("#jobCheckDeskReport")?.addEventListener("change", () => renderJobCheckDesk());
  $("#jobCheckDeskGalleryButton")?.addEventListener("click", () => {
    const record = reports.find(item => item.id === $("#jobCheckDeskReport")?.value);
    if (!record) { if (root.TrentonControl?.toast) root.TrentonControl.toast("Mueve un reporte a Enviado a Trenton o Pagado."); return; }
    openJobCheckPicker(record.id, false);
  });
  $("#jobCheckDeskCameraButton")?.addEventListener("click", () => {
    const record = reports.find(item => item.id === $("#jobCheckDeskReport")?.value);
    if (!record) return;
    openJobCheckPicker(record.id, true);
  });
  async function onJobDeskFiles(event) {
    const reportId = event.target.dataset.reportId || $("#jobCheckDeskReport")?.value;
    try {
      await addJobCheck(reportId, event.target.files);
      if (root.TrentonControl?.toast) root.TrentonControl.toast("Foto del cheque del reporte a Trenton guardada.");
    } catch (error) {
      if (root.TrentonControl?.toast) root.TrentonControl.toast(error.message || "No se pudo subir la foto.");
    }
    event.target.value = "";
    delete event.target.dataset.reportId;
  }
  $("#jobCheckDeskFile")?.addEventListener("change", onJobDeskFiles);
  $("#jobCheckDeskCamera")?.addEventListener("change", onJobDeskFiles);
  $("#jobCheckDeskGrid")?.addEventListener("click", async event => {
    const button = event.target.closest("[data-job-desk-check]");
    if (!button) return;
    const record = reports.find(item => item.id === $("#jobCheckDeskReport")?.value);
    const photo = record?.checkPhotos?.find(item => item.id === button.dataset.jobDeskCheck);
    if (!photo || !confirm("¿Quitar esta foto del cheque?")) return;
    await root.CloudDB.removeJobCheckPhoto(photo);
    record.checkPhotos = record.checkPhotos.filter(item => item.id !== photo.id);
    renderJobBoard();
  });
  document.addEventListener("visibilitychange", () => { if (document.hidden) persistJobDraft(true); });
  window.addEventListener("pagehide", () => persistJobDraft(true));
  reset({ keepDraft: true });
  restoreJobDraft();
  root.JobApp = {open, render, boot, resetSession, flushDraft, restoreJobDraft, reports: () => reports, importJobFiles, applyImported, jobReady, recordFromImport, removeReport, fileName, download, rebuildPdf};
})(typeof globalThis !== "undefined" ? globalThis : this);

/* Hours PDF archive. Hours reports plus the other A3 format — never invoices. */
window.HoursArchive = function (app) {
  "use strict";
  const $ = selector => document.querySelector(selector);
  const esc = app.esc, money = app.money;
  const MAX_BATCH = 200 * 1024 * 1024, MAX_COUNT = 500;
  const pdfUrls = new Map();
  const isoDate = value => /^\d{4}-\d{2}-\d{2}$/.test(String(value || "")) ? String(value) : "";
  const isJobFormat = record => record?.hoursFormat === "a3" || String(record?.id || "").startsWith("job-");
  const reportDate = record => isoDate(record?.reportDate) || isoDate(record?.startDate) || isoDate(record?.entries?.[0]?.date);
  const dateLabel = value => isoDate(value) ? value.slice(8, 10) + "/" + value.slice(5, 7) + "/" + value.slice(0, 4) : "Sin fecha";
  const formatHours = value => Number(value || 0).toLocaleString("en-US", {maximumFractionDigits: 2});
  const fileName = record => {
    if (record.pdfName) return record.pdfName;
    if (isJobFormat(record) && window.JobApp?.fileName) return window.JobApp.fileName(record);
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
  const haystack = record => [record.jobAddress, record.pdfName, record.description, record.hoursFormat, ...(record.entries || []).map(entry => `${entry.employee} ${entry.description || ""}`)].join(" ").toLowerCase();
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
    $("#hoursArchiveYearHelp").textContent = "Aquí están las horas trabajadas y el otro formato (A3). No se mezclan con las invoices." + (undated ? ` Hay ${undated} sin fecha; completa sus datos para incluirlos en un año.` : "");
    grid.innerHTML = visible.length ? visible.map(record => {
      const stats = totals(record);
      const hasPdf = Boolean(record.pdfBlob || record.pdfPath);
      const other = isJobFormat(record);
      const range = other && window.JobPDF?.rangeLabel ? window.JobPDF.rangeLabel((record.entries || []).map(entry => entry.date)) : dateLabel(reportDate(record));
      return `<article class="archive-card">
        <div class="archive-card-top"><span class="stage-tag">${other ? "Otro formato · A3" : `${stats.people.length || 1} ${stats.people.length === 1 ? "empleado" : "empleados"}`}</span><span>${esc(range || dateLabel(reportDate(record)))}</span></div>
        <button class="archive-address" type="button" data-hours-record="${esc(record.id)}" data-task="${hasPdf ? "view" : "download"}">${esc(record.jobAddress || "Sin dirección")}</button>
        <p class="archive-date">${esc(range || dateLabel(reportDate(record)))} · ${hasPdf ? (other ? "PDF A3 guardado" : "PDF de horas guardado") : "Falta el PDF"}</p>
        <strong class="archive-amount">${esc(formatHours(stats.hours))} HRS · ${money(stats.pay)}</strong>
        <p class="archive-file">${esc(record.pdfName || fileName(record))}</p>
        <div class="archive-card-actions">${hasPdf ? `<button type="button" class="button button-primary" data-hours-record="${esc(record.id)}" data-task="view">Ver PDF</button><button type="button" class="button button-ghost" data-hours-record="${esc(record.id)}" data-task="download">Descargar</button>` : ""}<button type="button" class="button button-danger" data-hours-record="${esc(record.id)}" data-task="delete">Eliminar</button></div>
      </article>`;
    }).join("") : '<div class="archive-empty"><span>◷</span><h2>No hay reportes de horas en esta selección</h2><p>Prueba otro año o crea un reporte en Horas trabajadas o en Otro formato de horas.</p></div>';
  }

  function open() {
    if ($("#hoursArchiveYear")) $("#hoursArchiveYear").value = "all";
    if ($("#hoursArchiveSearch")) $("#hoursArchiveSearch").value = "";
    app.showView("hoursArchive");
    render();
  }

  async function ensureRecordPdf(record) {
    if (isJobFormat(record) && window.JobApp?.rebuildPdf) return window.JobApp.rebuildPdf(record, true, false);
    if (app.ensurePdf) return app.ensurePdf(record);
    return record.pdfBlob || null;
  }

  async function view(record) {
    try { await ensureRecordPdf(record); }
    catch (error) { return app.toast(error.message || "No se pudo abrir el PDF de horas."); }
    if (!record.pdfBlob) return app.toast("Este reporte todavía no tiene PDF.");
    const stats = totals(record);
    const other = isJobFormat(record);
    $("#pdfDialog").dataset.kind = other ? "job" : "hours";
    $("#pdfDialog").dataset.recordId = record.id;
    if ($("#pdfDialogEdit")) $("#pdfDialogEdit").hidden = true;
    $("#pdfDialogTitle").textContent = record.jobAddress || (other ? "Otro formato de horas" : "Horas trabajadas");
    $("#pdfDialogInfo").textContent = `${other && window.JobPDF?.rangeLabel ? window.JobPDF.rangeLabel((record.entries || []).map(entry => entry.date)) : dateLabel(reportDate(record))} · ${formatHours(stats.hours)} HRS · ${money(stats.pay)}`;
    $("#pdfDialogFrame").src = pdfUrl(record);
    $("#pdfDialogFrame").title = other ? "PDF A3 de horas" : "PDF de horas trabajadas";
    $("#pdfDialog").showModal();
  }

  async function downloadRecord(record) {
    try {
      await ensureRecordPdf(record);
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
      for (const record of records) { await ensureRecordPdf(record); }
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

  async function deleteRecord(record) {
    if (!confirm(`¿Eliminar el reporte de ${isJobFormat(record) ? "otro formato de horas" : "horas"} de ${record.jobAddress || "esta dirección"}? Saldrá de la web y de la nube.`)) return;
    try {
      if (isJobFormat(record) && window.JobApp?.removeReport) await window.JobApp.removeReport(record);
      else await app.remove(record);
      render();
      app.toast("Reporte eliminado.");
    } catch (error) {
      app.toast(error.message || "No se pudo eliminar el reporte.");
    }
  }

  $("#hoursArchiveGrid")?.addEventListener("click", event => {
    const button = event.target.closest("[data-hours-record]"); if (!button) return;
    const record = app.records().find(item => item.id === button.dataset.hoursRecord); if (!record) return;
    if (button.dataset.task === "view") view(record);
    else if (button.dataset.task === "delete") deleteRecord(record);
    else downloadRecord(record);
  });
  $("#hoursArchiveYear")?.addEventListener("change", render);
  $("#hoursArchiveSearch")?.addEventListener("input", render);
  $("#backupHoursButton")?.addEventListener("click", backup);
  $("#openHoursFormButton")?.addEventListener("click", () => app.openHours?.());
  $("#openJobFormButton")?.addEventListener("click", () => app.openJob?.());

  const MAX_FILE = 15 * 1024 * 1024;
  let importRows = [], importBusy = false;

  function closeHoursImport() {
    if (importBusy) return;
    importRows.forEach(row => { if (row.url) URL.revokeObjectURL(row.url); });
    importRows = [];
    $("#hoursImportPanel")?.classList.add("hidden");
    if ($("#hoursImportReviewGrid")) $("#hoursImportReviewGrid").innerHTML = "";
    if ($("#importHoursFiles")) $("#importHoursFiles").value = "";
    if ($("#importHoursPdfFile")) $("#importHoursPdfFile").value = "";
  }

  function hoursDuplicate(row, seen) {
    const existing = app.records().find(record =>
      (row.pdfHash && row.pdfHash === record.pdfHash)
      || (row.sourceId && (row.sourceId === record.id || row.sourceId === record.sourceId))
      || (row.jobAddress && row.reportDate && row.jobAddress === record.jobAddress && row.reportDate === record.reportDate)
    );
    if (existing) return `Ya guardado: ${existing.jobAddress || "reporte"}, ${dateLabel(reportDate(existing))}.`;
    if (seen.some(item => (row.pdfHash && row.pdfHash === item.pdfHash) || (row.jobAddress && row.reportDate && row.jobAddress === item.jobAddress && row.reportDate === item.reportDate))) {
      return "Repetido dentro de esta carga.";
    }
    return "";
  }

  function hoursPeopleReady(row) {
    return Boolean(row.entries?.length && row.entries.every(entry =>
      String(entry.employee || "").trim() && (Number(entry.hours) > 0 || Number(entry.hoursOverride) > 0)
    ));
  }

  function hoursRowReady(row) {
    return Boolean(row.jobAddress?.trim() && isoDate(row.reportDate) && (hoursPeopleReady(row) || row.file));
  }

  function updateHoursReview() {
    let included = 0, invalid = 0;
    const seen = [];
    importRows.forEach((row, index) => {
      row.duplicate = hoursDuplicate(row, seen);
      if (row.included && !row.error && !row.duplicate) {
        seen.push(row);
        included++;
        if (!hoursRowReady(row)) invalid++;
      }
      const status = $("#hoursImportRowStatus" + index);
      if (status) {
        status.textContent = row.error || row.duplicate || (!row.jobAddress?.trim() || !isoDate(row.reportDate)
          ? "Completa dirección y fecha. El PDF original se guarda aunque no se hayan leído empleados."
          : hoursPeopleReady(row)
            ? `${row.entries.length} empleado(s). Listo para guardar en la nube.`
            : "Listo: se guardará el PDF original con esa dirección y fecha.");
        status.classList.toggle("needs-review", Boolean(row.error || row.duplicate || !hoursRowReady(row)));
      }
    });
    if ($("#hoursImportTotal")) $("#hoursImportTotal").textContent = `${included} reportes nuevos seleccionados` + (invalid ? ` · ${invalid} por completar` : "");
    if ($("#confirmHoursImportButton")) $("#confirmHoursImportButton").disabled = importBusy || !included || Boolean(invalid);
  }

  function renderHoursReview() {
    if (!$("#hoursImportReviewGrid")) return;
    $("#hoursImportReviewGrid").innerHTML = importRows.map((row, index) => `<article class="import-row">
      <div class="import-row-head"><label><input type="checkbox" data-hours-row="${index}" data-hours-field="included" ${row.included ? "checked" : ""} ${row.error ? "disabled" : ""}> ${esc(row.name)}</label>${row.url ? `<a href="${row.url}" target="_blank" rel="noopener">Ver original ↗</a>` : ""}</div>
      <div class="import-fields">
        <label class="field import-address"><span>Dirección del trabajo</span><input data-hours-row="${index}" data-hours-field="jobAddress" value="${esc(row.jobAddress)}" maxlength="500"></label>
        <label class="field"><span>Fecha del reporte</span><input type="date" data-hours-row="${index}" data-hours-field="reportDate" value="${esc(row.reportDate)}"></label>
        <label class="field"><span>Tarifa USD/h</span><input inputmode="decimal" data-hours-row="${index}" data-hours-field="defaultRate" value="${esc(row.defaultRate ?? "")}"></label>
      </div>
      ${row.warnings.length ? `<p class="import-warning">${row.warnings.map(esc).join(" ")}</p>` : ""}
      <p class="import-row-status" id="hoursImportRowStatus${index}" role="status"></p>
    </article>`).join("");
    updateHoursReview();
  }

  async function unpackHours(files) {
    const entries = [];
    let bytes = 0;
    const add = (file, metadata = null) => {
      bytes += file?.size || 0;
      if (entries.length >= MAX_COUNT || bytes > MAX_BATCH) throw new Error("Carga hasta 500 reportes o 200 MB por vez.");
      entries.push({ file, metadata });
    };
    for (const file of files) {
      if (!/\.zip$/i.test(file.name)) { add(file); continue; }
      const zip = await JSZip.loadAsync(file);
      const manifestEntry = zip.file("trenton-horas-respaldo.json");
      let manifest;
      if (manifestEntry) {
        manifest = JSON.parse(await manifestEntry.async("string"));
        if (manifest.format !== "trenton-hours-backup" || !Array.isArray(manifest.records)) throw new Error("El ZIP no es un respaldo de horas compatible.");
      }
      const items = manifest ? manifest.records : Object.values(zip.files).filter(item => !item.dir && /\.pdf$/i.test(item.name)).map(item => ({ pdfPath: item.name }));
      for (const item of items) {
        if (!item.pdfPath && manifest) { add(null, item); continue; }
        const entry = zip.file(String(item.pdfPath || ""));
        if (!entry || entry.dir) throw new Error("Falta un PDF referenciado en el respaldo de horas.");
        const blob = await entry.async("blob");
        add(new File([blob], entry.name.split("/").pop(), { type: "application/pdf" }), manifest ? item : null);
      }
    }
    return entries;
  }

  async function startHoursImport(files) {
    if (importBusy || !files.length) return;
    closeHoursImport();
    open();
    importBusy = true;
    $("#hoursImportPanel")?.classList.remove("hidden");
    if ($("#importHoursArchiveButton")) $("#importHoursArchiveButton").disabled = true;
    if ($("#hoursImportError")) $("#hoursImportError").textContent = "";
    if ($("#hoursImportProgress")) $("#hoursImportProgress").textContent = "Preparando los archivos…";
    try {
      const packed = await unpackHours(files);
      for (let i = 0; i < packed.length; i++) {
        const { file, metadata } = packed[i];
        if ($("#hoursImportProgress")) $("#hoursImportProgress").textContent = `Leyendo ${i + 1} de ${packed.length}…`;
        const row = {
          file, name: file?.name || "Reporte sin PDF", url: file ? URL.createObjectURL(file) : "",
          jobAddress: "", reportDate: "", defaultRate: "", description: "", entries: [],
          included: true, warnings: [], error: "", sourceId: "", pdfHash: ""
        };
        try {
          if (file) {
            if (!/\.pdf$/i.test(file.name) || file.size > MAX_FILE) throw new Error("Sube un PDF de hasta 15 MB.");
            const parsed = await HoursPDF.read(file);
            const record = window.HoursApp.recordFromImport(file, parsed, parsed.sourceId || "");
            Object.assign(row, {
              jobAddress: record.jobAddress,
              reportDate: isoDate(parsed.fields?.reportDate) ? parsed.fields.reportDate : "",
              defaultRate: record.defaultRate,
              description: record.description,
              entries: record.entries,
              warnings: parsed.warnings || [],
              pdfHash: parsed.pdfHash,
              sourceId: parsed.sourceId || ""
            });
            if (!row.jobAddress && file?.name) row.jobAddress = String(file.name).replace(/\.pdf$/i, "").replace(/,/g, ", ");
          }
          if (metadata) {
            if (typeof metadata.jobAddress === "string" && metadata.jobAddress) row.jobAddress = metadata.jobAddress;
            if (isoDate(metadata.reportDate)) row.reportDate = metadata.reportDate;
            if (Array.isArray(metadata.entries) && metadata.entries.length) row.entries = metadata.entries;
          }
        } catch (error) {
          row.warnings.push(error.message || "No se pudo leer el texto. Completa dirección, fecha y empleados a mano.");
        }
        importRows.push(row);
        await new Promise(resolve => setTimeout(resolve, 0));
      }
      if ($("#hoursImportProgress")) $("#hoursImportProgress").textContent = `${importRows.length} archivos preparados. Revisa y guarda; irán a la web y a Supabase.`;
    } catch (error) {
      if ($("#hoursImportError")) $("#hoursImportError").textContent = error.message || "No se pudieron preparar los archivos.";
      if ($("#hoursImportProgress")) $("#hoursImportProgress").textContent = "La carga no se completó.";
    } finally {
      importBusy = false;
      if ($("#importHoursArchiveButton")) $("#importHoursArchiveButton").disabled = false;
      renderHoursReview();
    }
  }

  async function confirmHoursImport() {
    if (importBusy) return;
    updateHoursReview();
    const chosen = importRows.filter(row => row.included && !row.error && !row.duplicate);
    if (!chosen.length || chosen.some(row => !hoursRowReady(row))) return;
    importBusy = true;
    updateHoursReview();
    if ($("#hoursImportError")) $("#hoursImportError").textContent = "";
    try {
      let saved = 0;
      const failed = [];
      for (const row of chosen) {
        try {
          const parsed = {
            fields: { jobAddress: row.jobAddress.trim(), reportDate: row.reportDate, description: row.description || "", defaultRate: Number(row.defaultRate) || 0 },
            entries: row.entries || [],
            pdfHash: row.pdfHash,
            sourceId: row.sourceId,
            warnings: row.warnings
          };
          const record = window.HoursApp.recordFromImport(row.file, parsed, row.sourceId || `hours-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
          record.jobAddress = row.jobAddress.trim();
          record.reportDate = row.reportDate;
          record.defaultRate = Number(row.defaultRate) || record.defaultRate || 30;
          record.pdfBlob = row.file || record.pdfBlob;
          record.pdfName = row.name || record.pdfName;
          if (!record.pdfHash && record.pdfBlob && window.HoursPDF?.hash) record.pdfHash = await window.HoursPDF.hash(record.pdfBlob);
          if (!record.entries.length) {
            record.description = record.description || "PDF anterior importado. Se conservó el archivo original.";
          } else {
            record.entries = record.entries.map(entry => ({ ...entry, rate: Number(entry.rate) || record.defaultRate || 30 }));
          }
          await window.CloudDB.saveHours(record);
          saved++;
        } catch (error) {
          failed.push(`${row.name}: ${error.message || "no se guardó"}`);
        }
      }
      await window.HoursApp.boot?.();
      importBusy = false;
      if (saved) {
        closeHoursImport();
        render();
        app.toast(failed.length ? `${saved} guardados. ${failed.length} no: ${failed[0]}` : `${saved} reportes de horas guardados en la web y en Supabase.`);
      } else if ($("#hoursImportError")) {
        $("#hoursImportError").textContent = failed[0] || "No se guardó la carga.";
      }
    } catch (error) {
      if ($("#hoursImportError")) $("#hoursImportError").textContent = error.message || "No se guardó la carga.";
    } finally {
      importBusy = false;
      updateHoursReview();
    }
  }

  $("#importHoursArchiveButton")?.addEventListener("click", () => { if (!importBusy) $("#importHoursFiles")?.click(); });
  $("#importHoursFiles")?.addEventListener("change", event => startHoursImport(Array.from(event.target.files || [])));
  $("#cancelHoursImportButton")?.addEventListener("click", closeHoursImport);
  $("#confirmHoursImportButton")?.addEventListener("click", confirmHoursImport);
  $("#hoursImportReviewGrid")?.addEventListener("input", event => {
    const field = event.target.dataset.hoursField;
    const row = importRows[Number(event.target.dataset.hoursRow)];
    if (!row || !field || importBusy) return;
    row[field] = field === "included" ? event.target.checked : event.target.value;
    if (field === "defaultRate") row.entries = (row.entries || []).map(entry => ({ ...entry, rate: Number(event.target.value) || entry.rate }));
    updateHoursReview();
  });

  return {open, render, view, importFiles: startHoursImport};
};

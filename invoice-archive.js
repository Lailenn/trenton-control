/* PDF archive, cloud import, backups. Blobs are cached locally after download. */
window.InvoiceArchive = function (app) {
  "use strict";
  const C = window.InvoiceCore, PDF = window.InvoicePDF;
  const $ = selector => document.querySelector(selector);
  const esc = app.esc, money = app.money;
  const MAX_FILE = 15 * 1024 * 1024, MAX_BATCH = 200 * 1024 * 1024, MAX_COUNT = 500;
  let rows = [], busy = false, viewerId = null;
  const stageName = id => app.stages.find(s => s.id === id)?.title || "Factura creada";
  const validStage = id => app.stages.some(s => s.id === id) ? id : "created";
  const dateLabel = value => C.isoDate(value) ? value.slice(8, 10) + "/" + value.slice(5, 7) + "/" + value.slice(0, 4) : "Sin fecha";
  const selectOptions = selected => app.stages.map(s => `<option value="${s.id}"${s.id === selected ? " selected" : ""}>${s.title}</option>`).join("");
  const recordValid = r => r.address.trim() && r.invoiceNumber.trim() && C.isoDate(r.issuedDate) && C.amount(r.amount) != null;

  function render() {
    const records = app.records(), chosenYear = $("#archiveYear").value;
    const years = [...new Set(records.map(C.issuedDate).filter(Boolean).map(d => d.slice(0, 4)))].sort().reverse();
    $("#archiveYear").innerHTML = '<option value="all">Todos los años</option>' + years.map(y => `<option value="${y}">${y}</option>`).join("") + (records.some(r => !C.issuedDate(r)) ? '<option value="undated">Sin fecha · revisar</option>' : "");
    $("#archiveYear").value = ["all", "undated", ...years].includes(chosenYear) ? chosenYear : "all";
    if (!$("#archiveYear").value) $("#archiveYear").value = "all";
    const stage = $("#archiveStage").value;
    const visible = C.select(records, {year: $("#archiveYear").value, stage, query: $("#archiveSearch").value.trim()});
    const summary = C.summarize(visible);
    $("#archiveTitle").textContent = stage === "all" ? "Todas las invoices" : stageName(stage);
    $("#archiveCount").textContent = summary.count;
    $("#archiveTotal").textContent = money(summary.total);
    $("#archivePaid").textContent = money(summary.paid);
    $("#archivePending").textContent = money(summary.pending);
    const undated = records.filter(r => !C.issuedDate(r)).length;
    $("#archiveYearHelp").textContent = "Total por fecha de emisión, con cada invoice contada una vez. Los anticipos dentro del PDF no se suman de nuevo. Pagadas y pendientes son montos de invoices completas." + (undated ? ` Hay ${undated} sin fecha; completa sus datos para incluirlas en un año.` : "");
    $("#archiveGrid").innerHTML = visible.length ? visible.map(r => `<article class="archive-card">
      <div class="archive-card-top"><span class="stage-tag stage-${validStage(r.stage)}">${stageName(r.stage)}</span><span>${esc(r.invoiceNumber || "Sin número")}</span></div>
      <button class="archive-address" type="button" data-record="${esc(r.id)}" data-task="${r.pdfBlob || r.pdfPath ? "view" : "edit"}">${esc(r.address || "Sin dirección")}</button>
      <p class="archive-date">${dateLabel(C.issuedDate(r))} · ${r.pdfBlob || r.pdfPath ? "PDF guardado" : "Falta adjuntar el PDF"}</p>
      <strong class="archive-amount">${money(r.amount)}</strong>
      <p class="archive-file">${esc(r.pdfName || "Puedes agregar el PDF desde Editar datos.")}</p>
      <div class="archive-card-actions">${r.pdfBlob || r.pdfPath ? `<button type="button" class="button button-primary" data-record="${esc(r.id)}" data-task="view">Ver PDF</button><button type="button" class="button button-ghost" data-record="${esc(r.id)}" data-task="download">Descargar</button>` : ""}<button type="button" class="button button-ghost" data-record="${esc(r.id)}" data-task="edit">Editar datos</button></div>
    </article>`).join("") : '<div class="archive-empty"><span>▤</span><h2>No hay invoices en esta selección</h2><p>Prueba otro año o categoría, crea una invoice o sube tus PDFs anteriores.</p></div>';
  }

  function open(stage = "all") {
    $("#archiveStage").value = stage;
    $("#archiveYear").value = "all";
    $("#archiveSearch").value = "";
    app.showView("archive"); render();
  }

  async function view(record) {
    if (app.ensurePdf) {
      try { await app.ensurePdf(record); } catch (error) { return app.toast(error.message || "No se pudo abrir el PDF."); }
    }
    if (!record.pdfBlob) return app.edit(record);
    viewerId = record.id;
    $("#pdfDialogTitle").textContent = record.address;
    $("#pdfDialogInfo").textContent = `${record.invoiceNumber} · ${dateLabel(C.issuedDate(record))} · ${money(record.amount)} · ${stageName(record.stage)}`;
    $("#pdfDialogFrame").src = app.pdfUrl(record);
    $("#pdfDialogDownload").href = app.pdfUrl(record);
    $("#pdfDialogDownload").download = C.fileName(record);
    $("#pdfDialog").showModal();
  }

  function closeImport() {
    if (busy) return;
    rows.forEach(r => { if (r.url) URL.revokeObjectURL(r.url); });
    rows = []; $("#importPanel").classList.add("hidden"); $("#importReviewGrid").innerHTML = "";
    $("#importInvoiceFiles").value = "";
  }

  function duplicate(row, seen) {
    const record = app.records().find(r => (row.pdfHash && row.pdfHash === r.pdfHash) ||
      (row.sourceId && (row.sourceId === r.id || row.sourceId === r.sourceId)) ||
      (C.logicalKey(row) && C.logicalKey(row) === C.logicalKey(r)));
    if (record) return `Ya guardada: ${record.invoiceNumber}, ${record.address}.`;
    if (seen.some(r => (row.pdfHash && row.pdfHash === r.pdfHash) ||
      (row.sourceId && row.sourceId === r.sourceId) || (C.logicalKey(row) && C.logicalKey(row) === C.logicalKey(r)))) return "Repetida dentro de esta carga.";
    return "";
  }

  function updateReview() {
    let total = 0, included = 0, invalid = 0;
    const seen = [];
    rows.forEach((r, i) => {
      r.duplicate = duplicate(r, seen);
      if (r.included && !r.error && !r.duplicate) {
        seen.push(r); included++;
        if (!recordValid(r)) invalid++;
        else total += C.cents(r.amount);
      }
      const status = $("#importRowStatus" + i);
      if (status) {
        status.textContent = r.error || r.duplicate || (!recordValid(r) ? "Completa dirección, número, fecha y total." : "Datos listos. Confirma que coincidan con el PDF.");
        status.classList.toggle("needs-review", Boolean(r.error || r.duplicate || !recordValid(r)));
      }
      const checkbox = $("#importRowCheck" + i);
      if (checkbox) checkbox.disabled = busy || Boolean(r.error);
    });
    $("#importTotal").textContent = `${included} invoices nuevas seleccionadas · Total de las completas: ${money(total / 100)}` + (invalid ? ` · ${invalid} por completar` : "");
    $("#confirmImportButton").disabled = busy || !included || Boolean(invalid);
  }

  function renderReview() {
    $("#importReviewGrid").innerHTML = rows.map((r, i) => `<article class="import-row">
      <div class="import-row-head"><label><input type="checkbox" id="importRowCheck${i}" data-row="${i}" data-field="included" ${r.included ? "checked" : ""} ${r.error ? "disabled" : ""}> ${esc(r.name)}</label>${r.url ? `<a href="${r.url}" target="_blank" rel="noopener">Ver original ↗</a>` : ""}</div>
      <div class="import-fields">
        <label class="field import-address"><span>Dirección del trabajo</span><input aria-label="Dirección ${i + 1}" data-row="${i}" data-field="address" value="${esc(r.address)}" maxlength="500"></label>
        <label class="field"><span>Número de invoice</span><input aria-label="Número ${i + 1}" data-row="${i}" data-field="invoiceNumber" value="${esc(r.invoiceNumber)}" maxlength="60"></label>
        <label class="field"><span>Fecha de emisión</span><input aria-label="Fecha ${i + 1}" type="date" data-row="${i}" data-field="issuedDate" value="${esc(r.issuedDate)}"></label>
        <label class="field"><span>Total de la invoice (USD)</span><input aria-label="Total ${i + 1}" inputmode="decimal" data-row="${i}" data-field="amount" value="${esc(r.amount ?? "")}" placeholder="Ej. 9,200.00"></label>
        <label class="field"><span>Categoría</span><select aria-label="Categoría ${i + 1}" data-row="${i}" data-field="stage">${selectOptions(r.stage)}</select></label>
      </div>
      ${r.warnings.length ? `<p class="import-warning">${r.warnings.map(esc).join(" ")}</p>` : ""}<p class="import-row-status" id="importRowStatus${i}" role="status"></p>
    </article>`).join("");
    updateReview();
  }

  async function unpack(files) {
    const entries = []; let bytes = 0;
    const add = (file, metadata = null) => {
      bytes += file?.size || 0;
      if (entries.length >= MAX_COUNT || bytes > MAX_BATCH) throw new Error("Carga hasta 500 invoices o 200 MB por vez. Puedes hacer varias cargas.");
      entries.push({file, metadata});
    };
    for (const file of files) {
      if (!file.name.toLowerCase().endsWith(".zip")) { add(file); continue; }
      if (file.size > MAX_BATCH) throw new Error("El respaldo supera 200 MB. Importa los PDFs en grupos más pequeños.");
      const zip = await JSZip.loadAsync(file);
      const manifestEntry = zip.file("trenton-respaldo.json");
      let manifest;
      if (manifestEntry) {
        if (manifestEntry._data.uncompressedSize > 5 * 1024 * 1024) throw new Error("El índice del respaldo es demasiado grande.");
        manifest = JSON.parse(await manifestEntry.async("string"));
        if (manifest.format !== "trenton-control-backup" || manifest.version !== 1 || !Array.isArray(manifest.records)) throw new Error("El ZIP no es un respaldo compatible.");
      }
      const items = manifest ? manifest.records : Object.values(zip.files).filter(f => !f.dir && /\.pdf$/i.test(f.name)).map(f => ({pdfPath: f.name}));
      if (items.length > MAX_COUNT) throw new Error("Extrae el ZIP e importa como máximo 500 PDFs por vez.");
      for (const item of items) {
        if (!item.pdfPath && manifest) { add(null, item); continue; }
        const entry = zip.file(String(item.pdfPath || ""));
        if (!entry || entry.dir) throw new Error("Falta un PDF referenciado en el respaldo.");
        const size = entry._data.uncompressedSize;
        if (size > MAX_FILE || bytes + size > MAX_BATCH) throw new Error("El ZIP contiene un PDF de más de 15 MB o supera 200 MB al extraerse.");
        const blob = await entry.async("blob");
        add(new File([blob], entry.name.split("/").pop(), {type: "application/pdf"}), manifest ? item : null);
      }
    }
    return entries;
  }

  async function startImport(files) {
    if (busy || !files.length) return;
    closeImport(); open("all"); busy = true;
    $("#importPanel").classList.remove("hidden");
    $("#importInvoicesButton").disabled = true; $("#cancelImportButton").disabled = true;
    $("#importError").textContent = ""; $("#importProgress").textContent = "Preparando los archivos…";
    try {
      const entries = await unpack(files);
      for (let i = 0; i < entries.length; i++) {
        const {file, metadata} = entries[i];
        $("#importProgress").textContent = `Leyendo ${i + 1} de ${entries.length}…`;
        const row = {file, name: file?.name || String(metadata?.invoiceNumber || "Registro sin PDF"), url: file ? URL.createObjectURL(file) : "", address: "", invoiceNumber: "", issuedDate: "", amount: "", stage: $("#importBatchStage").value, included: true, warnings: [], error: "", sourceId: "", pdfHash: "", hours: 0, description: ""};
        try {
          if (file) {
            if (!/\.pdf$/i.test(file.name) || file.size > MAX_FILE) throw new Error("Sube un PDF por invoice, de hasta 15 MB.");
            const result = await PDF.read(file);
            Object.assign(row, result.fields, {warnings: result.warnings, pdfHash: result.pdfHash, sourceId: result.sourceId});
          } else row.warnings.push("Este registro del respaldo todavía no tiene PDF adjunto.");
          if (metadata) {
            row.address = typeof metadata.address === "string" ? metadata.address.slice(0, 500) : row.address;
            row.invoiceNumber = typeof metadata.invoiceNumber === "string" ? metadata.invoiceNumber.slice(0, 60) : row.invoiceNumber;
            row.issuedDate = C.issuedDate(metadata) || row.issuedDate;
            if (C.amount(metadata.amount) != null) {
              if (row.amount != null && row.amount !== "" && C.cents(row.amount) !== C.cents(metadata.amount)) {
                row.amount = ""; row.warnings.push("El total del respaldo difiere del PDF. Confirma el monto correcto.");
              } else row.amount = C.cents(metadata.amount) / 100;
            }
            row.stage = validStage(metadata.stage);
            row.sourceId = typeof metadata.sourceId === "string" && metadata.sourceId ? metadata.sourceId.slice(0, 100) : typeof metadata.id === "string" ? metadata.id.slice(0, 100) : row.sourceId;
            row.hours = C.amount(metadata.hours) || 0;
            row.description = typeof metadata.description === "string" ? metadata.description.slice(0, 16000) : "";
          }
        } catch (error) { row.error = "No se pudo leer este archivo. Comprueba que sea un PDF válido y sin contraseña. " + (error.message || ""); row.included = false; }
        rows.push(row);
        await new Promise(resolve => setTimeout(resolve, 0));
      }
      $("#importProgress").textContent = `${rows.length} archivos preparados. Revisa sus datos antes de guardar; los repetidos se omiten.`;
    } catch (error) { $("#importError").textContent = error.message || "No se pudieron preparar los archivos."; $("#importProgress").textContent = "La carga no se completó."; }
    finally { busy = false; $("#importInvoicesButton").disabled = false; $("#cancelImportButton").disabled = false; renderReview(); }
  }

  async function confirmImport() {
    if (busy) return;
    updateReview();
    const chosen = rows.filter(r => r.included && !r.error && !r.duplicate);
    if (!chosen.length || chosen.some(r => !recordValid(r))) return;
    busy = true; updateReview(); $("#importError").textContent = "";
    const now = new Date().toISOString();
    const records = chosen.map(r => ({id: app.makeId(), sourceId: r.sourceId, address: r.address.trim(), invoiceNumber: r.invoiceNumber.trim(), issuedDate: r.issuedDate, amount: C.cents(r.amount) / 100, stage: validStage(r.stage), hours: r.hours, description: r.description, pdfBlob: r.file, pdfName: r.file ? C.fileName(r) : "", pdfHash: r.pdfHash, source: "imported", updatedAt: now, paidAt: r.stage === "paid" ? now : null}));
    try {
      await app.saveMany(records);
      await app.reload();
      busy = false; closeImport(); app.render();
      app.toast(`${records.length} invoices guardadas con sus PDFs.`);
    } catch (error) { $("#importError").textContent = "No se guardó la carga. Puede faltar espacio en este navegador. Descarga un respaldo y vuelve a intentar."; }
    finally { busy = false; updateReview(); }
  }

  async function backup() {
    const records = app.records();
    if (!records.length) return app.toast("Todavía no hay invoices para respaldar.");
    $("#backupInvoicesButton").disabled = true;
    try {
      const zip = new JSZip(), metadata = [];
      let bytes = 0;
      for (const r of records) { if (app.ensurePdf) await app.ensurePdf(r); }
      records.forEach((r, i) => {
        bytes += r.pdfBlob?.size || 0;
        if (bytes > MAX_BATCH || records.length > MAX_COUNT) throw new Error("El respaldo supera 500 invoices o 200 MB. Descarga los PDFs individualmente desde el archivo.");
        const pdfPath = r.pdfBlob ? `pdfs/${String(i + 1).padStart(4, "0")}_${C.fileName(r)}` : "";
        if (r.pdfBlob) zip.file(pdfPath, r.pdfBlob);
        const {pdfBlob, ...rest} = r;
        metadata.push({...rest, issuedDate: C.issuedDate(r), pdfPath});
      });
      zip.file("trenton-respaldo.json", JSON.stringify({format: "trenton-control-backup", version: 1, exportedAt: new Date().toISOString(), records: metadata}, null, 2));
      const blob = await zip.generateAsync({type: "blob", compression: "STORE"});
      app.download(blob, `Trenton-respaldo-${new Date().toISOString().slice(0, 10)}.zip`);
      app.toast("Respaldo descargado. Puedes restaurarlo desde Subir invoices anteriores.");
    } catch (error) { app.toast(error.message || "No se pudo generar el respaldo."); }
    finally { $("#backupInvoicesButton").disabled = false; }
  }

  async function downloadRecord(record) {
    try {
      if (app.ensurePdf) await app.ensurePdf(record);
      if (!record.pdfBlob) return app.toast("No hay PDF para descargar.");
      app.download(record.pdfBlob, C.fileName(record));
    } catch (error) {
      app.toast(error.message || "No se pudo descargar el PDF.");
    }
  }

  $("#archiveGrid").addEventListener("click", e => {
    const button = e.target.closest("[data-record]"); if (!button) return;
    const record = app.records().find(r => r.id === button.dataset.record); if (!record) return;
    if (button.dataset.task === "view") view(record);
    else if (button.dataset.task === "download") downloadRecord(record);
    else app.edit(record);
  });
  ["archiveYear", "archiveStage"].forEach(id => $("#" + id).addEventListener("change", render));
  $("#archiveSearch").addEventListener("input", render);
  $("#closePdfDialog").addEventListener("click", () => $("#pdfDialog").close());
  $("#pdfDialog").addEventListener("close", () => { $("#pdfDialogFrame").src = "about:blank"; });
  $("#pdfDialogEdit").addEventListener("click", () => { $("#pdfDialog").close(); const r = app.records().find(r => r.id === viewerId); if (r) app.edit(r); });
  $("#importInvoicesButton").addEventListener("click", () => { if (!busy) $("#importInvoiceFiles").click(); });
  $("#importInvoiceFiles").addEventListener("change", e => startImport(Array.from(e.target.files)));
  $("#cancelImportButton").addEventListener("click", closeImport);
  $("#importReviewGrid").addEventListener("input", e => {
    const el = e.target, row = rows[Number(el.dataset.row)];
    if (!row || !el.dataset.field || busy) return;
    row[el.dataset.field] = el.dataset.field === "included" ? el.checked : el.value;
    updateReview();
  });
  $("#importBatchStage").addEventListener("change", e => { if (!busy) { rows.forEach(r => r.stage = e.target.value); renderReview(); } });
  $("#confirmImportButton").addEventListener("click", confirmImport);
  $("#backupInvoicesButton").addEventListener("click", backup);
  return {open, render, view};
};

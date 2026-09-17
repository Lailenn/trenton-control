(() => {
  "use strict";
  if (typeof document === "undefined" || typeof window === "undefined") return;
  const WhatsAppInvoiceParser = window.WhatsAppInvoiceParser;

  const MAX_PDF_BYTES = 15 * 1024 * 1024;
  const Core = window.InvoiceCore, PDFs = window.InvoicePDF, Cloud = window.CloudDB;
  const stages = [
    { id: "created", title: "Factura creada", subtitle: "PDF listo para seguimiento", className: "column-created" },
    { id: "working", title: "En trabajo", subtitle: "Ruben trabajando", className: "column-working" },
    { id: "waiting", title: "Esperando cheque", subtitle: "Trabajo entregado", className: "column-waiting" },
    { id: "paid", title: "Pagado", subtitle: "Invoice cerrada", className: "column-paid" }
  ];
  const stageIcons = {
    created: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M7 3h8l5 5v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zm7 1.5V9h4.5z"/></svg>',
    working: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20zm1 5h-2v6l5 3 .9-1.5-3.9-2.3z"/></svg>',
    waiting: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M6 2h12v3l-4.5 5 4.5 5v3H6v-3l4.5-5L6 5z"/></svg>',
    paid: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20zm.2 5h-1.7v1.2C8.8 8.5 8 9.6 8 11c0 1.8 1.5 2.6 3.4 3 1.2.3 1.7.6 1.7 1.2 0 .6-.6 1-1.7 1s-1.8-.4-2.1-1H7.7c.3 1.6 1.7 2.7 3.4 3V19h1.7v-1.1c1.9-.3 3.1-1.5 3.1-3.2 0-1.8-1.5-2.6-3.4-3-1.2-.3-1.7-.6-1.7-1.1 0-.6.6-1 1.6-1s1.6.4 1.8 1h1.5c-.3-1.5-1.6-2.5-3.3-2.8z"/></svg>'
  };

  const $ = (selector) => document.querySelector(selector);
  const money = (value) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(Number(value) || 0);
  const esc = (value) => String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#039;", '"': "&quot;" }[char]));
  const makeId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let records = [];
  let ready = false;
  let editingId = null;
  let selectedPdf = null;
  let draggedId = null;
  let toastTimer;
  const COLUMN_PREVIEW = 5;
  const expandedColumns = new Set();
  let archive, hoursArchive, jobArchive, builderRecordId = null, savingBuilder = false, readingPdf = false;
  const DEFAULT_LOGO_URL = "assets/logo-ruben.png";
  let logoDataUrl = DEFAULT_LOGO_URL;
  const pdfUrls = new Map();

  async function loadRecords() {
    records = await Cloud.listInvoices();
    fillAddressHistory();
  }

  async function saveRecord(record) {
    await Cloud.saveInvoice(record, records);
    updateSaved("En la nube y en este navegador");
  }

  async function saveMany(incoming) {
    await Cloud.saveMany(incoming, records);
    updateSaved("En la nube y en este navegador");
  }

  function replaceInMemory(record) {
    if (pdfUrls.has(record.id)) { URL.revokeObjectURL(pdfUrls.get(record.id)); pdfUrls.delete(record.id); }
    if (records.some(r => r.id === record.id)) records = records.map(r => r.id === record.id ? record : r);
    else records.unshift(record);
    fillAddressHistory();
  }

  async function download(blob, name, options = {}) {
    if (!blob) {
      showToast("No hay PDF para descargar.");
      return;
    }
    try {
      const result = await (window.TrentonFiles?.saveBlob || saveBlobFallback)(blob, name, options);
      if (result === "cancelled") showToast("Descarga cancelada.");
      if (result === "opened") showToast("El PDF se abrió. En el teléfono usa Compartir para guardarlo.");
    } catch (error) {
      showToast(error.message || "No se pudo descargar el PDF.");
    }
  }

  async function saveBlobFallback(blob, name) {
    const url = URL.createObjectURL(blob instanceof Blob ? blob : new Blob([blob], {type: "application/pdf"}));
    const a = document.createElement("a");
    a.href = url; a.download = name || "invoice.pdf"; a.rel = "noopener"; a.style.display = "none";
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    return "download";
  }

  async function removeRecord(record) {
    await Cloud.softDeleteInvoice(record);
  }

  function growTextarea(el) {
    if (!el) return;
    el.style.height = "auto";
    const min = Number(el.dataset.minH) || 168;
    const max = Number(el.dataset.maxH) || 560;
    const next = Math.min(max, Math.max(min, el.scrollHeight + 2));
    el.style.height = `${next}px`;
    el.style.overflowY = el.scrollHeight > max ? "auto" : "hidden";
  }
  function growAllTextareas() {
    document.querySelectorAll("textarea.js-grow").forEach(growTextarea);
  }
  window.growTextareas = growAllTextareas;

  function updateSaved(text) { $("#savedIndicator").innerHTML = `<i></i> ${esc(text)}`; }

  function fillAddressHistory() {
    const list = $("#addressHistory");
    if (!list) return;
    const addresses = [...new Set(records.map(record => record.address).filter(Boolean))];
    list.innerHTML = addresses.map(address => `<option value="${esc(address)}"></option>`).join("");
  }

  function updateWelcome() {
    const greetingElement = $("#welcomeGreeting");
    if (greetingElement) greetingElement.textContent = window.AuthApp?.greeting() || "Buenos días, Lilian. 👋";
  }

  function showToast(message) {
    const toast = $("#toast");
    toast.textContent = message;
    toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("show"), 6500);
  }

  function matchesSearch(record) {
    const query = $("#searchInput").value.trim().toLowerCase();
    if (!query) return true;
    return [record.address, record.invoiceNumber, record.description, record.pdfName].join(" ").toLowerCase().includes(query);
  }

  function updateStats() {
    const paid = records.filter((record) => record.stage === "paid");
    $("#statTotal").textContent = records.length;
    $("#statWorking").textContent = records.filter((record) => record.stage === "working").length;
    $("#statWaiting").textContent = records.filter((record) => record.stage === "waiting").length;
    $("#statPaid").textContent = money(Core.summarize(paid).total);
    const total = $("#navTotal");
    if (total) total.textContent = records.length;
  }

  function pdfUrl(record) {
    if (!record.pdfBlob) return "";
    if (!pdfUrls.has(record.id)) pdfUrls.set(record.id, URL.createObjectURL(record.pdfBlob));
    return pdfUrls.get(record.id);
  }

  function cardDate(record) {
    const iso = Core.issuedDate(record);
    if (!iso) return "Sin fecha";
    const date = new Date(`${iso}T12:00:00`);
    const months = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
    return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
  }

  function cardTemplate(record) {
    const number = String(record.invoiceNumber || "SIN NÚMERO").startsWith("#") ? record.invoiceNumber : `#${record.invoiceNumber || "SIN NÚMERO"}`;
    return `<article class="invoice-card" draggable="true" data-id="${esc(record.id)}" tabindex="0">
      <div class="card-top"><span class="card-invoice"><i class="card-dot"></i>${esc(number)}</span><button class="card-menu" type="button" data-action="menu" data-id="${esc(record.id)}" aria-label="Editar invoice">•••</button></div>
      <p class="card-date">${esc(cardDate(record))}</p>
      <h4 class="card-address"><svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true"><path fill="currentColor" d="M12 2a7 7 0 0 1 7 7c0 5.25-7 13-7 13S5 14.25 5 9a7 7 0 0 1 7-7zm0 9.5A2.5 2.5 0 1 0 12 6a2.5 2.5 0 0 0 0 5.5z"/></svg>${esc(record.address)}</h4>
      <div class="card-details"><span class="card-hours"><svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true"><path fill="currentColor" d="M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20zm1 5h-2v6l4.5 2.7.9-1.5L13 12.2z"/></svg>${Number(record.hours || 0)} hrs</span><span class="card-amount">${money(record.amount)}</span></div>
      ${record.stage === "waiting" || record.stage === "paid" || (record.checkPhotos || []).length ? `<div class="card-check">${(record.checkPhotos || []).length ? `<span class="check-badge">Cheque ×${record.checkPhotos.length}</span>` : `<span class="check-badge" style="background:#eef1fb;color:#5b6580">Sin foto</span>`}<button class="card-check-btn" type="button" data-action="attach-check" data-id="${esc(record.id)}">Subir cheque</button></div>` : ""}
    </article>`;
  }

  function renderBoard() {
    const visible = records.filter(matchesSearch);
    $("#board").innerHTML = stages.map((stage) => {
      const items = visible.filter((record) => record.stage === stage.id);
      const expanded = expandedColumns.has(stage.id);
      const shown = expanded ? items : items.slice(0, COLUMN_PREVIEW);
      const hiddenCount = Math.max(0, items.length - shown.length);
      const more = items.length > COLUMN_PREVIEW
        ? `<button class="column-more" type="button" data-action="toggle-column" data-stage="${stage.id}">${expanded ? "Ver menos" : `Ver más (${hiddenCount})`}</button>`
        : "";
      return `<section class="kanban-column ${stage.className}${expanded ? " is-expanded" : ""}" data-stage="${stage.id}"><header class="column-head"><div class="column-title"><span class="column-icon">${stageIcons[stage.id]}</span><h3>${stage.title}</h3></div><span class="column-count">${items.length}</span></header><div class="column-cards">${items.length ? shown.map(cardTemplate).join("") + more : `<div class="empty-column">Sin invoices en esta fase</div>`}</div><button class="add-card-button" type="button" data-action="add" data-stage="${stage.id}">+ Agregar invoice</button></section>`;
    }).join("");
    wireBoardEvents();
  }

  function render() { updateWelcome(); updateStats(); renderBoard(); renderCheckDesk(); archive?.render(); hoursArchive?.render(); jobArchive?.render(); window.HoursApp?.render(); window.JobApp?.render(); }

  function replayViewAnimation(view) {
    const node = $(`#${view}View`);
    if (!node || node.classList.contains("hidden")) return;
    node.classList.remove("page-enter");
    void node.offsetWidth;
    node.classList.add("page-enter");
  }

  async function renderCheckPhotos(record) {
    const grid = $("#checkPhotoGrid");
    const panel = $("#checkEvidence");
    if (!grid || !panel) return;
    const show = Boolean(record) && (record.stage === "waiting" || record.stage === "paid" || (record.checkPhotos || []).length);
    panel.classList.toggle("hidden", !show && !record);
    if (!record) { grid.innerHTML = ""; return; }
    panel.classList.remove("hidden");
    const photos = record.checkPhotos || [];
    if (!photos.length) {
      grid.innerHTML = `<p class="check-empty">Todavía no hay fotos. Si ya llegó el cheque, adjúntalo aquí.</p>`;
      return;
    }
    const cards = [];
    for (const photo of photos) {
      try {
        const blob = await Cloud.ensureCheckPhoto(photo);
        const url = URL.createObjectURL(blob);
        cards.push(`<figure class="check-thumb"><img src="${url}" alt="${esc(photo.file_name || "Cheque")}"><button type="button" class="mini-action delete" data-check-id="${esc(photo.id)}" aria-label="Quitar foto">×</button></figure>`);
      } catch (_) {
        cards.push(`<figure class="check-thumb"><span>No se pudo abrir</span></figure>`);
      }
    }
    grid.innerHTML = cards.join("");
  }

  function checkableRecords() {
    return records.filter(record => record.stage === "waiting" || record.stage === "paid" || (record.checkPhotos || []).length);
  }

  async function renderCheckDesk() {
    const select = $("#checkDeskInvoice");
    const status = $("#checkDeskStatus");
    const grid = $("#checkDeskGrid");
    if (!select || !status || !grid) return;
    const list = checkableRecords();
    const current = select.value;
    const empty = !list.length;
    $("#checkDesk")?.classList.toggle("is-empty", empty);
    select.disabled = empty;
    ["#checkDeskUploadButton", "#checkDeskGalleryButton", "#checkDeskCameraButton"].forEach(id => {
      const button = $(id);
      if (button) button.disabled = empty;
    });
    select.innerHTML = list.length
      ? list.map(record => `<option value="${esc(record.id)}">${esc(record.invoiceNumber)} · ${esc(record.address)}</option>`).join("")
      : `<option value="">Elige una invoice</option>`;
    if (current && list.some(record => record.id === current)) select.value = current;
    const record = records.find(item => item.id === select.value);
    if (!record) {
      status.textContent = "Mueve una invoice a Esperando cheque o Pagado y aquí podrás subir la foto.";
      grid.innerHTML = "";
      return;
    }
    const photos = record.checkPhotos || [];
    status.textContent = photos.length
      ? `${photos.length} foto${photos.length === 1 ? "" : "s"} en la nube para ${record.invoiceNumber}.`
      : `Aún no hay foto del cheque de ${record.invoiceNumber}.`;
    if (!photos.length) { grid.innerHTML = ""; return; }
    const cards = [];
    for (const photo of photos) {
      try {
        const blob = await Cloud.ensureCheckPhoto(photo);
        const url = URL.createObjectURL(blob);
        cards.push(`<figure class="check-thumb"><img src="${url}" alt="${esc(photo.file_name || "Cheque")}"><button type="button" class="mini-action delete" data-desk-check-id="${esc(photo.id)}" aria-label="Quitar foto">×</button></figure>`);
      } catch (_) {
        cards.push(`<figure class="check-thumb"><span>No se pudo abrir</span></figure>`);
      }
    }
    grid.innerHTML = cards.join("");
  }

  async function uploadCheckFiles(record, files) {
    if (!record) throw new Error("Elige primero una invoice.");
    const chosen = Array.from(files || []).filter(Boolean);
    if (!chosen.length) return record;
    for (const file of chosen) {
      const photo = await Cloud.addCheckPhoto(record.id, file);
      record.checkPhotos = [photo, ...(record.checkPhotos || [])];
    }
    replaceInMemory(record);
    return record;
  }

  function openCheckPicker(invoiceId, camera) {
    const picker = camera ? $("#checkDeskCamera") : $("#checkDeskFile");
    if (!picker) return;
    picker.dataset.invoiceId = invoiceId || "";
    picker.click();
  }

  function openModal(stage = "created", record = null) {
    editingId = record?.id || null;
    selectedPdf = null;
    $("#invoiceForm").reset();
    $("#recordId").value = editingId || "";
    $("#stage").value = record?.stage || stage;
    $("#modalTitle").textContent = record ? "Editar invoice" : "Nueva invoice";
    $("#saveButton").textContent = record ? "Guardar cambios" : "Guardar invoice";
    $("#formError").textContent = "";
    $("#fileStatus").textContent = "Formato PDF · hasta 15 MB";
    $("#currentFile").classList.toggle("hidden", !record?.pdfName);
    $("#currentFile").textContent = record?.pdfName ? `PDF actual: ${record.pdfName}. Puedes elegir otro para reemplazarlo.` : "";
    $("#recordIssuedDate").value = record ? Core.issuedDate(record) : "";
    $("#editGeneratedInvoiceButton").classList.toggle("hidden", !record?.invoiceData);
    if (record) {
      $("#address").value = record.address || "";
      $("#invoiceNumber").value = record.invoiceNumber || "";
      $("#amount").value = record.amount ?? "";
      $("#hours").value = record.hours ?? "";
      $("#description").value = record.description || "";
    }
    renderCheckPhotos(record);
    $("#modalBackdrop").classList.remove("hidden");
    setTimeout(() => $("#address").focus(), 50);
  }

  function closeModal() { $("#modalBackdrop").classList.add("hidden"); editingId = null; selectedPdf = null; }

  function readForm() {
    return { address: $("#address").value.trim(), invoiceNumber: $("#invoiceNumber").value.trim(), issuedDate: $("#recordIssuedDate").value, amount: Core.amount($("#amount").value), hours: Number($("#hours").value) || 0, description: $("#description").value.trim(), stage: $("#stage").value };
  }

  async function submitForm(event) {
    event.preventDefault();
    if (readingPdf || $("#saveButton").disabled) return;
    const data = readForm();
    if (!data.address || !data.invoiceNumber || data.amount == null || !Core.isoDate(data.issuedDate)) { $("#formError").textContent = "Completa dirección, número, fecha de emisión y un monto válido."; return; }
    if (data.amount < 0 || data.hours < 0) { $("#formError").textContent = "El monto y las horas no pueden ser negativos."; return; }
    if (selectedPdf && selectedPdf.size > MAX_PDF_BYTES) { $("#formError").textContent = "El PDF supera el límite de 15 MB."; return; }
    if (selectedPdf && selectedPdf.type !== "application/pdf" && !selectedPdf.name.toLowerCase().endsWith(".pdf")) { $("#formError").textContent = "Solo puedes subir archivos PDF."; return; }
    const previous = editingId ? records.find((record) => record.id === editingId) : null;
    if (!selectedPdf && !previous?.pdfBlob && !previous?.pdfPath && !previous?.invoiceData) { $("#formError").textContent = "Adjunta el PDF. Para crear una factura desde cero, usa Crear invoice."; return; }
    if (data.stage === "paid" && !(previous?.checkPhotos || []).length) {
      if (!confirm("¿Ya adjuntaste la foto del cheque? Puedes guardar pagada ahora y subirla después.")) return;
    }
    const wasEditing = Boolean(editingId);
    const record = { ...(previous || {}), ...data, id: editingId || makeId(), pdfBlob: selectedPdf || previous?.pdfBlob || null, pdfName: selectedPdf?.name || previous?.pdfName || "", updatedAt: new Date().toISOString(), paidAt: data.stage === "paid" ? (previous?.paidAt || new Date().toISOString()) : null };
    $("#saveButton").disabled = true;
    try {
      record.amount = Core.cents(data.amount) / 100;
      if (selectedPdf) {
        record.pdfBlob = selectedPdf.type && selectedPdf.type !== "application/pdf"
          ? new Blob([selectedPdf], { type: "application/pdf" })
          : selectedPdf;
        record.invoiceData = null;
        record.source = "imported";
        record.pdfHash = await PDFs.hash(record.pdfBlob);
        record.pdfPath = null;
      }
      else if (record.invoiceData && !record.pdfBlob) {
        const snapshot = {...record.invoiceData, invoiceNumber: record.invoiceNumber, issuedDate: record.issuedDate, workAddress: record.address, description: record.description};
        if (Core.cents(Number(snapshot.qty) * Number(snapshot.price)) !== Core.cents(record.amount)) {
          snapshot.qty = 1; snapshot.price = record.amount;
          if (snapshot.note) throw new Error("Esta invoice tiene una nota de pago personalizada. Modifica el monto y la nota desde Crear invoice para que coincidan.");
        }
        await attachGeneratedPdf(record, snapshot);
      }
      record.pdfName = Core.fileName(record);
      await saveRecord(record);
      replaceInMemory(record);
      closeModal(); render(); showToast(wasEditing ? "Invoice actualizada en la nube" : "Invoice guardada en la nube y en este navegador");
    } catch (error) { console.error(error); $("#formError").textContent = error.message || "No se pudo guardar. Revisa la conexión e intenta de nuevo."; }
    finally { $("#saveButton").disabled = false; }
  }

  async function moveRecord(recordId, stage) {
    const previous = records.find((item) => item.id === recordId);
    if (!previous || previous.stage === stage) return;
    if (stage === "paid" && !(previous.checkPhotos || []).length) {
      if (!confirm("¿Ya adjuntaste la foto del cheque? Puedes marcarla pagada ahora y subir la evidencia después.")) return;
    }
    const record = {...previous};
    record.stage = stage;
    record.updatedAt = new Date().toISOString();
    record.paidAt = stage === "paid" ? (record.paidAt || new Date().toISOString()) : null;
    try { await saveRecord(record); replaceInMemory(record); render(); showToast(`Movida a “${stages.find((item) => item.id === stage).title}”`); } catch (error) { console.error(error); showToast(error.message || "No se pudo mover la invoice"); }
  }

  function wireBoardEvents() {
    document.querySelectorAll(".invoice-card").forEach((card) => {
      card.addEventListener("dragstart", (event) => { draggedId = card.dataset.id; card.classList.add("dragging"); event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", draggedId); });
      card.addEventListener("dragend", () => { draggedId = null; card.classList.remove("dragging"); document.querySelectorAll(".kanban-column").forEach((column) => column.classList.remove("drag-over")); });
    });
    document.querySelectorAll(".kanban-column").forEach((column) => {
      column.addEventListener("dragover", (event) => { event.preventDefault(); column.classList.add("drag-over"); });
      column.addEventListener("dragleave", (event) => { if (!column.contains(event.relatedTarget)) column.classList.remove("drag-over"); });
      column.addEventListener("drop", (event) => { event.preventDefault(); column.classList.remove("drag-over"); const recordId = draggedId || event.dataTransfer.getData("text/plain"); moveRecord(recordId, column.dataset.stage); });
    });
  }

  async function openStoredPdf(record) {
    await Cloud.ensureInvoicePdf(record);
    replaceInMemory(record);
    const url = pdfUrl(record);
    if (url) window.open(url, "_blank", "noopener");
  }

  async function handleBoardClick(event) {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    const action = button.dataset.action;
    if (action === "toggle-column") {
      const stage = button.dataset.stage;
      if (expandedColumns.has(stage)) expandedColumns.delete(stage);
      else expandedColumns.add(stage);
      renderBoard();
      return;
    }
    if (action === "add") openModal(button.dataset.stage);
    if (action === "menu") { const record = records.find((item) => item.id === button.dataset.id); if (record) openModal(record.stage, record); }
    if (action === "open-pdf") { const record = records.find((item) => item.id === button.dataset.id); if (record) await openStoredPdf(record); }
    if (action === "next" || action === "back") { const record = records.find((item) => item.id === button.dataset.id); const index = stages.findIndex((stage) => stage.id === record?.stage); const next = index + (action === "next" ? 1 : -1); if (record && next >= 0 && next < stages.length) await moveRecord(record.id, stages[next].id); }
    if (action === "attach-check") {
      const record = records.find(item => item.id === button.dataset.id);
      if (!record) return;
      openCheckPicker(record.id, false);
    }
    if (action === "delete") {
      const record = records.find((item) => item.id === button.dataset.id);
      if (!record || !confirm(`¿Eliminar la invoice ${record.invoiceNumber} de ${record.address}? Se ocultará, no se borra del historial de la nube.`)) return;
      await removeRecord(record);
      if (pdfUrls.has(record.id)) { URL.revokeObjectURL(pdfUrls.get(record.id)); pdfUrls.delete(record.id); }
      records = records.filter((item) => item.id !== record.id);
      render(); showToast("Invoice archivada (eliminación suave)");
    }
  }

  async function selectPdf(file) {
    if (!file) return;
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) { $("#formError").textContent = "Solo puedes subir archivos PDF."; return; }
    if (file.size > MAX_PDF_BYTES) { $("#formError").textContent = "El PDF supera el límite de 15 MB."; return; }
    selectedPdf = file;
    readingPdf = true;
    if ($("#saveButton")) $("#saveButton").disabled = true;
    $("#fileStatus").textContent = file.name + " · Leyendo…";
    $("#formError").textContent = "";
    try {
      const result = await PDFs.read(file);
      if (selectedPdf !== file) return;
      if (result.fields.address) $("#address").value = result.fields.address;
      if (result.fields.invoiceNumber) $("#invoiceNumber").value = result.fields.invoiceNumber;
      if (result.fields.amount != null) $("#amount").value = result.fields.amount;
      if (result.fields.issuedDate) $("#recordIssuedDate").value = result.fields.issuedDate;
      $("#fileStatus").textContent = file.name + " · Revisa los datos antes de guardar.";
      $("#formError").textContent = result.warnings.join(" ");
    } catch (error) {
      if (selectedPdf === file) {
        $("#fileStatus").textContent = file.name + " · Completa los datos a mano y guarda.";
        $("#formError").textContent = error.message || "No se pudo leer el texto del PDF. El archivo sí quedó seleccionado.";
      }
    } finally {
      readingPdf = false;
      if ($("#saveButton")) $("#saveButton").disabled = false;
    }
  }

  function invoiceData() {
    const split = WhatsAppInvoiceParser.splitPrice?.($("#builderDescription").value.trim()) || { text: $("#builderDescription").value.trim(), amount: null };
    const price = Number($("#builderPrice").value) || split.amount || 0;
    return {
      invoiceNumber: $("#builderInvoiceNumber").value.trim(),
      issuedDate: $("#builderIssuedDate").value,
      approval: $("#builderApproval").value.trim() || "ESTIMATED AND APPROVED BY DIEGO",
      fromName: $("#builderFromName").value.trim() || "Ruben Perla",
      billName: $("#builderBillName").value.trim() || "Trenton Builders LLC",
      fromPhone: $("#builderFromPhone").value.trim(),
      billAddress: $("#builderBillAddress").value.trim(),
      workAddress: $("#builderWorkAddress").value.trim(),
      fromEmail: $("#builderFromEmail").value.trim(),
      fromAddress: $("#builderFromAddress").value.trim(),
      description: split.text || "Trabajo realizado",
      qty: Number($("#builderQty").value) > 0 ? Number($("#builderQty").value) : 1,
      price,
      deposit: Math.min(Math.max(Number($("#builderDeposit").value) || 0, 0), 100),
      note: $("#builderNote").value.trim(),
      sourceMessage: $("#whatsappText").value.trim(),
      logoDataUrl
    };
  }

  function invoiceDateLabel(date) {
    const parsed = new Date(`${date}T12:00:00`);
    return Number.isNaN(parsed.getTime()) ? date : parsed.toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" });
  }

  function updateInvoicePreview() {
    const data = invoiceData();
    const total = Core.cents(data.qty * data.price) / 100;
    const depositAmount = Math.round(Core.cents(total) * data.deposit / 100) / 100;
    const remainingAmount = (Core.cents(total) - Core.cents(depositAmount)) / 100;
    const note = data.note || `Note: At the beginning of the project, ${data.deposit}% equivalent to ${money(depositAmount)} is required, and at the end of the work, the final ${100 - data.deposit}% equivalent to ${money(remainingAmount)} is required.`;
    const values = {
      "#previewApproval": data.approval,
      "#previewInvoiceNumber": data.invoiceNumber,
      "#previewIssuedDate": invoiceDateLabel(data.issuedDate),
      "#previewFromNameParty": data.fromName,
      "#previewFromPhone": data.fromPhone,
      "#previewFromEmail": data.fromEmail,
      "#previewFromAddress": data.fromAddress,
      "#previewBillName": data.billName,
      "#previewBillAddress": data.billAddress,
      "#previewDescription": data.description,
      "#previewQty": data.qty,
      "#previewPrice": money(data.price),
      "#previewAmount": money(total),
      "#previewTotal": money(total).replace("$", "$ "),
      "#previewNote": note
    };
    Object.entries(values).forEach(([selector, value]) => { const element = $(selector); if (element) element.textContent = value; });
  }

  function setSidebarOpen(open) {
    const sidebar = $("#sidebar");
    if (!sidebar) return;
    sidebar.classList.toggle("open", open);
    $("#sidebarScrim")?.classList.toggle("visible", open);
    $("#sidebarScrim")?.setAttribute("aria-hidden", String(!open));
    document.body.classList.toggle("sidebar-lock", open);
    const menu = $("#mobileMenu");
    menu?.setAttribute("aria-expanded", String(open));
    menu?.setAttribute("aria-label", open ? "Cerrar menú" : "Abrir menú");
    $("#dockMore")?.classList.toggle("is-active", Boolean(open));
  }

  function showView(view) {
    $("#boardView").classList.toggle("hidden", view !== "board");
    $("#invoiceView").classList.toggle("hidden", view !== "invoice");
    $("#archiveView").classList.toggle("hidden", view !== "archive");
    $("#hoursArchiveView")?.classList.toggle("hidden", view !== "hoursArchive");
    $("#jobArchiveView")?.classList.toggle("hidden", view !== "jobArchive");
    $("#hoursView").classList.toggle("hidden", view !== "hours");
    $("#jobView")?.classList.toggle("hidden", view !== "job");
    setSidebarOpen(false);
    replayViewAnimation(view);
    if (view === "board") window.AuthApp?.replayWelcome?.();
    if (view === "invoice") updateInvoicePreview();
    if (view === "hours") window.HoursApp?.open();
    if (view === "job") window.JobApp?.open();
  }

  function fillInvoiceFromText() {
    const input = $("#whatsappText");
    const result = $("#whatsappResult");
    if (input.value.length > 16000) {
      result.textContent = "Pega un solo trabajo, con un máximo de 16,000 caracteres.";
      result.classList.remove("hidden");
      result.classList.add("is-error");
      return;
    }
    const parsed = WhatsAppInvoiceParser.parse(input.value);
    result.classList.remove("hidden");
    result.classList.toggle("is-error", Boolean(parsed.error));
    if (parsed.error) { result.textContent = parsed.error; return; }
    const fieldMap = {
      billName: ["builderBillName", "Compañía"],
      billAddress: ["builderBillAddress", "Dirección"],
      description: ["builderDescription", "Descripción"],
      approval: ["builderApproval", "Aprobación"],
      invoiceNumber: ["builderInvoiceNumber", "Número de invoice"],
      issuedDate: ["builderIssuedDate", "Fecha"],
      qty: ["builderQty", "Cantidad"],
      price: ["builderPrice", "Precio / total (USD)"],
      deposit: ["builderDeposit", "Anticipo"],
      note: ["builderNote", "Nota de pago"]
    };
    const applied = [];
    for (const [key, value] of Object.entries(parsed.fields)) {
      if (!fieldMap[key]) continue;
      const [elementId, label] = fieldMap[key];
      $("#" + elementId).value = String(value);
      if (key === "billAddress") $("#builderWorkAddress").value = String(value);
      const display = key === "price" ? money(value) : key === "deposit" ? value + "%" :
        key === "issuedDate" ? invoiceDateLabel(value) : String(value);
      applied.push({ label: key === "billAddress" ? "Dirección del cliente y del trabajo" : label, display });
    }
    const split = WhatsAppInvoiceParser.splitPrice($("#builderDescription").value);
    $("#builderDescription").value = split.text;
    if (split.amount != null && !(Number($("#builderPrice").value) > 0)) {
      $("#builderPrice").value = split.amount;
    }
    if (!(Number($("#builderQty").value) > 0)) $("#builderQty").value = 1;
    if (Number($("#builderPrice").value) > 0 && Number($("#builderQty").value) > 0) {
      const total = Core.cents(Number($("#builderQty").value) * Number($("#builderPrice").value)) / 100;
      parsed.detectedTotal = parsed.detectedTotal ?? total;
    }
    updateInvoicePreview();
    const missing = ["billName", "billAddress", "description", "approval", "invoiceNumber", "issuedDate", "price", "deposit"]
      .filter((key) => !Object.prototype.hasOwnProperty.call(parsed.fields, key))
      .map((key) => fieldMap[key][1].toLowerCase());
    const detectedMoney = parsed.detectedTotal != null
      ? `<p class="money-detected"><strong>Monto detectado:</strong> ${esc(money(parsed.detectedTotal))}</p>`
      : "";
    result.innerHTML = detectedMoney + (applied.length
      ? "<p><strong>Campos completados. Revisa la factura antes de guardarla.</strong></p>" +
        "<table><thead><tr><th>Campo</th><th>Texto detectado</th></tr></thead><tbody>" +
        applied.map((item) => "<tr><td>" + esc(item.label) + "</td><td>" + esc(item.display).replace(/\n/g, "<br>") + "</td></tr>").join("") +
        "</tbody></table>"
      : "<p><strong>No encontré campos claros en el mensaje.</strong> Prueba indicando Dirección:, Descripción: y Total: en líneas separadas.</p>");
    if (missing.length) result.innerHTML += "<p class=\"import-review\"><strong>Revisa estos campos; no se detectaron con seguridad y conservan su valor actual:</strong> " + esc(missing.join(", ")) + ".</p>";
    for (const notice of parsed.review) result.innerHTML += "<p class=\"import-review\">" + esc(notice) + "</p>";
    result.innerHTML += "<p>Comprueba también la nota de pago. La invoice se guarda cuando pulses “Guardar invoice y PDF”.</p>";
    growAllTextareas();
  }

  async function resetInvoiceBuilder() {
    builderRecordId = null;
    $("#builderInvoiceNumber").value = await Cloud.nextInvoiceNumber(records);
    $("#builderIssuedDate").value = WhatsAppInvoiceParser.dateValue();
    $("#builderApproval").value = "ESTIMATED AND APPROVED BY DIEGO";
    $("#builderFromName").value = "Ruben Perla";
    $("#builderBillName").value = "Trenton Builders LLC";
    $("#builderFromPhone").value = "+1 (469) 650-4958";
    $("#builderBillAddress").value = "1117 C St SE, Washington, DC 20003";
    $("#builderWorkAddress").value = "";
    $("#builderFromEmail").value = "pr391665@gmail.com";
    $("#builderFromAddress").value = "Birchview Ct Clinton MD 20735";
    $("#builderDescription").value = "Preparation and installation of stucco";
    $("#builderQty").value = "1";
    $("#builderPrice").value = "";
    $("#builderDeposit").value = "50";
    $("#builderNote").value = "";
    $("#builderLogo").value = "";
    $("#whatsappText").value = "";
    $("#whatsappResult").textContent = "";
    $("#whatsappResult").classList.add("hidden");
    logoDataUrl = DEFAULT_LOGO_URL;
    $("#paperLogo").classList.add("has-image");
    $("#paperLogo").innerHTML = `<img src="${DEFAULT_LOGO_URL}" alt="Logo de Ruben Perla" />`;
    updateInvoicePreview();
    growAllTextareas();
  }

  function withTimeout(work, ms, message) {
    const promise = typeof work === "function" ? work() : work;
    let timer = 0;
    return Promise.race([
      Promise.resolve(promise).finally(() => clearTimeout(timer)),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), ms); })
    ]);
  }

  async function logoBytes(data) {
    const url = typeof data.logoDataUrl === "string" && /^data:image\/(png|jpeg|webp);base64,/i.test(data.logoDataUrl) ? data.logoDataUrl : DEFAULT_LOGO_URL;
    try {
      const controller = typeof AbortController === "function" ? new AbortController() : null;
      const response = await withTimeout(fetch(url, controller ? { signal: controller.signal } : undefined), 4000, "logo");
      if (!response.ok) return null;
      const buffer = await withTimeout(response.arrayBuffer(), 4000, "logo");
      if (!buffer || buffer.byteLength < 32 || buffer.byteLength > 1500000) return null;
      return buffer;
    } catch (error) {
      console.warn("No se pudo preparar el logo de la invoice", error);
      return null;
    }
  }

  async function attachGeneratedPdf(record, data) {
    const snapshot = {...data, recordId: record.id};
    if (!window.PDFLib || !PDFs?.generate) throw new Error("No se cargó el generador de PDF. Recarga la página.");
    let logo = null;
    try { logo = await logoBytes(snapshot); } catch (_) { logo = null; }
    try {
      record.pdfBlob = await PDFs.generate(snapshot, logo);
    } catch (error) {
      console.warn("Reintentando el PDF sin logo", error);
      record.pdfBlob = await PDFs.generate(snapshot, null);
    }
    if (!record.pdfBlob || record.pdfBlob.size < 80) throw new Error("El PDF salió vacío. Vuelve a intentar.");
    record.pdfHash = await PDFs.hash(record.pdfBlob);
    record.pdfName = Core.fileName(record);
    record.invoiceData = snapshot;
    record.source = "generated";
    record.issuedDate = snapshot.issuedDate;
    record.pdfPath = null;
  }

  function offerGeneratedPdf(blob, name) {
    const link = $("#generatedPdfLink");
    if (!link || !blob) return;
    const url = URL.createObjectURL(blob);
    link.href = url;
    link.download = name || "invoice.pdf";
    link.textContent = "Si no se bajó, toca aquí para abrir el PDF";
    link.classList.remove("hidden");
  }

  async function saveGeneratedInvoice(alsoDownload = false) {
    if (savingBuilder) { showToast("Esta invoice ya se está guardando. Espera un momento."); return; }
    const data = invoiceData();
    const amount = Core.amount(data.qty * data.price);
    if (!data.workAddress || !data.invoiceNumber || !Core.isoDate(data.issuedDate) || amount == null || amount <= 0 || data.qty <= 0 || data.price <= 0) { showToast("Completa la dirección del trabajo, el número, la fecha y un monto mayor que cero."); return; }
    const previous = records.find(r => r.id === builderRecordId);
    const record = {...(previous || {}), id: previous?.id || makeId(), address: data.workAddress, invoiceNumber: data.invoiceNumber, issuedDate: data.issuedDate, amount: Core.cents(amount) / 100, hours: previous?.hours || 0, description: data.description, stage: previous?.stage || "created", updatedAt: new Date().toISOString(), paidAt: previous?.paidAt || null};
    savingBuilder = true;
    $("#saveGeneratedInvoiceButton").disabled = true; $("#printInvoiceButton").disabled = true;
    $("#saveGeneratedInvoiceButton").textContent = "Generando PDF…";
    try {
      await attachGeneratedPdf(record, data);
      offerGeneratedPdf(record.pdfBlob, record.pdfName);
      $("#saveGeneratedInvoiceButton").textContent = "Guardando en la nube…";
      try {
        await saveRecord(record);
        builderRecordId = record.id;
        replaceInMemory(record);
        render();
        $("#saveGeneratedInvoiceButton").textContent = "Descargando…";
        try { await download(record.pdfBlob, record.pdfName, { share: true }); }
        catch (downloadError) { console.warn(downloadError); }
        if (!alsoDownload) navClick("archive");
        showToast(previous
          ? "Invoice actualizada. El PDF quedó en la nube, en este teléfono y se descargó."
          : "Invoice guardada. El PDF quedó en la nube, en este teléfono y se descargó.");
      } catch (cloudError) {
        console.error(cloudError);
        try { await download(record.pdfBlob, record.pdfName, { share: true }); }
        catch (downloadError) { console.warn(downloadError); }
        showToast("El PDF se generó y quedó en este teléfono, pero no en la nube: " + (cloudError.message || "revisa la conexión."));
      }
    } catch (error) {
      console.error(error);
      showToast(error.message || "No se pudo generar el PDF de la invoice.");
    }
    finally { savingBuilder = false; $("#saveGeneratedInvoiceButton").disabled = false; $("#printInvoiceButton").disabled = false; $("#saveGeneratedInvoiceButton").textContent = "Guardar invoice y PDF"; }
  }

  function setDock(view) {
    document.querySelectorAll(".dock-item[data-dock]").forEach(item => {
      item.classList.toggle("is-active", item.dataset.dock === view);
    });
    if (view) $("#dockMore")?.classList.remove("is-active");
  }

  function navClick(stage) {
    document.querySelectorAll(".nav-item").forEach((item) => item.classList.toggle("active", item.dataset.nav === stage));
    const titles = {board: "Inicio", invoice: "Crear invoice", hours: "Horas trabajadas", job: "Otro formato de horas", archive: "Invoices / PDFs", "hours-archive": "Horas / PDFs", "job-archive": "Horas / PDFs", created: "Facturas creadas", working: "En trabajo", waiting: "Esperando cheque", paid: "Pagadas"};
    const label = $("#topbarSection");
    if (label) label.textContent = titles[stage] || "Inicio";
    if (stage === "invoice") { showView("invoice"); setDock("archive"); return; }
    if (stage === "hours") { showView("hours"); setDock("hours"); return; }
    if (stage === "job") { showView("job"); setDock("hours"); return; }
    if (stage === "hours-archive" || stage === "job-archive") { hoursArchive.open(); setDock("hours"); return; }
    if (stage === "board") { showView("board"); renderBoard(); setDock("board"); return; }
    archive.open(stage === "archive" ? "all" : stage);
    setDock("archive");
  }

  function editGeneratedInvoice() {
    const record = records.find(r => r.id === editingId);
    if (!record?.invoiceData) return;
    resetInvoiceBuilder(); builderRecordId = record.id;
    const data = record.invoiceData;
    const map = {invoiceNumber: "InvoiceNumber", issuedDate: "IssuedDate", approval: "Approval", fromName: "FromName", billName: "BillName", fromPhone: "FromPhone", billAddress: "BillAddress", workAddress: "WorkAddress", fromEmail: "FromEmail", fromAddress: "FromAddress", description: "Description", qty: "Qty", price: "Price", deposit: "Deposit", note: "Note"};
    Object.entries(map).forEach(([key, id]) => { if (data[key] != null) $("#builder" + id).value = data[key]; });
    $("#builderWorkAddress").value = record.address;
    $("#whatsappText").value = data.sourceMessage || "";
    logoDataUrl = /^data:image\/(png|jpeg|webp);base64,/i.test(data.logoDataUrl || "") ? data.logoDataUrl : DEFAULT_LOGO_URL;
    const img = document.createElement("img"); img.src = logoDataUrl; img.alt = "Logo de Ruben Perla";
    $("#paperLogo").replaceChildren(img);
    closeModal(); navClick("invoice");
  }

  async function recoverExistingPdfs() {
    let changed = false;
    for (const previous of records.slice()) {
      if (previous.pdfBlob && !previous.pdfHash) {
        try {
          const record = {...previous, pdfHash: await PDFs.hash(previous.pdfBlob)};
          await saveRecord(record); replaceInMemory(record); changed = true;
        } catch (error) { console.error("No se pudo preparar el PDF de", previous.invoiceNumber, error); }
      }
    }
    if (changed) render();
  }

  async function migrateLegacy() {
    if (localStorage.getItem("trenton.migrated-local") === "1") return;
    const legacy = await window.LegacyLocal.readAll();
    if (!legacy.invoices.length && !legacy.hours.length) {
      localStorage.setItem("trenton.migrated-local", "1");
      return;
    }
    if (!confirm(`Hay ${legacy.invoices.length} invoices y ${legacy.hours.length} reportes en este navegador. ¿Subirlos ahora a la nube?`)) return;
    try {
      if (legacy.invoices.length) await Cloud.saveMany(legacy.invoices, records);
      for (const report of legacy.hours) await Cloud.saveHours(report);
      localStorage.setItem("trenton.migrated-local", "1");
      await loadRecords();
      showToast("Datos de este navegador subidos a la nube.");
    } catch (error) {
      showToast(error.message || "No se pudieron subir todos los datos locales.");
    }
  }

  archive = window.InvoiceArchive({
    records: () => records,
    saveMany,
    reload: loadRecords,
    render,
    pdfUrl,
    showView,
    edit: r => openModal(r.stage, r),
    stages, esc, money, makeId, download, toast: showToast,
    ensurePdf: Cloud.ensureInvoicePdf,
    remove: async (record) => {
      await removeRecord(record);
      if (pdfUrls.has(record.id)) { URL.revokeObjectURL(pdfUrls.get(record.id)); pdfUrls.delete(record.id); }
      records = records.filter(item => item.id !== record.id);
    }
  });
  hoursArchive = window.HoursArchive({
    records: () => {
      const hours = (window.HoursApp?.reports?.() || []).map(record => {
        record.hoursFormat = "letter";
        return record;
      });
      const jobs = (window.JobApp?.reports?.() || []).map(record => {
        record.hoursFormat = "a3";
        record.reportDate = record.reportDate || record.startDate || record.entries?.[0]?.date || "";
        return record;
      });
      return hours.concat(jobs);
    },
    showView,
    download,
    toast: showToast,
    esc,
    money,
    ensurePdf: Cloud.ensureHoursPdf,
    openHours: () => navClick("hours"),
    openJob: () => navClick("job"),
    remove: async (record) => {
      await window.HoursApp.removeReport(record);
    }
  });
  jobArchive = window.JobArchive({
    records: () => window.JobApp?.reports?.() || [],
    showView,
    download,
    toast: showToast,
    esc,
    money,
    ensurePdf: Cloud.ensureJobPdf,
    openJob: () => navClick("job"),
    remove: async (record) => {
      await window.JobApp.removeReport(record);
    }
  });
  const jobRender = jobArchive.render.bind(jobArchive);
  jobArchive.render = () => { hoursArchive.render(); jobRender(); };
  jobArchive.open = () => hoursArchive.open();
  window.TrentonControl = { toast: showToast, records: () => records, hoursArchive, jobArchive, download };
  document.querySelectorAll("[data-archive]").forEach(button => button.addEventListener("click", () => navClick(button.dataset.archive === "all" ? "archive" : button.dataset.archive)));
  $("#editGeneratedInvoiceButton").addEventListener("click", editGeneratedInvoice);
  $("#newInvoiceButton").addEventListener("click", () => { if (builderRecordId) resetInvoiceBuilder(); navClick("invoice"); });
  $("#dockNewInvoice")?.addEventListener("click", () => { if (builderRecordId) resetInvoiceBuilder(); navClick("invoice"); });
  $("#dockMore")?.addEventListener("click", () => setSidebarOpen(!$("#sidebar").classList.contains("open")));
  $("#pdfDialogDownload")?.addEventListener("click", async event => {
    event.preventDefault();
    const kind = $("#pdfDialog")?.dataset.kind;
    const id = $("#pdfDialog")?.dataset.recordId;
    try {
      if (kind === "hours" || kind === "job") {
        const job = window.JobApp?.reports?.().find(item => item.id === id);
        const hours = window.HoursApp?.reports?.().find(item => item.id === id);
        const record = job || hours;
        if (!record) return showToast("No se encontró el PDF de horas.");
        if (job && window.JobApp?.rebuildPdf) await window.JobApp.rebuildPdf(record, true, false);
        else await Cloud.ensureHoursPdf(record);
        if (!record.pdfBlob) return showToast("No hay PDF de horas para descargar.");
        await download(record.pdfBlob, record.pdfName || "horas.pdf", { share: true });
        return;
      }
      const record = records.find(item => item.id === id);
      if (!record) return showToast("No se encontró el PDF.");
      await Cloud.ensureInvoicePdf(record);
      if (!record.pdfBlob) return showToast("No hay PDF para descargar.");
      await download(record.pdfBlob, Core.fileName(record), { share: true });
    } catch (error) {
      showToast(error.message || "No se pudo descargar el PDF.");
    }
  });
  document.querySelectorAll(".dock-item[data-dock]").forEach(item => item.addEventListener("click", () => navClick(item.dataset.dock)));
  $("#openArchiveButton").addEventListener("click", () => navClick("archive"));
  $("#openHoursArchiveButton")?.addEventListener("click", () => navClick("hours-archive"));
  $("#openHoursArchiveFromHours")?.addEventListener("click", () => navClick("hours-archive"));
  $("#openJobArchiveFromJob")?.addEventListener("click", () => navClick("hours-archive"));
  $("#closeModalButton").addEventListener("click", closeModal);
  $("#cancelButton").addEventListener("click", closeModal);
  $("#modalBackdrop").addEventListener("click", (event) => { if (event.target === $("#modalBackdrop")) closeModal(); });
  $("#invoiceForm").addEventListener("submit", submitForm);
  $("#choosePdfButton").addEventListener("click", () => $("#pdfFile").click());
  $("#pdfFile").addEventListener("change", (event) => selectPdf(event.target.files[0]));
  $("#uploadArea").addEventListener("dragover", (event) => { event.preventDefault(); $("#uploadArea").classList.add("dragging"); });
  $("#uploadArea").addEventListener("dragleave", () => $("#uploadArea").classList.remove("dragging"));
  $("#uploadArea").addEventListener("drop", (event) => { event.preventDefault(); $("#uploadArea").classList.remove("dragging"); selectPdf(event.dataTransfer.files[0]); });
  $("#board").addEventListener("click", handleBoardClick);
  $("#searchInput").addEventListener("input", renderBoard);
  $("#clearFilterButton").addEventListener("click", () => { $("#searchInput").value = ""; document.querySelectorAll(".nav-item").forEach((item) => item.classList.toggle("active", item.dataset.nav === "board")); renderBoard(); });
  document.querySelectorAll(".nav-item").forEach((item) => item.addEventListener("click", () => {
    if (!item.dataset.nav) return;
    navClick(item.dataset.nav);
  }));
  $("#mobileMenu").addEventListener("click", () => setSidebarOpen(!$("#sidebar").classList.contains("open")));
  $("#sidebarClose")?.addEventListener("click", () => setSidebarOpen(false));
  $("#sidebarScrim")?.addEventListener("click", () => setSidebarOpen(false));
  document.addEventListener("keydown", (event) => { if (event.key === "Escape") setSidebarOpen(false); });
  updateWelcome();
  setInterval(updateWelcome, 60000);
  $("#resetInvoiceButton").addEventListener("click", () => resetInvoiceBuilder());
  $("#printInvoiceButton").addEventListener("click", () => saveGeneratedInvoice(true));
  $("#saveGeneratedInvoiceButton").addEventListener("click", () => saveGeneratedInvoice(false));
  $("#fillInvoiceFromTextButton").addEventListener("click", fillInvoiceFromText);
  $("#whatsappText").addEventListener("paste", () => setTimeout(fillInvoiceFromText, 0));
  $("#whatsappText").addEventListener("input", () => $("#whatsappResult").classList.add("hidden"));
  ["builderInvoiceNumber", "builderIssuedDate", "builderApproval", "builderFromName", "builderBillName", "builderFromPhone", "builderBillAddress", "builderWorkAddress", "builderFromEmail", "builderFromAddress", "builderDescription", "builderQty", "builderPrice", "builderDeposit", "builderNote"].forEach((id) => $("#" + id).addEventListener("input", updateInvoicePreview));
  document.querySelectorAll("textarea.js-grow").forEach(el => el.addEventListener("input", () => growTextarea(el)));
  growAllTextareas();
  $("#builderDescription").addEventListener("blur", () => {
    const split = WhatsAppInvoiceParser.splitPrice($("#builderDescription").value);
    const priceEmpty = !(Number($("#builderPrice").value) > 0);
    if (split.text !== $("#builderDescription").value.trim() || (split.amount != null && priceEmpty)) {
      $("#builderDescription").value = split.text;
      if (split.amount != null && priceEmpty) {
        $("#builderPrice").value = split.amount;
        if (!(Number($("#builderQty").value) > 0)) $("#builderQty").value = 1;
      }
      updateInvoicePreview();
    }
  });
  $("#builderLogo").addEventListener("change", (event) => {
    const file = event.target.files[0];
    if (!file) return;
    if (!/^image\/(png|jpeg|webp)$/i.test(file.type) || file.size > 4 * 1024 * 1024) { showToast("Usa un logo PNG, JPG o WebP de hasta 4 MB."); return; }
    const reader = new FileReader();
    reader.onload = () => { logoDataUrl = reader.result; $("#paperLogo").classList.add("has-image"); $("#paperLogo").innerHTML = `<img src="${logoDataUrl}" alt="Logo" />`; };
    reader.readAsDataURL(file);
  });
  document.addEventListener("keydown", (event) => { if (event.key === "Escape" && !$("#modalBackdrop").classList.contains("hidden")) closeModal(); });
  $("#stage")?.addEventListener("change", () => {
    const record = editingId ? records.find(item => item.id === editingId) : { stage: $("#stage").value, checkPhotos: [] };
    if (record) renderCheckPhotos({ ...record, stage: $("#stage").value });
  });
  $("#addCheckPhotoButton")?.addEventListener("click", () => $("#checkPhotoFile")?.click());
  $("#addCheckPhotoCameraButton")?.addEventListener("click", () => $("#checkPhotoCamera")?.click());
  async function onCheckPhotoFiles(event) {
    const files = Array.from(event.target.files || []);
    const record = records.find(item => item.id === editingId);
    if (!record) { showToast("Guarda primero la invoice y luego adjunta el cheque."); event.target.value = ""; return; }
    try {
      await uploadCheckFiles(record, files);
      await renderCheckPhotos(record);
      render();
      showToast("Foto del cheque guardada en la nube.");
    } catch (error) { $("#formError").textContent = error.message || "No se pudo subir la foto."; }
    event.target.value = "";
  }
  $("#checkPhotoFile")?.addEventListener("change", onCheckPhotoFiles);
  $("#checkPhotoCamera")?.addEventListener("change", onCheckPhotoFiles);
  $("#checkPhotoGrid")?.addEventListener("click", async event => {
    const button = event.target.closest("[data-check-id]");
    if (!button) return;
    const record = records.find(item => item.id === editingId);
    const photo = record?.checkPhotos?.find(item => item.id === button.dataset.checkId);
    if (!photo || !confirm("¿Quitar esta foto del cheque?")) return;
    await Cloud.removeCheckPhoto(photo);
    record.checkPhotos = record.checkPhotos.filter(item => item.id !== photo.id);
    replaceInMemory(record);
    await renderCheckPhotos(record);
    render();
  });
  $("#checkDeskInvoice")?.addEventListener("change", () => renderCheckDesk());
  $("#checkDeskGalleryButton")?.addEventListener("click", () => {
    const record = records.find(item => item.id === $("#checkDeskInvoice")?.value);
    if (!record) { showToast("Mueve una invoice a Esperando cheque o Pagado para adjuntar el cheque."); return; }
    openCheckPicker(record.id, false);
  });
  $("#checkDeskCameraButton")?.addEventListener("click", () => {
    const record = records.find(item => item.id === $("#checkDeskInvoice")?.value);
    if (!record) { showToast("Mueve una invoice a Esperando cheque o Pagado para adjuntar el cheque."); return; }
    openCheckPicker(record.id, true);
  });
  $("#checkDeskUploadButton")?.addEventListener("click", () => {
    const record = records.find(item => item.id === $("#checkDeskInvoice")?.value);
    if (!record) { showToast("Mueve una invoice a Esperando cheque o Pagado para adjuntar el cheque."); return; }
    openCheckPicker(record.id, false);
  });
  async function onCheckDeskFiles(event) {
    const invoiceId = event.target.dataset.invoiceId || $("#checkDeskInvoice")?.value;
    const record = records.find(item => item.id === invoiceId);
    try {
      await uploadCheckFiles(record, event.target.files);
      if (editingId === record?.id) await renderCheckPhotos(record);
      render();
      showToast("Foto del cheque guardada en la nube.");
    } catch (error) { showToast(error.message || "No se pudo subir la foto del cheque."); }
    event.target.value = "";
    delete event.target.dataset.invoiceId;
  }
  $("#checkDeskFile")?.addEventListener("change", onCheckDeskFiles);
  $("#checkDeskCamera")?.addEventListener("change", onCheckDeskFiles);
  $("#checkDeskGrid")?.addEventListener("click", async event => {
    const button = event.target.closest("[data-desk-check-id]");
    if (!button) return;
    const invoiceId = $("#checkDeskInvoice")?.value;
    const record = records.find(item => item.id === invoiceId);
    const photo = record?.checkPhotos?.find(item => item.id === button.dataset.deskCheckId);
    if (!photo || !confirm("¿Quitar esta foto del cheque?")) return;
    await Cloud.removeCheckPhoto(photo);
    record.checkPhotos = record.checkPhotos.filter(item => item.id !== photo.id);
    replaceInMemory(record);
    render();
  });

  window.TranslatorApp?.bindAll();

  async function boot() {
    try {
      await window.LocalCache.open();
      await loadRecords();
      await migrateLegacy();
      await resetInvoiceBuilder();
      updateSaved("En la nube y en este navegador");
      render();
      growAllTextareas();
      ready = true;
      recoverExistingPdfs().catch(error => console.warn(error));
      window.HoursApp?.boot?.().catch(error => console.warn(error));
      window.JobApp?.boot?.().catch(error => console.warn(error));
    } catch (error) {
      console.error(error);
      ready = true;
      updateSaved("Nube no disponible");
      render();
      showToast(error.message || "No se pudieron cargar los registros de Supabase.");
    }
  }

  window.AuthApp.start({
    onReady: boot,
    onLogout() {
      records = [];
      ready = false;
      window.HoursApp?.resetSession?.();
      window.JobApp?.resetSession?.();
      render();
    }
  });
})();

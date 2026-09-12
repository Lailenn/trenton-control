// Reads one pasted message. It does not connect to WhatsApp or save an invoice.
const WhatsAppInvoiceParser = (() => {
  const fold = (text) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const dateValue = (date = new Date()) => [
    date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")
  ].join("-");

  function cleanLines(raw) {
    return String(raw || "").replace(/\r\n?/g, "\n")
      .replace(/[\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g, "")
      .replace(/\u00a0/g, " ").split("\n").map((line) => line
        .replace(/^\s*\[(?=[^\]]*\d{1,2}:\d{2})[^\]]{1,100}\]\s*[^:\n]{1,100}:\s*/, "")
        .replace(/^\s*\d{1,2}[/.]\d{1,2}[/.]\d{2,4},?\s+\d{1,2}:\d{2}(?:\s*[ap]\.?\s*m\.?)?\s*-\s*[^:\n]{1,100}:\s*/i, "")
        .replace(/(?:^|\s+)\d{1,2}:\d{2}\s*[ap]\.?\s*m\.?\s*(?:[✓✔]+)?\s*$/i, "")
        .trim().replace(/^[*_\x60]+|[*_\x60]+$/g, "").trim())
      .filter((line) => line && !/^[-—–_=•\s]+$/.test(line));
  }

  function numberValue(text) {
    let value = String(text).trim().replace(/(?:USD|US\$|d[oó]lares?)/gi, "")
      .replace(/\$/g, "").replace(/\s/g, "").trim();
    if (!/^\d+(?:[.,]\d+)*$/.test(value)) return null;
    const comma = value.lastIndexOf(",");
    const dot = value.lastIndexOf(".");
    if (comma >= 0 && dot >= 0) {
      const decimal = comma > dot ? "," : ".";
      const thousands = decimal === "," ? "." : ",";
      const parts = value.split(decimal);
      const grouped = thousands === "," ? /^\d{1,3}(?:,\d{3})+$/ : /^\d{1,3}(?:\.\d{3})+$/;
      if (parts.length !== 2 || !/^\d{1,2}$/.test(parts[1]) || !grouped.test(parts[0])) return null;
      value = parts[0].split(thousands).join("") + "." + parts[1];
    } else if (comma >= 0 || dot >= 0) {
      if (/^\d{1,3}(?:,\d{3})+$/.test(value) || /^\d{1,3}(?:\.\d{3})+$/.test(value)) {
        value = value.replace(/[.,]/g, "");
      } else if (/^\d+[.,]\d{1,2}$/.test(value)) {
        value = value.replace(",", ".");
      } else return null;
    }
    const amount = Number(value);
    return Number.isFinite(amount) && amount <= 1e10 ? amount : null;
  }

  function moneyLineValue(line) {
    const value = String(line || "").trim();
    if (!/^(?:(?:US\$|USD|\$)\s*)?\d{1,3}(?:[,.\s]\d{3})+(?:[.,]\d{1,2})?\s*(?:USD|d[oó]lares?)?$/i.test(value)) return null;
    return numberValue(value);
  }

  function exactDate(year, month, day) {
    const date = new Date(year, month - 1, day);
    return year >= 1900 && year <= 2200 && date.getFullYear() === year &&
      date.getMonth() === month - 1 && date.getDate() === day ? dateValue(date) : null;
  }

  function readDate(value, now) {
    const clean = fold(value).replace(/[.!]$/, "").trim();
    if (/^(?:con\s+)?fecha\s+de\s+hoy$|^hoy$|^today$|^today['’]s date$/.test(clean)) return dateValue(now);
    let match = clean.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (match) return exactDate(Number(match[1]), Number(match[2]), Number(match[3]));
    match = clean.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
    if (match) return exactDate(Number(match[3]), Number(match[2]), Number(match[1]));
    const months = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
    match = clean.match(/^(\d{1,2})\s+(?:de\s+)?([a-z]+)\s+(?:de\s+)?(\d{4})$/);
    if (match && months.includes(match[2])) return exactDate(Number(match[3]), months.indexOf(match[2]) + 1, Number(match[1]));
    return null;
  }

  function parse(raw, now = new Date()) {
    const lines = cleanLines(raw);
    const candidates = new Map();
    const description = [];
    const notes = [];
    const review = [];
    const rejected = new Set();
    let continuation = "description";
    const add = (key, value) => {
      if (value === "" || value == null) return;
      const list = candidates.get(key) || [];
      list.push(value);
      candidates.set(key, list);
    };
    const addNumber = (key, value, label) => {
      const number = numberValue(value);
      if (number == null) {
        rejected.add(key);
        review.push("Revisa " + label + ": no pude leer “" + value + "” como un solo número.");
      } else add(key, number);
    };

    for (let index = 0; index < lines.length; index++) {
      const line = lines[index];
      const normalized = fold(line);
      let match;
      const following = (value) => value.trim() || (lines[++index] || "").trim();

      match = line.match(/^(?:nota|note|observaciones|condiciones de pago)\s*:\s*(.*)$/i);
      if (match) { notes.push(match[1]); continuation = "note"; continue; }
      match = line.match(/^(?:descripci[oó]n(?: del trabajo)?|description|trabajo)\s*:\s*(.*)$/i);
      if (match) { description.push(match[1]); continuation = "description"; continue; }

      // Ignore greetings and the sender label if copied with the message.
      if (/^(?:hola|buenos dias|buenas tardes|buenas noches|gracias)[!.,\s]*$|^ruben perla:?$/i.test(normalized)) continue;

      match = line.match(/^(?:compa[nñ][ií]a|empresa|cliente|bill to)\s*:\s*(.*)$/i);
      if (match) {
        const value = following(match[1]);
        add("billName", /\btrento(?:n)?\b/i.test(value) ? "Trenton Builders LLC" : value);
        continue;
      }
      if (/\btrento(?:n)?\b/i.test(line) && /^(?:para\b|trento(?:n)?\b|la (?:misma )?compania\b)/.test(normalized)) {
        add("billName", "Trenton Builders LLC"); continue;
      }

      match = line.match(/^(?:direcci[oó]n(?: del (?:trabajo|cliente))?|address|ubicaci[oó]n)\s*:\s*(.*)$/i);
      if (match) { add("billAddress", following(match[1])); continue; }
      if (/^\d{1,6}[a-z]?(?:[-/]\d+)?\s+.+\b(?:st(?:reet)?|ave(?:nue)?|rd|road|dr(?:ive)?|ct|court|blvd|boulevard|ln|lane|way|pl|place|pkwy|parkway|ter|terrace|cir|circle)\.?(?:\s|,|$)/i.test(line)) {
        let address = line;
        // A city/state/ZIP on the following line belongs to the same address.
        if (lines[index + 1] && /^[A-Za-z .'-]+,\s*[A-Z]{2}\s+\d{5}(?:-\d{4})?$/i.test(lines[index + 1])) address += ", " + lines[++index];
        add("billAddress", address); continue;
      }

      match = line.match(/^(?:n[uú]mero de (?:invoice|factura)|invoice(?:\s*(?:no\.?|number|n[.º°]+))?|factura(?:\s*(?:no\.?|n[.º°]+))?)\s*(?::|#|=)\s*(.*)$/i);
      if (match) {
        const value = following(match[1]).replace(/^#/, "");
        if (/^[A-Za-z0-9][A-Za-z0-9._/-]{0,39}$/.test(value)) add("invoiceNumber", "#" + value);
        else review.push("Revisa el número de invoice.");
        continue;
      }
      match = line.match(/^(?:(?:estimated\s+and\s+)?approved\s+by|estimated\s+and\s+approved\s+by|(?:estimado\s+y\s+)?aprobado\s+por)\s+.+$/i);
      if (match) { add("approval", line.toUpperCase()); continue; }
      match = line.match(/^(?:aprobaci[oó]n|approval)\s*:\s*(.*)$/i);
      if (match) { add("approval", following(match[1]).toUpperCase()); continue; }

      match = line.match(/^(?:fecha(?: de emisi[oó]n)?|issued(?: date)?|date)\s*:\s*(.*)$/i);
      if (match || /^(?:con\s+)?fecha\s+de\s+hoy[.!]?$|^con fecha\s+/i.test(line)) {
        const value = match ? following(match[1]) : line.replace(/^con fecha\s+(?!de hoy)/i, "");
        const date = readDate(value, now);
        if (date) {
          add("issuedDate", date);
          if (/^\d{1,2}[/-]\d{1,2}[/-]\d{4}$/.test(value)) review.push("La fecha numérica se leyó como día/mes/año.");
        } else { rejected.add("issuedDate"); review.push("Revisa la fecha: “" + value + "” no es una fecha válida reconocida."); }
        continue;
      }

      match = line.match(/^(?:cantidad|qty|quantity)\s*:\s*(.*)$/i);
      if (match) { addNumber("qty", following(match[1]), "la cantidad"); continue; }
      match = line.match(/^(?:precio (?:por unidad|unitario)|unit price)\s*:\s*(.*)$/i);
      if (match) { addNumber("price", following(match[1]), "el precio por unidad"); continue; }
      match = line.match(/^(?:price\s+for\s+(?:materials?|materiales?)\s+and\s+(?:labor|labour|mano\s+de\s+obra)|precio\s+(?:por|de|para) materiales?\s+y\s+mano\s+de\s+obra|grand\s+total|total(?:\s+(?:amount|due|a\s+pagar))?|monto(?:\s+total)?|importe|precio(?:\s+total)?|amount(?:\s+(?:due|a\s+pagar))?|costo(?:\s+total)?|balance\s+due)\b\s*(?::|=)?\s*(.*)$/i);
      if (match) { addNumber("total", following(match[1]), "el monto total"); continue; }
      if (/^(?:US\$|USD|\$)\s*[\d.,\s]+(?:\s*USD)?$/i.test(line) || /^(?:\d{1,3}(?:[,.\s]\d{3})+|\d+[.,]\d{2})\s*(?:USD|US\$|d[oó]lares?)$/i.test(line)) {
        addNumber("total", line, "el monto total"); continue;
      }
      const standaloneMoney = moneyLineValue(line);
      if (standaloneMoney != null && standaloneMoney >= 100) {
        add("total", standaloneMoney); continue;
      }

      match = normalized.match(/^(?:(?:anticipo(?: requerido)?|deposito|deposit)\s*:?\s*(\d+(?:[.,]\d{1,2})?)\s*%|(\d+(?:[.,]\d{1,2})?)\s*%\s+(?:de\s+)?anticipo)[.!]?$/);
      if (match) {
        const percent = numberValue(match[1] || match[2]);
        if (percent != null && percent <= 100) add("deposit", percent);
        else { rejected.add("deposit"); review.push("El anticipo debe estar entre 0% y 100%."); }
        continue;
      }
      if (/^(?:anticipo|deposito|deposit)\b/.test(normalized)) {
        notes.push(line); rejected.add("deposit");
        review.push("El anticipo se conservó como nota; revisa si es un monto o un porcentaje."); continue;
      }
      if (/^(?:horas?|hours?|tarifa|rate)\b/.test(normalized) || /^[\d$.,:\s]+$/.test(line)) {
        review.push("Línea para revisar manualmente: “" + line + "”."); continue;
      }
      (continuation === "note" ? notes : description).push(line);
    }

    const fields = {};
    const conflicts = [];
    for (const [key, values] of candidates) {
      const unique = [...new Map(values.map((value) => [String(value).toLowerCase(), value])).values()];
      if (unique.length > 1) conflicts.push(key);
      else if (!rejected.has(key)) fields[key] = unique[0];
    }
    if (description.some(Boolean)) fields.description = description.filter(Boolean).join("\n");
    if (notes.some(Boolean)) fields.note = notes.filter(Boolean).join("\n");
    if (conflicts.length) return { fields: {}, review: [], error: "Hay datos distintos para un mismo campo. Pega solo un trabajo y un monto final, o corrige las líneas repetidas." };

    // A lump-sum total must not be multiplied by a quantity from another invoice.
    let detectedTotal = fields.total;
    if (fields.total != null) {
      if (fields.qty != null && fields.price != null && Math.abs(Math.round(fields.qty * fields.price * 100) - Math.round(fields.total * 100)) > 0) {
        delete fields.total; delete fields.qty; delete fields.price;
        detectedTotal = undefined;
        review.push("Cantidad × precio no coincide con el total. Completa esos campos manualmente.");
      } else if (fields.qty != null && fields.price != null) {
        delete fields.total;
      } else {
        fields.qty = 1; fields.price = fields.total; delete fields.total;
        review.push("El monto total se cargó como un trabajo completo: cantidad 1.");
      }
    } else if (fields.price != null && fields.qty == null) {
      delete fields.price;
      review.push("Hay un precio por unidad, pero falta la cantidad. Revisa ambos campos.");
    } else if (fields.qty != null && fields.price == null) {
      delete fields.qty;
      review.push("Hay una cantidad, pero falta un precio reconocido. Revisa ambos campos.");
    }
    if (rejected.has("total") || rejected.has("price") || rejected.has("qty")) {
      delete fields.qty; delete fields.price;
      detectedTotal = undefined;
    }
    return { fields, detectedTotal, review, error: lines.length ? "" : "Pega primero el texto del mensaje." };
  }
  return { parse, dateValue };
})();

if (typeof module !== "undefined" && module.exports) module.exports = WhatsAppInvoiceParser;

(() => {
  "use strict";
  if (typeof document === "undefined" || typeof window === "undefined") return;

  const DB_NAME = "trenton-control-db";
  const DB_VERSION = 2;
  const STORE = "invoices";
  const MAX_PDF_BYTES = 15 * 1024 * 1024;
  const Core = window.InvoiceCore, PDFs = window.InvoicePDF;
  const stages = [
    { id: "created", title: "Factura creada", subtitle: "PDF listo para seguimiento", className: "column-created" },
    { id: "working", title: "En trabajo", subtitle: "Rubén está trabajando", className: "column-working" },
    { id: "waiting", title: "Entregado / esperando cheque", subtitle: "Trenton debe pagar", className: "column-waiting" },
    { id: "paid", title: "Pagado", subtitle: "Invoice cerrada", className: "column-paid" }
  ];

  const $ = (selector) => document.querySelector(selector);
  const money = (value) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(Number(value) || 0);
  const esc = (value) => String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#039;", '"': "&quot;" }[char]));
  const makeId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let db;
  let records = [];
  let editingId = null;
  let selectedPdf = null;
  let draggedId = null;
  let toastTimer;
  let archive, builderRecordId = null, savingBuilder = false, readingPdf = false;
  const DEFAULT_LOGO_URL = "assets/logo-ruben.png";
  let logoDataUrl = DEFAULT_LOGO_URL;
  const pdfUrls = new Map();

  function openDatabase() {
    return new Promise((resolve, reject) => {
      if (!window.indexedDB) return reject(new Error("IndexedDB no disponible"));
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(STORE)) database.createObjectStore(STORE, {keyPath: "id"});
        if (!database.objectStoreNames.contains("hoursReports")) database.createObjectStore("hoursReports", {keyPath: "id"});
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("No se pudo abrir el almacenamiento"));
    });
  }

  function storeRequest(mode, action) {
    return new Promise((resolve, reject) => {
      try {
        const tx = db.transaction(STORE, mode);
        const request = action(tx.objectStore(STORE));
        tx.oncomplete = () => resolve(request.result);
        tx.onabort = () => reject(tx.error || new Error("No se completó el guardado"));
        tx.onerror = () => reject(tx.error || request.error);
      } catch (error) { reject(error); }
    });
  }

  async function loadRecords() {
    records = (await storeRequest("readonly", (store) => store.getAll())) || [];
    records.sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
  }

  async function saveRecord(record) {
    await saveMany([record]);
    updateSaved("Guardado localmente");
  }

  function saveMany(incoming) {
    return new Promise((resolve, reject) => {
      if (!db) return reject(new Error("El almacenamiento no está disponible."));
      const tx = db.transaction(STORE, "readwrite"), store = tx.objectStore(STORE);
      let reason;
      tx.oncomplete = resolve;
      tx.onabort = () => reject(reason || tx.error || new Error("No se guardó la operación."));
      tx.onerror = () => reject(tx.error || new Error("No se pudo guardar."));
      const request = store.getAll();
      request.onsuccess = () => {
        const seen = request.result.filter(r => !incoming.some(n => n.id === r.id));
        for (const r of incoming) {
          const duplicate = seen.find(old => (Core.logicalKey(r) && Core.logicalKey(r) === Core.logicalKey(old)) ||
            (r.pdfHash && r.pdfHash === old.pdfHash) || (r.sourceId && (r.sourceId === old.id || r.sourceId === old.sourceId)));
          if (duplicate) { reason = new Error("Esta invoice ya está guardada: " + duplicate.invoiceNumber + ", " + duplicate.address + ". Edita el registro existente."); tx.abort(); return; }
          seen.push(r);
        }
        incoming.forEach(r => store.put(r));
      };
    });
  }

  function replaceInMemory(record) {
    if (pdfUrls.has(record.id)) { URL.revokeObjectURL(pdfUrls.get(record.id)); pdfUrls.delete(record.id); }
    if (records.some(r => r.id === record.id)) records = records.map(r => r.id === record.id ? record : r);
    else records.unshift(record);
  }

  function download(blob, name) {
    const url = URL.createObjectURL(blob), a = document.createElement("a");
    a.href = url; a.download = name; document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  async function removeRecord(recordId) { await storeRequest("readwrite", (store) => store.delete(recordId)); }

  function updateSaved(text) { $("#savedIndicator").innerHTML = `<i></i> ${esc(text)}`; }

  function updateWelcome() {
    const now = new Date();
    const hour = now.getHours();
    const greeting = hour < 12 ? "Buenos días" : hour < 19 ? "Buenas tardes" : "Buenas noches";
    const greetingElement = $("#welcomeGreeting");
    const quoteElement = $("#heroQuote");
    if (greetingElement) greetingElement.textContent = `${greeting}, Lilian.`;
    if (quoteElement) {
      const phrases = [
        "Cada trabajo organizado hoy construye un mañana más grande.",
        "El orden de hoy convierte cada esfuerzo en progreso.",
        "Paso a paso, cada invoice se transforma en crecimiento."
      ];
      quoteElement.textContent = phrases[now.getDate() % phrases.length];
    }
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
    $("#navTotal").textContent = records.length;
  }

  function pdfUrl(record) {
    if (!record.pdfBlob) return "";
    if (!pdfUrls.has(record.id)) pdfUrls.set(record.id, URL.createObjectURL(record.pdfBlob));
    return pdfUrls.get(record.id);
  }

  function cardTemplate(record) {
    const file = record.pdfBlob && record.pdfName ? `<a class="pdf-link" href="${pdfUrl(record)}" target="_blank" rel="noopener" title="Abrir ${esc(record.pdfName)}">▣ ${esc(record.pdfName)}</a>` : `<span class="no-pdf">Sin PDF adjunto</span>`;
    return `<article class="invoice-card" draggable="true" data-id="${esc(record.id)}" tabindex="0">
      <div class="card-top"><span class="card-invoice">${esc(record.invoiceNumber || "SIN NÚMERO")}</span><button class="card-menu" type="button" data-action="menu" data-id="${esc(record.id)}" aria-label="Editar invoice">•••</button></div>
      <h4 class="card-address">${esc(record.address)}</h4>
      <p class="card-description" title="${esc(record.description)}">${esc(record.description || "Sin descripción")}</p>
      <div class="card-details"><span class="card-amount">${money(record.amount)}</span><span class="card-hours">${Number(record.hours || 0)} h trabajadas</span></div>
      <div class="card-footer"><span>${file}</span><span class="card-actions"><button class="mini-action" type="button" data-action="back" data-id="${esc(record.id)}" aria-label="Mover a fase anterior">‹</button><button class="mini-action" type="button" data-action="next" data-id="${esc(record.id)}" aria-label="Mover a fase siguiente">›</button><button class="mini-action delete" type="button" data-action="delete" data-id="${esc(record.id)}" aria-label="Eliminar invoice">×</button></span></div>
    </article>`;
  }

  function renderBoard() {
    const visible = records.filter(matchesSearch);
    $("#board").innerHTML = stages.map((stage) => {
      const items = visible.filter((record) => record.stage === stage.id);
      return `<section class="kanban-column ${stage.className}" data-stage="${stage.id}"><header class="column-head"><div class="column-title"><span class="column-dot"></span><div><h3>${stage.title}</h3><p>${stage.subtitle}</p></div></div><span class="column-count">${items.length}</span></header><div class="column-cards">${items.length ? items.map(cardTemplate).join("") : `<div class="empty-column"><span>＋</span>Arrastra aquí una invoice</div>`}</div><button class="add-card-button" type="button" data-action="add" data-stage="${stage.id}">＋ Agregar invoice</button></section>`;
    }).join("");
    wireBoardEvents();
  }

  function render() { updateWelcome(); updateStats(); renderBoard(); archive?.render(); window.HoursApp?.render(); }

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
    if (!selectedPdf && !previous?.pdfBlob && !previous?.invoiceData) { $("#formError").textContent = "Adjunta el PDF. Para crear una factura desde cero, usa Crear invoice."; return; }
    const wasEditing = Boolean(editingId);
    const record = { ...(previous || {}), ...data, id: editingId || makeId(), pdfBlob: selectedPdf || previous?.pdfBlob || null, pdfName: selectedPdf?.name || previous?.pdfName || "", updatedAt: new Date().toISOString(), paidAt: data.stage === "paid" ? (previous?.paidAt || new Date().toISOString()) : null };
    $("#saveButton").disabled = true;
    try {
      record.amount = Core.cents(data.amount) / 100;
      if (selectedPdf) { record.invoiceData = null; record.source = "imported"; record.pdfHash = await PDFs.hash(selectedPdf); }
      else if (record.invoiceData) {
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
      closeModal(); render(); showToast(wasEditing ? "Invoice actualizada" : "Invoice guardada");
    } catch (error) { console.error(error); $("#formError").textContent = error.message || "No se pudo guardar. Intenta de nuevo en este navegador."; }
    finally { $("#saveButton").disabled = false; }
  }

  async function moveRecord(recordId, stage) {
    const previous = records.find((item) => item.id === recordId);
    if (!previous || previous.stage === stage) return;
    const record = {...previous};
    record.stage = stage;
    record.updatedAt = new Date().toISOString();
    record.paidAt = stage === "paid" ? (record.paidAt || new Date().toISOString()) : null;
    try { await saveRecord(record); replaceInMemory(record); render(); showToast(`Movida a “${stages.find((item) => item.id === stage).title}”`); } catch (error) { console.error(error); showToast("No se pudo mover la invoice"); }
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

  async function handleBoardClick(event) {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    const action = button.dataset.action;
    if (action === "add") openModal(button.dataset.stage);
    if (action === "menu") { const record = records.find((item) => item.id === button.dataset.id); if (record) openModal(record.stage, record); }
    if (action === "next" || action === "back") { const record = records.find((item) => item.id === button.dataset.id); const index = stages.findIndex((stage) => stage.id === record?.stage); const next = index + (action === "next" ? 1 : -1); if (record && next >= 0 && next < stages.length) await moveRecord(record.id, stages[next].id); }
    if (action === "delete") { const record = records.find((item) => item.id === button.dataset.id); if (!record || !confirm(`¿Eliminar la invoice ${record.invoiceNumber} de ${record.address}?`)) return; await removeRecord(record.id); if (pdfUrls.has(record.id)) { URL.revokeObjectURL(pdfUrls.get(record.id)); pdfUrls.delete(record.id); } records = records.filter((item) => item.id !== record.id); render(); showToast("Invoice eliminada"); }
  }

  async function selectPdf(file) {
    if (!file) return;
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) { $("#formError").textContent = "Solo puedes subir archivos PDF."; return; }
    if (file.size > MAX_PDF_BYTES) { $("#formError").textContent = "El PDF supera el límite de 15 MB."; return; }
    selectedPdf = file;
    readingPdf = true; $("#saveButton").disabled = true;
    $("#fileStatus").textContent = "Leyendo PDF…";
    $("#formError").textContent = "";
    try {
      const result = await PDFs.read(file);
      if (selectedPdf !== file) return;
      if (result.fields.address) $("#address").value = result.fields.address;
      if (result.fields.invoiceNumber) $("#invoiceNumber").value = result.fields.invoiceNumber;
      $("#amount").value = result.fields.amount ?? "";
      if (result.fields.issuedDate) $("#recordIssuedDate").value = result.fields.issuedDate;
      $("#fileStatus").textContent = file.name + " · Revisa los datos antes de guardar.";
      $("#formError").textContent = result.warnings.join(" ");
    } catch (error) { if (selectedPdf === file) { selectedPdf = null; $("#formError").textContent = "No se pudo leer el PDF. Comprueba que sea válido y sin contraseña."; } }
    finally { readingPdf = false; $("#saveButton").disabled = false; }
  }

  function invoiceData() {
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
      description: $("#builderDescription").value.trim() || "Trabajo realizado",
      qty: Number($("#builderQty").value) || 0,
      price: Number($("#builderPrice").value) || 0,
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
      "#previewFromName": data.fromName,
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
    requestAnimationFrame(fitInvoicePreview);
  }

  function fitInvoicePreview() {
    const viewport = $("#invoiceViewport");
    const paper = $("#invoicePaper");
    if (!viewport || !paper || !viewport.clientWidth || !paper.offsetHeight) return;
    const scale = Math.min(1, viewport.clientWidth / paper.offsetWidth);
    paper.style.transform = `scale(${scale})`;
    const height = `${Math.ceil(paper.offsetHeight * scale)}px`;
    if (viewport.style.height !== height) viewport.style.height = height;
  }

  function setSidebarOpen(open) {
    const sidebar = $("#sidebar");
    if (!sidebar) return;
    sidebar.classList.toggle("open", open);
    $("#sidebarScrim")?.classList.toggle("visible", open);
    document.body.classList.toggle("sidebar-lock", open);
    const menu = $("#mobileMenu");
    menu?.setAttribute("aria-expanded", String(open));
    menu?.setAttribute("aria-label", open ? "Cerrar menú" : "Abrir menú");
  }

  function showView(view) {
    $("#boardView").classList.toggle("hidden", view !== "board");
    $("#invoiceView").classList.toggle("hidden", view !== "invoice");
    $("#archiveView").classList.toggle("hidden", view !== "archive");
    $("#hoursView").classList.toggle("hidden", view !== "hours");
    setSidebarOpen(false);
    if (view === "invoice") updateInvoicePreview();
    if (view === "hours") window.HoursApp?.open();
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
    if (parsed.fields.price == null) { $("#builderPrice").value = ""; updateInvoicePreview(); }
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
  }

  function resetInvoiceBuilder() {
    builderRecordId = null;
    const next = records.reduce((max, r) => /^#?\d+$/.test(r.invoiceNumber || "") ? Math.max(max, Number(r.invoiceNumber.replace("#", ""))) : max, 0) + 1;
    $("#builderInvoiceNumber").value = "#" + String(next).padStart(3, "0");
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
  }

  async function logoBytes(data) {
    const url = typeof data.logoDataUrl === "string" && /^data:image\/(png|jpeg|webp);base64,/i.test(data.logoDataUrl) ? data.logoDataUrl : DEFAULT_LOGO_URL;
    const response = await fetch(url);
    if (!response.ok) throw new Error("No se pudo cargar el logo. Abre index.html con Live Server y conserva la carpeta assets.");
    const blob = await response.blob();
    if (/image\/(png|jpeg)/i.test(blob.type)) return blob.arrayBuffer();
    const bitmap = await createImageBitmap(blob);
    const canvas = document.createElement("canvas"); canvas.width = bitmap.width; canvas.height = bitmap.height;
    canvas.getContext("2d").drawImage(bitmap, 0, 0); bitmap.close();
    const converted = await new Promise(resolve => canvas.toBlob(resolve, "image/png"));
    if (!converted) throw new Error("No se pudo convertir el logo. Usa una imagen PNG o JPG.");
    return converted.arrayBuffer();
  }

  async function attachGeneratedPdf(record, data) {
    const snapshot = {...data, recordId: record.id};
    record.pdfBlob = await PDFs.generate(snapshot, await logoBytes(snapshot));
    record.pdfHash = await PDFs.hash(record.pdfBlob);
    record.pdfName = Core.fileName(record);
    record.invoiceData = snapshot;
    record.source = "generated";
    record.issuedDate = snapshot.issuedDate;
  }

  async function saveGeneratedInvoice(alsoDownload = false) {
    if (savingBuilder) return;
    const data = invoiceData();
    const amount = Core.amount(data.qty * data.price);
    if (!data.workAddress || !data.invoiceNumber || !Core.isoDate(data.issuedDate) || amount == null || amount <= 0 || data.qty <= 0 || data.price <= 0) { showToast("Completa la dirección del trabajo, el número, la fecha y un monto mayor que cero."); return; }
    const previous = records.find(r => r.id === builderRecordId);
    const record = {...(previous || {}), id: previous?.id || makeId(), address: data.workAddress, invoiceNumber: data.invoiceNumber, issuedDate: data.issuedDate, amount: Core.cents(amount) / 100, hours: previous?.hours || 0, description: data.description, stage: previous?.stage || "created", updatedAt: new Date().toISOString(), paidAt: previous?.paidAt || null};
    savingBuilder = true;
    $("#saveGeneratedInvoiceButton").disabled = true; $("#printInvoiceButton").disabled = true;
    $("#saveGeneratedInvoiceButton").textContent = "Guardando PDF…";
    try {
      await attachGeneratedPdf(record, data);
      await saveRecord(record);
      builderRecordId = record.id;
      replaceInMemory(record);
      render();
      if (alsoDownload) download(record.pdfBlob, record.pdfName);
      else navClick("archive");
      showToast(previous ? "Invoice y PDF actualizados." : "Invoice y PDF guardados por dirección.");
    } catch (error) { console.error(error); showToast(error.message || "No se pudo guardar la invoice y su PDF."); }
    finally { savingBuilder = false; $("#saveGeneratedInvoiceButton").disabled = false; $("#printInvoiceButton").disabled = false; $("#saveGeneratedInvoiceButton").textContent = "Guardar invoice y PDF"; }
  }

  function navClick(stage) {
    document.querySelectorAll(".nav-item").forEach((item) => item.classList.toggle("active", item.dataset.nav === stage));
    if (stage === "invoice") { showView("invoice"); return; }
    if (stage === "hours") { showView("hours"); return; }
    if (stage === "board") { showView("board"); renderBoard(); return; }
    archive.open(stage === "archive" ? "all" : stage);
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
          if (!Core.issuedDate(record)) {
            try { record.issuedDate = (await PDFs.read(record.pdfBlob)).fields.issuedDate || ""; } catch (_) { /* Keep undated records for manual review. */ }
          }
          await saveRecord(record); replaceInMemory(record); changed = true;
        } catch (error) { console.error("No se pudo preparar el PDF de", previous.invoiceNumber, error); }
        continue;
      }
      if (!previous.invoiceData || previous.pdfBlob) continue;
      const date = Core.issuedDate(previous);
      if (!date) continue;
      try {
        const record = {...previous, issuedDate: date};
        const data = {...previous.invoiceData, issuedDate: date, workAddress: previous.address, invoiceNumber: previous.invoiceNumber, description: previous.description};
        if (Core.cents(Number(data.qty) * Number(data.price)) !== Core.cents(previous.amount)) { data.qty = 1; data.price = previous.amount; if (data.note) continue; }
        await attachGeneratedPdf(record, data); await saveRecord(record); replaceInMemory(record); changed = true;
      } catch (error) { console.error("No se pudo recuperar el PDF de", previous.invoiceNumber, error); }
    }
    if (changed) render();
  }

  archive = window.InvoiceArchive({records: () => records, saveMany, reload: loadRecords, render, pdfUrl, showView, edit: r => openModal(r.stage, r), stages, esc, money, makeId, download, toast: showToast});
  window.TrentonControl = {toast: showToast};
  document.querySelectorAll("[data-archive]").forEach(button => button.addEventListener("click", () => navClick(button.dataset.archive === "all" ? "archive" : button.dataset.archive)));
  $("#editGeneratedInvoiceButton").addEventListener("click", editGeneratedInvoice);
  $("#newInvoiceButton").addEventListener("click", () => { if (builderRecordId) resetInvoiceBuilder(); navClick("invoice"); });
  $("#openArchiveButton").addEventListener("click", () => navClick("archive"));
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
  document.querySelectorAll(".nav-item").forEach((item) => item.addEventListener("click", () => navClick(item.dataset.nav)));
  $("#mobileMenu").addEventListener("click", () => setSidebarOpen(!$("#sidebar").classList.contains("open")));
  $("#sidebarScrim")?.addEventListener("click", () => setSidebarOpen(false));
  document.addEventListener("keydown", (event) => { if (event.key === "Escape") setSidebarOpen(false); });
  updateWelcome();
  setInterval(updateWelcome, 60000);
  $("#resetInvoiceButton").addEventListener("click", resetInvoiceBuilder);
  window.addEventListener("resize", fitInvoicePreview);
  window.addEventListener("afterprint", fitInvoicePreview);
  $("#paperLogo").addEventListener("load", fitInvoicePreview, true);
  if ("ResizeObserver" in window) {
    const previewObserver = new ResizeObserver(() => requestAnimationFrame(fitInvoicePreview));
    previewObserver.observe($("#invoiceViewport"));
    previewObserver.observe($("#invoicePaper"));
  }
  $("#printInvoiceButton").addEventListener("click", () => saveGeneratedInvoice(true));
  $("#saveGeneratedInvoiceButton").addEventListener("click", () => saveGeneratedInvoice(false));
  $("#fillInvoiceFromTextButton").addEventListener("click", fillInvoiceFromText);
  $("#whatsappText").addEventListener("paste", () => setTimeout(fillInvoiceFromText, 0));
  $("#whatsappText").addEventListener("input", () => $("#whatsappResult").classList.add("hidden"));
  ["builderInvoiceNumber", "builderIssuedDate", "builderApproval", "builderFromName", "builderBillName", "builderFromPhone", "builderBillAddress", "builderWorkAddress", "builderFromEmail", "builderFromAddress", "builderDescription", "builderQty", "builderPrice", "builderDeposit", "builderNote"].forEach((id) => $("#" + id).addEventListener("input", updateInvoicePreview));
  $("#builderLogo").addEventListener("change", (event) => {
    const file = event.target.files[0];
    if (!file) return;
    if (!/^image\/(png|jpeg|webp)$/i.test(file.type) || file.size > 4 * 1024 * 1024) { showToast("Usa un logo PNG, JPG o WebP de hasta 4 MB."); return; }
    const reader = new FileReader();
    reader.onload = () => { logoDataUrl = reader.result; $("#paperLogo").classList.add("has-image"); $("#paperLogo").innerHTML = `<img src="${logoDataUrl}" alt="Logo" />`; };
    reader.readAsDataURL(file);
  });
  document.addEventListener("keydown", (event) => { if (event.key === "Escape" && !$("#modalBackdrop").classList.contains("hidden")) closeModal(); });

  (async () => {
    const controls = ["saveGeneratedInvoiceButton", "printInvoiceButton", "saveButton", "importInvoicesButton"];
    controls.forEach(id => $("#" + id).disabled = true);
    try { db = await openDatabase(); await loadRecords(); resetInvoiceBuilder(); updateSaved("Guardado localmente"); render(); await recoverExistingPdfs(); }
    catch (error) { console.error(error); updateSaved("Almacenamiento no disponible"); render(); showToast("Este navegador no permite guardar registros localmente"); }
    finally { controls.forEach(id => $("#" + id).disabled = !db); }
  })();
})();

/* Editor PDF: document library, signature library ("Mis firmas"), templates and the editor.
   Pages are shown with pdf.js; added content lives as editable elements and is merged into the
   final PDF with pdf-lib (the original file is never modified). Storage: PdfStore. */
window.PdfEditor = (function () {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = v => String(v ?? "").replace(/[&<>'"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#039;", '"': "&quot;" }[c]));
  const toast = t => window.TrentonControl?.toast?.(t);
  const Store = () => window.PdfStore;
  const uid = () => Math.random().toString(36).slice(2, 9);
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const fmtDate = iso => iso ? new Date(iso).toLocaleDateString("es", { day: "numeric", month: "short", year: "numeric" }) : "—";
  const fmtDateTime = iso => iso ? new Date(iso).toLocaleString("es", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";
  const fmtSize = b => !b ? "" : b < 1048576 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1048576).toFixed(1)} MB`;
  const MAX_PDF = 50 * 1024 * 1024, MAX_IMG = 10 * 1024 * 1024;
  const LETTER = [612, 792];
  const FONTS = { helv: "Helvetica, Arial, sans-serif", times: "\"Times New Roman\", Times, serif", courier: "\"Courier New\", Courier, monospace" };
  const STATUS = { original: "Original", editado: "Editado", revision: "Pendiente de revisión" };

  /* ---------- icons (24 x 24 strokes) ---------- */
  const P = {
    upload: "M12 15V4M7 9l5-5 5 5M4 15v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4",
    plus: "M12 5v14M5 12h14",
    file: "M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5",
    filePen: "M12.5 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v3.5M14 3v5h5M18.4 13.6a1.9 1.9 0 0 1 2.7 2.7L16.5 21 14 21.5l.5-2.5z",
    sign: "M3 17c3-1 4-8 6-8s0 7 2 7 2-4 4-4 1 3 3 3 2-1 3-2M3 21h18",
    back: "M15 18l-6-6 6-6",
    undo: "M9 14 4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11",
    redo: "M15 14l5-5-5-5M20 9H9.5a5.5 5.5 0 0 0 0 11H13",
    save: "M5 3h11l3 3v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM7 3v6h8V3M7 21v-7h10v7",
    download: "M12 4v11M7 10l5 5 5-5M5 20h14",
    more: "",
    cursor: "M5 3l13 7-6 2-2 6z",
    text: "M5 6V4h14v2M12 4v16M9 20h6",
    image: "M4 5h16v14H4zM4 16l5-5 4 4 3-3 4 4M15.5 9h.01",
    calendar: "M4.5 6h15v14h-15zM4.5 10h15M8.5 3.5v4M15.5 3.5v4",
    check: "M4 4h16v16H4zM8 12.5l3 3 5-6",
    stamp: "M9 3h6v6l3 3H6l3-3zM5 15h14v3H5zM7 21h10",
    highlight: "M9 11l-5 5v4h4l5-5M14 6l4 4-6 6-4-4zM15 5l2-2 4 4-2 2",
    underline: "M6 4v7a6 6 0 0 0 12 0V4M5 21h14",
    strike: "M16 6a4 4 0 0 0-4-2c-2.5 0-4 1.3-4 3 0 1.5 1 2.4 3 3M4 12h16M8.5 17a4.2 4.2 0 0 0 3.5 2c2.6 0 4.2-1.4 4.2-3.2",
    pen: "M4 20l4-1L19 8a2.1 2.1 0 0 0-3-3L5 16zM14 6l3 3",
    line: "M5 19L19 5",
    arrow: "M5 19L19 5M10 5h9v9",
    rect: "M4 6h16v12H4z",
    ellipse: "M12 5c4.4 0 8 3.1 8 7s-3.6 7-8 7-8-3.1-8-7 3.6-7 8-7z",
    comment: "M4 5h16v11H9l-5 4z",
    rotate: "M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7",
    copy: "M9 9h11v11H9zM5 15H4V4h11v1",
    trash: "M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3",
    up: "M12 19V5M6 11l6-6 6 6",
    down: "M12 5v14M6 13l6 6 6-6",
    zoomIn: "M11 4a7 7 0 1 1 0 14 7 7 0 0 1 0-14zM20 20l-4-4M11 8v6M8 11h6",
    zoomOut: "M11 4a7 7 0 1 1 0 14 7 7 0 0 1 0-14zM20 20l-4-4M8 11h6",
    fit: "M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5",
    pages: "M8 3h9l3 3v12H8zM4 7v14h12",
    sliders: "M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0M14 4v4M8 10v4M16 16v4",
    link: "M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1.1 1.1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1.1-1.1",
    history: "M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 7v5l3 2",
    print: "M6 9V3h12v6M6 18H4v-7h16v7h-2M7 14h10v7H7z",
    star: "M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z",
    edit: "M4 20l4-1L19 8a2.1 2.1 0 0 0-3-3L5 16z",
    eraser: "M7 21h12M5 15l9-9 5 5-9 9H8z",
    hash: "M5 9h14M5 15h14M10 4l-2 16M16 4l-2 16"
  };
  const ic = (name, cls = "") => name === "more"
    ? `<svg class="pe-i ${cls}" viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg>`
    : `<svg class="pe-i ${cls}" viewBox="0 0 24 24" aria-hidden="true"><path d="${P[name]}"/></svg>`;

  /* ---------- shared helpers ---------- */
  async function isPdf(file) {
    if (!file) return false;
    const head = new Uint8Array(await file.slice(0, 5).arrayBuffer());
    return String.fromCharCode(...head) === "%PDF-";
  }
  const pdfLib = () => { if (!window.PDFLib) throw new Error("Falta la librería de PDF. Recarga la página."); return window.PDFLib; };
  async function loadPdfJs(blob) { await window.PdfPreview.loadLib(); return window.PdfPreview.openDoc(blob); }
  function download(blob, name) {
    if (window.TrentonControl?.download) return window.TrentonControl.download(blob, name, { share: true });
    return window.TrentonFiles?.saveBlob(blob, name);
  }
  function loadImage(blob) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(blob), img = new Image();
      img.onload = () => resolve({ img, url, w: img.naturalWidth, h: img.naturalHeight });
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("No se pudo leer la imagen.")); };
      img.src = url;
    });
  }
  const canvasBlob = (canvas, type = "image/png") => new Promise(r => canvas.toBlob(r, type));
  // Removes a white/light background (soft edges kept) and trims empty margins. The original file is untouched.
  async function processSignature(blob, removeWhite) {
    const { img, url, w, h } = await loadImage(blob);
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    const x = c.getContext("2d", { willReadFrequently: true });
    x.drawImage(img, 0, 0);
    URL.revokeObjectURL(url);
    const data = x.getImageData(0, 0, w, h), px = data.data;
    let minX = w, minY = h, maxX = -1, maxY = -1;
    for (let i = 0; i < px.length; i += 4) {
      if (removeWhite) {
        const light = Math.min(px[i], px[i + 1], px[i + 2]);
        if (light > 238) px[i + 3] = 0;
        else if (light > 200) px[i + 3] = Math.round(px[i + 3] * (238 - light) / 38);
      }
      if (px[i + 3] > 12) {
        const p = i / 4, yy = Math.floor(p / w), xx = p % w;
        if (xx < minX) minX = xx; if (xx > maxX) maxX = xx; if (yy < minY) minY = yy; if (yy > maxY) maxY = yy;
      }
    }
    x.putImageData(data, 0, 0);
    if (maxX < 0) return canvasBlob(c);
    const pad = 6, cx = Math.max(0, minX - pad), cy = Math.max(0, minY - pad);
    const cw = Math.min(w, maxX + pad) - cx, ch = Math.min(h, maxY + pad) - cy;
    const out = document.createElement("canvas");
    out.width = cw; out.height = ch;
    out.getContext("2d").drawImage(c, cx, cy, cw, ch, 0, 0, cw, ch);
    return canvasBlob(out);
  }
  async function hasLightBackground(blob) {
    const { img, url, w, h } = await loadImage(blob);
    const c = document.createElement("canvas");
    c.width = Math.min(w, 200); c.height = Math.max(1, Math.round(h * c.width / w));
    const x = c.getContext("2d", { willReadFrequently: true });
    x.drawImage(img, 0, 0, c.width, c.height);
    URL.revokeObjectURL(url);
    const d = x.getImageData(0, 0, c.width, c.height).data;
    const corner = (cx, cy) => { const i = (cy * c.width + cx) * 4; return d[i + 3] > 200 && Math.min(d[i], d[i + 1], d[i + 2]) > 225; };
    return [corner(0, 0), corner(c.width - 1, 0), corner(0, c.height - 1), corner(c.width - 1, c.height - 1)].filter(Boolean).length >= 3;
  }
  function pickFile(accept) {
    return new Promise(resolve => {
      const input = Object.assign(document.createElement("input"), { type: "file", accept });
      input.addEventListener("change", () => resolve(input.files?.[0] || null), { once: true });
      input.click();
    });
  }

  /* ---------- small dialog helper ---------- */
  function dialog({ title, body, actions, wide, onReady }) {
    return new Promise(resolve => {
      const wrap = document.createElement("div");
      wrap.className = "pe-dialog";
      wrap.innerHTML = `<section class="pe-dialog-card${wide ? " is-wide" : ""}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
        <header><h3>${esc(title)}</h3><button type="button" class="pe-x" data-close aria-label="Cerrar">×</button></header>
        <div class="pe-dialog-body">${body}</div>
        <footer>${actions.map(a => `<button type="button" class="pe-btn${a.primary ? " is-primary" : ""}${a.danger ? " is-danger" : ""}" data-act="${a.id}">${a.label}</button>`).join("")}</footer>
      </section>`;
      document.body.append(wrap);
      const close = value => { wrap.classList.add("is-closing"); setTimeout(() => wrap.remove(), 200); document.removeEventListener("keydown", onKey); resolve(value); };
      const onKey = e => { if (e.key === "Escape") close(null); };
      document.addEventListener("keydown", onKey);
      wrap.addEventListener("click", async e => {
        if (e.target === wrap || e.target.closest("[data-close]")) return close(null);
        const btn = e.target.closest("[data-act]");
        if (!btn) return;
        const action = actions.find(a => a.id === btn.dataset.act);
        if (action?.validate && !(await action.validate(wrap))) return;
        close({ id: btn.dataset.act, root: wrap });
      });
      onReady?.(wrap, close);
    });
  }
  const confirmDialog = (title, text, label = "Eliminar") =>
    dialog({ title, body: `<p class="pe-muted">${esc(text)}</p>`, actions: [{ id: "no", label: "Cancelar" }, { id: "yes", label, danger: true }] }).then(r => r?.id === "yes");

  /* =====================================================================
     LIBRARY
     ===================================================================== */
  let root = null, libTab = "recientes", libQuery = "";
  function mount() {
    root = $("#editorView");
    if (!root || root.dataset.ready) return root;
    root.dataset.ready = "1";
    root.innerHTML = `<div class="pe-library"></div><div class="pe-editor" hidden></div>`;
    root.addEventListener("dragover", e => { if (!libraryVisible()) return; e.preventDefault(); root.classList.add("is-dropping"); });
    root.addEventListener("dragleave", e => { if (!root.contains(e.relatedTarget)) root.classList.remove("is-dropping"); });
    root.addEventListener("drop", e => {
      if (!libraryVisible()) return;
      e.preventDefault();
      root.classList.remove("is-dropping");
      const file = e.dataTransfer?.files?.[0];
      if (file) uploadFlow(file);
    });
    return root;
  }
  const libraryVisible = () => !$(".pe-library", root)?.hidden;

  async function renderLibrary() {
    const lib = $(".pe-library", root);
    lib.innerHTML = `
      <div class="pe-lib-head">
        <div><p class="eyebrow">Documentos y firmas</p><h1>Editor PDF</h1><p class="hero-copy">Sube un PDF, agrega textos, fechas y la firma de Rubén, y descarga el documento final. El original nunca se modifica.</p></div>
        <div class="pe-lib-actions">
          <button type="button" class="button button-ghost" data-lib="new">${ic("plus")} Crear documento</button>
          <button type="button" class="button button-primary" data-lib="upload">${ic("upload")} Subir PDF</button>
        </div>
      </div>
      <button type="button" class="pe-drop" data-lib="upload">${ic("upload")}<strong>Arrastra un PDF aquí o toca para elegirlo</strong><span>Solo archivos PDF, hasta 50 MB</span></button>
      <div class="pe-lib-bar">
        <div class="pe-tabs" role="tablist">
          ${[["recientes", "Recientes"], ["editados", "Editados"], ["revision", "Pendientes de revisión"], ["firmas", "Mis firmas"], ["plantillas", "Plantillas"]]
            .map(([id, label]) => `<button type="button" role="tab" class="${libTab === id ? "is-active" : ""}" data-tab="${id}">${label}</button>`).join("")}
        </div>
        <label class="pe-search">${ic("zoomOut").replace("M8 11h6", "")}<input type="search" placeholder="Buscar documento o dirección…" value="${esc(libQuery)}"></label>
      </div>
      <div class="pe-lib-body"><p class="pe-muted pe-loading-line">Cargando…</p></div>`;
    lib.onclick = onLibraryClick;
    $(".pe-search input", lib).oninput = e => { libQuery = e.target.value; renderLibraryBody(); };
    renderLibraryBody();
  }

  async function renderLibraryBody() {
    const body = $(".pe-lib-body", root);
    $(".pe-search", root).hidden = libTab === "firmas" || libTab === "plantillas";
    if (libTab === "firmas") return renderSignatures(body);
    if (libTab === "plantillas") return renderTemplates(body);
    let docs = [];
    try { docs = await Store().listDocs(); } catch (error) { body.innerHTML = `<p class="pe-empty">${esc(error.message)}</p>`; return; }
    const q = libQuery.trim().toLowerCase();
    docs = docs.filter(d => (libTab === "recientes" || (libTab === "editados" ? d.status === "editado" : d.status === "revision"))
      && (!q || `${d.name} ${d.link?.label || ""}`.toLowerCase().includes(q)));
    if (!docs.length) {
      body.innerHTML = `<div class="pe-empty">${ic("filePen")}<strong>${libTab === "recientes" ? "Todavía no hay documentos" : "No hay documentos en esta lista"}</strong><span>${libTab === "recientes" ? "Sube un PDF para empezar." : ""}</span></div>`;
      return;
    }
    body.innerHTML = `<div class="pe-doc-grid">${docs.map(d => `
      <article class="pe-doc" data-doc="${esc(d.id)}">
        <button type="button" class="pe-doc-thumb" data-doc-act="open" aria-label="Abrir ${esc(d.name)}">${ic("file")}<span>${d.pages || "?"} pág.</span></button>
        <div class="pe-doc-info">
          <strong title="${esc(d.name)}">${esc(d.name)}</strong>
          <span class="pe-chip is-${esc(d.status)}">${STATUS[d.status] || "Original"}</span>
          ${d.link ? `<span class="pe-link-chip">${ic("link")}${esc(d.link.label)}</span>` : ""}
          <small>Creado ${fmtDate(d.createdAt)} · Modificado ${fmtDateTime(d.updatedAt)}</small>
          <small>${d.pages || "?"} páginas${d.versions?.length ? ` · ${d.versions.length} versión${d.versions.length === 1 ? "" : "es"}` : ""}</small>
        </div>
        <div class="pe-doc-actions">
          <button type="button" class="pe-btn is-primary" data-doc-act="open">${ic("edit")} Editar</button>
          <button type="button" class="pe-icon" data-doc-act="duplicate" title="Duplicar">${ic("copy")}</button>
          <button type="button" class="pe-icon" data-doc-act="download" title="Descargar">${ic("download")}</button>
          <button type="button" class="pe-icon" data-doc-act="review" title="${d.status === "revision" ? "Marcar revisado" : "Marcar pendiente de revisión"}">${ic("star")}</button>
          <button type="button" class="pe-icon is-danger" data-doc-act="delete" title="Eliminar">${ic("trash")}</button>
        </div>
      </article>`).join("")}</div>`;
  }

  async function onLibraryClick(e) {
    const tab = e.target.closest("[data-tab]");
    if (tab) { libTab = tab.dataset.tab; $$(".pe-tabs button", root).forEach(b => b.classList.toggle("is-active", b === tab)); return renderLibraryBody(); }
    const lib = e.target.closest("[data-lib]");
    if (lib?.dataset.lib === "upload") { const f = await pickFile("application/pdf,.pdf"); if (f) uploadFlow(f); return; }
    if (lib?.dataset.lib === "new") return createBlank();
    const act = e.target.closest("[data-doc-act]");
    if (act) {
      const id = act.closest("[data-doc]").dataset.doc;
      const doc = await Store().getDoc(id);
      if (!doc) return;
      if (act.dataset.docAct === "open") return openDoc(id);
      if (act.dataset.docAct === "duplicate") { await Store().duplicateDoc(id); toast("Documento duplicado."); return renderLibraryBody(); }
      if (act.dataset.docAct === "download") return downloadLatest(doc);
      if (act.dataset.docAct === "review") { await Store().updateDoc(id, { status: doc.status === "revision" ? (doc.versions?.length ? "editado" : "original") : "revision" }); return renderLibraryBody(); }
      if (act.dataset.docAct === "delete") {
        if (!(await confirmDialog("Eliminar documento", `¿Eliminar "${doc.name}" con su original y sus versiones? Esta acción no se puede deshacer.`))) return;
        await Store().deleteDoc(id);
        toast("Documento eliminado.");
        return renderLibraryBody();
      }
    }
    // Signature and template actions are handled in their renderers (delegation below).
    onSignatureClick(e);
    onTemplateClick(e);
  }

  async function downloadLatest(doc) {
    const last = doc.versions?.[doc.versions.length - 1];
    const blob = last ? await Store().getVersionPdf(doc.id, last.n) : await Store().getOriginal(doc.id);
    if (!blob) return toast("No se pudo descargar el documento.");
    download(blob, last ? doc.name.replace(/(\.pdf)?$/i, "-editado.pdf") : doc.name);
  }

  // Upload: validate, preview (name, size, pages, first page), then open in the editor.
  async function uploadFlow(file, link) {
    if (!(await isPdf(file))) return toast("Ese archivo no es un PDF válido.");
    if (file.size > MAX_PDF) return toast("El PDF supera el límite de 50 MB.");
    let pdf;
    try { pdf = await loadPdfJs(file); } catch (_) { return toast("No se pudo leer el PDF. Puede estar dañado o protegido."); }
    const result = await dialog({
      title: "Vista previa del documento",
      body: `<div class="pe-preview"><canvas></canvas><div><strong>${esc(file.name)}</strong><span>${fmtSize(file.size)} · ${pdf.numPages} página${pdf.numPages === 1 ? "" : "s"}</span><p class="pe-muted">Se guarda una copia original intacta. Las ediciones van aparte.</p></div></div>`,
      actions: [{ id: "cancel", label: "Cancelar" }, { id: "replace", label: "Reemplazar archivo" }, { id: "open", label: "Abrir en el editor", primary: true }],
      onReady: async wrap => {
        const page = await pdf.getPage(1), canvas = $("canvas", wrap), vp = page.getViewport({ scale: 1 });
        const s = 220 / vp.width, v = page.getViewport({ scale: s * 2 });
        canvas.width = v.width; canvas.height = v.height; canvas.style.width = "220px";
        await page.render({ canvasContext: canvas.getContext("2d"), viewport: v }).promise;
      }
    });
    if (result?.id === "replace") { const f = await pickFile("application/pdf,.pdf"); if (f) uploadFlow(f, link); return; }
    if (result?.id !== "open") return;
    try {
      const doc = await Store().createDoc(file, { name: file.name, pages: pdf.numPages, link });
      openDoc(doc.id);
    } catch (error) { toast(error.message || "No se pudo guardar el documento."); }
  }
  async function createBlank() {
    const L = pdfLib(), d = await L.PDFDocument.create();
    d.addPage(LETTER);
    const blob = new Blob([await d.save()], { type: "application/pdf" });
    const doc = await Store().createDoc(blob, { name: `Documento ${new Date().toLocaleDateString("es")}.pdf`, pages: 1 });
    openDoc(doc.id);
  }

  /* ---------- Mis firmas ---------- */
  const sigUrls = new Map();
  async function sigUrl(sig) {
    const key = `${sig.id}:${sig.version}`;
    if (sigUrls.has(key)) return sigUrls.get(key);
    const blob = await Store().getSignature(sig.id);
    const url = blob ? URL.createObjectURL(blob) : "";
    sigUrls.set(key, url);
    return url;
  }
  async function renderSignatures(body) {
    const sigs = await Store().listSignatures();
    body.innerHTML = `
      <div class="pe-sig-head">
        <p class="pe-muted">Tus firmas se guardan en tu cuenta (privadas) y están disponibles en cualquier documento. <strong>Una firma insertada como imagen no es una firma electrónica certificada.</strong></p>
        <div class="pe-row"><button type="button" class="pe-btn" data-sig="upload">${ic("upload")} Subir PNG o JPG</button><button type="button" class="pe-btn is-primary" data-sig="draw">${ic("sign")} Dibujar firma</button></div>
      </div>
      ${sigs.length ? `<div class="pe-sig-grid">${sigs.map(s => `
        <article class="pe-sig${s.isDefault ? " is-default" : ""}" data-sig-id="${esc(s.id)}">
          <div class="pe-sig-img"><img alt="${esc(s.name)}" data-src="${esc(s.id)}"></div>
          <div class="pe-sig-info"><strong>${esc(s.name)}</strong>${s.isDefault ? `<span class="pe-chip is-editado">Predeterminada</span>` : ""}<small>Versión ${s.version} · ${fmtDate(s.updatedAt)}</small></div>
          <div class="pe-sig-actions">
            ${s.isDefault ? "" : `<button type="button" class="pe-btn" data-sig-act="default">${ic("star")} Predeterminada</button>`}
            <button type="button" class="pe-icon" data-sig-act="rename" title="Cambiar nombre">${ic("edit")}</button>
            <button type="button" class="pe-icon" data-sig-act="replace" title="Subir nueva versión">${ic("upload")}</button>
            <button type="button" class="pe-icon" data-sig-act="clean" title="Quitar fondo blanco">${ic("eraser")}</button>
            <button type="button" class="pe-icon is-danger" data-sig-act="delete" title="Eliminar">${ic("trash")}</button>
          </div>
        </article>`).join("")}</div>`
        : `<div class="pe-empty">${ic("sign")}<strong>Aún no hay firmas guardadas</strong><span>Sube o dibuja la "Firma de Rubén" una sola vez y úsala en todos los documentos.</span></div>`}`;
    for (const s of sigs) { const img = $(`img[data-src="${CSS.escape(s.id)}"]`, body); if (img) img.src = await sigUrl(s); }
  }
  async function onSignatureClick(e) {
    const add = e.target.closest("[data-sig]");
    if (add?.dataset.sig === "upload") return uploadSignature();
    if (add?.dataset.sig === "draw") return drawSignature();
    const act = e.target.closest("[data-sig-act]");
    if (!act) return;
    const id = act.closest("[data-sig-id]").dataset.sigId;
    const sig = (await Store().listSignatures()).find(s => s.id === id);
    if (!sig) return;
    const k = act.dataset.sigAct;
    if (k === "default") await Store().updateSignature(id, { isDefault: true });
    if (k === "rename") {
      const r = await dialog({ title: "Cambiar nombre", body: `<label class="pe-field"><span>Nombre</span><input value="${esc(sig.name)}" maxlength="60"></label>`, actions: [{ id: "c", label: "Cancelar" }, { id: "ok", label: "Guardar", primary: true }] });
      const name = r?.id === "ok" ? $("input", r.root).value.trim() : "";
      if (name) await Store().updateSignature(id, { name });
    }
    if (k === "replace") { const f = await pickFile("image/png,image/jpeg"); if (f) await saveSignatureFile(f, { replaceId: id, name: sig.name }); }
    if (k === "clean") {
      const original = (await Store().getSignature(id, "original")) || (await Store().getSignature(id));
      if (original) { await Store().replaceSignature(id, await processSignature(original, true)); toast("Fondo blanco quitado (el archivo original se conserva)."); }
    }
    if (k === "delete" && await confirmDialog("Eliminar firma", `¿Eliminar "${sig.name}"? Los documentos donde ya la insertaste no cambian.`)) await Store().removeSignature(id);
    if (libTab === "firmas") renderLibraryBody();
    refreshSigTray();
  }
  async function saveSignatureFile(file, { replaceId, name } = {}) {
    if (!/^image\/(png|jpeg)$/.test(file.type)) return toast("Usa una imagen PNG o JPG.");
    if (file.size > MAX_IMG) return toast("La imagen supera 10 MB.");
    const light = await hasLightBackground(file);
    const preview = URL.createObjectURL(file);
    const r = await dialog({
      title: replaceId ? "Nueva versión de la firma" : "Guardar firma",
      body: `<div class="pe-sig-preview"><img src="${preview}" alt=""></div>
        <label class="pe-field"><span>Nombre</span><input value="${esc(name || "Firma de Rubén")}" maxlength="60" ${replaceId ? "disabled" : ""}></label>
        <label class="pe-check"><input type="checkbox" ${light ? "checked" : ""}> Quitar fondo blanco ${light ? "(se detectó fondo claro)" : ""}</label>
        <p class="pe-muted">Si el PNG ya tiene fondo transparente, se conserva tal cual.</p>`,
      actions: [{ id: "c", label: "Cancelar" }, { id: "ok", label: "Guardar firma", primary: true }]
    });
    URL.revokeObjectURL(preview);
    if (r?.id !== "ok") return;
    const clean = await processSignature(file, $("input[type=checkbox]", r.root).checked);
    if (replaceId) await Store().replaceSignature(replaceId, clean, file);
    else await Store().addSignature({ blob: clean, original: file, name: $(".pe-field input", r.root).value.trim() || "Firma de Rubén" });
    toast("Firma guardada.");
    if (libTab === "firmas" && libraryVisible()) renderLibraryBody();
    refreshSigTray();
  }
  async function uploadSignature() { const f = await pickFile("image/png,image/jpeg"); if (f) await saveSignatureFile(f); }
  async function drawSignature() {
    let color = "#1b2a4e", width = 3, strokes = [];
    const r = await dialog({
      title: "Dibujar firma", wide: true,
      body: `<canvas class="pe-pad" width="900" height="300"></canvas>
        <div class="pe-row pe-pad-tools">
          <span class="pe-muted">Color</span>${["#1b2a4e", "#0a3a8c", "#000000"].map((c, i) => `<button type="button" class="pe-swatch${i ? "" : " is-on"}" data-color="${c}" style="--c:${c}" aria-label="Color"></button>`).join("")}
          <span class="pe-muted">Grosor</span><input type="range" min="1.5" max="7" step=".5" value="3">
          <button type="button" class="pe-btn" data-clear>Borrar</button>
        </div>
        <label class="pe-field"><span>Nombre</span><input class="pe-sig-name" value="Firma de Rubén" maxlength="60"></label>`,
      actions: [{ id: "c", label: "Cancelar" }, { id: "ok", label: "Guardar firma", primary: true, validate: () => { if (!strokes.length) toast("Dibuja la firma primero."); return strokes.length > 0; } }],
      onReady: wrap => {
        const pad = $(".pe-pad", wrap), x = pad.getContext("2d");
        const redraw = () => {
          x.clearRect(0, 0, pad.width, pad.height);
          strokes.forEach(s => { x.strokeStyle = s.color; x.lineWidth = s.width; x.lineCap = "round"; x.lineJoin = "round"; x.beginPath(); s.pts.forEach(([px, py], i) => i ? x.lineTo(px, py) : x.moveTo(px, py)); x.stroke(); });
        };
        let cur = null;
        const pos = e => { const b = pad.getBoundingClientRect(); return [(e.clientX - b.left) * pad.width / b.width, (e.clientY - b.top) * pad.height / b.height]; };
        pad.addEventListener("pointerdown", e => { pad.setPointerCapture(e.pointerId); cur = { color, width: width * 2, pts: [pos(e)] }; strokes.push(cur); });
        pad.addEventListener("pointermove", e => { if (!cur) return; cur.pts.push(pos(e)); redraw(); });
        pad.addEventListener("pointerup", () => { cur = null; });
        wrap.addEventListener("click", e => {
          const sw = e.target.closest("[data-color]");
          if (sw) { color = sw.dataset.color; $$(".pe-swatch", wrap).forEach(b => b.classList.toggle("is-on", b === sw)); }
          if (e.target.closest("[data-clear]")) { strokes = []; redraw(); }
        });
        $("input[type=range]", wrap).oninput = e => { width = Number(e.target.value); };
      }
    });
    if (r?.id !== "ok") return;
    const raw = await canvasBlob($(".pe-pad", r.root));
    await Store().addSignature({ blob: await processSignature(raw, false), original: raw, name: $(".pe-sig-name", r.root).value.trim() || "Firma de Rubén" });
    toast("Firma guardada.");
    if (libTab === "firmas" && libraryVisible()) renderLibraryBody();
    refreshSigTray();
  }

  /* ---------- Plantillas ---------- */
  const BUILTIN = [
    { id: "b-paid", name: "Sello PAGADO", el: { type: "stamp", text: "PAGADO", color: "#1f9d61", w: 150, h: 52, rot: -8 } },
    { id: "b-ok", name: "Sello APROBADO", el: { type: "stamp", text: "APROBADO", color: "#007aff", w: 170, h: 52, rot: -8 } },
    { id: "b-rec", name: "Sello RECIBIDO", el: { type: "stamp", text: "RECIBIDO", color: "#e2802e", w: 165, h: 52, rot: -8 } },
    { id: "b-date", name: "Fecha de hoy", el: { type: "date", w: 120, h: 22, size: 12 } }
  ];
  async function renderTemplates(body) {
    const saved = await Store().listTemplates();
    const card = (t, removable) => `<article class="pe-tpl" data-tpl="${esc(t.id)}"><div class="pe-tpl-prev">${templatePreview(t.el)}</div><strong>${esc(t.name)}</strong>${removable ? `<button type="button" class="pe-icon is-danger" data-tpl-act="delete" title="Eliminar">${ic("trash")}</button>` : `<small class="pe-muted">Incluida</small>`}</article>`;
    body.innerHTML = `<p class="pe-muted">Sellos, textos frecuentes, logotipos y bloques listos para insertar. Para guardar uno nuevo: en el editor, selecciona un elemento y toca "Guardar como plantilla".</p>
      <div class="pe-tpl-grid">${BUILTIN.map(t => card(t, false)).join("")}${saved.map(t => card(t, true)).join("")}</div>`;
  }
  function templatePreview(el) {
    if (el.type === "stamp") return `<span class="pe-stamp-prev" style="--c:${el.color}">${esc(el.text)}</span>`;
    if (el.type === "date") return `<span>${todayText()}</span>`;
    if (el.type === "text") return `<span>${esc((el.text || "").slice(0, 40))}</span>`;
    if (el.type === "image" || el.type === "signature") return ic("image");
    return ic("rect");
  }
  async function onTemplateClick(e) {
    const act = e.target.closest("[data-tpl-act]");
    if (act?.dataset.tplAct !== "delete") return;
    const id = act.closest("[data-tpl]").dataset.tpl;
    if (!(await confirmDialog("Eliminar plantilla", "¿Eliminar esta plantilla?"))) return;
    await Store().removeTemplate(id);
    renderLibraryBody();
  }
  const todayText = () => { const d = new Date(); return `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}/${d.getFullYear()}`; };

  /* =====================================================================
     EDITOR
     ===================================================================== */
  const ed = { doc: null, pdf: null, original: null, base: [], pages: [], els: [], sel: null, tool: "select", zoom: 1, past: [], future: [], snap: "", thumbSel: new Set(), current: 0, sigId: null, pendingImage: null };
  const imgCache = new Map(); // key -> Promise<{img,url}>
  const imageFor = key => {
    if (!imgCache.has(key)) imgCache.set(key, Store().getImage(key).then(b => b ? loadImage(b) : null));
    return imgCache.get(key);
  };
  const TOOLS = [
    ["select", "cursor", "Seleccionar"], ["text", "text", "Texto"], ["signature", "sign", "Firma"], ["image", "image", "Imagen"], ["date", "calendar", "Fecha"],
    ["check", "check", "Casilla"], ["stamp", "stamp", "Sello"], ["highlight", "highlight", "Resaltar"], ["underline", "underline", "Subrayar"], ["strike", "strike", "Tachar"],
    ["pen", "pen", "Lápiz"], ["line", "line", "Línea"], ["arrow", "arrow", "Flecha"], ["rect", "rect", "Rectángulo"], ["ellipse", "ellipse", "Elipse"], ["comment", "comment", "Comentario"]
  ];
  const DRAG_TOOLS = new Set(["highlight", "underline", "strike", "line", "arrow", "rect", "ellipse"]);
  const ROTATABLE = new Set(["text", "date", "image", "signature", "stamp", "rect", "ellipse", "comment"]);
  const RATIO = new Set(["image", "signature"]);
  const TEXTUAL = new Set(["text", "date", "comment", "stamp"]);

  // Page geometry: base[i] = { W, H, rot } of the original page (unrotated crop box and own rotation).
  const totalRot = p => ((p.src === "orig" ? ed.base[p.index].rot : 0) + p.rot) % 360;
  function pageSize(p) {
    const W = p.src === "orig" ? ed.base[p.index].W : p.w, H = p.src === "orig" ? ed.base[p.index].H : p.h;
    return totalRot(p) % 180 ? { w: H, h: W } : { w: W, h: H };
  }

  async function openDoc(id) {
    mount();
    const doc = await Store().getDoc(id);
    if (!doc) return toast("No se encontró el documento.");
    const original = await Store().getOriginal(id);
    if (!original) return toast("No se pudo abrir el original. Revisa la conexión.");
    let pdf;
    try { pdf = await loadPdfJs(original); } catch (_) { return toast("No se pudo leer el PDF."); }
    const base = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i), vp = page.getViewport({ scale: 1, rotation: 0 });
      base.push({ W: vp.width, H: vp.height, rot: page.rotate || 0 });
    }
    const state = await Store().getState(id);
    Object.assign(ed, { doc, pdf, original, base, sel: null, tool: "select", past: [], future: [], thumbSel: new Set(), current: 0, pendingImage: null });
    ed.pages = state?.pages?.length ? state.pages : base.map((_, i) => ({ pid: uid(), src: "orig", index: i, rot: 0 }));
    ed.els = state?.els || [];
    ed.snap = snapshot();
    $(".pe-library", root).hidden = true;
    const editor = $(".pe-editor", root);
    editor.hidden = false;
    buildEditor(editor);
    window.TrentonControl?.showView?.("editor");
    fitZoom();
    renderAll();
    const sigs = await Store().listSignatures();
    ed.sigId = sigs.find(s => s.isDefault)?.id || sigs[0]?.id || null;
  }

  function buildEditor(editor) {
    editor.innerHTML = `
      <header class="pe-top">
        <button type="button" class="pe-icon" data-ed="back" title="Volver a documentos">${ic("back")}</button>
        <div class="pe-title"><input class="pe-name" value="${esc(ed.doc.name)}" aria-label="Nombre del documento"><span class="pe-save" data-state="saved">Guardado</span>${ed.doc.link ? `<span class="pe-link-chip">${ic("link")}${esc(ed.doc.link.label)}</span>` : ""}</div>
        <div class="pe-top-actions">
          <button type="button" class="pe-icon" data-ed="undo" title="Deshacer (Ctrl+Z)">${ic("undo")}</button>
          <button type="button" class="pe-icon" data-ed="redo" title="Rehacer (Ctrl+Y)">${ic("redo")}</button>
          <span class="pe-sep"></span>
          <button type="button" class="pe-icon" data-ed="zoomOut" title="Alejar">${ic("zoomOut")}</button>
          <span class="pe-zoom">100%</span>
          <button type="button" class="pe-icon" data-ed="zoomIn" title="Acercar">${ic("zoomIn")}</button>
          <button type="button" class="pe-icon" data-ed="fit" title="Ajustar al ancho">${ic("fit")}</button>
          <span class="pe-sep"></span>
          <button type="button" class="pe-btn" data-ed="save">${ic("save")} Guardar versión</button>
          <button type="button" class="pe-btn is-primary" data-ed="download">${ic("download")} Descargar PDF</button>
          <button type="button" class="pe-icon" data-ed="more" title="Más opciones">${ic("more")}</button>
        </div>
      </header>
      <nav class="pe-tools" aria-label="Herramientas">${TOOLS.map(([id, icon, label]) => `<button type="button" class="pe-tool${id === "select" ? " is-on" : ""}" data-tool="${id}" title="${label}">${ic(icon)}<span>${label}</span></button>`).join("")}</nav>
      <div class="pe-sig-tray" hidden></div>
      <div class="pe-main">
        <aside class="pe-thumbs">
          <div class="pe-thumbs-head"><strong>Páginas</strong><button type="button" class="pe-icon" data-page="add" title="Agregar página en blanco">${ic("plus")}</button></div>
          <div class="pe-thumb-list"></div>
          <div class="pe-page-tools">
            <button type="button" class="pe-icon" data-page="up" title="Mover arriba">${ic("up")}</button>
            <button type="button" class="pe-icon" data-page="down" title="Mover abajo">${ic("down")}</button>
            <button type="button" class="pe-icon" data-page="rotate" title="Rotar">${ic("rotate")}</button>
            <button type="button" class="pe-icon" data-page="duplicate" title="Duplicar página">${ic("copy")}</button>
            <button type="button" class="pe-icon is-danger" data-page="delete" title="Eliminar página">${ic("trash")}</button>
          </div>
        </aside>
        <section class="pe-canvas" tabindex="0"><div class="pe-pages"></div></section>
        <aside class="pe-props"></aside>
      </div>
      <div class="pe-mobile-bar">
        <button type="button" class="pe-btn" data-ed="togglePages">${ic("pages")} Páginas</button>
        <button type="button" class="pe-btn" data-ed="toggleProps">${ic("sliders")} Propiedades</button>
      </div>`;
    editor.onclick = onEditorClick;
    $(".pe-name", editor).onchange = async e => { const name = e.target.value.trim() || ed.doc.name; ed.doc = await Store().updateDoc(ed.doc.id, { name }) || ed.doc; };
    const canvas = $(".pe-canvas", editor);
    canvas.addEventListener("pointerdown", onCanvasDown);
    canvas.addEventListener("scroll", () => updateCurrentFromScroll(), { passive: true });
    if (!unsubscribe) unsubscribe = Store().onStatus(setSaveState);
  }
  let unsubscribe = null;
  function setSaveState(state) {
    const el = $(".pe-save", root);
    if (!el) return;
    el.dataset.state = state;
    el.textContent = state === "saving" ? "Guardando…" : state === "local" ? "Guardado en este equipo" : "Guardado";
    el.title = state === "local" ? "Sin conexión con la nube: se subirá cuando vuelva." : "";
  }

  /* ---------- history + autosave ---------- */
  const snapshot = () => JSON.stringify({ pages: ed.pages, els: ed.els });
  function commit() {
    const now = snapshot();
    if (now === ed.snap) return;
    ed.past.push(ed.snap);
    if (ed.past.length > 80) ed.past.shift();
    ed.future = [];
    ed.snap = now;
    persist();
    updateHistoryButtons();
  }
  function restore(text) {
    const s = JSON.parse(text);
    ed.pages = s.pages; ed.els = s.els; ed.snap = text;
    if (!ed.els.some(e => e.id === ed.sel)) ed.sel = null;
    renderAll();
    persist();
    updateHistoryButtons();
  }
  function undo() { if (!ed.past.length) return; ed.future.push(ed.snap); restore(ed.past.pop()); }
  function redo() { if (!ed.future.length) return; ed.past.push(ed.snap); restore(ed.future.pop()); }
  function updateHistoryButtons() {
    const u = $('[data-ed="undo"]', root), r = $('[data-ed="redo"]', root);
    if (u) u.disabled = !ed.past.length;
    if (r) r.disabled = !ed.future.length;
  }
  function persist() { Store().saveState(ed.doc.id, { v: 1, pages: ed.pages, els: ed.els }); }

  /* ---------- rendering ---------- */
  let scale = 1, renderRun = 0;
  function fitZoom() {
    const canvas = $(".pe-canvas", root);
    const maxW = Math.max(...ed.pages.map(p => pageSize(p).w), 300);
    // Room for the padding and the page number shown beside each page.
    const room = canvas.clientWidth - parseFloat(getComputedStyle(canvas).paddingLeft) * 2 - (window.innerWidth > 760 ? 44 : 4);
    ed.zoom = clamp(room / maxW, .3, 2.5);
  }
  function renderAll() { renderPages(); renderThumbs(); renderProps(); updateHistoryButtons(); }
  async function renderPages() {
    scale = ed.zoom;
    $(".pe-zoom", root).textContent = `${Math.round(ed.zoom * 100)}%`;
    const host = $(".pe-pages", root), run = ++renderRun;
    host.innerHTML = ed.pages.map((p, i) => {
      const { w, h } = pageSize(p);
      return `<div class="pe-page${i === ed.current ? " is-current" : ""}" data-pid="${p.pid}" style="width:${w * scale}px;height:${h * scale}px"><canvas></canvas><div class="pe-layer"></div><span class="pe-page-no">${i + 1}</span></div>`;
    }).join("");
    ed.pages.forEach(p => renderLayer(p.pid));
    // Draw page images (visible ones first is not needed for typical documents).
    for (const p of ed.pages) {
      if (run !== renderRun) return;
      const node = $(`.pe-page[data-pid="${p.pid}"] canvas`, host);
      if (node) await drawPage(p, node, scale);
    }
  }
  async function drawPage(p, canvas, s) {
    const { w, h } = pageSize(p), dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(w * s * dpr); canvas.height = Math.round(h * s * dpr);
    canvas.style.width = `${w * s}px`; canvas.style.height = `${h * s}px`;
    const x = canvas.getContext("2d");
    x.fillStyle = "#fff"; x.fillRect(0, 0, canvas.width, canvas.height);
    if (p.src !== "orig") return;
    const page = await ed.pdf.getPage(p.index + 1);
    const vp = page.getViewport({ scale: s * dpr, rotation: totalRot(p) });
    await page.render({ canvasContext: x, viewport: vp }).promise;
  }
  const pageOf = pid => ed.pages.find(p => p.pid === pid);
  function renderLayer(pid) {
    const layer = $(`.pe-page[data-pid="${pid}"] .pe-layer`, root);
    if (!layer) return;
    layer.innerHTML = ed.els.filter(e => e.page === pid).map(elHtml).join("");
    ed.els.filter(e => e.page === pid && (e.type === "image" || e.type === "signature")).forEach(async e => {
      const res = await imageFor(e.src);
      const img = $(`[data-id="${e.id}"] img`, layer);
      if (img && res) img.src = res.url;
    });
  }
  function elHtml(e) {
    const s = scale, sel = e.id === ed.sel;
    const style = `left:${e.x * s}px;top:${e.y * s}px;width:${e.w * s}px;height:${e.h * s}px;opacity:${e.opacity ?? 1};transform:rotate(${e.rot || 0}deg)`;
    let inner = "";
    const font = `font-family:${FONTS[e.font || "helv"]};font-size:${(e.size || 12) * s}px;font-weight:${e.bold ? 700 : 400};font-style:${e.italic ? "italic" : "normal"};text-align:${e.align || "left"};color:${e.color || "#111"}`;
    if (e.type === "text" || e.type === "date") inner = `<div class="pe-text" style="${font}" ${sel && ed.editing === e.id ? 'contenteditable="true"' : ""}>${esc(e.text || "")}</div>`;
    else if (e.type === "comment") inner = `<div class="pe-note" style="font-size:${(e.size || 10) * s}px"><b>${ic("comment")}</b><div class="pe-text" ${sel && ed.editing === e.id ? 'contenteditable="true"' : ""}>${esc(e.text || "")}</div></div>`;
    else if (e.type === "stamp") inner = `<div class="pe-stamp" style="--c:${e.color};font-size:${Math.min(e.h * .52, e.w / Math.max(4, (e.text || "").length) * 1.5) * s}px;border-width:${2.5 * s}px">${esc(e.text)}</div>`;
    else if (e.type === "image" || e.type === "signature") inner = `<img alt="" draggable="false">`;
    else if (e.type === "check") inner = `<svg viewBox="0 0 10 10" preserveAspectRatio="none"><rect x=".5" y=".5" width="9" height="9" rx="1" fill="#fff" stroke="${e.color || "#111"}" stroke-width=".8"/>${e.checked ? `<path d="M2.3 5.3l1.8 1.8 3.6-4.2" fill="none" stroke="${e.color || "#111"}" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>` : ""}</svg>`;
    else inner = shapeSvg(e);
    const handles = sel ? `<i class="pe-h" data-h="nw"></i><i class="pe-h" data-h="ne"></i><i class="pe-h" data-h="sw"></i><i class="pe-h" data-h="se"></i>${ROTATABLE.has(e.type) ? '<i class="pe-h pe-rot" data-h="rot"></i>' : ""}` : "";
    return `<div class="pe-el is-${e.type}${sel ? " is-sel" : ""}" data-id="${e.id}" style="${style}">${inner}${handles}</div>`;
  }
  function shapeSvg(e) {
    const w = Math.max(e.w, .1), h = Math.max(e.h, .1), sw = e.stroke || 2, c = e.color || "#111";
    const attrs = `fill="none" stroke="${c}" stroke-width="${sw}" vector-effect="non-scaling-stroke" stroke-linecap="round" stroke-linejoin="round"`;
    let body = "";
    if (e.type === "rect") body = `<rect x="${sw / 2}" y="${sw / 2}" width="${Math.max(0, w - sw)}" height="${Math.max(0, h - sw)}" ${attrs} ${e.fill ? `fill="${c}" fill-opacity=".18"` : ""}/>`;
    else if (e.type === "ellipse") body = `<ellipse cx="${w / 2}" cy="${h / 2}" rx="${Math.max(0, w / 2 - sw / 2)}" ry="${Math.max(0, h / 2 - sw / 2)}" ${attrs} ${e.fill ? `fill="${c}" fill-opacity=".18"` : ""}/>`;
    else if (e.type === "highlight") body = `<rect width="${w}" height="${h}" fill="${c}" fill-opacity=".38"/>`;
    else if (e.type === "underline") body = `<line x1="0" y1="${h - sw / 2}" x2="${w}" y2="${h - sw / 2}" ${attrs}/>`;
    else if (e.type === "strike") body = `<line x1="0" y1="${h / 2}" x2="${w}" y2="${h / 2}" ${attrs}/>`;
    else if (e.type === "line" || e.type === "arrow" || e.type === "pen") {
      const pts = (e.pts || []).map(([px, py]) => `${(px * w).toFixed(2)},${(py * h).toFixed(2)}`).join(" ");
      body = `<polyline points="${pts}" ${attrs}/>`;
      if (e.type === "arrow" && e.pts?.length >= 2) body += arrowHead(e, w, h, attrs);
    }
    return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" overflow="visible">${body}</svg>`;
  }
  function arrowHead(e, w, h, attrs) {
    const [a, b] = [e.pts[e.pts.length - 2], e.pts[e.pts.length - 1]];
    const x2 = b[0] * w, y2 = b[1] * h, ang = Math.atan2(y2 - a[1] * h, x2 - a[0] * w), L = 6 + (e.stroke || 2) * 2.5;
    const p1 = [x2 - L * Math.cos(ang - .45), y2 - L * Math.sin(ang - .45)], p2 = [x2 - L * Math.cos(ang + .45), y2 - L * Math.sin(ang + .45)];
    return `<polyline points="${p1.join(",")} ${x2},${y2} ${p2.join(",")}" ${attrs}/>`;
  }

  function renderThumbs() {
    const list = $(".pe-thumb-list", root);
    list.innerHTML = ed.pages.map((p, i) => `<div class="pe-thumb${i === ed.current ? " is-current" : ""}" data-thumb="${i}" draggable="true">
      <canvas></canvas><label class="pe-thumb-check" title="Seleccionar para descargar"><input type="checkbox" data-pick="${p.pid}" ${ed.thumbSel.has(p.pid) ? "checked" : ""}></label><span>${i + 1}</span></div>`).join("");
    ed.pages.forEach(async (p, i) => {
      const c = $(`[data-thumb="${i}"] canvas`, list);
      if (c) await drawPage(p, c, 110 / pageSize(p).w);
    });
    let from = null;
    list.ondragstart = e => { from = Number(e.target.closest("[data-thumb]")?.dataset.thumb); };
    list.ondragover = e => e.preventDefault();
    list.ondrop = e => {
      e.preventDefault();
      const to = Number(e.target.closest("[data-thumb]")?.dataset.thumb);
      if (from == null || Number.isNaN(to) || from === to) return;
      const [moved] = ed.pages.splice(from, 1);
      ed.pages.splice(to, 0, moved);
      ed.current = to;
      commit(); renderAll();
    };
    list.onchange = e => { const pid = e.target.dataset.pick; if (pid) e.target.checked ? ed.thumbSel.add(pid) : ed.thumbSel.delete(pid); };
  }
  function updateCurrentFromScroll() {
    const canvas = $(".pe-canvas", root), mid = canvas.getBoundingClientRect().top + canvas.clientHeight / 3;
    const pages = $$(".pe-page", canvas);
    const i = pages.findIndex(p => p.getBoundingClientRect().bottom > mid);
    if (i >= 0 && i !== ed.current) {
      ed.current = i;
      pages.forEach((p, k) => p.classList.toggle("is-current", k === i));
      $$(".pe-thumb", root).forEach((t, k) => t.classList.toggle("is-current", k === i));
    }
  }
  function scrollToPage(i) {
    ed.current = i;
    $$(".pe-page", root)[i]?.scrollIntoView({ behavior: "smooth", block: "start" });
    $$(".pe-thumb", root).forEach((t, k) => t.classList.toggle("is-current", k === i));
  }

  /* ---------- properties panel ---------- */
  const selected = () => ed.els.find(e => e.id === ed.sel) || null;
  function renderProps() {
    const panel = $(".pe-props", root);
    const e = selected();
    if (!e) {
      const p = ed.pages[ed.current];
      panel.innerHTML = `<div class="pe-props-in">
        <h4>Documento</h4>
        <p class="pe-muted">Página ${ed.current + 1} de ${ed.pages.length}${p ? ` · ${Math.round(pageSize(p).w)} × ${Math.round(pageSize(p).h)} pt` : ""}</p>
        <p class="pe-muted">Elige una herramienta y toca la página. Toca un elemento para moverlo o cambiar sus propiedades.</p>
        <button type="button" class="pe-btn" data-prop-act="pagenums">${ic("hash")} Agregar números de página</button>
        <h4>Plantillas</h4><div class="pe-tpl-list"></div>
        <p class="pe-note-legal">Una firma insertada como imagen no es una firma electrónica certificada ni valida identidad.</p>
      </div>`;
      fillTemplateList();
      panel.classList.remove("is-open");
      return;
    }
    const num = (k, label, step = 1, min) => `<label class="pe-field is-sm"><span>${label}</span><input type="number" data-prop="${k}" value="${Math.round((e[k] ?? 0) * 10) / 10}" step="${step}" ${min != null ? `min="${min}"` : ""}></label>`;
    const textual = e.type === "text" || e.type === "date" || e.type === "comment";
    panel.innerHTML = `<div class="pe-props-in">
      <h4>${TOOLS.find(t => t[0] === e.type)?.[2] || "Elemento"}</h4>
      <div class="pe-grid2">${num("x", "X")}${num("y", "Y")}${num("w", "Ancho", 1, 4)}${num("h", "Alto", 1, 2)}</div>
      ${ROTATABLE.has(e.type) ? `<label class="pe-field is-sm"><span>Rotación (°)</span><input type="range" min="-180" max="180" step="1" data-prop="rot" value="${e.rot || 0}"></label>` : ""}
      <label class="pe-field is-sm"><span>Opacidad</span><input type="range" min="0.1" max="1" step="0.05" data-prop="opacity" value="${e.opacity ?? 1}"></label>
      ${e.type !== "image" && e.type !== "signature" ? `<label class="pe-field is-sm"><span>Color</span><input type="color" data-prop="color" value="${e.color || "#111111"}"></label>` : ""}
      ${["rect", "ellipse", "line", "arrow", "pen", "underline", "strike"].includes(e.type) ? `<label class="pe-field is-sm"><span>Grosor</span><input type="range" min="0.5" max="12" step="0.5" data-prop="stroke" value="${e.stroke || 2}"></label>` : ""}
      ${e.type === "rect" || e.type === "ellipse" ? `<label class="pe-check"><input type="checkbox" data-prop="fill" ${e.fill ? "checked" : ""}> Relleno suave</label>` : ""}
      ${textual || e.type === "stamp" ? `<label class="pe-field is-sm"><span>Texto</span><textarea data-prop="text" rows="3">${esc(e.text || "")}</textarea></label>` : ""}
      ${textual ? `<div class="pe-grid2">
          <label class="pe-field is-sm"><span>Tipografía</span><select data-prop="font">${Object.entries({ helv: "Helvetica", times: "Times", courier: "Courier" }).map(([k, v]) => `<option value="${k}" ${e.font === k ? "selected" : ""}>${v}</option>`).join("")}</select></label>
          ${num("size", "Tamaño", 1, 4)}</div>
        <div class="pe-row pe-seg">
          <button type="button" class="pe-icon${e.bold ? " is-on" : ""}" data-toggle="bold" title="Negrita"><b>B</b></button>
          <button type="button" class="pe-icon${e.italic ? " is-on" : ""}" data-toggle="italic" title="Cursiva"><i>I</i></button>
          ${["left", "center", "right"].map(a => `<button type="button" class="pe-icon${(e.align || "left") === a ? " is-on" : ""}" data-align="${a}" title="Alinear">${a === "left" ? "⟸" : a === "center" ? "≡" : "⟹"}</button>`).join("")}
        </div>` : ""}
      ${e.type === "check" ? `<label class="pe-check"><input type="checkbox" data-prop="checked" ${e.checked ? "checked" : ""}> Marcada</label>` : ""}
      ${RATIO.has(e.type) ? `<label class="pe-check"><input type="checkbox" data-prop="lock" ${e.lock !== false ? "checked" : ""}> Mantener proporciones</label>` : ""}
      ${e.type === "signature" ? `<label class="pe-field is-sm"><span>Cambiar por otra firma</span><select data-swap-sig><option value="">Elegir…</option></select></label>` : ""}
      <div class="pe-row pe-wrap">
        <button type="button" class="pe-btn" data-prop-act="duplicate">${ic("copy")} Duplicar</button>
        <button type="button" class="pe-btn" data-prop-act="front">Al frente</button>
        <button type="button" class="pe-btn" data-prop-act="template">Guardar como plantilla</button>
        <button type="button" class="pe-btn is-danger" data-prop-act="delete">${ic("trash")} Eliminar</button>
      </div>
      ${e.type === "signature" ? `<p class="pe-note-legal">Imagen de firma: no equivale a una firma electrónica certificada.</p>` : ""}
    </div>`;
    panel.classList.add("is-open");
    panel.oninput = onPropInput;
    panel.onchange = onPropChange;
    if (e.type === "signature") fillSigSwap(e);
  }
  async function fillTemplateList() {
    const box = $(".pe-tpl-list", root);
    if (!box) return;
    const saved = await Store().listTemplates().catch(() => []);
    box.innerHTML = [...BUILTIN, ...saved].map(t => `<button type="button" class="pe-tpl-btn" data-insert-tpl="${esc(t.id)}">${templatePreview(t.el)}<span>${esc(t.name)}</span></button>`).join("");
  }
  async function fillSigSwap(e) {
    const sel = $("[data-swap-sig]", root);
    if (!sel) return;
    const sigs = await Store().listSignatures();
    sel.innerHTML = `<option value="">Elegir…</option>${sigs.map(s => `<option value="${s.id}" ${s.id === e.sigId ? "selected" : ""}>${esc(s.name)}</option>`).join("")}`;
  }
  let propTimer = 0;
  function onPropInput(ev) {
    const e = selected(), k = ev.target.dataset.prop;
    if (!e || !k) return;
    let v = ev.target.type === "checkbox" ? ev.target.checked : ev.target.value;
    if (["x", "y", "w", "h", "size", "rot", "opacity", "stroke"].includes(k)) v = Number(v);
    if (k === "w" && RATIO.has(e.type) && e.lock !== false && e.w) e.h = e.h * v / e.w;
    if (k === "h" && RATIO.has(e.type) && e.lock !== false && e.h) e.w = e.w * v / e.h;
    e[k] = v;
    renderLayer(e.page);
    clearTimeout(propTimer);
    propTimer = setTimeout(commit, 400);
  }
  async function onPropChange(ev) {
    if (ev.target.matches("[data-swap-sig]") && ev.target.value) {
      const e = selected();
      await placeSignatureInto(e, ev.target.value);
    } else if (ev.target.type === "checkbox" || ev.target.tagName === "SELECT") { onPropInput(ev); commit(); renderProps(); }
  }

  /* ---------- elements: create, select, move, resize, rotate ---------- */
  function addElement(el, { select = true } = {}) {
    const e = { id: uid(), opacity: 1, rot: 0, ...el };
    ed.els.push(e);
    if (select) ed.sel = e.id;
    renderLayer(e.page);
    commit();
    renderProps();
    pulse(e.id);
    return e;
  }
  function pulse(id) {
    const node = $(`.pe-el[data-id="${id}"]`, root);
    node?.animate([{ transform: `${node.style.transform} scale(.85)`, opacity: 0 }, { transform: node.style.transform, opacity: Number(node.style.opacity) || 1 }], { duration: 320, easing: "cubic-bezier(.34,1.4,.64,1)" });
  }
  function select(id) {
    const prev = ed.sel;
    ed.sel = id;
    ed.editing = null;
    const prevEl = ed.els.find(e => e.id === prev), cur = selected();
    if (prevEl) renderLayer(prevEl.page);
    if (cur && cur.page !== prevEl?.page) renderLayer(cur.page);
    renderProps();
  }
  function setTool(tool) {
    ed.tool = tool;
    $$(".pe-tool", root).forEach(b => b.classList.toggle("is-on", b.dataset.tool === tool));
    $(".pe-canvas", root).dataset.tool = tool;
    const tray = $(".pe-sig-tray", root);
    tray.hidden = tool !== "signature";
    if (tool === "signature") refreshSigTray();
    if (tool === "image") pickImageForPlacement();
  }
  async function refreshSigTray() {
    const tray = $(".pe-sig-tray", root);
    if (!tray || tray.hidden) return;
    const sigs = await Store().listSignatures();
    if (!sigs.length) { tray.innerHTML = `<span class="pe-muted">No hay firmas guardadas.</span><button type="button" class="pe-btn" data-sig="upload">${ic("upload")} Subir</button><button type="button" class="pe-btn is-primary" data-sig="draw">${ic("sign")} Dibujar</button>`; return; }
    if (!sigs.some(s => s.id === ed.sigId)) ed.sigId = sigs.find(s => s.isDefault)?.id || sigs[0].id;
    tray.innerHTML = `<span class="pe-muted">Toca la página donde va la firma:</span>${sigs.map(s => `<button type="button" class="pe-sig-pick${s.id === ed.sigId ? " is-on" : ""}" data-pick-sig="${s.id}" title="${esc(s.name)}"><img alt="${esc(s.name)}" data-src="${s.id}"><span>${esc(s.name)}${s.isDefault ? " ★" : ""}</span></button>`).join("")}
      <button type="button" class="pe-btn" data-ed="quickSign">${ic("sign")} Insertar en esta página</button>`;
    for (const s of sigs) { const img = $(`img[data-src="${CSS.escape(s.id)}"]`, tray); if (img) img.src = await sigUrl(s); }
  }
  async function pickImageForPlacement() {
    const f = await pickFile("image/png,image/jpeg");
    if (!f) return setTool("select");
    if (!/^image\/(png|jpeg)$/.test(f.type) || f.size > MAX_IMG) { toast("Usa una imagen PNG o JPG de hasta 10 MB."); return setTool("select"); }
    const { w, h } = await loadImage(f);
    ed.pendingImage = { key: await Store().putImage(f), w, h };
    toast("Toca la página donde va la imagen.");
  }
  // Signature placed as an image copied into the document, so the PDF never depends on the library.
  async function signatureElement(sigId, page, cx, cy) {
    const blob = await Store().getSignature(sigId);
    if (!blob) { toast("No se pudo cargar la firma."); return null; }
    const { w, h } = await loadImage(blob);
    const key = await Store().putImage(blob);
    const ww = 150, hh = ww * h / w;
    return { type: "signature", page, src: key, sigId, x: cx - ww / 2, y: cy - hh / 2, w: ww, h: hh, lock: true };
  }
  async function placeSignatureInto(e, sigId) {
    const fresh = await signatureElement(sigId, e.page, e.x + e.w / 2, e.y + e.h / 2);
    if (!fresh) return;
    Object.assign(e, { src: fresh.src, sigId, h: e.w * fresh.h / fresh.w });
    renderLayer(e.page); commit(); renderProps();
  }

  function pointIn(pageNode, ev) {
    const r = pageNode.getBoundingClientRect();
    return [(ev.clientX - r.left) / scale, (ev.clientY - r.top) / scale];
  }
  async function onCanvasDown(ev) {
    const pageNode = ev.target.closest(".pe-page");
    if (!pageNode) { if (ed.tool === "select") select(null); return; }
    const pid = pageNode.dataset.pid, [px, py] = pointIn(pageNode, ev);
    ed.current = ed.pages.findIndex(p => p.pid === pid);
    const elNode = ev.target.closest(".pe-el");
    if (ed.tool === "select" || (elNode && !DRAG_TOOLS.has(ed.tool) && ed.tool !== "pen")) {
      if (!elNode) { select(null); return; }
      const e = ed.els.find(x => x.id === elNode.dataset.id);
      if (!e) return;
      if (ed.sel !== e.id) select(e.id);
      const handle = ev.target.closest(".pe-h")?.dataset.h;
      if (ed.editing === e.id && !handle) return; // typing inside the text
      return startDrag(ev, e, handle, pageNode);
    }
    ev.preventDefault();
    const t = ed.tool;
    if (t === "text") return addElement({ type: "text", page: pid, x: px, y: py - 8, w: 180, h: 22, text: "Escribe aquí", size: 12, color: "#111111", font: "helv" }) && beginEditing(ed.sel);
    if (t === "date") return addElement({ type: "date", page: pid, x: px, y: py - 8, w: 110, h: 22, text: todayText(), size: 12, color: "#111111", font: "helv" });
    if (t === "comment") return addElement({ type: "comment", page: pid, x: px, y: py, w: 170, h: 70, text: "Comentario", size: 10, color: "#7a5b00" }) && beginEditing(ed.sel);
    if (t === "check") return addElement({ type: "check", page: pid, x: px - 8, y: py - 8, w: 16, h: 16, checked: true, color: "#111111" });
    if (t === "stamp") return addElement({ type: "stamp", page: pid, x: px - 75, y: py - 26, w: 150, h: 52, text: "PAGADO", color: "#1f9d61", rot: -8 });
    if (t === "signature") {
      if (!ed.sigId) { toast("Primero guarda una firma en Mis firmas."); return; }
      const el = await signatureElement(ed.sigId, pid, px, py);
      if (el) { addElement(el); setTool("select"); }
      return;
    }
    if (t === "image") {
      if (!ed.pendingImage) return;
      const { key, w, h } = ed.pendingImage, ww = Math.min(200, w), hh = ww * h / w;
      ed.pendingImage = null;
      addElement({ type: "image", page: pid, src: key, x: px - ww / 2, y: py - hh / 2, w: ww, h: hh, lock: true });
      return setTool("select");
    }
    if (t === "pen") return startPen(ev, pid, pageNode);
    if (DRAG_TOOLS.has(t)) return startShape(ev, t, pid, pageNode, px, py);
  }
  function beginEditing(id) {
    ed.editing = id;
    const e = ed.els.find(x => x.id === id);
    renderLayer(e.page);
    const box = $(`.pe-el[data-id="${id}"] .pe-text`, root);
    if (!box) return true;
    box.focus();
    document.getSelection()?.selectAllChildren(box);
    box.addEventListener("input", () => {
      e.text = box.innerText;
      const needed = box.scrollHeight / scale;
      if (needed > e.h) { e.h = needed; box.parentElement.style.height = `${e.h * scale}px`; }
    });
    box.addEventListener("blur", () => { ed.editing = null; commit(); renderLayer(e.page); renderProps(); }, { once: true });
    return true;
  }
  function startDrag(ev, e, handle, pageNode) {
    ev.preventDefault();
    const node = $(`.pe-el[data-id="${e.id}"]`, root);
    const start = { ...e, pts: e.pts && e.pts.map(p => [...p]) }, [sx, sy] = pointIn(pageNode, ev);
    const page = pageSize(pageOf(e.page));
    node.setPointerCapture?.(ev.pointerId);
    node.classList.add("is-dragging");
    let moved = false;
    const move = mv => {
      const [cx, cy] = pointIn(pageNode, mv);
      let dx = cx - sx, dy = cy - sy;
      if (Math.abs(dx) + Math.abs(dy) > .5) moved = true;
      if (!handle) {
        e.x = clamp(start.x + dx, -e.w / 2, page.w - e.w / 2);
        e.y = clamp(start.y + dy, -e.h / 2, page.h - e.h / 2);
      } else if (handle === "rot") {
        const ccx = start.x + start.w / 2, ccy = start.y + start.h / 2;
        let ang = Math.atan2(cy - ccy, cx - ccx) * 180 / Math.PI + 90;
        if (mv.shiftKey) ang = Math.round(ang / 15) * 15;
        e.rot = Math.round(((ang + 540) % 360) - 180);
      } else {
        // Resize in the element's own (rotated) frame.
        const r = -(start.rot || 0) * Math.PI / 180;
        const lx = dx * Math.cos(r) - dy * Math.sin(r), ly = dx * Math.sin(r) + dy * Math.cos(r);
        let w = start.w + (handle.includes("e") ? lx : -lx), h = start.h + (handle.includes("s") ? ly : -ly);
        if ((RATIO.has(e.type) && e.lock !== false) || mv.shiftKey) { const k = Math.max(w / start.w, h / start.h); w = start.w * k; h = start.h * k; }
        w = Math.max(6, w); h = Math.max(e.type === "underline" || e.type === "strike" || e.type === "line" || e.type === "arrow" ? 1 : 6, h);
        e.w = w; e.h = h;
        e.x = handle.includes("w") ? start.x + start.w - w : start.x;
        e.y = handle.includes("n") ? start.y + start.h - h : start.y;
      }
      Object.assign(node.style, { left: `${e.x * scale}px`, top: `${e.y * scale}px`, width: `${e.w * scale}px`, height: `${e.h * scale}px`, transform: `rotate(${e.rot || 0}deg)` });
      // Drawn shapes are redrawn at the new size (images and text simply stretch with the box).
      if (handle && handle !== "rot" && !RATIO.has(e.type) && !TEXTUAL.has(e.type) && e.type !== "check") {
        const svg = node.querySelector("svg");
        if (svg) svg.outerHTML = shapeSvg(e);
      }
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      node.classList.remove("is-dragging");
      if (moved) { commit(); renderLayer(e.page); renderProps(); }
      else if ((e.type === "text" || e.type === "date" || e.type === "comment") && ed.lastTap === e.id && Date.now() - ed.lastTapAt < 450) beginEditing(e.id);
      else if (e.type === "check" && ed.lastTap === e.id && Date.now() - ed.lastTapAt < 450) { e.checked = !e.checked; commit(); renderLayer(e.page); renderProps(); }
      ed.lastTap = e.id; ed.lastTapAt = Date.now();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }
  function startShape(ev, type, pid, pageNode, x0, y0) {
    const COLORS = { highlight: "#ffd60a", underline: "#d62828", strike: "#d62828" };
    const ghost = document.createElement("div");
    ghost.className = "pe-ghost";
    $(".pe-layer", pageNode).append(ghost);
    let x1 = x0, y1 = y0;
    const move = mv => {
      [x1, y1] = pointIn(pageNode, mv);
      const l = Math.min(x0, x1), t = Math.min(y0, y1);
      Object.assign(ghost.style, { left: `${l * scale}px`, top: `${t * scale}px`, width: `${Math.abs(x1 - x0) * scale}px`, height: `${Math.abs(y1 - y0) * scale}px` });
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      ghost.remove();
      let w = Math.abs(x1 - x0), h = Math.abs(y1 - y0);
      const line = type === "line" || type === "arrow";
      if (w < 4 && h < 4) { w = line ? 80 : type === "highlight" || type === "underline" || type === "strike" ? 120 : 90; h = line ? 1 : type === "highlight" ? 16 : type === "underline" || type === "strike" ? 14 : 60; x1 = x0 + w; y1 = y0 + (line ? 0 : h); }
      const x = Math.min(x0, x1), y = Math.min(y0, y1);
      const el = { type, page: pid, x, y, w: Math.max(w, 1), h: Math.max(h, 1), color: COLORS[type] || "#d62828", stroke: type === "highlight" ? 0 : 2 };
      if (line) el.pts = [[x0 <= x1 ? 0 : 1, y0 <= y1 ? 0 : 1], [x0 <= x1 ? 1 : 0, y0 <= y1 ? 1 : 0]].map(([a, b]) => [a, h < 2 ? .5 : b]);
      if (line && h < 2) { el.h = 8; el.y = y - 4; }
      addElement(el);
      setTool("select");
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }
  function startPen(ev, pid, pageNode) {
    const pts = [pointIn(pageNode, ev)];
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", "pe-pen-live");
    const poly = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
    poly.setAttribute("fill", "none"); poly.setAttribute("stroke", "#1b2a4e"); poly.setAttribute("stroke-width", String(2 * scale));
    poly.setAttribute("stroke-linecap", "round"); poly.setAttribute("stroke-linejoin", "round");
    svg.append(poly);
    $(".pe-layer", pageNode).append(svg);
    const draw = () => poly.setAttribute("points", pts.map(([x, y]) => `${x * scale},${y * scale}`).join(" "));
    const move = mv => { pts.push(pointIn(pageNode, mv)); draw(); };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      svg.remove();
      if (pts.length < 2) return;
      const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
      const x = Math.min(...xs), y = Math.min(...ys), w = Math.max(Math.max(...xs) - x, 1), h = Math.max(Math.max(...ys) - y, 1);
      addElement({ type: "pen", page: pid, x, y, w, h, color: "#1b2a4e", stroke: 2, pts: pts.map(([px, py]) => [(px - x) / w, (py - y) / h]) }, { select: false });
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  /* ---------- page operations ---------- */
  function pageOp(kind) {
    const i = ed.current, p = ed.pages[i];
    if (!p) return;
    if (kind === "add") { const np = { pid: uid(), src: "blank", w: LETTER[0], h: LETTER[1], rot: 0 }; ed.pages.splice(i + 1, 0, np); ed.current = i + 1; }
    if (kind === "rotate") {
      // Elements on the page turn with it (positions mapped into the rotated page).
      // Turning the page 90° clockwise: a point (x, y) moves to (oldHeight - y, x).
      const { h: oldH } = pageSize(p);
      p.rot = (p.rot + 90) % 360;
      ed.els.filter(e => e.page === p.pid).forEach(e => {
        const cx = e.x + e.w / 2, cy = e.y + e.h / 2, ncx = oldH - cy, ncy = cx;
        e.x = ncx - e.w / 2; e.y = ncy - e.h / 2; e.rot = ((e.rot || 0) + 90 + 180) % 360 - 180;
      });
    }
    if (kind === "duplicate") {
      const np = { ...p, pid: uid() };
      ed.pages.splice(i + 1, 0, np);
      ed.els.filter(e => e.page === p.pid).forEach(e => ed.els.push({ ...e, id: uid(), page: np.pid, pts: e.pts && e.pts.map(q => [...q]) }));
      ed.current = i + 1;
    }
    if (kind === "delete") {
      if (ed.pages.length === 1) return toast("El documento necesita al menos una página.");
      ed.pages.splice(i, 1);
      ed.els = ed.els.filter(e => e.page !== p.pid);
      ed.current = Math.max(0, i - 1);
    }
    if (kind === "up" && i > 0) { [ed.pages[i - 1], ed.pages[i]] = [ed.pages[i], ed.pages[i - 1]]; ed.current = i - 1; }
    if (kind === "down" && i < ed.pages.length - 1) { [ed.pages[i + 1], ed.pages[i]] = [ed.pages[i], ed.pages[i + 1]]; ed.current = i + 1; }
    ed.sel = null;
    commit();
    renderAll();
    requestAnimationFrame(() => scrollToPage(ed.current));
  }
  function addPageNumbers() {
    const n = ed.pages.length;
    ed.pages.forEach((p, i) => {
      const { w, h } = pageSize(p);
      ed.els.push({ id: uid(), type: "text", page: p.pid, x: w / 2 - 40, y: h - 30, w: 80, h: 16, text: `${i + 1} / ${n}`, size: 10, align: "center", color: "#444444", font: "helv", opacity: 1, rot: 0 });
    });
    commit(); renderAll();
    toast(`Números agregados en ${n} página${n === 1 ? "" : "s"}.`);
  }

  /* ---------- export: final PDF with everything merged in ---------- */
  async function rasterLayer(p, k) {
    const els = ed.els.filter(e => e.page === p.pid);
    if (!els.length) return null;
    const { w, h } = pageSize(p);
    const c = document.createElement("canvas");
    c.width = Math.round(w * k); c.height = Math.round(h * k);
    const x = c.getContext("2d");
    for (const e of els) await drawElement(x, e, k);
    return canvasBlob(c);
  }
  function wrapLines(x, text, maxW) {
    const out = [];
    String(text || "").split("\n").forEach(par => {
      let line = "";
      par.split(/(\s+)/).forEach(word => {
        const test = line + word;
        if (x.measureText(test).width > maxW && line.trim()) { out.push(line.trimEnd()); line = word.trimStart(); }
        else line = test;
      });
      out.push(line);
    });
    return out;
  }
  async function drawElement(x, e, k) {
    const w = e.w * k, h = e.h * k;
    x.save();
    x.translate((e.x + e.w / 2) * k, (e.y + e.h / 2) * k);
    x.rotate((e.rot || 0) * Math.PI / 180);
    x.globalAlpha = e.opacity ?? 1;
    x.translate(-w / 2, -h / 2);
    const color = e.color || "#111111";
    x.strokeStyle = color; x.fillStyle = color; x.lineCap = "round"; x.lineJoin = "round";
    x.lineWidth = (e.stroke || 2) * k;
    if (e.type === "text" || e.type === "date" || e.type === "comment") {
      let pad = 0;
      if (e.type === "comment") {
        x.fillStyle = "#fff7c2"; x.strokeStyle = "#e9c84a"; x.lineWidth = 1 * k;
        x.beginPath(); x.roundRect(0, 0, w, h, 4 * k); x.fill(); x.stroke();
        pad = 6 * k; x.fillStyle = color;
      }
      const size = (e.size || 12) * k;
      x.font = `${e.italic ? "italic " : ""}${e.bold ? "bold " : ""}${size}px ${FONTS[e.font || "helv"]}`;
      x.textBaseline = "top";
      const lines = wrapLines(x, e.text, w - pad * 2);
      lines.forEach((line, i) => {
        const lw = x.measureText(line).width;
        const tx = e.align === "center" ? (w - lw) / 2 : e.align === "right" ? w - pad - lw : pad;
        x.fillText(line, tx, pad + i * size * 1.25 + size * .12);
      });
    } else if (e.type === "stamp") {
      const bw = 2.5 * k;
      x.lineWidth = bw;
      x.beginPath(); x.roundRect(bw / 2, bw / 2, w - bw, h - bw, 8 * k); x.stroke();
      const fs = Math.min(e.h * .52, e.w / Math.max(4, (e.text || "").length) * 1.5) * k;
      x.font = `800 ${fs}px Helvetica, Arial, sans-serif`;
      x.textAlign = "center"; x.textBaseline = "middle";
      x.fillText(e.text || "", w / 2, h / 2 + fs * .04);
    } else if (e.type === "image" || e.type === "signature") {
      const res = await imageFor(e.src);
      if (res) x.drawImage(res.img, 0, 0, w, h);
    } else if (e.type === "check") {
      x.lineWidth = .08 * w;
      x.fillStyle = "#fff"; x.fillRect(.05 * w, .05 * h, .9 * w, .9 * h);
      x.strokeRect(.05 * w, .05 * h, .9 * w, .9 * h);
      if (e.checked) { x.lineWidth = .12 * w; x.beginPath(); x.moveTo(.23 * w, .53 * h); x.lineTo(.41 * w, .71 * h); x.lineTo(.77 * w, .29 * h); x.stroke(); }
    } else if (e.type === "highlight") {
      x.globalAlpha = (e.opacity ?? 1) * .38; x.fillRect(0, 0, w, h);
    } else if (e.type === "underline" || e.type === "strike") {
      const yy = e.type === "underline" ? h - x.lineWidth / 2 : h / 2;
      x.beginPath(); x.moveTo(0, yy); x.lineTo(w, yy); x.stroke();
    } else if (e.type === "rect" || e.type === "ellipse") {
      const s = x.lineWidth;
      x.beginPath();
      if (e.type === "rect") x.rect(s / 2, s / 2, w - s, h - s); else x.ellipse(w / 2, h / 2, Math.max(0, w / 2 - s / 2), Math.max(0, h / 2 - s / 2), 0, 0, Math.PI * 2);
      if (e.fill) { x.save(); x.globalAlpha = (e.opacity ?? 1) * .18; x.fill(); x.restore(); }
      x.stroke();
    } else if (e.pts?.length) {
      x.beginPath();
      e.pts.forEach(([px, py], i) => i ? x.lineTo(px * w, py * h) : x.moveTo(px * w, py * h));
      x.stroke();
      if (e.type === "arrow" && e.pts.length >= 2) {
        const a = e.pts[e.pts.length - 2], b = e.pts[e.pts.length - 1], x2 = b[0] * w, y2 = b[1] * h;
        const ang = Math.atan2(y2 - a[1] * h, x2 - a[0] * w), L = (6 + (e.stroke || 2) * 2.5) * k;
        x.beginPath(); x.moveTo(x2 - L * Math.cos(ang - .45), y2 - L * Math.sin(ang - .45)); x.lineTo(x2, y2); x.lineTo(x2 - L * Math.cos(ang + .45), y2 - L * Math.sin(ang + .45)); x.stroke();
      }
    }
    x.restore();
  }
  // Builds the final PDF (all pages, or the given page ids). Original pages stay vector;
  // added elements are merged as a transparent high-resolution layer on top.
  async function buildPdf(onlyPids) {
    const L = pdfLib();
    const src = await L.PDFDocument.load(await ed.original.arrayBuffer(), { ignoreEncryption: true });
    const out = await L.PDFDocument.create();
    const K = 3; // 216 dpi for the added layer
    for (const p of ed.pages) {
      if (onlyPids && !onlyPids.has(p.pid)) continue;
      let page;
      if (p.src === "orig") { [page] = await out.copyPages(src, [p.index]); out.addPage(page); }
      else page = out.addPage([p.w, p.h]);
      const R = totalRot(p);
      page.setRotation(L.degrees(R));
      const png = await rasterLayer(p, K);
      if (!png) continue;
      const img = await out.embedPng(await png.arrayBuffer());
      const box = p.src === "orig" ? page.getCropBox() : { x: 0, y: 0, width: p.w, height: p.h };
      const W = box.width, H = box.height, ox = box.x, oy = box.y, d = pageSize(p);
      const place = { 0: [0, 0, 0], 90: [W, 0, 90], 180: [W, H, 180], 270: [0, H, 270] }[R];
      page.drawImage(img, { x: ox + place[0], y: oy + place[1], width: d.w, height: d.h, rotate: L.degrees(place[2]) });
    }
    out.setTitle(ed.doc.name.replace(/\.pdf$/i, ""));
    out.setProducer("Ruben Perla - Editor PDF");
    return new Blob([await out.save()], { type: "application/pdf" });
  }
  const finalName = () => ed.doc.name.replace(/(\.pdf)?$/i, "-editado.pdf");
  async function withBusy(label, task) {
    toast(label);
    try { return await task(); } catch (error) { console.error(error); toast(error.message || "No se pudo completar la acción."); return null; }
  }
  async function saveVersion() {
    const blob = await withBusy("Generando la versión…", () => buildPdf());
    if (!blob) return;
    const v = await Store().saveVersion(ed.doc.id, blob, { v: 1, pages: ed.pages, els: ed.els });
    ed.doc = await Store().getDoc(ed.doc.id);
    toast(`Versión ${v.n} guardada.`);
  }
  async function printPdf() {
    const blob = await withBusy("Preparando para imprimir…", () => buildPdf());
    if (!blob) return;
    const url = URL.createObjectURL(blob), frame = document.createElement("iframe");
    frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
    frame.src = url;
    frame.onload = () => { try { frame.contentWindow.focus(); frame.contentWindow.print(); } catch (_) { window.open(url, "_blank", "noopener"); } setTimeout(() => { frame.remove(); URL.revokeObjectURL(url); }, 60000); };
    document.body.append(frame);
  }

  /* ---------- versions, linking, more menu ---------- */
  async function versionsDialog() {
    const doc = await Store().getDoc(ed.doc.id);
    const rows = [...(doc.versions || [])].reverse().map(v => `<div class="pe-ver"><div><strong>Versión ${v.n}</strong><small>${fmtDateTime(v.at)} · ${fmtSize(v.size)}</small></div>
      <button type="button" class="pe-btn" data-ver-dl="${v.n}">${ic("download")} PDF</button><button type="button" class="pe-btn" data-ver-restore="${v.n}">Recuperar</button></div>`).join("");
    await dialog({
      title: "Versiones", wide: true,
      body: `<div class="pe-ver"><div><strong>Original</strong><small>Subido ${fmtDateTime(doc.createdAt)} · nunca se modifica</small></div><button type="button" class="pe-btn" data-ver-dl="orig">${ic("download")} PDF</button><button type="button" class="pe-btn" data-ver-restore="orig">Empezar desde el original</button></div>${rows || '<p class="pe-muted">Todavía no hay versiones. Toca "Guardar versión" para crear una.</p>'}`,
      actions: [{ id: "close", label: "Cerrar" }],
      onReady: (wrap, close) => wrap.addEventListener("click", async e => {
        const dl = e.target.closest("[data-ver-dl]")?.dataset.verDl, rs = e.target.closest("[data-ver-restore]")?.dataset.verRestore;
        if (dl) {
          const blob = dl === "orig" ? await Store().getOriginal(doc.id) : await Store().getVersionPdf(doc.id, Number(dl));
          if (blob) download(blob, dl === "orig" ? doc.name : doc.name.replace(/(\.pdf)?$/i, `-v${dl}.pdf`));
        }
        if (rs) {
          const text = rs === "orig" ? JSON.stringify({ pages: ed.base.map((_, i) => ({ pid: uid(), src: "orig", index: i, rot: 0 })), els: [] }) : JSON.stringify(await Store().getVersionState(doc.id, Number(rs)));
          if (!text || text === "null") return toast("No se pudo leer esa versión.");
          ed.past.push(ed.snap); ed.future = [];
          restore(JSON.stringify({ pages: JSON.parse(text).pages, els: JSON.parse(text).els }));
          toast(rs === "orig" ? "Se volvió al original (puedes deshacer)." : `Versión ${rs} recuperada (puedes deshacer).`);
          close(null);
        }
      })
    });
  }
  async function linkDialog() {
    const invoices = window.TrentonControl?.records?.() || [], hours = window.HoursApp?.reports?.() || [], jobs = window.JobApp?.reports?.() || [];
    const opt = (kind, r, label) => `<option value="${kind}|${esc(r.id)}" ${ed.doc.link?.kind === kind && ed.doc.link?.id === r.id ? "selected" : ""}>${esc(label)}</option>`;
    const r = await dialog({
      title: "Asociar a factura o trabajo",
      body: `<label class="pe-field"><span>Registro existente</span><select class="pe-link-select"><option value="">Ninguno</option>
          <optgroup label="Invoices">${invoices.map(x => opt("invoice", x, `${x.invoiceNumber || "Invoice"} · ${x.address || ""}`)).join("")}</optgroup>
          <optgroup label="Reportes de horas">${hours.map(x => opt("hours", x, `Horas · ${x.jobAddress || ""} ${x.reportDate || ""}`)).join("")}</optgroup>
          <optgroup label="Reportes enviados">${jobs.map(x => opt("job", x, `Reporte · ${x.jobAddress || ""}`)).join("")}</optgroup></select></label>
        <label class="pe-field"><span>O una dirección / trabajo</span><input class="pe-link-text" value="${ed.doc.link?.kind === "address" ? esc(ed.doc.link.label) : ""}" placeholder="Ej. 1117 C St SE, Washington, DC"></label>`,
      actions: [{ id: "c", label: "Cancelar" }, { id: "ok", label: "Guardar", primary: true }]
    });
    if (r?.id !== "ok") return;
    const value = $(".pe-link-select", r.root).value, text = $(".pe-link-text", r.root).value.trim();
    let link = null;
    if (value) {
      const [kind, id] = value.split("|");
      const rec = (kind === "invoice" ? invoices : kind === "hours" ? hours : jobs).find(x => x.id === id);
      link = { kind, id, label: kind === "invoice" ? `${rec?.invoiceNumber || "Invoice"} · ${rec?.address || ""}` : `${rec?.jobAddress || "Reporte"}` };
    } else if (text) link = { kind: "address", id: "", label: text };
    ed.doc = await Store().updateDoc(ed.doc.id, { link });
    buildEditorTitle();
    toast(link ? "Documento asociado." : "Asociación quitada.");
  }
  function buildEditorTitle() {
    const title = $(".pe-title", root);
    $(".pe-link-chip", title)?.remove();
    if (ed.doc.link) title.insertAdjacentHTML("beforeend", `<span class="pe-link-chip">${ic("link")}${esc(ed.doc.link.label)}</span>`);
  }
  // Saves the final PDF into the linked invoice (its PDF is replaced; this document keeps the original).
  async function saveIntoInvoice() {
    const link = ed.doc.link;
    if (link?.kind !== "invoice") return toast("Primero asocia el documento a una invoice.");
    const records = window.TrentonControl?.records?.() || [];
    const record = records.find(x => x.id === link.id);
    if (!record) return toast("No se encontró la invoice asociada.");
    if (!(await confirmDialog("Guardar en la invoice", `El PDF de ${record.invoiceNumber || "la invoice"} se reemplazará por esta versión editada. El original queda guardado en el Editor PDF.`, "Guardar en la invoice"))) return;
    const blob = await withBusy("Guardando en la invoice…", () => buildPdf());
    if (!blob) return;
    try {
      record.pdfBlob = blob;
      record.pdfName = finalName();
      record.pdfHash = window.InvoicePDF?.hash ? await window.InvoicePDF.hash(blob) : record.pdfHash;
      record.invoiceData = null;
      record.source = "imported";
      record.updatedAt = new Date().toISOString();
      await window.CloudDB.saveInvoice(record, records);
      window.TrentonControl?.render?.();
      await Store().saveVersion(ed.doc.id, blob, { v: 1, pages: ed.pages, els: ed.els }, `Guardado en ${record.invoiceNumber || "invoice"}`);
      toast("PDF guardado en la invoice.");
    } catch (error) { toast(error.message || "No se pudo guardar en la invoice."); }
  }
  async function saveCopy() {
    const copy = await Store().duplicateDoc(ed.doc.id);
    await Store().saveState(copy.id, { v: 1, pages: ed.pages, els: ed.els });
    toast(`Copia guardada: ${copy.name}`);
  }
  function moreMenu(anchor) {
    document.querySelector(".pe-menu")?.remove();
    const items = [
      ["versions", "history", "Versiones"], ["link", "link", "Asociar a factura o trabajo"], ["toInvoice", "save", "Guardar en la invoice asociada"],
      ["original", "download", "Descargar original"], ["selected", "download", "Descargar páginas seleccionadas"], ["print", "print", "Imprimir"],
      ["copy", "copy", "Guardar una copia"], ["review", "star", ed.doc.status === "revision" ? "Marcar revisado" : "Marcar pendiente de revisión"], ["pagenums", "hash", "Agregar números de página"]
    ];
    const menu = document.createElement("div");
    menu.className = "pe-menu";
    menu.innerHTML = items.map(([id, icon, label]) => `<button type="button" data-more="${id}">${ic(icon)}${label}</button>`).join("");
    document.body.append(menu);
    const b = anchor.getBoundingClientRect();
    menu.style.top = `${b.bottom + 6}px`;
    menu.style.left = `${Math.max(8, Math.min(b.right - menu.offsetWidth, innerWidth - menu.offsetWidth - 8))}px`;
    const close = ev => { if (!menu.contains(ev.target)) { menu.remove(); document.removeEventListener("pointerdown", close, true); } };
    document.addEventListener("pointerdown", close, true);
    menu.onclick = async ev => {
      const k = ev.target.closest("[data-more]")?.dataset.more;
      if (!k) return;
      menu.remove();
      if (k === "versions") versionsDialog();
      if (k === "link") linkDialog();
      if (k === "toInvoice") saveIntoInvoice();
      if (k === "original") download(ed.original, ed.doc.name);
      if (k === "selected") {
        if (!ed.thumbSel.size) return toast("Marca las páginas en el panel de páginas.");
        const blob = await withBusy("Generando páginas seleccionadas…", () => buildPdf(ed.thumbSel));
        if (blob) download(blob, ed.doc.name.replace(/(\.pdf)?$/i, "-paginas.pdf"));
      }
      if (k === "print") printPdf();
      if (k === "copy") saveCopy();
      if (k === "review") { ed.doc = await Store().updateDoc(ed.doc.id, { status: ed.doc.status === "revision" ? "editado" : "revision" }); toast(ed.doc.status === "revision" ? "Marcado como pendiente de revisión." : "Marcado como revisado."); }
      if (k === "pagenums") addPageNumbers();
    };
  }

  /* ---------- editor clicks + keyboard ---------- */
  async function onEditorClick(e) {
    const tool = e.target.closest("[data-tool]");
    if (tool) return setTool(tool.dataset.tool);
    const pick = e.target.closest("[data-pick-sig]");
    if (pick) { ed.sigId = pick.dataset.pickSig; $$(".pe-sig-pick", root).forEach(b => b.classList.toggle("is-on", b === pick)); return; }
    if (e.target.closest("[data-sig]")) return onSignatureClick(e);
    const page = e.target.closest("[data-page]");
    if (page) return pageOp(page.dataset.page);
    const thumb = e.target.closest("[data-thumb]");
    if (thumb && !e.target.closest(".pe-thumb-check")) return scrollToPage(Number(thumb.dataset.thumb));
    const tpl = e.target.closest("[data-insert-tpl]");
    if (tpl) return insertTemplate(tpl.dataset.insertTpl);
    const prop = e.target.closest("[data-prop-act], [data-toggle], [data-align]");
    if (prop) return onPropAction(prop);
    const a = e.target.closest("[data-ed]")?.dataset.ed;
    if (!a) return;
    if (a === "back") return closeEditor();
    if (a === "undo") return undo();
    if (a === "redo") return redo();
    if (a === "zoomIn") { ed.zoom = clamp(ed.zoom * 1.2, .3, 3); return renderPages(); }
    if (a === "zoomOut") { ed.zoom = clamp(ed.zoom / 1.2, .3, 3); return renderPages(); }
    if (a === "fit") { fitZoom(); return renderPages(); }
    if (a === "save") return saveVersion();
    if (a === "download") { const blob = await withBusy("Generando el PDF final…", () => buildPdf()); if (blob) download(blob, finalName()); return; }
    if (a === "more") return moreMenu(e.target.closest("[data-ed]"));
    if (a === "quickSign") {
      if (!ed.sigId) return toast("Primero guarda una firma.");
      const p = ed.pages[ed.current], { w, h } = pageSize(p);
      const el = await signatureElement(ed.sigId, p.pid, w * .72, h * .82);
      if (el) { addElement(el); setTool("select"); }
      return;
    }
    if (a === "togglePages") return $(".pe-thumbs", root).classList.toggle("is-open");
    if (a === "toggleProps") return $(".pe-props", root).classList.toggle("is-open");
  }
  async function insertTemplate(id) {
    const t = BUILTIN.find(x => x.id === id) || (await Store().listTemplates()).find(x => x.id === id);
    if (!t) return;
    const p = ed.pages[ed.current], { w, h } = pageSize(p);
    const el = { opacity: 1, rot: 0, size: 12, font: "helv", color: "#111111", ...JSON.parse(JSON.stringify(t.el)), page: p.pid };
    if (el.type === "date") el.text = todayText();
    el.x = w / 2 - el.w / 2; el.y = h / 2 - el.h / 2;
    addElement(el);
  }
  async function onPropAction(btn) {
    const e = selected();
    if (btn.dataset.propAct === "pagenums") return addPageNumbers();
    if (!e) return;
    if (btn.dataset.toggle) { e[btn.dataset.toggle] = !e[btn.dataset.toggle]; }
    if (btn.dataset.align) { e.align = btn.dataset.align; }
    const k = btn.dataset.propAct;
    if (k === "delete") {
      const node = $(`.pe-el[data-id="${e.id}"]`, root);
      await node?.animate([{ opacity: 1, transform: node.style.transform }, { opacity: 0, transform: `${node.style.transform} scale(.85)` }], { duration: 180 }).finished;
      ed.els = ed.els.filter(x => x.id !== e.id); ed.sel = null;
    }
    if (k === "duplicate") { const c = { ...e, id: uid(), x: e.x + 14, y: e.y + 14, pts: e.pts && e.pts.map(q => [...q]) }; ed.els.push(c); ed.sel = c.id; }
    if (k === "front") { ed.els = [...ed.els.filter(x => x.id !== e.id), e]; }
    if (k === "template") {
      const r = await dialog({ title: "Guardar como plantilla", body: `<label class="pe-field"><span>Nombre</span><input value="${esc(e.type === "stamp" ? `Sello ${e.text}` : e.type === "signature" ? "Firma" : "Elemento")}" maxlength="60"></label>`, actions: [{ id: "c", label: "Cancelar" }, { id: "ok", label: "Guardar", primary: true }] });
      if (r?.id === "ok") {
        const { id, page, x, y, ...rest } = e;
        await Store().addTemplate({ name: $("input", r.root).value.trim() || "Plantilla", el: rest });
        toast("Plantilla guardada.");
      }
      return renderProps();
    }
    commit();
    renderLayer(e.page);
    renderProps();
  }
  function onKey(e) {
    if (!root || $(".pe-editor", root)?.hidden || root.classList.contains("hidden")) return;
    if (e.target.closest?.("input, textarea, select, [contenteditable=true]")) return;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === "z") { e.preventDefault(); e.shiftKey ? redo() : undo(); }
    else if (mod && e.key.toLowerCase() === "y") { e.preventDefault(); redo(); }
    else if ((e.key === "Delete" || e.key === "Backspace") && ed.sel) { e.preventDefault(); onPropAction({ dataset: { propAct: "delete" } }); }
    else if (e.key === "Escape") { select(null); setTool("select"); }
    else if (ed.sel && e.key.startsWith("Arrow")) {
      const el = selected(), step = e.shiftKey ? 10 : 1;
      if (e.key === "ArrowLeft") el.x -= step; if (e.key === "ArrowRight") el.x += step; if (e.key === "ArrowUp") el.y -= step; if (e.key === "ArrowDown") el.y += step;
      e.preventDefault(); renderLayer(el.page); clearTimeout(propTimer); propTimer = setTimeout(() => { commit(); renderProps(); }, 300);
    }
  }
  document.addEventListener("keydown", onKey);

  async function closeEditor() {
    if (ed.doc) await Store().flushState(ed.doc.id);
    $(".pe-editor", root).hidden = true;
    $(".pe-library", root).hidden = false;
    ed.doc = null;
    renderLibrary();
  }

  /* ---------- open from an invoice / report (no duplicates) ---------- */
  async function openFromRecord(kind, record) {
    mount();
    window.TrentonControl?.navClick?.("editor");
    const existing = (await Store().listDocs()).find(d => d.link?.kind === kind && d.link?.id === record.id);
    if (existing) return openDoc(existing.id);
    let blob = record.pdfBlob;
    try {
      if (!blob && kind === "invoice") blob = await window.CloudDB.ensureInvoicePdf(record);
      if (!blob && kind === "hours") blob = await window.CloudDB.ensureHoursPdf(record);
      if (!blob && kind === "job") blob = await window.CloudDB.ensureJobPdf(record);
    } catch (_) { /* handled below */ }
    if (!blob) return toast("Este registro no tiene un PDF disponible.");
    const label = kind === "invoice" ? `${record.invoiceNumber || "Invoice"} · ${record.address || ""}` : record.jobAddress || "Reporte";
    const name = record.pdfName || `${label.replace(/[^\w\s#.-]+/g, " ").trim()}.pdf`;
    let pages = 0;
    try { pages = (await loadPdfJs(blob)).numPages; } catch (_) {}
    const doc = await Store().createDoc(blob, { name, pages, link: { kind, id: record.id, label } });
    openDoc(doc.id);
  }

  /* ---------- entry point (called when the view is shown) ---------- */
  function open() {
    mount();
    if (ed.doc && !$(".pe-editor", root).hidden) return;
    $(".pe-editor", root).hidden = true;
    $(".pe-library", root).hidden = false;
    renderLibrary();
  }
  window.addEventListener("beforeunload", () => { if (ed.doc) Store().flushState(ed.doc.id); });

  return { open, openDoc, openFromRecord, uploadFlow };
})();

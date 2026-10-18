/* PDF preview for the edit windows (invoice, hours, job) and a full-screen viewer.
   Pages are drawn with pdf.js on canvas, so the preview works the same on phones
   (Android Chrome cannot show a PDF inside an iframe). */
window.PdfPreview = (function () {
  "use strict";
  const PDFJS = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
  const WORKER = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  const esc = value => String(value ?? "").replace(/[&<>'"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#039;", '"': "&quot;" }[char]));
  const sizeLabel = bytes => !bytes ? "" : bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;

  let libPromise = null;
  function loadLib() {
    if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
    if (!libPromise) {
      libPromise = new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = PDFJS;
        script.onload = async () => {
          if (!window.pdfjsLib) return reject(new Error("No se pudo cargar el visor de PDF."));
          // Browsers refuse a worker from another site, so run it from a same-origin blob copy.
          try {
            const code = await (await fetch(WORKER)).text();
            window.pdfjsLib.GlobalWorkerOptions.workerSrc = URL.createObjectURL(new Blob([code], { type: "text/javascript" }));
          } catch (_) {
            window.pdfjsLib.GlobalWorkerOptions.workerSrc = WORKER;
          }
          resolve(window.pdfjsLib);
        };
        script.onerror = () => { libPromise = null; reject(new Error("No se pudo cargar el visor de PDF. Revisa la conexión.")); };
        document.head.appendChild(script);
      });
    }
    return libPromise;
  }
  async function openDoc(blob) {
    const lib = await loadLib();
    const data = new Uint8Array(await blob.arrayBuffer());
    return lib.getDocument({ data }).promise;
  }
  async function drawPage(doc, number, canvas, cssWidth) {
    const page = await doc.getPage(number);
    const base = page.getViewport({ scale: 1 });
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const viewport = page.getViewport({ scale: (cssWidth / base.width) * ratio });
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    canvas.style.width = `${cssWidth}px`;
    canvas.style.height = `${Math.round(viewport.height / ratio)}px`;
    await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
  }

  // ---- Card inside an edit window: first-page thumbnail, file name, "Ver PDF" and "Cambiar" ----
  const slots = new WeakMap(); // slot element -> { token, blob, title }
  function show(slot, options) {
    if (!slot) return;
    const { name = "Documento.pdf", status = "", load, onReplace, title } = options || {};
    const token = {};
    slots.set(slot, { token, blob: null, title: title || name });
    slot.hidden = false;
    slot.closest(".modal")?.classList.add("has-pdf");
    slot.innerHTML = `<div class="pdf-slot-thumb" data-pdf-view><canvas aria-hidden="true"></canvas><span class="pdf-slot-loading">Cargando vista previa…</span><span class="pdf-slot-zoom" aria-hidden="true"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4 4M11 8.5v5M8.5 11h5"/></svg></span></div>
      <div class="pdf-slot-info">
        <span class="pdf-slot-badge">PDF</span>
        <strong class="pdf-slot-name" title="${esc(name)}">${esc(name)}</strong>
        <small class="pdf-slot-status">${esc(status)}</small>
        <div class="pdf-slot-actions">
          <button type="button" class="button button-primary pdf-slot-view" data-pdf-view>Ver PDF</button>
          ${onReplace ? '<button type="button" class="button button-ghost pdf-slot-replace">Cambiar PDF</button>' : ""}
        </div>
      </div>`;
    slot.querySelectorAll("[data-pdf-view]").forEach(button => button.addEventListener("click", () => view(slot)));
    slot.querySelector(".pdf-slot-replace")?.addEventListener("click", () => onReplace());
    const thumb = slot.querySelector(".pdf-slot-thumb");
    (async () => {
      try {
        const blob = await load();
        if (slots.get(slot)?.token !== token) return;
        if (!blob) throw new Error("Sin PDF");
        slots.get(slot).blob = blob;
        const sizeText = sizeLabel(blob.size);
        if (sizeText && !status) slot.querySelector(".pdf-slot-status").textContent = sizeText;
        const doc = await openDoc(blob);
        if (slots.get(slot)?.token !== token) return;
        await drawPage(doc, 1, thumb.querySelector("canvas"), Math.max(thumb.clientWidth, 72));
        thumb.classList.add("is-ready");
        if (doc.numPages > 1) thumb.insertAdjacentHTML("beforeend", `<span class="pdf-slot-pages">${doc.numPages} págs.</span>`);
      } catch (error) {
        if (slots.get(slot)?.token !== token) return;
        thumb.classList.add("is-failed");
        thumb.querySelector(".pdf-slot-loading").textContent = slots.get(slot).blob ? "Vista previa no disponible" : "PDF no disponible";
        if (!slots.get(slot).blob) slot.querySelector(".pdf-slot-view")?.setAttribute("disabled", "");
      }
    })();
  }
  function clear(slot) {
    if (!slot) return;
    slots.delete(slot);
    slot.hidden = true;
    slot.innerHTML = "";
    slot.closest(".modal")?.classList.remove("has-pdf");
  }
  function view(slot) {
    const state = slots.get(slot);
    if (state?.blob) open(state.blob, state.title);
  }

  // ---- Full-screen viewer ----
  let viewer = null;
  function buildViewer() {
    viewer = document.createElement("div");
    viewer.className = "pdf-viewer";
    viewer.hidden = true;
    viewer.setAttribute("role", "dialog");
    viewer.setAttribute("aria-modal", "true");
    viewer.innerHTML = `<div class="pdf-viewer-bar">
        <strong class="pdf-viewer-title"></strong>
        <div class="pdf-viewer-tools">
          <button type="button" class="pdf-viewer-btn" data-zoom="-1" aria-label="Alejar">−</button>
          <span class="pdf-viewer-zoom">100%</span>
          <button type="button" class="pdf-viewer-btn" data-zoom="1" aria-label="Acercar">+</button>
          <button type="button" class="pdf-viewer-btn pdf-viewer-download" aria-label="Descargar PDF"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v11M7 10l5 5 5-5M5 20h14"/></svg></button>
          <button type="button" class="pdf-viewer-btn pdf-viewer-close" aria-label="Cerrar">×</button>
        </div>
      </div>
      <div class="pdf-viewer-pages"><p class="pdf-viewer-msg">Cargando PDF…</p></div>`;
    document.body.appendChild(viewer);
    viewer.querySelector(".pdf-viewer-close").addEventListener("click", close);
    viewer.addEventListener("click", event => { if (event.target === viewer) close(); });
    viewer.querySelectorAll("[data-zoom]").forEach(button => button.addEventListener("click", () => zoom(Number(button.dataset.zoom))));
    viewer.querySelector(".pdf-viewer-download").addEventListener("click", download);
    document.addEventListener("keydown", event => { if (event.key === "Escape" && viewer && !viewer.hidden) { event.stopPropagation(); close(); } }, true);
    window.addEventListener("resize", () => { if (viewer && !viewer.hidden) paint(); });
  }
  const state = { blob: null, title: "", doc: null, zoom: 1, run: 0 };
  async function open(blob, title) {
    if (!viewer) buildViewer();
    Object.assign(state, { blob, title: title || "Documento.pdf", doc: null, zoom: 1 });
    viewer.querySelector(".pdf-viewer-title").textContent = state.title;
    viewer.querySelector(".pdf-viewer-pages").innerHTML = '<p class="pdf-viewer-msg">Cargando PDF…</p>';
    viewer.hidden = false;
    document.body.classList.add("pdf-viewer-open");
    const run = ++state.run;
    try {
      const doc = await openDoc(blob);
      if (run !== state.run) return;
      state.doc = doc;
      paint();
    } catch (error) {
      if (run !== state.run) return;
      // pdf.js unavailable: fall back to the browser's own viewer.
      const url = URL.createObjectURL(blob);
      viewer.querySelector(".pdf-viewer-pages").innerHTML = `<iframe class="pdf-viewer-frame" src="${url}" title="${esc(state.title)}"></iframe><p class="pdf-viewer-msg">Si no se ve, usa el botón de descargar.</p>`;
    }
  }
  async function paint() {
    if (!state.doc) return;
    const run = ++state.run;
    const pages = viewer.querySelector(".pdf-viewer-pages");
    const width = Math.min(pages.clientWidth - 24, 900) * state.zoom;
    viewer.querySelector(".pdf-viewer-zoom").textContent = `${Math.round(state.zoom * 100)}%`;
    pages.innerHTML = "";
    for (let number = 1; number <= state.doc.numPages; number++) {
      if (run !== state.run) return;
      const canvas = document.createElement("canvas");
      canvas.className = "pdf-viewer-page";
      pages.appendChild(canvas);
      await drawPage(state.doc, number, canvas, Math.max(width, 200));
    }
  }
  function zoom(direction) {
    const steps = [0.6, 0.8, 1, 1.25, 1.5, 2];
    const index = steps.indexOf(state.zoom);
    const next = steps[Math.min(steps.length - 1, Math.max(0, (index < 0 ? 2 : index) + direction))];
    if (next === state.zoom) return;
    state.zoom = next;
    paint();
  }
  async function download() {
    if (!state.blob) return;
    const name = /\.pdf$/i.test(state.title) ? state.title : `${state.title}.pdf`;
    if (window.TrentonControl?.download) return window.TrentonControl.download(state.blob, name, { share: true });
    const url = URL.createObjectURL(state.blob);
    const link = Object.assign(document.createElement("a"), { href: url, download: name });
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
  function close() {
    if (!viewer) return;
    state.run++;
    state.doc = null;
    viewer.hidden = true;
    viewer.querySelector(".pdf-viewer-pages").innerHTML = "";
    document.body.classList.remove("pdf-viewer-open");
  }

  // ---- Archive dialog (#pdfDialog): the archives set the iframe's src to a blob URL.
  // Draw those pages with pdf.js in place of the iframe so they show on phones too. ----
  async function blobFromUrl(url) {
    const response = await fetch(url);
    if (!response.ok) throw new Error("No se pudo abrir el PDF.");
    return response.blob();
  }
  let dialogRun = 0, dialogDoc = null;
  async function paintDialog(pages) {
    const run = dialogRun;
    pages.innerHTML = "";
    const width = Math.max(Math.min(pages.clientWidth - 24, 900), 200);
    for (let number = 1; number <= dialogDoc.numPages; number++) {
      if (run !== dialogRun) return;
      const canvas = document.createElement("canvas");
      canvas.className = "pdf-viewer-page";
      pages.appendChild(canvas);
      await drawPage(dialogDoc, number, canvas, width);
    }
  }
  function watchDialog() {
    const frame = document.getElementById("pdfDialogFrame");
    if (!frame || frame.dataset.pdfjs) return;
    frame.dataset.pdfjs = "1";
    const pages = document.createElement("div");
    pages.className = "pdf-dialog-pages";
    pages.hidden = true;
    frame.after(pages);
    const sync = async () => {
      const src = frame.getAttribute("src") || "";
      const run = ++dialogRun;
      dialogDoc = null;
      if (!src.startsWith("blob:")) { pages.hidden = true; pages.innerHTML = ""; frame.hidden = false; return; }
      frame.hidden = true;
      pages.hidden = false;
      pages.innerHTML = '<p class="pdf-viewer-msg">Cargando PDF…</p>';
      try {
        const doc = await openDoc(await blobFromUrl(src));
        if (run !== dialogRun) return;
        dialogDoc = doc;
        await paintDialog(pages);
      } catch (_) {
        if (run !== dialogRun) return;
        // pdf.js unavailable: show the browser's own viewer again.
        pages.hidden = true;
        frame.hidden = false;
      }
    };
    new MutationObserver(sync).observe(frame, { attributes: true, attributeFilter: ["src"] });
    let resizeTimer = 0;
    window.addEventListener("resize", () => {
      if (!dialogDoc || pages.hidden) return;
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => { dialogRun++; paintDialog(pages); }, 200);
    });
    if (frame.getAttribute("src")) sync();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", watchDialog); else watchDialog();

  // ---- Links that open a PDF blob in a new tab ("Ver original ↗") open in the viewer instead. ----
  document.addEventListener("click", async event => {
    const link = event.target.closest?.('a[href^="blob:"][target="_blank"]');
    if (!link || link.hasAttribute("download")) return;
    event.preventDefault();
    try {
      const blob = await blobFromUrl(link.href);
      if (blob.type && !/pdf/i.test(blob.type)) return window.open(link.href, "_blank", "noopener");
      const name = link.closest("[class*=import-row]")?.querySelector("label")?.textContent?.trim() || link.title || "Documento.pdf";
      open(blob, name);
    } catch (_) {
      window.open(link.href, "_blank", "noopener");
    }
  });

  return { show, clear, open, close };
})();

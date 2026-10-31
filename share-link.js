/* "Copiar link": a 30-day link to a preview page (ver.html) of an invoice or hours PDF.
   Anyone with the link can see that one PDF without signing in. */
window.ShareLink = (function () {
  "use strict";
  const DAYS = 30;
  const BUCKETS = { invoice: "invoice-pdfs", hours: "hours-pdfs", job: "job-pdfs" };
  const money = value => `$${Number(value || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const dmy = iso => /^\d{4}-\d{2}-\d{2}/.test(String(iso || "")) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "";
  const toast = text => window.TrentonControl?.toast?.(text);

  function describe(kind, record) {
    if (kind === "invoice") {
      const date = dmy(window.InvoiceCore?.issuedDate?.(record) || record.issuedDate);
      return { title: `Invoice ${record.invoiceNumber || ""} · ${record.address || ""}`.replace(/\s+·\s*$/, ""), meta: [date, record.amount ? money(record.amount) : ""].filter(Boolean).join(" · ") };
    }
    const date = dmy(record.reportDate || record.startDate);
    return { title: `${kind === "job" ? "Reporte" : "Horas"} · ${record.jobAddress || "Sin dirección"}`, meta: date };
  }

  async function link(kind, record) {
    if (!record?.pdfPath) throw new Error(record?.pdfBlob ? "Este PDF todavía no se subió a la nube. Espera un momento con internet y vuelve a intentar." : "Este registro no tiene PDF.");
    const signed = await window.CloudDB.signedUrl(BUCKETS[kind], record.pdfPath, DAYS * 24 * 3600);
    const { title, meta } = describe(kind, record);
    const page = location.origin + location.pathname.replace(/[^/]*$/, "") + "ver.html";
    return `${page}#u=${encodeURIComponent(signed)}&t=${encodeURIComponent(title)}&m=${encodeURIComponent(meta)}`;
  }

  async function writeClipboard(text) {
    try { await navigator.clipboard.writeText(text); return true; } catch (_) {}
    // Older browsers / lost user gesture: a hidden textarea and execCommand.
    try {
      const area = Object.assign(document.createElement("textarea"), { value: text });
      area.setAttribute("readonly", ""); area.style.cssText = "position:fixed;top:-1000px;opacity:0";
      document.body.append(area); area.select();
      const ok = document.execCommand("copy"); area.remove();
      return ok;
    } catch (_) { return false; }
  }

  async function copy(kind, record) {
    try {
      toast("Creando link…");
      const url = await link(kind, record);
      if (await writeClipboard(url)) toast(`Link copiado. Sirve ${DAYS} días para ver el PDF.`);
      else window.prompt("Copia este link:", url);
      return url;
    } catch (error) {
      toast(error.message || "No se pudo crear el link.");
      return "";
    }
  }

  // "Copiar link" in the archive PDF window: the archives store which record is open.
  function recordFor(kind, id) {
    const lists = kind === "invoice" ? [window.TrentonControl?.records?.()] : [window.HoursApp?.reports?.(), window.JobApp?.reports?.()];
    for (const list of lists) { const found = (list || []).find(item => item.id === id); if (found) return found; }
    return null;
  }
  document.addEventListener("click", event => {
    if (!event.target.closest?.("#pdfDialogShare")) return;
    const dialog = document.getElementById("pdfDialog");
    const kind = dialog?.dataset.kind || "invoice";
    const record = recordFor(kind, dialog?.dataset.recordId);
    if (record) copy(kind, record); else toast("No se encontró el registro.");
  });

  return { copy, link };
})();

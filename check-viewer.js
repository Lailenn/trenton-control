/* "Cheque ×N" badges on the boards open a small panel: the payment status of the record
   and every cheque photo with its date. Cheques have no amount of their own in the database,
   so the panel shows the record's total, received and owed amounts. */
(function () {
  "use strict";
  const esc = value => String(value ?? "").replace(/[&<>'"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#039;", '"': "&quot;" }[char]));
  const money = value => `$${Number(value || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const cents = value => Math.round((Number(value) || 0) * 100) / 100;
  const dateLabel = iso => {
    const date = new Date(iso);
    return Number.isNaN(date.getTime()) ? "Sin fecha" : date.toLocaleDateString("es", { day: "numeric", month: "short", year: "numeric" });
  };

  // Each board keeps its own records; total = what the card shows, received = what was paid.
  function lookup(kind, id) {
    if (kind === "invoice") {
      const record = window.TrentonControl?.records?.().find(item => item.id === id);
      if (!record) return null;
      return { record, title: `Invoice ${record.invoiceNumber || ""}`.trim(), place: record.address, total: cents(record.amount) };
    }
    const app = kind === "hours" ? window.HoursApp : window.JobApp;
    const record = app?.reports?.().find(item => item.id === id);
    if (!record) return null;
    const stored = Number(record.received || 0) + Number(record.due || 0);
    return { record, title: kind === "hours" ? "Reporte de horas" : "Reporte", place: record.jobAddress, total: cents(stored) };
  }

  let panel = null;
  const urls = [];
  function build() {
    panel = document.createElement("div");
    panel.className = "check-viewer";
    panel.hidden = true;
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-modal", "true");
    panel.innerHTML = '<section class="check-viewer-card"><header><div><h2></h2><p></p></div><button type="button" class="check-viewer-close" aria-label="Cerrar">×</button></header><div class="check-viewer-status"></div><ul class="check-viewer-list"></ul></section>';
    document.body.appendChild(panel);
    panel.addEventListener("click", event => { if (event.target === panel || event.target.closest(".check-viewer-close")) close(); });
    document.addEventListener("keydown", event => { if (event.key === "Escape" && !panel.hidden) close(); });
  }
  function close() {
    panel.hidden = true;
    urls.splice(0).forEach(url => URL.revokeObjectURL(url));
  }

  function open(kind, id) {
    const info = lookup(kind, id);
    if (!info) return;
    if (!panel) build();
    const received = Math.min(cents(info.record.received), info.total || cents(info.record.received));
    const due = Math.max(0, cents(info.total - received));
    const state = due > 0.004 ? (received > 0 ? "partial" : "pending") : "paid";
    const stateText = { paid: "Pagado completo", partial: "Pago parcial", pending: "Pendiente de pago" }[state];
    panel.querySelector("h2").textContent = info.title;
    panel.querySelector("header p").textContent = info.place || "";
    panel.querySelector(".check-viewer-status").innerHTML = `
      <span class="cv-state is-${state}">${stateText}</span>
      <dl>
        <div><dt>Total</dt><dd>${money(info.total)}</dd></div>
        <div><dt>Recibido</dt><dd>${money(received)}</dd></div>
        <div class="${due > 0.004 ? "is-due" : ""}"><dt>Se debe</dt><dd>${money(due)}</dd></div>
      </dl>`;
    const photos = info.record.checkPhotos || [];
    const list = panel.querySelector(".check-viewer-list");
    list.innerHTML = photos.map((photo, index) => `
      <li>
        <button type="button" class="cv-thumb" data-index="${index}" aria-label="Ver foto del cheque ${index + 1}"><span>Cargando…</span></button>
        <div class="cv-info">
          <strong>Cheque ${index + 1}</strong>
          <small>${esc(dateLabel(photo.captured_at || photo.created_at))}</small>
          ${photo.note ? `<small class="cv-note">${esc(photo.note)}</small>` : ""}
          <span class="cv-saved">✓ Foto guardada</span>
        </div>
      </li>`).join("") || '<li class="cv-empty">Todavía no hay fotos de cheques.</li>';
    panel.hidden = false;
    photos.forEach(async (photo, index) => {
      const slot = list.querySelector(`.cv-thumb[data-index="${index}"]`);
      try {
        const blob = photo.blob || await window.CloudDB?.ensureCheckPhoto?.(photo);
        if (!blob || panel.hidden) return;
        const url = URL.createObjectURL(blob);
        urls.push(url);
        slot.innerHTML = `<img src="${url}" alt="">`;
        slot.addEventListener("click", () => window.open(url, "_blank", "noopener"));
      } catch (_) {
        slot.innerHTML = "<span>No se pudo abrir</span>";
      }
    });
  }

  // Capture phase: the boards also listen for clicks on their cards.
  document.addEventListener("click", event => {
    const badge = event.target.closest?.(".check-view[data-check-kind]");
    if (!badge) return;
    event.preventDefault();
    event.stopPropagation();
    open(badge.dataset.checkKind, badge.dataset.id);
  }, true);
})();

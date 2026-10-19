/* The ⋮ button on the board cards (invoices, horas, otro formato) opens a small menu:
   Ver / editar detalles, Ver PDF and Eliminar. Deleting uses each archive's own delete,
   which asks for confirmation first. */
(function () {
  "use strict";
  const tc = () => window.TrentonControl;
  const KINDS = {
    action: { kind: "invoice", list: () => tc()?.records?.() || [], archive: () => tc()?.archive },
    hoursHome: { kind: "hours", list: () => window.HoursApp?.reports?.() || [], archive: () => tc()?.hoursArchive },
    jobHome: { kind: "job", list: () => window.JobApp?.reports?.() || [], archive: () => tc()?.jobArchive }
  };
  const kindOf = button => Object.keys(KINDS).find(key => button.dataset[key] === "menu");

  function close() { document.querySelector(".card-menu-pop")?.remove(); }
  function open(button, key) {
    const info = KINDS[key];
    const record = info.list().find(item => item.id === button.dataset.id);
    if (!record) return false;
    const already = document.querySelector(".card-menu-pop")?.dataset.for === record.id;
    close();
    if (already) return true;
    const hasPdf = Boolean(record.pdfBlob || record.pdfPath);
    const menu = document.createElement("div");
    menu.className = "df-menu card-menu-pop";
    menu.dataset.for = record.id;
    menu.setAttribute("role", "menu");
    menu.innerHTML = [["edit", "Ver / editar detalles"], hasPdf && ["pdf", "Ver PDF"], ["delete", "Eliminar"]].filter(Boolean)
      .map(([task, label]) => `<button type="button" role="menuitem" data-task="${task}" class="${task === "delete" ? "is-danger" : ""}">${label}</button>`).join("");
    document.body.append(menu);
    const box = button.getBoundingClientRect();
    menu.style.top = `${box.bottom + window.scrollY + 4}px`;
    menu.style.left = `${Math.max(8, Math.min(box.right + window.scrollX - menu.offsetWidth, window.scrollX + document.documentElement.clientWidth - menu.offsetWidth - 8))}px`;
    menu.addEventListener("click", async event => {
      const item = event.target.closest("[data-task]");
      if (!item) return;
      close();
      if (item.dataset.task === "edit") { button.dataset.menuPass = "1"; button.click(); return; }
      if (item.dataset.task === "pdf") return info.archive()?.view?.(record);
      if (item.dataset.task === "delete") return info.archive()?.remove?.(record);
    });
    return true;
  }

  // Capture phase so the boards' own "open the edit window" handler does not run first.
  document.addEventListener("click", event => {
    const button = event.target.closest?.(".card-menu");
    if (!button) { if (!event.target.closest?.(".card-menu-pop")) close(); return; }
    if (button.dataset.menuPass) { delete button.dataset.menuPass; return; }
    const key = kindOf(button);
    if (!key) return;
    if (open(button, key)) { event.preventDefault(); event.stopPropagation(); }
  }, true);
  document.addEventListener("keydown", event => { if (event.key === "Escape") close(); });
  window.addEventListener("scroll", close, { passive: true });
})();

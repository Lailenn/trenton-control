/* Sliding "active" pill for the sidebar and the phone dock. It only watches which item
   has the active class (set by app.js) and moves an indicator behind it. */
(function () {
  "use strict";

  function track(container, itemSelector, activeClass, indicatorClass, horizontal) {
    if (!container) return;
    const indicator = document.createElement("span");
    indicator.className = indicatorClass;
    indicator.setAttribute("aria-hidden", "true");
    container.prepend(indicator);
    let frame = 0;
    const place = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const active = container.querySelector(`${itemSelector}.${activeClass}`);
        if (!active || !active.offsetParent) { indicator.classList.remove("is-ready"); return; }
        const box = container.getBoundingClientRect(), item = active.getBoundingClientRect();
        const x = item.left - box.left + container.scrollLeft, y = item.top - box.top + container.scrollTop;
        indicator.style.width = `${item.width}px`;
        indicator.style.height = `${item.height}px`;
        indicator.style.transform = `translate(${x}px, ${y}px)`;
        // First placement jumps; later ones slide.
        if (!indicator.classList.contains("is-ready")) {
          indicator.style.transition = "none";
          void indicator.offsetWidth;
          indicator.style.transition = "";
          indicator.classList.add("is-ready");
        }
      });
    };
    new MutationObserver(place).observe(container, { subtree: true, attributes: true, attributeFilter: ["class"] });
    // Width changes when the rail opens or closes, and when the window is resized.
    if (window.ResizeObserver) new ResizeObserver(place).observe(container);
    window.addEventListener("resize", place);
    container.closest(".sidebar")?.addEventListener("transitionend", place);
    place();
    return place;
  }

  // macOS-style sidebar on computer and tablet: always visible with names; the toggle
  // collapses it to icons only and the choice is remembered on this device.
  const COLLAPSED_KEY = "rp.sidebar.collapsed";
  const wide = () => window.innerWidth >= 600;
  function setupMacSidebar() {
    const body = document.body, sidebar = document.getElementById("sidebar"), toggle = document.getElementById("sidebarToggle");
    const sync = () => {
      body.classList.toggle("rp-mac", wide());
      if (wide()) sidebar?.classList.remove("open");
      const collapsed = body.classList.contains("rp-collapsed");
      toggle?.setAttribute("aria-expanded", String(!collapsed));
      toggle?.setAttribute("aria-label", collapsed ? "Mostrar nombres del menú" : "Contraer menú");
    };
    try { body.classList.toggle("rp-collapsed", localStorage.getItem(COLLAPSED_KEY) === "1"); } catch (_) {}
    // Capture phase: on wide screens the toggle collapses the rail instead of opening the overlay menu.
    toggle?.addEventListener("click", event => {
      if (!wide()) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const collapsed = body.classList.toggle("rp-collapsed");
      try { localStorage.setItem(COLLAPSED_KEY, collapsed ? "1" : "0"); } catch (_) {}
      sync();
    }, true);
    // Other code may still add the overlay "open" state; on wide screens the rail is always shown.
    if (sidebar) new MutationObserver(() => { if (wide() && sidebar.classList.contains("open")) sidebar.classList.remove("open"); }).observe(sidebar, { attributes: true, attributeFilter: ["class"] });
    window.addEventListener("resize", sync);
    sync();
  }

  function boot() {
    setupMacSidebar();
    track(document.querySelector("#sidebar .sidebar-scroll"), ".nav-item", "active", "nav-indicator", false);
    track(document.querySelector(".mobile-dock .dock-track"), ".dock-item", "is-active", "dock-indicator", true);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();

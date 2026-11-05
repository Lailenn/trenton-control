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

  function boot() {
    track(document.querySelector("#sidebar .sidebar-scroll"), ".nav-item", "active", "nav-indicator", false);
    track(document.querySelector(".mobile-dock .dock-track"), ".dock-item", "is-active", "dock-indicator", true);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();

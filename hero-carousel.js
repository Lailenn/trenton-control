/* Home header carousel: three cards (hours, invoices, reports) that rotate in 3D.
   Arrows, dots, swipe and keyboard move it; it advances by itself while visible and stops
   while the pointer is over it. Clicking the front card opens its section. Quick action
   buttons beside "Nueva invoice" are handled here too. */
(function () {
  "use strict";
  const calm = () => Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
  const go = target => {
    const app = window.TrentonControl;
    if (!app) return;
    if (target === "upload") {
      // Opens the PDF editor and its file picker.
      app.navClick("editor");
      setTimeout(() => document.querySelector('#editorView [data-lib="upload"]')?.click(), 250);
      return;
    }
    app.navClick(target);
  };

  function boot() {
    const root = document.querySelector(".hc");
    if (!root) return;
    const cards = [...root.querySelectorAll(".hc-card")], dots = [...root.querySelectorAll(".hc-dots button")];
    const n = cards.length;
    let index = 1, timer = 0, paused = false, visible = true;

    function paint() {
      cards.forEach((card, i) => {
        const pos = ((i - index) % n + n) % n; // 0 front, 1 right, n-1 left
        const role = pos === 0 ? "is-front" : pos === 1 ? "is-right" : "is-left";
        const was = card.classList.contains("is-front");
        card.classList.remove("is-front", "is-right", "is-left");
        card.classList.add(role);
        card.setAttribute("aria-hidden", String(pos !== 0));
        card.tabIndex = pos === 0 ? 0 : -1;
        // Replays the card's own animation each time it comes to the front.
        if (role === "is-front" && !was) { card.classList.remove("is-play"); void card.offsetWidth; card.classList.add("is-play"); }
      });
      dots.forEach((d, i) => { d.classList.toggle("is-on", i === index); d.setAttribute("aria-selected", String(i === index)); });
    }
    const move = step => { index = ((index + step) % n + n) % n; paint(); restart(); };
    const to = i => { index = i; paint(); restart(); };
    function restart() {
      clearInterval(timer);
      if (calm() || paused || !visible) return;
      timer = setInterval(() => { index = (index + 1) % n; paint(); }, 5500);
    }

    root.querySelector(".hc-prev").addEventListener("click", () => move(-1));
    root.querySelector(".hc-next").addEventListener("click", () => move(1));
    dots.forEach((d, i) => d.addEventListener("click", () => to(i)));
    cards.forEach((card, i) => card.addEventListener("click", () => {
      if (card.classList.contains("is-front")) go(card.dataset.go);
      else to(i);
    }));
    root.addEventListener("keydown", e => {
      if (e.key === "ArrowLeft") { e.preventDefault(); move(-1); }
      if (e.key === "ArrowRight") { e.preventDefault(); move(1); }
      if ((e.key === "Enter" || e.key === " ") && e.target.classList.contains("hc-card")) { e.preventDefault(); go(e.target.dataset.go); }
    });
    root.addEventListener("pointerenter", () => { paused = true; restart(); });
    root.addEventListener("pointerleave", () => { paused = false; restart(); });
    // Swipe on touch screens.
    let sx = null, sy = 0;
    root.addEventListener("touchstart", e => { sx = e.touches[0].clientX; sy = e.touches[0].clientY; }, { passive: true });
    root.addEventListener("touchend", e => {
      if (sx == null) return;
      const dx = e.changedTouches[0].clientX - sx, dy = e.changedTouches[0].clientY - sy;
      sx = null;
      if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) move(dx < 0 ? 1 : -1);
    }, { passive: true });
    // Tilt toward the pointer on the front card.
    root.addEventListener("pointermove", e => {
      if (calm() || e.pointerType === "touch") return;
      const front = root.querySelector(".hc-card.is-front");
      if (!front) return;
      const r = front.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - .5, y = (e.clientY - r.top) / r.height - .5;
      front.style.setProperty("--tx", `${(x * 8).toFixed(2)}deg`);
      front.style.setProperty("--ty", `${(-y * 8).toFixed(2)}deg`);
    });
    root.addEventListener("pointerleave", () => root.querySelectorAll(".hc-card").forEach(c => { c.style.removeProperty("--tx"); c.style.removeProperty("--ty"); }));
    if ("IntersectionObserver" in window) new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; restart(); }).observe(root);
    document.addEventListener("visibilitychange", () => { visible = !document.hidden; restart(); });

    document.querySelectorAll("[data-hero-go]").forEach(b => b.addEventListener("click", () => go(b.dataset.heroGo)));
    paint();
    restart();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();

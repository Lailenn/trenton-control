/* Motion system: shared timings plus the interactions that report real state.
   - Top progress bar while the app talks to the cloud (real network requests).
   - Toasts tell success / error / info apart.
   - Save buttons show loading while they are disabled by the app, then success or error.
   - Modals: fields appear in sequence on open, and the window fades out on close.
   - Collapsed sidebar: tooltip with the section name.
   - Soft light that follows the cursor on cards (glass reflection).
   - Small celebration when something moves to "Pagado".
   - Loading state (skeletons) until the first data arrives.
   No billing logic lives here: it only watches the page. */
window.RPMotion = (function () {
  "use strict";
  const calm = () => Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
  // Shared "variants": every animation in this file uses these.
  const M = {
    ease: "cubic-bezier(.2, .8, .2, 1)",
    spring: "cubic-bezier(.34, 1.4, .64, 1)",
    fast: 180, base: 280, slow: 420,
    rise: [{ opacity: 0, transform: "translateY(10px)" }, { opacity: 1, transform: "none" }],
    fadeOut: [{ opacity: 1 }, { opacity: 0 }],
    popOut: [{ opacity: 1, transform: "none", filter: "none" }, { opacity: 0, transform: "scale(.96) translateY(8px)", filter: "blur(4px)" }]
  };
  const $ = s => document.querySelector(s);

  /* ---------- 1. Network progress bar ---------- */
  const bar = document.createElement("div");
  bar.className = "rp-progress";
  bar.setAttribute("aria-hidden", "true");
  let inflight = 0, showTimer = 0, trickle = 0, width = 0;
  function barStart() {
    if (inflight++ > 0) return;
    clearTimeout(showTimer);
    // Only for requests that take a moment, so quick ones do not flash.
    showTimer = setTimeout(() => {
      if (!inflight) return;
      if (!bar.isConnected) document.body.append(bar);
      width = 12;
      bar.classList.remove("is-done");
      bar.classList.add("is-on");
      bar.style.transform = `scaleX(${width / 100})`;
      clearInterval(trickle);
      trickle = setInterval(() => { width += (90 - width) * .08; bar.style.transform = `scaleX(${width / 100})`; }, 200);
    }, 220);
  }
  function barEnd() {
    inflight = Math.max(0, inflight - 1);
    if (inflight) return;
    clearTimeout(showTimer);
    clearInterval(trickle);
    if (!bar.classList.contains("is-on")) return;
    bar.style.transform = "scaleX(1)";
    bar.classList.add("is-done");
    setTimeout(() => { if (!inflight) bar.classList.remove("is-on", "is-done"); }, 450);
  }
  const realFetch = window.fetch.bind(window);
  window.fetch = function (input, init) {
    const url = String(input?.url || input || "");
    const tracked = /supabase\.co|\/rest\/v1\/|\/storage\/v1\/|\/auth\/v1\//.test(url);
    if (!tracked) return realFetch(input, init);
    barStart();
    return realFetch(input, init).finally(barEnd);
  };

  /* ---------- 2. Toast kinds ---------- */
  const ERROR = /no se pudo|no se pudieron|error|fall[óo]|falta|inv[áa]lid|sin conexi[óo]n|no hay sesi[óo]n|supera|solo puedes|ya est[áa] guardada|vuelve a entrar|no disponible|revisa/i;
  const OK = /guardad|movid|copiad|listo|eliminad|subid|registrad|actualizad|descargad|archivad|creado|creada|cambiad|aplicad|quitad/i;
  let toastKindAt = 0, toastKind = "";
  function watchToast() {
    const toast = $("#toast");
    if (!toast) return;
    let last = "";
    // Only the text is watched: this code changes the toast's classes itself.
    new MutationObserver(() => {
      const text = toast.textContent.trim();
      if (!text) return;
      const kind = ERROR.test(text) ? "err" : OK.test(text) ? "ok" : "info";
      toast.classList.remove("rp-ok", "rp-err", "rp-info");
      toast.classList.add(`rp-${kind}`);
      toastKind = kind; toastKindAt = performance.now();
      // A new message while one is showing: a small pop so it is noticed.
      if (text !== last && toast.classList.contains("show") && !calm()) {
        toast.animate([{ transform: "scale(.96)" }, { transform: "scale(1.02)" }, { transform: "none" }], { duration: M.base, easing: M.ease });
      }
      last = text;
    }).observe(toast, { childList: true, characterData: true, subtree: true });
  }

  /* ---------- 3. Save buttons: loading -> success / error ---------- */
  let lastPress = { button: null, at: 0 };
  document.addEventListener("click", event => {
    const button = event.target.closest?.("button");
    if (button) lastPress = { button, at: performance.now() };
  }, true);
  function formErrorFor(button) {
    const scope = button.closest("form, .modal, .page-view, section");
    return [...(scope?.querySelectorAll(".form-error, [role='alert']") || [])].some(el => el.textContent.trim() && el.offsetParent !== null);
  }
  function watchButtons() {
    new MutationObserver(records => {
      records.forEach(({ target: button }) => {
        if (!(button instanceof HTMLButtonElement) || !button.matches(".button-primary, .button")) return;
        if (button.disabled) {
          // Disabled right after the user pressed it (or the paired save button): the app is working.
          if (button !== lastPress.button || performance.now() - lastPress.at > 1500 || calm()) return;
          button.classList.add("is-loading");
          button._rpStart = performance.now();
          if (!button.querySelector(".rp-spin")) button.insertAdjacentHTML("afterbegin", '<span class="rp-spin" aria-hidden="true"></span>');
        } else if (button.classList.contains("is-loading")) {
          button.classList.remove("is-loading");
          button.querySelector(".rp-spin")?.remove();
          // Read the result a moment later: the app shows its toast or form error right after.
          setTimeout(() => {
            const recentToast = toastKindAt > button._rpStart ? toastKind : "";
            const failed = recentToast === "err" || formErrorFor(button);
            const state = failed ? "is-error" : recentToast === "ok" || !recentToast ? "is-success" : "";
            if (!state) return;
            button.classList.add(state);
            setTimeout(() => button.classList.remove(state), 1400);
          }, 120);
        }
      });
    }).observe(document.body, { subtree: true, attributes: true, attributeFilter: ["disabled"] });
  }

  /* ---------- 4. Modals ---------- */
  const MODALS = ".modal-backdrop";
  function staggerFields(root) {
    if (calm()) return;
    const items = [...root.querySelectorAll(".modal-body > *, .modal-body .form-grid > *, .modal-body .hours-fields > *")]
      .filter(el => el.offsetParent !== null).slice(0, 14);
    items.forEach((el, i) => el.animate(M.rise, { duration: M.base + 60, delay: 80 + i * 35, easing: M.ease, fill: "backwards" }));
  }
  function ghostClose(backdrop) {
    if (calm()) return;
    const ghost = backdrop.cloneNode(true);
    ghost.removeAttribute("id");
    ghost.classList.remove("hidden");
    ghost.classList.add("rp-ghost");
    ghost.setAttribute("aria-hidden", "true");
    ghost.inert = true;
    document.body.append(ghost);
    ghost.animate(M.fadeOut, { duration: M.base, easing: M.ease, fill: "forwards" });
    const panel = ghost.querySelector(".modal");
    panel?.animate(M.popOut, { duration: M.base, easing: M.ease, fill: "forwards" });
    setTimeout(() => ghost.remove(), M.base + 40);
  }
  function watchModals() {
    document.querySelectorAll(MODALS).forEach(backdrop => {
      let open = !backdrop.classList.contains("hidden");
      new MutationObserver(() => {
        const now = !backdrop.classList.contains("hidden");
        if (now === open) return;
        open = now;
        if (now) staggerFields(backdrop); else ghostClose(backdrop);
      }).observe(backdrop, { attributes: true, attributeFilter: ["class"] });
    });
  }

  /* ---------- 5. Collapsed sidebar tooltip ---------- */
  function watchSidebarTips() {
    const sidebar = $("#sidebar");
    if (!sidebar) return;
    const tip = document.createElement("div");
    tip.className = "rp-tip";
    tip.setAttribute("role", "tooltip");
    document.body.append(tip);
    let current = null;
    const hide = () => { current = null; tip.classList.remove("is-on"); };
    sidebar.addEventListener("pointerover", event => {
      const item = event.target.closest(".nav-item, .sidebar-logout, .sidebar-sync, .sidebar-profile");
      const collapsed = !sidebar.classList.contains("open") && window.innerWidth >= 600;
      if (!item || !collapsed || event.pointerType === "touch") return hide();
      if (item === current) return;
      current = item;
      const label = item.querySelector(".nav-title")?.textContent || item.querySelector(".sidebar-sync-copy strong")?.textContent || item.querySelector("#sidebarProfileName")?.textContent || item.textContent;
      tip.textContent = label.replace(/\s+/g, " ").trim();
      const r = item.getBoundingClientRect(), side = sidebar.getBoundingClientRect();
      tip.style.left = `${side.right + 10}px`;
      tip.style.top = `${r.top + r.height / 2}px`;
      tip.classList.remove("is-on");
      void tip.offsetWidth;
      tip.classList.add("is-on");
    });
    sidebar.addEventListener("pointerleave", hide);
    sidebar.addEventListener("click", hide);
    window.addEventListener("scroll", hide, { passive: true });
  }

  /* ---------- 6. Light that follows the cursor (glass reflection) ---------- */
  const LIT = ".ds-card, .df-card, .stat-card, .b-card, .archive-card, .board-section .invoice-card:not(.rp-fly), .pr-card-sum";
  function watchLight() {
    if (!window.matchMedia?.("(hover: hover)").matches) return;
    let lit = null;
    document.addEventListener("pointermove", event => {
      const card = event.target.closest?.(LIT);
      if (card !== lit) {
        lit?.classList.remove("rp-lit");
        lit = card;
        if (!card || calm()) return;
        card.classList.add("rp-lit-host", "rp-lit");
        if (!card.querySelector(":scope > .rp-light")) card.insertAdjacentHTML("beforeend", '<span class="rp-light" aria-hidden="true"></span>');
      }
      if (!card) return;
      const r = card.getBoundingClientRect();
      card.style.setProperty("--mx", `${event.clientX - r.left}px`);
      card.style.setProperty("--my", `${event.clientY - r.top}px`);
    }, { passive: true });
  }

  /* ---------- 7. Celebration when something is paid ---------- */
  const COLORS = ["#007aff", "#62b581", "#e9a63d", "#9570ed", "#34c759"];
  function celebrate(card) {
    if (calm() || !card) return;
    const r = card.getBoundingClientRect();
    if (!r.width) return;
    const layer = document.createElement("div");
    layer.className = "rp-confetti";
    layer.setAttribute("aria-hidden", "true");
    document.body.append(layer);
    const cx = r.left + r.width / 2, cy = r.top + 18;
    for (let i = 0; i < 18; i++) {
      const p = document.createElement("i");
      const angle = -Math.PI / 2 + (Math.random() - .5) * Math.PI * 1.1, speed = 70 + Math.random() * 70;
      const dx = Math.cos(angle) * speed, dy = Math.sin(angle) * speed;
      p.style.cssText = `left:${cx}px;top:${cy}px;background:${COLORS[i % COLORS.length]};${i % 3 ? "" : "border-radius:50%;"}`;
      layer.append(p);
      p.animate([
        { transform: "translate(-50%, -50%) scale(.6) rotate(0deg)", opacity: 1 },
        { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(1) rotate(${Math.random() * 360}deg)`, opacity: 1, offset: .55 },
        { transform: `translate(calc(-50% + ${dx * 1.2}px), calc(-50% + ${dy + 80}px)) scale(.8) rotate(${Math.random() * 540}deg)`, opacity: 0 }
      ], { duration: 950 + Math.random() * 300, easing: "cubic-bezier(.2, .7, .4, 1)", fill: "forwards" });
    }
    card.animate([{ boxShadow: "0 0 0 0 rgba(52, 199, 89, .5)" }, { boxShadow: "0 0 0 14px rgba(52, 199, 89, 0)" }], { duration: 900, easing: "ease-out" });
    setTimeout(() => layer.remove(), 1400);
  }

  /* ---------- 8. Loading state until the first data arrives ---------- */
  function watchReady() {
    const root = document.documentElement;
    const ready = () => window.TrentonControl?.isReady?.();
    if (ready()) return;
    root.classList.add("rp-loading");
    const done = () => {
      if (!ready()) return false;
      root.classList.remove("rp-loading");
      return true;
    };
    const board = $("#board");
    if (board) {
      const observer = new MutationObserver(() => { if (done()) observer.disconnect(); });
      observer.observe(board, { childList: true });
    }
    // Safety net: never keep skeletons for more than 20 s.
    setTimeout(() => root.classList.remove("rp-loading"), 20000);
  }

  function boot() { watchToast(); watchButtons(); watchModals(); watchSidebarTips(); watchLight(); watchReady(); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
  return { celebrate, variants: M };
})();

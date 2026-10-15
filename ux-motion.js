/* Motion layer: animates cards that change stage, counts indicators up to their new
   value and gives buttons a press response. It only watches the DOM; no data logic. */
(function () {
  "use strict";
  const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)");
  const calm = () => Boolean(reduceMotion?.matches);

  // ---- 1. Cards that move to another stage (or appear) animate in their new column ----
  const BOARDS = ["board", "hoursHomeBoard", "jobHomeBoard"];
  const cardKey = card => card.dataset.id || card.dataset.hoursId || card.dataset.jobId || "";

  function watchBoard(boardId) {
    const board = document.getElementById(boardId);
    if (!board) return;
    let stages = null; // card id -> stage, from the previous render
    const snapshot = () => {
      const next = new Map();
      board.querySelectorAll(".kanban-column").forEach(column => {
        column.querySelectorAll(".invoice-card").forEach(card => {
          const key = cardKey(card);
          if (key) next.set(key, column.dataset.stage || "");
        });
      });
      return next;
    };
    const animate = () => {
      const next = snapshot();
      if (stages && !calm()) {
        board.querySelectorAll(".kanban-column").forEach(column => {
          column.querySelectorAll(".invoice-card").forEach(card => {
            const key = cardKey(card);
            if (!key) return;
            const before = stages.get(key);
            if (before == null) card.classList.add("motion-card-new");
            else if (before !== (column.dataset.stage || "")) {
              card.classList.add("motion-card-moved");
              const count = column.querySelector(".column-count");
              count?.classList.remove("motion-bump");
              void count?.offsetWidth;
              count?.classList.add("motion-bump");
              const tab = board.closest(".board-section")?.querySelector(`.board-tab[data-stage="${CSS.escape(column.dataset.stage || "")}"]`);
              tab?.classList.add("motion-tab-ping");
              setTimeout(() => tab?.classList.remove("motion-tab-ping"), 900);
            }
          });
        });
      }
      stages = next;
    };
    new MutationObserver(animate).observe(board, { childList: true });
    animate();
  }

  // ---- 2. Indicators count to their new value ----
  const COUNTERS = [
    "#statTotal", "#statWorking", "#statWaiting", "#statPaid",
    "#archiveCount", "#archiveTotal", "#archivePaid", "#archivePending",
    "#hoursArchiveCount", "#hoursArchiveHours", "#hoursArchivePay",
    "#jobArchiveCount", "#jobArchiveHours", "#jobArchivePay"
  ];
  const ownText = new WeakMap(); // element -> text this file wrote (its own mutations are ignored)
  const shown = new WeakMap();   // element -> number currently on screen
  const target = new WeakMap();  // element -> value the app last set
  const runs = new WeakMap();    // element -> id of the running count (a newer one cancels it)
  function write(element, text) {
    ownText.set(element, text);
    element.textContent = text;
  }

  function parseShape(text) {
    const match = String(text).match(/^(\D*?)(-?[\d,]+(?:\.\d+)?)(\D*)$/);
    if (!match) return null;
    const digits = match[2];
    return {
      prefix: match[1],
      suffix: match[3],
      value: Number(digits.replace(/,/g, "")),
      decimals: digits.includes(".") ? digits.split(".")[1].length : 0,
      grouped: digits.includes(",")
    };
  }
  function format(shape, value) {
    const number = value.toLocaleString("en-US", {
      minimumFractionDigits: shape.decimals,
      maximumFractionDigits: shape.decimals,
      useGrouping: shape.grouped || Math.abs(value) >= 1000
    });
    return `${shape.prefix}${number}${shape.suffix}`;
  }
  function countTo(element, from, shape) {
    const goal = shape.value;
    const id = (runs.get(element) || 0) + 1;
    runs.set(element, id);
    const start = performance.now();
    const duration = 650;
    element.classList.add("motion-counting");
    const step = now => {
      if (runs.get(element) !== id) return; // a newer change took over
      // The frame timestamp can be slightly earlier than `start`; clamp so the count never dips below `from`.
      const t = Math.min(1, Math.max(0, (now - start) / duration));
      const eased = 1 - Math.pow(1 - t, 3);
      const value = t < 1 ? from + (goal - from) * eased : goal;
      shown.set(element, value);
      write(element, format(shape, value));
      if (t < 1) requestAnimationFrame(step);
      else element.classList.remove("motion-counting");
    };
    requestAnimationFrame(step);
  }
  function watchCounter(selector) {
    const element = document.querySelector(selector);
    if (!element) return;
    const initial = parseShape(element.textContent.trim());
    if (initial) { shown.set(element, initial.value); target.set(element, initial.value); }
    new MutationObserver(() => {
      const text = element.textContent;
      if (text === ownText.get(element)) return;
      const shape = parseShape(text.trim());
      if (!shape) return;
      const from = shown.get(element);
      const changed = target.get(element) !== shape.value;
      target.set(element, shape.value);
      if (!changed && element.classList.contains("motion-counting") && !calm()) {
        write(element, format(shape, shown.get(element))); // same value re-rendered: keep counting
        return;
      }
      if (from == null || !changed || from === shape.value || calm() || element.offsetParent === null) {
        runs.set(element, (runs.get(element) || 0) + 1); // stop any running count
        shown.set(element, shape.value);
        element.classList.remove("motion-counting");
        return;
      }
      // Put the on-screen value back before the next paint so the count starts from it (no flash).
      write(element, format(shape, from));
      countTo(element, from, shape);
    }).observe(element, { childList: true, characterData: true, subtree: true });
  }

  // ---- 3. Press response for buttons on touch screens (hover is in CSS) ----
  const PRESSABLE = ".button, .dock-item, .dock-avatar, .board-tab, .add-card-button, .card-menu, .nav-item, .dash-link, .login-passkey, .profile-close";
  document.addEventListener("pointerdown", event => {
    const target = event.target.closest?.(PRESSABLE);
    if (!target || target.disabled || calm()) return;
    target.classList.add("motion-pressed");
    const release = () => target.classList.remove("motion-pressed");
    window.addEventListener("pointerup", release, { once: true });
    window.addEventListener("pointercancel", release, { once: true });
  }, { passive: true });

  // ---- 4. The hero illustration only animates while it is on screen ----
  function watchHeroArt() {
    const art = document.querySelector(".hero-art2");
    if (!art || !("IntersectionObserver" in window)) return;
    new IntersectionObserver(([entry]) => art.classList.toggle("is-offscreen", !entry.isIntersecting)).observe(art);
  }

  // ---- 5. Board columns show their scrollbar only while being scrolled (hover is in CSS) ----
  const scrollTimers = new WeakMap();
  document.addEventListener("scroll", event => {
    const list = event.target;
    if (!(list instanceof Element) || !list.classList.contains("column-cards")) return;
    list.classList.add("is-scrolling");
    clearTimeout(scrollTimers.get(list));
    scrollTimers.set(list, setTimeout(() => list.classList.remove("is-scrolling"), 900));
  }, { capture: true, passive: true });

  function start() {
    BOARDS.forEach(watchBoard);
    COUNTERS.forEach(watchCounter);
    watchHeroArt();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();

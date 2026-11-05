/* Page and board motion (no data logic):
   1. Entering a view: its blocks appear one after another.
   2. Board cards move like physical cards: a dropped card waits where it was released and
      flies to its new column once the move is saved; the other cards slide to their new places. */
(function () {
  "use strict";
  const calm = () => Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
  const SPRING = "cubic-bezier(.2, .9, .3, 1.12)";
  const EASE = "cubic-bezier(.2, .8, .2, 1)";

  /* ---------- 1. Entrance ---------- */
  const BOARD_BLOCKS = [".dash-hero", ".dash-stats .ds-card, .stats-grid .stat-card", ".board-section", ".dash-files .df-card"];
  function blocksOf(view) {
    if (view.id === "boardView") {
      return BOARD_BLOCKS.flatMap(selector => [...view.querySelectorAll(selector)]).filter(el => el.offsetParent !== null);
    }
    return [...view.children].filter(el => el.offsetParent !== null);
  }
  function enter(view) {
    if (calm()) return;
    blocksOf(view).slice(0, 14).forEach((el, i) => {
      el.animate(
        [{ opacity: 0, transform: "translateY(16px) scale(.985)" }, { opacity: 1, transform: "none" }],
        { duration: 460, delay: Math.min(i, 10) * 60, easing: EASE, fill: "backwards" }
      );
    });
    if (view.id === "boardView") window.UxMotion?.recount?.();
  }
  function watchViews() {
    if (!("IntersectionObserver" in window)) return;
    document.querySelectorAll(".page-view").forEach(view => {
      let shown = false;
      new IntersectionObserver(([entry]) => {
        if (entry.isIntersecting && !shown) enter(view);
        shown = entry.isIntersecting;
      }).observe(view);
    });
  }

  /* ---------- 2. Board cards ---------- */
  const BOARDS = ["board", "hoursHomeBoard", "jobHomeBoard", "hoursBoard"];
  const keyOf = card => card.dataset.id || card.dataset.hoursId || card.dataset.jobId || "";
  const stageOf = card => card.closest(".kanban-column")?.dataset.stage || "";
  const CARD = ".invoice-card:not(.rp-fly)";
  const positions = new Map(); // board -> Map(key -> {x, y, w, stage}) in page coordinates
  let drag = null;    // { board, card, key, offX, offY }
  let flying = null;  // { board, key, clone, timer }

  function snapshot(board) {
    const map = new Map();
    board.querySelectorAll(CARD).forEach(card => {
      if (card.offsetParent === null) return;
      const r = card.getBoundingClientRect();
      map.set(keyOf(card), { x: r.left + scrollX, y: r.top + scrollY, w: r.width, stage: stageOf(card) });
    });
    positions.set(board, map);
  }
  const snapAll = () => BOARDS.forEach(id => { const b = document.getElementById(id); if (b) snapshot(b); });

  // The copy lives inside its board (so the board styles still apply) in a wrapper that takes no space.
  function makeClone(card, board, left, top, width) {
    const host = document.createElement("div");
    host.className = "rp-fly-host";
    host.style.setProperty("display", "contents", "important");
    const list = document.createElement("div");
    list.className = "column-cards";
    list.style.setProperty("display", "contents", "important");
    const clone = card.cloneNode(true);
    clone.removeAttribute("id");
    clone.classList.remove("dragging", "motion-card-moved", "motion-card-new");
    clone.classList.add("rp-fly");
    clone.setAttribute("aria-hidden", "true");
    clone.style.width = `${width}px`;
    list.append(clone);
    host.append(list);
    board.append(host);
    clone._host = host;
    place(clone, left, top);
    return clone;
  }
  // Viewport position of the clone's containing block (fixed is not always relative to the window).
  function origin(clone) {
    const r = clone.getBoundingClientRect();
    return { x: r.left - (parseFloat(clone.style.left) || 0), y: r.top - (parseFloat(clone.style.top) || 0) };
  }
  function place(clone, left, top) {
    clone.style.left = "0px"; clone.style.top = "0px";
    const o = origin(clone);
    clone.style.left = `${left - o.x}px`; clone.style.top = `${top - o.y}px`;
    clone._vx = left; clone._vy = top;
  }
  const drop = clone => clone._host?.remove();
  // Moves a floating clone onto `card` (or fades it out if the card is not on screen).
  function land(clone, card, duration = 620, celebrate = false) {
    // A board redraw may have removed the copy: put it back where it was.
    if (!clone.isConnected && card) { card.closest(".board")?.append(clone._host); place(clone, clone._vx, clone._vy); }
    const to = card && card.offsetParent !== null ? card.getBoundingClientRect() : null;
    if (!to || !to.width) {
      clone.animate([{ opacity: 1 }, { opacity: 0, transform: "scale(.9)" }], { duration: 260, easing: EASE, fill: "forwards" }).onfinish = () => drop(clone);
      return;
    }
    clone.classList.remove("is-waiting");
    const o = origin(clone), from = clone.getBoundingClientRect();
    card.style.visibility = "hidden";
    clone.animate([
      { left: `${from.left - o.x}px`, top: `${from.top - o.y}px`, width: `${from.width}px`, transform: "rotate(-1.5deg) scale(1.03)" },
      { left: `${to.left - o.x}px`, top: `${to.top - o.y}px`, width: `${to.width}px`, transform: "none" }
    ], { duration, easing: SPRING, fill: "forwards" }).onfinish = () => {
      card.style.visibility = "";
      drop(clone);
      if (celebrate) window.RPMotion?.celebrate?.(card);
      card.animate([{ boxShadow: "0 0 0 0 rgba(var(--blue-rgb), .4)" }, { boxShadow: "0 0 0 12px rgba(var(--blue-rgb), 0)" }], { duration: 700, easing: "ease-out" });
    };
  }

  // Records that still exist for a board (to tell a deleted card from a filtered one).
  function recordIds(board) {
    const list = board.id === "board" ? window.TrentonControl?.records?.() : board.id === "jobHomeBoard" ? window.JobApp?.reports?.() : window.HoursApp?.reports?.();
    return list ? new Set(list.map(r => r.id)) : null;
  }
  // Deleted cards leave with a short shrink-and-fade from where they were.
  function exitDeleted(board, old, removed) {
    const ids = recordIds(board);
    if (!ids) return;
    removed.forEach(card => {
      const key = keyOf(card), before = old.get(key);
      if (!key || ids.has(key) || !before || !before.w) return;
      const ghost = makeClone(card, board, before.x - scrollX, before.y - scrollY, before.w);
      ghost.classList.add("rp-leaving");
      ghost.animate([
        { opacity: 1, transform: "none", filter: "none" },
        { opacity: 0, transform: "scale(.86) translateY(8px)", filter: "blur(4px)" }
      ], { duration: 380, easing: EASE, fill: "forwards" }).onfinish = () => drop(ghost);
    });
  }

  function onRender(board, removed = []) {
    const old = positions.get(board) || new Map();
    if (!calm()) {
      exitDeleted(board, old, removed);
      board.querySelectorAll(CARD).forEach(card => {
        if (card.offsetParent === null) return;
        const key = keyOf(card);
        if (flying && flying.board === board && flying.key === key) {
          // Still in its old column: the save has not finished yet, keep it floating.
          if (stageOf(card) === flying.origin) return;
          clearTimeout(flying.timer);
          land(flying.clone, card, 620, stageOf(card) === "paid");
          flying = null;
          return;
        }
        const before = old.get(key);
        if (!before || !before.w) return;
        const now = card.getBoundingClientRect();
        const fromLeft = before.x - scrollX, fromTop = before.y - scrollY;
        if (before.stage !== stageOf(card)) {
          // Moved to another column (menu or buttons): a copy travels across, not clipped by the columns.
          land(makeClone(card, board, fromLeft, fromTop, before.w), card, 560, stageOf(card) === "paid");
          return;
        }
        const dx = fromLeft - now.left, dy = fromTop - now.top;
        if (Math.abs(dx) < 2 && Math.abs(dy) < 2) return;
        if (Math.abs(dy) > innerHeight) return;
        card.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }], { duration: 420, easing: EASE });
      });
    }
    snapshot(board);
  }
  function goHome() {
    if (!flying) return;
    const { clone, board, key } = flying;
    flying = null;
    const card = [...board.querySelectorAll(CARD)].find(c => keyOf(c) === key);
    land(clone, card, 480);
  }

  function watchBoards() {
    BOARDS.forEach(id => {
      const board = document.getElementById(id);
      if (!board) return;
      // Ignore the floating copy coming and going; react only to real redraws.
      const own = node => node.nodeType === 1 && node.classList.contains("rp-fly-host");
      new MutationObserver(records => {
        if (records.every(r => [...r.addedNodes, ...r.removedNodes].every(own))) return;
        const removed = records.flatMap(r => [...r.removedNodes]).filter(n => n.nodeType === 1 && !own(n))
          .flatMap(n => n.matches(".invoice-card") ? [n] : [...n.querySelectorAll(".invoice-card")]);
        onRender(board, removed);
      }).observe(board, { childList: true });
      snapshot(board);
    });
    // Fresh positions right before any user action that may move cards.
    document.addEventListener("pointerdown", event => { if (event.target.closest?.(".board, .kanban-column, .board-section")) snapAll(); }, { capture: true, passive: true });
    let t = 0;
    const later = () => { clearTimeout(t); t = setTimeout(snapAll, 150); };
    window.addEventListener("scroll", later, { passive: true });
    document.addEventListener("scroll", event => { if (event.target instanceof Element && event.target.closest(".board")) later(); }, { capture: true, passive: true });
    window.addEventListener("resize", later);

    document.addEventListener("dragstart", event => {
      const card = event.target.closest?.(".invoice-card");
      const board = card?.closest(".board");
      if (!card || !board || !BOARDS.includes(board.id)) return;
      const r = card.getBoundingClientRect();
      drag = { board, card, key: keyOf(card), offX: event.clientX - r.left, offY: event.clientY - r.top, w: r.width };
      snapshot(board);
    }, true);
    document.addEventListener("drop", event => {
      if (!drag || calm()) return;
      const column = event.target.closest?.(".kanban-column");
      if (!column || !drag.board.contains(column) || column.dataset.stage === stageOf(drag.card)) return;
      if (flying) { clearTimeout(flying.timer); drop(flying.clone); }
      // The card stays where it was released, lifted, until the move is saved.
      const clone = makeClone(drag.card, drag.board, event.clientX - drag.offX, event.clientY - drag.offY, drag.w);
      clone.classList.add("is-waiting");
      flying = { board: drag.board, key: drag.key, origin: stageOf(drag.card), clone, timer: setTimeout(goHome, 3500) };
    }, true);
    document.addEventListener("dragend", () => { drag = null; }, true);
    // A failed move shows a toast without redrawing the board: return the card right away.
    const toast = document.getElementById("toast");
    if (toast) new MutationObserver(() => {
      if (flying && !/^Movid[ao]/i.test(toast.textContent.trim())) { clearTimeout(flying.timer); goHome(); }
    }).observe(toast, { childList: true, characterData: true, subtree: true });
  }

  function boot() { watchViews(); watchBoards(); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();

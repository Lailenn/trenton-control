/* Home stat cards: trend badge and a small animated chart per card, built from the real invoices.
   Charts cover the last 8 months by invoice date; the badges only count recent real activity. */
window.DashStats = (function () {
  "use strict";
  const MONTHS = 8;
  const $ = selector => document.querySelector(selector);
  const isoDate = value => /^\d{4}-\d{2}-\d{2}/.test(String(value || "")) ? String(value).slice(0, 10) : "";
  const monthKey = date => date.slice(0, 7);
  const amountOf = record => Number(record.amount) || 0;
  // Paid money = what was actually collected (a partial payment counts only its received part).
  const collectedOf = record => window.InvoiceCore?.collected ? window.InvoiceCore.collected(record) / 100 : amountOf(record);
  const dateOf = record => isoDate(record.issuedDate) || isoDate(record.invoiceData?.issuedDate) || isoDate(record.updatedAt);
  const daysAgo = value => (Date.now() - new Date(value).getTime()) / 86400000;
  const compactMoney = value => "$" + Math.round(value).toLocaleString("en-US");

  function lastMonths() {
    const now = new Date();
    return Array.from({ length: MONTHS }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (MONTHS - 1 - i), 1);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    });
  }
  function series(records, pick, measure) {
    const months = lastMonths();
    const sums = new Map(months.map(month => [month, 0]));
    records.filter(pick).forEach(record => {
      const key = monthKey(dateOf(record));
      if (sums.has(key)) sums.set(key, sums.get(key) + measure(record));
    });
    return months.map(month => sums.get(month));
  }

  // Values -> 0..1 heights; an empty series stays as a low, calm baseline.
  function scale(values) {
    const max = Math.max(...values, 0);
    return values.map(value => max > 0 ? .12 + .88 * (value / max) : .12);
  }
  function smoothPath(points) {
    return points.reduce((path, [x, y], i) => {
      if (!i) return `M${x},${y}`;
      const [x0, y0] = points[i - 1], [xp, yp] = points[i - 2] || points[i - 1], [xn, yn] = points[i + 1] || [x, y];
      const c1 = [x0 + (x - xp) / 6, y0 + (y - yp) / 6], c2 = [x - (xn - x0) / 6, y - (yn - y0) / 6];
      return `${path} C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${x},${y.toFixed(1)}`;
    }, "");
  }
  function lineMarkup(heights, id) {
    const w = 300, h = 100, pad = 6;
    const points = heights.map((v, i) => [Math.round(pad + i * (w - pad * 2) / (heights.length - 1)), h - 4 - v * (h - 14)]);
    const line = smoothPath(points);
    const [lx, ly] = points[points.length - 1];
    return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">
        <defs><linearGradient id="${id}-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="currentColor" stop-opacity=".26"/><stop offset="1" stop-color="currentColor" stop-opacity="0"/></linearGradient></defs>
        <path class="ds-area" d="${line} L${lx},${h} L${points[0][0]},${h} Z" fill="url(#${id}-fill)"/>
        <path class="ds-stroke" d="${line}" pathLength="1" vector-effect="non-scaling-stroke"/>
      </svg>
      <i class="ds-dot" style="left:${(lx / w * 100).toFixed(2)}%;top:${(ly / h * 100).toFixed(2)}%"></i>`;
  }
  function barsMarkup(heights, withLine, id) {
    const bars = heights.map((v, i) => `<i class="ds-bar${i >= heights.length - 3 ? " is-recent" : ""}" style="--h:${(v * 100).toFixed(1)}%;--i:${i}"></i>`).join("");
    return `<span class="ds-bar-row">${bars}</span>${withLine ? `<span class="ds-bar-line">${lineMarkup(heights, id)}</span>` : ""}`;
  }

  function paintChart(element, values, kind) {
    if (!element) return;
    const signature = values.join(",");
    if (element.dataset.sig === signature) return;
    element.dataset.sig = signature;
    const heights = scale(values);
    element.innerHTML = kind === "line" ? lineMarkup(heights, element.id) : barsMarkup(heights, kind === "bars-line", element.id);
    play(element.closest(".ds-card"));
  }
  function paintTrend(element, text, title, down) {
    if (!element) return;
    element.hidden = !text;
    element.classList.toggle("is-down", Boolean(down));
    element.title = title || "";
    element.innerHTML = text ? `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${down ? "M12 5v14M6 13l6 6 6-6" : "M12 19V5M6 11l6-6 6 6"}"/></svg>${text}` : "";
  }

  // Restart the entry animation (bars grow, line draws) when data changes or the home view reappears.
  function play(card) {
    if (!card || card.offsetParent === null) return;
    card.classList.remove("ds-play");
    void card.offsetWidth;
    card.classList.add("ds-play");
  }
  let wasHidden = true;
  function watchVisibility() {
    const grid = $(".dash-stats");
    if (!grid || !("IntersectionObserver" in window)) { document.querySelectorAll(".ds-card").forEach(card => card.classList.add("ds-play")); return; }
    new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) { wasHidden = grid.offsetParent === null; return; }
      if (wasHidden) grid.querySelectorAll(".ds-card").forEach(play);
      wasHidden = false;
    }, { threshold: .15 }).observe(grid);
  }

  function render(records) {
    const list = Array.isArray(records) ? records : [];
    const thisMonth = monthKey(new Date().toISOString().slice(0, 10));
    const working = record => record.stage === "working", waiting = record => record.stage === "waiting", paid = record => record.stage === "paid";

    paintChart($("#chartTotal"), series(list, () => true, () => 1), "line");
    paintChart($("#chartWorking"), series(list, working, () => 1), "bars");
    paintChart($("#chartWaiting"), series(list, waiting, amountOf), "line");
    paintChart($("#chartPaid"), series(list, paid, collectedOf), "bars-line");

    const newThisMonth = list.filter(record => monthKey(dateOf(record)) === thisMonth).length;
    paintTrend($("#trendTotal"), newThisMonth ? `+${newThisMonth}` : "", `${newThisMonth} con fecha de este mes`);
    const recent = pick => list.filter(record => pick(record) && record.updatedAt && daysAgo(record.updatedAt) <= 7).length;
    const movedWorking = recent(working), movedWaiting = recent(waiting);
    paintTrend($("#trendWorking"), movedWorking ? `+${movedWorking}` : "", `${movedWorking} en los últimos 7 días`);
    paintTrend($("#trendWaiting"), movedWaiting ? `+${movedWaiting}` : "", `${movedWaiting} en los últimos 7 días`);
    const paidThisMonth = list.filter(record => paid(record) && record.paidAt && monthKey(isoDate(record.paidAt)) === thisMonth).reduce((sum, record) => sum + collectedOf(record), 0);
    paintTrend($("#trendPaid"), paidThisMonth ? `+${compactMoney(paidThisMonth)}` : "", "Cobrado este mes");
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", watchVisibility);
  else watchVisibility();
  return { render };
})();

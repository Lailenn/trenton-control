/* Home insights: monthly chart (billed vs collected) and overdue payment reminders.
   Billed = total by the document's own month. Collected = how much of that has been paid
   (paid in full, or the partial amount received), shown in the same month. Reminders (the Notificaciones panel)
   list invoices and reports still in "Esperando cheque" more than 30 days after their date. Also adds the
   action buttons used by empty states ([data-go-nav], [data-click]). */
(function () {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const esc = v => String(v ?? "").replace(/[&<>'"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#039;", '"': "&quot;" }[c]));
  const money = n => "$" + (Number(n) || 0).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  const money2 = n => "$" + (Number(n) || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const short = v => v >= 1000 ? "$" + (v / 1000).toFixed(v % 1000 ? 1 : 0) + "k" : "$" + Math.round(v);
  const lang = () => (document.documentElement.lang === "en" ? "en-US" : "es");
  const DAY = 864e5, LIMIT = 30;
  const remindOn = () => { try { return localStorage.getItem("rp.pref.remind") !== "0"; } catch (_) { return true; } };
  let range = 6;
  try { range = Number(localStorage.getItem("rp.chart.range")) === 12 ? 12 : 6; } catch (_) {}

  const ym = d => { const s = String(d || ""); return /^\d{4}-\d{2}/.test(s) ? s.slice(0, 7) : ""; };
  const parseDate = d => { const s = String(d || ""); if (!/^\d{4}-\d{2}-\d{2}/.test(s)) return null; const x = new Date(s.length === 10 ? s + "T12:00:00" : s); return isNaN(x) ? null : x; };
  function months(n) {
    const out = [], now = new Date();
    for (let i = n - 1; i >= 0; i--) { const d = new Date(now.getFullYear(), now.getMonth() - i, 1); out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`); }
    return out;
  }
  // Each month shows what was billed that month and how much of THAT has been collected
  // (so marking old invoices as paid later does not pile everything into one month).
  // Invoices, hours reports and the other reports are kept apart (chart tabs).
  let source = "invoices";
  try { source = ["invoices", "hours", "jobs"].includes(localStorage.getItem("rp.chart.source")) ? localStorage.getItem("rp.chart.source") : "invoices"; } catch (_) {}
  const entryHours = e => { const o = e.hoursOverride; return o !== "" && o != null && !isNaN(Number(o)) ? Number(o) : Number(e.hours) || 0; };
  const reportTotal = r => (r.entries || []).reduce((sum, e) => sum + entryHours(e) * (Number(e.rate) || Number(r.defaultRate) || 0), 0);
  const collected = (stage, total, received) => stage === "paid" ? (Number(received) > 0 ? Math.min(Number(received), total || Number(received)) : total) : Math.max(0, Number(received) || 0);
  function items() {
    if (source === "hours") return (window.HoursApp?.reports?.() || []).map(r => { const total = reportTotal(r); return { date: r.reportDate, total, paid: collected(r.stage, total, r.received) }; });
    if (source === "jobs") return (window.JobApp?.reports?.() || []).map(r => { const total = reportTotal(r); return { date: r.startDate || r.reportDate || (r.entries || [])[0]?.date, total, paid: collected(r.stage, total, r.received) }; });
    return (window.TrentonControl?.records?.() || []).filter(r => !r.deletedAt).map(r => ({ date: r.issuedDate, total: Number(r.amount) || 0, paid: collected(r.stage, Number(r.amount) || 0, r.received) }));
  }
  function series() {
    const keys = months(range), billed = Object.fromEntries(keys.map(k => [k, 0])), paid = Object.fromEntries(keys.map(k => [k, 0]));
    items().forEach(x => { const k = ym(x.date); if (k in billed) { billed[k] += x.total; paid[k] += x.paid; } });
    return keys.map(k => ({ key: k, billed: billed[k], paid: paid[k] }));
  }
  const label = k => new Date(Number(k.slice(0, 4)), Number(k.slice(5, 7)) - 1, 1).toLocaleDateString(lang(), { month: "short" }).replace(".", "");

  /* ---------- Chart ---------- */
  // Smooth curve that never overshoots the real values (monotone cubic, Fritsch–Carlson),
  // so it never dips below $0 between months.
  function smooth(pts) {
    const n = pts.length;
    if (n < 2) return "";
    const dx = [], m = [], t = new Array(n);
    for (let i = 0; i < n - 1; i++) { dx[i] = pts[i + 1][0] - pts[i][0]; m[i] = (pts[i + 1][1] - pts[i][1]) / dx[i]; }
    t[0] = m[0]; t[n - 1] = m[n - 2];
    for (let i = 1; i < n - 1; i++) t[i] = m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2;
    for (let i = 0; i < n - 1; i++) {
      if (m[i] === 0) { t[i] = 0; t[i + 1] = 0; continue; }
      const a2 = t[i] / m[i], b2 = t[i + 1] / m[i], h = a2 * a2 + b2 * b2;
      if (h > 9) { const k = 3 / Math.sqrt(h); t[i] = k * a2 * m[i]; t[i + 1] = k * b2 * m[i]; }
    }
    let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
    for (let i = 0; i < n - 1; i++) {
      const [x0, y0] = pts[i], [x1, y1] = pts[i + 1], h = dx[i] / 3;
      d += ` C${(x0 + h).toFixed(1)},${(y0 + t[i] * h).toFixed(1)} ${(x1 - h).toFixed(1)},${(y1 - t[i + 1] * h).toFixed(1)} ${x1.toFixed(1)},${y1.toFixed(1)}`;
    }
    return d;
  }
  // Bar with rounded top corners only.
  const bar = (x, yTop, w, h, r) => { if (h <= 0) return ""; r = Math.min(r, w / 2, h); return `M${x},${yTop + h}V${yTop + r}Q${x},${yTop} ${x + r},${yTop}H${x + w - r}Q${x + w},${yTop} ${x + w},${yTop + r}V${yTop + h}Z`; };
  function chartHtml(data) {
    const max = Math.max(1000, ...data.map(d => Math.max(d.billed, d.paid)));
    const nice = (() => { const p = Math.pow(10, Math.floor(Math.log10(max))); const n = max / p; return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p; })();
    const totB = data.reduce((s, d) => s + d.billed, 0), totP = data.reduce((s, d) => s + d.paid, 0), owed = Math.max(0, totB - totP);
    const phone = window.innerWidth < 640;
    const W = Math.max(280, Math.round(($("#incomeChart")?.clientWidth || 680) - (phone ? 32 : 44))), H = phone ? 190 : 240, padL = 40, padR = 8, padB = 28, padT = 14;
    const cw = (W - padL - padR) / data.length, bw = Math.max(10, Math.min(34, cw * .46));
    const y = v => padT + (H - padT - padB) * (1 - v / nice), base = H - padB;
    const nowKey = months(1)[0];
    const grid = [0, .25, .5, .75, 1].map(f => `<line x1="${padL}" x2="${W - padR}" y1="${y(nice * f).toFixed(1)}" y2="${y(nice * f).toFixed(1)}" class="in-grid${f === 0 ? " is-base" : ""}"/>${f * 4 % 2 === 0 ? `<text x="${padL - 8}" y="${(y(nice * f) + 4).toFixed(1)}" class="in-axis" text-anchor="end">${short(nice * f)}</text>` : ""}`).join("");
    const pts = data.map((d, i) => [padL + cw * i + cw / 2, y(d.paid)]);
    const line = smooth(pts), area = line ? `${line} L${pts[pts.length - 1][0]},${base} L${pts[0][0]},${base} Z` : "";
    const cols = data.map((d, i) => {
      const cx = padL + cw * i + cw / 2, hb = d.billed ? Math.max(4, base - y(d.billed)) : 0;
      return `<g class="in-col${d.key === nowKey ? " is-now" : ""}" data-i="${i}" tabindex="0" role="img" aria-label="${esc(label(d.key))}: facturado ${money2(d.billed)}, cobrado ${money2(d.paid)}">
        <rect class="in-hit" x="${(cx - cw / 2).toFixed(1)}" y="${padT}" width="${cw.toFixed(1)}" height="${base - padT}" rx="12"/>
        <path class="in-track" d="${bar(cx - bw / 2, padT, bw, base - padT, 10)}"/>
        <path class="in-bar" d="${bar(cx - bw / 2, base - hb, bw, hb, 10)}" fill="url(#inBlue)" style="--d:${i * 50}ms"/>
        <text x="${cx.toFixed(1)}" y="${H - 8}" class="in-axis in-month" text-anchor="middle">${esc(label(d.key))}</text></g>`;
    }).join("");
    const dots = pts.map(([x, yy], i) => `<circle class="in-dotp" cx="${x.toFixed(1)}" cy="${yy.toFixed(1)}" r="${phone ? 4 : 5}" style="--d:${600 + i * 50}ms" data-i="${i}"/>`).join("");
    const rate = totB ? Math.min(100, Math.round(totP / totB * 100)) : 0, R = 22, C = 2 * Math.PI * R;
    return `<div class="in-head"><span class="in-head-i"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 19.5h16M7 16V11M12 16V6.5M17 16v-7"/></svg></span><div><h3>Ingresos por mes</h3><p>Lo facturado cada mes y cuánto de eso ya se cobró</p></div>
        <div class="in-range" role="tablist" aria-label="Periodo"><button type="button" data-range="6" class="${range === 6 ? "is-on" : ""}">6 meses</button><button type="button" data-range="12" class="${range === 12 ? "is-on" : ""}">12 meses</button></div></div>
      <div class="in-source" role="tablist" aria-label="Qué mostrar">${[["invoices", "Invoices"], ["hours", "Horas"], ["jobs", "Reportes"]].map(([k, l]) => `<button type="button" role="tab" data-source="${k}" aria-selected="${source === k}" class="${source === k ? "is-on" : ""}">${l}</button>`).join("")}</div>
      <div class="in-kpis">
        <div class="in-kpi is-billed"><small><i class="in-dot is-billed"></i>Facturado</small><strong>${money2(totB)}</strong></div>
        <div class="in-kpi is-paid"><small><i class="in-dot is-paid"></i>Cobrado</small><strong>${money2(totP)}</strong></div>
        <div class="in-kpi is-owed"><small><i class="in-dot is-owed"></i>Por cobrar</small><strong>${money2(owed)}</strong></div>
        <div class="in-ring" title="Cobrado del total"><svg viewBox="0 0 56 56" aria-hidden="true"><circle cx="28" cy="28" r="${R}" class="in-ring-bg"/><circle cx="28" cy="28" r="${R}" class="in-ring-fg" style="--c:${C.toFixed(1)};--o:${(C * (1 - rate / 100)).toFixed(1)}"/></svg><span><strong>${rate}%</strong><small>cobrado</small></span></div>
      </div>
      <div class="in-plot"><svg viewBox="0 0 ${W} ${H}" class="in-svg" style="height:${H}px">
        <defs><linearGradient id="inBlue" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3d9bff"/><stop offset="1" stop-color="#007aff"/></linearGradient>
          <linearGradient id="inGreen" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#34c759" stop-opacity=".28"/><stop offset="1" stop-color="#34c759" stop-opacity="0"/></linearGradient></defs>
        ${grid}${cols}<path class="in-area" d="${area}" fill="url(#inGreen)"/><path class="in-line" d="${line}" pathLength="1"/>${dots}</svg><div class="in-tip" hidden></div></div>
      <div class="in-legend"><span><i class="in-dot is-billed"></i>Facturado (barras)</span><span><i class="in-dot is-paid"></i>Cobrado de lo facturado ese mes (línea)</span></div>
      ${totB || totP ? "" : `<p class="in-empty">${source === "invoices" ? `Todavía no hay facturas en estos meses. <button type="button" data-go-nav="invoice">Crear invoice</button>` : source === "hours" ? `Todavía no hay reportes de horas en estos meses. <button type="button" data-go-nav="hours">Registrar horas</button>` : `Todavía no hay reportes en estos meses. <button type="button" data-go-nav="job">Nuevo reporte</button>`}</p>`}`;
  }
  let lastData = [];
  function renderChart() {
    const box = $("#incomeChart");
    if (!box) return;
    lastData = series();
    box.innerHTML = chartHtml(lastData);
  }
  function showTip(box, g) {
    const tip = $(".in-tip", box), d = lastData[Number(g.dataset.i)];
    if (!tip || !d) return;
    box.querySelectorAll(".in-col.is-hover").forEach(x => x.classList.remove("is-hover"));
    g.classList.add("is-hover");
    box.querySelectorAll(".in-dotp").forEach(c => c.classList.toggle("is-hover", c.dataset.i === g.dataset.i));
    const title = new Date(Number(d.key.slice(0, 4)), Number(d.key.slice(5)) - 1, 1).toLocaleDateString(lang(), { month: "long", year: "numeric" });
    tip.innerHTML = `<strong>${esc(title.charAt(0).toUpperCase() + title.slice(1))}</strong><span><i class="in-dot is-billed"></i>Facturado ${money2(d.billed)}</span><span><i class="in-dot is-paid"></i>Cobrado ${money2(d.paid)}</span>${d.billed > d.paid ? `<span class="in-tip-owed">Falta ${money2(d.billed - d.paid)}</span>` : ""}`;
    tip.hidden = false;
    const plot = $(".in-plot", box).getBoundingClientRect(), r = g.querySelector(".in-hit").getBoundingClientRect();
    const left = Math.min(Math.max(8, r.left - plot.left + r.width / 2 - tip.offsetWidth / 2), plot.width - tip.offsetWidth - 8);
    tip.style.left = `${left}px`;
  }

  /* ---------- Reminders ---------- */
  function overdue() {
    const now = Date.now(), out = [];
    (window.TrentonControl?.records?.() || []).forEach(r => {
      if (r.deletedAt || r.stage !== "waiting") return;
      const d = parseDate(r.issuedDate); if (!d) return;
      const days = Math.floor((now - d) / DAY);
      if (days > LIMIT) out.push({ kind: "invoice", days, title: r.address || "Sin dirección", sub: `${r.invoiceNumber || "Invoice"} · ${money2(r.due != null && r.due > 0 ? r.due : r.amount)}`, record: r });
    });
    [["hours", window.HoursApp?.reports?.()], ["job", window.JobApp?.reports?.()]].forEach(([kind, list]) => (list || []).forEach(r => {
      if (r.stage !== "waiting") return;
      const d = parseDate(r.reportDate || r.startDate); if (!d) return;
      const days = Math.floor((now - d) / DAY);
      if (days > LIMIT) out.push({ kind, days, title: r.jobAddress || "Sin dirección", sub: kind === "hours" ? "Reporte de horas" : "Reporte", record: r });
    }));
    return out.sort((a, b) => b.days - a.days);
  }
  /* Notifications panel (sidebar "Notificaciones" and the phone "Más" button show the count). */
  let current = [];
  function bell() { return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 1.5h-15zM10 20.5a2.2 2.2 0 0 0 4 0"/></svg>'; }
  function renderBadges() {
    current = remindOn() ? overdue() : [];
    const n = current.length;
    document.querySelectorAll("[data-notify-count]").forEach(b => { b.textContent = n > 9 ? "9+" : String(n); b.hidden = !n; });
    const nav = document.getElementById("notifyNavButton");
    if (nav) nav.setAttribute("aria-label", n ? `Notificaciones: ${n} cobro${n === 1 ? "" : "s"} atrasado${n === 1 ? "" : "s"}` : "Notificaciones");
    const panel = document.getElementById("notifyPanel");
    if (panel?.classList.contains("is-open")) renderPanel(panel);
  }
  function renderPanel(panel) {
    const body = $(".tl-body", panel), list = current;
    if (!remindOn()) { body.innerHTML = `<div class="tl-empty"><span>${bell()}</span><strong>Recordatorios apagados</strong><small>Actívalos en Configuración › Preferencias › Notificaciones.</small></div>`; return; }
    if (!list.length) { body.innerHTML = `<div class="tl-empty"><span>${bell()}</span><strong>Todo al día</strong><small>No hay cobros con más de ${LIMIT} días esperando cheque.</small></div>`; return; }
    const total = list.filter(x => x.kind === "invoice").reduce((sum, x) => sum + (Number(x.record.due) > 0 ? Number(x.record.due) : Number(x.record.amount) || 0), 0);
    body.innerHTML = `<div class="nt-summary"><strong>Cobros atrasados</strong><span>${list.length} ${list.length === 1 ? "lleva" : "llevan"} más de ${LIMIT} días esperando cheque${total ? ` · ${money2(total)} por cobrar` : ""}</span></div>
      <div class="pr-rem-list">${list.map((x, i) => `<button type="button" class="pr-rem-row" data-rem-i="${i}"><span class="pr-rem-days"><strong>${x.days}</strong><small>días</small></span><span class="pr-rem-txt"><strong>${esc(x.title)}</strong><small>${esc(x.sub)} · emitida hace ${x.days} días</small></span><svg class="pr-rem-go" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg></button>`).join("")}</div>
      <p class="tl-note">Toca uno para abrirlo. Cuando llegue el cheque, muévelo a Pagado y desaparece de aquí.</p>`;
  }
  function openPanel() {
    let panel = document.getElementById("notifyPanel");
    if (!panel) {
      panel = document.createElement("div");
      panel.id = "notifyPanel";
      panel.className = "tl-modal";
      panel.setAttribute("role", "dialog");
      panel.setAttribute("aria-modal", "true");
      panel.innerHTML = `<div class="tl-card"><header class="tl-head"><span class="tl-head-i is-bell">${bell()}</span><div><h3>Notificaciones</h3><p>Avisos de cobro de tus invoices y reportes.</p></div><button type="button" class="tl-x" data-nt="close" aria-label="Cerrar"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg></button></header><div class="tl-body"></div></div>`;
      const close = () => { panel.classList.remove("is-open"); if (!document.querySelector(".tl-modal.is-open")) document.body.classList.remove("pr-open"); };
      panel.addEventListener("click", e => {
        if (e.target === panel || e.target.closest('[data-nt="close"]')) return close();
        const row = e.target.closest("[data-rem-i]");
        const x = row && current[Number(row.dataset.remI)];
        if (!x) return;
        close();
        if (x.kind === "invoice") window.TrentonControl?.edit?.(x.record);
        else if (x.kind === "hours") window.HoursApp?.edit?.(x.record);
        else window.JobApp?.edit?.(x.record);
      });
      document.addEventListener("keydown", e => { if (e.key === "Escape" && panel.classList.contains("is-open")) close(); });
      document.body.appendChild(panel);
    }
    current = remindOn() ? overdue() : [];
    renderPanel(panel);
    panel.classList.add("is-open");
    document.body.classList.add("pr-open");
    setTimeout(() => panel.querySelector(".tl-x")?.focus(), 60);
  }

  /* ---------- Mount and refresh ---------- */
  function mount() {
    const stats = $("#boardView .dash-stats");
    if (!stats || $("#incomeChart")) return;
    stats.insertAdjacentHTML("afterend", `<section class="income-chart" id="incomeChart" aria-label="Ingresos por mes"></section>`);
    const chart = $("#incomeChart");
    chart.addEventListener("click", e => {
      const b = e.target.closest("[data-range]");
      const src = e.target.closest("[data-source]");
      if (src) { source = src.dataset.source; try { localStorage.setItem("rp.chart.source", source); } catch (_) {} renderChart(); return; }
      if (b) { range = Number(b.dataset.range); try { localStorage.setItem("rp.chart.range", String(range)); } catch (_) {} renderChart(); return; }
      const g = e.target.closest(".in-col"); if (g) showTip(chart, g);
    });
    chart.addEventListener("pointerover", e => { const g = e.target.closest(".in-col"); if (g && e.pointerType !== "touch") showTip(chart, g); });
    chart.addEventListener("pointerleave", () => { const t = $(".in-tip", chart); if (t) t.hidden = true; chart.querySelectorAll(".in-col.is-hover").forEach(x => x.classList.remove("is-hover")); });
    chart.addEventListener("focusin", e => { const g = e.target.closest(".in-col"); if (g) showTip(chart, g); });
    refresh();
  }
  let timer = 0, lastWidth = 0;
  // Throttled, not debounced: the stat counters animate text every frame, which would
  // keep postponing a debounced refresh.
  function refresh() {
    if (timer) return;
    timer = setTimeout(() => {
      timer = 0;
      renderChart();
      renderBadges();
    }, 120);
  }
  function boot() {
    mount();
    // The stat cards and the boards re-render whenever the data changes: follow them.
    ["#boardView .dash-stats", "#board", "#hoursHomeBoard", "#jobHomeBoard"].forEach(sel => { const el = $(sel); if (el) new MutationObserver(refresh).observe(el, { childList: true, subtree: true, characterData: true }); });
    window.addEventListener("storage", e => { if (e.key === "rp.pref.remind") refresh(); });
    window.addEventListener("resize", () => { const w = $("#incomeChart")?.clientWidth || 0; if (Math.abs(w - lastWidth) > 40) { lastWidth = w; renderChart(); } });
    document.addEventListener("click", e => { if (e.target.closest("[data-open-notify]")) openPanel(); });
  }

  // Buttons inside empty states.
  document.addEventListener("click", e => {
    const n = e.target.closest("[data-go-nav]");
    if (n) { window.TrentonControl?.navClick?.(n.dataset.goNav); return; }
    const c = e.target.closest("[data-click]");
    if (c) document.querySelector(c.dataset.click)?.click();
  });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
  window.Insights = { refresh, overdue, open: openPanel };
})();

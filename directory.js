/* Directorio: saved clients and employees for the active company, so names, addresses and
   rates are not retyped. Stored as private JSON in the user's cloud folder (plus a copy in
   this browser). Forms get suggestions: picking a client fills its address in the invoice;
   picking an employee fills their rate in the hours forms. People found in past invoices
   and reports are offered as suggestions to add. */
(function () {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const esc = v => String(v ?? "").replace(/[&<>'"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#039;", '"': "&quot;" }[c]));
  const toast = t => window.TrentonControl?.toast?.(t);
  const BUCKET = "invoice-pdfs";
  const company = () => window.CompanyApp?.id?.() || "trenton";
  const path = () => `directorio/${company()}.json`;
  const localKey = () => `rp.directory.${company()}`;
  const norm = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase().replace(/\s+/g, " ");
  const uid = () => Math.random().toString(36).slice(2, 10);
  let data = { clients: [], employees: [] }, loadedFor = "", tab = "clients", editing = null;

  function readLocal() { try { return JSON.parse(localStorage.getItem(localKey()) || "null"); } catch (_) { return null; } }
  function writeLocal() { try { localStorage.setItem(localKey(), JSON.stringify(data)); } catch (_) {} }
  async function load(force) {
    if (loadedFor === company() && !force) return data;
    loadedFor = company();
    data = readLocal() || { clients: [], employees: [] };
    try {
      const blob = await window.CloudDB?.userFileGet?.(BUCKET, path());
      if (blob) { const cloud = JSON.parse(await blob.text()); if (cloud && Array.isArray(cloud.clients)) { data = { clients: cloud.clients, employees: cloud.employees || [] }; writeLocal(); } }
    } catch (_) { /* offline or first time: keep the local copy */ }
    fillLists();
    return data;
  }
  async function save() {
    writeLocal();
    fillLists();
    try { await window.CloudDB.userFilePut(BUCKET, path(), new Blob([JSON.stringify(data)], { type: "application/json" }), "application/json"); }
    catch (_) { toast("Guardado en este aparato. Se subirá a la nube cuando haya conexión."); }
  }

  /* People found in past invoices and reports (not saved yet). */
  function history() {
    const clients = new Map(), employees = new Map();
    (window.TrentonControl?.records?.() || []).forEach(r => {
      const d = r.invoiceData || {}, name = (d.billName || "").trim();
      if (name && !clients.has(norm(name))) clients.set(norm(name), { name, address: (d.billAddress || "").trim(), phone: "", email: "" });
    });
    [...(window.HoursApp?.reports?.() || []), ...(window.JobApp?.reports?.() || [])]
      .sort((a, b) => String(a.reportDate || a.startDate).localeCompare(String(b.reportDate || b.startDate)))
      .forEach(r => (r.entries || []).forEach(e => { const name = (e.employee || "").trim(); if (name) employees.set(norm(name), { name, rate: Number(e.rate) || Number(r.defaultRate) || 0, phone: "" }); }));
    const savedC = new Set(data.clients.map(c => norm(c.name))), savedE = new Set(data.employees.map(e => norm(e.name)));
    return { clients: [...clients.values()].filter(c => !savedC.has(norm(c.name))), employees: [...employees.values()].filter(e => !savedE.has(norm(e.name))) };
  }
  const findClient = name => data.clients.find(c => norm(c.name) === norm(name)) || history().clients.find(c => norm(c.name) === norm(name));
  const findEmployee = name => data.employees.find(e => norm(e.name) === norm(name)) || history().employees.find(e => norm(e.name) === norm(name));

  /* ---------- Suggestions in the forms ---------- */
  function fillLists() {
    const h = history();
    const opts = list => list.map(x => `<option value="${esc(x.name)}"></option>`).join("");
    let c = $("#dirClients"), e = $("#dirEmployees");
    if (!c) { document.body.insertAdjacentHTML("beforeend", `<datalist id="dirClients"></datalist><datalist id="dirEmployees"></datalist>`); c = $("#dirClients"); e = $("#dirEmployees"); }
    c.innerHTML = opts([...data.clients, ...h.clients]);
    e.innerHTML = opts([...data.employees, ...h.employees]);
  }
  const isEmployee = el => el.matches?.('input[data-hours-field="employee"], input[data-job-field="employee"]');
  document.addEventListener("focusin", e => {
    const el = e.target;
    if (el.id === "builderBillName" && !el.getAttribute("list")) { el.setAttribute("list", "dirClients"); el.setAttribute("autocomplete", "off"); load(); }
    if (isEmployee(el) && !el.getAttribute("list")) { el.setAttribute("list", "dirEmployees"); el.setAttribute("autocomplete", "off"); load(); }
  });
  const setValue = (input, value) => { if (!input || value == null || value === "") return; input.value = value; input.dispatchEvent(new Event("input", { bubbles: true })); };
  document.addEventListener("change", e => {
    const el = e.target;
    if (el.id === "builderBillName") { const c = findClient(el.value); if (c?.address) setValue($("#builderBillAddress"), c.address); return; }
    if (isEmployee(el)) {
      const emp = findEmployee(el.value);
      if (!emp || !(emp.rate > 0)) return;
      const attr = el.dataset.hoursField ? "data-hours-field" : "data-job-field";
      setValue(document.querySelector(`input[${attr}="rate"][data-index="${el.dataset.index}"]`), emp.rate);
    }
  });

  /* ---------- Directory window ---------- */
  const ICON = {
    people: "M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 6.5M18 14.5a5.5 5.5 0 0 1 3.5 5.5",
    x: "M6 6l12 12M18 6 6 18", edit: "M4 20l4-1L19 8a2.1 2.1 0 0 0-3-3L5 16z", trash: "M4 7h16M10 11v6M14 11v6M6 7l1 12.5A1.5 1.5 0 0 0 8.5 21h7a1.5 1.5 0 0 0 1.5-1.5L18 7M9 7V4.5h6V7",
    plus: "M12 5v14M5 12h14", spark: "M12 3l1.8 4.9L18.7 9.7l-4.9 1.8L12 16.4l-1.8-4.9L5.3 9.7l4.9-1.8z"
  };
  const ic = n => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${ICON[n]}"/></svg>`;
  function panel() {
    let el = $("#directoryPanel");
    if (el) return el;
    el = document.createElement("div");
    el.id = "directoryPanel"; el.className = "tl-modal"; el.setAttribute("role", "dialog"); el.setAttribute("aria-modal", "true");
    el.innerHTML = `<div class="tl-card"><header class="tl-head"><span class="tl-head-i">${ic("people")}</span><div><h3>Directorio</h3><p>Clientes y empleados para no reescribir datos.</p></div><button type="button" class="tl-x" data-dir="close" aria-label="Cerrar">${ic("x")}</button></header><div class="tl-body"></div></div>`;
    const close = () => { el.classList.remove("is-open"); if (!document.querySelector(".tl-modal.is-open")) document.body.classList.remove("pr-open"); };
    el.addEventListener("click", e => onClick(e, close));
    el.addEventListener("submit", onSubmit);
    document.addEventListener("keydown", e => { if (e.key === "Escape" && el.classList.contains("is-open")) close(); });
    document.body.appendChild(el);
    return el;
  }
  function formHtml(item) {
    const isC = tab === "clients", v = item || {};
    return `<form class="dir-form" data-id="${esc(v.id || "")}">
      <div class="dir-form-grid">
        <label class="tl-field"><span>${isC ? "Empresa o cliente" : "Nombre"}</span><input name="name" required value="${esc(v.name || "")}" placeholder="${isC ? "Ej. Trenton Builders LLC" : "Ej. Josué Zúñiga"}"></label>
        ${isC ? `<label class="tl-field"><span>Dirección</span><input name="address" value="${esc(v.address || "")}" placeholder="Ej. 1117 C St SE, Washington, DC 20003"></label>
        <label class="tl-field"><span>Teléfono</span><input name="phone" type="tel" value="${esc(v.phone || "")}"></label>
        <label class="tl-field"><span>Correo</span><input name="email" type="email" value="${esc(v.email || "")}"></label>`
        : `<label class="tl-field"><span>Tarifa USD/h</span><input name="rate" type="number" min="0" step="0.01" inputmode="decimal" value="${esc(v.rate ?? "")}" placeholder="Ej. 30"></label>
        <label class="tl-field"><span>Teléfono</span><input name="phone" type="tel" value="${esc(v.phone || "")}"></label>`}
      </div>
      <div class="dir-form-actions"><button type="button" class="tl-btn is-ghost" data-dir="cancel">Cancelar</button><button type="submit" class="tl-btn is-solid">Guardar</button></div>
    </form>`;
  }
  function rowHtml(x, i, saved) {
    const isC = tab === "clients";
    const sub = isC ? [x.address, x.phone].filter(Boolean).join(" · ") : [x.rate > 0 ? `$${Number(x.rate).toFixed(2)}/h` : "", x.phone].filter(Boolean).join(" · ");
    const initials = String(x.name).split(/\s+/).map(w => w[0]).slice(0, 2).join("").toUpperCase();
    return `<div class="dir-row${saved ? "" : " is-suggested"}"><span class="dir-av">${esc(initials)}</span><div class="tl-row-main"><strong>${esc(x.name)}</strong><small>${esc(sub || (isC ? "Sin dirección" : "Sin tarifa"))}</small></div>
      ${saved ? `<button type="button" class="dir-icon" data-dir="edit" data-i="${i}" aria-label="Editar">${ic("edit")}</button><button type="button" class="dir-icon is-danger" data-dir="del" data-i="${i}" aria-label="Eliminar">${ic("trash")}</button>`
        : `<button type="button" class="tl-btn" data-dir="add" data-i="${i}">${ic("plus")} Agregar</button>`}</div>`;
  }
  function render() {
    const el = panel(), body = $(".tl-body", el), list = data[tab], h = history()[tab];
    const isC = tab === "clients";
    body.innerHTML = `<div class="tl-tabs" role="tablist"><button type="button" role="tab" data-tab-dir="clients" class="${isC ? "is-on" : ""}" aria-selected="${isC}">Clientes <b>${data.clients.length}</b></button><button type="button" role="tab" data-tab-dir="employees" class="${!isC ? "is-on" : ""}" aria-selected="${!isC}">Empleados <b>${data.employees.length}</b></button></div>
      ${editing ? formHtml(editing === "new" ? null : list.find(x => x.id === editing)) : `<button type="button" class="tl-primary dir-new" data-dir="new">${ic("plus")} ${isC ? "Nuevo cliente" : "Nuevo empleado"}</button>`}
      <div class="tl-list">${list.length ? list.map((x, i) => rowHtml(x, i, true)).join("") : `<div class="tl-empty"><span>${ic("people")}</span><strong>${isC ? "Todavía no hay clientes" : "Todavía no hay empleados"}</strong><small>${isC ? "Al escribir el nombre en una invoice se llena la dirección." : "Al escribir el nombre en Horas se llena su tarifa."}</small></div>`}</div>
      ${h.length ? `<div class="dir-sugg-head"><span>${ic("spark")} Encontrados en tu historial</span><button type="button" class="dir-link" data-dir="addall">Agregar todos (${h.length})</button></div><div class="tl-list">${h.slice(0, 30).map((x, i) => rowHtml(x, i, false)).join("")}</div>` : ""}`;
    if (editing) setTimeout(() => $(".dir-form input", el)?.focus(), 30);
  }
  async function onClick(e, close) {
    const el = panel();
    if (e.target === el || e.target.closest('[data-dir="close"]')) return close();
    const t = e.target.closest("[data-tab-dir]");
    if (t) { tab = t.dataset.tabDir; editing = null; return render(); }
    const a = e.target.closest("[data-dir]")?.dataset.dir, i = Number(e.target.closest("[data-i]")?.dataset.i);
    if (a === "new") { editing = "new"; return render(); }
    if (a === "cancel") { editing = null; return render(); }
    if (a === "edit") { editing = data[tab][i]?.id; return render(); }
    if (a === "del") {
      const x = data[tab][i];
      if (!x || !confirm(`¿Quitar a ${x.name} del directorio?`)) return;
      data[tab].splice(i, 1); render(); await save(); return;
    }
    if (a === "add" || a === "addall") {
      const h = history()[tab], pick = a === "add" ? [h[i]] : h;
      pick.filter(Boolean).forEach(x => data[tab].push({ id: uid(), ...x }));
      data[tab].sort((p, q) => p.name.localeCompare(q.name));
      render(); await save();
      toast(a === "add" ? `${pick[0].name} agregado al directorio.` : `${pick.length} agregados al directorio.`);
    }
  }
  async function onSubmit(e) {
    if (!e.target.matches(".dir-form")) return;
    e.preventDefault();
    const f = new FormData(e.target), id = e.target.dataset.id || uid();
    const item = tab === "clients"
      ? { id, name: String(f.get("name")).trim(), address: String(f.get("address") || "").trim(), phone: String(f.get("phone") || "").trim(), email: String(f.get("email") || "").trim() }
      : { id, name: String(f.get("name")).trim(), rate: Number(f.get("rate")) || 0, phone: String(f.get("phone") || "").trim() };
    if (!item.name) return;
    const dup = data[tab].find(x => x.id !== id && norm(x.name) === norm(item.name));
    if (dup) { toast(`${item.name} ya está en el directorio.`); return; }
    const at = data[tab].findIndex(x => x.id === id);
    if (at >= 0) data[tab][at] = item; else data[tab].push(item);
    data[tab].sort((p, q) => p.name.localeCompare(q.name));
    editing = null; render(); await save();
    toast("Guardado en el directorio.");
  }
  async function open(which) {
    if (which) tab = which;
    editing = null;
    const el = panel();
    el.classList.add("is-open"); document.body.classList.add("pr-open");
    $(".tl-body", el).innerHTML = `<div class="tl-skel"></div><div class="tl-skel"></div>`;
    await load(true);
    render();
  }
  document.addEventListener("click", e => { const b = e.target.closest("[data-open-directory]"); if (b) { e.preventDefault(); open(b.dataset.openDirectory || ""); } });
  // Quick access next to the client and employee sections of the forms.
  function addShortcuts() {
    const chip = which => `<button type="button" class="dir-chip" data-open-directory="${which}">${ic("people")} Directorio</button>`;
    const bill = $("#builderBillName")?.closest(".b-card")?.querySelector(".b-step");
    if (bill && !bill.querySelector(".dir-chip")) bill.insertAdjacentHTML("beforeend", chip("clients"));
    ["#addHoursEntryButton", "#addJobEntryButton"].forEach(sel => { const b = $(sel); if (b && !b.parentElement.querySelector(".dir-chip")) b.insertAdjacentHTML("beforebegin", chip("employees")); });
  }
  function attach() {
    const bn = $("#builderBillName"); if (bn) { bn.setAttribute("list", "dirClients"); bn.setAttribute("autocomplete", "off"); }
    document.querySelectorAll('input[data-hours-field="employee"], input[data-job-field="employee"]').forEach(el => { el.setAttribute("list", "dirEmployees"); el.setAttribute("autocomplete", "off"); });
  }
  function boot() {
    addShortcuts(); fillLists(); attach();
    ["#hoursEntries", "#jobEntries"].forEach(sel => { const el = $(sel); if (el) new MutationObserver(attach).observe(el, { childList: true }); });
    // Saved people are read once the session is ready (the cloud needs it).
    let tries = 0; const t = setInterval(() => { if (window.TrentonControl?.isReady?.()) { clearInterval(t); load(true); } else if (++tries > 240) clearInterval(t); }, 500);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
  window.Directory = { open, load, history };
})();

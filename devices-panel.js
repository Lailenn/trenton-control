/* "Dispositivos registrados": security panel. Devices are the user's real passkeys (Supabase),
   enriched with what SecurityLog stored when they were registered or used. Map: Google Maps
   JavaScript API when a key is configured (config.js); never invented coordinates. */
window.DevicesPanel = (function () {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const esc = v => String(v ?? "").replace(/[&<>'"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#039;", '"': "&quot;" }[c]));
  const toast = t => window.TrentonControl?.toast?.(t);
  const calm = () => Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
  const fmt = iso => { const d = new Date(iso); return iso && !Number.isNaN(d.getTime()) ? d.toLocaleString("es", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : ""; };
  const place = g => g && !g.unavailable && (g.city || g.country) ? [g.city, g.region && g.region !== g.city ? g.region : "", g.country].filter(Boolean).join(", ") : "";
  const hasCoords = g => g && Number.isFinite(g.lat) && Number.isFinite(g.lng);
  const mapsUrl = g => `https://www.google.com/maps/search/?api=1&query=${g.lat},${g.lng}`;

  const I = {
    finger: "M12 11v2.5a9 9 0 0 1-1.8 5.4M8.6 9.6a3.6 3.6 0 0 1 7 1.4v2.6a12 12 0 0 1-1 4.8M5.6 16.6a11 11 0 0 0 .8-4.6V11a5.6 5.6 0 0 1 9.2-4.3M18 8.6a5.6 5.6 0 0 1 .4 2.4v2a15 15 0 0 1-.5 3.6M3.8 12.6V11a8.2 8.2 0 0 1 13.8-6",
    phone: "M7 2.5h10a1.5 1.5 0 0 1 1.5 1.5v16a1.5 1.5 0 0 1-1.5 1.5H7A1.5 1.5 0 0 1 5.5 20V4A1.5 1.5 0 0 1 7 2.5zM11 18.5h2",
    laptop: "M4.5 5.5h15v10h-15zM2.5 18.5h19",
    tablet: "M6 2.5h12a1.5 1.5 0 0 1 1.5 1.5v16a1.5 1.5 0 0 1-1.5 1.5H6A1.5 1.5 0 0 1 4.5 20V4A1.5 1.5 0 0 1 6 2.5zM12 18h.01",
    devices: "M4 5h13v9H4zM2 17h17M17 9h4.5v10H17z",
    shield: "M12 3 5 6v5.5c0 4.4 3 7.8 7 9.5 4-1.7 7-5.1 7-9.5V6zM9 12l2 2 4-4",
    pin: "M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11zM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z",
    plus: "M12 5v14M5 12h14",
    calendar: "M4.5 6h15v14h-15zM4.5 10h15M8.5 3.5v4M15.5 3.5v4",
    clock: "M12 3a9 9 0 1 1 0 18a9 9 0 1 1 0-18zM12 7v5l3.2 2",
    edit: "M4 20l4-1L19 8a2.1 2.1 0 0 0-3-3L5 16z",
    history: "M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 7v5l3 2",
    trash: "M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3",
    external: "M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5",
    chevron: "M6 9l6 6 6-6",
    gps: "M12 2v3M12 19v3M2 12h3M19 12h3M12 7a5 5 0 1 1 0 10 5 5 0 0 1 0-10zM12 11a1 1 0 1 1 0 2 1 1 0 0 1 0-2z",
    x: "M6 6l12 12M18 6 6 18",
    check: "M12 3a9 9 0 1 1 0 18a9 9 0 1 1 0-18zM8 12.4l2.7 2.7L16.2 9.6"
  };
  const ic = (n, c = "") => `<svg class="dp-i ${c}" viewBox="0 0 24 24" aria-hidden="true"><path d="${I[n]}"/></svg>`;

  /* ---------- data ---------- */
  let state = { devices: [], log: [], open: null };
  function guessFromName(name) {
    const n = String(name);
    return /iphone/i.test(n) ? { os: "iOS", type: "Teléfono" } : /ipad/i.test(n) ? { os: "iPadOS", type: "Tablet" } : /android|celular/i.test(n) ? { os: "Android", type: "Teléfono" }
      : /windows|pc/i.test(n) ? { os: "Windows", type: "Computadora" } : /mac/i.test(n) ? { os: "macOS", type: "Computadora" } : { os: "", type: "" };
  }
  async function load() {
    const [list, details, log] = await Promise.all([
      window.PasskeyAdmin.list(),
      window.SecurityLog?.devices?.().catch(() => ({})) || {},
      window.SecurityLog?.activity?.().catch(() => []) || []
    ]);
    const mine = window.PasskeyAdmin.thisDevice();
    state.log = Array.isArray(log) ? log : [];
    state.devices = list.map(p => {
      const d = details?.[p.id] || {}, name = p.friendly_name || p.friendlyName || d.name || "Aparato", guess = guessFromName(name);
      const lastFromLog = state.log.find(e => e.passkeyId === p.id && e.result === "ok");
      return {
        id: p.id, name, here: mine === p.id,
        os: d.os || guess.os, type: d.type || guess.type, browser: d.browser || "", model: d.model || "", method: d.method || "",
        registeredAt: p.created_at || p.createdAt || d.registeredAt || "",
        lastUsedAt: p.last_used_at || p.lastUsedAt || d.lastUsedAt || lastFromLog?.at || "",
        location: d.lastLocation || d.regLocation || null, gps: d.gps || null
      };
    });
  }

  /* ---------- window ---------- */
  let wrap = null;
  function build() {
    wrap = document.createElement("div");
    wrap.className = "dp-modal";
    wrap.innerHTML = `<section class="dp-card" role="dialog" aria-modal="true" aria-labelledby="dpTitle">
      <header class="dp-head"><span class="dp-badge">${ic("finger")}</span>
        <div><h3 id="dpTitle">Dispositivos registrados</h3><p>Administra los equipos que tienen permiso para acceder a Ruben Perla.</p></div>
        <button type="button" class="dp-x" data-dp="close" aria-label="Cerrar">${ic("x")}</button></header>
      <div class="dp-scroll"><div class="dp-summary"></div><div class="dp-list"></div>
        <p class="dp-legal">La ubicación por IP es aproximada (ciudad o región) y no equivale a la posición exacta del aparato. No se guardan huellas ni datos biométricos: el aparato las verifica y solo comparte una credencial (passkey).</p></div>
    </section>`;
    document.body.append(wrap);
    wrap.addEventListener("click", onClick);
    document.addEventListener("keydown", e => { if (e.key === "Escape" && wrap.classList.contains("is-open") && !$(".dp-history.is-open")) close(); });
  }
  async function open() {
    if (!window.PasskeyAdmin) return toast("Recarga la página e inténtalo de nuevo.");
    if (!wrap) build();
    wrap.classList.add("is-open");
    document.body.classList.add("pr-open");
    renderSkeleton();
    try { await load(); } catch (error) { $(".dp-list", wrap).innerHTML = `<p class="dp-empty">No se pudo cargar la lista. ${esc(error.message || "")}</p>`; return; }
    if (state.open == null && state.devices.length) state.open = (state.devices.find(d => d.here) || state.devices[0]).id;
    render();
  }
  function close() { wrap?.classList.remove("is-open"); document.body.classList.remove("pr-open"); }
  function renderSkeleton() {
    $(".dp-summary", wrap).innerHTML = Array.from({ length: 3 }, () => `<div class="dp-sum is-skel"><i></i><div><b></b><b></b></div></div>`).join("") + `<span></span>`;
    $(".dp-list", wrap).innerHTML = Array.from({ length: 2 }, () => `<div class="dp-dev is-skel"><div class="dp-dev-head"><i></i><div><b></b><b></b></div></div></div>`).join("");
  }
  function render() {
    const devs = state.devices;
    const lastOk = state.log.find(e => e.result === "ok" && e.action === "Inicio de sesión") || null;
    const lastDev = lastOk ? (devs.find(d => d.id === lastOk.passkeyId)?.name || lastOk.device) : "";
    const recent = state.log.find(e => e.result === "ok" && (e.city || e.country));
    $(".dp-summary", wrap).innerHTML = `
      <div class="dp-sum"><span class="dp-sum-i is-blue">${ic("devices")}</span><div><strong>${devs.length} dispositivo${devs.length === 1 ? "" : "s"}</strong><small>Autorizado${devs.length === 1 ? "" : "s"} con passkey</small></div></div>
      <div class="dp-sum"><span class="dp-sum-i is-green">${ic("shield")}</span><div><strong>Último acceso</strong><small>${lastOk ? `${esc(fmt(lastOk.at))}${lastDev ? ` · ${esc(lastDev)}` : ""}` : "Aún sin registros"}</small></div></div>
      <button type="button" class="dp-sum is-btn" data-dp="recent" ${recent && hasCoords(recent) ? "" : "disabled"}><span class="dp-sum-i is-violet">${ic("pin")}</span><div><strong>Ubicación reciente</strong><small>${recent ? esc(place(recent)) : "Ubicación no disponible"}</small></div></button>
      <button type="button" class="dp-register" data-dp="register">${ic("plus")} Registrar nuevo dispositivo</button>`;
    $(".dp-list", wrap).innerHTML = devs.length ? devs.map(deviceHtml).join("") : `<p class="dp-empty">Todavía no hay dispositivos registrados. Toca "Registrar nuevo dispositivo" para usar la huella en este aparato.</p>`;
    const openDev = devs.find(d => d.id === state.open);
    if (openDev) drawMap(openDev);
  }
  function deviceHtml(d) {
    const open = d.id === state.open, icon = d.type === "Computadora" ? "laptop" : d.type === "Tablet" ? "tablet" : "phone";
    const sub = [d.type, d.os, d.browser && d.os ? `${d.browser}` : "", d.model].filter(Boolean).join(" · ") || "Tipo no disponible";
    const loc = d.location, where = place(loc);
    const block = (icn, title, value, extra = "") => `<div class="dp-block"><span class="dp-block-i">${ic(icn)}</span><div><strong>${title}</strong><span>${value}</span>${extra}</div></div>`;
    return `<article class="dp-dev${open ? " is-open" : ""}" data-id="${esc(d.id)}">
      <button type="button" class="dp-dev-head" data-dp="toggle" aria-expanded="${open}">
        <span class="dp-dev-i">${ic(icon)}</span>
        <div class="dp-dev-name"><strong>${esc(d.name)}</strong><small>${esc(sub)}</small></div>
        <span class="dp-chip is-ok">${ic("check")}Autorizado</span>${d.here ? `<span class="dp-chip is-here">Este aparato</span>` : ""}
        <span class="dp-chev">${ic("chevron")}</span>
      </button>
      <div class="dp-dev-body"><div class="dp-dev-inner">
        <div class="dp-grid">
          ${block("calendar", "Registrado", esc(fmt(d.registeredAt)) || "Sin dato")}
          ${block("clock", "Último uso", esc(fmt(d.lastUsedAt)) || "Sin dato")}
          ${block("pin", "Ubicación estimada", where ? esc(where) : "Ubicación no disponible", loc?.ip ? `<small>IP ${esc(loc.ip)} · obtenida ${esc(fmt(loc.at))}</small>` : "")}
          ${block("finger", "Método de acceso", esc(d.method ? `Passkey · ${d.method}` : "Passkey del aparato"))}
        </div>
        <div class="dp-map-wrap">
          <div class="dp-map" id="dp-map-${esc(d.id)}"></div>
          <p class="dp-map-note">${ic("pin")}${d.gps ? `Ubicación GPS autorizada (±${d.gps.accuracy} m) · ${esc(fmt(d.gps.at))}` : where ? "Ubicación aproximada mediante dirección IP." : "Sin coordenadas registradas para este aparato."}</p>
        </div>
        <div class="dp-actions">
          ${hasCoords(d.gps || loc) ? `<a class="dp-btn" href="${mapsUrl(d.gps || loc)}" target="_blank" rel="noopener">${ic("pin")} Ver en Google Maps ${ic("external", "is-sm")}</a>` : `<button type="button" class="dp-btn" disabled>${ic("pin")} Ver en Google Maps</button>`}
          <button type="button" class="dp-btn" data-dp="rename">${ic("edit")} Renombrar</button>
          <button type="button" class="dp-btn" data-dp="history">${ic("history")} Ver historial</button>
          ${d.here ? `<button type="button" class="dp-btn" data-dp="gps">${ic("gps")} Usar ubicación GPS</button>` : ""}
          <button type="button" class="dp-btn is-danger" data-dp="revoke">${ic("trash")} Revocar acceso</button>
        </div>
      </div></div>
    </article>`;
  }

  /* ---------- Google Maps ---------- */
  let mapsPromise = null;
  function loadMaps() {
    const key = String(window.TRENTON_MAPS_KEY || "").trim();
    if (!key) return Promise.reject(new Error("nokey"));
    if (window.google?.maps?.Map) return Promise.resolve(window.google.maps);
    if (!mapsPromise) {
      mapsPromise = new Promise((resolve, reject) => {
        const cb = "__rpMapsReady";
        window[cb] = () => resolve(window.google.maps);
        window.gm_authFailure = () => reject(new Error("auth"));
        const s = document.createElement("script");
        s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&callback=${cb}&loading=async&language=es`;
        s.async = true;
        s.onerror = () => { mapsPromise = null; reject(new Error("load")); };
        document.head.append(s);
      });
    }
    return mapsPromise;
  }
  const LIGHT = [
    { featureType: "poi", stylers: [{ visibility: "off" }] },
    { featureType: "transit", stylers: [{ visibility: "off" }] },
    { featureType: "water", stylers: [{ color: "#d6e8ff" }] },
    { featureType: "landscape", stylers: [{ color: "#f4f6fb" }] },
    { featureType: "road", elementType: "geometry", stylers: [{ color: "#ffffff" }] },
    { featureType: "road", elementType: "labels.icon", stylers: [{ visibility: "off" }] }
  ];
  async function drawMap(d) {
    const box = document.getElementById(`dp-map-${d.id}`);
    if (!box) return;
    const g = d.gps || d.location;
    if (!hasCoords(g)) { box.innerHTML = `<div class="dp-map-empty">${ic("pin")}<span>Ubicación no disponible</span></div>`; return; }
    box.innerHTML = `<div class="dp-map-empty is-loading"><span>Cargando mapa…</span></div>`;
    try {
      const maps = await loadMaps();
      if (!box.isConnected) return;
      box.innerHTML = "";
      const center = { lat: g.lat, lng: g.lng };
      const map = new maps.Map(box, { center, zoom: d.gps ? 15 : 11, styles: LIGHT, disableDefaultUI: true, zoomControl: true, fullscreenControl: true, gestureHandling: "cooperative", clickableIcons: false });
      const marker = new maps.Marker({ position: center, map, title: d.name, animation: calm() ? null : maps.Animation.DROP });
      const info = new maps.InfoWindow({ content: `<div style="font:600 13px Plus Jakarta Sans,sans-serif;color:#242a40">${esc(d.name)}<br><span style="font-weight:500;color:#6b7590">${esc(place(g) || "Coordenadas GPS")}${d.gps ? " · GPS" : " · aprox. por IP"}</span></div>` });
      marker.addListener("click", () => info.open({ anchor: marker, map }));
      // IP location covers a city, so show it as an area, not a point.
      if (!d.gps) new maps.Circle({ map, center, radius: 4000, strokeColor: "#007aff", strokeOpacity: .35, strokeWeight: 1, fillColor: "#007aff", fillOpacity: .08 });
    } catch (error) {
      box.innerHTML = `<div class="dp-map-empty">${ic("pin")}<span>${esc(place(g) || "Ubicación registrada")}</span><small>${error.message === "nokey" ? "Mapa interactivo no configurado (falta la clave de Google Maps)." : error.message === "auth" ? "La clave de Google Maps fue rechazada. Revisa sus restricciones." : "No se pudo cargar Google Maps."}</small></div>`;
    }
  }

  /* ---------- actions ---------- */
  async function onClick(e) {
    if (e.target === wrap) return close();
    const btn = e.target.closest("[data-dp]");
    if (!btn) return;
    const act = btn.dataset.dp, card = btn.closest(".dp-dev"), dev = card && state.devices.find(d => d.id === card.dataset.id);
    if (act === "close") return close();
    if (act === "register") {
      btn.disabled = true;
      window.PasskeyAdmin.register();
      setTimeout(async () => { btn.disabled = false; await load(); render(); }, 5000);
      return;
    }
    if (act === "recent") { const r = state.log.find(x => x.result === "ok" && hasCoords(x)); if (r) window.open(mapsUrl(r), "_blank", "noopener"); return; }
    if (act === "toggle") {
      state.open = state.open === dev.id ? null : dev.id;
      wrap.querySelectorAll(".dp-dev").forEach(c => { c.classList.toggle("is-open", c.dataset.id === state.open); c.querySelector(".dp-dev-head").setAttribute("aria-expanded", String(c.dataset.id === state.open)); });
      const opened = state.devices.find(d => d.id === state.open);
      if (opened) drawMap(opened);
      return;
    }
    if (!dev) return;
    try {
      if (act === "rename") {
        const name = window.prompt("Nuevo nombre del dispositivo:", dev.name);
        if (!name || !name.trim() || name.trim() === dev.name) return;
        await window.PasskeyAdmin.rename(dev.id, name.trim().slice(0, 60));
        toast("Nombre actualizado.");
      }
      if (act === "revoke") {
        if (!window.confirm(`¿Revocar el acceso de "${dev.name}"?\n\nSe elimina su credencial (passkey): ese aparato ya no podrá entrar con huella. Esta acción no se puede deshacer.`)) return;
        btn.disabled = true;
        await window.PasskeyAdmin.remove(dev.id, dev.name);
        if (!calm()) await card.animate([{ opacity: 1, transform: "none" }, { opacity: 0, transform: "scale(.97)" }], { duration: 260, easing: "ease" }).finished;
        toast("Acceso revocado.");
      }
      if (act === "gps") {
        btn.disabled = true;
        await window.SecurityLog.saveGps(dev.id);
        toast("Ubicación GPS guardada para este aparato.");
      }
      if (act === "history") return openHistory(dev.id);
    } catch (error) { toast(error.message || "No se pudo completar la acción."); btn.disabled = false; return; }
    await load();
    render();
  }

  /* ---------- activity history ---------- */
  function openHistory(deviceId) {
    let box = $(".dp-history");
    if (!box) {
      box = document.createElement("div");
      box.className = "dp-history";
      box.innerHTML = `<section class="dp-card is-sm" role="dialog" aria-modal="true" aria-labelledby="dpHistTitle">
        <header class="dp-head"><span class="dp-badge">${ic("history")}</span><div><h3 id="dpHistTitle">Historial de actividad</h3><p>Accesos y cambios de seguridad, del más reciente al más antiguo.</p></div><button type="button" class="dp-x" data-h="close" aria-label="Cerrar">${ic("x")}</button></header>
        <div class="dp-filters"><select data-h="device" aria-label="Dispositivo"></select><label>Desde <input type="date" data-h="from"></label><label>Hasta <input type="date" data-h="to"></label></div>
        <div class="dp-scroll"><div class="dp-hist-list"></div></div>
      </section>`;
      document.body.append(box);
      box.addEventListener("click", e => { if (e.target === box || e.target.closest('[data-h="close"]')) box.classList.remove("is-open"); });
      box.addEventListener("input", () => renderHistory());
      document.addEventListener("keydown", e => { if (e.key === "Escape" && box.classList.contains("is-open")) box.classList.remove("is-open"); });
    }
    const select = $('[data-h="device"]', box);
    select.innerHTML = `<option value="">Todos los dispositivos</option>${state.devices.map(d => `<option value="${esc(d.id)}">${esc(d.name)}</option>`).join("")}<option value="__other">Otros accesos (contraseña, otros navegadores)</option>`;
    select.value = deviceId || "";
    box.classList.add("is-open");
    renderHistory();
  }
  function renderHistory() {
    const box = $(".dp-history"), list = $(".dp-hist-list", box);
    const dev = $('[data-h="device"]', box).value, from = $('[data-h="from"]', box).value, to = $('[data-h="to"]', box).value;
    const ids = new Set(state.devices.map(d => d.id));
    const rows = state.log.filter(e => (!dev || (dev === "__other" ? !ids.has(e.passkeyId) : e.passkeyId === dev))
      && (!from || e.at.slice(0, 10) >= from) && (!to || e.at.slice(0, 10) <= to));
    const label = { ok: "Exitoso", fail: "Fallido", review: "Revisar" };
    list.innerHTML = rows.length ? rows.map(e => `<div class="dp-hist is-${esc(e.result)}">
        <span class="dp-dot"></span>
        <div class="dp-hist-main"><strong>${esc(e.action)}</strong><small>${esc(state.devices.find(d => d.id === e.passkeyId)?.name || e.device || "Dispositivo")} · ${esc(e.method || "")}</small></div>
        <div class="dp-hist-meta"><span>${esc(fmt(e.at))}</span><small>${esc(place(e) || "Ubicación no disponible")}${e.ip ? ` · IP ${esc(e.ip)}` : ""}</small></div>
        <span class="dp-chip is-${esc(e.result)}">${label[e.result] || e.result}</span>
      </div>`).join("")
      : `<p class="dp-empty">No hay actividad registrada con estos filtros. Los accesos se registran desde esta versión de la app en adelante.</p>`;
  }

  // Opens only the activity history (used by the settings page).
  async function history() {
    try { await load(); } catch (_) { state.devices = state.devices || []; }
    openHistory("");
  }
  return { open, close, history };
})();

/* Configuración: account, security, access and preferences. Profile data comes from
   AccountInfo (auth-app.js); editing uses the existing profile editor. Activity comes from
   SecurityLog. Nothing here is invented: sections without data say so. */
window.SettingsPage = (function () {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const esc = v => String(v ?? "").replace(/[&<>'"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#039;", '"': "&quot;" }[c]));
  const toast = t => window.TrentonControl?.toast?.(t);
  // Preferences saved on this device: [storage key, default, html class, class when the toggle is ON?]
  const PREFS = {
    calm: ["rp.pref.calm", false, "rp-calm", true], auto: ["rp.pref.carousel", true, "rp-no-autoplay", false],
    herobg: ["rp.pref.herobg", true, "rp-plain-hero", false], shadow: ["rp.pref.shadow", true, "rp-flat", false],
    toasts: ["rp.pref.toasts", true, "rp-no-toast", false], sound: ["rp.pref.sound", false, "", true],
    bigtext: ["rp.pref.bigtext", false, "rp-big-text", true], contrast: ["rp.pref.contrast", false, "rp-contrast", true],
    focus: ["rp.pref.focus", false, "rp-focus", true], remind: ["rp.pref.remind", true, "", true]
  };
  const PREF_START = "rp.pref.start", PREF_THEME = "rp.pref.theme";
  const theme = () => { try { return localStorage.getItem(PREF_THEME) || "light"; } catch (_) { return "light"; } };
  const darkQuery = window.matchMedia?.("(prefers-color-scheme: dark)");
  const applyTheme = () => document.documentElement.classList.toggle("rp-dark", theme() === "dark" || (theme() === "auto" && Boolean(darkQuery?.matches)));
  applyTheme();
  darkQuery?.addEventListener?.("change", applyTheme);
  // In the PDF editor the full-page dark filter is paused (dark.css has a light version for it).
  const watchEditor = () => { const v = document.getElementById("editorView"); if (!v) return; const sync = () => document.documentElement.classList.toggle("rp-dark-pause", !v.classList.contains("hidden")); sync(); new MutationObserver(sync).observe(v, { attributes: true, attributeFilter: ["class"] }); };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", watchEditor); else watchEditor();
  const pref = (k, def) => { try { const v = localStorage.getItem(k); return v == null ? def : v === "1"; } catch (_) { return def; } };
  const setPref = (k, v) => { try { localStorage.setItem(k, v ? "1" : "0"); } catch (_) {} };
  const on = id => pref(PREFS[id][0], PREFS[id][1]);
  const startView = () => { try { return localStorage.getItem(PREF_START) || "board"; } catch (_) { return "board"; } };
  const applyPrefs = () => Object.entries(PREFS).forEach(([id, [, , cls, whenOn]]) => { if (cls) document.documentElement.classList.toggle(cls, on(id) === whenOn); });
  applyPrefs();
  // Soft sound when a notice appears (only if turned on).
  function chime() {
    try {
      const C = window.AudioContext || window.webkitAudioContext; if (!C) return;
      const ctx = chime.ctx || (chime.ctx = new C()), o = ctx.createOscillator(), g = ctx.createGain(), t = ctx.currentTime;
      o.type = "sine"; o.frequency.setValueAtTime(880, t); o.frequency.exponentialRampToValueAtTime(1320, t + .08);
      g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(.08, t + .02); g.gain.exponentialRampToValueAtTime(.0001, t + .25);
      o.connect(g).connect(ctx.destination); o.start(t); o.stop(t + .26);
    } catch (_) {}
  }
  function watchToast() {
    const el = document.getElementById("toast");
    if (!el) return;
    let was = el.classList.contains("show");
    new MutationObserver(() => { const now = el.classList.contains("show"); if (now && !was && on("sound") && on("toasts")) chime(); was = now; }).observe(el, { attributes: true, attributeFilter: ["class"] });
  }
  // Screen to open after signing in (only if still on Home when the app gets ready).
  function goStart() {
    const view = startView();
    if (view === "board") return;
    let tries = 0;
    const t = setInterval(() => {
      const app = window.TrentonControl, board = document.getElementById("boardView");
      if (app?.isReady?.()) { clearInterval(t); if (board && !board.classList.contains("hidden")) app.navClick(view); }
      else if (++tries > 480) clearInterval(t);
    }, 250);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => { watchToast(); goStart(); }); else { watchToast(); goStart(); }
  let openGroup = "";

  const I = {
    palette: "M12 3.5a8.5 8.5 0 1 0 0 17c1.1 0 1.7-.8 1.7-1.6 0-.5-.2-.8-.4-1.1-.3-.3-.4-.7-.4-1.1 0-.9.7-1.6 1.6-1.6H16a4.5 4.5 0 0 0 4.5-4.5C20.5 6.9 16.7 3.5 12 3.5zM7.5 12h.01M9.5 8h.01M14.5 8h.01M16.8 11.5h.01",
    translate: "M4 5.5h8M8 3.5v2M5.5 5.5c.6 2.6 2.4 4.8 5 6M10.5 5.5c-.6 2.8-2.6 5.2-5.5 6.5M12.5 20.5l3.5-9 3.5 9M13.8 17.5h4.4",
    bell: "M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 1.5h-15zM10 20.5a2.2 2.2 0 0 0 4 0",
    a11y: "M12 6.5a1.6 1.6 0 1 0 0-3.2 1.6 1.6 0 0 0 0 3.2zM5 9l7 1.5L19 9M12 10.5V15M12 15l-3 5.5M12 15l3 5.5",
    clock: "M12 20.5a8.5 8.5 0 1 0 0-17 8.5 8.5 0 0 0 0 17zM12 7.5V12l3 2",
    gear: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z",
    user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4.5 20a7.5 7.5 0 0 1 15 0",
    shield: "M12 3 5 6v5.5c0 4.4 3 7.8 7 9.5 4-1.7 7-5.1 7-9.5V6zM12 9v3.5M12 15.5h.01",
    layers: "M12 3.5 21 8l-9 4.5L3 8zM3 12l9 4.5 9-4.5M3 16l9 4.5 9-4.5",
    sliders: "M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1M15 4v4M9 10v4M17 16v4",
    mail: "M3.5 6h17v12h-17zM3.5 7l8.5 6 8.5-6",
    phone: "M5 4h3.5l1.5 4-2 1.5a11 11 0 0 0 6.5 6.5L16 14l4 1.5V19a1.5 1.5 0 0 1-1.5 1.5A16 16 0 0 1 3.5 5.5 1.5 1.5 0 0 1 5 4z",
    brief: "M4 8h16v11H4zM9 8V5.5h6V8M4 13h16",
    calendar: "M4.5 6h15v14h-15zM4.5 10h15M8.5 3.5v4M15.5 3.5v4",
    edit: "M4 20l4-1L19 8a2.1 2.1 0 0 0-3-3L5 16z",
    camera: "M4 8h3l2-3h6l2 3h3v11H4zM12 16.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z",
    badge: "M12 3l2.5 2.2 3.3-.3.7 3.3 2.8 1.8-1.4 3 1.4 3-2.8 1.8-.7 3.3-3.3-.3L12 21l-2.5-2.2-3.3.3-.7-3.3-2.8-1.8 1.4-3-1.4-3 2.8-1.8.7-3.3 3.3.3zM9 12l2 2 4-4",
    lock: "M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3",
    pulse: "M3 12h4l2.5-6 4 12 2.5-6H21",
    finger: "M12 11v2.5a9 9 0 0 1-1.8 5.4M8.6 9.6a3.6 3.6 0 0 1 7 1.4v2.6a12 12 0 0 1-1 4.8M5.6 16.6a11 11 0 0 0 .8-4.6V11a5.6 5.6 0 0 1 9.2-4.3M18 8.6a5.6 5.6 0 0 1 .4 2.4v2a15 15 0 0 1-.5 3.6",
    key: "M14.5 9.5a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0zM13.2 12.7 20 19.5M17 16.5l2-2M15 14.5l1.5-1.5",
    out: "M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4M9 16l-4-4 4-4M5 12h11",
    swap: "M7 7h11l-3-3M17 17H6l3 3",
    login: "M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4M14 16l4-4-4-4M18 12H8",
    check: "M12 3a9 9 0 1 1 0 18a9 9 0 1 1 0-18zM8 12.4l2.7 2.7L16.2 9.6",
    arrow: "M5 12h13M13 6l6 6-6 6"
  };
  const ic = (n, c = "") => `<svg class="st-i ${c}" viewBox="0 0 24 24" aria-hidden="true"><path d="${I[n]}"/></svg>`;
  const PERMS = ["Crear y administrar invoices", "Registrar y gestionar horas", "Generar reportes y enviarlos a Trenton", "Editar y firmar documentos (PDF)", "Consultar archivos (invoices y horas)"];
  let tab = "info";

  function profile() { return window.AccountInfo?.profile?.() || {}; }
  function avatarUrl() { return document.getElementById("sidebarAvatarImg")?.getAttribute("src") || ""; }
  const initials = name => String(name || "?").trim().split(/\s+/).slice(0, 2).map(w => w[0]).join("").toUpperCase();

  function render() {
    const root = $("#settingsView");
    if (!root) return;
    const p = profile(), img = avatarUrl(), workspace = window.CompanyApp?.info?.()?.title || "Trenton";
    root.innerHTML = `
      <header class="st-top"><span class="st-top-i">${ic("gear")}</span><div><h1>Configuración</h1><p>Administra tu cuenta, seguridad y preferencias del sistema.</p></div></header>
      <div class="st-grid${sideHtml(p) ? "" : " is-single"}">
        <div class="st-main">
          <section class="st-hero">
            <button type="button" class="st-avatar" data-st="photo" title="Cambiar foto">${img ? `<img src="${esc(img)}" alt="">` : `<span>${esc(initials(p.displayName))}</span>`}<i class="st-online"></i><b class="st-cam">${ic("camera")}</b></button>
            <div class="st-hero-txt"><h2>${esc(p.displayName || "Tu nombre")}</h2>
              <span class="st-role">${ic("brief")}${esc(p.jobTitle || "Sin cargo")}</span>
              <span class="st-since">${ic("calendar")}Miembro desde ${esc(p.memberYear || "—")}</span></div>
          </section>
          <nav class="st-tabs" role="tablist">
            ${[["info", "user", "Información"], ["security", "shield", "Seguridad"], ["access", "layers", "Accesos"], ["prefs", "sliders", "Preferencias"]].map(([id, icon, label]) => `<button type="button" role="tab" class="${tab === id ? "is-on" : ""}" data-tab="${id}">${ic(icon)}<span>${label}</span></button>`).join("")}
          </nav>
          <section class="st-panel">${panelHtml(p, workspace)}</section>
        </div>
        ${sideHtml(p) ? `<aside class="st-side">${sideHtml(p)}</aside>` : ""}
      </div>`;
    if (tab === "security") fillActivity();
  }
  // Side card that belongs to each tab (nothing repeats on every tab).
  function sideHtml(p) {
    if (tab === "info") return `<section class="st-card st-rolecard"><h3>${ic("badge", "is-blue")}Tu rol en el sistema</h3><strong>${esc(p.jobTitle || "Sin cargo")}</strong>
            <p>Tienes acceso a la gestión de invoices, control de horas, reportes y administración de documentos.</p>
            <span class="st-role-art" aria-hidden="true"><i></i><i></i><i></i><b>${ic("check")}</b></span></section>`;
    if (tab === "security") return `<section class="st-card"><div class="st-card-head"><h3>${ic("pulse", "is-blue")}Actividad reciente</h3><button type="button" class="st-link" data-st="history">Ver historial ${ic("arrow")}</button></div><div class="st-activity"><p class="st-muted">Cargando…</p></div></section>`;
    return "";
  }
  function row(icon, label, value) { return `<div class="st-row"><span class="st-row-i">${ic(icon)}</span><span class="st-row-l">${label}</span><strong>${value}</strong></div>`; }
  function panelHtml(p, workspace) {
    if (tab === "info") return `<div class="st-panel-head"><div><h3>Información personal</h3><p>Datos de tu cuenta y contacto.</p></div><button type="button" class="st-btn" data-st="edit">${ic("edit")} Editar</button></div>
      ${row("user", "Nombre completo", esc(p.displayName || "—"))}${row("mail", "Correo electrónico", esc(p.email || "—"))}${row("phone", "Teléfono", p.phone ? esc(`+503 ${String(p.phone).replace(/^\+?503\s*/, "")}`) : "Sin teléfono")}${row("brief", "Cargo", esc(p.jobTitle || "—"))}${row("calendar", "Miembro desde", esc(p.memberYear || "—"))}`;
    if (tab === "security") return `<div class="st-panel-head"><div><h3>Seguridad</h3><p>Dispositivos con acceso, contraseña y sesión.</p></div></div>
      <div class="st-action"><span class="st-row-i">${ic("finger")}</span><div><strong>Dispositivos registrados</strong><small>Aparatos que entran con huella, Face ID o Windows Hello.</small></div><button type="button" class="st-btn" data-st="devices">Ver dispositivos</button></div>
      <div class="st-action"><span class="st-row-i">${ic("key")}</span><div><strong>Cambiar contraseña</strong><small>Mínimo 8 caracteres.</small></div><button type="button" class="st-btn" data-st="pwd">Cambiar</button></div>
      <form class="st-pwd" hidden><input type="password" autocomplete="new-password" placeholder="Nueva contraseña" minlength="8" required><input type="password" autocomplete="new-password" placeholder="Repite la contraseña" minlength="8" required><button type="submit" class="st-btn is-primary">Guardar contraseña</button><p class="st-pwd-msg" role="alert"></p></form>
      <div class="st-action"><span class="st-row-i">${ic("out")}</span><div><strong>Cerrar sesión</strong><small>Sale de la cuenta en este aparato.</small></div><button type="button" class="st-btn is-danger" data-st="logout">Salir</button></div>`;
    if (tab === "access") return `<div class="st-panel-head"><div><h3>Accesos</h3><p>Espacio de trabajo y lo que puedes hacer en la app.</p></div></div>
      <div class="st-action"><span class="st-row-i">${ic("layers")}</span><div><strong>Espacio activo: ${esc(workspace)}</strong><small>Cada empresa guarda sus datos por separado.</small></div><button type="button" class="st-btn" data-st="switch">${ic("swap")} Cambiar empresa</button></div>
      <ul class="st-perms is-wide">${PERMS.map(x => `<li>${ic("check")}${x}</li>`).join("")}</ul>`;
    const tg = (id, title, sub) => `<label class="st-toggle"><span><strong>${title}</strong><small>${sub}</small></span><input type="checkbox" data-pref="${id}" ${on(id) ? "checked" : ""}><i></i></label>`;
    const lang = window.I18n?.get?.() || "es", sv = startView();
    let tz = ""; try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ""; } catch (_) {}
    const sample = new Date().toLocaleDateString(lang === "en" ? "en-US" : "es", { day: "numeric", month: "long", year: "numeric" });
    const groups = [
      ["look", "palette", "Apariencia", "Tema, colores y personalización visual",
        `<div class="st-toggle st-select"><span><strong>Tema</strong><small>Claro, oscuro o según tu aparato.</small></span><div class="st-seg" role="radiogroup" aria-label="Tema">${[["light", "Claro"], ["dark", "Oscuro"], ["auto", "Automático"]].map(([v, l]) => `<button type="button" role="radio" data-theme-set="${v}" aria-checked="${theme() === v}" class="${theme() === v ? "is-on" : ""}">${l}</button>`).join("")}</div></div>`
        + tg("herobg", "Fondo azul en Inicio", "La curva azul detrás del carrusel.") + tg("shadow", "Sombras suaves", "Profundidad en tarjetas y paneles.")],
      ["behave", "sliders", "Comportamiento", "Animaciones, carrusel y navegación",
        tg("calm", "Reducir animaciones", "Menos movimiento en toda la app.") + tg("auto", "Carrusel automático en Inicio", "Las tarjetas del encabezado avanzan solas.")
        + `<label class="st-toggle st-select"><span><strong>Pantalla al entrar</strong><small>Lo primero que ves al iniciar sesión.</small></span><select data-start>${[["board", "Inicio"], ["hours", "Horas trabajadas"], ["invoice", "Crear invoice"], ["archive", "Invoices / PDFs"], ["editor", "Editor PDF"]].map(([v, l]) => `<option value="${v}" ${sv === v ? "selected" : ""}>${l}</option>`).join("")}</select></label>`],
      ["lang", "translate", "Idioma y región", "Idioma, fecha, hora y moneda",
        `<div class="st-toggle st-select"><span><strong>Idioma</strong><small>Textos de la interfaz en español o inglés.</small></span><div class="st-seg" role="radiogroup" aria-label="Idioma" data-i18n-skip><button type="button" role="radio" data-lang="es" aria-checked="${lang === "es"}" class="${lang === "es" ? "is-on" : ""}">Español</button><button type="button" role="radio" data-lang="en" aria-checked="${lang === "en"}" class="${lang === "en" ? "is-on" : ""}">English</button></div></div>`
        + row("calendar", "Formato de fecha", esc(sample)) + row("clock", "Zona horaria", esc(tz || "—")) + row("badge", "Moneda", "USD ($)")],
      ["notify", "bell", "Notificaciones", "Avisos y alertas del sistema",
        tg("toasts", "Avisos en pantalla", "Mensajes breves como “Guardado” en la parte de abajo.") + tg("sound", "Sonido en los avisos", "Un toque suave cuando aparece un aviso.") + tg("remind", "Recordatorios de cobro", "Avisa en Inicio cuando algo lleva más de 30 días esperando cheque.")],
      ["a11y", "a11y", "Accesibilidad", "Texto, contraste y efectos visuales",
        tg("bigtext", "Texto más grande", "Aumenta el tamaño de toda la interfaz.") + tg("contrast", "Alto contraste", "Textos y bordes más oscuros.") + tg("focus", "Resaltar el foco", "Marca clara al moverte con el teclado.")]
    ];
    return `<div class="st-panel-head"><div><h3>Preferencias</h3><p>Personaliza tu experiencia en Ruben Perla. Se guardan en este aparato.</p></div></div>
      <div class="st-groups">${groups.map(([id, icon, title, sub, body]) => `<section class="st-group${openGroup === id ? " is-open" : ""}" data-group="${id}">
        <button type="button" class="st-group-head" data-group-toggle="${id}" aria-expanded="${openGroup === id}"><span class="st-group-i">${ic(icon)}</span><span class="st-group-t"><strong>${title}</strong><small>${sub}</small></span><svg class="st-chev" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg></button>
        <div class="st-group-body"><div>${body}</div></div></section>`).join("")}</div>`;
  }
  async function fillActivity() {
    const box = $("#settingsView .st-activity");
    if (!box) return;
    let log = [];
    try { log = (await window.SecurityLog?.activity?.()) || []; } catch (_) {}
    const icon = a => /sesión/i.test(a) ? "login" : /contraseña|revoc/i.test(a) ? "key" : /registrad|gps/i.test(a) ? "finger" : "pulse";
    const when = iso => { const d = new Date(iso), t = new Date(); const y = new Date(t); y.setDate(t.getDate() - 1);
      const hm = d.toLocaleTimeString("es", { hour: "numeric", minute: "2-digit" });
      return d.toDateString() === t.toDateString() ? `Hoy, ${hm}` : d.toDateString() === y.toDateString() ? `Ayer, ${hm}` : `${d.toLocaleDateString("es", { day: "numeric", month: "short" })}, ${hm}`; };
    box.innerHTML = log.length ? log.slice(0, 4).map(e => `<div class="st-act${e.result === "fail" ? " is-fail" : ""}"><span class="st-row-i">${ic(icon(e.action))}</span><strong>${esc(e.action)}</strong><small>${esc(when(e.at))}</small><em>${esc(e.os ? `${e.browser || "Web"}` : "Web")}</em></div>`).join("")
      : `<p class="st-muted">Aún no hay actividad registrada. Se anota desde tu próximo inicio de sesión.</p>`;
  }

  async function onClick(e) {
    const g = e.target.closest("[data-group-toggle]");
    if (g) {
      openGroup = openGroup === g.dataset.groupToggle ? "" : g.dataset.groupToggle;
      g.closest(".st-groups").querySelectorAll(".st-group").forEach(x => { const open = x.dataset.group === openGroup; x.classList.toggle("is-open", open); x.querySelector(".st-group-head").setAttribute("aria-expanded", String(open)); });
      return;
    }
    const th = e.target.closest("[data-theme-set]");
    if (th) {
      try { localStorage.setItem(PREF_THEME, th.dataset.themeSet); } catch (_) {}
      applyTheme();
      th.parentElement.querySelectorAll("button").forEach(b => { const on = b === th; b.classList.toggle("is-on", on); b.setAttribute("aria-checked", String(on)); });
      toast("Preferencia guardada.");
      return;
    }
    const lg = e.target.closest("[data-lang]");
    if (lg) { window.I18n?.set?.(lg.dataset.lang); render(); toast(lg.dataset.lang === "en" ? "Language: English." : "Idioma: Español."); return; }
    const t = e.target.closest("[data-tab]");
    if (t) { tab = t.dataset.tab; return render(); }
    const a = e.target.closest("[data-st]")?.dataset.st;
    if (!a) return;
    if (a === "edit" || a === "photo") return window.AccountInfo?.openEditor?.();
    if (a === "devices") return window.DevicesPanel?.open?.();
    if (a === "history") return window.DevicesPanel?.history?.();
    if (a === "logout") return document.getElementById("logoutButton")?.click();
    if (a === "switch") return document.getElementById("switchCompanyButton")?.click();
    if (a === "pwd") { const f = $("#settingsView .st-pwd"); f.hidden = !f.hidden; if (!f.hidden) f.querySelector("input").focus(); }
  }
  async function onSubmit(e) {
    if (!e.target.matches(".st-pwd")) return;
    e.preventDefault();
    const [a, b] = e.target.querySelectorAll("input"), msg = e.target.querySelector(".st-pwd-msg"), btn = e.target.querySelector("button");
    msg.textContent = "";
    if (a.value.length < 8) { msg.textContent = "Usa al menos 8 caracteres."; return; }
    if (a.value !== b.value) { msg.textContent = "Las contraseñas no coinciden."; return; }
    btn.disabled = true;
    try { await window.AccountInfo.changePassword(a.value); toast("Contraseña actualizada."); e.target.reset(); e.target.hidden = true; }
    catch (error) { msg.textContent = error.message; }
    finally { btn.disabled = false; }
  }
  function onChange(e) {
    if (e.target.matches("[data-start]")) { try { localStorage.setItem(PREF_START, e.target.value); } catch (_) {} toast("Preferencia guardada."); return; }
    const k = e.target.dataset.pref;
    if (!k || !PREFS[k]) return;
    setPref(PREFS[k][0], e.target.checked);
    if (k === "remind") window.Insights?.refresh?.();
    applyPrefs();
    toast("Preferencia guardada.");
  }

  function open() {
    const root = $("#settingsView");
    if (!root) return;
    if (!root.dataset.bound) {
      root.dataset.bound = "1";
      root.addEventListener("click", onClick);
      root.addEventListener("submit", onSubmit);
      root.addEventListener("change", onChange);
      // Re-render when the profile editor saves (name, role or photo change in the sidebar).
      const watch = ["sidebarProfileName", "sidebarRole", "sidebarAvatarImg"].map(id => document.getElementById(id)).filter(Boolean);
      const mo = new MutationObserver(() => { if (!root.classList.contains("hidden")) render(); });
      watch.forEach(el => mo.observe(el, { childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ["src"] }));
    }
    render();
  }
  // Sidebar "Configuración" (in General) and its active look.
  document.addEventListener("click", e => { if (e.target.closest("#settingsNavButton")) window.TrentonControl?.navClick?.("settings"); });
  const syncActive = () => document.getElementById("settingsNavButton")?.classList.toggle("is-active", !document.getElementById("settingsView")?.classList.contains("hidden"));
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => { const v = document.getElementById("settingsView"); if (v) new MutationObserver(syncActive).observe(v, { attributes: true, attributeFilter: ["class"] }); });
  else { const v = document.getElementById("settingsView"); if (v) new MutationObserver(syncActive).observe(v, { attributes: true, attributeFilter: ["class"] }); }
  return { open };
})();

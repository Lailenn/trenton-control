/* Security records for the devices panel: device details (per passkey) and an access log.
   Data comes only from what the browser and an IP lookup really provide; nothing is invented.
   Stored in the user's private Supabase Storage folder (seguridad/), with a local queue for
   events that happen before there is a session (e.g. a failed fingerprint sign-in). */
window.SecurityLog = (function () {
  "use strict";
  const BUCKET = "invoice-pdfs";
  const DEVICES = "seguridad/dispositivos.json";
  const LOG = "seguridad/actividad.json";
  const QUEUE_KEY = "rp.security.queue";
  const MAX_LOG = 300;
  const cloud = () => window.CloudDB;
  const now = () => new Date().toISOString();

  /* ---------- what the browser really tells us ---------- */
  function deviceInfo() {
    const ua = navigator.userAgent || "", data = navigator.userAgentData;
    const os = /Windows NT/i.test(ua) ? "Windows" : /Android/i.test(ua) ? "Android" : /iPhone|iPad|iPod/i.test(ua) ? "iOS"
      : /Mac OS X|Macintosh/i.test(ua) ? (navigator.maxTouchPoints > 1 ? "iPadOS" : "macOS") : /CrOS/i.test(ua) ? "ChromeOS" : /Linux/i.test(ua) ? "Linux" : "Desconocido";
    const browser = /Edg\//i.test(ua) ? "Edge" : /OPR\//i.test(ua) ? "Opera" : /SamsungBrowser/i.test(ua) ? "Samsung Internet" : /Firefox\//i.test(ua) ? "Firefox"
      : /Chrome\//i.test(ua) ? "Chrome" : /Safari\//i.test(ua) ? "Safari" : "Desconocido";
    const type = data?.mobile || /Mobi|iPhone|Android.+Mobile/i.test(ua) ? "Teléfono" : /iPad|Tablet|Android(?!.*Mobile)/i.test(ua) || os === "iPadOS" ? "Tablet" : "Computadora";
    // Android usually reports the model inside the user agent (e.g. "SM-S918B"); other systems don't.
    const model = (ua.match(/Android [\d.]+; ([^;)]+?)(?: Build|\))/) || [])[1] || "";
    const method = os === "Windows" ? "Windows Hello (huella, rostro o PIN)" : os === "iOS" || os === "iPadOS" || os === "macOS" ? "Face ID / Touch ID o código" : os === "Android" ? "Huella, rostro o bloqueo de pantalla" : "Passkey del aparato";
    return { os, browser, type, model: model && !/^K$/.test(model) ? model.trim() : "", method };
  }

  /* ---------- approximate location from the public IP ---------- */
  let geoCache = null, geoAt = 0;
  async function ipLocation() {
    if (geoCache && Date.now() - geoAt < 10 * 60 * 1000) return geoCache;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 6000);
      const res = await fetch("https://ipapi.co/json/", { signal: controller.signal, cache: "no-store" });
      clearTimeout(timer);
      if (!res.ok) throw new Error("ip lookup " + res.status);
      const d = await res.json();
      if (d.error || d.latitude == null) throw new Error(d.reason || "sin datos");
      geoCache = { source: "ip", ip: d.ip || "", city: d.city || "", region: d.region || "", country: d.country_name || "", lat: Number(d.latitude), lng: Number(d.longitude), at: now() };
    } catch (_) {
      geoCache = { source: "ip", ip: "", city: "", region: "", country: "", lat: null, lng: null, at: now(), unavailable: true };
    }
    geoAt = Date.now();
    return geoCache;
  }
  // GPS only when the user asks for it and the browser grants permission.
  function gpsLocation() {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) return reject(new Error("Este navegador no permite obtener la ubicación GPS."));
      navigator.geolocation.getCurrentPosition(
        p => resolve({ source: "gps", lat: p.coords.latitude, lng: p.coords.longitude, accuracy: Math.round(p.coords.accuracy), at: now() }),
        e => reject(new Error(e.code === 1 ? "No diste permiso para usar la ubicación." : "No se pudo obtener la ubicación GPS.")),
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
      );
    });
  }

  /* ---------- storage ---------- */
  async function readJson(path, fallback) {
    try {
      const blob = await cloud().userFileGet(BUCKET, path);
      return blob ? JSON.parse(await blob.text()) : fallback;
    } catch (_) { return fallback; }
  }
  const writeJson = (path, value) => cloud().userFilePut(BUCKET, path, new Blob([JSON.stringify(value)], { type: "application/json" }), "application/json");
  const hasSession = () => { try { return Boolean(window.TrentonSupabase?.userId?.()); } catch (_) { return false; } };

  async function devices() { return readJson(DEVICES, {}); }
  async function activity() { return readJson(LOG, []); }

  // Saves details for a passkey (merged with what was already stored).
  async function saveDevice(passkeyId, patch) {
    if (!passkeyId) return;
    const all = await devices();
    all[passkeyId] = { ...(all[passkeyId] || {}), ...patch, updatedAt: now() };
    await writeJson(DEVICES, all);
    return all[passkeyId];
  }

  function queue(event) {
    try {
      const list = JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]");
      list.push(event);
      localStorage.setItem(QUEUE_KEY, JSON.stringify(list.slice(-30)));
    } catch (_) {}
  }
  async function flushQueue() {
    let pending = [];
    try { pending = JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]"); } catch (_) {}
    if (!pending.length || !hasSession()) return;
    const log = await activity();
    log.push(...pending);
    log.sort((a, b) => String(b.at).localeCompare(String(a.at)));
    await writeJson(LOG, log.slice(0, MAX_LOG));
    try { localStorage.removeItem(QUEUE_KEY); } catch (_) {}
  }

  // Records one event: { result: "ok"|"fail"|"review", action, method, passkeyId?, note? }
  async function record(event) {
    const info = deviceInfo(), geo = await ipLocation();
    const entry = { at: now(), ...event, device: event.device || `${info.browser} en ${info.os}`, os: info.os, browser: info.browser, ip: geo.ip, city: geo.city, region: geo.region, country: geo.country, lat: geo.lat, lng: geo.lng };
    if (!hasSession()) { queue(entry); return entry; }
    try {
      await flushQueue();
      const log = await activity();
      log.unshift(entry);
      await writeJson(LOG, log.slice(0, MAX_LOG));
    } catch (_) { queue(entry); }
    return entry;
  }

  // After a passkey was registered on this device.
  async function deviceRegistered(passkeyId, name) {
    const info = deviceInfo(), geo = await ipLocation();
    await saveDevice(passkeyId, { name, ...info, registeredAt: now(), lastUsedAt: now(), regLocation: geo, lastLocation: geo });
    await record({ result: "ok", action: "Dispositivo registrado", method: "Passkey", passkeyId, device: name });
  }
  // After a successful sign-in (passkey or password).
  async function signedIn(method, passkeyId) {
    const entry = await record({ result: "ok", action: "Inicio de sesión", method, passkeyId: passkeyId || "" });
    if (passkeyId) await saveDevice(passkeyId, { lastUsedAt: entry.at, lastLocation: { source: "ip", ip: entry.ip, city: entry.city, region: entry.region, country: entry.country, lat: entry.lat, lng: entry.lng, at: entry.at } });
  }
  const signInFailed = (method, reason) => record({ result: "fail", action: "Intento de acceso fallido", method, note: reason || "" });
  async function revoked(passkeyId, name) {
    await record({ result: "review", action: "Acceso revocado", method: "Passkey", passkeyId, device: name });
    const all = await devices();
    if (all[passkeyId]) { all[passkeyId].revokedAt = now(); await writeJson(DEVICES, all); }
  }
  async function saveGps(passkeyId) {
    const gps = await gpsLocation();
    await saveDevice(passkeyId, { gps });
    await record({ result: "ok", action: "Ubicación GPS autorizada", method: "Permiso del navegador", passkeyId });
    return gps;
  }

  return { deviceInfo, ipLocation, devices, activity, saveDevice, record, deviceRegistered, signedIn, signInFailed, revoked, saveGps, flushQueue };
})();

/* Installable app: registers the service worker (only on https, the published site) and
   keeps the browser's install offer so Configuración can show an "Instalar" button. */
window.AppInstall = (function () {
  "use strict";
  let deferred = null;
  const listeners = new Set();
  const notify = () => listeners.forEach(fn => { try { fn(); } catch (_) {} });
  if ("serviceWorker" in navigator && location.protocol === "https:") {
    window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(error => console.warn("Service worker no registrado", error)));
  }
  window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); deferred = e; notify(); });
  window.addEventListener("appinstalled", () => { deferred = null; window.TrentonControl?.toast?.("App instalada. Ya la tienes en tu pantalla de inicio."); notify(); });
  const installed = () => window.matchMedia?.("(display-mode: standalone)").matches || window.navigator.standalone === true;
  const ios = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  function state() {
    if (installed()) return "installed";
    if (deferred) return "ready";
    if (ios()) return "ios";
    return "manual";
  }
  async function install() {
    if (!deferred) return false;
    deferred.prompt();
    const choice = await deferred.userChoice.catch(() => null);
    deferred = null;
    notify();
    return choice?.outcome === "accepted";
  }
  return { state, install, onChange: fn => listeners.add(fn) };
})();

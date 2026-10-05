/* Workspace picker: Trenton stays primary; "Otra empresa" is a separate empty copy. */
(function (root) {
  "use strict";
  const STORAGE_KEY = "trenton.active-company";
  const SESSION_KEY = "trenton.company.session";
  const COMPANIES = {
    trenton: {
      id: "trenton",
      title: "Trenton",
      crumb: "Trenton Builders LLC",
      hero: "Todo el trabajo de <span>Ruben Perla</span>, en un solo lugar.",
      hint: "Invoices, horas, cheques y PDFs de siempre."
    },
    otras: {
      id: "otras",
      title: "Otra empresa",
      crumb: "Otra empresa",
      hero: "Registra trabajos de <span>diferentes clientes y empresas</span>, controla invoices, horas, pagos y documentos desde un solo lugar.",
      hint: "Invoices, horas, otro formato y el tablero de horas en Inicio. No se mezcla con Trenton."
    }
  };

  const $ = selector => document.querySelector(selector);
  const listeners = [];
  let chooseWaiter = null;

  function isValid(id) {
    return id === "trenton" || id === "otras";
  }
  function id() {
    const stored = localStorage.getItem(STORAGE_KEY);
    return isValid(stored) ? stored : "trenton";
  }
  function info() {
    return COMPANIES[id()] || COMPANIES.trenton;
  }
  function isOtras() {
    return id() === "otras";
  }
  function toClient() {
    return isOtras() ? "al cliente" : "a Trenton";
  }
  function draftKey(kind) {
    return isOtras() ? `trenton.draft.${kind}.otras` : `trenton.draft.${kind}`;
  }
  function hasSessionPick() {
    return sessionStorage.getItem(SESSION_KEY) === id();
  }
  function paint() {
    const current = info();
    document.body.dataset.company = current.id;
    document.body.classList.toggle("workspace-otras", current.id === "otras");
    if ($("#topbarCompanyName")) $("#topbarCompanyName").textContent = current.crumb;
    if ($("#heroWorkspaceTitle")) $("#heroWorkspaceTitle").innerHTML = current.hero;
    $("#hoursKanban")?.classList.add("hidden");
    document.querySelectorAll("[data-otras]").forEach(el => {
      if (!("trenton" in el.dataset)) el.dataset.trenton = el.textContent;
      el.textContent = current.id === "otras" ? el.dataset.otras : el.dataset.trenton;
    });
    document.querySelectorAll("[data-company-choice]").forEach(button => {
      button.classList.toggle("is-selected", button.dataset.companyChoice === current.id);
    });
  }
  function setId(next) {
    const value = isValid(next) ? next : "trenton";
    const changed = value !== id();
    localStorage.setItem(STORAGE_KEY, value);
    sessionStorage.setItem(SESSION_KEY, value);
    paint();
    if (changed) listeners.forEach(fn => { try { fn(value); } catch (error) { console.warn(error); } });
    return value;
  }
  function onChange(fn) {
    if (typeof fn === "function") listeners.push(fn);
  }
  function showChooser() {
    $("#authConfigPanel")?.classList.add("hidden");
    $("#authLoginPanel")?.classList.add("hidden");
    const gate = $("#companyGate");
    if (gate) {
      gate.classList.remove("hidden");
      gate.hidden = false;
    }
    $("#authGate")?.classList.remove("hidden");
    $("#authGate")?.setAttribute("data-mode", "company");
    paint();
  }
  function hideChooser() {
    const gate = $("#companyGate");
    if (gate) {
      gate.classList.add("hidden");
      gate.hidden = true;
    }
  }
  function choose() {
    if (hasSessionPick()) {
      paint();
      hideChooser();
      return Promise.resolve(id());
    }
    showChooser();
    return new Promise(resolve => {
      chooseWaiter = resolve;
    });
  }
  function clearSession() {
    try { sessionStorage.removeItem(SESSION_KEY); } catch (_) { /* ignore */ }
  }
  let lockedY = 0;
  function setModalOpen(open) {
    if (open) {
      lockedY = window.scrollY || window.pageYOffset || 0;
      document.body.classList.add("modal-open");
      document.body.style.top = `-${lockedY}px`;
    } else {
      document.body.classList.remove("modal-open");
      document.body.style.top = "";
      window.scrollTo(0, lockedY);
    }
  }
  function bind() {
    $("#companyGate")?.addEventListener("click", event => {
      const button = event.target.closest("[data-company-choice]");
      if (!button) return;
      const value = setId(button.dataset.companyChoice);
      hideChooser();
      if (chooseWaiter) {
        const done = chooseWaiter;
        chooseWaiter = null;
        done(value);
      }
    });
    $("#switchCompanyButton")?.addEventListener("click", () => {
      clearSession();
      root.AuthApp?.switchCompany?.();
    });
    paint();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bind);
  else bind();

  root.setModalOpen = setModalOpen;
  root.CompanyApp = { id, info, isOtras, toClient, draftKey, choose, clearSession, paint, onChange, setId, hasSessionPick };
})(typeof globalThis !== "undefined" ? globalThis : this);

/* Payment balance panel in the edit windows: "Pagó todo" / "Nada recibido" shortcuts,
   a colored state (owes / paid / over-paid) and a nudge when the phase is "Pagado" but money is still owed.
   Each app keeps computing the balance itself; this file only reads the fields it fills. */
(function () {
  "use strict";
  const FORMS = [
    { panel: "#modalBackdrop", total: "#amount", received: "#amountReceived", due: "#amountDue", live: "#balanceLive", stage: "#stage" },
    { panel: "#hoursModalBackdrop", total: "#hoursEditTotal", received: "#hoursEditReceived", due: "#hoursEditDue", live: "#hoursBalanceLive", stage: "#hoursEditStage" },
    { panel: "#jobModalBackdrop", total: "#jobEditTotal", received: "#jobEditReceived", due: "#jobEditDue", live: "#jobBalanceLive", stage: "#jobEditStage" }
  ];
  const $ = selector => document.querySelector(selector);
  const number = value => {
    const parsed = Number(String(value ?? "").replace(/[^\d.]/g, ""));
    return Number.isFinite(parsed) ? parsed : 0;
  };

  function wire(form) {
    const root = $(form.panel), total = $(form.total), received = $(form.received), live = $(form.live), stage = $(form.stage);
    const panel = root?.querySelector(".balance-panel");
    if (!panel || !total || !received || !live) return;
    const warn = document.createElement("p");
    warn.className = "balance-warn";
    warn.hidden = true;
    live.after(warn);
    const full = panel.querySelector('[data-balance="full"]');

    const paint = () => {
      const amount = number(total.value), got = number(received.value);
      const due = Math.round((amount - got) * 100) / 100;
      const paidPhase = stage && stage.value === "paid";
      panel.classList.toggle("is-clear", amount > 0 && due <= 0.004 && due >= -0.004);
      panel.classList.toggle("is-due", due > 0.004);
      panel.classList.toggle("is-over", due < -0.004);
      full?.classList.toggle("is-suggested", paidPhase && due > 0.004);
      if (due < -0.004) {
        warn.hidden = false;
        warn.textContent = "Lo recibido es mayor que el total. Revisa el monto o el anticipo.";
      } else if (paidPhase && due > 0.004) {
        warn.hidden = false;
        warn.textContent = "Está en Pagado pero todavía se debe dinero. Si ya pagaron todo, toca “Pagó todo”.";
      } else {
        warn.hidden = true;
      }
    };
    panel.addEventListener("click", event => {
      const button = event.target.closest("[data-balance]");
      if (!button) return;
      received.value = button.dataset.balance === "full" ? number(total.value).toFixed(2) : "0.00";
      received.dispatchEvent(new Event("input", { bubbles: true }));
      received.dispatchEvent(new Event("change", { bubbles: true }));
      paint();
    });
    // The apps rewrite the summary line whenever the balance changes (typing or opening a record).
    new MutationObserver(paint).observe(live, { childList: true, characterData: true, subtree: true });
    [total, received, stage].forEach(field => field?.addEventListener("input", paint));
    stage?.addEventListener("change", paint);
    paint();
  }

  const start = () => FORMS.forEach(wire);
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();

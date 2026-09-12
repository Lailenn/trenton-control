(function (root) {
  "use strict";
  const PHRASES = [
    "Eres la verdura del caldo.",
    "Hoy el tablero te va a salir redondo.",
    "Con vos el cheque no se pierde en el camino.",
    "Lilian, aquí se cocina el orden.",
    "Si el trabajo llega revuelto, tú lo dejas en su punto.",
    "Hoy se factura con calma y se cobra con ganas.",
    "Eres el sofrito de esta oficina: sin ti no agarra sabor.",
    "Un PDF bien guardado vale más que mil “luego lo busco”.",
    "Trenton avanza, y tú llevas la cuenta con estilo.",
    "Paso a paso, cada invoice se transforma en caldo gordo."
  ];

  const $ = selector => document.querySelector(selector);
  let watching = false;
  let booting = false;
  let quoteIndex = new Date().getDate() % PHRASES.length;
  let quoteTimer;

  function phraseFor(date = new Date()) {
    return PHRASES[date.getDate() % PHRASES.length];
  }

  function greeting(date = new Date()) {
    const hour = date.getHours();
    const hello = hour < 12 ? "Buenos días" : hour < 19 ? "Buenas tardes" : "Buenas noches";
    return `${hello}, Lilian.`;
  }

  function setQuote(element, text) {
    if (!element) return;
    element.classList.remove("quote-swap");
    void element.offsetWidth;
    element.textContent = text;
    element.classList.add("quote-swap");
  }

  function replayWelcome() {
    const hero = document.querySelector(".hero-welcome");
    if (!hero || document.body.classList.contains("is-authenticated") === false) return;
    hero.classList.remove("welcome-play");
    void hero.offsetWidth;
    hero.classList.add("welcome-play");
    setQuote($("#heroQuote"), PHRASES[quoteIndex % PHRASES.length]);
  }

  function setGate(mode) {
    $("#authConfigPanel")?.classList.toggle("hidden", mode !== "config");
    $("#authLoginPanel")?.classList.toggle("hidden", mode !== "login");
    $("#authGate")?.setAttribute("data-mode", mode);
  }

  function showApp(show) {
    $("#authGate")?.classList.toggle("hidden", show);
    $("#appShell")?.classList.toggle("app-locked", !show);
    if ($("#appShell")) $("#appShell").hidden = !show;
    document.body.classList.toggle("is-authenticated", show);
    if (show) {
      $("#authGate")?.classList.remove("auth-play");
      requestAnimationFrame(() => replayWelcome());
    } else {
      $("#authGate")?.classList.add("auth-play");
    }
  }

  function cycleQuotes() {
    clearInterval(quoteTimer);
    quoteTimer = setInterval(() => {
      quoteIndex = (quoteIndex + 1) % PHRASES.length;
      const text = PHRASES[quoteIndex];
      if (!$("#authGate")?.classList.contains("hidden")) setQuote($("#authWelcomeQuote"), text);
      if (document.body.classList.contains("is-authenticated")) setQuote($("#heroQuote"), text);
    }, 5200);
  }

  function watchAuth(onReady, onLogout) {
    if (watching || !root.TrentonConfig.ready()) return;
    watching = true;
    root.TrentonSupabase.client.auth.onAuthStateChange(async (_event, session) => {
      const user = session?.user || null;
      root.CloudDB.setUser(user);
      if (!user) {
        showApp(false);
        setGate(root.TrentonConfig.ready() ? "login" : "config");
        onLogout?.();
        return;
      }
      showApp(true);
      if ($("#welcomeGreeting")) $("#welcomeGreeting").textContent = greeting();
      setQuote($("#heroQuote"), PHRASES[quoteIndex % PHRASES.length]);
      setQuote($("#authWelcomeQuote"), PHRASES[quoteIndex % PHRASES.length]);
      if (booting) return;
      booting = true;
      try { await onReady?.(user); } finally { booting = false; }
    });
  }

  async function start({ onReady, onLogout }) {
    showApp(false);
    setGate(root.TrentonConfig.ready() ? "login" : "config");
    cycleQuotes();

    $("#loginForm")?.addEventListener("submit", async event => {
      event.preventDefault();
      $("#authError").textContent = "";
      $("#loginButton").disabled = true;
      try {
        if (!root.TrentonConfig.ready()) throw new Error("Esta copia de la app aún no tiene la conexión a la nube.");
        watchAuth(onReady, onLogout);
        const { error } = await root.TrentonSupabase.client.auth.signInWithPassword({
          email: $("#loginEmail").value.trim(),
          password: $("#loginPassword").value
        });
        if (error) throw error;
      } catch (error) {
        $("#authError").textContent = error.message || "No se pudo entrar. Revisa el correo y la contraseña.";
      } finally {
        $("#loginButton").disabled = false;
      }
    });
    $("#logoutButton")?.addEventListener("click", async () => {
      if (root.TrentonConfig.ready()) await root.TrentonSupabase.client.auth.signOut();
    });

    watchAuth(onReady, onLogout);
  }

  root.AuthApp = { start, greeting, phrase: phraseFor, phrases: PHRASES, replayWelcome };
})(typeof globalThis !== "undefined" ? globalThis : this);

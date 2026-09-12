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

  function phraseFor(date = new Date()) {
    return PHRASES[date.getDate() % PHRASES.length];
  }

  function greeting(date = new Date()) {
    const hour = date.getHours();
    const hello = hour < 12 ? "Buenos días" : hour < 19 ? "Buenas tardes" : "Buenas noches";
    return `${hello}, Lilian.`;
  }

  function setGate(mode) {
    $("#authConfigPanel")?.classList.toggle("hidden", mode !== "config");
    $("#authLoginPanel")?.classList.toggle("hidden", mode !== "login");
  }

  function showApp(show) {
    $("#authGate")?.classList.toggle("hidden", show);
    $("#appShell")?.classList.toggle("app-locked", !show);
    if ($("#appShell")) $("#appShell").hidden = !show;
    document.body.classList.toggle("is-authenticated", show);
  }

  function fillConfigForm() {
    const config = root.TrentonConfig.get();
    if ($("#supabaseUrl")) $("#supabaseUrl").value = config.url;
    if ($("#supabaseAnon")) $("#supabaseAnon").value = config.anonKey;
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
      if ($("#heroQuote")) $("#heroQuote").textContent = phraseFor();
      if ($("#authWelcomeQuote")) $("#authWelcomeQuote").textContent = phraseFor();
      if (booting) return;
      booting = true;
      try { await onReady?.(user); } finally { booting = false; }
    });
  }

  async function start({ onReady, onLogout }) {
    fillConfigForm();
    showApp(false);
    setGate(root.TrentonConfig.ready() ? "login" : "config");

    $("#saveSupabaseConfig")?.addEventListener("click", () => {
      root.TrentonConfig.set($("#supabaseUrl").value, $("#supabaseAnon").value);
      root.TrentonSupabase.reset();
      watching = false;
      if (!root.TrentonConfig.ready()) {
        $("#authError").textContent = "Revisa la URL (https://xxxx.supabase.co) y la anon key.";
        return;
      }
      $("#authError").textContent = "Proyecto conectado. Entra con el correo de Lilian.";
      setGate("login");
      watchAuth(onReady, onLogout);
    });
    $("#editSupabaseConfig")?.addEventListener("click", () => {
      fillConfigForm();
      setGate("config");
    });
    $("#loginForm")?.addEventListener("submit", async event => {
      event.preventDefault();
      $("#authError").textContent = "";
      $("#loginButton").disabled = true;
      try {
        if (!root.TrentonConfig.ready()) throw new Error("Primero guarda la URL y la anon key del proyecto.");
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

  root.AuthApp = { start, greeting, phrase: phraseFor, phrases: PHRASES };
})(typeof globalThis !== "undefined" ? globalThis : this);

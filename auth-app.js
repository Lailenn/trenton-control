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
  let profile = { displayName: "Lilian", jobTitle: "Secretaria", email: "", createdAt: "2026-01-01", avatarUrl: null };
  let avatarObjectUrl = null;

  function phraseFor(date = new Date()) {
    return PHRASES[date.getDate() % PHRASES.length];
  }

  function helloLine(date = new Date()) {
    const hour = date.getHours();
    return hour < 12 ? "Buenos días," : hour < 19 ? "Buenas tardes," : "Buenas noches,";
  }

  function greeting(date = new Date()) {
    const name = String(profile.displayName || "Lilian").trim().split(/\s+/)[0] || "Lilian";
    return `${helloLine(date).replace(",", "")}, ${name}. 👋`;
  }

  function initialsFrom(name) {
    const parts = String(name || "Lilian").trim().split(/\s+/).filter(Boolean);
    return ((parts[0]?.[0] || "L") + (parts[1]?.[0] || "")).toUpperCase() || "LP";
  }

  function paintAvatarSlots(url) {
    const pairs = [
      [$("#topbarAvatarImg"), $("#topbarAvatarInitials")],
      [$("#topbarBrandAvatarImg"), $("#topbarBrandInitials")],
      [$("#sidebarAvatarImg"), $("#sidebarAvatarInitials")],
      [$("#profilePhotoImg"), $("#profilePhotoInitials")]
    ];
    pairs.forEach(([img, initialsEl]) => {
      if (img) {
        img.hidden = !url;
        if (url) img.src = url;
      }
      if (initialsEl) {
        initialsEl.hidden = Boolean(url);
        initialsEl.textContent = initialsFrom(profile.displayName);
      }
    });
  }

  function paintProfile() {
    const year = String(profile.createdAt || "2026").slice(0, 4);
    if ($("#profileDisplayName")) $("#profileDisplayName").textContent = profile.displayName || "Lilian";
    if ($("#profileNameInput")) $("#profileNameInput").value = profile.displayName || "Lilian";
    if ($("#profileRoleInput")) $("#profileRoleInput").value = profile.jobTitle || "Secretaria";
    if ($("#profileEmail")) $("#profileEmail").textContent = profile.email || sessionEmail() || "—";
    if ($("#profileEmailLine")) $("#profileEmailLine").textContent = profile.email || sessionEmail() || "";
    if ($("#profileSince")) $("#profileSince").textContent = year;
    if ($("#profileHello")) $("#profileHello").textContent = helloLine().replace(",", "");
    if ($("#profileQuote")) $("#profileQuote").textContent = `“${phraseFor()}”`;
    if ($("#sidebarProfileName")) $("#sidebarProfileName").textContent = profile.displayName || "Lilian";
    if ($("#sidebarRole")) $("#sidebarRole").textContent = profile.jobTitle || "Secretaria";
    if ($("#topbarProfileName")) $("#topbarProfileName").textContent = profile.displayName || "Lilian";
    if ($("#topbarProfileRole")) $("#topbarProfileRole").textContent = profile.jobTitle || "Secretaria";
    if ($("#welcomeGreeting")) $("#welcomeGreeting").textContent = greeting();
    ["#profileAvatarButton", "#topbarProfileButton", "#sidebarProfileButton"].forEach(selector => {
      const button = $(selector);
      if (button) button.title = profile.displayName || "Tu perfil";
    });
    paintAvatarSlots(profile.avatarUrl);
  }

  function setProfileOpen(open) {
    $("#profileLayer")?.classList.toggle("hidden", !open);
    $("#profileAvatarButton")?.setAttribute("aria-expanded", String(open));
    $("#topbarProfileButton")?.setAttribute("aria-expanded", String(open));
    $("#sidebarProfileButton")?.setAttribute("aria-expanded", String(open));
  }

  function sessionEmail() {
    const user = root.TrentonSupabase?.sessionUser?.();
    const identityEmail = (user?.identities || [])
      .map(item => item?.identity_data?.email || item?.identity_data?.email_address)
      .find(Boolean);
    return String(
      user?.email
      || user?.new_email
      || user?.user_metadata?.email
      || user?.user_metadata?.email_address
      || identityEmail
      || localStorage.getItem("trenton.remember-email")
      || ""
    ).trim();
  }

  function setProfileStatus(message, isError = false) {
    const status = $("#profileError");
    if (status) {
      status.textContent = message || "";
      status.classList.toggle("is-ok", Boolean(message) && !isError);
    }
    if (message && (isError || ! /[.…]$/.test(message))) toast(message);
  }

  async function loadProfile() {
    if (!root.CloudDB?.getProfile) return;
    try {
      const next = await root.CloudDB.getProfile();
      const blob = await root.CloudDB.ensureAvatar(next);
      if (avatarObjectUrl) URL.revokeObjectURL(avatarObjectUrl);
      avatarObjectUrl = blob ? URL.createObjectURL(blob) : null;
      profile = { ...next, email: next.email || sessionEmail(), avatarUrl: avatarObjectUrl };
    } catch (error) {
      console.warn("No se pudo leer el perfil", error);
      profile = { ...profile, email: profile.email || sessionEmail() };
      try {
        const blob = await root.CloudDB.ensureAvatar(profile);
        if (blob) {
          if (avatarObjectUrl) URL.revokeObjectURL(avatarObjectUrl);
          avatarObjectUrl = URL.createObjectURL(blob);
          profile.avatarUrl = avatarObjectUrl;
        }
      } catch (_) { /* keep initials */ }
    }
    paintProfile();
  }

  async function saveProfileNow() {
    const displayName = $("#profileNameInput")?.value.trim() || "Lilian";
    const jobTitle = $("#profileRoleInput")?.value.trim() || "Secretaria";
    setProfileStatus("Guardando perfil…");
    const saved = await root.CloudDB.saveProfile({ ...profile, displayName, jobTitle, avatarPath: profile.avatarPath, email: profile.email || sessionEmail() });
    profile = { ...profile, ...saved, displayName: saved.displayName, jobTitle: saved.jobTitle, email: saved.email || sessionEmail() };
    paintProfile();
    setProfileStatus("Perfil guardado en la nube.");
  }

  async function saveAvatarNow(file) {
    setProfileStatus("Subiendo foto…");
    const result = await root.CloudDB.saveAvatar(file);
    if (avatarObjectUrl) URL.revokeObjectURL(avatarObjectUrl);
    avatarObjectUrl = URL.createObjectURL(result.blob);
    profile = { ...profile, avatarPath: result.path, avatarUrl: avatarObjectUrl, email: profile.email || sessionEmail() };
    paintProfile();
    setProfileStatus("Foto de perfil guardada en la nube.");
  }

  function bindProfile() {
    const openProfile = async () => {
      setProfileStatus("");
      paintProfile();
      setProfileOpen(true);
      try { await loadProfile(); }
      catch (error) { setProfileStatus(error.message || "No se pudo leer el perfil.", true); }
    };
    $("#profileAvatarButton")?.addEventListener("click", openProfile);
    $("#topbarProfileButton")?.addEventListener("click", openProfile);
    $("#sidebarProfileButton")?.addEventListener("click", openProfile);
    $("#profileScrim")?.addEventListener("click", () => setProfileOpen(false));
    $("#profilePhotoFile")?.addEventListener("change", async event => {
      const file = event.target.files?.[0];
      event.target.value = "";
      if (!file) return;
      try { await saveAvatarNow(file); }
      catch (error) { setProfileStatus(error.message || "No se pudo guardar la foto. Corre supabase/schema-update-profile.sql en Supabase.", true); }
    });
    $("#saveProfileButton")?.addEventListener("click", async () => {
      const button = $("#saveProfileButton");
      button.disabled = true;
      try { await saveProfileNow(); }
      catch (error) { setProfileStatus(error.message || "No se pudo guardar el perfil.", true); }
      finally { button.disabled = false; }
    });
    document.addEventListener("keydown", event => {
      if (event.key === "Escape") setProfileOpen(false);
    });
  }

  function paintLoginHello() {
    const line = $("#authHelloLine");
    if (line) line.textContent = helloLine();
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
      refreshPasskeyPanel();
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

  function toast(message) {
    if (root.TrentonControl?.toast) root.TrentonControl.toast(message);
  }

  function authClient() {
    return root.TrentonSupabase?.client?.auth || null;
  }

  function originInfo() {
    const hostname = location.hostname || "localhost";
    const origin = location.origin || `${location.protocol}//${hostname}`;
    const ipHost = hostname === "127.0.0.1" || hostname === "[::1]" || /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname);
    const loopback = hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
    return {
      origin,
      rpId: hostname === "localhost" ? "localhost" : hostname,
      port: location.port || (location.protocol === "https:" ? "443" : "80"),
      secure: Boolean(window.isSecureContext),
      loopback,
      ipHost,
      supported: typeof window.PublicKeyCredential === "function"
    };
  }

  function dashboardHint() {
    const info = originInfo();
    if (info.ipHost) {
      return "Estás en una IP (127.0.0.1). En el celular usa la web de GitHub. En la PC abre http://localhost:5500, no la IP.";
    }
    if (info.loopback) {
      return `Esta es la copia local. En el celular no uses localhost: abre la web de GitHub. Si pruebas huella aquí, en Supabase pon RP ID “localhost” y Origins “${info.origin}”.`;
    }
    return `Esta es la web del celular. En Supabase → Authentication → Passkeys pon: Nombre “Ruben Perla”, RP ID “${info.rpId}”, Origins “${info.origin}”. No uses localhost. Luego Authentication → URL Configuration → Site URL = ${info.origin}.`;
  }

  function paintPasskeyHints() {
    const info = originInfo();
    const loginHint = $("#loginPasskeyHint");
    const originHint = $("#passkeyOriginHint");
    let text = dashboardHint();
    if (!info.supported) text = "Este navegador no admite huella / Windows Hello. Sigue usando correo y contraseña.";
    else if (info.ipHost) text = dashboardHint();
    else if (!info.secure) text = "Abre la app en https:// (GitHub) o en http://localhost. En una IP de red la huella no funciona.";
    if (loginHint) loginHint.textContent = text;
    if (originHint) originHint.textContent = text;
  }

  function passkeyMessage(error) {
    if (!error) return "No se pudo usar la huella.";
    const status = Number(error.status || error.statusCode || 0);
    const code = String(error.code || error.error_code || error.name || "");
    const msg = String(error.message || "");
    const blob = `${status} ${code} ${msg}`.toLowerCase();
    if (blob.includes("passkey_disabled") || blob.includes("passkeys are not enabled")) {
      return "Falta activar Passkeys en Supabase. Ve a Authentication → Passkeys, enciéndelo, pulsa Save changes y recarga.";
    }
    if (blob.includes("email_not_confirmed") || blob.includes("email not confirmed")) {
      return "El correo de Lilian no está confirmado. En Supabase → Authentication → Users abre el usuario y márcalo como Email confirmed.";
    }
    if (blob.includes("insufficient_aal") || blob.includes("authenticator assurance")) {
      return "Esta cuenta tiene un segundo factor (MFA). Completa ese paso o quítalo en Authentication → Users → el usuario → MFA, y luego registra la huella.";
    }
    if (blob.includes("anonymous") || blob.includes("is_anonymous")) {
      return "Esta sesión es anónima. Entra con el correo y la contraseña de Lilian, no como invitada.";
    }
    if (blob.includes("session_not_found") || blob.includes("session from session_id") || blob.includes("bad_jwt") || blob.includes("invalid jwt")) {
      return "La sesión no vale para la huella. Pulsa Salir, entra otra vez con correo y contraseña, y registra el aparato enseguida.";
    }
    if (blob.includes("failed to fetch") || blob.includes("networkerror") || blob.includes("load failed")) {
      const info = originInfo();
      return `El botón de huella no pudo hablar con Supabase. En el celular hay que configurar Passkeys para esta web, no para localhost. RP ID “${info.rpId}”, Origins “${info.origin}”. Guarda, recarga y registra el aparato una vez con contraseña. Samsung Pass en el correo es otra cosa: desbloquea la contraseña guardada y sí puede entrar.`;
    }
    if (status === 403 || blob.includes("forbidden") || blob.includes("no_authorization")) {
      const info = originInfo();
      return `Supabase rechazó la huella (403). 1) Authentication → Users → el correo Confirmed. 2) URL Configuration → Site URL = ${info.origin}. 3) Passkeys RP ID “${info.rpId}” y Origins “${info.origin}”. 4) Salir y entrar de nuevo. Detalle: ${msg || code || "Forbidden"}`;
    }
    if (blob.includes("webauthn_credential_not_found") || blob.includes("credential_not_found")) {
      return "Este aparato aún no está registrado. Entra con contraseña y pulsa “Registrar este aparato”.";
    }
    if (blob.includes("webauthn_credential_exists")) {
      return "Este aparato ya tenía una huella guardada. Prueba “Entrar con huella / Windows Hello”.";
    }
    if (blob.includes("too_many_passkeys")) {
      return "Ya hay demasiados aparatos registrados. Borra uno en Supabase o registra solo el celular y la PC.";
    }
    if (blob.includes("notallowed") || blob.includes("abort") || blob.includes("timed out")) {
      return "Se canceló la huella o Windows Hello, o este aparato no la ofreció.";
    }
    if (blob.includes("invalidstate")) {
      return "Este navegador ya tiene una llave para esta cuenta. Prueba entrar con huella, o usa otro aparato.";
    }
    if (!window.isSecureContext) {
      return "Abre la app en https:// o en http://localhost. Desde una IP de red no se puede usar la huella.";
    }
    if (typeof window.PublicKeyCredential !== "function") {
      return "Este navegador no admite huella / Windows Hello.";
    }
    if (blob.includes("registerpasskey is not") || blob.includes("signinwithpasskey is not")) {
      return "Recarga la página con Ctrl+F5. Falta la librería nueva de Supabase.";
    }
    return msg || "No se pudo usar la huella. Revisa el panel de Passkeys en Supabase.";
  }

  function userIsConfirmed(user) {
    return Boolean(user?.email_confirmed_at || user?.confirmed_at || user?.phone_confirmed_at);
  }

  async function currentAuthUser() {
    const auth = authClient();
    if (!auth) throw new Error("Esta copia de la app aún no tiene la conexión a la nube.");
    const { data, error } = await auth.getUser();
    if (error) throw error;
    return data?.user || null;
  }

  async function assertPasskeyUser() {
    const user = await currentAuthUser();
    if (!user) throw new Error("Pulsa Salir y entra otra vez con correo y contraseña.");
    if (user.is_anonymous) {
      throw new Error("Esta sesión es anónima. Entra con el correo y la contraseña de Lilian.");
    }
    if (user.email && !userIsConfirmed(user)) {
      throw new Error("El correo no está confirmado. En Supabase → Authentication → Users abre a Lilian y actívale Email confirmed.");
    }
    const auth = authClient();
    if (auth?.mfa?.getAuthenticatorAssuranceLevel) {
      try {
        const { data } = await auth.mfa.getAuthenticatorAssuranceLevel();
        if (data?.nextLevel === "aal2" && data?.currentLevel !== "aal2") {
          throw new Error("Esta cuenta tiene MFA. Quítalo en Authentication → Users o completa el segundo factor antes de registrar la huella.");
        }
      } catch (error) {
        if (String(error.message || "").includes("MFA") || String(error.message || "").includes("segundo factor")) throw error;
      }
    }
    return user;
  }

  function deviceLabel() {
    const ua = navigator.userAgent || "";
    if (/iPhone|iPad|iPod/i.test(ua)) return "iPhone / iPad de Lilian";
    if (/Android/i.test(ua)) return "Celular Android de Lilian";
    if (/Windows/i.test(ua)) return "PC Windows de Lilian";
    if (/Mac OS X|Macintosh/i.test(ua)) return "Mac de Lilian";
    return "Aparato de Lilian";
  }

  function setBusy(buttons, busy) {
    buttons.forEach(button => {
      if (!button) return;
      button.disabled = busy;
    });
  }

  async function listPasskeys() {
    const auth = authClient();
    if (!auth?.passkey?.list) return [];
    const result = await auth.passkey.list();
    if (result?.error) throw result.error;
    const raw = result?.data;
    if (Array.isArray(raw)) return raw;
    if (Array.isArray(raw?.passkeys)) return raw.passkeys;
    return [];
  }

  async function refreshPasskeyPanel() {
    paintPasskeyHints();
    const status = $("#passkeyStatus");
    const buttons = document.querySelectorAll(".js-register-passkey");
    const info = originInfo();
    if (!status) return;
    if (!info.supported || !info.secure) {
      status.textContent = info.supported
        ? "Este aparato no puede registrar huella aquí. Abre la app en https:// o en http://localhost."
        : "Este navegador no admite huella / Windows Hello. El correo y la contraseña siguen igual.";
      buttons.forEach(button => { button.disabled = true; });
      return;
    }
    buttons.forEach(button => { button.disabled = false; });
    try {
      await assertPasskeyUser();
      const passkeys = await listPasskeys();
      if (!passkeys.length) {
        status.textContent = "Aún no hay huella en esta cuenta. Pulsa “Registrar este aparato” y confirma con el dedo, Face ID o Windows Hello.";
        return;
      }
      const names = passkeys.map(item => item.friendly_name || item.friendlyName || "aparato").join(", ");
      status.textContent = `Ya hay ${passkeys.length === 1 ? "1 aparato" : passkeys.length + " aparatos"}: ${names}. Puedes registrar también el celular o la PC.`;
    } catch (error) {
      status.textContent = passkeyMessage(error);
    }
  }

  async function signInWithPasskey() {
    const auth = authClient();
    if (!auth) throw new Error("Esta copia de la app aún no tiene la conexión a la nube.");
    if (typeof auth.signInWithPasskey !== "function") {
      throw new Error("Recarga la página con Ctrl+F5. Falta la librería nueva de Supabase.");
    }
    const { error } = await auth.signInWithPasskey();
    if (error) throw error;
  }

  async function registerThisDevice() {
    const auth = authClient();
    if (!auth) throw new Error("Esta copia de la app aún no tiene la conexión a la nube.");
    if (typeof auth.registerPasskey !== "function") {
      throw new Error("Recarga la página con Ctrl+F5. Falta la librería nueva de Supabase.");
    }
    await assertPasskeyUser();
    const { data, error } = await auth.registerPasskey({ friendlyName: deviceLabel() });
    if (error) throw error;
    const id = data?.id;
    if (id && auth.passkey?.update) {
      try {
        await auth.passkey.update({ passkeyId: id, friendlyName: deviceLabel() });
      } catch (_ignore) { /* el nombre amistoso es opcional */ }
    }
    return data;
  }

  let loggingOut = false;

  function closeMobileMenu() {
    const sidebar = $("#sidebar");
    sidebar?.classList.remove("open");
    $("#sidebarScrim")?.classList.remove("visible");
    document.body.classList.remove("sidebar-lock");
    const menu = $("#mobileMenu");
    menu?.setAttribute("aria-expanded", "false");
    menu?.setAttribute("aria-label", "Abrir menú");
  }

  async function logoutNow() {
    if (loggingOut) return;
    loggingOut = true;
    const buttons = document.querySelectorAll(".js-logout");
    setBusy(buttons, true);
    closeMobileMenu();
    showApp(false);
    setGate(root.TrentonConfig.ready() ? "login" : "config");
    root.CloudDB?.setUser?.(null);
    try {
      const auth = authClient();
      if (auth?.signOut) {
        await Promise.race([
          auth.signOut({ scope: "local" }),
          new Promise(resolve => setTimeout(resolve, 1200))
        ]).catch(() => {});
        auth.signOut({ scope: "global" }).catch(() => {});
      }
    } catch (_error) {
      /* already back on the login screen */
    } finally {
      loggingOut = false;
      setBusy(buttons, false);
    }
  }

  function bindLogoutButtons() {
    document.querySelectorAll(".js-logout").forEach(button => {
      const fire = event => {
        event.preventDefault();
        event.stopPropagation();
        logoutNow();
      };
      button.addEventListener("click", fire);
      button.addEventListener("touchend", fire, { passive: false });
    });
  }

  function watchAuth(onReady, onLogout) {
    if (watching || !root.TrentonConfig.ready()) return;
    watching = true;
    root.TrentonSupabase.client.auth.onAuthStateChange(async (_event, session) => {
      const user = session?.user || null;
      root.TrentonSupabase?.setSessionUser?.(user);
      root.CloudDB.setUser(user);
      if (!user) {
        setProfileOpen(false);
        showApp(false);
        setGate(root.TrentonConfig.ready() ? "login" : "config");
        onLogout?.();
        return;
      }
      showApp(true);
      paintLoginHello();
      try {
        const { data } = await root.TrentonSupabase.client.auth.getUser();
        if (data?.user) {
          root.TrentonSupabase.setSessionUser(data.user);
          root.CloudDB.setUser(data.user);
        }
      } catch (_) { /* session.user still used */ }
      profile = { ...profile, email: sessionEmail() || profile.email };
      paintProfile();
      await loadProfile();
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
    paintLoginHello();
    paintPasskeyHints();
    cycleQuotes();

    const remembered = localStorage.getItem("trenton.remember-email");
    if (remembered && $("#loginEmail")) {
      $("#loginEmail").value = remembered;
      if ($("#rememberMe")) $("#rememberMe").checked = true;
    }

    $("#togglePassword")?.addEventListener("click", () => {
      const input = $("#loginPassword");
      if (!input) return;
      const hidden = input.type === "password";
      input.type = hidden ? "text" : "password";
      $("#togglePassword").setAttribute("aria-label", hidden ? "Ocultar contraseña" : "Mostrar contraseña");
    });
    $("#forgotPassword")?.addEventListener("click", () => {
      $("#authError").textContent = "Pídele a quien mantiene la app que te restablezca la contraseña. Lilian no cambia claves desde aquí.";
    });

    $("#loginForm")?.addEventListener("submit", async event => {
      event.preventDefault();
      $("#authError").textContent = "";
      $("#loginButton").disabled = true;
      try {
        if (!root.TrentonConfig.ready()) throw new Error("Esta copia de la app aún no tiene la conexión a la nube.");
        const email = $("#loginEmail").value.trim();
        if ($("#rememberMe")?.checked) localStorage.setItem("trenton.remember-email", email);
        else localStorage.removeItem("trenton.remember-email");
        watchAuth(onReady, onLogout);
        const { error } = await root.TrentonSupabase.client.auth.signInWithPassword({
          email,
          password: $("#loginPassword").value
        });
        if (error) throw error;
      } catch (error) {
        $("#authError").textContent = error.message || "No se pudo entrar. Revisa el correo y la contraseña.";
      } finally {
        $("#loginButton").disabled = false;
      }
    });

    $("#passkeyLoginButton")?.addEventListener("click", async () => {
      $("#authError").textContent = "";
      const button = $("#passkeyLoginButton");
      setBusy([button], true);
      try {
        if (!root.TrentonConfig.ready()) throw new Error("Esta copia de la app aún no tiene la conexión a la nube.");
        watchAuth(onReady, onLogout);
        await signInWithPasskey();
      } catch (error) {
        $("#authError").textContent = passkeyMessage(error);
      } finally {
        setBusy([button], false);
      }
    });

    document.querySelectorAll(".js-register-passkey").forEach(button => {
      button.addEventListener("click", async () => {
        const buttons = document.querySelectorAll(".js-register-passkey");
        const status = $("#passkeyStatus");
        setBusy(buttons, true);
        try {
          await registerThisDevice();
          const done = "Aparato registrado. La próxima vez puedes entrar con huella / Windows Hello. La contraseña sigue de respaldo.";
          if (status) status.textContent = done;
          toast(done);
          await refreshPasskeyPanel();
        } catch (error) {
          const message = passkeyMessage(error);
          if (status) status.textContent = message;
          toast(message);
        } finally {
          setBusy(buttons, false);
        }
      });
    });

    bindLogoutButtons();
    bindProfile();
    watchAuth(onReady, onLogout);
  }

  root.AuthApp = { start, greeting, phrase: phraseFor, phrases: PHRASES, replayWelcome, loadProfile };
})(typeof globalThis !== "undefined" ? globalThis : this);

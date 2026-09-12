/* Optional hardcoded keys. Prefer pegar URL y anon key en la pantalla de entrada.
   Nunca pongas la service_role aquí. */
window.TRENTON_SUPABASE_URL = "";
window.TRENTON_SUPABASE_ANON = "";

window.TrentonConfig = {
  get() {
    return {
      url: (localStorage.getItem("trenton.supabase.url") || window.TRENTON_SUPABASE_URL || "").trim(),
      anonKey: (localStorage.getItem("trenton.supabase.anon") || window.TRENTON_SUPABASE_ANON || "").trim()
    };
  },
  set(url, anonKey) {
    localStorage.setItem("trenton.supabase.url", String(url || "").trim());
    localStorage.setItem("trenton.supabase.anon", String(anonKey || "").trim());
  },
  clear() {
    localStorage.removeItem("trenton.supabase.url");
    localStorage.removeItem("trenton.supabase.anon");
  },
  ready() {
    const config = this.get();
    return /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(config.url.replace(/\/$/, "")) && config.anonKey.length > 40;
  }
};

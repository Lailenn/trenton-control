(function (root) {
  "use strict";
  let client = null;
  let lastUser = null;

  function create() {
    const config = root.TrentonConfig?.get() || {};
    if (!root.supabase?.createClient) throw new Error("No se cargó la librería de Supabase. Revisa la conexión.");
    if (!root.TrentonConfig?.ready()) throw new Error("Falta la URL y la anon key del proyecto Supabase.");
    const url = config.url.replace(/\/$/, "");
    const options = {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        lock: async (_name, _timeout, fn) => fn(),
        experimental: { passkey: true }
      }
    };
    try {
      client = root.supabase.createClient(url, config.anonKey, options);
    } catch (_error) {
      delete options.auth.lock;
      client = root.supabase.createClient(url, config.anonKey, options);
    }
    return client;
  }

  root.TrentonSupabase = {
    get client() {
      if (!client) create();
      return client;
    },
    reset() { client = null; lastUser = null; },
    userId() { return lastUser?.id || ""; },
    sessionUser() { return lastUser; },
    setSessionUser(user) { lastUser = user || null; },
    async session() {
      const { data, error } = await this.client.auth.getSession();
      if (error) throw error;
      lastUser = data.session?.user || null;
      return data.session;
    }
  };
})(typeof globalThis !== "undefined" ? globalThis : this);

(function (root) {
  "use strict";
  let client = null;

  function create() {
    const config = root.TrentonConfig?.get() || {};
    if (!root.supabase?.createClient) throw new Error("No se cargó la librería de Supabase. Revisa la conexión.");
    if (!root.TrentonConfig?.ready()) throw new Error("Falta la URL y la anon key del proyecto Supabase.");
    const url = config.url.replace(/\/$/, "");
    client = root.supabase.createClient(url, config.anonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });
    return client;
  }

  root.TrentonSupabase = {
    get client() {
      if (!client) create();
      return client;
    },
    reset() { client = null; },
    userId() { return this.sessionUser()?.id || ""; },
    sessionUser() { return null; },
    async session() {
      const { data, error } = await this.client.auth.getSession();
      if (error) throw error;
      const user = data.session?.user || null;
      this.sessionUser = () => user;
      return data.session;
    }
  };
})(typeof globalThis !== "undefined" ? globalThis : this);

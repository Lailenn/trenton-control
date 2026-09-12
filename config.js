/* Conexión pública del proyecto. Va en el código a propósito:
   cualquier PC, celular u otro navegador entra solo con correo y contraseña.
   La anon key NO es un secreto. Nunca pongas la service_role aquí. */
window.TRENTON_SUPABASE_URL = "https://mbbanviyspkyxjsonxwf.supabase.co";
window.TRENTON_SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1iYmFudml5c3BreXhqc29ueHdmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkyMjIwMDcsImV4cCI6MjEwNDc5ODAwN30.P-LWqDuLMNsI2DstWhCL3KmZ4nfYR0CS14Yz3mROjIs";

window.TrentonConfig = {
  bakedIn() {
    const url = (window.TRENTON_SUPABASE_URL || "").trim().replace(/\/$/, "");
    const anonKey = (window.TRENTON_SUPABASE_ANON || "").trim();
    return this.isValid(url, anonKey);
  },
  isValid(url, anonKey) {
    return /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(url) && String(anonKey || "").length > 40;
  },
  get() {
    const bakedUrl = (window.TRENTON_SUPABASE_URL || "").trim().replace(/\/$/, "");
    const bakedAnon = (window.TRENTON_SUPABASE_ANON || "").trim();
    if (this.isValid(bakedUrl, bakedAnon)) return { url: bakedUrl, anonKey: bakedAnon };
    return {
      url: (localStorage.getItem("trenton.supabase.url") || "").trim().replace(/\/$/, ""),
      anonKey: (localStorage.getItem("trenton.supabase.anon") || "").trim()
    };
  },
  ready() {
    const config = this.get();
    return this.isValid(config.url, config.anonKey);
  }
};

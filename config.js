/* Conexión pública del proyecto. Va en el código a propósito:
   cualquier PC, celular u otro navegador entra solo con correo y contraseña.
   La anon key NO es un secreto. Nunca pongas la service_role aquí. */
window.TRENTON_SUPABASE_URL = "https://mbbanviyspkyxjsonxwf.supabase.co";
window.TRENTON_SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1iYmFudml5c3BreXhqc29ueHdmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkyMjIwMDcsImV4cCI6MjEwNDc5ODAwN30.P-LWqDuLMNsI2DstWhCL3KmZ4nfYR0CS14Yz3mROjIs";

/* Google Maps (mapa de "Dispositivos registrados"). Una clave de navegador siempre queda visible
   en la página: lo que la protege es restringirla en Google Cloud Console a
   - Aplicaciones: Sitios web (HTTP referrers) → https://lailenn.github.io/* y http://127.0.0.1:5500/*
   - APIs: solo "Maps JavaScript API".
   Vacía = el panel muestra la ubicación y el botón "Ver en Google Maps", sin mapa embebido. */
window.TRENTON_MAPS_KEY = "";

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

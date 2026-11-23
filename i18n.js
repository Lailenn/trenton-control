/* Interface language (Español / English). The app is written in Spanish; when English is
   chosen, interface texts are swapped using the dictionary below (exact matches plus a few
   patterns for texts with numbers). User data (names, addresses, amounts), typed values,
   document previews and PDFs are never touched. Switching back restores the originals. */
window.I18n = (function () {
  "use strict";
  const KEY = "rp.lang";
  const D = {
    // Boot, login, workspace
    "Espere un momento...": "Please wait...", "Conectando…": "Connecting…", "Verificando tu sesión…": "Checking your session…", "Cargando tu información…": "Loading your information…", "Casi listo…": "Almost ready…",
    "Control de facturas": "Invoice control", "y trabajos": "and jobs", "Facturas, horas y pagos en un solo lugar.": "Invoices, hours and payments in one place.",
    "Organiza": "Organize", "tus facturas": "your invoices", "Da seguimiento": "Track", "a los trabajos": "your jobs", "Controla": "Control", "tus pagos": "your payments",
    "Administrador del espacio": "Workspace admin", "Activo": "Active", "Buenos días": "Good morning", "Buenas tardes": "Good afternoon", "Buenas noches": "Good evening",
    "¡Bienvenida!": "Welcome!", "Éxitos en tus tareas de hoy.": "Good luck with today's tasks.", "Correo": "Email", "Contraseña": "Password", "Recordarme": "Remember me",
    "Iniciar sesión": "Sign in", "o": "or", "Usar huella digital": "Use fingerprint", "Espacio de trabajo": "Workspace", "¿En qué empresa quieres trabajar?": "Which company do you want to work in?",
    "Cada empresa tiene su propia información. Sus facturas, horas y documentos se mantienen separados.": "Each company has its own information. Its invoices, hours and documents are kept separate.",
    "Tu espacio principal": "Your main workspace", "Facturas, horas, cheques y PDFs de Trenton.": "Trenton invoices, hours, checks and PDFs.", "Entrar a Trenton": "Enter Trenton",
    "Clientes y otras empresas": "Clients and other companies", "Espacio independiente": "Separate workspace", "Trabajos de otros clientes: invoices, horas y PDFs, todo aparte.": "Work for other clients: invoices, hours and PDFs, all separate.",
    "Entrar al espacio": "Enter workspace", "Acceso seguro": "Secure access", "Tus datos están protegidos.": "Your data is protected.", "Secretaria": "Secretary",
    // Sidebar and dock
    "Nube + local": "Cloud + local", "En la nube y en este navegador": "In the cloud and in this browser", "Principal": "Main", "Todo en un solo lugar": "Everything in one place",
    "Inicio": "Home", "Tablero y cheques": "Board and checks", "Crear invoice": "Create invoice", "Nueva factura PDF": "New PDF invoice", "Horas trabajadas": "Hours worked",
    "Jornada y reporte": "Workday and report", "Otro formato de horas": "Other hours format", "Varios días y descripción": "Several days and description", "Reportes a Trenton": "Reports to Trenton",
    "Kanban y cheques A3": "Kanban and A3 checks", "Editor PDF": "PDF Editor", "Editar, firmar y descargar": "Edit, sign and download", "Archivo": "Archive", "Tu información segura": "Your information, safe",
    "Invoices / PDFs": "Invoices / PDFs", "Facturas guardadas": "Saved invoices", "Horas / PDFs": "Hours / PDFs", "Solo reportes de jornada": "Workday reports only", "Reportes / PDFs": "Reports / PDFs",
    "Formato enviado a Trenton": "Format sent to Trenton", "General": "General", "Configuración": "Settings", "Cambiar empresa": "Switch company", "Salir": "Sign out",
    "Trabajo organizado, mejores resultados.": "Organized work, better results.", "Invoices": "Invoices", "Horas": "Hours", "Reportes": "Reports", "Más": "More",
    "Tu perfil": "Your profile", "Abrir menú": "Open menu", "Cerrar menú": "Close menu", "Navegación inferior": "Bottom navigation", "Cerrar": "Close",
    // Home header and stats
    "PANEL DE CONTROL": "DASHBOARD", "Todo el trabajo de": "All the work of", "en un solo lugar.": "all in one place.",
    "Organiza facturas, controla horas y administra cada trabajo desde un solo espacio.": "Organize invoices, track hours and manage every job from one place.",
    "Nueva invoice": "New invoice", "Registrar horas": "Log hours", "Subir documento": "Upload document", "Controla tus horas": "Track your hours",
    "Registra el tiempo de cada trabajo y lleva un control preciso.": "Log the time of every job and keep precise control.", "Gestiona tus invoices": "Manage your invoices",
    "Crea, da seguimiento y controla el estado de cada factura.": "Create, track and control the status of every invoice.", "Genera reportes": "Create reports",
    "Consulta resultados, pagos y avances en tiempo real.": "See results, payments and progress in real time.", "Lo que puedes hacer": "What you can do", "Anterior": "Previous", "Siguiente": "Next",
    "Total invoices": "Total invoices", "Facturas registradas": "Registered invoices", "Ver todas": "See all", "En trabajo": "In progress", "Trabajos en proceso": "Jobs in progress", "Ver trabajos": "See jobs",
    "Esperando cheque": "Awaiting check", "Trabajos pendientes de cobro": "Jobs pending payment", "Ver detalles": "See details", "Pagado": "Paid", "Importe cobrado confirmado": "Confirmed amount collected", "Ver pagos": "See payments",
    "Resumen de invoices": "Invoice summary",
    // Boards
    "Seguimiento de trabajos": "Job tracking", "Arrastra cada tarjeta a la siguiente fase cuando avance.": "Drag each card to the next stage as it moves forward.",
    "Seguimiento de horas": "Hours tracking", "Sigue cada reporte de horas desde que se crea hasta que se cobra.": "Follow each hours report from creation until it's paid.",
    "Reportes finales enviados a Trenton": "Final reports sent to Trenton", "Sigue cada reporte desde que se crea hasta que se cobra.": "Follow each report from creation until it's paid.",
    "Factura creada": "Invoice created", "Recién registradas": "Just added", "Trabajos cobrados": "Jobs collected", "Sin invoices en esta fase": "No invoices in this stage", "Sin reportes en esta fase": "No reports in this stage",
    "+ Agregar invoice": "+ Add invoice", "+ Agregar reporte": "+ Add report", "Subir cheque": "Upload check", "Saldo cubierto": "Balance covered", "Reporte creado": "Report created", "Enviado a Trenton": "Sent to Trenton",
    "Esperando el pago": "Awaiting payment", "Buscar invoice...": "Search invoice...", "Buscar horas...": "Search hours...", "Buscar reporte...": "Search report...", "Limpiar búsqueda": "Clear search",
    "Tablero Kanban": "Kanban board", "Reporte de pendientes": "Pending report", "Ver menos": "See less",
    "Ver / editar detalles": "View / edit details", "Ver PDF": "View PDF", "Copiar link de vista previa": "Copy preview link", "Editar en Editor PDF": "Edit in PDF Editor", "Eliminar": "Delete",
    // Home files area
    "Archivo de invoices": "Invoice archive", "Archivo de reportes de horas": "Hours reports archive", "Comprobantes de cheques y pagos": "Check and payment receipts",
    "Aquí se guarda el PDF de cada factura. También puedes subir facturas anteriores y ver cuánto facturaste cada año.": "Every invoice PDF is kept here. You can also upload earlier invoices and see how much you billed each year.",
    "Sube aquí la foto del cheque cuando una invoice esté en Esperando cheque o Pagado.": "Upload the check photo here when an invoice is Awaiting check or Paid.",
    "Subir invoice": "Upload invoice", "Subir reporte": "Upload report", "Subir comprobante": "Upload receipt", "Cliente": "Client", "Dirección": "Address", "Fecha": "Date", "Total": "Total",
    "Rango de fechas": "Date range", "Concepto": "Concept", "Monto": "Amount", "Estado": "Status", "Comprobante": "Receipt", "Todos los clientes": "All clients", "Año:": "Year:", "Todos": "All",
    "Buscar invoice…": "Search invoice…", "Buscar reporte…": "Search report…", "Buscar cheque…": "Search check…", "Cheques de invoices": "Invoice checks", "Cheques de reportes de horas": "Hours report checks",
    "Enviados a Trenton": "Sent to Trenton", "Sin comprobante": "No receipt", "Con comprobante": "With receipt", "Dispositivos registrados": "Registered devices", "Ver dispositivos →": "See devices →",
    "Todavía no hay invoices guardadas.": "No invoices saved yet.", "Todavía no hay reportes de horas.": "No hours reports yet.", "Todavía no hay registros en Esperando cheque o Pagado.": "Nothing in Awaiting check or Paid yet.",
    "Registrar este aparato": "Register this device", "Registrar otro aparato": "Register another device",
    // Hours / job forms
    "Reporte de jornada": "Workday report", "Subir PDF anterior": "Upload previous PDF", "Nuevo reporte": "New report", "Guardar y descargar PDF": "Save and download PDF",
    "Tienes trabajo sin guardar": "You have unsaved work", "Continuar": "Continue", "Descartar": "Discard", "Desde el mensaje de WhatsApp": "From the WhatsApp message",
    "Detección automática": "Automatic detection", "Desglosar horas": "Break down hours", "Traductor": "Translator", "Español → Inglés": "Spanish → English", "Inglés → Español": "English → Spanish",
    "Copiar": "Copy", "Usar en descripción": "Use in description", "Datos del trabajo": "Job details", "Dirección del trabajo": "Job address", "Fecha del reporte": "Report date",
    "Tarifa predeterminada (USD/h)": "Default rate (USD/h)", "Descripción": "Description", "Empleados y jornadas": "Employees and workdays", "＋ Agregar registro": "＋ Add entry",
    "Guardar reporte y PDF": "Save report and PDF", "Vista previa del reporte": "Report preview", "Hoja carta": "Letter sheet", "Hoja A3": "A3 sheet", "Reportes guardados": "Saved reports",
    "Ver archivo de horas →": "See hours archive →", "Desde el texto del reporte": "From the report text", "Desglosar job": "Break down job", "Datos del reporte": "Report details",
    "Días, empleados y descripción": "Days, employees and description",
    // Invoice builder
    "Generador de documentos": "Document generator", "Crear una invoice": "Create an invoice", "Pega un mensaje de WhatsApp y se completarán los campos automáticamente.": "Paste a WhatsApp message and the fields fill in automatically.",
    "Limpiar campos": "Clear fields", "Analizar mensaje": "Analyze message", "Encabezado": "Header", "Número de invoice": "Invoice number", "Fecha de emisión": "Issue date", "Título del documento": "Document title",
    "Texto superior derecho": "Top-right text", "(opcional)": "(optional)", "Mostrar el texto superior derecho en el documento": "Show the top-right text on the document", "De (quién factura)": "From (who bills)",
    "Nombre": "Name", "Teléfono": "Phone", "Correo electrónico": "Email", "Para (quién paga)": "To (who pays)", "Empresa o cliente": "Company or client", "Trabajo y precio": "Work and price",
    "Cantidad": "Quantity", "Precio (USD)": "Price (USD)", "Monto (USD)": "Amount (USD)", "＋ Agregar otra fila": "＋ Add another row", "Mostrar cantidad y precio en la factura": "Show quantity and price on the invoice",
    "Pago": "Payment", "Anticipo requerido (%)": "Required deposit (%)", "Texto junto al TOTAL": "Text next to TOTAL", "Nota de pago": "Payment note", "Guardar en tablero": "Save to board",
    "Nombre en el tablero": "Name on the board", "Logo (opcional)": "Logo (optional)", "Guardar invoice y PDF": "Save invoice and PDF", "Vista previa en vivo": "Live preview",
    // Archives and modals
    "Documentos guardados por dirección": "Documents saved by address", "Todas las invoices": "All invoices", "Consulta tus PDFs y el total de facturas por año.": "See your PDFs and invoice totals by year.",
    "Descargar respaldo": "Download backup", "＋ Subir invoices anteriores": "＋ Upload earlier invoices", "Año de emisión": "Issue year", "Todos los años": "All years", "Categoría": "Category", "Todas": "All",
    "Pagada": "Paid", "Buscar dirección o invoice": "Search address or invoice", "Invoices en esta selección": "Invoices in this selection", "Total facturado": "Total billed",
    "Marcadas como pagadas": "Marked as paid", "Invoices pendientes de pago": "Invoices pending payment", "Todos los reportes de horas": "All hours reports", "＋ Subir reportes anteriores": "＋ Upload earlier reports",
    "Año del reporte": "Report year", "Buscar dirección o empleado": "Search address or employee", "Reportes en esta selección": "Reports in this selection", "Horas totales": "Total hours", "Total a pagar": "Total to pay",
    "Reportes enviados a Trenton": "Reports sent to Trenton", "＋ Subir PDFs": "＋ Upload PDFs", "＋ Nuevo reporte": "＋ New report", "Cancelar": "Cancel", "Guardar invoice": "Save invoice", "Guardar cambios": "Save changes",
    "Editar horas": "Edit hours", "Editar reporte final": "Edit final report", "Descargar PDF": "Download PDF", "Editar datos / categoría": "Edit details / category", "Copiar link": "Copy link", "Fase": "Stage",
    "Se debe": "Owed", "Pagó todo": "Paid in full", "Nada recibido": "Nothing received", "Editar datos": "Edit details", "Descargar": "Download",
    // Settings
    "Administra tu cuenta, seguridad y preferencias del sistema.": "Manage your account, security and system preferences.", "Información": "Information", "Seguridad": "Security", "Accesos": "Access", "Preferencias": "Preferences",
    "Información personal": "Personal information", "Datos de tu cuenta y contacto.": "Your account and contact details.", "Editar": "Edit", "Nombre completo": "Full name", "Cargo": "Role", "Miembro desde": "Member since",
    "Sin teléfono": "No phone", "Tu rol en el sistema": "Your role in the system", "Tienes acceso a la gestión de invoices, control de horas, reportes y administración de documentos.": "You have access to invoices, hours tracking, reports and document management.",
    "Permisos y accesos": "Permissions and access", "Crear y administrar invoices": "Create and manage invoices", "Registrar y gestionar horas": "Log and manage hours", "Generar reportes y enviarlos a Trenton": "Create reports and send them to Trenton",
    "Editar y firmar documentos (PDF)": "Edit and sign documents (PDF)", "Consultar archivos (invoices y horas)": "Browse archives (invoices and hours)", "Actividad reciente": "Recent activity", "Ver historial": "View history",
    "Dispositivos con acceso, contraseña y sesión.": "Devices with access, password and session.", "Aparatos que entran con huella, Face ID o Windows Hello.": "Devices that sign in with fingerprint, Face ID or Windows Hello.",
    "Ver dispositivos": "See devices", "Cambiar contraseña": "Change password", "Mínimo 8 caracteres.": "At least 8 characters.", "Cambiar": "Change", "Guardar contraseña": "Save password",
    "Cerrar sesión": "Sign out", "Sale de la cuenta en este aparato.": "Signs out of the account on this device.", "Espacio de trabajo y lo que puedes hacer en la app.": "Workspace and what you can do in the app.",
    "Cada empresa guarda sus datos por separado.": "Each company keeps its data separate.", "Se guardan en este aparato.": "Saved on this device.", "Reducir animaciones": "Reduce animations",
    "Menos movimiento en toda la app.": "Less motion across the app.", "Carrusel automático en Inicio": "Auto-play carousel on Home", "Las tarjetas del encabezado avanzan solas.": "The header cards advance on their own.",
    "Idioma": "Language", "Textos de la interfaz en español o inglés.": "Interface text in Spanish or English.", "Inicio de sesión": "Sign-in", "Intento de acceso fallido": "Failed sign-in attempt",
    "Dispositivo registrado": "Device registered", "Acceso revocado": "Access revoked", "Contraseña cambiada": "Password changed", "Preferencia guardada.": "Preference saved.",
    // Devices panel
    "Administra los equipos que tienen permiso para acceder a Ruben Perla.": "Manage the devices allowed to access Ruben Perla.", "Último acceso": "Last access", "Ubicación reciente": "Recent location",
    "Registrar nuevo dispositivo": "Register new device", "Autorizado": "Authorized", "Este aparato": "This device", "Registrado": "Registered", "Último uso": "Last used", "Ubicación estimada": "Estimated location",
    "Método de acceso": "Access method", "Ver en Google Maps": "View on Google Maps", "Renombrar": "Rename", "Usar ubicación GPS": "Use GPS location", "Revocar acceso": "Revoke access",
    "Ubicación no disponible": "Location unavailable", "Sin dato": "No data", "Aún sin registros": "No records yet", "Ubicación aproximada mediante dirección IP.": "Approximate location from IP address.",
    "Historial de actividad": "Activity history", "Todos los dispositivos": "All devices", "Desde": "From", "Hasta": "To", "Exitoso": "Successful", "Fallido": "Failed", "Revisar": "Review",
    // PDF editor (library and toolbar)
    "Documentos y firmas": "Documents and signatures", "Crear documento": "Create document", "Subir PDF": "Upload PDF", "Arrastra un PDF aquí o toca para elegirlo": "Drag a PDF here or tap to choose it",
    "Recientes": "Recent", "Editados": "Edited", "Pendientes de revisión": "Pending review", "Mis firmas": "My signatures", "Mis imágenes": "My images", "Plantillas": "Templates",
    "Seleccionar": "Select", "Texto": "Text", "Firma": "Signature", "Imagen": "Image", "Casilla": "Checkbox", "Sello": "Stamp", "Resaltar": "Highlight", "Subrayar": "Underline", "Tachar": "Strike out",
    "Lápiz": "Pen", "Línea": "Line", "Flecha": "Arrow", "Rectángulo": "Rectangle", "Elipse": "Ellipse", "Comentario": "Comment", "Páginas": "Pages", "Propiedades": "Properties",
    "Guardar versión": "Save version", "Guardado": "Saved", "Guardando…": "Saving…", "Subir PNG o JPG": "Upload PNG or JPG", "Dibujar firma": "Draw signature", "Subir imágenes": "Upload images",
    "Personaliza tu experiencia en Ruben Perla. Se guardan en este aparato.": "Customize your Ruben Perla experience. Saved on this device.",
    "Apariencia": "Appearance", "Tema, colores y personalización visual": "Theme, colors and visual customization", "Comportamiento": "Behavior", "Animaciones, carrusel y navegación": "Animations, carousel and navigation",
    "Idioma y región": "Language and region", "Idioma, fecha, hora y moneda": "Language, date, time and currency", "Notificaciones": "Notifications", "Avisos y alertas del sistema": "System notices and alerts",
    "Accesibilidad": "Accessibility", "Texto, contraste y efectos visuales": "Text, contrast and visual effects", "Fondo azul en Inicio": "Blue background on Home", "La curva azul detrás del carrusel.": "The blue curve behind the carousel.",
    "Sombras suaves": "Soft shadows", "Profundidad en tarjetas y paneles.": "Depth on cards and panels.", "Pantalla al entrar": "Start screen", "Lo primero que ves al iniciar sesión.": "The first thing you see after signing in.",
    "Formato de fecha": "Date format", "Zona horaria": "Time zone", "Moneda": "Currency", "Avisos en pantalla": "On-screen notices", "Mensajes breves como “Guardado” en la parte de abajo.": "Short messages like “Saved” at the bottom.",
    "Sonido en los avisos": "Notice sound", "Un toque suave cuando aparece un aviso.": "A soft tone when a notice appears.", "Texto más grande": "Larger text", "Aumenta el tamaño de toda la interfaz.": "Makes the whole interface bigger.",
    "Alto contraste": "High contrast", "Textos y bordes más oscuros.": "Darker text and borders.", "Resaltar el foco": "Highlight focus", "Marca clara al moverte con el teclado.": "A clear outline when using the keyboard.",
    "Aún no hay actividad registrada. Se anota desde tu próximo inicio de sesión.": "No activity recorded yet. It starts with your next sign-in.",
    "Tema": "Theme", "Claro, oscuro o según tu aparato.": "Light, dark or match your device.", "Claro": "Light", "Oscuro": "Dark", "Automático": "Automatic",
    "Papelera": "Trash", "Recuperar lo borrado": "Recover deleted items", "Recupera invoices y reportes que borraste.": "Recover invoices and reports you deleted.", "Restaurar": "Restore", "Restaurando…": "Restoring…",
    "La papelera está vacía": "The trash is empty", "Lo que borras queda aquí. Al restaurarlo vuelve al tablero y al archivo como estaba.": "Deleted items stay here. Restoring brings them back to the board and archive as they were.",
    "Exportar": "Export", "Exportar a Excel": "Export to Excel", "Descarga tus datos en una hoja de cálculo.": "Download your data as a spreadsheet.", "Año": "Year", "Descargar para Excel (.csv)": "Download for Excel (.csv)",
    "invoices para exportar": "invoices to export", "filas de jornada para exportar": "work rows to export", "Se abre en Excel, Numbers o Google Sheets. Útil para el contador o los impuestos de fin de año.": "Opens in Excel, Numbers or Google Sheets. Handy for the accountant or year-end taxes.",
    "Duplicar": "Duplicate", "Predeterminada": "Default"
  };
  // Texts with numbers or names.
  const PATTERNS = [
    [/^(Buenos días|Buenas tardes|Buenas noches), (.+)$/, (m, g, name) => `${D[g]}, ${name}`],
    [/^Ver más \((\d+)\)$/, (m, n) => `See more (${n})`],
    [/^Ver todas \((\d+)\) →$/, (m, n) => `See all (${n}) →`], [/^Ver todos \((\d+)\) →$/, (m, n) => `See all (${n}) →`],
    [/^Ver más \((\d+) más\) →$/, (m, n) => `See more (${n} more) →`],
    [/^Se debe (\$[\d,.]+)$/, (m, v) => `Owed ${v}`], [/^Pago incompleto · se debe (\$[\d,.]+)$/, (m, v) => `Partial payment · owed ${v}`],
    [/^Cheque ×(\d+)$/, (m, n) => `Check ×${n}`], [/^Movida a “(.+)”$/, (m, s) => `Moved to “${D[s] || s}”`], [/^Movido a “(.+)”$/, (m, s) => `Moved to “${D[s] || s}”`],
    [/^(\d+) dispositivos?$/, (m, n) => `${n} device${n === "1" ? "" : "s"}`], [/^Miembro desde (.+)$/, (m, y) => `Member since ${y}`],
    [/^Espacio activo: (.+)$/, (m, w) => `Active workspace: ${w}`], [/^Hoy, (.+)$/, (m, t) => `Today, ${t}`], [/^Ayer, (.+)$/, (m, t) => `Yesterday, ${t}`],
    [/^(\d+) págs?\.$/, (m, n) => `${n} p.`], [/^(\d+) páginas?$/, (m, n) => `${n} page${n === "1" ? "" : "s"}`]
  ];
  const SKIP = "script, style, textarea, input, select, [contenteditable=true], .pe-pages, .pe-thumb-list, .invoice-preview-panel, .hours-preview-panel, .hours-paper, .pdf-viewer, .pdf-dialog-pages, [data-i18n-skip]";
  const ATTRS = ["placeholder", "title", "aria-label"];
  const originals = new WeakMap(), written = new WeakMap();
  let lang = "es", observer = null, queued = new Set(), frame = 0;

  function translate(text) {
    const key = text.replace(/\s+/g, " ").trim();
    if (!key || !/[a-záéíóúñ]/i.test(key)) return null;
    if (Object.prototype.hasOwnProperty.call(D, key)) return D[key];
    for (const [re, fn] of PATTERNS) { const m = key.match(re); if (m) return fn(...m); }
    return null;
  }
  const keepSpace = (orig, next) => (orig.match(/^\s*/)[0]) + next + (orig.match(/\s*$/)[0]);

  function doText(node) {
    const el = node.parentElement;
    if (!el || el.closest(SKIP)) return;
    const value = node.nodeValue;
    if (written.get(node) === value) return; // our own output
    if (lang === "es") {
      if (originals.has(node) && written.get(node) === value) node.nodeValue = originals.get(node);
      return;
    }
    const next = translate(value);
    originals.set(node, value);
    if (next == null) { written.delete(node); return; }
    const out = keepSpace(value, next);
    written.set(node, out);
    node.nodeValue = out;
  }
  function doAttrs(el) {
    if (el.closest(SKIP + ", .pe-pages")) { if (!el.matches("input, textarea, select")) return; }
    let store = originals.get(el);
    for (const a of ATTRS) {
      if (!el.hasAttribute(a)) continue;
      const value = el.getAttribute(a);
      if (!store) { store = {}; originals.set(el, store); }
      const mine = written.get(el) || {};
      if (mine[a] === value) continue;
      if (lang === "es") continue;
      const next = translate(value);
      store[a] = value;
      if (next == null) continue;
      mine[a] = next; written.set(el, mine);
      el.setAttribute(a, next);
    }
  }
  function walk(root) {
    if (root.nodeType === 3) return doText(root);
    if (root.nodeType !== 1) return;
    if (root.matches?.("script, style")) return;
    doAttrs(root);
    const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    let n;
    while ((n = tw.nextNode())) { if (n.nodeType === 3) doText(n); else if (n.attributes?.length) doAttrs(n); }
  }
  function restore(root) {
    const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    let n;
    while ((n = tw.nextNode())) {
      if (n.nodeType === 3) { if (originals.has(n) && written.get(n) === n.nodeValue) n.nodeValue = originals.get(n); written.delete(n); }
      else { const store = originals.get(n), mine = written.get(n); if (store && mine) for (const a of ATTRS) if (mine[a] && n.getAttribute(a) === mine[a]) n.setAttribute(a, store[a]); written.delete(n); }
    }
  }
  function flush() {
    frame = 0;
    const items = [...queued]; queued.clear();
    items.forEach(n => { if (n.isConnected) walk(n); });
  }
  function watch() {
    if (observer) return;
    observer = new MutationObserver(records => {
      if (lang !== "en") return;
      for (const r of records) {
        if (r.type === "characterData") queued.add(r.target);
        else if (r.type === "attributes") queued.add(r.target);
        else r.addedNodes.forEach(n => queued.add(n));
      }
      if (!frame) frame = requestAnimationFrame(flush);
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  }
  function set(next) {
    lang = next === "en" ? "en" : "es";
    try { localStorage.setItem(KEY, lang); } catch (_) {}
    document.documentElement.lang = lang;
    if (lang === "en") { walk(document.body); watch(); }
    else restore(document.body);
  }
  function boot() {
    let saved = "es";
    try { saved = localStorage.getItem(KEY) || "es"; } catch (_) {}
    if (saved === "en") set("en");
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
  return { set, get: () => lang, t: text => (lang === "en" ? translate(text) || text : text) };
})();

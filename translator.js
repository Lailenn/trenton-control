(function (root) {
  "use strict";

  const DIRS = {
    "es|en": {
      title: "Español → Inglés",
      badge: "ES → EN",
      source: "Texto en español",
      output: "Traducción al inglés",
      sourcePh: "Escribe o pega aquí en español…",
      outputPh: "Aquí aparecerá el inglés…",
      go: "Traducir al inglés",
      idle: "Dirección activa: de español a inglés.",
      done: "Listo: español → inglés. Revisa el texto antes de usarlo.",
      hintInvoice: "Pega el texto en español. El resultado saldrá en inglés para la descripción de la invoice.",
      hintHours: "Pega el texto en español. El resultado saldrá en inglés para la descripción del reporte de horas."
    },
    "en|es": {
      title: "Inglés → Español",
      badge: "EN → ES",
      source: "Texto en inglés",
      output: "Traducción al español",
      sourcePh: "Write or paste here in English…",
      outputPh: "Aquí aparecerá el español…",
      go: "Traducir al español",
      idle: "Dirección activa: de inglés a español.",
      done: "Listo: inglés → español. Revisa el texto antes de usarlo.",
      hintInvoice: "Pega el texto en inglés. El resultado saldrá en español para que lo revises o lo uses en la invoice.",
      hintHours: "Pega el texto en inglés. El resultado saldrá en español para que lo revises o lo uses en el reporte de horas."
    }
  };

  function decodeEntities(value) {
    const box = document.createElement("textarea");
    box.innerHTML = value;
    return box.value;
  }

  function chunksOf(text, size) {
    const source = String(text || "");
    const chunks = [];
    for (let index = 0; index < source.length; index += size) chunks.push(source.slice(index, index + size));
    return chunks;
  }

  async function translateGoogle(text, from, to) {
    const parts = [];
    for (const chunk of chunksOf(text, 900)) {
      const url = "https://translate.googleapis.com/translate_a/single?client=gtx&sl=" +
        encodeURIComponent(from) + "&tl=" + encodeURIComponent(to) + "&dt=t&q=" + encodeURIComponent(chunk);
      const response = await fetch(url);
      if (!response.ok) throw new Error("El traductor no respondió.");
      const payload = await response.json();
      const translated = Array.isArray(payload?.[0]) ? payload[0].map(part => part?.[0] || "").join("") : "";
      if (!translated.trim()) throw new Error("empty");
      parts.push(translated);
    }
    return decodeEntities(parts.join(""));
  }

  async function translateMyMemory(text, from, to) {
    const parts = [];
    for (const chunk of chunksOf(text, 450)) {
      const url = "https://api.mymemory.translated.net/get?q=" + encodeURIComponent(chunk) + "&langpair=" + from + "|" + to;
      const response = await fetch(url);
      if (!response.ok) throw new Error("El traductor no respondió.");
      const payload = await response.json();
      const translated = payload?.responseData?.translatedText || "";
      if (!translated || /MYMEMORY WARNING|QUERY LENGTH|INVALID LANGUAGE/i.test(translated)) throw new Error("empty");
      parts.push(translated);
    }
    return decodeEntities(parts.join(" "));
  }

  async function translate(text, from, to) {
    const source = String(text || "").trim();
    if (!source) throw new Error("Escribe o pega un texto primero.");
    if (from === to) throw new Error("Elige dos idiomas distintos.");
    try { return await translateGoogle(source, from, to); } catch (_) { /* siguiente servicio */ }
    try { return await translateMyMemory(source, from, to); } catch (_) { /* error final */ }
    throw new Error("No se pudo traducir. Revisa la conexión o desactiva el bloqueo de seguimiento en el navegador.");
  }

  function bind(rootEl) {
    if (rootEl.dataset.bound === "1") return;
    rootEl.dataset.bound = "1";
    const source = rootEl.querySelector("[data-translator-source]");
    const output = rootEl.querySelector("[data-translator-output]");
    const status = rootEl.querySelector("[data-translator-status]");
    const go = rootEl.querySelector("[data-translator-go]");
    const which = rootEl.getAttribute("data-translator") || "invoice";

    const fromTo = () => rootEl.getAttribute("data-langpair") || "es|en";
    const meta = () => DIRS[fromTo()] || DIRS["es|en"];

    const setPair = (pair) => {
      rootEl.setAttribute("data-langpair", pair);
      rootEl.dataset.dir = pair === "en|es" ? "en-es" : "es-en";
      rootEl.querySelectorAll("[data-pair]").forEach(button => {
        const active = button.dataset.pair === pair;
        button.classList.toggle("is-active", active);
        button.setAttribute("aria-pressed", String(active));
      });
      const info = DIRS[pair] || DIRS["es|en"];
      const title = rootEl.querySelector("[data-translator-title]");
      const badge = rootEl.querySelector("[data-translator-badge]");
      const hint = rootEl.querySelector("[data-translator-hint]");
      const sourceLabel = rootEl.querySelector("[data-translator-source-label]");
      const outputLabel = rootEl.querySelector("[data-translator-output-label]");
      if (title) title.textContent = info.title;
      if (badge) badge.textContent = info.badge;
      if (hint) hint.textContent = which === "hours" ? info.hintHours : info.hintInvoice;
      if (sourceLabel) sourceLabel.textContent = info.source;
      if (outputLabel) outputLabel.textContent = info.output;
      if (source) source.placeholder = info.sourcePh;
      if (output) output.placeholder = info.outputPh;
      if (go) go.textContent = info.go;
      if (status && !status.dataset.busy) status.textContent = info.idle;
    };

    go?.addEventListener("click", async () => {
      const pair = fromTo().split("|");
      const info = meta();
      if (status) {
        status.dataset.busy = "1";
        status.textContent = "Traduciendo " + info.title.toLowerCase() + "…";
      }
      if (go) go.disabled = true;
      try {
        output.value = await translate(source.value, pair[0], pair[1]);
        if (status) status.textContent = info.done;
      } catch (error) {
        if (status) status.textContent = error.message || "No se pudo traducir.";
      } finally {
        if (status) delete status.dataset.busy;
        if (go) go.disabled = false;
      }
    });

    rootEl.querySelector("[data-translator-swap]")?.addEventListener("click", () => {
      const [from, to] = fromTo().split("|");
      setPair(to + "|" + from);
      const current = source.value;
      source.value = output.value;
      output.value = current;
    });

    rootEl.querySelector("[data-translator-copy]")?.addEventListener("click", async () => {
      if (!output.value) {
        if (status) status.textContent = "Todavía no hay traducción para copiar.";
        return;
      }
      try {
        await navigator.clipboard.writeText(output.value);
        if (status) status.textContent = "Traducción copiada.";
      } catch (_) {
        if (status) status.textContent = "Selecciona el texto y cópialo con Ctrl+C.";
      }
    });

    rootEl.querySelector("[data-translator-apply]")?.addEventListener("click", () => {
      const target = document.getElementById(rootEl.dataset.target || "");
      if (!target) return;
      if (!output.value) {
        if (status) status.textContent = "Traduce primero y luego pulsa Usar.";
        return;
      }
      target.value = output.value;
      target.dispatchEvent(new Event("input", { bubbles: true }));
      if (status) status.textContent = "Texto colocado en el formulario.";
    });

    rootEl.querySelectorAll("[data-pair]").forEach(button => {
      button.addEventListener("click", () => setPair(button.dataset.pair));
    });
    source?.addEventListener("keydown", (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
        event.preventDefault();
        go?.click();
      }
    });
    setPair(fromTo());
  }

  function bindAll() {
    document.querySelectorAll("[data-translator]").forEach(bind);
  }

  root.TranslatorApp = { bindAll, translate };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bindAll);
  else bindAll();
})(typeof globalThis !== "undefined" ? globalThis : this);

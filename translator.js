(function (root) {
  "use strict";

  async function translateBrowser(text, from, to) {
    if (!("Translator" in root) && !("translation" in root)) return null;
    try {
      if (typeof root.Translator?.create === "function") {
        const translator = await root.Translator.create({ sourceLanguage: from, targetLanguage: to });
        return await translator.translate(text);
      }
    } catch (_) { /* fall through to online API */ }
    return null;
  }

  async function translateMyMemory(text, from, to) {
    const chunks = [];
    const source = String(text || "").trim();
    if (!source) return "";
    for (let index = 0; index < source.length; index += 450) chunks.push(source.slice(index, index + 450));
    const parts = [];
    for (const chunk of chunks) {
      const url = "https://api.mymemory.translated.net/get?q=" + encodeURIComponent(chunk) + "&langpair=" + from + "|" + to;
      const response = await fetch(url);
      if (!response.ok) throw new Error("El traductor no respondió. Intenta de nuevo.");
      const payload = await response.json();
      const translated = payload?.responseData?.translatedText;
      if (!translated) throw new Error("No se pudo traducir ese texto.");
      parts.push(translated);
    }
    return parts.join(" ");
  }

  async function translate(text, from, to) {
    const local = await translateBrowser(text, from, to);
    if (local) return local;
    return translateMyMemory(text, from, to);
  }

  function bind(rootEl) {
    const source = rootEl.querySelector("[data-translator-source]");
    const output = rootEl.querySelector("[data-translator-output]");
    const status = rootEl.querySelector("[data-translator-status]");
    const fromTo = () => rootEl.getAttribute("data-langpair") || "es|en";
    const setPair = (pair) => {
      rootEl.setAttribute("data-langpair", pair);
      rootEl.querySelectorAll("[data-pair]").forEach(button => button.classList.toggle("is-active", button.dataset.pair === pair));
    };
    rootEl.querySelector("[data-translator-go]")?.addEventListener("click", async () => {
      const pair = fromTo().split("|");
      status.textContent = "Traduciendo…";
      try {
        output.value = await translate(source.value, pair[0], pair[1]);
        status.textContent = "Listo. Revisa el texto antes de usarlo.";
      } catch (error) {
        status.textContent = error.message || "No se pudo traducir.";
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
      if (!output.value) return;
      try { await navigator.clipboard.writeText(output.value); status.textContent = "Copiado."; } catch (_) { status.textContent = "Selecciona el texto y cópialo con Ctrl+C."; }
    });
    rootEl.querySelector("[data-translator-apply]")?.addEventListener("click", () => {
      const target = document.getElementById(rootEl.dataset.target || "");
      if (!target || !output.value) return;
      target.value = output.value;
      target.dispatchEvent(new Event("input", { bubbles: true }));
      status.textContent = "Texto colocado en el formulario.";
    });
    rootEl.querySelectorAll("[data-pair]").forEach(button => button.addEventListener("click", () => setPair(button.dataset.pair)));
    setPair(fromTo());
  }

  root.TranslatorApp = {
    bindAll() { document.querySelectorAll("[data-translator]").forEach(bind); },
    translate
  };
})(typeof globalThis !== "undefined" ? globalThis : this);

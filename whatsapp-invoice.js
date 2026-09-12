// Reads one pasted message. It does not connect to WhatsApp or save an invoice.
const WhatsAppInvoiceParser = (() => {
  const fold = (text) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const dateValue = (date = new Date()) => [
    date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")
  ].join("-");

  function cleanLines(raw) {
    return String(raw || "").replace(/\r\n?/g, "\n")
      .replace(/[\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g, "")
      .replace(/\u00a0/g, " ").split("\n").map((line) => line
        .replace(/^\s*\[(?=[^\]]*\d{1,2}:\d{2})[^\]]{1,100}\]\s*[^:\n]{1,100}:\s*/, "")
        .replace(/^\s*\d{1,2}[/.]\d{1,2}[/.]\d{2,4},?\s+\d{1,2}:\d{2}(?:\s*[ap]\.?\s*m\.?)?\s*-\s*[^:\n]{1,100}:\s*/i, "")
        .replace(/(?:^|\s+)\d{1,2}:\d{2}\s*[ap]\.?\s*m\.?\s*(?:[✓✔]+)?\s*$/i, "")
        .trim().replace(/^[*_\x60]+|[*_\x60]+$/g, "").trim())
      .filter((line) => line && !/^[-—–_=•\s]+$/.test(line));
  }

  function numberValue(text) {
    let value = String(text).trim().replace(/(?:USD|US\$|d[oó]lares?)/gi, "")
      .replace(/\$/g, "").replace(/\s/g, "").trim();
    if (!/^\d+(?:[.,]\d+)*$/.test(value)) return null;
    const comma = value.lastIndexOf(",");
    const dot = value.lastIndexOf(".");
    if (comma >= 0 && dot >= 0) {
      const decimal = comma > dot ? "," : ".";
      const thousands = decimal === "," ? "." : ",";
      const parts = value.split(decimal);
      const grouped = thousands === "," ? /^\d{1,3}(?:,\d{3})+$/ : /^\d{1,3}(?:\.\d{3})+$/;
      if (parts.length !== 2 || !/^\d{1,2}$/.test(parts[1]) || !grouped.test(parts[0])) return null;
      value = parts[0].split(thousands).join("") + "." + parts[1];
    } else if (comma >= 0 || dot >= 0) {
      if (/^\d{1,3}(?:,\d{3})+$/.test(value) || /^\d{1,3}(?:\.\d{3})+$/.test(value)) {
        value = value.replace(/[.,]/g, "");
      } else if (/^\d+[.,]\d{1,2}$/.test(value)) {
        value = value.replace(",", ".");
      } else return null;
    }
    const amount = Number(value);
    return Number.isFinite(amount) && amount <= 1e10 ? amount : null;
  }

  function moneyLineValue(line) {
    const value = String(line || "").trim();
    if (!/^(?:(?:US\$|USD|\$)\s*)?\d{1,3}(?:[,.\s]\d{3})+(?:[.,]\d{1,2})?\s*(?:USD|d[oó]lares?)?$/i.test(value)) return null;
    return numberValue(value);
  }

  function exactDate(year, month, day) {
    const date = new Date(year, month - 1, day);
    return year >= 1900 && year <= 2200 && date.getFullYear() === year &&
      date.getMonth() === month - 1 && date.getDate() === day ? dateValue(date) : null;
  }

  function readDate(value, now) {
    const clean = fold(value).replace(/[.!]$/, "").trim();
    if (/^(?:con\s+)?fecha\s+de\s+hoy$|^hoy$|^today$|^today['’]s date$/.test(clean)) return dateValue(now);
    let match = clean.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (match) return exactDate(Number(match[1]), Number(match[2]), Number(match[3]));
    match = clean.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
    if (match) return exactDate(Number(match[3]), Number(match[2]), Number(match[1]));
    const months = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
    match = clean.match(/^(\d{1,2})\s+(?:de\s+)?([a-z]+)\s+(?:de\s+)?(\d{4})$/);
    if (match && months.includes(match[2])) return exactDate(Number(match[3]), months.indexOf(match[2]) + 1, Number(match[1]));
    return null;
  }

  function parse(raw, now = new Date()) {
    const lines = cleanLines(raw);
    const candidates = new Map();
    const description = [];
    const notes = [];
    const review = [];
    const rejected = new Set();
    let continuation = "description";
    const add = (key, value) => {
      if (value === "" || value == null) return;
      const list = candidates.get(key) || [];
      list.push(value);
      candidates.set(key, list);
    };
    const addNumber = (key, value, label) => {
      const number = numberValue(value);
      if (number == null) {
        rejected.add(key);
        review.push("Revisa " + label + ": no pude leer “" + value + "” como un solo número.");
      } else add(key, number);
    };

    for (let index = 0; index < lines.length; index++) {
      const line = lines[index];
      const normalized = fold(line);
      let match;
      const following = (value) => value.trim() || (lines[++index] || "").trim();

      match = line.match(/^(?:nota|note|observaciones|condiciones de pago)\s*:\s*(.*)$/i);
      if (match) { notes.push(match[1]); continuation = "note"; continue; }
      match = line.match(/^(?:descripci[oó]n(?: del trabajo)?|description|trabajo)\s*:\s*(.*)$/i);
      if (match) { description.push(match[1]); continuation = "description"; continue; }

      if (/^(?:hola|buenos dias|buenas tardes|buenas noches|gracias)[!.,\s]*$|^ruben perla:?$/i.test(normalized)) continue;

      match = line.match(/^(?:compa[nñ][ií]a|empresa|cliente|bill to)\s*:\s*(.*)$/i);
      if (match) {
        const value = following(match[1]);
        add("billName", /\btrento(?:n)?\b/i.test(value) ? "Trenton Builders LLC" : value);
        continue;
      }
      if (/\btrento(?:n)?\b/i.test(line) && /^(?:para\b|trento(?:n)?\b|la (?:misma )?compania\b)/.test(normalized)) {
        add("billName", "Trenton Builders LLC"); continue;
      }

      match = line.match(/^(?:direcci[oó]n(?: del (?:trabajo|cliente))?|address|ubicaci[oó]n)\s*:\s*(.*)$/i);
      if (match) { add("billAddress", following(match[1])); continue; }
      if (/^\d{1,6}[a-z]?(?:[-/]\d+)?\s+.+\b(?:st(?:reet)?|ave(?:nue)?|rd|road|dr(?:ive)?|ct|court|blvd|boulevard|ln|lane|way|pl|place|pkwy|parkway|ter|terrace|cir|circle)\.?(?:\s|,|$)/i.test(line)) {
        let address = line;
        if (lines[index + 1] && /^[A-Za-z .'-]+,\s*[A-Z]{2}\s+\d{5}(?:-\d{4})?$/i.test(lines[index + 1])) address += ", " + lines[++index];
        add("billAddress", address); continue;
      }

      match = line.match(/^(?:n[uú]mero de (?:invoice|factura)|invoice(?:\s*(?:no\.?|number|n[.º°]+))?|factura(?:\s*(?:no\.?|n[.º°]+))?)\s*(?::|#|=)\s*(.*)$/i);
      if (match) {
        const value = following(match[1]).replace(/^#/, "");
        if (/^[A-Za-z0-9][A-Za-z0-9._/-]{0,39}$/.test(value)) add("invoiceNumber", "#" + value);
        else review.push("Revisa el número de invoice.");
        continue;
      }
      match = line.match(/^(?:(?:estimated\s+and\s+)?approved\s+by|estimated\s+and\s+approved\s+by|(?:estimado\s+y\s+)?aprobado\s+por)\s+.+$/i);
      if (match) { add("approval", line.toUpperCase()); continue; }
      match = line.match(/^(?:aprobaci[oó]n|approval)\s*:\s*(.*)$/i);
      if (match) { add("approval", following(match[1]).toUpperCase()); continue; }

      match = line.match(/^(?:fecha(?: de emisi[oó]n)?|issued(?: date)?|date)\s*:\s*(.*)$/i);
      if (match || /^(?:con\s+)?fecha\s+de\s+hoy[.!]?$|^con fecha\s+/i.test(line)) {
        const value = match ? following(match[1]) : line.replace(/^con fecha\s+(?!de hoy)/i, "");
        const date = readDate(value, now);
        if (date) {
          add("issuedDate", date);
          if (/^\d{1,2}[/-]\d{1,2}[/-]\d{4}$/.test(value)) review.push("La fecha numérica se leyó como día/mes/año.");
        } else { rejected.add("issuedDate"); review.push("Revisa la fecha: “" + value + "” no es una fecha válida reconocida."); }
        continue;
      }

      match = line.match(/^(?:cantidad|qty|quantity)\s*:\s*(.*)$/i);
      if (match) { addNumber("qty", following(match[1]), "la cantidad"); continue; }
      match = line.match(/^(?:precio (?:por unidad|unitario)|unit price)\s*:\s*(.*)$/i);
      if (match) { addNumber("price", following(match[1]), "el precio por unidad"); continue; }
      match = line.match(/^(?:price\s+for\s+(?:materials?|materiales?)\s+and\s+(?:labor|labour|mano\s+de\s+obra)|precio\s+(?:por|de|para) materiales?\s+y\s+mano\s+de\s+obra|grand\s+total|total(?:\s+(?:amount|due|a\s+pagar))?|monto(?:\s+total)?|importe|precio(?:\s+total)?|amount(?:\s+(?:due|a\s+pagar))?|costo(?:\s+total)?|balance\s+due)\b\s*(?::|=)?\s*(.*)$/i);
      if (match) { addNumber("total", following(match[1]), "el monto total"); continue; }
      if (/^(?:US\$|USD|\$)\s*[\d.,\s]+(?:\s*USD)?$/i.test(line) || /^(?:\d{1,3}(?:[,.\s]\d{3})+|\d+[.,]\d{2})\s*(?:USD|US\$|d[oó]lares?)$/i.test(line)) {
        addNumber("total", line, "el monto total"); continue;
      }
      const standaloneMoney = moneyLineValue(line);
      if (standaloneMoney != null && standaloneMoney >= 100) {
        add("total", standaloneMoney); continue;
      }

      match = normalized.match(/^(?:(?:anticipo(?: requerido)?|deposito|deposit)\s*:?\s*(\d+(?:[.,]\d{1,2})?)\s*%|(\d+(?:[.,]\d{1,2})?)\s*%\s+(?:de\s+)?anticipo)[.!]?$/);
      if (match) {
        const percent = numberValue(match[1] || match[2]);
        if (percent != null && percent <= 100) add("deposit", percent);
        else { rejected.add("deposit"); review.push("El anticipo debe estar entre 0% y 100%."); }
        continue;
      }
      if (/^(?:anticipo|deposito|deposit)\b/.test(normalized)) {
        notes.push(line); rejected.add("deposit");
        review.push("El anticipo se conservó como nota; revisa si es un monto o un porcentaje."); continue;
      }
      if (/^(?:horas?|hours?|tarifa|rate)\b/.test(normalized) || /^[\d$.,:\s]+$/.test(line)) {
        review.push("Línea para revisar manualmente: “" + line + "”."); continue;
      }
      (continuation === "note" ? notes : description).push(line);
    }

    const fields = {};
    const conflicts = [];
    for (const [key, values] of candidates) {
      const unique = [...new Map(values.map((value) => [String(value).toLowerCase(), value])).values()];
      if (unique.length > 1) conflicts.push(key);
      else if (!rejected.has(key)) fields[key] = unique[0];
    }
    if (description.some(Boolean)) fields.description = description.filter(Boolean).join("\n");
    if (notes.some(Boolean)) fields.note = notes.filter(Boolean).join("\n");
    if (conflicts.length) return { fields: {}, review: [], error: "Hay datos distintos para un mismo campo. Pega solo un trabajo y un monto final, o corrige las líneas repetidas." };

    let detectedTotal = fields.total;
    if (fields.total != null) {
      if (fields.qty != null && fields.price != null && Math.abs(Math.round(fields.qty * fields.price * 100) - Math.round(fields.total * 100)) > 0) {
        delete fields.total; delete fields.qty; delete fields.price;
        detectedTotal = undefined;
        review.push("Cantidad × precio no coincide con el total. Completa esos campos manualmente.");
      } else if (fields.qty != null && fields.price != null) {
        delete fields.total;
      } else {
        fields.qty = 1; fields.price = fields.total; delete fields.total;
        review.push("El monto total se cargó como un trabajo completo: cantidad 1.");
      }
    } else if (fields.price != null && fields.qty == null) {
      delete fields.price;
      review.push("Hay un precio por unidad, pero falta la cantidad. Revisa ambos campos.");
    } else if (fields.qty != null && fields.price == null) {
      delete fields.qty;
      review.push("Hay una cantidad, pero falta un precio reconocido. Revisa ambos campos.");
    }
    if (rejected.has("total") || rejected.has("price") || rejected.has("qty")) {
      delete fields.qty; delete fields.price;
      detectedTotal = undefined;
    }
    return { fields, detectedTotal, review, error: lines.length ? "" : "Pega primero el texto del mensaje." };
  }
  return { parse, dateValue };
})();

if (typeof module !== "undefined" && module.exports) module.exports = WhatsAppInvoiceParser;
if (typeof window !== "undefined") window.WhatsAppInvoiceParser = WhatsAppInvoiceParser;

/* Shared, testable invoice values. No browser or network dependency. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.InvoiceCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const fold = value => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  function amount(value) {
    if (typeof value === "number") return Number.isFinite(value) && value >= 0 && value <= 1e10 ? value : null;
    let n = String(value ?? "").replace(/\b(?:usd|d[oó]lares?)\b|us\$|\$/gi, "").trim();
    if (!/^\d+(?:[.,\s]\d+)*$/.test(n)) return null;
    if (/\s/.test(n) && !/^\d{1,3}(?:\s\d{3})+(?:[.,]\d{1,2})?$/.test(n)) return null;
    n = n.replace(/\s/g, "");
    if (n.includes(",") && n.includes(".")) {
      const commaDecimal = n.lastIndexOf(",") > n.lastIndexOf(".");
      const re = commaDecimal ? /^\d{1,3}(?:\.\d{3})+,\d{1,2}$/ : /^\d{1,3}(?:,\d{3})+\.\d{1,2}$/;
      if (!re.test(n)) return null;
      n = commaDecimal ? n.replace(/\./g, "").replace(",", ".") : n.replace(/,/g, "");
    } else if (/^\d{1,3}(?:,\d{3})+$/.test(n) || /^\d{1,3}(?:\.\d{3})+$/.test(n)) n = n.replace(/[.,]/g, "");
    else if (/^\d+[.,]\d{1,2}$/.test(n)) n = n.replace(",", ".");
    else if (!/^\d+$/.test(n)) return null;
    return amount(Number(n));
  }
  const cents = value => Math.round(((amount(value) ?? 0) + Number.EPSILON) * 100);
  function isoDate(value) {
    const m = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return "";
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return d.getFullYear() === +m[1] && d.getMonth() === +m[2] - 1 && d.getDate() === +m[3] ? value : "";
  }
  const issuedDate = r => isoDate(r.issuedDate || r.invoiceData?.issuedDate);
  const addressNorm = value => fold(value).replace(/[^a-z0-9]/g, "");
  const numberNorm = value => fold(value).replace(/^#/, "").trim().replace(/^0+(?=\d+$)/, "");
  function logicalKey(r) {
    const address = addressNorm(r.address || r.workAddress);
    const number = numberNorm(r.invoiceNumber);
    const date = issuedDate(r);
    return address && number && date ? [number, address, date].join("|") : "";
  }
  function select(records, {year = "all", stage = "all", query = ""} = {}) {
    const q = fold(query);
    return records.filter(r => {
      const date = issuedDate(r);
      return (year === "all" || (year === "undated" ? !date : date.slice(0, 4) === year)) &&
        (stage === "all" || r.stage === stage) &&
        (!q || fold([r.address, r.invoiceNumber, r.pdfName, r.description].join(" ")).includes(q));
    });
  }
  function summarize(records) {
    let total = 0, paid = 0;
    for (const r of records) { total += cents(r.amount); if (r.stage === "paid") paid += cents(r.amount); }
    return {count: records.length, total: total / 100, paid: paid / 100, pending: (total - paid) / 100};
  }
  function fileName(r) {
    const clean = v => String(v || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 110);
    return [clean(r.address || r.workAddress || "invoice"), clean(r.invoiceNumber), issuedDate(r)].filter(Boolean).join("_") + ".pdf";
  }
  function extract(text) {
    const lines = String(text || "").replace(/\u00a0/g, " ").split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    const warnings = [], fields = {address: "", invoiceNumber: "", issuedDate: "", amount: null};
    const rules = [
      /^(?:price\s+(?:for|per|of)\s+(?:materials?\s+and\s+)?labou?r|precio\s+(?:(?:por|de|para)\s+)?(?:materiales?\s+y\s+)?(?:mano\s+de\s+obra|labou?r))\s*[:.\-=]?\s*(.*)$/i,
      /^(?:grand\s+total|invoice\s+total|total\s+(?:de\s+la\s+factura|factura|facturado|invoice))\s*[:=]?\s*(.*)$/i,
      /^(?:total(?:\s+(?:amount|price))?|monto\s+total|precio\s+total|importe\s+total)\s*[:=]?\s*(.*)$/i
    ];
    for (const rule of rules) {
      const found = [];
      lines.forEach((line, i) => {
        const m = line.match(rule); if (!m) return;
        let tail = m[1].trim();
        if (!tail && lines[i + 1]) tail = lines[i + 1];
        if (/^(?:US\$|USD|\$)$/i.test(tail) && lines[i + 2]) tail += " " + lines[i + 2];
        const n = amount(tail); if (n != null) found.push(n);
      });
      if (!found.length) continue;
      const unique = [...new Set(found.map(cents))];
      if (unique.length === 1) fields.amount = unique[0] / 100;
      else warnings.push("Hay varios totales distintos. Escribe el total correcto de esta invoice.");
      break;
    }
    for (const line of lines) {
      const n = line.match(/^(?:invoice(?:\s*(?:no\.?|number|#))?|factura(?:\s*(?:no\.?|n[.º°]+|#))?)\s*[:=-]?\s*#?\s*([A-Z0-9][A-Z0-9._/-]{0,39})$/i) || line.match(/^#([A-Z0-9][A-Z0-9._/-]{0,39})$/i);
      if (n && !fields.invoiceNumber) fields.invoiceNumber = "#" + n[1];
      const d = line.match(/\b(issued(?:\s+date)?|date|fecha(?:\s+de\s+emisi[oó]n)?)\s*:?\s*(\d{4}-\d{2}-\d{2}|\d{1,2}[/-]\d{1,2}[/-]\d{4})\b/i);
      if (d && !fields.issuedDate) {
        if (/^\d{4}-/.test(d[2])) fields.issuedDate = isoDate(d[2]);
        else {
          const [a, b, y] = d[2].split(/[/-]/); const es = /^fecha/i.test(d[1]);
          fields.issuedDate = isoDate(y + "-" + (es ? b : a).padStart(2, "0") + "-" + (es ? a : b).padStart(2, "0"));
        }
      }
      const address = line.match(/^(?:work\s+address|job\s+address|direcci[oó]n(?:\s+del\s+trabajo)?)\s*:\s*(.+)$/i);
      if (address) fields.address = address[1];
    }
    if (!fields.address) {
      const addresses = lines.filter(l => /^\d{1,6}[A-Za-z]?\s+.+\b(?:st(?:reet)?|ave(?:nue)?|rd|road|dr(?:ive)?|ct|court|blvd|ln|lane|way|pl|place|pkwy|ter|cir)\b/i.test(l));
      if (addresses.length === 1) fields.address = addresses[0];
      else if (addresses.length > 1) warnings.push("Hay más de una dirección: elige la del trabajo.");
    }
    if (fields.amount == null) warnings.push("No se identificó un total único. Revísalo en el PDF.");
    if (!fields.issuedDate) warnings.push("Completa la fecha de emisión para incluirla en el año correcto.");
    return {fields, warnings};
  }
  return {amount, cents, isoDate, issuedDate, addressNorm, numberNorm, logicalKey, select, summarize, fileName, extract};
});

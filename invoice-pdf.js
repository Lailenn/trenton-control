(function (root) {
  const C = typeof module === "object" && module.exports ? require("./invoice-core.js") : root.InvoiceCore;
  const lib = () => root.PDFLib || (typeof require === "function" ? require("pdf-lib") : null);
  const money = n => new Intl.NumberFormat("en-US", {style: "currency", currency: "USD"}).format(n).replace(/\u00a0|\u202f/g, " ");
  const WIN = {0x20AC:1, 0x201A:1, 0x192:1, 0x201E:1, 0x2026:1, 0x2020:1, 0x2021:1, 0x2C6:1, 0x2030:1, 0x160:1, 0x2039:1, 0x152:1, 0x17D:1, 0x2018:1, 0x2019:1, 0x201C:1, 0x201D:1, 0x2022:1, 0x2013:1, 0x2014:1, 0x2DC:1, 0x2122:1, 0x161:1, 0x203A:1, 0x153:1, 0x17E:1, 0x178:1};
  const SWAP = {"\u00a0":" ","\u202f":" ","\u2009":" ","\u2011":"-","\u2013":"-","\u2014":"-","\u2015":"-","\u2018":"'","\u2019":"'","\u201c":'"',"\u201d":'"',"\u2026":"...","\u2022":"-","\u00b7":"-","\u2212":"-","\u00d7":"x","\u00f7":"/","¿":"?","¡":"!"};
  function pdfSafe(value) {
    return [...String(value ?? "").replace(/\t/g, "    ").replace(/\r\n/g, "\n").normalize("NFC")].map(ch => {
      if (SWAP[ch]) return SWAP[ch];
      const code = ch.codePointAt(0);
      if (code === 10 || code === 13 || (code >= 32 && code <= 126) || (code >= 160 && code <= 255) || WIN[code]) return ch;
      const folded = ch.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      if (folded && folded !== ch) {
        return [...folded].map(part => {
          const partCode = part.codePointAt(0);
          if ((partCode >= 32 && partCode <= 126) || SWAP[part]) return SWAP[part] || part;
          return " ";
        }).join("");
      }
      return " ";
    }).join("");
  }
  let reader;
  function appRoot() {
    const scripts = document.getElementsByTagName("script");
    for (const script of scripts) {
      const src = script.src || "";
      if (/invoice-pdf\.js/i.test(src)) return src.replace(/[^/]+(?:\?.*)?$/, "");
    }
    const path = location.pathname;
    const last = path.split("/").pop() || "";
    const dir = path.endsWith("/") ? path : /\.[a-z0-9]+$/i.test(last) ? path.replace(/[^/]+$/, "") : path + "/";
    return location.origin + dir;
  }
  function withTimeout(promise, ms, message) {
    let timer;
    return Promise.race([
      Promise.resolve(promise).finally(() => clearTimeout(timer)),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), ms); })
    ]);
  }
  async function hash(blob) {
    const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
    return Array.from(new Uint8Array(digest), n => n.toString(16).padStart(2, "0")).join("");
  }
  async function embedLogo(doc, logoBytes) {
    if (!logoBytes) return null;
    try {
      const bytes = logoBytes instanceof Uint8Array ? logoBytes : new Uint8Array(logoBytes);
      if (bytes.length < 8 || bytes.length > 1500000) return null;
      if (bytes[0] === 0x89 && bytes[1] === 0x50) return await doc.embedPng(bytes);
      if (bytes[0] === 0xFF && bytes[1] === 0xD8) return await doc.embedJpg(bytes);
      return null;
    } catch (error) {
      console.warn("No se pudo incrustar el logo en la invoice", error);
      return null;
    }
  }
  async function generate(data, logoBytes) {
    const pdfLib = lib();
    if (!pdfLib) throw new Error("No se cargó el generador de PDF. Recarga la página.");
    const {PDFDocument, StandardFonts, rgb} = pdfLib;
    const doc = await PDFDocument.create();
    const regular = await doc.embedFont(StandardFonts.Helvetica);
    const bold = await doc.embedFont(StandardFonts.HelveticaBold);
    const total = C.invoiceTotal(data);
    // The NOTE heading already says "note": drop a leading "Note:" from the text.
    const note = String(data.note || C.paymentNote(total, data.deposit, money)).replace(/^\s*note\s*:\s*/i, "");
    const date = C.isoDate(data.issuedDate);
    const dateLabel = date ? date.slice(5, 7) + "/" + date.slice(8, 10) + "/" + date.slice(0, 4) : "";
    const docTitle = String(data.docTitle || "ESTIMATE").trim().toUpperCase();
    const logo = await embedLogo(doc, logoBytes);
    // Layout in a 816 × 1056 grid (letter at 96 dpi), scaled to PDF points.
    const s = .75, height = 1056, left = 58, right = 758, width = right - left;
    const accent = rgb(230 / 255, 106 / 255, 34 / 255);
    const peach = rgb(251 / 255, 239 / 255, 230 / 255);
    const greyFill = rgb(240 / 255, 240 / 255, 241 / 255);
    const ink = rgb(30 / 255, 33 / 255, 38 / 255);
    const muted = rgb(80 / 255, 84 / 255, 92 / 255);
    const lineColor = rgb(196 / 255, 199 / 255, 204 / 255);
    function measure(font, value, size) {
      const text = pdfSafe(value);
      try { return font.widthOfTextAtSize(text, size); }
      catch (_) { return font.widthOfTextAtSize(text.normalize("NFD").replace(/[^\x20-\x7e]/g, " "), size); }
    }
    function wrap(value, font, size, max) {
      const result = [];
      const limit = Math.max(40, Number(max) || 40);
      let chars = 0;
      for (const paragraph of pdfSafe(value).split(/\r?\n/)) {
        let line = "";
        for (const word of paragraph.split(/\s+/).filter(Boolean)) {
          const next = line ? line + " " + word : word;
          if (measure(font, next, size) <= limit) line = next;
          else {
            if (line) result.push(line);
            line = "";
            for (const char of word) {
              if (line && measure(font, line + char, size) > limit) { result.push(line); line = ""; }
              line += char;
              if (++chars > 8000 || result.length > 200) return result.length ? result : [pdfSafe(value).slice(0, 80)];
            }
          }
          if (result.length > 200) return result;
        }
        result.push(line);
        if (result.length > 200) return result;
      }
      return result.length ? result : [""];
    }
    let page;
    let pageCount = 0;
    function draw(value, x, y, size = 16, font = regular, color = ink) {
      const text = pdfSafe(value);
      try { page.drawText(text, {x: x * s, y: (height - y - size) * s, size: size * s, font, color}); }
      catch (_) {
        try { page.drawText(text.replace(/[^\x20-\x7e\n]/g, " "), {x: x * s, y: (height - y - size) * s, size: size * s, font, color}); }
        catch (__) { /* si un glifo no entra, no tumba todo el PDF */ }
      }
    }
    function rightText(value, x, y, size = 16, font = regular, color = ink) {
      draw(value, x - measure(font, value, size), y, size, font, color);
    }
    // Small capitals with letter spacing (labels like FROM, BILL TO, DESCRIPTION).
    const tracking = size => size * .14;
    function spacedWidth(value, size, font = bold) {
      const text = pdfSafe(value);
      return [...text].reduce((sum, ch) => sum + measure(font, ch, size), 0) + Math.max(0, text.length - 1) * tracking(size);
    }
    function spaced(value, x, y, size, font = bold, color = ink) {
      let cursor = x;
      for (const ch of pdfSafe(value)) { draw(ch, cursor, y, size, font, color); cursor += measure(font, ch, size) + tracking(size); }
    }
    function line(x1, y1, x2, y2, thickness = 1, color = lineColor) {
      page.drawLine({start: {x: x1 * s, y: (height - y1) * s}, end: {x: x2 * s, y: (height - y2) * s}, thickness, color});
    }
    function box(x, y, w, h, color) {
      page.drawRectangle({x: x * s, y: (height - y - h) * s, width: w * s, height: h * s, color});
    }
    function accentBar(x, y, w = 34) { box(x, y, w, 3, accent); }
    function linesAt(lines, x, y, size, font, spacing, color = ink) { lines.forEach((l, i) => draw(l, x, y + i * spacing, size, font, color)); return y + lines.length * spacing; }
    function header(parties = true) {
      if (++pageCount > 8) throw new Error("El PDF se volvió demasiado largo. Acorta la descripción o la nota.");
      page = doc.addPage([612, 792]);
      box(0, 0, 816, height, rgb(1, 1, 1));
      if (logo && Number(logo.width) > 1 && Number(logo.height) > 1) {
        const factor = Math.min(240 / logo.width, 96 / logo.height);
        const logoH = logo.height * factor;
        if (Number.isFinite(factor) && Number.isFinite(logoH) && logoH > 0) {
          page.drawImage(logo, {x: left * s, y: (height - 52 - logoH) * s, width: logo.width * factor * s, height: logoH * s});
        }
      }
      // ESTIMATE / INVOICE title with an accent underline, number, date and approval line.
      rightText(docTitle, right, 56, 40, bold, ink);
      accentBar(right - measure(bold, docTitle, 40), 106, 48);
      rightText(data.invoiceNumber, right, 128, 15, regular, muted);
      rightText("Issued " + dateLabel, right, 150, 15, regular, muted);
      let approvalY = 178;
      for (const l of wrap(String(data.approval || "").toUpperCase(), regular, 11, 380)) {
        if (l) spaced(l, right - spacedWidth(l, 11, regular), approvalY, 11, regular, muted);
        approvalY += 16;
      }
      if (!parties) return Math.max(250, approvalY + 30);
      const y = Math.max(236, approvalY + 30);
      const mid = left + width / 2;
      function party(label, name, details, x, max) {
        spaced(label, x, y, 12, bold, ink);
        accentBar(x, y + 22, 34);
        let bottom = linesAt(wrap(name, bold, 22, max), x, y + 44, 22, bold, 27, ink) + 6;
        for (const detail of details.filter(Boolean)) bottom = linesAt(wrap(detail, regular, 15, max), x, bottom, 15, regular, 22, ink) + 2;
        return Number.isFinite(bottom) ? bottom : y + 90;
      }
      const a = party("FROM", data.fromName, [data.fromPhone, data.fromEmail, data.fromAddress], left + 16, width / 2 - 40);
      const b = party("BILL TO", data.billName, [data.billAddress], mid + 46, width / 2 - 60);
      const partiesBottom = Math.max(a, b);
      line(mid + 10, y - 6, mid + 10, partiesBottom + 6, 1, lineColor);
      const top = partiesBottom + 34;
      return Number.isFinite(top) ? top : 470;
    }
    // Every concept becomes wrapped description lines; its first line carries qty / price / amount.
    // A blank line separates concepts. Several concepts always show their amounts.
    const items = C.invoiceItems(data);
    const showAmounts = (data.showLines || items.length > 1) && total > 0;
    const description = [];
    items.forEach((item, i) => {
      if (i) description.push({ text: "" });
      wrap(item.description || "Work performed", regular, 15, width * .48 - 30)
        .forEach((text, j) => description.push({ text, item: j === 0 ? item : null }));
    });
    const columns = [left - 14, left - 14 + (width + 28) * .494, left - 14 + (width + 28) * .603, left - 14 + (width + 28) * .794, right + 14];
    const headH = 62, rowH = 24;
    let index = 0, tableBottom = 470, safety = 0;
    while (index < description.length && safety++ < 8) {
      const top = header();
      let capacity = Math.floor((height - 90 - top - headH - 120) / rowH);
      if (!Number.isFinite(capacity) || capacity < 1) capacity = 6;
      const chunk = description.slice(index, index + capacity);
      if (!chunk.length) break;
      index += chunk.length;
      const body = Math.max(190, chunk.length * rowH + 44);
      tableBottom = top + headH + body;
      box(columns[0], top, columns[4] - columns[0], headH, peach);
      columns.forEach(x => line(x, top, x, tableBottom, 1, lineColor));
      [top, top + headH, tableBottom].forEach(y => line(columns[0], y, columns[4], y, 1, lineColor));
      ["DESCRIPTION", "QTY", "PRICE, USD", "AMOUNT, USD"].forEach((label, i) => {
        const x = i === 0 ? columns[0] + 28 : (columns[i] + columns[i + 1] - spacedWidth(label, 12)) / 2;
        spaced(label, x, top + (headH - 12) / 2, 12, bold, ink);
      });
      chunk.forEach((row, i) => {
        const y = top + headH + 34 + i * rowH;
        draw(row.text, columns[0] + 28, y, 15, regular, ink);
        if (!showAmounts || !row.item) return;
        const amount = C.cents(row.item.qty * row.item.price) / 100;
        [String(row.item.qty), money(row.item.price).replace("$", "$ "), money(amount).replace("$", "$ ")].forEach((text, k) => {
          const col = k + 1, room = columns[col + 1] - columns[col] - 12;
          const size = Math.min(15, room / Math.max(measure(regular, text, 1), 0.01));
          draw(text, (columns[col] + columns[col + 1] - measure(regular, text, size)) / 2, y, size, regular, ink);
        });
      });
      if (index === description.length) {
        // TOTAL (Materials and Labor) | $ amount
        const boxTop = tableBottom + 12, boxH = 66;
        box(columns[2] - 120, boxTop, columns[3] - (columns[2] - 120), boxH, greyFill);
        box(columns[3], boxTop, columns[4] - columns[3], boxH, peach);
        box(columns[3], boxTop - 3, columns[4] - columns[3], 3, accent);
        const labelY = boxTop + (boxH - 18) / 2;
        const small = "(Materials and Labor)";
        const labelW = measure(bold, "TOTAL", 18) + 8 + measure(regular, small, 13);
        const labelX = columns[3] - 22 - labelW;
        draw("TOTAL", labelX, labelY, 18, bold, ink);
        draw(small, labelX + measure(bold, "TOTAL", 18) + 8, labelY + 4, 13, regular, ink);
        const totalText = money(total).replace("$", "$ ");
        const totalSize = Math.min(20, (columns[4] - columns[3] - 24) / Math.max(measure(bold, totalText, 1), 0.01));
        draw(totalText, (columns[3] + columns[4] - measure(bold, totalText, totalSize)) / 2, boxTop + (boxH - totalSize) / 2, totalSize, bold, ink);
        tableBottom = boxTop + boxH;
      }
    }
    let noteY = tableBottom + 48;
    if (noteY + 90 > height - 48) noteY = header(false);
    spaced("NOTE", left + 16, noteY, 12, bold, ink);
    accentBar(left + 16, noteY + 22, 34);
    noteY += 52;
    for (const l of wrap(note, regular, 15, width * .72)) {
      if (noteY + 22 > height - 30) noteY = header(false);
      draw(l, left + 16, noteY, 15, regular, muted); noteY += 24;
    }
    doc.setTitle(pdfSafe((data.workAddress || data.billAddress || "Invoice") + " - " + data.invoiceNumber));
    doc.setAuthor(pdfSafe(data.fromName || "Ruben Perla"));
    try {
      doc.setSubject(pdfSafe("TrentonControl/v1:" + JSON.stringify({id: data.recordId || "", address: data.workAddress || data.billAddress, invoiceNumber: data.invoiceNumber, issuedDate: date, amount: total, qty: Number(data.qty) || 1, price: Number(data.price) || total})));
    } catch (_) { /* el asunto interno no debe tumbar el PDF */ }
    doc.setCreator("Trenton Control");
    return new Blob([await doc.save()], {type: "application/pdf"});
  }
  async function loadPdfjs() {
    const root = appRoot();
    if (!reader) reader = import(root + "vendor/pdf.min.mjs");
    const pdfjs = await reader;
    pdfjs.GlobalWorkerOptions.workerSrc = root + "vendor/pdf.worker.min.mjs";
    return pdfjs;
  }
  async function openPdfDocument(bytes) {
    const pdfjs = await loadPdfjs();
    const root = appRoot();
    const options = {
      data: bytes,
      isEvalSupported: false,
      useWasm: false,
      disableFontFace: true,
      standardFontDataUrl: root + "vendor/standard_fonts/"
    };
    try {
      return pdfjs.getDocument(options);
    } catch (_) {
      return pdfjs.getDocument({ ...options, useWorkerFetch: false, disableAutoFetch: true });
    }
  }
  async function read(file) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const pdfHash = await hash(file);
    const task = await openPdfDocument(bytes);
    let doc;
    try {
      doc = await withTimeout(task.promise, 18000, "El PDF tardó demasiado en abrirse. Prueba de nuevo o completa los datos a mano.");
      if (doc.numPages > 100) throw new Error("Este PDF supera las 100 páginas. Sube un archivo por invoice.");
      let text = "";
      for (let n = 1; n <= doc.numPages; n++) {
        const page = await doc.getPage(n);
        const {items} = await page.getTextContent();
        const lines = [];
        for (const item of items.filter(i => i.str)) {
          const y = item.transform[5]; let row = lines.find(r => Math.abs(r.y - y) < 3);
          if (!row) { row = {y, items: []}; lines.push(row); }
          row.items.push(item);
        }
        text += lines.sort((a, b) => b.y - a.y).map(r => r.items.sort((a, b) => a.transform[4] - b.transform[4]).map(i => i.str).join(" ")).join("\n") + "\n";
      }
      const extracted = C.extract(text);
      const metadata = await doc.getMetadata();
      const subject = metadata.info?.Subject || "";
      let sourceId = "";
      if (subject.startsWith("TrentonControl/v1:")) {
        try {
          const saved = JSON.parse(subject.slice("TrentonControl/v1:".length));
          if (typeof saved.address === "string") extracted.fields.address = saved.address.slice(0, 500);
          if (typeof saved.invoiceNumber === "string") extracted.fields.invoiceNumber = saved.invoiceNumber.slice(0, 60);
          if (C.isoDate(saved.issuedDate)) extracted.fields.issuedDate = saved.issuedDate;
          if (typeof saved.id === "string") sourceId = saved.id.slice(0, 100);
          if (C.amount(saved.qty) != null && saved.qty > 0) extracted.fields.qty = C.amount(saved.qty);
          if (extracted.fields.amount != null && C.amount(saved.amount) != null && C.cents(saved.amount) !== C.cents(extracted.fields.amount)) {
            extracted.fields.amount = C.amount(saved.amount);
            extracted.warnings.push("Se usó el total guardado en el PDF. Revísalo si no coincide con lo impreso.");
          } else if (extracted.fields.amount == null && C.amount(saved.amount) != null) {
            extracted.fields.amount = C.amount(saved.amount);
          }
          if (!(extracted.fields.qty > 0) && extracted.fields.amount != null) extracted.fields.qty = 1;
        } catch (_) { /* Regular text extraction remains available. */ }
      }
      if (text.trim().length < 10) extracted.warnings.unshift("El PDF es una imagen o no tiene texto legible. Completa los datos viendo el original.");
      return {...extracted, text, pdfHash, sourceId};
    } finally { await task.destroy(); }
  }
  const api = {generate, read, hash};
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.InvoicePDF = api;
})(typeof globalThis !== "undefined" ? globalThis : this);

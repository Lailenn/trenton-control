(function (root) {
  const C = typeof module === "object" && module.exports ? require("./invoice-core.js") : root.InvoiceCore;
  const lib = () => root.PDFLib || (typeof require === "function" ? require("pdf-lib") : null);
  const money = n => new Intl.NumberFormat("en-US", {style: "currency", currency: "USD"}).format(n);
  let reader;
  async function hash(blob) {
    const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
    return Array.from(new Uint8Array(digest), n => n.toString(16).padStart(2, "0")).join("");
  }
  async function generate(data, logoBytes) {
    const {PDFDocument, StandardFonts, rgb} = lib();
    const doc = await PDFDocument.create();
    const regular = await doc.embedFont(StandardFonts.Helvetica);
    const bold = await doc.embedFont(StandardFonts.HelveticaBold);
    const total = C.cents(Number(data.qty) * Number(data.price)) / 100;
    const deposit = Math.min(100, Math.max(0, Number(data.deposit) || 0));
    const first = Math.round(total * deposit) / 100;
    const note = data.note || `Note: At the beginning of the project, ${deposit}% equivalent to ${money(first)} is required, and at the end of the work, the final ${100 - deposit}% equivalent to ${money(Math.round((total - first) * 100) / 100)} is required.`;
    const date = C.isoDate(data.issuedDate);
    const dateLabel = date ? date.slice(5, 7) + "/" + date.slice(8, 10) + "/" + date.slice(0, 4) : "";
    let logo;
    if (logoBytes) {
      const bytes = new Uint8Array(logoBytes);
      logo = bytes[0] === 137 ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
    }
    const s = .75, height = 1056, left = 56, right = 803, width = right - left;
    const clean = text => String(text ?? "").replace(/\t/g, "    ").replace(/[\u2010-\u2014]/g, "-");
    function wrap(value, font, size, max) {
      const result = [];
      for (const paragraph of clean(value).split(/\r?\n/)) {
        let line = "";
        for (const word of paragraph.split(/\s+/).filter(Boolean)) {
          if (font.widthOfTextAtSize((line ? line + " " : "") + word, size) <= max) line += (line ? " " : "") + word;
          else {
            if (line) result.push(line); line = "";
            for (const char of word) {
              if (font.widthOfTextAtSize(line + char, size) > max && line) { result.push(line); line = ""; }
              line += char;
            }
          }
        }
        result.push(line);
      }
      return result;
    }
    let page;
    function text(value, x, y, size = 16, font = regular, color = rgb(0, 0, 0)) {
      page.drawText(clean(value), {x: x * s, y: (height - y - size) * s, size: size * s, font, color});
    }
    function rightText(value, x, y, size = 16, font = regular, color) {
      text(value, x - font.widthOfTextAtSize(clean(value), size), y, size, font, color);
    }
    function line(x1, y1, x2, y2) {
      page.drawLine({start: {x: x1 * s, y: (height - y1) * s}, end: {x: x2 * s, y: (height - y2) * s}, thickness: .6});
    }
    function linesAt(lines, x, y, size, font, spacing) { lines.forEach((l, i) => text(l, x, y + i * spacing, size, font)); return y + lines.length * spacing; }
    function header(parties = true) {
      page = doc.addPage([612, 792]);
      const nameLines = wrap(data.fromName || "Ruben Perla", bold, 24, 260);
      const nameBottom = linesAt(nameLines, 62, 60, 24, bold, 29);
      if (logo) {
        const factor = Math.min(156 / logo.width, 76 / logo.height);
        page.drawImage(logo, {x: 62 * s, y: (height - nameBottom - logo.height * factor) * s, width: logo.width * factor * s, height: logo.height * factor * s});
      }
      const approval = wrap(data.approval || "", bold, 14, 420);
      approval.forEach((l, i) => rightText(l, right, 69 + i * 18, 14, bold));
      const numberY = 69 + approval.length * 18 + 22;
      rightText(data.invoiceNumber, right, numberY, 16, regular, rgb(.5, .5, .5));
      rightText("Issued " + dateLabel, right, numberY + 20, 16, regular, rgb(.5, .5, .5));
      if (!parties) return Math.max(205, nameBottom + 100);
      const y = Math.max(225, nameBottom + 136);
      function party(label, name, details, x, max) {
        text(label, x, y);
        let bottom = linesAt(wrap(name, bold, 20, max), x, y + 36, 20, bold, 24) + 10;
        for (const detail of details.filter(Boolean)) bottom = linesAt(wrap(detail, regular, 16, max), x, bottom, 16, regular, 20) + 6;
        return bottom - 6;
      }
      const a = party("FROM", data.fromName, [data.fromPhone, data.fromEmail, data.fromAddress], 62, 342);
      const b = party("BILL TO", data.billName, [data.billAddress], 415, 382);
      return Math.max(402, a + 35, b + 35);
    }
    const description = wrap(data.description || "Trabajo realizado", regular, 16, width * .576 - 12);
    let index = 0, tableBottom = 0;
    while (index < description.length) {
      const top = header();
      const capacity = Math.floor((height - 90 - top - 48 - 36) / 20);
      if (capacity < 1) throw new Error("Reduce la longitud de los datos del encabezado para generar el PDF.");
      const chunk = description.slice(index, index + capacity); index += chunk.length;
      const body = Math.max(226, chunk.length * 20 + 36);
      tableBottom = top + 48 + body;
      page.drawRectangle({x: left * s, y: (height - top - 48) * s, width: width * s, height: 48 * s, color: rgb(253 / 255, 233 / 255, 217 / 255)});
      const columns = [left, left + width * .576, left + width * .654, left + width * .818, right];
      columns.forEach(x => line(x, top, x, tableBottom));
      [top, top + 48, tableBottom].forEach(y => line(left, y, right, y));
      ["Description", "QTY", "Price, USD", "Amount, USD"].forEach((label, i) => {
        const x = i === 0 ? left + 8 : (columns[i] + columns[i + 1] - bold.widthOfTextAtSize(label, 14)) / 2;
        text(label, x, top + 15, 14, bold);
      });
      linesAt(chunk, left + 5, top + 66, 16, regular, 20);
      if (index === description.length) {
        line(columns[3], tableBottom, columns[3], tableBottom + 27);
        line(right, tableBottom, right, tableBottom + 27);
        line(columns[3], tableBottom + 27, right, tableBottom + 27);
        rightText("Price for materials and labor:", columns[3] - 7, tableBottom + 4);
        const totalText = money(total).replace("$", "$ ");
        const totalSize = Math.min(16, (right - columns[3] - 12) / bold.widthOfTextAtSize(totalText, 1));
        text(totalText, columns[3] + 6, tableBottom + 4, totalSize, bold);
      }
    }
    const noteLines = wrap(note, bold, 17, right - 42);
    let noteY = tableBottom + 77;
    for (const l of noteLines) {
      if (noteY + 24 > height - 48) noteY = header(false);
      text(l, 42, noteY, 17, bold); noteY += 24;
    }
    doc.setTitle((data.workAddress || data.billAddress || "Invoice") + " - " + data.invoiceNumber);
    doc.setAuthor(data.fromName || "Ruben Perla");
    doc.setSubject("TrentonControl/v1:" + JSON.stringify({id: data.recordId || "", address: data.workAddress || data.billAddress, invoiceNumber: data.invoiceNumber, issuedDate: date, amount: total}));
    doc.setCreator("Trenton Control");
    return new Blob([await doc.save()], {type: "application/pdf"});
  }
  async function read(file) {
    if (!reader) reader = import("./vendor/pdf.min.mjs");
    const pdfjs = await reader;
    pdfjs.GlobalWorkerOptions.workerSrc = new URL("vendor/pdf.worker.min.mjs", document.baseURI).href;
    const bytes = new Uint8Array(await file.arrayBuffer());
    const pdfHash = await hash(file);
    const task = pdfjs.getDocument({data: bytes, isEvalSupported: false, useWasm: false, disableFontFace: true, standardFontDataUrl: new URL("vendor/standard_fonts/", document.baseURI).href});
    let doc;
    try {
      doc = await task.promise;
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
          if (extracted.fields.amount != null && C.amount(saved.amount) != null && C.cents(saved.amount) !== C.cents(extracted.fields.amount)) {
            extracted.fields.amount = null;
            extracted.warnings.push("Los datos internos y el total impreso no coinciden. Revisa el monto.");
          }
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

/* Creates the Arrento Carpentry work-hours report as a real Letter PDF. */
(function (root) {
  "use strict";
  const lib = () => root.PDFLib || (typeof require === "function" ? require("pdf-lib") : null);
  const WIN = {0x20AC:1, 0x201A:1, 0x192:1, 0x201E:1, 0x2026:1, 0x2020:1, 0x2021:1, 0x2C6:1, 0x2030:1, 0x160:1, 0x2039:1, 0x152:1, 0x17D:1, 0x2018:1, 0x2019:1, 0x201C:1, 0x201D:1, 0x2022:1, 0x2013:1, 0x2014:1, 0x2DC:1, 0x2122:1, 0x161:1, 0x203A:1, 0x153:1, 0x17E:1, 0x178:1};
  const SWAP = {"\u00a0":" ","\u202f":" ","\u2009":" ","\u2011":"-","\u2013":"-","\u2014":"-","\u2015":"-","\u2018":"'","\u2019":"'","\u201c":'"',"\u201d":'"',"\u2026":"...","\u2022":"-","\u00b7":"-","\u2212":"-","\u00d7":"x","\u00f7":"/","¿":"?","¡":"!"};
  const pdfSafe = value => [...String(value ?? "").replace(/[\u2010-\u2014]/g, "-").replace(/\t/g, "    ").replace(/\r\n/g, "\n").normalize("NFC")].map(ch => {
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
  const dateValue = value => {
    const date = new Date(`${value}T12:00:00`);
    return Number.isNaN(date.getTime()) ? null : date;
  };
  const dayName = value => pdfSafe(dateValue(value)?.toLocaleDateString("en-US", {weekday: "long"}) || value || "");
  const fullDate = value => pdfSafe(dateValue(value)?.toLocaleDateString("en-US", {weekday: "long", month: "long", day: "numeric", year: "numeric"}) || value || "");
  const hoursLabel = value => {
    const number = Number(value) || 0;
    const label = Number.isInteger(number) ? String(number) : String(number.toFixed(2)).replace(/\.?0+$/, "");
    return `${label} HRS`;
  };
  const money = value => {
    const number = Number(value) || 0;
    const decimals = Number.isInteger(number) ? 0 : 2;
    return `$${number.toFixed(decimals)}`;
  };
  const timeLabel = value => {
    const match = String(value || "").match(/^(\d{1,2}):(\d{2})$/);
    if (!match) return value || "";
    return `${String(Number(match[1])).padStart(2, "0")}:${match[2]}`;
  };
  const calcHours = entry => {
    const manual = entry && (entry.hoursOverride ?? entry.manualHours);
    if (manual !== "" && manual != null && Number.isFinite(Number(manual)) && Number(manual) >= 0) return Number(manual);
    if (Number.isFinite(Number(entry.hours)) && Number(entry.hours) >= 0 && entry.hours !== "") return Number(entry.hours);
    const start = String(entry.timeIn || "").split(":").map(Number), end = String(entry.timeOut || "").split(":").map(Number);
    if (start.length !== 2 || end.length !== 2 || start.some(Number.isNaN) || end.some(Number.isNaN)) return 0;
    let minutes = end[0] * 60 + end[1] - (start[0] * 60 + start[1]);
    if (minutes < 0) minutes += 24 * 60;
    return Math.max(0, (minutes - Math.max(0, Number(entry.lunch) || 0)) / 60);
  };

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
      console.warn("No se pudo incrustar el logo de Arrento", error);
      return null;
    }
  }

  async function generate(data, logoBytes) {
    const pdfLib = lib();
    if (!pdfLib) throw new Error("No se cargó el generador de PDF. Recarga la página.");
    const {PDFDocument, StandardFonts, rgb, PageSizes} = pdfLib;
    const doc = await PDFDocument.create();
    const letter = (PageSizes && PageSizes.Letter) || [612, 792];
    const regular = await doc.embedFont(StandardFonts.Helvetica);
    const bold = await doc.embedFont(StandardFonts.HelveticaBold);
    const logo = await embedLogo(doc, logoBytes);
    const entries = (Array.isArray(data.entries) ? data.entries : []).map(entry => ({
      date: entry.date || data.reportDate || "",
      employee: String(entry.employee || "").trim(),
      timeIn: entry.timeIn || "",
      timeOut: entry.timeOut || "",
      lunch: Math.max(0, Number(entry.lunch) || 0),
      hours: calcHours(entry),
      rate: Math.max(0, Number(entry.rate ?? data.defaultRate) || 0)
    })).filter(entry => entry.employee);
    const groups = new Map();
    entries.forEach(entry => { const list = groups.get(entry.employee) || []; list.push(entry); groups.set(entry.employee, list); });
    const summary = [...groups].map(([employee, rows]) => {
      const totalHours = rows.reduce((sum, row) => sum + row.hours, 0);
      const rates = [...new Set(rows.map(row => row.rate))];
      const rate = rates.length === 1 ? rates[0] : null;
      return {employee, totalHours, rate, pay: rows.reduce((sum, row) => sum + row.hours * row.rate, 0)};
    });
    const totalHours = summary.reduce((sum, row) => sum + row.totalHours, 0);
    const totalPay = summary.reduce((sum, row) => sum + row.pay, 0);
    const pageW = Number(letter[0]) || 612, pageH = Number(letter[1]) || 792, left = 42, width = pageW - left * 2;
    const ink = rgb(0, 0, 0);
    const copper = rgb(212 / 255, 101 / 255, 47 / 255);
    const peach = rgb(253 / 255, 233 / 255, 217 / 255);
    const lineColor = rgb(0, 0, 0);
    let page, cursor;
    const measure = (font, value, size) => {
      const label = pdfSafe(value);
      try { return font.widthOfTextAtSize(label, size); }
      catch (_) { return font.widthOfTextAtSize(label.normalize("NFD").replace(/[^\x20-\x7e]/g, " "), size); }
    };
    const wrap = (value, font, size, max) => {
      const result = [];
      for (const paragraph of pdfSafe(value).split(/\r?\n/)) {
        let line = "";
        for (const word of paragraph.split(/\s+/).filter(Boolean)) {
          if (measure(font, (line ? line + " " : "") + word, size) <= max) line += (line ? " " : "") + word;
          else {
            if (line) result.push(line); line = "";
            for (const char of word) {
              if (measure(font, line + char, size) > max && line) { result.push(line); line = ""; }
              line += char;
            }
          }
        }
        result.push(line);
      }
      return result.filter(Boolean);
    };
    const newPage = () => {
      page = doc.addPage([pageW, pageH]);
      if (typeof page.setSize === "function") page.setSize(pageW, pageH);
      if (typeof page.setMediaBox === "function") page.setMediaBox(0, 0, pageW, pageH);
      if (typeof page.setCropBox === "function") page.setCropBox(0, 0, pageW, pageH);
      cursor = 44;
    };
    const text = (value, x, top, size = 10, font = regular, color = ink) => {
      const label = pdfSafe(value);
      try { page.drawText(label, {x, y: pageH - top - size, size, font, color}); }
      catch (_) {
        try { page.drawText(label.replace(/[^\x20-\x7e\n]/g, " "), {x, y: pageH - top - size, size, font, color}); }
        catch (__) { /* si un glifo no entra, no tumba todo el PDF */ }
      }
    };
    const centered = (value, top, size = 10, font = regular, color = ink) => { const label = pdfSafe(value); text(label, (pageW - measure(font, label, size)) / 2, top, size, font, color); };
    const line = (x1, y1, x2, y2, thickness = 1, color = lineColor) => page.drawLine({start: {x: x1, y: pageH - y1}, end: {x: x2, y: pageH - y2}, thickness, color});
    const cell = (value, x, top, w, size = 10, font = regular, align = "left", color = ink) => {
      const label = pdfSafe(value); const measured = measure(font, label, size); const px = align === "center" ? x + (w - measured) / 2 : align === "right" ? x + w - measured - 7 : x + 7;
      text(label, px, top + 7, size, font, color);
    };
    const table = (top, columns, headers, rows, totalRow, bodyFirstColumnPeach = false) => {
      const rowHeight = 27, headerHeight = 28, totalHeight = 27, height = headerHeight + rows.length * rowHeight + totalHeight;
      page.drawRectangle({x: left, y: pageH - top - headerHeight, width, height: headerHeight, color: peach});
      page.drawRectangle({x: left, y: pageH - top - height, width, height: totalHeight, color: peach});
      line(left, top, left + width, top); line(left, top + headerHeight, left + width, top + headerHeight); line(left, top + height - totalHeight, left + width, top + height - totalHeight); line(left, top + height, left + width, top + height);
      let x = left; columns.forEach(w => { line(x, top, x, top + height); x += w; }); line(left + width, top, left + width, top + height);
      x = left; headers.forEach((header, i) => { cell(header, x, top, columns[i], 9.6, bold, "left", ink); x += columns[i]; });
      rows.forEach((row, rowIndex) => {
        if (bodyFirstColumnPeach) page.drawRectangle({x: left, y: pageH - top - headerHeight - (rowIndex + 1) * rowHeight, width: columns[0], height: rowHeight, color: peach});
        x = left; row.forEach((value, i) => { cell(value, x, top + headerHeight + rowIndex * rowHeight, columns[i], 9.5, i === 0 ? bold : regular, "left", ink); x += columns[i]; });
      });
      x = left; totalRow.forEach((value, i) => { cell(value, x, top + height - totalHeight, columns[i], 9.5, bold, "left", ink); x += columns[i]; });
      return top + height;
    };
    const header = () => {
      newPage();
      page.drawRectangle({x: 0, y: pageH - 8, width: pageW, height: 8, color: rgb(0, 0, 0)});
      page.drawRectangle({x: 0, y: 0, width: pageW, height: 6, color: copper});
      if (logo && logo.width > 1 && logo.height > 1) {
        const factor = Math.min(220 / logo.width, 70 / logo.height);
        if (Number.isFinite(factor) && factor > 0) {
          page.drawImage(logo, {x: (pageW - logo.width * factor) / 2, y: pageH - 48 - logo.height * factor, width: logo.width * factor, height: logo.height * factor});
        }
      }
      const jobLabel = "JOB:"; const address = pdfSafe(data.jobAddress || ""); const jobSize = 13; const jobWidth = measure(bold, jobLabel, jobSize) + 8 + measure(bold, address, jobSize); const jobX = (pageW - jobWidth) / 2;
      text(jobLabel, jobX, 137, jobSize, bold, ink); text(address, jobX + measure(bold, jobLabel, jobSize) + 8, 137, jobSize, bold, ink); line(jobX + measure(bold, jobLabel, jobSize) + 8, 154, jobX + jobWidth, 154, 1, ink);
      centered(fullDate(data.reportDate), 169, 13, bold, ink);
      cursor = 205;
    };
    header();
    const columns = [100, 115, 85, 85, 70, Math.max(60, width - 100 - 115 - 85 - 85 - 70)];
    const pageLimit = pageH - 82;
    const maxRowsFit = () => Math.max(0, Math.floor((pageLimit - cursor - 28 - 27) / 27));
    const pagedTable = (cols, headers, allRows, totalRow, peachFirst = false, gapAfter = 44) => {
      let start = 0;
      if (!allRows.length) {
        if (maxRowsFit() < 1) header();
        cursor = table(cursor, cols, headers, [], totalRow, peachFirst) + gapAfter;
        return;
      }
      while (start < allRows.length) {
        let room = maxRowsFit();
        if (room < 1) { header(); room = Math.max(1, maxRowsFit()); }
        const chunk = allRows.slice(start, start + room);
        start += chunk.length;
        const last = start >= allRows.length;
        const footer = last ? totalRow : ["(cont.)", ...cols.slice(1).map(() => "")];
        cursor = table(cursor, cols, headers, chunk, footer, peachFirst) + (last ? gapAfter : 16);
        if (!last) header();
      }
    };
    for (const [employee, rows] of groups) {
      const tableRows = rows.map(row => [dayName(row.date), employee, timeLabel(row.timeIn), timeLabel(row.timeOut), `${row.lunch} MIN`, hoursLabel(row.hours)]);
      const employeeTotal = rows.reduce((sum, row) => sum + row.hours, 0);
      pagedTable(columns, ["DATE", "EMPLOYEE", "TIME IN", "TIME OUT", "LUNCH", "TOTAL HOURS"], tableRows, ["TOTAL", "", "", "", "", hoursLabel(employeeTotal)]);
    }
    const summaryRows = summary.map(row => [row.employee, hoursLabel(row.totalHours), row.rate == null ? "VARIES" : `${money(row.rate)}/HR`, money(row.pay)]);
    pagedTable([180, 130, 140, Math.max(70, width - 180 - 130 - 140)], ["EMPLOYEE", "TOTAL HOURS", "HOURLY RATE", "TOTAL PAY"], summaryRows, ["TOTAL", hoursLabel(totalHours), "", money(totalPay)], true, 57);
    text("Description:", left, cursor, 11, bold, ink);
    cursor += 22;
    wrap(data.description || "", regular, 10, width).forEach(lineText => {
      if (cursor + 16 > pageH - 42) { header(); text("Description:", left, cursor, 11, bold, ink); cursor += 22; }
      text(lineText, left, cursor, 10, regular, ink);
      cursor += 14;
    });
    doc.setTitle(pdfSafe(`Work hours - ${data.jobAddress || "Arrento Carpentry"}`));
    doc.setAuthor("Arrento Carpentry LLC");
    try {
      doc.setSubject(pdfSafe("TrentonControl/hours-v1:" + JSON.stringify({id: data.recordId || "", jobAddress: data.jobAddress || "", reportDate: data.reportDate || "", totalHours, totalPay})));
    } catch (_) { /* el asunto interno no debe tumbar el PDF */ }
    doc.setCreator("Trenton Control");
    return new Blob([await doc.save()], {type: "application/pdf"});
  }
  const api = {generate, hash, calcHours, fullDate, dayName, money, timeLabel};
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.HoursPDF = api;
})(typeof globalThis !== "undefined" ? globalThis : this);

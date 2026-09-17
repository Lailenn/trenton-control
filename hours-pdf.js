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
    const line = (x1, y1, x2, y2, thickness = 1, color = lineColor) => page.drawLine({start: {x: x1, y: pageH - y1}, end: {x: x2, y: pageH - y2}, thickness, color});
    const cell = (value, x, top, w, size = 10, font = regular, align = "left", color = ink) => {
      const label = pdfSafe(value);
      let used = size;
      let measured = measure(font, label, used);
      while (used > 6.5 && measured > Math.max(12, w - 10)) {
        used -= 0.4;
        measured = measure(font, label, used);
      }
      const px = align === "center" ? x + Math.max(2, (w - measured) / 2) : align === "right" ? x + w - measured - 5 : x + 5;
      text(label, px, top + 8, used, font, color);
    };
    const table = (top, columns, headers, rows, totalRow, bodyFirstColumnPeach = false) => {
      const rowHeight = 27, headerHeight = 28, totalHeight = 27, height = headerHeight + rows.length * rowHeight + totalHeight;
      page.drawRectangle({x: left, y: pageH - top - headerHeight, width, height: headerHeight, color: peach});
      page.drawRectangle({x: left, y: pageH - top - height, width, height: totalHeight, color: peach});
      if (bodyFirstColumnPeach) {
        rows.forEach((_, rowIndex) => {
          page.drawRectangle({
            x: left,
            y: pageH - top - headerHeight - (rowIndex + 1) * rowHeight,
            width: columns[0],
            height: rowHeight,
            color: peach
          });
        });
      }
      const horizontals = [top, top + headerHeight];
      for (let i = 1; i <= rows.length; i++) horizontals.push(top + headerHeight + i * rowHeight);
      horizontals.push(top + height);
      horizontals.forEach(y => line(left, y, left + width, y));
      let x = left;
      columns.forEach(w => { line(x, top, x, top + height); x += w; });
      line(left + width, top, left + width, top + height);
      x = left;
      headers.forEach((header, i) => { cell(header, x, top, columns[i], 9.6, bold, "left", ink); x += columns[i]; });
      rows.forEach((row, rowIndex) => {
        x = left;
        row.forEach((value, i) => { cell(value, x, top + headerHeight + rowIndex * rowHeight, columns[i], 9.5, i === 0 ? bold : regular, "left", ink); x += columns[i]; });
      });
      x = left;
      totalRow.forEach((value, i) => { cell(value, x, top + height - totalHeight, columns[i], 9.5, bold, "left", ink); x += columns[i]; });
      return top + height;
    };
    const header = () => {
      newPage();
      if (logo && logo.width > 1 && logo.height > 1) {
        const factor = Math.min(220 / logo.width, 70 / logo.height);
        if (Number.isFinite(factor) && factor > 0) {
          page.drawImage(logo, {x: (pageW - logo.width * factor) / 2, y: pageH - 48 - logo.height * factor, width: logo.width * factor, height: logo.height * factor});
        }
      }
      const jobLabel = "JOB:"; const address = pdfSafe(data.jobAddress || ""); const jobSize = 13; const jobWidth = measure(bold, jobLabel, jobSize) + 8 + measure(bold, address, jobSize); const jobX = (pageW - jobWidth) / 2;
      text(jobLabel, jobX, 137, jobSize, bold, ink); text(address, jobX + measure(bold, jobLabel, jobSize) + 8, 137, jobSize, bold, ink); line(jobX + measure(bold, jobLabel, jobSize) + 8, 154, jobX + jobWidth, 154, 1, ink);
      text(fullDate(data.reportDate), left, 169, 13, bold, ink);
      cursor = 205;
    };
    header();
    const columns = [90, 112, 66, 66, 54, 140];
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
    doc.getPages().forEach(sheet => sheet.drawRectangle({x: 0, y: 0, width: pageW, height: 10, color: copper}));
    doc.setTitle(pdfSafe(`Work hours - ${data.jobAddress || "Arrento Carpentry"}`));
    doc.setAuthor("Arrento Carpentry LLC");
    try {
      doc.setSubject(pdfSafe(hoursSubject(data, totalHours, totalPay, entries)));
    } catch (_) { /* el asunto interno no debe tumbar el PDF */ }
    doc.setCreator("Trenton Control");
    return new Blob([await doc.save()], {type: "application/pdf"});
  }

  const MONTHS = {january:0,february:1,march:2,april:3,may:4,june:5,july:6,august:7,september:8,october:9,november:10,december:11,
    enero:0,febrero:1,marzo:2,abril:3,mayo:4,junio:5,julio:6,agosto:7,septiembre:8,octubre:9,noviembre:10,diciembre:11};
  const DAYS = "Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|Lunes|Martes|Miércoles|Miercoles|Jueves|Viernes|Sábado|Sabado|Domingo";
  let reader;

  function hoursSubject(data, totalHours, totalPay, entries) {
    const payload = {
      id: data.recordId || "",
      jobAddress: data.jobAddress || "",
      reportDate: data.reportDate || "",
      totalHours,
      totalPay,
      description: String(data.description || "").slice(0, 240),
      defaultRate: Number(data.defaultRate) || 0,
      entries: (entries || []).slice(0, 24).map(entry => ({
        date: entry.date, employee: entry.employee, timeIn: entry.timeIn, timeOut: entry.timeOut,
        lunch: entry.lunch, rate: entry.rate, hours: entry.hours
      }))
    };
    let raw = "TrentonControl/hours-v1:" + JSON.stringify(payload);
    while (raw.length > 1800 && payload.entries.length) {
      payload.entries.pop();
      raw = "TrentonControl/hours-v1:" + JSON.stringify(payload);
    }
    return raw;
  }

  function to24(time, ampm) {
    const match = String(time || "").trim().match(/^(\d{1,2}):(\d{2})$/);
    if (!match) return "";
    let hour = Number(match[1]);
    const minute = match[2];
    const flag = String(ampm || "").toLowerCase();
    if (flag.startsWith("p") && hour < 12) hour += 12;
    if (flag.startsWith("a") && hour === 12) hour = 0;
    if (hour > 23) return "";
    return `${String(hour).padStart(2, "0")}:${minute}`;
  }

  function parseEnglishDate(value) {
    const text = String(value || "").replace(/\s+/g, " ").trim();
    const iso = text.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
    const us = text.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (us) return `${us[3]}-${String(us[1]).padStart(2, "0")}-${String(us[2]).padStart(2, "0")}`;
    const named = text.match(/(january|february|march|april|may|june|july|august|september|october|november|december|enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\s+(\d{1,2}),?\s+(\d{4})/i);
    if (!named) return "";
    const month = MONTHS[named[1].toLowerCase()];
    if (month == null) return "";
    return `${named[3]}-${String(month + 1).padStart(2, "0")}-${String(Number(named[2])).padStart(2, "0")}`;
  }

  function numberValue(value) {
    const n = Number(String(value || "").replace(/,/g, ""));
    return Number.isFinite(n) ? n : null;
  }

  function applyHoursMeta(subject, fields, entries, warnings) {
    if (!subject || typeof subject !== "string") return "";
    if (!subject.startsWith("TrentonControl/hours-v1:")) return "";
    try {
      const saved = JSON.parse(subject.slice("TrentonControl/hours-v1:".length));
      if (typeof saved.jobAddress === "string" && saved.jobAddress) fields.jobAddress = saved.jobAddress.slice(0, 500);
      if (typeof saved.a === "string" && saved.a) fields.jobAddress = saved.a.slice(0, 500);
      if (saved.reportDate) fields.reportDate = parseEnglishDate(saved.reportDate) || fields.reportDate;
      if (saved.d) fields.reportDate = parseEnglishDate(saved.d) || fields.reportDate;
      if (typeof saved.description === "string") fields.description = saved.description.slice(0, 8000);
      if (typeof saved.n === "string") fields.description = saved.n.slice(0, 8000);
      if (numberValue(saved.defaultRate) != null) fields.defaultRate = numberValue(saved.defaultRate);
      if (numberValue(saved.r) != null) fields.defaultRate = numberValue(saved.r);
      const listed = Array.isArray(saved.entries) ? saved.entries : Array.isArray(saved.e) ? saved.e : [];
      listed.forEach(item => {
        const row = Array.isArray(item)
          ? {date: item[0], employee: item[1], timeIn: item[2], timeOut: item[3], lunch: item[4], rate: item[5], hours: item[6]}
          : item;
        if (!row?.employee) return;
        entries.push({
          date: parseEnglishDate(row.date) || fields.reportDate || "",
          employee: String(row.employee).slice(0, 120),
          timeIn: to24(row.timeIn || row.i, "") || String(row.timeIn || "").slice(0, 5),
          timeOut: to24(row.timeOut || row.o, "") || String(row.timeOut || "").slice(0, 5),
          lunch: Number(row.lunch ?? row.l) || 0,
          rate: Number(row.rate ?? row.r) || fields.defaultRate || 0,
          hoursOverride: numberValue(row.hours ?? row.h),
          hours: Number(row.hours ?? row.h) || 0
        });
      });
      return typeof saved.id === "string" ? saved.id.slice(0, 100) : "";
    } catch (_) {
      warnings.push("Los datos internos del PDF no se pudieron leer; se usa el texto impreso.");
      return "";
    }
  }

  function parseHoursPdfText(text) {
    const fields = { jobAddress: "", reportDate: "", description: "", defaultRate: null };
    const entries = [];
    const warnings = [];
    const lines = String(text || "").split(/\r?\n/).map(line => line.replace(/\s+/g, " ").trim()).filter(Boolean);
    const blob = lines.join("\n");
    const jobLine = lines.find(line => /^JOB\s*:/i.test(line));
    if (jobLine) fields.jobAddress = jobLine.replace(/^JOB\s*:/i, "").trim().slice(0, 500);
    const dateLine = lines.find(line => parseEnglishDate(line));
    if (dateLine) fields.reportDate = parseEnglishDate(dateLine);
    const rateMatch = blob.match(/\$?\s*(\d+(?:\.\d+)?)\s*\/\s*HRS?/i);
    if (rateMatch) fields.defaultRate = Number(rateMatch[1]);
    const descIndex = lines.findIndex(line => /^description\s*:?\s*$/i.test(line) || /^description\s*:/i.test(line));
    if (descIndex >= 0) {
      const same = lines[descIndex].replace(/^description\s*:?\s*/i, "").trim();
      const rest = lines.slice(descIndex + 1).filter(line => !/^(EMPLOYEE|TOTAL|DATE|JOB)\b/i.test(line));
      fields.description = [same, ...rest].filter(Boolean).join("\n").slice(0, 8000);
    }
    const rowRe = new RegExp(
      `(?:${DAYS})\\s+(.+?)\\s+(\\d{1,2}:\\d{2})(?:\\s*([AaPp][Mm]))?\\s+(\\d{1,2}:\\d{2})(?:\\s*([AaPp][Mm]))?\\s+(\\d+)\\s*MIN\\s+([\\d.,]+)\\s*HRS`,
      "gi"
    );
    let match;
    while ((match = rowRe.exec(blob))) {
      const employee = match[1].replace(/\s+/g, " ").trim();
      if (!employee || /^(DATE|EMPLOYEE|TOTAL|HOURLY|RATE)$/i.test(employee)) continue;
      const hours = numberValue(match[7]) || 0;
      entries.push({
        date: fields.reportDate,
        employee: employee.slice(0, 120),
        timeIn: to24(match[2], match[3]),
        timeOut: to24(match[4], match[5]),
        lunch: Number(match[6]) || 0,
        rate: fields.defaultRate || 0,
        hoursOverride: hours,
        hours
      });
    }
    if (!entries.length) {
      const loose = /([A-ZÁÉÍÓÚÑ][\p{L}'.-]+(?:\s+[A-ZÁÉÍÓÚÑ][\p{L}'.-]+)+)\s+(\d{1,2}:\d{2})(?:\s*([AaPp][Mm]))?\s+(\d{1,2}:\d{2})(?:\s*([AaPp][Mm]))?\s+(\d+)\s*MIN\s+([\d.,]+)\s*HRS/gu;
      while ((match = loose.exec(blob))) {
        const employee = match[1].replace(/\s+/g, " ").trim();
        if (/^(DATE|EMPLOYEE|TOTAL HOURS|HOURLY RATE|TOTAL PAY)$/i.test(employee)) continue;
        const hours = numberValue(match[7]) || 0;
        entries.push({
          date: fields.reportDate,
          employee: employee.slice(0, 120),
          timeIn: to24(match[2], match[3]),
          timeOut: to24(match[4], match[5]),
          lunch: Number(match[6]) || 0,
          rate: fields.defaultRate || 0,
          hoursOverride: hours,
          hours
        });
      }
    }
    const summaryRe = /([A-ZÁÉÍÓÚÑ][\p{L}'.-]+(?:\s+[A-ZÁÉÍÓÚÑ][\p{L}'.-]+)+)\s+[\d.,]+\s*HRS\s+\$?\s*([\d.,]+)\s*\/?\s*HRS?/giu;
    const rates = new Map();
    while ((match = summaryRe.exec(blob))) {
      const employee = match[1].replace(/\s+/g, " ").trim();
      const rate = numberValue(match[2]);
      if (employee && rate != null) rates.set(employee.toLowerCase(), rate);
    }
    entries.forEach(entry => {
      const rate = rates.get(entry.employee.toLowerCase());
      if (rate != null) entry.rate = rate;
    });
    if (rates.size === 1 && fields.defaultRate == null) fields.defaultRate = [...rates.values()][0];
    if (!fields.jobAddress) warnings.push("No se leyó la dirección. Complétala.");
    if (!fields.reportDate) warnings.push("No se leyó la fecha. Complétala.");
    if (!entries.length) warnings.push("No se leyeron empleados. Si el PDF es una imagen, llena el formulario a mano y guarda.");
    return { fields, entries, warnings };
  }

  function appRoot() {
    const scripts = document.getElementsByTagName("script");
    for (const script of scripts) {
      const src = script.src || "";
      if (/hours-pdf\.js/i.test(src)) return src.replace(/[^/]+(?:\?.*)?$/, "");
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
  async function extractPdfText(file) {
    const root = appRoot();
    if (!reader) reader = import(root + "vendor/pdf.min.mjs");
    const pdfjs = await reader;
    pdfjs.GlobalWorkerOptions.workerSrc = root + "vendor/pdf.worker.min.mjs";
    const bytes = new Uint8Array(await file.arrayBuffer());
    const task = pdfjs.getDocument({data: bytes, isEvalSupported: false, useWasm: false, disableFontFace: true, standardFontDataUrl: root + "vendor/standard_fonts/"});
    try {
      const doc = await withTimeout(task.promise, 18000, "El PDF de horas tardó demasiado en abrirse.");
      if (doc.numPages > 40) throw new Error("Este PDF de horas supera las 40 páginas.");
      let text = "";
      let subject = "";
      try {
        const metadata = await doc.getMetadata();
        subject = metadata.info?.Subject || "";
      } catch (_) { /* sin metadatos */ }
      for (let n = 1; n <= doc.numPages; n++) {
        const page = await doc.getPage(n);
        const {items} = await page.getTextContent();
        const rows = [];
        for (const item of items.filter(part => part.str)) {
          const y = item.transform[5];
          let row = rows.find(line => Math.abs(line.y - y) < 3);
          if (!row) { row = {y, items: []}; rows.push(row); }
          row.items.push(item);
        }
        text += rows.sort((a, b) => b.y - a.y).map(row => row.items.sort((a, b) => a.transform[4] - b.transform[4]).map(part => part.str).join(" ")).join("\n") + "\n";
      }
      return { text, subject };
    } finally {
      await task.destroy();
    }
  }

  async function read(file) {
    if (!file) throw new Error("Selecciona un PDF de horas.");
    const pdfHash = await hash(file);
    const extracted = { fields: { jobAddress: "", reportDate: "", description: "", defaultRate: null }, entries: [], warnings: [], text: "", pdfHash, sourceId: "" };
    try {
      const { text, subject } = await extractPdfText(file);
      extracted.text = text;
      const parsed = parseHoursPdfText(text);
      extracted.fields = parsed.fields;
      extracted.warnings = parsed.warnings;
      extracted.entries = [];
      extracted.sourceId = applyHoursMeta(subject, extracted.fields, extracted.entries, extracted.warnings);
      if (!extracted.entries.length) extracted.entries = parsed.entries;
      if (extracted.entries.length > 1) {
        const seen = new Set();
        extracted.entries = extracted.entries.filter(entry => {
          const key = `${entry.employee}|${entry.timeIn}|${entry.timeOut}|${entry.hours}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
      }
      if (String(text || "").trim().length < 10) extracted.warnings.unshift("El PDF es una imagen o no tiene texto. Si completas dirección y fecha, igual se guarda el archivo original.");
    } catch (error) {
      extracted.warnings.push(error.message || "No se pudo leer el texto del PDF.");
    }
    if (!extracted.fields.jobAddress && file?.name) extracted.fields.jobAddress = guessAddressFromName(file.name);
    return extracted;
  }

  function guessAddressFromName(name) {
    return String(name || "")
      .replace(/\.pdf$/i, "")
      .replace(/[_]+/g, " ")
      .replace(/,/g, ", ")
      .replace(/(\d)(th|st|nd|rd)(?=[A-Z])/gi, "$1$2 ")
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .replace(/\bDC(\d)/i, "DC $1")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 500);
  }

  const api = {generate, hash, calcHours, fullDate, dayName, money, timeLabel, read, parseEnglishDate};
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.HoursPDF = api;
})(typeof globalThis !== "undefined" ? globalThis : this);

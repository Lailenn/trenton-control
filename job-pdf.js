/* Job report PDF: several days, description column, day totals and grand total. */
(function (root) {
  "use strict";
  const lib = () => root.PDFLib || (typeof require === "function" ? require("pdf-lib") : null);
  const WIN = {0x20AC:1, 0x201A:1, 0x192:1, 0x201E:1, 0x2026:1, 0x2020:1, 0x2021:1, 0x2C6:1, 0x2030:1, 0x160:1, 0x2039:1, 0x152:1, 0x17D:1, 0x2018:1, 0x2019:1, 0x201C:1, 0x201D:1, 0x2022:1, 0x2013:1, 0x2014:1, 0x2DC:1, 0x2122:1, 0x161:1, 0x203A:1, 0x153:1, 0x17E:1, 0x178:1};
  const SWAP = {"\u00a0":" ","\u202f":" ","\u2009":" ","\u2011":"-","\u2013":"-","\u2014":"-","\u2015":"-","\u2018":"'","\u2019":"'","\u201c":'"',"\u201d":'"',"\u2026":"...","\u2022":"-","\u00b7":"-","\u2212":"-","\u00d7":"x","\u00f7":"/","¿":"?","¡":"!"};
  const DAYS = "Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|Lunes|Martes|Miércoles|Miercoles|Jueves|Viernes|Sábado|Sabado|Domingo";
  const MONTHS = {january:0,february:1,march:2,april:3,may:4,june:5,july:6,august:7,september:8,october:9,november:10,december:11,
    enero:0,febrero:1,marzo:2,abril:3,mayo:4,junio:5,julio:6,agosto:7,septiembre:8,octubre:9,noviembre:10,diciembre:11};
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
    return `$${number.toLocaleString("en-US", {minimumFractionDigits: decimals, maximumFractionDigits: decimals})}`;
  };
  const hasClock = value => /^\d{1,2}:\d{2}$/.test(String(value || "").trim());
  const timeLabel12 = value => {
    const match = String(value || "").trim().match(/^(\d{1,2}):(\d{2})$/);
    if (!match) return "—";
    let hour = Number(match[1]);
    const minute = match[2];
    const ampm = hour >= 12 ? "PM" : "AM";
    hour = hour % 12 || 12;
    return `${hour}:${minute} ${ampm}`;
  };
  const lunchLabel = (entry, hours) => {
    if (!hasClock(entry.timeIn) && !hasClock(entry.timeOut) && !(Number(entry.lunch) > 0)) return "—";
    return `${Math.max(0, Number(entry.lunch) || 0)} MIN`;
  };
  const calcHours = entry => {
    const manual = entry && (entry.hoursOverride ?? entry.manualHours);
    if (manual !== "" && manual != null && Number.isFinite(Number(manual)) && Number(manual) >= 0) return Number(manual);
    if (Number.isFinite(Number(entry?.hours)) && Number(entry.hours) >= 0 && entry.hours !== "" && !hasClock(entry.timeIn) && !hasClock(entry.timeOut)) return Number(entry.hours);
    const start = String(entry.timeIn || "").split(":").map(Number), end = String(entry.timeOut || "").split(":").map(Number);
    if (start.length !== 2 || end.length !== 2 || start.some(Number.isNaN) || end.some(Number.isNaN)) return 0;
    let minutes = end[0] * 60 + end[1] - (start[0] * 60 + start[1]);
    if (minutes < 0) minutes += 24 * 60;
    return Math.max(0, (minutes - Math.max(0, Number(entry.lunch) || 0)) / 60);
  };
  const rangeLabel = dates => {
    const sorted = [...new Set((dates || []).filter(Boolean))].sort();
    if (!sorted.length) return "";
    const first = dateValue(sorted[0]), last = dateValue(sorted[sorted.length - 1]);
    if (!first || !last) return pdfSafe(sorted[0]);
    if (sorted[0] === sorted[sorted.length - 1]) return pdfSafe(first.toLocaleDateString("en-US", {month: "long", day: "numeric", year: "numeric"}));
    if (first.getMonth() === last.getMonth() && first.getFullYear() === last.getFullYear()) {
      return pdfSafe(`${first.toLocaleDateString("en-US", {month: "long"})} ${first.getDate()}-${last.getDate()}, ${first.getFullYear()}`);
    }
    return pdfSafe(`${first.toLocaleDateString("en-US", {month: "long", day: "numeric"})}-${last.toLocaleDateString("en-US", {month: "long", day: "numeric", year: "numeric"})}`);
  };
  function payRows(list) {
    const map = new Map();
    list.forEach(row => {
      const key = row.employee;
      const cur = map.get(key) || {employee: key, hours: 0, pay: 0, rates: []};
      cur.hours += row.hours;
      cur.pay += row.hours * row.rate;
      if (!cur.rates.includes(row.rate)) cur.rates.push(row.rate);
      map.set(key, cur);
    });
    return [...map.values()].map(row => ({
      employee: row.employee,
      hours: row.hours,
      rate: row.rates.length === 1 ? row.rates[0] : null,
      pay: row.pay
    }));
  }
  function normalizeEntries(data) {
    return (Array.isArray(data.entries) ? data.entries : []).map(entry => ({
      date: entry.date || "",
      employee: String(entry.employee || "").trim(),
      description: String(entry.description || "").trim(),
      timeIn: hasClock(entry.timeIn) ? entry.timeIn : "",
      timeOut: hasClock(entry.timeOut) ? entry.timeOut : "",
      lunch: Math.max(0, Number(entry.lunch) || 0),
      hours: calcHours(entry),
      rate: Math.max(0, Number(entry.rate ?? data.defaultRate) || 0)
    })).filter(entry => entry.employee);
  }
  function groupByDate(entries) {
    const groups = new Map();
    entries.forEach(entry => {
      const key = entry.date || "";
      const list = groups.get(key) || [];
      list.push(entry);
      groups.set(key, list);
    });
    return [...groups.entries()].sort((a, b) => String(a[0]).localeCompare(String(b[0])));
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
      console.warn("No se pudo incrustar el logo", error);
      return null;
    }
  }

  async function generate(data, logoBytes) {
    const pdfLib = lib();
    if (!pdfLib) throw new Error("No se cargó el generador de PDF. Recarga la página.");
    const {PDFDocument, StandardFonts, rgb} = pdfLib;
    const doc = await PDFDocument.create();
    const pageW = 841.89, pageH = 1190.55, left = 48, width = pageW - left * 2;
    const regular = await doc.embedFont(StandardFonts.Helvetica);
    const bold = await doc.embedFont(StandardFonts.HelveticaBold);
    const logo = await embedLogo(doc, logoBytes);
    const entries = normalizeEntries(data);
    const days = groupByDate(entries);
    const grand = payRows(entries);
    const totalHours = grand.reduce((sum, row) => sum + row.hours, 0);
    const totalPay = grand.reduce((sum, row) => sum + row.pay, 0);
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
    const applyA3 = sheet => {
      if (typeof sheet.setSize === "function") sheet.setSize(pageW, pageH);
      if (typeof sheet.setMediaBox === "function") sheet.setMediaBox(0, 0, pageW, pageH);
      if (typeof sheet.setCropBox === "function") sheet.setCropBox(0, 0, pageW, pageH);
      if (typeof sheet.setBleedBox === "function") sheet.setBleedBox(0, 0, pageW, pageH);
      if (typeof sheet.setTrimBox === "function") sheet.setTrimBox(0, 0, pageW, pageH);
    };
    const newPage = () => {
      page = doc.addPage([pageW, pageH]);
      applyA3(page);
      cursor = 44;
    };
    const text = (value, x, top, size = 10, font = regular, color = ink) => {
      const label = pdfSafe(value);
      try { page.drawText(label, {x, y: pageH - top - size, size, font, color}); }
      catch (_) {
        try { page.drawText(label.replace(/[^\x20-\x7e\n]/g, " "), {x, y: pageH - top - size, size, font, color}); }
        catch (__) { /* ignore glyph */ }
      }
    };
    const line = (x1, y1, x2, y2, thickness = 1, color = lineColor) => page.drawLine({start: {x: x1, y: pageH - y1}, end: {x: x2, y: pageH - y2}, thickness, color});
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
    const cellLines = (value, w, size, font) => wrap(String(value ?? ""), font, size, Math.max(14, w - 8));
    const drawLines = (lines, x, top, w, size, font, color = ink) => {
      let y = top + 5;
      lines.forEach(lineText => {
        text(lineText, x + 4, y, size, font, color);
        y += size + 3;
      });
    };
    const measureBlock = (columns, headers, rows, totalRow) => {
      const headerSize = 10, bodySize = 10.5, pad = 12;
      const headerLines = headers.map((header, i) => cellLines(header, columns[i], headerSize, bold));
      const headerHeight = Math.max(22, Math.max(...headerLines.map(lines => lines.length)) * (headerSize + 3) + pad);
      const rowLineSets = rows.map(row => row.map((value, i) => cellLines(value, columns[i], bodySize, i === 0 ? bold : regular)));
      const rowHeights = rowLineSets.map(set => Math.max(20, Math.max(...set.map(lines => lines.length)) * (bodySize + 3) + pad));
      const totalLines = totalRow.map((value, i) => cellLines(value, columns[i], headerSize, bold));
      const totalHeight = Math.max(20, Math.max(...totalLines.map(lines => lines.length)) * (headerSize + 3) + pad);
      const height = headerHeight + rowHeights.reduce((sum, value) => sum + value, 0) + totalHeight;
      return { headerSize, bodySize, headerLines, headerHeight, rowLineSets, rowHeights, totalLines, totalHeight, height };
    };
    const table = (top, columns, headers, rows, totalRow, peachFirst = false) => {
      const block = measureBlock(columns, headers, rows, totalRow);
      const { headerSize, bodySize, headerLines, headerHeight, rowLineSets, rowHeights, totalLines, totalHeight, height } = block;
      page.drawRectangle({x: left, y: pageH - top - headerHeight, width, height: headerHeight, color: peach});
      page.drawRectangle({x: left, y: pageH - top - height, width, height: totalHeight, color: peach});
      if (peachFirst) {
        let y = top + headerHeight;
        rowHeights.forEach(rowHeight => {
          page.drawRectangle({ x: left, y: pageH - y - rowHeight, width: columns[0], height: rowHeight, color: peach });
          y += rowHeight;
        });
      }
      const horizontals = [top, top + headerHeight];
      let acc = top + headerHeight;
      rowHeights.forEach(rowHeight => { acc += rowHeight; horizontals.push(acc); });
      horizontals.push(top + height);
      horizontals.forEach(y => line(left, y, left + width, y));
      let x = left;
      columns.forEach(w => { line(x, top, x, top + height); x += w; });
      line(left + width, top, left + width, top + height);
      x = left;
      headerLines.forEach((lines, i) => { drawLines(lines, x, top, columns[i], headerSize, bold); x += columns[i]; });
      let rowTop = top + headerHeight;
      rowLineSets.forEach((set, rowIndex) => {
        x = left;
        set.forEach((lines, i) => { drawLines(lines, x, rowTop, columns[i], bodySize, i === 0 ? bold : regular); x += columns[i]; });
        rowTop += rowHeights[rowIndex];
      });
      x = left;
      totalLines.forEach((lines, i) => { drawLines(lines, x, top + height - totalHeight, columns[i], headerSize, bold); x += columns[i]; });
      return top + height;
    };
    const header = () => {
      newPage();
      if (logo && logo.width > 1 && logo.height > 1) {
        const factor = Math.min(320 / logo.width, 96 / logo.height);
        if (Number.isFinite(factor) && factor > 0) {
          page.drawImage(logo, {x: (pageW - logo.width * factor) / 2, y: pageH - 52 - logo.height * factor, width: logo.width * factor, height: logo.height * factor});
        }
      }
      const jobLabel = "JOB:"; const address = pdfSafe(data.jobAddress || ""); const jobSize = 16;
      const jobWidth = measure(bold, jobLabel, jobSize) + 8 + measure(bold, address, jobSize); const jobX = (pageW - jobWidth) / 2;
      text(jobLabel, jobX, 168, jobSize, bold, ink);
      text(address, jobX + measure(bold, jobLabel, jobSize) + 8, 168, jobSize, bold, ink);
      line(jobX + measure(bold, jobLabel, jobSize) + 8, 186, jobX + jobWidth, 186, 1, ink);
      cursor = 214;
    };
    const pageLimit = pageH - 90;
    const need = height => {
      if (cursor + height > pageLimit) header();
    };
    header();
    const workCols = [90, 150, 210, 82, 82, 60, Math.max(72, width - 90 - 150 - 210 - 82 - 82 - 60)];
    const payCols = [230, 150, 170, Math.max(90, width - 230 - 150 - 170)];
    const workHeaders = ["DATE", "EMPLOYEE", "DESCRIPTION", "TIME IN", "TIME OUT", "LUNCH", "TOTAL HOURS"];
    const payHeaders = ["EMPLOYEE", "TOTAL HOURS", "HOURLY RATE", "TOTAL PAY"];
    const drawPay = rows => {
      const summary = payRows(rows);
      const hours = summary.reduce((sum, row) => sum + row.hours, 0);
      const pay = summary.reduce((sum, row) => sum + row.pay, 0);
      const tableRows = summary.map(row => [row.employee, hoursLabel(row.hours), row.rate == null ? "VARIES" : `${money(row.rate)}/HR`, money(row.pay)]);
      const footer = ["TOTAL", hoursLabel(hours), "", money(pay)];
      const block = measureBlock(payCols, payHeaders, tableRows, footer);
      need(block.height + 8);
      cursor = table(cursor, payCols, payHeaders, tableRows, footer, true) + 20;
    };
    for (const [date, rows] of days) {
      const tableRows = rows.map(row => [
        dayName(row.date),
        row.employee,
        row.description || "—",
        timeLabel12(row.timeIn),
        timeLabel12(row.timeOut),
        lunchLabel(row),
        hoursLabel(row.hours)
      ]);
      const dayHours = rows.reduce((sum, row) => sum + row.hours, 0);
      const footer = ["TOTAL", "", "", "", "", "", hoursLabel(dayHours)];
      need(42 + measureBlock(workCols, workHeaders, tableRows.slice(0, 1), footer).height);
      text(fullDate(date), left, cursor, 14, bold, ink);
      cursor += 26;
      let start = 0;
      while (start < tableRows.length) {
        let take = 0, used = 0;
        while (start + take < tableRows.length) {
          const next = measureBlock(workCols, workHeaders, tableRows.slice(start, start + take + 1), footer);
          if (take && cursor + next.height > pageLimit) break;
          used = next.height;
          take += 1;
          if (cursor + used > pageLimit && take === 1) break;
        }
        take = Math.max(1, take);
        const chunk = tableRows.slice(start, start + take);
        start += chunk.length;
        const last = start >= tableRows.length;
        cursor = table(cursor, workCols, workHeaders, chunk, last ? footer : ["(cont.)", "", "", "", "", "", ""]) + (last ? 16 : 10);
        if (!last) {
          header();
          text(fullDate(date), left, cursor, 14, bold, ink);
          cursor += 26;
        }
      }
      drawPay(rows);
    }
    need(40 + 25 + Math.max(1, grand.length) * 24 + 24);
    text(`GRAND TOTAL - ${rangeLabel(entries.map(row => row.date))}`, left, cursor, 15, bold, ink);
    cursor += 30;
    drawPay(entries);
    doc.getPages().forEach(sheet => {
      applyA3(sheet);
      sheet.drawRectangle({x: 0, y: 0, width: pageW, height: 12, color: copper});
    });
    doc.setTitle(pdfSafe(`Job report A3 - ${data.jobAddress || "Arrento Carpentry"}`));
    doc.setAuthor("Arrento Carpentry LLC");
    try {
      const payload = {
        id: data.recordId || "",
        jobAddress: data.jobAddress || "",
        defaultRate: Number(data.defaultRate) || 0,
        entries: entries.slice(0, 40).map(entry => ({
          date: entry.date, employee: entry.employee, description: entry.description,
          timeIn: entry.timeIn, timeOut: entry.timeOut, lunch: entry.lunch, rate: entry.rate, hours: entry.hours
        }))
      };
      let raw = "TrentonControl/job-v1:" + JSON.stringify(payload);
      while (raw.length > 1800 && payload.entries.length) {
        payload.entries.pop();
        raw = "TrentonControl/job-v1:" + JSON.stringify(payload);
      }
      doc.setSubject(pdfSafe(raw));
    } catch (_) { /* subject is optional */ }
    doc.setCreator("Trenton Control");
    return new Blob([await doc.save({useObjectStreams: false})], {type: "application/pdf"});
  }

  function to24(time, ampm) {
    const match = String(time || "").trim().match(/^(\d{1,2}):(\d{2})$/);
    if (!match) return "";
    let hour = Number(match[1]);
    const minute = match[2];
    const flag = String(ampm || "").toLowerCase();
    if (flag.startsWith("p") && hour < 12) hour += 12;
    if (flag.startsWith("a") && hour === 12) hour = 0;
    if (!flag && hour <= 23) return `${String(hour).padStart(2, "0")}:${minute}`;
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
  function blankClock(value) {
    return !value || /^[—–\-]+$/.test(String(value).trim());
  }
  function parseWorkLine(line, currentDate) {
    const dayMatch = line.match(new RegExp(`^(${DAYS})\\s+(.+)$`, "i"));
    if (!dayMatch) return null;
    let rest = dayMatch[2].trim();
    const hoursMatch = rest.match(/([\d.,]+)\s*HRS\s*$/i);
    if (!hoursMatch) return null;
    const hours = numberValue(hoursMatch[1]);
    rest = rest.slice(0, -hoursMatch[0].length).trim();
    let lunch = 0;
    const lunchMatch = rest.match(/(\d+)\s*MIN\s*$/i);
    if (lunchMatch) {
      lunch = Number(lunchMatch[1]) || 0;
      rest = rest.slice(0, -lunchMatch[0].length).trim();
    } else if (/[—–\-]\s*$/.test(rest)) {
      rest = rest.replace(/[—–\-]\s*$/, "").trim();
    }
    const takeTime = () => {
      const clock = rest.match(/(\d{1,2}:\d{2})\s*([AaPp][Mm])?\s*$/);
      if (clock) {
        rest = rest.slice(0, -clock[0].length).trim();
        return to24(clock[1], clock[2]);
      }
      if (/[—–\-]\s*$/.test(rest)) {
        rest = rest.replace(/[—–\-]\s*$/, "").trim();
        return "";
      }
      return "";
    };
    const timeOut = takeTime();
    const timeIn = takeTime();
    rest = rest.replace(/\s+/g, " ").trim();
    if (!rest) return null;
    const bits = rest.split(" ");
    let employee = bits[0];
    let description = bits.slice(1).join(" ");
    if (bits.length >= 2 && /^[\p{L}'.-]+$/u.test(bits[1]) && bits[1][0] === bits[1][0].toUpperCase()) {
      employee = `${bits[0]} ${bits[1]}`;
      description = bits.slice(2).join(" ");
    }
    return {
      date: currentDate || "",
      employee: employee.slice(0, 120),
      description: description.slice(0, 240),
      timeIn, timeOut, lunch,
      hoursOverride: hours,
      hours,
      rate: 0
    };
  }
  function parseJobText(text, fallbackDate = "") {
    const fields = { jobAddress: "", defaultRate: null };
    const entries = [];
    const warnings = [];
    const lines = String(text || "").split(/\r?\n/).map(line => line.replace(/\s+/g, " ").trim()).filter(Boolean);
    const blob = lines.join("\n");
    const jobLine = lines.find(line => /^JOB\s*:/i.test(line));
    if (jobLine) fields.jobAddress = jobLine.replace(/^JOB\s*:/i, "").trim().slice(0, 500);
    let currentDate = fallbackDate || "";
    lines.forEach(line => {
      if (/^GRAND TOTAL/i.test(line) || /^(DATE|EMPLOYEE|TOTAL HOURS|HOURLY RATE)\b/i.test(line)) return;
      const dated = parseEnglishDate(line);
      if (dated && new RegExp(`^(${DAYS})[,\\s]`, "i").test(line)) {
        currentDate = dated;
        return;
      }
      const row = parseWorkLine(line, currentDate);
      if (row) entries.push(row);
    });
    const rateMatch = blob.match(/\$?\s*(\d+(?:\.\d+)?)\s*\/\s*HR/i);
    if (rateMatch) fields.defaultRate = Number(rateMatch[1]);
    const summaryRe = /([A-ZÁÉÍÓÚÑ][\p{L}'.-]+(?:\s+[A-ZÁÉÍÓÚÑ][\p{L}'.-]+)?)\s+[\d.,]+\s*HRS\s+\$?\s*([\d.,]+)\s*\/\s*HR/giu;
    const rates = new Map();
    let match;
    while ((match = summaryRe.exec(blob))) {
      const employee = match[1].replace(/\s+/g, " ").trim();
      const rate = numberValue(match[2]);
      if (employee && rate != null && !/^(TOTAL|EMPLOYEE)$/i.test(employee)) rates.set(employee.toLowerCase(), rate);
    }
    entries.forEach(entry => {
      const rate = rates.get(entry.employee.toLowerCase());
      if (rate != null) entry.rate = rate;
      else if (fields.defaultRate != null) entry.rate = fields.defaultRate;
    });
    if (rates.size === 1 && fields.defaultRate == null) fields.defaultRate = [...rates.values()][0];
    if (!fields.jobAddress) warnings.push("No se leyó la dirección. Complétala.");
    if (!entries.length) warnings.push("No se leyeron registros. Completa el formulario o pega el texto del PDF.");
    return { fields, entries, warnings };
  }
  function applyJobMeta(subject, fields, entries, warnings) {
    if (!subject || typeof subject !== "string" || !subject.startsWith("TrentonControl/job-v1:")) return "";
    try {
      const saved = JSON.parse(subject.slice("TrentonControl/job-v1:".length));
      if (typeof saved.jobAddress === "string" && saved.jobAddress) fields.jobAddress = saved.jobAddress.slice(0, 500);
      if (numberValue(saved.defaultRate) != null) fields.defaultRate = numberValue(saved.defaultRate);
      (Array.isArray(saved.entries) ? saved.entries : []).forEach(row => {
        if (!row?.employee) return;
        entries.push({
          date: parseEnglishDate(row.date) || row.date || "",
          employee: String(row.employee).slice(0, 120),
          description: String(row.description || "").slice(0, 240),
          timeIn: to24(row.timeIn, "") || String(row.timeIn || "").slice(0, 8),
          timeOut: to24(row.timeOut, "") || String(row.timeOut || "").slice(0, 8),
          lunch: Number(row.lunch) || 0,
          rate: Number(row.rate) || fields.defaultRate || 0,
          hoursOverride: numberValue(row.hours),
          hours: Number(row.hours) || 0
        });
      });
      return typeof saved.id === "string" ? saved.id.slice(0, 100) : "";
    } catch (_) {
      warnings.push("Los datos internos del PDF no se pudieron leer; se usa el texto impreso.");
      return "";
    }
  }
  function appRoot() {
    const scripts = document.getElementsByTagName("script");
    for (const script of scripts) {
      const src = script.src || "";
      if (/job-pdf\.js/i.test(src)) return src.replace(/[^/]+(?:\?.*)?$/, "");
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
  let reader;
  async function extractPdfText(file) {
    const base = appRoot();
    if (!reader) reader = import(base + "vendor/pdf.min.mjs");
    const pdfjs = await reader;
    pdfjs.GlobalWorkerOptions.workerSrc = base + "vendor/pdf.worker.min.mjs";
    const bytes = new Uint8Array(await file.arrayBuffer());
    const task = pdfjs.getDocument({data: bytes, isEvalSupported: false, useWasm: false, disableFontFace: true, standardFontDataUrl: base + "vendor/standard_fonts/"});
    try {
      const doc = await withTimeout(task.promise, 18000, "El PDF del job tardó demasiado en abrirse.");
      if (doc.numPages > 40) throw new Error("Este PDF supera las 40 páginas.");
      let text = "";
      let subject = "";
      try { subject = (await doc.getMetadata()).info?.Subject || ""; } catch (_) { /* no metadata */ }
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
    if (!file) throw new Error("Selecciona un PDF de job.");
    const pdfHash = await hash(file);
    const extracted = { fields: { jobAddress: "", defaultRate: null }, entries: [], warnings: [], text: "", pdfHash, sourceId: "" };
    try {
      const { text, subject } = await extractPdfText(file);
      extracted.text = text;
      const parsed = parseJobText(text);
      extracted.fields = parsed.fields;
      extracted.warnings = parsed.warnings;
      extracted.sourceId = applyJobMeta(subject, extracted.fields, extracted.entries, extracted.warnings);
      if (!extracted.entries.length) extracted.entries = parsed.entries;
      if (String(text || "").trim().length < 10) extracted.warnings.unshift("El PDF es una imagen o no tiene texto. Completa los datos viendo el original.");
    } catch (error) {
      extracted.warnings.push(error.message || "No se pudo leer el texto del PDF.");
    }
    return extracted;
  }

  const api = {generate, hash, calcHours, fullDate, dayName, money, timeLabel12, rangeLabel, parseEnglishDate, parseJobText, read, hasClock};
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.JobPDF = api;
})(typeof globalThis !== "undefined" ? globalThis : this);

/* Converts the work-hours messages commonly copied from WhatsApp into editable rows. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.HoursWhatsAppParser = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const fold = value => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const weekdays = new Set(["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday", "lunes", "martes", "miercoles", "jueves", "viernes", "sabado", "domingo"]);
  const weekdayIndexes = {sunday: 0, domingo: 0, monday: 1, lunes: 1, tuesday: 2, martes: 2, wednesday: 3, miercoles: 3, thursday: 4, jueves: 4, friday: 5, viernes: 5, saturday: 6, sabado: 6};
  const months = {
    january: 1, jan: 1, febrero: 2, february: 2, feb: 2, marzo: 3, march: 3, mar: 3,
    abril: 4, april: 4, apr: 4, mayo: 5, may: 5, junio: 6, june: 6, jun: 6,
    julio: 7, july: 7, jul: 7, agosto: 8, august: 8, aug: 8, septiembre: 9,
    setiembre: 9, september: 9, sep: 9, sept: 9, octubre: 10, october: 10, oct: 10,
    noviembre: 11, november: 11, nov: 11, diciembre: 12, december: 12, dec: 12
  };
  const monthNames = Object.keys(months);
  const dateValue = (year, month, day) => {
    const y = Number(year), m = Number(month), d = Number(day);
    const date = new Date(y, m - 1, d);
    return y >= 1900 && y <= 2200 && date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d
      ? `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}` : "";
  };
  const numberValue = value => {
    let text = String(value || "").replace(/(?:USD|US\$|d[oó]lares?)/gi, "").replace(/\$/g, "").replace(/\s/g, "").trim();
    if (!/^\d+(?:[.,]\d+)*$/.test(text)) return null;
    if (/^\d{1,3}(?:,\d{3})+$/.test(text) || /^\d{1,3}(?:\.\d{3})+$/.test(text)) text = text.replace(/[.,]/g, "");
    else if (/^\d+[.,]\d{1,2}$/.test(text)) text = text.replace(",", ".");
    else if (/[.,]/.test(text)) return null;
    const valueNumber = Number(text);
    return Number.isFinite(valueNumber) ? valueNumber : null;
  };

  function cleanLines(raw) {
    return String(raw || "").replace(/\r\n?/g, "\n")
      .replace(/[\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g, "")
      .replace(/\u00a0/g, " ").split("\n").map(line => line
        .replace(/^\s*\[(?=[^\]]*\d{1,2}:\d{2})[^\]]{1,100}\]\s*[^:\n]{1,100}:\s*/, "")
        .replace(/^\s*\d{1,2}[/.]\d{1,2}[/.]\d{2,4},?\s+\d{1,2}:\d{2}(?:\s*[ap]\.?\s*m\.?)?\s*[-–—]\s*[^:\n]{1,100}:\s*/i, "")
        .replace(/^[\s>*•\-]+|[\s*_`]+$/g, "").trim())
      .filter(line => line && !/^[-—–_=•\s]+$/.test(line));
  }

  function parseDateText(value, fallbackYear) {
    const source = String(value || "").trim();
    const clean = fold(source).replace(/[.!]/g, "").replace(/,/g, " ").replace(/\s+/g, " ").trim();
    if (/^(?:con\s+fecha\s+de\s+hoy|hoy|today|today['’]s date)$/.test(clean)) {
      const now = new Date();
      return dateValue(now.getFullYear(), now.getMonth() + 1, now.getDate());
    }
    let match = clean.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/);
    if (match) return dateValue(match[1], match[2], match[3]);
    match = clean.match(/\b(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})\b/);
    if (match) {
      const first = Number(match[1]), second = Number(match[2]);
      let year = Number(match[3]); if (year < 100) year += 2000;
      const dayFirst = first > 12 ? true : second > 12 ? false : /(?:fecha|dia|día)/i.test(source);
      return dateValue(year, dayFirst ? second : first, dayFirst ? first : second);
    }
    const english = clean.match(new RegExp(`\\b(${monthNames.join("|")})\\s+(\\d{1,2})(?:\\s+(\\d{4}))?\\b`, "i"));
    if (english) return dateValue(english[3] || fallbackYear, months[english[1].toLowerCase()], english[2]);
    const spanish = clean.match(new RegExp(`\\b(\\d{1,2})\\s+(?:de\\s+)?(${monthNames.join("|")})(?:\\s+(?:de\\s+)?(\\d{4}))?\\b`, "i"));
    if (spanish) return dateValue(spanish[3] || fallbackYear, months[spanish[2].toLowerCase()], spanish[1]);
    return "";
  }

  function extractTimes(line) {
    const source = String(line || "").replace(/\b(\d{1,2})\s+y\s+(?:media|30)\b/gi, "$1:30");
    const result = [];
    const standard = /\b(\d{1,2})(?::([0-5]\d))?\s*(a\.?\s*m\.?|p\.?\s*m\.?)\b/gi;
    let match;
    while ((match = standard.exec(source))) {
      let hour = Number(match[1]); const minute = Number(match[2] || 0); const suffix = fold(match[3]).replace(/\s/g, "");
      if (hour > 12 || minute > 59) continue;
      if (suffix.startsWith("p") && hour < 12) hour += 12;
      if (suffix.startsWith("a") && hour === 12) hour = 0;
      result.push({value: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`, index: match.index, length: match[0].length});
    }
    const bare = /\b([01]?\d|2[0-3]):([0-5]\d)\b/g;
    while ((match = bare.exec(source))) {
      if (!result.some(item => match.index >= item.index && match.index < item.index + item.length)) result.push({value: `${String(Number(match[1])).padStart(2, "0")}:${match[2]}`, index: match.index, length: match[0].length});
    }
    return result.sort((a, b) => a.index - b.index);
  }

  function weekdayIn(line) {
    const match = fold(line).match(/\b(lunes|martes|miercoles|jueves|viernes|sabado|domingo|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/);
    return match ? match[1] : "";
  }

  function dateForWeekday(day, anchorDate) {
    const target = weekdayIndexes[fold(day)];
    if (target == null) return "";
    const anchor = new Date(`${anchorDate || ""}T12:00:00`);
    if (Number.isNaN(anchor.getTime())) return "";
    const delta = (target - anchor.getDay() + 7) % 7;
    anchor.setDate(anchor.getDate() + delta);
    return dateValue(anchor.getFullYear(), anchor.getMonth() + 1, anchor.getDate());
  }

  function addHoursToClock(time, hours, lunchMinutes = 0) {
    const match = String(time || "07:00").match(/^(\d{1,2}):(\d{2})$/);
    const start = match ? Number(match[1]) * 60 + Number(match[2]) : 7 * 60;
    const total = Math.max(0, Math.round(Number(hours || 0) * 60)) + Math.max(0, Number(lunchMinutes) || 0);
    const minutes = (start + total) % (24 * 60);
    return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
  }

  function simpleEmployee(line, hoursMatch) {
    const before = String(line || "").slice(0, hoursMatch?.index ?? String(line || "").length)
      .replace(/^(?:y|e)\s+/i, "").replace(/\b(?:trabaj(?:o|ó)|worked?|work)\b/gi, "").trim();
    const dayMatch = before.match(/^(.*?)\s+(?:el\s+|la\s+)?(?:lunes|martes|miercoles|jueves|viernes|sabado|domingo|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i);
    const candidate = (dayMatch ? dayMatch[1] : before).replace(/[|,:;#.)-]+$/g, "").trim();
    if (!candidate || /\d/.test(candidate) || /^(?:total|horas?|hours?|trabajo|worked?)$/i.test(candidate)) return "";
    return candidate;
  }

  function parseLunch(line) {
    const source = String(line || "");
    let match = source.match(/(?:lunch|almuerzo|comida|break)\s*[:=-]?\s*(\d{1,3})\s*(?:min(?:ute)?s?|m)?\b/i);
    if (!match) match = source.match(/\b(\d{1,3})\s*(?:min(?:ute)?s?|mins?|m)\b/i);
    return match ? Math.max(0, Number(match[1])) : null;
  }

  function parseHours(line) {
    const match = String(line || "").match(/\b(\d+(?:[.,]\d+)?)\s*(?:hrs?|hours?|horas?)\b/i);
    return match ? numberValue(match[1]) : null;
  }

  function parseRate(line) {
    const source = String(line || "");
    const patterns = [
      /(?:hourly\s+rate|tarifa(?:\s+por\s+hora)?|rate|pago\s+por\s+hora)\s*[:=]?\s*\$?\s*([\d,]+(?:[.]\d{1,2})?)\s*(?:\$|usd|d[oó]lares?)?/i,
      /\$?\s*([\d,]+(?:[.]\d{1,2})?)\s*\$?\s*(?:\/\s*(?:hr|hrs?|hour|hours?|hora|horas?)|(?:por|la)\s+(?:hr|hora|hour))\b/i,
      /\b(?:a|por)\s+\$?\s*([\d,]+(?:[.]\d{1,2})?)\s*\$?\s*(?:la\s+)?(?:hr|hora|hour)\b/i,
      /\b(?:a|rate|tarifa)\s+\$?\s*([\d,]+(?:[.]\d{1,2})?)\s*\$?\s*$/i
    ];
    for (const pattern of patterns) { const match = source.match(pattern); if (match) { const value = numberValue(match[1]); if (value != null && value > 0 && value < 10000) return value; } }
    return null;
  }

  function cleanName(value) {
    let name = String(value || "").replace(/^[\s|,:;#.)-]+|[\s|,:;#.)-]+$/g, "").trim();
    name = name.replace(/^(?:date|fecha|dia|día|employee|empleado|worker|trabajador)\s*[:=-]?\s*/i, "");
    let words = name.split(/\s+/).filter(Boolean);
    while (words.length && weekdays.has(fold(words[0]).replace(/[,.:]/g, ""))) words.shift();
    name = words.join(" ");
    const datePrefix = name.match(/^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\s+/);
    if (datePrefix) name = name.slice(datePrefix[0].length).trim();
    words = name.split(/\s+/).filter(Boolean);
    if (words.length < 2 || words.length > 5 || /\d/.test(name)) return "";
    if (/^(?:total|description|descripci[oó]n|job|trabajo|address|direcci[oó]n)$/i.test(name)) return "";
    const uppercaseWords = words.filter(word => /^[A-ZÁÉÍÓÚÑÜ]/.test(word));
    return uppercaseWords.length >= 2 ? name : "";
  }

  function addressLine(line) {
    return /^\d{1,6}[A-Za-z]?\s+.+\b(?:st(?:reet)?|ave(?:nue)?|rd|road|dr(?:ive)?|ct|court|blvd|boulevard|ln|lane|way|pl(?:ace)?|pkwy|parkway|ter(?:race)?|cir(?:cle)?)\b/i.test(line);
  }

  function blankEntry() { return {employee: "", date: "", timeIn: "", timeOut: "", lunch: null, rate: null, hoursOverride: ""}; }
  function meaningful(entry) { return entry && (entry.employee || entry.timeIn || entry.timeOut || entry.hoursOverride !== ""); }

  function parse(raw, options = {}) {
    const lines = cleanLines(raw);
    const fallbackDate = options.defaultDate || "";
    const fallbackYear = Number(String(fallbackDate).slice(0, 4)) || new Date().getFullYear();
    const fields = {address: "", reportDate: "", defaultRate: null, description: ""};
    const warnings = [];

    for (let index = 0; index < lines.length; index++) {
      const line = lines[index];
      const addressMatch = line.match(/^(?:direcci[oó]n(?:\s+del\s+(?:trabajo|job))?|work\s+address|job\s+address|location|ubicaci[oó]n)\s*[:=-]?\s*(.*)$/i);
      if (addressMatch) {
        let value = addressMatch[1].trim(); if (!value && lines[index + 1]) value = lines[++index];
        if (value) fields.address = value;
      } else if (!fields.address && addressLine(line)) {
        let value = line; if (lines[index + 1] && /^[A-Za-z .'-]+,\s*[A-Z]{2}\s+\d{5}(?:-\d{4})?$/i.test(lines[index + 1])) value += ", " + lines[++index];
        fields.address = value;
      }
      const date = parseDateText(line, fallbackYear);
      if (date && !fields.reportDate) fields.reportDate = date;
      const rate = parseRate(line);
      if (rate != null && fields.defaultRate == null) fields.defaultRate = rate;
      const description = line.match(/^(?:descripci[oó]n(?:\s+del\s+trabajo)?|description|trabajo(?:\s+realizado)?)\s*[:=-]\s*(.*)$/i);
      if (description && description[1]) fields.description = description[1].trim();
    }

    const entries = [];
    let current = null;
    let pendingEmployee = "";
    const flush = () => {
      if (!current || !meaningful(current)) return;
      const entry = {...current};
      entry.date = entry.date || fields.reportDate || fallbackDate;
      entry.lunch = entry.lunch == null ? 0 : entry.lunch;
      if (entry.rate == null && fields.defaultRate != null) entry.rate = fields.defaultRate;
      entries.push(entry); current = null;
    };
    const ensureCurrent = () => { if (!current) current = blankEntry(); return current; };

    for (const line of lines) {
      const normalized = fold(line);
      if (/^(?:total|subtotal|total hours|total de horas|description|descripci[oó]n)\b/.test(normalized)) continue;
      let match;
      match = line.match(/^(?:empleado|employee|trabajador|worker)\s*[:=-]\s*(.*)$/i);
      if (match) { flush(); current = blankEntry(); current.employee = match[1].trim(); continue; }
      match = line.match(/^(?:fecha|date|día|dia)\s*[:=-]\s*(.*)$/i);
      if (match) { const date = parseDateText(match[1], fallbackYear); if (date) ensureCurrent().date = date; continue; }
      match = line.match(/^(?:entrada|time\s*in|in)\s*[:=-]?\s*(.*)$/i);
      if (match) { const time = extractTimes(match[1])[0]; if (time) ensureCurrent().timeIn = time.value; continue; }
      match = line.match(/^(?:salida|time\s*out|out)\s*[:=-]?\s*(.*)$/i);
      if (match) { const time = extractTimes(match[1])[0]; if (time) ensureCurrent().timeOut = time.value; continue; }
      match = line.match(/^(?:almuerzo|lunch|comida|break)\s*[:=-]?\s*(.*)$/i);
      if (match) { const lunch = parseLunch(match[1]); if (lunch != null) (current || entries[entries.length - 1] || ensureCurrent()).lunch = lunch; continue; }
      match = line.match(/^(?:horas?|hours?|total\s+hours?)\s*[:=-]?\s*(.*)$/i);
      if (match) { const hours = parseHours(match[1]) ?? numberValue(match[1]); if (hours != null) (current || entries[entries.length - 1] || ensureCurrent()).hoursOverride = hours; continue; }
      match = line.match(/^(?:tarifa|rate|hourly\s+rate|pago\s+por\s+hora)\s*[:=-]?\s*(.*)$/i);
      if (match) { const rate = parseRate(line) ?? numberValue(match[1]); if (rate != null) (current || entries[entries.length - 1] || ensureCurrent()).rate = rate; continue; }

      const times = extractTimes(line);
      const simpleHoursMatch = line.match(/\b(\d+(?:[.,]\d+)?)\s*(?:hrs?|hours?|horas?)\b/i);
      if (simpleHoursMatch && times.length < 2) {
        const employee = simpleEmployee(line, simpleHoursMatch) || (current && current.employee) || pendingEmployee;
        const hours = numberValue(simpleHoursMatch[1]);
        if (employee && hours != null) {
          flush();
          const entry = blankEntry();
          const weekday = weekdayIn(line);
          entry.employee = employee;
          entry.hoursOverride = hours;
          entry.lunch = parseLunch(line) ?? 60;
          entry.rate = parseRate(line) ?? fields.defaultRate;
          entry.date = (weekday && dateForWeekday(weekday, fields.reportDate || fallbackDate)) || fields.reportDate || fallbackDate;
          entry.timeIn = "07:00";
          entry.timeOut = addHoursToClock(entry.timeIn, hours, entry.lunch);
          entry.scheduleAuto = true;
          entries.push(entry);
          if (!fields.reportDate && entry.date) fields.reportDate = entry.date;
          pendingEmployee = ""; current = null; continue;
        }
      }
      if (times.length >= 2) {
        const prefix = line.slice(0, times[0].index).replace(/[|,:;]+$/g, "").trim();
        const name = cleanName(prefix) || (current && current.employee) || pendingEmployee;
        if (current && current.employee && !current.timeIn && (!prefix || name === current.employee)) {
          current.timeIn = times[0].value; current.timeOut = times[1].value;
          const lunch = parseLunch(line); if (lunch != null) current.lunch = lunch;
          const hours = parseHours(line); if (hours != null) current.hoursOverride = hours;
          const rate = parseRate(line); if (rate != null) current.rate = rate;
        } else {
          flush();
          const entry = blankEntry(); entry.employee = name; entry.date = fields.reportDate || fallbackDate;
          entry.timeIn = times[0].value; entry.timeOut = times[1].value;
          entry.lunch = parseLunch(line); entry.hoursOverride = parseHours(line) ?? ""; entry.rate = parseRate(line);
          current = entry; flush();
        }
        pendingEmployee = ""; continue;
      }

      if (times.length === 1 && current) {
        if (!current.timeIn) current.timeIn = times[0].value; else if (!current.timeOut) current.timeOut = times[0].value;
        continue;
      }
      const name = cleanName(line);
      if (name) {
        if (current && meaningful(current)) flush();
        pendingEmployee = name;
      }
    }
    flush();

    const normalizedEntries = entries.map(entry => ({
      date: entry.date || fields.reportDate || fallbackDate,
      employee: String(entry.employee || "").trim(),
      timeIn: entry.timeIn || "",
      timeOut: entry.timeOut || "",
      lunch: Math.max(0, Number(entry.lunch) || 0),
      rate: entry.rate == null ? undefined : Number(entry.rate) || 0,
      hoursOverride: entry.hoursOverride === "" || entry.hoursOverride == null ? "" : Number(entry.hoursOverride) || 0,
      scheduleAuto: Boolean(entry.scheduleAuto)
    })).filter(entry => entry.employee);

    if (!fields.address) warnings.push("No detecté la dirección del trabajo.");
    if (!fields.reportDate) warnings.push("No detecté una fecha; completa la fecha del reporte.");
    if (fields.defaultRate == null) warnings.push("No detecté la tarifa por hora; puedes escribirla arriba o en cada registro.");
    if (!normalizedEntries.length) warnings.push("No encontré empleados con dos horas (entrada y salida).");
    normalizedEntries.forEach((entry, index) => {
      if (!entry.timeIn || !entry.timeOut) warnings.push(`El registro ${index + 1} necesita entrada y salida.`);
    });
    return {fields, entries: normalizedEntries, warnings, lines};
  }

  return {parse, cleanLines, parseDateText, extractTimes, parseRate, parseLunch, parseHours};
});

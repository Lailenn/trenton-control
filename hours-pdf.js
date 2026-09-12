/* Creates the Arrento Carpentry work-hours report as a real Letter PDF. */
(function (root) {
  "use strict";
  const lib = () => root.PDFLib || (typeof require === "function" ? require("pdf-lib") : null);
  const clean = value => String(value ?? "").replace(/[\u2010-\u2014]/g, "-").replace(/\t/g, "    ");
  const dateValue = value => {
    const date = new Date(`${value}T12:00:00`);
    return Number.isNaN(date.getTime()) ? null : date;
  };
  const dayName = value => dateValue(value)?.toLocaleDateString("en-US", {weekday: "long"}) || value || "";
  const fullDate = value => dateValue(value)?.toLocaleDateString("en-US", {weekday: "long", month: "long", day: "numeric", year: "numeric"}) || value || "";
  const hoursLabel = value => `${Number(value || 0).toLocaleString("en-US", {maximumFractionDigits: 2})} HRS`;
  const money = value => {
    const number = Number(value) || 0;
    return `$${number.toLocaleString("en-US", {minimumFractionDigits: Number.isInteger(number) ? 0 : 2, maximumFractionDigits: 2})}`;
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

  async function generate(data, logoBytes) {
    const {PDFDocument, StandardFonts, rgb} = lib();
    const doc = await PDFDocument.create();
    const regular = await doc.embedFont(StandardFonts.Helvetica);
    const bold = await doc.embedFont(StandardFonts.HelveticaBold);
    let logo = null;
    if (logoBytes) {
      const bytes = new Uint8Array(logoBytes);
      logo = bytes[0] === 137 ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
    }
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
    const pageW = 612, pageH = 792, left = 42, width = 528, black = rgb(0, 0, 0), peach = rgb(253 / 255, 233 / 255, 217 / 255);
    let page, cursor;
    const newPage = () => { page = doc.addPage([pageW, pageH]); cursor = 44; };
    const text = (value, x, top, size = 10, font = regular) => page.drawText(clean(value), {x, y: pageH - top - size, size, font, color: black});
    const centered = (value, top, size = 10, font = regular) => { const label = clean(value); text(label, (pageW - font.widthOfTextAtSize(label, size)) / 2, top, size, font); };
    const line = (x1, y1, x2, y2, thickness = .65) => page.drawLine({start: {x: x1, y: pageH - y1}, end: {x: x2, y: pageH - y2}, thickness, color: black});
    const cell = (value, x, top, w, size = 10, font = regular, align = "left") => {
      const label = clean(value); const measured = font.widthOfTextAtSize(label, size); const px = align === "center" ? x + (w - measured) / 2 : align === "right" ? x + w - measured - 7 : x + 7;
      text(label, px, top + 7, size, font);
    };
    const table = (top, columns, headers, rows, totalRow, bodyFirstColumnPeach = false) => {
      const rowHeight = 27, headerHeight = 28, totalHeight = 27, height = headerHeight + rows.length * rowHeight + totalHeight;
      page.drawRectangle({x: left, y: pageH - top - headerHeight, width, height: headerHeight, color: rgb(1, 1, 1)});
      page.drawRectangle({x: left, y: pageH - top - height, width, height: headerHeight, color: rgb(1, 1, 1)});
      page.drawRectangle({x: left, y: pageH - top - height, width, height: totalHeight, color: peach});
      line(left, top, left + width, top); line(left, top + headerHeight, left + width, top + headerHeight); line(left, top + height - totalHeight, left + width, top + height - totalHeight); line(left, top + height, left + width, top + height);
      let x = left; columns.forEach(w => { line(x, top, x, top + height); x += w; }); line(left + width, top, left + width, top + height);
      x = left; headers.forEach((header, i) => { cell(header, x, top, columns[i], 9.6, bold); x += columns[i]; });
      rows.forEach((row, rowIndex) => {
        if (bodyFirstColumnPeach) page.drawRectangle({x: left, y: pageH - top - headerHeight - (rowIndex + 1) * rowHeight, width: columns[0], height: rowHeight, color: peach});
        x = left; row.forEach((value, i) => { cell(value, x, top + headerHeight + rowIndex * rowHeight, columns[i], 9.5, i === 0 ? bold : regular); x += columns[i]; });
      });
      x = left; totalRow.forEach((value, i) => { cell(value, x, top + height - totalHeight, columns[i], 9.5, bold); x += columns[i]; });
      return top + height;
    };
    const header = () => {
      newPage();
      if (logo) { const factor = Math.min(220 / logo.width, 70 / logo.height); page.drawImage(logo, {x: (pageW - logo.width * factor) / 2, y: pageH - 40 - logo.height * factor, width: logo.width * factor, height: logo.height * factor}); }
      const jobLabel = "JOB:"; const address = clean(data.jobAddress || ""); const jobSize = 13; const jobWidth = bold.widthOfTextAtSize(jobLabel, jobSize) + 8 + bold.widthOfTextAtSize(address, jobSize); const jobX = (pageW - jobWidth) / 2;
      text(jobLabel, jobX, 137, jobSize, bold); text(address, jobX + bold.widthOfTextAtSize(jobLabel, jobSize) + 8, 137, jobSize, bold); line(jobX + bold.widthOfTextAtSize(jobLabel, jobSize) + 8, 154, jobX + jobWidth, 154, 1);
      centered(fullDate(data.reportDate), 169, 13, bold);
      cursor = 205;
    };
    header();
    const columns = [100, 115, 85, 85, 70, 73];
    for (const [employee, rows] of groups) {
      const tableRows = rows.map(row => [dayName(row.date), employee, timeLabel(row.timeIn), timeLabel(row.timeOut), `${row.lunch} MIN`, hoursLabel(row.hours)]);
      const employeeTotal = rows.reduce((sum, row) => sum + row.hours, 0);
      if (cursor + 28 + tableRows.length * 27 + 27 > 710) header();
      cursor = table(cursor, columns, ["DATE", "EMPLOYEE", "TIME IN", "TIME OUT", "LUNCH", "TOTAL HOURS"], tableRows, ["TOTAL", "", "", "", "", hoursLabel(employeeTotal)]) + 44;
    }
    const summaryRows = summary.map(row => [row.employee, hoursLabel(row.totalHours), row.rate == null ? "VARIES" : `${money(row.rate)}/HR`, money(row.pay)]);
    const summaryHeight = 28 + summaryRows.length * 27 + 27;
    if (cursor + summaryHeight + 95 > 750) header();
    cursor = table(cursor, [180, 130, 140, 82], ["EMPLOYEE", "TOTAL HOURS", "HOURLY RATE", "TOTAL PAY"], summaryRows, ["TOTAL", hoursLabel(totalHours), "", money(totalPay)], true) + 57;
    text("Description:", left, cursor, 11, bold);
    const description = clean(data.description || "");
    if (description) text(description, left, cursor + 22, 10, regular);
    doc.setTitle(`Work hours - ${data.jobAddress || "Arrento Carpentry"}`);
    doc.setAuthor("Arrento Carpentry LLC");
    doc.setSubject("TrentonControl/hours-v1:" + JSON.stringify({id: data.recordId || "", jobAddress: data.jobAddress || "", reportDate: data.reportDate || "", totalHours, totalPay}));
    doc.setCreator("Trenton Control");
    return new Blob([await doc.save()], {type: "application/pdf"});
  }
  const api = {generate, hash, calcHours, fullDate, dayName, money, timeLabel};
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.HoursPDF = api;
})(typeof globalThis !== "undefined" ? globalThis : this);

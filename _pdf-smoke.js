const fs = require("fs");
const vm = require("vm");
const path = require("path");
const dir = __dirname;
class Blob {
  constructor(parts, opts) {
    this.parts = parts;
    this.type = opts && opts.type;
    this.size = parts.reduce((s, p) => s + (p.byteLength || p.length || 0), 0);
  }
}
const ctx = {
  console, Uint8Array, ArrayBuffer, Float32Array, DataView, Map, Set, Promise, Date, Math, JSON,
  Error, TypeError, Number, String, Boolean, Array, Object, Infinity, NaN, undefined,
  Int8Array, Uint16Array, Int16Array, Int32Array, Uint32Array, Float64Array,
  crypto: require("crypto").webcrypto, Blob, atob, btoa, TextEncoder, TextDecoder
};
ctx.window = ctx;
ctx.self = ctx;
ctx.globalThis = ctx;
function load(file) {
  vm.runInNewContext(fs.readFileSync(path.join(dir, file), "utf8"), ctx, { filename: file });
}
load("vendor/pdf-lib.min.js");
load("invoice-core.js");
load("invoice-pdf.js");
load("hours-pdf.js");

(async () => {
  const invoiceLogo = fs.readFileSync(path.join(dir, "assets/logo-ruben.png"));
  const hoursLogo = fs.readFileSync(path.join(dir, "assets/arrento-carpentry.png"));
  try {
    const inv = await ctx.InvoicePDF.generate({
      fromName: "Ruben Perla",
      fromPhone: "301-000-0000",
      fromEmail: "a@b.com",
      fromAddress: "Maryland",
      billName: "Trenton Builders LLC",
      billAddress: "USA",
      workAddress: "4406 Woodfield Rd, Kensington, MD 20895",
      invoiceNumber: "INV-1001",
      issuedDate: "2026-09-12",
      qty: 1,
      price: 1500,
      deposit: 50,
      description: "Trabajo de carpinteria en cocina. Josue Zuniga. Incluye molduras.",
      approval: "Approved by owner",
      note: "",
      recordId: "abc"
    }, invoiceLogo);
    console.log("invoice ok", inv.size);
  } catch (e) {
    console.error("INVOICE FAIL", e && e.message);
    console.error(e && e.stack);
  }
  try {
    const hrs = await ctx.HoursPDF.generate({
      jobAddress: "4406 Woodfield Rd, Kensington, MD 20895",
      reportDate: "2026-08-26",
      description: "Trabajo con Josue Zuniga y Pablo Matamoros.",
      defaultRate: 30,
      recordId: "h1",
      entries: [
        { employee: "Josue Zuniga", date: "2026-08-26", timeIn: "07:00", timeOut: "18:30", lunch: 30, rate: 30 },
        { employee: "Pablo Matamoros", date: "2026-08-26", timeIn: "07:00", timeOut: "18:30", lunch: 30, rate: 30 }
      ]
    }, hoursLogo);
    console.log("hours ok", hrs.size);
  } catch (e) {
    console.error("HOURS FAIL", e && e.message);
    console.error(e && e.stack);
  }
  try {
    const accent = await ctx.HoursPDF.generate({
      jobAddress: "Calle José Núñez — “obra”",
      reportDate: "2026-08-26",
      description: "Notas con ñ, emojis 👋 y comillas tipográficas.",
      defaultRate: 30,
      recordId: "h2",
      entries: [
        { employee: "Josué Zúñiga", date: "2026-08-26", timeIn: "07:00", timeOut: "18:30", lunch: 30, rate: 30 }
      ]
    }, hoursLogo);
    console.log("accent hours ok", accent.size);
  } catch (e) {
    console.error("ACCENT FAIL", e && e.message);
    console.error(e && e.stack);
  }
})();

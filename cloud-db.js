(function (root) {
  "use strict";
  let currentUser = null;

  function sb() { return root.TrentonSupabase.client; }
  function Core() { return root.InvoiceCore; }
  function ownerId() {
    const id = currentUser?.id || root.TrentonSupabase.userId();
    if (!id) throw new Error("No hay sesión. Vuelve a entrar.");
    return id;
  }
  function fail(error, fallback) {
    if (!error) return;
    if (error.code === "23505") throw new Error("Esta invoice ya está guardada. Edita el registro existente.");
    throw new Error(error.message || fallback || "No se pudo completar la operación en la nube.");
  }

  async function upload(bucket, path, blob, type) {
    const { error } = await sb().storage.from(bucket).upload(path, blob, { upsert: true, contentType: type, cacheControl: "3600" });
    fail(error, "No se pudo subir el archivo.");
    return path;
  }

  function asPdfBlob(data) {
    if (!data) return null;
    if (data.type === "application/pdf") return data;
    return new Blob([data], { type: "application/pdf" });
  }

  async function download(bucket, path) {
    if (!path) return null;
    const { data, error } = await sb().storage.from(bucket).download(path);
    if (error) throw new Error(error.message || "No se pudo descargar el archivo.");
    return bucket.includes("pdf") ? asPdfBlob(data) : data;
  }

  async function cacheBlob(kind, id, hash, blob) {
    try { await root.LocalCache.put(kind, id, hash, blob); }
    catch (error) { console.warn("No se pudo guardar el PDF en este teléfono.", error); }
  }

  function slimInvoiceData(data) {
    if (!data || typeof data !== "object") return data || null;
    const copy = { ...data };
    delete copy.logoDataUrl;
    if (typeof copy.sourceMessage === "string") copy.sourceMessage = copy.sourceMessage.slice(0, 8000);
    return copy;
  }

  async function persistPdf(kind, bucket, record) {
    if (!record.pdfBlob) return;
    record.pdfPath = record.pdfPath || `${ownerId()}/${record.id}.pdf`;
    await cacheBlob(kind, record.id, record.pdfHash, record.pdfBlob);
    try {
      await upload(bucket, record.pdfPath, record.pdfBlob, "application/pdf");
    } catch (error) {
      console.warn("El PDF quedó en este aparato. La subida a la nube se reintentará.", error);
      throw error;
    }
  }

  function invoiceRow(record) {
    const C = Core();
    const issued = C.issuedDate(record) || null;
    return {
      id: record.id,
      owner_id: ownerId(),
      address: record.address || "",
      address_norm: C.addressNorm(record.address || record.workAddress),
      invoice_number: record.invoiceNumber || "",
      invoice_number_norm: C.numberNorm(record.invoiceNumber),
      issued_date: issued || null,
      amount_cents: C.cents(record.amount),
      hours: Number(record.hours) || 0,
      stage: record.stage || "created",
      description: record.description || "",
      invoice_data: slimInvoiceData(record.invoiceData),
      source: record.source || (record.invoiceData ? "generated" : "imported"),
      source_id: record.sourceId || null,
      pdf_hash: record.pdfHash || null,
      pdf_path: record.pdfPath || null,
      pdf_name: record.pdfName || "",
      paid_at: record.paidAt || null,
      deleted_at: record.deletedAt || null,
      updated_at: record.updatedAt || new Date().toISOString()
    };
  }

  function invoiceFrom(row, photos = []) {
    return {
      id: row.id,
      address: row.address,
      invoiceNumber: row.invoice_number,
      issuedDate: row.issued_date || "",
      amount: (row.amount_cents || 0) / 100,
      hours: Number(row.hours) || 0,
      stage: row.stage,
      description: row.description || "",
      invoiceData: row.invoice_data,
      source: row.source,
      sourceId: row.source_id,
      pdfHash: row.pdf_hash,
      pdfPath: row.pdf_path,
      pdfName: row.pdf_name,
      paidAt: row.paid_at,
      updatedAt: row.updated_at,
      deletedAt: row.deleted_at,
      pdfBlob: null,
      cloud: Boolean(row.pdf_path),
      checkPhotos: photos.filter(photo => photo.invoice_id === row.id)
    };
  }

  function duplicateOf(record, seen) {
    const C = Core();
    return seen.find(old =>
      old.id !== record.id && (
        (C.logicalKey(record) && C.logicalKey(record) === C.logicalKey(old)) ||
        (record.pdfHash && record.pdfHash === old.pdfHash) ||
        (record.sourceId && (record.sourceId === old.id || record.sourceId === old.sourceId))
      )
    );
  }

  async function listInvoices() {
    const { data, error } = await sb().from("invoices").select("*").is("deleted_at", null).order("updated_at", { ascending: false });
    fail(error, "No se pudieron leer las invoices.");
    const { data: photos, error: photoError } = await sb().from("check_photos").select("*").order("captured_at", { ascending: false });
    fail(photoError, "No se pudieron leer las fotos de cheque.");
    const records = (data || []).map(row => invoiceFrom(row, photos || []));
    await Promise.all(records.map(async record => {
      record.pdfBlob = await root.LocalCache.get("invoice", record.id, record.pdfHash);
    }));
    return records;
  }

  async function ensureInvoicePdf(record) {
    if (record.pdfBlob) return record.pdfBlob;
    if (!record.pdfPath) return null;
    const blob = await download("invoice-pdfs", record.pdfPath);
    if (blob) {
      record.pdfBlob = asPdfBlob(blob);
      await cacheBlob("invoice", record.id, record.pdfHash, record.pdfBlob);
    }
    return record.pdfBlob;
  }

  async function saveInvoice(record, existing = []) {
    const C = Core();
    const duplicate = duplicateOf(record, existing.filter(item => item.id !== record.id && !item.deletedAt));
    if (duplicate) throw new Error("Esta invoice ya está guardada: " + duplicate.invoiceNumber + ", " + duplicate.address + ". Edita el registro existente.");
    if (record.pdfBlob) record.pdfPath = record.pdfPath || `${ownerId()}/${record.id}.pdf`;
    record.pdfName = record.pdfName || C.fileName(record);
    if (record.pdfBlob) await cacheBlob("invoice", record.id, record.pdfHash, record.pdfBlob);
    const { error } = await sb().from("invoices").upsert(invoiceRow(record));
    fail(error, "No se pudo guardar la invoice.");
    if (record.pdfBlob) await upload("invoice-pdfs", record.pdfPath, record.pdfBlob, "application/pdf");
    return record;
  }

  async function saveMany(incoming, existing = []) {
    const seen = existing.filter(item => !incoming.some(next => next.id === item.id));
    for (const record of incoming) {
      const duplicate = duplicateOf(record, seen);
      if (duplicate) throw new Error("Esta invoice ya está guardada: " + duplicate.invoiceNumber + ", " + duplicate.address + ". Edita el registro existente.");
      seen.push(record);
    }
    for (const record of incoming) await saveInvoice(record, existing);
  }

  async function softDeleteInvoice(record) {
    const { error } = await sb().from("invoices").update({ deleted_at: new Date().toISOString() }).eq("id", record.id);
    fail(error, "No se pudo eliminar la invoice.");
    await root.LocalCache.remove("invoice", record.id);
  }

  async function nextInvoiceNumber(records = []) {
    const { data, error } = await sb().from("invoices").select("invoice_number").is("deleted_at", null);
    if (error) {
      const max = records.reduce((value, record) => /^\s*#?\d+\s*$/.test(record.invoiceNumber || "") ? Math.max(value, Number(String(record.invoiceNumber).replace("#", ""))) : value, 0);
      return "#" + String(max + 1).padStart(3, "0");
    }
    const max = (data || []).reduce((value, row) => {
      const number = String(row.invoice_number || "").replace(/^#/, "");
      return /^\d+$/.test(number) ? Math.max(value, Number(number)) : value;
    }, 0);
    return "#" + String(max + 1).padStart(3, "0");
  }

  function hoursFrom(report, entries) {
    return {
      id: report.id,
      jobAddress: report.job_address,
      reportDate: report.report_date,
      description: report.description || "",
      defaultRate: Number(report.default_rate) || 0,
      pdfHash: report.pdf_hash,
      pdfPath: report.pdf_path,
      pdfName: report.pdf_name,
      updatedAt: report.updated_at,
      cloud: Boolean(report.pdf_path),
      pdfBlob: null,
      entries: (entries || []).filter(entry => entry.report_id === report.id).sort((a, b) => a.sort_order - b.sort_order).map(entry => ({
        id: entry.id,
        date: entry.work_date || report.report_date,
        employee: entry.employee,
        timeIn: entry.time_in,
        timeOut: entry.time_out,
        lunch: Number(entry.lunch_minutes) || 0,
        rate: Number(entry.rate) || 0,
        hoursOverride: entry.hours_override == null ? "" : Number(entry.hours_override),
        hours: Number(entry.hours) || 0
      }))
    };
  }

  async function listHours() {
    const { data: reports, error } = await sb().from("hours_reports").select("*").is("deleted_at", null).order("updated_at", { ascending: false });
    fail(error, "No se pudieron leer los reportes de horas.");
    const { data: entries, error: entryError } = await sb().from("hours_entries").select("*");
    fail(entryError, "No se pudieron leer las jornadas.");
    const records = (reports || []).map(report => hoursFrom(report, entries || []));
    await Promise.all(records.map(async record => {
      record.pdfBlob = await root.LocalCache.get("hours", record.id, record.pdfHash);
    }));
    return records;
  }

  async function ensureHoursPdf(record) {
    if (record.pdfBlob) return record.pdfBlob;
    if (!record.pdfPath) return null;
    const blob = await download("hours-pdfs", record.pdfPath);
    if (blob) {
      record.pdfBlob = asPdfBlob(blob);
      await cacheBlob("hours", record.id, record.pdfHash, record.pdfBlob);
    }
    return record.pdfBlob;
  }

  async function saveHours(record) {
    if (record.pdfBlob) record.pdfPath = record.pdfPath || `${ownerId()}/${record.id}.pdf`;
    if (record.pdfBlob) await cacheBlob("hours", record.id, record.pdfHash, record.pdfBlob);
    const report = {
      id: record.id,
      owner_id: ownerId(),
      job_address: record.jobAddress,
      report_date: record.reportDate,
      description: record.description || "",
      default_rate: Number(record.defaultRate) || 0,
      pdf_hash: record.pdfHash || null,
      pdf_path: record.pdfPath || null,
      pdf_name: record.pdfName || "",
      deleted_at: null,
      updated_at: record.updatedAt || new Date().toISOString()
    };
    const { error } = await sb().from("hours_reports").upsert(report);
    fail(error, "No se pudo guardar el reporte de horas.");
    if (record.pdfBlob && record.pdfPath) await upload("hours-pdfs", record.pdfPath, record.pdfBlob, "application/pdf");
    const { error: clearError } = await sb().from("hours_entries").delete().eq("report_id", record.id);
    fail(clearError, "No se pudieron actualizar las jornadas.");
    const rows = (record.entries || []).map((entry, index) => ({
      id: entry.id || `${record.id}-${index + 1}`,
      report_id: record.id,
      owner_id: ownerId(),
      work_date: entry.date || record.reportDate,
      employee: entry.employee,
      time_in: entry.timeIn || "",
      time_out: entry.timeOut || "",
      lunch_minutes: Number(entry.lunch) || 0,
      rate: Number(entry.rate) || 0,
      hours_override: entry.hoursOverride === "" || entry.hoursOverride == null ? null : Number(entry.hoursOverride),
      hours: Number(entry.hours) || 0,
      sort_order: index
    }));
    if (rows.length) {
      const { error: insertError } = await sb().from("hours_entries").insert(rows);
      fail(insertError, "No se pudieron guardar las jornadas.");
    }
    return record;
  }

  async function addCheckPhoto(invoiceId, file, note = "") {
    if (!file) throw new Error("Selecciona una foto del cheque.");
    if (!/^image\/(jpeg|png|webp)$/i.test(file.type)) throw new Error("Usa una foto JPG, PNG o WebP.");
    if (file.size > 8 * 1024 * 1024) throw new Error("La foto del cheque supera 8 MB.");
    const id = `check-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const ext = file.type.includes("png") ? "png" : file.type.includes("webp") ? "webp" : "jpg";
    const path = `${ownerId()}/${invoiceId}/${id}.${ext}`;
    await upload("check-photos", path, file, file.type);
    await root.LocalCache.put("check", id, "", file);
    const row = { id, invoice_id: invoiceId, owner_id: ownerId(), storage_path: path, file_name: file.name || `${id}.${ext}`, note: String(note || "").slice(0, 500), captured_at: new Date().toISOString() };
    const { error } = await sb().from("check_photos").insert(row);
    fail(error, "No se pudo guardar la foto del cheque.");
    return { ...row, blob: file };
  }

  async function ensureCheckPhoto(photo) {
    if (photo.blob) return photo.blob;
    photo.blob = await root.LocalCache.get("check", photo.id) || await download("check-photos", photo.storage_path);
    if (photo.blob) await root.LocalCache.put("check", photo.id, "", photo.blob);
    return photo.blob;
  }

  async function removeCheckPhoto(photo) {
    await sb().storage.from("check-photos").remove([photo.storage_path]);
    const { error } = await sb().from("check_photos").delete().eq("id", photo.id);
    fail(error, "No se pudo quitar la foto.");
    await root.LocalCache.remove("check", photo.id);
  }

  root.CloudDB = {
    setUser(user) { currentUser = user; },
    listInvoices,
    saveInvoice,
    saveMany,
    softDeleteInvoice,
    ensureInvoicePdf,
    nextInvoiceNumber,
    listHours,
    saveHours,
    ensureHoursPdf,
    addCheckPhoto,
    ensureCheckPhoto,
    removeCheckPhoto,
    download
  };
})(typeof globalThis !== "undefined" ? globalThis : this);

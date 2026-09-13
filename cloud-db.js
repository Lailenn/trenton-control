(function (root) {
  "use strict";
  let currentUser = null;
  const HOURS_META = "trenton.hours.meta";
  const INVOICE_META = "trenton.invoices.meta";

  function sb() { return root.TrentonSupabase.client; }
  function Core() { return root.InvoiceCore; }
  function ownerId() {
    const id = currentUser?.id || root.TrentonSupabase.userId();
    if (!id) throw new Error("No hay sesión. Vuelve a entrar.");
    return id;
  }
  async function requireOwnerId() {
    try {
      const { data } = await sb().auth.getUser();
      if (data?.user?.id) {
        currentUser = data.user;
        root.TrentonSupabase?.setSessionUser?.(data.user);
        return data.user.id;
      }
    } catch (error) {
      console.warn("No se pudo refrescar la sesión", error);
    }
    return ownerId();
  }
  function errorText(error) {
    if (!error) return "";
    return [error.message, error.details, error.hint, error.code].filter(Boolean).join(" — ");
  }
  function isMissingColumn(error) {
    return /column|schema cache|PGRST204|does not exist|Could not find/i.test(errorText(error));
  }
  function fail(error, fallback) {
    if (!error) return;
    if (error.code === "23505") throw new Error("Esta invoice ya está guardada. Edita el registro existente.");
    const extra = errorText(error);
    throw new Error(extra || fallback || "No se pudo completar la operación en la nube.");
  }
  function readJson(key) {
    try { return JSON.parse(localStorage.getItem(key) || "[]"); }
    catch { return []; }
  }
  function writeJson(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); }
    catch (error) { console.warn("No se pudo guardar la copia local", error); }
  }
  function slimRecord(record) {
    const copy = { ...record };
    delete copy.pdfBlob;
    delete copy.checkPhotos;
    return copy;
  }
  function rememberHours(record) {
    if (!record?.id) return;
    const list = readJson(HOURS_META).filter(item => item.id !== record.id);
    list.unshift(slimRecord(record));
    writeJson(HOURS_META, list.slice(0, 300));
  }
  function rememberInvoice(record) {
    if (!record?.id) return;
    const list = readJson(INVOICE_META).filter(item => item.id !== record.id);
    list.unshift(slimRecord(record));
    writeJson(INVOICE_META, list.slice(0, 400));
  }

  async function upload(bucket, path, blob, type) {
    const result = await Promise.race([
      sb().storage.from(bucket).upload(path, blob, { upsert: true, contentType: type, cacheControl: "3600" }),
      new Promise((_, reject) => setTimeout(() => reject(new Error("La subida a la nube tardó demasiado. Revisa la conexión e intenta de nuevo.")), 45000))
    ]);
    fail(result.error, "No se pudo subir el archivo.");
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

  function invoiceRow(record, uid) {
    const C = Core();
    const issued = C.issuedDate(record) || null;
    return {
      id: record.id,
      owner_id: uid,
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

  async function queryInvoices() {
    let result = await sb().from("invoices").select("*").is("deleted_at", null).order("updated_at", { ascending: false });
    if (result.error && isMissingColumn(result.error)) {
      result = await sb().from("invoices").select("*").order("id", { ascending: false });
    }
    return result;
  }

  async function listInvoices() {
    const { data, error } = await queryInvoices();
    if (error) fail(error, "No se pudieron leer las invoices.");
    let photos = [];
    try {
      const photoResult = await sb().from("check_photos").select("*").order("captured_at", { ascending: false });
      if (photoResult.error) console.warn(photoResult.error);
      else photos = photoResult.data || [];
    } catch (photoError) {
      console.warn("No se pudieron leer las fotos de cheque.", photoError);
    }
    const cloud = (data || []).map(row => invoiceFrom(row, photos));
    const seen = new Set(cloud.map(item => item.id));
    const local = readJson(INVOICE_META).filter(item => item.id && !seen.has(item.id)).map(item => ({
      ...item,
      pdfBlob: null,
      cloud: false,
      checkPhotos: item.checkPhotos || []
    }));
    const merged = cloud.concat(local);
    await Promise.all(merged.map(async record => {
      record.pdfBlob = record.pdfBlob || await root.LocalCache.get("invoice", record.id, record.pdfHash);
    }));
    syncPendingInvoices().catch(error => console.warn("No se pudieron subir invoices pendientes.", error));
    return merged;
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
    const uid = await requireOwnerId();
    const duplicate = duplicateOf(record, existing.filter(item => item.id !== record.id && !item.deletedAt));
    if (duplicate) throw new Error("Esta invoice ya está guardada: " + duplicate.invoiceNumber + ", " + duplicate.address + ". Edita el registro existente.");
    if (record.pdfBlob) record.pdfPath = record.pdfPath || `${uid}/${record.id}.pdf`;
    record.pdfName = record.pdfName || C.fileName(record);
    if (record.pdfBlob) await cacheBlob("invoice", record.id, record.pdfHash, record.pdfBlob);
    rememberInvoice({ ...record, cloudSynced: false });
    const row = invoiceRow(record, uid);
    let result = await sb().from("invoices").upsert(row).select("id").maybeSingle();
    if (result.error && isMissingColumn(result.error)) {
      result = await sb().from("invoices").upsert({
        id: row.id,
        owner_id: uid,
        address: row.address,
        invoice_number: row.invoice_number,
        issued_date: row.issued_date,
        amount_cents: row.amount_cents,
        hours: row.hours,
        stage: row.stage,
        description: row.description
      }).select("id").maybeSingle();
    }
    fail(result.error, "No se pudo guardar la invoice.");
    if (!result.data?.id) throw new Error("Supabase no confirmó la invoice. Corre supabase/schema-fix-hours-cloud.sql y vuelve a guardar.");
    record.cloudSynced = true;
    rememberInvoice(record);
    if (record.pdfBlob) {
      try { await upload("invoice-pdfs", record.pdfPath, record.pdfBlob, "application/pdf"); }
      catch (error) { console.warn("Invoice guardada; el PDF quedó en este aparato.", error); }
    }
    return record;
  }

  let syncingInvoices = false;
  async function syncPendingInvoices() {
    if (syncingInvoices) return;
    syncingInvoices = true;
    try {
      const pending = readJson(INVOICE_META).filter(item => item.id && item.cloudSynced === false);
      for (const item of pending) {
        try {
          item.pdfBlob = item.pdfBlob || await root.LocalCache.get("invoice", item.id, item.pdfHash);
          await saveInvoice(item, []);
        } catch (error) {
          console.warn("Invoice pendiente no subió a la nube", item.id, error);
        }
      }
    } finally {
      syncingInvoices = false;
    }
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

  async function queryHoursReports() {
    let result = await sb().from("hours_reports").select("*").is("deleted_at", null).order("updated_at", { ascending: false });
    if (result.error && isMissingColumn(result.error)) {
      result = await sb().from("hours_reports").select("*").order("report_date", { ascending: false });
    }
    return result;
  }

  async function listHours() {
    let cloud = [];
    try {
      const { data: reports, error } = await queryHoursReports();
      if (error) fail(error, "No se pudieron leer los reportes de horas.");
      let entries = [];
      const entryResult = await sb().from("hours_entries").select("*");
      if (entryResult.error) console.warn(entryResult.error);
      else entries = entryResult.data || [];
      cloud = (reports || []).map(report => ({ ...hoursFrom(report, entries), cloudSynced: true }));
    } catch (error) {
      console.warn("Nube de horas no disponible; se usan los reportes de este aparato.", error);
    }
    const seen = new Set(cloud.map(item => item.id));
    const local = readJson(HOURS_META).filter(item => item.id && !seen.has(item.id));
    const merged = cloud.concat(local);
    await Promise.all(merged.map(async record => {
      record.pdfBlob = record.pdfBlob || await root.LocalCache.get("hours", record.id, record.pdfHash);
    }));
    syncPendingHours().catch(error => console.warn("No se pudieron subir reportes pendientes.", error));
    return merged;
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

  async function upsertHoursReport(report) {
    let result = await sb().from("hours_reports").upsert(report).select("id").maybeSingle();
    if (result.error && isMissingColumn(result.error)) {
      result = await sb().from("hours_reports").upsert({
        id: report.id,
        owner_id: report.owner_id,
        job_address: report.job_address,
        report_date: report.report_date,
        description: report.description
      }).select("id").maybeSingle();
    }
    fail(result.error, "No se pudo guardar el reporte de horas.");
    if (!result.data?.id) throw new Error("Supabase no confirmó el reporte. Corre supabase/schema-fix-hours-cloud.sql y vuelve a guardar.");
    return result.data;
  }

  async function replaceHoursEntries(record, uid) {
    const { error: clearError } = await sb().from("hours_entries").delete().eq("report_id", record.id);
    if (clearError && !isMissingColumn(clearError)) fail(clearError, "No se pudieron actualizar las jornadas.");
    const rows = (record.entries || []).map((entry, index) => ({
      id: entry.id || `${record.id}-${index + 1}`,
      report_id: record.id,
      owner_id: uid,
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
    if (!rows.length) return;
    let result = await sb().from("hours_entries").insert(rows);
    if (result.error && isMissingColumn(result.error)) {
      result = await sb().from("hours_entries").insert(rows.map(({ hours_override, ...rest }) => rest));
    }
    fail(result.error, "No se pudieron guardar las jornadas.");
  }

  async function saveHours(record) {
    const uid = await requireOwnerId();
    record.updatedAt = record.updatedAt || new Date().toISOString();
    if (record.pdfBlob) record.pdfPath = record.pdfPath || `${uid}/${record.id}.pdf`;
    if (record.pdfBlob) await cacheBlob("hours", record.id, record.pdfHash, record.pdfBlob);
    rememberHours({ ...record, cloudSynced: false });
    await upsertHoursReport({
      id: record.id,
      owner_id: uid,
      job_address: record.jobAddress,
      report_date: record.reportDate,
      description: record.description || "",
      default_rate: Number(record.defaultRate) || 0,
      pdf_hash: record.pdfHash || null,
      pdf_path: record.pdfPath || null,
      pdf_name: record.pdfName || "",
      deleted_at: null,
      updated_at: record.updatedAt
    });
    await replaceHoursEntries(record, uid);
    record.cloudSynced = true;
    rememberHours(record);
    if (record.pdfBlob && record.pdfPath) {
      try { await upload("hours-pdfs", record.pdfPath, record.pdfBlob, "application/pdf"); }
      catch (error) { console.warn("Reporte guardado; el PDF quedó en este aparato.", error); }
    }
    return record;
  }

  let syncingHours = false;
  async function syncPendingHours() {
    if (syncingHours) return;
    syncingHours = true;
    try {
      const pending = readJson(HOURS_META).filter(item => item.id && item.cloudSynced === false);
      for (const item of pending) {
        try {
          item.pdfBlob = item.pdfBlob || await root.LocalCache.get("hours", item.id, item.pdfHash);
          await saveHours(item);
        } catch (error) {
          console.warn("Reporte pendiente no subió a la nube", item.id, error);
        }
      }
    } finally {
      syncingHours = false;
    }
  }

  async function addCheckPhoto(invoiceId, file, note = "") {
    if (!file) throw new Error("Selecciona una foto del cheque.");
    if (!/^image\/(jpeg|png|webp)$/i.test(file.type)) throw new Error("Usa una foto JPG, PNG o WebP.");
    if (file.size > 8 * 1024 * 1024) throw new Error("La foto del cheque supera 8 MB.");
    const uid = await requireOwnerId();
    const id = `check-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const ext = file.type.includes("png") ? "png" : file.type.includes("webp") ? "webp" : "jpg";
    const path = `${uid}/${invoiceId}/${id}.${ext}`;
    await upload("check-photos", path, file, file.type);
    await root.LocalCache.put("check", id, "", file);
    const row = { id, invoice_id: invoiceId, owner_id: uid, storage_path: path, file_name: file.name || `${id}.${ext}`, note: String(note || "").slice(0, 500), captured_at: new Date().toISOString() };
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

  function profileFrom(row, user) {
    return {
      id: row?.id || user?.id || ownerId(),
      displayName: row?.display_name || "Lilian",
      jobTitle: row?.job_title || "Secretaria",
      avatarPath: row?.avatar_path || null,
      createdAt: row?.created_at || user?.created_at || new Date().toISOString(),
      email: user?.email || currentUser?.email || ""
    };
  }

  async function getProfile() {
    const id = ownerId();
    const { data, error } = await sb().from("profiles").select("*").eq("id", id).maybeSingle();
    if (error) fail(error, "No se pudo leer el perfil.");
    if (!data) {
      const seed = { id, display_name: "Lilian" };
      const { error: insertError } = await sb().from("profiles").insert(seed);
      if (insertError && insertError.code !== "23505") fail(insertError, "No se pudo crear el perfil. Corre el SQL de supabase/schema-update-profile.sql");
    }
    const { data: row } = await sb().from("profiles").select("*").eq("id", id).maybeSingle();
    return profileFrom(row, currentUser);
  }

  async function saveProfile(profile) {
    const id = ownerId();
    const name = String(profile.displayName || "").trim() || "Lilian";
    const job = String(profile.jobTitle || "").trim() || "Secretaria";
    const row = { id, display_name: name, job_title: job };
    if (profile.avatarPath !== undefined) row.avatar_path = profile.avatarPath;
    let { error } = await sb().from("profiles").upsert(row);
    if (error && /job_title|avatar_path/i.test(`${error.message || ""} ${error.details || ""}`)) {
      const fallback = await sb().from("profiles").upsert({ id, display_name: name });
      if (fallback.error) fail(fallback.error, "No se pudo guardar el perfil.");
      throw new Error("Falta actualizar Supabase para foto y cargo. En SQL Editor pega supabase/schema-update-profile.sql y vuelve a guardar.");
    }
    fail(error, "No se pudo guardar el perfil.");
    return getProfile();
  }

  async function saveAvatar(file) {
    if (!file) throw new Error("Selecciona una foto de perfil.");
    if (!/^image\/(jpeg|png|webp)$/i.test(file.type)) throw new Error("Usa una foto JPG, PNG o WebP.");
    if (file.size > 6 * 1024 * 1024) throw new Error("La foto de perfil supera 6 MB.");
    const ext = file.type.includes("png") ? "png" : file.type.includes("webp") ? "webp" : "jpg";
    const path = `${ownerId()}/avatar.${ext}`;
    await upload("avatars", path, file, file.type);
    await root.LocalCache.put("avatar", ownerId(), "", file);
    const current = await getProfile();
    await saveProfile({ ...current, avatarPath: path });
    return { path, blob: file };
  }

  async function ensureAvatar(profile) {
    if (!profile?.avatarPath) return null;
    const cached = await root.LocalCache.get("avatar", ownerId());
    if (cached) return cached;
    try {
      const blob = await download("avatars", profile.avatarPath);
      if (blob) await root.LocalCache.put("avatar", ownerId(), "", blob);
      return blob;
    } catch (error) {
      console.warn("No se pudo descargar la foto de perfil", error);
      return null;
    }
  }

  root.CloudDB = {
    setUser(user) {
      currentUser = user;
      root.TrentonSupabase?.setSessionUser?.(user);
    },
    listInvoices,
    saveInvoice,
    saveMany,
    softDeleteInvoice,
    ensureInvoicePdf,
    nextInvoiceNumber,
    listHours,
    saveHours,
    ensureHoursPdf,
    syncPendingHours,
    addCheckPhoto,
    ensureCheckPhoto,
    removeCheckPhoto,
    getProfile,
    saveProfile,
    saveAvatar,
    ensureAvatar,
    download
  };
})(typeof globalThis !== "undefined" ? globalThis : this);

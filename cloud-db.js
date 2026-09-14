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
  function withTimeout(promise, ms, message) {
    let timer;
    return Promise.race([
      Promise.resolve(promise).finally(() => clearTimeout(timer)),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), ms);
      })
    ]);
  }
  const PROFILE_SNAP = "trenton.profile.snap";

  function authStorageKeys() {
    const keys = [];
    try {
      const ref = new URL(root.TrentonConfig.get().url).hostname.split(".")[0];
      keys.push(`sb-${ref}-auth-token`);
    } catch (_) { /* ignore */ }
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && /^sb-[\w-]+-auth-token$/.test(key) && !keys.includes(key)) keys.push(key);
      }
    } catch (_) { /* ignore */ }
    return keys;
  }
  function sessionFromRaw(raw) {
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const session = parsed?.currentSession?.access_token ? parsed.currentSession : parsed;
    if (!session?.access_token || !session?.user?.id) return null;
    return { session, parsed, wrapped: Boolean(parsed?.currentSession?.access_token) };
  }
  function readStoredSession() {
    try {
      for (const key of authStorageKeys()) {
        const found = sessionFromRaw(localStorage.getItem(key));
        if (found) {
          found.session._storageKey = key;
          found.session._wrapped = found.wrapped;
          found.session._parsed = found.parsed;
          return found.session;
        }
      }
    } catch (_) { /* ignore */ }
    return null;
  }
  function writeStoredSession(next) {
    if (!next?.access_token) return;
    try {
      const key = next._storageKey || authStorageKeys()[0];
      if (!key) return;
      const body = next._wrapped
        ? { ...next._parsed, currentSession: { ...next._parsed?.currentSession, ...next, user: next.user } }
        : {
            access_token: next.access_token,
            refresh_token: next.refresh_token,
            expires_at: next.expires_at,
            expires_in: next.expires_in,
            token_type: next.token_type || "bearer",
            user: next.user
          };
      localStorage.setItem(key, JSON.stringify(body));
    } catch (_) { /* ignore */ }
  }
  async function refreshStoredSession(session) {
    if (!session?.refresh_token) return session;
    const expiresAtMs = Number(session.expires_at || 0) * 1000;
    if (session.access_token && expiresAtMs && expiresAtMs > Date.now() + 20000) return session;
    const config = root.TrentonConfig.get();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch(`${config.url.replace(/\/$/, "")}/auth/v1/token?grant_type=refresh_token`, {
        method: "POST",
        headers: {
          apikey: config.anonKey,
          Authorization: `Bearer ${config.anonKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ refresh_token: session.refresh_token }),
        signal: controller.signal
      });
      if (!response.ok) return session;
      const data = await response.json();
      const next = {
        ...session,
        access_token: data.access_token || session.access_token,
        refresh_token: data.refresh_token || session.refresh_token,
        expires_at: data.expires_at || session.expires_at,
        expires_in: data.expires_in || session.expires_in,
        token_type: data.token_type || "bearer",
        user: data.user || session.user
      };
      writeStoredSession(next);
      currentUser = next.user;
      root.TrentonSupabase?.setSessionUser?.(next.user);
      return next;
    } catch (_) {
      return session;
    } finally {
      clearTimeout(timer);
    }
  }
  async function requireSession() {
    let stored = readStoredSession();
    if (stored?.user?.id) stored = await refreshStoredSession(stored);
    if (stored?.user?.id && stored.access_token) {
      currentUser = stored.user;
      root.TrentonSupabase?.setSessionUser?.(stored.user);
      return stored;
    }
    throw new Error("No hay sesión. Vuelve a entrar.");
  }
  async function requireUser() {
    return (await requireSession()).user;
  }
  async function requireOwnerId() {
    return (await requireUser()).id;
  }
  function readProfileSnap() {
    try {
      const snap = JSON.parse(localStorage.getItem(PROFILE_SNAP) || "null");
      return snap?.id ? snap : null;
    } catch (_) {
      return null;
    }
  }
  function persistProfileSnap(profile, extra = {}) {
    try {
      const id = extra.id || profile?.id || currentUser?.id;
      if (!id) return;
      const prev = readProfileSnap();
      const snap = {
        id,
        displayName: profile?.displayName || prev?.displayName || "",
        jobTitle: profile?.jobTitle || prev?.jobTitle || "",
        email: profile?.email || prev?.email || "",
        avatarPath: extra.avatarPath !== undefined ? extra.avatarPath : (profile?.avatarPath ?? prev?.avatarPath ?? null),
        avatarDataUrl: extra.avatarDataUrl !== undefined ? extra.avatarDataUrl : (prev?.avatarDataUrl || null),
        createdAt: profile?.createdAt || prev?.createdAt || "",
        savedAt: Date.now()
      };
      const json = JSON.stringify(snap);
      if (json.length > 3500000) snap.avatarDataUrl = extra.avatarDataUrl && extra.avatarDataUrl.length < 3500000 ? extra.avatarDataUrl : null;
      localStorage.setItem(PROFILE_SNAP, JSON.stringify(snap));
    } catch (error) {
      console.warn("No se pudo guardar la copia local del perfil", error);
    }
  }
  async function rest(path, options = {}) {
    let session = await requireSession();
    const config = root.TrentonConfig.get();
    const url = `${config.url.replace(/\/$/, "")}/rest/v1/${path}`;
    async function once(token) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10000);
      try {
        const response = await fetch(url, {
          method: options.method || "GET",
          headers: {
            Authorization: `Bearer ${token}`,
            apikey: config.anonKey,
            "Content-Type": "application/json",
            Prefer: options.prefer || "return=representation"
          },
          body: options.body != null ? JSON.stringify(options.body) : undefined,
          signal: controller.signal
        });
        const text = await response.text();
        let data = null;
        try { data = text ? JSON.parse(text) : null; } catch { data = text; }
        return { response, data, text };
      } finally {
        clearTimeout(timer);
      }
    }
    try {
      let { response, data, text } = await once(session.access_token);
      if (response.status === 401 && session.refresh_token) {
        session = await refreshStoredSession({ ...session, expires_at: 0 });
        if (session.access_token) ({ response, data, text } = await once(session.access_token));
      }
      if (!response.ok) {
        const msg = data?.message || data?.details || data?.hint || (typeof data === "string" ? data : text) || String(response.status);
        const error = new Error(String(msg).slice(0, 220));
        error.code = data?.code;
        error.status = response.status;
        throw error;
      }
      return data;
    } catch (error) {
      if (error.name === "AbortError") throw new Error("Supabase no respondió a tiempo.");
      throw error;
    }
  }
  function emailFromUser(user) {
    if (!user) return "";
    const identityEmail = (user.identities || [])
      .map(item => item?.identity_data?.email || item?.identity_data?.email_address)
      .find(Boolean);
    return String(
      user.email
      || user.new_email
      || user.user_metadata?.email
      || user.user_metadata?.email_address
      || identityEmail
      || ""
    ).trim();
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
    const result = await withTimeout(
      sb().storage.from(bucket).upload(path, blob, { upsert: true, contentType: type, cacheControl: "3600" }),
      20000,
      "La subida a la nube tardó demasiado. Revisa la conexión e intenta de nuevo."
    );
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
      id: row?.id || user?.id || currentUser?.id || "",
      displayName: row?.display_name || user?.user_metadata?.display_name || user?.user_metadata?.full_name || "Lilian",
      jobTitle: row?.job_title || "Secretaria",
      avatarPath: row?.avatar_path || null,
      createdAt: row?.created_at || user?.created_at || new Date().toISOString(),
      email: row?.email || emailFromUser(user) || emailFromUser(currentUser)
    };
  }

  function avatarMime(file) {
    const type = String(file?.type || "").toLowerCase();
    const name = String(file?.name || "").toLowerCase();
    if (type === "image/png" || name.endsWith(".png")) return "image/png";
    if (type === "image/webp" || name.endsWith(".webp")) return "image/webp";
    return "image/jpeg";
  }

  async function clonePickedFile(file) {
    if (!file) throw new Error("Selecciona una foto de perfil.");
    if (file.size > 12 * 1024 * 1024) throw new Error("La foto pesa demasiado. Elige otra más liviana.");
    const mime = avatarMime(file);
    const name = file.name || "avatar.jpg";
    const buffer = await withTimeout(file.arrayBuffer(), 8000, "El teléfono no soltó la foto. Tómalo de nuevo o usa la cámara.");
    return new File([buffer], name, { type: mime });
  }

  async function shrinkAvatar(file) {
    const source = file instanceof Blob ? file : await clonePickedFile(file);
    if (typeof createImageBitmap !== "function") {
      if (source.size <= 250000) return source;
      throw new Error("Este navegador no pudo preparar la foto. Prueba en Chrome o Safari.");
    }
    let bitmap;
    try {
      bitmap = await withTimeout(createImageBitmap(source), 4000, "No se pudo abrir la foto.");
    } catch (error) {
      if (source.size <= 250000) return source;
      throw new Error("No se pudo leer esa foto. Toma una con la cámara.");
    }
    try {
      const max = 384;
      const scale = Math.min(1, max / Math.max(bitmap.width || 1, bitmap.height || 1));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round((bitmap.width || max) * scale));
      canvas.height = Math.max(1, Math.round((bitmap.height || max) * scale));
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const blob = await withTimeout(new Promise((resolve, reject) => {
        canvas.toBlob(result => result ? resolve(result) : reject(new Error("bad-image")), "image/jpeg", 0.72);
      }), 4000, "No se pudo preparar la foto.");
      return blob;
    } finally {
      try { bitmap.close(); } catch (_) { /* ignore */ }
    }
  }

  function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(reader.error || new Error("No se pudo leer la foto."));
      reader.readAsDataURL(blob);
    });
  }

  async function dataUrlToBlob(url) {
    const response = await fetch(url);
    return response.blob();
  }

  async function storageFetch(path, options = {}) {
    const session = await requireSession();
    const config = root.TrentonConfig.get();
    const endpoint = `${config.url.replace(/\/$/, "")}/storage/v1/object/${path}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeout || 12000);
    try {
      const response = await fetch(endpoint, {
        method: options.method || "GET",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          apikey: config.anonKey,
          ...(options.headers || {})
        },
        body: options.body,
        signal: controller.signal
      });
      return response;
    } catch (error) {
      if (error.name === "AbortError") throw new Error(options.timeoutMessage || "Storage no respondió.");
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  async function uploadAvatarFetch(path, blob, mime) {
    const headers = {
      "Content-Type": mime || "image/jpeg",
      "x-upsert": "true",
      "cache-control": "3600"
    };
    let response = await storageFetch(`avatars/${path}`, { method: "POST", headers, body: blob, timeoutMessage: "La subida a Storage se trabó." });
    if (!response.ok && (response.status === 409 || response.status === 400 || response.status === 405)) {
      response = await storageFetch(`avatars/${path}`, { method: "PUT", headers, body: blob, timeoutMessage: "La subida a Storage se trabó." });
    }
    if (!response.ok) {
      const text = await response.text();
      throw new Error(text.slice(0, 180) || `Storage ${response.status}`);
    }
    return path;
  }

  async function downloadAvatarFetch(path) {
    const config = root.TrentonConfig.get();
    const base = config.url.replace(/\/$/, "");
    const publicUrl = `${base}/storage/v1/object/public/avatars/${path}`;
    try {
      const publicResponse = await fetch(`${publicUrl}?t=${Date.now()}`, { cache: "no-store" });
      if (publicResponse.ok) return publicResponse.blob();
    } catch (_) { /* bucket privado: seguir con JWT */ }
    const response = await storageFetch(`avatars/${path}`, { method: "GET", timeout: 10000, timeoutMessage: "No se pudo bajar la foto de la nube." });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(text.slice(0, 180) || `Storage ${response.status}`);
    }
    return response.blob();
  }

  function rowFrom(data) {
    return Array.isArray(data) ? data[0] : data;
  }

  async function writeAvatarPath(user, storedPath) {
    const id = user.id;
    const body = { avatar_path: storedPath };
    let row = rowFrom(await rest(`profiles?id=eq.${encodeURIComponent(id)}`, { method: "PATCH", body }));
    if (!row?.avatar_path) {
      row = rowFrom(await rest("profiles?on_conflict=id", {
        method: "POST",
        body: {
          id,
          display_name: user.user_metadata?.display_name || "Lilian",
          avatar_path: storedPath
        },
        prefer: "return=representation,resolution=merge-duplicates"
      }));
    }
    const check = rowFrom(await rest(`profiles?id=eq.${encodeURIComponent(id)}&select=id,avatar_path`));
    if (!check?.avatar_path) {
      throw new Error("La foto no quedó en la base de datos. Corre supabase/schema-update-profile.sql y vuelve a entrar.");
    }
    return check.avatar_path;
  }

  async function getProfile() {
    const user = (await requireSession()).user;
    const id = user.id;
    const email = emailFromUser(user);
    let row = null;
    try {
      const rows = await rest(`profiles?id=eq.${encodeURIComponent(id)}&select=*`);
      row = rowFrom(rows);
    } catch (error) {
      if (!isMissingColumn(error)) throw error;
      const rows = await rest(`profiles?id=eq.${encodeURIComponent(id)}&select=id,display_name,created_at`);
      row = rowFrom(rows);
    }
    if (!row) {
      try {
        const inserted = await rest("profiles", {
          method: "POST",
          body: { id, display_name: user.user_metadata?.display_name || "Lilian", email }
        });
        row = rowFrom(inserted);
      } catch (error) {
        if (error.code !== "23505" && !/duplicate/i.test(error.message || "")) {
          const inserted = await rest("profiles", {
            method: "POST",
            body: { id, display_name: user.user_metadata?.display_name || "Lilian" }
          });
          row = rowFrom(inserted);
        }
      }
    } else if (email && !row.email) {
      try {
        await rest(`profiles?id=eq.${encodeURIComponent(id)}`, { method: "PATCH", body: { email } });
        row = { ...row, email };
      } catch (_) { /* columna email puede faltar */ }
    }
    const profile = profileFrom(row, user);
    persistProfileSnap(profile);
    return profile;
  }

  async function saveProfile(profile) {
    const user = (await requireSession()).user;
    const id = user.id;
    const name = String(profile.displayName || "").trim() || "Lilian";
    const job = String(profile.jobTitle || "").trim() || "Secretaria";
    const email = emailFromUser(user) || String(profile.email || "").trim();
    const year = Number(profile.memberYear || String(profile.createdAt || "").slice(0, 4));
    const body = { display_name: name, job_title: job, email };
    if (profile.avatarPath) body.avatar_path = profile.avatarPath;
    const bodyWithYear = year >= 1990 && year <= 2099 ? { ...body, created_at: `${year}-01-01T12:00:00.000Z` } : body;
    async function patch(payload) {
      let row = rowFrom(await rest(`profiles?id=eq.${encodeURIComponent(id)}`, { method: "PATCH", body: payload }));
      if (!row?.id) {
        row = rowFrom(await rest("profiles?on_conflict=id", {
          method: "POST",
          body: { id, ...payload },
          prefer: "return=representation,resolution=merge-duplicates"
        }));
      }
      return row;
    }
    try {
      await patch(bodyWithYear);
    } catch (_yearError) {
      try {
        await patch(body);
      } catch (error) {
        if (!isMissingColumn(error)) throw error;
        const fallback = { display_name: name };
        if (email) fallback.email = email;
        if (profile.avatarPath) fallback.avatar_path = profile.avatarPath;
        try {
          await patch(fallback);
        } catch (inner) {
          if (!isMissingColumn(inner)) throw inner;
          await patch({ display_name: name });
        }
        throw new Error("Se guardó el nombre. Corre supabase/schema-update-profile.sql para poder guardar cargo y año.");
      }
    }
    const saved = await getProfile();
    if (saved.displayName !== name) throw new Error("El nombre no quedó en la base de datos. Vuelve a entrar e intenta de nuevo.");
    if (saved.jobTitle && saved.jobTitle !== job && body.job_title) {
      throw new Error("El cargo no quedó en la base de datos. Corre supabase/schema-update-profile.sql y vuelve a guardar.");
    }
    persistProfileSnap(saved);
    return saved;
  }

  async function saveAvatar(file) {
    const user = (await requireSession()).user;
    const blob = await shrinkAvatar(file);
    const path = `${user.id}/avatar.jpg`;
    let storedPath = path;
    let uploaded = false;
    try {
      await uploadAvatarFetch(path, blob, "image/jpeg");
      uploaded = true;
    } catch (error) {
      console.warn("Storage de avatares no respondió, se guarda en el perfil.", error);
    }
    const dataUrl = await blobToDataUrl(blob);
    if (!uploaded) {
      if (dataUrl.length > 180000) throw new Error("La foto sigue siendo muy pesada. Toma otra más cercana o con menos zoom.");
      storedPath = dataUrl;
    }
    try {
      await withTimeout(root.LocalCache.put("avatar", user.id, "", blob), 2500, "cache");
    } catch (error) {
      console.warn("La foto no quedó en la caché local", error);
    }
    persistProfileSnap({ id: user.id, avatarPath: storedPath }, { id: user.id, avatarPath: storedPath, avatarDataUrl: dataUrl });
    try {
      storedPath = await writeAvatarPath(user, storedPath);
    } catch (error) {
      throw new Error(error.message || "La foto se vio aquí, pero no se pudo guardar en la nube.");
    }
    persistProfileSnap({ id: user.id, avatarPath: storedPath }, { id: user.id, avatarPath: storedPath, avatarDataUrl: dataUrl });
    return { path: storedPath, blob };
  }

  async function ensureAvatar(profile) {
    const id = currentUser?.id || profile?.id || root.TrentonSupabase.userId();
    const path = profile?.avatarPath || readProfileSnap()?.avatarPath || "";
    if (path) {
      try {
        const blob = path.startsWith("data:") ? await dataUrlToBlob(path) : await downloadAvatarFetch(path);
        if (blob && id) {
          try { await root.LocalCache.put("avatar", id, "", blob); } catch (_) { /* ignore */ }
          const dataUrl = path.startsWith("data:") ? path : await blobToDataUrl(blob);
          persistProfileSnap(profile, { id, avatarPath: path, avatarDataUrl: dataUrl });
        }
        if (blob) return blob;
      } catch (error) {
        console.warn("No se pudo bajar la foto de la nube", error);
      }
    }
    try {
      const cached = id ? await root.LocalCache.get("avatar", id) : null;
      if (cached) return cached;
    } catch (_) { /* ignore */ }
    const snap = readProfileSnap();
    if (snap?.avatarDataUrl && (!id || snap.id === id)) {
      try { return await dataUrlToBlob(snap.avatarDataUrl); }
      catch (_) { /* ignore */ }
    }
    return null;
  }

  root.CloudDB = {
    setUser(user) {
      currentUser = user;
      root.TrentonSupabase?.setSessionUser?.(user);
    },
    readProfileSnap,
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

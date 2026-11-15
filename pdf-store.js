/* PDF editor storage: documents (original, working state, versions), signatures and templates.
   Local first (IndexedDB through LocalCache) so nothing is lost offline, then synced to the
   user's private folder in Supabase Storage. Originals are never overwritten. */
window.PdfStore = (function () {
  "use strict";
  const DOC_BUCKET = "invoice-pdfs";   // PDFs and JSON
  const IMG_BUCKET = "check-photos";   // signature and image files
  const cloud = () => window.CloudDB;
  const company = () => window.CompanyApp?.id?.() || "trenton";
  const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
  const now = () => new Date().toISOString();
  const jsonBlob = value => new Blob([JSON.stringify(value)], { type: "application/json" });
  const readJson = async blob => { try { return blob ? JSON.parse(await blob.text()) : null; } catch (_) { return null; } };

  /* ---------- status (shown in the editor) ---------- */
  const listeners = new Set();
  let pending = 0, cloudFailed = false;
  function emit(state) { listeners.forEach(fn => { try { fn(state); } catch (_) {} }); }
  function onStatus(fn) { listeners.add(fn); return () => listeners.delete(fn); }

  /* ---------- low level: local + cloud ---------- */
  const localKey = path => `${path}`;
  async function localPut(path, blob) { try { await window.LocalCache.put("ed", localKey(path), "", blob); } catch (_) {} }
  async function localGet(path) { try { return await window.LocalCache.get("ed", localKey(path)); } catch (_) { return null; } }
  async function localRemove(path) { try { await window.LocalCache.remove("ed", localKey(path)); } catch (_) {} }

  // Cloud writes that failed are kept and retried later (on the next save or when back online).
  const retry = new Map();
  async function cloudPut(bucket, path, blob, type) {
    pending++; emit("saving");
    try {
      await cloud().userFilePut(bucket, path, blob, type);
      retry.delete(`${bucket}|${path}`);
      cloudFailed = false;
      return true;
    } catch (error) {
      console.warn("Editor PDF: guardado en la nube pendiente", path, error);
      retry.set(`${bucket}|${path}`, { bucket, path, blob, type });
      cloudFailed = true;
      return false;
    } finally {
      pending--;
      if (!pending) emit(cloudFailed ? "local" : "saved");
    }
  }
  async function cloudGet(bucket, path) {
    try { return await cloud().userFileGet(bucket, path); } catch (_) { return null; }
  }
  async function flushRetries() {
    for (const item of [...retry.values()]) await cloudPut(item.bucket, item.path, item.blob, item.type);
  }
  window.addEventListener("online", () => flushRetries());

  async function put(bucket, path, blob, type) {
    await localPut(path, blob);
    return cloudPut(bucket, path, blob, type);
  }
  async function get(bucket, path) {
    const local = await localGet(path);
    if (local) return local;
    const remote = await cloudGet(bucket, path);
    if (remote) await localPut(path, remote);
    return remote;
  }
  async function remove(bucket, path) {
    await localRemove(path);
    try { await cloud().userFileRemove(bucket, path); } catch (_) {}
  }

  /* ---------- indexes (merged local + cloud, deletions remembered) ---------- */
  function mergeIndex(a, b) {
    const deleted = new Set([...(a?.deleted || []), ...(b?.deleted || [])]);
    const items = new Map();
    [...(a?.items || []), ...(b?.items || [])].forEach(item => {
      if (deleted.has(item.id)) return;
      const old = items.get(item.id);
      if (!old || String(item.updatedAt) > String(old.updatedAt)) items.set(item.id, item);
    });
    return { items: [...items.values()], deleted: [...deleted].slice(-500) };
  }
  const indexCache = new Map();
  async function loadIndex(path) {
    const local = await readJson(await localGet(path));
    const remote = await readJson(await cloudGet(DOC_BUCKET, path));
    const merged = mergeIndex(local, remote);
    indexCache.set(path, merged);
    // Bring the other side up to date when they differ.
    const text = JSON.stringify(merged);
    if (JSON.stringify(local) !== text) await localPut(path, jsonBlob(merged));
    if (remote && JSON.stringify(remote) !== text) await cloudPut(DOC_BUCKET, path, jsonBlob(merged), "application/json");
    return merged;
  }
  async function saveIndex(path, index) {
    indexCache.set(path, index);
    await put(DOC_BUCKET, path, jsonBlob(index), "application/json");
  }
  async function editIndex(path, change) {
    const index = indexCache.get(path) || await loadIndex(path);
    change(index);
    await saveIndex(path, index);
    return index;
  }

  /* ---------- documents ---------- */
  const docsIndexPath = () => `editor/${company()}/index.json`;
  const docPath = (id, file) => `editor/${company()}/${id}/${file}`;

  async function listDocs() { return (await loadIndex(docsIndexPath())).items.sort((x, y) => String(y.updatedAt).localeCompare(String(x.updatedAt))); }
  async function getDoc(id) { return (indexCache.get(docsIndexPath()) || await loadIndex(docsIndexPath())).items.find(d => d.id === id) || null; }
  async function createDoc(pdfBlob, meta) {
    const id = uid(), at = now();
    const doc = { id, name: meta.name || "Documento.pdf", createdAt: at, updatedAt: at, pages: meta.pages || 0, size: pdfBlob.size, status: "original", link: meta.link || null, versions: [] };
    await put(DOC_BUCKET, docPath(id, "original.pdf"), pdfBlob, "application/pdf");
    await editIndex(docsIndexPath(), index => { index.items.push(doc); });
    return doc;
  }
  async function updateDoc(id, patch) {
    let updated = null;
    await editIndex(docsIndexPath(), index => {
      const doc = index.items.find(d => d.id === id);
      if (!doc) return;
      Object.assign(doc, patch, { updatedAt: now() });
      updated = { ...doc };
    });
    return updated;
  }
  const getOriginal = id => get(DOC_BUCKET, docPath(id, "original.pdf"));
  async function getState(id) { return readJson(await get(DOC_BUCKET, docPath(id, "state.json"))); }
  // Working state: saved locally at once, to the cloud a moment later (several edits become one upload).
  const stateTimers = new Map();
  async function saveState(id, state) {
    const blob = jsonBlob(state), path = docPath(id, "state.json");
    await localPut(path, blob);
    emit("saving");
    clearTimeout(stateTimers.get(id));
    stateTimers.set(id, setTimeout(async () => {
      stateTimers.delete(id);
      await cloudPut(DOC_BUCKET, path, blob, "application/json");
      await updateDoc(id, { status: "editado", pages: state.pages?.length || 0 });
    }, 1500));
  }
  async function flushState(id) {
    if (!stateTimers.has(id)) return;
    clearTimeout(stateTimers.get(id));
    stateTimers.delete(id);
    const blob = await localGet(docPath(id, "state.json"));
    if (blob) await cloudPut(DOC_BUCKET, docPath(id, "state.json"), blob, "application/json");
  }
  async function saveVersion(id, pdfBlob, state, note) {
    const doc = await getDoc(id);
    const n = (doc?.versions?.reduce((m, v) => Math.max(m, v.n), 0) || 0) + 1;
    await put(DOC_BUCKET, docPath(id, `v${n}.pdf`), pdfBlob, "application/pdf");
    await put(DOC_BUCKET, docPath(id, `v${n}.json`), jsonBlob(state), "application/json");
    const version = { n, at: now(), size: pdfBlob.size, note: note || "" };
    await updateDoc(id, { versions: [...(doc?.versions || []), version], status: "editado", pages: state.pages?.length || doc?.pages || 0 });
    return version;
  }
  const getVersionPdf = (id, n) => get(DOC_BUCKET, docPath(id, `v${n}.pdf`));
  async function getVersionState(id, n) { return readJson(await get(DOC_BUCKET, docPath(id, `v${n}.json`))); }
  async function deleteDoc(id) {
    const doc = await getDoc(id);
    await editIndex(docsIndexPath(), index => {
      index.items = index.items.filter(d => d.id !== id);
      index.deleted = [...(index.deleted || []), id];
    });
    const files = ["original.pdf", "state.json", ...(doc?.versions || []).flatMap(v => [`v${v.n}.pdf`, `v${v.n}.json`])];
    for (const file of files) await remove(DOC_BUCKET, docPath(id, file));
  }
  async function duplicateDoc(id) {
    const doc = await getDoc(id);
    const original = await getOriginal(id);
    if (!doc || !original) throw new Error("No se encontró el documento.");
    const copy = await createDoc(original, { name: doc.name.replace(/(\.pdf)?$/i, " (copia).pdf"), pages: doc.pages, link: doc.link });
    const state = await getState(id);
    if (state) await saveState(copy.id, state);
    return copy;
  }

  /* ---------- images placed in documents (logos, photos) ---------- */
  const imgPath = key => `editor/${company()}/img/${key}`;
  async function putImage(blob) {
    const key = uid();
    await put(IMG_BUCKET, imgPath(key), blob, blob.type || "image/png");
    return key;
  }
  const getImage = key => get(IMG_BUCKET, imgPath(key));

  /* ---------- signatures (shared by both companies: they are Rubén's) ---------- */
  const SIG_INDEX = "firmas/index.json";
  const sigFile = (id, kind) => `firmas/${id}${kind === "original" ? "-original" : ""}`;
  async function listSignatures() { return (await loadIndex(SIG_INDEX)).items.sort((a, b) => (b.isDefault - a.isDefault) || String(a.createdAt).localeCompare(String(b.createdAt))); }
  async function addSignature({ blob, original, name }) {
    const id = uid(), at = now();
    const list = await listSignatures();
    await put(IMG_BUCKET, sigFile(id), blob, "image/png");
    if (original) await put(IMG_BUCKET, sigFile(id, "original"), original, original.type || "image/png");
    const sig = { id, name: name || "Firma de Rubén", isDefault: !list.length, createdAt: at, updatedAt: at, version: 1 };
    await editIndex(SIG_INDEX, index => { index.items.push(sig); });
    return sig;
  }
  async function updateSignature(id, patch) {
    await editIndex(SIG_INDEX, index => {
      if (patch.isDefault) index.items.forEach(s => { s.isDefault = false; s.updatedAt = now(); });
      const sig = index.items.find(s => s.id === id);
      if (sig) Object.assign(sig, patch, { updatedAt: now() });
    });
  }
  async function replaceSignature(id, blob, original) {
    await put(IMG_BUCKET, sigFile(id), blob, "image/png");
    if (original) await put(IMG_BUCKET, sigFile(id, "original"), original, original.type || "image/png");
    const sig = (await listSignatures()).find(s => s.id === id);
    await updateSignature(id, { version: (sig?.version || 1) + 1 });
  }
  async function removeSignature(id) {
    let wasDefault = false;
    await editIndex(SIG_INDEX, index => {
      wasDefault = Boolean(index.items.find(s => s.id === id)?.isDefault);
      index.items = index.items.filter(s => s.id !== id);
      index.deleted = [...(index.deleted || []), id];
      if (wasDefault && index.items[0]) { index.items[0].isDefault = true; index.items[0].updatedAt = now(); }
    });
    await remove(IMG_BUCKET, sigFile(id));
    await remove(IMG_BUCKET, sigFile(id, "original"));
  }
  const getSignature = (id, kind) => get(IMG_BUCKET, sigFile(id, kind));

  /* ---------- templates (stamps, frequent texts, logos, blocks) ---------- */
  const TPL_INDEX = "plantillas/index.json";
  async function listTemplates() { return (await loadIndex(TPL_INDEX)).items; }
  async function addTemplate(template) {
    const item = { ...template, id: uid(), createdAt: now(), updatedAt: now() };
    await editIndex(TPL_INDEX, index => { index.items.push(item); });
    return item;
  }
  async function removeTemplate(id) {
    await editIndex(TPL_INDEX, index => { index.items = index.items.filter(t => t.id !== id); index.deleted = [...(index.deleted || []), id]; });
  }

  return {
    onStatus, flushRetries,
    listDocs, getDoc, createDoc, updateDoc, getOriginal, getState, saveState, flushState, saveVersion, getVersionPdf, getVersionState, deleteDoc, duplicateDoc,
    putImage, getImage,
    listSignatures, addSignature, updateSignature, replaceSignature, removeSignature, getSignature,
    listTemplates, addTemplate, removeTemplate
  };
})();

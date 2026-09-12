/* IndexedDB only caches PDF and photo blobs. Postgres is the source of truth. */
(function (root) {
  "use strict";
  const DB_NAME = "trenton-control-cache";
  const DB_VERSION = 1;
  const STORE = "blobs";
  let db;

  function open() {
    return new Promise((resolve, reject) => {
      if (db) return resolve(db);
      if (!root.indexedDB) return reject(new Error("IndexedDB no disponible"));
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(STORE)) database.createObjectStore(STORE, { keyPath: "key" });
      };
      request.onsuccess = () => { db = request.result; resolve(db); };
      request.onerror = () => reject(request.error || new Error("No se pudo abrir la caché local"));
    });
  }

  function keyFor(kind, id) { return `${kind}:${id}`; }

  function transact(mode, action) {
    return new Promise((resolve, reject) => {
      try {
        const tx = db.transaction(STORE, mode);
        const request = action(tx.objectStore(STORE));
        tx.oncomplete = () => resolve(request?.result);
        tx.onerror = () => reject(tx.error || request?.error);
        tx.onabort = () => reject(tx.error || new Error("Caché interrumpida"));
      } catch (error) { reject(error); }
    });
  }

  root.LocalCache = {
    open,
    async get(kind, id, hash) {
      await open();
      const row = await transact("readonly", store => store.get(keyFor(kind, id)));
      if (!row?.blob) return null;
      if (hash && row.hash && row.hash !== hash) return null;
      return row.blob;
    },
    async put(kind, id, hash, blob) {
      if (!blob) return;
      await open();
      await transact("readwrite", store => store.put({ key: keyFor(kind, id), hash: hash || "", blob, updatedAt: new Date().toISOString() }));
    },
    async remove(kind, id) {
      await open();
      await transact("readwrite", store => store.delete(keyFor(kind, id)));
    }
  };

  root.LegacyLocal = {
    async readAll() {
      if (!root.indexedDB) return { invoices: [], hours: [] };
      const database = await new Promise((resolve) => {
        const request = indexedDB.open("trenton-control-db");
        request.onerror = () => resolve(null);
        request.onsuccess = () => resolve(request.result);
        request.onupgradeneeded = () => {};
      });
      if (!database) return { invoices: [], hours: [] };
      const read = (name) => new Promise((resolve) => {
        if (!database.objectStoreNames.contains(name)) return resolve([]);
        const tx = database.transaction(name, "readonly");
        const request = tx.objectStore(name).getAll();
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => resolve([]);
      });
      const invoices = await read("invoices");
      const hours = await read("hoursReports");
      try { database.close(); } catch (_) { /* ignore */ }
      return { invoices, hours };
    }
  };

  function asNamedFile(blob, name) {
    const fileName = name || "documento.pdf";
    const zip = /\.zip$/i.test(fileName);
    const type = zip ? "application/zip" : (blob.type && blob.type !== "application/octet-stream" ? blob.type : "application/pdf");
    return blob instanceof File ? blob : new File([blob], fileName, { type });
  }

  async function saveBlob(blob, name, options = {}) {
    if (!blob) throw new Error("No hay archivo para descargar.");
    const file = asNamedFile(blob, name);
    const wantShare = options.share === true;
    if (wantShare && navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: file.name });
        return "shared";
      } catch (error) {
        if (error.name === "AbortError") return "cancelled";
      }
    }
    const url = URL.createObjectURL(file);
    const link = document.createElement("a");
    link.href = url;
    link.download = file.name;
    link.rel = "noopener";
    link.style.display = "none";
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    return "download";
  }

  root.TrentonFiles = { saveBlob, asNamedFile };
})(typeof globalThis !== "undefined" ? globalThis : this);

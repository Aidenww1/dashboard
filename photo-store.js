/* ============================================================
   LifeOSPhotos — IndexedDB blob store for photos.
   Photos as base64 in localStorage overflow the ~5-10MB quota
   after a few months of weekly sets (a data-loss bug: saves
   start failing). IndexedDB has a far larger quota and keeps the
   heavy image bytes out of localStorage entirely.

   API (all async, Promise-based):
     LifeOSPhotos.put(id, dataUrl)  -> Promise<void>
     LifeOSPhotos.get(id)           -> Promise<string|null>
     LifeOSPhotos.getMany(ids)      -> Promise<{ [id]: string }>
     LifeOSPhotos.del(id)           -> Promise<void>
     LifeOSPhotos.has(id)           -> Promise<boolean>

   Photos are device-local (IndexedDB is per-origin, per-device).
   These stores are already excluded from the cloud backup
   (too big), so nothing cross-device regresses by living here.
   ============================================================ */
(function () {
  'use strict';
  if (window.LifeOSPhotos) return;

  var DB_NAME = 'lifeos-photos';
  var STORE = 'photos';
  var dbPromise = null;

  function open() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(function (resolve, reject) {
      if (!('indexedDB' in window)) { reject(new Error('no-indexeddb')); return; }
      var req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
    return dbPromise;
  }

  function tx(mode, fn) {
    return open().then(function (db) {
      return new Promise(function (resolve, reject) {
        var t = db.transaction(STORE, mode);
        var store = t.objectStore(STORE);
        var out = fn(store);
        t.oncomplete = function () { resolve(out && out.result !== undefined ? out.result : undefined); };
        t.onerror = function () { reject(t.error); };
        t.onabort = function () { reject(t.error || new Error('aborted')); };
      });
    });
  }

  // Strip metadata (EXIF, incl. GPS coordinates) by re-encoding the pixels
  // through a canvas -- canvas export carries no EXIF. createImageBitmap with
  // imageOrientation:'from-image' bakes the EXIF orientation into the pixels
  // first, so stripping the tag does not leave the photo sideways. This is the
  // trust boundary: a photo is sanitized once, on the way into the store, so
  // every copy that ever leaves the device (share, future upload) is clean.
  function sanitize(dataUrl) {
    if (typeof dataUrl !== 'string' || dataUrl.indexOf('data:image/') !== 0) {
      return Promise.resolve(dataUrl); // not a raster image (e.g. data:image/svg or a ref) -> leave as-is
    }
    return fetch(dataUrl).then(function (r) { return r.blob(); }).then(function (blob) {
      var bitmapP = (typeof createImageBitmap === 'function')
        ? createImageBitmap(blob, { imageOrientation: 'from-image' }).catch(function () { return createImageBitmap(blob); })
        : Promise.reject(new Error('no-createImageBitmap'));
      return bitmapP.then(function (bmp) {
        var c = document.createElement('canvas');
        c.width = bmp.width; c.height = bmp.height;
        c.getContext('2d').drawImage(bmp, 0, 0);
        if (bmp.close) bmp.close();
        // Re-encode as JPEG (the source camera format); PNG would balloon size.
        return c.toDataURL('image/jpeg', 0.92);
      });
    }).catch(function () {
      // Decode/encode failed: keep the original rather than lose the photo.
      // Photos are device-local IndexedDB, so an un-stripped local copy is the
      // lesser harm than dropping the user's data.
      return dataUrl;
    });
  }

  window.LifeOSPhotos = {
    sanitize: sanitize,
    put: function (id, dataUrl) {
      return sanitize(dataUrl).then(function (clean) {
        return tx('readwrite', function (s) { s.put(clean, id); });
      }).then(function () {});
    },
    get: function (id) {
      return open().then(function (db) {
        return new Promise(function (resolve) {
          var r = db.transaction(STORE, 'readonly').objectStore(STORE).get(id);
          r.onsuccess = function () { resolve(r.result != null ? r.result : null); };
          r.onerror = function () { resolve(null); };
        });
      }).catch(function () { return null; });
    },
    getMany: function (ids) {
      return open().then(function (db) {
        return new Promise(function (resolve) {
          var t = db.transaction(STORE, 'readonly');
          var store = t.objectStore(STORE);
          var out = {};
          (ids || []).forEach(function (id) {
            var r = store.get(id);
            r.onsuccess = function () { if (r.result != null) out[id] = r.result; };
          });
          t.oncomplete = function () { resolve(out); };
          t.onerror = function () { resolve(out); };
        });
      }).catch(function () { return {}; });
    },
    del: function (id) {
      return tx('readwrite', function (s) { s.delete(id); }).then(function () {}).catch(function () {});
    },
    has: function (id) {
      return this.get(id).then(function (v) { return v != null; });
    },
  };
})();

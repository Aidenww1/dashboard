/* Centralized compatibility storage for legacy keys still read by older pages. */
(function (root) {
  'use strict';
  if (root.LifeOSCompatibilityStore) return;
  function read(key, fallback) {
    try { var raw = root.localStorage.getItem(key); if (raw == null) return fallback; var parsed = JSON.parse(raw); return parsed == null ? fallback : parsed; }
    catch (_) { return fallback; }
  }
  function changed(key, operation) {
    try { root.dispatchEvent(new root.CustomEvent('lifeos:compatibility-write', { detail: { key: key, operation: operation } })); } catch (_) {}
  }
  function set(key, value) { root.localStorage.setItem(key, JSON.stringify(value)); changed(key, 'set'); return value; }
  function remove(key) { root.localStorage.removeItem(key); changed(key, 'remove'); }
  function clear() { root.localStorage.clear(); changed('*', 'clear'); }
  root.LifeOSCompatibilityStore = Object.freeze({ get: read, set: set, remove: remove, clear: clear });
})(typeof globalThis !== 'undefined' ? globalThis : this);

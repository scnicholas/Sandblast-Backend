"use strict";

(function attachLingoSentinelPublicLanguagePreferences(globalScope) {
  const VERSION = "lingosentinel.publicLanguagePreferences/12.0-explicit-only";
  const STORAGE_KEY = "lingosentinel.languagePreferences.v1";
  const ROOM_PREFIX = "lingosentinel.roomLanguagePreferences.v1.";
  const LANGUAGES = Object.freeze(["en", "fr", "es", "zh", "pt"]);
  const FORMALITIES = Object.freeze(["neutral", "formal", "informal"]);
  const DISPLAY_MODES = Object.freeze(["original", "translation", "both"]);
  const listeners = new Set();
  let memoryGlobal = null;
  const memoryRooms = new Map();

  function clean(value) { return String(value == null ? "" : value).trim(); }
  function storage(kind) {
    try { return globalScope && globalScope[kind] ? globalScope[kind] : null; }
    catch (_) { return null; }
  }
  function language(value, fallback) {
    const raw = clean(value).toLowerCase().replace(/_/g, "-");
    const aliases = { english: "en", eng: "en", french: "fr", francais: "fr", français: "fr", spanish: "es", espanol: "es", español: "es", chinese: "zh", mandarin: "zh", portuguese: "pt" };
    const base = aliases[raw] || raw.split("-")[0];
    return LANGUAGES.includes(base) ? base : (fallback || "en");
  }
  function locale(value, lang) {
    const raw = clean(value).replace(/_/g, "-");
    if (!raw) return "";
    if (!/^[a-zA-Z]{2,3}(?:-[a-zA-Z]{2}|-[0-9]{3})?$/.test(raw)) return "";
    const normalized = raw.split("-").map(function (part, index) { return index === 0 ? part.toLowerCase() : part.toUpperCase(); }).join("-");
    return normalized.toLowerCase().startsWith(language(lang, "en") + "-") || normalized.toLowerCase() === language(lang, "en") ? normalized : "";
  }
  function terms(value) {
    const source = Array.isArray(value) ? value : [];
    return Array.from(new Set(["Marion", "LingoSentinel", "Sandblast"].concat(source).map(clean).filter(Boolean)))
      .map(function (item) { return item.replace(/[\u0000-\u001f\u007f<>]/g, "").slice(0, 80); })
      .filter(Boolean).slice(0, 25);
  }
  function normalize(input) {
    const value = input && typeof input === "object" ? input : {};
    const sourceLanguage = language(value.sourceLanguage || value.source || "en", "en");
    const targetLanguage = language(value.targetLanguage || value.target || sourceLanguage, sourceLanguage);
    const formality = FORMALITIES.includes(clean(value.formality).toLowerCase()) ? clean(value.formality).toLowerCase() : "neutral";
    const displayMode = DISPLAY_MODES.includes(clean(value.displayMode).toLowerCase()) ? clean(value.displayMode).toLowerCase() : "both";
    return Object.freeze({
      contract: "lingosentinel.languagePreferences/1.0",
      sourceLanguage,
      targetLanguage,
      locale: locale(value.locale, targetLanguage),
      formality,
      displayMode,
      protectedTerms: Object.freeze(terms(value.protectedTerms || value.preserve)),
      translationRequested: sourceLanguage !== targetLanguage,
      explicitOnly: true,
      inferredFromLocation: false,
      updatedAt: clean(value.updatedAt) || new Date().toISOString()
    });
  }
  function readJson(store, key) {
    try { const parsed = JSON.parse(String(store && store.getItem(key) || "")); return parsed && typeof parsed === "object" ? parsed : null; }
    catch (_) { return null; }
  }
  function writeJson(store, key, value) { try { if (store) store.setItem(key, JSON.stringify(value)); } catch (_) {} }
  function roomKey(roomId) { return ROOM_PREFIX + clean(roomId).replace(/[^a-zA-Z0-9:_-]/g, "-"); }
  function get(roomId) {
    const id = clean(roomId);
    if (id) {
      if (memoryRooms.has(id)) return memoryRooms.get(id);
      const stored = readJson(storage("sessionStorage"), roomKey(id));
      if (stored) { const result = normalize(stored); memoryRooms.set(id, result); return result; }
    }
    if (memoryGlobal) return memoryGlobal;
    const stored = readJson(storage("localStorage"), STORAGE_KEY);
    memoryGlobal = normalize(stored || {});
    return memoryGlobal;
  }
  function emit(preferences, roomId) {
    const event = Object.freeze({ preferences, roomId: clean(roomId) || null, at: new Date().toISOString() });
    listeners.forEach(function (listener) { try { listener(event); } catch (_) {} });
    try { if (globalScope.dispatchEvent && typeof globalScope.CustomEvent === "function") globalScope.dispatchEvent(new globalScope.CustomEvent("lingosentinel:language-preferences", { detail: event })); } catch (_) {}
    return event;
  }
  function set(input, options) {
    const opts = options && typeof options === "object" ? options : {};
    const roomId = clean(opts.roomId || input && input.roomId);
    const result = normalize(Object.assign({}, get(roomId), input || {}, { updatedAt: new Date().toISOString() }));
    if (roomId) { memoryRooms.set(roomId, result); writeJson(storage("sessionStorage"), roomKey(roomId), result); }
    else { memoryGlobal = result; writeJson(storage("localStorage"), STORAGE_KEY, result); }
    emit(result, roomId);
    return result;
  }
  function clear(options) {
    const opts = options && typeof options === "object" ? options : {};
    const roomId = clean(opts.roomId);
    if (roomId) { memoryRooms.delete(roomId); try { const s = storage("sessionStorage"); if (s) s.removeItem(roomKey(roomId)); } catch (_) {} }
    else { memoryGlobal = null; try { const s = storage("localStorage"); if (s) s.removeItem(STORAGE_KEY); } catch (_) {} }
    const result = get(roomId);
    emit(result, roomId);
    return result;
  }
  function onChange(listener) { if (typeof listener === "function") listeners.add(listener); return function () { listeners.delete(listener); }; }
  function isSupportedPair(source, target) { return LANGUAGES.includes(language(source, "")) && LANGUAGES.includes(language(target, "")); }

  const api = Object.freeze({ version: VERSION, supportedLanguages: LANGUAGES, supportedFormalities: FORMALITIES, supportedDisplayModes: DISPLAY_MODES, get, set, clear, normalize, normalizeLanguage: language, normalizeLocale: locale, normalizeProtectedTerms: terms, isSupportedPair, onChange });
  globalScope.LingoSentinelPublicLanguagePreferences = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);

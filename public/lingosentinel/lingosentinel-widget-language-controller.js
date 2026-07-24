"use strict";

(function attachLingoSentinelWidgetLanguageController(globalScope) {
  const VERSION = "lingosentinel.widgetLanguageController/12.0-explicit-controls";
  function resolve(value) { if (!value) return null; if (typeof value === "string" && globalScope.document) return globalScope.document.querySelector(value); return value; }
  function create(options) {
    const opts = options && typeof options === "object" ? options : {};
    const preferences = opts.preferences || globalScope.LingoSentinelPublicLanguagePreferences;
    if (!preferences) throw new Error("LINGOSENTINEL_LANGUAGE_PREFERENCES_UNAVAILABLE");
    const roomId = String(opts.roomId || "").trim();
    const controls = {
      source: resolve(opts.sourceLanguage), target: resolve(opts.targetLanguage), locale: resolve(opts.locale),
      formality: resolve(opts.formality), displayMode: resolve(opts.displayMode)
    };
    let removePreferenceListener = null;
    function current() { return preferences.get(roomId); }
    function sync(value) {
      const p = value || current();
      if (controls.source) controls.source.value = p.sourceLanguage;
      if (controls.target) controls.target.value = p.targetLanguage;
      if (controls.locale) controls.locale.value = p.locale || "";
      if (controls.formality) controls.formality.value = p.formality;
      if (controls.displayMode) controls.displayMode.value = p.displayMode;
      return p;
    }
    function update() {
      const result = preferences.set({
        sourceLanguage: controls.source && controls.source.value,
        targetLanguage: controls.target && controls.target.value,
        locale: controls.locale && controls.locale.value,
        formality: controls.formality && controls.formality.value,
        displayMode: controls.displayMode && controls.displayMode.value
      }, { roomId });
      if (opts.dualTextController && typeof opts.dualTextController.setMode === "function") opts.dualTextController.setMode(result.displayMode);
      if (typeof opts.onChange === "function") opts.onChange(result);
      return result;
    }
    const nodes = Object.keys(controls).map(function (key) { return controls[key]; }).filter(Boolean);
    nodes.forEach(function (node) { if (node.addEventListener) node.addEventListener("change", update); });
    removePreferenceListener = preferences.onChange(function (event) { if (!event.roomId || event.roomId === roomId) sync(event.preferences); });
    sync();
    function destroy() { nodes.forEach(function (node) { if (node.removeEventListener) node.removeEventListener("change", update); }); if (typeof removePreferenceListener === "function") removePreferenceListener(); return { ok: true }; }
    return Object.freeze({ version: VERSION, get: current, set: function (value) { const result = preferences.set(value, { roomId }); sync(result); return result; }, sync, update, destroy });
  }
  const api = Object.freeze({ version: VERSION, create });
  globalScope.LingoSentinelWidgetLanguageController = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);

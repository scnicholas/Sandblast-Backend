"use strict";

(function attachLingoSentinelWidgetDualTextController(globalScope) {
  const VERSION = "lingosentinel.widgetDualTextController/11.0-original-preserved";
  function clean(value) { return String(value == null ? "" : value).trim(); }
  function safeSelectorId(value) { return clean(value).replace(/([\\"'\[\]#. :])/g, "\\$1"); }
  function create(options) {
    const opts = options && typeof options === "object" ? options : {};
    const container = typeof opts.container === "string" && globalScope.document ? globalScope.document.querySelector(opts.container) : opts.container;
    const renderPolicy = opts.renderPolicy || globalScope.LingoSentinelMessageRenderPolicy;
    const preferencesApi = opts.languagePreferences || globalScope.LingoSentinelPublicLanguagePreferences;
    const pending = new Map();
    let mode = clean(opts.displayMode || preferencesApi && preferencesApi.get(opts.roomId).displayMode || "both");
    let destroyed = false;
    function article(messageId) {
      if (!container || !container.querySelector) return null;
      return container.querySelector('[data-lingosentinel-message="' + safeSelectorId(messageId) + '"]');
    }
    function applyResult(result) {
      if (destroyed || !result || !result.messageId) return { ok: false, error: "TRANSLATION_RESULT_REQUIRED" };
      const node = article(result.messageId);
      if (!node) { pending.set(result.messageId, result); return { ok: true, pending: true }; }
      if (!renderPolicy || typeof renderPolicy.applyTranslation !== "function") return { ok: false, error: "TRANSLATION_RENDER_POLICY_UNAVAILABLE" };
      const applied = renderPolicy.applyTranslation(node, result, { displayMode: mode });
      pending.delete(result.messageId);
      return { ok: true, applied };
    }
    function applyPending(messageId) { const result = pending.get(clean(messageId)); return result ? applyResult(result) : { ok: true, pending: false }; }
    function setMode(next) {
      const normalized = ["original", "translation", "both"].includes(clean(next)) ? clean(next) : "both";
      mode = normalized;
      if (container && container.querySelectorAll && renderPolicy && typeof renderPolicy.setDisplayMode === "function") {
        Array.prototype.forEach.call(container.querySelectorAll("[data-lingosentinel-message]"), function (node) { renderPolicy.setDisplayMode(node, mode); });
      }
      if (preferencesApi && typeof preferencesApi.set === "function") preferencesApi.set({ displayMode: mode }, { roomId: opts.roomId });
      return mode;
    }
    function onTranslation(event) { applyResult(event && event.detail || event); }
    function onMessage(event) { applyPending(event && event.detail && event.detail.messageId); }
    try { if (globalScope.addEventListener) { globalScope.addEventListener("lingosentinel:translation-result", onTranslation); globalScope.addEventListener("lingosentinel:message", onMessage); } } catch (_) {}
    function destroy() {
      destroyed = true; pending.clear();
      try { if (globalScope.removeEventListener) { globalScope.removeEventListener("lingosentinel:translation-result", onTranslation); globalScope.removeEventListener("lingosentinel:message", onMessage); } } catch (_) {}
      return { ok: true };
    }
    return Object.freeze({ version: VERSION, applyResult, applyPending, setMode, getMode: function () { return mode; }, getPendingCount: function () { return pending.size; }, destroy });
  }
  const api = Object.freeze({ version: VERSION, create });
  globalScope.LingoSentinelWidgetDualTextController = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);

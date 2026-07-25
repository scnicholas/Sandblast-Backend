"use strict";

(function attachLingoSentinelWidgetDualTextController(globalScope) {
  const VERSION = "lingosentinel.widgetDualTextController/12.1-render-fallback";
  const DISPLAY_MODES = Object.freeze(["original", "translation", "both"]);
  const FAILURE_STATUS = Object.freeze(["failed", "expired", "original_only", "reject", "unavailable"]);

  function clean(value) { return String(value == null ? "" : value).trim(); }
  function normalizeMode(value) { const mode = clean(value).toLowerCase(); return DISPLAY_MODES.includes(mode) ? mode : "both"; }
  function resultIdentity(value) { return clean(value && (value.messageId || value.requestId)).slice(0, 96); }
  function normalizeResult(input) {
    const root = input && input.detail ? input.detail : input;
    const value = root && root.result && typeof root.result === "object" ? root.result : root && root.translation && typeof root.translation === "object" ? root.translation : root;
    const confidence = Number(value && value.confidence);
    const sourceLanguage = clean(value && (value.sourceLanguage || value.source)).toLowerCase().slice(0, 16);
    const targetLanguage = clean(value && (value.targetLanguage || value.target)).toLowerCase().slice(0, 16);
    const status = clean(value && value.status || (value && value.ok === false ? "failed" : "translated")).toLowerCase();
    return Object.freeze({
      messageId: resultIdentity(value),
      requestId: clean(value && value.requestId).slice(0, 96),
      roomId: clean(value && value.roomId).slice(0, 96),
      translationId: clean(value && value.translationId).slice(0, 96),
      originalText: String(!value || value.originalText == null ? "" : value.originalText).slice(0, 4000),
      translatedText: String(!value || value.translatedText == null ? "" : value.translatedText).slice(0, 4000),
      sourceLanguage,
      targetLanguage,
      status,
      confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : null,
      provider: clean(value && value.provider).replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 40),
      retryable: value && value.retryable === true,
      errorCode: clean(value && (value.errorCode || value.error)).replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80),
      createdAt: clean(value && value.createdAt)
    });
  }
  function create(options) {
    const opts = options && typeof options === "object" ? options : {};
    const container = typeof opts.container === "string" && globalScope.document ? globalScope.document.querySelector(opts.container) : opts.container;
    const statusNode = typeof opts.statusNode === "string" && globalScope.document ? globalScope.document.querySelector(opts.statusNode) : opts.statusNode;
    const renderPolicy = opts.renderPolicy || globalScope.LingoSentinelMessageRenderPolicy;
    const preferencesApi = opts.languagePreferences || globalScope.LingoSentinelPublicLanguagePreferences;
    const confidenceApi = opts.confidenceController || globalScope.LingoSentinelWidgetTranslationConfidence;
    const pending = new Map();
    const applied = new Map();
    let destroyed = false;
    let mode = normalizeMode(opts.displayMode || currentPreferences().displayMode || "both");

    function currentPreferences() {
      try { return preferencesApi && typeof preferencesApi.get === "function" ? (preferencesApi.get(opts.roomId) || {}) : {}; }
      catch (_) { return {}; }
    }
    function activeTarget() { return clean(currentPreferences().targetLanguage).toLowerCase(); }
    function eachMessage(callback) {
      if (!container || !container.querySelectorAll) return;
      Array.prototype.forEach.call(container.querySelectorAll("[data-lingosentinel-message], [data-lingosentinel-request], [data-request-id]"), callback);
    }
    function article(identity) {
      const id = clean(identity);
      if (!id || !container || !container.querySelectorAll) return null;
      const nodes = container.querySelectorAll("[data-lingosentinel-message], [data-lingosentinel-request], [data-request-id]");
      for (let index = 0; index < nodes.length; index++) {
        const node = nodes[index];
        if (clean(node.getAttribute("data-lingosentinel-message")) === id || clean(node.getAttribute("data-lingosentinel-request")) === id || clean(node.getAttribute("data-request-id")) === id) return node;
      }
      return null;
    }
    function signature(result) {
      return [result.translationId, result.status, result.targetLanguage, result.translatedText, result.errorCode].join("\u0000");
    }
    function putPending(result) {
      const id = result.messageId;
      const target = result.targetLanguage || "*";
      let byLanguage = pending.get(id);
      if (!byLanguage) { byLanguage = new Map(); pending.set(id, byLanguage); }
      byLanguage.set(target, result);
      while (byLanguage.size > 8) byLanguage.delete(byLanguage.keys().next().value);
      while (pending.size > 250) pending.delete(pending.keys().next().value);
    }
    function takePending(identity) {
      const id = clean(identity);
      const byLanguage = pending.get(id);
      if (!byLanguage) return null;
      const target = activeTarget();
      const result = byLanguage.get(target) || byLanguage.get("*") || Array.from(byLanguage.values()).pop() || null;
      if (result) {
        byLanguage.delete(result.targetLanguage || "*");
        if (!byLanguage.size) pending.delete(id);
      }
      return result;
    }
    function findOriginal(node) {
      if (!node || !node.querySelector) return null;
      let original = node.querySelector("[data-message-original], [data-lingosentinel-original], [data-message-body]");
      if (!original) original = node.querySelector("p");
      if (original && original.setAttribute) original.setAttribute("data-lingosentinel-original", "true");
      return original;
    }
    function createChild(node, tagName, attribute) {
      if (!node || !globalScope.document || typeof node.appendChild !== "function") return null;
      const child = globalScope.document.createElement(tagName);
      child.setAttribute(attribute, "true");
      node.appendChild(child);
      return child;
    }
    function findOrCreateTranslation(node) {
      return node.querySelector && node.querySelector("[data-message-translation], [data-lingosentinel-translation]") || createChild(node, "p", "data-lingosentinel-translation");
    }
    function findOrCreateNotice(node) {
      return node.querySelector && node.querySelector("[data-translation-notice], [data-translation-confidence-notice]") || createChild(node, "span", "data-translation-notice");
    }
    function isFailure(result) { return FAILURE_STATUS.includes(result.status) || (!result.translatedText && result.status !== "pending"); }
    function noticeText(result) {
      if (result.status === "pending") return "Translation pending";
      if (result.status === "clarification_recommended") return "Meaning may be ambiguous; compare the original wording";
      if (isFailure(result)) return result.retryable ? "Translation unavailable — retry available" : "Translation unavailable; original wording shown";
      if (result.status === "low_confidence" || result.confidence !== null && result.confidence < 0.6) return "Low-confidence translation; compare the original wording";
      if (result.confidence !== null && result.confidence < 0.85) return "Translation may need review";
      return "";
    }
    function setStatus(result) {
      if (statusNode) {
        const state = result.status === "pending" ? "pending" : isFailure(result) ? "unavailable" : "ready";
        statusNode.setAttribute("data-state", state);
        statusNode.textContent = state === "ready" ? "Translation ready" : state === "pending" ? "Translation pending" : "Translation unavailable";
      }
      try {
        if (globalScope.dispatchEvent && typeof globalScope.CustomEvent === "function") {
          globalScope.dispatchEvent(new globalScope.CustomEvent("lingosentinel:translation-display-state", { detail: { messageId: result.messageId, state: isFailure(result) ? "unavailable" : result.status, targetLanguage: result.targetLanguage } }));
        }
      } catch (_) {}
    }
    function fallbackSetDisplayMode(node, selectedMode, result) {
      if (!node) return false;
      const original = findOriginal(node);
      const translation = node.querySelector && node.querySelector("[data-message-translation], [data-lingosentinel-translation]");
      const hasResultState = !!(result && (result.status || result.translatedText || result.errorCode));
      const available = !!(translation && clean(translation.textContent)) && (!hasResultState || !isFailure(result));
      if (original) original.hidden = selectedMode === "translation" && available;
      if (translation) translation.hidden = selectedMode === "original" || !available;
      node.setAttribute("data-translation-display-mode", selectedMode);
      return true;
    }
    function fallbackApply(node, result) {
      const original = findOriginal(node);
      const translation = findOrCreateTranslation(node);
      const notice = findOrCreateNotice(node);
      if (original && !clean(original.textContent) && result.originalText) original.textContent = result.originalText;
      if (translation) {
        translation.textContent = isFailure(result) || result.status === "pending" ? "" : result.translatedText;
        translation.setAttribute("lang", result.targetLanguage || "");
        translation.setAttribute("data-message-translation", "true");
      }
      if (notice) {
        const text = noticeText(result);
        notice.textContent = text;
        notice.hidden = !text;
      }
      node.setAttribute("data-translation-status", result.status || "failed");
      node.setAttribute("data-translation-target", result.targetLanguage || "");
      node.setAttribute("data-translation-provider", result.provider || "");
      node.setAttribute("data-translation-available", isFailure(result) || result.status === "pending" ? "false" : "true");
      if (confidenceApi && typeof confidenceApi.apply === "function") {
        try { confidenceApi.apply(node, result); } catch (_) {}
      }
      fallbackSetDisplayMode(node, mode, result);
      return true;
    }
    function policyApply(node, result) {
      if (renderPolicy && typeof renderPolicy.applyTranslation === "function") {
        try {
          const outcome = renderPolicy.applyTranslation(node, result, { displayMode: mode });
          if (outcome !== false) return outcome;
        } catch (_) {}
      }
      return fallbackApply(node, result);
    }
    function shouldApply(result) {
      const target = activeTarget();
      return !target || !result.targetLanguage || target === result.targetLanguage || result.status === "failed";
    }
    function applyResult(input) {
      if (destroyed) return { ok: false, error: "DUAL_TEXT_CONTROLLER_DESTROYED" };
      const result = normalizeResult(input);
      if (!result.messageId) return { ok: false, error: "TRANSLATION_RESULT_REQUIRED" };
      if (!shouldApply(result)) { putPending(result); return { ok: true, pending: true, reason: "TARGET_LANGUAGE_NOT_ACTIVE" }; }
      const node = article(result.messageId);
      if (!node) { putPending(result); return { ok: true, pending: true }; }
      const nextSignature = signature(result);
      if (applied.get(result.messageId) === nextSignature) return { ok: true, duplicate: true };
      const outcome = policyApply(node, result);
      applied.set(result.messageId, nextSignature);
      const byLanguage = pending.get(result.messageId);
      if (byLanguage) {
        byLanguage.delete(result.targetLanguage || "*");
        if (!byLanguage.size) pending.delete(result.messageId);
      }
      setStatus(result);
      return { ok: true, applied: outcome, result };
    }
    function applyPending(identity) {
      const result = takePending(identity);
      return result ? applyResult(result) : { ok: true, pending: false };
    }
    function setMode(next) {
      mode = normalizeMode(next);
      eachMessage(function (node) {
        if (renderPolicy && typeof renderPolicy.setDisplayMode === "function") {
          try { if (renderPolicy.setDisplayMode(node, mode) !== false) return; } catch (_) {}
        }
        fallbackSetDisplayMode(node, mode, {});
      });
      if (preferencesApi && typeof preferencesApi.set === "function") {
        try { preferencesApi.set({ displayMode: mode }, { roomId: opts.roomId }); } catch (_) {}
      }
      return mode;
    }
    function onTranslation(event) { applyResult(event); }
    function onMessage(event) {
      const detail = event && event.detail || {};
      applyPending(detail.messageId || detail.requestId);
    }
    function onPreferences(event) {
      const detail = event && event.detail || {};
      if (detail.roomId && opts.roomId && detail.roomId !== opts.roomId) return;
      if (detail.preferences && detail.preferences.displayMode) setMode(detail.preferences.displayMode);
      eachMessage(function (node) {
        const id = clean(node.getAttribute("data-lingosentinel-message") || node.getAttribute("data-lingosentinel-request") || node.getAttribute("data-request-id"));
        if (id) applyPending(id);
      });
    }
    try {
      if (globalScope.addEventListener) {
        globalScope.addEventListener("lingosentinel:translation-result", onTranslation);
        globalScope.addEventListener("lingosentinel:message", onMessage);
        globalScope.addEventListener("lingosentinel:language-preferences", onPreferences);
      }
    } catch (_) {}
    function destroy() {
      destroyed = true; pending.clear(); applied.clear();
      try {
        if (globalScope.removeEventListener) {
          globalScope.removeEventListener("lingosentinel:translation-result", onTranslation);
          globalScope.removeEventListener("lingosentinel:message", onMessage);
          globalScope.removeEventListener("lingosentinel:language-preferences", onPreferences);
        }
      } catch (_) {}
      return { ok: true };
    }
    return Object.freeze({
      version: VERSION,
      applyResult,
      applyPending,
      setMode,
      getMode: function () { return mode; },
      getPendingCount: function () {
        let count = 0; pending.forEach(function (value) { count += value.size; }); return count;
      },
      normalizeResult,
      destroy
    });
  }

  const api = Object.freeze({ version: VERSION, create, normalizeResult });
  globalScope.LingoSentinelWidgetDualTextController = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);

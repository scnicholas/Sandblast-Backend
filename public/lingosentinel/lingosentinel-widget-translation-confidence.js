"use strict";

(function attachLingoSentinelWidgetTranslationConfidence(globalScope) {
  const VERSION = "lingosentinel.widgetTranslationConfidence/12.0-redacted";
  function number(value) { const n = Number(value); return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : null; }
  function classify(input) {
    const value = input && typeof input === "object" ? input : {};
    const status = String(value.status || "").trim().toLowerCase();
    const confidence = number(value.confidence);
    if (["failed", "expired", "original_only", "reject"].includes(status)) return Object.freeze({ decision: "original_only", level: "unavailable", confidence, showOriginal: true, showTranslation: false });
    if (["clarification_recommended"].includes(status)) return Object.freeze({ decision: "clarification_recommended", level: "caution", confidence, showOriginal: true, showTranslation: !!String(value.translatedText || "").trim() });
    if (status === "low_confidence" || (confidence !== null && confidence < 0.6)) return Object.freeze({ decision: "accept_with_notice", level: "low", confidence, showOriginal: true, showTranslation: !!String(value.translatedText || "").trim() });
    if (confidence !== null && confidence < 0.85) return Object.freeze({ decision: "accept_with_notice", level: "medium", confidence, showOriginal: true, showTranslation: true });
    if (status === "pending") return Object.freeze({ decision: "pending", level: "pending", confidence, showOriginal: true, showTranslation: false });
    return Object.freeze({ decision: "accept", level: "high", confidence, showOriginal: true, showTranslation: true });
  }
  function notice(input) {
    const result = classify(input);
    if (result.decision === "pending") return "Translation pending";
    if (result.decision === "clarification_recommended") return "Meaning may be ambiguous; compare the original wording";
    if (result.decision === "original_only") return "Translation unavailable; original wording shown";
    if (result.level === "low") return "Low-confidence translation; compare the original wording";
    if (result.level === "medium") return "Translation may need review";
    return "";
  }
  function apply(node, input) {
    if (!node || typeof node.setAttribute !== "function") return null;
    const result = classify(input);
    node.setAttribute("data-translation-quality", result.level);
    node.setAttribute("data-translation-decision", result.decision);
    const text = notice(input);
    let noticeNode = node.querySelector && node.querySelector("[data-translation-confidence-notice]");
    if (!noticeNode && text && globalScope.document) {
      noticeNode = globalScope.document.createElement("span");
      noticeNode.setAttribute("data-translation-confidence-notice", "true");
      node.appendChild(noticeNode);
    }
    if (noticeNode) { noticeNode.textContent = text; noticeNode.hidden = !text; }
    return result;
  }
  const api = Object.freeze({ version: VERSION, classify, notice, apply, rawDiagnosticsExposed: false });
  globalScope.LingoSentinelWidgetTranslationConfidence = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);

"use strict";

(function attachLingoSentinelMessageRenderPolicy(globalScope) {
  const VERSION = "lingosentinel.messageRenderPolicy/12.0-dual-text-safe";
  function clean(value) { return String(value == null ? "" : value).trim(); }
  function safeTimestamp(value) { const time = Date.parse(clean(value)); return Number.isFinite(time) ? new Date(time).toISOString() : ""; }
  function normalizeText(value) { return String(value == null ? "" : value).replace(/\r\n?/g, "\n").slice(0, 4000); }
  function normalizeMessage(input) {
    const value = input && typeof input === "object" ? input : {};
    return Object.freeze({ direction: value.direction === "outgoing" ? "outgoing" : "incoming", messageId: clean(value.messageId).slice(0, 96), senderName: clean(value.senderName || "Participant").replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 80), text: normalizeText(value.text), sequence: Number.isSafeInteger(value.sequence) ? value.sequence : 0, createdAt: safeTimestamp(value.createdAt), publishedAt: safeTimestamp(value.publishedAt), sourceLanguage: clean(value.sourceLanguage || "en").slice(0, 16), targetLanguage: clean(value.targetLanguage || value.sourceLanguage || "en").slice(0, 16), translationStatus: clean(value.translationStatus || "bypassed").slice(0, 32) });
  }
  function find(node, selector) { return node && node.querySelector ? node.querySelector(selector) : null; }
  function setDisplayMode(article, mode) {
    const normalized = ["original", "translation", "both"].includes(clean(mode)) ? clean(mode) : "both";
    const original = find(article, "[data-message-original]");
    const translation = find(article, "[data-message-translation]");
    const hasTranslation = !!(translation && translation.getAttribute && translation.getAttribute("data-has-translation") === "true");
    if (original) original.hidden = normalized === "translation" && hasTranslation;
    if (translation) translation.hidden = normalized === "original" || !hasTranslation;
    if (article && article.setAttribute) article.setAttribute("data-translation-display", normalized);
    return normalized;
  }
  function applyTranslation(article, input, options) {
    if (!article || !globalScope.document) return null;
    const value = input && typeof input === "object" ? input : {};
    let container = find(article, "[data-message-translation]");
    if (!container) { container = globalScope.document.createElement("div"); container.setAttribute("data-message-translation", "true"); article.appendChild(container); }
    let label = find(container, "[data-translation-label]");
    if (!label) { label = globalScope.document.createElement("span"); label.setAttribute("data-translation-label", "true"); container.appendChild(label); }
    let text = find(container, "[data-translation-text]");
    if (!text) { text = globalScope.document.createElement("p"); text.setAttribute("data-translation-text", "true"); container.appendChild(text); }
    const translated = normalizeText(value.translatedText);
    const show = ["translated", "low_confidence", "clarification_recommended"].includes(clean(value.status)) && !!translated;
    label.textContent = show ? "Translation · " + clean(value.targetLanguage).toUpperCase() : "Translation";
    text.textContent = show ? translated : "";
    container.setAttribute("data-translation-status", clean(value.status || "failed"));
    container.setAttribute("data-translation-language", clean(value.targetLanguage));
    container.setAttribute("data-has-translation", show ? "true" : "false");
    const confidence = globalScope.LingoSentinelWidgetTranslationConfidence;
    if (confidence && typeof confidence.apply === "function") confidence.apply(container, value);
    setDisplayMode(article, options && options.displayMode || article.getAttribute && article.getAttribute("data-translation-display") || "both");
    return container;
  }
  function render(container, input, options) {
    if (!container || typeof container.appendChild !== "function" || !globalScope.document) throw new Error("LINGOSENTINEL_RENDER_CONTAINER_REQUIRED");
    const opts = options && typeof options === "object" ? options : {}; const message = normalizeMessage(input);
    const article = globalScope.document.createElement("article"); article.setAttribute("data-lingosentinel-message", message.messageId); article.setAttribute("data-direction", message.direction); article.setAttribute("data-sequence", String(message.sequence)); article.setAttribute("data-source-language", message.sourceLanguage); article.setAttribute("data-translation-status", message.translationStatus);
    const header = globalScope.document.createElement("div"); header.setAttribute("data-message-header", "true");
    const sender = globalScope.document.createElement("span"); sender.textContent = message.senderName;
    const time = globalScope.document.createElement("time"); if (message.createdAt) time.setAttribute("datetime", message.createdAt); time.textContent = message.createdAt && opts.formatTime !== false ? new Date(message.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";
    const content = globalScope.document.createElement("div"); content.setAttribute("data-message-content", "true");
    const original = globalScope.document.createElement("p"); original.setAttribute("data-message-original", "true"); original.textContent = message.text;
    const translation = globalScope.document.createElement("div"); translation.setAttribute("data-message-translation", "true"); translation.setAttribute("data-has-translation", "false"); translation.hidden = true;
    header.appendChild(sender); header.appendChild(time); content.appendChild(original); content.appendChild(translation); article.appendChild(header); article.appendChild(content); container.appendChild(article);
    setDisplayMode(article, opts.displayMode || "both"); return article;
  }
  const policy = Object.freeze({ version: VERSION, normalizeMessage, normalizeText, safeTimestamp, render, applyTranslation, setDisplayMode, htmlExecutionAllowed: false, originalTextAlwaysPreserved: true });
  globalScope.LingoSentinelMessageRenderPolicy = policy;
  if (typeof module !== "undefined" && module.exports) module.exports = policy;
})(typeof window !== "undefined" ? window : globalThis);

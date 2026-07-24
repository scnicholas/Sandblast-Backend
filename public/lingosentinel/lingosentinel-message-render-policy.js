"use strict";

(function attachLingoSentinelMessageRenderPolicy(globalScope) {
  const VERSION = "lingosentinel.messageRenderPolicy/7.0-text-only";
  function clean(value) { return String(value == null ? "" : value).trim(); }
  function safeTimestamp(value) {
    const time = Date.parse(clean(value));
    return Number.isFinite(time) ? new Date(time).toISOString() : "";
  }
  function normalizeText(value) { return String(value == null ? "" : value).replace(/\r\n?/g, "\n").slice(0, 4000); }
  function normalizeMessage(input) {
    const value = input && typeof input === "object" ? input : {};
    return Object.freeze({
      direction: value.direction === "outgoing" ? "outgoing" : "incoming",
      messageId: clean(value.messageId).slice(0, 96),
      senderName: clean(value.senderName || "Participant").replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 80),
      text: normalizeText(value.text),
      sequence: Number.isSafeInteger(value.sequence) ? value.sequence : 0,
      createdAt: safeTimestamp(value.createdAt),
      publishedAt: safeTimestamp(value.publishedAt)
    });
  }
  function render(container, input, options) {
    if (!container || typeof container.appendChild !== "function" || !globalScope.document) throw new Error("LINGOSENTINEL_RENDER_CONTAINER_REQUIRED");
    const opts = options && typeof options === "object" ? options : {};
    const message = normalizeMessage(input);
    const article = globalScope.document.createElement("article");
    article.setAttribute("data-lingosentinel-message", message.messageId);
    article.setAttribute("data-direction", message.direction);
    article.setAttribute("data-sequence", String(message.sequence));
    const header = globalScope.document.createElement("div");
    header.setAttribute("data-message-header", "true");
    const sender = globalScope.document.createElement("span");
    sender.textContent = message.senderName;
    const time = globalScope.document.createElement("time");
    if (message.createdAt) time.setAttribute("datetime", message.createdAt);
    time.textContent = message.createdAt && opts.formatTime !== false ? new Date(message.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";
    const body = globalScope.document.createElement("p");
    body.textContent = message.text;
    header.appendChild(sender); header.appendChild(time); article.appendChild(header); article.appendChild(body); container.appendChild(article);
    return article;
  }
  const policy = Object.freeze({ version: VERSION, normalizeMessage, normalizeText, safeTimestamp, render, htmlExecutionAllowed: false });
  globalScope.LingoSentinelMessageRenderPolicy = policy;
  if (typeof module !== "undefined" && module.exports) module.exports = policy;
})(typeof window !== "undefined" ? window : globalThis);

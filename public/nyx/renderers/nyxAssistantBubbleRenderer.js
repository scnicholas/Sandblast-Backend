"use strict";

/**
 * Nyx Assistant Bubble Renderer
 *
 * Purpose:
 * Renders assistant text safely and prevents duplicate assistant bubbles.
 *
 * Contract:
 * - Does not render Context Passport metadata.
 * - Does not render diagnostics.
 * - Uses reply signatures to suppress duplicate bubbles.
 * - Browser-safe, test-safe.
 */

const BUBBLE_RENDERER_VERSION = "nyx.assistantBubbleRenderer/1.0";

function safeStr(value, fallback = "") {
  const text = String(value == null ? "" : value).replace(/\s+/g, " ").trim();
  return text || fallback;
}

function escapeHtml(value) {
  return safeStr(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function hasUnsafeReplyText(value) {
  const text = safeStr(value);

  return /runtimeTelemetry|failureSignature|stack trace|TypeError|ReferenceError|SyntaxError|MODULE_NOT_FOUND|Bearer\s+|api[_-]?key|secret|token|finalEnvelopeTrusted|replyAuthority|sessionPatch|diagnostics|finalEnvelope/i.test(
    text
  );
}

function buildAssistantBubbleHtml(reply = "", options = {}) {
  const text = safeStr(reply);

  if (!text || hasUnsafeReplyText(text)) {
    return "";
  }

  const role = safeStr(options.role, "assistant");
  const requestId = safeStr(options.requestId);

  return [
    `<div class="nyx-message nyx-message--${escapeHtml(role)}"`,
    requestId ? ` data-request-id="${escapeHtml(requestId)}"` : "",
    ` data-nyx-assistant-bubble="true">`,
    `<div class="nyx-message-content">${escapeHtml(text)}</div>`,
    `</div>`,
  ].join("");
}

function ensureContainer(target) {
  if (!target || typeof document === "undefined") return null;

  if (typeof target === "string") {
    return document.querySelector(target);
  }

  if (target && typeof target.appendChild === "function") {
    return target;
  }

  return null;
}

function createRenderedSignatureSet(seed) {
  const set = new Set(Array.isArray(seed) ? seed.filter(Boolean) : []);

  return {
    has(signature) {
      return set.has(signature);
    },
    add(signature) {
      if (signature) set.add(signature);
      return set.size;
    },
    clear() {
      set.clear();
    },
    size() {
      return set.size;
    },
  };
}

function renderAssistantBubble(target, adaptedResponse = {}, options = {}) {
  const container = ensureContainer(target);
  const reply = safeStr(adaptedResponse.assistantReply);
  const signature = safeStr(adaptedResponse.replySignature);
  const signatureStore =
    options.signatureStore ||
    createRenderedSignatureSet();

  if (!container) {
    return {
      ok: false,
      rendered: false,
      reason: "container_missing",
    };
  }

  if (!reply) {
    return {
      ok: true,
      rendered: false,
      reason: "reply_missing",
    };
  }

  if (hasUnsafeReplyText(reply)) {
    return {
      ok: true,
      rendered: false,
      reason: "unsafe_reply_blocked",
    };
  }

  if (signature && signatureStore.has(signature)) {
    return {
      ok: true,
      rendered: false,
      reason: "duplicate_reply_suppressed",
      duplicateSuppressed: true,
    };
  }

  const html = buildAssistantBubbleHtml(reply, {
    requestId: adaptedResponse.requestId,
  });

  if (!html) {
    return {
      ok: true,
      rendered: false,
      reason: "bubble_html_empty",
    };
  }

  container.insertAdjacentHTML("beforeend", html);

  if (signature) {
    signatureStore.add(signature);
  }

  return {
    ok: true,
    rendered: true,
    duplicateSuppressed: false,
    signature,
    html,
  };
}

module.exports = {
  BUBBLE_RENDERER_VERSION,
  safeStr,
  escapeHtml,
  hasUnsafeReplyText,
  buildAssistantBubbleHtml,
  ensureContainer,
  createRenderedSignatureSet,
  renderAssistantBubble,
};

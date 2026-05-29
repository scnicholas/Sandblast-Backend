"use strict";

/**
 * Nyx Widget Response Adapter
 *
 * Purpose:
 * Separates assistant reply rendering from Context Passport metadata rendering.
 *
 * Contract:
 * - Assistant reply path remains unchanged.
 * - Context Passport path is metadata-only.
 * - No duplicate assistant bubbles.
 * - No backend diagnostics rendered.
 * - Missing passport metadata fails silently.
 */

const {
  parseNyxContextPassport,
} = require("../contextPassport/nyxContextPassportParser");

const ADAPTER_VERSION = "nyx.widgetResponseAdapter.contextPassport/1.0";

function isObj(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function safeStr(value, fallback = "") {
  const text = String(value == null ? "" : value).replace(/\s+/g, " ").trim();
  return text || fallback;
}

function firstText() {
  for (let i = 0; i < arguments.length; i += 1) {
    const text = safeStr(arguments[i]);
    if (text) return text;
  }
  return "";
}

function safeJsonStringify(value) {
  const seen = new WeakSet();

  try {
    return JSON.stringify(value || {}, (key, item) => {
      if (typeof item === "object" && item !== null) {
        if (seen.has(item)) return "[Circular]";
        seen.add(item);
      }
      return item;
    });
  } catch (_) {
    return String(value || "");
  }
}

function hasDebugLeak(value) {
  const serialized =
    typeof value === "string" ? value : safeJsonStringify(value);

  return /runtimeTelemetry|failureSignature|stack trace|TypeError|ReferenceError|SyntaxError|MODULE_NOT_FOUND|Bearer\s+|api[_-]?key|secret|token|finalEnvelopeTrusted|replyAuthority|sessionPatch|diagnostics/i.test(
    serialized
  );
}

function extractAssistantReply(response = {}) {
  const src = isObj(response) ? response : {};
  const payload = isObj(src.payload) ? src.payload : {};
  const finalEnvelope = isObj(src.finalEnvelope) ? src.finalEnvelope : {};
  const multilingualFinalEnvelope = isObj(src.multilingualFinalEnvelope)
    ? src.multilingualFinalEnvelope
    : {};

  const reply = firstText(
    src.displayReply,
    src.visibleReply,
    src.assistantReply,
    src.reply,
    src.text,
    src.answer,
    payload.displayReply,
    payload.visibleReply,
    payload.assistantReply,
    payload.reply,
    payload.text,
    payload.answer,
    finalEnvelope.final,
    finalEnvelope.finalAnswer,
    multilingualFinalEnvelope.final,
    multilingualFinalEnvelope.finalAnswer
  );

  if (!reply || hasDebugLeak(reply)) {
    return "";
  }

  return reply;
}

function extractRequestId(response = {}) {
  const src = isObj(response) ? response : {};
  const payload = isObj(src.payload) ? src.payload : {};
  const meta = isObj(src.meta) ? src.meta : {};
  const finalEnvelope = isObj(src.finalEnvelope) ? src.finalEnvelope : {};

  return firstText(
    src.requestId,
    src.turnId,
    payload.requestId,
    payload.turnId,
    meta.requestId,
    meta.turnId,
    finalEnvelope.requestId,
    finalEnvelope.turnId
  );
}

function buildReplySignature(reply = "", requestId = "") {
  const source = `${safeStr(requestId)}::${safeStr(reply).toLowerCase()}`;
  let hash = 0;

  for (let i = 0; i < source.length; i += 1) {
    hash = ((hash << 5) - hash) + source.charCodeAt(i);
    hash |= 0;
  }

  return String(hash >>> 0);
}

function adaptNyxWidgetResponse(response = {}, options = {}) {
  try {
    const requestId = extractRequestId(response);
    const assistantReply = extractAssistantReply(response);
    const passport = parseNyxContextPassport(response, {
      defaultTargetLanguage: options.defaultTargetLanguage || "en",
    });

    const replySignature = buildReplySignature(assistantReply, requestId);

    return {
      version: ADAPTER_VERSION,
      ok: true,
      requestId,
      assistantReply,
      hasAssistantReply: Boolean(assistantReply),
      replySignature,
      contextPassport: passport,
      hasContextPassport: Boolean(passport && passport.visible),
      shouldRenderAssistant: Boolean(assistantReply),
      shouldRenderPassport: Boolean(passport && passport.visible),
      metadataOnly: false,
      diagnosticsBlocked: hasDebugLeak(response),
    };
  } catch (_) {
    return {
      version: ADAPTER_VERSION,
      ok: false,
      requestId: "",
      assistantReply: "",
      hasAssistantReply: false,
      replySignature: "",
      contextPassport: {
        visible: false,
        authority: "marion",
        reason: "adapter_exception_fallback",
      },
      hasContextPassport: false,
      shouldRenderAssistant: false,
      shouldRenderPassport: false,
      metadataOnly: false,
      diagnosticsBlocked: true,
    };
  }
}

function adapt(response = {}, options = {}) {
  return adaptNyxWidgetResponse(response, options);
}

module.exports = {
  ADAPTER_VERSION,
  isObj,
  safeStr,
  firstText,
  safeJsonStringify,
  hasDebugLeak,
  extractAssistantReply,
  extractRequestId,
  buildReplySignature,
  adaptNyxWidgetResponse,
  adapt,
};
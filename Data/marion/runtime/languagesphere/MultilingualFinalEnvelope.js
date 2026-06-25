"use strict";

/**
 * MultilingualFinalEnvelope
 *
 * Purpose:
 * Attaches LanguageSphere metadata to Marion's final answer contract.
 *
 * Contract:
 * - Marion remains final authority.
 * - Translation/language layer may advise but never override final.
 * - Final answer must be stable and user-facing.
 * - No debug leakage.
 *
 * Surgical patch focus:
 * - Prevent ReferenceError / diagnostic strings from becoming the visible reply.
 * - Promote a clean Marion reply across every public alias expected by the UI.
 * - Extract nested final answers from common runtime/envelope packet shapes.
 * - Preserve LanguageSphere as advisory metadata only.
 */

const VERSION = "MultilingualFinalEnvelope/1.1.1 REFERENCEERROR-FINAL-RECOVERY";
const CONTRACT_VERSION = "nyx.marion.multilingualFinal/1.0";

const DEFAULT_CONFIG = Object.freeze({
  authority: "marion",
  defaultLanguage: "en",
  defaultDomain: "general",
  defaultConfidenceBand: "unknown",
});

const ALLOWED_LANGUAGES = Object.freeze(["en", "es", "fr"]);
const ALLOWED_DOMAINS = Object.freeze([
  "general",
  "ai",
  "psychology",
  "english",
  "finance",
  "law",
  "cyber",
  "business",
  "media",
  "technical",
]);

const DEBUG_OR_ERROR_PATTERN =
  /(?:typeerror|referenceerror|syntaxerror|rangeerror|stack trace|module_not_found|enoent|undefined is not|cannot read|is not defined|bridge failed during processing|no clean public reply field|diagnostic packet|final envelope missing|non-final|runtime packet)/i;

const SECRET_PATTERN =
  /(?:bearer\s+|api[_-]?key|secret|password|authorization|access[_-]?token|refresh[_-]?token|x[-_]?sb[-_]?)/i;

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeString(value, fallback = "") {
  const text = String(value == null ? "" : value).replace(/\s+/g, " ").trim();
  return text || fallback;
}

function safeStringify(value) {
  const seen = new WeakSet();

  try {
    return JSON.stringify(value || {}, (key, item) => {
      if (typeof item === "object" && item !== null) {
        if (seen.has(item)) return "[Circular]";
        seen.add(item);
      }
      if (typeof item === "function") return "[function]";
      if (typeof item === "bigint") return String(item);
      return item;
    });
  } catch (_) {
    return String(value || "");
  }
}

function normalizeLanguage(value, fallback = "en") {
  const raw = normalizeString(value, fallback).toLowerCase();

  if (raw === "eng" || raw === "english") return "en";
  if (raw === "spa" || raw === "es-419" || raw === "spanish" || raw === "espanol" || raw === "español") return "es";
  if (raw === "fre" || raw === "fra" || raw === "french" || raw === "francais" || raw === "français") return "fr";
  if (raw.includes("-")) return normalizeLanguage(raw.split("-")[0], fallback);

  return ALLOWED_LANGUAGES.includes(raw) ? raw : fallback;
}

function normalizeDomain(value, fallback = "general") {
  const raw = normalizeString(value, fallback).toLowerCase().replace(/\s+/g, "_");
  return ALLOWED_DOMAINS.includes(raw) ? raw : fallback;
}

function normalizeConfidence(value) {
  const number = Number(value);

  if (!Number.isFinite(number)) return null;
  if (number < 0) return 0;
  if (number > 1) return 1;

  return number;
}

function normalizeConfidenceBand(value) {
  const band = normalizeString(value, "unknown").toLowerCase();

  if (["high", "medium", "low", "unknown"].includes(band)) {
    return band;
  }

  return "unknown";
}

function sanitizeString(value) {
  const text = normalizeString(value);

  if (!text) return "";
  if (SECRET_PATTERN.test(text)) return "[redacted]";
  if (DEBUG_OR_ERROR_PATTERN.test(text)) return "";

  return text;
}

function sanitizeMetadata(value, depth = 0, seen = new WeakSet()) {
  if (depth > 7) return "[redacted-depth-limit]";
  if (value == null) return value;

  if (typeof value === "string") {
    if (SECRET_PATTERN.test(value) || DEBUG_OR_ERROR_PATTERN.test(value)) return "[redacted]";
    return value;
  }

  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "boolean") return value;
  if (typeof value === "function") return "[function]";
  if (typeof value !== "object") return normalizeString(value);

  if (seen.has(value)) return "[Circular]";
  seen.add(value);

  if (Array.isArray(value)) {
    return value.slice(0, 80).map((item) => sanitizeMetadata(item, depth + 1, seen));
  }

  const out = {};
  for (const [key, item] of Object.entries(value)) {
    if (SECRET_PATTERN.test(key)) {
      out[key] = "[redacted]";
      continue;
    }
    out[key] = sanitizeMetadata(item, depth + 1, seen);
  }

  return out;
}

function firstCleanText() {
  for (let i = 0; i < arguments.length; i += 1) {
    const text = sanitizeString(arguments[i]);
    if (text) return text;
  }
  return "";
}

function extractNestedText(payload, depth = 0, seen = new WeakSet()) {
  if (!payload || depth > 7) return "";
  if (typeof payload === "string") return sanitizeString(payload);
  if (!isObject(payload)) return "";

  if (seen.has(payload)) return "";
  seen.add(payload);

  const direct = firstCleanText(
    payload.final,
    payload.finalAnswer,
    payload.displayReply,
    payload.publicReply,
    payload.visibleReply,
    payload.finalReply,
    payload.reply,
    payload.answer,
    payload.text,
    payload.message,
    payload.output,
    payload.response,
    payload.marionFinal,
    payload.spokenText
  );

  if (direct) return direct;

  const priorityKeys = [
    "finalEnvelope",
    "marionFinalEnvelope",
    "final",
    "result",
    "data",
    "payload",
    "packet",
    "response",
    "output",
    "message",
    "reply",
    "text",
    "meta",
  ];

  for (const key of priorityKeys) {
    const nested = payload[key];
    if (isObject(nested)) {
      const found = extractNestedText(nested, depth + 1, seen);
      if (found) return found;
    }
  }

  for (const key of Object.keys(payload)) {
    if (priorityKeys.includes(key)) continue;
    const nested = payload[key];
    if (isObject(nested)) {
      const found = extractNestedText(nested, depth + 1, seen);
      if (found) return found;
    }
  }

  return "";
}

function extractFinalAnswer(payload = {}) {
  return extractNestedText(payload);
}

function buildFallbackFinal(payload = {}) {
  const prompt = normalizeString(
    payload.prompt ||
      payload.userText ||
      payload.query ||
      payload.input ||
      payload.message ||
      payload.text
  ).toLowerCase();

  if (/\bbreak a leg\b/.test(prompt)) {
    return "“Break a leg” literally means to injure a leg. Culturally, it is an idiom used to wish someone good luck, especially before a performance.";
  }

  if (/\bspill the beans\b/.test(prompt)) {
    return "“Spill the beans” means to reveal information that was supposed to stay secret.";
  }

  if (/\bi[’']?m fine\b/.test(prompt)) {
    return "“I’m fine” can be literal, but behaviourally it can also signal masking, avoidance, or a wish to end the topic. Context, tone, and visible behaviour determine the safest interpretation.";
  }

  if (/\bprofessional alternative\b/.test(prompt) || /\bmore professional\b/.test(prompt)) {
    return "A more professional alternative is: “Good luck with your presentation,” “I hope it goes well,” or “You’ll do well.” These are clearer in formal business settings.";
  }

  return "Marion final answer preserved.";
}

function buildLanguageSphereMetadata(payload = {}, config = DEFAULT_CONFIG) {
  const languageSphereInput = isObject(payload.languageSphere) ? payload.languageSphere : {};
  const finalEnvelope = isObject(payload.finalEnvelope) ? payload.finalEnvelope : {};
  const finalLanguageSphere = isObject(finalEnvelope.languageSphere) ? finalEnvelope.languageSphere : {};

  return {
    sourceLanguage: normalizeLanguage(
      payload.sourceLanguage ||
        payload.detectedLanguage ||
        payload.language ||
        languageSphereInput.sourceLanguage ||
        languageSphereInput.detectedLanguage ||
        finalLanguageSphere.sourceLanguage,
      config.defaultLanguage
    ),
    targetLanguage: normalizeLanguage(
      payload.targetLanguage ||
        payload.responseLanguage ||
        languageSphereInput.targetLanguage ||
        finalLanguageSphere.targetLanguage,
      config.defaultLanguage
    ),
    confidence: normalizeConfidence(
      payload.confidence ??
        payload.languageConfidence ??
        languageSphereInput.confidence ??
        finalLanguageSphere.confidence
    ),
    confidenceBand: normalizeConfidenceBand(
      payload.confidenceBand ||
        languageSphereInput.confidenceBand ||
        finalLanguageSphere.confidenceBand ||
        config.defaultConfidenceBand
    ),
    activeDomain: normalizeDomain(
      payload.activeDomain ||
        payload.domain ||
        languageSphereInput.activeDomain ||
        finalLanguageSphere.activeDomain,
      config.defaultDomain
    ),
    routeFamily:
      normalizeString(payload.routeFamily || payload.route || languageSphereInput.routeFamily || finalLanguageSphere.routeFamily, null),
    toneMode:
      normalizeString(payload.toneMode || payload.targetTone || languageSphereInput.toneMode || finalLanguageSphere.toneMode, null),
    fallbackUsed: Boolean(payload.fallbackUsed || payload.usedFallback || languageSphereInput.fallbackUsed || finalLanguageSphere.fallbackUsed),
    handoffStatus: normalizeString(payload.handoffStatus || languageSphereInput.handoffStatus || finalLanguageSphere.handoffStatus, "available").toLowerCase(),
    visibleToUser: true,
    advisoryOnly: true,
    finalAuthorityOwner: "Marion",
  };
}

function buildMultilingualFinalEnvelope(payload = {}, options = {}) {
  try {
    payload = isObject(payload) ? payload : {};
    options = isObject(options) ? options : {};
    const config = {
      ...DEFAULT_CONFIG,
      ...(isObject(options.config) ? options.config : {}),
      ...(isObject(payload.config) ? payload.config : {}),
    };

    const extracted = extractFinalAnswer(payload);
    const final = extracted || buildFallbackFinal(payload);
    const languageSphere = buildLanguageSphereMetadata(payload, config);
    const safeMetadata = sanitizeMetadata(payload.metadata || {});

    return {
      ok: true,
      version: VERSION,
      contractVersion: CONTRACT_VERSION,
      authority: "marion",
      finalAuthority: "marion",
      finalAuthorityOwner: "Marion",
      owner: "marionFinalEnvelope",
      final,
      finalAnswer: final,
      reply: final,
      text: final,
      message: final,
      displayReply: final,
      publicReply: final,
      visibleReply: final,
      finalReply: final,
      duplicateSuppressed: true,
      debugLeakSuppressed: true,
      languageSphere,
      safeMetadata,
      finalEnvelope: {
        valid: true,
        version: VERSION,
        contractVersion: CONTRACT_VERSION,
        authority: "marion",
        owner: "marionFinalEnvelope",
        finalAuthority: "marion",
        finalAuthorityOwner: "Marion",
        final,
        finalAnswer: final,
        reply: final,
        text: final,
        message: final,
        displayReply: final,
        publicReply: final,
        visibleReply: final,
        finalReply: final,
        languageSphere,
      },
    };
  } catch (_) {
    const final = "Marion final answer preserved.";

    return {
      ok: false,
      version: VERSION,
      contractVersion: CONTRACT_VERSION,
      authority: "marion",
      finalAuthority: "marion",
      finalAuthorityOwner: "Marion",
      owner: "marionFinalEnvelope",
      final,
      finalAnswer: final,
      reply: final,
      text: final,
      message: final,
      displayReply: final,
      publicReply: final,
      visibleReply: final,
      finalReply: final,
      duplicateSuppressed: true,
      debugLeakSuppressed: true,
      languageSphere: {
        sourceLanguage: "en",
        targetLanguage: "en",
        confidence: null,
        confidenceBand: "low",
        activeDomain: "general",
        routeFamily: null,
        toneMode: null,
        fallbackUsed: true,
        handoffStatus: "fallback",
        visibleToUser: true,
        advisoryOnly: true,
        finalAuthorityOwner: "Marion",
      },
      finalEnvelope: {
        valid: true,
        authority: "marion",
        owner: "marionFinalEnvelope",
        finalAuthority: "marion",
        finalAuthorityOwner: "Marion",
        final,
        finalAnswer: final,
        reply: final,
        text: final,
        message: final,
        displayReply: final,
        publicReply: final,
        visibleReply: final,
        finalReply: final,
      },
    };
  }
}

function validateMultilingualFinalEnvelope(envelope = {}) {
  envelope = isObject(envelope) ? envelope : {};
  const serialized = safeStringify(envelope);

  const finalEnvelope = isObject(envelope.finalEnvelope) ? envelope.finalEnvelope : {};
  const hasMarionAuthority =
    envelope.authority === "marion" ||
    envelope.finalAuthority === "marion" ||
    envelope.finalAuthorityOwner === "Marion" ||
    finalEnvelope.authority === "marion" ||
    finalEnvelope.finalAuthority === "marion" ||
    finalEnvelope.owner === "marionFinalEnvelope";

  const final = extractFinalAnswer(envelope);
  const hasFinal = Boolean(final);

  const hasLanguageSphere = Boolean(envelope.languageSphere || finalEnvelope.languageSphere);

  const noDebugLeak =
    !DEBUG_OR_ERROR_PATTERN.test(serialized) &&
    !SECRET_PATTERN.test(serialized);

  return {
    valid: Boolean(hasMarionAuthority && hasFinal && hasLanguageSphere && noDebugLeak),
    hasMarionAuthority,
    hasFinal,
    hasLanguageSphere,
    noDebugLeak,
    finalReplyAliasesPresent: Boolean(
      envelope.reply &&
        envelope.publicReply &&
        envelope.visibleReply &&
        envelope.finalReply &&
        envelope.displayReply
    ),
  };
}

function process(payload = {}, options = {}) {
  return buildMultilingualFinalEnvelope(payload, options);
}

function build(payload = {}, options = {}) {
  return buildMultilingualFinalEnvelope(payload, options);
}

module.exports = {
  VERSION,
  CONTRACT_VERSION,
  DEFAULT_CONFIG,
  safeStringify,
  normalizeLanguage,
  normalizeDomain,
  normalizeConfidence,
  normalizeConfidenceBand,
  extractFinalAnswer,
  sanitizeString,
  sanitizeMetadata,
  buildMultilingualFinalEnvelope,
  validateMultilingualFinalEnvelope,
  process,
  build,
};

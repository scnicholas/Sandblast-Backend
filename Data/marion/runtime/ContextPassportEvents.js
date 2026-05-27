"use strict";

/**
 * ContextPassportEvents
 *
 * Purpose:
 * Converts LanguageSphere internal state into safe, user-visible event metadata.
 *
 * Contract:
 * - Never throws.
 * - Does not expose secrets, stack traces, tokens, or raw debug payloads.
 * - Keeps Marion as final authority.
 * - Emits structured events Nyx can later display.
 */

const DEFAULT_EVENT_TYPES = Object.freeze({
  LANGUAGE_DETECTED: "LANGUAGE_DETECTED",
  LANGUAGE_CONFIDENCE_SCORED: "LANGUAGE_CONFIDENCE_SCORED",
  DOMAIN_ROUTE_SELECTED: "DOMAIN_ROUTE_SELECTED",
  TONE_ADAPTATION_APPLIED: "TONE_ADAPTATION_APPLIED",
  LANGUAGE_LAYER_ACTIVE: "LANGUAGE_LAYER_ACTIVE",
  SAFE_HANDOFF_AVAILABLE: "SAFE_HANDOFF_AVAILABLE",
  MARION_FINAL_AUTHORIZED: "MARION_FINAL_AUTHORIZED",
  FALLBACK_USED: "FALLBACK_USED",
});

const DEFAULT_CONFIG = {
  authority: "marion",
  visibleToUser: true,
  defaultLanguage: "en",
  defaultDomain: "general",
  allowedLanguages: ["en", "es", "fr"],
  allowedDomains: [
    "general",
    "ai",
    "psychology",
    "english",
    "finance",
    "law",
    "cyber",
    "business",
  ],
  maxEvents: 20,
};

function normalizeString(value, fallback = "") {
  const normalized = String(value || "").trim();
  return normalized || fallback;
}

function normalizeLanguage(value, config = DEFAULT_CONFIG) {
  const raw = normalizeString(value, config.defaultLanguage).toLowerCase();

  if (raw === "eng") return "en";
  if (raw === "spa" || raw === "es-419") return "es";
  if (raw === "fre" || raw === "fra") return "fr";
  if (raw.includes("-")) return raw.split("-")[0];

  return Array.isArray(config.allowedLanguages) && config.allowedLanguages.includes(raw)
    ? raw
    : config.defaultLanguage;
}

function normalizeDomain(value, config = DEFAULT_CONFIG) {
  const raw = normalizeString(value, config.defaultDomain)
    .toLowerCase()
    .replace(/\s+/g, "_");

  return Array.isArray(config.allowedDomains) && config.allowedDomains.includes(raw)
    ? raw
    : config.defaultDomain;
}

function normalizeConfidenceBand(value) {
  const band = normalizeString(value, "unknown").toLowerCase();

  if (["high", "medium", "low", "unknown"].includes(band)) {
    return band;
  }

  return "unknown";
}

function safeStringify(value) {
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

function stripUnsafe(value) {
  if (!value || typeof value !== "object") return value;

  const unsafeKeys = new Set([
    "token",
    "apiKey",
    "apikey",
    "authorization",
    "password",
    "secret",
    "stack",
    "debugError",
    "rawError",
    "headers",
  ]);

  const output = Array.isArray(value) ? [] : {};

  for (const [key, item] of Object.entries(value)) {
    const lowered = key.toLowerCase();

    if (unsafeKeys.has(lowered) || lowered.includes("token") || lowered.includes("secret")) {
      output[key] = "[redacted]";
      continue;
    }

    if (item && typeof item === "object") {
      output[key] = stripUnsafe(item);
    } else if (typeof item === "string" && /bearer\s+|api[_-]?key|stack trace|typeerror|referenceerror/i.test(item)) {
      output[key] = "[redacted]";
    } else {
      output[key] = item;
    }
  }

  return output;
}

function makeEvent(type, payload = {}, options = {}) {
  const config = {
    ...DEFAULT_CONFIG,
    ...(options.config || payload.config || {}),
  };

  const safePayload = stripUnsafe(payload);

  return {
    type,
    requestId: normalizeString(safePayload.requestId, "languagesphere-event"),
    timestamp: new Date().toISOString(),
    authority: "marion",
    visibleToUser:
      typeof safePayload.visibleToUser === "boolean"
        ? safePayload.visibleToUser
        : config.visibleToUser,
    language: normalizeLanguage(
      safePayload.language ||
        safePayload.detectedLanguage ||
        safePayload.sourceLanguage,
      config
    ),
    targetLanguage: normalizeLanguage(
      safePayload.targetLanguage ||
        safePayload.responseLanguage ||
        safePayload.language,
      config
    ),
    domain: normalizeDomain(
      safePayload.domain ||
        safePayload.activeDomain ||
        safePayload.routeDomain,
      config
    ),
    confidence:
      typeof safePayload.confidence === "number"
        ? Math.max(0, Math.min(1, safePayload.confidence))
        : null,
    confidenceBand: normalizeConfidenceBand(safePayload.confidenceBand),
    toneMode: normalizeString(safePayload.toneMode || safePayload.targetTone, null),
    routeFamily: normalizeString(safePayload.routeFamily || safePayload.route, null),
    fallbackUsed: Boolean(safePayload.fallbackUsed || safePayload.usedFallback),
    handoffStatus: normalizeString(safePayload.handoffStatus, "available"),
    metadata: stripUnsafe(safePayload.metadata || {}),
  };
}

function emitContextPassportEvents(payload = {}, options = {}) {
  try {
    const config = {
      ...DEFAULT_CONFIG,
      ...(options.config || payload.config || {}),
    };

    const events = [];

    events.push(
      makeEvent(DEFAULT_EVENT_TYPES.LANGUAGE_DETECTED, payload, { config })
    );

    events.push(
      makeEvent(DEFAULT_EVENT_TYPES.LANGUAGE_CONFIDENCE_SCORED, payload, { config })
    );

    events.push(
      makeEvent(DEFAULT_EVENT_TYPES.DOMAIN_ROUTE_SELECTED, payload, { config })
    );

    if (payload.toneMode || payload.targetTone || payload.adaptationApplied) {
      events.push(
        makeEvent(DEFAULT_EVENT_TYPES.TONE_ADAPTATION_APPLIED, payload, { config })
      );
    }

    events.push(
      makeEvent(DEFAULT_EVENT_TYPES.LANGUAGE_LAYER_ACTIVE, payload, { config })
    );

    events.push(
      makeEvent(DEFAULT_EVENT_TYPES.SAFE_HANDOFF_AVAILABLE, payload, { config })
    );

    if (payload.fallbackUsed || payload.usedFallback) {
      events.push(
        makeEvent(DEFAULT_EVENT_TYPES.FALLBACK_USED, payload, { config })
      );
    }

    events.push(
      makeEvent(DEFAULT_EVENT_TYPES.MARION_FINAL_AUTHORIZED, payload, { config })
    );

    return {
      ok: true,
      authority: "marion",
      requestId: normalizeString(payload.requestId, "languagesphere-events"),
      contextPassport: {
        visibleToUser: true,
        activeLanguage: normalizeLanguage(
          payload.sourceLanguage || payload.detectedLanguage || payload.language,
          config
        ),
        targetLanguage: normalizeLanguage(
          payload.targetLanguage || payload.responseLanguage,
          config
        ),
        activeDomain: normalizeDomain(
          payload.activeDomain || payload.domain,
          config
        ),
        confidenceBand: normalizeConfidenceBand(payload.confidenceBand),
        handoffStatus: normalizeString(payload.handoffStatus, "available"),
        finalAuthority: "marion",
      },
      events: events.slice(0, Number(config.maxEvents || 20)),
    };
  } catch (_) {
    return {
      ok: false,
      authority: "marion",
      requestId: "languagesphere-events-fallback",
      contextPassport: {
        visibleToUser: true,
        activeLanguage: DEFAULT_CONFIG.defaultLanguage,
        targetLanguage: DEFAULT_CONFIG.defaultLanguage,
        activeDomain: DEFAULT_CONFIG.defaultDomain,
        confidenceBand: "low",
        handoffStatus: "fallback",
        finalAuthority: "marion",
      },
      events: [
        makeEvent(DEFAULT_EVENT_TYPES.FALLBACK_USED, {
          requestId: "languagesphere-events-fallback",
          fallbackUsed: true,
          sourceLanguage: "en",
          targetLanguage: "en",
          domain: "general",
        }),
        makeEvent(DEFAULT_EVENT_TYPES.MARION_FINAL_AUTHORIZED, {
          requestId: "languagesphere-events-fallback",
          sourceLanguage: "en",
          targetLanguage: "en",
          domain: "general",
        }),
      ],
    };
  }
}

function process(payload = {}, options = {}) {
  return emitContextPassportEvents(payload, options);
}

function emit(payload = {}, options = {}) {
  return emitContextPassportEvents(payload, options);
}

module.exports = {
  DEFAULT_EVENT_TYPES,
  DEFAULT_CONFIG,
  normalizeLanguage,
  normalizeDomain,
  normalizeConfidenceBand,
  safeStringify,
  stripUnsafe,
  makeEvent,
  emitContextPassportEvents,
  process,
  emit,
};

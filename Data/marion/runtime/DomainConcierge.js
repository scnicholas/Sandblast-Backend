"use strict";

/**
 * DomainConcierge.js
 *
 * Purpose:
 * - Runtime orchestration layer between QuestionShapeNormalizer, marionIntentRouter,
 *   StateSpine carry, and ComposeMarionResponse.
 * - Decide whether the turn should route, clarify, or fail closed.
 * - Attach clean concierge metadata for Marion without composing the final user answer.
 *
 * Architectural rules:
 * - Does not write full final replies.
 * - Does not bypass MarionBridge or ChatEngine final-authority gates.
 * - Does not mutate StateSpine directly.
 * - Does not expose diagnostics/debug metadata to the user.
 * - Fails open for high-confidence technical/directive turns.
 * - Fails closed into one clarifier only when routing confidence is genuinely weak/ambiguous.
 */

const VERSION = "PRIORITY-9F-DEEP-CONVERSATIONAL-STACK + DomainConcierge v1.2.0 PRIORITY2-ROUTE-CLARIFY-HARDENING + DEFENSIVE-INTENT-CARRY + CONFIDENCE-AWARE-SHAPING-CARRY + CORE-RUNTIME-ROUTE-CLARIFY-FALLBACK-LOCK";
const DOMAIN_CONCIERGE_VERSION = "nyx.marion.domainConcierge/1.0";
const DOMAIN_CONFIDENCE_VERSION = "nyx.marion.domainConfidence/1.1";
const CONFIDENCE_AWARE_RESPONSE_SHAPING_VERSION = "nyx.marion.confidenceAwareResponseShaping/1.0";
const STATE_SPINE_SCHEMA = "nyx.marion.stateSpine/1.7";
const QUESTION_SHAPE_NORMALIZATION_VERSION = "nyx.marion.questionShapeNormalization/1.0";
const PROTECTIVE_ESCALATION_ROUTING_VERSION = "nyx.marion.protectiveEscalationRouting/1.0";

const DEFAULT_CONFIG = Object.freeze({
  highConfidence: 0.82,
  mediumConfidence: 0.62,
  lowConfidence: 0.48,
  clarifyBelow: 0.62,
  failClosedBelow: 0.38,
  marginClarifyBelow: 0.08,
  allowClarifier: true,
  maxCandidates: 6,
  source: "DomainConcierge",
  defaultRoute: "general",
  defaultIntent: "simple_chat",
  defaultClarifier: "Are you asking about the interface, radio/media, Roku, business strategy, or backend technical work?"
});

const VALID_ACTIONS = Object.freeze([
  "route",
  "clarify",
  "fallback"
]);

const HIGH_PRIORITY_INTENTS = Object.freeze([
  "technical_debug",
  "directive_response",
  "contextual_directive",
  "identity_query",
  "identity_or_memory",
  "emotional_support"
]);

const BUILTIN_DOMAIN_REGISTRY = Object.freeze({
  general: Object.freeze({ label: "General", enabled: true }),
  technical: Object.freeze({ label: "Technical", enabled: true }),
  emotional: Object.freeze({ label: "Emotional support", enabled: true }),
  business: Object.freeze({ label: "Business", enabled: true }),
  advertising: Object.freeze({ label: "Advertising", enabled: true }),
  media: Object.freeze({ label: "Media", enabled: true }),
  music: Object.freeze({ label: "Music", enabled: true }),
  radio: Object.freeze({ label: "Radio", enabled: true }),
  news: Object.freeze({ label: "News", enabled: true }),
  roku: Object.freeze({ label: "Roku", enabled: true }),
  identity: Object.freeze({ label: "Identity", enabled: true }),
  memory: Object.freeze({ label: "Memory", enabled: true }),
  execution: Object.freeze({ label: "Execution", enabled: true }),
  execution_context: Object.freeze({ label: "Contextual execution", enabled: true }),
  general_reasoning: Object.freeze({ label: "General reasoning", enabled: true }),
  english: Object.freeze({ label: "English", enabled: true }),
  psychology: Object.freeze({ label: "Psychology", enabled: true }),
  ai: Object.freeze({ label: "AI", enabled: true }),
  cyber: Object.freeze({ label: "Cybersecurity", enabled: true }),
  law: Object.freeze({ label: "Law", enabled: true }),
  finance: Object.freeze({ label: "Finance", enabled: true }),
  support: Object.freeze({ label: "Support", enabled: true }),
  onboarding: Object.freeze({ label: "Onboarding", enabled: true }),
  unknown: Object.freeze({ label: "Unknown", enabled: true }),
  unclear: Object.freeze({ label: "Unclear", enabled: true })
});

const OPTIONAL_ROUTER_PATHS = Object.freeze([
  "./marionIntentRouter.js",
  "./marionIntentRouter",
  "./Data/marion/runtime/marionIntentRouter.js",
  "./Data/marion/runtime/marionIntentRouter",
  "../runtime/marionIntentRouter.js",
  "../runtime/marionIntentRouter"
]);

const OPTIONAL_NORMALIZER_PATHS = Object.freeze([
  "./QuestionShapeNormalizer.js",
  "./QuestionShapeNormalizer",
  "./Data/marion/runtime/QuestionShapeNormalizer.js",
  "./Data/marion/runtime/QuestionShapeNormalizer",
  "../runtime/QuestionShapeNormalizer.js",
  "../runtime/QuestionShapeNormalizer"
]);

const OPTIONAL_REGISTRY_PATHS = Object.freeze([
  "./marionDomainRegistry.js",
  "./marionDomainRegistry",
  "./Data/marion/runtime/marionDomainRegistry.js",
  "./Data/marion/runtime/marionDomainRegistry",
  "../runtime/marionDomainRegistry.js",
  "../runtime/marionDomainRegistry"
]);

function tryRequireOptional(paths) {
  const list = Array.isArray(paths) ? paths : [];
  for (let i = 0; i < list.length; i += 1) {
    try {
      const mod = require(list[i]);
      if (mod) return mod;
    } catch (_err) {}
  }
  return null;
}

const routerMod = tryRequireOptional(OPTIONAL_ROUTER_PATHS);
const normalizerMod = tryRequireOptional(OPTIONAL_NORMALIZER_PATHS);
const registryMod = tryRequireOptional(OPTIONAL_REGISTRY_PATHS);
const domainConfidenceMod = tryRequireOptional(["./domainConfidence.js", "./domainConfidence", "./Data/marion/runtime/domainConfidence.js", "./Data/marion/runtime/domainConfidence", "../runtime/domainConfidence.js", "../runtime/domainConfidence"]);

function safeStr(value) {
  return value == null ? "" : String(value).replace(/\s+/g, " ").trim();
}

function lower(value) {
  return safeStr(value).toLowerCase();
}

function isObj(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function safeObj(value) {
  return isObj(value) ? value : {};
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function clamp01(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return Number.isFinite(Number(fallback)) ? Math.max(0, Math.min(1, Number(fallback))) : 0;
  return Math.max(0, Math.min(1, n));
}

function firstText() {
  for (let i = 0; i < arguments.length; i += 1) {
    const value = safeStr(arguments[i]);
    if (value) return value;
  }
  return "";
}

function compactKey(value) {
  return lower(value).replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function nowIso() {
  return new Date().toISOString();
}

function hashText(value) {
  const s = lower(value).replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}

function mergeConfig(options) {
  const o = safeObj(options);
  return {
    highConfidence: clamp01(o.highConfidence, DEFAULT_CONFIG.highConfidence),
    mediumConfidence: clamp01(o.mediumConfidence, DEFAULT_CONFIG.mediumConfidence),
    lowConfidence: clamp01(o.lowConfidence, DEFAULT_CONFIG.lowConfidence),
    clarifyBelow: clamp01(o.clarifyBelow, DEFAULT_CONFIG.clarifyBelow),
    failClosedBelow: clamp01(o.failClosedBelow, DEFAULT_CONFIG.failClosedBelow),
    marginClarifyBelow: clamp01(o.marginClarifyBelow, DEFAULT_CONFIG.marginClarifyBelow),
    allowClarifier: o.allowClarifier !== false,
    maxCandidates: Math.max(1, Math.min(12, Math.trunc(Number(o.maxCandidates || DEFAULT_CONFIG.maxCandidates)))),
    source: firstText(o.source, DEFAULT_CONFIG.source),
    defaultRoute: firstText(o.defaultRoute, DEFAULT_CONFIG.defaultRoute),
    defaultIntent: firstText(o.defaultIntent, DEFAULT_CONFIG.defaultIntent),
    defaultClarifier: firstText(o.defaultClarifier, DEFAULT_CONFIG.defaultClarifier)
  };
}

function normalizeInputSource(value) {
  const raw = lower(value);
  if (/voice|speech|mic|audio|headset/.test(raw)) return "voice";
  if (/text|typed|keyboard|manual/.test(raw)) return "text";
  return raw || "text";
}

function extractText(packet) {
  const p = safeObj(packet);
  const payload = safeObj(p.payload);
  const meta = safeObj(p.meta);
  const session = safeObj(p.session);
  return firstText(
    p.text,
    p.userText,
    p.message,
    p.prompt,
    p.rawUserText,
    p.normalizedUserIntent,
    payload.text,
    payload.userText,
    payload.message,
    meta.text,
    meta.userText,
    session.lastUserText
  );
}

function fallbackQuestionShape(text) {
  const raw = safeStr(text);
  return {
    version: QUESTION_SHAPE_NORMALIZATION_VERSION,
    rawText: raw,
    normalizedText: raw,
    normalizedUserIntent: raw,
    questionShape: "direct_or_unknown",
    changed: false,
    reason: raw ? "domain_concierge_passthrough" : "empty_input",
    source: "DomainConcierge.fallbackQuestionShape"
  };
}

function normalizeQuestionShapeSafe(text, packet) {
  const p = safeObj(packet);

  if (isObj(p.questionShape) && firstText(p.questionShape.normalizedText, p.questionShape.normalizedUserIntent, p.questionShape.rawText)) {
    const qs = p.questionShape;
    return {
      version: firstText(qs.version, QUESTION_SHAPE_NORMALIZATION_VERSION),
      rawText: firstText(qs.rawText, text),
      normalizedText: firstText(qs.normalizedText, qs.normalizedUserIntent, text),
      normalizedUserIntent: firstText(qs.normalizedUserIntent, qs.normalizedText, text),
      questionShape: firstText(qs.questionShape, "direct_or_unknown"),
      changed: !!qs.changed,
      reason: firstText(qs.reason, "existing_question_shape"),
      source: firstText(qs.source, "existing")
    };
  }

  if (normalizerMod && typeof normalizerMod.normalizeQuestionShape === "function") {
    try {
      const normalized = normalizerMod.normalizeQuestionShape(text);
      if (isObj(normalized)) {
        return {
          version: firstText(normalized.version, QUESTION_SHAPE_NORMALIZATION_VERSION),
          rawText: firstText(normalized.rawText, text),
          normalizedText: firstText(normalized.normalizedText, normalized.normalizedUserIntent, text),
          normalizedUserIntent: firstText(normalized.normalizedUserIntent, normalized.normalizedText, text),
          questionShape: firstText(normalized.questionShape, "direct_or_unknown"),
          changed: !!normalized.changed,
          reason: firstText(normalized.reason, "QuestionShapeNormalizer"),
          source: firstText(normalized.source, "QuestionShapeNormalizer")
        };
      }
    } catch (_err) {}
  }

  if (routerMod && typeof routerMod.normalizeQuestionShape === "function") {
    try {
      const normalized = routerMod.normalizeQuestionShape(text);
      if (isObj(normalized)) {
        return {
          version: firstText(normalized.version, QUESTION_SHAPE_NORMALIZATION_VERSION),
          rawText: firstText(normalized.rawText, text),
          normalizedText: firstText(normalized.normalizedText, normalized.normalizedUserIntent, text),
          normalizedUserIntent: firstText(normalized.normalizedUserIntent, normalized.normalizedText, text),
          questionShape: firstText(normalized.questionShape, "direct_or_unknown"),
          changed: !!normalized.changed,
          reason: firstText(normalized.reason, "marionIntentRouter.normalizeQuestionShape"),
          source: firstText(normalized.source, "marionIntentRouter")
        };
      }
    } catch (_err) {}
  }

  return fallbackQuestionShape(text);
}

function extractProtectiveEscalation(packet = {}, routeResult = {}) {
  const p = safeObj(packet);
  const r = safeObj(routeResult);
  const routing = safeObj(r.routing);
  const marionIntent = safeObj(r.marionIntent);
  const signal = safeObj(
    safeObj(p.signals).protectiveEscalation ||
    p.protectiveEscalation ||
    safeObj(p.meta).protectiveEscalation ||
    marionIntent.protectiveEscalation ||
    routing.protectiveEscalation
  );
  const text = lower(firstText(extractText(p), r.rawUserText, r.normalizedUserIntent, marionIntent.turnText));
  const guardians = [];
  if (/\baster\b/i.test(text) || safeArray(signal.guardians).includes("aster")) guardians.push("aster");
  if (/\b(talon|thalon)\b/i.test(text) || safeArray(signal.guardians).includes("thalon")) guardians.push("thalon");
  if (/\bmarion\b/i.test(text) || safeArray(signal.guardians).includes("marion")) guardians.push("marion");
  const detected = signal.detected === true || /\b(defen[cs]e|defensive|protect|protection|protective|personal safety|emergency|threat|alarm|alert|escalation|boundary|guardrail|intent justifier|verified command|code word|codeword|ethical boundary)\b/i.test(text);
  return {
    version: PROTECTIVE_ESCALATION_ROUTING_VERSION,
    detected,
    active: detected,
    guardians: Array.from(new Set(guardians.concat(safeArray(signal.guardians).map(safeStr).filter(Boolean)))),
    requiresEthicalGate: detected,
    requiresVerifiedIntent: detected,
    protectivePurposeOnly: true,
    boundedOutputRequired: true,
    routeLock: detected,
    noPunitiveUse: true,
    noCoerciveUse: true,
    noContinuousAlarm: true,
    reason: detected ? "domain_concierge_protective_escalation_carry" : "none"
  };
}

function hasPriorityTwoTechnicalSignal(packet = {}) {
  const p = safeObj(packet);
  const text = lower(extractText(p));
  const hints = safeObj(p.routingHints);
  const signals = safeObj(p.signals);
  return hints.forceTechnical === true || hints.preferTechnical === true || signals.priorityTwoRoutingLock === true ||
    /\b(priority\s*(?:number\s*)?(?:two|2)|command routing|intent router|command normalizer|guardian pipeline|guardian\.pipeline\.router|domain concierge|domain registry|domain retriever|surgical autopsy|critical fixes|downloadable zip)\b/i.test(text);
}

function routeWithRouter(packet) {
  const p = safeObj(packet);

  if (isObj(p.routeResult)) return p.routeResult;
  if (isObj(p.routed)) return p.routed;
  if (isObj(p.routing) && firstText(p.routing.domain, p.routing.intent)) {
    return {
      ok: true,
      final: false,
      routing: p.routing,
      marionIntent: safeObj(p.marionIntent),
      domainConfidence: p.routing.domainConfidence || p.domainConfidence || {},
      questionShape: p.questionShape || {},
      rawUserText: extractText(p),
      normalizedUserIntent: firstText(p.normalizedUserIntent, extractText(p)),
      source: "existing_routing"
    };
  }

  if (routerMod && typeof routerMod.routeMarionIntent === "function") {
    try {
      return routerMod.routeMarionIntent(p);
    } catch (err) {
      return {
        ok: false,
        final: false,
        error: safeStr(err && err.message ? err.message : err),
        source: "DomainConcierge.routeWithRouter"
      };
    }
  }

  if (hasPriorityTwoTechnicalSignal(p)) {
    return {
      ok: true,
      final: false,
      routing: {
        domain: "technical",
        intent: "technical_debug",
        mode: "forensic_autopsy",
        depth: "forensic",
        routeLock: true,
        domainConfidence: {
          version: DOMAIN_CONFIDENCE_VERSION,
          confidence: 0.94,
          band: "high",
          primaryDomain: "technical",
          selectedDomain: "technical",
          routeLocked: true,
          ambiguous: false,
          failClosed: false,
          reason: "domain_concierge_priority_two_router_fallback"
        }
      },
      marionIntent: { intent: "technical_debug", confidence: 0.94, reason: "priority_two_command_routing_fallback" },
      domainConfidence: { confidence: 0.94, band: "high", primaryDomain: "technical", selectedDomain: "technical", routeLocked: true },
      questionShape: p.questionShape || {},
      rawUserText: extractText(p),
      normalizedUserIntent: firstText(p.normalizedUserIntent, extractText(p)),
      source: "DomainConcierge.routeWithRouter.priorityTwoFallback"
    };
  }

  return {
    ok: false,
    final: false,
    error: "marionIntentRouter unavailable",
    source: "DomainConcierge.routeWithRouter"
  };
}

function confidenceBand(confidence) {
  const c = clamp01(confidence, 0);
  if (c >= 0.92) return "high";
  if (c >= 0.72) return "medium";
  if (c >= 0.52) return "low";
  return "weak";
}

function normalizeCandidate(candidate) {
  const c = safeObj(candidate);
  const domain = firstText(c.domain, c.primaryDomain, c.route, c.name, c.key);
  if (!domain) return null;
  return {
    domain: compactKey(domain),
    label: firstText(c.label, c.userFacingLabel, domain),
    confidence: clamp01(c.confidence, c.score || 0),
    reasons: safeArray(c.reasons).map(safeStr).filter(Boolean).slice(0, 4)
  };
}

function extractCandidates(routeResult, config) {
  const r = safeObj(routeResult);
  const routing = safeObj(r.routing);
  const dc = safeObj(r.domainConfidence || routing.domainConfidence);
  const candidates = []
    .concat(safeArray(dc.candidates))
    .concat(safeArray(r.candidates))
    .concat(safeArray(routing.candidates))
    .map(normalizeCandidate)
    .filter(Boolean);

  const seen = new Set();
  const unique = [];
  for (let i = 0; i < candidates.length; i += 1) {
    const key = candidates[i].domain;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push(candidates[i]);
  }

  return unique
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, config.maxCandidates);
}

function normalizeDomainConfidence(routeResult, route, intent, config) {
  const r = safeObj(routeResult);
  const routing = safeObj(r.routing);
  const marionIntent = safeObj(r.marionIntent);
  const raw = safeObj(r.domainConfidence || routing.domainConfidence || marionIntent.domainConfidence);

  const fallbackConfidence = clamp01(
    firstText(raw.confidence, routing.confidence, marionIntent.confidence, r.confidence),
    intent ? 0.58 : 0.3
  );

  const candidates = extractCandidates(routeResult, config);
  let margin = Number(raw.margin);
  if (!Number.isFinite(margin) && candidates.length >= 2) {
    margin = Math.max(0, candidates[0].confidence - candidates[1].confidence);
  }
  if (!Number.isFinite(margin)) margin = 0;

  const primaryDomain = compactKey(firstText(raw.primaryDomain, raw.selectedDomain, raw.domain, route, config.defaultRoute));
  const routeLocked = !!(raw.routeLocked || raw.routeLock || fallbackConfidence >= config.highConfidence || HIGH_PRIORITY_INTENTS.includes(intent));
  const ambiguous = !!(
    raw.ambiguous ||
    (!routeLocked && fallbackConfidence < config.mediumConfidence) ||
    (!routeLocked && margin > 0 && margin < config.marginClarifyBelow)
  );

  const base = {
    version: firstText(raw.version, DOMAIN_CONFIDENCE_VERSION),
    confidence: fallbackConfidence,
    confidenceScore: fallbackConfidence,
    band: firstText(raw.band, confidenceBand(fallbackConfidence)),
    confidenceBand: firstText(raw.confidenceBand, raw.band, confidenceBand(fallbackConfidence)),
    margin,
    ambiguous,
    routeLocked,
    failClosed: !!(raw.failClosed || (ambiguous && !routeLocked && fallbackConfidence < config.mediumConfidence)),
    needsClarifier: !!(ambiguous && !routeLocked),
    primaryDomain,
    selectedDomain: primaryDomain,
    secondaryDomains: candidates.slice(1, 4).map((c) => c.domain).filter(Boolean),
    knowledgeDomain: compactKey(firstText(raw.knowledgeDomain, routing.knowledgeDomain, marionIntent.knowledgeDomain)),
    answerMode: firstText(raw.answerMode, fallbackConfidence >= config.highConfidence ? "direct" : (fallbackConfidence >= config.mediumConfidence ? "grounded" : "clarify")),
    fallbackReason: firstText(raw.fallbackReason, ""),
    reason: firstText(raw.reason, marionIntent.reason, r.reason, "domain_concierge_confidence_normalized"),
    candidates,
    noCrossDomainBleed: true,
    noUserFacingDiagnostics: true,
    protectiveEscalationRouting: true,
    protectiveEscalationRoutingVersion: PROTECTIVE_ESCALATION_ROUTING_VERSION
  };
  if (domainConfidenceMod && typeof domainConfidenceMod.normalizeDomainConfidenceProfile === "function") {
    try {
      return domainConfidenceMod.normalizeDomainConfidenceProfile(base, {
        rawText: extractText(routeResult),
        intent,
        domain: route,
        candidates,
        confidence: fallbackConfidence
      });
    } catch (_err) {}
  }
  return base;
}

function domainExists(domain) {
  const key = compactKey(domain);
  if (!key) return false;

  if (registryMod) {
    try {
      if (typeof registryMod.hasDomain === "function") return !!registryMod.hasDomain(key);
      if (typeof registryMod.getDomainConfig === "function") {
        const cfg = registryMod.getDomainConfig(key);
        if (isObj(cfg) && Object.keys(cfg).length) return cfg.enabled !== false;
      }
      if (typeof registryMod.getDomainWiringStatus === "function") {
        const status = registryMod.getDomainWiringStatus(key, { includePack: false });
        if (isObj(status) && Object.keys(status).length) {
          return status.ready !== false && status.disabled !== true;
        }
      }
    } catch (_err) {}
  }

  return !!BUILTIN_DOMAIN_REGISTRY[key];
}

function domainLabel(domain) {
  const key = compactKey(domain);
  if (!key) return "";
  if (registryMod && typeof registryMod.getDomainConfig === "function") {
    try {
      const cfg = safeObj(registryMod.getDomainConfig(key));
      const label = firstText(cfg.userFacingLabel, cfg.label, cfg.title, cfg.domain);
      if (label) return label;
    } catch (_err) {}
  }
  return firstText(safeObj(BUILTIN_DOMAIN_REGISTRY[key]).label, key);
}

function isDirectiveOrTechnical(intent, route, text, routeResult) {
  const t = lower(text);
  const r = compactKey(route);
  const i = compactKey(intent);
  const rr = safeObj(routeResult);
  const mi = safeObj(rr.marionIntent);
  return HIGH_PRIORITY_INTENTS.includes(intent) ||
    i === "technical_debug" ||
    i === "directive_response" ||
    i === "contextual_directive" ||
    r === "technical" ||
    r === "execution" ||
    r === "execution_context" ||
    !!mi.directiveExecutionRequired ||
    !!mi.technicalFollowUpLock ||
    /\b(file|files|zip|download|resend|update|patch|fix|replace|audit|autopsy|line[-\s]?by[-\s]?line|structural integrity|architecture|deploy|validate|node --check|backend|frontend|widget|script|code|html|css|javascript|js|api\/chat|runtime|router|composer|state spine|statespine|marion|nyx|marionbridge|chatengine|composemarionresponse|intent router|domain registry|domain concierge)\b/i.test(t);
}

function buildClarifier(route, intent, domainConfidence, packet, routeResult, config) {
  const p = safeObj(packet);
  const text = lower(extractText(p));
  const candidates = safeArray(domainConfidence.candidates);
  const candidateLabels = candidates
    .filter((c) => c && c.domain && !["unknown", "unclear"].includes(c.domain))
    .slice(0, 3)
    .map((c) => domainLabel(c.domain))
    .filter(Boolean);

  if (/roku|channel|feed|playlist|ott|linear|deep link|deeplink/.test(text)) {
    return "Are you asking about Roku setup, Roku advertising, or the media feed itself?";
  }

  if (/radio|stream|listener|station|music|playlist|artist|programming/.test(text)) {
    return "Are you asking about the radio stream, programming, advertising, or audience growth?";
  }

  if (/ad|advertis|sponsor|buyer|moneti[sz]e|revenue|sell|pitch/.test(text)) {
    return "Are you aiming this at interface buyers, radio sponsors, Roku advertisers, or all three?";
  }

  if (/translate|language|caption|spanish|french|mandarin|portuguese/.test(text)) {
    return "Are you asking about translation, captions, or language routing inside the interface?";
  }

  if (/support|help|problem|issue|broken|not working|error/.test(text)) {
    return "Is this a user-facing support issue, a backend technical issue, or a frontend widget issue?";
  }

  if (candidateLabels.length >= 2) {
    return `Do you want me to route this under ${candidateLabels.join(", ")}?`;
  }

  const existing = firstText(
    p.clarifier,
    safeObj(routeResult).clarifier,
    safeObj(safeObj(routeResult).routing).clarifier
  );
  return existing || config.defaultClarifier;
}

function decideAction(route, intent, domainConfidence, packet, routeResult, config) {
  const text = extractText(packet);
  const c = clamp01(domainConfidence.confidence, 0);
  const ambiguous = !!domainConfidence.ambiguous;
  const failClosed = !!domainConfidence.failClosed;
  const validDomain = domainExists(route);
  const directiveOrTechnical = isDirectiveOrTechnical(intent, route, text, routeResult);
  const protectiveEscalation = extractProtectiveEscalation(packet, routeResult);

  if (!text) {
    return {
      action: "fallback",
      reason: "empty_input",
      needsClarifier: false
    };
  }

  if (protectiveEscalation.active) {
    return {
      action: "route",
      reason: "protective_escalation_requires_ethical_gate",
      needsClarifier: false
    };
  }

  if (directiveOrTechnical) {
    return {
      action: "route",
      reason: "technical_or_directive_fail_open",
      needsClarifier: false
    };
  }

  if (!validDomain && c < config.highConfidence) {
    return {
      action: config.allowClarifier ? "clarify" : "fallback",
      reason: "domain_not_available",
      needsClarifier: config.allowClarifier
    };
  }

  if (failClosed && c < config.failClosedBelow) {
    return {
      action: config.allowClarifier ? "clarify" : "fallback",
      reason: "confidence_fail_closed",
      needsClarifier: config.allowClarifier
    };
  }

  if (config.allowClarifier && ambiguous && c < config.clarifyBelow) {
    return {
      action: "clarify",
      reason: "ambiguous_low_confidence_route",
      needsClarifier: true
    };
  }

  if (config.allowClarifier && c < config.lowConfidence) {
    return {
      action: "clarify",
      reason: "weak_route_confidence",
      needsClarifier: true
    };
  }

  return {
    action: "route",
    reason: c >= config.highConfidence ? "high_confidence_route" : "acceptable_confidence_route",
    needsClarifier: false
  };
}

function normalizeRouteAndIntent(routeResult, packet, config) {
  const r = safeObj(routeResult);
  const routing = safeObj(r.routing);
  const marionIntent = safeObj(r.marionIntent);

  const intent = compactKey(firstText(
    routing.intent,
    marionIntent.intent,
    r.intent,
    config.defaultIntent
  ));

  let route = compactKey(firstText(
    routing.domain,
    routing.route,
    routing.primaryDomain,
    r.domain,
    r.route,
    marionIntent.domain,
    config.defaultRoute
  ));

  const knowledgeDomain = compactKey(firstText(
    routing.knowledgeDomain,
    marionIntent.knowledgeDomain,
    r.knowledgeDomain
  ));

  if (knowledgeDomain && ["general", "general_reasoning", "domain_question"].includes(route)) {
    route = knowledgeDomain;
  }

  if (!route) route = config.defaultRoute;

  return {
    route,
    intent: intent || config.defaultIntent,
    knowledgeDomain
  };
}

function buildStateSpinePatch(decision, packet, routeResult) {
  const d = safeObj(decision);
  const p = safeObj(packet);
  const r = safeObj(routeResult);
  const text = extractText(p);
  const routing = safeObj(r.routing);

  return {
    source: "DomainConcierge",
    schema: STATE_SPINE_SCHEMA,
    shouldAdvanceState: d.action === "route",
    stateStage: d.action === "route" ? "routed" : (d.action === "clarify" ? "classified" : "open"),
    lastConciergeAction: d.action,
    lastRoute: d.route,
    lastIntent: d.intent,
    lastRouteConfidence: clamp01(safeObj(d.domainConfidence).confidence, 0),
    lastClarifier: d.needsClarifier ? safeStr(d.clarifier) : "",
    lastResolvedTopic: firstText(d.normalizedUserIntent, text),
    lastInputSource: d.inputSource,
    routeLock: !!safeObj(d.domainConfidence).routeLocked,
    routeFailClosed: !!safeObj(d.domainConfidence).failClosed,
    domainConfidence: d.domainConfidence,
    protectiveEscalation: safeObj(d.protectiveEscalation),
    ethicalEscalationRequired: !!safeObj(d.protectiveEscalation).requiresEthicalGate,
    confidenceAwareResponseShaping: Object.keys(safeObj(d.confidenceAwareResponseShaping)).length ? safeObj(d.confidenceAwareResponseShaping) : buildConfidenceAwareResponseShapingSeed(d),
    questionShape: d.questionShape,
    normalizedUserIntent: firstText(d.normalizedUserIntent, text),
    rawUserText: text,
    turnHash: firstText(d.turnHash, hashText(text)),
    endpoint: firstText(routing.endpoint, ""),
    updatedAt: Date.now()
  };
}


function buildConfidenceAwareResponseShapingSeed(decision) {
  const d = safeObj(decision);
  const dc = safeObj(d.domainConfidence);
  const confidence = clamp01(firstText(d.confidence, dc.confidence), 0);
  const action = firstText(d.action, d.needsClarifier ? "clarify" : "route");
  const route = compactKey(firstText(d.route, dc.primaryDomain, "general"));
  const intent = compactKey(firstText(d.intent, "simple_chat"));
  const knowledgeDomain = compactKey(firstText(d.knowledgeDomain, dc.knowledgeDomain));
  const protectiveEscalation = safeObj(d.protectiveEscalation);
  const highStakes = ["law", "finance", "cyber"].includes(knowledgeDomain || route) || protectiveEscalation.active === true || protectiveEscalation.requiresEthicalGate === true;
  const technical = route === "technical" || intent === "technical_debug" || intent === "directive_response" || intent === "contextual_directive";
  const needsClarifier = !!(d.needsClarifier || action === "clarify");
  return {
    version: CONFIDENCE_AWARE_RESPONSE_SHAPING_VERSION,
    source: "DomainConcierge",
    active: true,
    action,
    mode: needsClarifier ? "clarify" : (confidence >= 0.82 ? "direct" : (confidence >= 0.62 ? "grounded" : "cautious")),
    route,
    intent,
    knowledgeDomain,
    confidence,
    confidenceBand: firstText(dc.band, confidenceBand(confidence)),
    highStakes,
    technical,
    needsClarifier,
    clarifier: needsClarifier ? safeStr(d.clarifier) : "",
    protectiveEscalation,
    ethicalEscalationRequired: !!protectiveEscalation.requiresEthicalGate,
    noUserFacingDiagnostics: true,
    updatedAt: Date.now()
  };
}

function buildComposerContext(decision, routeResult) {
  const d = safeObj(decision);
  const r = safeObj(routeResult);
  return {
    concierge: {
      version: DOMAIN_CONCIERGE_VERSION,
      source: "DomainConcierge",
      action: d.action,
      route: d.route,
      intent: d.intent,
      confidence: clamp01(safeObj(d.domainConfidence).confidence, 0),
      confidenceBand: firstText(safeObj(d.domainConfidence).band, confidenceBand(safeObj(d.domainConfidence).confidence)),
      needsClarifier: !!d.needsClarifier,
      clarifier: d.needsClarifier ? d.clarifier : "",
      reason: d.reason,
      failClosed: !!safeObj(d.domainConfidence).failClosed,
      routeLocked: !!safeObj(d.domainConfidence).routeLocked,
      protectiveEscalation: safeObj(d.protectiveEscalation),
      ethicalEscalationRequired: !!safeObj(d.protectiveEscalation).requiresEthicalGate,
      noUserFacingDiagnostics: true
    },
    confidenceAwareResponseShaping: buildConfidenceAwareResponseShapingSeed(d),
    routing: safeObj(r.routing),
    marionIntent: safeObj(r.marionIntent),
    domainConfidence: safeObj(d.domainConfidence),
    protectiveEscalation: safeObj(d.protectiveEscalation),
    ethicalEscalationRequired: !!safeObj(d.protectiveEscalation).requiresEthicalGate,
    questionShape: safeObj(d.questionShape),
    normalizedUserIntent: d.normalizedUserIntent,
    rawUserText: d.rawUserText
  };
}

function normalizeConciergeDecision(fields) {
  const f = safeObj(fields);
  const action = VALID_ACTIONS.includes(f.action) ? f.action : "fallback";
  const route = compactKey(firstText(f.route, "unknown"));
  const intent = compactKey(firstText(f.intent, "simple_chat"));
  const domainConfidence = safeObj(f.domainConfidence);
  const questionShape = safeObj(f.questionShape);

  const decision = {
    ok: true,
    final: false,
    version: VERSION,
    contract: DOMAIN_CONCIERGE_VERSION,
    source: "DomainConcierge",
    createdAt: nowIso(),
    action,
    route,
    intent,
    knowledgeDomain: compactKey(firstText(f.knowledgeDomain, domainConfidence.knowledgeDomain)),
    confidence: clamp01(domainConfidence.confidence, f.confidence),
    domainConfidence,
    protectiveEscalation: safeObj(f.protectiveEscalation),
    ethicalEscalationRequired: !!safeObj(f.protectiveEscalation).requiresEthicalGate,
    reason: firstText(f.reason, "domain_concierge_decision"),
    needsClarifier: !!f.needsClarifier,
    clarifier: f.needsClarifier ? safeStr(f.clarifier) : null,
    rawUserText: safeStr(f.rawUserText),
    normalizedUserIntent: safeStr(f.normalizedUserIntent),
    questionShape,
    inputSource: normalizeInputSource(f.inputSource),
    turnHash: firstText(f.turnHash, hashText(firstText(f.normalizedUserIntent, f.rawUserText))),
    noUserFacingDiagnostics: true,
    bridgeCompatible: true,
    composerCompatible: true,
    stateSpineCompatible: true,
    finalEnvelopeRequired: true,
    confidenceAwareResponseShaping: buildConfidenceAwareResponseShapingSeed({ ...f, action, route, intent, domainConfidence }),
    routeOnly: action === "route",
    clarifyOnly: action === "clarify",
    fallbackOnly: action === "fallback"
  };

  decision.stateSpinePatch = buildStateSpinePatch(decision, f.packet, f.routeResult);
  decision.composerContext = buildComposerContext(decision, f.routeResult);

  return decision;
}

function runDomainConcierge(packet, options) {
  const config = mergeConfig(options);
  const p = safeObj(packet);
  const rawText = extractText(p);
  const inputSource = normalizeInputSource(firstText(p.inputSource, safeObj(p.session).inputSource, "text"));
  const questionShape = normalizeQuestionShapeSafe(rawText, p);
  const normalizedText = firstText(questionShape.normalizedText, questionShape.normalizedUserIntent, rawText);

  const routePacket = {
    ...p,
    text: normalizedText,
    rawUserText: rawText,
    normalizedUserIntent: normalizedText,
    questionShape,
    inputSource
  };

  const routeResult = routeWithRouter(routePacket);
  const normalized = normalizeRouteAndIntent(routeResult, routePacket, config);
  const domainConfidence = normalizeDomainConfidence(routeResult, normalized.route, normalized.intent, config);
  const protectiveEscalation = extractProtectiveEscalation(routePacket, routeResult);
  const actionDecision = decideAction(normalized.route, normalized.intent, domainConfidence, routePacket, routeResult, config);
  const clarifier = actionDecision.needsClarifier
    ? buildClarifier(normalized.route, normalized.intent, domainConfidence, routePacket, routeResult, config)
    : null;

  return normalizeConciergeDecision({
    packet: routePacket,
    routeResult,
    action: actionDecision.action,
    route: normalized.route,
    intent: normalized.intent,
    knowledgeDomain: normalized.knowledgeDomain,
    confidence: domainConfidence.confidence,
    domainConfidence,
    protectiveEscalation,
    ethicalEscalationRequired: !!protectiveEscalation.requiresEthicalGate,
    reason: actionDecision.reason,
    needsClarifier: actionDecision.needsClarifier,
    clarifier,
    rawUserText: rawText,
    normalizedUserIntent: normalizedText,
    questionShape,
    inputSource,
    turnHash: hashText(normalizedText || rawText)
  });
}

function shouldClarify(packet, options) {
  return runDomainConcierge(packet, options).needsClarifier === true;
}

function routeOrClarify(packet, options) {
  return runDomainConcierge(packet, options);
}

function domainConciergeStatus() {
  return {
    version: VERSION,
    contract: DOMAIN_CONCIERGE_VERSION,
    stateSpineSchema: STATE_SPINE_SCHEMA,
    domainConfidenceVersion: DOMAIN_CONFIDENCE_VERSION,
    questionShapeNormalizationVersion: QUESTION_SHAPE_NORMALIZATION_VERSION,
    routerAvailable: !!(routerMod && typeof routerMod.routeMarionIntent === "function"),
    normalizerAvailable: !!(normalizerMod && typeof normalizerMod.normalizeQuestionShape === "function"),
    registryAvailable: !!registryMod,
    authority: "runtime.route-clarify-decision-only",
    finalAuthority: "not-owned-by-domain-concierge",
    composerAuthority: "not-owned-by-domain-concierge",
    bridgeCompatible: true,
    composerCompatible: true,
    stateSpineCompatible: true,
    noUserFacingDiagnostics: true
  };
}

module.exports = {
  VERSION,
  DOMAIN_CONCIERGE_VERSION,
  DOMAIN_CONFIDENCE_VERSION,
  CONFIDENCE_AWARE_RESPONSE_SHAPING_VERSION,
  STATE_SPINE_SCHEMA,
  QUESTION_SHAPE_NORMALIZATION_VERSION,
  PROTECTIVE_ESCALATION_ROUTING_VERSION,
  DEFAULT_CONFIG,
  VALID_ACTIONS,
  HIGH_PRIORITY_INTENTS,
  BUILTIN_DOMAIN_REGISTRY,
  runDomainConcierge,
  routeOrClarify,
  shouldClarify,
  normalizeConciergeDecision,
  normalizeQuestionShapeSafe,
  routeWithRouter,
  normalizeDomainConfidence,
  decideAction,
  buildClarifier,
  buildStateSpinePatch,
  buildComposerContext,
  buildConfidenceAwareResponseShapingSeed,
  extractProtectiveEscalation,
  hasPriorityTwoTechnicalSignal,
  domainExists,
  domainLabel,
  domainConciergeStatus,
  _internal: {
    safeStr,
    lower,
    safeObj,
    safeArray,
    clamp01,
    firstText,
    compactKey,
    hashText,
    mergeConfig,
    normalizeInputSource,
    extractText,
    extractProtectiveEscalation,
    hasPriorityTwoTechnicalSignal,
    confidenceBand,
    normalizeRouteAndIntent,
    isDirectiveOrTechnical,
    extractCandidates
  }
};

module.exports.default = module.exports;


// PRIORITY_9F_DEEP_CONVERSATIONAL_STACK_CONCIERGE_PATCH_START
const PRIORITY_9F_DEEP_CONVERSATIONAL_STACK_CONCIERGE_VERSION = "nyx.marion.domainConcierge.priority9f.deepConversationalStack/1.0";
function isPriority9FDeepConversationalText(text = "") {
  const t = lower(text);
  return /\b(priority\s*9f|deep conversational stack|layered conversational|conversational stack|layered intelligence|surface request|underlying intent|deeper intent|operational risk|execution mode|next action|full conversational stack)\b/i.test(t);
}
function buildPriority9FConciergeSeed(text = "", context = {}) {
  const active = isPriority9FDeepConversationalText(text);
  return {
    version: PRIORITY_9F_DEEP_CONVERSATIONAL_STACK_CONCIERGE_VERSION,
    active,
    action: active ? "route" : "",
    domain: active ? "execution_context" : "",
    intent: active ? "contextual_directive" : "",
    responseShape: active ? "layered_conversational_stack" : "",
    clarify: false,
    noUserFacingDiagnostics: true
  };
}
module.exports.PRIORITY_9F_DEEP_CONVERSATIONAL_STACK_CONCIERGE_VERSION = PRIORITY_9F_DEEP_CONVERSATIONAL_STACK_CONCIERGE_VERSION;
module.exports.isPriority9FDeepConversationalText = isPriority9FDeepConversationalText;
module.exports.buildPriority9FConciergeSeed = buildPriority9FConciergeSeed;
module.exports._internal = {...safeObj(module.exports._internal), isPriority9FDeepConversationalText, buildPriority9FConciergeSeed};
// PRIORITY_9F_DEEP_CONVERSATIONAL_STACK_CONCIERGE_PATCH_END

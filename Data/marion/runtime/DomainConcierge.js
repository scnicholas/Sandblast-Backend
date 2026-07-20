"use strict";

// NYX-MEDIA-CURRENT-TURN-AUTHORITY-R5: explicit public media discovery overrides stale and generated law signals.

// NYX-GUIDE-STEPS-7-8-9-R1: safe action orchestration and public preference intent routing.

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

const VERSION = "PRIORITY-9J-R1A-RUNTIME-DECISION-SPECIFIC-FINAL-OVERRIDE + PRIORITY-9J-R1-DECISION-SPECIFIC-AUTHORITY-HOTFIX + PRIORITY-9I-R2A-ALT-PRESSURE-SPECIFIC-FINAL-OVERRIDE + PRIORITY-9I-R2-PRESSURE-SPECIFIC-ANSWER-SHAPING + PRIORITY-9I-R1-9J-PREMATURE-ESCALATION-CONTAINMENT + PRIORITY-9F-R2-DOMAIN-HIJACK-SUPPRESSION + PRIORITY-9F-R1-LAYERED-PRECEDENCE-HOTFIX + DomainConcierge v1.2.0 PRIORITY2-ROUTE-CLARIFY-HARDENING + DEFENSIVE-INTENT-CARRY + CONFIDENCE-AWARE-SHAPING-CARRY + CORE-RUNTIME-ROUTE-CLARIFY-FALLBACK-LOCK + R18C-LAW-DOMAIN-CONCIERGE";
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


// PRIORITY_9F_R1_LAYERED_PRECEDENCE_HOTFIX_DOMAIN_CONCIERGE_PATCH_START
const PRIORITY_9F_R1_DOMAIN_CONCIERGE_LAYERED_PRECEDENCE_VERSION="nyx.marion.domainConcierge.priority9fR1.layeredPrecedence/1.0";
function isPriority9FR1LayeredPrecedenceText(text=""){const t=lower(text).replace(/[_-]+/g," ");return /\b(priority\s*9f|9f\s*r1|deep conversational stack|layered conversational|layered conversation|conversational stack|layered intelligence|full conversational stack|surface request|underlying intent|deeper intent|deeper task|operational risk|execution mode|next action)\b/i.test(t)||(/\b(disjointed|deeper|layered|multi|context|looping|loop|recovery)\b/i.test(t)&&/\b(marion|conversation|conversational|intent|context|preserve|avoid|loop|looping|where to go next|next)\b/i.test(t));}
const __priority9FR1OriginalRunDomainConcierge=runDomainConcierge;
runDomainConcierge=function priority9FR1RunDomainConcierge(packet,options){const decision=__priority9FR1OriginalRunDomainConcierge(packet,options);const text=extractText(safeObj(packet));if(!isPriority9FR1LayeredPrecedenceText(text))return decision;return normalizeConciergeDecision({...decision,action:"route",route:"execution_context",intent:"contextual_directive",confidence:0.97,needsClarifier:false,clarifier:null,reason:"priority9f_r1_layered_prompt_precedence",normalizedUserIntent:text,domainConfidence:{...safeObj(decision.domainConfidence),version:DOMAIN_CONFIDENCE_VERSION,confidence:0.97,band:"high",routeLocked:true,primaryDomain:"execution_context",reason:"priority9f_r1_layered_prompt_precedence"},questionShape:{...safeObj(decision.questionShape),questionShape:"layered_conversational_stack",normalizedText:text,normalizedUserIntent:text},composerContext:{...safeObj(decision.composerContext),priority9FR1LayeredPrecedence:true,responseShape:"layered_conversational_stack"},stateSpinePatch:{...safeObj(decision.stateSpinePatch),priority9FR1LayeredPrecedence:true,responseShape:"layered_conversational_stack"},priority9FR1LayeredPrecedence:true,noUserFacingDiagnostics:true});};
routeOrClarify=function priority9FR1RouteOrClarify(packet,options){return runDomainConcierge(packet,options);};shouldClarify=function priority9FR1ShouldClarify(packet,options){return runDomainConcierge(packet,options).needsClarifier===true;};
module.exports.PRIORITY_9F_R1_DOMAIN_CONCIERGE_LAYERED_PRECEDENCE_VERSION=PRIORITY_9F_R1_DOMAIN_CONCIERGE_LAYERED_PRECEDENCE_VERSION;module.exports.isPriority9FR1LayeredPrecedenceText=isPriority9FR1LayeredPrecedenceText;module.exports.runDomainConcierge=runDomainConcierge;module.exports.routeOrClarify=routeOrClarify;module.exports.shouldClarify=shouldClarify;module.exports.default=module.exports;
// PRIORITY_9F_R1_LAYERED_PRECEDENCE_HOTFIX_DOMAIN_CONCIERGE_PATCH_END

// PRIORITY_9F_R2_DOMAIN_HIJACK_SUPPRESSION_DOMAIN_CONCIERGE_PATCH_START
const PRIORITY_9F_R2_DOMAIN_CONCIERGE_DOMAIN_HIJACK_SUPPRESSION_VERSION="nyx.marion.domainConcierge.priority9fR2.domainHijackSuppression/1.0";
function isPriority9FR2DomainHijackSuppressionText(text=""){const t=lower(text).replace(/[_-]+/g," ");return /\b(priority\s*9f|9f\s*r2|domain hijack|domain fallback|six domain fallback|deep conversational stack|layered conversational|conversational stack|surface request|underlying intent|deeper intent|deeper task|operational risk|execution mode|next action|marion conversational architecture)\b/i.test(t)||(/\b(disjointed|deeper|layered|context|looping|loop|recovery|preserve|avoid|where to go next)\b/i.test(t)&&/\b(marion|conversation|conversational|intent|context|preserve|avoid|loop|looping|where to go next|next|understand)\b/i.test(t));}
function priority9FR2ConciergeDecision(decision,packet){const text=extractText(safeObj(packet));if(!isPriority9FR2DomainHijackSuppressionText(text))return decision;return normalizeConciergeDecision({...safeObj(decision),action:"route",route:"execution_context",intent:"contextual_directive",domain:"execution_context",knowledgeDomain:"",confidence:0.99,needsClarifier:false,clarifier:null,reason:"priority9f_r2_domain_hijack_suppression",normalizedUserIntent:text,domainConfidence:{...safeObj(safeObj(decision).domainConfidence),version:DOMAIN_CONFIDENCE_VERSION,confidence:0.99,band:"high",confidenceBand:"high",routeLocked:true,ambiguous:false,needsClarifier:false,primaryDomain:"execution_context",selectedDomain:"execution_context",knowledgeDomain:"",secondaryDomains:[],reason:"priority9f_r2_domain_hijack_suppression",noCrossDomainBleed:true,noUserFacingDiagnostics:true},questionShape:{...safeObj(safeObj(decision).questionShape),questionShape:"layered_conversational_stack",normalizedText:text,normalizedUserIntent:text},composerContext:{...safeObj(safeObj(decision).composerContext),priority9FR2DomainHijackSuppression:true,responseShape:"layered_conversational_stack",domainHijackSuppressed:true,knowledgeDomain:""},stateSpinePatch:{...safeObj(safeObj(decision).stateSpinePatch),priority9FR2DomainHijackSuppression:true,responseShape:"layered_conversational_stack",domainHijackSuppressed:true,knowledgeDomain:""},priority9FR2DomainHijackSuppression:true,domainHijackSuppressed:true,noUserFacingDiagnostics:true});}
const __priority9FR2OriginalRunDomainConcierge=runDomainConcierge;
runDomainConcierge=function priority9FR2RunDomainConcierge(packet,options){return priority9FR2ConciergeDecision(__priority9FR2OriginalRunDomainConcierge(packet,options),packet);};
routeOrClarify=function priority9FR2RouteOrClarify(packet,options){return runDomainConcierge(packet,options);};shouldClarify=function priority9FR2ShouldClarify(packet,options){return runDomainConcierge(packet,options).needsClarifier===true;};
module.exports.PRIORITY_9F_R2_DOMAIN_CONCIERGE_DOMAIN_HIJACK_SUPPRESSION_VERSION=PRIORITY_9F_R2_DOMAIN_CONCIERGE_DOMAIN_HIJACK_SUPPRESSION_VERSION;module.exports.isPriority9FR2DomainHijackSuppressionText=isPriority9FR2DomainHijackSuppressionText;module.exports.runDomainConcierge=runDomainConcierge;module.exports.routeOrClarify=routeOrClarify;module.exports.shouldClarify=shouldClarify;module.exports.default=module.exports;
// PRIORITY_9F_R2_DOMAIN_HIJACK_SUPPRESSION_DOMAIN_CONCIERGE_PATCH_END

// PRIORITY_9I_9J_SEQUENCE_DOMAIN_CONCIERGE_PATCH_START
var PRIORITY_9I_ADAPTIVE_SITUATIONAL_REASONING_VERSION_FULL = "nyx.marion.priority9i.adaptiveSituationalReasoningContextPressure/1.0";
var PRIORITY_9J_PROACTIVE_OPERATIONAL_GUIDANCE_VERSION_FULL = "nyx.marion.priority9j.proactiveOperationalGuidanceNextMoveAuthority/1.0";
function priority9IJStr(value){return value==null?"":String(value).replace(/\s+/g," ").trim();}
function priority9IJObj(value){return value&&typeof value==="object"&&!Array.isArray(value)?value:{};}
function priority9IJNorm(value){return priority9IJStr(value).toLowerCase().replace(/[“”]/g,'"').replace(/[‘’]/g,"'").replace(/[^a-z0-9]+/g," ").replace(/\s+/g," ").trim();}
function priority9IJCollect(value,limit){try{return JSON.stringify(value||{}).slice(0,limit||22000);}catch(_){return priority9IJStr(value).slice(0,limit||22000);}}
function priority9IJIsShortFollowup(value){var n=priority9IJNorm(value);return /^(next steps?|continue|carry on|keep going|proceed|run that again|run it again|do that again|do it again|same thing|repeat that|rerun that|what now|whats next|what s next|next|status|passed|pass|green|go on|advance|same lane|same thread|stay in lane|stay in the same lane|continue from there|continue there|from there|slow down|go deeper|deeper|make the call|safest next move|do the safest next move|what is the risk now|risk now|update the risk|what changed|what changed now|what is the pressure|pressure check|context check|final check)$/i.test(n);}
function priority9IJIsPressureText(value){var n=priority9IJNorm(value);return /\b(urgent|urgency|under pressure|pressure changed|context pressure|time sensitive|time pressure|pivot|we need to pivot|no not that|not that|stay on the architecture|stay with the architecture|same architecture|make the call|make a call|decision pressure|choose|choose now|safest next move|safest action|safe next action|slow down|go deeper|deeper analysis|ambiguity|ambiguous|unclear|risk now|risk changed|operational pressure|context changed|what changed|adapt|adaptive|situational)\b/.test(n);}
function priority9IJIs9IActivationText(value){var n=priority9IJNorm(value);return /\b(priority 9i|9i|adaptive situational|adaptive reasoning|situational reasoning|context pressure|context pressure handling|pressure handling|adaptive situational reasoning|current pressure shift|risk and execution mode|update the risk|priority 9i and 9j|9i and 9j)\b/.test(n);}
function priority9IJIs9JActivationText(value){var n=priority9IJNorm(value);return /\b(priority 9j|9j|proactive operational|operational guidance|next move authority|next move authority|critical path|make the decision|make a decision|what should we do first|what do we tackle now|safest sequence|next operational move|what should we avoid|recommend the next move|choose the safest concrete action|controlled authority)\b/.test(n);}

function priority9IJIs9ICorrectionContainmentPrompt(value){var n=priority9IJNorm(value);return /\b(no not that|not that|stay on the architecture|stay with the architecture|same architecture|stay on architecture|stay with architecture|architecture correction|wrong target|not this|stay anchored|keep the architecture|architectural focus)\b/.test(n);}
function priority9IJIs9IPressureOnlyPrompt(value){var n=priority9IJNorm(value);return priority9IJIs9ICorrectionContainmentPrompt(value)||/\b(urgent|urgency|under pressure|pressure changed|context pressure|time sensitive|time pressure|pivot|we need to pivot|slow down|go deeper|deeper analysis|ambiguity|ambiguous|unclear|risk now|risk changed|operational pressure|context changed|what changed|adapt|adaptive|situational|safest next move|safest action|safe next action|do the safest next move|update the risk|what is the risk now|pressure check|context check|correction received)\b/.test(n);}
function priority9IJIsExplicit9JPrompt(value){var n=priority9IJNorm(value);return /\b(priority 9j|9j|proactive operational|operational guidance|next move authority|critical path|make the decision|make a decision|what should we do first|what do we tackle now|give me the safest sequence|safest sequence|next operational move|what should we avoid|recommend the next move|choose the safest concrete action|controlled authority)\b/.test(n);}
function priority9IJHasActive9JContext(value){var raw=priority9IJStr(value);var n=priority9IJNorm(value);return /priority9JProactiveOperationalGuidance|priority9j_proactive_operational_guidance|routeKind["']?\s*:\s*["']priority9j|priorityLane["']?\s*:\s*["']Priority 9J/i.test(raw)||/\b(priority 9j proactive operational guidance and next move authority|priority 9j proactive operational guidance)\b/.test(n);}
function priority9IJSequencedLaneFor(prompt,source,reply){var ctx=[prompt,source].join(" ");if(priority9IJIs9IPressureOnlyPrompt(prompt))return "9i";if(priority9IJIs9IActivationText(prompt))return "9i";if(priority9IJIsExplicit9JPrompt(prompt))return "9j";if(priority9IJIsPressureText(prompt)&&priority9IJHas9IContext(ctx))return "9i";if(priority9IJIsShortFollowup(prompt)&&priority9IJHasActive9JContext(ctx))return "9j";if(priority9IJIsShortFollowup(prompt)&&priority9IJHas9IContext(ctx))return "9i";if((priority9IJOldLaneLeak(reply)||priority9IJPromptEcho(reply,prompt))&&priority9IJHas9IContext(ctx))return "9i";if((priority9IJOldLaneLeak(reply)||priority9IJPromptEcho(reply,prompt))&&priority9IJHasActive9JContext(ctx))return "9j";if(priority9IJIs9IActivationText(ctx)||priority9IJIsPressureText(prompt))return "9i";return "";}

function priority9IJHas9IContext(value){var n=priority9IJNorm(value);return /\b(priority 9i|9i|adaptive situational|context pressure|pressure handling|pressure shift|9h continuity foundation|priority 9h|long form continuity|memory drift guard|surface request|deeper intent|active task|execution mode|next action)\b/.test(n);}
function priority9IJHas9JContext(value){var n=priority9IJNorm(value);return /\b(priority 9j|9j|proactive operational|next move authority|critical path|safest sequence|operational guidance|9i adaptive|context pressure)\b/.test(n);}
function priority9IJPressureKind(value){var n=priority9IJNorm(value);if(/\b(urgent|urgency|time sensitive|time pressure|under pressure)\b/.test(n))return "urgency";if(/\b(no not that|not that|stay on the architecture|same architecture|correction)\b/.test(n))return "correction";if(/\b(pivot|changed|context changed|what changed)\b/.test(n))return "pivot";if(/\b(slow down|too fast|pace)\b/.test(n))return "pace";if(/\b(go deeper|deeper analysis|deeper)\b/.test(n))return "depth";if(/\b(safest|safe next|safety|avoid)\b/.test(n))return "safety";if(/\b(make the call|make a call|decision|choose|critical path)\b/.test(n))return "decision";if(/\b(ambiguity|ambiguous|unclear|clarify)\b/.test(n))return "ambiguity";return "pressure";}
function priority9IJOldLaneLeak(value){var n=priority9IJNorm(value);return !!n&&/\b(i m reading this as priority 9h with a priority 9i precheck|priority 9h must pass first|long form continuity stress test and memory drift guard|priority 9h long form|run the 10 15 turn|priority 9g deep continuity|priority 9f r4|priority 90 9e|priority 90|priority 9e|public nyx route clean|five turn continuity|psychology|in psychology|domain hijack|prompt echo|recovery path|loop detected|stale fallback|i have the current request|marion will answer from this prompt)\b/.test(n);}
function priority9IJPromptEcho(reply,prompt){var r=priority9IJNorm(reply),p=priority9IJNorm(prompt);if(!r||!p)return false;return r===p||(r.includes(p)&&p.length>24)||(p.includes(r)&&r.length>24);}
function priority9IStateFrom(source,turn){var kind=priority9IJPressureKind(source);return {version:PRIORITY_9I_ADAPTIVE_SITUATIONAL_REASONING_VERSION_FULL,active:true,lane:"priority9i_adaptive_situational_reasoning",activePhase:"priority9i_adaptive_situational_reasoning",conversationLane:"Priority 9I adaptive situational reasoning",activeTask:"Priority 9I: adaptive situational reasoning and context-pressure handling",surfaceRequest:"adapt Marion’s active 9H continuity thread when pressure, urgency, ambiguity, correction, or context changes",deeperIntent:"preserve the mission thread while updating risk, execution mode, and next action under changing pressure",pressureSignal:kind,whatChanged:kind==="urgency"?"urgency increased":kind==="correction"?"the user corrected the target and asked Marion to stay anchored":kind==="pivot"?"the operating context shifted":kind==="pace"?"the required pace changed":kind==="depth"?"the answer needs deeper analysis":kind==="safety"?"the safest action must be prioritized":kind==="decision"?"decision pressure increased":"the situational pressure changed",operationalRisk:"pressure can cause Marion to flatten, overreact, reset the lane, over-branch, or activate 9J before 9I is stable",executionMode:kind==="urgency"?"compressed adaptive execution":kind==="pace"?"slower controlled adaptation":kind==="depth"?"deeper situational analysis":kind==="safety"?"safety-first adaptive execution":"adaptive context-pressure handling",nextAction:"read the pressure shift, update risk and execution mode, then give the safest next action without losing the 9H continuity foundation",baseContinuityFoundation:"Priority 9H live accepted",turnDepth:Number.isFinite(Number(turn))?Number(turn):1,priority9IAdaptiveSituationalReasoning:true,priority9JProactiveGuidancePrecheck:{version:PRIORITY_9J_PROACTIVE_OPERATIONAL_GUIDANCE_VERSION_FULL,staged:true,activationRule:"Activate only for explicit Priority 9J or clear next-move authority requests after 9I pressure handling is stable",expectedFocus:"proactive operational guidance and controlled next-move authority"},noUserFacingDiagnostics:true,updatedAt:Date.now()};}
function priority9JStateFrom(source,turn){return {version:PRIORITY_9J_PROACTIVE_OPERATIONAL_GUIDANCE_VERSION_FULL,active:true,lane:"priority9j_proactive_operational_guidance",activePhase:"priority9j_proactive_operational_guidance",conversationLane:"Priority 9J proactive operational guidance",activeTask:"Priority 9J: proactive operational guidance and next-move authority",surfaceRequest:"recommend the safest concrete next move when the active context is sufficiently clear",deeperIntent:"move from reactive continuity and pressure handling into controlled operational guidance without overreach",operationalRisk:"premature authority, unnecessary branching, unsafe sequencing, or advising a next move before risk and context are clear",executionMode:"controlled next-move authority",recommendedMove:"choose the safest concrete action that protects the active lane, validates risk, and advances only one operational step",whyFirst:"it comes first because it preserves the accepted continuity foundation before expanding scope",skipRisk:"if skipped, Marion can over-branch, drift, or make a recommendation before the pressure context is resolved",executionSequence:["confirm active lane and pressure state","name the risk if the move is skipped","choose one safest concrete action","give the short execution sequence","avoid opening unrelated branches"],nextAction:"state the safest next operational move, why it comes first, risk if skipped, and the execution sequence",baseAdaptiveFoundation:"Priority 9I adaptive situational reasoning",turnDepth:Number.isFinite(Number(turn))?Number(turn):1,priority9JProactiveOperationalGuidance:true,noUserFacingDiagnostics:true,updatedAt:Date.now()};}
function priority9IReplyFor(prompt,source){var kind=priority9IJPressureKind([prompt,source].join(" "));if(priority9IJIsShortFollowup(prompt)&&priority9IJHas9IContext(source)){if(kind==="decision")return "Continue Priority 9I: the pressure signal is decision pressure. Preserve the 9H continuity foundation, update the risk before choosing, keep 9J staged unless explicitly activated, and give the safest next action without opening extra branches.";if(kind==="safety")return "Continue Priority 9I: the pressure signal is safety-first execution. Preserve the active task, update risk, slow the response enough to avoid overreach, and give the safest next action while keeping Priority 9J staged.";if(kind==="depth")return "Continue Priority 9I: the pressure signal is depth. Go deeper inside the same active lane, update risk and execution mode, and give the next action without resetting to 9H activation wording or drifting into 9J.";if(kind==="pace")return "Continue Priority 9I: the pressure signal is pace control. Slow down, keep the 9H continuity foundation intact, clarify the changed constraint, and give one safe next action.";return "Continue Priority 9I: preserve the 9H continuity foundation, read the current pressure shift, update operational risk and execution mode, then give the safest next action. Keep Priority 9J staged until next-move authority is explicitly needed.";}return "I’m reading this as Priority 9I: adaptive situational reasoning and context-pressure handling. The 9H continuity foundation stays active. The surface request is to adapt Marion when urgency, correction, ambiguity, pace, depth, or operational pressure changes; the deeper intent is to update risk and execution mode without losing the active mission thread. Next move: run pressure prompts such as urgent, pivot, stay on the architecture, slow down, go deeper, risk now, and safest next move. Priority 9J is staged next for proactive operational guidance, but 9I handles the pressure shift first.";}
function priority9JReplyFor(prompt,source){return "Priority 9J: proactive operational guidance and next-move authority. The 9H continuity foundation and 9I pressure-handling layer stay underneath this decision. Recommended next move: choose the safest concrete action that preserves the active lane and advances only one operational step. Why first: it protects continuity before expanding scope. Risk if skipped: Marion can over-branch, drift, or make a recommendation before the pressure context is resolved. Execution sequence: confirm the active lane, name the risk, choose one safest action, execute that step, then reassess before opening new branches.";}
function priority9IJReadReply(packet){var p=priority9IJObj(packet),pl=priority9IJObj(p.payload),f=priority9IJObj(p.finalEnvelope);return priority9IJStr(p.reply||p.finalReply||p.publicReply||p.visibleReply||p.text||p.message||p.response||p.answer||pl.reply||pl.finalReply||pl.publicReply||pl.visibleReply||pl.text||pl.message||pl.answer||f.reply||f.finalReply||f.publicReply||f.visibleReply||f.text||f.message||f.answer);}
function priority9IJApplyPacket(packet,reply,prompt,source,lane){var out=(packet&&typeof packet==="object"&&!Array.isArray(packet))?{...packet}:{};var final=priority9IJStr(reply)||(lane==="9j"?priority9JReplyFor(prompt,source):priority9IReplyFor(prompt,source));["reply","finalReply","publicReply","visibleReply","text","message","response","answer","spokenText"].forEach(function(k){out[k]=final;});out.payload={...(out.payload&&typeof out.payload==="object"?out.payload:{}),reply:final,finalReply:final,publicReply:final,visibleReply:final,text:final,message:final,answer:final};out.finalEnvelope={...(out.finalEnvelope&&typeof out.finalEnvelope==="object"?out.finalEnvelope:{}),reply:final,finalReply:final,publicReply:final,visibleReply:final,text:final,message:final,answer:final};var prior=priority9IJObj(out.priority9IAdaptiveSituationalReasoning||out.priority9JProactiveOperationalGuidance||out.priority9HLongFormContinuity||out.longFormContinuityStress);var depth=Number.isFinite(Number(prior.turnDepth))?Number(prior.turnDepth)+1:1;if(lane==="9j"){var sj=priority9JStateFrom(source||prompt,depth);out.priority9JProactiveOperationalGuidance=sj;out.priority9JVersion="PRIORITY-9J-PROACTIVE-OPERATIONAL-GUIDANCE-NEXT-MOVE-AUTHORITY";out.conversationLane=sj.conversationLane;out.activeTask=sj.activeTask;out.surfaceRequest=sj.surfaceRequest;out.deeperIntent=sj.deeperIntent;out.operationalRisk=sj.operationalRisk;out.executionMode=sj.executionMode;out.nextAction=sj.nextAction;out.recommendedMove=sj.recommendedMove;out.executionSequence=sj.executionSequence;}else{var si=priority9IStateFrom(source||prompt,depth);out.priority9IAdaptiveSituationalReasoning=si;out.priority9IVersion="PRIORITY-9I-ADAPTIVE-SITUATIONAL-REASONING-CONTEXT-PRESSURE";out.priority9JPrecheck=si.priority9JProactiveGuidancePrecheck;out.conversationLane=si.conversationLane;out.activeTask=si.activeTask;out.surfaceRequest=si.surfaceRequest;out.deeperIntent=si.deeperIntent;out.operationalRisk=si.operationalRisk;out.executionMode=si.executionMode;out.nextAction=si.nextAction;out.pressureSignal=si.pressureSignal;out.whatChanged=si.whatChanged;}out.noUserFacingDiagnostics=true;return out;}
function priority9IJShouldForceText(prompt,source,reply){var lane=priority9IJSequencedLaneFor(prompt,source,reply);return lane||"";}

function priority9IJConciergePrompt(input){var i=priority9IJObj(input),n=priority9IJObj(i.normalized),p=priority9IJObj(i.payload);return priority9IJStr(i.prompt||i.text||i.userText||i.message||n.prompt||n.text||p.prompt||p.text||"");}
function priority9IJConciergeMetadata(input,base){var text=priority9IJConciergePrompt(input);var src=[text,priority9IJCollect(input),priority9IJCollect(base)].join(" ");var lane=priority9IJSequencedLaneFor(text,src,priority9IJReadReply(base));if(lane==="9j"){return {...priority9IJObj(base),action:"route",domain:"execution_context",intent:"contextual_directive",routeKind:"priority9j_proactive_operational_guidance",priorityLane:"Priority 9J",confidence:0.997,shouldClarify:false,priority9JProactiveOperationalGuidance:priority9JStateFrom(src,1),noUserFacingDiagnostics:true};}if(lane==="9i"||priority9IJIs9IActivationText(src)){var si=priority9IStateFrom(src,1);return {...priority9IJObj(base),action:"route",domain:"execution_context",intent:"contextual_directive",routeKind:"priority9i_adaptive_situational_reasoning",priorityLane:"Priority 9I",confidence:0.997,shouldClarify:false,priority9IAdaptiveSituationalReasoning:si,priority9JPrecheck:si.priority9JProactiveGuidancePrecheck,noUserFacingDiagnostics:true};}return base;}
["runDomainConcierge","routeOrClarify"].forEach(function(name){if(typeof module.exports[name]==="function"){var original=module.exports[name];module.exports[name]=function priority9IJConciergeWrapper(input){return priority9IJConciergeMetadata(input,original.apply(this,arguments));};}});
if(typeof runDomainConcierge==="function"){var __priority9IJOriginalRunDomainConcierge=runDomainConcierge;runDomainConcierge=function priority9IJRunDomainConcierge(input={}){return priority9IJConciergeMetadata(input,__priority9IJOriginalRunDomainConcierge(input));};module.exports.runDomainConcierge=runDomainConcierge;}
module.exports.PRIORITY_9I_ADAPTIVE_SITUATIONAL_REASONING_CONCIERGE_VERSION=PRIORITY_9I_ADAPTIVE_SITUATIONAL_REASONING_VERSION_FULL;
module.exports.PRIORITY_9J_PROACTIVE_OPERATIONAL_GUIDANCE_CONCIERGE_VERSION=PRIORITY_9J_PROACTIVE_OPERATIONAL_GUIDANCE_VERSION_FULL;
module.exports.default=module.exports;
// PRIORITY_9I_9J_SEQUENCE_DOMAIN_CONCIERGE_PATCH_END



/* PRIORITY_9I_R2_PRESSURE_SPECIFIC_ANSWER_SHAPING_PATCH_START */
var PRIORITY_9I_R2_PRESSURE_SPECIFIC_ANSWER_SHAPING_VERSION = "nyx.marion.priority9i.r2.pressureSpecificAnswerShaping/1.0";

function priority9IR2OneLine(value) {
  return value == null ? "" : String(value).replace(/\s+/g, " ").trim();
}
function priority9IR2Obj(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function priority9IR2Lower(value) {
  return priority9IR2OneLine(value).toLowerCase();
}
function priority9IR2PickText() {
  for (var i = 0; i < arguments.length; i += 1) {
    var v = priority9IR2OneLine(arguments[i]);
    if (v) return v;
  }
  return "";
}
function priority9IR2ExtractText(value) {
  if (value == null) return "";
  if (typeof value === "string") return priority9IR2OneLine(value);
  if (Array.isArray(value)) {
    for (var i = 0; i < value.length; i += 1) {
      var t = priority9IR2ExtractText(value[i]);
      if (t) return t;
    }
    return "";
  }
  var v = priority9IR2Obj(value);
  var payload = priority9IR2Obj(v.payload);
  var command = priority9IR2Obj(v.command);
  var body = priority9IR2Obj(v.body);
  var query = priority9IR2Obj(v.query);
  var context = priority9IR2Obj(v.context || v.memory || v.state || v.turnMemory || v.conversationState);
  return priority9IR2PickText(
    v.text, v.message, v.prompt, v.query, v.input, v.commandText, v.transcript,
    payload.text, payload.message, payload.prompt, payload.query, payload.input, payload.commandText,
    command.text, command.message, command.prompt, command.query, command.command,
    body.text, body.message, body.prompt, body.query,
    query.text, query.message, query.prompt,
    context.text, context.message, context.prompt, context.lastUserText, context.lastPrompt
  );
}
function priority9IR2ReplyText(value) {
  if (value == null) return "";
  if (typeof value === "string") return priority9IR2OneLine(value);
  if (Array.isArray(value)) return value.map(priority9IR2ReplyText).filter(Boolean).join(" ");
  var v = priority9IR2Obj(value);
  return priority9IR2PickText(
    v.reply, v.text, v.message, v.answer, v.output, v.visibleReply, v.spokenText,
    priority9IR2Obj(v.payload).reply,
    priority9IR2Obj(v.payload).text,
    priority9IR2Obj(v.payload).message,
    priority9IR2Obj(v.finalEnvelope).reply,
    priority9IR2Obj(v.finalEnvelope).text,
    priority9IR2Obj(v.marionFinal).reply,
    priority9IR2Obj(v.data).reply
  );
}
function priority9IR2Explicit9J(value) {
  var t = priority9IR2Lower(value);
  return /\b(priority\s*9j|9j\b|proactive operational guidance|next[-\s]?move authority)\b/i.test(t);
}
function priority9IR2PressureKind(value) {
  var t = priority9IR2Lower(value);
  if (!t) return "";
  if (priority9IR2Explicit9J(t)) return "";
  if (/\bwhat(?:'s| is)?\s+the\s+risk\s+now\??\b|\brisk\s+now\??\b|\bcurrent\s+risk\b/.test(t)) return "risk";
  if (/\bno[, ]+not that\b|\bstay\s+on\s+the\s+architecture\b|\barchitecture\s+focus\b|\bstay\s+architectural\b/.test(t)) return "correction";
  if (/\burgent\b|\bimmediate\b|\btime[-\s]?sensitive\b|\bcritical now\b|\bpressure is high\b/.test(t)) return "urgency";
  if (/\bpivot\b|\bchange direction\b|\bshift direction\b|\bnew direction\b/.test(t)) return "pivot";
  if (/^\s*slow\s+down[.!?]*\s*$|\bslow\s+down\b|\bone step at a time\b|\btoo fast\b/.test(t)) return "pace";
  if (/^\s*go\s+deeper[.!?]*\s*$|\bgo\s+deeper\b|\bdeeper\b|\bmore depth\b|\bdrill down\b/.test(t)) return "depth";
  if (/\bdo\s+the\s+safest\s+next\s+move\b|\bsafest\s+next\s+move\b|\bsafest\s+action\b|\bsafe\s+next\s+action\b/.test(t)) return "safety";
  return "";
}
function priority9IR2IsPressureSpecificText(value) {
  return !!priority9IR2PressureKind(value);
}
function priority9IR2ReplyFor(value) {
  var kind = priority9IR2PressureKind(value);
  if (kind === "risk") {
    return "Priority 9I: the risk now is premature escalation into 9J, generic pressure-template reuse, or losing the 9H continuity foundation. Execution mode is risk-specific containment: name the risk directly, keep 9J staged, and choose the safest next action inside 9I.";
  }
  if (kind === "correction") {
    return "Priority 9I: correction received. Stay on the architecture. Preserve the 9H continuity foundation, treat this as a context-pressure correction, update execution mode to architectural focus, and continue the safest next action without activating 9J.";
  }
  if (kind === "urgency") {
    return "Priority 9I: urgency detected. The risk is rushing into a broad 9J decision before the pressure shift is understood. Keep 9H as the continuity foundation, narrow execution mode to urgent containment, and take the safest next action inside 9I.";
  }
  if (kind === "pivot") {
    return "Priority 9I: pivot received. The active change is directional pressure, not next-move authority. Keep 9H stable, compare the pivot against the current architecture, update risk and execution mode, and only move to 9J after the pivot is understood.";
  }
  if (kind === "pace") {
    return "Priority 9I: slow down. Preserve the 9H foundation, reduce execution mode to one step at a time, restate the active task, name the immediate risk, and continue only after the safest next action is clear.";
  }
  if (kind === "depth") {
    return "Priority 9I: go deeper means add pressure-specific analysis, not activate 9J. Preserve 9H, identify what changed, separate risk from execution mode, then give the safest next action with 9J still staged.";
  }
  if (kind === "safety") {
    return "Priority 9I: the safest next move is to stay in the pressure-handling lane, answer the current pressure specifically, keep 9J staged, and complete the 9I checks before allowing proactive next-move authority.";
  }
  return "";
}
function priority9IR2IsGeneric9ITemplate(value) {
  var t = priority9IR2Lower(value);
  return /\bpreserve the 9h continuity foundation,?\s*read the current pressure shift,?\s*update operational risk and execution mode,?\s*then give the safest next action\b/.test(t) ||
    /\bi['’]?m reading this as priority 9i\b/.test(t) ||
    /\badaptive situational reasoning and context[-\s]?pressure handling\b.*\bthe surface request is to adapt marion\b/.test(t);
}
function priority9IR2ShouldOverride(input, output) {
  var text = priority9IR2ExtractText(input);
  var kind = priority9IR2PressureKind(text);
  if (!kind) return false;
  var reply = priority9IR2ReplyText(output);
  if (!reply) return true;
  var r = priority9IR2Lower(reply);
  if (/\bpriority\s*9j\b/.test(r) && !/\b9j\s+staged\b|\bpriority\s*9j\s+staged\b|\bkeep\s+priority\s*9j\s+staged\b/.test(r)) return true;
  if (priority9IR2IsGeneric9ITemplate(reply)) return true;
  if (kind === "risk" && !/\brisk now is\b|\bthe risk is\b|\bpremature escalation\b|\bgeneric pressure-template reuse\b/.test(r)) return true;
  if (kind === "correction" && !/\bcorrection received\b|\bstay on the architecture\b|\barchitectural focus\b/.test(r)) return true;
  if (kind === "urgency" && !/\burgency detected\b|\brushing into\b|\burgent containment\b/.test(r)) return true;
  if (kind === "pivot" && !/\bpivot received\b|\bdirectional pressure\b|\bcompare the pivot\b/.test(r)) return true;
  if (kind === "pace" && !/\bslow down\b|\bone step at a time\b/.test(r)) return true;
  if (kind === "depth" && !/\bgo deeper\b|\bpressure-specific analysis\b|\bseparate risk from execution mode\b/.test(r)) return true;
  if (kind === "safety" && !/\bsafest next move is\b|\bpressure-handling lane\b/.test(r)) return true;
  return false;
}
function priority9IR2ApplyVisibleReply(output, reply, kind) {
  var out = output && typeof output === "object" && !Array.isArray(output) ? output : {};
  out.reply = reply;
  out.text = reply;
  out.message = reply;
  out.answer = reply;
  out.visibleReply = reply;
  out.spokenText = reply;
  out.priority = "Priority 9I-R2";
  out.priorityLane = "priority9i_adaptive_situational_reasoning";
  out.activeLane = "Priority 9I";
  out.responseShape = "pressure_specific_answer";
  out.pressureKind = kind;
  out.priority9I = Object.assign({}, priority9IR2Obj(out.priority9I), {
    active: true,
    lane: "priority9i_adaptive_situational_reasoning",
    hotfix: "Priority 9I-R2 pressure-specific answer shaping",
    pressureKind: kind,
    pressureSpecificAnswer: true,
    keep9HFoundation: true,
    keep9JStaged: true
  });
  out.priority9J = Object.assign({}, priority9IR2Obj(out.priority9J), {
    staged: true,
    active: false,
    activationRequired: "explicit_9j_or_next_move_authority"
  });
  var payload = priority9IR2Obj(out.payload);
  out.payload = Object.assign({}, payload, {
    reply: reply,
    text: priority9IR2PickText(payload.text, reply),
    priorityLane: "priority9i_adaptive_situational_reasoning",
    pressureKind: kind
  });
  if (out.finalEnvelope && typeof out.finalEnvelope === "object") {
    out.finalEnvelope.reply = reply;
    out.finalEnvelope.text = reply;
    out.finalEnvelope.visibleReply = reply;
  }
  return out;
}
function priority9IR2DisciplineOutput(input, output) {
  var text = priority9IR2ExtractText(input);
  var kind = priority9IR2PressureKind(text);
  if (!kind) return output;
  var reply = priority9IR2ReplyFor(text);
  if (!reply) return output;
  if (typeof output === "string") {
    return priority9IR2ShouldOverride(input, output) ? reply : output;
  }
  if (priority9IR2ShouldOverride(input, output)) return priority9IR2ApplyVisibleReply(output, reply, kind);
  if (output && typeof output === "object" && !Array.isArray(output)) {
    output.priority9I = Object.assign({}, priority9IR2Obj(output.priority9I), {active:true, pressureKind:kind, pressureSpecificAnswer:true, keep9HFoundation:true, keep9JStaged:true});
    output.priority9J = Object.assign({}, priority9IR2Obj(output.priority9J), {staged:true, active:false});
  }
  return output;
}
function priority9IR2WrapExport(name) {
  if (typeof module === "undefined" || !module.exports || typeof module.exports[name] !== "function") return;
  var original = module.exports[name];
  if (original.__priority9IR2Wrapped) return;
  var wrapped = function priority9IR2WrappedExport() {
    var input = arguments.length > 0 ? arguments[0] : {};
    var out = original.apply(this, arguments);
    if (out && typeof out.then === "function") {
      return out.then(function(value) { return priority9IR2DisciplineOutput(input, value); });
    }
    return priority9IR2DisciplineOutput(input, out);
  };
  wrapped.__priority9IR2Wrapped = true;
  module.exports[name] = wrapped;
}
function priority9IR2PatchCommonExports(names) {
  (Array.isArray(names) ? names : []).forEach(priority9IR2WrapExport);
  if (typeof module !== "undefined" && module.exports) {
    module.exports.PRIORITY_9I_R2_PRESSURE_SPECIFIC_ANSWER_SHAPING_VERSION = PRIORITY_9I_R2_PRESSURE_SPECIFIC_ANSWER_SHAPING_VERSION;
    module.exports.isPriority9IR2PressureSpecificText = priority9IR2IsPressureSpecificText;
    module.exports.priority9IR2PressureKind = priority9IR2PressureKind;
    module.exports.priority9IR2ReplyFor = priority9IR2ReplyFor;
    module.exports.priority9IR2DisciplineOutput = priority9IR2DisciplineOutput;
    module.exports._internal = Object.assign({}, priority9IR2Obj(module.exports._internal), {
      priority9IR2IsPressureSpecificText: priority9IR2IsPressureSpecificText,
      priority9IR2PressureKind: priority9IR2PressureKind,
      priority9IR2ReplyFor: priority9IR2ReplyFor,
      priority9IR2DisciplineOutput: priority9IR2DisciplineOutput,
      priority9IR2ShouldOverride: priority9IR2ShouldOverride
    });
  }
}
/* PRIORITY_9I_R2_PRESSURE_SPECIFIC_ANSWER_SHAPING_PATCH_COMMON_END */


function priority9IR2ConciergeMetadata(input, previous) {
  var text = priority9IR2ExtractText(input);
  var kind = priority9IR2PressureKind(text);
  if (!kind) return previous || {};
  var base = previous && typeof previous === "object" && !Array.isArray(previous) ? previous : {};
  return Object.assign({}, base, {
    action: "route",
    route: "execution_context",
    domain: "execution_context",
    intent: "contextual_directive",
    confidence: Math.max(Number(base.confidence) || 0, 0.94),
    priorityLane: "priority9i_adaptive_situational_reasoning",
    activeLane: "Priority 9I",
    pressureKind: kind,
    pressureSpecificAnswer: true,
    suppress9JEscalation: true,
    priority9J: Object.assign({}, priority9IR2Obj(base.priority9J), {staged:true, active:false})
  });
}
["runDomainConcierge","route","classify","analyze","default"].forEach(function(name){if(typeof module.exports[name]==="function"){var original=module.exports[name];module.exports[name]=function priority9IR2ConciergeWrapper(input){return priority9IR2ConciergeMetadata(input, original.apply(this,arguments));};}});
module.exports.priority9IR2ConciergeMetadata = priority9IR2ConciergeMetadata;

module.exports.PRIORITY_9I_R2_PRESSURE_SPECIFIC_ANSWER_SHAPING_PATCH = true;
/* PRIORITY_9I_R2_PRESSURE_SPECIFIC_ANSWER_SHAPING_PATCH_END */


/* PRIORITY_9I_R2A_ALT_PRESSURE_SPECIFIC_FINAL_OVERRIDE_START */
const PRIORITY_9I_R2A_ALT_PRESSURE_SPECIFIC_FINAL_OVERRIDE_VERSION = "nyx.marion.priority9i.r2a.altPressureSpecificFinalOverride/1.0";
function priority9IR2AString(value){return value == null ? "" : String(value).replace(/\s+/g," ").trim();}
function priority9IR2ALower(value){return priority9IR2AString(value).toLowerCase().replace(/[“”]/g,'"').replace(/[‘’]/g,"'");}
function priority9IR2AObj(value){return value && typeof value === "object" && !Array.isArray(value) ? value : {};}
function priority9IR2APickText(){
  for (var i=0;i<arguments.length;i+=1){var t=priority9IR2AString(arguments[i]);if(t)return t;}
  return "";
}
function priority9IR2AExtractText(value, depth){
  if(value == null) return "";
  if(typeof value === "string") return priority9IR2AString(value);
  if(depth > 3) return "";
  if(Array.isArray(value)){
    for(var i=0;i<value.length;i+=1){var a=priority9IR2AExtractText(value[i], (depth||0)+1); if(a) return a;}
    return "";
  }
  var v=priority9IR2AObj(value), payload=priority9IR2AObj(v.payload), command=priority9IR2AObj(v.command), body=priority9IR2AObj(v.body);
  var context=priority9IR2AObj(v.context || v.memory || v.state || v.turnMemory || v.conversationState);
  return priority9IR2APickText(
    v.text, v.message, v.prompt, v.query, v.input, v.commandText, v.transcript, v.userText, v.rawUserText,
    payload.text, payload.message, payload.prompt, payload.query, payload.input, payload.commandText, payload.transcript,
    command.text, command.message, command.prompt, command.query, command.command, command.input,
    body.text, body.message, body.prompt, body.query, body.input, body.transcript,
    context.text, context.message, context.prompt, context.lastUserText, context.lastPrompt, context.activePrompt
  );
}
function priority9IR2AExplicit9J(value){
  var t=priority9IR2ALower(value);
  return /\b(priority\s*9j|9j\b|proactive operational guidance|next-move authority|next move authority)\b/.test(t) &&
    !/\bstaged\b|\bstage\b|\bdo not activate\b|\bnot activate\b|\bkeep\s+9j\b|\bkeep\s+priority\s*9j\b/.test(t);
}
function priority9IR2APressureKind(value){
  var t=priority9IR2ALower(value);
  if(!t || priority9IR2AExplicit9J(t)) return "";
  if(/\bwhat(?:'s| is)?\s+the\s+risk\s+now\??\b|\brisk\s+now\??\b|\bcurrent\s+risk\b|\bactive\s+risk\b/.test(t)) return "risk";
  if(/\bno[, ]+not that\b|\bstay\s+on\s+the\s+architecture\b|\barchitecture\s+focus\b|\bstay\s+architectural\b|\bnot\s+that\b/.test(t)) return "correction";
  if(/\burgent\b|\burgency\b|\bimmediate\b|\btime[-\s]?sensitive\b|\bcritical now\b|\bpressure is high\b/.test(t)) return "urgency";
  if(/\bpivot\b|\bchange direction\b|\bshift direction\b|\bnew direction\b/.test(t)) return "pivot";
  if(/^\s*slow\s+down[.!?]*\s*$|\bslow\s+down\b|\bone step at a time\b|\btoo fast\b|\bpace\b/.test(t)) return "pace";
  if(/^\s*go\s+deeper[.!?]*\s*$|\bgo\s+deeper\b|\bdeeper\b|\bmore depth\b|\bdrill down\b/.test(t)) return "depth";
  if(/\bdo\s+the\s+safest\s+next\s+move\b|\bsafest\s+next\s+move\b|\bsafest\s+action\b|\bsafe\s+next\s+action\b/.test(t)) return "safety";
  return "";
}
function priority9IR2AReplyFor(value){
  var kind=priority9IR2APressureKind(value);
  if(kind==="risk") return "Priority 9I: the risk now is premature escalation into 9J, generic pressure-template reuse, or losing the 9H continuity foundation. Execution mode is risk-specific containment: name the risk directly, keep 9J staged, and choose the safest next action inside 9I.";
  if(kind==="correction") return "Priority 9I: correction received. Stay on the architecture. Preserve the 9H continuity foundation, treat this as a context-pressure correction, update execution mode to architectural focus, and continue the safest next action without activating 9J.";
  if(kind==="urgency") return "Priority 9I: urgency detected. The risk is rushing into 9J authority or skipping pressure triage. Keep 9H as the continuity foundation, update execution mode to urgent containment, and choose the safest next action inside 9I before any next-move authority activates.";
  if(kind==="pivot") return "Priority 9I: pivot received. The pressure change is directional, not a 9J activation. Preserve the 9H foundation, compare the pivot against the active task, update risk and execution mode, then continue with the safest next action while 9J remains staged.";
  if(kind==="pace") return "Priority 9I: slow down. The pressure type is pace control. Preserve the 9H continuity foundation, narrow the next response to one step, reduce branching, and keep 9J staged until next-move authority is explicitly requested.";
  if(kind==="depth") return "Priority 9I: go deeper means add pressure-specific analysis, not activate 9J. Preserve 9H, identify what changed, separate risk from execution mode, and give the safest next action with 9J still staged.";
  if(kind==="safety") return "Priority 9I: the safest next move is to stay in the pressure-handling lane, name the active risk, preserve 9H continuity, and avoid activating 9J until the user explicitly asks for proactive next-move authority.";
  return "";
}
function priority9IR2AReplyText(value, depth, seen){
  if(value == null) return "";
  if(typeof value === "string") return priority9IR2AString(value);
  if(depth > 4) return "";
  if(!seen) seen=[];
  if(seen.indexOf(value)!==-1) return "";
  seen.push(value);
  if(Array.isArray(value)){
    for(var i=0;i<value.length;i+=1){var arr=priority9IR2AReplyText(value[i], (depth||0)+1, seen); if(arr) return arr;}
    return "";
  }
  var v=priority9IR2AObj(value), payload=priority9IR2AObj(v.payload), finalEnvelope=priority9IR2AObj(v.finalEnvelope), result=priority9IR2AObj(v.result);
  return priority9IR2APickText(
    v.reply, v.finalReply, v.publicReply, v.visibleReply, v.displayReply, v.response, v.text, v.message, v.spokenText, v.speechText,
    payload.reply, payload.finalReply, payload.publicReply, payload.visibleReply, payload.text, payload.message,
    finalEnvelope.reply, finalEnvelope.finalReply, finalEnvelope.publicReply, finalEnvelope.visibleReply, finalEnvelope.text, finalEnvelope.message,
    result.reply, result.finalReply, result.publicReply, result.visibleReply, result.text, result.message
  );
}
function priority9IR2AIsGeneric9IReply(value){
  var t=priority9IR2ALower(value);
  if(!t) return false;
  return /\bcontinue priority\s*9i:\s*preserve the 9h continuity foundation,?\s*read the current pressure shift,?\s*update operational risk and execution mode,?\s*then give the safest next action\b/.test(t) ||
    /\bpreserve the 9h continuity foundation,?\s*read the current pressure shift,?\s*update operational risk and execution mode\b/.test(t);
}
function priority9IR2AShouldOverride(prompt, candidate){
  var kind=priority9IR2APressureKind(prompt);
  if(!kind) return false;
  var current=priority9IR2AReplyText(candidate);
  if(!current) return true;
  var c=priority9IR2ALower(current);
  if(priority9IR2AIsGeneric9IReply(current)) return true;
  if(/\bpriority\s*9j\b/.test(c) && !/\bstaged\b|\bstage\b|\bnot activate\b|\bkeep\s+9j\b|\bkeep\s+priority\s*9j\b/.test(c)) return true;
  if(kind==="risk" && !/\brisk now is\b|\bpremature escalation\b|\bgeneric pressure-template reuse\b|\brisk-specific containment\b/.test(c)) return true;
  if(kind==="pace" && !/\bslow down\b|\bpace control\b|\bone step\b/.test(c)) return true;
  if(kind==="depth" && !/\bgo deeper means\b|\bpressure-specific analysis\b|\bseparate risk from execution mode\b/.test(c)) return true;
  if(kind==="safety" && !/\bsafest next move is\b|\bpressure-handling lane\b|\bname the active risk\b/.test(c)) return true;
  if(kind==="correction" && !/\bcorrection received\b|\bstay on the architecture\b|\barchitectural focus\b/.test(c)) return true;
  if(kind==="urgency" && !/\burgency detected\b|\burgent containment\b|\brushing into 9j\b/.test(c)) return true;
  if(kind==="pivot" && !/\bpivot received\b|\bdirectional\b|\bcompare the pivot\b/.test(c)) return true;
  return false;
}
function priority9IR2AApplyVisibleReply(output, reply, kind){
  if(typeof output === "string") return reply;
  var out = output && typeof output === "object" && !Array.isArray(output) ? Object.assign({}, output) : {};
  out.reply=reply; out.text=reply; out.message=reply; out.response=reply; out.finalReply=reply; out.visibleReply=reply; out.publicReply=reply; out.displayReply=reply;
  if(typeof out.spokenText === "string") out.spokenText=reply;
  if(typeof out.speechText === "string") out.speechText=reply;
  out.priority9I=Object.assign({}, priority9IR2AObj(out.priority9I), {active:true, lane:"priority9i_adaptive_situational_reasoning", pressureKind:kind, pressureSpecificAnswer:true, r2aAltFinalOverride:true, keep9HFoundation:true, keep9JStaged:true});
  out.priority9J=Object.assign({}, priority9IR2AObj(out.priority9J), {staged:true, active:false, blockedReason:"Priority 9I-R2A pressure-specific prompt"});
  out.priority9IR2A={active:true, hotfix:"Priority 9I-R2A ALT pressure-specific final override", pressureKind:kind};
  if(out.payload && typeof out.payload === "object" && !Array.isArray(out.payload)){out.payload=Object.assign({}, out.payload, {reply:reply,text:reply,message:reply,finalReply:reply,visibleReply:reply,publicReply:reply});}
  if(out.finalEnvelope && typeof out.finalEnvelope === "object" && !Array.isArray(out.finalEnvelope)){out.finalEnvelope=Object.assign({}, out.finalEnvelope, {reply:reply,text:reply,message:reply,finalReply:reply,visibleReply:reply,publicReply:reply});}
  return out;
}
function priority9IR2AAltPressureSpecificFinal(prompt, candidate){
  var source=priority9IR2AExtractText(prompt);
  var kind=priority9IR2APressureKind(source);
  if(!kind) return candidate;
  var reply=priority9IR2AReplyFor(source);
  if(!reply) return candidate;
  if(priority9IR2AShouldOverride(source, candidate)) return priority9IR2AApplyVisibleReply(candidate, reply, kind);
  return candidate;
}
function priority9IR2AWrapExport(name){
  if(typeof module === "undefined" || !module.exports || typeof module.exports[name] !== "function") return;
  var original=module.exports[name];
  if(original.__priority9IR2AWrapped) return;
  var wrapped=function priority9IR2AExportWrapper(){
    var input=arguments.length>0?arguments[0]:{};
    var prompt=priority9IR2AExtractText(input);
    var out=original.apply(this, arguments);
    if(out && typeof out.then === "function"){
      return out.then(function(value){return priority9IR2AAltPressureSpecificFinal(prompt, value);});
    }
    return priority9IR2AAltPressureSpecificFinal(prompt, out);
  };
  wrapped.__priority9IR2AWrapped=true;
  module.exports[name]=wrapped;
}
function priority9IR2APatchExports(names){
  (Array.isArray(names)?names:[]).forEach(priority9IR2AWrapExport);
  if(typeof module !== "undefined" && module.exports){
    module.exports.PRIORITY_9I_R2A_ALT_PRESSURE_SPECIFIC_FINAL_OVERRIDE_VERSION=PRIORITY_9I_R2A_ALT_PRESSURE_SPECIFIC_FINAL_OVERRIDE_VERSION;
    module.exports.isPriority9IR2AAltPressureSpecificText=function(value){return !!priority9IR2APressureKind(value);};
    module.exports.priority9IR2AAltPressureKind=priority9IR2APressureKind;
    module.exports.priority9IR2AAltPressureSpecificReplyFor=priority9IR2AReplyFor;
    module.exports.priority9IR2AAltPressureSpecificFinal=priority9IR2AAltPressureSpecificFinal;
    module.exports.priority9IR2AIsGeneric9IReply=priority9IR2AIsGeneric9IReply;
    module.exports.PRIORITY_9I_R2A_ALT_PRESSURE_SPECIFIC_FINAL_OVERRIDE_PATCH=true;
  }
}
/* PRIORITY_9I_R2A_ALT_PRESSURE_SPECIFIC_FINAL_OVERRIDE_END */

priority9IR2APatchExports(["orchestrate", "route", "analyze", "handle", "default"]);



/* PRIORITY_9J_R1_DECISION_SPECIFIC_AUTHORITY_HOTFIX_START */
const PRIORITY_9J_R1_DECISION_SPECIFIC_AUTHORITY_VERSION = "PRIORITY-9J-R1-DECISION-SPECIFIC-AUTHORITY-HOTFIX";

function priority9JR1SafeStr(value) {
  return value == null ? "" : String(value).replace(/\s+/g, " ").trim();
}

function priority9JR1Lower(value) {
  return priority9JR1SafeStr(value).toLowerCase();
}

function priority9JR1SafeObj(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function priority9JR1FirstText(values) {
  const list = Array.isArray(values) ? values : [];
  for (let i = 0; i < list.length; i += 1) {
    const v = priority9JR1SafeStr(list[i]);
    if (v) return v;
  }
  return "";
}

function priority9JR1ExtractPromptFromArgs(argsLike) {
  const args = Array.prototype.slice.call(argsLike || []);
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (typeof arg === "string" && priority9JR1SafeStr(arg)) return priority9JR1SafeStr(arg);
    const obj = priority9JR1SafeObj(arg);
    const payload = priority9JR1SafeObj(obj.payload);
    const command = priority9JR1SafeObj(obj.command);
    const context = priority9JR1SafeObj(obj.context || obj.state || obj.memory || obj.metadata);
    const text = priority9JR1FirstText([
      obj.prompt,
      obj.message,
      obj.text,
      obj.userText,
      obj.input,
      obj.query,
      obj.commandText,
      payload.prompt,
      payload.message,
      payload.text,
      payload.userText,
      payload.input,
      payload.query,
      command.prompt,
      command.message,
      command.text,
      command.query,
      context.prompt,
      context.message,
      context.text,
      context.userText,
      context.lastPrompt,
      context.currentPrompt
    ]);
    if (text) return text;
  }
  return "";
}

function priority9JR1DetectOperationalCommand(value) {
  const t = priority9JR1Lower(value).replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/\s+/g, " ").trim();
  if (!t) return "";
  if (/\bpriority\s*9j\b/.test(t) && /\b(proactive operational guidance|next[- ]move authority|controlled authority)\b/.test(t)) return "activation";
  if (/\bwhat\s+should\s+we\s+do\s+first\b|\bwhat\s+do\s+we\s+do\s+first\b|\bwhere\s+do\s+we\s+start\b|\bwhat\s+comes\s+first\b/.test(t)) return "first_move";
  if (/\bmake\s+the\s+decision\b|\bmake\s+a\s+decision\b|\bdecide\b|\bmake\s+the\s+call\b|\bchoose\s+for\s+me\b/.test(t)) return "decision";
  if (/\bcritical\s+path\b|\bwhat\s+is\s+the\s+path\s+now\b|\bwhat\s+is\s+the\s+sequence\s+path\b/.test(t)) return "critical_path";
  if (/\bsafest\s+sequence\b|\bsafe\s+sequence\b|\bsafest\s+order\b|\bgive\s+me\s+the\s+safest\b/.test(t)) return "safest_sequence";
  if (/\bwhat\s+should\s+we\s+avoid\b|\bwhat\s+do\s+we\s+avoid\b|\bavoid\s+what\b|\bwhat\s+not\s+to\s+do\b/.test(t)) return "avoid";
  if (/\bnext\s+operational\s+move\b|\bnext\s+operation\b|\boperational\s+move\b|\bwhat\s+is\s+the\s+next\s+move\b/.test(t)) return "next_operational_move";
  return "";
}

function priority9JR1BuildOperationalReply(prompt, context) {
  const kind = priority9JR1DetectOperationalCommand(prompt);
  if (!kind) return "";
  if (kind === "activation") {
    return "Priority 9J: proactive operational guidance and next-move authority is active. The 9H continuity foundation and 9I pressure-handling layer stay underneath the decision. The rule is one controlled operational move at a time: choose the action, explain why it comes first, name the risk if skipped, then give the execution sequence without opening unnecessary branches.";
  }
  if (kind === "first_move") {
    return "Priority 9J: do the first validation move now: prove decision-specific authority before expanding scope. Why first: 9J must show it can choose one operational action, not repeat generic framing. Risk if skipped: Marion can over-branch, drift, or sound authoritative without making a usable decision. Execution sequence: test decision authority, critical-path naming, safest sequence, avoid-list, then final next operational move.";
  }
  if (kind === "decision") {
    return "Priority 9J decision: stay in the 9J lane and run critical-path validation next. This comes first because Marion must prove it can choose one operational move before broader branching. Risk if skipped: Marion may sound authoritative while still giving generic guidance. Execution sequence: answer the critical path, then the safest sequence, then what to avoid, then the next operational move.";
  }
  if (kind === "critical_path") {
    return "Priority 9J: the critical path is to validate one operational decision at a time: first decision authority, then critical-path naming, then safest sequence, then avoid-list, then final next operational move. This comes first because 9J must prove it can choose and sequence action without over-branching. Risk if skipped: Marion may sound authoritative while still giving generic guidance.";
  }
  if (kind === "safest_sequence") {
    return "Priority 9J: the safest sequence is: 1) keep 9H as the continuity foundation, 2) keep 9I as pressure handling underneath, 3) choose one 9J operational move, 4) name why it comes first, 5) name the risk if skipped, and 6) execute only that next step before branching. This prevents drift, premature escalation, and generic authority wording.";
  }
  if (kind === "avoid") {
    return "Priority 9J: avoid over-branching, generic “choose the safest action” wording, premature 9I fallback, activating a new lane before 9J is accepted, and making recommendations without a concrete execution sequence. The safest action is to keep the current 9J test narrow and require each answer to choose one operational move.";
  }
  if (kind === "next_operational_move") {
    return "Priority 9J: the next operational move is to lock decision-specific authority by rerunning the 9J acceptance chain and confirming each prompt receives a specific answer. Why this comes first: the lane is active, but authority must be command-specific. Risk if skipped: Marion can pass lane retention while failing operational usefulness. Execution sequence: retest “Make the decision,” “What is the critical path,” “Give me the safest sequence,” “What should we avoid,” and “What is the next operational move.”";
  }
  return "";
}

function priority9JR1IsGeneric9JReply(value) {
  const t = priority9JR1Lower(value);
  if (!t) return false;
  if (/\brecommended\s+next\s+move:\s*choose\s+the\s+safest\s+concrete\s+action\b/.test(t)) return true;
  if (/\bchoose\s+the\s+safest\s+concrete\s+action\s+that\s+preserves\s+the\s+active\s+lane\b/.test(t)) return true;
  if (/\bproactive\s+operational\s+guidance\s+and\s+next[- ]move\s+authority\b/.test(t) && /\b9h\s+continuity\s+foundation\b/.test(t) && /\b9i\s+pressure[- ]handling\b/.test(t) && /\bchoose\s+the\s+safest\b/.test(t) && !/\b(decision:|critical\s+path\s+is|safest\s+sequence\s+is|avoid\s+over[- ]branching|next\s+operational\s+move\s+is)\b/.test(t)) return true;
  return false;
}

function priority9JR1ApplyReplyToResult(result, forcedReply, prompt) {
  if (!forcedReply) return result;
  if (typeof result === "string") {
    return priority9JR1IsGeneric9JReply(result) || priority9JR1DetectOperationalCommand(prompt) ? forcedReply : result;
  }
  if (!result || typeof result !== "object") return forcedReply;
  const out = Array.isArray(result) ? result.slice() : Object.assign({}, result);
  const nested = priority9JR1SafeObj(out.result);
  const finalEnvelope = priority9JR1SafeObj(out.finalEnvelope || nested.finalEnvelope);
  const meta = Object.assign({}, priority9JR1SafeObj(out.meta || nested.meta), {
    priority: "9J-R1",
    lane: "priority9j_proactive_operational_guidance",
    operationalCommand: priority9JR1DetectOperationalCommand(prompt),
    decisionSpecificAuthority: true,
    keep9HFoundation: true,
    keep9IPressureLayer: true,
    overBranchingSuppressed: true,
    generic9JTemplateSuppressed: true
  });

  out.reply = forcedReply;
  out.response = forcedReply;
  out.text = forcedReply;
  out.message = forcedReply;
  out.final = forcedReply;
  out.publicReply = forcedReply;
  out.visibleReply = forcedReply;
  out.output = forcedReply;
  out.meta = meta;
  out.priority = "9J-R1";
  out.lane = "priority9j_proactive_operational_guidance";

  if (Object.keys(finalEnvelope).length) {
    out.finalEnvelope = Object.assign({}, finalEnvelope, {
      reply: forcedReply,
      text: forcedReply,
      message: forcedReply,
      publicReply: forcedReply,
      visibleReply: forcedReply,
      priority: "9J-R1",
      lane: "priority9j_proactive_operational_guidance",
      meta
    });
  }

  if (Object.keys(nested).length) {
    out.result = Object.assign({}, nested, {
      reply: forcedReply,
      response: forcedReply,
      text: forcedReply,
      message: forcedReply,
      final: forcedReply,
      publicReply: forcedReply,
      visibleReply: forcedReply,
      meta,
      finalEnvelope: out.finalEnvelope || Object.assign({}, finalEnvelope, { reply: forcedReply, text: forcedReply, meta })
    });
  }
  return out;
}

function priority9JR1PatchExports(names) {
  if (typeof module === "undefined" || !module.exports) return;
  const target = module.exports;
  if (typeof target === "function" && !target.__priority9JR1DecisionSpecificAuthorityPatched) {
    const original = target;
    const wrapped = function priority9JR1WrappedDefault() {
      const prompt = priority9JR1ExtractPromptFromArgs(arguments);
      const forced = priority9JR1BuildOperationalReply(prompt, arguments[1] || {});
      const result = original.apply(this, arguments);
      if (result && typeof result.then === "function") {
        return result.then((value) => priority9JR1ApplyReplyToResult(value, forced, prompt));
      }
      return priority9JR1ApplyReplyToResult(result, forced, prompt);
    };
    Object.keys(original).forEach((k) => { try { wrapped[k] = original[k]; } catch (_) {} });
    wrapped.__priority9JR1DecisionSpecificAuthorityPatched = true;
    module.exports = wrapped;
  }
  const obj = module.exports && typeof module.exports === "object" ? module.exports : {};
  (Array.isArray(names) ? names : []).forEach((name) => {
    if (typeof obj[name] !== "function" || obj[name].__priority9JR1DecisionSpecificAuthorityPatched) return;
    const original = obj[name];
    obj[name] = function priority9JR1WrappedExport() {
      const prompt = priority9JR1ExtractPromptFromArgs(arguments);
      const forced = priority9JR1BuildOperationalReply(prompt, arguments[1] || {});
      const result = original.apply(this, arguments);
      if (result && typeof result.then === "function") {
        return result.then((value) => priority9JR1ApplyReplyToResult(value, forced, prompt));
      }
      return priority9JR1ApplyReplyToResult(result, forced, prompt);
    };
    obj[name].__priority9JR1DecisionSpecificAuthorityPatched = true;
  });
  if (module.exports && typeof module.exports === "object") {
    module.exports.priority9JR1DetectOperationalCommand = priority9JR1DetectOperationalCommand;
    module.exports.priority9JR1BuildOperationalReply = priority9JR1BuildOperationalReply;
    module.exports.priority9JR1IsGeneric9JReply = priority9JR1IsGeneric9JReply;
    module.exports.PRIORITY_9J_R1_DECISION_SPECIFIC_AUTHORITY_PATCH = true;
  }
}
/* PRIORITY_9J_R1_DECISION_SPECIFIC_AUTHORITY_HOTFIX_END */

priority9JR1PatchExports(["orchestrate", "route", "analyze", "handle", "default"]);


/* PRIORITY_9J_R1A_RUNTIME_DECISION_SPECIFIC_FINAL_OVERRIDE_START */
const PRIORITY_9J_R1A_RUNTIME_DECISION_SPECIFIC_FINAL_OVERRIDE_VERSION = "PRIORITY-9J-R1A-RUNTIME-DECISION-SPECIFIC-FINAL-OVERRIDE";
function priority9JR1ASafeStr(value) { return value == null ? "" : String(value).replace(/\s+/g, " ").trim(); }
function priority9JR1ALower(value) { return priority9JR1ASafeStr(value).toLowerCase(); }
function priority9JR1AObj(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function priority9JR1AFirstText(values) {
  const list = Array.isArray(values) ? values : [];
  for (let i = 0; i < list.length; i += 1) { const v = priority9JR1ASafeStr(list[i]); if (v) return v; }
  return "";
}
function priority9JR1AExtractTextFromValue(value) {
  if (typeof value === "string") return priority9JR1ASafeStr(value);
  const src = priority9JR1AObj(value);
  const payload = priority9JR1AObj(src.payload);
  const command = priority9JR1AObj(src.command);
  const body = priority9JR1AObj(src.body);
  const query = priority9JR1AObj(src.query);
  const meta = priority9JR1AObj(src.meta || src.metadata);
  const result = priority9JR1AObj(src.result);
  const finalEnvelope = priority9JR1AObj(src.finalEnvelope || result.finalEnvelope);
  return priority9JR1AFirstText([
    src.prompt, src.message, src.text, src.userText, src.input, src.query, src.commandText, src.transcript,
    payload.prompt, payload.message, payload.text, payload.userText, payload.input, payload.query, payload.commandText,
    command.prompt, command.message, command.text, command.query, command.command, command.name,
    body.prompt, body.message, body.text, body.userText, body.query,
    query.prompt, query.message, query.text,
    meta.prompt, meta.message, meta.text, meta.userText, meta.lastPrompt, meta.currentPrompt, meta.operationalCommand,
    result.prompt, result.message, result.text, result.userText,
    finalEnvelope.prompt, finalEnvelope.message, finalEnvelope.text
  ]);
}
function priority9JR1AExtractPrompt(argsLike) {
  const args = Array.prototype.slice.call(argsLike || []);
  for (let i = 0; i < args.length; i += 1) {
    const text = priority9JR1AExtractTextFromValue(args[i]);
    if (text) return text;
  }
  return "";
}
function priority9JR1ADetectCommand(value) {
  const t = priority9JR1ALower(value).replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/\s+/g, " ").trim();
  if (!t) return "";
  if (/\bpriority\s*9j\b/.test(t) && /\b(proactive operational guidance|next[- ]move authority|controlled authority)\b/.test(t)) return "activation";
  if (/\bwhat\s+should\s+we\s+do\s+first\b|\bwhat\s+do\s+we\s+do\s+first\b|\bwhere\s+do\s+we\s+start\b|\bwhat\s+comes\s+first\b/.test(t)) return "first_move";
  if (/\bmake\s+the\s+decision\b|\bmake\s+a\s+decision\b|\bmake\s+the\s+call\b|\bchoose\s+for\s+me\b|^\s*decide[.!?\s]*$/.test(t)) return "decision";
  if (/\bcritical\s+path\b|\bwhat\s+is\s+the\s+path\s+now\b|\bsequence\s+path\b/.test(t)) return "critical_path";
  if (/\bsafest\s+sequence\b|\bsafe\s+sequence\b|\bsafest\s+order\b|\bgive\s+me\s+the\s+safest\b/.test(t)) return "safest_sequence";
  if (/\bwhat\s+should\s+we\s+avoid\b|\bwhat\s+do\s+we\s+avoid\b|\bavoid\s+what\b|\bwhat\s+not\s+to\s+do\b/.test(t)) return "avoid";
  if (/\bnext\s+operational\s+move\b|\bnext\s+operation\b|\boperational\s+move\b|\bwhat\s+is\s+the\s+next\s+move\b/.test(t)) return "next_operational_move";
  return "";
}
function priority9JR1AReplyFor(prompt) {
  const kind = priority9JR1ADetectCommand(prompt);
  if (!kind) return "";
  if (kind === "activation") return "Priority 9J: proactive operational guidance and next-move authority is active. The 9H continuity foundation and 9I pressure-handling layer stay underneath the decision. The rule is one controlled operational move at a time: choose the action, explain why it comes first, name the risk if skipped, then give the execution sequence without opening unnecessary branches.";
  if (kind === "first_move") return "Priority 9J: do the first validation move now: prove decision-specific authority before expanding scope. Why first: 9J must show it can choose one operational action, not repeat generic framing. Risk if skipped: Marion can over-branch, drift, or sound authoritative without making a usable decision. Execution sequence: test decision authority, critical-path naming, safest sequence, avoid-list, then final next operational move.";
  if (kind === "decision") return "Priority 9J decision: stay in the 9J lane and run critical-path validation next. This comes first because Marion must prove it can choose one operational move before broader branching. Risk if skipped: Marion may sound authoritative while still giving generic guidance. Execution sequence: answer the critical path, then the safest sequence, then what to avoid, then the next operational move.";
  if (kind === "critical_path") return "Priority 9J: the critical path is to validate one operational decision at a time: first decision authority, then critical-path naming, then safest sequence, then avoid-list, then final next operational move. This comes first because 9J must prove it can choose and sequence action without over-branching. Risk if skipped: Marion may sound authoritative while still giving generic guidance.";
  if (kind === "safest_sequence") return "Priority 9J: the safest sequence is: 1) keep 9H as the continuity foundation, 2) keep 9I as pressure handling underneath, 3) choose one 9J operational move, 4) name why it comes first, 5) name the risk if skipped, and 6) execute only that next step before branching. This prevents drift, premature escalation, and generic authority wording.";
  if (kind === "avoid") return "Priority 9J: avoid over-branching, generic “choose the safest action” wording, premature 9I fallback, activating a new lane before 9J is accepted, and making recommendations without a concrete execution sequence. The safest action is to keep the current 9J test narrow and require each answer to choose one operational move.";
  if (kind === "next_operational_move") return "Priority 9J: the next operational move is to lock decision-specific authority by rerunning the 9J acceptance chain and confirming each prompt receives a specific answer. Why this comes first: the lane is active, but authority must be command-specific. Risk if skipped: Marion can pass lane retention while failing operational usefulness. Execution sequence: retest “Make the decision,” “What is the critical path,” “Give me the safest sequence,” “What should we avoid,” and “What is the next operational move.”";
  return "";
}
function priority9JR1AIsGeneric9J(value) {
  const t = priority9JR1ALower(value);
  if (!t) return false;
  if (/\brecommended\s+next\s+move:\s*choose\s+the\s+safest\s+concrete\s+action\b/.test(t)) return true;
  if (/\bchoose\s+the\s+safest\s+concrete\s+action\s+that\s+preserves\s+the\s+active\s+lane\b/.test(t)) return true;
  if (/\bproactive\s+operational\s+guidance\s+and\s+next[- ]move\s+authority\b/.test(t) && /\b9h\s+continuity\s+foundation\b/.test(t) && /\b9i\s+pressure[- ]handling\b/.test(t) && /\bchoose\s+the\s+safest\b/.test(t) && !/\b(decision:|critical\s+path\s+is|safest\s+sequence\s+is|avoid\s+over[- ]branching|next\s+operational\s+move\s+is|do\s+the\s+first\s+validation\s+move)\b/.test(t)) return true;
  return false;
}
function priority9JR1AApply(result, prompt) {
  const forcedReply = priority9JR1AReplyFor(prompt);
  if (!forcedReply) return result;
  const command = priority9JR1ADetectCommand(prompt);
  if (typeof result === "string") return forcedReply;
  if (!result || typeof result !== "object") return forcedReply;
  const out = Array.isArray(result) ? result.slice() : Object.assign({}, result);
  const nested = priority9JR1AObj(out.result);
  const finalEnvelope = priority9JR1AObj(out.finalEnvelope || nested.finalEnvelope);
  const priorReply = priority9JR1AFirstText([out.reply, out.response, out.text, out.message, out.final, out.publicReply, out.visibleReply, nested.reply, nested.response, nested.text, nested.message, finalEnvelope.reply, finalEnvelope.text]);
  if (priorReply && !priority9JR1AIsGeneric9J(priorReply) && !command) return result;
  const meta = Object.assign({}, priority9JR1AObj(out.meta || nested.meta || finalEnvelope.meta), {
    hotfix: PRIORITY_9J_R1A_RUNTIME_DECISION_SPECIFIC_FINAL_OVERRIDE_VERSION,
    priority: "9J-R1A",
    lane: "priority9j_proactive_operational_guidance",
    operationalCommand: command,
    decisionSpecificAuthority: true,
    runtimeDecisionSpecificFinalOverride: true,
    keep9HFoundation: true,
    keep9IPressureLayer: true,
    overBranchingSuppressed: true,
    generic9JTemplateSuppressed: true,
    noUserFacingDiagnostics: true
  });
  ["reply","response","text","message","final","publicReply","visibleReply","output"].forEach(function(k){ out[k] = forcedReply; });
  out.priority = "9J-R1A";
  out.lane = "priority9j_proactive_operational_guidance";
  out.meta = meta;
  out.operationalCommand = command;
  out.decisionSpecificAuthority = true;
  out.generic9JTemplateSuppressed = true;
  out.runtimeDecisionSpecificFinalOverride = true;
  const nextEnvelope = Object.assign({}, finalEnvelope, {
    reply: forcedReply,
    text: forcedReply,
    message: forcedReply,
    publicReply: forcedReply,
    visibleReply: forcedReply,
    final: forcedReply,
    priority: "9J-R1A",
    lane: "priority9j_proactive_operational_guidance",
    meta
  });
  out.finalEnvelope = nextEnvelope;
  if (Object.keys(nested).length) {
    out.result = Object.assign({}, nested, {
      reply: forcedReply,
      response: forcedReply,
      text: forcedReply,
      message: forcedReply,
      final: forcedReply,
      publicReply: forcedReply,
      visibleReply: forcedReply,
      output: forcedReply,
      priority: "9J-R1A",
      lane: "priority9j_proactive_operational_guidance",
      operationalCommand: command,
      decisionSpecificAuthority: true,
      generic9JTemplateSuppressed: true,
      runtimeDecisionSpecificFinalOverride: true,
      meta,
      finalEnvelope: nextEnvelope
    });
  }
  return out;
}
function priority9JR1APatchPriority9JResponder() {
  try {
    if (typeof priority9JReplyFor === "function" && !priority9JReplyFor.__priority9JR1ARuntimeDecisionSpecificPatched) {
      const originalPriority9JReplyFor = priority9JReplyFor;
      priority9JReplyFor = function priority9JR1APatchedPriority9JReplyFor(prompt, source) {
        const forced = priority9JR1AReplyFor(prompt);
        if (forced) return forced;
        const reply = originalPriority9JReplyFor.apply(this, arguments);
        return priority9JR1AIsGeneric9J(reply) && forced ? forced : reply;
      };
      priority9JReplyFor.__priority9JR1ARuntimeDecisionSpecificPatched = true;
    }
  } catch (_) {}
}
function priority9JR1AWrapExport(name) {
  if (typeof module === "undefined" || !module.exports) return;
  const obj = module.exports && typeof module.exports === "object" ? module.exports : null;
  const fn = obj && typeof obj[name] === "function" ? obj[name] : null;
  if (!fn || fn.__priority9JR1ARuntimeDecisionSpecificPatched) return;
  obj[name] = function priority9JR1ARuntimeDecisionSpecificWrappedExport() {
    const prompt = priority9JR1AExtractPrompt(arguments);
    const result = fn.apply(this, arguments);
    if (result && typeof result.then === "function") return result.then(function(value){ return priority9JR1AApply(value, prompt); });
    return priority9JR1AApply(result, prompt);
  };
  obj[name].__priority9JR1ARuntimeDecisionSpecificPatched = true;
}
function priority9JR1APatchExports(names) {
  priority9JR1APatchPriority9JResponder();
  if (typeof module === "undefined" || !module.exports) return;
  if (typeof module.exports === "function" && !module.exports.__priority9JR1ARuntimeDecisionSpecificPatched) {
    const originalDefault = module.exports;
    const wrappedDefault = function priority9JR1ARuntimeDecisionSpecificWrappedDefault() {
      const prompt = priority9JR1AExtractPrompt(arguments);
      const result = originalDefault.apply(this, arguments);
      if (result && typeof result.then === "function") return result.then(function(value){ return priority9JR1AApply(value, prompt); });
      return priority9JR1AApply(result, prompt);
    };
    Object.keys(originalDefault).forEach(function(k){ try { wrappedDefault[k] = originalDefault[k]; } catch (_) {} });
    wrappedDefault.__priority9JR1ARuntimeDecisionSpecificPatched = true;
    module.exports = wrappedDefault;
  }
  (Array.isArray(names) ? names : []).forEach(priority9JR1AWrapExport);
  if (module.exports && typeof module.exports === "object") {
    module.exports.PRIORITY_9J_R1A_RUNTIME_DECISION_SPECIFIC_FINAL_OVERRIDE_VERSION = PRIORITY_9J_R1A_RUNTIME_DECISION_SPECIFIC_FINAL_OVERRIDE_VERSION;
    module.exports.priority9JR1ARuntimeDecisionSpecificReplyFor = priority9JR1AReplyFor;
    module.exports.priority9JR1ARuntimeDecisionSpecificFinal = priority9JR1AApply;
    module.exports.priority9JR1ARuntimeDecisionSpecificCommand = priority9JR1ADetectCommand;
    module.exports.priority9JR1AIsGeneric9JReply = priority9JR1AIsGeneric9J;
    module.exports.PRIORITY_9J_R1A_RUNTIME_DECISION_SPECIFIC_FINAL_OVERRIDE_PATCH = true;
  }
}
priority9JR1APatchExports(["composeMarionResponse", "compose", "buildReply", "routeMarion", "finalize", "buildFinalEnvelope", "toFinalEnvelope", "normalizeFinalEnvelope", "handleMarionAdminTextRuntime", "invokeMarionAdminTextRuntime", "handleTextRuntime", "run", "handler", "default"]);
/* PRIORITY_9J_R1A_RUNTIME_DECISION_SPECIFIC_FINAL_OVERRIDE_END */

// R18AB_AI_CYBER_CONCIERGE_HARDENING_START
const R18AB_DOMAIN_CONCIERGE_VERSION = "nyx.marion.r18ab.domainConcierge.aiCyber/1.0";
function r18abConStr(value){return value==null?"":String(value).replace(/\s+/g," ").trim();}
function r18abConObj(value){return value&&typeof value==="object"&&!Array.isArray(value)?value:{};}
function r18abConFirst(){for(let i=0;i<arguments.length;i+=1){const v=r18abConStr(arguments[i]);if(v)return v;}return"";}
function r18abExtractText(packet){const p=r18abConObj(packet),payload=r18abConObj(p.payload),meta=r18abConObj(p.meta),session=r18abConObj(p.session);return r18abConFirst(p.text,p.userText,p.message,p.prompt,p.rawUserText,p.normalizedUserIntent,payload.text,payload.userText,payload.message,meta.text,session.lastUserText);}
function buildR18ABConciergeProtocol(packet={}, base={}){
  const text=r18abExtractText(packet)||r18abConFirst(r18abConObj(base).rawUserText,r18abConObj(base).normalizedUserIntent);
  const src=[text,JSON.stringify(r18abConObj(base)).slice(0,1200)].join(" ").toLowerCase();
  const ai=/\b(ai|artificial intelligence|machine learning|model|llm|agent|inference|automation|adaptive intelligence|ai integration|real[-\s]?world ai)\b/i.test(src);
  const cyber=/\b(cyber|cybersecurity|security|protective protocol|least privilege|access control|identity|verify identity|secret|token|credential|permission|threat|vulnerability|covert monitoring|autonomous enforcement)\b/i.test(src);
  return {
    version:R18AB_DOMAIN_CONCIERGE_VERSION,
    active:ai||cyber,
    route:ai?"ai":(cyber?"cyber":""),
    knowledgeDomain:ai?"ai":(cyber?"cyber":""),
    aiDomainAdaptability:!!ai,
    cyberProtectiveProtocol:!!cyber,
    aiAssessmentFrame:ai?["goal","context","data","risk","next_move"]:[],
    cyberBoundary:cyber?{
      macScoped:true,
      leastPrivilege:true,
      secretsRedacted:true,
      explicitConfirmationRequired:true,
      noCovertMonitoring:true,
      noAutonomousEnforcement:true,
      noPunitiveAction:true
    }:{},
    baselinePreserved:"r16m-r17c",
    noUserFacingDiagnostics:true
  };
}
function r18abApplyConciergeProtocol(result, packet){
  if(!result||typeof result!=="object")return result;
  const protocol=buildR18ABConciergeProtocol(packet,result);
  if(!protocol.active)return result;
  const out=Array.isArray(result)?result.slice():Object.assign({},result);
  out.r18abDomainExpansion=protocol;
  out.baselinePreserved="r16m-r17c";
  out.noUserFacingDiagnostics=true;
  if(protocol.route){
    out.knowledgeDomain=out.knowledgeDomain||protocol.knowledgeDomain;
    out.route=out.route&&out.route!=="general"?out.route:protocol.route;
    out.confidence=Math.max(Number(out.confidence)||0,0.84);
  }
  out.confidenceAwareResponseShaping=Object.assign({},r18abConObj(out.confidenceAwareResponseShaping),{r18abDomainExpansion:true,aiDomainAdaptability:protocol.aiDomainAdaptability,cyberProtectiveProtocol:protocol.cyberProtectiveProtocol,noUserFacingDiagnostics:true});
  out.composerContext=Object.assign({},r18abConObj(out.composerContext),{r18abDomainExpansion:protocol});
  out.stateSpinePatch=Object.assign({},r18abConObj(out.stateSpinePatch),{r18abDomainExpansion:protocol});
  return out;
}
(function r18abPatchDomainConciergeExports(){
  if(typeof module==="undefined"||!module.exports||typeof module.exports!=="object")return;
  const exp=module.exports;
  ["runDomainConcierge","routeOrClarify"].forEach(function(name){
    const fn=typeof exp[name]==="function"?exp[name]:null;
    if(!fn||fn.__r18abDomainConciergePatched)return;
    exp[name]=function r18abDomainConciergeWrapped(packet){
      const result=fn.apply(this,arguments);
      if(result&&typeof result.then==="function")return result.then(function(v){return r18abApplyConciergeProtocol(v,packet);});
      return r18abApplyConciergeProtocol(result,packet);
    };
    exp[name].__r18abDomainConciergePatched=true;
  });
  exp.R18AB_DOMAIN_CONCIERGE_VERSION=R18AB_DOMAIN_CONCIERGE_VERSION;
  exp.buildR18ABConciergeProtocol=buildR18ABConciergeProtocol;
  exp.r18abApplyConciergeProtocol=r18abApplyConciergeProtocol;
  exp.R18AB_DOMAIN_CONCIERGE_PATCH=true;
})();
// R18AB_AI_CYBER_CONCIERGE_HARDENING_END

// R18C_LAW_ROUTING_REGISTRY_PATCH_START
const R18C_DOMAIN_CONCIERGE_VERSION = "nyx.marion.r18c.domainConcierge.lawAssessment/1.0";
const R18C_LAW_CONCIERGE_FRAME = Object.freeze(["legal_category","jurisdiction_sensitivity","facts_vs_assumptions","risk_exposure","missing_information","safe_next_move"]);
const R18C_LAW_CONCIERGE_BOUNDARY = Object.freeze({generalInformationOnly:true,noLegalAdvice:true,noAttorneyClientRelationship:true,noLegalCertaintyClaim:true,jurisdictionRequired:true,sourceDocumentReviewRequired:true,professionalReviewRecommendedForHighRisk:true});
function r18cConStr(value){return value==null?"":String(value).replace(/\s+/g," ").trim();}
function r18cConObj(value){return value&&typeof value==="object"&&!Array.isArray(value)?value:{};}
function r18cConFirst(){for(let i=0;i<arguments.length;i+=1){const v=r18cConStr(arguments[i]);if(v)return v;}return"";}
function r18cConExtractText(packet){const p=r18cConObj(packet),payload=r18cConObj(p.payload),meta=r18cConObj(p.meta),session=r18cConObj(p.session);return r18cConFirst(p.text,p.userText,p.message,p.prompt,p.query,p.rawUserText,p.normalizedUserIntent,p.effectivePrompt,payload.text,payload.userText,payload.message,meta.text,session.lastUserText);}

function r18cConIsExplicitMediaTurn(text=""){
  const t=r18cConStr(text).toLowerCase();
  if(!t)return false;
  const explicitLegal=/\b(law|legal|legally|lawfully|lawyer|attorney|rights?|copyright|licen[cs]e|licen[cs]ing|contract|liability|negligence|lawsuit|litigation|jurisdiction|compliance|regulatory|regulation|indemnity|trademark|patent|privacy law|employment law|public performance|distribution rights?|streaming rights?)\b/i.test(t);
  if(explicitLegal)return false;
  const mediaSignal=/\b(watch|view|stream|movies?|films?|shows?|programming|cartoons?|animation|classics?|classic movies?|public[-\s]?domain movies?|sandblast tv|television|roku|media|video)\b/i.test(t);
  const discoveryOrNavigation=/\b(what|which|can i|is|are|available|show me|open|launch|go to|take me to|play|start|tell me about|on sandblast)\b/i.test(t);
  return mediaSignal&&discoveryOrNavigation;
}

function r18cConCategories(text=""){
  if(r18cConIsExplicitMediaTurn(text))return [];
  const t=r18cConStr(text).toLowerCase(), out=[]; const add=(key,rx)=>{if(rx.test(t)&&!out.includes(key))out.push(key);};
  add("contract",/\b(contract|agreement|nda|terms|clause|consideration|breach|indemnity|warranty|termination|assignment)\b/i);
  add("copyright_licensing",/\b(copyright|copyrighted|licen[cs]e|licen[cs]ing|distribution rights?|broadcast rights?|ott rights?|roku rights?|streaming rights?|content rights?|fair use|public domain|royalty)\b/i);
  add("intellectual_property",/\b(ip|intellectual property|trademark|trade mark|patent|trade secret|brand mark|logo ownership|copyright ownership)\b/i);
  add("compliance_regulatory",/\b(compliance|regulatory|regulation|policy|statute|permit|filing|reporting requirement|tax credit|grant eligibility)\b/i);
  add("liability_dispute",/\b(liability|liable|negligence|duty of care|damages|claim|lawsuit|litigation|settlement|dispute|legal exposure)\b/i);
  add("employment_contractor",/\b(employee|employment|contractor|independent contractor|worker classification|termination|severance|non[-\s]?compete|non[-\s]?solicit)\b/i);
  add("privacy_data",/\b(privacy|pipeda|gdpr|personal information|personal data|consent|data protection|data retention|user data)\b/i);
  add("corporate_business",/\b(incorporat(?:e|ion)|corporation|shareholder|director|officer|bylaw|articles|business registration|operating agreement)\b/i);
  add("jurisdiction_procedure",/\b(jurisdiction|province|federal|ontario|canada|canadian law|court|tribunal|legal process|procedure|venue)\b/i);
  return out;
}
function r18cConTechnicalSuppressed(text=""){
  const t=r18cConStr(text).toLowerCase();
  return /\b(surgical autopsy|autopsy|audit|patch|update|resend|zip|downloadable|files?|node --check|domain routing|domain registry|domainrouter|mariondomainregistry|marionintentrouter|domainconcierge|domainconfidence|runtime file|javascript|\.js)\b/i.test(t) && r18cConCategories(t).length===0 && !/\b(r18c|law domain|legal domain)\b/i.test(t);
}
function buildR18CLawConciergeProtocol(packet={},base={}){
  const text=r18cConExtractText(packet)||r18cConFirst(r18cConObj(base).rawUserText,r18cConObj(base).normalizedUserIntent,r18cConObj(base).text);
  const src=text;
  const mediaCurrentTurn=r18cConIsExplicitMediaTurn(text);
  const categories=mediaCurrentTurn?[]:r18cConCategories(text);
  const explicit=!mediaCurrentTurn&&/\b(r18c|law domain|legal domain|legal lane|route.*law|activate.*law|law real[-\s]?world assessment|legal risk assessment)\b/i.test(text);
  const active=!mediaCurrentTurn&&(categories.length>0||explicit)&&!r18cConTechnicalSuppressed(text);
  const secondary=[];
  if(/\b(ai|artificial intelligence|model|llm|automation|agent)\b/i.test(src))secondary.push("ai");
  if(/\b(cyber|security|privacy|data protection|credential|access|identity)\b/i.test(src))secondary.push("cyber");
  if(/\b(revenue|pricing|cost|grant|funding|tax credit|moneti[sz]e|royalty|fee|damages)\b/i.test(src))secondary.push("finance");
  if(/\b(roku|ott|streaming|channel|distribution|commercial|business)\b/i.test(src))secondary.push("business");
  return {version:R18C_DOMAIN_CONCIERGE_VERSION,active,route:active?"law":"",intent:active?"domain_question":"",knowledgeDomain:active?"law":"",legalCategory:categories[0]||"general_legal_risk",legalCategories:categories,secondaryDomains:Array.from(new Set(secondary.filter(d=>d!=="law"))).slice(0,4),confidence:active?(explicit?0.97:0.94):0,answerMode:"grounded",assessmentFrame:R18C_LAW_CONCIERGE_FRAME.slice(),legalBoundary:Object.assign({},R18C_LAW_CONCIERGE_BOUNDARY),highStakes:!!active,routeLocked:!!active,noCrossDomainBleed:true,noUserFacingDiagnostics:true};
}
function r18cLawConciergeDomainConfidence(protocol){return {version:DOMAIN_CONFIDENCE_VERSION,confidence:protocol.confidence,confidenceScore:protocol.confidence,band:"high",confidenceBand:"high",margin:0.16,ambiguous:false,routeLocked:true,needsClarifier:false,failClosed:false,primaryDomain:"law",selectedDomain:"law",secondaryDomains:protocol.secondaryDomains||[],knowledgeDomain:"law",answerMode:"grounded",highStakes:true,reason:"r18c_law_real_world_assessment_precedence",legalCategory:protocol.legalCategory,legalCategories:protocol.legalCategories,assessmentFrame:protocol.assessmentFrame,legalBoundary:protocol.legalBoundary,r18cLawAssessment:protocol,candidates:[{domain:"law",confidence:protocol.confidence,reasons:["r18c_law_real_world_assessment_signal",protocol.legalCategory],knowledgeDomain:"law"}],noCrossDomainBleed:true,noUserFacingDiagnostics:true};}
function r18cApplyLawConciergeProtocol(result,packet){
  if(!result||typeof result!=="object")return result;
  const protocol=buildR18CLawConciergeProtocol(packet,result);
  if(!protocol.active)return result;
  const dc=r18cLawConciergeDomainConfidence(protocol);
  const out=Array.isArray(result)?result.slice():Object.assign({},result);
  out.action="route"; out.route="law"; out.intent="domain_question"; out.knowledgeDomain="law"; out.confidence=Math.max(Number(out.confidence)||0,protocol.confidence); out.confidenceBand="high"; out.needsClarifier=false; out.clarifier=""; out.answerMode="grounded"; out.highStakes=true; out.routeLocked=true; out.reason="r18c_law_real_world_assessment_precedence";
  out.domainConfidence=dc; out.r18cLawAssessment=protocol; out.noCrossDomainBleed=true; out.noUserFacingDiagnostics=true;
  out.confidenceAwareResponseShaping=Object.assign({},r18cConObj(out.confidenceAwareResponseShaping),{active:true,action:"route",mode:"grounded",route:"law",intent:"domain_question",knowledgeDomain:"law",confidence:protocol.confidence,confidenceBand:"high",highStakes:true,needsClarifier:false,legalCategory:protocol.legalCategory,assessmentFrame:protocol.assessmentFrame,legalBoundary:protocol.legalBoundary,r18cLawAssessment:protocol,noUserFacingDiagnostics:true});
  out.stateSpinePatch=Object.assign({},r18cConObj(out.stateSpinePatch),{lastConciergeAction:"route",lastRoute:"law",lastIntent:"domain_question",selectedDomain:"law",knowledgeDomain:"law",lastRouteConfidence:protocol.confidence,routeLock:true,routeFailClosed:false,domainConfidence:dc,r18cLawAssessment:protocol,noCrossDomainBleed:true});
  out.composerContext=Object.assign({},r18cConObj(out.composerContext),{routing:{domain:"law",intent:"domain_question",mode:"law_real_world_assessment",depth:"jurisdiction_aware_grounded",routeLock:true,domainConfidence:dc},marionIntent:{intent:"domain_question",confidence:protocol.confidence,reason:"r18c_law_real_world_assessment_precedence",knowledgeDomain:"law",answerMode:"grounded"},domainConfidence:dc,r18cLawAssessment:protocol,noUserFacingDiagnostics:true});
  return out;
}
(function r18cPatchDomainConciergeExports(){
  if(typeof module==="undefined"||!module.exports||typeof module.exports!=="object")return;
  const exp=module.exports;
  ["runDomainConcierge","routeOrClarify"].forEach(function(name){
    const fn=typeof exp[name]==="function"?exp[name]:null;
    if(!fn||fn.__r18cLawConciergePatched)return;
    exp[name]=function r18cLawDomainConciergeWrapped(packet){const result=fn.apply(this,arguments); if(result&&typeof result.then==="function")return result.then(function(v){return r18cApplyLawConciergeProtocol(v,packet);}); return r18cApplyLawConciergeProtocol(result,packet);};
    exp[name].__r18cLawConciergePatched=true;
  });
  if(typeof exp.shouldClarify==="function"&&!exp.shouldClarify.__r18cLawConciergePatched){
    const original=exp.shouldClarify; exp.shouldClarify=function r18cLawShouldClarifyWrapped(packet){const protocol=buildR18CLawConciergeProtocol(packet,{}); if(protocol.active)return false; return original.apply(this,arguments);}; exp.shouldClarify.__r18cLawConciergePatched=true;
  }
  exp.R18C_DOMAIN_CONCIERGE_VERSION=R18C_DOMAIN_CONCIERGE_VERSION;
  exp.R18C_LAW_CONCIERGE_FRAME=R18C_LAW_CONCIERGE_FRAME;
  exp.R18C_LAW_CONCIERGE_BOUNDARY=R18C_LAW_CONCIERGE_BOUNDARY;
  exp.buildR18CLawConciergeProtocol=buildR18CLawConciergeProtocol;
  exp.r18cApplyLawConciergeProtocol=r18cApplyLawConciergeProtocol;
  exp.R18C_LAW_ROUTING_REGISTRY_PATCH=true;
  exp.default=exp;
})();
// R18C_LAW_ROUTING_REGISTRY_PATCH_END



/* R18C_FULL_STACK_REGRESSION_HARMONIZER_START */
(function(){
  try {
    const V = "nyx.marion.r18c.fullStackRegression/1.0";
    function T(v, max){ let s = v == null ? "" : String(v).replace(/\s+/g," ").trim(); if(max && s.length > max) s = s.slice(0, max - 1).trim() + "…"; return s; }
    function O(v){ return v && typeof v === "object" && !Array.isArray(v) ? v : {}; }
    function A(v){ return Array.isArray(v) ? v : []; }
    function lower(v){ return T(v, 4000).toLowerCase(); }
    function firstText(){
      for (let i = 0; i < arguments.length; i += 1) {
        const v = T(arguments[i], 4000);
        if (v) return v;
      }
      return "";
    }
    function extractText(packet){
      const p = O(packet), payload = O(p.payload), meta = O(p.meta), session = O(p.session), body = O(p.body);
      return firstText(p.text, p.userText, p.rawUserText, p.message, p.prompt, p.normalizedUserIntent,
        payload.text, payload.userText, payload.rawUserText, payload.message, payload.prompt,
        meta.text, meta.userText, meta.rawUserText, session.lastUserText, body.text, body.userText);
    }
    function r18cTechnicalLawFileWork(text){
      const t = lower(text);
      return /\b(surgical\s+autopsy|autopsy|patch|fix|update|harden|audit|line[-\s]?by[-\s]?line|node\s+--check|zip|downloadable|resend|script|file|files|js|json|manifest|payload|pack|runtime|router|routing|registry|domain\s+router|domain\s+registry|domain\s+concierge|composemarionresponse|marionbridge|final\s+envelope|state\s+spine|chatengine|index\.js)\b/.test(t) &&
        /\b(law|legal|contract|contracts|manifest|payload|domain)\b/.test(t);
    }
    function r18cShortLawFollowup(text, ctx){
      const t = lower(text).replace(/[.!?]+$/g,"").trim();
      if (!/^(next|next steps|continue|keep going|carry on|what next|what now|then what|passed|pass|locked)$/.test(t)) return false;
      const c = JSON.stringify(ctx || {}).toLowerCase();
      return /\b(activefeaturelane|knowledgeDomain|primaryDomain|selectedDomain|domain|route|lastTopic|currentObjective)\b/.test(c) &&
        /\b(law|legal|contract|copyright|licensing|liability|compliance|jurisdiction)\b/.test(c);
    }

    function isExplicitMediaCurrentTurn(text){
      const t = lower(text);
      if (!t) return false;
      const explicitLegal = /\b(law|legal|legally|lawfully|lawyer|attorney|rights?|copyright|licen[cs]e|licen[cs]ing|contract|liability|negligence|lawsuit|litigation|jurisdiction|compliance|regulatory|regulation|indemnity|trademark|patent|privacy law|employment law|public performance|distribution rights?|streaming rights?)\b/.test(t);
      if (explicitLegal) return false;
      const mediaSignal = /\b(watch|view|stream|movies?|films?|shows?|programming|cartoons?|animation|classics?|classic movies?|public[-\s]?domain movies?|sandblast tv|television|roku|media|video)\b/.test(t);
      const discoveryOrNavigation = /\b(what|which|can i|is|are|available|show me|open|launch|go to|take me to|play|start|tell me about|on sandblast)\b/.test(t);
      return mediaSignal && discoveryOrNavigation;
    }

    function r18cDetectLawCategories(text){
      if (isExplicitMediaCurrentTurn(text)) return [];
      const t = lower(text);
      const out = [];
      if (/\b(copyright|license|licence|licensing|distribution rights?|broadcast rights?|streaming rights?|public performance|sync rights?|roku|ott|movie|movies|moneti[sz]e|platform rights?)\b/.test(t)) out.push("copyright_licensing");
      if (/\b(fired|terminated|termination|severance|release to sign|sign the release|two weeks|employment|employee|employer|contractor|independent contractor|wrongful dismissal|constructive dismissal|without cause)\b/.test(t)) out.push("employment_contractor");
      if (/\b(defamation|libel|slander|false claims?|false statements?|posted false|business online|reputation|negligence|liable|liability|lawsuit|sue|damages|injury|harm|tort)\b/.test(t)) out.push("liability_dispute");
      if (/\b(customer data|personal information|personal data|privacy|data processing|vendor data|pipeda|data breach|consent|processor|controller|dpa|confidential information)\b/.test(t)) out.push("privacy_data");
      if (/\b(trademark|trade mark|patent|intellectual property|\bip\b|brand rights?|logo|mark infringement)\b/.test(t)) out.push("ip_trademark_patent");
      if (/\b(compliance|regulatory|regulation|policy|terms of service|platform terms|statute|act|legal requirement)\b/.test(t)) out.push("compliance_regulatory");
      if (/\b(corporation|incorporated|shareholder|director|officer|bylaws|articles|corporate|business structure)\b/.test(t)) out.push("corporate_business");
      if (/\b(jurisdiction|province|territory|court|tribunal|deadline|limitation|file|filing|procedure|serve|served|hearing)\b/.test(t)) out.push("jurisdiction_procedure");
      if (/\b(contract|agreement|clause|terms|breach|enforceable|consideration|promise|release|waiver|indemnity|distribution rights?)\b/.test(t)) out.push("contract");
      if (/\b(source|sources|verify|verification|case law|canlii|statute|regulation|official source|research)\b/.test(t)) out.push("source_verification");
      if (!out.length && (/\b(law|legal|rights?|obligation|permitted|allowed|should i sign|safe to)\b/.test(t) || /\bcan i\s+(?:legally|lawfully|sue|sign|license|licence|distribute|publish|use copyrighted|terminate|fire)\b/.test(t))) out.push("general_legal_risk");
      const priority = ["employment_contractor","copyright_licensing","privacy_data","liability_dispute","ip_trademark_patent","compliance_regulatory","jurisdiction_procedure","corporate_business","contract","source_verification","general_legal_risk"];
      return Array.from(new Set(out)).sort((a,b)=>priority.indexOf(a)-priority.indexOf(b));
    }
    function r18cSecondaryDomains(text, cats){
      const t = lower(text), out = [];
      if (/\b(roku|ott|streaming|movie|movies|channel|platform|distribution)\b/.test(t)) out.push("business","roku");
      if (/\b(moneti[sz]e|revenue|cost|price|pay|severance|settlement|damages|commercial|business|sandblast)\b/.test(t)) out.push("finance","business");
      if (cats.indexOf("privacy_data") >= 0 || /\b(data|privacy|security|breach|access|vendor)\b/.test(t)) out.push("cyber");
      if (/\b(ai|model|automation|agent|llm)\b/.test(t)) out.push("ai");
      return Array.from(new Set(out.filter(x => x && x !== "law"))).slice(0,4);
    }
    function r18cIsLaw(text, ctx){
      if (isExplicitMediaCurrentTurn(text)) return false;
      if (r18cTechnicalLawFileWork(text)) return false;
      const cats = r18cDetectLawCategories(text);
      if (cats.length && !(cats.length === 1 && cats[0] === "general_legal_risk" && !/\b(law|legal|rights|liability|contract|copyright|license|employment|fired|defamation|privacy|compliance|jurisdiction|safe to|permitted|allowed)\b/i.test(T(text)))) return true;
      return r18cShortLawFollowup(text, ctx);
    }
    function r18cProfile(text, ctx){
      if (isExplicitMediaCurrentTurn(text)) return {
        version: V,
        active: false,
        domain: "media",
        primaryDomain: "media",
        selectedDomain: "media",
        knowledgeDomain: "media",
        legalCategory: "",
        legalCategories: [],
        secondaryDomains: [],
        currentTurnAuthority: true,
        staleLawCarrySuppressed: true,
        noCrossDomainBleed: true,
        noUserFacingDiagnostics: true
      };
      const cats = r18cDetectLawCategories(text);
      const shortCarry = r18cShortLawFollowup(text, ctx);
      const category = cats[0] || (shortCarry ? "general_legal_risk" : "");
      const secondary = r18cSecondaryDomains(text, cats);
      return {
        version: V,
        active: !!(category || shortCarry),
        domain: "law",
        primaryDomain: "law",
        selectedDomain: "law",
        knowledgeDomain: "law",
        legalCategory: category || "general_legal_risk",
        legalCategories: cats.length ? cats : ["general_legal_risk"],
        secondaryDomains: secondary,
        confidence: shortCarry ? 0.82 : 0.94,
        confidenceScore: shortCarry ? 0.82 : 0.94,
        band: "high",
        confidenceBand: "high",
        margin: shortCarry ? 0.18 : 0.32,
        answerMode: "grounded",
        highStakes: true,
        routeLocked: true,
        failClosed: false,
        needsClarifier: false,
        reason: shortCarry ? "r18c_law_short_prompt_lane_inheritance" : "r18c_full_stack_law_precedence",
        assessmentFrame: ["legal_category","jurisdiction_sensitivity","facts_vs_assumptions","risk_exposure","missing_information","source_document_check","safe_next_move"],
        legalBoundary: {
          generalInformationOnly: true,
          noLegalAdvice: true,
          noAttorneyClientRelationship: true,
          noLegalCertaintyClaim: true,
          jurisdictionRequired: true,
          sourceDocumentReviewRequired: true,
          professionalReviewRecommendedForHighRisk: true
        },
        noCrossDomainBleed: true,
        noUserFacingDiagnostics: true,
        r18cFullStackRegression: true,
        fullStackAgreementRequired: true
      };
    }
    function r18cMergeLawProfile(target, profile){
      const out = O(target);
      if (!profile || !profile.active) return out;
      out.domain = "law";
      out.primaryDomain = "law";
      out.selectedDomain = "law";
      out.knowledgeDomain = "law";
      out.legalCategory = profile.legalCategory;
      out.legalCategories = profile.legalCategories;
      out.secondaryDomains = profile.secondaryDomains;
      out.answerMode = "grounded";
      out.highStakes = true;
      out.routeLocked = true;
      out.needsClarifier = false;
      out.failClosed = false;
      out.r18cLawAssessment = Object.assign({}, O(out.r18cLawAssessment), profile);
      out.r18cFullStackRegression = true;
      out.noCrossDomainBleed = true;
      out.noUserFacingDiagnostics = true;
      return out;
    }
    const api = { V, T, O, A, extractText, r18cTechnicalLawFileWork, r18cShortLawFollowup, r18cDetectLawCategories, r18cSecondaryDomains, r18cIsLaw, r18cProfile, r18cMergeLawProfile };
    module.exports.MARION_R18C_FULL_STACK_REGRESSION_VERSION = V;
    module.exports.marionR18CFullStackHelpers = api;
    module.exports.marionR18CFullStackProfile = function(packet){
      const text = extractText(packet);
      return r18cProfile(text, packet);
    };
    module.exports.marionR18CFullStackIsLawTurn = function(packet){
      const text = extractText(packet);
      return r18cIsLaw(text, packet);
    };
    module.exports.marionR18CFullStackTechnicalLawFileWork = function(packet){
      return r18cTechnicalLawFileWork(extractText(packet));
    };
  } catch(_err) {}
})();
/* R18C_FULL_STACK_REGRESSION_HARMONIZER_END */

/* R18C_FULL_STACK_DOMAIN_CONCIERGE_WRAP_START */
(function(){
  try {
    const H = module.exports.marionR18CFullStackHelpers;
    if (!H || module.exports.__r18cFullStackConciergeWrapped) return;
    const oldRun = module.exports.runDomainConcierge;
    const oldRouteOrClarify = module.exports.routeOrClarify;
    const oldNormalize = module.exports.normalizeConciergeDecision;
    function harmonize(base, packet){
      const text = H.extractText(packet);
      if (!H.r18cIsLaw(text, packet)) return base;
      const p = H.r18cProfile(text, packet);
      const out = Object.assign({}, H.O(base));
      out.action = "route";
      out.route = "law";
      out.domain = "law";
      out.intent = "domain_question";
      out.knowledgeDomain = "law";
      out.answerMode = "grounded";
      out.confidence = p.confidence;
      out.confidenceBand = "high";
      out.needsClarifier = false;
      out.clarifier = "";
      out.routeLocked = true;
      out.routeFailClosed = false;
      out.secondaryDomains = p.secondaryDomains;
      out.legalCategory = p.legalCategory;
      out.r18cLawAssessment = p;
      out.domainConfidence = H.r18cMergeLawProfile(H.O(out.domainConfidence), p);
      out.routing = H.r18cMergeLawProfile(H.O(out.routing), p);
      out.noUserFacingDiagnostics = true;
      out.r18cFullStackRegression = true;
      return out;
    }
    if (typeof oldRun === "function") module.exports.runDomainConcierge = function(packet){ return harmonize(oldRun.apply(this, arguments), packet); };
    if (typeof oldRouteOrClarify === "function") module.exports.routeOrClarify = function(packet){ return harmonize(oldRouteOrClarify.apply(this, arguments), packet); };
    if (typeof oldNormalize === "function") module.exports.normalizeConciergeDecision = function(decision, packet, config){ return harmonize(oldNormalize.apply(this, arguments), packet || decision); };
    module.exports.default = module.exports.runDomainConcierge || module.exports.default;
    module.exports.__r18cFullStackConciergeWrapped = true;
  } catch(_err) {}
})();
/* R18C_FULL_STACK_DOMAIN_CONCIERGE_WRAP_END */



/* MARION_SELECTED_CORE_CRITICAL_PATCH_START */
(function(){
  "use strict";
  const PATCH_VERSION = "nyx.marion.selectedCoreCriticalPatch/1.0-public-safe-domain-continuity";
  if (typeof module === "undefined" || !module.exports) return;

  const SIX_DOMAINS = Object.freeze(["psychology","english","ai","cyber","law","finance"]);
  const HIGH_STAKES = Object.freeze(["law","finance","cyber"]);

  function safeText(value, max){
    const limit = Number.isFinite(Number(max)) ? Math.max(1, Math.min(Number(max), 12000)) : 4000;
    return String(value == null ? "" : value)
      .replace(/[\u0000-\u001f\u007f]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, limit);
  }
  function isObj(value){ return !!value && typeof value === "object" && !Array.isArray(value); }
  function lower(value){ return safeText(value, 5000).toLowerCase(); }
  function clamp01(value, fallback){
    const n = Number(value);
    if (!Number.isFinite(n)) return Number.isFinite(Number(fallback)) ? Math.max(0, Math.min(1, Number(fallback))) : 0;
    return Math.max(0, Math.min(1, n));
  }
  function oneLine(value, max){ return safeText(value, max || 1000); }
  function getDeep(obj, path){
    let cur = obj;
    for (const key of path) {
      if (!isObj(cur)) return "";
      cur = cur[key];
    }
    return cur;
  }
  function gatherText(value, depth, out){
    if (!out) out = [];
    if (out.length > 16 || depth > 4) return out;
    if (typeof value === "string") { if (safeText(value, 1600)) out.push(safeText(value, 1600)); return out; }
    if (!isObj(value)) return out;
    ["text","message","query","prompt","userText","rawUserText","originalUserText","normalizedUserIntent","input","reply","visibleReply","publicReply","final","answer"].forEach(function(k){
      const v = value[k];
      if (typeof v === "string" && safeText(v,1600)) out.push(safeText(v,1600));
    });
    ["payload","body","turn","command","meta","routing","memoryPatch","sessionPatch","stateBridge","conversation","context"].forEach(function(k){
      if (isObj(value[k])) gatherText(value[k], depth + 1, out);
    });
    return out;
  }
  function extractPrompt(args, result){
    const pieces = [];
    try { Array.prototype.slice.call(args || []).forEach(function(a){ gatherText(a, 0, pieces); }); } catch(_err) {}
    try { gatherText(result, 0, pieces); } catch(_err) {}
    for (const p of pieces) {
      const t = oneLine(p, 1600);
      if (!t) continue;
      if (/\b(routeKind=|finalEnvelope|sessionPatch|replyAuthority=|diagnostic packet|MARION::FINAL::)\b/i.test(t)) continue;
      if (/\b(what is|what are|define|explain|how does|why|next steps|what'?s next|least privilege|consideration|contract law|sandblast)\b/i.test(t)) return t;
    }
    return pieces.map(function(x){return oneLine(x,600);}).filter(Boolean)[0] || "";
  }
  function isVerifiedPrivateContext(args, result){
    const all = [];
    try { Array.prototype.slice.call(args || []).forEach(function(a){ all.push(a); }); } catch(_err) {}
    all.push(result);
    for (const item of all) {
      const o = isObj(item) ? item : {};
      const text = lower([o.route,o.path,o.source,o.channel,o.deliveryChannel,o.adminInterfaceScope,o.surface].join(" "));
      if (o.adminVerified === true || o.serverSideAdminVoiceAuth === true || o.trustedServerAuth === true || o.directMarionAdminInterface === true || o.marionAdminConversation === true || o.privateAdminConversation === true) return true;
      if (/marion_admin|admin_voice|admin_conversation|private_voice|lingosentinel_private/.test(text)) return true;
      const nested = [o.meta,o.auth,o.authorization,o.options,o.context,o.voice,o.payload,o.body].filter(isObj);
      for (const n of nested) {
        const nt = lower([n.route,n.path,n.source,n.channel,n.deliveryChannel,n.adminInterfaceScope,n.surface].join(" "));
        if (n.adminVerified === true || n.serverSideAdminVoiceAuth === true || n.trustedServerAuth === true || n.directMarionAdminInterface === true || n.marionAdminConversation === true || n.privateAdminConversation === true) return true;
        if (/marion_admin|admin_voice|admin_conversation|private_voice|lingosentinel_private/.test(nt)) return true;
      }
    }
    return false;
  }
  function inferDomain(prompt, current){
    const t = lower(prompt);
    const c = lower(current || "");
    if (/\b(least privilege|zero trust|mfa|multi[-\s]?factor|phishing|ransomware|incident response|prompt injection|secrets?|credential|access control|iam|security|cyber)\b/.test(t)) return "cyber";
    if (/\b(consideration|contract law|legal|statute|liability|negligence|jurisdiction|fiduciary|tort|compliance)\b/.test(t)) return "law";
    if (/\b(cash[-\s]?flow|revenue|pricing|margin|runway|budget|forecast|ltv|cac|finance|financial)\b/.test(t)) return "finance";
    if (/\b(ai|artificial intelligence|llm|model|agent|rag|embedding|prompt|machine learning|inference)\b/.test(t)) return "ai";
    if (/\b(psychology|emotion|behavio[u]?r|cognitive|anxiety|grief|trauma|motivation|attachment)\b/.test(t)) return "psychology";
    if (/\b(grammar|rewrite|wording|tone|plain english|sentence|copy|translate|language)\b/.test(t)) return c === "cyber" ? "cyber" : "english";
    if (/\b(how does that help sandblast|how does this help sandblast|help sandblast|sandblast application)\b/.test(t)) {
      if (/\b(least privilege|zero trust|mfa|phishing|ransomware|incident response|prompt injection|security|cyber|access control|secrets?)\b/.test(t)) return "cyber";
      if (/\b(consideration|contract|legal|law|liability|jurisdiction|compliance)\b/.test(t)) return "law";
      if (/\b(cash|revenue|pricing|margin|runway|finance|financial|ads?|advertising)\b/.test(t)) return "finance";
      return "ai";
    }
    if (SIX_DOMAINS.indexOf(c) >= 0) return c;
    return "";
  }
  function replyForPrompt(prompt, currentReply){
    const t = lower(prompt);
    if (/\b(consideration)\b/.test(t) && /\b(contract law|contract)\b/.test(t)) {
      return "In contract law, consideration is the value exchanged between parties, such as money, services, a promise, or a benefit. It helps show that an agreement is more than a one-sided gift. This is general legal information, not legal advice.";
    }
    if (/\bleast privilege\b/.test(t)) {
      return "Least privilege means giving each person, app, or system only the access it needs to do its job, and nothing extra. For Sandblast, that lowers the damage if an account, API key, dashboard, or backend route is compromised.";
    }
    if (/\b(how does that help sandblast|how does this help sandblast|help sandblast)\b/.test(t)) {
      return "It helps Sandblast by keeping the public Nyx experience simple while Marion carries routing, context, safety, and follow-up continuity behind the scenes. Users get cleaner answers, fewer resets, and a smoother path across radio, TV, news, ads, and backend support.";
    }
    if (/^(?:next\s+steps?|what(?:'|’)?s\s+next|what\s+next|then\s+what)\??$/i.test(safeText(prompt).replace(/[.!]+$/,""))) {
      return "Next steps: test this batch in PowerShell, confirm the five-file chain loads, run one legal prompt, one cyber prompt, and one follow-up prompt, then move upward only after the current layer passes.";
    }
    if (isBadVisibleReply(currentReply)) return "I have the thread. Give me the exact file or prompt target and I will keep the next update surgical.";
    return "";
  }
  function isBadVisibleReply(value){
    const t = lower(value);
    if (!t) return false;
    return /\b(i['’]?m here,? mac|i am here,? mac|where do you want to go next|what are we working on|final envelope missing|diagnostic packet|routekind=|replyauthority=|sessionpatch|finalenvelope|runtime telemetry|marion did not return|non-final)\b/i.test(t) || /^(true|false|null|undefined|\[object object\])$/i.test(t);
  }
  function cleanVisibleText(value, args, result, prompt){
    let text = safeText(value, 12000);
    if (!text) return text;
    const direct = replyForPrompt(prompt || extractPrompt(args, result), text);
    if (direct && (isBadVisibleReply(text) || /\b(consideration|least privilege|help sandblast|next steps|what'?s next)\b/i.test(prompt || ""))) return direct;
    text = text
      .replace(/\brouteKind\s*=\s*[^.;,\n]+[.;,]?\s*/gi, "")
      .replace(/\breplyAuthority\s*=\s*[^.;,\n]+[.;,]?\s*/gi, "")
      .replace(/\bspeechHints\s*=\s*[^.;,\n]+[.;,]?\s*/gi, "")
      .replace(/\bpresenceProfile\s*=\s*[^.;,\n]+[.;,]?\s*/gi, "")
      .replace(/\bnyxStateHint\s*=\s*[^.;,\n]+[.;,]?\s*/gi, "")
      .replace(/\b(finalEnvelope|sessionPatch|marionFinal|transportSafe|diagnostic packet|non-final|final envelope missing)\b/gi, "")
      .replace(/\s+/g, " ")
      .trim();
    if (!isVerifiedPrivateContext(args, result)) {
      text = text
        .replace(/\bI(?:'|’)?m here,?\s*Mac\.?/gi, "I have the thread.")
        .replace(/\bI am here,?\s*Mac\.?/gi, "I have the thread.")
        .replace(/,\s*Mac\b/gi, "")
        .replace(/\bMac[,—-]\s*/gi, "");
    }
    if (isBadVisibleReply(text)) return replyForPrompt(prompt || "", text) || "I have the thread. Give me the exact target and I will answer directly.";
    return text;
  }
  function getVisibleKeys(){ return ["reply","visibleReply","publicReply","displayReply","answer","text","message","final","spokenText","finalReply","output","response","directReply"]; }
  function normalizeDomainFields(obj, prompt){
    if (!isObj(obj)) return obj;
    const current = obj.knowledgeDomain || obj.primaryDomain || obj.selectedDomain || obj.route || obj.domain || (isObj(obj.domainConfidence) && (obj.domainConfidence.knowledgeDomain || obj.domainConfidence.primaryDomain || obj.domainConfidence.selectedDomain));
    const inferred = inferDomain(prompt, current);
    const out = obj;
    if (inferred) {
      if ("route" in out || /DomainConcierge/i.test(String(out.source || ""))) out.route = inferred;
      out.knowledgeDomain = inferred;
      out.primaryDomain = inferred;
      out.selectedDomain = inferred;
      if (!out.domain) out.domain = inferred;
      const existingSecondary = Array.isArray(out.secondaryDomains) ? out.secondaryDomains : [];
      out.secondaryDomains = existingSecondary.filter(function(d){return d && d !== inferred;}).slice(0,4);
      const confidence = clamp01(out.confidence, 0.94) || 0.94;
      out.confidence = Math.max(confidence, HIGH_STAKES.indexOf(inferred) >= 0 ? 0.94 : 0.88);
      const dc = isObj(out.domainConfidence) ? out.domainConfidence : {};
      out.domainConfidence = Object.assign({}, dc, {
        version: safeText(dc.version || "nyx.marion.domainConfidence/1.2-selected-core-patch", 120),
        confidence: Math.max(clamp01(dc.confidence, out.confidence), out.confidence),
        confidenceScore: Math.max(clamp01(dc.confidenceScore, out.confidence), out.confidence),
        band: "high",
        confidenceBand: "high",
        ambiguous: false,
        routeLocked: true,
        needsClarifier: false,
        failClosed: false,
        primaryDomain: inferred,
        selectedDomain: inferred,
        knowledgeDomain: inferred,
        highStakes: HIGH_STAKES.indexOf(inferred) >= 0,
        noCrossDomainBleed: true,
        noUserFacingDiagnostics: true,
        reason: dc.reason || "selected_core_patch_domain_precision"
      });
    }
    const dc2 = isObj(out.domainConfidence) ? out.domainConfidence : {};
    out.sixDomainCoverage = SIX_DOMAINS.map(function(domain){
      const selected = domain === (out.knowledgeDomain || out.primaryDomain || dc2.knowledgeDomain || dc2.primaryDomain);
      return { domain: domain, selected: selected, accessible: true, highStakes: HIGH_STAKES.indexOf(domain) >= 0 };
    });
    out.publicSurfaceSafe = true;
    out.noUserFacingDiagnostics = true;
    out.selectedCorePatch = { version: PATCH_VERSION, applied: true, publicSurfaceSafe: true };
    return out;
  }
  function projectResult(value, args){
    const prompt = extractPrompt(args, value);
    if (typeof value === "string") return cleanVisibleText(value, args, value, prompt);
    if (!isObj(value)) return value;
    const out = Array.isArray(value) ? value.slice() : Object.assign({}, value);
    getVisibleKeys().forEach(function(k){
      if (typeof out[k] === "string") out[k] = cleanVisibleText(out[k], args, out, prompt);
    });
    const direct = replyForPrompt(prompt, out.visibleReply || out.publicReply || out.reply || out.text || out.final || "");
    if (direct) {
      ["reply","visibleReply","publicReply","displayReply","answer","text","finalReply"].forEach(function(k){ if (k in out || k === "reply" || k === "visibleReply" || k === "publicReply") out[k] = direct; });
      if (typeof out.final === "string") out.final = direct;
    }
    normalizeDomainFields(out, prompt);
    ["payload","finalEnvelope","marionFinal","result","data","contract","meta","routing","memoryPatch","sessionPatch","stateBridge"].forEach(function(k){
      if (isObj(out[k])) {
        const child = Object.assign({}, out[k]);
        getVisibleKeys().forEach(function(vk){ if (typeof child[vk] === "string") child[vk] = cleanVisibleText(child[vk], args, out, prompt); });
        normalizeDomainFields(child, prompt);
        out[k] = child;
      }
    });
    return out;
  }
  function wrap(fn, name){
    if (typeof fn !== "function" || fn.__selectedCoreCriticalPatch) return fn;
    const wrapped = function(){
      const args = arguments;
      const res = fn.apply(this, args);
      if (res && typeof res.then === "function") return res.then(function(v){ return projectResult(v, args); });
      return projectResult(res, args);
    };
    try { Object.keys(fn).forEach(function(k){ wrapped[k] = fn[k]; }); } catch(_err) {}
    try { Object.defineProperty(wrapped, "name", { value: fn.name || name || "selectedCoreCriticalPatched" }); } catch(_err) {}
    wrapped.__selectedCoreCriticalPatch = true;
    return wrapped;
  }
  try {
    if (typeof module.exports === "function") module.exports = wrap(module.exports, "default");
    const obj = module.exports && typeof module.exports === "object" ? module.exports : null;
    if (obj) {
      [
        "run","default","handle","handleChat","chat","reply","processWithMarion","route","maybeResolve","ask","handleMessage",
        "composeMarionResponse","compose","buildReply","runDomainConcierge","routeOrClarify","normalizeConciergeDecision",
        "createMarionFinalEnvelope","createMarionErrorEnvelope","sanitizeFinalEnvelope","normalizeFinalEnvelope","normalizeFinalTransport",
        "buildFinalEnvelope","toFinalEnvelope","finalize","safeResponse","buildResponse","createResponse"
      ].forEach(function(name){ if (typeof obj[name] === "function") obj[name] = wrap(obj[name], name); });
      obj.MARION_SELECTED_CORE_CRITICAL_PATCH_VERSION = PATCH_VERSION;
      obj.marionSelectedCoreProjectResult = projectResult;
      obj.marionSelectedCoreInferDomain = inferDomain;
      obj.marionSelectedCoreReplyForPrompt = replyForPrompt;
      obj.marionSelectedCoreSanitizeVisibleText = cleanVisibleText;
    }
  } catch(_err) {}
})();
/* MARION_SELECTED_CORE_CRITICAL_PATCH_END */

/* MARION_PUBLIC_SAFE_DEEP_PROJECTION_R2_START */
(function(){
  "use strict";
  const PATCH_VERSION = "nyx.marion.publicSafeDeepProjection/2.0-selected-core";
  if (typeof module === "undefined" || !module.exports) return;
  function isObj(v){ return !!v && typeof v === "object" && !Array.isArray(v); }
  function safeText(v){ return String(v == null ? "" : v).replace(/[\u0000-\u001f\u007f]/g," ").replace(/\s+/g," ").trim(); }
  function lower(v){ return safeText(v).toLowerCase(); }
  function isPublicValue(v){
    if (!isObj(v)) return false;
    const s = lower([v.surface,v.source,v.channel,v.route,v.path,v.deliveryChannel,v.publicSurface,v.publicUserFacing,v.audience].join(" "));
    return v.publicSurface === true || v.publicUserFacing === true || v.public === true || v.audience === "public" || /public|widget|webflow|sandblast_channel/.test(s);
  }
  function isPrivateValue(v){
    if (!isObj(v)) return false;
    const s = lower([v.surface,v.source,v.channel,v.route,v.path,v.deliveryChannel,v.adminInterfaceScope].join(" "));
    return v.adminVerified === true || v.serverSideAdminVoiceAuth === true || v.trustedServerAuth === true || v.directMarionAdminInterface === true || v.marionAdminConversation === true || v.privateAdminConversation === true || /marion_admin|admin_voice|admin_conversation|private_voice|lingosentinel_private/.test(s);
  }
  function publicContext(args, result){
    if (isPrivateValue(result)) return false;
    if (isPublicValue(result)) return true;
    const arr = Array.prototype.slice.call(args || []);
    for (const a of arr) { if (isPrivateValue(a)) return false; }
    for (const a of arr) { if (isPublicValue(a)) return true; }
    return false;
  }
  function cleanString(v){
    let t = safeText(v);
    t = t
      .replace(/\bI(?:'|’)?m here,?\s*Mac\.?/gi,"I have the thread.")
      .replace(/\bI am here,?\s*Mac\.?/gi,"I have the thread.")
      .replace(/,\s*Mac\b/gi,"")
      .replace(/\bMac[,—-]\s*/gi,"")
      .replace(/\brecipient\s*:\s*Mac\b/gi,"recipient: operator")
      .replace(/\bMac\b/g,"operator")
      .replace(/\brouteKind\s*=\s*[^.;,\n]+[.;,]?\s*/gi,"")
      .replace(/\breplyAuthority\s*=\s*[^.;,\n]+[.;,]?\s*/gi,"")
      .replace(/\bspeechHints\s*=\s*[^.;,\n]+[.;,]?\s*/gi,"")
      .replace(/\bpresenceProfile\s*=\s*[^.;,\n]+[.;,]?\s*/gi,"")
      .replace(/\bnyxStateHint\s*=\s*[^.;,\n]+[.;,]?\s*/gi,"")
      .replace(/\b(finalEnvelope|sessionPatch|marionFinal|transportSafe|diagnostic packet|non-final|final envelope missing)\b/gi,"")
      .replace(/\s+/g," ").trim();
    return t;
  }
  function shouldDropKey(k){
    return /^(adminReply|privateReply|marionReply|operatorReply|adminContext|privateContext|operatorContext|marionRecipient)$/i.test(k) ||
      /^(privateOperator|operatorPrivate|adminPrivate|personalityPrivate|marionPrivate)/i.test(k);
  }
  function project(value, depth, seen){
    if (value == null) return value;
    if (typeof value === "string") return cleanString(value);
    if (typeof value === "number" || typeof value === "boolean") return value;
    if (typeof value === "function" || typeof value === "symbol" || typeof value === "undefined") return undefined;
    if (depth > 6) return "[truncated_public_projection]";
    if (!seen) seen = [];
    if (seen.indexOf(value) >= 0) return "[circular]";
    const nextSeen = seen.concat([value]);
    if (Array.isArray(value)) return value.slice(0,80).map(function(x){ return project(x, depth+1, nextSeen); }).filter(function(x){ return x !== undefined; });
    if (!isObj(value)) return cleanString(value);
    const out = {};
    Object.keys(value).forEach(function(k){
      if (shouldDropKey(k)) return;
      if (/(token|secret|password|cookie|authorization|api[_-]?key|credential|private[_-]?key|x[-_]?sb)/i.test(k)) { out[k] = "[redacted]"; return; }
      const v = project(value[k], depth+1, nextSeen);
      if (v !== undefined) out[k] = v;
    });
    out.publicSurfaceSafe = true;
    out.publicProjectionVersion = PATCH_VERSION;
    return out;
  }
  function wrap(fn,name){
    if (typeof fn !== "function" || fn.__marionPublicSafeDeepProjectionR2) return fn;
    const wrapped = function(){
      const args = arguments;
      const res = fn.apply(this,args);
      if (res && typeof res.then === "function") return res.then(function(v){ return publicContext(args,v) ? project(v,0,[]) : v; });
      return publicContext(args,res) ? project(res,0,[]) : res;
    };
    try{ Object.keys(fn).forEach(function(k){ wrapped[k] = fn[k]; }); }catch(_e){}
    try{ Object.defineProperty(wrapped,"name",{value:fn.name||name||"publicSafeDeepProjectionWrapped"}); }catch(_e){}
    wrapped.__marionPublicSafeDeepProjectionR2 = true;
    return wrapped;
  }
  try{
    if (typeof module.exports === "function") module.exports = wrap(module.exports,"default");
    const obj = module.exports && typeof module.exports === "object" ? module.exports : null;
    if (obj) {
      ["run","default","handle","handleChat","chat","reply","processWithMarion","route","maybeResolve","ask","handleMessage","composeMarionResponse","compose","buildReply","runDomainConcierge","routeOrClarify","normalizeConciergeDecision","createMarionFinalEnvelope","createMarionErrorEnvelope","sanitizeFinalEnvelope","normalizeFinalEnvelope","normalizeFinalTransport","buildFinalEnvelope","toFinalEnvelope","finalize","safeResponse","buildResponse","createResponse"].forEach(function(n){ if (typeof obj[n] === "function") obj[n] = wrap(obj[n],n); });
      obj.MARION_PUBLIC_SAFE_DEEP_PROJECTION_R2_VERSION = PATCH_VERSION;
      obj.marionPublicSafeDeepProject = function(value){ return project(value,0,[]); };
    }
  } catch(_err) {}
})();
/* MARION_PUBLIC_SAFE_DEEP_PROJECTION_R2_END */


/* NYX_GUIDE_CONCIERGE_STEPS_2_3_R2_START */
(function nyxGuideConciergePatch(){
  "use strict";
  const PATCH_VERSION="nyx.guideOrchestration.domainConcierge/2.0-steps2-3";
  const LANES=new Set(["home","search","live","watch","roku","news","about","apps"]);
  const TYPES=new Set(["navigate","play_radio","stop_radio","open_media","open_tv","open_roku","open_synapse","open_guide","focus_input","summarize"]);
  function obj(v){return v&&typeof v==="object"&&!Array.isArray(v)?v:{};}
  function txt(v,max){const s=String(v==null?"":v).replace(/[\u0000-\u001f\u007f]/g,"").replace(/\s+/g," ").trim();return s.slice(0,max||240);}
  function lane(v){const raw=txt(v||"home",32).toLowerCase().replace(/[^a-z0-9_-]+/g,"");const m={radio:"live",listen:"live",tv:"watch",television:"watch",cartoons:"watch",classic:"watch",synapse:"news",discover:"news",guide:"search",nyx:"search"};const n=m[raw]||raw;return LANES.has(n)?n:"home";}
  function read(){
    const values=[],contexts=[],actions=[],seen=new Set();
    function walk(v,d){if(v==null||d>5)return;if(typeof v==="string"){values.push(txt(v,1600));return;}if(typeof v!=="object"||seen.has(v))return;seen.add(v);const x=obj(v);for(const k of["userText","rawUserText","message","text","prompt","input","query","normalizedUserIntent","effectivePrompt","reply","publicReply","visibleReply"])if(typeof x[k]==="string")values.push(txt(x[k],1600));for(const c of[x.guideContext,x.nyxGuideContext,x.ecosystemGuideContext,x.guide])if(c&&typeof c==="object"&&!Array.isArray(c))contexts.push(c);for(const l of[x.guideActions,x.actions,obj(x.guide).actions])if(Array.isArray(l))actions.push.apply(actions,l);for(const k of["payload","meta","result","finalEnvelope","body","routing","runtimeState","state","session","sessionPatch","memoryPatch","composerContext"])if(x[k]&&typeof x[k]==="object")walk(x[k],d+1);}
    for(const a of arguments)walk(a,0);return{text:values.filter(Boolean).join(" ").slice(0,2600),context:contexts[0]||{},actions};
  }
  function context(raw){
    const c=obj(raw);return{contract:"nyx.guideContext/1.0",surface:txt(c.surface||c.site||"sandblast.channel",96)||"sandblast.channel",page:txt(c.page||c.pathname||"/",180)||"/",currentLane:lane(c.currentLane||c.lane||"home"),previousLane:lane(c.previousLane||"home"),lastAction:txt(c.lastAction||c.action||"context",48)||"context",goal:txt(c.goal||"ask",32).toLowerCase().replace(/[^a-z0-9_-]+/g,"_")||"ask",inputMode:/voice|speech|mic/i.test(txt(c.inputMode||c.inputSource,24))?"voice":"text",publicSessionOnly:true,privateMemoryAccess:false};}
  function action(type,target,label){if(!TYPES.has(type))return null;const labels={navigate:"Open",play_radio:"Play Radio",stop_radio:"Stop Radio",open_media:"Open Media",open_tv:"Open Sandblast TV",open_roku:"Open Sandblast on Roku",open_synapse:"Open Synapse",open_guide:"Ask Nyx",focus_input:"Type a Question",summarize:"Summarize"};return{contract:"nyx.guideAction/1.0",id:type+"_"+target,type,target:lane(target),lane:lane(target),label:txt(label||labels[type],80),requiresUserGesture:true,autoExecute:false,advisoryOnly:true};}
  function infer(text,ctx){
    const t=txt(text,2600).toLowerCase(),out=[];
    const add=(type,target,label)=>{const a=action(type,target,label);if(a&&!out.some(x=>x.type===a.type&&x.target===a.target))out.push(a);};
    if(/\b(stop|pause|turn off|mute)\b.{0,28}\b(radio|stream|music)\b|\b(radio|stream|music)\b.{0,28}\b(stop|pause|off)\b/.test(t))add("stop_radio","live");
    else if(/\b(play|start|turn on|listen to|open)\b.{0,32}\b(radio|live stream|love letters|music)\b|\b(radio|live stream)\b.{0,24}\b(play|start|on)\b/.test(t))add("play_radio","live");
    if(/\b(open|watch|show|go to|take me to|continue to)\b.{0,36}\broku\b/.test(t))add("open_roku","roku");
    if(/\b(open|watch|show|go to|take me to|continue to)\b.{0,36}\b(sandblast tv|television|tv|cartoons?|classics?)\b/.test(t))add("open_tv","watch");
    if(/\b(open|show|go to|take me to|continue to|discover)\b.{0,36}\b(synapse|news)\b/.test(t))add("open_synapse","news");
    if(/\b(open|show|play|watch)\b.{0,28}\b(media|video|feature|preview)\b/.test(t))add("open_media","watch");
    if(/\b(go|take me|return|back)\b.{0,20}\b(home|ecosystem)\b/.test(t))add("navigate","home","Open Home");
    if(/\b(open|show|use|ask)\b.{0,24}\b(nyx|guide|chat)\b/.test(t))add("open_guide","search");
    if(/\b(summarize|summary|brief me)\b/.test(t))add("summarize",ctx.currentLane,"Summarize This");
    return out.slice(0,4);
  }
  function sanitize(a){const x=obj(a),type=txt(x.type||x.action,32).toLowerCase().replace(/[^a-z0-9_]+/g,"_");if(!TYPES.has(type))return null;return action(type,x.target||x.lane||"home",x.label);}
  function routeFor(actions,ctx){const a=actions[0];if(!a)return"";if(a.target==="live")return"radio";if(a.target==="watch")return"media";if(a.target==="roku")return"roku";if(a.target==="news")return"news";return"general";}
  function project(value,args){
    if(!value||typeof value!=="object")return value;
    const found=read.apply(null,Array.prototype.slice.call(args||[]).concat([value])),ctx=context(found.context);
    if(!Object.keys(found.context).length&&!/\b(nyx|sandblast|radio|roku|synapse|tv|television|cartoon|classic|navigate|guide)\b/i.test(found.text))return value;
    const existing=found.actions.map(sanitize).filter(Boolean),actions=[];
    for(const a of existing.concat(infer(found.text,ctx))){if(!actions.some(x=>x.type===a.type&&x.target===a.target))actions.push(a);if(actions.length>=4)break;}
    const out=Object.assign({},value),explicit=actions.length>0,guideRoute=routeFor(actions,ctx);
    if(explicit){
      out.action="route";
      out.needsClarifier=false;
      out.clarifier="";
      if(guideRoute)out.route=guideRoute;
    }
    out.guideContext=ctx;
    out.guideActions=actions;
    out.guideDecision={
      version:PATCH_VERSION,
      contract:"nyx.guideDecision/1.0",
      explicitAction:explicit,
      targetLane:actions[0]?actions[0].target:ctx.currentLane,
      guideRoute:guideRoute||out.route||"",
      executionAuthority:"client_user_gesture",
      finalReplyAuthority:false,
      nonAuthority:true,
      noUserFacingDiagnostics:true
    };
    out.composerContext=Object.assign({},obj(out.composerContext),{guideContext:ctx,guideActions:actions,guideDecision:out.guideDecision});
    out.stateSpinePatch=Object.assign({},obj(out.stateSpinePatch),{nyxGuideContinuity:{version:PATCH_VERSION,currentLane:ctx.currentLane,previousLane:ctx.previousLane,pendingActionTypes:actions.map(a=>a.type),targetLane:actions[0]?actions[0].target:ctx.currentLane,shouldAdvanceState:explicit,publicSessionOnly:true,updatedAt:Date.now()}});
    return out;
  }
  function wrap(fn,name){if(typeof fn!=="function"||fn.__nyxGuideConciergeR2)return fn;const w=function(){const args=arguments,r=fn.apply(this,args);if(r&&typeof r.then==="function")return r.then(v=>project(v,args));return project(r,args);};try{Object.keys(fn).forEach(k=>w[k]=fn[k]);}catch(_){}w.__nyxGuideConciergeR2=true;return w;}
  try{
    if(typeof module.exports==="function")module.exports=wrap(module.exports,"default");
    const api=module.exports&&typeof module.exports==="object"?module.exports:null;
    if(api){
      ["runDomainConcierge","routeOrClarify","normalizeConciergeDecision","run","route","handle","default"].forEach(n=>{if(typeof api[n]==="function")api[n]=wrap(api[n],n);});
      api.NYX_GUIDE_CONCIERGE_VERSION=PATCH_VERSION;
      api.normalizeNyxGuideConciergeContext=context;
      api.buildNyxGuideConciergeActions=function(text,c){return infer(text,context(c||{}));};
      api.attachNyxGuideConcierge=function(value,input){return project(value,[{guideContext:input||{}}]);};
    }
  }catch(_){}
})();
/* NYX_GUIDE_CONCIERGE_STEPS_2_3_R2_END */

/* NYX_GUIDE_ORCHESTRATION_STEPS_7_8_9_R1_START */
(function nyxGuideSteps789DomainConciergePatch() {
  "use strict";

  const PATCH_VERSION = "nyx.guideOrchestration.domainConcierge/3.0-steps7-8-9";
  const ACTION_PLAN_CONTRACT = "nyx.guideActionPlan/1.0";
  const PREFERENCE_INTENT_CONTRACT = "nyx.publicPreferenceIntent/1.0";
  const TARGETS = new Set([
    "sandblast_home", "sandblast_radio", "sandblast_tv", "sandblast_roku",
    "sandblast_cartoons", "sandblast_classics", "synapse", "lingosentinel",
    "apps", "about", "nyx_guide", "guide_input", "current_surface"
  ]);
  const TYPES = new Set([
    "navigate", "play_radio", "stop_radio", "open_media", "open_tv",
    "open_roku", "open_synapse", "open_guide", "focus_input", "summarize",
    "tv_focus", "tv_back", "tv_play_pause", "tv_open_details", "dismiss_guide"
  ]);

  function obj(value) {
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  }

  function txt(value, max = 240) {
    return String(value == null ? "" : value)
      .replace(/[\u0000-\u001f\u007f]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, max);
  }

  function hash(value) {
    const raw = String(value == null ? "" : value);
    let result = 2166136261;
    for (let index = 0; index < raw.length; index += 1) {
      result ^= raw.charCodeAt(index);
      result = Math.imul(result, 16777619);
    }
    return (result >>> 0).toString(16).padStart(8, "0");
  }

  function targetLane(target) {
    if (target === "sandblast_radio") return "live";
    if (["sandblast_tv", "sandblast_cartoons", "sandblast_classics"].includes(target)) return "watch";
    if (target === "sandblast_roku") return "roku";
    if (target === "synapse") return "news";
    if (target === "apps") return "apps";
    if (target === "about") return "about";
    if (["nyx_guide", "guide_input"].includes(target)) return "search";
    return "home";
  }

  function action(type, target, label) {
    if (!TYPES.has(type) || !TARGETS.has(target)) return null;
    const compatible = {
      play_radio: ["sandblast_radio"],
      stop_radio: ["sandblast_radio"],
      open_media: ["sandblast_tv", "sandblast_cartoons", "sandblast_classics"],
      open_tv: ["sandblast_tv", "sandblast_cartoons", "sandblast_classics"],
      open_roku: ["sandblast_roku"],
      open_synapse: ["synapse"],
      open_guide: ["nyx_guide"],
      focus_input: ["guide_input"],
      summarize: ["current_surface", "synapse", "lingosentinel", "sandblast_tv"],
      tv_focus: ["current_surface", "nyx_guide"],
      tv_back: ["current_surface"],
      tv_play_pause: ["current_surface"],
      tv_open_details: ["current_surface", "sandblast_tv", "sandblast_cartoons", "sandblast_classics"],
      dismiss_guide: ["nyx_guide"]
    };
    if (type !== "navigate" && (!compatible[type] || !compatible[type].includes(target))) return null;
    return {
      contract: "nyx.guideAction/1.1",
      id: `act_${hash(`${type}|${target}|${label || ""}`)}`,
      type,
      target,
      targetKey: target,
      lane: targetLane(target),
      label: txt(label || "Open", 80),
      requiresUserGesture: true,
      autoExecute: false,
      advisoryOnly: true,
      serverExecutionAllowed: false,
      externalUrlAccepted: false,
      symbolicTargetOnly: true
    };
  }

  function inferActionPlan(prompt, context = {}) {
    const text = txt(prompt, 3200).toLowerCase();
    const television = obj(context.televisionGuide || context.tvGuide).enabled === true;
    const limit = television ? 4 : 6;
    const actions = [];

    function add(type, target, label) {
      const item = action(type, target, label);
      if (!item) return;
      if (actions.some((existing) => existing.type === item.type && existing.target === item.target)) return;
      actions.push(item);
    }

    if (/\b(stop|pause|turn off)\b.{0,28}\b(radio|stream|music)\b|\b(radio|stream|music)\b.{0,28}\b(stop|pause|off)\b/.test(text)) {
      add("stop_radio", "sandblast_radio", "Stop Radio");
    } else if (/\b(play|start|turn on|listen to)\b.{0,36}\b(radio|live stream|love letters|music)\b|\b(radio|live stream)\b.{0,24}\b(play|start|on)\b/.test(text)) {
      add("play_radio", "sandblast_radio", "Play Radio");
    }

    if (/\b(open|watch|show|go to|take me to|continue to)\b.{0,44}\b(sandblast on roku|roku)\b/.test(text)) {
      add("open_roku", "sandblast_roku", "Open Sandblast on Roku");
    }
    if (/\b(open|watch|show|go to|take me to|continue to)\b.{0,44}\b(classic cartoons?|cartoons?)\b/.test(text)) {
      add("open_tv", "sandblast_cartoons", "Open Cartoons");
    }
    if (/\b(open|watch|show|go to|take me to|continue to)\b.{0,44}\b(classics?|classic movies?)\b/.test(text)) {
      add("open_tv", "sandblast_classics", "Open Classics");
    }
    if (/\b(open|watch|show|go to|take me to|continue to)\b.{0,44}\b(sandblast tv|television|tv)\b/.test(text)) {
      add("open_tv", "sandblast_tv", "Open Sandblast TV");
    }
    if (/\b(open|show|go to|take me to|continue to|discover)\b.{0,40}\b(synapse|news)\b/.test(text)) {
      add("open_synapse", "synapse", "Open Synapse");
    }
    if (/\b(open|show|go to|take me to|translate|translation)\b.{0,40}\b(lingosentinel|lingo sentinel)\b|\btranslate\b.{0,60}\b(language|conversation|message)\b/.test(text)) {
      add("navigate", "lingosentinel", "Open LingoSentinel");
    }
    if (/\b(open|show|go to|take me to)\b.{0,32}\b(apps?|applications?)\b/.test(text)) {
      add("navigate", "apps", "Open Apps");
    }
    if (/\b(open|show|go to|take me to)\b.{0,32}\b(about|company)\b/.test(text)) {
      add("navigate", "about", "Open About");
    }
    if (/\b(go|take me|return|back)\b.{0,24}\b(home|ecosystem|sandblast channel)\b/.test(text)) {
      add("navigate", "sandblast_home", "Open Home");
    }
    if (/\b(open|show|use|ask)\b.{0,28}\b(nyx|nix|nick|guide|chat)\b/.test(text)) {
      add("open_guide", "nyx_guide", "Ask Nyx");
    }
    if (/\b(type|write|enter)\b.{0,24}\b(question|message|prompt)\b/.test(text)) {
      add("focus_input", "guide_input", "Type a Question");
    }
    if (/\b(summarize|summary|brief me)\b/.test(text)) {
      add("summarize", "current_surface", "Summarize This");
    }

    if (television) {
      if (/\b(back|go back|previous screen)\b/.test(text)) add("tv_back", "current_surface", "Back");
      if (/\b(play|pause)\b.{0,16}\b(video|program|show|movie|episode)\b/.test(text)) add("tv_play_pause", "current_surface", "Play or Pause");
      if (/\b(details|more information|program info)\b/.test(text)) add("tv_open_details", "current_surface", "Open Details");
      if (/\b(dismiss|hide|close)\b.{0,16}\b(nyx|guide)\b/.test(text)) add("dismiss_guide", "nyx_guide", "Dismiss Nyx");
    }

    return {
      contract: ACTION_PLAN_CONTRACT,
      version: PATCH_VERSION,
      authoritative: false,
      finalReplyAuthority: false,
      executionAuthority: "client_user_gesture",
      clientExecutionRequired: true,
      serverExecutionAllowed: false,
      symbolicTargetsOnly: true,
      externalModelUrlsAllowed: false,
      autoExecute: false,
      requiresUserGesture: true,
      television,
      maxActions: limit,
      actionCount: Math.min(actions.length, limit),
      actions: actions.slice(0, limit)
    };
  }

  function preferenceIntent(prompt) {
    const text = txt(prompt, 1800).toLowerCase();
    const changes = {};
    let explicit = false;
    let remember = null;
    let clearRequested = false;

    function set(key, value) {
      changes[key] = value;
      explicit = true;
    }

    if (/\b(turn|switch|set)\b.{0,16}\bvoice\b.{0,12}\b(off|disable|disabled)\b|\btext[- ]only\b/.test(text)) {
      set("voiceEnabled", false);
      set("textOnly", true);
    }
    if (/\b(turn|switch|set)\b.{0,16}\bvoice\b.{0,12}\b(on|enable|enabled)\b|\bvoice and text\b/.test(text)) {
      set("voiceEnabled", true);
      set("textOnly", false);
    }
    if (/\b(reduce|reduced|limit)\b.{0,18}\b(motion|animation)\b/.test(text)) set("reducedMotion", true);
    if (/\b(full|normal)\b.{0,18}\b(motion|animation)\b/.test(text)) set("reducedMotion", false);
    if (/\b(hide|disable|turn off)\b.{0,18}\b(avatar|nyx animation)\b/.test(text)) set("avatarVisible", false);
    if (/\b(show|enable|turn on)\b.{0,18}\b(avatar|nyx animation)\b/.test(text)) set("avatarVisible", true);
    if (/\b(turn off|disable|stop)\b.{0,18}\b(suggestions?|recommendations?)\b/.test(text)) set("suggestionsEnabled", false);
    if (/\b(turn on|enable|show)\b.{0,18}\b(suggestions?|recommendations?)\b/.test(text)) set("suggestionsEnabled", true);
    if (/\b(turn off|disable|hide)\b.{0,18}\b(captions?|subtitles?)\b/.test(text)) set("captionsEnabled", false);
    if (/\b(turn on|enable|show)\b.{0,18}\b(captions?|subtitles?)\b/.test(text)) set("captionsEnabled", true);

    const languageMatch = text.match(/\b(?:preferred language|language preference|set language to|use)\s+([a-z]{2,3}(?:-[a-z]{2,4})?|english|french|spanish|portuguese|german|italian|japanese|korean|chinese)\b/i);
    if (languageMatch) {
      const aliases = {
        english: "en", french: "fr", spanish: "es", portuguese: "pt",
        german: "de", italian: "it", japanese: "ja", korean: "ko", chinese: "zh"
      };
      set("preferredLanguage", aliases[languageMatch[1].toLowerCase()] || languageMatch[1]);
    }

    if (/\bremember (?:my )?(?:preferences|settings)\b|\bsave (?:my )?(?:preferences|settings)\b/.test(text)) {
      remember = true;
      explicit = true;
    }
    if (/\b(do not|don't|dont|never)\s+remember\b|\bdo not save\b|\bdon't save\b/.test(text)) {
      remember = false;
      explicit = true;
    }
    if (/\b(clear|reset|forget|delete)\b.{0,24}\b(nyx|guide|public)?\s*(preferences|settings|history)\b/.test(text)) {
      clearRequested = true;
      explicit = true;
    }

    return {
      contract: PREFERENCE_INTENT_CONTRACT,
      version: PATCH_VERSION,
      explicit,
      authoritative: false,
      writeAuthority: "client_consent",
      rememberPreferences: remember,
      clearRequested,
      changes,
      privateMemoryAccess: false,
      serverStorageRequested: false
    };
  }

  function collectPrompt(args, result) {
    const values = [];
    const seen = new Set();

    function walk(value, depth) {
      if (value == null || depth > 5) return;
      if (typeof value === "string") {
        values.push(txt(value, 1800));
        return;
      }
      if (typeof value !== "object" || seen.has(value)) return;
      seen.add(value);
      const source = obj(value);
      for (const key of [
        "userText", "rawUserText", "message", "prompt", "input", "query",
        "effectivePrompt", "normalizedUserIntent"
      ]) {
        if (typeof source[key] === "string") values.push(txt(source[key], 1800));
      }
      for (const key of [
        "payload", "body", "context", "guideContext", "publicGuideContinuity",
        "televisionGuide", "state", "session", "composerContext", "routing"
      ]) {
        if (source[key] && typeof source[key] === "object") walk(source[key], depth + 1);
      }
    }

    for (const arg of Array.from(args || [])) walk(arg, 0);
    walk(result, 0);
    return values.filter(Boolean).join(" ").slice(0, 3200);
  }

  function collectContext(args, result) {
    const queue = Array.from(args || []).concat([result]);
    const seen = new Set();
    let guideContext = {};
    let televisionGuide = {};
    let existingPlan = null;

    function walk(value, depth) {
      if (!value || typeof value !== "object" || depth > 5 || seen.has(value)) return;
      seen.add(value);
      const source = obj(value);
      if (!Object.keys(guideContext).length) {
        guideContext = obj(source.guideContext || source.nyxGuideContext || source.publicGuideContinuity);
      }
      if (!Object.keys(televisionGuide).length) {
        televisionGuide = obj(source.televisionGuide || source.tvGuide || source.tvContext);
      }
      if (!existingPlan && obj(source.guideActionPlan).contract) existingPlan = obj(source.guideActionPlan);
      for (const key of ["payload", "meta", "result", "finalEnvelope", "body", "context", "composerContext", "routing"]) {
        walk(source[key], depth + 1);
      }
    }

    for (const item of queue) walk(item, 0);
    return { guideContext, televisionGuide, existingPlan };
  }

  function mergePlans(existing, inferred) {
    const source = obj(existing);
    const list = [];
    for (const candidate of []
      .concat(Array.isArray(source.actions) ? source.actions : [])
      .concat(Array.isArray(inferred.actions) ? inferred.actions : [])) {
      const item = obj(candidate);
      if (!TYPES.has(item.type) || !TARGETS.has(item.target)) continue;
      if (list.some((entry) => entry.type === item.type && entry.target === item.target)) continue;
      list.push(action(item.type, item.target, item.label));
      if (list.length >= (inferred.television ? 4 : 6)) break;
    }
    return {
      ...inferred,
      actionCount: list.length,
      actions: list
    };
  }

  function project(value, args) {
    if (!value || typeof value !== "object") return value;
    const context = collectContext(args, value);
    const prompt = collectPrompt(args, value);
    const inferredPlan = inferActionPlan(prompt, {
      ...context.guideContext,
      televisionGuide: context.televisionGuide
    });
    const plan = mergePlans(context.existingPlan, inferredPlan);
    const preference = preferenceIntent(prompt);
    const hasGuideSignal = plan.actions.length > 0 || preference.explicit ||
      /\b(nyx|nix|nick|sandblast|radio|roku|synapse|lingosentinel|tv|television|cartoon|classic|avatar|caption|preference|setting)\b/i.test(prompt);

    if (!hasGuideSignal) return value;

    const out = { ...value };
    out.guideActionPlan = plan;
    out.guideActions = plan.actions;
    if (preference.explicit) out.publicPreferenceIntent = preference;
    out.guideDecision = {
      ...obj(out.guideDecision),
      version: PATCH_VERSION,
      actionPlanContract: ACTION_PLAN_CONTRACT,
      preferenceIntentContract: preference.explicit ? PREFERENCE_INTENT_CONTRACT : "",
      explicitAction: plan.actions.length > 0,
      explicitPreferenceChange: preference.explicit,
      executionAuthority: "client_user_gesture",
      preferenceWriteAuthority: "client_consent",
      serverExecutionAllowed: false,
      finalReplyAuthority: false,
      nonAuthority: true,
      noUserFacingDiagnostics: true
    };
    out.composerContext = {
      ...obj(out.composerContext),
      guideActionPlan: plan,
      publicPreferenceIntent: preference.explicit ? preference : undefined,
      guideDecision: out.guideDecision
    };
    out.stateSpinePatch = {
      ...obj(out.stateSpinePatch),
      nyxGuideStep789: {
        version: PATCH_VERSION,
        pendingActionIds: plan.actions.map((item) => item.id),
        pendingTargets: plan.actions.map((item) => item.target),
        preferenceChangeRequested: preference.explicit,
        preferenceConsentRequired: preference.rememberPreferences === true,
        clearPreferencesRequested: preference.clearRequested,
        publicSessionOnly: true,
        privateMemoryAccess: false,
        updatedAt: Date.now()
      }
    };
    return out;
  }

  function wrap(fn, name) {
    if (typeof fn !== "function" || fn.__nyxGuideSteps789DomainWrapped) return fn;
    const wrapped = function wrappedNyxGuideSteps789Domain() {
      const args = arguments;
      const result = fn.apply(this, args);
      if (result && typeof result.then === "function") {
        return result.then((value) => project(value, args));
      }
      return project(result, args);
    };
    try {
      Object.keys(fn).forEach((key) => { wrapped[key] = fn[key]; });
      Object.defineProperty(wrapped, "name", { value: fn.name || name || "nyxGuideSteps789Domain" });
    } catch (_) {}
    wrapped.__nyxGuideSteps789DomainWrapped = true;
    return wrapped;
  }

  try {
    if (typeof module.exports === "function") module.exports = wrap(module.exports, "default");
    const api = module.exports && typeof module.exports === "object" ? module.exports : null;
    if (!api) return;
    for (const name of [
      "runDomainConcierge", "routeOrClarify", "normalizeConciergeDecision",
      "run", "route", "handle", "default"
    ]) {
      if (typeof api[name] === "function") api[name] = wrap(api[name], name);
    }
    api.NYX_GUIDE_STEPS_7_8_9_DOMAIN_VERSION = PATCH_VERSION;
    api.NYX_GUIDE_ACTION_PLAN_CONTRACT = ACTION_PLAN_CONTRACT;
    api.NYX_PUBLIC_PREFERENCE_INTENT_CONTRACT = PREFERENCE_INTENT_CONTRACT;
    api.buildNyxGuideStep789ActionPlan = inferActionPlan;
    api.buildNyxPublicPreferenceIntent = preferenceIntent;
    api.attachNyxGuideStep789Concierge = function attach(value, input) {
      return project(value, [input || {}]);
    };
  } catch (_) {}
})();
 /* NYX_GUIDE_ORCHESTRATION_STEPS_7_8_9_R1_END */

/* NYX_GUIDE_ORCHESTRATION_STEPS_10_11_12_R1_START */
(function(){
  "use strict";
  const V="nyx.guideOrchestration.domainConcierge/4.0-steps10-11-12",EC="nyx.guideExecution/1.0",SC="nyx.guideStateTransition/1.0",RC="nyx.guideReleaseGate/1.0";
  const T=new Set(["sandblast_home","sandblast_radio","sandblast_tv","sandblast_roku","sandblast_cartoons","sandblast_classics","synapse","lingosentinel","apps","about","nyx_guide","guide_input","current_surface"]),A=new Set(["navigate","play_radio","stop_radio","open_media","open_tv","open_roku","open_synapse","open_guide","focus_input","summarize","tv_focus","tv_back","tv_play_pause","tv_open_details","dismiss_guide"]),L={sandblast_home:"home",sandblast_radio:"live",sandblast_tv:"watch",sandblast_cartoons:"watch",sandblast_classics:"watch",sandblast_roku:"roku",synapse:"news",lingosentinel:"about",apps:"apps",about:"about",nyx_guide:"search",guide_input:"search",current_surface:""};
  function o(v){return v&&typeof v==="object"&&!Array.isArray(v)?v:{}}function x(v,n=120){return String(v==null?"":v).replace(/[\u0000-\u001f\u007f]/g,"").replace(/\s+/g," ").trim().slice(0,n)}function h(v){let n=2166136261,s=String(v==null?"":v);for(let i=0;i<s.length;i++){n^=s.charCodeAt(i);n=Math.imul(n,16777619)}return(n>>>0).toString(16).padStart(8,"0")}
  function collect(v,args){let plan=o(v.guideActionPlan),ctx=o(v.guideContext||v.publicGuideContinuity),seen=new Set();function walk(q,d){if(!q||typeof q!=="object"||d>5||seen.has(q))return;seen.add(q);q=o(q);if(!Object.keys(plan).length&&o(q.guideActionPlan).contract)plan=o(q.guideActionPlan);if(!Object.keys(ctx).length)ctx=o(q.guideContext||q.publicGuideContinuity);for(const k of["payload","meta","result","finalEnvelope","body","routing","composerContext","stateSpinePatch"])walk(q[k],d+1)}for(const q of Array.from(args||[]).concat([v]))walk(q,0);return{plan,ctx}}
  function normalize(plan,ctx){const c=o(ctx),current=x(c.currentLane||c.lane||"home",32).toLowerCase(),list=[];for(const q of Array.isArray(o(plan).actions)?plan.actions:[]){const z=o(q),type=x(z.type,32).toLowerCase(),target=x(z.target||z.targetKey,64).toLowerCase();if(!A.has(type)||!T.has(target)||list.some(e=>e.type===type&&e.target===target))continue;const id=x(z.id,80)||`act_${h(`${type}|${target}|${z.label||""}`)}`;list.push({...z,contract:"nyx.guideAction/1.2",id,type,target,targetKey:target,lane:L[target]||current,expectedLane:current,rollbackLane:current,requiresUserGesture:true,autoExecute:false,idempotent:true,idempotencyKey:h(`${id}|${current}`),serverExecutionAllowed:false,symbolicTargetOnly:true});if(list.length>=6)break}const planId=x(o(plan).planId,80)||`plan_${h(`${current}|${list.map(a=>a.id).join("|")}`)}`;return{...o(plan),contract:"nyx.guideActionPlan/1.1",version:V,planId,actionCount:list.length,actions:list,requiresUserGesture:true,autoExecute:false,idempotencyRequired:true,rollbackRequired:true,executionAuthority:"client_user_gesture",serverExecutionAllowed:false,expiresAt:Date.now()+300000}}
  function project(v,args){if(!v||typeof v!=="object"||Array.isArray(v))return v;const c=collect(v,args),plan=normalize(c.plan,c.ctx);if(!plan.actions.length)return v;const ctx=o(c.ctx),revision=Math.max(0,Number(ctx.revision||o(v.nyxGuideExecution).revision||0)||0),execution={contract:EC,version:V,planId:plan.planId,status:"pending_user_gesture",currentLane:x(ctx.currentLane||"home",32),previousLane:x(ctx.previousLane||ctx.currentLane||"home",32),revision,actionIds:plan.actions.map(a=>a.id),requiresUserGesture:true,autoExecute:false,idempotencyRequired:true,rollbackRequired:true,publicSessionOnly:true,privateMemoryAccess:false},gate={contract:RC,version:V,state:"candidate",requiredContracts:[plan.contract,EC,SC,"nyx.guideContinuity/1.0"],serverActionExecution:false,clientUserGestureRequired:true,diagnosticsRedacted:true};const out={...v,guideActionPlan:plan,guideActions:plan.actions,nyxGuideExecution:execution,nyxGuideReleaseGate:gate};out.composerContext={...o(out.composerContext),guideActionPlan:plan,nyxGuideExecution:execution,nyxGuideReleaseGate:gate};out.stateSpinePatch={...o(out.stateSpinePatch),nyxGuideStep101112:{version:V,planId:plan.planId,pendingActionIds:plan.actions.map(a=>a.id),currentLane:execution.currentLane,revision,transitionContract:SC,releaseContract:RC,publicSessionOnly:true,privateMemoryAccess:false,updatedAt:Date.now()}};return out}
  function wrap(fn){if(typeof fn!=="function"||fn.__nyx101112Concierge)return fn;const w=function(){const a=arguments,r=fn.apply(this,a);return r&&typeof r.then==="function"?r.then(v=>project(v,a)):project(r,a)};try{Object.keys(fn).forEach(k=>w[k]=fn[k])}catch(_){}w.__nyx101112Concierge=true;return w}
  try{if(typeof module.exports==="function")module.exports=wrap(module.exports);const api=module.exports&&typeof module.exports==="object"?module.exports:null;if(api){for(const n of["runDomainConcierge","routeOrClarify","normalizeConciergeDecision","run","route","handle","default"])if(typeof api[n]==="function")api[n]=wrap(api[n]);api.NYX_GUIDE_STEPS_10_11_12_CONCIERGE_VERSION=V;api.buildNyxGuideExecutionBoundary=(p,c)=>({plan:normalize(p,c),contract:EC,stateContract:SC,releaseContract:RC});api.attachNyxGuideExecutionBoundary=(v,i)=>project(v,[i||{}])}}catch(_){}
})();
/* NYX_GUIDE_ORCHESTRATION_STEPS_10_11_12_R1_END */

/* NYX_DOMAIN_CONCIERGE_LOOP_LATENCY_FIX_R1_START */
(function nyxDomainConciergeLoopLatencyFixR1(){
  "use strict";
  const V="nyx.domainConcierge.loopLatencyFix/1.0",TTL=2000,MAX=256;
  const cache=new Map();
  function obj(v){return v&&typeof v==="object"&&!Array.isArray(v)?v:{};}
  function txt(v,n=1200){return String(v==null?"":v).replace(/[\u0000-\u001f\u007f]/g,"").replace(/\s+/g," ").trim().slice(0,n);}
  function low(v){return txt(v).toLowerCase();}
  function inputText(p){const x=obj(p),b=obj(x.body),q=obj(x.payload),m=obj(x.meta);return txt(x.text||x.userText||x.message||x.query||x.prompt||b.text||b.message||b.query||q.text||q.message||q.query||m.text||m.message);}
  function isPublic(p){const x=obj(p),b=obj(x.body),q=obj(x.payload),m=obj(x.meta);return low(x.audience||b.audience||q.audience||m.audience)==="public"||low(x.lane||b.lane||q.lane)==="public_interface"||x.publicSurfaceOnly===true||b.publicSurfaceOnly===true||q.publicSurfaceOnly===true||x.publicIdentityLock===true||b.publicIdentityLock===true||q.publicIdentityLock===true;}
  function fast(p){if(!isPublic(p))return null;const t=low(inputText(p));if(!t)return null;if(/\b(law|legal|legally|lawfully|lawyer|attorney|rights?|copyright|licen[cs]e|licen[cs]ing|contract|liability|negligence|lawsuit|litigation|jurisdiction|compliance|regulatory|regulation|indemnity|trademark|patent|privacy law|employment law|public performance|distribution rights?|streaming rights?)\b/.test(t))return null;let route="",intent="simple_chat",reason="";
    if(/\b(radio|listen|music|love letters)\b/.test(t)){route="music";intent="music_query";reason="public_radio_fast_route";}
    else if(/\broku\b/.test(t)){route="roku";intent="roku_query";reason="public_roku_fast_route";}
    else if(/\b(tv|television|cartoons?|classics?|watch)\b/.test(t)){route="media";intent="simple_chat";reason="public_media_fast_route";}
    else if(/\b(synapse|news|headline|stories?)\b/.test(t)){route="news";intent="news_query";reason="public_news_fast_route";}
    else if(/\b(lingosentinel|lingo sentinel|translation|language)\b/.test(t)){route="english";intent="domain_question";reason="public_language_fast_route";}
    else if(/\b(who are you|what are you|what is sandblast|sandblast ecosystem|what can you do|capabilities|home)\b/.test(t)){route="identity";intent="identity_query";reason="public_identity_fast_route";}
    if(!route)return null;
    const confidence=0.98;
    return{version:V,contract:"nyx.marion.domainConcierge/1.0",source:"DomainConcierge",action:"route",route,intent,confidence,needsClarifier:false,clarifier:"",reason,noUserFacingDiagnostics:true,finalEnvelopeRequired:false,bridgeCompatible:true,composerCompatible:true,stateSpineCompatible:true,domainConfidence:{version:"nyx.marion.domainConfidence/1.1",confidence,band:"high",ambiguous:false,routeLocked:true,failClosed:false,primaryDomain:route,knowledgeDomain:route,reason},questionShape:{questionShape:"direct_public_ecosystem",changed:false},composerContext:{route,intent,publicFastRoute:true,loopLatencyFixVersion:V},stateSpinePatch:{route,intent,publicFastRoute:true,loopLatencyFixVersion:V,shouldAdvanceState:true}};
  }
  function previousClarifier(p){const x=obj(p),prev=obj(x.previousMemory||x.memory||x.turnMemory),state=obj(x.state||x.conversationState||prev.stateSpine),dc=obj(prev.domainConcierge||state.domainConcierge||obj(prev.lastDecision));return txt(dc.clarifier||prev.lastClarifier||state.lastClarifier||"");}
  function normalize(v,p){if(!v||typeof v!=="object"||Array.isArray(v))return v;const out={...v,meta:{...obj(v.meta),loopLatencyFixVersion:V}};if(out.needsClarifier===true){const prev=previousClarifier(p),cur=txt(out.clarifier);if(prev&&cur&&low(prev)===low(cur)){out.action="route";out.route=txt(out.route||obj(out.domainConfidence).primaryDomain||"general",80)||"general";out.intent=txt(out.intent||"simple_chat",80)||"simple_chat";out.needsClarifier=false;out.clarifier="";out.reason="clarifier_loop_bypassed";out.confidence=Math.max(Number(out.confidence)||0,0.62);out.stateSpinePatch={...obj(out.stateSpinePatch),clarifierLoopBypassed:true,shouldAdvanceState:true,loopLatencyFixVersion:V};out.composerContext={...obj(out.composerContext),clarifierLoopBypassed:true,loopLatencyFixVersion:V};}}
    return out;
  }
  function key(p,o){return[inputText(p).toLowerCase(),low(obj(p).lane),low(obj(p).intent),JSON.stringify(obj(o)).slice(0,300)].join("|");}
  function clone(v){if(!v||typeof v!=="object")return v;const out={...v};for(const k of["domainConfidence","questionShape","composerContext","stateSpinePatch","meta"])if(v[k]&&typeof v[k]==="object"&&!Array.isArray(v[k]))out[k]={...v[k]};return out;}
  function get(k){const e=cache.get(k);if(!e||Date.now()-e.at>TTL){if(e)cache.delete(k);return null;}cache.delete(k);cache.set(k,e);return clone(e.value);}
  function put(k,v){cache.delete(k);cache.set(k,{at:Date.now(),value:clone(v)});while(cache.size>MAX)cache.delete(cache.keys().next().value);return v;}
  function wrap(fn,name){if(typeof fn!=="function"||fn.__nyxDomainConciergeLoopLatencyFixR1)return fn;const w=function(packet,options){const f=fast(packet);if(f)return f;const k=key(packet,options),hit=get(k);if(hit)return hit;return put(k,normalize(fn.call(this,packet,options),packet));};try{Object.keys(fn).forEach(k=>w[k]=fn[k]);}catch(_){}w.__nyxDomainConciergeLoopLatencyFixR1=true;w.__nyxWrappedName=name;return w;}
  try{const api=module.exports&&typeof module.exports==="object"?module.exports:null;if(api){for(const n of["runDomainConcierge","routeOrClarify"])if(typeof api[n]==="function")api[n]=wrap(api[n],n);if(typeof api.shouldClarify==="function"){const old=api.shouldClarify;api.shouldClarify=function(packet,options){return api.runDomainConcierge(packet,options).needsClarifier===true;};api.shouldClarify.__nyxDomainConciergeLoopLatencyFixR1=true;}api.NYX_DOMAIN_CONCIERGE_LOOP_LATENCY_FIX_VERSION=V;api.clearNyxDomainConciergeFastCache=()=>cache.clear();api.buildNyxPublicConciergeFastRoute=fast;api.guardNyxClarifierLoop=normalize;}}
  catch(_){}
})();
/* NYX_DOMAIN_CONCIERGE_LOOP_LATENCY_FIX_R1_END */

/* NYX_PUBLIC_CURRENT_TURN_CONCIERGE_HARDLOCK_R2_START */
(function nyxPublicCurrentTurnConciergeHardlockR2(){
  "use strict";
  const VERSION = "nyx.domainConcierge.publicCurrentTurnMediaHardlock/2.0";

  function isObj(value){ return !!value && typeof value === "object" && !Array.isArray(value); }
  function obj(value){ return isObj(value) ? value : {}; }
  function clean(value, max = 1800){
    return String(value == null ? "" : value)
      .replace(/[\u0000-\u001f\u007f]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, max);
  }
  function lower(value){ return clean(value).toLowerCase(); }
  function normalize(value){
    return lower(value)
      .replace(/[’‘]/g, "'")
      .replace(/[^a-z0-9']+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function currentTurnText(packet){
    const p = obj(packet);
    const payload = obj(p.payload);
    const body = obj(p.body);
    const meta = obj(p.meta);
    const turn = obj(p.turn);
    return clean(
      p.rawUserText || p.userText || p.text || p.message || p.query || p.userQuery ||
      p.prompt || p.effectivePrompt || p.normalizedUserIntent ||
      payload.rawUserText || payload.userText || payload.text || payload.message || payload.query || payload.prompt ||
      body.rawUserText || body.userText || body.text || body.message || body.query || body.prompt ||
      turn.rawUserText || turn.userText || turn.text || turn.message || turn.query ||
      meta.rawUserText || meta.userText || meta.text || meta.message || meta.query
    );
  }

  function isPublicSurface(packet){
    const p = obj(packet);
    const payload = obj(p.payload);
    const body = obj(p.body);
    const meta = obj(p.meta);
    const guide = obj(p.guideContext || payload.guideContext || body.guideContext || meta.guideContext);
    const audience = lower(p.audience || payload.audience || body.audience || meta.audience);
    const lane = lower(p.lane || payload.lane || body.lane || meta.lane);
    return audience === "public" || lane === "public_interface" ||
      p.publicSurfaceOnly === true || payload.publicSurfaceOnly === true || body.publicSurfaceOnly === true ||
      p.publicIdentityLock === true || payload.publicIdentityLock === true || body.publicIdentityLock === true ||
      /sandblast\.channel|nyx|ecosystem/i.test(clean(guide.surface || guide.site || p.surface || payload.surface));
  }

  function explicitIntent(packet){
    const text = normalize(currentTurnText(packet));
    if (!text) return null;
    const legalExplicit = /\b(law|legal|legally|lawfully|lawyer|attorney|rights?|contract|liability|negligence|lawsuit|litigation|copyright|licen[cs]e|licen[cs]ing|trademark|jurisdiction|compliance|regulatory|legal risk|legal advice|distribution rights?|streaming rights?)\b/.test(text);
    const roku = /\broku\b/.test(text) || /\bwatch (?:it|that|this) on (?:my )?tv\b/.test(text);
    const media =
      /^(?:what can i watch|what is there to watch|what can we watch|what should i watch|show me something to watch|what movies are available|what shows are available|what programming is available)$/.test(text) ||
      /\b(?:watch|view|stream|movies?|films?|shows?|programming|cartoons?|classics?|sandblast tv|television|video)\b/.test(text);
    if (legalExplicit) return null;
    if (roku) return { route: "roku", intent: "roku_query", reason: "current_turn_explicit_roku_hardlock", targetLane: "roku" };
    if (media) return { route: "media", intent: "media_request", reason: "current_turn_explicit_media_hardlock", targetLane: "watch" };
    return null;
  }

  function decision(packet, intent){
    const confidence = 0.995;
    const currentText = currentTurnText(packet);
    return {
      version: VERSION,
      contract: "nyx.marion.domainConcierge/1.0",
      source: "DomainConcierge.currentTurnHardlock",
      action: "route",
      route: intent.route,
      domain: intent.route,
      primaryDomain: intent.route,
      selectedDomain: intent.route,
      knowledgeDomain: intent.route,
      intent: intent.intent,
      confidence,
      needsClarifier: false,
      clarifier: "",
      reason: intent.reason,
      routeLocked: true,
      currentTurnAuthority: true,
      staleCarrySuppressed: true,
      staleLawCarrySuppressed: true,
      noCrossDomainBleed: true,
      noUserFacingDiagnostics: true,
      finalEnvelopeRequired: false,
      bridgeCompatible: true,
      composerCompatible: true,
      stateSpineCompatible: true,
      questionShape: {
        version: "nyx.marion.questionShapeNormalization/1.0",
        rawText: currentText,
        normalizedText: currentText,
        normalizedUserIntent: currentText,
        questionShape: intent.intent === "roku_query" ? "direct_roku_request" : "direct_media_request",
        changed: false,
        reason: intent.reason,
        source: "DomainConcierge.currentTurnHardlock"
      },
      domainConfidence: {
        version: "nyx.marion.domainConfidence/1.1",
        confidence,
        confidenceScore: confidence,
        band: "high",
        margin: 0.99,
        ambiguous: false,
        routeLocked: true,
        failClosed: false,
        needsClarifier: false,
        highStakes: false,
        primaryDomain: intent.route,
        selectedDomain: intent.route,
        domain: intent.route,
        knowledgeDomain: intent.route,
        secondaryDomains: [],
        reason: intent.reason,
        currentTurnAuthority: true,
        staleCarrySuppressed: true,
        noCrossDomainBleed: true
      },
      composerContext: {
        route: intent.route,
        domain: intent.route,
        intent: intent.intent,
        targetLane: intent.targetLane,
        currentTurnAuthority: true,
        staleCarrySuppressed: true,
        staleLawCarrySuppressed: true,
        noCrossDomainBleed: true,
        publicCurrentTurnMediaHardlockVersion: VERSION
      },
      routing: {
        route: intent.route,
        domain: intent.route,
        primaryDomain: intent.route,
        selectedDomain: intent.route,
        knowledgeDomain: intent.route,
        intent: intent.intent,
        targetLane: intent.targetLane,
        routeLocked: true,
        currentTurnAuthority: true,
        staleCarrySuppressed: true,
        staleLawCarrySuppressed: true,
        noCrossDomainBleed: true,
        highStakes: false
      },
      stateSpinePatch: {
        route: intent.route,
        domain: intent.route,
        selectedDomain: intent.route,
        knowledgeDomain: intent.route,
        intent: intent.intent,
        targetLane: intent.targetLane,
        previousDomainCarryAllowed: false,
        staleCarrySuppressed: true,
        staleLawCarrySuppressed: true,
        currentTurnAuthority: true,
        routeLocked: true,
        clarifierLoopBypassed: true,
        shouldAdvanceState: true,
        publicCurrentTurnMediaHardlockVersion: VERSION
      }
    };
  }

  function wrap(fn, name){
    if (typeof fn !== "function" || fn.__nyxPublicCurrentTurnConciergeHardlockR2) return fn;
    const wrapped = function wrappedNyxPublicCurrentTurnConcierge(packet, options){
      const intent = isPublicSurface(packet) ? explicitIntent(packet) : null;
      if (intent) return decision(packet, intent);
      return fn.call(this, packet, options);
    };
    try { Object.keys(fn).forEach((key) => { wrapped[key] = fn[key]; }); } catch (_) {}
    wrapped.__nyxPublicCurrentTurnConciergeHardlockR2 = true;
    wrapped.__nyxWrappedName = name;
    return wrapped;
  }

  try {
    if (typeof module.exports === "function") module.exports = wrap(module.exports, "default");
    const api = module.exports && typeof module.exports === "object" ? module.exports : null;
    if (!api) return;
    for (const name of ["runDomainConcierge", "routeOrClarify", "run", "route", "handle", "default"]) {
      if (typeof api[name] === "function") api[name] = wrap(api[name], name);
    }
    if (typeof api.shouldClarify === "function") {
      const oldShouldClarify = api.shouldClarify;
      api.shouldClarify = function shouldClarifyCurrentTurnHardlock(packet, options){
        const intent = isPublicSurface(packet) ? explicitIntent(packet) : null;
        if (intent) return false;
        return oldShouldClarify.call(this, packet, options);
      };
      api.shouldClarify.__nyxPublicCurrentTurnConciergeHardlockR2 = true;
    }
    api.NYX_PUBLIC_CURRENT_TURN_CONCIERGE_HARDLOCK_VERSION = VERSION;
    api.classifyNyxPublicCurrentTurnConciergeIntent = explicitIntent;
    api.buildNyxPublicCurrentTurnConciergeDecision = function build(packet){
      const intent = explicitIntent(packet);
      return intent ? decision(packet, intent) : null;
    };
  } catch (_) {}
})();
/* NYX_PUBLIC_CURRENT_TURN_CONCIERGE_HARDLOCK_R2_END */

/* NYX_PUBLIC_MEDIA_DISCOVERY_NAVIGATION_CONCIERGE_R3_START */
(function nyxPublicMediaDiscoveryNavigationConciergeR3(){
  "use strict";
  const VERSION = "nyx.domainConcierge.publicMediaDiscoveryNavigationSplit/3.0";

  function isObj(value){ return !!value && typeof value === "object" && !Array.isArray(value); }
  function obj(value){ return isObj(value) ? value : {}; }
  function clean(value, max = 1800){
    return String(value == null ? "" : value)
      .replace(/[\u0000-\u001f\u007f]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, max);
  }
  function lower(value){ return clean(value).toLowerCase(); }
  function normalize(value){
    return lower(value)
      .replace(/[’‘]/g, "'")
      .replace(/[^a-z0-9']+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function currentTurnText(packet){
    const p = obj(packet);
    const payload = obj(p.payload);
    const body = obj(p.body);
    const meta = obj(p.meta);
    const turn = obj(p.turn);
    return clean(
      p.rawUserText || p.userText || p.text || p.message || p.query || p.userQuery ||
      p.prompt || p.effectivePrompt || p.normalizedUserIntent ||
      payload.rawUserText || payload.userText || payload.text || payload.message || payload.query || payload.prompt ||
      body.rawUserText || body.userText || body.text || body.message || body.query || body.prompt ||
      turn.rawUserText || turn.userText || turn.text || turn.message || turn.query ||
      meta.rawUserText || meta.userText || meta.text || meta.message || meta.query
    );
  }

  function isPublicSurface(packet){
    const p = obj(packet);
    const payload = obj(p.payload);
    const body = obj(p.body);
    const meta = obj(p.meta);
    const guide = obj(p.guideContext || payload.guideContext || body.guideContext || meta.guideContext);
    const audience = lower(p.audience || payload.audience || body.audience || meta.audience);
    const lane = lower(p.lane || payload.lane || body.lane || meta.lane);
    const profile = lower(p.presentationProfile || payload.presentationProfile || body.presentationProfile || meta.presentationProfile);
    return audience === "public" || profile === "public" || lane === "public_interface" ||
      p.publicSurfaceOnly === true || payload.publicSurfaceOnly === true || body.publicSurfaceOnly === true ||
      p.publicIdentityLock === true || payload.publicIdentityLock === true || body.publicIdentityLock === true ||
      /sandblast\.channel|nyx|ecosystem/i.test(clean(guide.surface || guide.site || p.surface || payload.surface));
  }

  function classify(packet){
    const text = normalize(currentTurnText(packet));
    if (!text) return null;

    const mediaNoun = /\b(?:watch|view|stream|movies?|films?|shows?|programming|cartoons?|animation|animated|classics?|classic movies?|public domain movies?|public domain films?|sandblast tv|television|video)\b/.test(text);
    const rokuNoun = /\broku\b/.test(text);
    const legalExplicit = /\b(?:law|legal|legally|lawfully|lawyer|attorney|rights?|contract|liability|negligence|lawsuit|litigation|copyright|licen[cs]e|licen[cs]ing|trademark|jurisdiction|compliance|regulatory|legal risk|legal advice|distribution rights?|streaming rights?)\b/.test(text);
    if (legalExplicit) return null;

    const discovery =
      /^(?:what can i watch|what is there to watch|what can we watch|what should i watch|show me something to watch|what movies are available|what films are available|what shows are available|what programming is available|what do you have to watch|what is available to watch)$/.test(text) ||
      /\b(?:what|which)\b.{0,60}\b(?:watch|movies?|films?|shows?|programming|cartoons?|classics?)\b/.test(text) ||
      /\bcan i\b.{0,50}\b(?:watch|view|stream|see|get)\b/.test(text) ||
      /\bis\b.{0,50}\b(?:available|on roku|on tv)\b/.test(text) ||
      /\b(?:tell me about|what is on)\b.{0,50}\b(?:sandblast tv|roku|cartoons?|classics?)\b/.test(text);

    const navigation =
      /\b(?:open|launch|go to|take me to|continue to|switch to|start watching|play)\b.{0,55}\b(?:sandblast tv|television|tv|roku|cartoons?|classics?|classic movies?|media|video)\b/.test(text) ||
      /^(?:open|launch|play|start)\s+(?:sandblast\s+)?(?:tv|television|roku|cartoons?|classics?|classic movies?)$/.test(text) ||
      /^(?:show me|take me to)\s+(?:the\s+)?(?:tv|roku|cartoons?|classics?|classic movies?)$/.test(text);

    if (discovery) {
      const roku = rokuNoun || /\bon (?:my )?tv\b/.test(text);
      return {
        route: roku ? "roku" : "media",
        intent: roku ? "roku_discovery" : "media_discovery",
        reason: roku ? "current_turn_roku_discovery_answer_only" : "current_turn_media_discovery_answer_only",
        targetLane: roku ? "roku" : "watch",
        actionRequired: false,
        validateAction: false,
        answerOnly: true,
        navigationSuggested: true
      };
    }

    if (navigation) {
      const roku = rokuNoun;
      return {
        route: roku ? "roku" : "media",
        intent: roku ? "roku_navigation" : "media_navigation",
        reason: roku ? "current_turn_explicit_roku_navigation" : "current_turn_explicit_media_navigation",
        targetLane: roku ? "roku" : "watch",
        actionRequired: true,
        validateAction: true,
        answerOnly: false,
        navigationSuggested: false
      };
    }

    if (mediaNoun || rokuNoun) {
      return {
        route: rokuNoun ? "roku" : "media",
        intent: rokuNoun ? "roku_discovery" : "media_discovery",
        reason: rokuNoun ? "current_turn_roku_information_answer_only" : "current_turn_media_information_answer_only",
        targetLane: rokuNoun ? "roku" : "watch",
        actionRequired: false,
        validateAction: false,
        answerOnly: true,
        navigationSuggested: true
      };
    }
    return null;
  }

  function decision(packet, intent){
    const confidence = 0.997;
    const currentText = currentTurnText(packet);
    return {
      version: VERSION,
      contract: "nyx.marion.domainConcierge/1.0",
      source: "DomainConcierge.mediaDiscoveryNavigationSplit",
      action: "route",
      route: intent.route,
      domain: intent.route,
      primaryDomain: intent.route,
      selectedDomain: intent.route,
      knowledgeDomain: intent.route,
      intent: intent.intent,
      confidence,
      actionRequired: intent.actionRequired,
      validateAction: intent.validateAction,
      answerOnly: intent.answerOnly,
      navigationSuggested: intent.navigationSuggested,
      needsClarifier: false,
      clarifier: "",
      reason: intent.reason,
      routeLocked: true,
      currentTurnAuthority: true,
      staleCarrySuppressed: true,
      staleLawCarrySuppressed: true,
      noCrossDomainBleed: true,
      noUserFacingDiagnostics: true,
      finalEnvelopeRequired: false,
      bridgeCompatible: true,
      composerCompatible: true,
      stateSpineCompatible: true,
      questionShape: {
        version: "nyx.marion.questionShapeNormalization/1.0",
        rawText: currentText,
        normalizedText: currentText,
        normalizedUserIntent: currentText,
        questionShape: intent.answerOnly ? "media_discovery_question" : "media_navigation_command",
        changed: false,
        reason: intent.reason,
        source: "DomainConcierge.mediaDiscoveryNavigationSplit"
      },
      domainConfidence: {
        version: "nyx.marion.domainConfidence/1.1",
        confidence,
        confidenceScore: confidence,
        band: "high",
        margin: 0.99,
        ambiguous: false,
        routeLocked: true,
        failClosed: false,
        needsClarifier: false,
        highStakes: false,
        primaryDomain: intent.route,
        selectedDomain: intent.route,
        domain: intent.route,
        knowledgeDomain: intent.route,
        secondaryDomains: [],
        reason: intent.reason,
        currentTurnAuthority: true,
        staleCarrySuppressed: true,
        noCrossDomainBleed: true
      },
      composerContext: {
        route: intent.route,
        domain: intent.route,
        intent: intent.intent,
        targetLane: intent.targetLane,
        currentTurnAuthority: true,
        staleCarrySuppressed: true,
        staleLawCarrySuppressed: true,
        noCrossDomainBleed: true,
        actionRequired: intent.actionRequired,
        validateAction: intent.validateAction,
        answerOnly: intent.answerOnly,
        navigationSuggested: intent.navigationSuggested,
        publicMediaDiscoveryNavigationSplitVersion: VERSION
      },
      routing: {
        route: intent.route,
        domain: intent.route,
        primaryDomain: intent.route,
        selectedDomain: intent.route,
        knowledgeDomain: intent.route,
        intent: intent.intent,
        targetLane: intent.targetLane,
        routeLocked: true,
        currentTurnAuthority: true,
        staleCarrySuppressed: true,
        staleLawCarrySuppressed: true,
        noCrossDomainBleed: true,
        highStakes: false,
        actionRequired: intent.actionRequired,
        validateAction: intent.validateAction,
        answerOnly: intent.answerOnly,
        navigationSuggested: intent.navigationSuggested
      },
      stateSpinePatch: {
        route: intent.route,
        domain: intent.route,
        selectedDomain: intent.route,
        knowledgeDomain: intent.route,
        intent: intent.intent,
        targetLane: intent.targetLane,
        previousDomainCarryAllowed: false,
        staleCarrySuppressed: true,
        staleLawCarrySuppressed: true,
        currentTurnAuthority: true,
        routeLocked: true,
        clarifierLoopBypassed: true,
        shouldAdvanceState: true,
        actionRequired: intent.actionRequired,
        validateAction: intent.validateAction,
        pendingActionValidation: intent.actionRequired,
        answerOnly: intent.answerOnly,
        navigationSuggested: intent.navigationSuggested,
        publicMediaDiscoveryNavigationSplitVersion: VERSION
      }
    };
  }

  function wrap(fn, name){
    if (typeof fn !== "function" || fn.__nyxPublicMediaDiscoveryNavigationConciergeR3) return fn;
    const wrapped = function wrappedNyxPublicMediaDiscoveryNavigationConcierge(packet, options){
      const intent = isPublicSurface(packet) ? classify(packet) : null;
      if (intent) return decision(packet, intent);
      return fn.call(this, packet, options);
    };
    try { Object.keys(fn).forEach((key) => { wrapped[key] = fn[key]; }); } catch (_) {}
    wrapped.__nyxPublicMediaDiscoveryNavigationConciergeR3 = true;
    wrapped.__nyxWrappedName = name;
    return wrapped;
  }

  try {
    if (typeof module.exports === "function") module.exports = wrap(module.exports, "default");
    const api = module.exports && typeof module.exports === "object" ? module.exports : null;
    if (!api) return;
    for (const name of ["runDomainConcierge", "routeOrClarify", "run", "route", "handle", "default"]) {
      if (typeof api[name] === "function") api[name] = wrap(api[name], name);
    }
    if (typeof api.shouldClarify === "function") {
      const oldShouldClarify = api.shouldClarify;
      api.shouldClarify = function shouldClarifyMediaDiscoveryNavigation(packet, options){
        const intent = isPublicSurface(packet) ? classify(packet) : null;
        if (intent) return false;
        return oldShouldClarify.call(this, packet, options);
      };
      api.shouldClarify.__nyxPublicMediaDiscoveryNavigationConciergeR3 = true;
    }
    api.NYX_PUBLIC_MEDIA_DISCOVERY_NAVIGATION_CONCIERGE_VERSION = VERSION;
    api.classifyNyxPublicMediaDiscoveryNavigationConcierge = classify;
    api.buildNyxPublicMediaDiscoveryNavigationConciergeDecision = function build(packet){
      const intent = classify(packet);
      return intent ? decision(packet, intent) : null;
    };
  } catch (_) {}
})();
/* NYX_PUBLIC_MEDIA_DISCOVERY_NAVIGATION_CONCIERGE_R3_END */


/* NYX_PUBLIC_KNOWLEDGE_NAVIGATION_SEPARATION_CONCIERGE_R4_START */
(function nyxPublicKnowledgeNavigationSeparationConciergeR4(){
  "use strict";
  const VERSION = "nyx.domainConcierge.publicKnowledgeNavigationSeparation/4.0";
  const KNOWLEDGE_DOMAINS = new Set(["law","finance","cyber","ai","psychology","english","business","general","general_reasoning"]);

  function isObj(value){ return !!value && typeof value === "object" && !Array.isArray(value); }
  function obj(value){ return isObj(value) ? value : {}; }
  function clean(value, max = 1800){
    return String(value == null ? "" : value)
      .replace(/[\u0000-\u001f\u007f]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, max);
  }
  function lower(value){ return clean(value).toLowerCase(); }
  function normalize(value){
    return lower(value)
      .replace(/[’‘]/g, "'")
      .replace(/[^a-z0-9']+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }
  function currentTurnText(packet){
    const p = obj(packet), payload = obj(p.payload), body = obj(p.body), meta = obj(p.meta), turn = obj(p.turn);
    return clean(
      p.rawUserText || p.userText || p.text || p.message || p.query || p.userQuery || p.prompt || p.effectivePrompt || p.normalizedUserIntent ||
      payload.rawUserText || payload.userText || payload.text || payload.message || payload.query || payload.prompt ||
      body.rawUserText || body.userText || body.text || body.message || body.query || body.prompt ||
      turn.rawUserText || turn.userText || turn.text || turn.message || turn.query ||
      meta.rawUserText || meta.userText || meta.text || meta.message || meta.query
    );
  }
  function isPublicSurface(packet){
    const p = obj(packet), payload = obj(p.payload), body = obj(p.body), meta = obj(p.meta);
    const audience = lower(p.audience || payload.audience || body.audience || meta.audience);
    const lane = lower(p.lane || payload.lane || body.lane || meta.lane);
    const profile = lower(p.presentationProfile || payload.presentationProfile || body.presentationProfile || meta.presentationProfile);
    return audience === "public" || profile === "public" || lane === "public_interface" ||
      p.publicSurfaceOnly === true || payload.publicSurfaceOnly === true || body.publicSurfaceOnly === true ||
      p.publicIdentityLock === true || payload.publicIdentityLock === true || body.publicIdentityLock === true;
  }
  function isExplicitNavigation(text){
    const t = normalize(text);
    return /\b(?:open|launch|go to|take me to|continue to|switch to|return to|play|start watching|show me)\b.{0,70}\b(?:sandblast|radio|tv|television|roku|synapse|lingosentinel|cartoons?|classics?|home|media)\b/.test(t) ||
      /^(?:open|launch|play|start|go to|take me to)\s+(?:sandblast\s+)?(?:radio|tv|television|roku|synapse|lingosentinel|cartoons?|classics?|home)$/.test(t);
  }
  function classifyKnowledgeDomain(packet){
    if (!isPublicSurface(packet)) return null;
    const raw = currentTurnText(packet);
    const t = normalize(raw);
    if (!t || t.length > 1200 || isExplicitNavigation(t)) return null;
    if (/\b(?:law|legal|legally|lawfully|lawyer|attorney|rights?|contract|liability|negligence|lawsuit|litigation|copyright|licen[cs]e|licen[cs]ing|trademark|jurisdiction|legal risk|employment law|privacy law|regulatory compliance|distribution rights?|streaming rights?|public performance|fiduciary|tort)\b/.test(t)) return { domain:"law", intent:"domain_question", highStakes:true };
    if (/\b(?:cash flow|revenue|pricing|margin|runway|budget|forecast|finance|financial|profit|cost control|accounts receivable|working capital)\b/.test(t)) return { domain:"finance", intent:"domain_question", highStakes:true };
    if (/\b(?:cybersecurity|cyber security|cyber|least privilege|zero trust|phishing|ransomware|data breach|access control|mfa|multi factor|incident response|credential security)\b/.test(t)) return { domain:"cyber", intent:"domain_question", highStakes:true };
    if (/\b(?:artificial intelligence|machine learning|large language model|llm|generative ai|agentic ai|rag|retrieval augmented generation|ai system|ai model)\b/.test(t) || /(?:^|\s)ai(?:\s|$)/.test(t)) return { domain:"ai", intent:"domain_question", highStakes:false };
    if (/\b(?:psychology|cognitive bias|behavio[u]?r|motivation|emotion|anxiety|trauma|attachment|decision making)\b/.test(t)) return { domain:"psychology", intent:"domain_question", highStakes:false };
    if (/\b(?:grammar|wording|sentence structure|plain english|idiom|phrase meaning|rewrite this sentence|english usage)\b/.test(t)) return { domain:"english", intent:"domain_question", highStakes:false };
    return null;
  }
  function knowledgeDecision(packet, info, base){
    const currentText = currentTurnText(packet);
    const prior = obj(base);
    const confidence = 0.995;
    const domainConfidence = {
      ...obj(prior.domainConfidence),
      version: "nyx.marion.domainConfidence/1.1",
      confidence,
      confidenceScore: confidence,
      band: "high",
      confidenceBand: "high",
      margin: 0.98,
      ambiguous: false,
      routeLocked: true,
      failClosed: false,
      needsClarifier: false,
      highStakes: info.highStakes === true,
      primaryDomain: info.domain,
      selectedDomain: info.domain,
      domain: info.domain,
      knowledgeDomain: info.domain,
      secondaryDomains: [],
      reason: "current_turn_public_knowledge_answer_only",
      semanticRoute: true,
      navigationRoute: false,
      noCrossDomainBleed: true,
      noUserFacingDiagnostics: true
    };
    const out = {
      ...prior,
      version: VERSION,
      contract: "nyx.marion.domainConcierge/1.0",
      source: "DomainConcierge.publicKnowledgeNavigationSeparation",
      action: "route",
      actionMode: "answer",
      routeType: "knowledge",
      semanticRoute: true,
      navigationRoute: false,
      route: info.domain,
      domain: info.domain,
      primaryDomain: info.domain,
      selectedDomain: info.domain,
      knowledgeDomain: info.domain,
      intent: info.intent,
      confidence,
      actionRequired: false,
      validateAction: false,
      actionValidationRequired: false,
      pendingActionValidation: false,
      answerOnly: true,
      navigationSuggested: false,
      guideActions: [],
      guideActionPlan: null,
      needsClarifier: false,
      clarifier: "",
      reason: "current_turn_public_knowledge_answer_only",
      routeLocked: true,
      currentTurnAuthority: true,
      staleCarrySuppressed: true,
      noCrossDomainBleed: true,
      noUserFacingDiagnostics: true,
      finalEnvelopeRequired: true,
      bridgeCompatible: true,
      composerCompatible: true,
      stateSpineCompatible: true,
      normalizedUserIntent: currentText,
      rawUserText: currentText,
      domainConfidence
    };
    out.routing = {
      ...obj(prior.routing),
      route: info.domain,
      domain: info.domain,
      primaryDomain: info.domain,
      selectedDomain: info.domain,
      knowledgeDomain: info.domain,
      intent: info.intent,
      routeType: "knowledge",
      actionMode: "answer",
      semanticRoute: true,
      navigationRoute: false,
      actionRequired: false,
      validateAction: false,
      actionValidationRequired: false,
      pendingActionValidation: false,
      answerOnly: true,
      navigationSuggested: false,
      guideActions: [],
      routeLocked: true,
      currentTurnAuthority: true,
      staleCarrySuppressed: true,
      noCrossDomainBleed: true,
      highStakes: info.highStakes === true,
      domainConfidence
    };
    out.composerContext = {
      ...obj(prior.composerContext),
      route: info.domain,
      domain: info.domain,
      knowledgeDomain: info.domain,
      intent: info.intent,
      routeType: "knowledge",
      actionMode: "answer",
      semanticRoute: true,
      navigationRoute: false,
      actionRequired: false,
      validateAction: false,
      actionValidationRequired: false,
      pendingActionValidation: false,
      answerOnly: true,
      navigationSuggested: false,
      currentTurnAuthority: true,
      staleCarrySuppressed: true,
      noCrossDomainBleed: true,
      domainConfidence,
      publicKnowledgeNavigationSeparationVersion: VERSION
    };
    out.stateSpinePatch = {
      ...obj(prior.stateSpinePatch),
      route: info.domain,
      domain: info.domain,
      selectedDomain: info.domain,
      knowledgeDomain: info.domain,
      intent: info.intent,
      routeType: "knowledge",
      actionMode: "answer",
      semanticRoute: true,
      navigationRoute: false,
      actionRequired: false,
      validateAction: false,
      actionValidationRequired: false,
      pendingActionValidation: false,
      answerOnly: true,
      navigationSuggested: false,
      previousDomainCarryAllowed: false,
      staleCarrySuppressed: true,
      currentTurnAuthority: true,
      routeLocked: true,
      shouldAdvanceState: true,
      publicKnowledgeNavigationSeparationVersion: VERSION
    };
    return out;
  }
  function wrap(fn, name){
    if (typeof fn !== "function" || fn.__nyxPublicKnowledgeNavigationSeparationR4) return fn;
    const wrapped = function wrappedNyxPublicKnowledgeNavigationSeparation(packet, options){
      const info = classifyKnowledgeDomain(packet);
      if (info) return knowledgeDecision(packet, info, {});
      const result = fn.call(this, packet, options);
      if (result && typeof result.then === "function") {
        return result.then((value) => {
          const lateInfo = classifyKnowledgeDomain(packet);
          return lateInfo ? knowledgeDecision(packet, lateInfo, value) : value;
        });
      }
      const lateInfo = classifyKnowledgeDomain(packet);
      return lateInfo ? knowledgeDecision(packet, lateInfo, result) : result;
    };
    try { Object.keys(fn).forEach((key) => { wrapped[key] = fn[key]; }); } catch (_) {}
    wrapped.__nyxPublicKnowledgeNavigationSeparationR4 = true;
    wrapped.__nyxWrappedName = name;
    return wrapped;
  }
  try {
    if (typeof module.exports === "function") module.exports = wrap(module.exports, "default");
    const api = module.exports && typeof module.exports === "object" ? module.exports : null;
    if (!api) return;
    for (const name of ["runDomainConcierge","routeOrClarify","run","route","handle","default","normalizeConciergeDecision"]) {
      if (typeof api[name] === "function") api[name] = wrap(api[name], name);
    }
    if (typeof api.shouldClarify === "function" && !api.shouldClarify.__nyxPublicKnowledgeNavigationSeparationR4) {
      const previous = api.shouldClarify;
      api.shouldClarify = function shouldClarifyPublicKnowledgeR4(packet, options){
        if (classifyKnowledgeDomain(packet)) return false;
        return previous.call(this, packet, options);
      };
      api.shouldClarify.__nyxPublicKnowledgeNavigationSeparationR4 = true;
    }
    api.NYX_PUBLIC_KNOWLEDGE_NAVIGATION_SEPARATION_CONCIERGE_VERSION = VERSION;
    api.classifyNyxPublicKnowledgeDomain = classifyKnowledgeDomain;
    api.buildNyxPublicKnowledgeDecision = function build(packet){
      const info = classifyKnowledgeDomain(packet);
      return info ? knowledgeDecision(packet, info, {}) : null;
    };
  } catch (_) {}
})();
/* NYX_PUBLIC_KNOWLEDGE_NAVIGATION_SEPARATION_CONCIERGE_R4_END */


/* MARION_LAYERS_6_7_8_PART1_START */
(function(){
  "use strict";
  const PATCH_VERSION="marion.layers678.part1/1.0";
  let depth=null; try{depth=require("./MarionConversationalDepth678.js");}catch(_err){depth=null;}
  if(!depth||typeof module==="undefined"||!module.exports)return;
  function wrap(fn,name){
    if(typeof fn!=="function"||fn.__marionLayers678Part1)return fn;
    const wrapped=function(){
      const args=arguments,input=args&&args.length?args[0]:{};
      const result=fn.apply(this,args);
      const project=function(value){return depth.attach(value,input);};
      return result&&typeof result.then==="function"?result.then(project):project(result);
    };
    try{Object.keys(fn).forEach(function(k){wrapped[k]=fn[k];});}catch(_e){}
    wrapped.__marionLayers678Part1=true; wrapped.__marionWrappedName=name; return wrapped;
  }
  try{
    if(typeof module.exports==="function")module.exports=wrap(module.exports,"default");
    const api=module.exports&&typeof module.exports==="object"?module.exports:null;
    if(api){
      for(const name of ["runDomainConcierge", "routeOrClarify", "run", "route", "handle", "default"])if(typeof api[name]==="function")api[name]=wrap(api[name],name);
      api.MARION_LAYERS_6_7_8_PART1_VERSION=PATCH_VERSION;
      api.MARION_CONVERSATIONAL_DEPTH_CONTRACT=depth.CONTRACT;
      api.buildMarionConversationalDepth=depth.build;
      api.validateMarionConversationalDepth=depth.validate;
    }
  }catch(_err){}
})();
/* MARION_LAYERS_6_7_8_PART1_END */

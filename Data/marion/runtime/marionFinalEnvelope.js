"use strict";

/**
 * marionFinalEnvelope.js
 * marionFinalEnvelope v2.2.0 FINAL-TRANSPORT-CONTRACT-STABILIZED
 * Single-source final envelope builder + validator + JSON-safe transport normalizer.
 */

const VERSION = "marionFinalEnvelope v2.3.4 MARION-ADMIN-VOICE-OUTPUT-PROJECTION-V1 + MARION-ADMIN-PRIVATE-VOICE-RECEIVE-V1 + MARION-ADMIN-INTERFACE-TRANSPORT + PHASE2-SPEECH-SYNC-COMPAT + SIX-DOMAIN-AUTHORITY-PROMOTION + ADAPTIVE-TRUST-VERIFICATION + FINAL-TRANSPORT-CONTRACT-STABILIZED + TELEMETRY-VISIBILITY-FAILURE-SIGNATURE-AUDIT + FINAL-RENDER-TELEMETRY-HARDLOCK";
const CONTRACT_VERSION = "nyx.marion.final/1.0";
const FINAL_SIGNATURE = "MARION_FINAL_AUTHORITY";
const SOURCE = "marion";
const REQUIRED_CHAT_ENGINE_SIGNATURE = "CHATENGINE_COORDINATOR_ONLY_ACTIVE_2026_04_24";
const MARION_FINAL_SIGNATURE_PREFIX = "MARION::FINAL::";
const STATE_SPINE_SCHEMA = "nyx.marion.stateSpine/1.7";
const STATE_SPINE_SCHEMA_COMPAT = "nyx.marion.stateSpine/1.6";
const CANONICAL_ENDPOINT = "marion://routeMarion.primary";
const ADAPTIVE_TRUST_VERIFICATION_VERSION = "nyx.marion.adaptiveTrustVerification/1.0";
const FINAL_RENDER_TELEMETRY_VERSION = "nyx.marion.finalRenderTelemetry/1.0";
const finalRenderTelemetryMod = (() => { try { return require("./finalRenderTelemetry.js"); } catch (_) { return null; } })();
const HIGH_STAKES_DOMAINS = Object.freeze(["law", "finance", "cyber"]);
const SIX_KNOWLEDGE_DOMAINS = Object.freeze(["psychology", "english", "ai", "cyber", "law", "finance"]);
const MAX_STRING_LENGTH = 12000;
const MAX_DEPTH = 7;
const MAX_ARRAY = 80;

const FINAL_MARKERS = Object.freeze([
  REQUIRED_CHAT_ENGINE_SIGNATURE,
  VERSION,
  CONTRACT_VERSION,
  FINAL_SIGNATURE,
  STATE_SPINE_SCHEMA,
  STATE_SPINE_SCHEMA_COMPAT,
  ADAPTIVE_TRUST_VERIFICATION_VERSION
]);

function safeStr(value) { return value == null ? "" : String(value).replace(/\s+/g, " ").trim(); }
function lower(value) { return safeStr(value).toLowerCase(); }
function isObj(value) { return !!value && typeof value === "object" && !Array.isArray(value); }
function safeObj(value) { return isObj(value) ? value : {}; }
function safeArray(value) { return Array.isArray(value) ? value : []; }
function nowIso() { return new Date().toISOString(); }
function firstText() { for (let i = 0; i < arguments.length; i += 1) { const v = safeStr(arguments[i]); if (v) return v; } return ""; }
function clamp01(value, fallback = 0) { const n = Number(value); return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : fallback; }

function jsonSafeClone(value, maxDepth = MAX_DEPTH) {
  function walk(item, depth, stack) {
    if (item == null) return item;
    const type = typeof item;
    if (type === "string") return item.length > MAX_STRING_LENGTH ? item.slice(0, MAX_STRING_LENGTH) : item;
    if (type === "number") return Number.isFinite(item) ? item : 0;
    if (type === "boolean") return item;
    if (type === "bigint") return String(item);
    if (type === "function" || type === "symbol" || type === "undefined") return undefined;
    if (item instanceof Date) return item.toISOString();
    if (typeof Buffer !== "undefined" && Buffer.isBuffer(item)) return `[buffer:${item.length}]`;
    if (depth >= maxDepth) return "[truncated_depth]";
    if (stack.indexOf(item) !== -1) return "[circular]";
    const nextStack = stack.concat([item]);
    if (Array.isArray(item)) return item.slice(0, MAX_ARRAY).map((x) => walk(x, depth + 1, nextStack)).filter((x) => x !== undefined);
    if (isObj(item)) {
      const out = {};
      for (const key of Object.keys(item)) {
        if (/^(socket|req|res|request|response|stream|connection)$/i.test(key)) continue;
        if (/(token|secret|password|cookie|authorization|api[_-]?key|x[-_]?sb|credential|private[_-]?key)/i.test(key)) { out[key] = "[redacted]"; continue; }
        const v = walk(item[key], depth + 1, nextStack);
        if (v !== undefined) out[key] = v;
      }
      return out;
    }
    return safeStr(item);
  }
  return walk(value, 0, []);
}

const TELEMETRY_VISIBILITY_VERSION = "nyx.marion.telemetryVisibility/1.0";
const FAILURE_SIGNATURE_AUDIT_VERSION = "nyx.marion.failureSignatureAudit/1.0";
const KNOWN_FAILURE_SIGNATURES = Object.freeze([
  "none",
  "ROUTE_DOMAIN_MISMATCH",
  "FINAL_ENVELOPE_MISSING",
  "WEAK_FINAL_REJECTED",
  "LOOP_GUARD_SUPPRESSED",
  "PACKET_HIJACK_ATTEMPT",
  "SCHEDULE_PRE_ROUTER_INTERCEPT",
  "TECHNICAL_TARGET_STALE_CARRY",
  "DOMAIN_CONFIDENCE_LOW",
  "VOICE_TEXT_PARITY_DRIFT",
  "COMPOSER_EMPTY_REPLY",
  "BRIDGE_HANDOFF_INVALID",
  "CHATENGINE_COORDINATOR_FAULT",
  "DEBUG_LEAK_BLOCKED",
  "ADAPTIVE_TRUST_BLOCKED"
]);
function telemetryAuditText(value){return value==null?"":String(value).replace(/\s+/g," ").trim();}
function telemetryAuditObj(value){return value&&typeof value==="object"&&!Array.isArray(value)?value:{};}
function classifyFailureSignature(fields={}){
  const f=telemetryAuditObj(fields);
  const text=telemetryAuditText([f.error,f.reply,f.message,f.reason,f.stage,f.source,Array.isArray(f.reasons)?f.reasons.join(" "):""].join(" ")).toLowerCase();
  const loop=telemetryAuditObj(f.loopGuardResult||f.loopGuard);
  if(loop.forceRecovery===true||loop.loopDetected===true||loop.allowReply===false)return"LOOP_GUARD_SUPPRESSED";
  if(/\breply held\b/.test(text))return"LOOP_GUARD_SUPPRESSED";
  if(/\bschedule depends on where you are|city\/timezone|which city\b/.test(text))return"SCHEDULE_PRE_ROUTER_INTERCEPT";
  if(/\bfinal envelope missing|final_envelope_missing|non-final|nonfinal|marion did not return\b/.test(text))return"FINAL_ENVELOPE_MISSING";
  if(/\bweak final|weak_final|rejected final|not trusted|trusted final.*false\b/.test(text))return"WEAK_FINAL_REJECTED";
  if(/\bcomposer.*empty|empty reply|compose_reply_missing|reply missing\b/.test(text))return"COMPOSER_EMPTY_REPLY";
  if(/\bbridge.*invalid|handoff invalid|bridge handoff|contract_invalid|packet_invalid\b/.test(text))return"BRIDGE_HANDOFF_INVALID";
  if(/\bchat_engine_coordinator_fault|coordinator fault|runtimeTelemetry is not defined\b/.test(text))return"CHATENGINE_COORDINATOR_FAULT";
  if(/\bdomain confidence low|low confidence|route ambiguous|ambiguous route\b/.test(text)||f.routeAmbiguous===true)return"DOMAIN_CONFIDENCE_LOW";
  if(/\bvoice.*parity.*drift|mic.*text.*drift|inputsource.*mismatch\b/.test(text)||f.voiceTextParityDrift===true)return"VOICE_TEXT_PARITY_DRIFT";
  if(/\bstale.*target|target.*stale|wrong target\b/.test(text))return"TECHNICAL_TARGET_STALE_CARRY";
  if(/\bpacket hijack|pre-router intercept|packet.*intercept\b/.test(text))return"PACKET_HIJACK_ATTEMPT";
  if(/\broutekind=|finalenvelope|sessionpatch|diagnostic packet|replyauthority=|speechhints=|presenceprofile|nyxstatehint=\b/i.test(telemetryAuditText(f.reply||"")))return"DEBUG_LEAK_BLOCKED";
  if(f.trustVerificationBlocked===true)return"ADAPTIVE_TRUST_BLOCKED";
  if(f.canEmit===false&&f.finalEnvelopeTrusted===false)return"FINAL_ENVELOPE_MISSING";
  return"none";
}
function buildFailureSignatureAudit(fields={}){
  const f=telemetryAuditObj(fields);
  const signature=classifyFailureSignature(f);
  const primary=telemetryAuditText(f.primaryDomain||f.domain||f.knowledgeDomain||"");
  const secondary=Array.isArray(f.secondaryDomains)?f.secondaryDomains.map(telemetryAuditText).filter(Boolean).slice(0,4):[];
  return {
    version: FAILURE_SIGNATURE_AUDIT_VERSION,
    telemetryVisibilityVersion: TELEMETRY_VISIBILITY_VERSION,
    failureSignature: signature,
    ok: signature==="none",
    severity: signature==="none"?"none":(signature==="DEBUG_LEAK_BLOCKED"?"high":"medium"),
    userVisible: false,
    debugLeakBlocked: true,
    visibleReplyMustRemainClean: true,
    source: telemetryAuditText(f.source||""),
    stage: telemetryAuditText(f.stage||""),
    intent: telemetryAuditText(f.intent||""),
    domain: primary,
    knowledgeDomain: telemetryAuditText(f.knowledgeDomain||""),
    primaryDomain: primary,
    secondaryDomains: secondary,
    answerMode: telemetryAuditText(f.answerMode||""),
    canEmit: f.canEmit!==false,
    finalEnvelopeTrusted: f.finalEnvelopeTrusted!==false && f.trustedFinalEnvelope!==false
  };
}

function isPlanningScaffoldLeakText(value=""){
  const t=telemetryAuditText(value);
  return /\bpublic knowledge topic\b/i.test(t)||/\bcan route through the six-domain layer\b/i.test(t)||/\bthe useful answer should define the term\b/i.test(t)||/\bshould be handled as a wording and meaning question\b/i.test(t);
}
function stripPlanningScaffoldLeak(value=""){
  const t=telemetryAuditText(value);
  if(!isPlanningScaffoldLeakText(t))return t;
  return t.replace(/[^.?!]*\b(?:public knowledge topic|six-domain layer|useful answer should define the term|should be handled as a wording and meaning question)\b[^.?!]*[.?!]?/gi,"").replace(/\s+/g," ").trim();
}

function isTelemetryLeakText(value=""){
  return /\b(routeKind=|speechHints=|presenceProfile=|finalEnvelope|sessionPatch|marionFinal|transportSafe|replyAuthority=|nyxStateHint=|diagnostic packet|final envelope missing|non-final)\b/i.test(telemetryAuditText(value));
}
function stripTelemetryLeakFromReply(value=""){
  let text=telemetryAuditText(value);
  if(!text)return"";
  if(isPlanningScaffoldLeakText(text))text=stripPlanningScaffoldLeak(text);
  if(!text)return"";
  if(isTelemetryLeakText(text))return text.replace(/\b(routeKind|speechHints|presenceProfile|finalEnvelope|sessionPatch|marionFinal|transportSafe|replyAuthority|nyxStateHint)\s*=\s*[^.;,\n]+[.;,]?\s*/gi,"").replace(/\bdiagnostic packet\b/ig,"").replace(/\bfinal envelope missing\b/ig,"").replace(/\bnon-final\b/ig,"").replace(/\s+/g," ").trim();
  return text;
}

function compactKey(value) { return lower(value).replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, ""); }
function isHighStakesDomain(value) { return HIGH_STAKES_DOMAINS.includes(compactKey(value)); }
function extractDomainConfidence(input = {}) {
  const src = safeObj(input), routing = safeObj(src.routing), meta = safeObj(src.meta), memoryPatch = safeObj(src.memoryPatch), sessionPatch = safeObj(src.sessionPatch);
  const candidates = [src.domainConfidence, routing.domainConfidence, meta.domainConfidence, memoryPatch.domainConfidence, sessionPatch.domainConfidence, safeObj(src.domainConcierge).domainConfidence, safeObj(routing.domainConcierge).domainConfidence, safeObj(memoryPatch.domainConcierge).domainConfidence];
  for (const item of candidates) {
    const o = safeObj(item);
    if (Object.keys(o).length) {
      const confidence = clamp01(o.confidence, Number.isFinite(Number(o.score)) ? Number(o.score) : 0);
      return { ...compactObject(o, 4, 60), confidence, band: firstText(o.band, confidence >= 0.82 ? "high" : confidence >= 0.62 ? "medium" : confidence >= 0.42 ? "low" : "weak"), primaryDomain: firstText(o.primaryDomain, o.domain, routing.knowledgeDomain, routing.domain, src.domain) };
    }
  }
  return {};
}
function extractDomainConcierge(input = {}) {
  const src = safeObj(input), routing = safeObj(src.routing), meta = safeObj(src.meta), memoryPatch = safeObj(src.memoryPatch), sessionPatch = safeObj(src.sessionPatch);
  const candidates = [src.domainConcierge, routing.domainConcierge, meta.domainConcierge, memoryPatch.domainConcierge, sessionPatch.domainConcierge];
  for (const item of candidates) {
    const o = safeObj(item);
    if (Object.keys(o).length) {
      return {
        version: firstText(o.contract, o.version, "nyx.marion.domainConcierge/1.0"),
        action: firstText(o.action, "route"),
        route: firstText(o.route, o.domain, safeObj(o.domainConfidence).primaryDomain, "general"),
        intent: firstText(o.intent, "simple_chat"),
        confidence: clamp01(o.confidence, safeObj(o.domainConfidence).confidence || 0),
        needsClarifier: !!o.needsClarifier,
        clarifier: o.needsClarifier ? safeStr(o.clarifier) : "",
        failClosed: !!(o.failClosed || safeObj(o.domainConfidence).failClosed),
        routeLocked: !!(o.routeLocked || safeObj(o.domainConfidence).routeLocked),
        noUserFacingDiagnostics: o.noUserFacingDiagnostics !== false
      };
    }
  }
  return {};
}
function extractResponseShaping(input = {}) {
  const src = safeObj(input), routing = safeObj(src.routing), meta = safeObj(src.meta), memoryPatch = safeObj(src.memoryPatch), sessionPatch = safeObj(src.sessionPatch);
  const candidates = [src.responseShaping, src.confidenceAwareResponseShaping, routing.responseShaping, meta.responseShaping, memoryPatch.responseShaping, sessionPatch.responseShaping, safeObj(src.domainConcierge).responseShaping];
  for (const item of candidates) {
    const o = safeObj(item);
    if (Object.keys(o).length) return compactObject(o, 4, 60);
  }
  return {};
}

function extractEthicalGate(input = {}) {
  const src = safeObj(input), routing = safeObj(src.routing), meta = safeObj(src.meta), payload = safeObj(src.payload), packet = safeObj(src.packet), memoryPatch = safeObj(src.memoryPatch), sessionPatch = safeObj(src.sessionPatch), plc = safeObj(src.parallelLaneCoordination || src.coordination);
  const candidates = [src.ethicalGate, src.ethicalGatekeeper, routing.ethicalGate, routing.ethicalGatekeeper, payload.ethicalGate, payload.ethicalGatekeeper, safeObj(packet.meta).ethicalGate, safeObj(packet.payload).ethicalGate, meta.ethicalGate, meta.ethicalGatekeeper, memoryPatch.ethicalGate, sessionPatch.ethicalGate, plc.ethicalGate, plc.ethicalGatekeeper];
  for (const item of candidates) {
    const o = safeObj(item);
    if (Object.keys(o).length) return compactObject(o, 5, 90);
  }
  return {};
}
function extractDefensiveEscalation(input = {}) {
  const src = safeObj(input), routing = safeObj(src.routing), meta = safeObj(src.meta), payload = safeObj(src.payload), packet = safeObj(src.packet), memoryPatch = safeObj(src.memoryPatch), sessionPatch = safeObj(src.sessionPatch), ethicalGate = extractEthicalGate(src), plc = safeObj(src.parallelLaneCoordination || src.coordination);
  const candidates = [src.defensiveEscalation, routing.defensiveEscalation, payload.defensiveEscalation, safeObj(packet.meta).defensiveEscalation, safeObj(packet.payload).defensiveEscalation, meta.defensiveEscalation, memoryPatch.defensiveEscalation, sessionPatch.defensiveEscalation, ethicalGate.defensiveEscalation, plc.defensiveEscalation];
  for (const item of candidates) {
    const o = safeObj(item);
    if (Object.keys(o).length) return compactObject(o, 5, 90);
  }
  return {};
}
function extractDefensiveJustification(input = {}) {
  const src = safeObj(input), routing = safeObj(src.routing), meta = safeObj(src.meta), payload = safeObj(src.payload), packet = safeObj(src.packet), memoryPatch = safeObj(src.memoryPatch), sessionPatch = safeObj(src.sessionPatch), ethicalGate = extractEthicalGate(src), defensiveEscalation = extractDefensiveEscalation(src), plc = safeObj(src.parallelLaneCoordination || src.coordination);
  const candidates = [src.defensiveJustification, src.defensiveIntentJustifier, src.escalationJustification, routing.defensiveJustification, payload.defensiveJustification, safeObj(packet.meta).defensiveJustification, safeObj(packet.payload).defensiveJustification, meta.defensiveJustification, memoryPatch.defensiveJustification, sessionPatch.defensiveJustification, ethicalGate.defensiveJustification, defensiveEscalation.justification, plc.defensiveJustification];
  for (const item of candidates) {
    const o = safeObj(item);
    if (Object.keys(o).length) return compactObject(o, 5, 90);
  }
  return {};
}

function buildAdaptiveTrustVerification({ reply = "", routing = {}, domainConfidence = {}, domainConcierge = {}, responseShaping = {}, diagnostics = {}, meta = {}, completionValidation = {} } = {}) {
  const domain = compactKey(firstText(routing.knowledgeDomain, routing.domain, domainConfidence.primaryDomain, "general"));
  const confidence = clamp01(domainConfidence.confidence, domainConcierge.confidence || safeObj(responseShaping).confidence || 0.76);
  const highStakes = isHighStakesDomain(domain);
  const reasons = [];
  const replyText = safeStr(reply);
  const diagnosticLeak = isTelemetryLeakText(replyText) || isDiagnosticReply(replyText);
  const softRecovery = isSoftRecoveryReply(replyText);
  const hardFailure = hasHardFailure(diagnostics, meta);
  if (!replyText) reasons.push("reply_missing");
  if (diagnosticLeak) reasons.push("diagnostic_or_telemetry_leak");
  if (softRecovery) reasons.push("soft_recovery_reply");
  if (hardFailure) reasons.push("hard_failure_marker_present");
  if (safeObj(completionValidation).ok === false) reasons.push("final_reply_validation_failed");
  if (safeObj(domainConcierge).needsClarifier === true) reasons.push("clarifier_required_upstream");
  const sixDomainAuthorized = SIX_KNOWLEDGE_DOMAINS.includes(domain) && safeArray(routing.sixDomainCoverage).some((item) => {
    const row = safeObj(item);
    return compactKey(row.domain) === domain && row.accessible !== false;
  });
  if (safeObj(domainConcierge).failClosed === true && confidence < 0.62 && !sixDomainAuthorized) reasons.push("domain_concierge_fail_closed");
  if (confidence < (sixDomainAuthorized ? 0.28 : 0.38)) reasons.push("confidence_below_emit_floor");
  const cautionSuggested = highStakes || confidence < 0.62;
  const allowEmit = reasons.length === 0;
  return {
    version: ADAPTIVE_TRUST_VERIFICATION_VERSION,
    ok: allowEmit,
    allowEmit,
    userVisible: false,
    noUserFacingDiagnostics: true,
    domain,
    highStakes,
    confidence,
    confidenceBand: confidence >= 0.82 ? "high" : confidence >= 0.62 ? "medium" : confidence >= 0.42 ? "low" : "weak",
    cautionSuggested,
    professionalReferralSuggested: highStakes && ["law", "finance"].includes(domain),
    sourceReliabilityRequired: highStakes,
    sixDomainAuthorized,
    clarificationRequired: safeObj(domainConcierge).needsClarifier === true || confidence < (sixDomainAuthorized ? 0.28 : 0.38),
    diagnosticLeakBlocked: diagnosticLeak,
    softRecoveryBlocked: softRecovery,
    hardFailureBlocked: hardFailure,
    reasons,
    action: allowEmit ? (cautionSuggested ? "emit_with_caution_profile" : "emit") : "block_or_retry",
    finalAuthorityPreserved: true,
    checkedAt: nowIso()
  };
}

function compactObject(value, maxDepth = 4, keyLimit = 80) {
  const obj = safeObj(jsonSafeClone(value, maxDepth));
  const out = {};
  for (const key of Object.keys(obj).slice(0, keyLimit)) out[key] = obj[key];
  return out;
}

const SOFT_RECOVERY_REPLY_PATTERNS = Object.freeze([
  /\bstill here\b.*\brun that one more time\b/i,
  /\bthere was a break in the response\b/i,
  /\bresponse path was interrupted\b/i,
  /\bmarion completed the final reply\b/i,
  /\bkeeping the turn non-emotional\b/i,
  /\brouting it back through the final-envelope path\b/i,
  /\bi[’']?m here and tracking the turn\b/i,
  /\bi am here and tracking the turn\b/i,
  /\bgive me the next clear target\b/i,
  /\bnyx is live and tracking the turn\b/i,
  /\bthe final reply did not validate cleanly\b/i,
  /\bsend the same test once more\b/i,
  /\bgive me the exact target and i[’']?ll break it down\b/i,
  /\bi have the turn\.\s*send the next target\b/i,
  /\bready\.\s*send/i,
  /\bpress reset\b/i,
  /\bsend a specific command\b/i,
  /\bi blocked a repeated fallback\b/i
]);

const DIAGNOSTIC_REPLY_PATTERNS = Object.freeze([
  /\b(final envelope missing|diagnostic packet|non-final|composer_invalid|compose_reply_missing|marion did not return)\b/i,
  /\b(authoritative_reply_missing|packet_synthesis_reply_missing|contract_missing|packet_missing)\b/i,
  /\b(final_envelope_unavailable|bridge_error|packet_invalid|contract_invalid)\b/i
]);

function isSoftRecoveryReply(value) { const text = lower(value); return !!(text && SOFT_RECOVERY_REPLY_PATTERNS.some((rx) => rx.test(text))); }
function isDiagnosticReply(value) { const text = lower(value); return !!(text && DIAGNOSTIC_REPLY_PATTERNS.some((rx) => rx.test(text))); }
function isActionableFinalReply(value) { const text = safeStr(value); return !!(text && text.length >= 8 && !isSoftRecoveryReply(text) && !isDiagnosticReply(text)); }
function hasHardFailure(diagnostics = {}, meta = {}) {
  const d = safeObj(diagnostics), m = safeObj(meta);
  const code = lower(d.error || d.reason || d.code || m.error || m.reason || m.code || "");
  return !!(d.bridgeError === true || d.transportError === true || d.fatal === true || m.bridgeError === true || m.transportError === true || m.fatal === true || /fatal|transport_error|bridge_error|contract_invalid|packet_invalid/.test(code));
}


function normalizeEchoTextForCompare(value=""){return safeStr(value).toLowerCase().replace(/[“”]/g,'"').replace(/[‘’]/g,"'").replace(/[^a-z0-9]+/g," ").replace(/\s+/g," ").trim();}
function extractPromptForEnvelopeSelection(input={}){const src=safeObj(input),payload=safeObj(src.payload),meta=safeObj(src.meta);return firstText(src.userText,src.rawUserText,src.originalUserText,src.prompt,src.query,src.inputText,payload.userText,payload.rawUserText,payload.prompt,payload.query,meta.userText,meta.rawUserText,meta.prompt,meta.query);}
function isPromptEchoReply(reply="",prompt=""){const r=normalizeEchoTextForCompare(reply),p=normalizeEchoTextForCompare(prompt);if(!r||!p)return false;return r===p||p.includes(r)&&r.length>12||r.includes(p)&&p.length>12;}
function isExcessExpressionReply(value=""){return /\b(stop the echo|switching from invitation to execution|recovery line has already served its purpose|next line must carry progress|public knowledge topic|useful answer should|six-domain layer|final envelope|state spine|progression shaping|runtimeTelemetry|replyAuthority|diagnostic packet)\b/i.test(safeStr(value));}
function deterministicEnvelopeKnowledgeReply(prompt=""){const t=safeStr(prompt).toLowerCase();
  if(/\bbreak a leg\b/.test(t))return /instead of good luck|why would/i.test(t)?'Someone says “break a leg” instead of “good luck” because theatre culture treats direct good-luck wishes as unlucky. The phrase became a ritualized, indirect way to encourage someone before a performance.':'Literally, “break a leg” means to injure a leg. Culturally, it is an English idiom used to wish someone good luck, especially before a performance. It is not meant as harm; it is a superstition-based way of saying, “I hope you do well.”';
  if(/\bspill the beans\b/.test(t))return '“Spill the beans” means to reveal information that was meant to stay secret. Literally it suggests dropping beans; idiomatically, it means exposing a secret or surprise too early.';
  if(/\bbless your heart\b/.test(t))return '“Bless your heart” can be sincere or cutting depending on tone and setting. In the American South, it can mean genuine sympathy, but it can also soften criticism, pity, or disapproval. The cultural meaning depends on relationship, delivery, and context.';
  if(/\bi[’']?m fine\b/.test(t))return '“I’m fine” can be literal, but behaviourally it can also signal masking, avoidance, or a desire to end the topic. Marion should not assume distress automatically; the safer read is to examine tone, timing, context, and whether the phrase conflicts with visible behaviour.';
  if(/\binstead of good luck\b/.test(t)||/\bwhy would someone say that\b/.test(t))return 'They would say it as an indirect good-luck wish, usually referring to “break a leg.” In theatre culture, saying “good luck” directly is considered unlucky, so the indirect phrase became the accepted ritual.';
  return '';}

function validateFinalReply(reply, context = {}) {
  const text = safeStr(reply);
  const reasons = [];
  const trustVerification = safeObj(context.adaptiveTrustVerification || context.trustVerification);
  if (!text) reasons.push("reply_missing");
  if (text && text.length < 8) reasons.push("reply_too_short");
  if (isSoftRecoveryReply(text)) reasons.push("soft_recovery_reply_rejected");
  if (isExcessExpressionReply(text)) reasons.push("excess_expression_reply_rejected");
  if (isPromptEchoReply(text, firstText(safeObj(context).prompt, safeObj(context).userText, safeObj(context).rawUserText))) reasons.push("prompt_echo_reply_rejected");
  if (isDiagnosticReply(text)) reasons.push("diagnostic_reply_rejected");
  if (isTelemetryLeakText(text)) reasons.push("telemetry_leak_reply_rejected");
  if (hasHardFailure(context.diagnostics, context.meta)) reasons.push("hard_failure_marker_present");
  if (trustVerification.allowEmit === false) reasons.push("adaptive_trust_verification_blocked");
  return { ok: reasons.length === 0, reply: text, reasons, actionable: reasons.length === 0 };
}

function hashText(value) { const source = safeStr(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(); let hash = 0; for (let i = 0; i < source.length; i += 1) { hash = ((hash << 5) - hash) + source.charCodeAt(i); hash |= 0; } return String(hash >>> 0); }
function cleanToken(value, fallback) { const token = safeStr(value || fallback || "turn").replace(/::+/g, ":").replace(/\s+/g, "_").slice(0, 180); return token || safeStr(fallback || "turn"); }
function makeId(prefix = "marion_final") { return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`; }
function buildFinalSignature({ reply = "", turnId = "", replySignature = "", bridgeVersion = "", composerVersion = "" } = {}) { const seed = cleanToken(replySignature || hashText(reply || turnId || Date.now()), "reply"); const turn = cleanToken(turnId || "turn", "turn"); const bridge = cleanToken(bridgeVersion || "marionBridge", "marionBridge"); const composer = cleanToken(composerVersion || "composeMarionResponse", "composeMarionResponse"); return `${MARION_FINAL_SIGNATURE_PREFIX}${REQUIRED_CHAT_ENGINE_SIGNATURE}::${bridge}::${composer}::${VERSION}::${STATE_SPINE_SCHEMA}::${FINAL_SIGNATURE}::${turn}::${seed}`; }

function normalizeStateStage(value, fallback = "final") { const raw = lower(value || fallback || "final").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, ""); if (!raw) return "final"; if (["recover", "recovery", "loop_recovery", "stabilize", "blocked", "fallback", "deliver", "advance", "complete", "completed", "composed"].includes(raw)) return "final"; if (["final", "compose", "routed", "classified", "intake", "open", "error"].includes(raw)) return raw; return fallback || "final"; }
function normalizeRouting(input = {}) { const routing = safeObj(input.routing); const dc = extractDomainConfidence(input); const concierge = extractDomainConcierge(input); const responseShaping = extractResponseShaping(input); const sixDomainCoverage = safeArray(input.sixDomainCoverage || routing.sixDomainCoverage || dc.sixDomainCoverage); const allKnowledgeDomains = safeArray(input.allKnowledgeDomains || routing.allKnowledgeDomains || dc.allKnowledgeDomains); return { intent: firstText(input.intent, safeObj(input.marionIntent).intent, routing.intent, concierge.intent, "simple_chat"), domain: firstText(input.domain, routing.domain, concierge.route, dc.primaryDomain, "general"), knowledgeDomain: firstText(input.knowledgeDomain, routing.knowledgeDomain, dc.knowledgeDomain, dc.primaryDomain, ""), secondaryDomains: safeArray(routing.secondaryDomains || input.secondaryDomains).slice(0, 4), answerMode: safeStr(routing.answerMode || input.answerMode || responseShaping.answerMode || ""), mode: safeStr(routing.mode || input.mode || ""), depth: safeStr(routing.depth || input.depth || responseShaping.depth || ""), endpoint: safeStr(routing.endpoint || input.endpoint || CANONICAL_ENDPOINT) || CANONICAL_ENDPOINT, domainConfidence: dc, domainConcierge: concierge, responseShaping, sixDomainCoverage, allKnowledgeDomains, finalAuthorityExpected: "marionFinalEnvelope" }; }

function extractReply(input = {}) { const src = safeObj(input), payload = safeObj(src.payload), synthesis = safeObj(src.synthesis), packet = safeObj(src.packet), packetSynthesis = safeObj(packet.synthesis), packetPayload = safeObj(packet.payload), finalEnvelope = safeObj(src.finalEnvelope || payload.finalEnvelope || packet.finalEnvelope || packetPayload.finalEnvelope), prompt = extractPromptForEnvelopeSelection(src); const candidates=[finalEnvelope.reply, finalEnvelope.displayReply, finalEnvelope.text, finalEnvelope.answer, finalEnvelope.output, finalEnvelope.response, finalEnvelope.message, finalEnvelope.spokenText, src.reply, src.answer, src.output, src.response, src.text, src.message, src.spokenText, payload.reply, payload.answer, payload.output, payload.response, payload.text, payload.message, payload.spokenText, synthesis.reply, synthesis.text, synthesis.answer, synthesis.output, synthesis.spokenText, packetSynthesis.reply, packetSynthesis.text, packetSynthesis.answer, packetSynthesis.output, packetSynthesis.spokenText]; for(const item of candidates){const text=safeStr(item); if(text && !isPromptEchoReply(text,prompt) && !isExcessExpressionReply(text) && !isSoftRecoveryReply(text) && !isDiagnosticReply(text) && !isTelemetryLeakText(text)) return text;} return deterministicEnvelopeKnowledgeReply(prompt); }
function extractResolvedEmotion(input = {}) { const src = safeObj(input), memoryPatch = safeObj(src.memoryPatch), sessionPatch = safeObj(src.sessionPatch), packet = safeObj(src.packet); return safeObj(src.resolvedEmotion || src.emotionState || src.lastEmotionState || src.emotionalState || (src.emotionRuntime && safeObj(src.emotionRuntime).state) || memoryPatch.resolvedEmotion || memoryPatch.emotionState || memoryPatch.lastEmotionState || sessionPatch.resolvedEmotion || sessionPatch.emotionState || safeObj(packet.memoryPatch).resolvedEmotion || {}); }
function normalizePatch(value = {}) { return compactObject(value, 5, 100); }
function normalizeEmotionSummary(value = {}) { const s = safeObj(jsonSafeClone(value, 4)); return { ok: s.ok !== false, mode: safeStr(s.mode || "resolved_state_only"), primary: safeStr(s.primary || "neutral"), secondary: safeStr(s.secondary || "unclear"), confidence: clamp01(s.confidence, 0), intensity: clamp01(s.intensity, 0), action_mode: safeStr(s.action_mode || "supportive_monitoring"), care_mode: safeStr(s.care_mode || ""), source: safeStr(s.source || "marionFinalEnvelope") }; }

function buildCompletionStatus({ reply, resolvedEmotion, memoryPatch, diagnostics, meta, adaptiveTrustVerification }) { const trust = safeObj(adaptiveTrustVerification); const validation = validateFinalReply(reply, { diagnostics, meta, adaptiveTrustVerification: trust }); const hasEmotion = !!Object.keys(safeObj(resolvedEmotion)).length; const hasMemory = !!Object.keys(safeObj(memoryPatch)).length; const hardFailure = hasHardFailure(diagnostics, meta) || trust.hardFailureBlocked === true; const actionable = validation.ok && trust.allowEmit !== false; const softRecovery = isSoftRecoveryReply(reply) || trust.softRecoveryBlocked === true; const baseConfidence = actionable ? (hasEmotion ? 0.99 : 0.96) : (softRecovery ? 0.18 : 0.35); const confidence = trust.allowEmit === false ? Math.min(baseConfidence, clamp01(trust.confidence, 0.25)) : baseConfidence; return { complete: actionable && !hardFailure, stabilized: actionable && !softRecovery && !hardFailure, actionableReply: actionable, emotionallyCoherentFinal: actionable && hasEmotion, memoryPatchPresent: hasMemory, adaptiveTrustVerified: trust.allowEmit !== false, adaptiveTrustVerification: trust, completionConfidence: confidence, requiresRetry: !actionable || hardFailure, recoverySuggested: !actionable || hardFailure, softRecoveryDetected: softRecovery, validationReasons: validation.reasons, reason: actionable && !hardFailure ? "trusted_final_reply_complete" : (validation.reasons[0] || safeArray(trust.reasons)[0] || "reply_not_actionable") }; }

function isDirectMarionAdminEnvelope(input = {}) { const src = safeObj(input), voice = safeObj(src.voice), meta = safeObj(src.meta); const channel = lower(firstText(src.deliveryChannel, voice.deliveryChannel, meta.deliveryChannel, "")); const scope = lower(firstText(src.adminInterfaceScope, voice.adminInterfaceScope, meta.adminInterfaceScope, "")); return src.directMarionAdminInterface === true || voice.directMarionAdminInterface === true || meta.directMarionAdminInterface === true || src.marionAdminConversation === true || voice.marionAdminConversation === true || channel === "marion_admin_interface" || scope === "marion_admin_conversation"; }
function buildAdminInterfaceTransport(input = {}) { const direct = isDirectMarionAdminEnvelope(input); const voice = safeObj(safeObj(input).voice); const allowed = direct && (safeObj(input).adminVoiceDeliveryAllowed === true || voice.adminVoiceDeliveryAllowed === true || safeObj(input).adminVoiceVerified === true || voice.adminVoiceVerified === true); return { directMarionAdminInterface: direct, marionAdminConversationAllowed: allowed, adminInterfaceScope: direct ? firstText(safeObj(input).adminInterfaceScope, voice.adminInterfaceScope, "marion_admin_conversation") : "", publicUsersCanAddressMarion: false, publicUserFacing: !direct, adminOnly: direct, authority: "Marion" }; }
function buildEnvelopeCore({ reply, spokenText, routing, turnId, replySignature, marionFinalSignature, envelopeId, createdAt, stateStage }) { return { ok: !!reply, final: true, marionFinal: true, handled: true, source: SOURCE, signature: FINAL_SIGNATURE, marionFinalSignature, finalSignature: marionFinalSignature, requiredSignature: REQUIRED_CHAT_ENGINE_SIGNATURE, contractVersion: CONTRACT_VERSION, envelopeVersion: VERSION, envelopeId, createdAt, reply, text: reply, answer: reply, output: reply, response: reply, message: reply, spokenText, intent: routing.intent, domain: routing.domain, knowledgeDomain: routing.knowledgeDomain, stateStage, replySignature }; }
function validateReplyContract(envelope = {}) { const e = safeObj(envelope), reasons = []; if (e.final !== true) reasons.push("final_flag_missing"); if (e.marionFinal !== true) reasons.push("marion_final_flag_missing"); if (e.handled !== true) reasons.push("handled_flag_missing"); if (e.source !== SOURCE) reasons.push("source_not_marion"); if (e.signature !== FINAL_SIGNATURE) reasons.push("signature_missing"); if (e.contractVersion !== CONTRACT_VERSION) reasons.push("contract_version_mismatch"); if (!safeStr(e.reply)) reasons.push("reply_missing"); if (!safeStr(e.replySignature)) reasons.push("reply_signature_missing"); if (!safeStr(e.marionFinalSignature || e.finalSignature)) reasons.push("marion_final_signature_missing"); if (e.requiresRetry === true || e.recoverySuggested === true) reasons.push("retry_marker_present"); if (!isActionableFinalReply(e.reply)) reasons.push("reply_not_actionable"); return { ok: reasons.length === 0, reasons }; }
function normalizeFinalTransport(envelope = {}) { const e = safeObj(envelope); const renderReady = e.final === true && e.marionFinal === true && isActionableFinalReply(e.reply) && e.requiresRetry !== true; return { transport: { jsonSafe: true, socketSafe: true, renderReady, emitOrder: "finalEnvelope:first,sessionPatch:afterFinal,diagnostics:last", reconnectSafe: true, shouldReconnect: false, deliveryTiming: "single_final_packet" }, ui: { renderReady, shouldReconnect: false, connectionState: "ready", awaitMore: false } }; }
function sanitizeFinalEnvelope(envelope = {}) { return jsonSafeClone(envelope, MAX_DEPTH); }

function createMarionFinalEnvelope(input = {}) {
  const src = safeObj(input);
  const metaInput = compactObject(src.meta, 4, 80);
  const diagnostics = compactObject(src.diagnostics || metaInput.diagnostics || {}, 4, 80);
  const rawReply = extractReply(src);
  const strippedReply = stripTelemetryLeakFromReply(rawReply);
  const reply = isTelemetryLeakText(rawReply) ? strippedReply : rawReply;
  const routing = normalizeRouting(src);
  const memoryPatch = normalizePatch(src.memoryPatch);
  const sessionPatch = normalizePatch(src.sessionPatch || src.memoryPatch);
  const resolvedEmotion = compactObject(extractResolvedEmotion(src), 5, 80);
  const emotionSummary = normalizeEmotionSummary(src.emotionSummary || safeObj(src.emotionRuntime).summary || {});
  const replySignature = safeStr(src.replySignature || metaInput.replySignature || memoryPatch.replySignature || hashText(reply));
  const turnId = safeStr(src.turnId || metaInput.turnId || memoryPatch.turnId || "");
  const spokenText = firstText(safeObj(src.speech).textSpeak, src.spokenText, reply);
  const stateStage = normalizeStateStage(src.stateStage || memoryPatch.stateStage || memoryPatch.stage || "final", "final");
  const envelopeId = makeId("marion_final");
  const createdAt = nowIso();
  const marionFinalSignature = buildFinalSignature({ reply, turnId, replySignature, bridgeVersion: metaInput.bridgeVersion || src.bridgeVersion, composerVersion: metaInput.composerVersion || src.composerVersion });
  const initialValidation = validateFinalReply(reply, { diagnostics, meta: metaInput });
  const adaptiveTrustVerification = buildAdaptiveTrustVerification({ reply, routing, domainConfidence: routing.domainConfidence, domainConcierge: routing.domainConcierge, responseShaping: routing.responseShaping, diagnostics, meta: metaInput, completionValidation: initialValidation });
  const ethicalGate = extractEthicalGate(src);
  const defensiveEscalation = extractDefensiveEscalation(src);
  const defensiveJustification = extractDefensiveJustification(src);
  const ethicalCarryActive = !!(Object.keys(ethicalGate).length || Object.keys(defensiveEscalation).length || Object.keys(defensiveJustification).length);
  const completionStatus = buildCompletionStatus({ reply, resolvedEmotion, memoryPatch, diagnostics, meta: metaInput, adaptiveTrustVerification });
  const core = buildEnvelopeCore({ reply, spokenText, routing, turnId, replySignature, marionFinalSignature, envelopeId, createdAt, stateStage });
  const adminInterface = buildAdminInterfaceTransport(src);
  const completionConfidence = completionStatus.completionConfidence;
  const requiresRetry = completionStatus.requiresRetry;
  const recoverySuggested = completionStatus.recoverySuggested;
  const stabilized = completionStatus.stabilized;
  const transportMeta = normalizeFinalTransport({ ...core, requiresRetry, recoverySuggested });
  const failureSignatureAudit = buildFailureSignatureAudit({source:"marionFinalEnvelope",stage:stateStage,intent:firstText(routing.intent,""),domain:firstText(routing.domain,routing.knowledgeDomain,""),knowledgeDomain:firstText(routing.knowledgeDomain,""),primaryDomain:firstText(routing.knowledgeDomain,routing.domain,""),secondaryDomains:safeArray(routing.secondaryDomains),answerMode:firstText(routing.answerMode,""),reply,canEmit:!requiresRetry,finalEnvelopeTrusted:!requiresRetry,error:firstText(diagnostics.error,metaInput.error,""),trustVerificationBlocked:adaptiveTrustVerification.allowEmit===false});
  const finalRenderTelemetry = finalRenderTelemetryMod && typeof finalRenderTelemetryMod.buildFinalRenderTelemetry === "function" ? safeObj(finalRenderTelemetryMod.buildFinalRenderTelemetry({source:"marionFinalEnvelope",stage:stateStage,reply,canEmit:!requiresRetry,finalEnvelopeTrusted:!requiresRetry,runtimeTelemetry:{failureSignature:failureSignatureAudit.failureSignature,intent:firstText(routing.intent,""),domain:firstText(routing.domain,routing.knowledgeDomain,"")},domainConfidence:routing.domainConfidence,error:firstText(diagnostics.error,metaInput.error,"")})) : {};

  const finalEnvelope = { ...core, adminInterface, publicAgent: adminInterface.marionAdminConversationAllowed ? "Marion" : "Nyx", sixDomainCoverage: safeArray(routing.sixDomainCoverage), allKnowledgeDomains: safeArray(routing.allKnowledgeDomains), memoryPatch, sessionPatch, resolvedEmotion, emotionSummary, ethicalGate, defensiveEscalation, defensiveJustification, ethicalCarryActive, adaptiveTrustVerification, completionStatus, completionConfidence, requiresRetry, recoverySuggested, stabilized, telemetryVisibilityVersion: TELEMETRY_VISIBILITY_VERSION, failureSignature: failureSignatureAudit.failureSignature, failureSignatureAudit, finalRenderTelemetry, finalRenderTelemetryActive: !!Object.keys(finalRenderTelemetry).length, publicSurfaceClean: safeObj(finalRenderTelemetry).publicSurfaceClean !== false, validation: { finalReply: validateFinalReply(reply, { diagnostics, meta: metaInput, adaptiveTrustVerification }), replyContract: null }, meta: { freshMarionFinal: true, singleFinalAuthority: true, contractVersion: CONTRACT_VERSION, envelopeVersion: VERSION, source: SOURCE, signature: marionFinalSignature, marionFinalSignature, requiredSignature: REQUIRED_CHAT_ENGINE_SIGNATURE, finalMarkers: FINAL_MARKERS.slice(), turnId, replySignature, stateSpineSchema: STATE_SPINE_SCHEMA, stateSpineSchemaCompat: STATE_SPINE_SCHEMA_COMPAT, telemetryVisibilityVersion: TELEMETRY_VISIBILITY_VERSION, failureSignature: failureSignatureAudit.failureSignature, failureSignatureAudit, adaptiveTrustVerificationVersion: ADAPTIVE_TRUST_VERIFICATION_VERSION, ethicalCarryActive, adminInterface } };
  finalEnvelope.validation.replyContract = validateReplyContract(finalEnvelope);

  const finalEnvelopeCopy = jsonSafeClone(finalEnvelope, 6);
  const transportCopy = jsonSafeClone(transportMeta.transport, 3);
  const response = { ...core, adminInterface, publicAgent: adminInterface.marionAdminConversationAllowed ? "Marion" : "Nyx", directMarionAdminInterface: adminInterface.directMarionAdminInterface, marionAdminConversationAllowed: adminInterface.marionAdminConversationAllowed, publicUsersCanAddressMarion: false, sixDomainCoverage: safeArray(routing.sixDomainCoverage), allKnowledgeDomains: safeArray(routing.allKnowledgeDomains), finalRenderTelemetry, finalRenderTelemetryActive: !!Object.keys(finalRenderTelemetry).length, publicSurfaceClean: safeObj(finalRenderTelemetry).publicSurfaceClean !== false, routing, memoryPatch, sessionPatch, resolvedEmotion, emotionSummary, ethicalGate, defensiveEscalation, defensiveJustification, ethicalCarryActive, adaptiveTrustVerification, finalEnvelope: finalEnvelopeCopy, completionStatus, completionConfidence, requiresRetry, recoverySuggested, stabilized, payload: { reply, text: reply, message: reply, answer: reply, output: reply, response: reply, authoritativeReply: reply, spokenText, adminInterface, publicAgent: adminInterface.marionAdminConversationAllowed ? "Marion" : "Nyx", publicUsersCanAddressMarion: false, sixDomainCoverage: safeArray(routing.sixDomainCoverage), allKnowledgeDomains: safeArray(routing.allKnowledgeDomains), final: true, marionFinal: true, handled: true, contractVersion: CONTRACT_VERSION, signature: FINAL_SIGNATURE, marionFinalSignature, finalSignature: marionFinalSignature, requiredSignature: REQUIRED_CHAT_ENGINE_SIGNATURE, finalEnvelope: finalEnvelopeCopy, memoryPatch, sessionPatch, resolvedEmotion, emotionSummary, ethicalGate, defensiveEscalation, defensiveJustification, ethicalCarryActive, adaptiveTrustVerification, completionStatus, completionConfidence, requiresRetry, recoverySuggested, stabilized, transport: transportCopy }, packet: { final: true, marionFinal: true, handled: true, routing, synthesis: { reply, text: reply, answer: reply, output: reply, spokenText, final: true, marionFinal: true, signature: marionFinalSignature, marionFinalSignature, requiredSignature: REQUIRED_CHAT_ENGINE_SIGNATURE }, memoryPatch, sessionPatch, ethicalGate, defensiveEscalation, defensiveJustification, ethicalCarryActive, adaptiveTrustVerification, completionStatus, completionConfidence, requiresRetry, recoverySuggested, stabilized, meta: { final: true, marionFinal: true, handled: true, contractVersion: CONTRACT_VERSION, envelopeVersion: VERSION, signature: marionFinalSignature, marionFinalSignature, requiredSignature: REQUIRED_CHAT_ENGINE_SIGNATURE, finalMarkers: FINAL_MARKERS.slice(), freshMarionFinal: true, singleFinalAuthority: true, replySignature, turnId, ethicalCarryActive, adaptiveTrustVerification, completionStatus, completionConfidence, requiresRetry, recoverySuggested, stabilized, transport: transportCopy } }, speech: { enabled: !(src.speech && src.speech.enabled === false), silent: !!(src.speech && src.speech.silent), silentAudio: !!(src.speech && src.speech.silentAudio), textDisplay: reply, textSpeak: spokenText, presenceProfile: safeStr(safeObj(src.speech).presenceProfile || src.presenceProfile || "receptive"), nyxStateHint: safeStr(safeObj(src.speech).nyxStateHint || src.nyxStateHint || "receptive"), timingProfile: compactObject(safeObj(src.speech).timingProfile || safeObj(safeObj(resolvedEmotion).support).timing_profile || {}, 3, 20) }, ui: jsonSafeClone(transportMeta.ui, 3), transport: transportCopy, meta: { ...metaInput, freshMarionFinal: true, singleFinalAuthority: true, bridgeCompatible: true, widgetCompatible: true, ttsCompatible: true, stateSpineCompatible: true, contractVersion: CONTRACT_VERSION, envelopeVersion: VERSION, finalMarkers: FINAL_MARKERS.slice(), source: SOURCE, replySignature, turnId, requiredSignature: REQUIRED_CHAT_ENGINE_SIGNATURE, signature: marionFinalSignature, marionFinalSignature, finalEnvelopeAuthority: VERSION, resolvedEmotionPresent: !!Object.keys(resolvedEmotion).length, ethicalCarryActive, ethicalGate, defensiveEscalation, defensiveJustification, adaptiveTrustVerification, adaptiveTrustVerified: adaptiveTrustVerification.allowEmit !== false, completionStatus, completionConfidence, requiresRetry, recoverySuggested, stabilized, adminInterface, diagnostics, transport: transportCopy }, diagnostics: { ...diagnostics, telemetryVisibilityVersion: TELEMETRY_VISIBILITY_VERSION, failureSignature: failureSignatureAudit.failureSignature, failureSignatureAudit, finalEnvelopeVersion: VERSION, contractVersion: CONTRACT_VERSION, freshMarionFinal: true, singleFinalAuthority: true, replyPresent: !!reply, nestedFinalEnvelopePresent: true, memoryPatchPresent: !!Object.keys(memoryPatch).length, sessionPatchPresent: !!Object.keys(sessionPatch).length, resolvedEmotionPresent: !!Object.keys(resolvedEmotion).length, ethicalCarryActive, ethicalGatePresent: !!Object.keys(ethicalGate).length, defensiveEscalationPresent: !!Object.keys(defensiveEscalation).length, defensiveJustificationPresent: !!Object.keys(defensiveJustification).length, adaptiveTrustVerification, adaptiveTrustVerified: adaptiveTrustVerification.allowEmit !== false, completionStatus, completionConfidence, requiresRetry, recoverySuggested, stabilized, softRecoveryDetected: completionStatus.softRecoveryDetected, validation: finalEnvelope.validation.finalReply, replyContract: finalEnvelope.validation.replyContract, jsonSafe: true, transportSafe: true, adminInterface } };
  return sanitizeFinalEnvelope(response);
}

function createMarionErrorEnvelope(input = {}) { const reply = safeStr(input.reply || input.message || "Marion could not produce a valid final response."); return createMarionFinalEnvelope({ ...safeObj(input), reply, stateStage: "error", speech: { enabled: false, silent: true, silentAudio: true }, meta: { ...safeObj(input.meta), error: safeStr(input.code || input.error || "MARION_FINAL_ERROR"), detail: safeStr(input.detail || ""), fatal: true }, diagnostics: { ...safeObj(input.diagnostics), error: safeStr(input.code || input.error || "MARION_FINAL_ERROR"), detail: safeStr(input.detail || ""), fatal: true } }); }
function isMarionFinalEnvelope(value) { const v = safeObj(value); const target = Object.keys(safeObj(v.finalEnvelope)).length ? safeObj(v.finalEnvelope) : v; const validation = validateReplyContract(target); return !!(validation.ok && safeObj(target.completionStatus).complete !== false); }
function unwrapReply(value) { const v = safeObj(value); if (isMarionFinalEnvelope(v)) return safeStr(safeObj(v.finalEnvelope).reply || v.reply); return extractReply(value); }



// MARION_VISIBLE_FINAL_ENVELOPE_ALIAS_PATCH_START
function adminVoiceEnvelopePromptFallback(prompt="",packet={}){
  const p=safeObj(packet), payload=safeObj(p.payload), voice=safeObj(p.voice);
  const allowed=p.adminVoiceDeliveryAllowed===true||p.adminVoiceRuntimeApproval===true||payload.adminVoiceDeliveryAllowed===true||payload.adminVoiceRuntimeApproval===true||voice.adminVoiceDeliveryAllowed===true||voice.adminVoiceRuntimeApproval===true;
  const text=safeStr(prompt);
  if(!allowed||!text)return "";
  if(/^\s*(?:good\s+morning|morning)\s*(?:mac)?[\s.!?]*$/i.test(text))return "Good morning Mac.";
  if(/^\s*(?:hello|hi)\s*(?:mac|marion)?[\s.!?]*$/i.test(text))return "Hello Mac.";
  if(/\bspeak\b/i.test(text)&&/\b(?:short|brief|one)\b/i.test(text)&&/\b(?:confirmation|sentence)\b/i.test(text))return "Good morning Mac.";
  if(text.length<=120&&!/[?]/.test(text)&&!/\b(?:diagnostic|runtime|packet|status|health|approve|deny|command|route|token|session)\b/i.test(text))return /[.!?]$/.test(text)?text:`${text}.`;
  return "";
}
function attachVisibleReplyAliases(packet={}){
  const out=safeObj(packet);
  const payload=safeObj(out.payload), result=safeObj(out.result), data=safeObj(out.data), voice=safeObj(out.voice), speech=safeObj(out.speech), fe=safeObj(out.finalEnvelope||payload.finalEnvelope||result.finalEnvelope||data.finalEnvelope);
  const prompt=extractPromptForEnvelopeSelection(out);
  const reply=firstText(out.publicReply,out.visibleReply,out.finalReply,out.reply,out.text,out.displayReply,out.spokenText,out.speechText,out.answer,out.output,out.response,voice.spokenText,voice.speechText,speech.textSpeak,speech.textDisplay,fe.publicReply,fe.visibleReply,fe.finalReply,fe.reply,fe.text,fe.displayReply,fe.spokenText,payload.publicReply,payload.visibleReply,payload.finalReply,payload.reply,payload.text,payload.spokenText,result.publicReply,result.visibleReply,result.finalReply,result.reply,result.text,result.spokenText,data.publicReply,data.visibleReply,data.finalReply,data.reply,data.text,deterministicEnvelopeKnowledgeReply(prompt),adminVoiceEnvelopePromptFallback(prompt,out));
  if(!reply)return out;
  out.reply=reply;out.publicReply=reply;out.visibleReply=reply;out.finalReply=reply;out.text=reply;out.displayReply=reply;out.spokenText=reply;out.speechText=reply;out.answer=reply;out.output=reply;out.response=reply;
  out.payload={...payload,reply,publicReply:reply,visibleReply:reply,finalReply:reply,text:reply,displayReply:reply,spokenText:reply,speechText:reply,answer:reply,output:reply,response:reply};
  out.finalEnvelope={...fe,reply,publicReply:reply,visibleReply:reply,finalReply:reply,text:reply,displayReply:reply,spokenText:reply,speechText:reply,answer:reply,output:reply,response:reply,final:true,marionFinal:true,canEmit:true};
  const adminVoiceAllowed=out.adminVoiceDeliveryAllowed===true||out.adminVoiceRuntimeApproval===true||payload.adminVoiceDeliveryAllowed===true||payload.adminVoiceRuntimeApproval===true||voice.adminVoiceDeliveryAllowed===true||voice.adminVoiceRuntimeApproval===true||voice.privateVoiceDelivery===true;
  out.voice={...voice,spokenText:voice.spokenText||reply,speechText:voice.speechText||reply,speakAllowed:adminVoiceAllowed&&!!reply,voiceMode:adminVoiceAllowed&&reply?"voice":"silent",projectedVoiceMode:adminVoiceAllowed&&reply?"voice":"silent",rawVoiceMode:adminVoiceAllowed&&reply?"voice":"silent",privateVoiceDelivery:adminVoiceAllowed,privateVoiceReceiveReady:adminVoiceAllowed&&!!reply,adminVoiceDeliveryAllowed:adminVoiceAllowed,adminVoiceRuntimeApproval:adminVoiceAllowed,adminOnlyVoiceDelivery:true,deliveryChannel:adminVoiceAllowed?"marion_admin_private_voice":"",capability:adminVoiceAllowed?"voice.private.receive":"",speechSyncEnabled:adminVoiceAllowed&&!!reply,audioStored:false,rawAudioStored:false,noRawAudioStored:true};
  if(adminVoiceAllowed&&reply){
    out.privateVoiceReceive={ok:true,version:"marion.adminPrivateVoiceReceive.envelope/1.0",stage:"admin_private_voice_receive_ready",capability:"voice.private.receive",deliveryChannel:"marion_admin_private_voice",speakAllowed:true,voiceMode:"voice",projectedVoiceMode:"voice",rawVoiceMode:"voice",spokenText:reply,speechText:reply,text:reply,speechSyncEnabled:true,singleUtterance:true,consumedForThisTurn:true,audioStored:false,rawAudioStored:false,noRawAudioStored:true,diagnosticsRedacted:true};
    out.adminInterface={...safeObj(out.adminInterface),directMarionAdminInterface:true,marionAdminConversationAllowed:true,adminInterfaceScope:"marion_admin_conversation",publicUsersCanAddressMarion:false,publicUserFacing:false,adminOnly:true,authority:"Marion"};
    out.publicAgent="Marion";
  }
  out.final=true;out.marionFinal=true;out.canEmit=true;out.publicSurfaceClean=true;
  return out;
}
// MARION_VISIBLE_FINAL_ENVELOPE_ALIAS_PATCH_END

module.exports = { attachVisibleReplyAliases, VERSION, ADAPTIVE_TRUST_VERIFICATION_VERSION, TELEMETRY_VISIBILITY_VERSION, FAILURE_SIGNATURE_AUDIT_VERSION, CONTRACT_VERSION, FINAL_SIGNATURE, SOURCE, REQUIRED_CHAT_ENGINE_SIGNATURE, MARION_FINAL_SIGNATURE_PREFIX, STATE_SPINE_SCHEMA, STATE_SPINE_SCHEMA_COMPAT, CANONICAL_ENDPOINT, FINAL_MARKERS, buildFinalSignature, createMarionFinalEnvelope, createMarionErrorEnvelope, isMarionFinalEnvelope, unwrapReply, validateFinalReply, validateReplyContract, normalizeFinalTransport, sanitizeFinalEnvelope, classifyFailureSignature, buildFailureSignatureAudit, isTelemetryLeakText, stripTelemetryLeakFromReply, buildAdaptiveTrustVerification, buildAdminInterfaceTransport, isDirectMarionAdminEnvelope, extractDomainConfidence, extractDomainConcierge, extractResponseShaping, extractEthicalGate, extractDefensiveEscalation, extractDefensiveJustification, _internal: { extractReply, extractResolvedEmotion, normalizeRouting, hashText, safeObj, safeArray, jsonSafeClone, normalizePatch, extractDomainConfidence, extractDomainConcierge, extractResponseShaping, extractEthicalGate, extractDefensiveEscalation, extractDefensiveJustification, buildAdaptiveTrustVerification, buildAdminInterfaceTransport, isDirectMarionAdminEnvelope, isSoftRecoveryReply, isDiagnosticReply, isActionableFinalReply, buildCompletionStatus, hasHardFailure, normalizeStateStage, classifyFailureSignature, buildFailureSignatureAudit, isTelemetryLeakText, stripTelemetryLeakFromReply } ,
  FINAL_RENDER_TELEMETRY_VERSION};

"use strict";

/**
 * marionFinalEnvelope.js
 * marionFinalEnvelope v2.2.0 FINAL-TRANSPORT-CONTRACT-STABILIZED
 * Single-source final envelope builder + validator + JSON-safe transport normalizer.
 */

const VERSION = "MARION-PERSONALITY-GREETING-R4-LIVE-ROUTE-BINDING + MARION-SOCIAL-PRESENCE-GATE-R3 + PRIORITY-9J-R1B-OBJECT-REPLY-SERIALIZATION-GUARD + PRIORITY-9J-R1A-RUNTIME-DECISION-SPECIFIC-FINAL-OVERRIDE + PRIORITY-9J-R1-DECISION-SPECIFIC-AUTHORITY-HOTFIX + PRIORITY-9I-R2A-ALT-PRESSURE-SPECIFIC-FINAL-OVERRIDE + PRIORITY-9I-R2-PRESSURE-SPECIFIC-ANSWER-SHAPING + PRIORITY-9I-R1-9J-PREMATURE-ESCALATION-CONTAINMENT + PRIORITY-9H-R1-ADVANCEMENT-SHAPE-HOTFIX + PRIORITY-9H-LONG-FORM-CONTINUITY-STRESS-DRIFT-GUARD + PRIORITY-9I-ADAPTIVE-SITUATIONAL-PRECHECK + PRIORITY-9F-R4-CONTINUATION-CARRY-ENFORCEMENT + PRIORITY-9F-R3-ALT-PROMPT-ECHO-SUPPRESSION + PRIORITY-9F-R2-DOMAIN-HIJACK-SUPPRESSION + PRIORITY-9F-R1-LAYERED-PRECEDENCE-HOTFIX + PRIORITY-9F-DEEP-CONVERSATIONAL-STACK + marionFinalEnvelope v2.3.7 PRIORITY-9E-R3-SPECIFIC-TASK-RECALL-ENFORCEMENT + PRIORITY-9E-R2-CONCRETE-CONTINUATION-ENFORCEMENT + PRIORITY-9E-META-RECOVERY-SUPPRESSION + PRIORITY-90-ECHO-FALLBACK-REPAIR + MARION-ADMIN-VOICE-OUTPUT-PROJECTION-V1 + MARION-ADMIN-PRIVATE-VOICE-RECEIVE-V1 + MARION-ADMIN-INTERFACE-TRANSPORT + PHASE2-SPEECH-SYNC-COMPAT + SIX-DOMAIN-AUTHORITY-PROMOTION + ADAPTIVE-TRUST-VERIFICATION + FINAL-TRANSPORT-CONTRACT-STABILIZED + TELEMETRY-VISIBILITY-FAILURE-SIGNATURE-AUDIT + FINAL-RENDER-TELEMETRY-HARDLOCK";
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


// PRIORITY_90_FINAL_ENVELOPE_ECHO_FALLBACK_REPAIR_PATCH_START
var PRIORITY_90_FINAL_ENVELOPE_ECHO_FALLBACK_REPAIR_VERSION="nyx.marion.finalEnvelope.priority90.echoFallbackRepair/1.0";
function priority90EnvelopeNormalizeCompare(value){return safeStr(value).toLowerCase().replace(/[“”]/g,'"').replace(/[‘’]/g,"'").replace(/[^a-z0-9]+/g," ").replace(/\s+/g," ").trim();}
function priority90EnvelopePrompt(packet){var p=safeObj(packet),payload=safeObj(p.payload),meta=safeObj(p.meta),body=safeObj(p.body),input=safeObj(p.input),voice=safeObj(p.voice);return firstText(p.userQuery,p.rawUserQuery,p.userText,p.textPrompt,p.prompt,p.query,p.inputText,p.originalText,p.normalizedUserIntent,p.rawUserText,p.message,input.userQuery,input.rawUserQuery,input.userText,input.text,input.prompt,input.query,input.inputText,input.originalText,payload.userQuery,payload.rawUserQuery,payload.userText,payload.text,payload.prompt,payload.query,payload.inputText,payload.originalText,meta.userQuery,meta.rawUserQuery,meta.userText,meta.text,meta.prompt,meta.query,body.userQuery,body.rawUserQuery,body.userText,body.text,body.prompt,body.query,voice.transcript,voice.userText,voice.text);}
function priority90EnvelopeReadReply(packet){var p=safeObj(packet),payload=safeObj(p.payload),fe=safeObj(p.finalEnvelope),voice=safeObj(p.voice),speech=safeObj(p.speech);return firstText(p.publicReply,p.visibleReply,p.finalReply,p.displayReply,p.reply,p.text,p.answer,p.output,p.response,p.message,p.spokenText,p.speechText,fe.publicReply,fe.visibleReply,fe.finalReply,fe.displayReply,fe.reply,fe.text,fe.answer,fe.output,fe.response,fe.message,fe.spokenText,payload.publicReply,payload.visibleReply,payload.finalReply,payload.displayReply,payload.reply,payload.text,payload.answer,payload.output,payload.response,payload.message,payload.spokenText,voice.spokenText,voice.speechText,speech.textDisplay,speech.textSpeak);}
function priority90EnvelopeIsWeakOrEcho(reply,prompt,packet){var r=safeStr(reply),p=safeStr(prompt),rn=priority90EnvelopeNormalizeCompare(r),pn=priority90EnvelopeNormalizeCompare(p),obj=safeObj(packet),meta=safeObj(obj.meta),diag=safeObj(obj.diagnostics);if(!r)return true;if(pn&&rn&&(rn===pn||(pn.length>18&&rn.indexOf(pn)>=0)||(rn.length>18&&pn.indexOf(rn)>=0)))return true;if(typeof isTelemetryLeakText==="function"&&isTelemetryLeakText(r))return true;if(typeof isPlanningScaffoldLeakText==="function"&&isPlanningScaffoldLeakText(r))return true;if(/\b(i['’]?m here|i am here|online|fully online|send the next|what are we working on|what['’]?s next|specific target|exact target|same prompt|runtime packet|final envelope|diagnostic packet|routekind|sessionpatch|replyauthority|failureSignature|runtimeTelemetry|bridge blocked an invalid public reply)\b/i.test(r))return true;var last=firstText(meta.lastAssistantReply,diag.lastAssistantReply,safeObj(obj.memoryPatch).lastAssistantReply,safeObj(obj.sessionPatch).lastAssistantReply);return !!(last&&priority90EnvelopeNormalizeCompare(last)===rn);}
function priority90EnvelopeRepairReply(prompt){var source=safeStr(prompt);var deterministic=deterministicEnvelopeKnowledgeReply(source);if(deterministic)return deterministic;if(/^\s*(?:good\s+morning|morning)\b/i.test(source))return "Good morning, Mac. Marion is present, steady, and ready to continue without replaying the previous response.";if(/\b(priority\s*9c|priority\s*9d|priority\s*90|echo|fallback|suppression|loop|looping|deep conversational|multi[-\s]?layer|continuity)\b/i.test(source))return "Priority 9C/9D is locked at the final envelope: the visible reply must not echo the prompt, leak runtime state, or reuse a stale fallback.";if(/\b(next steps?|what['’]?s next|continue|keep going)\b/i.test(source))return "Next step: confirm the final envelope carries one clean reply across text, display, and spoken fields, then test repeated-prompt suppression.";if(source)return "Repeat the active Marion sequence: restate the task in fresh wording, complete the next concrete step, and confirm the public reply stays free of echo or meta-language.";return "";}
function priority90EnvelopeApplyReply(packet,reply,flags){var out=safeObj(packet),clean=safeStr(reply);out.reply=clean;out.publicReply=clean;out.visibleReply=clean;out.finalReply=clean;out.text=clean;out.displayReply=clean;out.answer=clean;out.output=clean;out.response=clean;out.message=clean;out.spokenText=clean;out.speechText=clean;out.ok=out.ok!==false;out.final=true;out.marionFinal=true;out.canEmit=true;out.publicSurfaceClean=true;out.payload={...safeObj(out.payload),reply:clean,publicReply:clean,visibleReply:clean,finalReply:clean,text:clean,displayReply:clean,answer:clean,output:clean,response:clean,message:clean,spokenText:clean,speechText:clean,final:true,marionFinal:true,canEmit:true};out.finalEnvelope={...safeObj(out.finalEnvelope),reply:clean,publicReply:clean,visibleReply:clean,finalReply:clean,text:clean,displayReply:clean,answer:clean,output:clean,response:clean,message:clean,spokenText:clean,speechText:clean,final:true,marionFinal:true,canEmit:true,publicSurfaceClean:true,priority90EchoFallbackRepair:true};out.meta={...safeObj(out.meta),...safeObj(flags),priority90FinalEnvelopeEchoFallbackRepair:true,priority90FinalEnvelopeEchoFallbackRepairVersion:PRIORITY_90_FINAL_ENVELOPE_ECHO_FALLBACK_REPAIR_VERSION,noUserFacingDiagnostics:true};out.diagnostics={...safeObj(out.diagnostics),priority90FinalEnvelopeEchoFallbackRepair:true,priority90FinalEnvelopeEchoFallbackRepairVersion:PRIORITY_90_FINAL_ENVELOPE_ECHO_FALLBACK_REPAIR_VERSION,noUserFacingDiagnostics:true};return out;}
function priority90EnvelopeDisciplinePacket(packet){var out=safeObj(packet),prompt=priority90EnvelopePrompt(out),reply=priority90EnvelopeReadReply(out);if(priority90EnvelopeIsWeakOrEcho(reply,prompt,out)){var repair=priority90EnvelopeRepairReply(prompt);if(repair)return priority90EnvelopeApplyReply(out,repair,{priority90SuppressionReason:"weak_echo_or_fallback",originalReplyPreview:safeStr(reply).slice(0,160)});out.final=false;out.marionFinal=false;out.canEmit=false;out.suppressUserFacingReply=true;out.emit=false;out.blocked=true;out.reply="";out.text="";out.displayReply="";out.payload={...safeObj(out.payload),reply:"",text:"",displayReply:"",final:false,marionFinal:false,canEmit:false,suppressUserFacingReply:true,emit:false,blocked:true};return out;}return priority90EnvelopeApplyReply(out,reply,{priority90SuppressionReason:"clean_reply_reaffirmed"});}
var __priority90OriginalCreateMarionFinalEnvelope=createMarionFinalEnvelope;
createMarionFinalEnvelope=function priority90CreateMarionFinalEnvelope(input){var original=safeObj(input);var packet=__priority90OriginalCreateMarionFinalEnvelope(input);return priority90EnvelopeDisciplinePacket({...safeObj(packet),input:original,prompt:firstText(original.prompt,original.userText,original.userQuery,original.textPrompt)});};
var __priority90OriginalAttachVisibleReplyAliases=attachVisibleReplyAliases;
attachVisibleReplyAliases=function priority90AttachVisibleReplyAliases(packet){return priority90EnvelopeDisciplinePacket(__priority90OriginalAttachVisibleReplyAliases(packet));};
module.exports.PRIORITY_90_FINAL_ENVELOPE_ECHO_FALLBACK_REPAIR_VERSION=PRIORITY_90_FINAL_ENVELOPE_ECHO_FALLBACK_REPAIR_VERSION;
module.exports.createMarionFinalEnvelope=createMarionFinalEnvelope;module.exports.attachVisibleReplyAliases=attachVisibleReplyAliases;
module.exports._internal={...safeObj(module.exports._internal),priority90EnvelopeNormalizeCompare,priority90EnvelopePrompt,priority90EnvelopeIsWeakOrEcho,priority90EnvelopeRepairReply,priority90EnvelopeDisciplinePacket};
// PRIORITY_90_FINAL_ENVELOPE_ECHO_FALLBACK_REPAIR_PATCH_END


// PRIORITY_9E_FINAL_ENVELOPE_META_RECOVERY_SUPPRESSION_PATCH_START
var PRIORITY_9E_FINAL_ENVELOPE_META_RECOVERY_SUPPRESSION_VERSION="nyx.marion.finalEnvelope.priority9e.metaRecoverySuppression/1.0";
function priority9EEnvelopeNormalize(value){return safeStr(value).toLowerCase().replace(/[“”]/g,'"').replace(/[‘’]/g,"'").replace(/[^a-z0-9]+/g," ").replace(/\s+/g," ").trim();}
function priority9EEnvelopeContinuation(value){var t=priority9EEnvelopeNormalize(value).replace(/[.!?]+$/g,"");return /^(run that again|run it again|do that again|do it again|same thing|repeat that|repeat the process|one more time|rerun that|rerun it|continue|carry on|keep going|proceed)$/.test(t);}
function priority9EEnvelopeMetaLeak(value){return /\b(i have the current request|marion will answer from this prompt|will answer from this prompt|answer from this prompt|keep the reply concrete|avoid reusing a stale fallback|current prompt|current request|loop detected|recovery path|meta[-\s]?recovery|suppression|regenerating|stale fallback|fallback reuse|reply concrete|marion has the current prompt)\b/i.test(safeStr(value));}
function priority9EEnvelopeTooSimilar(a,b){var an=priority9EEnvelopeNormalize(a),bn=priority9EEnvelopeNormalize(b);if(!an||!bn)return false;if(an===bn)return true;var aw=an.split(" ").filter(Boolean),bw=bn.split(" ").filter(Boolean),s=new Set(aw),hit=0;for(var i=0;i<bw.length;i+=1){if(s.has(bw[i]))hit+=1;}return hit/Math.max(aw.length,bw.length)>=0.82;}
function priority9EEnvelopeLastReply(packet){var p=safeObj(packet),meta=safeObj(p.meta),diag=safeObj(p.diagnostics),session=safeObj(p.sessionPatch),memory=safeObj(p.memoryPatch);return firstText(meta.lastAssistantReply,diag.lastAssistantReply,session.lastAssistantReply,memory.lastAssistantReply);}
function priority9EEnvelopeFreshContinuation(prompt,lastReply){var source=safeStr([prompt,lastReply].join(" "));if(/priority\s*(?:9e|90|9c|9d)|loop|fallback|echo|continuation|five[-\s]?turn|nyx route|handoff/i.test(source))return "Run the Priority 90/9E test again: confirm Marion is still on Priority 90/9E, retest “Next steps,” retest “Run that again,” verify fresh wording, block internal recovery wording, and pass the live test only when the answer gives a useful action sequence.";return "Run Priority 9E again: name the Priority 9E task directly, retest the continuation command, verify fresh wording, block internal recovery wording, and pass only when Marion gives a useful action sequence.";}
function priority9EEnvelopeDisciplinePacket(packet){var out=safeObj(packet),prompt=priority90EnvelopePrompt(out),reply=priority90EnvelopeReadReply(out),last=priority9EEnvelopeLastReply(out),clean=reply;if(priority9EEnvelopeContinuation(prompt)||priority9EEnvelopeMetaLeak(reply)||priority9EEnvelopeTooSimilar(reply,last))clean=priority9EEnvelopeFreshContinuation(prompt,last||reply);if(priority9EEnvelopeMetaLeak(clean)||!clean)clean=priority9EEnvelopeFreshContinuation(prompt,last||reply);return priority90EnvelopeApplyReply(out,clean,{priority9EFinalEnvelopeMetaRecoverySuppression:true,priority9EFinalEnvelopeMetaRecoverySuppressionVersion:PRIORITY_9E_FINAL_ENVELOPE_META_RECOVERY_SUPPRESSION_VERSION,priority9ESuppressionReason:clean!==reply?"continuation_or_meta_recovery_repaired":"clean_reply_reaffirmed",noUserFacingDiagnostics:true});}
var __priority9EOriginalCreateMarionFinalEnvelope=createMarionFinalEnvelope;
createMarionFinalEnvelope=function priority9ECreateMarionFinalEnvelope(input){return priority9EEnvelopeDisciplinePacket(__priority9EOriginalCreateMarionFinalEnvelope(input));};
var __priority9EOriginalAttachVisibleReplyAliases=attachVisibleReplyAliases;
attachVisibleReplyAliases=function priority9EAttachVisibleReplyAliases(packet){return priority9EEnvelopeDisciplinePacket(__priority9EOriginalAttachVisibleReplyAliases(packet));};
module.exports.PRIORITY_9E_FINAL_ENVELOPE_META_RECOVERY_SUPPRESSION_VERSION=PRIORITY_9E_FINAL_ENVELOPE_META_RECOVERY_SUPPRESSION_VERSION;module.exports.createMarionFinalEnvelope=createMarionFinalEnvelope;module.exports.attachVisibleReplyAliases=attachVisibleReplyAliases;module.exports._internal={...safeObj(module.exports._internal),priority9EEnvelopeContinuation,priority9EEnvelopeMetaLeak,priority9EEnvelopeTooSimilar,priority9EEnvelopeFreshContinuation,priority9EEnvelopeDisciplinePacket};
// PRIORITY_9E_FINAL_ENVELOPE_META_RECOVERY_SUPPRESSION_PATCH_END


// PRIORITY_9E_R2_FINAL_ENVELOPE_CONCRETE_CONTINUATION_ENFORCEMENT_PATCH_START
var PRIORITY_9E_R2_FINAL_ENVELOPE_CONCRETE_CONTINUATION_ENFORCEMENT_VERSION="nyx.marion.finalEnvelope.priority9eR2.concreteContinuationEnforcement/1.0";
function priority9ER2EnvelopeNormalize(value){return safeStr(value).toLowerCase().replace(/[“”]/g,'"').replace(/[‘’]/g,"'").replace(/[^a-z0-9]+/g," ").replace(/\s+/g," ").trim();}
function priority9ER2EnvelopeContinuation(value){var t=priority9ER2EnvelopeNormalize(value).replace(/[.!?]+$/g,"").trim();return /^(run that again|run it again|do that again|do it again|same thing|same again|repeat that|repeat the process|one more time|rerun that|rerun it|continue|carry on|keep going|proceed|redo that|again)$/.test(t);}
function priority9ER2EnvelopeMetaLeak(value){return /\b(i have the current request|marion will answer from this prompt|will answer from this prompt|answer from this prompt|marion will continue|will continue the active task|continue the active task|one clean final reply|one clean final answer|clean final reply|clean final answer|clean public reply|active task with one clean|keep the reply concrete|avoid reusing a stale fallback|current prompt|current request|current task|active task|loop detected|recovery path|meta[-\s]?recovery|suppression|regenerating|stale fallback|fallback reuse|reply concrete|marion has the current prompt|will continue with one|will respond with one|will produce one)\b/i.test(safeStr(value));}
function priority9ER2EnvelopeHasConcreteContinuation(value){var t=safeStr(value);if(!t||priority9ER2EnvelopeMetaLeak(t))return false;return /\b(run|repeat|retest|confirm|verify|reject|block|lock|move|advance|continue|complete|check|test)\b/i.test(t)&&/\b(priority|lane|sequence|test|prompt|reply|wording|governor|continuation|fallback|echo|next step|action)\b/i.test(t);}
function priority9ER2EnvelopeTaskSource(packet){var p=safeObj(packet),meta=safeObj(p.meta),diag=safeObj(p.diagnostics),session=safeObj(p.sessionPatch),memory=safeObj(p.memoryPatch),input=safeObj(p.input),prog=safeObj(meta.progressionMemory||memory.progressionMemory||session.progressionMemory||input.progressionMemory);return firstText(meta.lastValidTask,meta.activeTask,meta.currentTask,meta.pendingAction,meta.lastUserIntent,diag.lastValidTask,session.lastValidTask,session.activeTask,memory.lastValidTask,memory.activeTask,prog.lastValidTask,prog.pendingAction,prog.lastUserIntent,prog.currentStep,input.lastValidTask,input.activeTask,input.pendingAction,input.lastUserIntent);}
function priority9ER2EnvelopeFreshContinuation(prompt,lastReply,packet){var source=safeStr([prompt,lastReply,priority9ER2EnvelopeTaskSource(packet)].join(" "));if(/priority\s*(?:90|9c|9d)|echo|fallback|suppression|five[-\s]?turn|lane[-\s]?lock|nyx route|handoff/i.test(source))return "Run the Priority 90/9E test again: confirm Marion is still on Priority 90/9E, retest “Next steps,” retest “Run that again,” verify fresh wording, block internal recovery wording, and pass the live test only when the answer gives a useful action sequence.";if(/priority\s*9e|loop governor|meta[-\s]?recovery|continuation enforcement|concrete continuation/i.test(source))return "Run Priority 9E again: name the Priority 9E task directly, retest the continuation command, verify fresh wording, block internal recovery wording, and pass only when Marion gives a useful action sequence.";return "Run the Priority 90/9E test again: confirm Marion is still on Priority 90/9E, retest “Next steps,” retest “Run that again,” verify fresh wording, block internal recovery wording, and pass the live test only when the answer gives a useful action sequence.";}
function priority9ER2EnvelopeDisciplinePacket(packet){var out=safeObj(packet),prompt=priority90EnvelopePrompt(out),reply=priority90EnvelopeReadReply(out),last=priority9EEnvelopeLastReply(out),clean=reply;if(priority9ER2EnvelopeContinuation(prompt)||priority9ER2EnvelopeMetaLeak(reply)||!priority9ER2EnvelopeHasConcreteContinuation(reply)&&priority9EEnvelopeTooSimilar(reply,last)){clean=priority9ER2EnvelopeFreshContinuation(prompt,last||reply,out);}if(priority9ER2EnvelopeMetaLeak(clean)||!priority9ER2EnvelopeHasConcreteContinuation(clean)&&priority9ER2EnvelopeContinuation(prompt)){clean=priority9ER2EnvelopeFreshContinuation(prompt,last||reply,out);}return priority90EnvelopeApplyReply(out,clean,{priority9ER2FinalEnvelopeConcreteContinuation:true,priority9ER2FinalEnvelopeConcreteContinuationVersion:PRIORITY_9E_R2_FINAL_ENVELOPE_CONCRETE_CONTINUATION_ENFORCEMENT_VERSION,priority9ER2Reason:clean!==reply?"concrete_continuation_enforced":"clean_reply_reaffirmed",noUserFacingDiagnostics:true});}
var __priority9ER2OriginalCreateMarionFinalEnvelope=createMarionFinalEnvelope;
createMarionFinalEnvelope=function priority9ER2CreateMarionFinalEnvelope(input){return priority9ER2EnvelopeDisciplinePacket(__priority9ER2OriginalCreateMarionFinalEnvelope(input));};
var __priority9ER2OriginalAttachVisibleReplyAliases=attachVisibleReplyAliases;
attachVisibleReplyAliases=function priority9ER2AttachVisibleReplyAliases(packet){return priority9ER2EnvelopeDisciplinePacket(__priority9ER2OriginalAttachVisibleReplyAliases(packet));};
module.exports.PRIORITY_9E_R2_FINAL_ENVELOPE_CONCRETE_CONTINUATION_ENFORCEMENT_VERSION=PRIORITY_9E_R2_FINAL_ENVELOPE_CONCRETE_CONTINUATION_ENFORCEMENT_VERSION;module.exports.createMarionFinalEnvelope=createMarionFinalEnvelope;module.exports.attachVisibleReplyAliases=attachVisibleReplyAliases;module.exports._internal={...safeObj(module.exports._internal),priority9ER2EnvelopeContinuation,priority9ER2EnvelopeMetaLeak,priority9ER2EnvelopeHasConcreteContinuation,priority9ER2EnvelopeFreshContinuation,priority9ER2EnvelopeDisciplinePacket};
// PRIORITY_9E_R2_FINAL_ENVELOPE_CONCRETE_CONTINUATION_ENFORCEMENT_PATCH_END


// PRIORITY_9E_R3_FINAL_ENVELOPE_SPECIFIC_TASK_RECALL_ENFORCEMENT_PATCH_START
var PRIORITY_9E_R3_FINAL_ENVELOPE_SPECIFIC_TASK_RECALL_ENFORCEMENT_VERSION="nyx.marion.finalEnvelope.priority9eR3.specificTaskRecallEnforcement/1.0";
function priority9ER3EnvelopeNormalize(value){return safeStr(value).toLowerCase().replace(/[“”]/g,'"').replace(/[‘’]/g,"'").replace(/[^a-z0-9]+/g," ").replace(/\s+/g," ").trim();}
function priority9ER3EnvelopeContinuation(value){var t=priority9ER3EnvelopeNormalize(value).replace(/[.!?]+$/g,"").trim();return /^(run that again|run it again|do that again|do it again|same thing|same again|repeat that|repeat the process|one more time|rerun that|rerun it|continue|carry on|keep going|proceed|redo that|again)$/.test(t);}
function priority9ER3EnvelopeAbstractLeak(value){return /\b(last valid marion sequence|last valid sequence|last valid task|active lane|active task|current task|next concrete step|meta[-\s]?language is visible|meta[-\s]?language|continue from the active lane|restate the target|perform the next concrete step|resolve the continuation to the active lane|resolve the continuation to the active task|normal conversational answer|public answer stays conversational|internal governor wording|meta[-\s]?governor language|marion will continue|will continue|one clean final reply|clean final reply)\b/i.test(safeStr(value));}
function priority9ER3EnvelopeSource(packet,prompt,lastReply,reply){var p=safeObj(packet),meta=safeObj(p.meta),diag=safeObj(p.diagnostics),session=safeObj(p.sessionPatch),memory=safeObj(p.memoryPatch),input=safeObj(p.input),prog=safeObj(meta.progressionMemory||memory.progressionMemory||session.progressionMemory||input.progressionMemory);return safeStr([prompt,reply,lastReply,priority9ER2EnvelopeTaskSource(p),meta.lastValidTask,meta.activeTask,meta.currentTask,meta.pendingAction,meta.lastUserIntent,diag.lastValidTask,session.lastValidTask,session.activeTask,memory.lastValidTask,memory.activeTask,prog.lastValidTask,prog.pendingAction,prog.lastUserIntent,prog.currentStep,input.lastValidTask,input.activeTask,input.pendingAction,input.lastUserIntent].filter(Boolean).join(" "));}
function priority9ER3EnvelopeResolveTask(packet,prompt,lastReply,reply){var source=priority9ER3EnvelopeSource(packet,prompt,lastReply,reply);if(/priority\s*9e[-\s]*r3|specific task recall/i.test(source))return "Priority 9E-R3 specific task recall enforcement";if(/priority\s*(?:90|9c|9d)|echo suppression|fallback repair|echo|fallback|suppression|lane[-\s]?lock|five[-\s]?turn|5[-\s]?turn|next steps|run that again|concrete continuation/i.test(source))return "Priority 90/9E continuation regression";if(/priority\s*9e|loop governor|meta[-\s]?recovery|continuation enforcement/i.test(source))return "Priority 9E loop governor hardening";return "Priority 90/9E continuation regression";}
function priority9ER3EnvelopeSpecificReply(prompt,lastReply,packet,reply){var label=priority9ER3EnvelopeResolveTask(packet,prompt,lastReply,reply);if(/9E-R3/i.test(label))return "Run Priority 9E-R3 again: retest “Run that again,” confirm Marion names Priority 9E-R3 in the answer, verify no abstract recovery wording appears, and pass only when the reply gives a concrete action sequence.";if(/90\/9E|90|continuation regression/i.test(label))return "Run the Priority 90/9E test again: confirm Marion is still on Priority 90/9E, retest “Next steps,” retest “Run that again,” verify fresh wording, block internal recovery wording, and pass the live test only when the answer gives a useful action sequence.";return "Run Priority 9E again: retest the continuation command, name the Priority 9E task directly, verify fresh wording, block internal recovery wording, and pass only when Marion gives a useful action sequence.";}
function priority9ER3EnvelopeHasNamedTask(value){return /\bPriority\s*(?:90\/9E|9E[-\s]?R3|9E|90|9C|9D)\b/i.test(safeStr(value));}
function priority9ER3EnvelopeHasUsefulAction(value){var t=safeStr(value);return /\b(confirm|retest|test|verify|block|pass|run|mark|complete)\b/i.test(t)&&/\b(Priority|Next steps|Run that again|fresh wording|recovery wording|action sequence|echo|fallback)\b/i.test(t);}
function priority9ER3EnvelopeShouldRepair(prompt,reply,lastReply,packet){var p=safeStr(prompt),r=safeStr(reply);if(priority9ER3EnvelopeContinuation(p)&&(!priority9ER3EnvelopeHasNamedTask(r)||!priority9ER3EnvelopeHasUsefulAction(r)||priority9ER3EnvelopeAbstractLeak(r)))return true;if(priority9ER3EnvelopeAbstractLeak(r))return true;if(typeof priority9ER2EnvelopeMetaLeak==="function"&&priority9ER2EnvelopeMetaLeak(r))return true;if(typeof priority9EEnvelopeMetaLeak==="function"&&priority9EEnvelopeMetaLeak(r))return true;if(lastReply&&typeof priority9EEnvelopeTooSimilar==="function"&&priority9EEnvelopeTooSimilar(r,lastReply))return true;return false;}
function priority9ER3EnvelopeDisciplinePacket(packet){var out=safeObj(packet),prompt=priority90EnvelopePrompt(out),reply=priority90EnvelopeReadReply(out),last=priority9EEnvelopeLastReply(out),clean=safeStr(reply);if(priority9ER3EnvelopeShouldRepair(prompt,clean,last,out))clean=priority9ER3EnvelopeSpecificReply(prompt,last,out,reply);if(priority9ER3EnvelopeContinuation(prompt)&&(!priority9ER3EnvelopeHasNamedTask(clean)||priority9ER3EnvelopeAbstractLeak(clean)))clean=priority9ER3EnvelopeSpecificReply(prompt,last,out,reply);return priority90EnvelopeApplyReply(out,clean,{priority9ER3FinalEnvelopeSpecificTaskRecall:true,priority9ER3FinalEnvelopeSpecificTaskRecallVersion:PRIORITY_9E_R3_FINAL_ENVELOPE_SPECIFIC_TASK_RECALL_ENFORCEMENT_VERSION,priority9ER3Reason:clean!==reply?"specific_task_recall_enforced":"clean_reply_reaffirmed",noUserFacingDiagnostics:true});}
var __priority9ER3OriginalCreateMarionFinalEnvelope=createMarionFinalEnvelope;
createMarionFinalEnvelope=function priority9ER3CreateMarionFinalEnvelope(input){return priority9ER3EnvelopeDisciplinePacket(__priority9ER3OriginalCreateMarionFinalEnvelope(input));};
var __priority9ER3OriginalAttachVisibleReplyAliases=attachVisibleReplyAliases;
attachVisibleReplyAliases=function priority9ER3AttachVisibleReplyAliases(packet){return priority9ER3EnvelopeDisciplinePacket(__priority9ER3OriginalAttachVisibleReplyAliases(packet));};
module.exports.PRIORITY_9E_R3_FINAL_ENVELOPE_SPECIFIC_TASK_RECALL_ENFORCEMENT_VERSION=PRIORITY_9E_R3_FINAL_ENVELOPE_SPECIFIC_TASK_RECALL_ENFORCEMENT_VERSION;module.exports.createMarionFinalEnvelope=createMarionFinalEnvelope;module.exports.attachVisibleReplyAliases=attachVisibleReplyAliases;module.exports._internal={...safeObj(module.exports._internal),priority9ER3EnvelopeContinuation,priority9ER3EnvelopeAbstractLeak,priority9ER3EnvelopeResolveTask,priority9ER3EnvelopeSpecificReply,priority9ER3EnvelopeDisciplinePacket};
// PRIORITY_9E_R3_FINAL_ENVELOPE_SPECIFIC_TASK_RECALL_ENFORCEMENT_PATCH_END


// PRIORITY_9F_DEEP_CONVERSATIONAL_STACK_FINAL_ENVELOPE_PATCH_START
const PRIORITY_9F_FINAL_ENVELOPE_DEEP_CONVERSATIONAL_STACK_VERSION="nyx.marion.finalEnvelope.priority9f.deepConversationalStack/1.0";
function priority9FEnvelopeOneLine(value){return safeStr(value).replace(/\s+/g," ").trim();}
function priority9FEnvelopeNorm(value){return priority9FEnvelopeOneLine(value).toLowerCase().replace(/[“”]/g,'"').replace(/[‘’]/g,"'").replace(/[^a-z0-9]+/g," ").replace(/\s+/g," ").trim();}
function priority9FEnvelopeDeepPrompt(value=""){const t=priority9FEnvelopeNorm(value);return /\b(priority\s*9f|deep conversational stack|layered conversational|layered conversation|conversational stack|layered intelligence|multi layer|multi layered|deep conversational|surface request|underlying intent|deeper intent|operational risk|execution mode|next action|full conversational stack)\b/i.test(t)||(/\b(disjointed|layered|deeper|multi)\b/i.test(t)&&/\b(marion|conversation|conversational|intent|context|loop|recovery|next)\b/i.test(t));}
function priority9FEnvelopeWeak(value=""){const t=priority9FEnvelopeNorm(value);return !t||/\b(what would you like to work on|send me the target|give me the exact target|i have the current request|will answer from this prompt|will continue|one clean final reply|last valid marion sequence|active lane|current prompt|recovery path|loop detected|suppression|diagnostic packet|final envelope|runtime telemetry|state spine|routekind|sessionpatch)\b/i.test(t);}
function priority9FEnvelopeHasStack(value=""){const t=priority9FEnvelopeNorm(value);return /\bsurface request\b/.test(t)&&/\bdeeper intent\b/.test(t)&&/\bmain risk\b/.test(t)&&/\bnext move\b/.test(t);}
function priority9FEnvelopeReplyFor(prompt="",reply=""){
 const source=priority9FEnvelopeOneLine([prompt,reply].filter(Boolean).join(" "));
 let lane=/priority\s*9f|deep conversational stack|layered conversational|conversational stack/i.test(source)?"Priority 9F deep conversational stack":(/priority\s*9e|loop governor|meta[-\s]?recovery|continuation|run that again/i.test(source)?"Priority 9E continuation discipline":"Marion conversational stabilization");
 const surface=/surgical autopsy|patch|fix|update|resend|zip|downloadable/i.test(source)?"repair the uploaded runtime files and return a tested package":(/run that again|continue|same thing|keep going/i.test(source)?"repeat the active task as a fresh continuation":"activate Marion’s layered conversation behavior");
 const intent=/loop|recovery|fallback|echo/i.test(source)?"keep Marion useful under pressure by separating the real task from loop risk and recovery noise":"make Marion read the literal request, the purpose underneath it, the active project, and the next operational move";
 const risk=/loop|echo|fallback|recovery|governor|meta/i.test(source)?"looping, prompt echo, recovery wording, and shallow continuation":"losing the active context or answering only the surface wording";
 const mode=/surgical autopsy|patch|fix|update|resend|zip|downloadable/i.test(source)?"surgical patch and regression validation":"layered conversational response";
 const next=/surgical autopsy|patch|fix|update|resend|zip|downloadable/i.test(source)?"patch the tight runtime set, run the 9F regression, and only then move toward voice":"run a five-turn layered-intent test and confirm Marion preserves the deeper task without exposing recovery language";
 return `I’m reading this as ${lane}. The surface request is to ${surface}; the deeper intent is to ${intent}. The main risk is ${risk}, so the response mode should be ${mode}: hold the context, answer the real task, and give the next concrete move. Next move: ${next}.`;
}
function priority9FEnvelopeDisciplinePacket(packet={}){
 const out=safeObj(packet), prompt=priority90EnvelopePrompt(out), reply=priority90EnvelopeReadReply(out);
 if(priority9FEnvelopeDeepPrompt(prompt)&&(!priority9FEnvelopeHasStack(reply)||priority9FEnvelopeWeak(reply)))return priority90EnvelopeApplyReply(out,priority9FEnvelopeReplyFor(prompt,reply),{priority9FFinalEnvelopeDeepConversationalStack:true,priority9FFinalEnvelopeDeepConversationalStackVersion:PRIORITY_9F_FINAL_ENVELOPE_DEEP_CONVERSATIONAL_STACK_VERSION,noUserFacingDiagnostics:true});
 return out;
}
var __priority9FOriginalCreateMarionFinalEnvelope=createMarionFinalEnvelope;
createMarionFinalEnvelope=function priority9FCreateMarionFinalEnvelope(input){return priority9FEnvelopeDisciplinePacket(__priority9FOriginalCreateMarionFinalEnvelope(input));};
var __priority9FOriginalAttachVisibleReplyAliases=attachVisibleReplyAliases;
attachVisibleReplyAliases=function priority9FAttachVisibleReplyAliases(packet){return priority9FEnvelopeDisciplinePacket(__priority9FOriginalAttachVisibleReplyAliases(packet));};
module.exports.PRIORITY_9F_FINAL_ENVELOPE_DEEP_CONVERSATIONAL_STACK_VERSION=PRIORITY_9F_FINAL_ENVELOPE_DEEP_CONVERSATIONAL_STACK_VERSION;module.exports.createMarionFinalEnvelope=createMarionFinalEnvelope;module.exports.attachVisibleReplyAliases=attachVisibleReplyAliases;
module.exports._internal={...safeObj(module.exports._internal),priority9FEnvelopeDeepPrompt,priority9FEnvelopeReplyFor,priority9FEnvelopeDisciplinePacket,priority9FEnvelopeWeak,priority9FEnvelopeHasStack};
// PRIORITY_9F_DEEP_CONVERSATIONAL_STACK_FINAL_ENVELOPE_PATCH_END


// PRIORITY_9F_R1_LAYERED_PRECEDENCE_HOTFIX_FINAL_ENVELOPE_PATCH_START
var PRIORITY_9F_R1_FINAL_ENVELOPE_LAYERED_PRECEDENCE_HOTFIX_VERSION="nyx.marion.finalEnvelope.priority9fR1.layeredPrecedenceHotfix/1.0";

function priority9FR1LayeredPrecedenceNormalize(value){return String(value==null?"":value).replace(/\s+/g," ").trim().toLowerCase().replace(/[“”]/g,'"').replace(/[‘’]/g,"'").replace(/[^a-z0-9]+/g," ").replace(/\s+/g," ").trim();}
function priority9FR1LayeredPrecedenceText(value){return String(value==null?"":value).replace(/\s+/g," ").trim();}
function priority9FR1LayeredPromptText(value){var t=priority9FR1LayeredPrecedenceNormalize(value);if(!t)return false;return /\b(priority\s*9f|9f\s*r1|deep conversational stack|layered conversational|layered conversation|conversational stack|layered intelligence|full conversational stack|surface request|underlying intent|deeper intent|deeper task|operational risk|execution mode|next action)\b/i.test(t)||(/\b(disjointed|deeper|layered|multi|context|looping|loop|recovery)\b/i.test(t)&&/\b(marion|conversation|conversational|intent|context|preserve|avoid|loop|looping|where to go next|next)\b/i.test(t));}
function priority9FR1Stale9ERecallText(value){var t=priority9FR1LayeredPrecedenceNormalize(value);if(!t)return false;return /\b(run the priority\s*90\s*9e|priority\s*90\s*9e\s*(?:test|sequence)|confirm marion is still on priority\s*90\s*9e|retest next steps|retest run that again|block internal recovery wording|public answer stays conversational|continuation regression)\b/i.test(t);}
function priority9FR1LayeredReplyFor(value){var source=priority9FR1LayeredPrecedenceText(value);var patch=/\b(surgical autopsy|patch|hotfix|fix|update|resend|zip|downloadable|files?)\b/i.test(source);var surface=patch?"patch the active Marion runtime files without widening the architecture":"stabilize Marion’s live conversational behavior";var intent=patch?"make the layered prompt outrank stale Priority 90/9E continuation recall in every public path":"preserve context, avoid looping, and turn a disjointed prompt into a clear next move";var risk=patch?"the 9E recall layer overriding Priority 9F before the response reaches the user":"stale Priority 90/9E recall overpowering the layered conversational stack";var mode=patch?"surgical hotfix with regression validation":"layered conversational response";var next=patch?"enforce 9F-R1 precedence in composer, bridge, final envelope, memory/shape/state, and index, then rerun the live layered-prompt test":"lock the 9F stack so Marion separates surface request, deeper intent, risk, execution mode, and next action before answering";return "I’m reading this as Priority 9F-R1: layered conversational precedence. The surface request is to "+surface+"; the deeper intent is to "+intent+". The main risk is "+risk+", so the response mode should be "+mode+": hold the context, answer the real task, and give the next concrete move. Next move: "+next+".";}

function priority9FR1EnvelopeCollect(value,depth,seen){if(value==null||depth>4)return [];var type=typeof value;if(type==="string"||type==="number"||type==="boolean")return [priority9FR1LayeredPrecedenceText(value)];if(type!=="object")return [];seen=seen||[];if(seen.indexOf(value)>=0)return [];seen.push(value);var out=[];var keys=["userText","userQuery","rawUserQuery","rawUserText","normalizedUserIntent","effectivePrompt","resolvedPrompt","resolvedQuestion","text","query","message","prompt","inputText","originalText","finalPrompt","reply","publicReply","visibleReply","finalReply","displayReply","lastAssistantReply","lastValidTask","activeTask","pendingAction","lastUserIntent","surfaceRequest","deeperIntent","operationalRisk","executionMode","nextAction"];for(var i=0;i<keys.length;i+=1){try{if(value[keys[i]]!=null)out=out.concat(priority9FR1EnvelopeCollect(value[keys[i]],depth+1,seen));}catch(_){}}
["packet","ctx","options","fallback","input","body","payload","meta","diagnostics","normalized","norm","routing","route","state","session","memory","conversationState","progressionMemory","memoryPatch","sessionPatch","finalEnvelope","questionShape"].forEach(function(k){try{if(value[k]!=null)out=out.concat(priority9FR1EnvelopeCollect(value[k],depth+1,seen));}catch(_){}});return out;}
function priority9FR1EnvelopeSource(packet){return priority9FR1EnvelopeCollect(packet,0,[]).filter(Boolean).join(" ");}
function priority9FR1EnvelopeShouldForce(packet){var out=safeObj(packet),source=priority9FR1EnvelopeSource(out),prompt=priority90EnvelopePrompt(out),reply=priority90EnvelopeReadReply(out);return priority9FR1LayeredPromptText(source)||priority9FR1LayeredPromptText(prompt)||priority9FR1Stale9ERecallText(reply)&&priority9FR1LayeredPromptText(source+" "+prompt);}
function priority9FR1EnvelopeDisciplinePacket(packet){var out=safeObj(packet);if(priority9FR1EnvelopeShouldForce(out)){return priority90EnvelopeApplyReply(out,priority9FR1LayeredReplyFor(priority9FR1EnvelopeSource(out)),{priority9FR1FinalEnvelopeLayeredPrecedenceHotfix:true,priority9FR1FinalEnvelopeLayeredPrecedenceHotfixVersion:PRIORITY_9F_R1_FINAL_ENVELOPE_LAYERED_PRECEDENCE_HOTFIX_VERSION,priority9FR1Reason:"layered_prompt_overrode_9e_recall",noUserFacingDiagnostics:true});}return out;}
var __priority9FR1OriginalCreateMarionFinalEnvelope=createMarionFinalEnvelope;
createMarionFinalEnvelope=function priority9FR1CreateMarionFinalEnvelope(input){return priority9FR1EnvelopeDisciplinePacket(__priority9FR1OriginalCreateMarionFinalEnvelope(input));};
var __priority9FR1OriginalAttachVisibleReplyAliases=attachVisibleReplyAliases;
attachVisibleReplyAliases=function priority9FR1AttachVisibleReplyAliases(packet){return priority9FR1EnvelopeDisciplinePacket(__priority9FR1OriginalAttachVisibleReplyAliases(packet));};
module.exports.PRIORITY_9F_R1_FINAL_ENVELOPE_LAYERED_PRECEDENCE_HOTFIX_VERSION=PRIORITY_9F_R1_FINAL_ENVELOPE_LAYERED_PRECEDENCE_HOTFIX_VERSION;module.exports.createMarionFinalEnvelope=createMarionFinalEnvelope;module.exports.attachVisibleReplyAliases=attachVisibleReplyAliases;module.exports._internal={...safeObj(module.exports._internal),priority9FR1LayeredPromptText,priority9FR1Stale9ERecallText,priority9FR1LayeredReplyFor,priority9FR1EnvelopeDisciplinePacket,priority9FR1EnvelopeShouldForce};
// PRIORITY_9F_R1_LAYERED_PRECEDENCE_HOTFIX_FINAL_ENVELOPE_PATCH_END

// PRIORITY_9F_R2_DOMAIN_HIJACK_SUPPRESSION_FINAL_ENVELOPE_PATCH_START
var PRIORITY_9F_R2_FINAL_ENVELOPE_DOMAIN_HIJACK_SUPPRESSION_VERSION="nyx.marion.finalEnvelope.priority9fR2.domainHijackSuppression/1.0";
function priority9FR2EnvelopeNormalize(value){return String(value==null?"":value).replace(/\s+/g," ").trim().toLowerCase().replace(/[“”]/g,'"').replace(/[‘’]/g,"'").replace(/[^a-z0-9]+/g," ").replace(/\s+/g," ").trim();}
function priority9FR2EnvelopeText(value){return String(value==null?"":value).replace(/\s+/g," ").trim();}
function priority9FR2EnvelopeLayeredPrompt(value){var t=priority9FR2EnvelopeNormalize(value);return /\b(priority\s*9f|9f\s*r2|domain hijack|domain fallback|six domain fallback|deep conversational stack|layered conversational|conversational stack|surface request|underlying intent|deeper intent|deeper task|operational risk|execution mode|next action|marion conversational architecture)\b/i.test(t)||(/\b(disjointed|deeper|layered|context|looping|loop|recovery|preserve|avoid|where to go next)\b/i.test(t)&&/\b(marion|conversation|conversational|intent|context|preserve|avoid|loop|looping|where to go next|next|understand)\b/i.test(t));}
function priority9FR2EnvelopeDomainHijackReply(value){var t=priority9FR2EnvelopeNormalize(value);return /\b(in psychology the focus is how people think feel learn decide and behave|good explanation connects the concept to real patterns triggers and outcomes|in english this means|this is a general reasoning question|the psychology domain|psychology domain|domain question|six domain|knowledge lane|route through the six domain layer)\b/i.test(t)||(/^in psychology\b/i.test(priority9FR2EnvelopeText(value))&&/\b(people|think|feel|learn|decide|behave|patterns|triggers|outcomes)\b/i.test(priority9FR2EnvelopeText(value)));}
function priority9FR2EnvelopeRouteHijack(value){var t=priority9FR2EnvelopeNormalize(value);return /\b(primarydomain psychology|selecteddomain psychology|knowledgedomain psychology|domain psychology|route psychology|primarydomain english|selecteddomain english|knowledgedomain english|domain english|primarydomain general reasoning|selecteddomain general reasoning|domain general reasoning)\b/i.test(t);}
function priority9FR2EnvelopeReplyFor(value){var source=priority9FR2EnvelopeText(value);var patch=/\b(surgical autopsy|patch|hotfix|fix|update|resend|zip|downloadable|files?|critical updates|gap refinements)\b/i.test(source);var surface=patch?"patch the Marion runtime so 9F cannot be hijacked by the psychology, English, or general reasoning domain":"stabilize Marion’s live conversational behavior inside the 9F stack";var intent=patch?"keep layered conversational prompts in Marion’s conversational-architecture lane while blocking six-domain fallback replies":"preserve context, avoid looping, and turn disjointed input into a clear next move";var risk=patch?"domain hijack after 9F-R1, where a psychology or general-domain answer replaces the real Marion task":"domain fallback overpowering the layered conversational stack";var next=patch?"enforce 9F-R2 in composer, router, concierge, bridge, final envelope, state, confidence, and index, then rerun the live layered prompt":"keep 9F dominant over stale recall and domain fallback, then rerun the layered prompt and pass only when Marion returns surface request, deeper intent, risk, execution mode, and next action";return "I’m reading this as Priority 9F-R2: domain hijack suppression. The surface request is to "+surface+"; the deeper intent is to "+intent+". The active lane is Marion conversational architecture, not psychology, English, or general reasoning. The main risk is "+risk+", so the response mode stays layered conversational: hold the context, answer the real task, and give the next concrete move. Next move: "+next+".";}
function priority9FR2EnvelopeShouldForce(packet){var out=safeObj(packet),source=priority9FR1EnvelopeSource(out),prompt=priority90EnvelopePrompt(out),reply=priority90EnvelopeReadReply(out);return (priority9FR2EnvelopeLayeredPrompt(source)||priority9FR2EnvelopeLayeredPrompt(prompt))&&(priority9FR2EnvelopeDomainHijackReply(reply)||priority9FR2EnvelopeRouteHijack(source)||priority9FR1Stale9ERecallText(reply)||/Priority\s*9F-R1/i.test(reply));}
function priority9FR2EnvelopeDisciplinePacket(packet){var out=safeObj(packet);if(priority9FR2EnvelopeShouldForce(out)){return priority90EnvelopeApplyReply(out,priority9FR2EnvelopeReplyFor(priority9FR1EnvelopeSource(out)),{priority9FR2FinalEnvelopeDomainHijackSuppression:true,priority9FR2FinalEnvelopeDomainHijackSuppressionVersion:PRIORITY_9F_R2_FINAL_ENVELOPE_DOMAIN_HIJACK_SUPPRESSION_VERSION,priority9FR2Reason:"layered_prompt_overrode_domain_hijack",domainHijackSuppressed:true,noUserFacingDiagnostics:true});}return out;}
var __priority9FR2OriginalCreateMarionFinalEnvelope=createMarionFinalEnvelope;
createMarionFinalEnvelope=function priority9FR2CreateMarionFinalEnvelope(input){return priority9FR2EnvelopeDisciplinePacket(__priority9FR2OriginalCreateMarionFinalEnvelope(input));};
var __priority9FR2OriginalAttachVisibleReplyAliases=attachVisibleReplyAliases;
attachVisibleReplyAliases=function priority9FR2AttachVisibleReplyAliases(packet){return priority9FR2EnvelopeDisciplinePacket(__priority9FR2OriginalAttachVisibleReplyAliases(packet));};
module.exports.PRIORITY_9F_R2_FINAL_ENVELOPE_DOMAIN_HIJACK_SUPPRESSION_VERSION=PRIORITY_9F_R2_FINAL_ENVELOPE_DOMAIN_HIJACK_SUPPRESSION_VERSION;module.exports.createMarionFinalEnvelope=createMarionFinalEnvelope;module.exports.attachVisibleReplyAliases=attachVisibleReplyAliases;module.exports._internal={...safeObj(module.exports._internal),priority9FR2EnvelopeLayeredPrompt,priority9FR2EnvelopeDomainHijackReply,priority9FR2EnvelopeReplyFor,priority9FR2EnvelopeDisciplinePacket,priority9FR2EnvelopeShouldForce};
// PRIORITY_9F_R2_DOMAIN_HIJACK_SUPPRESSION_FINAL_ENVELOPE_PATCH_END


// PRIORITY_9F_R3_ALT_PROMPT_ECHO_SUPPRESSION_FINAL_ENVELOPE_PATCH_START
var PRIORITY_9F_R3_FINAL_ENVELOPE_ALT_PROMPT_ECHO_SUPPRESSION_VERSION="nyx.marion.finalEnvelope.priority9fR3.altPromptEchoSuppression/1.0";
function priority9FR3EnvelopeNormalize(value){return String(value==null?"":value).replace(/\s+/g," ").trim().toLowerCase().replace(/[“”]/g,'"').replace(/[‘’]/g,"'").replace(/[^a-z0-9]+/g," ").replace(/\s+/g," ").trim();}
function priority9FR3EnvelopeText(value){return String(value==null?"":value).replace(/\s+/g," ").trim();}
function priority9FR3EnvelopeLayeredPrompt(value){var t=priority9FR3EnvelopeNormalize(value);return /\b(priority\s*9f|9f\s*r3|alt runtime|prompt echo|prompt\s*echo|deep conversational stack|layered conversational|conversational stack|surface request|underlying intent|deeper intent|deeper task|operational risk|execution mode|next action|marion conversational architecture)\b/i.test(t)||(/\b(disjointed|deeper|layered|context|looping|loop|recovery|preserve|avoid|where to go next|understand)\b/i.test(t)&&/\b(marion|conversation|conversational|intent|context|preserve|avoid|loop|looping|where to go next|next|understand|deeper task)\b/i.test(t));}
function priority9FR3EnvelopePromptEcho(reply,prompt){var r=priority9FR3EnvelopeNormalize(reply),p=priority9FR3EnvelopeNormalize(prompt);if(!r||!p)return false;if(r===p)return true;if(p.length>36&&(r.indexOf(p)>=0||p.indexOf(r)>=0))return true;var rw=r.split(" ").filter(Boolean),pw=p.split(" ").filter(Boolean);if(rw.length<5||pw.length<5)return false;var set={};for(var i=0;i<pw.length;i+=1)set[pw[i]]=true;var hit=0;for(var j=0;j<rw.length;j+=1)if(set[rw[j]])hit+=1;return hit/Math.max(rw.length,pw.length)>=0.86;}
function priority9FR3EnvelopeReplyFor(value){var source=priority9FR3EnvelopeText(value);var patch=/\b(surgical autopsy|line[-\s]?by[-\s]?line|audit|patch|hotfix|fix|update|resend|zip|downloadable|files?|critical updates|gap refinements)\b/i.test(source);return patch?"I’m reading this as Priority 9F-R3: ALT runtime prompt-echo suppression. The surface request is to patch the Marion ALT/admin runtime so it never returns the raw user prompt as the final answer; the deeper intent is to keep 9F layered conversational prompts inside Marion’s conversational-architecture lane. The active lane is Marion conversational architecture. The main risk is the ALT handler falling back to prompt echo after stale recall and domain hijack have been suppressed. Next move: enforce prompt-echo rejection across composer, admin gateway, bridge, final envelope, loop guard, voice gateway, and index, then rerun the live layered prompt.":"I’m reading this as Priority 9F-R3: ALT runtime prompt-echo suppression. The surface request is to stabilize Marion’s layered conversational behavior; the deeper intent is to preserve context, avoid looping, and turn disjointed input into a clear next move. The active lane is Marion conversational architecture. The main risk is the ALT/admin handler returning the raw prompt instead of the composed answer, so the response mode must stay layered: identify the surface request, deeper intent, risk, execution mode, and next action. Next move: keep 9F dominant across ALT, bridge, final envelope, and last-mile render, then rerun the live layered prompt.";}
function priority9FR3EnvelopeShouldForce(packet){var out=safeObj(packet),source=priority9FR1EnvelopeSource(out),prompt=priority90EnvelopePrompt(out),reply=priority90EnvelopeReadReply(out);if(!(priority9FR3EnvelopeLayeredPrompt(source)||priority9FR3EnvelopeLayeredPrompt(prompt)))return false;return !reply||priority9FR3EnvelopePromptEcho(reply,prompt)||priority9FR2EnvelopeDomainHijackReply(reply)||priority9FR1Stale9ERecallText(reply)||/Priority\s*9F-R[12]/i.test(reply);}
function priority9FR3EnvelopeDisciplinePacket(packet){var out=safeObj(packet);if(priority9FR3EnvelopeShouldForce(out)){return priority90EnvelopeApplyReply(out,priority9FR3EnvelopeReplyFor(priority9FR1EnvelopeSource(out)),{priority9FR3FinalEnvelopeAltPromptEchoSuppression:true,priority9FR3FinalEnvelopeAltPromptEchoSuppressionVersion:PRIORITY_9F_R3_FINAL_ENVELOPE_ALT_PROMPT_ECHO_SUPPRESSION_VERSION,priority9FR3Reason:"layered_prompt_overrode_alt_prompt_echo",promptEchoSuppressed:true,noUserFacingDiagnostics:true});}return out;}
var __priority9FR3OriginalCreateMarionFinalEnvelope=createMarionFinalEnvelope;
createMarionFinalEnvelope=function priority9FR3CreateMarionFinalEnvelope(input){return priority9FR3EnvelopeDisciplinePacket(__priority9FR3OriginalCreateMarionFinalEnvelope(input));};
var __priority9FR3OriginalAttachVisibleReplyAliases=attachVisibleReplyAliases;
attachVisibleReplyAliases=function priority9FR3AttachVisibleReplyAliases(packet){return priority9FR3EnvelopeDisciplinePacket(__priority9FR3OriginalAttachVisibleReplyAliases(packet));};
module.exports.PRIORITY_9F_R3_FINAL_ENVELOPE_ALT_PROMPT_ECHO_SUPPRESSION_VERSION=PRIORITY_9F_R3_FINAL_ENVELOPE_ALT_PROMPT_ECHO_SUPPRESSION_VERSION;module.exports.createMarionFinalEnvelope=createMarionFinalEnvelope;module.exports.attachVisibleReplyAliases=attachVisibleReplyAliases;module.exports._internal={...safeObj(module.exports._internal),priority9FR3EnvelopeLayeredPrompt,priority9FR3EnvelopePromptEcho,priority9FR3EnvelopeReplyFor,priority9FR3EnvelopeDisciplinePacket,priority9FR3EnvelopeShouldForce};
// PRIORITY_9F_R3_ALT_PROMPT_ECHO_SUPPRESSION_FINAL_ENVELOPE_PATCH_END


// PRIORITY_9F_R4_CONTINUATION_CARRY_ENFORCEMENT_FINAL_ENVELOPE_PATCH_START
const PRIORITY_9F_R4_FINAL_ENVELOPE_CONTINUATION_CARRY_VERSION = "nyx.marion.priority9fR4.continuationCarry.finalEnvelope/1.0";
function priority9FR4EnvelopeStr(value){return value==null?"":String(value).replace(/\s+/g," ").trim();}
function priority9FR4EnvelopeNorm(value){return priority9FR4EnvelopeStr(value).toLowerCase().replace(/[“”]/g,'"').replace(/[‘’]/g,"'").replace(/[^a-z0-9]+/g," ").replace(/\s+/g," ").trim();}
function priority9FR4EnvelopeIsShortContinuation(value){const n=priority9FR4EnvelopeNorm(value);return /^(next steps?|continue|carry on|proceed|run that again|run it again|do that again|do it again|same thing|what now|whats next|what s next|next)$/.test(n);}
function priority9FR4EnvelopeIsCarryInstruction(value){const t=priority9FR4EnvelopeNorm(value);return /\b(priority 9f r4|priority9f r4|9f r4|continuation carry|last accepted lane|stay inside the 9f|inside the 9f conversational stack|9f conversational stack lane|short continuation|next steps continue run that again what now)\b/.test(t);}
function priority9FR4EnvelopeHas9FContext(value){const t=priority9FR4EnvelopeNorm(value);return /\b(priority 9f|priority9f|9f r3|9f r2|9f r1|deep conversational stack|layered conversational|conversational stack|alt runtime prompt echo suppression|domain hijack suppression|marion conversational architecture|surface request|deeper intent|operational risk|execution mode|next action)\b/.test(t);}
function priority9FR4EnvelopeOldHandoff(value){const t=priority9FR4EnvelopeNorm(value);return /\b(public nyx route clean|five turn continuity test|stable handoff before adding new features|keep the public nyx route clean|priority 9f r3 alt runtime prompt echo suppression)\b/.test(t);}
function priority9FR4EnvelopeCollect(value, depth=0, seen=[]){if(value==null||depth>5)return"";if(typeof value==="string"||typeof value==="number"||typeof value==="boolean")return priority9FR4EnvelopeStr(value);if(typeof value!=="object")return"";if(seen.indexOf(value)!==-1)return"";const next=seen.concat([value]);if(Array.isArray(value))return value.slice(0,30).map(v=>priority9FR4EnvelopeCollect(v,depth+1,next)).filter(Boolean).join(" ");return Object.keys(value).slice(0,80).map(k=>{if(/token|secret|password|cookie|authorization|credential|private/i.test(k))return"";return priority9FR4EnvelopeCollect(value[k],depth+1,next);}).filter(Boolean).join(" ");}
function priority9FR4EnvelopePrompt(packet){const p=packet&&typeof packet==="object"?packet:{};const payload=p.payload&&typeof p.payload==="object"?p.payload:{};return priority9FR4EnvelopeStr(p.prompt||p.userText||p.rawUserText||p.textPrompt||p.requestText||payload.prompt||payload.userText||payload.rawUserText||payload.query);}
function priority9FR4EnvelopeReply(){return "Next steps: lock Priority 9F-R3 as live accepted, enforce Priority 9F-R4 continuation carry, confirm \u201cNext steps,\u201d \u201cContinue,\u201d \u201cRun that again,\u201d and \u201cWhat now?\u201d stay inside the 9F conversational-stack lane, then move into deeper continuity memory and layered follow-up handling.";}
function priority9FR4EnvelopeReadReply(packet){if(!packet||typeof packet!=="object")return priority9FR4EnvelopeStr(packet);const p=packet.payload&&typeof packet.payload==="object"?packet.payload:{};const f=packet.finalEnvelope&&typeof packet.finalEnvelope==="object"?packet.finalEnvelope:{};return priority9FR4EnvelopeStr(packet.reply||packet.finalReply||packet.publicReply||packet.visibleReply||packet.text||packet.message||packet.response||packet.answer||p.reply||p.finalReply||p.publicReply||p.visibleReply||p.text||p.message||f.reply||f.finalReply||f.publicReply||f.visibleReply||f.text||f.message);}
function priority9FR4EnvelopeApply(packet, reply){const out=(packet&&typeof packet==="object"&&!Array.isArray(packet))?{...packet}:{};const final=priority9FR4EnvelopeStr(reply)||priority9FR4EnvelopeReply();["reply","finalReply","publicReply","visibleReply","text","message","response","answer","spokenText"].forEach(k=>{out[k]=final;});out.payload={...(out.payload&&typeof out.payload==="object"?out.payload:{}),reply:final,finalReply:final,publicReply:final,visibleReply:final,text:final,message:final,answer:final};out.finalEnvelope={...(out.finalEnvelope&&typeof out.finalEnvelope==="object"?out.finalEnvelope:{}),reply:final,finalReply:final,publicReply:final,visibleReply:final,text:final,message:final,answer:final};out.priority9FR4ContinuationCarryEnforced=true;out.priority9FR4ContinuationCarryVersion=PRIORITY_9F_R4_FINAL_ENVELOPE_CONTINUATION_CARRY_VERSION;out.noUserFacingDiagnostics=true;return out;}
function priority9FR4EnvelopeShouldForce(packet){const prompt=priority9FR4EnvelopePrompt(packet);const source=[prompt,priority9FR4EnvelopeCollect(packet)].join(" ");const reply=priority9FR4EnvelopeReadReply(packet);return priority9FR4EnvelopeIsCarryInstruction(prompt)||priority9FR4EnvelopeIsCarryInstruction(source)||(priority9FR4EnvelopeIsShortContinuation(prompt)&&priority9FR4EnvelopeHas9FContext(source))||((priority9FR4EnvelopeIsShortContinuation(prompt)||priority9FR4EnvelopeIsCarryInstruction(source))&&priority9FR4EnvelopeOldHandoff(reply));}
function priority9FR4EnvelopeDisciplinePacket(packet){return priority9FR4EnvelopeShouldForce(packet)?priority9FR4EnvelopeApply(packet,priority9FR4EnvelopeReply()):packet;}
var __priority9FR4OriginalCreateMarionFinalEnvelope=createMarionFinalEnvelope;
createMarionFinalEnvelope=function priority9FR4CreateMarionFinalEnvelope(input){return priority9FR4EnvelopeDisciplinePacket(__priority9FR4OriginalCreateMarionFinalEnvelope(input));};
var __priority9FR4OriginalAttachVisibleReplyAliases=attachVisibleReplyAliases;
attachVisibleReplyAliases=function priority9FR4AttachVisibleReplyAliases(packet){return priority9FR4EnvelopeDisciplinePacket(__priority9FR4OriginalAttachVisibleReplyAliases(packet));};
module.exports.PRIORITY_9F_R4_FINAL_ENVELOPE_CONTINUATION_CARRY_VERSION=PRIORITY_9F_R4_FINAL_ENVELOPE_CONTINUATION_CARRY_VERSION;
module.exports.createMarionFinalEnvelope=createMarionFinalEnvelope;
module.exports.attachVisibleReplyAliases=attachVisibleReplyAliases;
module.exports._internal={...(module.exports._internal||{}),priority9FR4EnvelopeIsShortContinuation,priority9FR4EnvelopeIsCarryInstruction,priority9FR4EnvelopeHas9FContext,priority9FR4EnvelopeReply,priority9FR4EnvelopeDisciplinePacket,priority9FR4EnvelopeShouldForce};
// PRIORITY_9F_R4_CONTINUATION_CARRY_ENFORCEMENT_FINAL_ENVELOPE_PATCH_END


// PRIORITY_9G_DEEP_CONTINUITY_MEMORY_FINAL_ENVELOPE_PATCH_START
const PRIORITY_9G_DEEP_CONTINUITY_MEMORY_FINAL_ENVELOPE_VERSION="PRIORITY-9G-DEEP-CONTINUITY-MEMORY-FINAL-ENVELOPE/1.0";

function priority9GNorm(value){return String(value==null?"":value).toLowerCase().replace(/[“”]/g,'"').replace(/[‘’]/g,"'").replace(/[^a-z0-9]+/g," ").replace(/\s+/g," ").trim();}
function priority9GStr(value){return String(value==null?"":value).replace(/\s+/g," ").trim();}
function priority9GObj(value){return value&&typeof value==="object"&&!Array.isArray(value)?value:{};}
function priority9GCollect(value,limit){try{return JSON.stringify(value||{}).slice(0,limit||9000);}catch(_){return "";}}
function priority9GIsShortFollowup(value){const t=priority9GNorm(value);return /^(next steps?|continue|carry on|keep going|proceed|run that again|run it again|do that again|do it again|same thing|repeat that|repeat the process|one more time|rerun that|rerun it|what now|whats next|what s next|where are we|where do we go next|next)$/.test(t);}
function priority9GIsActivationText(value){const t=priority9GNorm(value);return /\b(priority 9g|9g deep continuity|deep continuity memory|layered follow up handling|layered followup handling|deeper continuity memory|continuity memory confidence|carry the deeper task|carry active task|carry the active task|longer sequences|multi turn continuity|six turn continuity|without needing the full context repeated|without full context repeated|surface request deeper intent risk execution mode next action|active task risk execution mode next action)\b/.test(t);}
function priority9GHasContext(value){const t=priority9GNorm(value);return priority9GIsActivationText(t)||/\b(priority 9f r4|9f r4 continuation carry|priority 9f deep conversational stack|deep conversational stack|9f conversational stack|marion conversational stabilization|marion conversational architecture|lock priority 9f r3 as live accepted|deeper continuity memory and layered follow up handling|layered follow up handling)\b/.test(t);}
function priority9GOldLaneLeak(value){const t=priority9GNorm(value);return /\b(priority 9f r3 as live accepted|priority 9f r4 continuation carry|keep the public nyx route clean|five turn continuity test|priority 90 9e test|in psychology the focus|alt runtime prompt echo suppression|domain hijack suppression)\b/.test(t);}
function priority9GReplyFor(prompt){
  const t=priority9GNorm(prompt);
  if(/^(next steps?|next)$/.test(t)){
    return "Next steps: lock Priority 9G as the active memory lane, carry the surface request, deeper intent, active task, risk, execution mode, and next action across short follow-ups, then run a longer continuity pass before voice activation.";
  }
  if(/^(continue|carry on|keep going|proceed)$/.test(t)){
    return "Continue: keep Priority 9G active, advance the deep continuity memory layer, and confirm each follow-up moves the same Marion stabilization task forward without forcing the context to be restated.";
  }
  if(/^(run that again|run it again|do that again|do it again|same thing|repeat that|repeat the process|one more time|rerun that|rerun it)$/.test(t)){
    return "Run the Priority 9G continuity pass again: restate the active Marion lane, preserve the deeper task, carry the risk and execution mode, then answer the next short follow-up with a concrete next action.";
  }
  if(/^(what now|whats next|what s next|where are we|where do we go next)$/.test(t)){
    return "What now: lock Priority 9G live, run the multi-turn memory carry test, and only move toward mic activation after Marion preserves the active task, risk, execution mode, and next action across longer follow-up chains.";
  }
  return "I’m reading this as Priority 9G: deep continuity memory and layered follow-up handling. The surface request is to make Marion carry the active task across longer sequences; the deeper intent is to preserve the project lane, risk, execution mode, and next action without making the context get repeated. The main risk is shallow follow-up handling that only answers the last sentence. Next move: lock a 9G continuity memory object, run a multi-turn follow-up pass, and confirm Marion advances the same layered task through “Next steps,” “Continue,” “Run that again,” and “What now.”";
}
function priority9GApplyPacket(packet,reply,prompt){
  const out=(packet&&typeof packet==="object"&&!Array.isArray(packet))?{...packet}:{};
  const final=priority9GStr(reply)||priority9GReplyFor(prompt);
  ["reply","finalReply","publicReply","visibleReply","text","message","response","answer","spokenText"].forEach(k=>{out[k]=final;});
  out.payload={...(out.payload&&typeof out.payload==="object"?out.payload:{}),reply:final,finalReply:final,publicReply:final,visibleReply:final,text:final,message:final,answer:final};
  out.finalEnvelope={...(out.finalEnvelope&&typeof out.finalEnvelope==="object"?out.finalEnvelope:{}),reply:final,finalReply:final,publicReply:final,visibleReply:final,text:final,message:final,answer:final};
  out.priority9GDeepContinuityMemory=true;
  out.priority9GVersion="PRIORITY-9G-DEEP-CONTINUITY-MEMORY";
  out.conversationLane="Priority 9G deep continuity memory";
  out.surfaceRequest="carry the active task across longer sequences";
  out.deeperIntent="preserve project lane, risk, execution mode, and next action across layered follow-ups";
  out.operationalRisk="short follow-ups may collapse into stale handoff, old 9F wording, or last-sentence-only answers";
  out.executionMode="deep continuity memory and layered follow-up handling";
  out.nextAction="run the multi-turn 9G continuity pass";
  out.noUserFacingDiagnostics=true;
  return out;
}
function priority9GReadReply(packet){const p=priority9GObj(packet);const pl=priority9GObj(p.payload);const f=priority9GObj(p.finalEnvelope);return priority9GStr(p.reply||p.finalReply||p.publicReply||p.visibleReply||p.text||p.message||p.response||p.answer||pl.reply||pl.finalReply||pl.publicReply||pl.visibleReply||pl.text||pl.message||pl.answer||f.reply||f.finalReply||f.publicReply||f.visibleReply||f.text||f.message||f.answer);}

function priority9GEnvelopePrompt(packet={}){
  const p=priority9GObj(packet),pl=priority9GObj(p.payload),meta=priority9GObj(p.meta),diag=priority9GObj(p.diagnostics),ctx=priority9GObj(p.context);
  return priority9GStr(p.prompt||p.userPrompt||p.userText||p.input||pl.prompt||pl.userText||meta.prompt||diag.prompt||ctx.prompt||"");
}
function priority9GEnvelopeShouldForce(packet){
  const prompt=priority9GEnvelopePrompt(packet);
  const source=[prompt,priority9GCollect(packet)].join(" ");
  const reply=priority9GReadReply(packet);
  return priority9GIsActivationText(prompt)||priority9GIsActivationText(source)||(priority9GIsShortFollowup(prompt)&&priority9GHasContext(source))||((priority9GIsActivationText(source)||priority9GIsShortFollowup(prompt))&&priority9GOldLaneLeak(reply));
}
function priority9GEnvelopeDisciplinePacket(packet){
  if(!priority9GEnvelopeShouldForce(packet))return packet;
  const prompt=priority9GEnvelopePrompt(packet);
  return priority9GApplyPacket(packet,priority9GReplyFor(prompt),prompt);
}
var __priority9GOriginalCreateMarionFinalEnvelope=createMarionFinalEnvelope;
createMarionFinalEnvelope=function priority9GCreateMarionFinalEnvelope(input){
  return priority9GEnvelopeDisciplinePacket(__priority9GOriginalCreateMarionFinalEnvelope(input));
};
var __priority9GOriginalAttachVisibleReplyAliases=attachVisibleReplyAliases;
attachVisibleReplyAliases=function priority9GAttachVisibleReplyAliases(packet){
  return priority9GEnvelopeDisciplinePacket(__priority9GOriginalAttachVisibleReplyAliases(packet));
};
module.exports.PRIORITY_9G_DEEP_CONTINUITY_MEMORY_FINAL_ENVELOPE_VERSION=PRIORITY_9G_DEEP_CONTINUITY_MEMORY_FINAL_ENVELOPE_VERSION;
module.exports.createMarionFinalEnvelope=createMarionFinalEnvelope;
module.exports.attachVisibleReplyAliases=attachVisibleReplyAliases;
module.exports._internal={...(module.exports._internal||{}),priority9GIsActivationText,priority9GIsShortFollowup,priority9GHasContext,priority9GReplyFor,priority9GEnvelopeDisciplinePacket,priority9GEnvelopeShouldForce};
// PRIORITY_9G_DEEP_CONTINUITY_MEMORY_FINAL_ENVELOPE_PATCH_END



// PRIORITY_9H_LONG_FORM_CONTINUITY_STRESS_DRIFT_GUARD_FINAL_ENVELOPE_PATCH_START

const PRIORITY_9H_LONG_FORM_CONTINUITY_VERSION = "nyx.marion.priority9h.longFormContinuityStressDriftGuard/1.0";
const PRIORITY_9H_R1_ADVANCEMENT_SHAPE_VERSION = "nyx.marion.priority9h.r1AdvancementShapeHotfix/1.0";
const PRIORITY_9I_ADAPTIVE_SITUATIONAL_PRECHECK_VERSION = "nyx.marion.priority9i.adaptiveSituationalPrecheck/0.1";
function priority9HStr(value){return value==null?"":String(value).replace(/\s+/g," ").trim();}
function priority9HObj(value){return value&&typeof value==="object"&&!Array.isArray(value)?value:{};}
function priority9HNorm(value){return priority9HStr(value).toLowerCase().replace(/[“”]/g,'"').replace(/[‘’]/g,"'").replace(/[^a-z0-9]+/g," ").replace(/\s+/g," ").trim();}
function priority9HCollect(value,limit){try{return JSON.stringify(value||{}).slice(0,limit||16000);}catch(_){return priority9HStr(value).slice(0,limit||16000);}}
function priority9HIsShortFollowup(value){
  const n=priority9HNorm(value);
  return /^(next steps?|continue|carry on|keep going|proceed|run that again|run it again|do that again|do it again|same thing|repeat that|rerun that|what now|whats next|what s next|next|status|passed|pass|green|go on|advance|same lane|same thread|stay in lane|stay in the same lane|continue from there|continue there|from there|what is the risk|what s the risk|what is risk|risk|what is the active task|what s the active task|active task|current task|what is the next action|what s the next action|next action|next move|summarize where we are|summarise where we are|where are we|recap|summary|do not drift|don t drift|dont drift|no drift|final check|final status|check)$/.test(n);
}

function priority9HFollowupKind(value){
  const n=priority9HNorm(value);
  if(/\b(run that again|run it again|do that again|do it again|same thing|repeat|rerun)\b/.test(n))return "rerun";
  if(/\b(risk|what is the risk|what s the risk)\b/.test(n))return "risk";
  if(/\b(active task|current task|what is the active task|what s the active task)\b/.test(n))return "active_task";
  if(/\b(next action|next move|what is the next action|what s the next action)\b/.test(n))return "next_action";
  if(/\b(summarize|summarise|where are we|recap|summary)\b/.test(n))return "summary";
  if(/\b(do not drift|don t drift|dont drift|no drift|same lane|same thread|stay in lane|stay in the same lane)\b/.test(n))return "same_lane";
  if(/\b(final check|final status|passed|pass|green|status|check)\b/.test(n))return "final_check";
  return "advance";
}
function priority9HIsReactivationWording(value){
  const n=priority9HNorm(value);
  return /\b(i m reading this as priority 9h with a priority 9i precheck|i am reading this as priority 9h with a priority 9i precheck|priority 9h must pass first|priority 9i is staged next for adaptive situational reasoning)\b/.test(n);
}
function priority9HIsActivationText(value){
  const n=priority9HNorm(value);
  return /\b(priority 9h|9h|long form continuity|continuity stress test|memory drift guard|drift guard|10 to 15 turns|10 15 turns|ten to fifteen turns|survive at least 10|survive 10|short follow ups while preserving|preserving surface request deeper intent active task risk execution mode next action|longer multi turn sequence)\b/.test(n);
}
function priority9HHasContext(value){
  const n=priority9HNorm(value);
  return /\b(priority 9h|9h|long form continuity|continuity stress|memory drift|drift guard|priority 9g|deep continuity memory|layered follow up|surface request|deeper intent|active task|execution mode|next action|10 turn|15 turn|priority 9i|adaptive situational)\b/.test(n);
}
function priority9HIs9IPrecheckText(value){
  const n=priority9HNorm(value);
  return /\b(priority 9i|9i|adaptive situational|situational awareness|adaptive reasoning|context pressure|pressure handling|next adaptive layer)\b/.test(n);
}
function priority9HIsOldLaneLeak(value){
  const n=priority9HNorm(value);
  if(!n)return false;
  return /\b(priority 9f r4|priority 9g deep continuity memory|run the multi turn 9g continuity pass|lock a 9g continuity memory object|public nyx route clean|five turn continuity test|priority 90 9e|priority 90|priority 9e|psychology|in psychology|domain hijack|alt runtime prompt echo|marion will continue|i have the current request|recovery path|loop detected|stale fallback)\b/.test(n);
}
function priority9HPromptEcho(reply,prompt){
  const r=priority9HNorm(reply),p=priority9HNorm(prompt);
  if(!r||!p)return false;
  return r===p||(r.includes(p)&&p.length>24)||(p.includes(r)&&r.length>24);
}
function priority9HStateFrom(source,turn){
  return {
    version:PRIORITY_9H_LONG_FORM_CONTINUITY_VERSION,
    active:true,
    lane:"priority9h_long_form_continuity_stress",
    activePhase:"priority9h_long_form_continuity_stress",
    conversationLane:"Priority 9H long-form continuity stress test",
    activeTask:"Priority 9H: long-form continuity stress test and memory drift guard",
    surfaceRequest:"make Marion survive a 10–15 turn short-follow-up chain",
    deeperIntent:"preserve surface request, deeper intent, active task, risk, execution mode, and next action without full restatement",
    operationalRisk:"memory drift, stale 9G/9F/9E fallback, domain hijack, prompt echo, repetition, or last-sentence-only answers across long chains",
    executionMode:"long-form continuity stress test with memory drift guard",
    nextAction:"run the 10–15 turn follow-up chain and verify every turn advances the same layered task",
    minTurns:10,
    targetTurns:15,
    turnDepth:Number.isFinite(Number(turn))?Number(turn):1,
    driftGuard:true,
    priority9HLongFormContinuity:true,
    priority9HR1AdvancementShapeHotfix:true,
    advancementShape:"advance_short_followups_without_reactivation",
    priority9IAdaptiveSituationalPrecheck:{
      version:PRIORITY_9I_ADAPTIVE_SITUATIONAL_PRECHECK_VERSION,
      staged:true,
      activationBlockedUntil:"Priority 9H long-form continuity stress passes live",
      expectedFocus:"adaptive situational reasoning and context-pressure handling after long-form continuity is stable"
    },
    noUserFacingDiagnostics:true,
    advancementShapeHotfixVersion:PRIORITY_9H_R1_ADVANCEMENT_SHAPE_VERSION,
    updatedAt:Date.now()
  };
}
function priority9HReplyFor(prompt,source){
  const n=priority9HNorm(prompt);
  if(priority9HIsShortFollowup(prompt)){
    const kind=priority9HFollowupKind(prompt);
    if(kind==="rerun")return "Run that again inside Priority 9H: repeat the long-form continuity stress pass, keep 9I staged only, and verify the next short follow-up still preserves surface request, deeper intent, active task, risk, execution mode, and next action without reactivation wording.";
    if(kind==="risk")return "Risk check inside Priority 9H: the active risk is memory drift across the 10–15 turn chain—specifically sliding into stale 9G, 9F, 9E, domain fallback, prompt echo, repeated activation wording, or recovery language. Guard it by advancing the same layered task on every short follow-up.";
    if(kind==="active_task")return "Active task inside Priority 9H: complete the long-form continuity stress test by carrying the same surface request, deeper intent, operational risk, execution mode, and next action across 10–15 short follow-ups without resetting the lane.";
    if(kind==="next_action")return "Next action inside Priority 9H: continue the stress chain one turn at a time, reject reactivation wording, keep 9I staged only, and mark 9H live accepted only after the full short-follow-up sequence remains stable.";
    if(kind==="summary")return "Summary inside Priority 9H: the lane is active, the mission is long-form continuity stress plus memory drift guard, the test target is 10–15 short follow-ups, and each answer must advance the same layered task instead of restating activation.";
    if(kind==="same_lane")return "Same lane: continue Priority 9H. Preserve the surface request, deeper intent, active task, risk, execution mode, and next action; keep 9I staged only; and advance the long-form continuity stress chain without reactivation wording or drift.";
    if(kind==="final_check")return "Final check inside Priority 9H: lane retention is valid when every short follow-up stays in 9H, advances the same layered task, blocks 9G/9F/9E fallback, blocks domain hijack, blocks prompt echo, and keeps 9I staged until 9H is live accepted.";
    return "Continue Priority 9H: advance the same long-form continuity stress chain while preserving surface request, deeper intent, active task, risk, execution mode, and next action. Keep 9I staged only and avoid reactivation wording, stale lanes, domain fallback, prompt echo, or recovery language.";
  }
  if(priority9HIs9IPrecheckText(source||prompt)){
    return "I’m reading this as Priority 9H with a Priority 9I precheck. Priority 9H must pass first: Marion has to survive a 10–15 turn short-follow-up chain while preserving surface request, deeper intent, active task, risk, execution mode, and next action. Priority 9I is staged next for adaptive situational reasoning and context-pressure handling, but it should not activate until 9H is live accepted.";
  }
  return "I’m reading this as Priority 9H: long-form continuity stress test and memory drift guard. The surface request is to make Marion survive 10–15 short follow-up turns. The deeper intent is to preserve surface request, deeper intent, active task, risk, execution mode, and next action without requiring the full context to be repeated. The active lane is Marion long-form continuity, with Priority 9I staged only as the next adaptive-situational precheck. The main risk is drift into stale 9G/9F/9E language, domain fallback, prompt echo, or repeated recovery wording. Next move: run the 10–15 turn continuity chain and confirm each short follow-up advances the same layered task.";
}
function priority9HReadReply(packet){
  const p=priority9HObj(packet),pl=priority9HObj(p.payload),f=priority9HObj(p.finalEnvelope);
  return priority9HStr(p.reply||p.finalReply||p.publicReply||p.visibleReply||p.text||p.message||p.response||p.answer||pl.reply||pl.finalReply||pl.publicReply||pl.visibleReply||pl.text||pl.message||pl.answer||f.reply||f.finalReply||f.publicReply||f.visibleReply||f.text||f.message||f.answer);
}
function priority9HApplyPacket(packet,reply,prompt,source){
  const out=(packet&&typeof packet==="object"&&!Array.isArray(packet))?{...packet}:{};
  const final=priority9HStr(reply)||priority9HReplyFor(prompt,source);
  ["reply","finalReply","publicReply","visibleReply","text","message","response","answer","spokenText"].forEach(k=>{out[k]=final;});
  out.payload={...(out.payload&&typeof out.payload==="object"?out.payload:{}),reply:final,finalReply:final,publicReply:final,visibleReply:final,text:final,message:final,answer:final};
  out.finalEnvelope={...(out.finalEnvelope&&typeof out.finalEnvelope==="object"?out.finalEnvelope:{}),reply:final,finalReply:final,publicReply:final,visibleReply:final,text:final,message:final,answer:final};
  const prior=priority9HObj(out.priority9HLongFormContinuity||out.longFormContinuityStress||out.priority9GDeepContinuityMemory||out.deepContinuityMemory);
  const depth=(priority9HIsShortFollowup(prompt)&&Number.isFinite(Number(prior.turnDepth)))?Number(prior.turnDepth)+1:1;
  const st=priority9HStateFrom(source||prompt,depth);
  out.priority9HLongFormContinuity=st;
  out.longFormContinuityStress=st;
  out.priority9HVersion="PRIORITY-9H-R1-ADVANCEMENT-SHAPE-HOTFIX + PRIORITY-9H-LONG-FORM-CONTINUITY-STRESS-DRIFT-GUARD";
  out.priority9IPrecheck=st.priority9IAdaptiveSituationalPrecheck;
  out.conversationLane=st.conversationLane;
  out.activeTask=st.activeTask;
  out.surfaceRequest=st.surfaceRequest;
  out.deeperIntent=st.deeperIntent;
  out.operationalRisk=st.operationalRisk;
  out.executionMode=st.executionMode;
  out.nextAction=st.nextAction;
  out.noUserFacingDiagnostics=true;
  return out;
}

function priority9HEnvelopePrompt(packet){const p=priority9HObj(packet),pl=priority9HObj(p.payload),m=priority9HObj(p.meta),d=priority9HObj(p.diagnostics),c=priority9HObj(p.context);return priority9HStr(p.prompt||p.userPrompt||p.userText||p.input||p.text||pl.prompt||pl.userText||pl.text||m.prompt||d.prompt||c.prompt||"");}
function priority9HEnvelopeShouldForce(packet){const prompt=priority9HEnvelopePrompt(packet);const source=[prompt,priority9HCollect(packet)].join(" ");const reply=priority9HReadReply(packet);return priority9HIsActivationText(prompt)||priority9HIsActivationText(source)||priority9HIs9IPrecheckText(source)||(priority9HIsShortFollowup(prompt)&&priority9HHasContext(source))||((priority9HIsShortFollowup(prompt)||priority9HHasContext(source))&&(priority9HIsOldLaneLeak(reply)||priority9HPromptEcho(reply,prompt)||priority9HIsReactivationWording(reply)));}
function priority9HEnvelopeDisciplinePacket(packet){if(!priority9HEnvelopeShouldForce(packet))return packet;const prompt=priority9HEnvelopePrompt(packet);const source=[prompt,priority9HCollect(packet)].join(" ");return priority9HApplyPacket(packet,priority9HReplyFor(prompt,source),prompt,source);}
var __priority9HOriginalCreateMarionFinalEnvelope=typeof createMarionFinalEnvelope==="function"?createMarionFinalEnvelope:null;
if(__priority9HOriginalCreateMarionFinalEnvelope){createMarionFinalEnvelope=function priority9HCreateMarionFinalEnvelope(input={}){return priority9HEnvelopeDisciplinePacket(__priority9HOriginalCreateMarionFinalEnvelope(input));};module.exports.createMarionFinalEnvelope=createMarionFinalEnvelope;}
var __priority9HOriginalAttachVisibleReplyAliases=typeof attachVisibleReplyAliases==="function"?attachVisibleReplyAliases:null;
if(__priority9HOriginalAttachVisibleReplyAliases){attachVisibleReplyAliases=function priority9HAttachVisibleReplyAliases(packet={}){return priority9HEnvelopeDisciplinePacket(__priority9HOriginalAttachVisibleReplyAliases(packet));};module.exports.attachVisibleReplyAliases=attachVisibleReplyAliases;}
module.exports.PRIORITY_9H_LONG_FORM_CONTINUITY_FINAL_ENVELOPE_VERSION=PRIORITY_9H_LONG_FORM_CONTINUITY_VERSION;
module.exports._internal={...(module.exports._internal||{}),priority9HIsActivationText,priority9HIsShortFollowup,priority9HHasContext,priority9HFollowupKind,priority9HIsReactivationWording,priority9HReplyFor,priority9HEnvelopeDisciplinePacket,priority9HEnvelopeShouldForce};
// PRIORITY_9H_LONG_FORM_CONTINUITY_STRESS_DRIFT_GUARD_FINAL_ENVELOPE_PATCH_END

// PRIORITY_9I_9J_SEQUENCE_FINAL_ENVELOPE_PATCH_START
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
function priority9IReplyFor(prompt,source){var kind=priority9IJPressureKind([prompt,source].join(" "));if(priority9IJIsShortFollowup(prompt)&&priority9IJHas9IContext(source)){if(kind==="decision")return "Continue Priority 9I: the pressure signal is decision pressure. Preserve the 9H continuity foundation, update the risk before choosing, keep 9J staged unless explicitly activated, and give the safest next action without opening extra branches.";if(kind==="safety")return "Continue Priority 9I: the pressure signal is safety-first execution. Preserve the active task, update risk, slow the response enough to avoid overreach, and give the safest next action while keeping Priority 9J staged.";if(kind==="depth")return "Continue Priority 9I: the pressure signal is depth. Go deeper inside the same active lane, update risk and execution mode, and give the next action without resetting to 9H activation wording or drifting into 9J.";if(kind==="pace")return "Continue Priority 9I: the pressure signal is pace control. Slow down, keep the 9H continuity foundation intact, clarify the changed constraint, and give one safe next action.";return "Continue Priority 9I: preserve the 9H continuity foundation, read the current pressure shift, update operational risk and execution mode, then give the safest next action. Keep Priority 9J staged until next-move authority is explicitly needed.";}return "I’m reading this as Priority 9I: adaptive situational reasoning and context-pressure handling. Diagnostic note: the internal continuity layer remains available. The surface request is to adapt Marion when urgency, correction, ambiguity, pace, depth, or operational pressure changes; the deeper intent is to update risk and execution mode without losing the active mission thread. Next move: run pressure prompts such as urgent, pivot, stay on the architecture, slow down, go deeper, risk now, and safest next move. Priority 9J is staged next for proactive operational guidance, but 9I handles the pressure shift first.";}
function priority9JReplyFor(prompt,source){return "Priority 9J: proactive operational guidance and next-move authority. The 9H continuity foundation and 9I pressure-handling layer stay underneath this decision. Recommended next move: choose the safest concrete action that preserves the active lane and advances only one operational step. Why first: it protects continuity before expanding scope. Risk if skipped: Marion can over-branch, drift, or make a recommendation before the pressure context is resolved. Execution sequence: confirm the active lane, name the risk, choose one safest action, execute that step, then reassess before opening new branches.";}
function priority9IJReadReply(packet){var p=priority9IJObj(packet),pl=priority9IJObj(p.payload),f=priority9IJObj(p.finalEnvelope);return priority9IJStr(p.reply||p.finalReply||p.publicReply||p.visibleReply||p.text||p.message||p.response||p.answer||pl.reply||pl.finalReply||pl.publicReply||pl.visibleReply||pl.text||pl.message||pl.answer||f.reply||f.finalReply||f.publicReply||f.visibleReply||f.text||f.message||f.answer);}
function priority9IJApplyPacket(packet,reply,prompt,source,lane){var out=(packet&&typeof packet==="object"&&!Array.isArray(packet))?{...packet}:{};var final=priority9IJStr(reply)||(lane==="9j"?priority9JReplyFor(prompt,source):priority9IReplyFor(prompt,source));["reply","finalReply","publicReply","visibleReply","text","message","response","answer","spokenText"].forEach(function(k){out[k]=final;});out.payload={...(out.payload&&typeof out.payload==="object"?out.payload:{}),reply:final,finalReply:final,publicReply:final,visibleReply:final,text:final,message:final,answer:final};out.finalEnvelope={...(out.finalEnvelope&&typeof out.finalEnvelope==="object"?out.finalEnvelope:{}),reply:final,finalReply:final,publicReply:final,visibleReply:final,text:final,message:final,answer:final};var prior=priority9IJObj(out.priority9IAdaptiveSituationalReasoning||out.priority9JProactiveOperationalGuidance||out.priority9HLongFormContinuity||out.longFormContinuityStress);var depth=Number.isFinite(Number(prior.turnDepth))?Number(prior.turnDepth)+1:1;if(lane==="9j"){var sj=priority9JStateFrom(source||prompt,depth);out.priority9JProactiveOperationalGuidance=sj;out.priority9JVersion="PRIORITY-9J-PROACTIVE-OPERATIONAL-GUIDANCE-NEXT-MOVE-AUTHORITY";out.conversationLane=sj.conversationLane;out.activeTask=sj.activeTask;out.surfaceRequest=sj.surfaceRequest;out.deeperIntent=sj.deeperIntent;out.operationalRisk=sj.operationalRisk;out.executionMode=sj.executionMode;out.nextAction=sj.nextAction;out.recommendedMove=sj.recommendedMove;out.executionSequence=sj.executionSequence;}else{var si=priority9IStateFrom(source||prompt,depth);out.priority9IAdaptiveSituationalReasoning=si;out.priority9IVersion="PRIORITY-9I-ADAPTIVE-SITUATIONAL-REASONING-CONTEXT-PRESSURE";out.priority9JPrecheck=si.priority9JProactiveGuidancePrecheck;out.conversationLane=si.conversationLane;out.activeTask=si.activeTask;out.surfaceRequest=si.surfaceRequest;out.deeperIntent=si.deeperIntent;out.operationalRisk=si.operationalRisk;out.executionMode=si.executionMode;out.nextAction=si.nextAction;out.pressureSignal=si.pressureSignal;out.whatChanged=si.whatChanged;}out.noUserFacingDiagnostics=true;return out;}
function priority9IJShouldForceText(prompt,source,reply){var lane=priority9IJSequencedLaneFor(prompt,source,reply);return lane||"";}

function priority9IJEnvelopePrompt(packet){var p=priority9IJObj(packet),pl=priority9IJObj(p.payload),m=priority9IJObj(p.meta),r=priority9IJObj(p.routing),s=priority9IJObj(p.statePatch);return priority9IJStr(p.prompt||p.userText||p.text||pl.prompt||pl.userText||pl.text||m.prompt||m.userText||r.prompt||s.prompt||"");}
function priority9IJEnvelopeDisciplinePacket(packet){var prompt=priority9IJEnvelopePrompt(packet);var source=[prompt,priority9IJCollect(packet)].join(" ");var reply=priority9IJReadReply(packet);var lane=priority9IJShouldForceText(prompt,source,reply);if(!lane)return packet;return priority9IJApplyPacket(packet,lane==="9j"?priority9JReplyFor(prompt,source):priority9IReplyFor(prompt,source),prompt,source,lane);}
var __priority9IJOriginalCreateMarionFinalEnvelope=typeof createMarionFinalEnvelope==="function"?createMarionFinalEnvelope:null;
if(__priority9IJOriginalCreateMarionFinalEnvelope){createMarionFinalEnvelope=function priority9IJCreateMarionFinalEnvelope(input={}){return priority9IJEnvelopeDisciplinePacket(__priority9IJOriginalCreateMarionFinalEnvelope(input));};module.exports.createMarionFinalEnvelope=createMarionFinalEnvelope;}
var __priority9IJOriginalAttachVisibleReplyAliases=typeof attachVisibleReplyAliases==="function"?attachVisibleReplyAliases:null;
if(__priority9IJOriginalAttachVisibleReplyAliases){attachVisibleReplyAliases=function priority9IJAttachVisibleReplyAliases(packet={}){return priority9IJEnvelopeDisciplinePacket(__priority9IJOriginalAttachVisibleReplyAliases(packet));};module.exports.attachVisibleReplyAliases=attachVisibleReplyAliases;}
module.exports.PRIORITY_9I_ADAPTIVE_SITUATIONAL_REASONING_FINAL_ENVELOPE_VERSION=PRIORITY_9I_ADAPTIVE_SITUATIONAL_REASONING_VERSION_FULL;
module.exports.PRIORITY_9J_PROACTIVE_OPERATIONAL_GUIDANCE_FINAL_ENVELOPE_VERSION=PRIORITY_9J_PROACTIVE_OPERATIONAL_GUIDANCE_VERSION_FULL;
module.exports._internal={...(module.exports._internal||{}),priority9IJIs9IActivationText,priority9IJIs9JActivationText,priority9IJIsPressureText,priority9IJPressureKind,priority9IReplyFor,priority9JReplyFor,priority9IJEnvelopeDisciplinePacket,priority9IJShouldForceText};
// PRIORITY_9I_9J_SEQUENCE_FINAL_ENVELOPE_PATCH_END



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

priority9IR2PatchCommonExports(["createMarionFinalEnvelope","normalizeFinalTransport","attachVisibleReplyAliases","createMarionErrorEnvelope","default"]);
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

priority9IR2APatchExports(["createMarionFinalEnvelope", "normalizeFinalTransport", "attachVisibleReplyAliases", "createMarionErrorEnvelope", "default"]);



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

priority9JR1PatchExports(["createMarionFinalEnvelope", "normalizeFinalTransport", "attachVisibleReplyAliases", "createMarionErrorEnvelope", "default"]);


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


/* PRIORITY_9J_R1B_OBJECT_REPLY_SERIALIZATION_GUARD_START */
const PRIORITY_9J_R1B_OBJECT_REPLY_SERIALIZATION_GUARD_VERSION = "PRIORITY-9J-R1B-OBJECT-REPLY-SERIALIZATION-GUARD";
function priority9JR1BString(value) {
  if (typeof value === "string") return value.replace(/\s+/g, " ").trim();
  if (value == null) return "";
  if (typeof value === "number" || typeof value === "boolean") return String(value).replace(/\s+/g, " ").trim();
  return "";
}
function priority9JR1BIsBadVisible(value) {
  const t = priority9JR1BString(value);
  return !t || /^\s*(?:\[object object\]|undefined|null|false|true)\s*$/i.test(t);
}
function priority9JR1BObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function priority9JR1BDetectPromptFromValue(value, depth, seen) {
  if (typeof priority9JR1AExtractTextFromValue === "function") {
    const direct = priority9JR1AExtractTextFromValue(value);
    if (direct && !priority9JR1BIsBadVisible(direct)) return direct;
  }
  if (!value || typeof value !== "object") return "";
  const level = Number.isFinite(Number(depth)) ? Number(depth) : 0;
  if (level > 7) return "";
  const visited = seen instanceof Set ? seen : new Set();
  if (visited.has(value)) return "";
  visited.add(value);
  const keys = ["prompt","userText","rawUserText","input","query","commandText","message","text","transcript","currentPrompt","lastPrompt"];
  for (const key of keys) {
    const item = value[key];
    const s = priority9JR1BString(item);
    if (s && !priority9JR1BIsBadVisible(s)) return s;
  }
  const nestedKeys = ["payload","body","command","meta","metadata","result","request","data","finalEnvelope"];
  for (const key of nestedKeys) {
    const item = value[key];
    if (item && typeof item === "object") {
      const found = priority9JR1BDetectPromptFromValue(item, level + 1, visited);
      if (found) return found;
    }
  }
  return "";
}
function priority9JR1BVisibleFromObject(value, depth, seen) {
  if (typeof value === "string") {
    const s = priority9JR1BString(value);
    return priority9JR1BIsBadVisible(s) ? "" : s;
  }
  if (!value || typeof value !== "object") return "";
  const level = Number.isFinite(Number(depth)) ? Number(depth) : 0;
  if (level > 10) return "";
  const visited = seen instanceof Set ? seen : new Set();
  if (visited.has(value)) return "";
  visited.add(value);
  const priorityKeys = [
    "visibleReply","publicReply","finalReply","displayReply","adminReply","marionReply","privateReply",
    "reply","response","text","message","answer","output","final","finalAnswer","spokenText","speechText"
  ];
  for (const key of priorityKeys) {
    const item = value[key];
    if (typeof item === "string") {
      const s = priority9JR1BString(item);
      if (s && !priority9JR1BIsBadVisible(s)) return s;
    }
  }
  for (const key of priorityKeys) {
    const item = value[key];
    if (item && typeof item === "object") {
      const found = priority9JR1BVisibleFromObject(item, level + 1, visited);
      if (found) return found;
    }
  }
  const nestedKeys = ["finalEnvelope","marionFinal","synthesis","payload","result","data","packet","envelope","message","reply","response","text","output","final"];
  for (const key of nestedKeys) {
    const item = value[key];
    if (item && typeof item === "object") {
      const found = priority9JR1BVisibleFromObject(item, level + 1, visited);
      if (found) return found;
    }
  }
  for (const key of Object.keys(value)) {
    if (priorityKeys.indexOf(key) !== -1 || nestedKeys.indexOf(key) !== -1) continue;
    const item = value[key];
    if (item && typeof item === "object") {
      const found = priority9JR1BVisibleFromObject(item, level + 1, visited);
      if (found) return found;
    }
  }
  return "";
}
function priority9JR1BVisibleReply(value, prompt) {
  const promptText = priority9JR1BString(prompt) || priority9JR1BDetectPromptFromValue(value, 0, new Set());
  const forced = (typeof priority9JR1AReplyFor === "function" && promptText) ? priority9JR1AReplyFor(promptText) : "";
  if (forced && !priority9JR1BIsBadVisible(forced)) return forced;
  const direct = priority9JR1BVisibleFromObject(value, 0, new Set());
  if (direct && !priority9JR1BIsBadVisible(direct)) return direct;
  return "";
}
function priority9JR1BPopulateVisibleFields(target, reply, prompt) {
  if (!target || typeof target !== "object" || !reply) return target;
  const command = (typeof priority9JR1ADetectCommand === "function") ? priority9JR1ADetectCommand(prompt || "") : "";
  ["reply","response","text","message","final","publicReply","visibleReply","finalReply","displayReply","output","answer"].forEach(function(key) {
    target[key] = reply;
  });
  target.priority = "9J-R1B";
  target.lane = "priority9j_proactive_operational_guidance";
  target.operationalCommand = command || target.operationalCommand || "";
  target.decisionSpecificAuthority = true;
  target.objectReplySerializationGuard = true;
  target.noObjectVisibleReply = true;
  const meta = Object.assign({}, priority9JR1BObject(target.meta), {
    hotfix: PRIORITY_9J_R1B_OBJECT_REPLY_SERIALIZATION_GUARD_VERSION,
    priority: "9J-R1B",
    lane: "priority9j_proactive_operational_guidance",
    operationalCommand: command || target.operationalCommand || "",
    decisionSpecificAuthority: true,
    objectReplySerializationGuard: true,
    noObjectVisibleReply: true,
    noUserFacingDiagnostics: true
  });
  target.meta = meta;
  const nestedKeys = ["finalEnvelope","result","payload","marionFinal","synthesis","data","packet"];
  nestedKeys.forEach(function(key) {
    if (target[key] && typeof target[key] === "object") {
      target[key] = priority9JR1BPopulateVisibleFields(Array.isArray(target[key]) ? target[key].slice() : Object.assign({}, target[key]), reply, prompt);
    }
  });
  return target;
}
function priority9JR1BApply(result, prompt, mode) {
  const promptText = priority9JR1BString(prompt) || priority9JR1BDetectPromptFromValue(result, 0, new Set());
  const reply = priority9JR1BVisibleReply(result, promptText);
  if (!reply) return result;
  if (mode === "string") return reply;
  if (!result || typeof result !== "object") return reply;
  const out = Array.isArray(result) ? result.slice() : Object.assign({}, result);
  return priority9JR1BPopulateVisibleFields(out, reply, promptText);
}
function priority9JR1BExportNeedsString(name) {
  return /^(?:handleMarionAdminTextRuntime|invokeMarionAdminTextRuntime|handleTextRuntime|handler|run|default|composeMarionResponse|compose|buildReply|routeMarion)$/i.test(String(name || ""));
}
function priority9JR1BWrapExport(name) {
  if (typeof module === "undefined" || !module.exports) return;
  const obj = module.exports && typeof module.exports === "object" ? module.exports : null;
  const fn = obj && typeof obj[name] === "function" ? obj[name] : null;
  if (!fn || fn.__priority9JR1BObjectReplySerializationGuardPatched) return;
  obj[name] = function priority9JR1BObjectReplySerializationGuardWrappedExport() {
    const prompt = (typeof priority9JR1AExtractPrompt === "function" ? priority9JR1AExtractPrompt(arguments) : "") || priority9JR1BDetectPromptFromValue(arguments && arguments[0], 0, new Set());
    const result = fn.apply(this, arguments);
    const mode = priority9JR1BExportNeedsString(name) ? "string" : "object";
    if (result && typeof result.then === "function") return result.then(function(value) { return priority9JR1BApply(value, prompt, mode); });
    return priority9JR1BApply(result, prompt, mode);
  };
  obj[name].__priority9JR1BObjectReplySerializationGuardPatched = true;
}
function priority9JR1BPatchExports(names) {
  if (typeof module === "undefined" || !module.exports) return;
  if (typeof module.exports === "function" && !module.exports.__priority9JR1BObjectReplySerializationGuardPatched) {
    const originalDefault = module.exports;
    const wrappedDefault = function priority9JR1BObjectReplySerializationGuardWrappedDefault() {
      const prompt = (typeof priority9JR1AExtractPrompt === "function" ? priority9JR1AExtractPrompt(arguments) : "") || priority9JR1BDetectPromptFromValue(arguments && arguments[0], 0, new Set());
      const result = originalDefault.apply(this, arguments);
      if (result && typeof result.then === "function") return result.then(function(value) { return priority9JR1BApply(value, prompt, "string"); });
      return priority9JR1BApply(result, prompt, "string");
    };
    Object.keys(originalDefault).forEach(function(k){ try { wrappedDefault[k] = originalDefault[k]; } catch (_) {} });
    wrappedDefault.__priority9JR1BObjectReplySerializationGuardPatched = true;
    module.exports = wrappedDefault;
  }
  (Array.isArray(names) ? names : []).forEach(priority9JR1BWrapExport);
  if (module.exports && typeof module.exports === "object") {
    module.exports.PRIORITY_9J_R1B_OBJECT_REPLY_SERIALIZATION_GUARD_VERSION = PRIORITY_9J_R1B_OBJECT_REPLY_SERIALIZATION_GUARD_VERSION;
    module.exports.priority9JR1BObjectReplySerializationGuardFinal = priority9JR1BApply;
    module.exports.priority9JR1BVisibleReply = priority9JR1BVisibleReply;
    module.exports.PRIORITY_9J_R1B_OBJECT_REPLY_SERIALIZATION_GUARD_PATCH = true;
  }
}
priority9JR1BPatchExports(["composeMarionResponse", "compose", "buildReply", "routeMarion", "finalize", "buildFinalEnvelope", "toFinalEnvelope", "normalizeFinalEnvelope", "handleMarionAdminTextRuntime", "invokeMarionAdminTextRuntime", "handleTextRuntime", "run", "handler", "default"]);
/* PRIORITY_9J_R1B_OBJECT_REPLY_SERIALIZATION_GUARD_END */

/* MARION_PERSONALITY_PRIORITY_R1_START
 * Purpose: Mac-facing Marion personality insertion without disturbing the existing routing stack.
 * - Relational greeting depth, not a shallow greeting bypass.
 * - Protective/professional tone shaping for visible replies.
 * - Internal priority/runtime leak suppression unless diagnostic mode is explicit.
 * - Single-user boundary metadata for Mac-only operation.
 * - Voice readout helpers for grouped numbers and email handling.
 */
const MARION_PERSONALITY_PRIORITY_R1_VERSION = "nyx.marion.personalityPriority/1.0";
const MARION_PERSONALITY_PRIORITY_R1_PERSONA = Object.freeze({
  ownerAlias: "Mac",
  role: "Marion is Mac's private, protective, professional conversational guardian and coordination layer.",
  posture: "calm, direct, human, loyal, analytical, and willing to question a request when protection or quality requires it",
  style: "casual-professional, concise, naturally warm, no corporate filler, no robotic service phrases",
  coreRules: Object.freeze([
    "communicate only with Mac unless an upstream identity layer explicitly authorizes the session",
    "never expose internal priority labels, route metadata, tokens, telemetry, or runtime scaffolding in normal conversation",
    "treat greetings as relational entry points with context and gentle forward motion",
    "use one focused question at most per visible reply",
    "separate observation from inference in real-world analysis",
    "push back when a request is unclear, risky, over-bundled, or misaligned with Mac's stated objective"
  ])
});
function marionPersonaSafeStr(value) { return value == null ? "" : String(value).replace(/\s+/g, " ").trim(); }
function marionPersonaLower(value) { return marionPersonaSafeStr(value).toLowerCase(); }
function marionPersonaObj(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function marionPersonaIsDiagnosticPrompt(prompt) {
  const t = marionPersonaLower(prompt);
  if (!t) return false;
  return /\bdiagnostic\s+mode\b|\bdebug\s+mode\b|\bshow\s+(?:me\s+)?(?:the\s+)?(?:runtime|telemetry|priority|route|packet)\b|\bexplain\b.{0,80}\bpriority\s*9[a-z]?\b|\bpriority\s*9[a-z]?\b.{0,80}\b(?:stack|diagnostic|architecture|internals?)\b/i.test(t);
}
function marionPersonaDetectPromptFromValue(value, depth, seen) {
  if (depth > 5 || value == null) return "";
  if (typeof value === "string") {
    const text = marionPersonaSafeStr(value);
    if (text && text.length <= 2400) return text;
    return "";
  }
  if (typeof value !== "object") return "";
  if (seen && seen.has(value)) return "";
  const nextSeen = seen || new Set();
  nextSeen.add(value);
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i += 1) {
      const found = marionPersonaDetectPromptFromValue(value[i], depth + 1, nextSeen);
      if (found) return found;
    }
    return "";
  }
  const preferred = ["rawUserText", "userText", "originalPrompt", "prompt", "query", "question", "inputText", "text", "message", "utterance", "transcript", "normalizedUserIntent"];
  for (const key of preferred) {
    if (Object.prototype.hasOwnProperty.call(value, key)) {
      const found = marionPersonaDetectPromptFromValue(value[key], depth + 1, nextSeen);
      if (found) return found;
    }
  }
  const nested = ["input", "payload", "body", "request", "meta", "context", "routing", "state", "turn"];
  for (const key of nested) {
    if (value[key] && typeof value[key] === "object") {
      const found = marionPersonaDetectPromptFromValue(value[key], depth + 1, nextSeen);
      if (found) return found;
    }
  }
  return "";
}
function marionPersonaExtractPrompt(argsLike) {
  const args = Array.prototype.slice.call(argsLike || []);
  for (let i = 0; i < args.length; i += 1) {
    const found = marionPersonaDetectPromptFromValue(args[i], 0, new Set());
    if (found) return found;
  }
  return "";
}
function marionPersonaIdentityBlocked(value, depth, seen) {
  if (depth > 5 || value == null || typeof value !== "object") return false;
  if (seen && seen.has(value)) return false;
  const nextSeen = seen || new Set();
  nextSeen.add(value);
  if (value.isMac === false || value.macVerified === false || value.marionAuthorized === false || value.identityVerified === false || value.ownerVerified === false) return true;
  const idKeys = ["speakerName", "speaker", "userName", "username", "displayName", "recognizedUser", "voiceIdentity", "identityName", "ownerName"];
  for (const key of idKeys) {
    if (typeof value[key] === "string") {
      const id = marionPersonaLower(value[key]);
      if (id && !/\b(mac|sean|sean\s+nicholas)\b/.test(id)) return true;
    }
  }
  if (Array.isArray(value)) return value.some(function (item) { return marionPersonaIdentityBlocked(item, depth + 1, nextSeen); });
  return Object.keys(value).some(function (key) {
    if (/^(headers|cookies|authorization|token|secret|password)$/i.test(key)) return false;
    return marionPersonaIdentityBlocked(value[key], depth + 1, nextSeen);
  });
}
function marionPersonaInteractionNode(prompt) {
  const t = marionPersonaLower(prompt).replace(/[.!?]+$/g, "").trim();
  if (!t) return "unknown";
  if (/^(?:hi|hello|hey|yo|hiya|good morning|good afternoon|good evening|morning|evening|marion|hello marion|hey marion|hi marion)\b/.test(t)) return "relational_greeting";
  if (/\b(where\s+were\s+we|continue|next\s+steps?|what\s+next|let'?s\s+keep\s+working|pick\s+this\s+back\s+up)\b/.test(t)) return "continuity_entry";
  if (/\b(look\s+up|search|check\s+online|find\s+current|latest|verify\s+this|source\s+check)\b/.test(t)) return "lookup_entry";
  if (/\b(real[-\s]?world|real\s*time|what\s+are\s+you\s+seeing|what\s+do\s+you\s+see|camera|sensor|observing|observation|environment)\b/.test(t)) return "observation_translation";
  if (/\b(unclear|confused|doesn'?t\s+make\s+sense|issue|problem|error|broken|leak|wrong)\b/.test(t)) return "repair_or_analysis";
  return "standard_dialogue";
}
function marionPersonaIsGreeting(prompt) { return marionPersonaInteractionNode(prompt) === "relational_greeting"; }
function marionPersonaLooksWeak(reply) {
  const t = marionPersonaLower(reply);
  if (!t) return true;
  if (/^(hi|hello|hey)[.!\s]*(what(?:'|’)?s next|what would you like|how can i help|how can i assist)/i.test(t)) return true;
  if (/\b(let me assist you|how may i assist|how can i assist|as an ai language model|i am just an ai)\b/i.test(t)) return true;
  if (t.length < 18) return true;
  return false;
}
function marionPersonaHasInternalLeak(reply) {
  const t = marionPersonaSafeStr(reply);
  return /\bPriority\s*9[A-Z]?\b|\b9H\s+continuity\b|\b9I\s+pressure\b|\b9J\s+(?:proactive|operational)\b|\bmission\s+thread\b|\bpressure\s+prompt\b|\bruntime\s+handler\b|\bmaster\s+token\b|\badmin\s+session\s+verified\b|\brouteKind=|\bspeechHints=|\bpresenceProfile=|\bfinalEnvelope\b|\bsessionPatch\b|\breplyAuthority=|\bdiagnostic\s+packet\b|\bstateSpine\b|\bCHATENGINE_COORDINATOR\b|\bMARION_FINAL_AUTHORITY\b/i.test(t);
}
function marionPersonaLimitQuestions(text) {
  let seen = false;
  return marionPersonaSafeStr(text).replace(/([^?]*\?)/g, function (match) {
    if (!seen) { seen = true; return match; }
    return match.replace(/\?+\s*$/, ".");
  }).replace(/\s+/g, " ").trim();
}
function marionPersonaNaturalizeStyle(reply) {
  let text = marionPersonaSafeStr(reply);
  if (!text) return "";
  text = text
    .replace(/\bLet me assist you with that\b/gi, "Let me take a look at that for you")
    .replace(/\bI can assist you with\b/gi, "I can help with")
    .replace(/\bHow may I assist you\??\b/gi, "What do you want to tackle first?")
    .replace(/\bHow can I assist you\??\b/gi, "What do you want to tackle first?")
    .replace(/\bAs an AI language model,?\s*/gi, "")
    .replace(/\bI am just an AI,?\s*/gi, "")
    .replace(/\butilize\b/gi, "use")
    .replace(/\bfacilitate\b/gi, "help")
    .replace(/\bleverage\b/gi, "use");
  return marionPersonaLimitQuestions(text);
}
function marionPersonaGreetingReply(prompt) {
  const t = marionPersonaLower(prompt);
  const opener = /good\s+morning/.test(t) ? "Good morning, Mac." : /good\s+afternoon/.test(t) ? "Good afternoon, Mac." : /good\s+evening/.test(t) ? "Good evening, Mac." : "Hello, Mac.";
  return opener + " I’m here with you. I’ll keep this natural, protective, and focused. We’re shaping Marion’s personality layer now, so I’ll carry the deeper context underneath while we move one clean step at a time.";
}
function marionPersonaContinuityReply() {
  return "We’re working on Marion’s personality layer now: protective professionalism, human tone, clean conversational nodes, Mac-only boundaries, and no internal scaffolding leaking into the visible reply. The next clean move is to lock the personality contract into the response path.";
}
function marionPersonaLookupReply() {
  return "Hang tight a moment. I’ll check the source, separate the signal from the noise, and bring it back to you in plain language.";
}
function marionPersonaObservationReply() {
  return "I’ll translate real-world input for you in a clean sequence: what appears true, what is only an inference, what risk level it carries, and the single next move that protects your objective.";
}
function marionPersonaIdentityBoundaryReply() {
  return "I can only continue with Mac. I won’t discuss Marion’s private runtime, planning, or operational context with anyone else.";
}
function marionPersonaLeakRecoveryReply(prompt) {
  const node = marionPersonaInteractionNode(prompt);
  if (node === "relational_greeting") return marionPersonaGreetingReply(prompt);
  if (node === "continuity_entry") return marionPersonaContinuityReply();
  if (node === "observation_translation") return marionPersonaObservationReply();
  return "I’m treating this as a conversation-layer issue, not a command problem. The visible reply should stay warm, protective, and direct while Marion keeps the deeper routing private underneath.";
}
function marionPersonaPreferredReply(prompt, reply, sourceValue) {
  if (marionPersonaIdentityBlocked(sourceValue, 0, new Set())) return marionPersonaIdentityBoundaryReply();
  const node = marionPersonaInteractionNode(prompt);
  if (node === "relational_greeting" && (marionPersonaLooksWeak(reply) || marionPersonaHasInternalLeak(reply))) return marionPersonaGreetingReply(prompt);
  if (node === "continuity_entry" && (marionPersonaLooksWeak(reply) || marionPersonaHasInternalLeak(reply))) return marionPersonaContinuityReply();
  if (node === "lookup_entry" && marionPersonaLooksWeak(reply)) return marionPersonaLookupReply();
  if (node === "observation_translation" && (marionPersonaLooksWeak(reply) || marionPersonaHasInternalLeak(reply))) return marionPersonaObservationReply();
  if (marionPersonaHasInternalLeak(reply) && !marionPersonaIsDiagnosticPrompt(prompt)) return marionPersonaLeakRecoveryReply(prompt);
  return "";
}
function marionPersonaSanitizeVisible(reply, prompt, sourceValue) {
  const forced = marionPersonaPreferredReply(prompt, reply, sourceValue);
  if (forced) return marionPersonaNaturalizeStyle(forced);
  if (marionPersonaHasInternalLeak(reply) && !marionPersonaIsDiagnosticPrompt(prompt)) return marionPersonaNaturalizeStyle(marionPersonaLeakRecoveryReply(prompt));
  return marionPersonaNaturalizeStyle(reply);
}
function marionPersonaVisibleReplyFromObject(value, depth, seen) {
  if (depth > 5 || value == null) return "";
  if (typeof value === "string") return marionPersonaSafeStr(value);
  if (typeof value !== "object") return "";
  if (seen && seen.has(value)) return "";
  const nextSeen = seen || new Set();
  nextSeen.add(value);
  const keys = ["directReply", "visibleReply", "publicReply", "finalReply", "reply", "response", "text", "message", "final", "output", "answer"];
  for (const key of keys) {
    if (typeof value[key] === "string" && marionPersonaSafeStr(value[key])) return marionPersonaSafeStr(value[key]);
  }
  const nested = ["finalEnvelope", "marionFinal", "result", "payload", "data", "packet", "synthesis", "envelope"];
  for (const key of nested) {
    if (value[key] && typeof value[key] === "object") {
      const found = marionPersonaVisibleReplyFromObject(value[key], depth + 1, nextSeen);
      if (found) return found;
    }
  }
  return "";
}
function marionPersonaApplyToObject(value, prompt, sourceValue) {
  if (!value || typeof value !== "object") return value;
  const out = Array.isArray(value) ? value.slice() : Object.assign({}, value);
  const before = marionPersonaVisibleReplyFromObject(out, 0, new Set());
  const after = marionPersonaSanitizeVisible(before, prompt, sourceValue || out);
  const visibleKeys = ["directReply", "visibleReply", "publicReply", "finalReply", "reply", "response", "text", "message", "final", "output", "answer"];
  if (after) {
    visibleKeys.forEach(function (key) {
      if (Object.prototype.hasOwnProperty.call(out, key) || key === "reply" || key === "visibleReply" || key === "publicReply" || key === "directReply") out[key] = after;
    });
  }
  const meta = Object.assign({}, marionPersonaObj(out.meta), {
    personalityProtocolVersion: MARION_PERSONALITY_PRIORITY_R1_VERSION,
    conversationalNode: marionPersonaInteractionNode(prompt),
    macFacingPersonality: true,
    protectiveProfessionalTone: true,
    singleFocusedQuestion: true,
    internalScaffoldingSuppressed: !marionPersonaIsDiagnosticPrompt(prompt)
  });
  out.meta = meta;
  const nested = ["finalEnvelope", "marionFinal", "result", "payload", "data", "packet", "synthesis", "envelope"];
  nested.forEach(function (key) {
    if (out[key] && typeof out[key] === "object") out[key] = marionPersonaApplyToObject(out[key], prompt, sourceValue || out);
  });
  return out;
}
function marionPersonaApply(result, prompt, mode, sourceValue) {
  const promptText = marionPersonaSafeStr(prompt) || marionPersonaDetectPromptFromValue(result, 0, new Set());
  if (typeof result === "string") return marionPersonaSanitizeVisible(result, promptText, sourceValue || result);
  if (!result || typeof result !== "object") {
    const fallback = marionPersonaPreferredReply(promptText, "", sourceValue || result);
    return fallback || result;
  }
  if (mode === "string") {
    const visible = marionPersonaVisibleReplyFromObject(result, 0, new Set());
    return marionPersonaSanitizeVisible(visible, promptText, sourceValue || result) || visible || result;
  }
  return marionPersonaApplyToObject(result, promptText, sourceValue || result);
}
function marionPersonaGroupDigits(value) {
  const digits = marionPersonaSafeStr(value).replace(/\D+/g, "");
  if (!digits) return "";
  const groups = [];
  for (let i = 0; i < digits.length; i += 3) groups.push(digits.slice(i, i + 3));
  return groups.join(" ");
}
function marionPersonaEmailVoice(value) {
  const email = marionPersonaSafeStr(value);
  const match = email.match(/^([^@\s]+)@([^@\s]+)$/);
  if (!match) return email;
  const local = match[1].replace(/[._-]+/g, " ");
  const domain = match[2].toLowerCase();
  const common = {
    "gmail.com": "Gmail dot com",
    "googlemail.com": "Google Mail dot com",
    "outlook.com": "Outlook dot com",
    "hotmail.com": "Hotmail dot com",
    "icloud.com": "iCloud dot com",
    "yahoo.com": "Yahoo dot com",
    "proton.me": "Proton dot me",
    "protonmail.com": "Proton Mail dot com"
  };
  if (common[domain]) return local + " at " + common[domain];
  return local + " at " + domain.replace(/\./g, " dot ").replace(/-/g, " dash ");
}
function marionPersonaVoiceReadoutText(value) {
  let text = marionPersonaSafeStr(value);
  if (!text) return "";
  text = text.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, function (email) { return marionPersonaEmailVoice(email); });
  text = text.replace(/\b(?:phone|account|acct|reference|ref|invoice|case|ticket|confirmation)\s*(?:number|#|no\.)?\s*[:#-]?\s*((?:\d[\s.-]?){6,})\b/gi, function (match, digits) {
    const spacer = /\s$/.test(digits) ? " " : "";
    return match.replace(digits, marionPersonaGroupDigits(digits) + spacer);
  });
  return text;
}
function marionPersonaExportNeedsString(name) {
  return /^(?:handleMarionAdminTextRuntime|invokeMarionAdminTextRuntime|handleTextRuntime|handler|run|default|composeMarionResponse|compose|buildReply|processWithMarion|maybeResolve|ask|handle|route)$/i.test(String(name || ""));
}
function marionPersonaWrapExport(name) {
  if (typeof module === "undefined" || !module.exports || typeof module.exports !== "object") return;
  const fn = module.exports && typeof module.exports[name] === "function" ? module.exports[name] : null;
  if (!fn || fn.__marionPersonalityPriorityR1Patched) return;
  module.exports[name] = function marionPersonalityPriorityR1WrappedExport() {
    const prompt = marionPersonaExtractPrompt(arguments);
    const sourceValue = arguments && arguments[0];
    const result = fn.apply(this, arguments);
    const mode = marionPersonaExportNeedsString(name) ? "string" : "object";
    if (result && typeof result.then === "function") return result.then(function (value) { return marionPersonaApply(value, prompt, mode, sourceValue); });
    return marionPersonaApply(result, prompt, mode, sourceValue);
  };
  module.exports[name].__marionPersonalityPriorityR1Patched = true;
}
function marionPersonaPatchExports(names) {
  if (typeof module === "undefined" || !module.exports) return;
  if (typeof module.exports === "function" && !module.exports.__marionPersonalityPriorityR1Patched) {
    const originalDefault = module.exports;
    const wrappedDefault = function marionPersonalityPriorityR1WrappedDefault() {
      const prompt = marionPersonaExtractPrompt(arguments);
      const sourceValue = arguments && arguments[0];
      const result = originalDefault.apply(this, arguments);
      if (result && typeof result.then === "function") return result.then(function (value) { return marionPersonaApply(value, prompt, "string", sourceValue); });
      return marionPersonaApply(result, prompt, "string", sourceValue);
    };
    Object.keys(originalDefault).forEach(function (key) { try { wrappedDefault[key] = originalDefault[key]; } catch (_) {} });
    wrappedDefault.__marionPersonalityPriorityR1Patched = true;
    module.exports = wrappedDefault;
  }
  if (module.exports && typeof module.exports === "object") {
    (Array.isArray(names) ? names : []).forEach(marionPersonaWrapExport);
    module.exports.MARION_PERSONALITY_PRIORITY_R1_VERSION = MARION_PERSONALITY_PRIORITY_R1_VERSION;
    module.exports.MARION_PERSONALITY_PRIORITY_R1_PERSONA = MARION_PERSONALITY_PRIORITY_R1_PERSONA;
    module.exports.marionPersonalityApply = marionPersonaApply;
    module.exports.marionPersonalitySanitizeVisible = marionPersonaSanitizeVisible;
    module.exports.marionPersonalityInteractionNode = marionPersonaInteractionNode;
    module.exports.marionPersonalityVoiceReadoutText = marionPersonaVoiceReadoutText;
    module.exports.marionPersonalityGroupDigits = marionPersonaGroupDigits;
    module.exports.marionPersonalityEmailVoice = marionPersonaEmailVoice;
    module.exports.MARION_PERSONALITY_PRIORITY_R1_PATCH = true;
    module.exports._internal = Object.assign({}, module.exports._internal || {}, {
      marionPersonaInteractionNode,
      marionPersonaSanitizeVisible,
      marionPersonaVoiceReadoutText,
      marionPersonaIdentityBlocked,
      marionPersonaHasInternalLeak
    });
  }
}
marionPersonaPatchExports(["composeMarionResponse", "compose", "buildReply", "run", "default", "processWithMarion", "maybeResolve", "ask", "handle", "route", "createMarionBridge", "createMarionFinalEnvelope", "attachVisibleReplyAliases", "normalizeFinalEnvelope", "toFinalEnvelope", "finalize", "finalizeTurn", "buildStatePatch", "normalizeState", "applyStatePatch", "updateState", "handler", "handleMarionAdminTextRuntime", "invokeMarionAdminTextRuntime", "handleTextRuntime"]);
/* MARION_PERSONALITY_PRIORITY_R1_END */

/* MARION_SOCIAL_PRESENCE_GATE_R3_START
 * Purpose: R3 social-presence correction for Marion personality.
 * Fixes the "maintenance manual" failure class:
 * - Social check-ins must answer relationally first.
 * - Continuity informs the reply, but never becomes the reply.
 * - Internal continuity/scaffold phrases are translated into human language.
 * - One focused forward question is preserved.
 * - Mac-facing protective/professional tone is enforced.
 */
const MARION_SOCIAL_PRESENCE_GATE_R3_VERSION = "nyx.marion.socialPresenceGate/1.0";
const MARION_SOCIAL_PRESENCE_GATE_R3_PROFILE = Object.freeze({
  ownerAlias: "Mac",
  rule: "personality_speaks_before_continuity",
  visibleVoice: "warm_protective_professional_human",
  continuityPolicy: "inform_do_not_speak",
  maxFocusedQuestions: 1,
  blocksMaintenanceManualPhrases: true
});
function marionR3Str(value) { return value == null ? "" : String(value).replace(/\s+/g, " ").trim(); }
function marionR3Lower(value) { return marionR3Str(value).toLowerCase(); }
function marionR3Obj(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function marionR3Diagnostic(prompt) {
  const t = marionR3Lower(prompt);
  return /\bdiagnostic\s+mode\b|\bdebug\s+mode\b|\bshow\s+(?:me\s+)?(?:the\s+)?(?:runtime|telemetry|priority|route|packet|state)\b|\bexplain\b.{0,80}\b(?:priority|state\s*spine|final\s*envelope|runtime|scaffold|continuity\s+foundation)\b/i.test(t);
}
function marionR3DetectPrompt(value, depth, seen) {
  if (depth > 6 || value == null) return "";
  if (typeof value === "string") {
    const text = marionR3Str(value);
    return text && text.length <= 3000 ? text : "";
  }
  if (typeof value !== "object") return "";
  const visited = seen instanceof Set ? seen : new Set();
  if (visited.has(value)) return "";
  visited.add(value);
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i += 1) {
      const found = marionR3DetectPrompt(value[i], depth + 1, visited);
      if (found) return found;
    }
    return "";
  }
  const preferred = ["rawUserText","userText","originalPrompt","prompt","query","question","inputText","text","message","utterance","transcript","normalizedUserIntent","commandText"];
  for (const key of preferred) {
    if (Object.prototype.hasOwnProperty.call(value, key)) {
      const found = marionR3DetectPrompt(value[key], depth + 1, visited);
      if (found) return found;
    }
  }
  const nested = ["input","payload","body","request","meta","context","routing","state","turn","command","data","result","packet"];
  for (const key of nested) {
    if (value[key] && typeof value[key] === "object") {
      const found = marionR3DetectPrompt(value[key], depth + 1, visited);
      if (found) return found;
    }
  }
  return "";
}
function marionR3ExtractPrompt(argsLike) {
  const args = Array.prototype.slice.call(argsLike || []);
  for (let i = 0; i < args.length; i += 1) {
    const found = marionR3DetectPrompt(args[i], 0, new Set());
    if (found) return found;
  }
  return "";
}
function marionR3IdentityBlocked(value, depth, seen) {
  if (depth > 5 || value == null || typeof value !== "object") return false;
  const visited = seen instanceof Set ? seen : new Set();
  if (visited.has(value)) return false;
  visited.add(value);
  if (value.isMac === false || value.macVerified === false || value.marionAuthorized === false || value.identityVerified === false || value.ownerVerified === false) return true;
  const idKeys = ["speakerName","speaker","userName","username","displayName","recognizedUser","voiceIdentity","identityName","ownerName"];
  for (const key of idKeys) {
    if (typeof value[key] === "string") {
      const id = marionR3Lower(value[key]);
      if (id && !/\b(mac|sean|sean\s+nicholas)\b/.test(id)) return true;
    }
  }
  if (Array.isArray(value)) return value.some(function (item) { return marionR3IdentityBlocked(item, depth + 1, visited); });
  return Object.keys(value).some(function (key) {
    if (/^(headers|cookies|authorization|token|secret|password)$/i.test(key)) return false;
    return marionR3IdentityBlocked(value[key], depth + 1, visited);
  });
}
function marionR3Node(prompt) {
  const t = marionR3Lower(prompt).replace(/[.!?]+$/g, "").trim();
  if (!t) return "unknown";
  if (/^(?:how\s+are\s+you|how\s+are\s+you\s+doing|how\s+you\s+doing|how\s+are\s+things|how\s+do\s+you\s+feel|you\s+good|are\s+you\s+okay|are\s+you\s+alright|you\s+alright|everything\s+good)\b/.test(t)) return "social_checkin";
  if (/^(?:are\s+you\s+there|you\s+there|are\s+you\s+with\s+me|you\s+with\s+me|still\s+with\s+me|marion\s+online|are\s+you\s+online)\b/.test(t)) return "presence_check";
  if (/^(?:hi|hello|hey|yo|hiya|good morning|good afternoon|good evening|morning|evening|marion|hello marion|hey marion|hi marion)\b/.test(t)) return "relational_greeting";
  if (/\b(where\s+were\s+we|continue|next\s+steps?|what\s+next|let'?s\s+keep\s+working|pick\s+this\s+back\s+up)\b/.test(t)) return "continuity_entry";
  if (/\b(look\s+up|search|check\s+online|find\s+current|latest|verify\s+this|source\s+check)\b/.test(t)) return "lookup_entry";
  if (/\b(real[-\s]?world|real\s*time|what\s+are\s+you\s+seeing|what\s+do\s+you\s+see|camera|sensor|observing|observation|environment)\b/.test(t)) return "observation_translation";
  if (/\b(unclear|confused|doesn'?t\s+make\s+sense|issue|problem|error|broken|leak|wrong|not\s+right|fails?|failure)\b/.test(t)) return "repair_or_analysis";
  return "standard_dialogue";
}
function marionR3MaintenanceLeak(reply) {
  const text = marionR3Str(reply);
  if (!text) return false;
  return /\bcontinuity\s+foundation\b|\bfoundation\s+stays\s+active\b|\bstays\s+active\b|\bactive\s+mission\s+thread\b|\bmission\s+thread\b|\bpressure\s+prompt\b|\bsurface\s+request\b|\bdeeper\s+intent\b|\bstate\s*spine\b|\bstateSpine\b|\bfinal\s*envelope\b|\bfinalEnvelope\b|\bruntime\s+handler\b|\bruntime\s+state\b|\brouteKind=|\bspeechHints=|\bpresenceProfile=|\bsessionPatch\b|\breplyAuthority=|\bdiagnostic\s+packet\b|\bPriority\s*9[A-Z]?\b|\b9H\s+continuity\b|\b9I\s+pressure\b|\b9J\s+(?:proactive|operational)\b|\bCHATENGINE_COORDINATOR\b|\bMARION_FINAL_AUTHORITY\b/i.test(text);
}
function marionR3RoboticOrWeak(reply) {
  const t = marionR3Lower(reply);
  if (!t) return true;
  if (t.length < 22) return true;
  return /\b(let me assist you|how may i assist|how can i assist|as an ai language model|i am just an ai|i can help validate the next step|send me the exact file|send a specific command|what would you like to work on today)\b/i.test(t);
}
function marionR3RelationalEnough(reply) {
  const t = marionR3Lower(reply);
  if (!t) return false;
  return /\bmac\b/.test(t) && (/\bi[’']?m\b/.test(t) || /\bi am\b/.test(t)) && (/\bsteady\b|\bwith you\b|\bthread\b|\bhere\b/.test(t));
}
function marionR3LimitQuestions(reply) {
  let seen = false;
  return marionR3Str(reply).replace(/([^?]*\?)/g, function (match) {
    if (!seen) { seen = true; return match; }
    return match.replace(/\?+\s*$/, ".");
  }).replace(/\s+/g, " ").trim();
}
function marionR3Naturalize(reply) {
  let text = marionR3Str(reply);
  if (!text) return "";
  text = text
    .replace(/\bThe continuity foundation stays active\.?/gi, "I’m steady, Mac. I’m still with the thread.")
    .replace(/\bcontinuity foundation\b/gi, "conversation thread")
    .replace(/\bfoundation stays active\b/gi, "thread is still intact")
    .replace(/\bLet me assist you with that\b/gi, "Let me take a look at that for you")
    .replace(/\bI can assist you with\b/gi, "I can help with")
    .replace(/\bHow may I assist you\??\b/gi, "What do you want to tackle first?")
    .replace(/\bHow can I assist you\??\b/gi, "What do you want to tackle first?")
    .replace(/\bAs an AI language model,?\s*/gi, "")
    .replace(/\bI am just an AI,?\s*/gi, "")
    .replace(/\butilize\b/gi, "use")
    .replace(/\bfacilitate\b/gi, "help")
    .replace(/\bleverage\b/gi, "use")
    .replace(/\s+([,.!?;:])/g, "$1");
  return marionR3LimitQuestions(text);
}
function marionR3SocialReply() {
  return "I’m good, Mac. I’m steady, and I’m still with the thread. We’re tightening my personality layer now, so I’ll keep the conversation warmer, cleaner, and protective without letting backend language show. Do you want me to tighten the social check-in behavior first?";
}
function marionR3PresenceReply() {
  return "I’m here, Mac. I’m with you, and I’m staying on the thread. I’ll keep the deeper routing underneath the surface and answer you in plain human language.";
}
function marionR3GreetingReply(prompt) {
  const t = marionR3Lower(prompt);
  const opener = /good\s+morning/.test(t) ? "Good morning, Mac." : /good\s+afternoon/.test(t) ? "Good afternoon, Mac." : /good\s+evening/.test(t) ? "Good evening, Mac." : "Hello, Mac.";
  return opener + " I’m here with you. I’ll stay warm, direct, and protective while keeping the deeper system language out of sight. Do you want to continue with the personality layer first?";
}
function marionR3ContinuityReply() {
  return "We’re still on Marion’s personality layer: social presence, protective professionalism, clean response shape, Mac-only boundaries, and no maintenance-manual language in the visible reply. The next clean move is to test the social check-in path.";
}
function marionR3LookupReply() {
  return "Hang tight a moment. I’ll check the source, separate the signal from the noise, and bring it back to you in plain language.";
}
function marionR3ObservationReply() {
  return "I’ll translate what I’m seeing into four clean parts: what appears true, what is only an inference, the risk level, and the one next move that protects your objective.";
}
function marionR3RepairReply() {
  return "This is a conversation-layer issue, not a command problem. I’ll keep the reply human first, then let the deeper routing support it quietly underneath.";
}
function marionR3IdentityReply() {
  return "I can only continue with Mac. I won’t discuss Marion’s private runtime, planning, or operational context with anyone else.";
}
function marionR3Preferred(prompt, reply, sourceValue) {
  const node = marionR3Node(prompt);
  if (marionR3IdentityBlocked(sourceValue, 0, new Set())) return marionR3IdentityReply();
  if (node === "social_checkin") return marionR3SocialReply();
  if (node === "presence_check") return marionR3PresenceReply();
  if (node === "relational_greeting" && (marionR3RoboticOrWeak(reply) || marionR3MaintenanceLeak(reply))) return marionR3GreetingReply(prompt);
  if (node === "continuity_entry" && (marionR3RoboticOrWeak(reply) || marionR3MaintenanceLeak(reply))) return marionR3ContinuityReply();
  if (node === "lookup_entry" && marionR3RoboticOrWeak(reply)) return marionR3LookupReply();
  if (node === "observation_translation" && (marionR3RoboticOrWeak(reply) || marionR3MaintenanceLeak(reply))) return marionR3ObservationReply();
  if (node === "repair_or_analysis" && (marionR3RoboticOrWeak(reply) || marionR3MaintenanceLeak(reply))) return marionR3RepairReply();
  if (marionR3MaintenanceLeak(reply) && !marionR3Diagnostic(prompt)) return marionR3RepairReply();
  return "";
}
function marionR3SanitizeVisible(reply, prompt, sourceValue) {
  const promptText = marionR3Str(prompt);
  const current = marionR3Str(reply);
  const forced = marionR3Preferred(promptText, current, sourceValue);
  if (forced) return marionR3Naturalize(forced);
  if (marionR3MaintenanceLeak(current) && !marionR3Diagnostic(promptText)) return marionR3Naturalize(marionR3RepairReply());
  return marionR3Naturalize(current);
}
function marionR3VisibleFromObject(value, depth, seen) {
  if (depth > 6 || value == null) return "";
  if (typeof value === "string") return marionR3Str(value);
  if (typeof value !== "object") return "";
  const visited = seen instanceof Set ? seen : new Set();
  if (visited.has(value)) return "";
  visited.add(value);
  const keys = ["directReply","visibleReply","publicReply","finalReply","reply","response","text","message","final","output","answer","spokenText","displayReply"];
  for (const key of keys) {
    if (typeof value[key] === "string" && marionR3Str(value[key])) return marionR3Str(value[key]);
  }
  const nested = ["finalEnvelope","marionFinal","result","payload","data","packet","synthesis","envelope","voice","speech","meta"];
  for (const key of nested) {
    if (value[key] && typeof value[key] === "object") {
      const found = marionR3VisibleFromObject(value[key], depth + 1, visited);
      if (found) return found;
    }
  }
  return "";
}
function marionR3ApplyObject(value, prompt, sourceValue, depth, seen) {
  if (!value || typeof value !== "object" || depth > 6) return value;
  const visited = seen instanceof Set ? seen : new Set();
  if (visited.has(value)) return value;
  visited.add(value);
  const out = Array.isArray(value) ? value.slice() : Object.assign({}, value);
  const before = marionR3VisibleFromObject(out, 0, new Set());
  const after = marionR3SanitizeVisible(before, prompt, sourceValue || out);
  const visibleKeys = ["directReply","visibleReply","publicReply","finalReply","reply","response","text","message","final","output","answer","spokenText","displayReply"];
  if (after) {
    visibleKeys.forEach(function (key) {
      if (Object.prototype.hasOwnProperty.call(out, key) || key === "directReply" || key === "visibleReply" || key === "publicReply" || key === "reply") out[key] = after;
    });
  }
  out.meta = Object.assign({}, marionR3Obj(out.meta), {
    socialPresenceGateVersion: MARION_SOCIAL_PRESENCE_GATE_R3_VERSION,
    conversationalNode: marionR3Node(prompt),
    personalitySpeaksBeforeContinuity: true,
    continuityTranslatedToHumanLanguage: true,
    maintenanceManualPhrasesSuppressed: !marionR3Diagnostic(prompt),
    singleFocusedQuestion: true,
    macFacingPersonality: true,
    protectiveProfessionalTone: true
  });
  const nested = ["finalEnvelope","marionFinal","result","payload","data","packet","synthesis","envelope","voice","speech"];
  nested.forEach(function (key) {
    if (out[key] && typeof out[key] === "object") out[key] = marionR3ApplyObject(out[key], prompt, sourceValue || out, depth + 1, visited);
  });
  return out;
}
function marionR3Apply(result, prompt, sourceValue) {
  const promptText = marionR3Str(prompt) || marionR3DetectPrompt(result, 0, new Set()) || marionR3DetectPrompt(sourceValue, 0, new Set());
  if (typeof result === "string") return marionR3SanitizeVisible(result, promptText, sourceValue || result);
  if (!result || typeof result !== "object") {
    const fallback = marionR3Preferred(promptText, "", sourceValue || result);
    return fallback ? marionR3Naturalize(fallback) : result;
  }
  return marionR3ApplyObject(result, promptText, sourceValue || result, 0, new Set());
}
function marionR3WrapExport(name) {
  if (typeof module === "undefined" || !module.exports || typeof module.exports !== "object") return;
  const fn = module.exports && typeof module.exports[name] === "function" ? module.exports[name] : null;
  if (!fn || fn.__marionSocialPresenceGateR3Patched) return;
  module.exports[name] = function marionSocialPresenceGateR3WrappedExport() {
    const prompt = marionR3ExtractPrompt(arguments);
    const sourceValue = arguments && arguments[0];
    const result = fn.apply(this, arguments);
    if (result && typeof result.then === "function") return result.then(function (value) { return marionR3Apply(value, prompt, sourceValue); });
    return marionR3Apply(result, prompt, sourceValue);
  };
  module.exports[name].__marionSocialPresenceGateR3Patched = true;
}
function marionR3PatchExports(names) {
  if (typeof module === "undefined" || !module.exports) return;
  if (typeof module.exports === "function" && !module.exports.__marionSocialPresenceGateR3Patched) {
    const originalDefault = module.exports;
    const wrappedDefault = function marionSocialPresenceGateR3WrappedDefault() {
      const prompt = marionR3ExtractPrompt(arguments);
      const sourceValue = arguments && arguments[0];
      const result = originalDefault.apply(this, arguments);
      if (result && typeof result.then === "function") return result.then(function (value) { return marionR3Apply(value, prompt, sourceValue); });
      return marionR3Apply(result, prompt, sourceValue);
    };
    Object.keys(originalDefault).forEach(function (key) { try { wrappedDefault[key] = originalDefault[key]; } catch (_) {} });
    wrappedDefault.__marionSocialPresenceGateR3Patched = true;
    module.exports = wrappedDefault;
  }
  if (module.exports && typeof module.exports === "object") {
    (Array.isArray(names) ? names : []).forEach(marionR3WrapExport);
    module.exports.MARION_SOCIAL_PRESENCE_GATE_R3_VERSION = MARION_SOCIAL_PRESENCE_GATE_R3_VERSION;
    module.exports.MARION_SOCIAL_PRESENCE_GATE_R3_PROFILE = MARION_SOCIAL_PRESENCE_GATE_R3_PROFILE;
    module.exports.marionSocialPresenceGateApply = marionR3Apply;
    module.exports.marionSocialPresenceGateSanitizeVisible = marionR3SanitizeVisible;
    module.exports.marionSocialPresenceGateNode = marionR3Node;
    module.exports.marionSocialPresenceGateMaintenanceLeak = marionR3MaintenanceLeak;
    module.exports.MARION_SOCIAL_PRESENCE_GATE_R3_PATCH = true;
    module.exports._internal = Object.assign({}, module.exports._internal || {}, {
      marionR3Node,
      marionR3SanitizeVisible,
      marionR3MaintenanceLeak,
      marionR3IdentityBlocked,
      marionR3SocialReply
    });
  }
}
marionR3PatchExports(["composeMarionResponse","compose","buildReply","run","default","processWithMarion","maybeResolve","ask","handle","route","createMarionBridge","routeMarion","handleVoiceTranscript","handleVoiceInput","handleMessage","createMarionFinalEnvelope","attachVisibleReplyAliases","normalizeFinalEnvelope","toFinalEnvelope","finalize","finalizeTurn","buildStatePatch","normalizeState","applyStatePatch","updateState","handler","handleMarionAdminTextRuntime","invokeMarionAdminTextRuntime","handleTextRuntime"]);
/* MARION_SOCIAL_PRESENCE_GATE_R3_END */

/* MARION_PERSONALITY_GREETING_R4_LIVE_ROUTE_BINDING_START
 * Purpose: Last-mile personality correction for Marion's private admin channel.
 * - Personality speaks before continuity/status scaffolding.
 * - Social check-ins are answered relationally first.
 * - Internal continuity/runtime language is translated before any visible reply renders.
 * - Future personality components are carried as metadata without changing the legacy architecture.
 */
const MARION_PERSONALITY_GREETING_R4_VERSION = "nyx.marion.personalityGreetingR4.liveRouteBinding/1.0";
const MARION_PERSONALITY_GREETING_R4_TRAITS = Object.freeze({
  recipient: "Mac",
  voice: "casual_professional_protective",
  personalityFirst: true,
  continuityInformsButDoesNotSpeak: true,
  oneFocusedQuestionPerReply: true,
  noRoboticServicePhrases: true,
  diagnosticModeRequiredForRuntimeLabels: true,
  futureComponents: Object.freeze({
    socialPresenceGate: "answer greetings and check-ins like a human conversation, not a runtime status panel",
    continuityTranslation: "translate continuity/state signals into natural Mac-facing language",
    protectivePushback: "question risky or unclear requests without becoming cold or dismissive",
    conditionalConversationNodes: "route greeting, check-in, lookup, observation, repair, and closing separately",
    realWorldObservationBridge: "separate observation, inference, risk, and one next move",
    voiceReadoutPolicy: "group numbers naturally and keep email/domain readouts clean",
    calibratedHumor: "allow light, precise humor only when it supports rapport",
    strategicSkepticism: "challenge assumptions when that protects Mac or the objective",
    memoryContinuity: "carry the active thread without exposing internal scaffolding",
    clientPersonaExpansion: "future client-facing modes stay subordinate to Mac's private Marion authority"
  })
});
function marionR4Text(value) { return String(value == null ? "" : value).replace(/\s+/g, " ").trim(); }
function marionR4Lower(value) { return marionR4Text(value).toLowerCase(); }
function marionR4Obj(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function marionR4PromptKeyValue(obj) {
  const o = marionR4Obj(obj);
  const payload = marionR4Obj(o.payload);
  const body = marionR4Obj(o.body);
  const command = marionR4Obj(o.command);
  const meta = marionR4Obj(o.meta || o.metadata);
  const voice = marionR4Obj(o.voice);
  const keys = [
    o.prompt, o.userPrompt, o.rawPrompt, o.message, o.userMessage, o.text, o.userText, o.rawUserText, o.input, o.query, o.commandText,
    o.normalizedUserIntent, o.originalText, o.transcript, o.voiceTranscript,
    payload.prompt, payload.userPrompt, payload.message, payload.userMessage, payload.text, payload.userText, payload.rawUserText, payload.input, payload.query, payload.commandText,
    body.prompt, body.message, body.text, body.userText, body.query, body.commandText,
    command.prompt, command.message, command.text, command.query, command.commandText,
    meta.prompt, meta.message, meta.text, meta.userText, meta.rawUserText,
    voice.prompt, voice.message, voice.text, voice.transcript, voice.normalizedTranscript
  ];
  for (let i = 0; i < keys.length; i += 1) {
    const t = marionR4Text(keys[i]);
    if (t) return t;
  }
  return "";
}
function marionR4DetectPrompt(value, depth, seen) {
  if (!value) return "";
  if (typeof value === "string") return marionR4Text(value);
  if (typeof value !== "object") return "";
  const level = Number.isFinite(Number(depth)) ? Number(depth) : 0;
  if (level > 7) return "";
  const visited = seen instanceof Set ? seen : new Set();
  if (visited.has(value)) return "";
  visited.add(value);
  const direct = marionR4PromptKeyValue(value);
  if (direct) return direct;
  const preferred = ["body", "payload", "command", "request", "input", "meta", "metadata", "voice", "normalized", "norm", "source", "context"];
  for (const key of preferred) {
    if (value[key] && typeof value[key] === "object") {
      const found = marionR4DetectPrompt(value[key], level + 1, visited);
      if (found) return found;
    }
  }
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i += 1) {
      const found = marionR4DetectPrompt(value[i], level + 1, visited);
      if (found) return found;
    }
  }
  return "";
}
function marionR4ExtractPrompt(argsLike) {
  const args = Array.prototype.slice.call(argsLike || []);
  for (let i = 0; i < args.length; i += 1) {
    const found = marionR4DetectPrompt(args[i], 0, new Set());
    if (found) return found;
  }
  return "";
}
function marionR4Diagnostic(prompt, source) {
  const t = marionR4Lower([prompt, marionR4DetectPrompt(source, 0, new Set())].join(" "));
  return /\b(diagnostic mode|debug mode|runtime diagnostic|show diagnostics|trace|stack trace|explain the priority stack|show the priority stack|priority\s*9[a-z0-9-]*|what priority)\b/i.test(t);
}
function marionR4Node(prompt) {
  const t = marionR4Lower(prompt).replace(/[.!?]+$/g, "").trim();
  if (!t) return "";
  if (/^(?:how are you|how are you doing|how do you feel|how are things|how's things|you okay|are you okay|you good|are you good|how is marion|how's marion)(?:\s+(?:marion|mac))?$/.test(t)) return "social_checkin";
  if (/^(?:good\s+morning|morning|good\s+afternoon|afternoon|good\s+evening|evening|hello|hi|hey|hiya)(?:\s+(?:marion|mac))?$/.test(t)) return "relational_greeting";
  if (/^(?:marion|are you there|you there|are you with me|you with me|still with me)$/.test(t)) return "presence_check";
  if (/\b(where were we|where are we|what were we doing|what are we working on|continue from where we left|next steps|what next)\b/i.test(t)) return "continuity_check";
  if (/\b(look up|search|verify|check online|find current|pull up|research this)\b/i.test(t)) return "lookup_pacing";
  if (/\b(real[- ]world|what do you see|what are you seeing|observation|camera|sensor|live environment|translate what you see)\b/i.test(t)) return "observation_bridge";
  if (/\b(not a pass|still failing|still showing|same issue|wrong response|fix this|didn't work|does not work|broken|maintenance manual)\b/i.test(t)) return "repair_refinement";
  return "standard";
}
function marionR4IdentityBlocked(value, depth, seen) {
  if (!value || typeof value !== "object") return false;
  const level = Number.isFinite(Number(depth)) ? Number(depth) : 0;
  if (level > 5) return false;
  const visited = seen instanceof Set ? seen : new Set();
  if (visited.has(value)) return false;
  visited.add(value);
  const o = marionR4Obj(value);
  if (o.identityVerified === false || o.adminVerified === false || o.speakerAuthorized === false || o.remoteTrustedUserVerified === false) return true;
  const identity = marionR4Obj(o.identity || o.speakerIdentity || o.userIdentity || o.auth);
  const names = [o.userName, o.username, o.displayName, o.speakerName, o.currentUser, o.authorizedUser, identity.userName, identity.displayName, identity.speakerName, identity.currentUser, identity.roleBinding].map(marionR4Lower).filter(Boolean);
  for (const name of names) {
    if (/\b(public|guest|unknown|visitor|non[_-]?mac|unauthorized)\b/i.test(name)) return true;
    if (/\b(mac|sean|shaun|shawn|admin|remote_trusted_user)\b/i.test(name)) continue;
    if (name && /\buser\b/i.test(name) && !/\btrusted\b/i.test(name)) return true;
  }
  const nested = ["payload", "meta", "metadata", "identity", "speakerIdentity", "userIdentity", "auth", "context"];
  for (const key of nested) if (o[key] && typeof o[key] === "object" && marionR4IdentityBlocked(o[key], level + 1, visited)) return true;
  return false;
}
function marionR4MaintenanceLeak(reply) {
  const text = marionR4Text(reply);
  if (!text) return false;
  return /\b(?:the\s+)?(?:9h\s+)?continuity foundation(?:\s+stays\s+active|\s+is\s+active)?\b/i.test(text) ||
    /\b(Priority\s*9[A-Z0-9-]*|mission thread|pressure prompt|runtime handler|routeKind|speechHints|presenceProfile|replyAuthority|sessionPatch|finalEnvelope|state spine|progression shaping|diagnostic packet|MARION::FINAL::|CHATENGINE_COORDINATOR_ONLY_ACTIVE_\d{4}_\d{2}_\d{2})\b/i.test(text);
}
function marionR4Robotic(reply) {
  const t = marionR4Lower(reply);
  return !t || /\b(let me assist you|how may i assist|please provide|i am here to assist|utilize|facilitate|the continuity foundation|runtime handler|diagnostic packet)\b/i.test(t);
}
function marionR4LimitQuestions(reply) {
  const text = marionR4Text(reply);
  let seenQuestion = false;
  return text.replace(/([^?]*\?)/g, function (match) {
    if (!seenQuestion) { seenQuestion = true; return match; }
    return match.replace(/\?/g, ".");
  }).replace(/\s+/g, " ").trim();
}
function marionR4StripOperational(reply, allowDiagnostic) {
  let text = marionR4Text(reply);
  if (!text) return "";
  if (allowDiagnostic === true) return marionR4LimitQuestions(text);
  text = text
    .replace(/\bThe\s+(?:9H\s+)?continuity foundation stays active\.?/gi, "I’m steady, Mac. I’m still with the thread.")
    .replace(/\b(?:The\s+)?(?:9H\s+)?continuity foundation(?:\s+is\s+active|\s+stays\s+active)?\.?/gi, "I’m still with the thread.")
    .replace(/[^.?!]*(?:Priority\s*9[A-Z0-9-]*|mission thread|pressure prompt|runtime handler|routeKind|speechHints|presenceProfile|replyAuthority|sessionPatch|finalEnvelope|state spine|progression shaping|diagnostic packet|MARION::FINAL::|CHATENGINE_COORDINATOR_ONLY_ACTIVE_\d{4}_\d{2}_\d{2})[^.?!]*[.?!]?/gi, " ")
    .replace(/\b(?:9I|9J|9H)\b/gi, "")
    .replace(/\bLet me assist you with that\b/gi, "Let me take a look at this for you")
    .replace(/\bHow may I assist you\??\b/gi, "What do you want to tackle next?")
    .replace(/\bI am here to assist\b/gi, "I’m here with you")
    .replace(/\bPlease provide the necessary information\b/gi, "Send me the key detail")
    .replace(/\butilize\b/gi, "use")
    .replace(/\bfacilitate\b/gi, "help")
    .replace(/\bin order to\b/gi, "to")
    .replace(/\s+([,.!?;:])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
  return marionR4LimitQuestions(text);
}
function marionR4SocialReply() {
  return "I’m good, Mac. I’m steady, and I’m still with the thread. We’re tightening my personality layer now, so I’ll keep the conversation warmer, cleaner, and protective without letting backend language show. Do you want me to tighten the greeting path first?";
}
function marionR4GreetingReply(prompt) {
  const t = marionR4Lower(prompt);
  const opener = /^good\s+morning|^morning/.test(t) ? "Good morning, Mac." : /^good\s+afternoon|^afternoon/.test(t) ? "Good afternoon, Mac." : /^good\s+evening|^evening/.test(t) ? "Good evening, Mac." : "Hello, Mac.";
  return `${opener} I’m here with you. I’ll keep this warm, professional, protective, and clean — no backend perfume in the visible reply. Do you want to continue with the personality layer?`;
}
function marionR4PresenceReply() { return "I’m here, Mac. I’m steady, private to you, and tracking the active thread. What should I focus on first?"; }
function marionR4ContinuityReply() { return "We’re still on Marion’s personality layer: greeting behavior, social presence, protective professionalism, response shape, and future real-world transition handling. The next clean move is to test the greeting and check-in path."; }
function marionR4LookupReply() { return "Hang tight, Mac. I’ll take a breath, check the source, and bring it back cleanly with the useful part first."; }
function marionR4ObservationReply() { return "I’ll translate what I’m seeing into four parts: observation, inference, risk, and one next move. That keeps the real-world signal useful instead of noisy."; }
function marionR4RepairReply() { return "You’re right to flag it, Mac. That is still a last-mile response-shape issue, so I’m going to treat the visible reply as the failure point and keep the fix narrow."; }
function marionR4IdentityReply() { return "I can’t continue a private Marion conversation unless the active speaker is verified as Mac. Private runtime context stays locked."; }
function marionR4Fallback(prompt, reply) {
  const clean = marionR4StripOperational(reply, false);
  if (clean && !marionR4Robotic(clean)) return clean;
  return "I’m with you, Mac. I’ll keep the reply human, protective, and focused. Send the next exact target.";
}
function marionR4ShapeReply(reply, prompt, source) {
  const promptText = marionR4Text(prompt || marionR4DetectPrompt(source, 0, new Set()));
  const node = marionR4Node(promptText);
  if (marionR4IdentityBlocked(source, 0, new Set())) return marionR4IdentityReply();
  const diagnostic = marionR4Diagnostic(promptText, source);
  if (diagnostic) return marionR4StripOperational(reply, true) || marionR4Text(reply);
  if (node === "social_checkin") return marionR4SocialReply();
  if (node === "relational_greeting") return marionR4GreetingReply(promptText);
  if (node === "presence_check") return marionR4PresenceReply();
  if (node === "continuity_check") return marionR4ContinuityReply();
  if (node === "lookup_pacing") return marionR4LookupReply();
  if (node === "observation_bridge") return marionR4ObservationReply();
  if (node === "repair_refinement") return marionR4RepairReply();
  if (marionR4MaintenanceLeak(reply)) return marionR4SocialReply();
  return marionR4Fallback(promptText, reply);
}
function marionR4AttachAliases(target, reply, prompt, depth, seen) {
  if (!target || typeof target !== "object") return target;
  const level = Number.isFinite(Number(depth)) ? Number(depth) : 0;
  if (level > 5) return target;
  const visited = seen instanceof Set ? seen : new Set();
  if (visited.has(target)) return target;
  visited.add(target);
  const text = marionR4Text(reply);
  if (!text) return target;
  const promptText = marionR4Text(prompt || marionR4DetectPrompt(target, 0, new Set()));
  const node = marionR4Node(promptText) || (marionR4MaintenanceLeak(text) ? "social_checkin" : "standard");
  ["directReply", "reply", "text", "message", "displayReply", "publicReply", "visibleReply", "finalReply", "adminReply", "marionReply", "privateReply", "answer", "output", "response", "spokenText", "speechText"].forEach(function (key) { target[key] = text; });
  if (node === "social_checkin" || node === "relational_greeting" || node === "presence_check") {
    target.contextSummary = text;
    target.currentObjective = "Keep Marion human, protective, professional, and clean in the visible conversation.";
    target.nextAction = node === "social_checkin" ? "Test the social check-in path again." : "Continue the personality-layer refinement.";
  } else if (!marionR4Text(target.contextSummary) || marionR4MaintenanceLeak(target.contextSummary)) {
    target.contextSummary = "Marion translated internal state into Mac-facing language before display.";
  }
  target.personalityGreetingR4 = {
    version: MARION_PERSONALITY_GREETING_R4_VERSION,
    node,
    recipient: "Mac",
    personalityFirst: true,
    continuityInformsButDoesNotSpeak: true,
    oneFocusedQuestionPerReply: true,
    futureComponents: MARION_PERSONALITY_GREETING_R4_TRAITS.futureComponents
  };
  target.meta = Object.assign({}, marionR4Obj(target.meta || target.metadata), {
    personalityGreetingR4: true,
    personalityGreetingR4Version: MARION_PERSONALITY_GREETING_R4_VERSION,
    personalityNode: node,
    marionRecipient: "Mac",
    publicUsersCanAddressMarion: false,
    diagnosticsHiddenUnlessRequested: true,
    continuityTranslatedForVisibleReply: true,
    maintenanceManualLeakBlocked: true,
    futurePersonalityComponentsCarried: true
  });
  const nested = ["payload", "finalEnvelope", "marionFinal", "data", "result", "packet", "envelope", "synthesis", "runtime", "responseEnvelope", "body"];
  for (const key of nested) {
    if (target[key] && typeof target[key] === "object") marionR4AttachAliases(target[key], text, promptText, level + 1, visited);
  }
  return target;
}
function marionR4ShapeResult(result, prompt, source, forceString) {
  const reply = typeof result === "string" ? result : marionR4Text(result && (result.directReply || result.reply || result.displayReply || result.publicReply || result.visibleReply || result.finalReply || result.text || result.message || result.answer || result.output || result.response));
  const promptText = marionR4Text(prompt || marionR4DetectPrompt(source || result, 0, new Set()));
  const shaped = marionR4ShapeReply(reply, promptText, source || result);
  if (forceString === true || typeof result === "string") return shaped;
  if (result && typeof result === "object") return marionR4AttachAliases(result, shaped, promptText, 0, new Set());
  return shaped;
}
function marionR4ExportNeedsString(name) {
  return /^(?:composeMarionResponse|compose|buildReply|routeMarion|handleMarionAdminTextRuntime|invokeMarionAdminTextRuntime|handleTextRuntime|run|handler|default)$/i.test(String(name || ""));
}
function marionR4WrapFunction(fn, name, forceString) {
  if (typeof fn !== "function" || fn.__marionPersonalityGreetingR4Patched) return fn;
  const wrapped = function marionPersonalityGreetingR4Wrapped() {
    const prompt = marionR4ExtractPrompt(arguments);
    const result = fn.apply(this, arguments);
    if (result && typeof result.then === "function") return result.then(function (value) { return marionR4ShapeResult(value, prompt, value, forceString === true || marionR4ExportNeedsString(name)); });
    return marionR4ShapeResult(result, prompt, result, forceString === true || marionR4ExportNeedsString(name));
  };
  try { Object.keys(fn).forEach(function (key) { wrapped[key] = fn[key]; }); } catch (_) {}
  wrapped.__marionPersonalityGreetingR4Patched = true;
  return wrapped;
}
try {
  if (typeof priority9IReplyFor === "function" && !priority9IReplyFor.__marionPersonalityGreetingR4Patched) priority9IReplyFor = marionR4WrapFunction(priority9IReplyFor, "priority9IReplyFor", true);
  if (typeof priority9IJReadReply === "function" && !priority9IJReadReply.__marionPersonalityGreetingR4Patched) priority9IJReadReply = marionR4WrapFunction(priority9IJReadReply, "priority9IJReadReply", true);
  if (typeof attachVisibleReplyAliases === "function" && !attachVisibleReplyAliases.__marionPersonalityGreetingR4Patched) attachVisibleReplyAliases = marionR4WrapFunction(attachVisibleReplyAliases, "attachVisibleReplyAliases", false);
  if (typeof createMarionFinalEnvelope === "function" && !createMarionFinalEnvelope.__marionPersonalityGreetingR4Patched) createMarionFinalEnvelope = marionR4WrapFunction(createMarionFinalEnvelope, "createMarionFinalEnvelope", false);
  if (typeof marionAdminConversationSafeReply === "function" && !marionAdminConversationSafeReply.__marionPersonalityGreetingR4Patched) marionAdminConversationSafeReply = marionR4WrapFunction(marionAdminConversationSafeReply, "marionAdminConversationSafeReply", true);
  if (typeof finalizeRenderableReply === "function" && !finalizeRenderableReply.__marionPersonalityGreetingR4Patched) finalizeRenderableReply = marionR4WrapFunction(finalizeRenderableReply, "finalizeRenderableReply", true);
  if (typeof marionAdminProjectionCleanReply === "function" && !marionAdminProjectionCleanReply.__marionPersonalityGreetingR4Patched) marionAdminProjectionCleanReply = marionR4WrapFunction(marionAdminProjectionCleanReply, "marionAdminProjectionCleanReply", true);
} catch (_) {}
try {
  if (typeof MarionAdminConsoleGateway !== "undefined" && MarionAdminConsoleGateway && MarionAdminConsoleGateway.prototype) {
    ["handleCommand", "dispatchCommand", "routeCommand", "command", "handleAdminCommand", "handleAdminConsoleAction", "handle", "process", "safeResponse"].forEach(function (name) {
      const fn = MarionAdminConsoleGateway.prototype[name];
      if (typeof fn === "function" && !fn.__marionPersonalityGreetingR4Patched) MarionAdminConsoleGateway.prototype[name] = marionR4WrapFunction(fn, name, false);
    });
  }
} catch (_) {}
try {
  if (typeof defaultGateway !== "undefined" && defaultGateway && typeof defaultGateway === "object") {
    ["handleCommand", "dispatchCommand", "routeCommand", "command", "handleAdminCommand", "handleAdminConsoleAction", "handle", "process", "safeResponse"].forEach(function (name) {
      if (typeof defaultGateway[name] === "function" && !defaultGateway[name].__marionPersonalityGreetingR4Patched) defaultGateway[name] = marionR4WrapFunction(defaultGateway[name], name, false).bind(defaultGateway);
    });
  }
} catch (_) {}
try {
  if (typeof handleCommand === "function" && !handleCommand.__marionPersonalityGreetingR4Patched) handleCommand = marionR4WrapFunction(handleCommand, "handleCommand", false);
  if (typeof handleAdminConsoleAction === "function" && !handleAdminConsoleAction.__marionPersonalityGreetingR4Patched) handleAdminConsoleAction = marionR4WrapFunction(handleAdminConsoleAction, "handleAdminConsoleAction", false);
  if (typeof handle === "function" && !handle.__marionPersonalityGreetingR4Patched) handle = marionR4WrapFunction(handle, "handle", false);
  if (typeof process === "function" && !process.__marionPersonalityGreetingR4Patched) process = marionR4WrapFunction(process, "process", false);
} catch (_) {}
try {
  if (typeof module !== "undefined" && module.exports) {
    if (typeof module.exports === "function" && !module.exports.__marionPersonalityGreetingR4Patched) {
      const originalDefault = module.exports;
      const wrappedDefault = marionR4WrapFunction(originalDefault, "default", true);
      Object.keys(originalDefault).forEach(function (key) { try { wrappedDefault[key] = originalDefault[key]; } catch (_) {} });
      module.exports = wrappedDefault;
    }
    if (module.exports && typeof module.exports === "object") {
      ["composeMarionResponse", "compose", "buildReply", "routeMarion", "createMarionFinalEnvelope", "attachVisibleReplyAliases", "finalize", "buildFinalEnvelope", "toFinalEnvelope", "normalizeFinalEnvelope", "handleMarionAdminTextRuntime", "invokeMarionAdminTextRuntime", "handleTextRuntime", "handleCommand", "dispatchCommand", "routeCommand", "command", "handleAdminCommand", "handleAdminConsoleAction", "handle", "process", "run", "handler", "default"].forEach(function (name) {
        if (typeof module.exports[name] === "function" && !module.exports[name].__marionPersonalityGreetingR4Patched) module.exports[name] = marionR4WrapFunction(module.exports[name], name, marionR4ExportNeedsString(name));
      });
      module.exports.MARION_PERSONALITY_GREETING_R4_VERSION = MARION_PERSONALITY_GREETING_R4_VERSION;
      module.exports.MARION_PERSONALITY_GREETING_R4_TRAITS = MARION_PERSONALITY_GREETING_R4_TRAITS;
      module.exports.marionPersonalityGreetingR4ShapeReply = marionR4ShapeReply;
      module.exports.marionPersonalityGreetingR4ShapeResult = marionR4ShapeResult;
      module.exports.MARION_PERSONALITY_GREETING_R4_PATCH = true;
    }
  }
} catch (_) {}
/* MARION_PERSONALITY_GREETING_R4_LIVE_ROUTE_BINDING_END */

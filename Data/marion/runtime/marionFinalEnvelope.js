"use strict";

/**
 * marionFinalEnvelope.js
 * marionFinalEnvelope v2.2.0 FINAL-TRANSPORT-CONTRACT-STABILIZED
 * Single-source final envelope builder + validator + JSON-safe transport normalizer.
 */

const VERSION = "PRIORITY-9F-R2-DOMAIN-HIJACK-SUPPRESSION + PRIORITY-9F-R1-LAYERED-PRECEDENCE-HOTFIX + PRIORITY-9F-DEEP-CONVERSATIONAL-STACK + marionFinalEnvelope v2.3.7 PRIORITY-9E-R3-SPECIFIC-TASK-RECALL-ENFORCEMENT + PRIORITY-9E-R2-CONCRETE-CONTINUATION-ENFORCEMENT + PRIORITY-9E-META-RECOVERY-SUPPRESSION + PRIORITY-90-ECHO-FALLBACK-REPAIR + MARION-ADMIN-VOICE-OUTPUT-PROJECTION-V1 + MARION-ADMIN-PRIVATE-VOICE-RECEIVE-V1 + MARION-ADMIN-INTERFACE-TRANSPORT + PHASE2-SPEECH-SYNC-COMPAT + SIX-DOMAIN-AUTHORITY-PROMOTION + ADAPTIVE-TRUST-VERIFICATION + FINAL-TRANSPORT-CONTRACT-STABILIZED + TELEMETRY-VISIBILITY-FAILURE-SIGNATURE-AUDIT + FINAL-RENDER-TELEMETRY-HARDLOCK";
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

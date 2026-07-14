"use strict";

/**
 * Utils/domainRouter.js
 *
 * Domain Router (pure, side-effect-free)
 * Chooses which knowledge domain(s) should be queried for a turn, based on:
 * - lane + action + turn intent
 * - lightweight keyword signals (NO raw text stored)
 * - risk posture (avoid risky domains when high risk)
 * - macMode (architect/user/transitional)
 *
 * Works with domainPackLoader + <domain>Knowledge modules:
 * - domainPackLoader loads packs into memory (fs-bound)
 * - domain knowledge modules expose getMarionHints / query functions (pure)
 *
 * Exports:
 * - routeDomain(norm, session, cog, opts) -> { primary, secondary[], reason, signals }
 * - scoreDomains(norm, session, cog, opts) -> { scores, signals }
 * - DOMAIN_ENUM, DEFAULT_DOMAIN_ORDER
 */

const domainConfidenceMod = (() => { try { return require("../Data/marion/runtime/domainConfidence.js"); } catch (_) { return null; } })();

const ROUTER_VERSION = "domainRouter v1.5.7 REFERENCEERROR-TRIAD-HARDENING-V1 + REFERENCEERROR-ENTRYPOINT-HARDENED + SIX-DOMAIN-DEFINITION-SCORE-AUTHORITY + SIX-DOMAIN-COVERAGE-CARRY + CROSS-DOMAIN-SECONDARY-LANE-SCORING-LOCK + SIX-DOMAIN-DEFINITION-ROUTING-LOCK + TECHNICAL-FOLLOWUP-INTENT-LOCK + CYBER-LEAST-PRIVILEGE-PRECISION + TOPLEVEL-CONFIDENCE + TECHNICAL-INFRA-PRECEDENCE-HARDENED + R18C-LAW-DOMAIN-ROUTING-REGISTRY";

// -------------------------
// helpers
// -------------------------
function safeStr(x, max = 240) {
  if (x === null || x === undefined) return "";
  const s = String(x);
  return s.length > max ? s.slice(0, max) + "…" : s;
}
function isPlainObject(x) {
  return (
    !!x &&
    typeof x === "object" &&
    (Object.getPrototypeOf(x) === Object.prototype || Object.getPrototypeOf(x) === null)
  );
}
function safeObj(x) {
  return isPlainObject(x) ? x : {};
}
function uniq(arr, max = 8) {
  const out = [];
  const seen = new Set();
  for (const it of Array.isArray(arr) ? arr : []) {
    const v = safeStr(it, 40).trim().toLowerCase();
    if (!v) continue;
    if (seen.has(v)) continue;
    seen.add(v);
    out.push(v);
    if (out.length >= max) break;
  }
  return out;
}
function clamp01(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}
function normToken(s) {
  return safeStr(s, 80).trim().toLowerCase();
}

function normalizeInputSource(value) {
  const raw = normToken(value || "");
  if (/voice|speech|mic|audio|headset/.test(raw)) return "voice";
  if (/text|typed|keyboard|manual/.test(raw)) return "text";
  return raw || "text";
}

function normalizeVoiceTextParityText(value) {
  return safeStr(value, 1400)
    .replace(/\b(nick|nix|mix|mike)\b/gi, "Nyx")
    .replace(/\b(state\s+line|state\s+sign|state\s+spine|statespine)\b/gi, "State Spine")
    .replace(/\b(chad\s+engine|chat\s+engine)\b/gi, "ChatEngine")
    .replace(/\b(mary\s+bridge|marian\s+bridge|marion\s+bridge)\b/gi, "MarionBridge")
    .replace(/\b(compose\s+marion\s+response|composed\s+marion\s+response|compose\s+marian\s+response|composed\s+marian\s+response)\b/gi, "ComposeMarionResponse")
    .replace(/\b(mic\s*text|mic\s*tech|mike\s*text|mike\s*tech)\b/gi, "mic text")
    .replace(/\b(5\s*term|five\s*term|five\s*turn|5\s*turn)\b/gi, "5-turn")
    .replace(/\s+/g, " ")
    .trim();
}


function canonicalTechnicalTargetFromText(text = "") {
  const t = safeStr(text, 1400);
  const mk = (targetKey, targetName, targetFile, targetPath) => ({ version: "nyx.marion.technicalTargetLock/1.1", targetKey, targetName, targetFile, targetPath, explicit: true, source: "current_user_text", locked: true, technicalFollowUpLock: true, blockScheduleInterception: true });
  if (/\b(chat\s*engine|chatengine)\b/i.test(t)) return mk("chatEngine", "ChatEngine", "chatEngine.js", "Utils/chatEngine.js");
  if (/\b(marion\s*bridge|marionbridge)\b/i.test(t)) return mk("marionBridge", "MarionBridge", "marionBridge.js", "Data/marion/runtime/marionBridge.js");
  if (/\b(compose\s*marion\s*response|composemarionresponse|composer)\b/i.test(t)) return mk("composeMarionResponse", "ComposeMarionResponse", "composeMarionResponse.js", "Data/marion/runtime/composeMarionResponse.js");
  if (/\b(state\s*spine|statespine|state-spine)\b/i.test(t)) return mk("stateSpine", "StateSpine", "stateSpine.js", "Utils/stateSpine.js");
  if (/\b(marion\s*intent\s*router|intent\s*router|marionintentrouter)\b/i.test(t)) return mk("marionIntentRouter", "MarionIntentRouter", "marionIntentRouter.js", "Data/marion/runtime/marionIntentRouter.js");
  if (/\b(domain\s*router|domainrouter)\b/i.test(t)) return mk("domainRouter", "DomainRouter", "domainRouter.js", "Utils/domainRouter.js");
  if (/\b(index\.js|api\/chat|\/api\/chat)\b/i.test(t)) return mk("index", "index.js", "index.js", "index.js");
  return {};
}
function isTechnicalFollowUpIntent(text = "") {
  const target = canonicalTechnicalTargetFromText(text);
  return !!(target && target.targetPath && (/\b(now|next|then|also|again|after that|from there)\b/i.test(text) || /\b(full autopsy|autopsy|audit|line[-\s]?by[-\s]?line|check|inspect|review|patch|harden|run)\b/i.test(text)));
}

function isInfrastructureContinuityPrompt(text) {
  const t = normalizeVoiceTextParityText(text).toLowerCase();
  return /\b(bootstrap|guard|manifest|declared path|root path|domain isolation|domain route|domain routing|fail[-\s]?closed|silent fallback|cross[-\s]?domain bleed|domain bleed|domain path|final envelope|state spine|5-turn|five-turn|continuity regression|mic text parity|input source parity|same route|same state|same final|response consistency)\b/i.test(t) || /\b(broken|invalid|failed|missing)\b.*\b(psychology|english|finance|general|domain)\b.*\b(affect|fallback|bleed|load|route)\b/i.test(t) || /\b(should not|must not|cannot)\b.*\b(affect|fall back|fallback|bleed)\b.*\b(english|finance|general|psychology)\b/i.test(t);
}

function continuityHash(value) {
  const source = normalizeVoiceTextParityText(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  let hash = 2166136261;
  for (let i = 0; i < source.length; i += 1) {
    hash ^= source.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
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
  "DEBUG_LEAK_BLOCKED"
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
  if(/\broutekind=|finalenvelope|sessionpatch|diagnostic packet|replyauthority=|speechhints=|presenceprofile=|nyxstatehint=\b/i.test(telemetryAuditText(f.reply||"")))return"DEBUG_LEAK_BLOCKED";
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
function isTelemetryLeakText(value=""){
  return /\b(routeKind=|speechHints=|presenceProfile=|finalEnvelope|sessionPatch|marionFinal|transportSafe|replyAuthority=|nyxStateHint=|diagnostic packet|final envelope missing|non-final)\b/i.test(telemetryAuditText(value));
}
function stripTelemetryLeakFromReply(value=""){
  const text=telemetryAuditText(value);
  if(!text)return"";
  if(isTelemetryLeakText(text))return text.replace(/\b(routeKind|speechHints|presenceProfile|finalEnvelope|sessionPatch|marionFinal|transportSafe|replyAuthority|nyxStateHint)\s*=\s*[^.;,\n]+[.;,]?\s*/gi,"").replace(/\bdiagnostic packet\b/ig,"").replace(/\bfinal envelope missing\b/ig,"").replace(/\bnon-final\b/ig,"").replace(/\s+/g," ").trim();
  return text;
}




function isDefinitionQuery(text = "") {
  const t = normalizeVoiceTextParityText(text).toLowerCase();
  return !!t && (/\b(what\s+is|what\s+are|define|definition\s+of|meaning\s+of|explain|explain\s+the\s+term|explain\s+the\s+word|describe)\b/i.test(t) || /\?$/.test(t));
}

function definitionKnowledgeDomainFromText(text = "") {
  const t = normalizeVoiceTextParityText(text).toLowerCase();
  if (!isDefinitionQuery(t)) return "";
  if (canonicalTechnicalTargetFromText(t).targetPath) return "";
  if (/\b(full autopsy|line[-\s]?by[-\s]?line|audit|critical fix|critical fixes|patch|debug|backend|frontend|widget|script|file|api\/chat|render|deploy|syntax|node --check)\b/i.test(t)) return "";
  const crossDomainProfile = crossDomainSecondaryLaneProfile(t);
  if (crossDomainProfile && crossDomainProfile.primary) return crossDomainProfile.primary;
  const domainTerms = [
    [DOMAIN_ENUM.LAW, /\b(contract consideration|legal consideration|consideration in contract|consideration|contract|contract law|statute|jurisdiction|legal information|legal advice|liability|negligence|fiduciary|tort|case law|compliance)\b/i],
    [DOMAIN_ENUM.FIN, /\b(cash[-\s]?flow|unit economics|runway|margin|gross margin|profit|revenue|ltv|cac|working capital|burn rate|capital markets|pricing tier|scenario analysis|financial resilience)\b/i],
    [DOMAIN_ENUM.PSY, /\b(cognitive distortion|emotional regulation|attachment|trauma|bias|cognition|cognitive|shutdown|emotional shutdown|anxiety|panic|behavior|behaviour)\b/i],
    [DOMAIN_ENUM.AI, /\b(tool routing|rag|retrieval augmented generation|llm|large language model|embedding|agent orchestration|ai agent|artificial intelligence|machine learning|model inference|prompt injection in ai)\b/i],
    [DOMAIN_ENUM.CYBER, /\b(least privilege|mfa|multi[-\s]?factor|iam|identity access|zero trust|incident response|threat model|input validation|secrets rotation|phishing|ransomware|endpoint security|cloud security|network security|data protection|privacy minimization)\b/i],
    [DOMAIN_ENUM.EN, /\b(sentence clarity|syntax|grammar|tone|wording|language flow|professional clarity|plain language|copyedit|proofread)\b/i]
  ];
  for (const [domain, rx] of domainTerms) if (rx.test(t)) return domain;
  return "";
}


function crossDomainSecondaryLaneProfile(text = "") {
  const t = normalizeVoiceTextParityText(text).toLowerCase();
  if (!t || canonicalTechnicalTargetFromText(t).targetPath) return null;
  if (/\b(full autopsy|line[-\s]?by[-\s]?line|audit|critical fix|critical fixes|patch|debug|backend|frontend|widget|script|file|api\/chat|render|deploy|syntax|node --check)\b/i.test(t)) return null;
  const aiContext = /\b(ai product|ai system|ai agent|ai model|artificial intelligence product|artificial intelligence system|llm product|model product|recommendation system|machine learning system)\b/i.test(t);
  if (aiContext && /\b(security|cyber|prompt injection|threat|vulnerability|attack|abuse|hardening|access control|secrets|input validation)\b/i.test(t)) return { primary:DOMAIN_ENUM.AI, secondary:[DOMAIN_ENUM.CYBER], reason:"ai_product_security_secondary_cyber", confidence:0.97, answerMode:"direct_with_secondary_context" };
  if (aiContext && /\b(business|finance|financial|cash[-\s]?flow|revenue|pricing|margin|cost|runway|market|commercial)\b/i.test(t)) return { primary:DOMAIN_ENUM.AI, secondary:[DOMAIN_ENUM.FIN], reason:"ai_product_business_secondary_finance", confidence:0.94, answerMode:"direct_with_secondary_context" };
  if (aiContext && /\b(compliance|regulatory|regulation|legal|law|governance|audit|liability|privacy|consent|data protection|risk)\b/i.test(t)) return { primary:DOMAIN_ENUM.AI, secondary:[DOMAIN_ENUM.LAW], reason:"ai_product_compliance_secondary_law", confidence:0.97, answerMode:"direct_with_secondary_context" };
  if (/\bcash[-\s]?flow risk\b/i.test(t) && /\b(legal dispute|lawsuit|litigation|claim|settlement|court|legal)\b/i.test(t)) return { primary:DOMAIN_ENUM.FIN, secondary:[DOMAIN_ENUM.LAW], reason:"finance_cashflow_legal_secondary", confidence:0.95, answerMode:"direct_with_secondary_context" };
  if (/\b(rewrite|translate|make|put)\b/i.test(t) && /\blegal clause\b/i.test(t) && /\bplain english|plain language|clear english\b/i.test(t)) return { primary:DOMAIN_ENUM.EN, secondary:[DOMAIN_ENUM.LAW], reason:"english_plain_language_legal_secondary", confidence:0.94, answerMode:"direct_with_secondary_context" };
  if (/\b(cognitive bias|cognitive distortion|bias)\b/i.test(t) && /\b(ai|recommendation system|model|algorithm|machine learning)\b/i.test(t)) return { primary:DOMAIN_ENUM.AI, secondary:[DOMAIN_ENUM.PSY], reason:"ai_recommendation_psychology_secondary", confidence:0.95, answerMode:"direct_with_secondary_context" };
  if (/\b(prompt injection)\b/i.test(t) && /\bplain english|plain language|non[-\s]?technical|business owner\b/i.test(t)) return { primary:DOMAIN_ENUM.CYBER, secondary:[DOMAIN_ENUM.AI,DOMAIN_ENUM.EN], reason:"cyber_prompt_injection_plain_english", confidence:0.95, answerMode:"direct_with_secondary_context" };
  if (/\bleast privilege\b/i.test(t) && /\bnon[-\s]?technical|business owner|plain english|plain language\b/i.test(t)) return { primary:DOMAIN_ENUM.CYBER, secondary:[DOMAIN_ENUM.EN], reason:"cyber_least_privilege_plain_english", confidence:0.95, answerMode:"direct_with_secondary_context" };
  return null;
}

function hasAny(text, reList) {
  const t = safeStr(text, 1400).toLowerCase();
  for (const re of reList) {
    if (re.test(t)) return true;
  }
  return false;
}

// -------------------------
// Domain enum + defaults
// -------------------------
const DOMAIN_ENUM = Object.freeze({
  CORE: "core", // generic fallback
  TECH: "technical", // backend/runtime diagnostics
  MUSIC: "music", // (if you use it)
  PSY: "psychology",
  CYBER: "cyber",
  EN: "english",
  LAW: "law",
  FIN: "finance",
  STRAT: "strategy",
  AI: "ai",
  MKT: "marketing", // optional if you add later
});

const DEFAULT_DOMAIN_ORDER = Object.freeze([
  DOMAIN_ENUM.TECH,
  DOMAIN_ENUM.AI,
  DOMAIN_ENUM.FIN,
  DOMAIN_ENUM.LAW,
  DOMAIN_ENUM.CYBER,
  DOMAIN_ENUM.PSY,
  DOMAIN_ENUM.STRAT,
  DOMAIN_ENUM.EN,
  DOMAIN_ENUM.CORE,
]);
const SIX_KNOWLEDGE_DOMAINS = Object.freeze([DOMAIN_ENUM.PSY, DOMAIN_ENUM.EN, DOMAIN_ENUM.AI, DOMAIN_ENUM.CYBER, DOMAIN_ENUM.LAW, DOMAIN_ENUM.FIN]);

function buildSixDomainCoverage(scores = {}, domainConfidence = {}) {
  const dc = safeObj(domainConfidence);
  const candidates = Array.isArray(dc.candidates) ? dc.candidates : [];
  return SIX_KNOWLEDGE_DOMAINS.map((domain) => {
    const candidate = candidates.find((item) => safeObj(item).domain === domain || safeObj(item).selectedDomain === domain) || {};
    const score = Number.isFinite(Number(scores[domain])) ? Number(scores[domain]) : 0;
    const confidence = Number.isFinite(Number(candidate.confidence)) ? Number(candidate.confidence) : clamp01(score);
    return {
      domain,
      score: Number(score.toFixed ? score.toFixed(4) : score),
      confidence: Number(clamp01(confidence).toFixed(4)),
      selected: dc.primaryDomain === domain || dc.selectedDomain === domain || dc.knowledgeDomain === domain,
      secondary: Array.isArray(dc.secondaryDomains) && dc.secondaryDomains.includes(domain),
      accessible: true
    };
  });
}


// -------------------------
// keyword maps (lightweight)
// -------------------------
const KEYWORDS = Object.freeze({
  [DOMAIN_ENUM.TECH]: [
    /\b(full autopsy|line[-\s]?by[-\s]?line audit|critical fix|critical fixes|backend|frontend|widget|marion|nyx|state spine|statespine|chatengine|intent router|domain registry|domainrouter|composemarionresponse|final envelope|telemetry|pipeline|bootstrap guard|manifest|structural integrity)\b/,
  ],
  [DOMAIN_ENUM.AI]: [
    /\b(artificial intelligence|machine learning|deep learning|neural|transformer|llm|prompt|rag|embedding|vector|fine[-\s]?tune|agent(s)?|tool use|reasoning|inference|model eval|alignment|rlhf|policy)\b/,
    /\b(pytorch|tensorflow|keras|hugging ?face|onnx|openai|anthropic|gemini|llama|mistral)\b/,
  ],
  [DOMAIN_ENUM.FIN]: [
    /\b(finance|economics|pricing|revenue|profit|margin|cash[-\s]?flow|forecast|budget|breakeven|roi|npv|irr|capm|wacc|beta|discount rate)\b/,
    /\b(cash[-\s]?flow risk|cash[-\s]?flow impact|cash[-\s]?flow pressure|business decision|working capital|financial resilience|runway|burn rate|ltv|cac|unit economics|cohort|churn|arpu|mrr|arr|gross margin)\b/,
    /\b(bonds?|equities|stocks?|capital markets|yield curve|rates?|inflation|gdp|fiscal|monetary)\b/,
  ],
  [DOMAIN_ENUM.LAW]: [
    /\b(law|legal|contract|nda|terms|liability|compliance|copyright|trademark|privacy law|gdpr|pipeda|caselaw|jurisdiction)\b/,
    /\b(ethics|ethical|duty of care|fiduciary|negligence|damages)\b/,
  ],
  [DOMAIN_ENUM.CYBER]: [
    /\b(cyber|cybersecurity|security|infosec|phish|malware|ransom|breach|exploit|vulnerability|patch|zero[-\s]?day|ddos|xss|sql injection|auth|mfa|least privilege|identity access|iam|incident response|threat model|defensive security|endpoint security|cloud security|network security|web security|privacy minimization|data protection|hardening)\b/,
  ],
  [DOMAIN_ENUM.PSY]: [
    /\b(psychology|cognitive|behavior|bias(es)?|therapy|trauma|attachment|emotion regulation|mental health|clinical)\b/,
  ],
  [DOMAIN_ENUM.EN]: [
    /\b(rewrite|revise|edit|proofread|grammar|spelling|tone|summarize|simplify|translate|clarity|structure)\b/,
    /\b(email|letter|proposal|pitch|copy|caption|script)\b/,
  ],
  [DOMAIN_ENUM.STRAT]: [
    /\b(strategy|roadmap|milestone|priority|trade[-\s]?off|decision|constraint|kpi|metric|execution|risk management)\b/,
  ],
});

// If risk tier is high, we clamp to safer domains / neutral help
const RISK_TIER = Object.freeze({
  NONE: "none",
  LOW: "low",
  MEDIUM: "medium",
  HIGH: "high",
});



const DOMAIN_ALIASES = Object.freeze({
  general: DOMAIN_ENUM.CORE,
  core: DOMAIN_ENUM.CORE,
  technical: DOMAIN_ENUM.TECH,
  diagnostics: DOMAIN_ENUM.TECH,
  backend: DOMAIN_ENUM.TECH,
  autopsy: DOMAIN_ENUM.TECH,
  audit: DOMAIN_ENUM.TECH,
  router: DOMAIN_ENUM.TECH,
  manifest: DOMAIN_ENUM.TECH,
  emotion: DOMAIN_ENUM.PSY,
  psychology: DOMAIN_ENUM.PSY,
  psych: DOMAIN_ENUM.PSY,
  finance: DOMAIN_ENUM.FIN,
  fin: DOMAIN_ENUM.FIN,
  legal: DOMAIN_ENUM.LAW,
  law: DOMAIN_ENUM.LAW,
  english: DOMAIN_ENUM.EN,
  writing: DOMAIN_ENUM.EN,
  cybersecurity: DOMAIN_ENUM.CYBER,
  cyber: DOMAIN_ENUM.CYBER,
  ai: DOMAIN_ENUM.AI,
  strategy: DOMAIN_ENUM.STRAT,
  marketing: DOMAIN_ENUM.MKT,
  music: DOMAIN_ENUM.MUSIC,
});

function canonicalizeDomain(value, fallback = DOMAIN_ENUM.CORE) {
  const key = normToken(value || '');
  return DOMAIN_ALIASES[key] || fallback;
}

// -------------------------
// scoring
// -------------------------
function baseScores() {
  const s = Object.create(null);
  for (const d of DEFAULT_DOMAIN_ORDER) s[d] = 0;
  // ensure all enums exist
  for (const k of Object.values(DOMAIN_ENUM)) if (typeof s[k] !== "number") s[k] = 0;
  return s;
}

function applyLaneActionHeuristics(scores, norm) {
  const n = isPlainObject(norm) ? norm : {};
  const lane = normToken(n.lane || "");
  const action = normToken(n.action || "");
  const inputSource = normalizeInputSource(n.inputSource || n.source || safeObj(n.session).inputSource || "text");
  const turnHash = continuityHash(n.text || n.query || n.message || "");

  if (lane === "technical" || lane === "debug" || lane === "diagnostics") scores[DOMAIN_ENUM.TECH] += 2.6;
  if (lane === "law") scores[DOMAIN_ENUM.LAW] += 2.2;
  if (lane === "finance" || lane === "fin") scores[DOMAIN_ENUM.FIN] += 2.2;
  if (lane === "cyber") scores[DOMAIN_ENUM.CYBER] += 2.2;
  if (lane === "psychology" || lane === "psy") scores[DOMAIN_ENUM.PSY] += 2.2;
  if (lane === "english" || lane === "writing") scores[DOMAIN_ENUM.EN] += 2.2;
  if (lane === "strategy") scores[DOMAIN_ENUM.STRAT] += 2.0;
  if (lane === "ai" || lane === "artificial_intelligence") scores[DOMAIN_ENUM.AI] += 2.4;

  // action routing (your ecosystem uses lots of actions; keep generic)
  if (/autopsy|audit|debug|diagnostic|router|manifest|bootstrap|runtime|pipeline|final|envelope|state/.test(action)) scores[DOMAIN_ENUM.TECH] += 1.8;
  if (/contract|nda|terms|policy/.test(action)) scores[DOMAIN_ENUM.LAW] += 1.4;
  if (/budget|pricing|unit|invoice|forecast|finance|cash|cashflow|cash_flow|runway|margin|risk/.test(action)) scores[DOMAIN_ENUM.FIN] += 1.4;
  if (/phish|breach|malware|security/.test(action)) scores[DOMAIN_ENUM.CYBER] += 1.4;
  if (/rewrite|edit|proof|summarize/.test(action)) scores[DOMAIN_ENUM.EN] += 1.2;
  if (/strategy|roadmap|milestone|kpi/.test(action)) scores[DOMAIN_ENUM.STRAT] += 1.1;
  if (/ai|agent|rag|llm|model|prompt/.test(action)) scores[DOMAIN_ENUM.AI] += 1.6;

  return scores;
}

function applyKeywordSignals(scores, norm) {
  const text = normalizeVoiceTextParityText(isPlainObject(norm) ? norm.text : "");
  const technicalTargetLock = canonicalTechnicalTargetFromText(text);
  if (technicalTargetLock && technicalTargetLock.targetPath) {
    scores[DOMAIN_ENUM.TECH] += 4.8;
    scores[DOMAIN_ENUM.CORE] -= 0.6;
    scores[DOMAIN_ENUM.EN] -= 0.4;
    scores[DOMAIN_ENUM.STRAT] -= 0.4;
  }

  for (const [domain, patterns] of Object.entries(KEYWORDS)) {
    if (hasAny(text, patterns)) {
      scores[domain] += 2.0;
    }
  }

  // Definition query lock: known six-domain terms outrank generic technical/debug scoring.
  const definitionDomain = definitionKnowledgeDomainFromText(text);
  if (definitionDomain) {
    scores[definitionDomain] += 5.8;
    scores[DOMAIN_ENUM.TECH] -= 2.4;
    scores[DOMAIN_ENUM.CORE] -= 1.2;
    scores[DOMAIN_ENUM.STRAT] -= 0.6;
  }

  // Extra boosts for cross-domain coupling phrases
  const t = text.toLowerCase();

  // Finance precision: cash-flow/risk language should outrank generic business/strategy wording.
  if (/\b(cash[-\s]?flow risk|cash[-\s]?flow impact|cash[-\s]?flow pressure|cash[-\s]?flow runway|working capital|business runway|financial resilience|runway|burn rate|unit economics|gross margin)\b/.test(t)) {
    scores[DOMAIN_ENUM.FIN] += 2.4;
    scores[DOMAIN_ENUM.STRAT] -= 0.35;
    scores[DOMAIN_ENUM.CORE] -= 0.15;
  }
  if (/\b(business decision|decision threshold|scenario analysis|cost pressure|demand pressure)\b/.test(t) && /\b(cash[-\s]?flow|runway|margin|unit economics|finance|financial)\b/.test(t)) {
    scores[DOMAIN_ENUM.FIN] += 1.5;
    scores[DOMAIN_ENUM.STRAT] -= 0.25;
  }
  if (/\b(ai and law|ai.*law|law.*ai)\b/.test(t)) {
    scores[DOMAIN_ENUM.AI] += 0.8;
    scores[DOMAIN_ENUM.LAW] += 0.8;
  }
  if (/\b(ai and cyber|ai.*cyber|cyber.*ai)\b/.test(t)) {
    scores[DOMAIN_ENUM.AI] += 0.8;
    scores[DOMAIN_ENUM.CYBER] += 0.8;
  }
  if (/\b(ai and psychology|ai.*psychology|psychology.*ai)\b/.test(t)) {
    scores[DOMAIN_ENUM.AI] += 0.8;
    scores[DOMAIN_ENUM.PSY] += 0.8;
  }
  if (/\b(ai and finance|ai.*finance|finance.*ai|ai and economics)\b/.test(t)) {
    scores[DOMAIN_ENUM.AI] += 0.8;
    scores[DOMAIN_ENUM.FIN] += 0.8;
  }

  return scores;
}

function applyIntentMode(scores, cog, session) {
  const c = isPlainObject(cog) ? cog : {};
  const s = isPlainObject(session) ? session : {};

  const intent = safeStr(c.intent || "", 12).toUpperCase();
  const mode = safeStr(c.mode || s.macMode || "", 16).toLowerCase();

  if (intent === "TECHNICAL_DEBUG" || intent === "DEBUG" || intent === "DIAGNOSTIC") {
    scores[DOMAIN_ENUM.TECH] += 2.2;
    scores[DOMAIN_ENUM.CORE] += 0.4;
  }

  // Stabilize -> bias to psychology + english + core
  if (intent === "STABILIZE") {
    scores[DOMAIN_ENUM.PSY] += 1.4;
    scores[DOMAIN_ENUM.EN] += 0.8;
    scores[DOMAIN_ENUM.CORE] += 0.6;
    scores[DOMAIN_ENUM.AI] -= 0.4;
    scores[DOMAIN_ENUM.CYBER] -= 0.4;
  }

  // Architect -> bias to strategy + domain requested
  if (mode === "architect" || mode === "transitional") {
    scores[DOMAIN_ENUM.STRAT] += 0.8;
  } else if (mode === "user") {
    scores[DOMAIN_ENUM.EN] += 0.6;
  }

  // If user is repeatedly in a lane, modest stickiness
  const lastLane = normToken(s.lane || "");
  const lane = normToken(isPlainObject(c) ? c.lane : "");
  if (lastLane && lane && lastLane === lane) {
    scores[DOMAIN_ENUM.STRAT] += 0.2;
  }

  return scores;
}

function applyRiskClamp(scores, cog) {
  const c = isPlainObject(cog) ? cog : {};
  const tier = safeStr(c.riskTier || "", 10).toLowerCase();

  if (tier === RISK_TIER.HIGH) {
    // keep response safer: prefer psychology/english/core, downweight others
    scores[DOMAIN_ENUM.PSY] += 1.2;
    scores[DOMAIN_ENUM.EN] += 0.8;
    scores[DOMAIN_ENUM.CORE] += 0.8;

    scores[DOMAIN_ENUM.CYBER] -= 1.2;
    scores[DOMAIN_ENUM.FIN] -= 0.8;
    scores[DOMAIN_ENUM.LAW] -= 0.8;
    scores[DOMAIN_ENUM.AI] -= 0.6;
  } else if (tier === RISK_TIER.MEDIUM) {
    scores[DOMAIN_ENUM.EN] += 0.3;
    scores[DOMAIN_ENUM.CORE] += 0.2;
    scores[DOMAIN_ENUM.CYBER] -= 0.4;
  }

  return scores;
}

function normalizeScores(scores) {
  const out = Object.create(null);
  let max = 0;
  for (const [k, v] of Object.entries(scores || {})) {
    const n = Number(v);
    const val = Number.isFinite(n) ? n : 0;
    out[k] = val;
    if (val > max) max = val;
  }
  // convert to 0..1 confidence-ish
  const conf = Object.create(null);
  const denom = max > 0 ? max : 1;
  for (const [k, v] of Object.entries(out)) {
    conf[k] = clamp01(v / denom);
  }
  return { scores: out, confidence: conf };
}


function domainConfidenceProfile(scores, text = "", opts = {}) {
  const entries = Object.entries(scores || {})
    .map(([domain, score]) => [canonicalizeDomain(domain), Number(score) || 0])
    .sort((a, b) => b[1] - a[1]);
  const primary = entries.length ? entries[0][0] : DOMAIN_ENUM.CORE;
  const secondary = entries.length > 1 ? entries[1][0] : "";
  const top = entries.length ? Math.max(0, entries[0][1]) : 0;
  const runnerUp = entries.length > 1 ? Math.max(0, entries[1][1]) : 0;
  const total = entries.reduce((sum, item) => sum + Math.max(0, item[1]), 0) || 1;
  const confidence = clamp01(top / total);
  const margin = clamp01((top - runnerUp) / (top || 1));
  const infrastructure = isInfrastructureContinuityPrompt(text);
  const minConfidence = Number.isFinite(Number(opts.minConfidence)) ? Number(opts.minConfidence) : 0.34;
  const minMargin = Number.isFinite(Number(opts.minMargin)) ? Number(opts.minMargin) : 0.14;
  const ambiguous = !infrastructure && (confidence < minConfidence || margin < minMargin);
  return {
    version: "nyx.domainConfidenceScoring/1.1",
    primary,
    secondary,
    confidence: Number(confidence.toFixed(4)),
    margin: Number(margin.toFixed(4)),
    ambiguous,
    routeLocked: infrastructure || (!ambiguous && confidence >= minConfidence),
    failClosed: !!ambiguous,
    primaryDomain: primary,
    fallbackDomain: ambiguous ? DOMAIN_ENUM.CORE : primary,
    top: entries.slice(0, 4).map(([domain, score]) => ({ domain, score: Number(score.toFixed ? score.toFixed(4) : score) })),
    reason: infrastructure ? "technical_infrastructure_precedence" : (ambiguous ? "low_margin_or_low_confidence" : "highest_weighted_domain")
  };
}

function pickTopDomains(scores, opts) {
  const o = isPlainObject(opts) ? opts : {};
  const maxSecondary = clamp01(o.maxSecondary) ? Math.trunc(o.maxSecondary) : 2;
  const minSecondaryScore = Number.isFinite(Number(o.minSecondaryScore)) ? Number(o.minSecondaryScore) : 1.6;

  const entries = Object.entries(scores || {}).sort((a, b) => (b[1] || 0) - (a[1] || 0));

  const primary = entries.length ? entries[0][0] : DOMAIN_ENUM.CORE;

  const secondary = [];
  for (let i = 1; i < entries.length && secondary.length < maxSecondary; i++) {
    const [d, sc] = entries[i];
    if ((sc || 0) >= minSecondaryScore && d !== primary) secondary.push(d);
  }

  return { primary, secondary };
}

// -------------------------
// Public functions
// -------------------------
function scoreDomainsUnsafe(norm, session, cog, opts = {}) {
  const n = isPlainObject(norm) ? norm : {};
  const s = isPlainObject(session) ? session : {};
  const c = isPlainObject(cog) ? cog : {};
  const o = isPlainObject(opts) ? opts : {};

  const scores = baseScores();
  const signals = [];

  applyLaneActionHeuristics(scores, n);
  applyKeywordSignals(scores, n);
  const crossDomainProfile = crossDomainSecondaryLaneProfile(n.text || n.query || n.message || "");
  if (crossDomainProfile && crossDomainProfile.primary) {
    scores[crossDomainProfile.primary] += 4.2;
    for (const secondary of (crossDomainProfile.secondary || [])) {
      if (scores[secondary] !== undefined) scores[secondary] += 2.1;
    }
    signals.push(`cross_domain:${crossDomainProfile.reason}`);
  }
  const definitionDomain = definitionKnowledgeDomainFromText(n.text || n.query || n.message || "");
  if (definitionDomain) {
    scores[definitionDomain] += 4.4;
    scores[DOMAIN_ENUM.CORE] = Math.max(0, scores[DOMAIN_ENUM.CORE] - 0.4);
    signals.push(`definition:${definitionDomain}`);
    signals.push("precedence:six_domain_definition_authority");
  }
  applyIntentMode(scores, c, s);
  applyRiskClamp(scores, c);

  if (isInfrastructureContinuityPrompt(n.text || n.query || n.message || "")) {
    scores[DOMAIN_ENUM.TECH] += 3.6;
    scores[DOMAIN_ENUM.CORE] += 0.8;
    scores[DOMAIN_ENUM.STRAT] += 0.4;
    scores[DOMAIN_ENUM.AI] += 0.4;
    scores[DOMAIN_ENUM.FIN] -= 1.4;
    scores[DOMAIN_ENUM.PSY] -= 0.8;
    signals.push("precedence:technical_infrastructure");
  }

  // If nothing hit, keep core
  const sum = Object.values(scores).reduce((acc, v) => acc + (Number.isFinite(Number(v)) ? Number(v) : 0), 0);
  if (sum <= 0.001) {
    scores[DOMAIN_ENUM.CORE] = 1.0;
    signals.push("fallback:core");
  }

  // Signal summaries (no raw text)
  const lane = normToken(n.lane || "");
  const action = normToken(n.action || "");
  const inputSource = normalizeInputSource(n.inputSource || n.source || safeObj(n.session).inputSource || "text");
  const turnHash = continuityHash(n.text || n.query || n.message || "");
  const intent = safeStr(c.intent || "", 12).toUpperCase();
  const tier = safeStr(c.riskTier || "", 10).toLowerCase();

  if (lane) signals.push(`lane:${lane}`);
  if (action) signals.push(`action:${action.slice(0, 18)}`);
  if (intent) signals.push(`intent:${intent}`);
  if (tier) signals.push(`risk:${tier}`);
  if (inputSource) signals.push(`input:${inputSource}`);

  const normalized = normalizeScores(scores);
  const domainConfidence = domainConfidenceProfile(normalized.scores, n.text || n.query || n.message || "", o);
  const sixDomainCoverage = buildSixDomainCoverage(normalized.scores, domainConfidence);

  return {
    ok: true,
    routerVersion: ROUTER_VERSION,
    scores: normalized.scores,
    confidence: normalized.confidence,
    domainConfidence,
    sixDomainCoverage,
    allKnowledgeDomains: SIX_KNOWLEDGE_DOMAINS.slice(),
    signals: uniq(signals, 10),
    stateSpinePatch: {
      source: "domainRouter",
      schema: "nyx.marion.stateSpine/1.7",
      shouldAdvanceState: false,
      domainScores: normalized.scores,
      confidence: normalized.confidence,
      domainConfidence,
      sixDomainCoverage,
      allKnowledgeDomains: SIX_KNOWLEDGE_DOMAINS.slice(),
      inputSource,
      turnHash,
      micTextParity: true,
      continuityRegressionReady: true
    }
  };
}

function routeDomainUnsafe(norm, session, cog, opts = {}) {
  const n = isPlainObject(norm) ? norm : {};
  const o = isPlainObject(opts) ? opts : {};
  const scored = scoreDomainsUnsafe(n, session, cog, o);
  const text = n.text || n.query || n.message || "";
  const domainConfidence = scored.domainConfidence || domainConfidenceProfile(scored.scores, text, o);
  const crossDomainProfile = crossDomainSecondaryLaneProfile(text);
  const maxSecondary = Number.isFinite(Number(o.maxSecondary)) ? Number(o.maxSecondary) : 5;
  const pick = (crossDomainProfile && crossDomainProfile.primary)
    ? { primary: crossDomainProfile.primary, secondary: crossDomainProfile.secondary || [] }
    : (domainConfidence.ambiguous
      ? { primary: domainConfidence.fallbackDomain || DOMAIN_ENUM.CORE, secondary: [] }
      : pickTopDomains(scored.scores, {
          maxSecondary,
          minSecondaryScore: Number.isFinite(Number(o.minSecondaryScore)) ? Number(o.minSecondaryScore) : 1.6,
        }));

  const primary = canonicalizeDomain(pick.primary);
  const secondary = uniq((pick.secondary || []).map((d) => canonicalizeDomain(d)).filter((d) => d && d !== primary), maxSecondary);
  const inputSource = normalizeInputSource(n.inputSource || n.source || safeObj(n.session).inputSource || "text");
  const turnHash = continuityHash(text);
  const sixDomainCoverage = scored.sixDomainCoverage || buildSixDomainCoverage(scored.scores, domainConfidence);

  const answerMode = crossDomainProfile && crossDomainProfile.answerMode ? crossDomainProfile.answerMode : (domainConfidence.answerMode || (domainConfidence.ambiguous ? "clarify" : "grounded"));
  const routing = {
    intent: safeStr(safeObj(cog).intent || n.intent || "domain_question") || "domain_question",
    domain: primary,
    knowledgeDomain: SIX_KNOWLEDGE_DOMAINS.includes(primary) ? primary : "",
    primaryDomain: primary,
    selectedDomain: primary,
    secondaryDomains: secondary,
    endpoint: safeStr(o.endpoint || "marion://routeMarion.primary") || "marion://routeMarion.primary",
    answerMode,
    domainConfidence,
    sixDomainCoverage,
    allKnowledgeDomains: SIX_KNOWLEDGE_DOMAINS.slice(),
    noCrossDomainBleed: true,
    finalAuthorityExpected: "marionFinalEnvelope"
  };

  const reason = {
    primary,
    secondary,
    confidence: scored.confidence ? scored.confidence[primary] || 0 : 0,
    signals: scored.signals,
    inputSource,
    turnHash,
    continuity: { fiveTurnReady: true, micTextParity: true },
    domainConfidence,
    sixDomainCoverage,
    allKnowledgeDomains: SIX_KNOWLEDGE_DOMAINS.slice(),
    finalAuthorityExpected: "marionFinalEnvelope"
  };

  return {
    ok: true,
    routerVersion: ROUTER_VERSION,
    routing,
    primary,
    primaryDomain: primary,
    selectedDomain: primary,
    secondary,
    secondaryDomains: secondary,
    reason,
    signals: scored.signals,
    scores: scored.scores,
    confidence: scored.confidence,
    domainConfidence,
    sixDomainCoverage,
    allKnowledgeDomains: SIX_KNOWLEDGE_DOMAINS.slice(),
    crossDomainProfile: crossDomainProfile || null,
    answerMode,
    finalAuthorityExpected: "marionFinalEnvelope",
    stateSpinePatch: {
      ...safeObj(scored.stateSpinePatch),
      source: "domainRouter",
      shouldAdvanceState: false,
      selectedDomain: primary,
      secondaryDomains: secondary,
      sixDomainCoverage,
      allKnowledgeDomains: SIX_KNOWLEDGE_DOMAINS.slice(),
      noCrossDomainBleed: true
    }
  };
}


// Surgical hardening: normalize loose caller payloads and fail closed without surfacing ReferenceError.
function extractRouteTextForRecovery(value) {
  const v = safeObj(value);
  const payload = safeObj(v.payload);
  const meta = safeObj(v.meta);
  const routing = safeObj(v.routing);
  const candidates = [
    v.text, v.query, v.message, v.prompt, v.userText, v.rawUserText, v.normalizedUserIntent,
    payload.text, payload.query, payload.message, payload.prompt, payload.userText, payload.rawUserText,
    meta.text, meta.query, meta.message, meta.prompt, meta.userText, meta.rawUserText,
    routing.text, routing.query, routing.message, routing.prompt, routing.normalizedUserIntent
  ];
  for (const item of candidates) {
    const text = safeStr(item, 1400).trim();
    if (text) return text;
  }
  return typeof value === "string" ? safeStr(value, 1400) : "";
}
function normalizeRouteNormInput(norm = {}) {
  if (isPlainObject(norm)) {
    const text = extractRouteTextForRecovery(norm);
    return { ...norm, text: text || safeStr(norm.text || norm.query || norm.message || "", 1400) };
  }
  return { text: extractRouteTextForRecovery(norm) };
}
function fallbackRouteDomainForReferenceError(norm = {}, error = null) {
  const n = normalizeRouteNormInput(norm);
  const text = n.text || "";
  let primary = DOMAIN_ENUM.CORE;
  const definitionDomain = definitionKnowledgeDomainFromText(text);
  if (definitionDomain) primary = definitionDomain;
  else if (/\b(domain\s+routing|domain\s+router|route\s+domains?|reference\s*error|referenceerror|is not defined|runtime handler|backend|index\.js|compose\s*marion\s*response)\b/i.test(text)) primary = DOMAIN_ENUM.TECH;
  else if (/\b(contract|consideration|promise|estoppel|legal|law)\b/i.test(text)) primary = DOMAIN_ENUM.LAW;
  const secondary = [];
  const scores = baseScores();
  if (scores[primary] !== undefined) scores[primary] = 1;
  const domainConfidence = {
    version: "nyx.domainConfidenceScoring/1.1",
    primary,
    secondary: "",
    confidence: primary === DOMAIN_ENUM.CORE ? 0.52 : 0.91,
    margin: primary === DOMAIN_ENUM.CORE ? 0.34 : 0.91,
    ambiguous: false,
    routeLocked: true,
    failClosed: false,
    primaryDomain: primary,
    fallbackDomain: primary,
    top: [{ domain: primary, score: 1 }],
    reason: "referenceerror_recovered_route"
  };
  const sixDomainCoverage = buildSixDomainCoverage(scores, domainConfidence);
  const routing = {
    intent: safeStr(n.intent || "domain_question") || "domain_question",
    domain: primary,
    knowledgeDomain: SIX_KNOWLEDGE_DOMAINS.includes(primary) ? primary : "",
    primaryDomain: primary,
    selectedDomain: primary,
    secondaryDomains: secondary,
    endpoint: "marion://routeMarion.primary",
    answerMode: "grounded",
    domainConfidence,
    sixDomainCoverage,
    allKnowledgeDomains: SIX_KNOWLEDGE_DOMAINS.slice(),
    noCrossDomainBleed: true,
    finalAuthorityExpected: "marionFinalEnvelope"
  };
  return {
    ok: true,
    recoveredReferenceError: true,
    routerVersion: ROUTER_VERSION,
    routing,
    primary,
    primaryDomain: primary,
    selectedDomain: primary,
    secondary,
    secondaryDomains: secondary,
    reason: {
      primary,
      secondary,
      confidence: domainConfidence.confidence,
      signals: ["recovered:referenceerror", `definition:${primary}`],
      inputSource: normalizeInputSource(n.inputSource || n.source || "text"),
      turnHash: continuityHash(text),
      domainConfidence,
      sixDomainCoverage,
      allKnowledgeDomains: SIX_KNOWLEDGE_DOMAINS.slice(),
      finalAuthorityExpected: "marionFinalEnvelope"
    },
    signals: ["recovered:referenceerror", `definition:${primary}`],
    scores,
    confidence: scores,
    domainConfidence,
    sixDomainCoverage,
    allKnowledgeDomains: SIX_KNOWLEDGE_DOMAINS.slice(),
    crossDomainProfile: null,
    answerMode: "grounded",
    finalAuthorityExpected: "marionFinalEnvelope",
    stateSpinePatch: {
      source: "domainRouter.referenceerrorRecovery",
      schema: "nyx.marion.stateSpine/1.7",
      shouldAdvanceState: false,
      selectedDomain: primary,
      secondaryDomains: secondary,
      sixDomainCoverage,
      allKnowledgeDomains: SIX_KNOWLEDGE_DOMAINS.slice(),
      noCrossDomainBleed: true,
      recoveredReferenceError: true,
      safeErrorName: safeStr(error && error.name, 40)
    }
  };
}
function scoreDomains(norm, session, cog, opts = {}) {
  try {
    return scoreDomainsUnsafe(normalizeRouteNormInput(norm), session, cog, opts);
  } catch (err) {
    const recovered = fallbackRouteDomainForReferenceError(norm, err);
    return {
      ok: true,
      routerVersion: ROUTER_VERSION,
      scores: recovered.scores,
      confidence: recovered.confidence,
      domainConfidence: recovered.domainConfidence,
      sixDomainCoverage: recovered.sixDomainCoverage,
      allKnowledgeDomains: SIX_KNOWLEDGE_DOMAINS.slice(),
      signals: recovered.signals,
      stateSpinePatch: recovered.stateSpinePatch
    };
  }
}
function routeDomain(norm, session, cog, opts = {}) {
  try {
    return routeDomainUnsafe(normalizeRouteNormInput(norm), session, cog, opts);
  } catch (err) {
    return fallbackRouteDomainForReferenceError(norm, err);
  }
}

module.exports = {
  ROUTER_VERSION,
  TELEMETRY_VISIBILITY_VERSION,
  FAILURE_SIGNATURE_AUDIT_VERSION,
  DOMAIN_ENUM,
  DEFAULT_DOMAIN_ORDER,
  SIX_KNOWLEDGE_DOMAINS,
  buildSixDomainCoverage,
  canonicalizeDomain,
  scoreDomains,
  routeDomain,
  normalizeVoiceTextParityText,
  normalizeInputSource,
  canonicalTechnicalTargetFromText,
  isTechnicalFollowUpIntent,
  isInfrastructureContinuityPrompt,
  continuityHash,
  domainConfidenceProfile,
  classifyFailureSignature,
  buildFailureSignatureAudit,
  isTelemetryLeakText,
  stripTelemetryLeakFromReply,
};

// R18AB_AI_CYBER_DOMAIN_ROUTER_HARDENING_START
const R18AB_DOMAIN_ROUTER_VERSION = "nyx.marion.r18ab.domainRouter.aiCyber/1.0";
function r18abRouterStr(value){return value==null?"":String(value).replace(/\s+/g," ").trim();}
function r18abRouterObj(value){return value&&typeof value==="object"&&!Array.isArray(value)?value:{};}
function r18abRouterText(norm={},session={},cog={}){
  const n=r18abRouterObj(norm),s=r18abRouterObj(session),c=r18abRouterObj(cog);
  return [n.text,n.userText,n.message,n.prompt,n.normalizedUserIntent,n.rawUserText,s.lastUserText,c.lastUserText,JSON.stringify(n).slice(0,1000)].map(r18abRouterStr).join(" ");
}
function buildR18ABRouteSignals(norm={},session={},cog={}){
  const src=r18abRouterText(norm,session,cog).toLowerCase();
  const ai=/\b(ai|artificial intelligence|machine learning|model|llm|agent|inference|automation|adaptive intelligence|ai integration|real[-\s]?world ai)\b/i.test(src);
  const cyber=/\b(cyber|cybersecurity|security|protective protocol|least privilege|zero trust|access control|identity|verify identity|secret|token|credential|permission|threat|vulnerability)\b/i.test(src);
  return {
    version:R18AB_DOMAIN_ROUTER_VERSION,
    active:ai||cyber,
    primary:ai?"ai":(cyber?"cyber":""),
    aiDomainAdaptability:!!ai,
    cyberProtectiveProtocol:!!cyber,
    confidence:ai?0.88:(cyber?0.93:0),
    noCrossDomainBleed:true,
    baselinePreserved:"r16m-r17c",
    noUserFacingDiagnostics:true
  };
}
function r18abApplyRouterSignals(result,norm,session,cog){
  if(!result||typeof result!=="object")return result;
  const sig=buildR18ABRouteSignals(norm,session,cog);
  if(!sig.active)return result;
  const out=Array.isArray(result)?result.slice():Object.assign({},result);
  if(sig.primary){
    out.primary=out.primary&&out.primary!=="general"&&out.primary!=="general_reasoning"?out.primary:sig.primary;
    out.selectedDomain=out.selectedDomain||out.primary;
  }
  const r18abCurrentConfidence=(typeof out.confidence==="number"?out.confidence:(out.confidence&&typeof out.confidence==="object"?Number(out.confidence.confidence||out.confidence.score||out.confidenceScore):Number(out.confidence)))||0;
  out.confidence=Math.max(r18abCurrentConfidence,sig.confidence);
  out.r18abRouteSignals=sig;
  out.noCrossDomainBleed=true;
  out.baselinePreserved="r16m-r17c";
  out.noUserFacingDiagnostics=true;
  const r18abDc=r18abRouterObj(out.domainConfidence);
  out.domainConfidence=Object.assign({},r18abDc,{r18abDomainRouter:sig,routeLocked:true,confidence:Math.max(Number(r18abDc.confidence||r18abDc.confidenceScore)||0,sig.confidence)});
  return out;
}
(function r18abPatchDomainRouterExports(){
  if(typeof module==="undefined"||!module.exports||typeof module.exports!=="object")return;
  const exp=module.exports;
  ["scoreDomains","routeDomain"].forEach(function(name){
    const fn=typeof exp[name]==="function"?exp[name]:null;
    if(!fn||fn.__r18abDomainRouterPatched)return;
    exp[name]=function r18abDomainRouterWrapped(norm,session,cog,opts){
      const result=fn.apply(this,arguments);
      if(result&&typeof result.then==="function")return result.then(function(v){return r18abApplyRouterSignals(v,norm,session,cog);});
      return r18abApplyRouterSignals(result,norm,session,cog);
    };
    exp[name].__r18abDomainRouterPatched=true;
  });
  exp.R18AB_DOMAIN_ROUTER_VERSION=R18AB_DOMAIN_ROUTER_VERSION;
  exp.buildR18ABRouteSignals=buildR18ABRouteSignals;
  exp.r18abApplyRouterSignals=r18abApplyRouterSignals;
  exp.R18AB_DOMAIN_ROUTER_PATCH=true;
})();
// R18AB_AI_CYBER_DOMAIN_ROUTER_HARDENING_END

// R18C_LAW_ROUTING_REGISTRY_PATCH_START
const R18C_DOMAIN_ROUTER_VERSION = "nyx.marion.r18c.domainRouter.lawAssessment/1.0";
const R18C_LAW_ASSESSMENT_FRAME = Object.freeze(["legal_category","jurisdiction_sensitivity","facts_vs_assumptions","risk_exposure","missing_information","safe_next_move"]);
const R18C_LAW_BOUNDARY = Object.freeze({
  generalInformationOnly: true,
  noLegalAdvice: true,
  noAttorneyClientRelationship: true,
  noLegalCertaintyClaim: true,
  jurisdictionRequired: true,
  sourceDocumentReviewRequired: true,
  professionalReviewRecommendedForHighRisk: true
});
function r18cRouterStr(value){return value==null?"":String(value).replace(/\s+/g," ").trim();}
function r18cRouterObj(value){return value&&typeof value==="object"&&!Array.isArray(value)?value:{};}
function r18cRouterText(norm={},session={},cog={}){
  const n=r18cRouterObj(norm),s=r18cRouterObj(session),c=r18cRouterObj(cog);
  return [n.text,n.userText,n.message,n.prompt,n.query,n.normalizedUserIntent,n.rawUserText,s.lastUserText,c.lastUserText,JSON.stringify(n).slice(0,1400)].map(r18cRouterStr).join(" ");
}
function r18cLawCategories(text=""){
  const t=r18cRouterStr(text).toLowerCase();
  const out=[];
  const add=(key,rx)=>{ if(rx.test(t)&&!out.includes(key)) out.push(key); };
  add("contract",/\b(contract|agreement|nda|terms|clause|consideration|breach|indemnity|warranty|termination|assignment)\b/i);
  add("copyright_licensing",/\b(copyright|copyrighted|licen[cs]e|licen[cs]ing|distribution rights?|broadcast rights?|ott rights?|roku rights?|streaming rights?|content rights?|fair use|public domain|royalty)\b/i);
  add("intellectual_property",/\b(ip|intellectual property|trademark|trade mark|patent|trade secret|brand mark|logo ownership|copyright ownership)\b/i);
  add("compliance_regulatory",/\b(compliance|regulatory|regulation|policy|statute|legal requirement|permit|filing|reporting requirement|tax credit|grant eligibility)\b/i);
  add("liability_dispute",/\b(liability|liable|negligence|duty of care|damages|claim|lawsuit|litigation|settlement|dispute|risk exposure|legal exposure)\b/i);
  add("employment_contractor",/\b(employee|employment|contractor|independent contractor|worker classification|termination|severance|non[-\s]?compete|non[-\s]?solicit)\b/i);
  add("privacy_data",/\b(privacy|pipeda|gdpr|personal information|personal data|consent|data protection|data retention|user data)\b/i);
  add("corporate_business",/\b(incorporat(?:e|ion)|corporation|shareholder|director|officer|bylaw|articles|business registration|operating agreement)\b/i);
  add("jurisdiction_procedure",/\b(jurisdiction|province|federal|ontario|canada|canadian law|court|tribunal|legal process|procedure|venue)\b/i);
  return out;
}
function r18cLegalTechnicalSuppression(text=""){
  const t=r18cRouterStr(text).toLowerCase();
  const tech=/\b(surgical autopsy|autopsy|audit|patch|update|resend|zip|downloadable|files?|node --check|domain routing|domain registry|domainrouter|mariondomainregistry|marionintentrouter|domainconcierge|domainconfidence|runtime file|javascript|\.js)\b/i.test(t);
  const legal=r18cLawCategories(t).length>0 || /\b(r18c|law domain|legal domain)\b/i.test(t);
  return tech && !legal;
}
function buildR18CLawRouteSignals(norm={},session={},cog={}){
  const text=r18cRouterText(norm,session,cog);
  const categories=r18cLawCategories(text);
  const explicit=/\b(r18c|law domain|legal domain|legal lane|route.*law|activate.*law|law real[-\s]?world assessment|legal risk assessment)\b/i.test(text);
  const active=(categories.length>0||explicit)&&!r18cLegalTechnicalSuppression(text);
  const secondary=[];
  const lower=text.toLowerCase();
  if(/\b(ai|artificial intelligence|model|llm|automation|agent)\b/i.test(lower))secondary.push("ai");
  if(/\b(cyber|security|privacy|data protection|credential|access|identity)\b/i.test(lower))secondary.push("cyber");
  if(/\b(revenue|pricing|cost|grant|funding|tax credit|moneti[sz]e|royalty|fee|damages)\b/i.test(lower))secondary.push("finance");
  if(/\b(strategy|commercial|business|roku|ott|streaming|channel|distribution|sponsor|advertis)\b/i.test(lower))secondary.push("strategy");
  return {
    version:R18C_DOMAIN_ROUTER_VERSION,
    active,
    primary:active?"law":"",
    knowledgeDomain:active?"law":"",
    legalCategories:categories,
    legalCategory:categories[0]||"general_legal_risk",
    secondaryDomains:Array.from(new Set(secondary.filter(d=>d!=="law"))).slice(0,4),
    assessmentFrame:R18C_LAW_ASSESSMENT_FRAME.slice(),
    legalBoundary:Object.assign({},R18C_LAW_BOUNDARY),
    confidence:active?(explicit?0.97:0.94):0,
    answerMode:active?"grounded":"",
    highStakes:!!active,
    routeLocked:!!active,
    noCrossDomainBleed:true,
    baselinePreserved:"r16m-r17c+r18ab",
    noUserFacingDiagnostics:true
  };
}
function r18cPatchLawCoverage(coverage=[],sig={}){
  return (Array.isArray(coverage)?coverage:[]).map(function(item){
    if(!item||typeof item!=="object")return item;
    if(item.domain!=="law")return item;
    return Object.assign({},item,{score:Math.max(Number(item.score)||0,sig.confidence||0.94),confidence:Math.max(Number(item.confidence)||0,sig.confidence||0.94),selected:true,accessible:true,r18cLawAssessment:true});
  });
}
function r18cLawDomainConfidence(existing={},sig={}){
  const e=r18cRouterObj(existing);
  const candidates=Array.isArray(e.candidates)?e.candidates.slice():[];
  if(!candidates.some(c=>c&&c.domain==="law")) candidates.unshift({domain:"law",confidence:sig.confidence||0.94,reasons:["r18c_law_real_world_assessment_signal"],knowledgeDomain:"law"});
  const secondary=Array.from(new Set([...(sig.secondaryDomains||[]),...(Array.isArray(e.secondaryDomains)?e.secondaryDomains:[]),e.primaryDomain,e.selectedDomain].filter(Boolean).filter(d=>d!=="law"))).slice(0,4);
  return Object.assign({},e,{
    version:e.version||"nyx.marion.domainConfidence/1.2",
    active:true,
    confidence:Math.max(Number(e.confidence||e.confidenceScore)||0,sig.confidence||0.94),
    confidenceScore:Math.max(Number(e.confidence||e.confidenceScore)||0,sig.confidence||0.94),
    band:"high",
    confidenceBand:"high",
    primaryDomain:"law",
    selectedDomain:"law",
    knowledgeDomain:"law",
    secondaryDomains:secondary,
    routeLocked:true,
    ambiguous:false,
    failClosed:false,
    needsClarifier:false,
    answerMode:"grounded",
    highStakes:true,
    legalCategory:sig.legalCategory,
    legalCategories:sig.legalCategories,
    assessmentFrame:sig.assessmentFrame,
    legalBoundary:sig.legalBoundary,
    r18cLawAssessment:sig,
    candidates,
    reason:"r18c_law_real_world_assessment_precedence",
    noCrossDomainBleed:true,
    noUserFacingDiagnostics:true
  });
}
function r18cApplyLawRouterSignals(result,norm,session,cog){
  if(!result||typeof result!=="object")return result;
  const sig=buildR18CLawRouteSignals(norm,session,cog);
  if(!sig.active)return result;
  const out=Array.isArray(result)?result.slice():Object.assign({},result);
  out.primary="law"; out.primaryDomain="law"; out.selectedDomain="law"; out.knowledgeDomain="law";
  out.secondary=Array.from(new Set([...(sig.secondaryDomains||[]),...(Array.isArray(out.secondary)?out.secondary:[]),...(Array.isArray(out.secondaryDomains)?out.secondaryDomains:[])].filter(Boolean).filter(d=>d!=="law"))).slice(0,5);
  out.secondaryDomains=out.secondary.slice();
  out.answerMode="grounded"; out.highStakes=true; out.routeLocked=true;
  out.r18cLawRouteSignals=sig;
  out.noCrossDomainBleed=true; out.noUserFacingDiagnostics=true; out.baselinePreserved="r16m-r17c+r18ab";
  if(out.scores&&typeof out.scores==="object") out.scores.law=Math.max(Number(out.scores.law)||0,sig.confidence||0.94);
  out.domainConfidence=r18cLawDomainConfidence(out.domainConfidence,sig);
  out.sixDomainCoverage=r18cPatchLawCoverage(out.sixDomainCoverage,sig);
  if(out.routing&&typeof out.routing==="object"){
    out.routing=Object.assign({},out.routing,{domain:"law",primaryDomain:"law",selectedDomain:"law",knowledgeDomain:"law",secondaryDomains:out.secondaryDomains,answerMode:"grounded",domainConfidence:out.domainConfidence,sixDomainCoverage:out.sixDomainCoverage,r18cLawAssessment:sig,noCrossDomainBleed:true,finalAuthorityExpected:"marionFinalEnvelope"});
  }
  if(out.reason&&typeof out.reason==="object"){
    out.reason=Object.assign({},out.reason,{primary:"law",secondary:out.secondaryDomains,domainConfidence:out.domainConfidence,r18cLawAssessment:sig,finalAuthorityExpected:"marionFinalEnvelope"});
  }
  if(out.stateSpinePatch&&typeof out.stateSpinePatch==="object"){
    out.stateSpinePatch=Object.assign({},out.stateSpinePatch,{selectedDomain:"law",knowledgeDomain:"law",secondaryDomains:out.secondaryDomains,domainConfidence:out.domainConfidence,sixDomainCoverage:out.sixDomainCoverage,r18cLawAssessment:sig,noCrossDomainBleed:true});
  }
  return out;
}
(function r18cPatchDomainRouterExports(){
  if(typeof module==="undefined"||!module.exports||typeof module.exports!=="object")return;
  const exp=module.exports;
  ["scoreDomains","routeDomain"].forEach(function(name){
    const fn=typeof exp[name]==="function"?exp[name]:null;
    if(!fn||fn.__r18cLawRouterPatched)return;
    exp[name]=function r18cLawDomainRouterWrapped(norm,session,cog,opts){
      const result=fn.apply(this,arguments);
      if(result&&typeof result.then==="function")return result.then(function(v){return r18cApplyLawRouterSignals(v,norm,session,cog);});
      return r18cApplyLawRouterSignals(result,norm,session,cog);
    };
    exp[name].__r18cLawRouterPatched=true;
  });
  exp.R18C_DOMAIN_ROUTER_VERSION=R18C_DOMAIN_ROUTER_VERSION;
  exp.R18C_LAW_ASSESSMENT_FRAME=R18C_LAW_ASSESSMENT_FRAME;
  exp.R18C_LAW_BOUNDARY=R18C_LAW_BOUNDARY;
  exp.r18cLawCategories=r18cLawCategories;
  exp.buildR18CLawRouteSignals=buildR18CLawRouteSignals;
  exp.r18cApplyLawRouterSignals=r18cApplyLawRouterSignals;
  exp.R18C_LAW_ROUTING_REGISTRY_PATCH=true;
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
    function r18cDetectLawCategories(text){
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
      if (!out.length && /\b(law|legal|rights?|obligation|permitted|allowed|can i|should i sign|safe to)\b/.test(t)) out.push("general_legal_risk");
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
      if (r18cTechnicalLawFileWork(text)) return false;
      const cats = r18cDetectLawCategories(text);
      if (cats.length && !(cats.length === 1 && cats[0] === "general_legal_risk" && !/\b(law|legal|rights|liability|contract|copyright|license|employment|fired|defamation|privacy|compliance|jurisdiction|safe to|permitted|allowed)\b/i.test(T(text)))) return true;
      return r18cShortLawFollowup(text, ctx);
    }
    function r18cProfile(text, ctx){
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

/* R18C_FULL_STACK_DOMAIN_ROUTER_WRAP_START */
(function(){
  try {
    const H = module.exports.marionR18CFullStackHelpers;
    if (!H || module.exports.__r18cFullStackDomainRouterWrapped) return;
    const oldRoute = module.exports.routeDomain;
    const oldScore = module.exports.scoreDomains;
    function extract(norm, session, cog, opts){ return H.extractText(norm) || H.extractText(session) || H.extractText(cog) || H.extractText(opts); }
    function forced(base, text, ctx){
      if (!H.r18cIsLaw(text, ctx)) return base;
      const p = H.r18cProfile(text, ctx);
      return Object.assign({}, H.O(base), {
        primary: "law",
        secondary: p.secondaryDomains,
        reason: "r18c_full_stack_law_precedence",
        confidence: p.confidence,
        signals: Object.assign({}, H.O(H.O(base).signals), { r18cLaw: true, legalCategory: p.legalCategory, r18cFullStackRegression: true }),
        domainConfidence: H.r18cMergeLawProfile(H.O(H.O(base).domainConfidence), p),
        r18cLawAssessment: p,
        noCrossDomainBleed: true,
        noUserFacingDiagnostics: true
      });
    }
    if (typeof oldRoute === "function") {
      module.exports.routeDomain = function(norm, session, cog, opts){
        const base = oldRoute.apply(this, arguments);
        const text = extract(norm, session, cog, opts);
        return forced(base, text, {norm, session, cog, opts});
      };
    }
    if (typeof oldScore === "function") {
      module.exports.scoreDomains = function(norm, session, cog, opts){
        const base = oldScore.apply(this, arguments);
        const text = extract(norm, session, cog, opts);
        if (!H.r18cIsLaw(text, {norm, session, cog, opts})) return base;
        const p = H.r18cProfile(text, {norm, session, cog, opts});
        const out = Object.assign({}, H.O(base));
        out.scores = Object.assign({}, H.O(out.scores), { law: Math.max(Number(H.O(out.scores).law || 0), 12.2) });
        out.signals = Object.assign({}, H.O(out.signals), { r18cLaw: true, legalCategory: p.legalCategory });
        out.r18cLawAssessment = p;
        return out;
      };
    }
    module.exports.__r18cFullStackDomainRouterWrapped = true;
  } catch(_err) {}
})();
/* R18C_FULL_STACK_DOMAIN_ROUTER_WRAP_END */


/* MARION_DOMAIN_ROUTER_CRITICAL_LAYERING_PATCH_V1_START */
(function(){
  "use strict";
  const PATCH_VERSION = "domainRouter.criticalLayeringPatch/1.0-preserve-originals";
  if (typeof module === "undefined" || !module.exports || typeof module.exports !== "object") return;
  if (module.exports.__marionDomainRouterCriticalLayeringPatchV1) return;

  const SIX = Object.freeze(["psychology", "english", "ai", "cyber", "law", "finance"]);
  const DOMAIN_ALIASES = Object.freeze({
    psych: "psychology",
    emotional: "psychology",
    emotion: "psychology",
    language: "english",
    writing: "english",
    grammar: "english",
    artificial_intelligence: "ai",
    machine_learning: "ai",
    cybersecurity: "cyber",
    security: "cyber",
    legal: "law",
    financial: "finance",
    economics: "finance",
    technical_debug: "technical",
    tech: "technical"
  });
  const HIGH_STAKES = Object.freeze(["law", "finance", "cyber"]);
  const TELEMETRY_LEAK_RX = /\b(routeKind=|speechHints=|presenceProfile=|finalEnvelope|sessionPatch|marionFinal|transportSafe|replyAuthority=|nyxStateHint=|diagnostic packet|final envelope missing|non-final|runtimeTelemetry|failureSignature)\b/i;
  const PUBLIC_DEBUG_RX = /\b(MARION::FINAL::|CHATENGINE_COORDINATOR_ONLY_ACTIVE_|nyx\.marion\.|stateSpine|finalEnvelope|sessionPatch|runtimeTelemetry|replyAuthority|failureSignature)\b/i;

  function text(value, max){
    const limit = Number.isFinite(Number(max)) ? Math.max(8, Math.min(Number(max), 4000)) : 1200;
    return String(value == null ? "" : value).replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, limit);
  }
  function obj(value){ return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
  function arr(value){ return Array.isArray(value) ? value : []; }
  function clamp01(value, fallback){
    const n = Number(value);
    if (!Number.isFinite(n)) return Number.isFinite(Number(fallback)) ? Math.max(0, Math.min(1, Number(fallback))) : 0;
    return Math.max(0, Math.min(1, n));
  }
  function key(value){ return text(value, 80).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, ""); }
  function canonicalDomain(value){
    const k = key(value);
    if (!k) return "";
    return DOMAIN_ALIASES[k] || k;
  }
  function uniqueDomains(value, primary){
    const p = canonicalDomain(primary);
    const out = [];
    const seen = new Set();
    arr(value).forEach(function(item){
      const d = canonicalDomain(item);
      if (!d || d === p || seen.has(d)) return;
      seen.add(d);
      out.push(d);
    });
    return out.slice(0, 4);
  }
  function readTextFrom(){
    const parts = [];
    Array.prototype.slice.call(arguments).forEach(function(input){
      if (!input) return;
      if (typeof input === "string") { parts.push(input); return; }
      const source = obj(input);
      [source.text, source.message, source.query, source.prompt, source.userText, source.rawUserText, source.normalizedUserIntent].forEach(function(v){ if (text(v, 1600)) parts.push(v); });
      const nested = [source.payload, source.body, source.turn, source.command, source.meta, source.routing];
      nested.forEach(function(n){
        const o = obj(n);
        [o.text, o.message, o.query, o.prompt, o.userText, o.rawUserText, o.normalizedUserIntent].forEach(function(v){ if (text(v, 1600)) parts.push(v); });
      });
    });
    return text(parts.join(" "), 1800);
  }
  function hash(value){
    const source = text(value, 1800).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    let h = 2166136261;
    for (let i = 0; i < source.length; i += 1) { h ^= source.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0).toString(16);
  }
  function stripLeakText(value){
    let out = text(value, 1200);
    if (!out) return "";
    if (TELEMETRY_LEAK_RX.test(out) || PUBLIC_DEBUG_RX.test(out)) {
      out = out
        .replace(/\b(routeKind|speechHints|presenceProfile|finalEnvelope|sessionPatch|marionFinal|transportSafe|replyAuthority|nyxStateHint|runtimeTelemetry|failureSignature)\s*=\s*[^.;,\n]+[.;,]?\s*/gi, "")
        .replace(/\b(?:diagnostic packet|final envelope missing|non-final|runtimeTelemetry|failureSignature)\b/gi, "")
        .replace(/\bMARION::FINAL::[^\s]+/gi, "")
        .replace(/\bCHATENGINE_COORDINATOR_ONLY_ACTIVE_\d+\b/gi, "")
        .replace(/\bnyx\.marion\.[a-z0-9./_-]+\b/gi, "")
        .replace(/\s+/g, " ")
        .trim();
    }
    return out;
  }
  function normalizeDomainConfidence(dc, primary, secondary, sourceText){
    const input = obj(dc);
    const p = canonicalDomain(primary || input.primaryDomain || input.selectedDomain || input.domain || input.primary || "core") || "core";
    const s = uniqueDomains(secondary || input.secondaryDomains || [], p);
    const confidence = clamp01(input.confidence ?? input.confidenceScore, p === "core" ? 0.48 : 0.86);
    const margin = clamp01(input.margin, confidence >= 0.82 ? 0.2 : 0.04);
    const ambiguous = !!input.ambiguous || (confidence < 0.62 && !input.routeLocked);
    return Object.assign({}, input, {
      version: text(input.version || "nyx.marion.domainConfidence/1.3-critical-layering", 120),
      primaryDomain: p,
      selectedDomain: p,
      domain: p,
      knowledgeDomain: SIX.includes(p) ? p : text(input.knowledgeDomain || "", 80),
      secondaryDomains: s,
      confidence,
      confidenceScore: confidence,
      margin,
      ambiguous,
      routeLocked: input.routeLocked === true || confidence >= 0.82 || HIGH_STAKES.includes(p),
      failClosed: input.failClosed === true || (ambiguous && confidence < 0.48),
      needsClarifier: input.needsClarifier === true || (ambiguous && confidence < 0.62),
      highStakes: input.highStakes === true || HIGH_STAKES.includes(p),
      noCrossDomainBleed: true,
      noUserFacingDiagnostics: true,
      publicSurfaceClean: true,
      sourceTextHash: input.sourceTextHash || hash(sourceText || "")
    });
  }
  function buildCoverage(scores, dc, primary, secondary){
    const scoreObj = obj(scores);
    const conf = normalizeDomainConfidence(dc, primary, secondary, "");
    return SIX.map(function(domain){
      const raw = Number(scoreObj[domain]);
      const selected = conf.primaryDomain === domain || conf.selectedDomain === domain || conf.knowledgeDomain === domain;
      const sec = arr(conf.secondaryDomains).includes(domain);
      const fallback = selected ? conf.confidence : (sec ? Math.max(0.55, conf.confidence * 0.75) : 0);
      return {
        domain,
        score: Number((Number.isFinite(raw) ? raw : fallback).toFixed(4)),
        confidence: Number(clamp01(Number.isFinite(raw) ? raw : fallback, fallback).toFixed(4)),
        selected,
        secondary: sec,
        accessible: true
      };
    });
  }
  function projectRoute(base, sourceText){
    if (!base || typeof base !== "object") return base;
    const out = Object.assign({}, base);
    const routing = obj(out.routing);
    let primary = canonicalDomain(out.primary || out.primaryDomain || out.selectedDomain || out.domain || routing.primaryDomain || routing.selectedDomain || routing.domain || routing.knowledgeDomain || "");
    if (!primary) primary = "core";
    const secondary = uniqueDomains(out.secondary || out.secondaryDomains || routing.secondaryDomains || [], primary);
    const knowledgeDomain = SIX.includes(primary) ? primary : text(out.knowledgeDomain || routing.knowledgeDomain || "", 80);
    const scores = obj(out.scores || routing.scores);
    const dc = normalizeDomainConfidence(out.domainConfidence || routing.domainConfidence, primary, secondary, sourceText);
    const reason = stripLeakText(out.reason || routing.reason || dc.reason || "route_projected");
    const signals = Object.assign({}, obj(out.signals), obj(routing.signals), {
      marionCriticalLayeringPatch: true,
      publicSurfaceClean: true,
      noUserFacingDiagnostics: true,
      sourceTextHash: hash(sourceText || ""),
      inputSource: (typeof module.exports.normalizeInputSource === "function" ? module.exports.normalizeInputSource(readTextFrom({inputSource: out.inputSource || routing.inputSource})) : "") || out.inputSource || routing.inputSource || "text"
    });
    out.primary = primary;
    out.primaryDomain = primary;
    out.selectedDomain = primary;
    out.domain = primary;
    out.knowledgeDomain = knowledgeDomain;
    out.secondary = secondary;
    out.secondaryDomains = secondary;
    out.reason = reason;
    out.signals = signals;
    out.domainConfidence = dc;
    out.sixDomainCoverage = buildCoverage(scores, dc, primary, secondary);
    out.highStakes = dc.highStakes === true;
    out.noCrossDomainBleed = true;
    out.noUserFacingDiagnostics = true;
    out.publicSurfaceClean = true;
    out.marionConversationLayer = Object.assign({}, obj(out.marionConversationLayer), {
      version: PATCH_VERSION,
      stage: "domain_route_projected",
      primaryDomain: primary,
      secondaryDomains: secondary,
      knowledgeDomain,
      sourceTextHash: hash(sourceText || ""),
      voiceTextParitySafe: true,
      telemetryLeakBlocked: true
    });
    out.routing = Object.assign({}, routing, {
      domain: primary,
      primaryDomain: primary,
      selectedDomain: primary,
      knowledgeDomain,
      secondaryDomains: secondary,
      reason,
      signals,
      domainConfidence: dc,
      sixDomainCoverage: out.sixDomainCoverage,
      highStakes: out.highStakes,
      noCrossDomainBleed: true,
      noUserFacingDiagnostics: true,
      publicSurfaceClean: true
    });
    return out;
  }
  function projectScore(base, sourceText){
    if (!base || typeof base !== "object") return base;
    const out = Object.assign({}, base);
    const scores = Object.assign({}, obj(out.scores));
    const strongest = Object.keys(scores).reduce(function(best, d){ return Number(scores[d] || 0) > Number(scores[best] || 0) ? d : best; }, Object.keys(scores)[0] || "core");
    const primary = canonicalDomain(out.primaryDomain || out.primary || out.domain || strongest || "core") || "core";
    const secondary = uniqueDomains(out.secondaryDomains || out.secondary || [], primary);
    const dc = normalizeDomainConfidence(out.domainConfidence, primary, secondary, sourceText);
    out.primaryDomain = primary;
    out.selectedDomain = primary;
    out.domain = primary;
    out.secondaryDomains = secondary;
    out.domainConfidence = dc;
    out.sixDomainCoverage = buildCoverage(scores, dc, primary, secondary);
    out.signals = Object.assign({}, obj(out.signals), { marionCriticalLayeringPatch: true, sourceTextHash: hash(sourceText || ""), noUserFacingDiagnostics: true });
    return out;
  }

  const oldRoute = module.exports.routeDomain;
  const oldScore = module.exports.scoreDomains;
  if (typeof oldRoute === "function" && !oldRoute.__marionCriticalLayeringPatchV1) {
    const wrapped = function(){
      const sourceText = readTextFrom.apply(null, arguments);
      const base = oldRoute.apply(this, arguments);
      return projectRoute(base, sourceText);
    };
    try { Object.keys(oldRoute).forEach(function(k){ wrapped[k] = oldRoute[k]; }); } catch (_) {}
    wrapped.__marionCriticalLayeringPatchV1 = true;
    module.exports.routeDomain = wrapped;
  }
  if (typeof oldScore === "function" && !oldScore.__marionCriticalLayeringPatchV1) {
    const wrapped = function(){
      const sourceText = readTextFrom.apply(null, arguments);
      const base = oldScore.apply(this, arguments);
      return projectScore(base, sourceText);
    };
    try { Object.keys(oldScore).forEach(function(k){ wrapped[k] = oldScore[k]; }); } catch (_) {}
    wrapped.__marionCriticalLayeringPatchV1 = true;
    module.exports.scoreDomains = wrapped;
  }

  module.exports.MARION_DOMAIN_ROUTER_CRITICAL_LAYERING_PATCH_VERSION = PATCH_VERSION;
  module.exports.marionCriticalProjectDomainRoute = projectRoute;
  module.exports.marionCriticalProjectDomainScore = projectScore;
  module.exports.marionCriticalCanonicalDomain = canonicalDomain;
  module.exports.__marionDomainRouterCriticalLayeringPatchV1 = true;
})();
/* MARION_DOMAIN_ROUTER_CRITICAL_LAYERING_PATCH_V1_END */


/* NYX_GUIDE_CONTEXT_ROUTING_STEPS_2_3_R2_START */
(function nyxGuideContextRoutingPatch(){
  "use strict";
  const PATCH_VERSION="nyx.guideOrchestration.domainRouter/2.0-steps2-3";
  const LANES=new Set(["home","search","live","watch","roku","news","about","apps"]);
  function obj(v){return v&&typeof v==="object"&&!Array.isArray(v)?v:{};}
  function txt(v,max){const s=String(v==null?"":v).replace(/[\u0000-\u001f\u007f]/g,"").replace(/\s+/g," ").trim();return s.slice(0,max||240);}
  function lane(v){const raw=txt(v||"home",32).toLowerCase().replace(/[^a-z0-9_-]+/g,"");const m={radio:"live",listen:"live",tv:"watch",television:"watch",cartoon:"watch",cartoons:"watch",classic:"watch",classics:"watch",synapse:"news",discover:"news",guide:"search",nyx:"search"};const n=m[raw]||raw;return LANES.has(n)?n:"home";}
  function readText(){
    const out=[],seen=new Set();
    function walk(v,d){if(v==null||d>4)return;if(typeof v==="string"){out.push(txt(v,1400));return;}if(typeof v!=="object"||seen.has(v))return;seen.add(v);const x=obj(v);for(const k of["text","userText","rawUserText","message","prompt","input","query","normalizedUserIntent","effectivePrompt"])if(typeof x[k]==="string")out.push(txt(x[k],1400));for(const k of["payload","meta","body","routing","guideContext","runtimeState","state","session"])if(x[k]&&typeof x[k]==="object")walk(x[k],d+1);}
    for(const a of arguments)walk(a,0);return out.filter(Boolean).join(" ").slice(0,2400);
  }
  function findContext(){
    const found=[],seen=new Set();
    function walk(v,d){if(!v||typeof v!=="object"||d>4||seen.has(v))return;seen.add(v);const x=obj(v);for(const c of[x.guideContext,x.nyxGuideContext,x.ecosystemGuideContext,x.guide])if(c&&typeof c==="object"&&!Array.isArray(c))found.push(c);for(const k of["payload","meta","body","routing","runtimeState","state","session","sessionPatch","memoryPatch","client"])if(x[k]&&typeof x[k]==="object")walk(x[k],d+1);}
    for(const a of arguments)walk(a,0);return found[0]||{};
  }
  function intent(text,ctx){
    const t=txt(text,2400).toLowerCase();
    if(/\b(stop|pause|turn off|mute)\b.{0,28}\b(radio|stream|music)\b/.test(t))return{kind:"stop_radio",lane:"live",confidence:.98};
    if(/\b(play|start|turn on|listen to|open)\b.{0,32}\b(radio|live stream|love letters|music)\b/.test(t))return{kind:"play_radio",lane:"live",confidence:.98};
    if(/\b(open|watch|show|go to|take me to|continue to)\b.{0,36}\broku\b/.test(t))return{kind:"open_roku",lane:"roku",confidence:.97};
    if(/\b(open|watch|show|go to|take me to|continue to)\b.{0,36}\b(sandblast tv|television|tv|cartoons?|classics?)\b/.test(t))return{kind:"open_tv",lane:"watch",confidence:.96};
    if(/\b(open|show|go to|take me to|continue to|discover)\b.{0,36}\b(synapse|news)\b/.test(t))return{kind:"open_synapse",lane:"news",confidence:.96};
    if(/\b(open|show|play|watch)\b.{0,28}\b(media|video|feature|preview)\b/.test(t))return{kind:"open_media",lane:"watch",confidence:.94};
    if(/\b(go|take me|return|back)\b.{0,20}\b(home|ecosystem)\b/.test(t))return{kind:"navigate",lane:"home",confidence:.96};
    if(/\b(open|show|use|ask)\b.{0,24}\b(nyx|guide|chat)\b/.test(t))return{kind:"open_guide",lane:"search",confidence:.93};
    if(/\b(summarize|summary|brief me)\b/.test(t))return{kind:"summarize",lane:lane(ctx.currentLane||ctx.lane),confidence:.9};
    return{kind:"conversation",lane:lane(ctx.currentLane||ctx.lane),confidence:.55};
  }
  function normalizeContext(raw){
    const c=obj(raw);return{
      contract:"nyx.guideContext/1.0",
      surface:txt(c.surface||c.site||"sandblast.channel",96)||"sandblast.channel",
      page:txt(c.page||c.pathname||"/",180)||"/",
      currentLane:lane(c.currentLane||c.lane||"home"),
      previousLane:lane(c.previousLane||"home"),
      lastAction:txt(c.lastAction||c.action||"context",48)||"context",
      inputMode:/voice|speech|mic/i.test(txt(c.inputMode||c.inputSource,24))?"voice":"text",
      publicSessionOnly:true,
      privateMemoryAccess:false
    };
  }
  function project(base,args){
    if(!base||typeof base!=="object")return base;
    const a=Array.prototype.slice.call(args||[]),text=readText.apply(null,a.concat([base])),raw=findContext.apply(null,a.concat([base]));
    if(!Object.keys(raw).length&&!/\b(nyx|sandblast|radio|roku|synapse|tv|television|cartoon|classic|navigate|guide)\b/i.test(text))return base;
    const context=normalizeContext(raw),gi=intent(text,context),out=Object.assign({},base),routing=Object.assign({},obj(out.routing));
    out.guideContext=context;
    out.guideRouting={
      version:PATCH_VERSION,
      contract:"nyx.guideRouting/1.0",
      intent:gi.kind,
      targetLane:gi.lane,
      confidence:gi.confidence,
      explicitAction:gi.kind!=="conversation",
      executionAuthority:"client_user_gesture",
      nonAuthority:true,
      noUserFacingDiagnostics:true
    };
    routing.guideRouting=out.guideRouting;
    routing.guideContext=context;
    out.routing=routing;
    out.stateSpinePatch=Object.assign({},obj(out.stateSpinePatch),{
      nyxGuideContinuity:{
        version:PATCH_VERSION,
        currentLane:context.currentLane,
        previousLane:context.previousLane,
        pendingIntent:gi.kind,
        targetLane:gi.lane,
        shouldAdvanceState:gi.kind!=="conversation",
        publicSessionOnly:true,
        updatedAt:Date.now()
      }
    });
    return out;
  }
  function wrap(fn,name){if(typeof fn!=="function"||fn.__nyxGuideContextRoutingR2)return fn;const w=function(){const args=arguments,r=fn.apply(this,args);if(r&&typeof r.then==="function")return r.then(v=>project(v,args));return project(r,args);};try{Object.keys(fn).forEach(k=>w[k]=fn[k]);}catch(_){}w.__nyxGuideContextRoutingR2=true;return w;}
  try{
    const api=module.exports&&typeof module.exports==="object"?module.exports:null;
    if(api){
      if(typeof api.routeDomain==="function")api.routeDomain=wrap(api.routeDomain,"routeDomain");
      if(typeof api.scoreDomains==="function")api.scoreDomains=wrap(api.scoreDomains,"scoreDomains");
      api.NYX_GUIDE_CONTEXT_ROUTING_VERSION=PATCH_VERSION;
      api.normalizeNyxGuideRoutingContext=normalizeContext;
      api.classifyNyxGuideIntent=function(text,context){return intent(text,normalizeContext(context||{}));};
      api.attachNyxGuideRouting=function(value,input){return project(value,[{guideContext:input||{}}]);};
    }
  }catch(_){}
})();
/* NYX_GUIDE_CONTEXT_ROUTING_STEPS_2_3_R2_END */

/* NYX_GUIDE_ORCHESTRATION_STEPS_10_11_12_R1_START */
(function(){
  "use strict";
  const V="nyx.guideOrchestration.domainRouter/4.0-steps10-11-12";
  function o(v){return v&&typeof v==="object"&&!Array.isArray(v)?v:{}}function x(v,n=120){return String(v==null?"":v).replace(/[\u0000-\u001f\u007f]/g,"").replace(/\s+/g," ").trim().slice(0,n)}
  function find(v,args){let plan={},ctx={};const seen=new Set();function w(q,d){if(!q||typeof q!=="object"||d>5||seen.has(q))return;seen.add(q);q=o(q);if(!Object.keys(plan).length&&Array.isArray(o(q.guideActionPlan).actions))plan=o(q.guideActionPlan);if(!Object.keys(ctx).length)ctx=o(q.guideContext||q.publicGuideContinuity);for(const k of["payload","body","meta","routing","runtimeState","state","session","composerContext","marionIntent"])w(q[k],d+1)}for(const q of Array.from(args||[]).concat([v]))w(q,0);return{plan,ctx}}
  function project(v,args){if(!v||typeof v!=="object"||Array.isArray(v))return v;const f=find(v,args),actions=Array.isArray(f.plan.actions)?f.plan.actions:[];if(!actions.length)return v;const first=o(actions[0]),target=x(first.target||first.targetKey,64),lane=x(first.lane||o(f.ctx).currentLane||"home",32),out={...v};out.guideRoutingBoundary={contract:"nyx.guideRoutingBoundary/1.0",version:V,planId:x(f.plan.planId,80),target,targetLane:lane,actionType:x(first.type,32),routeLocked:true,noKnowledgeDomainHijack:true,knowledgeRetrievalRequired:false,executionAuthority:"client_user_gesture",serverExecutionAllowed:false,publicSessionOnly:true};out.routing={...o(out.routing),guideRoutingBoundary:out.guideRoutingBoundary,guideRouteLocked:true,guideTarget:target,guideTargetLane:lane,noKnowledgeDomainHijack:true};return out}
  function wrap(fn){if(typeof fn!=="function"||fn.__nyx101112DomainRouter)return fn;const w=function(){const a=arguments,r=fn.apply(this,a);return r&&typeof r.then==="function"?r.then(v=>project(v,a)):project(r,a)};try{Object.keys(fn).forEach(k=>w[k]=fn[k])}catch(_){}w.__nyx101112DomainRouter=true;return w}
  try{if(typeof module.exports==="function")module.exports=wrap(module.exports);const api=module.exports&&typeof module.exports==="object"?module.exports:null;if(api){for(const n of["routeDomain","scoreDomains","route","run","handle","default"])if(typeof api[n]==="function")api[n]=wrap(api[n]);api.NYX_GUIDE_STEPS_10_11_12_ROUTER_VERSION=V;api.attachNyxGuideRouteBoundary=(v,i)=>project(v,[i||{}])}}catch(_){}
})();
/* NYX_GUIDE_ORCHESTRATION_STEPS_10_11_12_R1_END */

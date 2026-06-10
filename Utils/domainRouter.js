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

const ROUTER_VERSION = "domainRouter v1.5.4 SIX-DOMAIN-COVERAGE-CARRY + CROSS-DOMAIN-SECONDARY-LANE-SCORING-LOCK + SIX-DOMAIN-DEFINITION-ROUTING-LOCK + TECHNICAL-FOLLOWUP-INTENT-LOCK + CYBER-LEAST-PRIVILEGE-PRECISION + TOPLEVEL-CONFIDENCE + TECHNICAL-INFRA-PRECEDENCE-HARDENED";

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
function scoreDomains(norm, session, cog, opts = {}) {
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
  if (definitionDomain) signals.push(`definition:${definitionDomain}`);
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

function routeDomain(norm, session, cog, opts = {}) {
  const n = isPlainObject(norm) ? norm : {};
  const o = isPlainObject(opts) ? opts : {};
  const scored = scoreDomains(n, session, cog, o);
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
    allKnowledgeDomains: SIX_KNOWLEDGE_DOMAINS.slice()
  };

  return {
    ok: true,
    routerVersion: ROUTER_VERSION,
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
    answerMode: crossDomainProfile && crossDomainProfile.answerMode ? crossDomainProfile.answerMode : (domainConfidence.answerMode || (domainConfidence.ambiguous ? "clarify" : "grounded")),
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

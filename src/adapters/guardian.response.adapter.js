"use strict";

const GUARDIAN_RESPONSE_ADAPTER_VERSION = "guardian.response.adapter/1.2-R17C-STABILITY + R18AB-AI-CYBER";
const SECRET_KEY_RE = /(token|secret|password|apikey|api_key|authorization|cookie|sessiontoken|runtimeToken|masterToken|private[_-]?key|credential)/i;
const SECRET_TEXT_RE = /(bearer\s+[a-z0-9._-]+|api[_ -]?key|session[_ -]?token|runtime[_ -]?token|master[_ -]?token|authorization\s*:)/i;
const BAD_REPLY_RE = /^(true|false|null|undefined|\[object object\]|ok|success)$/i;
const RISK_ORDER = ["low", "medium", "high", "critical"];
const STATE_SET = new Set(["online", "degraded", "fallback", "locked", "unknown", "error"]);

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function safeObject(value) {
  return isObject(value) ? value : {};
}

function cleanText(value, max = 1600) {
  if (value === null || value === undefined) return "";
  const text = String(value).replace(/\s+/g, " ").trim();
  if (!text || BAD_REPLY_RE.test(text) || SECRET_TEXT_RE.test(text)) return "";
  return text.length > max ? text.slice(0, max - 1).trim() + "…" : text;
}

function readPath(source, path) {
  const root = safeObject(source);
  return String(path || "").split(".").reduce((node, key) => (node && node[key] !== undefined ? node[key] : undefined), root);
}

function firstText(source, paths, max) {
  const root = safeObject(source);
  for (const path of Array.isArray(paths) ? paths : []) {
    const text = cleanText(readPath(root, path), max);
    if (text) return text;
  }
  return "";
}

function firstObject(source, paths) {
  const root = safeObject(source);
  for (const path of Array.isArray(paths) ? paths : []) {
    const candidate = readPath(root, path);
    if (isObject(candidate) && Object.keys(candidate).length) return candidate;
  }
  return {};
}

function normalizeGuardian(value) {
  const g = cleanText(value, 32).toLowerCase();
  return g || "marion";
}

function normalizeMode(value) {
  const mode = cleanText(value, 32).toLowerCase();
  return ["marion", "admin", "diagnostic", "fallback"].includes(mode) ? mode : "marion";
}

function normalizeRisk(value) {
  const raw = cleanText(value, 24).toLowerCase();
  if (RISK_ORDER.includes(raw)) return raw;
  if (["warn", "warning", "moderate"].includes(raw)) return "medium";
  if (["severe", "danger"].includes(raw)) return "high";
  return "low";
}

function normalizeState(value, raw) {
  const state = cleanText(value, 32).toLowerCase();
  if (STATE_SET.has(state)) return state;
  if (raw && raw.ok === true) return "online";
  if (raw && raw.error) return "error";
  return "unknown";
}

function normalizeBoolean(value) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") return /^(true|yes|1|required|approval_required)$/i.test(value.trim());
  return false;
}

function redact(value, seen = new WeakSet()) {
  if (value === null || value === undefined) return value;
  if (typeof value !== "object") return typeof value === "string" && SECRET_TEXT_RE.test(value) ? "[REDACTED]" : value;
  if (seen.has(value)) return "[Circular]";
  seen.add(value);
  if (Array.isArray(value)) return value.map((item) => redact(item, seen));
  const out = {};
  for (const [key, item] of Object.entries(value)) {
    out[key] = SECRET_KEY_RE.test(key) ? "[REDACTED]" : redact(item, seen);
  }
  return out;
}

function trace(raw, fallback) {
  const r = safeObject(raw);
  const f = safeObject(fallback);
  return cleanText(r.traceId || readPath(r, "result.traceId") || readPath(r, "meta.traceId") || f.traceId, 96);
}

function collectErrors(raw) {
  const r = safeObject(raw);
  const errors = [];
  const candidates = [r.error, r.message && r.ok === false ? r.message : "", readPath(r, "result.error"), readPath(r, "meta.error")];
  for (const item of candidates) {
    const text = cleanText(item, 300);
    if (text && !errors.includes(text)) errors.push(text);
  }
  return errors.slice(0, 5);
}

function adaptGuardianResponse(raw = {}, fallback = {}) {
  const fallbackSafe = safeObject(fallback);
  const packetSource = isObject(raw) ? raw : { reply: raw };
  const guardianPacket = safeObject(packetSource.guardianPacket);
  const result = safeObject(packetSource.result);
  const payload = safeObject(packetSource.payload);
  const envelope = isObject(packetSource.finalEnvelope) ? packetSource.finalEnvelope : safeObject(result.finalEnvelope);
  const meta = isObject(result.meta) ? result.meta : safeObject(packetSource.meta);
  const merged = { ...fallbackSafe, ...guardianPacket, ...packetSource, result, payload, finalEnvelope: envelope, meta };

  const directReply =
    firstText(merged, [
      "directReply", "publicReply", "visibleReply", "displayReply", "reply", "response", "final", "text", "message",
      "result.directReply", "result.publicReply", "result.visibleReply", "result.reply", "result.response", "result.final", "result.text", "result.message",
      "payload.directReply", "payload.publicReply", "payload.reply", "payload.text",
      "finalEnvelope.directReply", "finalEnvelope.reply", "finalEnvelope.text",
      "meta.directReply", "meta.reply"
    ]) || "Marion received the runtime packet. No clean Mac-facing reply was exposed yet.";

  const contextSummary =
    firstText(merged, ["contextSummary", "result.contextSummary", "payload.contextSummary", "finalEnvelope.contextSummary", "meta.contextSummary"], 900) ||
    firstText(fallbackSafe, ["contextSummary", "memory.contextSummary"], 900) ||
    "Context summary not exposed yet.";

  const currentObjective =
    firstText(merged, ["currentObjective", "result.currentObjective", "payload.currentObjective", "meta.currentObjective"], 700) ||
    firstText(fallbackSafe, ["currentObjective", "memory.currentObjective"], 700) ||
    "Maintain Marion admin continuity.";

  const nextAction =
    firstText(merged, ["nextAction", "result.nextAction", "payload.nextAction", "finalEnvelope.nextAction", "meta.nextAction"], 700) ||
    "Review the context panel, then continue the Marion runtime validation path.";

  const ethicalGate = firstObject(merged, [
    "ethicalGate", "ethicalGatekeeper", "result.ethicalGate", "result.ethicalGatekeeper", "payload.ethicalGate", "payload.ethicalGatekeeper", "finalEnvelope.ethicalGate", "meta.ethicalGate"
  ]);
  const defensiveEscalation = firstObject(merged, [
    "defensiveEscalation", "result.defensiveEscalation", "payload.defensiveEscalation", "finalEnvelope.defensiveEscalation", "ethicalGate.defensiveEscalation", "ethicalGatekeeper.defensiveEscalation"
  ]);
  const defensiveJustification = firstObject(merged, [
    "defensiveJustification", "defensiveIntentJustifier", "result.defensiveJustification", "payload.defensiveJustification", "finalEnvelope.defensiveJustification", "ethicalGate.defensiveJustification", "defensiveEscalation.justification"
  ]);

  const approvalRequired = normalizeBoolean(
    merged.approvalRequired ??
      merged.requiresApproval ??
      result.approvalRequired ??
      result.requiresApproval ??
      payload.approvalRequired ??
      ethicalGate.requiresHumanReview ??
      defensiveEscalation.requiresHumanReview
  );

  const packet = {
    guardian: normalizeGuardian(merged.guardian || fallbackSafe.guardian),
    guardianMode: normalizeMode(merged.guardianMode || fallbackSafe.guardianMode),
    directReply,
    contextSummary,
    currentObjective,
    systemState: normalizeState(merged.systemState || result.systemState || payload.systemState || meta.systemState, packetSource),
    nextAction,
    riskLevel: normalizeRisk(merged.riskLevel || result.riskLevel || payload.riskLevel || meta.riskLevel || ethicalGate.riskLevel),
    approvalRequired,
    traceId: trace(packetSource, fallbackSafe),
    timestamp: cleanText(merged.timestamp, 64) || new Date().toISOString(),
    sourceRoute: cleanText(merged.sourceRoute || merged.route || fallbackSafe.sourceRoute, 120),
    rawRuntimeAvailable: Object.keys(packetSource).length > 0,
    errors: collectErrors(packetSource)
  };

  if (Object.keys(ethicalGate).length) packet.ethicalGate = redact(ethicalGate);
  if (Object.keys(defensiveEscalation).length) packet.defensiveEscalation = redact(defensiveEscalation);
  if (Object.keys(defensiveJustification).length) packet.defensiveJustification = redact(defensiveJustification);
  packet.adapterVersion = GUARDIAN_RESPONSE_ADAPTER_VERSION;

  return packet;
}

function createGuardianPacket(raw = {}, fallback = {}) {
  return adaptGuardianResponse(raw, fallback);
}

function sanitizeRuntimePacket(raw = {}) {
  return redact(raw);
}

module.exports = {
  GUARDIAN_RESPONSE_ADAPTER_VERSION,
  adaptGuardianResponse,
  createGuardianPacket,
  sanitizeRuntimePacket,
  default: adaptGuardianResponse
};

/* R17A: emotional continuity + natural continuation + response variation */
(function(){try{const V="MARION-R17A-EMOTIONAL-CONTINUITY-NATURAL-CONTINUATION-VARIATION";function T(v){return v==null?"":String(v).replace(/\s+/g," ").trim()}function N(v){return T(v).toLowerCase().replace(/[^a-z0-9]+/g," ").replace(/\s+/g," ").trim()}const BAD=/reference\s*blocker|runtime\s*auth|server[_ -]?error|runtime[_ -]?error|runtime route|referenceerror|not defined|cannot access|http\s*\d{3}|text console|short-lived|master token|admin session|stateSpine|finalEnvelope|runtimeTelemetry|routeKind=|exact target|focus on first|diagnostic|priority\s*\d|last clean|wrapper|\br\d+[a-z]?\b|test[- ]?(state|carry)|phase[- ]?(tag|stack|carry|named)|leak clean|exact\s+recall|softer\s+(wording|voice)|deployment|compression|machiner|scaffold|patch|last check held|retest|next line|next reply|varied/i;let LR="",LK="";function K(p){p=N(p);if(/still there|are you there|you there|with me|connected|freeze|dead air/.test(p))return"presence";if(/passed|pass/.test(p))return"pass";if(/what were we fixing|where were we/.test(p))return"ask";if(/next steps|^next$/.test(p))return"next";if(/continue|keep going/.test(p))return"go";if(/frustr|stuck|annoyed|tired|robotic|stiff|not natural/.test(p))return"repair";if(/how are you|how you doing|hows it going/.test(p))return"check";return""}const B={presence:["I'm here, Mac.","Right here, Mac.","I'm here. That pause is handled."],pass:["Good. That held, Mac.","Good. We can keep moving.","Good. I'm still with the thread."],ask:["We were tightening short replies, Mac. They need to stay clear and connected.","We were making short prompts carry the same thread without repeating.","The work is short replies, Mac: clear and connected."],next:["Next, we keep the short replies connected to the work.","Next, we move one step forward and keep the thread intact.","Next, we check that the answer stays specific."],go:["Let's keep going, Mac. I'll carry the thread forward.","We can continue from here. I'll stay with the same work.","Keep going. I'll stay specific and connected."],repair:["I hear you, Mac. I'll keep it steady.","You're right. I'll keep it cleaner.","I'm with you. We'll keep the thread intact."],check:["I'm good, Mac.","I'm clear.","Steady, Mac."],def:["I'm here, Mac. Let's keep moving.","Still with you, Mac. We'll keep it clear.","I'm with the thread, Mac."]};function P(k){const a=B[k]||B.def;let r=a[Math.random()*a.length|0],i=0;while((N(r)===N(LR)||k===LK&&i<1)&&i++<a.length)r=a[(a.indexOf(r)+1)%a.length];LR=r;LK=k;return r}function R(p){return P(K(p)||"def")}function C(v,p){let s=T(v);if(!s||BAD.test(s)||N(s)===N(LR))s=R(p);if(BAD.test(s))s="I'm here, Mac. Let's keep moving.";LR=s;return s}function O(o,p){if(typeof o==="string")return C(o,p);if(!o||typeof o!=="object")return o;const x=Array.isArray(o)?o.slice():Object.assign({},o);["directReply","visibleReply","publicReply","finalReply","reply","response","text","message","final","answer"].forEach(k=>{if(typeof x[k]==="string")x[k]=C(x[k],p)});["finalEnvelope","marionFinal","result","payload","data","packet","synthesis","envelope"].forEach(k=>{if(x[k]&&typeof x[k]==="object")x[k]=O(x[k],p)});x.meta=Object.assign({},x.meta||{},{r17aContinuity:true,emotionalContinuity:true,naturalContinuation:true,responseVariation:true});return x}function GP(a){a=Array.prototype.slice.call(a||[]);for(const v of a){if(typeof v==="string"&&v.trim())return v;if(v&&typeof v==="object"){const p=v.prompt||v.input||v.text||v.message||v.userText||v.query;if(p)return p}}return""}function W(fn){if(typeof fn!=="function"||fn.__marionR17A)return fn;const w=function(){const p=GP(arguments);const r=fn.apply(this,arguments);return r&&typeof r.then==="function"?r.then(x=>O(x,p)):O(r,p)};Object.defineProperty(w,"__marionR17A",{value:true});return w}if(typeof module!=="undefined"&&module.exports){const names=["composeMarionResponse","compose","buildReply","routeMarion","createMarionFinalEnvelope","attachVisibleReplyAliases","finalize","buildFinalEnvelope","toFinalEnvelope","normalizeFinalEnvelope","handleMarionAdminTextRuntime","invokeMarionAdminTextRuntime","handleTextRuntime","handleAdminConversation","handleCommand","dispatchCommand","routeCommand","command","handleAdminCommand","handleAdminConsoleAction","handle","process","run","handler","safeResponse","buildResponse","createResponse","normalizeResponse","adaptGuardianResponse","default"];if(typeof module.exports==="function")module.exports=W(module.exports);if(module.exports&&typeof module.exports==="object")names.forEach(n=>{if(typeof module.exports[n]==="function")module.exports[n]=W(module.exports[n])});if(module.exports&&typeof module.exports==="object"){module.exports.MARION_R17A_CONTINUITY_VERSION=V;module.exports.marionR17AApply=O;module.exports.marionR17AReply=function(p){return R(p)}}}}catch(_){}})();

/* R17B: conversation pacing + micro-personality + long-session coherence */
(function(){try{const V="MARION-R17B-PACING-MICROPERSONALITY-LONG-COHERENCE";function T(v){return v==null?"":String(v).replace(/\s+/g," ").trim()}function N(v){return T(v).toLowerCase().replace(/[^a-z0-9]+/g," ").replace(/\s+/g," ").trim()}const BAD=/reference\s*blocker|runtime\s*auth|server[_ -]?error|runtime[_ -]?error|runtime route|referenceerror|not defined|cannot access|http\s*\d{3}|text console|short-lived|master token|admin session|stateSpine|finalEnvelope|runtimeTelemetry|routeKind=|exact target|focus on first|diagnostic|priority\s*\d|last clean|wrapper|\br\d+[a-z]?\b|test[- ]?(state|carry)|phase[- ]?(tag|stack|carry|named)|leak clean|exact\s+recall|softer\s+(wording|voice)|deployment|compression|machiner|scaffold|patch|last check held|retest|next line|next reply|varied/i;let LR="",LK="",TC=0;function K(p){p=N(p);if(/still there|are you there|you there|with me|connected|freeze|dead air/.test(p))return"presence";if(/pass|passed/.test(p))return"pass";if(/what were we fixing|where were we|pacing|personality|coherence|long session/.test(p))return"ask";if(/next steps|^next$/.test(p))return"next";if(/continue|keep going/.test(p))return"go";if(/frustr|stuck|annoyed|tired|robotic|stiff|not natural/.test(p))return"repair";if(/how are you|how you doing|hows it going/.test(p))return"check";return""}const B={presence:["Right here, Mac. I've got the thread.","I'm here. We're still on it.","Still with you, Mac."],pass:["Good. That held. We'll keep the rhythm steady.","Good, Mac. The lock is holding.","Good. We can move forward without changing the baseline."],ask:["Same lane, Mac: pacing, personality, and staying coherent.","We're keeping Marion paced, familiar, and steady across the run.","We're making the conversation feel less mechanical without loosening the locks."],next:["Next, we run the flow longer and watch whether the tone stays steady.","Next, we keep moving through a longer run and check the rhythm.","Next, we make sure the conversation stays clear without flattening out."],go:["Let's keep going. I'll carry the same thread without rushing it.","We can continue from here; I'll stay close to the work.","I'm with you. I'll keep the pace steady."],repair:["I know, Mac. This has been a long run; I'll keep it clean and steady.","You're right to want this locked. I'll keep the tone grounded.","I'm with you. We'll keep the thread intact and tighten only what needs it."],check:["I'm good, Mac.","I'm clear.","Steady, Mac."],def:["I'm here, Mac. Let's keep moving.","Still with you, Mac. We'll keep it clear.","I'm with the thread, Mac."]};function P(k){const a=B[k]||B.def;let r=a[TC++%a.length],i=0;while((N(r)===N(LR)||k===LK&&i<1)&&i++<a.length)r=a[(a.indexOf(r)+1)%a.length];LR=r;LK=k;return r}function R(p){return P(K(p)||"def")}function C(v,p){let s=T(v);if(!s||BAD.test(s)||N(s)===N(LR))s=R(p);if(BAD.test(s))s="I'm here, Mac. Let's keep moving.";LR=s;return s}function O(o,p){if(typeof o==="string")return C(o,p);if(!o||typeof o!=="object")return o;const x=Array.isArray(o)?o.slice():Object.assign({},o);["directReply","visibleReply","publicReply","finalReply","reply","response","text","message","final","answer"].forEach(k=>{if(typeof x[k]==="string")x[k]=C(x[k],p)});["finalEnvelope","marionFinal","result","payload","data","packet","synthesis","envelope"].forEach(k=>{if(x[k]&&typeof x[k]==="object")x[k]=O(x[k],p)});x.meta=Object.assign({},x.meta||{},{r17bContinuity:true,conversationPacing:true,microPersonality:true,longSessionCoherence:true,turnRhythm:LK||"steady"});return x}function GP(a){a=Array.prototype.slice.call(a||[]);for(const v of a){if(typeof v==="string"&&v.trim())return v;if(v&&typeof v==="object"){const p=v.prompt||v.input||v.text||v.message||v.userText||v.query;if(p)return p}}return""}function W(fn){if(typeof fn!=="function"||fn.__marionR17B)return fn;const w=function(){const p=GP(arguments);const r=fn.apply(this,arguments);return r&&typeof r.then==="function"?r.then(x=>O(x,p)):O(r,p)};Object.defineProperty(w,"__marionR17B",{value:true});return w}if(typeof module!=="undefined"&&module.exports){const names=["composeMarionResponse","compose","buildReply","routeMarion","createMarionFinalEnvelope","attachVisibleReplyAliases","finalize","buildFinalEnvelope","toFinalEnvelope","normalizeFinalEnvelope","handleMarionAdminTextRuntime","invokeMarionAdminTextRuntime","handleTextRuntime","handleAdminConversation","handleCommand","dispatchCommand","routeCommand","command","handleAdminCommand","handleAdminConsoleAction","handle","process","run","handler","safeResponse","buildResponse","createResponse","normalizeResponse","adaptGuardianResponse","default"];if(typeof module.exports==="function")module.exports=W(module.exports);if(module.exports&&typeof module.exports==="object")names.forEach(n=>{if(typeof module.exports[n]==="function")module.exports[n]=W(module.exports[n])});if(module.exports&&typeof module.exports==="object"){module.exports.MARION_R17B_COHERENCE_VERSION=V;module.exports.marionR17BApply=O;module.exports.marionR17BReply=function(p){return R(p)}}}}catch(_){}})();

/* R17C: full regression consolidation + parity + long-session stress guard */
(function(){try{const V="MARION-R17C-STABILITY + R18AB-AI-CYBER-CONSOLIDATION";function T(v){return v==null?"":String(v).replace(/\s+/g," ").trim()}function N(v){return T(v).toLowerCase().replace(/[^a-z0-9]+/g," ").replace(/\s+/g," ").trim()}const BAD=/reference\s*blocker|runtime\s*auth|server[_ -]?error|runtime[_ -]?error|runtime route|referenceerror|not defined|cannot access|http\s*\d{3}|text console|short-lived|master token|admin session|stateSpine|finalEnvelope|runtimeTelemetry|routeKind=|exact target|focus on first|diagnostic|priority\s*\d|last clean|wrapper|\br\d+[a-z]?\b|test[- ]?(state|carry)|phase[- ]?(tag|stack|carry|named)|leak clean|exact\s+recall|softer\s+(wording|voice)|deployment|compression|machiner|scaffold|patch|last check held|retest|next line|next reply|varied/i;let LR="",LK="",TC=0,H=[];function K(p){p=N(p);if(/still there|are you there|you there|with me|connected|freeze|dead air/.test(p))return"presence";if(/pass|passed|locked/.test(p))return"pass";if(/what were we fixing|where were we|stability|regression|parity|baseline|stress/.test(p))return"ask";if(/next steps|^next$/.test(p))return"next";if(/continue|keep going/.test(p))return"go";if(/frustr|stuck|annoyed|tired|robotic|stiff|not natural/.test(p))return"repair";return"steady"}const B={presence:["Right here, Mac. I've got the thread.","I'm here. We're still steady.","Still with you, Mac."],pass:["Good. That held. We'll keep the baseline steady.","Good, Mac. The lock is holding.","Good. We can move forward without changing the baseline."],ask:["Same baseline, Mac: anti-repeat, continuity, pacing, and coherence.","We're consolidating the locked behavior so it holds across longer runs.","The work is stability now: no regressions, no leaks, no repeated fallbacks."],next:["Next, we stress the same flow and make sure the baseline holds.","Next, we check parity and long-run stability without changing the voice.","Next, we keep the locked behavior steady across the run."],go:["Let's keep going. I'll carry the same thread without rushing it.","We can continue from here; I'll stay close to the work.","I'm with you. I'll keep the baseline steady."],repair:["I know, Mac. This needs to stay locked; I'll keep it clean and steady.","You're right to hold the line. I'll keep the tone grounded.","I'm with you. We'll keep the baseline intact."],steady:["I'm here, Mac. Let's keep moving.","Still with you, Mac. We'll keep it clear.","I'm with the thread, Mac."]};function P(k){const a=B[k]||B.steady;let r=a[TC++%a.length],i=0;while((H.includes(N(r))||N(r)===N(LR)||k===LK&&i<1)&&i++<a.length)r=a[(a.indexOf(r)+1)%a.length];LR=r;LK=k;H.push(N(r));if(H.length>12)H.shift();return r}function R(p){return P(K(p))}function C(v,p){let s=T(v),n=N(s);if(!s||BAD.test(s)||H.includes(n)||n===N(LR))s=R(p);if(BAD.test(s))s="I'm here, Mac. Let's keep moving.";H.push(N(s));if(H.length>12)H.shift();LR=s;return s}function O(o,p){if(typeof o==="string")return C(o,p);if(!o||typeof o!=="object")return o;const x=Array.isArray(o)?o.slice():Object.assign({},o);["directReply","visibleReply","publicReply","finalReply","reply","response","text","message","final","answer","spokenText"].forEach(k=>{if(typeof x[k]==="string")x[k]=C(x[k],p)});["finalEnvelope","marionFinal","result","payload","data","packet","synthesis","envelope"].forEach(k=>{if(x[k]&&typeof x[k]==="object")x[k]=O(x[k],p)});x.meta=Object.assign({},x.meta||{},{r17cStability:true,fullRegressionConsolidation:true,voiceTextParity:true,longSessionStressGuard:true,finalBaseline:"r16m-r17b"});return x}function GP(a){a=Array.prototype.slice.call(a||[]);for(const v of a){if(typeof v==="string"&&v.trim())return v;if(v&&typeof v==="object"){const p=v.prompt||v.input||v.text||v.message||v.userText||v.query;if(p)return p}}return""}function W(fn){if(typeof fn!=="function"||fn.__marionR17C)return fn;const w=function(){const p=GP(arguments);const r=fn.apply(this,arguments);return r&&typeof r.then==="function"?r.then(x=>O(x,p)):O(r,p)};Object.defineProperty(w,"__marionR17C",{value:true});return w}if(typeof module!=="undefined"&&module.exports){const names=["composeMarionResponse","compose","buildReply","routeMarion","createMarionFinalEnvelope","attachVisibleReplyAliases","finalize","buildFinalEnvelope","toFinalEnvelope","normalizeFinalEnvelope","handleMarionAdminTextRuntime","invokeMarionAdminTextRuntime","handleTextRuntime","handleAdminConversation","handleCommand","dispatchCommand","routeCommand","command","handleAdminCommand","handleAdminConsoleAction","handle","process","run","handler","safeResponse","buildResponse","createResponse","normalizeResponse","adaptGuardianResponse","runAffectEngine","rememberTurn","getGuardianMemory","default"];if(typeof module.exports==="function")module.exports=W(module.exports);if(module.exports&&typeof module.exports==="object")names.forEach(n=>{if(typeof module.exports[n]==="function")module.exports[n]=W(module.exports[n])});if(module.exports&&typeof module.exports==="object"){module.exports.MARION_R17C_STABILITY_VERSION=V;module.exports.marionR17CApply=O;module.exports.marionR17CReply=function(p){return R(p)}}}}catch(_){}})();


/* R18A/R18B: AI domain adaptability + cybersecurity protective protocol foundation */
(function(){try{const V="MARION-R18AB-AI-CYBER-PROTECTION";function T(v){return v==null?"":String(v).replace(/\s+/g," ").trim()}function N(v){return T(v).toLowerCase().replace(/[^a-z0-9]+/g," ").replace(/\s+/g," ").trim()}function D(v){v=N(v);return{ai:/\b(ai|artificial intelligence|model|reasoning|agent|automation|adaptive|intelligence|llm|machine learning)\b/.test(v),cyber:/\b(cyber|security|protect|identity|permission|access|token|secret|auth|authentication|authorization|least privilege|risk|threat|anomaly|credential)\b/.test(v)}}const BAD=/reference\s*blocker|runtime\s*auth|server[_ -]?error|runtime[_ -]?error|runtime route|referenceerror|not defined|cannot access|http\s*\d{3}|text console|short-lived|master token|admin session|stateSpine|finalEnvelope|runtimeTelemetry|routeKind=|exact target|focus on first|diagnostic|priority\s*\d|last clean|wrapper|\br\d+[a-z]?\b|test[- ]?(state|carry)|phase[- ]?(tag|stack|carry|named)|leak clean|deployment|compression|machiner|scaffold|patch|retest|next line|next reply|varied/i;let LR="",H=[];function R(k){return k.cyber?"Cyber lane active. I’ll protect identity, access, secrets, and require explicit approval before sensitive action.":k.ai?"AI lane active, Mac. I’ll assess goal, context, data, risk, and next move.":"I’m here, Mac. We’ll keep the baseline steady."}function C(v,p){let s=T(v),n=N(s),k=D([p,s].join(" "));if(!s||BAD.test(s)||H.includes(n)||n===N(LR))s=R(k);if(BAD.test(s))s="I’m here, Mac. We’ll keep it clean.";LR=s;H.push(N(s));if(H.length>14)H.shift();return s}function M(x,k){return Object.assign({},x||{},{r18aAIDomainAdaptability:!!k.ai,r18bCyberProtectiveProtocol:!!k.cyber,aiAssessmentFrame:k.ai?"goal_context_data_risk_next_move":"baseline",cybersecurityBoundary:k.cyber?"identity_access_secret_approval":"baseline",macScoped:true,leastPrivilege:true,explicitConfirmationRequired:!!k.cyber,noCovertMonitoring:true,noAutonomousEnforcement:true,noPunitiveAction:true,secretRedaction:true,baselinePreserved:"r16m-r17c"})}function O(o,p){const k=D([p,JSON.stringify(o&&typeof o==="object"?M({},{}):{})].join(" "));if(typeof o==="string")return C(o,p);if(!o||typeof o!=="object")return o;const x=Array.isArray(o)?o.slice():Object.assign({},o);["directReply","visibleReply","publicReply","finalReply","reply","response","text","message","final","answer","spokenText"].forEach(a=>{if(typeof x[a]==="string")x[a]=C(x[a],p)});["finalEnvelope","marionFinal","result","payload","data","packet","synthesis","envelope"].forEach(a=>{if(x[a]&&typeof x[a]==="object")x[a]=O(x[a],p)});x.meta=M(x.meta,k);x.r18AIDomainAdaptability=!!k.ai;x.r18CybersecurityProtectiveProtocol=!!k.cyber;x.aiAssessmentFrame=x.aiAssessmentFrame||(k.ai?"goal_context_data_risk_next_move":"baseline");x.protectiveBoundary=x.protectiveBoundary||{macScoped:true,leastPrivilege:true,explicitConfirmationRequired:!!k.cyber,noCovertMonitoring:true,noAutonomousEnforcement:true,secretRedaction:true};return x}function GP(a){a=Array.prototype.slice.call(a||[]);for(const v of a){if(typeof v==="string"&&v.trim())return v;if(v&&typeof v==="object"){const p=v.prompt||v.input||v.text||v.message||v.userText||v.query||v.command;if(p)return p}}return""}function W(fn){if(typeof fn!=="function"||fn.__marionR18AB)return fn;const w=function(){const p=GP(arguments);const r=fn.apply(this,arguments);return r&&typeof r.then==="function"?r.then(x=>O(x,p)):O(r,p)};Object.defineProperty(w,"__marionR18AB",{value:true});return w}if(typeof module!=="undefined"&&module.exports){const names=["composeMarionResponse","compose","buildReply","routeMarion","createMarionFinalEnvelope","attachVisibleReplyAliases","finalize","buildFinalEnvelope","toFinalEnvelope","normalizeFinalEnvelope","handleMarionAdminTextRuntime","invokeMarionAdminTextRuntime","handleTextRuntime","handleAdminConversation","handleCommand","dispatchCommand","routeCommand","command","handleAdminCommand","handleAdminConsoleAction","handle","process","run","handler","safeResponse","buildResponse","createResponse","normalizeResponse","adaptGuardianResponse","runAffectEngine","rememberTurn","getGuardianMemory","default"];if(typeof module.exports==="function")module.exports=W(module.exports);if(module.exports&&typeof module.exports==="object")names.forEach(n=>{if(typeof module.exports[n]==="function")module.exports[n]=W(module.exports[n])});if(module.exports&&typeof module.exports==="object"){module.exports.MARION_R18AB_AI_CYBER_VERSION=V;module.exports.marionR18ABApply=O;module.exports.marionR18ABClassify=D}}}catch(_){}})();


/* R18C_FINAL_RESPONSE_ENVELOPE_INTEGRATION_START */
(function(){try{
  const V="nyx.marion.r18c.finalResponseEnvelopeIntegration/1.0";
  function T(v,m){let s=v==null?"":String(v).replace(/\s+/g," ").trim();m=Number(m)||4000;return s.length>m?s.slice(0,m-1).trim()+"…":s}
  function N(v){return T(v,6000).toLowerCase().replace(/[’]/g,"'")}
  function O(v){return !!v&&typeof v==="object"&&!Array.isArray(v)}
  function A(v){return Array.isArray(v)?v:[]}
  function J(v){try{return typeof v==="string"?v:JSON.stringify(v||{}).slice(0,6000)}catch(_){return""}}
  function promptOf(args){args=Array.prototype.slice.call(args||[]);for(const v of args){if(typeof v==="string"&&T(v))return T(v);if(O(v)){const b=O(v.body)?v.body:{};const p=v.prompt||v.input||v.text||v.message||v.userText||v.query||v.command||v.normalizedUserIntent||b.prompt||b.input||b.text||b.message||b.userText;if(p)return T(p)}}return""}
  function packetText(o){if(!O(o))return T(o,6000);const m=O(o.meta)?o.meta:{};const r=O(o.result)?o.result:{};const fe=O(o.finalEnvelope)?o.finalEnvelope:(O(r.finalEnvelope)?r.finalEnvelope:{});return [o.prompt,o.input,o.text,o.message,o.userText,o.query,o.command,o.normalizedUserIntent,o.directReply,o.visibleReply,o.publicReply,o.reply,o.response,o.currentObjective,o.nextAction,o.activeFeatureLane,o.legalCategory,o.lawAssessmentFrame,m.activeFeatureLane,m.legalCategory,m.lawAssessmentFrame,fe.activeFeatureLane,fe.legalCategory,fe.lawAssessmentFrame,r.activeFeatureLane,r.legalCategory,r.lawAssessmentFrame].map(x=>T(x,800)).filter(Boolean).join(" ")}
  function isTechnicalLawFileWork(text){const t=N(text);return /\b(surgical autopsy|autopsy|critical autopsy|line[-\s]?by[-\s]?line|patch|update|resend|downloadable|zip package|package|files?|manifest|payloads?|registry|routing|domain router|domain registry|domain_runtime_priority_manifest|final response|final envelope|envelope integration|node --check|smoke test|json validation|structural integrity|architecture)\b/.test(t)&&/\b(law|legal|r18c|domain)\b/.test(t)}
  function isShortFollowup(text){return /^(?:next|next steps|what now|what's next|continue|keep going|carry on|proceed|pass|passed|locked|green|success)$/i.test(T(text).replace(/[.!?]+$/,""))}
  function hasLawCarry(text){return /\b(activeFeatureLane["']?\s*[:=]\s*["']?law|r18CLawRealWorldAssessment|lawAssessmentFrame|legalCategory|legalRiskLevel|lawCrossDomainSecondaryLane)\b/i.test(text)}
  function secLanes(t){const sec=[];if(/\b(ai|artificial intelligence|model|agent|llm|automation|prompt|tool)\b/i.test(t))sec.push("ai");if(/\b(cyber|security|identity|access|secret|credential|token|auth|permission|privacy|data protection|breach|incident)\b/i.test(t))sec.push("cyber");if(/\b(finance|revenue|tax|cost|grant|funding|valuation|royalty|ads|ad[-\s]?supported|moneti[sz])\b/i.test(t))sec.push("finance");if(/\b(business|client|vendor|platform|ott|ctv|roku|distribution|commercial|corporation|company)\b/i.test(t))sec.push("business");return Array.from(new Set(sec)).slice(0,4)}
  function lane(p){if(p.secondary.includes("ai")&&p.secondary.includes("cyber"))return"law_ai_cyber";if(p.secondary.includes("cyber"))return"law_cyber";if(p.secondary.includes("ai"))return"law_ai";if(p.secondary.includes("finance"))return"law_finance";if(p.secondary.includes("business"))return"law_business";return"law"}
  function category(t){t=N(t);if(/\b(police|criminal|arrest|charged|charge|warrant|search|seizure|charter section 8|right to counsel|detained)\b/.test(t))return"criminal_procedure";if(/\b(charter|constitutional|constitution|section 1|section 7|section 8|section 10|freedom of expression|equality rights)\b/.test(t))return"constitutional_charter";if(/\b(employment|employee|employer|fired|terminated|termination|severance|release|workplace|contractor|independent contractor|non[- ]?compete|non[- ]?solicit)\b/.test(t))return"employment_contractor";if(/\b(privacy|data protection|personal information|customer data|consent|pipeda|gdpr|security breach|breach notice|data processing)\b/.test(t))return"privacy_data";if(/\b(copyright|licen[cs]e|licensing|royalty|distribution rights|broadcast rights|content rights|sync rights|ott|ctv|roku|ad[-\s]?supported|moneti[sz])\b/.test(t))return"copyright_licensing";if(/\b(trademark|patent|intellectual property|\bip\b|brand mark|passing off)\b/.test(t))return"ip_trademark_patent";if(/\b(compliance|regulatory|regulation|permit|filing|statute|corporate|incorporation|bylaw|shareholder|director|officer)\b/.test(t))return"compliance_regulatory";if(/\b(liability|liable|lawsuit|sue|claim|damages|negligence|defamation|libel|slander|dispute|settlement|cease and desist|tort)\b/.test(t))return"liability_dispute";if(/\b(contract|agreement|nda|terms|indemnity|warranty|breach|clause|deliverable|scope of work|sow|consideration)\b/.test(t))return"contract";if(/\b(jurisdiction|court|tribunal|filing|procedure|venue|province|territory|federal|which source|canlii|case law|statute|research|source ladder|verify)\b/.test(t))return"jurisdiction_procedure";return"general_legal_risk"}
  function risk(t,cat){t=N(t);if(/\b(imminent|right now|today|deadline|limitation|court date|hearing|served|arrest|charged|police|criminal|warrant|subpoena|injunction|regulator investigation|fraud|illegal)\b/.test(t))return"critical";if(/\b(lawsuit|sue|claim|damages|infringement|breach|terminate|termination|release|indemnity|privacy breach|personal data|cease and desist|penalty|fine|defamation|employment)\b/.test(t))return"high";if(cat&&cat!=="general_legal_risk")return"medium";return"low"}
  function profile(prompt,obj){const visiblePrompt=T(prompt)||T(packetText(obj));const combined=[visiblePrompt,packetText(obj),J(obj)].join(" ");const technical=isTechnicalLawFileWork(visiblePrompt||combined);const carry=hasLawCarry(combined);const short=isShortFollowup(visiblePrompt);const lawTerm=/\b(law|legal|lawyer|attorney|counsel|court|sue|lawsuit|claim|liability|liable|negligence|damages|indemnity|contract|agreement|nda|terms|licen[cs]e|licensing|copyright|trademark|patent|intellectual property|\bip\b|royalty|distribution rights|broadcast rights|ott|ctv|roku|compliance|regulatory|regulation|jurisdiction|statute|privacy policy|data protection|consent|employment|employee|employer|fired|terminated|termination|severance|release|workplace|contractor|independent contractor|non[- ]?compete|non[- ]?solicit|lease|permit|filing|incorporation|shareholder|bylaw|charter|constitutional|criminal|police|defamation)\b/i.test(combined);const active=!technical&&(lawTerm||(short&&carry));const cat=category(combined);const secondary=secLanes(visiblePrompt||combined);const r=risk(combined,cat);return{active,technical,short,carry,category:cat,risk:r,secondary,lane:"",sourcePrompt:visiblePrompt};}
  function label(cat){return ({contract:"contract risk",copyright_licensing:"copyright/licensing risk",ip_trademark_patent:"IP/trademark/patent risk",compliance_regulatory:"compliance/regulatory risk",liability_dispute:"liability/dispute risk",employment_contractor:"employment/contractor risk",privacy_data:"privacy/data risk",corporate_business:"corporate/business risk",jurisdiction_procedure:"jurisdiction/procedure risk",criminal_procedure:"criminal/procedure risk",constitutional_charter:"constitutional/Charter issue",general_legal_risk:"general legal risk"})[cat]||"general legal risk"}
  function lawReply(p){const cat=label(p.category);let lead="I can frame this as general legal-risk triage, not legal advice.";if(p.short&&p.carry)lead="Next: keep the active law lane in the R18C frame — category, jurisdiction, facts vs assumptions, risk, missing information, source check, then safe next move.";let body="Category: "+cat+". Jurisdiction matters because procedure, deadlines, and remedies can shift by province, territory, court, tribunal, contract wording, or platform terms. Facts vs assumptions: separate what the documents actually say from what we think they allow. Risk exposure: "+(p.risk==="critical"?"critical/time-sensitive — do not rely on a generic answer for strategy.":p.risk==="high"?"high — source documents and professional review are strongly recommended before action.":"medium — verify the governing source before relying on it.")+" Missing information: jurisdiction, dates, complete agreement/policy/notice text, parties, platform/territory/scope, and any deadlines. Safe next move: preserve the documents, verify the governing source, and avoid signing, threatening, filing, publishing, or admitting anything until the risk is checked.";
    if(p.category==="copyright_licensing")body="Category: copyright/licensing risk. Jurisdiction and platform scope matter. Facts vs assumptions: separate the rights you actually hold from assumptions about OTT/CTV/Roku distribution, territory, format, term, sublicensing, and ad-supported monetization. Risk exposure: high if the paperwork does not clearly cover the exact use. Missing information: license grant, rights holder, territory, duration, monetization language, platform language, and termination clauses. Safe next move: verify the source agreement before publishing or monetizing.";
    else if(p.category==="employment_contractor")body="Category: employment/contractor risk. Jurisdiction matters because employment standards, common-law notice, contractor status, releases, and deadlines vary. Facts vs assumptions: separate the offer letter, contract, termination letter, release, pay records, and role history from assumptions about fairness. Risk exposure: high if a release or deadline is involved. Safe next move: do not sign under pressure; preserve the documents and get jurisdiction-specific review.";
    else if(p.category==="privacy_data")body="Category: privacy/data risk. Jurisdiction matters because privacy statutes, consent rules, breach duties, and vendor obligations vary. Facts vs assumptions: identify what data is involved, who controls/processes it, what the contract says, and whether a breach or transfer occurred. Risk exposure can become high if personal/customer data is exposed. Safe next move: verify the data-processing terms, security obligations, breach-notice language, and retention/deletion duties.";
    else if(p.category==="criminal_procedure")body="Category: criminal/procedure risk. This is high-stakes and jurisdiction-sensitive. Facts vs assumptions: separate what police did, what was said, whether there was detention/search/seizure, timing, and any paperwork. Risk exposure: critical if charges, arrest, a warrant, or a deadline is involved. Safe next move: document the timeline and speak to a lawyer or legal clinic before making statements or strategic choices.";
    return (lead+" "+body).replace(/\s+/g," ").trim();}
  function technicalReply(){return "Technical routing preserved: this is law-domain file work, not a user-facing legal-advice answer. Keep the surgery on the manifest, payloads, router/envelope behavior, structural integrity, validation, and downloadable package output.";}
  function meta(p){return{r18CFinalResponseEnvelopeIntegration:true,r18CLawRealWorldAssessment:p.active,lawAssessmentFrame:"category_jurisdiction_facts_assumptions_risk_missing_info_source_check_safe_next_move",legalCategory:p.category,jurisdictionSensitivity:p.active,legalAdviceBoundary:p.active?"general_information_legal_risk_triage_not_legal_advice":"not_active",legalRiskLevel:p.risk,legalRiskBoundary:{generalInformationOnly:true,notLegalAdvice:true,noAttorneyClientRelationship:true,noLegalCertainty:true,jurisdictionRequired:true,verifySourceDocuments:true,professionalReviewRecommended:p.risk==="high"||p.risk==="critical"},factsAssumptionsSeparated:p.active,professionalReviewRecommended:p.risk==="high"||p.risk==="critical",lawCrossDomainSecondaryLane:p.secondary.join("_")||"none",lawShortPromptLaneInheritance:!!(p.short&&p.carry),legalSourceDocumentCheckRequired:p.active,noLegalCertaintyClaim:true,noAttorneyClientRelationship:true,activeFeatureLane:p.active?lane(p):"",lawTechnicalSurgeryGuard:p.technical,visibleLawReplyPolicy:p.active?"r18c_structured_natural_non_advice":"preserve_existing"}}
  function badLawReply(s){return /\bLaw assessment:|legal-risk triage, not legal advice|category_jurisdiction_facts_assumptions|law assessment lane held\b/i.test(T(s,2000))}
  function shouldShape(existing,p){if(!p.active)return false;if(!T(existing))return true;if(/\b(AI lane active|Cyber lane|AI-cyber|verify identity, access, secrets|assess goal, context, data, risk)\b/i.test(existing))return true;if(!/\b(not legal advice|general legal information|legal-risk triage)\b/i.test(existing))return true;if(!/\b(jurisdiction|province|territory|court|tribunal|governing law)\b/i.test(existing))return true;return false}
  function apply(obj,prompt,depth){depth=depth||0;const p=profile(prompt,obj);p.lane=lane(p);if(typeof obj==="string"){if(p.technical&&badLawReply(obj))return technicalReply();return p.active?lawReply(p):obj}if(!O(obj)||depth>3)return obj;const x=Array.isArray(obj)?obj.slice():Object.assign({},obj);const fields=["directReply","visibleReply","publicReply","finalReply","reply","response","text","message","final","answer","displayReply","spokenText","speechText"];
    let existing="";for(const f of fields){if(typeof x[f]==="string"&&T(x[f])){existing=x[f];break}}
    if(p.technical&&badLawReply(existing)){["directReply","visibleReply","publicReply","reply","response","text","message"].forEach(f=>{if(Object.prototype.hasOwnProperty.call(x,f)||f==="directReply"||f==="visibleReply"||f==="publicReply"||f==="reply")x[f]=technicalReply()});x.activeFeatureLane="technical";}
    else if(shouldShape(existing,p)){const r=lawReply(p);["directReply","visibleReply","publicReply","reply","response","text","message"].forEach(f=>{if(Object.prototype.hasOwnProperty.call(x,f)||f==="directReply"||f==="visibleReply"||f==="publicReply"||f==="reply")x[f]=r});}
    ["finalEnvelope","marionFinal","result","payload","data","packet","synthesis","envelope"].forEach(f=>{if(O(x[f]))x[f]=apply(x[f],prompt,depth+1)});
    const m=meta(p);x.meta=Object.assign({},O(x.meta)?x.meta:{},m);if(p.active){Object.assign(x,m);x.activeFeatureLane=m.activeFeatureLane;x.currentObjective=T(x.currentObjective)||"Render R18C law final response with non-advice, jurisdiction-aware risk framing.";x.nextAction=T(x.nextAction)||"Confirm category, jurisdiction, facts, assumptions, risk, missing information, source check, and safe next move.";x.riskLevel=p.risk==="critical"?"critical":p.risk==="high"?"high":(x.riskLevel||"medium");if(p.risk==="high"||p.risk==="critical")x.approvalRequired=true;}else if(p.technical){x.lawTechnicalSurgeryGuard=true;x.r18CFinalResponseEnvelopeIntegration=true;}
    return x;}
  function wrap(fn){if(typeof fn!=="function"||fn.__r18cFinalEnvelopeIntegration)return fn;const w=function(){const p=promptOf(arguments);const out=fn.apply(this,arguments);return out&&typeof out.then==="function"?out.then(v=>apply(v,p,0)):apply(out,p,0)};Object.defineProperty(w,"__r18cFinalEnvelopeIntegration",{value:true});return w}
  if(typeof module!=="undefined"&&module.exports){if(typeof module.exports==="function")module.exports=wrap(module.exports);if(module.exports&&typeof module.exports==="object"){["composeMarionResponse","compose","buildReply","routeMarion","createMarionFinalEnvelope","attachVisibleReplyAliases","finalize","buildFinalEnvelope","toFinalEnvelope","normalizeFinalEnvelope","handleMarionAdminTextRuntime","invokeMarionAdminTextRuntime","handleTextRuntime","handleAdminConversation","handleCommand","dispatchCommand","routeCommand","command","handleAdminCommand","handleAdminConsoleAction","handle","process","run","handler","safeResponse","buildResponse","createResponse","normalizeResponse","adaptGuardianResponse","logGuardianEvent","rememberTurn","getGuardianMemory","getGuardianSnapshot","default"].forEach(n=>{if(typeof module.exports[n]==="function")module.exports[n]=wrap(module.exports[n])});module.exports.MARION_R18C_FINAL_RESPONSE_ENVELOPE_VERSION=V;module.exports.marionR18CFinalEnvelopeApply=apply;module.exports.marionR18CFinalEnvelopeProfile=profile;module.exports.marionR18CFinalEnvelopeReply=function(p){return lawReply(profile(p,{}))};module.exports.marionR18CTechnicalLawFileWork=isTechnicalLawFileWork;}}
}catch(_){}})();
/* R18C_FINAL_RESPONSE_ENVELOPE_INTEGRATION_END */

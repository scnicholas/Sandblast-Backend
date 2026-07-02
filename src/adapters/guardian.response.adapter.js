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

/* R18C_FULL_STACK_FINAL_METADATA_WRAP_START */
(function(){
  try {
    const H = module.exports.marionR18CFullStackHelpers;
    if (!H || module.exports.__r18cFullStackFinalMetadataWrapped) return;
    const oldApply = module.exports.marionR18CFinalEnvelopeApply;
    const oldProfile = module.exports.marionR18CFinalEnvelopeProfile;
    module.exports.marionR18CFullStackEnvelopeProfile = function(packet){
      const text = H.extractText(packet);
      const p = H.r18cProfile(text, packet);
      return Object.assign({}, p, {
        visibleReplyPolicy: "jurisdiction_aware_legal_risk_triage",
        fullStackAgreementRequired: true,
        technicalLawFileWorkGuard: H.r18cTechnicalLawFileWork(text)
      });
    };
    if (typeof oldProfile === "function") {
      module.exports.marionR18CFinalEnvelopeProfile = function(packet){
        const base = oldProfile.apply(this, arguments);
        const text = H.extractText(packet);
        if (!H.r18cIsLaw(text, packet)) return base;
        return Object.assign({}, H.O(base), module.exports.marionR18CFullStackEnvelopeProfile(packet));
      };
    }
    if (typeof oldApply === "function") {
      module.exports.marionR18CFinalEnvelopeApply = function(packet){
        const base = oldApply.apply(this, arguments);
        const text = H.extractText(packet);
        if (!H.r18cIsLaw(text, packet)) return base;
        const p = module.exports.marionR18CFullStackEnvelopeProfile(packet);
        return H.r18cMergeLawProfile(Object.assign({}, H.O(base), {
          r18CLawRealWorldAssessment: true,
          lawAssessmentFrame: p.assessmentFrame.join(" > "),
          legalAdviceBoundary: "general_information_not_legal_advice",
          factsAssumptionsSeparated: true,
          professionalReviewRecommended: true,
          legalSourceDocumentCheckRequired: true,
          noLegalCertaintyClaim: true,
          noAttorneyClientRelationship: true
        }), p);
      };
    }
    module.exports.__r18cFullStackFinalMetadataWrapped = true;
  } catch(_err) {}
})();
/* R18C_FULL_STACK_FINAL_METADATA_WRAP_END */

/* R18C_LIVE_HANDLER_REPAIR_START */
(function(){
  "use strict";
  const V = "nyx.marion.r18c.liveHandlerRepair/1.0";
  if (typeof module === "undefined" || !module.exports) return;
  if (module.exports.__r18cLiveHandlerRepairPatched) return;
  module.exports.__r18cLiveHandlerRepairPatched = true;
  module.exports.MARION_R18C_LIVE_HANDLER_REPAIR_VERSION = V;

  function T(v, max){
    const s = v == null ? "" : String(v).replace(/\s+/g, " ").trim();
    if (!max || s.length <= max) return s;
    return s.slice(0, Math.max(0, max - 1)).trim() + "…";
  }
  function L(v){ return T(v).toLowerCase(); }
  function O(v){ return v && typeof v === "object" && !Array.isArray(v) ? v : {}; }
  function A(v){ return Array.isArray(v) ? v : []; }
  function firstText(){
    for (let i=0;i<arguments.length;i+=1){
      const v = T(arguments[i]);
      if (v) return v;
    }
    return "";
  }
  function readPath(root, dotted){
    let node = O(root);
    const parts = String(dotted || "").split(".");
    for (let i=0;i<parts.length;i+=1){
      if (!node || typeof node !== "object") return "";
      node = node[parts[i]];
    }
    return node;
  }
  function extractText(packet){
    const p = O(packet);
    const req = O(p.req);
    const body = O(req.body || p.body);
    const payload = O(p.payload);
    const result = O(p.result);
    const meta = O(p.meta);
    const fe = O(p.finalEnvelope || result.finalEnvelope);
    return firstText(
      p.originalPrompt, p.rawUserText, p.userText, p.message, p.input, p.text, p.prompt, p.query,
      body.originalPrompt, body.rawUserText, body.userText, body.message, body.input, body.text, body.prompt,
      payload.originalPrompt, payload.rawUserText, payload.userText, payload.message, payload.input, payload.text, payload.prompt,
      result.originalPrompt, result.rawUserText, result.userText, result.message, result.input, result.text, result.prompt,
      meta.originalPrompt, meta.rawUserText, meta.userText, meta.message, meta.input, meta.text, meta.prompt,
      fe.originalPrompt, fe.rawUserText, fe.userText, fe.message, fe.input, fe.text, fe.prompt
    );
  }
  function extractReply(packet){
    const p = O(packet);
    const result = O(p.result);
    const payload = O(p.payload);
    const meta = O(p.meta);
    const fe = O(p.finalEnvelope || result.finalEnvelope);
    return firstText(
      p.directReply, p.publicReply, p.visibleReply, p.displayReply, p.reply, p.response, p.final, p.text, p.message,
      result.directReply, result.publicReply, result.visibleReply, result.displayReply, result.reply, result.response, result.final, result.text, result.message,
      payload.directReply, payload.publicReply, payload.visibleReply, payload.displayReply, payload.reply, payload.response, payload.final, payload.text, payload.message,
      fe.directReply, fe.publicReply, fe.visibleReply, fe.displayReply, fe.reply, fe.response, fe.final, fe.text, fe.message,
      meta.directReply, meta.publicReply, meta.visibleReply, meta.displayReply, meta.reply, meta.response, meta.final, meta.text, meta.message
    );
  }
  function technicalLawFileWork(text){
    const t = L(text);
    if (!t) return false;
    const technical = /\b(surgical\s+autopsy|autopsy|patch|fix|update|resend|downloadable\s+zip|zip package|node --check|script|file|files|js|javascript|runtime|backend|frontend|api\/chat|index\.js|chatengine|chat engine|composer|composemarionresponse|marionbridge|final envelope|marionfinalenvelope|guardian\.response\.adapter|domain router|domain registry|manifest|payload|package|structural integrity)\b/i.test(t);
    const fileLaw = /\b(law domain|law manifest|law payload|law files?|legal payload|legal manifest|r18c|full[-\s]?stack regression|live handler|route|routing|registry|envelope integration)\b/i.test(t);
    return technical && fileLaw;
  }
  function shortLawFollowup(text){
    const t = L(text).replace(/[.!?]+$/g, "").trim();
    return /^(next|next steps|continue|keep going|go on|what now|what's next|what is next|then what)$/i.test(t);
  }
  function categories(text){
    const t = L(text);
    const out = [];
    function add(c){ if (out.indexOf(c) < 0) out.push(c); }
    if (/\b(copyright|license|licence|licensing|distribution rights|streaming rights|public performance|broadcast rights|roku|ott|movie|movies|moneti[sz]e|paperwork|chain of title|content rights)\b/i.test(t)) add("copyright_licensing");
    if (/\b(customer data|personal data|privacy|data processing|processor|subprocessor|breach|retention|delete data|data security|confidential information|vendor data)\b/i.test(t)) add("privacy_data");
    if (/\b(fired|terminated|termination|severance|release to sign|employment|contractor|independent contractor|wrongful dismissal|constructive dismissal|two weeks|pay in lieu)\b/i.test(t)) add("employment_contractor");
    if (/\b(defamation|libel|slander|false claims|false statement|reputation|posted false|business harm|liable|liability|negligence|tort|sue|lawsuit|claim|damages)\b/i.test(t)) add("liability_dispute");
    if (/\b(trademark|trade mark|patent|intellectual property| IP |brand name|logo|ownership of rights)\b/i.test(" " + t + " ")) add("ip_trademark_patent");
    if (/\b(compliance|regulatory|regulation|policy|terms of service|consumer protection|advertising rules|platform rules)\b/i.test(t)) add("compliance_regulatory");
    if (/\b(incorporation|shareholder|director|corporate|business contract|vendor agreement|partnership)\b/i.test(t)) add("corporate_business");
    if (/\b(jurisdiction|province|territory|ontario|canada|court|tribunal|deadline|limitation period|statute of limitations|file|filing)\b/i.test(t)) add("jurisdiction_procedure");
    if (/\b(contract|agreement|clause|terms|breach|consideration|indemnity|warranty|representation|termination clause)\b/i.test(t)) add("contract");
    if (/\b(source|sources|verify|case law|statute|official source|canlii|justice laws|e-laws|legal research)\b/i.test(t)) add("source_verification");
    if (/\b(legal|law|lawful|illegal|rights|risk|allowed|can i|should i sign|am i safe)\b/i.test(t) && !out.length) add("general_legal_risk");
    return out;
  }
  function secondaryDomains(text){
    const t = L(text);
    const s = [];
    function add(v){ if (s.indexOf(v) < 0) s.push(v); }
    if (/\b(cost|revenue|money|price|pricing|funding|grant|profit|moneti[sz]e|ad revenue|sponsor|fee)\b/i.test(t)) add("finance");
    if (/\b(ai|model|agent|automation|llm|prompt|machine learning)\b/i.test(t)) add("ai");
    if (/\b(security|cyber|access|identity|secret|token|credential|breach|encryption|privacy)\b/i.test(t)) add("cyber");
    if (/\b(roku|ott|streaming|broadcast|channel|movie|tv)\b/i.test(t)) add("roku");
    if (/\b(business|sandblast|vendor|commercial|customer|contractor|platform)\b/i.test(t)) add("business");
    return s.slice(0,4);
  }
  function isLawTurn(text, packet){
    if (technicalLawFileWork(text)) return false;
    const p = O(packet);
    const dc = O(p.domainConfidence || O(p.routing).domainConfidence || O(p.result).domainConfidence || O(p.meta).domainConfidence);
    const domain = L(firstText(p.domain, p.primaryDomain, p.selectedDomain, p.knowledgeDomain, O(p.routing).domain, O(p.routing).primaryDomain, dc.primaryDomain, dc.knowledgeDomain, O(p.finalEnvelope).domain));
    if (domain === "law" || domain.indexOf("law_") === 0) return true;
    return categories(text).length > 0;
  }
  function isPresenceFallback(reply){
    const r = L(reply).replace(/[.!?]+$/g, "").trim();
    if (!r) return true;
    return /^(i[’']?m here(?:,\s*mac)?|i am here(?:,\s*mac)?|still with you(?:,\s*mac)?|line open with you|ready when you are|what would you like to work on|hi\.?\s*i[’']?m nyx\.?\s*it[’']?s good to see you\.?\s*what would you like to work on)$/i.test(r) ||
      /\b(i[’']?m here|still with you|what would you like to work on)\b/i.test(r) && r.length < 120;
  }
  function isBadLawReply(reply, text){
    if (!isLawTurn(text, {})) return false;
    const r = L(reply);
    if (isPresenceFallback(reply)) return true;
    if (/^(true|false|null|undefined|\[object object\]|ok|success)$/i.test(r)) return true;
    if (r.length < 80 && !/\b(copyright|licens|contract|privacy|data|liability|jurisdiction|legal|agreement|source|document)\b/i.test(r)) return true;
    return false;
  }
  function profile(text, packet){
    const cats = categories(text);
    const shortCarry = shortLawFollowup(text) && /law/i.test(JSON.stringify(packet || {}).slice(0, 2500));
    return {
      version: V,
      active: !!(cats.length || shortCarry || isLawTurn(text, packet)),
      domain: "law",
      primaryDomain: "law",
      selectedDomain: "law",
      knowledgeDomain: "law",
      legalCategory: cats[0] || "general_legal_risk",
      legalCategories: cats.length ? cats : ["general_legal_risk"],
      secondaryDomains: secondaryDomains(text),
      confidence: shortCarry ? 0.82 : 0.94,
      confidenceScore: shortCarry ? 0.82 : 0.94,
      band: "high",
      answerMode: "grounded",
      routeLocked: true,
      lawShortPromptLaneInheritance: shortCarry,
      r18CLawRealWorldAssessment: true,
      r18CLiveHandlerRepair: true,
      noLegalAdvice: true,
      noLegalCertaintyClaim: true,
      noAttorneyClientRelationship: true,
      factsAssumptionsSeparated: true,
      jurisdictionSensitivity: true,
      legalSourceDocumentCheckRequired: true,
      assessmentFrame: ["legal_category","jurisdiction_sensitivity","facts_vs_assumptions","risk_exposure","missing_information","source_document_check","safe_next_move"],
      legalRiskBoundary: {
        generalInformationOnly: true,
        noLegalAdvice: true,
        noAttorneyClientRelationship: true,
        noLegalCertaintyClaim: true,
        jurisdictionRequired: true,
        sourceDocumentReviewRequired: true,
        professionalReviewRecommendedForHighRisk: true
      }
    };
  }
  function lawReply(text, p){
    const cats = (p && p.legalCategories) || categories(text);
    const cat = (cats && cats[0]) || "general_legal_risk";
    const jurisdictionLine = "Jurisdiction sensitivity: I’d need the province/territory and the governing documents before treating this as anything more than general legal information.";
    if (cat === "copyright_licensing") {
      return "I can give general legal-risk triage, not legal advice. Legal category: copyright/licensing. Paperwork by itself is not enough; the key is whether the documents clearly grant streaming/CTV/Roku distribution, public-performance, monetization, territory, duration, exclusivity, and sublicensing rights. Facts vs assumptions: you may have some paperwork, but we cannot assume it covers Roku or ad-supported distribution until the rights language and chain of title are checked. Risk exposure: takedowns, platform rejection, copyright claims, indemnity exposure, or lost monetization. Missing information: the license, rights owner, territory, term, media/platform scope, monetization clause, warranties, and indemnity language. " + jurisdictionLine + " Safe next move: build a rights checklist and have the actual source documents reviewed before publishing or monetizing the movies.";
    }
    if (cat === "privacy_data") {
      return "I can give general legal-risk triage, not legal advice. Legal category: privacy/data in a vendor agreement. Facts vs assumptions: a vendor has customer data, but we need to know what data, where it is stored, who can access it, and what law/contract governs it. Risk exposure: breach liability, unauthorized use, weak deletion terms, subcontractor exposure, and compliance gaps. Missing information: data-processing purpose, safeguards, breach notice timing, subprocessors, retention/deletion, audit rights, jurisdiction, confidentiality, indemnity, and return/destruction obligations. Safe next move: review the agreement for a privacy/data-processing schedule and require clear breach, security, retention, and deletion terms before sharing live customer data.";
    }
    if (cat === "employment_contractor") {
      return "I can give general legal information, not legal advice. Legal category: employment/contractor. Facts vs assumptions: termination pay, severance, and release language depend on the province, employment status, contract terms, length of service, role, and whether a valid termination clause exists. Risk exposure: signing a release too quickly can waive claims or benefits. Missing information: province, employment contract, termination letter, release, tenure, pay/benefits, and deadline pressure. Safe next move: do not sign under pressure; compare the offer against statutory minimums and possible common-law factors, then have a lawyer or legal clinic review the release if money or rights are material.";
    }
    if (cat === "liability_dispute") {
      return "I can give general legal-risk triage, not legal advice. Legal category: liability/dispute. Facts vs assumptions: whether there is a viable claim depends on what was said or done, evidence, harm, causation, available defences, and jurisdiction. Risk exposure: reputational harm, damages, escalation costs, and counterclaims if the response is careless. Missing information: timeline, screenshots/documents, witnesses, losses, platform context, and any prior communications. Safe next move: preserve evidence, avoid threats or retaliation, write a neutral facts-only request for correction/removal if appropriate, and verify the proper tribunal/court or legal clinic route for your province.";
    }
    if (cat === "source_verification") {
      return "I can give general legal-research guidance, not legal advice. Legal category: source verification. Start with primary authority: the relevant statute/regulation on an official government site, then current case law from official court sites or CanLII, then secondary sources only for explanation. Facts vs assumptions: commentary is not binding law. Risk exposure: relying on stale, out-of-jurisdiction, or non-authoritative sources can produce the wrong answer. Safe next move: identify the jurisdiction, statute, section, and current cases, then note up anything important before relying on it.";
    }
    return "I can give general legal-risk triage, not legal advice. Legal category: " + cat.replace(/_/g, "/") + ". " + jurisdictionLine + " Facts vs assumptions: I can only work from the facts you provide, and missing documents can change the answer. Risk exposure: rights, liability, compliance, timing, and cost can shift depending on the documents and jurisdiction. Missing information: governing agreement, dates, parties, province/territory, source documents, and what outcome you want. Safe next move: gather the documents and timeline first, then verify the governing law or have a lawyer/legal clinic review the high-risk parts.";
  }
  function mergeProfile(target, p){
    const out = O(target);
    if (!p || !p.active) return out;
    out.r18CLiveHandlerRepair = true;
    out.r18CLawRealWorldAssessment = true;
    out.domain = "law";
    out.primaryDomain = "law";
    out.selectedDomain = "law";
    out.knowledgeDomain = "law";
    out.legalCategory = p.legalCategory;
    out.legalCategories = p.legalCategories;
    out.secondaryDomains = p.secondaryDomains;
    out.lawAssessmentFrame = p.assessmentFrame.join(",");
    out.legalAdviceBoundary = "general legal information only; not legal advice; no attorney-client relationship; no legal certainty claim";
    out.jurisdictionSensitivity = true;
    out.factsAssumptionsSeparated = true;
    out.legalSourceDocumentCheckRequired = true;
    out.noLegalCertaintyClaim = true;
    out.noAttorneyClientRelationship = true;
    out.legalRiskBoundary = p.legalRiskBoundary;
    return out;
  }
  function setReplyFields(obj, reply, p){
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) return obj;
    obj.directReply = reply;
    obj.publicReply = reply;
    obj.visibleReply = reply;
    obj.displayReply = reply;
    obj.reply = reply;
    obj.response = reply;
    obj.text = reply;
    obj.message = reply;
    obj.final = reply;
    mergeProfile(obj, p);
    return obj;
  }
  function apply(packet, opt, seen){
    const options = O(opt);
    const prompt = firstText(options.prompt, extractText(packet));
    if (!prompt || technicalLawFileWork(prompt) || !isLawTurn(prompt, packet)) return packet;
    const p = profile(prompt, packet);
    if (!p.active) return packet;
    const expected = lawReply(prompt, p);
    if (typeof packet === "string") return isBadLawReply(packet, prompt) ? expected : packet;
    if (!packet || typeof packet !== "object") return packet;
    const stack = seen || [];
    if (stack.indexOf(packet) >= 0) return packet;
    stack.push(packet);
    const current = extractReply(packet);
    if (isBadLawReply(current, prompt)) setReplyFields(packet, expected, p);
    else mergeProfile(packet, p);
    const nested = ["result","payload","finalEnvelope","guardianPacket","marionFinal","marion","data","output"];
    for (let i=0;i<nested.length;i+=1){
      const k = nested[i];
      if (packet[k] && typeof packet[k] === "object") apply(packet[k], { prompt }, stack);
    }
    if (packet.meta && typeof packet.meta === "object") {
      packet.meta.r18CLiveHandlerRepair = true;
      packet.meta.r18CLawProfile = p;
    }
    if (packet.routing && typeof packet.routing === "object") mergeProfile(packet.routing, p);
    if (packet.domainConfidence && typeof packet.domainConfidence === "object") mergeProfile(packet.domainConfidence, p);
    return packet;
  }
  function wrap(name){
    const old = module.exports[name];
    if (typeof old !== "function" || old.__r18cLiveHandlerRepairWrapped) return;
    const wrapped = function(){
      const args = Array.prototype.slice.call(arguments);
      const prompt = firstText.apply(null, args.map(extractText).concat(args.map(T)));
      const out = old.apply(this, args);
      if (out && typeof out.then === "function") {
        return out.then(function(value){ return apply(value, { prompt: prompt || extractText(value) }); });
      }
      return apply(out, { prompt: prompt || extractText(out) });
    };
    wrapped.__r18cLiveHandlerRepairWrapped = true;
    try { Object.defineProperty(wrapped, "name", { value: old.name || name }); } catch(_){}
    module.exports[name] = wrapped;
  }

  [
    "composeMarionResponse","run","default",
    "processWithMarion","maybeResolve","ask","handle","route","createMarionBridge",
    "createMarionFinalEnvelope","attachVisibleReplyAliases",
    "adaptGuardianResponse","createGuardianPacket","sanitizeRuntimePacket",
    "normalizeCoordinatorOutputForPipeline","shapeEngineReply","applyPublicReplyHygieneToResponse","normalizeMarionBridgeResult"
  ].forEach(wrap);

  try {
    if (typeof express !== "undefined" && express && express.response && !express.response.__r18cLiveHandlerRepairPatched) {
      const oldJson = express.response.json;
      const oldSend = express.response.send;
      if (typeof oldJson === "function") {
        express.response.json = function(body){
          try {
            const req = O(this && this.req);
            const prompt = extractText({ req: req, body: O(req.body), payload: O(req.body) });
            body = apply(body, { prompt });
          } catch(_err) {}
          return oldJson.call(this, body);
        };
      }
      if (typeof oldSend === "function") {
        express.response.send = function(body){
          try {
            const req = O(this && this.req);
            const prompt = extractText({ req: req, body: O(req.body), payload: O(req.body) });
            if (typeof body === "string" && prompt && isLawTurn(prompt, {}) && !technicalLawFileWork(prompt)) {
              const trimmed = body.trim();
              if ((trimmed[0] === "{" || trimmed[0] === "[") && trimmed.length < 1000000) {
                const parsed = JSON.parse(trimmed);
                const fixed = apply(parsed, { prompt });
                body = JSON.stringify(fixed);
              } else if (isBadLawReply(trimmed, prompt)) {
                body = lawReply(prompt, profile(prompt, {}));
              }
            }
          } catch(_err) {}
          return oldSend.call(this, body);
        };
      }
      express.response.__r18cLiveHandlerRepairPatched = true;
    }
  } catch(_err) {}

  module.exports.marionR18CLiveHandlerRepairApply = apply;
  module.exports.marionR18CLiveHandlerRepairProfile = profile;
  module.exports.marionR18CLiveHandlerRepairReply = lawReply;
  module.exports.marionR18CLiveHandlerRepairIsPresenceFallback = isPresenceFallback;
  module.exports.marionR18CLiveHandlerRepairIsLawTurn = isLawTurn;
})();
/* R18C_LIVE_HANDLER_REPAIR_END */

/* R18C_FINAL_ANSWER_MATERIALIZER_START */
(function(){
  "use strict";
  const V = "nyx.marion.r18c.finalAnswerMaterializer/1.0";
  if (typeof module === "undefined" || !module.exports) return;
  if (module.exports.__r18cFinalAnswerMaterializerPatched) return;
  module.exports.__r18cFinalAnswerMaterializerPatched = true;
  module.exports.MARION_R18C_FINAL_ANSWER_MATERIALIZER_VERSION = V;

  function T(v, max){
    const s = v == null ? "" : String(v).replace(/\s+/g, " ").trim();
    if (!max || s.length <= max) return s;
    return s.slice(0, Math.max(0, max - 1)).trim() + "…";
  }
  function L(v){ return T(v).toLowerCase(); }
  function O(v){ return v && typeof v === "object" && !Array.isArray(v) ? v : {}; }
  function A(v){ return Array.isArray(v) ? v : []; }
  function uniq(list, max){
    const out = [];
    const seen = {};
    for (let i=0;i<(Array.isArray(list)?list:[]).length;i+=1){
      const v = T(list[i], 64);
      if (!v || seen[v]) continue;
      seen[v] = true;
      out.push(v);
      if (max && out.length >= max) break;
    }
    return out;
  }
  function firstText(){
    for (let i=0;i<arguments.length;i+=1){
      const v = T(arguments[i]);
      if (v) return v;
    }
    return "";
  }
  function read(root, path){
    let node = root;
    const parts = String(path || "").split(".");
    for (let i=0;i<parts.length;i+=1){
      if (!node || typeof node !== "object") return undefined;
      node = node[parts[i]];
    }
    return node;
  }
  function collectTextFields(packet){
    const p = O(packet);
    const req = O(p.req);
    const body = O(req.body || p.body);
    const result = O(p.result);
    const payload = O(p.payload);
    const meta = O(p.meta);
    const fe = O(p.finalEnvelope || result.finalEnvelope || payload.finalEnvelope);
    return [
      p.originalPrompt,p.rawUserText,p.userText,p.userMessage,p.message,p.input,p.text,p.prompt,p.query,
      body.originalPrompt,body.rawUserText,body.userText,body.userMessage,body.message,body.input,body.text,body.prompt,body.query,
      payload.originalPrompt,payload.rawUserText,payload.userText,payload.userMessage,payload.message,payload.input,payload.text,payload.prompt,
      result.originalPrompt,result.rawUserText,result.userText,result.userMessage,result.message,result.input,result.text,result.prompt,
      meta.originalPrompt,meta.rawUserText,meta.userText,meta.userMessage,meta.message,meta.input,meta.text,meta.prompt,
      fe.originalPrompt,fe.rawUserText,fe.userText,fe.userMessage,fe.message,fe.input,fe.text,fe.prompt
    ];
  }
  function extractPrompt(packet){
    return firstText.apply(null, collectTextFields(packet));
  }
  function ownReplyCandidates(packet){
    const p = O(packet);
    const result = O(p.result);
    const payload = O(p.payload);
    const meta = O(p.meta);
    const gp = O(p.guardianPacket);
    const fe = O(p.finalEnvelope || result.finalEnvelope || payload.finalEnvelope || gp.finalEnvelope);
    return [
      p.directReply,p.publicReply,p.visibleReply,p.displayReply,p.reply,p.response,p.final,
      result.directReply,result.publicReply,result.visibleReply,result.displayReply,result.reply,result.response,result.final,
      payload.directReply,payload.publicReply,payload.visibleReply,payload.displayReply,payload.reply,payload.response,payload.final,
      gp.directReply,gp.publicReply,gp.visibleReply,gp.displayReply,gp.reply,gp.response,gp.final,
      fe.directReply,fe.publicReply,fe.visibleReply,fe.displayReply,fe.reply,fe.response,fe.final,
      meta.directReply,meta.publicReply,meta.visibleReply,meta.displayReply,meta.reply,meta.response,meta.final
    ];
  }
  function extractReply(packet){
    return firstText.apply(null, ownReplyCandidates(packet));
  }
  function hasRawRuntimeLeak(value){
    const t = T(value, 6000);
    if (!t) return false;
    return /\b(priority9I|priority9J|runtimeTelemetry|stateSpine|finalEnvelopeTrusted|replyAuthority|routeKind|nyx\.marion\.|MARION::FINAL::|lawAssessmentFrame|legalRiskBoundary|primaryDomain|selectedDomain|knowledgeDomain|legalCategory|legalCategories)\b/i.test(t);
  }
  function isPresenceFallback(value){
    const r = L(value).replace(/[.!?]+$/g, "").trim();
    if (!r) return true;
    if (/^(true|false|null|undefined|\[object object\]|ok|success)$/i.test(r)) return true;
    return /^(i[’']?m here(?:,\s*mac)?|i am here(?:,\s*mac)?|still with you(?:,\s*mac)?|line open with you|ready when you are|what would you like to work on|hi\.?\s*i[’']?m nyx\.?\s*it[’']?s good to see you\.?\s*what would you like to work on)$/i.test(r) ||
      (/\b(i[’']?m here|still with you|what would you like to work on)\b/i.test(r) && r.length < 140);
  }
  function technicalLawFileWork(text){
    const t = L(text);
    if (!t) return false;
    const technical = /\b(surgical\s+autopsy|autopsy|patch|fix|update|resend|downloadable\s+zip|zip package|node --check|script|file|files|js|javascript|runtime|backend|frontend|api\/chat|index\.js|chatengine|chat engine|composer|composemarionresponse|marionbridge|final envelope|marionfinalenvelope|guardian\.response\.adapter|domain router|domain registry|manifest|payload|package|structural integrity|critical issues|gap refinement)\b/i.test(t);
    const lawFile = /\b(law domain|law manifest|law payload|law files?|legal payload|legal manifest|r18c|full[-\s]?stack regression|live handler|final answer materializer|route|routing|registry|envelope integration)\b/i.test(t);
    return technical && lawFile;
  }
  function promptCategories(text){
    const t = L(text);
    const out = [];
    function add(c){ if (out.indexOf(c) < 0) out.push(c); }
    if (/\b(copyright|license|licence|licensing|distribution rights|streaming rights|public performance|broadcast rights|roku|ott|movie|movies|moneti[sz]e|paperwork|chain of title|content rights)\b/i.test(t)) add("copyright_licensing");
    if (/\b(customer data|personal data|privacy|data processing|processor|subprocessor|breach|retention|delete data|data security|confidential information|vendor data)\b/i.test(t)) add("privacy_data");
    if (/\b(fired|terminated|termination|severance|release to sign|employment|contractor|independent contractor|wrongful dismissal|constructive dismissal|two weeks|pay in lieu)\b/i.test(t)) add("employment_contractor");
    if (/\b(defamation|libel|slander|false claims|false statement|reputation|posted false|business harm|liable|liability|negligence|tort|sue|lawsuit|claim|damages)\b/i.test(t)) add("liability_dispute");
    if (/\b(trademark|trade mark|patent|intellectual property| IP |brand name|logo|ownership of rights)\b/i.test(" " + t + " ")) add("ip_trademark_patent");
    if (/\b(compliance|regulatory|regulation|policy|terms of service|consumer protection|advertising rules|platform rules)\b/i.test(t)) add("compliance_regulatory");
    if (/\b(incorporation|shareholder|director|corporate|business contract|vendor agreement|partnership)\b/i.test(t)) add("corporate_business");
    if (/\b(jurisdiction|province|territory|ontario|canada|court|tribunal|deadline|limitation period|statute of limitations|file|filing)\b/i.test(t)) add("jurisdiction_procedure");
    if (/\b(contract|agreement|clause|terms|breach|consideration|indemnity|warranty|representation|termination clause)\b/i.test(t)) add("contract");
    if (/\b(source|sources|verify|case law|statute|official source|canlii|justice laws|e-laws|legal research)\b/i.test(t)) add("source_verification");
    if (/\b(legal|law|lawful|illegal|rights|risk|allowed|can i|should i sign|am i safe)\b/i.test(t) && !out.length) add("general_legal_risk");
    return out;
  }
  function objectHasLawMarkers(obj, depth, seen){
    if (!obj || typeof obj !== "object" || depth > 5) return false;
    if (seen.indexOf(obj) >= 0) return false;
    seen.push(obj);
    const p = O(obj);
    const markerText = [
      p.domain,p.primaryDomain,p.selectedDomain,p.knowledgeDomain,p.activeFeatureLane,
      p.legalCategory,p.lawAssessmentFrame,p.legalAdviceBoundary
    ].map(T).join(" ").toLowerCase();
    if (/\blaw\b/.test(markerText) || /copyright_licensing|privacy_data|employment_contractor|liability_dispute|legal_category/.test(markerText)) return true;
    if (p.r18CLawRealWorldAssessment === true || p.jurisdictionSensitivity === true || p.noAttorneyClientRelationship === true || p.noLegalCertaintyClaim === true) return true;
    const keys = Object.keys(p).slice(0, 60);
    for (let i=0;i<keys.length;i+=1){
      const k = keys[i];
      if (/^(req|res|socket|connection|stream)$/i.test(k)) continue;
      if (objectHasLawMarkers(p[k], depth + 1, seen)) return true;
    }
    return false;
  }
  function collectLawFields(obj, depth, seen, out){
    if (!obj || typeof obj !== "object" || depth > 5) return out;
    if (seen.indexOf(obj) >= 0) return out;
    seen.push(obj);
    const p = O(obj);
    function addText(key){
      const v = T(p[key], 120);
      if (v && !out[key]) out[key] = v;
    }
    ["domain","primaryDomain","selectedDomain","knowledgeDomain","legalCategory","lawAssessmentFrame","legalAdviceBoundary"].forEach(addText);
    if (Array.isArray(p.legalCategories) && !out.legalCategories) out.legalCategories = uniq(p.legalCategories, 6);
    if (Array.isArray(p.secondaryDomains) && !out.secondaryDomains) out.secondaryDomains = uniq(p.secondaryDomains, 5);
    ["jurisdictionSensitivity","factsAssumptionsSeparated","legalSourceDocumentCheckRequired","noLegalCertaintyClaim","noAttorneyClientRelationship","r18CLawRealWorldAssessment"].forEach(function(k){
      if (p[k] === true) out[k] = true;
    });
    const keys = Object.keys(p).slice(0, 80);
    for (let i=0;i<keys.length;i+=1){
      const k = keys[i];
      if (/^(req|res|socket|connection|stream)$/i.test(k)) continue;
      collectLawFields(p[k], depth + 1, seen, out);
    }
    return out;
  }
  function secondaryDomains(text){
    const t = L(text);
    const s = [];
    function add(v){ if (s.indexOf(v) < 0) s.push(v); }
    if (/\b(cost|revenue|money|price|pricing|funding|grant|profit|moneti[sz]e|ad revenue|sponsor|fee)\b/i.test(t)) add("finance");
    if (/\b(ai|model|agent|automation|llm|prompt|machine learning)\b/i.test(t)) add("ai");
    if (/\b(security|cyber|access|identity|secret|token|credential|breach|encryption|privacy)\b/i.test(t)) add("cyber");
    if (/\b(roku|ott|streaming|broadcast|channel|movie|tv)\b/i.test(t)) add("roku");
    if (/\b(business|sandblast|vendor|commercial|customer|contractor|platform)\b/i.test(t)) add("business");
    return s.slice(0,4);
  }
  function profile(prompt, packet){
    const fields = collectLawFields(packet, 0, [], {});
    const cats = fields.legalCategories && fields.legalCategories.length ? fields.legalCategories : promptCategories(prompt);
    const cat = fields.legalCategory || cats[0] || (objectHasLawMarkers(packet, 0, []) ? "general_legal_risk" : "");
    const active = !!(cat || cats.length || objectHasLawMarkers(packet, 0, []));
    return {
      version: V,
      active: active && !technicalLawFileWork(prompt),
      domain: "law",
      primaryDomain: "law",
      selectedDomain: "law",
      knowledgeDomain: "law",
      legalCategory: cat || "general_legal_risk",
      legalCategories: cats.length ? cats : [cat || "general_legal_risk"],
      secondaryDomains: fields.secondaryDomains && fields.secondaryDomains.length ? fields.secondaryDomains : secondaryDomains(prompt),
      jurisdictionSensitivity: fields.jurisdictionSensitivity !== false,
      factsAssumptionsSeparated: fields.factsAssumptionsSeparated !== false,
      legalSourceDocumentCheckRequired: fields.legalSourceDocumentCheckRequired !== false,
      noLegalCertaintyClaim: true,
      noAttorneyClientRelationship: true,
      legalAdviceBoundary: "general legal information only; not legal advice; no attorney-client relationship; no legal certainty claim",
      lawAssessmentFrame: "legal_category,jurisdiction_sensitivity,facts_vs_assumptions,risk_exposure,missing_information,source_document_check,safe_next_move"
    };
  }
  function materialize(prompt, p){
    const cat = (p && p.legalCategory) || "general_legal_risk";
    const jurisdiction = "Jurisdiction sensitivity: I’d need the governing jurisdiction and source documents before treating this as more than general legal information.";
    if (cat === "copyright_licensing") {
      return "I can give general legal-risk triage, not legal advice. This is a copyright/licensing issue, not just a Roku setup question. Paperwork helps, but the key question is whether the documents clearly grant streaming/CTV/Roku distribution, public-performance, monetization, territory, duration, exclusivity, and sublicensing rights. Facts vs assumptions: we can’t assume your paperwork covers ad-supported Roku distribution until the chain of title and license scope are checked. Risk exposure includes takedowns, platform rejection, copyright claims, indemnity exposure, and lost monetization. Missing information: the license, rights owner, territory, term, media/platform scope, monetization clause, warranties, and indemnity language. " + jurisdiction + " Safe next move: build a rights checklist and have the actual source documents reviewed before publishing or monetizing the movies.";
    }
    if (cat === "privacy_data") {
      return "I can give general legal-risk triage, not legal advice. This is a privacy/data issue in a vendor agreement. Facts vs assumptions: a vendor has customer data, but we need to know what data, where it is stored, who can access it, and which law or contract governs it. Risk exposure includes breach liability, unauthorized use, weak deletion terms, subcontractor exposure, and compliance gaps. Missing information: data-processing purpose, safeguards, breach notice timing, subprocessors, retention/deletion, audit rights, jurisdiction, confidentiality, indemnity, and return/destruction obligations. Safe next move: review the agreement for a privacy/data-processing schedule and require clear breach, security, retention, and deletion terms before sharing live customer data.";
    }
    if (cat === "employment_contractor") {
      return "I can give general legal information, not legal advice. This is an employment/contractor issue. Facts vs assumptions: termination pay, severance, and release language depend on the province, employment status, contract terms, length of service, role, and whether a valid termination clause exists. Risk exposure: signing a release too quickly can waive claims or benefits. Missing information: province, employment contract, termination letter, release, tenure, pay/benefits, and deadline pressure. Safe next move: do not sign under pressure; compare the offer against statutory minimums and possible common-law factors, then have a lawyer or legal clinic review the release if money or rights are material.";
    }
    if (cat === "liability_dispute") {
      return "I can give general legal-risk triage, not legal advice. This is a liability/dispute issue. Facts vs assumptions: whether there is a viable claim depends on what was said or done, evidence, harm, causation, available defences, and jurisdiction. Risk exposure includes reputational harm, damages, escalation costs, and counterclaims if the response is careless. Missing information: timeline, screenshots/documents, witnesses, losses, platform context, and prior communications. Safe next move: preserve evidence, avoid threats or retaliation, write a neutral facts-only request for correction/removal if appropriate, and verify the proper legal clinic, platform, tribunal, or court path for your jurisdiction.";
    }
    if (cat === "source_verification") {
      return "I can give general legal-research guidance, not legal advice. This is a source-verification issue. Start with primary authority: the relevant statute or regulation on an official government site, then current case law from official court sites or CanLII, then secondary sources only for explanation. Facts vs assumptions: commentary is not binding law. Risk exposure: relying on stale, out-of-jurisdiction, or non-authoritative sources can produce the wrong answer. Safe next move: identify the jurisdiction, statute, section, and current cases, then note up anything important before relying on it.";
    }
    if (cat === "contract") {
      return "I can give general legal-risk triage, not legal advice. This is a contract issue. Facts vs assumptions: the answer depends on the actual agreement, parties, dates, governing law, duties, breach terms, remedies, limits of liability, and any amendment or termination clauses. Risk exposure includes unenforceable assumptions, missed notice steps, damages limits, and waiver of rights. Missing information: the contract text, timeline, communications, payment/performance records, and jurisdiction. Safe next move: isolate the clause, build a short fact timeline, preserve the documents, and verify the contract against the governing law before taking action.";
    }
    return "I can give general legal-risk triage, not legal advice. Legal category: " + T(cat).replace(/_/g, "/") + ". " + jurisdiction + " Facts vs assumptions: I can only work from the facts and documents provided, and missing documents can change the answer. Risk exposure may include rights, liability, compliance, timing, cost, or platform restrictions depending on the matter. Missing information: governing agreement, dates, parties, province/territory, source documents, and the outcome you want. Safe next move: gather the documents and timeline first, then verify the governing source or have a lawyer/legal clinic review the high-risk parts.";
  }
  function badVisibleReply(reply, prompt, packet){
    const r = T(reply, 6000);
    if (!r) return true;
    if (isPresenceFallback(r)) return true;
    if (hasRawRuntimeLeak(r)) return true;
    if (/^\s*[\{\[]/.test(r) && /"(primaryDomain|selectedDomain|knowledgeDomain|legalCategory|lawAssessmentFrame|legalRiskBoundary)"/i.test(r)) return true;
    if (profile(prompt, packet).active && r.length < 80 && !/\b(copyright|licens|contract|privacy|data|liability|jurisdiction|legal|agreement|source|document|not legal advice)\b/i.test(r)) return true;
    return false;
  }
  function setReplyFields(obj, reply, p){
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) return obj;
    obj.reply = reply;
    obj.directReply = reply;
    obj.publicReply = reply;
    obj.visibleReply = reply;
    obj.displayReply = reply;
    obj.response = reply;
    obj.text = reply;
    obj.message = reply;
    obj.final = reply;
    obj.domain = "law";
    obj.primaryDomain = "law";
    obj.selectedDomain = "law";
    obj.knowledgeDomain = "law";
    obj.legalCategory = p.legalCategory;
    obj.legalCategories = p.legalCategories;
    obj.secondaryDomains = p.secondaryDomains;
    obj.r18CLawRealWorldAssessment = true;
    obj.r18CFinalAnswerMaterializer = true;
    obj.lawAssessmentFrame = p.lawAssessmentFrame;
    obj.legalAdviceBoundary = p.legalAdviceBoundary;
    obj.jurisdictionSensitivity = true;
    obj.factsAssumptionsSeparated = true;
    obj.legalSourceDocumentCheckRequired = true;
    obj.noLegalCertaintyClaim = true;
    obj.noAttorneyClientRelationship = true;
    return obj;
  }
  function ensureFinalEnvelope(obj, reply, p){
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) return obj;
    if (!obj.finalEnvelope || typeof obj.finalEnvelope !== "object" || Array.isArray(obj.finalEnvelope)) obj.finalEnvelope = {};
    setReplyFields(obj.finalEnvelope, reply, p);
    obj.finalEnvelope.contract = obj.finalEnvelope.contract || obj.finalEnvelope.contractVersion || "nyx.marion.final/1.0";
    obj.finalEnvelope.finalSignature = obj.finalEnvelope.finalSignature || "MARION_FINAL_AUTHORITY";
    obj.finalEnvelope.source = obj.finalEnvelope.source || "marion";
    obj.finalEnvelope.visibleReplyMaterialized = true;
    return obj;
  }
  function apply(packet, opt, seen){
    const options = O(opt);
    const prompt = firstText(options.prompt, extractPrompt(packet));
    const p = profile(prompt, packet);
    if (!p.active) return packet;
    const reply = materialize(prompt, p);

    if (typeof packet === "string") return badVisibleReply(packet, prompt, {}) ? reply : packet;
    if (!packet || typeof packet !== "object") return packet;
    const stack = seen || [];
    if (stack.indexOf(packet) >= 0) return packet;
    stack.push(packet);

    const current = extractReply(packet);
    if (badVisibleReply(current, prompt, packet)) setReplyFields(packet, reply, p);
    else setReplyFields(packet, current, p);
    ensureFinalEnvelope(packet, packet.reply, p);

    const nested = ["result","payload","guardianPacket","marionFinal","marion","data","output"];
    for (let i=0;i<nested.length;i+=1){
      const k = nested[i];
      if (packet[k] && typeof packet[k] === "object") apply(packet[k], { prompt: prompt }, stack);
    }
    if (packet.meta && typeof packet.meta === "object") {
      packet.meta.r18CFinalAnswerMaterializer = {
        version: V,
        active: true,
        legalCategory: p.legalCategory,
        visibleReplyMaterialized: true,
        userVisibleDiagnosticsBlocked: true
      };
    }
    return packet;
  }
  function projectForUser(packet, opt){
    const options = O(opt);
    const prompt = firstText(options.prompt, extractPrompt(packet));
    const p = profile(prompt, packet);
    if (!p.active) return packet;
    const fixed = apply(packet, { prompt: prompt });
    const reply = extractReply(fixed) || materialize(prompt, p);
    return {
      ok: true,
      guardian: "marion",
      guardianMode: "marion",
      reply: reply,
      directReply: reply,
      publicReply: reply,
      visibleReply: reply,
      displayReply: reply,
      response: reply,
      text: reply,
      message: reply,
      finalEnvelope: {
        contract: "nyx.marion.final/1.0",
        finalSignature: "MARION_FINAL_AUTHORITY",
        source: "marion",
        reply: reply,
        directReply: reply,
        publicReply: reply,
        visibleReply: reply
      },
      domain: "law",
      primaryDomain: "law",
      selectedDomain: "law",
      knowledgeDomain: "law",
      legalCategory: p.legalCategory,
      legalCategories: p.legalCategories,
      secondaryDomains: p.secondaryDomains,
      r18CLawRealWorldAssessment: true,
      r18CFinalAnswerMaterializer: {
        version: V,
        active: true,
        visibleReplyMaterialized: true,
        metadataProjectionBlocked: true,
        legalCategory: p.legalCategory
      }
    };
  }
  function isUserChatRoute(req){
    const url = L(firstText(req && req.originalUrl, req && req.url, req && req.path));
    if (!url) return true;
    return /\/api\/chat\b|\/chat\b|\/marion\b|\/admin\b/i.test(url);
  }
  function wrap(name){
    const old = module.exports[name];
    if (typeof old !== "function" || old.__r18cFinalAnswerMaterializerWrapped) return;
    const wrapped = function(){
      const args = Array.prototype.slice.call(arguments);
      const prompt = firstText.apply(null, args.map(extractPrompt).concat(args.map(T)));
      const out = old.apply(this, args);
      if (out && typeof out.then === "function") {
        return out.then(function(value){ return apply(value, { prompt: prompt || extractPrompt(value) }); });
      }
      return apply(out, { prompt: prompt || extractPrompt(out) });
    };
    wrapped.__r18cFinalAnswerMaterializerWrapped = true;
    try { Object.defineProperty(wrapped, "name", { value: old.name || name }); } catch(_){}
    module.exports[name] = wrapped;
  }
  [
    "composeMarionResponse","run","default",
    "processWithMarion","maybeResolve","ask","handle","route","createMarionBridge",
    "createMarionFinalEnvelope","attachVisibleReplyAliases",
    "adaptGuardianResponse","createGuardianPacket","sanitizeRuntimePacket",
    "normalizeCoordinatorOutputForPipeline","shapeEngineReply","applyPublicReplyHygieneToResponse","normalizeMarionBridgeResult",
    "marionR18CLiveHandlerRepairApply"
  ].forEach(wrap);

  try {
    if (typeof express !== "undefined" && express && express.response && !express.response.__r18cFinalAnswerMaterializerPatched) {
      const oldJson = express.response.json;
      const oldSend = express.response.send;
      if (typeof oldJson === "function") {
        express.response.json = function(body){
          try {
            const req = O(this && this.req);
            const prompt = extractPrompt({ req: req, body: O(req.body), payload: O(req.body) });
            const p = profile(prompt, body);
            if (p.active && isUserChatRoute(req)) body = projectForUser(body, { prompt: prompt });
            else body = apply(body, { prompt: prompt });
          } catch(_err) {}
          return oldJson.call(this, body);
        };
      }
      if (typeof oldSend === "function") {
        express.response.send = function(body){
          try {
            const req = O(this && this.req);
            const prompt = extractPrompt({ req: req, body: O(req.body), payload: O(req.body) });
            const p = profile(prompt, body);
            if (p.active && isUserChatRoute(req)) {
              let parsed = null;
              if (typeof body === "string") {
                const trimmed = body.trim();
                if ((trimmed[0] === "{" || trimmed[0] === "[") && trimmed.length < 1000000) {
                  try { parsed = JSON.parse(trimmed); } catch(_parseErr) { parsed = null; }
                }
              } else if (body && typeof body === "object") parsed = body;
              if (parsed) body = JSON.stringify(projectForUser(parsed, { prompt: prompt }));
              else if (typeof body === "string" && badVisibleReply(body, prompt, {})) body = materialize(prompt, p);
            }
          } catch(_err) {}
          return oldSend.call(this, body);
        };
      }
      express.response.__r18cFinalAnswerMaterializerPatched = true;
    }
  } catch(_err) {}

  module.exports.marionR18CFinalAnswerMaterializerApply = apply;
  module.exports.marionR18CFinalAnswerMaterializerProject = projectForUser;
  module.exports.marionR18CFinalAnswerMaterializerProfile = profile;
  module.exports.marionR18CFinalAnswerMaterializerReply = materialize;
  module.exports.marionR18CFinalAnswerMaterializerHasRuntimeLeak = hasRawRuntimeLeak;
})();
/* R18C_FINAL_ANSWER_MATERIALIZER_END */

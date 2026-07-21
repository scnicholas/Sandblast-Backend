"use strict";

/**
 * Marion current-turn authority boundary.
 *
 * Keeps private Marion turns bound to the user's current text while preserving
 * Nyx public routes and all legitimate domain lanes. Internal version strings,
 * diagnostics, prior final envelopes, and stale state must never classify a
 * fresh turn.
 */
const VERSION = "nyx.marion.currentTurnAuthority/1.0";
const MAX_DEPTH = 7;
const MAX_KEYS = 160;

function isObj(value) { return !!value && typeof value === "object" && !Array.isArray(value); }
function text(value, max = 8000) {
  if (value == null) return "";
  try {
    const out = typeof value === "string" ? value : String(value);
    return out.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
  } catch (_) { return ""; }
}
function lower(value) { return text(value).toLowerCase().replace(/[’‘]/g, "'"); }
function firstText() {
  for (let i = 0; i < arguments.length; i += 1) {
    const value = text(arguments[i]);
    if (value) return value;
  }
  return "";
}
function safeGet(obj, key) { try { return obj && obj[key]; } catch (_) { return undefined; } }
function safeShallowObject(value) {
  const out = {};
  if (!isObj(value)) return out;
  let keys = [];
  try { keys = Object.keys(value).slice(0, MAX_KEYS); } catch (_) { return out; }
  for (const key of keys) {
    try { out[key] = value[key]; } catch (_) {}
  }
  return out;
}

function extractCurrentText(input) {
  if (typeof input === "string") return text(input);
  const src = isObj(input) ? input : {};
  const body = isObj(safeGet(src, "body")) ? src.body : {};
  const payload = isObj(safeGet(src, "payload")) ? src.payload : {};
  const turn = isObj(safeGet(src, "turn")) ? src.turn : {};
  const command = isObj(safeGet(src, "command")) ? src.command : {};
  return firstText(
    safeGet(src, "rawUserText"), safeGet(src, "userText"), safeGet(src, "transcript"),
    safeGet(src, "prompt"), safeGet(src, "query"), safeGet(src, "text"), safeGet(src, "message"),
    safeGet(src, "normalizedUserIntent"), safeGet(src, "effectivePrompt"),
    safeGet(body, "rawUserText"), safeGet(body, "userText"), safeGet(body, "transcript"),
    safeGet(body, "prompt"), safeGet(body, "query"), safeGet(body, "text"), safeGet(body, "message"),
    safeGet(payload, "rawUserText"), safeGet(payload, "userText"), safeGet(payload, "transcript"),
    safeGet(payload, "prompt"), safeGet(payload, "query"), safeGet(payload, "text"), safeGet(payload, "message"),
    safeGet(turn, "rawUserText"), safeGet(turn, "userText"), safeGet(turn, "prompt"), safeGet(turn, "text"), safeGet(turn, "message"),
    safeGet(command, "rawUserText"), safeGet(command, "userText"), safeGet(command, "prompt"), safeGet(command, "text"), safeGet(command, "message")
  );
}

function contextPath(input) {
  const src = isObj(input) ? input : {};
  const meta = isObj(src.meta) ? src.meta : {};
  return lower(firstText(src.route, src.path, src.originalUrl, src.url, meta.route, meta.path));
}

function isPrivateMarionContext(input) {
  const src = isObj(input) ? input : {};
  const body = isObj(src.body) ? src.body : {};
  const payload = isObj(src.payload) ? src.payload : {};
  const meta = isObj(src.meta) ? src.meta : {};
  const flags = [src, body, payload, meta];
  if (flags.some((o) => o.privateAdminConversation === true || o.marionAdminConversation === true ||
    o.directMarionAdminInterface === true || o.adminVerified === true || o.authenticatedOperator === true ||
    o.privateTextDelivery === true || o.adminOnlyTextDelivery === true)) return true;
  const lane = lower(firstText(src.lane, src.sessionLane, body.lane, payload.lane, meta.lane));
  const audience = lower(firstText(src.audience, body.audience, payload.audience, meta.audience));
  const source = lower(firstText(src.source, src.inputChannel, body.source, body.inputChannel, payload.source, payload.inputChannel));
  const path = contextPath(src);
  return /^(private|admin|operator|marion_private|marion_admin)/.test(lane) || audience === "operator" ||
    /marion-admin|marion_admin|admin_text/.test(source) || path.startsWith("/api/private/marion/") ||
    path.startsWith("/private/marion/") || path === "/api/marion/admin/conversation" || path === "/marion/admin/conversation";
}

function isIsolatedTurn(input) {
  const src = isObj(input) ? input : {};
  const body = isObj(src.body) ? src.body : {};
  const payload = isObj(src.payload) ? src.payload : {};
  const session = isObj(src.session) ? src.session : {};
  const nodes = [src, body, payload, session];
  return nodes.some((o) => o.newSession === true || o.isolatedTestSession === true || o.isolatedSession === true ||
    o.resetSession === true || o.resetMemory === true || o.clearMemory === true || o.freshSession === true ||
    lower(o.sessionMode) === "isolated" || lower(o.mode) === "isolated_test");
}

function classifyCurrentTurn(input) {
  const raw = extractCurrentText(input);
  const n = lower(raw).replace(/[.!?,;:]+/g, " ").replace(/\s+/g, " ").trim();
  const greeting = /^(?:hi|hello|hey|hiya|yo|morning|evening|good morning|good afternoon|good evening)(?:\s+(?:there|marion|mac))?$/.test(n) ||
    /^(?:hi|hello|hey|good morning|good afternoon|good evening)\s+marion\b/.test(n);
  const checkin = /^(?:marion\s+)?(?:how are you|how are you doing|how's it going|how is it going|you okay|are you okay|you good|are you alright)(?:\s+marion)?$/.test(n);
  const presence = /^(?:marion\s+)?(?:are you there|you there|are you with me|you with me|still there|still with me|can you hear me|are we connected|you online)(?:\s+marion)?$/.test(n);
  const lawSignal = /\b(?:law|legal|lawyer|attorney|court|tribunal|lawsuit|sue|liability|negligence|damages|indemnity|contract|agreement|nda|clause|breach|copyright|licen[cs]e|licensing|trademark|patent|jurisdiction|statute|regulation|compliance|privacy law|employment law|severance|wrongful dismissal|defamation|legal risk)\b/.test(n);
  const technical = /\b(?:bug|error|stack trace|endpoint|router|routing|index\.js|javascript|node|runtime|bridge|final envelope|state spine|chat engine|surgical autopsy|patch|hotfix|syntax)\b/.test(n);
  const technicalFileWork = technical && /\b(?:file|files|router|routing|index\.js|javascript|node|runtime|bridge|final envelope|state spine|chat engine|script|code|payload|manifest|module|function|syntax|patch|hotfix|autopsy)\b/.test(n);
  const law = lawSignal && !technicalFileWork;
  const kind = checkin ? "social_checkin" : presence ? "presence_check" : greeting ? "greeting" : technicalFileWork ? "technical" : law ? "law" : technical ? "technical" : "standard";
  return { raw, normalized: n, kind, greeting, checkin, presence, anchor: greeting || checkin || presence, law, lawSignal, technical, technicalFileWork };
}

const STALE_KEYS = /^(?:domain|requestedDomain|primaryDomain|selectedDomain|knowledgeDomain|intent|subIntent|routing|routeLock|domainConfidence|domainConcierge|domainConciergeSeed|r18c.*|legal.*|law.*|activeFeatureLane|currentObjective|nextAction|finalEnvelope|marionFinal|lastAssistantReply|lastReply|previousReply|replyHistory|recentReplies|memoryPatch|sessionPatch|stateSpine|conversationState)$/i;
function scrubCarry(value, depth = 0, seen = new WeakSet()) {
  if (value == null || depth > MAX_DEPTH) return value;
  if (typeof value !== "object") return value;
  try { if (seen.has(value)) return "[Circular]"; seen.add(value); } catch (_) { return {}; }
  if (Array.isArray(value)) return value.slice(0, 40).map((v) => scrubCarry(v, depth + 1, seen));
  const out = {};
  let keys = [];
  try { keys = Object.keys(value).slice(0, MAX_KEYS); } catch (_) { return out; }
  for (const key of keys) {
    if (STALE_KEYS.test(key)) continue;
    let item;
    try { item = value[key]; } catch (_) { continue; }
    out[key] = scrubCarry(item, depth + 1, seen);
  }
  return out;
}

function applyPreparedFields(node, current, isolated) {
  if (!isObj(node)) return node;
  const out = safeShallowObject(node);
  const raw = current.raw;
  if (raw) {
    out.rawUserText = raw;
    out.userText = raw;
    out.prompt = raw;
    out.query = raw;
    out.text = raw;
    out.message = raw;
  }
  if (isolated) {
    out.previousMemory = {};
    out.memory = {};
    out.turnMemory = {};
    out.state = {};
  } else if (current.anchor) {
    if (isObj(out.previousMemory)) out.previousMemory = scrubCarry(out.previousMemory);
    if (isObj(out.memory)) out.memory = scrubCarry(out.memory);
    if (isObj(out.turnMemory)) out.turnMemory = scrubCarry(out.turnMemory);
    if (isObj(out.state)) out.state = scrubCarry(out.state);
  }
  if (current.anchor) {
    out.domain = "general";
    out.requestedDomain = "general";
    out.intent = current.checkin ? "social_checkin" : current.presence ? "presence_check" : "simple_chat";
    out.marionIntent = {
      ...(isObj(out.marionIntent) ? scrubCarry(out.marionIntent) : {}),
      activate: false,
      intent: out.intent,
      subIntent: current.kind,
      confidence: 1,
      source: "current_turn_authority"
    };
    out.staleCarryBypass = true;
    out.currentTurnAuthoritative = true;
  }
  out.currentTurnAuthorityVersion = VERSION;
  out.currentTurnClass = current.kind;
  return out;
}

function prepareInput(input) {
  if (!isObj(input)) return input;
  const current = classifyCurrentTurn(input);
  const privateContext = isPrivateMarionContext(input);
  if (!privateContext) return input;
  const isolated = isIsolatedTurn(input);
  let out = applyPreparedFields(input, current, isolated);
  for (const key of ["body", "payload", "session", "meta"]) {
    if (isObj(out[key])) out[key] = applyPreparedFields(out[key], current, isolated);
  }
  out.privateAdminConversation = out.privateAdminConversation !== false;
  out.currentTurnAuthority = { version: VERSION, kind: current.kind, isolated, currentText: current.raw };
  return out;
}

function cleanLawMetadata(node, depth = 0, seen = new WeakSet()) {
  if (!isObj(node) || depth > MAX_DEPTH) return node;
  try { if (seen.has(node)) return node; seen.add(node); } catch (_) { return node; }
  const out = safeShallowObject(node);
  for (const key of Object.keys(out)) {
    if (/^(?:r18c.*|legal.*|lawAssessment.*|lawCrossDomain.*)$/i.test(key)) { delete out[key]; continue; }
    if (["routing", "marionIntent", "meta", "payload", "finalEnvelope", "packet", "synthesis", "result", "stateSpinePatch", "sessionPatch", "memoryPatch"].includes(key) && isObj(out[key])) {
      out[key] = cleanLawMetadata(out[key], depth + 1, seen);
    }
  }
  return out;
}

function intendedIntent(current) {
  return current.checkin ? "social_checkin" : current.presence ? "presence_check" : "simple_chat";
}

function enforceRouterResult(result, input) {
  const current = classifyCurrentTurn(input);
  const enforce = current.anchor || current.technicalFileWork;
  if (!isPrivateMarionContext(input) || !enforce || current.law || !isObj(result)) return result;
  const out = cleanLawMetadata(result);
  const intent = current.technicalFileWork ? "technical_debug" : intendedIntent(current);
  const domain = current.technicalFileWork ? "technical" : "general";
  out.ok = out.ok !== false;
  out.marionIntent = {
    ...(isObj(out.marionIntent) ? out.marionIntent : {}),
    activate: false,
    intent,
    subIntent: current.kind,
    confidence: 1,
    reason: "current_turn_anchor_precedence",
    knowledgeDomain: "",
    knowledgeDomainExplicit: false,
    secondaryDomains: [],
    routeLock: true,
    noCrossDomainBleed: true
  };
  out.routing = {
    ...(isObj(out.routing) ? out.routing : {}),
    domain,
    primaryDomain: domain,
    selectedDomain: domain,
    knowledgeDomain: "",
    intent,
    subIntent: current.kind,
    mode: "private_conversation",
    depth: "relational",
    routeLock: true,
    routeAmbiguous: false,
    routeFailClosed: false,
    secondaryDomains: [],
    noCrossDomainBleed: true,
    currentTurnAuthorityVersion: VERSION
  };
  out.domain = domain;
  out.primaryDomain = domain;
  out.selectedDomain = domain;
  out.intent = intent;
  out.currentTurnAuthorityVersion = VERSION;
  out.currentTurnClass = current.kind;
  return out;
}

function replyFrom(value) {
  if (typeof value === "string") return text(value);
  if (!isObj(value)) return "";
  const p = isObj(value.payload) ? value.payload : {};
  const f = isObj(value.finalEnvelope) ? value.finalEnvelope : {};
  return firstText(value.directReply, value.visibleReply, value.displayReply, value.finalReply, value.reply,
    value.answer, value.response, value.text, value.message, f.reply, f.text, f.spokenText, p.reply, p.text, p.message);
}

function anchorReply(current) {
  if (current.technicalFileWork) return "Technical routing preserved: this is code and runtime work, not a user-facing legal-advice request. I’ll keep the analysis on the router, state carry, final envelope, and transport behavior.";
  if (current.checkin) return "I’m doing well, Mac. I’m here, focused, and with you. How are you doing?";
  if (current.presence) return "I’m here, Mac. I’m with you.";
  const n = current.normalized;
  if (/\bgood morning\b|^morning\b/.test(n)) return "Good morning, Mac. I’m here with you.";
  if (/\bgood afternoon\b/.test(n)) return "Good afternoon, Mac. I’m here with you.";
  if (/\bgood evening\b|^evening\b/.test(n)) return "Good evening, Mac. I’m here with you.";
  if (/^hey\b/.test(n)) return "Hey, Mac. I’m here with you.";
  return "Hello, Mac. I’m here with you.";
}

function isMismatchedAnchorReply(reply, current) {
  const r = lower(reply);
  if (!r) return true;
  if (/\b(?:legal-risk|not legal advice|contract risk|jurisdiction matters|copyright\/licensing|law assessment|r18c|final envelope missing|diagnostic packet|runtime error|route unavailable)\b/.test(r)) return true;
  if (current.technicalFileWork && /\b(?:law assessment|legal category|legal-risk|not legal advice|jurisdiction sensitivity)\b/.test(r)) return true;
  if (current.greeting && !/\b(?:hello|hi|hey|morning|afternoon|evening|i'm here|i am here|here with you)\b/.test(r)) return true;
  if (current.checkin && !/\b(?:i'm|i am|doing|well|good|steady|here)\b/.test(r)) return true;
  if (current.presence && !/\b(?:here|with you|connected|present)\b/.test(r)) return true;
  return false;
}

function setReplyAliases(out, reply) {
  for (const key of ["reply", "directReply", "visibleReply", "displayReply", "finalReply", "publicReply", "answer", "response", "text", "message", "output", "spokenText"]) out[key] = reply;
  return out;
}

function enforceResult(result, input) {
  const current = classifyCurrentTurn(input);
  const enforce = current.anchor || current.technicalFileWork;
  if (!isPrivateMarionContext(input) || !enforce || current.law) return result;
  const intent = current.technicalFileWork ? "technical_debug" : intendedIntent(current);
  const domain = current.technicalFileWork ? "technical" : "general";
  if (typeof result === "string") return isMismatchedAnchorReply(result, current) ? anchorReply(current) : result;
  if (!isObj(result)) return result;
  let out = cleanLawMetadata(result);
  let reply = replyFrom(out);
  if (isMismatchedAnchorReply(reply, current)) reply = anchorReply(current);
  out = setReplyAliases(out, reply);
  out.ok = out.ok !== false;
  out.final = true;
  out.marionFinal = true;
  out.handled = true;
  out.awaitingMarion = false;
  out.domain = domain;
  out.primaryDomain = domain;
  out.selectedDomain = domain;
  out.intent = intent;
  out.finalEnvelope = setReplyAliases({ ...(isObj(out.finalEnvelope) ? out.finalEnvelope : {}) }, reply);
  Object.assign(out.finalEnvelope, {
    final: true, marionFinal: true, handled: true, domain, intent,
    source: out.finalEnvelope.source || "marion", authority: out.finalEnvelope.authority || "marionFinalEnvelope",
    contractVersion: out.finalEnvelope.contractVersion || "nyx.marion.final/1.0",
    currentTurnAuthorityVersion: VERSION, currentTurnClass: current.kind
  });
  out.payload = setReplyAliases({ ...(isObj(out.payload) ? out.payload : {}) }, reply);
  Object.assign(out.payload, { final: true, marionFinal: true, handled: true, domain, intent });
  out.routing = {
    ...(isObj(out.routing) ? out.routing : {}), domain, primaryDomain: domain,
    selectedDomain: domain, knowledgeDomain: "", intent, subIntent: current.kind,
    routeLock: true, routeAmbiguous: false, currentTurnAuthorityVersion: VERSION
  };
  out.meta = {
    ...(isObj(out.meta) ? out.meta : {}), currentTurnAuthorityVersion: VERSION,
    currentTurnClass: current.kind, currentTurnText: current.raw, staleCarryRejected: true
  };
  out.currentTurnAuthorityVersion = VERSION;
  out.currentTurnClass = current.kind;
  return out;
}

function scrubStateForCurrentTurn(state, input) {
  const current = classifyCurrentTurn(input);
  const enforce = current.anchor || current.technicalFileWork;
  if (!isPrivateMarionContext(input) || !enforce || !isObj(state)) return state;
  const out = cleanLawMetadata(state);
  const domain = current.technicalFileWork ? "technical" : "general";
  out.domain = domain;
  out.primaryDomain = domain;
  out.selectedDomain = domain;
  out.knowledgeDomain = "";
  out.intent = current.technicalFileWork ? "technical_debug" : intendedIntent(current);
  out.currentTurnAuthorityVersion = VERSION;
  out.currentTurnClass = current.kind;
  return out;
}

function prepareArgumentList(args) {
  const arr = Array.from(args || []);
  let contextIndex = -1;
  for (let i = 0; i < arr.length; i += 1) {
    if (isObj(arr[i]) && isPrivateMarionContext(arr[i]) && extractCurrentText(arr[i])) { contextIndex = i; break; }
  }
  if (contextIndex < 0) {
    for (let i = 0; i < arr.length; i += 1) {
      if (isObj(arr[i]) && extractCurrentText(arr[i])) { contextIndex = i; break; }
    }
  }
  if (contextIndex < 0 && isObj(arr[0])) contextIndex = 0;
  if (contextIndex >= 0) {
    const prepared = prepareInput(arr[contextIndex]);
    arr[contextIndex] = prepared;
    const current = classifyCurrentTurn(prepared);
    if (current.anchor) {
      for (let i = 0; i < arr.length; i += 1) {
        if (i !== contextIndex && isObj(arr[i])) arr[i] = applyPreparedFields(arr[i], current, isIsolatedTurn(prepared));
      }
    }
  }
  return { args: arr, input: contextIndex >= 0 ? arr[contextIndex] : {} };
}

module.exports = {
  VERSION,
  extractCurrentText,
  classifyCurrentTurn,
  isPrivateMarionContext,
  isIsolatedTurn,
  prepareInput,
  prepareArgumentList,
  scrubCarry,
  enforceRouterResult,
  enforceResult,
  scrubStateForCurrentTurn,
  replyFrom,
  anchorReply,
  isMismatchedAnchorReply
};

"use strict";

/**
 * Marion current-turn and immediate-continuation authority boundary.
 *
 * Scope:
 * - Private Marion/admin conversation only.
 * - Public Nyx surfaces are a strict no-op.
 * - Current explicit text outranks all remembered domains.
 * - Short follow-ups inherit only the immediately preceding accepted turn.
 * - New/isolated sessions cannot inherit an older lane.
 */
const VERSION = "nyx.marion.currentTurnAuthority/4.0-long-thread-progression";
const CONTINUITY_CONTRACT = "nyx.marion.longThreadProgression/3.0";
const MAX_DEPTH = 7;
const MAX_KEYS = 180;
const MAX_ARRAY = 48;
const MAX_TEXT = 8000;

function isObj(value) { return !!value && typeof value === "object" && !Array.isArray(value); }
function safeGet(obj, key) { try { return obj && obj[key]; } catch (_) { return undefined; } }
function text(value, max = MAX_TEXT) {
  if (value == null) return "";
  try {
    const out = typeof value === "string" ? value : String(value);
    return out.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
  } catch (_) { return ""; }
}
function lower(value) { return text(value).toLowerCase().replace(/[’‘]/g, "'"); }
function norm(value) {
  return lower(value).replace(/[“”]/g, '"').replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}
function firstText() {
  for (let i = 0; i < arguments.length; i += 1) {
    const value = text(arguments[i]);
    if (value) return value;
  }
  return "";
}
function safeKeys(value, limit = MAX_KEYS) {
  if (!isObj(value)) return [];
  try { return Object.keys(value).slice(0, limit); } catch (_) { return []; }
}
function shallow(value) {
  const out = {};
  for (const key of safeKeys(value)) {
    try { out[key] = value[key]; } catch (_) {}
  }
  return out;
}
function nowMs() { return Date.now(); }
function bounded(value, max = 900) { return text(value, max); }

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
    o.privateTextDelivery === true || o.adminOnlyTextDelivery === true ||
    o.passwordFreeTestChat === true || o.adminInterfaceScope === "marion_admin_conversation")) return true;
  const lane = lower(firstText(src.lane, src.sessionLane, body.lane, payload.lane, meta.lane));
  const audience = lower(firstText(src.audience, body.audience, payload.audience, meta.audience));
  const source = lower(firstText(src.source, src.inputChannel, body.source, body.inputChannel, payload.source, payload.inputChannel));
  const path = contextPath(src);
  return /^(private|admin|operator|marion_private|marion_admin)/.test(lane) || audience === "operator" ||
    /marion-admin|marion_admin|admin_text/.test(source) || path.startsWith("/api/private/marion/") ||
    path.startsWith("/private/marion/") || path === "/api/marion/admin/conversation" || path === "/marion/admin/conversation";
}

function isIsolatedContext(input) {
  const src = isObj(input) ? input : {};
  const body = isObj(src.body) ? src.body : {};
  const payload = isObj(src.payload) ? src.payload : {};
  const session = isObj(src.session) ? src.session : {};
  const nodes = [src, body, payload, session];
  return nodes.some((o) => o.isolatedTestSession === true || o.isolatedSession === true ||
    lower(o.sessionMode) === "isolated" || lower(o.mode) === "isolated_test" ||
    o.passwordFreeTestChat === true);
}

function isIsolatedTurn(input) {
  const src = isObj(input) ? input : {};
  const body = isObj(src.body) ? src.body : {};
  const payload = isObj(src.payload) ? src.payload : {};
  const session = isObj(src.session) ? src.session : {};
  const nodes = [src, body, payload, session];
  // "isolatedSession" identifies the private partition; it is not a reset signal
  // on every turn. Only explicit fresh/reset markers clear continuity.
  return nodes.some((o) => o.newSession === true || o.firstTurn === true ||
    o.resetSession === true || o.resetMemory === true || o.clearMemory === true ||
    o.freshSession === true || o.startNewSession === true);
}

function followupKind(value) {
  const n = norm(value);
  if (!n) return "";
  if (/^(?:go deeper|deeper|more depth|drill down|expand|expand that|unpack that|break that down|take that further)$/.test(n)) return "depth";
  if (/^(?:continue|keep going|carry on|go on|proceed|continue from there|from there|same thread|same lane|stay in lane)$/.test(n)) return "continue";
  if (/^(?:next|next step|next steps|what next|what now|whats next|then what|what comes next)$/.test(n)) return "next";
  if (/^(?:what should be fixed first|what do we fix first|which part should be fixed first|which part first|what is the first priority|whats the first priority|first priority|what should come first)$/.test(n)) return "priority";
  if (/^(?:why|why is that|why is that first|why is that the first priority|why does that come first|why does that matter|why is that important)$/.test(n)) return "reason";
  if (/^(?:what could break|what could break if we fix it incorrectly|what breaks if we fix it incorrectly|what can go wrong|what could go wrong|what is the failure mode|what are the failure modes)$/.test(n)) return "failure";
  if (/^(?:what is the safest implementation order|whats the safest implementation order|safest implementation order|what is the safest order|whats the safest order|safest order|implementation order|what order should we use|in what order|how should we implement it|how should this be implemented)$/.test(n)) return "order";
  if (/^(?:how do we validate that|how should we validate that|how do we test that|how should we test that|what is the validation step|whats the validation step|what test comes next|how do we confirm it worked)$/.test(n)) return "validation";
  if (/^(?:what is the main risk|whats the main risk|main risk|what are the risks|what is the risk now|risk now|update the risk|what changed|what changed now|pressure check|context check|final check)$/.test(n)) return "pressure";
  if (/^(?:what happens after that|what comes after that|what happens next|and after that|and then|then what happens)$/.test(n)) return "after";
  if (/^(?:what are the tradeoffs|what is the tradeoff|whats the tradeoff|what do we give up|what is the downside|whats the downside)$/.test(n)) return "tradeoff";
  if (/^(?:where exactly|which file|which function|which module|what line|where is the defect|where does it happen)$/.test(n)) return "location";
  if (/^(?:again|run that again|run it again|do that again|repeat that|same thing|rerun that)$/.test(n)) return "repeat";
  if (/^(?:slow down|one step at a time|take it slower)$/.test(n)) return "pace";
  if (/^(?:no not that|not that|stay on the architecture|stay with the architecture|wrong target)$/.test(n)) return "correction";
  return "";
}

function classifyCurrentTurn(input) {
  const raw = extractCurrentText(input);
  const n = norm(raw);
  const greeting = /^(?:hi|hello|hey|hiya|yo|morning|evening|good morning|good afternoon|good evening)(?:\s+(?:there|marion|mac))?$/.test(n) ||
    /^(?:hi|hello|hey|good morning|good afternoon|good evening)\s+marion\b/.test(n);
  const checkin = /^(?:marion\s+)?(?:how are you|how are you doing|hows it going|how is it going|you okay|are you okay|you good|are you alright)(?:\s+marion)?$/.test(n);
  const presence = /^(?:marion\s+)?(?:are you there|you there|are you with me|you with me|still there|still with me|can you hear me|are we connected|you online)(?:\s+marion)?$/.test(n);
  const fk = followupKind(raw);
  const lawSignal = /\b(?:law|legal|lawyer|attorney|court|tribunal|lawsuit|sue|liability|negligence|damages|indemnity|contract|agreement|nda|clause|breach|copyright|licen[cs]e|licensing|trademark|patent|jurisdiction|statute|regulation|compliance|privacy law|employment law|severance|wrongful dismissal|defamation|legal risk)\b/.test(n);
  const technical = /\b(?:bug|error|stack trace|endpoint|router|routing|index js|javascript|node|runtime|bridge|final envelope|state spine|chat engine|surgical autopsy|patch|hotfix|syntax|widget|backend|frontend|module|function|payload|manifest|code)\b/.test(n);
  const technicalFileWork = technical && /\b(?:file|files|router|routing|index js|javascript|node|runtime|bridge|final envelope|state spine|chat engine|script|code|payload|manifest|module|function|syntax|patch|hotfix|autopsy|widget|backend|frontend)\b/.test(n);
  const law = lawSignal && !technicalFileWork;
  const kind = checkin ? "social_checkin" : presence ? "presence_check" : greeting ? "greeting" :
    technicalFileWork ? "technical" : law ? "law" : technical ? "technical" : fk ? "short_followup" : "standard";
  return {
    raw, normalized: n, kind, greeting, checkin, presence,
    anchor: greeting || checkin || presence,
    shortFollowup: !!fk, followupKind: fk,
    law, lawSignal, technical, technicalFileWork
  };
}

function explicitDomainFromText(value) {
  const c = classifyCurrentTurn({ text: value });
  if (c.technicalFileWork || c.technical) return "technical";
  if (c.law) return "law";
  const n = c.normalized;
  if (/\b(?:business|revenue|sales|advertising|marketing|sponsor|monetize|strategy|funding)\b/.test(n)) return "business";
  if (/\b(?:sad|stressed|overwhelmed|anxious|hurt|alone|frustrated|panic|grief)\b/.test(n)) return "emotional";
  if (/\b(?:who are you|your role|identity|what are you)\b/.test(n)) return "identity";
  if (/\b(?:radio|song|music|playlist|artist|album)\b/.test(n)) return "music";
  if (/\b(?:roku|television|sandblast tv|channel)\b/.test(n)) return "roku";
  if (/\b(?:news|headline|article|synapse)\b/.test(n)) return "news";
  return "";
}

function objectText(obj, keys) {
  if (!isObj(obj)) return "";
  const vals = [];
  for (const key of keys) {
    const value = safeGet(obj, key);
    if (typeof value === "string" || typeof value === "number") {
      const t = bounded(value, 1800);
      if (t) vals.push(t);
    }
  }
  return firstText(...vals);
}

const USER_KEYS = ["rawUserText","userText","userQuery","prompt","query","inputText","input","message","text","lastUserText","lastPrompt","activePrompt","normalizedUserIntent"];
const REPLY_KEYS = ["lastAssistantReply","assistantReply","reply","finalReply","visibleReply","displayReply","directReply","answer","response","output","spokenText"];
const TOPIC_KEYS = ["lastTopic","activeTopic","topic","activeTask","currentTask","lastValidTask","currentObjective","regressionTarget","turnObjective","pendingAction"];
const DOMAIN_KEYS = ["domain","primaryDomain","selectedDomain","knowledgeDomain","requestedDomain","activeFeatureLane","conversationLane"];
const TURN_CONTAINER_KEYS = [
  "continuityAnchor","immediateContinuation","activeContinuation","lastAcceptedTurn","lastCompletedTurn","previousTurn","lastTurn",
  "progressionMemory","fiveTurnContinuity","fiveTurnContract","stateSpine","conversationState","turnMemory","memory","previousMemory"
];
const ARRAY_KEYS = ["turns","recentTurns","history","messages","conversationHistory","window","recentMessages","timeline"];

function normalizeDomain(value) {
  const n = norm(value);
  if (!n) return "";
  if (/technical|debug|code|runtime|javascript/.test(n)) return "technical";
  if (/law|legal/.test(n)) return "law";
  if (/business|strategy|finance|marketing/.test(n)) return n.includes("finance") ? "finance" : "business";
  if (/emotional|psychology|support/.test(n)) return "emotional";
  if (/identity/.test(n)) return "identity";
  if (/music|radio/.test(n)) return "music";
  if (/roku|television|tv/.test(n)) return "roku";
  if (/news|synapse/.test(n)) return "news";
  if (/general|conversation|simple/.test(n)) return "general";
  return "";
}

function technicalTargetFrom(obj) {
  if (!isObj(obj)) return "";
  const lock = isObj(obj.technicalTargetLock) ? obj.technicalTargetLock : {};
  return firstText(lock.targetPath, lock.targetFile, lock.targetName, lock.targetKey,
    obj.technicalTarget, obj.regressionTarget, obj.targetFile, obj.targetPath);
}

function candidateFromObject(obj, source = "", index = 0, currentText = "") {
  if (!isObj(obj)) return null;
  const userText = objectText(obj, USER_KEYS);
  const assistantReply = objectText(obj, REPLY_KEYS);
  const topic = firstText(objectText(obj, TOPIC_KEYS), technicalTargetFrom(obj));
  if (!userText && !topic && !assistantReply) return null;
  if (userText && norm(userText) === norm(currentText)) {
    const alternate = firstText(obj.lastUserText, obj.previousUserText);
    if (!alternate || norm(alternate) === norm(currentText)) return null;
  }
  const userDomain = explicitDomainFromText(userText);
  const topicDomain = explicitDomainFromText(topic);
  const replyDomain = explicitDomainFromText(assistantReply);
  let metadataDomain = "";
  for (const key of DOMAIN_KEYS) {
    const d = normalizeDomain(safeGet(obj, key));
    if (d) { metadataDomain = d; break; }
  }
  let domain = userDomain || topicDomain || metadataDomain || replyDomain || "general";
  if (userDomain === "technical" || topicDomain === "technical") domain = "technical";
  const ts = Number(obj.updatedAt || obj.timestamp || obj.at || obj.completedAt || obj.createdAt || 0) || 0;
  let score = index;
  if (userText) score += 120;
  if (topic) score += 55;
  if (assistantReply) score += 25;
  if (obj.trustedFinal === true || obj.final === true || obj.marionFinal === true) score += 20;
  if (source.includes("continuityAnchor") || source.includes("lastAcceptedTurn")) score += 90;
  if (source.includes("turns") || source.includes("recentTurns") || source.includes("window")) score += 35;
  if (userDomain) score += 45;
  if (technicalTargetFrom(obj)) score += 40;
  return {
    contract: CONTINUITY_CONTRACT,
    source,
    score,
    timestamp: ts,
    turnId: firstText(obj.turnId, obj.sourceTurnId, obj.id),
    sessionId: firstText(obj.sessionId, obj.conversationId),
    domain,
    intent: firstText(obj.intent, isObj(obj.routing) ? obj.routing.intent : ""),
    userText: bounded(userText, 1800),
    assistantReply: bounded(assistantReply, 1800),
    topic: bounded(topic || userText, 1000),
    activeTask: bounded(firstText(obj.activeTask, obj.currentTask, obj.lastValidTask, topic), 1000),
    surfaceRequest: bounded(obj.surfaceRequest, 1000),
    deeperIntent: bounded(obj.deeperIntent, 1000),
    operationalRisk: bounded(firstText(obj.operationalRisk, obj.risk, obj.lastRisk), 1000),
    executionMode: bounded(obj.executionMode, 500),
    nextAction: bounded(firstText(obj.nextAction, obj.pendingAction), 1000),
    technicalTarget: bounded(technicalTargetFrom(obj), 600),
    followupDepth: Math.max(0, Number(obj.followupDepth || (isObj(obj.immediateContinuation) ? obj.immediateContinuation.followupDepth : 0) || 0)),
    trustedFinal: obj.trustedFinal === true || obj.final === true || obj.marionFinal === true
  };
}

function collectCandidates(input) {
  const current = extractCurrentText(input);
  const roots = [];
  const src = isObj(input) ? input : {};
  for (const rootName of ["previousMemory","memory","turnMemory","state","conversationState","session","meta","payload","body","commandPacket"]) {
    const root = safeGet(src, rootName);
    if (isObj(root)) roots.push({ value: root, path: rootName });
  }
  const candidates = [];
  const seen = new WeakSet();
  let seq = 0;
  function walk(value, path, depth) {
    if (!isObj(value) || depth > MAX_DEPTH) return;
    try { if (seen.has(value)) return; seen.add(value); } catch (_) { return; }
    const direct = candidateFromObject(value, path, seq++, current);
    if (direct) candidates.push(direct);
    for (const key of TURN_CONTAINER_KEYS) {
      const child = safeGet(value, key);
      if (isObj(child)) walk(child, `${path}.${key}`, depth + 1);
    }
    for (const key of ARRAY_KEYS) {
      const arr = safeGet(value, key);
      if (!Array.isArray(arr)) continue;
      const start = Math.max(0, arr.length - MAX_ARRAY);
      for (let i = start; i < arr.length; i += 1) {
        const item = arr[i];
        if (isObj(item)) {
          const c = candidateFromObject(item, `${path}.${key}[${i}]`, seq++ + i, current);
          if (c) candidates.push(c);
          walk(item, `${path}.${key}[${i}]`, depth + 1);
        }
      }
    }
  }
  roots.forEach((r) => walk(r.value, r.path, 0));
  return candidates;
}


const NON_SUBSTANTIVE_ANCHOR_RX = /^(?:hi|hello|hey|hiya|yo|morning|evening|good morning|good afternoon|good evening|thanks|thank you|okay|ok|alright|all right|got it|understood|yes|no|sure|ready|test|testing|mic check|are you there|you there|how are you|how are you doing)(?:\s+(?:there|marion|mac))?[.!?]*$/i;
const INTERNAL_CONTINUATION_SCAFFOLD_RX = /\b(?:immediate(?:ly)? preceding turn|immediate technical turn|current[- ]turn authority|continuation authority|continuity anchor|active (?:code )?target|active subject|active lane|stay on the technical lane|preserve the active|preserve that active|must remain the authority|older unrelated lane|older legal thread|no older domain override|route(?:r)?[- ]to[- ]state[- ]to[- ]final[- ]envelope|continuing from the current thread|continuing from the immediately preceding|technical routing preserved|law[- ]domain file work|keep the surgery on|i have the thread|the active task remains|the domain remains locked|contextual follow-up detected|long-thread authority|give me the exact file or prompt target|keep the next update surgical|protect the signal|backend noise)\b/i;

function isInternalContinuationScaffold(value) {
  return INTERNAL_CONTINUATION_SCAFFOLD_RX.test(text(value, 12000));
}

function isSubstantiveAnchor(candidate) {
  if (!candidate || !isObj(candidate)) return false;
  const primary = firstText(candidate.userText, candidate.activeTask, candidate.topic, candidate.technicalTarget);
  const normalized = norm(primary);
  if (!normalized || NON_SUBSTANTIVE_ANCHOR_RX.test(primary)) return false;
  const cls = classifyCurrentTurn({ text: primary });
  if (cls.anchor || cls.shortFollowup) return false;
  if (candidate.domain && candidate.domain !== "general") return true;
  if (candidate.technicalTarget) return true;
  if (/\b(?:review|analy[sz]e|fix|repair|build|create|explain|compare|assess|audit|autopsy|plan|strategy|contract|risk|javascript|code|file|router|runtime|business|marketing|psychology|finance|cyber|law)\b/i.test(primary)) return true;
  return normalized.split(" ").length >= 5;
}

function technicalContinuationTarget(anchor) {
  return bounded(firstText(anchor && anchor.technicalTarget, anchor && anchor.activeTask, anchor && anchor.topic, anchor && anchor.userText), 700)
    .replace(/[.!?]+$/g, "");
}

function technicalSubstantiveReply(current, anchor) {
  const target = technicalContinuationTarget(anchor) || bounded(current && current.raw, 700).replace(/[.!?]+$/g, "");
  const n = norm(target);
  const routingWork = /\b(?:law routing|law routing file|routing file|intent router|domain router|router|routing)\b/.test(n);
  const stateWork = /\b(?:state spine|state carry|memory|session state|continuity)\b/.test(n);
  const envelopeWork = /\b(?:final envelope|final reply|projection|transport)\b/.test(n);
  const bridgeWork = /\b(?:bridge|marion bridge|handoff)\b/.test(n);
  const widgetWork = /\b(?:widget|html|frontend|interface|text field|button)\b/.test(n);
  const kind = current && current.followupKind;

  if (routingWork) {
    const replies = {
      depth: "The deeper defect is commit timing. A prior legal classification can be written into session state before the technical reply is validated, then rehydrated on a later follow-up. Instrument raw input, selected domain, pre-commit reply, and committed state; refuse the write unless the trusted final reply matches the current technical domain.",
      priority: "Fix router precedence first. Classify the current user text before merging remembered domain fields, and lock that decision for the turn. Every downstream layer depends on that classification, so correcting state or projection first would only mask the original misroute.",
      reason: "Router precedence comes first because it is the earliest authority decision. If the turn is mislabeled there, the composer, memory layer, and final envelope can all behave consistently while still producing the wrong legal answer.",
      failure: "The main regression risk is overcorrecting the router so aggressively that legitimate legal follow-ups lose their law context. The guard must prefer an explicit current domain, otherwise inherit only a verified substantive anchor from the same session, and never infer law from words such as risk, order, or priority alone.",
      order: "Use this order: 1) expand contextual follow-up detection; 2) lock the verified active domain and task in the router; 3) commit that anchor atomically after a trusted final; 4) strip conflicting law metadata from non-law turns; 5) reject domain-mismatched final replies; 6) run fresh-session, technical-chain, legal-chain, and Nyx-boundary regression tests.",
      validation: "Validate with two parallel chains. Technical: explicit JavaScript routing task, then Go deeper, first priority, why, failure mode, safest order. Legal: explicit contract-risk question followed by the same prompts. Every turn must retain its own domain, advance the answer, and produce identical visible reply aliases.",
      pressure: "The main risk is precedence inversion: historical law metadata is merged before the current technical objective is resolved. That lets a valid old domain overrule a valid new task several turns later.",
      after: "After router precedence is stable, move to atomic state persistence, then final-envelope domain validation, and finish with long-session stress tests. Do not tune personality or latency until semantic continuity is clean.",
      tradeoff: "A stronger domain lock improves continuity but can make real topic changes harder to detect. Balance it by allowing explicit current-language signals to override the anchor immediately, while ambiguous follow-ups inherit only the latest verified substantive task.",
      location: "Inspect the first function that merges routed output with previousMemory or session state. The defect is where remembered domain fields can overwrite the current classification before the route lock is finalized.",
      next: "Start by classifying the current user text before any remembered law fields are merged. Then permit memory updates only after a trusted final reply. That sequence removes the source of stale-law resurrection rather than patching its symptoms."
    };
    if (replies[kind]) return replies[kind];
    return "The first concrete defect to inspect is precedence. Confirm that the current prompt is classified before remembered law or domain fields are merged, then verify that only an accepted final response updates session memory.";
  }
  if (stateWork) {
    if (kind === "order") return "Use this order for State Spine: define one accepted-turn record, write topic/domain/reply/turn ID atomically after final validation, increment revision, then expose the committed snapshot to the next request. Finally test interruption, reset, and rollback paths.";
    if (kind === "failure") return "The dangerous failure mode is a partial commit: the domain updates but the active task or assistant result does not. The next follow-up then combines fields from different turns and appears coherent while following the wrong subject.";
    if (kind === "validation") return "Validate State Spine by asserting that revision, user text, active task, domain, final reply, and turn ID change together. A test should fail if any field advances without the others.";
    if (kind === "priority" || kind === "next") return "Repair atomic state mutation first: commit the accepted topic, domain, assistant result, and turn identifier together only after finalization. Partial or early writes are what let stale context survive.";
    return "Inspect when the state record is mutated. The safe sequence is classify, compose, validate, then commit the accepted turn atomically; any earlier or partial write can contaminate the next follow-up.";
  }
  if (envelopeWork) {
    if (kind === "order") return "For the final envelope, validate domain and reply substance first, choose one canonical reply, copy it to every visible alias, attach the accepted state patch, then serialize. Never promote an alias before the domain check passes.";
    if (kind === "failure") return "The failure mode is alias divergence: one field carries the technical answer while another still carries legal fallback text. The interface may select the wrong alias even though the envelope looks final.";
    return "Inspect visible-reply projection. The envelope must promote one validated answer across every alias and reject diagnostic, policy, fallback, or domain-mismatched text before transport.";
  }
  if (bridgeWork) {
    if (kind === "order") return "At the bridge: normalize once, hydrate the verified session anchor, route once, compose once, validate once, wrap one final packet, then cache only the accepted anchor. That order prevents re-entry and stale fallback promotion.";
    if (kind === "failure") return "The bridge can fail by caching a rejected or partial turn. Cache only after final validation, key it by the private session ID, and clear it on an explicit new-session marker.";
    return "Trace normalized input, routed domain, composer result, and final packet. The bridge must preserve one session and turn identity and must not cache or promote a fallback packet as a substantive anchor.";
  }
  if (widgetWork) {
    if (kind === "order") return "For the interface: keep typing independent of authorization, generate a unique turn ID, disable duplicate sends, accept only the latest response, update semantic health, then append the transcript. Privileged controls remain separately authenticated.";
    return "Start with the interface state machine: separate typing from send authorization, prevent overlapping requests, and ignore late responses whose turn ID is no longer current.";
  }
  if (kind === "order") return `Use this implementation order for ${target || "the technical task"}: identify the earliest divergence, repair its authority rule, persist the accepted result atomically, validate the final projection, then run a long-thread regression before changing downstream behavior.`;
  if (kind === "priority" || kind === "next") return `Start at the earliest transformation boundary for ${target || "this technical task"}. Fix the first point where current input and remembered state diverge, then validate the downstream layers without changing them prematurely.`;
  if (kind === "reason") return `That boundary has priority because every later stage consumes its result. A mistake there propagates cleanly through the system and becomes harder to distinguish from a composer or transport defect.`;
  if (kind === "failure") return `The main failure mode is a partial correction that fixes one reply but leaves the stale state intact. The next ambiguous follow-up then resurrects the old domain.`;
  if (kind === "validation") return `Validate ${target || "the technical task"} with a multi-turn chain, an explicit domain switch, a fresh-session reset, and a deliberately wrong downstream reply that the final validator must reject.`;
  if (kind === "pressure") return `The main operational risk is silent semantic drift: the transport remains healthy while the active task changes underneath the user.`;
  if (kind === "after") return `After the first defect is corrected, verify state persistence, final projection, and long-thread behavior in that order, then run public Nyx boundary tests.`;
  return `Go one layer deeper by locating the first point where ${target || "the technical task"} diverges from the current request. Compare normalized input, selected domain, committed state, and final visible reply; repair the earliest mismatch.`;
}

function lawSubstantiveReply(current, anchor) {
  const target = bounded(firstText(anchor && anchor.activeTask, anchor && anchor.topic, anchor && anchor.userText), 700).replace(/[.!?]+$/g, "");
  const kind = current && current.followupKind;
  if (kind === "priority" || kind === "next") return "Start with the governing jurisdiction and the exact clause or obligation at issue. Then separate enforceability, breach facts, liability, remedies, and missing evidence. This is general legal information, not legal advice.";
  if (kind === "reason") return "Jurisdiction and the controlling clause come first because legal standards, deadlines, available remedies, and even contract interpretation can change materially across provinces, states, courts, and governing-law provisions.";
  if (kind === "failure") return "The main risk is reaching a confident conclusion from incomplete facts or the wrong governing law. Missing amendments, notices, schedules, limitation clauses, or procedural deadlines can materially change the assessment.";
  if (kind === "order") return "Use this review order: confirm jurisdiction and governing law, identify the operative clauses, reconstruct the facts and evidence, test breach and defenses, assess remedies and exposure, then flag deadlines and questions for qualified counsel.";
  if (kind === "validation") return "Validate the assessment against the complete signed agreement, amendments, notices, correspondence, performance records, and the governing jurisdiction. Any conclusion should be revised when those facts change.";
  if (kind === "pressure") return "The main legal risk cannot be ranked reliably until the governing law, operative clause, alleged conduct, and available evidence are known. Those four inputs determine whether the issue is enforceability, breach, liability, remedy, or procedure.";
  if (kind === "after") return "After the preliminary issue map is complete, gather the missing documents and dates, quantify practical exposure, and take the jurisdiction-specific questions to qualified counsel before acting.";
  return `The deeper legal-risk analysis for ${target || "the issue"} should separate the obligation, possible breach facts, defenses, remedies or exposure, procedural deadlines, and missing jurisdiction-specific information. This is general legal information, not legal advice.`;
}

function extractContinuationAnchor(input) {
  if (!isPrivateMarionContext(input) || isIsolatedTurn(input)) return null;
  const current = classifyCurrentTurn(input);
  if (!current.shortFollowup) return null;
  const candidates = collectCandidates(input).filter((c) => c && (c.userText || c.topic) && isSubstantiveAnchor(c));
  if (!candidates.length) return null;
  candidates.sort((a, b) => {
    if (a.timestamp && b.timestamp && a.timestamp !== b.timestamp) return b.timestamp - a.timestamp;
    return b.score - a.score;
  });
  const winner = { ...candidates[0] };
  winner.version = VERSION;
  winner.contract = CONTINUITY_CONTRACT;
  winner.followupKind = current.followupKind;
  winner.resolvedAt = nowMs();
  winner.authority = "immediate_previous_accepted_turn";
  winner.noOlderDomainOverride = true;
  return winner;
}

function desiredDomain(input, current = classifyCurrentTurn(input), anchor = extractContinuationAnchor(input)) {
  if (current.anchor) return "general";
  if (current.technicalFileWork || current.technical) return "technical";
  if (current.law) return "law";
  if (current.shortFollowup) return anchor ? (anchor.domain || "general") : "general";
  return explicitDomainFromText(current.raw) || "";
}

function desiredIntent(domain, current) {
  if (current.anchor) return current.checkin ? "social_checkin" : current.presence ? "presence_check" : "simple_chat";
  if (current.shortFollowup) {
    if (domain === "technical") return "technical_debug";
    if (domain === "law") return "domain_question";
    return "contextual_directive";
  }
  if (domain === "technical") return "technical_debug";
  if (domain === "law") return "domain_question";
  if (domain === "business") return "business_strategy";
  if (domain === "emotional") return "emotional_support";
  if (domain === "identity") return "identity_query";
  if (domain === "music") return "music_query";
  if (domain === "news") return "news_query";
  if (domain === "roku") return "roku_query";
  return "simple_chat";
}

function effectivePromptFor(current, anchor) {
  if (!current.shortFollowup || !anchor || !isSubstantiveAnchor(anchor)) return current.raw;
  const target = bounded(firstText(anchor.activeTask, anchor.topic, anchor.userText, anchor.technicalTarget), 1200);
  if (anchor.domain === "technical") {
    const actions = {
      depth: "Add a deeper layer of concrete technical analysis",
      continue: "Advance the technical analysis with one new finding and one correction",
      next: "Identify the next concrete repair and its validation step",
      priority: "Identify the first technical priority and explain why it comes first",
      reason: "Explain why the preceding technical priority is correct",
      failure: "Identify what could break if the repair is implemented incorrectly",
      order: "Provide the safest implementation order with validation gates",
      validation: "Provide the exact regression tests that prove the repair",
      pressure: "Identify the main technical risk and the earliest divergence",
      after: "Explain the next technical phase after the current repair",
      tradeoff: "Explain the technical tradeoffs without changing the active task",
      location: "Identify the exact function or boundary where the defect occurs",
      repeat: "Re-run the technical analysis with a different concrete example",
      pace: "Explain the technical repair one step at a time",
      correction: "Correct the technical target while preserving compatible constraints"
    };
    const action = actions[current.followupKind] || "Advance the active technical analysis";
    return `${action} for this task: ${target}. Answer with substantive code or runtime reasoning. Do not describe conversation policy or switch to legal analysis.`;
  }
  if (anchor.domain === "law") {
    return `Continue the legal-risk analysis of: ${target}. Address the user’s ${current.followupKind || "follow-up"} question with jurisdiction-aware general information, not technical routing commentary.`;
  }
  return `Continue this active task: ${target}. Answer the ${current.followupKind || "follow-up"} directly and add new substance without repeating the prior reply.`;
}

const STALE_DOMAIN_KEYS = /^(?:domain|requestedDomain|primaryDomain|selectedDomain|knowledgeDomain|routing|routeLock|domainConfidence|domainConcierge|domainConciergeSeed|r18c.*|legal.*|lawAssessment.*|lawCrossDomain.*|activeFeatureLane|finalEnvelope|marionFinal)$/i;
function scrubConflictingCarry(value, desired, depth = 0, seen = new WeakSet()) {
  if (value == null || depth > MAX_DEPTH) return value;
  if (typeof value !== "object") return value;
  try { if (seen.has(value)) return "[Circular]"; seen.add(value); } catch (_) { return {}; }
  if (Array.isArray(value)) return value.slice(-MAX_ARRAY).map((v) => scrubConflictingCarry(v, desired, depth + 1, seen));
  const out = {};
  for (const key of safeKeys(value)) {
    if (desired !== "law" && STALE_DOMAIN_KEYS.test(key)) continue;
    let item;
    try { item = value[key]; } catch (_) { continue; }
    out[key] = scrubConflictingCarry(item, desired, depth + 1, seen);
  }
  return out;
}

function memoryFromAnchor(anchor, current, desired) {
  if (!anchor) return {};
  return {
    continuityAnchor: { ...anchor, followupKind: current.followupKind, domain: desired },
    immediateContinuation: {
      contract: CONTINUITY_CONTRACT,
      domain: desired,
      intent: desiredIntent(desired, current),
      followupKind: current.followupKind,
      previousUserText: anchor.userText,
      previousAssistantReply: anchor.assistantReply,
      activeTask: anchor.activeTask || anchor.topic,
      surfaceRequest: anchor.surfaceRequest || anchor.userText,
      deeperIntent: anchor.deeperIntent,
      operationalRisk: anchor.operationalRisk,
      executionMode: anchor.executionMode,
      nextAction: anchor.nextAction,
      technicalTarget: anchor.technicalTarget,
      authority: "immediate_previous_accepted_turn",
      noOlderDomainOverride: true,
      updatedAt: nowMs()
    },
    lastUserText: anchor.userText,
    lastAssistantReply: anchor.assistantReply,
    lastTopic: anchor.topic,
    activeTask: anchor.activeTask || anchor.topic,
    surfaceRequest: anchor.surfaceRequest || anchor.userText,
    deeperIntent: anchor.deeperIntent,
    operationalRisk: anchor.operationalRisk,
    executionMode: anchor.executionMode,
    nextAction: anchor.nextAction,
    technicalTargetLock: anchor.technicalTarget ? {
      version: "nyx.marion.technicalTargetLock/2.0",
      targetPath: anchor.technicalTarget,
      targetName: anchor.technicalTarget,
      explicit: true,
      locked: true,
      source: "immediate_previous_accepted_turn"
    } : undefined,
    domain: desired,
    primaryDomain: desired,
    selectedDomain: desired,
    knowledgeDomain: desired === "law" ? "law" : ""
  };
}

function applyPreparedFields(node, current, isolated, anchor) {
  if (!isObj(node)) return node;
  const out = shallow(node);
  const desired = desiredDomain(out, current, anchor) || "general";
  const intent = desiredIntent(desired, current);
  if (desired !== "law") {
    for (const key of safeKeys(out)) {
      if (/^(?:r18c.*|legal.*|lawAssessment.*|lawCrossDomain.*)$/i.test(key)) delete out[key];
    }
  }
  if (current.raw) {
    out.rawUserText = current.raw;
    out.userText = current.raw;
    out.prompt = current.raw;
    out.query = current.raw;
    out.text = current.raw;
    out.message = current.raw;
  }
  if (isolated) {
    out.previousMemory = {};
    out.memory = {};
    out.turnMemory = {};
    out.state = {};
    out.continuityAnchor = null;
    out.immediateContinuation = current.shortFollowup ? {
      contract: CONTINUITY_CONTRACT,
      unresolved: true,
      followupKind: current.followupKind,
      authority: "isolated_session_no_prior_turn",
      updatedAt: nowMs()
    } : null;
    out.continuationRequested = current.shortFollowup;
    out.continuationResolved = false;
    out.continuityResolved = false;
    out.continuationDomain = "general";
    out.noOlderDomainOverride = true;
  } else if (current.shortFollowup) {
    const carry = memoryFromAnchor(anchor, current, desired);
    out.previousMemory = carry;
    out.turnMemory = carry;
    if (isObj(out.memory)) out.memory = { ...scrubConflictingCarry(out.memory, desired), ...carry };
    if (isObj(out.state)) out.state = { ...scrubConflictingCarry(out.state, desired), ...carry };
    out.continuityAnchor = anchor || null;
    out.immediateContinuation = carry.immediateContinuation || {
      contract: CONTINUITY_CONTRACT, unresolved: true, followupKind: current.followupKind,
      authority: "no_reliable_immediate_anchor", updatedAt: nowMs()
    };
    out.effectivePrompt = effectivePromptFor(current, anchor);
    out.continuationRequested = true;
    out.continuationResolved = !!anchor;
    out.continuityResolved = !!anchor;
    out.continuationDomain = desired;
    out.noOlderDomainOverride = true;
  } else if (current.anchor) {
    out.previousMemory = {};
    out.turnMemory = {};
    if (isObj(out.memory)) out.memory = scrubConflictingCarry(out.memory, "general");
    if (isObj(out.state)) out.state = scrubConflictingCarry(out.state, "general");
    out.staleCarryBypass = true;
  } else if (current.technicalFileWork || current.law) {
    if (isObj(out.previousMemory)) out.previousMemory = scrubConflictingCarry(out.previousMemory, desired);
    if (isObj(out.memory)) out.memory = scrubConflictingCarry(out.memory, desired);
    if (isObj(out.turnMemory)) out.turnMemory = scrubConflictingCarry(out.turnMemory, desired);
    if (isObj(out.state)) out.state = scrubConflictingCarry(out.state, desired);
    out.explicitDomainAuthority = true;
    out.noOlderDomainOverride = true;
  }

  if (current.anchor || current.technicalFileWork || current.law || current.shortFollowup) {
    out.domain = desired;
    out.requestedDomain = desired;
    out.primaryDomain = desired;
    out.selectedDomain = desired;
    out.intent = intent;
    out.routing = {
      ...(isObj(out.routing) ? scrubConflictingCarry(out.routing, desired) : {}),
      domain: desired, primaryDomain: desired, selectedDomain: desired,
      knowledgeDomain: desired === "law" ? "law" : "",
      intent, subIntent: current.shortFollowup ? current.followupKind : current.kind,
      routeLock: true, routeAmbiguous: false, noCrossDomainBleed: true,
      continuationAuthority: current.shortFollowup ? (anchor ? "immediate_previous_accepted_turn" : (isolated ? "isolated_session_no_prior_turn" : "no_reliable_immediate_anchor")) : "current_explicit_turn",
      currentTurnAuthorityVersion: VERSION
    };
    out.marionIntent = {
      ...(isObj(out.marionIntent) ? scrubConflictingCarry(out.marionIntent, desired) : {}),
      activate: !current.anchor,
      intent, subIntent: current.shortFollowup ? current.followupKind : current.kind,
      confidence: anchor || !current.shortFollowup ? 1 : 0.55,
      source: current.shortFollowup ? "immediate_continuation_authority" : "current_turn_authority",
      knowledgeDomain: desired === "law" ? "law" : "",
      routeLock: true, noCrossDomainBleed: true
    };
    out.currentTurnAuthoritative = true;
  }

  out.currentTurnAuthorityVersion = VERSION;
  out.currentTurnClass = current.kind;
  out.followupKind = current.followupKind || "";
  out.currentTurnAuthority = {
    version: VERSION, contract: CONTINUITY_CONTRACT, kind: current.kind,
    followupKind: current.followupKind || "", isolated: !!isolated, isolatedContext: isIsolatedContext(out),
    currentText: current.raw, desiredDomain: desired, intent,
    continuityResolved: !!anchor, continuityAnchor: anchor || null
  };
  return out;
}

function prepareInput(input) {
  if (!isObj(input) || !isPrivateMarionContext(input)) return input;
  const current = classifyCurrentTurn(input);
  const isolated = isIsolatedTurn(input);
  const anchor = isolated ? null : extractContinuationAnchor(input);
  let out = applyPreparedFields(input, current, isolated, anchor);
  for (const key of ["body", "payload", "session", "meta"]) {
    if (isObj(out[key])) out[key] = applyPreparedFields(out[key], current, isolated, anchor);
  }
  out.privateAdminConversation = out.privateAdminConversation !== false;
  return out;
}

function cleanConflictingMetadata(node, desired, depth = 0, seen = new WeakSet()) {
  if (!isObj(node) || depth > MAX_DEPTH) return node;
  try { if (seen.has(node)) return node; seen.add(node); } catch (_) { return node; }
  const out = shallow(node);
  for (const key of safeKeys(out)) {
    if (desired !== "law" && /^(?:r18c.*|legal.*|lawAssessment.*|lawCrossDomain.*)$/i.test(key)) {
      delete out[key];
      continue;
    }
    if (["routing","marionIntent","meta","payload","finalEnvelope","packet","synthesis","result","stateSpinePatch","sessionPatch","memoryPatch"].includes(key) && isObj(out[key])) {
      out[key] = cleanConflictingMetadata(out[key], desired, depth + 1, seen);
    }
  }
  return out;
}

function replyFrom(value) {
  if (typeof value === "string") return text(value);
  if (!isObj(value)) return "";
  const p = isObj(value.payload) ? value.payload : {};
  const f = isObj(value.finalEnvelope) ? value.finalEnvelope : {};
  return firstText(value.directReply, value.visibleReply, value.displayReply, value.finalReply, value.reply,
    value.answer, value.response, value.text, value.message, value.lastAssistantReply, value.assistantReply,
    f.reply, f.text, f.spokenText, p.reply, p.text, p.message);
}

function anchorReply(current) {
  if (current.technicalFileWork) return technicalSubstantiveReply(current, { userText: current.raw, activeTask: current.raw, topic: current.raw, domain: "technical" });
  if (current.checkin) return "I’m doing well, Mac. I’m here, focused, and with you. How are you doing?";
  if (current.presence) return "I’m here, Mac. I’m with you.";
  const n = current.normalized;
  if (/\bgood morning\b|^morning\b/.test(n)) return "Good morning, Mac. I’m here with you.";
  if (/\bgood afternoon\b/.test(n)) return "Good afternoon, Mac. I’m here with you.";
  if (/\bgood evening\b|^evening\b/.test(n)) return "Good evening, Mac. I’m here with you.";
  if (/^hey\b/.test(n)) return "Hey, Mac. I’m here with you.";
  return "Hello, Mac. I’m here with you.";
}

function continuationReply(current, anchor) {
  if (!anchor || !isSubstantiveAnchor(anchor)) return "There isn’t a substantive topic to deepen in this session yet. Tell me what you want to examine, and I’ll take it from there.";
  if (anchor.domain === "technical") return technicalSubstantiveReply(current, anchor);
  if (anchor.domain === "law") return lawSubstantiveReply(current, anchor);
  const target = bounded(firstText(anchor.activeTask, anchor.topic, anchor.userText), 700).replace(/[.!?]+$/g, "");
  if (current.followupKind === "next") return `The next step for ${target} is to choose the highest-impact unresolved question, answer it directly, and turn that answer into one concrete action.`;
  return `The deeper layer of ${target} is the underlying decision: what is actually changing, what risk or opportunity matters most, and what action should follow. Start there rather than repeating the surface description.`;
}

function domainMismatch(reply, desired, current, anchor) {
  const r = lower(reply);
  if (!r) return true;
  if (current.shortFollowup && isInternalContinuationScaffold(reply)) return true;
  const lawReply = /\b(?:legal-risk|legal risk|not legal advice|legal category|jurisdiction sensitivity|governing jurisdiction|contract risk|law assessment|r18c)\b/.test(r);
  const technicalReply = /\b(?:javascript|code|runtime|router|routing|state spine|final envelope|technical|debug|file|module)\b/.test(r);
  if (desired !== "law" && lawReply) return true;
  if (desired === "technical" && !technicalReply && current.shortFollowup) return true;
  if (desired === "law" && technicalReply && !lawReply && current.shortFollowup) return true;
  if (current.anchor) {
    if (lawReply || /\b(?:diagnostic packet|final envelope missing|runtime error|route unavailable)\b/.test(r)) return true;
    if (current.greeting && !/\b(?:hello|hi|hey|morning|afternoon|evening|i'm here|i am here|here with you)\b/.test(r)) return true;
    if (current.checkin && !/\b(?:i'm|i am|doing|well|good|steady|here)\b/.test(r)) return true;
    if (current.presence && !/\b(?:here|with you|connected|present)\b/.test(r)) return true;
  }
  if (current.technicalFileWork && lawReply) return true;
  if (current.shortFollowup && !anchor && (lawReply || technicalReply)) return true;
  return false;
}

function setReplyAliases(out, reply) {
  for (const key of ["reply","directReply","visibleReply","displayReply","finalReply","publicReply","answer","response","text","message","output","spokenText"]) out[key] = reply;
  return out;
}

function buildNextAnchor(input, result, desired, current, prior) {
  const reply = replyFrom(result);
  const base = prior ? { ...prior } : {};
  const explicit = !current.shortFollowup;
  const activeUserText = explicit ? current.raw : firstText(base.userText, current.raw);
  const topic = explicit ? firstText(current.raw, base.topic) : firstText(base.topic, base.userText);
  return {
    contract: CONTINUITY_CONTRACT,
    version: VERSION,
    authority: "latest_accepted_private_marion_turn",
    sessionId: firstText(input.sessionId, isObj(input.meta) ? input.meta.sessionId : "", base.sessionId),
    turnId: firstText(input.turnId, input.requestId, isObj(input.meta) ? input.meta.turnId : ""),
    domain: desired || base.domain || "general",
    intent: desiredIntent(desired || base.domain || "general", current),
    userText: bounded(activeUserText, 1800),
    assistantReply: bounded(reply, 1800),
    topic: bounded(topic, 1000),
    activeTask: bounded(firstText(explicit ? current.raw : "", base.activeTask, base.topic), 1000),
    surfaceRequest: bounded(firstText(base.surfaceRequest, activeUserText), 1000),
    deeperIntent: bounded(base.deeperIntent, 1000),
    operationalRisk: bounded(base.operationalRisk, 1000),
    executionMode: bounded(base.executionMode, 500),
    nextAction: bounded(firstText(current.followupKind === "order" ? "implement_in_guarded_sequence" : "", current.followupKind === "validation" ? "run_regression_validation" : "", base.nextAction), 1000),
    technicalTarget: bounded(firstText(base.technicalTarget, desired === "technical" ? topic : ""), 600),
    activeSubject: bounded(firstText(base.activeSubject, base.activeTask, topic, activeUserText), 1000),
    lastFollowupText: bounded(current.shortFollowup ? current.raw : "", 600),
    progressionStage: bounded(current.followupKind || (explicit ? "anchor" : base.progressionStage), 64),
    followupDepth: Math.max(0, Number(base.followupDepth || 0)) + (current.shortFollowup ? 1 : 0),
    followupKind: current.followupKind || "",
    trustedFinal: true,
    noOlderDomainOverride: true,
    updatedAt: nowMs()
  };
}

function projectContinuityFields(out, input, desired, current, priorAnchor) {
  const nextAnchor = buildNextAnchor(input, out, desired, current, priorAnchor);
  const carry = {
    continuityAnchor: nextAnchor,
    immediateContinuation: {
      contract: CONTINUITY_CONTRACT,
      active: true,
      domain: nextAnchor.domain,
      intent: nextAnchor.intent,
      followupDepth: nextAnchor.followupDepth,
      followupKind: nextAnchor.followupKind,
      previousUserText: nextAnchor.userText,
      previousAssistantReply: nextAnchor.assistantReply,
      activeTask: nextAnchor.activeTask,
      surfaceRequest: nextAnchor.surfaceRequest,
      deeperIntent: nextAnchor.deeperIntent,
      operationalRisk: nextAnchor.operationalRisk,
      executionMode: nextAnchor.executionMode,
      nextAction: nextAnchor.nextAction,
      technicalTarget: nextAnchor.technicalTarget,
      activeSubject: nextAnchor.activeSubject,
      lastFollowupText: nextAnchor.lastFollowupText,
      progressionStage: nextAnchor.progressionStage,
      authority: nextAnchor.authority,
      noOlderDomainOverride: true,
      updatedAt: nextAnchor.updatedAt
    },
    lastUserText: current.raw,
    lastAssistantReply: nextAnchor.assistantReply,
    lastTopic: nextAnchor.topic,
    activeTask: nextAnchor.activeTask,
    activeSubject: nextAnchor.activeSubject,
    lastFollowupText: nextAnchor.lastFollowupText,
    progressionStage: nextAnchor.progressionStage,
    domain: nextAnchor.domain,
    primaryDomain: nextAnchor.domain,
    selectedDomain: nextAnchor.domain,
    knowledgeDomain: nextAnchor.domain === "law" ? "law" : "",
    currentTurnAuthorityVersion: VERSION
  };
  out.memoryPatch = { ...(isObj(out.memoryPatch) ? out.memoryPatch : {}), ...carry };
  out.sessionPatch = { ...(isObj(out.sessionPatch) ? out.sessionPatch : {}), ...carry };
  out.stateSpinePatch = { ...(isObj(out.stateSpinePatch) ? out.stateSpinePatch : {}), ...carry };
  out.continuityAnchor = nextAnchor;
  out.immediateContinuation = carry.immediateContinuation;
  return out;
}

function enforceRouterResult(result, input) {
  const current = classifyCurrentTurn(input);
  if (!isPrivateMarionContext(input) || !isObj(result)) return result;
  const anchor = current.shortFollowup ? extractContinuationAnchor(input) : null;
  const enforce = current.anchor || current.technicalFileWork || current.law || current.shortFollowup;
  if (!enforce) return result;
  const desired = desiredDomain(input, current, anchor) || "general";
  const intent = desiredIntent(desired, current);
  const out = cleanConflictingMetadata(result, desired);
  out.ok = out.ok !== false;
  out.marionIntent = {
    ...(isObj(out.marionIntent) ? out.marionIntent : {}),
    activate: !current.anchor, intent,
    subIntent: current.shortFollowup ? current.followupKind : current.kind,
    confidence: current.shortFollowup && !anchor ? 0.55 : 1,
    reason: current.shortFollowup ? (anchor ? "immediate_previous_turn_continuity" : "continuation_anchor_missing") : "current_explicit_turn_precedence",
    knowledgeDomain: desired === "law" ? "law" : "",
    knowledgeDomainExplicit: desired === "law",
    secondaryDomains: [],
    routeLock: true, noCrossDomainBleed: true,
    continuationAnchor: anchor || null
  };
  out.routing = {
    ...(isObj(out.routing) ? out.routing : {}),
    domain: desired, primaryDomain: desired, selectedDomain: desired,
    knowledgeDomain: desired === "law" ? "law" : "",
    intent, subIntent: current.shortFollowup ? current.followupKind : current.kind,
    mode: current.shortFollowup ? "immediate_continuation" : "private_conversation",
    depth: current.followupKind === "depth" ? "deep" : "relational",
    routeLock: true, routeAmbiguous: false, routeFailClosed: false,
    secondaryDomains: [], noCrossDomainBleed: true,
    continuationAnchor: anchor || null,
    continuationAuthority: current.shortFollowup ? "immediate_previous_accepted_turn" : "current_explicit_turn",
    currentTurnAuthorityVersion: VERSION
  };
  out.domain = desired;
  out.primaryDomain = desired;
  out.selectedDomain = desired;
  out.knowledgeDomain = desired === "law" ? "law" : "";
  out.intent = intent;
  out.effectivePrompt = effectivePromptFor(current, anchor);
  out.continuityAnchor = anchor || null;
  out.currentTurnAuthorityVersion = VERSION;
  out.currentTurnClass = current.kind;
  return out;
}

function enforceResult(result, input) {
  const current = classifyCurrentTurn(input);
  if (!isPrivateMarionContext(input)) return result;
  const anchor = current.shortFollowup ? extractContinuationAnchor(input) : null;
  const enforce = current.anchor || current.technicalFileWork || current.law || current.shortFollowup;
  if (!enforce) return result;
  const desired = desiredDomain(input, current, anchor) || "general";
  const intent = desiredIntent(desired, current);
  if (typeof result === "string") {
    if (!domainMismatch(result, desired, current, anchor) && !isInternalContinuationScaffold(result)) return result;
    return current.shortFollowup ? continuationReply(current, anchor) : anchorReply(current);
  }
  if (!isObj(result)) return result;
  let out = cleanConflictingMetadata(result, desired);
  let reply = replyFrom(out);
  if (domainMismatch(reply, desired, current, anchor) || isInternalContinuationScaffold(reply)) reply = current.shortFollowup ? continuationReply(current, anchor) : anchorReply(current);
  out = setReplyAliases(out, reply);
  out.ok = out.ok !== false;
  out.final = true;
  out.marionFinal = true;
  out.handled = true;
  out.awaitingMarion = false;
  out.domain = desired;
  out.primaryDomain = desired;
  out.selectedDomain = desired;
  out.knowledgeDomain = desired === "law" ? "law" : "";
  out.intent = intent;
  out.finalEnvelope = setReplyAliases({ ...(isObj(out.finalEnvelope) ? out.finalEnvelope : {}) }, reply);
  Object.assign(out.finalEnvelope, {
    final: true, marionFinal: true, handled: true, domain: desired, primaryDomain: desired,
    selectedDomain: desired, knowledgeDomain: desired === "law" ? "law" : "", intent,
    source: out.finalEnvelope.source || "marion",
    authority: out.finalEnvelope.authority || "marionFinalEnvelope",
    contractVersion: out.finalEnvelope.contractVersion || "nyx.marion.final/1.0",
    continuationAnchor: anchor || null,
    continuationAuthority: current.shortFollowup ? "immediate_previous_accepted_turn" : "current_explicit_turn",
    currentTurnAuthorityVersion: VERSION, currentTurnClass: current.kind
  });
  out.payload = setReplyAliases({ ...(isObj(out.payload) ? out.payload : {}) }, reply);
  Object.assign(out.payload, {
    final: true, marionFinal: true, handled: true, domain: desired, intent,
    continuityAnchor: anchor || null, currentTurnAuthorityVersion: VERSION
  });
  out.routing = {
    ...(isObj(out.routing) ? out.routing : {}),
    domain: desired, primaryDomain: desired, selectedDomain: desired,
    knowledgeDomain: desired === "law" ? "law" : "", intent,
    subIntent: current.shortFollowup ? current.followupKind : current.kind,
    routeLock: true, routeAmbiguous: false, noCrossDomainBleed: true,
    continuationAnchor: anchor || null,
    continuationAuthority: current.shortFollowup ? "immediate_previous_accepted_turn" : "current_explicit_turn",
    currentTurnAuthorityVersion: VERSION
  };
  out.meta = {
    ...(isObj(out.meta) ? out.meta : {}),
    currentTurnAuthorityVersion: VERSION, currentTurnClass: current.kind,
    currentTurnText: current.raw, staleCarryRejected: true,
    continuityResolved: current.shortFollowup ? !!anchor : true,
    continuityAnchor: anchor || null,
    semanticHealth: current.shortFollowup && !anchor ? "degraded" : "ready",
    semanticDomain: desired,
    progressionDepth: anchor ? Math.max(1, Number(anchor.followupDepth || 0) + 1) : 0,
    semanticFailureSignature: current.shortFollowup && !anchor ? "CONTINUATION_ANCHOR_MISSING" : "none"
  };
  out.currentTurnAuthorityVersion = VERSION;
  out.currentTurnClass = current.kind;
  out = projectContinuityFields(out, input, desired, current, anchor);
  return out;
}

function scrubStateForCurrentTurn(state, input) {
  if (!isPrivateMarionContext(input) || !isObj(state)) return state;
  const current = classifyCurrentTurn(input);
  const anchor = current.shortFollowup ? extractContinuationAnchor(input) : null;
  const enforce = current.anchor || current.technicalFileWork || current.law || current.shortFollowup;
  if (!enforce) return state;
  const desired = desiredDomain(input, current, anchor) || "general";
  let out = cleanConflictingMetadata(state, desired);
  out.domain = desired;
  out.primaryDomain = desired;
  out.selectedDomain = desired;
  out.knowledgeDomain = desired === "law" ? "law" : "";
  out.intent = desiredIntent(desired, current);
  out.currentTurnAuthorityVersion = VERSION;
  out.currentTurnClass = current.kind;
  const prior = anchor || (isObj(out.continuityAnchor) ? out.continuityAnchor : null);
  const nextAnchor = buildNextAnchor(input, out, desired, current, prior);
  out.continuityAnchor = nextAnchor;
  out.immediateContinuation = {
    ...(isObj(out.immediateContinuation) ? out.immediateContinuation : {}),
    contract: CONTINUITY_CONTRACT,
    domain: desired,
    intent: out.intent,
    followupDepth: nextAnchor.followupDepth,
    followupKind: current.followupKind || "",
    previousUserText: nextAnchor.userText,
    previousAssistantReply: nextAnchor.assistantReply,
    activeTask: nextAnchor.activeTask,
    surfaceRequest: nextAnchor.surfaceRequest,
    deeperIntent: nextAnchor.deeperIntent,
    operationalRisk: nextAnchor.operationalRisk,
    executionMode: nextAnchor.executionMode,
    nextAction: nextAnchor.nextAction,
    technicalTarget: nextAnchor.technicalTarget,
    authority: current.shortFollowup ? (anchor ? "immediate_previous_accepted_turn" : "no_reliable_immediate_anchor") : "current_explicit_turn",
    noOlderDomainOverride: true,
    updatedAt: nextAnchor.updatedAt
  };
  out.lastUserText = current.raw || out.lastUserText || "";
  if (nextAnchor.assistantReply) out.lastAssistantReply = nextAnchor.assistantReply;
  out.lastTopic = nextAnchor.topic || out.lastTopic || "";
  out.activeTask = nextAnchor.activeTask || out.activeTask || "";
  out.surfaceRequest = nextAnchor.surfaceRequest || out.surfaceRequest || "";
  out.deeperIntent = nextAnchor.deeperIntent || out.deeperIntent || "";
  out.operationalRisk = nextAnchor.operationalRisk || out.operationalRisk || "";
  out.executionMode = nextAnchor.executionMode || out.executionMode || "";
  out.nextAction = nextAnchor.nextAction || out.nextAction || "";
  out.activeSubject = nextAnchor.activeSubject || out.activeSubject || "";
  out.lastFollowupText = nextAnchor.lastFollowupText || out.lastFollowupText || "";
  out.progressionStage = nextAnchor.progressionStage || out.progressionStage || "";
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
    const isolated = isIsolatedTurn(prepared);
    const anchor = current.shortFollowup && !isolated ? extractContinuationAnchor(prepared) : null;
    if (current.anchor || current.technicalFileWork || current.law || current.shortFollowup) {
      for (let i = 0; i < arr.length; i += 1) {
        if (i !== contextIndex && isObj(arr[i])) {
          const withContext = {
            ...arr[i],
            privateAdminConversation: prepared.privateAdminConversation !== false,
            marionAdminConversation: prepared.marionAdminConversation === true,
            directMarionAdminInterface: prepared.directMarionAdminInterface === true,
            sessionId: firstText(arr[i].sessionId, prepared.sessionId),
            turnId: firstText(arr[i].turnId, prepared.turnId)
          };
          arr[i] = applyPreparedFields(withContext, current, isolated, anchor);
        }
      }
    }
  }
  return { args: arr, input: contextIndex >= 0 ? arr[contextIndex] : {} };
}

module.exports = {
  VERSION,
  CONTINUITY_CONTRACT,
  extractCurrentText,
  classifyCurrentTurn,
  followupKind,
  isPrivateMarionContext,
  isIsolatedContext,
  isIsolatedTurn,
  extractContinuationAnchor,
  desiredDomain,
  desiredIntent,
  effectivePromptFor,
  prepareInput,
  prepareArgumentList,
  scrubConflictingCarry,
  enforceRouterResult,
  enforceResult,
  scrubStateForCurrentTurn,
  replyFrom,
  anchorReply,
  continuationReply,
  domainMismatch,
  buildNextAnchor,
  isSubstantiveAnchor,
  isInternalContinuationScaffold,
  technicalSubstantiveReply,
  lawSubstantiveReply
};

/* MARION_CONVERSATION_FLOW_LAYERS_9_10_11_CURRENT_TURN_V11_START */
(function marionConversationFlowCurrentTurnV11(){
  "use strict";
  const api=module.exports&&typeof module.exports==="object"?module.exports:null;if(!api||api.__marionConversationFlowCurrentTurnV11)return;
  let registry=null;try{registry=require("./conversation/marionConversationLayerRegistry.js");}catch(_){registry=null;}if(!registry)return;
  function obj(v){return v&&typeof v==="object"&&!Array.isArray(v)?v:{}}
  function privateTurn(v){const s=obj(v),c=obj(s.privateRuntimeContext);return s.privateAdminConversation===true||s.marionAdminConversation===true||s.directMarionAdminInterface===true||s.scope==="private_admin"||c.version;}
  function wrapInput(fn){if(typeof fn!=="function"||fn.__marionConversationFlowCurrentTurnV11)return fn;const w=function(input){const base=fn.apply(this,arguments);if(!privateTurn(base)&&!privateTurn(input))return base;return registry.applyToInput(obj(base),obj(obj(base).previousMemory));};w.__marionConversationFlowCurrentTurnV11=true;return w;}
  function wrapResult(fn){if(typeof fn!=="function"||fn.__marionConversationFlowCurrentTurnV11)return fn;const w=function(result,input){const out=fn.apply(this,arguments);if(!privateTurn(input))return out;const prepared=registry.applyToInput(obj(input),obj(obj(input).previousMemory));return registry.attachToResult(out,obj(prepared.conversationFlow));};w.__marionConversationFlowCurrentTurnV11=true;return w;}
  if(typeof api.prepareInput==="function")api.prepareInput=wrapInput(api.prepareInput);
  for(const name of ["enforceRouterResult","enforceResult","scrubStateForCurrentTurn"]){if(typeof api[name]==="function")api[name]=wrapResult(api[name]);}
  const oldArgs=api.prepareArgumentList;if(typeof oldArgs==="function")api.prepareArgumentList=function(){const out=oldArgs.apply(this,arguments);if(!out||!Array.isArray(out.args)||!privateTurn(out.input))return out;const prepared=registry.applyToInput(obj(out.input),obj(obj(out.input).previousMemory));const args=out.args.map(x=>x===out.input?prepared:x);return {...out,args,input:prepared};};
  api.__marionConversationFlowCurrentTurnV11=true;api.MARION_CONVERSATION_FLOW_CURRENT_TURN_VERSION=registry.VERSION;api.marionConversationLayers=registry;
})();
/* MARION_CONVERSATION_FLOW_LAYERS_9_10_11_CURRENT_TURN_V11_END */


/* MARION_OUTCOME_FLOW_LAYERS_12_13_14_CURRENT_TURN_V14_START */
(function marionOutcomeFlowCapabilityV14(){
  "use strict";
  try{
    const api=module.exports&&typeof module.exports==="object"?module.exports:null;if(!api)return;
    const registry=require("./conversation/marionConversationLayerRegistry.js");
    api.MARION_CONVERSATION_LAYERS_VERSION=registry.VERSION;
    api.MARION_OUTCOME_FLOW_VERSION=registry.outcomeCoordinator&&registry.outcomeCoordinator.VERSION||"";
    api.MARION_OUTCOME_AWARENESS_VERSION=registry.outcomeAwareness&&registry.outcomeAwareness.VERSION||"";
    api.MARION_COMMITMENT_TRACKER_VERSION=registry.commitmentTracker&&registry.commitmentTracker.VERSION||"";
    api.MARION_ANTICIPATORY_GUIDANCE_VERSION=registry.anticipatoryGuidance&&registry.anticipatoryGuidance.VERSION||"";
    api.getMarionOutcomeFlowStatus=function(){return registry.getStatus();};
    api.marionConversationLayers=registry;
    api.__marionOutcomeFlowCapabilityV14=true;
  }catch(_){}
})();
/* MARION_OUTCOME_FLOW_LAYERS_12_13_14_CURRENT_TURN_V14_END */

/* MARION_STRATEGIC_FLOW_LAYERS_15_16_17_CURRENT_TURN_V17_START */
(function marionStrategicFlowCapabilityV17(){
  "use strict";
  try{
    const api=module.exports&&typeof module.exports==="object"?module.exports:null;if(!api)return;
    const registry=require("./conversation/marionConversationLayerRegistry.js");
    api.MARION_CONVERSATION_LAYERS_VERSION=registry.VERSION;
    api.MARION_STRATEGIC_FLOW_VERSION=registry.strategicCoordinator&&registry.strategicCoordinator.VERSION||"";
    api.MARION_STRATEGIC_OBJECTIVE_ALIGNMENT_VERSION=registry.strategicObjectiveAlignment&&registry.strategicObjectiveAlignment.VERSION||"";
    api.MARION_PREDICTIVE_RISK_MODEL_VERSION=registry.predictiveRiskModel&&registry.predictiveRiskModel.VERSION||"";
    api.MARION_STRATEGIC_PATHWAY_SYNTHESIS_VERSION=registry.strategicPathwaySynthesizer&&registry.strategicPathwaySynthesizer.VERSION||"";
    api.getMarionStrategicFlowStatus=function(){return registry.getStatus();};
    api.projectMarionStrategicFlowState=function(value){return registry.strategicCoordinator.projectState(value&&value.strategicFlow?value.strategicFlow:value);};
    api.marionConversationLayers=registry;
    api.MARION_STRATEGIC_FLOW_METADATA_PRIVATE=true;
    api.MARION_STRATEGIC_AUTOMATIC_EXECUTION_ALLOWED=false;
    api.__marionStrategicFlowCapabilityV17=true;
  }catch(_){}
})();
/* MARION_STRATEGIC_FLOW_LAYERS_15_16_17_CURRENT_TURN_V17_END */



/* MARION_STRATEGIC_CURRENT_TURN_DIRECTIVE_V17_START */
(function marionStrategicCurrentTurnDirectiveV17(){
  "use strict";
  try{
    const api=module.exports&&typeof module.exports==="object"?module.exports:null;if(!api)return;
    function text(v){try{return String(v==null?"":v).replace(/\s+/g," ").trim()}catch(_){return""}}
    api.classifyStrategicCurrentTurnDirective=function(value){
      const p=text(value&&typeof value==="object"?(value.prompt||value.userText||value.text||value.message):value).toLowerCase();
      return {
        objectiveChanged:/\b(?:change|replace|reset|update|new)\s+(?:the\s+)?(?:(?:governing|program|project|milestone|task)\s+)?(?:objective|goal|priority)\b|\b(?:our|the|my)\s+(?:new\s+)?(?:(?:governing|program|project|milestone|task)\s+)?(?:objective|goal|priority)\s+is\b/.test(p),
        cancelPathway:/\b(?:cancel|drop|discard|invalidate)\s+(?:that|this|the)?\s*(?:path|pathway|plan|strategy)\b/.test(p),
        keepBaseline:/\b(?:keep|retain|preserve)\s+(?:the\s+)?current\s+baseline\b/.test(p),
        explicitPathApproval:/\b(?:approve|authorize|go ahead with|proceed with)\b.{0,80}\b(?:path|pathway|option|baseline|additive|pilot|phased)\b/.test(p)
      };
    };
    api.MARION_STRATEGIC_CURRENT_TURN_DIRECTIVE_VERSION="nyx.marion.strategicCurrentTurnDirective/1.0";
  }catch(_){}
})();
/* MARION_STRATEGIC_CURRENT_TURN_DIRECTIVE_V17_END */

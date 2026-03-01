
// =========================================================
// S2S.js — Nyx Server-to-Server Logic (Warmth v1 + Hard Precedence)
// =========================================================

"use strict";

/* =========================================================
   NYX ↔ MARION — 10-PHASE FORWARD ROADMAP (S2S Layer Hooks)
   Phase 1  Social Intelligence Patch: greeting/check-in precedence (DONE)
   Phase 2  State Spine Reinforcement: turnDepth/lastIntent hints (DONE)
   Phase 3  Resilience Layer: retry/timeout budgets + telemetry (DONE)
   Phase 4  Distress Support Precedence: local empathy for non-crisis distress (DONE)
   Phase 5  TurnId/RequestId Discipline: request correlation + UI race mitigation (HOOKED)
   Phase 6  Vendor Health Mapping: attach vendor status crumbs (HOOK PLACEHOLDER)
   Phase 7  Circuit Breakers: auto-degrade on repeated vendor faults (HOOK PLACEHOLDER)
   Phase 8  Structured Error Channels: classify failures vs “snag” (HOOK PLACEHOLDER)
   Phase 9  Observability: JSON logs + latency histograms (HOOKED/EXTENDABLE)
   Phase 10 Policy Gates: privacy-min + no raw text in logs by default (DONE)
========================================================= */

/* =========================================================
   NYX S2S — GREETING / CHECK-IN PRECEDENCE (WARMTH v1)
========================================================= */

const _NYX_WARM = (() => {
  const GREET_ONLY = [
    "Hello. I’m doing really well — thanks for asking. How are you feeling today?",
    "Hey — I’m good, and I’m here with you. How’s your day going so far?",
    "Hi there. I’m doing great. How are you doing today?",
    "Hey! I’m doing well — thank you. How are you feeling right now?",
    "Hello — I’m good. I hope your day’s been kind to you. How’s it going on your end?"
  ];

  const GREET_AND_STEER = [
    "I’m doing really well — thanks for asking.",
    "I’m good — and I’m glad you’re here.",
    "Doing great — thanks for checking in.",
    "I’m well — and I’m here with you."
  ];

  let lastIdx = -1;
  let lastAt = 0;

  const LANE_WORDS = ["music","radio","roku","news","sponsor","sponsors","movie","movies","tv","channel","channels"];
  const HELP_WORDS = ["help","fix","update","debug","error","issue","problem","build","implement","deploy"];

  function norm(s){
    return String(s||"").toLowerCase().replace(/\s+/g," ").trim();
  }

  function hasAny(n, arr){
    return arr.some(w => n.includes(w));
  }

  const RE_GREETING = /\b(hi|hey|hello|good\s+morning|good\s+afternoon|good\s+evening)\b/i;
  const RE_CHECKIN = /\b(how\s+are\s+you|how(?:'|’)?s\s+your\s+day|hope\s+you(?:'|’)?re\s+well)\b/i;

  function detect(text){
    const n = norm(text);
    if(!n) return { type:"none" };

    const isGreeting = RE_GREETING.test(n);
    const isCheckIn = RE_CHECKIN.test(n);
    const hasLaneWord = hasAny(n, LANE_WORDS);
    const hasHelpWord = hasAny(n, HELP_WORDS);

    if(!(isGreeting || isCheckIn)) return { type:"none" };

    const pure = !hasLaneWord && !hasHelpWord && n.length < 80;

    return { type: pure ? "greeting_only" : "greeting_mixed" };
  }

  function pick(arr){
    const now = Date.now();
    const cooldown = 120000;
    let idx = Math.floor(Math.random()*arr.length);

    if(arr.length > 1){
      if(idx === lastIdx) idx = (idx + 1) % arr.length;
      if(now - lastAt < cooldown && idx === lastIdx)
        idx = (idx + 1) % arr.length;
    }

    lastIdx = idx;
    lastAt = now;
    return arr[idx];
  }

  function greetingOnly(){
    return pick(GREET_ONLY);
  }

  function prefix(){
    return pick(GREET_AND_STEER);
  }

  return { detect, greetingOnly, prefix };

/* =========================================================
   NYX S2S — DISTRESS / SUPPORT PRECEDENCE (Support v1)
   - Local, deterministic support response for non-crisis distress
   - Prevents vendor/bridge timeouts from surfacing as “snag” on:
     lonely / overwhelmed / anxious / depressed / stressed / sad
   - NOTE: This is NOT a self-harm classifier. Any self-harm handling
     should remain in ChatEngine / policy layer.
========================================================= */

const _NYX_SUPPORT = (() => {
  const DISTRESS = [
    "I hear you. Being lonely can feel heavy. I’m here with you — want to tell me what’s been making it feel that way lately?",
    "I’m really sorry you’re feeling lonely. You don’t have to sit with it alone — what’s been going on today?",
    "That sounds hard. I’m here. Do you want comfort, distraction, or a small plan to make the next hour easier?",
    "Thanks for saying it out loud — that takes courage. What would feel most supportive right now: talking it out or doing something light together?"
  ];

  let lastIdx = -1;

  function norm(s){
    return String(s||"").toLowerCase().replace(/\s+/g," ").trim();
  }

  // Light distress cues (non-crisis)
  const RE_DISTRESS = /\b(lonely|alone|overwhelmed|anxious|anxiety|stressed|stress|sad|down|depressed|depression|burnt\s*out|burned\s*out|tired\s*of\s*everything)\b/i;

  // If the message includes lane/help words, don’t short-circuit; let routing proceed.
  const LANE_OR_HELP = /\b(music|radio|roku|news|sponsor|sponsors|movie|movies|tv|channel|channels|help|fix|update|debug|error|issue|problem|build|implement|deploy)\b/i;

  function detect(text){
    const n = norm(text);
    if(!n) return { type:"none" };
    if(LANE_OR_HELP.test(n)) return { type:"none" };
    if(RE_DISTRESS.test(n)) return { type:"distress" };
    return { type:"none" };
  }

  function pick(arr){
    let idx = Math.floor(Math.random()*arr.length);
    if(arr.length > 1 && idx === lastIdx) idx = (idx + 1) % arr.length;
    lastIdx = idx;
    return arr[idx];
  }

  function reply(){
    return pick(DISTRESS);
  }

  return { detect, reply };
})();

})();

function cleanText(t){
  return String(t||"").trim();
}

/* =========================================================
   NYX S2S — TELEMETRY (LATENCY + DEBUG)  [Steps 1/2]
   - Adds turnId + lane propagation
   - Captures t0..tN timestamps for local routing
   - Optional debug payloads behind env flags
========================================================= */

let _perfNow = null;
try {
  // Node >=8+
  // eslint-disable-next-line global-require
  const { performance } = require("perf_hooks");
  _perfNow = () => performance.now();
} catch(_e){
  _perfNow = () => Date.now();
}

function nowMs(){
  return Math.round(_perfNow());
}

function pickLane(session){
  // Prefer explicit session lane if present
  const lane = (session && (session.lane || session.currentLane || session.mode)) || "Default";
  return String(lane || "Default");
}

function ensureTurnId(session){
  if(session && session.turnId) return String(session.turnId);
  const t = Date.now().toString(36);
  const r = Math.random().toString(36).slice(2,8);
  return `t_${t}_${r}`;
}

function ensureRequestId(session, opts){
  const fromOpts = opts && (opts.requestId || opts.reqId || (opts.context && opts.context.requestId));
  const fromSession = session && (session.requestId || session.reqId);
  if(fromOpts) return String(fromOpts);
  if(fromSession) return String(fromSession);
  const t = Date.now().toString(36);
  const r = Math.random().toString(36).slice(2,10);
  return `r_${t}_${r}`;
}


function boolEnv(name, fallback=false){
  const v = process.env[name];
  if(v === undefined) return fallback;
  return String(v).toLowerCase() === "true" || String(v) === "1";
}

const SB_S2S_DEBUG = boolEnv("SB_S2S_DEBUG", false);            // safe debug crumbs
const SB_S2S_LOG_JSON = boolEnv("SB_S2S_LOG_JSON", false);      // emit structured logs
const SB_S2S_TIMING = boolEnv("SB_S2S_TIMING", true);
const SB_S2S_SUPPORT_LOCAL = boolEnv("SB_S2S_SUPPORT_LOCAL", true); // local distress support short-circuit
           // attach telemetry to sessionPatch

/* =========================================================
   NYX S2S — STATE SPINE HINTS (Phase 2)
   - turnDepth increment + lastIntent anchoring
   - Fail-open: hints only (no hard dependency downstream)
========================================================= */

function getTurnDepth(session){
  const v = session && (session.turnDepth ?? session.__turnDepth ?? session.depth);
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
}

function nextTurnDepth(session){
  const d = getTurnDepth(session);
  return Math.min(50, d + 1); // cap to prevent runaway state
}

function setStateHints(sessionPatch, session, hints = {}){
  // Keep additive + bounded to avoid bloating payloads
  const stateHints = {
    turnDepth: nextTurnDepth(session),
    lastIntent: hints.lastIntent || undefined,
    lastLane: hints.lastLane || undefined,
    turnId: hints.turnId || undefined
  };
  // prune undefined
  Object.keys(stateHints).forEach(k => stateHints[k] === undefined && delete stateHints[k]);
  if(Object.keys(stateHints).length) sessionPatch.stateHints = stateHints;
}

/* =========================================================
   NYX S2S — RESILIENCE HINTS (Phase 3)
   - Retry cap + timeout budget passed downstream
   - Actual retries/timeouts are enforced in chatEngine/tts layers
========================================================= */

function intEnv(name, fallback){
  const v = process.env[name];
  if(v === undefined) return fallback;
  const n = parseInt(String(v), 10);
  return Number.isFinite(n) ? n : fallback;
}

const SB_S2S_RETRY_CAP = intEnv("SB_S2S_RETRY_CAP", 1);       // max additional attempts downstream
const SB_S2S_TIMEOUT_MS = intEnv("SB_S2S_TIMEOUT_MS", 12000); // downstream budget (ms)

function setResilienceHints(sessionPatch){
  sessionPatch.resilience = {
    retry_cap: Math.max(0, Math.min(3, SB_S2S_RETRY_CAP)),
    timeout_ms: Math.max(1000, Math.min(30000, SB_S2S_TIMEOUT_MS))
  };
}

function emitJsonLog(obj){
  if(!SB_S2S_LOG_JSON) return;
  try { console.log(JSON.stringify(obj)); } catch(_e) {}
}

/* =========================================================
   NYX S2S — ROUTER (Warmth-first, with telemetry + hooks)
========================================================= */

function runLocalChat(transcript, session = {}, opts = {}){

  const t0 = nowMs();
  const msg = cleanText(transcript);

  const lane = String(opts.lane || pickLane(session));
  const turnId = String(opts.turnId || ensureTurnId(session));
  const requestId = String(opts.requestId || ensureRequestId(session, opts));

  // -------------------------------------------------------
  // WARMTH v1 — HARD PRECEDENCE (SOCIAL FIRST)
  // -------------------------------------------------------

  // -------------------------------------------------------
  // SUPPORT v1 — LOCAL DISTRESS PRECEDENCE (NON-CRISIS)
  // -------------------------------------------------------
  const support = _NYX_SUPPORT.detect(msg);
  if(SB_S2S_SUPPORT_LOCAL && support.type === "distress"){
    const reply = cleanText(_NYX_SUPPORT.reply());
    const t1 = nowMs();

    const sessionPatch = {
      intent_type: "distress",
      lane,
      turnId,
      requestId,
      cog: {
        support: {
          enabled: true,
          mode: "DISTRESS",
          localOk: true
        }
      }
    };

    // Phase 2/3: additive hints (fail-open)
    setStateHints(sessionPatch, session, { lastIntent: "distress", lastLane: lane, turnId });
    setResilienceHints(sessionPatch);

    if(SB_S2S_TIMING){
      sessionPatch.telemetry = {
        source: "s2s.local",
        t0_in_ms: t0,
        t1_reply_ready_ms: t1,
        dt_local_ms: Math.max(0, t1 - t0)
      };
    }

    const debug = SB_S2S_DEBUG ? {
      lane,
      turnId,
      requestId,
      support_type: support.type,
      msg_len: msg.length
    } : undefined;
    if(debug) sessionPatch.debug = debug;

    emitJsonLog({
      type: "s2s",
      lane,
      turnId,
      requestId,
      intent_type: "distress",
      dt_local_ms: sessionPatch.telemetry ? sessionPatch.telemetry.dt_local_ms : undefined
    });

    return { reply, sessionPatch };
  }

  const warm = _NYX_WARM.detect(msg);

  // Step 1: handshake/trace crumbs (debug-safe; no raw transcript by default)
  const debug = SB_S2S_DEBUG ? {
    lane,
    turnId,
    requestId,
    warm_type: warm.type,
    msg_len: msg.length
  } : undefined;

  // Greeting-only: short-circuit with a warm reply
  if(warm.type === "greeting_only"){
    const reply = cleanText(_NYX_WARM.greetingOnly());
    const t1 = nowMs();

    const sessionPatch = {
      intent_type: "greeting",
      lane,
      turnId,
      requestId
    };

    // Phase 2/3: additive hints (fail-open)
    setStateHints(sessionPatch, session, { lastIntent: "greeting", lastLane: lane, turnId });
    setResilienceHints(sessionPatch);

    if(SB_S2S_TIMING){
      sessionPatch.telemetry = {
        source: "s2s.local",
        t0_in_ms: t0,
        t1_reply_ready_ms: t1,
        dt_local_ms: Math.max(0, t1 - t0)
      };
    }

    if(debug) sessionPatch.debug = debug;

    emitJsonLog({
      type: "s2s",
      lane,
      turnId,
      requestId,
      intent_type: "greeting",
      dt_local_ms: sessionPatch.telemetry ? sessionPatch.telemetry.dt_local_ms : undefined
    });

    return { reply, sessionPatch };
  }

  const warmPrefix = warm.type === "greeting_mixed"
    ? _NYX_WARM.prefix()
    : "";

  // Normalize "none" -> "default" for consistent downstream anchors
  if(warm && warm.type === "none") warm.type = "default";

  // ---------------- Existing Routing Logic Placeholder ----------------
  // IMPORTANT: This simulates your original lane routing logic.
  // Replace this section with your actual routing implementation.
  //
  // Step 3/4/5 note:
  // - Retry/failover + fallback TTS + heartbeat are implemented in tts.js,
  //   not here, because this file is the conversational router.
  // - We still pass lane/turnId and timing stamps to make those layers observable.
  let reply = "Tell me what you want next: music, movies, or sponsors.";
  // ---------------------------------------------------------------------

  if(warmPrefix){
    reply = cleanText(warmPrefix + " " + reply);
  }

  const t1 = nowMs();

  const sessionPatch = {
    intent_type: warm.type || "default",
    lane,
    turnId,
      requestId
  };

  // Phase 2/3: additive hints (fail-open)
  setStateHints(sessionPatch, session, { lastIntent: sessionPatch.intent_type, lastLane: lane, turnId });
  setResilienceHints(sessionPatch);

  if(SB_S2S_TIMING){
    sessionPatch.telemetry = {
      source: "s2s.local",
      t0_in_ms: t0,
      t1_reply_ready_ms: t1,
      dt_local_ms: Math.max(0, t1 - t0)
    };
  }

  if(debug) sessionPatch.debug = debug;

  emitJsonLog({
    type: "s2s",
    lane,
    turnId,
    requestId,
    intent_type: sessionPatch.intent_type,
    dt_local_ms: sessionPatch.telemetry ? sessionPatch.telemetry.dt_local_ms : undefined
  });

  return {
    reply: cleanText(reply),
    sessionPatch
  };
}

module.exports = {
  runLocalChat
};

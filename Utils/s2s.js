
// =========================================================
// S2S.js — Nyx Server-to-Server Logic (Warmth v1 + Hard Precedence)
// =========================================================

"use strict";

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

function boolEnv(name, fallback=false){
  const v = process.env[name];
  if(v === undefined) return fallback;
  return String(v).toLowerCase() === "true" || String(v) === "1";
}

const SB_S2S_DEBUG = boolEnv("SB_S2S_DEBUG", false);            // safe debug crumbs
const SB_S2S_LOG_JSON = boolEnv("SB_S2S_LOG_JSON", false);      // emit structured logs
const SB_S2S_TIMING = boolEnv("SB_S2S_TIMING", true);           // attach telemetry to sessionPatch

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

  // -------------------------------------------------------
  // WARMTH v1 — HARD PRECEDENCE (SOCIAL FIRST)
  // -------------------------------------------------------
  const warm = _NYX_WARM.detect(msg);

  // Step 1: handshake/trace crumbs (debug-safe; no raw transcript by default)
  const debug = SB_S2S_DEBUG ? {
    lane,
    turnId,
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
      turnId
    };

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
      intent_type: "greeting",
      dt_local_ms: sessionPatch.telemetry ? sessionPatch.telemetry.dt_local_ms : undefined
    });

    return { reply, sessionPatch };
  }

  const warmPrefix = warm.type === "greeting_mixed"
    ? _NYX_WARM.prefix()
    : "";

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
    turnId
  };

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

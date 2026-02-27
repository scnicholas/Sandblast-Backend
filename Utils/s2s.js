
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

function runLocalChat(transcript, session = {}){

  const msg = cleanText(transcript);

  // -------------------------------------------------------
  // WARMTH v1 — HARD PRECEDENCE (SOCIAL FIRST)
  // -------------------------------------------------------
  const warm = _NYX_WARM.detect(msg);

  if(warm.type === "greeting_only"){
    return {
      reply: cleanText(_NYX_WARM.greetingOnly()),
      sessionPatch: { intent_type: "greeting" }
    };
  }

  const warmPrefix = warm.type === "greeting_mixed"
    ? _NYX_WARM.prefix()
    : "";

  // ---------------- Existing Routing Logic Placeholder ----------------
  // IMPORTANT: This simulates your original lane routing logic.
  // Replace this section with your actual routing implementation.

  let reply = "Tell me what you want next: music, movies, or sponsors.";

  // ---------------------------------------------------------------------

  if(warmPrefix){
    reply = cleanText(warmPrefix + " " + reply);
  }

  return {
    reply: cleanText(reply),
    sessionPatch: { intent_type: warm.type || "default" }
  };
}

module.exports = {
  runLocalChat
};

"use strict";

/**
 * Utils/cs1.js
 *
 * CS-1 = Continuity Selector v1
 * Optional layer used by chatEngine.js (v0.6z).
 *
 * Responsibilities:
 *  - Maintain a tiny continuity state machine under session.__cs1
 *  - Decide a "continuity line" to show (the engine only uses state + markSpoke today)
 *  - Track when the system "spoke" (intro/reset/reentry/clarify/nav/deeper) to prevent spam
 *
 * Exports:
 *  - decideCS1({ session, turnCount, intent, nowMs, isReturn, isGreeting, isHelp, isError, isFallback })
 *  - markSpoke(session, turnCount, nowMs, lineType)   // lineType normalized to: intro/reset/reentry/clarify/nav/deeper
 *
 * NOTE:
 *  - chatEngine currently calls decideCS1() mainly to ensure __cs1 exists and is persisted.
 *  - chatEngine calls markSpoke() on early-return / key responses.
 *  - This file MUST be safe if called with partial/empty session objects.
 */

const CS1_VERSION = "cs1 v1.0 (selector + spoke ledger)";

// ----------------------------
// Defaults / thresholds
// ----------------------------
const DEFAULTS = {
  version: CS1_VERSION,

  // last time a continuity line was emitted (by some higher layer, if you add it later)
  lastLineAt: 0,
  lastLineType: null,
  lastLineTurn: 0,

  // last time we "spoke" a key system line (intro/reset/reentry/clarify/nav/deeper)
  lastSpokeAt: 0,
  lastSpokeType: null,
  lastSpokeTurn: 0,

  // simple anti-spam counters
  spokeCounts: {
    intro: 0,
    reset: 0,
    reentry: 0,
    clarify: 0,
    nav: 0,
    deeper: 0
  },

  // rolling flags about the user
  flags: {
    seenGreeting: false,
    seenReturn: false,
    seenHelp: false,
    seenError: false,
    seenFallback: false
  },

  // optional "continuity intensity" (for future phrase packs)
  // 0 = minimal, 1 = normal, 2 = rich
  intensity: 1
};

const LINE_TYPES = new Set(["intro", "reset", "reentry", "clarify", "nav", "deeper"]);

// cooldown windows (ms)
const SPOKE_COOLDOWN_MS = {
  intro: 45_000,
  reset: 10_000,
  reentry: 30_000,
  clarify: 10_000,
  nav: 6_000,
  deeper: 8_000
};

// Hard caps per session (prevents pathological spam)
const SPOKE_MAX_PER_SESSION = {
  intro: 3,
  reset: 6,
  reentry: 4,
  clarify: 10,
  nav: 50,
  deeper: 25
};

// ----------------------------
// Helpers
// ----------------------------
function ensureCS1(session) {
  if (!session || typeof session !== "object") return { __tmp: true, ...DEFAULTS };

  const cur = session.__cs1;
  if (!cur || typeof cur !== "object") {
    session.__cs1 = { ...DEFAULTS };
    return session.__cs1;
  }

  // migrate/patch missing keys (non-destructive)
  if (!cur.version) cur.version = CS1_VERSION;
  if (!cur.spokeCounts || typeof cur.spokeCounts !== "object") cur.spokeCounts = { ...DEFAULTS.spokeCounts };
  for (const k of Object.keys(DEFAULTS.spokeCounts)) {
    if (typeof cur.spokeCounts[k] !== "number") cur.spokeCounts[k] = 0;
  }

  if (!cur.flags || typeof cur.flags !== "object") cur.flags = { ...DEFAULTS.flags };
  for (const k of Object.keys(DEFAULTS.flags)) {
    if (typeof cur.flags[k] !== "boolean") cur.flags[k] = false;
  }

  if (typeof cur.lastSpokeAt !== "number") cur.lastSpokeAt = 0;
  if (typeof cur.lastSpokeTurn !== "number") cur.lastSpokeTurn = 0;
  if (typeof cur.lastLineAt !== "number") cur.lastLineAt = 0;
  if (typeof cur.lastLineTurn !== "number") cur.lastLineTurn = 0;

  if (typeof cur.intensity !== "number") cur.intensity = DEFAULTS.intensity;

  return cur;
}

function safeType(t) {
  const s = String(t || "").toLowerCase().trim();
  return LINE_TYPES.has(s) ? s : "nav";
}

function canSpoke(cs1, now, lineType) {
  const lt = safeType(lineType);

  const count = Number(cs1.spokeCounts[lt] || 0);
  const max = Number(SPOKE_MAX_PER_SESSION[lt] || 999);
  if (count >= max) return false;

  const lastAt = Number(cs1.lastSpokeAt || 0);
  const lastType = safeType(cs1.lastSpokeType || "nav");
  const cd = Number(SPOKE_COOLDOWN_MS[lt] || 0);

  // If repeating same type within cooldown, deny
  if (lastType === lt && lastAt && (now - lastAt) < cd) return false;

  return true;
}

// ----------------------------
// Public API
// ----------------------------
function markSpoke(session, turnCount, nowMs, lineType) {
  const s = session && typeof session === "object" ? session : {};
  const cs1 = ensureCS1(s);

  const now = Number(nowMs) || Date.now();
  const turn = Number(turnCount) || 0;
  const lt = safeType(lineType);

  if (!canSpoke(cs1, now, lt)) return;

  cs1.lastSpokeAt = now;
  cs1.lastSpokeType = lt;
  cs1.lastSpokeTurn = turn;

  cs1.spokeCounts[lt] = Number(cs1.spokeCounts[lt] || 0) + 1;
}

/**
 * decideCS1()
 * Returns:
 *  {
 *    ok: true,
 *    lineType: <string|null>,   // reserved for future phrase packs
 *    allowEmit: <boolean>,      // reserved for future phrase packs
 *    sessionPatch: { __cs1: <object> }
 *  }
 *
 * Current usage in chatEngine v0.6z:
 *  - ensures session.__cs1 exists and is allowlisted for persistence
 */
function decideCS1({
  session,
  turnCount,
  intent,
  nowMs,
  isReturn,
  isGreeting,
  isHelp,
  isError,
  isFallback
} = {}) {
  const s = session && typeof session === "object" ? session : {};
  const cs1 = ensureCS1(s);

  const now = Number(nowMs) || Date.now();
  const turn = Number(turnCount) || 0;

  // update flags (non-destructive memory)
  if (isGreeting) cs1.flags.seenGreeting = true;
  if (isReturn) cs1.flags.seenReturn = true;
  if (isHelp) cs1.flags.seenHelp = true;
  if (isError) cs1.flags.seenError = true;
  if (isFallback) cs1.flags.seenFallback = true;

  // small adaptive intensity heuristic (optional)
  // - if user keeps asking help/error, slightly increase context richness
  // - if user is navigating quickly, keep it normal
  const helpish = (cs1.flags.seenHelp || cs1.flags.seenError || cs1.flags.seenFallback) ? 1 : 0;
  const navish = /nav|next|prev|advance/.test(String(intent || "").toLowerCase()) ? 1 : 0;

  let intensity = Number(cs1.intensity || 1);
  if (helpish && intensity < 2) intensity = 2;
  if (!helpish && navish && intensity > 1) intensity = 1;
  cs1.intensity = intensity;

  // Reserved for future: determine if we should emit a continuity line
  // For now, we do not emit anything; chatEngine uses markSpoke separately.
  const decision = {
    ok: true,
    lineType: null,
    allowEmit: false,
    sessionPatch: {
      __cs1: cs1
    },
    meta: {
      version: CS1_VERSION,
      turn,
      ts: now,
      intent: String(intent || "general"),
      intensity
    }
  };

  return decision;
}

module.exports = {
  decideCS1,
  markSpoke
};

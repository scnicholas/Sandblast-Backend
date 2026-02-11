"use strict";

/**
 * Utils/chatEngine.js
 *
 * Pure chat engine:
 *  - NO express
 *  - NO server start
 *  - NO index.js imports
 *
 * Returns (NyxReplyContract v1 + backwards compatibility):
 *  {
 *    ok, reply, lane, ctx, ui,
 *    directives: [{type, ...}],             // optional
 *    followUps: [{id,type,label,payload}],  // preferred
 *    followUpsStrings: ["..."],             // legacy
 *    sessionPatch, cog, requestId, meta
 *  }
 *
 * v0.7bS (MARION SO WIRED++++ + TELEMETRY++++ + DISCOVERY HINT++++: MarionSO remains canonical mediator; adds bounded telemetry + novelty/discovery hint for brittle/novel scenarios)
 * ✅ Keeps: v0.7bQ STATE SPINE WIRED++++ (Utils/stateSpine.js canonical planner + pendingAsk clear on chip-year)
 * ✅ Keeps: v0.7bP PENDINGASK CLEAR ON CHIP-YEAR++++ (via stateSpine finalize)
 * ✅ Keeps: v0.7bO STATE SPINE ENFORCEMENT++++ (rev per turn + single decideNextMove() + move-explain every turn)
 * ✅ Keeps: v0.7bN HARDENING++++ (actionable payload gating + activeContext refresh + typedYear precision + tone scrub scope + loop sig normalization + meta consistency)
 * ✅ Keeps: v0.7bM click-to-context binding + pendingAsk + action trace
 * ✅ Keeps: MARION SPINE LOGGING++++, counselor-lite intro, CHIP COMPRESSION++++,
 *          TOP10-ONLY++++ (no #1 route anywhere), Top10 visibility fix (no Top 4 truncation),
 *          Mac Mode signal, desire+confidence arbitration, Velvet mode (music-first),
 *          tone constitution + regression tests, payload beats silence, chip-click advance,
 *          pinned aliases, accurate miss reasons, year-end route, loop dampener, derived guard default OFF,
 *          followUps, session keys
 *
 * ✅ Option A GREETING PREFIX++++:
 *    - Adds a small first-turn greeting line ONCE per session
 *    - NEVER applied on replay/burst (inboundKey repeat) to prevent perceived loops / repeated TTS
 *    - Inserted after move-explain line to preserve “move speaks first” constitution
 */

const CE_VERSION =
  "chatEngine v0.7bS (MARION SO WIRED++++ via Utils/marionSO.js | TELEMETRY++++ + DISCOVERY HINT++++ | STATE SPINE WIRED++++ via Utils/stateSpine.js | PENDINGASK CLEAR ON CHIP-YEAR++++ | HARDENING++++ + MARION SPINE LOGGING++++ + COUNSELOR-LITE INTRO++++ + CHIP COMPRESSION++++ + DESIRE+CONFIDENCE ARBITRATION++++ + VELVET (MUSIC-FIRST)++++ + TONE TESTS++++ + TOP10-ONLY + Top10 visibility fix + payload beats silence + chip-click advance + pinned aliases + accurate miss reasons + year-end route + loop dampener)";

const Spine = require("./stateSpine");
const MarionSO = require("./marionSO");

// Prefer MarionSO enums when present; keep local fallback for backward compatibility/tests.
const SO_LATENT_DESIRE = MarionSO && MarionSO.LATENT_DESIRE ? MarionSO.LATENT_DESIRE : null;

// -------------------------
// helpers
// -------------------------
function nowMs() {
  return Date.now();
}
function safeStr(x) {
  return x === null || x === undefined ? "" : String(x);
}
function isPlainObject(x) {
  return (
    !!x &&
    typeof x === "object" &&
    (Object.getPrototypeOf(x) === Object.prototype ||
      Object.getPrototypeOf(x) === null)
  );
}
function clampInt(v, def, min, max) {
  const n = Number(v);
  if (!Number.isFinite(n)) return def;
  const t = Math.trunc(n);
  if (t < min) return min;
  if (t > max) return max;
  return t;
}
function clamp01(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}
function sha1Lite(str) {
  // small stable hash (NOT cryptographic) for loop signatures / traces
  const s = safeStr(str);
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}
function normYear(y) {
  const n = Number(y);
  if (!Number.isFinite(n)) return null;
  const t = Math.trunc(n);
  if (t < 1900 || t > 2100) return null;
  return t;
}
function asArray(x) {
  return Array.isArray(x) ? x : [];
}
function truthy(v) {
  if (v === true) return true;
  const s = safeStr(v).trim().toLowerCase();
  return s === "1" || s === "true" || s === "yes" || s === "y" || s === "on";
}
function compactList(items, maxN) {
  const arr = Array.isArray(items) ? items : [];
  return arr.slice(0, maxN);
}
function normalizeSongLine(r) {
  const o = isPlainObject(r) ? r : {};
  const pos = clampInt(
    o.pos ?? o.rank ?? o.position ?? o["#"] ?? o.no ?? o.number,
    null,
    1,
    500
  );
  const title = safeStr(o.title ?? o.song ?? o.single ?? o.track ?? "").trim();
  const artist = safeStr(o.artist ?? o.artists ?? o.performer ?? "").trim();
  return { pos: pos || null, title, artist };
}
function extractYearFromText(t) {
  const s = safeStr(t).trim();
  if (!s) return null;
  const m = s.match(/\b(19[5-9]\d|20[0-2]\d|2025)\b/);
  if (!m) return null;
  const y = Number(m[1]);
  return normYear(y);
}
function textHasYearToken(t) {
  return extractYearFromText(t) !== null;
}
function normVibe(v) {
  const s = safeStr(v).trim().toLowerCase();
  if (!s) return "";
  if (s.includes("rom")) return "romantic";
  if (s.includes("reb")) return "rebellious";
  if (s.includes("nos")) return "nostalgic";
  return s;
}
function oneLine(s) {
  return safeStr(s).replace(/\s+/g, " ").trim();
}
function splitLines(s) {
  return safeStr(s).split("\n");
}
function takeLines(s, maxLines) {
  const lines = splitLines(s);
  return lines.slice(0, Math.max(1, maxLines)).join("\n").trim();
}
function countNumberedLines(text) {
  const lines = splitLines(text);
  let n = 0;
  for (const ln of lines) {
    if (/^\s*\d+\.\s+/.test(ln)) n++;
  }
  return n;
}
function applyBudgetText(s, budget) {
  // budget: "short" | "medium"
  // FIX: ranked lists (Top 10 / Hot 100 excerpts) must not be cut to Top 4.
  const txt = safeStr(s).trim();
  if (!txt) return "";

  const numbered = countNumberedLines(txt);

  // If it's a ranked list, keep enough lines to show the list meaningfully.
  if (numbered >= 6) {
    if (budget === "short") return takeLines(txt, 16); // safely covers Top 10
    return takeLines(txt, 28); // covers 20-row excerpt comfortably
  }

  // Non-list copy: tighter.
  if (budget === "short") return takeLines(txt, 6);
  return takeLines(txt, 14);
}

function stableSourceKey(sourceKey) {
  // Normalize potentially long/variable keys to a stable short token for loop sigs.
  const s = safeStr(sourceKey).trim();
  if (!s) return "";
  const parts = s.split(/[\\/]/).filter(Boolean);
  const last = parts.length ? parts[parts.length - 1] : s;
  return last.replace(/\.json$/i, "");
}

function hasActionablePayload(payload) {
  if (!isPlainObject(payload)) return false;
  const keys = Object.keys(payload);
  if (!keys.length) return false;
  // Only these keys count as "turn is actionable" (prevents ADVANCE on trivial client metadata).
  const actionable = new Set([
    "action",
    "route",
    "year",
    "id",
    "_id",
    "label",
    "lane",
    "vibe",
    "macMode",
    "mode",
    "allowDerivedTop10",
    "allowYearendFallback",
    "focus",
  ]);
  return keys.some((k) => actionable.has(k));
}

// -------------------------
// Option A greeting prefix (once per session, never on replay/burst)
// -------------------------
function buildInboundKey(norm) {
  // Keep stable + bounded; no need for cryptographic strength.
  // IMPORTANT: include only what defines “same turn” for replay detection.
  const p = isPlainObject(norm?.payload) ? norm.payload : {};
  const keyObj = {
    t: safeStr(norm?.text || ""),
    a: safeStr(norm?.action || ""),
    y: normYear(norm?.year),
    l: safeStr(norm?.lane || ""),
    v: safeStr(norm?.vibe || ""),
    // actionable payload subset only
    pa: safeStr(p.action || ""),
    py: normYear(p.year),
    pl: safeStr(p.lane || ""),
    pr: safeStr(p.route || ""),
    pv: safeStr(p.vibe || ""),
  };
  return sha1Lite(JSON.stringify(keyObj)).slice(0, 18);
}

function computeOptionAGreetingLine(session, norm, cog, inboundKey) {
  const s = isPlainObject(session) ? session : {};
  const already = truthy(s.__greeted);
  if (already) return "";

  // Never greet on replay/burst (same inboundKey)
  const lastKey = safeStr(s.__lastInboundKey || "").trim();
  if (lastKey && inboundKey && lastKey === inboundKey) return "";

  // Avoid greeting on text-empty chip taps (these are frequently re-fired by UI)
  if (norm?.turnSignals?.textEmpty && norm?.turnSignals?.hasPayload) return "";

  // Don’t step on counselor-lite boundary/intro.
  if (safeStr(norm?.action || "") === "counsel_intro") return "";

  // Keep tiny; mode-sensitive but not verbose.
  const mode = safeStr(cog?.mode || "").toLowerCase();
  if (mode === "architect") return "Alright, Mac.";
  if (mode === "transitional") return "Okay, Mac.";
  return "Hey Mac.";
}

// -------------------------
// config
// -------------------------
const PUBLIC_MIN_YEAR = 1950;
const PUBLIC_MAX_YEAR = 2025;

// -------------------------
// STATE SPINE (canonical) — WIRED TO Utils/stateSpine.js
// -------------------------
function toUpperMove(move) {
  const m = safeStr(move || "").toLowerCase();
  if (m === "advance") return "ADVANCE";
  if (m === "narrow") return "NARROW";
  if (m === "clarify") return "CLARIFY";
  if (m === "close") return "CLOSE";
  return "CLARIFY";
}

function coerceCoreSpine(session) {
  const s = isPlainObject(session) ? session : {};
  const prev = isPlainObject(s.__spineState) ? s.__spineState : null;

  // Seed from whatever we can safely infer; do NOT import big legacy objects.
  const seed = {
    lane: safeStr(s.lane || "").trim() || "general",
    stage: safeStr(prev?.stage || "").trim() || "open",
    topic: safeStr(prev?.topic || "").trim() || "",
    lastUserIntent: safeStr(prev?.lastUserIntent || "").trim() || "",
    pendingAsk: prev?.pendingAsk || null,
    goal: prev?.goal || null,
    engagementTemp: prev?.engagementTemp || safeStr(s.engagementTemp || ""),
  };

  // If no prior spine, create; if exists, accept but sanitize through updateState() later.
  if (!prev || typeof prev !== "object") return Spine.createState(seed);

  // Ensure version tag exists (fail-open)
  const out = { ...prev };
  if (!safeStr(out.__spineVersion)) out.__spineVersion = Spine.SPINE_VERSION;
  if (!Number.isFinite(out.rev)) out.rev = 0;
  return out;
}

/**
 * Finalize spine ONCE per turn.
 * - uses Spine.decideNextMove() as canonical planner
 * - increments rev via Spine.updateState()
 * - clears pendingAsk if answered by typed year OR chip-year
 */
function finalizeCoreSpine({
  corePrev,
  inboundNorm,
  lane,
  topic,
  pendingAskPatch, // {id,type,prompt,required} or null
  lastUserIntent,
  lastAssistantSummary,
  decisionUpper, // {move,rationale,speak,stage}
  actionTaken,
}) {
  const prev =
    corePrev && typeof corePrev === "object" ? corePrev : Spine.createState();

  const typedYearAnswered =
    !inboundNorm?.turnSignals?.textEmpty &&
    textHasYearToken(inboundNorm?.text || "");

  const chipYearAnswered =
    !!inboundNorm?.turnSignals?.payloadActionable &&
    inboundNorm?.turnSignals?.payloadYear !== null &&
    inboundNorm?.turnSignals?.hasPayload === true;

  const answeredPendingAsk = typedYearAnswered || chipYearAnswered;

  const patch = {
    lane: lane || prev.lane,
    stage: safeStr(decisionUpper?.stage || "") || prev.stage,
    topic: topic != null ? safeStr(topic) : prev.topic,
    lastUserIntent:
      lastUserIntent != null ? safeStr(lastUserIntent) : prev.lastUserIntent,
    lastUserText:
      inboundNorm?.text != null ? safeStr(inboundNorm.text) : prev.lastUserText,
    lastAssistantSummary:
      lastAssistantSummary != null
        ? safeStr(lastAssistantSummary)
        : prev.lastAssistantSummary,
    lastMove: safeStr(decisionUpper?.move || ""),
    diag: {
      lastDecision: {
        move: safeStr(decisionUpper?.move || ""),
        rationale: safeStr(decisionUpper?.rationale || ""),
        speak: safeStr(decisionUpper?.speak || ""),
        actionTaken: safeStr(actionTaken || ""),
      },
    },
    pendingAsk: answeredPendingAsk ? null : pendingAskPatch || null,
    engagementTemp: prev.engagementTemp,
  };

  let next = Spine.updateState(prev, patch, "turn");

  // ENFORCEMENT++++: must increment exactly once per turn
  try {
    Spine.assertTurnUpdated(prev, next);
  } catch (e) {
    // fail-open: correct rev and keep UX alive
    const fixed = {
      ...next,
      rev: (Number.isFinite(prev.rev) ? prev.rev : 0) + 1,
    };
    next = fixed;
  }

  return next;
}

// -------------------------
// Marion spine logging (bounded, no PII)
// -------------------------
const MARION_TRACE_MAX = 160; // hard cap in chars
function marionTraceBuild(norm, s, med) {
  // IMPORTANT: no raw user text; only booleans + enums + tiny numeric features
  const y = normYear(norm?.year);
  const parts = [
    `m=${safeStr(med?.mode || "")}`,
    `i=${safeStr(med?.intent || "")}`,
    `d=${safeStr(med?.dominance || "")}`,
    `b=${safeStr(med?.budget || "")}`,
    `a=${safeStr(norm?.action || "") || "-"}`,
    `y=${y !== null ? y : "-"}`,
    `p=${med?.actionable ? "1" : "0"}`,
    `e=${med?.textEmpty ? "1" : "0"}`,
    `st=${med?.stalled ? "1" : "0"}`,
    `ld=${safeStr(med?.latentDesire || "")}`,
    `cu=${String(Math.round(clamp01(med?.confidence?.user) * 100))}`,
    `cn=${String(Math.round(clamp01(med?.confidence?.nyx) * 100))}`,
    `v=${med?.velvet ? "1" : "0"}`,
    `vr=${safeStr(med?.velvetReason || "") || "-"}`,
  ];

  const base = parts.join("|");
  if (base.length <= MARION_TRACE_MAX) return base;
  return base.slice(0, MARION_TRACE_MAX - 3) + "...";
}
function marionTraceHash(trace) {
  return sha1Lite(safeStr(trace)).slice(0, 10);
}

// -------------------------
// TELEMETRY++++ + novelty/discovery hint (bounded, no text)
// -------------------------
function computeNoveltyScore(norm, session, cog) {
  const s = isPlainObject(session) ? session : {};
  const t = safeStr(norm?.text || "");
  const action = safeStr(norm?.action || "").trim();
  const lane = safeStr(norm?.lane || "").trim();
  const hasPayload = !!norm?.turnSignals?.hasPayload;
  const actionablePayload = !!norm?.turnSignals?.payloadActionable;
  const textEmpty = !!norm?.turnSignals?.textEmpty;

  let score = 0;

  // Unknown/empty action is a novelty driver (especially outside music).
  if (!action) score += 0.18;

  // Long unstructured text -> likely novel scenario.
  const len = t.length;
  if (len >= 180) score += 0.18;
  if (len >= 420) score += 0.18;

  // Many question marks / mixed asks -> novelty.
  const q = (t.match(/\?/g) || []).length;
  if (q >= 2) score += 0.12;
  if (q >= 4) score += 0.12;

  // No payload and not actionable -> higher novelty.
  if (!hasPayload && !action) score += 0.12;

  // Text empty with payload is usually NOT novel (chip tap = clear).
  if (textEmpty && actionablePayload) score -= 0.15;

  // Lane shifts without explicit instruction can signal novelty/confusion.
  const lastLane = safeStr(s.lane || "").trim();
  if (lastLane && lane && lastLane !== lane && !action) score += 0.10;

  // Stabilize intent lowers novelty (it’s not "unknown", it’s dysregulation/need).
  if (safeStr(cog?.intent || "").toUpperCase() === "STABILIZE") score -= 0.10;

  return clamp01(score);
}

function buildDiscoveryHint(norm, session, cog, noveltyScore) {
  const mode = safeStr(cog?.mode || "").toLowerCase();
  const intent = safeStr(cog?.intent || "").toUpperCase();
  const lane =
    safeStr(norm?.lane || "").trim() ||
    safeStr(session?.lane || "").trim() ||
    "general";
  const action = safeStr(norm?.action || "").trim();

  // Only for CLARIFY turns that are non-actionable, where novelty is high-ish.
  const actionable = !!cog?.actionable;
  if (intent !== "CLARIFY" || actionable) {
    return { enabled: false, reason: "no" };
  }
  if (noveltyScore < 0.65) {
    return { enabled: false, reason: "low_novelty" };
  }

  // Prefer forced-choice collapse for architect/transitional; gentle for user.
  const forcedChoice = mode === "architect" || mode === "transitional";

  // Decide the single constraint question (no text storage).
  let question = "Pick one: what do you want next?";
  let options = ["Music", "Movies", "Sponsors"];

  if (lane === "music" || action) {
    // If they’re already near music but unclear, ask for year/route explicitly.
    question = `Pick one: Top 10, cinematic, or year-end?`;
    options = ["Top 10", "Make it cinematic", "Year-End Hot 100"];
  }

  if (!forcedChoice) {
    // user mode: still sharp, but softer.
    question =
      lane === "music" ? `Which one should I do first?` : `What should we do first?`;
  }

  return {
    enabled: true,
    reason: "novelty_high",
    forcedChoice: !!forcedChoice,
    question,
    options: options.slice(0, 4),
  };
}

function buildBoundedTelemetry(
  norm,
  session,
  cog,
  corePrev,
  corePlan,
  noveltyScore,
  discoveryHint
) {
  // No raw text. Scalars + enums only.
  const s = isPlainObject(session) ? session : {};
  const y = normYear(norm?.year ?? s.lastYear);
  return {
    v: "telemetry.v1",
    t: nowMs(),
    marion: {
      version: safeStr(cog?.marionVersion || ""),
      mode: safeStr(cog?.mode || ""),
      intent: safeStr(cog?.intent || ""),
      dominance: safeStr(cog?.dominance || ""),
      budget: safeStr(cog?.budget || ""),
      actionable: !!cog?.actionable,
      stalled: !!cog?.stalled,
      textEmpty: !!cog?.textEmpty,
      latentDesire: safeStr(cog?.latentDesire || ""),
      confUser: Math.round(clamp01(cog?.confidence?.user) * 100),
      confNyx: Math.round(clamp01(cog?.confidence?.nyx) * 100),
      velvet: !!cog?.velvet,
      traceHash: safeStr(cog?.marionTraceHash || ""),
      novelty: Math.round(clamp01(noveltyScore) * 100),
      discovery: discoveryHint?.enabled
        ? {
            enabled: true,
            forcedChoice: !!discoveryHint.forcedChoice,
            reason: safeStr(discoveryHint.reason || ""),
          }
        : { enabled: false, reason: safeStr(discoveryHint?.reason || "no") },
    },
    turn: {
      lane: safeStr(norm?.lane || s.lane || corePrev?.lane || ""),
      action: safeStr(norm?.action || ""),
      year: y !== null ? y : null,
      hasPayload: !!norm?.turnSignals?.hasPayload,
      payloadActionable: !!norm?.turnSignals?.payloadActionable,
    },
    spine: {
      v: Spine.SPINE_VERSION,
      prevRev: Number.isFinite(corePrev?.rev) ? corePrev.rev : 0,
      plannedMove: safeStr(corePlan?.move || ""),
      plannedStage: safeStr(corePlan?.stage || ""),
    },
  };
}

// -------------------------
// cognitive enums (DESIRE / transitions)
// -------------------------
const LATENT_DESIRE = Object.freeze({
  AUTHORITY: "authority",
  COMFORT: "comfort",
  CURIOSITY: "curiosity",
  VALIDATION: "validation",
  MASTERY: "mastery",
});

const SIGNATURE_TRANSITIONS = Object.freeze([
  "Now we widen the lens.",
  "This is where it starts to mean something.",
  "Let’s slow this down for a second.",
  "Here’s the connective tissue.",
  "This isn’t random—watch.",
]);

function pickSignatureTransition(session, cog) {
  // Rare + deliberate: only when Nyx is leading, and only if not used last turn.
  if (!cog || cog.intent !== "ADVANCE") return "";
  if (cog.dominance !== "firm") return "";
  if (clamp01(cog?.confidence?.nyx) < 0.65) return "";

  const last = safeStr(session?.lastSigTransition || "").trim();
  // avoid repeats; pick first non-repeat deterministically
  for (const t of SIGNATURE_TRANSITIONS) {
    if (t !== last) return t;
  }
  return "";
}

function detectSignatureLine(replyText) {
  const first = safeStr(replyText).split("\n")[0].trim();
  if (!first) return "";
  for (const t of SIGNATURE_TRANSITIONS) {
    if (first === t) return first;
  }
  return "";
}

// -------------------------
// inbound parse / intent
// -------------------------
function classifyAction(text, payload) {
  const t = safeStr(text).toLowerCase();
  const pA = safeStr(payload?.action || "").trim();
  if (pA) return pA;

  // counselor-lite / listening entry (non-clinical)
  if (
    /\b(i need to talk|can we talk|just talk|listen to me|i need someone to listen|vent|i want to vent|what should we talk about|what do you want to talk about)\b/.test(
      t
    )
  )
    return "counsel_intro";

  if (/\b(top\s*10|top ten)\b/.test(t)) return "top10";
  if (/\b(story\s*moment|make it cinematic|cinematic)\b/.test(t))
    return "story_moment";

  // micro route still supported (typed or payload), just not promoted as a verbose chip
  if (/\b(micro\s*moment|tap micro|seal the vibe)\b/.test(t))
    return "micro_moment";

  if (
    /\b(year[-\s]*end|year end|yearend)\b/.test(t) &&
    /\bhot\s*100\b/.test(t)
  )
    return "yearend_hot100";

  if (t === "__cmd:reset__" || /\b(reset|start over|clear session)\b/.test(t))
    return "reset";
  if (/\b(pick another year|another year|new year)\b/.test(t)) return "ask_year";
  if (/\b(switch lane|change lane|other lane)\b/.test(t))
    return "switch_lane";

  const hasVibe = /\b(romantic|rebellious|nostalgic)\b/.test(t);
  if (
    hasVibe &&
    (/\b(story|moment|cinematic)\b/.test(t) || /\b(make it|give me)\b/.test(t))
  )
    return "custom_story";

  return "";
}

function normalizeMacModeRaw(v) {
  const s = safeStr(v).trim().toLowerCase();
  if (!s) return "";
  if (s === "architect" || s === "builder" || s === "dev") return "architect";
  if (s === "user" || s === "viewer" || s === "consumer") return "user";
  if (s === "transitional" || s === "mixed" || s === "both")
    return "transitional";
  return "";
}

function detectMacModeImplicit(text) {
  const t = safeStr(text).trim();
  if (!t) return { mode: "", scoreA: 0, scoreU: 0, scoreT: 0, why: [] };

  const s = t.toLowerCase();
  let a = 0,
    u = 0,
    tr = 0;
  const why = [];

  // Architect signals
  if (
    /\b(let's|lets)\s+(define|design|lock|implement|encode|ship|wire)\b/.test(s)
  ) {
    a += 3;
    why.push("architect:lets-define/design");
  }
  if (
    /\b(non[-\s]?negotiable|must|hard rule|lock this in|constitution|mediator|pipeline|governor|decision table)\b/.test(
      s
    )
  ) {
    a += 3;
    why.push("architect:constraints/architecture");
  }
  if (
    /\b(step\s*\d+|1\s*,\s*2\s*,\s*3|1\s*2\s*3)\b/.test(s) ||
    /\b\d+\)\s/.test(s)
  ) {
    a += 2;
    why.push("architect:enumeration");
  }
  if (
    /\b(index\.js|chatengine\.js|statespine\.js|render|cors|session|payload|json|endpoint|route|resolver|pack|tests?)\b/.test(
      s
    )
  ) {
    a += 2;
    why.push("architect:technical");
  }

  // User signals
  if (
    /\b(i('?m)?\s+not\s+sure|help\s+me\s+understand|does\s+this\s+make\s+sense|where\s+do\s+i|get\s+the\s+url)\b/.test(
      s
    )
  ) {
    u += 3;
    why.push("user:uncertainty/how-to");
  }
  if (/\b(confused|stuck|frustrated|overwhelmed|worried)\b/.test(s)) {
    u += 2;
    why.push("user:emotion");
  }

  // Transitional signals (mixed)
  if (a > 0 && u > 0) {
    tr += 3;
    why.push("transitional:mixed-signals");
  }

  let mode = "";
  if (tr >= 3) mode = "transitional";
  else if (a >= u + 2) mode = "architect";
  else if (u >= a + 2) mode = "user";
  else mode = ""; // uncertain -> let mediator default

  return { mode, scoreA: a, scoreU: u, scoreT: tr, why };
}

function classifyTurnIntent(
  text,
  action,
  hasPayload,
  payloadAction,
  payloadYear,
  textEmpty,
  payloadActionable
) {
  const s = safeStr(text).trim().toLowerCase();
  const hasAction = !!safeStr(action).trim();

  // ADVANCE is dominant when the turn is actionable (payload beats silence)
  if (hasAction) return "ADVANCE";
  if (payloadActionable && hasPayload && (payloadAction || payloadYear !== null))
    return "ADVANCE";
  if (payloadActionable && textEmpty && hasPayload) return "ADVANCE";

  // CLARIFY
  if (
    /\b(explain|how do i|how to|what is|walk me through|where do i|get|why)\b/.test(
      s
    )
  )
    return "CLARIFY";

  // STABILIZE
  if (
    /\b(i('?m)?\s+stuck|i('?m)?\s+worried|overwhelmed|frustrated|anxious)\b/.test(
      s
    )
  )
    return "STABILIZE";

  // Default
  return "CLARIFY";
}

// -------------------------
// latent desire inference
// -------------------------
function inferLatentDesire(norm, session, cog) {
  const t = safeStr(norm?.text || "").toLowerCase();
  const a = safeStr(norm?.action || "").toLowerCase();
  const macMode = safeStr(cog?.mode || "").toLowerCase();

  // Strong signals
  if (
    /\b(optimi[sz]e|systems?|framework|architecture|hard(en)?|constraints?|regression tests?|unit tests?)\b/.test(
      t
    )
  )
    return LATENT_DESIRE.MASTERY;

  if (
    /\b(am i right|do i make sense|how am i perceived|handsome|attractive|validation|do you think)\b/.test(
      t
    )
  )
    return LATENT_DESIRE.VALIDATION;

  if (/\b(why|meaning|connect|pattern|link|what connects|deeper|layer)\b/.test(t))
    return LATENT_DESIRE.CURIOSITY;

  if (/\b(worried|overwhelmed|stuck|anxious|stress|reassure|calm)\b/.test(t))
    return LATENT_DESIRE.COMFORT;

  // counselor-lite typically comfort/clarity
  if (a === "counsel_intro") return LATENT_DESIRE.COMFORT;

  // Music interactions typically seek anchoring/authority unless explicitly reflective
  if (a === "top10" || a === "yearend_hot100") return LATENT_DESIRE.AUTHORITY;
  if (a === "story_moment" || a === "micro_moment" || a === "custom_story")
    return LATENT_DESIRE.COMFORT;

  // Architect mode leans authority/mastery depending on tech density
  if (macMode === "architect") {
    if (/\bdesign|implement|encode|ship|lock\b/.test(t))
      return LATENT_DESIRE.MASTERY;
    return LATENT_DESIRE.AUTHORITY;
  }

  // Otherwise: continuity (comfort) if we're already in velvet, else curiosity default
  if (truthy(session?.velvetMode)) return LATENT_DESIRE.COMFORT;

  return LATENT_DESIRE.CURIOSITY;
}

// -------------------------
// confidence scalar inference
// -------------------------
function inferConfidence(norm, session, cog) {
  const s = isPlainObject(session) ? session : {};
  const text = safeStr(norm?.text || "").trim();
  const action = safeStr(norm?.action || "").trim();
  const hasPayload = !!norm?.turnSignals?.hasPayload;
  const textEmpty = !!norm?.turnSignals?.textEmpty;
  const actionablePayload = !!norm?.turnSignals?.payloadActionable;

  // user confidence proxy
  let user = 0.5;

  if (
    action ||
    (actionablePayload &&
      hasPayload &&
      (norm?.turnSignals?.payloadAction ||
        norm?.turnSignals?.payloadYear !== null))
  )
    user += 0.15; // decisive click/action
  if (textEmpty && hasPayload && actionablePayload) user += 0.05; // confident chip tap
  if (/\b(i('?m)?\s+not\s+sure|confused|stuck|overwhelmed)\b/i.test(text))
    user -= 0.25;
  if (/\b(are you sure|really\??)\b/i.test(text)) user -= 0.1;

  // Nyx confidence: how firmly she should lead
  let nyx = 0.55;

  // ADVANCE allows leadership
  if (safeStr(cog?.intent).toUpperCase() === "ADVANCE") nyx += 0.15;

  // Resistance stabilizes, reduces firm lead
  if (safeStr(cog?.intent).toUpperCase() === "STABILIZE") nyx -= 0.25;

  // If user keeps repeating same ask without progress, Nyx should lead more (calmly)
  const lastAction = safeStr(s.lastAction || "").trim();
  const lastYear = normYear(s.lastYear);
  const yr = normYear(norm?.year);
  if (lastAction && lastAction === action && lastYear && yr && lastYear === yr)
    nyx += 0.1;

  // Mode arbitration
  const mode = safeStr(cog?.mode || "").toLowerCase();
  if (mode === "architect" || mode === "transitional") nyx += 0.05;
  if (mode === "user") nyx -= 0.05;

  return { user: clamp01(user), nyx: clamp01(nyx) };
}

// -------------------------
// velvet mode (music-first binding)
// -------------------------
function computeVelvet(norm, session, cog, desire) {
  const s = isPlainObject(session) ? session : {};
  const action = safeStr(norm?.action || "").trim();
  const lane = safeStr(norm?.lane || "").trim() || (action ? "music" : "");
  const yr = normYear(norm?.year);
  const lastYear = normYear(s.lastYear);
  const lastLane = safeStr(s.lane || "").trim();
  const now = nowMs();

  const already = truthy(s.velvetMode);
  const wantsDepth =
    action === "story_moment" ||
    action === "micro_moment" ||
    action === "custom_story" ||
    /\b(why|meaning|connect|deeper|layer)\b/i.test(safeStr(norm?.text || ""));

  const repeatedTopic = !!(
    lastLane &&
    lane &&
    lastLane === lane &&
    yr &&
    lastYear &&
    yr === lastYear
  );
  const acceptedChip = !!(
    norm?.turnSignals?.hasPayload &&
    norm?.turnSignals?.payloadActionable &&
    (norm?.turnSignals?.payloadAction || norm?.turnSignals?.payloadYear !== null)
  );

  // music-first rule: velvet is primarily for music/memory moments first
  const musicFirstEligible = lane === "music" || action;

  // entry: any 2 signals (as per spec)
  let signals = 0;
  if (wantsDepth) signals++;
  if (repeatedTopic) signals++;
  if (acceptedChip) signals++;
  if (clamp01(cog?.confidence?.nyx) >= 0.6) signals++;
  if (desire === LATENT_DESIRE.COMFORT || desire === LATENT_DESIRE.CURIOSITY)
    signals++;

  if (!musicFirstEligible) {
    // outside music: keep velvet only if already active (don’t spread too early)
    return {
      velvet: already,
      velvetSince: Number(s.velvetSince || 0) || 0,
      reason: already ? "carry" : "no",
    };
  }

  if (already) {
    // exit rules: hard topic shift or stabilize intent
    if (safeStr(cog?.intent).toUpperCase() === "STABILIZE") {
      return {
        velvet: false,
        velvetSince: Number(s.velvetSince || 0) || 0,
        reason: "stabilize_exit",
      };
    }
    if (lastLane && lane && lastLane !== lane) {
      return {
        velvet: false,
        velvetSince: Number(s.velvetSince || 0) || 0,
        reason: "lane_shift_exit",
      };
    }
    // otherwise keep it
    return {
      velvet: true,
      velvetSince: Number(s.velvetSince || 0) || now,
      reason: "hold",
    };
  }

  if (signals >= 2) {
    return { velvet: true, velvetSince: now, reason: "entry" };
  }

  return { velvet: false, velvetSince: 0, reason: "no" };
}

// -------------------------
// normalize inbound
// -------------------------
function normalizeInbound(input) {
  const body = isPlainObject(input) ? input : {};
  const payload = isPlainObject(body.payload) ? body.payload : {};
  const ctx = isPlainObject(body.ctx) ? body.ctx : {};
  const client = isPlainObject(body.client) ? body.client : {};

  const textRaw = safeStr(
    body.text ||
      body.message ||
      body.prompt ||
      body.query ||
      payload.text ||
      payload.message ||
      ""
  ).trim();

  // PAYLOAD BEATS SILENCE: treat chip clicks as real turns even when text is empty
  const payloadAction = safeStr(payload.action || body.action || ctx.action || "")
    .trim();
  const inferredAction = classifyAction(textRaw, payload);
  const action = payloadAction || inferredAction || "";

  const payloadYear =
    normYear(payload.year) ?? normYear(body.year) ?? normYear(ctx.year) ?? null;

  const year = payloadYear ?? extractYearFromText(textRaw) ?? null;

  const lane = safeStr(body.lane || payload.lane || ctx.lane || "").trim();

  const vibe = safeStr(payload.vibe || body.vibe || ctx.vibe || "").trim() || "";

  const allowDerivedTop10 =
    truthy(payload.allowDerivedTop10) ||
    truthy(body.allowDerivedTop10) ||
    truthy(ctx.allowDerivedTop10) ||
    truthy(payload.allowYearendFallback) ||
    truthy(body.allowYearendFallback) ||
    truthy(ctx.allowYearendFallback);

  const textEmpty = !safeStr(textRaw).trim();
  const hasPayload = isPlainObject(payload) && Object.keys(payload).length > 0;
  const payloadActionable = hasPayload && hasActionablePayload(payload);

  // MAC MODE signal (optional explicit override)
  const macModeOverride =
    normalizeMacModeRaw(
      payload.macMode ||
        payload.mode ||
        body.macMode ||
        body.mode ||
        ctx.macMode ||
        ctx.mode ||
        ""
    ) || "";

  const implicit = detectMacModeImplicit(textRaw);
  const macMode = macModeOverride || implicit.mode || "";

  const turnIntent = classifyTurnIntent(
    textRaw,
    action,
    hasPayload,
    payloadAction || "",
    payloadYear,
    textEmpty,
    payloadActionable
  );

  return {
    body,
    payload,
    ctx,
    client,
    text: textRaw,
    lane,
    year,
    action,
    vibe,
    allowDerivedTop10,
    macMode,
    macModeOverride,
    macModeWhy: implicit.why || [],
    turnIntent,
    turnSignals: {
      hasPayload,
      payloadActionable,
      payloadAction: payloadAction || "",
      payloadYear: payloadYear ?? null,
      textEmpty,
      effectiveAction: action || "",
      effectiveYear: year ?? null,
      macMode: macMode || "",
      macModeOverride: macModeOverride || "",
      turnIntent: turnIntent || "",
    },
  };
}

// -------------------------
// COG MEDIATOR (“Marion”) + desire/confidence arbitration
// NOTE: v0.7bS uses MarionSO.mediate() as canonical.
// This legacy local mediator is preserved for backward compatibility/tests,
// but the engine path uses MarionSO now.
// -------------------------
function mediatorMarion(norm, session) {
  const s = isPlainObject(session) ? session : {};
  const lastIntent = safeStr(s.lastTurnIntent || "").trim().toUpperCase();
  const lastAt = Number(s.lastTurnAt || 0) || 0;
  const lastAdvanceAt = Number(s.lastAdvanceAt || 0) || 0;

  const hasPayload = !!norm.turnSignals?.hasPayload;
  const textEmpty = !!norm.turnSignals?.textEmpty;
  const payloadActionable = !!norm.turnSignals?.payloadActionable;

  // Mode: default to ARCHITECT when uncertain (per your rule)
  let mode = safeStr(norm.macMode || "").trim().toLowerCase();
  if (!mode) mode = "architect";
  if (mode !== "architect" && mode !== "user" && mode !== "transitional")
    mode = "architect";

  // Momentum: if we haven't advanced in a while, push ADVANCE
  const now = nowMs();
  const stalled = lastAdvanceAt ? now - lastAdvanceAt > 90 * 1000 : false; // 90s heuristic

  // Intent: use normalized, but enforce constitution
  let intent = safeStr(norm.turnIntent || "").trim().toUpperCase();
  if (intent !== "ADVANCE" && intent !== "CLARIFY" && intent !== "STABILIZE")
    intent = "CLARIFY";

  // Kill-switch: circularity / softness creep → force ADVANCE when actionable or stalled
  const actionable =
    !!safeStr(norm.action).trim() ||
    (payloadActionable &&
      hasPayload &&
      (norm.turnSignals.payloadAction ||
        norm.turnSignals.payloadYear !== null));

  if (
    stalled &&
    (mode === "architect" || mode === "transitional") &&
    intent !== "ADVANCE"
  ) {
    intent = actionable ? "ADVANCE" : "CLARIFY";
  }
  if (actionable) intent = "ADVANCE"; // constitution: action wins

  // Dominance & budget baseline
  let dominance = "neutral"; // firm | neutral | soft
  let budget = "medium"; // short | medium

  if (mode === "architect") {
    budget = "short";
    dominance = intent === "ADVANCE" ? "firm" : "neutral";
  } else if (mode === "transitional") {
    budget = "short";
    dominance = intent === "ADVANCE" ? "firm" : "neutral";
  } else {
    budget = "medium";
    dominance = intent === "ADVANCE" ? "neutral" : "soft";
  }

  // Micro grounding allowance (1 line max unless STABILIZE)
  const grounding = mode === "user" || mode === "transitional";
  const groundingMaxLines = intent === "STABILIZE" ? 3 : grounding ? 1 : 0;

  // Desire + confidence (arbitrated here so the rest of the engine can be deterministic)
  const latentDesire = inferLatentDesire(norm, s, {
    mode,
    intent,
    dominance,
    budget,
  });
  const confidence = inferConfidence(norm, s, {
    mode,
    intent,
    dominance,
    budget,
  });

  // Velvet binding (music-first)
  const velvet = computeVelvet(
    norm,
    s,
    { mode, intent, dominance, budget, confidence },
    latentDesire
  );

  // Slight dominance correction: if velvet and user mode, soften; if mastery+architect and advance, firm stays.
  if (velvet.velvet && mode === "user" && intent !== "ADVANCE")
    dominance = "soft";
  if (
    latentDesire === LATENT_DESIRE.MASTERY &&
    (mode === "architect" || mode === "transitional") &&
    intent === "ADVANCE"
  )
    dominance = "firm";

  // Marion spine state (explicit + stable)
  let marionState = "SEEK"; // SEEK | DELIVER | STABILIZE | BRIDGE
  let marionReason = "default";
  const a = safeStr(norm.action || "").trim();

  if (intent === "STABILIZE") {
    marionState = "STABILIZE";
    marionReason = "intent_stabilize";
  } else if (intent === "ADVANCE") {
    marionState = "DELIVER";
    marionReason = actionable ? "actionable" : "advance";
  } else if (a === "switch_lane" || a === "ask_year") {
    marionState = "BRIDGE";
    marionReason = "routing";
  } else {
    marionState = "SEEK";
    marionReason = "clarify";
  }

  // bounded trace for continuity
  const trace = marionTraceBuild(norm, s, {
    mode,
    intent,
    dominance,
    budget,
    stalled,
    actionable,
    textEmpty,
    latentDesire,
    confidence,
    velvet: velvet.velvet,
    velvetReason: velvet.reason || "",
  });

  return {
    mode,
    intent,
    dominance,
    budget,
    stalled,
    lastIntent,
    lastAt,
    groundingMaxLines,
    actionable,
    textEmpty,
    latentDesire,
    confidence,
    velvet: velvet.velvet,
    velvetSince: velvet.velvetSince || 0,
    velvetReason: velvet.reason || "",
    // new spine fields
    marionState,
    marionReason,
    marionTrace: trace,
    marionTraceHash: marionTraceHash(trace),
  };
}

// -------------------------
// counselor-lite (non-clinical) scaffolding
// -------------------------
function counselorLiteIntro(norm, session, cog) {
  const mode = safeStr(cog?.mode || "").toLowerCase();
  const desire = safeStr(cog?.latentDesire || "");
  const velvet = !!cog?.velvet;

  const preface =
    mode === "architect"
      ? "Okay. Quick signal-check so I don’t waste your time."
      : "Okay. I’m here — talk to me.";

  // Keep it “year-2 psych student” style: reflective, simple, not clinical
  const reflect =
    desire === LATENT_DESIRE.COMFORT
      ? "Before we do anything else: what’s the one sentence version of what you’re carrying right now?"
      : desire === LATENT_DESIRE.MASTERY
      ? "What outcome do you want by the end of this conversation — one sentence, measurable?"
      : desire === LATENT_DESIRE.VALIDATION
      ? "Do you want reassurance, a reality-check, or a plan?"
      : "What’s the real topic underneath the topic — and what would “better” feel like?";

  const boundaries =
    "Just so we’re clean: I can help you think and choose next steps — I’m not a therapist, and I won’t diagnose.";

  const bridge = velvet
    ? "If you want a softer entry, we can also anchor in a year and let music do the opening."
    : "If you want a lighter entry, we can pivot into music or movies and let that open the door.";

  return `${preface}\n\n${reflect}\n\n${boundaries}\n${bridge}`;
}

function counselorFollowUps() {
  return {
    followUps: [
      {
        id: "fu_talk_plan",
        type: "chip",
        label: "I want a plan",
        payload: { lane: "general", action: "counsel_intro", focus: "plan" },
      },
      {
        id: "fu_talk_listen",
        type: "chip",
        label: "Just listen",
        payload: { lane: "general", action: "counsel_intro", focus: "listen" },
      },
      {
        id: "fu_music",
        type: "chip",
        label: "Music",
        payload: { lane: "music", action: "ask_year" },
      },
      {
        id: "fu_movies",
        type: "chip",
        label: "Movies",
        payload: { lane: "movies" },
      },
    ],
    followUpsStrings: ["I want a plan", "Just listen", "Music", "Movies"],
  };
}

// -------------------------
// tone constitution / validation
// -------------------------
function validateNyxTone(cog, reply) {
  const text = safeStr(reply);

  // Absolute bans: memory meta / creepy recall
  if (/\bearlier you (said|mentioned)\b/i.test(text))
    return { ok: false, reason: "ban:earlier_you_said" };
  if (
    /\b(as an ai|i (remember|recall)|in our previous conversation|you told me before)\b/i.test(
      text
    )
  )
    return { ok: false, reason: "ban:meta_memory" };

  // Avoid excess hedging in firm ADVANCE
  if (cog?.intent === "ADVANCE" && cog?.dominance === "firm") {
    if (/\b(i think|maybe|perhaps|might be|could be)\b/i.test(text))
      return { ok: false, reason: "ban:overhedge_firm" };
  }

  // Avoid trailing softness on firm (already stripped, but enforce)
  if (cog?.intent === "ADVANCE" && cog?.dominance === "firm") {
    if (/\b(if you want|if you'd like|let me know)\b/i.test(text))
      return { ok: false, reason: "ban:softness_tail_firm" };
  }

  return { ok: true, reason: "ok" };
}

function applyTurnConstitutionToReply(rawReply, cog, session) {
  let reply = safeStr(rawReply).trim();
  if (!reply) return "";

  // ENFORCEMENT++++: Nyx explains the move out loud every turn (1 sentence, always first)
  const moveLine = oneLine(safeStr(cog?.nextMoveSpeak || "")).trim();
  // Optional: signature transition insertion (rare, deliberate)
  const trans = pickSignatureTransition(session || {}, cog || {});

  // Compose base: signatureTransition -> content (we’ll prepend moveLine & greeting after)
  if (trans) reply = `${trans}\n\n${reply}`;

  // Move line MUST be first.
  if (moveLine) reply = `${moveLine}\n\n${reply}`;

  // Option A greeting (ONCE per session, never on replay/burst)
  const greet = oneLine(safeStr(cog?.greetLine || "")).trim();
  if (greet) {
    // Insert after moveLine (to preserve “move speaks first” constitution).
    // If moveLine absent, greeting becomes first.
    if (moveLine) {
      const parts = reply.split("\n\n");
      if (parts.length >= 2) {
        // parts[0] is moveLine (and possibly trans already handled above)
        // Insert greeting after the first paragraph (moveLine).
        parts.splice(1, 0, greet);
        reply = parts.join("\n\n");
      } else {
        reply = `${reply}\n\n${greet}`;
      }
    } else {
      reply = `${greet}\n\n${reply}`;
    }
  }

  // Budget-based compression (with ranked-list protection in applyBudgetText)
  reply = applyBudgetText(reply, cog.budget);

  // If ADVANCE + firm, remove trailing “option sprawl” softness
  if (cog.intent === "ADVANCE" && cog.dominance === "firm") {
    reply = reply
      .replace(/\b(if you want|if you'd like|let me know)\b.*$/i, "")
      .trim();
  }

  // Enforce tone constitution; if fails, do a minimal corrective rewrite
  const check = validateNyxTone(cog, reply);
  if (!check.ok) {
    // minimal, deterministic correction (no big rewrites)
    reply = reply
      .replace(/\bearlier you (said|mentioned)\b.*$/i, "")
      .replace(
        /\b(as an ai|i (remember|recall)|in our previous conversation|you told me before)\b.*$/i,
        ""
      )
      .trim();

    // HARDENING: only strip hedges when firm ADVANCE (avoid grammar damage elsewhere)
    if (cog?.intent === "ADVANCE" && cog?.dominance === "firm") {
      reply = reply
        .replace(/\b(i think|maybe|perhaps|might be|could be)\b/gi, "")
        .replace(/\s{2,}/g, " ")
        .trim();
    }

    // re-apply budget after trimming
    reply = applyBudgetText(reply, cog.budget);
  }

  // FAIL-SAFE: never allow constitution to silence Nyx
  if (!reply) {
    reply = `Give me a year (${PUBLIC_MIN_YEAR}–${PUBLIC_MAX_YEAR}). I’ll start with Top 10.`;
    reply = applyBudgetText(reply, cog.budget);
  }

  return reply;
}

// -------------------------
// knowledge accessors (aliases + scan)
// -------------------------
function getJsonRoot(knowledge) {
  const k = isPlainObject(knowledge) ? knowledge : {};
  return isPlainObject(k.json) ? k.json : {};
}

function getPack(knowledge, key) {
  const json = getJsonRoot(knowledge);
  return json[key];
}

function getPackAny(knowledge, keys) {
  for (const k of asArray(keys)) {
    const hit = getPack(knowledge, k);
    if (hit) return { pack: hit, key: k, method: "alias_key" };
  }
  return { pack: null, key: "", method: "" };
}

function looksLikeTop10Store(obj) {
  if (!obj) return false;
  if (isPlainObject(obj.years)) return true;
  if (isPlainObject(obj.byYear)) return true;
  if (Array.isArray(obj.rows)) return true;

  const keys = isPlainObject(obj) ? Object.keys(obj) : [];
  if (keys.some((k) => /^\d{4}$/.test(k) && Array.isArray(obj[k]))) return true;
  return false;
}

function findTop10PackHeuristic(knowledge) {
  const json = getJsonRoot(knowledge);
  const entries = Object.entries(json);

  const ranked = entries
    .map(([k, v]) => {
      const lk = k.toLowerCase();
      let score = 0;
      if (lk.includes("top10_by_year")) score += 50;
      if (lk.includes("top10")) score += 20;
      if (lk.includes("music")) score += 10;
      if (lk.includes("wiki")) score -= 5;
      if (looksLikeTop10Store(v)) score += 30;
      return { k, v, score };
    })
    .filter((x) => x.score >= 40)
    .sort((a, b) => b.score - a.score);

  if (ranked.length)
    return { pack: ranked[0].v, key: ranked[0].k, method: "heuristic_scan" };
  return { pack: null, key: "", method: "" };
}

function getPinnedTop10(knowledge) {
  const aliases = [
    "music/top10_by_year",
    "music/top10_by_year_v1",
    "music/top10_by_year_store",
    "music/top10_by_year_v1.json",
    "music/top10_store",
    "music/top10",
    "top10_by_year_v1",
    "top10_by_year",
  ];

  const a = getPackAny(knowledge, aliases);
  if (a.pack && looksLikeTop10Store(a.pack))
    return { pack: a.pack, key: a.key, foundBy: a.method };

  const h = findTop10PackHeuristic(knowledge);
  if (h.pack) return { pack: h.pack, key: h.key, foundBy: h.method };

  return { pack: null, key: "", foundBy: "" };
}

function getPinnedStoryMoments(knowledge) {
  const aliases = [
    "music/story_moments_by_year",
    "music/story_moments_by_year_v1",
    "music/story_moments_by_year_v2",
    "music/story_moments",
  ];
  const a = getPackAny(knowledge, aliases);
  return a.pack
    ? { pack: a.pack, key: a.key, foundBy: a.method }
    : { pack: null, key: "", foundBy: "" };
}

function getPinnedMicroMoments(knowledge) {
  const aliases = [
    "music/micro_moments_by_year",
    "music/micro_moments_by_year_v1",
    "music/micro_moments_by_year_v2",
    "music/micro_moments",
  ];
  const a = getPackAny(knowledge, aliases);
  return a.pack
    ? { pack: a.pack, key: a.key, foundBy: a.method }
    : { pack: null, key: "", foundBy: "" };
}

function getWikiYearendByYear(knowledge) {
  const aliases = [
    "music/wiki/yearend_hot100_by_year",
    "music/wiki/yearend_hot100_by_year_v1",
    "music/wiki/yearend_hot100",
  ];
  const a = getPackAny(knowledge, aliases);
  return a.pack
    ? { pack: a.pack, key: a.key, foundBy: a.method }
    : { pack: null, key: "", foundBy: "" };
}

// -------------------------
// resolvers
// -------------------------
function resolveTop10ForYear(knowledge, year, opts) {
  const y = normYear(year);
  if (!y) return { ok: false, reason: "missing_year" };

  const allowDerivedTop10 = !!(opts && opts.allowDerivedTop10);

  const top10Hit = getPinnedTop10(knowledge);
  const top10 = top10Hit.pack;

  if (top10) {
    if (isPlainObject(top10.years)) {
      const block = top10.years[String(y)];
      if (!block)
        return {
          ok: false,
          reason: "year_missing_in_pack",
          sourceKey: top10Hit.key,
          foundBy: top10Hit.foundBy,
        };
      const items = asArray(block.items)
        .map(normalizeSongLine)
        .filter((r) => r.title || r.artist);
      if (!items.length)
        return {
          ok: false,
          reason: "empty_items_for_year",
          sourceKey: top10Hit.key,
          foundBy: top10Hit.foundBy,
        };
      return {
        ok: true,
        method: "pinned_top10_years_items",
        sourceKey: top10Hit.key,
        foundBy: top10Hit.foundBy,
        year: y,
        items,
      };
    }

    if (isPlainObject(top10.byYear)) {
      const arr = top10.byYear[String(y)];
      if (!arr)
        return {
          ok: false,
          reason: "year_missing_in_pack",
          sourceKey: top10Hit.key,
          foundBy: top10Hit.foundBy,
        };
      const items = asArray(arr)
        .map(normalizeSongLine)
        .filter((r) => r.title || r.artist);
      if (!items.length)
        return {
          ok: false,
          reason: "empty_items_for_year",
          sourceKey: top10Hit.key,
          foundBy: top10Hit.foundBy,
        };
      return {
        ok: true,
        method: "pinned_top10_byYear_array",
        sourceKey: top10Hit.key,
        foundBy: top10Hit.foundBy,
        year: y,
        items,
      };
    }

    if (isPlainObject(top10) && Array.isArray(top10[String(y)])) {
      const items = top10[String(y)]
        .map(normalizeSongLine)
        .filter((r) => r.title || r.artist);
      if (!items.length)
        return {
          ok: false,
          reason: "empty_items_for_year",
          sourceKey: top10Hit.key,
          foundBy: top10Hit.foundBy,
        };
      return {
        ok: true,
        method: "pinned_top10_year_keyed_array",
        sourceKey: top10Hit.key,
        foundBy: top10Hit.foundBy,
        year: y,
        items,
      };
    }

    if (Array.isArray(top10.rows)) {
      const rows = top10.rows.filter((r) => Number(r?.year) === y);
      if (!rows.length)
        return {
          ok: false,
          reason: "year_missing_in_pack",
          sourceKey: top10Hit.key,
          foundBy: top10Hit.foundBy,
        };
      const items = rows
        .map(normalizeSongLine)
        .filter((r) => r.title || r.artist);
      if (!items.length)
        return {
          ok: false,
          reason: "empty_items_for_year",
          sourceKey: top10Hit.key,
          foundBy: top10Hit.foundBy,
        };
      return {
        ok: true,
        method: "pinned_top10_rows",
        sourceKey: top10Hit.key,
        foundBy: top10Hit.foundBy,
        year: y,
        items,
      };
    }

    return {
      ok: false,
      reason: "unsupported_pack_shape",
      sourceKey: top10Hit.key,
      foundBy: top10Hit.foundBy,
    };
  }

  if (!allowDerivedTop10) {
    return { ok: false, reason: "missing_pack_no_fallback" };
  }

  // FALLBACK ONLY if explicitly allowed
  const wikiHit = getWikiYearendByYear(knowledge);
  const wiki = wikiHit.pack;

  if (
    wiki &&
    isPlainObject(wiki.byYear) &&
    Array.isArray(wiki.byYear[String(y)])
  ) {
    const rows = wiki.byYear[String(y)];
    const items = rows
      .map((r) => {
        const o = normalizeSongLine(r);
        if (!o.title) o.title = safeStr(r.song || r.single || r.track || "").trim();
        if (!o.artist) o.artist = safeStr(r.artist || r.performer || "").trim();
        if (!o.pos) o.pos = clampInt(r.rank ?? r.pos ?? r.position, null, 1, 500);
        return o;
      })
      .filter((r) => r.title || r.artist);

    if (items.length) {
      const sorted = items
        .slice()
        .sort((a, b) => Number(a.pos || 9999) - Number(b.pos || 9999))
        .slice(0, 10);

      return {
        ok: true,
        method: "fallback_yearend_hot100_top10",
        sourceKey: wikiHit.key,
        foundBy: wikiHit.foundBy,
        year: y,
        items: sorted,
        confidence: "medium",
      };
    }
  }

  return { ok: false, reason: "not_found" };
}

function resolveYearendHot100ForYear(knowledge, year) {
  const y = normYear(year);
  if (!y) return { ok: false, reason: "missing_year" };

  const wikiHit = getWikiYearendByYear(knowledge);
  const wiki = wikiHit.pack;
  if (!wiki) return { ok: false, reason: "missing_pack" };

  const byYear = isPlainObject(wiki.byYear) ? wiki.byYear : null;
  const rows =
    byYear && Array.isArray(byYear[String(y)]) ? byYear[String(y)] : null;
  if (!rows)
    return {
      ok: false,
      reason: "year_missing_in_pack",
      sourceKey: wikiHit.key,
      foundBy: wikiHit.foundBy,
    };

  const items = rows
    .map((r) => {
      const o = normalizeSongLine(r);
      if (!o.title) o.title = safeStr(r.song || r.single || r.track || "").trim();
      if (!o.artist) o.artist = safeStr(r.artist || r.performer || "").trim();
      if (!o.pos) o.pos = clampInt(r.rank ?? r.pos ?? r.position, null, 1, 500);
      return o;
    })
    .filter((r) => r.title || r.artist)
    .sort((a, b) => Number(a.pos || 9999) - Number(b.pos || 9999));

  if (!items.length)
    return {
      ok: false,
      reason: "empty_items_for_year",
      sourceKey: wikiHit.key,
      foundBy: wikiHit.foundBy,
    };

  return {
    ok: true,
    method: "wiki_yearend_hot100_byYear",
    sourceKey: wikiHit.key,
    foundBy: wikiHit.foundBy,
    year: y,
    items,
    confidence: "high",
  };
}

function resolveStoryMomentForYear(knowledge, year) {
  const y = normYear(year);
  if (!y) return { ok: false, reason: "missing_year" };

  const hit = getPinnedStoryMoments(knowledge);
  const p = hit.pack;
  if (!p) return { ok: false, reason: "missing_pack" };

  const getText = (r) =>
    safeStr(r?.text || r?.moment || r?.story || r?.copy || r?.line || "").trim();

  if (Array.isArray(p.rows)) {
    const row = p.rows.find((r) => Number(r?.year) === y);
    const txt = row ? getText(row) : "";
    if (txt)
      return {
        ok: true,
        method: "pinned_rows",
        sourceKey: hit.key,
        foundBy: hit.foundBy,
        year: y,
        text: txt,
      };
  }
  if (isPlainObject(p.byYear) && p.byYear[String(y)]) {
    const txt = getText(p.byYear[String(y)]);
    if (txt)
      return {
        ok: true,
        method: "pinned_byYear",
        sourceKey: hit.key,
        foundBy: hit.foundBy,
        year: y,
        text: txt,
      };
  }
  if (p[String(y)]) {
    const v = p[String(y)];
    const row = Array.isArray(v) ? v[0] : v;
    const txt = getText(row);
    if (txt)
      return {
        ok: true,
        method: "pinned_year_key",
        sourceKey: hit.key,
        foundBy: hit.foundBy,
        year: y,
        text: txt,
      };
  }

  return { ok: false, reason: "not_found" };
}

function resolveMicroMomentForYear(knowledge, year) {
  const y = normYear(year);
  if (!y) return { ok: false, reason: "missing_year" };

  const hit = getPinnedMicroMoments(knowledge);
  const p = hit.pack;
  if (!p) return { ok: false, reason: "missing_pack" };

  const getText = (r) =>
    safeStr(r?.text || r?.moment || r?.micro || r?.copy || r?.line || "").trim();

  if (Array.isArray(p.rows)) {
    const row = p.rows.find((r) => Number(r?.year) === y);
    const txt = row ? getText(row) : "";
    if (txt)
      return {
        ok: true,
        method: "pinned_rows",
        sourceKey: hit.key,
        foundBy: hit.foundBy,
        year: y,
        text: txt,
      };
  }
  if (isPlainObject(p.byYear) && p.byYear[String(y)]) {
    const txt = getText(p.byYear[String(y)]);
    if (txt)
      return {
        ok: true,
        method: "pinned_byYear",
        sourceKey: hit.key,
        foundBy: hit.foundBy,
        year: y,
        text: txt,
      };
  }
  if (p[String(y)]) {
    const v = p[String(y)];
    const row = Array.isArray(v) ? v[0] : v;
    const txt = getText(row);
    if (txt)
      return {
        ok: true,
        method: "pinned_year_key",
        sourceKey: hit.key,
        foundBy: hit.foundBy,
        year: y,
        text: txt,
      };
  }

  return { ok: false, reason: "not_found" };
}

// -------------------------
// loop dampener
// -------------------------
function buildMusicSig({ action, year, method, sourceKey, extra }) {
  const base = `${safeStr(action)}|${safeStr(year)}|${safeStr(method)}|${stableSourceKey(
    sourceKey
  )}|${safeStr(extra)}`;
  return sha1Lite(base).slice(0, 12);
}
function shouldDampen(session, nextSig) {
  const s = isPlainObject(session) ? session : {};
  const last = safeStr(s.__musicLastSig || "").trim();
  if (!last) return false;
  return last === safeStr(nextSig);
}

// -------------------------
// followUps (Top10-centric, compact chips)
// -------------------------
function compactMusicFollowUps(year) {
  const y = normYear(year);
  const followUps = [
    {
      id: "fu_story",
      type: "chip",
      label: "Make it cinematic",
      payload: {
        lane: "music",
        action: "story_moment",
        year: y || undefined,
        route: "story_moment",
      },
    },
    {
      id: "fu_newyear",
      type: "chip",
      label: "Another year",
      payload: { lane: "music", action: "ask_year", route: "ask_year" },
    },
  ];

  const followUpsStrings = ["Make it cinematic", "Another year"];
  return { followUps, followUpsStrings };
}

// -------------------------
// formatting
// -------------------------
function formatTop10(year, items) {
  const y = normYear(year);
  const list = compactList(items, 10).map((r, i) => {
    const pos = r.pos || i + 1;
    const title = r.title ? `“${r.title}”` : "“(title unknown)”";
    const artist = r.artist ? ` — ${r.artist}` : "";
    return `${pos}. ${title}${artist}`;
  });
  const head = y ? `Top 10 — ${y}` : `Top 10`;
  return `${head}\n\n${list.join("\n")}`;
}

function formatYearendHot100(year, items, maxN) {
  const y = normYear(year);
  const n = clampInt(maxN, 10, 5, 100);
  const list = compactList(items, n).map((r, i) => {
    const pos = r.pos || i + 1;
    const title = r.title ? `“${r.title}”` : "“(title unknown)”";
    const artist = r.artist ? ` — ${r.artist}` : "";
    return `${pos}. ${title}${artist}`;
  });
  const head = y
    ? `Billboard Year-End Hot 100 — ${y}`
    : `Billboard Year-End Hot 100`;
  return `${head}\n\n${list.join("\n")}`;
}

function buildCustomStory({ year, vibe, anchorItem }) {
  const y = normYear(year);
  const v = normVibe(vibe) || "nostalgic";

  const title = safeStr(anchorItem?.title || "").trim();
  const artist = safeStr(anchorItem?.artist || "").trim();
  const anchor =
    title || artist
      ? `“${title || "(title)"}” — ${artist || "(artist)"}`
      : "";

  const open = y ? `${y}.` : `That year.`;
  const aLine = anchor ? `The needle drops on ${anchor} — ` : `The needle drops — `;

  if (v === "romantic") {
    return (
      `${open} ${aLine}` +
      `and suddenly the room feels softer at the edges. Streetlights look like candlelight, and even your silence has a melody. ` +
      `It’s the kind of year that makes you text first… then pretend you didn’t.`
    );
  }
  if (v === "rebellious") {
    return (
      `${open} ${aLine}` +
      `and your posture changes. You stop asking permission, stop apologizing for taking up space. ` +
      `This is a year for leather-jacket confidence, for loud truths, for leaving the party early because you run the night.`
    );
  }
  return (
    `${open} ${aLine}` +
    `and memory does that gentle time-warp thing. A car radio, a kitchen speaker, a hallway dance with socks on. ` +
    `Not perfect—just *yours*. That’s why it sticks.`
  );
}

// -------------------------
// tone regression tests (no deps)
// -------------------------
function runToneRegressionTests() {
  const failures = [];

  function assert(name, cond, detail) {
    if (!cond) failures.push({ name, detail: safeStr(detail || "") });
  }

  // 1) Ranked list budget should keep 10 lines in short
  const top10Mock =
    "Top 10 — 1984\n\n" +
    Array.from({ length: 10 })
      .map((_, i) => `${i + 1}. “Song” — Artist`)
      .join("\n");
  const b1 = applyBudgetText(top10Mock, "short");
  assert("budget_ranked_list_keeps_10", countNumberedLines(b1) >= 10, b1);

  // 2) Firm ADVANCE removes softness tails
  const cFirm = {
    intent: "ADVANCE",
    dominance: "firm",
    budget: "short",
    confidence: { nyx: 0.9 },
    nextMoveSpeak: "I’m going to advance: smallest next change first, then we verify.",
  };
  const soft = "Do X. Let me know if you'd like.";
  const out2 = applyTurnConstitutionToReply(soft, cFirm, {
    lastSigTransition: "",
  });
  assert("firm_removes_soft_tail", !/\blet me know\b/i.test(out2), out2);

  // 3) Ban “Earlier you said…”
  const out3 = applyTurnConstitutionToReply("Earlier you said X, so Y.", cFirm, {});
  assert("ban_earlier_you_said", !/\bearlier you (said|mentioned)\b/i.test(out3), out3);

  // 4) Signature transition not repeated consecutively
  const s1 = { lastSigTransition: SIGNATURE_TRANSITIONS[0] };
  const out4 = applyTurnConstitutionToReply("Do X.", cFirm, s1);
  assert("no_repeat_signature_transition", !out4.startsWith(SIGNATURE_TRANSITIONS[0]), out4);

  // 5) Marion trace must be bounded
  const tr = marionTraceBuild(
    { action: "top10", year: 1988, turnSignals: { hasPayload: true } },
    {},
    { mode: "architect", intent: "ADVANCE", dominance: "firm", budget: "short" }
  );
  assert("marion_trace_bounded", safeStr(tr).length <= MARION_TRACE_MAX, tr);

  // 6) Core spine rev increments via finalize
  const sp0 = Spine.createState({ lane: "general" });
  const sp1 = finalizeCoreSpine({
    corePrev: sp0,
    inboundNorm: { text: "hi", turnSignals: { textEmpty: false } },
    lane: "general",
    topic: "help",
    pendingAskPatch: null,
    lastUserIntent: "ask",
    lastAssistantSummary: "test",
    decisionUpper: {
      move: "CLARIFY",
      stage: "clarify",
      speak: "Test.",
      rationale: "test",
    },
    actionTaken: "test",
  });
  assert("core_spine_rev_increments", sp1.rev === sp0.rev + 1, `${sp0.rev}->${sp1.rev}`);

  // 7) Option A: greeting should not duplicate when inboundKey repeats (simulate)
  const sess = { __greeted: false, __lastInboundKey: "abc" };
  const g = computeOptionAGreetingLine(sess, { turnSignals: { textEmpty: false, hasPayload: false } }, { mode: "user" }, "abc");
  assert("optionA_no_greet_on_replay", g === "", g);

  return { ok: failures.length === 0, failures, ran: 7 };
}

// -------------------------
// main engine
// -------------------------
async function handleChat(input) {
  const started = nowMs();
  const norm = normalizeInbound(input);

  const session = isPlainObject(norm.body.session)
    ? norm.body.session
    : isPlainObject(input?.session)
    ? input.session
    : {};

  const knowledge = isPlainObject(input?.knowledge)
    ? input.knowledge
    : isPlainObject(norm.body.knowledge)
    ? norm.body.knowledge
    : {};

  // STATE SPINE (canonical prev)
  const corePrev = coerceCoreSpine(session);

  // Marion mediation (COG OS) — CANONICAL via MarionSO
  // FAIL-OPEN: if MarionSO is missing/throws, fall back to legacy mediatorMarion.
  let cog = null;
  try {
    if (MarionSO && typeof MarionSO.mediate === "function") {
      cog = MarionSO.mediate(norm, session, {});
    }
  } catch (e) {
    cog = null;
  }
  if (!cog) cog = mediatorMarion(norm, session);

  // Canonical state spine planner (single call)
  const corePlan = Spine.decideNextMove(corePrev, { text: norm.text || "" });

  // Bridge move speak into constitution
  cog.nextMove = toUpperMove(corePlan.move);
  cog.nextMoveSpeak = safeStr(corePlan.speak || "");
  cog.nextMoveWhy = safeStr(corePlan.rationale || "");
  cog.nextMoveStage = safeStr(corePlan.stage || "");

  // Ensure LATENT_DESIRE string compatibility if MarionSO enum is used
  if (SO_LATENT_DESIRE && cog && safeStr(cog.latentDesire || "")) {
    const ld = safeStr(cog.latentDesire || "");
    cog.latentDesire = ld; // keep as simple string
  }

  // TELEMETRY++++ + DISCOVERY HINT++++ (no text)
  const noveltyScore = computeNoveltyScore(norm, session, cog);
  const discoveryHint = buildDiscoveryHint(norm, session, cog, noveltyScore);
  cog.noveltyScore = clamp01(noveltyScore);
  cog.discoveryHint = discoveryHint;

  const telemetry = buildBoundedTelemetry(
    norm,
    session,
    cog,
    corePrev,
    corePlan,
    noveltyScore,
    discoveryHint
  );

  // Option A: compute inboundKey + one-time greeting (never on replay/burst)
  const inboundKey = buildInboundKey(norm);
  cog.inboundKey = inboundKey;
  cog.greetLine = computeOptionAGreetingLine(session, norm, cog, inboundKey);

  const yearSticky = normYear(session.lastYear) ?? null;

  // PAYLOAD YEAR BEATS STICKY YEAR (chip click should override prior context)
  const year = norm.year ?? yearSticky ?? null;

  const lane =
    safeStr(norm.lane || "").trim() ||
    (norm.action ? "music" : "") ||
    safeStr(session.lane || "").trim() ||
    safeStr(corePrev?.lane || "").trim() ||
    "general";

  const prevChart = safeStr(session.activeMusicChart || session.lastMusicChart || "").trim();

  // Common session telemetry patch (kept small and safe)
  const baseCogPatch = {
    lastMacMode: safeStr(cog.mode || ""),
    lastTurnIntent: safeStr(cog.intent || ""),
    lastTurnAt: nowMs(),
    ...(safeStr(cog.intent || "").toUpperCase() === "ADVANCE" ? { lastAdvanceAt: nowMs() } : {}),

    // Option A replay gating + greeting state
    __lastInboundKey: inboundKey,
    ...(cog.greetLine ? { __greeted: true, __greetedAt: nowMs() } : {}),

    // new cognitive telemetry
    lastLatentDesire: safeStr(cog.latentDesire || ""),
    lastUserConfidence: clamp01(cog?.confidence?.user),
    lastNyxConfidence: clamp01(cog?.confidence?.nyx),
    velvetMode: !!cog.velvet,
    velvetSince: cog.velvet ? Number(cog.velvetSince || 0) || nowMs() : 0,
    lastAction: safeStr(norm.action || ""),

    // Marion spine logging (bounded)
    marionState: safeStr(cog.marionState || ""),
    marionReason: safeStr(cog.marionReason || ""),
    marionTrace: safeStr(cog.marionTrace || ""),
    marionTraceHash: safeStr(cog.marionTraceHash || ""),

    // novelty/discovery snapshot (bounded, no text)
    lastNoveltyScore: clamp01(cog.noveltyScore),
    lastDiscoveryHintOn: !!(cog.discoveryHint && cog.discoveryHint.enabled),
    lastDiscoveryHintReason: safeStr(cog.discoveryHint?.reason || ""),
  };

  // Helper: build a stateSpine-compatible pendingAsk
  function pendingAskObj(id, type, prompt, required) {
    return {
      id: safeStr(id || ""),
      type: safeStr(type || "clarify"),
      prompt: safeStr(prompt || ""),
      required: required !== false,
    };
  }

  function metaBase(extra) {
    return {
      engine: CE_VERSION,
      ...extra,
      turnSignals: norm.turnSignals,
      telemetry,
      elapsedMs: nowMs() - started,
    };
  }

  if (norm.action === "reset") {
    const coreNext = finalizeCoreSpine({
      corePrev,
      inboundNorm: norm,
      lane: "general",
      topic: "help",
      pendingAskPatch: null,
      lastUserIntent: "reset",
      lastAssistantSummary: "",
      decisionUpper: {
        move: cog.nextMove,
        stage: cog.nextMoveStage || "deliver",
        speak: cog.nextMoveSpeak,
        rationale: cog.nextMoveWhy,
      },
      actionTaken: "reset",
    });

    return {
      ok: true,
      reply: "",
      lane: "general",
      sessionPatch: {
        lane: "general",
        lastYear: null,
        lastMode: null,
        lastMusicYear: null,
        __musicLastSig: "",
        activeMusicChart: "",
        lastMusicChart: "",
        musicMomentsLoaded: false,
        musicMomentsLoadedAt: 0,
        lastSigTransition: "",
        velvetMode: false,
        velvetSince: 0,

        // Option A greeting state reset
        __greeted: false,
        __greetedAt: 0,
        __lastInboundKey: "",

        // canonical spine
        __spineState: coreNext,

        ...baseCogPatch,
      },
      cog,
      meta: metaBase({
        resetHint: true,
        spine: {
          v: Spine.SPINE_VERSION,
          rev: coreNext.rev,
          lane: coreNext.lane,
          stage: coreNext.stage,
        },
      }),
    };
  }

  // Counselor-lite listening intro (non-clinical)
  if (norm.action === "counsel_intro") {
    const replyRaw = counselorLiteIntro(norm, session, cog);
    const reply = applyTurnConstitutionToReply(replyRaw, cog, session);
    const sigLine = detectSignatureLine(reply);
    const f = counselorFollowUps();

    const coreNext = finalizeCoreSpine({
      corePrev,
      inboundNorm: norm,
      lane: "general",
      topic: "help",
      pendingAskPatch: null,
      lastUserIntent: "ask",
      lastAssistantSummary: "counsel_intro",
      decisionUpper: {
        move: cog.nextMove,
        stage: cog.nextMoveStage || "deliver",
        speak: cog.nextMoveSpeak,
        rationale: cog.nextMoveWhy,
      },
      actionTaken: "served_counsel_intro",
    });

    return {
      ok: true,
      reply,
      lane: "general",
      followUps: f.followUps,
      followUpsStrings: f.followUpsStrings,
      sessionPatch: {
        lane: "general",
        ...(sigLine ? { lastSigTransition: sigLine } : {}),
        __spineState: coreNext,
        ...baseCogPatch,
      },
      cog,
      meta: metaBase({
        route: "counsel_intro",
        spine: {
          v: Spine.SPINE_VERSION,
          rev: coreNext.rev,
          lane: coreNext.lane,
          stage: coreNext.stage,
          move: cog.nextMove,
        },
      }),
    };
  }

  if (norm.action === "ask_year") {
    const replyRaw = `Give me a year (${PUBLIC_MIN_YEAR}–${PUBLIC_MAX_YEAR}). I’ll start with Top 10.`;
    const reply = applyTurnConstitutionToReply(replyRaw, cog, session);
    const sigLine = detectSignatureLine(reply);

    const fu = [
      {
        id: "fu_1973",
        type: "chip",
        label: "1973",
        payload: { lane: "music", action: "top10", year: 1973, route: "top10" },
      },
      {
        id: "fu_1988",
        type: "chip",
        label: "1988",
        payload: { lane: "music", action: "top10", year: 1988, route: "top10" },
      },
      {
        id: "fu_1992",
        type: "chip",
        label: "1992",
        payload: { lane: "music", action: "top10", year: 1992, route: "top10" },
      },
    ];

    const coreNext = finalizeCoreSpine({
      corePrev,
      inboundNorm: norm,
      lane: "music",
      topic: "help",
      pendingAskPatch: pendingAskObj(
        "need_year",
        "clarify",
        `Give me a year (${PUBLIC_MIN_YEAR}–${PUBLIC_MAX_YEAR}).`,
        true
      ),
      lastUserIntent: norm.turnSignals.textEmpty ? "silent_click" : "ask",
      lastAssistantSummary: "asked_year",
      decisionUpper: {
        move: cog.nextMove,
        stage: cog.nextMoveStage || "clarify",
        speak: cog.nextMoveSpeak,
        rationale: cog.nextMoveWhy,
      },
      actionTaken: "asked_year",
    });

    return {
      ok: true,
      reply,
      lane: "music",
      followUps: fu,
      followUpsStrings: ["1973", "1988", "1992"],
      sessionPatch: {
        lane: "music",
        ...(sigLine ? { lastSigTransition: sigLine } : {}),
        __spineState: coreNext,
        ...baseCogPatch,
      },
      cog,
      meta: metaBase({
        route: "ask_year",
        spine: {
          v: Spine.SPINE_VERSION,
          rev: coreNext.rev,
          lane: coreNext.lane,
          stage: coreNext.stage,
          move: cog.nextMove,
        },
      }),
    };
  }

  if (norm.action === "switch_lane") {
    // DISCOVERY HINT can tighten this if novelty is high.
    const baseMenu = `Pick a lane:\n\n• Music\n• Movies\n• Sponsors`;
    const replyRaw =
      discoveryHint && discoveryHint.enabled && discoveryHint.forcedChoice
        ? `${safeStr(discoveryHint.question).trim()}\n\n• Music\n• Movies\n• Sponsors`
        : baseMenu;

    const reply = applyTurnConstitutionToReply(replyRaw, cog, session);
    const sigLine = detectSignatureLine(reply);

    const fu = [
      {
        id: "fu_music",
        type: "chip",
        label: "Music",
        payload: { lane: "music", action: "ask_year", route: "ask_year" },
      },
      { id: "fu_movies", type: "chip", label: "Movies", payload: { lane: "movies", route: "movies" } },
      { id: "fu_sponsors", type: "chip", label: "Sponsors", payload: { lane: "sponsors", route: "sponsors" } },
    ];

    const coreNext = finalizeCoreSpine({
      corePrev,
      inboundNorm: norm,
      lane: "general",
      topic: "help",
      pendingAskPatch: pendingAskObj("need_pick", "clarify", "Pick a lane.", true),
      lastUserIntent: norm.turnSignals.textEmpty ? "silent_click" : "ask",
      lastAssistantSummary: "asked_lane",
      decisionUpper: {
        move: cog.nextMove,
        stage: cog.nextMoveStage || "clarify",
        speak: cog.nextMoveSpeak,
        rationale: cog.nextMoveWhy,
      },
      actionTaken: "asked_lane",
    });

    return {
      ok: true,
      reply,
      lane: "general",
      followUps: fu,
      followUpsStrings: ["Music", "Movies", "Sponsors"],
      sessionPatch: {
        lane: "general",
        ...(sigLine ? { lastSigTransition: sigLine } : {}),
        __spineState: coreNext,
        ...baseCogPatch,
      },
      cog,
      meta: metaBase({
        route: "switch_lane",
        spine: {
          v: Spine.SPINE_VERSION,
          rev: coreNext.rev,
          lane: coreNext.lane,
          stage: coreNext.stage,
          move: cog.nextMove,
        },
      }),
    };
  }

  const requiresYear = ["top10", "story_moment", "micro_moment", "yearend_hot100", "custom_story"];

  if (requiresYear.includes(norm.action) && !year) {
    const replyRaw = `Give me a year (${PUBLIC_MIN_YEAR}–${PUBLIC_MAX_YEAR}).`;
    const reply = applyTurnConstitutionToReply(replyRaw, cog, session);
    const sigLine = detectSignatureLine(reply);

    const fu = [
      {
        id: "fu_1973",
        type: "chip",
        label: "1973",
        payload: {
          lane: "music",
          action: norm.action || "top10",
          year: 1973,
          route: safeStr(norm.action || "top10"),
        },
      },
      {
        id: "fu_1988",
        type: "chip",
        label: "1988",
        payload: {
          lane: "music",
          action: norm.action || "top10",
          year: 1988,
          route: safeStr(norm.action || "top10"),
        },
      },
      {
        id: "fu_1960",
        type: "chip",
        label: "1960",
        payload: {
          lane: "music",
          action: norm.action || "top10",
          year: 1960,
          route: safeStr(norm.action || "top10"),
        },
      },
    ];

    const coreNext = finalizeCoreSpine({
      corePrev,
      inboundNorm: norm,
      lane: "music",
      topic: "help",
      pendingAskPatch: pendingAskObj(
        "need_year",
        "clarify",
        `Give me a year (${PUBLIC_MIN_YEAR}–${PUBLIC_MAX_YEAR}).`,
        true
      ),
      lastUserIntent: norm.turnSignals.textEmpty ? "silent_click" : "ask",
      lastAssistantSummary: "asked_year",
      decisionUpper: {
        move: cog.nextMove,
        stage: cog.nextMoveStage || "clarify",
        speak: cog.nextMoveSpeak,
        rationale: cog.nextMoveWhy,
      },
      actionTaken: "asked_year",
    });

    return {
      ok: true,
      reply,
      lane: "music",
      followUps: fu,
      followUpsStrings: ["1973", "1988", "1960"],
      sessionPatch: {
        lane: "music",
        ...(sigLine ? { lastSigTransition: sigLine } : {}),
        __spineState: coreNext,
        ...baseCogPatch,
      },
      cog,
      meta: metaBase({
        needYear: true,
        spine: {
          v: Spine.SPINE_VERSION,
          rev: coreNext.rev,
          lane: coreNext.lane,
          stage: coreNext.stage,
          move: cog.nextMove,
        },
      }),
    };
  }

  if (year && (year < PUBLIC_MIN_YEAR || year > PUBLIC_MAX_YEAR)) {
    const replyRaw = `Use a year in ${PUBLIC_MIN_YEAR}–${PUBLIC_MAX_YEAR}.`;
    const reply = applyTurnConstitutionToReply(replyRaw, cog, session);
    const sigLine = detectSignatureLine(reply);

    const coreNext = finalizeCoreSpine({
      corePrev,
      inboundNorm: norm,
      lane: "music",
      topic: "help",
      pendingAskPatch: pendingAskObj(
        "need_year",
        "clarify",
        `Use a year in ${PUBLIC_MIN_YEAR}–${PUBLIC_MAX_YEAR}.`,
        true
      ),
      lastUserIntent: norm.turnSignals.textEmpty ? "silent_click" : "ask",
      lastAssistantSummary: "asked_year_range",
      decisionUpper: {
        move: cog.nextMove,
        stage: cog.nextMoveStage || "clarify",
        speak: cog.nextMoveSpeak,
        rationale: cog.nextMoveWhy,
      },
      actionTaken: "asked_year_range",
    });

    return {
      ok: true,
      reply,
      lane: "music",
      sessionPatch: {
        lane: "music",
        ...(sigLine ? { lastSigTransition: sigLine } : {}),
        __spineState: coreNext,
        ...baseCogPatch,
      },
      cog,
      meta: metaBase({
        outOfRange: true,
        year,
        spine: {
          v: Spine.SPINE_VERSION,
          rev: coreNext.rev,
          lane: coreNext.lane,
          stage: coreNext.stage,
          move: cog.nextMove,
        },
      }),
    };
  }

  // Dominance requirement: if ambiguous and we're in ADVANCE + architect/transitional, choose a sane default
  const action = norm.action || (lane === "music" && year ? "top10" : "");

  // ---------------------------------
  // MUSIC
  // ---------------------------------
  if (lane === "music" || action) {
    // ---- custom_story ----
    if (action === "custom_story") {
      const v = normVibe(norm.vibe || norm.text) || "nostalgic";

      // Anchor story off Top10 first item (NOT a #1 route; just first item in Top 10 list)
      const t10 = resolveTop10ForYear(knowledge, year, { allowDerivedTop10: false });
      const anchorItem = t10.ok && t10.items && t10.items.length ? t10.items[0] : null;

      const sig = buildMusicSig({
        action: "custom_story",
        year,
        method: t10.ok ? t10.method : "templated",
        sourceKey: t10.ok ? t10.sourceKey : "none",
        extra: v,
      });

      const acts = compactMusicFollowUps(year);

      if (shouldDampen(session, sig)) {
        const replyRaw = `Switch the lens. Pick: Top 10 or cinematic.`;
        const reply = applyTurnConstitutionToReply(replyRaw, cog, session);
        const sigLine = detectSignatureLine(reply);

        const coreNext = finalizeCoreSpine({
          corePrev,
          inboundNorm: norm,
          lane: "music",
          topic: "story_moment",
          pendingAskPatch: null,
          lastUserIntent: norm.turnSignals.textEmpty ? "silent_click" : "ask",
          lastAssistantSummary: "served_menu",
          decisionUpper: {
            move: cog.nextMove,
            stage: cog.nextMoveStage || "deliver",
            speak: cog.nextMoveSpeak,
            rationale: cog.nextMoveWhy,
          },
          actionTaken: "served_menu",
        });

        return {
          ok: true,
          reply,
          lane: "music",
          followUps: acts.followUps,
          followUpsStrings: acts.followUpsStrings,
          sessionPatch: {
            lane: "music",
            lastYear: year,
            lastMusicYear: year,
            __musicLastSig: sig,
            lastMusicChart: prevChart,
            activeMusicChart: "custom_story",
            musicMomentsLoaded: !!session.musicMomentsLoaded,
            musicMomentsLoadedAt: Number(session.musicMomentsLoadedAt || 0) || 0,
            ...(sigLine ? { lastSigTransition: sigLine } : {}),
            __spineState: coreNext,
            ...baseCogPatch,
          },
          cog,
          meta: metaBase({
            route: "custom_story",
            dampened: true,
            musicSig: sig,
            confidence: cog.confidence,
            spine: {
              v: Spine.SPINE_VERSION,
              rev: coreNext.rev,
              lane: coreNext.lane,
              stage: coreNext.stage,
              move: cog.nextMove,
            },
          }),
        };
      }

      const story = buildCustomStory({ year, vibe: v, anchorItem });
      const replyRaw = `Okay… now we make it cinematic.\n\n${story}`;
      const reply = applyTurnConstitutionToReply(replyRaw, cog, session);
      const sigLine = detectSignatureLine(reply);

      const fu = [
        {
          id: "fu_top10",
          type: "chip",
          label: `Top 10 (${year})`,
          payload: { lane: "music", action: "top10", year, route: "top10" },
        },
        {
          id: "fu_newyear",
          type: "chip",
          label: "Another year",
          payload: { lane: "music", action: "ask_year", route: "ask_year" },
        },
      ];

      const coreNext = finalizeCoreSpine({
        corePrev,
        inboundNorm: norm,
        lane: "music",
        topic: "story_moment",
        pendingAskPatch: null,
        lastUserIntent: norm.turnSignals.textEmpty ? "silent_click" : "ask",
        lastAssistantSummary: "served_moment",
        decisionUpper: {
          move: cog.nextMove,
          stage: cog.nextMoveStage || "deliver",
          speak: cog.nextMoveSpeak,
          rationale: cog.nextMoveWhy,
        },
        actionTaken: "served_moment",
      });

      return {
        ok: true,
        reply,
        lane: "music",
        followUps: fu,
        followUpsStrings: [`Top 10 (${year})`, "Another year"],
        sessionPatch: {
          lane: "music",
          lastYear: year,
          lastMusicYear: year,
          __musicLastSig: sig,
          lastMusicChart: prevChart,
          activeMusicChart: "custom_story",
          musicMomentsLoaded: true,
          musicMomentsLoadedAt: Number(session.musicMomentsLoadedAt || 0) || nowMs(),
          ...(sigLine ? { lastSigTransition: sigLine } : {}),
          __spineState: coreNext,
          ...baseCogPatch,
        },
        cog,
        meta: metaBase({
          route: "custom_story",
          vibe: v,
          musicSig: sig,
          velvet: !!cog.velvet,
          desire: cog.latentDesire,
          confidence: cog.confidence,
          spine: {
            v: Spine.SPINE_VERSION,
            rev: coreNext.rev,
            lane: coreNext.lane,
            stage: coreNext.stage,
            move: cog.nextMove,
          },
        }),
      };
    }

    // ---- yearend_hot100 ----
    if (action === "yearend_hot100") {
      const res = resolveYearendHot100ForYear(knowledge, year);
      const sig = buildMusicSig({
        action: "yearend_hot100",
        year,
        method: res.method || "none",
        sourceKey: res.sourceKey || "none",
        extra: "v1",
      });

      if (!res.ok) {
        let why = `Year-end Hot 100 for ${year} isn’t available right now.`;
        if (res.reason === "missing_pack")
          why = `I can’t find the wiki year-end Hot 100 by-year pack in knowledge.`;
        if (res.reason === "year_missing_in_pack")
          why = `I found the year-end pack, but ${year} is missing inside it.`;
        if (res.reason === "empty_items_for_year")
          why = `I found ${year}, but the rows are empty (bad ingest / cache gap).`;

        const debug =
          res.sourceKey || res.foundBy
            ? `\n\n(Yearend probe: key=${safeStr(res.sourceKey || "n/a")} foundBy=${safeStr(
                res.foundBy || "n/a"
              )})`
            : "";

        const replyRaw = `${why}${debug}\n\nNext: pinned Top 10 for ${year}.`;
        const reply = applyTurnConstitutionToReply(replyRaw, cog, session);
        const sigLine = detectSignatureLine(reply);

        const fu = [
          {
            id: "fu_top10",
            type: "chip",
            label: `Top 10 (${year})`,
            payload: { lane: "music", action: "top10", year, route: "top10" },
          },
          {
            id: "fu_newyear",
            type: "chip",
            label: "Another year",
            payload: { lane: "music", action: "ask_year", route: "ask_year" },
          },
        ];

        const coreNext = finalizeCoreSpine({
          corePrev,
          inboundNorm: norm,
          lane: "music",
          topic: "year_end",
          pendingAskPatch: null,
          lastUserIntent: norm.turnSignals.textEmpty ? "silent_click" : "ask",
          lastAssistantSummary: "served_error",
          decisionUpper: {
            move: cog.nextMove,
            stage: cog.nextMoveStage || "deliver",
            speak: cog.nextMoveSpeak,
            rationale: cog.nextMoveWhy,
          },
          actionTaken: "served_error",
        });

        return {
          ok: true,
          reply,
          lane: "music",
          followUps: fu,
          followUpsStrings: [`Top 10 (${year})`, "Another year"],
          sessionPatch: {
            lane: "music",
            lastYear: year,
            lastMusicYear: year,
            __musicLastSig: sig,
            lastMusicChart: prevChart,
            activeMusicChart: "yearend_hot100",
            musicMomentsLoaded: !!session.musicMomentsLoaded,
            musicMomentsLoadedAt: Number(session.musicMomentsLoadedAt || 0) || 0,
            ...(sigLine ? { lastSigTransition: sigLine } : {}),
            __spineState: coreNext,
            ...baseCogPatch,
          },
          cog,
          meta: metaBase({
            route: "yearend_hot100",
            found: false,
            reason: res.reason,
            musicSig: sig,
            velvet: !!cog.velvet,
            desire: cog.latentDesire,
            confidence: cog.confidence,
            spine: {
              v: Spine.SPINE_VERSION,
              rev: coreNext.rev,
              lane: coreNext.lane,
              stage: coreNext.stage,
              move: cog.nextMove,
            },
          }),
        };
      }

      if (shouldDampen(session, sig)) {
        const replyRaw = `Already served year-end for ${year}. Next: pinned Top 10.`;
        const reply = applyTurnConstitutionToReply(replyRaw, cog, session);
        const sigLine = detectSignatureLine(reply);

        const fu = [
          {
            id: "fu_top10",
            type: "chip",
            label: `Top 10 (${year})`,
            payload: { lane: "music", action: "top10", year, route: "top10" },
          },
          {
            id: "fu_newyear",
            type: "chip",
            label: "Another year",
            payload: { lane: "music", action: "ask_year", route: "ask_year" },
          },
        ];

        const coreNext = finalizeCoreSpine({
          corePrev,
          inboundNorm: norm,
          lane: "music",
          topic: "year_end",
          pendingAskPatch: null,
          lastUserIntent: norm.turnSignals.textEmpty ? "silent_click" : "ask",
          lastAssistantSummary: "served_menu",
          decisionUpper: {
            move: cog.nextMove,
            stage: cog.nextMoveStage || "deliver",
            speak: cog.nextMoveSpeak,
            rationale: cog.nextMoveWhy,
          },
          actionTaken: "served_menu",
        });

        return {
          ok: true,
          reply,
          lane: "music",
          followUps: fu,
          followUpsStrings: [`Top 10 (${year})`, "Another year"],
          sessionPatch: {
            lane: "music",
            lastYear: year,
            lastMusicYear: year,
            __musicLastSig: sig,
            lastMusicChart: prevChart,
            activeMusicChart: "yearend_hot100",
            musicMomentsLoaded: !!session.musicMomentsLoaded,
            musicMomentsLoadedAt: Number(session.musicMomentsLoadedAt || 0) || 0,
            ...(sigLine ? { lastSigTransition: sigLine } : {}),
            __spineState: coreNext,
            ...baseCogPatch,
          },
          cog,
          meta: metaBase({
            route: "yearend_hot100",
            dampened: true,
            musicSig: sig,
            confidence: cog.confidence,
            spine: {
              v: Spine.SPINE_VERSION,
              rev: coreNext.rev,
              lane: coreNext.lane,
              stage: coreNext.stage,
              move: cog.nextMove,
            },
          }),
        };
      }

      const replyRaw = formatYearendHot100(year, res.items, 20);
      const reply = applyTurnConstitutionToReply(replyRaw, cog, session);
      const sigLine = detectSignatureLine(reply);

      const fu = [
        {
          id: "fu_top10",
          type: "chip",
          label: `Top 10 (${year})`,
          payload: { lane: "music", action: "top10", year, route: "top10" },
        },
        {
          id: "fu_story",
          type: "chip",
          label: "Make it cinematic",
          payload: { lane: "music", action: "story_moment", year, route: "story_moment" },
        },
        {
          id: "fu_newyear",
          type: "chip",
          label: "Another year",
          payload: { lane: "music", action: "ask_year", route: "ask_year" },
        },
      ];

      const coreNext = finalizeCoreSpine({
        corePrev,
        inboundNorm: norm,
        lane: "music",
        topic: "year_end",
        pendingAskPatch: null,
        lastUserIntent: norm.turnSignals.textEmpty ? "silent_click" : "ask",
        lastAssistantSummary: "served_year_end",
        decisionUpper: {
          move: cog.nextMove,
          stage: cog.nextMoveStage || "deliver",
          speak: cog.nextMoveSpeak,
          rationale: cog.nextMoveWhy,
        },
        actionTaken: "served_year_end",
      });

      return {
        ok: true,
        reply,
        lane: "music",
        followUps: fu,
        followUpsStrings: [`Top 10 (${year})`, "Make it cinematic", "Another year"],
        sessionPatch: {
          lane: "music",
          lastYear: year,
          lastMusicYear: year,
          __musicLastSig: sig,
          lastMusicChart: prevChart,
          activeMusicChart: "yearend_hot100",
          musicMomentsLoaded: !!session.musicMomentsLoaded,
          musicMomentsLoadedAt: Number(session.musicMomentsLoadedAt || 0) || 0,
          ...(sigLine ? { lastSigTransition: sigLine } : {}),
          __spineState: coreNext,
          ...baseCogPatch,
        },
        cog,
        meta: metaBase({
          route: "yearend_hot100",
          method: res.method,
          sourceKey: res.sourceKey,
          foundBy: res.foundBy,
          confidence: cog.confidence,
          musicSig: sig,
          velvet: !!cog.velvet,
          desire: cog.latentDesire,
          spine: {
            v: Spine.SPINE_VERSION,
            rev: coreNext.rev,
            lane: coreNext.lane,
            stage: coreNext.stage,
            move: cog.nextMove,
          },
        }),
      };
    }

    // ---- top10 ----
    if (action === "top10") {
      const res = resolveTop10ForYear(knowledge, year, {
        allowDerivedTop10: norm.allowDerivedTop10,
      });

      if (!res.ok) {
        let why = `Top 10 for ${year} isn’t available yet.`;
        if (res.reason === "missing_pack_no_fallback") {
          why = `Pinned Top 10 store is missing. I’m refusing year-end derivation (loop prevention).`;
        } else if (res.reason === "year_missing_in_pack") {
          why = `Top 10 store is present, but ${year} is missing inside it.`;
        } else if (res.reason === "empty_items_for_year") {
          why = `${year} exists in the store, but items are empty (build gap).`;
        } else if (res.reason === "unsupported_pack_shape") {
          why = `Top 10 pack found, but the shape isn’t supported yet.`;
        }

        const acts = compactMusicFollowUps(year);
        const debug =
          res.sourceKey || res.foundBy
            ? `\n\n(Top10 probe: key=${safeStr(res.sourceKey || "n/a")} foundBy=${safeStr(
                res.foundBy || "n/a"
              )})`
            : "";

        const replyRaw = `${why}\n\nNext move: cinematic.${debug}`;
        const reply = applyTurnConstitutionToReply(replyRaw, cog, session);
        const sigLine = detectSignatureLine(reply);

        const coreNext = finalizeCoreSpine({
          corePrev,
          inboundNorm: norm,
          lane: "music",
          topic: "top10_by_year",
          pendingAskPatch: null,
          lastUserIntent: norm.turnSignals.textEmpty ? "silent_click" : "ask",
          lastAssistantSummary: "served_error",
          decisionUpper: {
            move: cog.nextMove,
            stage: cog.nextMoveStage || "deliver",
            speak: cog.nextMoveSpeak,
            rationale: cog.nextMoveWhy,
          },
          actionTaken: "served_error",
        });

        return {
          ok: true,
          reply,
          lane: "music",
          followUps: acts.followUps,
          followUpsStrings: acts.followUpsStrings,
          sessionPatch: {
            lane: "music",
            lastYear: year,
            lastMusicYear: year,
            lastMusicChart: prevChart,
            activeMusicChart: "",
            musicMomentsLoaded: !!session.musicMomentsLoaded,
            musicMomentsLoadedAt: Number(session.musicMomentsLoadedAt || 0) || 0,
            ...(sigLine ? { lastSigTransition: sigLine } : {}),
            __spineState: coreNext,
            ...baseCogPatch,
          },
          cog,
          meta: metaBase({
            route: "top10",
            found: false,
            reason: res.reason,
            allowDerivedTop10: !!norm.allowDerivedTop10,
            velvet: !!cog.velvet,
            desire: cog.latentDesire,
            confidence: cog.confidence,
            spine: {
              v: Spine.SPINE_VERSION,
              rev: coreNext.rev,
              lane: coreNext.lane,
              stage: coreNext.stage,
              move: cog.nextMove,
            },
          }),
        };
      }

      const sig = buildMusicSig({
        action: "top10",
        year,
        method: res.method,
        sourceKey: res.sourceKey,
        extra: "v1",
      });

      const acts = compactMusicFollowUps(year);

      if (shouldDampen(session, sig)) {
        const replyRaw =
          `Same Top 10 beat for ${year}. Switch gears:\n` + `• cinematic\n` + `• another year`;
        const reply = applyTurnConstitutionToReply(replyRaw, cog, session);
        const sigLine = detectSignatureLine(reply);

        const coreNext = finalizeCoreSpine({
          corePrev,
          inboundNorm: norm,
          lane: "music",
          topic: "top10_by_year",
          pendingAskPatch: null,
          lastUserIntent: norm.turnSignals.textEmpty ? "silent_click" : "ask",
          lastAssistantSummary: "served_menu",
          decisionUpper: {
            move: cog.nextMove,
            stage: cog.nextMoveStage || "deliver",
            speak: cog.nextMoveSpeak,
            rationale: cog.nextMoveWhy,
          },
          actionTaken: "served_menu",
        });

        return {
          ok: true,
          reply,
          lane: "music",
          followUps: acts.followUps,
          followUpsStrings: acts.followUpsStrings,
          sessionPatch: {
            lane: "music",
            lastYear: year,
            lastMusicYear: year,
            __musicLastSig: sig,
            lastMusicChart: prevChart,
            activeMusicChart: "top10",
            musicMomentsLoaded: !!session.musicMomentsLoaded,
            musicMomentsLoadedAt: Number(session.musicMomentsLoadedAt || 0) || 0,
            ...(sigLine ? { lastSigTransition: sigLine } : {}),
            __spineState: coreNext,
            ...baseCogPatch,
          },
          cog,
          meta: metaBase({
            route: "top10",
            dampened: true,
            musicSig: sig,
            musicChartKey: "top10",
            method: res.method,
            sourceKey: res.sourceKey,
            foundBy: res.foundBy,
            velvet: !!cog.velvet,
            desire: cog.latentDesire,
            confidence: cog.confidence,
            spine: {
              v: Spine.SPINE_VERSION,
              rev: coreNext.rev,
              lane: coreNext.lane,
              stage: coreNext.stage,
              move: cog.nextMove,
            },
          }),
        };
      }

      const replyRaw = formatTop10(year, res.items);
      const reply = applyTurnConstitutionToReply(replyRaw, cog, session);
      const sigLine = detectSignatureLine(reply);

      const microPack = !!getPinnedMicroMoments(knowledge).pack;
      const momentsLoaded = !!session.musicMomentsLoaded || microPack;
      const momentsLoadedAt =
        Number(session.musicMomentsLoadedAt || 0) || (microPack ? nowMs() : 0);

      const coreNext = finalizeCoreSpine({
        corePrev,
        inboundNorm: norm,
        lane: "music",
        topic: "top10_by_year",
        pendingAskPatch: null,
        lastUserIntent: norm.turnSignals.textEmpty ? "silent_click" : "ask",
        lastAssistantSummary: "served_top10",
        decisionUpper: {
          move: cog.nextMove,
          stage: cog.nextMoveStage || "deliver",
          speak: cog.nextMoveSpeak,
          rationale: cog.nextMoveWhy,
        },
        actionTaken: "served_top10",
      });

      return {
        ok: true,
        reply,
        lane: "music",
        followUps: acts.followUps,
        followUpsStrings: acts.followUpsStrings,
        sessionPatch: {
          lane: "music",
          lastYear: year,
          lastMusicYear: year,
          __musicLastSig: sig,
          lastMusicChart: prevChart,
          activeMusicChart: "top10",
          musicMomentsLoaded: momentsLoaded,
          musicMomentsLoadedAt: momentsLoadedAt,
          ...(sigLine ? { lastSigTransition: sigLine } : {}),
          __spineState: coreNext,
          ...baseCogPatch,
        },
        cog,
        meta: metaBase({
          route: "top10",
          method: res.method,
          sourceKey: res.sourceKey,
          foundBy: res.foundBy,
          confidence: cog.confidence,
          musicSig: sig,
          musicChartKey: "top10",
          allowDerivedTop10: !!norm.allowDerivedTop10,
          velvet: !!cog.velvet,
          desire: cog.latentDesire,
          spine: {
            v: Spine.SPINE_VERSION,
            rev: coreNext.rev,
            lane: coreNext.lane,
            stage: coreNext.stage,
            move: cog.nextMove,
          },
        }),
      };
    }

    // ---- story_moment ----
    if (action === "story_moment") {
      const res = resolveStoryMomentForYear(knowledge, year);
      const sig = buildMusicSig({
        action: "story_moment",
        year,
        method: res.method || "none",
        sourceKey: res.sourceKey || "none",
        extra: "v1",
      });

      const microPack = !!getPinnedMicroMoments(knowledge).pack;
      const momentsLoaded = !!session.musicMomentsLoaded || microPack;
      const momentsLoadedAt =
        Number(session.musicMomentsLoadedAt || 0) || (microPack ? nowMs() : 0);

      if (!res.ok) {
        const replyRaw = `No pinned story moment for ${year}. Pick a mood: romantic, rebellious, or nostalgic.`;
        const reply = applyTurnConstitutionToReply(replyRaw, cog, session);
        const sigLine = detectSignatureLine(reply);

        const fu = [
          {
            id: "fu_rom",
            type: "chip",
            label: "Romantic",
            payload: { lane: "music", action: "custom_story", year, vibe: "romantic", route: "custom_story" },
          },
          {
            id: "fu_reb",
            type: "chip",
            label: "Rebellious",
            payload: { lane: "music", action: "custom_story", year, vibe: "rebellious", route: "custom_story" },
          },
          {
            id: "fu_nos",
            type: "chip",
            label: "Nostalgic",
            payload: { lane: "music", action: "custom_story", year, vibe: "nostalgic", route: "custom_story" },
          },
        ];

        const coreNext = finalizeCoreSpine({
          corePrev,
          inboundNorm: norm,
          lane: "music",
          topic: "story_moment",
          pendingAskPatch: pendingAskObj("need_pick", "clarify", "Pick a mood.", true),
          lastUserIntent: norm.turnSignals.textEmpty ? "silent_click" : "ask",
          lastAssistantSummary: "served_menu",
          decisionUpper: {
            move: cog.nextMove,
            stage: cog.nextMoveStage || "clarify",
            speak: cog.nextMoveSpeak,
            rationale: cog.nextMoveWhy,
          },
          actionTaken: "served_menu",
        });

        return {
          ok: true,
          reply,
          lane: "music",
          followUps: fu,
          followUpsStrings: ["Romantic", "Rebellious", "Nostalgic"],
          sessionPatch: {
            lane: "music",
            lastYear: year,
            lastMusicYear: year,
            __musicLastSig: sig,
            lastMusicChart: prevChart,
            activeMusicChart: "story",
            musicMomentsLoaded: momentsLoaded,
            musicMomentsLoadedAt: momentsLoadedAt,
            ...(sigLine ? { lastSigTransition: sigLine } : {}),
            __spineState: coreNext,
            ...baseCogPatch,
          },
          cog,
          meta: metaBase({
            route: "story_moment",
            found: false,
            reason: res.reason,
            musicSig: sig,
            velvet: !!cog.velvet,
            desire: cog.latentDesire,
            confidence: cog.confidence,
            spine: {
              v: Spine.SPINE_VERSION,
              rev: coreNext.rev,
              lane: coreNext.lane,
              stage: coreNext.stage,
              move: cog.nextMove,
            },
          }),
        };
      }

      if (shouldDampen(session, sig)) {
        const replyRaw = `Already cinematic for ${year}. Next: Top 10 or another year.`;
        const reply = applyTurnConstitutionToReply(replyRaw, cog, session);
        const sigLine = detectSignatureLine(reply);

        const fu = [
          {
            id: "fu_top10",
            type: "chip",
            label: `Top 10 (${year})`,
            payload: { lane: "music", action: "top10", year, route: "top10" },
          },
          {
            id: "fu_newyear",
            type: "chip",
            label: "Another year",
            payload: { lane: "music", action: "ask_year", route: "ask_year" },
          },
        ];

        const coreNext = finalizeCoreSpine({
          corePrev,
          inboundNorm: norm,
          lane: "music",
          topic: "story_moment",
          pendingAskPatch: null,
          lastUserIntent: norm.turnSignals.textEmpty ? "silent_click" : "ask",
          lastAssistantSummary: "served_menu",
          decisionUpper: {
            move: cog.nextMove,
            stage: cog.nextMoveStage || "deliver",
            speak: cog.nextMoveSpeak,
            rationale: cog.nextMoveWhy,
          },
          actionTaken: "served_menu",
        });

        return {
          ok: true,
          reply,
          lane: "music",
          followUps: fu,
          followUpsStrings: [`Top 10 (${year})`, "Another year"],
          sessionPatch: {
            lane: "music",
            lastYear: year,
            lastMusicYear: year,
            __musicLastSig: sig,
            lastMusicChart: prevChart,
            activeMusicChart: "story",
            musicMomentsLoaded: momentsLoaded,
            musicMomentsLoadedAt: momentsLoadedAt,
            ...(sigLine ? { lastSigTransition: sigLine } : {}),
            __spineState: coreNext,
            ...baseCogPatch,
          },
          cog,
          meta: metaBase({
            route: "story_moment",
            dampened: true,
            musicSig: sig,
            confidence: cog.confidence,
            spine: {
              v: Spine.SPINE_VERSION,
              rev: coreNext.rev,
              lane: coreNext.lane,
              stage: coreNext.stage,
              move: cog.nextMove,
            },
          }),
        };
      }

      const replyRaw = `Okay… now we make it cinematic.\n\n${safeStr(res.text).trim()}`;
      const reply = applyTurnConstitutionToReply(replyRaw, cog, session);
      const sigLine = detectSignatureLine(reply);

      const fu = [
        {
          id: "fu_top10",
          type: "chip",
          label: `Top 10 (${year})`,
          payload: { lane: "music", action: "top10", year, route: "top10" },
        },
        {
          id: "fu_newyear",
          type: "chip",
          label: "Another year",
          payload: { lane: "music", action: "ask_year", route: "ask_year" },
        },
      ];

      const coreNext = finalizeCoreSpine({
        corePrev,
        inboundNorm: norm,
        lane: "music",
        topic: "story_moment",
        pendingAskPatch: null,
        lastUserIntent: norm.turnSignals.textEmpty ? "silent_click" : "ask",
        lastAssistantSummary: "served_moment",
        decisionUpper: {
          move: cog.nextMove,
          stage: cog.nextMoveStage || "deliver",
          speak: cog.nextMoveSpeak,
          rationale: cog.nextMoveWhy,
        },
        actionTaken: "served_moment",
      });

      return {
        ok: true,
        reply,
        lane: "music",
        followUps: fu,
        followUpsStrings: [`Top 10 (${year})`, "Another year"],
        sessionPatch: {
          lane: "music",
          lastYear: year,
          lastMusicYear: year,
          __musicLastSig: sig,
          lastMusicChart: prevChart,
          activeMusicChart: "story",
          musicMomentsLoaded: momentsLoaded,
          musicMomentsLoadedAt: momentsLoadedAt,
          ...(sigLine ? { lastSigTransition: sigLine } : {}),
          __spineState: coreNext,
          ...baseCogPatch,
        },
        cog,
        meta: metaBase({
          route: "story_moment",
          method: res.method,
          sourceKey: res.sourceKey,
          foundBy: res.foundBy,
          confidence: cog.confidence,
          musicSig: sig,
          velvet: !!cog.velvet,
          desire: cog.latentDesire,
          spine: {
            v: Spine.SPINE_VERSION,
            rev: coreNext.rev,
            lane: coreNext.lane,
            stage: coreNext.stage,
            move: cog.nextMove,
          },
        }),
      };
    }

    // ---- micro_moment ----
    if (action === "micro_moment") {
      const res = resolveMicroMomentForYear(knowledge, year);
      const sig = buildMusicSig({
        action: "micro_moment",
        year,
        method: res.method || "none",
        sourceKey: res.sourceKey || "none",
        extra: "v1",
      });

      if (!res.ok) {
        const replyRaw = `No micro moment loaded for ${year}. Next: Top 10 or cinematic.`;
        const reply = applyTurnConstitutionToReply(replyRaw, cog, session);
        const sigLine = detectSignatureLine(reply);

        const fu = [
          {
            id: "fu_top10",
            type: "chip",
            label: `Top 10 (${year})`,
            payload: { lane: "music", action: "top10", year, route: "top10" },
          },
          {
            id: "fu_story",
            type: "chip",
            label: "Make it cinematic",
            payload: { lane: "music", action: "story_moment", year, route: "story_moment" },
          },
        ];

        const coreNext = finalizeCoreSpine({
          corePrev,
          inboundNorm: norm,
          lane: "music",
          topic: "story_moment",
          pendingAskPatch: null,
          lastUserIntent: norm.turnSignals.textEmpty ? "silent_click" : "ask",
          lastAssistantSummary: "served_error",
          decisionUpper: {
            move: cog.nextMove,
            stage: cog.nextMoveStage || "deliver",
            speak: cog.nextMoveSpeak,
            rationale: cog.nextMoveWhy,
          },
          actionTaken: "served_error",
        });

        return {
          ok: true,
          reply,
          lane: "music",
          followUps: fu,
          followUpsStrings: [`Top 10 (${year})`, "Make it cinematic"],
          sessionPatch: {
            lane: "music",
            lastYear: year,
            lastMusicYear: year,
            __musicLastSig: sig,
            lastMusicChart: prevChart,
            activeMusicChart: "micro",
            musicMomentsLoaded: !!session.musicMomentsLoaded,
            musicMomentsLoadedAt: Number(session.musicMomentsLoadedAt || 0) || 0,
            ...(sigLine ? { lastSigTransition: sigLine } : {}),
            __spineState: coreNext,
            ...baseCogPatch,
          },
          cog,
          meta: metaBase({
            route: "micro_moment",
            found: false,
            reason: res.reason,
            musicSig: sig,
            velvet: !!cog.velvet,
            desire: cog.latentDesire,
            confidence: cog.confidence,
            spine: {
              v: Spine.SPINE_VERSION,
              rev: coreNext.rev,
              lane: coreNext.lane,
              stage: coreNext.stage,
              move: cog.nextMove,
            },
          }),
        };
      }

      if (shouldDampen(session, sig)) {
        const replyRaw = `Micro moment for ${year} is already sealed. Next: another year or switch lanes.`;
        const reply = applyTurnConstitutionToReply(replyRaw, cog, session);
        const sigLine = detectSignatureLine(reply);

        const fu = [
          {
            id: "fu_newyear",
            type: "chip",
            label: "Another year",
            payload: { lane: "music", action: "ask_year", route: "ask_year" },
          },
          {
            id: "fu_general",
            type: "chip",
            label: "Switch lanes",
            payload: { lane: "general", action: "switch_lane", route: "switch_lane" },
          },
        ];

        const coreNext = finalizeCoreSpine({
          corePrev,
          inboundNorm: norm,
          lane: "music",
          topic: "story_moment",
          pendingAskPatch: null,
          lastUserIntent: norm.turnSignals.textEmpty ? "silent_click" : "ask",
          lastAssistantSummary: "served_menu",
          decisionUpper: {
            move: cog.nextMove,
            stage: cog.nextMoveStage || "deliver",
            speak: cog.nextMoveSpeak,
            rationale: cog.nextMoveWhy,
          },
          actionTaken: "served_menu",
        });

        return {
          ok: true,
          reply,
          lane: "music",
          followUps: fu,
          followUpsStrings: ["Another year", "Switch lanes"],
          sessionPatch: {
            lane: "music",
            lastYear: year,
            lastMusicYear: year,
            __musicLastSig: sig,
            lastMusicChart: prevChart,
            activeMusicChart: "micro",
            musicMomentsLoaded: true,
            musicMomentsLoadedAt: Number(session.musicMomentsLoadedAt || 0) || nowMs(),
            ...(sigLine ? { lastSigTransition: sigLine } : {}),
            __spineState: coreNext,
            ...baseCogPatch,
          },
          cog,
          meta: metaBase({
            route: "micro_moment",
            dampened: true,
            musicSig: sig,
            confidence: cog.confidence,
            spine: {
              v: Spine.SPINE_VERSION,
              rev: coreNext.rev,
              lane: coreNext.lane,
              stage: coreNext.stage,
              move: cog.nextMove,
            },
          }),
        };
      }

      const replyRaw = `Micro moment.\n\n${safeStr(res.text).trim()}`;
      const reply = applyTurnConstitutionToReply(replyRaw, cog, session);
      const sigLine = detectSignatureLine(reply);

      const fu = [
        {
          id: "fu_top10",
          type: "chip",
          label: `Top 10 (${year})`,
          payload: { lane: "music", action: "top10", year, route: "top10" },
        },
        {
          id: "fu_story",
          type: "chip",
          label: "Make it cinematic",
          payload: { lane: "music", action: "story_moment", year, route: "story_moment" },
        },
      ];

      const coreNext = finalizeCoreSpine({
        corePrev,
        inboundNorm: norm,
        lane: "music",
        topic: "story_moment",
        pendingAskPatch: null,
        lastUserIntent: norm.turnSignals.textEmpty ? "silent_click" : "ask",
        lastAssistantSummary: "served_moment",
        decisionUpper: {
          move: cog.nextMove,
          stage: cog.nextMoveStage || "deliver",
          speak: cog.nextMoveSpeak,
          rationale: cog.nextMoveWhy,
        },
        actionTaken: "served_moment",
      });

      return {
        ok: true,
        reply,
        lane: "music",
        followUps: fu,
        followUpsStrings: [`Top 10 (${year})`, "Make it cinematic"],
        sessionPatch: {
          lane: "music",
          lastYear: year,
          lastMusicYear: year,
          __musicLastSig: sig,
          lastMusicChart: prevChart,
          activeMusicChart: "micro",
          musicMomentsLoaded: true,
          musicMomentsLoadedAt: Number(session.musicMomentsLoadedAt || 0) || nowMs(),
          ...(sigLine ? { lastSigTransition: sigLine } : {}),
          __spineState: coreNext,
          ...baseCogPatch,
        },
        cog,
        meta: metaBase({
          route: "micro_moment",
          method: res.method,
          sourceKey: res.sourceKey,
          foundBy: res.foundBy,
          confidence: cog.confidence,
          musicSig: sig,
          velvet: !!cog.velvet,
          desire: cog.latentDesire,
          spine: {
            v: Spine.SPINE_VERSION,
            rev: coreNext.rev,
            lane: coreNext.lane,
            stage: coreNext.stage,
            move: cog.nextMove,
          },
        }),
      };
    }

    // fallback menu (Top10-only)
    if (year) {
      const acts = compactMusicFollowUps(year);
      const replyRaw =
        discoveryHint && discoveryHint.enabled && discoveryHint.forcedChoice
          ? `${safeStr(discoveryHint.question).trim()}\n\nFor ${year}: Top 10, cinematic, or Year-End Hot 100.`
          : `For ${year}: Top 10, cinematic, or Year-End Hot 100.`;

      const reply = applyTurnConstitutionToReply(replyRaw, cog, session);
      const sigLine = detectSignatureLine(reply);

      const fu = [
        {
          id: "fu_top10",
          type: "chip",
          label: `Top 10 (${year})`,
          payload: { lane: "music", action: "top10", year, route: "top10" },
        },
        acts.followUps[0],
        {
          id: "fu_yearend",
          type: "chip",
          label: `Year-End Hot 100 (${year})`,
          payload: { lane: "music", action: "yearend_hot100", year, route: "yearend_hot100" },
        },
        acts.followUps[1],
      ];

      const coreNext = finalizeCoreSpine({
        corePrev,
        inboundNorm: norm,
        lane: "music",
        topic: "help",
        pendingAskPatch: null,
        lastUserIntent: norm.turnSignals.textEmpty ? "silent_click" : "ask",
        lastAssistantSummary: "served_menu",
        decisionUpper: {
          move: cog.nextMove,
          stage: cog.nextMoveStage || "deliver",
          speak: cog.nextMoveSpeak,
          rationale: cog.nextMoveWhy,
        },
        actionTaken: "served_menu",
      });

      return {
        ok: true,
        reply,
        lane: "music",
        followUps: fu,
        followUpsStrings: [
          `Top 10 (${year})`,
          acts.followUpsStrings[0],
          `Year-End Hot 100 (${year})`,
          acts.followUpsStrings[1],
        ],
        sessionPatch: {
          lane: "music",
          lastYear: year,
          lastMusicYear: year,
          activeMusicChart: safeStr(session.activeMusicChart || ""),
          lastMusicChart: safeStr(session.lastMusicChart || ""),
          musicMomentsLoaded: !!session.musicMomentsLoaded,
          musicMomentsLoadedAt: Number(session.musicMomentsLoadedAt || 0) || 0,
          ...(sigLine ? { lastSigTransition: sigLine } : {}),
          __spineState: coreNext,
          ...baseCogPatch,
        },
        cog,
        meta: metaBase({
          route: "music_menu",
          velvet: !!cog.velvet,
          desire: cog.latentDesire,
          confidence: cog.confidence,
          spine: {
            v: Spine.SPINE_VERSION,
            rev: coreNext.rev,
            lane: coreNext.lane,
            stage: coreNext.stage,
            move: cog.nextMove,
          },
        }),
      };
    }

    const replyRaw = `Give me a year (${PUBLIC_MIN_YEAR}–${PUBLIC_MAX_YEAR}).`;
    const reply = applyTurnConstitutionToReply(replyRaw, cog, session);
    const sigLine = detectSignatureLine(reply);

    const coreNext = finalizeCoreSpine({
      corePrev,
      inboundNorm: norm,
      lane: "music",
      topic: "help",
      pendingAskPatch: pendingAskObj(
        "need_year",
        "clarify",
        `Give me a year (${PUBLIC_MIN_YEAR}–${PUBLIC_MAX_YEAR}).`,
        true
      ),
      lastUserIntent: norm.turnSignals.textEmpty ? "silent_click" : "ask",
      lastAssistantSummary: "asked_year",
      decisionUpper: {
        move: cog.nextMove,
        stage: cog.nextMoveStage || "clarify",
        speak: cog.nextMoveSpeak,
        rationale: cog.nextMoveWhy,
      },
      actionTaken: "asked_year",
    });

    return {
      ok: true,
      reply,
      lane: "music",
      sessionPatch: {
        lane: "music",
        ...(sigLine ? { lastSigTransition: sigLine } : {}),
        __spineState: coreNext,
        ...baseCogPatch,
      },
      cog,
      meta: metaBase({
        route: "music_need_year",
        velvet: !!cog.velvet,
        desire: cog.latentDesire,
        confidence: cog.confidence,
        spine: {
          v: Spine.SPINE_VERSION,
          rev: coreNext.rev,
          lane: coreNext.lane,
          stage: coreNext.stage,
          move: cog.nextMove,
        },
      }),
    };
  }

  // ---------------------------------
  // GENERAL
  // ---------------------------------
  if ((cog.mode === "architect" || cog.mode === "transitional") && cog.intent === "ADVANCE") {
    const replyRaw = `Defaulting to Music. Give me a year (${PUBLIC_MIN_YEAR}–${PUBLIC_MAX_YEAR}).`;
    const reply = applyTurnConstitutionToReply(replyRaw, cog, session);
    const sigLine = detectSignatureLine(reply);

    const coreNext = finalizeCoreSpine({
      corePrev,
      inboundNorm: norm,
      lane: "music",
      topic: "help",
      pendingAskPatch: pendingAskObj(
        "need_year",
        "clarify",
        `Give me a year (${PUBLIC_MIN_YEAR}–${PUBLIC_MAX_YEAR}).`,
        true
      ),
      lastUserIntent: norm.turnSignals.textEmpty ? "silent_click" : "ask",
      lastAssistantSummary: "asked_year",
      decisionUpper: {
        move: cog.nextMove,
        stage: cog.nextMoveStage || "clarify",
        speak: cog.nextMoveSpeak,
        rationale: cog.nextMoveWhy,
      },
      actionTaken: "asked_year",
    });

    return {
      ok: true,
      reply,
      lane: "music",
      sessionPatch: {
        lane: "music",
        ...(sigLine ? { lastSigTransition: sigLine } : {}),
        __spineState: coreNext,
        ...baseCogPatch,
      },
      cog,
      meta: metaBase({
        route: "general_default_music",
        velvet: !!cog.velvet,
        desire: cog.latentDesire,
        confidence: cog.confidence,
        spine: {
          v: Spine.SPINE_VERSION,
          rev: coreNext.rev,
          lane: coreNext.lane,
          stage: coreNext.stage,
          move: cog.nextMove,
        },
      }),
    };
  }

  // If user is asking for a “what do you want to talk about” opener, route into counselor-lite intro
  if (
    /\b(what do you want to talk about|what should we talk about|can we talk|i need to talk|just talk)\b/i.test(
      safeStr(norm.text || "")
    )
  ) {
    const replyRaw = counselorLiteIntro(norm, session, cog);
    const reply = applyTurnConstitutionToReply(replyRaw, cog, session);
    const sigLine = detectSignatureLine(reply);
    const f = counselorFollowUps();

    const coreNext = finalizeCoreSpine({
      corePrev,
      inboundNorm: norm,
      lane: "general",
      topic: "help",
      pendingAskPatch: null,
      lastUserIntent: "ask",
      lastAssistantSummary: "counsel_intro",
      decisionUpper: {
        move: cog.nextMove,
        stage: cog.nextMoveStage || "deliver",
        speak: cog.nextMoveSpeak,
        rationale: cog.nextMoveWhy,
      },
      actionTaken: "served_counsel_intro",
    });

    return {
      ok: true,
      reply,
      lane: "general",
      followUps: f.followUps,
      followUpsStrings: f.followUpsStrings,
      sessionPatch: {
        lane: "general",
        ...(sigLine ? { lastSigTransition: sigLine } : {}),
        __spineState: coreNext,
        ...baseCogPatch,
      },
      cog,
      meta: metaBase({
        route: "general_counsel_intro",
        spine: {
          v: Spine.SPINE_VERSION,
          rev: coreNext.rev,
          lane: coreNext.lane,
          stage: coreNext.stage,
          move: cog.nextMove,
        },
      }),
    };
  }

  // DISCOVERY HINT: if novelty is high, force-choice chips instead of open-ended ask.
  const replyRaw =
    discoveryHint && discoveryHint.enabled
      ? safeStr(discoveryHint.question).trim()
      : safeStr(norm.text)
      ? `Tell me what you want next: music, movies, or sponsors.`
      : `Okay — tell me what you want next.`;

  const reply = applyTurnConstitutionToReply(replyRaw, cog, session);
  const sigLine = detectSignatureLine(reply);

  const fu = [
    { id: "fu_music", type: "chip", label: "Music", payload: { lane: "music", action: "ask_year", route: "ask_year" } },
    { id: "fu_movies", type: "chip", label: "Movies", payload: { lane: "movies", route: "movies" } },
    { id: "fu_sponsors", type: "chip", label: "Sponsors", payload: { lane: "sponsors", route: "sponsors" } },
  ];

  const coreNext = finalizeCoreSpine({
    corePrev,
    inboundNorm: norm,
    lane: lane || "general",
    topic: "help",
    pendingAskPatch: pendingAskObj("need_pick", "clarify", "Pick what you want next.", true),
    lastUserIntent: norm.turnSignals.textEmpty ? "silent_click" : "ask",
    lastAssistantSummary: "served_menu",
    decisionUpper: {
      move: cog.nextMove,
      stage: cog.nextMoveStage || "clarify",
      speak: cog.nextMoveSpeak,
      rationale: cog.nextMoveWhy,
    },
    actionTaken: "served_menu",
  });

  return {
    ok: true,
    reply,
    lane: lane || "general",
    followUps: fu,
    followUpsStrings: ["Music", "Movies", "Sponsors"],
    sessionPatch: {
      lane: lane || "general",
      ...(sigLine ? { lastSigTransition: sigLine } : {}),
      __spineState: coreNext,
      ...baseCogPatch,
    },
    cog,
    meta: metaBase({
      route: "general",
      velvet: !!cog.velvet,
      desire: cog.latentDesire,
      confidence: cog.confidence,
      spine: {
        v: Spine.SPINE_VERSION,
        rev: coreNext.rev,
        lane: coreNext.lane,
        stage: coreNext.stage,
        move: cog.nextMove,
      },
    }),
  };
}

module.exports = {
  CE_VERSION,
  handleChat,
  default: handleChat,

  // Expose for diagnostics / internal tests (safe, no side effects)
  LATENT_DESIRE,
  SIGNATURE_TRANSITIONS,
  validateNyxTone,
  runToneRegressionTests,

  // Expose canonical spine module reference (safe)
  STATE_SPINE_VERSION: Spine.SPINE_VERSION,
  STATE_SPINE: Spine,
};

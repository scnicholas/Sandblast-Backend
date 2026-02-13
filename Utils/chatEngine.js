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
 * v0.7bU (MUSIC EXTRACTION++++ + HARDENING++++)
 * ✅ Pulls ALL music knowledge/resolvers/formatting out into Utils/musicKnowledge.js
 * ✅ Keeps: MARION SO WIRED++++ (Utils/marionSO.js canonical mediator) + TELEMETRY++++ + DISCOVERY HINT++++
 * ✅ Keeps: STATE SPINE WIRED++++ (Utils/stateSpine.js canonical planner + pendingAsk clear on chip-year)
 * ✅ Fix++++: Ranked-list budgeting now guarantees 10 numbered lines survive constitution prefixes
 * ✅ Fix++++: reset sessionPatch ordering (reset flags cannot be overridden by baseCogPatch)
 * ✅ Fix++++: Option A greeting never triggers on reset
 * ✅ Fix++++: Music.handleMusicTurn is now awaited (supports sync OR async implementations safely)
 *
 * v0.7bV (EXPORT HARDENING++++)
 * ✅ Adds bulletproof export shim: supports require("./chatEngine") as:
 *    - function (callable)
 *    - { handleChat }
 *    - { chatEngine }
 *    - { default }
 * ✅ Prevents “exports wrong” breakages across backend loaders.
 */

const CE_VERSION =
  "chatEngine v0.7bV (MUSIC EXTRACTION++++ -> Utils/musicKnowledge.js | MARION SO WIRED++++ via Utils/marionSO.js | TELEMETRY++++ + DISCOVERY HINT++++ | STATE SPINE WIRED++++ via Utils/stateSpine.js | HARDENING++++ + ranked-list budget guarantee + reset ordering fix + await music module | EXPORT HARDENING++++ shim)";

const Spine = require("./stateSpine");
const MarionSO = require("./marionSO");

// Music module (all music logic lives there now).
// FAIL-OPEN: if missing or throws, chatEngine stays alive and returns a graceful message.
let Music = null;
try {
  // eslint-disable-next-line global-require
  Music = require("./musicKnowledge");
} catch (e) {
  Music = null;
}

// Prefer MarionSO enums when present; keep local fallback for backward compatibility/tests.
const SO_LATENT_DESIRE =
  MarionSO && MarionSO.LATENT_DESIRE ? MarionSO.LATENT_DESIRE : null;

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
function countNumberedLines(text) {
  const lines = splitLines(text);
  let n = 0;
  for (const ln of lines) {
    if (/^\s*\d+\.\s+/.test(ln)) n++;
  }
  return n;
}

// Ranked-list budget guarantee: slice until we have N numbered lines (move/greet/transition can add blanks)
function takeUntilNumbered(text, wantNumbered, hardMaxLines) {
  const lines = splitLines(text);
  const out = [];
  let seen = 0;

  for (let i = 0; i < lines.length; i++) {
    out.push(lines[i]);
    if (/^\s*\d+\.\s+/.test(lines[i])) seen++;
    if (seen >= wantNumbered) break;
    if (out.length >= hardMaxLines) break; // fail-safe
  }

  while (out.length && !safeStr(out[out.length - 1]).trim()) out.pop();
  return out.join("\n").trim();
}

function applyBudgetText(s, budget) {
  // budget: "short" | "medium"
  const txt = safeStr(s).trim();
  if (!txt) return "";

  const numbered = countNumberedLines(txt);

  // Ranked lists: guarantee a meaningful minimum survives constitution prefixes.
  if (numbered >= 6) {
    if (budget === "short") return takeUntilNumbered(txt, 10, 60); // Top 10 guaranteed
    return takeUntilNumbered(txt, 20, 120); // year-end excerpt
  }

  // Non-list copy: tighter.
  if (budget === "short") return takeLines(txt, 6);
  return takeLines(txt, 14);
}

function hasActionablePayload(payload) {
  if (!isPlainObject(payload)) return false;
  const keys = Object.keys(payload);
  if (!keys.length) return false;

  // Only these keys count as "turn is actionable"
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
  const p = isPlainObject(norm?.payload) ? norm.payload : {};
  const keyObj = {
    t: safeStr(norm?.text || ""),
    a: safeStr(norm?.action || ""),
    y: normYear(norm?.year),
    l: safeStr(norm?.lane || ""),
    v: safeStr(norm?.vibe || ""),
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

  // Never greet on reset (hard rule)
  if (safeStr(norm?.action || "") === "reset") return "";

  // Never greet on replay/burst
  const lastKey = safeStr(s.__lastInboundKey || "").trim();
  if (lastKey && inboundKey && lastKey === inboundKey) return "";

  // Avoid greeting on text-empty chip taps
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

  const seed = {
    lane: safeStr(s.lane || "").trim() || "general",
    stage: safeStr(prev?.stage || "").trim() || "open",
    topic: safeStr(prev?.topic || "").trim() || "",
    lastUserIntent: safeStr(prev?.lastUserIntent || "").trim() || "",
    pendingAsk: prev?.pendingAsk || null,
    goal: prev?.goal || null,
    engagementTemp: prev?.engagementTemp || safeStr(s.engagementTemp || ""),
  };

  if (!prev || typeof prev !== "object") return Spine.createState(seed);

  const out = { ...prev };
  if (!safeStr(out.__spineVersion)) out.__spineVersion = Spine.SPINE_VERSION;
  if (!Number.isFinite(out.rev)) out.rev = 0;
  return out;
}

function finalizeCoreSpine({
  corePrev,
  inboundNorm,
  lane,
  topic,
  pendingAskPatch,
  lastUserIntent,
  lastAssistantSummary,
  decisionUpper,
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

  try {
    Spine.assertTurnUpdated(prev, next);
  } catch (e) {
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
const MARION_TRACE_MAX = 160;
function marionTraceBuild(norm, s, med) {
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

  if (!action) score += 0.18;

  const len = t.length;
  if (len >= 180) score += 0.18;
  if (len >= 420) score += 0.18;

  const q = (t.match(/\?/g) || []).length;
  if (q >= 2) score += 0.12;
  if (q >= 4) score += 0.12;

  if (!hasPayload && !action) score += 0.12;

  if (textEmpty && actionablePayload) score -= 0.15;

  const lastLane = safeStr(s.lane || "").trim();
  if (lastLane && lane && lastLane !== lane && !action) score += 0.10;

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

  const actionable = !!cog?.actionable;
  if (intent !== "CLARIFY" || actionable) {
    return { enabled: false, reason: "no" };
  }
  if (noveltyScore < 0.65) {
    return { enabled: false, reason: "low_novelty" };
  }

  const forcedChoice = mode === "architect" || mode === "transitional";

  let question = "Pick one: what do you want next?";
  let options = ["Music", "Movies", "Sponsors"];

  if (lane === "music" || action) {
    question = `Pick one: Top 10, cinematic, or year-end?`;
    options = ["Top 10", "Make it cinematic", "Year-End Hot 100"];
  }

  if (!forcedChoice) {
    question = lane === "music" ? `Which one should I do first?` : `What should we do first?`;
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
  if (!cog || cog.intent !== "ADVANCE") return "";
  if (cog.dominance !== "firm") return "";
  if (clamp01(cog?.confidence?.nyx) < 0.65) return "";

  const last = safeStr(session?.lastSigTransition || "").trim();
  for (const t of SIGNATURE_TRANSITIONS) {
    if (t !== last) return t;
  }
  return "";
}

function detectSignatureLine(replyText) {
  const paras = safeStr(replyText)
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .slice(0, 4);

  for (const p of paras) {
    const firstLine = safeStr(p).split("\n")[0].trim();
    for (const t of SIGNATURE_TRANSITIONS) {
      if (firstLine === t) return firstLine;
    }
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

  // NOTE: music routes still recognized here, but execution is delegated to musicKnowledge.js
  if (/\b(top\s*10|top ten)\b/.test(t)) return "top10";
  if (/\b(story\s*moment|make it cinematic|cinematic)\b/.test(t))
    return "story_moment";
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

  if (/\b(let's|lets)\s+(define|design|lock|implement|encode|ship|wire)\b/.test(s)) {
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
  if (/\b(step\s*\d+|1\s*,\s*2\s*,\s*3|1\s*2\s*3)\b/.test(s) || /\b\d+\)\s/.test(s)) {
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

  if (a > 0 && u > 0) {
    tr += 3;
    why.push("transitional:mixed-signals");
  }

  let mode = "";
  if (tr >= 3) mode = "transitional";
  else if (a >= u + 2) mode = "architect";
  else if (u >= a + 2) mode = "user";
  else mode = "";

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

  if (hasAction) return "ADVANCE";
  if (payloadActionable && hasPayload && (payloadAction || payloadYear !== null))
    return "ADVANCE";
  if (payloadActionable && textEmpty && hasPayload) return "ADVANCE";

  if (/\b(explain|how do i|how to|what is|walk me through|where do i|get|why)\b/.test(s))
    return "CLARIFY";

  if (/\b(i('?m)?\s+stuck|i('?m)?\s+worried|overwhelmed|frustrated|anxious)\b/.test(s))
    return "STABILIZE";

  return "CLARIFY";
}

// -------------------------
// latent desire inference
// -------------------------
function inferLatentDesire(norm, session, cog) {
  const t = safeStr(norm?.text || "").toLowerCase();
  const a = safeStr(norm?.action || "").toLowerCase();
  const macMode = safeStr(cog?.mode || "").toLowerCase();

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

  if (a === "counsel_intro") return LATENT_DESIRE.COMFORT;

  // Music interactions typically seek anchoring/authority unless explicitly reflective
  if (a === "top10" || a === "yearend_hot100") return LATENT_DESIRE.AUTHORITY;
  if (a === "story_moment" || a === "micro_moment" || a === "custom_story")
    return LATENT_DESIRE.COMFORT;

  if (macMode === "architect") {
    if (/\bdesign|implement|encode|ship|lock\b/.test(t)) return LATENT_DESIRE.MASTERY;
    return LATENT_DESIRE.AUTHORITY;
  }

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

  let user = 0.5;

  if (
    action ||
    (actionablePayload &&
      hasPayload &&
      (norm?.turnSignals?.payloadAction || norm?.turnSignals?.payloadYear !== null))
  )
    user += 0.15;
  if (textEmpty && hasPayload && actionablePayload) user += 0.05;
  if (/\b(i('?m)?\s+not\s+sure|confused|stuck|overwhelmed)\b/i.test(text)) user -= 0.25;
  if (/\b(are you sure|really\??)\b/i.test(text)) user -= 0.1;

  let nyx = 0.55;

  if (safeStr(cog?.intent).toUpperCase() === "ADVANCE") nyx += 0.15;
  if (safeStr(cog?.intent).toUpperCase() === "STABILIZE") nyx -= 0.25;

  const lastAction = safeStr(s.lastAction || "").trim();
  const lastYear = normYear(s.lastYear);
  const yr = normYear(norm?.year);
  if (lastAction && lastAction === action && lastYear && yr && lastYear === yr) nyx += 0.1;

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

  const repeatedTopic = !!(lastLane && lane && lastLane === lane && yr && lastYear && yr === lastYear);
  const acceptedChip = !!(
    norm?.turnSignals?.hasPayload &&
    norm?.turnSignals?.payloadActionable &&
    (norm?.turnSignals?.payloadAction || norm?.turnSignals?.payloadYear !== null)
  );

  const musicFirstEligible = lane === "music" || action;

  let signals = 0;
  if (wantsDepth) signals++;
  if (repeatedTopic) signals++;
  if (acceptedChip) signals++;
  if (clamp01(cog?.confidence?.nyx) >= 0.6) signals++;
  if (desire === LATENT_DESIRE.COMFORT || desire === LATENT_DESIRE.CURIOSITY) signals++;

  if (!musicFirstEligible) {
    return { velvet: already, velvetSince: Number(s.velvetSince || 0) || 0, reason: already ? "carry" : "no" };
  }

  if (already) {
    if (safeStr(cog?.intent).toUpperCase() === "STABILIZE") {
      return { velvet: false, velvetSince: Number(s.velvetSince || 0) || 0, reason: "stabilize_exit" };
    }
    if (lastLane && lane && lastLane !== lane) {
      return { velvet: false, velvetSince: Number(s.velvetSince || 0) || 0, reason: "lane_shift_exit" };
    }
    return { velvet: true, velvetSince: Number(s.velvetSince || 0) || now, reason: "hold" };
  }

  if (signals >= 2) return { velvet: true, velvetSince: now, reason: "entry" };

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

  const payloadAction = safeStr(payload.action || body.action || ctx.action || "").trim();
  const inferredAction = classifyAction(textRaw, payload);
  const action = payloadAction || inferredAction || "";

  const payloadYear = normYear(payload.year) ?? normYear(body.year) ?? normYear(ctx.year) ?? null;
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
// -------------------------
function mediatorMarion(norm, session) {
  const s = isPlainObject(session) ? session : {};
  const lastIntent = safeStr(s.lastTurnIntent || "").trim().toUpperCase();
  const lastAt = Number(s.lastTurnAt || 0) || 0;
  const lastAdvanceAt = Number(s.lastAdvanceAt || 0) || 0;

  const hasPayload = !!norm.turnSignals?.hasPayload;
  const textEmpty = !!norm.turnSignals?.textEmpty;
  const payloadActionable = !!norm.turnSignals?.payloadActionable;

  let mode = safeStr(norm.macMode || "").trim().toLowerCase();
  if (!mode) mode = "architect";
  if (mode !== "architect" && mode !== "user" && mode !== "transitional") mode = "architect";

  const now = nowMs();
  const stalled = lastAdvanceAt ? now - lastAdvanceAt > 90 * 1000 : false;

  let intent = safeStr(norm.turnIntent || "").trim().toUpperCase();
  if (intent !== "ADVANCE" && intent !== "CLARIFY" && intent !== "STABILIZE") intent = "CLARIFY";

  const actionable =
    !!safeStr(norm.action).trim() ||
    (payloadActionable &&
      hasPayload &&
      (norm.turnSignals.payloadAction || norm.turnSignals.payloadYear !== null));

  if (stalled && (mode === "architect" || mode === "transitional") && intent !== "ADVANCE") {
    intent = actionable ? "ADVANCE" : "CLARIFY";
  }
  if (actionable) intent = "ADVANCE";

  let dominance = "neutral";
  let budget = "medium";

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

  const grounding = mode === "user" || mode === "transitional";
  const groundingMaxLines = intent === "STABILIZE" ? 3 : grounding ? 1 : 0;

  const latentDesire = inferLatentDesire(norm, s, { mode, intent, dominance, budget });
  const confidence = inferConfidence(norm, s, { mode, intent, dominance, budget });

  const velvet = computeVelvet(norm, s, { mode, intent, dominance, budget, confidence }, latentDesire);

  if (velvet.velvet && mode === "user" && intent !== "ADVANCE") dominance = "soft";
  if (
    latentDesire === LATENT_DESIRE.MASTERY &&
    (mode === "architect" || mode === "transitional") &&
    intent === "ADVANCE"
  )
    dominance = "firm";

  let marionState = "SEEK";
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

  if (/\bearlier you (said|mentioned)\b/i.test(text))
    return { ok: false, reason: "ban:earlier_you_said" };
  if (
    /\b(as an ai|i (remember|recall)|in our previous conversation|you told me before)\b/i.test(
      text
    )
  )
    return { ok: false, reason: "ban:meta_memory" };

  if (cog?.intent === "ADVANCE" && cog?.dominance === "firm") {
    if (/\b(i think|maybe|perhaps|might be|could be)\b/i.test(text))
      return { ok: false, reason: "ban:overhedge_firm" };
  }

  if (cog?.intent === "ADVANCE" && cog?.dominance === "firm") {
    if (/\b(if you want|if you'd like|let me know)\b/i.test(text))
      return { ok: false, reason: "ban:softness_tail_firm" };
  }

  return { ok: true, reason: "ok" };
}

function applyTurnConstitutionToReply(rawReply, cog, session) {
  let body = safeStr(rawReply).trim();
  if (!body) return "";

  const moveLine = oneLine(safeStr(cog?.nextMoveSpeak || "")).trim();
  const greet = oneLine(safeStr(cog?.greetLine || "")).trim();
  const trans = pickSignatureTransition(session || {}, cog || {});

  const parts = [];
  if (moveLine) parts.push(moveLine);
  if (greet) parts.push(greet);
  if (trans) parts.push(trans);
  parts.push(body);

  let reply = parts.join("\n\n");

  reply = applyBudgetText(reply, cog.budget);

  if (cog.intent === "ADVANCE" && cog.dominance === "firm") {
    reply = reply
      .replace(/\b(if you want|if you'd like|let me know)\b.*$/i, "")
      .trim();
  }

  const check = validateNyxTone(cog, reply);
  if (!check.ok) {
    reply = reply
      .replace(/\bearlier you (said|mentioned)\b.*$/i, "")
      .replace(
        /\b(as an ai|i (remember|recall)|in our previous conversation|you told me before)\b.*$/i,
        ""
      )
      .trim();

    if (cog?.intent === "ADVANCE" && cog?.dominance === "firm") {
      reply = reply
        .replace(/\b(i think|maybe|perhaps|might be|could be)\b/gi, "")
        .replace(/\s{2,}/g, " ")
        .trim();
    }

    reply = applyBudgetText(reply, cog.budget);
  }

  if (!reply) {
    reply = `Give me a year (${PUBLIC_MIN_YEAR}–${PUBLIC_MAX_YEAR}). I’ll start with Top 10.`;
    reply = applyBudgetText(reply, cog.budget);
  }

  return reply;
}

// -------------------------
// tone regression tests (no deps)
// -------------------------
function runToneRegressionTests() {
  const failures = [];

  function assert(name, cond, detail) {
    if (!cond) failures.push({ name, detail: safeStr(detail || "") });
  }

  // 1) Ranked list budget must keep 10 numbered lines even with constitution prefixes
  const cFirm = {
    intent: "ADVANCE",
    dominance: "firm",
    budget: "short",
    confidence: { nyx: 0.9 },
    nextMoveSpeak: "I’m going to advance: smallest next change first, then we verify.",
    greetLine: "Alright, Mac.",
  };
  const listBody =
    "Top 10 — 1984\n\n" +
    Array.from({ length: 10 })
      .map((_, i) => `${i + 1}. “Song” — Artist`)
      .join("\n");
  const composed = applyTurnConstitutionToReply(listBody, cFirm, {
    lastSigTransition: "",
  });
  assert("budget_ranked_list_keeps_10_with_prefix", countNumberedLines(composed) >= 10, composed);

  // 2) Firm ADVANCE removes softness tails
  const soft = "Do X. Let me know if you'd like.";
  const out2 = applyTurnConstitutionToReply(soft, cFirm, {
    lastSigTransition: "",
  });
  assert("firm_removes_soft_tail", !/\blet me know\b/i.test(out2), out2);

  // 3) Ban “Earlier you said…”
  const out3 = applyTurnConstitutionToReply("Earlier you said X, so Y.", cFirm, {});
  assert("ban_earlier_you_said", !/\bearlier you (said|mentioned)\b/i.test(out3), out3);

  // 4) Signature transition not repeated consecutively + must be valid or blank
  const s1 = { lastSigTransition: SIGNATURE_TRANSITIONS[0] };
  const out4 = applyTurnConstitutionToReply("Do X.", cFirm, s1);
  const sig4 = detectSignatureLine(out4);
  assert("no_repeat_signature_transition", sig4 !== SIGNATURE_TRANSITIONS[0], out4);
  assert("signature_is_valid_transition_or_blank", sig4 === "" || SIGNATURE_TRANSITIONS.includes(sig4), sig4);

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
    decisionUpper: { move: "CLARIFY", stage: "clarify", speak: "Test.", rationale: "test" },
    actionTaken: "test",
  });
  assert("core_spine_rev_increments", sp1.rev === sp0.rev + 1, `${sp0.rev}->${sp1.rev}`);

  // 7) Option A: greeting should not duplicate when inboundKey repeats
  const sess = { __greeted: false, __lastInboundKey: "abc" };
  const g = computeOptionAGreetingLine(
    sess,
    { action: "", turnSignals: { textEmpty: false, hasPayload: false } },
    { mode: "user" },
    "abc"
  );
  assert("optionA_no_greet_on_replay", g === "", g);

  // 8) Option A: greeting never on reset
  const g2 = computeOptionAGreetingLine(
    { __greeted: false, __lastInboundKey: "" },
    { action: "reset", turnSignals: { textEmpty: false, hasPayload: false } },
    { mode: "user" },
    "zzz"
  );
  assert("optionA_no_greet_on_reset", g2 === "", g2);

  return { ok: failures.length === 0, failures, ran: 8 };
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

  const corePrev = coerceCoreSpine(session);

  let cog = null;
  try {
    if (MarionSO && typeof MarionSO.mediate === "function") {
      cog = MarionSO.mediate(norm, session, {});
    }
  } catch (e) {
    cog = null;
  }
  if (!cog) cog = mediatorMarion(norm, session);

  const corePlan = Spine.decideNextMove(corePrev, { text: norm.text || "" });

  cog.nextMove = toUpperMove(corePlan.move);
  cog.nextMoveSpeak = safeStr(corePlan.speak || "");
  cog.nextMoveWhy = safeStr(corePlan.rationale || "");
  cog.nextMoveStage = safeStr(corePlan.stage || "");

  if (SO_LATENT_DESIRE && cog && safeStr(cog.latentDesire || "")) {
    const ld = safeStr(cog.latentDesire || "");
    cog.latentDesire = ld;
  }

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

  const inboundKey = buildInboundKey(norm);
  cog.inboundKey = inboundKey;
  cog.greetLine = computeOptionAGreetingLine(session, norm, cog, inboundKey);

  const yearSticky = normYear(session.lastYear) ?? null;
  const year = norm.year ?? yearSticky ?? null;

  const lane =
    safeStr(norm.lane || "").trim() ||
    (norm.action ? "music" : "") ||
    safeStr(session.lane || "").trim() ||
    safeStr(corePrev?.lane || "").trim() ||
    "general";

  // Common session telemetry patch (kept small and safe)
  const baseCogPatch = {
    lastMacMode: safeStr(cog.mode || ""),
    lastTurnIntent: safeStr(cog.intent || ""),
    lastTurnAt: nowMs(),
    ...(safeStr(cog.intent || "").toUpperCase() === "ADVANCE" ? { lastAdvanceAt: nowMs() } : {}),

    __lastInboundKey: inboundKey,
    ...(cog.greetLine ? { __greeted: true, __greetedAt: nowMs() } : {}),

    lastLatentDesire: safeStr(cog.latentDesire || ""),
    lastUserConfidence: clamp01(cog?.confidence?.user),
    lastNyxConfidence: clamp01(cog?.confidence?.nyx),
    velvetMode: !!cog.velvet,
    velvetSince: cog.velvet ? Number(cog.velvetSince || 0) || nowMs() : 0,
    lastAction: safeStr(norm.action || ""),

    marionState: safeStr(cog.marionState || ""),
    marionReason: safeStr(cog.marionReason || ""),
    marionTrace: safeStr(cog.marionTrace || ""),
    marionTraceHash: safeStr(cog.marionTraceHash || ""),

    lastNoveltyScore: clamp01(cog.noveltyScore),
    lastDiscoveryHintOn: !!(cog.discoveryHint && cog.discoveryHint.enabled),
    lastDiscoveryHintReason: safeStr(cog.discoveryHint?.reason || ""),
  };

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

  // -------------------------
  // reset
  // -------------------------
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
        // ordering: baseCogPatch FIRST, then hard reset flags override it
        ...baseCogPatch,

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

        __greeted: false,
        __greetedAt: 0,
        __lastInboundKey: "",

        __spineState: coreNext,
      },
      cog,
      meta: metaBase({
        resetHint: true,
        spine: { v: Spine.SPINE_VERSION, rev: coreNext.rev, lane: coreNext.lane, stage: coreNext.stage },
      }),
    };
  }

  // -------------------------
  // counselor-lite
  // -------------------------
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
        spine: { v: Spine.SPINE_VERSION, rev: coreNext.rev, lane: coreNext.lane, stage: coreNext.stage, move: cog.nextMove },
      }),
    };
  }

  // -------------------------
  // ask_year + switch_lane (engine-owned UI, not knowledge)
  // -------------------------
  if (norm.action === "ask_year") {
    const replyRaw = `Give me a year (${PUBLIC_MIN_YEAR}–${PUBLIC_MAX_YEAR}). I’ll start with Top 10.`;
    const reply = applyTurnConstitutionToReply(replyRaw, cog, session);
    const sigLine = detectSignatureLine(reply);

    const fu = [
      { id: "fu_1973", type: "chip", label: "1973", payload: { lane: "music", action: "top10", year: 1973, route: "top10" } },
      { id: "fu_1988", type: "chip", label: "1988", payload: { lane: "music", action: "top10", year: 1988, route: "top10" } },
      { id: "fu_1992", type: "chip", label: "1992", payload: { lane: "music", action: "top10", year: 1992, route: "top10" } },
    ];

    const coreNext = finalizeCoreSpine({
      corePrev,
      inboundNorm: norm,
      lane: "music",
      topic: "help",
      pendingAskPatch: pendingAskObj("need_year", "clarify", `Give me a year (${PUBLIC_MIN_YEAR}–${PUBLIC_MAX_YEAR}).`, true),
      lastUserIntent: norm.turnSignals.textEmpty ? "silent_click" : "ask",
      lastAssistantSummary: "asked_year",
      decisionUpper: { move: cog.nextMove, stage: cog.nextMoveStage || "clarify", speak: cog.nextMoveSpeak, rationale: cog.nextMoveWhy },
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
        spine: { v: Spine.SPINE_VERSION, rev: coreNext.rev, lane: coreNext.lane, stage: coreNext.stage, move: cog.nextMove },
      }),
    };
  }

  if (norm.action === "switch_lane") {
    const baseMenu = `Pick a lane:\n\n• Music\n• Movies\n• Sponsors`;
    const replyRaw =
      discoveryHint && discoveryHint.enabled && discoveryHint.forcedChoice
        ? `${safeStr(discoveryHint.question).trim()}\n\n• Music\n• Movies\n• Sponsors`
        : baseMenu;

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
      lane: "general",
      topic: "help",
      pendingAskPatch: pendingAskObj("need_pick", "clarify", "Pick a lane.", true),
      lastUserIntent: norm.turnSignals.textEmpty ? "silent_click" : "ask",
      lastAssistantSummary: "asked_lane",
      decisionUpper: { move: cog.nextMove, stage: cog.nextMoveStage || "clarify", speak: cog.nextMoveSpeak, rationale: cog.nextMoveWhy },
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
        spine: { v: Spine.SPINE_VERSION, rev: coreNext.rev, lane: coreNext.lane, stage: coreNext.stage, move: cog.nextMove },
      }),
    };
  }

  // -------------------------
  // year guards (engine-owned)
  // -------------------------
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
        payload: { lane: "music", action: norm.action || "top10", year: 1973, route: safeStr(norm.action || "top10") },
      },
      {
        id: "fu_1988",
        type: "chip",
        label: "1988",
        payload: { lane: "music", action: norm.action || "top10", year: 1988, route: safeStr(norm.action || "top10") },
      },
      {
        id: "fu_1960",
        type: "chip",
        label: "1960",
        payload: { lane: "music", action: norm.action || "top10", year: 1960, route: safeStr(norm.action || "top10") },
      },
    ];

    const coreNext = finalizeCoreSpine({
      corePrev,
      inboundNorm: norm,
      lane: "music",
      topic: "help",
      pendingAskPatch: pendingAskObj("need_year", "clarify", `Give me a year (${PUBLIC_MIN_YEAR}–${PUBLIC_MAX_YEAR}).`, true),
      lastUserIntent: norm.turnSignals.textEmpty ? "silent_click" : "ask",
      lastAssistantSummary: "asked_year",
      decisionUpper: { move: cog.nextMove, stage: cog.nextMoveStage || "clarify", speak: cog.nextMoveSpeak, rationale: cog.nextMoveWhy },
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
        spine: { v: Spine.SPINE_VERSION, rev: coreNext.rev, lane: coreNext.lane, stage: coreNext.stage, move: cog.nextMove },
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
      pendingAskPatch: pendingAskObj("need_year", "clarify", `Use a year in ${PUBLIC_MIN_YEAR}–${PUBLIC_MAX_YEAR}.`, true),
      lastUserIntent: norm.turnSignals.textEmpty ? "silent_click" : "ask",
      lastAssistantSummary: "asked_year_range",
      decisionUpper: { move: cog.nextMove, stage: cog.nextMoveStage || "clarify", speak: cog.nextMoveSpeak, rationale: cog.nextMoveWhy },
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
        spine: { v: Spine.SPINE_VERSION, rev: coreNext.rev, lane: coreNext.lane, stage: coreNext.stage, move: cog.nextMove },
      }),
    };
  }

  // -------------------------
  // MUSIC handling (delegated to Utils/musicKnowledge.js)
  // -------------------------
  const action = norm.action || (lane === "music" && year ? "top10" : "");

  if (lane === "music" || action) {
    let musicOut = null;
    try {
      if (Music && typeof Music.handleMusicTurn === "function") {
        musicOut = await Promise.resolve(
          Music.handleMusicTurn({
            norm,
            session,
            knowledge,
            year,
            action,
            opts: {
              allowDerivedTop10: !!norm.allowDerivedTop10,
              publicMinYear: PUBLIC_MIN_YEAR,
              publicMaxYear: PUBLIC_MAX_YEAR,
            },
          })
        );
      }
    } catch (e) {
      musicOut = null;
    }

    if (!musicOut || !isPlainObject(musicOut)) {
      const replyRaw =
        "Music module isn’t wired yet. Drop Utils/musicKnowledge.js (with handleMusicTurn) and I’ll route cleanly.";
      const reply = applyTurnConstitutionToReply(replyRaw, cog, session);
      const sigLine = detectSignatureLine(reply);

      const coreNext = finalizeCoreSpine({
        corePrev,
        inboundNorm: norm,
        lane: "music",
        topic: "help",
        pendingAskPatch: pendingAskObj("need_music_module", "clarify", "Wire Utils/musicKnowledge.js (handleMusicTurn).", true),
        lastUserIntent: norm.turnSignals.textEmpty ? "silent_click" : "ask",
        lastAssistantSummary: "music_module_missing",
        decisionUpper: { move: cog.nextMove, stage: cog.nextMoveStage || "clarify", speak: cog.nextMoveSpeak, rationale: cog.nextMoveWhy },
        actionTaken: "music_module_missing",
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
          route: "music_module_missing",
          spine: { v: Spine.SPINE_VERSION, rev: coreNext.rev, lane: coreNext.lane, stage: coreNext.stage, move: cog.nextMove },
        }),
      };
    }

    const reply = applyTurnConstitutionToReply(safeStr(musicOut.replyRaw || ""), cog, session);
    const sigLine = detectSignatureLine(reply);

    const coreNext = finalizeCoreSpine({
      corePrev,
      inboundNorm: norm,
      lane: "music",
      topic: safeStr(musicOut.topic || "music"),
      pendingAskPatch: musicOut.pendingAsk || null,
      lastUserIntent: norm.turnSignals.textEmpty ? "silent_click" : "ask",
      lastAssistantSummary: safeStr(musicOut.lastAssistantSummary || "served_music"),
      decisionUpper: {
        move: cog.nextMove,
        stage: cog.nextMoveStage || safeStr(musicOut.spineStage || "deliver"),
        speak: cog.nextMoveSpeak,
        rationale: cog.nextMoveWhy,
      },
      actionTaken: safeStr(musicOut.actionTaken || "served_music"),
    });

    const musicPatch = isPlainObject(musicOut.sessionPatch) ? musicOut.sessionPatch : {};

    return {
      ok: true,
      reply,
      lane: "music",
      followUps: asArray(musicOut.followUps),
      followUpsStrings: asArray(musicOut.followUpsStrings),
      sessionPatch: {
        lane: "music",
        ...musicPatch,
        ...(sigLine ? { lastSigTransition: sigLine } : {}),
        __spineState: coreNext,
        ...baseCogPatch,
      },
      cog,
      meta: metaBase({
        route: safeStr(musicOut.route || "music"),
        ...(isPlainObject(musicOut.meta) ? musicOut.meta : {}),
        spine: { v: Spine.SPINE_VERSION, rev: coreNext.rev, lane: coreNext.lane, stage: coreNext.stage, move: cog.nextMove },
      }),
    };
  }

  // -------------------------
  // GENERAL handling
  // -------------------------
  if ((cog.mode === "architect" || cog.mode === "transitional") && cog.intent === "ADVANCE") {
    const replyRaw = `Defaulting to Music. Give me a year (${PUBLIC_MIN_YEAR}–${PUBLIC_MAX_YEAR}).`;
    const reply = applyTurnConstitutionToReply(replyRaw, cog, session);
    const sigLine = detectSignatureLine(reply);

    const coreNext = finalizeCoreSpine({
      corePrev,
      inboundNorm: norm,
      lane: "music",
      topic: "help",
      pendingAskPatch: pendingAskObj("need_year", "clarify", `Give me a year (${PUBLIC_MIN_YEAR}–${PUBLIC_MAX_YEAR}).`, true),
      lastUserIntent: norm.turnSignals.textEmpty ? "silent_click" : "ask",
      lastAssistantSummary: "asked_year",
      decisionUpper: { move: cog.nextMove, stage: cog.nextMoveStage || "clarify", speak: cog.nextMoveSpeak, rationale: cog.nextMoveWhy },
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
        spine: { v: Spine.SPINE_VERSION, rev: coreNext.rev, lane: coreNext.lane, stage: coreNext.stage, move: cog.nextMove },
      }),
    };
  }

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
      decisionUpper: { move: cog.nextMove, stage: cog.nextMoveStage || "deliver", speak: cog.nextMoveSpeak, rationale: cog.nextMoveWhy },
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
        spine: { v: Spine.SPINE_VERSION, rev: coreNext.rev, lane: coreNext.lane, stage: coreNext.stage, move: cog.nextMove },
      }),
    };
  }

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
    decisionUpper: { move: cog.nextMove, stage: cog.nextMoveStage || "clarify", speak: cog.nextMoveSpeak, rationale: cog.nextMoveWhy },
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
      spine: { v: Spine.SPINE_VERSION, rev: coreNext.rev, lane: coreNext.lane, stage: coreNext.stage, move: cog.nextMove },
    }),
  };
}

/**
 * EXPORT HARDENING++++
 * - Some loaders do: const { chatEngine } = require("./Utils/chatEngine")
 * - Others do: const chatEngine = require("./Utils/chatEngine")
 * - Others do: const { handleChat } = require(...)
 * This makes ALL of them work.
 */
const chatEngine = handleChat;

// Build an export object, then merge onto the callable function (so require() can be invoked directly).
const _exportObj = {
  CE_VERSION,

  // primary callable(s)
  handleChat,
  chatEngine,
  default: handleChat,

  // diagnostics / internal tests (safe, no side effects)
  LATENT_DESIRE,
  SIGNATURE_TRANSITIONS,
  validateNyxTone,
  runToneRegressionTests,

  // canonical spine module reference (safe)
  STATE_SPINE_VERSION: Spine.SPINE_VERSION,
  STATE_SPINE: Spine,
};

// Make module.exports callable (function) AND also have properties.
const _callable = function exportedChatEngine() {
  // preserve async semantics
  // eslint-disable-next-line prefer-rest-params
  return handleChat.apply(null, arguments);
};
Object.assign(_callable, _exportObj);

// Also provide explicit names to satisfy destructuring import patterns.
_callable.chatEngine = handleChat;
_callable.handleChat = handleChat;
_callable.default = handleChat;

// Mark (lightly) for interop
_callable.__esModule = true;

module.exports = _callable;

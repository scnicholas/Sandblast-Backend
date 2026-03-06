"use strict";

/**
 * governor.js
 * -----------------------------------------------------------------------------
 * Conversation Governor for Nyx + Marion
 *
 * Purpose:
 * - Cut repetitive response loops fast
 * - Prevent clarifier storms
 * - Detect near-duplicate assistant outputs
 * - Fuse unstable bridges temporarily when recursion risk rises
 * - Preserve fail-open behavior for commercial deployments
 * - Emit telemetry-safe state for downstream orchestration
 *
 * Designed to be backward-compatible with existing call patterns while adding:
 * 1) rolling loop window memory
 * 2) semantic duplicate protection
 * 3) repeated-clarifier suppression
 * 4) unresolved-thread awareness
 * 5) route-confidence / ambiguity gating
 * 6) bridge fuse + recovery timing
 * 7) action-hint propagation
 * 8) cooldown-backed branch diversion
 * 9) stable telemetry metadata
 * 10) commercial-grade defensive guards
 *
 * Exported entrypoint:
 *   applyGovernor(input)
 */

/* -------------------------------------------------------------------------- */
/* Utilities                                                                  */
/* -------------------------------------------------------------------------- */

function safeStr(x) {
  return x == null ? "" : String(x);
}

function safeNum(x, d) {
  var n = Number(x);
  return Number.isFinite(n) ? n : d;
}

function safeBool(x, d) {
  return typeof x === "boolean" ? x : !!d;
}

function nowMs() {
  return Date.now();
}

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

function uniq(arr) {
  return Array.from(new Set(Array.isArray(arr) ? arr : []));
}

function normalize(text) {
  return safeStr(text)
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 800);
}

function tokenize(text) {
  var n = normalize(text);
  return n ? n.split(" ").filter(Boolean) : [];
}

function hashLite(str) {
  str = safeStr(str);
  var h = 2166136261;
  for (var i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = (h * 16777619) >>> 0;
  }
  return h.toString(16);
}

function buildSig(text) {
  return hashLite(normalize(text));
}

function jaccard(a, b) {
  var A = new Set(tokenize(a));
  var B = new Set(tokenize(b));
  if (!A.size || !B.size) return 0;
  var hit = 0;
  A.forEach(function (v) {
    if (B.has(v)) hit += 1;
  });
  var den = A.size + B.size - hit;
  return den > 0 ? hit / den : 0;
}

function overlapRatio(a, b) {
  var A = tokenize(a);
  var B = tokenize(b);
  if (!A.length || !B.length) return 0;
  var shorter = A.length <= B.length ? A : B;
  var longerSet = new Set(A.length > B.length ? A : B);
  var hit = 0;
  for (var i = 0; i < shorter.length; i += 1) {
    if (longerSet.has(shorter[i])) hit += 1;
  }
  return shorter.length ? hit / shorter.length : 0;
}

function trimArray(arr, max) {
  var list = Array.isArray(arr) ? arr.slice(0) : [];
  if (list.length <= max) return list;
  return list.slice(list.length - max);
}

function pickFirstNonEmpty() {
  for (var i = 0; i < arguments.length; i += 1) {
    if (arguments[i]) return arguments[i];
  }
  return "";
}

/* -------------------------------------------------------------------------- */
/* Memory Shape                                                                */
/* -------------------------------------------------------------------------- */

function ensureMemory(memoryCtx) {
  var m = memoryCtx && typeof memoryCtx === "object" ? memoryCtx : {};

  if (!m.loop || typeof m.loop !== "object") {
    m.loop = {};
  }

  if (!m.bridge || typeof m.bridge !== "object") {
    m.bridge = {};
  }

  if (!m.memoryWindows || typeof m.memoryWindows !== "object") {
    m.memoryWindows = {};
  }

  if (!m.telemetry || typeof m.telemetry !== "object") {
    m.telemetry = {};
  }

  var loop = m.loop;
  loop.n = safeNum(loop.n, 0);
  loop.severity = clamp(safeNum(loop.severity, 0), 0, 5);
  loop.clarifyCount = safeNum(loop.clarifyCount, 0);
  loop.lastClarifierSig = safeStr(loop.lastClarifierSig);
  loop.sig = safeStr(loop.sig);
  loop.lastText = safeStr(loop.lastText);
  loop.lastUserSig = safeStr(loop.lastUserSig);
  loop.lastDecision = safeStr(loop.lastDecision || "pass");
  loop.branchCount = safeNum(loop.branchCount, 0);
  loop.lastLoopAt = safeNum(loop.lastLoopAt, 0);
  loop.cooldownUntil = safeNum(loop.cooldownUntil, 0);
  if (!Array.isArray(loop.history)) loop.history = [];

  var bridge = m.bridge;
  bridge.fused = safeBool(bridge.fused, false);
  bridge.fuseReason = safeStr(bridge.fuseReason);
  bridge.fusedUntil = safeNum(bridge.fusedUntil, 0);
  bridge.recoveryCount = safeNum(bridge.recoveryCount, 0);

  var w = m.memoryWindows;
  if (!Array.isArray(w.recentIntents)) w.recentIntents = [];
  if (!Array.isArray(w.unresolvedAsks)) w.unresolvedAsks = [];
  if (!Array.isArray(w.recentResponses)) w.recentResponses = [];
  if (!Array.isArray(w.recentUserTurns)) w.recentUserTurns = [];
  w.lastResolvedIntent = safeStr(w.lastResolvedIntent);
  w.lastUserPreference = w.lastUserPreference || null;

  return m;
}

function getWindow(memoryCtx) {
  var m = ensureMemory(memoryCtx);
  var w = m.memoryWindows;
  return {
    recentIntents: Array.isArray(w.recentIntents) ? w.recentIntents : [],
    unresolvedAsks: Array.isArray(w.unresolvedAsks) ? w.unresolvedAsks : [],
    recentResponses: Array.isArray(w.recentResponses) ? w.recentResponses : [],
    recentUserTurns: Array.isArray(w.recentUserTurns) ? w.recentUserTurns : [],
    lastResolvedIntent: safeStr(w.lastResolvedIntent || ""),
    lastUserPreference: w.lastUserPreference || null
  };
}

/* -------------------------------------------------------------------------- */
/* Evidence and Response Extraction                                            */
/* -------------------------------------------------------------------------- */

function extractPrimaryText(evidence) {
  if (!evidence || typeof evidence !== "object") return "";
  if (typeof evidence.text === "string") return evidence.text;
  if (evidence.primary && typeof evidence.primary.text === "string") return evidence.primary.text;
  if (typeof evidence.responseText === "string") return evidence.responseText;
  return "";
}

function extractUserText(input) {
  if (!input || typeof input !== "object") return "";
  return pickFirstNonEmpty(
    safeStr(input.userText),
    safeStr(input.query),
    safeStr(input.inputText),
    safeStr(input.message),
    safeStr(input.prompt)
  ).slice(0, 600);
}

/* -------------------------------------------------------------------------- */
/* Rolling History                                                             */
/* -------------------------------------------------------------------------- */

function pushLoopHistory(memoryCtx, entry) {
  var m = ensureMemory(memoryCtx);
  var loop = m.loop;
  loop.history.push({
    at: safeNum(entry && entry.at, nowMs()),
    kind: safeStr(entry && entry.kind),
    sig: safeStr(entry && entry.sig),
    score: safeNum(entry && entry.score, 0),
    action: safeStr(entry && entry.action),
    note: safeStr(entry && entry.note)
  });
  loop.history = trimArray(loop.history, 12);
  return loop.history;
}

function pushRecentResponse(memoryCtx, text) {
  var m = ensureMemory(memoryCtx);
  var w = m.memoryWindows;
  if (!text) return w.recentResponses;
  w.recentResponses.push({ sig: buildSig(text), text: normalize(text), at: nowMs() });
  w.recentResponses = trimArray(w.recentResponses, 6);
  return w.recentResponses;
}

function pushRecentUserTurn(memoryCtx, text) {
  var m = ensureMemory(memoryCtx);
  var w = m.memoryWindows;
  if (!text) return w.recentUserTurns;
  w.recentUserTurns.push({ sig: buildSig(text), text: normalize(text), at: nowMs() });
  w.recentUserTurns = trimArray(w.recentUserTurns, 6);
  return w.recentUserTurns;
}

/* -------------------------------------------------------------------------- */
/* Loop Detection                                                              */
/* -------------------------------------------------------------------------- */

function isNearDuplicate(a, b) {
  if (!a || !b) return false;
  var sigA = buildSig(a);
  var sigB = buildSig(b);
  if (sigA === sigB) return true;

  var jac = jaccard(a, b);
  var over = overlapRatio(a, b);
  return jac >= 0.9 || (jac >= 0.82 && over >= 0.9) || over >= 0.96;
}

function getRepeatScore(current, memoryCtx) {
  var m = ensureMemory(memoryCtx);
  var loop = m.loop;
  var w = getWindow(m);
  var cur = normalize(current);
  if (!cur) return 0;

  var score = 0;

  if (loop.sig && loop.sig === buildSig(cur)) score += 0.65;
  if (loop.lastText && isNearDuplicate(cur, loop.lastText)) score += 0.55;

  for (var i = 0; i < w.recentResponses.length; i += 1) {
    var item = w.recentResponses[i];
    if (item && item.text && isNearDuplicate(cur, item.text)) {
      score += 0.22;
    }
  }

  return clamp(score, 0, 1.5);
}

function isRepeat(current, memoryCtx) {
  return getRepeatScore(current, memoryCtx) >= 0.72;
}

function updateLoopState(text, userText, memoryCtx, decisionName) {
  var m = ensureMemory(memoryCtx);
  var loop = m.loop;
  loop.sig = buildSig(text);
  loop.lastText = normalize(text);
  loop.lastUserSig = userText ? buildSig(userText) : loop.lastUserSig;
  loop.lastDecision = safeStr(decisionName || loop.lastDecision || "pass");
  pushRecentResponse(m, text);
  if (userText) pushRecentUserTurn(m, userText);
  return loop;
}

function escalateLoop(memoryCtx, meta) {
  var m = ensureMemory(memoryCtx);
  var loop = m.loop;
  var bump = safeNum(meta && meta.bump, 1);
  loop.n += bump;
  loop.lastLoopAt = nowMs();
  if (loop.n >= 2) {
    loop.severity = clamp(loop.severity + 1, 0, 5);
  }
  pushLoopHistory(m, {
    at: nowMs(),
    kind: "loop",
    score: safeNum(meta && meta.score, 0),
    action: safeStr(meta && meta.action),
    note: safeStr(meta && meta.note)
  });
  return loop;
}

function softenLoop(memoryCtx) {
  var m = ensureMemory(memoryCtx);
  var loop = m.loop;
  loop.n = 0;
  loop.clarifyCount = 0;
  loop.branchCount = 0;
  loop.cooldownUntil = 0;
  if (loop.severity > 0) loop.severity -= 1;
  return loop;
}

function isCoolingDown(memoryCtx) {
  var m = ensureMemory(memoryCtx);
  return safeNum(m.loop.cooldownUntil, 0) > nowMs();
}

function setCooldown(memoryCtx, ms) {
  var m = ensureMemory(memoryCtx);
  m.loop.cooldownUntil = nowMs() + Math.max(2500, safeNum(ms, 7000));
  return m.loop.cooldownUntil;
}

/* -------------------------------------------------------------------------- */
/* Clarifier Control                                                           */
/* -------------------------------------------------------------------------- */

function canClarify(memoryCtx) {
  var m = ensureMemory(memoryCtx);
  var loop = m.loop;
  return loop.clarifyCount < 2 && !isCoolingDown(m);
}

function noteClarifier(memoryCtx, q) {
  var m = ensureMemory(memoryCtx);
  var loop = m.loop;
  loop.clarifyCount += 1;
  loop.lastClarifierSig = buildSig(q);
  loop.lastDecision = "clarify";
  pushLoopHistory(m, {
    at: nowMs(),
    kind: "clarifier",
    sig: loop.lastClarifierSig,
    action: "clarify",
    note: q
  });
  return loop;
}

function sameClarifier(memoryCtx, q) {
  var m = ensureMemory(memoryCtx);
  return m.loop.lastClarifierSig && m.loop.lastClarifierSig === buildSig(q);
}

function inferClarifier(input) {
  var it = input && input.intent ? input.intent : {};
  var domain = safeStr(input && input.domain || it.domain || "general");
  var action = safeStr(input && input.musicAction || it.musicAction || "");
  var year = safeStr(input && input.musicYear || it.musicYear || "");
  var userText = extractUserText(input).slice(0, 140);

  if (domain === "music_history" && action && !year) {
    return "Do you want a specific year for that chart request, or should I choose the strongest one for you?";
  }
  if (domain === "tech_support") {
    return "Do you want the fastest fix first, or the root cause behind it?";
  }
  if (domain === "business_support") {
    return "Do you want strategy, funding direction, or a concrete draft right now?";
  }
  if (domain === "voice" || /voice|audio|tts|sound|loop/i.test(userText)) {
    return "Do you want me to stop the loop first, or stabilize the full voice path?";
  }
  if (userText) {
    return "Do you want the direct fix, or the clean system explanation for \"" + userText + "\"?";
  }
  return "Should I answer with the direct fix, or narrow this with one clean option first?";
}

/* -------------------------------------------------------------------------- */
/* Bridge Fuse                                                                 */
/* -------------------------------------------------------------------------- */

function fuseBridge(memoryCtx, reason, ms) {
  var m = ensureMemory(memoryCtx);
  var bridge = m.bridge;
  var fuseMs = Math.max(6000, safeNum(ms, 12000));
  bridge.fused = true;
  bridge.fuseReason = safeStr(reason || "loop_guard");
  bridge.fusedUntil = nowMs() + fuseMs;
  pushLoopHistory(m, {
    at: nowMs(),
    kind: "fuse",
    action: "branch",
    note: bridge.fuseReason
  });
  return bridge;
}

function recoverBridge(memoryCtx) {
  var m = ensureMemory(memoryCtx);
  var bridge = m.bridge;
  if (bridge.fused && bridge.fusedUntil <= nowMs()) {
    bridge.fused = false;
    bridge.fuseReason = "";
    bridge.fusedUntil = 0;
    bridge.recoveryCount += 1;
    pushLoopHistory(m, {
      at: nowMs(),
      kind: "recover",
      action: "pass",
      note: "bridge_recovered"
    });
  }
  return bridge;
}

/* -------------------------------------------------------------------------- */
/* Branching                                                                   */
/* -------------------------------------------------------------------------- */

function buildBranchResponse(input, memoryCtx) {
  var w = getWindow(memoryCtx);
  var unresolved = w.unresolvedAsks.length ? w.unresolvedAsks[w.unresolvedAsks.length - 1] : "";
  var unresolvedHint = unresolved
    ? " The open thread I still see is: \"" + safeStr(unresolved).slice(0, 160) + "\"."
    : "";

  var userText = extractUserText(input);
  var currentHint = userText
    ? " Current ask: \"" + userText.slice(0, 160) + "\"."
    : "";

  return {
    type: "branch",
    text:
      "We are starting to circle. I am going to split this cleanly." +
      unresolvedHint +
      currentHint +
      " Do you want the immediate fix first, or the system map behind it?",
    nextAction: "branch",
    options: ["Immediate fix", "System map"],
    actionHints: ["repair_path", "architecture_path"]
  };
}

/* -------------------------------------------------------------------------- */
/* Decision                                                                    */
/* -------------------------------------------------------------------------- */

function buildGovernorMeta(opts) {
  return {
    repeat: safeBool(opts && opts.repeat, false),
    repeatScore: safeNum(opts && opts.repeatScore, 0),
    severity: safeNum(opts && opts.severity, 0),
    routeConfidence: safeNum(opts && opts.routeConfidence, 0),
    intentConfidence: safeNum(opts && opts.intentConfidence, 0),
    ambiguity: safeNum(opts && opts.ambiguity, 0),
    fused: safeBool(opts && opts.fused, false),
    empty: safeBool(opts && opts.empty, false),
    cooldown: safeBool(opts && opts.cooldown, false),
    actionHint: safeStr(opts && opts.actionHint)
  };
}

function decision(input, memoryCtx, assistantText) {
  var m = ensureMemory(memoryCtx);
  var intent = input && input.intent && typeof input.intent === "object" ? input.intent : {};
  var userText = extractUserText(input);

  var routeConfidence = clamp(
    safeNum(input && input.routeConfidence, safeNum(intent.routeConfidence, 0.5)),
    0,
    1
  );
  var intentConfidence = clamp(
    safeNum(input && input.intentConfidence, safeNum(intent.confidence, 0.5)),
    0,
    1
  );
  var ambiguity = clamp(
    safeNum(input && input.ambiguity, safeNum(intent.ambiguity, 0.2)),
    0,
    1
  );

  recoverBridge(m);

  var repeatScore = getRepeatScore(assistantText, m);
  var repeat = repeatScore >= 0.72;

  if (!repeat) {
    softenLoop(m);
    updateLoopState(assistantText, userText, m, "pass");
    pushLoopHistory(m, {
      at: nowMs(),
      kind: "pass",
      sig: buildSig(assistantText),
      score: repeatScore,
      action: "pass",
      note: "clean_output"
    });
    return {
      action: "pass",
      text: assistantText,
      memory: m,
      governor: buildGovernorMeta({
        repeat: false,
        repeatScore: repeatScore,
        severity: m.loop.severity,
        routeConfidence: routeConfidence,
        intentConfidence: intentConfidence,
        ambiguity: ambiguity,
        actionHint: "continue"
      })
    };
  }

  var loop = escalateLoop(m, {
    bump: 1,
    score: repeatScore,
    action: "loop_detected",
    note: "repeat_output"
  });

  var q = inferClarifier(input);
  var canUseClarifier =
    canClarify(m) &&
    !sameClarifier(m, q) &&
    (routeConfidence < 0.74 || ambiguity > 0.4 || intentConfidence < 0.66 || loop.severity <= 1);

  if (canUseClarifier) {
    noteClarifier(m, q);
    setCooldown(m, 5000 + loop.severity * 1000);
    return {
      action: "clarify",
      response: {
        type: "clarifier",
        text: q,
        minimize: true,
        nextAction: "clarify",
        actionHints: ["resolve_ambiguity"]
      },
      memory: m,
      governor: buildGovernorMeta({
        repeat: true,
        repeatScore: repeatScore,
        severity: loop.severity,
        routeConfidence: routeConfidence,
        intentConfidence: intentConfidence,
        ambiguity: ambiguity,
        cooldown: true,
        actionHint: "clarify_once"
      })
    };
  }

  loop.branchCount += 1;
  setCooldown(m, 9000 + loop.severity * 1500);
  fuseBridge(m, "repeat_loop", 12000 + loop.severity * 3000);

  return {
    action: "branch",
    response: buildBranchResponse(input, m),
    memory: m,
    governor: buildGovernorMeta({
      repeat: true,
      repeatScore: repeatScore,
      severity: loop.severity,
      routeConfidence: routeConfidence,
      intentConfidence: intentConfidence,
      ambiguity: ambiguity,
      fused: true,
      cooldown: true,
      actionHint: "branch_and_break_loop"
    })
  };
}

/* -------------------------------------------------------------------------- */
/* Main Entrypoint                                                             */
/* -------------------------------------------------------------------------- */

function applyGovernor(input) {
  var inp = input && typeof input === "object" ? input : {};
  var evidencePack = inp.evidencePack || {};
  var memory =
    evidencePack && evidencePack.packs && evidencePack.packs.memory
      ? evidencePack.packs.memory
      : (inp.memoryCtx || {});

  var primary = evidencePack.primary || inp.primary || null;
  var text = extractPrimaryText(primary || {});

  if (!text) {
    return {
      action: "pass",
      text: "",
      memory: ensureMemory(memory),
      governor: buildGovernorMeta({ repeat: false, empty: true, actionHint: "noop" })
    };
  }

  return decision(inp, memory, text);
}

module.exports = {
  applyGovernor: applyGovernor,
  isRepeat: isRepeat,
  getRepeatScore: getRepeatScore,
  escalateLoop: escalateLoop,
  fuseBridge: fuseBridge,
  recoverBridge: recoverBridge,
  buildClarifier: inferClarifier,
  isNearDuplicate: isNearDuplicate,
  updateLoopState: updateLoopState
};

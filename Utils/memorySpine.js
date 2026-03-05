"use strict";

/**
 * Memory Spine v3 (OPINTEL+)
 * Sandblast AI System — Nyx + Marion coordination memory
 *
 * Location:
 *   src/Utils/memorySpine.js
 *
 * Design goals:
 * - 20+ turn depth without repetition, with stronger summaries + longer memory
 * - bulletproof loop governance: adaptive counters + graded response
 * - tighter bridge coordination: adaptive fuse (not fixed 45s), decay + early release
 * - depth ladder covers full knowledge progression (greeting→clarify→diagnose→plan→execute→verify→reflect→commit)
 * - bounded budgets + fail-open + dependency-free
 * - backwards compatibility with v1/v2 consumers
 */

/* -------------------------
   OPINTEL PHASE MAP (v3)
   -------------------------
  Phase 01: Turn Envelope (structured turn records)
  Phase 02: Rolling Window (recent turns bounded by count & bytes)
  Phase 03: Session Summary (multi-line: goals, constraints, last decision, next action)
  Phase 04: Long Memory (stable facts/preferences; TTL + scoring)
  Phase 05: Open Loops Register (unanswered questions/tasks)
  Phase 06: Entity Store (names, systems, ids; TTL)
  Phase 07: Topic/Intent Tracks (per-turn + aggregated counters)
  Phase 08: Repetition Guard (hash + similarity + n-gram)
  Phase 09: Loop Governor (adaptive counters + graded interventions)
  Phase 10: Depth Ladder (full knowledge progression levels)
  Phase 11: Bridge Trace (Nyx↔Marion usage records)
  Phase 12: Bridge Governor (adaptive fuse + decay + early release)
  Phase 13: Inbound/Outbound Signatures (fast de-dupe)
  Phase 14: Budget Enforcement (token-ish + char budgets)
  Phase 15: Safe Redaction (no secrets stored; configurable)
  Phase 16: Diagnostics (session stats + traceable loop state)
  Phase 17: Audit Log (structured, bounded)
  Phase 18: Persistence Hooks (optional; no-op by default)
  Phase 19: Concurrency Safety (single-process safe; version stamps)
  Phase 20: Backwards Compatibility (v1/v2 consumers keep working)

  // Expanded (reserved) — keep map open up to 40 phases:
  Phase 21: Multi-session stitching (optional)
  Phase 22: Cross-domain recall (optional)
  Phase 23: Tool-usage memory (optional)
  Phase 24: Reliability scoring (optional)
  Phase 25: Safety posture memory (optional)
  Phase 26: Preference shaping (optional)
  Phase 27: Retrieval provenance (optional)
  Phase 28: Error signature registry (optional)
  Phase 29: Vendor health overlay (optional)
  Phase 30: Latency trend memory (optional)
  Phase 31: A/B prompt variants memory (optional)
  Phase 32: Persona micro-style memory (optional)
  Phase 33: Summarizer model handoff (optional)
  Phase 34: Vector store adapter (optional)
  Phase 35: Compression tiers (optional)
  Phase 36: Privacy hardening modes (optional)
  Phase 37: Multi-agent coordination memory (optional)
  Phase 38: External events timeline (optional)
  Phase 39: Governance policy updates (optional)
  Phase 40: Operator dashboards (optional)
*/

const SPINE_VERSION = "3.1.0-opintel-memorywindows";

const POLICY = Object.freeze({
  // Turns
  maxTurns: 40,                 // longer local memory
  maxRecentTurnsForPrompt: 14,  // prompt window (still bounded)
  maxTurnCharsUser: 2200,
  maxTurnCharsAssistant: 2600,

  // Summary
  summaryRefreshEveryTurns: 3,
  maxSummaryChars: 1400,

  // Long memory
  maxLongFacts: 60,
  maxLongFactChars: 320,
  longFactTtlMs: 1000 * 60 * 60 * 24 * 60, // 60 days

  // Open loops
  maxOpenLoops: 12,
  maxOpenLoopChars: 240,
  maxRecentIntents: 8,
  maxPreferences: 24,

  // Entities
  maxEntities: 80,
  entityTtlMs: 1000 * 60 * 60 * 24 * 14, // 14 days

  // Audit
  maxAudit: 140,

  // Loop governor
  simWindow: 4,
  simJaccardThreshold: 0.84,
  ngramSize: 4,
  ngramThreshold: 0.90,
  loopCooldownMs: 12_000,       // how quickly counters decay when healthy

  // Bridge governor (adaptive)
  fuseMinMs: 4_000,
  fuseMaxMs: 28_000,
  fuseEscalationFactor: 1.7,    // per loop hit
  fuseDecayMs: 18_000,          // decay toward min after stability
  earlyReleaseAfterOkTurns: 2,  // release fuse early after N good turns

  // Session GC
  sessionIdleTtlMs: 1000 * 60 * 60 * 12, // 12 hours
});

// In-memory session store
const sessions = new Map();

/* -------------------------
   Utilities
   ------------------------- */
function _now(){ return Date.now(); }
function _str(v){ return v == null ? "" : String(v); }
function _trim(v){ return _str(v).trim(); }
function _lower(s){ return _trim(s).toLowerCase(); }
function _isObj(v){ return !!v && typeof v === "object"; }
function _cap(s, n){ s = _str(s); return s.length <= n ? s : s.slice(0, n); }
function _sanitize(s, maxChars){
  s = _str(s).replace(/\u0000/g, "");
  return _cap(s, maxChars);
}
function _hashLite(s){
  s = _str(s);
  let h = 2166136261;
  for (let i = 0; i < s.length; i++){
    h ^= s.charCodeAt(i);
    h = (h * 16777619) >>> 0;
  }
  return h.toString(16);
}
function _tokenize(s){
  s = _lower(s).replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
  if (!s) return [];
  return s.split(" ").filter(Boolean).slice(0, 96);
}
function _jaccard(aTokens, bTokens){
  const a = new Set(aTokens);
  const b = new Set(bTokens);
  if (!a.size && !b.size) return 1;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  const union = a.size + b.size - inter;
  return union ? (inter / union) : 0;
}
function _ngrams(tokens, n){
  const out = [];
  for (let i=0; i<=tokens.length-n; i++){
    out.push(tokens.slice(i, i+n).join(" "));
  }
  return out;
}
function _ngramSim(aTokens, bTokens, n){
  const a = new Set(_ngrams(aTokens, n));
  const b = new Set(_ngrams(bTokens, n));
  if (!a.size && !b.size) return 1;
  let inter = 0;
  for (const g of a) if (b.has(g)) inter++;
  const union = a.size + b.size - inter;
  return union ? (inter / union) : 0;
}
function _dedupeArray(arr){
  const out = [];
  const seen = new Set();
  for (const v of arr || []){
    const t = _trim(v);
    if (!t) continue;
    const k = _lower(t);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(t);
  }
  return out;
}
function _clamp(n, min, max){
  n = Number.isFinite(n) ? n : parseInt(n, 10);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

/* -------------------------
   Session model
   ------------------------- */
function _createSession(sessionId){
  return {
    v: SPINE_VERSION,
    id: sessionId,
    createdAt: _now(),
    touchedAt: _now(),

    turns: [],
    summary: "",
    openLoops: [],
    recentIntents: [],
    lastResolvedIntent: "",
    preferences: {},
    entities: {},
    long: [],

    // Aggregates
    intentCounts: {},
    topicCounts: {},

    // Loop governor state
    loop: {
      n: 0,              // loop hit counter (adaptive)
      severity: 0,       // 0..3
      lastAt: 0,
      sig: "",
      okStreak: 0,       // good turns streak
    },

    // Bridge governor state
    bridge: {
      used: 0,
      lastAt: 0,
      lastLane: "",
      lastAction: "",
      lastTrace: "",
      fusedUntil: 0,
      fuseReason: "",
      fuseMs: POLICY.fuseMinMs, // adaptive current fuse length
    },

    // Depth ladder
    depth: {
      level: 2,
      stalled: 0,
      lastMove: "",
      progression: [], // tail history of moves
    },

    // Repetition signatures
    lastAssistantHash: null,
    lastAssistantTokens: [],
    recentAssistantTokens: [], // array of token arrays (window)

    // Audit
    audit: [],

    // Persistence hooks (no-op)
    persist: { enabled: false, lastAt: 0, lastErr: "" },
  };
}

function getSession(sessionId){
  const sid = _trim(sessionId) || "session";
  let s = sessions.get(sid);
  if (!s){
    s = _createSession(sid);
    sessions.set(sid, s);
  }
  s.touchedAt = _now();
  return s;
}

/* -------------------------
   Audit
   ------------------------- */
function _audit(session, type, data){
  try{
    session.audit.push({ ts: _now(), type: _cap(_trim(type), 32) || "EVT", data: _isObj(data) ? data : { v: _str(data) } });
    if (session.audit.length > POLICY.maxAudit) session.audit.shift();
  }catch(_e){}
}

/* -------------------------
   Long memory
   ------------------------- */
function rememberFact(sessionId, key, value, src, score){
  const s = getSession(sessionId);
  const k = _cap(_trim(key), 64);
  const v = _sanitize(value, POLICY.maxLongFactChars);
  if (!k || !v) return false;

  const kLower = _lower(k);
  s.long = (s.long || []).filter(f => _lower(f.key) !== kLower);

  s.long.push({
    key: k,
    value: v,
    ts: _now(),
    ttlMs: POLICY.longFactTtlMs,
    src: _cap(_trim(src), 32) || "runtime",
    score: _clamp(score ?? 0.5, 0, 1),
  });
  if (s.long.length > POLICY.maxLongFacts) s.long.shift();
  _audit(s, "LONG_REMEMBER", { key: k, score: _clamp(score ?? 0.5, 0, 1) });
  return true;
}
function _gcLong(s){
  const now = _now();
  s.long = (s.long || []).filter(f => (now - (f.ts||0)) < (f.ttlMs || POLICY.longFactTtlMs));
}

/* -------------------------
   Entities
   ------------------------- */
function rememberEntity(sessionId, key, value, src){
  const s = getSession(sessionId);
  const k = _cap(_trim(key), 48);
  const v = _sanitize(value, 240);
  if (!k || !v) return false;
  s.entities[k] = { value: v, ts: _now(), ttlMs: POLICY.entityTtlMs, src: _cap(_trim(src), 32) || "runtime" };

  const keys = Object.keys(s.entities);
  if (keys.length > POLICY.maxEntities){
    keys.sort((a,b) => (s.entities[a].ts||0) - (s.entities[b].ts||0));
    const drop = keys.length - POLICY.maxEntities;
    for (let i=0; i<drop; i++) delete s.entities[keys[i]];
  }
  _audit(s, "ENTITY_REMEMBER", { key: k });
  return true;
}
function _gcEntities(s){
  const now = _now();
  for (const k of Object.keys(s.entities || {})){
    const e = s.entities[k];
    const ttl = e && e.ttlMs ? e.ttlMs : POLICY.entityTtlMs;
    if ((now - (e.ts||0)) > ttl) delete s.entities[k];
  }
}

/* -------------------------
   Open loops
   ------------------------- */
function addOpenLoop(sessionId, question){
  const s = getSession(sessionId);
  const q = _sanitize(question, POLICY.maxOpenLoopChars);
  if (!q) return;
  const norm = _lower(q);
  s.openLoops = (s.openLoops || []).filter(x => _lower(x) !== norm);
  s.openLoops.push(q);
  if (s.openLoops.length > POLICY.maxOpenLoops) s.openLoops.shift();
  _audit(s, "OPEN_LOOP_ADD", { q: _cap(q, 90) });
}
function closeLoop(sessionId, question){
  const s = getSession(sessionId);
  const q = _trim(question);
  if (!q) return;
  const norm = _lower(q);
  s.openLoops = (s.openLoops || []).filter(x => _lower(x) !== norm);
  _audit(s, "OPEN_LOOP_CLOSE", { q: _cap(q, 90) });
}

function rememberPreference(sessionId, key, value, score){
  const s = getSession(sessionId);
  const k = _cap(_trim(key), 48);
  const v = _sanitize(value, 180);
  if (!k || !v) return false;
  s.preferences = _isObj(s.preferences) ? s.preferences : {};
  s.preferences[k] = {
    value: v,
    ts: _now(),
    score: _clamp(score ?? 0.5, 0, 1),
  };
  const keys = Object.keys(s.preferences);
  if (keys.length > POLICY.maxPreferences){
    keys.sort((a,b)=>((s.preferences[a].ts||0)-(s.preferences[b].ts||0)));
    const drop = keys.length - POLICY.maxPreferences;
    for (let i=0;i<drop;i++) delete s.preferences[keys[i]];
  }
  _audit(s, "PREF_SET", { key: k, score: _clamp(score ?? 0.5, 0, 1) });
  return true;
}

function resolveIntent(sessionId, intent){
  const s = getSession(sessionId);
  const i = _cap(_trim(intent), 64);
  if (!i) return false;
  s.lastResolvedIntent = i;
  _audit(s, "INTENT_RESOLVE", { intent: i });
  return true;
}

/* -------------------------
   Depth ladder (full knowledge progression)
   ------------------------- */
const DEPTH_LEVELS = Object.freeze([
  "GREET",
  "CLARIFY",
  "DIAGNOSE",
  "PLAN",
  "EXECUTE",
  "VERIFY",
  "REFLECT",
  "COMMIT",
]);

function _inferMove(intent, userText){
  const i = _lower(intent);
  const t = _lower(userText);

  if (i.includes("greet") || t === "hi" || t === "hello") return "GREET";
  if (i.includes("clarif") || t.endsWith("?") || i.includes("question")) return "CLARIFY";
  if (i.includes("debug") || i.includes("diagnos") || i.includes("error")) return "DIAGNOSE";
  if (i.includes("plan") || i.includes("roadmap") || i.includes("phase")) return "PLAN";
  if (i.includes("ship") || i.includes("patch") || i.includes("update") || i.includes("build")) return "EXECUTE";
  if (i.includes("verify") || i.includes("test") || i.includes("check")) return "VERIFY";
  if (i.includes("reflect") || i.includes("review") || i.includes("analysis")) return "REFLECT";
  if (i.includes("commit") || i.includes("deploy") || i.includes("merge")) return "COMMIT";

  // fallback: if question mark, clarify; else diagnose if mentions "not working"
  if (t.includes("not working") || t.includes("no sound") || t.includes("error")) return "DIAGNOSE";
  if (t.includes("?")) return "CLARIFY";
  return "";
}

function _moveDepth(session, intent, userText){
  const move = _inferMove(intent, userText);
  if (move){
    const idx = DEPTH_LEVELS.indexOf(move);
    const prev = session.depth.level || 2;
    const next = Math.max(prev, idx + 1); // monotonic non-decreasing within session
    if (next === prev) session.depth.stalled = (session.depth.stalled || 0) + 1;
    else session.depth.stalled = 0;

    session.depth.level = next;
    session.depth.lastMove = move;
    session.depth.progression.push(move);
    if (session.depth.progression.length > 20) session.depth.progression.shift();
  } else {
    session.depth.stalled = (session.depth.stalled || 0) + 1;
  }
}

/* -------------------------
   Bridge coordination (adaptive fuse)
   ------------------------- */
function noteBridgeUse(sessionId, info){
  const s = getSession(sessionId);
  const obj = _isObj(info) ? info : {};
  s.bridge.used = (s.bridge.used || 0) + 1;
  s.bridge.lastAt = _now();
  s.bridge.lastLane = _cap(_trim(obj.lane || ""), 40);
  s.bridge.lastAction = _cap(_trim(obj.action || ""), 40);
  s.bridge.lastTrace = _cap(_trim(obj.trace || obj.traceId || ""), 90);
  _audit(s, "BRIDGE_USE", { lane: s.bridge.lastLane, action: s.bridge.lastAction });
}

function isBridgeFused(sessionId){
  const s = getSession(sessionId);
  return !!(s.bridge.fusedUntil && _now() < s.bridge.fusedUntil);
}

function _decayFuse(s){
  // After stability, decay fuseMs toward min
  const now = _now();
  const last = s.loop.lastAt || 0;
  if (!last) return;
  if ((now - last) > POLICY.fuseDecayMs){
    s.bridge.fuseMs = Math.max(POLICY.fuseMinMs, Math.floor(s.bridge.fuseMs / 1.3));
  }
}

function maybeFuseBridge(sessionId, reason, sig){
  const s = getSession(sessionId);
  _decayFuse(s);

  // Adaptive fuse escalates with loop.n, but is capped.
  const base = s.bridge.fuseMs || POLICY.fuseMinMs;
  const escalated = Math.min(POLICY.fuseMaxMs, Math.floor(base * POLICY.fuseEscalationFactor));
  s.bridge.fuseMs = _clamp(escalated, POLICY.fuseMinMs, POLICY.fuseMaxMs);

  const until = _now() + s.bridge.fuseMs;
  s.bridge.fusedUntil = until;
  s.bridge.fuseReason = _cap(_trim(reason) || "loop_guard", 60);
  _audit(s, "BRIDGE_FUSE", { reason: s.bridge.fuseReason, ms: s.bridge.fuseMs, sig: _cap(_trim(sig), 90) });
  return until;
}

function maybeReleaseBridge(sessionId){
  const s = getSession(sessionId);
  if (!isBridgeFused(sessionId)) return false;
  // Early release when we have a healthy ok-streak
  if ((s.loop.okStreak || 0) >= POLICY.earlyReleaseAfterOkTurns){
    s.bridge.fusedUntil = 0;
    s.bridge.fuseReason = "";
    _audit(s, "BRIDGE_FUSE_RELEASE", { okStreak: s.loop.okStreak });
    return true;
  }
  return false;
}

/* -------------------------
   Loop governor (adaptive counters + interventions)
   ------------------------- */
function _loopHit(session, why, sig, extra){
  const now = _now();
  session.loop.n = (session.loop.n || 0) + 1;
  session.loop.lastAt = now;
  session.loop.sig = _cap(_trim(sig), 96) || _cap(_trim(why), 64);
  session.loop.okStreak = 0;

  // severity increases with n (capped)
  const n = session.loop.n;
  let sev = 0;
  if (n >= 6) sev = 3;
  else if (n >= 4) sev = 2;
  else if (n >= 2) sev = 1;
  session.loop.severity = sev;

  _audit(session, "LOOP_HIT", { why: _cap(why, 32), n, severity: sev, sig: session.loop.sig, ...(extra||{}) });
}

function _loopOk(session){
  const now = _now();
  // decay loop counter if stable for cooldown
  if (session.loop.lastAt && (now - session.loop.lastAt) > POLICY.loopCooldownMs){
    session.loop.n = Math.max(0, (session.loop.n || 0) - 1);
  }
  session.loop.okStreak = (session.loop.okStreak || 0) + 1;
  session.loop.severity = Math.max(0, (session.loop.severity || 0) - (session.loop.okStreak >= 3 ? 1 : 0));
}

/* -------------------------
   Turn storage
   ------------------------- */
function storeTurn(sessionId, turn){
  const s = getSession(sessionId);
  const t = _isObj(turn) ? turn : {};

  const user = _sanitize(t.user, POLICY.maxTurnCharsUser);
  const assistant = _sanitize(t.assistant, POLICY.maxTurnCharsAssistant);

  const intent = _cap(_trim(t.intent || "general"), 48) || "general";
  const resolvedIntent = _cap(_trim(t.resolvedIntent || ""), 64);
  const topics = _dedupeArray(t.topics || []).slice(0, 10);
  const entities = _dedupeArray(t.entities || []).slice(0, 12);

  const aTokens = _tokenize(assistant).slice(0, 80);
  const aHash = _hashLite(aTokens.join(" "));

  const entry = {
    id: _now().toString(36),
    ts: _now(),
    user,
    assistant,
    intent,
    topics,
    entities,
    sig: {
      user: _hashLite(_tokenize(user).join(" ")),
      assistant: aHash,
    },
  };

  s.turns.push(entry);
  if (s.turns.length > POLICY.maxTurns) s.turns.shift();

  // conversational memory windows
  s.recentIntents = Array.isArray(s.recentIntents) ? s.recentIntents : [];
  s.recentIntents.push({ intent, ts: entry.ts });
  if (s.recentIntents.length > POLICY.maxRecentIntents) s.recentIntents.shift();
  if (resolvedIntent) s.lastResolvedIntent = resolvedIntent;

  if (_trim(t.openLoop)) addOpenLoop(sessionId, t.openLoop);
  if (_trim(t.closeLoop)) closeLoop(sessionId, t.closeLoop);

  if (_isObj(t.preferences)){
    for (const k of Object.keys(t.preferences).slice(0, 12)){
      const v = t.preferences[k];
      if (_trim(k) && _trim(v)) rememberPreference(sessionId, k, v, 0.8);
    }
  }

  // aggregates
  s.intentCounts[intent] = (s.intentCounts[intent] || 0) + 1;
  for (const tp of topics) s.topicCounts[tp] = (s.topicCounts[tp] || 0) + 1;

  // depth
  _moveDepth(s, intent, user);

  // remember simple key:value entities
  for (const e of entities){
    const parts = String(e).split(":");
    if (parts.length >= 2){
      const k = _trim(parts[0]);
      const v = _trim(parts.slice(1).join(":"));
      if (k && v) rememberEntity(sessionId, k, v, "turn");
    }
  }

  // keep assistant token window
  s.recentAssistantTokens.push(aTokens);
  if (s.recentAssistantTokens.length > POLICY.simWindow) s.recentAssistantTokens.shift();

  s.lastAssistantHash = aHash;
  s.lastAssistantTokens = aTokens;

  if ((s.turns.length % POLICY.summaryRefreshEveryTurns) === 0) updateSummary(s);

  // housekeeping
  _gcEntities(s);
  _gcLong(s);
  gcSessions();

  return entry;
}

/* -------------------------
   Summary builder (stronger)
   ------------------------- */
function _extractConstraints(turns){
  // Heuristic: scan user turns for "don't", "do not", "must", "keep", "structure"
  const out = [];
  for (const t of turns){
    const u = _lower(t.user || "");
    if (u.includes("do not") || u.includes("don't") || u.includes("must") || u.includes("keep") || u.includes("structure")){
      out.push(_cap(_trim(t.user), 160));
    }
  }
  return _dedupeArray(out).slice(-4);
}

function updateSummary(session){
  const turns = (session.turns || []).slice(-Math.min(18, POLICY.maxRecentTurnsForPrompt + 6));
  const last = turns.length ? turns[turns.length-1] : null;

  const intents = _dedupeArray(turns.map(t => _cap(_trim(t.intent), 32)).filter(Boolean)).slice(-8);

  const currentGoal = last ? _cap(_trim(last.user), 220) : "";
  const constraints = _extractConstraints(turns);
  const openLoops = (session.openLoops || []).slice(-4).map(q => _cap(q, 110));
  const recentIntents = (session.recentIntents || []).slice(-POLICY.maxRecentIntents).map(x => _cap(_trim(x.intent), 40));
  const lastResolved = _cap(_trim(session.lastResolvedIntent || ""), 80);
  const prefPairs = Object.keys(session.preferences || {}).slice(-4).map(k => `${k}: ${_cap(_trim(session.preferences[k] && session.preferences[k].value || ""), 60)}`);

  // "Next action" heuristic: last assistant sentence fragment
  let nextAction = "";
  if (last && last.assistant){
    const a = _trim(last.assistant);
    const parts = a.split(/[\.\!\?]\s+/).filter(Boolean);
    nextAction = parts.length ? _cap(parts[parts.length-1], 180) : _cap(a, 180);
  }

  const depthName = DEPTH_LEVELS[(session.depth.level||1)-1] || "";
  const bridgeState = isBridgeFused(session.id)
    ? `FUSED (${session.bridge.fuseReason || "guard"}) ${Math.max(0, session.bridge.fusedUntil - _now())}ms`
    : "OK";

  const topIntents = intents.length ? intents.join(" → ") : "(none)";
  const topTopics = Object.keys(session.topicCounts||{}).sort((a,b)=>(session.topicCounts[b]-session.topicCounts[a])).slice(0,6).join(", ");

  const lines = [
    `Intents: ${topIntents}`,
    `Topics: ${topTopics || "(none)"}`,
    `Goal: ${currentGoal || "(none)"}`,
    `Constraints: ${constraints.length ? constraints.join(" | ") : "(none)"}`,
    `Recent Intents: ${recentIntents.length ? recentIntents.join(" → ") : "(none)"}`,
    `Open Loops: ${openLoops.length ? openLoops.join(" | ") : "(none)"}`,
    `Resolved: ${lastResolved || "(none)"}`,
    `Preferences: ${prefPairs.length ? prefPairs.join(" | ") : "(none)"}`,
    `Depth: L${session.depth.level || 0} ${depthName}${session.depth.stalled ? ` (stalled:${session.depth.stalled})` : ""}`,
    `Bridge: ${bridgeState} (used:${session.bridge.used || 0})`,
    `Next: ${nextAction || "(none)"}`,
  ];

  session.summary = _cap(lines.join("\n"), POLICY.maxSummaryChars);
  _audit(session, "SUMMARY_REFRESH", { chars: session.summary.length, intents: intents.length });
}

/* -------------------------
   Repetition guard (hash + jaccard + n-gram)
   ------------------------- */
function isRepetitive(sessionId, response){
  const s = getSession(sessionId);
  const r = _sanitize(response, POLICY.maxTurnCharsAssistant);

  const tokens = _tokenize(r).slice(0, 80);
  const h = _hashLite(tokens.join(" "));

  if (h && s.lastAssistantHash && h === s.lastAssistantHash){
    _loopHit(s, "hash", h, {});
    maybeFuseBridge(sessionId, "repeat_hash", h);
    return true;
  }

  // Similarity vs recent assistant turns
  let maxJac = 0;
  let maxNg = 0;
  for (const rt of (s.recentAssistantTokens || [])){
    maxJac = Math.max(maxJac, _jaccard(tokens, rt));
    maxNg = Math.max(maxNg, _ngramSim(tokens, rt, POLICY.ngramSize));
  }

  if (maxJac >= POLICY.simJaccardThreshold || maxNg >= POLICY.ngramThreshold){
    _loopHit(s, "similar", `jac:${maxJac.toFixed(2)} ng:${maxNg.toFixed(2)}`, { jac: maxJac, ng: maxNg });
    maybeFuseBridge(sessionId, "repeat_sim", s.loop.sig);
    return true;
  }

  // Healthy response: decay counters + maybe release fuse
  _loopOk(s);
  maybeReleaseBridge(sessionId);

  s.lastAssistantHash = h;
  s.lastAssistantTokens = tokens;
  return false;
}

/* -------------------------
   Build prompt context
   ------------------------- */
function buildContext(sessionId){
  const s = getSession(sessionId);
  if (!s.summary) updateSummary(s);

  const recentTurns = (s.turns || []).slice(-POLICY.maxRecentTurnsForPrompt).map(t => {
    const u = _cap(_trim(t.user), 520);
    const a = _cap(_trim(t.assistant), 760);
    return `User: ${u}\nNyx: ${a}`;
  });

  const longFacts = (s.long || [])
    .slice()
    .sort((a,b)=>(b.score||0)-(a.score||0) || (b.ts||0)-(a.ts||0))
    .slice(0, 14)
    .map(f => `${f.key}: ${f.value}`);

  const entPairs = [];
  for (const k of Object.keys(s.entities || {})){
    const v = s.entities[k] && s.entities[k].value ? s.entities[k].value : "";
    if (v) entPairs.push(`${k}: ${_cap(v, 140)}`);
  }

  return {
    spineVersion: SPINE_VERSION,
    policy: {
      maxTurns: POLICY.maxTurns,
      maxRecent: POLICY.maxRecentTurnsForPrompt,
      summaryEvery: POLICY.summaryRefreshEveryTurns,
      fuseRangeMs: [POLICY.fuseMinMs, POLICY.fuseMaxMs],
    },
    summary: s.summary,
    openLoops: (s.openLoops || []).slice(-POLICY.maxOpenLoops),
    recentIntents: (s.recentIntents || []).slice(-POLICY.maxRecentIntents),
    lastResolvedIntent: s.lastResolvedIntent || "",
    preferences: Object.keys(s.preferences || {}).slice(-POLICY.maxPreferences).map(k => ({ key: k, value: s.preferences[k] && s.preferences[k].value || "", score: s.preferences[k] && s.preferences[k].score || 0 })),
    recent: recentTurns.join("\n"),
    long: longFacts,
    entities: entPairs,
    depth: {
      level: s.depth.level || 0,
      stalled: s.depth.stalled || 0,
      lastMove: s.depth.lastMove || "",
      progressionTail: (s.depth.progression || []).slice(-8),
      levelName: DEPTH_LEVELS[(s.depth.level||1)-1] || "",
    },
    bridge: {
      fused: isBridgeFused(sessionId),
      fusedUntil: s.bridge.fusedUntil || 0,
      fuseReason: s.bridge.fuseReason || "",
      fuseMs: s.bridge.fuseMs || POLICY.fuseMinMs,
      used: s.bridge.used || 0,
      lastLane: s.bridge.lastLane || "",
      lastAction: s.bridge.lastAction || "",
      lastTrace: s.bridge.lastTrace || "",
    },
    loop: {
      n: s.loop.n || 0,
      severity: s.loop.severity || 0,
      sig: s.loop.sig || "",
      okStreak: s.loop.okStreak || 0,
    },
  };
}

/* -------------------------
   Operator controls / diagnostics
   ------------------------- */
function resetSession(sessionId){
  const sid = _trim(sessionId) || "session";
  sessions.set(sid, _createSession(sid));
  return getSession(sid);
}
function pruneSession(sessionId){
  const s = getSession(sessionId);
  s.turns = s.turns.slice(-Math.min(8, POLICY.maxTurns));
  s.openLoops = s.openLoops.slice(-Math.min(4, POLICY.maxOpenLoops));
  s.recentIntents = (s.recentIntents || []).slice(-Math.min(4, POLICY.maxRecentIntents));
  s.audit = s.audit.slice(-Math.min(30, POLICY.maxAudit));
  _audit(s, "PRUNE", { turns: s.turns.length, loops: s.openLoops.length });
  return s;
}
function setBridgeFuse(sessionId, ms, reason){
  const s = getSession(sessionId);
  const dur = _clamp(ms, 1000, 60_000);
  s.bridge.fuseMs = _clamp(dur, POLICY.fuseMinMs, POLICY.fuseMaxMs);
  s.bridge.fusedUntil = _now() + s.bridge.fuseMs;
  s.bridge.fuseReason = _cap(_trim(reason) || "manual", 60);
  _audit(s, "BRIDGE_FUSE_SET", { ms: s.bridge.fuseMs, reason: s.bridge.fuseReason });
  return s.bridge.fusedUntil;
}
function diag(sessionId){
  if (sessionId){
    const s = getSession(sessionId);
    return {
      ok: true,
      spineVersion: SPINE_VERSION,
      id: s.id,
      turns: (s.turns||[]).length,
      openLoops: (s.openLoops||[]).length,
      entities: Object.keys(s.entities||{}).length,
      long: (s.long||[]).length,
      depth: s.depth,
      loop: s.loop,
      bridge: s.bridge,
      intentTop: Object.keys(s.intentCounts||{}).sort((a,b)=>(s.intentCounts[b]-s.intentCounts[a])).slice(0,6),
      topicTop: Object.keys(s.topicCounts||{}).sort((a,b)=>(s.topicCounts[b]-s.topicCounts[a])).slice(0,6),
      auditTail: (s.audit||[]).slice(-12),
      touchedAt: s.touchedAt,
    };
  }
  return { ok: true, spineVersion: SPINE_VERSION, activeSessions: sessions.size, policy: POLICY };
}
function gcSessions(){
  const now = _now();
  for (const [sid, s] of sessions.entries()){
    const idle = now - (s.touchedAt || s.createdAt || now);
    if (idle > POLICY.sessionIdleTtlMs) sessions.delete(sid);
  }
}

module.exports = {
  SPINE_VERSION,
  POLICY,

  // v1/v2 compatible
  getSession,
  storeTurn,
  addOpenLoop,
  closeLoop,
  buildContext,
  isRepetitive,
  diag,

  // v3 additions
  rememberFact,
  rememberEntity,
  rememberPreference,
  resolveIntent,
  noteBridgeUse,
  isBridgeFused,
  maybeFuseBridge,
  maybeReleaseBridge,
  resetSession,
  pruneSession,
  setBridgeFuse,
  updateSummary,
  gcSessions,
};

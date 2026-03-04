"use strict";

/**
 * Memory Spine v2 (OPINTEL)
 * Sandblast AI System — Nyx + Marion coordination memory
 *
 * Location:
 *   src/Utils/memorySpine.js
 *
 * Design goals:
 * - 15–20+ turn depth without repetition
 * - deterministic loop resistance (no "echo spirals")
 * - bridge coordination fuse + audit trail
 * - bounded memory budgets (never bloats prompt)
 * - fail-open + dependency-free
 *
 * Notes:
 * - v2 keeps the v1 API: getSession, storeTurn, addOpenLoop, closeLoop, buildContext, isRepetitive, diag
 * - v2 adds: policy, depth ladder, summary refresh, entity memory, bridge fuse state, similarity guard,
 *           structured audit events, and optional persistence hooks.
 */

/* -------------------------
   OPINTEL PHASE MAP (v2)
   -------------------------
  Phase 01: Turn Envelope (structured turn records)
  Phase 02: Rolling Window (recent turns bounded by count & bytes)
  Phase 03: Session Summary (compressed narrative, refreshed cadence)
  Phase 04: Long Memory (stable facts/preferences; conservative)
  Phase 05: Open Loops Register (unanswered questions/tasks)
  Phase 06: Entity Store (names, systems, ids; with TTL)
  Phase 07: Topic/Intent Tracks (per-turn + aggregated)
  Phase 08: Repetition Guard (hash + similarity)
  Phase 09: Depth Ladder (forces progression; prevents "stall" loops)
  Phase 10: Bridge Trace (Nyx↔Marion usage records)
  Phase 11: Bridge Fuse (auto pause after loop signals)
  Phase 12: Inbound/Outbound Signatures (fast de-dupe)
  Phase 13: Budget Enforcement (token-ish + char budgets)
  Phase 14: Safe Redaction (no secrets stored; no raw PII by default)
  Phase 15: Diagnostics (session stats + recent audit)
  Phase 16: Audit Log (structured, bounded)
  Phase 17: Persistence Hooks (optional; no-op by default)
  Phase 18: Concurrency Safety (single-process safe; version stamps)
  Phase 19: Backwards Compatibility (v1 consumers keep working)
  Phase 20: Operator Controls (reset, prune, fuse, export)
*/

const SPINE_VERSION = "2.0.0-opintel";

// -------- Policy (edit here; stable defaults) --------
const POLICY = Object.freeze({
  // Turn memory
  maxTurns: 24,                 // slightly > 20 to preserve momentum
  maxRecentTurnsForPrompt: 12,  // prompt budget window
  maxTurnChars: 2400,           // per turn cap (user+assistant each capped)
  // Summary
  summaryRefreshEveryTurns: 4,
  maxSummaryChars: 900,
  // Open loops
  maxOpenLoops: 8,
  maxOpenLoopChars: 220,
  // Entity store
  maxEntities: 40,
  entityTtlMs: 1000 * 60 * 60 * 24 * 7, // 7 days
  // Long memory (stable, conservative)
  maxLongFacts: 24,
  maxLongFactChars: 240,
  longFactTtlMs: 1000 * 60 * 60 * 24 * 30, // 30 days
  // Audit
  maxAudit: 80,
  // Bridge fuse
  fuseMs: 45_000,
  // Similarity
  simWindow: 3,
  simJaccardThreshold: 0.86, // high threshold to avoid false positives
  // Session GC
  sessionIdleTtlMs: 1000 * 60 * 60 * 6, // 6 hours
});

const sessions = new Map();

/* -------------------------
   Utilities (dependency-free)
   ------------------------- */
function _now(){ return Date.now(); }
function _str(v){ return v == null ? "" : String(v); }
function _trim(v){ return _str(v).trim(); }
function _lower(s){ return _trim(s).toLowerCase(); }
function _isObj(v){ return !!v && typeof v === "object"; }
function _clampInt(n, min, max){
  n = Number.isFinite(n) ? n : parseInt(n, 10);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}
function _cap(s, n){
  s = _str(s);
  if (s.length <= n) return s;
  return s.slice(0, n);
}
function _sanitizeText(s, maxChars){
  // Keep it simple: strip nulls; cap length; do NOT try to remove "all PII" (too risky).
  // Upstream (chatEngine) should already avoid secrets; this is a last-resort budget cap.
  s = _str(s).replace(/\u0000/g, "");
  return _cap(s, maxChars);
}
function _hashLite(s){
  // Stable, cheap rolling hash (not cryptographic).
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
  return s.split(" ").filter(Boolean).slice(0, 80);
}
function _jaccard(aTokens, bTokens){
  const a = new Set(aTokens);
  const b = new Set(bTokens);
  if (!a.size && !b.size) return 1;
  let inter = 0;
  for (const t of a){
    if (b.has(t)) inter++;
  }
  const union = a.size + b.size - inter;
  return union ? (inter / union) : 0;
}
function _dedupeArray(arr){
  const out = [];
  const seen = new Set();
  for (const v of arr || []){
    const k = _trim(v);
    if (!k) continue;
    const key = _lower(k);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(k);
  }
  return out;
}

/* -------------------------
   Session model
   ------------------------- */
function _createSession(sessionId) {
  return {
    v: SPINE_VERSION,
    id: sessionId,
    createdAt: _now(),
    touchedAt: _now(),

    // Memory layers
    turns: [],         // Phase 01/02
    summary: "",       // Phase 03
    long: [],          // Phase 04 (facts/preferences)
    openLoops: [],     // Phase 05
    entities: {},      // Phase 06 { key: {value,ts,ttlMs,src} }

    // Loop resistance
    lastAssistantHash: null,      // Phase 08
    lastAssistantTokens: [],      // Phase 08
    recentAssistantSigs: [],      // Phase 12
    loop: { n: 0, at: 0, sig: "" },

    // Depth ladder
    depth: { level: 2, stalled: 0, lastMove: "" }, // Phase 09

    // Bridge coordination
    bridge: {
      used: 0,
      lastAt: 0,
      lastLane: "",
      lastAction: "",
      lastTrace: "",
      fusedUntil: 0,
      fuseReason: "",
    }, // Phase 10/11

    // Audit (bounded)
    audit: [], // Phase 16

    // Optional persistence hooks (no-op)
    persist: { enabled: false, lastAt: 0, lastErr: "" }, // Phase 17
  };
}

function getSession(sessionId) {
  const sid = _trim(sessionId) || "session";
  let s = sessions.get(sid);
  if (!s) {
    s = _createSession(sid);
    sessions.set(sid, s);
  }
  s.touchedAt = _now();
  return s;
}

/* -------------------------
   Operator controls (Phase 20)
   ------------------------- */
function resetSession(sessionId){
  const sid = _trim(sessionId) || "session";
  sessions.set(sid, _createSession(sid));
  return getSession(sid);
}

function pruneSession(sessionId){
  const s = getSession(sessionId);
  // Keep only the most useful bits
  s.turns = s.turns.slice(-Math.min(6, POLICY.maxTurns));
  s.openLoops = s.openLoops.slice(-Math.min(3, POLICY.maxOpenLoops));
  s.audit = s.audit.slice(-Math.min(20, POLICY.maxAudit));
  s.touchedAt = _now();
  _audit(s, "PRUNE", { turns: s.turns.length, loops: s.openLoops.length });
  return s;
}

function setBridgeFuse(sessionId, ms, reason){
  const s = getSession(sessionId);
  const until = _now() + _clampInt(ms, 1000, 5 * 60_000);
  s.bridge.fusedUntil = until;
  s.bridge.fuseReason = _cap(_trim(reason) || "manual", 60);
  _audit(s, "BRIDGE_FUSE_SET", { until, reason: s.bridge.fuseReason });
  return until;
}

/* -------------------------
   Audit (Phase 16)
   ------------------------- */
function _audit(session, type, data){
  try{
    const evt = {
      ts: _now(),
      type: _cap(_trim(type), 32) || "EVT",
      data: _isObj(data) ? data : { v: _str(data) },
    };
    session.audit.push(evt);
    if (session.audit.length > POLICY.maxAudit) session.audit.shift();
  }catch(_e){}
}

/* -------------------------
   Long memory (Phase 04)
   ------------------------- */
function rememberFact(sessionId, key, value, src){
  const s = getSession(sessionId);
  const k = _cap(_trim(key), 64);
  const v = _sanitizeText(value, POLICY.maxLongFactChars);
  if (!k || !v) return false;

  // replace if exists (case-insensitive)
  const kLower = _lower(k);
  s.long = (s.long || []).filter(f => _lower(f.key) !== kLower);

  s.long.push({
    key: k,
    value: v,
    ts: _now(),
    ttlMs: POLICY.longFactTtlMs,
    src: _cap(_trim(src), 32) || "runtime",
  });

  if (s.long.length > POLICY.maxLongFacts) s.long.shift();
  _audit(s, "LONG_REMEMBER", { key: k });
  return true;
}

function _gcLong(session){
  const now = _now();
  session.long = (session.long || []).filter(f => (now - (f.ts || 0)) < (f.ttlMs || POLICY.longFactTtlMs));
}

/* -------------------------
   Entity store (Phase 06)
   ------------------------- */
function rememberEntity(sessionId, key, value, src){
  const s = getSession(sessionId);
  const k = _cap(_trim(key), 48);
  const v = _sanitizeText(value, 220);
  if (!k || !v) return false;
  s.entities[k] = { value: v, ts: _now(), ttlMs: POLICY.entityTtlMs, src: _cap(_trim(src), 32) || "runtime" };

  // Enforce maxEntities (by oldest)
  const keys = Object.keys(s.entities);
  if (keys.length > POLICY.maxEntities){
    keys.sort((a,b) => (s.entities[a].ts||0) - (s.entities[b].ts||0));
    const drop = keys.length - POLICY.maxEntities;
    for (let i=0; i<drop; i++) delete s.entities[keys[i]];
  }
  _audit(s, "ENTITY_REMEMBER", { key: k });
  return true;
}

function _gcEntities(session){
  const now = _now();
  const ent = session.entities || {};
  for (const k of Object.keys(ent)){
    const e = ent[k];
    const ttl = e && e.ttlMs ? e.ttlMs : POLICY.entityTtlMs;
    if ((now - (e.ts || 0)) > ttl) delete ent[k];
  }
}

/* -------------------------
   Open loops (Phase 05)
   ------------------------- */
function addOpenLoop(sessionId, question) {
  const s = getSession(sessionId);
  const q = _sanitizeText(question, POLICY.maxOpenLoopChars);
  if (!q) return;

  // de-dupe by normalized text
  const norm = _lower(q);
  s.openLoops = (s.openLoops || []).filter(x => _lower(x) !== norm);
  s.openLoops.push(q);

  if (s.openLoops.length > POLICY.maxOpenLoops) s.openLoops.shift();
  _audit(s, "OPEN_LOOP_ADD", { q: _cap(q, 80) });
}

function closeLoop(sessionId, question) {
  const s = getSession(sessionId);
  const q = _trim(question);
  if (!q) return;
  const norm = _lower(q);
  s.openLoops = (s.openLoops || []).filter(x => _lower(x) !== norm);
  _audit(s, "OPEN_LOOP_CLOSE", { q: _cap(q, 80) });
}

/* -------------------------
   Depth ladder (Phase 09)
   ------------------------- */
function _moveDepth(session, intent, userText){
  // Simple deterministic ladder:
  // 1 Greeting → 2 Clarify → 3 Diagnose → 4 Plan → 5 Execute
  const i = _lower(intent);
  const t = _lower(userText);

  let move = "";
  if (i.includes("greet") || t === "hi" || t === "hello") move = "greeting";
  else if (i.includes("clarif") || t.endsWith("?")) move = "clarify";
  else if (i.includes("debug") || i.includes("diagnos")) move = "diagnose";
  else if (i.includes("plan") || i.includes("roadmap")) move = "plan";
  else if (i.includes("ship") || i.includes("patch") || i.includes("update")) move = "execute";

  const prev = session.depth.level || 2;
  let next = prev;

  if (move === "greeting") next = Math.max(prev, 1);
  else if (move === "clarify") next = Math.max(prev, 2);
  else if (move === "diagnose") next = Math.max(prev, 3);
  else if (move === "plan") next = Math.max(prev, 4);
  else if (move === "execute") next = Math.max(prev, 5);

  // Stall detector: if we keep returning same level, increment stalled
  if (next === prev) session.depth.stalled = (session.depth.stalled || 0) + 1;
  else session.depth.stalled = 0;

  session.depth.level = next;
  session.depth.lastMove = move || session.depth.lastMove || "";
}

/* -------------------------
   Bridge coordination (Phase 10/11)
   ------------------------- */
function noteBridgeUse(sessionId, info){
  const s = getSession(sessionId);
  const obj = _isObj(info) ? info : {};
  s.bridge.used = (s.bridge.used || 0) + 1;
  s.bridge.lastAt = _now();
  s.bridge.lastLane = _cap(_trim(obj.lane || ""), 40);
  s.bridge.lastAction = _cap(_trim(obj.action || ""), 40);
  s.bridge.lastTrace = _cap(_trim(obj.trace || obj.traceId || ""), 80);
  _audit(s, "BRIDGE_USE", { lane: s.bridge.lastLane, action: s.bridge.lastAction });
}

function isBridgeFused(sessionId){
  const s = getSession(sessionId);
  return !!(s.bridge.fusedUntil && _now() < s.bridge.fusedUntil);
}

function maybeFuseBridge(sessionId, reason, sig){
  const s = getSession(sessionId);
  // Do not extend fuse repeatedly if already fused
  if (isBridgeFused(sessionId)) return s.bridge.fusedUntil;

  s.bridge.fusedUntil = _now() + POLICY.fuseMs;
  s.bridge.fuseReason = _cap(_trim(reason) || "loop_guard", 60);
  _audit(s, "BRIDGE_FUSE", { reason: s.bridge.fuseReason, sig: _cap(_trim(sig), 80) });
  return s.bridge.fusedUntil;
}

/* -------------------------
   Turn storage (Phase 01/02/07/12/13)
   ------------------------- */
function storeTurn(sessionId, turn) {
  const s = getSession(sessionId);
  const t = _isObj(turn) ? turn : {};

  const user = _sanitizeText(t.user, POLICY.maxTurnChars);
  const assistant = _sanitizeText(t.assistant, POLICY.maxTurnChars);

  const intent = _cap(_trim(t.intent || "general"), 48) || "general";
  const topics = _dedupeArray(t.topics || []).slice(0, 8);
  const entities = _dedupeArray(t.entities || []).slice(0, 10);

  // Build signatures for loop guards
  const aTokens = _tokenize(assistant).slice(0, 60);
  const aHash = _hashLite(aTokens.join(" "));

  const entry = {
    id: _now().toString(36),
    ts: _now(),
    user,
    assistant,
    intent,
    topics,
    entities,
    // signatures (Phase 12)
    sig: {
      user: _hashLite(_tokenize(user).join(" ")),
      assistant: aHash,
    },
  };

  s.turns.push(entry);
  if (s.turns.length > POLICY.maxTurns) s.turns.shift();

  // Maintain assistant sig window
  s.recentAssistantSigs.push(aHash);
  if (s.recentAssistantSigs.length > POLICY.simWindow) s.recentAssistantSigs.shift();

  // Update loop counters (Phase 08/12)
  s.lastAssistantHash = aHash;
  s.lastAssistantTokens = aTokens;

  // Depth ladder (Phase 09)
  _moveDepth(s, intent, user);

  // Opportunistic memory: persist entities provided by turn.entities as hints
  for (const e of entities){
    // store key=value only if it looks like "k:v"
    const m = String(e).split(":");
    if (m.length >= 2){
      const k = _trim(m[0]);
      const v = _trim(m.slice(1).join(":"));
      if (k && v) rememberEntity(sessionId, k, v, "turn");
    }
  }

  // Summary refresh cadence (Phase 03)
  if ((s.turns.length % POLICY.summaryRefreshEveryTurns) === 0) {
    updateSummary(s);
  }

  // Housekeeping
  _gcEntities(s);
  _gcLong(s);
  gcSessions(); // lightweight opportunistic GC

  return entry;
}

/* -------------------------
   Summary builder (Phase 03)
   ------------------------- */
function updateSummary(session) {
  // Deterministic compression:
  // - intent trail + latest goal + open loops snapshot + bridge state
  const turns = (session.turns || []).slice(-Math.min(10, POLICY.maxRecentTurnsForPrompt));
  const intents = turns.map(t => _cap(_trim(t.intent), 32)).filter(Boolean);

  // derive "current goal" from last user turn
  const last = turns.length ? turns[turns.length - 1] : null;
  const goal = last ? _cap(_trim(last.user), 140) : "";

  const openLoops = (session.openLoops || []).slice(-3).map(q => _cap(q, 90));
  const bridgeState = isBridgeFused(session.id) ? `bridge:fused(${session.bridge.fuseReason})` : "bridge:ok";

  const line1 = intents.length ? `Intents: ${_dedupeArray(intents).slice(-6).join(" → ")}` : "Intents: (none)";
  const line2 = goal ? `Current: ${goal}` : "Current: (none)";
  const line3 = openLoops.length ? `Open: ${openLoops.join(" | ")}` : "Open: (none)";
  const line4 = `Depth: L${session.depth.level || 0}${session.depth.stalled ? ` (stalled:${session.depth.stalled})` : ""}; ${bridgeState}`;

  const sum = [line1, line2, line3, line4].join("\n");
  session.summary = _cap(sum, POLICY.maxSummaryChars);
  _audit(session, "SUMMARY_REFRESH", { chars: session.summary.length });
}

/* -------------------------
   Repetition guard (Phase 08)
   ------------------------- */
function isRepetitive(sessionId, response) {
  const s = getSession(sessionId);
  const r = _sanitizeText(response, POLICY.maxTurnChars);

  const tokens = _tokenize(r).slice(0, 60);
  const h = _hashLite(tokens.join(" "));

  // Exact hash match with last response
  if (h && s.lastAssistantHash && h === s.lastAssistantHash) {
    s.loop.n = (s.loop.n || 0) + 1;
    s.loop.at = _now();
    s.loop.sig = h;
    _audit(s, "REPEAT_HASH", { n: s.loop.n });
    // If we repeat, fuse bridge briefly to stop Marion echo spirals
    maybeFuseBridge(sessionId, "repeat_hash", h);
    return true;
  }

  // Similarity check against recent assistant sigs (Jaccard) — avoids near-duplicates
  const recent = (s.turns || []).slice(-POLICY.simWindow).map(t => _tokenize(t.assistant || "").slice(0, 60));
  let maxSim = 0;
  for (const rt of recent){
    const sim = _jaccard(tokens, rt);
    if (sim > maxSim) maxSim = sim;
  }
  if (maxSim >= POLICY.simJaccardThreshold){
    s.loop.n = (s.loop.n || 0) + 1;
    s.loop.at = _now();
    s.loop.sig = `sim:${maxSim.toFixed(2)}`;
    _audit(s, "REPEAT_SIM", { sim: maxSim });
    maybeFuseBridge(sessionId, "repeat_sim", s.loop.sig);
    // Update last hash anyway (prevents thrash)
    s.lastAssistantHash = h;
    s.lastAssistantTokens = tokens;
    return true;
  }

  // Accept: update last signatures
  s.lastAssistantHash = h;
  s.lastAssistantTokens = tokens;
  s.loop.n = 0;
  s.loop.sig = "";
  return false;
}

/* -------------------------
   Build prompt context (Phase 02/03/04/05/06/09/10/11/13)
   ------------------------- */
function buildContext(sessionId) {
  const s = getSession(sessionId);

  // Always refresh summary if missing
  if (!s.summary) updateSummary(s);

  // Recent turns for prompt
  const recentTurns = (s.turns || []).slice(-POLICY.maxRecentTurnsForPrompt).map(t => {
    // Keep it prompt-friendly and bounded
    const u = _cap(_trim(t.user), 500);
    const a = _cap(_trim(t.assistant), 650);
    return `User: ${u}\nNyx: ${a}`;
  });

  // Long memory facts (conservative)
  const longFacts = (s.long || []).slice(-Math.min(10, POLICY.maxLongFacts)).map(f => `${f.key}: ${f.value}`);

  // Entities
  const entPairs = [];
  const ent = s.entities || {};
  for (const k of Object.keys(ent)){
    const v = ent[k] && ent[k].value ? ent[k].value : "";
    if (v) entPairs.push(`${k}: ${_cap(v, 120)}`);
  }

  // Bridge state
  const bridge = {
    fused: isBridgeFused(sessionId),
    fusedUntil: s.bridge.fusedUntil || 0,
    fuseReason: s.bridge.fuseReason || "",
    used: s.bridge.used || 0,
    lastLane: s.bridge.lastLane || "",
    lastAction: s.bridge.lastAction || "",
  };

  // Depth
  const depth = {
    level: s.depth.level || 0,
    stalled: s.depth.stalled || 0,
    lastMove: s.depth.lastMove || "",
  };

  return {
    spineVersion: SPINE_VERSION,
    policy: {
      maxTurns: POLICY.maxTurns,
      maxRecent: POLICY.maxRecentTurnsForPrompt,
      summaryEvery: POLICY.summaryRefreshEveryTurns,
    },
    summary: s.summary,
    openLoops: (s.openLoops || []).slice(-POLICY.maxOpenLoops),
    recent: recentTurns.join("\n"),
    long: longFacts,
    entities: entPairs,
    depth,
    bridge,
  };
}

/* -------------------------
   Diagnostics (Phase 15)
   ------------------------- */
function diag(sessionId) {
  if (sessionId) {
    const s = getSession(sessionId);
    return {
      ok: true,
      spineVersion: SPINE_VERSION,
      id: s.id,
      turns: (s.turns || []).length,
      openLoops: (s.openLoops || []).length,
      entities: Object.keys(s.entities || {}).length,
      long: (s.long || []).length,
      bridge: { fused: isBridgeFused(sessionId), used: s.bridge.used || 0, fusedUntil: s.bridge.fusedUntil || 0 },
      depth: s.depth,
      loop: s.loop,
      auditTail: (s.audit || []).slice(-10),
      touchedAt: s.touchedAt,
    };
  }
  return {
    ok: true,
    spineVersion: SPINE_VERSION,
    activeSessions: sessions.size,
    policy: POLICY,
  };
}

/* -------------------------
   Session GC (Phase 18)
   ------------------------- */
function gcSessions(){
  const now = _now();
  for (const [sid, s] of sessions.entries()){
    if (!s) { sessions.delete(sid); continue; }
    const idle = now - (s.touchedAt || s.createdAt || now);
    if (idle > POLICY.sessionIdleTtlMs){
      sessions.delete(sid);
    }
  }
}

/* -------------------------
   Exports (Phase 19)
   ------------------------- */
module.exports = {
  SPINE_VERSION,

  // v1-compatible API
  getSession,
  storeTurn,
  addOpenLoop,
  closeLoop,
  buildContext,
  isRepetitive,
  diag,

  // v2 additions (safe)
  POLICY,
  resetSession,
  pruneSession,
  rememberFact,
  rememberEntity,
  noteBridgeUse,
  isBridgeFused,
  maybeFuseBridge,
  setBridgeFuse,
  gcSessions,
};

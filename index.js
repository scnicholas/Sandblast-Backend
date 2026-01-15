"use strict";

/**
 * Sandblast Backend — index.js
 *
 * index.js v1.5.21 (COG CANONICAL + FINAL SYNC: canonical phases/states + re-derive cog AFTER finalizeReply; preserves v1.5.20 behavior)
 *
 * Surgical fixes vs v1.5.20 you pasted:
 *  1) Canonical Cognitive OS phases/states enforced (idle|engaged|guiding|explaining|deciding|handoff).
 *     - Backward compatible: legacy setCog("engage"/"execute"/"running"/"decide") is auto-normalized.
 *  2) End-of-turn cog is re-derived AFTER finalizeReply (respondJson + replay direct path) using deriveCogFromFinalReply()
 *     so payload.cog and avatar/UI always reflect the final reply language.
 *  3) payload.cog now includes ts (epoch ms) for deterministic UI sync/debug.
 *
 * Preserves (from v1.5.20):
 *  - Numeric-year hardening in bridges
 *  - Schedule Lane precedence + all routing/guards/FMP/Replay integrity
 *  - Assertive Finisher behavior
 */

const express = require("express");
const crypto = require("crypto");
const cors = require("cors");

const app = express();

/* ======================================================
   Version + Contract
====================================================== */

const NYX_CONTRACT_VERSION = "1";
const INDEX_VERSION =
  "index.js v1.5.21 (v1.5.20 + canonical Cognitive OS phases/states + final-reply cog sync w/ ts; preserves schedule/sponsors/movies/music routing, explicit Top10 guard, FMP autorun, lane escape chips, replay integrity, chart guard/bridge, Top10-missing escape)";

/* ======================================================
   Basic middleware
====================================================== */

function rawBodySaver(req, res, buf, encoding) {
  try {
    if (buf && buf.length) req.rawBody = buf.toString(encoding || "utf8");
  } catch (_) {}
}

app.use(
  express.json({
    limit: "1mb",
    verify: rawBodySaver,
  })
);

app.use(
  express.text({
    type: ["text/*"],
    limit: "1mb",
    verify: rawBodySaver,
  })
);

/* ======================================================
   Timeout middleware
====================================================== */

const REQUEST_TIMEOUT_MS = Math.max(
  10000,
  Math.min(60000, Number(process.env.REQUEST_TIMEOUT_MS || 30000))
);

app.use((req, res, next) => {
  try {
    res.setTimeout(REQUEST_TIMEOUT_MS);
  } catch (_) {}
  next();
});

/* ======================================================
   CORS
====================================================== */

function parseAllowedOrigins() {
  const raw = String(process.env.CORS_ALLOWED_ORIGINS || "").trim();
  const defaults = ["http://localhost:3000", "http://127.0.0.1:3000"];
  const list = raw ? raw.split(",").map((s) => s.trim()).filter(Boolean) : [];
  return Array.from(new Set([...defaults, ...list]));
}
const ALLOWED_ORIGINS = parseAllowedOrigins();

const CORS_ALLOW_ALL = String(process.env.CORS_ALLOW_ALL || "false") === "true";
const CONTRACT_STRICT =
  String(process.env.CONTRACT_STRICT || "false") === "true";
const MAX_SESSIONS = Math.max(0, Number(process.env.MAX_SESSIONS || 0));
const CHAT_DEBUG = String(process.env.CHAT_DEBUG || "false") === "true";

function normalizeOrigin(origin) {
  const o = String(origin || "").trim();
  if (!o) return "";
  return o.replace(/\/$/, "");
}

function originMatchesAllowlist(origin) {
  const o = normalizeOrigin(origin);
  if (!o) return false;

  if (ALLOWED_ORIGINS.includes(o)) return true;

  try {
    const u = new URL(o);
    const host = String(u.hostname || "");
    if (!host) return false;

    const altHost = host.startsWith("www.") ? host.slice(4) : `www.${host}`;
    const alt = `${u.protocol}//${altHost}${u.port ? `:${u.port}` : ""}`;
    return ALLOWED_ORIGINS.includes(alt);
  } catch (_) {
    return false;
  }
}

const corsOptions = {
  origin: function (origin, cb) {
    if (!origin) return cb(null, true);
    if (CORS_ALLOW_ALL) return cb(null, true);
    if (originMatchesAllowlist(origin)) return cb(null, true);
    return cb(null, false);
  },
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: [
    "Content-Type",
    "Accept",
    "Authorization",
    "X-Requested-With",
    "X-Visitor-Id",
    "X-Contract-Version",
    "X-Request-Id",
  ],
  exposedHeaders: ["X-Request-Id", "X-Contract-Version", "X-Voice-Mode"],
  maxAge: 86400,
};

app.use(cors(corsOptions));
app.options("/api/*", cors(corsOptions));
app.options("*", cors(corsOptions));

/* ======================================================
   JSON parse error handler
====================================================== */
app.use((err, req, res, next) => {
  const requestId = req.get("X-Request-Id") || rid();
  res.set("X-Request-Id", requestId);
  res.set("X-Contract-Version", NYX_CONTRACT_VERSION);
  res.set("Cache-Control", "no-store");

  const isJsonParseError =
    err &&
    (err.type === "entity.parse.failed" ||
      err instanceof SyntaxError ||
      String(err.message || "").toLowerCase().includes("json"));

  if (isJsonParseError) {
    return res.status(400).json({
      ok: false,
      error: "BAD_REQUEST",
      detail: "INVALID_JSON",
      message: String(err.message || "JSON parse error"),
      contentType: req.headers["content-type"] || null,
      rawPreview: String(req.rawBody || "").slice(0, 700),
      requestId,
      contractVersion: NYX_CONTRACT_VERSION,
    });
  }

  return next(err);
});

/* ======================================================
   Helpers
====================================================== */

function nowIso() {
  return new Date().toISOString();
}

function rid() {
  return crypto.randomBytes(8).toString("hex");
}

function cleanText(s) {
  return String(s || "")
    .replace(/\u200B/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function safeJsonParse(body, rawFallback) {
  try {
    if (body && typeof body === "object") return body;

    if (typeof body === "string" && body.trim()) {
      const t = body.trim();
      if (
        (t.startsWith("{") && t.endsWith("}")) ||
        (t.startsWith("[") && t.endsWith("]"))
      ) {
        return JSON.parse(t);
      }
    }

    if (rawFallback && String(rawFallback).trim()) {
      const rt = String(rawFallback).trim();
      if (
        (rt.startsWith("{") && rt.endsWith("}")) ||
        (rt.startsWith("[") && rt.endsWith("]"))
      ) {
        return JSON.parse(rt);
      }
    }

    return null;
  } catch {
    return null;
  }
}

function clampYear(y) {
  if (!Number.isFinite(y)) return null;
  if (y < 1950 || y > 2024) return null;
  return y;
}

function safeIncYear(y, delta) {
  const yy = clampYear(Number(y));
  if (!yy) return null;
  return clampYear(yy + delta);
}

function parseDebugFlag(req) {
  if (!req) return false;
  const q = String(req.query && req.query.debug ? req.query.debug : "").trim();
  if (q === "1" || q.toLowerCase() === "true") return true;
  return false;
}

function makeUuid() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0,
      v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/* ======================================================
   Cognitive OS Layer (assertive + canonical)
====================================================== */

/**
 * Optional behavior toggles (safe defaults):
 *  - COG_PAYLOAD_ENABLED: include payload.cog for UI/avatar (default true)
 *  - COG_AUTOCONTINUE_ON_GREETING: returning+resumable greeting auto-runs Continue (default true)
 *  - COG_AUTOCONTINUE_COOLDOWN_MS: throttle to avoid surprise loops (default 6h)
 */
const COG_PAYLOAD_ENABLED =
  String(process.env.COG_PAYLOAD_ENABLED || "true") === "true";

const COG_AUTOCONTINUE_ON_GREETING =
  String(process.env.COG_AUTOCONTINUE_ON_GREETING || "true") === "true";

const COG_AUTOCONTINUE_COOLDOWN_MS = Math.max(
  30 * 1000,
  Math.min(
    24 * 60 * 60 * 1000,
    Number(process.env.COG_AUTOCONTINUE_COOLDOWN_MS || 6 * 60 * 60 * 1000)
  )
);

// Canonical phases/states (UI contract)
const COG_PHASE = Object.freeze({
  IDLE: "idle",
  ENGAGED: "engaged",
  GUIDING: "guiding",
  EXPLAINING: "explaining",
  DECIDING: "deciding",
  HANDOFF: "handoff",
});

const COG_STATE = Object.freeze({
  IDLE: "idle",
  READY: "ready",
  COLLECT: "collect",
  CONFIDENT: "confident",
  CAUTIOUS: "cautious",
  ACTIVE: "active",
});

function cogNow() {
  return Date.now();
}

function initCog(session) {
  if (!session) return;
  if (!session.cogPhase) session.cogPhase = COG_PHASE.IDLE;
  if (!session.cogState) session.cogState = COG_STATE.READY;
  if (!session.cogReason) session.cogReason = "";
  if (!Number.isFinite(Number(session._cogLastAutoContinueAt || 0)))
    session._cogLastAutoContinueAt = 0;
  if (!Number.isFinite(Number(session.cogTs || 0))) session.cogTs = 0;
}

// Back-compat canonicalizers (accept legacy tokens)
function _canonPhase(p) {
  const t = cleanText(p || "").toLowerCase();

  // canonical
  if (t === COG_PHASE.IDLE) return COG_PHASE.IDLE;
  if (t === COG_PHASE.ENGAGED) return COG_PHASE.ENGAGED;
  if (t === COG_PHASE.GUIDING) return COG_PHASE.GUIDING;
  if (t === COG_PHASE.EXPLAINING) return COG_PHASE.EXPLAINING;
  if (t === COG_PHASE.DECIDING) return COG_PHASE.DECIDING;
  if (t === COG_PHASE.HANDOFF) return COG_PHASE.HANDOFF;

  // legacy aliases
  if (t === "engage") return COG_PHASE.ENGAGED;
  if (t === "execute") return COG_PHASE.GUIDING; // “I’m doing it now”
  if (t === "decide") return COG_PHASE.DECIDING;

  // safe default when active
  return COG_PHASE.ENGAGED;
}

function _canonState(s) {
  const t = cleanText(s || "").toLowerCase();

  // canonical
  if (t === COG_STATE.IDLE) return COG_STATE.IDLE;
  if (t === COG_STATE.READY) return COG_STATE.READY;
  if (t === COG_STATE.COLLECT) return COG_STATE.COLLECT;
  if (t === COG_STATE.CONFIDENT) return COG_STATE.CONFIDENT;
  if (t === COG_STATE.CAUTIOUS) return COG_STATE.CAUTIOUS;
  if (t === COG_STATE.ACTIVE) return COG_STATE.ACTIVE;

  // legacy aliases
  if (t === "running") return COG_STATE.CONFIDENT;
  if (t === "decide") return COG_STATE.READY;

  return COG_STATE.READY;
}

function setCog(session, phase, state, reason) {
  if (!session) return;
  initCog(session);
  session.cogPhase = _canonPhase(phase);
  session.cogState = _canonState(state);
  session.cogReason = cleanText(reason || "") || "";
  session.cogTs = cogNow();
}

function deriveCogFromSession(session) {
  if (!session) return { phase: COG_PHASE.IDLE, state: COG_STATE.READY, reason: "" };
  initCog(session);

  const lane = String(session.lane || "general");

  // Always normalize numeric year / tokens here
  const y = clampYear(Number(session.lastYear));
  const mRaw = session.activeMusicMode || session.pendingMode || null;
  const m = cleanText(mRaw || "").toLowerCase();

  if (lane === "sponsors")
    return { phase: COG_PHASE.HANDOFF, state: COG_STATE.ACTIVE, reason: "lane:sponsors" };
  if (lane === "movies")
    return { phase: COG_PHASE.HANDOFF, state: COG_STATE.ACTIVE, reason: "lane:movies" };
  if (lane === "schedule")
    return { phase: COG_PHASE.HANDOFF, state: COG_STATE.ACTIVE, reason: "lane:schedule" };

  const hasMode =
    !!m && (m.includes("top") || m.includes("story") || m.includes("micro"));

  if (!y && !hasMode)
    return { phase: COG_PHASE.ENGAGED, state: COG_STATE.COLLECT, reason: "need:year_mode" };
  if (!y && hasMode)
    return { phase: COG_PHASE.ENGAGED, state: COG_STATE.COLLECT, reason: "need:year" };
  if (y && !hasMode)
    return { phase: COG_PHASE.DECIDING, state: COG_STATE.READY, reason: "need:mode" };

  return { phase: COG_PHASE.GUIDING, state: COG_STATE.CONFIDENT, reason: "music:ready" };
}

// Final-sync cognition based on the actual reply language (UI truth)
function deriveCogFromFinalReply(session, finalReply) {
  const base = deriveCogFromSession(session);
  const r = cleanText(finalReply || "").toLowerCase();

  // lane-owned still wins
  const lane = String(session && session.lane ? session.lane : "general").toLowerCase();
  if (lane === "sponsors" || lane === "movies" || lane === "schedule") return base;

  // Explaining posture
  if (/\b(why|because|context|history|here’s what happened|that's because)\b/.test(r)) {
    return { phase: COG_PHASE.EXPLAINING, state: COG_STATE.CONFIDENT, reason: "final:explaining" };
  }

  // Deciding posture (explicit small choice set)
  if (/\b(choose one|pick one|choose:|pick:|options:)\b/.test(r)) {
    return { phase: COG_PHASE.DECIDING, state: COG_STATE.CONFIDENT, reason: "final:deciding" };
  }

  // Guiding posture (forward action)
  if (/\b(next:|proceeding with|running|i’m going to run|i'm going to run|locked in)\b/.test(r)) {
    return { phase: COG_PHASE.GUIDING, state: COG_STATE.CONFIDENT, reason: "final:guiding" };
  }

  return base;
}

function attachCogToPayload(payload, session) {
  if (!COG_PAYLOAD_ENABLED) return payload;
  if (!payload || typeof payload !== "object") return payload;

  initCog(session);

  payload.cog = {
    phase: session ? session.cogPhase : COG_PHASE.IDLE,
    state: session ? session.cogState : COG_STATE.READY,
    reason: session ? session.cogReason : "",
    lane: session ? String(session.lane || "general") : "general",
    year:
      session && clampYear(Number(session.lastYear))
        ? Number(session.lastYear)
        : null,
    mode: session ? (session.activeMusicMode || session.pendingMode || null) : null,
    ts: session ? Number(session.cogTs || cogNow()) : cogNow(),
  };
  return payload;
}

/* ======================================================
   Music constants + chart contamination guard
====================================================== */

const DEFAULT_CHART = "Billboard Hot 100";
const YEAR_END_CHART = "Billboard Year-End Hot 100";
const YEAR_END_SINGLES_CHART = "Billboard Year-End Singles";

function normalizeChartToken(s) {
  const t = cleanText(s).toLowerCase();
  if (!t) return DEFAULT_CHART;
  if (t.includes("year") && t.includes("end") && t.includes("single"))
    return YEAR_END_SINGLES_CHART;
  if (t.includes("year") && t.includes("end")) return YEAR_END_CHART;
  if (t.includes("hot 100") || t.includes("hot100") || t.includes("billboard"))
    return DEFAULT_CHART;
  return cleanText(s) || DEFAULT_CHART;
}

/**
 * Critical: if a stale session carries Singles into 1960+ requests, auto-switch.
 * Prefer Year-End Hot 100; musicKnowledge v2.72 will resolve further if needed.
 */
function guardChartForYear(session, year) {
  if (!session) return;
  const y = clampYear(Number(year));
  if (!y) return;

  const current = normalizeChartToken(session.activeMusicChart || DEFAULT_CHART);

  if (!session.activeMusicChart) session.activeMusicChart = DEFAULT_CHART;

  if (current === YEAR_END_SINGLES_CHART && y >= 1960) {
    session.activeMusicChart = YEAR_END_CHART;
  }

  session.activeMusicChart = normalizeChartToken(
    session.activeMusicChart || DEFAULT_CHART
  );
  if (!session.activeMusicChart) session.activeMusicChart = DEFAULT_CHART;
}

/**
 * Bridge: musicKnowledge v2.72 uses lastMusicYear/lastMusicChart; index.js uses lastYear.
 * Keep them coherent before and after engine calls.
 */
function preEngineBridge(session) {
  if (!session) return;

  if (!session.activeMusicChart) session.activeMusicChart = DEFAULT_CHART;
  session.activeMusicChart = normalizeChartToken(session.activeMusicChart);

  // v1.5.20: always Number() before clampYear to avoid string-year drift
  if (
    !clampYear(Number(session.lastYear)) &&
    clampYear(Number(session.lastMusicYear))
  ) {
    session.lastYear = Number(session.lastMusicYear);
  }
  if (!session.lastMusicChart && session.activeMusicChart) {
    session.lastMusicChart = session.activeMusicChart;
  }

  initCog(session);
}

function postEngineBridge(session) {
  if (!session) return;

  if (
    clampYear(Number(session.lastMusicYear)) &&
    !clampYear(Number(session.lastYear))
  ) {
    session.lastYear = Number(session.lastMusicYear);
  }
  if (
    clampYear(Number(session.lastYear)) &&
    (!clampYear(Number(session.lastMusicYear)) ||
      Number(session.lastMusicYear) !== Number(session.lastYear))
  ) {
    session.lastMusicYear = Number(session.lastYear);
  }

  if (session.lastMusicChart && !session.activeMusicChart) {
    session.activeMusicChart = session.lastMusicChart;
  }
  if (session.activeMusicChart && !session.lastMusicChart) {
    session.lastMusicChart = session.activeMusicChart;
  }

  session.activeMusicChart = normalizeChartToken(
    session.activeMusicChart || DEFAULT_CHART
  );
  session.lastMusicChart = normalizeChartToken(
    session.lastMusicChart || session.activeMusicChart || DEFAULT_CHART
  );

  initCog(session);
}

/* ======================================================
   TOP10 Missing Escape (deterministic)
====================================================== */

function normalizeForTop10Missing(s) {
  return cleanText(String(s || ""))
    .toLowerCase()
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[*_`]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function looksLikeTop10Missing(reply) {
  const r = normalizeForTop10Missing(reply);
  if (!r) return false;

  const hasTop10 =
    (r.includes("top") && r.includes("10")) ||
    r.includes("top10") ||
    r.includes("top ten");

  if (!hasTop10) return false;

  if (
    r.includes("dont have") ||
    r.includes("don't have") ||
    r.includes("do not have")
  )
    return true;

  if (r.includes("no clean") && r.includes("top")) return true;

  if (r.includes("not loaded") && r.includes("chart")) return true;
  if (r.includes("loaded sources") && r.includes("build")) return true;
  if (r.includes("not in this build") && hasTop10) return true;

  if (r.includes("cant") && r.includes("top") && r.includes("10")) return true;
  if (r.includes("cannot") && r.includes("top") && r.includes("10")) return true;

  return false;
}

function top10MissingPreface(year) {
  const y = clampYear(Number(year)) || 1988;
  return (
    `For ${y}, I can give you something richer than a standard Top 10 right now.` +
    ` I’m going to run a story moment—say “micro moment ${y}” if you want the tighter version.`
  );
}

function top10MissingFollowUps(year) {
  const y = clampYear(Number(year)) || 1988;
  const ny = safeIncYear(y, +1);
  return [
    { label: "Story moment", send: `story moment ${y}` },
    { label: "Micro moment", send: `micro moment ${y}` },
    { label: ny ? `Top 10 ${ny}` : "Top 10", send: ny ? `top 10 ${ny}` : "Top 10" },
    { label: "Another year", send: "Another year" },
    { label: "Replay last", send: "Replay last" },
  ];
}

/* ======================================================
   Phase A — Forward Motion Patch (FMP)
====================================================== */

const FMP_AUTORUN_ENABLED =
  String(process.env.FMP_AUTORUN_ENABLED || "true") === "true";
const FMP_AUTORUN_COOLDOWN_MS = Math.max(
  750,
  Math.min(15000, Number(process.env.FMP_AUTORUN_COOLDOWN_MS || 2500))
);

const FMP = {
  ASK_YEAR_RE:
    /\b(what year|give me a year|pick a year|choose a year|year\s*\(1950|1950–2024)\b/i,
  ASK_MODE_CHOICE_RE: /\b(choose|pick|what do you want|which do you want|select)\b/i,
  MODE_WORDS_RE: /\b(top\s*10|story\s*moment|micro\s*moment)\b/i,
  SOFT_OPEN_RE: /\b(what would you like|what do you want|tell me what you|choose|pick)\b/i,

  isAskingYear(reply) {
    const r = cleanText(reply).toLowerCase();
    return this.ASK_YEAR_RE.test(r);
  },

  isAskingMode(reply) {
    const r = cleanText(reply).toLowerCase();
    return (
      this.MODE_WORDS_RE.test(r) &&
      (this.ASK_MODE_CHOICE_RE.test(r) || this.SOFT_OPEN_RE.test(r))
    );
  },

  endsOpenQuestion(reply) {
    const r = cleanText(reply);
    if (!r) return false;
    if (/[?]$/.test(r)) return true;
    const low = r.toLowerCase();
    if (/\bwhat would you like\b/.test(low)) return true;
    if (/\bwhat do you want\b/.test(low)) return true;
    if (/\btell me what you\b/.test(low)) return true;
    return false;
  },

  detectAskLoop(session, reply) {
    if (!session) return null;

    const askType = this.isAskingYear(reply)
      ? "askYear"
      : this.isAskingMode(reply)
      ? "askMode"
      : null;
    if (!askType) return null;

    const now = Date.now();
    const last = session._fmp_lastAsk || null;

    session._fmp_lastAsk = { type: askType, at: now };

    if (last && last.type === askType && now - last.at < 45000) return askType;
    return null;
  },

  forceProceed(session, reason) {
    const y = clampYear(Number(session && session.lastYear))
      ? Number(session.lastYear)
      : null;

    const m = (session && (session.pendingMode || session.activeMusicMode)) || null;

    const year = y || 1988;
    const mode = m || "story";

    if (session) {
      session.lastYear = year;
      session.lastMusicYear = year;

      session.activeMusicMode = mode;
      session.pendingMode = null;

      if (mode === "top10") {
        session.activeMusicChart = YEAR_END_CHART;
        session.lastMusicChart = YEAR_END_CHART;
      }

      guardChartForYear(session, year);
      setCog(session, "execute", "running", `fmp:${reason || "forceProceed"}`);
    }

    const modeLabel =
      mode === "top10"
        ? "the Top 10"
        : mode === "micro"
        ? "a micro moment"
        : "a story moment";

    const reply =
      reason === "askYear"
        ? `Locked in ${year}. Running ${modeLabel} now. Say “switch” if you want a different mode.`
        : reason === "askMode"
        ? `Got it — ${year}. Running ${modeLabel} now. Say “switch” if you want a different mode.`
        : `Running ${modeLabel} for ${year}. Say “switch” if you want a different mode.`;

    const sendRun =
      mode === "top10"
        ? `top 10 ${year}`
        : mode === "micro"
        ? `micro moment ${year}`
        : `story moment ${year}`;
    const sendSwitch = mode === "top10" ? `story moment ${year}` : `top 10 ${year}`;

    const followUps = [
      { label: "Run now", send: sendRun },
      { label: "Switch mode", send: sendSwitch },
      { label: "Another year", send: "Another year" },
    ];

    return {
      reply,
      followUps,
      _fmpMeta: { run: sendRun, switch: sendSwitch, year, mode },
    };
  },

  apply(out, session) {
    if (!out || typeof out !== "object") return out;
    if (!session) return out;

    const reply = cleanText(out.reply || "");
    if (!reply) return out;

    const hasYear = !!clampYear(Number(session.lastYear));
    const hasMode = !!(session.activeMusicMode || session.pendingMode);

    if (hasYear && this.isAskingYear(reply)) {
      const forced = this.forceProceed(session, "askYear");
      return Object.assign({}, out, forced);
    }

    if (hasMode && this.isAskingMode(reply)) {
      const forced = this.forceProceed(session, "askMode");
      return Object.assign({}, out, forced);
    }

    const loopType = this.detectAskLoop(session, reply);
    if (loopType) {
      const forced = this.forceProceed(session, loopType);
      return Object.assign({}, out, forced);
    }

    if (this.endsOpenQuestion(reply)) {
      const y = clampYear(Number(session.lastYear)) ? Number(session.lastYear) : null;
      const mode = session.activeMusicMode || session.pendingMode || null;
      if (y && mode) {
        const modeLabel =
          mode === "top10"
            ? "the Top 10"
            : mode === "micro"
            ? "a micro moment"
            : "a story moment";
        const amended =
          `${reply.replace(/[?]+$/g, ".")} ` +
          `Proceeding with ${modeLabel} for ${y} unless you say “switch”.`;
        return Object.assign({}, out, { reply: amended });
      }
    }

    return out;
  },
};

async function maybeAutoRunFmp(out, session) {
  if (!FMP_AUTORUN_ENABLED) return out;
  if (!out || typeof out !== "object") return out;
  if (!session) return out;

  const meta = out._fmpMeta || null;
  const cmd = meta && cleanText(meta.run) ? cleanText(meta.run) : "";
  if (!cmd) return out;

  const now = Date.now();
  const lastAt = Number(session._fmpAutoRanAt || 0);
  if (Number.isFinite(lastAt) && lastAt > 0 && now - lastAt < FMP_AUTORUN_COOLDOWN_MS) {
    return out;
  }

  session._fmpAutoRanAt = now;
  setCog(session, "execute", "running", "fmp:autoRun");

  const out2 = await runEngine(cmd, session);
  const out3 = FMP.apply(out2, session);

  if (!out3.followUps && out.followUps) out3.followUps = out.followUps;

  if (out3 && typeof out3 === "object") {
    try {
      delete out3._fmpMeta;
    } catch (_) {}
  }
  return out3;
}

async function applyFmp(out0, session) {
  const out1 = FMP.apply(out0, session);
  return await maybeAutoRunFmp(out1, session);
}

/* ======================================================
   GH-1 Micro-Guard (forward motion) + Assertive reply finalize
====================================================== */

function ensureForwardMotion(reply, session) {
  const r = cleanText(reply);
  if (!r) return r;
  if (!session) return r;

  const lane = session.lane ? String(session.lane) : "general";
  if (lane !== "general" && lane !== "music") return r;

  const hasYear = !!clampYear(Number(session.lastYear));
  const hasMode = !!(session.activeMusicMode || session.pendingMode);

  const endsWithQuestion = /\?\s*$/.test(r);

  if (hasYear && hasMode && endsWithQuestion) {
    const y = clampYear(Number(session.lastYear));
    const mode = session.activeMusicMode || session.pendingMode;
    const modeLabel =
      mode === "top10" ? "Top 10" : mode === "micro" ? "a micro moment" : "a story moment";

    return (
      r.replace(/\?\s*$/, ".") +
      `\n\nProceeding with ${modeLabel} for ${y}. Say “switch” to change mode.`
    );
  }

  return r;
}

function addMomentumTail(session, reply) {
  const r = cleanText(reply);
  if (!r) return r;

  if (session && session.lane !== "general" && session.lane !== "music") return r;

  const y = session && clampYear(Number(session.lastYear)) ? Number(session.lastYear) : null;
  const mode = session && session.activeMusicMode ? session.activeMusicMode : null;

  // v1.5.20: do not append if it already ends with a question OR already contains "Next:"
  if (/[?]$/.test(r)) return r;
  if (/\bNext:\b/i.test(r)) return r;

  if (y && mode) return `${r} Next: “next year”, “another year”, or “replay”.`;
  return r;
}

function finalizeReply(session, replyRaw) {
  let r = cleanText(replyRaw || "");
  r = ensureForwardMotion(r, session);
  r = addMomentumTail(session, r);
  return cleanText(r);
}

/* ======================================================
   Assertive Finisher (respondJson layer)
====================================================== */

function _afHasYear(session) {
  return !!(session && clampYear(Number(session.lastYear)));
}

function _afHasMode(session) {
  const m = cleanText(
    session && (session.activeMusicMode || session.pendingMode)
      ? session.activeMusicMode || session.pendingMode
      : ""
  ).toLowerCase();
  return !!m && (m.includes("top") || m.includes("story") || m.includes("micro"));
}

function _afModeLabel(session) {
  const m = cleanText(
    session && (session.activeMusicMode || session.pendingMode)
      ? session.activeMusicMode || session.pendingMode
      : ""
  ).toLowerCase();
  if (m.includes("top")) return "Top 10";
  if (m.includes("story")) return "Story moment";
  if (m.includes("micro")) return "Micro moment";
  return "Top 10";
}

function _afLooksLikeQuestion(reply) {
  const t = cleanText(reply).toLowerCase();
  if (!t) return false;
  if (t.endsWith("?")) return true;
  if (t.includes("what would you like") || t.includes("which would you like")) return true;
  if (t.includes("give me a year") || t.includes("pick a year") || t.includes("choose a year"))
    return true;
  if (
    t.includes("choose a mode") ||
    t.includes("pick a mode") ||
    (t.includes("top 10") && t.includes("story moment") && t.includes("micro moment"))
  )
    return true;
  return false;
}

function _afWantsYear(reply) {
  const t = cleanText(reply).toLowerCase();
  return (
    t.includes("give me a year") ||
    t.includes("pick a year") ||
    t.includes("choose a year") ||
    t.includes("drop a year") ||
    t.includes("year (1950")
  );
}

function _afWantsMode(reply) {
  const t = cleanText(reply).toLowerCase();
  return (
    (t.includes("choose") || t.includes("pick") || t.includes("select")) &&
    (t.includes("top 10") || t.includes("story") || t.includes("micro"))
  );
}

function _afDedupeChips(chips) {
  const seen = new Set();
  const out = [];
  for (const c of chips || []) {
    const label = cleanText(c && c.label);
    const send = cleanText(c && c.send);
    const k = (label + "||" + send).toLowerCase();
    if (!label || !send) continue;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ label, send });
  }
  return out;
}

function assertiveFinisher({ reply, followUps, session }) {
  let r = String(reply || "");
  let chips = Array.isArray(followUps) ? followUps : [];

  const hasYear = _afHasYear(session);
  const hasMode = _afHasMode(session);

  // Rewrite hovering prompts if context already exists
  if (hasYear && _afWantsYear(r)) {
    r = `Locked in ${Number(session.lastYear)}.`;
  }
  if (hasMode && _afWantsMode(r)) {
    r = `Got it — ${_afModeLabel(session)}.`;
  }

  // Inject deterministic chip sets if missing/weak
  if (!chips || chips.length < 2) {
    if (!hasYear) {
      chips = [
        { label: "1950s", send: "1950" },
        { label: "1970s", send: "1970" },
        { label: "1990s", send: "1990" },
        { label: "2010s", send: "2010" },
        { label: "Pick for me", send: "random year" },
      ];
      if (!cleanText(r)) r = "Pick a year (1950–2024). Want a quick jump?";
    } else if (!hasMode) {
      chips = [
        { label: "Top 10", send: "Top 10" },
        { label: "Story moment", send: "Story moment" },
        { label: "Micro moment", send: "Micro moment" },
        { label: "Another year", send: "another year" },
      ];
      if (!cleanText(r) || _afLooksLikeQuestion(r)) r = `Got ${Number(session.lastYear)}. Choose one:`;
    } else {
      const y = Number(session.lastYear);
      chips = [
        { label: "Replay last", send: "replay" },
        { label: "Another year", send: "another year" },
        { label: "Switch mode", send: "switch" },
        { label: "Top 10", send: "Top 10" },
        { label: "Story moment", send: "Story moment" },
        { label: "Micro moment", send: "Micro moment" },
      ];
      if (_afLooksLikeQuestion(r)) {
        r = `Locked in ${y} — ${_afModeLabel(session)}. Say “switch” to change mode.`;
      }
    }
  }

  chips = _afDedupeChips(chips);

  // Minimum bar: ensure at least 3 chips if we have any chips at all
  if (chips.length > 0 && chips.length < 3) {
    chips = _afDedupeChips(
      chips.concat([
        { label: "Another year", send: "another year" },
        { label: "Replay last", send: "replay" },
        { label: "Switch mode", send: "switch" },
      ])
    );
  }

  return { reply: r, followUps: chips };
}

/* ======================================================
   Visitor Profiles (tight)
====================================================== */

const PROFILES = new Map();
const PROFILE_TTL_MS = Number(process.env.PROFILE_TTL_MS || 30 * 24 * 60 * 60 * 1000);
const PROFILE_CLEAN_INTERVAL_MS = Math.max(
  10 * 60 * 1000,
  Math.min(60 * 60 * 1000, Math.floor(PROFILE_TTL_MS / 12))
);

function getProfile(visitorId) {
  const vid = cleanText(visitorId || "");
  if (!vid) return null;

  if (!PROFILES.has(vid)) {
    PROFILES.set(vid, {
      id: vid,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      lastSeenAt: Date.now(),
      visits: 0,

      name: "",

      lastLane: "general",
      lastMusicYear: null,
      lastMusicMode: null,
      lastHadReply: false,
    });
  }

  const p = PROFILES.get(vid);
  p.updatedAt = Date.now();
  p.lastSeenAt = Date.now();
  return p;
}

function profileIsReturning(profile) {
  return !!profile && Number(profile.visits || 0) >= 2;
}

function detectNameFromText(text) {
  const t = cleanText(text);
  if (!t) return null;
  const m = t.match(/\b(?:i[' ]?m|i am|im|my name is)\s+([A-Za-z][A-Za-z\-']{1,30})\b/i);
  if (!m) return null;
  const raw = cleanText(m[1] || "");
  if (!raw) return null;
  const name = raw.charAt(0).toUpperCase() + raw.slice(1);
  if (name.length < 2) return null;
  return name;
}

function updateProfileFromSession(profile, session) {
  if (!profile || !session) return;

  profile.lastLane = session.lane || profile.lastLane || "general";
  profile.lastHadReply = !!session.lastReply;

  if (clampYear(Number(session.lastYear))) profile.lastMusicYear = Number(session.lastYear);
  if (session.activeMusicMode) profile.lastMusicMode = session.activeMusicMode;

  profile.updatedAt = Date.now();
}

const profileCleaner = setInterval(() => {
  const cutoff = Date.now() - PROFILE_TTL_MS;
  for (const [vid, p] of PROFILES.entries()) {
    const u = Number(p && p.updatedAt ? p.updatedAt : 0);
    if (!p || u < cutoff) PROFILES.delete(vid);
  }
}, PROFILE_CLEAN_INTERVAL_MS);
try {
  if (typeof profileCleaner.unref === "function") profileCleaner.unref();
} catch (_) {}

/* ======================================================
   Sessions
====================================================== */

const SESSIONS = new Map();

function issueSessionId() {
  return `s_${rid()}_${Date.now().toString(36)}`;
}

function getSession(sessionId) {
  const sid = String(sessionId || "").trim();
  if (!sid) return null;

  if (!SESSIONS.has(sid)) {
    if (MAX_SESSIONS > 0 && SESSIONS.size >= MAX_SESSIONS) {
      let oldestKey = null;
      let oldestUpdated = Infinity;
      for (const [k, v] of SESSIONS.entries()) {
        const u = Number(v && v.updatedAt ? v.updatedAt : 0);
        if (u < oldestUpdated) {
          oldestUpdated = u;
          oldestKey = k;
        }
      }
      if (oldestKey) SESSIONS.delete(oldestKey);
    }

    const s0 = {
      id: sid,
      createdAt: Date.now(),
      updatedAt: Date.now(),

      visitorId: null,

      lastYear: null,
      activeMusicMode: null,
      pendingMode: null,

      // musicKnowledge-compatible fields (bridge)
      lastMusicYear: null,
      lastMusicChart: DEFAULT_CHART,
      activeMusicChart: DEFAULT_CHART,

      // lanes
      lane: "general",

      // schedule lane state (timezone)
      userTz: null,
      userCity: null,

      lastReply: null,
      lastReplyAt: null,

      lastFollowUp: null,
      lastFollowUps: null,

      lastTop10One: null,
      lastIntent: null,
      lastEngine: null,

      voiceMode: "standard",

      _countedVisit: false,
      _fmp_lastAsk: null,

      // v1.5.17 autorun guard
      _fmpAutoRanAt: 0,

      // Cognitive OS (canonical)
      cogPhase: COG_PHASE.IDLE,
      cogState: COG_STATE.READY,
      cogReason: "",
      cogTs: 0,
      _cogLastAutoContinueAt: 0,
    };

    initCog(s0);
    SESSIONS.set(sid, s0);
  }

  const s = SESSIONS.get(sid);
  s.updatedAt = Date.now();
  initCog(s);
  return s;
}

const SESSION_TTL_MS = Number(process.env.SESSION_TTL_MS || 6 * 60 * 60 * 1000);
const CLEAN_INTERVAL_MS = Math.max(
  60 * 1000,
  Math.min(15 * 60 * 1000, Math.floor(SESSION_TTL_MS / 4))
);

const cleaner = setInterval(() => {
  const cutoff = Date.now() - SESSION_TTL_MS;
  for (const [sid, s] of SESSIONS.entries()) {
    if (!s || (s.updatedAt || 0) < cutoff) SESSIONS.delete(sid);
  }
}, CLEAN_INTERVAL_MS);
try {
  if (typeof cleaner.unref === "function") cleaner.unref();
} catch (_) {}

/* ======================================================
   Optional modules
====================================================== */

let musicKnowledge = null;
try {
  musicKnowledge = require("./Utils/musicKnowledge");
} catch {
  musicKnowledge = null;
}

let sponsorsLane = null;
try {
  sponsorsLane = require("./Utils/sponsorsLane");
} catch {
  sponsorsLane = null;
}

let moviesLane = null;
try {
  moviesLane = require("./Utils/moviesLane");
} catch {
  moviesLane = null;
}

let scheduleLane = null;
try {
  scheduleLane = require("./Utils/scheduleLane");
} catch {
  scheduleLane = null;
}

/* ======================================================
   TTS (kept as-is)
====================================================== */

const TTS_ENABLED = String(process.env.TTS_ENABLED || "true") === "true";
const TTS_PROVIDER = String(process.env.TTS_PROVIDER || "elevenlabs");
const ELEVEN_KEY = String(process.env.ELEVENLABS_API_KEY || "");
const ELEVEN_VOICE_ID = String(process.env.ELEVENLABS_VOICE_ID || "");
const ELEVEN_MODEL_ID = String(process.env.ELEVENLABS_MODEL_ID || "eleven_multilingual_v2");

const ELEVEN_TTS_TIMEOUT_MS = Math.max(
  8000,
  Math.min(60000, Number(process.env.ELEVEN_TTS_TIMEOUT_MS || 25000))
);

function normalizeVoiceMode(m) {
  const t = String(m || "").toLowerCase().trim();
  if (t === "calm") return "calm";
  if (t === "high" || t === "highenergy" || t === "high-energy") return "high";
  return "standard";
}

function getTtsTuningForMode(voiceMode) {
  const base = {
    stability: Number(process.env.NYX_VOICE_STABILITY ?? 0.55),
    similarity: Number(process.env.NYX_VOICE_SIMILARITY ?? 0.78),
    style: Number(process.env.NYX_VOICE_STYLE ?? 0.12),
    speakerBoost: String(process.env.NYX_VOICE_SPEAKER_BOOST ?? "false") === "true",
  };

  const m = normalizeVoiceMode(voiceMode);

  if (m === "calm") {
    return {
      ...base,
      stability: Math.min(1, base.stability + 0.15),
      style: Math.max(0, base.style - 0.08),
      speakerBoost: false,
    };
  }

  if (m === "high") {
    return {
      ...base,
      stability: Math.max(0, base.stability - 0.12),
      style: Math.min(1, base.style + 0.18),
      speakerBoost: true,
    };
  }

  return base;
}

async function elevenTtsMp3Buffer(text, voiceMode) {
  const tuning = getTtsTuningForMode(voiceMode);

  const url = `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(
    ELEVEN_VOICE_ID
  )}`;

  const body = {
    text,
    model_id: ELEVEN_MODEL_ID,
    voice_settings: {
      stability: tuning.stability,
      similarity_boost: tuning.similarity,
      style: tuning.style,
      use_speaker_boost: tuning.speakerBoost,
    },
  };

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), ELEVEN_TTS_TIMEOUT_MS);

  try {
    const r = await fetch(url, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "xi-api-key": ELEVEN_KEY,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
        Connection: "keep-alive",
      },
      body: JSON.stringify(body),
    });

    if (!r.ok) {
      const errText = await r.text().catch(() => "");
      return { ok: false, status: r.status, detail: errText.slice(0, 1200) };
    }

    const buf = Buffer.from(await r.arrayBuffer());
    return { ok: true, buf };
  } catch (e) {
    const msg = String(e && e.message ? e.message : e);
    const isAbort =
      msg.toLowerCase().includes("aborted") ||
      msg.toLowerCase().includes("abort") ||
      msg.toLowerCase().includes("timeout");
    return {
      ok: false,
      status: isAbort ? 504 : 502,
      detail: isAbort
        ? `Upstream timeout after ${ELEVEN_TTS_TIMEOUT_MS}ms`
        : msg,
    };
  } finally {
    clearTimeout(t);
  }
}

/* ======================================================
   Mic Feedback Guard (kept)
====================================================== */

const MIC_GUARD_ENABLED = String(process.env.MIC_GUARD_ENABLED || "true") === "true";
const MIC_GUARD_WINDOW_MS = Math.max(
  2000,
  Math.min(20000, Number(process.env.MIC_GUARD_WINDOW_MS || 9000))
);
const MIC_GUARD_MIN_CHARS = Math.max(
  24,
  Math.min(240, Number(process.env.MIC_GUARD_MIN_CHARS || 60))
);

function normalizeForEchoCompare(s) {
  return cleanText(String(s || ""))
    .toLowerCase()
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[^\p{L}\p{N}\s#]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isLikelyMicEcho(incomingText, session) {
  if (!MIC_GUARD_ENABLED) return false;
  if (!session || !session.lastReply || !session.lastReplyAt) return false;

  const dt = Date.now() - Number(session.lastReplyAt || 0);
  if (!Number.isFinite(dt) || dt < 0 || dt > MIC_GUARD_WINDOW_MS) return false;

  const inc = normalizeForEchoCompare(incomingText);
  const last = normalizeForEchoCompare(session.lastReply);

  if (!inc || !last) return false;
  if (inc.length < MIC_GUARD_MIN_CHARS) return false;

  if (inc === last) return true;
  if (inc.includes(last) && last.length >= MIC_GUARD_MIN_CHARS) return true;
  if (last.includes(inc) && inc.length >= MIC_GUARD_MIN_CHARS) return true;

  const incW = inc.split(" ").filter(Boolean);
  const lastW = last.split(" ").filter(Boolean);
  if (incW.length >= 12 && lastW.length >= 12) {
    const a = incW.slice(0, 12).join(" ");
    const b = lastW.slice(0, 12).join(" ");
    if (a === b) return true;
  }

  return false;
}

function micEchoBreakerReply() {
  return "I’m picking up my own audio (mic feedback). Tap a follow-up chip, or type a year (1950–2024) plus: Top 10 / Story moment / Micro moment.";
}

/* ======================================================
   Music helpers
====================================================== */

function extractYearFromText(s) {
  const m = String(s || "").match(/\b(19[5-9]\d|20[0-1]\d|202[0-4])\b/);
  return m ? Number(m[1]) : null;
}

function isBareYearMessage(text) {
  const t = cleanText(text);
  return /^\s*(19[5-9]\d|20[0-1]\d|202[0-4])\s*$/.test(t);
}

function normalizeModeToken(text) {
  const t = cleanText(text).toLowerCase();
  if (/\b(top\s*10|top10|top ten)\b/.test(t)) return "top10";
  if (/\b(story\s*moment|story)\b/.test(t)) return "story";
  if (/\b(micro\s*moment|micro)\b/.test(t)) return "micro";
  return null;
}

function modeToCommand(mode) {
  if (mode === "top10") return "top 10";
  if (mode === "story") return "story moment";
  if (mode === "micro") return "micro moment";
  return "top 10";
}

function isExplicitTop10WithYear(text) {
  const t = cleanText(text).toLowerCase();
  return (
    /\btop\s*(10|ten)\s*(19[5-9]\d|20[0-1]\d|202[0-4])\b/.test(t) ||
    /\btop10\s*(19[5-9]\d|20[0-1]\d|202[0-4])\b/.test(t)
  );
}

/* ======================================================
   Explicit Lane Command + Lane Exit
====================================================== */

function explicitLaneCommand(text) {
  const t = cleanText(text).toLowerCase();
  if (!t) return null;

  if (/^(movies\s+lane|movie\s+lane|movies)\s*$/.test(t)) return "movies";
  if (
    /^(sponsors?\s+lane|sponsor\s+lane|sponsors?|advertising|advertise|sponsorship)\s*$/.test(
      t
    )
  )
    return "sponsors";
  if (
    /^(schedule\s+lane|programming\s+lane|roku\s+lane|schedule|programming)\s*$/.test(
      t
    )
  )
    return "schedule";
  if (/^(music\s+lane|back\s+to\s+music|return\s+to\s+music|music)\s*$/.test(t))
    return "music";

  return null;
}

function isLaneExitCommand(text) {
  const t = cleanText(text).toLowerCase();
  if (!t) return false;

  if (/^(switch|switch\s+mode|exit|exit\s+lane|leave|leave\s+lane|back)\s*$/.test(t))
    return true;
  if (/^(back\s+to\s+music|return\s+to\s+music)\s*$/.test(t)) return true;

  return false;
}

/* ======================================================
   Nav tokens
====================================================== */

function normalizeNavToken(text) {
  const t = cleanText(text).toLowerCase();
  if (!t) return null;

  if (/^(replay|repeat|again|say that again|one more time|replay last)\b/.test(t))
    return "replay";
  if (/^(continue|resume|pick up|carry on|go on)\b/.test(t)) return "continue";
  if (/^(start fresh|restart|new start|reset)\b/.test(t)) return "fresh";

  if (/^(#\s*1|number\s*1|number\s*one|no\.?\s*1|the\s*#\s*1)\b/.test(t))
    return "numberOne";

  if (/^(next|next year|forward|year\+1)\b/.test(t)) return "nextYear";

  if (/^(prev|prev year|previous|previous year|back|year-1)\b/.test(t)) return "prevYear";

  if (/^(another year|new year|different year)\b/.test(t)) return "anotherYear";

  return null;
}

function isGreeting(text) {
  const t = cleanText(text).toLowerCase();
  if (!t) return false;
  return (
    /^(hi|hey|hello|yo|sup|greetings)\b/.test(t) ||
    /^(hi\s+nyx|hey\s+nyx|hello\s+nyx)\b/.test(t)
  );
}

function greetingReply(profile, canContinue) {
  const returning = profileIsReturning(profile);
  const name = profile && cleanText(profile.name) ? cleanText(profile.name) : "";

  if (!returning) {
    return "Hi — welcome to Sandblast. I’m Nyx. Drop a year (1950–2024). Then choose: Top 10, Story moment, or Micro moment.";
  }

  const who = name ? `Welcome back, ${name}.` : "Welcome back.";
  if (canContinue)
    return `${who} I can continue where we left off—tap “Continue”, or drop a year to pivot.`;
  return `${who} Tap “Start fresh”, or drop a year to jump in.`;
}

function replyMissingYearForMode(mode) {
  if (mode === "top10") return "Drop a year (1950–2024) for your Top 10.";
  if (mode === "story") return "Drop a year (1950–2024) for the story moment.";
  if (mode === "micro") return "Drop a year (1950–2024) for the micro moment.";
  return "Drop a year (1950–2024).";
}

/* ======================================================
   #1 extraction (deterministic fallback)
====================================================== */

function extractNumberOneFromTop10Reply(replyText) {
  const t = String(replyText || "");

  let m =
    t.match(/(?:^|\s)1\.\s*([^—\n]+?)\s*—\s*([^\n]+?)(?=(?:\s+2\.)|\n|$)/) ||
    t.match(/(?:^|\s)1\)\s*([^—\n]+?)\s*—\s*([^\n]+?)(?=(?:\s+2\))|\n|$)/) ||
    t.match(/(?:^|\s)#1\s*[:\-]?\s*([^—\n]+?)\s*—\s*([^\n]+?)(?:\n|$)/i);

  if (!m) return null;

  const artist = cleanText(m[1] || "");
  const title = cleanText(m[2] || "");
  if (!artist || !title) return null;

  return { artist, title };
}

function numberOneFollowUps(year) {
  const y = clampYear(Number(year)) || 1988;
  return [
    { label: "Top 10", send: `top 10 ${y}` },
    { label: `Story moment ${y}`, send: `story moment ${y}` },
    { label: `Micro moment ${y}`, send: `micro moment ${y}` },
    { label: "Another year", send: "Another year" },
    { label: "Replay last", send: "Replay last" },
  ];
}

/* ======================================================
   Music engine wrapper (bridged + TOP10 Missing Escape)
====================================================== */

async function runMusicEngine(text, session) {
  if (!musicKnowledge || typeof musicKnowledge.handleChat !== "function") {
    return {
      reply:
        "Drop a year (1950–2024). Then choose: Top 10, Story moment, or Micro moment.",
    };
  }

  try {
    preEngineBridge(session);

    const y = clampYear(extractYearFromText(text));
    if (y) guardChartForYear(session, y);

    const out = musicKnowledge.handleChat({ text, session }) || {};

    if (out.sessionPatch && typeof out.sessionPatch === "object") {
      Object.assign(session, out.sessionPatch);
    }

    postEngineBridge(session);

    const reply0 = cleanText(out.reply || "");
    const modeReq =
      normalizeModeToken(text) ||
      session.activeMusicMode ||
      session.pendingMode ||
      null;
    const yearReq = clampYear(
      Number(y || session.lastYear || session.lastMusicYear)
    );

    if (modeReq === "top10" && yearReq && looksLikeTop10Missing(reply0)) {
      session.lane = "music";
      session.activeMusicMode = "story";
      session.pendingMode = null;
      session.lastYear = yearReq;
      session.lastMusicYear = yearReq;

      guardChartForYear(session, yearReq);
      preEngineBridge(session);

      setCog(session, "execute", "running", "top10Missing:storyFallback");

      const out2 =
        musicKnowledge.handleChat({
          text: `story moment ${yearReq}`,
          session,
        }) || {};

      if (out2.sessionPatch && typeof out2.sessionPatch === "object") {
        Object.assign(session, out2.sessionPatch);
      }

      postEngineBridge(session);

      const storyReply = cleanText(out2.reply || "");
      const preface = top10MissingPreface(yearReq);
      const stitched = storyReply ? `${preface}\n\n${storyReply}` : preface;

      return Object.assign({}, out2, {
        reply: stitched,
        followUps: top10MissingFollowUps(yearReq),
      });
    }

    return out;
  } catch (e) {
    return {
      reply:
        "I hit a snag in the music engine. Drop a year (1950–2024) and I’ll rerun it.",
      error: String(e && e.message ? e.message : e),
    };
  }
}

/* ======================================================
   Lane engine wrappers
====================================================== */

function isSponsorsActive(session, message) {
  if (!sponsorsLane) return false;
  if (session && session.lane === "sponsors") return true;
  if (typeof sponsorsLane.isSponsorIntent === "function" && message)
    return !!sponsorsLane.isSponsorIntent(message);
  return false;
}

function isMoviesActive(session, message) {
  if (!moviesLane) return false;
  if (session && session.lane === "movies") return true;
  if (typeof moviesLane.isMoviesIntent === "function" && message)
    return !!moviesLane.isMoviesIntent(message);
  return false;
}

function isScheduleActive(session, message) {
  if (!scheduleLane) return false;
  if (session && session.lane === "schedule") return true;
  if (typeof scheduleLane.isScheduleQuestion === "function" && message) {
    return !!scheduleLane.isScheduleQuestion(message);
  }
  return false;
}

async function runSponsorsLane(text, session) {
  if (!sponsorsLane || typeof sponsorsLane.handleChat !== "function") {
    return {
      reply: "Sponsors Lane isn’t available in this build.",
      followUps: [{ label: "Back to music", send: "Back to music" }],
    };
  }
  try {
    const out = sponsorsLane.handleChat({ text, session }) || {};
    if (out.sessionPatch && typeof out.sessionPatch === "object")
      Object.assign(session, out.sessionPatch);
    session.lane = "sponsors";
    setCog(session, "handoff", "active", "lane:sponsors");
    return out;
  } catch (e) {
    session.lane = "sponsors";
    setCog(session, "handoff", "active", "lane:sponsors:error");
    return {
      reply:
        "Sponsors Lane hit an error. State your goal (calls / foot traffic / website clicks / brand awareness).",
      error: String(e && e.message ? e.message : e),
    };
  }
}

async function runMoviesLane(text, session) {
  if (!moviesLane || typeof moviesLane.handleChat !== "function") {
    return {
      reply: "Movies Lane isn’t available in this build.",
      followUps: [{ label: "Back to music", send: "Back to music" }],
    };
  }
  try {
    const out = moviesLane.handleChat({ text, session }) || {};
    if (out.sessionPatch && typeof out.sessionPatch === "object")
      Object.assign(session, out.sessionPatch);
    session.lane = "movies";
    setCog(session, "handoff", "active", "lane:movies");
    return out;
  } catch (e) {
    session.lane = "movies";
    setCog(session, "handoff", "active", "lane:movies:error");
    return {
      reply: "Movies Lane hit an error. Say “Movies Lane” or paste a movie URL.",
      error: String(e && e.message ? e.message : e),
    };
  }
}

async function runScheduleLane(text, session) {
  if (!scheduleLane || typeof scheduleLane.handleChat !== "function") {
    return {
      reply: "Schedule Lane isn’t available in this build.",
      followUps: [{ label: "Back to music", send: "Back to music" }],
    };
  }
  try {
    const out = scheduleLane.handleChat({ text, session }) || {};
    if (out.sessionPatch && typeof out.sessionPatch === "object")
      Object.assign(session, out.sessionPatch);
    session.lane = "schedule";
    setCog(session, "handoff", "active", "lane:schedule");
    return out;
  } catch (e) {
    session.lane = "schedule";
    setCog(session, "handoff", "active", "lane:schedule:error");
    return {
      reply:
        "Schedule Lane hit an error. Try: “What time does Gospel Sunday play in London?”",
      error: String(e && e.message ? e.message : e),
    };
  }
}

async function runEngine(text, session) {
  if (isScheduleActive(session, text)) return runScheduleLane(text, session);
  if (isSponsorsActive(session, text)) return runSponsorsLane(text, session);
  if (isMoviesActive(session, text)) return runMoviesLane(text, session);

  if (session) {
    session.lane = "music";
    const c = deriveCogFromSession(session);
    setCog(session, c.phase, c.state, c.reason);
  }
  return runMusicEngine(text, session);
}

/* ======================================================
   Followups
====================================================== */

function hasMeaningfulResumeState(profile, session) {
  const profOk =
    !!profile &&
    !!clampYear(Number(profile.lastMusicYear)) &&
    !!profile.lastMusicMode;

  const sesYear = !!(session && clampYear(Number(session.lastYear)));
  const sesMode = !!(session && session.activeMusicMode);
  const sesPairOk = sesYear && sesMode;

  const contentfulIntents = new Set([
    "top10",
    "story",
    "micro",
    "continue",
    "passthrough",
    "numberOne",
  ]);
  const sesIntentOk =
    !!session &&
    !!session.lastIntent &&
    contentfulIntents.has(String(session.lastIntent)) &&
    sesYear;

  const sesTopOneOk = !!(session && session.lastTop10One && sesYear);

  return profOk || sesPairOk || sesIntentOk || sesTopOneOk;
}

function canResume(profile, session) {
  return hasMeaningfulResumeState(profile, session);
}

function makeFollowUpsTight(session, profile) {
  const returning = profileIsReturning(profile);
  const resumable = canResume(profile, session);

  if (returning) {
    const personal = resumable ? "Continue" : "Start fresh";
    const four = [
      { label: personal, send: personal },
      { label: "Top 10", send: "Top 10" },
      { label: "Story moment", send: "Story moment" },
      { label: "Micro moment", send: "Micro moment" },
    ];
    return {
      followUp: four.map((x) => x.label),
      followUps: four,
      resumable,
      returning: true,
    };
  }

  const base = [];
  const hasYear = !!(session && clampYear(Number(session.lastYear)));
  base.push(
    hasYear ? String(Number(session.lastYear)) : "1950",
    "Top 10",
    "Story moment",
    "Micro moment"
  );

  if (hasYear) {
    const py = safeIncYear(Number(session.lastYear), -1);
    const ny = safeIncYear(Number(session.lastYear), +1);
    if (py) base.push("Prev year");
    if (ny) base.push("Next year");
    base.push("Another year");
  }

  const intent = session ? String(session.lastIntent || "") : "";
  const isFirstGreeting =
    intent === "greeting" && !hasMeaningfulResumeState(profile, session);

  if (session && session.lastReply && !isFirstGreeting) base.push("Replay last");

  const out = [];
  for (const x of base) if (x && !out.includes(x)) out.push(x);

  const primary = out.slice(0, 8);
  return {
    followUp: primary,
    followUps: primary.map((x) => ({ label: x, send: x })),
    resumable,
    returning: false,
  };
}

function canonicalizeNavChip(it) {
  if (!it || typeof it !== "object") return it;
  const send = cleanText(it.send || "");
  const label = cleanText(it.label || "");
  const s = send.toLowerCase();
  const l = label.toLowerCase();

  const isPrev =
    s === "prev year" ||
    s === "previous year" ||
    l === "prev year" ||
    l === "previous year";

  const isNext = s === "next year" || l === "next year";

  if (isPrev) return { label: "Prev year", send: "Prev year" };
  if (isNext) return { label: "Next year", send: "Next year" };
  return it;
}

function normalizeEngineFollowups(out) {
  const push = (acc, v) => {
    if (!v) return;
    if (typeof v === "string") {
      const s = cleanText(v);
      if (s) acc.push(canonicalizeNavChip({ label: s, send: s }));
      return;
    }
    if (typeof v === "object") {
      const label = cleanText(
        v.label || v.text || v.title || v.send || v.value || ""
      );
      const send = cleanText(v.send || v.value || v.payload || v.label || v.text || "");
      if (label && send) acc.push(canonicalizeNavChip({ label, send }));
    }
  };

  const acc = [];
  if (!out || typeof out !== "object") return acc;

  const cands = [out.followUps, out.followups, out.followUp, out.followup].filter(Boolean);
  for (const c of cands) {
    if (Array.isArray(c)) c.forEach((x) => push(acc, x));
    else push(acc, c);
  }

  const seen = new Set();
  const out2 = [];
  for (const it of acc) {
    const k = cleanText(it.send).toLowerCase();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out2.push(it);
  }
  return out2.slice(0, 12);
}

function ensureLaneEscapeChips(merged) {
  const hasBack = merged.some(
    (x) => cleanText(x.send).toLowerCase() === "back to music"
  );
  if (!hasBack) merged.push({ label: "Back to music", send: "Back to music" });
  return merged;
}

/* ======================================================
   respondJson (includes Assertive Finisher + FINAL COG SYNC)
====================================================== */

function respondJson(req, res, base, session, engineOut, profile, forceFourChips) {
  const tight = makeFollowUpsTight(session, profile);
  const enforceReturning = !!forceFourChips && !!tight.returning;

  const lane = session && session.lane ? String(session.lane) : "general";
  const laneOwned = lane === "sponsors" || lane === "movies" || lane === "schedule";

  // Returning visitors: EXACTLY 4 chips (preserve canonical behavior). Skip finisher.
  if (enforceReturning) {
    const payload = Object.assign({}, base, {
      followUps: tight.followUps,
      followUp: tight.followUp,
    });

    // v1.5.21: FINAL cog sync after finalizeReply
    try {
      const cFinal = deriveCogFromFinalReply(session, payload.reply);
      setCog(session, cFinal.phase, cFinal.state, cFinal.reason);
    } catch (_) {}

    attachCogToPayload(payload, session);

    const wantsDebug = CHAT_DEBUG || parseDebugFlag(req);
    if (wantsDebug) {
      payload.debug = {
        index: INDEX_VERSION,
        profile: profile
          ? {
              id: profile.id,
              name: profile.name || "",
              returning: profileIsReturning(profile),
              lastLane: profile.lastLane,
              lastMusicYear: profile.lastMusicYear || null,
              lastMusicMode: profile.lastMusicMode || null,
              visits: profile.visits || 0,
            }
          : null,
        state: {
          lastYear: session ? session.lastYear : null,
          activeMusicMode: session ? session.activeMusicMode : null,
          pendingMode: session ? session.pendingMode : null,
          activeMusicChart: session ? session.activeMusicChart : null,
          lane: session ? session.lane : null,
          voiceMode: session ? session.voiceMode : null,
          lastIntent: session ? session.lastIntent : null,
          userTz: session ? session.userTz : null,
          userCity: session ? session.userCity : null,
          cog: session
            ? {
                phase: session.cogPhase,
                state: session.cogState,
                reason: session.cogReason,
                ts: session.cogTs,
              }
            : null,
        },
        resume: { resumable: tight.resumable, forcedFourChips: true },
      };
    }

    if (session) {
      try {
        session.lastFollowUp = Array.isArray(payload.followUp)
          ? payload.followUp.slice(0, 12)
          : null;
        session.lastFollowUps = Array.isArray(payload.followUps)
          ? payload.followUps.slice(0, 12)
          : null;
      } catch (_) {}
    }

    return res.json(payload);
  }

  const engineNorm = normalizeEngineFollowups(engineOut);

  if (laneOwned) {
    const merged = [];
    const seen = new Set();
    const add = (it) => {
      if (!it || !it.label || !it.send) return;
      const k = cleanText(it.send).toLowerCase();
      if (!k || seen.has(k)) return;
      seen.add(k);
      merged.push({ label: it.label, send: it.send });
    };

    for (const it of engineNorm) {
      if (merged.length >= 7) break;
      add(it);
    }

    if (merged.length === 0) merged.push({ label: "Replay last", send: "Replay last" });
    ensureLaneEscapeChips(merged);

    let payload = Object.assign({}, base, {
      followUps: merged.slice(0, 8),
      followUp: merged.slice(0, 8).map((x) => x.label),
    });

    // Assertive Finisher (lane-owned too): guarantees chips if missing/weak
    try {
      const fin = assertiveFinisher({
        reply: payload.reply,
        followUps: payload.followUps,
        session,
      });
      payload.reply = finalizeReply(session, fin.reply);
      payload.followUps = fin.followUps;
      payload.followUp = (fin.followUps || []).map((x) => x.label);
    } catch (_) {
      payload.reply = finalizeReply(session, payload.reply);
    }

    // v1.5.21: FINAL cog sync after finalizeReply
    try {
      const cFinal = deriveCogFromFinalReply(session, payload.reply);
      setCog(session, cFinal.phase, cFinal.state, cFinal.reason);
    } catch (_) {}

    attachCogToPayload(payload, session);

    const wantsDebug = CHAT_DEBUG || parseDebugFlag(req);
    if (wantsDebug) {
      payload.debug = {
        index: INDEX_VERSION,
        laneOwned: true,
        state: {
          lane: session ? session.lane : null,
          lastYear: session ? session.lastYear : null,
          voiceMode: session ? session.voiceMode : null,
          lastIntent: session ? session.lastIntent : null,
          userTz: session ? session.userTz : null,
          userCity: session ? session.userCity : null,
          cog: session
            ? {
                phase: session.cogPhase,
                state: session.cogState,
                reason: session.cogReason,
                ts: session.cogTs,
              }
            : null,
        },
      };
    }

    if (session) {
      try {
        session.lastFollowUp = Array.isArray(payload.followUp)
          ? payload.followUp.slice(0, 12)
          : null;
        session.lastFollowUps = Array.isArray(payload.followUps)
          ? payload.followUps.slice(0, 12)
          : null;
      } catch (_) {}
    }

    return res.json(payload);
  }

  const merged = [];
  const seen = new Set();
  const add = (it) => {
    if (!it || !it.label || !it.send) return;
    const k = cleanText(it.send).toLowerCase();
    if (!k || seen.has(k)) return;
    seen.add(k);
    merged.push({ label: it.label, send: it.send });
  };

  for (const it of engineNorm) {
    if (merged.length >= 8) break;
    add(it);
  }

  if (merged.length < 8) {
    for (const it of tight.followUps) {
      if (merged.length >= 8) break;
      add(it);
    }
  }

  let payload = Object.assign({}, base, {
    followUps: merged.slice(0, 8),
    followUp: merged.slice(0, 8).map((x) => x.label),
  });

  // Assertive Finisher: chips + de-hover questions
  try {
    const fin = assertiveFinisher({
      reply: payload.reply,
      followUps: payload.followUps,
      session,
    });
    payload.reply = finalizeReply(session, fin.reply);
    payload.followUps = fin.followUps;
    payload.followUp = (fin.followUps || []).map((x) => x.label);
  } catch (_) {
    payload.reply = finalizeReply(session, payload.reply);
  }

  // v1.5.21: FINAL cog sync after finalizeReply
  try {
    const cFinal = deriveCogFromFinalReply(session, payload.reply);
    setCog(session, cFinal.phase, cFinal.state, cFinal.reason);
  } catch (_) {}

  attachCogToPayload(payload, session);

  const wantsDebug = CHAT_DEBUG || parseDebugFlag(req);
  if (wantsDebug) {
    payload.debug = {
      index: INDEX_VERSION,
      profile: profile
        ? {
            id: profile.id,
            name: profile.name || "",
            returning: profileIsReturning(profile),
            lastLane: profile.lastLane,
            lastMusicYear: profile.lastMusicYear || null,
            lastMusicMode: profile.lastMusicMode || null,
            visits: profile.visits || 0,
          }
        : null,
      state: {
        lastYear: session ? session.lastYear : null,
        activeMusicMode: session ? session.activeMusicMode : null,
        pendingMode: session ? session.pendingMode : null,
        activeMusicChart: session ? session.activeMusicChart : null,
        lane: session ? session.lane : null,
        voiceMode: session ? session.voiceMode : null,
        lastIntent: session ? session.lastIntent : null,
        userTz: session ? session.userTz : null,
        userCity: session ? session.userCity : null,
        cog: session
          ? {
              phase: session.cogPhase,
              state: session.cogState,
              reason: session.cogReason,
              ts: session.cogTs,
            }
          : null,
      },
      resume: { resumable: tight.resumable, forcedFourChips: false },
    };
  }

  if (session) {
    try {
      session.lastFollowUp = Array.isArray(payload.followUp)
        ? payload.followUp.slice(0, 12)
        : null;
      session.lastFollowUps = Array.isArray(payload.followUps)
        ? payload.followUps.slice(0, 12)
        : null;
    } catch (_) {}
  }

  return res.json(payload);
}

/* ======================================================
   API: tts (unchanged)
====================================================== */

async function ttsHandler(req, res) {
  const requestId = req.get("X-Request-Id") || rid();
  res.set("X-Request-Id", requestId);
  res.set("X-Contract-Version", NYX_CONTRACT_VERSION);
  res.set("Cache-Control", "no-store");

  const body = safeJsonParse(req.body, req.rawBody);
  if (!body) {
    return res.status(400).json({
      ok: false,
      error: "BAD_REQUEST",
      detail: "INVALID_JSON",
      contentType: req.headers["content-type"] || null,
      rawPreview: String(req.rawBody || "").slice(0, 700),
      requestId,
      contractVersion: NYX_CONTRACT_VERSION,
    });
  }

  const text = cleanText(body.text || body.message || "");
  const sid = cleanText(body.sessionId || "");
  const s = sid ? getSession(sid) : null;

  const hasExplicitVoiceMode =
    Object.prototype.hasOwnProperty.call(body, "voiceMode") &&
    String(body.voiceMode || "").trim() !== "";

  const voiceMode = normalizeVoiceMode(
    hasExplicitVoiceMode ? body.voiceMode : (s && s.voiceMode) || "standard"
  );

  if (!TTS_ENABLED)
    return res.status(503).json({
      ok: false,
      error: "TTS_DISABLED",
      requestId,
      contractVersion: NYX_CONTRACT_VERSION,
    });
  if (TTS_PROVIDER !== "elevenlabs")
    return res.status(500).json({
      ok: false,
      error: "TTS_PROVIDER_UNSUPPORTED",
      provider: TTS_PROVIDER,
      requestId,
      contractVersion: NYX_CONTRACT_VERSION,
    });
  if (typeof fetch !== "function")
    return res.status(500).json({
      ok: false,
      error: "TTS_RUNTIME",
      detail: "fetch() not available",
      requestId,
      contractVersion: NYX_CONTRACT_VERSION,
    });
  if (!ELEVEN_KEY || !ELEVEN_VOICE_ID)
    return res.status(500).json({
      ok: false,
      error: "TTS_MISCONFIG",
      detail: "Missing ELEVENLABS env",
      requestId,
      contractVersion: NYX_CONTRACT_VERSION,
    });
  if (!text)
    return res.status(400).json({
      ok: false,
      error: "BAD_REQUEST",
      detail: "Missing text",
      requestId,
      contractVersion: NYX_CONTRACT_VERSION,
    });

  if (s && hasExplicitVoiceMode) s.voiceMode = voiceMode;

  try {
    const out = await elevenTtsMp3Buffer(text, voiceMode);
    if (!out.ok) {
      return res.status(502).json({
        ok: false,
        error: "TTS_UPSTREAM",
        upstreamStatus: out.status,
        upstreamBody: out.detail,
        requestId,
        contractVersion: NYX_CONTRACT_VERSION,
      });
    }

    const buf = out.buf || Buffer.alloc(0);
    if (!Buffer.isBuffer(buf) || buf.length < 1024) {
      return res.status(502).json({
        ok: false,
        error: "TTS_BAD_AUDIO",
        detail: `Audio payload too small (${buf.length} bytes)`,
        requestId,
        contractVersion: NYX_CONTRACT_VERSION,
      });
    }

    res.status(200);
    res.set("Content-Type", "audio/mpeg");
    res.set("Content-Length", String(buf.length));
    res.set("Cache-Control", "no-store");
    res.set("X-Voice-Mode", voiceMode);
    return res.end(buf);
  } catch (e) {
    return res.status(500).json({
      ok: false,
      error: "TTS_ERROR",
      detail: String(e && e.message ? e.message : e),
      requestId,
      contractVersion: NYX_CONTRACT_VERSION,
    });
  }
}

app.post("/api/tts", ttsHandler);
app.post("/api/voice", ttsHandler);

/* ======================================================
   Continue / Start fresh handlers (tight + assertive)
====================================================== */

async function handleContinue(session, profile) {
  const yFromSession = clampYear(
    session && session.lastYear ? Number(session.lastYear) : NaN
  );
  const yFromProfile = clampYear(
    profile && profile.lastMusicYear ? Number(profile.lastMusicYear) : NaN
  );
  const y = yFromSession || yFromProfile || null;

  const m =
    (session && session.activeMusicMode) || (profile && profile.lastMusicMode) || null;

  if (y && m) {
    session.lastYear = y;
    session.lastMusicYear = y;
    session.activeMusicMode = m;
    session.pendingMode = null;

    guardChartForYear(session, y);

    if (m === "top10") {
      session.activeMusicChart = YEAR_END_CHART;
      session.lastMusicChart = YEAR_END_CHART;
    }

    setCog(session, "execute", "running", "continue");
    const out0 = await runEngine(`${modeToCommand(m)} ${y}`, session);
    return await applyFmp(out0, session);
  }

  return {
    reply:
      "Continue is ready. Drop a year (1950–2024) or tap: Top 10 / Story moment / Micro moment.",
  };
}

function handleFresh(session) {
  session.lastYear = null;
  session.lastMusicYear = null;
  session.activeMusicMode = null;
  session.pendingMode = null;
  session.lastTop10One = null;

  session.activeMusicChart = DEFAULT_CHART;
  session.lastMusicChart = DEFAULT_CHART;

  session.lane = "music";
  setCog(session, "engage", "collect", "fresh");

  return {
    reply:
      "Clean slate. Drop a year (1950–2024). Then choose: Top 10, Story moment, or Micro moment.",
  };
}

/* ======================================================
   Nav handlers: nextYear / prevYear / anotherYear
====================================================== */

async function handleYearNav(session, direction) {
  const y0 = clampYear(Number(session.lastYear));
  const mode = session.activeMusicMode || session.pendingMode || null;

  if (!y0) {
    setCog(session, "engage", "collect", "need:year");
    return {
      reply:
        "Drop a year first (1950–2024). Then I can go next/previous year.",
    };
  }

  const y1 = safeIncYear(y0, direction);
  if (!y1) {
    setCog(session, "engage", "collect", "edge:range");
    return {
      reply:
        "You’re at the edge of the range. Pick a year between 1950 and 2024.",
    };
  }

  session.lastYear = y1;
  session.lastMusicYear = y1;

  guardChartForYear(session, y1);

  if (!mode) {
    session.pendingMode = null;
    setCog(session, "engage", "decide", "need:mode");
    return { reply: `Locked in ${y1}. Choose: Top 10, Story moment, or Micro moment.` };
  }

  session.activeMusicMode = mode;
  session.pendingMode = null;

  if (mode === "top10") {
    session.activeMusicChart = YEAR_END_CHART;
    session.lastMusicChart = YEAR_END_CHART;
  }

  setCog(session, "execute", "running", direction > 0 ? "nav:nextYear" : "nav:prevYear");
  const out0 = await runEngine(`${modeToCommand(mode)} ${y1}`, session);
  return await applyFmp(out0, session);
}

function handleAnotherYear(session) {
  const mode = session.pendingMode || session.activeMusicMode || null;

  session.lastYear = null;
  session.lastMusicYear = null;

  if (mode) {
    session.pendingMode = mode;
    setCog(session, "engage", "collect", "anotherYear:needYear");
    return { reply: replyMissingYearForMode(mode) };
  }

  setCog(session, "engage", "collect", "anotherYear");
  return {
    reply:
      "New year. Drop a year (1950–2024). Then choose: Top 10, Story moment, or Micro moment.",
  };
}

/* ======================================================
   #1 handler (deterministic)
====================================================== */

async function handleNumberOne(session) {
  const y0 = clampYear(Number(session.lastYear));
  if (!y0) {
    setCog(session, "engage", "collect", "need:year:#1");
    return { reply: "Drop a year (1950–2024) for #1." };
  }

  session.lane = "music";
  session.pendingMode = null;
  guardChartForYear(session, y0);
  setCog(session, "execute", "running", "numberOne");

  if (session.lastTop10One && typeof session.lastTop10One === "string") {
    return {
      reply: `#1 — ${cleanText(session.lastTop10One)} (${y0}).`,
      followUps: numberOneFollowUps(y0),
    };
  }

  const outA = await runEngine(`#1 ${y0}`, session);
  const outA2 = await applyFmp(outA, session);

  const rA = cleanText(outA2 && outA2.reply ? outA2.reply : "");
  if (rA && /(^|\s)#\s*1\b/i.test(rA)) {
    return Object.assign({}, outA2, { followUps: numberOneFollowUps(y0) });
  }

  const outB = await runEngine(`top 10 ${y0}`, session);
  const outB2 = await applyFmp(outB, session);
  const rB = cleanText(outB2 && outB2.reply ? outB2.reply : "");

  const one = extractNumberOneFromTop10Reply(rB);
  if (one) {
    session.lastTop10One = `${one.artist} — ${one.title}`;
    return {
      reply: `#1 — ${one.artist} — ${one.title} (${y0}).`,
      followUps: numberOneFollowUps(y0),
    };
  }

  return Object.assign({}, outB2, { followUps: numberOneFollowUps(y0) });
}

/* ======================================================
   API: chat
====================================================== */

app.post("/api/chat", async (req, res) => {
  const requestId = req.get("X-Request-Id") || rid();
  res.set("X-Request-Id", requestId);
  res.set("X-Contract-Version", NYX_CONTRACT_VERSION);
  res.set("Cache-Control", "no-store");

  const body = safeJsonParse(req.body, req.rawBody);
  if (!body) {
    return res.status(400).json({
      ok: false,
      error: "BAD_REQUEST",
      detail: "INVALID_JSON",
      contentType: req.headers["content-type"] || null,
      rawPreview: String(req.rawBody || "").slice(0, 700),
      requestId,
      contractVersion: NYX_CONTRACT_VERSION,
    });
  }

  const message = cleanText(body.message || body.text || "");
  let sessionId = cleanText(body.sessionId || "");
  const incomingVisitorId = cleanText(body.visitorId || "") || makeUuid();
  const incomingContract = cleanText(body.contractVersion || body.contract || "");

  if (CONTRACT_STRICT && incomingContract && incomingContract !== NYX_CONTRACT_VERSION) {
    return res.status(409).json({
      ok: false,
      error: "CONTRACT_MISMATCH",
      expected: NYX_CONTRACT_VERSION,
      got: incomingContract,
      requestId,
      contractVersion: NYX_CONTRACT_VERSION,
    });
  }

  if (!sessionId) sessionId = issueSessionId();
  const session = getSession(sessionId);
  if (!session.visitorId) session.visitorId = incomingVisitorId;
  initCog(session);

  const visitorId = session.visitorId;
  const profile = getProfile(visitorId);

  if (profile && !session._countedVisit) {
    profile.visits = Number(profile.visits || 0) + 1;
    session._countedVisit = true;
  }

  const foundName = detectNameFromText(message);
  if (profile && foundName) profile.name = foundName;

  const incomingVoiceMode = normalizeVoiceMode(body.voiceMode || session.voiceMode || "standard");
  session.voiceMode = incomingVoiceMode;
  res.set("X-Voice-Mode", session.voiceMode);

  preEngineBridge(session);
  postEngineBridge(session);

  if (message && isLikelyMicEcho(message, session)) {
    const reply = finalizeReply(session, micEchoBreakerReply());
    session.lastReply = reply;
    session.lastReplyAt = Date.now();
    session.lastIntent = "micEchoGuard";

    // re-derive after final reply
    const c2 = deriveCogFromFinalReply(session, reply);
    setCog(session, c2.phase, c2.state, "micEchoGuard");

    updateProfileFromSession(profile, session);

    const base = {
      ok: true,
      reply,
      sessionId,
      requestId,
      visitorId,
      contractVersion: NYX_CONTRACT_VERSION,
      voiceMode: session.voiceMode,
    };
    return respondJson(req, res, base, session, null, profile, false);
  }

  const nav = normalizeNavToken(message);

  if (nav === "replay" && session.lastReply) {
    const base = {
      ok: true,
      reply: finalizeReply(session, session.lastReply),
      sessionId,
      requestId,
      visitorId,
      contractVersion: NYX_CONTRACT_VERSION,
      voiceMode: session.voiceMode,
    };

    session.lastIntent = "replay";

    // re-derive after final reply
    const c2 = deriveCogFromFinalReply(session, base.reply);
    setCog(session, c2.phase, c2.state, "replay");

    updateProfileFromSession(profile, session);

    const hasSavedChips =
      Array.isArray(session.lastFollowUps) &&
      session.lastFollowUps.length > 0 &&
      Array.isArray(session.lastFollowUp) &&
      session.lastFollowUp.length > 0;

    if (hasSavedChips) {
      const payload = Object.assign({}, base, {
        followUps: session.lastFollowUps.slice(0, 12),
        followUp: session.lastFollowUp.slice(0, 12),
      });

      // v1.5.21: FINAL cog sync for direct replay path
      try {
        const cFinal = deriveCogFromFinalReply(session, payload.reply);
        setCog(session, cFinal.phase, cFinal.state, cFinal.reason);
      } catch (_) {}

      attachCogToPayload(payload, session);

      const wantsDebug = CHAT_DEBUG || parseDebugFlag(req);
      if (wantsDebug) {
        const tight = makeFollowUpsTight(session, profile);
        payload.debug = {
          index: INDEX_VERSION,
          state: {
            lastYear: session ? session.lastYear : null,
            lane: session ? session.lane : null,
            voiceMode: session ? session.voiceMode : null,
            lastIntent: session ? session.lastIntent : null,
            userTz: session ? session.userTz : null,
            userCity: session ? session.userCity : null,
            cog: {
              phase: session.cogPhase,
              state: session.cogState,
              reason: session.cogReason,
              ts: session.cogTs,
            },
          },
          resume: { resumable: tight.resumable, forcedFourChips: false },
        };
      }

      return res.json(payload);
    }

    return respondJson(req, res, base, session, null, profile, false);
  }

  // Greeting / empty
  if (!message || isGreeting(message)) {
    session.lastIntent = "greeting";

    const tight = makeFollowUpsTight(session, profile);
    const returning = profileIsReturning(profile);

    if (COG_AUTOCONTINUE_ON_GREETING && returning && tight.resumable) {
      const now = Date.now();
      const lastAt = Number(session._cogLastAutoContinueAt || 0);
      const canAuto = !lastAt || now - lastAt >= COG_AUTOCONTINUE_COOLDOWN_MS;

      if (canAuto) {
        session._cogLastAutoContinueAt = now;
        session.lane = "music";
        setCog(session, "execute", "running", "autoContinue:greeting");

        const out0 = await handleContinue(session, profile);
        const out = await applyFmp(out0, session);
        const reply = finalizeReply(session, out.reply || "Continuing.");

        session.lastReply = reply;
        session.lastReplyAt = Date.now();
        session.lastIntent = "continue";

        // derive after final reply to keep payload.cog in sync
        const c2 = deriveCogFromFinalReply(session, reply);
        setCog(session, c2.phase, c2.state, c2.reason);

        updateProfileFromSession(profile, session);

        const base = {
          ok: true,
          reply,
          sessionId,
          requestId,
          visitorId,
          contractVersion: NYX_CONTRACT_VERSION,
          voiceMode: session.voiceMode,
        };

        return respondJson(req, res, base, session, out, profile, false);
      }
    }

    const reply = finalizeReply(session, greetingReply(profile, tight.resumable));
    session.lastReply = reply;
    session.lastReplyAt = Date.now();

    // re-derive after final reply
    const c2 = deriveCogFromFinalReply(session, reply);
    setCog(session, c2.phase, c2.state, "greeting");

    updateProfileFromSession(profile, session);

    const base = {
      ok: true,
      reply,
      sessionId,
      requestId,
      visitorId,
      contractVersion: NYX_CONTRACT_VERSION,
      voiceMode: session.voiceMode,
    };

    return respondJson(req, res, base, session, null, profile, true);
  }

  const laneCmd = explicitLaneCommand(message);
  if (laneCmd) {
    session.lane = laneCmd;
    session.lastIntent = "laneSelect";

    if (laneCmd === "movies") setCog(session, "handoff", "active", "laneSelect:movies");
    else if (laneCmd === "sponsors") setCog(session, "handoff", "active", "laneSelect:sponsors");
    else if (laneCmd === "schedule") setCog(session, "handoff", "active", "laneSelect:schedule");
    else setCog(session, "engage", "collect", "laneSelect:music");

    const raw =
      laneCmd === "movies"
        ? "Movies Lane. Paste a movie link, or tell me decade + vibe (crime / detective / comedy)."
        : laneCmd === "sponsors"
        ? "Sponsors Lane. State your goal: calls / foot traffic / website clicks / brand awareness."
        : laneCmd === "schedule"
        ? "Schedule Lane. Ask: “What time does Gospel Sunday play in London?” or say “Show me the schedule”."
        : "Back to music. Drop a year (1950–2024). Then choose: Top 10, Story moment, or Micro moment.";

    const reply = finalizeReply(session, raw);

    session.lastReply = reply;
    session.lastReplyAt = Date.now();

    // re-derive after final reply
    const c2 = deriveCogFromFinalReply(session, reply);
    setCog(session, c2.phase, c2.state, `laneSelect:${laneCmd}`);

    updateProfileFromSession(profile, session);

    const base = {
      ok: true,
      reply,
      sessionId,
      requestId,
      visitorId,
      contractVersion: NYX_CONTRACT_VERSION,
      voiceMode: session.voiceMode,
    };

    return respondJson(req, res, base, session, null, profile, false);
  }

  if (
    isLaneExitCommand(message) &&
    (session.lane === "sponsors" || session.lane === "movies" || session.lane === "schedule")
  ) {
    session.lane = "music";
    session.lastIntent = "laneExit";

    const reply = finalizeReply(
      session,
      "Back to music. Drop a year (1950–2024). Then choose: Top 10, Story moment, or Micro moment."
    );

    session.lastReply = reply;
    session.lastReplyAt = Date.now();

    const c2 = deriveCogFromFinalReply(session, reply);
    setCog(session, c2.phase, c2.state, "laneExit");

    updateProfileFromSession(profile, session);

    const base = {
      ok: true,
      reply,
      sessionId,
      requestId,
      visitorId,
      contractVersion: NYX_CONTRACT_VERSION,
      voiceMode: session.voiceMode,
    };

    return respondJson(req, res, base, session, null, profile, false);
  }

  if (nav === "numberOne") {
    session.lane = "music";
    const out0 = await handleNumberOne(session);
    const out = await applyFmp(out0, session);
    const reply = finalizeReply(session, out.reply || "#1.");

    session.lastReply = reply;
    session.lastReplyAt = Date.now();
    session.lastIntent = "numberOne";

    const c2 = deriveCogFromFinalReply(session, reply);
    setCog(session, c2.phase, c2.state, c2.reason);

    updateProfileFromSession(profile, session);

    const base = {
      ok: true,
      reply,
      sessionId,
      requestId,
      visitorId,
      contractVersion: NYX_CONTRACT_VERSION,
      voiceMode: session.voiceMode,
    };
    return respondJson(req, res, base, session, out, profile, false);
  }

  if (nav === "nextYear") {
    session.lane = "music";
    const out0 = await handleYearNav(session, +1);
    const out = await applyFmp(out0, session);
    const reply = finalizeReply(session, out.reply || "Next year.");

    session.lastReply = reply;
    session.lastReplyAt = Date.now();
    session.lastIntent = "nextYear";

    const c2 = deriveCogFromFinalReply(session, reply);
    setCog(session, c2.phase, c2.state, c2.reason);

    updateProfileFromSession(profile, session);

    const base = {
      ok: true,
      reply,
      sessionId,
      requestId,
      visitorId,
      contractVersion: NYX_CONTRACT_VERSION,
      voiceMode: session.voiceMode,
    };
    return respondJson(req, res, base, session, out, profile, false);
  }

  if (nav === "prevYear") {
    session.lane = "music";
    const out0 = await handleYearNav(session, -1);
    const out = await applyFmp(out0, session);
    const reply = finalizeReply(session, out.reply || "Previous year.");

    session.lastReply = reply;
    session.lastReplyAt = Date.now();
    session.lastIntent = "prevYear";

    const c2 = deriveCogFromFinalReply(session, reply);
    setCog(session, c2.phase, c2.state, c2.reason);

    updateProfileFromSession(profile, session);

    const base = {
      ok: true,
      reply,
      sessionId,
      requestId,
      visitorId,
      contractVersion: NYX_CONTRACT_VERSION,
      voiceMode: session.voiceMode,
    };
    return respondJson(req, res, base, session, out, profile, false);
  }

  if (nav === "anotherYear") {
    session.lane = "music";
    const out0 = handleAnotherYear(session);
    const out = await applyFmp(out0, session);
    const reply = finalizeReply(session, out.reply || "");

    session.lastReply = reply;
    session.lastReplyAt = Date.now();
    session.lastIntent = "anotherYear";

    const c2 = deriveCogFromFinalReply(session, reply);
    setCog(session, c2.phase, c2.state, c2.reason);

    updateProfileFromSession(profile, session);

    const base = {
      ok: true,
      reply,
      sessionId,
      requestId,
      visitorId,
      contractVersion: NYX_CONTRACT_VERSION,
      voiceMode: session.voiceMode,
    };
    return respondJson(req, res, base, session, out, profile, false);
  }

  if (nav === "continue") {
    session.lane = "music";
    const out0 = await handleContinue(session, profile);
    const out = await applyFmp(out0, session);
    const reply = finalizeReply(session, out.reply || "Continuing.");

    session.lastReply = reply;
    session.lastReplyAt = Date.now();
    session.lastIntent = "continue";

    const c2 = deriveCogFromFinalReply(session, reply);
    setCog(session, c2.phase, c2.state, c2.reason);

    updateProfileFromSession(profile, session);

    const base = {
      ok: true,
      reply,
      sessionId,
      requestId,
      visitorId,
      contractVersion: NYX_CONTRACT_VERSION,
      voiceMode: session.voiceMode,
    };
    return respondJson(req, res, base, session, out, profile, false);
  }

  if (nav === "fresh") {
    session.lane = "music";
    const out0 = handleFresh(session);
    const out = await applyFmp(out0, session);
    const reply = finalizeReply(session, out.reply || "");

    session.lastReply = reply;
    session.lastReplyAt = Date.now();
    session.lastIntent = "fresh";

    const c2 = deriveCogFromFinalReply(session, reply);
    setCog(session, c2.phase, c2.state, c2.reason);

    updateProfileFromSession(profile, session);

    const base = {
      ok: true,
      reply,
      sessionId,
      requestId,
      visitorId,
      contractVersion: NYX_CONTRACT_VERSION,
      voiceMode: session.voiceMode,
    };
    return respondJson(req, res, base, session, out, profile, false);
  }

  // Explicit Top10 must win BEFORE generic year/mode parsing.
  if (isExplicitTop10WithYear(message)) {
    const y = clampYear(extractYearFromText(message));
    if (y) {
      session.lane = "music";
      session.lastYear = y;
      session.lastMusicYear = y;
      session.activeMusicMode = "top10";
      session.pendingMode = null;
      session.activeMusicChart = YEAR_END_CHART;
      session.lastMusicChart = YEAR_END_CHART;
      guardChartForYear(session, y);
      setCog(session, "execute", "running", "explicitTop10");
    }

    const out0 = await runEngine(message, session);
    const out = await applyFmp(out0, session);
    const reply = finalizeReply(session, out.reply || "");

    session.lastReply = reply;
    session.lastReplyAt = Date.now();
    session.lastIntent = "top10";

    const c2 = deriveCogFromFinalReply(session, reply);
    setCog(session, c2.phase, c2.state, c2.reason);

    updateProfileFromSession(profile, session);

    const base = {
      ok: true,
      reply,
      sessionId,
      requestId,
      visitorId,
      contractVersion: NYX_CONTRACT_VERSION,
      voiceMode: session.voiceMode,
    };
    return respondJson(req, res, base, session, out, profile, false);
  }

  const parsedYear = clampYear(extractYearFromText(message));
  const parsedMode = normalizeModeToken(message);
  const bareYear = parsedYear ? isBareYearMessage(message) : false;

  if (parsedYear) {
    session.lastYear = parsedYear;
    session.lastMusicYear = parsedYear;
    guardChartForYear(session, parsedYear);
  }

  if (parsedYear && parsedMode) {
    session.lane = "music";
    session.activeMusicMode = parsedMode;
    session.pendingMode = null;

    if (parsedMode === "top10") {
      session.activeMusicChart = YEAR_END_CHART;
      session.lastMusicChart = YEAR_END_CHART;
    }

    setCog(session, "execute", "running", "parsed:year+mode");

    const out0 = await runEngine(`${modeToCommand(parsedMode)} ${parsedYear}`, session);
    const out = await applyFmp(out0, session);
    const reply = finalizeReply(session, out.reply || "");

    session.lastReply = reply;
    session.lastReplyAt = Date.now();
    session.lastIntent = parsedMode;

    const c2 = deriveCogFromFinalReply(session, reply);
    setCog(session, c2.phase, c2.state, c2.reason);

    updateProfileFromSession(profile, session);

    const base = {
      ok: true,
      reply,
      sessionId,
      requestId,
      visitorId,
      contractVersion: NYX_CONTRACT_VERSION,
      voiceMode: session.voiceMode,
    };
    return respondJson(req, res, base, session, out, profile, false);
  }

  if (parsedMode && !parsedYear) {
    session.lane = "music";

    session.activeMusicMode = parsedMode;
    session.pendingMode = parsedMode;

    if (parsedMode === "top10") {
      session.activeMusicChart = YEAR_END_CHART;
      session.lastMusicChart = YEAR_END_CHART;
    }

    if (clampYear(Number(session.lastYear))) {
      session.pendingMode = null;
      setCog(session, "execute", "running", "parsed:modeOnly:useLastYear");

      const out0 = await runEngine(
        `${modeToCommand(parsedMode)} ${Number(session.lastYear)}`,
        session
      );
      const out = await applyFmp(out0, session);
      const reply = finalizeReply(session, out.reply || "");

      session.lastReply = reply;
      session.lastReplyAt = Date.now();
      session.lastIntent = parsedMode;

      const c2 = deriveCogFromFinalReply(session, reply);
      setCog(session, c2.phase, c2.state, c2.reason);

      updateProfileFromSession(profile, session);

      const base = {
        ok: true,
        reply,
        sessionId,
        requestId,
        visitorId,
        contractVersion: NYX_CONTRACT_VERSION,
        voiceMode: session.voiceMode,
      };
      return respondJson(req, res, base, session, out, profile, false);
    }

    setCog(session, "engage", "collect", "parsed:modeOnly:needYear");
    const ask = finalizeReply(session, replyMissingYearForMode(parsedMode));

    session.lastReply = ask;
    session.lastReplyAt = Date.now();
    session.lastIntent = "askYear";

    const c2 = deriveCogFromFinalReply(session, ask);
    setCog(session, c2.phase, c2.state, "need:year");

    updateProfileFromSession(profile, session);

    const base = {
      ok: true,
      reply: ask,
      sessionId,
      requestId,
      visitorId,
      contractVersion: NYX_CONTRACT_VERSION,
      voiceMode: session.voiceMode,
    };
    return respondJson(req, res, base, session, null, profile, false);
  }

  if (parsedYear && !parsedMode) {
    session.lane = "music";

    const mode = bareYear ? "top10" : (session.pendingMode || session.activeMusicMode || "top10");

    session.activeMusicMode = mode;
    session.pendingMode = null;

    if (mode === "top10") {
      session.activeMusicChart = YEAR_END_CHART;
      session.lastMusicChart = YEAR_END_CHART;
    }

    setCog(session, "execute", "running", bareYear ? "parsed:bareYear=>top10" : "parsed:yearOnly");

    const out0 = await runEngine(`${modeToCommand(mode)} ${parsedYear}`, session);
    const out = await applyFmp(out0, session);
    const reply = finalizeReply(session, out.reply || "");

    session.lastReply = reply;
    session.lastReplyAt = Date.now();
    session.lastIntent = mode;

    const c2 = deriveCogFromFinalReply(session, reply);
    setCog(session, c2.phase, c2.state, c2.reason);

    updateProfileFromSession(profile, session);

    const base = {
      ok: true,
      reply,
      sessionId,
      requestId,
      visitorId,
      contractVersion: NYX_CONTRACT_VERSION,
      voiceMode: session.voiceMode,
    };
    return respondJson(req, res, base, session, out, profile, false);
  }

  void bareYear;

  const out0 = await runEngine(message, session);
  const out = await applyFmp(out0, session);

  const reply = finalizeReply(session, out.reply || "");

  session.lastReply = reply;
  session.lastReplyAt = Date.now();
  session.lastIntent = "passthrough";

  const c = deriveCogFromFinalReply(session, reply);
  setCog(session, c.phase, c.state, c.reason);

  updateProfileFromSession(profile, session);

  const base = {
    ok: true,
    reply,
    sessionId,
    requestId,
    visitorId,
    contractVersion: NYX_CONTRACT_VERSION,
    voiceMode: session.voiceMode,
  };
  return respondJson(req, res, base, session, out, profile, false);
});

/* ======================================================
   API: health
====================================================== */

app.get("/api/health", (req, res) => {
  const requestId = req.get("X-Request-Id") || rid();
  res.set("X-Request-Id", requestId);
  res.set("X-Contract-Version", NYX_CONTRACT_VERSION);
  res.set("Cache-Control", "no-store");

  const origin = req.headers.origin || null;
  const originAllowed = CORS_ALLOW_ALL ? true : origin ? originMatchesAllowlist(origin) : null;

  res.json({
    ok: true,
    service: "sandblast-backend",
    env: process.env.NODE_ENV || "production",
    time: nowIso(),
    build: process.env.RENDER_GIT_COMMIT || null,
    version: INDEX_VERSION,
    sessions: SESSIONS.size,
    profiles: PROFILES.size,
    cors: {
      allowAll: CORS_ALLOW_ALL,
      allowedOrigins: CORS_ALLOW_ALL ? "ALL" : ALLOWED_ORIGINS.length,
      originEcho: origin,
      originAllowed,
    },
    contract: { version: NYX_CONTRACT_VERSION, strict: CONTRACT_STRICT },
    timeouts: { requestTimeoutMs: REQUEST_TIMEOUT_MS, elevenTtsTimeoutMs: ELEVEN_TTS_TIMEOUT_MS },
    tts: {
      enabled: TTS_ENABLED,
      provider: TTS_PROVIDER,
      hasKey: !!ELEVEN_KEY,
      hasVoiceId: !!ELEVEN_VOICE_ID,
      model: ELEVEN_MODEL_ID || null,
      hasFetch: typeof fetch === "function",
    },
    micGuard: { enabled: MIC_GUARD_ENABLED, windowMs: MIC_GUARD_WINDOW_MS, minChars: MIC_GUARD_MIN_CHARS },
    music: { defaultChart: DEFAULT_CHART, yearEndChart: YEAR_END_CHART, yearEndSinglesChart: YEAR_END_SINGLES_CHART },
    lanes: {
      scheduleLoaded: !!scheduleLane,
      sponsorsLoaded: !!sponsorsLane,
      moviesLoaded: !!moviesLane,
      musicLoaded: !!musicKnowledge,
    },
    cognitive: {
      payloadEnabled: COG_PAYLOAD_ENABLED,
      autoContinueOnGreeting: COG_AUTOCONTINUE_ON_GREETING,
      autoContinueCooldownMs: COG_AUTOCONTINUE_COOLDOWN_MS,
      canonicalPhases: Object.values(COG_PHASE),
      canonicalStates: Object.values(COG_STATE),
    },
    requestId,
  });
});

/* ======================================================
   Start server
====================================================== */

const PORT = Number(process.env.PORT || 10000);
const HOST = "0.0.0.0";

const server = app.listen(PORT, HOST, () => {
  console.log(
    `[sandblast-backend] up :${PORT} env=${process.env.NODE_ENV || "production"} build=${
      process.env.RENDER_GIT_COMMIT || "n/a"
    } contract=${NYX_CONTRACT_VERSION} version=${INDEX_VERSION}`
  );
});

try {
  server.requestTimeout = REQUEST_TIMEOUT_MS;
  server.headersTimeout = Math.max(REQUEST_TIMEOUT_MS + 5000, 35000);
  server.keepAliveTimeout = Math.max(65000, server.keepAliveTimeout || 0);
} catch (_) {}

function shutdown(sig) {
  try {
    clearInterval(cleaner);
  } catch (_) {}
  try {
    clearInterval(profileCleaner);
  } catch (_) {}
  try {
    server.close(() => {
      console.log(`[sandblast-backend] shutdown ${sig}`);
      process.exit(0);
    });
    setTimeout(() => process.exit(0), 3000).unref?.();
  } catch (_) {
    process.exit(0);
  }
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

process.on("unhandledRejection", (e) =>
  console.error("[sandblast-backend] unhandledRejection", e)
);
process.on("uncaughtException", (e) =>
  console.error("[sandblast-backend] uncaughtException", e)
);

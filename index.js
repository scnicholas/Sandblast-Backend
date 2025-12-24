/**
 * index.js — Nyx Broadcast Backend (Wizard-Locked)
 * Build: nyx-wizard-v1.93-drivers-confidence
 *
 * v1.93 additions:
 * - Conversation Drivers + Confidence policy (flow control)
 * - Lightweight Top40Weekly Top 100 self-check (render-time repair for known drift patterns)
 *
 * v1.92 changes:
 * - Integrates musicKnowledge.pickRandomByYearWithMeta() when available (meta-aware fallback)
 * - getTopByYear(year, n, chart) now passes chart through (worker fix)
 * - Year-first top pick respects chart
 * - Adds GET /api/debug/last (safe session snapshot) for troubleshooting
 * - Keeps year-only guarantee, follow-up intelligence resilient
 */

"use strict";

require("dotenv").config();

const express = require("express");
const cors = require("cors");
const crypto = require("crypto");
const { Worker, isMainThread, parentPort } = require("worker_threads");

// =======================================================
// WORKER MODE (persistent KB engine)
// =======================================================
if (!isMainThread) {
  let musicKB = null;

  function safe(fn, fallback = null) {
    try { return fn(); } catch { return fallback; }
  }

  function computeStats() {
    try {
      if (!musicKB) musicKB = require("./Utils/musicKnowledge");
      const db = safe(() => musicKB.getDb?.(), null);
      const moments = Array.isArray(db?.moments) ? db.moments : [];

      let minYear = null;
      let maxYear = null;
      const chartSet = new Set();

      for (const m of moments) {
        const y = Number(m?.year);
        if (Number.isFinite(y)) {
          if (minYear == null || y < minYear) minYear = y;
          if (maxYear == null || y > maxYear) maxYear = y;
        }
        const c = m?.chart ? String(m.chart) : "";
        if (c) chartSet.add(c);
      }

      return {
        moments: moments.length,
        yearMin: minYear,
        yearMax: maxYear,
        charts: Array.from(chartSet).slice(0, 50)
      };
    } catch (e) {
      return {
        moments: 0,
        yearMin: null,
        yearMax: null,
        charts: null,
        error: String(e?.message || e)
      };
    }
  }

  function yearsForArtistTitle(artist, title, chart) {
    if (!artist || !title) return [];
    const fn = musicKB?.findYearsForArtistTitle;
    if (typeof fn !== "function") return [];
    let years = safe(() => fn(artist, title, chart), []);
    if (!Array.isArray(years) || years.length === 0) {
      years = safe(() => fn(artist, title, null), []);
    }
    return Array.isArray(years) ? years.slice(0, 50) : [];
  }

  function preferYearTopPick(year, chart) {
    const fn = musicKB?.getTopByYear;
    if (typeof fn !== "function") return null;
    const top = safe(() => fn(year, 10, chart || null), []);
    if (!Array.isArray(top) || top.length === 0) return null;

    // pick #1 if present (peak=1), else first entry
    let best = top[0];
    for (const m of top) {
      if (Number(m?.peak) === 1) { best = m; break; }
      if (Number(m?.rank) === 1) { best = m; break; }
      if (m?.is_number_one === true) { best = m; break; }
    }
    return best || null;
  }

  function randomByYearWithMeta(year, chart) {
    const fnMeta = musicKB?.pickRandomByYearWithMeta;
    if (typeof fnMeta === "function") {
      const r = safe(() => fnMeta(year, chart || null), null);
      if (r && typeof r === "object") {
        // expected { moment, meta }
        const moment = r.moment || null;
        const meta = r.meta || null;
        return { best: moment, meta };
      }
    }

    // Fallback if old musicKnowledge is present
    const randFn = musicKB?.pickRandomByYearFallback || musicKB?.pickRandomByYear;
    const best = (typeof randFn === "function" && Number.isFinite(Number(year)))
      ? safe(() => randFn(Number(year), chart || null), null)
      : null;

    return { best, meta: null };
  }

  function handleJob(msg) {
    const id = msg && msg.id;
    const op = String(msg && msg.op ? msg.op : "query");
    const text = String(msg && msg.text ? msg.text : "").trim();
    const laneDetail =
      (msg && msg.laneDetail && typeof msg.laneDetail === "object") ? msg.laneDetail : {};

    if (!id) return;

    try {
      if (!musicKB) {
        musicKB = require("./Utils/musicKnowledge");
      }

      // ---------- stats ----------
      if (op === "stats") {
        const stats = computeStats();
        return parentPort.postMessage({ id, ok: true, out: { stats } });
      }

      // ---------- follow-up ops ----------
      if (op === "topByYear") {
        const year = Number(laneDetail?.year);
        const n = Number(laneDetail?.n || 10);
        const chart = laneDetail?.chart || null;

        const topFn = musicKB?.getTopByYear;
        const outTop = (typeof topFn === "function" && Number.isFinite(year))
          ? safe(() => topFn(year, n, chart), [])
          : [];

        return parentPort.postMessage({ id, ok: true, out: { top: Array.isArray(outTop) ? outTop : [] } });
      }

      if (op === "randomByYear") {
        const year = Number(laneDetail?.year);
        const chart = laneDetail?.chart || null;

        const r = (Number.isFinite(year)) ? randomByYearWithMeta(year, chart) : { best: null, meta: null };
        return parentPort.postMessage({ id, ok: true, out: { best: r.best, meta: r.meta } });
      }

      // ---------- default query ----------
      const out = {
        year: safe(() => musicKB.extractYear?.(text), null),
        artist: safe(() => musicKB.detectArtist?.(text), null),
        title: safe(() => musicKB.detectTitle?.(text), null),
        chart: safe(() => musicKB.normalizeChart?.(laneDetail?.chart), laneDetail?.chart || null),
        best: null,
        bestMeta: null,
        years: null
      };

      const slots = { ...(laneDetail || {}) };
      if (out.chart) slots.chart = out.chart;
      if (out.year) slots.year = out.year;
      if (out.artist && !slots.artist) slots.artist = out.artist;
      if (out.title && !slots.title) slots.title = out.title;

      const hasYear = !!slots.year;
      const hasArtist = !!slots.artist;
      const hasTitle = !!slots.title;

      // YEAR-FIRST:
      if (hasYear && !hasArtist && !hasTitle) {
        out.best = preferYearTopPick(slots.year, slots.chart);

        if (!out.best) {
          // meta-aware random for year-only
          const r = randomByYearWithMeta(slots.year, slots.chart);
          out.best = r.best || null;
          out.bestMeta = r.meta || null;
        }

        if (!out.best) {
          out.best = safe(() => musicKB.pickBestMoment?.(null, slots), null);
        }
      } else {
        out.best = safe(() => musicKB.pickBestMoment?.(null, slots), null);

        if (!out.best && hasArtist && hasTitle) {
          out.years = yearsForArtistTitle(slots.artist, slots.title, slots.chart);
        }

        // Relaxed retry: drop year
        if (!out.best && hasArtist && hasTitle && hasYear) {
          const relaxed = { ...slots };
          delete relaxed.year;

          const relaxedBest = safe(() => musicKB.pickBestMoment?.(null, relaxed), null);
          if (relaxedBest) {
            const corrected = { ...relaxedBest };
            corrected._correctedYear = true;
            corrected._originalYear = slots.year;
            out.best = corrected;
            console.log("[Nyx][Fallback] dropYear");
          }
        }

        // Secondary relaxed retry: drop year + chart
        if (!out.best && hasArtist && hasTitle && hasYear && slots.chart) {
          const relaxed2 = { ...slots };
          delete relaxed2.year;
          delete relaxed2.chart;

          const relaxedBest2 = safe(() => musicKB.pickBestMoment?.(null, relaxed2), null);
          if (relaxedBest2) {
            const corrected2 = { ...relaxedBest2 };
            corrected2._correctedYear = true;
            corrected2._originalYear = slots.year;
            corrected2._correctedChart = true;
            corrected2._originalChart = slots.chart;
            out.best = corrected2;
            console.log("[Nyx][Fallback] dropYear+dropChart");
          }
        }

        if (!out.best && hasArtist && hasTitle && (!out.years || out.years.length === 0)) {
          out.years = yearsForArtistTitle(slots.artist, slots.title, null);
        }
      }

      parentPort.postMessage({ id, ok: true, out });
    } catch (e) {
      parentPort.postMessage({ id, ok: false, error: String(e?.message || e) });
    }
  }

  parentPort.on("message", handleJob);
  parentPort.postMessage({ ok: true, ready: true });
  return;
}

// =======================================================
// MAIN THREAD
// =======================================================
const app = express();
app.set("trust proxy", true);
app.use(express.json({ limit: "2mb" }));
app.use(cors({ origin: true }));
app.options("*", cors());

const PORT = process.env.PORT || 3000;

// Build truth: Render sets RENDER_GIT_COMMIT
const COMMIT_FULL = process.env.RENDER_GIT_COMMIT || process.env.GIT_COMMIT || "";
const COMMIT_SHORT = COMMIT_FULL ? String(COMMIT_FULL).slice(0, 7) : "";
const BUILD_TAG = COMMIT_SHORT
  ? `nyx-wizard-v1.93-${COMMIT_SHORT}`
  : "nyx-wizard-v1.93-drivers-confidence";

const DEFAULT_CHART = "Billboard Hot 100";
const KB_TIMEOUT_MS = Number(process.env.KB_TIMEOUT_MS || 900);

// ---------------- SESSION ----------------
const SESS = new Map();
const SESSION_TTL_MS = 1000 * 60 * 60 * 6;
const CLEANUP_EVERY_MS = 1000 * 60 * 10;

let LAST_DEBUG = {
  at: null,
  sessionId: null,
  step: null,
  requestText: null,
  laneDetail: null,
  lastPick: null,
  build: BUILD_TAG
};

function sid() {
  try { return crypto.randomUUID(); }
  catch { return "sid_" + Date.now() + "_" + Math.random().toString(36).slice(2); }
}

function nowIso() { return new Date().toISOString(); }
function safeStr(x) { return String(x == null ? "" : x).trim(); }
function safeObj(x) { return x && typeof x === "object" ? x : {}; }

setInterval(() => {
  const now = Date.now();
  for (const [k, s] of SESS.entries()) {
    if (!s?.lastSeen) continue;
    if (now - s.lastSeen > SESSION_TTL_MS) SESS.delete(k);
  }
}, CLEANUP_EVERY_MS).unref?.();

function normalizeUserText(text) {
  return safeStr(text).replace(/\s+/g, " ").trim();
}

function isYearOnlyLoose(text) {
  const t = normalizeUserText(text);
  return /^\W*(19\d{2}|20\d{2})\W*$/.test(t);
}

function extractYearLoose(text) {
  const m = String(text || "").match(/\b(19\d{2}|20\d{2})\b/);
  return m ? Number(m[1]) : null;
}

function clampYearToStats(year, stats) {
  const y = Number(year);
  const min = stats && Number.isFinite(Number(stats.yearMin)) ? Number(stats.yearMin) : null;
  const max = stats && Number.isFinite(Number(stats.yearMax)) ? Number(stats.yearMax) : null;
  if (!Number.isFinite(y) || min == null || max == null) return null;
  if (y < min) return min;
  if (y > max) return max;
  return y;
}

function parseChartFromText(text) {
  const t = normalizeUserText(text).toLowerCase();
  if (!t) return null;

  // Year-end Top 100 intent
  if (/\btop\s*100\b|\btop100\b|\byear[-\s]?end\b|\byear\s*end\b/.test(t)) return "Top40Weekly Top 100";

  if (/\btop40weekly\b|\btop 40 weekly\b/.test(t)) return "Top40Weekly";
  if (/\bcanada\b|\brpm\b|\bcanada rpm\b/.test(t)) return "Canada RPM";
  if (/\buk\b|\buk singles\b|\buk singles chart\b/.test(t)) return "UK Singles Chart";
  if (/\bbillboard\b|\bhot 100\b|\bbillboard hot 100\b/.test(t)) return "Billboard Hot 100";

  return null;
}

function parseArtistTitle(text) {
  const t = safeStr(text);
  if (!t) return null;

  const normalized = t.replace(/[–—]/g, "-");
  const m = normalized.match(/^(.{2,}?)\s*-\s*(.{2,}?)$/);
  if (!m) return null;

  const artist = safeStr(m[1]);
  const title = safeStr(m[2]);
  if (!artist || !title) return null;
  if (/^\d{4}$/.test(artist)) return null;
  if (/^\d{4}$/.test(title)) return null;

  return { artist, title };
}

// ====== Follow-up intelligence helpers ======
function isFollowupCommand(text) {
  const t = normalizeUserText(text).toLowerCase();
  if (!t) return false;

  return (
    /\btop\s*10\b/.test(t) ||
    /\btop\s*5\b/.test(t) ||
    /\b#\s*1\b|\b#1\b|\bnumber\s*one\b|\bno\.\s*1\b|\bno\s*1\b|\bno1\b/.test(t) ||
    /\b(surprise|random|pick one|another|next one|next|more)\b/.test(t) ||
    /\b(story|tell me more|why|context|behind it)\b/.test(t) ||
    /\b(same chart|switch chart|change chart|uk|canada|rpm|top40weekly|hot 100|billboard)\b/.test(t)
  );
}

function wantsTopN(text) {
  const t = normalizeUserText(text).toLowerCase();
  const m = t.match(/\btop\s*(\d{1,2})\b/);
  if (m) {
    const n = Number(m[1]);
    if (Number.isFinite(n) && n >= 1 && n <= 100) return n;
  }
  if (/\btop\s*10\b/.test(t)) return 10;
  if (/\btop\s*5\b/.test(t)) return 5;
  return null;
}

function wantsNumberOne(text) {
  const t = normalizeUserText(text).toLowerCase();
  return /\b#\s*1\b|\b#1\b|\bnumber\s*one\b|\bno\.\s*1\b|\bno\s*1\b|\bno1\b/.test(t);
}

function wantsAnother(text) {
  const t = normalizeUserText(text).toLowerCase();
  return /\b(another|next one|next|more|give me another|one more)\b/.test(t);
}

function wantsSurprise(text) {
  const t = normalizeUserText(text).toLowerCase();
  return /\b(surprise|random|pick one)\b/.test(t);
}

function wantsStory(text) {
  const t = normalizeUserText(text).toLowerCase();
  return /\b(story|tell me more|why|context|behind it)\b/.test(t);
}

// ====== Fluid conversation helpers ======
function looksLikeMusicQuery(text, sess) {
  const t = normalizeUserText(text);
  if (!t) return false;

  if (/\b(19\d{2}|20\d{2})\b/.test(t)) return true;
  if (parseArtistTitle(t)) return true;
  if (parseChartFromText(t)) return true;

  const hasMusicContext =
    !!sess?.laneDetail?.year || !!sess?.laneDetail?.artist || !!sess?.laneDetail?.title || !!sess?.lastPick;
  if (hasMusicContext && isFollowupCommand(t)) return true;

  return false;
}

function isGreeting(text) {
  const t = normalizeUserText(text).toLowerCase();
  if (!t) return false;
  return /^(hi|hey|hello|yo|what'?s up|whats up|good (morning|afternoon|evening))\b/.test(t);
}

function isHowAreYou(text) {
  const t = normalizeUserText(text).toLowerCase();
  return /\bhow are you\b|\bhow’s it going\b|\bhow's it going\b|\bhow are things\b|\bhow you doing\b/.test(t);
}

function isPositiveOrStatusReply(text) {
  const t = normalizeUserText(text).toLowerCase();
  if (!t) return false;
  return /\b(good|great|fine|ok|okay|not bad|doing well|all good|awesome)\b/.test(t);
}


// =======================================================
// CONVERSATION DRIVERS + CONFIDENCE (flow control)
// - Ensures Nyx always advances the conversation.
// - If confidence is low, Nyx will not guess; it will ask for one missing detail with safe options.
// =======================================================
function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }

function hasNextStepAlready(reply) {
  const r = safeStr(reply);
  if (!r) return false;

  // If caller already included an explicit follow-up, don't stack another.
  if (/\*\*next step\*\*/i.test(r)) return true;

  // Common follow-up patterns already present in this codebase
  const tail = r.slice(-260).toLowerCase();
  if (tail.includes("want the") || tail.includes("want another") || tail.includes("want **") || tail.includes("reply with just")) return true;
  if (tail.includes("try:") || tail.includes("try another year") || tail.includes("switch charts")) return true;

  // Heuristic: ends with a question (often already a driver)
  if (/[?]\s*$/.test(tail.trim())) return true;

  return false;
}

function scoreConfidence({ step, sess, userText }) {
  const text = normalizeUserText(userText || "").toLowerCase();

  // Slot completeness (music-centric)
  const year = Number(sess?.laneDetail?.year);
  const hasYear = Number.isFinite(year);
  const hasArtist = !!safeStr(sess?.laneDetail?.artist);
  const hasTitle = !!safeStr(sess?.laneDetail?.title);

  let slotScore = 1;
  if (!hasYear && !(hasArtist && hasTitle)) slotScore = 0.25;
  else if (hasYear && !(hasArtist && hasTitle)) slotScore = 0.8;
  else if (!hasYear && (hasArtist && hasTitle)) slotScore = 0.75;

  // Step-based priors (low-confidence states)
  const lowSteps = new Set(["empty", "kb_timeout", "music_year_nohit", "music_not_found", "music_more_nohit"]);
  const midSteps = new Set(["music_suggest_years", "music_followup_help", "music_top_nohit"]);

  let base = 0.78;
  if (lowSteps.has(step)) base = 0.35;
  else if (midSteps.has(step)) base = 0.55;

  // Ambiguity penalty
  const ambiguousSignals = ["not sure", "maybe", "something", "it doesn't work", "doesnt work", "broken", "issue", "problem", "can't", "cannot", "won't", "wont"];
  const ambiguityPenalty = ambiguousSignals.some(s => text.includes(s)) ? 0.12 : 0;

  // Loop penalty: if user repeats the same request, confidence drops (forces a safer ask)
  const loopPenalty = (typeof sess?.repeatCount === "number" && sess.repeatCount >= 2) ? 0.18 : 0;

  const raw = (0.55 * base) + (0.45 * slotScore) - ambiguityPenalty - loopPenalty;
  return clamp(raw, 0, 1);
}

function pickDriver({ step, sess, confidence }) {
  const chart = safeStr(sess?.laneDetail?.chart) || DEFAULT_CHART;

  // Low-confidence fallback (refuse to guess)
  if (confidence < 0.45) {
    const hasYear = Number.isFinite(Number(sess?.laneDetail?.year)) || Number.isFinite(Number(sess?.anchor?.year)) || Number.isFinite(Number(sess?.lastGood?.year));
    const hasArtistTitle = !!safeStr(sess?.laneDetail?.artist) && !!safeStr(sess?.laneDetail?.title);

    // Ask for ONE missing detail (highest value) to avoid interrogations.
    if (!hasYear && !hasArtistTitle) {
      return {
        type: "fallback",
        text: "I can help, but I need one anchor so I don’t guess. Pick one:",
        choices: [
          "Reply with a year (example: 1989)",
          "Reply with Artist - Title (example: Paula Abdul - Straight Up)",
          `Say “top 10 ${chart}” if you want a list`
        ]
      };
    }

    if (!hasYear && hasArtistTitle) {
      return {
        type: "fallback",
        text: "I’ve got the song — what year should I anchor it to?",
        choices: [
          "Reply with a year (example: 1989)",
          `Or say “top 10 ${chart}” for a list`
        ]
      };
    }

    // Has year but missing artist/title
    return {
      type: "fallback",
      text: "I’ve got the year — do you want a list or a pick?",
      choices: [
        "Say “top 10”",
        "Say “#1”",
        "Say “surprise pick”"
      ]
    };
  }

  // Music flow driver (keep users moving)
  const ctxYearFromSlots = sess?.laneDetail?.year ? Number(sess.laneDetail.year) : null;
  const ctxYearFromLastPick = sess?.lastPick?.year ? Number(sess.lastPick.year) : null;
  const ctxYear = Number.isFinite(ctxYearFromSlots) ? ctxYearFromSlots : (Number.isFinite(ctxYearFromLastPick) ? ctxYearFromLastPick : null);

  if (ctxYear) {
    return {
      type: "choice",
      text: `For ${ctxYear} on ${chart}, what do you want next?`,
      choices: ["Top 10", "#1", "Another pick", "Switch chart"]
    };
  }

  // Generic driver
  return {
    type: "question",
    text: "What do you want to anchor—give me a year (example: 1984) or Artist - Title."
  };
}

function formatDriver(driver) {
  if (!driver) return "";
  if (driver.type === "choice" || driver.type === "fallback") {
    const list = (driver.choices || []).map(c => `- ${c}`).join("\n");
    return `\n\n**Next step**\n${driver.text}\n${list}`;
  }
  return `\n\n**Next step**\n${driver.text}`;
}

function send(res, sessionId, sess, step, reply, advance = false, debugText = null) {
  // Driver injection (unless a follow-up is already present)
  const confidence = scoreConfidence({ step, sess, userText: debugText || "" });
  const driver = (!hasNextStepAlready(reply)) ? pickDriver({ step, sess, confidence }) : null;
  const finalReply = driver ? (String(reply) + formatDriver(driver)) : reply;

  sess.lastReply = finalReply;
  sess.lastReplyStep = step;

  // Update debug snapshot (safe)
  LAST_DEBUG = {
    at: nowIso(),
    sessionId,
    step,
    requestText: debugText,
    laneDetail: sess.laneDetail || null,
    lastPick: sess.lastPick || null,
    build: BUILD_TAG
  };

  res.status(200).json({
    ok: true,
    reply: finalReply,
    state: {
      mode: sess.currentLane,
      step,
      advance,
      slots: sess.laneDetail || {}
    },
    meta: {
      sessionId,
      build: BUILD_TAG,
      commit: COMMIT_SHORT || null,
      serverTime: nowIso()
    }
  });
}

function resolveSession(req) {
  const headerSid = safeStr(req.headers["x-session-id"]);
  const bodySid = safeStr(req.body?.sessionId);
  const metaSid = safeStr(req.body?.meta?.sessionId);
  const clientSid = metaSid || bodySid || headerSid;
  const key = clientSid || sid();

  let sess = SESS.get(key);
  if (!sess) {
    sess = {
      id: key,
      currentLane: "music_history",
      laneDetail: { chart: DEFAULT_CHART },
      dialogStage: "new",
      lastSeen: Date.now(),
      lastPick: null,

      // Intelligence upgrades (v1.95)
      anchor: { year: null, chart: DEFAULT_CHART, artist: null, title: null },
      lastGood: { year: null, chart: DEFAULT_CHART, artist: null, title: null },
      lastUserHash: null,
      repeatCount: 0
    };
    SESS.set(key, sess);
  } else {
    sess.lastSeen = Date.now();
  }

  sess.laneDetail = safeObj(sess.laneDetail);
  sess.laneDetail.chart = safeStr(sess.laneDetail.chart) || DEFAULT_CHART;
  sess.currentLane = safeStr(sess.currentLane) || "music_history";
  sess.dialogStage = safeStr(sess.dialogStage) || "new";
  sess.lastPick = sess.lastPick && typeof sess.lastPick === "object" ? sess.lastPick : null;

  // Intelligence upgrades (v1.95): anchor + lastGood + loop-break tracking
  sess.anchor = safeObj(sess.anchor);
  sess.lastGood = safeObj(sess.lastGood);
  if (typeof sess.lastUserHash !== "string" && sess.lastUserHash != null) sess.lastUserHash = String(sess.lastUserHash);
  if (typeof sess.repeatCount !== "number") sess.repeatCount = 0;

  // Ensure charts are always sane
  sess.anchor.chart = safeStr(sess.anchor.chart) || sess.laneDetail.chart || DEFAULT_CHART;
  sess.lastGood.chart = safeStr(sess.lastGood.chart) || sess.laneDetail.chart || DEFAULT_CHART;

  return { key, sess };
}

// =======================================================
// KB WORKER
// =======================================================
let KB_WORKER = null;
let KB_READY = false;
const PENDING = new Map();

function startKbWorker() {
  KB_READY = false;
  KB_WORKER = new Worker(__filename);

  KB_WORKER.on("message", (msg) => {
    if (msg?.ready) {
      KB_READY = true;
      return;
    }
    const pending = PENDING.get(msg?.id);
    if (!pending) return;
    clearTimeout(pending.timer);
    PENDING.delete(msg.id);
    pending.resolve(msg);
  });

  KB_WORKER.on("exit", () => {
    KB_READY = false;
    KB_WORKER = null;
    for (const [id, p] of PENDING.entries()) {
      clearTimeout(p.timer);
      p.resolve({ id, ok: false, error: "KB_WORKER_EXIT" });
    }
    PENDING.clear();
    setTimeout(startKbWorker, 250).unref?.();
  });
}

function ensureKbWorker() {
  if (!KB_WORKER) startKbWorker();
  return !!KB_WORKER;
}

function kbCall(op, text, laneDetail, timeoutMs) {
  return new Promise((resolve) => {
    if (!ensureKbWorker()) return resolve({ ok: false, error: "KB_WORKER_NOT_AVAILABLE" });

    const id = "q_" + Date.now() + "_" + Math.random().toString(36).slice(2);
    const timer = setTimeout(() => {
      PENDING.delete(id);
      resolve({ ok: false, timedOut: true });
    }, timeoutMs);

    PENDING.set(id, { resolve, timer });

    try {
      KB_WORKER.postMessage({ id, op, text, laneDetail });
    } catch {
      clearTimeout(timer);
      PENDING.delete(id);
      resolve({ ok: false, error: "KB_POST_FAILED" });
    }
  });
}

async function kbStats(timeoutMs = 700) {
  const r = await kbCall("stats", "", {}, timeoutMs);
  return r?.ok ? r?.out?.stats : null;
}

// Cache stats for fast year-range fallback
let KB_STATS_CACHE = null;
let KB_STATS_LAST = 0;
const KB_STATS_REFRESH_MS = 1000 * 60 * 5;

async function ensureKbStatsFresh() {
  const now = Date.now();
  if (KB_STATS_CACHE && (now - KB_STATS_LAST) < KB_STATS_REFRESH_MS) return KB_STATS_CACHE;
  const stats = await kbStats(700).catch(() => null);
  if (stats) {
    KB_STATS_CACHE = stats;
    KB_STATS_LAST = now;
  }
  return KB_STATS_CACHE;
}

// =======================================================
// COPY + CONTINUATIONS
// =======================================================
function pickOne(arr, fallback = "") {
  if (!Array.isArray(arr) || arr.length === 0) return fallback;
  return arr[Math.floor(Math.random() * arr.length)];
}


function hashText(text) {
  try {
    return crypto.createHash("sha1").update(String(text || "")).digest("hex");
  } catch {
    return String(text || "");
  }
}

function setAnchor(sess, patch) {
  sess.anchor = safeObj(sess.anchor);
  Object.assign(sess.anchor, patch || {});
  sess.anchor.chart = safeStr(sess.anchor.chart) || sess.laneDetail?.chart || DEFAULT_CHART;
}

function setLastGood(sess, pick) {
  if (!pick || typeof pick !== "object") return;
  sess.lastGood = safeObj(sess.lastGood);
  if (pick.year != null) sess.lastGood.year = pick.year;
  if (pick.chart) sess.lastGood.chart = pick.chart;
  if (pick.artist) sess.lastGood.artist = pick.artist;
  if (pick.title) sess.lastGood.title = pick.title;
  sess.lastGood.chart = safeStr(sess.lastGood.chart) || sess.laneDetail?.chart || DEFAULT_CHART;
}

function setLastPick(sess, pick) {
  if (!pick || typeof pick !== "object") return;
  const clean = {
    artist: safeStr(pick.artist),
    title: safeStr(pick.title),
    year: Number.isFinite(Number(pick.year)) ? Number(pick.year) : null,
    chart: safeStr(pick.chart) || sess?.laneDetail?.chart || DEFAULT_CHART
  };

  sess.lastPick = clean;

  // Anchor always updates to the latest surfaced context
  setAnchor(sess, {
    year: clean.year,
    chart: clean.chart,
    artist: clean.artist || null,
    title: clean.title || null
  });

  // Only mark lastGood when we have a well-formed pick
  const ok = !!clean.artist && !!clean.title && Number.isFinite(clean.year);
  if (ok) setLastGood(sess, clean);
}

function getContextYear(sess) {
  const y1 = Number(sess?.laneDetail?.year);
  const y2 = Number(sess?.anchor?.year);
  const y3 = Number(sess?.lastGood?.year);
  const y4 = Number(sess?.lastPick?.year);
  if (Number.isFinite(y1)) return y1;
  if (Number.isFinite(y2)) return y2;
  if (Number.isFinite(y3)) return y3;
  if (Number.isFinite(y4)) return y4;
  return null;
}

function getContextChart(sess) {
  return safeStr(sess?.laneDetail?.chart) || safeStr(sess?.anchor?.chart) || safeStr(sess?.lastGood?.chart) || DEFAULT_CHART;
}

/**
 * normalizeTopListEntry()
 * Primary normalization (legacy) — keep as-is.
 */
function normalizeTopListEntry(artist, title) {
  let a = String(artist || "").trim();
  let t = String(title || "").trim();

  if (!a || !t) return { artist: a, title: t };

  // Clean trailing punctuation quirks
  t = t.replace(/\s+[,]+$/, "").trim();

  // If title ends with a dangling capitalized name chunk, move it to artist.
  // Example: artist="Richie", title="Hello Lionel" => "Lionel Richie" / "Hello"
  // NOTE: This is broad; we keep it but add a safer, chart-scoped self-check below.
  const words = t.split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    for (let k = 1; k <= 6 && k < words.length; k++) {
      const tail = words.slice(words.length - k);
      const head = words.slice(0, words.length - k);

      const looksNamey = tail.every(w =>
        /^[A-Z]/.test(w) ||
        ["and", "&", "of", "the", "mc", "jr.", "jr"].includes(w.toLowerCase()) ||
        /,$/.test(w)
      );

      if (!looksNamey) continue;
      if (head.join(" ").length < 3) continue;

      if (/^jr\.?$/i.test(a)) {
        const fixedArtist = `${tail.join(" ").replace(/\s+[,]+$/, "")}, Jr.`.replace(/\s+/g, " ").trim();
        return { artist: fixedArtist, title: head.join(" ").trim() };
      }

      const candidateArtist = `${tail.join(" ")} ${a}`.replace(/\s+/g, " ").trim();
      const candidateTitle = head.join(" ").trim();
      return { artist: candidateArtist, title: candidateTitle };
    }
  }

  return { artist: a, title: t };
}

// =======================================================
// LIGHTWEIGHT TOP-LIST SELF-CHECK (render-time, conservative)
// =======================================================
const TOPLIST_SELF_CHECK_ENABLED = String(process.env.TOPLIST_SELF_CHECK || "1") !== "0";

// Protect 1-word legacy acts from accidental “title-word stealing” regressions.
const SELFCHK_PROTECTED_ONEWORD = new Set(["prince", "yes", "heart"]);

// Known Top40 drift repair patterns (safe, specific)
function selfCheckRepairTop40(artist, title) {
  const a0 = String(artist || "").trim();
  const t0 = String(title || "").trim();

  if (!a0 || !t0) return { artist: a0, title: t0, changed: false };

  const aLower = a0.toLowerCase();
  if (SELFCHK_PROTECTED_ONEWORD.has(aLower)) {
    return { artist: a0, title: t0, changed: false };
  }

  // Work on token boundaries
  const tWords = t0.split(/\s+/).filter(Boolean);
  const lastWord = tWords.length ? tWords[tWords.length - 1] : "";

  function dropLastWord() {
    if (tWords.length <= 1) return t0;
    return tWords.slice(0, -1).join(" ").trim();
  }

  // 1) Paul McCartney & MJ duet (missing lead “Paul”)
  // artist: "McCartney and Michael Jackson" | title ends with "Paul"
  if (/^mccartney\s+and\s+mic\w*\s+jackson$/i.test(a0) && /^Paul$/i.test(lastWord)) {
    return { artist: `Paul ${a0}`.replace(/\s+/g, " ").trim(), title: dropLastWord(), changed: true };
  }

  // 2) Ray Parker, Jr. (missing lead “Ray”)
  // artist: "Parker, Jr." | title ends with "Ray"
  if (/^parker,\s*j r\.?$|^parker,\s*jr\.?$/i.test(a0.replace(/\s+/g, " ")) && /^Ray$/i.test(lastWord)) {
    return { artist: `Ray ${a0}`.replace(/\s+/g, " ").trim(), title: dropLastWord(), changed: true };
  }
  if (/^parker,\s*jr\.?$/i.test(a0) && /^Ray$/i.test(lastWord)) {
    return { artist: `Ray ${a0}`.replace(/\s+/g, " ").trim(), title: dropLastWord(), changed: true };
  }

  // 3) Van Halen particle
  if (/^halen$/i.test(a0) && /^Van$/i.test(lastWord)) {
    return { artist: "Van Halen", title: dropLastWord(), changed: true };
  }

  // 4) Lionel Richie
  if (/^richie$/i.test(a0) && /^Lionel$/i.test(lastWord)) {
    return { artist: "Lionel Richie", title: dropLastWord(), changed: true };
  }

  // 5) Culture Club
  if (/^club$/i.test(a0) && /^Culture$/i.test(lastWord)) {
    return { artist: "Culture Club", title: dropLastWord(), changed: true };
  }

  return { artist: a0, title: t0, changed: false };
}

function applyToplistSelfCheck(entries, chart, logKey = "") {
  if (!TOPLIST_SELF_CHECK_ENABLED) return { entries, changed: false };
  if (String(chart || "") !== "Top40Weekly Top 100") return { entries, changed: false };
  if (!Array.isArray(entries) || entries.length === 0) return { entries: Array.isArray(entries) ? entries : [], changed: false };

  let changed = false;
  const out = entries.map((m) => {
    const a = m?.artist;
    const t = m?.title;
    const fixed = selfCheckRepairTop40(a, t);
    if (fixed.changed) changed = true;

    if (!fixed.changed) return m;
    return { ...m, artist: fixed.artist, title: fixed.title, _selfcheck: true };
  });

  if (changed) {
    console.log(`[Nyx][SelfCheck] Top40 list repaired at render-time (k=${logKey || "n/a"})`);
  }

  return { entries: out, changed };
}

// =======================================================
// COPY HELPERS
// =======================================================
function correctionPreface(best, bestMeta) {
  if (!best || typeof best !== "object") return "";

  const inputYear = best._originalYear || best._inputYear || best._input_year || null;
  const inputChart = best._originalChart || best._inputChart || null;

  const parts = [];

  if (best._correctedYear && inputYear && best.year && Number(inputYear) !== Number(best.year)) {
    parts.push(`Quick correction — anchoring to ${best.year} (not ${inputYear}).`);
  }

  // Explicit chart correction flags (legacy path)
  if (best._correctedChart && inputChart && best.chart && String(inputChart) !== String(best.chart)) {
    parts.push(`Chart note — using ${best.chart} (not ${inputChart}).`);
  }

  // Meta-aware fallback note (new path)
  if (!best._correctedChart && bestMeta && typeof bestMeta === "object") {
    if (bestMeta.usedFallback && bestMeta.requestedChart && bestMeta.usedChart && String(bestMeta.usedChart) !== String(bestMeta.requestedChart)) {
      parts.push(`Chart note — no entries on ${bestMeta.requestedChart} for that year, so I pulled from ${bestMeta.usedChart}.`);
    }
  }

  return parts.length ? (parts.join(" ") + "\n\n") : "";
}

function yearPickFollowups(chart) {
  const c = chart || DEFAULT_CHART;
  return [
    `Want the **Top 10** for that year, the **#1**, or a **surprise pick**?`,
    `Stay on ${c}, or switch charts (UK / Canada / Top40Weekly)?`,
    `Same artist, or new artist?`,
    `Want the story behind it, or another pick?`
  ];
}

function musicContinuations(chart) {
  const c = chart || DEFAULT_CHART;
  return [
    `Want another from the same year, or should we jump? (Example: 1987)`,
    `Same chart, or switch? (Current: ${c})`,
    `Same artist, or new artist?`,
    `Want the story behind this song, or another pick?`
  ];
}

function formatYearsForSuggestion(years, inputYear) {
  if (!Array.isArray(years) || years.length === 0) return null;

  const unique = Array.from(new Set(years.filter((y) => Number.isFinite(Number(y))).map((y) => Number(y)))).sort((a, b) => a - b);
  if (unique.length === 0) return null;

  const around = Number.isFinite(Number(inputYear)) ? Number(inputYear) : null;

  if (around != null) {
    unique.sort((a, b) => Math.abs(a - around) - Math.abs(b - around));
  }
  const head = unique.slice(0, 6);
  const closest = around != null ? head[0] : head[0];

  return { closest, list: head.sort((a, b) => a - b), total: unique.length };
}

// =======================================================
// SMART MUSIC FLOW (with follow-up intelligence + year guarantee)
// =======================================================
async function handleMusic(req, res, key, sess, rawText) {
  const text = normalizeUserText(rawText);

  const chartFromText = parseChartFromText(text);
  if (chartFromText) sess.laneDetail.chart = chartFromText;

  // --- FOLLOW-UP COMMANDS (no year typed, but we have context) ---
  const ctxYearFromSlots = sess?.laneDetail?.year ? Number(sess.laneDetail.year) : null;
  const ctxYearFromLastPick = sess?.lastPick?.year ? Number(sess.lastPick.year) : null;
  const ctxYear = Number.isFinite(ctxYearFromSlots) ? ctxYearFromSlots : (Number.isFinite(ctxYearFromLastPick) ? ctxYearFromLastPick : null);

  const ctxChart = sess?.laneDetail?.chart || DEFAULT_CHART;

  if (!isYearOnlyLoose(text) && !parseArtistTitle(text) && ctxYear && isFollowupCommand(text)) {
    const n = wantsTopN(text);
    const wants1 = wantsNumberOne(text);
    const wantsMore = wantsAnother(text) || wantsSurprise(text);
    const wantsWhy = wantsStory(text);

    // Top N list
    if (n || wants1) {
      const wantedN = wants1 ? 1 : n;
      const kbTop = await kbCall("topByYear", "", { year: ctxYear, n: wantedN, chart: ctxChart }, KB_TIMEOUT_MS);
      if (!kbTop.ok) {
        return send(res, key, sess, "kb_timeout", "I’m loading the charts — try that again in a moment.", false, text);
      }
      let list = Array.isArray(kbTop?.out?.top) ? kbTop.out.top : [];
      let listChart = ctxChart;

      if (!list.length) {
        // fallback to Top40Weekly Top 100 for the same year
        const kbTop2 = await kbCall("topByYear", "", { year: ctxYear, n: wantedN, chart: "Top40Weekly Top 100" }, KB_TIMEOUT_MS);
        list = Array.isArray(kbTop2?.out?.top) ? kbTop2.out.top : [];
        listChart = "Top40Weekly Top 100";

        if (!list.length) {
          return send(res, key, sess, "music_top_nohit", `I don’t have a Top list indexed for ${ctxYear} yet. Try another year (example: 1987).`, false, text);
        }
      }

      // Apply conservative self-check only for Top40Weekly Top 100
      const checked = applyToplistSelfCheck(list, listChart, `sid=${key}|y=${ctxYear}|n=${wantedN}`);
      list = checked.entries;

      if (wantedN === 1) {
        const best = list[0];
        const nrm = normalizeTopListEntry(best.artist, best.title);
        setLastPick(sess, {
artist: nrm.artist || best.artist, title: nrm.title || best.title, year: best.year, chart: best.chart || listChart
});
        return send(
          res, key, sess, "music_number_one",
          `${nrm.artist || best.artist} — "${nrm.title || best.title}" (${best.year})\nChart: ${best.chart || listChart}\n\nWant the **Top 10**, another pick, or switch charts?`,
          true,
          text
        );
      }

      const lines = list.map((m, i) => {
        const nrm = normalizeTopListEntry(m.artist, m.title);
        return `${i + 1}. ${nrm.artist} — "${nrm.title}"`;
      });

      const headerChart = (listChart === "Top40Weekly Top 100") ? "Top40Weekly Top 100" : `${ctxChart} preference`;
      // Anchor the year+chart when we show a list
      setAnchor(sess, { year: ctxYear || null, chart: listChart });
      return send(
        res,
        key,
        sess,
        "music_top_list",
        `Top ${wantedN} for ${ctxYear} (${headerChart}):\n${lines.join("\n")}\n\nWant **#1**, a **surprise pick**, or jump to a new year?`,
        true,
        text
      );
    }

    // Another / Surprise pick in same year
    if (wantsMore) {
      let tries = 0;
      let best = null;

      while (tries < 5 && !best) {
        const kbRand = await kbCall("randomByYear", "", { year: ctxYear, chart: ctxChart }, KB_TIMEOUT_MS);
        if (!kbRand.ok) break;
        const candidate = kbRand?.out?.best || null;
        if (!candidate) break;

        const last = sess.lastPick;
        if (last && candidate.artist === last.artist && candidate.title === last.title && Number(candidate.year) === Number(last.year)) {
          tries++;
          continue;
        }
        best = candidate;
      }

      if (!best) {
        return send(res, key, sess, "music_more_nohit", `I couldn’t pull another pick for ${ctxYear} just yet. Try “top 10” or switch year (example: 1987).`, false, text);
      }

      // Self-check (only if the returned pick is Top40Weekly Top 100)
      let bestArtist = best.artist;
      let bestTitle = best.title;
      if (TOPLIST_SELF_CHECK_ENABLED && String(best.chart || ctxChart) === "Top40Weekly Top 100") {
        const fixed = selfCheckRepairTop40(bestArtist, bestTitle);
        if (fixed.changed) {
          console.log(`[Nyx][SelfCheck] Top40 pick repaired at render-time (sid=${key}|y=${ctxYear})`);
          bestArtist = fixed.artist;
          bestTitle = fixed.title;
        }
      }

      setLastPick(sess, {
artist: bestArtist, title: bestTitle, year: best.year, chart: best.chart
});
      const chart = best.chart || ctxChart;
      return send(
        res,
        key,
        sess,
        "music_another_pick",
        `${bestArtist} — "${bestTitle}" (${best.year})\nChart: ${chart}\n\nWant **top 10**, **#1**, or another surprise?`,
        true,
        text
      );
    }

    // Story / context (lightweight)
    if (wantsWhy && sess.lastPick) {
      const lp = sess.lastPick;
      return send(
        res,
        key,
        sess,
        "music_story_light",
        `Quick context for **${lp.artist} — "${lp.title}" (${lp.year})**:\nIt’s one of those “time-capsule” tracks — the kind that defines the texture of the year.\n\nWant the **Top 10**, **#1**, or should I throw you another pick from ${lp.year}?`,
        true,
        text
      );
    }

    return send(
      res,
      key,
      sess,
      "music_followup_help",
      `For ${ctxYear}, say **top 10**, **#1**, **another**, or switch charts (UK / Canada / Top40Weekly).`,
      true,
      text
    );
  }

  // YEAR-ONLY input => direct pick (never ask for artist/title)
  if (isYearOnlyLoose(text)) {
    const y = extractYearLoose(text);
    sess.laneDetail = { chart: sess.laneDetail.chart || DEFAULT_CHART, year: y };
    setAnchor(sess, { year: y, chart: sess.laneDetail.chart });

    // 1) Query path (worker will do year-first + meta-aware random)
    const kbResult = await kbCall("query", text, sess.laneDetail, KB_TIMEOUT_MS);
    if (!kbResult.ok) {
      return send(res, key, sess, "kb_timeout", "I’m loading the music library — try that year again in a moment.", false, text);
    }

    let best = kbResult?.out?.best || null;
    let bestMeta = kbResult?.out?.bestMeta || null;

    // 2) If no hit: try randomByYear op (meta-aware)
    if (!best) {
      const kbRand = await kbCall("randomByYear", "", { year: y, chart: sess.laneDetail.chart }, KB_TIMEOUT_MS);
      if (kbRand?.ok) {
        best = kbRand?.out?.best || null;
        bestMeta = kbRand?.out?.meta || null;
      }
    }

    // 3) If still no hit: clamp to closest available year, randomByYear meta-aware
    if (!best) {
      const stats = await ensureKbStatsFresh();
      const closest = clampYearToStats(y, stats);
      if (closest != null) {
        const kbClosest = await kbCall("randomByYear", "", { year: closest, chart: sess.laneDetail.chart }, KB_TIMEOUT_MS);
        if (kbClosest?.ok) {
          best = kbClosest?.out?.best || null;
          bestMeta = kbClosest?.out?.meta || null;
          if (best && closest !== y) {
            best._correctedYear = true;
            best._originalYear = y;
          }
        }
      }
    }

    if (best) {
      // Self-check only if Top40Weekly Top 100
      let bestArtist = best.artist;
      let bestTitle = best.title;
      if (TOPLIST_SELF_CHECK_ENABLED && String(best.chart || bestMeta?.usedChart || sess.laneDetail.chart) === "Top40Weekly Top 100") {
        const fixed = selfCheckRepairTop40(bestArtist, bestTitle);
        if (fixed.changed) {
          console.log(`[Nyx][SelfCheck] Top40 year-pick repaired at render-time (sid=${key}|y=${y})`);
          bestArtist = fixed.artist;
          bestTitle = fixed.title;
        }
      }

      setLastPick(sess, {
artist: bestArtist, title: bestTitle, year: best.year, chart: best.chart
});
      const preface = correctionPreface(best, bestMeta);
      const chart = best.chart || (bestMeta?.usedChart) || sess.laneDetail.chart || DEFAULT_CHART;
      const followUp = pickOne(yearPickFollowups(chart), "Want another year?");
      return send(
        res,
        key,
        sess,
        "music_year_pick",
        `${preface}${bestArtist} — "${bestTitle}" (${best.year})\nChart: ${chart}\n\n${followUp}`,
        true,
        text
      );
    }

    const stats2 = await ensureKbStatsFresh();
    const min = stats2?.yearMin;
    const max = stats2?.yearMax;
    const rangeNote = (Number.isFinite(min) && Number.isFinite(max))
      ? ` I currently have coverage from about ${min} to ${max}.`
      : "";

    return send(
      res,
      key,
      sess,
      "music_year_nohit",
      `I don’t have a hit indexed for ${y} yet.${rangeNote} Try another year — or say “top 100” to use the Top40Weekly year-end list.`,
      false,
      text
    );
  }

  // Artist - Title path
  const at = parseArtistTitle(text);
  if (at) {
    sess.laneDetail.artist = at.artist;
    sess.laneDetail.title = at.title;
    const y = extractYearLoose(text);
    if (y) sess.laneDetail.year = y;
  } else {
    const y = extractYearLoose(text);
    if (y) sess.laneDetail.year = y;
  }

  const kbResult = await kbCall("query", text, sess.laneDetail, KB_TIMEOUT_MS);
  if (!kbResult.ok) {
    return send(res, key, sess, "kb_timeout", "I’m loading the music library — try again in a moment.", false, text);
  }

  const best = kbResult?.out?.best || null;
  const years = kbResult?.out?.years || null;

  if (best) {
    // Self-check only if Top40Weekly Top 100
    let bestArtist = best.artist;
    let bestTitle = best.title;
    if (TOPLIST_SELF_CHECK_ENABLED && String(best.chart || sess.laneDetail.chart) === "Top40Weekly Top 100") {
      const fixed = selfCheckRepairTop40(bestArtist, bestTitle);
      if (fixed.changed) {
        console.log(`[Nyx][SelfCheck] Top40 answer repaired at render-time (sid=${key})`);
        bestArtist = fixed.artist;
        bestTitle = fixed.title;
      }
    }

    setLastPick(sess, {
artist: bestArtist, title: bestTitle, year: best.year, chart: best.chart
});
    const preface = correctionPreface(best, null);
    const chart = best.chart || sess.laneDetail.chart || DEFAULT_CHART;
    const followUp = pickOne(musicContinuations(chart), "Want another pick?");
    return send(res, key, sess, "music_answer", `${preface}${bestArtist} — "${bestTitle}" (${best.year})\nChart: ${chart}\n\n${followUp}`, true, text);
  }

  // Smarter fallback: suggest nearest available year for artist+title
  const inputYear = sess?.laneDetail?.year ? Number(sess.laneDetail.year) : null;
  const hasArtist = !!sess?.laneDetail?.artist;
  const hasTitle = !!sess?.laneDetail?.title;

  if (hasArtist && hasTitle) {
    const suggestion = formatYearsForSuggestion(years, inputYear);
    if (suggestion) {
      const listText = suggestion.list.join(", ");
      return send(
        res,
        key,
        sess,
        "music_suggest_years",
        `I might have you a year off.\nI do have **${sess.laneDetail.artist} — "${sess.laneDetail.title}"** in: ${listText}${suggestion.total > suggestion.list.length ? " …" : ""}\n\nReply with just **${suggestion.closest}** and I’ll anchor it and keep rolling.`,
        true,
        text
      );
    }
  }

  return send(
    res,
    key,
    sess,
    "music_not_found",
    `I didn’t lock that in yet — but we can still get there.\nTry:\n• **1984** (year-only)\n• **Artist - Title** (example: Styx - Babe)\n• add “top 100” if you want the year-end list`,
    false,
    text
  );
}

// =======================================================
// ROUTES
// =======================================================
app.post("/api/sandblast-gpt", async (req, res) => {
  const text = safeStr(req.body?.message);
  const { key, sess } = resolveSession(req);

  if (!text) {
    return send(res, key, sess, "empty", "Send a year (example: 1984) or Artist - Title (optional year).", false, text);
  }

  const t = normalizeUserText(text);

  // Loop-break tracking (v1.95)
  const h = hashText(t.toLowerCase());
  if (sess.lastUserHash && sess.lastUserHash === h) sess.repeatCount = (sess.repeatCount || 0) + 1;
  else { sess.repeatCount = 0; sess.lastUserHash = h; }

  const musicish = looksLikeMusicQuery(t, sess);

  // Fluid conversation layer (only when it's not clearly a music query)
  if (!musicish) {
    if (sess.dialogStage === "new" && isGreeting(t)) {
      sess.dialogStage = "asked_how_are_you";
      return send(res, key, sess, "greet_1", pickOne([
        "Hey — good to see you. How are you doing today?",
        "Hi there. How’s your day going so far?",
        "Hey. How are you feeling today?"
      ], "Hey — how are you today?"), true, t);
    }

    if (sess.dialogStage === "asked_how_are_you" && (isPositiveOrStatusReply(t) || t.length <= 50)) {
      sess.dialogStage = "ready";
      return send(res, key, sess, "greet_2", pickOne([
        "Love that. What can I help you with today? If it’s music, give me a year like **1984** or **Artist - Title**.",
        "Good — let’s make progress. What do you want to do today? For music: **1984** or **Artist - Title**.",
        "Alright. What are we working on? If you want music, hit me with **1984** or **Artist - Title**."
      ], "Got it. What can I help you with?"), true, t);
    }

    if (isHowAreYou(t) && sess.dialogStage !== "ready") {
      sess.dialogStage = "ready";
      return send(res, key, sess, "greet_howareyou", "I’m good — focused and ready to work. What do you want to do next? For music: **1984** or **Artist - Title**.", true, t);
    }
  }

  // Loop-breaker: if the same user text repeats, switch tactics instead of re-running the same path.
  if (musicish && typeof sess.repeatCount === "number" && sess.repeatCount >= 2) {
    const y = getContextYear(sess);
    const c = getContextChart(sess);

    // Reset after we intervene to avoid permanent “stuck” state.
    sess.repeatCount = 0;

    const options = y
      ? `Try one of these for ${y} (${c}):\n• **top 10**\n• **#1**\n• **surprise pick**\n• **switch chart** (UK / Canada / Top40Weekly)`
      : `Try one of these:\n• Reply with a **year** (example: 1989)\n• Reply with **Artist - Title** (example: Paula Abdul - Straight Up)\n• Say **top 10** for a list`;

    return send(
      res,
      key,
      sess,
      "loop_break",
      `I’m repeating the same path, so I’m switching tactics.\n\n${options}`,
      true,
      t
    );
  }

  if (sess.dialogStage !== "ready") sess.dialogStage = "ready";
  return handleMusic(req, res, key, sess, t);
});

app.get("/api/health", async (_, res) => {
  const stats = await kbStats(700).catch(() => null);
  res.json({
    ok: true,
    build: BUILD_TAG,
    commit: COMMIT_SHORT || null,
    serverTime: nowIso(),
    kbTimeoutMs: KB_TIMEOUT_MS,
    kbWorkerReady: KB_READY,
    kbMoments: stats ? stats.moments : null,
    kbYearMin: stats ? stats.yearMin : null,
    kbYearMax: stats ? stats.yearMax : null,
    kbCharts: stats ? stats.charts : null,
    kbError: stats && stats.error ? stats.error : null,
    toplistSelfCheck: TOPLIST_SELF_CHECK_ENABLED ? "on" : "off"
  });
});

// Debug snapshot (safe): last request/session summary
app.get("/api/debug/last", (req, res) => {
  const token = safeStr(req.query?.token || "");
  const expected = safeStr(process.env.DEBUG_TOKEN || "");

  // If you set DEBUG_TOKEN, require it. If not set, allow (internal use).
  if (expected && token !== expected) {
    return res.status(403).json({ ok: false, error: "FORBIDDEN" });
  }

  res.json({ ok: true, ...LAST_DEBUG });
});

app.listen(PORT, () => {
  console.log(`[Nyx] up on ${PORT} (${BUILD_TAG}) timeout=${KB_TIMEOUT_MS}ms`);
  startKbWorker();

  // warm stats cache (best-effort)
  ensureKbStatsFresh().catch(() => {});
});

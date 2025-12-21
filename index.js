/**
 * index.js — Nyx Broadcast Backend (Wizard-Locked)
 * Build: nyx-wizard-v1.85-2025-12-21
 *
 * Fixes in v1.85:
 * 1) YEAR-ONLY INPUT IS ALWAYS A DIRECT PICK (no wizard confusion):
 *    - If user sends just "1984", we overwrite year, clear artist/title, and return a moment immediately.
 *    - Prevents “it shouldn’t do this” behavior (asking for artist/title or NOT_FOUND after a year-only).
 * 2) Keeps prior fixes: relaxed retry for artist+title+wrong year, correction preface, fluid greetings.
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

  function handleJob(msg) {
    const id = msg && msg.id;
    const text = String(msg && msg.text ? msg.text : "").trim();
    const laneDetail =
      (msg && msg.laneDetail && typeof msg.laneDetail === "object") ? msg.laneDetail : {};

    if (!id) return;

    try {
      if (!musicKB) {
        musicKB = require("./Utils/musicKnowledge");
      }

      const out = {
        year: safe(() => musicKB.extractYear?.(text), null),
        artist: safe(() => musicKB.detectArtist?.(text), null),
        title: safe(() => musicKB.detectTitle?.(text), null),
        chart: safe(() => musicKB.normalizeChart?.(laneDetail?.chart), laneDetail?.chart || null),
        best: null
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
        const randFn = musicKB.pickRandomByYear;
        if (typeof randFn === "function") {
          out.best = safe(() => randFn(slots.year, slots.chart), null);
        }
        if (!out.best) {
          out.best = safe(() => musicKB.pickBestMoment?.(null, slots), null);
        }
      } else {
        out.best = safe(() => musicKB.pickBestMoment?.(null, slots), null);

        // Relaxed retry: artist+title+year mismatch -> drop year
        if (!out.best && hasArtist && hasTitle && hasYear) {
          const relaxed = { ...slots };
          delete relaxed.year;

          const relaxedBest = safe(() => musicKB.pickBestMoment?.(null, relaxed), null);
          if (relaxedBest) {
            const corrected = { ...relaxedBest };
            corrected._correctedYear = true;
            corrected._originalYear = slots.year;
            out.best = corrected;
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
          }
        }
      }

      parentPort.postMessage({ id, ok: true, out });
    } catch (e) {
      parentPort.postMessage({ id, ok: false, error: String(e && e.message ? e.message : e) });
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
const BUILD_TAG = "nyx-wizard-v1.85-2025-12-21";
const DEFAULT_CHART = "Billboard Hot 100";
const KB_TIMEOUT_MS = Number(process.env.KB_TIMEOUT_MS || 2000);

// ---------------- SESSION ----------------
const SESS = new Map();
const SESSION_TTL_MS = 1000 * 60 * 60 * 6;
const CLEANUP_EVERY_MS = 1000 * 60 * 10;

const STEPS = {
  MUSIC_START: "MUSIC_START",
  MUSIC_YEAR_FIRST: "MUSIC_YEAR_FIRST",
  MUSIC_NEED_ARTIST: "MUSIC_NEED_ARTIST",
  MUSIC_NEED_TITLE: "MUSIC_NEED_TITLE",
  MUSIC_NEED_YEAR: "MUSIC_NEED_YEAR",
  MUSIC_LOOKUP: "MUSIC_LOOKUP",
  MUSIC_RESULT: "MUSIC_RESULT",
  MUSIC_NOT_FOUND: "MUSIC_NOT_FOUND",
  MUSIC_ESCALATE: "MUSIC_ESCALATE"
};

function sid() {
  try { return crypto.randomUUID(); }
  catch { return "sid_" + Date.now() + "_" + Math.random().toString(36).slice(2); }
}

function nowIso() { return new Date().toISOString(); }
function safeStr(x) { return String(x == null ? "" : x).trim(); }
function safeObj(x) { return x && typeof x === "object" ? x : {}; }
function touch(sess) { sess.lastSeen = Date.now(); }

setInterval(() => {
  const now = Date.now();
  for (const [k, s] of SESS.entries()) {
    if (!s || !s.lastSeen) continue;
    if (now - s.lastSeen > SESSION_TTL_MS) SESS.delete(k);
  }
}, CLEANUP_EVERY_MS).unref?.();

function clampInt(n, min, max, fallback) {
  const x = Number(n);
  if (!Number.isFinite(x)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(x)));
}

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

function parseChartFromText(text) {
  const t = normalizeUserText(text).toLowerCase();
  if (!t) return null;

  if (/\btop40weekly\b|\btop 40 weekly\b/.test(t)) return "Top40Weekly";
  if (/\bcanada\b|\brpm\b|\bcanada rpm\b/.test(t)) return "Canada RPM";
  if (/\buk\b|\buk singles\b|\buk singles chart\b/.test(t)) return "UK Singles Chart";
  if (/\bbillboard\b|\bhot 100\b|\bbillboard hot 100\b/.test(t)) return "Billboard Hot 100";

  return null;
}

function isArtistEqualsTitle(artist, title) {
  const a = String(artist || "").trim().toLowerCase();
  const t = String(title || "").trim().toLowerCase();
  return !!a && !!t && a === t;
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
  if (isArtistEqualsTitle(artist, title)) return null;

  return { artist, title };
}

function correctionPreface(best) {
  if (!best || typeof best !== "object") return "";
  const parts = [];

  if (best._correctedYear && best._originalYear && best.year && best._originalYear !== best.year) {
    parts.push(`Quick correction — anchoring to ${best.year} (not ${best._originalYear}).`);
  }
  if (best._correctedChart && best._originalChart && best.chart && best._originalChart !== best.chart) {
    parts.push(`Chart note — using ${best.chart} (not ${best._originalChart}).`);
  }

  return parts.length ? (parts.join(" ") + "\n\n") : "";
}

function pickOne(arr, fallback = "") {
  if (!Array.isArray(arr) || arr.length === 0) return fallback;
  return arr[Math.floor(Math.random() * arr.length)];
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

// ---------------- SEND ----------------
function send(res, sessionId, sess, step, reply, advance = false) {
  sess.lastReply = reply;
  sess.lastReplyStep = step;

  res.status(200).json({
    ok: true,
    reply,
    state: {
      mode: sess.currentLane,
      step,
      advance,
      wizardStep: sess.step,
      slots: sess.laneDetail || {}
    },
    meta: {
      sessionId,
      build: BUILD_TAG,
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
      greeted: false,
      greetStage: 0,
      step: STEPS.MUSIC_START,
      lastRequestId: "",
      lastReply: "",
      lastReplyStep: "",
      lastSeen: Date.now()
    };
    SESS.set(key, sess);
  } else {
    touch(sess);
  }

  sess.laneDetail = safeObj(sess.laneDetail);
  sess.laneDetail.chart = safeStr(sess.laneDetail.chart) || DEFAULT_CHART;
  sess.currentLane = safeStr(sess.currentLane) || "music_history";
  sess.step = safeStr(sess.step) || STEPS.MUSIC_START;

  sess.greeted = !!sess.greeted;
  sess.greetStage = clampInt(sess.greetStage, 0, 2, 0);

  sess.lastRequestId = safeStr(sess.lastRequestId);
  sess.lastReply = safeStr(sess.lastReply);
  sess.lastReplyStep = safeStr(sess.lastReplyStep);

  return { key, sess };
}

// =======================================================
// KB WORKER (singleton)
// =======================================================
let KB_WORKER = null;
let KB_READY = false;
const PENDING = new Map();

function startKbWorker() {
  KB_READY = false;
  try {
    KB_WORKER = new Worker(__filename);
  } catch (e) {
    console.error("[Nyx][KB] Failed to start worker:", e);
    KB_WORKER = null;
    return;
  }

  KB_WORKER.on("message", (msg) => {
    if (msg && msg.ready) {
      KB_READY = true;
      return;
    }
    const id = msg && msg.id;
    if (!id) return;

    const pending = PENDING.get(id);
    if (!pending) return;

    clearTimeout(pending.timer);
    PENDING.delete(id);
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
    setTimeout(() => startKbWorker(), 250).unref?.();
  });
}

function ensureKbWorker() {
  if (!KB_WORKER) startKbWorker();
  return !!KB_WORKER;
}

function restartKbWorker() {
  try { if (KB_WORKER) KB_WORKER.terminate().catch(() => {}); } catch {}
  KB_WORKER = null;
  KB_READY = false;
  startKbWorker();
}

function kbQuery(text, laneDetail, timeoutMs) {
  return new Promise((resolve) => {
    if (!ensureKbWorker()) return resolve({ ok: false, error: "KB_WORKER_NOT_AVAILABLE" });

    const id = "q_" + Date.now() + "_" + Math.random().toString(36).slice(2);
    const timer = setTimeout(() => {
      PENDING.delete(id);
      restartKbWorker();
      resolve({ ok: false, timedOut: true });
    }, timeoutMs);

    PENDING.set(id, { resolve, timer });

    try {
      KB_WORKER.postMessage({ id, text, laneDetail });
    } catch {
      clearTimeout(timer);
      PENDING.delete(id);
      resolve({ ok: false, error: "KB_POST_FAILED" });
    }
  });
}

// =======================================================
// MUSIC HANDLER
// =======================================================
async function handleMusic(req, res, key, sess, rawText) {
  const text = normalizeUserText(rawText);
  const chartFromText = parseChartFromText(text);
  if (chartFromText) sess.laneDetail.chart = chartFromText;

  // ===================================================
  // FIX: YEAR-ONLY INPUT IS A DIRECT PICK (hard rule)
  // ===================================================
  if (isYearOnlyLoose(text)) {
    const y = extractYearLoose(text);

    // overwrite year and clear other slots so we don't get trapped in prior wizard state
    sess.laneDetail = {
      chart: sess.laneDetail.chart || DEFAULT_CHART,
      year: y
    };
    sess.step = STEPS.MUSIC_LOOKUP;

    const kbResult = await kbQuery(text, sess.laneDetail, KB_TIMEOUT_MS);
    if (!kbResult.ok) {
      return send(res, key, sess, "kb_timeout_or_error", "I’m loading the music library — try that year again in a moment.", false);
    }

    const out = kbResult.out || {};
    const best = out.best || null;

    if (best) {
      const preface = correctionPreface(best);
      const chart = best.chart || sess.laneDetail.chart || DEFAULT_CHART;
      const followUp = pickOne(musicContinuations(chart), "Want another year?");

      return send(
        res,
        key,
        sess,
        "music_year_pick",
        `${preface}${best.artist} — "${best.title}" (${best.year})\nChart: ${chart}\n\n${followUp}`,
        true
      );
    }

    // If a year-only pick fails, we should *not* ask for artist/title. Just ask for a different year.
    return send(
      res,
      key,
      sess,
      "music_year_nohit",
      `I don’t have a hit indexed for ${y} on ${sess.laneDetail.chart || DEFAULT_CHART} yet. Try another year (example: 1987) — or switch chart (UK / Canada / Top40Weekly).`,
      false
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
    // allow year updates if user includes a year in a sentence
    if (y) sess.laneDetail.year = y;
  }

  const kbResult = await kbQuery(text, sess.laneDetail, KB_TIMEOUT_MS);
  if (!kbResult.ok) {
    return send(res, key, sess, "kb_timeout_or_error", "I’m loading the music library — try again in a moment.", false);
  }

  const out = kbResult.out || {};
  const best = out.best || null;

  if (best) {
    const preface = correctionPreface(best);
    const chart = best.chart || sess.laneDetail.chart || DEFAULT_CHART;
    const followUp = pickOne(musicContinuations(chart), "Want another pick?");

    return send(
      res,
      key,
      sess,
      "music_answer",
      `${preface}${best.artist} — "${best.title}" (${best.year})\nChart: ${chart}\n\n${followUp}`,
      true
    );
  }

  // Not found (artist/title flows only). Year-only never reaches this.
  return send(
    res,
    key,
    sess,
    "music_not_found",
    `I didn’t find that exact match yet.\nWhat I have: ${[
      sess.laneDetail.artist ? `artist=${sess.laneDetail.artist}` : null,
      sess.laneDetail.title ? `title=${sess.laneDetail.title}` : null,
      sess.laneDetail.year ? `year=${sess.laneDetail.year}` : null,
      sess.laneDetail.chart ? `chart=${sess.laneDetail.chart}` : null
    ].filter(Boolean).join(", ") || "none"}\n\nTry: Artist - Title (no year) and I’ll anchor the nearest year.`,
    false
  );
}

// =======================================================
// ROUTES
// =======================================================
app.post("/api/sandblast-gpt", async (req, res) => {
  const text = safeStr(req.body?.message);
  const { key, sess } = resolveSession(req);

  sess.currentLane = "music_history";
  sess.laneDetail = safeObj(sess.laneDetail);
  sess.laneDetail.chart = safeStr(sess.laneDetail.chart) || DEFAULT_CHART;

  if (!text) {
    return send(res, key, sess, "empty", "Send a year (example: 1984) or Artist - Title (optional year).", false);
  }

  return handleMusic(req, res, key, sess, text);
});

app.get("/api/health", (_, res) =>
  res.json({
    ok: true,
    build: BUILD_TAG,
    serverTime: nowIso(),
    kbTimeoutMs: KB_TIMEOUT_MS,
    kbWorkerReady: KB_READY
  })
);

app.listen(PORT, () => {
  console.log(`[Nyx] up on ${PORT} (${BUILD_TAG}) timeout=${KB_TIMEOUT_MS}ms`);
  startKbWorker();
});

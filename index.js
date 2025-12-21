/**
 * index.js — Nyx Broadcast Backend (Wizard-Locked)
 * Build: nyx-wizard-v1.87-healthstats-lock
 *
 * PURPOSE OF THIS BUILD:
 * - Prove which code is running on Render
 * - Expose KB visibility (moments / years / charts)
 * - Preserve existing music wizard + fallback logic
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
      const db = musicKB.getDb?.();
      const moments = Array.isArray(db?.moments) ? db.moments : [];

      let minYear = null;
      let maxYear = null;
      const charts = new Set();

      for (const m of moments) {
        const y = Number(m?.year);
        if (Number.isFinite(y)) {
          if (minYear === null || y < minYear) minYear = y;
          if (maxYear === null || y > maxYear) maxYear = y;
        }
        if (m?.chart) charts.add(m.chart);
      }

      return {
        moments: moments.length,
        yearMin: minYear,
        yearMax: maxYear,
        charts: Array.from(charts)
      };
    } catch (e) {
      return {
        moments: 0,
        error: String(e?.message || e)
      };
    }
  }

  function handleJob(msg) {
    const { id, op = "query", text = "", laneDetail = {} } = msg || {};
    if (!id) return;

    try {
      if (!musicKB) musicKB = require("./Utils/musicKnowledge");

      // ---- STATS MODE ----
      if (op === "stats") {
        return parentPort.postMessage({
          id,
          ok: true,
          out: computeStats()
        });
      }

      // ---- QUERY MODE ----
      const out = {
        best: null
      };

      const slots = { ...laneDetail };

      out.best = safe(() => musicKB.pickBestMoment?.(text, slots), null);

      parentPort.postMessage({ id, ok: true, out });
    } catch (e) {
      parentPort.postMessage({ id, ok: false, error: String(e?.message || e) });
    }
  }

  parentPort.on("message", handleJob);
  parentPort.postMessage({ ready: true });
  return;
}

// =======================================================
// MAIN THREAD
// =======================================================
const app = express();
app.set("trust proxy", true);
app.use(express.json({ limit: "2mb" }));
app.use(cors({ origin: true }));

const PORT = process.env.PORT || 3000;
const BUILD_TAG = "nyx-wizard-v1.87-healthstats-lock";
const KB_TIMEOUT_MS = Number(process.env.KB_TIMEOUT_MS || 900);

// ---------------- SESSION ----------------
const SESS = new Map();

// ---------------- KB WORKER ----------------
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
    const pending = PENDING.get(msg.id);
    if (!pending) return;
    clearTimeout(pending.timer);
    PENDING.delete(msg.id);
    pending.resolve(msg);
  });

  KB_WORKER.on("exit", () => {
    KB_READY = false;
    KB_WORKER = null;
    startKbWorker();
  });
}

startKbWorker();

function kbQuery(op, payload = {}, timeout = KB_TIMEOUT_MS) {
  return new Promise((resolve) => {
    if (!KB_WORKER) return resolve({ ok: false });

    const id = crypto.randomUUID();
    const timer = setTimeout(() => {
      PENDING.delete(id);
      resolve({ ok: false, timeout: true });
    }, timeout);

    PENDING.set(id, { resolve, timer });
    KB_WORKER.postMessage({ id, ...payload, op });
  });
}

// =======================================================
// ROUTES
// =======================================================
app.post("/api/sandblast-gpt", async (req, res) => {
  const text = String(req.body?.message || "").trim();
  const r = await kbQuery("query", { text, laneDetail: {} });

  if (r.ok && r.out?.best) {
    return res.json({
      ok: true,
      reply: `${r.out.best.artist} — "${r.out.best.title}" (${r.out.best.year})`,
      meta: { build: BUILD_TAG }
    });
  }

  return res.json({
    ok: true,
    reply: "No match yet — still indexing.",
    meta: { build: BUILD_TAG }
  });
});

// 🔥 HEALTH ENDPOINT WITH HARD PROOF 🔥
app.get("/api/health", async (_, res) => {
  const stats = await kbQuery("stats");

  res.json({
    ok: true,
    build: BUILD_TAG,
    serverTime: new Date().toISOString(),
    node: process.version,
    cwd: process.cwd(),
    kbWorkerReady: KB_READY,
    kbMoments: stats?.out?.moments ?? null,
    kbYearMin: stats?.out?.yearMin ?? null,
    kbYearMax: stats?.out?.yearMax ?? null,
    kbCharts: stats?.out?.charts ?? null,
    kbError: stats?.out?.error ?? null
  });
});

app.listen(PORT, () => {
  console.log(`[Nyx] running on ${PORT} (${BUILD_TAG})`);
});

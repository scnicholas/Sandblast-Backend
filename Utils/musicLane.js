"use strict";

/**
 * Utils/musicLane.js
 *
 * BULLETPROOF music lane adapter:
 *  - Delegates all content generation to Utils/musicKnowledge.js
 *  - Normalizes output to contract shape:
 *      { reply, followUps, sessionPatch, meta? }
 *  - Never throws; never bricks boot
 *  - Ensures top100 is ONLY entered on explicit ask
 *
 * Intended use:
 *  - chatEngine calls musicLane.handleChat(...)
 *  - musicLane calls musicKnowledge.handleChat(...)
 */

let musicKnowledge = null;
try {
  musicKnowledge = require("./musicKnowledge");
  if (!musicKnowledge || typeof musicKnowledge.handleChat !== "function") musicKnowledge = null;
} catch (_) {
  musicKnowledge = null;
}

/* =========================
   Utilities
========================= */

function norm(s) {
  return String(s || "").toLowerCase().replace(/\s+/g, " ").trim();
}

function clampYear(y) {
  const n = Number(y);
  if (!Number.isFinite(n)) return null;
  if (n < 1950 || n > 2024) return null;
  return n;
}

function safeFollowUpsStrings(list) {
  // musicKnowledge sometimes returns followUps: string[]
  if (!Array.isArray(list)) return [];
  const out = [];
  const seen = new Set();
  for (const x of list) {
    const s = String(x || "").trim();
    if (!s) continue;
    const k = s.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(s.length > 80 ? s.slice(0, 80) : s);
    if (out.length >= 10) break;
  }
  return out;
}

function safeChips(list) {
  // chips: [{label, send}]
  if (!Array.isArray(list)) return [];
  const out = [];
  const seen = new Set();
  for (const it of list) {
    const label = String(it && it.label ? it.label : "").trim();
    const send = String(it && it.send ? it.send : "").trim();
    if (!label || !send) continue;
    if (label.length > 48 || send.length > 80) continue;
    const k = send.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ label, send });
    if (out.length >= 10) break;
  }
  return out;
}

function explicitTop100Ask(text) {
  const t = norm(text);
  return /\b(top\s*100|top100|hot\s*100|billboard\s*top\s*100|year[-\s]*end\s*hot\s*100)\b/.test(t);
}

function normalizeModeFromText(text) {
  const t = norm(text);
  if (/\b(top\s*10|top10|top\s*ten)\b/.test(t)) return "top10";
  if (explicitTop100Ask(t)) return "top100";
  if (/\bstory\s*moment\b|\bstory\b/.test(t)) return "story";
  if (/\bmicro\s*moment\b|\bmicro\b/.test(t)) return "micro";
  if (/\b#\s*1\b|\bnumber\s*1\b|\bno\.?\s*1\b|\bno\s*1\b/.test(t)) return "number1";
  return null;
}

function extractYear(text) {
  const m = String(text || "").match(/\b(19[5-9]\d|20[0-1]\d|202[0-4])\b/);
  if (!m) return null;
  return clampYear(m[1]);
}

/* =========================
   Normalization
========================= */

function normalizeMusicKnowledgeOut(raw, debug) {
  // Accept a variety of shapes (future-proof):
  // - { reply, followUps: string[], sessionPatch }
  // - { reply, chips: [{label,send}], sessionPatch }
  // - { ok, reply, followUps/chips, sessionPatch }
  const r = raw && typeof raw === "object" ? raw : {};
  const reply = String(r.reply || r.message || r.text || "").trim();

  let followUps = [];
  if (Array.isArray(r.followUps)) {
    followUps = safeFollowUpsStrings(r.followUps);
    // convert string[] -> chip objects for UI
    followUps = followUps.map((s) => ({ label: s.slice(0, 48), send: s }));
  } else if (Array.isArray(r.chips)) {
    followUps = safeChips(r.chips);
  } else {
    followUps = [];
  }

  const sessionPatch = r.sessionPatch && typeof r.sessionPatch === "object" ? r.sessionPatch : null;

  const meta = debug
    ? {
        ok: !!reply,
        source: "musicKnowledge",
        hasPatch: !!sessionPatch,
        followUps: followUps.length,
      }
    : null;

  return { reply, followUps, sessionPatch, meta };
}

/* =========================
   Public API
========================= */

async function handleChat({ text, session, visitorId, debug }) {
  try {
    if (!musicKnowledge) {
      return {
        reply: "Music is warming up. Try again in a moment, or give me a year (1950–2024).",
        followUps: [
          { label: "1988", send: "1988" },
          { label: "Top 10 1988", send: "top 10 1988" },
          { label: "Story 1988", send: "story moment 1988" },
        ],
        sessionPatch: null,
        meta: debug ? { ok: false, reason: "musicKnowledge_missing" } : null,
      };
    }

    const t = String(text || "").trim();
    const s = session || {};

    // Guard: never persist top100 unless explicitly asked NOW
    const wantsTop100Now = explicitTop100Ask(t);
    if (String(s.activeMusicMode || "") === "top100" && !wantsTop100Now) {
      s.activeMusicMode = "top10";
    }

    // If user asked mode without year, keep session year; if year present, set it.
    const y = extractYear(t);
    if (y) s.lastMusicYear = y;

    const mode = normalizeModeFromText(t);
    if (mode) {
      if (mode === "top100" && !wantsTop100Now) {
        // This should be impossible because mode=top100 implies wantsTop100Now,
        // but we keep it anyway.
        s.activeMusicMode = "top10";
      } else {
        s.activeMusicMode = mode;
      }
    }

    const raw = await Promise.resolve(
      musicKnowledge.handleChat({
        text: t,
        session: s,
        visitorId,
        debug: !!debug,
      })
    );

    const normOut = normalizeMusicKnowledgeOut(raw, !!debug);

    // If musicKnowledge returned nothing, provide a deterministic safe prompt.
    if (!normOut.reply) {
      const y2 = clampYear(s.lastMusicYear);
      return {
        reply: y2
          ? `Got it — ${y2}. Do you want Top 10, #1, a story moment, or a micro moment?`
          : "Tell me a year (1950–2024). You can also say “top 10 1988”, “#1 1988”, “story moment 1988”, or “micro moment 1988”.",
        followUps: y2
          ? [
              { label: `Top 10 ${y2}`, send: `top 10 ${y2}` },
              { label: `#1 ${y2}`, send: `#1 ${y2}` },
              { label: `Story ${y2}`, send: `story moment ${y2}` },
              { label: `Micro ${y2}`, send: `micro moment ${y2}` },
            ]
          : [
              { label: "1988", send: "1988" },
              { label: "Top 10 1988", send: "top 10 1988" },
              { label: "Story 1988", send: "story moment 1988" },
              { label: "Micro 1988", send: "micro moment 1988" },
            ],
        sessionPatch: null,
        meta: debug ? { ok: false, reason: "musicKnowledge_empty_reply" } : null,
      };
    }

    return normOut;
  } catch (e) {
    return {
      reply: "Music lane hit a snag. Give me a year (1950–2024) and I’ll try again.",
      followUps: [
        { label: "1988", send: "1988" },
        { label: "Top 10 1988", send: "top 10 1988" },
        { label: "Story 1988", send: "story moment 1988" },
      ],
      sessionPatch: null,
      meta: debug ? { ok: false, reason: "exception", error: String(e && e.message ? e.message : e) } : null,
    };
  }
}

module.exports = { handleChat };

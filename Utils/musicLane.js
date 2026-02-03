"use strict";

/**
 * Utils/musicLane.js
 *
 * Thin adapter over Utils/musicKnowledge.js.
 * Goals:
 *  - Deterministic
 *  - Never throws
 *  - Output normalized to:
 *      { reply, followUpsStrings: string[], followUps: [{label,send}], sessionPatch, meta? }
 *
 * v1.4b (RANGE UPDATE TO 2025)
 *  ✅ Updates clampYear + prompts to 1950–2025 (aligns with musicKnowledge v2.77)
 *  ✅ Updates safeNextYear fallback ceiling to 2025
 *  ✅ Leaves deeper behavior + continuity reconstruction unchanged
 *
 * Exports:
 *  - handleChat({text, session, visitorId, debug})
 *  - function export: await musicLane(text, session, opts?)
 */

let musicKnowledge = null;
try {
  musicKnowledge = require("./musicKnowledge");
  if (!musicKnowledge || typeof musicKnowledge.handleChat !== "function") musicKnowledge = null;
} catch (_) {
  musicKnowledge = null;
}

function norm(s) {
  return String(s || "").toLowerCase().replace(/\s+/g, " ").trim();
}

function clampYear(y) {
  const n = Number(y);
  if (!Number.isFinite(n)) return null;
  if (n < 1950 || n > 2025) return null;
  return n;
}

function extractYearFromText(text) {
  const m = String(text || "").match(/\b(19\d{2}|20\d{2})\b/);
  if (!m) return null;
  return clampYear(m[1]);
}

function normalizeModeFromText(text) {
  const t = norm(text);

  if (/\b(top\s*10|top10|top\s*ten)\b/.test(t)) return "top10";
  if (/\b(top\s*100|top100|hot\s*100|year[-\s]*end\s*hot\s*100)\b/.test(t)) return "top100";
  if (/\bstory\s*moment\b|\bstory\b/.test(t)) return "story";
  if (/\bmicro\s*moment\b|\bmicro\b/.test(t)) return "micro";
  if (/\b#\s*1\b|\bnumber\s*1\b|\bno\.?\s*1\b|\bno\s*1\b/.test(t)) return "number1";

  return null;
}

function inferModeFromReply(reply) {
  const r = norm(reply);
  if (!r) return null;

  if (r.startsWith("top 10") || /\btop\s*10\b/.test(r)) return "top10";
  if (
    r.includes("year-end hot 100") ||
    r.includes("year end hot 100") ||
    /\btop\s*100\b/.test(r) ||
    r.includes("hot 100")
  )
    return "top100";
  if (r.includes("story moment")) return "story";
  if (r.includes("micro moment")) return "micro";
  if (/\b#\s*1\b/.test(r) || r.includes("number 1") || r.includes("no. 1") || r.includes("no 1")) return "number1";

  return null;
}

function safeStrings(list, max = 10) {
  if (!Array.isArray(list)) return [];
  const out = [];
  const seen = new Set();
  for (const x of list) {
    const s = String(x || "").replace(/\s+/g, " ").trim();
    if (!s) continue;
    const k = s.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(s.slice(0, 80));
    if (out.length >= max) break;
  }
  return out;
}

function chipsFromStrings(list) {
  const strings = safeStrings(list, 10);
  const out = [];
  for (const s of strings) {
    out.push({
      label: s.length > 48 ? s.slice(0, 48) : s,
      send: s,
    });
  }
  return out;
}

function safeSessionPatch(patch) {
  return patch && typeof patch === "object" ? { ...patch } : null;
}

function ensureContinuity({ patch, userMode, replyMode, userYear, replyYear, session }) {
  const s = session && typeof session === "object" ? session : null;
  let p = patch && typeof patch === "object" ? patch : null;

  const mode = userMode || replyMode || null;

  const y = clampYear(
    (p && (p.year || p.lastMusicYear)) || userYear || replyYear || (s && s.lastMusicYear) || null
  );

  p = p || {};
  p.pendingLane = p.pendingLane || "music";

  if (mode) {
    p.mode = p.mode || mode;
    p.activeMusicMode = p.activeMusicMode || mode;
    p.pendingMode = p.pendingMode || mode;
  }

  if (y) {
    p.year = p.year || y;
    p.lastMusicYear = p.lastMusicYear || y;
    p.pendingYear = p.pendingYear || y;
  }

  // NOTE: do NOT mutate session here; chatEngine applies sessionPatch deterministically.
  return p;
}

/* ======================================================
   DEEPER SUPPORT (deterministic, non-breaking)
====================================================== */

function isDeeperToken(text) {
  const t = norm(text);
  return (
    t === "deeper" ||
    t === "go deeper" ||
    t === "tell me more" ||
    t === "more" ||
    t === "expand" ||
    t === "unpack that"
  );
}

function hasDeeperSuffix(text) {
  const t = norm(text);
  return /\b(deeper|tell me more|expand|unpack that)\s*$/.test(t);
}

function stripDeeperSuffix(text) {
  const t = String(text || "");
  return t.replace(/\s*(deeper|tell me more|expand|unpack that)\s*$/i, "").trim();
}

function modeToPrompt(mode, year) {
  const y = clampYear(year);
  if (!y) return null;
  const m = String(mode || "").toLowerCase();
  if (m === "top10") return `top 10 ${y}`;
  if (m === "top100") return `top 100 ${y}`;
  if (m === "story" || m === "story_moment") return `story moment ${y}`;
  if (m === "micro" || m === "micro_moment") return `micro moment ${y}`;
  if (m === "number1" || m === "number_1") return `#1 ${y}`;
  return `top 10 ${y}`;
}

function reconstructPromptFromSession(session) {
  const s = session && typeof session === "object" ? session : {};
  const y = clampYear(s.lastMusicYear || s.year || s.lastYear);
  const m = String(s.activeMusicMode || s.mode || s.lastMode || "top10");
  if (!y) return null;
  return modeToPrompt(m, y);
}

function safeNextYear(y) {
  const n = clampYear(y);
  if (!n) return null;
  return clampYear(n + 1) || 2025;
}
function safePrevYear(y) {
  const n = clampYear(y);
  if (!n) return null;
  return clampYear(n - 1) || 1950;
}

function deeperExpansion({ mode, year }) {
  const y = clampYear(year);
  const m = String(mode || "").toLowerCase();

  // Deterministic texture only — no new facts.
  if (!y) {
    return "\n\nIf you tell me a year (1950–2025), I can go deeper with real context.";
  }

  const ny = safeNextYear(y);
  const py = safePrevYear(y);

  if (m === "story" || m === "story_moment") {
    return (
      `\n\nDeeper:\n` +
      `• Anchor it to the moment: where you were, what you were doing.\n` +
      `• The “why it stuck”: production choices + cultural mood.\n` +
      `• Want next year (${ny}) or stay in ${y}?`
    );
  }

  if (m === "micro" || m === "micro_moment") {
    return (
      `\n\nDeeper:\n` +
      `• Sensory cue: a sound/scene that makes the year feel real.\n` +
      `• One cultural anchor (movie/TV vibe or headline-level theme).\n` +
      `• Next (${ny}) or previous (${py})?`
    );
  }

  if (m === "number1" || m === "number_1") {
    return (
      `\n\nDeeper:\n` +
      `• Why #1 happened: timing + audience appetite.\n` +
      `• What it replaced (the vibe shift).\n` +
      `• Want the #1 for ${ny} next?`
    );
  }

  if (m === "top100") {
    return (
      `\n\nDeeper:\n` +
      `• Big picture: what dominated the year and what was emerging.\n` +
      `• If you want, I can zoom into the Top 10 inside the Top 100.\n` +
      `• Next year (${ny})?`
    );
  }

  // default top10
  return (
    `\n\nDeeper:\n` +
    `• Pattern check: what styles kept repeating in ${y}.\n` +
    `• One standout “contrast” track (different energy).\n` +
    `• Next (${ny}) or previous (${py})?`
  );
}

/* ======================================================
   Core
====================================================== */

async function handleChat({ text, session, visitorId, debug }) {
  try {
    const s = session && typeof session === "object" ? session : {};
    const rawText = String(text || "");

    // Detect deeper requests
    let deep = false;
    let baseText = rawText;

    if (isDeeperToken(rawText)) {
      // Pure "deeper" -> reconstruct last prompt
      const recon = reconstructPromptFromSession(s);
      if (!recon) {
        const fallback = "Tell me a year (1950–2025) — then I can go deeper.";
        const followUpsStrings = safeStrings(["1956", "1988", "top 10 1988"], 10);
        return {
          reply: fallback,
          followUpsStrings,
          followUps: chipsFromStrings(followUpsStrings),
          sessionPatch: ensureContinuity({
            session: s,
            patch: null,
            userMode: null,
            replyMode: null,
            userYear: null,
            replyYear: null,
          }),
          meta: debug ? { ok: false, reason: "deeper_no_context" } : null,
        };
      }
      deep = true;
      baseText = recon;
    } else if (hasDeeperSuffix(rawText)) {
      deep = true;
      baseText = stripDeeperSuffix(rawText);
      if (!baseText) {
        const recon = reconstructPromptFromSession(s);
        if (recon) baseText = recon;
      }
    }

    const cleanText = String(baseText || "");

    if (!musicKnowledge) {
      const fallback = "Music is warming up. Give me a year (1950–2025).";
      const followUpsStrings = safeStrings(["1956", "1988", "top 10 1988"], 10);
      return {
        reply: fallback,
        followUpsStrings,
        followUps: chipsFromStrings(followUpsStrings),
        sessionPatch: ensureContinuity({
          session: s,
          patch: null,
          userMode: normalizeModeFromText(cleanText),
          replyMode: null,
          userYear: extractYearFromText(cleanText),
          replyYear: null,
        }),
        meta: debug ? { ok: false, reason: "musicKnowledge_missing" } : null,
      };
    }

    const raw = await Promise.resolve(
      musicKnowledge.handleChat({
        text: cleanText,
        session: s,
        visitorId,
        debug: !!debug,
      })
    );

    let reply = String(raw && raw.reply ? raw.reply : "").trim();
    if (!reply) reply = "Tell me a year (1950–2025), or say “top 10 1988”.";

    const fuRaw = Array.isArray(raw && raw.followUps) ? raw.followUps : [];
    let followUpsStrings = safeStrings(fuRaw, 10);

    // ✅ never empty chips
    if (!followUpsStrings.length) followUpsStrings = safeStrings(["1956", "top 10 1988", "story moment 1955"], 10);

    // continuity inference
    const userMode = normalizeModeFromText(cleanText);
    const replyMode = inferModeFromReply(reply);

    const userYear = extractYearFromText(cleanText);
    const replyYear = null;

    let sessionPatch = safeSessionPatch(raw && raw.sessionPatch);
    sessionPatch = ensureContinuity({ session: s, patch: sessionPatch, userMode, replyMode, userYear, replyYear });

    // Apply deterministic deeper expansion (non-factual, texture only)
    if (deep) {
      const appliedMode =
        (sessionPatch && (sessionPatch.activeMusicMode || sessionPatch.mode)) ||
        userMode ||
        replyMode ||
        "top10";

      const appliedYear =
        (sessionPatch && (sessionPatch.lastMusicYear || sessionPatch.year)) ||
        userYear ||
        null;

      reply = `${reply}${deeperExpansion({ mode: appliedMode, year: appliedYear })}`;

      // Mark depth level gently (chatEngine can decide what to do with it)
      if (sessionPatch && typeof sessionPatch === "object") {
        const prev = Number(sessionPatch.depthLevel || 0);
        sessionPatch.depthLevel = prev + 1;
        sessionPatch.recentIntent = sessionPatch.recentIntent || "deeper";
        sessionPatch.recentTopic = sessionPatch.recentTopic || "deeper";
      }
    }

    const followUps = chipsFromStrings(followUpsStrings);

    return {
      reply,
      followUpsStrings,
      followUps,
      sessionPatch,
      meta: debug
        ? {
            ok: !!reply,
            source: "musicKnowledge",
            mkVersion:
              musicKnowledge.MK_VERSION && typeof musicKnowledge.MK_VERSION === "function"
                ? musicKnowledge.MK_VERSION()
                : null,
            followUps: followUpsStrings.length,
            hasPatch: !!sessionPatch,
            deep,
            inferred: {
              userMode: userMode || null,
              replyMode: replyMode || null,
              appliedMode:
                sessionPatch && (sessionPatch.mode || sessionPatch.activeMusicMode)
                  ? sessionPatch.mode || sessionPatch.activeMusicMode
                  : null,
              appliedYear:
                sessionPatch && (sessionPatch.year || sessionPatch.lastMusicYear)
                  ? sessionPatch.year || sessionPatch.lastMusicYear
                  : null,
            },
          }
        : null,
    };
  } catch (e) {
    const fallback = "Music lane hit a snag. Give me a year (1950–2025) and try again.";
    const followUpsStrings = safeStrings(["1956", "1988", "top 10 1988"], 10);
    return {
      reply: fallback,
      followUpsStrings,
      followUps: chipsFromStrings(followUpsStrings),
      sessionPatch: null,
      meta: debug ? { ok: false, reason: "exception", error: String(e && e.message ? e.message : e) } : null,
    };
  }
}

async function musicLaneFn(text, session, opts) {
  const res = await handleChat({
    text,
    session,
    visitorId: opts && opts.visitorId ? opts.visitorId : undefined,
    debug: !!(opts && opts.debug),
  });

  // chatEngine expects { reply, followUps, sessionPatch }
  return {
    reply: res.reply,
    followUps: res.followUpsStrings,
    sessionPatch: res.sessionPatch,
    meta: res.meta,
  };
}

module.exports = musicLaneFn;
module.exports.musicLane = musicLaneFn;
module.exports.handleChat = handleChat;

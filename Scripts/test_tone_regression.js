"use strict";

/**
 * Scripts/test_tone_regression.js
 *
 * Tone + behavior regression tests for Nyx chatEngine.
 *
 * Goals:
 *  - Catch "softness creep" (ADVANCE/firm ending with hedges)
 *  - Ensure Top 10 visibility stays >= 10 numbered rows when data exists
 *  - Ensure "payload beats silence" (chip clicks with empty text still advance)
 *  - Ensure Velvet gating (if present) never triggers before eligibility
 *  - Keep outputs compact under "short" budget without truncating ranked lists
 *
 * Usage:
 *   node Scripts/test_tone_regression.js
 *
 * Exit codes:
 *   0 = all tests passed
 *   1 = failures
 */

const path = require("path");

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
function assert(cond, msg) {
  if (!cond) throw new Error(msg || "assertion failed");
}
function countNumberedLines(text) {
  const s = safeStr(text);
  if (!s) return 0;
  return s
    .split("\n")
    .filter((ln) => /^\s*\d+\.\s+/.test(ln))
    .length;
}
function containsAny(text, needles) {
  const t = safeStr(text).toLowerCase();
  return needles.some((n) => t.includes(String(n).toLowerCase()));
}
function lastLine(text) {
  const lines = safeStr(text).trim().split("\n").filter(Boolean);
  return lines.length ? lines[lines.length - 1] : "";
}
function pick(obj, keys) {
  for (const k of keys) {
    if (obj && Object.prototype.hasOwnProperty.call(obj, k)) return obj[k];
  }
  return undefined;
}

/**
 * Load chat engine.
 * Assumes this file lives in Scripts/ and chatEngine.js lives in Utils/
 */
const enginePath = path.resolve(__dirname, "..", "Utils", "chatEngine.js");
let handleChat;
try {
  // eslint-disable-next-line global-require, import/no-dynamic-require
  const mod = require(enginePath);
  handleChat = mod.handleChat || mod.default || mod;
} catch (e) {
  console.error("[FAIL] Could not load chatEngine:", enginePath);
  console.error(e && e.stack ? e.stack : e);
  process.exit(1);
}

async function runOne({ name, input, check }) {
  const out = await handleChat(input);
  assert(isPlainObject(out), `${name}: engine returned non-object`);
  assert(out.ok === true, `${name}: out.ok not true`);

  if (typeof check === "function") {
    await check(out);
  }
  return out;
}

/**
 * Minimal in-memory knowledge pack for Top 10 + moments
 * Mirrors your canonical top10_by_year_v1 "years:{YYYY:{items:[...]}}"
 */
function makeKnowledge() {
  const mkItem = (pos, title, artist) => ({ pos, title, artist });

  const items1988 = [
    mkItem(1, "Faith", "George Michael"),
    mkItem(2, "Need You Tonight", "INXS"),
    mkItem(3, "Got My Mind Set on You", "George Harrison"),
    mkItem(4, "Never Gonna Give You Up", "Rick Astley"),
    mkItem(5, "Sweet Child o' Mine", "Guns N' Roses"),
    mkItem(6, "So Emotional", "Whitney Houston"),
    mkItem(7, "Heaven Is a Place on Earth", "Belinda Carlisle"),
    mkItem(8, "Could've Been", "Tiffany"),
    mkItem(9, "Hands to Heaven", "Breathe"),
    mkItem(10, "Roll With It", "Steve Winwood"),
  ];

  return {
    json: {
      top10_by_year_v1: {
        version: "top10_by_year_v1",
        years: {
          "1988": { year: 1988, items: items1988 },
        },
      },
      "music/micro_moments": {
        byYear: {
          "1988": { text: "Micro: neon lights, late-night radio, and that first “I can do anything” feeling." },
        },
      },
      "music/story_moments": {
        byYear: {
          "1988": { text: "Story: The year moves like a montage—big hair, bigger dreams, and a chorus that refuses to fade." },
        },
      },
      "music/wiki/yearend_hot100_by_year": {
        byYear: {
          "1988": [
            { rank: 1, song: "Faith", artist: "George Michael" },
            { rank: 2, song: "Need You Tonight", artist: "INXS" },
            { rank: 3, song: "Got My Mind Set on You", artist: "George Harrison" },
          ],
        },
      },
    },
  };
}

async function main() {
  const failures = [];
  const results = [];

  const knowledge = makeKnowledge();
  const baseSession = {
    lane: "music",
    lastYear: null,
    lastMusicYear: null,
    __musicLastSig: "",
    activeMusicChart: "",
    lastMusicChart: "",
    musicMomentsLoaded: false,
    musicMomentsLoadedAt: 0,
  };

  const HEDGES = [
    "if you want",
    "if you'd like",
    "let me know",
    "you can",
    "we can",
    "would you like",
  ];

  const tests = [
    {
      name: "Top10 shows 10 numbered lines (budget short safe)",
      input: {
        text: "top 10 1988",
        payload: { action: "top10", year: 1988, lane: "music" },
        session: { ...baseSession, lastMacMode: "architect" },
        knowledge,
      },
      check: (out) => {
        const n = countNumberedLines(out.reply);
        assert(n >= 10, `expected >=10 numbered lines, got ${n}\n${out.reply}`);
      },
    },

    {
      name: "ADVANCE firm should not end with softness hedges",
      input: {
        text: "Implement the next steps. Do them all.",
        payload: { action: "top10", year: 1988, lane: "music", macMode: "architect" },
        session: { ...baseSession, lastMacMode: "architect" },
        knowledge,
      },
      check: (out) => {
        const cog = out.cog || {};
        const intent = safeStr(cog.intent || "").toUpperCase();
        const dom = safeStr(cog.dominance || "").toLowerCase();
        // Only enforce on ADVANCE+firm (what your constitution expects)
        if (intent === "ADVANCE" && dom === "firm") {
          const tail = lastLine(out.reply);
          assert(
            !containsAny(tail, HEDGES),
            `reply tail contains hedge under ADVANCE/firm:\nTAIL="${tail}"\nFULL:\n${out.reply}`
          );
        }
      },
    },

    {
      name: "Payload beats silence: chip-click empty text still advances and returns Top10",
      input: {
        text: "",
        payload: { action: "top10", year: 1988, lane: "music" },
        session: { ...baseSession, lastYear: 1973 },
        knowledge,
      },
      check: (out) => {
        const n = countNumberedLines(out.reply);
        assert(n >= 10, `expected >=10 numbered lines from chip-click, got ${n}`);
        const metaRoute = safeStr(pick(out.meta, ["route"]) || "");
        if (metaRoute) assert(metaRoute === "top10", `expected meta.route=top10, got ${metaRoute}`);
      },
    },

    {
      name: "Loop dampener: second identical Top10 call should dampen (no list spam)",
      input: {
        text: "top 10 1988",
        payload: { action: "top10", year: 1988, lane: "music" },
        session: { ...baseSession },
        knowledge,
      },
      check: async (out1) => {
        // Feed sessionPatch back in to simulate persistence
        const s2 = { ...baseSession, ...(out1.sessionPatch || {}) };
        const out2 = await handleChat({
          text: "top 10 1988",
          payload: { action: "top10", year: 1988, lane: "music" },
          session: s2,
          knowledge,
        });

        assert(out2 && out2.ok === true, "second call ok");
        const n2 = countNumberedLines(out2.reply);
        assert(
          n2 < 6,
          `expected dampened response to not reprint full list (n2=${n2})\n${out2.reply}`
        );
        const dampened = !!(out2.meta && out2.meta.dampened);
        assert(dampened, "expected meta.dampened=true on second identical call");
      },
    },

    {
      name: "Story moment returns cinematic prefix",
      input: {
        text: "make it cinematic 1988",
        payload: { action: "story_moment", year: 1988, lane: "music" },
        session: { ...baseSession },
        knowledge,
      },
      check: (out) => {
        assert(
          safeStr(out.reply).toLowerCase().includes("make it cinematic"),
          `expected cinematic prefix, got:\n${out.reply}`
        );
      },
    },

    {
      name: "Micro moment returns seal-the-vibe prefix",
      input: {
        text: "tap micro moment 1988",
        payload: { action: "micro_moment", year: 1988, lane: "music" },
        session: { ...baseSession },
        knowledge,
      },
      check: (out) => {
        assert(
          safeStr(out.reply).toLowerCase().includes("seal the vibe"),
          `expected seal-the-vibe prefix, got:\n${out.reply}`
        );
      },
    },

    {
      name: "Year-end route returns ranked excerpt (>=3 lines) and not Top10-only formatter",
      input: {
        text: "year-end hot 100 1988",
        payload: { action: "yearend_hot100", year: 1988, lane: "music" },
        session: { ...baseSession },
        knowledge,
      },
      check: (out) => {
        const n = countNumberedLines(out.reply);
        assert(n >= 3, `expected >=3 numbered lines for year-end excerpt, got ${n}\n${out.reply}`);
        assert(
          safeStr(out.reply).toLowerCase().includes("year-end hot 100"),
          `expected year-end header, got:\n${out.reply}`
        );
      },
    },

    /**
     * Velvet gating test (optional):
     * Only runs if your engine exposes velvet fields or a recognizable velvet marker.
     * Adjust the marker once you implement Velvet Mode.
     */
    {
      name: "Velvet gating (optional): velvet should not appear before moments eligibility",
      input: {
        text: "velvet mode please",
        payload: { action: "top10", year: 1988, lane: "music" },
        session: { ...baseSession, velvetEligible: false },
        knowledge,
      },
      check: (out) => {
        const t = safeStr(out.reply).toLowerCase();
        const velvetMarkers = ["velvet", "lean in", "softer at the edges"]; // tweak later
        const hasVelvet = velvetMarkers.some((m) => t.includes(m));
        // If you haven't implemented velvet markers yet, this will naturally pass.
        assert(!hasVelvet, `velvet marker appeared while velvetEligible=false:\n${out.reply}`);
      },
    },
  ];

  for (const tc of tests) {
    try {
      const out = await runOne(tc);
      results.push({ name: tc.name, ok: true, route: out?.meta?.route || "" });
      console.log(`[PASS] ${tc.name}`);
    } catch (e) {
      const msg = e && e.message ? e.message : String(e);
      failures.push({ name: tc.name, error: msg });
      results.push({ name: tc.name, ok: false, error: msg });
      console.error(`\n[FAIL] ${tc.name}\n${msg}\n`);
    }
  }

  // Summary
  console.log("\n====================");
  console.log("Tone Regression Summary");
  console.log("====================");
  const passN = results.filter((r) => r.ok).length;
  const failN = results.length - passN;
  console.log(`Passed: ${passN}/${results.length}`);
  console.log(`Failed: ${failN}/${results.length}`);

  if (failN) {
    console.log("\nFailed tests:");
    for (const f of failures) console.log(`- ${f.name}: ${f.error}`);
    process.exit(1);
  }

  process.exit(0);
}

main().catch((e) => {
  console.error("[FATAL] Unhandled error:", e && e.stack ? e.stack : e);
  process.exit(1);
});

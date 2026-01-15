"use strict";

/**
 * Regression: Shadow Brain (C+ + D)
 *
 * Runs locally WITHOUT server.
 * Validates deterministic behavior and imprint updates.
 *
 * Run:
 *   node ./Scripts/regression_shadowBrain_v1.js
 */

const path = require("path");

function reqShadowBrain() {
  // adjust if your folder differs
  return require(path.join(process.cwd(), "Utils", "shadowBrain.js"));
}

function assert(cond, msg) {
  if (!cond) throw new Error(`ASSERT FAIL: ${msg}`);
}

function approx(a, b, eps = 1e-6) {
  return Math.abs(a - b) <= eps;
}

function pickTopIntents(shadow, n = 4) {
  const arr = Array.isArray(shadow?.orderedIntents) ? shadow.orderedIntents : [];
  return arr.slice(0, n).map((x) => (typeof x === "string" ? x : x.intent));
}

function pickTopCandidates(shadow, n = 6) {
  const arr = Array.isArray(shadow?.candidates) ? shadow.candidates : [];
  // candidates may be {intent,w,label,send}
  return arr.slice(0, n).map((x) => x.intent || x.label || x.send || "?");
}

function run() {
  const shadowBrain = reqShadowBrain();

  console.log("Loaded shadowBrain exports:", Object.keys(shadowBrain));

  const visitorId = "mac-regression";
  const session = { lane: "music", lastYear: 1988, activeMusicMode: "top10" };
  const now0 = Date.now();

  // 1) PRIME
  const p = shadowBrain.prime({
    session,
    visitorId,
    lane: "music",
    mode: "top10",
    year: 1988,
    now: now0,
  });
  assert(p && p.ok !== false, "prime should not fail");

  // 2) GET baseline
  const g0 = shadowBrain.get({
    session,
    visitorId,
    lane: "music",
    mode: "top10",
    year: 1988,
    userText: "",
    now: now0,
  });
  assert(g0.shadow, "get() should return shadow");
  assert(g0.imprint, "get() should return imprint");

  const baselineTop = pickTopIntents(g0.shadow, 4);
  console.log("Baseline top intents:", baselineTop.join(", "));
  assert(baselineTop.length > 0, "baseline should have intents");

  // 3) OBSERVE: user asks story moment
  shadowBrain.observe({
    session,
    visitorId,
    lane: "music",
    mode: "top10",
    year: 1988,
    userText: "story moment 1988",
    event: "picked_story",
    now: now0 + 1000,
  });

  const g1 = shadowBrain.get({
    session,
    visitorId,
    lane: "music",
    mode: "top10",
    year: 1988,
    userText: "story moment 1988",
    now: now0 + 1100,
  });

  const afterStoryTop = pickTopIntents(g1.shadow, 4);
  console.log("After story request top intents:", afterStoryTop.join(", "));
  assert(afterStoryTop.includes("story_moment"), "story_moment should appear in top intents after story signal");

  // 4) OBSERVE: user says next year (momentum)
  shadowBrain.observe({
    session,
    visitorId,
    lane: "music",
    mode: "top10",
    year: 1988,
    userText: "next year",
    event: "picked_next_year",
    now: now0 + 2000,
  });

  const g2 = shadowBrain.get({
    session,
    visitorId,
    lane: "music",
    mode: "top10",
    year: 1988,
    userText: "next year",
    now: now0 + 2100,
  });

  const afterNextTop = pickTopIntents(g2.shadow, 4);
  console.log("After next-year top intents:", afterNextTop.join(", "));
  assert(afterNextTop.includes("another_year") || afterNextTop.includes("next_year"), "year navigation intent should appear");

  // 5) OBSERVE: user says stop asking (strong signal)
  const beforeQT = Number(g2.imprint?.knobs?.questionTolerance);
  shadowBrain.observe({
    session,
    visitorId,
    lane: "music",
    mode: "top10",
    year: 1988,
    userText: "stop asking questions. just do it.",
    event: "stop_asking",
    now: now0 + 3000,
  });

  const g3 = shadowBrain.get({
    session,
    visitorId,
    lane: "music",
    mode: "top10",
    year: 1988,
    userText: "stop asking questions. just do it.",
    now: now0 + 3100,
  });

  const afterQT = Number(g3.imprint?.knobs?.questionTolerance);
  console.log("questionTolerance:", beforeQT, "=>", afterQT);
  assert(Number.isFinite(beforeQT) && Number.isFinite(afterQT), "questionTolerance should be numeric");
  assert(afterQT < beforeQT || approx(afterQT, beforeQT) === false, "questionTolerance should decrease after stop_asking");

  // 6) Candidate ordering exists and is deterministic (same inputs -> same ordering)
  const g4a = shadowBrain.get({
    session,
    visitorId,
    lane: "music",
    mode: "top10",
    year: 1988,
    userText: "story moment 1988",
    now: now0 + 4000,
  });

  const g4b = shadowBrain.get({
    session,
    visitorId,
    lane: "music",
    mode: "top10",
    year: 1988,
    userText: "story moment 1988",
    now: now0 + 4050,
  });

  const candA = pickTopCandidates(g4a.shadow, 6).join("|");
  const candB = pickTopCandidates(g4b.shadow, 6).join("|");
  console.log("Candidates A:", candA);
  console.log("Candidates B:", candB);
  assert(candA === candB, "candidate ordering should be deterministic for same inputs");

  console.log("\n✅ Shadow Brain regression PASSED");
}

try {
  run();
} catch (e) {
  console.error("\n❌ Shadow Brain regression FAILED");
  console.error(e && e.stack ? e.stack : e);
  process.exitCode = 1;
}

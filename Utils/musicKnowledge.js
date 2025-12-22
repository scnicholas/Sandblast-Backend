"use strict";

/**
 * intentClassifier.js — Lightweight + Stable
 * Purpose:
 * - Determine intent (greeting/question/command/statement)
 * - Determine domain (tv/radio/sponsors/music/general)
 * - Provide confidence values
 */

function normalize(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function classifyIntentAndDomain(input) {
  const text = normalize(input);

  // -------------------------
  // INTENT
  // -------------------------
  let intent = "statement";
  let confidence = 0.5;

  const isGreeting =
    text === "hi" ||
    text === "hello" ||
    text === "hey" ||
    text.startsWith("good morning") ||
    text.startsWith("good afternoon") ||
    text.startsWith("good evening");

  const isQuestion =
    text.endsWith("?") ||
    text.startsWith("what") ||
    text.startsWith("when") ||
    text.startsWith("where") ||
    text.startsWith("why") ||
    text.startsWith("how") ||
    text.includes("can you") ||
    text.includes("could you");

  const isCommand =
    text.startsWith("make") ||
    text.startsWith("create") ||
    text.startsWith("build") ||
    text.startsWith("generate") ||
    text.startsWith("write") ||
    text.startsWith("show me") ||
    text.startsWith("give me");

  if (isGreeting) {
    intent = "greeting";
    confidence = 0.95;
  } else if (isCommand) {
    intent = "command";
    confidence = 0.8;
  } else if (isQuestion) {
    intent = "question";
    confidence = Math.max(confidence, 0.6);
  } else {
    intent = "statement";
    confidence = 0.5;
  }

  // -------------------------
  // DOMAIN
  // -------------------------
  let domain = "general";
  let domainConfidence = 0.3;

  const hitCount = (patterns) =>
    patterns.reduce((count, p) => (text.includes(p) ? count + 1 : count), 0);

  const tvHits = hitCount([
    "tv",
    "television",
    "episode",
    "show",
    "series",
    "schedule",
    "programming",
    "lineup",
    "time slot",
    "timeslot",
    "block",
    "channel",
    "western",
    "detective",
    "sitcom"
  ]);

  const radioHits = hitCount([
    "radio",
    "dj nova",
    "dj",
    "playlist",
    "audio block",
    "music block",
    "rotation",
    "on air",
    "on-air"
  ]);

  const sponsorHits = hitCount([
    "sponsor",
    "sponsorship",
    "sponsored",
    "advertiser",
    "advertising",
    "ad spot",
    "ad spots",
    "ad package",
    "ad packages",
    "pricing",
    "rates"
  ]);

  const musicHits = hitCount([
    "billboard",
    "hot 100",
    "uk singles",
    "canada rpm",
    "top40weekly",
    "top 100",
    "top100",
    "chart",
    "song",
    "artist",
    "title",
    "year"
  ]);

  // Decide domain by maximum hits
  const scores = [
    { domain: "tv", score: tvHits },
    { domain: "radio", score: radioHits },
    { domain: "sponsors", score: sponsorHits },
    { domain: "music", score: musicHits }
  ].sort((a, b) => b.score - a.score);

  if (scores[0].score > 0) {
    domain = scores[0].domain;
    domainConfidence = Math.min(0.95, 0.4 + scores[0].score * 0.1);
  }

  return {
    intent,
    confidence,
    domain,
    domainConfidence
  };
}

module.exports = {
  classifyIntentAndDomain
};

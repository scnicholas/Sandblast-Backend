"use strict";

/**
 * Scripts/compile_nyx_phrasepack_v1_to_packets_v1.js
 *
 * Input : Data/nyx/nyx_phrasepack_v1.json   (YOUR schema: { version, updated, voice, buckets{lane{bucket:[...]}} })
 * Output: Data/nyx/packets_v1.json          (runtime packets)
 *
 * Tailored behavior:
 *  - Compiles each phrase bucket into a packet with sensible triggers + chips
 *  - Adds "__fallback__" packet from general.fallback_nudge
 *  - Adds "__error__" packet from general.errors_generic (manual trigger only)
 *  - Does NOT compile general.ack_short by default (avoid "ok" loops)
 *
 * Deterministic runtime selection is handled by Utils/packets.js
 */

const fs = require("fs");
const path = require("path");

const IN_PATH = path.join(process.cwd(), "Data", "nyx", "nyx_phrasepack_v1.json");
const OUT_PATH = path.join(process.cwd(), "Data", "nyx", "packets_v1.json");

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function writeJson(p, obj) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(obj, null, 2) + "\n", "utf8");
}

function asStringArray(x) {
  if (!x) return [];
  if (Array.isArray(x)) return x.map((v) => String(v || "").trim()).filter(Boolean);
  if (typeof x === "string") return [x.trim()].filter(Boolean);
  return [];
}

function safeChips(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  const seen = new Set();
  for (const it of list) {
    const label = String(it && it.label ? it.label : "").trim();
    const send = String(it && it.send ? it.send : "").trim();
    if (!label || !send) continue;
    const k = send.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ label, send });
  }
  return out;
}

function packet({ id, type, lane, trigger, templates, chips, constraints, sessionPatch }) {
  const out = {
    id,
    type,
    lane,
    trigger: Array.isArray(trigger) ? trigger : [],
    templates: asStringArray(templates),
  };
  const c = safeChips(chips);
  if (c.length) out.chips = c;
  if (constraints && typeof constraints === "object" && Object.keys(constraints).length) out.constraints = constraints;
  if (sessionPatch && typeof sessionPatch === "object" && Object.keys(sessionPatch).length) out.sessionPatch = sessionPatch;
  return out;
}

function getBucket(root, lane, bucketName) {
  try {
    const b = root && root.buckets && root.buckets[lane] && root.buckets[lane][bucketName];
    return asStringArray(b);
  } catch {
    return [];
  }
}

/* ======================================================
   Trigger sets (tight + practical)
====================================================== */

const TRIG = {
  greet: ["hi", "hello", "hey", "yo", "good morning", "good afternoon", "good evening"],
  returning: ["welcome back", "back again", "i'm back", "im back", "we're back", "were back", "again"],
  help: ["help", "options", "what can you do", "what do you do", "menu", "capabilities", "how does this work"],
  bye: ["bye", "goodbye", "good night", "goodnight", "later", "see you", "i'm done", "im done", "that’s all", "thats all"],

  // music-ish triggers for ask_year (year missing)
  musicPrompt: ["music", "top 10", "top10", "story moment", "story", "micro moment", "micro", "#1", "number 1", "chart", "songs"],

  sponsors: ["sponsor", "sponsors", "advertise", "advertising", "ad package", "promotion", "promote"],
  schedule: ["schedule", "what's playing", "whats playing", "playing now", "now", "today", "tonight", "what time", "time in", "in london", "in toronto"],
  movies: ["movie", "movies", "tv", "show", "shows", "recommend", "recommend something", "what to watch", "watch"],
};

function defaultChipsForGeneral() {
  return safeChips([
    { label: "Music (pick a year)", send: "1988" },
    { label: "Schedule", send: "schedule" },
    { label: "Sponsors", send: "sponsors" },
    { label: "Movies/TV", send: "movies" },
  ]);
}

function defaultChipsForMusic() {
  return safeChips([
    { label: "1988", send: "1988" },
    { label: "Top 10 1988", send: "top 10 1988" },
    { label: "Story moment 1988", send: "story moment 1988" },
    { label: "Micro moment 1988", send: "micro moment 1988" },
  ]);
}

function defaultChipsForSponsors() {
  return safeChips([
    { label: "TV", send: "tv" },
    { label: "Radio", send: "radio" },
    { label: "Website", send: "website" },
    { label: "Social", send: "social" },
    { label: "Bundle", send: "bundle" },
  ]);
}

function defaultChipsForSchedule() {
  return safeChips([
    { label: "What’s playing now", send: "what’s playing now" },
    { label: "Today", send: "schedule today" },
    { label: "In London", send: "in London" },
    { label: "In Toronto", send: "in Toronto" },
  ]);
}

function defaultChipsForMovies() {
  return safeChips([
    { label: "Recommend something", send: "recommend something" },
    { label: "Classic TV", send: "classic tv" },
    { label: "Westerns", send: "westerns" },
    { label: "Detective", send: "detective" },
  ]);
}

/* ======================================================
   Compile
====================================================== */

function main() {
  const raw = readJson(IN_PATH);

  const packets = [];

  // GENERAL
  const greetingsFirst = getBucket(raw, "general", "greetings_first");
  if (greetingsFirst.length) {
    packets.push(
      packet({
        id: "general.greetings_first",
        type: "greeting",
        lane: "general",
        trigger: TRIG.greet,
        constraints: { oncePerSession: true },
        templates: greetingsFirst,
        chips: defaultChipsForGeneral(),
        sessionPatch: { lane: "general" },
      })
    );
  }

  const greetingsReturning = getBucket(raw, "general", "greetings_returning");
  if (greetingsReturning.length) {
    packets.push(
      packet({
        id: "general.greetings_returning",
        type: "greeting",
        lane: "general",
        trigger: TRIG.returning,
        constraints: { oncePerSession: true },
        templates: greetingsReturning,
        chips: defaultChipsForGeneral(),
        sessionPatch: { lane: "general" },
      })
    );
  }

  const caps = getBucket(raw, "general", "capabilities_quick");
  if (caps.length) {
    packets.push(
      packet({
        id: "general.capabilities_quick",
        type: "help",
        lane: "general",
        trigger: TRIG.help,
        templates: caps,
        chips: defaultChipsForGeneral(),
        sessionPatch: { lane: "general" },
      })
    );
  }

  const goodbyes = getBucket(raw, "general", "goodbyes_soft");
  if (goodbyes.length) {
    packets.push(
      packet({
        id: "general.goodbyes_soft",
        type: "goodbye",
        lane: "general",
        trigger: TRIG.bye,
        templates: goodbyes,
        chips: safeChips([
          { label: "Top 10 1994", send: "top 10 1994" },
          { label: "Schedule", send: "schedule" },
        ]),
        sessionPatch: { lane: "general" },
      })
    );
  }

  const fallback = getBucket(raw, "general", "fallback_nudge");
  if (fallback.length) {
    packets.push(
      packet({
        id: "general.fallback_nudge",
        type: "fallback",
        lane: "general",
        trigger: ["__fallback__"],
        templates: fallback,
        chips: defaultChipsForGeneral(),
        sessionPatch: { lane: "general" },
      })
    );
  }

  const errors = getBucket(raw, "general", "errors_generic");
  if (errors.length) {
    packets.push(
      packet({
        id: "general.errors_generic",
        type: "error",
        lane: "general",
        trigger: ["__error__"], // manual only
        templates: errors,
        chips: defaultChipsForGeneral(),
        sessionPatch: { lane: "general" },
      })
    );
  }

  // MUSIC
  const askYear = getBucket(raw, "music", "ask_year");
  if (askYear.length) {
    packets.push(
      packet({
        id: "music.ask_year",
        type: "prompt",
        lane: "music",
        trigger: TRIG.musicPrompt,
        constraints: { requiresYear: true },
        templates: askYear,
        chips: defaultChipsForMusic(),
        sessionPatch: { lane: "music" },
      })
    );
  }

  const modePromptHasYear = getBucket(raw, "music", "mode_prompt_has_year");
  if (modePromptHasYear.length) {
    packets.push(
      packet({
        id: "music.mode_prompt_has_year",
        type: "prompt",
        lane: "music",
        trigger: ["__mode_prompt__"], // invoked by chatEngine when year known but mode unclear
        templates: modePromptHasYear,
        chips: safeChips([
          { label: "Top 10", send: "top 10" },
          { label: "Story moment", send: "story moment" },
          { label: "Micro moment", send: "micro moment" },
          { label: "#1", send: "#1" },
        ]),
        sessionPatch: { lane: "music" },
      })
    );
  }

  const navNext = getBucket(raw, "music", "nav_next_year");
  if (navNext.length) {
    packets.push(
      packet({
        id: "music.nav_next_year",
        type: "nav",
        lane: "music",
        trigger: ["__nav_next_year__"], // invoked by chatEngine when next year computed
        templates: navNext,
        chips: safeChips([{ label: "Replay", send: "replay" }]),
        sessionPatch: { lane: "music" },
      })
    );
  }

  const navAnother = getBucket(raw, "music", "nav_another_year");
  if (navAnother.length) {
    packets.push(
      packet({
        id: "music.nav_another_year",
        type: "nav",
        lane: "music",
        trigger: ["another year", "__nav_another_year__"],
        templates: navAnother,
        chips: safeChips([
          { label: "1988", send: "1988" },
          { label: "1999", send: "1999" },
          { label: "2007", send: "2007" },
        ]),
        sessionPatch: { lane: "music" },
      })
    );
  }

  // SPONSORS
  const sOpen = getBucket(raw, "sponsors", "open");
  if (sOpen.length) {
    packets.push(
      packet({
        id: "sponsors.open",
        type: "prompt",
        lane: "sponsors",
        trigger: TRIG.sponsors,
        templates: sOpen,
        chips: defaultChipsForSponsors(),
        sessionPatch: { lane: "sponsors" },
      })
    );
  }

  const sNeedGoal = getBucket(raw, "sponsors", "need_goal");
  if (sNeedGoal.length) {
    packets.push(
      packet({
        id: "sponsors.need_goal",
        type: "prompt",
        lane: "sponsors",
        trigger: ["__sponsors_need_goal__"],
        templates: sNeedGoal,
        chips: safeChips([
          { label: "Calls", send: "calls" },
          { label: "Foot traffic", send: "foot traffic" },
          { label: "Website clicks", send: "website clicks" },
          { label: "Awareness", send: "brand awareness" },
        ]),
        sessionPatch: { lane: "sponsors" },
      })
    );
  }

  const sNeedBudget = getBucket(raw, "sponsors", "need_budget");
  if (sNeedBudget.length) {
    packets.push(
      packet({
        id: "sponsors.need_budget",
        type: "prompt",
        lane: "sponsors",
        trigger: ["__sponsors_need_budget__"],
        templates: sNeedBudget,
        chips: safeChips([
          { label: "Starter test", send: "starter test" },
          { label: "Growth bundle", send: "growth bundle" },
          { label: "Dominance", send: "dominance" },
        ]),
        sessionPatch: { lane: "sponsors" },
      })
    );
  }

  // SCHEDULE
  const scOpen = getBucket(raw, "schedule", "open");
  if (scOpen.length) {
    packets.push(
      packet({
        id: "schedule.open",
        type: "prompt",
        lane: "schedule",
        trigger: TRIG.schedule,
        templates: scOpen,
        chips: defaultChipsForSchedule(),
        sessionPatch: { lane: "schedule" },
      })
    );
  }

  const scNeedCity = getBucket(raw, "schedule", "need_city");
  if (scNeedCity.length) {
    packets.push(
      packet({
        id: "schedule.need_city",
        type: "prompt",
        lane: "schedule",
        trigger: ["__schedule_need_city__"],
        templates: scNeedCity,
        chips: safeChips([
          { label: "London", send: "in London" },
          { label: "Toronto", send: "in Toronto" },
          { label: "New York", send: "in New York" },
          { label: "Los Angeles", send: "in Los Angeles" },
        ]),
        sessionPatch: { lane: "schedule" },
      })
    );
  }

  const scNeedShow = getBucket(raw, "schedule", "need_show_or_now");
  if (scNeedShow.length) {
    packets.push(
      packet({
        id: "schedule.need_show_or_now",
        type: "prompt",
        lane: "schedule",
        trigger: ["__schedule_need_show__"],
        templates: scNeedShow,
        chips: safeChips([
          { label: "Playing now", send: "what’s playing now" },
          { label: "Today", send: "schedule today" },
        ]),
        sessionPatch: { lane: "schedule" },
      })
    );
  }

  // MOVIES
  const mOpen = getBucket(raw, "movies", "open");
  if (mOpen.length) {
    packets.push(
      packet({
        id: "movies.open",
        type: "prompt",
        lane: "movies",
        trigger: TRIG.movies,
        templates: mOpen,
        chips: defaultChipsForMovies(),
        sessionPatch: { lane: "movies" },
      })
    );
  }

  const mNeed = getBucket(raw, "movies", "need_title_or_genre");
  if (mNeed.length) {
    packets.push(
      packet({
        id: "movies.need_title_or_genre",
        type: "prompt",
        lane: "movies",
        trigger: ["__movies_need_title_or_genre__"],
        templates: mNeed,
        chips: defaultChipsForMovies(),
        sessionPatch: { lane: "movies" },
      })
    );
  }

  const out = {
    version: "packets_v1",
    updated: raw.updated || new Date().toISOString().slice(0, 10),
    source: raw.version || "nyx_phrasepack_v1",
    voice: raw.voice || null,
    packets,
  };

  writeJson(OUT_PATH, out);
  console.log("Wrote:", OUT_PATH);
  console.log("Packets:", packets.length);
}

main();

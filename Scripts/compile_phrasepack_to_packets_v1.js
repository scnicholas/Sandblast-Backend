"use strict";

/**
 * Scripts/compile_nyx_phrasepack_v1_to_packets_v1.js
 *
 * Input:  Data/nyx/nyx_phrasepack_v1.json  (canonical schema in this message)
 * Output: Data/nyx/packets_v1.json
 *
 * Tailored compiler rules:
 *  - Each bucket maps to a packet with triggers, chips, constraints where relevant.
 *  - Templates are copied verbatim (runtime chooses deterministically).
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

function getBucket(root, lane, key) {
  try {
    const arr = asStringArray(root.buckets[lane][key]);
    return arr;
  } catch {
    return [];
  }
}

function packet({ id, type, lane, trigger, templates, chips, constraints }) {
  const out = { id, type, lane, trigger: trigger || [], templates: templates || [] };
  if (chips && chips.length) out.chips = chips;
  if (constraints && Object.keys(constraints).length) out.constraints = constraints;
  return out;
}

function main() {
  const raw = readJson(IN_PATH);

  if (!raw || raw.version !== "nyx_phrasepack_v1" || !raw.buckets) {
    throw new Error("Invalid input: expected Data/nyx/nyx_phrasepack_v1.json with version nyx_phrasepack_v1 and buckets{}");
  }

  const packets = [];

  // ===== GENERAL =====
  const gFirst = getBucket(raw, "general", "greetings_first");
  if (gFirst.length) {
    packets.push(
      packet({
        id: "greet_first_time",
        type: "greeting",
        lane: "general",
        trigger: ["hello", "hi", "hey", "good morning", "good afternoon", "good evening"],
        templates: gFirst,
        chips: [
          { label: "Music (1988)", send: "1988" },
          { label: "Schedule", send: "schedule" },
          { label: "Sponsors", send: "sponsors" },
          { label: "Movies/TV", send: "movies" }
        ]
      })
    );
  }

  const gReturn = getBucket(raw, "general", "greetings_returning");
  if (gReturn.length) {
    packets.push(
      packet({
        id: "greet_returning",
        type: "greeting",
        lane: "general",
        trigger: ["welcome back", "back again", "we're back", "im back", "i'm back"],
        templates: gReturn,
        chips: [
          { label: "Top 10 1988", send: "top 10 1988" },
          { label: "Schedule now", send: "what’s playing now" },
          { label: "Sponsor packages", send: "sponsor packages" },
          { label: "Recommend TV", send: "recommend tv" }
        ]
      })
    );
  }

  const caps = getBucket(raw, "general", "capabilities_quick");
  if (caps.length) {
    packets.push(
      packet({
        id: "capabilities_quick",
        type: "clarify",
        lane: "general",
        trigger: ["what can you do", "help", "menu", "options"],
        templates: caps,
        chips: [
          { label: "Top 10 1988", send: "top 10 1988" },
          { label: "Playing now", send: "what’s playing now" },
          { label: "Sponsors", send: "sponsors" },
          { label: "Movies/TV", send: "movies" }
        ]
      })
    );
  }

  const nudge = getBucket(raw, "general", "fallback_nudge");
  if (nudge.length) {
    packets.push(
      packet({
        id: "fallback_nudge",
        type: "nudge",
        lane: "general",
        trigger: ["__fallback__"],
        templates: nudge,
        chips: [
          { label: "Music (1988)", send: "1988" },
          { label: "Schedule", send: "schedule" },
          { label: "Sponsors", send: "sponsors" },
          { label: "Movies/TV", send: "movies" }
        ]
      })
    );
  }

  const goodbyes = getBucket(raw, "general", "goodbyes_soft");
  if (goodbyes.length) {
    packets.push(
      packet({
        id: "goodbye_soft",
        type: "goodbye",
        lane: "general",
        trigger: ["bye", "goodbye", "good night", "later", "see you"],
        templates: goodbyes,
        chips: [
          { label: "Top 10 1994", send: "top 10 1994" },
          { label: "Schedule now", send: "what’s playing now" }
        ]
      })
    );
  }

  const errors = getBucket(raw, "general", "errors_generic");
  if (errors.length) {
    packets.push(
      packet({
        id: "errors_generic",
        type: "error",
        lane: "general",
        trigger: ["__error__"],
        templates: errors,
        chips: [
          { label: "Try music", send: "1988" },
          { label: "Try schedule", send: "schedule" },
          { label: "Try sponsors", send: "sponsors" },
          { label: "Try movies", send: "movies" }
        ]
      })
    );
  }

  // ===== MUSIC =====
  const askYear = getBucket(raw, "music", "ask_year");
  if (askYear.length) {
    packets.push(
      packet({
        id: "music_ask_year",
        type: "clarify",
        lane: "music",
        trigger: ["music", "song", "top 10", "top10", "chart", "story moment", "micro moment", "#1", "number 1"],
        constraints: { requiresYear: true },
        templates: askYear,
        chips: [
          { label: "1988", send: "1988" },
          { label: "1999", send: "1999" },
          { label: "2007", send: "2007" },
          { label: "Top 10 1988", send: "top 10 1988" }
        ]
      })
    );
  }

  const modePrompt = getBucket(raw, "music", "mode_prompt_has_year");
  if (modePrompt.length) {
    packets.push(
      packet({
        id: "music_mode_prompt_has_year",
        type: "confirm",
        lane: "music",
        trigger: ["__music_has_year_need_mode__"],
        constraints: { requiresYear: true },
        templates: modePrompt,
        chips: [
          { label: "Top 10", send: "top 10" },
          { label: "Story moment", send: "story moment" },
          { label: "Micro moment", send: "micro moment" },
          { label: "#1", send: "#1" }
        ]
      })
    );
  }

  // ===== SPONSORS =====
  const sOpen = getBucket(raw, "sponsors", "open");
  if (sOpen.length) {
    packets.push(
      packet({
        id: "sponsor_open",
        type: "handoff",
        lane: "sponsors",
        trigger: ["sponsor", "advertise", "ads", "pricing", "rates", "packages"],
        templates: sOpen,
        chips: [
          { label: "TV", send: "tv" },
          { label: "Radio", send: "radio" },
          { label: "Website", send: "website" },
          { label: "Social", send: "social" },
          { label: "Bundle", send: "bundle" }
        ]
      })
    );
  }

  // ===== SCHEDULE =====
  const scNeedCity = getBucket(raw, "schedule", "need_city");
  if (scNeedCity.length) {
    packets.push(
      packet({
        id: "schedule_need_city",
        type: "clarify",
        lane: "schedule",
        trigger: ["schedule", "what time", "playing now", "what’s playing", "what's playing", "airing"],
        constraints: { requiresCity: true },
        templates: scNeedCity,
        chips: [
          { label: "London", send: "in London" },
          { label: "Toronto", send: "in Toronto" },
          { label: "New York", send: "in New York" }
        ]
      })
    );
  }

  // ===== MOVIES =====
  const mOpen = getBucket(raw, "movies", "open");
  if (mOpen.length) {
    packets.push(
      packet({
        id: "movies_open",
        type: "handoff",
        lane: "movies",
        trigger: ["movie", "movies", "tv", "series", "show", "watch", "stream", "roku"],
        templates: mOpen,
        chips: [
          { label: "Recommend TV", send: "recommend tv" },
          { label: "Detective", send: "detective" },
          { label: "Westerns", send: "westerns" },
          { label: "Classic TV", send: "classic tv" }
        ]
      })
    );
  }

  const out = {
    version: "packets_v1",
    source: "compiled_from_nyx_phrasepack_v1",
    updated: new Date().toISOString().slice(0, 10),
    packets
  };

  writeJson(OUT_PATH, out);
  console.log("Wrote:", OUT_PATH);
  console.log("Packets:", packets.length);
}

main();

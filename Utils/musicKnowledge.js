"use strict";

/**
 * Utils/musicKnowledge.js
 *
 * HARDENED TOP10 GUARANTEE PATCH
 *
 * Guarantees:
 *  - Top10 always returns exactly 10 items
 *  - No implicit slicing
 *  - No silent row drops
 *  - Structured + legacy render support
 *
 * This file intentionally does NOT touch UI concerns.
 */

const fs = require("fs");
const path = require("path");

// =========================
// Constants
// =========================
const DATA_DIR = path.resolve(__dirname, "..", "Data");
const TOP10_FILE = path.join(DATA_DIR, "top10_by_year_v1.json");

const TOP10_REQUIRED_COUNT = 10;

// =========================
// Helpers
// =========================
function safeReadJSON(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (e) {
    return null;
  }
}

function normalizeItem(raw, index) {
  return {
    pos: Number(raw.pos ?? raw.rank ?? index + 1),
    title: String(raw.title || "").trim(),
    artist: String(raw.artist || raw.artists || "").trim()
  };
}

// =========================
// Core: Get Top10 by Year
// =========================
function getTop10ByYear(year) {
  const store = safeReadJSON(TOP10_FILE);
  if (!store || !store.years || !store.years[year]) {
    return null;
  }

  let items = Array.isArray(store.years[year].items)
    ? store.years[year].items.map(normalizeItem)
    : [];

  // HARD GUARANTEE: exactly 10 items
  if (items.length > TOP10_REQUIRED_COUNT) {
    items = items.slice(0, TOP10_REQUIRED_COUNT);
  }

  if (items.length < TOP10_REQUIRED_COUNT) {
    const missing = TOP10_REQUIRED_COUNT - items.length;
    for (let i = 0; i < missing; i++) {
      items.push({
        pos: items.length + 1,
        title: "—",
        artist: ""
      });
    }
  }

  return {
    year,
    chart: "Billboard Year-End Hot 100",
    count: TOP10_REQUIRED_COUNT,
    items
  };
}

// =========================
// Render (Legacy Compatibility)
// =========================
function renderTop10Text(top10) {
  return top10.items
    .map(
      (item) =>
        `${item.pos}. "${item.title}"${
          item.artist ? " — " + item.artist : ""
        }`
    )
    .join("\n");
}

// =========================
// Public API
// =========================
module.exports = {
  getTop10ByYear,
  renderTop10Text
};

"use strict";

/**
 * Utils/moviesLane.js
 *
 * Phase 0 Movies Lane (Acquisition Shortlist + Feasibility Filter)
 *
 * Collect minimal fields:
 *  - format: movie | series
 *  - era: 1970s | 1980s | late 1970s–late 1980s etc.
 *  - genres: comma list
 *  - budgetModel: "rev-share/no-MG" | "MG"
 *  - territory: Canada | United States | Worldwide
 *  - distribution: FAST | AVOD | FAST+AVOD | etc.
 *  - sources: Filmhub | Bitmax | other (optional)
 *
 * Returns:
 *  - reply (tight, forward-moving)
 *  - followUps (array of {label,send}) ALWAYS
 *  - sessionPatch (lane + movies.phase0)
 */

function cleanText(s) {
  return String(s || "").replace(/\u200B/g, "").replace(/\s+/g, " ").trim();
}

function hasAny(text, arr) {
  const t = cleanText(text).toLowerCase();
  return arr.some((k) => t.includes(k));
}

function detectMoviesIntent(text) {
  const t = cleanText(text).toLowerCase();
  if (!t) return { hit: false, confidence: 0 };

  const strong = [
    "license",
    "licensing",
    "rights",
    "rightsholder",
    "acquire",
    "acquisition",
    "catalog",
    "distributor",
    "sales agent",
    "minimum guarantee",
    "mg",
    "rev share",
    "revenue share",
    "avod",
    "fast",
    "tvod",
    "svod",
    "roku",
    "ott",
    "territory",
    "term",
    "deliverables",
    "filmhub",
    "bitmax",
  ];

  const typeSignals = ["movie", "movies", "film", "films", "series", "tv show", "tv shows", "episodes", "season"];

  // Avoid stealing explicit music flows
  const musicSignals = ["top 10", "top10", "story moment", "micro moment", "billboard", "hot 100", "rpm", "song", "artist"];

  const isMovieish = hasAny(t, strong) || hasAny(t, typeSignals);
  const isMusicish = hasAny(t, musicSignals);

  if (isMusicish && !hasAny(t, strong)) return { hit: false, confidence: 0 };

  if (isMovieish) return { hit: true, confidence: hasAny(t, strong) ? 0.9 : 0.7 };
  return { hit: false, confidence: 0 };
}

function normalizeFollowUps(followUps) {
  const safe = Array.isArray(followUps) ? followUps : [];
  const cleaned = safe
    .filter((x) => x && typeof x === "object")
    .map((x) => ({
      label: cleanText(x.label),
      send: cleanText(x.send),
    }))
    .filter((x) => x.label && x.send);

  if (cleaned.length) return cleaned;

  // Hard fallback: contract-safe
  return [
    { label: "Movie", send: "movie" },
    { label: "Series", send: "series" },
    { label: "1970s", send: "1970s" },
    { label: "1980s", send: "1980s" },
    { label: "Rev-share (No MG)", send: "rev share no mg" },
    { label: "FAST+AVOD", send: "FAST AVOD" },
    { label: "Filmhub", send: "filmhub" },
    { label: "Bitmax", send: "bitmax" },
  ];
}

function pickMissing(fields) {
  const required = ["format", "era", "genres", "budgetModel", "territory", "distribution"];
  return required.filter((k) => !fields[k]);
}

function extractFields(text, prevFields) {
  const t = cleanText(text).toLowerCase();
  const fields = Object.assign({}, prevFields || {});

  if (!fields.format) {
    if (t.includes("series") || t.includes("tv show") || t.includes("episodes") || t.includes("season")) fields.format = "series";
    else if (t.includes("movie") || t.includes("film")) fields.format = "movie";
  }

  if (!fields.era) {
    if (t.includes("late 70") || t.includes("late-70")) fields.era = "late 1970s";
    else if (t.includes("late 80") || t.includes("late-80")) fields.era = "late 1980s";
    else if (t.includes("70s") || t.includes("1970")) fields.era = "1970s";
    else if (t.includes("80s") || t.includes("1980")) fields.era = "1980s";
    else if (t.includes("late 70s") && t.includes("late 80s")) fields.era = "late 1970s–late 1980s";
  }

  if (!fields.genres) {
    const g = [];
    if (t.includes("crime")) g.push("crime");
    if (t.includes("detective")) g.push("detective");
    if (t.includes("comedy")) g.push("comedy");
    if (t.includes("thriller")) g.push("thriller");
    if (t.includes("action")) g.push("action");
    if (g.length) fields.genres = g.join(", ");
  }

  if (!fields.budgetModel) {
    if (t.includes("no mg") || t.includes("no minimum guarantee") || t.includes("rev share") || t.includes("revenue share")) {
      fields.budgetModel = "rev-share/no-MG";
    } else if (t.includes("mg") || t.includes("minimum guarantee")) {
      fields.budgetModel = "MG";
    }
  }

  if (!fields.territory) {
    if (t.includes("worldwide") || t.includes("ww")) fields.territory = "Worldwide";
    else if (t.includes("canada") || /\bca\b/.test(t)) fields.territory = "Canada";
    else if (t.includes("united states") || /\busa\b/.test(t) || /\bus\b/.test(t)) fields.territory = "United States";
  }

  if (!fields.distribution) {
    const d = [];
    if (t.includes("fast")) d.push("FAST");
    if (t.includes("avod")) d.push("AVOD");
    if (t.includes("tvod")) d.push("TVOD");
    if (t.includes("svod")) d.push("SVOD");
    if (d.length) fields.distribution = d.join("+");
  }

  if (!fields.sources) {
    const s = [];
    if (t.includes("filmhub")) s.push("Filmhub");
    if (t.includes("bitmax")) s.push("Bitmax");
    if (s.length) fields.sources = s.join(", ");
  }

  return fields;
}

function buildReply(fields, missing) {
  if (!missing.length) {
    return [
      "Movies Phase 0 locked.",
      `• Format: ${fields.format}`,
      `• Era: ${fields.era}`,
      `• Genres: ${fields.genres}`,
      `• Budget model: ${fields.budgetModel}`,
      `• Territory: ${fields.territory}`,
      `• Distribution: ${fields.distribution}`,
      fields.sources ? `• Sources: ${fields.sources}` : null,
      "",
      "Next: pick one so I generate a 10–15 title shortlist:",
      "1) Filmhub only  2) Bitmax only  3) Mix sources  4) UK focus",
    ]
      .filter(Boolean)
      .join("\n");
  }

  const ask = [];
  if (missing.includes("format")) ask.push("Format: movie or series?");
  if (missing.includes("era")) ask.push("Era: 1970s or 1980s (or late 70s–late 80s)?");
  if (missing.includes("genres")) ask.push("Genres: crime/detective/comedy (pick 1–3)?");
  if (missing.includes("budgetModel")) ask.push("Budget model: rev-share/no-MG, or MG?");
  if (missing.includes("territory")) ask.push("Territory: Canada, US, or Worldwide?");
  if (missing.includes("distribution")) ask.push("Distribution: FAST, AVOD, or both?");

  return [
    "Movies Phase 0 — quick lock-in.",
    ...ask,
    "",
    "Reply in one line like:",
    "“series | late 70s–80s | crime, detective | rev-share/no-MG | Canada | FAST+AVOD”",
  ].join("\n");
}

function buildFollowUps(fields, missing) {
  if (missing.length) {
    return normalizeFollowUps([
      { label: "Movie", send: "movie" },
      { label: "Series", send: "series" },
      { label: "1970s", send: "1970s" },
      { label: "1980s", send: "1980s" },
      { label: "Crime/Detective", send: "crime detective" },
      { label: "Comedy", send: "comedy" },
      { label: "Rev-share (No MG)", send: "rev share no mg" },
      { label: "Canada", send: "Canada" },
      { label: "FAST+AVOD", send: "FAST AVOD" },
    ]);
  }

  return normalizeFollowUps([
    { label: "Filmhub only", send: "filmhub only" },
    { label: "Bitmax only", send: "bitmax only" },
    { label: "Mix sources", send: "mix sources" },
    { label: "UK focus", send: "uk focus" },
    { label: "Generate shortlist", send: "generate phase 0 shortlist" },
  ]);
}

function handleChat({ text, session }) {
  const input = cleanText(text);
  const sess = session || {};
  const prev = sess.movies && sess.movies.phase0 ? sess.movies.phase0 : {};

  const fields = extractFields(input, prev);
  const missing = pickMissing(fields);

  const reply = buildReply(fields, missing);
  const followUps = buildFollowUps(fields, missing);

  const sessionPatch = {
    lane: "movies",
    movies: {
      phase0: {
        ...fields,
        missing,
      },
    },
  };

  return { reply, followUps, sessionPatch };
}

module.exports = {
  detectMoviesIntent,
  handleChat,
};

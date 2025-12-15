const fs = require("fs");
const path = require("path");

let CACHE = null;

function loadDb() {
  if (CACHE) return CACHE;

  const filePath = path.join(__dirname, "..", "Data", "music_moments_v1.json");
  const raw = fs.readFileSync(filePath, "utf8");
  CACHE = JSON.parse(raw);
  return CACHE;
}

function normalize(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[^\w\s#]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractYear(text) {
  const m = String(text || "").match(/\b(19\d{2}|20\d{2})\b/);
  return m ? Number(m[1]) : null;
}

function looksLikeMusicHistory(text) {
  const t = normalize(text);
  return (
    t.includes("billboard") ||
    t.includes("hot 100") ||
    t.includes("top 40") ||
    t.includes("charts") ||
    t.includes("chart") ||
    t.includes("#1") ||
    t.includes("# 1") ||
    t.includes("no 1") ||
    t.includes("no. 1") ||
    t.includes("number 1") ||
    t.includes("number one") ||
    t.includes("weeks at") ||
    t.includes("peak")
  );
}

// Basic entity hints (v1 — minimal but useful)
function extractArtistHint(text) {
  const t = normalize(text);

  if (t.includes("madonna")) return "Madonna";
  if (t.includes("michael jackson") || t.includes("mj")) return "Michael Jackson";
  if (t.includes("whitney")) return "Whitney Houston";
  if (t.includes("beatles")) return "The Beatles";

  return null;
}

function extractTitleHint(text) {
  const t = normalize(text);

  if (t.includes("like a virgin")) return "Like a Virgin";
  if (t.includes("billie jean")) return "Billie Jean";
  if (t.includes("i will always love you")) return "I Will Always Love You";
  if (t.includes("i want to hold your hand")) return "I Want to Hold Your Hand";

  return null;
}

function pickBestMoment(db, { artist, title, year }) {
  const moments = db.moments || [];
  let candidates = moments;

  if (artist) candidates = candidates.filter(m => normalize(m.artist) === normalize(artist));
  if (title) candidates = candidates.filter(m => normalize(m.title) === normalize(title));
  if (year) candidates = candidates.filter(m => Number(m.year) === Number(year));

  // If strict filtering yields nothing, relax in order: title -> year -> artist
  if (!candidates.length && title) candidates = moments.filter(m => normalize(m.title) === normalize(title));
  if (!candidates.length && artist) candidates = moments.filter(m => normalize(m.artist) === normalize(artist));
  if (!candidates.length && year) candidates = moments.filter(m => Number(m.year) === Number(year));

  return candidates[0] || null;
}

function formatMomentReply(moment) {
  const chart = moment.chart || "Billboard Hot 100";
  // Broadcast spec: one chart fact, one cultural note, one next action
  return `${moment.fact}\nCultural note: ${moment.culture}\nNext step: ${moment.next}`;
}

/**
 * Main entry:
 * - Returns { handled: true, reply, metaPatch } when knowledge layer answered
 * - Otherwise { handled: false }
 */
function answerMusicHistory(message, laneDetail) {
  const db = loadDb();

  const yearFromText = extractYear(message);
  const artistHint = extractArtistHint(message);
  const titleHint = extractTitleHint(message);

  const year = yearFromText || (laneDetail && laneDetail.year ? Number(laneDetail.year) : null);

  // If it doesn't look like music_history and no lane detail indicates music context, do nothing.
  if (!looksLikeMusicHistory(message) && !artistHint && !titleHint) {
    return { handled: false };
  }

  // If user is asking "When was Madonna #1" and we don't have a year,
  // ask ONE clarifier. (We do NOT loop; your index.js awaiting guard handles that.)
  if ((artistHint === "Madonna" || normalize(message).includes("madonna")) && !year && !titleHint) {
    return {
      handled: true,
      reply: "Quick check — which year (or song title) for Madonna’s #1 are you asking about? I can default to Billboard Hot 100.",
      metaPatch: { awaiting: "year_or_date", chart: (laneDetail && laneDetail.chart) || db.defaultChart }
    };
  }

  const chosen = pickBestMoment(db, { artist: artistHint, title: titleHint, year });

  if (!chosen) {
    // Useful neutral fallback from knowledge layer
    return {
      handled: true,
      reply:
        `I can anchor this, but I need one detail: a year OR a song title OR which chart (Billboard Hot 100 / UK Top 40 / Canada RPM).\n` +
        `Next step: reply with a year (e.g., 1984) or a song title.`,
      metaPatch: { chart: (laneDetail && laneDetail.chart) || db.defaultChart }
    };
  }

  return {
    handled: true,
    reply: formatMomentReply(chosen),
    metaPatch: { chart: chosen.chart || db.defaultChart }
  };
}

module.exports = { answerMusicHistory };

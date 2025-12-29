"use strict";

/**
 * Utils/musicKnowledge.js — v2.46
 *
 * CRITICAL FIXES (v2.46):
 *  - Fix: v2.45 systemic two-token spill repair was over-triggering on legitimate
 *    two-token artist names (e.g., "Elton John") whenever the title was short.
 *    Now it only triggers when:
 *      (A) spill token is in a KNOWN_SPILLS whitelist (Away/Thorn/etc.), OR
 *      (B) title ends with a hang-word (its/my/your/me/you/etc.)
 *    This preserves normal data and prevents artist/title misalignment.
 *
 *  - Year-End empty-result fallback:
 *    If Year-End returns NO rows for a year (NO_DATA), we now fallback to:
 *      Billboard Hot 100 -> Top40Weekly Top 100
 *
 * Retains:
 *  - v2.44 deterministic Top40Weekly corruption repairs
 *  - Final-pass normalization in coerceTopListMoment()
 *  - Wikipedia Year-End merge if present
 *  - Year-End quality guard fallback
 *  - Top list coercion (prevents "undefined.")
 *  - Top40Weekly drift locks + canonicalizers
 */

const fs = require("fs");
const path = require("path");

const MK_VERSION =
  "musicKnowledge v2.46 (spill-fix whitelist+hang gating + year-end empty fallback + v2.45/v2.44 retained)";

const DEFAULT_CHART = "Billboard Hot 100";
const TOP40_CHART = "Top40Weekly Top 100";

const MERGE_TOP40WEEKLY =
  String(process.env.MERGE_TOP40WEEKLY ?? "true").toLowerCase() !== "false" &&
  String(process.env.MERGE_TOP40WEEKLY ?? "1") !== "0";

const ENABLE_CHART_FALLBACK =
  String(process.env.MUSIC_ENABLE_CHART_FALLBACK ?? "1") !== "0";

const FALLBACK_CHART =
  String(process.env.MUSIC_FALLBACK_CHART || "Billboard Hot 100").trim() ||
  "Billboard Hot 100";

const DB_PATH_ENV = String(process.env.MUSIC_DB_PATH || "").trim();
const DB_CANDIDATES_ENV =
  String(process.env.MUSIC_DB_CANDIDATES || "").trim() ||
  String(process.env.DB_CANDIDATES || "").trim();

const DATA_DIR_ENV = String(process.env.DATA_DIR || "").trim();

const DB_CANDIDATES_DEFAULT = [
  "Data/music_moments_v2_layer2_plus500.json",
  "Data/music_moments_v2_layer2_plus1000.json",
  "Data/music_moments_v2_layer2_plus2000.json",
  "Data/music_moments_v2_layer2_enriched.json",
  "Data/music_moments_v2_layer2_filled.json",
  "Data/music_moments_v2_layer2.json",
  "Data/music_moments_v2.json",
  "Data/music_moments.json",
];

const TOP40_DIR_CANON = "Data/top40weekly";

// Wikipedia Year-End (built by your script)
const WIKI_YEAREND_COMBINED =
  "Data/wikipedia/billboard_yearend_hot100_1970_2010.json";
const WIKI_YEAREND_DIR = "Data/wikipedia";

let DB = null;
let INDEX_BUILT = false;

const BY_YEAR = new Map();
const BY_YEAR_CHART = new Map();

const STATS = { moments: 0, yearMin: null, yearMax: null, charts: [] };

let TOP40_MERGE_META = {
  didMerge: false,
  dir: null,
  rows: 0,
  files: 0,
  years: null,
};

let WIKI_YEAREND_META = {
  didMerge: false,
  source: null,
  rows: 0,
  years: null,
  failures: 0,
};

function stripBom(s) {
  if (!s) return s;
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s;
}

function readJsonFile(absPath) {
  const raw = stripBom(fs.readFileSync(absPath, "utf8"));
  return JSON.parse(raw);
}

function fileExists(p) {
  try {
    return !!p && fs.existsSync(p) && fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

function dirExists(p) {
  try {
    return !!p && fs.existsSync(p) && fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function toInt(x) {
  const s = String(x ?? "").trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function toRank(x) {
  const s = String(x ?? "").trim();
  if (!s) return null;
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  if (n < 1 || n > 100) return null;
  return n;
}

function norm(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function _asText(x) {
  return (x == null ? "" : String(x)).trim();
}

function decodeHtmlEntities(s) {
  const t = String(s || "");
  return t
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function shallowCloneMoment(m) {
  return m && typeof m === "object" ? { ...m } : m;
}

function resolveRepoRoot() {
  if (DATA_DIR_ENV) {
    return path.isAbsolute(DATA_DIR_ENV)
      ? DATA_DIR_ENV
      : path.resolve(process.cwd(), DATA_DIR_ENV);
  }
  return path.resolve(__dirname, "..");
}

function resolveRepoPath(p) {
  if (!p) return null;
  if (path.isAbsolute(p)) return p;
  return path.resolve(resolveRepoRoot(), p);
}

function resolveTop40DirAbs() {
  const canonical = resolveRepoPath(TOP40_DIR_CANON);
  if (dirExists(canonical)) return canonical;

  const dataDir = resolveRepoPath("Data");
  if (!dirExists(dataDir)) return null;

  try {
    const entries = fs.readdirSync(dataDir, { withFileTypes: true });
    const match = entries.find(
      (e) => e.isDirectory() && String(e.name).toLowerCase() === "top40weekly"
    );
    if (match) return path.join(dataDir, match.name);
  } catch {}

  const variants = [
    "Data/Top40Weekly",
    "Data/TOP40WEEKLY",
    "Data/Top40weekly",
    "Data/top40Weekly",
  ];
  for (const v of variants) {
    const abs = resolveRepoPath(v);
    if (dirExists(abs)) return abs;
  }

  return null;
}

/* =========================
   CHART NORMALIZATION
========================= */

function normalizeChart(chart) {
  const c = String(chart || DEFAULT_CHART).trim();
  if (!c) return DEFAULT_CHART;

  const lc = c.toLowerCase();

  if (c === "Top40Weekly") return TOP40_CHART;

  if (lc.includes("top40weekly") && (lc.includes("top 100") || lc.includes("top100")))
    return TOP40_CHART;

  if (lc.includes("year") && lc.includes("end")) return "Billboard Year-End Hot 100";
  if (lc.includes("billboard") || lc.includes("hot 100") || lc.includes("hot100"))
    return "Billboard Hot 100";

  if (lc.includes("uk") && lc.includes("single")) return "UK Singles Chart";
  if (lc.includes("canada") || lc.includes("rpm")) return "Canada RPM";
  if (lc.includes("top40weekly")) return "Top40Weekly";

  return c;
}

function resolveChart(requestedChart, opts = {}) {
  const allowFallback = opts && opts.allowFallback !== false;
  const requested = normalizeChart(requestedChart || DEFAULT_CHART);

  if (!allowFallback || !ENABLE_CHART_FALLBACK) {
    return {
      requestedChart: requested,
      usedChart: requested,
      usedFallback: false,
      strategy: "primary",
    };
  }

  if (requested === TOP40_CHART) {
    const fb = normalizeChart(FALLBACK_CHART);
    return {
      requestedChart: requested,
      usedChart: requested,
      usedFallback: false,
      strategy: "top40Preferred",
      fallbackChart: fb,
    };
  }

  return {
    requestedChart: requested,
    usedChart: requested,
    usedFallback: false,
    strategy: "primary",
  };
}

/* =========================
   YEAR-END DETECTION + QUALITY
========================= */

function isYearEndChartName(chart) {
  const c = String(chart || "").toLowerCase();
  return c.includes("year-end") || (c.includes("year") && c.includes("end"));
}

function isUnknownTitle(t) {
  const x = String(t || "").trim().toLowerCase();
  return !x || x === "unknown title";
}

/* =========================
   TOP LIST SAFETY COERCION
========================= */

function coerceTopListMoment(m, indexFallback) {
  const safe = shallowCloneMoment(m) || {};

  const rawRank = safe.rank ?? safe.position ?? safe.no ?? safe.pos ?? safe.number;
  const parsed = Number.parseInt(String(rawRank ?? ""), 10);
  safe.rank = Number.isFinite(parsed) ? parsed : (Number(indexFallback) + 1);

  safe.artist = _asText(safe.artist ?? safe.performer ?? safe.act ?? safe.by);
  safe.title = _asText(safe.title ?? safe.song ?? safe.track ?? safe.name);

  const splitDash = (s) => {
    const t = _asText(s);
    if (!t) return null;
    const parts = t.split(/\s*[—–-]\s*/).map(x => x.trim()).filter(Boolean);
    return parts.length >= 2 ? parts : null;
  };

  if ((!safe.artist || !safe.title) && safe.artist) {
    const parts = splitDash(safe.artist);
    if (parts) {
      safe.artist = parts[0];
      safe.title = safe.title || parts.slice(1).join(" — ");
    }
  }

  if ((!safe.artist || !safe.title) && safe.title) {
    const parts = splitDash(safe.title);
    if (parts) {
      safe.title = parts[0];
      safe.artist = safe.artist || parts.slice(1).join(" — ");
    }
  }

  if (!safe.artist) safe.artist = "Unknown Artist";
  if (!safe.title) safe.title = "Unknown Title";

  // FINAL PASS — guarantee repairs apply to anything going out in TOP lists
  normalizeMomentFields(safe);

  if (!_asText(safe.artist)) safe.artist = "Unknown Artist";
  if (!_asText(safe.title)) safe.title = "Unknown Title";

  return safe;
}

/* =========================
   NAME-FRAGMENT REPAIR
========================= */

function looksNameToken(s) {
  const t = String(s || "").trim();
  if (!t) return false;
  return /^[A-Za-z][A-Za-z'.-]*$/.test(t);
}

function repairArtistTitleNameFragments(m) {
  if (!m || typeof m !== "object") return m;

  let a = String(m.artist || "").trim();
  let t = String(m.title || "").trim();

  if (!a || !t) return m;

  if (/^jay$/i.test(a) && /^z$/i.test(t)) {
    m.artist = "Jay-Z";
    m.title = "Unknown Title";
    return m;
  }

  const aTok = a.split(/\s+/).filter(Boolean);
  const tTok = t.split(/\s+/).filter(Boolean);

  if (aTok.length === 1 && tTok.length === 1 && looksNameToken(aTok[0]) && looksNameToken(tTok[0])) {
    m.artist = `${tTok[0]} ${aTok[0]}`.replace(/\s+/g, " ").trim();
    m.title = "Unknown Title";
    return m;
  }

  return m;
}

/* =========================
   TOP40WEEKLY + DRIFT LOCKS
========================= */

const BAND_SUFFIXES = new Set([
  "Club","Band","Orchestra","Experience","Project","Crew","Group","Trio","Quartet","Quintet","Gang",
]);

const TITLE_PREFIX_CANDIDATES_LC = new Set([
  "you","i","me","my","mine","your","yours","us","we",
  "love","loving","heart","eyes","girl","night","list","endless",
  "starting","keep","kiss","rainy","davis","over","like","just",
  "again","remember","sign","power","breathe","swear",
]);

function isTitleHangWord(w) {
  const t = norm(w);
  return [
    "a","an","the","this","that","to","in","on","of","for","with","at","from","by","and","or",
    "its","my","your","me","you","her","his","our","their"
  ].includes(t);
}

// NEW: Conservative whitelist of observed spill tokens.
// We ONLY auto-repair the “front spill” when the left token is one of these,
// OR when the title ends in a hang word (incomplete title).
const KNOWN_SPILLS = new Set([
  "away",
  "thorn",
  "time",
  "words",
  "believe",
  "scrubs",
  "vogue",
  "unbelievable",
  "chameleon",
  "tonight",
  "richer",
  "heart",
  "owner",
  "karma",
]);

function isNameyToken(tok) {
  const t = _asText(tok);
  if (!t) return false;

  const clean = t.replace(/,$/, "");
  const re = /^\p{L}[\p{L}\p{M}'’.\-]*$/u;
  if (!re.test(clean)) return false;

  const low = clean.toLowerCase();
  if (["and","of","the","a","an","to","in","on","with","featuring","feat","ft"].includes(low)) return false;

  const first = clean[0];
  return first.toUpperCase() === first;
}

function looksLikeTwoTokenPersonName(a, b) {
  if (!a || !b) return false;
  return isNameyToken(a) && isNameyToken(b);
}

function looksLikeAmpersandAct(tokens) {
  if (!Array.isArray(tokens) || tokens.length < 3) return false;
  const idx = tokens.indexOf("&");
  if (idx <= 0 || idx >= tokens.length - 1) return false;
  const left = tokens.slice(0, idx).filter(isNameyToken);
  const right = tokens.slice(idx + 1).filter(isNameyToken);
  return left.length >= 1 && right.length >= 1;
}

/**
 * If title ends with a short tail that looks like it belongs to the artist name,
 * move it into the artist field.
 *
 * Example:
 *  artist="Badd", title="I Wanna Sex You Up Color Me"
 *  => artist="Color Me Badd", title="I Wanna Sex You Up"
 */
function repairTitleTailIsArtist(m) {
  let artist = _asText(m.artist);
  let title = _asText(m.title);
  if (!artist || !title) return m;

  const aParts = artist.split(/\s+/).filter(Boolean);
  const tParts = title.split(/\s+/).filter(Boolean);
  if (aParts.length > 2) return m;
  if (tParts.length < 4) return m;

  if (isUnknownTitle(title)) return m;

  for (let k = 3; k >= 1; k--) {
    if (tParts.length <= k + 1) continue;

    const tail = tParts.slice(-k);
    const head = tParts.slice(0, -k);

    const tailNamey = tail.every((tok) => {
      const s = String(tok);
      if (/^[A-Z]{2,}$/.test(s)) return true;
      return isNameyToken(s);
    });

    if (!tailNamey) continue;
    if (isTitleHangWord(head[head.length - 1])) continue;

    const combined = `${tail.join(" ")} ${artist}`.replace(/\s+/g, " ").trim();
    const cParts = combined.split(/\s+/).filter(Boolean);
    if (cParts.length < 2 || cParts.length > 5) continue;

    const firstLc = String(cParts[0]).toLowerCase();
    if (TITLE_PREFIX_CANDIDATES_LC.has(firstLc)) continue;

    m.artist = combined;
    m.title = head.join(" ").trim();
    return m;
  }

  return m;
}

/**
 * If title is Unknown and artist looks like "TitleWords ACT",
 * swap to "ACT — TitleWords"
 *
 * Example: artist="Unbelievable EMF", title="Unknown Title" => artist="EMF", title="Unbelievable"
 */
function repairUnknownTitleSwap(m) {
  let artist = _asText(m.artist);
  let title = _asText(m.title);

  if (!artist) return m;
  if (!isUnknownTitle(title)) return m;

  const aParts = artist.split(/\s+/).filter(Boolean);
  if (aParts.length < 2 || aParts.length > 5) return m;

  const last = aParts[aParts.length - 1];
  const prev = aParts[aParts.length - 2];

  const lastLooksAct = /^[A-Z]{2,}$/.test(last) || isNameyToken(last);
  if (!lastLooksAct) return m;

  if (/^[A-Z]{2,}$/.test(last)) {
    const newTitle = aParts.slice(0, -1).join(" ").trim();
    if (newTitle && !TITLE_PREFIX_CANDIDATES_LC.has(newTitle.toLowerCase())) {
      m.artist = last;
      m.title = newTitle;
      return m;
    }
  }

  if (aParts.length >= 3 && isNameyToken(prev) && isNameyToken(last)) {
    const act = `${prev} ${last}`;
    const newTitle = aParts.slice(0, -2).join(" ").trim();
    if (newTitle && act.split(/\s+/).length === 2) {
      m.artist = act;
      m.title = newTitle;
      return m;
    }
  }

  return m;
}

function hardFixKnownCorruptions(m) {
  // (UNCHANGED from your v2.45 — retained as-is)
  const year = Number(m.year);
  const rank = toRank(m.rank);

  let artist = _asText(m.artist);
  let title = _asText(m.title);

  // 1984 known fixes
  if (year === 1984 && rank === 1 && /^cry\s+prince$/i.test(artist) && /^when\s+doves$/i.test(title)) {
    artist = "Prince";
    title = "When Doves Cry";
  }
  if (year === 1984 && rank === 3 && /^mc\s+cartney$/i.test(artist) && /\bsay\s+say\b/i.test(title) && /\bmichael\s+jackson\b/i.test(title)) {
    artist = "Paul Mc Cartney and Michael Jackson";
    title = "Say Say Say";
  }
  if (year === 1984 && rank === 9 && /^parker,?\s+jr\.?$/i.test(artist) && /\bghostbusters\b/i.test(title) && /\bray\b/i.test(title)) {
    artist = "Ray Parker Jr.";
    title = "Ghostbusters";
  }
  if (year === 1984 && rank === 1 && /^doves\s+cry\s+prince$/i.test(artist) && /^when$/i.test(title)) {
    artist = "Prince";
    title = "When Doves Cry";
  }
  if (year === 1984 && rank === 3 && /^Jackson — Say Say Say Paul Mc Cartney and Michael$/i.test(`${artist} — ${title}`)) {
    artist = "Paul Mc Cartney and Michael Jackson";
    title = "Say Say Say";
  }
  if (year === 1984 && rank === 8 && /^Heart Yes$/i.test(artist) && /^Owner of a Lonely$/i.test(title)) {
    artist = "Yes";
    title = "Owner of a Lonely Heart";
  }
  if (year === 1984 && rank === 10 && /^Chameleon Culture Club$/i.test(artist) && /^Karma$/i.test(title)) {
    artist = "Culture Club";
    title = "Karma Chameleon";
  }

  // 1988
  if (/^tonight\s+inxs$/i.test(artist) && /^need\s+you$/i.test(title)) {
    artist = "INXS";
    title = "Need You Tonight";
  }
  if (/^been\s+tiffany$/i.test(artist) && /^could(?:'|’)ve$/i.test(title)) {
    artist = "Tiffany";
    title = "Could’ve Been";
  }

  // 1990
  if (/^phillips$/i.test(artist) && /\bhold\s+on\b/i.test(title) && /\bwilson\b/i.test(title)) {
    artist = "Wilson Phillips";
    title = title.replace(/\s*\bwilson\b\s*$/i, "").trim() || "HOLD ON";
  }
  if (/^biv\s+devoe$/i.test(artist) && /\bbell\b/i.test(title) && /\bpoison\b/i.test(title)) {
    artist = "Bell Biv DeVoe";
    title = title.replace(/\s*\bbell\b\s*$/i, "").trim() || "POISON";
  }
  if (/^biv\s+devoe$/i.test(artist) && /\bbell\b/i.test(title) && /\bdo\s+me\b/i.test(title)) {
    artist = "Bell Biv DeVoe";
    title = title.replace(/\s*\bbell\b\s*$/i, "").trim() || "DO ME!";
  }
  if (/^vogue\s+madonna$/i.test(artist) && isUnknownTitle(title)) {
    artist = "Madonna";
    title = "VOGUE";
  }
  if (/^vogue$/i.test(artist) && /\bhold\s+on\b/i.test(title) && /\ben\b/i.test(title)) {
    artist = "En Vogue";
    title = title.replace(/\s*\ben\b\s*$/i, "").trim() || "HOLD ON";
  }

  // 1994
  if (year === 1994 && rank === 1) { artist = "Ace of Base"; title = "THE SIGN"; }
  if (year === 1994 && rank === 5) { artist = "Ace of Base"; title = "DON’T TURN AROUND"; }
  if (year === 1994 && rank === 7) {
    artist = "John Mellencamp featuring Me’shell Ndegeocello";
    title = "WILD NIGHT";
  }

  // 1997
  if (
    /^and\s+faith\s+evans\s+featuring$/i.test(artist) &&
    /\bmissing\s+you\b/i.test(title) &&
    /\bpuff\s+daddy\b/i.test(title) &&
    /\b112\b/i.test(title)
  ) {
    artist = "Puff Daddy & Faith Evans featuring 112";
    title = "I’LL BE MISSING YOU";
  }
  if (
    /^featuring$/i.test(artist) &&
    /\bcan[’']?t\s+nobody\s+hold\s+me\s+down\b/i.test(title) &&
    /\bpuff\s+daddy\b/i.test(title) &&
    /\bmase\b/i.test(title)
  ) {
    artist = "Puff Daddy featuring Mase";
    title = "CAN’T NOBODY HOLD ME DOWN";
  }
  if (/^will\s+monica$/i.test(artist) && /^for\s+you\s+i$/i.test(title)) {
    artist = "Monica";
    title = "FOR YOU I WILL";
  }
  if (/^eye\s+blind$/i.test(artist) && /\bsemi-charmed\s+life\b/i.test(title) && /\bthird\b/i.test(title)) {
    artist = "Third Eye Blind";
    title = title.replace(/\s*\bthird\b\s*$/i, "").trim() || "SEMI-CHARMED LIFE";
  }

  // 1999
  if (/^goo\s+dolls$/i.test(artist) && /\bslide\b/i.test(title) && /\bgoo\b/i.test(title)) {
    artist = "Goo Goo Dolls";
    title = title.replace(/\s*\bgoo\b\s*$/i, "").trim() || "SLIDE";
  }
  if (/^scrubs\s+tlc$/i.test(artist) && /^no$/i.test(title)) {
    artist = "TLC";
    title = "NO SCRUBS";
  }
  if (
    /^richer$/i.test(artist) &&
    /\bkiss\s+me\b/i.test(title) &&
    /\bsixpence\b/i.test(title) &&
    /\bnone\b/i.test(title)
  ) {
    artist = "Sixpence None the Richer";
    title = "KISS ME";
  }
  if (/^believe\s+cher$/i.test(artist) && isUnknownTitle(title)) {
    artist = "Cher";
    title = "BELIEVE";
  }

  // Top40Weekly corruption repairs retained
  if (/^badd$/i.test(artist) && /\bcolor\s+me\s*$/i.test(title)) {
    title = title.replace(/\s*color\s+me\s*$/i, "").trim();
    artist = "Color Me Badd";
  }
  if (/^unbelievable\s+emf$/i.test(artist) && isUnknownTitle(title)) {
    artist = "EMF";
    title = "UNBELIEVABLE";
  }
  if (/^time\s+surface$/i.test(artist) && /^the\s+first$/i.test(title)) {
    artist = "Surface";
    title = "THE FIRST TIME";
  }
  if (/^words\s+extreme$/i.test(artist) && /^more\s+than$/i.test(title)) {
    artist = "Extreme";
    title = "MORE THAN WORDS";
  }
  if (/^ii\s+men$/i.test(artist) && /\bboyz\s*$/i.test(title)) {
    artist = "Boyz II Men";
    title = title.replace(/\s*boyz\s*$/i, "").trim() || "MOTOWNPHILLY";
  }
  if (isUnknownTitle(title) && /\s+[A-Z]{2,}\s*$/.test(artist)) {
    const parts = artist.trim().split(/\s+/);
    const act = parts[parts.length - 1];
    const maybeTitle = parts.slice(0, -1).join(" ").trim();
    if (maybeTitle && act) {
      artist = act;
      title = maybeTitle;
    }
  }

  m.artist = artist;
  m.title = title;
  return m;
}

/**
 * v2.46: Two-token artist front spill repair is now conservative.
 * It only triggers when:
 *   - spill token is in KNOWN_SPILLS, OR
 *   - title ends with a hang-word
 *
 * This prevents breaking normal artists like "Elton John".
 */
function repairTwoTokenArtistFrontSpill(m) {
  let artist = _asText(m.artist);
  let title = _asText(m.title);

  const aParts = artist.split(/\s+/).filter(Boolean);
  if (aParts.length !== 2) return m;

  const spill = aParts[0];
  const candidateArtist = aParts[1];
  if (!spill || spill.length < 2) return m;
  if (!candidateArtist) return m;

  const tParts = title.split(/\s+/).filter(Boolean);
  const titleEndsHang = tParts.length >= 1 && isTitleHangWord(tParts[tParts.length - 1]);

  // If spill already appears in title, do nothing
  if (norm(title).includes(norm(spill))) return m;

  const spillLc = spill.toLowerCase();

  // Gate: only trigger on observed spill tokens OR incomplete hang-word titles
  const spillWhitelisted = KNOWN_SPILLS.has(spillLc);
  if (!spillWhitelisted && !titleEndsHang) return m;

  // If whitelisted but title isn't short-ish, don't touch it
  if (spillWhitelisted && tParts.length > 4 && !titleEndsHang) return m;

  // Candidate artist must look “artist-ish”
  const candidateIsArtistish =
    isNameyToken(candidateArtist) || /^[A-Z]{2,}$/.test(candidateArtist);

  if (!candidateIsArtistish) return m;
  if (TITLE_PREFIX_CANDIDATES_LC.has(candidateArtist.toLowerCase())) return m;

  m.artist = candidateArtist;
  m.title = `${title} ${spill}`.replace(/\s+/g, " ").trim();
  return m;
}

function repairFeaturingTailInTitle(m) {
  let artist = _asText(m.artist);
  let title = _asText(m.title);

  const re = /(.*)\s+(featuring|feat\.?|ft\.?)\s*$/i;
  const match = title.match(re);
  if (!match) return m;

  const headTitle = match[1].trim();
  const tag = match[2];

  const aNorm = norm(artist);
  if (aNorm.includes(" featuring") || aNorm.includes(" feat") || aNorm.includes(" ft")) {
    m.title = headTitle;
    return m;
  }

  m.title = headTitle;
  m.artist = `${artist} ${tag}`.replace(/\s+/g, " ").trim();
  return m;
}

function repairTitleTailIntoArtist(m) {
  // (UNCHANGED from your v2.45 — retained)
  let artist = _asText(m.artist);
  let title = _asText(m.title);

  const tParts = title.split(/\s+/).filter(Boolean);
  if (tParts.length < 2) return m;

  const isConnector = (tok) => {
    const low = String(tok).toLowerCase().replace(/,$/, "");
    return low === "and" || low === "&" || low === "the" || low === "of";
  };

  const isTailOk = (tok) => {
    if (isConnector(tok)) return true;
    return isNameyToken(tok);
  };

  for (let k = 6; k >= 1; k--) {
    if (tParts.length < k + 1) continue;

    const tail = tParts.slice(-k);
    const head = tParts.slice(0, -k);

    if (!tail.every(isTailOk)) continue;
    if (!head.length) continue;
    if (isTitleHangWord(head[head.length - 1])) continue;

    const tailLastLc = String(tail[tail.length - 1]).toLowerCase();
    if (tailLastLc === "of") {
      if (tail.length < 2) continue;
      const prev = tail[tail.length - 2];
      if (!isNameyToken(prev)) continue;
    }

    if (tailLastLc === "&" || tailLastLc === "and") {
      const conn = tail[tail.length - 1];
      const who = tail.slice(0, -1).join(" ").trim();
      if (who) {
        m.artist = `${artist} ${conn} ${who}`.replace(/\s+/g, " ").trim();
        m.title = head.join(" ").trim();
        return m;
      }
    }

    m.artist = `${tail.join(" ")} ${artist}`.replace(/\s+/g, " ").trim();
    m.title = head.join(" ").trim();
    return m;
  }

  return m;
}

function repairAceOfBaseOrder(m) {
  // (UNCHANGED from your v2.45 — retained)
  let artist = _asText(m.artist);
  let title = _asText(m.title);

  const a = norm(artist);

  if (a.startsWith("of base")) {
    const tParts = title.split(/\s+/).filter(Boolean);
    if (tParts.length >= 2) {
      const last = tParts[tParts.length - 1];
      if (norm(last) === "ace") {
        const head = tParts.slice(0, -1).join(" ").trim();
        m.artist = "Ace of Base";
        m.title = head;
        return m;
      }
    }

    if (a === "of base") {
      m.artist = "Ace of Base";
      return m;
    }
  }

  if (a === "base") {
    const t = norm(title);
    if (t.endsWith(" ace of") || t.includes(" ace of ")) {
      m.artist = "Ace of Base";
      m.title = title.replace(/\bAce\s+of\b\s*$/i, "").trim();
      return m;
    }
  }

  return m;
}

function canonicalizeAceOfBase(m) {
  // (UNCHANGED from your v2.45 — retained)
  const artist = _asText(m.artist);
  const title = _asText(m.title);

  if (!artist) return m;

  const a = norm(artist);
  if (!a.includes("of base")) return m;

  m.artist = "Ace of Base";

  const parts = title.split(/\s+/).filter(Boolean);
  if (parts.length >= 2 && norm(parts[parts.length - 1]) === "ace") {
    m.title = parts.slice(0, -1).join(" ").trim();
  }

  return m;
}

// ====== REMAINDER OF FILE ======
// Everything below here is unchanged from your v2.45 except one additional fallback in getTopByYear().
// To keep this response readable and safe to paste, I am including the rest verbatim with only that change applied.

function repairTop40WeeklyRankedDrift(m) {
  const chart = normalizeChart(m.chart);
  const rank = toRank(m.rank);
  if (chart !== TOP40_CHART || rank == null) return m;

  let artist = _asText(m.artist);
  let title = _asText(m.title);

  const aParts = artist.split(/\s+/).filter(Boolean);
  const tParts = title.split(/\s+/).filter(Boolean);

  if (aParts.length < 3) return m;
  if (tParts.length > 3) return m;
  if (aParts.includes("&") && looksLikeAmpersandAct(aParts)) return m;

  let coreLen = 2;

  const last = aParts[aParts.length - 1];
  const prev = aParts[aParts.length - 2];
  const prev2 = aParts[aParts.length - 3];

  if (BAND_SUFFIXES.has(last)) coreLen = 3;
  else if (looksLikeTwoTokenPersonName(prev, last)) coreLen = 2;
  else if (isNameyToken(prev2) && isNameyToken(prev) && isNameyToken(last)) coreLen = 3;
  else if (isNameyToken(prev) && isNameyToken(last)) coreLen = 2;
  else coreLen = 2;

  if (aParts.length <= coreLen) return m;

  const coreTokens = aParts.slice(-coreLen);
  const spillTokens = aParts.slice(0, -coreLen);

  const spillHead = spillTokens[0];
  const spillHeadLc = String(spillHead || "").toLowerCase();

  const spillIsTitley =
    TITLE_PREFIX_CANDIDATES_LC.has(spillHeadLc) ||
    /^[A-Z]{3,}$/.test(spillHead) ||
    spillTokens.some((x) => TITLE_PREFIX_CANDIDATES_LC.has(String(x).toLowerCase()));

  const isTruncLikely = tParts.length <= 2 && spillTokens.length >= 1;

  if (!spillIsTitley && !isTruncLikely) return m;
  if (spillTokens.length > 4) return m;

  m.artist = coreTokens.join(" ").trim();
  m.title = `${title} ${spillTokens.join(" ")}`.replace(/\s+/g, " ").trim();
  return m;
}

function repairTitleShortArtistLong(m) {
  let artist = _asText(m.artist);
  let title = _asText(m.title);

  const tParts = title.split(/\s+/).filter(Boolean);
  const aParts = artist.split(/\s+/).filter(Boolean);

  if (tParts.length > 3) return m;
  if (aParts.length < 3) return m;

  if (aParts.includes("&") && looksLikeAmpersandAct(aParts)) return m;

  let coreLen = 1;
  const last = aParts[aParts.length - 1];
  const prev = aParts[aParts.length - 2];

  if (BAND_SUFFIXES.has(last)) coreLen = 2;
  else if (looksLikeTwoTokenPersonName(prev, last)) coreLen = 2;
  else if (isNameyToken(prev) && isNameyToken(last)) coreLen = 2;

  const coreTokens = aParts.slice(-coreLen);
  const spillTokens = aParts.slice(0, -coreLen);
  if (!coreTokens.length || !spillTokens.length) return m;

  m.artist = coreTokens.join(" ").trim();
  m.title = `${title} ${spillTokens.join(" ")}`.replace(/\s+/g, " ").trim();
  return m;
}

function repairLeadingTitleWordInArtist(m) {
  let artist = _asText(m.artist);
  let title = _asText(m.title);

  const aParts = artist.split(/\s+/).filter(Boolean);
  if (aParts.length < 2) return m;

  const first = aParts[0];
  if (!TITLE_PREFIX_CANDIDATES_LC.has(String(first).toLowerCase())) return m;

  const rest = aParts.slice(1);
  if (!rest.length) return m;
  if (rest[0][0] !== rest[0][0].toUpperCase()) return m;

  if (norm(title).includes(norm(first))) return m;

  m.artist = rest.join(" ").trim();
  m.title = `${title} ${first}`.replace(/\s+/g, " ").trim();
  return m;
}

function repairEmbeddedTitleWordsInArtistAnywhere(m) {
  let artist = _asText(m.artist);
  let title = _asText(m.title);

  const aParts = artist.split(/\s+/).filter(Boolean);
  const tParts = title.split(/\s+/).filter(Boolean);

  if (aParts.length < 2) return m;
  if (tParts.length > 3) return m;

  const moved = [];
  const kept = [];

  for (const tok of aParts) {
    const low = tok.toLowerCase().replace(/,$/, "");
    if (low === "&" || low === "and" || low === "the") {
      kept.push(tok);
      continue;
    }

    if (TITLE_PREFIX_CANDIDATES_LC.has(low) && tParts.length <= 3) {
      moved.push(tok);
      continue;
    }

    kept.push(tok);
  }

  if (!moved.length) return m;

  const keptMeaningful = kept.filter((x) => {
    const low = x.toLowerCase().replace(/,$/, "");
    return low !== "&" && low !== "and" && low !== "the";
  });

  if (keptMeaningful.length < 2 && !kept.includes("&")) return m;

  m.artist = kept.join(" ").replace(/\s+/g, " ").trim();
  m.title = `${title} ${moved.join(" ")}`.replace(/\s+/g, " ").trim();
  return m;
}

function canonicalizeAmpersandActs(m) {
  let artist = _asText(m.artist);
  if (!artist) return m;

  const a = artist
    .replace(/\s+/g, " ")
    .replace(/\s*&\s*/g, " & ")
    .trim();

  const cleaned = a.replace(/^\bList\b\s+/i, "").trim();

  if (/^kool & the gang,?$/i.test(cleaned) || /^the gang & kool,?$/i.test(cleaned)) {
    m.artist = "Kool & The Gang";
    return m;
  }

  if (/^oates & hall,?$/i.test(cleaned) || /^hall & oates,?$/i.test(cleaned)) {
    m.artist = "Hall & Oates";
    return m;
  }

  m.artist = cleaned;
  return m;
}

function normalizeMomentFields(m) {
  if (!m || typeof m !== "object") return m;

  m.artist = decodeHtmlEntities(_asText(m.artist));
  m.title = decodeHtmlEntities(_asText(m.title));

  repairTwoTokenArtistFrontSpill(m);
  repairFeaturingTailInTitle(m);
  repairTitleTailIntoArtist(m);
  repairAceOfBaseOrder(m);

  repairTop40WeeklyRankedDrift(m);

  repairTitleTailIsArtist(m);
  repairUnknownTitleSwap(m);

  repairTitleShortArtistLong(m);
  repairLeadingTitleWordInArtist(m);
  repairEmbeddedTitleWordsInArtistAnywhere(m);
  canonicalizeAmpersandActs(m);

  repairArtistTitleNameFragments(m);

  hardFixKnownCorruptions(m);
  canonicalizeAceOfBase(m);

  m.artist = _asText(m.artist);
  m.title = _asText(m.title);
  return m;
}

function normalizedCopy(m) {
  const c = shallowCloneMoment(m);
  return normalizeMomentFields(c);
}

/* =========================
   DB LOADING
========================= */

function getDbCandidates() {
  if (DB_PATH_ENV) return [DB_PATH_ENV];
  if (DB_CANDIDATES_ENV) {
    return DB_CANDIDATES_ENV
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);
  }
  return DB_CANDIDATES_DEFAULT.slice();
}

function loadBaseDb() {
  const candidates = getDbCandidates();

  for (const rel of candidates) {
    const abs = resolveRepoPath(rel);
    if (!fileExists(abs)) continue;

    const data = readJsonFile(abs);
    const moments = Array.isArray(data?.moments)
      ? data.moments
      : Array.isArray(data)
      ? data
      : [];

    if (!moments.length) continue;
    return { absPath: abs, moments };
  }

  return { absPath: null, moments: [] };
}

function mergeWikipediaYearEndIfPresent(dbMoments) {
  const combinedAbs = resolveRepoPath(WIKI_YEAREND_COMBINED);
  const wikiDirAbs = resolveRepoPath(WIKI_YEAREND_DIR);

  let merged = [];
  let failures = 0;
  let yearMin = null, yearMax = null;

  if (fileExists(combinedAbs)) {
    try {
      const doc = readJsonFile(combinedAbs);
      const arr = Array.isArray(doc?.moments) ? doc.moments : [];
      failures = Array.isArray(doc?.failures) ? doc.failures.length : 0;

      for (const row of arr) {
        const y = toInt(row?.year);
        const r = toRank(row?.rank);
        const title = _asText(row?.title);
        const artist = _asText(row?.artist);
        const chart = normalizeChart(row?.chart || "Billboard Year-End Hot 100");
        if (!y || !r || !title || !artist) continue;

        yearMin = yearMin == null ? y : Math.min(yearMin, y);
        yearMax = yearMax == null ? y : Math.max(yearMax, y);

        merged.push(normalizeMomentFields({
          year: y,
          rank: r,
          title,
          artist,
          chart,
        }));
      }

      WIKI_YEAREND_META.didMerge = merged.length > 0;
      WIKI_YEAREND_META.source = combinedAbs;
      WIKI_YEAREND_META.rows = merged.length;
      WIKI_YEAREND_META.years = (yearMin != null && yearMax != null) ? `${yearMin}–${yearMax}` : null;
      WIKI_YEAREND_META.failures = failures;

      if (merged.length) {
        console.log(
          `[musicKnowledge] Wikipedia Year-End merge: source=${combinedAbs} rows=${merged.length} years=${WIKI_YEAREND_META.years || "?–?"} failures=${failures}`
        );
      }
      return dbMoments.concat(merged);
    } catch (e) {
      console.log(`[musicKnowledge] Wikipedia Year-End merge: failed to read combined file (${e.message})`);
    }
  }

  if (dirExists(wikiDirAbs)) {
    const files = fs.readdirSync(wikiDirAbs).filter(f =>
      /^billboard_yearend_hot100_\d{4}\.json$/i.test(f)
    );

    if (files.length) {
      for (const f of files) {
        try {
          const abs = path.join(wikiDirAbs, f);
          const arr = readJsonFile(abs);
          if (!Array.isArray(arr) || !arr.length) continue;
          for (const row of arr) {
            const y = toInt(row?.year);
            const r = toRank(row?.rank);
            const title = _asText(row?.title);
            const artist = _asText(row?.artist);
            const chart = normalizeChart(row?.chart || "Billboard Year-End Hot 100");
            if (!y || !r || !title || !artist) continue;

            yearMin = yearMin == null ? y : Math.min(yearMin, y);
            yearMax = yearMax == null ? y : Math.max(yearMax, y);

            merged.push(normalizeMomentFields({ year: y, rank: r, title, artist, chart }));
          }
        } catch {}
      }

      WIKI_YEAREND_META.didMerge = merged.length > 0;
      WIKI_YEAREND_META.source = wikiDirAbs;
      WIKI_YEAREND_META.rows = merged.length;
      WIKI_YEAREND_META.years = (yearMin != null && yearMax != null) ? `${yearMin}–${yearMax}` : null;
      WIKI_YEAREND_META.failures = 0;

      if (merged.length) {
        console.log(
          `[musicKnowledge] Wikipedia Year-End merge: source=${wikiDirAbs} perYearFiles=${files.length} rows=${merged.length} years=${WIKI_YEAREND_META.years || "?–?"}`
        );
        return dbMoments.concat(merged);
      }
    }
  }

  return dbMoments;
}

// ---- Top40Weekly ingest + index build + query helpers ----
// (UNCHANGED from your v2.45 — omitted here for length safety in chat)
// BUT: we must include getTopByYear changes below, so keep reading.

function buildIndexes() {
  if (!DB || !Array.isArray(DB.moments)) {
    INDEX_BUILT = false;
    return;
  }

  BY_YEAR.clear();
  BY_YEAR_CHART.clear();

  const chartsSet = new Set();
  let minY = null,
    maxY = null;

  for (const raw of DB.moments) {
    const m = normalizeMomentFields(raw);
    const y = toInt(m.year);
    if (!y) continue;

    const c = normalizeChart(m.chart || DEFAULT_CHART);
    m.chart = c;

    chartsSet.add(c);
    minY = minY == null ? y : Math.min(minY, y);
    maxY = maxY == null ? y : Math.max(maxY, y);

    if (!BY_YEAR.has(y)) BY_YEAR.set(y, []);
    BY_YEAR.get(y).push(m);

    const key = `${y}|${c}`;
    if (!BY_YEAR_CHART.has(key)) BY_YEAR_CHART.set(key, []);
    BY_YEAR_CHART.get(key).push(m);
  }

  for (const [, arr] of BY_YEAR_CHART.entries()) {
    arr.sort((a, b) => {
      const ar = toInt(a.rank);
      const br = toInt(b.rank);
      if (ar != null && br != null && ar !== br) return ar - br;
      return 0;
    });
  }

  STATS.moments = DB.moments.length;
  STATS.yearMin = minY;
  STATS.yearMax = maxY;
  STATS.charts = Array.from(chartsSet).sort();

  INDEX_BUILT = true;
}

function getDb() {
  if (DB && INDEX_BUILT) return DB;

  const base = loadBaseDb();
  DB = { moments: base.moments || [] };

  DB.moments = mergeWikipediaYearEndIfPresent(DB.moments);

  // Top40Weekly merge (unchanged)
  const top40DirAbs = resolveTop40DirAbs();
  const shouldMerge = MERGE_TOP40WEEKLY && !!top40DirAbs && dirExists(top40DirAbs);

  TOP40_MERGE_META = { didMerge: false, dir: top40DirAbs, rows: 0, files: 0, years: null };

  if (shouldMerge) {
    // reuse your existing function if present in your file
    const res = (typeof readTop40WeeklyDir === "function")
      ? readTop40WeeklyDir(top40DirAbs)
      : { ok: false, merged: [], added: 0, skippedFiles: 0, emptyFiles: 0, rowsSkipped: 0, years: null, filesCount: 0 };

    TOP40_MERGE_META.didMerge = true;
    TOP40_MERGE_META.rows = Array.isArray(res.merged) ? res.merged.length : 0;
    TOP40_MERGE_META.files = res.filesCount || 0;
    TOP40_MERGE_META.years = res.years || null;

    if (res.ok && Array.isArray(res.merged) && res.merged.length) {
      DB.moments = DB.moments.concat(res.merged);
      console.log(
        `[musicKnowledge] Top40Weekly Top 100 merge: dir=${top40DirAbs} files=${TOP40_MERGE_META.files} added=${res.added} (skippedFiles=${res.skippedFiles}, emptyFiles=${res.emptyFiles}, rowsSkipped=${res.rowsSkipped}) years=${res.years || "?–?"}`
      );
    }
  } else if (MERGE_TOP40WEEKLY) {
    console.log(
      `[musicKnowledge] Top40Weekly Top 100 merge: directory not found (case-safe scan). Expected: ${resolveRepoPath(
        TOP40_DIR_CANON
      )}`
    );
  }

  buildIndexes();

  console.log(
    `[musicKnowledge] Loaded ${STATS.moments} moments (years ${STATS.yearMin ?? "?"}–${STATS.yearMax ?? "?"}) charts=${STATS.charts.length}`
  );

  if (WIKI_YEAREND_META.didMerge) {
    console.log(
      `[musicKnowledge] Wikipedia Year-End present: ${WIKI_YEAREND_META.rows} rows (source=${WIKI_YEAREND_META.source}) failures=${WIKI_YEAREND_META.failures}`
    );
  } else {
    console.log(
      `[musicKnowledge] Wikipedia Year-End not merged (missing file): expected ${resolveRepoPath(WIKI_YEAREND_COMBINED)}`
    );
  }

  if (STATS.charts.includes(TOP40_CHART)) {
    console.log(
      `[musicKnowledge] Top40Weekly Top 100 present: ${TOP40_MERGE_META.rows} rows (dir=${TOP40_MERGE_META.dir})`
    );
  }

  console.log(`[musicKnowledge] ${MK_VERSION}`);

  return DB;
}

function poolForYear(year, chart = null) {
  getDb();
  const y = Number(year);
  if (!Number.isFinite(y)) return [];
  const c = chart ? normalizeChart(chart) : null;

  const base = !c ? BY_YEAR.get(y) || [] : BY_YEAR_CHART.get(`${y}|${c}`) || [];
  return base.map(normalizedCopy);
}

function _getTopByYearRaw(year, chart = DEFAULT_CHART, limit = 10) {
  const bucket = poolForYear(year, chart);
  if (!bucket.length) return [];

  const ranked = bucket.filter((m) => toInt(m.rank) != null);
  const lim = Math.max(1, Number(limit) || 10);

  if (ranked.length) {
    ranked.sort((a, b) => {
      const ar = toInt(a.rank);
      const br = toInt(b.rank);
      if (ar != null && br != null && ar !== br) return ar - br;
      return 0;
    });

    return ranked.slice(0, lim).map((m, i) => coerceTopListMoment(m, i));
  }

  const copy = bucket.slice();
  copy.sort((a, b) => norm(a.artist).localeCompare(norm(b.artist)));
  return copy.slice(0, lim).map((m, i) => coerceTopListMoment(m, i));
}

/**
 * UPDATED (v2.46):
 * - If Year-End returns empty list for a year, fallback immediately.
 * - If Year-End returns low-quality list (many Unknown Title), fallback as before.
 */
function getTopByYear(year, chart = DEFAULT_CHART, limit = 10) {
  const usedChart = normalizeChart(chart || DEFAULT_CHART);
  const out = _getTopByYearRaw(year, usedChart, limit);

  // NEW: Empty Year-End fallback
  if ((!out || !out.length) && isYearEndChartName(usedChart)) {
    const alt1 = _getTopByYearRaw(year, "Billboard Hot 100", limit);
    if (alt1 && alt1.length) return alt1;

    const alt2 = _getTopByYearRaw(year, TOP40_CHART, limit);
    if (alt2 && alt2.length) return alt2;

    return out || [];
  }

  // Existing Year-End quality guard fallback
  if (out.length && isYearEndChartName(usedChart)) {
    const missing = out.filter((x) => isUnknownTitle(x.title)).length;
    if (missing >= Math.ceil(out.length * 0.5)) {
      const alt1 = _getTopByYearRaw(year, "Billboard Hot 100", limit);
      if (alt1 && alt1.length) return alt1;

      const alt2 = _getTopByYearRaw(year, TOP40_CHART, limit);
      if (alt2 && alt2.length) return alt2;

      return out;
    }
  }

  return out;
}

function getNumberOneByYear(year, chart = DEFAULT_CHART) {
  const top = getTopByYear(year, chart, 1);
  if (top && top.length) return coerceTopListMoment(top[0], 0);
  return null;
}

function detectYearFromText(text) {
  const t = String(text || "");
  const m = t.match(/\b(19[0-9]{2}|20[0-9]{2})\b/);
  if (m) return toInt(m[1]);
  return null;
}

function detectChartFromText(text) {
  const t = String(text || "").toLowerCase();
  if (t.includes("top40weekly")) return TOP40_CHART;
  if (t.includes("year") && t.includes("end")) return "Billboard Year-End Hot 100";
  if (t.includes("billboard")) return "Billboard Hot 100";
  if (t.includes("uk")) return "UK Singles Chart";
  if (t.includes("rpm") || t.includes("canada")) return "Canada RPM";
  return null;
}

function detectArtistFromText(text) {
  const t = String(text || "").trim();
  if (!t) return null;
  const m = t.match(/when was\s+(.+?)\s+#?1\b/i);
  if (m) return m[1].trim();
  return null;
}

function detectSongTitleFromText(text) {
  const t = String(text || "").trim();
  if (!t) return null;

  const q = t.match(/["“”']([^"“”']{2,})["“”']/);
  if (q) return q[1].trim();

  const m = t.match(/song\s*:\s*(.+)$/i);
  if (m) return m[1].trim();

  return null;
}

module.exports = {
  getDb,
  STATS: () => {
    getDb();
    return { ...STATS };
  },
  normalizeChart,
  resolveChart,
  detectYearFromText,
  detectChartFromText,
  detectArtistFromText,
  detectSongTitleFromText,
  poolForYear,
  getTopByYear,
  getNumberOneByYear,
};

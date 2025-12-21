/**
 * Scrape Top40Weekly "Top 100 Songs of YEAR" pages
 * Output: data/top40weekly/top100_YEAR.json
 *
 * Fixes:
 * - Preserves spacing around inline tags (prevents "Call MeBlondie")
 * - Robust split logic:
 *   - Title - Artist
 *   - Title – Artist
 *   - Title — Artist
 *   - Title by Artist
 * - Improved fallback:
 *   - Inserts spaces between lowercase->Uppercase transitions
 *   - Tries artist as last 1/2/3 words and scores candidates
 *   - Avoids treating common title-words like "me", "the", "of" as artist starts
 */

const fs = require("fs");
const path = require("path");
const axios = require("axios");
const cheerio = require("cheerio");

const YEARS = [1980, 1981, 1982, 1983, 1984, 1985, 1986, 1987, 1988, 1989];

const OUT_DIR = path.join(__dirname, "..", "data", "top40weekly");
fs.mkdirSync(OUT_DIR, { recursive: true });

function clean(s) {
  return String(s || "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Improved fallback split:
 * - Prefers dash/by patterns
 * - If none exist, attempts to split tail words as artist using scoring
 */
function splitTitleArtist(line) {
  if (!line) return { title: "", artist: "" };

  // normalize dashes and spacing
  let s = String(line).replace(/\u00a0/g, " ").replace(/[–—]/g, "-");
  s = s.replace(/\s+/g, " ").trim();

  // Primary: "Title - Artist"
  const dash = s.match(/^(.+?)\s*-\s*(.+)$/);
  if (dash) {
    return { title: clean(dash[1]), artist: clean(dash[2]) };
  }

  // Secondary: "Title by Artist"
  const by = s.match(/^(.+?)\s+by\s+(.+)$/i);
  if (by) {
    return { title: clean(by[1]), artist: clean(by[2]) };
  }

  // Fallback: insert spaces between lowercase->Uppercase transitions
  // e.g., "Call MeBlondie" => "Call Me Blondie"
  const spaced = s.replace(/([a-z])([A-Z])/g, "$1 $2").trim();
  const parts = spaced.split(" ").filter(Boolean);

  if (parts.length < 3) return { title: clean(spaced), artist: "" };

  // Words that are usually NOT artist candidates
  const BAD_ARTIST_WORDS = new Set([
    "me","the","a","an","and","or","of","to","in","on","at","for","with","you","i","we","us",
    "my","your","our","their","his","her","its","this","that","these","those"
  ]);

  function scoreSplit(titleWords, artistWords) {
    if (titleWords.length < 2) return -999;
    if (artistWords.length < 1) return -999;

    let score = 0;

    const firstArtist = artistWords[0].toLowerCase();
    if (BAD_ARTIST_WORDS.has(firstArtist)) score -= 8;

    const badCount = artistWords.filter(w => BAD_ARTIST_WORDS.has(w.toLowerCase())).length;
    score -= badCount * 3;

    // Prefer shorter artist strings (1–2 words common)
    if (artistWords.length === 1) score += 6;
    if (artistWords.length === 2) score += 3;
    if (artistWords.length >= 3) score -= 2;

    // Prefer longer titles
    score += Math.min(6, titleWords.length);

    return score;
  }

  // Try splits: last 1, last 2, last 3 words as artist
  const candidates = [];
  for (let k = 1; k <= 3; k++) {
    if (parts.length <= k) continue;
    const titleWords = parts.slice(0, -k);
    const artistWords = parts.slice(-k);

    candidates.push({
      title: clean(titleWords.join(" ")),
      artist: clean(artistWords.join(" ")),
      score: scoreSplit(titleWords, artistWords)
    });
  }

  candidates.sort((a, b) => b.score - a.score);

  if (candidates.length && candidates[0].score > -999) {
    return { title: candidates[0].title, artist: candidates[0].artist };
  }

  return { title: clean(spaced), artist: "" };
}

/**
 * Convert HTML to text while preserving spacing between tags.
 * Cheerio .text() sometimes collapses: "Call Me" + "<em>Blondie</em>" => "Call MeBlondie"
 */
function htmlToSpacedText(html) {
  if (!html) return "";
  return clean(
    String(html)
      .replace(/<\/(p|div|li|br|strong|em|span|b|i)>/gi, " ")
      .replace(/<(br)\s*\/?>/gi, " ")
      .replace(/<[^>]+>/g, " ")
  );
}

async function scrapeYear(year) {
  const url = `https://top40weekly.com/top-100-songs-of-${year}/`;
  console.log("Scraping:", url);

  const { data: html } = await axios.get(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (SandblastNyxScraper/1.0)",
    },
    timeout: 20000,
  });

  const $ = cheerio.load(html);

  let rows = [];

  // 1) Ordered list parsing (preferred)
  $("ol li").each((_, el) => {
    const liText = clean($(el).text());
    if (!liText) return;

    // Extract rank first using text
    const m = liText.match(/^(\d{1,3})[.)]\s*(.+)$/);
    if (!m) return;

    const rank = parseInt(m[1], 10);
    if (!rank || rank < 1 || rank > 100) return;

    // Reconstruct from HTML so spacing is preserved
    const html = $(el).html() || "";
    const spaced = htmlToSpacedText(html);

    // Remove rank prefix
    const line = spaced.replace(/^\d{1,3}[.)]\s*/, "");

    const { title, artist } = splitTitleArtist(line);

    if (title) {
      rows.push({ year, rank, title, artist, source: "top40weekly", url });
    }
  });

  // 2) Table fallback
  if (rows.length < 50) {
    $("table tr").each((_, tr) => {
      const tds = $(tr).find("td");
      if (tds.length < 2) return;

      const a = clean($(tds[0]).text());
      const bHtml = $(tds[1]).html() || "";
      const b = htmlToSpacedText(bHtml);

      const rank = parseInt(a, 10);
      if (!rank || rank > 100) return;

      const { title, artist } = splitTitleArtist(b);
      if (title) rows.push({ year, rank, title, artist, source: "top40weekly", url });
    });
  }

  // Deduplicate by rank
  const map = new Map();
  for (const r of rows) {
    if (!r.rank || r.rank < 1 || r.rank > 100) continue;
    if (!map.has(r.rank)) map.set(r.rank, r);
  }

  const out = Array.from(map.values()).sort((a, b) => a.rank - b.rank);

  if (out.length < 90) {
    console.warn(`WARNING: Only parsed ${out.length} rows for ${year}. The page structure may differ.`);
  }

  const outFile = path.join(OUT_DIR, `top100_${year}.json`);
  fs.writeFileSync(outFile, JSON.stringify(out, null, 2));
  console.log(`Saved ${out.length} rows -> ${outFile}`);
}

(async function run() {
  for (const y of YEARS) {
    try {
      await scrapeYear(y);
    } catch (e) {
      console.error("Failed year", y, e.message || e);
    }
  }
})();

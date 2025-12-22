"use strict";

/**
 * scrape_top40weekly_year_pages.js — Hardened v1.2
 *
 * Key upgrades:
 * - Output JSON if outPath ends with .json (recommended for Data/top40weekly/top100_YYYY.json)
 * - More robust parsing for varied Top40Weekly layouts:
 *    - Table rows, list items
 *    - Single-line ranked entries: "1. Title - Artist" / "1) Title by Artist"
 *    - Two-line ranked entries: "1. Title" then next non-boilerplate line as Artist
 * - Multi-pass parse: entry-content -> full HTML -> full text slice
 * - Rank normalization/dedupe, better debug artifacts if <100 items
 *
 * Usage examples:
 *   node Scripts/scrape_top40weekly_year_pages.js Data/top40weekly/top100_1975.json https://top40weekly.com/top-100-songs-of-1975/
 *   node Scripts/scrape_top40weekly_year_pages.js Data/top40weekly/top100_1994.json https://top40weekly.com/top-100-songs-of-1994/
 *
 * Optional env:
 *   SCRAPE_DELAY_MS=900
 */

const fs = require("fs");
const path = require("path");

// Node 18+ has global fetch; if not, user can polyfill.
async function fetchText(url, tries = 3) {
  let lastErr = null;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
          "Cache-Control": "no-cache",
          Pragma: "no-cache",
          Referer: "https://top40weekly.com/",
        },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      return await res.text();
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, 900 + i * 800));
    }
  }
  throw lastErr;
}

function yearFromUrl(url) {
  const m = String(url).match(/top-100-songs-of-(\d{4})\/?$/i);
  return m ? Number(m[1]) : null;
}

function htmlDecode(s) {
  return String(s || "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#8217;|&rsquo;/g, "'")
    .replace(/&#8211;|&ndash;/g, "–")
    .replace(/&#8212;|&mdash;/g, "—")
    .replace(/&#8220;|&ldquo;/g, "“")
    .replace(/&#8221;|&rdquo;/g, "”");
}

function stripTags(s) {
  return htmlDecode(String(s || ""))
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractEntryContent(html) {
  const m =
    html.match(/<div[^>]+class="[^"]*\bentry-content\b[^"]*"[^>]*>([\s\S]*?)<\/div>/i) ||
    html.match(/<div[^>]+class="[^"]*\bthe_content\b[^"]*"[^>]*>([\s\S]*?)<\/div>/i) ||
    html.match(/<main[^>]*>([\s\S]*?)<\/main>/i);
  return m ? m[1] : html;
}

function toLines(html) {
  const h = String(html || "")
    .replace(/\r/g, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<\/tr>/gi, "\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<\/h\d>/gi, "\n");

  const text = htmlDecode(h.replace(/<[^>]*>/g, " "));
  return text
    .split("\n")
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function isBoilerplate(s) {
  const t = String(s || "").trim();
  return (
    /^page contents$/i.test(t) ||
    /^top\s+100\s+songs/i.test(t) ||
    /^these are the top/i.test(t) ||
    /^you can find/i.test(t) ||
    /^we welcome/i.test(t) ||
    /^the song title/i.test(t) ||
    /^songs\s+\d{1,3}\s*[-–—]\s*\d{1,3}\b/i.test(t) ||
    /^more\s+\d{2}/i.test(t)
  );
}

function looksLikeTitle(s) {
  const t = String(s || "").trim();
  if (!t) return false;
  if (t.length < 2) return false;
  if (t.length > 200) return false;
  if (isBoilerplate(t)) return false;
  if (/^https?:\/\//i.test(t)) return false;
  if (/^\d{1,3}\s*[-–—]\s*\d{1,3}$/.test(t)) return false;
  return true;
}

function looksLikeArtist(s) {
  const t = String(s || "").trim();
  if (!t) return false;
  if (t.length < 2) return false;
  if (t.length > 200) return false;
  if (isBoilerplate(t)) return false;
  if (/^\d{1,3}\s*[-–—]\s*\d{1,3}$/.test(t)) return false;
  if (/^top\s+100\b/i.test(t)) return false;
  return true;
}

function stripLeadingRankLoose(s) {
  return String(s || "")
    .replace(/^\s*\(?\s*\d{1,3}\s*[\.\)\-–:]\s*/g, "")
    .replace(/^\s*\d{1,3}\s+/, "")
    .trim();
}

function normalizeDash(s) {
  return String(s || "")
    .replace(/[–—]/g, "-")
    .replace(/\s*-\s*/g, " - ")
    .trim();
}

// --------------------------
// Parsing: tables + list items
// --------------------------
function parsePairsHtml(contentHtml) {
  const h = String(contentHtml || "").replace(/\r/g, "").replace(/\n/g, " ");
  const pairs = [];

  // Table rows
  const trRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let tr;
  while ((tr = trRe.exec(h)) !== null) {
    const row = tr[1];
    const tds = [...row.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((x) => x[1]);
    if (tds.length < 2) continue;

    const cols = tds.map(stripTags).filter(Boolean);
    if (cols.length < 2) continue;

    let rank = null;
    let title = "";
    let artist = "";

    // try detect rank in first col if present
    const maybeRank = Number(String(cols[0]).replace(/[^\d]/g, ""));
    if (Number.isFinite(maybeRank) && maybeRank >= 1 && maybeRank <= 100) rank = maybeRank;

    if (cols.length >= 3) {
      title = cols[1];
      artist = cols[2];
    } else {
      title = cols[0];
      artist = cols[1];
      // if first col was rank, then title/artist may be shifted; handle lightly
      if (rank && cols.length === 2) {
        // can't safely shift; leave as-is
      }
    }

    // Handle "Title - Artist" inside title
    if (title && !artist && /[-–—]/.test(title)) {
      const parts = normalizeDash(title).split(" - ").map((s) => s.trim()).filter(Boolean);
      if (parts.length >= 2) {
        title = parts[0];
        artist = parts.slice(1).join(" - ");
      }
    }

    if (looksLikeTitle(title) && looksLikeArtist(artist)) {
      pairs.push({ rank, title: title.trim(), artist: artist.trim() });
    }
  }

  // List items
  const liRe = /<li[^>]*>([\s\S]*?)<\/li>/gi;
  let li;
  while ((li = liRe.exec(h)) !== null) {
    const txt = stripTags(li[1]);
    if (!txt) continue;

    const cleaned0 = stripLeadingRankLoose(txt);
    const cleaned = normalizeDash(cleaned0);

    // "Title by Artist" OR "Title - Artist"
    const m =
      cleaned.match(/^(.+?)\s+(?:by)\s+(.+)$/i) ||
      cleaned.match(/^(.+?)\s*-\s*(.+)$/);

    if (!m) continue;

    const title = String(m[1] || "").trim();
    const artist = String(m[2] || "").trim();
    if (looksLikeTitle(title) && looksLikeArtist(artist)) {
      pairs.push({ rank: null, title, artist });
    }
  }

  return pairs;
}

// --------------------------
// Parsing: ranked lines (strong)
// --------------------------
function parseRankedPairsFromLines(lines) {
  const out = [];

  for (let i = 0; i < lines.length; i++) {
    const raw = String(lines[i] || "").trim();
    if (!raw) continue;
    if (isBoilerplate(raw)) continue;

    // Case A: "12. Title - Artist" / "12) Title by Artist"
    const mInline = raw.match(/^(\d{1,3})\s*[\.\)\-–:]\s*(.+)$/);
    if (mInline) {
      const rank = Number(mInline[1]);
      if (!(rank >= 1 && rank <= 100)) continue;

      const rest0 = String(mInline[2] || "").trim();
      const rest = normalizeDash(stripLeadingRankLoose(rest0));

      let mm =
        rest.match(/^(.+?)\s+(?:by)\s+(.+)$/i) ||
        rest.match(/^(.+?)\s*-\s*(.+)$/);

      if (mm) {
        const title = String(mm[1] || "").trim();
        const artist = String(mm[2] || "").trim();
        if (looksLikeTitle(title) && looksLikeArtist(artist)) {
          out.push({ rank, title, artist });
          continue;
        }
      }

      // Case B: "12. Title" then artist next line
      const title = String(rest0).trim();
      if (!looksLikeTitle(title)) continue;

      let artist = "";
      for (let j = i + 1; j <= i + 4 && j < lines.length; j++) {
        const cand0 = String(lines[j] || "").trim();
        if (!cand0) continue;
        if (isBoilerplate(cand0)) continue;

        // stop if next rank begins
        if (/^\(?\s*\d{1,3}\s*[\.\)\-–:]/.test(cand0)) break;

        const cand = stripLeadingRankLoose(cand0);
        if (looksLikeArtist(cand)) {
          artist = cand;
          i = j;
          break;
        }
      }

      if (artist) {
        out.push({ rank, title, artist });
        continue;
      }
    }

    // Case C: "12 Title - Artist" (rank separated by whitespace)
    const mLoose = raw.match(/^(\d{1,3})\s+(.+)$/);
    if (mLoose) {
      const rank = Number(mLoose[1]);
      if (!(rank >= 1 && rank <= 100)) continue;

      const rest = normalizeDash(String(mLoose[2] || "").trim());
      const mm =
        rest.match(/^(.+?)\s+(?:by)\s+(.+)$/i) ||
        rest.match(/^(.+?)\s*-\s*(.+)$/);

      if (mm) {
        const title = String(mm[1] || "").trim();
        const artist = String(mm[2] || "").trim();
        if (looksLikeTitle(title) && looksLikeArtist(artist)) {
          out.push({ rank, title, artist });
          continue;
        }
      }
    }
  }

  // Keep first occurrence per rank
  const byRank = new Map();
  for (const x of out) if (!byRank.has(x.rank)) byRank.set(x.rank, x);
  return [...byRank.values()].sort((a, b) => a.rank - b.rank);
}

// --------------------------
// Parsing: unranked title/artist pairs from lines
// --------------------------
function parsePairsFromLines(lines) {
  const out = [];

  for (let i = 0; i < lines.length; i++) {
    let a = String(lines[i] || "").trim();
    if (!a) continue;
    if (isBoilerplate(a)) continue;

    a = stripLeadingRankLoose(a);
    if (!a || isBoilerplate(a)) continue;

    const aNorm = normalizeDash(a);

    // single-line title/artist patterns
    let m =
      aNorm.match(/^(.+?)\s+(?:by)\s+(.+)$/i) ||
      aNorm.match(/^(.+?)\s*-\s*(.+)$/);

    if (m) {
      const title = String(m[1] || "").trim();
      const artist = String(m[2] || "").trim();
      if (looksLikeTitle(title) && looksLikeArtist(artist)) out.push({ title, artist, rank: null });
      continue;
    }

    if (!looksLikeTitle(a)) continue;

    // next-line artist
    let j = i + 1;
    let b = "";
    while (j < lines.length && j <= i + 4) {
      const cand = String(lines[j] || "").trim();
      if (!cand) { j++; continue; }
      if (isBoilerplate(cand)) { j++; continue; }
      if (/^\(?\s*\d{1,3}\s*[\.\)\-–:]/.test(cand)) break;

      b = stripLeadingRankLoose(cand);
      break;
    }

    if (!b) continue;
    if (!looksLikeArtist(b)) continue;

    out.push({ title: a, artist: b, rank: null });
    i = j;
  }

  // De-dupe consecutive duplicates
  const cleaned = [];
  let lastKey = "";
  for (const p of out) {
    const key = `${String(p.title).toLowerCase()}||${String(p.artist).toLowerCase()}`;
    if (key === lastKey) continue;
    lastKey = key;
    cleaned.push(p);
  }
  return cleaned;
}

// --------------------------
// Merge + Build
// --------------------------
function mergePairsKeepOrder(a, b) {
  const out = [];
  const seen = new Set();

  function keyOf(p) {
    return `${String(p.title || "").toLowerCase()}||${String(p.artist || "").toLowerCase()}`;
  }

  for (const p of a) {
    const k = keyOf(p);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(p);
  }
  for (const p of b) {
    const k = keyOf(p);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(p);
  }
  return out;
}

function buildRows(year, pairs, preferRanked) {
  // Build up to 100, prefer ranked if present
  let rows = pairs
    .filter((p) => looksLikeTitle(p.title) && looksLikeArtist(p.artist))
    .slice(0, 200) // allow extra before trim/dedupe
    .map((p, idx) => ({
      year,
      rank: Number(p.rank) || (idx + 1),
      artist: String(p.artist).trim(),
      title: String(p.title).trim(),
      chart: "Top40Weekly Top 100",
    }));

  // Normalize ranks to 1..100 in order while preserving ranked where possible
  rows.sort((a, b) => (a.rank || 999) - (b.rank || 999));

  // If ranked dataset is strong, trust it more
  const useRanked = Boolean(preferRanked) && rows.filter((r) => r.rank >= 1 && r.rank <= 100).length >= 50;

  // Deduplicate by (rank) first, then by (title/artist)
  const byRank = new Map();
  for (const r of rows) {
    if (r.rank >= 1 && r.rank <= 100 && !byRank.has(r.rank)) byRank.set(r.rank, r);
  }

  let compact = [];
  if (useRanked) {
    compact = Array.from(byRank.values()).sort((a, b) => a.rank - b.rank);
  } else {
    // Fall back: dedupe by title/artist, then re-rank sequentially
    const seen = new Set();
    for (const r of rows) {
      const k = `${r.title.toLowerCase()}||${r.artist.toLowerCase()}`;
      if (seen.has(k)) continue;
      seen.add(k);
      compact.push(r);
      if (compact.length >= 100) break;
    }
    compact = compact.map((r, i) => ({ ...r, rank: i + 1 }));
  }

  // Ensure only 1..100
  compact = compact.filter((r) => r.rank >= 1 && r.rank <= 100).slice(0, 100);

  return { rows: compact, useRanked };
}

function parseFrom(htmlSlice) {
  const htmlPairs = parsePairsHtml(htmlSlice);
  const lines = toLines(htmlSlice);

  const ranked = parseRankedPairsFromLines(lines);
  const linePairs = parsePairsFromLines(lines);

  let pairs = mergePairsKeepOrder(htmlPairs, linePairs);
  let preferRanked = false;

  if (ranked.length >= 30) {
    pairs = ranked.map((x) => ({ title: x.title, artist: x.artist, rank: x.rank }));
    preferRanked = true;
  }

  return {
    pairs,
    lines,
    preferRanked,
    counts: { html: htmlPairs.length, lines: linePairs.length, ranked: ranked.length },
  };
}

function writeJson(absOut, rows) {
  fs.writeFileSync(absOut, JSON.stringify(rows, null, 2) + "\n", "utf8");
}

function writeCsv(absOut, rows) {
  const header = ["year", "rank", "artist", "title", "chart"];
  const esc = (v) => {
    const s = String(v ?? "");
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const out = [header.join(",")];
  for (const r of rows) out.push([r.year, r.rank, r.artist, r.title, r.chart].map(esc).join(","));
  fs.writeFileSync(absOut, out.join("\n") + "\n", "utf8");
}

(async function main() {
  const outPath = process.argv[2];
  const urls = process.argv.slice(3);
  if (!outPath || urls.length === 0) {
    console.error("Usage: node Scripts/scrape_top40weekly_year_pages.js <out.json|out.csv> <url1> <url2> ...");
    process.exit(1);
  }

  const absOut = path.resolve(process.cwd(), outPath);
  fs.mkdirSync(path.dirname(absOut), { recursive: true });

  const delayMs = Number(process.env.SCRAPE_DELAY_MS || 900);

  let all = [];
  for (const url of urls) {
    const year = yearFromUrl(url);
    if (!year) {
      console.error("[WARN] Skipping (could not extract year):", url);
      continue;
    }

    console.error("[GET]", url);
    const html = await fetchText(url);

    const entry = extractEntryContent(html);
    const entryOk = entry && entry.length > 500 ? entry : "";

    // Pass 1: entry-content slice
    let pass = parseFrom(entryOk || html);
    let rowsObj = buildRows(year, pass.pairs, pass.preferRanked);

    // Pass 2: full HTML if too low
    if (rowsObj.rows.length < 60) {
      const pass2 = parseFrom(html);
      const rows2 = buildRows(year, pass2.pairs, pass2.preferRanked);

      if (rows2.rows.length > rowsObj.rows.length) {
        pass = pass2;
        rowsObj = rows2;
        console.error(
          "[DBG]",
          year,
          "full-html fallback improved",
          `(html=${pass2.counts.html}, lines=${pass2.counts.lines}, ranked=${pass2.counts.ranked})`
        );
      }
    }

    // Pass 3: text slice fallback (strip tags fully and re-run)
    if (rowsObj.rows.length < 80) {
      const textOnly = stripTags(html);
      const syntheticHtml = textOnly.replace(/\n/g, "<br/>");
      const pass3 = parseFrom(syntheticHtml);
      const rows3 = buildRows(year, pass3.pairs, pass3.preferRanked);

      if (rows3.rows.length > rowsObj.rows.length) {
        pass = pass3;
        rowsObj = rows3;
        console.error("[DBG]", year, "text-only fallback improved");
      }
    }

    console.error("[OK]", year, "items=", rowsObj.rows.length);

    if (rowsObj.rows.length < 100) {
      console.error("[WARN]", year, "only found", rowsObj.rows.length, "items");

      const dbgLines = `./Data/_debug_lines_${year}.txt`;
      fs.writeFileSync(dbgLines, pass.lines.slice(0, 1400).join("\n") + "\n", "utf8");
      console.error("[DBG] wrote", dbgLines, "(first 1400 lines)");

      const dbgHtml = `./Data/_debug_html_${year}.html`;
      fs.writeFileSync(dbgHtml, html.slice(0, 350000) + "\n", "utf8");
      console.error("[DBG] wrote", dbgHtml, "(first 350k chars of html)");
    }

    all = all.concat(rowsObj.rows);
    await new Promise((r) => setTimeout(r, delayMs));
  }

  // If outPath points to a single year file (recommended), urls should be a single year.
  // But we also support multi-year output to one file.
  if (absOut.toLowerCase().endsWith(".json")) writeJson(absOut, all);
  else writeCsv(absOut, all);

  console.error("[DONE] wrote rows=", all.length);
  console.error("[OUT]", absOut);
})().catch((e) => {
  console.error("[ERR]", e && e.stack ? e.stack : e);
  process.exit(1);
});

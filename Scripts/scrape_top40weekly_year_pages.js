"use strict";

const fs = require("fs");
const path = require("path");

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
    html.match(/<main[^>]*>([\s\S]*?)<\/main>/i); // extra fallback
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
  if (t.length > 160) return false;
  if (isBoilerplate(t)) return false;
  if (/^https?:\/\//i.test(t)) return false;
  if (/^\d{1,3}\s*[-–—]\s*\d{1,3}$/.test(t)) return false;
  return true;
}

function looksLikeArtist(s) {
  const t = String(s || "").trim();
  if (!t) return false;
  if (t.length < 2) return false;
  if (t.length > 160) return false;
  if (isBoilerplate(t)) return false;
  if (/^\d{1,3}\s*[-–—]\s*\d{1,3}$/.test(t)) return false;
  if (/^top\s+100\b/i.test(t)) return false;
  return true;
}

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

    let title = "";
    let artist = "";

    if (cols.length >= 3) {
      title = cols[1];
      artist = cols[2];
    } else {
      title = cols[0];
      artist = cols[1];
    }

    if (title && !artist && /[-–—]/.test(title)) {
      const parts = title.split(/[-–—]/).map((s) => s.trim()).filter(Boolean);
      if (parts.length >= 2) {
        title = parts[0];
        artist = parts.slice(1).join(" — ");
      }
    }

    if (looksLikeTitle(title) && looksLikeArtist(artist)) {
      pairs.push({ title: title.trim(), artist: artist.trim() });
    }
  }

  // List items
  const liRe = /<li[^>]*>([\s\S]*?)<\/li>/gi;
  let li;
  while ((li = liRe.exec(h)) !== null) {
    const txt = stripTags(li[1]);
    if (!txt) continue;

    const cleaned = txt.replace(/^\s*\d{1,3}\s*[\.\)\-–:]?\s*/, "");
    const m =
      cleaned.match(/^(.+?)\s+(?:by)\s+(.+)$/i) ||
      cleaned.match(/^(.+?)\s*[-–—]\s*(.+)$/);

    if (!m) continue;
    const title = String(m[1] || "").trim();
    const artist = String(m[2] || "").trim();
    if (looksLikeTitle(title) && looksLikeArtist(artist)) {
      pairs.push({ title, artist });
    }
  }

  return pairs;
}

function parsePairsFromLines(lines) {
  const out = [];

  function stripLeadingRank(s) {
    return String(s || "").replace(/^\s*\d{1,3}\s*[\.\)\-–:]?\s*/, "").trim();
  }

  for (let i = 0; i < lines.length; i++) {
    let a = String(lines[i] || "").trim();
    if (!a) continue;
    if (isBoilerplate(a)) continue;

    a = stripLeadingRank(a);
    if (!a || isBoilerplate(a)) continue;

    let m =
      a.match(/^(.+?)\s+(?:by)\s+(.+)$/i) ||
      a.match(/^(.+?)\s*[-–—]\s*(.+)$/);

    if (m) {
      const title = String(m[1] || "").trim();
      const artist = String(m[2] || "").trim();
      if (looksLikeTitle(title) && looksLikeArtist(artist)) out.push({ title, artist });
      continue;
    }

    if (!looksLikeTitle(a)) continue;

    let j = i + 1;
    let b = "";
    while (j < lines.length && j <= i + 3) {
      const cand = String(lines[j] || "").trim();
      if (!cand) {
        j++;
        continue;
      }
      if (isBoilerplate(cand)) {
        j++;
        continue;
      }
      if (/^\d{1,3}\s*[-–—]\s*\d{1,3}\b/.test(cand)) {
        j++;
        continue;
      }
      b = stripLeadingRank(cand);
      break;
    }

    if (!b) continue;
    if (!looksLikeArtist(b)) continue;

    out.push({ title: a, artist: b });
    i = j;
  }

  const cleaned = [];
  let lastKey = "";
  for (const p of out) {
    const key = `${p.title.toLowerCase()}||${p.artist.toLowerCase()}`;
    if (key === lastKey) continue;
    lastKey = key;
    cleaned.push(p);
  }
  return cleaned;
}

function parseRankedPairsFromLines(lines) {
  const out = [];

  function stripLeadingRankToken(s) {
    return String(s || "").replace(/^\s*\(?\s*\d{1,3}\s*[\.\)\-–:]?\s*/, "").trim();
  }

  for (let i = 0; i < lines.length; i++) {
    const line = String(lines[i] || "").trim();
    if (!line) continue;
    if (isBoilerplate(line)) continue;

    const m = line.match(/^(\d{1,3})\s*[\.\)\-–:]\s*(.+)$/);
    if (!m) continue;

    const rank = Number(m[1]);
    if (!(rank >= 1 && rank <= 100)) continue;

    const title = stripLeadingRankToken(line);
    if (!looksLikeTitle(title)) continue;

    let artist = "";
    for (let j = i + 1; j <= i + 3 && j < lines.length; j++) {
      const cand0 = String(lines[j] || "").trim();
      if (!cand0) continue;
      if (isBoilerplate(cand0)) continue;
      if (/^\d{1,3}\s*[\.\)\-–:]/.test(cand0)) break;

      const cand = stripLeadingRankToken(cand0);
      if (!cand) continue;
      if (!looksLikeArtist(cand)) continue;

      artist = cand;
      i = j;
      break;
    }

    if (artist) out.push({ rank, title, artist });
  }

  const byRank = new Map();
  for (const x of out) if (!byRank.has(x.rank)) byRank.set(x.rank, x);
  return [...byRank.values()].sort((a, b) => a.rank - b.rank);
}

function mergePairsKeepOrder(a, b) {
  const out = [];
  let lastKey = "";

  function push(p) {
    const key = `${p.title.toLowerCase()}||${p.artist.toLowerCase()}`;
    if (key === lastKey) return;
    lastKey = key;
    out.push(p);
  }

  for (const p of a) push(p);
  for (const p of b) push(p);

  return out;
}

function buildRows(year, pairs, preferRanked) {
  let rows = pairs.slice(0, 100).map((p, idx) => ({
    year,
    rank: Number(p.rank) || (idx + 1),
    artist: p.artist,
    title: p.title,
    chart: "Top40Weekly Top 100",
  }));

  rows.sort((a, b) => a.rank - b.rank);

  const useRanked = preferRanked && rows.length >= 50;
  return { rows, useRanked };
}

function toCsv(rows) {
  const header = ["year", "rank", "artist", "title", "chart"];
  const esc = (v) => {
    const s = String(v ?? "");
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const out = [header.join(",")];
  for (const r of rows) out.push([r.year, r.rank, r.artist, r.title, r.chart].map(esc).join(","));
  return out.join("\n") + "\n";
}

function parseFrom(htmlOrSlice) {
  const htmlPairs = parsePairsHtml(htmlOrSlice);
  const lines = toLines(htmlOrSlice);
  const linePairs = parsePairsFromLines(lines);
  const ranked = parseRankedPairsFromLines(lines);

  let pairs = mergePairsKeepOrder(htmlPairs, linePairs);
  let preferRanked = false;

  if (ranked.length >= 50) {
    pairs = ranked.map((x) => ({ title: x.title, artist: x.artist, rank: x.rank }));
    preferRanked = true;
  }

  return { pairs, lines, preferRanked, counts: { html: htmlPairs.length, lines: linePairs.length, ranked: ranked.length } };
}

(async function main() {
  const outPath = process.argv[2];
  const urls = process.argv.slice(3);
  if (!outPath || urls.length === 0) {
    console.error("Usage: node scripts/scrape_top40weekly_year_pages.js <out.csv> <url1> <url2> ...");
    process.exit(1);
  }

  const absOut = path.resolve(process.cwd(), outPath);
  fs.mkdirSync(path.dirname(absOut), { recursive: true });

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

    // Pass 1: try entry-content slice (works for 1971–1975)
    let pass1 = parseFrom(entryOk || html);
    let rowsObj = buildRows(year, pass1.pairs, pass1.preferRanked);

    // Pass 2: if too low, re-parse the FULL html (needed for 1970-type layouts)
    if (rowsObj.rows.length < 20) {
      const pass2 = parseFrom(html);
      rowsObj = buildRows(year, pass2.pairs, pass2.preferRanked);

      pass1 = pass2; // use pass2 for debug artifacts below
      console.error("[DBG]", year, "full-html fallback activated",
        `(html=${pass2.counts.html}, lines=${pass2.counts.lines}, ranked=${pass2.counts.ranked})`
      );
    }

    console.error("[OK]", year, "items=", rowsObj.rows.length);

    if (rowsObj.rows.length < 100) {
      console.error("[WARN]", year, "only found", rowsObj.rows.length, "title/artist pairs (after fallback)");

      const dbgLines = `./Data/_debug_lines_${year}.txt`;
      fs.writeFileSync(dbgLines, pass1.lines.slice(0, 900).join("\n") + "\n", "utf8");
      console.error("[DBG] wrote", dbgLines, "(first 900 lines)");

      const dbgHtml = `./Data/_debug_html_${year}.html`;
      fs.writeFileSync(dbgHtml, html.slice(0, 250000) + "\n", "utf8");
      console.error("[DBG] wrote", dbgHtml, "(first 250k chars of html)");
    }

    all = all.concat(rowsObj.rows);
    await new Promise((r) => setTimeout(r, 900));
  }

  fs.writeFileSync(absOut, toCsv(all), "utf8");
  console.error("[DONE] wrote rows=", all.length);
  console.error("[OUT]", absOut);
})().catch((e) => {
  console.error("[ERR]", e && e.stack ? e.stack : e);
  process.exit(1);
});

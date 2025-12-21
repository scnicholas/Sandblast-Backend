/**
 * Discover Top40Weekly "year-end" pages by reading the sitemap.
 *
 * Usage:
 *   node scripts/top40weekly_discover_yearend.js > Data/top40weekly_yearend_urls.txt
 */

"use strict";

async function fetchText(url) {
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return await res.text();
}

function uniq(arr) {
  return Array.from(new Set(arr));
}

(async () => {
  // Common sitemap endpoints for WordPress sites
  const candidates = [
    "https://top40weekly.com/sitemap.xml",
    "https://top40weekly.com/sitemap_index.xml",
    "https://top40weekly.com/wp-sitemap.xml"
  ];

  let xml = null;
  let used = null;

  for (const u of candidates) {
    try {
      xml = await fetchText(u);
      used = u;
      break;
    } catch (_) {}
  }

  if (!xml) {
    console.error("[FATAL] Could not fetch any sitemap endpoint.");
    process.exit(1);
  }

  // Pull all URLs from sitemap (basic)
  const locs = Array.from(xml.matchAll(/<loc>(.*?)<\/loc>/g)).map(m => m[1]);

  // If it’s an index, fetch child sitemaps too (cap for safety)
  const isIndex = /sitemapindex/i.test(xml);
  let urls = [];

  if (isIndex) {
    const child = locs.slice(0, 50);
    for (const sm of child) {
      try {
        const childXml = await fetchText(sm);
        const childLocs = Array.from(childXml.matchAll(/<loc>(.*?)<\/loc>/g)).map(m => m[1]);
        urls.push(...childLocs);
      } catch (_) {}
    }
  } else {
    urls = locs;
  }

  urls = uniq(urls);

  // Filter for likely "year-end" pages
  const yearEnd = urls.filter(u =>
    /year[- ]end|yearend|top[- ]\d+\s+songs|best\s+songs|year[- ]end\s+hot/i.test(u)
  );

  console.error(`[OK] Sitemap used: ${used}`);
  console.error(`[OK] Total URLs scanned: ${urls.length}`);
  console.error(`[OK] Year-end candidates: ${yearEnd.length}`);

  // Print URLs to stdout (file redirection will capture)
  for (const u of yearEnd) console.log(u);
})();

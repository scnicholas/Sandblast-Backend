/**
 * newscanada-rss-service.hardened.js
 *
 * Hardened RSS service for the For Your Life feed served through the existing
 * News Canada route contract.
 *
 * What changed:
 * - upstream source is now https://foryourlife.ca/feed/
 * - parsing is tuned for the For Your Life WordPress RSS feed
 * - image extraction now works from enclosures and embedded HTML
 * - cache paths support both legacy newscanada and new foryourlife locations
 * - response diagnostics explicitly identify the feed source
 *
 * Integration assumptions:
 * - Node.js 18+ (global fetch available)
 * - Express backend
 * - Writable local cache directory
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { XMLParser } = require("fast-xml-parser");

const FEED_NAME = "For Your Life";
const FEED_URL = "https://foryourlife.ca/feed/";
const ROUTE_CONTRACT = "/api/newscanada/rss";

const DEFAULTS = {
  timeoutMs: 30000,
  maxRetries: 2,
  retryDelayMs: 1200,
  maxItems: 12,
  cacheTtlMs: 30 * 60 * 1000,
  cacheFilePath:
    process.env.FORYOURLIFE_CACHE_FILE ||
    process.env.NEWSCANADA_CACHE_FILE ||
    path.join(process.cwd(), "DATA", "foryourlife", "cache", "rss-cache.json"),
  legacyCacheFilePath: path.join(process.cwd(), "DATA", "newscanada", "cache", "rss-cache.json"),
  userAgent:
    "SandblastForYourLife/1.0 (+https://sandblast.channel; contact: ops@sandblast.channel)",
};

const RSS_URLS = [FEED_URL];

const FALLBACK_SEED_STORIES = [
  {
    id: "fallback-001",
    title: "For Your Life feed is temporarily refreshing",
    description:
      "The live For Your Life RSS bridge is retrying. This fallback story confirms the feed pipeline is still mounted and serving data.",
    url: FEED_URL,
    link: FEED_URL,
    source: FEED_NAME,
    category: FEED_NAME,
    publishedAt: new Date().toISOString(),
    image: "",
  },
  {
    id: "fallback-002",
    title: "Sandblast feed cache safeguard is active",
    description:
      "A stale-cache and fallback protection layer is in place to prevent empty story slots on the frontend while the live feed recovers.",
    url: FEED_URL,
    link: FEED_URL,
    source: FEED_NAME,
    category: FEED_NAME,
    publishedAt: new Date().toISOString(),
    image: "",
  },
  {
    id: "fallback-003",
    title: "Live For Your Life stories will replace fallback items automatically",
    description:
      "As soon as the upstream RSS source responds successfully, live stories will overwrite the fallback items in cache and in the response.",
    url: FEED_URL,
    link: FEED_URL,
    source: FEED_NAME,
    category: FEED_NAME,
    publishedAt: new Date().toISOString(),
    image: "",
  },
];

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",
  trimValues: true,
  parseTagValue: true,
  processEntities: true,
});

function ensureDirForFile(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function safeNow() {
  return Date.now();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildId(input) {
  return crypto.createHash("sha1").update(String(input)).digest("hex").slice(0, 16);
}

function normalizeText(value) {
  if (value == null) return "";
  return String(value).replace(/\s+/g, " ").trim();
}

function stripHtml(value) {
  return normalizeText(String(value || "").replace(/<[^>]+>/g, " "));
}

function htmlDecode(value) {
  return String(value || "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function normalizeUrl(value) {
  const url = normalizeText(value);
  if (!url) return "";
  try {
    return new URL(url).toString();
  } catch {
    return "";
  }
}

function coerceArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function extractHtmlImage(...values) {
  for (const value of values) {
    const html = String(value || "");
    const match = html.match(/<img[^>]+src=["']([^"']+)["']/i);
    if (match && match[1]) {
      const url = normalizeUrl(htmlDecode(match[1]));
      if (url) return url;
    }
  }
  return "";
}

function extractImage(item) {
  const enclosureUrl =
    item?.enclosure?.url ||
    item?.["media:content"]?.url ||
    item?.["media:thumbnail"]?.url ||
    item?.thumbnail ||
    item?.image;

  return (
    normalizeUrl(enclosureUrl) ||
    extractHtmlImage(item?.description, item?.summary, item?.["content:encoded"], item?.content)
  );
}

function extractPublishedAt(item) {
  const candidates = [item?.pubDate, item?.published, item?.updated, item?.dcDate, item?.["dc:date"]];

  for (const candidate of candidates) {
    const text = normalizeText(candidate);
    if (!text) continue;
    const t = Date.parse(text);
    if (!Number.isNaN(t)) return new Date(t).toISOString();
  }

  return new Date().toISOString();
}

function extractDescription(raw) {
  const html = raw?.["content:encoded"] || raw?.description || raw?.summary || raw?.content || "";
  return stripHtml(htmlDecode(html));
}

function normalizeItem(raw, sourceUrl) {
  const title = stripHtml(htmlDecode(raw?.title));
  const description = extractDescription(raw);
  const url = normalizeUrl(raw?.link || raw?.guid || raw?.id);
  const category =
    normalizeText(Array.isArray(raw?.category) ? raw.category[0] : raw?.category) || FEED_NAME;
  const publishedAt = extractPublishedAt(raw);
  const image = extractImage(raw);
  const source = FEED_NAME;
  const guid = normalizeText(raw?.guid || "");

  if (!title || !url) return null;

  return {
    id: buildId(`${title}|${url}|${publishedAt}|${sourceUrl}`),
    guid,
    title,
    description,
    summary: description,
    url,
    link: url,
    source,
    feedName: FEED_NAME,
    feedUrl: FEED_URL,
    category,
    publishedAt,
    image,
  };
}

function parseRssXml(xml, sourceUrl) {
  const doc = xmlParser.parse(xml);

  const channelItems = coerceArray(doc?.rss?.channel?.item);
  const atomEntries = coerceArray(doc?.feed?.entry);
  const rawItems = channelItems.length ? channelItems : atomEntries;

  const items = rawItems.map((item) => normalizeItem(item, sourceUrl)).filter(Boolean);
  return dedupeItems(items);
}

function dedupeItems(items) {
  const seen = new Set();
  const deduped = [];

  for (const item of items) {
    const key = item.url || item.id;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    deduped.push(item);
  }

  deduped.sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
  return deduped;
}

async function fetchWithTimeout(url, options = {}, timeoutMs = DEFAULTS.timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error(`timeout of ${timeoutMs}ms exceeded`)), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        "user-agent": DEFAULTS.userAgent,
        accept:
          "application/rss+xml, application/xml, text/xml, application/atom+xml;q=0.9, */*;q=0.8",
        ...(options.headers || {}),
      },
    });

    if (!response.ok) {
      throw new Error(`http_${response.status}`);
    }

    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}

async function fetchRssWithRetry(url, config = {}) {
  const maxRetries = Number.isInteger(config.maxRetries) ? config.maxRetries : DEFAULTS.maxRetries;
  const timeoutMs = config.timeoutMs || DEFAULTS.timeoutMs;
  const retryDelayMs = config.retryDelayMs || DEFAULTS.retryDelayMs;

  let lastError = null;

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      const xml = await fetchWithTimeout(url, {}, timeoutMs);
      const items = parseRssXml(xml, url);

      if (!items.length) {
        throw new Error("rss_parsed_but_empty");
      }

      return {
        ok: true,
        items,
        attempts: attempt + 1,
      };
    } catch (error) {
      lastError = error;
      if (attempt < maxRetries) {
        await sleep(retryDelayMs * (attempt + 1));
      }
    }
  }

  return {
    ok: false,
    items: [],
    attempts: maxRetries + 1,
    error: lastError ? String(lastError.message || lastError) : "unknown_rss_error",
  };
}

function readJsonCache(cacheFilePath) {
  try {
    if (!fs.existsSync(cacheFilePath)) {
      return null;
    }

    const raw = fs.readFileSync(cacheFilePath, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function readCache(cacheFilePath = DEFAULTS.cacheFilePath) {
  try {
    const primary = readJsonCache(cacheFilePath);
    const legacy = cacheFilePath === DEFAULTS.legacyCacheFilePath ? null : readJsonCache(DEFAULTS.legacyCacheFilePath);
    const data = primary || legacy;

    if (!data) {
      return { ok: true, items: [], lastUpdated: null, ageMs: null };
    }

    const items = Array.isArray(data?.items) ? data.items : [];
    const lastUpdated = data?.lastUpdated || null;
    const ageMs = lastUpdated ? safeNow() - Date.parse(lastUpdated) : null;

    return { ok: true, items, lastUpdated, ageMs };
  } catch (error) {
    return {
      ok: false,
      items: [],
      lastUpdated: null,
      ageMs: null,
      error: String(error.message || error),
    };
  }
}

function writeCache(items, cacheFilePath = DEFAULTS.cacheFilePath) {
  ensureDirForFile(cacheFilePath);
  const payload = {
    lastUpdated: new Date().toISOString(),
    itemCount: items.length,
    items,
    meta: {
      source: FEED_NAME,
      feedUrl: FEED_URL,
      servedFrom: "rss_live",
    },
  };
  fs.writeFileSync(cacheFilePath, JSON.stringify(payload, null, 2), "utf8");
  return payload;
}

function withinTtl(ageMs, ttlMs = DEFAULTS.cacheTtlMs) {
  return typeof ageMs === "number" && ageMs >= 0 && ageMs <= ttlMs;
}

function fallbackStories(maxItems = DEFAULTS.maxItems) {
  return FALLBACK_SEED_STORIES.slice(0, maxItems).map((story, index) => ({
    ...story,
    order: index,
    feedName: FEED_NAME,
    feedUrl: FEED_URL,
  }));
}

async function getNewsCanadaStories(options = {}) {
  const config = {
    timeoutMs: options.timeoutMs || DEFAULTS.timeoutMs,
    maxRetries: Number.isInteger(options.maxRetries) ? options.maxRetries : DEFAULTS.maxRetries,
    retryDelayMs: options.retryDelayMs || DEFAULTS.retryDelayMs,
    maxItems: Number.isInteger(options.maxItems) ? options.maxItems : DEFAULTS.maxItems,
    cacheTtlMs: options.cacheTtlMs || DEFAULTS.cacheTtlMs,
    cacheFilePath: options.cacheFilePath || DEFAULTS.cacheFilePath,
    rssUrls: Array.isArray(options.rssUrls) && options.rssUrls.length ? options.rssUrls : RSS_URLS,
  };

  const cache = readCache(config.cacheFilePath);
  const diagnostics = {
    routeContract: ROUTE_CONTRACT,
    source: null,
    feedName: FEED_NAME,
    feedUrl: FEED_URL,
    itemCount: 0,
    rssUrlTried: null,
    rssAttempts: 0,
    cacheAgeMs: cache.ageMs,
    cacheLastUpdated: cache.lastUpdated,
    degraded: false,
    error: null,
    generatedAt: new Date().toISOString(),
  };

  if (options.preferFreshCache && cache.ok && cache.items.length && withinTtl(cache.ageMs, config.cacheTtlMs)) {
    const items = cache.items.slice(0, config.maxItems);
    diagnostics.source = "cache_fresh";
    diagnostics.itemCount = items.length;
    return { ok: true, items, meta: diagnostics };
  }

  for (const rssUrl of config.rssUrls) {
    diagnostics.rssUrlTried = rssUrl;

    const rssResult = await fetchRssWithRetry(rssUrl, config);
    diagnostics.rssAttempts = rssResult.attempts || 0;

    if (rssResult.ok && rssResult.items.length) {
      const items = rssResult.items.slice(0, config.maxItems);
      writeCache(items, config.cacheFilePath);

      diagnostics.source = "rss_live";
      diagnostics.itemCount = items.length;
      diagnostics.degraded = false;

      return { ok: true, items, meta: diagnostics };
    }

    diagnostics.error = rssResult.error || "rss_fetch_failed";
  }

  if (cache.ok && cache.items.length) {
    const items = cache.items.slice(0, config.maxItems);
    diagnostics.source = withinTtl(cache.ageMs, config.cacheTtlMs) ? "cache_fresh" : "cache_stale";
    diagnostics.itemCount = items.length;
    diagnostics.degraded = true;

    return { ok: true, items, meta: diagnostics };
  }

  const items = fallbackStories(config.maxItems);
  diagnostics.source = "fallback_seed";
  diagnostics.itemCount = items.length;
  diagnostics.degraded = true;
  diagnostics.error = diagnostics.error || "rss_unavailable_cache_empty";

  return { ok: true, items, meta: diagnostics };
}

function createNewsCanadaHandler(options = {}) {
  return async function newsCanadaRssHandler(req, res) {
    try {
      const result = await getNewsCanadaStories(options);

      return res.status(200).json({
        ok: true,
        route: ROUTE_CONTRACT,
        items: result.items,
        meta: result.meta,
      });
    } catch (error) {
      const fallback = fallbackStories(options.maxItems || DEFAULTS.maxItems);

      return res.status(200).json({
        ok: true,
        route: ROUTE_CONTRACT,
        items: fallback,
        meta: {
          routeContract: ROUTE_CONTRACT,
          source: "fallback_seed",
          feedName: FEED_NAME,
          feedUrl: FEED_URL,
          itemCount: fallback.length,
          degraded: true,
          error: String(error.message || error),
          generatedAt: new Date().toISOString(),
        },
      });
    }
  };
}

module.exports = {
  DEFAULTS,
  ROUTE_CONTRACT,
  RSS_URLS,
  FALLBACK_SEED_STORIES,
  FEED_NAME,
  FEED_URL,
  readCache,
  writeCache,
  getNewsCanadaStories,
  createNewsCanadaHandler,
};

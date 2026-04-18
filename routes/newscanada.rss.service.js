/**
 * Legacy filename retained for compatibility.
 * Actual upstream source is For Your Life: https://foryourlife.ca/feed/
 *
 * Diagnostics-hardened edition:
 * - fetches live For Your Life RSS
 * - caches results locally
 * - can clear cache on demand
 * - emits failure-trace metadata for fetch, parse, cache-read, cache-write, and fallback decisions
 * - exposes both For Your Life and legacy News Canada export names
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { XMLParser } = require("fast-xml-parser");

const FEED_NAME = "For Your Life";
const FEED_URL = "https://foryourlife.ca/feed/";
const PRIMARY_ROUTE_CONTRACT = "/api/foryourlife/rss";
const LEGACY_ROUTE_CONTRACT = "/api/newscanada/rss";

const DEFAULTS = {
  timeoutMs: 30000,
  maxRetries: 2,
  retryDelayMs: 1200,
  maxItems: 12,
  cacheTtlMs: 30 * 60 * 1000,
  cacheFilePath:
    process.env.FORYOURLIFE_CACHE_FILE ||
    path.join(process.cwd(), "DATA", "foryourlife", "cache", "rss-cache.json"),
  userAgent:
    "SandblastForYourLife/1.1 (+https://sandblast.channel; diagnostics enabled)",
};

const RSS_URLS = [FEED_URL];

const FALLBACK_SEED_STORIES = [
  {
    id: "fallback-001",
    title: "For Your Life feed is temporarily refreshing",
    description:
      "The live RSS bridge is retrying. This fallback story confirms the For Your Life pipeline is still mounted and serving data.",
    url: FEED_URL,
    link: FEED_URL,
    source: FEED_NAME,
    category: FEED_NAME,
    publishedAt: new Date().toISOString(),
    image: "",
    feedName: FEED_NAME,
    feedUrl: FEED_URL,
    parserMode: "fallback_seed"
  },
  {
    id: "fallback-002",
    title: "Sandblast feed cache safeguard is active",
    description:
      "A stale-cache and fallback protection layer is now in place to prevent empty story slots on the frontend.",
    url: FEED_URL,
    link: FEED_URL,
    source: FEED_NAME,
    category: FEED_NAME,
    publishedAt: new Date().toISOString(),
    image: "",
    feedName: FEED_NAME,
    feedUrl: FEED_URL,
    parserMode: "fallback_seed"
  },
  {
    id: "fallback-003",
    title: "Live stories will replace fallback slots automatically",
    description:
      "As soon as the upstream RSS source responds successfully, live For Your Life stories will overwrite the fallback items.",
    url: FEED_URL,
    link: FEED_URL,
    source: FEED_NAME,
    category: FEED_NAME,
    publishedAt: new Date().toISOString(),
    image: "",
    feedName: FEED_NAME,
    feedUrl: FEED_URL,
    parserMode: "fallback_seed"
  },
];

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",
  trimValues: true,
  parseTagValue: true,
  parseAttributeValue: false,
  cdataPropName: "__cdata",
  textNodeName: "__text"
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

function pickAtomLink(entry) {
  const links = coerceArray(entry && entry.link);
  for (const link of links) {
    if (typeof link === "string") {
      const out = normalizeUrl(link);
      if (out) return out;
      continue;
    }
    const rel = normalizeText(link && link.rel).toLowerCase();
    const href = normalizeUrl(link && (link.href || link.url));
    if (!href) continue;
    if (!rel || rel === "alternate" || rel === "self") return href;
  }
  return "";
}

function pickTextField(value) {
  if (value == null) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) {
    for (const entry of value) {
      const out = pickTextField(entry);
      if (normalizeText(out)) return out;
    }
    return "";
  }
  if (typeof value === "object") {
    return (
      pickTextField(value.__cdata) ||
      pickTextField(value.__text) ||
      pickTextField(value["#text"]) ||
      pickTextField(value.text) ||
      pickTextField(value.value) ||
      ""
    );
  }
  return "";
}

function stripHtml(value) {
  return normalizeText(String(value || "").replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/<[^>]*>/g, " "));
}

function normalizeBodyText(value) {
  return stripHtml(value)
    .replace(/The post\s+.+?\s+appeared first on\s+.+?\.?$/i, "")
    .replace(/Continue reading\s*$/i, "")
    .trim();
}

function extractFirstImageFromHtml(value) {
  const html = String(value || "");
  const match = html.match(/<img[^>]+src=["']([^"']+)["']/i);
  return normalizeUrl(match && match[1]);
}

function extractImage(item) {
  const mediaContent = item && item["media:content"];
  const mediaThumb = item && item["media:thumbnail"];
  const enclosure = item && item.enclosure;
  const direct =
    (mediaContent && mediaContent.url) ||
    (mediaThumb && mediaThumb.url) ||
    (enclosure && enclosure.type && /^image\//i.test(enclosure.type) ? enclosure.url : "");

  return (
    normalizeUrl(direct) ||
    extractFirstImageFromHtml(item && item["content:encoded"]) ||
    extractFirstImageFromHtml(item && item.description)
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

function normalizeItem(raw, sourceUrl) {
  const title = normalizeText(pickTextField(raw?.title));
  const descriptionHtml = pickTextField(raw?.description) || "";
  const contentHtml = pickTextField(raw?.["content:encoded"]) || pickTextField(raw?.content) || pickTextField(raw?.summary) || "";
  const description = normalizeBodyText(descriptionHtml || contentHtml);
  const atomLink = pickAtomLink(raw);
  const url = normalizeUrl(atomLink || raw?.link || raw?.guid || raw?.id);
  const link = normalizeUrl(atomLink || raw?.link || url);
  const guid = normalizeText(pickTextField(raw?.guid) || pickTextField(raw?.id));
  const categoryRaw = Array.isArray(raw?.category) ? raw.category[0] : raw?.category;
  const category = normalizeText(pickTextField(categoryRaw)) || FEED_NAME;
  const publishedAt = extractPublishedAt(raw);
  const image = extractImage(raw);
  const author = normalizeText(
    pickTextField(raw?.["dc:creator"]) ||
    pickTextField(raw?.author?.name) ||
    pickTextField(raw?.author)
  );

  if (!title || !url) return null;

  return {
    id: buildId(`${title}|${url}|${publishedAt}|${sourceUrl}`),
    guid,
    title,
    description,
    summary: description,
    body: description,
    content: description,
    url,
    link,
    source: FEED_NAME,
    author,
    category,
    publishedAt,
    image,
    feedName: FEED_NAME,
    feedUrl: FEED_URL,
    parserMode: "rss_xml_parser"
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

async function fetchWithTimeout(url, options = {}, timeoutMs = DEFAULTS.timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error(`timeout of ${timeoutMs}ms exceeded`)), timeoutMs);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        "user-agent": DEFAULTS.userAgent,
        accept: "application/rss+xml, application/xml, text/xml, application/atom+xml;q=0.9, */*;q=0.8",
        ...(options.headers || {}),
      },
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`http_${response.status}`);
    return {
      ok: true,
      status: Number(response.status || 0),
      finalUrl: normalizeText(response.url || url) || url,
      contentType: normalizeText(response.headers.get("content-type") || ""),
      xml: text
    };
  } finally {
    clearTimeout(timer);
  }
}

async function fetchRssWithRetry(url, config = {}) {
  const maxRetries = Number.isInteger(config.maxRetries) ? config.maxRetries : DEFAULTS.maxRetries;
  const timeoutMs = config.timeoutMs || DEFAULTS.timeoutMs;
  const retryDelayMs = config.retryDelayMs || DEFAULTS.retryDelayMs;
  let lastError = null;
  const attempts = [];

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      const fetched = await fetchWithTimeout(url, {}, timeoutMs);
      const items = parseRssXml(fetched.xml, url);
      attempts.push({
        attempt: attempt + 1,
        url,
        status: fetched.status,
        ok: true,
        finalUrl: fetched.finalUrl,
        contentType: fetched.contentType,
        parsedItemCount: items.length
      });
      if (!items.length) throw new Error("rss_parsed_but_empty");
      return {
        ok: true,
        items,
        attempts: attempt + 1,
        diagnostics: {
          attempts,
          contentType: fetched.contentType,
          finalUrl: fetched.finalUrl,
          parserMode: "rss_xml_parser",
          rawItemCount: items.length
        }
      };
    } catch (error) {
      lastError = error;
      attempts.push({
        attempt: attempt + 1,
        url,
        ok: false,
        error: String(error.message || error)
      });
      if (attempt < maxRetries) await sleep(retryDelayMs * (attempt + 1));
    }
  }

  return {
    ok: false,
    items: [],
    attempts: maxRetries + 1,
    error: lastError ? String(lastError.message || lastError) : "unknown_rss_error",
    diagnostics: {
      attempts,
      parserMode: "rss_failed",
      rawItemCount: 0
    }
  };
}

function readCache(cacheFilePath = DEFAULTS.cacheFilePath) {
  try {
    if (!fs.existsSync(cacheFilePath)) {
      const legacyPaths = [
        path.join(process.cwd(), "DATA", "newscanada", "cache", "rss-cache.json"),
        path.join(process.cwd(), "data", "newscanada", "cache", "rss-cache.json"),
        path.join(process.cwd(), ".newscanada-feed-cache.json")
      ];
      for (const legacyPath of legacyPaths) {
        if (fs.existsSync(legacyPath)) return readCache(legacyPath);
      }
      return { ok: true, items: [], lastUpdated: null, ageMs: null, cacheFilePath };
    }

    const raw = fs.readFileSync(cacheFilePath, "utf8");
    const data = JSON.parse(raw);
    const items = Array.isArray(data?.items) ? data.items : [];
    const lastUpdated = data?.lastUpdated || data?.meta?.fetchedAt || null;
    const ageMs = lastUpdated ? safeNow() - Date.parse(lastUpdated) : null;
    return { ok: true, items, lastUpdated, ageMs, cacheFilePath };
  } catch (error) {
    return { ok: false, items: [], lastUpdated: null, ageMs: null, cacheFilePath, error: String(error.message || error) };
  }
}

function writeCache(items, cacheFilePath = DEFAULTS.cacheFilePath) {
  ensureDirForFile(cacheFilePath);
  const payload = { lastUpdated: new Date().toISOString(), itemCount: items.length, items };
  fs.writeFileSync(cacheFilePath, JSON.stringify(payload, null, 2), "utf8");
  return payload;
}

function clearCache(cacheFilePath = DEFAULTS.cacheFilePath) {
  const candidates = [
    cacheFilePath,
    path.join(process.cwd(), "DATA", "newscanada", "cache", "rss-cache.json"),
    path.join(process.cwd(), "data", "newscanada", "cache", "rss-cache.json"),
    path.join(process.cwd(), ".newscanada-feed-cache.json")
  ];
  const removed = [];
  for (const candidate of candidates) {
    try {
      if (candidate && fs.existsSync(candidate)) {
        fs.unlinkSync(candidate);
        removed.push(candidate);
      }
    } catch (_) {}
  }
  return removed;
}

function withinTtl(ageMs, ttlMs = DEFAULTS.cacheTtlMs) {
  return typeof ageMs === "number" && ageMs >= 0 && ageMs <= ttlMs;
}

function fallbackStories(maxItems = DEFAULTS.maxItems) {
  return FALLBACK_SEED_STORIES.slice(0, maxItems).map((story, index) => ({ ...story, order: index }));
}

function isSyntheticStory(item) {
  const parserMode = normalizeText(item && item.parserMode).toLowerCase();
  const id = normalizeText(item && item.id).toLowerCase();
  const title = normalizeText(item && item.title).toLowerCase();
  const description = normalizeText(item && (item.description || item.summary || item.body || item.content)).toLowerCase();
  return (
    parserMode.includes("fallback") ||
    parserMode.includes("seed") ||
    parserMode.includes("timeout") ||
    id.startsWith("fallback-") ||
    title.includes("temporarily refreshing") ||
    title.includes("cache safeguard") ||
    title.includes("replace fallback") ||
    description.includes("fallback story") ||
    description.includes("fallback items")
  );
}

function buildMeta(base) {
  return {
    routeContract: LEGACY_ROUTE_CONTRACT,
    primaryRouteContract: PRIMARY_ROUTE_CONTRACT,
    legacyRouteContract: LEGACY_ROUTE_CONTRACT,
    feedName: FEED_NAME,
    feedUrl: FEED_URL,
    source: null,
    itemCount: 0,
    rssUrlTried: null,
    rssAttempts: 0,
    cacheAgeMs: null,
    cacheLastUpdated: null,
    degraded: false,
    error: null,
    parserMode: "unknown",
    diagnosticsLog: [],
    generatedAt: new Date().toISOString(),
    ...(base || {})
  };
}

async function getForYourLifeStories(options = {}) {
  const config = {
    timeoutMs: options.timeoutMs || DEFAULTS.timeoutMs,
    maxRetries: Number.isInteger(options.maxRetries) ? options.maxRetries : DEFAULTS.maxRetries,
    retryDelayMs: options.retryDelayMs || DEFAULTS.retryDelayMs,
    maxItems: Number.isInteger(options.maxItems) ? options.maxItems : DEFAULTS.maxItems,
    cacheTtlMs: options.cacheTtlMs || DEFAULTS.cacheTtlMs,
    cacheFilePath: options.cacheFilePath || DEFAULTS.cacheFilePath,
    rssUrls: Array.isArray(options.rssUrls) && options.rssUrls.length ? options.rssUrls : RSS_URLS,
    preferFreshCache: !!options.preferFreshCache,
    refresh: !!options.refresh,
    clearCache: !!options.clearCache,
    diagnostics: !!options.diagnostics,
    strictLive: options.strictLive !== false,
    allowFallbackSeed: !!options.allowFallbackSeed,
  };

  const removedCaches = config.clearCache ? clearCache(config.cacheFilePath) : [];
  const cache = readCache(config.cacheFilePath);
  const diagnostics = buildMeta({
    cacheAgeMs: cache.ageMs,
    cacheLastUpdated: cache.lastUpdated,
    cacheFilePath: cache.cacheFilePath || config.cacheFilePath,
    clearedCacheFiles: removedCaches,
    diagnosticsEnabled: config.diagnostics
  });

  diagnostics.diagnosticsLog.push({
    step: "cache_read",
    cacheOk: !!cache.ok,
    cacheItemCount: Array.isArray(cache.items) ? cache.items.length : 0,
    cacheAgeMs: cache.ageMs,
    cacheFilePath: cache.cacheFilePath || config.cacheFilePath,
    clearedCacheFiles: removedCaches
  });

  if (!config.refresh && config.preferFreshCache && cache.ok && cache.items.length && withinTtl(cache.ageMs, config.cacheTtlMs)) {
    const items = cache.items.slice(0, config.maxItems).filter((item) => !isSyntheticStory(item));
    if (!items.length) {
      diagnostics.diagnosticsLog.push({
        step: "cache_return_skipped",
        reason: "cache_contains_synthetic_only",
        returnedItemCount: 0
      });
    } else {
      diagnostics.source = "cache_fresh";
      diagnostics.itemCount = items.length;
      diagnostics.parserMode = normalizeText(items[0] && items[0].parserMode) || "cache_fresh";
      diagnostics.diagnosticsLog.push({
        step: "cache_return",
        reason: "prefer_fresh_cache",
        returnedItemCount: items.length
      });
      return { ok: true, items, meta: diagnostics };
    }
  }

  for (const rssUrl of config.rssUrls) {
    diagnostics.rssUrlTried = rssUrl;
    const rssResult = await fetchRssWithRetry(rssUrl, config);
    diagnostics.rssAttempts = rssResult.attempts || 0;
    diagnostics.diagnosticsLog.push({
      step: "rss_fetch",
      rssUrl,
      attempts: rssResult.attempts || 0,
      ok: !!rssResult.ok,
      error: rssResult.error || "",
      parserMode: rssResult.diagnostics && rssResult.diagnostics.parserMode || "",
      parsedItemCount: rssResult.diagnostics && rssResult.diagnostics.rawItemCount || 0,
      attemptTrace: rssResult.diagnostics && rssResult.diagnostics.attempts || []
    });

    if (rssResult.ok && rssResult.items.length) {
      const items = rssResult.items.slice(0, config.maxItems).filter((item) => !isSyntheticStory(item));
      if (!items.length) {
        diagnostics.diagnosticsLog.push({
          step: "rss_result_rejected",
          reason: "synthetic_items_only",
          returnedItemCount: 0
        });
        diagnostics.error = "rss_result_filtered_to_zero_real_items";
        continue;
      }
      writeCache(items, config.cacheFilePath);
      diagnostics.source = "rss_live";
      diagnostics.itemCount = items.length;
      diagnostics.degraded = false;
      diagnostics.parserMode = rssResult.diagnostics && rssResult.diagnostics.parserMode || "rss_xml_parser";
      diagnostics.finalUrl = rssResult.diagnostics && rssResult.diagnostics.finalUrl || rssUrl;
      diagnostics.contentType = rssResult.diagnostics && rssResult.diagnostics.contentType || "";
      diagnostics.rawItemCount = rssResult.diagnostics && rssResult.diagnostics.rawItemCount || items.length;
      diagnostics.diagnosticsLog.push({
        step: "cache_write",
        cacheFilePath: config.cacheFilePath,
        writtenItemCount: items.length
      });
      return { ok: true, items, meta: diagnostics };
    }

    diagnostics.error = rssResult.error || "rss_fetch_failed";
  }

  if (cache.ok && cache.items.length) {
    const items = cache.items.slice(0, config.maxItems).filter((item) => !isSyntheticStory(item));
    if (items.length) {
      diagnostics.source = withinTtl(cache.ageMs, config.cacheTtlMs) ? "cache_fresh" : "cache_stale";
      diagnostics.itemCount = items.length;
      diagnostics.degraded = true;
      diagnostics.parserMode = normalizeText(items[0] && items[0].parserMode) || diagnostics.source;
      diagnostics.diagnosticsLog.push({
        step: "cache_fallback_return",
        returnedItemCount: items.length,
        cacheState: diagnostics.source
      });
      return { ok: true, items, meta: diagnostics };
    }
    diagnostics.diagnosticsLog.push({
      step: "cache_fallback_skipped",
      reason: "cache_contains_synthetic_only",
      returnedItemCount: 0
    });
  }

  const items = [];
  diagnostics.source = "live_empty";
  diagnostics.itemCount = 0;
  diagnostics.degraded = true;
  diagnostics.error = diagnostics.error || "rss_unavailable_cache_empty";
  diagnostics.parserMode = "live_empty";
  diagnostics.diagnosticsLog.push({
    step: "live_empty_return",
    returnedItemCount: 0
  });
  return { ok: false, items, meta: diagnostics };
}

async function getNewsCanadaStories(options = {}) {
  return getForYourLifeStories(options);
}

async function inspectCache(cacheFilePath = DEFAULTS.cacheFilePath) {
  const cache = readCache(cacheFilePath);
  return {
    ok: true,
    cache
  };
}

function createForYourLifeHandler(options = {}) {
  return async function forYourLifeRssHandler(req, res) {
    try {
      const result = await getForYourLifeStories(options);
      return res.status(200).json({
        ok: true,
        route: LEGACY_ROUTE_CONTRACT,
        primaryRoute: PRIMARY_ROUTE_CONTRACT,
        feedName: FEED_NAME,
        feedUrl: FEED_URL,
        items: result.items,
        meta: result.meta,
      });
    } catch (error) {
      return res.status(200).json({
        ok: false,
        route: LEGACY_ROUTE_CONTRACT,
        primaryRoute: PRIMARY_ROUTE_CONTRACT,
        feedName: FEED_NAME,
        feedUrl: FEED_URL,
        items: [],
        meta: buildMeta({
          source: "live_empty",
          itemCount: 0,
          degraded: true,
          error: String(error.message || error),
          parserMode: "live_empty"
        }),
      });
    }
  };
}

function createNewsCanadaHandler(options = {}) {
  return createForYourLifeHandler(options);
}

module.exports = {
  FEED_NAME,
  FEED_URL,
  DEFAULTS,
  PRIMARY_ROUTE_CONTRACT,
  LEGACY_ROUTE_CONTRACT,
  ROUTE_CONTRACT: LEGACY_ROUTE_CONTRACT,
  RSS_URLS,
  FALLBACK_SEED_STORIES,
  readCache,
  writeCache,
  clearCache,
  inspectCache,
  getForYourLifeStories,
  getNewsCanadaStories,
  createForYourLifeHandler,
  createNewsCanadaHandler,
  fetchRSS: async function fetchRSSCompat(options = {}) {
    const result = await getForYourLifeStories(options);
    return {
      ok: result.ok !== false,
      items: result.items,
      stories: result.items,
      meta: result.meta
    };
  },
  health: async function healthCompat(options = {}) {
    const result = await getForYourLifeStories({ ...options, preferFreshCache: false, diagnostics: true });
    return {
      ok: true,
      source: result.meta.source,
      degraded: !!result.meta.degraded,
      itemCount: result.meta.itemCount,
      diagnostics: result.meta
    };
  }
};

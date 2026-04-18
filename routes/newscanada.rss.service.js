/**
 * Truth Mode RSS service
 * Legacy filename retained for compatibility.
 * Upstream source of truth: https://foryourlife.ca/feed/
 *
 * Goals:
 * - single live source of truth
 * - no seed stories
 * - no synthetic fallback acceptance
 * - no stale cache return masquerading as success
 * - strict validation with request diagnostics
 * - explicit failure when live RSS is unavailable
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
    "SandblastForYourLifeTruthMode/1.0 (+https://sandblast.channel; live truth mode)",
};

const RSS_URLS = [FEED_URL];

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",
  trimValues: true,
  parseTagValue: true,
  parseAttributeValue: false,
  cdataPropName: "__cdata",
  textNodeName: "__text",
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
  return "";
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

  if (!title || !url || !publishedAt) return null;

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
    parserMode: "rss_xml_parser_truth_mode"
  };
}

function dedupeItems(items) {
  const seen = new Set();
  const out = [];
  for (const item of Array.isArray(items) ? items : []) {
    const key = normalizeText(item && (item.url || item.link || item.guid || item.id)).toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
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
          parserMode: "rss_xml_parser_truth_mode",
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
      parserMode: "rss_failed_truth_mode",
      rawItemCount: 0
    }
  };
}

function readCache(cacheFilePath = DEFAULTS.cacheFilePath) {
  try {
    if (!fs.existsSync(cacheFilePath)) {
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
  const removed = [];
  try {
    if (cacheFilePath && fs.existsSync(cacheFilePath)) {
      fs.unlinkSync(cacheFilePath);
      removed.push(cacheFilePath);
    }
  } catch (_) {}
  return removed;
}

function buildMeta(base) {
  return {
    routeContract: LEGACY_ROUTE_CONTRACT,
    primaryRouteContract: PRIMARY_ROUTE_CONTRACT,
    legacyRouteContract: LEGACY_ROUTE_CONTRACT,
    feedName: FEED_NAME,
    feedUrl: FEED_URL,
    source: "rss_live_truth_mode",
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
    truthMode: true,
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
    refresh: !!options.refresh,
    clearCache: !!options.clearCache,
    diagnostics: options.diagnostics !== false,
  };

  const removedCaches = config.clearCache ? clearCache(config.cacheFilePath) : [];
  const cache = readCache(config.cacheFilePath);
  const diagnostics = buildMeta({
    cacheAgeMs: cache.ageMs,
    cacheLastUpdated: cache.lastUpdated,
    cacheFilePath: cache.cacheFilePath || config.cacheFilePath,
    clearedCacheFiles: removedCaches,
    diagnosticsEnabled: config.diagnostics,
  });

  diagnostics.diagnosticsLog.push({
    step: "truth_mode_start",
    cacheReadOk: !!cache.ok,
    cacheItemCount: Array.isArray(cache.items) ? cache.items.length : 0,
    cacheAgeMs: cache.ageMs,
    cacheFilePath: cache.cacheFilePath || config.cacheFilePath,
    clearedCacheFiles: removedCaches,
  });

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
      const items = rssResult.items.slice(0, config.maxItems);
      writeCache(items, config.cacheFilePath);
      diagnostics.source = "rss_live_truth_mode";
      diagnostics.itemCount = items.length;
      diagnostics.degraded = false;
      diagnostics.error = null;
      diagnostics.parserMode = rssResult.diagnostics && rssResult.diagnostics.parserMode || "rss_xml_parser_truth_mode";
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

  diagnostics.source = "rss_live_truth_mode_failed";
  diagnostics.itemCount = 0;
  diagnostics.degraded = true;
  diagnostics.parserMode = diagnostics.parserMode || "rss_failed_truth_mode";
  diagnostics.diagnosticsLog.push({
    step: "hard_fail_return",
    reason: diagnostics.error || "rss_unavailable",
    returnedItemCount: 0
  });

  return { ok: false, items: [], meta: diagnostics };
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
      return res.status(result.ok ? 200 : 502).json({
        ok: result.ok,
        route: LEGACY_ROUTE_CONTRACT,
        primaryRoute: PRIMARY_ROUTE_CONTRACT,
        feedName: FEED_NAME,
        feedUrl: FEED_URL,
        items: result.items,
        meta: result.meta,
      });
    } catch (error) {
      return res.status(502).json({
        ok: false,
        route: LEGACY_ROUTE_CONTRACT,
        primaryRoute: PRIMARY_ROUTE_CONTRACT,
        feedName: FEED_NAME,
        feedUrl: FEED_URL,
        items: [],
        meta: buildMeta({
          source: "rss_live_truth_mode_failed",
          itemCount: 0,
          degraded: true,
          error: String(error.message || error),
          parserMode: "rss_failed_truth_mode"
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
    const result = await getForYourLifeStories({ ...options, diagnostics: true });
    return {
      ok: result.ok !== false,
      source: result.meta.source,
      degraded: !!result.meta.degraded,
      itemCount: result.meta.itemCount,
      diagnostics: result.meta
    };
  }
};

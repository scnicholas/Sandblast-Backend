"use strict";

// Legacy filename retained for compatibility.
// Primary upstream source is For Your Life, not newscanada.com.
// This bridge now prefers cache contract, then snapshot, then direct RSS service fallback.

const fs = require("fs");
const path = require("path");

function safeStr(v) {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}

function cleanText(v) {
  return safeStr(v).replace(/\s+/g, " ").trim();
}

function isObj(v) {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function unique(arr) {
  return Array.from(new Set((Array.isArray(arr) ? arr : []).filter(Boolean)));
}

function tryRequireMany(paths) {
  for (const p of paths) {
    try {
      const mod = require(p);
      if (mod) return mod;
    } catch (_) {}
  }
  return null;
}

const CACHE_SERVICE_MOD = tryRequireMany([
  "./foryourlifeCacheService",
  "./foryourlifeCacheService.js",
  "./newscanadaCacheService",
  "./newscanadaCacheService.js",
  "../services/foryourlifeCacheService",
  "../services/foryourlifeCacheService.js",
  "../services/newscanadaCacheService",
  "../services/newscanadaCacheService.js",
]);

const RSS_SERVICE_MOD = tryRequireMany([
  "./foryourlife.rss.service",
  "./foryourlife.rss.service.js",
  "./newscanada.rss.service",
  "./newscanada.rss.service.js",
  "../services/foryourlife.rss.service",
  "../services/foryourlife.rss.service.js",
  "../services/newscanada.rss.service",
  "../services/newscanada.rss.service.js",
]);

const CACHE_JSON_CANDIDATES = unique([
  cleanText(
    process.env.FORYOURLIFE_CACHE_FILE ||
      process.env.NEWSCANADA_CACHE_FILE ||
      process.env.NEWS_CANADA_CACHE_FILE ||
      ""
  ),
  path.join(__dirname, "data", "foryourlife", "foryourlife.cache.json"),
  path.join(__dirname, "data", "newscanada", "newscanada.cache.json"),
  path.join(__dirname, "Data", "newscanada", "newscanada.cache.json"),
  path.join(__dirname, "..", "data", "foryourlife", "foryourlife.cache.json"),
  path.join(__dirname, "..", "data", "newscanada", "newscanada.cache.json"),
  path.join(__dirname, "..", "Data", "newscanada", "newscanada.cache.json"),
  path.join(process.cwd(), "data", "foryourlife", "foryourlife.cache.json"),
  path.join(process.cwd(), "data", "newscanada", "newscanada.cache.json"),
  path.join(process.cwd(), "Data", "newscanada", "newscanada.cache.json"),
  path.join(process.cwd(), ".foryourlife-feed-cache.json"),
  path.join(process.cwd(), ".newscanada-feed-cache.json"),
]);

const DEFAULTS = {
  feedName: "For Your Life",
  feedUrl: "https://foryourlife.ca/feed/",
  source: "foryourlife_cache_bridge",
  mode: "cache_first_then_live_rss",
  maxStories: 24,
  refreshMode: "manual_refresh",
  bridgeTimeoutMs: Number(process.env.NEWS_CANADA_BRIDGE_TIMEOUT_MS || 15000),
};

function readJsonFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (_) {
    return null;
  }
}

function decodeEntities(value) {
  return safeStr(value)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&nbsp;/gi, " ")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/&#8217;/gi, "'")
    .replace(/&#8220;|&#8221;/gi, '"')
    .replace(/&#8230;/gi, "…")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function stripTags(value) {
  return cleanText(decodeEntities(value).replace(/<[^>]+>/g, " "));
}

function firstTagValue(block, tagNames) {
  const names = Array.isArray(tagNames) ? tagNames : [tagNames];
  for (const tagName of names) {
    const safeTag = cleanText(tagName).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (!safeTag) continue;
    const match = new RegExp(`<${safeTag}\\b[^>]*>([\\s\\S]*?)<\\/${safeTag}>`, "i").exec(block);
    if (match && cleanText(match[1])) return decodeEntities(match[1]);
  }
  return "";
}

function firstAttrValue(block, tagNames, attrName) {
  const names = Array.isArray(tagNames) ? tagNames : [tagNames];
  const attr = cleanText(attrName).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  for (const tagName of names) {
    const safeTag = cleanText(tagName).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (!safeTag || !attr) continue;
    const match = new RegExp(`<${safeTag}\\b[^>]*\\s${attr}=["']([^"']+)["'][^>]*\\/?>`, "i").exec(block);
    if (match && cleanText(match[1])) return decodeEntities(match[1]);
  }
  return "";
}

function parseDirectFeedXml(xmlText, feedUrl) {
  const xml = safeStr(xmlText || "");
  const items = [];
  const itemBlocks = xml.match(/<item\b[\s\S]*?<\/item>/gi) || [];
  const entryBlocks = itemBlocks.length ? [] : (xml.match(/<entry\b[\s\S]*?<\/entry>/gi) || []);
  const blocks = itemBlocks.length ? itemBlocks : entryBlocks;
  const parserMode = itemBlocks.length ? "bridge_xml_item_parser" : (entryBlocks.length ? "bridge_atom_entry_parser" : "bridge_xml_no_items");

  blocks.forEach((block, index) => {
    const title = stripTags(firstTagValue(block, ["title"])) || `Story ${index + 1}`;
    const descriptionRaw = firstTagValue(block, ["description", "content:encoded", "excerpt:encoded", "content", "summary"]);
    const description = stripTags(descriptionRaw);
    const url = cleanText(
      firstAttrValue(block, ["link"], "href") ||
      firstTagValue(block, ["link"]) ||
      firstTagValue(block, ["guid"])
    );
    const pubDate = cleanText(firstTagValue(block, ["pubDate", "published", "updated", "dc:date"]));
    const author = stripTags(firstTagValue(block, ["dc:creator", "author", "creator"]));
    const category = stripTags(firstTagValue(block, ["category"])) || DEFAULTS.feedName;
    const image = cleanText(
      firstAttrValue(block, ["media:content", "media:thumbnail", "enclosure"], "url") ||
      firstTagValue(block, ["image"])
    );
    items.push({
      id: cleanText(firstTagValue(block, ["guid", "id"]) || url || title || `rss-${index}`),
      guid: cleanText(firstTagValue(block, ["guid", "id"]) || url || title || `rss-${index}`),
      slug: cleanText(title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")),
      title,
      headline: title,
      description,
      summary: description,
      body: description,
      content: description,
      url,
      link: url,
      sourceUrl: url,
      canonicalUrl: url,
      image,
      imageUrl: image,
      thumbnail: image,
      source: DEFAULTS.feedName,
      sourceName: DEFAULTS.feedName,
      feedName: DEFAULTS.feedName,
      feedUrl: cleanText(feedUrl || DEFAULTS.feedUrl) || DEFAULTS.feedUrl,
      category,
      author,
      byline: author,
      publishedAt: pubDate,
      pubDate,
      parserMode,
      isActive: true
    });
  });

  return { items, parserMode };
}

async function getViaDirectFeed(opts = {}, logger = console.log) {
  const timeoutMs = Number(opts && opts.timeoutMs) > 0 ? Number(opts.timeoutMs) : 30000;
  const feedUrl = cleanText((opts && opts.feedUrl) || process.env.NEWS_CANADA_FEED_URL || process.env.NEWS_CANADA_RSS_FEED_URL || DEFAULTS.feedUrl) || DEFAULTS.feedUrl;
  if (typeof fetch !== "function") return null;

  const controller = typeof AbortController === "function" ? new AbortController() : null;
  const timer = controller ? setTimeout(() => {
    try { controller.abort(); } catch (_) {}
  }, timeoutMs) : null;

  try {
    const res = await fetch(feedUrl, {
      method: "GET",
      redirect: "follow",
      headers: {
        "accept": "application/rss+xml, application/xml, text/xml;q=0.95, application/atom+xml;q=0.95, text/html;q=0.7, */*;q=0.6",
        "cache-control": "no-cache",
        "pragma": "no-cache",
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36"
      },
      signal: controller ? controller.signal : undefined
    });

    if (!res || !res.ok) {
      if (typeof logger === "function") logger("[Sandblast][foryourlife] direct_feed_http_error", res && res.status, feedUrl);
      return null;
    }

    const contentType = cleanText(res.headers && typeof res.headers.get === "function" ? (res.headers.get("content-type") || "") : "");
    const rawText = await res.text();
    const parsed = parseDirectFeedXml(rawText, cleanText((res && res.url) || feedUrl) || feedUrl);
    if (!parsed.items.length) {
      if (typeof logger === "function") logger("[Sandblast][foryourlife] direct_feed_parse_empty", { feedUrl, contentType, sample: cleanText(rawText).slice(0, 180) });
      return null;
    }

    return normalizePayload({
      ok: true,
      items: parsed.items,
      meta: {
        feedUrl: cleanText((res && res.url) || feedUrl) || feedUrl,
        source: "direct_feed_live",
        mode: "direct_feed",
        fetchedAt: Date.now(),
        degraded: false,
        stale: false,
        parserMode: cleanText(parsed.parserMode || "bridge_xml_item_parser") || "bridge_xml_item_parser",
        detail: "direct_feed_live_success",
        servedFrom: "direct_feed_live",
        contentType
      }
    }, "direct_feed_live");
  } catch (err) {
    if (typeof logger === "function") logger("[Sandblast][foryourlife] direct_feed_error", err && (err.stack || err.message || err));
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function timeoutPromise(label, timeoutMs) {
  return new Promise((resolve) => {
    const safeLabel = cleanText(label || "bridge_timeout") || "bridge_timeout";
    const ms = Number(timeoutMs) > 0 ? Number(timeoutMs) : DEFAULTS.bridgeTimeoutMs;
    setTimeout(() => resolve({
      __bridgeTimedOut: true,
      ok: false,
      items: [],
      stories: [],
      meta: {
        source: DEFAULTS.source,
        mode: DEFAULTS.mode,
        detail: `${safeLabel}_timeout_${ms}ms`,
        bridgeTimeoutMs: ms,
        degraded: true,
        stale: true,
        servedFrom: safeLabel
      }
    }), ms);
  });
}

async function withBridgeTimeout(label, factory, timeoutMs, logger) {
  const safeLabel = cleanText(label || "bridge_call") || "bridge_call";
  const ms = Number(timeoutMs) > 0 ? Number(timeoutMs) : DEFAULTS.bridgeTimeoutMs;
  try {
    const result = await Promise.race([
      Promise.resolve().then(factory),
      timeoutPromise(safeLabel, ms)
    ]);
    if (result && result.__bridgeTimedOut) {
      if (typeof logger === "function") {
        logger("[Sandblast][foryourlife] bridge_timeout", { label: safeLabel, timeoutMs: ms });
      }
      return null;
    }
    return result || null;
  } catch (err) {
    if (typeof logger === "function") {
      logger("[Sandblast][foryourlife] bridge_call_error", safeLabel, err && (err.stack || err.message || err));
    }
    return null;
  }
}

function isSeedPayload(payload) {
  const items = Array.isArray(payload && payload.items)
    ? payload.items
    : Array.isArray(payload && payload.stories)
      ? payload.stories
      : [];
  const meta = isObj(payload && payload.meta) ? payload.meta : {};
  const source = cleanText(meta.source || meta.servedFrom || "").toLowerCase();
  const detail = cleanText(meta.detail || "").toLowerCase();
  const parserMode = cleanText(meta.parserMode || "").toLowerCase();
  return (
    source.includes("seed") ||
    source.includes("fallback") ||
    detail.includes("seed") ||
    detail.includes("fallback") ||
    parserMode.includes("seed") ||
    parserMode.includes("guaranteed_fallback") ||
    items.some((item) => {
      const id = cleanText(item && item.id).toLowerCase();
      const slug = cleanText(item && item.slug).toLowerCase();
      const itemParserMode = cleanText(item && item.parserMode).toLowerCase();
      return id.includes("fallback-") || slug.includes("refreshing") || itemParserMode.includes("guaranteed_fallback");
    })
  );
}

function normalizeStory(item) {
  const story = isObj(item) ? { ...item } : {};
  story.id = cleanText(story.id || story.guid || story.link || story.url || story.title);
  story.guid = cleanText(story.guid || story.id);
  story.slug = cleanText(story.slug || story.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""));
  story.title = cleanText(story.title || story.headline);
  story.description = cleanText(story.description || story.summary || story.body || story.content || "");
  story.summary = cleanText(story.summary || story.description || "");
  story.body = cleanText(story.body || story.content || story.summary || story.description || "");
  story.url = cleanText(story.url || story.link || story.sourceUrl || story.canonicalUrl);
  story.link = cleanText(story.link || story.url);
  story.image = cleanText(story.image || story.thumbnail || story.imageUrl || story.popupImage || "");
  story.source = cleanText(story.source || DEFAULTS.feedName) || DEFAULTS.feedName;
  story.feedName = cleanText(story.feedName || DEFAULTS.feedName) || DEFAULTS.feedName;
  story.feedUrl = cleanText(story.feedUrl || DEFAULTS.feedUrl) || DEFAULTS.feedUrl;
  story.category = cleanText(story.category || DEFAULTS.feedName) || DEFAULTS.feedName;
  story.author = cleanText(story.author || story.byline || "");
  story.byline = cleanText(story.byline || story.author || "");
  story.publishedAt = cleanText(story.publishedAt || story.pubDate || new Date().toISOString());
  story.pubDate = cleanText(story.pubDate || story.publishedAt || "");
  story.parserMode = cleanText(story.parserMode || "unknown");
  story.isActive = story.isActive !== false;
  return story;
}

function normalizePayload(payload, servedFromHint) {
  const src = isObj(payload) ? payload : {};
  const items = Array.isArray(src.items)
    ? src.items
    : Array.isArray(src.stories)
      ? src.stories
      : [];
  const normalizedItems = items
    .map(normalizeStory)
    .filter((item) => item.title && (item.url || item.link));

  return {
    ok: src.ok !== false && normalizedItems.length > 0,
    items: normalizedItems.slice(0, DEFAULTS.maxStories),
    stories: normalizedItems.slice(0, DEFAULTS.maxStories),
    meta: {
      feedName: DEFAULTS.feedName,
      feedUrl: cleanText((src.meta && src.meta.feedUrl) || DEFAULTS.feedUrl) || DEFAULTS.feedUrl,
      source: cleanText((src.meta && src.meta.source) || DEFAULTS.source) || DEFAULTS.source,
      mode: cleanText((src.meta && src.meta.mode) || DEFAULTS.mode) || DEFAULTS.mode,
      fetchedAt: Number((src.meta && src.meta.fetchedAt) || Date.now()),
      storyCount: normalizedItems.length,
      itemCount: normalizedItems.length,
      degraded: !!(src.meta && src.meta.degraded),
      stale: !!(src.meta && src.meta.stale),
      parserMode: cleanText((src.meta && src.meta.parserMode) || "unknown") || "unknown",
      detail: cleanText((src.meta && src.meta.detail) || "") || "",
      servedFrom: cleanText((src.meta && src.meta.servedFrom) || servedFromHint || "bridge") || servedFromHint || "bridge",
      routeContract: cleanText((src.meta && src.meta.routeContract) || "/api/newscanada/rss"),
      attemptedUrls: Array.isArray(src.meta && src.meta.attemptedUrls) ? src.meta.attemptedUrls : [],
      cachePath: cleanText(src.meta && src.meta.cachePath || src.meta && src.meta.snapshotPath || "")
    },
  };
}

function readCacheSnapshot() {
  for (const candidate of CACHE_JSON_CANDIDATES) {
    const parsed = readJsonFile(candidate);
    const items = Array.isArray(parsed && parsed.items)
      ? parsed.items
      : Array.isArray(parsed && parsed.stories)
        ? parsed.stories
        : [];
    if (items.length) {
      const normalized = normalizePayload(
        {
          ok: true,
          items,
          meta: {
            ...(parsed.meta || {}),
            source: cleanText(parsed.meta && parsed.meta.source || DEFAULTS.source) || DEFAULTS.source,
            mode: cleanText(parsed.meta && parsed.meta.mode || DEFAULTS.mode) || DEFAULTS.mode,
            fetchedAt: Number((parsed.meta && parsed.meta.fetchedAt) || parsed.writtenAt || Date.now()),
            degraded: !!(parsed && parsed.meta && parsed.meta.degraded),
            stale: !!(parsed && parsed.meta && parsed.meta.stale),
            servedFrom: "snapshot_file",
            snapshotPath: candidate,
          },
        },
        "snapshot_file"
      );
      normalized.meta.snapshotPath = candidate;
      return normalized;
    }
  }
  return null;
}

async function getViaCacheService(opts = {}, logger = console.log) {
  if (!CACHE_SERVICE_MOD) return null;
  const timeoutMs = Number(opts && opts.timeoutMs) > 0 ? Number(opts.timeoutMs) : DEFAULTS.bridgeTimeoutMs;

  try {
    if (typeof CACHE_SERVICE_MOD.getCachedOrRefresh === "function") {
      const payload = await withBridgeTimeout("cache_contract", () => CACHE_SERVICE_MOD.getCachedOrRefresh({
        forceRefresh: !!opts.refresh,
        timeoutMs: Number(opts.timeoutMs || 30000),
        clearCache: !!opts.clearCache,
      }), timeoutMs, logger);
      return payload ? normalizePayload(payload, "cache_contract") : null;
    }

    if (typeof CACHE_SERVICE_MOD.readCache === "function") {
      const payload = await withBridgeTimeout("cache_read", () => Promise.resolve(CACHE_SERVICE_MOD.readCache()), timeoutMs, logger);
      return payload ? normalizePayload(payload, "cache_read") : null;
    }
  } catch (err) {
    logger("[Sandblast][foryourlife] cache_bridge_error", err && (err.stack || err.message || err));
  }

  return null;
}

async function getViaRssService(opts = {}, logger = console.log) {
  if (!RSS_SERVICE_MOD) return null;
  const timeoutMs = Number(opts && opts.timeoutMs) > 0 ? Number(opts.timeoutMs) : DEFAULTS.bridgeTimeoutMs;

  try {
    if (typeof RSS_SERVICE_MOD.getForYourLifeStories === "function") {
      const payload = await withBridgeTimeout("rss_service_getForYourLifeStories", () => RSS_SERVICE_MOD.getForYourLifeStories({
        maxItems: Number(opts.limit || opts.maxStories || DEFAULTS.maxStories),
        timeoutMs: Number(opts.timeoutMs || 30000),
        preferFreshCache: !!opts.preferFreshCache,
      }), timeoutMs, logger);
      return payload ? normalizePayload(payload, "rss_service_live") : null;
    }

    if (typeof RSS_SERVICE_MOD.getNewsCanadaStories === "function") {
      const payload = await withBridgeTimeout("rss_service_getNewsCanadaStories", () => RSS_SERVICE_MOD.getNewsCanadaStories({
        maxItems: Number(opts.limit || opts.maxStories || DEFAULTS.maxStories),
        timeoutMs: Number(opts.timeoutMs || 30000),
        preferFreshCache: !!opts.preferFreshCache,
      }), timeoutMs, logger);
      return payload ? normalizePayload(payload, "rss_service_live") : null;
    }

    if (typeof RSS_SERVICE_MOD.fetchRSS === "function") {
      const payload = await withBridgeTimeout("rss_service_fetchRSS", () => RSS_SERVICE_MOD.fetchRSS(opts), timeoutMs, logger);
      return payload ? normalizePayload(payload, "rss_service_live") : null;
    }
  } catch (err) {
    logger("[Sandblast][foryourlife] rss_service_error", err && (err.stack || err.message || err));
  }

  return null;
}

function listBridgeCacheFiles() {
  if (CACHE_SERVICE_MOD && typeof CACHE_SERVICE_MOD.listCacheFiles === "function") {
    try {
      return CACHE_SERVICE_MOD.listCacheFiles();
    } catch (_) {}
  }
  return CACHE_JSON_CANDIDATES.map((candidate) => {
    const filePath = cleanText(candidate);
    if (!filePath) return { path: "", exists: false, size: 0, mtimeMs: 0 };
    try {
      if (!fs.existsSync(filePath)) return { path: filePath, exists: false, size: 0, mtimeMs: 0 };
      const stat = fs.statSync(filePath);
      return { path: filePath, exists: stat.isFile(), size: Number(stat.size || 0), mtimeMs: Number(stat.mtimeMs || 0) };
    } catch (_) {
      return { path: filePath, exists: false, size: 0, mtimeMs: 0, error: "stat_failed" };
    }
  });
}

function clearBridgeCacheFiles() {
  if (CACHE_SERVICE_MOD && typeof CACHE_SERVICE_MOD.clearCacheFiles === "function") {
    try {
      return CACHE_SERVICE_MOD.clearCacheFiles();
    } catch (_) {}
  }
  const cleared = [];
  const missing = [];
  const failed = [];
  for (const candidate of CACHE_JSON_CANDIDATES) {
    const filePath = cleanText(candidate);
    if (!filePath) continue;
    try {
      if (!fs.existsSync(filePath)) {
        missing.push(filePath);
        continue;
      }
      fs.unlinkSync(filePath);
      cleared.push(filePath);
    } catch (err) {
      failed.push({ path: filePath, error: cleanText(err && (err.message || err) || "unlink_failed") });
    }
  }
  return { ok: failed.length === 0, cleared, missing, failed, cacheCandidates: CACHE_JSON_CANDIDATES.slice() };
}

function createForYourLifeFeedService(options = {}) {
  const logger = typeof options.logger === "function" ? options.logger : (...args) => console.log(...args);

  async function fetchRSS(opts = {}) {
    const normalizedOpts = opts && typeof opts === "object" ? { ...opts } : {};
    let cacheMaintenance = null;
    if (normalizedOpts.clearCache) {
      cacheMaintenance = clearBridgeCacheFiles();
    }

    const fromCacheService = normalizedOpts.clearCache ? null : await getViaCacheService(normalizedOpts, logger);
    if (fromCacheService && fromCacheService.items.length && !isSeedPayload(fromCacheService)) {
      return {
        ...fromCacheService,
        meta: {
          ...(fromCacheService.meta || {}),
          cacheMaintenance,
          cacheFiles: listBridgeCacheFiles()
        }
      };
    }

    const shouldForceLive = !!normalizedOpts.clearCache || !!(fromCacheService && (
      isSeedPayload(fromCacheService) ||
      (fromCacheService.meta && (fromCacheService.meta.degraded || fromCacheService.meta.stale))
    ));

    const fromRssService = await getViaRssService({ ...normalizedOpts, refresh: shouldForceLive || !!normalizedOpts.refresh, preferFreshCache: true }, logger);
    if (fromRssService && fromRssService.items.length) {
      return {
        ...fromRssService,
        meta: {
          ...(fromRssService.meta || {}),
          cacheMaintenance,
          cacheFiles: listBridgeCacheFiles()
        }
      };
    }

    const fromDirectFeed = await getViaDirectFeed({ ...normalizedOpts, refresh: true }, logger);
    if (fromDirectFeed && fromDirectFeed.items.length) {
      return {
        ...fromDirectFeed,
        meta: {
          ...(fromDirectFeed.meta || {}),
          cacheMaintenance,
          cacheFiles: listBridgeCacheFiles()
        }
      };
    }

    const snapshot = readCacheSnapshot();
    if (snapshot && snapshot.items.length && !isSeedPayload(snapshot)) {
      return {
        ...snapshot,
        meta: {
          ...(snapshot.meta || {}),
          cacheMaintenance,
          cacheFiles: listBridgeCacheFiles()
        }
      };
    }

    return {
      ok: false,
      items: [],
      stories: [],
      meta: {
        feedName: DEFAULTS.feedName,
        feedUrl: DEFAULTS.feedUrl,
        source: DEFAULTS.source,
        mode: DEFAULTS.mode,
        fetchedAt: Date.now(),
        storyCount: 0,
        itemCount: 0,
        degraded: true,
        stale: true,
        detail: "cache_and_live_rss_unavailable_no_snapshot_or_bridge_timeout",
        servedFrom: "bridge_empty",
        routeContract: "/api/newscanada/rss",
        cacheMaintenance,
        cacheFiles: listBridgeCacheFiles(),
      },
    };
  }

  async function getEditorsPicks(opts = {}) {
    const payload = await fetchRSS(opts);
    const limit = Number(opts.limit) > 0 ? Number(opts.limit) : 0;
    const stories = limit > 0 ? payload.stories.slice(0, limit) : payload.stories.slice();

    return {
      ok: stories.length > 0,
      stories,
      slides: stories,
      chips: [],
      meta: {
        ...payload.meta,
        storyCount: stories.length,
        detail: cleanText((payload.meta && payload.meta.detail) || (stories.length ? "bridge_payload_ready" : "bridge_empty_payload")) || (stories.length ? "bridge_payload_ready" : "bridge_empty_payload"),
      },
    };
  }

  async function getStory(lookup, opts = {}) {
    const payload = await fetchRSS(opts);
    const key = cleanText(lookup).toLowerCase();

    const story = payload.stories.find((item) =>
      [
        cleanText(item && item.id).toLowerCase(),
        cleanText(item && item.guid).toLowerCase(),
        cleanText(item && item.slug).toLowerCase(),
        cleanText(item && item.title).toLowerCase(),
        cleanText(item && item.url).toLowerCase(),
        cleanText(item && item.link).toLowerCase(),
      ].includes(key)
    );

    if (!story) {
      return {
        ok: false,
        error: "story_not_found",
        meta: payload.meta,
      };
    }

    return {
      ok: true,
      story,
      meta: payload.meta,
    };
  }

  async function prime(opts = {}) {
    const payload = await fetchRSS({ ...opts, refresh: true });
    return {
      ok: !!(payload && Array.isArray(payload.items) && payload.items.length),
      items: payload.items,
      stories: payload.stories,
      meta: {
        ...(payload.meta || {}),
        mode: DEFAULTS.refreshMode,
        servedFrom: cleanText((payload.meta && payload.meta.servedFrom) || "refresh_now") || "refresh_now",
      },
    };
  }

  async function health() {
    const payload = await fetchRSS({});
    return {
      ok: payload.ok,
      feedName: DEFAULTS.feedName,
      feedUrl: DEFAULTS.feedUrl,
      source: DEFAULTS.source,
      mode: DEFAULTS.mode,
      storyCount: Array.isArray(payload.stories) ? payload.stories.length : 0,
      degraded: !!(payload.meta && payload.meta.degraded),
      stale: !!(payload.meta && payload.meta.stale),
      diagnostics: payload.meta,
    };
  }

  async function refreshNow(opts = {}) {
    return prime(opts);
  }

  async function inspectCacheFiles() {
    return {
      ok: true,
      files: listBridgeCacheFiles(),
      feedUrl: DEFAULTS.feedUrl
    };
  }

  async function clearCacheAndRefresh(opts = {}) {
    const payload = await fetchRSS({ ...opts, clearCache: true, refresh: true });
    return {
      ok: !!(payload && Array.isArray(payload.items) && payload.items.length),
      items: payload.items || [],
      stories: payload.stories || [],
      meta: payload.meta || {},
      files: listBridgeCacheFiles()
    };
  }

  return {
    fetchRSS,
    getEditorsPicks,
    getStory,
    prime,
    refreshNow,
    health,
    inspectCacheFiles,
    clearCacheAndRefresh,
  };
}

function createNewsCanadaFeedService(options = {}) {
  return createForYourLifeFeedService(options);
}

module.exports = {
  createForYourLifeFeedService,
  createNewsCanadaFeedService,
  fetchRSS: async function fetchRSSCompat(opts = {}) {
    const service = createForYourLifeFeedService();
    return service.fetchRSS(opts);
  },
  refreshNow: async function refreshNowCompat(opts = {}) {
    const service = createForYourLifeFeedService();
    return service.refreshNow(opts);
  },
  inspectCacheFiles: async function inspectCacheFilesCompat() {
    const service = createForYourLifeFeedService();
    return service.inspectCacheFiles();
  },
  clearCacheAndRefresh: async function clearCacheAndRefreshCompat(opts = {}) {
    const service = createForYourLifeFeedService();
    return service.clearCacheAndRefresh(opts);
  },
  clearBridgeCacheFiles,
  listBridgeCacheFiles,
};

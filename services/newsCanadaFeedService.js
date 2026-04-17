"use strict";

// Legacy filename retained for compatibility.
// Primary upstream source is For Your Life, not newscanada.com.
// This bridge now prefers cache, then snapshot, then direct RSS service fallback.

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

const CACHE_JSON_CANDIDATES = [
  cleanText(
    process.env.FORYOURLIFE_CACHE_FILE ||
      process.env.NEWSCANADA_CACHE_FILE ||
      process.env.NEWS_CANADA_CACHE_FILE ||
      ""
  ),
  path.join(__dirname, "data", "foryourlife", "foryourlife.cache.json"),
  path.join(__dirname, "data", "newscanada", "newscanada.cache.json"),
  path.join(__dirname, "..", "data", "foryourlife", "foryourlife.cache.json"),
  path.join(__dirname, "..", "data", "newscanada", "newscanada.cache.json"),
  path.join(process.cwd(), "data", "foryourlife", "foryourlife.cache.json"),
  path.join(process.cwd(), "data", "newscanada", "newscanada.cache.json"),
  path.join(process.cwd(), ".foryourlife-feed-cache.json"),
  path.join(process.cwd(), ".newscanada-feed-cache.json"),
].filter(Boolean);

const DEFAULTS = {
  feedName: "For Your Life",
  feedUrl: "https://foryourlife.ca/feed/",
  source: "foryourlife_cache_bridge",
  mode: "cache_first_then_live_rss",
  maxStories: 24,
  refreshMode: "manual_refresh",
};

function readJsonFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (_) {
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
  return (
    source.includes("seed") ||
    detail.includes("seed") ||
    items.some((item) => cleanText(item && item.id).toLowerCase().includes("fallback-"))
  );
}

function normalizeStory(item) {
  const story = isObj(item) ? { ...item } : {};
  story.id = cleanText(story.id || story.guid || story.link || story.url || story.title);
  story.guid = cleanText(story.guid || story.id);
  story.title = cleanText(story.title);
  story.description = cleanText(story.description || story.summary || "");
  story.summary = cleanText(story.summary || story.description || "");
  story.url = cleanText(story.url || story.link);
  story.link = cleanText(story.link || story.url);
  story.image = cleanText(story.image || story.thumbnail || story.imageUrl || "");
  story.source = cleanText(story.source || DEFAULTS.feedName) || DEFAULTS.feedName;
  story.feedName = cleanText(story.feedName || DEFAULTS.feedName) || DEFAULTS.feedName;
  story.feedUrl = cleanText(story.feedUrl || DEFAULTS.feedUrl) || DEFAULTS.feedUrl;
  story.category = cleanText(story.category || DEFAULTS.feedName) || DEFAULTS.feedName;
  story.author = cleanText(story.author || "");
  story.publishedAt = cleanText(story.publishedAt || story.pubDate || new Date().toISOString());
  return story;
}

function normalizePayload(payload, servedFromHint) {
  const src = isObj(payload) ? payload : {};
  const items = Array.isArray(src.items)
    ? src.items
    : Array.isArray(src.stories)
      ? src.stories
      : [];
  const normalizedItems = items.map(normalizeStory).filter((item) => item.title && (item.url || item.link));

  return {
    ok: src.ok !== false && normalizedItems.length > 0,
    items: normalizedItems.slice(0, DEFAULTS.maxStories),
    stories: normalizedItems.slice(0, DEFAULTS.maxStories),
    meta: {
      feedName: DEFAULTS.feedName,
      feedUrl: DEFAULTS.feedUrl,
      source: cleanText((src.meta && src.meta.source) || DEFAULTS.source) || DEFAULTS.source,
      mode: cleanText((src.meta && src.meta.mode) || DEFAULTS.mode) || DEFAULTS.mode,
      fetchedAt: Number((src.meta && src.meta.fetchedAt) || Date.now()),
      storyCount: normalizedItems.length,
      itemCount: normalizedItems.length,
      degraded: !!(src.meta && src.meta.degraded),
      stale: !!(src.meta && src.meta.stale),
      servedFrom: cleanText((src.meta && src.meta.servedFrom) || servedFromHint || "bridge") || servedFromHint || "bridge",
      routeContract: cleanText((src.meta && src.meta.routeContract) || "/api/newscanada/rss"),
    },
  };
}

function readCacheSnapshot() {
  for (const candidate of CACHE_JSON_CANDIDATES) {
    const parsed = readJsonFile(candidate);
    const items = Array.isArray(parsed && (parsed.items || parsed.stories)) ? parsed.items || parsed.stories : [];
    if (items.length) {
      const normalized = normalizePayload(
        {
          ok: true,
          items,
          meta: {
            ...(parsed.meta || {}),
            source: DEFAULTS.source,
            mode: DEFAULTS.mode,
            fetchedAt: Number((parsed.meta && parsed.meta.fetchedAt) || parsed.writtenAt || Date.now()),
            degraded: true,
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

  try {
    if (typeof CACHE_SERVICE_MOD.getCachedOrRefresh === "function") {
      const payload = await CACHE_SERVICE_MOD.getCachedOrRefresh({
        forceRefresh: !!opts.refresh,
        timeoutMs: Number(opts.timeoutMs || 30000),
      });
      return normalizePayload(payload, "cache_contract");
    }

    if (typeof CACHE_SERVICE_MOD.readCache === "function") {
      const payload = CACHE_SERVICE_MOD.readCache();
      return normalizePayload(payload, "cache_read");
    }
  } catch (err) {
    logger("[Sandblast][foryourlife] cache_bridge_error", err && (err.stack || err.message || err));
  }

  return null;
}

async function getViaRssService(opts = {}, logger = console.log) {
  if (!RSS_SERVICE_MOD) return null;

  try {
    if (typeof RSS_SERVICE_MOD.getForYourLifeStories === "function") {
      const payload = await RSS_SERVICE_MOD.getForYourLifeStories({
        maxItems: Number(opts.limit || opts.maxStories || DEFAULTS.maxStories),
        timeoutMs: Number(opts.timeoutMs || 30000),
        preferFreshCache: !!opts.preferFreshCache,
      });
      return normalizePayload(payload, "rss_service_live");
    }

    if (typeof RSS_SERVICE_MOD.getNewsCanadaStories === "function") {
      const payload = await RSS_SERVICE_MOD.getNewsCanadaStories({
        maxItems: Number(opts.limit || opts.maxStories || DEFAULTS.maxStories),
        timeoutMs: Number(opts.timeoutMs || 30000),
        preferFreshCache: !!opts.preferFreshCache,
      });
      return normalizePayload(payload, "rss_service_live");
    }

    if (typeof RSS_SERVICE_MOD.fetchRSS === "function") {
      const payload = await RSS_SERVICE_MOD.fetchRSS(opts);
      return normalizePayload(payload, "rss_service_live");
    }
  } catch (err) {
    logger("[Sandblast][foryourlife] rss_service_error", err && (err.stack || err.message || err));
  }

  return null;
}

function createForYourLifeFeedService(options = {}) {
  const logger = typeof options.logger === "function" ? options.logger : (...args) => console.log(...args);

  async function fetchRSS(opts = {}) {
    const fromCacheService = await getViaCacheService(opts, logger);
    if (fromCacheService && fromCacheService.items.length && !isSeedPayload(fromCacheService)) {
      return fromCacheService;
    }

    const fromRssService = await getViaRssService(opts, logger);
    if (fromRssService && fromRssService.items.length) {
      return fromRssService;
    }

    const snapshot = readCacheSnapshot();
    if (snapshot && snapshot.items.length && !isSeedPayload(snapshot)) {
      return snapshot;
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
        detail: "cache_and_live_rss_unavailable_no_snapshot",
        servedFrom: "bridge_empty",
        routeContract: "/api/newscanada/rss",
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

  return {
    fetchRSS,
    getEditorsPicks,
    getStory,
    prime,
    refreshNow,
    health,
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
};

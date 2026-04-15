"use strict";

// newsCanadaFeedService v2.1.0sb
// Rebuilt from uploaded source with explicit resilience changes:
// - 30s request timeout
// - 30s parser timeout
// - retry with backoff
// - stale-cache fallback (30 min default)
// - tighter diagnostics and health state

const axios = require("axios");
const Parser = require("rss-parser");

const DEFAULTS = {
  parserTimeoutMs: 30000,
  requestTimeoutMs: 30000,
  maxRedirects: 5,
  retryAttempts: 3,
  retryDelayMs: 1250,
  staleTtlMs: 30 * 60 * 1000,
  source: "rss_service"
};

function cleanText(v) {
  return typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim();
}

function stripHtml(v) {
  return cleanText(String(v || "").replace(/<[^>]*>/g, " "));
}

function slugify(v) {
  return cleanText(v)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractMediaUrl(value) {
  if (!value) return "";
  if (typeof value === "string") return cleanText(value);
  if (Array.isArray(value)) {
    for (const item of value) {
      const candidate = extractMediaUrl(item);
      if (candidate) return candidate;
    }
    return "";
  }
  if (typeof value === "object") {
    return cleanText(
      value.url || value.$?.url || value.href || value.src || value["media:content"] || ""
    );
  }
  return "";
}

function firstImageFromItem(item) {
  if (!item || typeof item !== "object") return "";
  return cleanText(
    extractMediaUrl(item.enclosure) ||
    extractMediaUrl(item.image) ||
    extractMediaUrl(item.thumbnail) ||
    extractMediaUrl(item.mediaThumbnail) ||
    extractMediaUrl(item.mediaContent) ||
    ""
  );
}

function sanitizeXml(xml) {
  let out = String(xml || "");
  out = out.replace(/^\uFEFF/, "");
  out = out.replace(/<!--[\s\S]*?-->/g, "");
  out = out.replace(/<!\[CDATA\[/g, "");
  out = out.replace(/\]\]>/g, "");
  out = out.replace(/<br\s*\/?>/gi, " ");
  out = out.replace(/<script[\s\S]*?<\/script>/gi, "");
  out = out.replace(/<style[\s\S]*?<\/style>/gi, "");
  out = out.replace(/&(?!(amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/g, "&amp;");
  out = out.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "");
  out = out.trim();

  const rssStart = out.search(/<(rss|feed)\b/i);
  if (rssStart >= 0) out = out.slice(rssStart);

  return out;
}

function normalizeItem(item, index) {
  const title = stripHtml(item && item.title);
  const link = cleanText(item && item.link);
  const description = stripHtml(
    (item && item.contentSnippet) ||
    (item && item.content) ||
    (item && item.summary) ||
    (item && item.contentEncoded) ||
    ""
  );
  const pubDate = cleanText((item && item.pubDate) || (item && item.isoDate) || "");
  const id = cleanText(item && item.guid) || link || `rss-${index}`;
  const slug = slugify(title) || slugify(link) || `rss-${index}`;
  const image = firstImageFromItem(item);

  return {
    id,
    slug,
    title,
    description,
    summary: description,
    body: description,
    content: description,
    link,
    url: link,
    pubDate,
    image,
    popupImage: image,
    popupBody: description,
    ctaText: "Read more",
    source: "News Canada",
    isActive: true
  };
}

function buildErrorDetail(err) {
  return cleanText(
    err &&
      (
        err.response?.data?.message ||
        err.response?.statusText ||
        err.message ||
        err.code ||
        "rss_fetch_failed"
      )
  ) || "rss_fetch_failed";
}

function createNewsCanadaFeedService(options = {}) {
  const config = {
    parserTimeoutMs: Number(options.parserTimeoutMs) > 0 ? Number(options.parserTimeoutMs) : DEFAULTS.parserTimeoutMs,
    requestTimeoutMs: Number(options.requestTimeoutMs) > 0 ? Number(options.requestTimeoutMs) : DEFAULTS.requestTimeoutMs,
    maxRedirects: Number(options.maxRedirects) >= 0 ? Number(options.maxRedirects) : DEFAULTS.maxRedirects,
    retryAttempts: Number(options.retryAttempts) > 0 ? Number(options.retryAttempts) : DEFAULTS.retryAttempts,
    retryDelayMs: Number(options.retryDelayMs) > 0 ? Number(options.retryDelayMs) : DEFAULTS.retryDelayMs,
    staleTtlMs: Number(options.staleTtlMs) > 0 ? Number(options.staleTtlMs) : DEFAULTS.staleTtlMs,
    source: cleanText(options.source) || DEFAULTS.source,
    parserOptions: options.parserOptions || {}
  };

  const parser = new Parser({
    timeout: config.parserTimeoutMs,
    ...config.parserOptions
  });

  const logger = typeof options.logger === "function"
    ? options.logger
    : (...args) => console.log(...args);

  let cache = {
    ok: false,
    stories: [],
    fetchedAt: 0,
    feedUrl: "",
    degraded: false,
    stale: false,
    source: config.source,
    lastError: "",
    lastErrorAt: 0,
    lastDiagnostics: null
  };

  function getFeedUrl() {
    return cleanText(
      process.env.NEWS_CANADA_FEED_URL ||
      process.env.NEWS_CANADA_RSS_FEED_URL ||
      process.env.SB_NEWSCANADA_RSS_FEED_URL ||
      ""
    );
  }

  function getDiagnosticsBase(feedUrl) {
    return {
      source: config.source,
      feedUrl,
      requestTimeoutMs: config.requestTimeoutMs,
      parserTimeoutMs: config.parserTimeoutMs,
      retryAttempts: config.retryAttempts,
      retryDelayMs: config.retryDelayMs,
      staleTtlMs: config.staleTtlMs
    };
  }

  function canServeStale() {
    return cache.ok && cache.fetchedAt > 0 && (Date.now() - cache.fetchedAt) <= config.staleTtlMs && Array.isArray(cache.stories) && cache.stories.length > 0;
  }

  async function attemptFetch(feedUrl, attempt) {
    const response = await axios.get(feedUrl, {
      timeout: config.requestTimeoutMs,
      maxRedirects: config.maxRedirects,
      responseType: "text",
      validateStatus: (status) => status >= 200 && status < 400,
      headers: {
        "User-Agent": "Sandblast-NewsCanada/2.1",
        "Accept": "application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8"
      }
    });

    const rawXml = typeof response.data === "string" ? response.data : String(response.data || "");
    const safeXml = sanitizeXml(rawXml);
    const feed = await parser.parseString(safeXml);
    const stories = (feed.items || []).map(normalizeItem).filter((x) => x && x.title);

    cache = {
      ok: true,
      stories,
      fetchedAt: Date.now(),
      feedUrl,
      degraded: false,
      stale: false,
      source: config.source,
      lastError: "",
      lastErrorAt: 0,
      lastDiagnostics: {
        ...getDiagnosticsBase(feedUrl),
        phase: "success",
        attempt,
        storyCount: stories.length,
        fetchedAt: Date.now()
      }
    };

    return {
      ok: true,
      items: stories,
      stories,
      meta: {
        source: config.source,
        feedUrl,
        fetchedAt: cache.fetchedAt,
        storyCount: stories.length,
        degraded: false,
        stale: false,
        mode: "rss",
        attempt
      }
    };
  }

  async function fetchRSS() {
    const feedUrl = getFeedUrl();
    if (!feedUrl) {
      const message = "Missing NEWS_CANADA_FEED_URL";
      cache.lastError = message;
      cache.lastErrorAt = Date.now();
      cache.lastDiagnostics = {
        ...getDiagnosticsBase(feedUrl),
        phase: "config",
        detail: message,
        at: cache.lastErrorAt
      };
      throw new Error(message);
    }

    let lastErr = null;

    for (let attempt = 1; attempt <= config.retryAttempts; attempt += 1) {
      try {
        return await attemptFetch(feedUrl, attempt);
      } catch (err) {
        lastErr = err;
        const detail = buildErrorDetail(err);
        cache.lastError = detail;
        cache.lastErrorAt = Date.now();
        cache.lastDiagnostics = {
          ...getDiagnosticsBase(feedUrl),
          phase: "fetch_or_parse_error",
          attempt,
          detail,
          status: err && err.response && err.response.status,
          code: err && err.code,
          at: cache.lastErrorAt
        };

        logger("[Sandblast][newsCanada] fetch_or_parse_error", cache.lastDiagnostics);

        if (attempt < config.retryAttempts) {
          await sleep(config.retryDelayMs * attempt);
        }
      }
    }

    if (canServeStale()) {
      cache.degraded = true;
      cache.stale = true;
      cache.lastDiagnostics = {
        ...getDiagnosticsBase(feedUrl),
        phase: "stale_cache_fallback",
        detail: cache.lastError,
        fallbackFetchedAt: cache.fetchedAt,
        ageMs: Date.now() - cache.fetchedAt,
        storyCount: cache.stories.length,
        at: Date.now()
      };

      logger("[Sandblast][newsCanada] stale_cache_fallback", cache.lastDiagnostics);

      return {
        ok: true,
        items: cache.stories.slice(),
        stories: cache.stories.slice(),
        meta: {
          source: cache.source,
          feedUrl: cache.feedUrl || feedUrl,
          fetchedAt: cache.fetchedAt,
          storyCount: cache.stories.length,
          degraded: true,
          stale: true,
          mode: "rss",
          fallback: "stale_cache"
        }
      };
    }

    throw new Error(buildErrorDetail(lastErr));
  }

  async function getEditorsPicks(opts = {}) {
    const refresh = !!opts.refresh;
    const limit = Number(opts.limit) > 0 ? Number(opts.limit) : 0;

    if (!cache.ok || refresh) {
      await fetchRSS();
    }

    const stories = limit > 0 ? cache.stories.slice(0, limit) : cache.stories.slice();

    return {
      ok: true,
      stories,
      slides: stories,
      chips: [],
      meta: {
        source: cache.source,
        feedUrl: cache.feedUrl,
        fetchedAt: cache.fetchedAt,
        storyCount: stories.length,
        degraded: !!cache.degraded,
        stale: !!cache.stale,
        mode: "rss",
        diagnostics: cache.lastDiagnostics
      }
    };
  }

  async function getStory(lookup, opts = {}) {
    const refresh = !!opts.refresh;

    if (!cache.ok || refresh) {
      await fetchRSS();
    }

    const key = cleanText(lookup).toLowerCase();
    const story = cache.stories.find((item) =>
      [
        cleanText(item.id).toLowerCase(),
        cleanText(item.slug).toLowerCase(),
        cleanText(item.title).toLowerCase(),
        cleanText(item.url).toLowerCase()
      ].includes(key)
    );

    if (!story) {
      return {
        ok: false,
        error: "story_not_found",
        meta: {
          source: cache.source,
          feedUrl: cache.feedUrl,
          fetchedAt: cache.fetchedAt,
          degraded: !!cache.degraded,
          stale: !!cache.stale,
          diagnostics: cache.lastDiagnostics
        }
      };
    }

    return {
      ok: true,
      story,
      meta: {
        source: cache.source,
        feedUrl: cache.feedUrl,
        fetchedAt: cache.fetchedAt,
        degraded: !!cache.degraded,
        stale: !!cache.stale,
        diagnostics: cache.lastDiagnostics
      }
    };
  }

  async function prime() {
    try {
      await fetchRSS();
      return {
        ok: true,
        meta: {
          source: cache.source,
          feedUrl: cache.feedUrl,
          fetchedAt: cache.fetchedAt,
          storyCount: cache.stories.length,
          degraded: !!cache.degraded,
          stale: !!cache.stale
        }
      };
    } catch (err) {
      logger("[Sandblast][newsCanada] prime_error", {
        error: err && (err.stack || err.message || err),
        diagnostics: cache.lastDiagnostics
      });
      return {
        ok: false,
        error: cleanText(err && err.message) || "prime_failed",
        meta: {
          source: cache.source,
          feedUrl: cache.feedUrl || getFeedUrl(),
          fetchedAt: cache.fetchedAt || 0,
          storyCount: Array.isArray(cache.stories) ? cache.stories.length : 0,
          degraded: !!cache.degraded,
          stale: !!cache.stale,
          diagnostics: cache.lastDiagnostics
        }
      };
    }
  }

  async function health() {
    return {
      ok: true,
      source: cache.source,
      feedUrl: cache.feedUrl || getFeedUrl(),
      fetchedAt: cache.fetchedAt || 0,
      storyCount: Array.isArray(cache.stories) ? cache.stories.length : 0,
      degraded: !!cache.degraded,
      stale: !!cache.stale,
      lastError: cache.lastError || "",
      lastErrorAt: cache.lastErrorAt || 0,
      config: {
        requestTimeoutMs: config.requestTimeoutMs,
        parserTimeoutMs: config.parserTimeoutMs,
        retryAttempts: config.retryAttempts,
        retryDelayMs: config.retryDelayMs,
        staleTtlMs: config.staleTtlMs,
        maxRedirects: config.maxRedirects
      },
      diagnostics: cache.lastDiagnostics
    };
  }

  return {
    fetchRSS,
    getEditorsPicks,
    getStory,
    prime,
    health
  };
}

module.exports = {
  createNewsCanadaFeedService,
  fetchRSS: async function fetchRSSCompat() {
    const service = createNewsCanadaFeedService();
    return service.fetchRSS();
  }
};

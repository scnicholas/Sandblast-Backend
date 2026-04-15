"use strict";

// newsCanadaFeedService v2.1.0sb
// Hardened with: 30s timeout, retry/backoff, stale-cache fallback, tighter diagnostics

const axios = require("axios");
const Parser = require("rss-parser");

function cleanText(v) {
  return typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim();
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

function pickMediaUrl(value) {
  if (!value) return "";
  if (typeof value === "string") return cleanText(value);
  if (Array.isArray(value)) {
    for (const entry of value) {
      const picked = pickMediaUrl(entry);
      if (picked) return picked;
    }
    return "";
  }
  if (typeof value === "object") {
    return cleanText(
      value.url ||
      value.$?.url ||
      value.href ||
      value.src ||
      value._ ||
      ""
    );
  }
  return "";
}

function firstImageFromItem(item) {
  if (!item || typeof item !== "object") return "";
  return cleanText(
    pickMediaUrl(item.enclosure) ||
    pickMediaUrl(item.image) ||
    pickMediaUrl(item.thumbnail) ||
    pickMediaUrl(item.mediaThumbnail) ||
    pickMediaUrl(item.mediaContent) ||
    ""
  );
}

function stripHtml(v) {
  return cleanText(String(v || "").replace(/<[^>]*>/g, " "));
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
  const pubDate = cleanText(
    (item && item.pubDate) ||
    (item && item.isoDate) ||
    ""
  );

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

function buildErrorDetail(err) {
  return cleanText(
    err && (
      err.response?.data?.message ||
      err.response?.statusText ||
      err.message ||
      err.code ||
      "rss_fetch_failed"
    )
  ) || "rss_fetch_failed";
}

function buildErrorMeta(err) {
  return {
    detail: buildErrorDetail(err),
    code: cleanText(err && err.code),
    status: Number(err && err.response && err.response.status) || 0,
    isAxios: !!(err && err.isAxiosError),
    name: cleanText(err && err.name),
    stack: cleanText(err && err.stack)
  };
}

function createNewsCanadaFeedService(options = {}) {
  const requestTimeoutMs = Number(options.requestTimeoutMs) > 0 ? Number(options.requestTimeoutMs) : 30000;
  const parserTimeoutMs = Number(options.parserTimeoutMs) > 0 ? Number(options.parserTimeoutMs) : 30000;
  const retryCount = Number(options.retryCount) >= 0 ? Number(options.retryCount) : 2;
  const retryDelayMs = Number(options.retryDelayMs) > 0 ? Number(options.retryDelayMs) : 1200;
  const staleCacheTtlMs = Number(options.staleCacheTtlMs) > 0 ? Number(options.staleCacheTtlMs) : 30 * 60 * 1000;

  const parser = new Parser({
    timeout: parserTimeoutMs,
    ...(options.parserOptions || {})
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
    source: "rss_service",
    stale: false,
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

  function hasUsableStaleCache() {
    if (!cache.ok) return false;
    if (!Array.isArray(cache.stories) || !cache.stories.length) return false;
    if (!cache.fetchedAt) return false;
    return (Date.now() - cache.fetchedAt) <= staleCacheTtlMs;
  }

  function buildMeta(extra = {}) {
    return {
      source: cache.source,
      feedUrl: cache.feedUrl,
      fetchedAt: cache.fetchedAt,
      storyCount: Array.isArray(cache.stories) ? cache.stories.length : 0,
      degraded: !!cache.degraded,
      stale: !!cache.stale,
      lastError: cache.lastError,
      lastErrorAt: cache.lastErrorAt,
      diagnostics: cache.lastDiagnostics,
      mode: "rss",
      ...extra
    };
  }

  async function attemptFetch(feedUrl, attempt) {
    const startedAt = Date.now();
    const response = await axios.get(feedUrl, {
      timeout: requestTimeoutMs,
      maxRedirects: 5,
      responseType: "text",
      validateStatus: (status) => status >= 200 && status < 400,
      headers: {
        "User-Agent": "Sandblast-NewsCanada/2.1",
        "Accept": "application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8"
      }
    });

    const rawXml = typeof response.data === "string"
      ? response.data
      : String(response.data || "");

    const safeXml = sanitizeXml(rawXml);
    const feed = await parser.parseString(safeXml);
    const stories = (feed.items || []).map(normalizeItem).filter((x) => x && x.title);

    return {
      feed,
      stories,
      diagnostics: {
        phase: "fetch_success",
        attempt,
        feedUrl,
        durationMs: Date.now() - startedAt,
        rawLength: rawXml.length,
        safeLength: safeXml.length,
        itemCount: stories.length,
        requestTimeoutMs,
        parserTimeoutMs,
        retryCount,
        retryDelayMs,
        staleCacheTtlMs
      }
    };
  }

  async function fetchRSS() {
    const feedUrl = getFeedUrl();

    if (!feedUrl) {
      const message = "Missing NEWS_CANADA_FEED_URL";
      cache.lastError = message;
      cache.lastErrorAt = Date.now();
      cache.lastDiagnostics = { phase: "config_error", message };
      throw new Error(message);
    }

    let lastErr = null;

    for (let attempt = 0; attempt <= retryCount; attempt += 1) {
      try {
        const { stories, diagnostics } = await attemptFetch(feedUrl, attempt + 1);

        cache = {
          ok: true,
          stories,
          fetchedAt: Date.now(),
          feedUrl,
          degraded: false,
          source: "rss_service",
          stale: false,
          lastError: "",
          lastErrorAt: 0,
          lastDiagnostics: diagnostics
        };

        logger("[Sandblast][newsCanada] fetch_success", diagnostics);

        return {
          ok: true,
          items: stories,
          stories,
          meta: buildMeta({ diagnostics })
        };
      } catch (err) {
        lastErr = err;
        const errorMeta = buildErrorMeta(err);
        const diagnostics = {
          phase: "fetch_retry_error",
          attempt: attempt + 1,
          maxAttempts: retryCount + 1,
          feedUrl,
          requestTimeoutMs,
          parserTimeoutMs,
          retryDelayMs,
          staleCacheTtlMs,
          ...errorMeta
        };

        cache.lastError = diagnostics.detail;
        cache.lastErrorAt = Date.now();
        cache.lastDiagnostics = diagnostics;

        logger("[Sandblast][newsCanada] fetch_retry_error", diagnostics);

        if (attempt < retryCount) {
          await sleep(retryDelayMs * (attempt + 1));
        }
      }
    }

    if (hasUsableStaleCache()) {
      cache.degraded = true;
      cache.stale = true;
      cache.source = "rss_service_stale_cache";
      cache.feedUrl = feedUrl;
      cache.lastDiagnostics = {
        phase: "stale_cache_fallback",
        feedUrl,
        fetchedAt: cache.fetchedAt,
        ageMs: Date.now() - cache.fetchedAt,
        staleCacheTtlMs,
        retryCount,
        requestTimeoutMs,
        parserTimeoutMs,
        lastError: cache.lastError
      };

      logger("[Sandblast][newsCanada] stale_cache_fallback", cache.lastDiagnostics);

      return {
        ok: true,
        items: cache.stories.slice(),
        stories: cache.stories.slice(),
        meta: buildMeta({ servedFrom: "stale_cache" })
      };
    }

    const detail = buildErrorDetail(lastErr);
    const terminalDiagnostics = {
      phase: "fetch_failed_no_cache",
      feedUrl,
      retryCount,
      requestTimeoutMs,
      parserTimeoutMs,
      staleCacheTtlMs,
      error: detail,
      errorMeta: buildErrorMeta(lastErr)
    };

    cache.lastError = detail;
    cache.lastErrorAt = Date.now();
    cache.lastDiagnostics = terminalDiagnostics;

    logger("[Sandblast][newsCanada] fetch_failed_no_cache", terminalDiagnostics);

    throw new Error(detail);
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
      meta: buildMeta({ storyCount: stories.length })
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
        meta: buildMeta()
      };
    }

    return {
      ok: true,
      story,
      meta: buildMeta()
    };
  }

  async function prime() {
    try {
      const result = await fetchRSS();
      return {
        ok: true,
        meta: result.meta
      };
    } catch (err) {
      logger("[Sandblast][newsCanada] prime_error", {
        detail: buildErrorDetail(err),
        diagnostics: cache.lastDiagnostics
      });
      return {
        ok: false,
        error: cleanText(err && err.message) || "prime_failed",
        meta: buildMeta()
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
      lastError: cache.lastError,
      lastErrorAt: cache.lastErrorAt,
      diagnostics: cache.lastDiagnostics,
      config: {
        requestTimeoutMs,
        parserTimeoutMs,
        retryCount,
        retryDelayMs,
        staleCacheTtlMs
      }
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

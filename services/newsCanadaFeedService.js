"use strict";

const axios = require("axios");
const Parser = require("rss-parser");

function cleanText(v) {
  return typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim();
}

function toInt(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : fallback;
}

function slugify(v) {
  return cleanText(v)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

function firstImageFromItem(item) {
  if (!item || typeof item !== "object") return "";

  const mediaContent = Array.isArray(item.mediaContent)
    ? item.mediaContent[0] && item.mediaContent[0].url
    : item.mediaContent && item.mediaContent.url;

  const mediaThumbnail = Array.isArray(item.mediaThumbnail)
    ? item.mediaThumbnail[0] && item.mediaThumbnail[0].url
    : item.mediaThumbnail && item.mediaThumbnail.url;

  return cleanText(
    (item.enclosure && item.enclosure.url) ||
    item.image ||
    item.thumbnail ||
    mediaThumbnail ||
    mediaContent ||
    ""
  );
}

function stripHtml(v) {
  return cleanText(String(v || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " "));
}

function normalizeItem(item, index) {
  const title = stripHtml(item && item.title);
  const link = cleanText(item && item.link);
  const description = stripHtml(
    (item && item.contentSnippet) ||
    (item && item.content) ||
    (item && item.summary) ||
    (item && item.contentEncoded) ||
    (item && item["content:encoded"]) ||
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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function truncateForLog(v, max = 280) {
  const s = cleanText(v);
  return s.length > max ? `${s.slice(0, max)}…` : s;
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

function buildErrorMeta(err, extra = {}) {
  return {
    detail: buildErrorDetail(err),
    code: cleanText(err && err.code),
    status: err && err.response && err.response.status,
    statusText: cleanText(err && err.response && err.response.statusText),
    name: cleanText(err && err.name),
    isAxiosError: !!(err && err.isAxiosError),
    stackTop: truncateForLog(err && err.stack ? String(err.stack).split("\n").slice(0, 3).join(" | ") : ""),
    ...extra
  };
}

function createNewsCanadaFeedService(options = {}) {
  const parserTimeoutMs = toInt(
    options.parserTimeoutMs || process.env.NEWS_CANADA_PARSER_TIMEOUT_MS,
    30000
  );
  const requestTimeoutMs = toInt(
    options.requestTimeoutMs || process.env.NEWS_CANADA_REQUEST_TIMEOUT_MS,
    30000
  );
  const retryCount = toInt(
    options.retryCount || process.env.NEWS_CANADA_RETRY_COUNT,
    2
  );
  const retryDelayMs = toInt(
    options.retryDelayMs || process.env.NEWS_CANADA_RETRY_DELAY_MS,
    1200
  );
  const staleTtlMs = toInt(
    options.staleTtlMs || process.env.NEWS_CANADA_STALE_TTL_MS,
    1000 * 60 * 30
  );
  const maxItems = toInt(
    options.maxItems || process.env.NEWS_CANADA_MAX_ITEMS,
    50
  );

  const parser = new Parser({
    timeout: parserTimeoutMs,
    ...(options.parserOptions || {})
  });

  const logger =
    typeof options.logger === "function"
      ? options.logger
      : (...args) => console.log(...args);

  let cache = {
    ok: false,
    stories: [],
    fetchedAt: 0,
    feedUrl: "",
    degraded: false,
    stale: false,
    lastError: "",
    lastErrorAt: 0,
    lastDiagnostics: null,
    source: "rss_service"
  };

  function getFeedUrl() {
    return cleanText(
      process.env.NEWS_CANADA_FEED_URL ||
      process.env.NEWS_CANADA_RSS_FEED_URL ||
      process.env.SB_NEWSCANADA_RSS_FEED_URL ||
      ""
    );
  }

  function hasUsableCache() {
    return Array.isArray(cache.stories) && cache.stories.length > 0 && cache.fetchedAt > 0;
  }

  function isCacheWithinStaleWindow() {
    return hasUsableCache() && Date.now() - cache.fetchedAt <= staleTtlMs;
  }

  function buildCacheMeta(mode, extras = {}) {
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
      mode,
      ...extras
    };
  }

  async function attemptFetch(feedUrl, attemptIndex) {
    const startedAt = Date.now();
    const response = await axios.get(feedUrl, {
      timeout: requestTimeoutMs,
      maxRedirects: 5,
      responseType: "text",
      validateStatus: (status) => status >= 200 && status < 400,
      headers: {
        "User-Agent": "Sandblast-NewsCanada/1.1",
        Accept: "application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8"
      }
    });

    const rawXml = typeof response.data === "string"
      ? response.data
      : String(response.data || "");

    const safeXml = sanitizeXml(rawXml);
    const feed = await parser.parseString(safeXml);
    const items = Array.isArray(feed && feed.items) ? feed.items : [];
    const stories = items
      .map(normalizeItem)
      .filter((x) => x && x.title)
      .slice(0, maxItems > 0 ? maxItems : undefined);

    return {
      stories,
      diagnostics: {
        attempt: attemptIndex,
        httpStatus: response.status,
        durationMs: Date.now() - startedAt,
        rawBytes: Buffer.byteLength(rawXml, "utf8"),
        sanitizedBytes: Buffer.byteLength(safeXml, "utf8"),
        itemCount: items.length,
        normalizedCount: stories.length,
        parserTimeoutMs,
        requestTimeoutMs,
        retryCount,
        retryDelayMs,
        staleTtlMs
      }
    };
  }

  async function fetchRSS(opts = {}) {
    const feedUrl = getFeedUrl();
    const allowStaleOnFailure = opts.allowStaleOnFailure !== false;

    if (!feedUrl) {
      const missingErr = new Error("Missing NEWS_CANADA_FEED_URL");
      cache.lastError = missingErr.message;
      cache.lastErrorAt = Date.now();
      cache.lastDiagnostics = {
        phase: "config",
        detail: missingErr.message
      };
      throw missingErr;
    }

    let lastErr = null;

    for (let attempt = 0; attempt <= retryCount; attempt += 1) {
      try {
        const result = await attemptFetch(feedUrl, attempt + 1);

        cache = {
          ok: true,
          stories: result.stories,
          fetchedAt: Date.now(),
          feedUrl,
          degraded: false,
          stale: false,
          lastError: "",
          lastErrorAt: 0,
          lastDiagnostics: {
            phase: "success",
            ...result.diagnostics
          },
          source: "rss_service"
        };

        logger("[Sandblast][newsCanada] fetch_success", {
          feedUrl,
          ...result.diagnostics
        });

        return {
          ok: true,
          items: result.stories,
          stories: result.stories,
          meta: buildCacheMeta("rss", {
            fromCache: false,
            attemptCount: attempt + 1
          })
        };
      } catch (err) {
        lastErr = err;
        const errorMeta = buildErrorMeta(err, {
          phase: "fetch_or_parse",
          attempt: attempt + 1,
          maxAttempts: retryCount + 1,
          feedUrl,
          requestTimeoutMs,
          parserTimeoutMs
        });

        logger("[Sandblast][newsCanada] fetch_attempt_failed", errorMeta);

        cache.lastError = errorMeta.detail;
        cache.lastErrorAt = Date.now();
        cache.lastDiagnostics = errorMeta;
        cache.feedUrl = feedUrl;

        if (attempt < retryCount) {
          await sleep(retryDelayMs * (attempt + 1));
        }
      }
    }

    if (allowStaleOnFailure && isCacheWithinStaleWindow()) {
      cache.ok = true;
      cache.degraded = true;
      cache.stale = true;
      cache.source = "rss_service_stale_cache";

      logger("[Sandblast][newsCanada] serving_stale_cache", {
        feedUrl,
        ageMs: Date.now() - cache.fetchedAt,
        storyCount: cache.stories.length,
        staleTtlMs,
        lastError: cache.lastError
      });

      return {
        ok: true,
        items: cache.stories,
        stories: cache.stories,
        meta: buildCacheMeta("rss_stale_fallback", {
          fromCache: true,
          ageMs: Date.now() - cache.fetchedAt,
          fallbackReason: cache.lastError
        })
      };
    }

    throw new Error(buildErrorDetail(lastErr));
  }

  async function ensureData(opts = {}) {
    const refresh = !!opts.refresh;

    if (!cache.ok || refresh) {
      await fetchRSS({ allowStaleOnFailure: true });
      return;
    }

    if (!cache.degraded && isCacheWithinStaleWindow()) {
      return;
    }

    if (!refresh && hasUsableCache()) {
      return;
    }

    await fetchRSS({ allowStaleOnFailure: true });
  }

  async function getEditorsPicks(opts = {}) {
    const limit = Number(opts.limit) > 0 ? Number(opts.limit) : 0;

    await ensureData(opts);

    const stories = limit > 0 ? cache.stories.slice(0, limit) : cache.stories.slice();

    return {
      ok: true,
      stories,
      slides: stories,
      chips: [],
      meta: buildCacheMeta(cache.stale ? "rss_stale_fallback" : "rss", {
        requestedLimit: limit || null,
        returnedCount: stories.length
      })
    };
  }

  async function getStory(lookup, opts = {}) {
    await ensureData(opts);

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
        meta: buildCacheMeta(cache.stale ? "rss_stale_fallback" : "rss")
      };
    }

    return {
      ok: true,
      story,
      meta: buildCacheMeta(cache.stale ? "rss_stale_fallback" : "rss")
    };
  }

  async function prime() {
    try {
      await fetchRSS({ allowStaleOnFailure: true });
      return {
        ok: true,
        meta: buildCacheMeta(cache.stale ? "rss_stale_fallback" : "rss")
      };
    } catch (err) {
      logger("[Sandblast][newsCanada] prime_error", buildErrorMeta(err, { phase: "prime" }));
      return {
        ok: false,
        error: cleanText(err && err.message) || "prime_failed",
        meta: buildCacheMeta("prime_error")
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
        parserTimeoutMs,
        requestTimeoutMs,
        retryCount,
        retryDelayMs,
        staleTtlMs,
        maxItems
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
    return service.fetchRSS({ allowStaleOnFailure: true });
  }
};

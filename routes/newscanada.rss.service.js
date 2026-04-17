"use strict";

const Parser = require("rss-parser");

function cleanText(v) {
  return typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim();
}

function clipText(v, max) {
  const s = cleanText(v);
  const n = Number.isFinite(Number(max)) ? Number(max) : 320;
  return s && s.length > n ? `${s.slice(0, n).trim()}…` : s;
}

function slugify(v) {
  return cleanText(v)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

function firstString(arr) {
  for (const v of Array.isArray(arr) ? arr : []) {
    const s = cleanText(v);
    if (s) return s;
  }
  return "";
}

function firstImageFromItem(item) {
  if (!item || typeof item !== "object") return "";
  const mediaContent = Array.isArray(item.mediaContent) ? item.mediaContent[0] : item.mediaContent;
  const mediaThumbnail = Array.isArray(item.mediaThumbnail) ? item.mediaThumbnail[0] : item.mediaThumbnail;
  return firstString([
    item.enclosure && item.enclosure.url,
    item.image,
    item.thumbnail,
    mediaThumbnail && (mediaThumbnail.url || mediaThumbnail.$ && mediaThumbnail.$.url),
    mediaContent && (mediaContent.url || mediaContent.$ && mediaContent.$.url)
  ]);
}

function getFeedUrl() {
  return cleanText(
    process.env.NEWS_CANADA_FEED_URL ||
    process.env.NEWS_CANADA_RSS_FEED_URL ||
    process.env.SB_NEWSCANADA_RSS_FEED_URL ||
    ""
  );
}

function normalizeItem(item, index, feedUrl) {
  const title = cleanText(item && item.title) || `Story ${index + 1}`;
  const link = firstString([item && item.link, item && item.guid]);
  const description = clipText(
    firstString([
      item && item.contentSnippet,
      item && item.content,
      item && item.summary,
      item && item.contentEncoded
    ]),
    320
  );
  const pubDate = firstString([item && item.pubDate, item && item.isoDate]);
  const image = firstImageFromItem(item);

  const id = firstString([item && item.guid, link]) || `rss-${index}`;
  const slug = slugify(title) || slugify(link) || `rss-${index}`;

  return {
    id,
    guid: id,
    slug,
    title,
    headline: title,
    description,
    summary: description,
    body: description,
    content: description,
    link,
    url: link,
    sourceUrl: link,
    canonicalUrl: link,
    pubDate,
    publishedAt: pubDate,
    image,
    popupImage: image,
    popupBody: description,
    ctaText: "Read story",
    source: "News Canada",
    sourceName: "News Canada",
    chipLabel: "News Canada",
    parserMode: "rss_parser",
    feedUrl,
    isActive: true
  };
}

function createNewsCanadaFeedService(options = {}) {
  const parser = new Parser({
    timeout: Number(options.timeoutMs) > 0 ? Number(options.timeoutMs) : 10000,
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
    source: "rss_service",
    detail: ""
  };

  async function fetchRSS(opts = {}) {
    const feedUrl = getFeedUrl();
    if (!feedUrl) {
      throw new Error("Missing NEWS_CANADA_FEED_URL");
    }

    try {
      const feed = await parser.parseURL(feedUrl);
      const stories = (feed.items || [])
        .map((item, index) => normalizeItem(item, index, feedUrl))
        .filter((x) => x && x.title);

      cache = {
        ok: stories.length > 0,
        stories,
        fetchedAt: Date.now(),
        feedUrl,
        degraded: stories.length === 0,
        source: "rss_service",
        detail: stories.length ? "" : "rss_returned_no_items"
      };

      return {
        ok: stories.length > 0,
        items: stories,
        stories,
        meta: {
          source: "rss_service",
          feedUrl,
          fetchedAt: cache.fetchedAt,
          storyCount: stories.length,
          itemCount: stories.length,
          degraded: cache.degraded,
          mode: "rss",
          parserMode: "rss_parser",
          detail: cache.detail
        }
      };
    } catch (err) {
      logger("[Sandblast][newsCanada.rss.service][fetch:error]", err && (err.stack || err.message || err));

      if (cache.ok && Array.isArray(cache.stories) && cache.stories.length) {
        return {
          ok: true,
          items: cache.stories.slice(),
          stories: cache.stories.slice(),
          meta: {
            source: "rss_service_cache",
            feedUrl: cache.feedUrl || feedUrl,
            fetchedAt: cache.fetchedAt,
            storyCount: cache.stories.length,
            itemCount: cache.stories.length,
            degraded: true,
            stale: true,
            mode: "rss",
            parserMode: "rss_parser",
            detail: cleanText(err && err.message) || "rss_fetch_failed_using_cache"
          }
        };
      }

      throw err;
    }
  }

  async function getEditorsPicks(opts = {}) {
    const refresh = !!(opts && opts.refresh);
    const limit = Number(opts && opts.limit) > 0 ? Number(opts.limit) : 0;

    if (!cache.ok || refresh) {
      await fetchRSS(opts);
    }

    const stories = limit > 0 ? cache.stories.slice(0, limit) : cache.stories.slice();

    return {
      ok: stories.length > 0,
      stories,
      slides: stories,
      chips: stories.map((story) => ({
        id: story.id,
        label: story.chipLabel || "News Canada",
        title: story.title
      })),
      meta: {
        source: cache.source,
        feedUrl: cache.feedUrl,
        fetchedAt: cache.fetchedAt,
        storyCount: stories.length,
        degraded: !!cache.degraded,
        mode: "rss"
      }
    };
  }

  async function getStory(lookup, opts = {}) {
    const refresh = !!(opts && opts.refresh);
    if (!cache.ok || refresh) {
      await fetchRSS(opts);
    }

    const key = cleanText(lookup).toLowerCase();
    const story = cache.stories.find((item) =>
      [item.id, item.slug, item.title, item.url, item.link]
        .map((v) => cleanText(v).toLowerCase())
        .includes(key)
    );

    if (!story) {
      return {
        ok: false,
        error: "story_not_found",
        meta: {
          source: cache.source,
          feedUrl: cache.feedUrl,
          fetchedAt: cache.fetchedAt,
          degraded: !!cache.degraded
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
        degraded: !!cache.degraded
      }
    };
  }

  async function prime(opts = {}) {
    try {
      await fetchRSS(opts);
      return { ok: true };
    } catch (err) {
      logger("[Sandblast][newsCanada.rss.service][prime:error]", err && (err.stack || err.message || err));
      return { ok: false, error: cleanText(err && err.message) || "prime_failed" };
    }
  }

  async function health() {
    return {
      ok: cache.ok,
      source: "rss_service",
      feedUrl: cache.feedUrl || getFeedUrl(),
      fetchedAt: cache.fetchedAt || 0,
      storyCount: Array.isArray(cache.stories) ? cache.stories.length : 0,
      degraded: !!cache.degraded,
      detail: cache.detail || ""
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
  fetchRSS: async function fetchRSSCompat(opts = {}) {
    const service = createNewsCanadaFeedService();
    return service.fetchRSS(opts);
  }
};

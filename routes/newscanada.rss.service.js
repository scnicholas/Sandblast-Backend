"use strict";

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

function firstImageFromItem(item) {
  if (!item || typeof item !== "object") return "";
  return cleanText(
    (item.enclosure && item.enclosure.url) ||
    item.image ||
    item.thumbnail ||
    item.mediaThumbnail ||
    item.mediaContent ||
    ""
  );
}

function normalizeItem(item, index) {
  const title = cleanText(item && item.title);
  const link = cleanText(item && item.link);
  const description = cleanText(
    (item && item.contentSnippet) ||
    (item && item.content) ||
    (item && item.summary) ||
    ""
  );
  const pubDate = cleanText(
    (item && item.pubDate) ||
    (item && item.isoDate) ||
    ""
  );

  const id =
    cleanText(item && item.guid) ||
    link ||
    `rss-${index}`;

  const slug =
    slugify(title) ||
    slugify(link) ||
    `rss-${index}`;

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

function createNewsCanadaFeedService(options = {}) {
  const parser = new Parser({
    timeout: 10000,
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

  async function fetchRSS() {
    const feedUrl = getFeedUrl();

    if (!feedUrl) {
      throw new Error("Missing NEWS_CANADA_FEED_URL");
    }

    const feed = await parser.parseURL(feedUrl);

    const stories = (feed.items || []).map(normalizeItem).filter((x) => x && x.title);

    cache = {
      ok: true,
      stories,
      fetchedAt: Date.now(),
      feedUrl,
      degraded: false,
      source: "rss_service"
    };

    return {
      ok: true,
      items: stories,
      stories,
      meta: {
        source: "rss_service",
        feedUrl,
        fetchedAt: cache.fetchedAt,
        storyCount: stories.length,
        degraded: false,
        mode: "rss"
      }
    };
  }

  async function getEditorsPicks(opts = {}) {
    const refresh = !!(opts && opts.refresh);
    const limit = Number(opts && opts.limit) > 0 ? Number(opts.limit) : 0;

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
        mode: "rss"
      }
    };
  }

  async function getStory(lookup, opts = {}) {
    const refresh = !!(opts && opts.refresh);

    if (!cache.ok || refresh) {
      await fetchRSS();
    }

    const key = cleanText(lookup).toLowerCase();

    const story = cache.stories.find((item) => {
      return [
        cleanText(item.id).toLowerCase(),
        cleanText(item.slug).toLowerCase(),
        cleanText(item.title).toLowerCase(),
        cleanText(item.url).toLowerCase()
      ].includes(key);
    });

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

  async function prime() {
    try {
      await fetchRSS();
      return { ok: true };
    } catch (err) {
      logger("[Sandblast][newsCanada] prime_error", err && (err.stack || err.message || err));
      return { ok: false, error: cleanText(err && err.message) || "prime_failed" };
    }
  }

  async function health() {
    return {
      ok: true,
      source: "rss_service",
      feedUrl: cache.feedUrl || getFeedUrl(),
      fetchedAt: cache.fetchedAt || 0,
      storyCount: Array.isArray(cache.stories) ? cache.stories.length : 0,
      degraded: !!cache.degraded
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
<<<<<<< HEAD
};
=======
};
>>>>>>> 078f7f11 (Add News Canada RSS service and rss-parser)

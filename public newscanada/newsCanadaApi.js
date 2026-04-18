"use strict";

const Parser = require("rss-parser");

function cleanText(value) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : value == null ? "" : String(value).replace(/\s+/g, " ").trim();
}

function clamp(n, min, max) {
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : min;
}

function stripHtml(html) {
  return cleanText(String(html || "").replace(/<[^>]*>/g, " ").replace(/&nbsp;/gi, " "));
}

function toSlug(value) {
  return cleanText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

function normalizeImage(item) {
  if (!item || typeof item !== "object") return "";
  const mediaContent = Array.isArray(item["media:content"]) ? item["media:content"] : [];
  const mediaThumbnail = Array.isArray(item["media:thumbnail"]) ? item["media:thumbnail"] : [];
  return cleanText(
    (item.enclosure && item.enclosure.url) ||
    (item.image && item.image.url) ||
    (mediaContent[0] && mediaContent[0].$.url) ||
    (mediaThumbnail[0] && mediaThumbnail[0].$.url) ||
    ""
  );
}

function normalizeStory(item, index) {
  const title = cleanText(item && item.title);
  const url = cleanText(item && item.link);
  const summary = stripHtml((item && (item.contentSnippet || item.summary || item.content || item["content:encoded"])) || "");
  const publishedAt = cleanText((item && (item.isoDate || item.pubDate)) || "");
  const id = cleanText((item && (item.guid || item.id || item.link)) || `rss-${index}`);
  const slug = toSlug(title || id || `story-${index}`);
  const image = normalizeImage(item);

  return {
    id,
    slug,
    title,
    summary,
    description: summary,
    body: summary,
    content: summary,
    popupBody: summary,
    url,
    link: url,
    image,
    popupImage: image,
    pubDate: publishedAt,
    isoDate: publishedAt,
    source: cleanText((item && (item.creator || item.author)) || "For Your Life") || "For Your Life",
    sourceName: "For Your Life",
    category: "For Your Life",
    chipLabel: "News Canada",
    ctaText: "Read full story",
    feedUrl: "https://foryourlife.ca/feed/",
    popupImage: image,
    popupBody: summary,
    isActive: true
  };
}

function createNewsCanadaFeedService(options = {}) {
  const logger = typeof options.logger === "function" ? options.logger : () => {};
  const parser = new Parser({ timeout: clamp(Number(options.timeoutMs || 10000), 3000, 30000) });
  const cache = {
    fetchedAt: 0,
    stories: [],
    ttlMs: clamp(Number(options.ttlMs || process.env.NEWS_CANADA_CACHE_TTL_MS || 15 * 60 * 1000), 30 * 1000, 60 * 60 * 1000),
    feedUrl: "",
    mode: "rss",
    source: "rss_service",
    degraded: false,
    lastError: ""
  };

  function getFeedUrl() {
    return cleanText(
      options.feedUrl ||
      process.env.NEWS_CANADA_FEED_URL ||
      process.env.NEWS_CANADA_RSS_FEED_URL ||
      process.env.SB_NEWSCANADA_RSS_FEED_URL ||
      "https://foryourlife.ca/feed/"
    );
  }

  async function refresh(force = false) {
    const feedUrl = getFeedUrl();
    if (!feedUrl) {
      const error = new Error("Missing News Canada RSS feed URL");
      error.code = "missing_feed_url";
      throw error;
    }

    const freshEnough = !force && cache.stories.length > 0 && Date.now() - cache.fetchedAt < cache.ttlMs;
    if (freshEnough) {
      return {
        ok: true,
        stories: cache.stories,
        meta: {
          source: cache.source,
          mode: cache.mode,
          feedUrl: cache.feedUrl,
          fetchedAt: cache.fetchedAt,
          storyCount: cache.stories.length,
          degraded: cache.degraded,
          cacheHit: true
        }
      };
    }

    try {
      const feed = await parser.parseURL(feedUrl);
      const items = Array.isArray(feed && feed.items) ? feed.items : [];
      const stories = items.map(normalizeStory).filter((story) => story.title && story.url);
      cache.fetchedAt = Date.now();
      cache.stories = stories;
      cache.feedUrl = feedUrl;
      cache.mode = "rss";
      cache.source = cleanText((feed && feed.title) || "rss_service") || "rss_service";
      cache.degraded = false;
      cache.lastError = "";
      return {
        ok: true,
        stories,
        meta: {
          source: cache.source,
          mode: cache.mode,
          feedUrl: cache.feedUrl,
          fetchedAt: cache.fetchedAt,
          storyCount: stories.length,
          degraded: false,
          cacheHit: false
        }
      };
    } catch (error) {
      cache.degraded = true;
      cache.lastError = cleanText(error && (error.message || error.code || "rss_fetch_failed"));
      logger("[Sandblast][newsCanadaApi] rss_fetch_failed", cache.lastError);
      if (cache.stories.length > 0) {
        return {
          ok: true,
          stories: cache.stories,
          meta: {
            source: cache.source || "rss_service",
            mode: "rss",
            feedUrl,
            fetchedAt: cache.fetchedAt,
            storyCount: cache.stories.length,
            degraded: true,
            cacheHit: true,
            stale: true,
            error: cache.lastError
          }
        };
      }
      throw error;
    }
  }

  async function fetchRSS(options = {}) {
    const result = await refresh(!!options.refresh);
    return {
      ok: result.ok,
      items: result.stories.map((story) => ({
        id: story.id,
        guid: story.id,
        slug: story.slug,
        title: story.title,
        headline: story.title,
        description: story.summary,
        summary: story.summary,
        body: story.body,
        content: story.content,
        popupBody: story.popupBody,
        link: story.url,
        url: story.url,
        pubDate: story.pubDate,
        publishedAt: story.pubDate,
        image: story.image,
        popupImage: story.popupImage,
        chipLabel: story.chipLabel,
        ctaText: story.ctaText,
        source: story.source,
        sourceName: story.sourceName,
        feedUrl: story.feedUrl,
        isActive: story.isActive
      })),
      meta: result.meta
    };
  }

  async function getEditorsPicks(options = {}) {
    const result = await refresh(!!options.refresh);
    const limit = clamp(Number(options.limit || result.stories.length || 12), 1, 50);
    const stories = result.stories.slice(0, limit);
    return {
      ok: true,
      stories,
      slides: stories,
      chips: stories.slice(0, 6).map((story) => ({
        id: story.id,
        label: story.title,
        slug: story.slug,
        url: story.url
      })),
      meta: {
        ...result.meta,
        storyCount: stories.length
      }
    };
  }

  async function getStory(lookup, options = {}) {
    const result = await refresh(!!options.refresh);
    const key = cleanText(lookup).toLowerCase();
    const story = result.stories.find((entry) => {
      const title = cleanText(entry.title).toLowerCase();
      const id = cleanText(entry.id).toLowerCase();
      const slug = cleanText(entry.slug).toLowerCase();
      const url = cleanText(entry.url).toLowerCase();
      return !key || key === id || key === slug || key === url || title.includes(key);
    });

    if (!story) {
      return {
        ok: false,
        error: "story_not_found",
        meta: result.meta
      };
    }

    return {
      ok: true,
      story,
      meta: result.meta
    };
  }

  async function prime() {
    return refresh(false);
  }

  function health() {
    return {
      ok: !!cache.feedUrl || !!getFeedUrl(),
      source: cache.source || "rss_service",
      degraded: cache.degraded,
      mode: cache.mode,
      feedUrl: cache.feedUrl || getFeedUrl(),
      fetchedAt: cache.fetchedAt,
      storyCount: cache.stories.length,
      lastError: cache.lastError,
      stableRoutes: {
        rss: "/api/newscanada/rss",
        editorsPicks: "/api/newscanada/editors-picks",
        editorsPicksMeta: "/api/newscanada/editors-picks/meta",
        story: "/api/newscanada/story",
        manualCompat: "/api/newscanada/manual"
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
  createNewsCanadaFeedService
};

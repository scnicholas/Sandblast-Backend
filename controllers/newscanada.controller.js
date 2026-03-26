"use strict";

const MAX_EDITORS_PICKS = 12;
const FALLBACK_URL = "https://www.newscanada.com/home";

const SAMPLE_STORIES = [
  {
    id: "sample-1",
    title: "News Canada Feature One",
    summary: "Fallback editor’s pick payload so the carousel stays visible while upstream feed work is stabilized.",
    body: "This fallback story keeps the Sandblast News Canada surface alive while the upstream feed is being refreshed. The pipeline now expects a stable full-story contract, not a thin summary payload.",
    url: FALLBACK_URL,
    issue: "Editor’s Pick",
    categories: ["Canada", "News"],
    images: [],
    publishedAt: "",
    author: ""
  },
  {
    id: "sample-2",
    title: "News Canada Feature Two",
    summary: "This controller preserves a clean frontend contract by always returning an array of usable story objects.",
    body: "The backend now returns normalized stories with body, summary, images, author, and publication metadata so the widget can render directly without multi-step reconstruction.",
    url: FALLBACK_URL,
    issue: "Top Story",
    categories: ["Features", "Editorial"],
    images: [],
    publishedAt: "",
    author: ""
  }
];

function safeStr(v) {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}

function cleanText(v) {
  return safeStr(v).replace(/\s+/g, " ").trim();
}

function cleanLongText(v) {
  return safeStr(v).replace(/\r/g, "").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

function normalizeImageEntry(entry) {
  if (typeof entry === "string") {
    const src = cleanText(entry);
    return src ? { src, alt: "", caption: "" } : null;
  }
  if (!entry || typeof entry !== "object") return null;
  const src = cleanText(entry.src || entry.url || entry.image || entry.href || "");
  if (!src) return null;
  return {
    src,
    alt: cleanText(entry.alt || entry.title || entry.caption || ""),
    caption: cleanText(entry.caption || "")
  };
}

function normalizeImages(item) {
  const input = [];
  if (Array.isArray(item && item.images)) input.push(...item.images);
  if (Array.isArray(item && item.media)) input.push(...item.media);
  if (item && item.image) input.push(item.image);
  if (item && item.heroImage) input.push(item.heroImage);
  if (item && item.thumbnail) input.push(item.thumbnail);

  const seen = new Set();
  return input.map(normalizeImageEntry).filter((entry) => {
    if (!entry || !entry.src) return false;
    const key = entry.src.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizeCategories(item) {
  const source = Array.isArray(item && item.categories)
    ? item.categories
    : Array.isArray(item && item.tags)
      ? item.tags
      : Array.isArray(item && item.topics)
        ? item.topics
        : Array.isArray(item && item.sections)
          ? item.sections
          : [];
  return source.map(cleanText).filter(Boolean).slice(0, 4);
}

function buildId(item, url, title, index) {
  const preferred = cleanText(item && (item.id || item.storyId || item.slug || item.guid || ""));
  if (preferred) return preferred;
  const seed = url || cleanText(title) || String(index || "story");
  return seed.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || `story-${index || 0}`;
}

function normalizeItem(item, index) {
  if (!item || typeof item !== "object") return null;

  const title = cleanText(
    item.title ||
    item.headline ||
    item.name ||
    item.storyTitle ||
    item.storyHeadline ||
    ""
  );

  const url = cleanText(
    item.url ||
    item.link ||
    item.href ||
    item.storyUrl ||
    item.canonicalUrl ||
    item.permalink ||
    ""
  );

  if (!title) return null;

  const body = cleanLongText(
    item.body ||
    item.content ||
    item.story ||
    item.fullText ||
    item.articleBody ||
    item.text ||
    item.summary ||
    item.excerpt ||
    ""
  );

  const summary = cleanText(
    item.summary ||
    item.description ||
    item.excerpt ||
    item.deck ||
    item.body ||
    item.content ||
    body.slice(0, 280)
  );

  const issue = cleanText(item.issue || item.kicker || item.section || item.categoryLabel || "Editor's Pick");

  const images = normalizeImages(item);
  const fallbackImage =
    cleanText(item.image) ||
    cleanText(item.thumbnail) ||
    cleanText(item.heroImage && (item.heroImage.url || item.heroImage.src)) ||
    (images[0] && images[0].src) ||
    "";

  const resolvedUrl = url || cleanText(item.sourceUrl || item.homeUrl || FALLBACK_URL);

  return {
    id: buildId(item, resolvedUrl, title, index),
    title,
    summary,
    body,
    content: body,
    url: resolvedUrl,
    issue,
    categories: normalizeCategories(item),
    images,
    image: fallbackImage,
    heroImage: fallbackImage ? { url: fallbackImage, alt: title, caption: "" } : null,
    publishedAt: cleanText(item.publishedAt || item.publishDate || item.date || item.scrapedAt || ""),
    author: cleanText(item.author || item.byline || item.creator || item.source || ""),
    keywords: Array.isArray(item && item.keywords) ? item.keywords.map(cleanText).filter(Boolean).slice(0, 8) : []
  };
}

function extractList(payload) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== "object") return [];

  const buckets = [
    payload.items,
    payload.stories,
    payload.articles,
    payload.results,
    payload.feed,
    payload.entries,
    payload.data && payload.data.items,
    payload.data && payload.data.stories,
    payload.data && payload.data.articles,
    payload.payload && payload.payload.items,
    payload.payload && payload.payload.stories,
    payload.payload && payload.payload.articles
  ];

  for (const bucket of buckets) {
    if (Array.isArray(bucket)) return bucket;
  }

  if (payload.data && typeof payload.data === "object") {
    const nested = extractList(payload.data);
    if (nested.length) return nested;
  }

  if (payload.payload && typeof payload.payload === "object") {
    const nested = extractList(payload.payload);
    if (nested.length) return nested;
  }

  return [];
}

function isRenderableStory(item) {
  if (!item || typeof item !== "object") return false;
  if (!cleanText(item.title)) return false;
  if (!cleanText(item.url)) return false;
  if (!cleanText(item.summary) && !cleanText(item.body) && !cleanText(item.content)) return false;
  return true;
}

function normalizePayload(payload) {
  return extractList(payload)
    .map(normalizeItem)
    .filter(isRenderableStory)
    .slice(0, MAX_EDITORS_PICKS);
}

function getUpstreamStories(req) {
  const locals = req.app && req.app.locals ? req.app.locals : {};

  const sources = [
    locals.newsCanadaEditorsPicks,
    locals.newsCanadaStories,
    locals.newsCanadaFeed,
    locals.newsCanadaPayload,
    locals.newsCanadaData,
    locals.newsCanada && locals.newsCanada.editorsPicks,
    locals.newsCanada && locals.newsCanada.stories,
    locals.newsCanada && locals.newsCanada.feed
  ];

  for (const source of sources) {
    const normalized = normalizePayload(source);
    if (normalized.length) {
      return source;
    }
  }

  return locals.newsCanadaEditorsPicks || locals.newsCanadaStories || locals.newsCanadaFeed || locals.newsCanadaPayload || locals.newsCanadaData || [];
}

function findStory(normalized, query) {
  const byId = cleanText(query && query.id);
  const byUrl = cleanText(query && (query.url || query.storyUrl || query.href));
  if (byId) {
    const found = normalized.find((item) => item.id === byId);
    if (found) return found;
  }
  if (byUrl) {
    const found = normalized.find((item) => item.url === byUrl);
    if (found) return found;
  }
  return null;
}

async function getEditorsPicks(req, res) {
  try {
    const upstream = getUpstreamStories(req);
    const normalized = normalizePayload(upstream);

    console.log("[Sandblast][newsCanada:editors-picks]", {
      upstreamType: Array.isArray(upstream) ? "array" : typeof upstream,
      rawKeys: upstream && typeof upstream === "object" && !Array.isArray(upstream) ? Object.keys(upstream).slice(0, 12) : [],
      normalizedCount: normalized.length,
      firstStory: normalized[0] ? { id: normalized[0].id, title: normalized[0].title, url: normalized[0].url } : null,
      usingFallback: !normalized.length
    });

    return res.status(200).json(normalized.length ? normalized : SAMPLE_STORIES);
  } catch (err) {
    console.log("[Sandblast][newsCanadaController:error]", err && (err.stack || err.message || err));
    return res.status(500).json({ ok: false, error: "news_canada_controller_failed", detail: cleanText((err && (err.message || err)) || "controller failure") });
  }
}

async function getStory(req, res) {
  try {
    const normalized = normalizePayload(getUpstreamStories(req));
    const story = findStory(normalized, req.query || {});
    if (story) return res.status(200).json({ ok: true, story });
    return res.status(404).json({ ok: false, error: "news_canada_story_not_found", detail: "No matching story was found for the requested id or url." });
  } catch (err) {
    console.log("[Sandblast][newsCanadaStory:error]", err && (err.stack || err.message || err));
    return res.status(500).json({ ok: false, error: "news_canada_story_failed", detail: cleanText((err && (err.message || err)) || "story failure") });
  }
}

function getHealth(req, res) {
  const normalized = normalizePayload(getUpstreamStories(req));
  return res.status(200).json({
    ok: true,
    route: "/api/newscanada/editors-picks",
    storyRoute: "/api/newscanada/story",
    fallbackStories: SAMPLE_STORIES.length,
    availableStories: normalized.length,
    usingFallback: !normalized.length
  });
}

module.exports = { getEditorsPicks, getStory, getHealth, normalizePayload, normalizeItem, extractList, isRenderableStory };

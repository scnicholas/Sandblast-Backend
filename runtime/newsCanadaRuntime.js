"use strict";

module.exports = function createNewsCanadaRuntime(opts) {
  const app = opts.app;
  const fs = opts.fs;
  const path = opts.path;
  const baseDir = opts.baseDir || process.cwd();
  const cwd = opts.cwd || process.cwd();
  const indexVersion = opts.indexVersion || "index.js";
  const refreshMs = Math.max(15000, Number(opts.refreshMs || 60000));

  const contractVersion = "news-canada-editors-picks-v2";
  const fallbackUrl = "https://www.newscanada.com/home";
  const fallbackImage = "";
  let refreshStarted = false;
  let refreshTimer = null;

  const lastGood = {
    stories: [],
    file: "",
    loadedAt: 0,
    rawShape: "",
    rawKeys: [],
    source: ""
  };

  const staticFallback = [
    {
      id: "fallback-1",
      title: "News Canada Feature One",
      summary: "Fallback editor’s pick payload so the carousel stays visible while upstream feed work is stabilized.",
      body: "This fallback story keeps the Sandblast News Canada surface alive while the upstream feed is being refreshed. The runtime now protects against feed shape drift and empty-state serving.",
      url: "https://www.newscanada.com/",
      issue: "Editor’s Pick",
      categories: ["Canada", "News"],
      image: ""
    },
    {
      id: "fallback-2",
      title: "News Canada Feature Two",
      summary: "This controller preserves a clean frontend contract by always returning an array of usable story objects.",
      body: "The News Canada runtime now serves a stable contract, keeps a last-known-good cache, and degrades gracefully instead of blanking the carousel.",
      url: "https://www.newscanada.com/",
      issue: "Top Story",
      categories: ["Features", "Editorial"],
      image: ""
    }
  ];

  function safeStr(v) {
    return typeof v === "string" ? v : v == null ? "" : String(v);
  }

  function cleanText(v) {
    return safeStr(v).replace(/\s+/g, " ").trim();
  }

  function now() {
    return Date.now();
  }

  function lower(v) {
    return cleanText(v).toLowerCase();
  }

  function isObj(v) {
    return !!v && typeof v === "object" && !Array.isArray(v);
  }

  function clamp(n, min, max) {
    if (!Number.isFinite(n)) return min;
    return Math.max(min, Math.min(max, n));
  }

  function clipText(v, max) {
    const s = cleanText(v);
    const n = clamp(Number(max || 280), 32, 4000);
    return s.length > n ? `${s.slice(0, n)}…` : s;
  }

  function initLocals() {
    app.locals.newsCanadaEditorsPicks = [];
    app.locals.newsCanadaStories = [];
    app.locals.newsCanadaFeed = [];
    app.locals.newsCanadaPayload = null;
    app.locals.newsCanadaData = null;
    app.locals.newsCanadaEditorsPicksMeta = {
      ok: false,
      degraded: false,
      source: "bootstrap",
      contractVersion,
      file: "",
      count: 0,
      loadedAt: 0,
      sourceShape: "",
      rawKeys: []
    };
  }

  function summarizeShape(parsed) {
    if (Array.isArray(parsed)) return "array";
    if (!isObj(parsed)) return typeof parsed;
    const topKeys = Object.keys(parsed).slice(0, 8);
    return topKeys.length ? `object:${topKeys.join(",")}` : "object";
  }

  function cloneStories(list) {
    return Array.isArray(list) ? list.map((item) => ({ ...item })) : [];
  }

  function normalizeImageLike(entry, title) {
    if (!entry) return null;
    if (typeof entry === "string") {
      const url = cleanText(entry);
      if (!url) return null;
      return { url, alt: title || "", caption: "" };
    }
    if (!isObj(entry)) return null;
    const url = cleanText(entry.url || entry.src || entry.image || entry.href || "");
    if (!url) return null;
    return {
      url,
      alt: cleanText(entry.alt || entry.title || title || ""),
      caption: cleanText(entry.caption || "")
    };
  }

  function normalizeStory(item, index) {
    if (!isObj(item)) return null;

    const title = cleanText(item.title || item.headline || item.name || item.storyTitle || item.storyHeadline || "");
    const summary = cleanText(item.summary || item.description || item.excerpt || item.deck || item.body || item.content || item.text || item.fullText || "");
    const body = typeof item.body === "string"
      ? item.body.trim()
      : (typeof item.content === "string" ? item.content.trim() : (typeof item.fullText === "string" ? item.fullText.trim() : (typeof item.text === "string" ? item.text.trim() : "")));

    const url = cleanText(
      item.url ||
      item.link ||
      item.href ||
      item.storyUrl ||
      item.canonicalUrl ||
      item.permalink ||
      item.sourceUrl ||
      fallbackUrl
    );

    if (!title) return null;

    const rawImages = [];
    if (Array.isArray(item.images)) rawImages.push(...item.images);
    if (Array.isArray(item.media)) rawImages.push(...item.media);
    if (item.image) rawImages.push(item.image);
    if (item.heroImage) rawImages.push(item.heroImage);
    if (item.thumbnail) rawImages.push(item.thumbnail);

    const seenImages = new Set();
    const images = rawImages
      .map((entry) => normalizeImageLike(entry, title))
      .filter((entry) => {
        if (!entry || !entry.url) return false;
        const key = entry.url.toLowerCase();
        if (seenImages.has(key)) return false;
        seenImages.add(key);
        return true;
      });

    const categoriesSource = Array.isArray(item.categories)
      ? item.categories
      : Array.isArray(item.tags)
        ? item.tags
        : Array.isArray(item.topics)
          ? item.topics
          : Array.isArray(item.sections)
            ? item.sections
            : [];

    const categories = categoriesSource.map(cleanText).filter(Boolean).slice(0, 6);
    const primaryImage = images[0] && images[0].url ? images[0].url : cleanText(item.image || "");
    const resolvedSummary = summary || clipText(body, 280) || "News Canada story";
    const resolvedBody = body || resolvedSummary;

    return {
      id: cleanText(item.id || item.storyId || item.slug || item.guid || item.url || `story-${index || 0}`),
      slug: cleanText(item.slug || item.id || ""),
      title,
      summary: resolvedSummary,
      body: resolvedBody,
      content: cleanText(item.content || resolvedBody) || resolvedBody,
      fullText: cleanText(item.fullText || resolvedBody) || resolvedBody,
      excerpt: cleanText(item.excerpt || resolvedSummary) || resolvedSummary,
      url,
      storyUrl: cleanText(item.storyUrl || url),
      canonicalUrl: cleanText(item.canonicalUrl || url),
      issue: cleanText(item.issue || item.kicker || item.section || item.categoryLabel || "Editor's Pick"),
      categories,
      keywords: Array.isArray(item.keywords) ? item.keywords.map(cleanText).filter(Boolean).slice(0, 10) : [],
      images,
      image: primaryImage,
      heroImage: primaryImage ? { url: primaryImage, alt: title, caption: "" } : null,
      author: cleanText(item.author || item.byline || item.creator || item.source || ""),
      publishedAt: cleanText(item.publishedAt || item.publishDate || item.date || item.scrapedAt || ""),
      lane: "newscanada",
      source: cleanText(item.source || "news_canada_disk_feed") || "news_canada_disk_feed"
    };
  }

  function extractFeedList(payload) {
    if (Array.isArray(payload)) return payload;
    if (!isObj(payload)) return [];

    const buckets = [
      payload.items,
      payload.stories,
      payload.articles,
      payload.assets,
      payload.movies,
      payload.slides,
      payload.panels,
      payload.chips,
      payload.editorsPicks,
      payload.editorPicks,
      payload.results,
      payload.feed,
      payload.entries,
      payload.records,
      payload.curated,
      payload.data && payload.data.items,
      payload.data && payload.data.stories,
      payload.data && payload.data.articles,
      payload.data && payload.data.assets,
      payload.payload && payload.payload.items,
      payload.payload && payload.payload.stories,
      payload.payload && payload.payload.articles,
      payload.payload && payload.payload.assets
    ];

    for (const bucket of buckets) {
      if (Array.isArray(bucket)) return bucket;
    }

    if (isObj(payload.data)) {
      const nested = extractFeedList(payload.data);
      if (nested.length) return nested;
    }

    if (isObj(payload.payload)) {
      const nested = extractFeedList(payload.payload);
      if (nested.length) return nested;
    }

    return [];
  }

  function normalizeFeed(payload) {
    return extractFeedList(payload)
      .map((item, index) => normalizeStory(item, index))
      .filter((item) => item && item.title && item.url && (item.summary || item.body || item.content));
  }

  function resolveDataFile() {
    const candidates = [
      process.env.NEWS_CANADA_DATA_FILE,
      process.env.SB_NEWSCANADA_DATA_FILE,
      path.join(cwd, "data", "newscanada", "editors-picks.v2.json"),
      path.join(baseDir, "data", "newscanada", "editors-picks.v2.json"),
      path.join(cwd, "src", "data", "newscanada", "editors-picks.v2.json"),
      path.join(baseDir, "src", "data", "newscanada", "editors-picks.v2.json"),
      path.join(cwd, "jobs", "news-canada", "data", "newscanada", "editors-picks.v2.json"),
      path.join(baseDir, "jobs", "news-canada", "data", "newscanada", "editors-picks.v2.json")
    ].filter(Boolean);

    for (const candidate of candidates) {
      const clean = cleanText(candidate);
      if (!clean) continue;
      try {
        if (fs.existsSync(clean)) return clean;
      } catch (_) {}
    }

    return cleanText(candidates[0] || "");
  }

  function rememberLastGood(stories, meta) {
    const safeStories = cloneStories(stories).filter((item) => item && item.title && item.url);
    if (!safeStories.length) return;
    lastGood.stories = safeStories;
    lastGood.file = cleanText(meta && meta.file || "");
    lastGood.loadedAt = now();
    lastGood.rawShape = cleanText(meta && meta.rawShape || "");
    lastGood.rawKeys = Array.isArray(meta && meta.rawKeys) ? meta.rawKeys.slice(0, 20) : [];
    lastGood.source = cleanText(meta && meta.source || "disk") || "disk";
  }

  function getStaticFallbackStories() {
    return staticFallback.map((item, index) => normalizeStory(item, index)).filter(Boolean);
  }

  function getResilientStories() {
    const live = Array.isArray(app.locals.newsCanadaEditorsPicks) ? app.locals.newsCanadaEditorsPicks.filter(Boolean) : [];
    if (live.length) return { stories: cloneStories(live), source: "live", degraded: false };
    if (Array.isArray(lastGood.stories) && lastGood.stories.length) {
      return { stories: cloneStories(lastGood.stories), source: "last_known_good", degraded: true };
    }
    return { stories: getStaticFallbackStories(), source: "static_fallback", degraded: true };
  }

  function hydrateLocals(parsed, file) {
    const normalizedStories = normalizeFeed(parsed);
    const rawShape = summarizeShape(parsed);
    const rawKeys = isObj(parsed) ? Object.keys(parsed).slice(0, 20) : [];

    if (normalizedStories.length) {
      app.locals.newsCanadaEditorsPicks = normalizedStories;
      app.locals.newsCanadaStories = normalizedStories;
      app.locals.newsCanadaFeed = normalizedStories;
      app.locals.newsCanadaPayload = parsed;
      app.locals.newsCanadaData = parsed;
      app.locals.newsCanadaEditorsPicksMeta = {
        ok: true,
        degraded: false,
        source: "disk",
        contractVersion,
        file,
        count: normalizedStories.length,
        loadedAt: now(),
        sourceShape: rawShape,
        rawKeys
      };
      rememberLastGood(normalizedStories, { file, rawShape, rawKeys, source: "disk" });
      return normalizedStories;
    }

    const resilient = getResilientStories();
    app.locals.newsCanadaEditorsPicks = resilient.stories;
    app.locals.newsCanadaStories = resilient.stories;
    app.locals.newsCanadaFeed = resilient.stories;
    app.locals.newsCanadaPayload = parsed;
    app.locals.newsCanadaData = parsed;
    app.locals.newsCanadaEditorsPicksMeta = {
      ok: resilient.stories.length > 0,
      degraded: true,
      source: resilient.source,
      contractVersion,
      file,
      count: resilient.stories.length,
      loadedAt: now(),
      sourceShape: rawShape,
      rawKeys,
      error: "news_canada_normalized_zero"
    };
    return resilient.stories;
  }

  function loadFromDisk() {
    const file = resolveDataFile();
    if (!file) {
      const resilient = getResilientStories();
      return {
        ok: resilient.stories.length > 0,
        degraded: true,
        source: resilient.source,
        contractVersion,
        file: "",
        count: resilient.stories.length,
        stories: resilient.stories,
        error: "news_canada_data_file_missing"
      };
    }

    try {
      const raw = fs.readFileSync(file, "utf8");
      const parsed = JSON.parse(raw);
      const stories = hydrateLocals(parsed, file);
      return {
        ok: stories.length > 0,
        degraded: !!app.locals.newsCanadaEditorsPicksMeta?.degraded,
        source: cleanText(app.locals.newsCanadaEditorsPicksMeta?.source || "disk") || "disk",
        contractVersion,
        file,
        count: stories.length,
        stories,
        rawShape: app.locals.newsCanadaEditorsPicksMeta?.sourceShape || summarizeShape(parsed),
        rawKeys: app.locals.newsCanadaEditorsPicksMeta?.rawKeys || (isObj(parsed) ? Object.keys(parsed).slice(0, 20) : [])
      };
    } catch (err) {
      const resilient = getResilientStories();
      app.locals.newsCanadaEditorsPicks = resilient.stories;
      app.locals.newsCanadaStories = resilient.stories;
      app.locals.newsCanadaFeed = resilient.stories;
      app.locals.newsCanadaEditorsPicksMeta = {
        ok: resilient.stories.length > 0,
        degraded: true,
        source: resilient.source,
        contractVersion,
        file,
        count: resilient.stories.length,
        loadedAt: now(),
        sourceShape: "",
        rawKeys: [],
        error: cleanText(err && (err.message || err) || "news canada load failed")
      };
      return {
        ok: resilient.stories.length > 0,
        degraded: true,
        source: resilient.source,
        contractVersion,
        file,
        count: resilient.stories.length,
        stories: resilient.stories,
        error: cleanText(err && (err.message || err) || "news canada load failed")
      };
    }
  }

  function bootstrap() {
    const result = loadFromDisk();
    console.log("[Sandblast][newsCanada:bootstrap]", {
      ok: !!result.ok,
      degraded: !!result.degraded,
      source: result.source || "",
      contractVersion,
      file: result.file,
      count: result.count,
      rawShape: result.rawShape || "",
      rawKeys: result.rawKeys || [],
      firstStory: result.stories && result.stories[0] ? { id: result.stories[0].id, title: result.stories[0].title } : null,
      error: result.error || ""
    });

    if (!refreshStarted && refreshMs > 0) {
      refreshStarted = true;
      refreshTimer = setInterval(() => {
        const refreshed = loadFromDisk();
        console.log("[Sandblast][newsCanada:refresh]", {
          ok: !!refreshed.ok,
          degraded: !!refreshed.degraded,
          source: refreshed.source || "",
          contractVersion,
          file: refreshed.file,
          count: refreshed.count,
          rawShape: refreshed.rawShape || "",
          rawKeys: refreshed.rawKeys || [],
          firstStory: refreshed.stories && refreshed.stories[0] ? { id: refreshed.stories[0].id, title: refreshed.stories[0].title } : null,
          error: refreshed.error || ""
        });
      }, refreshMs);
      if (refreshTimer && typeof refreshTimer.unref === "function") refreshTimer.unref();
    }

    return result;
  }

  function ensureReady(forceReload) {
    const shouldReload = !!forceReload || !Array.isArray(app.locals.newsCanadaEditorsPicks) || !app.locals.newsCanadaEditorsPicks.length;
    if (shouldReload) return loadFromDisk();
    const resilient = getResilientStories();
    return {
      ok: resilient.stories.length > 0,
      degraded: !!app.locals.newsCanadaEditorsPicksMeta?.degraded,
      source: cleanText(app.locals.newsCanadaEditorsPicksMeta?.source || resilient.source || "live") || "live",
      contractVersion,
      file: app.locals.newsCanadaEditorsPicksMeta?.file || resolveDataFile(),
      count: resilient.stories.length,
      stories: resilient.stories,
      rawShape: app.locals.newsCanadaEditorsPicksMeta?.sourceShape || "",
      rawKeys: app.locals.newsCanadaEditorsPicksMeta?.rawKeys || []
    };
  }

  function firstUsableImage(story) {
    const raw = isObj(story) ? story : {};
    if (Array.isArray(raw.images)) {
      for (const img of raw.images) {
        const normalized = normalizeImageLike(img, raw.title || "");
        if (normalized && normalized.url) return normalized;
      }
    }
    if (raw.heroImage && raw.heroImage.url) return raw.heroImage;
    if (cleanText(raw.image)) return { url: cleanText(raw.image), alt: cleanText(raw.title || ""), caption: "" };
    return fallbackImage ? { url: fallbackImage, alt: cleanText(raw.title || ""), caption: "" } : null;
  }

  function normalizeLookupValue(v) {
    return lower(cleanText(v)).replace(/[^a-z0-9]+/g, " ").trim();
  }

  function findStory(query) {
    const q = normalizeLookupValue(query);
    const list = Array.isArray(app.locals.newsCanadaEditorsPicks) ? app.locals.newsCanadaEditorsPicks : [];
    if (!q) return list[0] || null;

    for (const story of list) {
      const candidates = [
        story.id,
        story.slug,
        story.title,
        story.url,
        story.storyUrl,
        story.canonicalUrl,
        story.issue,
        ...(Array.isArray(story.categories) ? story.categories : [])
      ];
      if (candidates.some((entry) => normalizeLookupValue(entry) === q)) return story;
    }

    for (const story of list) {
      const hay = [
        story.id,
        story.slug,
        story.title,
        story.summary,
        story.body,
        story.url,
        story.storyUrl,
        story.canonicalUrl,
        story.issue,
        ...(Array.isArray(story.categories) ? story.categories : []),
        ...(Array.isArray(story.keywords) ? story.keywords : [])
      ].map((entry) => normalizeLookupValue(entry)).join(" ");
      if (hay.includes(q)) return story;
    }

    return null;
  }

  function buildStoryPayload(story, index) {
    const raw = isObj(story) ? story : {};
    const imageObj = firstUsableImage(raw);
    const images = [];

    if (Array.isArray(raw.images)) {
      for (const entry of raw.images) {
        const normalized = normalizeImageLike(entry, raw.title || "");
        if (normalized && normalized.url && !images.some((img) => lower(img.url) === lower(normalized.url))) {
          images.push(normalized);
        }
      }
    }

    if (imageObj && imageObj.url && !images.some((img) => lower(img.url) === lower(imageObj.url))) {
      images.unshift(imageObj);
    }

    const body = cleanText(raw.body || raw.content || raw.fullText || raw.summary || "");
    const summary = cleanText(raw.summary || clipText(body, 280) || raw.title || "News Canada story");
    const popupBody = body || summary;
    const popupImage = imageObj && imageObj.url ? imageObj.url : "";

    return {
      id: cleanText(raw.id || `story-${index || 0}`),
      slug: cleanText(raw.slug || raw.id || ""),
      title: cleanText(raw.title || "News Canada story"),
      summary,
      body: popupBody,
      content: popupBody,
      fullText: popupBody,
      popupBody,
      excerpt: summary,
      description: summary,
      issue: cleanText(raw.issue || "Editor's Pick"),
      url: cleanText(raw.url || raw.storyUrl || raw.canonicalUrl || fallbackUrl),
      storyUrl: cleanText(raw.storyUrl || raw.url || raw.canonicalUrl || fallbackUrl),
      canonicalUrl: cleanText(raw.canonicalUrl || raw.url || raw.storyUrl || fallbackUrl),
      categories: Array.isArray(raw.categories) ? raw.categories.map(cleanText).filter(Boolean).slice(0, 6) : [],
      keywords: Array.isArray(raw.keywords) ? raw.keywords.map(cleanText).filter(Boolean).slice(0, 10) : [],
      author: cleanText(raw.author || ""),
      publishedAt: cleanText(raw.publishedAt || ""),
      image: popupImage,
      heroImage: imageObj || null,
      popupImage,
      images,
      hasPopupContent: !!(popupBody && cleanText(raw.title || "")),
      popupReady: !!(popupBody && cleanText(raw.title || "")),
      lane: "newscanada",
      source: cleanText(raw.source || "news_canada_disk_feed") || "news_canada_disk_feed"
    };
  }

  function wantsLegacyArray(req) {
    const q = lower(req.query && req.query.format);
    const legacy = lower(req.query && req.query.legacy);
    return q === "array" || q === "legacy" || legacy === "1" || legacy === "true";
  }

  function buildEditorsPicksResponse(req) {
    const state = ensureReady(false);
    const slides = state.stories.map((story, index) => buildStoryPayload(story, index));
    return {
      ok: state.ok,
      degraded: !!state.degraded,
      source: state.source,
      contractVersion,
      file: state.file,
      count: slides.length,
      availableStories: slides.length,
      loadedAt: app.locals.newsCanadaEditorsPicksMeta?.loadedAt || 0,
      sourceShape: state.rawShape || "",
      rawKeys: state.rawKeys || [],
      stableRoutes: {
        editorsPicks: "/api/newscanada/editors-picks",
        editorsPicksMeta: "/api/newscanada/editors-picks/meta",
        story: "/api/newscanada/story"
      },
      request: {
        format: cleanText(req.query && req.query.format || ""),
        legacy: wantsLegacyArray(req)
      },
      slides,
      stories: slides,
      items: slides,
      articles: slides
    };
  }

  function buildStoryResponse(req) {
    const state = ensureReady(false);
    const query = cleanText(
      req.query && (
        req.query.id ||
        req.query.slug ||
        req.query.storyId ||
        req.query.title ||
        req.query.q ||
        req.query.query ||
        req.query.story
      ) || ""
    );

    const story = findStory(query);
    if (!story) {
      return {
        ok: false,
        error: "story_not_found",
        query,
        contractVersion,
        count: state.count,
        degraded: !!state.degraded,
        source: state.source
      };
    }

    return {
      ok: true,
      degraded: !!state.degraded,
      source: state.source,
      contractVersion,
      story: buildStoryPayload(story, 0)
    };
  }

  return {
    contractVersion,
    initLocals,
    bootstrap,
    ensureReady,
    wantsLegacyArray,
    buildEditorsPicksResponse,
    buildStoryResponse,
    loadFromDisk,
    resolveDataFile,
    normalizeFeed,
    hydrateLocals
  };
};

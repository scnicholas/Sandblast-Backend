"use strict";

module.exports = function createNewsCanadaRuntime(opts) {
  const app = opts.app;
  const fs = opts.fs;
  const path = opts.path;
  const baseDir = opts.baseDir || process.cwd();
  const cwd = opts.cwd || process.cwd();
  const indexVersion = cleanText(opts.indexVersion || "index.js");
  const refreshMs = Math.max(15000, Number(opts.refreshMs || 60000));

  const contractVersion = "news-canada-editors-picks-v2";
  const route = "/api/newscanada/editors-picks";
  const storyRoute = "/api/newscanada/story";
  const fallbackUrl = "https://www.newscanada.com/home";

  const fileCandidates = [
    process.env.NEWS_CANADA_DATA_FILE,
    process.env.SB_NEWSCANADA_DATA_FILE,
    path.join(cwd, "data", "newscanada", "editors-picks.v2.json"),
    path.join(baseDir, "data", "newscanada", "editors-picks.v2.json"),
    path.join(cwd, "src", "data", "newscanada", "editors-picks.v2.json"),
    path.join(baseDir, "src", "data", "newscanada", "editors-picks.v2.json"),
    path.join(cwd, "jobs", "news-canada", "data", "newscanada", "editors-picks.v2.json"),
    path.join(baseDir, "jobs", "news-canada", "data", "newscanada", "editors-picks.v2.json")
  ].filter(Boolean);

  const staticFallback = [
    {
      id: "fallback-financial-wellness",
      title: "A working woman’s guide to financial wellness",
      summary: "A practical guide to building financial wellness through goal setting, protecting savings and simplifying money management.",
      body: "A practical overview of financial wellness steps, including setting priorities, protecting savings and using simple tools to stay organized.",
      content: "A practical overview of financial wellness steps, including setting priorities, protecting savings and using simple tools to stay organized.",
      fullText: "A practical overview of financial wellness steps, including setting priorities, protecting savings and using simple tools to stay organized.",
      excerpt: "A practical guide to building financial wellness through goal setting, protecting savings and simplifying money management.",
      url: "https://www.newscanada.com/en/a-working-woman-e2-80-99s-guide-to-financial-wellness-141322",
      issue: "March 2026",
      categories: ["Finance - Home & Household"],
      keywords: ["finance", "savings", "budgeting", "financial wellness", "household"],
      image: "https://www.newscanada.com/Data/Posts/65d17a43-4ddf-4334-a81a-5e174ed0c191/57038e66-c7e9-4aa1-9d2c-240377029b52_fi_t.jpg"
    },
    {
      id: "fallback-family-movie-night",
      title: "New ways to enjoy family movie nights this winter",
      summary: "Simple ideas for making family movie nights feel new again without adding much cost.",
      body: "A family-focused entertainment piece about refreshing movie night with themes, snacks and simple at-home setup ideas.",
      content: "A family-focused entertainment piece about refreshing movie night with themes, snacks and simple at-home setup ideas.",
      fullText: "A family-focused entertainment piece about refreshing movie night with themes, snacks and simple at-home setup ideas.",
      excerpt: "Simple ideas for making family movie nights feel new again without adding much cost.",
      url: "https://www.newscanada.com/en/new-ways-to-enjoy-family-movie-nights-this-winter-141171",
      issue: "February 2026",
      categories: ["Travel & Leisure", "Technology & Science", "Family & Parenting", "Home & Garden"],
      keywords: ["family", "movie night", "streaming", "home entertainment", "winter"],
      image: "https://www.newscanada.com/Data/Posts/086596b7-dcc6-4f92-b206-13103e87d2ff/7cfe91c2-326d-4bf4-a2f6-1f98b0fe4a07_fi_t.jpg"
    }
  ];

  const lastGood = {
    stories: [],
    file: "",
    loadedAt: 0,
    sourceShape: "",
    rawKeys: [],
    source: "bootstrap"
  };

  let started = false;

  function now() { return Date.now(); }
  function safeStr(v) { return typeof v === "string" ? v : v == null ? "" : String(v); }
  function cleanText(v) { return safeStr(v).replace(/\s+/g, " ").trim(); }
  function lower(v) { return cleanText(v).toLowerCase(); }
  function clamp(n, min, max) { return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : min; }
  function isObj(v) { return !!v && typeof v === "object" && !Array.isArray(v); }
  function clipText(v, max) {
    const s = cleanText(v);
    const n = clamp(Number(max || 280), 32, 4000);
    return s.length > n ? `${s.slice(0, n)}…` : s;
  }
  function uniq(arr) { return Array.from(new Set((Array.isArray(arr) ? arr : []).filter(Boolean))); }

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

  function summarizeShape(payload) {
    if (Array.isArray(payload)) return `array:${payload.length}`;
    if (!isObj(payload)) return typeof payload;
    const keys = Object.keys(payload).slice(0, 8);
    return `object:${keys.join(",")}`;
  }

  function normalizeImageLike(entry, title) {
    if (!entry) return null;
    if (typeof entry === "string") {
      const url = cleanText(entry);
      return url ? { url, alt: cleanText(title || ""), caption: "" } : null;
    }
    if (!isObj(entry)) return null;
    const url = cleanText(entry.url || entry.src || entry.href || entry.image || entry.imageUrl || entry.large || entry.medium || entry.small || entry.path || "");
    if (!url) return null;
    return {
      url,
      alt: cleanText(entry.alt || entry.title || title || ""),
      caption: cleanText(entry.caption || entry.description || "")
    };
  }

  function normalizeStory(item, index) {
    const title = cleanText(item && (item.title || item.headline || item.name || item.label || "")) || `News Canada story ${index + 1}`;
    const url = cleanText(item && (item.url || item.storyUrl || item.canonicalUrl || item.href || fallbackUrl)) || fallbackUrl;
    const body = cleanText(item && (item.body || item.content || item.fullText || item.text || item.summary || item.excerpt || ""));
    const summary = cleanText(item && (item.summary || item.excerpt || clipText(body, 280) || title)) || title;

    const images = uniq([
      normalizeImageLike(item && item.heroImage, title),
      normalizeImageLike(item && item.image, title),
      normalizeImageLike(item && item.imageUrl, title),
      ...(Array.isArray(item && item.images) ? item.images.map((img) => normalizeImageLike(img, title)) : [])
    ].filter(Boolean).map((img) => JSON.stringify(img))).map((raw) => JSON.parse(raw));

    const primary = images[0] || null;
    const categoriesSource = Array.isArray(item && item.categories)
      ? item.categories
      : Array.isArray(item && item.tags)
        ? item.tags
        : Array.isArray(item && item.topics)
          ? item.topics
          : Array.isArray(item && item.sections)
            ? item.sections
            : [];

    return {
      id: cleanText(item && (item.id || item.storyId || item.slug || item.guid || `story-${index + 1}`)),
      slug: cleanText(item && (item.slug || item.id || "")),
      title,
      summary,
      body: body || summary,
      content: cleanText(item && (item.content || body || summary)) || summary,
      fullText: cleanText(item && (item.fullText || body || summary)) || summary,
      excerpt: cleanText(item && (item.excerpt || summary)) || summary,
      description: summary,
      url,
      storyUrl: cleanText(item && (item.storyUrl || url)) || url,
      canonicalUrl: cleanText(item && (item.canonicalUrl || url)) || url,
      issue: cleanText(item && (item.issue || item.kicker || item.section || item.categoryLabel || "Editor's Pick")) || "Editor's Pick",
      categories: (Array.isArray(categoriesSource) ? categoriesSource : []).map(cleanText).filter(Boolean).slice(0, 6),
      keywords: (Array.isArray(item && item.keywords) ? item.keywords : []).map(cleanText).filter(Boolean).slice(0, 10),
      author: cleanText(item && (item.author || item.byline || item.creator || item.source || "")),
      publishedAt: cleanText(item && (item.publishedAt || item.publishDate || item.date || item.scrapedAt || "")),
      image: primary && primary.url ? primary.url : "",
      heroImage: primary,
      images,
      popupImage: primary && primary.url ? primary.url : "",
      popupBody: body || summary,
      hasPopupContent: !!(title && (body || summary)),
      popupReady: !!(title && (body || summary)),
      lane: "newscanada",
      source: cleanText(item && item.source) || "news_canada_disk_feed"
    };
  }

  function extractList(payload) {
    if (Array.isArray(payload)) return payload;
    if (!isObj(payload)) return [];
    const buckets = [
      payload.items,
      payload.stories,
      payload.articles,
      payload.assets,
      payload.slides,
      payload.panels,
      payload.chips,
      payload.editorsPicks,
      payload.editorPicks,
      payload.curated,
      payload.records,
      payload.results,
      payload.feed,
      payload.entries,
      payload.data && payload.data.items,
      payload.data && payload.data.stories,
      payload.data && payload.data.articles,
      payload.data && payload.data.assets,
      payload.payload && payload.payload.items,
      payload.payload && payload.payload.stories,
      payload.payload && payload.payload.articles,
      payload.payload && payload.payload.assets,
      payload.payload && payload.payload.slides,
      payload.payload && payload.payload.panels,
      payload.payload && payload.payload.editorsPicks
    ];
    for (const bucket of buckets) {
      if (Array.isArray(bucket) && bucket.length) return bucket;
    }
    if (isObj(payload.data)) {
      const nested = extractList(payload.data);
      if (nested.length) return nested;
    }
    if (isObj(payload.payload)) {
      const nested = extractList(payload.payload);
      if (nested.length) return nested;
    }
    return [];
  }

  function normalizeFeed(payload) {
    return extractList(payload)
      .map((item, index) => normalizeStory(item, index))
      .filter((item) => item && item.title && item.url && (item.summary || item.body || item.content));
  }

  function resolveDataFile() {
    for (const candidate of fileCandidates) {
      const clean = cleanText(candidate);
      if (!clean) continue;
      try {
        if (fs.existsSync(clean)) return clean;
      } catch (_) {}
    }
    return cleanText(fileCandidates[0] || "");
  }

  function rememberLastGood(stories, meta) {
    if (!Array.isArray(stories) || !stories.length) return;
    lastGood.stories = stories.slice();
    lastGood.file = cleanText(meta && meta.file || "");
    lastGood.loadedAt = Number(meta && meta.loadedAt || now());
    lastGood.sourceShape = cleanText(meta && meta.sourceShape || "");
    lastGood.rawKeys = Array.isArray(meta && meta.rawKeys) ? meta.rawKeys.slice(0, 20) : [];
    lastGood.source = cleanText(meta && meta.source || "disk") || "disk";
  }

  function getResilientStories() {
    if (Array.isArray(lastGood.stories) && lastGood.stories.length) {
      return { stories: lastGood.stories.slice(), source: "last_good" };
    }
    return { stories: staticFallback.map((item, index) => normalizeStory(item, index)), source: "static_fallback" };
  }

  function applyState(stories, meta, parsed) {
    app.locals.newsCanadaEditorsPicks = stories;
    app.locals.newsCanadaStories = stories;
    app.locals.newsCanadaFeed = stories;
    app.locals.newsCanadaPayload = parsed || null;
    app.locals.newsCanadaData = parsed || null;
    app.locals.newsCanadaEditorsPicksMeta = {
      ok: !!(stories && stories.length),
      degraded: !!meta.degraded,
      source: cleanText(meta.source || "disk") || "disk",
      contractVersion,
      file: cleanText(meta.file || ""),
      count: Array.isArray(stories) ? stories.length : 0,
      loadedAt: Number(meta.loadedAt || now()),
      sourceShape: cleanText(meta.sourceShape || ""),
      rawKeys: Array.isArray(meta.rawKeys) ? meta.rawKeys.slice(0, 20) : [],
      error: cleanText(meta.error || "")
    };
  }

  function loadFromDisk() {
    const file = resolveDataFile();
    if (!file) {
      const resilient = getResilientStories();
      applyState(resilient.stories, {
        degraded: true,
        source: resilient.source,
        file: "",
        loadedAt: now(),
        sourceShape: "",
        rawKeys: [],
        error: "news_canada_data_file_missing"
      }, null);
      return { ...app.locals.newsCanadaEditorsPicksMeta, stories: resilient.stories, rawShape: "" };
    }

    try {
      const raw = fs.readFileSync(file, "utf8");
      const parsed = JSON.parse(raw);
      const stories = normalizeFeed(parsed);
      const rawShape = summarizeShape(parsed);
      const rawKeys = isObj(parsed) ? Object.keys(parsed).slice(0, 20) : [];
      if (stories.length) {
        applyState(stories, {
          degraded: false,
          source: "disk",
          file,
          loadedAt: now(),
          sourceShape: rawShape,
          rawKeys
        }, parsed);
        rememberLastGood(stories, { file, loadedAt: now(), sourceShape: rawShape, rawKeys, source: "disk" });
        return { ...app.locals.newsCanadaEditorsPicksMeta, stories, rawShape };
      }
      const resilient = getResilientStories();
      applyState(resilient.stories, {
        degraded: true,
        source: resilient.source,
        file,
        loadedAt: now(),
        sourceShape: rawShape,
        rawKeys,
        error: "news_canada_normalized_zero"
      }, parsed);
      return { ...app.locals.newsCanadaEditorsPicksMeta, stories: resilient.stories, rawShape };
    } catch (err) {
      const resilient = getResilientStories();
      applyState(resilient.stories, {
        degraded: true,
        source: resilient.source,
        file,
        loadedAt: now(),
        sourceShape: "",
        rawKeys: [],
        error: cleanText(err && (err.message || err) || "news canada load failed")
      }, null);
      return { ...app.locals.newsCanadaEditorsPicksMeta, stories: resilient.stories, rawShape: "" };
    }
  }

  function ensureReady(forceReload) {
    const shouldReload = !!forceReload || !Array.isArray(app.locals.newsCanadaEditorsPicks) || !app.locals.newsCanadaEditorsPicks.length;
    if (shouldReload) return loadFromDisk();
    return {
      ...app.locals.newsCanadaEditorsPicksMeta,
      stories: Array.isArray(app.locals.newsCanadaEditorsPicks) ? app.locals.newsCanadaEditorsPicks : [],
      rawShape: cleanText(app.locals.newsCanadaEditorsPicksMeta && app.locals.newsCanadaEditorsPicksMeta.sourceShape || "")
    };
  }

  function normalizeLookup(v) {
    return lower(v).replace(/[^a-z0-9]+/g, " ").trim();
  }

  function findStory(query) {
    const q = normalizeLookup(query);
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
      if (candidates.some((entry) => normalizeLookup(entry) === q)) return story;
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
      ].map((entry) => normalizeLookup(entry)).join(" ");
      if (hay.includes(q)) return story;
    }
    return null;
  }

  function buildStoryPayload(story, index) {
    return normalizeStory(story || {}, index || 0);
  }

  function wantsLegacyArray(req) {
    const q = isObj(req && req.query) ? req.query : {};
    const format = lower(q.format || q.shape || q.view || "");
    if (format === "object" || format === "full" || format === "meta") return false;
    if (format === "array" || format === "legacy" || format === "slides") return true;
    const accept = lower(req && req.headers && req.headers.accept || "");
    if (accept.includes("application/vnd.sandblast.newscanada+json")) return false;
    return true;
  }

  function buildEditorsPicksResponse(req) {
    const state = ensureReady(req && req.query && req.query.refresh === "1");
    const stories = (state.stories || []).map((story, index) => buildStoryPayload(story, index));
    const slides = stories.map((story, index) => ({
      ...story,
      slideId: story.id || `slide-${index}`,
      storyId: story.id || `story-${index}`,
      chipLabel: story.issue || "Editor's Pick",
      panelIndex: index,
      hasImage: !!story.image
    }));

    return {
      ok: stories.length > 0,
      degraded: !!state.degraded,
      source: cleanText(state.source || "live") || "live",
      contractVersion,
      route,
      storyRoute,
      fallbackStories: stories.filter((story) => !!story.summary && !!story.body).length,
      availableStories: stories.length,
      storyCount: stories.length,
      stories,
      items: stories,
      slides,
      panels: slides,
      chips: slides.map((slide) => ({
        id: slide.id,
        title: slide.title,
        label: slide.chipLabel,
        summary: slide.summary,
        image: slide.image,
        url: slide.url
      })),
      meta: {
        v: indexVersion,
        t: now(),
        file: cleanText(state.file || resolveDataFile()),
        rawShape: cleanText(state.rawShape || ""),
        rawKeys: Array.isArray(state.rawKeys) ? state.rawKeys : [],
        degraded: !!state.degraded,
        source: cleanText(state.source || "live") || "live",
        compatibility: {
          defaultShape: "array",
          objectQuery: "?format=object",
          stableRoutes: {
            editorsPicks: route,
            story: storyRoute
          }
        }
      }
    };
  }

  function buildStoryResponse(req) {
    ensureReady(req && req.query && req.query.refresh === "1");
    const lookup = cleanText(req && req.query && (req.query.id || req.query.storyId || req.query.slug || req.query.title || req.query.url) || "");
    const story = findStory(lookup);
    if (!story) {
      return {
        ok: false,
        error: "story_not_found",
        route: storyRoute,
        lookup,
        meta: { v: indexVersion, t: now(), contractVersion }
      };
    }
    const payload = buildStoryPayload(story, 0);
    return {
      ok: true,
      route: storyRoute,
      story: payload,
      popup: {
        title: payload.title,
        body: payload.popupBody,
        image: payload.popupImage,
        summary: payload.summary,
        url: payload.url
      },
      meta: { v: indexVersion, t: now(), contractVersion }
    };
  }

  function bootstrap() {
    const result = loadFromDisk();
    console.log("[Sandblast][newsCanada:bootstrap]", {
      ok: !!result.ok,
      file: result.file,
      count: result.count,
      rawShape: result.rawShape || "",
      rawKeys: result.rawKeys || [],
      firstStory: result.stories && result.stories[0] ? { id: result.stories[0].id, title: result.stories[0].title } : null,
      degraded: !!result.degraded,
      source: result.source || "",
      error: result.error || ""
    });

    if (!started && refreshMs > 0) {
      started = true;
      setInterval(() => {
        const refreshed = loadFromDisk();
        console.log("[Sandblast][newsCanada:refresh]", {
          ok: !!refreshed.ok,
          file: refreshed.file,
          count: refreshed.count,
          rawShape: refreshed.rawShape || "",
          rawKeys: refreshed.rawKeys || [],
          firstStory: refreshed.stories && refreshed.stories[0] ? { id: refreshed.stories[0].id, title: refreshed.stories[0].title } : null,
          degraded: !!refreshed.degraded,
          source: refreshed.source || "",
          error: refreshed.error || ""
        });
      }, refreshMs).unref();
    }

    return result;
  }

  return {
    contractVersion,
    initLocals,
    resolveDataFile,
    ensureReady,
    buildEditorsPicksResponse,
    buildStoryResponse,
    wantsLegacyArray,
    bootstrap
  };
};

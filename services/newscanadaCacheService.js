"use strict";

const fs = require("fs");
const path = require("path");

const CACHE_VERSION = "newscanada-cache-v2";
const DEFAULT_REFRESH_MS = Number(process.env.NEWS_CANADA_REFRESH_MS || 30 * 60 * 1000);
const DEFAULT_STALE_MS = Number(process.env.NEWS_CANADA_STALE_MS || 60 * 60 * 1000);
const DEFAULT_TIMEOUT_MS = Number(process.env.NEWS_CANADA_RSS_TIMEOUT_MS || 30000);
const DEFAULT_MAX_ITEMS = Number(process.env.NEWS_CANADA_MAX_ITEMS || 6);

const CACHE_DIR = cleanText(process.env.NEWSCANADA_CACHE_DIR || process.env.NEWS_CANADA_CACHE_DIR || "") || path.join(__dirname, "..", "data", "newscanada");
const CACHE_FILE = cleanText(process.env.NEWSCANADA_CACHE_FILE || process.env.NEWS_CANADA_CACHE_FILE || "") || path.join(CACHE_DIR, "newscanada.cache.json");

function safeStr(v) {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}

function cleanText(v) {
  return safeStr(v).replace(/\s+/g, " ").trim();
}

function clipText(v, max) {
  const s = cleanText(v);
  const n = Number.isFinite(Number(max)) ? Number(max) : 320;
  if (!s) return "";
  return s.length > n ? `${s.slice(0, n).trim()}…` : s;
}

function decodeHtml(value) {
  return safeStr(value)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&nbsp;/gi, " ")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/&#8217;/gi, "'")
    .replace(/&#8220;|&#8221;/gi, '"')
    .replace(/&#8230;/gi, "…")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => {
      try { return String.fromCodePoint(parseInt(hex, 16)); } catch (_) { return ""; }
    })
    .replace(/&#(\d+);/g, (_, dec) => {
      try { return String.fromCodePoint(parseInt(dec, 10)); } catch (_) { return ""; }
    });
}

function stripTags(value) {
  return cleanText(decodeHtml(value).replace(/<[^>]+>/g, " "));
}

function firstString(arr) {
  for (const item of Array.isArray(arr) ? arr : []) {
    const s = cleanText(item);
    if (s) return s;
  }
  return "";
}

function now() {
  return Date.now();
}

function getEnvNumber(name, fallback) {
  const raw = Number(process.env[name]);
  return Number.isFinite(raw) && raw > 0 ? raw : fallback;
}

function getConfiguredFeedUrl() {
  return cleanText(
    process.env.NEWS_CANADA_RSS_FEED_URL ||
    process.env.NEWS_CANADA_FEED_URL ||
    process.env.SB_NEWSCANADA_RSS_FEED_URL ||
    "https://foryourlife.ca/feed/"
  ) || "https://foryourlife.ca/feed/";
}

function unique(arr) {
  return Array.from(new Set((Array.isArray(arr) ? arr : []).filter(Boolean)));
}

function isSeedItem(item) {
  const id = cleanText(item && item.id).toLowerCase();
  const parserMode = cleanText(item && item.parserMode).toLowerCase();
  const summary = cleanText(item && (item.summary || item.description || item.body || item.content)).toLowerCase();
  return id.includes("newscanada-seed-") || parserMode.includes("seed") || summary.includes("seed story");
}

function isSeedPayload(payload) {
  const items = Array.isArray(payload && payload.items) ? payload.items : [];
  const meta = payload && payload.meta && typeof payload.meta === "object" ? payload.meta : {};
  const parserMode = cleanText(meta.parserMode).toLowerCase();
  const servedFrom = cleanText(meta.servedFrom || meta.source).toLowerCase();
  const detail = cleanText(meta.detail).toLowerCase();
  return parserMode.includes("seed") || servedFrom.includes("seed") || detail.includes("manual_seed_bootstrap") || items.some(isSeedItem);
}

function ensureCacheDir() {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
}

function readJsonFile(filePath) {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    return JSON.parse(raw);
  } catch (_) {
    return null;
  }
}

function writeJsonFile(filePath, data) {
  ensureCacheDir();
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
}

function getFeedOriginCandidates() {
  const primary = getConfiguredFeedUrl();
  const derived = [];
  try {
    const base = new URL(primary);
    derived.push(`${base.origin}/wp-json/wp/v2/posts?per_page=6&_embed=1&_fields=id,date,link,slug,title,excerpt,content,yoast_head_json,_embedded`);
    derived.push(`${base.origin}/index.php?rest_route=/wp/v2/posts&per_page=6&_embed=1`);
    derived.push(`${base.origin}/feed/`);
    derived.push(`${base.origin}/?feed=rss2`);
    derived.push(`${base.origin}/index.php?feed=rss2`);
    derived.push(`${base.origin}/feed/rss2/`);
  } catch (_) {
    derived.push(primary);
  }
  return unique([
    primary,
    cleanText(process.env.NEWS_CANADA_FEED_URL_ALT || ""),
    cleanText(process.env.NEWS_CANADA_RSS_FEED_URL_ALT || ""),
    cleanText(process.env.SB_NEWSCANADA_RSS_FEED_URL_ALT || ""),
    ...derived
  ]);
}

function makeFetchHeaders(mode) {
  return {
    "accept": mode === "wp_rest"
      ? "application/json, text/json;q=0.95, */*;q=0.6"
      : "application/rss+xml, application/xml, text/xml;q=0.95, application/atom+xml;q=0.95, text/html;q=0.7, */*;q=0.6",
    "cache-control": "no-cache",
    "pragma": "no-cache",
    "accept-language": "en-US,en;q=0.9",
    "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
  };
}

async function fetchWithTimeout(url, mode, timeoutMs) {
  const controller = typeof AbortController === "function" ? new AbortController() : null;
  const timer = controller
    ? setTimeout(() => {
        try { controller.abort(); } catch (_) {}
      }, timeoutMs)
    : null;

  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      headers: makeFetchHeaders(mode),
      signal: controller ? controller.signal : undefined
    });

    const contentType = cleanText(
      response && response.headers && typeof response.headers.get === "function"
        ? response.headers.get("content-type") || ""
        : ""
    );

    const text = await response.text();

    return {
      ok: !!(response && response.ok),
      status: Number(response && response.status || 0),
      url: cleanText(response && response.url || url) || url,
      contentType,
      text
    };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function extractWpFeaturedImage(post) {
  const embedded = post && typeof post === "object" ? post._embedded || {} : {};
  const mediaArr = Array.isArray(embedded["wp:featuredmedia"]) ? embedded["wp:featuredmedia"] : [];

  for (const media of mediaArr) {
    const direct = firstString([
      media && media.source_url,
      media && media.link,
      media && media.guid && media.guid.rendered
    ]);
    if (direct) return direct;

    const sizes = media && media.media_details && media.media_details.sizes;
    if (sizes && typeof sizes === "object") {
      for (const key of ["full", "large", "medium_large", "medium", "thumbnail"]) {
        const url = cleanText(sizes[key] && sizes[key].source_url);
        if (url) return url;
      }
    }
  }

  const yoast = post && typeof post === "object" ? post.yoast_head_json || {} : {};
  if (Array.isArray(yoast.og_image)) {
    for (const img of yoast.og_image) {
      const url = firstString([img && img.url, img && img.src]);
      if (url) return url;
    }
  }

  return "";
}

function normalizeWpPosts(raw, sourceUrl) {
  const arr = Array.isArray(raw) ? raw : [];
  const items = arr.map((post, index) => {
    const title = stripTags(post && post.title && post.title.rendered) || `Story ${index + 1}`;
    const excerpt = stripTags(post && post.excerpt && post.excerpt.rendered);
    const content = stripTags(post && post.content && post.content.rendered);
    const summary = cleanText(excerpt || clipText(content, 320));
    const body = cleanText(content || summary);
    const author = firstString([
      post && post.author_name,
      post && post._embedded && Array.isArray(post._embedded.author) && post._embedded.author[0] && post._embedded.author[0].name
    ]);
    const image = extractWpFeaturedImage(post);
    const url = cleanText(post && post.link);

    return {
      id: cleanText(post && post.id) || `wp-${index}`,
      guid: cleanText(post && post.id) || `wp-${index}`,
      slug: cleanText(post && post.slug) || `story-${index + 1}`,
      title,
      headline: title,
      description: summary,
      summary,
      body,
      content: body,
      link: url,
      url,
      sourceUrl: url,
      canonicalUrl: url,
      pubDate: cleanText(post && post.date),
      publishedAt: cleanText(post && post.date),
      image,
      popupImage: image,
      popupBody: body,
      author: author || "For Your Life",
      byline: author || "For Your Life",
      category: "For Your Life",
      chipLabel: "News Canada",
      ctaText: "Read full story",
      source: "For Your Life",
      sourceName: "For Your Life",
      parserMode: "wp_rest_posts_parser",
      feedUrl: sourceUrl,
      isActive: true
    };
  }).filter((item) => item && (item.title || item.summary || item.url));

  return items.slice(0, DEFAULT_MAX_ITEMS);
}

function firstXmlTagValue(block, tagNames) {
  const names = Array.isArray(tagNames) ? tagNames : [tagNames];
  for (const tagName of names) {
    const safeTag = cleanText(tagName).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (!safeTag) continue;
    const match = new RegExp(`<${safeTag}\\b[^>]*>([\\s\\S]*?)<\\/${safeTag}>`, "i").exec(block);
    if (match && cleanText(match[1])) return decodeHtml(match[1]);
  }
  return "";
}

function firstXmlAttrValue(block, tagNames, attrName) {
  const names = Array.isArray(tagNames) ? tagNames : [tagNames];
  const attr = cleanText(attrName).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  for (const tagName of names) {
    const safeTag = cleanText(tagName).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (!safeTag || !attr) continue;
    const match = new RegExp(`<${safeTag}\\b[^>]*\\s${attr}=["']([^"']+)["'][^>]*\\/?>`, "i").exec(block);
    if (match && cleanText(match[1])) return decodeHtml(match[1]);
  }
  return "";
}

function normalizeRssXml(xmlText, sourceUrl) {
  const xml = safeStr(xmlText);
  const blocks = xml.match(/<item\b[\s\S]*?<\/item>/gi) || xml.match(/<entry\b[\s\S]*?<\/entry>/gi) || [];

  const items = blocks.map((block, index) => {
    const title = stripTags(firstXmlTagValue(block, ["title"])) || `Story ${index + 1}`;
    const description = stripTags(
      firstXmlTagValue(block, ["description", "content:encoded", "excerpt:encoded", "content", "summary"])
    );
    const url = firstString([
      firstXmlAttrValue(block, ["link"], "href"),
      firstXmlTagValue(block, ["link"]),
      firstXmlTagValue(block, ["guid"])
    ]);
    const pubDate = firstString([
      firstXmlTagValue(block, ["pubDate", "published", "updated", "dc:date"])
    ]);
    const author = stripTags(firstXmlTagValue(block, ["dc:creator", "author", "creator"])) || "For Your Life";
    const image = firstString([
      firstXmlAttrValue(block, ["media:content", "media:thumbnail", "enclosure"], "url"),
      firstXmlTagValue(block, ["image"])
    ]);
    const summary = cleanText(description || title);
    const body = cleanText(description || summary);

    return {
      id: cleanText(firstXmlTagValue(block, ["guid", "id"])) || `rss-${index}`,
      guid: cleanText(firstXmlTagValue(block, ["guid", "id"])) || `rss-${index}`,
      slug: cleanText(title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")) || `rss-${index}`,
      title,
      headline: title,
      description: summary,
      summary,
      body,
      content: body,
      link: cleanText(url),
      url: cleanText(url),
      sourceUrl: cleanText(url),
      canonicalUrl: cleanText(url),
      pubDate: cleanText(pubDate),
      publishedAt: cleanText(pubDate),
      image: cleanText(image),
      popupImage: cleanText(image),
      popupBody: body,
      author,
      byline: author,
      category: "For Your Life",
      chipLabel: "News Canada",
      ctaText: "Read full story",
      source: "For Your Life",
      sourceName: "For Your Life",
      parserMode: "rss_xml_parser",
      feedUrl: sourceUrl,
      isActive: true
    };
  }).filter((item) => item && (item.title || item.summary || item.url));

  return items.slice(0, DEFAULT_MAX_ITEMS);
}

function buildEmptyContract(reason) {
  return {
    ok: false,
    items: [],
    meta: {
      source: "cache",
      mode: "cache_first",
      fetchedAt: now(),
      lastSuccessAt: 0,
      itemCount: 0,
      cacheVersion: CACHE_VERSION,
      stale: true,
      detail: cleanText(reason || "no_cache_available")
    }
  };
}

function readCache() {
  const cached = readJsonFile(CACHE_FILE);
  if (!cached || !Array.isArray(cached.items) || !cached.meta) {
    return buildEmptyContract("cache_missing");
  }
  return cached;
}

function writeCache(items, metaPatch) {
  const safeItems = Array.isArray(items) ? items.slice(0, DEFAULT_MAX_ITEMS) : [];
  const payload = {
    ok: safeItems.length > 0,
    items: safeItems,
    meta: {
      source: "cache",
      mode: "cache_first",
      fetchedAt: now(),
      lastSuccessAt: now(),
      itemCount: safeItems.length,
      cacheVersion: CACHE_VERSION,
      stale: false,
      feedUrl: getConfiguredFeedUrl(),
      ...(metaPatch && typeof metaPatch === "object" ? metaPatch : {})
    }
  };
  writeJsonFile(CACHE_FILE, payload);
  return payload;
}

function isCacheFresh(cached, refreshMs) {
  const fetchedAt = Number(cached && cached.meta && cached.meta.fetchedAt || 0);
  if (!fetchedAt) return false;
  return now() - fetchedAt <= refreshMs;
}

function isCacheStale(cached, staleMs) {
  const fetchedAt = Number(cached && cached.meta && cached.meta.fetchedAt || 0);
  if (!fetchedAt) return true;
  return now() - fetchedAt > staleMs;
}

let refreshInFlight = null;

async function fetchLiveNewsCanada(options) {
  const timeoutMs = Number(options && options.timeoutMs) || getEnvNumber("NEWS_CANADA_RSS_TIMEOUT_MS", DEFAULT_TIMEOUT_MS);
  const attempts = [];
  const candidates = getFeedOriginCandidates();

  for (const url of candidates) {
    const mode = /wp-json|rest_route/i.test(url) ? "wp_rest" : "rss";
    try {
      const result = await fetchWithTimeout(url, mode, timeoutMs);
      attempts.push({
        url,
        mode,
        status: result.status,
        ok: result.ok,
        finalUrl: result.url,
        contentType: result.contentType
      });

      if (!result.ok) continue;

      if (mode === "wp_rest") {
        const parsed = JSON.parse(result.text);
        const items = normalizeWpPosts(parsed, result.url || url);
        if (items.length) {
          return {
            ok: true,
            items,
            meta: {
              source: "live_origin",
              mode: "wp_rest",
              parserMode: "wp_rest_posts_parser",
              resolvedUrl: result.url || url,
              contentType: result.contentType,
              attemptedUrls: attempts,
              sample: clipText(result.text, 240)
            }
          };
        }
      } else {
        const items = normalizeRssXml(result.text, result.url || url);
        if (items.length) {
          return {
            ok: true,
            items,
            meta: {
              source: "live_origin",
              mode: "rss",
              parserMode: "rss_xml_parser",
              resolvedUrl: result.url || url,
              contentType: result.contentType,
              attemptedUrls: attempts,
              sample: clipText(result.text, 240)
            }
          };
        }
      }
    } catch (err) {
      attempts.push({
        url,
        mode,
        ok: false,
        error: cleanText(err && (err.message || err) || "fetch_failed")
      });
    }
  }

  return {
    ok: false,
    items: [],
    meta: {
      source: "live_origin",
      mode: "unresolved",
      parserMode: "uninitialized",
      resolvedUrl: "",
      contentType: "unknown",
      attemptedUrls: attempts,
      sample: "",
      detail: "live_fetch_failed",
      feedUrl: getConfiguredFeedUrl()
    }
  };
}

async function refreshCache(options) {
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    const live = await fetchLiveNewsCanada(options || {});
    if (live.ok && Array.isArray(live.items) && live.items.length > 0) {
      return writeCache(live.items, {
        source: "cache",
        upstreamSource: live.meta && live.meta.source || "live_origin",
        upstreamMode: live.meta && live.meta.mode || "unknown",
        parserMode: live.meta && live.meta.parserMode || "unknown",
        resolvedUrl: live.meta && live.meta.resolvedUrl || "",
        contentType: live.meta && live.meta.contentType || "",
        attemptedUrls: live.meta && live.meta.attemptedUrls || [],
        sample: live.meta && live.meta.sample || "",
        stale: false
      });
    }

    const existing = readCache();
    return {
      ...existing,
      ok: Array.isArray(existing.items) && existing.items.length > 0,
      meta: {
        ...(existing.meta || {}),
        stale: true,
        degraded: true,
        refreshFailed: true,
        seed: isSeedPayload(existing),
        detail: firstString([
          live.meta && live.meta.detail,
          isSeedPayload(existing) ? "refresh_failed_using_seed_cache" : "refresh_failed_using_existing_cache"
        ]),
        attemptedUrls: live.meta && live.meta.attemptedUrls || [],
        feedUrl: getConfiguredFeedUrl()
      }
    };
  })();

  try {
    return await refreshInFlight;
  } finally {
    refreshInFlight = null;
  }
}

async function getCachedOrRefresh(options) {
  const opts = options && typeof options === "object" ? options : {};
  const refreshMs = Number(opts.refreshMs) || getEnvNumber("NEWS_CANADA_REFRESH_MS", DEFAULT_REFRESH_MS);
  const staleMs = Number(opts.staleMs) || getEnvNumber("NEWS_CANADA_STALE_MS", DEFAULT_STALE_MS);
  const forceRefresh = !!opts.forceRefresh;

  const cached = readCache();

  if (forceRefresh) {
    return await refreshCache(opts);
  }

  if (cached.ok && isCacheFresh(cached, refreshMs)) {
    return {
      ...cached,
      meta: {
        ...(cached.meta || {}),
        stale: false,
        servedFrom: "fresh_cache"
      }
    };
  }

  if (cached.ok && !isCacheStale(cached, staleMs)) {
    refreshCache(opts).catch(() => {});
    return {
      ...cached,
      meta: {
        ...(cached.meta || {}),
        stale: false,
        servedFrom: "cache_background_refresh"
      }
    };
  }

  if (cached.ok && isCacheStale(cached, staleMs)) {
    refreshCache(opts).catch(() => {});
    return {
      ...cached,
      meta: {
        ...(cached.meta || {}),
        stale: true,
        servedFrom: "stale_cache_background_refresh"
      }
    };
  }

  return await refreshCache(opts);
}

module.exports = {
  CACHE_FILE,
  CACHE_DIR,
  readCache,
  writeCache,
  refreshCache,
  getCachedOrRefresh,
  fetchLiveNewsCanada
};

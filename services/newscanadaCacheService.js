"use strict";

const fs = require("fs");
const path = require("path");

const CACHE_VERSION = "newscanada-cache-v3";
const DEFAULT_REFRESH_MS = Number(process.env.NEWS_CANADA_REFRESH_MS || 30 * 60 * 1000);
const DEFAULT_STALE_MS = Number(process.env.NEWS_CANADA_STALE_MS || 60 * 60 * 1000);
const DEFAULT_TIMEOUT_MS = Number(process.env.NEWS_CANADA_RSS_TIMEOUT_MS || 30000);
const DEFAULT_MAX_ITEMS = Number(process.env.NEWS_CANADA_MAX_ITEMS || 6);
const DEFAULT_RETRIES = Number(process.env.NEWS_CANADA_FETCH_RETRIES || 2);
const DEFAULT_RETRY_BASE_MS = Number(process.env.NEWS_CANADA_FETCH_RETRY_BASE_MS || 1200);

const CACHE_DIR = cleanText(process.env.NEWSCANADA_CACHE_DIR || process.env.NEWS_CANADA_CACHE_DIR || "") || path.join(__dirname, "..", "data", "newscanada");
const CACHE_FILE = cleanText(process.env.NEWSCANADA_CACHE_FILE || process.env.NEWS_CANADA_CACHE_FILE || "") || path.join(CACHE_DIR, "newscanada.cache.json");
const CACHE_FILE_CANDIDATES = unique([
  CACHE_FILE,
  path.join(CACHE_DIR, "newscanada.cache.json"),
  path.join(__dirname, "..", "data", "newscanada", "newscanada.cache.json"),
  path.join(__dirname, "..", "Data", "newscanada", "newscanada.cache.json"),
  path.join(process.cwd(), "data", "newscanada", "newscanada.cache.json"),
  path.join(process.cwd(), "Data", "newscanada", "newscanada.cache.json"),
  path.join(process.cwd(), ".newscanada-feed-cache.json")
]);

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

function normalizeFeedBodyText(value) {
  return cleanText(
    stripTags(value)
      .replace(/The post\s+.+?\s+appeared first on\s+.+?\.?$/i, "")
      .replace(/Continue reading\s*$/i, "")
  );
}

function extractImageFromHtml(value) {
  const html = safeStr(value);
  const match = /<img\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/i.exec(html);
  return cleanText(match && match[1] || "");
}

function preferImageUrl(...values) {
  for (const value of values) {
    const url = cleanText(value);
    if (!url) continue;
    if (/\.(png|jpe?g|webp|gif|avif|svg)(?:[?#].*)?$/i.test(url)) return url;
    if (/\/wp-content\/uploads\//i.test(url) && !/\.(mp4|webm|mov|m4v)(?:[?#].*)?$/i.test(url)) return url;
  }
  for (const value of values) {
    const url = cleanText(value);
    if (url) return url;
  }
  return "";
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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms) || 0)));
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

function ensureDirForFile(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
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
  ensureDirForFile(filePath);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
}

function getReadableCachePath() {
  for (const candidate of CACHE_FILE_CANDIDATES) {
    try {
      if (candidate && fs.existsSync(candidate)) return candidate;
    } catch (_) {}
  }
  return CACHE_FILE;
}

function getWritableCachePath() {
  return CACHE_FILE || getReadableCachePath();
}

function getFeedOriginCandidates() {
  const primary = getConfiguredFeedUrl();
  const derived = [];
  try {
    const base = new URL(primary);
    derived.push(`${base.origin}/wp-json/wp/v2/posts?per_page=${DEFAULT_MAX_ITEMS}&_embed=1&_fields=id,date,link,slug,title,excerpt,content,yoast_head_json,_embedded`);
    derived.push(`${base.origin}/index.php?rest_route=/wp/v2/posts&per_page=${DEFAULT_MAX_ITEMS}&_embed=1`);
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

async function fetchWithTimeout(url, mode, timeoutMs, retries = DEFAULT_RETRIES) {
  let lastError = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = typeof AbortController === "function" ? new AbortController() : null;
    const timer = controller ? setTimeout(() => { try { controller.abort(); } catch (_) {} }, timeoutMs) : null;
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
        text,
        attempt: attempt + 1
      };
    } catch (err) {
      lastError = err;
      if (attempt < retries) {
        await sleep(getEnvNumber("NEWS_CANADA_FETCH_RETRY_BASE_MS", DEFAULT_RETRY_BASE_MS) * Math.pow(2, attempt));
      }
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
  throw lastError || new Error("fetch_failed");
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
    const excerptHtml = safeStr(post && post.excerpt && post.excerpt.rendered);
    const contentHtml = safeStr(post && post.content && post.content.rendered);
    const excerpt = normalizeFeedBodyText(excerptHtml);
    const content = normalizeFeedBodyText(contentHtml);
    const summary = cleanText(excerpt || clipText(content, 320));
    const body = cleanText(content || summary);
    const author = firstString([
      post && post.author_name,
      post && post._embedded && Array.isArray(post._embedded.author) && post._embedded.author[0] && post._embedded.author[0].name
    ]);
    const image = preferImageUrl(
      extractWpFeaturedImage(post),
      extractImageFromHtml(contentHtml),
      extractImageFromHtml(excerptHtml)
    );
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
      mediaUrl: "",
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
  }).filter((item) => item && item.title && item.url);

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
    const descriptionHtml = firstXmlTagValue(block, ["description"]);
    const contentHtml = firstXmlTagValue(block, ["content:encoded", "excerpt:encoded", "content", "summary"]);
    const description = normalizeFeedBodyText(descriptionHtml);
    const content = normalizeFeedBodyText(contentHtml);
    const url = firstString([
      firstXmlAttrValue(block, ["link"], "href"),
      firstXmlTagValue(block, ["link"]),
      firstXmlTagValue(block, ["guid"])
    ]);
    const pubDate = firstString([
      firstXmlTagValue(block, ["pubDate", "published", "updated", "dc:date"])
    ]);
    const author = stripTags(firstXmlTagValue(block, ["dc:creator", "author", "creator"])) || "For Your Life";
    const mediaUrl = firstString([
      firstXmlAttrValue(block, ["media:content", "media:thumbnail"], "url"),
      firstXmlTagValue(block, ["image"]),
      extractImageFromHtml(contentHtml),
      extractImageFromHtml(descriptionHtml),
      firstXmlAttrValue(block, ["enclosure"], "url")
    ]);
    const image = preferImageUrl(mediaUrl);
    const summary = cleanText(description || clipText(content, 320) || title);
    const body = cleanText(content || description || summary);

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
      mediaUrl: cleanText(mediaUrl || ""),
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
  }).filter((item) => item && item.title && item.url);

  return items.slice(0, DEFAULT_MAX_ITEMS);
}

function normalizeHtmlFeed(htmlText, sourceUrl) {
  const html = safeStr(htmlText);
  const items = [];
  const seen = new Set();
  const anchorRe = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = anchorRe.exec(html)) && items.length < DEFAULT_MAX_ITEMS) {
    const url = cleanText(decodeHtml(match[1] || ""));
    const title = stripTags(match[2] || "");
    if (!/^https?:\/\//i.test(url)) continue;
    if (!title || title.length < 12) continue;
    if (/\/feed\/|\/wp-json\/|\/tag\/|\/category\//i.test(url)) continue;
    const key = `${url}|${title.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const summary = clipText(normalizeFeedBodyText(html.slice(Math.max(0, match.index - 600), Math.min(html.length, match.index + 1400))), 260) || title;
    items.push({
      id: `html-${items.length}`,
      guid: `html-${items.length}`,
      slug: cleanText(title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")) || `html-${items.length}`,
      title,
      headline: title,
      description: summary,
      summary,
      body: summary,
      content: summary,
      link: url,
      url,
      sourceUrl: url,
      canonicalUrl: url,
      pubDate: "",
      publishedAt: "",
      image: "",
      popupImage: "",
      popupBody: summary,
      author: "For Your Life",
      byline: "For Your Life",
      category: "For Your Life",
      chipLabel: "News Canada",
      ctaText: "Read full story",
      source: "For Your Life",
      sourceName: "For Your Life",
      parserMode: "html_anchor_fallback",
      feedUrl: sourceUrl,
      isActive: true
    });
  }
  return items;
}

function normalizeFeedText(text, contentType, sourceUrl) {
  const type = cleanText(contentType).toLowerCase();
  const xmlItems = normalizeRssXml(text, sourceUrl);
  if (xmlItems.length) return { items: xmlItems, parserMode: "rss_xml_parser" };
  if (/text\/html|application\/xhtml\+xml/.test(type) || /<html\b/i.test(safeStr(text))) {
    const htmlItems = normalizeHtmlFeed(text, sourceUrl);
    if (htmlItems.length) return { items: htmlItems, parserMode: "html_anchor_fallback" };
  }
  return { items: [], parserMode: "no_items" };
}

function buildEmptyContract(reason) {
  return {
    ok: false,
    items: [],
    meta: {
      source: "cache",
      mode: "live_origin_backed_cache",
      fetchedAt: now(),
      lastSuccessAt: 0,
      itemCount: 0,
      cacheVersion: CACHE_VERSION,
      stale: true,
      detail: cleanText(reason || "no_cache_available"),
      cachePath: getReadableCachePath(),
      cacheCandidates: CACHE_FILE_CANDIDATES
    }
  };
}

function readCache() {
  const filePath = getReadableCachePath();
  const cached = filePath ? readJsonFile(filePath) : null;
  if (!cached || !Array.isArray(cached.items) || !cached.meta) {
    return buildEmptyContract("cache_missing");
  }
  const normalized = {
    ...cached,
    meta: {
      ...(cached.meta || {}),
      cachePath: filePath,
      cacheCandidates: CACHE_FILE_CANDIDATES
    }
  };
  if (isSeedPayload(normalized) || !normalized.items.some((item) => item && item.url && item.title)) {
    return {
      ...normalized,
      ok: false,
      items: [],
      meta: {
        ...(normalized.meta || {}),
        stale: true,
        degraded: true,
        seed: true,
        detail: firstString([cleanText(normalized.meta && normalized.meta.detail), "seed_cache_rejected"])
      }
    };
  }
  return normalized;
}

function writeCache(items, metaPatch) {
  const safeItems = Array.isArray(items) ? items.slice(0, DEFAULT_MAX_ITEMS) : [];
  const writtenAt = now();
  const payload = {
    ok: safeItems.length > 0,
    items: safeItems,
    meta: {
      source: "cache",
      mode: "live_origin_backed_cache",
      fetchedAt: writtenAt,
      lastSuccessAt: writtenAt,
      itemCount: safeItems.length,
      cacheVersion: CACHE_VERSION,
      stale: false,
      feedUrl: getConfiguredFeedUrl(),
      cachePath: getWritableCachePath(),
      cacheCandidates: CACHE_FILE_CANDIDATES,
      ...(metaPatch && typeof metaPatch === "object" ? metaPatch : {})
    }
  };
  writeJsonFile(getWritableCachePath(), payload);
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
  const retries = Number(options && options.retries);
  const attempts = [];
  const candidates = getFeedOriginCandidates();

  for (const url of candidates) {
    const mode = /wp-json|rest_route/i.test(url) ? "wp_rest" : "rss";
    try {
      const result = await fetchWithTimeout(url, mode, timeoutMs, Number.isFinite(retries) ? retries : DEFAULT_RETRIES);
      attempts.push({
        url,
        mode,
        status: result.status,
        ok: result.ok,
        finalUrl: result.url,
        contentType: result.contentType,
        attempt: result.attempt
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
              sample: clipText(result.text, 240),
              feedUrl: getConfiguredFeedUrl()
            }
          };
        }
      } else {
        const parsed = normalizeFeedText(result.text, result.contentType, result.url || url);
        if (parsed.items.length) {
          return {
            ok: true,
            items: parsed.items,
            meta: {
              source: "live_origin",
              mode: "rss",
              parserMode: parsed.parserMode,
              resolvedUrl: result.url || url,
              contentType: result.contentType,
              attemptedUrls: attempts,
              sample: clipText(result.text, 240),
              feedUrl: getConfiguredFeedUrl()
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
        stale: false,
        degraded: false,
        feedUrl: live.meta && live.meta.feedUrl || getConfiguredFeedUrl(),
        detail: "live_refresh_success"
      });
    }

    const existing = readCache();
    return {
      ...existing,
      ok: !!(existing && existing.ok && Array.isArray(existing.items) && existing.items.length > 0),
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
        feedUrl: getConfiguredFeedUrl(),
        cachePath: getReadableCachePath(),
        cacheCandidates: CACHE_FILE_CANDIDATES
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
  const forceRefresh = !!opts.forceRefresh || !!opts.clearCache || true;

  if (opts.clearCache) clearCacheFiles();

  const liveRefreshed = await refreshCache({ ...opts, forceRefresh });
  if (liveRefreshed && liveRefreshed.ok && Array.isArray(liveRefreshed.items) && liveRefreshed.items.length) {
    return liveRefreshed;
  }

  const cached = readCache();
  if (cached.ok && Array.isArray(cached.items) && cached.items.length) {
    return {
      ...cached,
      meta: {
        ...(cached.meta || {}),
        stale: true,
        degraded: true,
        servedFrom: "validated_cache_after_live_failure"
      }
    };
  }

  return await refreshCache(opts);
}


function listCacheFiles() {
  return CACHE_FILE_CANDIDATES.map((candidate) => {
    const filePath = cleanText(candidate);
    if (!filePath) {
      return { path: "", exists: false, size: 0, mtimeMs: 0 };
    }
    try {
      if (!fs.existsSync(filePath)) {
        return { path: filePath, exists: false, size: 0, mtimeMs: 0 };
      }
      const stat = fs.statSync(filePath);
      return {
        path: filePath,
        exists: stat.isFile(),
        size: stat.isFile() ? Number(stat.size || 0) : 0,
        mtimeMs: Number(stat.mtimeMs || 0)
      };
    } catch (_) {
      return { path: filePath, exists: false, size: 0, mtimeMs: 0, error: "stat_failed" };
    }
  });
}

function clearCacheFiles() {
  const cleared = [];
  const missing = [];
  const failed = [];
  for (const candidate of CACHE_FILE_CANDIDATES) {
    const filePath = cleanText(candidate);
    if (!filePath) continue;
    try {
      if (!fs.existsSync(filePath)) {
        missing.push(filePath);
        continue;
      }
      fs.unlinkSync(filePath);
      cleared.push(filePath);
    } catch (err) {
      failed.push({ path: filePath, error: cleanText(err && (err.message || err) || "unlink_failed") });
    }
  }
  return {
    ok: failed.length === 0,
    cleared,
    missing,
    failed,
    cacheCandidates: CACHE_FILE_CANDIDATES.slice()
  };
}

async function clearAndRefreshCache(options) {
  const cleared = clearCacheFiles();
  const refreshed = await refreshCache({ ...(options && typeof options === "object" ? options : {}), forceRefresh: true });
  return {
    ok: !!(refreshed && refreshed.ok),
    cleared,
    refreshed,
    cacheFiles: listCacheFiles()
  };
}

module.exports = {
  CACHE_FILE,
  CACHE_DIR,
  CACHE_FILE_CANDIDATES,
  readCache,
  writeCache,
  refreshCache,
  getCachedOrRefresh,
  fetchLiveNewsCanada,
  getReadableCachePath,
  getWritableCachePath,
  listCacheFiles,
  clearCacheFiles,
  clearAndRefreshCache
};

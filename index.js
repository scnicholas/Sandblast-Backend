"use strict";

/**
 * Sandblast Backend — index.js
 *
 * index.js v2.12.2sb TTS-HARDENED-AUDIO-CONTRACT + NEWSCANADA-MOUNT-FIX
 * ------------------------------------------------------------
 * PURPOSE
 * - Tightened backend shell
 * - Removes duplicate replay authority from index layer
 * - Keeps Chat Engine as the semantic turn authority
 * - Uses TTS as the single synthesis authority
 * - Preserves frontend voice route contract without provider-side dispatch authority
 * - Keeps fail-open rendering contract
 * - Hardens TTS route error handling and response finalization
 * - Adds affect/stabilize/fail-safe unification
 * - Adds loop suppression / stale-UI wipe discipline
 * - Adds TTS response normalization so playable audio always streams when available
 * - Strengthens News Canada file mount / hydration into app.locals
 */

const express = require("express");
const path = require("path");
const fs = require("fs");

let compression = null;
try {
  compression = require("compression");
} catch (_) {
  compression = null;
}

const INDEX_VERSION = "index.js v2.17.0sb MARION-AUTHORITY-LOCK + MARION-CONTRACT-HARDENED + MIXER-VOICE-PRESERVE + NEWSCANADA-CACHE-FIRST-CONTRACT + NEWSCANADA-CACHE-PATH-HARDENED + NEWSCANADA-CACHE-DATA-CAPS-COMPAT + NEWSCANADA-WP-REST-PRIMARY + NEWSCANADA-RSS-BACKEND-ONLY + NEWSCANADA-RSS-PARSER-HARDENED + NEWSCANADA-RSS-CANDIDATE-FEEDS + NEWSCANADA-RSS-HTML-FALLBACK + NEWSCANADA-RSS-DIAGNOSTICS-HARDENED + NEWSCANADA-RSS-SERVICE-MODULARIZED + NEWSCANADA-MANUAL-RSS-ROUTE-MOUNT + NEWSCANADA-COMPAT-ALIASES + ROUTE-DIAGNOSTIC-HINTS + MUSIC-BRIDGE-STRICT-CONTRACT + OPS-DIAGNOSTIC-HARDENING + SUPPORT-OVERRIDE-CONTRACT";
const SERVER_BOOT_AT = Date.now();

process.on("unhandledRejection", (reason) => {
  console.log("[Sandblast][unhandledRejection]", reason && (reason.stack || reason.message || reason));
});

process.on("uncaughtException", (err) => {
  console.log("[Sandblast][uncaughtException]", err && (err.stack || err.message || err));
  try {
    if (err && String(err.message || "").includes("EADDRINUSE")) process.exit(1);
  } catch (_) {}
});

function tryRequireMany(paths) {
  for (const p of paths) {
    try {
      const mod = require(p);
      if (mod) return mod;
    } catch (_) {}
  }
  return null;
}

function moduleAvailable(name) {
  try {
    require.resolve(name);
    return true;
  } catch (_) {
    return false;
  }
}

const envLoader = tryRequireMany(["dotenv", "./node_modules/dotenv"]);
if (envLoader && typeof envLoader.config === "function") {
  try { envLoader.config(); } catch (_) {}
}

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", true);
app.locals.musicTopMoments = [];
app.locals.musicSources = [];
app.locals.musicMeta = { ok: false, file: "", count: 0, loadedAt: 0, source: "empty", degraded: false };

if (compression) {
  app.use(compression());
}

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: false, limit: "10mb" }));

const PORT = Number(process.env.PORT || 3000);
const PUBLIC_DIR = path.join(__dirname, "public");
const PUBLIC_NEWSCANADA_DIR = path.join(__dirname, "public newscanada");
const STATIC_PUBLIC_DIRS = uniq([PUBLIC_DIR, PUBLIC_NEWSCANADA_DIR]).filter((dir) => {
  try {
    return fs.existsSync(dir);
  } catch (_) {
    return false;
  }
});

function safeStr(v) {

  return typeof v === "string" ? v : v == null ? "" : String(v);
}

function now() {
  return Date.now();
}

function lower(v) {
  return safeStr(v).toLowerCase();
}

function clamp(n, min, max) {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function uniq(arr) {
  return Array.from(new Set(Array.isArray(arr) ? arr.filter(Boolean) : []));
}

function isObj(v) {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function cleanText(v) {
  return safeStr(v).replace(/\s+/g, " ").trim();
}

function firstString(arr) {
  for (const v of Array.isArray(arr) ? arr : []) {
    const s = cleanText(v);
    if (s) return s;
  }
  return "";
}

function clipText(v, max) {
  const s = cleanText(v);
  const n = clamp(Number(max || 280), 32, 4000);
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

function maskSecret(v) {
  const s = cleanText(v);
  if (!s) return "";
  if (s.length <= 8) return "********";
  return `${s.slice(0, 4)}…${s.slice(-4)}`;
}

function cleanReplyForUser(v) {
  let t = cleanText(v);
  if (!t) return "";
  t = t.replace(/\bthe backend hit a rough patch,?\s*but i can keep this steady without bouncing you into a menu\.?/ig, "I am here with you. We can take this one step at a time.");
  t = t.replace(/\bthe backend hit a rough patch,?\s*but i can keep this steady without dropping you into a menu\.?/ig, "I am here with you. We can take this one step at a time.");
  t = t.replace(/\b(bouncing|dropping)\s+you\s+into\s+a\s+menu\b/ig, "shifting gears too quickly");
  t = t.replace(/\bbackend\b/ig, "system");
  t = t.replace(/\s+([,.!?])/g, "$1").trim();
  return t;
}

function replyHash(v) {
  const s = cleanText(v).toLowerCase();
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h) + s.charCodeAt(i);
    h |= 0;
  }
  return String(h);
}

function makeTraceId(prefix) {
  return `${prefix || "trace"}_${Date.now().toString(16)}_${Math.random().toString(16).slice(2, 8)}`;
}

function boolEnv(name, fallback) {
  const raw = lower(process.env[name]);
  if (!raw) return !!fallback;
  if (["1", "true", "yes", "on"].includes(raw)) return true;
  if (["0", "false", "no", "off"].includes(raw)) return false;
  return !!fallback;
}

function parseOrigins(raw) {
  return uniq(
    cleanText(raw || "")
      .split(",")
      .map((s) => cleanText(s))
      .filter(Boolean)
  );
}

function sameHost(a, b) {
  try {
    return new URL(a).host === new URL(b).host;
  } catch (_) {
    return false;
  }
}

function getBackendPublicBase() {
  return cleanText(
    process.env.SB_BACKEND_PUBLIC_BASE_URL ||
    process.env.SANDBLAST_BACKEND_PUBLIC_BASE_URL ||
    process.env.RENDER_EXTERNAL_URL ||
    "https://sandblast-backend.onrender.com"
  ).replace(/\/$/, "");
}

function routeUrl(pathname) {
  const base = getBackendPublicBase();
  const p = pathname.startsWith("/") ? pathname : `/${pathname}`;
  return `${base}${p}`;
}

const CFG = {
  apiTokenHeader: process.env.SB_WIDGET_TOKEN_HEADER || process.env.SBNYX_WIDGET_TOKEN_HEADER || "x-sb-widget-token",
  apiToken: process.env.SB_WIDGET_TOKEN || process.env.SBNYX_WIDGET_TOKEN || "",
  requireVoiceRouteToken: boolEnv("SB_REQUIRE_VOICE_ROUTE_TOKEN", false),
  voiceRouteEnabled: boolEnv("SB_VOICE_ROUTE_ENABLED", true),
  preserveMixerVoice: boolEnv("SB_PRESERVE_MIXER_VOICE", true),
  corsAllowCredentials: boolEnv("SB_CORS_ALLOW_CREDENTIALS", true),
  corsAllowedOrigins: parseOrigins(
    process.env.SB_CORS_ALLOWED_ORIGINS ||
    "https://www.sandblast.channel,https://sandblast.channel,http://localhost:3000,http://127.0.0.1:3000"
  ),
  quietSupportHoldTurns: clamp(Number(process.env.SB_SUPPORT_HOLD_TURNS || 2), 1, 4),
  loopSuppressionWindowMs: clamp(Number(process.env.SB_LOOP_SUPPRESSION_MS || 12000), 3000, 45000),
  duplicateReplyWindowMs: clamp(Number(process.env.SB_DUPLICATE_REPLY_MS || 15000), 3000, 45000),
  requestTimeoutMs: clamp(Number(process.env.SB_REQUEST_TIMEOUT_MS || 18000), 6000, 45000),
  httpLogEnabled: boolEnv("SB_HTTP_LOG_ENABLED", false),
  httpLogSlowMs: clamp(Number(process.env.SB_HTTP_LOG_SLOW_MS || 2500), 250, 30000),
  logHealthCalls: boolEnv("SB_LOG_HEALTH_CALLS", false),
  memoryTtlMs: clamp(Number(process.env.SB_MEMORY_TTL_MS || 30 * 60 * 1000), 60000, 24 * 60 * 60 * 1000),
  memorySweepEveryMs: clamp(Number(process.env.SB_MEMORY_SWEEP_EVERY_MS || 60 * 1000), 10000, 10 * 60 * 1000),
  port: PORT
};

function isAllowedOrigin(origin) {
  const o = cleanText(origin);
  if (!o) return true;
  if (CFG.corsAllowedOrigins.includes("*")) return true;
  return CFG.corsAllowedOrigins.includes(o) || CFG.corsAllowedOrigins.some((x) => sameHost(x, o));
}

function applyCors(req, res) {
  const origin = cleanText(req.headers.origin || "");
  const reqHeaders = cleanText(req.headers["access-control-request-headers"] || "");
  const allowHeaders = uniq([
    "Content-Type",
    "Authorization",
    "x-sb-trace-id",
    CFG.apiTokenHeader,
    ...reqHeaders.split(",").map((s) => cleanText(s)).filter(Boolean)
  ]);

  if (origin && isAllowedOrigin(origin)) {
    res.header("Access-Control-Allow-Origin", origin);
    res.header("Vary", "Origin");
    if (CFG.corsAllowCredentials) {
      res.header("Access-Control-Allow-Credentials", "true");
    }
  }

  res.header("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.header("Access-Control-Allow-Headers", allowHeaders.join(", "));
  res.header("Access-Control-Expose-Headers", "x-sb-trace-id");
  return origin;
}

app.use((req, res, next) => {
  applyCors(req, res);
  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }
  return next();
});

let lastMemorySweepAt = 0;

function maybeSweepMemory() {
  const current = now();
  if (current - lastMemorySweepAt < CFG.memorySweepEveryMs) return;
  lastMemorySweepAt = current;
  const ttl = CFG.memoryTtlMs;
  const prune = (mapObj) => {
    if (!mapObj || typeof mapObj.forEach !== "function") return;
    for (const [key, value] of mapObj.entries()) {
      const at = Number((value && value.at) || (value && value.updatedAt) || 0);
      if (!at || current - at > ttl) mapObj.delete(key);
    }
  };
  prune(memory.lastBySession);
  prune(memory.supportBySession);
  prune(memory.transportBySession);
}

function shouldLogRequest(req, statusCode, durationMs) {
  const url = cleanText(req.originalUrl || req.url || req.path || "");
  if (CFG.httpLogEnabled) return true;
  if (Number(durationMs || 0) >= CFG.httpLogSlowMs) return true;
  if (Number(statusCode || 0) >= 500) return true;
  if (CFG.logHealthCalls && /\/health(?:$|\/|\?)/i.test(url)) return true;
  return false;
}

app.use((req, res, next) => {
  maybeSweepMemory();
  const startedAt = now();
  const traceId = cleanText(req.headers["x-sb-trace-id"] || makeTraceId("http"));
  req.sbTraceId = traceId;
  res.setHeader("x-sb-trace-id", traceId);
  res.on("finish", () => {
    const durationMs = now() - startedAt;
    if (!shouldLogRequest(req, res.statusCode, durationMs)) return;
    console.log("[Sandblast][http]", {
      traceId,
      method: req.method,
      path: req.originalUrl || req.url || req.path || "",
      status: res.statusCode,
      durationMs,
      sessionId: getSessionId(req)
    });
  });
  return next();
});

const chatEngineMod = tryRequireMany([
  "./chatEngine",
  "./chatEngine.js",
  "./ChatEngine",
  "./ChatEngine.js",
  "./utils/chatEngine",
  "./utils/chatEngine.js",
  "./Utils/chatEngine",
  "./Utils/chatEngine.js"
]);

const supportResponseMod = tryRequireMany([
  "./supportResponse",
  "./supportResponse.js",
  "./utils/supportResponse",
  "./utils/supportResponse.js",
  "./Utils/supportResponse",
  "./Utils/supportResponse.js"
]);

const voiceRouteMod = tryRequireMany([
  "./utils/voiceRoute",
  "./utils/voiceRoute.js",
  "./Utils/voiceRoute",
  "./Utils/voiceRoute.js"
]);

const ttsMod = tryRequireMany([
  "./tts",
  "./tts.js",
  "./utils/tts",
  "./utils/tts.js",
  "./Utils/tts",
  "./Utils/tts.js"
]);

const newscanadaCacheServiceMod = tryRequireMany([
  "./services/newscanadaCacheService",
  "./services/newscanadaCacheService.js",
  "./Services/newscanadaCacheService",
  "./Services/newscanadaCacheService.js",
  "./utils/newscanadaCacheService",
  "./utils/newscanadaCacheService.js",
  "./Utils/newscanadaCacheService",
  "./Utils/newscanadaCacheService.js"
]);

const newscanadaCacheJobMod = tryRequireMany([
  "./services/newscanadaCacheJob",
  "./services/newscanadaCacheJob.js",
  "./Services/newscanadaCacheJob",
  "./Services/newscanadaCacheJob.js",
  "./utils/newscanadaCacheJob",
  "./utils/newscanadaCacheJob.js",
  "./Utils/newscanadaCacheJob",
  "./Utils/newscanadaCacheJob.js"
]);

const newsCanadaFeedServiceMod = tryRequireMany([
  "./services/newsCanadaFeedService",
  "./services/newsCanadaFeedService.js",
  "./Services/newsCanadaFeedService",
  "./Services/newsCanadaFeedService.js",
  "./utils/newsCanadaFeedService",
  "./utils/newsCanadaFeedService.js",
  "./Utils/newsCanadaFeedService",
  "./Utils/newsCanadaFeedService.js",
  "./public newscanada/js/newsCanadaApi",
  "./public newscanada/js/newsCanadaApi.js",
  "./public newscanada/js/newscanada.rss.service",
  "./public newscanada/js/newscanada.rss.service.js"
]);


const newsCanadaRoutesMod = tryRequireMany([
  "./routes/newscanada.routes",
  "./routes/newscanada.routes.js",
  "./routes/manualNewsCanadaRoutes",
  "./routes/manualNewsCanadaRoutes.js",
  "./routes/newscanadaRoutes",
  "./routes/newscanadaRoutes.js"
]);

function resolveExpressRouterFromModule(mod) {
  if (!mod) return null;
  if (typeof mod === "function" && typeof mod.use === "function") return mod;
  if (mod.default && typeof mod.default === "function" && typeof mod.default.use === "function") return mod.default;
  if (mod.router && typeof mod.router === "function" && typeof mod.router.use === "function") return mod.router;
  if (typeof mod.createRouter === "function") {
    try {
      const built = mod.createRouter();
      if (built && typeof built.use === "function") return built;
    } catch (_) {}
  }
  return null;
}

const marionBridgeMod = tryRequireMany([

  "./marionBridge",
  "./marionBridge.js",
  "./utils/marionBridge",
  "./utils/marionBridge.js",
  "./Utils/marionBridge",
  "./Utils/marionBridge.js",
  "./runtime/marionBridge",
  "./runtime/marionBridge.js"
]);

const affectEngineMod = tryRequireMany([
  "./affectEngine",
  "./affectEngine.js",
  "./utils/affectEngine",
  "./utils/affectEngine.js",
  "./Utils/affectEngine",
  "./Utils/affectEngine.js"
]);

const knowledgeRuntimeMod = tryRequireMany([
  "./Utils/knowledgeRuntime",
  "./Utils/knowledgeRuntime.js",
  "./utils/knowledgeRuntime",
  "./utils/knowledgeRuntime.js"
]);

const musicLaneMod = tryRequireMany([
  "./musicLane",
  "./musicLane.js",
  "./utils/musicLane",
  "./utils/musicLane.js",
  "./Utils/musicLane",
  "./Utils/musicLane.js"
]);

const musicResolverMod = tryRequireMany([
  "./musicResolver",
  "./musicResolver.js",
  "./utils/musicResolver",
  "./utils/musicResolver.js",
  "./Utils/musicResolver",
  "./Utils/musicResolver.js"
]);

const musicKnowledgeMod = tryRequireMany([
  "./musicKnowledge",
  "./musicKnowledge.js",
  "./utils/musicKnowledge",
  "./utils/musicKnowledge.js",
  "./Utils/musicKnowledge",
  "./Utils/musicKnowledge.js"
]);

const knowledgeRuntime = {
  available: !!knowledgeRuntimeMod,
  extract(query, opts) {
    try {
      if (knowledgeRuntimeMod && typeof knowledgeRuntimeMod.extract === "function") {
        return knowledgeRuntimeMod.extract(query, opts || {});
      }
      if (knowledgeRuntimeMod && typeof knowledgeRuntimeMod.retrieve === "function") {
        return knowledgeRuntimeMod.retrieve(query, opts || {});
      }
    } catch (_) {}
    return { ok: false, loaded: false, source: "index_fallback", extracted: true };
  }
};

function resolveNewsCanadaFeedUrl() {
  return cleanText(
    process.env.NEWS_CANADA_FEED_URL ||
    process.env.NEWS_CANADA_RSS_FEED_URL ||
    process.env.SB_NEWSCANADA_RSS_FEED_URL ||
    "https://foryourlife.ca/feed/"
  );
}

function resolveNewsCanadaFeedCandidates() {
  const primary = resolveNewsCanadaFeedUrl();
  const configured = uniq([
    primary,
    cleanText(process.env.NEWS_CANADA_FEED_URL_ALT || ""),
    cleanText(process.env.NEWS_CANADA_RSS_FEED_URL_ALT || ""),
    cleanText(process.env.SB_NEWSCANADA_RSS_FEED_URL_ALT || "")
  ].filter(Boolean));

  const derived = [];
  const seed = primary || "https://foryourlife.ca/feed/";
  try {
    const base = new URL(seed);
    derived.push(`${base.origin}/feed/`);
    derived.push(`${base.origin}/?feed=rss2`);
    derived.push(`${base.origin}/index.php?feed=rss2`);
    derived.push(`${base.origin}/feed/rss2/`);
  } catch (_) {}

  return uniq([...configured, ...derived].map((v) => cleanText(v)).filter(Boolean));
}

function resolveNewsCanadaApiCandidates() {
  const feedCandidates = resolveNewsCanadaFeedCandidates();
  const out = [];
  for (const candidate of feedCandidates) {
    try {
      const base = new URL(candidate);
      out.push(`${base.origin}/wp-json/wp/v2/posts?per_page=6&_embed=1&_fields=id,date,link,slug,title,excerpt,content,yoast_head_json,_embedded`);
      out.push(`${base.origin}/index.php?rest_route=/wp/v2/posts&per_page=6&_embed=1`);
    } catch (_) {}
  }
  return uniq(out.map((v) => cleanText(v)).filter(Boolean));
}

function decodeWpRendered(value) {
  if (isObj(value)) return stripTags(value.rendered || value.raw || "");
  return stripTags(value);
}

function extractWpFeaturedImage(post) {
  const embedded = isObj(post && post._embedded) ? post._embedded : {};
  const mediaArr = Array.isArray(embedded['wp:featuredmedia']) ? embedded['wp:featuredmedia'] : [];
  for (const media of mediaArr) {
    const direct = cleanText(media && (media.source_url || media.link || media.guid && media.guid.rendered));
    if (direct) return direct;
    const sizes = isObj(media && media.media_details && media.media_details.sizes) ? media.media_details.sizes : {};
    for (const key of ['full','large','medium_large','medium','thumbnail']) {
      const cand = cleanText(sizes[key] && sizes[key].source_url);
      if (cand) return cand;
    }
  }
  const yoast = isObj(post && post.yoast_head_json) ? post.yoast_head_json : {};
  if (Array.isArray(yoast.og_image)) {
    for (const img of yoast.og_image) {
      const cand = cleanText(img && (img.url || img.src));
      if (cand) return cand;
    }
  }
  return "";
}

function parseNewsCanadaWpPostsJson(raw, sourceUrl) {
  const arr = Array.isArray(raw) ? raw : (Array.isArray(raw && raw.posts) ? raw.posts : []);
  const parserMode = 'wp_rest_posts_parser';
  const items = arr.map((post, index) => {
    const title = decodeWpRendered(post && post.title) || `Story ${index + 1}`;
    const excerpt = decodeWpRendered(post && post.excerpt);
    const content = decodeWpRendered(post && post.content);
    const summary = cleanText(excerpt || clipText(content, 320));
    const author = firstString([post && post.author_name, post && post._embedded && Array.isArray(post._embedded.author) && post._embedded.author[0] && post._embedded.author[0].name]);
    return buildNewsCanadaItem({
      id: cleanText(post && post.id),
      guid: cleanText(post && post.id),
      slug: cleanText(post && post.slug),
      title,
      headline: title,
      description: cleanText(summary || content),
      summary,
      body: cleanText(content || summary),
      content: cleanText(content || summary),
      link: cleanText(post && post.link),
      url: cleanText(post && post.link),
      sourceUrl: cleanText(post && post.link),
      canonicalUrl: cleanText(post && post.link),
      pubDate: cleanText(post && post.date),
      publishedAt: cleanText(post && post.date),
      image: extractWpFeaturedImage(post),
      popupImage: extractWpFeaturedImage(post),
      popupBody: cleanText(content || summary),
      byline: author,
      author,
      category: 'For Your Life',
      chipLabel: 'RSS Feed',
      source: 'For Your Life',
      sourceName: 'For Your Life',
      parserMode
    }, index, sourceUrl, parserMode);
  }).filter((item) => item && (item.title || item.summary || item.url));
  return { items, parserMode };
}

function decodeXmlEntities(value) {
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
  return cleanText(decodeXmlEntities(value).replace(/<[^>]+>/g, " "));
}

function firstXmlTagValue(block, tagNames) {
  const names = Array.isArray(tagNames) ? tagNames : [tagNames];
  for (const tagName of names) {
    const safeTag = cleanText(tagName).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (!safeTag) continue;
    const match = new RegExp(`<${safeTag}\\b[^>]*>([\\s\\S]*?)<\\/${safeTag}>`, "i").exec(block);
    if (match && cleanText(match[1])) return decodeXmlEntities(match[1]);
  }
  return "";
}

function allXmlTagValues(block, tagNames) {
  const names = Array.isArray(tagNames) ? tagNames : [tagNames];
  const out = [];
  for (const tagName of names) {
    const safeTag = cleanText(tagName).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (!safeTag) continue;
    const re = new RegExp(`<${safeTag}\\b[^>]*>([\\s\\S]*?)<\\/${safeTag}>`, "ig");
    let match;
    while ((match = re.exec(block))) {
      const value = decodeXmlEntities(match[1]);
      if (cleanText(value)) out.push(value);
    }
  }
  return out;
}

function firstXmlAttrValue(block, tagNames, attrName) {
  const names = Array.isArray(tagNames) ? tagNames : [tagNames];
  const attr = cleanText(attrName).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  for (const tagName of names) {
    const safeTag = cleanText(tagName).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (!safeTag || !attr) continue;
    const match = new RegExp(`<${safeTag}\\b[^>]*\\s${attr}=["']([^"']+)["'][^>]*\\/?>`, "i").exec(block);
    if (match && cleanText(match[1])) return decodeXmlEntities(match[1]);
  }
  return "";
}

function truncateForMeta(value, max) {
  return clipText(stripTags(value), clamp(Number(max || 240), 40, 2000));
}

function htmlDecodeForFeed(value) {
  return stripTags(value).replace(/\s+/g, " ").trim();
}

function buildNewsCanadaItem(entry, index, feedUrl, parserMode) {
  const sourceName = "For Your Life";
  const base = isObj(entry) ? { ...entry } : {};
  const title = cleanText(base.title || base.headline || `Story ${index + 1}`) || `Story ${index + 1}`;
  const description = cleanText(base.description || base.summary || base.body || base.content || "");
  const url = cleanText(base.url || base.link || base.sourceUrl || base.guid || "");
  const pubDate = cleanText(base.pubDate || base.publishedAt || base.date || "");
  const image = cleanText(base.image || base.popupImage || base.thumbnail || "");
  const author = cleanText(base.author || base.byline || "");
  const category = cleanText(base.category || sourceName) || sourceName;
  const slug = cleanText(base.slug || title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")) || `rss-${index}`;
  return {
    id: cleanText(base.id || base.guid || url || slug || `rss-${index}`) || `rss-${index}`,
    guid: cleanText(base.guid || base.id || url || slug || `rss-${index}`) || `rss-${index}`,
    slug,
    title,
    headline: title,
    description,
    summary: cleanText(base.summary || description),
    body: cleanText(base.body || description),
    content: cleanText(base.content || description),
    link: url,
    url,
    sourceUrl: cleanText(base.sourceUrl || url),
    canonicalUrl: cleanText(base.canonicalUrl || url),
    pubDate,
    publishedAt: cleanText(base.publishedAt || pubDate),
    image,
    popupImage: cleanText(base.popupImage || image),
    popupBody: cleanText(base.popupBody || description),
    byline: author,
    author,
    category,
    chipLabel: cleanText(base.chipLabel || "RSS Feed") || "RSS Feed",
    ctaText: cleanText(base.ctaText || "Read full story") || "Read full story",
    source: cleanText(base.source || sourceName) || sourceName,
    sourceName: cleanText(base.sourceName || sourceName) || sourceName,
    feedUrl: cleanText(feedUrl || resolveNewsCanadaFeedUrl()),
    parserMode: cleanText(base.parserMode || parserMode || "rss_parser") || "rss_parser",
    isActive: base.isActive !== false
  };
}

function parseNewsCanadaRssXml(xmlText, feedUrl) {
  const xml = safeStr(xmlText);
  const items = [];
  let parserMode = "no_items";
  if (!xml) return { items, parserMode };

  const itemBlocks = xml.match(/<item\b[\s\S]*?<\/item>/gi) || [];
  const entryBlocks = itemBlocks.length ? [] : (xml.match(/<entry\b[\s\S]*?<\/entry>/gi) || []);
  const blocks = itemBlocks.length ? itemBlocks : entryBlocks;

  if (blocks.length) {
    parserMode = itemBlocks.length ? "xml_item_parser" : "atom_entry_parser";
  }

  blocks.forEach((block, index) => {
    const title = stripTags(firstXmlTagValue(block, ["title"])) || `Story ${index + 1}`;
    const descriptionRaw = firstXmlTagValue(block, ["description", "content:encoded", "excerpt:encoded", "content", "summary"]);
    const description = stripTags(descriptionRaw);
    const url = cleanText(
      firstXmlAttrValue(block, ["link"], "href") ||
      firstXmlTagValue(block, ["link"]) ||
      firstXmlTagValue(block, ["guid"])
    );
    const pubDate = cleanText(firstXmlTagValue(block, ["pubDate", "published", "updated", "dc:date"]));
    const author = stripTags(firstXmlTagValue(block, ["dc:creator", "author", "creator"]));
    const category = stripTags(firstXmlTagValue(block, ["category"])) || "For Your Life";
    const image = cleanText(
      firstXmlAttrValue(block, ["media:content", "media:thumbnail", "enclosure"], "url") ||
      firstXmlTagValue(block, ["image"])
    );
    const allCategories = allXmlTagValues(block, ["category"]).map((v) => stripTags(v)).filter(Boolean);
    items.push(buildNewsCanadaItem({
      id: cleanText(firstXmlTagValue(block, ["guid", "id"])),
      guid: cleanText(firstXmlTagValue(block, ["guid", "id"])),
      title,
      headline: title,
      description,
      summary: description,
      body: description,
      content: description,
      link: url,
      url,
      sourceUrl: url,
      canonicalUrl: url,
      pubDate,
      publishedAt: pubDate,
      image,
      popupImage: image,
      popupBody: description,
      byline: author,
      author,
      category: category || firstString(allCategories),
      parserMode
    }, index, feedUrl, parserMode));
  });

  return {
    items: items.filter((item) => item && (item.title || item.summary || item.url)),
    parserMode
  };
}

function parseNewsCanadaFeedHtml(htmlText, feedUrl) {
  const html = safeStr(htmlText);
  const items = [];
  if (!html) return { items, parserMode: "html_empty" };
  const parserMode = "html_anchor_fallback";
  const anchorRe = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  const seen = new Set();
  let match;
  while ((match = anchorRe.exec(html)) && items.length < 12) {
    const href = cleanText(decodeXmlEntities(match[1] || ""));
    const anchorText = htmlDecodeForFeed(match[2] || "");
    if (!href || !anchorText) continue;
    if (!/^https?:\/\//i.test(href)) continue;
    if (/\/wp-content\/|\/wp-json\/|\/feed\/|\/tag\/|\/category\//i.test(href)) continue;
    if (anchorText.length < 12) continue;
    const dedupeKey = `${href}|${anchorText.toLowerCase()}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    const slice = html.slice(Math.max(0, match.index - 800), Math.min(html.length, match.index + 2200));
    const summary = truncateForMeta(slice, 260) || anchorText;
    items.push(buildNewsCanadaItem({
      title: anchorText,
      headline: anchorText,
      description: summary,
      summary,
      body: summary,
      content: summary,
      link: href,
      url: href,
      sourceUrl: href,
      canonicalUrl: href,
      parserMode
    }, items.length, feedUrl, parserMode));
  }
  return { items, parserMode };
}

function parseNewsCanadaFeedContent(rawText, feedUrl, contentType) {
  const text = safeStr(rawText);
  const normalizedContentType = lower(contentType || "");
  const looksLikeXml = /<(rss|feed|rdf:rdf)\b/i.test(text) || /<item\b/i.test(text) || /<entry\b/i.test(text) || /xml/i.test(normalizedContentType);
  const xmlParsed = parseNewsCanadaRssXml(text, feedUrl);
  if (xmlParsed.items.length) {
    return { items: xmlParsed.items, parserMode: xmlParsed.parserMode, contentType: normalizedContentType || "unknown" };
  }
  if (!looksLikeXml || /text\/html|application\/xhtml\+xml/i.test(normalizedContentType) || /<html\b/i.test(text)) {
    const htmlParsed = parseNewsCanadaFeedHtml(text, feedUrl);
    if (htmlParsed.items.length) {
      return { items: htmlParsed.items, parserMode: htmlParsed.parserMode, contentType: normalizedContentType || "text/html" };
    }
    return { items: [], parserMode: htmlParsed.parserMode || "html_no_items", contentType: normalizedContentType || "text/html" };
  }
  return { items: [], parserMode: xmlParsed.parserMode || "xml_no_items", contentType: normalizedContentType || "unknown" };
}


const NEWS_CANADA_CACHE_FILE = path.join(__dirname, ".newscanada-feed-cache.json");
const NEWS_CANADA_CACHE_CONTRACT_CANDIDATES = uniq([
  cleanText(process.env.NEWSCANADA_CACHE_FILE || process.env.NEWS_CANADA_CACHE_FILE || ""),
  path.join(__dirname, "data", "newscanada", "newscanada.cache.json"),
  path.join(__dirname, "Data", "newscanada", "newscanada.cache.json"),
  path.join(process.cwd(), "data", "newscanada", "newscanada.cache.json"),
  path.join(process.cwd(), "Data", "newscanada", "newscanada.cache.json"),
  path.join(process.cwd(), "backend", "data", "newscanada", "newscanada.cache.json"),
  path.join(process.cwd(), "backend", "Data", "newscanada", "newscanada.cache.json")
].filter(Boolean));

function getNewsCanadaCacheContractPaths() {
  return NEWS_CANADA_CACHE_CONTRACT_CANDIDATES.slice();
}

function readNewsCanadaCacheContractFile() {
  for (const candidate of getNewsCanadaCacheContractPaths()) {
    try {
      if (!candidate || !fs.existsSync(candidate)) continue;
      const raw = fs.readFileSync(candidate, "utf8");
      const parsed = JSON.parse(raw);
      const items = Array.isArray(parsed && parsed.items)
        ? parsed.items
        : (Array.isArray(parsed && parsed.stories) ? parsed.stories : []);
      if (!items.length) continue;
      return {
        ok: parsed && parsed.ok !== false,
        items,
        stories: items,
        meta: {
          ...(isObj(parsed && parsed.meta) ? parsed.meta : {}),
          source: cleanText(parsed && parsed.meta && (parsed.meta.source || parsed.meta.servedFrom) || "cache") || "cache",
          mode: cleanText(parsed && parsed.meta && parsed.meta.mode || "cache_first") || "cache_first",
          parserMode: cleanText(parsed && parsed.meta && parsed.meta.parserMode || "cache_contract") || "cache_contract",
          cacheContractPath: candidate,
          cacheContractCandidates: getNewsCanadaCacheContractPaths()
        }
      };
    } catch (_) {}
  }
  return null;
}

function getNewsCanadaBrowserHeaders(acceptHeader) {
  return {
    "accept": acceptHeader,
    "accept-language": "en-US,en;q=0.9",
    "cache-control": "no-cache",
    "pragma": "no-cache",
    "connection": "keep-alive",
    "upgrade-insecure-requests": "1",
    "sec-fetch-dest": "document",
    "sec-fetch-mode": "navigate",
    "sec-fetch-site": "none",
    "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36"
  };
}

function sleepMs(ms) {
  return new Promise((resolve) => setTimeout(resolve, clamp(Number(ms || 0), 0, 10000)));
}

function readNewsCanadaSnapshot() {
  try {
    if (!fs.existsSync(NEWS_CANADA_CACHE_FILE)) return null;
    const raw = fs.readFileSync(NEWS_CANADA_CACHE_FILE, "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.items) || !parsed.items.length) return null;
    return parsed;
  } catch (_) {
    return null;
  }
}

function writeNewsCanadaSnapshot(payload) {
  try {
    const out = {
      writtenAt: Date.now(),
      items: Array.isArray(payload && payload.items) ? payload.items.slice(0, 24) : [],
      meta: isObj(payload && payload.meta) ? payload.meta : {}
    };
    if (!out.items.length) return;
    fs.writeFileSync(NEWS_CANADA_CACHE_FILE, JSON.stringify(out), "utf8");
  } catch (_) {}
}

async function fetchNewsCanadaRssDirect(opts) {
  const options = isObj(opts) ? opts : {};
  if (typeof fetch !== "function") {
    throw new Error("fetch_unavailable");
  }

  const diagnostics = { attemptedUrls: [], parserMode: "uninitialized", contentType: "", resolvedUrl: "", sample: "", itemCount: 0 };
  const timeoutMs = clamp(Number(options.timeoutMs || process.env.NEWS_CANADA_RSS_TIMEOUT_MS || 30000), 5000, 45000);
  const retryCount = clamp(Number(options.retryCount || process.env.NEWS_CANADA_FETCH_RETRIES || 2), 0, 4);
  const retryBaseMs = clamp(Number(options.retryBaseMs || process.env.NEWS_CANADA_FETCH_RETRY_BASE_MS || 1200), 150, 5000);
  let lastError = null;

  const tryFetch = async (targetUrl, acceptHeader, mode) => {
    let finalErr = null;
    for (let attempt = 0; attempt <= retryCount; attempt++) {
      const controller = typeof AbortController === "function" ? new AbortController() : null;
      const timer = controller ? setTimeout(() => { try { controller.abort(); } catch (_) {} }, timeoutMs) : null;
      try {
        const res = await fetch(targetUrl, {
          method: "GET",
          redirect: "follow",
          headers: getNewsCanadaBrowserHeaders(acceptHeader),
          signal: controller ? controller.signal : undefined
        });
        const finalUrl = cleanText((res && res.url) || targetUrl) || targetUrl;
        const contentType = cleanText(res && res.headers && typeof res.headers.get === "function" ? (res.headers.get("content-type") || "") : "");
        diagnostics.attemptedUrls.push({
          url: targetUrl,
          status: Number(res && res.status || 0),
          ok: !!(res && res.ok),
          finalUrl,
          contentType,
          mode,
          attempt: attempt + 1
        });
        if (!res || !res.ok) {
          throw new Error(`${mode}_http_${res ? res.status : "failed"}`);
        }
        const rawText = await res.text();
        diagnostics.sample = truncateForMeta(rawText, 320);
        diagnostics.contentType = cleanText(contentType || diagnostics.contentType || "unknown") || "unknown";
        diagnostics.resolvedUrl = finalUrl || targetUrl;
        return { rawText, finalUrl, contentType };
      } catch (err) {
        finalErr = err;
        diagnostics.attemptedUrls.push({
          url: targetUrl,
          ok: false,
          error: cleanText(err && (err.message || err) || `${mode}_fetch_failed`),
          mode,
          attempt: attempt + 1
        });
        if (attempt < retryCount) {
          await sleepMs(retryBaseMs * Math.pow(2, attempt));
        }
      } finally {
        if (timer) clearTimeout(timer);
      }
    }
    throw finalErr || new Error(`${mode}_fetch_failed`);
  };

  for (const apiUrl of resolveNewsCanadaApiCandidates()) {
    try {
      const fetched = await tryFetch(apiUrl, "application/json, text/json;q=0.95, */*;q=0.6", "wp_rest");
      const parsedJson = JSON.parse(fetched.rawText);
      const parsed = parseNewsCanadaWpPostsJson(parsedJson, fetched.finalUrl || apiUrl);
      diagnostics.parserMode = parsed.parserMode;
      diagnostics.itemCount = Array.isArray(parsed.items) ? parsed.items.length : 0;
      if (parsed.items.length) {
        const successPayload = {
          ok: true,
          items: parsed.items,
          stories: parsed.items,
          meta: {
            source: "wp_rest_api_fallback",
            degraded: false,
            mode: "wp_rest",
            parserMode: diagnostics.parserMode,
            contentType: diagnostics.contentType,
            resolvedUrl: diagnostics.resolvedUrl,
            attemptedUrls: diagnostics.attemptedUrls,
            sample: diagnostics.sample,
            feedUrl: resolveNewsCanadaFeedUrl(),
            fetchedAt: Date.now(),
            itemCount: parsed.items.length,
            storyCount: parsed.items.length
          }
        };
        writeNewsCanadaSnapshot(successPayload);
        return successPayload;
      }
      lastError = new Error("wp_rest_no_items");
    } catch (err) {
      lastError = err;
    }
  }

  const candidates = uniq([cleanText(options.feedUrl || ""), ...resolveNewsCanadaFeedCandidates()].filter(Boolean));
  for (const feedUrl of candidates) {
    try {
      const fetched = await tryFetch(feedUrl, "application/rss+xml, application/xml, text/xml;q=0.95, application/atom+xml;q=0.95, text/html;q=0.7, */*;q=0.6", "rss");
      const parsed = parseNewsCanadaFeedContent(fetched.rawText, fetched.finalUrl || feedUrl, fetched.contentType);
      diagnostics.parserMode = cleanText(parsed.parserMode || "no_items") || "no_items";
      diagnostics.itemCount = Array.isArray(parsed.items) ? parsed.items.length : 0;
      if (parsed.items.length) {
        const successPayload = {
          ok: true,
          items: parsed.items,
          stories: parsed.items,
          meta: {
            source: "rss_direct_fallback",
            degraded: false,
            mode: "rss",
            parserMode: diagnostics.parserMode,
            contentType: diagnostics.contentType,
            resolvedUrl: diagnostics.resolvedUrl,
            attemptedUrls: diagnostics.attemptedUrls,
            sample: diagnostics.sample,
            feedUrl: feedUrl,
            fetchedAt: Date.now(),
            itemCount: parsed.items.length,
            storyCount: parsed.items.length
          }
        };
        writeNewsCanadaSnapshot(successPayload);
        return successPayload;
      }
      lastError = new Error(`rss_no_items_${diagnostics.parserMode}`);
    } catch (err) {
      lastError = err;
    }
  }

  const snapshot = readNewsCanadaSnapshot();
  if (snapshot && Array.isArray(snapshot.items) && snapshot.items.length) {
    return {
      ok: true,
      items: snapshot.items.slice(),
      stories: snapshot.items.slice(),
      meta: {
        source: "news_canada_snapshot_cache",
        degraded: true,
        mode: "snapshot",
        parserMode: "snapshot_cache",
        contentType: cleanText(diagnostics.contentType || "cached") || "cached",
        resolvedUrl: cleanText(diagnostics.resolvedUrl || "") || "",
        attemptedUrls: diagnostics.attemptedUrls,
        sample: diagnostics.sample,
        detail: cleanText(lastError && (lastError.message || lastError) || "snapshot_cache_used"),
        feedUrl: cleanText((snapshot.meta && snapshot.meta.feedUrl) || resolveNewsCanadaFeedUrl()),
        fetchedAt: Number(snapshot.writtenAt || Date.now()),
        itemCount: snapshot.items.length,
        storyCount: snapshot.items.length
      }
    };
  }

  return {
    ok: false,
    items: [],
    stories: [],
    meta: {
      source: diagnostics.attemptedUrls.some((x) => x && x.mode === 'wp_rest') ? "wp_rest_api_fallback" : "rss_direct_fallback",
      degraded: true,
      mode: diagnostics.attemptedUrls.some((x) => x && x.mode === 'wp_rest') ? "wp_rest" : "rss",
      parserMode: cleanText(diagnostics.parserMode || "no_items") || "no_items",
      contentType: cleanText(diagnostics.contentType || "unknown") || "unknown",
      resolvedUrl: cleanText(diagnostics.resolvedUrl || "") || "",
      attemptedUrls: diagnostics.attemptedUrls,
      sample: diagnostics.sample,
      detail: cleanText(lastError && (lastError.message || lastError) || "feed_no_items"),
      feedUrl: cleanText((diagnostics.attemptedUrls[0] && diagnostics.attemptedUrls[0].url) || resolveNewsCanadaFeedUrl()),
      fetchedAt: Date.now(),
      itemCount: 0,
      storyCount: 0
    }
  };
}

function buildNewsCanadaDirectFallbackService(logger) {
  const log = typeof logger === "function" ? logger : () => {};
  let cache = {
    ok: false,
    items: [],
    stories: [],
    fetchedAt: 0,
    feedUrl: resolveNewsCanadaFeedUrl(),
    degraded: false,
    source: "rss_direct_fallback",
    parserMode: "uninitialized",
    contentType: "",
    resolvedUrl: "",
    attemptedUrls: [],
    sample: "",
    detail: ""
  };

  async function refresh(opts) {
    const result = await fetchNewsCanadaRssDirect(opts);
    cache = {
      ok: result && result.ok !== false,
      items: Array.isArray(result && result.items) ? result.items : [],
      stories: Array.isArray(result && result.stories) ? result.stories : [],
      fetchedAt: Number(result && result.meta && result.meta.fetchedAt || Date.now()),
      feedUrl: cleanText(result && result.meta && result.meta.feedUrl || resolveNewsCanadaFeedUrl()),
      degraded: !!(result && result.meta && result.meta.degraded),
      source: cleanText(result && result.meta && result.meta.source || "rss_direct_fallback") || "rss_direct_fallback",
      parserMode: cleanText(result && result.meta && result.meta.parserMode || "unknown") || "unknown",
      contentType: cleanText(result && result.meta && result.meta.contentType || "") || "",
      resolvedUrl: cleanText(result && result.meta && result.meta.resolvedUrl || "") || "",
      attemptedUrls: Array.isArray(result && result.meta && result.meta.attemptedUrls) ? result.meta.attemptedUrls.slice(0, 12) : [],
      sample: cleanText(result && result.meta && result.meta.sample || ""),
      detail: cleanText(result && result.meta && result.meta.detail || "")
    };
    return result;
  }

  return {
    async fetchRSS(opts) {
      try {
        return await refresh(opts);
      } catch (err) {
        log("[Sandblast][newsCanada] direct_fallback_fetch_error", err && (err.stack || err.message || err));
        return {
          ok: false,
          items: cache.items.slice(),
          stories: cache.stories.slice(),
          meta: {
            source: cache.stories.length ? "rss_direct_fallback_cache" : "rss_direct_fallback",
            degraded: true,
            mode: "rss",
            parserMode: cache.parserMode || "error",
            contentType: cache.contentType || "",
            resolvedUrl: cache.resolvedUrl || "",
            attemptedUrls: cache.attemptedUrls.slice(0, 12),
            sample: cache.sample,
            feedUrl: cache.feedUrl || resolveNewsCanadaFeedUrl(),
            fetchedAt: cache.fetchedAt,
            itemCount: cache.items.length,
            storyCount: cache.stories.length,
            detail: cleanText(err && (err.message || err) || cache.detail || "rss_direct_fallback_failed")
          }
        };
      }
    },
    async getEditorsPicks(opts) {
      const refreshRequested = !!(opts && opts.refresh);
      if (!cache.ok || refreshRequested || !Array.isArray(cache.stories) || !cache.stories.length) {
        await this.fetchRSS(opts);
      }
      const limit = clamp(Number(opts && opts.limit || 0), 0, 100);
      const stories = limit > 0 ? cache.stories.slice(0, limit) : cache.stories.slice();
      return {
        ok: stories.length > 0,
        stories,
        slides: stories,
        chips: [],
        meta: {
          source: cache.source,
          degraded: !!cache.degraded,
          mode: "rss",
          parserMode: cache.parserMode,
          contentType: cache.contentType,
          resolvedUrl: cache.resolvedUrl,
          attemptedUrls: cache.attemptedUrls.slice(0, 12),
          sample: cache.sample,
          detail: cache.detail,
          feedUrl: cache.feedUrl,
          fetchedAt: cache.fetchedAt,
          storyCount: stories.length
        }
      };
    },
    async getStory(lookup, opts) {
      const refreshRequested = !!(opts && opts.refresh);
      if (!cache.ok || refreshRequested || !Array.isArray(cache.stories) || !cache.stories.length) {
        await this.fetchRSS(opts);
      }
      const key = cleanText(lookup).toLowerCase();
      const story = cache.stories.find((item) => [
        cleanText(item.id).toLowerCase(),
        cleanText(item.guid).toLowerCase(),
        cleanText(item.slug).toLowerCase(),
        cleanText(item.title).toLowerCase(),
        cleanText(item.url).toLowerCase(),
        cleanText(item.link).toLowerCase()
      ].includes(key));
      return story
        ? {
            ok: true,
            story,
            meta: {
              source: cache.source,
              degraded: !!cache.degraded,
              mode: "rss",
              parserMode: cache.parserMode,
              contentType: cache.contentType,
              resolvedUrl: cache.resolvedUrl,
              attemptedUrls: cache.attemptedUrls.slice(0, 12),
              sample: cache.sample,
              detail: cache.detail,
              feedUrl: cache.feedUrl,
              fetchedAt: cache.fetchedAt
            }
          }
        : {
            ok: false,
            error: "story_not_found",
            meta: {
              source: cache.source,
              degraded: !!cache.degraded,
              mode: "rss",
              parserMode: cache.parserMode,
              contentType: cache.contentType,
              resolvedUrl: cache.resolvedUrl,
              attemptedUrls: cache.attemptedUrls.slice(0, 12),
              sample: cache.sample,
              detail: cache.detail,
              feedUrl: cache.feedUrl,
              fetchedAt: cache.fetchedAt
            }
          };
    },
    async prime() {
      const out = await this.fetchRSS({ refresh: true });
      return { ok: out && out.ok !== false };
    },
    health() {
      return {
        ok: cache.ok,
        source: cache.source,
        degraded: !!cache.degraded,
        mode: "rss",
        parserMode: cache.parserMode,
        contentType: cache.contentType,
        resolvedUrl: cache.resolvedUrl,
        attemptedUrls: cache.attemptedUrls.slice(0, 12),
        sample: cache.sample,
        detail: cache.detail,
        feedUrl: cache.feedUrl || resolveNewsCanadaFeedUrl(),
        fetchedAt: cache.fetchedAt,
        storyCount: Array.isArray(cache.stories) ? cache.stories.length : 0,
        itemCount: Array.isArray(cache.items) ? cache.items.length : 0
      };
    }
  };
}

function buildNewsCanadaServiceFromFetch(fetchRSS, logger) {
  if (typeof fetchRSS !== "function") return null;

  let cache = {
    ok: false,
    items: [],
    stories: [],
    fetchedAt: 0,
    feedUrl: resolveNewsCanadaFeedUrl(),
    degraded: false,
    source: "rss_service_fallback"
  };

  async function refresh(opts) {
    const result = await Promise.resolve(fetchRSS(opts || {}));
    const items = Array.isArray(result && result.items)
      ? result.items
      : (Array.isArray(result && result.stories) ? result.stories : []);
    const stories = items.map((item, index) => {
      const entry = isObj(item) ? { ...item } : {};
      const title = cleanText(entry.title || entry.headline || `Story ${index + 1}`);
      const url = cleanText(entry.url || entry.link || "");
      const slug = cleanText(entry.slug || title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""));
      const description = cleanText(entry.description || entry.summary || entry.body || entry.content || "");
      const image = cleanText(entry.image || entry.popupImage || "");
      return {
        ...entry,
        id: cleanText(entry.id || entry.guid || url || slug || `rss-${index}`) || `rss-${index}`,
        slug: slug || `rss-${index}`,
        title,
        description,
        summary: cleanText(entry.summary || description),
        body: cleanText(entry.body || description),
        content: cleanText(entry.content || description),
        link: cleanText(entry.link || url),
        url,
        pubDate: cleanText(entry.pubDate || entry.isoDate || ""),
        image,
        popupImage: cleanText(entry.popupImage || image),
        popupBody: cleanText(entry.popupBody || description),
        ctaText: cleanText(entry.ctaText || "Read more"),
        source: cleanText(entry.source || "News Canada"),
        isActive: entry.isActive !== false
      };
    });

    cache = {
      ok: result && result.ok !== false,
      items,
      stories,
      fetchedAt: Number(result && result.meta && result.meta.fetchedAt || Date.now()),
      feedUrl: cleanText(result && result.meta && result.meta.feedUrl || resolveNewsCanadaFeedUrl()),
      degraded: !!(result && result.meta && result.meta.degraded),
      source: cleanText(result && result.meta && result.meta.source || "rss_service_fallback") || "rss_service_fallback"
    };

    return { result, stories };
  }

  return {
    async fetchRSS(opts) {
      const out = await refresh(opts);
      return {
        ok: out.result && out.result.ok !== false,
        items: out.stories,
        stories: out.stories,
        meta: {
          v: INDEX_VERSION,
          t: now(),
          source: cache.source,
          degraded: !!cache.degraded,
          mode: "rss",
          feedUrl: cache.feedUrl,
          fetchedAt: cache.fetchedAt,
          itemCount: out.stories.length,
          storyCount: out.stories.length
        }
      };
    },
    async getEditorsPicks(opts) {
      const refreshRequested = !!(opts && opts.refresh);
      if (!cache.ok || refreshRequested || !Array.isArray(cache.stories) || !cache.stories.length) {
        await refresh(opts);
      }
      const limit = clamp(Number(opts && opts.limit || 0), 0, 100);
      const stories = limit > 0 ? cache.stories.slice(0, limit) : cache.stories.slice();
      return {
        ok: true,
        stories,
        slides: stories,
        chips: [],
        meta: {
          source: cache.source,
          degraded: !!cache.degraded,
          mode: "rss",
          feedUrl: cache.feedUrl,
          fetchedAt: cache.fetchedAt,
          storyCount: stories.length
        }
      };
    },
    async getStory(lookup, opts) {
      const refreshRequested = !!(opts && opts.refresh);
      if (!cache.ok || refreshRequested || !Array.isArray(cache.stories) || !cache.stories.length) {
        await refresh(opts);
      }
      const key = cleanText(lookup).toLowerCase();
      const story = cache.stories.find((item) => [
        cleanText(item.id).toLowerCase(),
        cleanText(item.slug).toLowerCase(),
        cleanText(item.title).toLowerCase(),
        cleanText(item.url).toLowerCase(),
        cleanText(item.link).toLowerCase()
      ].includes(key));
      if (!story) {
        return {
          ok: false,
          error: "story_not_found",
          meta: {
            source: cache.source,
            degraded: !!cache.degraded,
            mode: "rss",
            feedUrl: cache.feedUrl,
            fetchedAt: cache.fetchedAt
          }
        };
      }
      return {
        ok: true,
        story,
        meta: {
          source: cache.source,
          degraded: !!cache.degraded,
          mode: "rss",
          feedUrl: cache.feedUrl,
          fetchedAt: cache.fetchedAt
        }
      };
    },
    async prime() {
      try {
        await refresh({ refresh: true });
        return { ok: true };
      } catch (err) {
        if (typeof logger === "function") logger("[Sandblast][newsCanada] fallback_prime_error", err && (err.stack || err.message || err));
        return { ok: false, error: cleanText(err && (err.message || err) || "prime_failed") };
      }
    },
    health() {
      return {
        ok: cache.ok,
        source: cache.source,
        degraded: !!cache.degraded,
        mode: "rss",
        feedUrl: cache.feedUrl || resolveNewsCanadaFeedUrl(),
        fetchedAt: cache.fetchedAt,
        storyCount: Array.isArray(cache.stories) ? cache.stories.length : 0,
        itemCount: Array.isArray(cache.items) ? cache.items.length : 0
      };
    }
  };
}

function normalizeNewsCanadaServiceModule(mod) {
  if (!mod) return null;
  const logger = (...args) => console.log(...args);
  const candidates = [mod, mod.default, mod.service, mod.newsCanadaFeedService].filter(Boolean);

  for (const candidate of candidates) {
    if (!candidate) continue;

    if (typeof candidate.createNewsCanadaFeedService === "function") {
      try {
        const built = candidate.createNewsCanadaFeedService({
          fetchImpl: typeof fetch === "function" ? fetch.bind(globalThis) : null,
          logger
        });
        if (built && (typeof built.fetchRSS === "function" || typeof built.getEditorsPicks === "function")) return built;
      } catch (err) {
        logger("[Sandblast][newsCanada] service_factory_error", err && (err.stack || err.message || err));
      }
    }

    if (typeof candidate.fetchRSS === "function") {
      const wrapped = buildNewsCanadaServiceFromFetch(candidate.fetchRSS.bind(candidate), logger);
      if (wrapped) return wrapped;
    }

    if (
      typeof candidate.getEditorsPicks === "function" ||
      typeof candidate.getStory === "function" ||
      typeof candidate.health === "function"
    ) {
      return candidate;
    }
  }

  return null;
}

const newsCanadaFeedService = (() => {
  const logger = (...args) => console.log(...args);
  const directFallback = buildNewsCanadaDirectFallbackService(logger);
  const normalized = normalizeNewsCanadaServiceModule(newsCanadaFeedServiceMod);

  if (!normalized) return directFallback;

  return {
    async fetchRSS(opts) {
      try {
        const primary = await Promise.resolve(normalized.fetchRSS(opts));
        const items = Array.isArray(primary && primary.items)
          ? primary.items
          : (Array.isArray(primary && primary.stories) ? primary.stories : []);
        if ((primary && primary.ok !== false && items.length) || !directFallback) return primary;
      } catch (err) {
        logger("[Sandblast][newsCanada] service_fetchRSS_primary_error", err && (err.stack || err.message || err));
      }
      return directFallback.fetchRSS(opts);
    },
    async getEditorsPicks(opts) {
      try {
        if (typeof normalized.getEditorsPicks === "function") {
          const primary = await Promise.resolve(normalized.getEditorsPicks(opts));
          const stories = Array.isArray(primary && primary.stories) ? primary.stories : [];
          if ((primary && primary.ok !== false && stories.length) || !directFallback) return primary;
        }
      } catch (err) {
        logger("[Sandblast][newsCanada] service_getEditorsPicks_primary_error", err && (err.stack || err.message || err));
      }
      return directFallback.getEditorsPicks(opts);
    },
    async getStory(lookup, opts) {
      try {
        if (typeof normalized.getStory === "function") {
          const primary = await Promise.resolve(normalized.getStory(lookup, opts));
          if (primary && primary.ok !== false && isObj(primary.story)) return primary;
        }
      } catch (err) {
        logger("[Sandblast][newsCanada] service_getStory_primary_error", err && (err.stack || err.message || err));
      }
      return directFallback.getStory(lookup, opts);
    },
    async prime() {
      try {
        if (typeof normalized.prime === "function") {
          const out = await Promise.resolve(normalized.prime());
          if (out && out.ok !== false) return out;
        }
      } catch (err) {
        logger("[Sandblast][newsCanada] service_prime_primary_error", err && (err.stack || err.message || err));
      }
      return directFallback.prime();
    },
    health() {
      try {
        const primary = typeof normalized.health === "function" ? normalized.health() : null;
        const fallback = directFallback.health();
        return {
          ...(isObj(primary) ? primary : {}),
          fallbackSource: fallback.source,
          fallbackFeedUrl: fallback.feedUrl,
          fallbackStoryCount: fallback.storyCount
        };
      } catch (_) {
        return directFallback.health();
      }
    }
  };
})();


function buildNewsCanadaCacheBackedService(cacheMod, fallbackService) {
  const cacheSvc = cacheMod && cacheMod.default && typeof cacheMod.default === "object" ? cacheMod.default : cacheMod;
  const hasGetCachedOrRefresh = !!(cacheSvc && typeof cacheSvc.getCachedOrRefresh === "function");
  const readCache = cacheSvc && typeof cacheSvc.readCache === "function" ? cacheSvc.readCache.bind(cacheSvc) : null;
  const refreshCache = cacheSvc && typeof cacheSvc.refreshCache === "function" ? cacheSvc.refreshCache.bind(cacheSvc) : null;

  if (!hasGetCachedOrRefresh && !readCache) {
    const seeded = readNewsCanadaCacheContractFile();
    if (!seeded) return fallbackService;
  }

  async function resolvePayload(opts) {
    const forceRefresh = !!(opts && opts.refresh);
    const seeded = readNewsCanadaCacheContractFile();

    if (seeded && seeded.items && seeded.items.length && !forceRefresh) {
      return seeded;
    }

    if (hasGetCachedOrRefresh) {
      const payload = await Promise.resolve(cacheSvc.getCachedOrRefresh({
        forceRefresh,
        timeoutMs: clamp(Number(process.env.NEWS_CANADA_RSS_TIMEOUT_MS || 30000), 5000, 45000)
      }));
      if (isObj(payload) && Array.isArray(payload.items) && payload.items.length) {
        return {
          ...payload,
          meta: {
            ...(isObj(payload.meta) ? payload.meta : {}),
            cacheContractPath: cleanText(payload && payload.meta && payload.meta.cacheContractPath || (seeded && seeded.meta && seeded.meta.cacheContractPath) || ""),
            cacheContractCandidates: getNewsCanadaCacheContractPaths()
          }
        };
      }
      if (seeded && seeded.items && seeded.items.length) return seeded;
      return isObj(payload)
        ? {
            ...payload,
            meta: {
              ...(isObj(payload.meta) ? payload.meta : {}),
              cacheContractPath: cleanText(payload && payload.meta && payload.meta.cacheContractPath || ""),
              cacheContractCandidates: getNewsCanadaCacheContractPaths()
            }
          }
        : {
            ok: false,
            items: [],
            meta: {
              source: "cache_service_invalid",
              degraded: true,
              cacheContractCandidates: getNewsCanadaCacheContractPaths()
            }
          };
    }

    if (readCache) {
      const payload = await Promise.resolve(readCache());
      if (isObj(payload) && Array.isArray(payload.items) && payload.items.length) {
        return {
          ...payload,
          meta: {
            ...(isObj(payload.meta) ? payload.meta : {}),
            cacheContractPath: cleanText(payload && payload.meta && payload.meta.cacheContractPath || (seeded && seeded.meta && seeded.meta.cacheContractPath) || ""),
            cacheContractCandidates: getNewsCanadaCacheContractPaths()
          }
        };
      }
    }

    if (seeded && seeded.items && seeded.items.length) return seeded;

    return {
      ok: false,
      items: [],
      meta: {
        source: "cache",
        degraded: true,
        mode: "cache_first",
        parserMode: "cache_contract",
        detail: "cache_contract_missing_or_empty",
        cacheContractPath: "",
        cacheContractCandidates: getNewsCanadaCacheContractPaths()
      }
    };
  }

  return {
    async fetchRSS(opts) {
      const payload = await resolvePayload(opts);
      const items = Array.isArray(payload && payload.items) ? payload.items : [];
      return {
        ok: payload && payload.ok !== false && items.length > 0,
        items,
        stories: items,
        meta: {
          v: INDEX_VERSION,
          t: now(),
          source: cleanText(payload && payload.meta && (payload.meta.servedFrom || payload.meta.source) || "cache") || "cache",
          degraded: !!(payload && payload.meta && (payload.meta.degraded || payload.meta.stale || payload.meta.refreshFailed || !items.length)),
          mode: cleanText(payload && payload.meta && payload.meta.mode || "cache_first") || "cache_first",
          parserMode: cleanText(payload && payload.meta && payload.meta.parserMode || "cache_contract") || "cache_contract",
          contentType: cleanText(payload && payload.meta && payload.meta.contentType || "application/json") || "application/json",
          resolvedUrl: cleanText(payload && payload.meta && payload.meta.resolvedUrl || "") || "",
          attemptedUrls: Array.isArray(payload && payload.meta && payload.meta.attemptedUrls) ? payload.meta.attemptedUrls.slice(0, 12) : [],
          sample: cleanText(payload && payload.meta && payload.meta.sample || ""),
          detail: cleanText(payload && payload.meta && payload.meta.detail || ""),
          feedUrl: cleanText(payload && payload.meta && payload.meta.feedUrl || resolveNewsCanadaFeedUrl()),
          fetchedAt: Number(payload && payload.meta && (payload.meta.fetchedAt || payload.meta.lastSuccessAt) || 0),
          itemCount: items.length,
          storyCount: items.length,
          cacheVersion: cleanText(payload && payload.meta && payload.meta.cacheVersion || "newscanada-cache-v1") || "newscanada-cache-v1",
          cacheContractPath: cleanText(payload && payload.meta && payload.meta.cacheContractPath || ""),
          cacheContractCandidates: Array.isArray(payload && payload.meta && payload.meta.cacheContractCandidates) ? payload.meta.cacheContractCandidates.slice(0, 8) : getNewsCanadaCacheContractPaths(),
          contractVersion: "newscanada-cache-contract-v2"
        }
      };
    },
    async getEditorsPicks(opts) {
      const payload = await resolvePayload(opts);
      const stories = Array.isArray(payload && payload.items) ? payload.items : [];
      return {
        ok: stories.length > 0,
        stories,
        slides: stories,
        chips: [],
        meta: {
          source: cleanText(payload && payload.meta && (payload.meta.servedFrom || payload.meta.source) || "cache") || "cache",
          degraded: !!(payload && payload.meta && (payload.meta.degraded || payload.meta.stale || payload.meta.refreshFailed || !stories.length)),
          mode: cleanText(payload && payload.meta && payload.meta.mode || "cache_first") || "cache_first",
          parserMode: cleanText(payload && payload.meta && payload.meta.parserMode || "cache_contract") || "cache_contract",
          feedUrl: cleanText(payload && payload.meta && payload.meta.feedUrl || resolveNewsCanadaFeedUrl()),
          fetchedAt: Number(payload && payload.meta && (payload.meta.fetchedAt || payload.meta.lastSuccessAt) || 0),
          storyCount: stories.length,
          attemptedUrls: Array.isArray(payload && payload.meta && payload.meta.attemptedUrls) ? payload.meta.attemptedUrls.slice(0, 12) : [],
          detail: cleanText(payload && payload.meta && payload.meta.detail || ""),
          cacheContractPath: cleanText(payload && payload.meta && payload.meta.cacheContractPath || ""),
          cacheContractCandidates: Array.isArray(payload && payload.meta && payload.meta.cacheContractCandidates) ? payload.meta.cacheContractCandidates.slice(0, 8) : getNewsCanadaCacheContractPaths()
        }
      };
    },
    async getStory(lookup, opts) {
      const payload = await resolvePayload(opts);
      const stories = Array.isArray(payload && payload.items) ? payload.items : [];
      const key = cleanText(lookup).toLowerCase();
      const story = stories.find((item) => [
        cleanText(item && item.id).toLowerCase(),
        cleanText(item && item.guid).toLowerCase(),
        cleanText(item && item.slug).toLowerCase(),
        cleanText(item && item.title).toLowerCase(),
        cleanText(item && item.url).toLowerCase(),
        cleanText(item && item.link).toLowerCase()
      ].includes(key));
      if (!story) {
        return {
          ok: false,
          error: "story_not_found",
          meta: {
            source: cleanText(payload && payload.meta && (payload.meta.servedFrom || payload.meta.source) || "cache") || "cache",
            degraded: !!(payload && payload.meta && (payload.meta.degraded || payload.meta.stale || payload.meta.refreshFailed)),
            mode: cleanText(payload && payload.meta && payload.meta.mode || "cache_first") || "cache_first",
            feedUrl: cleanText(payload && payload.meta && payload.meta.feedUrl || resolveNewsCanadaFeedUrl()),
            fetchedAt: Number(payload && payload.meta && (payload.meta.fetchedAt || payload.meta.lastSuccessAt) || 0),
            cacheContractPath: cleanText(payload && payload.meta && payload.meta.cacheContractPath || ""),
            cacheContractCandidates: Array.isArray(payload && payload.meta && payload.meta.cacheContractCandidates) ? payload.meta.cacheContractCandidates.slice(0, 8) : getNewsCanadaCacheContractPaths()
          }
        };
      }
      return {
        ok: true,
        story,
        meta: {
          source: cleanText(payload && payload.meta && (payload.meta.servedFrom || payload.meta.source) || "cache") || "cache",
          degraded: !!(payload && payload.meta && (payload.meta.degraded || payload.meta.stale || payload.meta.refreshFailed)),
          mode: cleanText(payload && payload.meta && payload.meta.mode || "cache_first") || "cache_first",
          feedUrl: cleanText(payload && payload.meta && payload.meta.feedUrl || resolveNewsCanadaFeedUrl()),
          fetchedAt: Number(payload && payload.meta && (payload.meta.fetchedAt || payload.meta.lastSuccessAt) || 0),
          cacheContractPath: cleanText(payload && payload.meta && payload.meta.cacheContractPath || ""),
          cacheContractCandidates: Array.isArray(payload && payload.meta && payload.meta.cacheContractCandidates) ? payload.meta.cacheContractCandidates.slice(0, 8) : getNewsCanadaCacheContractPaths()
        }
      };
    },
    async prime() {
      if (refreshCache) {
        const out = await Promise.resolve(refreshCache({ timeoutMs: clamp(Number(process.env.NEWS_CANADA_RSS_TIMEOUT_MS || 30000), 5000, 45000) }));
        return { ok: !!(out && out.ok !== false && Array.isArray(out.items) && out.items.length) };
      }
      const seeded = readNewsCanadaCacheContractFile();
      return { ok: !!(seeded && seeded.ok !== false && Array.isArray(seeded.items) && seeded.items.length) };
    },
    health() {
      try {
        const seeded = readNewsCanadaCacheContractFile();
        const cached = readCache ? readCache() : null;
        const src = (cached && Array.isArray(cached.items) && cached.items.length) ? cached : seeded;
        return {
          ok: !!(src && src.ok !== false && Array.isArray(src.items) && src.items.length),
          source: cleanText(src && src.meta && (src.meta.servedFrom || src.meta.source) || "cache") || "cache",
          degraded: !!(src && src.meta && (src.meta.degraded || src.meta.stale || src.meta.refreshFailed)),
          mode: cleanText(src && src.meta && src.meta.mode || "cache_first") || "cache_first",
          feedUrl: cleanText(src && src.meta && src.meta.feedUrl || resolveNewsCanadaFeedUrl()),
          fetchedAt: Number(src && src.meta && (src.meta.fetchedAt || src.meta.lastSuccessAt) || 0),
          storyCount: Array.isArray(src && src.items) ? src.items.length : 0,
          itemCount: Array.isArray(src && src.items) ? src.items.length : 0,
          cacheVersion: cleanText(src && src.meta && src.meta.cacheVersion || "newscanada-cache-v1") || "newscanada-cache-v1",
          cacheContractPath: cleanText(src && src.meta && src.meta.cacheContractPath || ""),
          cacheContractCandidates: Array.isArray(src && src.meta && src.meta.cacheContractCandidates) ? src.meta.cacheContractCandidates.slice(0, 8) : getNewsCanadaCacheContractPaths()
        };
      } catch (_) {
        return fallbackService && typeof fallbackService.health === "function" ? fallbackService.health() : { ok: false, source: "cache_unavailable", degraded: true, mode: "cache_first", cacheContractCandidates: getNewsCanadaCacheContractPaths() };
      }
    }
  };
}

const newsCanadaPrimaryService = buildNewsCanadaCacheBackedService(newscanadaCacheServiceMod, newsCanadaFeedService);

const memory = {
  lastBySession: new Map(),
  supportBySession: new Map(),
  transportBySession: new Map()
};

function getSessionId(req) {
  return cleanText(
    req.headers["x-session-id"] ||
    req.headers["x-sb-session-id"] ||
    req.body?.sessionId ||
    req.body?.payload?.sessionId ||
    req.ip ||
    "anon"
  ).slice(0, 120);
}

function readBearerToken(req) {
  const auth = cleanText((req.headers && req.headers.authorization) || req.get?.("Authorization") || "");
  if (!auth) return "";
  if (!/^bearer\s+/i.test(auth)) return "";
  return cleanText(auth.replace(/^bearer\s+/i, ""));
}

function readToken(req) {
  const header = lower(CFG.apiTokenHeader || "x-sb-widget-token");
  const byHeader = cleanText((req.headers && req.headers[header]) || req.get?.(CFG.apiTokenHeader) || "");
  if (byHeader) return byHeader;
  return readBearerToken(req);
}

function denyUnauthorized(res) {
  return res.status(401).json({
    ok: false,
    error: "unauthorized",
    meta: { v: INDEX_VERSION, t: now() }
  });
}

function enforceToken(req, res, next) {
  if (req.method === "OPTIONS") return next();
  if (!CFG.apiToken) return next();
  const got = readToken(req);
  if (got && got === CFG.apiToken) return next();
  return denyUnauthorized(res);
}

function enforceVoiceRouteAccess(req, res, next) {
  if (req.method === "OPTIONS") return next();
  if (!CFG.requireVoiceRouteToken) return next();
  return enforceToken(req, res, next);
}

function enforceMusicBridgeAccess(req, res, next) {
  if (req.method === "OPTIONS") return next();
  return next();
}

function getLastTurn(sessionId) {
  return memory.lastBySession.get(sessionId) || null;
}

function summarizeTurnForMemory(prev, patch) {
  const base = isObj(prev) ? prev : {};
  const next = isObj(patch) ? patch : {};
  return {
    replyHash: cleanText(next.replyHash || base.replyHash || ""),
    userHash: cleanText(next.userHash || base.userHash || ""),
    lane: cleanText(next.lane || base.lane || ""),
    replyAuthority: cleanText(next.replyAuthority || base.replyAuthority || ""),
    userText: cleanText(next.userText || base.userText || "").slice(0, 280),
    reply: cleanText(next.reply || base.reply || "").slice(0, 280),
    emotionLabel: cleanText(next.emotionLabel || base.emotionLabel || "").slice(0, 80),
    continuity: isObj(next.continuity) ? next.continuity : (isObj(base.continuity) ? base.continuity : {}),
    at: now()
  };
}

function setLastTurn(sessionId, data) {
  memory.lastBySession.set(sessionId, summarizeTurnForMemory(getLastTurn(sessionId), data));
}

function getSupportState(sessionId) {
  return memory.supportBySession.get(sessionId) || {
    hold: 0,
    active: false,
    replyHash: "",
    lastUserHash: "",
    updatedAt: 0
  };
}

function setSupportState(sessionId, patch) {
  const prev = getSupportState(sessionId);
  const next = {
    ...prev,
    ...(isObj(patch) ? patch : {}),
    updatedAt: now()
  };
  memory.supportBySession.set(sessionId, next);
  return next;
}

function getTransportState(sessionId) {
  return memory.transportBySession.get(sessionId) || {
    key: "",
    at: 0,
    count: 0
  };
}

function setTransportState(sessionId, patch) {
  const prev = getTransportState(sessionId);
  const next = {
    ...prev,
    ...(isObj(patch) ? patch : {}),
    at: now()
  };
  memory.transportBySession.set(sessionId, next);
  return next;
}

function normalizePayload(req) {
  const body = isObj(req.body) ? req.body : {};
  const payload = isObj(body.payload) ? body.payload : {};
  const guidedPrompt = isObj(body.guidedPrompt) ? body.guidedPrompt : (isObj(payload.guidedPrompt) ? payload.guidedPrompt : null);
  const text = cleanText(body.text || payload.text || payload.query || (guidedPrompt && (guidedPrompt.label || guidedPrompt.text)) || "");
  return {
    text,
    guidedPrompt,
    domainHint: cleanText(body.domainHint || payload.domainHint || (guidedPrompt && guidedPrompt.domainHint) || ""),
    intentHint: cleanText(body.intentHint || payload.intentHint || (guidedPrompt && guidedPrompt.intentHint) || ""),
    emotionalHint: cleanText(body.emotionalHint || payload.emotionalHint || (guidedPrompt && guidedPrompt.emotionalHint) || ""),
    body,
    payload,
    lane: cleanText(payload.lane || body.lane || "general").toLowerCase() || "general",
    year: cleanText(payload.year || body.year || ""),
    mode: cleanText(payload.mode || body.mode || ""),
    turnId: payload.turnId || body.turnId || null,
    traceId: cleanText(req.headers["x-sb-trace-id"] || payload.traceId || body.traceId || makeTraceId("req")),
    client: isObj(body.client) ? body.client : {}
  };
}

function normalizeEmotion(raw, inputText) {
  const out = {
    ok: false,
    label: "",
    intensity: 0,
    distress: false,
    stabilize: false,
    sensitive: false,
    positive: false,
    technical: false
  };

  const baseText = `${safeStr(inputText)} ${safeStr(raw && raw.label)} ${safeStr(raw && raw.name)} ${safeStr(raw && raw.primary)} ${safeStr(raw && raw.mode)} ${safeStr(raw && raw.intent)}`;
  const txt = lower(baseText);

  if (isObj(raw)) {
    out.ok = true;
    out.label = cleanText(raw.label || raw.name || raw.primary || "");
    const n = Number(raw.intensity ?? raw.score ?? raw.weight ?? 0);
    out.intensity = Number.isFinite(n) ? clamp(n, 0, 1) : 0;
    out.distress = !!(raw.distress || raw.support || raw.overwhelmed || raw.anxious || raw.negative);
    out.stabilize = !!(raw.stabilize || raw.regulate || raw.deescalate);
    out.sensitive = !!(raw.sensitive || raw.crisis || raw.selfHarm);
    out.positive = !!(raw.positive || raw.upbeat);
    out.technical = !!raw.technical;
  }

  const rawText = txt;
  out.distress = out.distress || /(overwhelmed|panic|panicking|not okay|anxious|anxiety|too much|breaking down|falling apart|burned out|burnt out|help me|i am scared|i'm scared|i am hurting|i'm hurting|i feel awful|i feel terrible|i am drowning|i'm drowning|depressed|depression|i am depressed|i'm depressed|hopeless|empty|numb|can't go on|cannot go on)/.test(rawText);
  out.stabilize = out.stabilize || out.distress || /(stabilize|steady|calm down|regulate|slow down)/.test(rawText);
  out.sensitive = out.sensitive || /(suic|kill myself|want to die|end it|self harm|self-harm)/.test(rawText);
  out.positive = /(happy|great|beautiful day|amazing|good mood|outstanding|did great|things are going right|relieved)/.test(rawText);
  out.technical = /(debug|backend|chat engine|state spine|support response|marion|loop|fallback|api|route|tts|voice|fix|index\.js|emotion|stabiliz)/.test(rawText);

  if (!out.label) {
    if (out.sensitive) out.label = "crisis";
    else if (out.distress) out.label = "distress";
    else if (out.technical) out.label = "technical";
    else if (out.positive) out.label = "positive";
    else out.label = "neutral";
  }

  if (!out.ok) out.ok = out.distress || out.sensitive || out.positive || out.technical || !!out.label;
  return out;
}

function inferEmotion(text, reqCtx) {
  const raw = cleanText(text);
  let engineResult = null;

  try {
    if (affectEngineMod && typeof affectEngineMod.detect === "function") {
      engineResult = affectEngineMod.detect(raw, reqCtx || {});
    } else if (affectEngineMod && typeof affectEngineMod.analyze === "function") {
      engineResult = affectEngineMod.analyze(raw, reqCtx || {});
    } else if (affectEngineMod && typeof affectEngineMod === "function") {
      engineResult = affectEngineMod(raw, reqCtx || {});
    }
  } catch (err) {
    console.log("[Sandblast][affectEngine:error]", err && (err.stack || err.message || err));
    engineResult = null;
  }

  return normalizeEmotion(engineResult, raw);
}

function normalizeSupportReply(text) {
  const cleaned = cleanReplyForUser(text);
  if (cleaned) return cleaned;
  return "I am here with you. We can take this one step at a time.";
}

function buildSafeSupportReply(inputText, emotion, extras) {
  const emo = isObj(emotion) ? emotion : normalizeEmotion(null, inputText);
  const opts = isObj(extras) ? extras : {};
  const base = cleanText(inputText);

  if (emo.sensitive) {
    return "I am here with you. If you are in immediate danger or might hurt yourself, call your local emergency number right now. In Canada or the United States you can also call or text 988. Tell me: did something happen today, or has this been building for a while?";
  }

  let externalReply = "";
  try {
    if (supportResponseMod && typeof supportResponseMod.buildSupportReply === "function") {
      externalReply = safeStr(supportResponseMod.buildSupportReply({
        text: base,
        emo,
        emotion: emo,
        mode: "stabilize",
        ...opts
      }));
    } else if (supportResponseMod && typeof supportResponseMod.getSupportReply === "function") {
      externalReply = safeStr(supportResponseMod.getSupportReply({
        text: base,
        emo,
        emotion: emo,
        mode: "stabilize",
        ...opts
      }));
    } else if (typeof supportResponseMod === "function") {
      externalReply = safeStr(supportResponseMod({
        text: base,
        emo,
        emotion: emo,
        mode: "stabilize",
        ...opts
      }));
    }
  } catch (err) {
    console.log("[Sandblast][supportResponse:error]", err && (err.stack || err.message || err));
  }

  if (externalReply) return normalizeSupportReply(externalReply);

  if (emo.distress) {
    return "I am here with you. We can take this one step at a time. Tell me what happened, or keep talking and I will stay with you.";
  }

  return "I am here with you. Tell me what happened, and we will steady this together.";
}

function buildQuietUiPatch(reason, holdActive) {
  const quiet = {
    mode: "quiet",
    chips: [],
    allowMic: true,
    replace: true,
    clearStale: true,
    revision: now()
  };

  return {
    ui: quiet,
    directives: [],
    followUps: [],
    followUpsStrings: [],
    sessionPatch: {
      supportLock: holdActive ? { active: true } : {}
    },
    metaPatch: {
      clearStaleUi: true,
      suppressMenus: true,
      failSafe: reason === "failsafe",
      supportHold: !!holdActive
    }
  };
}

function shouldEnterSupportHold(text, emotion, engineResult) {
  const emo = isObj(emotion) ? emotion : normalizeEmotion(null, text);
  const intent = lower(engineResult && engineResult.intent);
  const mode = lower(engineResult && engineResult.mode);
  return !!(
    emo.sensitive ||
    emo.distress ||
    emo.stabilize ||
    intent === "stabilize" ||
    mode === "transitional" ||
    mode === "support" ||
    mode === "quiet"
  );
}

function buildSupportSessionPatch(existing, active, release) {
  const prev = isObj(existing) ? existing : {};
  const lock = {};
  if (active) lock.active = true;
  if (release) lock.release = true;
  return {
    ...prev,
    supportLock: lock
  };
}

function shouldSuppressMenus(engineOut, supportActive) {
  const ui = isObj(engineOut?.ui) ? engineOut.ui : {};
  const meta = isObj(engineOut?.meta) ? engineOut.meta : {};
  if (supportActive) return true;
  return !!(
    ui.replace ||
    ui.clearStale ||
    ui.menuSuppressed ||
    ui.degradedSupport ||
    ui.failSafe ||
    meta.clearStaleUi ||
    meta.suppressMenus ||
    meta.failSafe
  );
}

function enforceQuietUiIfNeeded(base, opts) {
  const out = isObj(base) ? { ...base } : {};
  const o = isObj(opts) ? opts : {};
  const supportActive = !!o.supportActive;
  const failSafe = !!o.failSafe;
  const forceQuiet = !!o.forceQuiet;

  if (!(supportActive || failSafe || forceQuiet)) return out;

  const patch = buildQuietUiPatch(failSafe ? "failsafe" : "support", supportActive);
  out.ui = patch.ui;
  out.directives = patch.directives;
  out.followUps = patch.followUps;
  out.followUpsStrings = patch.followUpsStrings;
  out.sessionPatch = {
    ...(isObj(out.sessionPatch) ? out.sessionPatch : {}),
    ...(isObj(patch.sessionPatch) ? patch.sessionPatch : {})
  };
  out.meta = {
    ...(isObj(out.meta) ? out.meta : {}),
    ...(isObj(patch.metaPatch) ? patch.metaPatch : {})
  };
  return out;
}

function mergeMeta(base, patch) {
  return {
    ...(isObj(base) ? base : {}),
    ...(isObj(patch) ? patch : {})
  };
}

function buildTransportKey(ctx, text, req) {
  const msg = safeStr(text).trim().toLowerCase();
  return [
    getSessionId(req),
    safeStr(ctx?.lane || ""),
    safeStr(ctx?.mode || ""),
    safeStr(ctx?.year || ""),
    msg
  ].join("|");
}

function detectLoop(sessionId, reply, userText) {
  const prev = getLastTurn(sessionId);
  const curHash = replyHash(reply);
  const userHash = replyHash(userText);
  const within = prev && (now() - Number(prev.at || 0) < CFG.duplicateReplyWindowMs);
  const sameReply = !!(within && prev.replyHash && prev.replyHash === curHash);
  const sameUser = !!(within && prev.userHash && prev.userHash === userHash);
  return {
    sameReply,
    sameUser,
    repeated: sameReply && sameUser,
    curHash,
    userHash
  };
}

function applyAffectBridge(base, affectInput) {
  const shaped = isObj(base) ? { ...base } : {};
  if (!affectEngineMod || typeof affectEngineMod.runAffectEngine !== "function") return shaped;
  const input = isObj(affectInput) ? affectInput : {};
  try {
    const lockedEmotion = isObj(input.lockedEmotion) ? input.lockedEmotion : null;
    const strategy = isObj(input.strategy) ? input.strategy : null;
    if (!lockedEmotion || !lockedEmotion.locked || !strategy) return shaped;
    const affectOut = affectEngineMod.runAffectEngine({
      assistantDraft: cleanText(shaped.reply || shaped.payload?.reply || ""),
      lockedEmotion,
      strategy,
      lane: cleanText(shaped.lane || "Default") || "Default",
      memory: isObj(input.memory) ? input.memory : {}
    });
    if (!isObj(affectOut) || affectOut.ok === false) return shaped;
    const spokenText = cleanText(affectOut.spokenText || "");
    if (!spokenText) return shaped;
    shaped.reply = spokenText;
    shaped.payload = { ...(isObj(shaped.payload) ? shaped.payload : {}), reply: spokenText, spokenText };
    shaped.ttsProfile = isObj(affectOut.ttsProfile) ? affectOut.ttsProfile : shaped.ttsProfile;
    shaped.audio = isObj(shaped.audio) ? shaped.audio : {};
    shaped.audio.textToSynth = spokenText;
    shaped.audio.enabled = true;
    shaped.meta = mergeMeta(shaped.meta, { affectApplied: true, linkedDatasets: Array.isArray(affectOut.expressionBridge?.linkedDatasets) ? affectOut.expressionBridge.linkedDatasets.slice(0, 12) : [] });
  } catch (err) {
    console.log("[Sandblast][affectBridge:error]", err && (err.stack || err.message || err));
  }
  return shaped;
}

function buildAffectInputFromMarion(marion) {
  const src = isObj(marion) ? marion : {};
  const layer2 = isObj(src.layer2) ? src.layer2 : {};
  const emotion = isObj(layer2.emotion) ? layer2.emotion : {};
  const meta = isObj(src.meta) ? src.meta : {};
  const lockedEmotion = isObj(meta.lockedEmotion) ? meta.lockedEmotion : (emotion.primaryEmotion ? {
    locked: true,
    primaryEmotion: cleanText(emotion.primaryEmotion || "neutral") || "neutral",
    secondaryEmotion: cleanText(emotion.secondaryEmotion || ""),
    intensity: Number.isFinite(Number(emotion.intensity)) ? Number(emotion.intensity) : 0,
    valence: Number.isFinite(Number(emotion.valence)) ? Number(emotion.valence) : 0,
    valenceLabel: cleanText(emotion.valenceLabel || ""),
    confidence: Number.isFinite(Number(emotion.confidence)) ? Number(emotion.confidence) : 0,
    needs: Array.isArray(emotion.needs) ? emotion.needs : [],
    cues: Array.isArray(emotion.cues) ? emotion.cues : [],
    supportFlags: isObj(emotion.supportFlags) ? emotion.supportFlags : {},
    evidenceMatches: Array.isArray(emotion.evidenceMatches) ? emotion.evidenceMatches : [],
    meta: { linkedDatasets: Array.isArray(meta.linkedDatasets) ? meta.linkedDatasets : [] }
  } : null);
  const strategy = isObj(meta.strategy) ? meta.strategy : null;
  return { lockedEmotion, strategy, guidedPrompt: src.guidedPrompt || meta.guidedPrompt || null };
}

function shapeEngineReply(raw) {
  if (!isObj(raw)) return {};
  const payload = isObj(raw.payload) ? raw.payload : {};
  const speech = isObj(raw.speech) ? raw.speech : (isObj(payload.speech) ? payload.speech : null);
  return {
    ok: raw.ok !== false,
    reply: cleanText(raw.spokenText || payload.spokenText || raw.reply || payload.reply || raw.message || raw.text || ""),
    payload: isObj(payload) ? payload : {},
    lane: cleanText(raw.lane || raw.laneId || raw.sessionLane || payload.lane || ""),
    laneId: cleanText(raw.laneId || raw.lane || ""),
    sessionLane: cleanText(raw.sessionLane || raw.lane || ""),
    bridge: isObj(raw.bridge) ? raw.bridge : null,
    ctx: isObj(raw.ctx) ? raw.ctx : {},
    ui: isObj(raw.ui) ? raw.ui : {},
    emotionalTurn: isObj(raw.emotionalTurn) ? raw.emotionalTurn : null,
    directives: Array.isArray(raw.directives) ? raw.directives : [],
    followUps: Array.isArray(raw.followUps) ? raw.followUps : [],
    followUpsStrings: Array.isArray(raw.followUpsStrings) ? raw.followUpsStrings : [],
    sessionPatch: isObj(raw.sessionPatch) ? raw.sessionPatch : {},
    cog: isObj(raw.cog) ? raw.cog : {},
    meta: isObj(raw.meta) ? raw.meta : {},
    speech,
    audio: isObj(raw.audio) ? raw.audio : null,
    ttsProfile: isObj(raw.ttsProfile) ? raw.ttsProfile : null,
    voiceRoute: isObj(raw.voiceRoute) ? raw.voiceRoute : null,
    requestId: cleanText(raw.requestId || payload.requestId || ""),
    traceId: cleanText(raw.traceId || payload.traceId || "")
  };
}

function repairBridgeEnvelope(bridge, marion, lane) {
  const candidate = isObj(bridge) ? { ...bridge } : (isObj(marion) ? { ...marion } : {});
  if (!isObj(candidate)) return null;
  const out = {
    ...candidate,
    v: cleanText(candidate.v || candidate.version || "bridge.v3") || "bridge.v3",
    authority: cleanText(candidate.authority || candidate.mode || "bridge_primary") || "bridge_primary",
    domain: cleanText(candidate.domain || lane || "general") || "general",
    intent: cleanText(candidate.intent || candidate.routeIntent || candidate.mode || "general") || "general",
    confidence: Number.isFinite(Number(candidate.confidence)) ? clamp(Number(candidate.confidence), 0, 1) : 0.82,
    source: cleanText(candidate.source || "marion") || "marion"
  };
  return out;
}

function repairEngineContract(shaped, marion, norm) {
  const base = isObj(shaped) ? { ...shaped } : {};
  const lane = cleanText(base.lane || base.laneId || base.sessionLane || norm?.lane || "general") || "general";
  const laneId = cleanText(base.laneId || lane) || lane;
  const sessionLane = cleanText(base.sessionLane || lane) || lane;
  const payload = isObj(base.payload) ? { ...base.payload } : {};
  const reply = cleanReplyForUser(base.reply || payload.reply || payload.text || payload.message || "");
  const bridge = repairBridgeEnvelope(base.bridge, marion, lane);
  const speech = isObj(base.speech) ? { ...base.speech } : (isObj(payload.speech) ? { ...payload.speech } : null);
  const followUps = Array.isArray(base.followUps) ? base.followUps : [];
  const followUpsStrings = Array.isArray(base.followUpsStrings) && base.followUpsStrings.length
    ? base.followUpsStrings
    : followUps.map((item) => cleanText((item && (item.label || item.title || item.text)) || item || "")).filter(Boolean).slice(0, 4);

  payload.reply = reply;
  payload.text = cleanText(payload.text || reply) || reply;
  payload.message = cleanText(payload.message || reply) || reply;
  if (speech) payload.speech = { ...speech };

  return {
    ok: base.ok !== false,
    reply,
    payload,
    lane,
    laneId,
    sessionLane,
    bridge,
    ctx: isObj(base.ctx) ? base.ctx : {},
    ui: isObj(base.ui) ? base.ui : {},
    emotionalTurn: isObj(base.emotionalTurn) ? base.emotionalTurn : null,
    directives: Array.isArray(base.directives) ? base.directives : [],
    followUps,
    followUpsStrings,
    sessionPatch: isObj(base.sessionPatch) ? base.sessionPatch : {},
    cog: isObj(base.cog) ? base.cog : {},
    meta: isObj(base.meta) ? base.meta : {},
    speech,
    audio: isObj(base.audio) ? base.audio : null,
    ttsProfile: isObj(base.ttsProfile) ? base.ttsProfile : null,
    voiceRoute: isObj(base.voiceRoute) ? base.voiceRoute : null,
    requestId: cleanText(base.requestId || ""),
    traceId: cleanText(base.traceId || norm?.traceId || "")
  };
}

function normalizeMarionEmotionState(value, fallback) {
  const raw = lower(value || fallback || "");
  if (["calm", "intense", "playful", "serious", "supportive"].includes(raw)) return raw;
  if (/(crisis|distress|support|care|gentle|soft|warm)/.test(raw)) return "supportive";
  if (/(technical|focus|grounded|serious)/.test(raw)) return "serious";
  if (/(joy|upbeat|light|fun|playful)/.test(raw)) return "playful";
  if (/(urgent|intense|sharp|escalat)/.test(raw)) return "intense";
  return "calm";
}

function buildMarionContinuity(prev, norm, emotion) {
  const previous = isObj(prev) ? prev : {};
  const refs = uniq([
    cleanText(previous.lane || ""),
    cleanText(previous.emotionLabel || ""),
    cleanText(previous.userText || "").split(/\s+/).slice(0, 8).join(" "),
    cleanText(norm && norm.intentHint || ""),
    cleanText(norm && norm.domainHint || "")
  ].filter(Boolean)).slice(0, 4);
  return {
    references: refs,
    memory_thread: cleanText(previous.userText || previous.reply || "").slice(0, 180),
    last_user_text: cleanText(previous.userText || "").slice(0, 220),
    last_reply: cleanText(previous.reply || "").slice(0, 220),
    emotional_carry: normalizeMarionEmotionState(previous.emotionLabel || (emotion && emotion.label) || "calm")
  };
}

function normalizeMarionContract(raw, norm, emotion, prevTurn) {
  const src = isObj(raw) ? raw : {};
  const payload = isObj(src.payload) ? src.payload : {};
  const packet = isObj(src.packet) ? src.packet : {};
  const synthesis = isObj(packet.synthesis) ? packet.synthesis : {};
  const continuitySrc = isObj(src.continuity) ? src.continuity : {};
  const metaSrc = isObj(src.meta) ? src.meta : {};
  const response = cleanReplyForUser(
    src.response || src.reply || src.text || src.output || src.answer || src.spokenText ||
    payload.reply || payload.text || payload.message || payload.spokenText ||
    synthesis.reply || synthesis.answer || ""
  );
  const followUp = cleanText(src.follow_up || src.followUp || metaSrc.follow_up || payload.follow_up || payload.followUp || "");
  const normalizedEmotion = normalizeMarionEmotionState(
    src.emotional_state || src.emotionalState || metaSrc.emotional_state || metaSrc.emotion || "",
    emotion && emotion.label || "calm"
  );
  const continuity = {
    ...buildMarionContinuity(prevTurn, norm, emotion),
    ...(isObj(continuitySrc) ? continuitySrc : {})
  };
  return {
    status: cleanText(src.status || (src.ok === false ? "error" : "success")) || "success",
    intent: cleanText(src.intent || src.routeIntent || metaSrc.intent || norm && norm.intentHint || "general") || "general",
    emotional_state: normalizedEmotion,
    response,
    follow_up: followUp,
    continuity,
    meta: {
      confidence: Number.isFinite(Number(metaSrc.confidence ?? src.confidence)) ? clamp(Number(metaSrc.confidence ?? src.confidence), 0, 1) : 0.82,
      fallback: !!(metaSrc.fallback || src.fallback || src.ok === false || !response),
      source: cleanText(metaSrc.source || src.source || "marion") || "marion",
      traceId: cleanText(metaSrc.traceId || src.traceId || norm && norm.traceId || "")
    }
  };
}

function validateMarionContract(contract) {
  const c = isObj(contract) ? contract : {};
  const errors = [];
  if (cleanText(c.status || "") !== "success") errors.push("status_not_success");
  if (!cleanText(c.intent || "")) errors.push("missing_intent");
  if (!cleanText(c.emotional_state || "")) errors.push("missing_emotional_state");
  if (!cleanText(c.response || "")) errors.push("missing_response");
  if (!isObj(c.continuity)) errors.push("missing_continuity");
  if (!isObj(c.meta)) errors.push("missing_meta");
  return { ok: errors.length === 0, errors };
}

function shouldForceMarionReply(contract, norm) {
  const c = isObj(contract) ? contract : null;
  if (!c) return false;
  const checked = validateMarionContract(c);
  if (!checked.ok) return false;
  const text = lower(norm && norm.text || "");
  if (!text) return true;
  if (/(one\s+direct\s+answer|answer\s+this\s+in\s+one\s+sentence|answer\s+directly|direct\s+answer|just\s+answer|give\s+me\s+the\s+answer|what\s+is|what\s+are|how\s+do|how\s+does|why\s+is|define|explain\s+briefly)/.test(text)) return true;
  if (cleanText(c.intent || "") && /^(direct_answer|answer|definition|explain|brief_answer)$/i.test(cleanText(c.intent || ""))) return true;
  return true;
}

function enforceMarionContract(shaped, contract, norm) {
  const out = isObj(shaped) ? { ...shaped } : {};
  const c = isObj(contract) ? contract : null;
  const checked = validateMarionContract(c);
  out.meta = mergeMeta(out.meta, {
    marionContractVersion: "marion-nyx-v1",
    marionContractOk: checked.ok,
    marionContractErrors: checked.errors
  });
  if (!c || !checked.ok) return out;
  const locked = cleanReplyForUser(c.response || "");
  if (!locked) return out;
  out.reply = locked;
  out.payload = {
    ...(isObj(out.payload) ? out.payload : {}),
    reply: locked,
    text: locked,
    message: locked,
    spokenText: locked,
    marionContract: c,
    continuity: c.continuity
  };
  out.bridge = {
    ...(isObj(out.bridge) ? out.bridge : {}),
    marionContract: c,
    continuity: c.continuity,
    intent: c.intent,
    emotional_state: c.emotional_state,
    confidence: c.meta && c.meta.confidence
  };
  out.cog = {
    ...(isObj(out.cog) ? out.cog : {}),
    intent: cleanText(out.cog && out.cog.intent || c.intent || ""),
    mode: cleanText(out.cog && out.cog.mode || "authoritative"),
    publicMode: out.cog && out.cog.publicMode !== false
  };
  out.meta = mergeMeta(out.meta, {
    replyAuthority: "marion_contract_locked",
    semanticAuthority: "marion",
    marionIntent: c.intent,
    marionEmotionalState: c.emotional_state,
    marionConfidence: c.meta && c.meta.confidence,
    marionFallback: !!(c.meta && c.meta.fallback)
  });
  return out;
}

function applyContinuityStitch(shaped, prevTurn, contract, norm, emotion) {
  const out = isObj(shaped) ? { ...shaped } : {};
  const prev = isObj(prevTurn) ? prevTurn : {};
  const continuity = isObj(contract && contract.continuity) ? { ...contract.continuity } : buildMarionContinuity(prev, norm, emotion);
  out.payload = {
    ...(isObj(out.payload) ? out.payload : {}),
    continuity
  };
  out.bridge = {
    ...(isObj(out.bridge) ? out.bridge : {}),
    continuity
  };
  const follow = cleanText(contract && contract.follow_up || "");
  const existing = Array.isArray(out.followUpsStrings) ? out.followUpsStrings.filter(Boolean) : [];
  const stitched = [];
  if (follow) stitched.push(follow);
  const prevUser = cleanText(prev.userText || "");
  if (prevUser && !stitched.length) stitched.push(`Do you want to keep building from what you said about ${clipText(prevUser, 72)}?`);
  out.followUpsStrings = uniq([...existing, ...stitched].map((v) => cleanText(v)).filter(Boolean)).slice(0, 4);
  out.meta = mergeMeta(out.meta, {
    continuityStitchApplied: true,
    continuityReferences: Array.isArray(continuity.references) ? continuity.references.slice(0, 4) : [],
    continuityMemoryThread: cleanText(continuity.memory_thread || "").slice(0, 180)
  });
  return out;
}

function buildLoggingSpine(trace) {
  const src = isObj(trace) ? trace : {};
  return {
    traceId: cleanText(src.traceId || ""),
    sessionId: cleanText(src.sessionId || ""),
    startedAt: Number(src.startedAt || now()),
    request: isObj(src.request) ? src.request : {},
    marion_raw: src.marion_raw || null,
    marion_contract: src.marion_contract || null,
    normalized: src.normalized || null,
    stitched: src.stitched || null,
    rendered: src.rendered || null,
    errors: Array.isArray(src.errors) ? src.errors : []
  };
}

function getMarionAuthorityReply(marion) {
  if (!isObj(marion)) return "";
  return cleanReplyForUser(
    marion.reply ||
    marion.text ||
    marion.output ||
    marion.answer ||
    marion.spokenText ||
    (isObj(marion.payload) ? (marion.payload.reply || marion.payload.text || marion.payload.message || marion.payload.spokenText || "") : "") ||
    (isObj(marion.packet) && isObj(marion.packet.synthesis) ? (marion.packet.synthesis.reply || marion.packet.synthesis.answer || "") : "") ||
    ""
  );
}

function shouldLockMarionAuthority(marion) {
  const reply = getMarionAuthorityReply(marion);
  if (!reply) return false;
  if (!isObj(marion)) return false;
  const ok = marion.ok !== false;
  return !!ok;
}

function enforceMarionAuthority(shaped, marion, opts) {
  const out = isObj(shaped) ? { ...shaped } : {};
  const options = isObj(opts) ? opts : {};
  const marionReply = getMarionAuthorityReply(marion);
  const hasAuthority = shouldLockMarionAuthority(marion);
  out.meta = mergeMeta(out.meta, {
    marionAuthorityCandidate: hasAuthority,
    marionAuthorityReplyPresent: !!marionReply
  });
  if (!hasAuthority) return out;

  const locked = marionReply;
  const payload = isObj(out.payload) ? { ...out.payload } : {};
  payload.reply = locked;
  payload.text = locked;
  payload.message = locked;
  payload.spokenText = locked;

  out.ok = out.ok !== false;
  out.reply = locked;
  out.text = locked;
  out.output = locked;
  out.answer = locked;
  out.spokenText = locked;
  out.payload = payload;
  out.bridge = repairBridgeEnvelope(out.bridge, marion, out.lane || out.laneId || out.sessionLane || options.lane || "general");
  out.meta = mergeMeta(out.meta, {
    replyAuthority: "marion_locked",
    semanticAuthority: "marion",
    authorityLock: true,
    marionReplyHash: replyHash(locked)
  });
  return out;
}

let chatEngineRuntime = null;

function getChatEngineRuntime() {
  if (chatEngineRuntime) return chatEngineRuntime;
  if (!chatEngineMod || !isObj(chatEngineMod) || typeof chatEngineMod.ChatEngine !== "function") return null;
  try {
    const options = {};
    if (typeof chatEngineMod.BasicEffectEngine === "function") {
      options.effectEngine = new chatEngineMod.BasicEffectEngine();
    }
    chatEngineRuntime = new chatEngineMod.ChatEngine(options);
    return chatEngineRuntime;
  } catch (err) {
    console.log("[Sandblast][chatEngine:runtime_init_error]", err && (err.stack || err.message || err));
    return null;
  }
}

async function callChatEngine(input) {
  if (!chatEngineMod) return null;
  try {
    if (typeof chatEngineMod.handleChat === "function") return await chatEngineMod.handleChat(input);
    if (typeof chatEngineMod.run === "function") return await chatEngineMod.run(input);
    if (typeof chatEngineMod.chat === "function") return await chatEngineMod.chat(input);
    if (typeof chatEngineMod.handle === "function") return await chatEngineMod.handle(input);
    if (typeof chatEngineMod.reply === "function") return await chatEngineMod.reply(input);
    const runtime = getChatEngineRuntime();
    if (runtime && typeof runtime.processInput === "function") {
      const response = await Promise.resolve(runtime.processInput(cleanText(input && input.text || ""), input || {}));
      return {
        ok: true,
        reply: cleanReplyForUser(response),
        payload: { reply: cleanReplyForUser(response) },
        lane: cleanText(input && input.lane || "general") || "general",
        laneId: cleanText(input && input.lane || "general") || "general",
        sessionLane: cleanText(input && input.lane || "general") || "general",
        bridge: isObj(input && input.marion) ? input.marion : null,
        ctx: {},
        ui: {},
        directives: [],
        followUps: [],
        followUpsStrings: [],
        sessionPatch: {},
        cog: { intent: cleanText(input && input.intentHint || "general") || "general", mode: "runtime", publicMode: true },
        meta: { replyAuthority: "chat_engine_runtime", engineVersion: INDEX_VERSION }
      };
    }
    if (typeof chatEngineMod === "function") return await chatEngineMod(input);
  } catch (err) {
    console.log("[Sandblast][chatEngine:error]", err && (err.stack || err.message || err));
    return { __engineError: err };
  }
  return null;
}

async function callMarionBridge(input) {
  if (!marionBridgeMod) return null;
  try {
    if (typeof marionBridgeMod.route === "function") return await marionBridgeMod.route(input);
    if (typeof marionBridgeMod.ask === "function") return await marionBridgeMod.ask(input);
    if (typeof marionBridgeMod.handle === "function") return await marionBridgeMod.handle(input);
    if (typeof marionBridgeMod === "function") return await marionBridgeMod(input);
  } catch (err) {
    console.log("[Sandblast][marionBridge:error]", err && (err.stack || err.message || err));
  }
  return null;
}

function callWithTimeout(promiseOrValue, ms, label) {
  const timeoutMs = clamp(Number(ms || CFG.requestTimeoutMs || 18000), 1000, 60000);
  return Promise.race([
    Promise.resolve(promiseOrValue),
    new Promise((_, reject) => setTimeout(() => reject(new Error(`${label || "operation"}_timeout`)), timeoutMs))
  ]);
}

function ttsHandlerFromModule(mod) {
  if (!mod) return null;
  if (typeof mod.handleTts === "function") return mod.handleTts.bind(mod);
  if (typeof mod.ttsHandler === "function") return mod.ttsHandler.bind(mod);
  if (typeof mod.handler === "function") return mod.handler.bind(mod);
  if (typeof mod.handle === "function") return mod.handle.bind(mod);
  if (typeof mod.delegateTts === "function") return mod.delegateTts.bind(mod);
  if (typeof mod.generateSpeech === "function") return mod.generateSpeech.bind(mod);
  if (typeof mod.speak === "function") return mod.speak.bind(mod);
  if (typeof mod.run === "function") return mod.run.bind(mod);
  if (typeof mod.generate === "function") return mod.generate.bind(mod);
  if (typeof mod.tts === "function") return mod.tts.bind(mod);
  if (typeof mod.synthesize === "function") return mod.synthesize.bind(mod);
  if (typeof mod.default === "function") return mod.default.bind(mod);
  if (typeof mod === "function") return mod;
  return null;
}

function voiceRouteHandlerFromModule(mod) {
  if (!mod) return null;
  if (typeof mod.handleVoiceRoute === "function") return mod.handleVoiceRoute.bind(mod);
  if (typeof mod.voiceRouteHandler === "function") return mod.voiceRouteHandler.bind(mod);
  if (typeof mod.handler === "function") return mod.handler.bind(mod);
  if (typeof mod.handle === "function") return mod.handle.bind(mod);
  if (typeof mod === "function") return mod;
  return null;
}

function voiceHealthFromModule(mod) {
  if (!mod) return null;
  if (typeof mod.health === "function") return mod.health.bind(mod);
  if (typeof mod.getHealth === "function") return mod.getHealth.bind(mod);
  return null;
}

function ttsHealthFromModule(mod) {
  if (!mod) return null;
  if (typeof mod.health === "function") return mod.health.bind(mod);
  if (typeof mod.getHealth === "function") return mod.getHealth.bind(mod);
  if (typeof mod.status === "function") return mod.status.bind(mod);
  return null;
}

function sendTtsJsonError(req, res, statusCode, error, detail, extra) {
  const code = clamp(Number(statusCode || 503), 400, 599);
  const traceId = cleanText((req && (req.sbTraceId || (req.headers && req.headers["x-sb-trace-id"]))) || makeTraceId("tts"));
  const payload = {
    ok: false,
    spokenUnavailable: true,
    error: cleanText(error || "tts_route_failure") || "tts_route_failure",
    detail: cleanText(detail || "TTS route failed") || "TTS route failed",
    traceId,
    meta: { v: INDEX_VERSION, t: now() },
    payload: { spokenUnavailable: true }
  };
  if (isObj(extra)) Object.assign(payload, extra);
  return res.status(code).json(payload);
}

async function dispatchTts(req, res) {
  const moduleHandler = ttsHandlerFromModule(ttsMod);
  if (CFG.httpLogEnabled) {
    console.log("[Sandblast][ttsRoute:dispatch]", { path: req.originalUrl || req.path || "/api/tts", hasHandler: !!moduleHandler, host: getBackendPublicBase(), traceId: cleanText(req.sbTraceId || req.headers["x-sb-trace-id"] || "") });
  }
  if (!moduleHandler) {
    throw new Error("tts_handler_unavailable");
  }
  return moduleHandler(req, res);
}

function attachVoiceRoute(base) {
  const shaped = isObj(base) ? { ...base } : {};
  const existing = isObj(shaped.voiceRoute) ? shaped.voiceRoute : {};
  const routeEnabled = !!CFG.voiceRouteEnabled;
  const route = {
    enabled: routeEnabled,
    endpoint: routeUrl("/api/tts"),
    healthEndpoint: routeUrl("/api/tts/health"),
    method: "POST",
    requiresToken: !!(CFG.requireVoiceRouteToken && CFG.apiToken),
    preserveMixerVoice: !!CFG.preserveMixerVoice,
    jsonAudioSupported: true,
    streamAudioSupported: true,
    contractVersion: "audio-first-v1",
    deterministicAudio: true,
    failOpenChat: true,
    traceHeader: "x-sb-trace-id"
  };

  if (routeEnabled && shaped.reply && !shaped.audio) {
    shaped.voiceRoute = { ...route, ...existing };
  } else if (existing && Object.keys(existing).length) {
    shaped.voiceRoute = { ...route, ...existing };
  }

  return shaped;
}

function normalizeVoiceRouteResponse(out) {
  if (!isObj(out)) return null;
  return {
    enabled: out.enabled !== false,
    endpoint: cleanText(out.endpoint || "/api/tts") || "/api/tts",
    healthEndpoint: cleanText(out.healthEndpoint || "/api/tts/health") || "/api/tts/health",
    method: cleanText(out.method || "POST") || "POST",
    requiresToken: !!out.requiresToken,
    preserveMixerVoice: !!out.preserveMixerVoice,
    jsonAudioSupported: out.jsonAudioSupported !== false,
    streamAudioSupported: out.streamAudioSupported !== false,
    contractVersion: cleanText(out.contractVersion || "audio-first-v1") || "audio-first-v1",
    deterministicAudio: out.deterministicAudio !== false,
    failOpenChat: out.failOpenChat !== false,
    traceHeader: cleanText(out.traceHeader || "x-sb-trace-id") || "x-sb-trace-id"
  };
}

function buildSpeechContract(shaped, norm) {
  const payload = isObj(shaped && shaped.payload) ? shaped.payload : {};
  const voiceRoute = isObj(shaped && shaped.voiceRoute) ? shaped.voiceRoute : {};
  const incomingSpeech = isObj(shaped && shaped.speech) ? shaped.speech : (isObj(payload.speech) ? payload.speech : {});
  const reply = cleanReplyForUser(
    (incomingSpeech.displayText || incomingSpeech.text || shaped && shaped.reply || payload.reply || payload.text || voiceRoute.text || norm && norm.text || "")
  );
  const textDisplay = cleanReplyForUser(
    incomingSpeech.displayText || payload.textDisplay || voiceRoute.textDisplay || shaped && shaped.textDisplay || reply
  ) || reply;
  const textSpeak = cleanReplyForUser(
    incomingSpeech.normalizedText || incomingSpeech.text || payload.textSpeak || voiceRoute.textSpeak || shaped && shaped.textSpeak || reply
  ) || reply;
  const routeKind = cleanText(
    payload.routeKind || voiceRoute.routeKind || shaped && shaped.routeKind || (norm && norm.mode === "intro" ? "intro" : "main")
  ) || "main";
  const intro = voiceRoute.intro === true || payload.intro === true || routeKind === "intro";
  const source = cleanText(payload.source || voiceRoute.source || (intro ? "intro" : "chat"));
  const speechHints = isObj(payload.speechHints) ? payload.speechHints : (isObj(voiceRoute.speechHints) ? voiceRoute.speechHints : {});
  return {
    enabled: incomingSpeech.enabled !== false,
    speak: incomingSpeech.speak !== false,
    text: reply,
    textDisplay,
    textSpeak,
    routeKind,
    intro,
    source: source || (intro ? "intro" : "chat"),
    speechHints,
    presenceProfile: cleanText(incomingSpeech.presenceProfile || payload.presenceProfile || "") || undefined,
    voiceStyle: cleanText(incomingSpeech.voiceStyle || payload.voiceStyle || "") || undefined,
    nyxStateHint: cleanText(incomingSpeech.nyxStateHint || payload.nyxStateHint || "") || undefined,
    alignmentVersion: "speech-contract-v2"
  };
}


function normalizeImageLike(entry, title) {
  if (!entry) return null;
  if (typeof entry === "string") {
    const url = cleanText(entry);
    return url ? { url, alt: cleanText(title || ""), caption: "" } : null;
  }
  if (!isObj(entry)) return null;
  const url = cleanText(entry.url || entry.src || entry.href || entry.image || entry.original || entry.large || entry.medium || entry.small || entry.thumbnail || "");
  if (!url) return null;
  return {
    url,
    alt: cleanText(entry.alt || entry.title || title || ""),
    caption: cleanText(entry.caption || entry.description || "")
  };
}

function getNewsCanadaService() {
  return newsCanadaPrimaryService || newsCanadaFeedService;
}

async function getNewsCanadaEditorsPicksResponse(req) {
  const service = getNewsCanadaService();
  if (!service || typeof service.getEditorsPicks !== "function") {
    return {
      ok: false,
      error: "news_canada_service_unavailable",
      route: "/api/newscanada/editors-picks",
      stories: [],
      meta: { v: INDEX_VERSION, t: now(), source: "service_unavailable", degraded: true }
    };
  }

  const result = await Promise.resolve(service.getEditorsPicks({
    refresh: req.query && req.query.refresh === "1",
    limit: Number(req.query && req.query.limit || 0) || undefined
  }));

  return {
    ok: result && result.ok !== false,
    route: "/api/newscanada/editors-picks",
    storyRoute: "/api/newscanada/story",
    availableStories: Array.isArray(result && result.stories) ? result.stories.filter((story) => story && story.isActive !== false).length : 0,
    storyCount: Array.isArray(result && result.stories) ? result.stories.length : 0,
    count: Array.isArray(result && result.stories) ? result.stories.length : 0,
    stories: Array.isArray(result && result.stories) ? result.stories : [],
    items: Array.isArray(result && result.stories) ? result.stories : [],
    articles: Array.isArray(result && result.stories) ? result.stories : [],
    editorsPicks: Array.isArray(result && result.stories) ? result.stories : [],
    editorPicks: Array.isArray(result && result.stories) ? result.stories : [],
    feed: Array.isArray(result && result.stories) ? result.stories : [],
    slides: Array.isArray(result && result.slides) ? result.slides : (Array.isArray(result && result.stories) ? result.stories : []),
    panels: Array.isArray(result && result.slides) ? result.slides : (Array.isArray(result && result.stories) ? result.stories : []),
    chips: Array.isArray(result && result.chips) ? result.chips : [],
    meta: {
      v: INDEX_VERSION,
      t: now(),
      source: cleanText(result && result.meta && result.meta.source || "rss_service") || "rss_service",
      degraded: !!(result && result.meta && result.meta.degraded),
      mode: cleanText(result && result.meta && result.meta.mode || "rss") || "rss",
      feedUrl: cleanText(result && result.meta && result.meta.feedUrl || ""),
      fetchedAt: Number(result && result.meta && result.meta.fetchedAt || 0),
      storyCount: Number(result && result.meta && result.meta.storyCount || 0),
      contractVersion: "newscanada-rss-service-v1",
      stableRoutes: {
        editorsPicks: "/api/newscanada/editors-picks",
        editorsPicksMeta: "/api/newscanada/editors-picks/meta",
        story: "/api/newscanada/story"
      }
    }
  };
}

async function getNewsCanadaStoryResponse(req) {
  const service = getNewsCanadaService();
  if (!service || typeof service.getStory !== "function") {
    return {
      ok: false,
      error: "news_canada_service_unavailable",
      route: "/api/newscanada/story",
      meta: { v: INDEX_VERSION, t: now(), source: "service_unavailable", degraded: true }
    };
  }

  const lookup = cleanText(req.query.id || req.query.storyId || req.query.slotId || req.query.slug || req.query.title || req.query.url || "");
  const result = await Promise.resolve(service.getStory(lookup, {
    refresh: req.query && req.query.refresh === "1"
  }));

  if (!result || result.ok === false || !isObj(result.story)) {
    return {
      ok: false,
      error: "story_not_found",
      route: "/api/newscanada/story",
      lookup,
      meta: { v: INDEX_VERSION, t: now(), source: cleanText(result && result.meta && result.meta.source || "rss_service") || "rss_service" }
    };
  }

  return {
    ok: true,
    route: "/api/newscanada/story",
    story: result.story,
    popup: {
      title: result.story.title,
      body: result.story.popupBody || result.story.body || result.story.content || result.story.summary || "",
      image: result.story.popupImage || result.story.image || "",
      summary: result.story.summary || "",
      url: result.story.url || "",
      ctaText: result.story.ctaText || "Read more"
    },
    meta: {
      v: INDEX_VERSION,
      t: now(),
      source: cleanText(result && result.meta && result.meta.source || "rss_service") || "rss_service",
      degraded: !!(result && result.meta && result.meta.degraded)
    }
  };
}

async function getNewsCanadaRssResponse(req) {
  const service = getNewsCanadaService();
  if (!service || typeof service.fetchRSS !== "function") {
    return {
      ok: false,
      error: "news_canada_service_unavailable",
      route: "/api/newscanada/rss",
      items: [],
      meta: { v: INDEX_VERSION, t: now(), source: "service_unavailable", degraded: true }
    };
  }

  try {
    const result = await Promise.resolve(service.fetchRSS({
      refresh: req.query && req.query.refresh === "1"
    }));

    return {
      ok: result && result.ok !== false,
      route: "/api/newscanada/rss",
      items: Array.isArray(result && result.items) ? result.items : [],
      meta: {
        v: INDEX_VERSION,
        t: now(),
        source: cleanText(result && result.meta && result.meta.source || "rss_service") || "rss_service",
        degraded: !!(result && result.meta && result.meta.degraded),
        mode: cleanText(result && result.meta && result.meta.mode || "rss") || "rss",
        parserMode: cleanText(result && result.meta && result.meta.parserMode || "unknown") || "unknown",
        contentType: cleanText(result && result.meta && result.meta.contentType || "") || "",
        resolvedUrl: cleanText(result && result.meta && result.meta.resolvedUrl || "") || "",
        attemptedUrls: Array.isArray(result && result.meta && result.meta.attemptedUrls) ? result.meta.attemptedUrls.slice(0, 12) : [],
        sample: cleanText(result && result.meta && result.meta.sample || ""),
        detail: cleanText(result && result.meta && result.meta.detail || ""),
        feedUrl: cleanText(result && result.meta && result.meta.feedUrl || resolveNewsCanadaFeedUrl()),
        fetchedAt: Number(result && result.meta && result.meta.fetchedAt || 0),
        itemCount: Array.isArray(result && result.items) ? result.items.length : 0,
        cacheContractPath: cleanText(result && result.meta && result.meta.cacheContractPath || "") || "",
        cacheContractCandidates: Array.isArray(result && result.meta && result.meta.cacheContractCandidates) ? result.meta.cacheContractCandidates.slice(0, 8) : getNewsCanadaCacheContractPaths(),
        contractVersion: "newscanada-rss-service-v3"
      }
    };
  } catch (err) {
    return {
      ok: false,
      error: "rss_fetch_failed",
      route: "/api/newscanada/rss",
      items: [],
      meta: {
        v: INDEX_VERSION,
        t: now(),
        source: "rss_service",
        degraded: true,
        detail: cleanText(err && (err.message || err.code || "rss_fetch_failed"))
      }
    };
  }
}

function wantsNewsCanadaLegacyArray(req) {
  const format = lower(req.query && req.query.format);
  const accept = lower(req.headers && req.headers.accept);
  return format === "array" || accept.includes("application/vnd.sandblast.newscanada.array+json");
}

const NEWS_CANADA_COMPAT_ALIASES = Object.freeze({
  foryourlife: {
    aliases: ["/foryourlife", "/for-your-life", "/api/foryourlife", "/api/for-your-life"],
    slot: "for-your-life",
    label: "For Your Life"
  },
  editorspick: {
    aliases: ["/editorspick", "/editors-pick", "/editorspicks", "/editor-picks", "/api/editorspick", "/api/editors-pick", "/api/editorspicks", "/api/editor-picks"],
    slot: "editors-pick",
    label: "Editor's Pick"
  },
  topstory: {
    aliases: ["/topstory", "/top-story", "/api/topstory", "/api/top-story"],
    slot: "top-story",
    label: "Top Story"
  }
});

function buildNewsCanadaRouteHints() {
  return {
    rss: "/api/newscanada/rss",
    manualCompat: "/api/newscanada/manual",
    editorsPicks: "/api/newscanada/editors-picks",
    editorsPicksMeta: "/api/newscanada/editors-picks/meta",
    story: "/api/newscanada/story",
    diagnostics: "/api/newscanada/diagnostics",
    aliases: {
      foryourlife: NEWS_CANADA_COMPAT_ALIASES.foryourlife.aliases,
      editorspick: NEWS_CANADA_COMPAT_ALIASES.editorspick.aliases,
      topstory: NEWS_CANADA_COMPAT_ALIASES.topstory.aliases
    }
  };
}

async function getNewsCanadaCompatAliasResponse(req, aliasConfig) {
  const out = await getNewsCanadaEditorsPicksResponse(req);
  return {
    ...out,
    route: cleanText(req.originalUrl || req.path || ""),
    compatibilityAlias: true,
    requestedSlot: cleanText(aliasConfig && aliasConfig.slot || ""),
    requestedLabel: cleanText(aliasConfig && aliasConfig.label || ""),
    meta: {
      ...(isObj(out.meta) ? out.meta : {}),
      compatibilityAlias: true,
      aliasTarget: "/api/newscanada/editors-picks",
      requestedSlot: cleanText(aliasConfig && aliasConfig.slot || ""),
      requestedLabel: cleanText(aliasConfig && aliasConfig.label || "")
    }
  };
}

function installNewsCanadaCompatAliases() {
  Object.values(NEWS_CANADA_COMPAT_ALIASES).forEach((aliasConfig) => {
    app.get(aliasConfig.aliases, async (req, res) => {
      applyCors(req, res);
      const out = await getNewsCanadaCompatAliasResponse(req, aliasConfig);
      res.setHeader("x-sb-newscanada-source", cleanText(out.meta && out.meta.source || "rss_service") || "rss_service");
      res.setHeader("x-sb-newscanada-degraded", out.meta && out.meta.degraded ? "1" : "0");
      res.setHeader("x-sb-newscanada-shape", wantsNewsCanadaLegacyArray(req) ? "array" : "object");
      res.setHeader("x-sb-newscanada-alias", cleanText(aliasConfig.slot || "compat"));
      if (wantsNewsCanadaLegacyArray(req)) {
        return res.status(out.ok ? 200 : 503).json(out.slides || out.stories || []);
      }
      return res.status(out.ok ? 200 : 503).json(out);
    });
  });
}

installNewsCanadaCompatAliases();

app.get(["/api/newscanada/rss", "/newscanada/rss"], async (req, res) => {
  applyCors(req, res);
  const out = await getNewsCanadaRssResponse(req);
  res.setHeader("x-sb-newscanada-source", cleanText(out.meta && out.meta.source || "rss_service") || "rss_service");
  res.setHeader("x-sb-newscanada-degraded", out.meta && out.meta.degraded ? "1" : "0");
  res.setHeader("x-sb-newscanada-shape", "object");
  return res.status(out.ok ? 200 : 503).json(out);
});

app.get(["/api/newscanada/diagnostics", "/newscanada/diagnostics"], async (req, res) => {
  applyCors(req, res);
  let health = null;
  try {
    health = newsCanadaFeedService && typeof newsCanadaFeedService.health === "function"
      ? await Promise.resolve(newsCanadaFeedService.health())
      : null;
  } catch (err) {
    health = {
      ok: false,
      source: "health_error",
      degraded: true,
      detail: cleanText(err && (err.message || err) || "health_error")
    };
  }

  return res.status(200).json({
    ok: !!newsCanadaFeedService,
    route: "/api/newscanada/diagnostics",
    moduleLoaded: !!newsCanadaFeedServiceMod,
    moduleKeys: isObj(newsCanadaFeedServiceMod)
      ? Object.keys(newsCanadaFeedServiceMod).slice(0, 20)
      : [],
    serviceMethods: newsCanadaFeedService
      ? {
          fetchRSS: typeof newsCanadaFeedService.fetchRSS === "function",
          getEditorsPicks: typeof newsCanadaFeedService.getEditorsPicks === "function",
          getStory: typeof newsCanadaFeedService.getStory === "function",
          prime: typeof newsCanadaFeedService.prime === "function",
          health: typeof newsCanadaFeedService.health === "function"
        }
      : null,
    feedUrl: resolveNewsCanadaFeedUrl(),
    health,
    meta: { v: INDEX_VERSION, t: now() }
  });
});

app.get(["/api/newscanada/manual", "/newscanada/manual"], async (req, res) => {
  applyCors(req, res);
  const out = await getNewsCanadaEditorsPicksResponse(req);
  const response = {
    ...out,
    route: "/api/newscanada/manual",
    compatibilityAlias: true,
    meta: {
      ...(isObj(out.meta) ? out.meta : {}),
      compatibilityAlias: true,
      aliasTarget: "/api/newscanada/editors-picks"
    }
  };
  res.setHeader("x-sb-newscanada-source", cleanText(response.meta && response.meta.source || "rss_service") || "rss_service");
  res.setHeader("x-sb-newscanada-degraded", response.meta && response.meta.degraded ? "1" : "0");
  res.setHeader("x-sb-newscanada-shape", "object");
  return res.status(response.ok ? 200 : 503).json(response);
});

app.get(["/api/newscanada/editors-picks", "/newscanada/editors-picks"], async (req, res) => {
  applyCors(req, res);
  const out = await getNewsCanadaEditorsPicksResponse(req);
  res.setHeader("x-sb-newscanada-source", cleanText(out.meta && out.meta.source || "rss_service") || "rss_service");
  res.setHeader("x-sb-newscanada-degraded", out.meta && out.meta.degraded ? "1" : "0");
  if (wantsNewsCanadaLegacyArray(req)) {
    res.setHeader("x-sb-newscanada-shape", "array");
    return res.status(out.ok ? 200 : 503).json(out.slides || out.stories || []);
  }
  res.setHeader("x-sb-newscanada-shape", "object");
  return res.status(out.ok ? 200 : 503).json(out);
});

app.get(["/api/newscanada/editors-picks/meta", "/newscanada/editors-picks/meta"], async (req, res) => {
  applyCors(req, res);
  res.setHeader("x-sb-newscanada-shape", "object");
  return res.status(200).json(await getNewsCanadaEditorsPicksResponse(req));
});

app.get(["/api/newscanada/story", "/newscanada/story"], async (req, res) => {
  applyCors(req, res);
  const out = await getNewsCanadaStoryResponse(req);
  return res.status(out.ok ? 200 : 404).json(out);
});

function resolveMusicDataFile() {

  return cleanText(MUSIC_DATA_FILE_CANDIDATES.find((file) => {
    try { return !!(file && fs.existsSync(file)); } catch (_) { return false; }
  }) || MUSIC_DATA_FILE_CANDIDATES[0] || "");
}

function buildStaticMusicFallback() {
  return [
    { id: "music-1", rank: 1, title: "Top 10 Music Moment One", summary: "Fallback music moment while live sources are being restored.", source: "Sandblast Music", url: "", category: "Music" },
    { id: "music-2", rank: 2, title: "Top 10 Music Moment Two", summary: "Fallback music source contract keeps the music panel alive.", source: "Sandblast Music", url: "", category: "Music" },
    { id: "music-3", rank: 3, title: "Top 10 Music Moment Three", summary: "Music routing remains stable even when upstream files are unavailable.", source: "Sandblast Music", url: "", category: "Music" }
  ];
}

function normalizeMusicMoment(entry, index) {
  const raw = isObj(entry) ? entry : {};
  const title = cleanText(raw.title || raw.name || raw.headline || raw.label || "");
  if (!title) return null;
  return {
    id: cleanText(raw.id || raw.slug || `music-${index || 0}`) || `music-${index || 0}`,
    rank: clamp(Number(raw.rank || index + 1 || 1), 1, 999),
    title,
    summary: cleanText(raw.summary || raw.description || raw.excerpt || raw.body || "") || title,
    source: cleanText(raw.source || raw.provider || raw.outlet || "Sandblast Music") || "Sandblast Music",
    url: cleanText(raw.url || raw.href || raw.link || ""),
    category: cleanText(raw.category || raw.section || "Music") || "Music",
    image: cleanText(raw.image || raw.thumbnail || "") || "",
    publishedAt: cleanText(raw.publishedAt || raw.date || "") || ""
  };
}

function promoteMusicData(items, source, extraMeta) {
  const list = (Array.isArray(items) ? items : []).map(normalizeMusicMoment).filter(Boolean).slice(0, MUSIC_TOP_MOMENTS_LIMIT);
  const metaPatch = isObj(extraMeta) ? extraMeta : {};
  app.locals.musicTopMoments = list.length ? list : buildStaticMusicFallback();
  app.locals.musicSources = uniq(app.locals.musicTopMoments.map((item) => cleanText(item.source)).filter(Boolean));
  app.locals.musicMeta = {
    ...(isObj(app.locals.musicMeta) ? app.locals.musicMeta : {}),
    ...metaPatch,
    ok: app.locals.musicTopMoments.length > 0,
    file: cleanText(metaPatch.file || app.locals.musicMeta?.file || resolveMusicDataFile() || "") || "",
    count: app.locals.musicTopMoments.length,
    loadedAt: now(),
    source: cleanText(source || metaPatch.source || "music_runtime") || "music_runtime",
    degraded: !!metaPatch.degraded
  };
  return app.locals.musicTopMoments;
}

function loadMusicFromDisk(forceReload) {
  const shouldReload = !!forceReload || !Array.isArray(app.locals.musicTopMoments) || !app.locals.musicTopMoments.length;
  if (!shouldReload && Array.isArray(app.locals.musicTopMoments) && app.locals.musicTopMoments.length) return app.locals.musicTopMoments;
  const file = resolveMusicDataFile();
  if (!file) return promoteMusicData(buildStaticMusicFallback(), "music_fallback", { degraded: true, file: "" });
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    const list = Array.isArray(parsed) ? parsed : Array.isArray(parsed.items) ? parsed.items : Array.isArray(parsed.moments) ? parsed.moments : Array.isArray(parsed.topMoments) ? parsed.topMoments : [];
    return promoteMusicData(list, "music_disk_feed", { degraded: !list.length, file });
  } catch (err) {
    console.log("[Sandblast][music:load:error]", cleanText(err && (err.message || err) || "music_load_failed"));
    return promoteMusicData(buildStaticMusicFallback(), "music_fallback", { degraded: true, file, error: cleanText(err && (err.message || err) || "music_load_failed") || "music_load_failed" });
  }
}

function buildMusicResponse(req) {
  const forceReload = !!(req && req.query && req.query.refresh === "1");
  const items = loadMusicFromDisk(forceReload);
  return {
    ok: Array.isArray(items) && items.length > 0,
    route: "/api/music/top-moments",
    count: Array.isArray(items) ? items.length : 0,
    items: Array.isArray(items) ? items : [],
    sources: Array.isArray(app.locals.musicSources) ? app.locals.musicSources : [],
    meta: {
      v: INDEX_VERSION,
      t: now(),
      file: app.locals.musicMeta?.file || resolveMusicDataFile(),
      source: app.locals.musicMeta?.source || "music_runtime",
      degraded: !!app.locals.musicMeta?.degraded,
      refreshMs: MUSIC_REFRESH_MS,
      limit: MUSIC_TOP_MOMENTS_LIMIT
    }
  };
}

app.get(["/api/music/top-moments", "/music/top-moments"], (req, res) => {
  applyCors(req, res);
  return res.status(200).json(buildMusicResponse(req));
});

app.get(["/api/music/sources", "/music/sources"], (req, res) => {
  applyCors(req, res);
  const out = buildMusicResponse(req);
  return res.status(200).json({ ok: true, sources: out.sources, count: out.sources.length, meta: out.meta });
});


function musicBridgeHandlerFromModule(mod) {
  if (!mod) return null;
  if (typeof mod.handleBridgeRequest === "function") return mod.handleBridgeRequest.bind(mod);
  if (typeof mod.handleChat === "function") {
    return async function bridgeFromHandleChat(body) {
      const src = isObj(body) ? body : {};
      const out = await Promise.resolve(mod.handleChat({
        text: cleanText(src.text || ""),
        session: isObj(src.session) ? src.session : {},
        visitorId: cleanText(src.visitorId || ""),
        debug: !!src.debug,
        year: cleanText(src.year || ""),
        mode: cleanText(src.mode || ""),
        action: cleanText(src.action || ""),
        payload: isObj(src.payload) ? src.payload : {}
      }));
      return isObj(out) ? out : { ok: false, error: "music_bridge_invalid_response" };
    };
  }
  return null;
}

function musicResolverHandlerFromModule(mod) {
  if (!mod) return null;
  if (typeof mod.resolveMusicIntent === "function") return mod.resolveMusicIntent.bind(mod);
  if (typeof mod.resolve === "function") return mod.resolve.bind(mod);
  return null;
}

function musicKnowledgeCapabilitiesFromModule(mod) {
  if (!mod) return null;
  try {
    if (typeof mod.getCapabilities === "function") {
      const out = mod.getCapabilities();
      return isObj(out) ? out : null;
    }
  } catch (_) {}
  return null;
}

function normalizeMusicBridgeInput(req) {
  const norm = normalizePayload(req);
  const body = isObj(req.body) ? req.body : {};
  const query = isObj(req.query) ? req.query : {};
  const payload = isObj(body.payload) ? body.payload : {};
  const session = isObj(body.session) ? body.session : (isObj(payload.session) ? payload.session : {});
  return {
    text: cleanText(body.text || query.text || payload.text || norm.text || ""),
    session,
    visitorId: cleanText(body.visitorId || payload.visitorId || getSessionId(req)),
    debug: body.debug === true || payload.debug === true || String((req.query && req.query.debug) || "") === "1",
    traceId: norm.traceId,
    lane: "music",
    route: cleanText(body.route || query.route || payload.route || "music"),
    action: cleanText(body.action || query.action || payload.action || ""),
    year: cleanText(body.year || query.year || payload.year || norm.year || ""),
    mode: cleanText(body.mode || query.mode || payload.mode || norm.mode || ""),
    chart: cleanText(body.chart || query.chart || payload.chart || ""),
    payload
  };
}

function normalizeMusicFollowUps(rawFollowUps) {
  const followUps = Array.isArray(rawFollowUps) ? rawFollowUps : [];
  const followUpObjects = followUps.map((it, idx) => {
    if (typeof it === "string") {
      return {
        id: `fu_${idx + 1}`,
        type: "action",
        label: it,
        send: it,
        payload: { action: it, lane: "music", route: "music" }
      };
    }
    const label = cleanText(it && (it.label || it.send || it.text) || "");
    return {
      id: cleanText(it && it.id || `fu_${idx + 1}`) || `fu_${idx + 1}`,
      type: cleanText(it && it.type || "action") || "action",
      label,
      send: cleanText(it && (it.send || label) || label) || label,
      payload: isObj(it && it.payload) ? it.payload : {
        action: cleanText(it && (it.send || label) || label) || label,
        lane: "music",
        route: "music"
      }
    };
  }).filter((it) => cleanText(it.label));
  return {
    followUps,
    followUpObjects,
    followUpsStrings: followUpObjects.map((it) => cleanText(it.send || it.label)).filter(Boolean)
  };
}

function buildMusicBridgeFailure(input, opts) {
  const o = isObj(opts) ? opts : {};
  const sessionPatch = isObj(o.sessionPatch) ? o.sessionPatch : {};
  const year = cleanText(o.year || input.year || sessionPatch.lastMusicYear || sessionPatch.year || "") || null;
  const mode = cleanText(o.mode || input.mode || input.action || sessionPatch.activeMusicMode || sessionPatch.mode || "") || null;
  const reason = cleanText(o.reason || "music_bridge_invalid_contract") || "music_bridge_invalid_contract";
  const status = cleanText(o.status || "blocked") || "blocked";
  const executable = !!o.executable;
  const needsYear = !!o.needsYear;
  const follow = normalizeMusicFollowUps(o.followUps || []);
  return {
    ok: false,
    reply: cleanReplyForUser(o.reply || "I could not retrieve verified music data for that request."),
    text: cleanReplyForUser(o.reply || "I could not retrieve verified music data for that request."),
    status,
    executable,
    needsYear,
    followUps: follow.followUps,
    followUpsStrings: follow.followUpsStrings,
    followUpObjects: follow.followUpObjects,
    sessionPatch,
    bridge: {
      ready: status === "execute",
      valid: status === "execute" || status === "clarify",
      lane: "music",
      year,
      mode,
      endpoint: "/api/music/bridge",
      capabilityMode: cleanText(o.capabilityMode || "none") || "none",
      sourceTruth: cleanText(o.sourceTruth || "unknown") || "unknown",
      routeSource: cleanText(o.routeSource || "unknown") || "unknown",
      executable,
      reason
    }
  };
}

function normalizeMusicBridgeResponse(result, req, startedAt, input) {
  const raw = isObj(result) ? result : {};
  const text = cleanText(raw.reply || raw.text || raw.message || "");
  const sessionPatch = isObj(raw.sessionPatch) ? raw.sessionPatch : {};
  const status = cleanText(raw.status || (raw.bridge && raw.bridge.ready === true ? "execute" : "")) || "blocked";
  const executable = raw.executable === true || (status === "execute" && raw.ok !== false);
  const needsYear = raw.needsYear === true;
  const follow = normalizeMusicFollowUps(raw.followUpObjects || raw.followUps || raw.followUpsStrings || []);
  const bridge = isObj(raw.bridge) ? {
    ready: raw.bridge.ready === true,
    valid: raw.bridge.valid === true,
    lane: cleanText(raw.bridge.lane || "music") || "music",
    year: raw.bridge.year != null ? raw.bridge.year : (sessionPatch.lastMusicYear || sessionPatch.year || input.year || null),
    mode: cleanText(raw.bridge.mode || sessionPatch.activeMusicMode || sessionPatch.mode || input.mode || input.action || "") || null,
    endpoint: "/api/music/bridge",
    capabilityMode: cleanText(raw.bridge.capabilityMode || "none") || "none",
    sourceTruth: cleanText(raw.bridge.sourceTruth || "unknown") || "unknown",
    routeSource: cleanText(raw.bridge.routeSource || "unknown") || "unknown",
    executable: raw.bridge.executable === true || executable,
    reason: cleanText(raw.bridge.reason || "")
  } : {
    ready: status === "execute",
    valid: status === "execute" || status === "clarify",
    lane: "music",
    year: sessionPatch.lastMusicYear || sessionPatch.year || input.year || null,
    mode: cleanText(sessionPatch.activeMusicMode || sessionPatch.mode || input.mode || input.action || "") || null,
    endpoint: "/api/music/bridge",
    capabilityMode: cleanText(raw.capabilityMode || "none") || "none",
    sourceTruth: cleanText(raw.sourceTruth || "unknown") || "unknown",
    routeSource: cleanText(raw.routeSource || "unknown") || "unknown",
    executable,
    reason: cleanText(raw.reason || "")
  };

  const strictExecute = !!(bridge.valid === true && bridge.ready === true && status === "execute" && executable === true && text);
  if (!strictExecute) {
    const failed = buildMusicBridgeFailure(input, {
      reply: raw.reply || raw.text || raw.message || "I could not retrieve verified music data for that request.",
      status: needsYear ? "clarify" : status,
      executable,
      needsYear,
      followUps: follow.followUps,
      sessionPatch,
      year: bridge.year,
      mode: bridge.mode,
      capabilityMode: bridge.capabilityMode,
      sourceTruth: bridge.sourceTruth,
      routeSource: bridge.routeSource,
      reason: bridge.reason || (needsYear ? "missing_year" : "invalid_execute_contract")
    });
    return {
      ...failed,
      traceId: cleanText((req.headers && req.headers["x-sb-trace-id"]) || raw.traceId || makeTraceId("musicbridge")),
      meta: {
        v: INDEX_VERSION,
        t: now(),
        latencyMs: now() - Number(startedAt || now()),
        source: raw.meta && raw.meta.source ? raw.meta.source : "music_lane_bridge",
        degraded: true,
        bridgeMounted: !!musicBridgeHandlerFromModule(musicLaneMod),
        endpoint: "/api/music/bridge"
      }
    };
  }

  return {
    ok: true,
    reply: text,
    text,
    status,
    executable: true,
    needsYear: false,
    followUps: follow.followUps,
    followUpsStrings: follow.followUpsStrings,
    followUpObjects: follow.followUpObjects,
    sessionPatch,
    bridge,
    traceId: cleanText((req.headers && req.headers["x-sb-trace-id"]) || raw.traceId || makeTraceId("musicbridge")),
    meta: {
      v: INDEX_VERSION,
      t: now(),
      latencyMs: now() - Number(startedAt || now()),
      source: raw.meta && raw.meta.source ? raw.meta.source : "music_lane_bridge",
      degraded: !!raw.degraded,
      bridgeMounted: !!musicBridgeHandlerFromModule(musicLaneMod),
      endpoint: "/api/music/bridge"
    }
  };
}

async function dispatchMusicBridge(req, res) {
  const handler = musicBridgeHandlerFromModule(musicLaneMod);
  const resolver = musicResolverHandlerFromModule(musicResolverMod);
  const capabilities = musicKnowledgeCapabilitiesFromModule(musicKnowledgeMod);
  if (!handler && !resolver) {
    return res.status(503).json({
      ok: false,
      error: "music_bridge_unavailable",
      traceId: cleanText(req.headers["x-sb-trace-id"] || makeTraceId("musicbridge")),
      meta: { v: INDEX_VERSION, t: now(), endpoint: "/api/music/bridge", mounted: false }
    });
  }

  const startedAt = now();
  const input = normalizeMusicBridgeInput(req);
  try {
    let resolverOut = null;
    if (resolver) {
      resolverOut = await callWithTimeout(Promise.resolve(resolver({
        text: input.text,
        action: input.action,
        payload: isObj(input.payload) ? input.payload : {},
        session: isObj(input.session) ? input.session : {},
        year: input.year ? Number(input.year) : null,
        capabilities,
        route: input.route,
        lane: "music"
      })), CFG.requestTimeoutMs, "music_resolver");
    }

    if (isObj(resolverOut)) {
      const normalizedResolver = normalizeMusicBridgeResponse(resolverOut, req, startedAt, input);
      if (cleanText(normalizedResolver.status) === "clarify" || cleanText(normalizedResolver.status) === "blocked") {
        return res.status(200).json(normalizedResolver);
      }
      if (!(normalizedResolver.bridge && normalizedResolver.bridge.ready === true && normalizedResolver.bridge.valid === true && normalizedResolver.status === "execute")) {
        return res.status(200).json(buildMusicBridgeFailure(input, {
          reply: "Music route was resolved, but no valid execute contract was produced.",
          status: "blocked",
          executable: false,
          needsYear: false,
          followUps: normalizedResolver.followUpObjects,
          sessionPatch: normalizedResolver.sessionPatch,
          year: normalizedResolver.bridge && normalizedResolver.bridge.year,
          mode: normalizedResolver.bridge && normalizedResolver.bridge.mode,
          capabilityMode: normalizedResolver.bridge && normalizedResolver.bridge.capabilityMode,
          sourceTruth: normalizedResolver.bridge && normalizedResolver.bridge.sourceTruth,
          routeSource: normalizedResolver.bridge && normalizedResolver.bridge.routeSource,
          reason: "resolver_missing_execute_contract"
        }));
      }
      input.action = cleanText(resolverOut.action || input.action || "");
      input.year = cleanText(resolverOut.year || input.year || "");
      input.mode = cleanText((resolverOut.bridge && resolverOut.bridge.mode) || resolverOut.action || input.mode || "");
      input.session = {
        ...(isObj(input.session) ? input.session : {}),
        ...(isObj(resolverOut.sessionPatch) ? resolverOut.sessionPatch : {})
      };
    }

    if (!handler) {
      return res.status(200).json(buildMusicBridgeFailure(input, {
        reply: "Music resolver is present, but no execution handler is mounted.",
        status: "blocked",
        executable: false,
        needsYear: false,
        sessionPatch: isObj(resolverOut && resolverOut.sessionPatch) ? resolverOut.sessionPatch : {},
        year: resolverOut && resolverOut.year,
        mode: resolverOut && resolverOut.action,
        sourceTruth: resolverOut && resolverOut.bridge && resolverOut.bridge.sourceTruth,
        routeSource: resolverOut && resolverOut.bridge && resolverOut.bridge.routeSource,
        capabilityMode: resolverOut && resolverOut.bridge && resolverOut.bridge.capabilityMode,
        reason: "execution_handler_missing"
      }));
    }

    const result = await callWithTimeout(Promise.resolve(handler({
      ...input,
      resolver: isObj(resolverOut) ? resolverOut : null,
      capabilities
    })), CFG.requestTimeoutMs, "music_bridge");
    const out = normalizeMusicBridgeResponse(result, req, startedAt, input);
    return res.status(out.ok ? 200 : 200).json(out);
  } catch (err) {
    console.log("[Sandblast][musicBridge:error]", err && (err.stack || err.message || err));
    const fail = buildMusicBridgeFailure(normalizeMusicBridgeInput(req), {
      reply: "I could not retrieve verified music data for that request.",
      status: "blocked",
      executable: false,
      needsYear: false,
      reason: cleanText(err && (err.message || err) || "music_bridge_failed")
    });
    return res.status(200).json({
      ...fail,
      traceId: cleanText(req.headers["x-sb-trace-id"] || makeTraceId("musicbridge")),
      meta: { v: INDEX_VERSION, t: now(), endpoint: "/api/music/bridge", mounted: true }
    });
  }
}

app.get(["/api/music/bridge/health", "/music/bridge/health", "/api/music/bridge/health/", "/music/bridge/health/"], enforceMusicBridgeAccess, (req, res) => {
  applyCors(req, res);
  const caps = musicKnowledgeCapabilitiesFromModule(musicKnowledgeMod);
  return res.status(200).json({
    ok: !!musicBridgeHandlerFromModule(musicLaneMod),
    enabled: !!musicBridgeHandlerFromModule(musicLaneMod),
    endpoint: routeUrl("/api/music/bridge"),
    moduleBound: !!musicLaneMod,
    resolverBound: !!musicResolverHandlerFromModule(musicResolverMod),
    knowledgeBound: !!musicKnowledgeMod,
    capabilities: caps || null,
    version: INDEX_VERSION,
    meta: { v: INDEX_VERSION, t: now() }
  });
});

app.all(["/api/music/bridge", "/music/bridge", "/api/music/bridge/", "/music/bridge/"], enforceMusicBridgeAccess, async (req, res) => {
  applyCors(req, res);
  return dispatchMusicBridge(req, res);
});

app.get("/health", (req, res) => {
  applyCors(req, res);
  const ttsHealth = ttsHealthFromModule(ttsMod);
  let tts = null;
  try { tts = ttsHealth ? ttsHealth() : null; } catch (_) {}
  return res.status(200).json({
    ok: true,
    version: INDEX_VERSION,
    upMs: now() - SERVER_BOOT_AT,
    bootAt: SERVER_BOOT_AT,
    modules: {
      chatEngine: !!chatEngineMod,
      marionBridge: !!marionBridgeMod,
      supportResponse: !!supportResponseMod,
      affectEngine: !!affectEngineMod,
      voiceRoute: !!voiceRouteMod,
      tts: !!ttsMod
    },
    runtimeDeps: {
      express: moduleAvailable("express"),
      compression: moduleAvailable("compression"),
      dotenv: moduleAvailable("dotenv")
    },
    bindings: {
      voiceRouteHandler: !!voiceRouteHandlerFromModule(voiceRouteMod),
      voiceRouteHealth: !!voiceHealthFromModule(voiceRouteMod),
      ttsHandler: !!ttsHandlerFromModule(ttsMod),
      ttsHealth: !!ttsHealthFromModule(ttsMod)
    },
    voiceRouteEnabled: !!CFG.voiceRouteEnabled,
    preserveMixerVoice: !!CFG.preserveMixerVoice,
    tts
  });
});

app.get("/api/health", (req, res) => {
  applyCors(req, res);
  const ttsHealth = ttsHealthFromModule(ttsMod);
  let tts = null;
  try { tts = ttsHealth ? ttsHealth() : null; } catch (_) {}
  return res.status(200).json({
    ok: true,
    version: INDEX_VERSION,
    traceId: cleanText(req.sbTraceId || req.headers["x-sb-trace-id"] || makeTraceId("health")),
    upMs: now() - SERVER_BOOT_AT,
    tts,
    voiceRouteEnabled: !!CFG.voiceRouteEnabled,
    requireVoiceRouteToken: !!CFG.requireVoiceRouteToken,
    backendPublicBase: getBackendPublicBase(),
    audioContract: {
      version: "audio-first-v1",
      endpoint: routeUrl("/api/tts"),
      healthEndpoint: routeUrl("/api/tts/health"),
      deterministicAudio: true
    },
    newsCanada: newsCanadaFeedService && typeof newsCanadaFeedService.health === "function"
      ? newsCanadaFeedService.health()
      : {
          ok: false,
          source: "service_unavailable",
          degraded: true,
          mode: "rss",
          feedUrl: cleanText(process.env.NEWS_CANADA_RSS_FEED_URL || process.env.SB_NEWSCANADA_RSS_FEED_URL || ""),
          stableRoutes: {
            rss: "/api/newscanada/rss",
            manualCompat: "/api/newscanada/manual",
            editorsPicks: "/api/newscanada/editors-picks",
            editorsPicksMeta: "/api/newscanada/editors-picks/meta",
            story: "/api/newscanada/story"
          }
        },
    memory: {
      sessionsTracked: memory.lastBySession.size,
      supportLocks: memory.supportBySession.size,
      transportEntries: memory.transportBySession.size,
      ttlMs: CFG.memoryTtlMs
    },
    music: {
      file: app.locals.musicMeta?.file || resolveMusicDataFile(),
      availableMoments: Array.isArray(app.locals.musicTopMoments) ? app.locals.musicTopMoments.length : 0,
      loadedAt: app.locals.musicMeta?.loadedAt || 0,
      source: app.locals.musicMeta?.source || "music_runtime",
      degraded: !!app.locals.musicMeta?.degraded,
      stableRoutes: {
        topMoments: "/api/music/top-moments",
        sources: "/api/music/sources",
        bridge: "/api/music/bridge",
        bridgeHealth: "/api/music/bridge/health"
      },
      bridge: {
        enabled: !!musicBridgeHandlerFromModule(musicLaneMod),
        endpoint: routeUrl("/api/music/bridge"),
        healthEndpoint: routeUrl("/api/music/bridge/health")
      }
    }
  });
});

app.get("/api/tts/health", enforceVoiceRouteAccess, async (req, res) => {
  applyCors(req, res);
  const handler = ttsHealthFromModule(ttsMod);
  if (!handler) {
    return res.status(200).json({
      ok: false,
      enabled: false,
      error: "tts_health_unavailable",
      traceId: cleanText(req.headers["x-sb-trace-id"] || makeTraceId("ttshealth")),
      meta: { v: INDEX_VERSION, t: now() }
    });
  }
  try {
    const health = await Promise.resolve(handler());
    return res.status(200).json({
      ok: !!(health && health.ok !== false),
      enabled: true,
      health,
      traceId: cleanText(req.headers["x-sb-trace-id"] || makeTraceId("ttshealth")),
      meta: { v: INDEX_VERSION, t: now() }
    });
  } catch (err) {
    return res.status(503).json({
      ok: false,
      enabled: true,
      error: "tts_health_failed",
      detail: cleanText(err && (err.message || err) || "tts health failed"),
      traceId: cleanText(req.headers["x-sb-trace-id"] || makeTraceId("ttshealth")),
      meta: { v: INDEX_VERSION, t: now() }
    });
  }
});

app.post(["/api/tts", "/tts"], enforceVoiceRouteAccess, async (req, res) => {
  applyCors(req, res);
  try {
    return await dispatchTts(req, res);
  } catch (err) {
    console.log("[Sandblast][ttsRoute:error]", err && (err.stack || err.message || err));
    if (res.headersSent) return;
    return sendTtsJsonError(req, res, 503, "tts_route_failure", cleanText(err && (err.message || err) || "tts route failed"), {
      configSource: ttsHandlerFromModule(ttsMod) ? "tts_module" : "unavailable",
      ttsModuleBound: !!ttsHandlerFromModule(ttsMod)
    });
  }
});

app.post("/api/chat", enforceToken, async (req, res) => {
  applyCors(req, res);
  const startedAt = now();
  const norm = normalizePayload(req);
  const sessionId = getSessionId(req);
  const priorSupport = getSupportState(sessionId);
  const priorTurn = getLastTurn(sessionId);
  let supportHold = clamp(Number(priorSupport.hold || 0), 0, CFG.quietSupportHoldTurns);
  let supportActive = !!priorSupport.active && supportHold > 0;
  if (supportHold > 0) supportHold -= 1;
  let failSafe = false;

  const emotion = inferEmotion(norm.text, {
    lane: norm.lane,
    mode: norm.mode,
    sessionId,
    traceId: norm.traceId
  });

  const transportKey = buildTransportKey(norm, norm.text, req);
  const transportState = getTransportState(sessionId);
  if (transportKey && transportState.key === transportKey && (startedAt - Number(transportState.at || 0) < CFG.loopSuppressionWindowMs)) {
    setTransportState(sessionId, { key: transportKey, count: Number(transportState.count || 0) + 1 });
    return res.status(200).json({
      ok: true,
      reply: normalizeSupportReply("I am here with you. We can take this one step at a time."),
      payload: { reply: normalizeSupportReply("I am here with you. We can take this one step at a time.") },
      lane: norm.lane || "general",
      laneId: norm.lane || "general",
      sessionLane: norm.lane || "general",
      bridge: null,
      ctx: {},
      ui: buildQuietUiPatch("loop", true).ui,
      directives: [],
      followUps: [],
      followUpsStrings: [],
      sessionPatch: buildSupportSessionPatch({}, true, false),
      cog: { intent: "STABILIZE", mode: "transitional", publicMode: true },
      requestId: makeTraceId("req"),
      traceId: norm.traceId,
      meta: {
        v: INDEX_VERSION,
        t: now(),
        transportDuplicateSuppressed: true,
        supportHold: Math.max(supportHold, 1),
        latencyMs: now() - startedAt
      },
      voiceRoute: normalizeVoiceRouteResponse(attachVoiceRoute({ reply: norm.text || "" }).voiceRoute)
    });
  }
  setTransportState(sessionId, { key: transportKey, count: 1 });

  const marionInput = {
    text: norm.text,
    lane: norm.lane,
    year: norm.year,
    mode: norm.mode,
    traceId: norm.traceId,
    sessionId,
    turnId: norm.turnId,
    payload: norm.payload,
    emotion,
    guidedPrompt: norm.guidedPrompt,
    domainHint: norm.domainHint,
    intentHint: norm.intentHint,
    emotionalHint: norm.emotionalHint
  };

  let marion = null;
  try {
    marion = await callWithTimeout(callMarionBridge(marionInput), CFG.requestTimeoutMs, "marion_bridge");
  } catch (err) {
    console.log("[Sandblast][marionBridge:timeout]", err && (err.stack || err.message || err));
    marion = null;
  }

  const marionContract = normalizeMarionContract(marion, norm, emotion, priorTurn);
  const marionContractCheck = validateMarionContract(marionContract);
  const trace = buildLoggingSpine({
    traceId: norm.traceId,
    sessionId,
    startedAt,
    request: {
      text: clipText(norm.text, 220),
      lane: norm.lane,
      mode: norm.mode,
      year: norm.year,
      turnId: norm.turnId
    },
    marion_raw: marion,
    marion_contract: marionContract,
    errors: marionContractCheck.ok ? [] : marionContractCheck.errors.slice()
  });

  const engineInput = {
    text: norm.text,
    payload: norm.payload,
    body: norm.body,
    lane: norm.lane,
    year: norm.year,
    mode: norm.mode,
    turnId: norm.turnId,
    traceId: norm.traceId,
    sessionId,
    client: norm.client,
    marion,
    marionContract,
    emotion,
    previousTurn: priorTurn,
    continuity: marionContract && marionContract.continuity || buildMarionContinuity(priorTurn, norm, emotion),
    forceDirect: shouldForceMarionReply(marionContract, norm),
    overrideReply: shouldForceMarionReply(marionContract, norm) ? cleanText(marionContract && marionContract.response || "") : "",
    forcedIntent: cleanText(marionContract && marionContract.intent || norm.intentHint || ""),
    forcedEmotion: cleanText(marionContract && marionContract.emotional_state || norm.emotionalHint || ""),
    guidedPrompt: norm.guidedPrompt,
    domainHint: norm.domainHint,
    intentHint: norm.intentHint,
    emotionalHint: norm.emotionalHint,
    knowledge: knowledgeRuntime.extract(norm.text, { marion, guidedPrompt: norm.guidedPrompt })
  };

  trace.engine_input = {
    forceDirect: !!engineInput.forceDirect,
    forcedIntent: cleanText(engineInput.forcedIntent || ""),
    forcedEmotion: cleanText(engineInput.forcedEmotion || ""),
    overrideReplyPresent: !!cleanText(engineInput.overrideReply || "")
  };

  let engineRaw = null;
  let engineError = null;
  try {
    engineRaw = await callWithTimeout(callChatEngine(engineInput), CFG.requestTimeoutMs, "chat_engine");
    if (engineRaw && engineRaw.__engineError) {
      engineError = engineRaw.__engineError;
      engineRaw = null;
    }
  } catch (err) {
    engineError = err;
  }

  let shaped = repairEngineContract(shapeEngineReply(engineRaw), marion, norm);
  shaped = enforceMarionContract(shaped, marionContract, norm);
  shaped = applyContinuityStitch(shaped, priorTurn, marionContract, norm, emotion);
  trace.normalized = {
    marionContractOk: marionContractCheck.ok,
    marionForceDirect: !!engineInput.forceDirect,
    replyAuthority: cleanText(shaped.meta && shaped.meta.replyAuthority || ""),
    lane: cleanText(shaped.lane || norm.lane || "general")
  };
  if (!shaped.lane) shaped.lane = norm.lane || "general";
  if (!shaped.laneId) shaped.laneId = shaped.lane;
  if (!shaped.sessionLane) shaped.sessionLane = shaped.lane;
  if (!shaped.bridge && marion) shaped.bridge = marion;
  shaped = applyAffectBridge(shaped, buildAffectInputFromMarion(marion));

  const supportTriggered = shouldEnterSupportHold(norm.text, emotion, shaped.cog || shaped.meta || {});
  if (supportTriggered) {
    supportActive = true;
    supportHold = Math.max(supportHold, CFG.quietSupportHoldTurns);

    const quietPatch = buildQuietUiPatch("support", true);
    shaped = {
      ...shaped,
      ok: true,
      ui: {
        ...(isObj(shaped.ui) ? shaped.ui : {}),
        ...quietPatch.ui
      },
      sessionPatch: {
        ...(isObj(shaped.sessionPatch) ? shaped.sessionPatch : {}),
        ...(isObj(quietPatch.sessionPatch) ? quietPatch.sessionPatch : {})
      },
      meta: mergeMeta(shaped.meta, {
        supportOverride: false,
        supportTriggeredByEmotion: true,
        clearStaleUi: true,
        suppressMenus: true,
        supportHold: true,
        supportUiOnly: true
      })
    };

    console.log("[Sandblast][supportHold]", {
      traceId: norm.traceId,
      sessionId,
      text: norm.text,
      emotion,
      supportTriggered,
      marionReplyPresent: !!getMarionAuthorityReply(marion)
    });
  }

  if (engineError) {
    failSafe = true;
    if (shouldLockMarionAuthority(marion)) {
      shaped = repairEngineContract(shapeEngineReply({
        ok: true,
        reply: getMarionAuthorityReply(marion),
        payload: { reply: getMarionAuthorityReply(marion) },
        lane: norm.lane || "general",
        laneId: norm.lane || "general",
        sessionLane: norm.lane || "general",
        bridge: marion || null,
        ctx: {},
        ui: {},
        directives: Array.isArray(marion.followUps) ? [] : [],
        followUps: Array.isArray(marion.followUps) ? marion.followUps : [],
        followUpsStrings: Array.isArray(marion.followUpsStrings) ? marion.followUpsStrings : [],
        sessionPatch: {},
        cog: { intent: "MARION", mode: "authoritative", publicMode: true },
        meta: {
          v: INDEX_VERSION,
          t: now(),
          engineVersion: "chatEngine failure contained; marion authority preserved",
          knowledge: knowledgeRuntime.extract(norm.text, { marion }),
          clearStaleUi: true,
          suppressMenus: true,
          failSafe: true,
          marionAvailable: true,
          replyAuthority: "marion_locked",
          error: cleanText(engineError && engineError.message || engineError || "engine failure")
        },
        speech: null
      }), marion, norm);
    } else {
      const supportReply = buildSafeSupportReply(norm.text, emotion, {
        traceId: norm.traceId,
        sessionId,
        source: "engine_error"
      });

      shaped = {
        ok: false,
        reply: supportReply,
        payload: { reply: supportReply },
        lane: norm.lane || "general",
        laneId: norm.lane || "general",
        sessionLane: norm.lane || "general",
        bridge: marion || null,
        ctx: {},
        ui: {},
        directives: [],
        followUps: [],
        followUpsStrings: [],
        sessionPatch: {},
        cog: { intent: "STABILIZE", mode: "transitional", publicMode: true },
        meta: {
          v: INDEX_VERSION,
          t: now(),
          engineVersion: "chatEngine failure contained",
          knowledge: knowledgeRuntime.extract(norm.text, { marion }),
          clearStaleUi: true,
          suppressMenus: true,
          failSafe: true,
          marionAvailable: !!marion,
          error: cleanText(engineError && engineError.message || engineError || "engine failure")
        },
        speech: null
      };
    }
  }

  shaped = enforceMarionAuthority(shaped, marion, { lane: norm.lane || "general" });
  shaped = enforceMarionContract(shaped, marionContract, norm);
  shaped = applyContinuityStitch(shaped, priorTurn, marionContract, norm, emotion);
  let reply = cleanText(shaped.reply || shaped.payload?.reply || "");
  if (!reply) {
    if (shouldLockMarionAuthority(marion)) {
      reply = getMarionAuthorityReply(marion);
      shaped.reply = reply;
      shaped.payload = { ...(isObj(shaped.payload) ? shaped.payload : {}), reply, text: reply, message: reply, spokenText: reply };
      shaped = enforceMarionAuthority(shaped, marion, { lane: norm.lane || "general" });
    } else {
      reply = normalizeSupportReply(buildSafeSupportReply(norm.text, emotion, {
        traceId: norm.traceId,
        sessionId,
        source: "empty_reply"
      }) || "I am here with you. Talk to me.");
      shaped.reply = reply;
      shaped.payload = { ...(isObj(shaped.payload) ? shaped.payload : {}), reply };
      supportActive = true;
      supportHold = Math.max(supportHold, CFG.quietSupportHoldTurns);
    }
  }

  reply = cleanReplyForUser(reply);
  shaped.reply = reply;
  shaped.payload = { ...(isObj(shaped.payload) ? shaped.payload : {}), reply, text: shaped.payload?.text || reply, message: shaped.payload?.message || reply };
  shaped = enforceMarionAuthority(shaped, marion, { lane: norm.lane || "general" });
  shaped = enforceMarionContract(shaped, marionContract, norm);
  shaped = applyContinuityStitch(shaped, priorTurn, marionContract, norm, emotion);
  reply = cleanText(shaped.reply || shaped.payload?.reply || reply);

  const loop = detectLoop(sessionId, reply, norm.text);
  if (loop.repeated) {
    if (shouldLockMarionAuthority(marion)) {
      shaped.meta = mergeMeta(shaped.meta, {
        duplicateReplyObserved: true,
        duplicateReplySuppressed: true,
        duplicateReplyStrategy: "transport_only"
      });
      shaped = enforceMarionAuthority(shaped, marion, { lane: norm.lane || "general" });
      reply = cleanText(shaped.reply || shaped.payload?.reply || reply);
    } else {
      failSafe = false;
      supportActive = true;
      supportHold = Math.max(supportHold, 1);
      reply = normalizeSupportReply("I am here with you. We can take this one step at a time.");
      shaped.reply = reply;
      shaped.payload = { ...(isObj(shaped.payload) ? shaped.payload : {}), reply };
      shaped.cog = {
        ...(isObj(shaped.cog) ? shaped.cog : {}),
        intent: "STABILIZE",
        mode: "transitional",
        publicMode: true
      };
      shaped.meta = mergeMeta(shaped.meta, {
        duplicateReplySuppressed: true
      });
    }
  }

  const suppressMenus = shouldSuppressMenus(shaped, supportActive || failSafe);
  if (suppressMenus) {
    supportActive = true;
    supportHold = Math.max(supportHold, 1);
  }

  setSupportState(sessionId, {
    active: supportActive,
    hold: supportHold,
    replyHash: replyHash(reply),
    lastUserHash: replyHash(norm.text)
  });

  const sessionPatch = buildSupportSessionPatch(shaped.sessionPatch, supportActive, !supportActive);
  shaped.sessionPatch = sessionPatch;

  shaped.meta = mergeMeta(shaped.meta, {
    v: INDEX_VERSION,
    t: now(),
    knowledge: shaped.meta?.knowledge || knowledgeRuntime.extract(norm.text, { marion }),
    clearStaleUi: suppressMenus,
    suppressMenus,
    failSafe: !!failSafe,
    marionBridgePresent: !!marion,
    mixerVoicePreserved: !!CFG.preserveMixerVoice,
    error: shaped.meta?.error || "",
    indexLoopGuard: true,
    supportHold,
    traceId: norm.traceId,
    latencyMs: now() - startedAt
  });

  shaped.cog = {
    ...(isObj(shaped.cog) ? shaped.cog : {}),
    intent: shaped.cog?.intent || (supportActive ? "STABILIZE" : ""),
    mode: shaped.cog?.mode || (supportActive ? "transitional" : ""),
    publicMode: shaped.cog?.publicMode !== false
  };

  console.log("[Sandblast][chatRoute:final]", {
    traceId: norm.traceId,
    sessionId,
    supportActive,
    failSafe: !!failSafe,
    supportHold,
    emotionLabel: emotion && emotion.label || "",
    emotionDistress: !!(emotion && emotion.distress),
    emotionSensitive: !!(emotion && emotion.sensitive),
    reply: shaped.reply
  });

  shaped = attachVoiceRoute(shaped);
  const speech = buildSpeechContract(shaped, norm);
  shaped.speech = speech;
  shaped.payload = {
    ...(isObj(shaped.payload) ? shaped.payload : {}),
    text: speech.text,
    textDisplay: speech.textDisplay,
    textSpeak: speech.textSpeak,
    routeKind: speech.routeKind,
    intro: speech.intro,
    source: speech.source,
    speechHints: speech.speechHints,
    speech
  };
  shaped.voiceRoute = {
    ...(isObj(shaped.voiceRoute) ? shaped.voiceRoute : {}),
    text: speech.text,
    textDisplay: speech.textDisplay,
    textSpeak: speech.textSpeak,
    routeKind: speech.routeKind,
    intro: speech.intro,
    source: speech.source,
    speechHints: speech.speechHints,
    presenceProfile: speech.presenceProfile,
    voiceStyle: speech.voiceStyle,
    nyxStateHint: speech.nyxStateHint
  };
  shaped = enforceQuietUiIfNeeded(shaped, {
    supportActive,
    failSafe,
    forceQuiet: suppressMenus
  });
  shaped = enforceMarionAuthority(shaped, marion, { lane: norm.lane || "general" });
  shaped = enforceMarionContract(shaped, marionContract, norm);
  shaped = applyContinuityStitch(shaped, priorTurn, marionContract, norm, emotion);
  reply = cleanText(shaped.reply || shaped.payload?.reply || reply);

  shaped.voiceRoute = normalizeVoiceRouteResponse(shaped.voiceRoute);
  shaped.requestId = cleanText(shaped.requestId || makeTraceId("req"));
  shaped.traceId = cleanText(shaped.traceId || norm.traceId);

  trace.stitched = {
    continuity: isObj(shaped.payload && shaped.payload.continuity) ? shaped.payload.continuity : null,
    followUpsStrings: Array.isArray(shaped.followUpsStrings) ? shaped.followUpsStrings.slice(0, 4) : []
  };

  setLastTurn(sessionId, {
    replyHash: replyHash(cleanText(shaped.reply || reply)),
    userHash: replyHash(norm.text),
    lane: shaped.lane || norm.lane,
    replyAuthority: cleanText(shaped.meta && shaped.meta.replyAuthority || ""),
    userText: norm.text,
    reply: cleanText(shaped.reply || reply),
    emotionLabel: cleanText((marionContract && marionContract.emotional_state) || (emotion && emotion.label) || ""),
    continuity: isObj(shaped.payload && shaped.payload.continuity) ? shaped.payload.continuity : {}
  });

  shaped = enforceMarionAuthority(shaped, marion, { lane: norm.lane || "general" });
  shaped = enforceMarionContract(shaped, marionContract, norm);
  shaped.payload = {
    ...(isObj(shaped.payload) ? shaped.payload : {}),
    reply: cleanText(shaped.reply || shaped.payload?.reply || ""),
    text: cleanText(shaped.reply || shaped.payload?.text || shaped.payload?.reply || ""),
    message: cleanText(shaped.reply || shaped.payload?.message || shaped.payload?.reply || ""),
    spokenText: cleanText(shaped.reply || shaped.payload?.spokenText || shaped.payload?.reply || "")
  };

  trace.rendered = {
    ok: shaped.ok !== false,
    replyAuthority: cleanText(shaped.meta && shaped.meta.replyAuthority || ""),
    marionContractOk: !!(shaped.meta && shaped.meta.marionContractOk),
    latencyMs: now() - startedAt
  };

  console.log("[Sandblast][loggingSpine]", trace);

  return res.status(200).json({
    ok: shaped.ok !== false,
    reply: shaped.reply,
    payload: shaped.payload,
    lane: shaped.lane || norm.lane || "general",
    laneId: shaped.laneId || shaped.lane || norm.lane || "general",
    sessionLane: shaped.sessionLane || shaped.lane || norm.lane || "general",
    bridge: shaped.bridge || marion || null,
    ctx: shaped.ctx || {},
    ui: shaped.ui || {},
    directives: Array.isArray(shaped.directives) ? shaped.directives : [],
    followUps: Array.isArray(shaped.followUps) ? shaped.followUps : [],
    followUpsStrings: Array.isArray(shaped.followUpsStrings) ? shaped.followUpsStrings : [],
    emotionalTurn: shaped.emotionalTurn || undefined,
    sessionPatch: shaped.sessionPatch || {},
    cog: shaped.cog || {},
    requestId: shaped.requestId,
    traceId: shaped.traceId,
    meta: {
      ...(shaped.meta || {}),
      marionContract: marionContract,
      loggingSpine: {
        traceId: trace.traceId,
        sessionId: trace.sessionId,
        request: trace.request,
        normalized: trace.normalized,
        stitched: trace.stitched,
        rendered: trace.rendered,
        errors: trace.errors
      },
      audioContract: {
        version: "audio-first-v1",
        endpoint: routeUrl("/api/tts"),
        healthEndpoint: routeUrl("/api/tts/health"),
        deterministicAudio: true,
        failOpenChat: true
      }
    },
    speech,
    audio: shaped.audio || undefined,
    ttsProfile: shaped.ttsProfile || undefined,
    voiceRoute: shaped.voiceRoute || undefined
  });
});

console.log("[Sandblast][newsCanada] rss_service_ready", {
  api: "/api/newscanada",
  direct: "/newscanada",
  source: newsCanadaFeedService ? "rss-service" : "service_unavailable",
  moduleLoaded: !!newsCanadaFeedServiceMod,
  serviceLoaded: !!newsCanadaFeedService,
  feedUrl: resolveNewsCanadaFeedUrl(),
  compatibility: {
    rss: "/api/newscanada/rss",
    manualCompat: "/api/newscanada/manual",
    editorsPicks: "/api/newscanada/editors-picks",
    story: "/api/newscanada/story",
    diagnostics: "/api/newscanada/diagnostics"
  }
});


const newsCanadaRoutes = resolveExpressRouterFromModule(newsCanadaRoutesMod);
if (newsCanadaRoutes) {
  app.use("/api/newscanada", newsCanadaRoutes);
  app.use("/newscanada", newsCanadaRoutes);
  console.log("[Sandblast][newsCanada] manual_rss_routes_mounted", {
    api: "/api/newscanada",
    direct: "/newscanada",
    router: true
  });
} else {
  console.log("[Sandblast][newsCanada] manual_rss_routes_unavailable", {
    api: "/api/newscanada",
    direct: "/newscanada",
    router: false
  });
}

app.use("/api", (req, res) => {
  applyCors(req, res);
  const requestPath = cleanText(req.originalUrl || req.path || "");
  const likelyNewsCanadaMiss = /newscanada|foryourlife|for-your-life|topstory|top-story|editorspick|editors-pick|editorspicks|editor-picks/i.test(requestPath);
  return res.status(404).json({
    ok: false,
    error: "not_found",
    path: req.path,
    meta: {
      v: INDEX_VERSION,
      t: now(),
      routeHints: likelyNewsCanadaMiss ? buildNewsCanadaRouteHints() : undefined,
      likelyNewsCanadaMiss
    }
  });
});

app.use((req, res, next) => {
  if (res.headersSent) return next();
  applyCors(req, res);
  const requestPath = cleanText(req.originalUrl || req.path || "");
  const likelyNewsCanadaMiss = /newscanada|foryourlife|for-your-life|topstory|top-story|editorspick|editors-pick|editorspicks|editor-picks/i.test(requestPath);
  return res.status(404).json({
    ok: false,
    error: "not_found",
    path: requestPath || req.path,
    meta: {
      v: INDEX_VERSION,
      t: now(),
      routeHints: likelyNewsCanadaMiss ? buildNewsCanadaRouteHints() : undefined,
      likelyNewsCanadaMiss
    }
  });
});

app.use((err, req, res, _next) => {
  applyCors(req, res);
  if (res.headersSent) return;

  const traceId = cleanText((req && (req.sbTraceId || (req.headers && req.headers["x-sb-trace-id"]))) || makeTraceId("error"));
  const isBodySyntax = !!(err && (err.type === "entity.parse.failed" || err instanceof SyntaxError));
  const isTooLarge = !!(err && err.type === "entity.too.large");
  const statusCode = isBodySyntax ? 400 : (isTooLarge ? 413 : clamp(Number((err && (err.statusCode || err.status)) || 500), 400, 599));
  const errorCode = isBodySyntax ? "invalid_json" : (isTooLarge ? "payload_too_large" : "server_error");
  const detail = isBodySyntax
    ? "Request body contains invalid JSON."
    : (isTooLarge ? "Request body exceeded the allowed size limit." : cleanText(err && (err.message || err) || "server error"));

  console.log("[Sandblast][express:error]", {
    traceId,
    statusCode,
    errorCode,
    path: req && (req.originalUrl || req.url || req.path || ""),
    detail
  });

  return res.status(statusCode).json({
    ok: false,
    error: errorCode,
    detail,
    traceId,
    meta: { v: INDEX_VERSION, t: now() }
  });
});

STATIC_PUBLIC_DIRS.forEach((dir) => {
  app.use(express.static(dir));
});

app.get("*", (req, res, next) => {
  for (const dir of STATIC_PUBLIC_DIRS) {
    const p = path.join(dir, "index.html");
    if (fs.existsSync(p)) return res.sendFile(p);
  }
  return next();
});


function resolveNewsCanadaDataFile() {
  return cleanText(process.env.NEWS_CANADA_RSS_FEED_URL || process.env.SB_NEWSCANADA_RSS_FEED_URL || "");
}

function normalizeNewsCanadaFeed(feed) {
  const src = Array.isArray(feed) ? feed : [];
  return src.map((story) => (isObj(story) ? story : {})).filter((story) => Object.keys(story).length > 0);
}

function hydrateNewsCanadaLocals(store, extraMeta) {
  return { store, extraMeta, delegated: true };
}

function getNewsCanadaCandidateDiagnostics() {
  return newsCanadaFeedService && typeof newsCanadaFeedService.health === "function"
    ? newsCanadaFeedService.health()
    : {
        ok: false,
        source: "service_unavailable",
        degraded: true,
        mode: "rss",
        feedUrl: resolveNewsCanadaDataFile()
      };
}

if (newscanadaCacheJobMod && typeof newscanadaCacheJobMod.startNewsCanadaCacheJob === "function") {
  try {
    newscanadaCacheJobMod.startNewsCanadaCacheJob({ intervalMs: clamp(Number(process.env.NEWS_CANADA_CACHE_REFRESH_MS || 10 * 60 * 1000), 60 * 1000, 60 * 60 * 1000) });
  } catch (err) {
    console.log("[Sandblast][newscanadaCacheJob:start_error]", err && (err.stack || err.message || err));
  }
}

const server = app.listen(PORT, () => {
  console.log(`[Sandblast] ${INDEX_VERSION} listening on :${PORT}`);
});

function gracefulShutdown(signal) {
  try {
    console.log(`[Sandblast][shutdown] ${signal}`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 5000).unref();
  } catch (_) {
    process.exit(0);
  }
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

module.exports = {
  app,
  server,
  INDEX_VERSION,
  loadNewsCanadaEditorsPicksFromDisk,
  resolveNewsCanadaDataFile,
  normalizeNewsCanadaFeed,
  hydrateNewsCanadaLocals,
  getNewsCanadaCandidateDiagnostics,
  resolveMusicDataFile,
  loadMusicFromDisk,
  dispatchMusicBridge,
  normalizeMusicBridgeInput,
  normalizeMusicBridgeResponse,
  shapeEngineReply,
  repairBridgeEnvelope,
  repairEngineContract,
  buildSpeechContract,
  normalizeVoiceRouteResponse,
  attachVoiceRoute,
  normalizeMarionContract,
  validateMarionContract,
  enforceMarionContract,
  applyContinuityStitch,
  buildLoggingSpine
};

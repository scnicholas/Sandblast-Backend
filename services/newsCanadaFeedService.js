"use strict";

 // newsCanadaFeedService v2.3.0sb
 // CACHE-BRIDGE + MANUAL-REFRESH-COMPAT
 // Purpose:
 // - remove live-origin authority from this service
 // - delegate News Canada delivery to the cache-first contract when available
 // - return quickly from local cache/snapshot instead of blocking on upstream timeouts

 const fs = require("fs");
 const path = require("path");

 function safeStr(v) {
   return typeof v === "string" ? v : v == null ? "" : String(v);
 }

 function cleanText(v) {
   return safeStr(v).replace(/\s+/g, " ").trim();
 }

 function isObj(v) {
   return !!v && typeof v === "object" && !Array.isArray(v);
 }

 function clipText(v, max) {
   const s = cleanText(v);
   const n = Number.isFinite(Number(max)) ? Number(max) : 240;
   if (!s) return "";
   return s.length > n ? `${s.slice(0, n).trim()}…` : s;
 }

 function tryRequireMany(paths) {
   for (const p of paths) {
     try {
       const mod = require(p);
       if (mod) return mod;
     } catch (_) {}
   }
   return null;
 }

 const CACHE_SERVICE_MOD = tryRequireMany([
   "./newscanadaCacheService",
   "./newscanadaCacheService.js",
   "../services/newscanadaCacheService",
   "../services/newscanadaCacheService.js"
 ]);

 const CACHE_JSON_CANDIDATES = [
   path.join(__dirname, "..", "data", "newscanada", "newscanada.cache.json"),
   path.join(process.cwd(), "data", "newscanada", "newscanada.cache.json"),
   path.join(process.cwd(), ".newscanada-feed-cache.json")
 ];

 const DEFAULTS = {
   source: "news_canada_cache_bridge",
   mode: "cache_first",
   maxStories: 24,
   refreshMode: "manual_refresh"
 };

 function readJsonFile(filePath) {
   try {
     if (!fs.existsSync(filePath)) return null;
     return JSON.parse(fs.readFileSync(filePath, "utf8"));
   } catch (_) {
     return null;
   }
 }


 function isSeedPayload(payload) {
   const items = Array.isArray(payload && payload.items) ? payload.items
     : (Array.isArray(payload && payload.stories) ? payload.stories : []);
   const meta = isObj(payload && payload.meta) ? payload.meta : {};
   const parserMode = cleanText(meta.parserMode || "").toLowerCase();
   const source = cleanText(meta.source || meta.servedFrom || "").toLowerCase();
   const detail = cleanText(meta.detail || "").toLowerCase();
   if (parserMode.includes("seed") || source.includes("seed") || detail.includes("manual_seed_bootstrap")) return true;
   return items.some((item) => cleanText(item && item.id).toLowerCase().includes("newscanada-seed-"));
 }

 function readCacheSnapshot() {
   for (const candidate of CACHE_JSON_CANDIDATES) {
     const parsed = readJsonFile(candidate);
     const items = Array.isArray(parsed && (parsed.items || parsed.stories)) ? (parsed.items || parsed.stories) : [];
     if (items.length) {
       return {
         ok: true,
         items,
         stories: items,
         meta: {
           source: DEFAULTS.source,
           mode: DEFAULTS.mode,
           fallback: "snapshot_file",
           snapshotPath: candidate,
           fetchedAt: Number(parsed && parsed.meta && parsed.meta.fetchedAt || parsed && parsed.writtenAt || Date.now()),
           storyCount: items.length,
           itemCount: items.length,
           degraded: true,
           stale: !!(parsed && parsed.meta && parsed.meta.stale)
         }
       };
     }
   }
   return null;
 }

 function normalizePayload(payload) {
   const src = isObj(payload) ? payload : {};
   const items = Array.isArray(src.items) ? src.items
     : (Array.isArray(src.stories) ? src.stories : []);
   return {
     ok: src.ok !== false && items.length > 0,
     items: items.slice(0, DEFAULTS.maxStories),
     stories: items.slice(0, DEFAULTS.maxStories),
     meta: {
       source: cleanText(src.meta && src.meta.source || DEFAULTS.source) || DEFAULTS.source,
       mode: cleanText(src.meta && src.meta.mode || DEFAULTS.mode) || DEFAULTS.mode,
       fetchedAt: Number(src.meta && src.meta.fetchedAt || Date.now()),
       storyCount: items.length,
       itemCount: items.length,
       degraded: !!(src.meta && src.meta.degraded),
       stale: !!(src.meta && src.meta.stale),
       servedFrom: cleanText(src.meta && src.meta.servedFrom || "cache_contract")
     }
   };
 }

 function createNewsCanadaFeedService(options = {}) {
   const logger = typeof options.logger === "function"
     ? options.logger
     : (...args) => console.log(...args);

   async function getViaCacheService(opts = {}) {
     if (!CACHE_SERVICE_MOD) return null;

     try {
       if (typeof CACHE_SERVICE_MOD.getCachedOrRefresh === "function") {
         const payload = await CACHE_SERVICE_MOD.getCachedOrRefresh({
           forceRefresh: !!opts.refresh,
           timeoutMs: Number(opts.timeoutMs || 30000)
         });
         return normalizePayload(payload);
       }

       if (typeof CACHE_SERVICE_MOD.readCache === "function") {
         const payload = CACHE_SERVICE_MOD.readCache();
         return normalizePayload(payload);
       }
     } catch (err) {
       logger("[Sandblast][newsCanada] cache_bridge_error", err && (err.stack || err.message || err));
     }

     return null;
   }

   async function fetchRSS(opts = {}) {
     const fromCacheService = await getViaCacheService(opts);
     if (fromCacheService && fromCacheService.items.length && !isSeedPayload(fromCacheService)) {
       return fromCacheService;
     }

     const snapshot = readCacheSnapshot();
     if (snapshot && snapshot.items.length && !isSeedPayload(snapshot)) {
       return snapshot;
     }

     return {
       ok: false,
       items: [],
       stories: [],
       meta: {
         source: DEFAULTS.source,
         mode: DEFAULTS.mode,
         fetchedAt: Date.now(),
         storyCount: 0,
         itemCount: 0,
         degraded: true,
         stale: true,
         detail: "cache_unavailable_no_snapshot"
       }
     };
   }

   async function getEditorsPicks(opts = {}) {
     const payload = await fetchRSS(opts);
     const limit = Number(opts.limit) > 0 ? Number(opts.limit) : 0;
     const stories = limit > 0 ? payload.stories.slice(0, limit) : payload.stories.slice();

     return {
       ok: stories.length > 0,
       stories,
       slides: stories,
       chips: [],
       meta: {
         ...payload.meta,
         storyCount: stories.length
       }
     };
   }

   async function getStory(lookup, opts = {}) {
     const payload = await fetchRSS(opts);
     const key = cleanText(lookup).toLowerCase();

     const story = payload.stories.find((item) => [
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
         meta: payload.meta
       };
     }

     return {
       ok: true,
       story,
       meta: payload.meta
     };
   }

   async function prime(opts = {}) {
     try {
       if (CACHE_SERVICE_MOD && typeof CACHE_SERVICE_MOD.refreshCache === "function") {
         const payload = await CACHE_SERVICE_MOD.refreshCache({
           timeoutMs: Number(opts.timeoutMs || 30000),
           forceRefresh: true
         });
         const normalized = normalizePayload(payload);
         return {
           ok: !!(normalized && Array.isArray(normalized.items) && normalized.items.length && !isSeedPayload(normalized)),
           items: normalized.items,
           stories: normalized.stories,
           meta: {
             ...normalized.meta,
             mode: DEFAULTS.refreshMode,
             servedFrom: cleanText(normalized.meta && normalized.meta.servedFrom || "cache_refresh") || "cache_refresh"
           }
         };
       }

       const snapshot = readCacheSnapshot();
       return {
         ok: !!(snapshot && snapshot.items.length),
         meta: snapshot ? snapshot.meta : {
           source: DEFAULTS.source,
           mode: DEFAULTS.mode,
           detail: "no_snapshot_available"
         }
       };
     } catch (err) {
       logger("[Sandblast][newsCanada] prime_error", err && (err.stack || err.message || err));
       return {
         ok: false,
         error: cleanText(err && err.message) || "prime_failed",
         meta: {
           source: DEFAULTS.source,
           mode: DEFAULTS.mode
         }
       };
     }
   }

   async function health() {
     const payload = await fetchRSS({});
     return {
       ok: payload.ok,
       source: DEFAULTS.source,
       mode: DEFAULTS.mode,
       storyCount: Array.isArray(payload.stories) ? payload.stories.length : 0,
       degraded: !!(payload.meta && payload.meta.degraded),
       stale: !!(payload.meta && payload.meta.stale),
       diagnostics: payload.meta
     };
   }

   async function refreshNow(opts = {}) {
     return prime(opts);
   }

   return {
     fetchRSS,
     getEditorsPicks,
     getStory,
     prime,
     refreshNow,
     health
   };
 }

 module.exports = {
   createNewsCanadaFeedService,
   fetchRSS: async function fetchRSSCompat(opts = {}) {
     const service = createNewsCanadaFeedService();
     return service.fetchRSS(opts);
   },
   refreshNow: async function refreshNowCompat(opts = {}) {
     const service = createNewsCanadaFeedService();
     return service.refreshNow(opts);
   }
 };

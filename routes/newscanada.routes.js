"use strict";

const express = require("express");
const router = express.Router();

const manualService = require("./newscanada.manual.service");
const rssServiceMod = require("./newscanada.rss.service");

function cleanText(v) {
  return typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim();
}

function isObj(v) {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function boolQuery(value) {
  const raw = cleanText(value).toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

function resolveRssService(mod) {
  if (!mod) return null;
  if (typeof mod.fetchRSS === "function") return mod;
  if (typeof mod.createNewsCanadaFeedService === "function") {
    try {
      return mod.createNewsCanadaFeedService();
    } catch (_) {
      return null;
    }
  }
  return null;
}

const rssService = resolveRssService(rssServiceMod);

router.get("/manual", (req, res) => {
  try {
    const data = manualService.getSlots();
    return res.json({ ok: true, ...data });
  } catch (err) {
    return res.status(500).json({ ok: false, error: cleanText(err && err.message) || "manual_read_failed" });
  }
});

router.post("/manual/save", (req, res) => {
  try {
    const result = manualService.saveSlot(isObj(req.body) ? req.body : {});
    return res.json(result);
  } catch (err) {
    const message = cleanText(err && err.message) || "manual_save_failed";
    const status = /missing slotid/i.test(message) ? 400 : 500;
    return res.status(status).json({ ok: false, error: message });
  }
});

router.post("/manual/clear", (req, res) => {
  try {
    const slotId = cleanText(req.body && req.body.slotId);
    const result = manualService.clearSlot(slotId);
    return res.json(result);
  } catch (err) {
    const message = cleanText(err && err.message) || "manual_clear_failed";
    const status = /missing slotid/i.test(message) ? 400 : 500;
    return res.status(status).json({ ok: false, error: message });
  }
});

router.get("/rss", async (req, res) => {
  if (!rssService || typeof rssService.fetchRSS !== "function") {
    return res.status(500).json({ ok: false, error: "rss_service_unavailable" });
  }

  const trace = {
    refresh: boolQuery(req.query && req.query.refresh),
    clearCache: boolQuery(req.query && req.query.clearCache),
    diagnostics: boolQuery(req.query && req.query.diagnostics),
    maxItems: Number(req.query && req.query.maxItems) || undefined,
    timeoutMs: Number(req.query && req.query.timeoutMs) || undefined,
  };

  try {
    const result = await rssService.fetchRSS(trace);
    const response = {
      ok: !!(result && result.ok !== false),
      ...result,
      route: "/api/newscanada/rss",
      trace: {
        request: trace,
        resultSource: cleanText(result && result.meta && result.meta.source || ""),
        servedFrom: cleanText(result && result.meta && result.meta.servedFrom || ""),
        parserMode: cleanText(result && result.meta && result.meta.parserMode || ""),
        itemCount: Array.isArray(result && result.items) ? result.items.length : 0,
      }
    };
    return res.status(response.ok ? 200 : 502).json(response);
  } catch (err) {
    console.error("[newscanada.routes][rss:error]", err && (err.stack || err.message || err));
    return res.status(500).json({
      ok: false,
      error: cleanText(err && err.message) || "rss_fetch_failed",
      route: "/api/newscanada/rss",
      trace: { request: trace }
    });
  }
});

router.post("/rss/refresh", async (req, res) => {
  if (!rssService || typeof rssService.fetchRSS !== "function") {
    return res.status(500).json({ ok: false, error: "rss_service_unavailable" });
  }

  const options = {
    refresh: true,
    clearCache: true,
    diagnostics: true,
    maxItems: Number(req.body && req.body.maxItems) || undefined,
    timeoutMs: Number(req.body && req.body.timeoutMs) || undefined,
  };

  try {
    const result = await rssService.fetchRSS(options);
    return res.status(result && result.ok !== false ? 200 : 502).json({
      ok: !!(result && result.ok !== false),
      route: "/api/newscanada/rss/refresh",
      ...result,
      trace: {
        request: options,
        resultSource: cleanText(result && result.meta && result.meta.source || ""),
        servedFrom: cleanText(result && result.meta && result.meta.servedFrom || ""),
        parserMode: cleanText(result && result.meta && result.meta.parserMode || ""),
        itemCount: Array.isArray(result && result.items) ? result.items.length : 0,
      }
    });
  } catch (err) {
    console.error("[newscanada.routes][refresh:error]", err && (err.stack || err.message || err));
    return res.status(500).json({ ok: false, error: cleanText(err && err.message) || "rss_refresh_failed" });
  }
});



router.get("/editors-picks", async (req, res) => {
  if (!rssService || typeof rssService.getEditorsPicks !== "function") {
    return res.status(500).json({ ok: false, error: "rss_service_unavailable" });
  }

  const options = {
    refresh: boolQuery(req.query && req.query.refresh),
    clearCache: boolQuery(req.query && req.query.clearCache),
    diagnostics: boolQuery(req.query && req.query.diagnostics),
    limit: Number(req.query && req.query.limit) || undefined,
    timeoutMs: Number(req.query && req.query.timeoutMs) || undefined,
  };

  try {
    const result = await rssService.getEditorsPicks(options);
    return res.status(result && result.ok ? 200 : 502).json({
      ok: !!(result && result.ok),
      route: "/api/newscanada/editors-picks",
      ...result,
      trace: {
        request: options,
        resultSource: cleanText(result && result.meta && result.meta.source || ""),
        servedFrom: cleanText(result && result.meta && result.meta.servedFrom || ""),
        parserMode: cleanText(result && result.meta && result.meta.parserMode || ""),
        storyCount: Array.isArray(result && result.stories) ? result.stories.length : 0,
      }
    });
  } catch (err) {
    console.error("[newscanada.routes][editors-picks:error]", err && (err.stack || err.message || err));
    return res.status(500).json({
      ok: false,
      error: cleanText(err && err.message) || "editors_picks_failed",
      route: "/api/newscanada/editors-picks"
    });
  }
});

router.get("/editors-picks/meta", async (req, res) => {
  if (!rssService || typeof rssService.getEditorsPicks !== "function") {
    return res.status(500).json({ ok: false, error: "rss_service_unavailable" });
  }

  try {
    const result = await rssService.getEditorsPicks({
      refresh: false,
      diagnostics: true,
      limit: Number(req.query && req.query.limit) || undefined,
      timeoutMs: Number(req.query && req.query.timeoutMs) || undefined,
    });
    return res.json({
      ok: !!(result && result.ok),
      route: "/api/newscanada/editors-picks/meta",
      meta: result && result.meta ? result.meta : {},
      chipCount: Array.isArray(result && result.chips) ? result.chips.length : 0,
      storyCount: Array.isArray(result && result.stories) ? result.stories.length : 0,
    });
  } catch (err) {
    console.error("[newscanada.routes][editors-picks-meta:error]", err && (err.stack || err.message || err));
    return res.status(500).json({ ok: false, error: cleanText(err && err.message) || "editors_picks_meta_failed" });
  }
});

router.get("/story/:lookup?", async (req, res) => {
  if (!rssService || typeof rssService.getStory !== "function") {
    return res.status(500).json({ ok: false, error: "rss_service_unavailable" });
  }

  const lookup = cleanText(req.params && req.params.lookup) ||
    cleanText(req.query && req.query.lookup) ||
    cleanText(req.query && req.query.id) ||
    cleanText(req.query && req.query.slug) ||
    cleanText(req.query && req.query.url) ||
    cleanText(req.query && req.query.title);

  try {
    const result = await rssService.getStory(lookup, {
      refresh: boolQuery(req.query && req.query.refresh),
      timeoutMs: Number(req.query && req.query.timeoutMs) || undefined,
    });
    return res.status(result && result.ok ? 200 : 404).json({
      ok: !!(result && result.ok),
      route: "/api/newscanada/story",
      lookup,
      ...result
    });
  } catch (err) {
    console.error("[newscanada.routes][story:error]", err && (err.stack || err.message || err));
    return res.status(500).json({
      ok: false,
      error: cleanText(err && err.message) || "story_fetch_failed",
      route: "/api/newscanada/story",
      lookup
    });
  }
});

router.get("/rss/diagnostics", async (req, res) => {
  if (!rssService) {
    return res.status(500).json({ ok: false, error: "rss_service_unavailable" });
  }
  try {
    const health = typeof rssService.health === "function"
      ? await rssService.health()
      : { ok: false, error: "rss_health_unavailable" };

    const cacheInfo = typeof rssService.inspectCache === "function"
      ? await rssService.inspectCache()
      : { ok: false, error: "rss_cache_introspection_unavailable" };

    return res.json({
      ok: true,
      route: "/api/newscanada/rss/diagnostics",
      health,
      cacheInfo
    });
  } catch (err) {
    console.error("[newscanada.routes][diagnostics:error]", err && (err.stack || err.message || err));
    return res.status(500).json({ ok: false, error: cleanText(err && err.message) || "rss_diagnostics_failed" });
  }
});

router.get("/health", async (req, res) => {
  try {
    const manual = manualService.getSlots();
    const rss = rssService && typeof rssService.health === "function"
      ? await rssService.health()
      : { ok: false, error: "rss_service_unavailable" };

    return res.json({
      ok: true,
      manualSlotCount: Object.keys((manual && manual.slots) || {}).length,
      rss
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: cleanText(err && err.message) || "health_failed" });
  }
});

module.exports = router;

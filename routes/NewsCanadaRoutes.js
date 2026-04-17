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

  try {
    const result = await rssService.fetchRSS({
      refresh: req.query && String(req.query.refresh || "").trim() === "1"
    });
    return res.json(result);
  } catch (err) {
    console.error("[newscanada.routes][rss:error]", err && (err.stack || err.message || err));
    return res.status(500).json({ ok: false, error: cleanText(err && err.message) || "rss_fetch_failed" });
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

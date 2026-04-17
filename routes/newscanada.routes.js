"use strict";

const express = require("express");
const fs = require("fs");
const path = require("path");

const router = express.Router();

const DATA_FILE = path.join(process.cwd(), "data", "NewsCanada", "manual-stories.json");

const SLOT_CONFIG = {
  editors_pick: "Editor's Pick",
  top_story: "Top Story",
  news_canada_1: "News Canada",
  news_canada_2: "News Canada"
};

function ensureDir(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function nowIso() {
  return new Date().toISOString();
}

function clean(value) {
  return typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
}

function createEmptySlot(id) {
  return {
    id,
    chipLabel: SLOT_CONFIG[id] || "News Canada",
    headline: "",
    summary: "",
    body: "",
    imageUrl: "",
    imageAlt: "",
    category: "",
    publishedAt: "",
    sourceName: "News Canada",
    sourceUrl: "",
    canonicalUrl: "",
    ctaText: "See more stories at sandblastchannel.com",
    isActive: false,
    updatedAt: nowIso()
  };
}

function createDefaultStore() {
  return {
    ok: true,
    slots: Object.fromEntries(
      Object.keys(SLOT_CONFIG).map((slotId) => [slotId, createEmptySlot(slotId)])
    )
  };
}

function readStore() {
  ensureDir(DATA_FILE);

  if (!fs.existsSync(DATA_FILE)) {
    const initial = createDefaultStore();
    fs.writeFileSync(DATA_FILE, JSON.stringify(initial, null, 2), "utf8");
    return initial;
  }

  try {
    const raw = fs.readFileSync(DATA_FILE, "utf8");
    const parsed = JSON.parse(raw);

    if (!parsed || typeof parsed !== "object" || !parsed.slots || typeof parsed.slots !== "object") {
      const fallback = createDefaultStore();
      fs.writeFileSync(DATA_FILE, JSON.stringify(fallback, null, 2), "utf8");
      return fallback;
    }

    for (const slotId of Object.keys(SLOT_CONFIG)) {
      if (!parsed.slots[slotId] || typeof parsed.slots[slotId] !== "object") {
        parsed.slots[slotId] = createEmptySlot(slotId);
      } else {
        parsed.slots[slotId] = {
          ...createEmptySlot(slotId),
          ...parsed.slots[slotId],
          id: slotId,
          chipLabel: SLOT_CONFIG[slotId]
        };
      }
    }

    return { ok: true, slots: parsed.slots };
  } catch (err) {
    console.log("[manualNewsCanadaRoutes][readStore:error]", err && (err.stack || err.message || err));
    const fallback = createDefaultStore();
    fs.writeFileSync(DATA_FILE, JSON.stringify(fallback, null, 2), "utf8");
    return fallback;
  }
}

function writeStore(store) {
  ensureDir(DATA_FILE);
  fs.writeFileSync(DATA_FILE, JSON.stringify(store, null, 2), "utf8");
}

function normalizeStoryPayload(body) {
  const slotId = clean(body.slotId);
  const story = {
    id: slotId,
    chipLabel: SLOT_CONFIG[slotId] || "News Canada",
    headline: clean(body.headline),
    summary: clean(body.summary),
    body: clean(body.body),
    imageUrl: clean(body.imageUrl),
    imageAlt: clean(body.imageAlt),
    category: clean(body.category),
    publishedAt: clean(body.publishedAt),
    sourceName: clean(body.sourceName) || "News Canada",
    sourceUrl: clean(body.sourceUrl),
    canonicalUrl: clean(body.canonicalUrl || body.sourceUrl),
    ctaText: clean(body.ctaText) || "See more stories at sandblastchannel.com",
    isActive: body.isActive !== false,
    updatedAt: nowIso()
  };

  return story;
}

function validateStoryPayload(story) {
  if (!story.id || !SLOT_CONFIG[story.id]) {
    return "Invalid slotId";
  }
  if (!story.headline) {
    return "Headline is required";
  }
  if (!story.body) {
    return "Body is required";
  }
  return "";
}

router.get("/manual", (req, res) => {
  try {
    const store = readStore();
    return res.json({ ok: true, slots: store.slots });
  } catch (_) {
    return res.status(500).json({ ok: false, error: "manual_read_failed" });
  }
});

router.post("/manual/save", (req, res) => {
  try {
    const store = readStore();
    const story = normalizeStoryPayload(req.body || {});
    const validationError = validateStoryPayload(story);

    if (validationError) {
      return res.status(400).json({ ok: false, error: validationError });
    }

    store.slots[story.id] = story;
    writeStore(store);

    return res.json({
      ok: true,
      slotId: story.id,
      story,
      slots: store.slots
    });
  } catch (err) {
    console.log("[manualNewsCanadaRoutes][save:error]", err && (err.stack || err.message || err));
    return res.status(500).json({ ok: false, error: "manual_save_failed" });
  }
});

router.post("/manual/clear", (req, res) => {
  try {
    const store = readStore();
    const slotId = clean(req.body && req.body.slotId);

    if (!slotId || !SLOT_CONFIG[slotId]) {
      return res.status(400).json({ ok: false, error: "Invalid slotId" });
    }

    store.slots[slotId] = createEmptySlot(slotId);
    writeStore(store);

    return res.json({
      ok: true,
      slotId,
      story: store.slots[slotId],
      slots: store.slots
    });
  } catch (err) {
    console.log("[manualNewsCanadaRoutes][clear:error]", err && (err.stack || err.message || err));
    return res.status(500).json({ ok: false, error: "manual_clear_failed" });
  }
});

module.exports = router;

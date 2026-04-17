"use strict";

const fs = require("fs");
const path = require("path");

const DATA_PATH = path.join(__dirname, "newscanada.manual.data.json");

function safeStr(v) {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}

function cleanText(v) {
  return safeStr(v).trim();
}

function isObj(v) {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function clone(v) {
  return JSON.parse(JSON.stringify(v));
}

function createEmptyStore() {
  return { ok: true, slots: {} };
}

function sanitizeSlotPayload(payload) {
  const src = isObj(payload) ? payload : {};
  const slotId = cleanText(src.slotId || src.id);
  if (!slotId) {
    throw new Error("Missing slotId");
  }

  return {
    id: slotId,
    slotId,
    headline: cleanText(src.headline),
    title: cleanText(src.title || src.headline),
    summary: cleanText(src.summary || src.description),
    body: cleanText(src.body || src.content || src.summary || src.description),
    imageUrl: cleanText(src.imageUrl || src.image || src.popupImage),
    imageAlt: cleanText(src.imageAlt || src.headline || src.title),
    category: cleanText(src.category),
    publishedAt: cleanText(src.publishedAt || src.pubDate),
    sourceName: cleanText(src.sourceName || "News Canada"),
    sourceUrl: cleanText(src.sourceUrl || src.url || src.link),
    canonicalUrl: cleanText(src.canonicalUrl || src.sourceUrl || src.url || src.link),
    ctaText: cleanText(src.ctaText || "Read story"),
    chipLabel: cleanText(src.chipLabel || "News Canada"),
    isActive: src.isActive !== false,
    updatedAt: new Date().toISOString()
  };
}

function readData() {
  try {
    if (!fs.existsSync(DATA_PATH)) {
      return createEmptyStore();
    }
    const parsed = JSON.parse(fs.readFileSync(DATA_PATH, "utf-8"));
    if (!isObj(parsed) || !isObj(parsed.slots)) {
      return createEmptyStore();
    }

    const slots = {};
    for (const [slotId, slot] of Object.entries(parsed.slots)) {
      try {
        slots[slotId] = sanitizeSlotPayload({ ...(isObj(slot) ? slot : {}), slotId });
      } catch (_) {}
    }

    return { ok: true, slots };
  } catch (err) {
    console.error("[manual.service] read error:", err && (err.stack || err.message || err));
    return createEmptyStore();
  }
}

function writeData(data) {
  try {
    const payload = isObj(data) && isObj(data.slots) ? data : createEmptyStore();
    fs.writeFileSync(DATA_PATH, JSON.stringify(payload, null, 2), "utf-8");
    return { ok: true };
  } catch (err) {
    console.error("[manual.service] write error:", err && (err.stack || err.message || err));
    return { ok: false, error: cleanText(err && err.message) || "manual_write_failed" };
  }
}

function getSlots() {
  return readData();
}

function saveSlot(payload) {
  const data = readData();
  const story = sanitizeSlotPayload(payload);
  data.slots[story.slotId] = story;

  const write = writeData(data);
  if (!write.ok) {
    throw new Error(write.error || "manual_write_failed");
  }

  return {
    ok: true,
    slotId: story.slotId,
    story: clone(story),
    slots: clone(data.slots)
  };
}

function clearSlot(slotId) {
  const normalizedSlotId = cleanText(slotId);
  if (!normalizedSlotId) {
    throw new Error("Missing slotId");
  }

  const data = readData();
  delete data.slots[normalizedSlotId];

  const write = writeData(data);
  if (!write.ok) {
    throw new Error(write.error || "manual_write_failed");
  }

  return {
    ok: true,
    slotId: normalizedSlotId,
    slots: clone(data.slots),
    story: { id: normalizedSlotId, slotId: normalizedSlotId, isActive: false }
  };
}

module.exports = {
  DATA_PATH,
  getSlots,
  saveSlot,
  clearSlot
};

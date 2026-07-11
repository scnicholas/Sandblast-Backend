"use strict";

const crypto = require("crypto");

const MAX_SLOTS = 500;
const MAX_TITLE_LENGTH = 140;
const MAX_DURATION_SECONDS = 12 * 60 * 60;

function cleanText(value, max = MAX_TITLE_LENGTH) {
  return String(value == null ? "" : value).replace(/\s+/g, " ").trim().slice(0, max);
}

function allowedHosts() {
  return String(
    process.env.SB_TV_MEDIA_HOSTS ||
    "dn600300.us.archive.org,dn600301.us.archive.org,videotourl.com"
  )
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function validateHttpsMediaUrl(value) {
  let url;
  try {
    url = new URL(String(value || ""));
  } catch (_) {
    return { ok: false, error: "invalid_url" };
  }

  if (url.protocol !== "https:") {
    return { ok: false, error: "https_required" };
  }

  const hosts = allowedHosts();
  if (hosts.length && !hosts.includes(url.hostname.toLowerCase())) {
    return { ok: false, error: "media_host_not_allowed" };
  }

  return { ok: true, normalizedUrl: url.href };
}

function normalizeSlot(slot, position) {
  const src = slot && typeof slot === "object" ? slot : {};
  const sourceResult = src.sourceUrl ? validateHttpsMediaUrl(src.sourceUrl) : { ok: false, error: "source_missing" };
  const durationSeconds = Number(src.durationSeconds);

  return {
    id: cleanText(src.id || `slot-${String(position).padStart(2, "0")}`, 80),
    position,
    title: cleanText(src.title || `Slot ${position}`),
    sourceUrl: sourceResult.ok ? sourceResult.normalizedUrl : "",
    durationSeconds: Number.isFinite(durationSeconds) ? durationSeconds : 0,
    enabled: src.enabled === true,
    validationStatus: cleanText(src.validationStatus || "pending", 30),
    notes: cleanText(src.notes || "", 300)
  };
}

function validateDraft(draft, channel) {
  const errors = [];
  const src = draft && typeof draft === "object" ? draft : {};
  const slots = Array.isArray(src.slots) ? src.slots : [];

  if (!slots.length) errors.push("at_least_one_slot_required");
  if (slots.length > MAX_SLOTS) errors.push(`slot_limit_${MAX_SLOTS}`);

  const normalizedSlots = slots.map((slot, index) => normalizeSlot(slot, index + 1));
  const ids = new Set();

  for (const slot of normalizedSlots) {
    if (!slot.id || ids.has(slot.id)) errors.push(`duplicate_or_empty_slot_id:${slot.id || slot.position}`);
    ids.add(slot.id);

    if (!slot.enabled) continue;

    const urlResult = validateHttpsMediaUrl(slot.sourceUrl);
    if (!urlResult.ok) errors.push(`${slot.id}:${urlResult.error}`);

    if (!(slot.durationSeconds > 0 && slot.durationSeconds <= MAX_DURATION_SECONDS)) {
      errors.push(`${slot.id}:invalid_duration`);
    }
  }

  const enabledSlots = normalizedSlots.filter((slot) => slot.enabled);
  if (!enabledSlots.length) errors.push("at_least_one_enabled_slot_required");

  return {
    ok: errors.length === 0,
    errors,
    value: {
      schemaVersion: 1,
      channel,
      displayName: cleanText(src.displayName || channel, 80),
      loop: src.loop !== false,
      anchorEpochMs: Number.isFinite(Number(src.anchorEpochMs))
        ? Number(src.anchorEpochMs)
        : Date.now(),
      slots: normalizedSlots
    }
  };
}

function safeTokenEqual(expected, supplied) {
  const a = Buffer.from(String(expected || ""));
  const b = Buffer.from(String(supplied || ""));
  if (!a.length || a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

module.exports = {
  MAX_SLOTS,
  cleanText,
  validateHttpsMediaUrl,
  normalizeSlot,
  validateDraft,
  safeTokenEqual
};

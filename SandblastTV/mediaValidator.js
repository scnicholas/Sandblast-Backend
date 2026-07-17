"use strict";

const crypto = require("crypto");

const MAX_SLOTS = 500;
const MAX_TITLE_LENGTH = 140;
const MAX_DURATION_SECONDS = 12 * 60 * 60;
const DEFAULT_PROBE_TIMEOUT_MS = 12000;
const VALID_MEDIA_STATUSES = new Set(["pending", "validated", "quarantined", "empty"]);

function cleanText(value, max = MAX_TITLE_LENGTH) {
  return String(value == null ? "" : value).replace(/\s+/g, " ").trim().slice(0, max);
}

function allowedHosts() {
  return String(
    process.env.SB_TV_MEDIA_HOSTS ||
    "archive.org,*.archive.org,videotourl.com"
  )
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function hostAllowed(hostname, rules = allowedHosts()) {
  const host = String(hostname || "").toLowerCase();
  if (!host || host === "localhost" || host.endsWith(".localhost") || /^\d+\.\d+\.\d+\.\d+$/.test(host)) return false;
  return rules.some((rule) => {
    if (rule.startsWith("*.")) {
      const suffix = rule.slice(1);
      return host.endsWith(suffix) && host.length > suffix.length;
    }
    return host === rule;
  });
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
  if (hosts.length && !hostAllowed(url.hostname, hosts)) {
    return { ok: false, error: "media_host_not_allowed" };
  }

  return { ok: true, normalizedUrl: url.href };
}

function normalizeSlot(slot, position) {
  const src = slot && typeof slot === "object" ? slot : {};
  const sourceResult = src.sourceUrl ? validateHttpsMediaUrl(src.sourceUrl) : { ok: false, error: "source_missing" };
  const durationSeconds = Number(src.durationSeconds);

  const rawStatus = cleanText(src.validationStatus || "pending", 30).toLowerCase();
  return {
    id: cleanText(src.id || `slot-${String(position).padStart(2, "0")}`, 80),
    position,
    title: cleanText(src.title || `Slot ${position}`),
    sourceUrl: sourceResult.ok ? sourceResult.normalizedUrl : "",
    durationSeconds: Number.isFinite(durationSeconds) ? durationSeconds : 0,
    enabled: src.enabled === true,
    validationStatus: VALID_MEDIA_STATUSES.has(rawStatus) ? rawStatus : "pending",
    notes: cleanText(src.notes || "", 300),
    certification: src.certification && typeof src.certification === "object"
      ? { ...src.certification }
      : undefined
  };
}

function validateDraft(draft, channel, options = {}) {
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
    if (options.requireValidated === true && slot.validationStatus !== "validated") {
      errors.push(`${slot.id}:media_not_validated`);
    }
  }

  const enabledSlots = normalizedSlots.filter((slot) => slot.enabled);
  if (!enabledSlots.length) errors.push("at_least_one_enabled_slot_required");

  return {
    ok: errors.length === 0,
    errors,
    value: {
      ...src,
      schemaVersion: Math.max(3, Number(src.schemaVersion) || 0),
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

function mediaMimeAllowed(value) {
  const mime = String(value || "").split(";")[0].trim().toLowerCase();
  return mime.startsWith("video/") || mime === "application/octet-stream";
}

async function probeMediaUrl(value, options = {}) {
  const checked = validateHttpsMediaUrl(value);
  if (!checked.ok) return { ok:false, error:checked.error, sourceUrl:"" };
  const timeoutMs = Math.max(1000, Math.min(30000, Number(options.timeoutMs) || DEFAULT_PROBE_TIMEOUT_MS));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = Date.now();
  let response;
  try {
    response = await fetch(checked.normalizedUrl, {
      method:"HEAD", redirect:"follow", signal:controller.signal,
      headers:{"User-Agent":"SandblastTV-MediaCertifier/1.0","Accept":"video/*,application/octet-stream;q=0.8"}
    });
    if (!response.ok || !mediaMimeAllowed(response.headers.get("content-type"))) {
      response = await fetch(checked.normalizedUrl, {
        method:"GET", redirect:"follow", signal:controller.signal,
        headers:{"Range":"bytes=0-1","User-Agent":"SandblastTV-MediaCertifier/1.0","Accept":"video/*,application/octet-stream;q=0.8"}
      });
    }
    const contentType = String(response.headers.get("content-type") || "");
    const ok = (response.status === 200 || response.status === 206) && mediaMimeAllowed(contentType);
    if (response.body && typeof response.body.cancel === "function") await response.body.cancel().catch(() => {});
    return {
      ok, error:ok?"":(response.ok?"unsupported_media_type":`http_${response.status}`),
      sourceUrl:checked.normalizedUrl, finalUrl:String(response.url || checked.normalizedUrl),
      httpStatus:response.status, contentType, contentLength:Number(response.headers.get("content-length")) || null,
      acceptRanges:String(response.headers.get("accept-ranges") || ""), latencyMs:Date.now()-startedAt,
      checkedAt:new Date().toISOString()
    };
  } catch (error) {
    return {ok:false,error:error&&error.name==="AbortError"?"probe_timeout":"probe_failed",sourceUrl:checked.normalizedUrl,latencyMs:Date.now()-startedAt,checkedAt:new Date().toISOString()};
  } finally { clearTimeout(timer); }
}

async function certifySlot(slot, position, options = {}) {
  const normalized = normalizeSlot(slot, position);
  if (!normalized.enabled) return {...normalized,validationStatus:normalized.sourceUrl?normalized.validationStatus:"empty"};
  const probe = await probeMediaUrl(normalized.sourceUrl, options);
  const durationValid = normalized.durationSeconds > 0 && normalized.durationSeconds <= MAX_DURATION_SECONDS;
  const validated = probe.ok && durationValid;
  return {
    ...normalized,
    enabled: validated ? true : (options.quarantineFailures === true ? false : normalized.enabled),
    validationStatus: validated ? "validated" : "quarantined",
    certification:{contract:"sandblast.tv.mediaCertification/1.0",validated,probe,durationValid,certifiedAt:new Date().toISOString()}
  };
}

async function certifyDraft(draft, channel, options = {}) {
  const src=draft&&typeof draft==="object"?draft:{}, slots=Array.isArray(src.slots)?src.slots:[], certified=[];
  for(let index=0;index<slots.length;index+=1) certified.push(await certifySlot(slots[index],index+1,options));
  const active=certified.filter(x=>x.enabled), validated=certified.filter(x=>x.validationStatus==="validated"), quarantined=certified.filter(x=>x.validationStatus==="quarantined");
  return {contract:"sandblast.tv.mediaCertificationReport/1.0",channel,ok:quarantined.length===0&&validated.length===active.length,checkedAt:new Date().toISOString(),summary:{total:certified.length,active:active.length,validated:validated.length,quarantined:quarantined.length,empty:certified.filter(x=>x.validationStatus==="empty").length},manifest:{...src,channel,updatedAt:new Date().toISOString(),slots:certified}};
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
  hostAllowed,
  normalizeSlot,
  validateDraft,
  mediaMimeAllowed,
  probeMediaUrl,
  certifySlot,
  certifyDraft,
  safeTokenEqual
};

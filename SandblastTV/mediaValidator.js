"use strict";

const crypto = require("crypto");
const net = require("net");

const MAX_SLOTS = 500;
const MAX_TITLE_LENGTH = 140;
const MAX_DURATION_SECONDS = 12 * 60 * 60;
const MAX_SOURCE_URL_LENGTH = 2048;
const DEFAULT_PROBE_TIMEOUT_MS = 12000;
const DEFAULT_CERTIFICATION_CONCURRENCY = 4;
const MAX_REDIRECTS = 5;
const VALID_MEDIA_STATUSES = new Set(["pending", "validated", "quarantined", "empty"]);
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

function cleanText(value, max = MAX_TITLE_LENGTH) {
  return String(value == null ? "" : value).replace(/\s+/g, " ").trim().slice(0, max);
}

function cleanSourceUrl(value) {
  return String(value == null ? "" : value).trim().slice(0, MAX_SOURCE_URL_LENGTH);
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
  const host = String(hostname || "").trim().toLowerCase().replace(/\.$/, "");
  if (
    !host ||
    net.isIP(host) !== 0 ||
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal")
  ) {
    return false;
  }

  return rules.some((rawRule) => {
    const rule = String(rawRule || "").trim().toLowerCase().replace(/\.$/, "");
    if (!rule) return false;
    if (rule.startsWith("*.")) {
      const suffix = rule.slice(1);
      return host.endsWith(suffix) && host.length > suffix.length;
    }
    return host === rule;
  });
}

function validateHttpsMediaUrl(value, options = {}) {
  let url;
  try {
    url = new URL(cleanSourceUrl(value));
  } catch (_) {
    return { ok: false, error: "invalid_url" };
  }

  if (url.protocol !== "https:") return { ok: false, error: "https_required" };
  if (url.username || url.password) return { ok: false, error: "url_credentials_not_allowed" };
  if (url.port && url.port !== "443") return { ok: false, error: "nonstandard_port_not_allowed" };

  const hosts = Array.isArray(options.hosts) ? options.hosts : allowedHosts();
  if (!hostAllowed(url.hostname, hosts)) {
    return { ok: false, error: "media_host_not_allowed" };
  }

  url.hash = "";
  return { ok: true, normalizedUrl: url.href };
}

function normalizeSlot(slot, position) {
  const src = slot && typeof slot === "object" ? slot : {};
  const rawSourceUrl = cleanSourceUrl(src.sourceUrl);
  const sourceResult = rawSourceUrl
    ? validateHttpsMediaUrl(rawSourceUrl)
    : { ok: false, error: "source_missing" };
  const durationSeconds = Number(src.durationSeconds);
  const rawStatus = cleanText(src.validationStatus || "pending", 30).toLowerCase();

  return {
    id: cleanText(src.id || `slot-${String(position).padStart(2, "0")}`, 80),
    position,
    title: cleanText(src.title || `Slot ${position}`),
    sourceUrl: sourceResult.ok ? sourceResult.normalizedUrl : rawSourceUrl,
    durationSeconds: Number.isFinite(durationSeconds) ? durationSeconds : 0,
    enabled: src.enabled === true,
    validationStatus: VALID_MEDIA_STATUSES.has(rawStatus) ? rawStatus : "pending",
    notes: cleanText(src.notes || "", 300),
    certification: src.certification && typeof src.certification === "object"
      ? { ...src.certification }
      : undefined
  };
}

function certificationFingerprint(slot) {
  const normalized = normalizeSlot(slot, Number(slot && slot.position) || 1);
  const subject = JSON.stringify({
    id: normalized.id,
    sourceUrl: normalized.sourceUrl,
    durationSeconds: normalized.durationSeconds
  });
  return crypto.createHash("sha256").update(subject).digest("hex");
}

function certificationIsCurrent(slot) {
  const normalized = normalizeSlot(slot, Number(slot && slot.position) || 1);
  const certification = normalized.certification;
  return Boolean(
    normalized.validationStatus === "validated" &&
    certification &&
    certification.validated === true &&
    certification.durationValid === true &&
    certification.probe &&
    certification.probe.ok === true &&
    certification.fingerprint === certificationFingerprint(normalized)
  );
}

function resetSlotCertification(slot, position) {
  const normalized = normalizeSlot(slot, position);
  return {
    ...normalized,
    validationStatus: normalized.sourceUrl ? "pending" : "empty",
    certification: undefined
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
    if (!slot.id || ids.has(slot.id)) {
      errors.push(`duplicate_or_empty_slot_id:${slot.id || slot.position}`);
    }
    ids.add(slot.id);

    if (!slot.enabled) continue;

    const urlResult = validateHttpsMediaUrl(slot.sourceUrl);
    if (!urlResult.ok) errors.push(`${slot.id}:${urlResult.error}`);

    if (!(slot.durationSeconds > 0 && slot.durationSeconds <= MAX_DURATION_SECONDS)) {
      errors.push(`${slot.id}:invalid_duration`);
    }

    if (options.requireValidated === true && !certificationIsCurrent(slot)) {
      errors.push(`${slot.id}:media_not_certified`);
    }
  }

  const enabledSlots = normalizedSlots.filter((slot) => slot.enabled);
  if (!enabledSlots.length) errors.push("at_least_one_enabled_slot_required");

  return {
    ok: errors.length === 0,
    errors,
    value: {
      ...src,
      schemaVersion: Math.max(4, Number(src.schemaVersion) || 0),
      channel,
      displayName: cleanText(src.displayName || channel, 80),
      loop: src.loop !== false,
      anchorEpochMs: (
        src.anchorEpochMs !== null &&
        src.anchorEpochMs !== "" &&
        Number.isFinite(Number(src.anchorEpochMs)) &&
        Number(src.anchorEpochMs) > 0
      )
        ? Number(src.anchorEpochMs)
        : Date.now(),
      slots: normalizedSlots
    }
  };
}

function mediaMimeAllowed(value) {
  const mime = String(value || "").split(";")[0].trim().toLowerCase();
  return (
    mime.startsWith("video/") ||
    mime === "application/octet-stream" ||
    mime === "application/mp4" ||
    mime === "application/vnd.apple.mpegurl" ||
    mime === "application/x-mpegurl"
  );
}

async function cancelBody(response) {
  if (response && response.body && typeof response.body.cancel === "function") {
    await response.body.cancel().catch(() => {});
  }
}

async function fetchWithValidatedRedirects(urlValue, init, options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== "function") {
    const err = new Error("fetch_unavailable");
    err.code = "fetch_unavailable";
    throw err;
  }

  let currentUrl = urlValue;
  const redirects = [];

  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const checked = validateHttpsMediaUrl(currentUrl);
    if (!checked.ok) {
      const err = new Error(checked.error);
      err.code = checked.error;
      throw err;
    }

    const response = await fetchImpl(checked.normalizedUrl, {
      ...init,
      redirect: "manual"
    });

    if (!REDIRECT_STATUSES.has(response.status)) {
      return { response, finalUrl: checked.normalizedUrl, redirects };
    }

    const location = response.headers.get("location");
    await cancelBody(response);
    if (!location) {
      const err = new Error("redirect_location_missing");
      err.code = "redirect_location_missing";
      throw err;
    }
    if (hop === MAX_REDIRECTS) {
      const err = new Error("too_many_redirects");
      err.code = "too_many_redirects";
      throw err;
    }

    const nextUrl = new URL(location, checked.normalizedUrl).href;
    const nextChecked = validateHttpsMediaUrl(nextUrl);
    if (!nextChecked.ok) {
      const err = new Error("redirect_target_not_allowed");
      err.code = "redirect_target_not_allowed";
      throw err;
    }

    redirects.push(nextChecked.normalizedUrl);
    currentUrl = nextChecked.normalizedUrl;
  }

  const err = new Error("too_many_redirects");
  err.code = "too_many_redirects";
  throw err;
}

function contentLengthFrom(response) {
  const contentRange = String(response.headers.get("content-range") || "");
  const rangeMatch = contentRange.match(/\/(\d+)$/);
  if (rangeMatch) return Number(rangeMatch[1]) || null;
  return Number(response.headers.get("content-length")) || null;
}

async function probeMediaUrl(value, options = {}) {
  const checked = validateHttpsMediaUrl(value);
  if (!checked.ok) {
    return {
      ok: false,
      error: checked.error,
      sourceUrl: "",
      checkedAt: new Date().toISOString()
    };
  }

  const timeoutMs = Math.max(
    1000,
    Math.min(30000, Number(options.timeoutMs) || DEFAULT_PROBE_TIMEOUT_MS)
  );
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = Date.now();
  const headers = {
    "User-Agent": "SandblastTV-MediaCertifier/2.0",
    Accept: "video/*,application/vnd.apple.mpegurl,application/octet-stream;q=0.8"
  };

  try {
    let result = await fetchWithValidatedRedirects(
      checked.normalizedUrl,
      { method: "HEAD", signal: controller.signal, headers },
      options
    );

    if (!result.response.ok || !mediaMimeAllowed(result.response.headers.get("content-type"))) {
      await cancelBody(result.response);
      result = await fetchWithValidatedRedirects(
        checked.normalizedUrl,
        {
          method: "GET",
          signal: controller.signal,
          headers: { ...headers, Range: "bytes=0-1" }
        },
        options
      );
    }

    const response = result.response;
    const contentType = String(response.headers.get("content-type") || "");
    const ok = (response.status === 200 || response.status === 206) && mediaMimeAllowed(contentType);
    const responseOk = response.ok;
    const status = response.status;
    const contentLength = contentLengthFrom(response);
    const acceptRanges = String(response.headers.get("accept-ranges") || "");
    await cancelBody(response);

    return {
      ok,
      error: ok ? "" : (responseOk ? "unsupported_media_type" : `http_${status}`),
      sourceUrl: checked.normalizedUrl,
      finalUrl: result.finalUrl,
      redirectCount: result.redirects.length,
      httpStatus: status,
      contentType,
      contentLength,
      acceptRanges,
      latencyMs: Date.now() - startedAt,
      checkedAt: new Date().toISOString()
    };
  } catch (error) {
    const errorCode = error && error.name === "AbortError"
      ? "probe_timeout"
      : cleanText(error && (error.code || error.message) || "probe_failed", 80);
    return {
      ok: false,
      error: errorCode || "probe_failed",
      sourceUrl: checked.normalizedUrl,
      latencyMs: Date.now() - startedAt,
      checkedAt: new Date().toISOString()
    };
  } finally {
    clearTimeout(timer);
  }
}

async function certifySlot(slot, position, options = {}) {
  const normalized = normalizeSlot(slot, position);
  if (!normalized.enabled) {
    return {
      ...normalized,
      validationStatus: normalized.sourceUrl ? "pending" : "empty",
      certification: undefined
    };
  }

  const probe = await probeMediaUrl(normalized.sourceUrl, options);
  const durationValid = normalized.durationSeconds > 0 && normalized.durationSeconds <= MAX_DURATION_SECONDS;
  const validated = probe.ok && durationValid;
  const fingerprint = certificationFingerprint(normalized);

  return {
    ...normalized,
    enabled: validated || options.quarantineFailures !== true,
    validationStatus: validated ? "validated" : "quarantined",
    certification: {
      contract: "sandblast.tv.mediaCertification/2.0",
      fingerprint,
      validated,
      probe,
      durationValid,
      certifiedAt: new Date().toISOString()
    }
  };
}

async function certifyDraft(draft, channel, options = {}) {
  const src = draft && typeof draft === "object" ? draft : {};
  const slots = Array.isArray(src.slots) ? src.slots : [];
  const certified = new Array(slots.length);
  const concurrency = Math.max(
    1,
    Math.min(10, Number(options.concurrency) || DEFAULT_CERTIFICATION_CONCURRENCY)
  );
  let cursor = 0;

  async function worker() {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= slots.length) return;
      certified[index] = await certifySlot(slots[index], index + 1, options);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, Math.max(1, slots.length)) }, worker));

  const active = certified.filter((slot) => slot.enabled);
  const validated = certified.filter((slot) => certificationIsCurrent(slot));
  const quarantined = certified.filter((slot) => slot.validationStatus === "quarantined");
  const empty = certified.filter((slot) => slot.validationStatus === "empty");
  const checkedAt = new Date().toISOString();

  return {
    contract: "sandblast.tv.mediaCertificationReport/2.0",
    channel,
    ok: quarantined.length === 0 && active.every((slot) => certificationIsCurrent(slot)),
    checkedAt,
    summary: {
      total: certified.length,
      active: active.length,
      validated: validated.length,
      quarantined: quarantined.length,
      empty: empty.length
    },
    manifest: {
      ...src,
      schemaVersion: Math.max(4, Number(src.schemaVersion) || 0),
      channel,
      updatedAt: checkedAt,
      slots: certified
    }
  };
}

function safeTokenEqual(expected, supplied) {
  const a = Buffer.from(String(expected || ""), "utf8");
  const b = Buffer.from(String(supplied || ""), "utf8");
  if (!a.length || a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

module.exports = {
  MAX_SLOTS,
  MAX_DURATION_SECONDS,
  cleanText,
  validateHttpsMediaUrl,
  hostAllowed,
  normalizeSlot,
  resetSlotCertification,
  certificationFingerprint,
  certificationIsCurrent,
  validateDraft,
  mediaMimeAllowed,
  probeMediaUrl,
  certifySlot,
  certifyDraft,
  safeTokenEqual
};

"use strict";

/**
 * Nyx Context Passport Renderer
 *
 * Purpose:
 * Renders the compact Context Passport chip without touching the assistant
 * reply bubble.
 *
 * Contract:
 * - Never renders backend diagnostics.
 * - Hides gracefully if metadata is missing or unsafe.
 * - Keeps chip compact.
 * - Works in browser and test environments.
 *
 * Critical safety rule:
 * If a provided label/shortLabel exists and contains unsafe/internal content,
 * the renderer must not fall back to a generated label. It must hide the chip.
 */

const RENDERER_VERSION = "nyx.contextPassport.renderer/1.0.1";

const MAX_LABEL_LENGTH = 52;
const MAX_TRUNCATED_LABEL_LENGTH = 49;

const SAFE_STATES = Object.freeze(["hidden", "active", "handoff", "fallback"]);

const UNSAFE_TEXT_PATTERN = /runtimeTelemetry|failureSignature|stack\s*trace|TypeError|ReferenceError|SyntaxError|MODULE_NOT_FOUND|ENOENT|Bearer\s+|api[_-]?key|secret|token|password|authorization|headers|debugError|rawError|diagnostics?|finalEnvelopeTrusted|replyAuthority|sessionPatch|routeKind|canEmit|MARION::FINAL::|CHATENGINE_COORDINATOR_ONLY_ACTIVE|nyx\.marion\.final\/|nyx\.marion\.stateSpine\//i;

function isObj(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function safeStr(value, fallback = "") {
  const text = String(value == null ? "" : value).replace(/\s+/g, " ").trim();
  return text || fallback;
}

function escapeHtml(value) {
  return safeStr(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function hasUnsafeText(value) {
  const text = safeStr(value);
  if (!text) return false;
  return UNSAFE_TEXT_PATTERN.test(text);
}

function normalizeLanguageLabel(value, fallback = "EN") {
  const raw = safeStr(value, fallback).toUpperCase();
  if (hasUnsafeText(raw)) return fallback;
  if (raw === "ENG") return "EN";
  if (raw === "SPA" || raw === "ES-419") return "ES";
  if (raw === "FRE" || raw === "FRA") return "FR";
  if (raw.includes("-")) return raw.split("-")[0];
  return raw || fallback;
}

function normalizeDomainLabel(value, fallback = "General") {
  const raw = safeStr(value, fallback);
  if (hasUnsafeText(raw)) return fallback;

  const cleaned = raw
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) return fallback;

  if (/^ai$/i.test(cleaned)) return "AI";
  if (/^cyber$/i.test(cleaned)) return "Cyber";
  if (/^business$/i.test(cleaned)) return "Business";
  if (/^finance$/i.test(cleaned)) return "Finance";
  if (/^law$/i.test(cleaned)) return "Law";
  if (/^psychology$/i.test(cleaned)) return "Psychology";
  if (/^english$/i.test(cleaned)) return "English";
  if (/^general$/i.test(cleaned)) return "General";

  return cleaned.length > 18 ? `${cleaned.slice(0, 15).trim()}…` : cleaned;
}

function compactLabel(label) {
  const text = safeStr(label);
  if (!text || hasUnsafeText(text)) return "";
  return text.length > MAX_LABEL_LENGTH
    ? `${text.slice(0, MAX_TRUNCATED_LABEL_LENGTH).trim()}…`
    : text;
}

function makePassportChipLabel(passport = {}) {
  if (!isObj(passport) || passport.visible === false) {
    return "";
  }

  const providedLabel = safeStr(passport.shortLabel || passport.label);

  // Critical fix:
  // If a provided label exists but contains unsafe/internal text, do not generate
  // a fallback chip. Hide the chip completely so internal metadata cannot trigger
  // a visible UI state.
  if (providedLabel) {
    return compactLabel(providedLabel);
  }

  const source = normalizeLanguageLabel(
    passport.sourceLanguage || passport.activeLanguage || "unknown",
    "UNKNOWN"
  );

  const target = normalizeLanguageLabel(
    passport.targetLanguage || passport.responseLanguage || "en",
    "EN"
  );

  const domain = normalizeDomainLabel(
    passport.activeDomainLabel || passport.activeDomain || "General",
    "General"
  );

  const generatedLabel = passport.fallbackUsed
    ? `${target} fallback · Marion ✓`
    : source && source !== "UNKNOWN" && source !== target
      ? `${source} → ${target} · ${domain} · Marion ✓`
      : `${target} · ${domain} · Marion ✓`;

  return compactLabel(generatedLabel);
}

function getPassportChipState(passport = {}) {
  if (!isObj(passport) || passport.visible === false) return "hidden";
  if (passport.fallbackUsed) return "fallback";

  const handoff = safeStr(passport.handoffStatus).toLowerCase();

  if (handoff === "available" || handoff === "guarded") return "handoff";
  if (handoff === "fallback" || handoff === "partial") return "fallback";
  if (handoff === "complete") return "active";

  return "active";
}

function safeStateClass(state) {
  const normalized = safeStr(state, "hidden").toLowerCase();
  return SAFE_STATES.includes(normalized) ? normalized : "hidden";
}

function buildPassportChipHtml(passport = {}) {
  const label = makePassportChipLabel(passport);
  const state = safeStateClass(getPassportChipState(passport));

  if (!label || state === "hidden" || hasUnsafeText(label)) {
    return "";
  }

  return [
    `<div class="nyx-context-passport-chip nyx-context-passport-chip--${escapeHtml(state)}"`,
    ` data-nyx-context-passport="true"`,
    ` data-authority="marion"`,
    ` data-state="${escapeHtml(state)}"`,
    ` title="${escapeHtml(label)}">`,
    `<span class="nyx-context-passport-dot" aria-hidden="true"></span>`,
    `<span class="nyx-context-passport-label">${escapeHtml(label)}</span>`,
    `</div>`,
  ].join("");
}

function ensureContainer(target) {
  if (!target || typeof document === "undefined") return null;

  if (typeof target === "string") {
    return document.querySelector(target);
  }

  if (target && typeof target.appendChild === "function") {
    return target;
  }

  return null;
}

function renderContextPassportChip(target, passport = {}) {
  const container = ensureContainer(target);
  const html = buildPassportChipHtml(passport);

  if (!container) {
    return {
      ok: false,
      rendered: false,
      reason: "container_missing",
      html,
    };
  }

  if (!html) {
    container.innerHTML = "";
    container.setAttribute("data-nyx-context-passport-visible", "false");

    return {
      ok: true,
      rendered: false,
      reason: "passport_hidden",
      html: "",
    };
  }

  container.innerHTML = html;
  container.setAttribute("data-nyx-context-passport-visible", "true");

  return {
    ok: true,
    rendered: true,
    html,
  };
}

function hideContextPassportChip(target) {
  const container = ensureContainer(target);

  if (!container) {
    return {
      ok: false,
      hidden: false,
      reason: "container_missing",
    };
  }

  container.innerHTML = "";
  container.setAttribute("data-nyx-context-passport-visible", "false");

  return {
    ok: true,
    hidden: true,
  };
}

module.exports = {
  RENDERER_VERSION,
  MAX_LABEL_LENGTH,
  SAFE_STATES,
  safeStr,
  escapeHtml,
  hasUnsafeText,
  normalizeLanguageLabel,
  normalizeDomainLabel,
  compactLabel,
  makePassportChipLabel,
  getPassportChipState,
  safeStateClass,
  buildPassportChipHtml,
  renderContextPassportChip,
  hideContextPassportChip,
};

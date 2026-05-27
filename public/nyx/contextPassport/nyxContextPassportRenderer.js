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
 * - Hides gracefully if metadata is missing.
 * - Keeps chip compact.
 * - Works in browser and test environments.
 */

const RENDERER_VERSION = "nyx.contextPassport.renderer/1.0";

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

  return /runtimeTelemetry|failureSignature|stack trace|TypeError|ReferenceError|SyntaxError|MODULE_NOT_FOUND|Bearer\s+|api[_-]?key|secret|token|finalEnvelopeTrusted|replyAuthority|sessionPatch/i.test(text);
}

function makePassportChipLabel(passport = {}) {
  if (!isObj(passport) || passport.visible === false) {
    return "";
  }

  const existing = safeStr(passport.shortLabel || passport.label);
  if (existing && !hasUnsafeText(existing)) {
    return existing.length > 52 ? `${existing.slice(0, 49).trim()}…` : existing;
  }

  const source = safeStr(passport.sourceLanguage || passport.activeLanguage || "unknown").toUpperCase();
  const target = safeStr(passport.targetLanguage || passport.responseLanguage || "en").toUpperCase();
  const domain = safeStr(passport.activeDomainLabel || passport.activeDomain || "General");

  if (passport.fallbackUsed) {
    return `${target} fallback · Marion ✓`;
  }

  if (source && source !== "UNKNOWN" && source !== target) {
    return `${source} → ${target} · ${domain} · Marion ✓`;
  }

  return `${target} · ${domain} · Marion ✓`;
}

function getPassportChipState(passport = {}) {
  if (!isObj(passport) || passport.visible === false) return "hidden";
  if (passport.fallbackUsed) return "fallback";

  const handoff = safeStr(passport.handoffStatus).toLowerCase();

  if (handoff === "available" || handoff === "guarded") return "handoff";
  if (handoff === "complete") return "active";

  return "active";
}

function buildPassportChipHtml(passport = {}) {
  const label = makePassportChipLabel(passport);
  const state = getPassportChipState(passport);

  if (!label || state === "hidden" || hasUnsafeText(label)) {
    return "";
  }

  return [
    `<div class="nyx-context-passport-chip nyx-context-passport-chip--${escapeHtml(state)}"`,
    ` data-nyx-context-passport="true"`,
    ` data-authority="marion"`,
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
  safeStr,
  escapeHtml,
  hasUnsafeText,
  makePassportChipLabel,
  getPassportChipState,
  buildPassportChipHtml,
  renderContextPassportChip,
  hideContextPassportChip,
};

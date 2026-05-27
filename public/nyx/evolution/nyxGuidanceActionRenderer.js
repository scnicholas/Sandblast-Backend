"use strict";

/**
 * Nyx Guidance Action Renderer
 *
 * Purpose:
 * Builds compact guidance chip HTML.
 *
 * Contract:
 * - No heavy UI.
 * - No automatic backend calls.
 * - Chips are visual/action hints only.
 */

const {
  getGuidanceActions,
  isSafeActionLabel,
} = require("./nyxGuidanceActions");

const NYX_GUIDANCE_ACTION_RENDERER_VERSION = "nyx.evolution.guidanceActionRenderer/1.0";

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

function buildGuidanceActionsHtml(input = {}) {
  const actions = getGuidanceActions(input);

  if (!actions.length) return "";

  return [
    `<div class="nyx-guidance-actions" data-nyx-guidance="true">`,
    actions.map((action) => {
      const label = safeStr(action.label);
      if (!isSafeActionLabel(label)) return "";
      return `<button class="nyx-guidance-chip" type="button" data-action="${escapeHtml(label)}">${escapeHtml(label)}</button>`;
    }).join(""),
    `</div>`,
  ].join("");
}

function ensureContainer(target) {
  if (!target || typeof document === "undefined") return null;
  if (typeof target === "string") return document.querySelector(target);
  if (target && typeof target.appendChild === "function") return target;
  return null;
}

function renderGuidanceActions(target, input = {}) {
  const container = ensureContainer(target);
  const html = buildGuidanceActionsHtml(input);

  if (!container) {
    return {
      ok: false,
      rendered: false,
      reason: "container_missing",
      html,
    };
  }

  container.innerHTML = html;

  return {
    ok: true,
    rendered: Boolean(html),
    html,
  };
}

module.exports = {
  NYX_GUIDANCE_ACTION_RENDERER_VERSION,
  safeStr,
  escapeHtml,
  buildGuidanceActionsHtml,
  renderGuidanceActions,
};

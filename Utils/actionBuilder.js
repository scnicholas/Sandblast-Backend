/**
 * actionBuilder.js
 * OPINTEL v1.0.0
 *
 * Purpose:
 * - Build UI-safe action hints, follow-ups, and action payloads
 * - Keep output bounded and predictable
 * - Support widget/chip/link/year/lane actions
 */

"use strict";

const VERSION = "actionBuilder.opintel.v1.0.0";

function isObject(v) {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function asArray(v) {
  return Array.isArray(v) ? v.slice() : [];
}

function str(v) {
  return typeof v === "string" ? v.trim() : "";
}

function lower(v) {
  return str(v).toLowerCase();
}

function uniqByLabel(items) {
  const seen = new Set();
  return asArray(items).filter((item) => {
    const key = lower(item?.label || item?.title || item?.text || "");
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function buildActionHints(input = {}) {
  const lane = lower(input.lane || input.intent?.lane || "");
  const hints = [];

  if (lane === "music") hints.push("show_year_picker");
  if (lane === "roku") hints.push("show_roku_links");
  if (lane === "radio") hints.push("show_radio_link");
  if (asArray(input.unresolvedAsks || input.memoryWindow?.unresolvedAsks).length) hints.push("resume_unresolved");
  if (input.replyShape === "minimal_clarifier") hints.push("show_clarifier_choices");

  return Array.from(new Set(hints));
}

function buildFollowUps(input = {}) {
  const lane = lower(input.lane || input.intent?.lane || "");
  const shape = lower(input.replyShape || "");
  const items = [];

  if (shape === "minimal_clarifier") {
    const clarifier = str(input.minimalClarifier);
    if (clarifier.includes("Roku")) {
      items.push(
        chip("Roku page", { text: "Roku page" }),
        chip("Live TV lane", { text: "Live TV lane" }),
        chip("News Canada", { text: "News Canada" })
      );
    } else if (clarifier.includes("year")) {
      items.push(
        chip("Pick a year", { text: "Pick a year" }),
        chip("Story moment", { text: "Story moment" }),
        chip("Top 10 list", { text: "Top 10 list" })
      );
    }
  }

  if (!items.length && lane === "music") {
    items.push(
      chip("Pick a year", { text: "Pick a year" }),
      chip("Story moment", { text: "Story moment" })
    );
  }

  if (!items.length && lane === "roku") {
    items.push(
      chip("Open Roku", { text: "Roku" }),
      chip("News Canada", { text: "News Canada" })
    );
  }

  if (!items.length) {
    items.push(
      chip("What next?", { text: "What next?" }),
      chip("Show options", { text: "Show options" })
    );
  }

  return uniqByLabel(items).slice(0, 6);
}

function buildUiActions(input = {}) {
  const lane = lower(input.lane || input.intent?.lane || "");
  const urls = isObject(input.urls) ? input.urls : {};
  const actions = [];

  if (lane === "roku" && str(urls.roku)) {
    actions.push(link("Open SandblastTV", urls.roku));
  }
  if ((lane === "radio" || input.actionHints?.includes?.("show_radio_link")) && str(urls.radio)) {
    actions.push(link("Open Radio", urls.radio));
  }
  if (input.actionHints?.includes?.("show_roku_links") && str(urls.newsCanada)) {
    actions.push(link("Open News Canada", urls.newsCanada));
  }

  return uniqByLabel(actions).slice(0, 4);
}

function chip(label, payload) {
  return {
    type: "chip",
    label: str(label),
    payload: isObject(payload) ? payload : { text: str(label) }
  };
}

function link(label, url) {
  return {
    type: "link",
    label: str(label),
    url: str(url)
  };
}

module.exports = {
  VERSION,
  buildActionHints,
  buildFollowUps,
  buildUiActions
};

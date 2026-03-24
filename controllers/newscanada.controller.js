"use strict";

const SAMPLE_STORIES = [
  {
    title: "News Canada Feature One",
    summary: "Fallback editor’s pick payload so the carousel stays visible while upstream feed work is stabilized.",
    url: "https://www.newscanada.com/",
    issue: "Editor’s Pick",
    categories: ["Canada", "News"]
  },
  {
    title: "News Canada Feature Two",
    summary: "This controller preserves a clean frontend contract by always returning an array of usable story objects.",
    url: "https://www.newscanada.com/",
    issue: "Top Story",
    categories: ["Features", "Editorial"]
  }
];

function safeStr(v) {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}

function cleanText(v) {
  return safeStr(v).replace(/\s+/g, " ").trim();
}

function normalizeItem(item) {
  if (!item || typeof item !== "object") return null;
  const title = cleanText(item.title || item.headline || item.name || "");
  const url = cleanText(item.url || item.link || item.href || "");
  if (!title || !url) return null;
  return {
    title,
    summary: cleanText(item.summary || item.body || item.description || ""),
    url,
    issue: cleanText(item.issue || item.kicker || item.section || "Editor's Pick"),
    categories: Array.isArray(item.categories) ? item.categories.map(cleanText).filter(Boolean).slice(0, 3) : []
  };
}

function normalizePayload(payload) {
  const list = Array.isArray(payload) ? payload
    : Array.isArray(payload && payload.items) ? payload.items
    : Array.isArray(payload && payload.stories) ? payload.stories
    : Array.isArray(payload && payload.data) ? payload.data
    : [];
  return list.map(normalizeItem).filter(Boolean).slice(0, 8);
}

async function getEditorsPicks(req, res) {
  try {
    const upstream = req.app && req.app.locals ? req.app.locals.newsCanadaEditorsPicks : null;
    const normalized = normalizePayload(upstream);
    return res.status(200).json(normalized.length ? normalized : SAMPLE_STORIES);
  } catch (err) {
    console.log("[Sandblast][newsCanadaController:error]", err && (err.stack || err.message || err));
    return res.status(500).json({
      ok: false,
      error: "news_canada_controller_failed",
      detail: cleanText(err && (err.message || err) || "controller failure")
    });
  }
}

function getHealth(req, res) {
  return res.status(200).json({
    ok: true,
    route: "/api/newscanada/editors-picks",
    fallbackStories: SAMPLE_STORIES.length
  });
}

module.exports = { getEditorsPicks, getHealth, normalizePayload };

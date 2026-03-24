const crypto = require("crypto");

function summarize(text, maxLength = 240) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();

  if (!clean) return "";
  if (clean.length <= maxLength) return clean;

  return clean.slice(0, maxLength).replace(/\s+\S*$/, "") + "...";
}

function makeId(url) {
  return crypto.createHash("sha1").update(String(url)).digest("hex");
}

function normalizeArticle(parsed) {
  return {
    id: makeId(parsed.url),
    type: "article",
    source: "News Canada",
    title: parsed.title || "",
    url: parsed.url || "",
    issue: parsed.issue || "",
    categories: Array.isArray(parsed.categories) ? parsed.categories : [],
    body: parsed.body || "",
    summary: summarize(parsed.body || ""),
    mediaAttachments: Array.isArray(parsed.mediaAttachments)
      ? parsed.mediaAttachments
      : [],
    attribution: "(NC) / www.newscanada.com / News Canada",
    scrapedAt: new Date().toISOString()
  };
}

module.exports = {
  normalizeArticle,
  summarize,
  makeId
};

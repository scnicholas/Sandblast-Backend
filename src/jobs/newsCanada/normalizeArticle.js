const { hashString, summarize } = require("./utils");

function normalizeArticle(parsed) {
  return {
    id: hashString(parsed.url),
    type: "article",
    source: "News Canada",
    title: parsed.title || "",
    url: parsed.url || "",
    issue: parsed.issue || "",
    categories: Array.isArray(parsed.categories) ? parsed.categories : [],
    body: parsed.body || "",
    summary: summarize(parsed.body || ""),
    mediaAttachments: Array.isArray(parsed.mediaAttachments) ? parsed.mediaAttachments : [],
    attribution: "(NC) / www.newscanada.com / News Canada",
    scrapedAt: new Date().toISOString()
  };
}

module.exports = { normalizeArticle };

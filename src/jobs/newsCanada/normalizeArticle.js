const { hashString, summarize } = require("./utils");

function normalizeImages(parsed) {
  if (!Array.isArray(parsed.images)) return [];

  const seen = new Set();
  return parsed.images
    .map((image) => {
      if (!image || typeof image !== "object") return null;

      const url = typeof image.url === "string" ? image.url.trim() : "";
      if (!url) return null;

      const alt = typeof image.alt === "string" ? image.alt.trim() : "";
      const caption = typeof image.caption === "string" ? image.caption.trim() : "";
      const key = `${url}::${caption}`;

      if (seen.has(key)) return null;
      seen.add(key);

      return { url, alt, caption };
    })
    .filter(Boolean);
}

function normalizeArticle(parsed) {
  const body = typeof parsed.body === "string" ? parsed.body.trim() : "";
  const images = normalizeImages(parsed);
  const mediaAttachments = Array.isArray(parsed.mediaAttachments) ? parsed.mediaAttachments : [];

  return {
    id: hashString(parsed.url || ""),
    type: "article",
    source: "News Canada",
    title: parsed.title || "",
    url: parsed.url || "",
    issue: parsed.issue || "",
    categories: Array.isArray(parsed.categories) ? parsed.categories : [],
    body,
    summary: summarize(body || parsed.title || ""),
    images,
    mediaAttachments,
    author: parsed.author || "",
    publishedAt: parsed.publishedAt || "",
    heroImage: images[0] || null,
    attribution: "(NC) / www.newscanada.com / News Canada",
    scrapedAt: new Date().toISOString()
  };
}

module.exports = { normalizeArticle };

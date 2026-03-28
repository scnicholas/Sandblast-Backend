const { hashString, summarize, toAbsoluteUrl, cleanText: cleanUtilText, isLikelyArticleUrl } = require("./utils");
const NEWS_CANADA_HOME_URL = "https://www.newscanada.com/home";

function normalizeText(value) {
  return typeof value === "string" ? cleanUtilText(value) : "";
}

function uniqueStrings(values, limit) {
  const seen = new Set();
  const output = [];

  (Array.isArray(values) ? values : []).forEach((value) => {
    const text = normalizeText(value);
    if (!text) return;

    const key = text.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    output.push(text);
  });

  return typeof limit === "number" ? output.slice(0, limit) : output;
}

function normalizeImages(parsed) {
  if (!Array.isArray(parsed.images)) return [];

  const seen = new Set();
  return parsed.images
    .map((image) => {
      if (!image || typeof image !== "object") return null;

      const url = normalizeText(image.url);
      if (!url) return null;

      const alt = normalizeText(image.alt);
      const caption = normalizeText(image.caption);
      const key = `${url}::${caption}`;

      if (seen.has(key)) return null;
      seen.add(key);

      return { url, alt, caption };
    })
    .filter(Boolean);
}

function normalizeMediaAttachments(parsed) {
  if (!Array.isArray(parsed.mediaAttachments)) return [];

  const seen = new Set();
  return parsed.mediaAttachments
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const label = normalizeText(item.label);
      const href = normalizeText(item.href || item.url);
      if (!href) return null;

      const key = `${label}::${href}`;
      if (seen.has(key)) return null;
      seen.add(key);

      return { label, href };
    })
    .filter(Boolean);
}

function normalizeArticle(parsed) {
  const body = normalizeText(parsed.body || parsed.content || parsed.story || parsed.fullText);
  const title = normalizeText(parsed.title);
  const url = normalizeText(toAbsoluteUrl(parsed.url || "", NEWS_CANADA_HOME_URL));
  const images = normalizeImages(parsed);
  const mediaAttachments = normalizeMediaAttachments(parsed);
  const categories = uniqueStrings(parsed.categories, 8);
  const keywords = uniqueStrings(parsed.keywords || parsed.tags, 12);
  const summarySeed = body || normalizeText(parsed.summary) || title;
  const summary = normalizeText(parsed.summary) || summarize(summarySeed);
  const safeUrl = isLikelyArticleUrl(url) ? url : "";
  const heroImage = images[0] || null;
  const publishedAt = normalizeText(parsed.publishedAt || parsed.publishDate);
  const author = normalizeText(parsed.author);
  const issue = normalizeText(parsed.issue || parsed.section || parsed.kicker);

  return {
    id: hashString(safeUrl || `${title}::${publishedAt}`),
    type: "article",
    source: "News Canada",
    title,
    url: safeUrl,
    issue,
    categories,
    keywords,
    body,
    content: body,
    fullText: body,
    summary,
    excerpt: summary,
    images,
    mediaAttachments,
    author,
    publishedAt,
    heroImage,
    image: heroImage ? heroImage.url : "",
    wordCount: body ? body.split(/\s+/).filter(Boolean).length : 0,
    attribution: "(NC) / www.newscanada.com / News Canada",
    scrapedAt: new Date().toISOString()
  };
}

module.exports = { normalizeArticle };

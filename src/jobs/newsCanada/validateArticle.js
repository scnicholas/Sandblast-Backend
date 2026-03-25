const { NEWS_CANADA_CONFIG } = require("./config");

function cleanString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function hasUsefulText(value, minLength = 1) {
  return cleanString(value).length >= minLength;
}

function normalizeArray(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function validateArticle(article) {
  const input = article && typeof article === "object" ? article : {};
  const title = cleanString(input.title);
  const url = cleanString(input.url);
  const body = cleanString(input.body || input.content || input.fullText || input.story);
  const summary = cleanString(input.summary || input.excerpt);
  const categories = normalizeArray(input.categories);
  const keywords = normalizeArray(input.keywords);
  const images = normalizeArray(input.images);
  const primaryImage = cleanString(input.image || input.heroImage?.url || input.heroImage?.src);

  const minBodyLength = Number(NEWS_CANADA_CONFIG.minBodyLength) || 120;
  const errors = [];
  const warnings = [];

  if (!hasUsefulText(title, 3)) errors.push("missing_title");
  if (!hasUsefulText(url, 8)) errors.push("missing_url");
  if (!hasUsefulText(body, 1)) errors.push("missing_body");
  if (hasUsefulText(body, 1) && body.length < minBodyLength) errors.push("thin_body");

  if (!hasUsefulText(summary, 40)) warnings.push("weak_summary");
  if (!categories.length) warnings.push("missing_categories");
  if (!keywords.length) warnings.push("missing_keywords");
  if (!images.length && !primaryImage) warnings.push("missing_images");
  if (!hasUsefulText(input.publishedAt, 4)) warnings.push("missing_publishedAt");
  if (!hasUsefulText(input.author, 2)) warnings.push("missing_author");

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    metrics: {
      titleLength: title.length,
      bodyLength: body.length,
      summaryLength: summary.length,
      categoryCount: categories.length,
      keywordCount: keywords.length,
      imageCount: images.length + (primaryImage ? 1 : 0)
    }
  };
}

module.exports = { validateArticle };

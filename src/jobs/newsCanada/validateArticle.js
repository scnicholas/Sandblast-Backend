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

function cleanUrl(value) {
  const raw = cleanString(value);
  if (!raw) return '';
  try {
    const parsed = new URL(raw);
    if (!/^https?:$/i.test(parsed.protocol)) return '';
    return parsed.toString();
  } catch (_) {
    return '';
  }
}

function clipBody(value, max = 240) {
  const text = cleanString(value).replace(/\s+/g, ' ');
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function validateArticle(article) {
  const input = article && typeof article === "object" ? article : {};
  const title = cleanString(input.title);
  const url = cleanUrl(input.url || input.storyUrl || input.canonicalUrl || input.href || input.link || input.sourceUrl);
  const body = cleanString(input.body || input.content || input.fullText || input.story);
  const summary = cleanString(input.summary || input.excerpt || clipBody(body, 260));
  const categories = normalizeArray(input.categories).map(cleanString).filter(Boolean);
  const keywords = normalizeArray(input.keywords).map(cleanString).filter(Boolean);
  const images = normalizeArray(input.images).filter(Boolean);
  const primaryImage = cleanString(input.image || input.heroImage?.url || input.heroImage?.src);

  const minBodyLength = Math.max(80, Number(NEWS_CANADA_CONFIG.minBodyLength) || 120);
  const errors = [];
  const warnings = [];

  if (!hasUsefulText(title, 3)) errors.push("missing_title");
  if (!hasUsefulText(url, 8)) errors.push("missing_url");
  if (!hasUsefulText(body, 1)) errors.push("missing_body");
  if (hasUsefulText(body, 1) && body.length < minBodyLength) {
    if (summary.length >= 80) warnings.push("thin_body");
    else errors.push("thin_body");
  }

  if (!hasUsefulText(summary, 40)) warnings.push("weak_summary");
  if (!categories.length) warnings.push("missing_categories");
  if (!keywords.length) warnings.push("missing_keywords");
  if (!images.length && !primaryImage) warnings.push("missing_images");
  if (!hasUsefulText(input.publishedAt, 4)) warnings.push("missing_publishedAt");
  if (!hasUsefulText(input.author, 2)) warnings.push("missing_author");

  const qualityScore = [
    hasUsefulText(title, 3),
    hasUsefulText(url, 8),
    hasUsefulText(body, minBodyLength),
    hasUsefulText(summary, 40),
    categories.length > 0,
    keywords.length > 0,
    images.length > 0 || !!primaryImage,
    hasUsefulText(input.author, 2),
    hasUsefulText(input.publishedAt, 4)
  ].filter(Boolean).length;

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
      imageCount: images.length + (primaryImage ? 1 : 0),
      qualityScore
    },
    normalized: {
      title,
      url,
      summary,
      body,
      categories,
      keywords,
      image: primaryImage
    }
  };
}

module.exports = { validateArticle };

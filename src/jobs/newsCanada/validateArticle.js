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

function firstImageUrl(input, images) {
  return cleanString(
    input.image ||
    input.heroImage?.url ||
    input.heroImage?.src ||
    (images[0] && (images[0].url || images[0].src || images[0])) ||
    ""
  );
}

function validateArticle(article) {
  const input = article && typeof article === "object" ? article : {};
  const title = cleanString(input.title || input.headline || input.name || input.label);
  const url = cleanString(input.url || input.storyUrl || input.canonicalUrl || input.link || input.href);
  const body = cleanString(input.body || input.content || input.fullText || input.story || input.text);
  const summary = cleanString(input.summary || input.excerpt || input.description || input.deck);
  const categories = normalizeArray(input.categories || input.tags || input.topics || input.sections);
  const keywords = normalizeArray(input.keywords || input.tags);
  const images = normalizeArray(input.images || input.media || input.gallery);
  const primaryImage = firstImageUrl(input, images);

  const minBodyLength = Number(NEWS_CANADA_CONFIG.minBodyLength) || 120;
  const effectiveText = body || summary;
  const errors = [];
  const warnings = [];

  if (!hasUsefulText(title, 3)) errors.push("missing_title");
  if (!hasUsefulText(url, 8)) warnings.push("missing_url");
  if (!hasUsefulText(effectiveText, 1)) errors.push("missing_body");
  if (hasUsefulText(body, 1) && body.length < minBodyLength) warnings.push("thin_body");
  if (!hasUsefulText(summary, 40)) warnings.push("weak_summary");
  if (!categories.length) warnings.push("missing_categories");
  if (!keywords.length) warnings.push("missing_keywords");
  if (!images.length && !primaryImage) warnings.push("missing_images");
  if (!hasUsefulText(input.publishedAt || input.publishDate || input.date, 4)) warnings.push("missing_publishedAt");
  if (!hasUsefulText(input.author || input.byline || input.creator, 2)) warnings.push("missing_author");

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    normalized: {
      ...input,
      title,
      url,
      summary: summary || cleanString(effectiveText).slice(0, 280),
      body: effectiveText,
      content: cleanString(input.content || effectiveText) || effectiveText,
      fullText: cleanString(input.fullText || effectiveText) || effectiveText,
      categories,
      keywords,
      images,
      image: primaryImage,
      author: cleanString(input.author || input.byline || input.creator || ""),
      publishedAt: cleanString(input.publishedAt || input.publishDate || input.date || "")
    },
    metrics: {
      titleLength: title.length,
      bodyLength: body.length,
      effectiveTextLength: effectiveText.length,
      summaryLength: summary.length,
      categoryCount: categories.length,
      keywordCount: keywords.length,
      imageCount: images.length + (primaryImage ? 1 : 0)
    }
  };
}

module.exports = { validateArticle };

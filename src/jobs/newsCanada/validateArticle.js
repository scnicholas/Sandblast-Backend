const { NEWS_CANADA_CONFIG } = require("./config");

function cleanString(value) {
  if (typeof value === "string") return value.trim();
  if (value == null) return "";
  return String(value).trim();
}

function hasUsefulText(value, minLength = 1) {
  return cleanString(value).length >= minLength;
}

function normalizeArray(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === "string" ? item.trim() : item))
    .filter(Boolean);
}

function dedupeStrings(values = []) {
  return Array.from(
    new Set(
      normalizeArray(values)
        .map((value) => cleanString(value))
        .filter(Boolean)
    )
  );
}

function cleanUrl(value) {
  const raw = cleanString(value);
  if (!raw) return "";
  try {
    const parsed = new URL(raw);
    if (!/^https?:$/i.test(parsed.protocol)) return "";
    parsed.hash = "";
    return parsed.toString();
  } catch (_) {
    return "";
  }
}

function clipBody(value, max = 240) {
  const text = cleanString(value).replace(/\s+/g, " ");
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function looksLikeArticleUrl(url) {
  const clean = cleanUrl(url);
  if (!clean) return false;

  try {
    const parsed = new URL(clean);
    const pathname = parsed.pathname || "";

    if (!/(^|\.)newscanada\.com$/i.test(parsed.hostname)) return false;
    if (/\/(home|editor-picks(?:\/content)?)(?:[/?#]|$)/i.test(pathname)) return false;
    if (/\/(?:[a-z]{2}\/)?[a-z0-9-]+\/content(?:[/?#]|$)/i.test(pathname)) return false;
    if (/\/(?:about(?:-us)?|contact(?:-us)?|privacy(?:-policy)?|terms(?:-of-use)?|subscribe|newsletter)(?:[/?#]|$)/i.test(pathname)) return false;

    if (/\/(?:[a-z]{2}\/)?(?:[^/?#]*-\d{4,}|[a-z0-9-]{20,}|[a-z0-9-]+\/[a-z0-9-]{20,})(?:[/?#]|$)/i.test(pathname)) {
      return true;
    }

    return pathname.split("/").filter(Boolean).length >= 2;
  } catch (_) {
    return false;
  }
}

function buildTextCoverage({ body, summary, title }) {
  const bodyLength = cleanString(body).length;
  const summaryLength = cleanString(summary).length;
  const titleLength = cleanString(title).length;

  return {
    bodyLength,
    summaryLength,
    titleLength,
    hasBody: bodyLength > 0,
    hasSummary: summaryLength > 0,
    hasTitle: titleLength > 0,
    combinedTextLength: bodyLength + summaryLength
  };
}

function validateArticle(article) {
  const input = article && typeof article === "object" ? article : {};

  const title = cleanString(input.title || input.headline || input.name);
  const url = cleanUrl(
    input.url ||
    input.storyUrl ||
    input.canonicalUrl ||
    input.href ||
    input.link ||
    input.sourceUrl
  );

  const body = cleanString(input.body || input.content || input.fullText || input.story || input.articleBody);
  const summary = cleanString(input.summary || input.excerpt || input.description || clipBody(body, 260));

  const categories = dedupeStrings(input.categories || input.topics || input.sections);
  const keywords = dedupeStrings(input.keywords || input.tags || input.labels);
  const images = normalizeArray(input.images).filter(Boolean);
  const primaryImage = cleanString(
    input.image ||
    input.imageUrl ||
    input.heroImage?.url ||
    input.heroImage?.src ||
    input.primaryImage?.url
  );

  const publishedAt = cleanString(input.publishedAt || input.datePublished || input.publishDate || input.issueDate);
  const author = cleanString(input.author || input.byline || input.authorName);

  const configuredMinBodyLength = Number(NEWS_CANADA_CONFIG.minBodyLength);
  const minBodyLength = Math.max(80, Number.isFinite(configuredMinBodyLength) ? configuredMinBodyLength : 120);

  const errors = [];
  const warnings = [];
  const diagnostics = [];
  const coverage = buildTextCoverage({ body, summary, title });

  if (!hasUsefulText(title, 3)) {
    errors.push("missing_title");
    diagnostics.push("title missing or too short");
  }

  if (!hasUsefulText(url, 8)) {
    errors.push("missing_url");
    diagnostics.push("url missing or invalid");
  } else if (!looksLikeArticleUrl(url)) {
    warnings.push("non_article_like_url");
    diagnostics.push("url survived normalization but does not strongly resemble an article path");
  }

  if (!coverage.hasBody && !coverage.hasSummary) {
    errors.push("missing_story_text");
    diagnostics.push("both body and summary are empty");
  } else if (!coverage.hasBody) {
    warnings.push("missing_body");
    diagnostics.push("body missing but summary exists");
  }

  if (coverage.hasBody && coverage.bodyLength < minBodyLength) {
    if (coverage.summaryLength >= 60 || categories.length > 0 || images.length > 0 || !!primaryImage) {
      warnings.push("thin_body");
      diagnostics.push("body is thin but article still has supporting structure");
    } else {
      errors.push("thin_body");
      diagnostics.push("body is thin and article lacks enough supporting structure");
    }
  }

  if (!hasUsefulText(summary, 40)) {
    if (coverage.bodyLength >= minBodyLength) {
      warnings.push("weak_summary");
      diagnostics.push("summary weak but body is sufficient");
    } else if (!coverage.hasBody) {
      errors.push("weak_summary");
      diagnostics.push("summary too weak to carry article without body");
    } else {
      warnings.push("weak_summary");
      diagnostics.push("summary below preferred threshold");
    }
  }

  if (!categories.length) {
    warnings.push("missing_categories");
    diagnostics.push("categories missing");
  }
  if (!keywords.length) {
    warnings.push("missing_keywords");
    diagnostics.push("keywords missing");
  }
  if (!images.length && !primaryImage) {
    warnings.push("missing_images");
    diagnostics.push("images missing");
  }
  if (!hasUsefulText(publishedAt, 4)) {
    warnings.push("missing_publishedAt");
    diagnostics.push("publishedAt missing");
  }
  if (!hasUsefulText(author, 2)) {
    warnings.push("missing_author");
    diagnostics.push("author missing");
  }

  const qualityScore = [
    hasUsefulText(title, 3),
    hasUsefulText(url, 8),
    coverage.bodyLength >= minBodyLength || coverage.summaryLength >= 80,
    coverage.bodyLength >= minBodyLength,
    hasUsefulText(summary, 40),
    categories.length > 0,
    keywords.length > 0,
    images.length > 0 || !!primaryImage,
    hasUsefulText(author, 2),
    hasUsefulText(publishedAt, 4)
  ].filter(Boolean).length;

  const structureScore = [
    coverage.hasTitle,
    coverage.hasBody || coverage.hasSummary,
    looksLikeArticleUrl(url),
    categories.length > 0,
    images.length > 0 || !!primaryImage
  ].filter(Boolean).length;

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    diagnostics,
    metrics: {
      titleLength: coverage.titleLength,
      bodyLength: coverage.bodyLength,
      summaryLength: coverage.summaryLength,
      combinedTextLength: coverage.combinedTextLength,
      categoryCount: categories.length,
      keywordCount: keywords.length,
      imageCount: images.length + (primaryImage ? 1 : 0),
      qualityScore,
      structureScore,
      minBodyLength
    },
    normalized: {
      title,
      url,
      summary,
      body,
      categories,
      keywords,
      image: primaryImage,
      author,
      publishedAt
    }
  };
}

module.exports = { validateArticle };

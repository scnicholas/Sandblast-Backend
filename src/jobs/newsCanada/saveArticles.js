const fs = require("fs");
const path = require("path");
const { NEWS_CANADA_CONFIG } = require("./config");
const { ensureDir, writeJson } = require("./utils");

function cleanString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeArticle(article, index) {
  const input = article && typeof article === "object" ? article : {};
  const title = cleanString(input.title || input.headline || input.name || input.label || `News Canada story ${index + 1}`);
  const body = cleanString(input.body || input.content || input.fullText || input.story || input.text || input.description || "");
  const summary = cleanString(input.summary || input.excerpt || input.description || (body ? body.slice(0, 280) : ""));
  const url = cleanString(input.url || input.storyUrl || input.canonicalUrl || input.link || input.href || "");
  const images = Array.isArray(input.images) ? input.images.filter(Boolean) : [];
  const primaryImage = cleanString(input.image || input.heroImage?.url || input.heroImage?.src || images[0]?.url || images[0]?.src || images[0]);
  const categories = Array.isArray(input.categories) ? input.categories.filter(Boolean) : Array.isArray(input.tags) ? input.tags.filter(Boolean) : [];
  const keywords = Array.isArray(input.keywords) ? input.keywords.filter(Boolean) : Array.isArray(input.tags) ? input.tags.filter(Boolean) : [];
  const resolvedBody = body || summary;

  return {
    ...input,
    id: cleanString(input.id || input.storyId || input.slug || url || `story-${index}`),
    slug: cleanString(input.slug || input.id || input.storyId || ""),
    title,
    summary: summary || title,
    body: resolvedBody,
    content: cleanString(input.content || resolvedBody) || resolvedBody,
    fullText: cleanString(input.fullText || resolvedBody) || resolvedBody,
    url,
    storyUrl: cleanString(input.storyUrl || url),
    canonicalUrl: cleanString(input.canonicalUrl || url),
    issue: cleanString(input.issue || input.kicker || input.section || input.label || "Editor's Pick"),
    categories,
    keywords,
    images,
    image: primaryImage,
    heroImage: primaryImage ? { url: primaryImage, alt: title, caption: "" } : input.heroImage || null,
    author: cleanString(input.author || input.byline || input.creator || ""),
    publishedAt: cleanString(input.publishedAt || input.publishDate || input.date || input.updatedAt || "")
  };
}

function buildPayloadEnvelope(payload) {
  const sourceObject = payload && typeof payload === "object" && !Array.isArray(payload) ? payload : {};
  const incomingArticles = Array.isArray(payload)
    ? payload
    : Array.isArray(sourceObject.articles)
      ? sourceObject.articles
      : Array.isArray(sourceObject.stories)
        ? sourceObject.stories
        : Array.isArray(sourceObject.items)
          ? sourceObject.items
          : Array.isArray(sourceObject.editorsPicks)
            ? sourceObject.editorsPicks
            : [];

  const articles = incomingArticles
    .map((article, index) => normalizeArticle(article, index))
    .filter((article) => article && article.title && (article.url || article.body || article.summary));

  return {
    ...sourceObject,
    source: cleanString(sourceObject.source) || "News Canada",
    generatedAt: new Date().toISOString(),
    count: articles.length,
    articles,
    stories: articles,
    items: articles,
    feed: articles,
    editorsPicks: articles,
    editorPicks: articles,
    slides: articles,
    panels: articles
  };
}

function saveArticles(payload) {
  ensureDir(NEWS_CANADA_CONFIG.outputDir);

  const outFile = path.join(NEWS_CANADA_CONFIG.outputDir, NEWS_CANADA_CONFIG.outputFile);
  const tmpFile = `${outFile}.tmp`;
  const envelope = buildPayloadEnvelope(payload);

  writeJson(tmpFile, envelope);
  fs.renameSync(tmpFile, outFile);

  return outFile;
}

module.exports = { saveArticles, buildPayloadEnvelope };

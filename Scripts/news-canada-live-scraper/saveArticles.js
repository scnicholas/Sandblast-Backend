"use strict";

/**
 * News Canada scraper sibling module.
 *
 * This file must remain beside config.js, utils.js, and scrapeNewsCanada.js.
 */

const fs = require("fs");
const path = require("path");
const { NEWS_CANADA_CONFIG } = require("./config");
const { ensureDir, writeJson } = require("./utils");

function cleanString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeArticle(article, index) {
  const input = article && typeof article === "object" && !Array.isArray(article) ? article : {};
  const title = cleanString(input.title || input.headline || input.name || input.label || `News Canada story ${index + 1}`);
  const body = cleanString(input.body || input.content || input.fullText || input.story || input.text || input.description || "");
  const summary = cleanString(input.summary || input.excerpt || input.description || (body ? body.slice(0, 280) : ""));
  const url = cleanString(input.url || input.storyUrl || input.canonicalUrl || input.link || input.href || "");
  const images = Array.isArray(input.images) ? input.images.filter(Boolean) : [];
  const heroSource = input.heroImage && typeof input.heroImage === "object" ? input.heroImage : {};
  const firstImage = images[0] && typeof images[0] === "object" ? images[0] : {};
  const primaryImage = cleanString(input.image || heroSource.url || heroSource.src || firstImage.url || firstImage.src || images[0]);
  const categories = Array.isArray(input.categories)
    ? input.categories.filter(Boolean)
    : Array.isArray(input.tags)
      ? input.tags.filter(Boolean)
      : [];
  const keywords = Array.isArray(input.keywords)
    ? input.keywords.filter(Boolean)
    : Array.isArray(input.tags)
      ? input.tags.filter(Boolean)
      : [];
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
    heroImage: primaryImage ? { url: primaryImage, alt: title, caption: "" } : (input.heroImage || null),
    author: cleanString(input.author || input.byline || input.creator || ""),
    publishedAt: cleanString(input.publishedAt || input.publishDate || input.date || input.updatedAt || "")
  };
}

function extractArticles(payload) {
  if (Array.isArray(payload)) return payload;
  const source = payload && typeof payload === "object" ? payload : {};
  for (const key of ["articles", "stories", "items", "editorsPicks", "editorPicks", "feed", "slides", "panels"]) {
    if (Array.isArray(source[key])) return source[key];
  }
  return [];
}

function buildPayloadEnvelope(payload) {
  const sourceObject = payload && typeof payload === "object" && !Array.isArray(payload) ? payload : {};
  const articles = extractArticles(payload)
    .map((article, index) => normalizeArticle(article, index))
    .filter((article) => article.title && (article.url || article.body || article.summary));

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

function atomicReplace(tempFile, outputFile) {
  try {
    fs.renameSync(tempFile, outputFile);
    return;
  } catch (error) {
    if (!error || !["EEXIST", "EPERM", "EACCES"].includes(error.code)) throw error;
  }

  try {
    if (fs.existsSync(outputFile)) fs.unlinkSync(outputFile);
    fs.renameSync(tempFile, outputFile);
  } catch (error) {
    try { if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile); } catch (_) {}
    throw error;
  }
}

function saveArticles(payload) {
  if (!NEWS_CANADA_CONFIG || !NEWS_CANADA_CONFIG.outputDir || !NEWS_CANADA_CONFIG.outputFile) {
    throw new Error("NEWS_CANADA_CONFIG.outputDir and outputFile are required.");
  }

  ensureDir(NEWS_CANADA_CONFIG.outputDir);
  const outputFile = path.join(NEWS_CANADA_CONFIG.outputDir, NEWS_CANADA_CONFIG.outputFile);
  const tempFile = `${outputFile}.${process.pid}.${Date.now()}.tmp`;
  const envelope = buildPayloadEnvelope(payload);

  writeJson(tempFile, envelope);
  atomicReplace(tempFile, outputFile);
  return outputFile;
}

module.exports = {
  normalizeArticle,
  buildPayloadEnvelope,
  saveArticles
};

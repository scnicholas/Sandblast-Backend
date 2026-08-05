"use strict";

const fs = require("fs");
const path = require("path");

const { NEWS_CANADA_CONFIG } = require("./config");
const { ensureDir, writeJson } = require("./utils");

const VERSION = "newsCanada.saveArticles/2.0-conflict-free-atomic";

function isObject(value) {
  return Boolean(
    value &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

function cleanString(value) {
  if (value === null || value === undefined) return "";
  try {
    return String(value)
      .replace(/[\u0000-\u001f\u007f]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  } catch (_) {
    return "";
  }
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) return [];
  const output = [];
  const seen = new Set();

  for (const item of value) {
    const normalized = cleanString(
      isObject(item)
        ? item.name || item.label || item.title || item.value || item.slug
        : item
    );
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(normalized);
  }

  return output;
}

function imageUrlFrom(value) {
  if (typeof value === "string") return cleanString(value);
  if (!isObject(value)) return "";
  return cleanString(value.url || value.src || value.href || value.link);
}

function normalizeImages(value) {
  if (!Array.isArray(value)) return [];
  const output = [];
  const seen = new Set();

  for (const item of value) {
    const url = imageUrlFrom(item);
    if (!url || seen.has(url)) continue;
    seen.add(url);

    if (isObject(item)) {
      output.push({ ...item, url, src: cleanString(item.src || url) });
    } else {
      output.push(url);
    }
  }

  return output;
}

function firstImageUrl(input, images) {
  const candidates = [
    input.image,
    input.primaryImage,
    input.thumbnail,
    input.heroImage,
    input.enclosure,
    images[0]
  ];

  for (const candidate of candidates) {
    const url = imageUrlFrom(candidate);
    if (url) return url;
  }
  return "";
}

function normalizeArticle(article, index) {
  const input = isObject(article) ? article : {};

  const title = cleanString(
    input.title ||
    input.headline ||
    input.name ||
    input.label ||
    `News Canada story ${index + 1}`
  );

  const body = cleanString(
    input.body ||
    input.content ||
    input.fullText ||
    input.story ||
    input.text ||
    input.description
  );

  const summary = cleanString(
    input.summary ||
    input.excerpt ||
    input.description ||
    (body ? body.slice(0, 280) : "")
  );

  const url = cleanString(
    input.url ||
    input.storyUrl ||
    input.canonicalUrl ||
    input.link ||
    input.href
  );

  const images = normalizeImages(
    Array.isArray(input.images)
      ? input.images
      : [input.image, input.heroImage, input.thumbnail, input.enclosure]
  );

  const primaryImage = firstImageUrl(input, images);

  const categories = normalizeStringArray(
    Array.isArray(input.categories) ? input.categories : input.tags
  );

  const keywords = normalizeStringArray(
    Array.isArray(input.keywords) ? input.keywords : input.tags
  );

  const resolvedBody = body || summary || title;

  const id = cleanString(
    input.id ||
    input.storyId ||
    input.guid ||
    input.slug ||
    url ||
    `story-${index + 1}`
  );

  const slug = cleanString(input.slug || input.id || input.storyId);

  const normalizedHeroImage = primaryImage
    ? {
        ...(isObject(input.heroImage) ? input.heroImage : {}),
        url: primaryImage,
        src: cleanString(
          isObject(input.heroImage)
            ? input.heroImage.src || primaryImage
            : primaryImage
        ),
        alt: cleanString(
          isObject(input.heroImage)
            ? input.heroImage.alt || title
            : title
        ),
        caption: cleanString(
          isObject(input.heroImage) ? input.heroImage.caption : ""
        )
      }
    : (isObject(input.heroImage) ? input.heroImage : null);

  return {
    ...input,
    id,
    slug,
    title,
    summary: summary || title,
    body: resolvedBody,
    content: cleanString(input.content || resolvedBody) || resolvedBody,
    fullText: cleanString(input.fullText || resolvedBody) || resolvedBody,
    url,
    storyUrl: cleanString(input.storyUrl || url),
    canonicalUrl: cleanString(input.canonicalUrl || url),
    issue: cleanString(
      input.issue ||
      input.kicker ||
      input.section ||
      input.label ||
      "Editor's Pick"
    ),
    categories,
    keywords,
    images,
    image: primaryImage,
    heroImage: normalizedHeroImage,
    author: cleanString(input.author || input.byline || input.creator),
    publishedAt: cleanString(
      input.publishedAt ||
      input.publishDate ||
      input.pubDate ||
      input.isoDate ||
      input.date ||
      input.updatedAt
    )
  };
}

function extractIncomingArticles(payload) {
  if (Array.isArray(payload)) return payload;
  const source = isObject(payload) ? payload : {};
  const candidates = [
    source.articles,
    source.stories,
    source.items,
    source.editorsPicks,
    source.editorPicks,
    source.feed,
    source.slides,
    source.panels
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate;
  }
  return [];
}

function buildPayloadEnvelope(payload) {
  const sourceObject = isObject(payload) ? payload : {};
  const articles = extractIncomingArticles(payload)
    .filter((article) => isObject(article))
    .map((article, index) => normalizeArticle(article, index))
    .filter(
      (article) =>
        Boolean(
          article &&
          article.title &&
          (article.url || article.body || article.summary)
        )
    );

  const generatedAt = new Date().toISOString();

  return {
    ...sourceObject,
    source: cleanString(sourceObject.source) || "News Canada",
    generatedAt,
    count: articles.length,
    articles,
    stories: articles,
    items: articles,
    feed: articles,
    editorsPicks: articles,
    editorPicks: articles,
    slides: articles,
    panels: articles,
    meta: {
      ...(isObject(sourceObject.meta) ? sourceObject.meta : {}),
      version: VERSION,
      generatedAt,
      count: articles.length
    }
  };
}

function validateConfig() {
  const config = isObject(NEWS_CANADA_CONFIG) ? NEWS_CANADA_CONFIG : {};
  const outputDir = cleanString(config.outputDir);
  const outputFile = cleanString(config.outputFile);

  if (!outputDir) {
    throw new Error("NEWS_CANADA_CONFIG.outputDir is required.");
  }

  if (!outputFile) {
    throw new Error("NEWS_CANADA_CONFIG.outputFile is required.");
  }

  if (path.basename(outputFile) !== outputFile) {
    throw new Error(
      "NEWS_CANADA_CONFIG.outputFile must be a filename, not a path."
    );
  }

  return { outputDir, outputFile };
}

function replaceFileAtomic(temporaryFile, outputFile) {
  try {
    fs.renameSync(temporaryFile, outputFile);
    return;
  } catch (error) {
    const code = cleanString(error && error.code);
    if (code !== "EEXIST" && code !== "EPERM" && code !== "EACCES") {
      throw error;
    }
  }

  fs.rmSync(outputFile, { force: true });
  fs.renameSync(temporaryFile, outputFile);
}

function saveArticles(payload) {
  const { outputDir, outputFile } = validateConfig();
  ensureDir(outputDir);

  const outFile = path.join(outputDir, outputFile);
  const temporaryFile =
    `${outFile}.tmp-${process.pid}-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 10)}`;

  const envelope = buildPayloadEnvelope(payload);

  try {
    writeJson(temporaryFile, envelope);
    replaceFileAtomic(temporaryFile, outFile);
  } catch (error) {
    try {
      fs.rmSync(temporaryFile, { force: true });
    } catch (_) {}
    throw error;
  }

  return outFile;
}

module.exports = {
  VERSION,
  saveArticles,
  buildPayloadEnvelope,
  normalizeArticle,
  extractIncomingArticles
};

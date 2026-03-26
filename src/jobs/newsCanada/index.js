const path = require("path");
const { NEWS_CANADA_CONFIG } = require("./config");
const { createLogger } = require("./logger");
const { fetchHomePage } = require("./fetchHome");
const { extractEditorsPicksLinks } = require("./fetchEditorsPicks");
const { fetchArticlePage, parseArticle } = require("./parseArticle");
const { normalizeArticle } = require("./normalizeArticle");
const { validateArticle } = require("./validateArticle");
const { saveArticles } = require("./saveArticles");
const { saveHtmlSnapshot } = require("./snapshot");
const { ensureDir, hashString } = require("./utils");

const FEED_VERSION = "editors-picks.v2.stable-feed";
const FEED_SOURCE = "News Canada";
const FEED_TYPE = "editors-picks";

function safeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function firstNonEmpty(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return "";
}

function cleanArray(values) {
  if (!Array.isArray(values)) {
    return [];
  }

  return values
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter(Boolean);
}

function pickPrimaryImage(article) {
  return firstNonEmpty(
    article.image,
    article.heroImage && article.heroImage.url,
    Array.isArray(article.images) && article.images[0] && article.images[0].url
  );
}

function ensureStoryBody(article) {
  return firstNonEmpty(
    article.fullText,
    article.content,
    article.body,
    article.summary,
    article.excerpt
  );
}

function ensureStorySummary(article) {
  return firstNonEmpty(
    article.summary,
    article.excerpt,
    article.body,
    article.content,
    article.fullText
  );
}

function computeWordCount(text, fallback) {
  if (Number.isFinite(fallback) && fallback > 0) {
    return fallback;
  }

  if (!text) {
    return 0;
  }

  return text.split(/\s+/).filter(Boolean).length;
}

function normalizeForStableFeed(article) {
  const categories = cleanArray(article.categories);
  const keywords = cleanArray(article.keywords);
  const body = ensureStoryBody(article);
  const summary = ensureStorySummary(article);
  const image = pickPrimaryImage(article);
  const publishedAt = safeText(article.publishedAt) || safeText(article.scrapedAt) || new Date().toISOString();

  return {
    id: safeText(article.id),
    type: safeText(article.type) || "article",
    source: safeText(article.source) || FEED_SOURCE,
    title: safeText(article.title) || "Untitled story",
    url: safeText(article.url),
    issue: safeText(article.issue),
    categories,
    keywords,
    body,
    content: firstNonEmpty(article.content, body),
    fullText: firstNonEmpty(article.fullText, body),
    summary,
    excerpt: firstNonEmpty(article.excerpt, summary),
    images: Array.isArray(article.images) ? article.images : image ? [{ url: image, alt: safeText(article.title), caption: "" }] : [],
    mediaAttachments: Array.isArray(article.mediaAttachments) ? article.mediaAttachments : [],
    author: safeText(article.author) || FEED_SOURCE,
    publishedAt,
    heroImage: article.heroImage && article.heroImage.url
      ? article.heroImage
      : image
        ? { url: image, alt: safeText(article.title), caption: "" }
        : null,
    image,
    wordCount: computeWordCount(body, article.wordCount),
    attribution: safeText(article.attribution) || "(NC) / www.newscanada.com / News Canada",
    scrapedAt: safeText(article.scrapedAt) || new Date().toISOString(),
    validation: article.validation || {
      ok: true,
      errors: [],
      warnings: [],
      metrics: {
        titleLength: safeText(article.title).length,
        bodyLength: body.length,
        summaryLength: summary.length,
        categoryCount: categories.length,
        keywordCount: keywords.length,
        imageCount: image ? 1 : 0
      }
    }
  };
}

async function runNewsCanadaEditorsPicksIngest() {
  const logger = createLogger(NEWS_CANADA_CONFIG.logPrefix);
  ensureDir(NEWS_CANADA_CONFIG.outputDir);
  ensureDir(NEWS_CANADA_CONFIG.snapshotDir);

  logger.info("Starting ingest");

  const home = await fetchHomePage(logger);
  const homeSnapshot = saveHtmlSnapshot({
    snapshotDir: NEWS_CANADA_CONFIG.snapshotDir,
    label: "home",
    url: home.url,
    html: home.html
  });

  logger.info("Saved homepage snapshot", homeSnapshot);

  const links = extractEditorsPicksLinks(home.html);
  logger.info(`Found ${links.length} Editor's Picks candidates`);

  const articles = [];
  const failures = [];
  const seenArticleIds = new Set();

  for (const link of links) {
    try {
      logger.info("Fetching article", link.url);
      const articleHtml = await fetchArticlePage(link.url, logger);

      const articleSnapshot = saveHtmlSnapshot({
        snapshotDir: NEWS_CANADA_CONFIG.snapshotDir,
        label: `article-${link.title}`,
        url: link.url,
        html: articleHtml
      });

      logger.debug("Saved article snapshot", articleSnapshot);

      const parsed = parseArticle(articleHtml, link.url);
      const normalized = normalizeArticle(parsed);
      const validation = validateArticle(normalized);

      if (!validation.ok) {
        logger.warn("Skipping invalid article", link.url, validation.errors.join(","));
        failures.push({
          url: link.url,
          title: link.title,
          reason: validation.errors
        });
        continue;
      }

      if (seenArticleIds.has(normalized.id)) {
        logger.warn("Skipping duplicate article", link.url);
        continue;
      }

      const stableArticle = normalizeForStableFeed({
        ...normalized,
        validation
      });

      if (!stableArticle.id || !stableArticle.title || !stableArticle.url) {
        logger.warn("Skipping incomplete normalized article", link.url);
        failures.push({
          url: link.url,
          title: link.title,
          reason: ["incomplete_normalized_article"]
        });
        continue;
      }

      seenArticleIds.add(stableArticle.id);
      articles.push(stableArticle);
    } catch (error) {
      logger.error("Article ingest failed", link.url, error.message);
      failures.push({
        url: link.url,
        title: link.title,
        reason: [error.message]
      });
    }
  }

  const generatedAt = new Date().toISOString();
  const listingUrl = safeText(home.url) || "https://www.newscanada.com/home";

  const payload = {
    source: FEED_SOURCE,
    listingUrl,
    generatedAt,
    version: FEED_VERSION,
    count: articles.length,
    availableStories: articles.length,
    rejectedCount: failures.length,
    type: FEED_TYPE,
    runId: hashString(`${Date.now()}-${Math.random()}`),
    counts: {
      candidates: links.length,
      saved: articles.length,
      failed: failures.length
    },
    paths: {
      snapshotDir: path.relative(process.cwd(), NEWS_CANADA_CONFIG.snapshotDir)
    },
    failures,
    articles
  };

  const outFile = saveArticles(payload);
  logger.info(`Saved ${articles.length} articles`, outFile);

  return {
    outFile,
    payload
  };
}

if (require.main === module) {
  runNewsCanadaEditorsPicksIngest()
    .then(({ outFile, payload }) => {
      console.log("\\nDone:", outFile);
      console.log("Saved:", payload.counts.saved, "Failed:", payload.counts.failed);
      process.exit(0);
    })
    .catch((error) => {
      console.error("Fatal ingest failure");
      console.error(error);
      process.exit(1);
    });
}

module.exports = { runNewsCanadaEditorsPicksIngest, normalizeForStableFeed };

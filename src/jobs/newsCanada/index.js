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

      seenArticleIds.add(normalized.id);
      articles.push(normalized);
    } catch (error) {
      logger.error("Article ingest failed", link.url, error.message);
      failures.push({
        url: link.url,
        title: link.title,
        reason: [error.message]
      });
    }
  }

  const payload = {
    source: "News Canada",
    type: "editors-picks",
    generatedAt: new Date().toISOString(),
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
      console.log("\nDone:", outFile);
      console.log("Saved:", payload.counts.saved, "Failed:", payload.counts.failed);
      process.exit(0);
    })
    .catch((error) => {
      console.error("Fatal ingest failure");
      console.error(error);
      process.exit(1);
    });
}

module.exports = { runNewsCanadaEditorsPicksIngest };

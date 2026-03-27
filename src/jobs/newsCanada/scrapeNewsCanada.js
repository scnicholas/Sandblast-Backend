const { NEWS_CANADA_CONFIG } = require('./config');
const { fetchWithRetry } = require('./http');
const { createLogger } = require('./logger');
const { extractEditorsPicksLinks } = require('./fetchEditorsPicks');
const { fetchArticlePage, parseArticle } = require('./parseArticle');
const { normalizeArticle } = require('./normalizeArticle');
const { validateArticle } = require('./validateArticle');
const { saveArticles } = require('./saveArticles');

async function scrapeNewsCanada(options = {}) {
  const logger = options.logger || createLogger('[news-canada-scrape]');
  const maxStories = Number.isFinite(options.maxStories) ? options.maxStories : NEWS_CANADA_CONFIG.maxStories;

  logger.info('Fetching Editor\'s Picks page', { url: NEWS_CANADA_CONFIG.editorsPicksUrl, maxStories });

  const listing = await fetchWithRetry(NEWS_CANADA_CONFIG.editorsPicksUrl, {
    retries: NEWS_CANADA_CONFIG.retries,
    retryDelayMs: NEWS_CANADA_CONFIG.retryDelayMs,
    timeoutMs: NEWS_CANADA_CONFIG.timeoutMs,
    userAgent: NEWS_CANADA_CONFIG.userAgent,
    logger
  });

  const picks = extractEditorsPicksLinks(listing.data, logger).slice(0, maxStories);
  logger.info('Editor\'s Picks extracted', { count: picks.length, picks });

  const articles = [];
  const rejected = [];

  for (const pick of picks) {
    const articleLogger = logger.child(`[${pick.position || '?'}]`);
    try {
      articleLogger.info('Fetching article', { title: pick.title, url: pick.url });
      const html = await fetchArticlePage(pick.url, articleLogger);
      const parsed = parseArticle(html, pick.url);
      const normalized = normalizeArticle({ ...pick, ...parsed, url: pick.url, title: parsed.title || pick.title });
      const validation = validateArticle(normalized);

      const result = {
        ...normalized,
        validation
      };

      if (!validation.ok) {
        rejected.push({ url: pick.url, title: pick.title, validation });
        articleLogger.warn('Rejected article', { title: pick.title, url: pick.url, validation });
        continue;
      }

      articles.push(result);
      articleLogger.info('Accepted article', {
        title: result.title,
        url: result.url,
        wordCount: result.wordCount,
        imageCount: Array.isArray(result.images) ? result.images.length : 0,
        warningCount: Array.isArray(validation.warnings) ? validation.warnings.length : 0
      });
    } catch (error) {
      rejected.push({ url: pick.url, title: pick.title, error: { message: error.message, code: error.code || '' } });
      articleLogger.error('Article scrape failed', { title: pick.title, url: pick.url, error });
    }
  }

  const payload = {
    source: 'News Canada',
    listingUrl: NEWS_CANADA_CONFIG.editorsPicksUrl,
    generatedAt: new Date().toISOString(),
    count: articles.length,
    rejectedCount: rejected.length,
    articles,
    rejected
  };

  const outFile = saveArticles(payload);
  logger.info('Scrape complete', { outFile, count: articles.length, rejectedCount: rejected.length });

  return { outFile, payload };
}

if (require.main === module) {
  scrapeNewsCanada().then(({ outFile, payload }) => {
    console.log(JSON.stringify({ ok: true, outFile, count: payload.count, rejectedCount: payload.rejectedCount }, null, 2));
  }).catch((error) => {
    console.error(JSON.stringify({ ok: false, message: error.message, code: error.code || '' }, null, 2));
    process.exitCode = 1;
  });
}

module.exports = { scrapeNewsCanada };

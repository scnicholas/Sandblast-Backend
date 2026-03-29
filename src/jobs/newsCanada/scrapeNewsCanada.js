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

  const listingHtml = typeof listing?.data === 'string' ? listing.data : '';
  logger.info('Editor\'s Picks page fetched', {
    url: NEWS_CANADA_CONFIG.editorsPicksUrl,
    htmlLength: listingHtml.length,
    status: listing?.status || undefined
  });

  const picks = extractEditorsPicksLinks(listingHtml, logger).slice(0, maxStories);
  logger.info('Editor\'s Picks extracted', {
    count: picks.length,
    requestedMaxStories: maxStories,
    picks: picks.map((pick) => ({
      position: pick.position,
      title: pick.title,
      url: pick.url,
      score: pick.score,
      rescued: Boolean(pick.rescued)
    }))
  });

  if (picks.length === 0) {
    logger.warn('No Editor\'s Picks links survived extraction', {
      url: NEWS_CANADA_CONFIG.editorsPicksUrl,
      htmlLength: listingHtml.length
    });
  }

  const articles = [];
  const rejected = [];

  for (const pick of picks) {
    const articleLogger = logger.child(`[${pick.position || '?'}]`);
    try {
      articleLogger.info('Fetching article', { title: pick.title, url: pick.url, score: pick.score, rescued: Boolean(pick.rescued) });
      const html = await fetchArticlePage(pick.url, articleLogger);
      articleLogger.debug('Article HTML fetched', {
        url: pick.url,
        htmlLength: typeof html === 'string' ? html.length : 0
      });

      const parsed = parseArticle(html, pick.url);
      const diagnostics = parsed.diagnostics || {};
      articleLogger.debug('Article parsed', {
        title: parsed.title || pick.title,
        url: pick.url,
        diagnostics
      });

      const { diagnostics: _diagnostics, ...parsedArticle } = parsed;
      const normalized = normalizeArticle({ ...pick, ...parsedArticle, url: pick.url, title: parsedArticle.title || pick.title });
      articleLogger.debug('Article normalized', {
        title: normalized.title,
        url: normalized.url,
        canonicalUrl: normalized.canonicalUrl,
        wordCount: normalized.wordCount,
        imageCount: Array.isArray(normalized.images) ? normalized.images.length : 0,
        categoryCount: Array.isArray(normalized.categories) ? normalized.categories.length : 0,
        summaryLength: String(normalized.summary || '').length,
        bodyLength: String(normalized.body || '').length
      });

      const validation = validateArticle(normalized);
      articleLogger.debug('Article validation complete', {
        title: normalized.title,
        url: normalized.url,
        validation
      });

      const result = {
        ...normalized,
        validation
      };

      if (!validation.ok) {
        rejected.push({
          url: pick.url,
          title: pick.title,
          validation,
          diagnostics,
          extraction: {
            position: pick.position,
            score: pick.score,
            rescued: Boolean(pick.rescued)
          }
        });
        articleLogger.warn('Rejected article', {
          title: pick.title,
          url: pick.url,
          validation,
          diagnostics,
          extraction: {
            position: pick.position,
            score: pick.score,
            rescued: Boolean(pick.rescued)
          }
        });
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
      rejected.push({
        url: pick.url,
        title: pick.title,
        error: { message: error.message, code: error.code || '' },
        extraction: {
          position: pick.position,
          score: pick.score,
          rescued: Boolean(pick.rescued)
        }
      });
      articleLogger.error('Article scrape failed', {
        title: pick.title,
        url: pick.url,
        extraction: {
          position: pick.position,
          score: pick.score,
          rescued: Boolean(pick.rescued)
        },
        error
      });
    }
  }

  logger.info('Scrape classification summary', {
    acceptedCount: articles.length,
    rejectedCount: rejected.length,
    acceptedTitles: articles.map((article) => article.title),
    rejectedTitles: rejected.map((article) => ({
      title: article.title,
      url: article.url,
      reason: article.validation?.errors || article.error || []
    }))
  });

  const payload = {
    source: 'News Canada',
    listingUrl: NEWS_CANADA_CONFIG.editorsPicksUrl,
    generatedAt: new Date().toISOString(),
    count: articles.length,
    rejectedCount: rejected.length,
    articles,
    rejected,
    diagnostics: {
      requestedMaxStories: maxStories,
      extractedPickCount: picks.length,
      listingHtmlLength: listingHtml.length
    }
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

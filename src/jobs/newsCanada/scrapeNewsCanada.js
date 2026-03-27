const { NEWS_CANADA_CONFIG } = require('./config');
const { fetchWithRetry } = require('./http');
const { createLogger } = require('./logger');
const { extractEditorsPicksLinks } = require('./fetchEditorsPicks');
const { fetchArticlePage, parseArticle } = require('./parseArticle');
const { normalizeArticle } = require('./normalizeArticle');
const { validateArticle } = require('./validateArticle');
const { saveArticles } = require('./saveArticles');

function summarizeListingHtml(html) {
  const text = typeof html === 'string' ? html : '';
  const lower = text.toLowerCase();
  const anchorMatches = text.match(/<a\b/gi) || [];

  return {
    bytes: Buffer.byteLength(text || '', 'utf8'),
    anchorCount: anchorMatches.length,
    hasEditorsPicksText: lower.includes("editor's picks") || lower.includes('editors picks'),
    looksLikeHtml: /<html|<body|<main|<article/i.test(text),
    signature: text.slice(0, 160).replace(/\s+/g, ' ').trim()
  };
}

function createStageCounters() {
  return {
    listing: {
      fetched: 0,
      extractReturned: 0
    },
    articles: {
      attempted: 0,
      fetched: 0,
      parsed: 0,
      normalized: 0,
      validated: 0,
      accepted: 0,
      rejected: 0,
      failed: 0
    }
  };
}

async function scrapeNewsCanada(options = {}) {
  const logger = options.logger || createLogger('[news-canada-scrape]');
  const maxStories = Number.isFinite(options.maxStories) ? options.maxStories : NEWS_CANADA_CONFIG.maxStories;
  const counters = createStageCounters();

  logger.info('Fetching Editor\'s Picks page', { url: NEWS_CANADA_CONFIG.editorsPicksUrl, maxStories });

  const listing = await fetchWithRetry(NEWS_CANADA_CONFIG.editorsPicksUrl, {
    retries: NEWS_CANADA_CONFIG.retries,
    retryDelayMs: NEWS_CANADA_CONFIG.retryDelayMs,
    timeoutMs: NEWS_CANADA_CONFIG.timeoutMs,
    userAgent: NEWS_CANADA_CONFIG.userAgent,
    logger
  });
  counters.listing.fetched += 1;

  const listingHtml = typeof listing?.data === 'string' ? listing.data : '';
  const listingDiagnostics = summarizeListingHtml(listingHtml);

  logger.info('Listing page fetched', {
    url: NEWS_CANADA_CONFIG.editorsPicksUrl,
    ...listingDiagnostics
  });

  if (!listingDiagnostics.looksLikeHtml || listingDiagnostics.bytes === 0 || listingDiagnostics.anchorCount < 6) {
    const error = new Error('news_canada_listing_unusable');
    error.code = 'NEWS_CANADA_LISTING_UNUSABLE';
    error.meta = listingDiagnostics;
    throw error;
  }

  const picks = extractEditorsPicksLinks(listingHtml, logger).slice(0, maxStories);
  counters.listing.extractReturned = picks.length;
  logger.info('Editor\'s Picks extracted', {
    count: picks.length,
    picks: picks.map((pick) => ({
      position: pick.position,
      score: pick.score,
      rescued: !!pick.rescued,
      title: pick.title,
      url: pick.url
    }))
  });

  const articles = [];
  const rejected = [];

  for (const pick of picks) {
    counters.articles.attempted += 1;
    const articleLogger = typeof logger.child === 'function' ? logger.child(`[${pick.position || '?'}]`) : logger;

    try {
      articleLogger.info('Fetching article', { title: pick.title, url: pick.url });
      const html = await fetchArticlePage(pick.url, articleLogger);
      counters.articles.fetched += 1;

      const parsed = parseArticle(html, pick.url);
      counters.articles.parsed += 1;
      articleLogger.info('Article parsed', {
        title: parsed.title || pick.title,
        url: pick.url,
        bodyLength: String(parsed.body || '').length,
        imageCount: Array.isArray(parsed.images) ? parsed.images.length : 0,
        categoryCount: Array.isArray(parsed.categories) ? parsed.categories.length : 0,
        attachmentCount: Array.isArray(parsed.mediaAttachments) ? parsed.mediaAttachments.length : 0,
        hasPublishedAt: !!parsed.publishedAt,
        hasAuthor: !!parsed.author
      });

      const normalized = normalizeArticle({ ...pick, ...parsed, url: pick.url, title: parsed.title || pick.title });
      counters.articles.normalized += 1;

      const validation = validateArticle(normalized);
      counters.articles.validated += 1;

      const result = {
        ...normalized,
        validation
      };

      if (!validation.ok) {
        counters.articles.rejected += 1;
        rejected.push({
          stage: 'validation',
          url: pick.url,
          title: pick.title,
          validation
        });
        articleLogger.warn('Rejected article', {
          title: pick.title,
          url: pick.url,
          errors: Array.isArray(validation.errors) ? validation.errors : [],
          warnings: Array.isArray(validation.warnings) ? validation.warnings : []
        });
        continue;
      }

      counters.articles.accepted += 1;
      articles.push(result);
      articleLogger.info('Accepted article', {
        title: result.title,
        url: result.url,
        wordCount: result.wordCount,
        imageCount: Array.isArray(result.images) ? result.images.length : 0,
        warningCount: Array.isArray(validation.warnings) ? validation.warnings.length : 0
      });
    } catch (error) {
      counters.articles.failed += 1;
      rejected.push({
        stage: 'fetch_or_parse',
        url: pick.url,
        title: pick.title,
        error: { message: error.message, code: error.code || '' }
      });
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
    rejected,
    diagnostics: {
      listing: listingDiagnostics,
      counters,
      maxStoriesRequested: maxStories,
      maxEditorsPickLinks: NEWS_CANADA_CONFIG.maxEditorsPickLinks
    }
  };

  const outFile = saveArticles(payload);
  logger.info('Scrape complete', {
    outFile,
    count: articles.length,
    rejectedCount: rejected.length,
    diagnostics: payload.diagnostics
  });

  return { outFile, payload };
}

if (require.main === module) {
  scrapeNewsCanada().then(({ outFile, payload }) => {
    console.log(JSON.stringify({
      ok: true,
      outFile,
      count: payload.count,
      rejectedCount: payload.rejectedCount,
      diagnostics: payload.diagnostics
    }, null, 2));
  }).catch((error) => {
    console.error(JSON.stringify({
      ok: false,
      message: error.message,
      code: error.code || '',
      meta: error.meta || null
    }, null, 2));
    process.exitCode = 1;
  });
}

module.exports = { scrapeNewsCanada, summarizeListingHtml };

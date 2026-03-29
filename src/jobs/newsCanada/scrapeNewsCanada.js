const { NEWS_CANADA_CONFIG } = require('./config');
const { fetchWithRetry } = require('./http');
const { createLogger } = require('./logger');
const { extractEditorsPicksLinks } = require('./fetchEditorsPicks');
const { fetchArticlePage, parseArticle } = require('./parseArticle');
const { normalizeArticle } = require('./normalizeArticle');
const { validateArticle } = require('./validateArticle');
const { saveArticles } = require('./saveArticles');

const DEFAULT_SECTION_URLS = [
  'https://www.newscanada.com/en/articles/content',
  'https://www.newscanada.com/en/upcoming/content',
  'https://www.newscanada.com/en/Technology/content',
  'https://www.newscanada.com/en/Recipes/content',
  'https://www.newscanada.com/en/business/content',
  'https://www.newscanada.com/en/fraud-cybersecurity/content'
];

function uniqueStrings(values = []) {
  return Array.from(
    new Set(
      (Array.isArray(values) ? values : [])
        .map((value) => String(value || '').trim())
        .filter(Boolean)
    )
  );
}

function uniquePicksByUrl(picks = []) {
  const seen = new Set();
  const deduped = [];

  for (const pick of Array.isArray(picks) ? picks : []) {
    const url = String(pick?.url || '').trim();
    if (!url || seen.has(url)) continue;
    seen.add(url);
    deduped.push(pick);
  }

  return deduped;
}

function toSourceLabel(url) {
  const clean = String(url || '').trim();
  if (!clean) return 'unknown';
  try {
    const { pathname } = new URL(clean);
    return pathname
      .split('/')
      .filter(Boolean)
      .slice(-2)
      .join('/') || 'listing';
  } catch (_) {
    return clean;
  }
}

function buildListingUrls(options = {}) {
  return uniqueStrings([
    NEWS_CANADA_CONFIG.editorsPicksUrl,
    ...(Array.isArray(options.sectionUrls) ? options.sectionUrls : []),
    ...DEFAULT_SECTION_URLS,
    ...(Array.isArray(NEWS_CANADA_CONFIG.sectionUrls) ? NEWS_CANADA_CONFIG.sectionUrls : [])
  ]);
}

async function fetchListingPage(listingUrl, logger) {
  logger.info('Fetching listing page', { url: listingUrl });

  const response = await fetchWithRetry(listingUrl, {
    retries: NEWS_CANADA_CONFIG.retries,
    retryDelayMs: NEWS_CANADA_CONFIG.retryDelayMs,
    timeoutMs: NEWS_CANADA_CONFIG.timeoutMs,
    userAgent: NEWS_CANADA_CONFIG.userAgent,
    logger
  });

  const html = typeof response?.data === 'string' ? response.data : '';

  logger.info('Listing page fetched', {
    url: listingUrl,
    htmlLength: html.length,
    status: response?.status || undefined
  });

  return {
    url: listingUrl,
    html,
    status: response?.status || undefined
  };
}

function extractPicksFromListing(listing, logger) {
  const sourceLabel = toSourceLabel(listing.url);
  const extracted = extractEditorsPicksLinks(listing.html, logger).map((pick, index) => ({
    ...pick,
    sourceUrl: listing.url,
    sourceLabel,
    sourceType: listing.url === NEWS_CANADA_CONFIG.editorsPicksUrl ? 'editors-picks' : 'category',
    position: pick.position || index + 1
  }));

  logger.info('Listing links extracted', {
    url: listing.url,
    sourceLabel,
    count: extracted.length,
    picks: extracted.map((pick) => ({
      position: pick.position,
      title: pick.title,
      url: pick.url,
      score: pick.score,
      rescued: Boolean(pick.rescued),
      sourceType: pick.sourceType
    }))
  });

  return extracted;
}

async function scrapeNewsCanada(options = {}) {
  const logger = options.logger || createLogger('[news-canada-scrape]');
  const maxStories = Number.isFinite(options.maxStories) ? options.maxStories : NEWS_CANADA_CONFIG.maxStories;
  const listingUrls = buildListingUrls(options);

  logger.info('Starting News Canada scrape', {
    maxStories,
    listingCount: listingUrls.length,
    listingUrls
  });

  const listingsDiagnostics = [];
  const allExtractedPicks = [];

  for (const listingUrl of listingUrls) {
    const listingLogger = logger.child(`[listing:${toSourceLabel(listingUrl)}]`);

    try {
      const listing = await fetchListingPage(listingUrl, listingLogger);
      const extracted = extractPicksFromListing(listing, listingLogger);

      listingsDiagnostics.push({
        url: listing.url,
        sourceLabel: toSourceLabel(listing.url),
        status: listing.status,
        htmlLength: listing.html.length,
        extractedCount: extracted.length
      });

      allExtractedPicks.push(...extracted);

      if (extracted.length === 0) {
        listingLogger.warn('No links survived extraction for listing page', {
          url: listing.url,
          htmlLength: listing.html.length
        });
      }
    } catch (error) {
      listingsDiagnostics.push({
        url: listingUrl,
        sourceLabel: toSourceLabel(listingUrl),
        error: { message: error.message, code: error.code || '' }
      });

      listingLogger.error('Listing scrape failed', {
        url: listingUrl,
        error
      });
    }
  }

  const picks = uniquePicksByUrl(allExtractedPicks).slice(0, maxStories);

  logger.info('Combined listing extraction complete', {
    totalExtractedCount: allExtractedPicks.length,
    uniquePickCount: picks.length,
    requestedMaxStories: maxStories,
    listingsDiagnostics,
    picks: picks.map((pick) => ({
      position: pick.position,
      title: pick.title,
      url: pick.url,
      score: pick.score,
      rescued: Boolean(pick.rescued),
      sourceUrl: pick.sourceUrl,
      sourceLabel: pick.sourceLabel,
      sourceType: pick.sourceType
    }))
  });

  const articles = [];
  const rejected = [];

  for (const pick of picks) {
    const articleLogger = logger.child(`[${pick.sourceLabel || 'story'}:${pick.position || '?'}]`);

    try {
      articleLogger.info('Fetching article', {
        title: pick.title,
        url: pick.url,
        score: pick.score,
        rescued: Boolean(pick.rescued),
        sourceUrl: pick.sourceUrl,
        sourceType: pick.sourceType
      });

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
      const normalized = normalizeArticle({
        ...pick,
        ...parsedArticle,
        url: pick.url,
        title: parsedArticle.title || pick.title,
        sourceUrl: pick.sourceUrl,
        sourceLabel: pick.sourceLabel,
        sourceType: pick.sourceType
      });

      articleLogger.debug('Article normalized', {
        title: normalized.title,
        url: normalized.url,
        canonicalUrl: normalized.canonicalUrl,
        wordCount: normalized.wordCount,
        imageCount: Array.isArray(normalized.images) ? normalized.images.length : 0,
        categoryCount: Array.isArray(normalized.categories) ? normalized.categories.length : 0,
        summaryLength: String(normalized.summary || '').length,
        bodyLength: String(normalized.body || '').length,
        sourceLabel: normalized.sourceLabel,
        sourceType: normalized.sourceType
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
            rescued: Boolean(pick.rescued),
            sourceUrl: pick.sourceUrl,
            sourceLabel: pick.sourceLabel,
            sourceType: pick.sourceType
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
            rescued: Boolean(pick.rescued),
            sourceUrl: pick.sourceUrl,
            sourceLabel: pick.sourceLabel,
            sourceType: pick.sourceType
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
        warningCount: Array.isArray(validation.warnings) ? validation.warnings.length : 0,
        sourceLabel: result.sourceLabel,
        sourceType: result.sourceType
      });
    } catch (error) {
      rejected.push({
        url: pick.url,
        title: pick.title,
        error: { message: error.message, code: error.code || '' },
        extraction: {
          position: pick.position,
          score: pick.score,
          rescued: Boolean(pick.rescued),
          sourceUrl: pick.sourceUrl,
          sourceLabel: pick.sourceLabel,
          sourceType: pick.sourceType
        }
      });

      articleLogger.error('Article scrape failed', {
        title: pick.title,
        url: pick.url,
        extraction: {
          position: pick.position,
          score: pick.score,
          rescued: Boolean(pick.rescued),
          sourceUrl: pick.sourceUrl,
          sourceLabel: pick.sourceLabel,
          sourceType: pick.sourceType
        },
        error
      });
    }
  }

  logger.info('Scrape classification summary', {
    acceptedCount: articles.length,
    rejectedCount: rejected.length,
    acceptedTitles: articles.map((article) => ({
      title: article.title,
      sourceLabel: article.sourceLabel,
      sourceType: article.sourceType
    })),
    rejectedTitles: rejected.map((article) => ({
      title: article.title,
      url: article.url,
      reason: article.validation?.errors || article.error || [],
      sourceLabel: article.extraction?.sourceLabel,
      sourceType: article.extraction?.sourceType
    }))
  });

  const payload = {
    source: 'News Canada',
    listingUrl: NEWS_CANADA_CONFIG.editorsPicksUrl,
    listingUrls,
    generatedAt: new Date().toISOString(),
    count: articles.length,
    rejectedCount: rejected.length,
    articles,
    rejected,
    diagnostics: {
      requestedMaxStories: maxStories,
      extractedPickCount: allExtractedPicks.length,
      uniquePickCount: picks.length,
      listingsDiagnostics
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

module.exports = {
  scrapeNewsCanada,
  DEFAULT_SECTION_URLS
};

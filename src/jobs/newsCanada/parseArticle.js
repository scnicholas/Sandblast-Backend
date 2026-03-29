const { NEWS_CANADA_CONFIG } = require('./config');
const { fetchWithRetry } = require('./http');
const { createLogger } = require('./logger');

function stripTags(value) {
  return String(value || '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function decodeHtml(value) {
  return stripTags(String(value || ''));
}

function absolutizeUrl(url, baseUrl) {
  const value = String(url || '').trim();
  if (!value) return '';

  try {
    return new URL(value, baseUrl).toString();
  } catch (_) {
    return value;
  }
}

function firstMatch(text, patterns) {
  for (const pattern of patterns) {
    const match = pattern.exec(text);
    if (match && match[1]) {
      return decodeHtml(match[1]);
    }
  }
  return '';
}

function collectMatches(text, pattern) {
  const results = [];
  let match;
  while ((match = pattern.exec(text)) !== null) {
    if (match[1]) {
      results.push(match[1]);
    }
  }
  return results;
}

function extractJsonLdObjects(html) {
  const blocks = collectMatches(html, /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
  const objects = [];

  for (const block of blocks) {
    const text = String(block || '').trim();
    if (!text) continue;

    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) {
        objects.push(...parsed);
      } else {
        objects.push(parsed);
      }
    } catch (_) {
      // Ignore malformed JSON-LD blocks and continue with fallback parsing.
    }
  }

  return objects;
}

function pickArticleJsonLd(objects) {
  const queue = Array.isArray(objects) ? [...objects] : [];

  while (queue.length) {
    const current = queue.shift();
    if (!current || typeof current !== 'object') continue;

    const type = current['@type'];
    const types = Array.isArray(type) ? type : [type];
    if (types.some((entry) => typeof entry === 'string' && /article|newsarticle|reportage/i.test(entry))) {
      return current;
    }

    if (Array.isArray(current['@graph'])) {
      queue.push(...current['@graph']);
    }
  }

  return null;
}

function extractMeta(html, attribute, name) {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns = [
    new RegExp(`<meta[^>]+${attribute}=["']${escapedName}["'][^>]+content=["']([^"']*)["'][^>]*>`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+${attribute}=["']${escapedName}["'][^>]*>`, 'i')
  ];

  return firstMatch(html, patterns);
}

function chooseFirst(candidates) {
  for (const candidate of candidates) {
    if (candidate && candidate.value) return candidate;
  }
  return { value: '', source: '' };
}

function extractTitle(html, articleJsonLd) {
  return chooseFirst([
    { value: decodeHtml(articleJsonLd?.headline), source: 'jsonld.headline' },
    { value: extractMeta(html, 'property', 'og:title'), source: 'meta.og:title' },
    { value: extractMeta(html, 'name', 'twitter:title'), source: 'meta.twitter:title' },
    { value: firstMatch(html, [/<title[^>]*>([\s\S]*?)<\/title>/i]), source: 'html.title' }
  ]);
}

function extractSummary(html, articleJsonLd) {
  return chooseFirst([
    { value: decodeHtml(articleJsonLd?.description), source: 'jsonld.description' },
    { value: extractMeta(html, 'property', 'og:description'), source: 'meta.og:description' },
    { value: extractMeta(html, 'name', 'description'), source: 'meta.description' },
    { value: extractMeta(html, 'name', 'twitter:description'), source: 'meta.twitter:description' }
  ]);
}

function extractPublishedAt(html, articleJsonLd) {
  return chooseFirst([
    { value: decodeHtml(articleJsonLd?.datePublished), source: 'jsonld.datePublished' },
    { value: extractMeta(html, 'property', 'article:published_time'), source: 'meta.article:published_time' },
    { value: extractMeta(html, 'name', 'pubdate'), source: 'meta.pubdate' },
    { value: extractMeta(html, 'itemprop', 'datePublished'), source: 'meta.itemprop.datePublished' }
  ]);
}

function extractAuthor(html, articleJsonLd) {
  const author = articleJsonLd?.author;
  if (typeof author === 'string') return { value: decodeHtml(author), source: 'jsonld.author' };
  if (Array.isArray(author)) {
    const names = author
      .map((entry) => (typeof entry === 'string' ? entry : entry?.name))
      .filter(Boolean)
      .map((entry) => decodeHtml(entry));
    if (names.length) return { value: names.join(', '), source: 'jsonld.author[]' };
  }
  if (author && typeof author === 'object' && author.name) {
    return { value: decodeHtml(author.name), source: 'jsonld.author.name' };
  }

  return chooseFirst([
    { value: extractMeta(html, 'name', 'author'), source: 'meta.author' },
    { value: extractMeta(html, 'property', 'article:author'), source: 'meta.article:author' }
  ]);
}

function extractImages(html, articleJsonLd, baseUrl) {
  const candidates = [];

  const jsonImages = articleJsonLd?.image;
  if (Array.isArray(jsonImages)) {
    for (const image of jsonImages) {
      if (typeof image === 'string') candidates.push(image);
      else if (image?.url) candidates.push(image.url);
    }
  } else if (typeof jsonImages === 'string') {
    candidates.push(jsonImages);
  } else if (jsonImages?.url) {
    candidates.push(jsonImages.url);
  }

  const ogImage = extractMeta(html, 'property', 'og:image');
  if (ogImage) candidates.push(ogImage);

  const srcMatches = collectMatches(html, /<img[^>]+src=["']([^"']+)["'][^>]*>/gi);
  candidates.push(...srcMatches.slice(0, 12));

  return [...new Set(candidates.map((url) => absolutizeUrl(url, baseUrl)).filter(Boolean))].map((url) => ({ url }));
}

function extractCategories(html, articleJsonLd) {
  const categories = [];

  const jsonSection = articleJsonLd?.articleSection;
  if (Array.isArray(jsonSection)) categories.push(...jsonSection);
  else if (jsonSection) categories.push(jsonSection);

  const articleTag = extractMeta(html, 'property', 'article:tag');
  if (articleTag) categories.push(articleTag);

  return [...new Set(categories.map((entry) => decodeHtml(entry)).filter(Boolean))];
}

function extractBodyFromArticleTag(html) {
  const articleMatch = /<article\b[^>]*>([\s\S]*?)<\/article>/i.exec(html);
  if (!articleMatch) return '';

  const articleHtml = articleMatch[1];
  const paragraphMatches = collectMatches(articleHtml, /<p\b[^>]*>([\s\S]*?)<\/p>/gi)
    .map((entry) => stripTags(entry))
    .filter(Boolean);

  if (paragraphMatches.length) {
    return paragraphMatches.join('\n\n');
  }

  return stripTags(articleHtml);
}

function extractBodyFromMain(html) {
  const mainMatch = /<main\b[^>]*>([\s\S]*?)<\/main>/i.exec(html);
  if (!mainMatch) return '';

  const mainHtml = mainMatch[1];
  const paragraphMatches = collectMatches(mainHtml, /<p\b[^>]*>([\s\S]*?)<\/p>/gi)
    .map((entry) => stripTags(entry))
    .filter((entry) => entry.length > 40);

  if (paragraphMatches.length >= 2) {
    return paragraphMatches.join('\n\n');
  }

  return '';
}

function buildBodyFallback(html) {
  const articleBody = extractBodyFromArticleTag(html);
  if (articleBody) return { value: articleBody, source: 'article-tag' };

  const mainBody = extractBodyFromMain(html);
  if (mainBody) return { value: mainBody, source: 'main-tag' };

  return {
    value: stripTags(html).slice(0, 12000),
    source: 'document-text-fallback'
  };
}

function summarizeDiagnostics(diagnostics) {
  return {
    htmlLength: diagnostics.htmlLength,
    jsonLdObjectCount: diagnostics.jsonLdObjectCount,
    hasArticleJsonLd: diagnostics.hasArticleJsonLd,
    titleSource: diagnostics.titleSource,
    titleLength: diagnostics.titleLength,
    summarySource: diagnostics.summarySource,
    summaryLength: diagnostics.summaryLength,
    publishedAtSource: diagnostics.publishedAtSource,
    authorSource: diagnostics.authorSource,
    bodySource: diagnostics.bodySource,
    bodyLength: diagnostics.bodyLength,
    imageCount: diagnostics.imageCount,
    categoryCount: diagnostics.categoryCount,
    canonicalUrlSource: diagnostics.canonicalUrlSource
  };
}

async function fetchArticlePage(url, logger = createLogger('[news-canada-article]')) {
  const response = await fetchWithRetry(url, {
    retries: NEWS_CANADA_CONFIG.retries,
    retryDelayMs: NEWS_CANADA_CONFIG.retryDelayMs,
    timeoutMs: NEWS_CANADA_CONFIG.timeoutMs,
    userAgent: NEWS_CANADA_CONFIG.userAgent,
    logger
  });

  return typeof response?.data === 'string' ? response.data : '';
}

function parseArticle(html, url) {
  const text = typeof html === 'string' ? html : '';
  const jsonLdObjects = extractJsonLdObjects(text);
  const articleJsonLd = pickArticleJsonLd(jsonLdObjects);

  const titleMeta = extractTitle(text, articleJsonLd);
  const summaryMeta = extractSummary(text, articleJsonLd);
  const publishedAtMeta = extractPublishedAt(text, articleJsonLd);
  const authorMeta = extractAuthor(text, articleJsonLd);
  const images = extractImages(text, articleJsonLd, url);
  const categories = extractCategories(text, articleJsonLd);
  const bodyMeta = buildBodyFallback(text);
  const canonicalMeta = chooseFirst([
    { value: extractMeta(text, 'property', 'og:url'), source: 'meta.og:url' },
    { value: absolutizeUrl(url, url), source: 'request.url' }
  ]);

  const diagnostics = summarizeDiagnostics({
    htmlLength: text.length,
    jsonLdObjectCount: jsonLdObjects.length,
    hasArticleJsonLd: Boolean(articleJsonLd),
    titleSource: titleMeta.source,
    titleLength: titleMeta.value.length,
    summarySource: summaryMeta.source,
    summaryLength: summaryMeta.value.length,
    publishedAtSource: publishedAtMeta.source,
    authorSource: authorMeta.source,
    bodySource: bodyMeta.source,
    bodyLength: bodyMeta.value.length,
    imageCount: images.length,
    categoryCount: categories.length,
    canonicalUrlSource: canonicalMeta.source
  });

  return {
    title: titleMeta.value,
    summary: summaryMeta.value,
    body: bodyMeta.value,
    images,
    categories,
    mediaAttachments: [],
    publishedAt: publishedAtMeta.value,
    author: authorMeta.value,
    canonicalUrl: canonicalMeta.value,
    diagnostics
  };
}

module.exports = {
  fetchArticlePage,
  parseArticle
};

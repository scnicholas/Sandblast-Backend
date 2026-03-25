const cheerio = require("cheerio");
const { NEWS_CANADA_CONFIG } = require("./config");
const { cleanText, toAbsoluteUrl, isLikelyArticleUrl } = require("./utils");

const NEGATIVE_TITLE_RE = /^(read more|more|click here|learn more|view|image view|about us|contact us|privacy|privacy policy|terms|terms of use|subscribe|sign up|newsletter|content solutions|media attachments|related posts)$/i;
const NEGATIVE_CONTEXT_RE = /(contact|privacy|terms|about|subscribe|sign up|newsletter|content solutions|media attachments|related posts|copyright|all rights reserved)/i;
const NEGATIVE_PATH_RE = /\/(about(?:-us)?|contact(?:-us)?|privacy(?:-policy)?|terms(?:-of-use)?|subscribe|signup|sign-up|newsletter|content-solutions|media(?:-attachments)?|related-posts?)(?:[/?#]|$)/i;
const LISTING_PATH_RE = /\/(home|editor-picks(?:\/content)?)(?:[/?#]|$)/i;
const EDITORS_PICKS_RE = /editor'?s picks/i;
const STRONG_ARTICLE_PATH_RE = /\/(?:[a-z]{2}\/)?[^/?#]*-[0-9]{4,}(?:[/?#]|$)/i;
const MODERATE_ARTICLE_PATH_RE = /\/(?:[a-z]{2}\/)?[a-z0-9][a-z0-9-]{15,}(?:[/?#]|$)/i;
const NEGATIVE_ANCHOR_CONTEXT_RE = /(footer|header|navigation|menu|breadcrumb|social|follow us|share|copyright|all rights reserved)/i;

function normalizeUrl(url) {
  if (!url) return "";
  return String(url).trim().replace(/#.*$/, "");
}

function getHeadingText($, node) {
  const own = cleanText($(node).text());
  if (own) return own;

  const previousHeading = $(node).prevAll("h1,h2,h3,h4,strong").first();
  return cleanText(previousHeading.text());
}

function getAnchorTitle($, a) {
  return (
    cleanText($(a).text()) ||
    cleanText($(a).attr("title")) ||
    cleanText($(a).attr("aria-label")) ||
    cleanText($(a).find("img").attr("alt"))
  );
}

function inspectUrlShape(url) {
  if (!url) {
    return {
      valid: false,
      strong: false,
      moderate: false,
      listing: false,
      negative: false,
      sameHost: false,
      pathname: ""
    };
  }

  try {
    const parsed = new URL(url);
    const pathname = parsed.pathname || "";
    const sameHost = /(^|\.)newscanada\.com$/i.test(parsed.hostname);
    const negative = NEGATIVE_PATH_RE.test(pathname);
    const listing = LISTING_PATH_RE.test(pathname);
    const strong = STRONG_ARTICLE_PATH_RE.test(pathname);
    const moderate = MODERATE_ARTICLE_PATH_RE.test(pathname);

    return {
      valid: /^https?:$/i.test(parsed.protocol) && sameHost && !negative,
      strong,
      moderate,
      listing,
      negative,
      sameHost,
      pathname
    };
  } catch {
    return {
      valid: false,
      strong: false,
      moderate: false,
      listing: false,
      negative: false,
      sameHost: false,
      pathname: ""
    };
  }
}

function hasStrongArticleUrlShape(url) {
  const info = inspectUrlShape(url);
  return info.valid && info.strong;
}

function hasNegativeTitle(title) {
  const text = String(title || "").trim();
  if (!text) return true;
  if (NEGATIVE_TITLE_RE.test(text)) return true;
  if (text.length < 12) return true;
  return false;
}

function scoreCandidate(title, containerText, anchorText, href) {
  let score = 0;
  const titleLc = String(title || "").toLowerCase();
  const containerLc = String(containerText || "").toLowerCase();
  const anchorLc = String(anchorText || "").toLowerCase();
  const hrefLc = String(href || "").toLowerCase();
  const urlInfo = inspectUrlShape(href);

  if (EDITORS_PICKS_RE.test(containerLc)) score += 8;
  if (anchorLc && anchorLc === titleLc) score += 1;
  if (title.length >= 24) score += 2;
  if (!hasNegativeTitle(title)) score += 2;
  if (!NEGATIVE_CONTEXT_RE.test(titleLc) && !NEGATIVE_CONTEXT_RE.test(containerLc)) score += 2;
  if (urlInfo.strong) score += 6;
  else if (urlInfo.moderate) score += 3;
  if (/\b(news|canada|health|finance|food|travel|family|market|study|report|launch|guide|tips|new)\b/i.test(title)) score += 1;
  if (anchorLc && anchorLc.includes("read more")) score -= 2;
  if (NEGATIVE_ANCHOR_CONTEXT_RE.test(containerLc)) score -= 3;
  if (urlInfo.listing) score -= 4;
  if (urlInfo.negative) score -= 8;
  if (hrefLc.includes("/en/")) score += 1;

  return score;
}

function shouldRejectCandidate({ title, url, contextText }) {
  if (!title || !url) return true;
  if (hasNegativeTitle(title)) return true;
  if (!isLikelyArticleUrl(url)) return true;

  const urlInfo = inspectUrlShape(url);
  if (!urlInfo.valid) return true;
  if (urlInfo.negative || urlInfo.listing) return true;
  if (!urlInfo.strong && !urlInfo.moderate) return true;

  const titleLc = String(title).toLowerCase();
  const contextLc = String(contextText || "").toLowerCase();
  if (NEGATIVE_CONTEXT_RE.test(titleLc) || NEGATIVE_CONTEXT_RE.test(contextLc)) return true;
  if (NEGATIVE_ANCHOR_CONTEXT_RE.test(contextLc) && !EDITORS_PICKS_RE.test(contextLc)) return true;

  return false;
}

function pushCandidate($, a, contextText, items) {
  const title = getAnchorTitle($, a);
  const href = cleanText($(a).attr("href"));
  const rawUrl = toAbsoluteUrl(href, NEWS_CANADA_CONFIG.baseUrl || NEWS_CANADA_CONFIG.baseURL);
  const url = normalizeUrl(rawUrl);

  if (shouldRejectCandidate({ title, url, contextText })) return;

  items.push({
    title,
    url,
    score: scoreCandidate(title, contextText, cleanText($(a).text()), url),
    context: String(contextText || "").slice(0, 400)
  });
}

function collectAnchorsFromContainer($, container, items) {
  if (!container || !container.length) return;

  const anchors = $(container).find("a");
  if (anchors.length === 0 || anchors.length > 36) return;

  const contextText = cleanText($(container).text());
  if (NEGATIVE_ANCHOR_CONTEXT_RE.test(contextText) && !EDITORS_PICKS_RE.test(contextText)) return;
  if (!EDITORS_PICKS_RE.test(contextText) && anchors.length > 16) return;

  anchors.each((_, a) => pushCandidate($, a, contextText, items));
}

function collectAroundHeading($, el, items) {
  const headingScope = getHeadingText($, el);
  const parent = $(el).parent();
  const section = $(el).closest("section, article, div, main");

  collectAnchorsFromContainer($, parent, items);
  collectAnchorsFromContainer($, section, items);

  let cursor = $(el).next();
  let hops = 0;
  while (cursor.length && hops < 12) {
    if (cursor.is("h1,h2,h3,h4") && !EDITORS_PICKS_RE.test(cleanText(cursor.text()))) break;
    const blockText = `${headingScope} ${cleanText(cursor.text())}`.trim();
    const anchorCount = cursor.find("a").length;
    if (anchorCount > 0 && anchorCount <= 24) {
      cursor.find("a").each((_, a) => pushCandidate($, a, blockText, items));
    }
    cursor = cursor.next();
    hops += 1;
  }
}

function collectPageFallback($, items) {
  $("a").each((_, a) => {
    const title = getAnchorTitle($, a);
    const href = cleanText($(a).attr("href"));
    const url = normalizeUrl(
      toAbsoluteUrl(href, NEWS_CANADA_CONFIG.baseUrl || NEWS_CANADA_CONFIG.baseURL)
    );
    const parentText = cleanText($(a).parent().text());
    const grandParentText = cleanText($(a).parent().parent().text());
    const context = `${parentText} ${grandParentText}`.trim();

    if (!context || NEGATIVE_ANCHOR_CONTEXT_RE.test(context)) return;
    if (shouldRejectCandidate({ title, url, contextText: context })) return;

    const score = scoreCandidate(title, context, cleanText($(a).text()), url);
    if (score < 8) return;

    items.push({
      title,
      url,
      score,
      context: context.slice(0, 400)
    });
  });
}

function extractEditorsPicksLinks(html, logger) {
  const $ = cheerio.load(html);
  const items = [];

  $("h1,h2,h3,h4,strong,p,span,div").each((_, el) => {
    const text = cleanText($(el).text()).toLowerCase();
    if (!EDITORS_PICKS_RE.test(text)) return;
    collectAroundHeading($, el, items);
  });

  if (items.length === 0) {
    collectPageFallback($, items);
  }

  const byUrl = new Map();
  for (const item of items) {
    const existing = byUrl.get(item.url);
    if (!existing || item.score > existing.score) {
      byUrl.set(item.url, item);
    }
  }

  const results = Array.from(byUrl.values())
    .filter((item) => item.score >= 9)
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title))
    .slice(0, NEWS_CANADA_CONFIG.maxEditorsPickLinks)
    .map(({ title, url, score, context }, index) => ({
      title,
      url,
      score,
      context,
      position: index + 1
    }));

  if (logger && typeof logger.debug === "function") {
    logger.debug("[fetchEditorsPicks] extraction summary", {
      candidatesFound: items.length,
      uniqueCandidates: byUrl.size,
      returned: results.length
    });
  }

  return results;
}

module.exports = { extractEditorsPicksLinks };

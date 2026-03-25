const cheerio = require("cheerio");
const { NEWS_CANADA_CONFIG } = require("./config");
const { cleanText, toAbsoluteUrl, isLikelyArticleUrl } = require("./utils");

const NEGATIVE_TITLE_RE = /^(read more|more|click here|learn more|view|image view|about us|contact us|privacy|privacy policy|terms|terms of use|subscribe|sign up|newsletter|content solutions|media attachments|related posts)$/i;
const NEGATIVE_CONTEXT_RE = /(contact|privacy|terms|about|subscribe|sign up|newsletter|content solutions|media attachments|related posts|copyright|all rights reserved)/i;
const NEGATIVE_PATH_RE = /\/(about(?:-us)?|contact(?:-us)?|privacy(?:-policy)?|terms(?:-of-use)?|subscribe|signup|sign-up|newsletter|content-solutions|media(?:-attachments)?|related-posts?|home|editor-picks(?:\/content)?)(?:[/?#]|$)/i;
const EDITORS_PICKS_RE = /editor'?s picks/i;
const STRONG_ARTICLE_PATH_RE = /\/(?:[a-z]{2}\/)?[^/?#]*-[0-9]{4,}(?:[/?#]|$)/i;

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

function hasStrongArticleUrlShape(url) {
  if (!url) return false;

  try {
    const parsed = new URL(url);
    const pathname = parsed.pathname || "";
    if (!/^https?:$/i.test(parsed.protocol)) return false;
    if (!/newscanada\.com$/i.test(parsed.hostname)) return false;
    if (NEGATIVE_PATH_RE.test(pathname)) return false;
    return STRONG_ARTICLE_PATH_RE.test(pathname);
  } catch {
    return false;
  }
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

  if (EDITORS_PICKS_RE.test(containerLc)) score += 10;
  if (anchorLc && anchorLc === titleLc) score += 1;
  if (title.length >= 24) score += 2;
  if (!hasNegativeTitle(title)) score += 2;
  if (!NEGATIVE_CONTEXT_RE.test(titleLc) && !NEGATIVE_CONTEXT_RE.test(containerLc)) score += 2;
  if (STRONG_ARTICLE_PATH_RE.test(hrefLc)) score += 6;
  if (/\b(news|canada|health|finance|food|travel|family|market|study|report|launch|guide|tips|new)\b/i.test(title)) score += 1;

  return score;
}

function shouldRejectCandidate({ title, url, contextText }) {
  if (!title || !url) return true;
  if (hasNegativeTitle(title)) return true;
  if (!isLikelyArticleUrl(url)) return true;
  if (!hasStrongArticleUrlShape(url)) return true;

  const titleLc = String(title).toLowerCase();
  const contextLc = String(contextText || "").toLowerCase();
  if (NEGATIVE_CONTEXT_RE.test(titleLc) || NEGATIVE_CONTEXT_RE.test(contextLc)) return true;

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
  if (anchors.length === 0 || anchors.length > 30) return;

  const contextText = cleanText($(container).text());
  if (!EDITORS_PICKS_RE.test(contextText) && anchors.length > 12) return;

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
  while (cursor.length && hops < 10) {
    if (cursor.is("h1,h2,h3,h4") && !EDITORS_PICKS_RE.test(cleanText(cursor.text()))) break;
    const blockText = `${headingScope} ${cleanText(cursor.text())}`.trim();
    const anchorCount = cursor.find("a").length;
    if (anchorCount > 0 && anchorCount <= 20) {
      cursor.find("a").each((_, a) => pushCandidate($, a, blockText, items));
    }
    cursor = cursor.next();
    hops += 1;
  }
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
    $("a").each((_, a) => {
      const title = getAnchorTitle($, a);
      const href = cleanText($(a).attr("href"));
      const url = normalizeUrl(
        toAbsoluteUrl(href, NEWS_CANADA_CONFIG.baseUrl || NEWS_CANADA_CONFIG.baseURL)
      );
      const parentText = cleanText($(a).parent().text());
      const grandParentText = cleanText($(a).parent().parent().text());
      const context = `${parentText} ${grandParentText}`.trim();

      if (!EDITORS_PICKS_RE.test(context)) return;
      if (shouldRejectCandidate({ title, url, contextText: context })) return;

      items.push({
        title,
        url,
        score: scoreCandidate(title, context, cleanText($(a).text()), url),
        context: context.slice(0, 400)
      });
    });
  }

  const byUrl = new Map();
  for (const item of items) {
    const existing = byUrl.get(item.url);
    if (!existing || item.score > existing.score) {
      byUrl.set(item.url, item);
    }
  }

  const results = Array.from(byUrl.values())
    .filter((item) => item.score >= 12)
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

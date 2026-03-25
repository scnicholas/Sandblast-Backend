const cheerio = require("cheerio");
const { NEWS_CANADA_CONFIG } = require("./config");
const { cleanText, toAbsoluteUrl, isLikelyArticleUrl } = require("./utils");

const NEGATIVE_TITLE_RE = /^(read more|more|click here|learn more|view|image view)$/i;
const NEGATIVE_CONTEXT_RE = /(contact|privacy|terms|about|subscribe|sign up|newsletter)/i;
const EDITORS_PICKS_RE = /editor'?s picks/i;

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
    cleanText($(a).attr("aria-label"))
  );
}

function scoreCandidate(title, containerText, anchorText, href) {
  let score = 0;
  const titleLc = String(title || "").toLowerCase();
  const containerLc = String(containerText || "").toLowerCase();
  const anchorLc = String(anchorText || "").toLowerCase();
  const hrefLc = String(href || "").toLowerCase();

  if (EDITORS_PICKS_RE.test(containerLc)) score += 8;
  if (anchorLc && anchorLc === titleLc) score += 1;
  if (title.length >= 24) score += 2;
  if (/\d{5,}/.test(titleLc) || /\d{5,}/.test(hrefLc)) score += 1;
  if (!NEGATIVE_TITLE_RE.test(title)) score += 2;
  if (!NEGATIVE_CONTEXT_RE.test(titleLc) && !NEGATIVE_CONTEXT_RE.test(containerLc)) score += 1;
  if (/\/(en\/)?[^/]+-\d{4,}/i.test(hrefLc)) score += 2;

  return score;
}

function pushCandidate($, a, contextText, items) {
  const title = getAnchorTitle($, a);
  const href = cleanText($(a).attr("href"));
  const url = normalizeUrl(toAbsoluteUrl(href, NEWS_CANADA_CONFIG.baseUrl));

  if (!title || !url || !isLikelyArticleUrl(url)) return;
  if (NEGATIVE_TITLE_RE.test(title)) return;

  items.push({
    title,
    url,
    score: scoreCandidate(title, contextText, cleanText($(a).text()), url),
    context: String(contextText || "").slice(0, 400)
  });
}

function collectAnchorsFromContainer($, container, items) {
  if (!container || !container.length) return;
  const contextText = cleanText($(container).text());

  $(container)
    .find("a")
    .each((_, a) => pushCandidate($, a, contextText, items));
}

function collectAroundHeading($, el, items) {
  const headingScope = getHeadingText($, el);
  const parent = $(el).parent();
  const section = $(el).closest("section, article, div, main");

  collectAnchorsFromContainer($, parent, items);
  collectAnchorsFromContainer($, section, items);

  let cursor = $(el).next();
  let hops = 0;
  while (cursor.length && hops < 14) {
    const blockText = `${headingScope} ${cleanText(cursor.text())}`;
    cursor.find("a").each((_, a) => pushCandidate($, a, blockText, items));
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
      const url = normalizeUrl(toAbsoluteUrl(href, NEWS_CANADA_CONFIG.baseUrl));
      const parentText = cleanText($(a).parent().text());
      const grandParentText = cleanText($(a).parent().parent().text());
      const context = `${parentText} ${grandParentText}`;

      if (!title || !url || !isLikelyArticleUrl(url)) return;
      if (!EDITORS_PICKS_RE.test(context)) return;

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
    .filter((item) => item.score >= 8)
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

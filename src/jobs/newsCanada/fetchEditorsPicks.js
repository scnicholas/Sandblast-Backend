const cheerio = require("cheerio");
const { NEWS_CANADA_CONFIG } = require("./config");
const { cleanText, toAbsoluteUrl, isLikelyArticleUrl } = require("./utils");

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

function scoreCandidate(title, containerText, anchorText) {
  let score = 0;
  const titleLc = String(title || "").toLowerCase();
  const containerLc = String(containerText || "").toLowerCase();
  const anchorLc = String(anchorText || "").toLowerCase();

  if (containerLc.includes("editor's picks") || containerLc.includes("editors picks")) score += 8;
  if (anchorLc && anchorLc === titleLc) score += 1;
  if (title.length >= 24) score += 2;
  if (/\d{5,}/.test(titleLc) || /\d{5,}/.test(containerLc)) score += 1;
  if (!/^(read more|more|click here|learn more)$/i.test(title)) score += 2;
  if (!/(contact|privacy|terms|about|subscribe)/i.test(titleLc)) score += 1;

  return score;
}

function pushCandidate($, a, contextText, items) {
  const title = cleanText($(a).text()) || cleanText($(a).attr("title"));
  const href = cleanText($(a).attr("href"));
  const url = normalizeUrl(toAbsoluteUrl(href, NEWS_CANADA_CONFIG.baseUrl));

  if (!title || !url || !isLikelyArticleUrl(url)) return;

  items.push({
    title,
    url,
    score: scoreCandidate(title, contextText, cleanText($(a).text())),
    context: String(contextText || "").slice(0, 400)
  });
}

function collectAnchorsFromContainer($, container, items) {
  const contextText = cleanText($(container).text());

  $(container)
    .find("a")
    .each((_, a) => pushCandidate($, a, contextText, items));
}

function extractEditorsPicksLinks(html, logger) {
  const $ = cheerio.load(html);
  const items = [];

  $("body *").each((_, el) => {
    const text = cleanText($(el).text()).toLowerCase();
    if (text !== "editor's picks" && text !== "editors picks") return;

    const parent = $(el).parent();
    const section = $(el).closest("section, article, div");
    const headingScope = getHeadingText($, el);

    collectAnchorsFromContainer($, parent, items);
    if (section.length) collectAnchorsFromContainer($, section, items);

    let cursor = $(el).next();
    let hops = 0;
    while (cursor.length && hops < 14) {
      const blockText = `${headingScope} ${cleanText(cursor.text())}`;
      cursor.find("a").each((_, a) => pushCandidate($, a, blockText, items));
      cursor = cursor.next();
      hops += 1;
    }
  });

  if (items.length === 0) {
    $("a").each((_, a) => {
      const title = cleanText($(a).text()) || cleanText($(a).attr("title"));
      const href = cleanText($(a).attr("href"));
      const url = normalizeUrl(toAbsoluteUrl(href, NEWS_CANADA_CONFIG.baseUrl));
      const parentText = cleanText($(a).parent().text());
      const grandParentText = cleanText($(a).parent().parent().text());
      const context = `${parentText} ${grandParentText}`;

      if (!title || !url || !isLikelyArticleUrl(url)) return;
      if (!/editor'?s picks/i.test(context)) return;

      items.push({
        title,
        url,
        score: scoreCandidate(title, context, cleanText($(a).text())),
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
    .map(({ title, url, score, context }) => ({ title, url, score, context }));

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

const cheerio = require("cheerio");
const { URL } = require("url");

function toAbsoluteUrl(href) {
  try {
    return new URL(href, "https://www.newscanada.com").href;
  } catch {
    return "";
  }
}

function cleanText(value = "") {
  return String(value).replace(/\s+/g, " ").trim();
}

function isLikelyArticleUrl(url) {
  return /^https:\/\/www\.newscanada\.com\/[a-z]{2}\/.+/.test(url);
}

function extractEditorsPicksLinks(html) {
  const $ = cheerio.load(html);
  const collected = [];

  // Strategy 1: locate exact "Editor's Picks" label and inspect nearby siblings
  $("body *").each((_, el) => {
    const text = cleanText($(el).text());

    if (text !== "Editor's Picks") return;

    let cursor = $(el).next();
    let hops = 0;

    while (cursor.length && hops < 20) {
      // direct node if it is a link
      if (cursor.is("a")) {
        const title = cleanText(cursor.text());
        const href = cleanText(cursor.attr("href"));
        const abs = toAbsoluteUrl(href);

        if (title && abs) {
          collected.push({ title, url: abs });
        }
      }

      // descendant links
      cursor.find("a").each((__, a) => {
        const title = cleanText($(a).text());
        const href = cleanText($(a).attr("href"));
        const abs = toAbsoluteUrl(href);

        if (title && abs) {
          collected.push({ title, url: abs });
        }
      });

      cursor = cursor.next();
      hops += 1;
    }
  });

  // Strategy 2: fallback pass — catch anchors whose nearby container mentions Editor's Picks
  if (collected.length === 0) {
    $("a").each((_, a) => {
      const href = cleanText($(a).attr("href"));
      const title = cleanText($(a).text());
      const abs = toAbsoluteUrl(href);
      const parentText = cleanText($(a).parent().text());
      const grandParentText = cleanText($(a).parent().parent().text());

      if (
        title &&
        abs &&
        (parentText.includes("Editor's Picks") || grandParentText.includes("Editor's Picks"))
      ) {
        collected.push({ title, url: abs });
      }
    });
  }

  const seen = new Set();

  return collected.filter((item) => {
    if (!item.url) return false;
    if (!isLikelyArticleUrl(item.url)) return false;
    if (seen.has(item.url)) return false;
    seen.add(item.url);
    return true;
  });
}

module.exports = {
  extractEditorsPicksLinks,
  toAbsoluteUrl,
  cleanText,
  isLikelyArticleUrl
};

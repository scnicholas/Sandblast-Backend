const cheerio = require("cheerio");
const { NEWS_CANADA_CONFIG } = require("./config");
const { fetchWithRetry } = require("./http");
const { cleanText, cleanMultilineText, toAbsoluteUrl } = require("./utils");

async function fetchArticlePage(url, logger) {
  const response = await fetchWithRetry(url, {
    retries: NEWS_CANADA_CONFIG.retries,
    retryDelayMs: NEWS_CANADA_CONFIG.retryDelayMs,
    timeoutMs: NEWS_CANADA_CONFIG.timeoutMs,
    userAgent: NEWS_CANADA_CONFIG.userAgent,
    logger
  });

  return response.data;
}

function extractTitle($) {
  return (
    cleanText($("h1").first().text()) ||
    cleanText($("meta[property='og:title']").attr("content")) ||
    cleanText($("meta[name='title']").attr("content")) ||
    cleanText($("title").text())
  );
}

function extractIssue($) {
  let issue = "";
  $("body *").each((_, el) => {
    const text = cleanText($(el).text());
    if (text === "Issue") {
      issue = cleanText($(el).next().text()) || issue;
    }
  });
  return issue;
}

function extractCategories($) {
  const categories = new Set();
  const ignore = new Set([
    "home",
    "articles",
    "radio",
    "video",
    "editor's picks",
    "editors picks",
    "media attachments",
    "related posts",
    "terms of use",
    "read more"
  ]);

  $("a, button, span").each((_, el) => {
    const text = cleanText($(el).text());
    const lower = text.toLowerCase();

    if (!text) return;
    if (ignore.has(lower)) return;
    if (text.length > 40) return;
    if (!/^[A-Za-z0-9+&'’*(),\-\/\s]+$/.test(text)) return;

    if (
      /^(55\+|automotive|business|education|family|finance|food|health|home|lifestyle|technology|travel|multimedia|government|safety|parenting)/i.test(
        text
      )
    ) {
      categories.add(text);
    }
  });

  return Array.from(categories);
}

function extractBody($, title) {
  const parts = [];
  let capture = false;
  let scanned = 0;

  $("body")
    .find("*")
    .each((_, el) => {
      if (scanned >= NEWS_CANADA_CONFIG.maxBodyNodesToScan) return;
      scanned += 1;

      const tag = (el.tagName || "").toLowerCase();
      const text = cleanText($(el).text());
      if (!text) return;

      if (tag === "h1" && text === title) {
        capture = true;
        return;
      }

      if (!capture) return;

      if (
        text === "Media Attachments" ||
        text === "Related Posts" ||
        text === "Terms of Use" ||
        text === "Editor's Picks"
      ) {
        capture = false;
        return;
      }

      if (!["p", "div", "section", "article", "span"].includes(tag)) return;
      if (text.length < 80) return;
      if (parts.includes(text)) return;

      parts.push(text);
    });

  return cleanMultilineText(parts.join("\n\n"));
}

function extractMediaAttachments($, articleUrl) {
  const mediaAttachments = [];

  $("a").each((_, a) => {
    const label = cleanText($(a).text());
    const rawHref = cleanText($(a).attr("href") || "");
    const href = rawHref ? toAbsoluteUrl(rawHref, articleUrl) : "";
    const lowerLabel = label.toLowerCase();
    const lowerHref = href.toLowerCase();

    if (!label && !href) return;

    if (
      lowerLabel.includes("audio") ||
      lowerLabel.includes("preview") ||
      lowerLabel.includes("download") ||
      lowerLabel.includes("segment") ||
      /\.(mp3|wav|jpg|jpeg|png|mp4|pdf)$/i.test(lowerHref)
    ) {
      mediaAttachments.push({ label, href });
    }
  });

  const deduped = [];
  const seen = new Set();
  for (const item of mediaAttachments) {
    const key = `${item.label}::${item.href}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(item);
  }

  return deduped;
}

function parseArticle(html, url) {
  const $ = cheerio.load(html);
  const title = extractTitle($);
  const issue = extractIssue($);
  const categories = extractCategories($);
  const body = extractBody($, title);
  const mediaAttachments = extractMediaAttachments($, url);

  return {
    title,
    url,
    issue,
    categories,
    body,
    mediaAttachments
  };
}

module.exports = {
  fetchArticlePage,
  parseArticle,
  extractTitle,
  extractIssue,
  extractCategories,
  extractBody,
  extractMediaAttachments
};

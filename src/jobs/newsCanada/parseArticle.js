const cheerio = require("cheerio");
const { NEWS_CANADA_CONFIG } = require("./config");
const { fetchWithRetry } = require("./http");
const { cleanText, cleanMultilineText, toAbsoluteUrl } = require("./utils");

const STOP_MARKERS = new Set([
  "media attachments",
  "related posts",
  "terms of use",
  "editor's picks",
  "editors picks"
]);

function fetchArticlePage(url, logger) {
  return fetchWithRetry(url, {
    retries: NEWS_CANADA_CONFIG.retries,
    retryDelayMs: NEWS_CANADA_CONFIG.retryDelayMs,
    timeoutMs: NEWS_CANADA_CONFIG.timeoutMs,
    userAgent: NEWS_CANADA_CONFIG.userAgent,
    logger
  }).then((response) => response.data);
}

function extractTitle($) {
  return (
    cleanText($("article h1").first().text()) ||
    cleanText($("h1").first().text()) ||
    cleanText($("meta[property='og:title']").attr("content")) ||
    cleanText($("meta[name='twitter:title']").attr("content")) ||
    cleanText($("meta[name='title']").attr("content")) ||
    cleanText($("title").text())
  );
}

function extractIssue($) {
  const selectors = [
    "[class*='issue']",
    "[id*='issue']",
    "dt",
    "strong",
    "b"
  ];

  for (const selector of selectors) {
    const nodes = $(selector).toArray();
    for (const node of nodes) {
      const label = cleanText($(node).text()).toLowerCase();
      if (label !== "issue") continue;

      const directSibling = cleanText($(node).next().text());
      const parentText = cleanText($(node).parent().text()).replace(/^Issue\s*/i, "").trim();

      if (directSibling) return directSibling;
      if (parentText && parentText.toLowerCase() !== "issue") return parentText;
    }
  }

  return "";
}

function extractPublishedAt($) {
  return (
    cleanText($("meta[property='article:published_time']").attr("content")) ||
    cleanText($("meta[name='pubdate']").attr("content")) ||
    cleanText($("time").first().attr("datetime")) ||
    cleanText($("time").first().text())
  );
}

function extractAuthor($) {
  return (
    cleanText($("meta[name='author']").attr("content")) ||
    cleanText($("meta[property='article:author']").attr("content")) ||
    cleanText($("[rel='author']").first().text()) ||
    cleanText($("[class*='author']").first().text())
  );
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

  $("a, button, span, li").each((_, el) => {
    const text = cleanText($(el).text());
    const lower = text.toLowerCase();

    if (!text || ignore.has(lower)) return;
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

function isStopMarker(text) {
  return STOP_MARKERS.has(String(text || "").toLowerCase());
}

function selectBestBodyRoot($) {
  const candidates = [
    "article",
    "[role='main']",
    "main",
    ".entry-content",
    ".post-content",
    ".article-content",
    ".content",
    "body"
  ];

  for (const selector of candidates) {
    const root = $(selector).first();
    if (root.length) return root;
  }

  return $("body").first();
}

function extractBody($, title) {
  const root = selectBestBodyRoot($);
  const parts = [];
  const seen = new Set();
  let capture = false;
  let scanned = 0;

  root.find("*").each((_, el) => {
    if (scanned >= NEWS_CANADA_CONFIG.maxBodyNodesToScan) return false;
    scanned += 1;

    const tag = (el.tagName || "").toLowerCase();
    const text = cleanText($(el).text());
    if (!text) return;

    if ((tag === "h1" || tag === "h2") && text === title) {
      capture = true;
      return;
    }

    if (!capture && tag === "p" && text.length > 120) {
      capture = true;
    }

    if (!capture) return;

    if (isStopMarker(text)) {
      capture = false;
      return false;
    }

    if (!["p", "div", "section", "article", "span", "li"].includes(tag)) return;
    if (text.length < 80) return;
    if (seen.has(text)) return;

    seen.add(text);
    parts.push(text);
  });

  return cleanMultilineText(parts.join("\n\n"));
}

function extractImages($, articleUrl, title) {
  const images = [];
  const seen = new Set();

  $("img").each((_, img) => {
    const rawSrc = cleanText($(img).attr("src") || $(img).attr("data-src") || $(img).attr("data-lazy-src"));
    const src = rawSrc ? toAbsoluteUrl(rawSrc, articleUrl) : "";
    const alt = cleanText($(img).attr("alt")) || title || "";
    const caption = cleanText($(img).closest("figure").find("figcaption").first().text());

    if (!src) return;
    if (!/^https?:\/\//i.test(src)) return;
    if (/\.(svg)$/i.test(src)) return;

    const key = `${src}::${caption}`;
    if (seen.has(key)) return;
    seen.add(key);

    images.push({ url: src, alt, caption });
  });

  return images;
}

function extractMediaAttachments($, articleUrl) {
  const mediaAttachments = [];
  const seen = new Set();

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
      const key = `${label}::${href}`;
      if (seen.has(key)) return;
      seen.add(key);
      mediaAttachments.push({ label, href });
    }
  });

  return mediaAttachments;
}

function parseArticle(html, url) {
  const $ = cheerio.load(html);
  const title = extractTitle($);
  const issue = extractIssue($);
  const categories = extractCategories($);
  const body = extractBody($, title);
  const images = extractImages($, url, title);
  const mediaAttachments = extractMediaAttachments($, url);
  const author = extractAuthor($);
  const publishedAt = extractPublishedAt($);

  return {
    title,
    url,
    issue,
    categories,
    body,
    images,
    mediaAttachments,
    author,
    publishedAt
  };
}

module.exports = {
  fetchArticlePage,
  parseArticle,
  extractTitle,
  extractIssue,
  extractCategories,
  extractBody,
  extractImages,
  extractMediaAttachments,
  extractAuthor,
  extractPublishedAt
};

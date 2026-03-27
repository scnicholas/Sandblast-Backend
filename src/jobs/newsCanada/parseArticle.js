const cheerio = require("cheerio");
const { NEWS_CANADA_CONFIG } = require("./config");
const { fetchWithRetry } = require("./http");
const { cleanText, cleanMultilineText, toAbsoluteUrl } = require("./utils");

const STOP_MARKERS = [
  "media attachments",
  "related posts",
  "terms of use",
  "editor's picks",
  "editors picks",
  "posting instructions",
  "contact us at",
  "audio preview",
  "related audio",
  "related video",
  "image view",
  "currently online",
  "newsletter sign-up"
];

const CATEGORY_ALLOWLIST = /^(55\+|automotive|business|education|family|finance|food|food & nutrition|health|home|lifestyle|technology|travel|multimedia|government|safety|parenting|pets|money|environment|real estate|housing|consumer|careers?)/i;

function fetchArticlePage(url, logger) {
  return fetchWithRetry(url, {
    retries: NEWS_CANADA_CONFIG.retries,
    retryDelayMs: NEWS_CANADA_CONFIG.retryDelayMs,
    timeoutMs: NEWS_CANADA_CONFIG.timeoutMs,
    userAgent: NEWS_CANADA_CONFIG.userAgent,
    logger
  }).then((response) => response.data);
}

function textFromMeta($, names) {
  for (const name of names) {
    const value = cleanText($(name).attr("content"));
    if (value) return value;
  }
  return "";
}

function extractTitle($) {
  return (
    cleanText($("article h1").first().text()) ||
    cleanText($("main h1").first().text()) ||
    cleanText($("h1").first().text()) ||
    textFromMeta($, [
      "meta[property='og:title']",
      "meta[name='twitter:title']",
      "meta[name='title']"
    ]) ||
    cleanText($("title").text())
  );
}

function extractIssue($) {
  const labelNodes = ["[class*='issue']", "[id*='issue']", "dt", "strong", "b"];

  for (const selector of labelNodes) {
    const nodes = $(selector).toArray();
    for (const node of nodes) {
      const label = cleanText($(node).text()).toLowerCase();
      if (label !== "issue") continue;

      const sibling = cleanText($(node).next().text());
      const parentText = cleanText($(node).parent().text()).replace(/^Issue\s*/i, "").trim();

      if (sibling) return sibling;
      if (parentText && parentText.toLowerCase() !== "issue") return parentText;
    }
  }

  const pageText = cleanText($("body").text());
  const match = pageText.match(/\bIssue\s+([A-Za-z]+\s+\d{4})\b/i);
  return match ? cleanText(match[1]) : "";
}

function extractPublishedAt($) {
  return (
    textFromMeta($, [
      "meta[property='article:published_time']",
      "meta[name='pubdate']",
      "meta[name='publish-date']",
      "meta[name='date']"
    ]) ||
    cleanText($("time").first().attr("datetime")) ||
    cleanText($("time").first().text())
  );
}

function extractAuthor($) {
  return (
    textFromMeta($, [
      "meta[name='author']",
      "meta[property='article:author']"
    ]) ||
    cleanText($("[rel='author']").first().text()) ||
    cleanText($("[class*='author']").first().text())
  );
}

function extractKeywords($) {
  const keywords = new Set();
  const metaKeywords = cleanText($("meta[name='keywords']").attr("content"));

  if (metaKeywords) {
    metaKeywords.split(",").forEach((entry) => {
      const value = cleanText(entry);
      if (value) keywords.add(value);
    });
  }

  $("a[rel='tag'], .tags a, [class*='tag'] a").each((_, el) => {
    const value = cleanText($(el).text());
    if (value) keywords.add(value);
  });

  return Array.from(keywords).slice(0, 12);
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
    "read more",
    "français",
    "search",
    "menu"
  ]);

  const candidateSelectors = [
    "nav[aria-label*='breadcrumb' i] a",
    "[class*='category'] a",
    "[class*='category'] span",
    "[class*='categories'] a",
    "[class*='categories'] span",
    "article a",
    "main a"
  ];

  candidateSelectors.forEach((selector) => {
    $(selector).each((_, el) => {
      const text = cleanText($(el).text());
      const lower = text.toLowerCase();
      if (!text || ignore.has(lower)) return;
      if (text.length > 40) return;
      if (!/^[A-Za-z0-9+&'’*(),\-\/\s]+$/.test(text)) return;
      if (!CATEGORY_ALLOWLIST.test(text)) return;
      categories.add(text);
    });
  });

  return Array.from(categories).slice(0, 8);
}

function isStopMarker(text) {
  const value = String(text || "").toLowerCase();
  return STOP_MARKERS.some((marker) => value.includes(marker));
}

function selectBestBodyRoot($) {
  const candidates = [
    "article",
    "[role='main'] article",
    "[role='main']",
    "main article",
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

function shouldSkipBlock(text) {
  if (!text) return true;
  if (isStopMarker(text)) return true;
  if (/^(search|menu|faq|contact us|about us)$/i.test(text)) return true;
  if (/^image:?$/i.test(text)) return true;
  if (/^www\.newscanada\.com$/i.test(text)) return true;
  return false;
}

function isThinUsefulText(text) {
  if (!text) return false;
  if (text.length >= 40) return true;
  return /[.?!:;]/.test(text) || /\d/.test(text) || text.split(/\s+/).length >= 6;
}

function buildBodyDiagnostics(body, parts, scanned) {
  return {
    scannedNodes: scanned,
    partCount: parts.length,
    bodyLength: String(body || "").length,
    thinBody: String(body || "").length > 0 && String(body || "").length < 280
  };
}

function extractBody($, title) {
  const root = selectBestBodyRoot($).clone();
  root.find("script, style, nav, header, footer, form, noscript, iframe, button, .share, .social, .related, .newsletter, .advertisement").remove();

  const parts = [];
  const seen = new Set();
  let scanned = 0;

  root.find("h2,h3,p,li").each((_, el) => {
    if (scanned >= NEWS_CANADA_CONFIG.maxBodyNodesToScan) return false;
    scanned += 1;

    const text = cleanText($(el).text());
    if (shouldSkipBlock(text)) return;
    if (title && text === title) return;
    if (seen.has(text)) return;
    if (!isThinUsefulText(text)) return;

    seen.add(text);
    parts.push(text);
  });

  let body = cleanMultilineText(parts.join("\n\n"));

  if (!body || body.length < 160) {
    const fallbackParts = [];
    root.find("p,li").each((_, el) => {
      const text = cleanText($(el).text());
      if (!text || shouldSkipBlock(text)) return;
      if (title && text === title) return;
      if (seen.has(text)) return;
      if (text.length < 20) return;
      seen.add(text);
      fallbackParts.push(text);
    });

    const fallbackJoined = cleanMultilineText(fallbackParts.join("\n\n"));
    if (fallbackJoined && fallbackJoined.length > body.length) {
      body = fallbackJoined;
    }
  }

  if (!body) {
    const fallback = cleanMultilineText(cleanText(root.text()));
    body = isStopMarker(fallback) ? "" : fallback;
  }

  return {
    body,
    diagnostics: buildBodyDiagnostics(body, parts, scanned)
  };
}

function pushImage(images, seen, src, alt, caption) {
  if (!src || !/^https?:\/\//i.test(src)) return;
  if (/\.(svg)$/i.test(src)) return;
  if (/data:image\//i.test(src)) return;
  if (/logo|icon|sprite|avatar/i.test(src)) return;

  const key = `${src}::${caption || ""}`;
  if (seen.has(key)) return;
  seen.add(key);

  images.push({ url: src, alt: alt || "", caption: caption || "" });
}

function extractImages($, articleUrl, title) {
  const images = [];
  const seen = new Set();
  const root = selectBestBodyRoot($);

  root.find("figure img, article img, main img, img").each((_, img) => {
    const rawSrc = cleanText(
      $(img).attr("src") ||
      $(img).attr("data-src") ||
      $(img).attr("data-lazy-src") ||
      $(img).attr("data-original")
    );
    const src = rawSrc ? toAbsoluteUrl(rawSrc, articleUrl) : "";
    const alt = cleanText($(img).attr("alt")) || title || "";
    const caption = cleanText($(img).closest("figure").find("figcaption").first().text());
    pushImage(images, seen, src, alt, caption);
  });

  if (!images.length) {
    const ogImage = textFromMeta($, ["meta[property='og:image']", "meta[name='twitter:image']"]);
    const src = ogImage ? toAbsoluteUrl(ogImage, articleUrl) : "";
    pushImage(images, seen, src, title || "", "");
  }

  return images;
}

function extractMediaAttachments($, articleUrl) {
  const mediaAttachments = [];
  const seen = new Set();
  const root = selectBestBodyRoot($);

  root.find("a").each((_, a) => {
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
      lowerLabel.includes("video") ||
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
  const keywords = extractKeywords($);
  const bodyResult = extractBody($, title);
  const images = extractImages($, url, title);
  const mediaAttachments = extractMediaAttachments($, url);
  const author = extractAuthor($);
  const publishedAt = extractPublishedAt($);

  return {
    title,
    url,
    issue,
    categories,
    keywords,
    body: bodyResult.body,
    images,
    mediaAttachments,
    author,
    publishedAt,
    diagnostics: {
      body: bodyResult.diagnostics,
      imageCount: images.length,
      attachmentCount: mediaAttachments.length,
      hasPublishedAt: !!publishedAt,
      hasAuthor: !!author
    }
  };
}

module.exports = {
  fetchArticlePage,
  parseArticle,
  extractTitle,
  extractIssue,
  extractCategories,
  extractKeywords,
  extractBody,
  extractImages,
  extractMediaAttachments,
  extractAuthor,
  extractPublishedAt
};

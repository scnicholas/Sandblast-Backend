const axios = require("axios");
const cheerio = require("cheerio");

function cleanText(value = "") {
  return String(value).replace(/\s+/g, " ").trim();
}

async function fetchArticlePage(url) {
  const response = await axios.get(url, {
    headers: {
      "User-Agent": "SandblastNewsBot/1.0",
      Accept: "text/html,application/xhtml+xml"
    },
    timeout: 20000
  });

  return response.data;
}

function extractIssue($) {
  let issue = "";

  $("body *").each((_, el) => {
    const text = cleanText($(el).text());

    if (text === "Issue") {
      const nextText = cleanText($(el).next().text());
      if (nextText) {
        issue = nextText;
      }
    }
  });

  return issue;
}

function extractCategories($) {
  const categories = [];
  const ignore = new Set([
    "home",
    "articles",
    "radio",
    "video",
    "editors picks",
    "editor's picks",
    "related posts",
    "terms of use",
    "media attachments"
  ]);

  $("a").each((_, a) => {
    const text = cleanText($(a).text());
    const normalized = text.toLowerCase();

    if (!text) return;
    if (ignore.has(normalized)) return;
    if (text.length > 40) return;
    if (categories.includes(text)) return;

    if (/^[A-Za-z0-9+&'’*(),\-\/\s]+$/.test(text)) {
      categories.push(text);
    }
  });

  return categories;
}

function extractBody($, title) {
  const paragraphs = [];
  let capture = false;

  $("body")
    .find("*")
    .each((_, el) => {
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

      // Prefer paragraph-like chunks
      if (["p", "div", "span", "section"].includes(tag) && text.length > 60) {
        if (!paragraphs.includes(text)) {
          paragraphs.push(text);
        }
      }
    });

  return paragraphs.join("\n\n");
}

function extractMediaAttachments($) {
  const mediaAttachments = [];

  $("a").each((_, a) => {
    const label = cleanText($(a).text());
    const href = cleanText($(a).attr("href") || "");

    if (!label && !href) return;

    const lowerLabel = label.toLowerCase();
    const lowerHref = href.toLowerCase();

    if (
      lowerLabel.includes("audio") ||
      lowerLabel.includes("segment") ||
      lowerLabel.includes("download") ||
      lowerLabel.includes("preview") ||
      /\.(mp3|wav|jpg|jpeg|png|mp4|pdf)$/i.test(lowerHref)
    ) {
      mediaAttachments.push({
        label,
        href
      });
    }
  });

  return mediaAttachments;
}

function parseArticle(html, url) {
  const $ = cheerio.load(html);

  const title =
    cleanText($("h1").first().text()) ||
    cleanText($("meta[property='og:title']").attr("content")) ||
    cleanText($("title").text());

  const issue = extractIssue($);
  const categories = extractCategories($);
  const body = extractBody($, title);
  const mediaAttachments = extractMediaAttachments($);

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
  cleanText,
  extractIssue,
  extractCategories,
  extractBody,
  extractMediaAttachments
};

const { NEWS_CANADA_CONFIG } = require("./config");

function validateArticle(article) {
  const errors = [];

  if (!article.title) errors.push("missing_title");
  if (!article.url) errors.push("missing_url");
  if (!article.body) errors.push("missing_body");
  if ((article.body || "").length < NEWS_CANADA_CONFIG.minBodyLength) {
    errors.push("thin_body");
  }

  return {
    ok: errors.length === 0,
    errors
  };
}

module.exports = { validateArticle };

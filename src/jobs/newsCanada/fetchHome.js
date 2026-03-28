const { NEWS_CANADA_CONFIG } = require("./config");
const { fetchWithRetry } = require("./http");

async function fetchHomePage(logger) {
  const response = await fetchWithRetry(NEWS_CANADA_CONFIG.homeUrl, {
    retries: NEWS_CANADA_CONFIG.retries,
    retryDelayMs: NEWS_CANADA_CONFIG.retryDelayMs,
    timeoutMs: NEWS_CANADA_CONFIG.timeoutMs,
    userAgent: NEWS_CANADA_CONFIG.userAgent,
    logger
  });

  return {
    url: response.url,
    requestedUrl: response.requestedUrl,
    html: response.data,
    status: response.status,
    headers: response.headers
  };
}

module.exports = { fetchHomePage };

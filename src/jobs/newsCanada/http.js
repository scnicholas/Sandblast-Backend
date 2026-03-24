const axios = require("axios");
const { sleep } = require("./utils");

async function fetchWithRetry(url, options = {}) {
  const {
    retries = 3,
    retryDelayMs = 1000,
    timeoutMs = 20000,
    userAgent = "SandblastNewsBot/2.0",
    responseType = "text",
    logger = console
  } = options;

  let lastError = null;

  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      const response = await axios.get(url, {
        timeout: timeoutMs,
        responseType,
        headers: {
          "User-Agent": userAgent,
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
        },
        validateStatus: (status) => status >= 200 && status < 400
      });

      return {
        url,
        status: response.status,
        headers: response.headers,
        data: response.data
      };
    } catch (error) {
      lastError = error;
      logger.warn(`Fetch failed (attempt ${attempt}/${retries})`, url, error.message);

      if (attempt < retries) {
        await sleep(retryDelayMs * attempt);
      }
    }
  }

  throw lastError;
}

module.exports = { fetchWithRetry };

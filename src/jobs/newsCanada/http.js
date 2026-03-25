const axios = require("axios");
const { sleep } = require("./utils");

const DEFAULT_ACCEPT = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8";
const RETRYABLE_STATUS_CODES = new Set([408, 425, 429, 500, 502, 503, 504]);
const RETRYABLE_ERROR_CODES = new Set([
  "ECONNABORTED",
  "ECONNRESET",
  "ENOTFOUND",
  "ETIMEDOUT",
  "EAI_AGAIN",
  "ERR_NETWORK"
]);

function toPositiveInteger(value, fallback) {
  const num = Number(value);
  return Number.isFinite(num) && num > 0 ? Math.floor(num) : fallback;
}

function normalizeHeaders(headers = {}, accept) {
  return {
    Accept: accept || DEFAULT_ACCEPT,
    "Accept-Language": "en-CA,en;q=0.9",
    "Cache-Control": "no-cache",
    Pragma: "no-cache",
    ...headers
  };
}

function shouldRetry(error) {
  const status = error?.response?.status;
  if (RETRYABLE_STATUS_CODES.has(status)) return true;

  const code = error?.code;
  if (RETRYABLE_ERROR_CODES.has(code)) return true;

  return !error?.response;
}

function buildBackoff(attempt, baseDelayMs) {
  const safeBase = toPositiveInteger(baseDelayMs, 1000);
  return safeBase * attempt;
}

async function fetchWithRetry(url, options = {}) {
  const {
    retries = 3,
    retryDelayMs = 1000,
    timeoutMs = 20000,
    userAgent = "SandblastNewsBot/2.1",
    responseType = "text",
    responseEncoding = "utf8",
    maxRedirects = 5,
    headers = {},
    logger = console,
    validateStatus
  } = options;

  const safeRetries = toPositiveInteger(retries, 3);
  const safeTimeoutMs = toPositiveInteger(timeoutMs, 20000);
  let lastError = null;

  for (let attempt = 1; attempt <= safeRetries; attempt += 1) {
    try {
      if (logger && typeof logger.debug === "function") {
        logger.debug("[http] fetch attempt", {
          url,
          attempt,
          retries: safeRetries,
          timeoutMs: safeTimeoutMs,
          responseType
        });
      }

      const response = await axios.get(url, {
        timeout: safeTimeoutMs,
        responseType,
        responseEncoding,
        maxRedirects: toPositiveInteger(maxRedirects, 5),
        decompress: true,
        headers: normalizeHeaders(
          {
            "User-Agent": userAgent,
            ...headers
          },
          headers.Accept
        ),
        validateStatus: typeof validateStatus === "function"
          ? validateStatus
          : (status) => status >= 200 && status < 400
      });

      const finalUrl =
        response?.request?.res?.responseUrl ||
        response?.request?.responseURL ||
        url;

      return {
        url: finalUrl,
        requestedUrl: url,
        status: response.status,
        headers: response.headers,
        data: response.data
      };
    } catch (error) {
      lastError = error;
      const retryable = shouldRetry(error);
      const status = error?.response?.status || null;
      const message = error?.message || "Unknown fetch error";

      if (logger && typeof logger.warn === "function") {
        logger.warn("[http] fetch failed", {
          url,
          attempt,
          retries: safeRetries,
          retryable,
          status,
          code: error?.code || "",
          message
        });
      }

      if (!retryable || attempt >= safeRetries) break;
      await sleep(buildBackoff(attempt, retryDelayMs));
    }
  }

  throw lastError;
}

module.exports = { fetchWithRetry };

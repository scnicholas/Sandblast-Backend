"use strict";

/**
 * LocalTranslationProvider.js
 * Marion/Nyx Universal Translator Provider Boundary
 *
 * Purpose:
 * - Provides a clean local provider interface for the Universal Translator.
 * - Keeps Marion's core response architecture untouched.
 * - Supports no-provider fallback, manual test dictionary, and future local engines.
 *
 * Supported Phase 1 providers:
 * - identity
 * - manualDictionary
 *
 * Future providers:
 * - localLibreTranslate
 * - argos
 * - localNmt
 * - huggingFaceLocal
 *
 * Important:
 * - No paid API required.
 * - No remote provider enabled by default.
 * - Fails closed to original text.
 */

const http = require("http");
const https = require("https");

const DEFAULT_TIMEOUT_MS = 8000;
const DEFAULT_MAX_CHARACTERS = 4500;

const SUPPORTED_PROVIDERS = [
  "none",
  "identity",
  "manualDictionary",
  "localLibreTranslate",
  "argos",
  "localNmt",
  "huggingFaceLocal"
];

const MANUAL_DICTIONARY = {
  "en:fr": {
    "Start Reading": "Commencer la lecture",
    "Canada Feed": "Flux Canada",
    "Sports Feed": "Flux Sports",
    "Finance & Economics": "Finance et économie",
    "Synapse is live on Sandblast Channel.": "Synapse est en direct sur Sandblast Channel."
  },
  "fr:en": {
    "Commencer la lecture": "Start Reading",
    "Flux Canada": "Canada Feed",
    "Flux Sports": "Sports Feed",
    "Finance et économie": "Finance & Economics"
  },
  "en:es": {
    "Start Reading": "Comenzar a leer",
    "Canada Feed": "Canal de Canadá",
    "Sports Feed": "Canal de deportes",
    "Finance & Economics": "Finanzas y economía",
    "Synapse is live on Sandblast Channel.": "Synapse está en vivo en Sandblast Channel."
  },
  "es:en": {
    "Comenzar a leer": "Start Reading",
    "Canal de Canadá": "Canada Feed",
    "Canal de deportes": "Sports Feed",
    "Finanzas y economía": "Finance & Economics"
  },
  "fr:es": {
    "Commencer la lecture": "Comenzar a leer",
    "Flux Canada": "Canal de Canadá",
    "Flux Sports": "Canal de deportes",
    "Finance et économie": "Finanzas y economía"
  },
  "es:fr": {
    "Comenzar a leer": "Commencer la lecture",
    "Canal de Canadá": "Flux Canada",
    "Canal de deportes": "Flux Sports",
    "Finanzas y economía": "Finance et économie"
  }
};

function normalizeLanguageCode(lang) {
  if (!lang || typeof lang !== "string") return "auto";

  const value = lang.trim().toLowerCase();

  if (value.startsWith("en")) return "en";
  if (value.startsWith("fr")) return "fr";
  if (value.startsWith("es")) return "es";

  return value || "auto";
}

function normalizeProviderName(providerName) {
  if (!providerName || typeof providerName !== "string") return "none";

  const value = providerName.trim();

  return SUPPORTED_PROVIDERS.includes(value) ? value : "none";
}

function createProviderMeta({
  provider,
  sourceLanguage,
  targetLanguage,
  translated = false,
  warning = null,
  characterCount = 0,
  durationMs = 0
}) {
  return {
    provider,
    translated,
    sourceLanguage,
    targetLanguage,
    characterCount,
    durationMs,
    warning
  };
}

function shouldTranslate(text, sourceLanguage, targetLanguage) {
  if (!text || typeof text !== "string") return false;

  const source = normalizeLanguageCode(sourceLanguage);
  const target = normalizeLanguageCode(targetLanguage);

  if (!target || target === "auto") return false;
  if (!source || source === "unknown") return false;
  if (source === target) return false;

  return true;
}

function enforceCharacterLimit(text, maxCharacters = DEFAULT_MAX_CHARACTERS) {
  if (!text || typeof text !== "string") {
    return {
      allowed: false,
      text,
      warning: "empty-or-invalid-text"
    };
  }

  if (text.length <= maxCharacters) {
    return {
      allowed: true,
      text,
      warning: null
    };
  }

  return {
    allowed: false,
    text,
    warning: `max-character-limit-exceeded:${text.length}/${maxCharacters}`
  };
}

function translateWithIdentity(text, sourceLanguage, targetLanguage) {
  return {
    text,
    meta: createProviderMeta({
      provider: "identity",
      sourceLanguage,
      targetLanguage,
      translated: false,
      warning: "identity-provider"
    })
  };
}

function translateWithManualDictionary(text, sourceLanguage, targetLanguage) {
  const source = normalizeLanguageCode(sourceLanguage);
  const target = normalizeLanguageCode(targetLanguage);
  const pair = `${source}:${target}`;

  const dictionary = MANUAL_DICTIONARY[pair] || {};
  const translatedText = dictionary[text];

  if (!translatedText) {
    return {
      text,
      meta: createProviderMeta({
        provider: "manualDictionary",
        sourceLanguage: source,
        targetLanguage: target,
        translated: false,
        characterCount: text.length,
        warning: "manual-dictionary-miss"
      })
    };
  }

  return {
    text: translatedText,
    meta: createProviderMeta({
      provider: "manualDictionary",
      sourceLanguage: source,
      targetLanguage: target,
      translated: true,
      characterCount: text.length,
      warning: null
    })
  };
}

function requestJson(urlString, payload, options = {}) {
  const timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;

  return new Promise((resolve, reject) => {
    let url;

    try {
      url = new URL(urlString);
    } catch (_) {
      reject(new Error("invalid-provider-url"));
      return;
    }

    const client = url.protocol === "https:" ? https : http;

    const body = JSON.stringify(payload || {});

    const requestOptions = {
      method: "POST",
      hostname: url.hostname,
      port: url.port || (url.protocol === "https:" ? 443 : 80),
      path: `${url.pathname}${url.search}`,
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body)
      }
    };

    const req = client.request(requestOptions, (res) => {
      let raw = "";

      res.setEncoding("utf8");

      res.on("data", (chunk) => {
        raw += chunk;
      });

      res.on("end", () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error(`provider-http-${res.statusCode}`));
          return;
        }

        try {
          resolve(JSON.parse(raw));
        } catch (_) {
          reject(new Error("provider-invalid-json"));
        }
      });
    });

    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error("provider-timeout"));
    });

    req.on("error", reject);

    req.write(body);
    req.end();
  });
}

/**
 * Future local LibreTranslate-compatible provider.
 *
 * Expected local endpoint:
 * POST http://localhost:5000/translate
 *
 * Expected payload:
 * {
 *   q: "Hello",
 *   source: "en",
 *   target: "fr",
 *   format: "text"
 * }
 *
 * Expected response:
 * {
 *   translatedText: "Bonjour"
 * }
 */
async function translateWithLocalLibreTranslate(text, sourceLanguage, targetLanguage, providerConfig = {}) {
  const endpoint =
    providerConfig.endpoint ||
    providerConfig.url ||
    "http://localhost:5000/translate";

  const response = await requestJson(
    endpoint,
    {
      q: text,
      source: normalizeLanguageCode(sourceLanguage),
      target: normalizeLanguageCode(targetLanguage),
      format: "text"
    },
    {
      timeoutMs: providerConfig.timeoutMs || DEFAULT_TIMEOUT_MS
    }
  );

  const translatedText =
    response.translatedText ||
    response.translation ||
    response.text ||
    null;

  if (!translatedText || typeof translatedText !== "string") {
    throw new Error("provider-missing-translated-text");
  }

  return translatedText;
}

/**
 * Future Argos/local NMT bridge.
 *
 * This expects a small local HTTP service, not a paid API.
 * We do this so Marion does not load heavy ML code inside the main runtime.
 */
async function translateWithLocalNmt(text, sourceLanguage, targetLanguage, providerConfig = {}) {
  const endpoint =
    providerConfig.endpoint ||
    providerConfig.url ||
    "http://localhost:7010/translate";

  const response = await requestJson(
    endpoint,
    {
      text,
      sourceLanguage: normalizeLanguageCode(sourceLanguage),
      targetLanguage: normalizeLanguageCode(targetLanguage)
    },
    {
      timeoutMs: providerConfig.timeoutMs || DEFAULT_TIMEOUT_MS
    }
  );

  const translatedText =
    response.translatedText ||
    response.translation ||
    response.output ||
    response.text ||
    null;

  if (!translatedText || typeof translatedText !== "string") {
    throw new Error("provider-missing-translated-text");
  }

  return translatedText;
}

/**
 * translate()
 *
 * Main provider function.
 *
 * Usage:
 * const result = await LocalTranslationProvider.translate("Hello", {
 *   provider: "manualDictionary",
 *   sourceLanguage: "en",
 *   targetLanguage: "fr"
 * });
 */
async function translate(text, options = {}) {
  const startedAt = Date.now();

  const provider = normalizeProviderName(
    options.provider ||
      options.active ||
      options.providerName ||
      "none"
  );

  const sourceLanguage = normalizeLanguageCode(options.sourceLanguage || "auto");
  const targetLanguage = normalizeLanguageCode(options.targetLanguage || "en");

  const maxCharacters = Number.isFinite(options.maxCharactersPerRequest)
    ? options.maxCharactersPerRequest
    : DEFAULT_MAX_CHARACTERS;

  const characterGuard = enforceCharacterLimit(text, maxCharacters);

  if (!characterGuard.allowed) {
    return {
      text,
      meta: createProviderMeta({
        provider,
        sourceLanguage,
        targetLanguage,
        translated: false,
        characterCount: typeof text === "string" ? text.length : 0,
        durationMs: Date.now() - startedAt,
        warning: characterGuard.warning
      })
    };
  }

  if (!shouldTranslate(text, sourceLanguage, targetLanguage)) {
    return {
      text,
      meta: createProviderMeta({
        provider,
        sourceLanguage,
        targetLanguage,
        translated: false,
        characterCount: text.length,
        durationMs: Date.now() - startedAt,
        warning: "translation-not-required"
      })
    };
  }

  try {
    if (provider === "none" || provider === "identity") {
      const result = translateWithIdentity(text, sourceLanguage, targetLanguage);

      result.meta.durationMs = Date.now() - startedAt;
      result.meta.characterCount = text.length;

      return result;
    }

    if (provider === "manualDictionary") {
      const result = translateWithManualDictionary(
        text,
        sourceLanguage,
        targetLanguage
      );

      result.meta.durationMs = Date.now() - startedAt;

      return result;
    }

    if (provider === "localLibreTranslate") {
      const translatedText = await translateWithLocalLibreTranslate(
        text,
        sourceLanguage,
        targetLanguage,
        options.providerConfig || options
      );

      return {
        text: translatedText,
        meta: createProviderMeta({
          provider,
          sourceLanguage,
          targetLanguage,
          translated: true,
          characterCount: text.length,
          durationMs: Date.now() - startedAt,
          warning: null
        })
      };
    }

    if (
      provider === "argos" ||
      provider === "localNmt" ||
      provider === "huggingFaceLocal"
    ) {
      const translatedText = await translateWithLocalNmt(
        text,
        sourceLanguage,
        targetLanguage,
        options.providerConfig || options
      );

      return {
        text: translatedText,
        meta: createProviderMeta({
          provider,
          sourceLanguage,
          targetLanguage,
          translated: true,
          characterCount: text.length,
          durationMs: Date.now() - startedAt,
          warning: null
        })
      };
    }

    return {
      text,
      meta: createProviderMeta({
        provider,
        sourceLanguage,
        targetLanguage,
        translated: false,
        characterCount: text.length,
        durationMs: Date.now() - startedAt,
        warning: "unsupported-provider"
      })
    };
  } catch (error) {
    return {
      text,
      meta: createProviderMeta({
        provider,
        sourceLanguage,
        targetLanguage,
        translated: false,
        characterCount: typeof text === "string" ? text.length : 0,
        durationMs: Date.now() - startedAt,
        warning: `provider-failed:${error && error.message ? error.message : "unknown"}`
      })
    };
  }
}

module.exports = {
  VERSION: "0.1.0",
  SUPPORTED_PROVIDERS,
  MANUAL_DICTIONARY,
  normalizeLanguageCode,
  normalizeProviderName,
  shouldTranslate,
  enforceCharacterLimit,
  translate,
  translateWithIdentity,
  translateWithManualDictionary
};

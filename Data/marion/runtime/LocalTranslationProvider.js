"use strict";

/**
 * LocalTranslationProvider.js
 * Marion/Nyx Universal Translator Provider Boundary
 *
 * Hardened Phase-1 provider.
 *
 * Design rules:
 * - Provider-neutral: supports local/self-hosted engines without forcing paid APIs.
 * - Fail-closed: returns original text on provider failure.
 * - Adapter-compatible: exposes translate() and translateText().
 * - Local-first: remote endpoints are blocked unless explicitly enabled.
 * - English/French/Spanish first.
 */

const http = require("http");
const https = require("https");

const VERSION = "0.2.0";
const DEFAULT_TIMEOUT_MS = 8000;
const DEFAULT_MAX_CHARACTERS = 4500;
const DEFAULT_MAX_RESPONSE_BYTES = 1024 * 512;

const SUPPORTED_PROVIDERS = [
  "none",
  "identity",
  "manualDictionary",
  "localLibreTranslate",
  "localHttp",
  "localModule",
  "localProvider",
  "argos",
  "localNmt",
  "huggingFaceLocal"
];

const PROVIDER_ALIASES = {
  manual: "manualDictionary",
  dictionary: "manualDictionary",
  manual_dictionary: "manualDictionary",
  local: "localHttp",
  libretranslate: "localLibreTranslate",
  libreTranslate: "localLibreTranslate",
  localProvider: "localModule"
};

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0"]);

const MANUAL_DICTIONARY = {
  "en:fr": {
    "Start Reading": "Commencer la lecture",
    "Open Feed": "Ouvrir le flux",
    "Canada Feed": "Flux Canada",
    "Sports Feed": "Flux Sports",
    "Finance & Economics": "Finance et économie",
    "Curated feeds": "Flux sélectionnés",
    "Real perspectives": "Perspectives réelles",
    "All in one place": "Tout au même endroit",
    "Synapse is live": "Synapse est en direct",
    "Synapse is live on Sandblast Channel.": "Synapse est en direct sur Sandblast Channel."
  },
  "fr:en": {
    "Commencer la lecture": "Start Reading",
    "Ouvrir le flux": "Open Feed",
    "Flux Canada": "Canada Feed",
    "Flux Sports": "Sports Feed",
    "Finance et économie": "Finance & Economics",
    "Flux sélectionnés": "Curated feeds",
    "Perspectives réelles": "Real perspectives",
    "Tout au même endroit": "All in one place",
    "Synapse est en direct": "Synapse is live"
  },
  "en:es": {
    "Start Reading": "Comenzar a leer",
    "Open Feed": "Abrir fuente",
    "Canada Feed": "Canal de Canadá",
    "Sports Feed": "Canal de deportes",
    "Finance & Economics": "Finanzas y economía",
    "Curated feeds": "Fuentes seleccionadas",
    "Real perspectives": "Perspectivas reales",
    "All in one place": "Todo en un solo lugar",
    "Synapse is live": "Synapse está en vivo",
    "Synapse is live on Sandblast Channel.": "Synapse está en vivo en Sandblast Channel."
  },
  "es:en": {
    "Comenzar a leer": "Start Reading",
    "Abrir fuente": "Open Feed",
    "Canal de Canadá": "Canada Feed",
    "Canal de deportes": "Sports Feed",
    "Finanzas y economía": "Finance & Economics",
    "Fuentes seleccionadas": "Curated feeds",
    "Perspectivas reales": "Real perspectives",
    "Todo en un solo lugar": "All in one place",
    "Synapse está en vivo": "Synapse is live"
  },
  "fr:es": {
    "Commencer la lecture": "Comenzar a leer",
    "Ouvrir le flux": "Abrir fuente",
    "Flux Canada": "Canal de Canadá",
    "Flux Sports": "Canal de deportes",
    "Finance et économie": "Finanzas y economía"
  },
  "es:fr": {
    "Comenzar a leer": "Commencer la lecture",
    "Abrir fuente": "Ouvrir le flux",
    "Canal de Canadá": "Flux Canada",
    "Canal de deportes": "Flux Sports",
    "Finanzas y economía": "Finance et économie"
  }
};

function normalizeLanguageCode(lang) {
  if (!lang || typeof lang !== "string") return "auto";
  const value = lang.trim().toLowerCase();
  if (!value) return "auto";
  if (value === "auto") return "auto";
  if (value === "unknown") return "unknown";
  if (value.startsWith("en")) return "en";
  if (value.startsWith("fr")) return "fr";
  if (value.startsWith("es")) return "es";
  return "unknown";
}

function normalizeProviderName(providerName) {
  if (!providerName || typeof providerName !== "string") return "none";
  const raw = providerName.trim();
  const aliased = PROVIDER_ALIASES[raw] || raw;
  return SUPPORTED_PROVIDERS.includes(aliased) ? aliased : "none";
}

function countCharacters(text) {
  return typeof text === "string" ? Array.from(text).length : 0;
}

function normalizeDictionaryKey(text) {
  if (!text || typeof text !== "string") return "";
  return text.normalize("NFC").replace(/\s+/g, " ").trim();
}

function createProviderMeta({ provider, sourceLanguage, targetLanguage, translated = false, warning = null, error = null, characterCount = 0, durationMs = 0, endpointType = null }) {
  return {
    provider,
    translated,
    sourceLanguage,
    targetLanguage,
    languagePair: `${sourceLanguage || "unknown"}-${targetLanguage || "unknown"}`,
    characterCount,
    durationMs,
    endpointType,
    warning,
    error
  };
}

function shouldTranslate(text, sourceLanguage, targetLanguage) {
  if (!text || typeof text !== "string") return false;
  const source = normalizeLanguageCode(sourceLanguage);
  const target = normalizeLanguageCode(targetLanguage);
  if (!target || target === "auto" || target === "unknown") return false;
  if (!source || source === "auto" || source === "unknown") return false;
  if (source === target) return false;
  return true;
}

function enforceCharacterLimit(text, maxCharacters = DEFAULT_MAX_CHARACTERS) {
  const characterCount = countCharacters(text);
  if (!text || typeof text !== "string") {
    return { allowed: false, characterCount, warning: "empty-or-invalid-text" };
  }
  if (characterCount <= maxCharacters) {
    return { allowed: true, characterCount, warning: null };
  }
  return { allowed: false, characterCount, warning: `max-character-limit-exceeded:${characterCount}/${maxCharacters}` };
}

function isLocalEndpoint(url) {
  if (!url || typeof url !== "object") return false;
  return LOCAL_HOSTS.has(url.hostname);
}

function assertEndpointAllowed(urlString, options = {}) {
  let url;
  try {
    url = new URL(urlString);
  } catch (_) {
    throw new Error("invalid-provider-url");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("unsupported-provider-protocol");
  }
  const allowRemoteProviders = options.allowRemoteProviders === true;
  const allowSelfHostedProviders = options.allowSelfHostedProviders !== false;
  const local = isLocalEndpoint(url);
  if (local && allowSelfHostedProviders) return url;
  if (!local && allowRemoteProviders) return url;
  throw new Error(local ? "self-hosted-provider-disabled" : "remote-provider-blocked-by-config");
}

function translateWithIdentity(text, sourceLanguage, targetLanguage) {
  return {
    text,
    meta: createProviderMeta({
      provider: "identity",
      sourceLanguage,
      targetLanguage,
      translated: false,
      characterCount: countCharacters(text),
      warning: "identity-provider"
    })
  };
}

function lookupManualDictionary(text, sourceLanguage, targetLanguage) {
  const source = normalizeLanguageCode(sourceLanguage);
  const target = normalizeLanguageCode(targetLanguage);
  const pair = `${source}:${target}`;
  const dictionary = MANUAL_DICTIONARY[pair] || {};
  if (Object.prototype.hasOwnProperty.call(dictionary, text)) return dictionary[text];
  const normalizedText = normalizeDictionaryKey(text);
  for (const [key, value] of Object.entries(dictionary)) {
    if (normalizeDictionaryKey(key) === normalizedText) return value;
  }
  return null;
}

function translateWithManualDictionary(text, sourceLanguage, targetLanguage) {
  const source = normalizeLanguageCode(sourceLanguage);
  const target = normalizeLanguageCode(targetLanguage);
  const translatedText = lookupManualDictionary(text, source, target);
  if (!translatedText) {
    return { text, meta: createProviderMeta({ provider: "manualDictionary", sourceLanguage: source, targetLanguage: target, translated: false, characterCount: countCharacters(text), warning: "manual-dictionary-miss" }) };
  }
  return { text: translatedText, meta: createProviderMeta({ provider: "manualDictionary", sourceLanguage: source, targetLanguage: target, translated: true, characterCount: countCharacters(text), warning: null }) };
}

function requestJson(urlString, payload, options = {}) {
  const timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;
  const maxResponseBytes = options.maxResponseBytes || DEFAULT_MAX_RESPONSE_BYTES;
  const url = assertEndpointAllowed(urlString, options);
  return new Promise((resolve, reject) => {
    const client = url.protocol === "https:" ? https : http;
    const body = JSON.stringify(payload || {});
    const requestOptions = {
      method: "POST",
      hostname: url.hostname,
      port: url.port || (url.protocol === "https:" ? 443 : 80),
      path: `${url.pathname}${url.search}`,
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
        "User-Agent": "Marion-UniversalTranslator/0.2"
      }
    };
    const req = client.request(requestOptions, (res) => {
      let raw = "";
      let totalBytes = 0;
      res.setEncoding("utf8");
      res.on("data", (chunk) => {
        totalBytes += Buffer.byteLength(chunk, "utf8");
        if (totalBytes > maxResponseBytes) {
          req.destroy(new Error("provider-response-too-large"));
          return;
        }
        raw += chunk;
      });
      res.on("end", () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error(`provider-http-${res.statusCode}`));
          return;
        }
        try { resolve(JSON.parse(raw)); } catch (_) { reject(new Error("provider-invalid-json")); }
      });
    });
    req.setTimeout(timeoutMs, () => req.destroy(new Error("provider-timeout")));
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

function extractTranslatedText(response) {
  if (!response || typeof response !== "object") return null;
  const candidates = [response.translatedText, response.translation, response.output, response.text, response.result];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) return candidate;
  }
  if (response.data && typeof response.data === "object") return extractTranslatedText(response.data);
  return null;
}

async function translateWithLocalLibreTranslate(text, sourceLanguage, targetLanguage, providerConfig = {}) {
  const endpoint = providerConfig.endpoint || providerConfig.url || "http://localhost:5000/translate";
  const response = await requestJson(endpoint, {
    q: text,
    source: normalizeLanguageCode(sourceLanguage),
    target: normalizeLanguageCode(targetLanguage),
    format: "text"
  }, {
    timeoutMs: providerConfig.timeoutMs || DEFAULT_TIMEOUT_MS,
    maxResponseBytes: providerConfig.maxResponseBytes || DEFAULT_MAX_RESPONSE_BYTES,
    allowRemoteProviders: providerConfig.allowRemoteProviders === true,
    allowSelfHostedProviders: providerConfig.allowSelfHostedProviders !== false
  });
  const translatedText = extractTranslatedText(response);
  if (!translatedText) throw new Error("provider-missing-translated-text");
  return translatedText;
}

async function translateWithLocalNmt(text, sourceLanguage, targetLanguage, providerConfig = {}) {
  const endpoint = providerConfig.endpoint || providerConfig.url || "http://localhost:7010/translate";
  const response = await requestJson(endpoint, {
    text,
    sourceLanguage: normalizeLanguageCode(sourceLanguage),
    targetLanguage: normalizeLanguageCode(targetLanguage),
    source: normalizeLanguageCode(sourceLanguage),
    target: normalizeLanguageCode(targetLanguage),
    context: providerConfig.context || null,
    domain: providerConfig.domain || null,
    emotion: providerConfig.emotion || null
  }, {
    timeoutMs: providerConfig.timeoutMs || DEFAULT_TIMEOUT_MS,
    maxResponseBytes: providerConfig.maxResponseBytes || DEFAULT_MAX_RESPONSE_BYTES,
    allowRemoteProviders: providerConfig.allowRemoteProviders === true,
    allowSelfHostedProviders: providerConfig.allowSelfHostedProviders !== false
  });
  const translatedText = extractTranslatedText(response);
  if (!translatedText) throw new Error("provider-missing-translated-text");
  return translatedText;
}

async function translate(text, options = {}) {
  const startedAt = Date.now();
  const provider = normalizeProviderName(options.provider || options.active || options.providerName || "none");
  const sourceLanguage = normalizeLanguageCode(options.sourceLanguage || "auto");
  const targetLanguage = normalizeLanguageCode(options.targetLanguage || "en");
  const maxCharacters = Number.isFinite(options.maxCharactersPerRequest) ? options.maxCharactersPerRequest : DEFAULT_MAX_CHARACTERS;
  const characterGuard = enforceCharacterLimit(text, maxCharacters);
  if (!characterGuard.allowed) {
    return { text, meta: createProviderMeta({ provider, sourceLanguage, targetLanguage, translated: false, characterCount: characterGuard.characterCount, durationMs: Date.now() - startedAt, warning: characterGuard.warning }) };
  }
  if (!shouldTranslate(text, sourceLanguage, targetLanguage)) {
    return { text, meta: createProviderMeta({ provider, sourceLanguage, targetLanguage, translated: false, characterCount: countCharacters(text), durationMs: Date.now() - startedAt, warning: sourceLanguage === targetLanguage ? "same-language" : "translation-not-required" }) };
  }
  try {
    if (provider === "none" || provider === "identity") {
      const result = translateWithIdentity(text, sourceLanguage, targetLanguage);
      result.meta.durationMs = Date.now() - startedAt;
      return result;
    }
    if (provider === "manualDictionary") {
      const result = translateWithManualDictionary(text, sourceLanguage, targetLanguage);
      result.meta.durationMs = Date.now() - startedAt;
      return result;
    }
    if (provider === "localLibreTranslate" || provider === "localHttp") {
      const providerConfig = { ...(options.providerConfig || {}), ...options };
      const translatedText = await translateWithLocalLibreTranslate(text, sourceLanguage, targetLanguage, providerConfig);
      return { text: translatedText, meta: createProviderMeta({ provider, sourceLanguage, targetLanguage, translated: true, characterCount: countCharacters(text), durationMs: Date.now() - startedAt, endpointType: "local-http", warning: null }) };
    }
    if (provider === "argos" || provider === "localNmt" || provider === "huggingFaceLocal" || provider === "localModule" || provider === "localProvider") {
      const providerConfig = { ...(options.providerConfig || {}), ...options };
      const translatedText = await translateWithLocalNmt(text, sourceLanguage, targetLanguage, providerConfig);
      return { text: translatedText, meta: createProviderMeta({ provider, sourceLanguage, targetLanguage, translated: true, characterCount: countCharacters(text), durationMs: Date.now() - startedAt, endpointType: "local-nmt-http", warning: null }) };
    }
    return { text, meta: createProviderMeta({ provider, sourceLanguage, targetLanguage, translated: false, characterCount: countCharacters(text), durationMs: Date.now() - startedAt, warning: "unsupported-provider" }) };
  } catch (error) {
    const errorMessage = error && error.message ? error.message : "unknown";
    return { text, meta: createProviderMeta({ provider, sourceLanguage, targetLanguage, translated: false, characterCount: countCharacters(text), durationMs: Date.now() - startedAt, warning: `provider-failed:${errorMessage}`, error: errorMessage }) };
  }
}

async function translateText(text, options = {}, meta = null) {
  const result = await translate(text, options);
  if (meta && typeof meta === "object" && result && result.meta) Object.assign(meta, result.meta);
  return result;
}

module.exports = {
  VERSION,
  SUPPORTED_PROVIDERS,
  PROVIDER_ALIASES,
  MANUAL_DICTIONARY,
  LOCAL_HOSTS,
  normalizeLanguageCode,
  normalizeProviderName,
  countCharacters,
  shouldTranslate,
  enforceCharacterLimit,
  assertEndpointAllowed,
  requestJson,
  translate,
  translateText,
  translateWithIdentity,
  translateWithManualDictionary,
  translateWithLocalLibreTranslate,
  translateWithLocalNmt
};

"use strict";

/**
 * LocalTranslationProvider.js
 * Marion/Nyx Universal Translator Provider Boundary
 *
 * Hardened Phase-1/Phase-2 provider boundary.
 *
 * Design rules:
 * - Provider-neutral: supports local/self-hosted engines without forcing paid APIs.
 * - Fail-closed: returns original text on provider failure.
 * - Adapter-compatible: exposes translate() and translateText().
 * - Local-first: remote endpoints are blocked unless explicitly enabled.
 * - English/French/Spanish first.
 * - Safe metadata: every return shape is adapter-normalizable.
 */

const http = require("http");
const https = require("https");
const net = require("net");

const VERSION = "0.2.3";
const DEFAULT_TIMEOUT_MS = 8000;
const DEFAULT_MAX_CHARACTERS = 4500;
const DEFAULT_MAX_RESPONSE_BYTES = 1024 * 512;

const SUPPORTED_LANGUAGES = ["en", "fr", "es"];

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
  manualdictionary: "manualDictionary",
  manual_dictionary: "manualDictionary",
  manual_dictionary_provider: "manualDictionary",
  manual_dictionary_provider_boundary: "manualDictionary",
  manual_dictionary_provider_boundary_adapter: "manualDictionary",
  dictionary: "manualDictionary",
  dict: "manualDictionary",
  identityprovider: "identity",
  noneprovider: "none",
  local: "localHttp",
  localhttp: "localHttp",
  local_http: "localHttp",
  local_http_provider: "localHttp",
  http: "localHttp",
  libretranslate: "localLibreTranslate",
  localibretranslate: "localLibreTranslate",
  local_libretranslate: "localLibreTranslate",
  localprovider: "localModule",
  localmodule: "localModule",
  local_module: "localModule",
  local_provider_boundary: "localModule",
  local_provider_module: "localModule",
  local_module_provider: "localModule",
  localnmt: "localNmt",
  local_nmt: "localNmt",
  local_nmt_provider: "localNmt",
  huggingfacelocal: "huggingFaceLocal",
  huggingface_local: "huggingFaceLocal",
  huggingface_local_provider: "huggingFaceLocal"
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
    "Translate": "Traduire",
    "Language": "Langue",
    "Choose language": "Choisir la langue",
    "Synapse is live": "Synapse est en direct",
    "Synapse is live on Sandblast Channel.": "Synapse est en direct sur Sandblast Channel.",
    "Nyx is online.": "Nyx est en ligne.",
    "Nyx is ready.": "Nyx est prête."
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
    "Traduire": "Translate",
    "Langue": "Language",
    "Choisir la langue": "Choose language",
    "Synapse est en direct": "Synapse is live",
    "Synapse est en direct sur Sandblast Channel.": "Synapse is live on Sandblast Channel.",
    "Nyx est en ligne.": "Nyx is online.",
    "Nyx est prête.": "Nyx is ready."
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
    "Translate": "Traducir",
    "Language": "Idioma",
    "Choose language": "Elegir idioma",
    "Synapse is live": "Synapse está en vivo",
    "Synapse is live on Sandblast Channel.": "Synapse está en vivo en Sandblast Channel.",
    "Nyx is online.": "Nyx está en línea.",
    "Nyx is ready.": "Nyx está lista."
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
    "Traducir": "Translate",
    "Idioma": "Language",
    "Elegir idioma": "Choose language",
    "Synapse está en vivo": "Synapse is live",
    "Synapse está en vivo en Sandblast Channel.": "Synapse is live on Sandblast Channel.",
    "Nyx está en línea.": "Nyx is online.",
    "Nyx está lista.": "Nyx is ready."
  },
  "fr:es": {
    "Commencer la lecture": "Comenzar a leer",
    "Ouvrir le flux": "Abrir fuente",
    "Flux Canada": "Canal de Canadá",
    "Flux Sports": "Canal de deportes",
    "Finance et économie": "Finanzas y economía",
    "Traduire": "Traducir",
    "Langue": "Idioma"
  },
  "es:fr": {
    "Comenzar a leer": "Commencer la lecture",
    "Abrir fuente": "Ouvrir le flux",
    "Canal de Canadá": "Flux Canada",
    "Canal de deportes": "Flux Sports",
    "Finanzas y economía": "Finance et économie",
    "Traducir": "Traduire",
    "Idioma": "Langue"
  }
};

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

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
  if (!raw) return "none";

  if (SUPPORTED_PROVIDERS.includes(raw)) return raw;

  const compact = raw.replace(/[\s-]+/g, "_");
  const folded = compact.toLowerCase();
  const aliased = PROVIDER_ALIASES[folded] || PROVIDER_ALIASES[raw] || raw;

  return SUPPORTED_PROVIDERS.includes(aliased) ? aliased : "none";
}

function normalizePositiveInteger(value, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return fallback;
  return Math.floor(number);
}

function countCharacters(text) {
  return typeof text === "string" ? Array.from(text).length : 0;
}

function normalizeDictionaryKey(text) {
  if (!text || typeof text !== "string") return "";

  return text
    .normalize("NFC")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeDictionaryLookupKey(text) {
  return normalizeDictionaryKey(text)
    .toLocaleLowerCase("en")
    .replace(/[.!?]+$/g, "")
    .trim();
}

function deepFreezeDictionary(value) {
  if (!isPlainObject(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) {
    if (isPlainObject(child) && !Object.isFrozen(child)) deepFreezeDictionary(child);
  }
  return value;
}

deepFreezeDictionary(MANUAL_DICTIONARY);

function createProviderMeta({
  provider,
  sourceLanguage,
  targetLanguage,
  translated = false,
  warning = null,
  error = null,
  characterCount = 0,
  providerCharacterCount = null,
  durationMs = 0,
  endpointType = null,
  endpointHost = null,
  dictionaryHit = false,
  responseBytes = null
}) {
  const normalizedSource = normalizeLanguageCode(sourceLanguage || "unknown");
  const normalizedTarget = normalizeLanguageCode(targetLanguage || "unknown");

  return {
    provider: normalizeProviderName(provider),
    translated: translated === true,
    sourceLanguage: normalizedSource,
    targetLanguage: normalizedTarget,
    languagePair: `${normalizedSource || "unknown"}-${normalizedTarget || "unknown"}`,
    characterCount: Number.isFinite(Number(characterCount)) ? Number(characterCount) : 0,
    providerCharacterCount:
      providerCharacterCount === null ? null : Number(providerCharacterCount) || 0,
    durationMs: Number.isFinite(Number(durationMs)) ? Number(durationMs) : 0,
    endpointType,
    endpointHost,
    dictionaryHit: dictionaryHit === true,
    responseBytes,
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
  if (!SUPPORTED_LANGUAGES.includes(source)) return false;
  if (!SUPPORTED_LANGUAGES.includes(target)) return false;
  if (source === target) return false;

  return true;
}

function enforceCharacterLimit(text, maxCharacters = DEFAULT_MAX_CHARACTERS) {
  const safeMaxCharacters = normalizePositiveInteger(maxCharacters, DEFAULT_MAX_CHARACTERS);
  const characterCount = countCharacters(text);

  if (!text || typeof text !== "string") {
    return {
      allowed: false,
      characterCount,
      maxCharacters: safeMaxCharacters,
      warning: "empty-or-invalid-text"
    };
  }

  if (characterCount <= safeMaxCharacters) {
    return {
      allowed: true,
      characterCount,
      maxCharacters: safeMaxCharacters,
      warning: null
    };
  }

  return {
    allowed: false,
    characterCount,
    maxCharacters: safeMaxCharacters,
    warning: `max-character-limit-exceeded:${characterCount}/${safeMaxCharacters}`
  };
}

function isPrivateIpv4(hostname) {
  const parts = String(hostname || "")
    .split(".")
    .map((part) => Number(part));

  if (parts.length !== 4 || !parts.every((part) => Number.isInteger(part) && part >= 0 && part <= 255)) {
    return false;
  }

  const [a, b] = parts;

  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;

  return false;
}

function isLocalEndpoint(url) {
  if (!url || typeof url !== "object") return false;

  const hostname = String(url.hostname || "").toLowerCase();

  if (LOCAL_HOSTS.has(hostname)) return true;
  if (isPrivateIpv4(hostname)) return true;

  const ipVersion = net.isIP(hostname);
  if (ipVersion === 6) {
    if (hostname === "::1") return true;
    if (hostname.startsWith("fc") || hostname.startsWith("fd")) return true;
    if (hostname.startsWith("fe80")) return true;
  }

  return false;
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

  if (url.username || url.password) {
    throw new Error("provider-url-credentials-not-allowed");
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
    translated: false,
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

  if (Object.prototype.hasOwnProperty.call(dictionary, text)) {
    return {
      translatedText: dictionary[text],
      matchedKey: text
    };
  }

  const normalizedText = normalizeDictionaryKey(text);
  if (Object.prototype.hasOwnProperty.call(dictionary, normalizedText)) {
    return {
      translatedText: dictionary[normalizedText],
      matchedKey: normalizedText
    };
  }

  const lookupKey = normalizeDictionaryLookupKey(text);
  for (const [key, value] of Object.entries(dictionary)) {
    if (normalizeDictionaryLookupKey(key) === lookupKey) {
      return {
        translatedText: value,
        matchedKey: key
      };
    }
  }

  return null;
}

function translateWithManualDictionary(text, sourceLanguage, targetLanguage) {
  const source = normalizeLanguageCode(sourceLanguage);
  const target = normalizeLanguageCode(targetLanguage);
  const hit = lookupManualDictionary(text, source, target);

  if (!hit || !hit.translatedText) {
    return {
      text,
      translated: false,
      meta: createProviderMeta({
        provider: "manualDictionary",
        sourceLanguage: source,
        targetLanguage: target,
        translated: false,
        characterCount: countCharacters(text),
        dictionaryHit: false,
        warning: "manual-dictionary-miss"
      })
    };
  }

  return {
    text: hit.translatedText,
    translated: true,
    meta: createProviderMeta({
      provider: "manualDictionary",
      sourceLanguage: source,
      targetLanguage: target,
      translated: true,
      characterCount: countCharacters(text),
      dictionaryHit: true,
      warning: null
    })
  };
}

function mergeProviderConfig(options = {}) {
  const nested = isPlainObject(options.providerConfig) ? options.providerConfig : {};
  return {
    ...nested,
    ...options,
    providerConfig: nested
  };
}

function requestJson(urlString, payload, options = {}) {
  const timeoutMs = normalizePositiveInteger(options.timeoutMs, DEFAULT_TIMEOUT_MS);
  const maxResponseBytes = normalizePositiveInteger(options.maxResponseBytes, DEFAULT_MAX_RESPONSE_BYTES);
  const url = assertEndpointAllowed(urlString, options);

  return new Promise((resolve, reject) => {
    const client = url.protocol === "https:" ? https : http;
    const body = JSON.stringify(payload || {});

    const requestOptions = {
      method: "POST",
      hostname: url.hostname,
      port: url.port || (url.protocol === "https:" ? 443 : 80),
      path: `${url.pathname || "/"}${url.search || ""}`,
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
        "User-Agent": `Marion-UniversalTranslator/${VERSION}`,
        "Accept": "application/json"
      }
    };

    let settled = false;

    function safeReject(error) {
      if (settled) return;
      settled = true;
      reject(error);
    }

    function safeResolve(value) {
      if (settled) return;
      settled = true;
      resolve(value);
    }

    const req = client.request(requestOptions, (res) => {
      let raw = "";
      let totalBytes = 0;

      res.setEncoding("utf8");

      res.on("data", (chunk) => {
        totalBytes += Buffer.byteLength(chunk, "utf8");

        if (totalBytes > maxResponseBytes) {
          safeReject(new Error("provider-response-too-large"));
          req.destroy();
          return;
        }

        raw += chunk;
      });

      res.on("end", () => {
        if (settled) return;

        if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
          safeReject(new Error(`provider-http-${res.statusCode || "unknown"}`));
          return;
        }

        if (!raw.trim()) {
          safeReject(new Error("provider-empty-response"));
          return;
        }

        try {
          const parsed = JSON.parse(raw);
          if (isPlainObject(parsed)) {
            parsed.__responseBytes = totalBytes;
          }
          safeResolve(parsed);
        } catch (_) {
          safeReject(new Error("provider-invalid-json"));
        }
      });
    });

    req.setTimeout(timeoutMs, () => {
      safeReject(new Error(`provider-timeout-${timeoutMs}ms`));
      req.destroy();
    });

    req.on("error", (error) => {
      safeReject(error);
    });

    req.write(body);
    req.end();
  });
}

function extractTranslatedText(response) {
  if (!response || typeof response !== "object") return null;

  const candidates = [
    response.translatedText,
    response.translation,
    response.output,
    response.text,
    response.result
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) return candidate;
  }

  if (response.data && typeof response.data === "object") {
    return extractTranslatedText(response.data);
  }

  if (Array.isArray(response.translations) && response.translations.length > 0) {
    for (const item of response.translations) {
      const nested = extractTranslatedText(item);
      if (nested) return nested;
    }
  }

  return null;
}

async function translateWithLocalLibreTranslate(text, sourceLanguage, targetLanguage, providerConfig = {}) {
  const config = mergeProviderConfig(providerConfig);
  const endpoint = config.endpoint || config.url || "http://localhost:5000/translate";

  const response = await requestJson(
    endpoint,
    {
      q: text,
      text,
      source: normalizeLanguageCode(sourceLanguage),
      target: normalizeLanguageCode(targetLanguage),
      sourceLanguage: normalizeLanguageCode(sourceLanguage),
      targetLanguage: normalizeLanguageCode(targetLanguage),
      format: "text",
      context: config.context || null,
      domain: config.domain || null,
      emotion: config.emotion || null
    },
    {
      timeoutMs: config.timeoutMs || DEFAULT_TIMEOUT_MS,
      maxResponseBytes: config.maxResponseBytes || DEFAULT_MAX_RESPONSE_BYTES,
      allowRemoteProviders: config.allowRemoteProviders === true,
      allowSelfHostedProviders: config.allowSelfHostedProviders !== false
    }
  );

  const translatedText = extractTranslatedText(response);
  if (!translatedText) throw new Error("provider-missing-translated-text");

  return {
    text: translatedText,
    responseBytes: response.__responseBytes || null,
    endpointHost: new URL(endpoint).hostname
  };
}

async function translateWithLocalNmt(text, sourceLanguage, targetLanguage, providerConfig = {}) {
  const config = mergeProviderConfig(providerConfig);
  const endpoint = config.endpoint || config.url || "http://localhost:7010/translate";

  const response = await requestJson(
    endpoint,
    {
      text,
      q: text,
      sourceLanguage: normalizeLanguageCode(sourceLanguage),
      targetLanguage: normalizeLanguageCode(targetLanguage),
      source: normalizeLanguageCode(sourceLanguage),
      target: normalizeLanguageCode(targetLanguage),
      format: "text",
      context: config.context || null,
      domain: config.domain || null,
      emotion: config.emotion || null
    },
    {
      timeoutMs: config.timeoutMs || DEFAULT_TIMEOUT_MS,
      maxResponseBytes: config.maxResponseBytes || DEFAULT_MAX_RESPONSE_BYTES,
      allowRemoteProviders: config.allowRemoteProviders === true,
      allowSelfHostedProviders: config.allowSelfHostedProviders !== false
    }
  );

  const translatedText = extractTranslatedText(response);
  if (!translatedText) throw new Error("provider-missing-translated-text");

  return {
    text: translatedText,
    responseBytes: response.__responseBytes || null,
    endpointHost: new URL(endpoint).hostname
  };
}

function normalizeExternalTranslationResult(value, fallbackText) {
  if (typeof value === "string") {
    return {
      text: value,
      responseBytes: null,
      endpointHost: null
    };
  }

  if (value && typeof value === "object" && typeof value.text === "string") {
    return {
      text: value.text,
      responseBytes: value.responseBytes || null,
      endpointHost: value.endpointHost || null
    };
  }

  return {
    text: fallbackText,
    responseBytes: null,
    endpointHost: null
  };
}

async function translate(text, options = {}) {
  const startedAt = Date.now();
  const provider = normalizeProviderName(options.provider || options.active || options.providerName || "none");
  const sourceLanguage = normalizeLanguageCode(options.sourceLanguage || "auto");
  const targetLanguage = normalizeLanguageCode(options.targetLanguage || "en");
  const providerConfig = mergeProviderConfig(options);
  const maxCharacters = normalizePositiveInteger(
    providerConfig.maxCharactersPerRequest,
    DEFAULT_MAX_CHARACTERS
  );

  const characterGuard = enforceCharacterLimit(text, maxCharacters);

  if (!characterGuard.allowed) {
    return {
      text,
      translated: false,
      meta: createProviderMeta({
        provider,
        sourceLanguage,
        targetLanguage,
        translated: false,
        characterCount: characterGuard.characterCount,
        durationMs: Date.now() - startedAt,
        warning: characterGuard.warning
      })
    };
  }

  if (!shouldTranslate(text, sourceLanguage, targetLanguage)) {
    return {
      text,
      translated: false,
      meta: createProviderMeta({
        provider,
        sourceLanguage,
        targetLanguage,
        translated: false,
        characterCount: countCharacters(text),
        durationMs: Date.now() - startedAt,
        warning: sourceLanguage === targetLanguage ? "same-language" : "translation-not-required"
      })
    };
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
      const rawResult = await translateWithLocalLibreTranslate(
        text,
        sourceLanguage,
        targetLanguage,
        {
          ...providerConfig,
          endpoint:
            providerConfig.endpoint ||
            providerConfig.url ||
            (provider === "localLibreTranslate" ? "http://localhost:5000/translate" : "http://localhost:7010/translate")
        }
      );

      const normalized = normalizeExternalTranslationResult(rawResult, text);
      const translated = normalized.text !== text;

      return {
        text: normalized.text,
        translated,
        meta: createProviderMeta({
          provider,
          sourceLanguage,
          targetLanguage,
          translated,
          characterCount: countCharacters(text),
          providerCharacterCount: countCharacters(text),
          durationMs: Date.now() - startedAt,
          endpointType: "local-http",
          endpointHost: normalized.endpointHost,
          responseBytes: normalized.responseBytes,
          warning: translated ? null : "provider-returned-original"
        })
      };
    }

    if (
      provider === "argos" ||
      provider === "localNmt" ||
      provider === "huggingFaceLocal" ||
      provider === "localModule" ||
      provider === "localProvider"
    ) {
      const rawResult = await translateWithLocalNmt(text, sourceLanguage, targetLanguage, providerConfig);
      const normalized = normalizeExternalTranslationResult(rawResult, text);
      const translated = normalized.text !== text;

      return {
        text: normalized.text,
        translated,
        meta: createProviderMeta({
          provider,
          sourceLanguage,
          targetLanguage,
          translated,
          characterCount: countCharacters(text),
          providerCharacterCount: countCharacters(text),
          durationMs: Date.now() - startedAt,
          endpointType: "local-nmt-http",
          endpointHost: normalized.endpointHost,
          responseBytes: normalized.responseBytes,
          warning: translated ? null : "provider-returned-original"
        })
      };
    }

    return {
      text,
      translated: false,
      meta: createProviderMeta({
        provider,
        sourceLanguage,
        targetLanguage,
        translated: false,
        characterCount: countCharacters(text),
        durationMs: Date.now() - startedAt,
        warning: "unsupported-provider"
      })
    };
  } catch (error) {
    const errorMessage = error && error.message ? error.message : "unknown";

    return {
      text,
      translated: false,
      meta: createProviderMeta({
        provider,
        sourceLanguage,
        targetLanguage,
        translated: false,
        characterCount: countCharacters(text),
        durationMs: Date.now() - startedAt,
        warning: `provider-failed:${errorMessage}`,
        error: errorMessage
      })
    };
  }
}

async function translateText(text, options = {}, meta = null) {
  const result = await translate(text, options);

  if (meta && typeof meta === "object" && result && result.meta) {
    Object.assign(meta, result.meta);
  }

  return result;
}

module.exports = {
  VERSION,
  SUPPORTED_LANGUAGES,
  SUPPORTED_PROVIDERS,
  PROVIDER_ALIASES,
  MANUAL_DICTIONARY,
  LOCAL_HOSTS,
  normalizeLanguageCode,
  normalizeProviderName,
  normalizePositiveInteger,
  countCharacters,
  shouldTranslate,
  enforceCharacterLimit,
  isPrivateIpv4,
  isLocalEndpoint,
  assertEndpointAllowed,
  requestJson,
  extractTranslatedText,
  translate,
  translateText,
  translateWithIdentity,
  lookupManualDictionary,
  translateWithManualDictionary,
  translateWithLocalLibreTranslate,
  translateWithLocalNmt
};

"use strict";

/**
 * UniversalTranslatorAdapter.js
 * Marion/Nyx Universal Translator Adapter
 *
 * Hardened Phase-1 adapter.
 *
 * Design rules:
 * - Non-invasive: does not alter Marion routing/final authority unless called explicitly.
 * - Fail-closed: returns original text/envelope on provider failure.
 * - Final-envelope safe: clones before writing translated final text or metadata.
 * - Provider-neutral: paid/cloud providers are not required; local/self-hosted providers can be added behind one boundary.
 * - English/French/Spanish first.
 */

const DEFAULT_SUPPORTED_LANGUAGES = ["en", "fr", "es"];
const VERSION = "0.2.0";

let CONFIG = null;
let GLOSSARY = null;
let LANGUAGE_DETECT = null;
let MEMORY_MODULE = null;
let LOCAL_PROVIDER = null;

function safeRequire(relativePath, fallback) {
  try {
    return require(relativePath);
  } catch (_) {
    return fallback;
  }
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function deepMerge(base, override) {
  if (!isPlainObject(override)) return { ...base };

  const output = { ...base };

  for (const [key, value] of Object.entries(override)) {
    if (isPlainObject(value) && isPlainObject(output[key])) {
      output[key] = deepMerge(output[key], value);
    } else {
      output[key] = value;
    }
  }

  return output;
}

function getDefaultConfig() {
  return {
    version: VERSION,
    enabled: true,
    defaultSourceLanguage: "auto",
    defaultTargetLanguage: "en",
    supportedLanguages: DEFAULT_SUPPORTED_LANGUAGES,
    provider: {
      active: "none",
      fallback: "identity",
      allowRemoteProviders: false,
      allowSelfHostedProviders: true,
      endpoint: null,
      timeoutMs: 8000,
      maxCharactersPerRequest: 4500
    },
    behavior: {
      preserveFinalEnvelope: true,
      translateFinalOnly: true,
      allowInputNormalization: true,
      attachTranslationMeta: true,
      failClosedToOriginal: true,
      protectBrandTerms: true,
      protectDomainTerms: true,
      preserveEmotionTone: true,
      preserveUserIntent: true
    },
    routing: {
      inputNormalizationTarget: "en",
      finalAnswerTranslation: true,
      domainAwareTranslation: true,
      emotionAwareTranslation: true
    },
    translationMemory: {
      enabled: true,
      reuseExactMatches: true,
      reuseNormalizedMatches: true
    },
    telemetry: {
      enabled: true,
      logProvider: true,
      logLanguagePair: true,
      logCharacterCount: true,
      logFailures: true,
      logProtectedTermsCount: true
    }
  };
}

function loadConfig(forceReload = false) {
  if (CONFIG && !forceReload) return CONFIG;

  const loaded = safeRequire("./translationConfig.json", {});
  CONFIG = deepMerge(getDefaultConfig(), loaded);

  if (!Array.isArray(CONFIG.supportedLanguages) || CONFIG.supportedLanguages.length === 0) {
    CONFIG.supportedLanguages = DEFAULT_SUPPORTED_LANGUAGES;
  }

  return CONFIG;
}

function loadGlossary(forceReload = false) {
  if (GLOSSARY && !forceReload) return GLOSSARY;

  GLOSSARY = safeRequire("./TranslationGlossary.js", {
    protectText: (text) => ({ text, tokens: [] }),
    restoreText: (text) => text,
    getProtectedTerms: () => []
  });

  return GLOSSARY;
}

function loadLanguageDetect(forceReload = false) {
  if (LANGUAGE_DETECT && !forceReload) return LANGUAGE_DETECT;

  LANGUAGE_DETECT = safeRequire("./LanguageDetect.js", null);
  return LANGUAGE_DETECT;
}

function loadMemoryModule(forceReload = false) {
  if (MEMORY_MODULE && !forceReload) return MEMORY_MODULE;

  MEMORY_MODULE = safeRequire("./TranslationMemoryStore.js", null);
  return MEMORY_MODULE;
}

function loadLocalProvider(forceReload = false) {
  if (LOCAL_PROVIDER && !forceReload) return LOCAL_PROVIDER;

  LOCAL_PROVIDER = safeRequire("./LocalTranslationProvider.js", null);
  return LOCAL_PROVIDER;
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

function isSupportedLanguage(lang) {
  const config = loadConfig();
  const normalized = normalizeLanguageCode(lang);

  if (normalized === "auto") return true;
  if (normalized === "unknown") return false;

  return Array.isArray(config.supportedLanguages)
    ? config.supportedLanguages.includes(normalized)
    : DEFAULT_SUPPORTED_LANGUAGES.includes(normalized);
}

function internalDetectLanguage(text) {
  if (!text || typeof text !== "string") {
    return {
      language: "unknown",
      label: "Unknown",
      confidence: 0,
      method: "empty-input",
      scores: { en: 0, fr: 0, es: 0 }
    };
  }

  const sample = ` ${text.toLowerCase().normalize("NFC").replace(/\s+/g, " ").trim()} `;

  const frenchSignals = [
    "bonjour", "merci", "comment", "pourquoi", "avec", "dans", "être", "suis",
    "vous", "nous", "est-ce", "ça", "français", " le ", " les ", " des ", " une "
  ];

  const spanishSignals = [
    "hola", "gracias", "cómo", "porque", "por qué", "para", "con", "estoy",
    "usted", "nosotros", "qué", "español", " el ", " los ", " las ", " una "
  ];

  const englishSignals = [
    "hello", "thanks", "thank you", "how", "why", "because", "with", "inside",
    "you", "we", "english", " the ", " and ", " of ", " to ", " is "
  ];

  const scores = {
    en: englishSignals.reduce((sum, token) => sum + (sample.includes(token) ? 1 : 0), 0),
    fr: frenchSignals.reduce((sum, token) => sum + (sample.includes(token) ? 1 : 0), 0),
    es: spanishSignals.reduce((sum, token) => sum + (sample.includes(token) ? 1 : 0), 0)
  };

  if (/[àâçéèêëîïôùûüÿœ]/i.test(sample)) scores.fr += 2;
  if (/[áéíóúñü¿¡]/i.test(sample)) scores.es += 2;

  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const [language, topScore] = sorted[0];
  const [, secondScore] = sorted[1];

  if (topScore <= 0) {
    return {
      language: "en",
      label: "English",
      confidence: 0.52,
      method: "default-en",
      scores
    };
  }

  const gap = Math.max(0, topScore - secondScore);
  const confidence = Number(Math.min(0.97, 0.48 + topScore * 0.06 + gap * 0.05).toFixed(3));

  return {
    language,
    label: language === "fr" ? "French" : language === "es" ? "Spanish" : "English",
    confidence,
    method: "internal-signal-detector",
    scores
  };
}

function detectLanguage(text, options = {}) {
  const detector = loadLanguageDetect();

  if (detector && typeof detector.detectLanguage === "function") {
    try {
      const result = detector.detectLanguage(text, options);
      if (result && result.language) return result;
    } catch (_) {
      // Fall through to internal detector; never let detection failure crash Marion.
    }
  }

  return internalDetectLanguage(text);
}

function shouldTranslate(sourceLanguage, targetLanguage) {
  const source = normalizeLanguageCode(sourceLanguage);
  const target = normalizeLanguageCode(targetLanguage);

  if (!target || target === "auto" || target === "unknown") return false;
  if (source === target) return false;
  if (!isSupportedLanguage(target)) return false;
  if (source !== "unknown" && source !== "auto" && !isSupportedLanguage(source)) return false;

  return true;
}

function countCharacters(text) {
  return typeof text === "string" ? Array.from(text).length : 0;
}

function createMeta(seed = {}) {
  const now = new Date().toISOString();

  return {
    adapterVersion: VERSION,
    translated: false,
    provider: "none",
    sourceLanguage: "unknown",
    sourceConfidence: null,
    sourceDetectionMethod: null,
    targetLanguage: "unknown",
    languagePair: null,
    protectedTermsApplied: 0,
    memoryHit: false,
    characterCount: 0,
    warning: null,
    error: null,
    createdAt: now,
    ...seed
  };
}

function getMemoryStore() {
  const config = loadConfig();
  const memoryModule = loadMemoryModule();

  if (!config.translationMemory || config.translationMemory.enabled !== true) return null;
  if (!memoryModule) return null;

  if (memoryModule.defaultStore) return memoryModule.defaultStore;
  if (typeof memoryModule.createTranslationMemoryStore === "function") {
    return memoryModule.createTranslationMemoryStore();
  }

  return null;
}

function memoryGet(params) {
  try {
    const store = getMemoryStore();
    if (!store || typeof store.get !== "function") return null;

    const result = store.get(params);
    return result && result.hit ? result.entry : null;
  } catch (_) {
    return null;
  }
}

function memorySet(params) {
  try {
    const store = getMemoryStore();
    if (!store || typeof store.set !== "function") return null;
    return store.set(params);
  } catch (_) {
    return null;
  }
}

async function withTimeout(promise, timeoutMs, label) {
  let timer = null;

  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`${label || "operation"}-timeout-${timeoutMs}ms`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function callLocalModuleProvider(text, options, meta) {
  const provider = loadLocalProvider();

  if (!provider) {
    throw new Error("local-provider-module-not-found");
  }

  if (typeof provider.translateText === "function") {
    return provider.translateText(text, options, meta);
  }

  if (typeof provider.translate === "function") {
    return provider.translate(text, options, meta);
  }

  throw new Error("local-provider-missing-translate-function");
}

async function callLocalHttpProvider(text, options, meta) {
  const config = loadConfig();
  const endpoint = config.provider && config.provider.endpoint;

  if (!endpoint || typeof endpoint !== "string") {
    throw new Error("local-http-provider-endpoint-missing");
  }

  if (typeof fetch !== "function") {
    throw new Error("fetch-unavailable-in-current-node-runtime");
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      q: text,
      source: options.sourceLanguage,
      target: options.targetLanguage,
      format: "text",
      context: options.context || null,
      domain: options.domain || null,
      emotion: options.emotion || null
    })
  });

  if (!response.ok) {
    throw new Error(`local-http-provider-${response.status}`);
  }

  const payload = await response.json();

  if (typeof payload.translatedText === "string") return payload.translatedText;
  if (typeof payload.translation === "string") return payload.translation;
  if (typeof payload.text === "string") return payload.text;

  throw new Error("local-http-provider-invalid-response");
}

async function callProvider(text, options, meta) {
  const config = loadConfig();
  const providerName = config.provider && config.provider.active ? config.provider.active : "none";
  const timeoutMs = Number(config.provider && config.provider.timeoutMs) || 8000;

  meta.provider = providerName;

  if (providerName === "none" || providerName === "identity") {
    return {
      text,
      translated: false,
      warning: providerName === "none" ? "no-provider-configured" : "identity-provider-active"
    };
  }

  if (providerName === "localModule" || providerName === "localProvider") {
    const translated = await withTimeout(
      callLocalModuleProvider(text, options, meta),
      timeoutMs,
      "local-module-translation"
    );

    return {
      text: typeof translated === "string" ? translated : translated && translated.text,
      translated: true,
      warning: null
    };
  }

  if (providerName === "localHttp" || providerName === "localLibreTranslate") {
    const translated = await withTimeout(
      callLocalHttpProvider(text, options, meta),
      timeoutMs,
      "local-http-translation"
    );

    return {
      text: translated,
      translated: true,
      warning: null
    };
  }

  return {
    text,
    translated: false,
    warning: `provider-not-implemented:${providerName}`
  };
}

async function translateText(text, options = {}) {
  const config = loadConfig();
  const glossary = loadGlossary();

  const detected =
    normalizeLanguageCode(options.sourceLanguage) === "auto" || !options.sourceLanguage
      ? detectLanguage(text, options)
      : {
          language: normalizeLanguageCode(options.sourceLanguage),
          confidence: null,
          method: "explicit-source-language"
        };

  const sourceLanguage = normalizeLanguageCode(detected.language);
  const targetLanguage = normalizeLanguageCode(
    options.targetLanguage || config.defaultTargetLanguage || "en"
  );

  const meta = createMeta({
    provider: config.provider && config.provider.active ? config.provider.active : "none",
    sourceLanguage,
    sourceConfidence: typeof detected.confidence === "number" ? detected.confidence : null,
    sourceDetectionMethod: detected.method || null,
    targetLanguage,
    languagePair: `${sourceLanguage}-${targetLanguage}`,
    characterCount: countCharacters(text)
  });

  if (!text || typeof text !== "string") {
    return {
      text,
      meta: {
        ...meta,
        warning: "empty-or-invalid-text"
      }
    };
  }

  const maxChars = Number(config.provider && config.provider.maxCharactersPerRequest) || 4500;
  if (meta.characterCount > maxChars) {
    return {
      text,
      meta: {
        ...meta,
        warning: `max-characters-exceeded:${meta.characterCount}/${maxChars}`
      }
    };
  }

  if (!shouldTranslate(sourceLanguage, targetLanguage)) {
    return {
      text,
      meta: {
        ...meta,
        warning: sourceLanguage === targetLanguage ? "same-language" : "translation-not-required-or-unsupported"
      }
    };
  }

  const memoryEntry = memoryGet({
    sourceLanguage,
    targetLanguage,
    sourceText: text,
    domain: options.domain || "general"
  });

  if (memoryEntry && typeof memoryEntry.translatedText === "string") {
    return {
      text: memoryEntry.translatedText,
      meta: {
        ...meta,
        translated: true,
        provider: memoryEntry.provider || "translation-memory",
        memoryHit: true,
        warning: null
      }
    };
  }

  const protectedPayload =
    glossary && typeof glossary.protectText === "function"
      ? glossary.protectText(text, {
          domain: options.domain || null,
          domains: options.domains || null,
          extraTerms: options.protectedTerms || null
        })
      : { text, tokens: [] };

  const protectedText = protectedPayload && typeof protectedPayload.text === "string"
    ? protectedPayload.text
    : text;

  const tokens = Array.isArray(protectedPayload && protectedPayload.tokens)
    ? protectedPayload.tokens
    : [];

  meta.protectedTermsApplied = tokens.length;

  try {
    const providerResult = await callProvider(
      protectedText,
      {
        ...options,
        sourceLanguage,
        targetLanguage
      },
      meta
    );

    const rawProviderText = providerResult && typeof providerResult.text === "string"
      ? providerResult.text
      : protectedText;

    const restoredText =
      glossary && typeof glossary.restoreText === "function"
        ? glossary.restoreText(rawProviderText, tokens)
        : rawProviderText;

    const translated = Boolean(providerResult && providerResult.translated && restoredText !== text);

    if (translated) {
      memorySet({
        sourceLanguage,
        targetLanguage,
        sourceText: text,
        translatedText: restoredText,
        domain: options.domain || "general",
        provider: meta.provider,
        confidence: 1,
        emotion: options.emotion || null
      });
    }

    return {
      text: restoredText,
      meta: {
        ...meta,
        translated,
        warning: providerResult ? providerResult.warning : null
      }
    };
  } catch (error) {
    const errorMessage = error && error.message ? error.message : "unknown";

    if (config.behavior && config.behavior.failClosedToOriginal) {
      return {
        text,
        meta: {
          ...meta,
          translated: false,
          error: errorMessage,
          warning: `translation-failed:${errorMessage}`
        }
      };
    }

    throw error;
  }
}

function extractFinalText(envelopeOrText) {
  if (typeof envelopeOrText === "string") {
    return {
      text: envelopeOrText,
      mode: "string"
    };
  }

  if (!envelopeOrText || typeof envelopeOrText !== "object") {
    return {
      text: "",
      mode: "invalid"
    };
  }

  const candidates = [
    "final",
    "trustedFinal",
    "finalText",
    "reply",
    "answer",
    "message",
    "text",
    "content"
  ];

  for (const key of candidates) {
    if (typeof envelopeOrText[key] === "string" && envelopeOrText[key].trim()) {
      return {
        text: envelopeOrText[key],
        mode: key
      };
    }
  }

  const nestedCandidates = ["finalEnvelope", "envelope", "payload"];

  for (const parentKey of nestedCandidates) {
    const child = envelopeOrText[parentKey];
    if (!child || typeof child !== "object") continue;

    for (const key of candidates) {
      if (typeof child[key] === "string" && child[key].trim()) {
        return {
          text: child[key],
          mode: `${parentKey}.${key}`
        };
      }
    }
  }

  return {
    text: "",
    mode: "not-found"
  };
}

function shallowCloneEnvelope(value) {
  if (Array.isArray(value)) return value.slice();
  if (value && typeof value === "object") return { ...value };
  return value;
}

function writeFinalText(envelopeOrText, translatedText, mode) {
  if (typeof envelopeOrText === "string") {
    return translatedText;
  }

  if (!envelopeOrText || typeof envelopeOrText !== "object") {
    return envelopeOrText;
  }

  const clone = shallowCloneEnvelope(envelopeOrText);

  if (mode && mode.includes(".")) {
    const [parentKey, childKey] = mode.split(".");
    clone[parentKey] = {
      ...(clone[parentKey] || {}),
      [childKey]: translatedText
    };
    return clone;
  }

  if (mode && mode !== "not-found" && mode !== "invalid") {
    clone[mode] = translatedText;
  }

  return clone;
}

async function applyUniversalTranslation(envelopeOrText, options = {}) {
  const config = loadConfig();

  if (!config.enabled) {
    return envelopeOrText;
  }

  if (config.routing && config.routing.finalAnswerTranslation === false) {
    return envelopeOrText;
  }

  const extracted = extractFinalText(envelopeOrText);

  if (!extracted.text) {
    return envelopeOrText;
  }

  const result = await translateText(extracted.text, {
    sourceLanguage: options.sourceLanguage || "auto",
    targetLanguage: options.targetLanguage || config.defaultTargetLanguage || "en",
    context: options.context || "final-output",
    emotion: options.emotion || null,
    domain: options.domain || null,
    domains: options.domains || null,
    protectedTerms: options.protectedTerms || null
  });

  const output = writeFinalText(envelopeOrText, result.text, extracted.mode);

  if (
    output &&
    typeof output === "object" &&
    config.behavior &&
    config.behavior.attachTranslationMeta
  ) {
    output.translationMeta = {
      ...(output.translationMeta || {}),
      ...result.meta,
      finalTextSlot: extracted.mode,
      domain: options.domain || null,
      emotion: options.emotion || null,
      context: options.context || "final-output"
    };
  }

  return output;
}

async function normalizeInputForMarion(userText, options = {}) {
  const config = loadConfig();
  const detected = detectLanguage(userText, options);
  const detectedLanguage = normalizeLanguageCode(detected.language);
  const routingTarget = normalizeLanguageCode(
    (config.routing && config.routing.inputNormalizationTarget) || "en"
  );

  const payload = {
    originalText: userText,
    normalizedText: userText,
    detectedLanguage,
    detectionConfidence: typeof detected.confidence === "number" ? detected.confidence : null,
    detectionMethod: detected.method || null,
    translatedForRouting: false,
    translationMeta: null
  };

  if (
    !config.behavior ||
    config.behavior.allowInputNormalization !== true ||
    detectedLanguage === routingTarget ||
    detectedLanguage === "unknown" ||
    routingTarget === "unknown" ||
    routingTarget === "auto"
  ) {
    return payload;
  }

  const result = await translateText(userText, {
    sourceLanguage: detectedLanguage,
    targetLanguage: routingTarget,
    context: options.context || "input-normalization",
    emotion: options.emotion || null,
    domain: options.domain || null,
    domains: options.domains || null,
    protectedTerms: options.protectedTerms || null
  });

  payload.normalizedText = result.text;
  payload.translatedForRouting = result.meta.translated === true;
  payload.translationMeta = result.meta;

  return payload;
}

function resetUniversalTranslatorCaches() {
  CONFIG = null;
  GLOSSARY = null;
  LANGUAGE_DETECT = null;
  MEMORY_MODULE = null;
  LOCAL_PROVIDER = null;

  return true;
}

module.exports = {
  VERSION,
  detectLanguage,
  normalizeLanguageCode,
  isSupportedLanguage,
  shouldTranslate,
  translateText,
  applyUniversalTranslation,
  normalizeInputForMarion,
  extractFinalText,
  writeFinalText,
  loadConfig,
  loadGlossary,
  resetUniversalTranslatorCaches
};

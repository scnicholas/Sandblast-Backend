"use strict";

/**
 * UniversalTranslatorAdapter.js
 * Marion/Nyx Universal Translator Adapter
 *
 * Hardened Phase-1/Phase-2 boundary adapter.
 *
 * Design rules:
 * - Non-invasive: does not alter Marion routing/final authority unless called explicitly.
 * - Fail-closed: returns original text/envelope on provider failure.
 * - Final-envelope safe: clones before writing translated final text or metadata.
 * - Provider-neutral: paid/cloud providers are not required; local/self-hosted providers sit behind one boundary.
 * - English/French/Spanish first.
 *
 * Critical compatibility note:
 * - Works with LocalTranslationProvider.js provider names such as:
 *   none, identity, manualDictionary, localLibreTranslate, argos, localNmt, huggingFaceLocal.
 */

const fs = require("fs");
const path = require("path");

const DEFAULT_SUPPORTED_LANGUAGES = ["en", "fr", "es"];
const VERSION = "0.3.1";

let CONFIG = null;
let GLOSSARY = null;
let LANGUAGE_DETECT = null;
let MEMORY_MODULE = null;
let LOCAL_PROVIDER = null;
let MEMORY_STORE = null;

const CONFIG_PATH = path.join(__dirname, "translationConfig.json");

function safeRequire(relativePath, fallback) {
  try {
    return require(relativePath);
  } catch (_) {
    return fallback;
  }
}

function readConfigFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) return {};
    const raw = fs.readFileSync(filePath, "utf8");
    if (!raw || !raw.trim()) return {};
    return JSON.parse(raw);
  } catch (error) {
    return {
      __configLoadError: error && error.message ? error.message : "invalid-config-json"
    };
  }
}


function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function deepMerge(base, override) {
  if (!isPlainObject(base)) return isPlainObject(override) ? { ...override } : override;
  if (!isPlainObject(override)) return { ...base };

  const output = { ...base };

  for (const [key, value] of Object.entries(override)) {
    if (isPlainObject(value) && isPlainObject(output[key])) {
      output[key] = deepMerge(output[key], value);
    } else if (Array.isArray(value)) {
      output[key] = value.slice();
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

  const defaults = getDefaultConfig();
  const loaded = readConfigFile(CONFIG_PATH);
  const configLoadError = loaded && loaded.__configLoadError ? loaded.__configLoadError : null;
  const cleanLoaded = configLoadError ? {} : loaded;

  CONFIG = deepMerge(defaults, cleanLoaded);

  if (configLoadError) {
    CONFIG.__configLoadError = configLoadError;
  }

  if (!Array.isArray(CONFIG.supportedLanguages) || CONFIG.supportedLanguages.length === 0) {
    CONFIG.supportedLanguages = DEFAULT_SUPPORTED_LANGUAGES.slice();
  }

  CONFIG.supportedLanguages = CONFIG.supportedLanguages
    .map((lang) => normalizeLanguageCode(lang))
    .filter((lang) => lang !== "auto" && lang !== "unknown");

  if (CONFIG.supportedLanguages.length === 0) {
    CONFIG.supportedLanguages = DEFAULT_SUPPORTED_LANGUAGES.slice();
  }

  if (!isPlainObject(CONFIG.provider)) CONFIG.provider = { ...defaults.provider };
  if (!isPlainObject(CONFIG.behavior)) CONFIG.behavior = { ...defaults.behavior };
  if (!isPlainObject(CONFIG.routing)) CONFIG.routing = { ...defaults.routing };
  if (!isPlainObject(CONFIG.translationMemory)) {
    CONFIG.translationMemory = { ...defaults.translationMemory };
  }
  if (!isPlainObject(CONFIG.telemetry)) CONFIG.telemetry = { ...defaults.telemetry };

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

function normalizeProviderName(providerName) {
  if (!providerName || typeof providerName !== "string") return "none";
  return providerName.trim() || "none";
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
    providerCharacterCount: null,
    durationMs: null,
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

  const memoryConfig = config.translationMemory || {};
  const requestedFile = memoryConfig.storageFile || memoryConfig.filePath || null;
  const requestedPath = requestedFile
    ? path.resolve(process.cwd(), requestedFile)
    : null;

  /**
   * Do not blindly return memoryModule.defaultStore here.
   * The default store ignores translationConfig.storageFile, which makes regression
   * tests and runtime isolation vulnerable to stale global memory.
   */
  if (typeof memoryModule.createTranslationMemoryStore === "function") {
    const currentPath = MEMORY_STORE && MEMORY_STORE.filePath ? path.resolve(MEMORY_STORE.filePath) : null;

    if (!MEMORY_STORE || (requestedPath && currentPath !== requestedPath)) {
      MEMORY_STORE = memoryModule.createTranslationMemoryStore({
        filePath: requestedPath || undefined,
        maxEntries: Number.isFinite(memoryConfig.maxEntries) ? memoryConfig.maxEntries : undefined,
        maxTextCharacters: Number.isFinite(memoryConfig.maxTextCharacters) ? memoryConfig.maxTextCharacters : undefined,
        ttlMs: Number.isFinite(memoryConfig.ttlMs) ? memoryConfig.ttlMs : undefined,
        minConfidence: Number.isFinite(memoryConfig.minConfidence) ? memoryConfig.minConfidence : undefined
      });
    }

    return MEMORY_STORE;
  }

  return memoryModule.defaultStore || null;
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
  const safeTimeout = Number(timeoutMs) > 0 ? Number(timeoutMs) : 8000;
  let timer = null;

  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`${label || "operation"}-timeout-${safeTimeout}ms`));
    }, safeTimeout);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function normalizeProviderResult(result, fallbackText, providerName) {
  if (typeof result === "string") {
    return {
      text: result,
      translated: result !== fallbackText,
      warning: null,
      providerMeta: null
    };
  }

  if (result && typeof result === "object") {
    const text = typeof result.text === "string"
      ? result.text
      : typeof result.translatedText === "string"
        ? result.translatedText
        : typeof result.translation === "string"
          ? result.translation
          : fallbackText;

    const resultMeta = isPlainObject(result.meta) ? result.meta : null;
    const explicitTranslated = typeof result.translated === "boolean"
      ? result.translated
      : resultMeta && typeof resultMeta.translated === "boolean"
        ? resultMeta.translated
        : text !== fallbackText;

    return {
      text,
      translated: Boolean(explicitTranslated && text !== fallbackText),
      warning: result.warning || (resultMeta && resultMeta.warning) || null,
      providerMeta: resultMeta
    };
  }

  return {
    text: fallbackText,
    translated: false,
    warning: `provider-returned-invalid-result:${providerName}`,
    providerMeta: null
  };
}

function isLocalhostOrPrivateEndpoint(endpoint) {
  try {
    const url = new URL(endpoint);
    const hostname = url.hostname.toLowerCase();

    if (["localhost", "127.0.0.1", "::1"].includes(hostname)) return true;
    if (hostname.startsWith("127.")) return true;
    if (hostname.startsWith("10.")) return true;
    if (hostname.startsWith("192.168.")) return true;

    const parts = hostname.split(".").map((part) => Number(part));
    if (parts.length === 4 && parts.every((part) => Number.isInteger(part))) {
      if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
    }

    return false;
  } catch (_) {
    return false;
  }
}

async function callLocalModuleProvider(text, options, meta) {
  const provider = loadLocalProvider();

  if (!provider) {
    throw new Error("local-provider-module-not-found");
  }

  const providerOptions = {
    ...options,
    provider: normalizeProviderName(options.provider || options.providerName || meta.provider),
    active: normalizeProviderName(options.provider || options.providerName || meta.provider),
    providerConfig: options.providerConfig || loadConfig().provider || {}
  };

  if (typeof provider.translateText === "function") {
    return provider.translateText(text, providerOptions, meta);
  }

  if (typeof provider.translate === "function") {
    return provider.translate(text, providerOptions, meta);
  }

  throw new Error("local-provider-missing-translate-function");
}

async function callLocalHttpProvider(text, options) {
  const config = loadConfig();
  const endpoint = config.provider && config.provider.endpoint;

  if (!endpoint || typeof endpoint !== "string") {
    throw new Error("local-http-provider-endpoint-missing");
  }

  if (config.provider.allowRemoteProviders !== true && !isLocalhostOrPrivateEndpoint(endpoint)) {
    throw new Error("remote-provider-disabled");
  }

  if (typeof fetch !== "function") {
    throw new Error("fetch-unavailable-in-current-node-runtime");
  }

  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timeoutMs = Number(config.provider && config.provider.timeoutMs) || 8000;
  let timer = null;

  if (controller) {
    timer = setTimeout(() => controller.abort(), timeoutMs);
  }

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      signal: controller ? controller.signal : undefined,
      body: JSON.stringify({
        q: text,
        text,
        source: options.sourceLanguage,
        target: options.targetLanguage,
        sourceLanguage: options.sourceLanguage,
        targetLanguage: options.targetLanguage,
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
    if (typeof payload.output === "string") return payload.output;
    if (typeof payload.text === "string") return payload.text;

    throw new Error("local-http-provider-invalid-response");
  } catch (error) {
    if (error && error.name === "AbortError") {
      throw new Error(`local-http-translation-timeout-${timeoutMs}ms`);
    }
    throw error;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function canUseLocalModuleProvider(providerName) {
  const localProvider = loadLocalProvider();
  if (!localProvider) return false;

  if (providerName === "none") return false;
  if (providerName === "localHttp") return false;

  return typeof localProvider.translate === "function" || typeof localProvider.translateText === "function";
}

async function callProvider(text, options = {}, meta = {}) {
  options = isPlainObject(options) ? options : {};
  meta = isPlainObject(meta) ? meta : createMeta({ warning: "meta-fallback-created" });
  const config = loadConfig();
  const providerName = normalizeProviderName(
    (config.provider && config.provider.active) || options.provider || "none"
  );
  const timeoutMs = Number(config.provider && config.provider.timeoutMs) || 8000;

  meta.provider = providerName;

  if (providerName === "none" || providerName === "identity") {
    return {
      text,
      translated: false,
      warning: providerName === "none" ? "no-provider-configured" : "identity-provider-active",
      providerMeta: null
    };
  }

  if (canUseLocalModuleProvider(providerName)) {
    const moduleResult = await withTimeout(
      callLocalModuleProvider(
        text,
        {
          ...options,
          provider: providerName,
          providerName,
          providerConfig: config.provider || {}
        },
        meta
      ),
      timeoutMs,
      "local-module-translation"
    );

    return normalizeProviderResult(moduleResult, text, providerName);
  }

  if (providerName === "localHttp" || providerName === "localLibreTranslate") {
    const translated = await withTimeout(
      callLocalHttpProvider(text, options),
      timeoutMs,
      "local-http-translation"
    );

    return {
      text: translated,
      translated: translated !== text,
      warning: null,
      providerMeta: null
    };
  }

  return {
    text,
    translated: false,
    warning: `provider-not-implemented:${providerName}`,
    providerMeta: null
  };
}


function safeProtectText(glossary, text, options, meta) {
  try {
    if (!glossary || typeof glossary.protectText !== "function") {
      return { text, tokens: [], warning: null };
    }

    const payload = glossary.protectText(text, options);
    const protectedText = payload && typeof payload.text === "string" ? payload.text : text;
    const tokens = Array.isArray(payload && payload.tokens) ? payload.tokens : [];

    return {
      text: protectedText,
      tokens,
      warning: null
    };
  } catch (error) {
    if (meta) {
      meta.error = error && error.message ? error.message : "glossary-protect-failed";
    }

    return {
      text,
      tokens: [],
      warning: `glossary-protect-failed:${error && error.message ? error.message : "unknown"}`
    };
  }
}

function safeRestoreText(glossary, text, tokens, originalText, meta) {
  try {
    if (!glossary || typeof glossary.restoreText !== "function") {
      return { text, warning: null };
    }

    return {
      text: glossary.restoreText(text, tokens),
      warning: null
    };
  } catch (error) {
    if (meta) {
      meta.error = error && error.message ? error.message : "glossary-restore-failed";
    }

    return {
      text: originalText,
      warning: `glossary-restore-failed:${error && error.message ? error.message : "unknown"}`
    };
  }
}

async function translateText(text, options = {}) {
  options = isPlainObject(options) ? options : {};
  const startedAt = Date.now();
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
        durationMs: Date.now() - startedAt,
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
        durationMs: Date.now() - startedAt,
        warning: `max-characters-exceeded:${meta.characterCount}/${maxChars}`
      }
    };
  }

  if (!shouldTranslate(sourceLanguage, targetLanguage)) {
    return {
      text,
      meta: {
        ...meta,
        durationMs: Date.now() - startedAt,
        warning: sourceLanguage === targetLanguage ? "same-language" : "translation-not-required-or-unsupported"
      }
    };
  }

  const memoryEntry = memoryGet({
    sourceLanguage,
    targetLanguage,
    sourceText: text,
    domain: options.domain || "general",
    protectedTerms: options.protectedTerms || options.extraTerms || []
  });

  if (memoryEntry && typeof memoryEntry.translatedText === "string") {
    return {
      text: memoryEntry.translatedText,
      meta: {
        ...meta,
        translated: true,
        provider: memoryEntry.provider || "translation-memory",
        memoryHit: true,
        durationMs: Date.now() - startedAt,
        warning: null
      }
    };
  }

  const protectedPayload = safeProtectText(
    glossary,
    text,
    {
      domain: options.domain || null,
      domains: options.domains || null,
      protectedTerms: options.protectedTerms || null,
      extraTerms: options.extraTerms || null
    },
    meta
  );

  const protectedText = protectedPayload.text;
  const tokens = protectedPayload.tokens;

  meta.protectedTermsApplied = tokens.length;
  meta.providerCharacterCount = countCharacters(protectedText);

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

    const restoredPayload = safeRestoreText(glossary, rawProviderText, tokens, text, meta);
    const restoredText = restoredPayload.text;

    const translated = Boolean(providerResult && providerResult.translated && restoredText !== text);
    const providerMeta = providerResult && providerResult.providerMeta ? providerResult.providerMeta : null;

    if (translated) {
      memorySet({
        sourceLanguage,
        targetLanguage,
        sourceText: text,
        translatedText: restoredText,
        domain: options.domain || "general",
        provider: (providerMeta && providerMeta.provider) || meta.provider,
        confidence: 1,
        emotion: options.emotion || null,
        protectedTerms: options.protectedTerms || options.extraTerms || []
      });
    }

    return {
      text: restoredText,
      meta: {
        ...meta,
        ...(providerMeta || {}),
        adapterVersion: VERSION,
        sourceLanguage,
        targetLanguage,
        languagePair: `${sourceLanguage}-${targetLanguage}`,
        protectedTermsApplied: tokens.length,
        translated,
        memoryHit: false,
        durationMs: Date.now() - startedAt,
        warning:
          restoredPayload.warning ||
          (providerResult ? providerResult.warning : null) ||
          protectedPayload.warning ||
          null
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
          durationMs: Date.now() - startedAt,
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
    "finalAnswer",
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

  const nestedCandidates = ["finalEnvelope", "envelope", "payload", "data"];

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
  options = isPlainObject(options) ? options : {};
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
  options = isPlainObject(options) ? options : {};
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


function textFromPayload(payload) {
  if (typeof payload === "string") return payload;
  if (!isPlainObject(payload)) return "";
  return (
    payload.text ||
    payload.inputText ||
    payload.userText ||
    payload.userQuery ||
    payload.query ||
    payload.originalText ||
    payload.finalAnswer ||
    payload.final ||
    payload.reply ||
    ""
  );
}

function adapterResultFromTranslation(sourceText, translationResult, payload = {}) {
  const meta = isPlainObject(translationResult && translationResult.meta)
    ? translationResult.meta
    : createMeta({ warning: "translation-meta-missing" });

  const translatedText =
    translationResult && typeof translationResult.text === "string"
      ? translationResult.text
      : sourceText;

  return {
    ok: true,
    authority: "marion",
    text: translatedText,
    translatedText,
    normalizedText: translatedText,
    originalText: sourceText,
    sourceLanguage: meta.sourceLanguage || normalizeLanguageCode(payload.sourceLanguage || payload.detectedLanguage || payload.language),
    targetLanguage: meta.targetLanguage || normalizeLanguageCode(payload.targetLanguage || payload.responseLanguage || "en"),
    detectedLanguage: meta.sourceLanguage || normalizeLanguageCode(payload.detectedLanguage || payload.sourceLanguage || "auto"),
    confidence: typeof meta.sourceConfidence === "number" ? meta.sourceConfidence : null,
    translationAvailable: meta.translated === true,
    fallbackUsed: meta.translated !== true,
    provider: meta.provider || "none",
    translationMeta: meta,
    languageSphere: {
      sourceLanguage: meta.sourceLanguage || normalizeLanguageCode(payload.sourceLanguage || payload.detectedLanguage || payload.language),
      targetLanguage: meta.targetLanguage || normalizeLanguageCode(payload.targetLanguage || payload.responseLanguage || "en"),
      translated: meta.translated === true,
      fallbackUsed: meta.translated !== true,
      provider: meta.provider || "none",
      confidence: typeof meta.sourceConfidence === "number" ? meta.sourceConfidence : null
    }
  };
}

async function translate(payloadOrText, options = {}) {
  const payload = isPlainObject(payloadOrText) ? payloadOrText : {};
  const text = textFromPayload(payloadOrText);
  const mergedOptions = {
    ...payload,
    ...(isPlainObject(options) ? options : {})
  };

  const result = await translateText(text, mergedOptions);
  return adapterResultFromTranslation(text, result, mergedOptions);
}

async function normalizeAndTranslate(payloadOrText, options = {}) {
  return translate(payloadOrText, options);
}

async function process(payloadOrText, options = {}) {
  return translate(payloadOrText, options);
}

async function run(payloadOrText, options = {}) {
  return translate(payloadOrText, options);
}


function resetUniversalTranslatorCaches() {
  CONFIG = null;
  GLOSSARY = null;
  LANGUAGE_DETECT = null;
  MEMORY_MODULE = null;
  LOCAL_PROVIDER = null;
  MEMORY_STORE = null;

  return true;
}

module.exports = {
  VERSION,
  detectLanguage,
  normalizeLanguageCode,
  normalizeProviderName,
  isSupportedLanguage,
  shouldTranslate,
  translateText,
  applyUniversalTranslation,
  normalizeInputForMarion,
  translate,
  normalizeAndTranslate,
  process,
  run,
  extractFinalText,
  writeFinalText,
  callProvider,
  loadConfig,
  loadGlossary,
  loadLanguageDetect,
  loadMemoryModule,
  loadLocalProvider,
  getMemoryStore,
  resetUniversalTranslatorCaches
};

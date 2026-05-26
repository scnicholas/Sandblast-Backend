'use strict';

/**
 * LanguageSphereRuntime
 * ------------------------------------------------------------
 * Phase 1 runtime orchestrator for the LanguageSphere layer.
 *
 * Flow:
 * input → normalize → detect → glossary/memory placeholders
 * → translate if required → return canonical envelope
 *
 * Critical architectural rule:
 * This runtime does NOT generate Marion's final answer.
 * It only prepares a safe language-normalized input envelope.
 */

const path = require('path');

const {
  createLanguageSphereEnvelope,
  createLanguageSphereErrorEnvelope
} = require('./LanguageSphereResultEnvelope');

let runtimeConfig = null;

function safeRequire(modulePath) {
  try {
    return require(modulePath);
  } catch (_) {
    return null;
  }
}

function loadRuntimeConfig() {
  if (runtimeConfig) return runtimeConfig;

  const configPath = path.join(__dirname, 'languagesphereRuntimeConfig.json');
  const loaded = safeRequire(configPath);

  runtimeConfig = loaded || {
    enabled: true,
    languages: {
      defaultSourceLanguage: 'auto',
      defaultTargetLanguage: 'en',
      supportedLanguages: ['en', 'es', 'fr'],
      minimumDetectionConfidence: 0.55
    },
    normalization: {
      trimWhitespace: true,
      collapseRepeatedWhitespace: true,
      normalizeSmartQuotes: true,
      preserveLineBreaks: false,
      maxInputCharacters: 12000
    },
    translation: {
      enabled: true,
      providerMode: 'local',
      providerName: 'LocalTranslationProvider',
      skipTranslationWhenSourceMatchesTarget: true,
      fallbackToOriginalOnFailure: true,
      timeoutMs: 4500
    },
    guards: {
      emptyInputGuard: true,
      loopGuard: true,
      debugLeakageGuard: true,
      providerFailureGuard: true,
      unsupportedLanguageGuard: true
    },
    diagnostics: {
      enabled: true,
      includeTraceId: true,
      includeLatencyMs: true,
      exposeInternalErrors: false
    }
  };

  return runtimeConfig;
}

function createTraceId(prefix = 'ls') {
  return `${prefix}_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 10)}`;
}

function sanitizeInputText(input) {
  if (typeof input === 'string') return input;

  if (input && typeof input === 'object') {
    if (typeof input.text === 'string') return input.text;
    if (typeof input.userText === 'string') return input.userText;
    if (typeof input.message === 'string') return input.message;
    if (typeof input.input === 'string') return input.input;
  }

  return '';
}

function normalizeText(rawText, config = loadRuntimeConfig()) {
  const normalization = config.normalization || {};
  let text = sanitizeInputText(rawText);

  if (normalization.maxInputCharacters && text.length > normalization.maxInputCharacters) {
    text = text.slice(0, normalization.maxInputCharacters);
  }

  if (normalization.normalizeSmartQuotes) {
    text = text
      .replace(/[“”]/g, '"')
      .replace(/[‘’]/g, "'")
      .replace(/—/g, '-')
      .replace(/–/g, '-');
  }

  if (!normalization.preserveLineBreaks) {
    text = text.replace(/\r?\n+/g, ' ');
  }

  if (normalization.collapseRepeatedWhitespace) {
    text = text.replace(/\s+/g, ' ');
  }

  if (normalization.trimWhitespace) {
    text = text.trim();
  }

  return text;
}

/**
 * Lightweight local detection fallback.
 * This is intentionally conservative.
 *
 * Existing LanguageDetect.js can be injected later.
 */
function localDetectLanguage(text, config = loadRuntimeConfig()) {
  const normalized = normalizeText(text, config).toLowerCase();

  if (!normalized) {
    return {
      language: 'unknown',
      confidence: 0,
      method: 'empty'
    };
  }

  const spanishMarkers = [
    ' el ',
    ' la ',
    ' los ',
    ' las ',
    ' que ',
    ' por ',
    ' para ',
    ' cómo ',
    ' como ',
    ' qué ',
    ' gracias',
    ' hola',
    ' necesito',
    ' idioma',
    ' traducción'
  ];

  const frenchMarkers = [
    ' le ',
    ' la ',
    ' les ',
    ' des ',
    ' une ',
    ' est ',
    ' pour ',
    ' avec ',
    ' bonjour',
    ' merci',
    ' traduction',
    ' français',
    ' comment'
  ];

  const padded = ` ${normalized} `;

  let spanishScore = 0;
  let frenchScore = 0;

  for (const marker of spanishMarkers) {
    if (padded.includes(marker)) spanishScore += 1;
  }

  for (const marker of frenchMarkers) {
    if (padded.includes(marker)) frenchScore += 1;
  }

  if (/[¿¡ñáéíóúü]/i.test(text)) spanishScore += 2;
  if (/[àâçèéêëîïôùûüÿœ]/i.test(text)) frenchScore += 2;

  if (spanishScore > frenchScore && spanishScore >= 2) {
    return {
      language: 'es',
      confidence: Math.min(0.95, 0.55 + spanishScore * 0.08),
      method: 'local-marker'
    };
  }

  if (frenchScore > spanishScore && frenchScore >= 2) {
    return {
      language: 'fr',
      confidence: Math.min(0.95, 0.55 + frenchScore * 0.08),
      method: 'local-marker'
    };
  }

  return {
    language: 'en',
    confidence: 0.62,
    method: 'default-en'
  };
}

function getInjectedDetector(options = {}) {
  if (options.detector && typeof options.detector.detect === 'function') {
    return options.detector;
  }

  if (typeof options.detectLanguage === 'function') {
    return {
      detect: options.detectLanguage
    };
  }

  return null;
}

async function detectLanguage(text, options = {}, config = loadRuntimeConfig()) {
  const injectedDetector = getInjectedDetector(options);

  if (injectedDetector) {
    try {
      const result = await injectedDetector.detect(text, options);

      if (typeof result === 'string') {
        return {
          language: result,
          confidence: 0.75,
          method: 'injected-string'
        };
      }

      if (result && typeof result === 'object') {
        return {
          language: result.language || result.lang || 'unknown',
          confidence:
            typeof result.confidence === 'number' ? result.confidence : 0.75,
          method: result.method || 'injected-detector'
        };
      }
    } catch (_) {
      return localDetectLanguage(text, config);
    }
  }

  return localDetectLanguage(text, config);
}

function isSupportedLanguage(language, config = loadRuntimeConfig()) {
  const supported = config.languages && Array.isArray(config.languages.supportedLanguages)
    ? config.languages.supportedLanguages
    : ['en', 'es', 'fr'];

  return supported.includes(language);
}

function shouldTranslate(sourceLanguage, targetLanguage, config = loadRuntimeConfig()) {
  const translation = config.translation || {};

  if (!translation.enabled) return false;
  if (!sourceLanguage || sourceLanguage === 'unknown') return false;

  if (
    translation.skipTranslationWhenSourceMatchesTarget &&
    sourceLanguage === targetLanguage
  ) {
    return false;
  }

  return sourceLanguage !== targetLanguage;
}

function getInjectedProvider(options = {}) {
  if (options.provider && typeof options.provider.translate === 'function') {
    return options.provider;
  }

  if (typeof options.translate === 'function') {
    return {
      translate: options.translate
    };
  }

  return null;
}

/**
 * Local placeholder provider.
 * This does not pretend to be a production-grade translator.
 * It safely passes original text through until the real provider is connected.
 */
async function localTranslatePassthrough(text, context = {}) {
  return {
    text,
    providerName: 'LocalTranslationProvider',
    providerMode: 'passthrough',
    applied: false,
    warning: `No production translation provider connected for ${context.sourceLanguage || 'unknown'}→${context.targetLanguage || 'en'}`
  };
}

async function translateText(text, context = {}, options = {}, config = loadRuntimeConfig()) {
  const provider = getInjectedProvider(options);

  if (provider) {
    const result = await provider.translate(text, context);

    if (typeof result === 'string') {
      return {
        text: result,
        providerName: 'InjectedTranslationProvider',
        providerMode: 'injected',
        applied: result !== text
      };
    }

    if (result && typeof result === 'object') {
      return {
        text: typeof result.text === 'string'
          ? result.text
          : typeof result.translatedText === 'string'
            ? result.translatedText
            : text,
        providerName: result.providerName || 'InjectedTranslationProvider',
        providerMode: result.providerMode || 'injected',
        applied:
          typeof result.applied === 'boolean'
            ? result.applied
            : Boolean(result.text && result.text !== text),
        warnings: Array.isArray(result.warnings) ? result.warnings : []
      };
    }
  }

  return localTranslatePassthrough(text, context, config);
}

function getTargetLanguage(input, config = loadRuntimeConfig()) {
  if (input && typeof input === 'object') {
    if (typeof input.targetLanguage === 'string') return input.targetLanguage;
    if (typeof input.targetLang === 'string') return input.targetLang;
    if (typeof input.locale === 'string') {
      const localePrefix = input.locale.split('-')[0].toLowerCase();
      if (localePrefix) return localePrefix;
    }
  }

  return (
    config.languages &&
    typeof config.languages.defaultTargetLanguage === 'string'
      ? config.languages.defaultTargetLanguage
      : 'en'
  );
}

function extractTermsPlaceholder() {
  return {
    termsDetected: [],
    termsLocked: [],
    termsApplied: []
  };
}

function extractMemoryPlaceholder() {
  return {
    memoryHit: false,
    memoryKey: '',
    memorySource: ''
  };
}

async function runLanguageSphere(input, options = {}) {
  const config = loadRuntimeConfig();
  const traceId = createTraceId();
  const startedAt = Date.now();
  const warnings = [];
  const errors = [];

  try {
    if (!config.enabled) {
      const sourceText = sanitizeInputText(input);
      const normalizedText = normalizeText(sourceText, config);
      const targetLanguage = getTargetLanguage(input, config);

      warnings.push('LanguageSphere runtime disabled; passthrough envelope returned.');

      return createLanguageSphereEnvelope({
        status: 'disabled',
        sourceText,
        normalizedText,
        translatedText: normalizedText,
        sourceLanguage: 'unknown',
        targetLanguage,
        confidence: 0,
        translationRequired: false,
        translationApplied: false,
        fallbackApplied: true,
        warnings,
        errors,
        traceId,
        latencyMs: Date.now() - startedAt,
        providerName: 'none',
        providerMode: 'disabled'
      });
    }

    const sourceText = sanitizeInputText(input);
    const normalizedText = normalizeText(sourceText, config);
    const targetLanguage = getTargetLanguage(input, config);

    if (!normalizedText) {
      warnings.push('Empty input received; returning guarded empty envelope.');

      return createLanguageSphereEnvelope({
        status: 'empty',
        sourceText,
        normalizedText,
        translatedText: normalizedText,
        sourceLanguage: 'unknown',
        targetLanguage,
        confidence: 0,
        translationRequired: false,
        translationApplied: false,
        fallbackApplied: true,
        warnings,
        errors,
        traceId,
        latencyMs: Date.now() - startedAt,
        providerName: 'none',
        providerMode: 'guarded-empty'
      });
    }

    const detection = await detectLanguage(normalizedText, options, config);
    const sourceLanguage = detection.language || 'unknown';
    const confidence =
      typeof detection.confidence === 'number' ? detection.confidence : 0;

    if (!isSupportedLanguage(sourceLanguage, config) && sourceLanguage !== 'unknown') {
      warnings.push(`Unsupported source language "${sourceLanguage}" detected.`);

      if (!config.languages || !config.languages.allowUnsupportedPassthrough) {
        return createLanguageSphereEnvelope({
          status: 'unsupported-language',
          sourceText,
          normalizedText,
          translatedText: normalizedText,
          sourceLanguage,
          targetLanguage,
          confidence,
          translationRequired: false,
          translationApplied: false,
          fallbackApplied: true,
          warnings,
          errors,
          traceId,
          latencyMs: Date.now() - startedAt,
          providerName: 'none',
          providerMode: 'unsupported-language'
        });
      }
    }

    const minimumConfidence =
      config.languages && typeof config.languages.minimumDetectionConfidence === 'number'
        ? config.languages.minimumDetectionConfidence
        : 0.55;

    if (confidence < minimumConfidence) {
      warnings.push(
        `Language detection confidence below threshold: ${confidence.toFixed(2)}`
      );
    }

    const translationRequired = shouldTranslate(sourceLanguage, targetLanguage, config);

    const glossaryState = extractTermsPlaceholder(normalizedText, {
      sourceLanguage,
      targetLanguage
    });

    const memoryState = extractMemoryPlaceholder(normalizedText, {
      sourceLanguage,
      targetLanguage
    });

    let translatedText = normalizedText;
    let translationApplied = false;
    let fallbackApplied = false;
    let providerName = 'none';
    let providerMode = 'none';

    if (translationRequired) {
      try {
        const translated = await translateText(
          normalizedText,
          {
            sourceLanguage,
            targetLanguage,
            traceId,
            glossaryState,
            memoryState
          },
          options,
          config
        );

        translatedText = translated.text || normalizedText;
        translationApplied = Boolean(translated.applied);
        providerName = translated.providerName || 'unknown';
        providerMode = translated.providerMode || 'unknown';

        if (translated.warning) warnings.push(translated.warning);
        if (Array.isArray(translated.warnings)) warnings.push(...translated.warnings);

        if (!translationApplied && translatedText === normalizedText) {
          fallbackApplied = true;
        }
      } catch (error) {
        fallbackApplied = true;
        translatedText = normalizedText;
        providerName = 'none';
        providerMode = 'provider-error';

        if (config.diagnostics && config.diagnostics.exposeInternalErrors) {
          errors.push(error && error.message ? error.message : String(error));
        } else {
          errors.push('Translation provider failed; fallback text returned.');
        }
      }
    }

    return createLanguageSphereEnvelope({
      status: 'ok',
      sourceText,
      normalizedText,
      translatedText,
      sourceLanguage,
      targetLanguage,
      confidence,
      translationRequired,
      translationApplied,
      fallbackApplied,
      providerName,
      providerMode,
      latencyMs: Date.now() - startedAt,
      warnings,
      errors,
      traceId,
      ...glossaryState,
      ...memoryState
    });
  } catch (error) {
    return createLanguageSphereErrorEnvelope({
      sourceText: sanitizeInputText(input),
      normalizedText: normalizeText(input, config),
      translatedText: normalizeText(input, config),
      sourceLanguage: 'unknown',
      targetLanguage: getTargetLanguage(input, config),
      confidence: 0,
      fallbackApplied: true,
      providerName: 'none',
      providerMode: 'runtime-error',
      latencyMs: Date.now() - startedAt,
      traceId,
      warnings,
      errors: [
        config.diagnostics && config.diagnostics.exposeInternalErrors
          ? error && error.message
            ? error.message
            : String(error)
          : 'LanguageSphere runtime failed safely.'
      ]
    });
  }
}

module.exports = {
  runLanguageSphere,
  normalizeText,
  detectLanguage,
  localDetectLanguage,
  shouldTranslate,
  isSupportedLanguage,
  loadRuntimeConfig
};

'use strict';

/**
 * LingoSentinelCoreAdapter
 *
 * Connects the Marion ↔ LingoSentinel gateway to the existing translation stack.
 *
 * Current runtime placement:
 * - This file lives in Data/marion/runtime/LingoSentinel.
 * - LingoSentinel/LanguageSphere support files currently live beside it.
 *
 * Design rules:
 * - Normalize detector output before it reaches Marion.
 * - Never leak provider-specific object shapes downstream.
 * - Prefer existing UniversalTranslatorAdapter / LocalTranslationProvider when available.
 * - Fall back safely without crashing Marion.
 * - Marion still reviews every response through the authority guard.
 */

const {
  createLingoSentinelResponseEnvelope,
  createLingoSentinelFallbackResponse
} = require('./LingoSentinelResponseEnvelope');

function optionalRequire(path) {
  try {
    return require(path);
  } catch (error) {
    return null;
  }
}

const UniversalTranslatorAdapter = optionalRequire('./UniversalTranslatorAdapter');
const LocalTranslationProvider = optionalRequire('./LocalTranslationProvider');
const LanguageDetect = optionalRequire('./LanguageDetect');
const TranslationGlossary = optionalRequire('./TranslationGlossary');
const TranslationMemoryStore = optionalRequire('./TranslationMemoryStore');

const SUPPORTED_LANGUAGE_CODES = new Set(['auto', 'en', 'fr', 'es']);

function normalizeText(value) {
  return String(value || '').trim();
}

function clampConfidence(value, fallback = 0.75) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return fallback;
  }

  return Math.max(0, Math.min(1, number));
}

function uniqueWarnings(warnings = []) {
  const seen = new Set();
  const clean = [];

  for (const warning of warnings) {
    const value = normalizeText(warning);

    if (!value || seen.has(value)) continue;

    seen.add(value);
    clean.push(value);
  }

  return clean;
}

function normalizeLanguageCode(code, fallback = 'auto') {
  const value = normalizeText(code).toLowerCase();

  if (!value) return fallback;

  const aliases = {
    english: 'en',
    anglais: 'en',
    ingles: 'en',
    inglés: 'en',

    french: 'fr',
    francais: 'fr',
    français: 'fr',
    frances: 'fr',
    francés: 'fr',

    spanish: 'es',
    espanol: 'es',
    español: 'es',
    espagnol: 'es'
  };

  const normalized = aliases[value] || value;

  if (SUPPORTED_LANGUAGE_CODES.has(normalized)) {
    return normalized;
  }

  return normalized.length >= 2 && normalized.length <= 8
    ? normalized
    : fallback;
}

function extractLanguageCode(result, fallback = 'auto') {
  if (!result) return fallback;

  if (typeof result === 'string') {
    return normalizeLanguageCode(result, fallback);
  }

  if (typeof result === 'object') {
    return normalizeLanguageCode(
      result.language ||
      result.lang ||
      result.code ||
      result.detectedLanguage ||
      result.sourceLanguage ||
      result.locale ||
      result.id,
      fallback
    );
  }

  return fallback;
}

function extractLanguageConfidence(result, fallback = 0.75) {
  if (!result || typeof result !== 'object') {
    return fallback;
  }

  return clampConfidence(
    result.confidence ||
    result.score ||
    result.probability ||
    result.certainty,
    fallback
  );
}

function simpleDetectLanguage(text) {
  const value = normalizeText(text);

  if (!value) return 'auto';

  if (/[ñáéíóú¿¡]/i.test(value) || /\b(hola|gracias|cómo|qué|dónde|usted|ustedes|español|porque)\b/i.test(value)) {
    return 'es';
  }

  if (/[àâçéèêëîïôûùüÿ]/i.test(value) || /\b(bonjour|merci|comment|pourquoi|vous|nous|français|avec|est-ce)\b/i.test(value)) {
    return 'fr';
  }

  return 'en';
}

async function detectLanguageDetailed(text) {
  const value = normalizeText(text);
  const fallbackLanguage = simpleDetectLanguage(value);

  if (!value) {
    return {
      language: 'auto',
      confidence: 0,
      provider: 'none',
      raw: null,
      warning: 'Empty text cannot be language-detected.'
    };
  }

  try {
    if (LanguageDetect) {
      let raw = null;
      let provider = 'LanguageDetect';

      if (typeof LanguageDetect.detectLanguage === 'function') {
        raw = await LanguageDetect.detectLanguage(value);
      } else if (typeof LanguageDetect.detect === 'function') {
        raw = await LanguageDetect.detect(value);
      } else if (typeof LanguageDetect === 'function') {
        raw = await LanguageDetect(value);
      }

      if (raw !== null && raw !== undefined) {
        return {
          language: extractLanguageCode(raw, fallbackLanguage),
          confidence: extractLanguageConfidence(raw, fallbackLanguage === 'auto' ? 0 : 0.78),
          provider,
          raw
        };
      }
    }
  } catch (error) {
    return {
      language: fallbackLanguage,
      confidence: fallbackLanguage === 'auto' ? 0 : 0.62,
      provider: 'simple-detector',
      raw: null,
      warning: `LanguageDetect failed: ${error.message}`
    };
  }

  return {
    language: fallbackLanguage,
    confidence: fallbackLanguage === 'auto' ? 0 : 0.68,
    provider: 'simple-detector',
    raw: null
  };
}

async function detectLanguage(text) {
  const detail = await detectLanguageDetailed(text);
  return detail.language;
}

function applyGlossary(text, requestEnvelope = {}) {
  const value = normalizeText(text);
  let glossaryUsed = false;
  let output = value;

  if (!value) {
    return {
      text: value,
      glossaryUsed
    };
  }

  try {
    if (TranslationGlossary) {
      if (typeof TranslationGlossary.applyGlossary === 'function') {
        const result = TranslationGlossary.applyGlossary(output, requestEnvelope);
        output = normalizeText(result && result.text ? result.text : result || output);
        glossaryUsed = true;
      } else if (typeof TranslationGlossary.apply === 'function') {
        const result = TranslationGlossary.apply(output, requestEnvelope);
        output = normalizeText(result && result.text ? result.text : result || output);
        glossaryUsed = true;
      } else if (typeof TranslationGlossary.replace === 'function') {
        const result = TranslationGlossary.replace(output, requestEnvelope);
        output = normalizeText(result && result.text ? result.text : result || output);
        glossaryUsed = true;
      }
    }
  } catch (error) {
    return {
      text: output,
      glossaryUsed: false,
      warning: `Glossary application failed: ${error.message}`
    };
  }

  return {
    text: output,
    glossaryUsed
  };
}

async function readTranslationMemory(requestEnvelope = {}) {
  try {
    if (!TranslationMemoryStore) return null;

    if (typeof TranslationMemoryStore.lookup === 'function') {
      return await TranslationMemoryStore.lookup(requestEnvelope);
    }

    if (typeof TranslationMemoryStore.get === 'function') {
      return await TranslationMemoryStore.get(requestEnvelope);
    }

    if (typeof TranslationMemoryStore.find === 'function') {
      return await TranslationMemoryStore.find(requestEnvelope);
    }
  } catch (error) {
    return null;
  }

  return null;
}

async function writeTranslationMemory(requestEnvelope = {}, responseEnvelope = {}) {
  try {
    if (!TranslationMemoryStore) return false;

    if (typeof TranslationMemoryStore.store === 'function') {
      await TranslationMemoryStore.store(requestEnvelope, responseEnvelope);
      return true;
    }

    if (typeof TranslationMemoryStore.set === 'function') {
      await TranslationMemoryStore.set(requestEnvelope, responseEnvelope);
      return true;
    }

    if (typeof TranslationMemoryStore.save === 'function') {
      await TranslationMemoryStore.save(requestEnvelope, responseEnvelope);
      return true;
    }
  } catch (error) {
    return false;
  }

  return false;
}

function normalizeTranslationResult(result, provider) {
  if (!result) {
    return {
      ok: false,
      text: '',
      translatedText: '',
      adaptedText: '',
      confidence: 0,
      provider,
      warnings: [`${provider} returned no result.`]
    };
  }

  if (typeof result === 'string') {
    const text = normalizeText(result);

    return {
      ok: Boolean(text),
      text,
      translatedText: text,
      adaptedText: '',
      confidence: 0.72,
      provider,
      warnings: []
    };
  }

  const warnings = Array.isArray(result.warnings)
    ? result.warnings
    : result.warning
      ? [result.warning]
      : [];

  const text = normalizeText(
    result.finalText ||
    result.translatedText ||
    result.adaptedText ||
    result.text ||
    result.output ||
    result.result
  );

  return {
    ok: result.ok !== false && Boolean(text),
    text,
    translatedText: normalizeText(result.translatedText || result.translation || text),
    adaptedText: normalizeText(result.adaptedText || result.localizedText || ''),
    confidence: clampConfidence(result.confidence, 0.76),
    provider: result.provider || provider,
    warnings: uniqueWarnings(warnings),
    metadata: result.metadata || {}
  };
}

async function callUniversalTranslator(requestEnvelope = {}) {
  const text = normalizeText(requestEnvelope.text);

  if (!text) {
    return {
      ok: false,
      text: '',
      translatedText: '',
      confidence: 0,
      provider: 'none',
      warnings: ['No text provided for translation.']
    };
  }

  try {
    if (UniversalTranslatorAdapter) {
      if (typeof UniversalTranslatorAdapter.translate === 'function') {
        const result = await UniversalTranslatorAdapter.translate({
          text,
          sourceLanguage: requestEnvelope.sourceLanguage,
          targetLanguage: requestEnvelope.targetLanguage,
          mode: requestEnvelope.mode,
          domain: requestEnvelope.domain,
          preserveTone: requestEnvelope.preserveTone,
          preserveIntent: requestEnvelope.preserveIntent,
          glossaryHints: requestEnvelope.glossaryHints || [],
          metadata: requestEnvelope.metadata || {}
        });

        return normalizeTranslationResult(result, 'UniversalTranslatorAdapter');
      }

      if (typeof UniversalTranslatorAdapter.process === 'function') {
        const result = await UniversalTranslatorAdapter.process(requestEnvelope);
        return normalizeTranslationResult(result, 'UniversalTranslatorAdapter');
      }

      if (typeof UniversalTranslatorAdapter.run === 'function') {
        const result = await UniversalTranslatorAdapter.run(requestEnvelope);
        return normalizeTranslationResult(result, 'UniversalTranslatorAdapter');
      }

      if (typeof UniversalTranslatorAdapter === 'function') {
        const result = await UniversalTranslatorAdapter(requestEnvelope);
        return normalizeTranslationResult(result, 'UniversalTranslatorAdapter');
      }
    }
  } catch (error) {
    return {
      ok: false,
      text: '',
      translatedText: '',
      confidence: 0,
      provider: 'UniversalTranslatorAdapter',
      warnings: [`UniversalTranslatorAdapter failed: ${error.message}`]
    };
  }

  try {
    if (LocalTranslationProvider) {
      if (typeof LocalTranslationProvider.translate === 'function') {
        const result = await LocalTranslationProvider.translate(
          text,
          requestEnvelope.sourceLanguage,
          requestEnvelope.targetLanguage,
          requestEnvelope
        );

        return normalizeTranslationResult(result, 'LocalTranslationProvider');
      }

      if (typeof LocalTranslationProvider.process === 'function') {
        const result = await LocalTranslationProvider.process(requestEnvelope);
        return normalizeTranslationResult(result, 'LocalTranslationProvider');
      }

      if (typeof LocalTranslationProvider.run === 'function') {
        const result = await LocalTranslationProvider.run(requestEnvelope);
        return normalizeTranslationResult(result, 'LocalTranslationProvider');
      }
    }
  } catch (error) {
    return {
      ok: false,
      text: '',
      translatedText: '',
      confidence: 0,
      provider: 'LocalTranslationProvider',
      warnings: [`LocalTranslationProvider failed: ${error.message}`]
    };
  }

  return localFallbackTranslate(requestEnvelope);
}

function localFallbackTranslate(requestEnvelope = {}) {
  const text = normalizeText(requestEnvelope.text);
  const source = normalizeLanguageCode(requestEnvelope.sourceLanguage || 'auto', 'auto');
  const target = normalizeLanguageCode(requestEnvelope.targetLanguage || 'en', 'en');

  if (!text) {
    return {
      ok: false,
      text: '',
      translatedText: '',
      confidence: 0,
      provider: 'local-fallback',
      warnings: ['Empty fallback translation input.']
    };
  }

  if (source === target || source === 'auto') {
    return {
      ok: true,
      text,
      translatedText: text,
      confidence: 0.58,
      provider: 'local-fallback',
      warnings: ['No active translation provider confirmed; returned normalized source text.']
    };
  }

  return {
    ok: true,
    text,
    translatedText: text,
    confidence: 0.42,
    provider: 'local-fallback',
    warnings: [
      'No active translation provider confirmed; returned source text as fallback.',
      'Marion should ask for clarification or verify translation before final use.'
    ]
  };
}

function adaptText(text, requestEnvelope = {}) {
  const value = normalizeText(text);

  if (!value) return '';

  if (requestEnvelope.mode !== 'adapt') {
    return value;
  }

  /**
   * Conservative adaptation pass:
   * - Normalize spacing.
   * - Preserve content.
   * - Avoid inventing cultural meaning without a stronger adaptation provider.
   */
  return value
    .replace(/\s+/g, ' ')
    .trim();
}

function explainLanguageLearning(text, requestEnvelope = {}) {
  const value = normalizeText(text);

  if (!value) return '';

  return [
    value,
    '',
    'Language note: LingoSentinel routed this as a learning request. Marion should provide the final explanation, examples, and confidence boundaries.'
  ].join('\n');
}

function getMemoryFinalText(memoryHit = {}) {
  return normalizeText(
    memoryHit.finalText ||
    memoryHit.translatedText ||
    memoryHit.adaptedText ||
    memoryHit.text ||
    memoryHit.output
  );
}

async function processLingoSentinelRequest(requestEnvelope = {}) {
  const startedAt = Date.now();
  const warnings = [];

  try {
    const text = normalizeText(requestEnvelope.text);

    if (!text) {
      return createLingoSentinelFallbackResponse({
        requestId: requestEnvelope.requestId,
        sourceLanguage: normalizeLanguageCode(requestEnvelope.sourceLanguage || 'auto', 'auto'),
        targetLanguage: normalizeLanguageCode(requestEnvelope.targetLanguage || 'en', 'en'),
        mode: requestEnvelope.mode,
        reason: 'LingoSentinel received empty text.'
      });
    }

    const detectionDetail = requestEnvelope.sourceLanguage === 'auto'
      ? await detectLanguageDetailed(text)
      : {
          language: normalizeLanguageCode(requestEnvelope.sourceLanguage, 'auto'),
          confidence: 1,
          provider: 'provided-source-language',
          raw: requestEnvelope.sourceLanguage
        };

    if (detectionDetail.warning) {
      warnings.push(detectionDetail.warning);
    }

    const detectedLanguage = normalizeLanguageCode(detectionDetail.language, 'auto');

    const enrichedRequest = {
      ...requestEnvelope,
      sourceLanguage: detectedLanguage || normalizeLanguageCode(requestEnvelope.sourceLanguage || 'auto', 'auto'),
      targetLanguage: normalizeLanguageCode(requestEnvelope.targetLanguage || 'en', 'en')
    };

    const memoryHit = await readTranslationMemory(enrichedRequest);
    const memoryFinalText = memoryHit ? getMemoryFinalText(memoryHit) : '';

    if (memoryHit && memoryFinalText) {
      return createLingoSentinelResponseEnvelope({
        ok: true,
        requestId: enrichedRequest.requestId,
        detectedLanguage,
        sourceLanguage: enrichedRequest.sourceLanguage,
        targetLanguage: enrichedRequest.targetLanguage,
        mode: enrichedRequest.mode,
        normalizedText: text,
        translatedText: normalizeText(memoryHit.translatedText || memoryFinalText),
        adaptedText: normalizeText(memoryHit.adaptedText || ''),
        finalText: memoryFinalText,
        confidence: clampConfidence(memoryHit.confidence, 0.86),
        warnings: uniqueWarnings(warnings),
        memoryUsed: true,
        provider: 'TranslationMemoryStore',
        metadata: {
          latencyMs: Date.now() - startedAt,
          detectorProvider: detectionDetail.provider,
          detectorConfidence: detectionDetail.confidence
        }
      });
    }

    if (enrichedRequest.mode === 'detect') {
      return createLingoSentinelResponseEnvelope({
        ok: true,
        requestId: enrichedRequest.requestId,
        detectedLanguage,
        sourceLanguage: detectedLanguage,
        targetLanguage: enrichedRequest.targetLanguage,
        mode: 'detect',
        normalizedText: text,
        translatedText: text,
        adaptedText: '',
        finalText: `Detected language: ${detectedLanguage}`,
        confidence: clampConfidence(detectionDetail.confidence, 0.8),
        warnings: uniqueWarnings(warnings),
        provider: detectionDetail.provider || 'LanguageDetect',
        metadata: {
          latencyMs: Date.now() - startedAt,
          detectorConfidence: detectionDetail.confidence
        }
      });
    }

    const translationResult = await callUniversalTranslator(enrichedRequest);

    if (Array.isArray(translationResult.warnings)) {
      warnings.push(...translationResult.warnings);
    }

    if (translationResult.warning) {
      warnings.push(translationResult.warning);
    }

    const translatedText = normalizeText(
      translationResult.translatedText ||
      translationResult.text ||
      text
    );

    const glossaryResult = applyGlossary(translatedText, enrichedRequest);

    if (glossaryResult.warning) {
      warnings.push(glossaryResult.warning);
    }

    let finalText = glossaryResult.text || translatedText || text;

    if (enrichedRequest.mode === 'adapt') {
      finalText = adaptText(finalText, enrichedRequest);
    }

    if (enrichedRequest.mode === 'learn') {
      finalText = explainLanguageLearning(finalText, enrichedRequest);
    }

    const responseEnvelope = createLingoSentinelResponseEnvelope({
      ok: translationResult.ok !== false && Boolean(finalText),
      requestId: enrichedRequest.requestId,
      detectedLanguage,
      sourceLanguage: enrichedRequest.sourceLanguage,
      targetLanguage: enrichedRequest.targetLanguage,
      mode: enrichedRequest.mode,
      normalizedText: text,
      translatedText,
      adaptedText: enrichedRequest.mode === 'adapt' ? finalText : '',
      finalText,
      confidence: clampConfidence(
        translationResult.confidence,
        translationResult.provider === 'local-fallback' ? 0.42 : 0.76
      ),
      warnings: uniqueWarnings(warnings),
      fallbackUsed: translationResult.provider === 'local-fallback' && clampConfidence(translationResult.confidence, 0.42) < 0.6,
      glossaryUsed: Boolean(glossaryResult.glossaryUsed),
      memoryUsed: false,
      provider: translationResult.provider || 'lingosentinel-core',
      metadata: {
        latencyMs: Date.now() - startedAt,
        detectorProvider: detectionDetail.provider,
        detectorConfidence: detectionDetail.confidence,
        translationMetadata: translationResult.metadata || {}
      }
    });

    await writeTranslationMemory(enrichedRequest, responseEnvelope);

    return responseEnvelope;
  } catch (error) {
    return createLingoSentinelFallbackResponse({
      requestId: requestEnvelope.requestId,
      sourceLanguage: normalizeLanguageCode(requestEnvelope.sourceLanguage || 'auto', 'auto'),
      targetLanguage: normalizeLanguageCode(requestEnvelope.targetLanguage || 'en', 'en'),
      mode: requestEnvelope.mode,
      reason: `LingoSentinel processing failed: ${error.message}`
    });
  }
}

module.exports = {
  processLingoSentinelRequest,
  detectLanguage,
  detectLanguageDetailed,
  extractLanguageCode,
  normalizeLanguageCode,
  applyGlossary,
  localFallbackTranslate
};

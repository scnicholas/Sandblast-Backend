'use strict';

/**
 * LingoLinkCoreAdapter
 *
 * Connects the Marion ↔ LingoLink gateway to the existing translation stack.
 *
 * This file is intentionally defensive:
 * - It attempts to use existing LanguageSphere / Universal Translator files.
 * - If those files are absent or shaped differently, it falls back safely.
 * - Marion still reviews every response through the authority guard.
 */

const {
  createLingoLinkResponseEnvelope,
  createLingoLinkFallbackResponse
} = require('./LingoLinkResponseEnvelope');

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

function normalizeText(value) {
  return String(value || '').trim();
}

function simpleDetectLanguage(text) {
  const value = normalizeText(text);

  if (!value) return 'auto';

  if (/[ñáéíóú¿¡]/i.test(value) || /\b(hola|gracias|cómo|qué|dónde|usted|español)\b/i.test(value)) {
    return 'es';
  }

  if (/[àâçéèêëîïôûùüÿ]/i.test(value) || /\b(bonjour|merci|comment|pourquoi|vous|français)\b/i.test(value)) {
    return 'fr';
  }

  return 'en';
}

async function detectLanguage(text) {
  const value = normalizeText(text);

  if (!value) return 'auto';

  try {
    if (LanguageDetect) {
      if (typeof LanguageDetect.detectLanguage === 'function') {
        return await LanguageDetect.detectLanguage(value);
      }

      if (typeof LanguageDetect.detect === 'function') {
        return await LanguageDetect.detect(value);
      }

      if (typeof LanguageDetect === 'function') {
        return await LanguageDetect(value);
      }
    }
  } catch (error) {
    return simpleDetectLanguage(value);
  }

  return simpleDetectLanguage(value);
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
      }
    }
  } catch (error) {
    return {
      text: output,
      glossaryUsed: false,
      warning: 'Glossary application failed.'
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
  } catch (error) {
    return false;
  }

  return false;
}

async function callUniversalTranslator(requestEnvelope = {}) {
  const text = normalizeText(requestEnvelope.text);

  if (!text) {
    return {
      ok: false,
      text: '',
      confidence: 0,
      provider: 'none',
      warning: 'No text provided for translation.'
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
          preserveIntent: requestEnvelope.preserveIntent
        });

        return normalizeTranslationResult(result, 'UniversalTranslatorAdapter');
      }

      if (typeof UniversalTranslatorAdapter.process === 'function') {
        const result = await UniversalTranslatorAdapter.process(requestEnvelope);
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
      confidence: 0,
      provider: 'UniversalTranslatorAdapter',
      warning: `UniversalTranslatorAdapter failed: ${error.message}`
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
    }
  } catch (error) {
    return {
      ok: false,
      text: '',
      confidence: 0,
      provider: 'LocalTranslationProvider',
      warning: `LocalTranslationProvider failed: ${error.message}`
    };
  }

  return localFallbackTranslate(requestEnvelope);
}

function normalizeTranslationResult(result, provider) {
  if (!result) {
    return {
      ok: false,
      text: '',
      confidence: 0,
      provider,
      warning: `${provider} returned no result.`
    };
  }

  if (typeof result === 'string') {
    return {
      ok: Boolean(normalizeText(result)),
      text: normalizeText(result),
      confidence: 0.72,
      provider
    };
  }

  const text = normalizeText(
    result.finalText ||
    result.translatedText ||
    result.adaptedText ||
    result.text ||
    result.output
  );

  return {
    ok: result.ok !== false && Boolean(text),
    text,
    translatedText: normalizeText(result.translatedText || text),
    adaptedText: normalizeText(result.adaptedText),
    confidence: Number.isFinite(Number(result.confidence)) ? Number(result.confidence) : 0.76,
    provider: result.provider || provider,
    warnings: Array.isArray(result.warnings) ? result.warnings : []
  };
}

function localFallbackTranslate(requestEnvelope = {}) {
  const text = normalizeText(requestEnvelope.text);
  const source = requestEnvelope.sourceLanguage || 'auto';
  const target = requestEnvelope.targetLanguage || 'en';

  if (!text) {
    return {
      ok: false,
      text: '',
      confidence: 0,
      provider: 'local-fallback',
      warning: 'Empty fallback translation input.'
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
   * This is intentionally conservative.
   * True cultural adaptation should be handled by a stronger provider later.
   * For now, we preserve content and lightly normalize spacing.
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
    'Language note: LingoLink can route this as a learning request, but Marion should provide the final explanation, examples, and confidence boundaries.'
  ].join('\n');
}

async function processLingoLinkRequest(requestEnvelope = {}) {
  const startedAt = Date.now();
  const warnings = [];

  try {
    const text = normalizeText(requestEnvelope.text);

    if (!text) {
      return createLingoLinkFallbackResponse({
        requestId: requestEnvelope.requestId,
        sourceLanguage: requestEnvelope.sourceLanguage,
        targetLanguage: requestEnvelope.targetLanguage,
        mode: requestEnvelope.mode,
        reason: 'LingoLink received empty text.'
      });
    }

    const detectedLanguage = requestEnvelope.sourceLanguage === 'auto'
      ? await detectLanguage(text)
      : requestEnvelope.sourceLanguage;

    const enrichedRequest = {
      ...requestEnvelope,
      sourceLanguage: detectedLanguage || requestEnvelope.sourceLanguage || 'auto'
    };

    const memoryHit = await readTranslationMemory(enrichedRequest);

    if (memoryHit && memoryHit.finalText) {
      return createLingoLinkResponseEnvelope({
        ok: true,
        requestId: enrichedRequest.requestId,
        detectedLanguage,
        sourceLanguage: enrichedRequest.sourceLanguage,
        targetLanguage: enrichedRequest.targetLanguage,
        mode: enrichedRequest.mode,
        normalizedText: text,
        translatedText: memoryHit.translatedText || memoryHit.finalText,
        adaptedText: memoryHit.adaptedText || '',
        finalText: memoryHit.finalText,
        confidence: memoryHit.confidence || 0.86,
        memoryUsed: true,
        provider: 'TranslationMemoryStore',
        metadata: {
          latencyMs: Date.now() - startedAt
        }
      });
    }

    if (enrichedRequest.mode === 'detect') {
      return createLingoLinkResponseEnvelope({
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
        confidence: 0.8,
        provider: 'LanguageDetect',
        metadata: {
          latencyMs: Date.now() - startedAt
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

    const translatedText = normalizeText(translationResult.translatedText || translationResult.text || text);

    const glossaryResult = applyGlossary(translatedText, enrichedRequest);

    if (glossaryResult.warning) {
      warnings.push(glossaryResult.warning);
    }

    let finalText = glossaryResult.text;

    if (enrichedRequest.mode === 'adapt') {
      finalText = adaptText(finalText, enrichedRequest);
    }

    if (enrichedRequest.mode === 'learn') {
      finalText = explainLanguageLearning(finalText, enrichedRequest);
    }

    const responseEnvelope = createLingoLinkResponseEnvelope({
      ok: translationResult.ok !== false,
      requestId: enrichedRequest.requestId,
      detectedLanguage,
      sourceLanguage: enrichedRequest.sourceLanguage,
      targetLanguage: enrichedRequest.targetLanguage,
      mode: enrichedRequest.mode,
      normalizedText: text,
      translatedText,
      adaptedText: enrichedRequest.mode === 'adapt' ? finalText : '',
      finalText,
      confidence: translationResult.confidence,
      warnings,
      fallbackUsed: translationResult.provider === 'local-fallback' && translationResult.confidence < 0.6,
      glossaryUsed: glossaryResult.glossaryUsed,
      memoryUsed: false,
      provider: translationResult.provider,
      metadata: {
        latencyMs: Date.now() - startedAt
      }
    });

    await writeTranslationMemory(enrichedRequest, responseEnvelope);

    return responseEnvelope;
  } catch (error) {
    return createLingoLinkFallbackResponse({
      requestId: requestEnvelope.requestId,
      sourceLanguage: requestEnvelope.sourceLanguage,
      targetLanguage: requestEnvelope.targetLanguage,
      mode: requestEnvelope.mode,
      reason: `LingoLink processing failed: ${error.message}`
    });
  }
}

module.exports = {
  processLingoLinkRequest,
  detectLanguage,
  applyGlossary,
  localFallbackTranslate
};

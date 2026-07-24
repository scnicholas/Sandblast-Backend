'use strict';

/**
 * LingoSentinelEnglishRelayPolicy
 * ------------------------------------------------------------
 * Explicit English-to-English bypass authority for Layers 5-7.
 * Translation providers are never called from this policy.
 */

const VERSION = 'nyx.lingosentinel.englishRelayPolicy/6.0-translation-bypass';
const ENGLISH_RELAY_ONLY = String(process.env.LINGOSENTINEL_ENGLISH_RELAY_ONLY || 'true').toLowerCase() !== 'false';

function normalizeLanguage(value, fallback = 'en') {
  const raw = String(value == null ? '' : value).trim().toLowerCase().replace(/_/g, '-');
  if (!raw) return fallback;
  if (/^(en|eng|english|en-ca|en-us|en-gb)$/.test(raw)) return 'en';
  return raw.slice(0, 16);
}

function evaluate(input = {}) {
  const source = normalizeLanguage(input.sourceLanguage || input.source || input.from || 'en');
  const target = normalizeLanguage(input.targetLanguage || input.target || input.to || 'en');
  const errors = [];
  if (ENGLISH_RELAY_ONLY && source !== 'en') errors.push({ code: 'ENGLISH_SOURCE_REQUIRED', field: 'sourceLanguage' });
  if (ENGLISH_RELAY_ONLY && target !== 'en') errors.push({ code: 'ENGLISH_TARGET_REQUIRED', field: 'targetLanguage' });
  return {
    ok: errors.length === 0,
    errors,
    sourceLanguage: source,
    targetLanguage: target,
    translation: {
      status: source === target ? 'bypassed' : 'blocked',
      required: source !== target,
      source,
      target,
      providerCalled: false
    }
  };
}

function apply(input = {}) {
  const result = evaluate(input);
  if (!result.ok) return result;
  return {
    ...result,
    originalText: String(input.text == null ? '' : input.text),
    displayText: String(input.text == null ? '' : input.text)
  };
}

function getHealth() {
  return {
    ok: true,
    service: 'LingoSentinelEnglishRelayPolicy',
    version: VERSION,
    englishRelayOnly: ENGLISH_RELAY_ONLY,
    translationRequiredForEnglishRelay: false,
    translationProviderCallsAllowed: false,
    originalTextPreserved: true
  };
}

module.exports = Object.freeze({ VERSION, ENGLISH_RELAY_ONLY, normalizeLanguage, evaluate, apply, getHealth });

'use strict';

/**
 * TonePreservationEngine
 * ------------------------------------------------------------
 * Preserves and classifies tone metadata for LanguageSphere.
 *
 * Purpose:
 * - Detect user tone from source text.
 * - Recommend safe tone preservation metadata.
 * - Avoid flattening emotional/contextual intent during translation.
 *
 * Rule:
 * This engine does not produce Marion's final answer.
 */

const path = require('path');

const {
  resolveLocaleContext
} = require('./LocaleContextResolver');

function safeRequire(modulePath, fallback = null) {
  try {
    return require(modulePath);
  } catch (_) {
    return fallback;
  }
}

const toneProfiles = safeRequire(
  path.join(__dirname, 'localeToneProfiles.json'),
  {
    profiles: {},
    fallbackProfile: {}
  }
);

function sanitizeString(value, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

function sanitizeObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value;
}

function sanitizeArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeWhitespace(text) {
  return sanitizeString(text).replace(/\s+/g, ' ').trim();
}

function getToneProfile(localeContext = {}) {
  const safeContext = sanitizeObject(localeContext);
  const profiles = sanitizeObject(toneProfiles.profiles);

  return (
    profiles[safeContext.toneProfileKey] ||
    profiles[safeContext.targetLanguage] ||
    toneProfiles.fallbackProfile ||
    {}
  );
}

function detectToneSignals(text = '') {
  const normalized = normalizeWhitespace(text);
  const lower = normalized.toLowerCase();

  const signals = {
    urgency: false,
    frustration: false,
    gratitude: false,
    uncertainty: false,
    technical: false,
    business: false,
    emotional: false,
    casual: false,
    formal: false
  };

  if (/[!?]{2,}/.test(normalized) || /\b(asap|urgent|quick|right now|immediately)\b/i.test(normalized)) {
    signals.urgency = true;
  }

  if (/\b(frustrated|annoyed|broken|not working|failed|screwed|problem|issue)\b/i.test(lower)) {
    signals.frustration = true;
  }

  if (/\b(thanks|thank you|gracias|merci|appreciate)\b/i.test(lower)) {
    signals.gratitude = true;
  }

  if (/\b(maybe|not sure|i think|possibly|probably|could be|might)\b/i.test(lower)) {
    signals.uncertainty = true;
  }

  if (/\b(api|runtime|bridge|router|payload|json|config|regression|test|domain|latency|provider)\b/i.test(lower)) {
    signals.technical = true;
  }

  if (/\b(application|fund|licensing|revenue|client|meeting|financial|portal|business)\b/i.test(lower)) {
    signals.business = true;
  }

  if (/\b(feel|worried|hope|afraid|excited|concerned|stressed)\b/i.test(lower)) {
    signals.emotional = true;
  }

  if (/\b(hey|yeah|okay|cool|gonna|wanna)\b/i.test(lower)) {
    signals.casual = true;
  }

  if (/\b(please|kindly|regards|would you|could you)\b/i.test(lower)) {
    signals.formal = true;
  }

  return signals;
}

function classifyTone(text = '') {
  const signals = detectToneSignals(text);

  let primaryTone = 'neutral';

  if (signals.frustration && signals.urgency) {
    primaryTone = 'urgent-frustrated';
  } else if (signals.urgency) {
    primaryTone = 'urgent';
  } else if (signals.frustration) {
    primaryTone = 'frustrated';
  } else if (signals.gratitude) {
    primaryTone = 'appreciative';
  } else if (signals.uncertainty) {
    primaryTone = 'uncertain';
  } else if (signals.technical) {
    primaryTone = 'technical';
  } else if (signals.business) {
    primaryTone = 'business';
  } else if (signals.emotional) {
    primaryTone = 'emotional';
  }

  return {
    primaryTone,
    signals,
    confidence: primaryTone === 'neutral' ? 0.55 : 0.78
  };
}

function recommendTonePreservation(text = '', localeInput = {}, options = {}) {
  const localeContext = resolveLocaleContext(localeInput, options);
  const toneProfile = getToneProfile(localeContext);
  const tone = classifyTone(text);

  const preserve = [
    'user intent',
    'emotional force',
    'technical specificity',
    ...sanitizeArray(toneProfile.preserve)
  ];

  const avoid = [
    'tone flattening',
    'invented cultural assumptions',
    ...sanitizeArray(toneProfile.avoid)
  ];

  const recommendations = [];

  if (tone.signals.urgency) {
    recommendations.push('preserve urgency without adding panic');
  }

  if (tone.signals.frustration) {
    recommendations.push('acknowledge friction without escalating blame');
  }

  if (tone.signals.technical) {
    recommendations.push('preserve technical precision and locked terminology');
  }

  if (tone.signals.business) {
    recommendations.push('preserve professional clarity');
  }

  if (localeContext.targetLanguage === 'es') {
    recommendations.push('preserve warmth and respectful phrasing');
  }

  if (localeContext.targetLanguage === 'fr') {
    recommendations.push('preserve polished phrasing and register');
  }

  if (localeContext.targetLanguage === 'en') {
    recommendations.push('preserve direct clarity');
  }

  return {
    module: 'TonePreservationEngine',
    status: 'ok',
    tone,
    localeContext,
    toneProfile,
    preserve,
    avoid,
    recommendations,
    authority: {
      finalAuthority: false,
      finalAuthorityOwner: 'Marion',
      mayBypassMarion: false
    },
    safety: {
      debugLeakageBlocked: true,
      toneOverreachBlocked: true,
      finalAnswerBlocked: true
    }
  };
}

function attachToneMetadataToEnvelope(envelope = {}, options = {}) {
  const safeEnvelope = sanitizeObject(envelope);
  const text = sanitizeObject(safeEnvelope.text);
  const language = sanitizeObject(safeEnvelope.language);

  const sourceText =
    sanitizeString(text.sourceText) ||
    sanitizeString(text.normalizedText) ||
    sanitizeString(text.marionInputText);

  const tonePreservation = recommendTonePreservation(
    sourceText,
    {
      sourceLanguage: language.sourceLanguage,
      targetLanguage: language.targetLanguage,
      locale: options.locale || language.targetLanguage
    },
    options
  );

  return {
    ...safeEnvelope,
    tonePreservation
  };
}

module.exports = {
  detectToneSignals,
  classifyTone,
  getToneProfile,
  recommendTonePreservation,
  attachToneMetadataToEnvelope
};

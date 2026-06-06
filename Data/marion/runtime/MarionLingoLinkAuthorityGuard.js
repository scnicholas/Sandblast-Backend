'use strict';

/**
 * MarionLingoLinkAuthorityGuard
 *
 * Validates LingoLink output before Marion allows it into the final response.
 * LingoLink assists. Marion authorizes.
 */

const ACTIONS = Object.freeze({
  ALLOW_FINAL_RESPONSE: 'ALLOW_FINAL_RESPONSE',
  ALLOW_WITH_CAUTION: 'ALLOW_WITH_CAUTION',
  ASK_CLARIFYING_QUESTION: 'ASK_CLARIFYING_QUESTION',
  FALLBACK_TO_MARION_ONLY: 'FALLBACK_TO_MARION_ONLY',
  BLOCK_RESPONSE: 'BLOCK_RESPONSE'
});

function normalizeText(value) {
  return String(value || '').trim();
}

function wordSet(text) {
  return new Set(
    normalizeText(text)
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .split(/\s+/)
      .filter(Boolean)
  );
}

function lexicalOverlap(a, b) {
  const first = wordSet(a);
  const second = wordSet(b);

  if (!first.size || !second.size) return 0;

  let shared = 0;

  for (const token of first) {
    if (second.has(token)) shared += 1;
  }

  return shared / Math.max(first.size, second.size);
}

function hasSevereDrift(originalText, finalText) {
  const original = normalizeText(originalText);
  const final = normalizeText(finalText);

  if (!original || !final) return true;

  const originalLength = original.length;
  const finalLength = final.length;

  if (originalLength < 20) return false;

  const ratio = finalLength / originalLength;

  if (ratio > 4.5 || ratio < 0.12) {
    return true;
  }

  return false;
}

function hasUnsupportedAdditions(responseEnvelope = {}) {
  const warnings = Array.isArray(responseEnvelope.warnings)
    ? responseEnvelope.warnings
    : [];

  return warnings.some((warning) => {
    const value = String(warning || '').toLowerCase();
    return value.includes('unsupported') ||
      value.includes('hallucination') ||
      value.includes('intent drift') ||
      value.includes('unsafe');
  });
}

function getCandidateFinalText(responseEnvelope = {}) {
  return normalizeText(
    responseEnvelope.finalText ||
    responseEnvelope.adaptedText ||
    responseEnvelope.translatedText ||
    responseEnvelope.normalizedText ||
    responseEnvelope.text
  );
}

function reviewLingoLinkOutput(input = {}) {
  const originalText = normalizeText(input.originalText || input.text);
  const route = input.route || 'UNKNOWN_ROUTE';
  const responseEnvelope = input.responseEnvelope || input.lingoLinkResponse || {};
  const confidence = Number(responseEnvelope.confidence || input.confidence || 0);
  const fallbackUsed = Boolean(responseEnvelope.fallbackUsed || input.fallbackUsed);
  const requiresMarionReview = responseEnvelope.requiresMarionReview !== false;
  const finalText = getCandidateFinalText(responseEnvelope);

  const warnings = [];
  let approved = true;
  let action = ACTIONS.ALLOW_FINAL_RESPONSE;
  let authorityConfidence = 0.9;

  if (!requiresMarionReview) {
    warnings.push('LingoLink response did not explicitly require Marion review.');
    authorityConfidence -= 0.1;
  }

  if (!originalText) {
    approved = false;
    action = ACTIONS.FALLBACK_TO_MARION_ONLY;
    authorityConfidence = 0;
    warnings.push('Original text is missing.');
  }

  if (!finalText) {
    approved = false;
    action = ACTIONS.ASK_CLARIFYING_QUESTION;
    authorityConfidence = Math.min(authorityConfidence, 0.25);
    warnings.push('LingoLink did not return usable final text.');
  }

  if (confidence > 0 && confidence < 0.55) {
    approved = false;
    action = ACTIONS.ASK_CLARIFYING_QUESTION;
    authorityConfidence = Math.min(authorityConfidence, 0.35);
    warnings.push('LingoLink confidence is below approval threshold.');
  }

  if (fallbackUsed) {
    action = approved ? ACTIONS.ALLOW_WITH_CAUTION : action;
    authorityConfidence -= 0.12;
    warnings.push('LingoLink fallback was used.');
  }

  if (hasSevereDrift(originalText, finalText)) {
    approved = false;
    action = ACTIONS.FALLBACK_TO_MARION_ONLY;
    authorityConfidence = Math.min(authorityConfidence, 0.3);
    warnings.push('Potential severe output drift detected.');
  }

  if (hasUnsupportedAdditions(responseEnvelope)) {
    approved = false;
    action = ACTIONS.FALLBACK_TO_MARION_ONLY;
    authorityConfidence = Math.min(authorityConfidence, 0.28);
    warnings.push('LingoLink response contains unsupported-addition warnings.');
  }

  const overlap = lexicalOverlap(originalText, finalText);

  if (
    route === 'LINGOLINK_ADAPT' &&
    originalText.length > 40 &&
    finalText.length > 40 &&
    overlap < 0.05
  ) {
    action = approved ? ACTIONS.ALLOW_WITH_CAUTION : action;
    authorityConfidence -= 0.08;
    warnings.push('Low lexical overlap after adaptation; Marion should preserve intent carefully.');
  }

  authorityConfidence = Math.max(0, Math.min(1, Number(authorityConfidence.toFixed(3))));

  return {
    ok: true,
    approved,
    action,
    route,
    reason: warnings.length ? warnings.join(' ') : 'Intent and response structure approved.',
    authorityConfidence,
    marionFinalAuthority: true,
    finalText,
    warnings
  };
}

module.exports = {
  ACTIONS,
  reviewLingoLinkOutput
};

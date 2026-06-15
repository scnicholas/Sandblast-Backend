'use strict';

/**
 * NyxAvatarExpressionController
 * Phase 3B expression metadata bridge.
 *
 * Converts Marion-approved spoken text metadata into a frontend-safe avatar
 * expression state. It does not infer user identity, does not store audio, and
 * does not decide response authority.
 */

const VERSION = 'nyx.avatarExpressionController/1.0-phase3b-metadata-bridge';
const EXPRESSION_CONTRACT = 'nyx.avatar.expression/1.0';

function safeText(value) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
}

function safeObj(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function lower(value) {
  return safeText(value).toLowerCase();
}

function clampNumber(value, fallback, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function pickExpression(text, input) {
  const value = lower(text);
  const src = safeObj(input);
  const hint = lower(src.expressionHint || src.intentHint || src.userIntentHint || src.commandPhrase || '');
  const combined = `${hint} ${value}`.trim();

  if (/\b(error|failed|unavailable|blocked|denied|locked|unauthori[sz]ed|fallback)\b/.test(combined)) return 'steady_recovery';
  if (/\b(raw audio is not being stored|protected voice|admin voice|authorized|safe|safety|secure|locked)\b/.test(combined)) return 'calm_assurance';
  if (/\b(connected through marion|marion remains|final response authority|status)\b/.test(combined)) return 'focused_warm';
  if (/\b(example|explain|how|why|what|walk me through|show me)\b/.test(combined)) return 'attentive_guidance';
  if (/\b(hi|hello|good morning|good afternoon|good evening|welcome)\b/.test(combined)) return 'welcoming_presence';
  return 'focused_warm';
}

function expressionValence(expression) {
  switch (safeText(expression)) {
    case 'steady_recovery': return 'steady';
    case 'calm_assurance': return 'calm';
    case 'attentive_guidance': return 'attentive';
    case 'welcoming_presence': return 'warm';
    case 'focused_warm':
    default: return 'focused';
  }
}

function expressionEnergy(expression, reducedMotion) {
  if (reducedMotion) return 0.28;
  switch (safeText(expression)) {
    case 'welcoming_presence': return 0.62;
    case 'attentive_guidance': return 0.56;
    case 'calm_assurance': return 0.48;
    case 'steady_recovery': return 0.36;
    case 'focused_warm':
    default: return 0.52;
  }
}

function buildNyxAvatarExpression(input) {
  const src = safeObj(input);
  const spokenText = safeText(src.spokenText || src.text || src.reply || '');
  const speakAllowed = src.speakAllowed !== false && !!spokenText;
  const reducedMotion = src.reducedMotion === true;
  const expression = speakAllowed ? pickExpression(spokenText, src) : 'neutral_idle';
  const baseEnergy = expressionEnergy(expression, reducedMotion);
  const intensity = clampNumber(src.intensity, speakAllowed ? baseEnergy : 0.12, 0, reducedMotion ? 0.36 : 0.86);

  return {
    version: VERSION,
    contract: EXPRESSION_CONTRACT,
    source: 'NyxAvatarExpressionController',
    phase: 'phase3b_animation_metadata_bridge',
    enabled: speakAllowed,
    frontendReady: speakAllowed,
    expression,
    expressionState: expression,
    valence: expressionValence(expression),
    energy: baseEnergy,
    intensity,
    confidence: speakAllowed ? 0.82 : 0,
    style: 'subtle_cinematic',
    reducedMotion,
    audioStored: false,
    noRawAudioStored: true,
    transcriptOnly: true
  };
}

module.exports = {
  VERSION,
  EXPRESSION_CONTRACT,
  buildNyxAvatarExpression,
  pickExpression,
  expressionValence,
  expressionEnergy
};

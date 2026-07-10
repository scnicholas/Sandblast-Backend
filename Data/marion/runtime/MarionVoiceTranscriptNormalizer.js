'use strict';

/**
 * MarionVoiceTranscriptNormalizer
 * Compatibility layer added during surgical autopsy package v1.
 * Keeps voice/text parity stable without exposing raw pattern matches.
 */

const VERSION = 'marion.voiceTranscriptNormalizer/1.0-package-v1';

function safeText(value, maxLength) {
  const max = Number.isFinite(Number(maxLength)) ? Math.max(1, Math.min(Number(maxLength), 4000)) : 1200;
  return String(value == null ? '' : value)
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function normalizeTranscriptText(value) {
  let text = safeText(value, 4000);
  // Common speech-recognition cleanup without changing meaning.
  text = text
    .replace(/\bSamblast\b/gi, 'Sandblast')
    .replace(/\bSunblast\b/gi, 'Sandblast')
    .replace(/\bSoundBlast\b/g, 'Sandblast')
    .replace(/\bVero\b/g, 'Vera')
    .replace(/\bMarrion\b/g, 'Marion')
    .replace(/\bLing[o0]\s*Sentinel\b/gi, 'Lingo Sentinel')
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/([,.;:!?])([^\s])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim();
  return text;
}

function classifyQuestionShape(text) {
  const t = safeText(text, 1000).toLowerCase();
  if (!t) return 'empty';
  if (/\?$|\b(what|why|how|when|where|who|can|could|should|would|do|does|did|is|are)\b/.test(t)) return 'question';
  if (/\b(remove|add|fix|create|send|run|deploy|publish|update|change|resend)\b/.test(t)) return 'instruction';
  return 'statement';
}

function applyTranscriptNormalization(envelope, options) {
  const env = envelope && typeof envelope === 'object' ? envelope : {};
  const original = safeText(env.transcript || env.text || env.message || '', 4000);
  const normalized = normalizeTranscriptText(original);
  const questionShape = classifyQuestionShape(normalized);
  const normalization = {
    version: VERSION,
    applied: normalized !== original,
    originalLength: original.length,
    normalizedLength: normalized.length,
    questionShape,
    voiceTextParitySafe: true,
    rawPatternExposure: 'blocked'
  };

  return {
    envelope: Object.assign({}, env, {
      originalTranscript: env.originalTranscript || original,
      transcript: normalized,
      normalizedTranscript: normalized,
      questionShape,
      normalization,
      transcriptOnly: true,
      noRawAudioStored: true,
      audioStored: false
    }),
    normalization
  };
}

module.exports = {
  VERSION,
  applyTranscriptNormalization,
  normalizeTranscriptText,
  classifyQuestionShape
};

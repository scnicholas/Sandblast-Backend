'use strict';

const VERSION = 'marion.voiceTranscriptNormalizer/1.6-layering-safety-cap';
const MAX_NORMALIZED_TRANSCRIPT = 1800;

/**
 * MarionVoiceTranscriptNormalizer
 * Converts messy speech-recognition text into a cleaner Marion-safe transcript.
 */

const FILLER_PATTERNS = [
  /\buh+\b/gi,
  /\bum+\b/gi,
  /\ber+\b/gi,
  /\bah+\b/gi,
  /\byou know\b/gi,
  /\bi mean\b/gi
];

const WAKE_WORD_PATTERNS = [
  /^\s*(vera|nyx|marion|lingosentinel|lingo sentinel)[,\s]+/i
];

const LANGUAGE_ALIAS_MAP = Object.freeze({
  english: 'en',
  en: 'en',
  french: 'fr',
  français: 'fr',
  francais: 'fr',
  fr: 'fr',
  spanish: 'es',
  español: 'es',
  espanol: 'es',
  es: 'es'
});

function collapseRepeatedWords(text) {
  return String(text || '').replace(/\b(\w+)(\s+\1\b)+/gi, '$1');
}

function normalizePunctuation(text) {
  let out = String(text || '');

  out = out.replace(/\s+([,.!?;:])/g, '$1');
  out = out.replace(/([,.!?;:])([^\s])/g, '$1 $2');
  out = out.replace(/\s+/g, ' ').trim();

  if (out && !/[.!?]$/.test(out)) {
    out += '.';
  }

  return out;
}

function stripFillerWords(text) {
  let out = String(text || '');

  FILLER_PATTERNS.forEach((pattern) => {
    out = out.replace(pattern, ' ');
  });

  return out.replace(/\s+/g, ' ').trim();
}

function extractWakeWord(text) {
  const raw = String(text || '').trim();

  for (const pattern of WAKE_WORD_PATTERNS) {
    const match = raw.match(pattern);
    if (match && match[1]) {
      return match[1].toLowerCase();
    }
  }

  return null;
}

function removeWakeWord(text) {
  let out = String(text || '').trim();

  WAKE_WORD_PATTERNS.forEach((pattern) => {
    out = out.replace(pattern, '');
  });

  return out.trim();
}


function detectTargetLanguages(text) {
  const value = String(text || '').toLowerCase();
  const out = [];
  Object.keys(LANGUAGE_ALIAS_MAP).forEach((key) => {
    const rx = new RegExp("\\b" + key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b", "i");
    if (rx.test(value)) out.push(LANGUAGE_ALIAS_MAP[key]);
  });
  return Array.from(new Set(out));
}

function isLingoSentinelContinuityRequest(text) {
  const value = String(text || '').toLowerCase();
  return /\blingo\s*sentinel|lingosentinel\b/i.test(value) &&
    /\b(continuity|conversation|user[-\s]?to[-\s]?user|english|french|spanish|translation|language|handoff|oversight|silent|dialogue)\b/i.test(value);
}

function isPrivateAdminConversationRequest(text) {
  const value = String(text || '').toLowerCase();
  return /\b(private\s+admin|admin\s+conversation|direct\s+marion|marion\s+admin|protected\s+admin)\b/i.test(value);
}


function detectCommandPhrase(text) {
  const value = String(text || '').toLowerCase();

  if (/\b(stop listening|mute voice|voice off)\b/.test(value)) return 'voice_stop';
  if (/\b(start listening|voice on|enable voice)\b/.test(value)) return 'voice_start';
  if (/\b(private admin conversation status|marion admin conversation status|direct marion status|admin conversation route)\b/.test(value)) return 'admin_conversation_status';
  if (/\b(status update|where are we|what is the status|private voice status|voice lane status|protected voice status|protected voice status summary)\b/.test(value)) return 'status';
  if (isLingoSentinelContinuityRequest(value)) return 'lingosentinel_continuity';
  if (/\b(english|french|spanish)\b/.test(value) && /\b(continuity|translation|handoff|conversation|dialogue|language)\b/.test(value)) return 'language_continuity';
  if (/\b(speech sync|speech-sync|avatar sync|mouth sync|viseme|visemes|animation timing)\b/.test(value)) return 'speech_sync_status';
  if (/\bnext step|next steps|move forward\b/.test(value)) return 'next_steps';
  if (/\bcreate|build|generate|draft|write\b/.test(value)) return 'creation';
  if (/\bdelete|remove|deploy|publish|send|execute|run\b/.test(value)) return 'restricted_command';

  return null;
}

function normalizeVoiceTranscript(envelopeOrText, options) {
  const opts = options && typeof options === 'object' ? options : {};
  const originalTranscript = typeof envelopeOrText === 'string'
    ? envelopeOrText
    : String((envelopeOrText && envelopeOrText.transcript) || '');

  const wakeWord = extractWakeWord(originalTranscript);

  let normalized = originalTranscript;
  normalized = removeWakeWord(normalized);

  if (opts.removeFillers !== false) {
    normalized = stripFillerWords(normalized);
  }

  normalized = collapseRepeatedWords(normalized);
  normalized = normalizePunctuation(normalized);

  if (normalized.length > MAX_NORMALIZED_TRANSCRIPT) {
    normalized = normalized.slice(0, MAX_NORMALIZED_TRANSCRIPT).replace(/\s+\S*$/, '').trim();
    if (normalized && !/[.!?]$/.test(normalized)) normalized += '.';
  }

  const commandPhrase = detectCommandPhrase(normalized);

  const result = {
    originalTranscript: originalTranscript.trim(),
    normalizedTranscript: normalized,
    wakeWord,
    commandPhrase,
    targetLanguages: detectTargetLanguages(normalized),
    privateAdminConversationRequested: isPrivateAdminConversationRequest(originalTranscript) || commandPhrase === 'admin_conversation_status',
    lingoSentinelContinuityRequested: isLingoSentinelContinuityRequest(originalTranscript) || commandPhrase === 'lingosentinel_continuity',
    languageContinuityRequested: commandPhrase === 'language_continuity',
    changed: originalTranscript.trim() !== normalized,
    warnings: [],
    boundedTranscript: normalized.length <= MAX_NORMALIZED_TRANSCRIPT,
    maxNormalizedTranscript: MAX_NORMALIZED_TRANSCRIPT
  };

  if (!normalized) result.warnings.push('NORMALIZED_TRANSCRIPT_EMPTY');
  if (originalTranscript.length > MAX_NORMALIZED_TRANSCRIPT) result.warnings.push('TRANSCRIPT_BOUNDED_FOR_DOWNSTREAM_SAFETY');
  if (commandPhrase === 'restricted_command') result.warnings.push('RESTRICTED_COMMAND_PHRASE_DETECTED');

  return result;
}

function applyTranscriptNormalization(envelope, options) {
  const normalized = normalizeVoiceTranscript(envelope, options);

  return {
    envelope: Object.assign({}, envelope, {
      transcript: normalized.normalizedTranscript,
      originalTranscript: normalized.originalTranscript,
      wakeWord: normalized.wakeWord,
      commandPhrase: normalized.commandPhrase,
      targetLanguages: normalized.targetLanguages,
      privateAdminConversationRequested: normalized.privateAdminConversationRequested === true,
      lingoSentinelContinuityRequested: normalized.lingoSentinelContinuityRequested === true,
      languageContinuityRequested: normalized.languageContinuityRequested === true,
      voiceIdentityBoundary: envelope && envelope.voiceIdentityBoundary === true,
      speakerIdentity: envelope && envelope.speakerIdentity || null,
      normalization: normalized
    }),
    normalization: normalized
  };
}

module.exports = {
  VERSION,
  normalizeVoiceTranscript,
  applyTranscriptNormalization,
  stripFillerWords,
  collapseRepeatedWords,
  normalizePunctuation,
  extractWakeWord,
  detectCommandPhrase,
  MAX_NORMALIZED_TRANSCRIPT,
  detectTargetLanguages,
  isLingoSentinelContinuityRequest,
  isPrivateAdminConversationRequest
};

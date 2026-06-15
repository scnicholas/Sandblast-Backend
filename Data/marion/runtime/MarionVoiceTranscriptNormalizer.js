'use strict';

const VERSION = 'marion.voiceTranscriptNormalizer/1.3-phase2-speech-sync-compatible';

/**
 * MarionVoiceTranscriptNormalizer
 * Converts messy speech-recognition text into a cleaner Marion-safe transcript.
 */

const FILLER_PATTERNS = [
  /\buh+\b/gi,
  /\bum+\b/gi,
  /\ber+\b/gi,
  /\bah+\b/gi,
  /\blike\b/gi,
  /\byou know\b/gi,
  /\bi mean\b/gi
];

const WAKE_WORD_PATTERNS = [
  /^\s*(vera|nyx|marion|lingosentinel|lingo sentinel)[,\s]+/i
];

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

function detectCommandPhrase(text) {
  const value = String(text || '').toLowerCase();

  if (/\b(stop listening|mute voice|voice off)\b/.test(value)) return 'voice_stop';
  if (/\b(start listening|voice on|enable voice)\b/.test(value)) return 'voice_start';
  if (/\b(status update|where are we|what is the status|private voice status|voice lane status|protected voice status|protected voice status summary)\b/.test(value)) return 'status';
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

  const commandPhrase = detectCommandPhrase(normalized);

  const result = {
    originalTranscript: originalTranscript.trim(),
    normalizedTranscript: normalized,
    wakeWord,
    commandPhrase,
    changed: originalTranscript.trim() !== normalized,
    warnings: []
  };

  if (!normalized) result.warnings.push('NORMALIZED_TRANSCRIPT_EMPTY');
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
  detectCommandPhrase
};

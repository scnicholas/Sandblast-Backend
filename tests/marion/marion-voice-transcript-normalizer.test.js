'use strict';

const assert = require('assert');

const {
  normalizeVoiceTranscript,
  applyTranscriptNormalization,
  stripFillerWords,
  collapseRepeatedWords,
  normalizePunctuation,
  extractWakeWord,
  detectCommandPhrase
} = require('../../Data/marion/runtime/MarionVoiceTranscriptNormalizer');

function run() {
  assert.strictEqual(stripFillerWords('uh Vera like give me status'), 'Vera give me status');
  assert.strictEqual(collapseRepeatedWords('status status update update'), 'status update');
  assert.strictEqual(normalizePunctuation('give me status'), 'give me status.');
  assert.strictEqual(extractWakeWord('Vera, give me status'), 'vera');
  assert.strictEqual(extractWakeWord('Nyx give me status'), 'nyx');
  assert.strictEqual(extractWakeWord('Give me status'), null);

  assert.strictEqual(detectCommandPhrase('status update.'), 'status');
  assert.strictEqual(detectCommandPhrase('next steps.'), 'next_steps');
  assert.strictEqual(detectCommandPhrase('delete the files.'), 'restricted_command');

  const normalized = normalizeVoiceTranscript('Vera, uh give me a Marion status update status update');

  assert.strictEqual(normalized.wakeWord, 'vera');
  assert.strictEqual(normalized.commandPhrase, 'status');
  assert.strictEqual(normalized.normalizedTranscript, 'give me a Marion status update status update.');
  assert.strictEqual(normalized.changed, true);

  const applied = applyTranscriptNormalization({
    source: 'voice',
    inputChannel: 'voice',
    transcript: 'Vera, uh give me a Marion status update.',
    userIntentHint: 'status'
  });

  assert.strictEqual(applied.envelope.source, 'voice');
  assert.strictEqual(applied.envelope.inputChannel, 'voice');
  assert.strictEqual(applied.envelope.wakeWord, 'vera');
  assert.strictEqual(applied.envelope.commandPhrase, 'status');
  assert.strictEqual(applied.envelope.transcript, 'give me a Marion status update.');
  assert.strictEqual(applied.normalization.originalTranscript, 'Vera, uh give me a Marion status update.');
}

run();

console.log('PASS marion-voice-transcript-normalizer');

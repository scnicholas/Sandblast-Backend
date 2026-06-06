/**
 * Tests: MarionLanguageDetectionGate
 */

'use strict';

const assert = require('assert');
const { createRawInputEnvelope } = require('../../Data/marion/runtime/MarionRawInputEnvelope');
const { validateLanguageDetection } = require('../../Data/marion/runtime/MarionLanguageDetectionGate');

const raw = createRawInputEnvelope('¿Puedes explicarme esto?', { source: 'chat' });

const valid = validateLanguageDetection(raw, {
  language: 'es',
  confidence: 0.94,
  script: 'Latin',
  mixedLanguage: false,
  provider: 'test'
});

assert.strictEqual(valid.detection.detectedLanguage, 'es');
assert.strictEqual(valid.detection.languageName, 'Spanish');
assert.strictEqual(valid.marionGate.mayProceedToIntentPreservation, true);
assert.strictEqual(valid.marionGate.decision, 'proceed');

const low = validateLanguageDetection(raw, {
  language: 'es',
  confidence: 0.42
});

assert.strictEqual(low.marionGate.mayProceedToIntentPreservation, false);
assert.strictEqual(low.marionGate.decision, 'clarify_language');

console.log('PASS marion-language-detection-gate.test.js');

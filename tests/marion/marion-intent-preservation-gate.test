/**
 * Tests: MarionIntentPreservationGate
 */

'use strict';

const assert = require('assert');
const { createRawInputEnvelope } = require('../../Data/marion/runtime/MarionRawInputEnvelope');
const { validateLanguageDetection } = require('../../Data/marion/runtime/MarionLanguageDetectionGate');
const { preserveIntent } = require('../../Data/marion/runtime/MarionIntentPreservationGate');

const raw = createRawInputEnvelope('Give me a step-by-step breakdown of the phases.', { source: 'chat' });
const lang = validateLanguageDetection(raw, { language: 'en', confidence: 0.95 });
const intent = preserveIntent(lang);

assert.strictEqual(intent.intentProfile.intent, 'request_step_breakdown');
assert.strictEqual(intent.intentProfile.originalMeaningLocked, true);
assert.strictEqual(intent.marionGate.mayProceedToTranslationNormalization, true);
assert.strictEqual(intent.marionGate.decision, 'proceed');

console.log('PASS marion-intent-preservation-gate.test.js');

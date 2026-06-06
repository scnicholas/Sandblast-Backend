/**
 * Tests: MarionLingoLinkAuthorityPhaseOneThree
 */

'use strict';

const assert = require('assert');
const {
  initiateMarionLingoLinkAuthority
} = require('../../Data/marion/runtime/MarionLingoLinkAuthorityPhaseOneThree');

const result = initiateMarionLingoLinkAuthority(
  '¿Puedes explicarme esto de forma sencilla?',
  {
    source: 'chat',
    detectorResult: {
      language: 'es',
      confidence: 0.94,
      script: 'Latin',
      mixedLanguage: false,
      provider: 'test'
    }
  }
);

assert.strictEqual(result.completedThroughPhase, 3);
assert.strictEqual(result.rawEnvelope.marionGate.rawInputPreserved, true);
assert.strictEqual(result.languageEnvelope.detection.detectedLanguage, 'es');
assert.strictEqual(result.intentEnvelope.intentProfile.intent, 'request_explanation');
assert.strictEqual(result.intentEnvelope.intentProfile.requestedStyle, 'simple');
assert.strictEqual(result.mayProceedToPhase4, true);

const blocked = initiateMarionLingoLinkAuthority('???', {
  detectorResult: {
    language: 'unknown',
    confidence: 0.1
  }
});

assert.strictEqual(blocked.mayProceedToPhase4, false);
assert.strictEqual(blocked.marionDecision, 'clarify_language');

console.log('PASS marion-lingolink-authority-phases-1-3.test.js');

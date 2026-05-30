'use strict';

const assert = require('assert');

const {
  normalizeSpokenAliases,
  detectAliasHit
} = require('../Data/marion/runtime/spokenAliasNormalizer');

const {
  resolvePhaseAnchor,
  buildPhaseAnchorPrompt
} = require('../Data/marion/runtime/phaseAnchorResolver');

function testSpokenAliasNormalization() {
  const cases = [
    {
      input: 'what are the next steps for language fare',
      expected: 'what are the next steps for LanguageSphere'
    },
    {
      input: 'what are the next steps for language fair',
      expected: 'what are the next steps for LanguageSphere'
    },
    {
      input: 'what are the next steps for language sphere',
      expected: 'what are the next steps for LanguageSphere'
    },
    {
      input: 'open lingo link',
      expected: 'open LingoLink'
    },
    {
      input: 'talk to nix',
      expected: 'talk to Nyx'
    },
    {
      input: 'send this to mary in',
      expected: 'send this to Marion'
    }
  ];

  for (const item of cases) {
    const actual = normalizeSpokenAliases(item.input);
    assert.strictEqual(
      actual,
      item.expected,
      `Alias normalization failed for: ${item.input}`
    );
  }
}

function testAliasHitDetection() {
  const hit = detectAliasHit('what are the next steps for language fare');

  assert.strictEqual(hit.hit, true);
  assert.strictEqual(hit.canonical, 'LanguageSphere');
  assert.strictEqual(hit.alias, 'language fare');
}

function testPhaseAnchorResolutionForMicParity() {
  const cases = [
    {
      input: 'continue with phase 2',
      activeLane: 'mic_to_text_parity',
      expectedPhase: 'phase2',
      expectedLane: 'mic_to_text_parity'
    },
    {
      input: 'continue with phase two',
      activeLane: 'mic to text parity',
      expectedPhase: 'phase2',
      expectedLane: 'mic_to_text_parity'
    },
    {
      input: 'what happens after phase 2',
      activeLane: 'voice parity',
      expectedPhase: 'phase2',
      expectedLane: 'mic_to_text_parity'
    }
  ];

  for (const item of cases) {
    const actual = resolvePhaseAnchor(item.input, {
      activeLane: item.activeLane
    });

    assert.strictEqual(actual.resolved, true);
    assert.strictEqual(actual.phaseKey, item.expectedPhase);
    assert.strictEqual(actual.lane, item.expectedLane);
    assert.ok(
      actual.summary.includes('typed and mic prompts') ||
        actual.summary.includes('paired typed and mic prompts'),
      `Phase 2 summary is not anchored correctly: ${actual.summary}`
    );
  }
}

function testPhaseAnchorPrompt() {
  const prompt = buildPhaseAnchorPrompt('continue with phase 2', {
    activeLane: 'mic_to_text_parity'
  });

  assert.ok(prompt);
  assert.ok(prompt.includes('mic_to_text_parity'));
  assert.ok(prompt.includes('Typed/mic parity regression harness'));
  assert.ok(prompt.includes('Do not ask broad clarification'));
}

function run() {
  testSpokenAliasNormalization();
  testAliasHitDetection();
  testPhaseAnchorResolutionForMicParity();
  testPhaseAnchorPrompt();

  console.log('✅ mic-text-parity-regression.test.js passed');
}

run();

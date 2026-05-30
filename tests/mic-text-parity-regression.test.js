'use strict';

const assert = require('assert');
const path = require('path');

function loadBridge() {
  const candidates = [
    path.join(__dirname, '../Data/marion/runtime/marionBridge.js'),
    path.join(__dirname, '../marionBridge.js'),
    path.join(process.cwd(), 'Data/marion/runtime/marionBridge.js'),
    path.join(process.cwd(), 'marionBridge.js')
  ];

  for (const candidate of candidates) {
    try {
      return require(candidate);
    } catch (_err) {}
  }

  throw new Error('Unable to load Marion Bridge for mic/text parity regression.');
}

const bridge = loadBridge();
const internal = bridge._internal || {};

function normalizeSpokenAliases(input) {
  if (typeof internal.normalizeSpokenProjectAliases === 'function') {
    const result = internal.normalizeSpokenProjectAliases(input);
    return typeof result === 'string' ? result : result.text;
  }
  throw new Error('normalizeSpokenProjectAliases is not exported from Marion Bridge.');
}

function detectAliasHit(input) {
  if (typeof internal.detectSpokenProjectAliasHit === 'function') {
    return internal.detectSpokenProjectAliasHit(input);
  }
  throw new Error('detectSpokenProjectAliasHit is not exported from Marion Bridge.');
}

function resolvePhaseAnchor(input, context) {
  if (typeof internal.resolvePhaseAnchor === 'function') {
    return internal.resolvePhaseAnchor(input, context);
  }
  throw new Error('resolvePhaseAnchor is not exported from Marion Bridge.');
}

function buildPhaseAnchorPrompt(input, context) {
  if (typeof internal.buildPhaseAnchorInstruction === 'function') {
    return internal.buildPhaseAnchorInstruction(input, context);
  }
  throw new Error('buildPhaseAnchorInstruction is not exported from Marion Bridge.');
}

function enforceValidPublicReply(packet, ctx) {
  if (typeof internal.enforceValidPublicReply === 'function') {
    return internal.enforceValidPublicReply(packet, ctx);
  }
  throw new Error('enforceValidPublicReply is not exported from Marion Bridge.');
}

function testSpokenAliasNormalization() {
  const cases = [
    { input: 'what are the next steps for language fare', expected: 'what are the next steps for LanguageSphere' },
    { input: 'what are the next steps for language fair', expected: 'what are the next steps for LanguageSphere' },
    { input: 'what are the next steps for language sphere', expected: 'what are the next steps for LanguageSphere' },
    { input: 'what are the next steps for the language sphere', expected: 'what are the next steps for LanguageSphere' },
    { input: 'what are the next steps for language ca', expected: 'what are the next steps for LanguageSphere' },
    { input: 'what are the next steps for the language ca', expected: 'what are the next steps for LanguageSphere' },
    { input: 'what are the next steps for language c a', expected: 'what are the next steps for LanguageSphere' },
    { input: 'what are the next steps for language see a', expected: 'what are the next steps for LanguageSphere' },
    { input: 'open lingo link', expected: 'open LingoLink' },
    { input: 'talk to nix', expected: 'talk to Nyx' },
    { input: 'send this to mary in', expected: 'send this to Marion' }
  ];

  for (const item of cases) {
    const actual = normalizeSpokenAliases(item.input);
    assert.strictEqual(actual, item.expected, `Alias normalization failed for: ${item.input}`);
  }
}

function testAliasHitDetection() {
  const hit = detectAliasHit('what are the next steps for language ca');
  assert.strictEqual(hit.hit, true);
  assert.strictEqual(hit.canonical, 'LanguageSphere');
  assert.strictEqual(hit.alias, 'language ca');
}

function testPhaseAnchorResolutionForMicParity() {
  const cases = [
    { input: 'continue with phase 2', activeLane: 'mic_to_text_parity', expectedPhase: 'phase2', expectedLane: 'mic_to_text_parity' },
    { input: 'continue with phase two', activeLane: 'mic to text parity', expectedPhase: 'phase2', expectedLane: 'mic_to_text_parity' },
    { input: 'what happens after phase 2', activeLane: 'voice parity', expectedPhase: 'phase2', expectedLane: 'mic_to_text_parity' }
  ];

  for (const item of cases) {
    const actual = resolvePhaseAnchor(item.input, { activeLane: item.activeLane });
    assert.strictEqual(actual.resolved, true);
    assert.strictEqual(actual.phaseKey, item.expectedPhase);
    assert.strictEqual(actual.lane, item.expectedLane);
    assert.ok(
      actual.summary.includes('typed and mic prompts') || actual.summary.includes('paired typed and mic prompts'),
      `Phase 2 summary is not anchored correctly: ${actual.summary}`
    );
  }
}

function testPhaseAnchorPrompt() {
  const prompt = buildPhaseAnchorPrompt('continue with phase 2', { activeLane: 'mic_to_text_parity' });
  assert.ok(prompt);
  assert.ok(prompt.includes('mic_to_text_parity'));
  assert.ok(prompt.includes('Typed/mic parity regression harness'));
  assert.ok(prompt.includes('Do not ask broad clarification'));
}

function testPrimitivePublicReplyRecovery() {
  const recovered = enforceValidPublicReply(
    {
      ok: true,
      final: true,
      marionFinal: true,
      reply: false,
      text: false,
      payload: { reply: false },
      finalEnvelope: { reply: false }
    },
    {
      normalized: {
        userQuery: 'what are the next steps for LanguageSphere',
        rawUserQuery: 'what are the next steps for language ca',
        spokenAliasRecovery: { hits: [{ canonical: 'LanguageSphere', alias: 'language ca' }] }
      }
    }
  );

  assert.strictEqual(recovered.reply.includes('Next for LanguageSphere'), true);
  assert.notStrictEqual(String(recovered.reply).toLowerCase(), 'false');
  assert.strictEqual(recovered.payload.reply, recovered.reply);
  assert.strictEqual(recovered.finalEnvelope.reply, recovered.reply);
  assert.strictEqual(recovered.emit, true);
  assert.strictEqual(recovered.blocked, false);
}

function run() {
  testSpokenAliasNormalization();
  testAliasHitDetection();
  testPhaseAnchorResolutionForMicParity();
  testPhaseAnchorPrompt();
  testPrimitivePublicReplyRecovery();

  console.log('✅ mic-text-parity-regression.test.js passed');
}

run();

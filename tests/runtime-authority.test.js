'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const emotionDir = path.join(root, 'Data/marion/runtime/emotion');
const emotionRuntime = require(path.join(emotionDir, 'emotionRuntime.js'));
const emotionalGovernor = require(path.join(emotionDir, 'emotionalGovernor.js'));
const currentTurn = require(path.join(root, 'Data/marion/runtime/marionCurrentTurnAuthority.js'));
const nyxOpenAI = require(path.join(root, 'Utils/nyxOpenAI.js'));
const marionBridge = require(path.join(root, 'Data/marion/runtime/marionBridge.js'));

function emotionContracts() {
  return {
    baseLabels: {
      primary_emotions: ['anger', 'joy', 'sadness', 'fear', 'surprise', 'disgust', 'neutral'],
      secondary_emotions: ['grief', 'anxiety', 'fatigue', 'unclear', 'informational'],
      blend_axes: ['emotional_loss', 'low_signal_state'],
      suppression_signals: ['low_signal', 'minimization'],
      state_tracking: { rolling_window_size: 3 },
    },
    conversationPatterns: {
      patterns: [{
        pattern_id: 'test_sadness', phrases: ['i feel sad'], emotion_bias: 'sadness',
        nuance_bias: 'grief', weight: 0.8, priority: 'low',
      }],
    },
    analysisSchema: {},
    nuanceMap: {
      neutral: { blend_axes: ['low_signal_state'] },
      sadness: { blend_axes: ['emotional_loss'], care_sequence_defaults: ['observe', 'clarify'], response_style: ['clarity'] },
    },
  };
}

test('emotional governor preserves voice/text parity metadata without throwing', () => {
  const result = emotionalGovernor.governResolvedState({
    emotion: { primary: 'sadness', secondary: 'fatigue', confidence: 0.8, intensity: 0.72 },
    support: { timing_profile: { pacing: 'natural' } },
    marion_handoff: { response_constraints: [] },
  }, {
    inputSource: 'voice', previousInputSource: 'typed', userText: 'I feel exhausted',
    recentReplies: ['I hear you.'],
  });

  assert.equal(result.state_spine_patch.inputSource, 'voice');
  assert.equal(result.state_spine_patch.sourceDrift, true);
  assert.equal(result.runtime_meta.emotional_governor.source_drift, true);
  assert.ok(result.marion_handoff.response_constraints.includes('preserve_same_emotional_depth_across_voice_and_text'));
  assert.equal(result.support.advice_level, 'low');
});

test('emotion runtime resolves a state and retains the governor state patch', () => {
  const result = emotionRuntime.resolveEmotionState('I feel sad', {
    inputSource: 'voice', previousInputSource: 'text', userText: 'I feel sad',
  }, { contracts: emotionContracts() });

  assert.equal(result.ok, true, result.detail);
  assert.equal(result.state.emotion.primary, 'sadness');
  assert.equal(result.state.state_spine_patch.inputSource, 'voice');
  assert.equal(result.state.state_spine_patch.sourceDrift, true);
});

test('bridge passes real text/voice provenance into the emotion governor', () => {
  marionBridge.resolveRuntimeDependencies(true);
  const originalResolve = emotionRuntime.resolveEmotionState;
  let observed;
  emotionRuntime.resolveEmotionState = (text, context) => {
    observed = { text, context };
    return { ok: true, mode: 'resolved_state_only', state: { emotion: { primary: 'neutral' } } };
  };
  try {
    marionBridge._internal.resolveEmotionForTurn({
      userQuery: 'I feel heard',
      sessionId: 'private-session-1',
      turnId: 'voice-turn-2',
      previousMemory: { lastInputSource: 'text' },
      original: { inputChannel: 'voice' },
    });
  } finally {
    emotionRuntime.resolveEmotionState = originalResolve;
  }
  assert.equal(observed.text, 'I feel heard');
  assert.equal(observed.context.inputSource, 'voice');
  assert.equal(observed.context.previousInputSource, 'text');
  assert.equal(observed.context.turnId, 'voice-turn-2');
});

test('bridge applies current-turn correction before the final envelope and refreshes reply signatures', () => {
  const oldReply = 'This is general legal information, not legal advice, with jurisdiction and liability details.';
  const adjusted = marionBridge._internal.applyCurrentTurnAuthorityBeforeFinal({
    ok: true,
    reply: oldReply,
    text: oldReply,
    replySignature: 'stale-signature',
    finalEnvelope: { reply: oldReply, authoritativeReply: oldReply, replySignature: 'stale-signature' },
    payload: { reply: oldReply },
  }, {
    original: {
      privateAdminConversation: true,
      sessionId: 'private-session-2',
      turnId: 'tech-turn-3',
      text: 'Please inspect this JavaScript runtime module.',
    },
  });

  assert.notEqual(adjusted.reply, oldReply);
  assert.match(adjusted.reply, /technical|task|runtime|routing|module|request/i);
  const expected = (() => {
    const value = adjusted.reply.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    let hash = 0;
    for (let i = 0; i < value.length; i += 1) {
      hash = ((hash << 5) - hash) + value.charCodeAt(i);
      hash |= 0;
    }
    return String(hash >>> 0);
  })();
  assert.equal(adjusted.replySignature, expected);
  assert.equal(adjusted.finalEnvelope.replySignature, expected);
});

test('emotion contract cache distinguishes file maps and health does not expose filesystem paths', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'marion-emotion-contracts-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const common = {
    'conversation_patterns.json': { patterns: [] },
    'emotion_analysis_schema.json': {},
    'nuance_map.json': { neutral: { blend_axes: ['low_signal_state'] } },
  };
  for (const [name, value] of Object.entries(common)) fs.writeFileSync(path.join(dir, name), JSON.stringify(value));
  fs.writeFileSync(path.join(dir, 'base-a.json'), JSON.stringify({ primary_emotions: ['neutral'] }));
  fs.writeFileSync(path.join(dir, 'base-b.json'), JSON.stringify({ primary_emotions: ['joy'] }));
  const a = emotionRuntime.loadContracts({ contractDir: dir, files: { baseLabels: 'base-a.json' }, forceReload: true });
  const b = emotionRuntime.loadContracts({ contractDir: dir, files: { baseLabels: 'base-b.json' } });
  assert.deepEqual(a.baseLabels.primary_emotions, ['neutral']);
  assert.deepEqual(b.baseLabels.primary_emotions, ['joy']);

  const health = emotionRuntime.getHealth({ contractDir: path.join(dir, 'missing') });
  assert.equal(health.ok, false);
  assert.match(health.detail, /base_labels\.json:missing/);
  assert.doesNotMatch(health.detail, /\/(?:workspace|tmp)\//);
});

test('Phase A and B nuance fail closed without their envelope validators', () => {
  const input = {
    privateAdminConversation: true,
    turnId: 'turn-a',
    text: 'continue',
    nuanceContext: {
      contract: 'nyx.marion.nuance.phaseA/1.0', phase: 'A', turnId: 'turn-a',
      layer24: { currentState: 'correction', controlFlags: { correctionOverride: true } },
    },
    nuanceCurrentTurnVerified: true,
    nuanceCorrectionOverride: true,
  };

  assert.equal(currentTurn.validateNuanceForCurrentTurn(input).ok, false);
  assert.equal(currentTurn.validateNuanceForCurrentTurn(input).verifierReady, false);
  const prepared = currentTurn.prepareInput(input);
  assert.equal(prepared.nuanceCurrentTurnVerified, undefined);
  assert.equal(prepared.nuanceCorrectionOverride, undefined);
  assert.equal(prepared.currentTurnNuanceOverride, undefined);
  assert.equal(prepared.staleNuanceRejected, true);

  const phaseB = {
    privateAdminConversation: true,
    turnId: 'turn-b',
    phaseBNuance: { contract: 'nyx.marion.nuance.phaseB/1.0', phase: 'B', turnId: 'turn-b' },
  };
  assert.equal(currentTurn.validatePhaseBNuanceForCurrentTurn(phaseB).ok, false);
  assert.equal(currentTurn.validatePhaseBNuanceForCurrentTurn(phaseB).verifierReady, false);
});

test('public requests remain outside private Phase B nuance projection', () => {
  const input = {
    publicSurfaceOnly: true,
    text: 'hello',
    phaseBNuance: { contract: 'nyx.marion.nuance.phaseB/1.0', phase: 'B', turnId: 'public-turn' },
    phaseBCorrectionOverride: true,
  };
  assert.strictEqual(currentTurn.prepareInput(input), input);
});

test('Neon AI Gateway adapter refuses private-boundary requests before network access', async (t) => {
  const oldToken = process.env.NEON_AI_GATEWAY_TOKEN;
  const oldBase = process.env.NEON_AI_GATEWAY_BASE_URL;
  process.env.NEON_AI_GATEWAY_TOKEN = 'test-token';
  process.env.NEON_AI_GATEWAY_BASE_URL = 'https://example.neon.tech';
  let fetchCalls = 0;
  const oldFetch = global.fetch;
  global.fetch = async () => { fetchCalls += 1; throw new Error('unexpected network call'); };
  t.after(() => {
    global.fetch = oldFetch;
    if (oldToken === undefined) delete process.env.NEON_AI_GATEWAY_TOKEN;
    else process.env.NEON_AI_GATEWAY_TOKEN = oldToken;
    if (oldBase === undefined) delete process.env.NEON_AI_GATEWAY_BASE_URL;
    else process.env.NEON_AI_GATEWAY_BASE_URL = oldBase;
  });

  const result = await nyxOpenAI.generateNyxReply({
    domain: 'general', intent: 'question', baseMessage: 'Prepared answer.',
    boundaryContext: { role: 'owner', scope: 'private_admin', publicSurfaceOnly: false, authenticatedOperator: true },
  });
  assert.equal(result, null);
  assert.equal(fetchCalls, 0);
});

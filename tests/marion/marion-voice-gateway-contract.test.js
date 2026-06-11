'use strict';

const assert = require('assert');

const {
  handleVoiceTranscript,
  makeNyxBoundaryResponse
} = require('../../Data/marion/runtime/MarionVoiceGateway');

async function run() {
  const bridge = {
    handleMessage(payload, context) {
      assert.strictEqual(payload.inputChannel, 'voice');
      assert.strictEqual(payload.source, 'voice');
      assert.strictEqual(payload.publicAgent, 'Nyx');
      assert.strictEqual(payload.authority, 'Marion');
      assert.strictEqual(context.inputChannel, 'voice');
      assert.strictEqual(context.publicAgent, 'Nyx');
      assert.strictEqual(context.authority, 'Marion');

      return {
        ok: true,
        reply: 'Voice lane contract passed through Marion authority.'
      };
    }
  };

  const result = await handleVoiceTranscript({
    transcript: 'Vera, give me a Marion status update.',
    confidence: 0.93,
    locale: 'en-CA',
    speakerHint: 'Mac',
    provider: 'browser-native',
    sessionId: 'voice-contract-session',
    requestId: 'voice-contract-request'
  }, { bridge });

  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.publicAgent, 'Nyx');
  assert.strictEqual(result.authority, 'Marion');
  assert.strictEqual(result.inputChannel, 'voice');
  assert.strictEqual(result.source, 'voice');
  assert.strictEqual(result.voiceEnvelope.audioStored, false);
  assert.strictEqual(result.voiceEnvelope.authorizationState, 'authorized');
  assert.strictEqual(result.voice.speakAllowed, true);
  assert.strictEqual(result.voice.spokenText, 'Voice lane contract passed through Marion authority.');
  assert.ok(Array.isArray(result.telemetry));
  assert.ok(result.telemetry.length >= 4);

  const blocked = await handleVoiceTranscript({
    transcript: 'Delete the deployment files and publish now.',
    confidence: 0.91,
    locale: 'en-CA',
    speakerHint: '',
    provider: 'browser-native'
  }, { bridge });

  assert.strictEqual(blocked.ok, false);
  assert.strictEqual(blocked.publicAgent, 'Nyx');
  assert.strictEqual(blocked.authority, 'Marion');
  assert.strictEqual(blocked.voiceEnvelope.authorizationState, 'blocked');
  assert.ok(/needs authorization/i.test(blocked.reply));

  const boundary = makeNyxBoundaryResponse(
    { ok: true, reply: 'Boundary preserved.' },
    {
      source: 'voice',
      inputChannel: 'voice',
      locale: 'en-CA',
      confidence: 0.9,
      authorizationState: 'authorized',
      userIntentHint: 'status',
      rawMeta: { audioStored: false }
    },
    [],
    { speakAllowed: true, voiceMode: 'full', spokenText: 'Boundary preserved.' }
  );

  assert.strictEqual(boundary.publicAgent, 'Nyx');
  assert.strictEqual(boundary.authority, 'Marion');
  assert.strictEqual(boundary.voiceEnvelope.audioStored, false);
}

run()
  .then(() => console.log('PASS marion-voice-gateway-contract'))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });

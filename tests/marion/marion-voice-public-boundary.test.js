'use strict';

const assert = require('assert');

const {
  handleVoiceTranscript
} = require('../../Data/marion/runtime/MarionVoiceGateway');

function publicTextOf(value) {
  return [
    value.reply,
    value.text,
    value.message,
    value.displayReply,
    value.voice && value.voice.spokenText
  ].filter(Boolean).join(' ');
}

async function run() {
  const bridge = {
    handleMessage() {
      return {
        ok: true,
        reply: 'Nyx voice response is public-facing and safe.'
      };
    }
  };

  const result = await handleVoiceTranscript({
    transcript: 'Vera, give me a Marion status update.',
    confidence: 0.93,
    locale: 'en-CA',
    speakerHint: 'Mac',
    provider: 'browser-native'
  }, { bridge });

  assert.strictEqual(result.publicAgent, 'Nyx');
  assert.strictEqual(result.authority, 'Marion');
  assert.strictEqual(result.inputChannel, 'voice');
  assert.strictEqual(result.source, 'voice');
  assert.strictEqual(result.voiceEnvelope.audioStored, false);
  assert.strictEqual(result.voiceEnvelope.authorizationState, 'authorized');

  const publicText = publicTextOf(result);

  assert.ok(publicText.includes('Nyx voice response'));
  assert.ok(!/raw audio stored/i.test(publicText));
  assert.ok(!/api[_-]?key|secret|password|token/i.test(publicText));
  assert.ok(!/stack trace|typeerror|referenceerror|syntaxerror/i.test(publicText));
  assert.ok(!/MARION::FINAL::/i.test(publicText));
  assert.ok(!/runtimeTelemetry|failureSignature|finalEnvelopeTrusted/i.test(publicText));

  const unknownRestricted = await handleVoiceTranscript({
    transcript: 'Vera, delete the deployment files and publish now.',
    confidence: 0.91,
    locale: 'en-CA',
    speakerHint: '',
    provider: 'browser-native'
  }, { bridge });

  assert.strictEqual(unknownRestricted.ok, false);
  assert.strictEqual(unknownRestricted.publicAgent, 'Nyx');
  assert.strictEqual(unknownRestricted.authority, 'Marion');
  assert.strictEqual(unknownRestricted.voiceEnvelope.authorizationState, 'blocked');
  assert.ok(/needs authorization/i.test(publicTextOf(unknownRestricted)));
}

run()
  .then(() => console.log('PASS marion-voice-public-boundary'))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });

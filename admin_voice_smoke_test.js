
const assert = require('assert');
const Gate = require('./Data/marion/runtime/MarionVoiceAuthorizationGate');
const Policy = require('./Data/marion/runtime/MarionVoiceOutputPolicy');
const Gateway = require('./Data/marion/runtime/MarionVoiceGateway');
const Envelope = require('./Data/marion/runtime/MarionVoiceInputEnvelope');

let env = Envelope.createVoiceInputEnvelope({transcript:'status update', speakerHint:'Mac'});
let unauth = Gate.evaluateVoiceAuthorization(env, {});
assert.strictEqual(unauth.allowed, false);
assert.strictEqual(unauth.adminVoiceDeliveryAllowed, false);

let auth = Gate.evaluateVoiceAuthorization(env, {adminVoiceVerified:true, trustSpeakerHint:true});
assert.strictEqual(auth.allowed, true);
assert.strictEqual(auth.adminVoiceDeliveryAllowed, true);

let noSpeak = Policy.evaluateVoiceOutputPolicy({reply:'Hello'}, {});
assert.strictEqual(noSpeak.speakAllowed, false);

let canSpeak = Policy.evaluateVoiceOutputPolicy({reply:'Hello'}, {adminVoiceVerified:true});
assert.strictEqual(canSpeak.speakAllowed, true);

(async () => {
  let blocked = await Gateway.handleVoiceTranscript({transcript:'hello', speakerHint:'Mac'}, {bridge:{handle:()=>({reply:'Should not call'})}});
  assert.strictEqual(blocked.voice.speakAllowed, false);
  assert.strictEqual(blocked.voiceEnvelope.adminVoiceDeliveryAllowed, false);

  let ok = await Gateway.handleVoiceTranscript({transcript:'hello', adminVoiceVerified:true, speakerHint:'Mac'}, {
    authorization:{adminVoiceVerified:true, trustSpeakerHint:true},
    output:{adminVoiceVerified:true},
    bridge:{handle:()=>({reply:'Admin voice reply.'})}
  });
  assert.strictEqual(ok.ok, true);
  assert.strictEqual(ok.voice.speakAllowed, true);
  assert.strictEqual(ok.voice.spokenText, 'Admin voice reply.');
  console.log('admin voice smoke passed');
})().catch(err => { console.error(err); process.exit(1); });

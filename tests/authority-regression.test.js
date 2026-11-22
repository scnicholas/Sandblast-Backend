'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const root = path.resolve(__dirname, '../Data/marion/runtime');
const challenge = require(path.join(root,'MarionVoiceChallengeVerifier.js'));
const identity = require(path.join(root,'MarionVoiceSpeakerIdentity.js'));
const final = require(path.join(root,'marionFinalEnvelope.js'));
const owner = {role:'owner',sessionId:'test-session',sessionVerified:true,adminVerified:true};
const principal = { verified:true,sessionVerified:true,verifiedBy:'server_middleware', role:'owner',sessionId:'test-session' };
const opts = {serverVerifiedAuth:principal,adminVoiceVerified:true};

test('a transcript alone cannot prove liveness; a different challenge attestation cannot either',()=>{
  challenge.clearChallengesForTests();
  const issued=challenge.issueChallenge({speakerId:'speaker-one'},owner);
  assert.equal(issued.ok,true);
  const checked=challenge.checkChallenge({speakerId:'speaker-one',challengeId:issued.challenge.challengeId,response:issued.expectedResponse},owner);
  assert.equal(checked.challengeResponseVerified,true);
  assert.equal(checked.liveChallengeVerified,false);
  assert.equal(challenge.verifyChallengeProof(checked.challengeProof,owner).liveChallengeVerified,false);
  const counterfeit={...owner,speechCaptureAttestation:{verified:true,verifiedBy:'server_middleware',source:'trusted_voice_capture',challengeId:'wrong-challenge',sessionId:'test-session',speakerId:'speaker-one',attestationId:'attest'}};
  assert.equal(challenge.verifyChallengeProof(checked.challengeProof,counterfeit).liveChallengeVerified,false);
  const attested={...counterfeit,speechCaptureAttestation:{...counterfeit.speechCaptureAttestation,challengeId:issued.challenge.challengeId}};
  const verified=challenge.verifyChallengeProof(checked.challengeProof,attested,{consume:true});
  assert.equal(verified.liveChallengeVerified,true);
  assert.equal(challenge.verifyChallengeProof(checked.challengeProof,attested,{consume:true}).ok,false);
});

test('identity never trusts a forged result object',()=>{
  assert.equal(identity.isVoiceSpeakerIdentityTrusted({adminVerified:true,sessionVerified:true,challengeBlocked:false,speakerRegistryBlocked:false,roleBinding:'owner'}),false);
  const denied=identity.resolveVoiceSpeakerIdentity({speakerHint:'boss',voiceMatchStatus:'weak_match'},opts);
  assert.equal(denied.roleBinding,'blocked');
  assert.equal(denied.speakerHintTrusted,false);
  assert.equal(identity.isVoiceSpeakerIdentityTrusted(denied),false);
});

test('client claims without server principal do not confer identity authority',()=>{
  const value=identity.resolveVoiceSpeakerIdentity({adminVerified:true,role:'owner',speakerId:'speaker-one'},{adminVoiceVerified:true});
  assert.equal(value.adminVerified,false);
  assert.equal(value.roleBinding,'blocked');
});

test('envelope sanitizer does not retain sensitive nested keys or prototype pollution keys',()=>{
  const original=JSON.parse('{"__proto__":{"polluted":true},"sessionToken":"sensitive","nested":{"apiKey":"secret","safe":"ok"}}');
  const out=identity.applyVoiceSpeakerIdentityEnvelope(original,{});
  assert.equal(Object.hasOwn(out,'__proto__'),false);
  assert.equal(out.sessionToken,undefined);
  assert.equal(out.nested.apiKey,undefined);
  assert.equal(out.nested.safe,'ok');
  assert.equal({}.polluted,undefined);
});

test('explicit upstream refusal cannot be turned into a final reply',()=>{
  const sample={reply:'The current Marion response is authorized and complete.',ok:false,canEmit:false,requiresRetry:true,finalEnvelopeTrusted:false};
  for(const name of ['createMarionFinalEnvelope','buildResponse','createResponse','finalizeTurn','attachVisibleReplyAliases','safeResponse']){
    const v=final[name](structuredClone(sample));
    assert.equal(v.final,false,name);
    assert.equal(v.canEmit,false,name);
    assert.equal(v.reply,'',name);
  }
});

test('corrupt final envelope cannot be elevated from an explicit incomplete result',()=>{
  const out=final.createMarionFinalEnvelope({reply:'The current Marion response is authorized and complete.',finalEnvelope:{completionStatus:{complete:false}}});
  assert.equal(out.final,false);
  assert.equal(out.canEmit,false);
});

test('a normal substantive final still completes (compatibility)',async()=>{
  const reply='I can help explain the next steps in the process.';
  const out=await final.createMarionFinalEnvelope({reply});
  assert.equal(out.ok,true);
  assert.equal(out.final,true);
  assert.equal(out.reply,reply);
});

test('genuine identity evidence can still be accepted without a challenge requirement',()=>{
  const value=identity.resolveVoiceSpeakerIdentity({voiceMatchStatus:'unknown'},opts);
  assert.equal(value.roleBinding,'owner');
  assert.equal(identity.isVoiceSpeakerIdentityTrusted(value),true);
});

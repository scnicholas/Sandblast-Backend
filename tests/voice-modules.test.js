'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const runtime = path.join(root, 'Data/marion/runtime');
const inputEnvelope = require(path.join(runtime, 'MarionVoiceInputEnvelope.js'));
const normalizer = require(path.join(runtime, 'MarionVoiceTranscriptNormalizer.js'));
const outputPolicy = require(path.join(runtime, 'MarionVoiceOutputPolicy.js'));
const telemetry = require(path.join(runtime, 'MarionVoiceTelemetry.js'));
const speakerRegistry = require(path.join(runtime, 'MarionVoiceSpeakerRegistry.js'));
const challengeVerifier = require(path.join(runtime, 'MarionVoiceChallengeVerifier.js'));
const continuityWindow = require(path.join(runtime, 'MarionVoiceContinuityWindow.js'));
const speakerIdentity = require(path.join(runtime, 'MarionVoiceSpeakerIdentity.js'));
const parityHardlock = require(path.join(runtime, 'voiceTextParityIdentityDriftHardlock.js'));
const gatewayPath = path.join(runtime, 'MarionVoiceGateway.js');

function replyHash(value) {
  const source = String(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  let hash = 0;
  for (let i = 0; i < source.length; i += 1) {
    hash = ((hash << 5) - hash) + source.charCodeAt(i);
    hash |= 0;
  }
  return String(hash >>> 0);
}

function signedVoiceFinal(reply) {
  const aliases = {
    authoritativeReply: reply,
    reply,
    text: reply,
    message: reply,
    displayReply: reply,
    visibleReply: reply,
    finalReply: reply,
    answer: reply,
    output: reply,
    response: reply,
    spokenText: reply
  };
  const signature = replyHash(reply);
  const finalEnvelope = {
    ...aliases,
    final: true,
    marionFinal: true,
    canEmit: true,
    currentTurnBound: true,
    semanticAuthority: 'marion',
    signature: 'MARION_FINAL_AUTHORITY',
    replySignature: signature
  };
  return {
    ...aliases,
    ok: true,
    final: true,
    marionFinal: true,
    canEmit: true,
    currentTurnBound: true,
    semanticAuthority: 'marion',
    replySignature: signature,
    payload: { ...aliases, final: true, marionFinal: true, canEmit: true },
    finalEnvelope
  };
}

function loadGateWithIdentity(identityResolver) {
  const gatePath = path.join(runtime, 'MarionVoiceAuthorizationGate.js');
  delete require.cache[gatePath];
  const originalLoad = Module._load;
  Module._load = function (request, parent, isMain) {
    if (parent && parent.filename === gatePath && request === './MarionVoiceSpeakerIdentity') {
      return { resolveVoiceSpeakerIdentity: identityResolver };
    }
    if (parent && parent.filename === gatePath && request === './voiceTextParityIdentityDriftHardlock.js') return null;
    return originalLoad.call(this, request, parent, isMain);
  };
  try { return require(gatePath); }
  finally {
    Module._load = originalLoad;
    delete require.cache[gatePath];
  }
}

function loadGatewayWithSecurityModules() {
  delete require.cache[gatewayPath];
  const gatePath = path.join(runtime, 'MarionVoiceAuthorizationGate.js');
  delete require.cache[gatePath];
  const originalLoad = Module._load;
  const identity = {
    resolveVoiceSpeakerIdentity(envelope) {
      return {
        version: 'test.identity/1',
        voiceIdentityBoundary: true,
        identityIsAuthority: false,
        authorityStillRequiresRBAC: true,
        roleBinding: 'owner',
        speakerRegistryAvailable: true,
        speakerRegistryMatched: true,
        speakerRegistryStatus: 'matched',
        speakerRegistryBlocked: false,
        speakerConfidence: 1,
        speakerHintTrusted: true,
        voiceprintStored: false,
        liveChallengeRequired: true,
        liveChallengeVerified: true,
        challengeStatus: 'verified',
        challengeBlocked: false,
        continuityWindowRequired: true,
        continuityWindowVerified: true,
        trustedVoiceWindowActive: true,
        continuityStatus: 'active',
        continuityBlocked: false,
        rawAudioStored: false,
        audioStored: false,
        transcriptOnly: true,
        claimedSpeaker: envelope && envelope.speakerHint || ''
      };
    },
    applyVoiceSpeakerIdentityEnvelope(envelope, options) {
      const speakerIdentity = this.resolveVoiceSpeakerIdentity(envelope, options);
      return Object.assign({}, envelope, { speakerIdentity, voiceIdentity: speakerIdentity });
    }
  };
  const parity = { projectResult: (value) => value, projectAuthorizationResult: (value) => value, compareVoiceTextParity: () => ({ ok: true }) };
  const challenge = { checkChallenge: () => ({ ok: true }), issueChallenge: () => ({ ok: true }), revokeChallenge: () => ({ ok: true }) };
  const continuity = { checkContinuityWindow: () => ({ ok: true }), openContinuityWindow: () => ({ ok: true }), revokeContinuityWindow: () => ({ ok: true }) };
  Module._load = function (request, parent, isMain) {
    if (parent && [gatewayPath, gatePath].includes(parent.filename)) {
      if (request === './MarionVoiceSpeakerIdentity') return identity;
      if (request === './MarionVoiceChallengeVerifier') return challenge;
      if (request === './MarionVoiceContinuityWindow') return continuity;
      if (request === './voiceTextParityIdentityDriftHardlock.js') return parity;
    }
    return originalLoad.call(this, request, parent, isMain);
  };
  try { return require(gatewayPath); }
  finally { Module._load = originalLoad; }
}

test('input envelope keeps only bounded transcript and allowlisted metadata', () => {
  let getterRead = false;
  const input = {
    transcript: '  Nyx, please summarize this.  ',
    rawMeta: {
      provider: 'browser-native',
      token: 'secret-token-value',
      privatePrompt: 'owner-only text',
      audio: Buffer.from('raw audio')
    }
  };
  Object.defineProperty(input, 'adminVoiceVerified', { enumerable: true, get() { getterRead = true; return true; } });
  const envelope = inputEnvelope.createVoiceInputEnvelope(input);
  assert.equal(envelope.transcript, 'Nyx, please summarize this.');
  assert.equal(envelope.adminVoiceVerified, false);
  assert.equal(getterRead, false);
  assert.deepEqual({ ...envelope.rawMeta }, { provider: 'browser-native' });
  assert.equal(envelope.audioStored, false);
  assert.equal(envelope.rawAudioStored, false);
  assert.equal(inputEnvelope.createVoiceInputEnvelope({ transcript: 'x'.repeat(10000) }).transcript.length, 4000);
});

test('delivery permission alone cannot authenticate a speaker', () => {
  const gate = loadGateWithIdentity(() => ({
    voiceIdentityBoundary: true,
    identityIsAuthority: false,
    authorityStillRequiresRBAC: true,
    roleBinding: 'blocked',
    speakerRegistryAvailable: false,
    speakerRegistryMatched: false,
    speakerRegistryBlocked: false,
    voiceprintStored: false,
    transcriptOnly: true
  }));
  const result = gate.evaluateVoiceAuthorization({
    transcript: 'status update',
    userIntentHint: 'conversation',
    adminVoiceVerified: true,
    adminVoiceDeliveryAllowed: true
  }, { adminVoiceDeliveryAllowed: true });
  assert.equal(result.allowed, false);
  assert.equal(result.adminVoiceDeliveryAllowed, false);
});

test('failed or required-but-unverified live challenge blocks otherwise valid admin proof', () => {
  const gate = loadGateWithIdentity((envelope) => envelope.testIdentity);
  for (const testIdentity of [
    { challengeBlocked: true, liveChallengeRequired: true, liveChallengeVerified: false, challengeStatus: 'blocked' },
    { challengeBlocked: false, liveChallengeRequired: true, liveChallengeVerified: false, challengeStatus: 'pending' },
    { challengeBlocked: false, liveChallengeRequired: true, liveChallengeVerified: true, challengeStatus: 'verified', continuityWindowRequired: true, continuityWindowVerified: false, continuityStatus: 'expired' }
  ]) {
    const result = gate.evaluateVoiceAuthorization({
      transcript: 'hello',
      userIntentHint: 'conversation',
      testIdentity
    }, { adminVoiceVerified: true, trustedServerAuth: true });
    assert.equal(result.allowed, false);
    assert.match(result.reason, /^VOICE_(CHALLENGE|CONTINUITY)_/);
  }
});

test('output policy requires a Marion final tuple and explicit capability-specific permission', () => {
  const response = signedVoiceFinal('The verified answer is ready.');
  const genericTrust = outputPolicy.applyVoiceOutputPolicy(response, { trustedVoiceDeliveryAllowed: true });
  assert.equal(genericTrust.voice.speakAllowed, false);
  assert.equal(genericTrust.voice.spokenText, '');

  const approved = outputPolicy.applyVoiceOutputPolicy(response, {
    adminVoiceVerified: true,
    adminVoiceDeliveryAllowed: true,
    directMarionAdminInterface: true
  });
  assert.equal(approved.voice.speakAllowed, true);
  assert.equal(approved.voice.spokenText, 'The verified answer is ready.');

  const unsigned = outputPolicy.applyVoiceOutputPolicy({ ok: true, reply: 'unverified text' }, {
    adminVoiceVerified: true,
    adminVoiceDeliveryAllowed: true
  });
  assert.equal(unsigned.voice.speakAllowed, false);
  assert.equal(unsigned.voice.spokenText, '');
});

test('telemetry drops transcript, reply, speaker identity, and arbitrary nested strings', () => {
  const event = telemetry.createVoiceTelemetryEvent('voice.output.policy.checked', {
    transcript: 'private utterance must not escape',
    originalTranscript: 'same private utterance',
    sessionId: 'private-session-id',
    requestId: 'request-id-123',
    userIntentHint: 'conversation'
  }, {
    spokenText: 'private Marion reply',
    transcript: 'private utterance must not escape',
    nested: { prompt: 'private prompt', harmless: 'still arbitrary free text' },
    error: 'BRIDGE_FAILED',
    transcriptLength: 34,
    speechSyncEnabled: true
  });
  const serialized = JSON.stringify(event);
  for (const privateText of ['private utterance must not escape', 'same private utterance', 'private Marion reply', 'private prompt', 'private-session-id', 'request-id-123']) {
    assert.equal(serialized.includes(privateText), false);
  }
  assert.equal(event.sessionPresent, true);
  assert.equal(event.requestPresent, true);
  assert.equal(event.detail.error, 'BRIDGE_FAILED');
  assert.equal(event.detail.transcriptLength, 34);
  assert.equal(event.detail.speechSyncEnabled, true);
});

test('voice gateway refuses to speak an unsigned bridge reply', async () => {
  const gateway = loadGatewayWithSecurityModules();
  const result = await gateway.handleVoiceTranscript({ transcript: 'please summarize the current status' }, {
    adminVoiceVerified: true,
    adminVoiceDeliveryAllowed: true,
    trustedServerAuth: true,
    directMarionAdminInterface: true,
    adminInterfaceScope: 'marion_admin_conversation',
    bridge: { async handleVoiceTranscript() { return { ok: true, reply: 'unverified bridge text' }; } }
  });
  assert.equal(result.ok, false);
  assert.equal(result.final, false);
  assert.equal(result.canEmit, false);
  assert.equal(result.error, 'MARION_FINAL_AUTHORITY_REQUIRED');
  assert.equal(result.voice.speakAllowed, false);
  assert.equal(result.voice.spokenText, '');
});

test('voice gateway permits speech only after a signed current-turn Marion final', async () => {
  const gateway = loadGatewayWithSecurityModules();
  const reply = 'This signed Marion answer is cleared for the private voice lane.';
  const result = await gateway.handleVoiceTranscript({ transcript: 'please summarize the current status' }, {
    adminVoiceVerified: true,
    adminVoiceDeliveryAllowed: true,
    trustedServerAuth: true,
    directMarionAdminInterface: true,
    adminInterfaceScope: 'marion_admin_conversation',
    bridge: { async handleVoiceTranscript() { return signedVoiceFinal(reply); } }
  });
  assert.equal(result.ok, true);
  assert.equal(result.voice.speakAllowed, true);
  assert.equal(result.voice.spokenText, reply);
});

test('direct voice gateway calls fail closed when authority dependencies are missing', async () => {
  delete require.cache[gatewayPath];
  const originalLoad = Module._load;
  Module._load = function (request, parent, isMain) {
    if (parent && parent.filename === gatewayPath && request === './MarionVoiceSpeakerIdentity') return null;
    return originalLoad.call(this, request, parent, isMain);
  };
  let gateway;
  try { gateway = require(gatewayPath); }
  finally { Module._load = originalLoad; }
  assert.equal(gateway.voiceAuthorityDependenciesReady(), false);
  let bridgeCalls = 0;
  const result = await gateway.handleVoiceTranscript({ transcript: 'hello' }, {
    adminVoiceVerified: true,
    adminVoiceDeliveryAllowed: true,
    trustedServerAuth: true,
    bridge: { async handleVoiceTranscript() { bridgeCalls += 1; return signedVoiceFinal('reply'); } }
  });
  assert.equal(bridgeCalls, 0);
  assert.equal(result.error, 'MARION_VOICE_AUTHORITY_RUNTIME_NOT_READY');
  assert.equal(result.voice.speakAllowed, false);
  assert.equal(result.voice.spokenText, '');
  delete require.cache[gatewayPath];
});

test('normalizer bounds direct calls and preserves restricted action labels', () => {
  const result = normalizer.normalizeVoiceTranscript({ transcript: `Marion, delete the file. ${'word '.repeat(1200)}` });
  assert.ok(result.originalTranscript.length <= normalizer.MAX_INPUT_TRANSCRIPT);
  assert.ok(result.normalizedTranscript.length <= normalizer.MAX_NORMALIZED_TRANSCRIPT);
  assert.equal(result.commandPhrase, 'restricted_command');
});

test('HTTP voice route fails closed until identity, challenge, continuity, and parity modules exist', () => {
  const indexSource = fs.readFileSync(path.join(root, 'index.js'), 'utf8');
  const routeStart = indexSource.indexOf('app.post(NYX_VOICE_TRANSCRIPT_ROUTES');
  const readinessGate = indexSource.indexOf('if (!voiceAuthorityRuntime.every((item) => item.exists))', routeStart);
  assert.ok(indexSource.includes('Data/marion/runtime/MarionVoiceChallengeVerifier.js'));
  assert.ok(indexSource.includes('Data/marion/runtime/MarionVoiceContinuityWindow.js'));
  assert.ok(indexSource.includes('Data/marion/runtime/voiceTextParityIdentityDriftHardlock.js'));
  assert.ok(routeStart >= 0 && readinessGate > routeStart);
});

test('speaker registry requires a verified owner session and skips accessor metadata', () => {
  speakerRegistry.clearRegistryForTests();
  assert.equal(speakerRegistry.requestEnrollment({ speakerId: 'speaker-1' }, { role: 'owner' }).ok, false);
  let invoked = false;
  const metadata = {};
  Object.defineProperty(metadata, 'private', { enumerable: true, get() { invoked = true; return 'secret'; } });
  assert.deepEqual(speakerRegistry.sanitizeMetadata(metadata), {});
  assert.equal(invoked, false);
  const owner = { role: 'owner', adminVerified: true, sessionVerified: true, sessionId: 'session-1' };
  const request = speakerRegistry.requestEnrollment({ speakerId: 'speaker-1', roleBinding: 'owner' }, owner);
  assert.equal(request.ok, true);
  assert.equal(speakerRegistry.approveEnrollment({ requestId: request.request.requestId }, { ...owner, adminVerified: false }).ok, false);
  assert.equal(speakerRegistry.approveEnrollment({ requestId: request.request.requestId }, owner).ok, true);
});

test('challenge response proof is session-bound and cannot claim voice liveness without capture attestation', () => {
  challengeVerifier.clearChallengesForTests();
  const owner = { role: 'owner', adminVerified: true, sessionVerified: true, sessionId: 'session-1' };
  const issued = challengeVerifier.issueChallenge({ speakerId: 'speaker-1' }, owner);
  assert.equal(issued.ok, true);
  const checked = challengeVerifier.checkChallenge({ challengeId: issued.challenge.challengeId, speakerId: 'speaker-1', challengeResponse: issued.expectedResponse }, owner);
  assert.equal(checked.challengeResponseVerified, true);
  assert.equal(checked.liveChallengeVerified, false);
  assert.ok(checked.challengeProof);
  const evidence = challengeVerifier.evaluateChallengeEvidence({ liveChallengeRequired: true, speakerId: 'speaker-1', challengeProof: checked.challengeProof }, owner);
  assert.equal(evidence.challengeResponseVerified, true);
  assert.equal(evidence.liveChallengeVerified, false);
  assert.equal(challengeVerifier.verifyChallengeProof(checked.challengeProof, { ...owner, sessionId: 'other' }, { speakerId: 'speaker-1' }).ok, false);
  assert.equal(challengeVerifier.checkChallenge({ challengeId: issued.challenge.challengeId, speakerId: 'speaker-1', challengeResponse: issued.expectedResponse }, owner).ok, false);
  const attested = { ...owner, speechCaptureAttestation: { verified: true, source: 'trusted_voice_capture', sessionId: 'session-1', speakerId: 'speaker-1', attestationId: 'capture-1' } };
  assert.equal(challengeVerifier.verifyChallengeProof(checked.challengeProof, attested, { speakerId: 'speaker-1' }).liveChallengeVerified, true);
});

test('continuity rejects claim flags and requires a valid token, session, speaker, and attested challenge', () => {
  continuityWindow.clearContinuityWindowsForTests();
  challengeVerifier.clearChallengesForTests();
  const owner = { role: 'owner', adminVerified: true, sessionVerified: true, sessionId: 'session-1' };
  assert.equal(continuityWindow.evaluateContinuityEvidence({ continuityWindowVerified: true, trustedVoiceWindowActive: true }, owner).trustedVoiceWindowActive, false);
  const attested = { ...owner, speechCaptureAttestation: { verified: true, source: 'trusted_voice_capture', sessionId: 'session-1', speakerId: 'speaker-1', attestationId: 'capture-1' } };
  const issued = challengeVerifier.issueChallenge({ speakerId: 'speaker-1' }, owner);
  const checked = challengeVerifier.checkChallenge({ challengeId: issued.challenge.challengeId, speakerId: 'speaker-1', challengeResponse: issued.expectedResponse }, attested);
  assert.equal(checked.liveChallengeVerified, true);
  const opened = continuityWindow.openContinuityWindow({ speakerId: 'speaker-1', challengeProof: checked.challengeProof }, attested);
  assert.equal(opened.ok, true);
  assert.equal(continuityWindow.checkContinuityWindow({ windowId: opened.windowId, continuityToken: opened.continuityToken, speakerId: 'speaker-1' }, owner).ok, true);
  assert.equal(continuityWindow.checkContinuityWindow({ windowId: opened.windowId, continuityToken: opened.continuityToken, speakerId: 'wrong' }, owner).ok, false);
  assert.equal(continuityWindow.checkContinuityWindow({ windowId: opened.windowId, continuityToken: opened.continuityToken, speakerId: 'speaker-1' }, { ...owner, sessionId: 'other' }).ok, false);
});

test('speaker identity blocks enrolled speakers without attested challenge evidence', () => {
  speakerRegistry.clearRegistryForTests();
  challengeVerifier.clearChallengesForTests();
  continuityWindow.clearContinuityWindowsForTests();
  const owner = { role: 'owner', adminVerified: true, sessionVerified: true, sessionId: 'session-1', adminVoiceVerified: true };
  const request = speakerRegistry.requestEnrollment({ speakerId: 'speaker-1', roleBinding: 'owner' }, owner);
  speakerRegistry.approveEnrollment({ requestId: request.request.requestId }, owner);
  const blocked = speakerIdentity.resolveVoiceSpeakerIdentity({ detectedSpeakerId: 'speaker-1' }, owner);
  assert.equal(blocked.speakerRegistryMatched, true);
  assert.equal(blocked.challengeBlocked, true);
  assert.equal(blocked.roleBinding, 'blocked');
  const attested = { ...owner, speechCaptureAttestation: { verified: true, source: 'trusted_voice_capture', sessionId: 'session-1', speakerId: 'speaker-1', attestationId: 'capture-2' } };
  const issued = challengeVerifier.issueChallenge({ speakerId: 'speaker-1' }, attested);
  const checked = challengeVerifier.checkChallenge({ challengeId: issued.challenge.challengeId, speakerId: 'speaker-1', challengeResponse: issued.expectedResponse }, attested);
  const accepted = speakerIdentity.resolveVoiceSpeakerIdentity({ detectedSpeakerId: 'speaker-1', challengeProof: checked.challengeProof }, attested);
  assert.equal(accepted.liveChallengeVerified, true);
  assert.equal(accepted.challengeBlocked, false);
  assert.equal(accepted.roleBinding, 'owner');
});

test('identity envelope skips getter-backed audio and credential fields', () => {
  let getterRead = false;
  const input = { transcript: 'hello', challengeProof: 'proof-is-needed-for-verification' };
  Object.defineProperty(input, 'rawAudio', { enumerable: true, get() { getterRead = true; return Buffer.from('audio'); } });
  const safe = speakerIdentity.applyVoiceSpeakerIdentityEnvelope(input, {});
  assert.equal(getterRead, false);
  assert.equal(Object.hasOwn(safe, 'rawAudio'), false);
  assert.equal(safe.rawAudioStored, false);
  assert.equal(safe.transcript, 'hello');
});

test('public parity ignores body auth claims and private speech keeps the verified Marion answer', () => {
  const spoof = { route: '/api/marion/admin/voice', body: { serverSideAdminAuth: true, adminVerified: true, sessionVerified: true, sessionId: 'fake', role: 'owner', audience: 'operator', surfaceAgent: 'Marion' } };
  assert.equal(parityHardlock.classifyTurn(spoof).scope, 'public');
  const secure = { options: { serverSideAdminAuth: true, adminVerified: true, sessionVerified: true, sessionId: 'session-1', role: 'owner', directMarionAdminInterface: true, adminInterfaceScope: 'marion_admin_conversation' } };
  assert.equal(parityHardlock.classifyTurn(secure).scope, 'operator');
  const spoken = parityHardlock.projectSpeechSyncEnvelope({ reply: 'Marion has the private update.', spokenText: 'Marion has the private update.' }, secure);
  assert.equal(spoken.spokenText, 'Marion has the private update.');
  assert.equal(spoken.speechText, spoken.spokenText);
  const publicReply = parityHardlock.projectResult({ ok: true, reply: 'I am Mac and Marion is connected.' }, spoof);
  assert.match(publicReply.reply, /Nyx/);
  assert.equal(publicReply.publicSurfaceOnly, true);
  assert.equal(parityHardlock.projectResult({ ok: false, final: false, reply: '' }, {}).reply, '');
});

test('voice HTTP handoff uses only the server-verified session ID', () => {
  const source = fs.readFileSync(path.join(root, 'index.js'), 'utf8');
  const start = source.indexOf('MarionVoiceGateway.handleVoiceTranscript({');
  const end = source.indexOf('const voice = isObj(packet && packet.voice)', start);
  const handoff = source.slice(start, end);
  assert.ok(start >= 0 && end > start);
  assert.match(handoff, /sessionId:\s*voiceSessionId/);
  assert.match(handoff, /sessionVerified:\s*voiceSessionVerified && !!voiceSessionId/);
  assert.doesNotMatch(handoff, /body\.sessionId/);
});

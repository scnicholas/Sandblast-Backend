'use strict';

const assert = require('assert');
const path = require('path');

const runtime = path.join(__dirname, '..', '..', 'Data', 'marion', 'runtime');
const gate = require(path.join(runtime, 'MarionVoiceAuthorizationGate.js'));
const bridge = require(path.join(runtime, 'marionBridge.js'));
const finalEnvelope = require(path.join(runtime, 'marionFinalEnvelope.js'));
const composer = require(path.join(runtime, 'composeMarionResponse.js'));

function testAuthorizationGate() {
  const publicAttempt = gate.evaluateVoiceAuthorization({
    transcript: 'Marion, open the admin interface.',
    speakerHint: 'Mac',
    directMarionAdminInterface: true,
    adminInterfaceScope: 'marion_admin_conversation'
  }, {
    trustSpeakerHint: true
  });

  assert.strictEqual(publicAttempt.allowed, false, 'speaker hint alone must not unlock Marion admin conversation');
  assert.strictEqual(publicAttempt.marionAdminConversationAllowed, false, 'public speaker hint must not allow Marion admin conversation');

  const trustedAttempt = gate.evaluateVoiceAuthorization({
    transcript: 'Marion, give me a private status summary.',
    speakerHint: 'Mac',
    directMarionAdminInterface: true,
    adminInterfaceScope: 'marion_admin_conversation'
  }, {
    serverSideAdminVoiceAuth: true,
    trustedServerAuth: true,
    allowMarionAdminConversation: true,
    adminInterfaceScope: 'marion_admin_conversation'
  });

  assert.strictEqual(trustedAttempt.allowed, true, 'trusted server-side admin proof should authorize private Marion conversation');
  assert.strictEqual(trustedAttempt.directMarionAdminInterface, true, 'direct admin interface marker should survive auth gate');
  assert.strictEqual(trustedAttempt.marionAdminConversationAllowed, true, 'trusted admin proof should allow Marion admin conversation');
}

function testBridgeCarry() {
  const carry = bridge._internal.buildBridgeVoiceCarry({
    inputChannel: 'voice',
    transcript: 'Marion, where are we with LingoSentinel?',
    directMarionAdminInterface: true,
    adminVoiceVerified: true,
    adminVoiceDeliveryAllowed: true,
    deliveryChannel: 'marion_admin_interface'
  });

  assert.strictEqual(carry.publicAgent, 'Marion', 'private admin interface should surface Marion only after admin verification');
  assert.strictEqual(carry.directMarionAdminInterface, true);
  assert.strictEqual(carry.marionAdminConversationAllowed, true);
  assert.strictEqual(carry.publicUsersCanAddressMarion, false);

  const normalized = bridge._internal.normalizeInbound({
    inputChannel: 'voice',
    text: 'Marion, status.',
    directMarionAdminInterface: true,
    adminVoiceVerified: true,
    adminVoiceDeliveryAllowed: true,
    deliveryChannel: 'marion_admin_interface'
  });

  assert.strictEqual(normalized.publicAgent, 'Marion');
  assert.strictEqual(normalized.userQuery, 'Marion, status.', 'direct admin input must not rewrite Marion to Nyx');
}

function testComposerCarry() {
  const voice = composer.buildComposerVoiceMetadata({
    inputChannel: 'voice',
    directMarionAdminInterface: true,
    adminVoiceVerified: true,
    adminVoiceDeliveryAllowed: true,
    adminInterfaceScope: 'marion_admin_conversation',
    voice: {
      inputChannel: 'voice',
      adminVoiceDeliveryAllowed: true,
      directMarionAdminInterface: true
    }
  }, {}, {});

  assert.strictEqual(voice.publicAgent, 'Marion');
  assert.strictEqual(voice.directMarionAdminInterface, true);
  assert.strictEqual(voice.marionAdminConversationAllowed, true);
  assert.strictEqual(voice.publicUsersCanAddressMarion, false);
}

function testFinalEnvelopeTransport() {
  const packet = finalEnvelope.createMarionFinalEnvelope({
    reply: 'Marion admin interface is ready.',
    directMarionAdminInterface: true,
    adminVoiceVerified: true,
    adminVoiceDeliveryAllowed: true,
    adminInterfaceScope: 'marion_admin_conversation',
    voice: {
      directMarionAdminInterface: true,
      adminVoiceDeliveryAllowed: true
    },
    token: 'SHOULD_NOT_LEAK'
  });

  assert.strictEqual(packet.publicAgent, 'Marion');
  assert.strictEqual(packet.adminInterface.marionAdminConversationAllowed, true);
  assert.strictEqual(packet.publicUsersCanAddressMarion, false);
  assert.strictEqual(JSON.stringify(packet).includes('SHOULD_NOT_LEAK'), false, 'sensitive fields should be redacted from final transport');
}

testAuthorizationGate();
testBridgeCarry();
testComposerCarry();
testFinalEnvelopeTransport();

console.log('PASS marion-admin-interface-gate-lingosentinel-path');

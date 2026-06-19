"use strict";

const assert = require('assert');
const registry = require('../../Data/marion/runtime/MarionVoiceSpeakerRegistry.js');

registry.clearRegistryForTests();

const remoteContext = { role: 'remote_trusted_user', adminVerified: false };
const ownerContext = { role: 'owner', adminVerified: true, sessionVerified: true };

const denied = registry.requestEnrollment({ displayName: 'Remote Guest', roleBinding: 'remote_trusted_user' }, remoteContext);
assert.strictEqual(denied.ok, false, 'remote trusted user must not self-enroll speakers');
assert.strictEqual(denied.statusCode, 403, 'remote self-enroll denial must be 403');

const requested = registry.requestEnrollment({ speakerId: 'mac-owner', displayName: 'Mac Owner', roleBinding: 'owner' }, ownerContext);
assert.strictEqual(requested.ok, true, 'owner should request enrollment');
assert.strictEqual(requested.request.enrollmentStatus, 'pending_enrollment', 'request should be pending');

const approved = registry.approveEnrollment({ requestId: requested.request.requestId, roleBinding: 'owner' }, ownerContext);
assert.strictEqual(approved.ok, true, 'owner should approve enrollment');
assert.strictEqual(approved.speaker.enrollmentStatus, 'owner_verified', 'owner enrollment state should be owner_verified');
assert.strictEqual(approved.speaker.rawAudioStored, false, 'raw audio must never be stored');
assert.strictEqual(approved.speaker.voiceprintStored, false, 'voiceprints must not be stored in phase 5');
assert.strictEqual(approved.speaker.identityIsAuthority, false, 'speaker registry must not become authority');

const checked = registry.checkSpeaker({ speakerId: 'mac-owner' });
assert.strictEqual(checked.matched, true, 'approved speaker should match');
assert.strictEqual(checked.roleBinding, 'owner', 'checked speaker should expose metadata role binding');

const revoked = registry.revokeSpeaker({ speakerId: 'mac-owner' }, ownerContext);
assert.strictEqual(revoked.ok, true, 'owner should revoke speaker');
assert.strictEqual(revoked.speaker.enrollmentStatus, 'revoked', 'revoked speaker should enter revoked state');

const checkedAfterRevoke = registry.checkSpeaker({ speakerId: 'mac-owner' });
assert.strictEqual(checkedAfterRevoke.blocked, true, 'revoked speaker should be blocked evidence');
assert.strictEqual(checkedAfterRevoke.speaker.identityIsAuthority, false, 'revoked profile still must not become authority');

const unknown = registry.checkSpeaker({ speakerId: 'unknown-speaker' });
assert.strictEqual(unknown.matched, false, 'unknown speaker should not match');
assert.strictEqual(unknown.enrollmentStatus, 'unknown', 'unknown speaker should remain unknown');

console.log('PHASE 5 speaker registry contract passed');

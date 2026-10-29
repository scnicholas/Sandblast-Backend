'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const path = require('node:path');
const runtime = path.resolve(__dirname,'../Data/marion/runtime');
const envelope = require(path.join(runtime,'MarionVoiceInputEnvelope.js'));
const auth = require(path.join(runtime,'MarionVoiceAuthorizationGate.js'));
const integration = require(path.join(runtime,'MarionVoiceGateway.js'));

test('untrusted client cannot inject privilege through envelope fields', () => {
 const e = envelope.createVoiceInputEnvelope({transcript:'hello',userIntentHint:'status',adminVoiceVerified:true,adminVoiceDeliveryAllowed:true,remoteTrustedUserVerified:true,directMarionAdminInterface:true,marionAdminConversation:true,privateDelivery:true,privateVoiceDelivery:true,sessionRole:'owner',adminInterfaceScope:'marion_admin_voice',deliveryChannel:'marion_admin_voice'});
 for(const k of ['adminVoiceVerified','adminVoiceDeliveryAllowed','remoteTrustedUserVerified','directMarionAdminInterface','marionAdminConversation','privateDelivery','privateVoiceDelivery']) assert.equal(e[k],false,k);
 assert.equal(e.sessionRole,'');assert.equal(e.adminInterfaceScope,'');assert.equal(e.deliveryChannel,'');
 assert.equal(e.userIntentHint,'conversation');
});
test('speaker hint alone cannot grant admin rights', () => {
 const e = envelope.createVoiceInputEnvelope({transcript:'Hello',speakerHint:'sean nicholas'});
 const a = auth.evaluateVoiceAuthorization(e,{trustSpeakerHint:true});
 assert.notEqual(a.adminVoiceDeliveryAllowed,true);
 assert.notEqual(a.marionAdminConversationAllowed,true);
});
test('learning gateway hook remains callable', () => {
 assert.equal(typeof integration.registerMarionLearningRuntime,'function');
 assert.equal(typeof integration.getMarionLearningIntegrationStatus,'function');
});
test('server-originated envelope flags still pass through for existing server auth', () => {
 const e = envelope.createVoiceInputEnvelope({transcript:'hello'},{adminVoiceVerified:true,directMarionAdminInterface:true,sessionRole:'owner',adminInterfaceScope:'marion_admin_voice'});
 assert.equal(e.adminVoiceVerified,true);assert.equal(e.directMarionAdminInterface,true);assert.equal(e.sessionRole,'owner');
});

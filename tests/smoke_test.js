/* eslint-disable no-console */
'use strict';

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const backend = path.join(__dirname, '..', 'backend');
process.chdir(backend);

function load(name) { return require(path.join(backend, name)); }
function parseJson(name) { return JSON.parse(fs.readFileSync(path.join(backend, name), 'utf8')); }

(async function run(){
  ['base_labels.json','conversation_patterns.json','emotion_analysis_schema.json','nuance_map.json'].forEach(parseJson);

  const emotion = load('MarionEmotionInterpreter.js');
  const emo = emotion.interpretEmotion({ text: "I'm overwhelmed and worried." });
  assert(emo.runtime_contract.raw_pattern_exposure === 'blocked');
  assert(emo.guard && typeof emo.guard.safe_to_continue === 'boolean');

  const domain = load('MarionDomainRouter.js');
  const route = domain.routeDomain('How do we structure the AI backend for revenue and legal compliance?');
  assert(route.primaryDomain);
  assert(route.sixDomainRouter === true);

  const gateway = load('MarionVoiceGateway.js');
  assert(typeof gateway.handleVoiceTranscript === 'function');

  const blocked = await gateway.handleVoiceTranscript({ transcript:'Can you hear me?' }, {});
  assert(blocked && blocked.ok === false, 'unauthorized voice should be blocked');

  const allowed = await gateway.handleVoiceTranscript({
    transcript:'Show me the Marion six domain conversational flow.',
    directMarionAdminInterface:true,
    adminInterfaceScope:'marion_admin_conversation',
    deliveryChannel:'marion_admin_interface'
  }, {
    adminVoiceVerified:true,
    adminVoiceDeliveryAllowed:true,
    serverSideAdminVoiceAuth:true,
    trustedServerAuth:true,
    directMarionAdminInterface:true,
    allowMarionAdminConversation:true,
    adminInterfaceScope:'marion_admin_conversation',
    deliveryChannel:'marion_admin_interface'
  });
  assert(allowed && allowed.reply, 'authorized voice should return reply');

  const voiceRoute = load('voiceRoute.js');
  assert(typeof voiceRoute === 'function' || typeof voiceRoute.voiceRoute === 'function');

  console.log('SMOKE_TEST_OK', { emotion: emo.emotion, domain: route.primaryDomain, gatewayReply: allowed.reply.slice(0,80) });
})().catch((err)=>{ console.error(err); process.exit(1); });

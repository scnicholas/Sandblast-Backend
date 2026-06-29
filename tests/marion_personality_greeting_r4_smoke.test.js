'use strict';

const assert = require('assert');
const path = require('path');

const admin = require(path.join(__dirname, 'MarionAdminConsoleGateway.js'));
const finalEnvelope = require(path.join(__dirname, 'marionFinalEnvelope.js'));
const composer = require(path.join(__dirname, 'composeMarionResponse.js'));

const EXPECTED_PREFIX = 'I’m good, Mac. I’m steady';
const BAD = /continuity foundation stays active/i;

(async () => {
  const adminResult = await admin.handleCommand({ message: 'How are you?', payload: { text: 'How are you?' } }, { headers: {} });
  assert(adminResult.reply.startsWith(EXPECTED_PREFIX), 'admin social check-in did not route through R4 social presence');
  assert(!BAD.test(JSON.stringify(adminResult)), 'admin packet still exposes continuity foundation phrase');
  assert(adminResult.meta && adminResult.meta.personalityGreetingR4 === true, 'admin packet missing R4 metadata');
  assert(adminResult.meta.personalityNode === 'social_checkin', 'admin packet missing social_checkin node');

  const shapedFinal = finalEnvelope.marionPersonalityGreetingR4ShapeReply('The continuity foundation stays active.', 'How are you?', {});
  assert(shapedFinal.startsWith(EXPECTED_PREFIX), 'final envelope sanitizer did not replace maintenance-manual phrase');
  assert(!BAD.test(shapedFinal), 'final envelope sanitizer leaked maintenance-manual phrase');

  const shapedComposer = composer.marionPersonalityGreetingR4ShapeReply('The continuity foundation stays active.', 'How are you?', {});
  assert(shapedComposer.startsWith(EXPECTED_PREFIX), 'composer sanitizer did not replace maintenance-manual phrase');
  assert(!BAD.test(shapedComposer), 'composer sanitizer leaked maintenance-manual phrase');

  const observation = finalEnvelope.marionPersonalityGreetingR4ShapeReply('', 'What are you seeing in the real-world feed?', {});
  assert(/observation, inference, risk, and one next move/i.test(observation), 'observation bridge shape missing');

  console.log('R4 personality greeting smoke test passed');
})().catch((err) => {
  console.error(err && err.stack || err);
  process.exit(1);
});

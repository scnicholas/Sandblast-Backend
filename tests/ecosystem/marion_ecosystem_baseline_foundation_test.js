'use strict';

const assert = require('assert');

const Registry = require('../../Data/marion/runtime/ecosystem/MarionComponentRegistry');
const Permissions = require('../../Data/marion/runtime/ecosystem/MarionEcosystemPermissions');
const State = require('../../Data/marion/runtime/ecosystem/MarionEcosystemStateSpine');
const Gateway = require('../../Data/marion/runtime/ecosystem/MarionEcosystemGateway');

(async () => {
  Registry.bootstrapDefaults();
  Permissions.bootstrapDefaults();

  const required = [
    'marion',
    'nyx',
    'lingosentinel',
    'crm',
    'sandblast-channel',
    'sandblast-radio',
    'sandblast-tv',
    'synapse',
    'chronicle',
    'project-guardians'
  ];

  for (const id of required) {
    assert.equal(Registry.has(id), true, `missing component ${id}`);
  }

  assert.equal(Permissions.authorize('nyx', 'request', 'marion.reasoning').ok, true);
  assert.equal(Permissions.authorize('crm', 'execute', 'crm.send_message').ok, false);
  assert.equal(Permissions.authorize('marion', 'execute', 'system.command').ok, false);

  const session = State.setSession('baseline-foundation-session', 'nyx', {
    status: 'ready',
    conversationId: 'baseline-conversation'
  });

  assert.equal(session.ok, true);

  Gateway.registerMarionRunner(async input => ({
    text: `Baseline Marion response: ${input.text}`
  }));

  const result = await Gateway.process({
    requestId: 'baseline-foundation-request',
    traceId: 'baseline-foundation-trace',
    sessionId: 'baseline-foundation-session',
    conversationId: 'baseline-conversation',
    source: 'nyx',
    target: 'marion',
    eventType: 'conversation.message',
    intent: 'conversation',
    text: 'Foundation smoke test'
  });

  assert.equal(result.ok, true);
  assert.equal(result.handledBy, 'marion');
  assert.equal(result.response.requestId, 'baseline-foundation-request');
  assert.match(result.response.text, /Foundation smoke test/);

  console.log('PASS marion_ecosystem_baseline_foundation_test');
})().catch(error => {
  console.error(error);
  process.exit(1);
});

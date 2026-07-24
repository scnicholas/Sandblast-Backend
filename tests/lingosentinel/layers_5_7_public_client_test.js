'use strict';
const assert = require('assert');
const path = require('path');
const root = path.resolve(__dirname, '..', '..');
let calls = 0;
let captured = null;
global.LingoSentinelPublicRealtimeClient = {
  getState: function () { return { state: 'connected', active: { roomId: 'lingosentinel-main', mode: 'group_room', clientId: 'lsu_public_0001', sessionId: 'lss_public_0001' } }; },
  authorizedRequest: async function (url, options, roomId) {
    calls += 1; captured = { url, options, roomId };
    await new Promise(function (resolve) { setTimeout(resolve, 20); });
    const body = JSON.parse(options.body);
    return { ok: true, stage: 'message_published', messageId: 'lsm_public_1', clientRequestId: body.clientRequestId, roomId, sequence: 1, translationStatus: 'bypassed' };
  }
};
const clientPath = path.join(root, 'public', 'lingosentinel', 'lingosentinel-public-message-client.js');
delete require.cache[require.resolve(clientPath)];
const MessageClient = require(clientPath);

function fakeNode(tag) {
  const node = {
    tagName: tag,
    attributes: {},
    children: [],
    _text: '',
    setAttribute: function (k, v) { this.attributes[k] = String(v); },
    appendChild: function (child) { this.children.push(child); return child; }
  };
  Object.defineProperty(node, 'textContent', { set: function (v) { this._text = String(v); }, get: function () { return this._text; } });
  Object.defineProperty(node, 'innerHTML', { set: function () { throw new Error('innerHTML must never be used'); } });
  return node;
}
global.document = { createElement: fakeNode };
const renderPath = path.join(root, 'public', 'lingosentinel', 'lingosentinel-message-render-policy.js');
delete require.cache[require.resolve(renderPath)];
const RenderPolicy = require(renderPath);

(async function () {
  const p1 = MessageClient.send({ text: 'Hello' });
  const p2 = MessageClient.send({ text: 'Hello' });
  const [r1, r2] = await Promise.all([p1, p2]);
  assert.equal(r1.ok, true); assert.equal(r2.ok, true); assert.equal(calls, 1);
  assert.equal(captured.url, '/api/lingosentinel/messages');
  const body = JSON.parse(captured.options.body);
  assert.equal(body.clientId, 'lsu_public_0001');
  assert.equal(body.sessionId, 'lss_public_0001');
  assert.equal(body.sourceLanguage, 'en'); assert.equal(body.targetLanguage, 'en');
  assert.equal('membershipCredential' in body, false);
  assert.equal(MessageClient.getState().state, 'published');

  const container = fakeNode('section');
  const rendered = RenderPolicy.render(container, {
    direction: 'incoming', messageId: 'lsm_x', senderName: '<img onerror=alert(1)>',
    text: '<script>alert(1)</script>', sequence: 1, createdAt: '2026-07-24T18:00:00.000Z'
  }, { formatTime: false });
  assert.equal(container.children.length, 1);
  assert.equal(rendered.children[1].textContent, '<script>alert(1)</script>');
  assert.equal(rendered.children[0].children[0].textContent, '<img onerror=alert(1)>');
  assert.equal(RenderPolicy.htmlExecutionAllowed, false);

  console.log(JSON.stringify({ ok: true, passed: 8, suite: 'LingoSentinel Layers 5-7 public client' }, null, 2));
})().catch(function (error) { console.error(error.stack || error); process.exit(1); });

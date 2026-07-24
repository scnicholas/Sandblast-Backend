'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..', '..');
const rt = path.join(root, 'Data', 'marion', 'runtime', 'LingoSentinel');
function route(name) { return require(path.join(rt, name)); }
function hasRoute(router, method, routePath) {
  return router.stack.some(function (layer) { return layer.method === method && layer.args[0] === routePath; });
}
const MessageRoute = route('LingoSentinelMessageRoute');
const RoomRoute = route('LingoSentinelRoomRoute');
const TokenRoute = route('LingoSentinelSubscribeTokenRoute');
const ConnectionRoute = route('LingoSentinelConnectionRoute');
assert.equal(hasRoute(MessageRoute, 'post', '/messages'), true);
assert.equal(hasRoute(MessageRoute, 'get', '/messages/health'), true);
assert.equal(hasRoute(RoomRoute, 'post', '/rooms/:roomId/join'), true);
assert.equal(hasRoute(TokenRoute, 'post', '/token'), true);
assert.equal(hasRoute(ConnectionRoute, 'post', '/connections/register'), true);

const index = fs.readFileSync(path.join(root, 'index.js'), 'utf8');
[
  'LingoSentinelMessageRoute',
  'mountLingoSentinelMessageRoute',
  'lingosentinel-public-message-client.js',
  'lingosentinel-public-message-receiver.js',
  'lingosentinel-message-render-policy.js',
  'lingosentinel-widget-conversation-controller.js',
  'x-lingosentinel-membership',
  'direct_public_publish_disabled',
  '/api/lingosentinel/messages'
].forEach(function (needle) { assert.ok(index.includes(needle), needle); });
const tokenSource = fs.readFileSync(path.join(rt, 'LingoSentinelSubscribeTokenRoute.js'), 'utf8');
assert.ok(tokenSource.includes('MembershipCredential.readCredential(req)'));
const gatewaySource = fs.readFileSync(path.join(rt, 'LingoSentinelLinkGateway.js'), 'utf8');
assert.equal(gatewaySource.includes('input.roomAuthorization && input.roomAuthorization.ok === true'), false);
console.log(JSON.stringify({ ok: true, passed: 12, suite: 'LingoSentinel Layers 5-7 route contracts' }, null, 2));

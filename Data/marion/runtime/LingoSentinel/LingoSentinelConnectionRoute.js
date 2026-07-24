'use strict';

const express = require('express');
const RoomRegistry = require('./LingoSentinelRoomRegistry');
const ConnectionState = require('./LingoSentinelConnectionState');
const ReconnectPolicy = require('./LingoSentinelReconnectPolicy');
const RealtimeBridge = require('./LingoSentinelRealtimeBridge');

const router = express.Router();
const VERSION = 'nyx.lingosentinel.connectionRoute/4.0-lifecycle';

function harden(res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('X-Content-Type-Options', 'nosniff');
}
function body(req) { return req.body && typeof req.body === 'object' ? req.body : {}; }
function failure(res, status, result, stage) {
  return res.status(status).json({ ok: false, stage, errors: result && result.errors || [result && result.error || 'connection_operation_failed'], diagnosticsRedacted: true, version: VERSION });
}

router.options(['/connections/register', '/connections/state', '/connections/disconnect', '/connections/:sessionId'], (req, res) => { harden(res); return res.status(204).end(); });

router.get('/connections/health', (req, res) => {
  harden(res);
  return res.status(200).json({ ok: true, service: 'LingoSentinelConnectionRoute', version: VERSION, connectionState: ConnectionState.getHealth(), reconnectPolicy: ReconnectPolicy.getHealth(), realtimeBridge: RealtimeBridge.getHealth() });
});

router.post('/connections/register', (req, res) => {
  harden(res);
  const input = body(req);
  const authorization = RoomRegistry.authorize(input.roomId, input, 'subscribe');
  if (!authorization.ok) return failure(res, 403, authorization, 'connection_register_authorize');
  const result = ConnectionState.register(input);
  if (!result.ok) return failure(res, 400, result, 'connection_register');
  let transition = result;
  const currentState = result.connection && result.connection.state;
  if (!result.alreadyRegistered || currentState === 'initialized' || currentState === 'failed') {
    transition = ConnectionState.update(input.sessionId, 'connecting');
  } else if (currentState === 'disconnected' || currentState === 'suspended') {
    transition = ConnectionState.update(input.sessionId, 'reconnecting');
  }
  if (!transition.ok) return failure(res, 409, transition, 'connection_register_transition');
  return res.status(result.alreadyRegistered ? 200 : 201).json({
    ok: true,
    connection: transition.connection || result.connection,
    alreadyRegistered: result.alreadyRegistered === true,
    reconnectPolicy: ReconnectPolicy.decision(0, {}),
    version: VERSION
  });
});

router.post('/connections/state', (req, res) => {
  harden(res);
  const input = body(req);
  const current = ConnectionState.get(input.sessionId);
  if (!current || current.clientId !== String(input.clientId || '').trim()) return failure(res, 403, { errors: ['Connection identity mismatch.'] }, 'connection_state_authorize');
  const result = ConnectionState.update(input.sessionId, input.state, { errorCode: input.errorCode });
  if (!result.ok) return failure(res, 400, result, 'connection_state');
  const reconnect = ['failed', 'suspended', 'disconnected'].includes(result.connection.state)
    ? ReconnectPolicy.decision(result.connection.attempt, { code: input.errorCode, status: input.status })
    : { retry: false, reason: 'not_required', attempt: result.connection.attempt, delayMs: 0 };
  return res.status(200).json({ ok: true, connection: result.connection, reconnect, version: VERSION });
});

router.post('/connections/disconnect', (req, res) => {
  harden(res);
  const input = body(req);
  const current = ConnectionState.get(input.sessionId);
  if (!current) return failure(res, 404, { errors: ['Connection session was not found.'] }, 'connection_disconnect');
  if (current.clientId !== String(input.clientId || '').trim()) return failure(res, 403, { errors: ['Connection identity mismatch.'] }, 'connection_disconnect_authorize');
  let result = ConnectionState.update(input.sessionId, current.state === 'closed' ? 'closed' : 'closed');
  if (!result.ok && current.state !== 'closed') return failure(res, 400, result, 'connection_disconnect');
  return res.status(200).json({ ok: true, connection: result.connection || current, version: VERSION });
});

router.get('/connections/:sessionId', (req, res) => {
  harden(res);
  const connection = ConnectionState.get(req.params.sessionId);
  if (!connection) return failure(res, 404, { errors: ['Connection session was not found.'] }, 'connection_get');
  if (connection.clientId !== String(req.query && req.query.clientId || '').trim()) return failure(res, 403, { errors: ['Connection identity mismatch.'] }, 'connection_get_authorize');
  return res.status(200).json({ ok: true, connection, version: VERSION });
});

router.VERSION = VERSION;
module.exports = router;
module.exports.VERSION = VERSION;

'use strict';

const express = require('express');
const RoomPolicy = require('./LingoSentinelRoomPolicy');
const RoomRegistry = require('./LingoSentinelRoomRegistry');

const router = express.Router();
const VERSION = 'nyx.lingosentinel.roomRoute/3.0-controlled-rooms';

function harden(res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('X-Content-Type-Options', 'nosniff');
}

function identityFrom(req) {
  const body = req.body || {};
  const query = req.query || {};
  return {
    clientId: body.clientId || body.userId || query.clientId || query.userId,
    sessionId: body.sessionId || query.sessionId,
    displayName: body.displayName || body.name || query.displayName,
    authenticated: body.authenticated === true
  };
}

function failure(res, status, result, stage) {
  return res.status(status).json({
    ok: false,
    stage,
    errors: result && result.errors || [result && result.error || 'room_operation_failed'],
    diagnosticsRedacted: true,
    version: VERSION
  });
}

router.options(['/rooms', '/rooms/:roomId', '/rooms/:roomId/join', '/rooms/:roomId/leave', '/rooms/:roomId/participants', '/rooms/:roomId/authorize'], (req, res) => {
  harden(res);
  return res.status(204).end();
});

router.post('/rooms', (req, res) => {
  harden(res);
  const result = RoomRegistry.create(req.body || {}, identityFrom(req));
  return result.ok ? res.status(201).json({ ...result, version: VERSION }) : failure(res, result.code === 'ROOM_ALREADY_EXISTS' ? 409 : 400, result, 'room_create');
});

router.post('/rooms/:roomId/join', (req, res) => {
  harden(res);
  const result = RoomRegistry.join(req.params.roomId, identityFrom(req));
  return result.ok ? res.status(200).json({ ...result, version: VERSION }) : failure(res, result.code === 'ROOM_NOT_FOUND' ? 404 : 403, result, 'room_join');
});

router.post('/rooms/:roomId/leave', (req, res) => {
  harden(res);
  const result = RoomRegistry.leave(req.params.roomId, identityFrom(req));
  return result.ok ? res.status(200).json({ ...result, version: VERSION }) : failure(res, result.code === 'ROOM_NOT_FOUND' ? 404 : 400, result, 'room_leave');
});

router.post('/rooms/:roomId/authorize', (req, res) => {
  harden(res);
  const action = RoomPolicy.safeString(req.body && req.body.action || 'subscribe');
  const result = RoomRegistry.authorize(req.params.roomId, identityFrom(req), action);
  return result.ok ? res.status(200).json({ ok: true, authorization: result, version: VERSION }) : failure(res, 403, result, 'room_authorize');
});

router.get('/rooms/health', (req, res) => {
  harden(res);
  return res.status(200).json({ ok: true, service: 'LingoSentinelRoomRoute', version: VERSION, registry: RoomRegistry.getHealth() });
});

router.get('/rooms/:roomId/participants', (req, res) => {
  harden(res);
  const auth = RoomRegistry.authorize(req.params.roomId, identityFrom(req), 'presence');
  if (!auth.ok) return failure(res, 403, auth, 'room_participants_authorize');
  const result = RoomRegistry.listParticipants(req.params.roomId);
  const participants = result.participants.map((item) => ({
    clientId: item.clientId,
    displayName: item.displayName,
    role: item.role,
    joinedAt: item.joinedAt,
    active: item.active === true
  }));
  return result.ok ? res.status(200).json({ ok: true, room: result.room, participants, sessionIdsExposed: false, version: VERSION }) : failure(res, 404, result, 'room_participants');
});

router.get('/rooms/:roomId', (req, res) => {
  harden(res);
  const auth = RoomRegistry.authorize(req.params.roomId, identityFrom(req), 'subscribe');
  if (!auth.ok) return failure(res, 403, auth, 'room_get_authorize');
  const room = RoomRegistry.get(req.params.roomId);
  return room ? res.status(200).json({ ok: true, room, version: VERSION }) : failure(res, 404, { errors: ['Room was not found.'] }, 'room_get');
});

router.VERSION = VERSION;
router.RoomRegistry = RoomRegistry;
module.exports = router;
module.exports.VERSION = VERSION;
module.exports.RoomRegistry = RoomRegistry;

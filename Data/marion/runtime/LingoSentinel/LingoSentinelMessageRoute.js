'use strict';

const express = require('express');
const MembershipCredential = require('./LingoSentinelMembershipCredential');
const MessagePublisher = require('./LingoSentinelMessagePublisher');
const MessagePolicy = require('./LingoSentinelMessagePolicy');
const MessageEnvelope = require('./LingoSentinelMessageEnvelope');
const MessageValidator = require('./LingoSentinelMessageValidator');
const PublicProjection = require('./LingoSentinelPublicMessageProjection');
const EnglishRelayPolicy = require('./LingoSentinelEnglishRelayPolicy');
const ReceiveDiagnostics = require('./LingoSentinelReceiveDiagnostics');

const router = express.Router();
const VERSION = 'nyx.lingosentinel.messageRoute/7.0-english-relay';

function harden(res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('X-Content-Type-Options', 'nosniff');
}

function contextFrom(req) {
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  return {
    clientId: String(body.clientId || '').trim(),
    sessionId: String(body.sessionId || '').trim(),
    membershipCredential: MembershipCredential.readCredential(req)
  };
}

function statusFor(result) {
  const codes = (result.errors || []).map((item) => String(item && (item.code || item) || ''));
  if (codes.some((code) => /MEMBERSHIP|CONNECTION_CLIENT|CONNECTION_ROOM/.test(code))) return 403;
  if (codes.some((code) => /CONNECTION_NOT_READY/.test(code))) return 409;
  if (result.stage === 'provider_publish') return 502;
  return 400;
}

router.options(['/messages', '/messages/health'], (req, res) => {
  harden(res);
  return res.status(204).end();
});

router.post('/messages', async (req, res) => {
  harden(res);
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const messageInput = { ...body };
  delete messageInput.clientId;
  delete messageInput.sessionId;
  delete messageInput.membershipCredential;
  delete messageInput.membershipToken;
  const result = await MessagePublisher.publish(messageInput, contextFrom(req));
  if (!result.ok) return res.status(statusFor(result)).json({ ...result, version: VERSION });
  return res.status(result.idempotentReplay ? 200 : 201).json({ ...result, version: VERSION });
});

router.get('/messages/health', (req, res) => {
  harden(res);
  return res.status(200).json({
    ok: true,
    service: 'LingoSentinelMessageRoute',
    version: VERSION,
    messagePolicy: MessagePolicy.getHealth(),
    messageEnvelope: MessageEnvelope.getHealth(),
    messageValidator: MessageValidator.getHealth(),
    publicProjection: PublicProjection.getHealth(),
    englishRelay: EnglishRelayPolicy.getHealth(),
    publisher: MessagePublisher.getHealth(),
    receiveDiagnostics: ReceiveDiagnostics.snapshot(),
    membershipCredential: MembershipCredential.getHealth()
  });
});

router.VERSION = VERSION;
router.MessagePublisher = MessagePublisher;
module.exports = router;
module.exports.VERSION = VERSION;
module.exports.MessagePublisher = MessagePublisher;

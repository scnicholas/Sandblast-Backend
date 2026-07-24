'use strict';

const MessageValidator = require('./LingoSentinelMessageValidator');
const MessageEnvelope = require('./LingoSentinelMessageEnvelope');
const PublicProjection = require('./LingoSentinelPublicMessageProjection');
const EnglishRelayPolicy = require('./LingoSentinelEnglishRelayPolicy');
const RoomRegistry = require('./LingoSentinelRoomRegistry');
const LinkGateway = require('./LingoSentinelLinkGateway');
const RealtimeBridge = require('./LingoSentinelRealtimeBridge');
const Diagnostics = require('./LingoSentinelReceiveDiagnostics');

const VERSION = 'nyx.lingosentinel.messagePublisher/6.0-backend-authority';
const DEFAULT_IDEMPOTENCY_TTL_MS = 10 * 60 * 1000;

class LingoSentinelMessagePublisher {
  constructor(options = {}) {
    this.realtimeBridge = options.realtimeBridge || RealtimeBridge;
    this.idempotencyTtlMs = Number(options.idempotencyTtlMs) > 0 ? Number(options.idempotencyTtlMs) : DEFAULT_IDEMPOTENCY_TTL_MS;
    this.requests = new Map();
  }

  _key(input, context) {
    return `${String(context.clientId || '')}:${String(input.roomId || '')}:${String(input.clientRequestId || input.requestId || '')}`;
  }

  _prune(now = Date.now()) {
    for (const [key, value] of this.requests.entries()) {
      if (!value || now - value.createdMs > this.idempotencyTtlMs) this.requests.delete(key);
    }
  }

  _recipientFor(mode, roomId, clientId) {
    if (mode !== 'one_to_one') return null;
    const result = RoomRegistry.listParticipants(roomId);
    if (!result.ok) return null;
    const other = result.participants.find((item) => item.active && item.clientId !== clientId);
    return other ? { id: other.clientId, clientId: other.clientId, name: other.displayName, displayName: other.displayName, role: other.role } : null;
  }

  async publish(input = {}, context = {}, options = {}) {
    this._prune();
    const key = this._key(input, context);
    const existing = this.requests.get(key);
    if (existing) return { ...existing.result, idempotentReplay: true };

    const validation = MessageValidator.validatePublishRequest(input, context, options);
    if (!validation.ok) {
      Diagnostics.record('message_validation_failed');
      return { ok: false, stage: 'message_validation', errors: validation.errors, diagnosticsRedacted: true };
    }

    const relay = EnglishRelayPolicy.apply({
      text: validation.normalized.text,
      sourceLanguage: validation.normalized.sourceLanguage,
      targetLanguage: validation.normalized.targetLanguage
    });
    if (!relay.ok) {
      Diagnostics.record('message_validation_failed');
      return { ok: false, stage: 'english_relay_policy', errors: relay.errors, diagnosticsRedacted: true };
    }

    const sender = validation.membership || {};
    const recipient = this._recipientFor(validation.normalized.mode, validation.normalized.roomId, sender.clientId);
    if (validation.normalized.mode === 'one_to_one' && !recipient) {
      return { ok: false, stage: 'message_recipient', errors: [{ code: 'ONE_TO_ONE_RECIPIENT_REQUIRED', field: 'roomId' }], diagnosticsRedacted: true };
    }

    const gateway = LinkGateway.prepareLingoSentinelPublish({
      mode: validation.normalized.mode,
      roomId: validation.normalized.roomId,
      text: relay.originalText,
      sourceLanguage: 'en',
      targetLanguage: 'en',
      membershipCredential: context.membershipCredential,
      sender: {
        id: sender.clientId,
        clientId: sender.clientId,
        sessionId: context.sessionId,
        name: sender.displayName,
        displayName: sender.displayName,
        role: sender.role,
        preferredLanguage: 'en'
      },
      recipient
    });
    if (!gateway.ok) {
      Diagnostics.record('message_validation_failed');
      return { ok: false, stage: 'gateway_governance', errors: gateway.errors || [{ code: 'GATEWAY_REJECTED' }], diagnosticsRedacted: true };
    }

    const sequenceResult = RoomRegistry.nextSequence(validation.normalized.roomId);
    if (!sequenceResult.ok) {
      Diagnostics.record('message_validation_failed');
      return { ok: false, stage: 'message_sequence', errors: sequenceResult.errors, diagnosticsRedacted: true };
    }

    let envelope = MessageEnvelope.buildEnvelope({
      clientRequestId: validation.normalized.clientRequestId,
      roomId: validation.normalized.roomId,
      mode: validation.normalized.mode,
      sequence: sequenceResult.sequence,
      sender,
      originalText: relay.originalText,
      displayText: relay.displayText
    });

    const envelopeValidation = MessageValidator.validateEnvelope(envelope);
    if (!envelopeValidation.ok) {
      Diagnostics.record('public_projection_failed');
      return { ok: false, stage: 'message_envelope', errors: envelopeValidation.errors, diagnosticsRedacted: true };
    }

    let publicMessage = PublicProjection.project(envelope);
    const projectionValidation = PublicProjection.validateProjection(publicMessage);
    if (!projectionValidation.ok) {
      Diagnostics.record('public_projection_failed');
      return { ok: false, stage: 'public_projection', errors: projectionValidation.errors, diagnosticsRedacted: true };
    }

    let provider;
    try {
      provider = await this.realtimeBridge.publishMessage(publicMessage, {
        clientId: context.clientId,
        sessionId: context.sessionId,
        membershipCredential: context.membershipCredential,
        roomId: validation.normalized.roomId,
        mode: validation.normalized.mode,
        authority: 'LingoSentinelMessagePublisher'
      });
    } catch (error) {
      Diagnostics.record('provider_publish_failed');
      return {
        ok: false,
        stage: 'provider_publish',
        errors: [{ code: String(error && error.code || 'PROVIDER_PUBLISH_FAILED') }],
        diagnosticsRedacted: true
      };
    }

    envelope = MessageEnvelope.withPublishedAt(envelope, provider.publishedAt);
    publicMessage = PublicProjection.project(envelope);
    const result = {
      ok: true,
      stage: 'message_published',
      messageId: envelope.messageId,
      clientRequestId: envelope.clientRequestId,
      roomId: envelope.roomId,
      sequence: envelope.sequence,
      providerAccepted: provider.ok === true,
      translationStatus: envelope.translation.status,
      eventType: envelope.eventType,
      publishedAt: envelope.publishedAt,
      idempotentReplay: false,
      diagnosticsRedacted: true
    };
    this.requests.set(key, { createdMs: Date.now(), result });
    Diagnostics.record('message_published');
    return result;
  }

  reset() { this.requests.clear(); }

  getHealth() {
    this._prune();
    return {
      ok: true,
      service: 'LingoSentinelMessagePublisher',
      version: VERSION,
      backendPublishAuthority: true,
      directBrowserPublishAllowed: false,
      idempotencyCache: 'in_memory_bounded',
      idempotencyEntries: this.requests.size,
      idempotencyTtlMs: this.idempotencyTtlMs
    };
  }
}

const singleton = new LingoSentinelMessagePublisher();
module.exports = singleton;
module.exports.VERSION = VERSION;
module.exports.LingoSentinelMessagePublisher = LingoSentinelMessagePublisher;

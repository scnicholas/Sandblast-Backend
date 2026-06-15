'use strict';

/**
 * LingoSentinelRealtimeBridge
 * ------------------------------------------------------------
 * Purpose:
 *   Isolated realtime bridge for LingoSentinel.
 *
 * Responsibilities:
 *   - Connect to Ably if available.
 *   - Keep globe, room, translation, presence, and telemetry channels separated.
 *   - Validate outbound and inbound realtime events.
 *   - Prevent noisy globe hover/move spam.
 *   - Provide graceful local fallback when realtime is unavailable.
 *
 * Architectural boundary:
 *   - This file does NOT decide Marion authority.
 *   - This file does NOT perform translation.
 *   - This file does NOT expose private form data, emails, or identities.
 *   - This file only moves approved realtime signals.
 */

const DEFAULT_NAMESPACE = 'lingosentinel';
const PHASE2B_USER_BOUNDARY_VERSION = 'nyx.lingosentinel.realtimeBridge.userBoundarySilentOversight/2.0';

const CHANNELS = Object.freeze({
  presence: 'presence',
  globe: 'globe',
  telemetry: 'telemetry',
  room: 'room',
  direct: 'direct',
  translation: 'translation',
  delivered: 'delivered'
});

const EVENT_TYPES = Object.freeze({
  GLOBE_REGION_SELECTED: 'GLOBE_REGION_SELECTED',
  GLOBE_CITY_SELECTED: 'GLOBE_CITY_SELECTED',

  ROOM_JOINED: 'ROOM_JOINED',
  ROOM_LEFT: 'ROOM_LEFT',
  ROOM_MESSAGE_SENT: 'ROOM_MESSAGE_SENT',
  ONE_TO_ONE_MESSAGE_READY: 'ONE_TO_ONE_MESSAGE_READY',
  ROOM_MESSAGE_READY: 'ROOM_MESSAGE_READY',

  TRANSLATION_SESSION_STARTED: 'TRANSLATION_SESSION_STARTED',
  TRANSLATION_MESSAGE_SENT: 'TRANSLATION_MESSAGE_SENT',
  TRANSLATION_MESSAGE_READY: 'TRANSLATION_MESSAGE_READY',
  TRANSLATION_SESSION_ENDED: 'TRANSLATION_SESSION_ENDED',
  DELIVERED_MESSAGE_READY: 'DELIVERED_MESSAGE_READY',

  USER_PRESENCE_UPDATED: 'USER_PRESENCE_UPDATED',
  TELEMETRY_EVENT: 'TELEMETRY_EVENT',

  CONNECTION_READY: 'CONNECTION_READY',
  CONNECTION_FALLBACK: 'CONNECTION_FALLBACK',
  CONNECTION_ERROR: 'CONNECTION_ERROR',
  CONNECTION_CLOSED: 'CONNECTION_CLOSED'
});

const ALLOWED_EVENT_TYPES = new Set(Object.values(EVENT_TYPES));

const DEFAULT_LIMITS = Object.freeze({
  globePublishMs: 650,
  presencePublishMs: 1500,
  telemetryPublishMs: 2500,
  maxMessageLength: 1500,
  maxRegionLength: 80,
  maxCityLength: 80,
  maxRoomIdLength: 96,
  maxSessionIdLength: 96
});


function normalizeBoundaryText(value) {
  return safeString(value || '', 180).toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function isReservedMarionIdentity(value) {
  const text = normalizeBoundaryText(value);
  return !!text && (/^(?:marion|marion ai|marion authority|marion admin|marion overseer|marion system)$/.test(text) || /\bmarion\b/.test(text));
}

function participantSpoofsMarion(value) {
  if (!isObject(value)) return false;
  return isReservedMarionIdentity(value.id) ||
    isReservedMarionIdentity(value.userId) ||
    isReservedMarionIdentity(value.clientId) ||
    isReservedMarionIdentity(value.name) ||
    isReservedMarionIdentity(value.displayName) ||
    isReservedMarionIdentity(value.handle) ||
    isReservedMarionIdentity(value.role) ||
    isReservedMarionIdentity(value.publicAgent) ||
    isReservedMarionIdentity(value.visibleAgent) ||
    isReservedMarionIdentity(value.speaker) ||
    isReservedMarionIdentity(value.speakerName);
}

function eventHasPublicMarionIdentity(input = {}) {
  const event = isObject(input) ? input : {};
  return participantSpoofsMarion(event.sender) || participantSpoofsMarion(event.from) ||
    participantSpoofsMarion(event.recipient) || participantSpoofsMarion(event.to) ||
    participantSpoofsMarion(event.participant) || participantSpoofsMarion(event.user) ||
    isReservedMarionIdentity(event.senderId) || isReservedMarionIdentity(event.userId) ||
    isReservedMarionIdentity(event.clientId) || isReservedMarionIdentity(event.senderName) ||
    isReservedMarionIdentity(event.displayName) || isReservedMarionIdentity(event.name) ||
    isReservedMarionIdentity(event.speaker) || isReservedMarionIdentity(event.speakerName) ||
    isReservedMarionIdentity(event.publicAgent) || isReservedMarionIdentity(event.visibleAgent) ||
    isReservedMarionIdentity(event.roomId) || isReservedMarionIdentity(event.channelId) ||
    isReservedMarionIdentity(event.conversationId) || isReservedMarionIdentity(event.sessionId) ||
    isReservedMarionIdentity(event.deliveryId);
}

function phase2bBoundary() {
  return {
    version: PHASE2B_USER_BOUNDARY_VERSION,
    userToUserBoundary: true,
    silentOversight: true,
    advisoryOnly: true,
    finalAuthority: 'Marion',
    publicFacingAgent: 'LingoSentinel/Nyx',
    publicUsersMayAddressMarion: false,
    publicUsersSpeakThrough: 'LingoSentinel/Nyx',
    marionVisibleParticipant: false,
    marionRenderedAsSpeaker: false,
    marionCanPublishToRoom: false,
    marionCanAppearInUserRoster: false,
    marionPublicChannelAllowed: false,
    visibleToUsers: false
  };
}

function now() {
  return Date.now();
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function safeString(value, maxLength) {
  if (value === null || value === undefined) return '';
  return String(value).trim().slice(0, maxLength);
}

function safeBoolean(value) {
  return value === true;
}

function safeTimestamp(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return now();
  return numeric;
}

function createNoopLogger() {
  return {
    info() {},
    warn() {},
    error() {}
  };
}

function sanitizeChannelPart(value, fallback) {
  const raw = safeString(value || fallback, 128);
  const cleaned = raw
    .replace(/[^a-zA-Z0-9:_-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  return cleaned || fallback;
}

function buildChannelName(namespace, lane, id) {
  const ns = sanitizeChannelPart(namespace, DEFAULT_NAMESPACE);
  const cleanLane = sanitizeChannelPart(lane, 'default');

  if (!id) return `${ns}:${cleanLane}`;

  return `${ns}:${cleanLane}:${sanitizeChannelPart(id, 'default')}`;
}

function makeLocalClientId(prefix) {
  return `${sanitizeChannelPart(prefix || 'ls-client', 'ls-client')}-${Math.random()
    .toString(36)
    .slice(2, 10)}`;
}

function normalizeLanguagePair(pair) {
  if (!isObject(pair)) return null;

  const source = safeString(pair.source || pair.from, 12).toLowerCase();
  const target = safeString(pair.target || pair.to, 12).toLowerCase();

  if (!source || !target) return null;

  return { source, target };
}

function sanitizeEvent(input, limits) {
  if (!isObject(input)) return null;

  const type = safeString(input.type, 80);

  if (!ALLOWED_EVENT_TYPES.has(type)) return null;
  if (eventHasPublicMarionIdentity(input)) return null;

  const base = {
    type,
    timestamp: safeTimestamp(input.timestamp)
  };

  switch (type) {
    case EVENT_TYPES.GLOBE_REGION_SELECTED:
      return {
        ...base,
        region: safeString(input.region, limits.maxRegionLength),
        languageHint: safeString(input.languageHint, 16).toLowerCase(),
        source: safeString(input.source || 'globe', 40)
      };

    case EVENT_TYPES.GLOBE_CITY_SELECTED:
      return {
        ...base,
        region: safeString(input.region, limits.maxRegionLength),
        city: safeString(input.city, limits.maxCityLength),
        languageHint: safeString(input.languageHint, 16).toLowerCase(),
        source: safeString(input.source || 'globe', 40)
      };

    case EVENT_TYPES.ROOM_JOINED:
    case EVENT_TYPES.ROOM_LEFT:
      return {
        ...base,
        roomId: sanitizeChannelPart(input.roomId, 'global'),
        region: safeString(input.region, limits.maxRegionLength),
        languageHint: safeString(input.languageHint, 16).toLowerCase(),
        anonymous: input.anonymous !== false,
        ...phase2bBoundary()
      };

    case EVENT_TYPES.ONE_TO_ONE_MESSAGE_READY:
      return {
        ...base,
        roomId: sanitizeChannelPart(input.roomId || input.conversationId, 'global'),
        message: safeString(input.message || input.text, limits.maxMessageLength),
        languageHint: safeString(input.languageHint || input.sourceLanguage, 16).toLowerCase(),
        anonymous: input.anonymous !== false,
        sourceLanguage: safeString(input.sourceLanguage, 16).toLowerCase(),
        targetLanguage: safeString(input.targetLanguage, 16).toLowerCase(),
        silentOversight: true,
        userToUserBoundary: true,
        marionVisibleParticipant: false,
        marionRenderedAsSpeaker: false,
        marionCanPublishToRoom: false,
        marionCanAppearInUserRoster: false,
        publicUsersMayAddressMarion: false,
        visibleToUsers: false
      };

    case EVENT_TYPES.ROOM_MESSAGE_READY:
    case EVENT_TYPES.ROOM_MESSAGE_SENT:
      return {
        ...base,
        roomId: sanitizeChannelPart(input.roomId, 'global'),
        message: safeString(input.message, limits.maxMessageLength),
        languageHint: safeString(input.languageHint, 16).toLowerCase(),
        anonymous: input.anonymous !== false,
        ...phase2bBoundary()
      };

    case EVENT_TYPES.TRANSLATION_SESSION_STARTED:
      return {
        ...base,
        sessionId: sanitizeChannelPart(input.sessionId, 'session'),
        languagePair: normalizeLanguagePair(input.languagePair),
        region: safeString(input.region, limits.maxRegionLength)
      };

    case EVENT_TYPES.TRANSLATION_MESSAGE_READY:
    case EVENT_TYPES.TRANSLATION_MESSAGE_SENT:
      return {
        ...base,
        sessionId: sanitizeChannelPart(input.sessionId, 'session'),
        message: safeString(input.message, limits.maxMessageLength),
        languagePair: normalizeLanguagePair(input.languagePair),
        direction: safeString(input.direction, 24).toLowerCase(),
        ...phase2bBoundary()
      };

    case EVENT_TYPES.DELIVERED_MESSAGE_READY:
      return {
        ...base,
        roomId: sanitizeChannelPart(input.roomId || input.deliveryId, 'delivered'),
        message: safeString(input.message || input.text, limits.maxMessageLength),
        languageHint: safeString(input.languageHint || input.sourceLanguage, 16).toLowerCase(),
        anonymous: true,
        sourceLanguage: safeString(input.sourceLanguage, 16).toLowerCase(),
        targetLanguage: safeString(input.targetLanguage, 16).toLowerCase(),
        silentOversight: true,
        userToUserBoundary: true,
        marionVisibleParticipant: false,
        marionRenderedAsSpeaker: false,
        marionCanPublishToRoom: false,
        marionCanAppearInUserRoster: false,
        publicUsersMayAddressMarion: false,
        visibleToUsers: false
      };

    case EVENT_TYPES.TRANSLATION_SESSION_ENDED:
      return {
        ...base,
        sessionId: sanitizeChannelPart(input.sessionId, 'session'),
        reason: safeString(input.reason || 'ended', 80)
      };

    case EVENT_TYPES.USER_PRESENCE_UPDATED:
      return {
        ...base,
        status: safeString(input.status || 'active', 40),
        region: safeString(input.region, limits.maxRegionLength),
        languageHint: safeString(input.languageHint, 16).toLowerCase(),
        anonymous: true,
        ...phase2bBoundary()
      };

    case EVENT_TYPES.TELEMETRY_EVENT:
      return {
        ...base,
        name: safeString(input.name, 80),
        lane: safeString(input.lane || 'ui', 40),
        anonymous: true,
        ...phase2bBoundary()
      };

    case EVENT_TYPES.CONNECTION_READY:
    case EVENT_TYPES.CONNECTION_FALLBACK:
    case EVENT_TYPES.CONNECTION_ERROR:
    case EVENT_TYPES.CONNECTION_CLOSED:
      return {
        ...base,
        reason: safeString(input.reason, 160)
      };

    default:
      return null;
  }
}

function isPublishableEvent(event) {
  if (!event || !ALLOWED_EVENT_TYPES.has(event.type)) return false;

  if (
    event.type === EVENT_TYPES.ROOM_MESSAGE_SENT ||
    event.type === EVENT_TYPES.ROOM_MESSAGE_READY ||
    event.type === EVENT_TYPES.ONE_TO_ONE_MESSAGE_READY ||
    event.type === EVENT_TYPES.TRANSLATION_MESSAGE_SENT ||
    event.type === EVENT_TYPES.TRANSLATION_MESSAGE_READY ||
    event.type === EVENT_TYPES.DELIVERED_MESSAGE_READY
  ) {
    return Boolean(event.message);
  }

  if (event.type === EVENT_TYPES.GLOBE_REGION_SELECTED) {
    return Boolean(event.region);
  }

  if (event.type === EVENT_TYPES.GLOBE_CITY_SELECTED) {
    return Boolean(event.region || event.city);
  }

  return true;
}

class LingoSentinelRealtimeBridge {
  constructor(options = {}) {
    this.namespace = sanitizeChannelPart(options.namespace, DEFAULT_NAMESPACE);
    this.Ably = options.Ably || null;
    this.ablyKey = options.ablyKey || null;
    this.authUrl = options.authUrl || null;
    this.clientId = options.clientId || makeLocalClientId('lingosentinel');
    this.logger = options.logger || createNoopLogger();
    this.limits = { ...DEFAULT_LIMITS, ...(options.limits || {}) };

    this.client = null;
    this.connected = false;
    this.fallback = true;
    this.destroyed = false;

    this.channels = new Map();
    this.handlers = new Map();
    this.localListeners = new Map();

    this.lastPublishAt = {
      globe: 0,
      presence: 0,
      telemetry: 0
    };
  }

  async connect() {
    if (this.destroyed) return this.status();

    if (!this.Ably && typeof globalThis !== 'undefined') {
      this.Ably = globalThis.Ably || null;
    }

    if (!this.Ably || !this.Ably.Realtime) {
      this.fallback = true;
      this.connected = false;
      this.emitLocal(EVENT_TYPES.CONNECTION_FALLBACK, {
        type: EVENT_TYPES.CONNECTION_FALLBACK,
        reason: 'Ably SDK unavailable',
        timestamp: now()
      });
      return this.status();
    }

    try {
      const config = {
        clientId: this.clientId
      };

      if (this.authUrl) {
        config.authUrl = this.authUrl;
      } else if (this.ablyKey) {
        config.key = this.ablyKey;
      }

      if (!config.authUrl && !config.key) {
        this.fallback = true;
        this.connected = false;
        this.emitLocal(EVENT_TYPES.CONNECTION_FALLBACK, {
          type: EVENT_TYPES.CONNECTION_FALLBACK,
          reason: 'No Ably authUrl or key provided',
          timestamp: now()
        });
        return this.status();
      }

      this.client = new this.Ably.Realtime(config);

      if (this.client.connection && this.client.connection.on) {
        this.client.connection.on('connected', () => {
          this.connected = true;
          this.fallback = false;
          this.emitLocal(EVENT_TYPES.CONNECTION_READY, {
            type: EVENT_TYPES.CONNECTION_READY,
            timestamp: now()
          });
        });

        this.client.connection.on('failed', stateChange => {
          this.connected = false;
          this.fallback = true;
          this.emitLocal(EVENT_TYPES.CONNECTION_ERROR, {
            type: EVENT_TYPES.CONNECTION_ERROR,
            reason: stateChange && stateChange.reason ? String(stateChange.reason) : 'Connection failed',
            timestamp: now()
          });
        });

        this.client.connection.on('closed', () => {
          this.connected = false;
          this.fallback = true;
          this.emitLocal(EVENT_TYPES.CONNECTION_CLOSED, {
            type: EVENT_TYPES.CONNECTION_CLOSED,
            reason: 'Connection closed',
            timestamp: now()
          });
        });
      }

      this.fallback = false;
      return this.status();
    } catch (error) {
      this.connected = false;
      this.fallback = true;
      this.logger.warn('[LingoSentinelRealtimeBridge] Falling back locally:', error);
      this.emitLocal(EVENT_TYPES.CONNECTION_ERROR, {
        type: EVENT_TYPES.CONNECTION_ERROR,
        reason: error && error.message ? error.message : 'Unknown connection error',
        timestamp: now()
      });
      return this.status();
    }
  }

  status() {
    return {
      namespace: this.namespace,
      clientId: this.clientId,
      connected: safeBoolean(this.connected),
      fallback: safeBoolean(this.fallback),
      destroyed: safeBoolean(this.destroyed),
      boundary: phase2bBoundary()
    };
  }

  getChannel(lane, id) {
    const name = buildChannelName(this.namespace, lane, id);

    if (this.channels.has(name)) return this.channels.get(name);

    if (!this.client || !this.client.channels || !this.client.channels.get) {
      return null;
    }

    const channel = this.client.channels.get(name);
    this.channels.set(name, channel);
    return channel;
  }

  on(type, callback) {
    const eventType = safeString(type, 80);

    if (!ALLOWED_EVENT_TYPES.has(eventType) || typeof callback !== 'function') {
      return () => {};
    }

    if (!this.localListeners.has(eventType)) {
      this.localListeners.set(eventType, new Set());
    }

    this.localListeners.get(eventType).add(callback);

    return () => {
      const listeners = this.localListeners.get(eventType);
      if (listeners) listeners.delete(callback);
    };
  }

  emitLocal(type, event) {
    const sanitized = sanitizeEvent({ ...event, type }, this.limits);
    if (!sanitized) return;

    const listeners = this.localListeners.get(type);
    if (!listeners || !listeners.size) return;

    listeners.forEach(callback => {
      try {
        callback(sanitized);
      } catch (error) {
        this.logger.warn('[LingoSentinelRealtimeBridge] Local listener failed:', error);
      }
    });
  }

  shouldThrottle(lane, ms) {
    const current = now();
    const last = this.lastPublishAt[lane] || 0;

    if (current - last < ms) return true;

    this.lastPublishAt[lane] = current;
    return false;
  }

  async publish(channel, eventName, event) {
    const sanitized = sanitizeEvent(event, this.limits);

    if (!isPublishableEvent(sanitized)) return false;

    if (this.fallback || !channel || !channel.publish) {
      this.emitLocal(sanitized.type, sanitized);
      return false;
    }

    try {
      await channel.publish(eventName, sanitized);
      this.emitLocal(sanitized.type, sanitized);
      return true;
    } catch (error) {
      this.logger.warn('[LingoSentinelRealtimeBridge] Publish failed:', error);
      this.fallback = true;
      this.emitLocal(EVENT_TYPES.CONNECTION_ERROR, {
        type: EVENT_TYPES.CONNECTION_ERROR,
        reason: error && error.message ? error.message : 'Publish failed',
        timestamp: now()
      });
      this.emitLocal(sanitized.type, sanitized);
      return false;
    }
  }

  async publishGlobeEvent(event) {
    const sanitized = sanitizeEvent(event, this.limits);

    if (!sanitized) return false;

    if (this.shouldThrottle(CHANNELS.globe, this.limits.globePublishMs)) {
      return false;
    }

    const channel = this.getChannel(CHANNELS.globe);

    return this.publish(channel, sanitized.type, sanitized);
  }

  async publishDirectMessage(roomId, message, metadata = {}) {
    const cleanRoomId = sanitizeChannelPart(roomId, 'global');
    const channel = this.getChannel(CHANNELS.direct, cleanRoomId);

    return this.publish(channel, EVENT_TYPES.ONE_TO_ONE_MESSAGE_READY, {
      type: EVENT_TYPES.ONE_TO_ONE_MESSAGE_READY,
      roomId: cleanRoomId,
      message,
      languageHint: metadata.languageHint || metadata.sourceLanguage,
      sourceLanguage: metadata.sourceLanguage,
      targetLanguage: metadata.targetLanguage,
      anonymous: metadata.anonymous !== false,
      timestamp: now()
    });
  }

  async publishDeliveredMessage(roomId, message, metadata = {}) {
    const cleanRoomId = sanitizeChannelPart(roomId, 'delivered');
    const channel = this.getChannel(CHANNELS.delivered, cleanRoomId);

    return this.publish(channel, EVENT_TYPES.DELIVERED_MESSAGE_READY, {
      type: EVENT_TYPES.DELIVERED_MESSAGE_READY,
      roomId: cleanRoomId,
      message,
      languageHint: metadata.languageHint || metadata.sourceLanguage,
      sourceLanguage: metadata.sourceLanguage,
      targetLanguage: metadata.targetLanguage,
      anonymous: true,
      timestamp: now()
    });
  }

  async publishApprovedMessage(publishInput = {}) {
    if (eventHasPublicMarionIdentity(publishInput) || eventHasPublicMarionIdentity(publishInput.sender) || eventHasPublicMarionIdentity(publishInput.recipient)) return false;
    const mode = safeString(publishInput.mode || 'one_to_one', 40);
    const roomId = publishInput.roomId || publishInput.route?.roomId || 'global';
    const message = publishInput.text || publishInput.message || '';
    const metadata = {
      languageHint: publishInput.sourceLanguage,
      sourceLanguage: publishInput.sourceLanguage,
      targetLanguage: publishInput.targetLanguage,
      languagePair: publishInput.languagePair,
      region: publishInput.route?.globeContext?.region,
      direction: publishInput.sourceLanguage && publishInput.targetLanguage ? `${publishInput.sourceLanguage}_to_${publishInput.targetLanguage}` : ''
    };

    if (mode === 'group_room') return this.publishRoomMessage(roomId, message, metadata);
    if (mode === 'live_translate') return this.publishTranslationMessage(publishInput.route?.sessionId || roomId, message, metadata);
    if (mode === 'delivered') return this.publishDeliveredMessage(roomId, message, metadata);
    return this.publishDirectMessage(roomId, message, metadata);
  }

  async publishRoomMessage(roomId, message, metadata = {}) {
    const cleanRoomId = sanitizeChannelPart(roomId, 'global');
    const channel = this.getChannel(CHANNELS.room, cleanRoomId);

    return this.publish(channel, EVENT_TYPES.ROOM_MESSAGE_READY, {
      type: EVENT_TYPES.ROOM_MESSAGE_READY,
      roomId: cleanRoomId,
      message,
      languageHint: metadata.languageHint,
      anonymous: metadata.anonymous !== false,
      timestamp: now()
    });
  }

  async publishRoomJoined(roomId, metadata = {}) {
    const cleanRoomId = sanitizeChannelPart(roomId, 'global');
    const channel = this.getChannel(CHANNELS.room, cleanRoomId);

    return this.publish(channel, EVENT_TYPES.ROOM_JOINED, {
      type: EVENT_TYPES.ROOM_JOINED,
      roomId: cleanRoomId,
      region: metadata.region,
      languageHint: metadata.languageHint,
      anonymous: true,
      timestamp: now()
    });
  }

  async publishRoomLeft(roomId, metadata = {}) {
    const cleanRoomId = sanitizeChannelPart(roomId, 'global');
    const channel = this.getChannel(CHANNELS.room, cleanRoomId);

    return this.publish(channel, EVENT_TYPES.ROOM_LEFT, {
      type: EVENT_TYPES.ROOM_LEFT,
      roomId: cleanRoomId,
      region: metadata.region,
      languageHint: metadata.languageHint,
      anonymous: true,
      timestamp: now()
    });
  }

  async publishTranslationStarted(sessionId, metadata = {}) {
    const cleanSessionId = sanitizeChannelPart(sessionId, 'session');
    const channel = this.getChannel(CHANNELS.translation, cleanSessionId);

    return this.publish(channel, EVENT_TYPES.TRANSLATION_SESSION_STARTED, {
      type: EVENT_TYPES.TRANSLATION_SESSION_STARTED,
      sessionId: cleanSessionId,
      languagePair: metadata.languagePair,
      region: metadata.region,
      timestamp: now()
    });
  }

  async publishTranslationMessage(sessionId, message, metadata = {}) {
    const cleanSessionId = sanitizeChannelPart(sessionId, 'session');
    const channel = this.getChannel(CHANNELS.translation, cleanSessionId);

    return this.publish(channel, EVENT_TYPES.TRANSLATION_MESSAGE_READY, {
      type: EVENT_TYPES.TRANSLATION_MESSAGE_READY,
      sessionId: cleanSessionId,
      message,
      languagePair: metadata.languagePair,
      direction: metadata.direction,
      timestamp: now()
    });
  }

  async publishTranslationEnded(sessionId, reason) {
    const cleanSessionId = sanitizeChannelPart(sessionId, 'session');
    const channel = this.getChannel(CHANNELS.translation, cleanSessionId);

    return this.publish(channel, EVENT_TYPES.TRANSLATION_SESSION_ENDED, {
      type: EVENT_TYPES.TRANSLATION_SESSION_ENDED,
      sessionId: cleanSessionId,
      reason,
      timestamp: now()
    });
  }

  async publishPresence(metadata = {}) {
    if (eventHasPublicMarionIdentity(metadata)) return false;
    if (this.shouldThrottle(CHANNELS.presence, this.limits.presencePublishMs)) {
      return false;
    }

    const channel = this.getChannel(CHANNELS.presence);

    const event = sanitizeEvent(
      {
        type: EVENT_TYPES.USER_PRESENCE_UPDATED,
        status: metadata.status || 'active',
        region: metadata.region,
        languageHint: metadata.languageHint,
        anonymous: true,
        timestamp: now()
      },
      this.limits
    );

    if (!event) return false;

    if (this.fallback || !channel || !channel.presence || !channel.presence.enter) {
      this.emitLocal(EVENT_TYPES.USER_PRESENCE_UPDATED, event);
      return false;
    }

    try {
      await channel.presence.enter(event);
      this.emitLocal(EVENT_TYPES.USER_PRESENCE_UPDATED, event);
      return true;
    } catch (error) {
      this.logger.warn('[LingoSentinelRealtimeBridge] Presence enter failed:', error);
      this.fallback = true;
      this.emitLocal(EVENT_TYPES.USER_PRESENCE_UPDATED, event);
      return false;
    }
  }

  async publishTelemetry(name, metadata = {}) {
    if (this.shouldThrottle(CHANNELS.telemetry, this.limits.telemetryPublishMs)) {
      return false;
    }

    const channel = this.getChannel(CHANNELS.telemetry);

    return this.publish(channel, EVENT_TYPES.TELEMETRY_EVENT, {
      type: EVENT_TYPES.TELEMETRY_EVENT,
      name,
      lane: metadata.lane || 'ui',
      anonymous: true,
      timestamp: now()
    });
  }

  async subscribeGlobe(callback) {
    return this.subscribe(CHANNELS.globe, null, callback);
  }

  async subscribeDirect(roomId, callback) {
    return this.subscribe(CHANNELS.direct, sanitizeChannelPart(roomId, 'global'), callback);
  }

  async subscribeDelivered(roomId, callback) {
    return this.subscribe(CHANNELS.delivered, sanitizeChannelPart(roomId, 'delivered'), callback);
  }

  async subscribeRoom(roomId, callback) {
    return this.subscribe(CHANNELS.room, sanitizeChannelPart(roomId, 'global'), callback);
  }

  async subscribeTranslation(sessionId, callback) {
    return this.subscribe(CHANNELS.translation, sanitizeChannelPart(sessionId, 'session'), callback);
  }

  async subscribePresence(callback) {
    const channel = this.getChannel(CHANNELS.presence);

    if (typeof callback !== 'function') return () => {};

    if (this.fallback || !channel || !channel.presence || !channel.presence.subscribe) {
      return this.on(EVENT_TYPES.USER_PRESENCE_UPDATED, callback);
    }

    const wrapped = member => {
      const data = member && member.data ? member.data : member;
      const sanitized = sanitizeEvent(
        {
          ...(isObject(data) ? data : {}),
          type: EVENT_TYPES.USER_PRESENCE_UPDATED,
          timestamp: data && data.timestamp ? data.timestamp : now()
        },
        this.limits
      );

      if (sanitized) callback(sanitized);
    };

    try {
      await channel.presence.subscribe(wrapped);
      return () => {
        if (channel.presence && channel.presence.unsubscribe) {
          channel.presence.unsubscribe(wrapped);
        }
      };
    } catch (error) {
      this.logger.warn('[LingoSentinelRealtimeBridge] Presence subscribe failed:', error);
      return this.on(EVENT_TYPES.USER_PRESENCE_UPDATED, callback);
    }
  }

  async subscribe(lane, id, callback) {
    const channel = this.getChannel(lane, id);

    if (typeof callback !== 'function') return () => {};

    if (this.fallback || !channel || !channel.subscribe) {
      return this.onAnyLane(callback);
    }

    const wrapped = message => {
      const data = message && message.data ? message.data : message;
      const sanitized = sanitizeEvent(data, this.limits);
      if (sanitized) callback(sanitized);
    };

    try {
      await channel.subscribe(wrapped);

      const key = `${buildChannelName(this.namespace, lane, id)}:${Math.random()
        .toString(36)
        .slice(2)}`;

      this.handlers.set(key, { channel, wrapped });

      return () => {
        try {
          if (channel.unsubscribe) channel.unsubscribe(wrapped);
        } catch (error) {
          this.logger.warn('[LingoSentinelRealtimeBridge] Unsubscribe failed:', error);
        }

        this.handlers.delete(key);
      };
    } catch (error) {
      this.logger.warn('[LingoSentinelRealtimeBridge] Subscribe failed:', error);
      return this.onAnyLane(callback);
    }
  }

  onAnyLane(callback) {
    const unsubscribers = Array.from(ALLOWED_EVENT_TYPES).map(type => this.on(type, callback));

    return () => {
      unsubscribers.forEach(unsubscribe => unsubscribe());
    };
  }

  async leavePresence(metadata = {}) {
    const channel = this.getChannel(CHANNELS.presence);

    if (!channel || !channel.presence || !channel.presence.leave) {
      return false;
    }

    try {
      await channel.presence.leave({
        status: 'inactive',
        reason: safeString(metadata.reason || 'left', 80),
        anonymous: true,
        timestamp: now()
      });
      return true;
    } catch (error) {
      this.logger.warn('[LingoSentinelRealtimeBridge] Presence leave failed:', error);
      return false;
    }
  }

  async disconnect() {
    this.destroyed = true;

    try {
      await this.leavePresence({ reason: 'bridge_disconnect' });
    } catch (_) {
      // Safe no-op.
    }

    this.handlers.forEach(({ channel, wrapped }) => {
      try {
        if (channel && channel.unsubscribe) channel.unsubscribe(wrapped);
      } catch (_) {
        // Safe no-op.
      }
    });

    this.handlers.clear();
    this.localListeners.clear();

    if (this.client && this.client.close) {
      try {
        this.client.close();
      } catch (_) {
        // Safe no-op.
      }
    }

    this.connected = false;
    this.fallback = true;

    return this.status();
  }
}

module.exports = {
  LingoSentinelRealtimeBridge,
  EVENT_TYPES,
  CHANNELS,
  sanitizeEvent,
  buildChannelName,
  phase2bBoundary,
  eventHasPublicMarionIdentity,
  isReservedMarionIdentity,
  PHASE2B_USER_BOUNDARY_VERSION
};

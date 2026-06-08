'use strict';

/**
 * LingoSentinelEngine
 * ------------------------------------------------------------
 * Backend/runtime publishing engine for LingoSentinel.
 *
 * Purpose:
 * - Accept only gateway-governed LingoSentinel traffic.
 * - Route 1:1, Group Room, Live Translate, and Delivered lanes to Ably.
 * - Keep root/API keys backend-only and out of payloads/results.
 * - Support dry-run and mock-client testing without touching Ably.
 * - Return Marion-safe telemetry and structured failure states.
 *
 * Architectural boundary:
 * - LingoSentinelLinkGateway prepares, governs, and routes.
 * - This engine publishes gateway-approved payloads only.
 * - This engine does NOT decide Marion authority.
 * - This engine does NOT perform final translation authority.
 * - This engine does NOT expose private form data, emails, tokens, or API keys.
 *
 * Required backend/runtime environment variable for live publishing:
 * - ABLY_ROOT_API_KEY
 *
 * Optional environment variables:
 * - ABLY_API_KEY                 fallback only; prefer ABLY_ROOT_API_KEY
 * - LINGOSENTINEL_CLIENT_ID
 * - LINGOSENTINEL_TIMEOUT_MS
 *
 * File path:
 * Data/marion/runtime/LingoSentinelEngine.js
 */

const DEFAULT_CLIENT_ID = 'marion-lingosentinel-engine';
const DEFAULT_TIMEOUT_MS = 6500;
const DEFAULT_ROOM_ID = 'lingosentinel-main';
const DEFAULT_NAMESPACE = 'lingosentinel';
const ENGINE_NAME = 'LingoSentinelEngine';
const ENGINE_VERSION = '1.2.0';
const PAYLOAD_SHAPE = 'lingosentinel.signal';

let cachedAbly = null;
let cachedGateway = null;
let cachedAdaptiveLayer = undefined;
let cachedSignalEnvelope = undefined;

function nowIso() {
  return new Date().toISOString();
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function safeString(value, fallback = '', maxLength = 4000) {
  if (value === null || value === undefined) return fallback;
  const text = typeof value === 'string' ? value : String(value);
  const trimmed = text.trim();
  return (trimmed || fallback).slice(0, maxLength);
}

function toNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeToken(value, fallback = 'default') {
  const raw = safeString(value, fallback, 128);
  const cleaned = raw
    .replace(/[^a-zA-Z0-9:_-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  return cleaned || fallback;
}

function getTimeoutMs(options = {}) {
  return toNumber(
    options.timeoutMs || process.env.LINGOSENTINEL_TIMEOUT_MS,
    DEFAULT_TIMEOUT_MS
  );
}

function getAblyKey(options = {}) {
  return (
    safeString(options.ablyKey, '', 4096) ||
    safeString(process.env.ABLY_ROOT_API_KEY, '', 4096) ||
    safeString(process.env.ABLY_API_KEY, '', 4096)
  );
}

function getClientId(options = {}) {
  return (
    safeString(options.clientId, '', 128) ||
    safeString(process.env.LINGOSENTINEL_CLIENT_ID, '', 128) ||
    DEFAULT_CLIENT_ID
  );
}

function loadOptionalModule(path) {
  try {
    return require(path);
  } catch (_) {
    return null;
  }
}

function getGateway() {
  if (cachedGateway) return cachedGateway;

  cachedGateway = require('./LingoSentinelLinkGateway');

  if (!cachedGateway || typeof cachedGateway.prepareLingoSentinelPublish !== 'function') {
    const error = new Error('LingoSentinelLinkGateway is missing prepareLingoSentinelPublish().');
    error.code = 'LINGOSENTINEL_GATEWAY_INVALID';
    throw error;
  }

  return cachedGateway;
}

function getAdaptiveLayer() {
  if (cachedAdaptiveLayer !== undefined) return cachedAdaptiveLayer;
  cachedAdaptiveLayer = loadOptionalModule('./ADLYAdaptiveLanguageLayer');
  return cachedAdaptiveLayer;
}

function getSignalEnvelope() {
  if (cachedSignalEnvelope !== undefined) return cachedSignalEnvelope;
  cachedSignalEnvelope = loadOptionalModule('./LingoSentinelSignalEnvelope');
  return cachedSignalEnvelope;
}

function loadAblyPackage() {
  try {
    return require('ably');
  } catch (error) {
    const missing = new Error('Ably package is not installed. Run: npm install ably');
    missing.code = 'ABLY_PACKAGE_MISSING';
    missing.cause = error;
    throw missing;
  }
}

function createAblyClient(options = {}) {
  const key = getAblyKey(options);

  if (!key) {
    const error = new Error(
      'Missing Ably API key. Set ABLY_ROOT_API_KEY in the backend/runtime environment.'
    );
    error.code = 'ABLY_KEY_MISSING';
    throw error;
  }

  const Ably = options.Ably || loadAblyPackage();

  return new Ably.Realtime({
    key,
    clientId: getClientId(options),
    echoMessages: false,
    autoConnect: true
  });
}

function getAblyClient(options = {}) {
  if (options.client) return options.client;

  if (!cachedAbly || options.forceNewClient) {
    cachedAbly = createAblyClient(options);
  }

  return cachedAbly;
}

function detachConnectionHandler(client, handler) {
  if (!client || !client.connection || !handler) return;

  try {
    if (typeof client.connection.off === 'function') {
      client.connection.off(handler);
      return;
    }

    if (typeof client.connection.removeListener === 'function') {
      client.connection.removeListener(handler);
    }
  } catch (_) {
    // Safe no-op. Different Ably/mock versions expose different detach APIs.
  }
}

function waitForConnection(client, timeoutMs = DEFAULT_TIMEOUT_MS) {
  if (!client || !client.connection) {
    const error = new Error('Invalid Ably client.');
    error.code = 'ABLY_CLIENT_INVALID';
    return Promise.reject(error);
  }

  const state = client.connection.state;

  if (state === 'connected') {
    return Promise.resolve({ state: 'connected', connectedAt: nowIso() });
  }

  if (state === 'failed') {
    const error = new Error('Ably connection is already failed.');
    error.code = 'ABLY_CONNECTION_FAILED';
    return Promise.reject(error);
  }

  return new Promise((resolve, reject) => {
    let settled = false;

    const timeout = setTimeout(() => {
      cleanup();
      const error = new Error('Ably connection timeout.');
      error.code = 'ABLY_CONNECTION_TIMEOUT';
      reject(error);
    }, timeoutMs);

    function cleanup() {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      detachConnectionHandler(client, handleConnectionChange);
    }

    function handleConnectionChange(stateChange = {}) {
      const current = stateChange.current || client.connection.state;

      if (current === 'connected') {
        cleanup();
        resolve({ state: 'connected', connectedAt: nowIso() });
        return;
      }

      if (current === 'failed' || current === 'suspended') {
        cleanup();
        const error = new Error(
          `Ably connection ${current}: ${
            stateChange.reason && stateChange.reason.message
              ? stateChange.reason.message
              : 'No reason provided.'
          }`
        );
        error.code = current === 'failed'
          ? 'ABLY_CONNECTION_FAILED'
          : 'ABLY_CONNECTION_SUSPENDED';
        reject(error);
      }
    }

    try {
      client.connection.on(handleConnectionChange);
    } catch (error) {
      cleanup();
      error.code = error.code || 'ABLY_CONNECTION_WATCH_FAILED';
      reject(error);
    }
  });
}

function normalizeMode(mode) {
  const gateway = getGateway();

  if (typeof gateway.normalizeMode === 'function') {
    return gateway.normalizeMode(mode || 'one_to_one') || 'one_to_one';
  }

  const aliases = {
    one: 'one_to_one',
    one_to_one: 'one_to_one',
    direct: 'one_to_one',
    dm: 'one_to_one',
    group: 'group_room',
    group_room: 'group_room',
    room: 'group_room',
    live: 'live_translate',
    live_translate: 'live_translate',
    translate: 'live_translate',
    delivered: 'delivered',
    delivery: 'delivered',
    receipt: 'delivered'
  };

  return aliases[safeString(mode || 'one_to_one')] || 'one_to_one';
}

function buildEngineInput(input = {}) {
  const sender = input.sender || input.from || {
    id: input.senderId || input.userId || input.clientId || 'anonymous',
    name: input.senderName || input.name || 'Guest',
    role: input.senderRole || 'participant',
    preferredLanguage: input.sourceLanguage || input.language || input.lang || 'en'
  };

  return {
    ...input,
    id: input.id,
    text: input.text || input.message || input.body,
    mode: normalizeMode(input.mode || input.lane || 'one_to_one'),
    roomId: input.roomId || input.channelId || input.conversationId || input.sessionId || DEFAULT_ROOM_ID,
    sender,
    recipient: input.recipient || input.to || null,
    sourceLanguage: input.sourceLanguage || input.language || input.lang || sender.preferredLanguage || 'en',
    targetLanguage: input.targetLanguage || input.targetLang || input.recipientLanguage,
    recipientLanguage: input.recipientLanguage,
    languagePair: input.languagePair,
    metadata: isObject(input.metadata) ? input.metadata : {},
    tags: Array.isArray(input.tags) ? input.tags : [],
    traceId: input.traceId,
    correlationId: input.correlationId || input.id,
    source: input.source || 'lingosentinel-engine',
    requiresReview: input.requiresReview,
    privateSignal: input.privateSignal,
    riskLevel: input.riskLevel,
    confidence: input.confidence
  };
}

function prepareThroughGateway(input = {}) {
  const gateway = getGateway();
  return gateway.prepareLingoSentinelPublish(buildEngineInput(input));
}

function normalizeLanguagePair(publishInput = {}) {
  if (publishInput.languagePair && publishInput.languagePair.source && publishInput.languagePair.target) {
    return {
      source: safeString(publishInput.languagePair.source, 'en', 16).toLowerCase(),
      target: safeString(publishInput.languagePair.target, 'en', 16).toLowerCase()
    };
  }

  return {
    source: safeString(publishInput.sourceLanguage, 'en', 16).toLowerCase(),
    target: safeString(publishInput.targetLanguage, 'en', 16).toLowerCase()
  };
}

function fallbackRoute(publishInput = {}) {
  const mode = normalizeMode(publishInput.mode || 'one_to_one');
  const roomId = normalizeToken(publishInput.roomId || DEFAULT_ROOM_ID, DEFAULT_ROOM_ID);
  const sessionId = normalizeToken(publishInput.sessionId || roomId, roomId);

  if (mode === 'group_room') {
    return {
      lane: 'room',
      eventType: 'ROOM_MESSAGE_READY',
      roomId,
      sessionId: null,
      ablyChannel: `${DEFAULT_NAMESPACE}:room:${roomId}`
    };
  }

  if (mode === 'live_translate') {
    return {
      lane: 'translation',
      eventType: 'TRANSLATION_MESSAGE_READY',
      roomId,
      sessionId,
      ablyChannel: `${DEFAULT_NAMESPACE}:translation:${sessionId}`
    };
  }

  if (mode === 'delivered') {
    return {
      lane: 'delivered',
      eventType: 'DELIVERED_MESSAGE_READY',
      roomId,
      sessionId: null,
      ablyChannel: `${DEFAULT_NAMESPACE}:delivered:${roomId}`
    };
  }

  return {
    lane: 'direct',
    eventType: 'ONE_TO_ONE_MESSAGE_READY',
    roomId,
    sessionId: null,
    ablyChannel: `${DEFAULT_NAMESPACE}:direct:${roomId}`
  };
}

function buildCanonicalSignal(gatewayResult = {}) {
  const publishInput = gatewayResult.publishInput || {};
  const route = publishInput.route || fallbackRoute(publishInput);
  const languagePair = normalizeLanguagePair(publishInput);
  const signalId = safeString(publishInput.id, '', 128) || safeString(gatewayResult.telemetry && gatewayResult.telemetry.traceId, '', 128) || `lss_${Date.now()}`;

  return {
    id: signalId,
    type: route.eventType,
    schema: PAYLOAD_SHAPE,
    engine: ENGINE_NAME,
    engineVersion: ENGINE_VERSION,
    text: publishInput.text,
    mode: publishInput.mode,
    room: {
      id: publishInput.roomId,
      mode: publishInput.mode,
      lane: route.lane,
      sessionId: route.sessionId || null
    },
    sender: publishInput.sender,
    recipient: publishInput.recipient || null,
    language: {
      source: publishInput.sourceLanguage || languagePair.source,
      target: publishInput.targetLanguage || languagePair.target,
      recipient: publishInput.recipientLanguage || languagePair.target,
      pair: languagePair
    },
    delivery: {
      channel: route.ablyChannel,
      eventName: route.eventType,
      lane: route.lane,
      dryRunnable: true
    },
    metadata: {
      ...(isObject(publishInput.metadata) ? publishInput.metadata : {}),
      engine: ENGINE_NAME,
      engineVersion: ENGINE_VERSION,
      payloadShape: PAYLOAD_SHAPE
    },
    governance: publishInput.governance || gatewayResult.governance || {
      marionAuthority: true,
      decision: 'allow'
    },
    telemetry: {
      ...(gatewayResult.telemetry || {}),
      engine: ENGINE_NAME,
      engineVersion: ENGINE_VERSION,
      lane: route.lane,
      eventType: route.eventType,
      timestamp: nowIso(),
      marionAuthority: true
    }
  };
}

function tryBuildAdaptiveEnvelope(signal, publishInput) {
  const layer = getAdaptiveLayer();
  const envelope = getSignalEnvelope();

  if (!layer || !envelope) return null;
  if (typeof layer.adaptForPublish !== 'function') return null;
  if (typeof envelope.fromAdaptiveEnvelope !== 'function') return null;

  try {
    const adaptive = layer.adaptForPublish(publishInput);

    if (!adaptive || !adaptive.ok) {
      return {
        ok: false,
        stage: 'adaptive_validation',
        adaptive,
        errors: adaptive && adaptive.errors && adaptive.errors.length
          ? adaptive.errors
          : ['Adaptive language plan failed.']
      };
    }

    const signalPlan = envelope.fromAdaptiveEnvelope(adaptive);

    if (!signalPlan || !signalPlan.ok) {
      return {
        ok: false,
        stage: 'signal_validation',
        adaptive,
        signal: signalPlan && signalPlan.signal,
        errors: signalPlan && signalPlan.errors && signalPlan.errors.length
          ? signalPlan.errors
          : ['Signal envelope validation failed.']
      };
    }

    return {
      ok: true,
      stage: 'adaptive_ready',
      adaptive,
      signal: signalPlan.signal || signal,
      publish: signalPlan.publish || null,
      errors: []
    };
  } catch (error) {
    return {
      ok: false,
      stage: 'adaptive_exception',
      errors: [error.message || 'Adaptive signal preparation failed.']
    };
  }
}

function buildSignalPlan(input = {}) {
  const gatewayResult = prepareThroughGateway(input);

  if (!gatewayResult.ok) {
    return {
      ok: false,
      stage: gatewayResult.telemetry && gatewayResult.telemetry.stage
        ? gatewayResult.telemetry.stage
        : 'gateway_validation',
      gateway: gatewayResult,
      signal: null,
      publish: null,
      errors: gatewayResult.errors && gatewayResult.errors.length
        ? gatewayResult.errors
        : ['Gateway rejected publish input.']
    };
  }

  const signal = buildCanonicalSignal(gatewayResult);
  const route = gatewayResult.publishInput.route || fallbackRoute(gatewayResult.publishInput);
  const adaptivePlan = tryBuildAdaptiveEnvelope(signal, gatewayResult.publishInput);

  if (adaptivePlan && !adaptivePlan.ok) {
    return {
      ...adaptivePlan,
      gateway: gatewayResult,
      publish: null
    };
  }

  const adaptiveSignal = adaptivePlan && adaptivePlan.signal ? adaptivePlan.signal : signal;
  const adaptivePublish = adaptivePlan && adaptivePlan.publish ? adaptivePlan.publish : null;

  return {
    ok: true,
    stage: adaptivePlan ? 'adaptive_ready' : 'gateway_ready',
    gateway: gatewayResult,
    adaptive: adaptivePlan ? adaptivePlan.adaptive : null,
    signal: adaptiveSignal,
    publish: {
      channel: adaptivePublish && adaptivePublish.channel ? adaptivePublish.channel : route.ablyChannel,
      eventName: adaptivePublish && adaptivePublish.eventName ? adaptivePublish.eventName : route.eventType,
      payload: adaptivePublish && adaptivePublish.payload ? adaptivePublish.payload : adaptiveSignal
    },
    errors: []
  };
}

function buildAdaptivePlan(input = {}) {
  const plan = buildSignalPlan(input);

  return {
    ok: plan.ok,
    stage: plan.stage,
    gateway: plan.gateway,
    adaptive: plan.adaptive,
    signal: plan.signal,
    publish: plan.publish,
    errors: plan.errors || []
  };
}

function buildPublishInput(input = {}) {
  const prepared = prepareThroughGateway(input);
  return prepared.ok ? prepared.publishInput : buildEngineInput(input);
}

function validatePublishPlan(plan = {}) {
  if (!plan.ok) {
    return {
      ok: false,
      errors: plan.errors && plan.errors.length ? plan.errors : ['Invalid publish plan.']
    };
  }

  if (!plan.publish || !plan.publish.channel || !plan.publish.eventName || !plan.publish.payload) {
    return {
      ok: false,
      errors: ['Publish plan is missing channel, event name, or payload.']
    };
  }

  const governance = plan.signal && plan.signal.governance;

  if (governance && governance.lingoSentinelAllowed === false) {
    return {
      ok: false,
      errors: ['Gateway governance blocked realtime publishing.']
    };
  }

  return { ok: true, errors: [] };
}

function sanitizeError(error) {
  const message = safeString(error && error.message ? error.message : 'Unknown error.', 'Unknown error.', 300);

  return message
    .replace(/key\s*[:=]\s*[^\s]+/gi, 'key=[redacted]')
    .replace(/token\s*[:=]\s*[^\s]+/gi, 'token=[redacted]')
    .replace(/secret\s*[:=]\s*[^\s]+/gi, 'secret=[redacted]')
    .replace(/bearer\s+[a-z0-9._~+/=-]+/gi, 'bearer [redacted]');
}

function buildValidationFailure(plan, input, startedAt) {
  const gateway = plan.gateway || {};

  return {
    ok: false,
    stage: plan.stage || 'validation',
    errors: plan.errors || ['Validation failed.'],
    mode: normalizeMode(input.mode || input.lane || 'one_to_one'),
    governance: gateway.governance || {
      marionAuthority: true,
      lingoSentinelAllowed: false,
      decision: 'reject'
    },
    telemetry: {
      attemptedAt: nowIso(),
      elapsedMs: Date.now() - startedAt,
      engine: ENGINE_NAME,
      engineVersion: ENGINE_VERSION,
      marionAuthority: true,
      gatewayStage: gateway.telemetry && gateway.telemetry.stage
    }
  };
}

function buildPublishedResult(plan, startedAt, options = {}) {
  const gatewayTelemetry = plan.gateway && plan.gateway.telemetry ? plan.gateway.telemetry : {};
  const signal = plan.signal || {};
  const room = signal.room || {};

  return {
    ok: true,
    stage: 'published',
    channel: plan.publish.channel,
    eventName: plan.publish.eventName,
    signalId: signal.id,
    envelopeId: signal.envelopeId || (plan.adaptive && plan.adaptive.envelope && plan.adaptive.envelope.id) || null,
    mode: signal.mode || room.mode,
    room,
    delivery: signal.delivery || {
      channel: plan.publish.channel,
      eventName: plan.publish.eventName
    },
    language: signal.language,
    governance: signal.governance || (plan.gateway && plan.gateway.governance),
    telemetry: {
      publishedAt: nowIso(),
      elapsedMs: Date.now() - startedAt,
      clientId: getClientId(options),
      engine: ENGINE_NAME,
      engineVersion: ENGINE_VERSION,
      gatewayTraceId: gatewayTelemetry.traceId,
      marionAuthority: true,
      payloadShape: PAYLOAD_SHAPE
    }
  };
}

function buildPublishFailure(error, plan, startedAt, options = {}) {
  return {
    ok: false,
    stage: 'publish_failed',
    channel: plan.publish && plan.publish.channel,
    eventName: plan.publish && plan.publish.eventName,
    signalId: plan.signal && plan.signal.id,
    envelopeId: plan.signal && plan.signal.envelopeId,
    errors: [sanitizeError(error)],
    governance: plan.signal && plan.signal.governance,
    telemetry: {
      failedAt: nowIso(),
      elapsedMs: Date.now() - startedAt,
      code: error && error.code ? error.code : 'ABLY_PUBLISH_FAILED',
      clientId: getClientId(options),
      engine: ENGINE_NAME,
      engineVersion: ENGINE_VERSION,
      marionAuthority: true
    }
  };
}

async function publishMessage(input = {}, options = {}) {
  const startedAt = Date.now();
  const engineInput = buildEngineInput(input);
  const plan = buildSignalPlan(engineInput);
  const validation = validatePublishPlan(plan);

  if (!validation.ok) {
    return buildValidationFailure(
      { ...plan, errors: validation.errors },
      engineInput,
      startedAt
    );
  }

  if (options.dryRun) {
    return {
      ...buildPublishedResult(plan, startedAt, options),
      stage: 'dry_run',
      dryRun: true
    };
  }

  try {
    const client = getAblyClient(options);
    await waitForConnection(client, getTimeoutMs(options));

    if (!client.channels || typeof client.channels.get !== 'function') {
      const error = new Error('Ably client does not expose channels.get().');
      error.code = 'ABLY_CHANNELS_INVALID';
      throw error;
    }

    const channel = client.channels.get(plan.publish.channel);

    if (!channel || typeof channel.publish !== 'function') {
      const error = new Error('Ably channel does not expose publish().');
      error.code = 'ABLY_CHANNEL_INVALID';
      throw error;
    }

    await channel.publish(plan.publish.eventName, plan.publish.payload);

    return buildPublishedResult(plan, startedAt, options);
  } catch (error) {
    return buildPublishFailure(error, plan, startedAt, options);
  }
}

async function publishDirectMessage(input = {}, options = {}) {
  return publishMessage({ ...input, mode: 'one_to_one' }, options);
}

async function publishGroupMessage(input = {}, options = {}) {
  return publishMessage({ ...input, mode: 'group_room' }, options);
}

async function publishLiveTranslateMessage(input = {}, options = {}) {
  return publishMessage({ ...input, mode: 'live_translate' }, options);
}

async function publishDeliveredReceipt(input = {}, options = {}) {
  return publishMessage(
    {
      ...input,
      mode: 'delivered',
      text: input.text || input.message || 'Message delivered.'
    },
    options
  );
}

function routePreview(input = {}) {
  const plan = buildSignalPlan(input);

  return {
    ok: plan.ok,
    stage: plan.stage,
    channel: plan.publish && plan.publish.channel,
    eventName: plan.publish && plan.publish.eventName,
    mode: plan.signal && plan.signal.mode,
    room: plan.signal && plan.signal.room,
    language: plan.signal && plan.signal.language,
    governance: plan.signal && plan.signal.governance,
    errors: plan.errors || [],
    telemetry: {
      engine: ENGINE_NAME,
      engineVersion: ENGINE_VERSION,
      marionAuthority: true,
      payloadShape: PAYLOAD_SHAPE
    }
  };
}

async function closeEngine() {
  if (cachedAbly && typeof cachedAbly.close === 'function') {
    cachedAbly.close();
  }

  cachedAbly = null;

  return {
    ok: true,
    closedAt: nowIso(),
    engine: ENGINE_NAME,
    engineVersion: ENGINE_VERSION
  };
}

function resetEngineForTests() {
  cachedAbly = null;
  cachedGateway = null;
  cachedAdaptiveLayer = undefined;
  cachedSignalEnvelope = undefined;

  return {
    ok: true,
    resetAt: nowIso(),
    engine: ENGINE_NAME
  };
}

function getEngineContract() {
  return {
    engine: ENGINE_NAME,
    version: ENGINE_VERSION,
    payloadShape: PAYLOAD_SHAPE,
    boundaries: {
      consumesGatewayApprovedInput: true,
      publishesRealtime: true,
      performsTranslation: false,
      finalAuthority: 'Marion',
      exposesAblyKey: false
    },
    lanes: {
      one_to_one: 'direct',
      group_room: 'room',
      live_translate: 'translation',
      delivered: 'delivered'
    }
  };
}

module.exports = {
  publishMessage,
  publishDirectMessage,
  publishGroupMessage,
  publishLiveTranslateMessage,
  publishDeliveredReceipt,
  routePreview,
  closeEngine,
  resetEngineForTests,
  getEngineContract,

  // Exposed for tests and regression checks.
  buildEngineInput,
  buildPublishInput,
  buildAdaptivePlan,
  buildSignalPlan,
  validatePublishPlan,
  buildCanonicalSignal,
  fallbackRoute,
  createAblyClient,
  getAblyClient,
  waitForConnection,
  getAblyKey,
  getClientId,
  getTimeoutMs,
  normalizeMode
};

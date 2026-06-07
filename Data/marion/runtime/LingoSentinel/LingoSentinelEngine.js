'use strict';

/**
 * LingoSentinelEngine
 * Backend/runtime publishing engine for LingoSentinel.
 *
 * Critical update pass:
 * - Uses ADLYAdaptiveLanguageLayer for language/pattern adaptation.
 * - Uses LingoSentinelSignalEnvelope for canonical publish signals.
 * - Publishes 1:1, Group Room, Live Translate, and Delivered lanes to Ably.
 * - Keeps Ably/root API keys backend-only.
 * - Supports dry-run tests without touching Ably.
 * - Returns Marion-safe telemetry and structured failure states.
 *
 * Required environment variable:
 * - ABLY_ROOT_API_KEY
 *
 * Optional environment variables:
 * - ABLY_API_KEY
 * - LINGOSENTINEL_CLIENT_ID
 * - LINGOSENTINEL_TIMEOUT_MS
 *
 * File path:
 * Data/marion/runtime/LingoSentinelEngine.js
 */

const ADLYAdaptiveLanguageLayer = require('./ADLYAdaptiveLanguageLayer');
const LingoSentinelSignalEnvelope = require('./LingoSentinelSignalEnvelope');

const DEFAULT_CLIENT_ID = 'marion-lingosentinel-engine';
const DEFAULT_TIMEOUT_MS = 6500;
const DEFAULT_ROOM_ID = 'lingosentinel-main';

let cachedAbly = null;

function safeString(value, fallback = '') {
  if (typeof value === 'string') return value.trim();
  if (value === null || value === undefined) return fallback;
  return String(value).trim();
}

function nowIso() {
  return new Date().toISOString();
}

function toNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function getTimeoutMs(options = {}) {
  return toNumber(
    options.timeoutMs || process.env.LINGOSENTINEL_TIMEOUT_MS,
    DEFAULT_TIMEOUT_MS
  );
}

function getAblyKey(options = {}) {
  return (
    safeString(options.ablyKey) ||
    safeString(process.env.ABLY_ROOT_API_KEY) ||
    safeString(process.env.ABLY_API_KEY)
  );
}

function getClientId(options = {}) {
  return (
    safeString(options.clientId) ||
    safeString(process.env.LINGOSENTINEL_CLIENT_ID) ||
    DEFAULT_CLIENT_ID
  );
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

  const Ably = loadAblyPackage();

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

  if (typeof client.connection.off === 'function') {
    client.connection.off(handler);
    return;
  }

  if (typeof client.connection.removeListener === 'function') {
    client.connection.removeListener(handler);
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
    const timeout = setTimeout(() => {
      cleanup();
      const error = new Error('Ably connection timeout.');
      error.code = 'ABLY_CONNECTION_TIMEOUT';
      reject(error);
    }, timeoutMs);

    function cleanup() {
      clearTimeout(timeout);
      detachConnectionHandler(client, handleConnectionChange);
    }

    function handleConnectionChange(stateChange = {}) {
      if (stateChange.current === 'connected') {
        cleanup();
        resolve({ state: 'connected', connectedAt: nowIso() });
        return;
      }

      if (stateChange.current === 'failed' || stateChange.current === 'suspended') {
        cleanup();
        const error = new Error(
          `Ably connection ${stateChange.current}: ${
            stateChange.reason?.message || 'No reason provided.'
          }`
        );
        error.code = stateChange.current === 'failed'
          ? 'ABLY_CONNECTION_FAILED'
          : 'ABLY_CONNECTION_SUSPENDED';
        reject(error);
      }
    }

    client.connection.on(handleConnectionChange);
  });
}

function normalizeMode(mode) {
  return LingoSentinelSignalEnvelope.normalizeMode(mode || 'one_to_one');
}

function buildPublishInput(input = {}) {
  const sender = input.sender || input.from || {
    id: input.senderId || input.userId || 'anonymous',
    name: input.senderName || input.name || 'Guest',
    role: input.senderRole || 'participant',
    preferredLanguage: input.sourceLanguage || input.lang || 'en'
  };

  return {
    id: input.id,
    text: input.text || input.message || input.body,
    mode: normalizeMode(input.mode || input.lane || 'one_to_one'),
    roomId: input.roomId || input.channelId || input.conversationId || DEFAULT_ROOM_ID,
    sender,
    recipient: input.recipient || input.to || null,
    targetLanguage: input.targetLanguage || input.targetLang,
    recipientLanguage: input.recipientLanguage,
    sourceLanguage: input.sourceLanguage || input.language || input.lang || sender.preferredLanguage,
    metadata: input.metadata || {},
    tags: input.tags || [],
    traceId: input.traceId,
    correlationId: input.correlationId || input.id,
    source: input.source || 'lingosentinel-engine',
    requiresApproval: input.requiresApproval,
    privateSignal: input.privateSignal,
    riskLevel: input.riskLevel,
    confidence: input.confidence
  };
}

function buildAdaptivePlan(input = {}) {
  return ADLYAdaptiveLanguageLayer.adaptForPublish(buildPublishInput(input));
}

function buildSignalPlan(input = {}) {
  const adaptive = buildAdaptivePlan(input);

  if (!adaptive.ok) {
    return {
      ok: false,
      stage: 'adaptive_validation',
      adaptive,
      signal: null,
      publish: null,
      errors: adaptive.errors && adaptive.errors.length
        ? adaptive.errors
        : ['Adaptive language plan failed.']
    };
  }

  const signalPlan = LingoSentinelSignalEnvelope.fromAdaptiveEnvelope(adaptive);

  if (!signalPlan.ok) {
    return {
      ok: false,
      stage: 'signal_validation',
      adaptive,
      signal: signalPlan.signal,
      publish: null,
      errors: signalPlan.errors && signalPlan.errors.length
        ? signalPlan.errors
        : ['Signal envelope validation failed.']
    };
  }

  return {
    ok: true,
    stage: 'ready',
    adaptive,
    signal: signalPlan.signal,
    publish: signalPlan.publish,
    errors: []
  };
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

  return { ok: true, errors: [] };
}

function buildValidationFailure(plan, input, startedAt) {
  return {
    ok: false,
    stage: plan.stage || 'validation',
    errors: plan.errors || ['Validation failed.'],
    mode: normalizeMode(input.mode || input.lane),
    telemetry: {
      attemptedAt: nowIso(),
      elapsedMs: Date.now() - startedAt,
      marionAuthority: true
    }
  };
}

function buildPublishedResult(plan, startedAt, options = {}) {
  return {
    ok: true,
    stage: 'published',
    channel: plan.publish.channel,
    eventName: plan.publish.eventName,
    signalId: plan.signal.id,
    envelopeId: plan.adaptive.envelope.id,
    mode: plan.signal.room.mode,
    room: plan.signal.room,
    delivery: plan.signal.delivery,
    language: plan.signal.language,
    governance: plan.signal.governance,
    telemetry: {
      publishedAt: nowIso(),
      elapsedMs: Date.now() - startedAt,
      clientId: getClientId(options),
      marionAuthority: true,
      payloadShape: 'lingosentinel.signal'
    }
  };
}

function buildPublishFailure(error, plan, startedAt, options = {}) {
  return {
    ok: false,
    stage: 'publish_failed',
    channel: plan.publish?.channel,
    eventName: plan.publish?.eventName,
    signalId: plan.signal?.id,
    envelopeId: plan.adaptive?.envelope?.id,
    errors: [error.message || 'Unknown Ably publish failure.'],
    telemetry: {
      failedAt: nowIso(),
      elapsedMs: Date.now() - startedAt,
      code: error.code || 'ABLY_PUBLISH_FAILED',
      clientId: getClientId(options),
      marionAuthority: true
    }
  };
}

async function publishMessage(input = {}, options = {}) {
  const startedAt = Date.now();
  const publishInput = buildPublishInput(input);
  const plan = buildSignalPlan(publishInput);
  const validation = validatePublishPlan(plan);

  if (!validation.ok) {
    return buildValidationFailure(
      { ...plan, errors: validation.errors },
      publishInput,
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

    const channel = client.channels.get(plan.publish.channel);
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

async function closeEngine() {
  if (cachedAbly && typeof cachedAbly.close === 'function') {
    cachedAbly.close();
  }

  cachedAbly = null;

  return {
    ok: true,
    closedAt: nowIso()
  };
}

module.exports = {
  publishMessage,
  publishDirectMessage,
  publishGroupMessage,
  publishLiveTranslateMessage,
  publishDeliveredReceipt,
  closeEngine,

  // Exposed for tests and regression checks.
  buildPublishInput,
  buildAdaptivePlan,
  buildSignalPlan,
  validatePublishPlan,
  createAblyClient,
  getAblyClient,
  waitForConnection,
  getAblyKey,
  getClientId,
  getTimeoutMs,
  normalizeMode
};

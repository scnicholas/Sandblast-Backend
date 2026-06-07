'use strict';

/**
 * LingoSentinelEngine
 * Backend/runtime publishing engine for LingoSentinel.
 *
 * Purpose:
 * - Accept raw chat input.
 * - Build an adaptive language envelope.
 * - Publish the envelope to Ably.
 * - Keep API keys out of the public widget.
 * - Return clean delivery telemetry for Marion.
 *
 * Required environment variable:
 * - ABLY_ROOT_API_KEY
 *
 * Optional:
 * - LINGOSENTINEL_CLIENT_ID
 *
 * This file should live at:
 * Data/marion/runtime/LingoSentinelEngine.js
 */

const ADLYAdaptiveLanguageLayer = require('./ADLYAdaptiveLanguageLayer');

const DEFAULT_CLIENT_ID = 'marion-lingosentinel-engine';
const DEFAULT_TIMEOUT_MS = 6500;

let cachedAbly = null;

function safeString(value, fallback = '') {
  if (typeof value === 'string') return value.trim();
  if (value === null || value === undefined) return fallback;
  return String(value).trim();
}

function nowIso() {
  return new Date().toISOString();
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
    const missing = new Error(
      'Ably package is not installed. Run: npm install ably'
    );
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

function waitForConnection(client, timeoutMs = DEFAULT_TIMEOUT_MS) {
  if (!client || !client.connection) {
    return Promise.reject(new Error('Invalid Ably client.'));
  }

  if (client.connection.state === 'connected') {
    return Promise.resolve({
      state: 'connected',
      connectedAt: nowIso()
    });
  }

  if (client.connection.state === 'failed') {
    return Promise.reject(new Error('Ably connection is already failed.'));
  }

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error('Ably connection timeout.'));
    }, timeoutMs);

    function cleanup() {
      clearTimeout(timeout);
      client.connection.off(handleConnectionChange);
    }

    function handleConnectionChange(stateChange) {
      if (!stateChange) return;

      if (stateChange.current === 'connected') {
        cleanup();
        resolve({
          state: 'connected',
          connectedAt: nowIso()
        });
      }

      if (stateChange.current === 'failed' || stateChange.current === 'suspended') {
        cleanup();
        reject(
          new Error(
            `Ably connection ${stateChange.current}: ${
              stateChange.reason?.message || 'No reason provided.'
            }`
          )
        );
      }
    }

    client.connection.on(handleConnectionChange);
  });
}

function validatePublishPlan(plan = {}) {
  if (!plan.ok) {
    return {
      ok: false,
      errors: plan.errors && plan.errors.length ? plan.errors : ['Invalid adaptive publish plan.']
    };
  }

  if (!plan.publish || !plan.publish.channel || !plan.publish.eventName) {
    return {
      ok: false,
      errors: ['Adaptive publish plan is missing channel or event name.']
    };
  }

  return {
    ok: true,
    errors: []
  };
}

function buildPublishInput(input = {}) {
  return {
    id: input.id,
    text: input.text || input.message || input.body,
    mode: input.mode || input.lane || 'one_to_one',

    roomId: input.roomId || input.channelId || input.conversationId,

    sender: input.sender || input.from || {
      id: input.senderId || input.userId || 'anonymous',
      name: input.senderName || input.name || 'Guest',
      role: input.senderRole || 'participant',
      preferredLanguage: input.sourceLanguage || input.lang || 'en'
    },

    recipient: input.recipient || input.to || null,

    targetLanguage: input.targetLanguage,
    recipientLanguage: input.recipientLanguage,
    metadata: input.metadata || {}
  };
}

async function publishMessage(input = {}, options = {}) {
  const startedAt = Date.now();
  const publishInput = buildPublishInput(input);
  const plan = ADLYAdaptiveLanguageLayer.adaptForPublish(publishInput);
  const validation = validatePublishPlan(plan);

  if (!validation.ok) {
    return {
      ok: false,
      stage: 'validation',
      errors: validation.errors,
      telemetry: {
        attemptedAt: nowIso(),
        mode: publishInput.mode || 'unknown'
      }
    };
  }

  const client = getAblyClient(options);

  try {
    await waitForConnection(client, options.timeoutMs || DEFAULT_TIMEOUT_MS);

    const channel = client.channels.get(plan.publish.channel);

    await channel.publish(plan.publish.eventName, plan.publish.payload);

    return {
      ok: true,
      stage: 'published',
      channel: plan.publish.channel,
      eventName: plan.publish.eventName,
      envelopeId: plan.envelope.id,
      mode: plan.envelope.room.mode,
      delivery: plan.envelope.delivery,
      language: plan.envelope.language,
      governance: plan.envelope.governance,
      telemetry: {
        publishedAt: nowIso(),
        elapsedMs: Date.now() - startedAt,
        clientId: getClientId(options)
      }
    };
  } catch (error) {
    return {
      ok: false,
      stage: 'publish_failed',
      channel: plan.publish.channel,
      eventName: plan.publish.eventName,
      envelopeId: plan.envelope.id,
      errors: [error.message || 'Unknown Ably publish failure.'],
      telemetry: {
        failedAt: nowIso(),
        elapsedMs: Date.now() - startedAt,
        code: error.code || 'ABLY_PUBLISH_FAILED'
      }
    };
  }
}

async function publishDirectMessage(input = {}, options = {}) {
  return publishMessage(
    {
      ...input,
      mode: 'one_to_one'
    },
    options
  );
}

async function publishGroupMessage(input = {}, options = {}) {
  return publishMessage(
    {
      ...input,
      mode: 'group_room'
    },
    options
  );
}

async function publishLiveTranslateMessage(input = {}, options = {}) {
  return publishMessage(
    {
      ...input,
      mode: 'live_translate'
    },
    options
  );
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
  if (cachedAbly && cachedAbly.close) {
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

  // Exposed for testing.
  buildPublishInput,
  validatePublishPlan,
  createAblyClient,
  getAblyClient,
  waitForConnection
};

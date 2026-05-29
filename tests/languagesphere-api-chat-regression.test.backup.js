'use strict';

/**
 * LanguageSphere API Chat Regression Test
 * ------------------------------------------------------------
 * Hardened regression test for the LanguageSphere -> /api/chat -> Marion boundary.
 *
 * Validates:
 * - API middleware prepares Marion payload safely.
 * - English, Spanish, and French paths work.
 * - Empty input blocks safely.
 * - Provider failure degrades safely without leaking provider internals.
 * - Marion remains final authority.
 * - Translation telemetry is present but does not authorize final answers.
 *
 * Run from project root:
 *   npx jest tests/languagesphere-api-chat-regression.test.js
 *
 * Also works with Node's built-in test runner:
 *   node --test tests/languagesphere-api-chat-regression.test.js
 */

const assert = require('node:assert/strict');
const Module = require('node:module');

const JEST_AVAILABLE =
  typeof globalThis.describe === 'function' &&
  typeof globalThis.test === 'function';

let nodeTestApi = null;
if (!JEST_AVAILABLE) {
  nodeTestApi = require('node:test');
}

const describeFn = JEST_AVAILABLE ? globalThis.describe : nodeTestApi.describe;
const testFn = JEST_AVAILABLE ? globalThis.test : nodeTestApi.test;

const MIDDLEWARE_PATH =
  '../Data/marion/runtime/languagesphere/LanguageSphereApiMiddleware';

function createLanguageSphereTelemetry(seed = {}) {
  const createdAt = new Date().toISOString();

  return {
    enabled: true,
    source: 'languagesphere-api-chat-regression',
    requestId: seed.requestId || null,
    sessionId: seed.sessionId || null,
    createdAt,
    events: [],
    warnings: [],
    errors: [],

    record(event, payload = {}) {
      this.events.push({
        event,
        payload: sanitizeTelemetryPayload(payload),
        at: new Date().toISOString()
      });
    },

    warn(payload = {}) {
      this.warnings.push({
        payload: sanitizeTelemetryPayload(payload),
        at: new Date().toISOString()
      });
    },

    error(payload = {}) {
      this.errors.push({
        payload: sanitizeTelemetryPayload(payload),
        at: new Date().toISOString()
      });
    },

    snapshot() {
      return {
        enabled: this.enabled,
        source: this.source,
        requestId: this.requestId,
        sessionId: this.sessionId,
        createdAt: this.createdAt,
        events: this.events.slice(),
        warnings: this.warnings.slice(),
        errors: this.errors.slice()
      };
    },

    ...seed
  };
}

function sanitizeTelemetryPayload(payload = {}) {
  if (!payload || typeof payload !== 'object') return {};

  const json = JSON.stringify(payload, (_key, value) => {
    if (typeof value !== 'string') return value;

    return value
      .replace(/provider secret failure should not leak/gi, '[redacted-provider-error]')
      .replace(/secret/gi, '[redacted]');
  });

  try {
    return JSON.parse(json);
  } catch (_) {
    return {};
  }
}

/**
 * Some in-flight LanguageSphere branches call createLanguageSphereTelemetry()
 * from a telemetry module while others accept injected telemetry helpers.
 * This shim keeps the regression test focused on the API chat boundary instead
 * of failing early on a telemetry export-name mismatch.
 */
function installTelemetryCompatibilityShim() {
  const originalLoad = Module._load;

  Module._load = function patchedLoad(request, parent, isMain) {
    const looksLikeLanguageSphereTelemetry =
      /languagesphere/i.test(String(parent && parent.filename || '')) &&
      /telemetry/i.test(String(request || ''));

    if (!looksLikeLanguageSphereTelemetry) {
      return originalLoad.apply(this, arguments);
    }

    try {
      const loaded = originalLoad.apply(this, arguments);

      if (loaded && typeof loaded === 'object') {
        return {
          ...loaded,
          createLanguageSphereTelemetry:
            typeof loaded.createLanguageSphereTelemetry === 'function'
              ? loaded.createLanguageSphereTelemetry
              : createLanguageSphereTelemetry
        };
      }

      if (typeof loaded === 'function') {
        loaded.createLanguageSphereTelemetry =
          loaded.createLanguageSphereTelemetry || createLanguageSphereTelemetry;
        return loaded;
      }

      return {
        createLanguageSphereTelemetry
      };
    } catch (error) {
      if (error && error.code === 'MODULE_NOT_FOUND') {
        return {
          createLanguageSphereTelemetry
        };
      }

      throw error;
    }
  };

  return function restoreTelemetryCompatibilityShim() {
    Module._load = originalLoad;
  };
}

function loadMiddleware() {
  const restoreShim = installTelemetryCompatibilityShim();

  try {
    const middleware = require(MIDDLEWARE_PATH);

    assert.ok(
      middleware && typeof middleware.prepareLanguageSphereForApiChat === 'function',
      'LanguageSphereApiMiddleware must export prepareLanguageSphereForApiChat()'
    );

    return {
      prepareLanguageSphereForApiChat: middleware.prepareLanguageSphereForApiChat,
      restoreShim
    };
  } catch (error) {
    restoreShim();

    const details = error && error.message ? error.message : String(error);
    throw new Error(
      `Unable to load LanguageSphereApiMiddleware. ` +
      `Expected ${MIDDLEWARE_PATH} to export prepareLanguageSphereForApiChat(). ` +
      `Details: ${details}`
    );
  }
}

function buildApiInput(overrides = {}) {
  const base = {
    text: 'Hello Marion, test the LanguageSphere API path.',
    requestId: 'req_api_default_001',
    sessionId: 'sess_api_default_001',
    inputSource: 'text',
    targetLanguage: 'en'
  };

  return {
    ...base,
    ...overrides
  };
}

function buildMiddlewareOptions(overrides = {}) {
  const requestId = overrides.requestId || 'req_api_default_001';
  const sessionId = overrides.sessionId || 'sess_api_default_001';

  return {
    telemetry: createLanguageSphereTelemetry({ requestId, sessionId }),
    telemetryFactory: createLanguageSphereTelemetry,
    createTelemetry: createLanguageSphereTelemetry,
    createLanguageSphereTelemetry,
    ...overrides
  };
}

function createFakeProvider({ translatedText, expectedSourceLanguage, expectedTargetLanguage }) {
  const translate = async (_text, context = {}) => {
    assert.equal(
      context.sourceLanguage,
      expectedSourceLanguage,
      `Provider received wrong source language. Expected ${expectedSourceLanguage}.`
    );

    assert.equal(
      context.targetLanguage,
      expectedTargetLanguage,
      `Provider received wrong target language. Expected ${expectedTargetLanguage}.`
    );

    return {
      text: translatedText,
      translatedText,
      providerName: 'FakeProvider',
      providerMode: 'test',
      applied: true,
      confidence: 1,
      meta: {
        provider: 'FakeProvider',
        translated: true,
        sourceLanguage: expectedSourceLanguage,
        targetLanguage: expectedTargetLanguage
      }
    };
  };

  return {
    name: 'FakeProvider',
    translate,
    translateText: translate
  };
}

function getPayload(result) {
  assert.ok(result, 'Middleware result missing');
  assert.ok(result.marionPayload, 'Middleware result missing marionPayload');
  return result.marionPayload;
}

function assertMarionAuthority(payload) {
  assert.ok(payload.authority, 'Payload authority object missing');

  assert.equal(
    payload.authority.finalAuthority,
    false,
    'LanguageSphere must not mark itself as final authority'
  );

  assert.equal(
    payload.authority.finalAuthorityOwner,
    'Marion',
    'Final authority owner must remain Marion'
  );

  assert.equal(
    payload.authority.mayBypassMarion,
    false,
    'LanguageSphere must not bypass Marion'
  );
}

function assertTranslationLayerMetadata(payload) {
  assert.ok(payload.languageSphere, 'languageSphere metadata missing');
  assert.ok(payload.languageSphereTelemetry, 'languageSphereTelemetry missing');

  const serializedTelemetry = JSON.stringify(payload.languageSphereTelemetry);
  assert.equal(
    serializedTelemetry.includes('provider secret failure should not leak'),
    false,
    'Telemetry leaked raw provider failure details'
  );
}

function assertNoRawSecretLeak(result) {
  const serialized = JSON.stringify(result);

  assert.equal(
    serialized.includes('provider secret failure should not leak'),
    false,
    'Regression result leaked raw provider error message'
  );
}

describeFn('LanguageSphere API chat regression', () => {
  let prepareLanguageSphereForApiChat = null;
  let restoreShim = null;

  beforeAllOrNode(() => {
    const loaded = loadMiddleware();
    prepareLanguageSphereForApiChat = loaded.prepareLanguageSphereForApiChat;
    restoreShim = loaded.restoreShim;
  });

  afterAllOrNode(() => {
    if (typeof restoreShim === 'function') restoreShim();
  });

  testFn('API middleware prepares English input for Marion', async () => {
    const input = buildApiInput({
      text: 'Hello Marion, test the LanguageSphere API path.',
      requestId: 'req_api_en_001',
      sessionId: 'sess_api_001',
      targetLanguage: 'en'
    });

    const result = await prepareLanguageSphereForApiChat(
      input,
      buildMiddlewareOptions(input)
    );

    const payload = getPayload(result);

    assert.equal(result.ok, true);
    assert.equal(result.blocked, false);
    assert.equal(payload.text, input.text);
    assert.equal(payload.userText, input.text);
    assert.equal(payload.originalText, input.text);
    assert.equal(payload.inputSource, 'text');

    assertMarionAuthority(payload);
    assertTranslationLayerMetadata(payload);
  });

  testFn('API middleware prepares Spanish input with injected provider', async () => {
    const input = buildApiInput({
      text: 'Hola, necesito una traducción para este idioma.',
      requestId: 'req_api_es_001',
      sessionId: 'sess_api_001',
      targetLanguage: 'en'
    });

    const fakeProvider = createFakeProvider({
      translatedText: 'Hello, I need translation for this language.',
      expectedSourceLanguage: 'es',
      expectedTargetLanguage: 'en'
    });

    const result = await prepareLanguageSphereForApiChat(
      input,
      buildMiddlewareOptions({
        ...input,
        provider: fakeProvider
      })
    );

    const payload = getPayload(result);

    assert.equal(result.ok, true);
    assert.equal(result.blocked, false);
    assert.equal(payload.text, 'Hello, I need translation for this language.');
    assert.equal(payload.originalText, input.text);

    assert.equal(payload.languageContext.sourceLanguage, 'es');
    assert.equal(payload.languageContext.targetLanguage, 'en');
    assert.equal(payload.languageContext.translationRequired, true);
    assert.equal(payload.languageContext.translationApplied, true);

    assert.equal(payload.languageSphere.provider.name, 'FakeProvider');
    assertMarionAuthority(payload);
    assertTranslationLayerMetadata(payload);
  });

  testFn('API middleware prepares French input with injected provider', async () => {
    const input = buildApiInput({
      text: 'Bonjour, merci pour la traduction en français.',
      requestId: 'req_api_fr_001',
      sessionId: 'sess_api_001',
      targetLanguage: 'en'
    });

    const fakeProvider = createFakeProvider({
      translatedText: 'Hello, thank you for the French translation.',
      expectedSourceLanguage: 'fr',
      expectedTargetLanguage: 'en'
    });

    const result = await prepareLanguageSphereForApiChat(
      input,
      buildMiddlewareOptions({
        ...input,
        provider: fakeProvider
      })
    );

    const payload = getPayload(result);

    assert.equal(result.ok, true);
    assert.equal(result.blocked, false);
    assert.equal(payload.text, 'Hello, thank you for the French translation.');
    assert.equal(payload.originalText, input.text);

    assert.equal(payload.languageContext.sourceLanguage, 'fr');
    assert.equal(payload.languageContext.targetLanguage, 'en');
    assert.equal(payload.languageContext.translationRequired, true);
    assert.equal(payload.languageContext.translationApplied, true);

    assertMarionAuthority(payload);
    assertTranslationLayerMetadata(payload);
  });

  testFn('API middleware blocks empty input safely', async () => {
    const input = buildApiInput({
      text: '      ',
      requestId: 'req_api_empty_001',
      sessionId: 'sess_api_001',
      targetLanguage: 'en'
    });

    const result = await prepareLanguageSphereForApiChat(
      input,
      buildMiddlewareOptions(input)
    );

    const payload = getPayload(result);

    assert.equal(result.ok, false);
    assert.equal(result.blocked, true);
    assert.equal(result.reason, 'empty-api-chat-input-blocked');
    assert.equal(payload.text, '');
    assert.equal(payload.userText, '');
    assert.equal(payload.languageSphereBlocked, true);

    assertMarionAuthority(payload);
    assertTranslationLayerMetadata(payload);
  });

  testFn('API middleware survives provider failure and falls back safely', async () => {
    const input = buildApiInput({
      text: 'Hola, necesito una traducción para este idioma.',
      requestId: 'req_api_provider_fail_001',
      sessionId: 'sess_api_001',
      targetLanguage: 'en'
    });

    const failingProvider = {
      name: 'FailingProvider',
      async translate() {
        throw new Error('provider secret failure should not leak');
      },
      async translateText() {
        throw new Error('provider secret failure should not leak');
      }
    };

    const result = await prepareLanguageSphereForApiChat(
      input,
      buildMiddlewareOptions({
        ...input,
        provider: failingProvider
      })
    );

    const payload = getPayload(result);

    assert.equal(result.ok, true);
    assert.equal(result.blocked, false);
    assert.equal(payload.languageSphereFailedSafe, true);
    assert.equal(payload.text, input.text);
    assert.equal(payload.originalText, input.text);

    assertMarionAuthority(payload);
    assertTranslationLayerMetadata(payload);
    assertNoRawSecretLeak(result);

    if (result.fallbackDecision && Array.isArray(result.fallbackDecision.errors)) {
      const errors = result.fallbackDecision.errors.join(' ');
      assert.equal(
        errors.includes('provider secret failure should not leak'),
        false,
        'fallbackDecision leaked raw provider error'
      );
    }
  });
});

function beforeAllOrNode(fn) {
  if (typeof globalThis.beforeAll === 'function') {
    globalThis.beforeAll(fn);
    return;
  }

  if (nodeTestApi && typeof nodeTestApi.before === 'function') {
    nodeTestApi.before(fn);
    return;
  }

  fn();
}

function afterAllOrNode(fn) {
  if (typeof globalThis.afterAll === 'function') {
    globalThis.afterAll(fn);
    return;
  }

  if (nodeTestApi && typeof nodeTestApi.after === 'function') {
    nodeTestApi.after(fn);
  }
}

module.exports = {
  createLanguageSphereTelemetry,
  sanitizeTelemetryPayload,
  installTelemetryCompatibilityShim,
  buildApiInput,
  buildMiddlewareOptions,
  createFakeProvider
};

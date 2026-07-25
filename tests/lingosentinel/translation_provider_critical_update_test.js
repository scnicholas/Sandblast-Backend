"use strict";

const assert = require("assert");
const path = require("path");
const Module = require("module");

const PROVIDER_PATH = path.resolve(
  __dirname,
  "../../Data/marion/runtime/LingoSentinel/LingoSentinelTranslationProvider.js"
);

const ENDPOINT_KEYS = [
  "ARGOS_TRANSLATE_ENDPOINT",
  "LIBRETRANSLATE_URL",
  "ARGOS_TRANSLATE_URL",
  "LINGOSENTINEL_TRANSLATE_URL",
  "LINGOSENTINEL_PROVIDER_URL",
  "LINGOSENTINEL_TRANSLATION_URL"
];

const registryStub = {
  normalizeLanguageCode(value, fallback = "") {
    const raw = String(value || "").trim().toLowerCase();
    const map = {
      english: "en",
      spanish: "es",
      "eng_latn": "en",
      "spa_latn": "es"
    };
    return map[raw] || raw.split(/[-_]/)[0] || fallback;
  },
  coerceTargetLanguage(value, fallback = "en") {
    return this.normalizeLanguageCode(value, fallback);
  },
  getProviderLanguageCode(value, provider) {
    const code = this.normalizeLanguageCode(value, "auto");
    if (String(provider).includes("nllb")) {
      return code === "en" ? "eng_Latn" : code === "es" ? "spa_Latn" : code;
    }
    return code;
  },
  validateLanguagePair(source, target, options = {}) {
    return {
      ok: source === target,
      source,
      target,
      providerSource: this.getProviderLanguageCode(source, options.provider),
      providerTarget: this.getProviderLanguageCode(target, options.provider),
      warnings: source === target ? ["SOURCE_TARGET_IDENTICAL"] : []
    };
  },
  isSupportedLanguage(value) {
    return ["en", "es", "fr", "pt"].includes(this.normalizeLanguageCode(value));
  },
  isSpecialLanguage(value) {
    return ["auto", "mixed", "unknown"].includes(this.normalizeLanguageCode(value));
  },
  getSupportedLanguageCodes() {
    return ["en", "es", "fr", "pt"];
  }
};

function clearEndpointEnv() {
  for (const key of ENDPOINT_KEYS) delete process.env[key];
  delete process.env.LINGOSENTINEL_TRANSLATE_DIAGNOSTICS;
  delete process.env.LINGOSENTINEL_TRANSLATE_TIMEOUT_MS;
  delete process.env.LINGOSENTINEL_TRANSLATE_MAX_ATTEMPTS;
  delete process.env.LINGOSENTINEL_TRANSLATE_RETRY_DELAY_MS;
}

function loadProvider() {
  delete require.cache[PROVIDER_PATH];
  const originalLoad = Module._load;
  Module._load = function patchedLoad(request, parent, isMain) {
    if (
      request === "./LingoSentinelLanguageRegistry" &&
      parent &&
      path.resolve(parent.filename) === PROVIDER_PATH
    ) {
      return registryStub;
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    return require(PROVIDER_PATH);
  } finally {
    Module._load = originalLoad;
  }
}

function response(status, json, headers = {}) {
  const body = typeof json === "string" ? json : JSON.stringify(json);
  const lower = Object.fromEntries(
    Object.entries({
      "content-type": "application/json",
      ...headers
    }).map(([key, value]) => [key.toLowerCase(), String(value)])
  );

  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get(name) {
        return lower[String(name).toLowerCase()] || null;
      }
    },
    async text() {
      return body;
    }
  };
}

async function run() {
  const results = [];
  async function test(name, fn) {
    clearEndpointEnv();
    try {
      await fn();
      results.push({ name, ok: true });
      console.log(`PASS ${name}`);
    } catch (error) {
      results.push({ name, ok: false, error: error.stack || String(error) });
      console.error(`FAIL ${name}`);
      console.error(error.stack || error);
    }
  }

  await test("canonical LibreTranslate payload uses q and ISO codes", async () => {
    const Provider = loadProvider();
    const payload = Provider.buildProviderPayload({
      text: "Hello",
      sourceLanguage: "en",
      targetLanguage: "es"
    });
    assert.deepStrictEqual(payload, {
      q: "Hello",
      source: "en",
      target: "es",
      format: "text"
    });
  });

  await test("base provider origin normalizes to /translate", async () => {
    const Provider = loadProvider();
    const resolution = Provider.resolveEndpoint({
      endpoint: "https://translator.example.com/"
    });
    assert.strictEqual(
      resolution.endpoint,
      "https://translator.example.com/translate"
    );
    assert.strictEqual(resolution.error, "");
  });

  await test("/languages endpoint safely rewrites to /translate", async () => {
    const Provider = loadProvider();
    const resolution = Provider.resolveEndpoint({
      endpoint: "https://translator.example.com/languages"
    });
    assert.strictEqual(
      resolution.endpoint,
      "https://translator.example.com/translate"
    );
  });

  await test("LingoSentinel public route is rejected as a provider endpoint", async () => {
    const Provider = loadProvider();
    const resolution = Provider.resolveEndpoint({
      endpoint: "https://sandblast.example.com/lingosentinel/translate"
    });
    assert.strictEqual(
      resolution.error,
      "translation_provider_endpoint_misdirected"
    );
    assert.strictEqual(resolution.endpoint, "");
  });

  await test("conflicting provider aliases fail closed", async () => {
    process.env.ARGOS_TRANSLATE_ENDPOINT =
      "https://translator-a.example.com";
    process.env.LIBRETRANSLATE_URL =
      "https://translator-b.example.com";
    const Provider = loadProvider();
    const health = Provider.getHealth();
    assert.strictEqual(health.ok, false);
    assert.strictEqual(
      health.endpointError,
      "translation_provider_endpoint_conflict"
    );
    assert.strictEqual(health.endpointConflictDetected, true);
  });

  await test("successful EN to ES provider dispatch", async () => {
    const Provider = loadProvider();
    let outbound = null;
    const result = await Provider.translate(
      {
        text: "Hello",
        sourceLanguage: "en",
        targetLanguage: "es",
        requestId: "success_001"
      },
      {
        endpoint: "https://translator.example.com",
        fetchFn: async (_url, init) => {
          outbound = JSON.parse(init.body);
          return response(200, {
            translatedText: "Hola"
          });
        },
        maxAttempts: 1
      }
    );

    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.translatedText, "Hola");
    assert.strictEqual(result.provider, "libretranslate-compatible");
    assert.strictEqual(result.fallback, false);
    assert.strictEqual(result.attempts, 1);
    assert.deepStrictEqual(outbound, {
      q: "Hello",
      source: "en",
      target: "es",
      format: "text"
    });
  });

  await test("Nyx not-found envelope is classified as endpoint misdirection", async () => {
    const Provider = loadProvider();
    const result = await Provider.translate(
      {
        text: "Hello",
        sourceLanguage: "en",
        targetLanguage: "es",
        requestId: "misdirect_001"
      },
      {
        endpoint: "https://translator.example.com",
        fetchFn: async () =>
          response(404, {
            ok: false,
            error: "not_found",
            path: "/lingosentinel/translate",
            publicAgent: "Nyx",
            reply: "Public fallback"
          }),
        maxAttempts: 1
      }
    );

    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.error, "provider_endpoint_misdirected");
    assert.strictEqual(result.translatedText, "Hello");
  });

  await test("retryable HTTP 503 is retried once then succeeds", async () => {
    const Provider = loadProvider();
    let calls = 0;
    const result = await Provider.translate(
      {
        text: "A new sentence",
        sourceLanguage: "en",
        targetLanguage: "es"
      },
      {
        endpoint: "https://translator.example.com",
        fetchFn: async () => {
          calls += 1;
          if (calls === 1) {
            return response(503, { error: "cold_start" });
          }
          return response(200, { translatedText: "Una frase nueva" });
        },
        maxAttempts: 2,
        retryDelayMs: 0
      }
    );

    assert.strictEqual(calls, 2);
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.attempts, 2);
  });

  await test("non-retryable HTTP 400 fails immediately", async () => {
    const Provider = loadProvider();
    let calls = 0;
    const result = await Provider.translate(
      {
        text: "Hello",
        sourceLanguage: "en",
        targetLanguage: "es"
      },
      {
        endpoint: "https://translator.example.com",
        fetchFn: async () => {
          calls += 1;
          return response(400, { error: "bad_request" });
        },
        maxAttempts: 3,
        retryDelayMs: 0
      }
    );

    assert.strictEqual(calls, 1);
    assert.strictEqual(result.error, "provider_http_400");
  });

  await test("AbortError becomes stable provider_timeout", async () => {
    const Provider = loadProvider();
    const result = await Provider.translate(
      {
        text: "Hello",
        sourceLanguage: "en",
        targetLanguage: "es"
      },
      {
        endpoint: "https://translator.example.com",
        fetchFn: async () => {
          const error = new Error("hidden timeout detail");
          error.name = "AbortError";
          throw error;
        },
        maxAttempts: 1
      }
    );
    assert.strictEqual(result.error, "provider_timeout");
    assert.strictEqual(result.fallback, true);
  });

  await test("redacted diagnostics contain no endpoint, request text, or secret", async () => {
    const Provider = loadProvider();
    const originalWarn = console.warn;
    const lines = [];
    console.warn = line => lines.push(String(line));
    try {
      await Provider.translate(
        {
          text: "TOP SECRET REQUEST TEXT",
          sourceLanguage: "en",
          targetLanguage: "es",
          requestId: "diag_001"
        },
        {
          endpoint: "https://secret-provider.example.com",
          apiKey: "SECRET_API_KEY",
          diagnostics: true,
          fetchFn: async () => response(400, { error: "bad" }),
          maxAttempts: 1
        }
      );
    } finally {
      console.warn = originalWarn;
    }

    const joined = lines.join("\n");
    assert(joined.includes("provider_http_400"));
    assert(joined.includes("diag_001"));
    assert(!joined.includes("secret-provider.example.com"));
    assert(!joined.includes("TOP SECRET REQUEST TEXT"));
    assert(!joined.includes("SECRET_API_KEY"));
  });

  await test("health allows 90 second timeout and exposes only safe metadata", async () => {
    const Provider = loadProvider();
    const health = Provider.getHealth({
      endpoint: "https://translator.example.com",
      timeoutMs: 90000,
      maxAttempts: 2
    });
    assert.strictEqual(health.ok, true);
    assert.strictEqual(health.timeoutMs, 90000);
    assert.strictEqual(health.providerEndpointExposed, false);
    assert.strictEqual(health.endpointSource, "options.endpoint");
    assert.strictEqual(
      JSON.stringify(health).includes("translator.example.com"),
      false
    );
  });

  await test("same-language requests bypass provider execution", async () => {
    const Provider = loadProvider();
    let called = false;
    const result = await Provider.translate(
      {
        text: "Hello",
        sourceLanguage: "en",
        targetLanguage: "en"
      },
      {
        endpoint: "https://translator.example.com",
        fetchFn: async () => {
          called = true;
          return response(200, { translatedText: "Should not run" });
        }
      }
    );
    assert.strictEqual(called, false);
    assert.strictEqual(result.provider, "same-language-bypass");
    assert.strictEqual(result.translatedText, "Hello");
  });

  const passed = results.filter(result => result.ok).length;
  const failed = results.length - passed;
  console.log(`\nRESULT ${passed}/${results.length} passed`);
  if (failed) process.exitCode = 1;
}

run().catch(error => {
  console.error(error.stack || error);
  process.exit(1);
});

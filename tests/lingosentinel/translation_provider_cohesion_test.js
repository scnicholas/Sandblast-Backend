"use strict";

const assert = require("assert");
const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");

const SOURCE_ROOT = path.resolve(__dirname, "../..");
const RUNTIME = path.join(SOURCE_ROOT, "Data/marion/runtime/LingoSentinel");

function copyFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ls-provider-test-"));
  fs.copyFileSync(
    path.join(RUNTIME, "ArgosTranslationAdapter.js"),
    path.join(root, "ArgosTranslationAdapter.js")
  );
  fs.copyFileSync(
    path.join(RUNTIME, "LingoSentinelTranslationProvider.js"),
    path.join(root, "LingoSentinelTranslationProvider.js")
  );
  fs.writeFileSync(path.join(root, "LingoSentinelLanguageRegistry.js"), `
"use strict";
const supported = ["auto", "en", "es", "fr", "zh", "pt"];
function normalize(v, fallback) { const s=String(v||fallback||"").toLowerCase(); return supported.includes(s)?s:fallback; }
module.exports = {
  getProviderLanguageCode: (v) => normalize(v, "en"),
  normalizeLanguageCode: normalize,
  coerceTargetLanguage: (v) => normalize(v, "en"),
  validateLanguagePair: (s,t) => ({source:normalize(s,"auto"),target:normalize(t,"en"),providerSource:normalize(s,"auto"),providerTarget:normalize(t,"en")}),
  isSupportedLanguage: (v) => supported.includes(String(v||"").toLowerCase()),
  getSupportedLanguageCodes: () => supported.slice()
};
`);
  return root;
}

function fresh(root) {
  for (const name of ["ArgosTranslationAdapter.js", "LingoSentinelTranslationProvider.js", "LingoSentinelLanguageRegistry.js"]) {
    const resolved = path.join(root, name);
    delete require.cache[require.resolve(resolved)];
  }
  return {
    Adapter: require(path.join(root, "ArgosTranslationAdapter.js")),
    Provider: require(path.join(root, "LingoSentinelTranslationProvider.js"))
  };
}

async function main() {
  const root = copyFixture();
  const originalEnv = { ...process.env };
  delete process.env.LINGOSENTINEL_TRANSLATE_URL;
  delete process.env.LINGOSENTINEL_PROVIDER_URL;
  delete process.env.LINGOSENTINEL_TRANSLATION_URL;
  delete process.env.LIBRETRANSLATE_URL;
  delete process.env.ARGOS_TRANSLATE_URL;
  delete process.env.ARGOS_TRANSLATE_ENDPOINT;

  try {
    let modules = fresh(root);
    assert.strictEqual(modules.Adapter.isConfigured(), false, "adapter should be unconfigured without an endpoint");
    assert.strictEqual(modules.Adapter.getHealth().configured, false, "health should report unconfigured");

    const bypass = await modules.Adapter.translate({ text: "Hello", sourceLanguage: "en", targetLanguage: "en" });
    assert.strictEqual(bypass.ok, true);
    assert.strictEqual(bypass.provider, "same-language-bypass");
    assert.strictEqual(bypass.translatedText, "Hello");

    const unconfigured = await modules.Adapter.translate({ text: "Hello", sourceLanguage: "en", targetLanguage: "es" });
    assert.strictEqual(unconfigured.ok, false);
    assert.strictEqual(unconfigured.error, "ARGOS_NOT_CONFIGURED");
    assert.strictEqual(unconfigured.providerError, "translation_provider_unconfigured");
    assert.strictEqual(unconfigured.translatedText, "Hello");

    let receivedPayload = null;
    const server = http.createServer((request, response) => {
      let body = "";
      request.setEncoding("utf8");
      request.on("data", (chunk) => { body += chunk; });
      request.on("end", () => {
        receivedPayload = JSON.parse(body);
        response.writeHead(200, { "Content-Type": "application/json" });
        response.end(JSON.stringify({
          translatedText: "Hola, ¿cómo estás hoy?",
          source: "en",
          target: "es",
          confidence: 0.96,
          secretProviderToken: "must-not-leak"
        }));
      });
    });

    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    process.env.ARGOS_TRANSLATE_ENDPOINT = `http://127.0.0.1:${address.port}`;
    modules = fresh(root);

    assert.strictEqual(modules.Adapter.isConfigured(), true, "adapter should delegate configuration to provider");
    const health = modules.Adapter.getHealth();
    assert.strictEqual(health.ok, true);
    assert.strictEqual(health.configured, true);
    assert.strictEqual(health.providerEndpointExposed, false);
    assert.strictEqual(Object.prototype.hasOwnProperty.call(health, "endpoint"), false);

    const translated = await modules.Adapter.translate({
      text: "Hello, how are you today?",
      source: "en",
      target: "es"
    });
    assert.strictEqual(translated.ok, true);
    assert.strictEqual(translated.translatedText, "Hola, ¿cómo estás hoy?");
    assert.strictEqual(translated.sourceLanguage, "en");
    assert.strictEqual(translated.targetLanguage, "es");
    assert.strictEqual(translated.confidence, 0.96);
    assert.strictEqual(Object.prototype.hasOwnProperty.call(translated, "rawProvider"), false);
    assert.strictEqual(Object.prototype.hasOwnProperty.call(translated, "secretProviderToken"), false);
    assert.strictEqual(receivedPayload.q, "Hello, how are you today?");
    assert.strictEqual(receivedPayload.source, "en");
    assert.strictEqual(receivedPayload.target, "es");

    await new Promise((resolve) => server.close(resolve));

    const timedOut = await modules.Adapter.translate(
      { text: "Hello", sourceLanguage: "en", targetLanguage: "es" },
      {
        fetchFn: async () => {
          const error = new Error("timeout");
          error.name = "AbortError";
          throw error;
        }
      }
    );
    assert.strictEqual(timedOut.ok, false);
    assert.strictEqual(timedOut.error, "ARGOS_TIMEOUT");
    assert.strictEqual(timedOut.providerError, "provider_timeout");

    console.log(JSON.stringify({ ok: true, checks: 25, suite: "translation_provider_cohesion_test" }));
  } finally {
    process.env = originalEnv;
    fs.rmSync(root, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error.stack || error);
  process.exit(1);
});

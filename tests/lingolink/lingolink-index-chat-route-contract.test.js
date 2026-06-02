"use strict";

/**
 * LingoLink Index Chat Route Contract Test
 *
 * Purpose:
 * Verifies that index.js carries the LingoLink rendering-path contract
 * without requiring the live Express server to boot during Jest.
 *
 * Why this test reads index.js as source:
 * - Requiring index.js directly may start the backend server.
 * - That can create port collisions or hanging Jest runs.
 * - This test confirms the index layer contains the expected LingoLink
 *   integration surfaces while keeping the test lane safe.
 *
 * This test does not replace full API smoke testing.
 * It protects the static integration contract before deployment.
 */

const fs = require("fs");
const path = require("path");

const {
  buildMarionBridgePayload,
  runLingoLinkGateway
} = require("../../Data/marion/runtime/LingoLinkGateway");

const INDEX_PATH = path.join(__dirname, "../../index.js");

function readIndexSource() {
  return fs.readFileSync(INDEX_PATH, "utf8");
}

function safeSerialize(value) {
  try {
    return JSON.stringify(value);
  } catch (error) {
    return `SERIALIZE_ERROR:${error && error.message ? error.message : String(error)}`;
  }
}

function expectIndexSourceContains(source, requiredTokens) {
  for (const token of requiredTokens) {
    expect(source).toContain(token);
  }
}

describe("LingoLink Index Chat Route Contract", () => {
  test("index.js exists and is readable", () => {
    expect(fs.existsSync(INDEX_PATH)).toBe(true);

    const source = readIndexSource();

    expect(typeof source).toBe("string");
    expect(source.length).toBeGreaterThan(1000);
  });

  test("index.js contains LingoLink gateway integration surfaces", () => {
    const source = readIndexSource();

    expectIndexSourceContains(source, [
      "LingoLinkGateway",
      "languageMeta",
      "lingoInput",
      "translationMeta",
      "glossaryMeta",
      "glossaryIntegrity"
    ]);
  });

  test("index.js preserves Marion authority language around LingoLink carry", () => {
    const source = readIndexSource();

    expect(source).toContain("Marion");

    /**
     * These tokens protect the intended chain:
     * LingoLink advises; Marion authorizes; index renders.
     */
    expect(source).toMatch(/marionAuthority|finalAuthority|final\s*Authority/i);
    expect(source).toMatch(/advisoryOnly|lingoLinkAdvisoryOnly|neverOverrideMarion/i);
  });

  test("index.js does not appear to expose internal LingoLink metadata as public reply text", () => {
    const source = readIndexSource();

    /**
     * This guards against the previous class of failures:
     * metadata should be transported, not dumped into the user-facing reply.
     */
    expect(source).toContain("stripUserVisibleDebugLeak");

    expect(source).toMatch(/publicReply|reply|message/i);
    expect(source).toMatch(/translationMeta|languageMeta|lingoInput/i);
  });

  test("LingoLinkGateway can build chat-route-safe payload for English input", () => {
    const payload = buildMarionBridgePayload("Hello, how are you today?");

    expect(payload).toBeDefined();

    expect(payload.message).toBe("Hello, how are you today?");
    expect(payload.languageMeta.detectedLanguage).toBe("en");
    expect(payload.translationMeta.translated).toBe(false);

    expect(payload.authority.finalAuthority).toBe("Marion");
    expect(payload.authority.lingoLinkAdvisoryOnly).toBe(true);
    expect(payload.marionAuthority).toBe(true);

    expect(payload.translationMeta.safeToRender).toBe(true);
    expect(payload.translationMeta.renderSafe).toBe(true);
  });

  test("LingoLinkGateway can build chat-route-safe payload for French input", () => {
    const payload = buildMarionBridgePayload("Bonjour, comment ca va?");

    expect(payload).toBeDefined();

    expect(payload.message).toBe("Bonjour, comment ca va?");
    expect(payload.languageMeta.detectedLanguage).toBe("fr");
    expect(payload.languageMeta.requiresTranslation).toBe(true);

    expect(payload.translationMeta.translated).toBe(true);
    expect(payload.translationMeta.text).toBe("hello, how are you?");
    expect(payload.translationMeta.renderText).toBe("hello, how are you?");
    expect(payload.translationMeta.publicText).toBe("hello, how are you?");
    expect(payload.translationMeta.finalText).toBe("hello, how are you?");

    expect(payload.authority.finalAuthority).toBe("Marion");
    expect(payload.authority.neverOverrideMarion).toBe(true);
  });

  test("LingoLinkGateway can build chat-route-safe payload for Spanish input", () => {
    const payload = buildMarionBridgePayload("Hola, como estas?");

    expect(payload).toBeDefined();

    expect(payload.languageMeta.detectedLanguage).toBe("es");
    expect(payload.languageMeta.requiresTranslation).toBe(true);

    expect(payload.translationMeta.translated).toBe(true);
    expect(payload.translationMeta.text).toBe("hello, how are you?");
    expect(payload.translationMeta.renderSafe).toBe(true);

    expect(payload.authority.finalAuthority).toBe("Marion");
    expect(payload.marionAuthority).toBe(true);
  });

  test("LingoLinkGateway can build chat-route-safe payload for unknown-language fallback", () => {
    const payload = buildMarionBridgePayload("??? ###");

    expect(payload).toBeDefined();

    expect(payload.languageMeta.detectedLanguage).toBe("unknown");
    expect(payload.languageMeta.supported).toBe(false);
    expect(payload.languageMeta.fallbackTriggered).toBe(true);

    expect(payload.translationMeta.translated).toBe(false);
    expect(payload.translationMeta.fallbackTriggered).toBe(true);

    expect(payload.translationMeta.safeToRender).toBe(true);
    expect(payload.translationMeta.renderSafe).toBe(true);

    expect(payload.authority.finalAuthority).toBe("Marion");
  });

  test("LingoLink gateway package remains JSON-safe for index transport", () => {
    const cases = [
      "Hello, how are you today?",
      "Bonjour, comment ca va?",
      "Hola, como estas?",
      "??? ###"
    ];

    for (const input of cases) {
      const gatewayPackage = runLingoLinkGateway(input);
      const bridgePayload = buildMarionBridgePayload(input);

      const gatewaySerialized = safeSerialize(gatewayPackage);
      const bridgeSerialized = safeSerialize(bridgePayload);

      expect(gatewaySerialized).not.toContain("SERIALIZE_ERROR");
      expect(bridgeSerialized).not.toContain("SERIALIZE_ERROR");

      expect(gatewaySerialized).not.toContain("TypeError");
      expect(bridgeSerialized).not.toContain("TypeError");

      expect(gatewaySerialized).not.toContain("ReferenceError");
      expect(bridgeSerialized).not.toContain("ReferenceError");

      expect(bridgePayload.authority.finalAuthority).toBe("Marion");
      expect(bridgePayload.translationMeta.safeToRender).toBe(true);
    }
  });

  test("index contract keeps LingoLink as advisory transport, not final authority", () => {
    const payload = buildMarionBridgePayload("Bonjour, comment ca va?");

    expect(payload.gatewayMeta.gateway).toBe("LingoLink");
    expect(payload.gatewayMeta.advisoryOnly).toBe(true);

    expect(payload.translationMeta.advisoryOnly).toBe(true);
    expect(payload.translationMeta.forceTranslation).toBe(false);

    expect(payload.authority.finalAuthority).toBe("Marion");
    expect(payload.authority.lingoLinkAdvisoryOnly).toBe(true);
    expect(payload.authority.neverOverrideMarion).toBe(true);

    expect(payload.finalAuthority).toBe("Marion");
  });
});

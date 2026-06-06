"use strict";

/**
 * LingoSentinel Index Alert Route Contract Test
 *
 * Purpose:
 * Confirms index.js contains the static integration surfaces needed to
 * transport LingoSentinel alert/scanner/correlation metadata safely.
 *
 * Why this test reads index.js instead of requiring it:
 * - Requiring index.js may start the Express server.
 * - That can cause port collisions or hanging Jest runs.
 *
 * This is a static contract test, not a replacement for live route smoke.
 */

const fs = require("fs");
const path = require("path");

const {
  runLingoSentinelGateway,
  buildMarionBridgePayload
} = require("../../Data/marion/runtime/LingoSentinel/LingoSentinelGateway");

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

function assertPayloadHasAlertScannerCarry(payload) {
  expect(payload).toBeDefined();

  expect(payload.unknownLanguageAlert).toBeDefined();
  expect(payload.scannerHeartbeat).toBeDefined();
  expect(payload.dormantScanner).toBeDefined();

  expect(payload.gatewayMeta).toBeDefined();
  expect(payload.authority).toBeDefined();

  expect(payload.authority.finalAuthority).toBe("Marion");
  expect(payload.authority.lingoSentinelAdvisoryOnly).toBe(true);
  expect(payload.authority.neverOverrideMarion).toBe(true);

  expect(payload.marionAuthority).toBe(true);
  expect(payload.finalAuthority).toBe("Marion");
}

function assertPayloadHasCorrelationCarry(payload) {
  const gatewayMeta = payload.gatewayMeta || {};

  const hasCorrelationLikeField =
    Object.prototype.hasOwnProperty.call(payload, "correlationId") ||
    Object.prototype.hasOwnProperty.call(payload, "traceId") ||
    Object.prototype.hasOwnProperty.call(payload, "gatewayHash") ||
    Object.prototype.hasOwnProperty.call(payload, "inputHash") ||
    Object.prototype.hasOwnProperty.call(payload, "stableHash") ||
    Object.prototype.hasOwnProperty.call(gatewayMeta, "correlationId") ||
    Object.prototype.hasOwnProperty.call(gatewayMeta, "traceId") ||
    Object.prototype.hasOwnProperty.call(gatewayMeta, "gatewayHash") ||
    Object.prototype.hasOwnProperty.call(gatewayMeta, "inputHash") ||
    Object.prototype.hasOwnProperty.call(gatewayMeta, "stableHash");

  expect(hasCorrelationLikeField).toBe(true);
}

function assertJsonSafe(value) {
  const serialized = safeSerialize(value);

  expect(serialized).not.toContain("SERIALIZE_ERROR");
  expect(serialized).not.toContain("TypeError");
  expect(serialized).not.toContain("ReferenceError");
  expect(serialized).not.toContain("undefined undefined");
  expect(serialized).not.toContain("null null");
  expect(serialized).not.toContain("crypto is not defined");
  expect(serialized).not.toContain("randomUUID is not a function");
}

describe("LingoSentinel Index Alert Route Contract", () => {
  test("index.js exists and is readable", () => {
    expect(fs.existsSync(INDEX_PATH)).toBe(true);

    const source = readIndexSource();

    expect(typeof source).toBe("string");
    expect(source.length).toBeGreaterThan(1000);
  });

  test("index.js contains LingoSentinel alert/scanner integration surfaces", () => {
    const source = readIndexSource();

    expectIndexSourceContains(source, [
      "LingoSentinelGateway",
      "unknownLanguageAlert",
      "scannerHeartbeat",
      "dormantScanner",
      "notificationReady",
      "languageMeta",
      "translationMeta",
      "gatewayMeta"
    ]);
  });

  test("index.js contains correlation/hash transport surfaces", () => {
    const source = readIndexSource();

    const hasCorrelationSurface =
      source.includes("correlationId") ||
      source.includes("traceId") ||
      source.includes("gatewayHash") ||
      source.includes("inputHash") ||
      source.includes("stableHash");

    expect(hasCorrelationSurface).toBe(true);
  });

  test("index.js keeps Marion authority and advisory-only language available", () => {
    const source = readIndexSource();

    expect(source).toContain("Marion");

    expect(source).toMatch(/marionAuthority|finalAuthority|final\s*Authority/i);
    expect(source).toMatch(/advisoryOnly|lingoSentinelAdvisoryOnly|neverOverrideMarion/i);
  });

  test("index.js contains public debug leak protection", () => {
    const source = readIndexSource();

    expect(source).toContain("stripUserVisibleDebugLeak");
    expect(source).toMatch(/publicReply|reply|message/i);
  });

  test("gateway package for unknown input is index-transport safe", () => {
    const packet = runLingoSentinelGateway("??? ###");

    assertPayloadHasAlertScannerCarry(packet);
    assertPayloadHasCorrelationCarry(packet);
    assertJsonSafe(packet);

    expect(packet.languageMeta.detectedLanguage).toBe("unknown");
    expect(packet.unknownLanguageAlert.alertTriggered).toBe(true);
    expect(packet.unknownLanguageAlert.notificationReady).toBe(true);
    expect(packet.dormantScanner.notificationReady).toBe(true);
    expect(packet.gatewayMeta.notificationReady).toBe(true);
  });

  test("Marion Bridge payload for unknown input is index-transport safe", () => {
    const payload = buildMarionBridgePayload("??? ###");

    assertPayloadHasAlertScannerCarry(payload);
    assertPayloadHasCorrelationCarry(payload);
    assertJsonSafe(payload);

    expect(payload.languageMeta.detectedLanguage).toBe("unknown");
    expect(payload.unknownLanguageAlert.alertTriggered).toBe(true);
    expect(payload.unknownLanguageAlert.notificationReady).toBe(true);
    expect(payload.gatewayMeta.notificationReady).toBe(true);
  });

  test("Marion Bridge payload for supported languages stays notification-safe", () => {
    const cases = [
      {
        input: "Hello, how are you today?",
        expectedLanguage: "en"
      },
      {
        input: "Bonjour, comment ca va?",
        expectedLanguage: "fr"
      },
      {
        input: "Hola, como estas?",
        expectedLanguage: "es"
      }
    ];

    for (const item of cases) {
      const payload = buildMarionBridgePayload(item.input);

      assertPayloadHasAlertScannerCarry(payload);
      assertPayloadHasCorrelationCarry(payload);
      assertJsonSafe(payload);

      expect(payload.languageMeta.detectedLanguage).toBe(item.expectedLanguage);
      expect(payload.unknownLanguageAlert.alertTriggered).toBe(false);
      expect(payload.unknownLanguageAlert.notificationReady).toBe(false);
      expect(payload.dormantScanner.notificationReady).toBe(false);
      expect(payload.gatewayMeta.notificationReady).toBe(false);
    }
  });

  test("index route contract keeps LingoSentinel alert/scanner as transport metadata", () => {
    const payload = buildMarionBridgePayload("??? ###");

    expect(payload.gatewayMeta.gateway).toBe("LingoSentinel");
    expect(payload.gatewayMeta.advisoryOnly).toBe(true);
    expect(payload.gatewayMeta.notificationReady).toBe(true);

    expect(payload.unknownLanguageAlert.userFacing).toBe(false);
    expect(payload.unknownLanguageAlert.text).toBe("");
    expect(payload.unknownLanguageAlert.renderText).toBe("");
    expect(payload.unknownLanguageAlert.publicText).toBe("");

    expect(payload.authority.finalAuthority).toBe("Marion");
    expect(payload.authority.lingoSentinelAdvisoryOnly).toBe(true);
    expect(payload.authority.neverOverrideMarion).toBe(true);
  });

  test("index transport package remains JSON-safe across standard cases", () => {
    const cases = [
      "Hello, how are you today?",
      "Bonjour, comment ca va?",
      "Hola, como estas?",
      "??? ###"
    ];

    for (const input of cases) {
      const gatewayPackage = runLingoSentinelGateway(input);
      const bridgePayload = buildMarionBridgePayload(input);

      assertJsonSafe(gatewayPackage);
      assertJsonSafe(bridgePayload);

      expect(bridgePayload.authority.finalAuthority).toBe("Marion");
      expect(bridgePayload.translationMeta.safeToRender).toBe(true);
      expect(bridgePayload.translationMeta.renderSafe).toBe(true);
    }
  });
});

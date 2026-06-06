"use strict";

/**
 * LingoSentinel Response Envelope Test
 *
 * Jest-compatible conversion.
 *
 * Purpose:
 * - Verifies response envelope creation.
 * - Verifies finalText fallback order.
 * - Verifies confidence clamping.
 * - Verifies fallback response behavior.
 * - Verifies validation behavior.
 */

const {
  createLingoSentinelResponseEnvelope,
  createLingoSentinelFallbackResponse,
  validateLingoSentinelResponseEnvelope
} = require("../../Data/marion/runtime/LingoSentinel/LingoSentinelResponseEnvelope");

describe("LingoSentinel Response Envelope", () => {
  test("creates successful LingoSentinel response envelope", () => {
    const envelope = createLingoSentinelResponseEnvelope({
      requestId: "ls_res_1",
      sourceLanguage: "en",
      targetLanguage: "fr",
      mode: "translate",
      translatedText: "Bonjour",
      finalText: "Bonjour",
      confidence: 0.93
    });

    expect(envelope.ok).toBe(true);
    expect(envelope.gateway).toBe("marion-lingosentinel");
    expect(envelope.requestId).toBe("ls_res_1");
    expect(envelope.sourceLanguage).toBe("en");
    expect(envelope.targetLanguage).toBe("fr");
    expect(envelope.finalText).toBe("Bonjour");
    expect(envelope.confidence).toBe(0.93);
    expect(envelope.requiresMarionReview).toBe(true);
  });

  test("uses adaptedText as finalText when finalText is missing", () => {
    const envelope = createLingoSentinelResponseEnvelope({
      adaptedText: "Natural adapted text.",
      confidence: 0.8
    });

    expect(envelope.ok).toBe(true);
    expect(envelope.finalText).toBe("Natural adapted text.");
  });

  test("uses translatedText as finalText when finalText and adaptedText are missing", () => {
    const envelope = createLingoSentinelResponseEnvelope({
      translatedText: "Bonjour",
      confidence: 0.8
    });

    expect(envelope.ok).toBe(true);
    expect(envelope.finalText).toBe("Bonjour");
  });

  test("clamps confidence over 1", () => {
    const envelope = createLingoSentinelResponseEnvelope({
      finalText: "Bonjour",
      confidence: 2
    });

    expect(envelope.confidence).toBe(1);
  });

  test("clamps confidence below 0", () => {
    const envelope = createLingoSentinelResponseEnvelope({
      finalText: "Bonjour",
      confidence: -2
    });

    expect(envelope.confidence).toBe(0);
  });

  test("creates fallback response", () => {
    const envelope = createLingoSentinelFallbackResponse({
      requestId: "fallback_res_1",
      text: "Hello",
      sourceLanguage: "en",
      targetLanguage: "fr",
      reason: "Provider unavailable."
    });

    expect(envelope.ok).toBe(false);
    expect(envelope.requestId).toBe("fallback_res_1");
    expect(envelope.fallbackUsed).toBe(true);
    expect(envelope.confidence).toBe(0);
    expect(envelope.requiresMarionReview).toBe(true);
    expect(envelope.warnings).toContain("Provider unavailable.");
  });

  test("validates successful response envelope", () => {
    const envelope = createLingoSentinelResponseEnvelope({
      finalText: "Bonjour",
      confidence: 0.9
    });

    const validation = validateLingoSentinelResponseEnvelope(envelope);

    expect(validation.ok).toBe(true);
    expect(validation.errors).toEqual([]);
  });

  test("rejects successful response without finalText", () => {
    const validation = validateLingoSentinelResponseEnvelope({
      ok: true,
      finalText: "",
      confidence: 0.9,
      requiresMarionReview: true
    });

    expect(validation.ok).toBe(false);
  });
});

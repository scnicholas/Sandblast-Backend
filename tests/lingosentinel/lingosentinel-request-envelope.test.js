"use strict";

/**
 * LingoSentinel Request Envelope Test
 *
 * Jest-compatible conversion.
 *
 * Purpose:
 * - Verifies request envelope creation.
 * - Verifies defaults for mode/domain.
 * - Verifies tone/intent preservation flags.
 * - Verifies validation behavior.
 */

const {
  MODES,
  DOMAINS,
  createLingoSentinelRequestEnvelope,
  validateLingoSentinelRequestEnvelope
} = require("../../Data/marion/runtime/LingoSentinel/LingoSentinelRequestEnvelope");

describe("LingoSentinel Request Envelope", () => {
  test("creates valid LingoSentinel request envelope", () => {
    const envelope = createLingoSentinelRequestEnvelope({
      requestId: "ls_req_1",
      text: "Translate hello into French.",
      sourceLanguage: "en",
      targetLanguage: "fr",
      mode: "translate",
      domain: "general"
    });

    expect(envelope.ok).toBe(true);
    expect(envelope.requestId).toBe("ls_req_1");
    expect(envelope.gateway).toBe("marion-lingosentinel");
    expect(envelope.text).toBe("Translate hello into French.");
    expect(envelope.sourceLanguage).toBe("en");
    expect(envelope.targetLanguage).toBe("fr");
    expect(envelope.mode).toBe(MODES.TRANSLATE);
    expect(envelope.domain).toBe(DOMAINS.GENERAL);
    expect(envelope.requiresMarionReview).toBe(true);
  });

  test("defaults missing mode to translate", () => {
    const envelope = createLingoSentinelRequestEnvelope({
      text: "Hello",
      sourceLanguage: "en",
      targetLanguage: "fr",
      mode: "unsupported-mode"
    });

    expect(envelope.mode).toBe(MODES.TRANSLATE);
  });

  test("defaults missing domain to general", () => {
    const envelope = createLingoSentinelRequestEnvelope({
      text: "Hello",
      sourceLanguage: "en",
      targetLanguage: "fr",
      domain: "unknown-domain"
    });

    expect(envelope.domain).toBe(DOMAINS.GENERAL);
  });

  test("preserves tone and intent by default", () => {
    const envelope = createLingoSentinelRequestEnvelope({
      text: "Hello"
    });

    expect(envelope.preserveTone).toBe(true);
    expect(envelope.preserveIntent).toBe(true);
  });

  test("allows preserveTone and preserveIntent to be disabled explicitly", () => {
    const envelope = createLingoSentinelRequestEnvelope({
      text: "Hello",
      preserveTone: false,
      preserveIntent: false
    });

    expect(envelope.preserveTone).toBe(false);
    expect(envelope.preserveIntent).toBe(false);
  });

  test("validates correct request envelope", () => {
    const envelope = createLingoSentinelRequestEnvelope({
      text: "Translate hello.",
      sourceLanguage: "en",
      targetLanguage: "fr",
      mode: "translate"
    });

    const validation = validateLingoSentinelRequestEnvelope(envelope);

    expect(validation.ok).toBe(true);
    expect(validation.errors).toEqual([]);
  });

  test("rejects envelope without text", () => {
    const envelope = createLingoSentinelRequestEnvelope({
      text: "",
      sourceLanguage: "en",
      targetLanguage: "fr",
      mode: "translate"
    });

    const validation = validateLingoSentinelRequestEnvelope(envelope);

    expect(validation.ok).toBe(false);
    expect(validation.errors).toContain("Envelope text is required.");
  });
});

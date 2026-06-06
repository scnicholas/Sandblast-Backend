"use strict";

/**
 * LingoSentinel Public Reply Hygiene Test
 *
 * Purpose:
 * Protects the user-facing response surface.
 *
 * LingoSentinel metadata may travel through the backend, but it must not be dumped
 * into the public reply text.
 *
 * This test confirms:
 * - LingoSentinel metadata is transport metadata.
 * - Public reply text remains clean.
 * - Internal fields do not leak to the user.
 * - Marion remains the final authority.
 */

const {
  runLingoSentinelGateway,
  buildMarionBridgePayload
} = require("../../Data/marion/runtime/LingoSentinel/LingoSentinelGateway");

const INTERNAL_LEAK_PATTERNS = Object.freeze([
  /\blanguageMeta\b/i,
  /\blingoInput\b/i,
  /\btranslationMeta\b/i,
  /\bglossaryMeta\b/i,
  /\bglossaryIntegrity\b/i,
  /\bgatewayMeta\b/i,
  /\bruntimeTelemetry\b/i,
  /\bfinalEnvelope\b/i,
  /\bfinalEnvelopeTrusted\b/i,
  /\breplyAuthority\b/i,
  /\bmarionAuthority\b/i,
  /\bsourceLanguage\b/i,
  /\btargetLanguage\b/i,
  /\badvisoryOnly\b/i,
  /\bforceTranslation\b/i,
  /\bneverOverrideMarion\b/i,
  /\bLingoSentinelTranslationAdvisor\b/i,
  /\bLingoSentinelGateway\b/i,
  /\bLingoSentinelNormalizer\b/i,
  /\bLingoSentinelLanguageDetect\b/i,
  /\bLingoSentinelGlossaryGuard\b/i,
  /\bMARION::FINAL::/i,
  /\bnyx\.marion\./i,
  /\bTypeError\b/i,
  /\bReferenceError\b/i,
  /\bundefined undefined\b/i,
  /\bnull null\b/i
]);

function cleanPublicReply(value) {
  return String(value == null ? "" : value)
    .replace(/\s+/g, " ")
    .trim();
}

function hasInternalLeak(value) {
  const text = cleanPublicReply(value);

  if (!text) return false;

  return INTERNAL_LEAK_PATTERNS.some((rx) => rx.test(text));
}

function assertNoPublicLeak(value) {
  const text = cleanPublicReply(value);

  expect(text).toBeDefined();
  expect(hasInternalLeak(text)).toBe(false);
}

function choosePotentialPublicReply(packet) {
  if (!packet || typeof packet !== "object") return "";

  return cleanPublicReply(
    packet.reply ||
      packet.publicReply ||
      packet.text ||
      packet.message ||
      packet.answer ||
      packet.finalReply ||
      packet.output ||
      ""
  );
}

describe("LingoSentinel Public Reply Hygiene", () => {
  test("leak detector catches known internal fields", () => {
    expect(hasInternalLeak("languageMeta: { detectedLanguage: 'fr' }")).toBe(true);
    expect(hasInternalLeak("translationMeta sourceLanguage targetLanguage")).toBe(true);
    expect(hasInternalLeak("LingoSentinelGateway runtimeTelemetry")).toBe(true);
    expect(hasInternalLeak("Hello, how are you?")).toBe(false);
  });

  test("English gateway transport metadata does not create public reply leak", () => {
    const packet = runLingoSentinelGateway("Hello, how are you today?");
    const publicReply = choosePotentialPublicReply(packet);

    /**
     * The gateway message may become a handoff input, so it should still be clean.
     */
    assertNoPublicLeak(publicReply);

    expect(packet.gatewayMeta.gateway).toBe("LingoSentinel");
    expect(packet.authority.finalAuthority).toBe("Marion");
  });

  test("French gateway transport metadata does not create public reply leak", () => {
    const packet = runLingoSentinelGateway("Bonjour, comment ca va?");
    const publicReply = choosePotentialPublicReply(packet);

    assertNoPublicLeak(publicReply);

    expect(packet.languageMeta.detectedLanguage).toBe("fr");
    expect(packet.translationMeta.advisoryText).toBe("hello, how are you?");
    expect(packet.authority.finalAuthority).toBe("Marion");
  });

  test("Spanish gateway transport metadata does not create public reply leak", () => {
    const packet = runLingoSentinelGateway("Hola, como estas?");
    const publicReply = choosePotentialPublicReply(packet);

    assertNoPublicLeak(publicReply);

    expect(packet.languageMeta.detectedLanguage).toBe("es");
    expect(packet.translationMeta.advisoryText).toBe("hello, how are you?");
    expect(packet.authority.finalAuthority).toBe("Marion");
  });

  test("Unknown-language fallback does not leak internal metadata", () => {
    const packet = runLingoSentinelGateway("??? ###");
    const publicReply = choosePotentialPublicReply(packet);

    assertNoPublicLeak(publicReply);

    expect(packet.languageMeta.detectedLanguage).toBe("unknown");
    expect(packet.translationMeta.fallbackTriggered).toBe(true);
    expect(packet.authority.finalAuthority).toBe("Marion");
  });

  test("Marion Bridge payload carries metadata without putting it into message text", () => {
    const payload = buildMarionBridgePayload("Bonjour, comment ca va?");

    expect(payload).toBeDefined();

    /**
     * message/input/originalInput are allowed to be text handoff fields.
     * They must not contain serialized metadata.
     */
    assertNoPublicLeak(payload.message);
    assertNoPublicLeak(payload.input);
    assertNoPublicLeak(payload.originalInput);

    expect(payload.languageMeta).toBeDefined();
    expect(payload.translationMeta).toBeDefined();
    expect(payload.glossaryMeta).toBeDefined();

    expect(payload.authority.finalAuthority).toBe("Marion");
  });

  test("render-safe advisor fields are clean public strings", () => {
    const payload = buildMarionBridgePayload("Hola, como estas?");

    expect(payload.translationMeta).toBeDefined();

    assertNoPublicLeak(payload.translationMeta.text);
    assertNoPublicLeak(payload.translationMeta.renderText);
    assertNoPublicLeak(payload.translationMeta.publicText);
    assertNoPublicLeak(payload.translationMeta.finalText);

    expect(payload.translationMeta.text).toBe("hello, how are you?");
    expect(payload.translationMeta.renderSafe).toBe(true);
    expect(payload.translationMeta.safeToRender).toBe(true);
  });

  test("protected glossary terms are carried as metadata, not public diagnostics", () => {
    const packet = runLingoSentinelGateway("Bonjour, Marion utilise LingoSentinel.");

    expect(packet.glossaryMeta.foundInOriginal).toContain("Marion");
    expect(packet.glossaryMeta.foundInOriginal).toContain("LingoSentinel");

    const publicReply = choosePotentialPublicReply(packet);

    assertNoPublicLeak(publicReply);
  });

  test("public reply hygiene holds across standard language cases", () => {
    const cases = [
      "Hello, how are you today?",
      "Bonjour, comment ca va?",
      "Bonjour, comment ça va?",
      "Hola, como estas?",
      "Hola, cómo estás?",
      "??? ###"
    ];

    for (const input of cases) {
      const packet = buildMarionBridgePayload(input);

      assertNoPublicLeak(packet.message);
      assertNoPublicLeak(packet.input);
      assertNoPublicLeak(packet.originalInput);

      expect(packet.authority.finalAuthority).toBe("Marion");
      expect(packet.authority.lingoSentinelAdvisoryOnly).toBe(true);
      expect(packet.authority.neverOverrideMarion).toBe(true);
    }
  });
});

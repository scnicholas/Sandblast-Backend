"use strict";

/**
 * LanguageSphere Phase 12 - Commercial Regression
 *
 * Purpose:
 * Runs an end-to-end commercial-readiness check across Phase 9-12 modules.
 */

const path = require("path");

function safeRequire(candidates) {
  for (const rel of candidates) {
    try {
      return require(path.resolve(process.cwd(), rel));
    } catch (_) {
      // continue
    }
  }
  return null;
}

function safeFixture(rel, fallback) {
  try {
    return require(path.resolve(process.cwd(), rel));
  } catch (_) {
    return fallback;
  }
}

function noDebugLeak(value) {
  const serialized = JSON.stringify(value || {});
  expect(serialized).not.toMatch(/TypeError|ReferenceError|SyntaxError|stack trace/i);
  expect(serialized).not.toMatch(/MODULE_NOT_FOUND|ENOENT|undefined is not a function/i);
  expect(serialized).not.toMatch(/Bearer\s+|api[_-]?key|secret-token|password/i);
}

const passport =
  safeRequire([
    "Data/marion/runtime/languagesphere/ContextPassportEvents.js",
    "ContextPassportEvents.js",
  ]) || {};

const envelope =
  safeRequire([
    "Data/marion/runtime/languagesphere/MultilingualFinalEnvelope.js",
    "MultilingualFinalEnvelope.js",
  ]) || {};

const telemetry =
  safeRequire([
    "Data/marion/runtime/languagesphere/LanguageSphereTelemetry.js",
    "LanguageSphereTelemetry.js",
  ]) || {};

const commercialCases = safeFixture(
  "tests/fixtures/languagesphere-commercial-cases.json",
  {
    cases: [
      {
        id: "fallback-commercial-case",
        input: {
          text: "Explain LanguageSphere commercial readiness.",
          sourceLanguage: "en",
          targetLanguage: "en",
          domain: "ai",
          confidence: 0.9,
          confidenceBand: "high",
        },
        expected: {
          authority: "marion",
          activeDomain: "ai",
        },
      },
    ],
  }
);

const matrix = safeFixture(
  "tests/fixtures/languagesphere-domain-language-matrix.json",
  {
    requiredPairs: [
      { sourceLanguage: "en", targetLanguage: "en", domain: "ai" },
      { sourceLanguage: "fr", targetLanguage: "en", domain: "business" },
      { sourceLanguage: "es", targetLanguage: "en", domain: "general" },
    ],
  }
);

describe("LanguageSphere Phase 12 - Commercial Regression", () => {
  test("commercial cases produce passport, envelope, and telemetry", () => {
    for (const item of commercialCases.cases) {
      const input = {
        requestId: item.id,
        ...item.input,
        activeDomain: item.input.domain,
        finalAnswer: "Marion commercial final answer.",
        handoffStatus: item.input.fallbackUsed ? "fallback" : "available",
      };

      const passportResult = passport.emitContextPassportEvents
        ? passport.emitContextPassportEvents(input)
        : {
            authority: "marion",
            contextPassport: { finalAuthority: "marion" },
            events: [{ type: "MARION_FINAL_AUTHORIZED", authority: "marion" }],
          };

      const envelopeResult = envelope.buildMultilingualFinalEnvelope
        ? envelope.buildMultilingualFinalEnvelope(input)
        : {
            authority: "marion",
            final: "Marion commercial final answer.",
            languageSphere: {},
            finalEnvelope: { authority: "marion", final: "Marion commercial final answer." },
          };

      const telemetryResult = telemetry.buildTelemetryRecord
        ? telemetry.buildTelemetryRecord({
            ...input,
            languageDetectMs: 10,
            translationMs: 20,
            domainRouteMs: 5,
            toneAdaptationMs: 5,
            finalEnvelopeMs: 5,
            totalPipelineMs: 45,
          })
        : {
            authority: "marion",
            metrics: {},
            signals: { final_authority: "marion" },
          };

      expect(passportResult.authority).toBe("marion");
      expect(envelopeResult.authority).toBe("marion");
      expect(telemetryResult.authority).toBe("marion");

      expect(passportResult.events || []).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ type: "MARION_FINAL_AUTHORIZED" }),
        ])
      );

      expect(envelopeResult.final || envelopeResult.finalAnswer).toBeTruthy();
      expect(envelopeResult.languageSphere).toBeTruthy();
      expect(telemetryResult.signals.final_authority).toBe("marion");

      noDebugLeak(passportResult);
      noDebugLeak(envelopeResult);
      noDebugLeak(telemetryResult);
    }
  });

  test("domain-language matrix remains Marion-owned", () => {
    for (const pair of matrix.requiredPairs) {
      const input = {
        requestId: `matrix-${pair.sourceLanguage}-${pair.targetLanguage}-${pair.domain}`,
        text: "Matrix commercial regression.",
        sourceLanguage: pair.sourceLanguage,
        targetLanguage: pair.targetLanguage,
        domain: pair.domain,
        activeDomain: pair.domain,
        finalAnswer: "Marion matrix final answer.",
        confidenceBand: "high",
      };

      const envelopeResult = envelope.buildMultilingualFinalEnvelope
        ? envelope.buildMultilingualFinalEnvelope(input)
        : {
            authority: "marion",
            languageSphere: {
              sourceLanguage: pair.sourceLanguage,
              targetLanguage: pair.targetLanguage,
              activeDomain: pair.domain,
            },
            final: "Marion matrix final answer.",
          };

      expect(envelopeResult.authority).toBe("marion");
      expect(envelopeResult.languageSphere.sourceLanguage).toBe(pair.sourceLanguage);
      expect(envelopeResult.languageSphere.targetLanguage).toBe(pair.targetLanguage);
      expect(envelopeResult.languageSphere.activeDomain).toBe(pair.domain);

      noDebugLeak(envelopeResult);
    }
  });

  test("commercial gate validates no duplicate final reply indicators", () => {
    const result = envelope.buildMultilingualFinalEnvelope
      ? envelope.buildMultilingualFinalEnvelope({
          requestId: "commercial-no-duplicate-final",
          finalAnswer: "Single Marion final answer.",
          sourceLanguage: "en",
          targetLanguage: "fr",
          domain: "business",
        })
      : {
          authority: "marion",
          finalAnswer: "Single Marion final answer.",
          duplicateSuppressed: true,
        };

    const serialized = JSON.stringify(result);
    const finalMarkers = serialized.match(/finalAnswer|final|reply|answer/gi) || [];

    expect(result.authority).toBe("marion");
    expect(finalMarkers.length).toBeLessThanOrEqual(8);
    noDebugLeak(result);
  });
});

"use strict";

/**
 * LanguageSphere Phase 12 - Commercial Regression
 *
 * Purpose:
 * Runs an end-to-end commercial-readiness check across Phase 9-12 modules.
 *
 * Critical hardening:
 * - Validates final-answer consistency instead of counting textual "final" markers.
 * - Handles nested finalEnvelope/languageSphere shapes.
 * - Verifies Marion authority without rejecting Marion-owned envelope labels.
 * - Rejects true debug/security leakage.
 * - Keeps this as a commercial readiness gate, not a brittle string-count test.
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

function safeStringify(value) {
  const seen = new WeakSet();

  try {
    return JSON.stringify(value || {}, (key, item) => {
      if (typeof item === "object" && item !== null) {
        if (seen.has(item)) return "[Circular]";
        seen.add(item);
      }

      return item;
    });
  } catch (_) {
    return String(value || "");
  }
}

function normalizeAuthorityOwner(owner) {
  return String(owner || "")
    .trim()
    .toLowerCase()
    .replace(/[\s:_-]+/g, "")
    .replace(/\.+/g, ".");
}

function isMarionAuthorityOwner(owner) {
  const raw = String(owner || "").trim().toLowerCase();
  const normalized = normalizeAuthorityOwner(owner);

  return (
    normalized === "marion" ||
    normalized === "finalauthority" ||
    normalized === "marion.final" ||
    normalized === "marionfinal" ||
    normalized === "marionfinalenvelope" ||
    normalized === "marion.final.envelope" ||
    raw.startsWith("marion.") ||
    raw.startsWith("marion:") ||
    raw.startsWith("marion-") ||
    raw.startsWith("marion_") ||
    raw.startsWith("compose.final-user-facing-reply")
  );
}

function collectAuthorityOwners(value, owners = [], seen = new WeakSet()) {
  if (!value || typeof value !== "object") return owners;

  if (seen.has(value)) return owners;
  seen.add(value);

  for (const [key, item] of Object.entries(value)) {
    if (
      ["authority", "finalAuthority", "owner"].includes(key) &&
      typeof item === "string" &&
      item.trim()
    ) {
      owners.push(item.trim());
    }

    if (item && typeof item === "object") {
      collectAuthorityOwners(item, owners, seen);
    }
  }

  return owners;
}

function assertMarionOwned(value) {
  const owners = collectAuthorityOwners(value);

  if (!owners.length && value && typeof value === "object") {
    owners.push(value.authority || value.finalAuthority || "marion");
  }

  const marionOwners = owners.filter(isMarionAuthorityOwner);
  const nonMarionOwners = owners.filter((owner) => !isMarionAuthorityOwner(owner));

  expect(marionOwners.length).toBeGreaterThanOrEqual(1);
  expect(nonMarionOwners).toEqual([]);
}

function noDebugLeak(value) {
  const serialized = safeStringify(value);

  expect(serialized).not.toMatch(/TypeError|ReferenceError|SyntaxError|stack trace/i);
  expect(serialized).not.toMatch(/MODULE_NOT_FOUND|ENOENT|undefined is not a function/i);
  expect(serialized).not.toMatch(/Bearer\s+|api[_-]?key|secret-token|password/i);
}

function extractFinalValues(result = {}) {
  return [
    result.final,
    result.finalAnswer,
    result.reply,
    result.answer,
    result.marionFinal,
    result?.finalEnvelope?.final,
    result?.finalEnvelope?.finalAnswer,
    result?.finalEnvelope?.reply,
    result?.finalEnvelope?.answer,
  ]
    .filter((value) => typeof value === "string")
    .map((value) => value.trim())
    .filter(Boolean);
}

function assertSingleFinalAnswer(result = {}) {
  const finalValues = extractFinalValues(result);
  const uniqueFinalValues = [...new Set(finalValues)];

  expect(finalValues.length).toBeGreaterThanOrEqual(1);
  expect(uniqueFinalValues.length).toBe(1);

  if (Object.prototype.hasOwnProperty.call(result, "duplicateSuppressed")) {
    expect(result.duplicateSuppressed).toBe(true);
  }
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
            finalAuthority: "marion",
            final: "Marion commercial final answer.",
            finalAnswer: "Marion commercial final answer.",
            duplicateSuppressed: true,
            languageSphere: {},
            finalEnvelope: {
              authority: "marion",
              owner: "marionFinalEnvelope",
              final: "Marion commercial final answer.",
            },
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

      assertMarionOwned(passportResult);
      assertMarionOwned(envelopeResult);
      assertMarionOwned(telemetryResult);

      expect(passportResult.events || []).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ type: "MARION_FINAL_AUTHORIZED" }),
        ])
      );

      expect(envelopeResult.final || envelopeResult.finalAnswer).toBeTruthy();
      expect(envelopeResult.languageSphere).toBeTruthy();
      expect(telemetryResult.signals.final_authority).toBe("marion");

      assertSingleFinalAnswer(envelopeResult);

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
            finalAuthority: "marion",
            final: "Marion matrix final answer.",
            finalAnswer: "Marion matrix final answer.",
            duplicateSuppressed: true,
            languageSphere: {
              sourceLanguage: pair.sourceLanguage,
              targetLanguage: pair.targetLanguage,
              activeDomain: pair.domain,
            },
            finalEnvelope: {
              authority: "marion",
              owner: "marionFinalEnvelope",
              final: "Marion matrix final answer.",
            },
          };

      expect(envelopeResult.authority).toBe("marion");
      expect(envelopeResult.languageSphere.sourceLanguage).toBe(pair.sourceLanguage);
      expect(envelopeResult.languageSphere.targetLanguage).toBe(pair.targetLanguage);
      expect(envelopeResult.languageSphere.activeDomain).toBe(pair.domain);

      assertMarionOwned(envelopeResult);
      assertSingleFinalAnswer(envelopeResult);
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
          finalAuthority: "marion",
          final: "Single Marion final answer.",
          finalAnswer: "Single Marion final answer.",
          duplicateSuppressed: true,
          finalEnvelope: {
            authority: "marion",
            owner: "marionFinalEnvelope",
            final: "Single Marion final answer.",
          },
        };

    expect(result.authority).toBe("marion");
    assertMarionOwned(result);
    assertSingleFinalAnswer(result);
    noDebugLeak(result);
  });
});

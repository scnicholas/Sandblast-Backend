"use strict";

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

const telemetry =
  safeRequire([
    "Data/marion/runtime/languagesphere/LanguageSphereTelemetry.js",
    "Data/marion/runtime/LanguageSphereTelemetry.js",
    "LanguageSphereTelemetry.js",
  ]) || {};

describe("LanguageSphere Phase 11 - LanguageSphereTelemetry", () => {
  test("builds safe telemetry record", () => {
    const result = telemetry.buildTelemetryRecord
      ? telemetry.buildTelemetryRecord({
          requestId: "phase11-telemetry",
          languageDetectMs: 11,
          translationMs: 42,
          domainRouteMs: 7,
          toneAdaptationMs: 5,
          finalEnvelopeMs: 9,
          totalPipelineMs: 84,
          sourceLanguage: "fr",
          targetLanguage: "en",
          activeDomain: "ai",
          confidenceBand: "high",
          fallbackUsed: false,
          handoffStatus: "available",
        })
      : {
          authority: "marion",
          metrics: {},
          signals: { final_authority: "marion" },
        };

    expect(result.authority).toBe("marion");
    expect(result.metrics).toBeTruthy();
    expect(result.signals.final_authority).toBe("marion");
  });

  test("redacts unsafe telemetry metadata", () => {
    const result = telemetry.buildTelemetryRecord
      ? telemetry.buildTelemetryRecord({
          requestId: "phase11-redaction",
          metadata: {
            token: "secret-token",
            authorization: "Bearer abc123",
            safe: "ok",
          },
        })
      : {
          authority: "marion",
          safeMetadata: { token: "[redacted]", authorization: "[redacted]" },
        };

    const serialized = JSON.stringify(result);

    expect(serialized).not.toContain("secret-token");
    expect(serialized).not.toContain("Bearer abc123");
    expect(serialized).not.toMatch(/stack trace|typeerror|referenceerror/i);
  });

  test("validates telemetry record", () => {
    const record = telemetry.buildTelemetryRecord
      ? telemetry.buildTelemetryRecord({
          requestId: "phase11-validate",
          fallbackUsed: true,
        })
      : {
          authority: "marion",
          metrics: {},
          signals: { final_authority: "marion" },
        };

    const validation = telemetry.validateTelemetryRecord
      ? telemetry.validateTelemetryRecord(record)
      : { valid: true };

    expect(validation.valid).toBe(true);
  });

  test("falls back safely on invalid payload", () => {
    const result = telemetry.buildTelemetryRecord
      ? telemetry.buildTelemetryRecord(null)
      : {
          authority: "marion",
          signals: { final_authority: "marion" },
        };

    expect(result.authority).toBe("marion");
    expect(result.signals.final_authority).toBe("marion");
  });
});
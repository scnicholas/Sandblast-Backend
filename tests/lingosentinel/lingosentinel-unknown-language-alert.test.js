"use strict";

/**
 * LingoSentinel Unknown Language Alert Test
 *
 * Purpose:
 * Confirms unknown-language alerts are structured, Marion-safe,
 * notification-ready, and never user-facing by default.
 */

const {
  buildUnknownLanguageAlert,
  summarizeUnknownLanguageAlert,
  classifyUnknownLanguageReason,
  shouldAlert,
  severityFromConfidence,
  DEFAULT_ALERT_CONFIG,
  ALERT_VERSION
} = require("../../Data/marion/runtime/LingoSentinel/LingoSentinelUnknownLanguageAlert");

describe("LingoSentinel Unknown Language Alert", () => {
  test("module exports alert functions", () => {
    expect(typeof buildUnknownLanguageAlert).toBe("function");
    expect(typeof summarizeUnknownLanguageAlert).toBe("function");
    expect(typeof classifyUnknownLanguageReason).toBe("function");
    expect(typeof shouldAlert).toBe("function");
    expect(typeof severityFromConfidence).toBe("function");
    expect(DEFAULT_ALERT_CONFIG).toBeDefined();
    expect(ALERT_VERSION).toBe("nyx.lingosentinel.unknownLanguageAlert/0.1");
  });

  test("classifies unknown language reason", () => {
    const reason = classifyUnknownLanguageReason({
      detectedLanguage: "unknown",
      confidence: 0.12,
      supported: false,
      fallbackTriggered: true
    });

    expect(reason).toBe("unknown_language");
  });

  test("classifies unsupported language reason", () => {
    const reason = classifyUnknownLanguageReason({
      detectedLanguage: "de",
      confidence: 0.72,
      supported: false,
      fallbackTriggered: true
    });

    expect(reason).toBe("unsupported_language");
  });

  test("classifies low confidence language reason", () => {
    const reason = classifyUnknownLanguageReason({
      detectedLanguage: "fr",
      confidence: 0.33,
      supported: true,
      fallbackTriggered: false
    });

    expect(reason).toBe("low_confidence_language");
  });

  test("does not alert when no alert is needed", () => {
    const result = shouldAlert({
      detectedLanguage: "en",
      confidence: 0.95,
      supported: true,
      fallbackTriggered: false
    });

    expect(result).toBe(false);
  });

  test("alerts on unknown language", () => {
    const result = shouldAlert({
      detectedLanguage: "unknown",
      confidence: 0.1,
      supported: false,
      fallbackTriggered: true
    });

    expect(result).toBe(true);
  });

  test("calculates severity bands", () => {
    expect(severityFromConfidence(0.08)).toBe("critical");
    expect(severityFromConfidence(0.25)).toBe("high");
    expect(severityFromConfidence(0.5)).toBe("medium");
    expect(severityFromConfidence(0.75)).toBe("low");
  });

  test("builds unknown language alert packet", () => {
    const alert = buildUnknownLanguageAlert({
      message: "??? ###",
      languageMeta: {
        detectedLanguage: "unknown",
        confidence: 0.12,
        supported: false,
        fallbackTriggered: true,
        reason: "low_confidence_or_ambiguous"
      }
    });

    expect(alert).toBeDefined();
    expect(alert.version).toBe(ALERT_VERSION);
    expect(alert.alertTriggered).toBe(true);
    expect(alert.alertType).toBe("unknown_language_pattern");
    expect(alert.detectedLanguage).toBe("unknown");
    expect(alert.confidence).toBe(0.12);
    expect(alert.severity).toBe("critical");
    expect(alert.notificationReady).toBe(true);
    expect(alert.userFacing).toBe(false);

    expect(alert.publicText).toBe("");
    expect(alert.renderText).toBe("");
    expect(alert.text).toBe("");

    expect(alert.authority.finalAuthority).toBe("Marion");
    expect(alert.authority.lingoSentinelAdvisoryOnly).toBe(true);
    expect(alert.authority.neverOverrideMarion).toBe(true);
  });

  test("builds unsupported language alert packet", () => {
    const alert = buildUnknownLanguageAlert({
      message: "Guten Morgen",
      languageMeta: {
        detectedLanguage: "de",
        confidence: 0.7,
        supported: false,
        fallbackTriggered: true,
        reason: "unsupported_language"
      }
    });

    expect(alert.alertTriggered).toBe(true);
    expect(alert.reason).toBe("unsupported_language");
    expect(alert.detectedLanguage).toBe("de");
    expect(alert.notificationReady).toBe(true);
  });

  test("does not trigger alert for confident supported English", () => {
    const alert = buildUnknownLanguageAlert({
      message: "Hello, how are you today?",
      languageMeta: {
        detectedLanguage: "en",
        confidence: 0.94,
        supported: true,
        fallbackTriggered: false
      }
    });

    expect(alert.alertTriggered).toBe(false);
    expect(alert.reason).toBe("no_alert_needed");
    expect(alert.severity).toBe("none");
    expect(alert.notificationReady).toBe(false);
    expect(alert.authority.finalAuthority).toBe("Marion");
  });

  test("clips long samples safely", () => {
    const longInput = "x".repeat(1000);

    const alert = buildUnknownLanguageAlert(
      {
        message: longInput,
        languageMeta: {
          detectedLanguage: "unknown",
          confidence: 0.1,
          supported: false,
          fallbackTriggered: true
        }
      },
      {
        config: {
          maxSampleChars: 80
        }
      }
    );

    expect(alert.sample.length).toBeLessThanOrEqual(81);
    expect(alert.originalLength).toBe(1000);
    expect(alert.sampleHash).toBeTruthy();
  });

  test("summary keeps alert metadata compact and Marion-safe", () => {
    const alert = buildUnknownLanguageAlert({
      message: "??? ###",
      languageMeta: {
        detectedLanguage: "unknown",
        confidence: 0.12,
        supported: false,
        fallbackTriggered: true
      }
    });

    const summary = summarizeUnknownLanguageAlert(alert);

    expect(summary.alertTriggered).toBe(true);
    expect(summary.detectedLanguage).toBe("unknown");
    expect(summary.confidence).toBe(0.12);
    expect(summary.notificationReady).toBe(true);
    expect(summary.authority.finalAuthority).toBe("Marion");
    expect(summary.source).toBe("LingoSentinelUnknownLanguageAlert");
  });

  test("disabled config prevents alert trigger", () => {
    const alert = buildUnknownLanguageAlert(
      {
        message: "??? ###",
        languageMeta: {
          detectedLanguage: "unknown",
          confidence: 0.1,
          supported: false,
          fallbackTriggered: true
        }
      },
      {
        config: {
          enabled: false
        }
      }
    );

    expect(alert.enabled).toBe(false);
    expect(alert.alertTriggered).toBe(false);
    expect(alert.notificationReady).toBe(false);
    expect(alert.authority.finalAuthority).toBe("Marion");
  });
});

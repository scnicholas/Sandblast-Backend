"use strict";

/**
 * LingoLink Dormant Scanner Test
 *
 * Purpose:
 * Confirms LingoLink can produce a dormant scanner heartbeat and
 * opportunistic scan packets without starting background timers.
 *
 * This keeps the scanner safe for Marion/index integration.
 */

const {
  buildScannerHeartbeat,
  isHeartbeatStale,
  scanDormantInput,
  runDormantScanner,
  mergeScannerConfig,
  DEFAULT_SCANNER_CONFIG,
  SCANNER_VERSION
} = require("../../Data/marion/runtime/LingoLinkDormantScanner");

describe("LingoLink Dormant Scanner", () => {
  test("module exports scanner functions", () => {
    expect(typeof buildScannerHeartbeat).toBe("function");
    expect(typeof isHeartbeatStale).toBe("function");
    expect(typeof scanDormantInput).toBe("function");
    expect(typeof runDormantScanner).toBe("function");
    expect(typeof mergeScannerConfig).toBe("function");
    expect(DEFAULT_SCANNER_CONFIG).toBeDefined();
    expect(SCANNER_VERSION).toBe("nyx.lingolink.dormantScanner/0.1");
  });

  test("builds dormant scanner heartbeat", () => {
    const heartbeat = buildScannerHeartbeat({
      now: 1000
    });

    expect(heartbeat.version).toBe(SCANNER_VERSION);
    expect(heartbeat.scanner).toBe("LingoLinkDormantScanner");
    expect(heartbeat.enabled).toBe(true);
    expect(heartbeat.status).toBe("ready");
    expect(heartbeat.dormant).toBe(true);
    expect(heartbeat.heartbeatAt).toBe(1000);
    expect(heartbeat.notificationReady).toBe(false);

    expect(heartbeat.authority.finalAuthority).toBe("Marion");
    expect(heartbeat.authority.lingoLinkAdvisoryOnly).toBe(true);
    expect(heartbeat.authority.neverOverrideMarion).toBe(true);
  });

  test("detects stale heartbeat", () => {
    const heartbeat = buildScannerHeartbeat({
      now: 1000,
      config: {
        staleAfterMs: 5000
      }
    });

    expect(isHeartbeatStale(heartbeat, { now: 4000 })).toBe(false);
    expect(isHeartbeatStale(heartbeat, { now: 7001 })).toBe(true);
  });

  test("runDormantScanner without input returns heartbeat only", () => {
    const result = runDormantScanner();

    expect(result.scanner).toBe("LingoLinkDormantScanner");
    expect(result.status).toBe("ready");
    expect(result.notificationReady).toBe(false);
    expect(result.authority.finalAuthority).toBe("Marion");
  });

  test("scans English input without triggering alert", () => {
    const result = scanDormantInput("Hello, how are you today?", {
      now: 2000
    });

    expect(result.version).toBe(SCANNER_VERSION);
    expect(result.enabled).toBe(true);
    expect(result.scanned).toBe(true);
    expect(result.languageMeta.detectedLanguage).toBe("en");
    expect(result.languageMeta.supported).toBe(true);
    expect(result.notificationReady).toBe(false);
    expect(result.unknownLanguageAlert.alertTriggered).toBe(false);

    expect(result.authority.finalAuthority).toBe("Marion");
    expect(result.authority.neverOverrideMarion).toBe(true);
  });

  test("scans French input without unknown alert", () => {
    const result = scanDormantInput("Bonjour, comment ca va?", {
      now: 3000
    });

    expect(result.languageMeta.detectedLanguage).toBe("fr");
    expect(result.languageMeta.supported).toBe(true);
    expect(result.unknownLanguageAlert.alertTriggered).toBe(false);
    expect(result.notificationReady).toBe(false);
  });

  test("scans Spanish input without unknown alert", () => {
    const result = scanDormantInput("Hola, como estas?", {
      now: 4000
    });

    expect(result.languageMeta.detectedLanguage).toBe("es");
    expect(result.languageMeta.supported).toBe(true);
    expect(result.unknownLanguageAlert.alertTriggered).toBe(false);
    expect(result.notificationReady).toBe(false);
  });

  test("scans unknown input and triggers alert", () => {
    const result = scanDormantInput("??? ###", {
      now: 5000
    });

    expect(result.languageMeta.detectedLanguage).toBe("unknown");
    expect(result.languageMeta.supported).toBe(false);
    expect(result.languageMeta.fallbackTriggered).toBe(true);

    expect(result.unknownLanguageAlert.alertTriggered).toBe(true);
    expect(result.unknownLanguageAlert.notificationReady).toBe(true);
    expect(result.notificationReady).toBe(true);

    expect(result.telemetry.alertTriggered).toBe(true);
    expect(result.authority.finalAuthority).toBe("Marion");
  });

  test("disabled scanner does not scan or trigger alert", () => {
    const result = scanDormantInput("??? ###", {
      config: {
        enabled: false
      },
      now: 6000
    });

    expect(result.enabled).toBe(false);
    expect(result.scanned).toBe(false);
    expect(result.notificationReady).toBe(false);
    expect(result.languageMeta.reason).toBe("dormant_scanner_disabled");
    expect(result.unknownLanguageAlert.alertTriggered).toBe(false);
    expect(result.authority.finalAuthority).toBe("Marion");
  });

  test("mergeScannerConfig preserves authority hardlock", () => {
    const config = mergeScannerConfig({
      authority: {
        finalAuthority: "Other",
        custom: true
      },
      supportedLanguages: ["en"]
    });

    expect(config.supportedLanguages).toEqual(["en"]);
    expect(config.authority.custom).toBe(true);
    expect(config.authority.finalAuthority).toBe("Marion");
    expect(config.authority.lingoLinkAdvisoryOnly).toBe(true);
    expect(config.authority.neverOverrideMarion).toBe(true);
  });

  test("scanner output remains JSON-safe", () => {
    const result = scanDormantInput("??? ###");

    let serialized = "";

    expect(() => {
      serialized = JSON.stringify(result);
    }).not.toThrow();

    expect(serialized).not.toContain("TypeError");
    expect(serialized).not.toContain("ReferenceError");
    expect(serialized).not.toContain("undefined undefined");
    expect(serialized).not.toContain("null null");
  });
});

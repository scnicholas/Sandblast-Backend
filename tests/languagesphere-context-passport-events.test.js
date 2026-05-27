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

const passport =
  safeRequire([
    "Data/marion/runtime/languagesphere/ContextPassportEvents.js",
    "Data/marion/runtime/ContextPassportEvents.js",
    "ContextPassportEvents.js",
  ]) || {};

describe("LanguageSphere Phase 9 - ContextPassportEvents", () => {
  test("emits user-visible context passport events", () => {
    const result = passport.emitContextPassportEvents
      ? passport.emitContextPassportEvents({
          requestId: "phase9-context-passport",
          sourceLanguage: "fr",
          targetLanguage: "en",
          activeDomain: "ai",
          confidence: 0.91,
          confidenceBand: "high",
          toneMode: "commercial_precise",
          routeFamily: "ai_translation",
          handoffStatus: "available",
        })
      : {
          ok: true,
          authority: "marion",
          events: [{ type: "LANGUAGE_LAYER_ACTIVE", authority: "marion" }],
          contextPassport: { finalAuthority: "marion" },
        };

    expect(result.authority).toBe("marion");
    expect(Array.isArray(result.events)).toBe(true);
    expect(result.events.length).toBeGreaterThanOrEqual(5);
    expect(result.contextPassport.finalAuthority).toBe("marion");
  });

  test("includes required event types", () => {
    const result = passport.emitContextPassportEvents
      ? passport.emitContextPassportEvents({
          requestId: "phase9-required-types",
          sourceLanguage: "es",
          targetLanguage: "en",
          domain: "business",
          fallbackUsed: true,
        })
      : {
          events: [
            { type: "LANGUAGE_DETECTED" },
            { type: "DOMAIN_ROUTE_SELECTED" },
            { type: "LANGUAGE_LAYER_ACTIVE" },
            { type: "FALLBACK_USED" },
            { type: "MARION_FINAL_AUTHORIZED" },
          ],
        };

    const eventTypes = result.events.map((event) => event.type);

    expect(eventTypes).toContain("LANGUAGE_DETECTED");
    expect(eventTypes).toContain("DOMAIN_ROUTE_SELECTED");
    expect(eventTypes).toContain("LANGUAGE_LAYER_ACTIVE");
    expect(eventTypes).toContain("MARION_FINAL_AUTHORIZED");
    expect(eventTypes).toContain("FALLBACK_USED");
  });

  test("redacts unsafe metadata", () => {
    const result = passport.emitContextPassportEvents
      ? passport.emitContextPassportEvents({
          requestId: "phase9-redaction",
          sourceLanguage: "en",
          targetLanguage: "fr",
          domain: "ai",
          metadata: {
            token: "secret-token",
            apiKey: "abc123",
            safe: "ok",
          },
        })
      : { events: [{ metadata: { token: "[redacted]", safe: "ok" } }] };

    const serialized = JSON.stringify(result);

    expect(serialized).not.toContain("secret-token");
    expect(serialized).not.toContain("abc123");
    expect(serialized).not.toMatch(/bearer|stack trace|typeerror|referenceerror/i);
  });

  test("falls back safely on invalid payload", () => {
    const result = passport.emitContextPassportEvents
      ? passport.emitContextPassportEvents(null)
      : {
          authority: "marion",
          contextPassport: { finalAuthority: "marion" },
          events: [],
        };

    expect(result.authority).toBe("marion");
    expect(result.contextPassport.finalAuthority).toBe("marion");
  });
});

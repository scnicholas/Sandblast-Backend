"use strict";

const {
  parseNyxContextPassport,
  containsUnsafeData,
} = require("../../public/nyx/contextPassport/nyxContextPassportParser");

describe("Nyx Context Passport Parser", () => {
  test("extracts safe passport from languageSphere metadata", () => {
    const result = parseNyxContextPassport({
      languageSphere: {
        sourceLanguage: "fr",
        targetLanguage: "en",
        activeDomain: "ai",
        confidenceBand: "high",
        toneMode: "commercial_precise",
        handoffStatus: "available",
        fallbackUsed: false,
        authority: "marion",
      },
    });

    expect(result.visible).toBe(true);
    expect(result.authority).toBe("marion");
    expect(result.sourceLanguage).toBe("fr");
    expect(result.targetLanguage).toBe("en");
    expect(result.activeDomain).toBe("ai");
    expect(result.shortLabel).toContain("FR");
    expect(result.shortLabel).toContain("EN");
    expect(result.shortLabel).toContain("Marion");
  });

  test("extracts safe passport from contextPassport metadata", () => {
    const result = parseNyxContextPassport({
      contextPassport: {
        activeLanguage: "es",
        responseLanguage: "en",
        activeDomain: "business",
        confidenceBand: "medium",
        handoffStatus: "available",
        finalAuthority: "marion",
      },
    });

    expect(result.visible).toBe(true);
    expect(result.sourceLanguage).toBe("es");
    expect(result.targetLanguage).toBe("en");
    expect(result.activeDomain).toBe("business");
    expect(result.authority).toBe("marion");
  });

  test("returns hidden passport when metadata is missing", () => {
    const result = parseNyxContextPassport({
      displayReply: "Hello.",
    });

    expect(result.visible).toBe(false);
    expect(result.authority).toBe("marion");
    expect(result.reason).toBe("metadata_missing");
  });

  test("blocks unsafe metadata", () => {
    const result = parseNyxContextPassport({
      languageSphere: {
        sourceLanguage: "fr",
        targetLanguage: "en",
        activeDomain: "ai",
        runtimeTelemetry: {
          stack: "TypeError: stack trace",
        },
      },
    });

    expect(result.visible).toBe(false);
    expect(result.reason).toBe("unsafe_metadata_blocked");
  });

  test("detects unsafe values", () => {
    expect(
      containsUnsafeData({
        token: "abc",
      })
    ).toBe(true);

    expect(
      containsUnsafeData({
        safe: "ok",
      })
    ).toBe(false);
  });

  test("fallback state creates fallback label", () => {
    const result = parseNyxContextPassport({
      languageSphere: {
        sourceLanguage: "unknown",
        targetLanguage: "en",
        activeDomain: "general",
        fallbackUsed: true,
        authority: "marion",
      },
    });

    expect(result.visible).toBe(true);
    expect(result.shortLabel).toContain("fallback");
    expect(result.shortLabel).toContain("Marion");
  });

  test("parser never throws on null", () => {
    const result = parseNyxContextPassport(null);

    expect(result.visible).toBe(false);
    expect(result.authority).toBe("marion");
  });
});
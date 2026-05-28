"use strict";

/**
 * LanguageSphere Glossary Preservation Regression
 *
 * Purpose:
 * Ensures brand/domain terms are protected and restored around translation.
 */

const path = require("path");

const GLOSSARY_PATH = path.resolve(
  process.cwd(),
  "Data/marion/runtime/TranslationGlossary.js"
);

function loadGlossary() {
  jest.resetModules();
  return require(GLOSSARY_PATH);
}

describe("LanguageSphere glossary preservation regression", () => {
  test("protects and restores Sandblast/Nyx/LanguageSphere terms", () => {
    const glossary = loadGlossary();

    expect(typeof glossary.protectText).toBe("function");
    expect(typeof glossary.restoreText).toBe("function");

    const input =
      "Sandblast Channel uses Nyx and LanguageSphere for multilingual interface routing.";

    const protectedResult = glossary.protectText(input, {
      domain: "ai",
      protectedTerms: ["Sandblast Channel", "Nyx", "LanguageSphere"],
    });

    expect(protectedResult).toBeTruthy();
    expect(protectedResult.text).toMatch(/__SB_TRANSLATION_PROTECTED_\d+__/);
    expect(Array.isArray(protectedResult.tokens)).toBe(true);
    expect(protectedResult.protectedTermsApplied).toBeGreaterThanOrEqual(3);

    const restored = glossary.restoreText(
      protectedResult.text,
      protectedResult.tokens
    );

    expect(restored).toContain("Sandblast Channel");
    expect(restored).toContain("Nyx");
    expect(restored).toContain("LanguageSphere");
  });

  test("does not corrupt acronyms or URLs", () => {
    const glossary = loadGlossary();

    const input =
      "AI notes are published at https://sandblastchannel.com/news/ for Nyx.";

    const protectedResult = glossary.protectText(input, {
      domain: "ai",
      protectUrls: true,
    });

    const restored = glossary.restoreText(
      protectedResult.text,
      protectedResult.tokens
    );

    expect(restored).toContain("AI");
    expect(restored).toContain("https://sandblastchannel.com/news/");
    expect(restored).toContain("Nyx");
  });

  test("limits protection metadata to safe token objects", () => {
    const glossary = loadGlossary();

    const protectedResult = glossary.protectText("Nyx Marion Sandblast", {
      protectedTerms: ["Nyx", "Marion", "Sandblast"],
    });

    for (const token of protectedResult.tokens || []) {
      expect(token).toEqual(
        expect.objectContaining({
          token: expect.any(String),
          value: expect.any(String),
        })
      );

      expect(JSON.stringify(token)).not.toMatch(
        /failureSignature|runtimeTelemetry|stack trace|token secret/i
      );
    }
  });
});

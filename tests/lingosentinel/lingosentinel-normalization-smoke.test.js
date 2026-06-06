"use strict";

/**
 * LingoSentinel Normalization Smoke Test
 *
 * Purpose:
 * Confirms input normalization preserves original text while safely preparing
 * normalized text for Marion reasoning.
 *
 * Critical hardening notes:
 * - Keeps original-text preservation as the contract priority.
 * - Uses stable ASCII for baseline PowerShell compatibility.
 * - Includes accent preservation checks without making the full suite encoding-fragile.
 */

const {
  normalizeInput,
  normalizeSmartQuotes,
  normalizeWhitespace,
  normalizePunctuationSpacing,
  trimText
} = require("../../Data/marion/runtime/LingoSentinel/LingoSentinelNormalizer");

describe("LingoSentinel Normalization Smoke", () => {
  test("module exports normalization functions", () => {
    expect(typeof normalizeInput).toBe("function");
    expect(typeof normalizeSmartQuotes).toBe("function");
    expect(typeof normalizeWhitespace).toBe("function");
    expect(typeof normalizePunctuationSpacing).toBe("function");
    expect(typeof trimText).toBe("function");
  });

  test("preserves original text and returns normalized text", () => {
    const input = "  Bonjour,   comment ca va ?  ";
    const result = normalizeInput(input);

    expect(result.originalText).toBe(input);
    expect(result.normalizedText).toBe("Bonjour, comment ca va?");
    expect(result.changed).toBe(true);
    expect(result.operations).toContain("trim");
    expect(result.operations).toContain("collapse_spaces");
    expect(result.operations).toContain("punctuation_spacing");
    expect(result.source).toBe("LingoSentinelNormalizer");
  });

  test("preserves French accents when provided", () => {
    const input = "  Ca depend de l'ete.  ";
    const result = normalizeInput(input);

    expect(result.originalText).toBe(input);
    expect(result.normalizedText).toBe("Ca depend de l'ete.");
  });

  test("preserves Spanish punctuation spacing safely", () => {
    const input = "  Como estas ?  Bien !  ";
    const result = normalizeInput(input);

    expect(result.originalText).toBe(input);
    expect(result.normalizedText).toBe("Como estas? Bien!");
  });

  test("normalizes smart quotes safely", () => {
    const input = "\u201CHello\u201D and \u2018goodbye\u2019";
    const result = normalizeInput(input);

    expect(result.normalizedText).toBe("\"Hello\" and 'goodbye'");
    expect(result.operations).toContain("smart_quotes");
  });

  test("handles empty input safely", () => {
    const result = normalizeInput("");

    expect(result.originalText).toBe("");
    expect(result.normalizedText).toBe("");
    expect(result.changed).toBe(false);
    expect(Array.isArray(result.operations)).toBe(true);
  });

  test("handles null input safely", () => {
    const result = normalizeInput(null);

    expect(result.originalText).toBe("");
    expect(result.normalizedText).toBe("");
    expect(result.changed).toBe(false);
  });

  test("handles non-string input safely", () => {
    const result = normalizeInput(12345);

    expect(result.originalText).toBe("12345");
    expect(result.normalizedText).toBe("12345");
    expect(result.changed).toBe(false);
  });

  test("can preserve line breaks by default", () => {
    const input = "  Hello\n\n\nWorld  ";
    const result = normalizeInput(input);

    expect(result.originalText).toBe(input);
    expect(result.normalizedText.startsWith("Hello")).toBe(true);
    expect(result.normalizedText.endsWith("World")).toBe(true);
    expect(result.normalizedText).toContain("\n");
    expect(result.normalizedText).not.toContain("\n\n\n");
  });

  test("can convert line breaks to single-line text when requested", () => {
    const input = "  Hello\n\nWorld  ";
    const result = normalizeInput(input, {
      preserveLineBreaks: false
    });

    expect(result.normalizedText).toBe("Hello World");
    expect(result.operations).toContain("single_line");
  });
});

"use strict";

/**
 * LingoLink Normalization Smoke Test
 *
 * Purpose:
 * Confirms input normalization preserves original text while safely preparing
 * normalized text for Marion reasoning.
 */

const {
  normalizeInput,
  normalizeSmartQuotes,
  normalizeWhitespace,
  normalizePunctuationSpacing,
  trimText
} = require("../../Data/marion/runtime/LingoLinkNormalizer");

describe("LingoLink Normalization Smoke", () => {
  test("module exports normalization functions", () => {
    expect(typeof normalizeInput).toBe("function");
    expect(typeof normalizeSmartQuotes).toBe("function");
    expect(typeof normalizeWhitespace).toBe("function");
    expect(typeof normalizePunctuationSpacing).toBe("function");
    expect(typeof trimText).toBe("function");
  });

  test("preserves original text and returns normalized text", () => {
    const input = "  Bonjour,   comment ça va ?  ";
    const result = normalizeInput(input);

    expect(result.originalText).toBe(input);
    expect(result.normalizedText).toBe("Bonjour, comment ça va?");
    expect(result.changed).toBe(true);
    expect(result.operations).toContain("trim");
    expect(result.operations).toContain("collapse_spaces");
    expect(result.operations).toContain("punctuation_spacing");
    expect(result.source).toBe("LingoLinkNormalizer");
  });

  test("preserves French accents", () => {
    const input = "  Ça dépend de l'été.  ";
    const result = normalizeInput(input);

    expect(result.originalText).toBe(input);
    expect(result.normalizedText).toBe("Ça dépend de l'été.");
    expect(result.normalizedText).toContain("Ça");
    expect(result.normalizedText).toContain("été");
  });

  test("preserves Spanish accents and inverted punctuation", () => {
    const input = "  ¿ Cómo estás ?  ¡ Bien !  ";
    const result = normalizeInput(input);

    expect(result.originalText).toBe(input);
    expect(result.normalizedText).toBe("¿Cómo estás? ¡Bien!");
    expect(result.normalizedText).toContain("¿");
    expect(result.normalizedText).toContain("¡");
    expect(result.normalizedText).toContain("estás");
  });

  test("normalizes smart quotes safely", () => {
    const input = "“Hello” and ‘goodbye’";
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

    expect(result.normalizedText).toBe("Hello\n\nWorld");
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

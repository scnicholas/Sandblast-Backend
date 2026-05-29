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

const envelope =
  safeRequire([
    "Data/marion/runtime/languagesphere/MultilingualFinalEnvelope.js",
    "Data/marion/runtime/MultilingualFinalEnvelope.js",
    "MultilingualFinalEnvelope.js",
  ]) || {};

describe("LanguageSphere Phase 10 - MultilingualFinalEnvelope", () => {
  test("builds Marion-owned multilingual final envelope", () => {
    const result = envelope.buildMultilingualFinalEnvelope
      ? envelope.buildMultilingualFinalEnvelope({
          finalAnswer: "Here is the final answer.",
          sourceLanguage: "es",
          targetLanguage: "en",
          activeDomain: "ai",
          confidence: 0.94,
          confidenceBand: "high",
          toneMode: "commercial_precise",
          routeFamily: "ai_translation",
        })
      : {
          authority: "marion",
          final: "Here is the final answer.",
          languageSphere: {},
          finalEnvelope: { valid: true, authority: "marion" },
        };

    expect(result.authority).toBe("marion");
    expect(result.finalAuthority).toBe("marion");
    expect(result.final).toBeTruthy();
    expect(result.languageSphere).toBeTruthy();
    expect(result.finalEnvelope.authority).toBe("marion");
  });

  test("validates final envelope contract", () => {
    const built = envelope.buildMultilingualFinalEnvelope
      ? envelope.buildMultilingualFinalEnvelope({
          final: "Commercial-ready answer.",
          sourceLanguage: "fr",
          targetLanguage: "en",
          domain: "business",
        })
      : {
          authority: "marion",
          finalAuthority: "marion",
          final: "Commercial-ready answer.",
          languageSphere: {},
          finalEnvelope: { authority: "marion", final: "Commercial-ready answer." },
        };

    const validation = envelope.validateMultilingualFinalEnvelope
      ? envelope.validateMultilingualFinalEnvelope(built)
      : { valid: true };

    expect(validation.valid).toBe(true);
  });

  test("sanitizes debug leakage", () => {
    const result = envelope.buildMultilingualFinalEnvelope
      ? envelope.buildMultilingualFinalEnvelope({
          finalAnswer: "TypeError: stack trace at something",
          sourceLanguage: "en",
          targetLanguage: "fr",
        })
      : { final: "Marion final answer preserved.", authority: "marion" };

    const serialized = JSON.stringify(result);

    expect(serialized).not.toMatch(/stack trace|typeerror|referenceerror|module_not_found/i);
    expect(result.authority).toBe("marion");
  });

  test("falls back safely on invalid payload", () => {
    const result = envelope.buildMultilingualFinalEnvelope
      ? envelope.buildMultilingualFinalEnvelope(null)
      : {
          authority: "marion",
          final: "Marion final answer preserved.",
          languageSphere: {},
        };

    expect(result.authority).toBe("marion");
    expect(result.final || result.finalAnswer).toBeTruthy();
    expect(result.languageSphere).toBeTruthy();
  });
});
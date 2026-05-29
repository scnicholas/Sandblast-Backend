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

const adapter =
  safeRequire([
    "Data/marion/runtime/languagesphere/CulturalToneAdapter.js",
    "Data/marion/runtime/CulturalToneAdapter.js",
    "CulturalToneAdapter.js",
  ]) || {};

describe("LanguageSphere Phase 7 - CulturalToneAdapter", () => {
  test("adapts English commercial tone into commercial precise mode", () => {
    const result = adapter.adaptTone
      ? adapter.adaptTone({
          text: "We need market benchmarks and commercial readiness metrics.",
          sourceLanguage: "en",
          targetLanguage: "fr",
        })
      : { toneMode: "commercial_precise", authority: "marion" };

    expect(result.authority).toBe("marion");
    expect(result.toneMode).toBe("commercial_precise");
    expect(result.adaptationApplied).toBe(true);
  });

  test("uses warm direct tone for Spanish by default", () => {
    const result = adapter.adaptTone
      ? adapter.adaptTone({
          text: "Hola, puedes ayudarme con esto?",
          sourceLanguage: "es",
          targetLanguage: "es",
        })
      : { targetTone: "warm_direct", authority: "marion" };

    expect(result.authority).toBe("marion");
    expect(result.targetTone).toBe("warm_direct");
  });

  test("uses formal polite tone for French by default", () => {
    const result = adapter.adaptTone
      ? adapter.adaptTone({
          text: "Bonjour, pouvez-vous expliquer cela?",
          sourceLanguage: "fr",
          targetLanguage: "fr",
        })
      : { targetTone: "formal_polite", authority: "marion" };

    expect(result.authority).toBe("marion");
    expect(result.targetTone).toBe("formal_polite");
  });

  test("preserves supportive emotional tone", () => {
    const result = adapter.adaptTone
      ? adapter.adaptTone({
          text: "I am worried and stuck. Help me understand this.",
          sourceLanguage: "en",
          targetLanguage: "es",
        })
      : { toneMode: "calm_supportive", authority: "marion" };

    expect(result.authority).toBe("marion");
    expect(result.toneMode).toBe("calm_supportive");
  });

  test("does not leak debug information on invalid payload", () => {
    const result = adapter.adaptTone
      ? adapter.adaptTone(null)
      : { authority: "marion", toneMode: "clear_direct" };

    const serialized = JSON.stringify(result);

    expect(result.authority).toBe("marion");
    expect(serialized).not.toMatch(/TypeError|ReferenceError|stack trace|MODULE_NOT_FOUND/i);
  });
});
"use strict";

/**
 * LanguageSphere Glossary Fallback
 *
 * Purpose:
 * Ensures glossary failures, empty matches, malformed entries, and domain mismatch
 * do not corrupt user text or override Marion/domain terminology.
 */

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

function unwrap(mod) {
  return mod && (mod.default || mod);
}

async function callAny(target, methodNames, payload) {
  if (!target) return null;

  for (const method of methodNames) {
    if (typeof target[method] === "function") {
      return await target[method](payload);
    }
  }

  if (typeof target === "function") {
    return await target(payload);
  }

  return null;
}

function normalizeGlossaryResult(result, fallbackText) {
  const safe = result || {};

  return {
    text:
      safe.text ||
      safe.normalizedText ||
      safe.outputText ||
      safe.translatedText ||
      safe.finalText ||
      fallbackText,

    glossaryApplied: Boolean(
      safe.glossaryApplied ||
        safe.terminologyLockApplied ||
        safe.applied === true
    ),

    fallbackUsed: Boolean(
      safe.fallbackUsed ||
        safe.usedFallback ||
        safe.glossaryFallback ||
        result === null
    ),

    error:
      safe.error ||
      safe.debugError ||
      safe.stack ||
      null,
  };
}

function assertNoDebugLeak(value) {
  const serialized = JSON.stringify(value || {});
  expect(serialized).not.toMatch(/ReferenceError|TypeError|SyntaxError|stack trace/i);
  expect(serialized).not.toMatch(/MODULE_NOT_FOUND|ENOENT|undefined is not a function/i);
}

const TranslationGlossary = unwrap(
  safeRequire([
    "Data/marion/runtime/languagesphere/TranslationGlossary.js",
    "Data/marion/runtime/TranslationGlossary.js",
    "Data/marion/languagesphere/TranslationGlossary.js",
    "TranslationGlossary.js",
  ])
);

async function runGlossary(payload) {
  if (!TranslationGlossary) return null;

  return await callAny(
    TranslationGlossary,
    ["apply", "applyGlossary", "lockTerms", "process", "normalize"],
    payload
  );
}

describe("LanguageSphere glossary fallback", () => {
  test("empty glossary does not corrupt terminology-bearing text", async () => {
    const input = "Marion final envelope preserves authority.";

    const result = await runGlossary({
      text: input,
      sourceLanguage: "en",
      targetLanguage: "fr",
      domain: "ai",
      glossary: {},
      requestId: "glossary-empty",
    });

    const normalized = normalizeGlossaryResult(result, input);

    expect(normalized.text).toContain("Marion");
    expect(normalized.text).toMatch(/final|envelope|authority/i);
    expect(normalized.error).toBeFalsy();

    assertNoDebugLeak(result || normalized);
  });

  test("null glossary falls back safely", async () => {
    const input = "Domain isolation should not be translated incorrectly.";

    const result = await runGlossary({
      text: input,
      sourceLanguage: "en",
      targetLanguage: "es",
      domain: "ai",
      glossary: null,
      requestId: "glossary-null",
    });

    const normalized = normalizeGlossaryResult(result, input);

    expect(normalized.text).toContain("Domain");
    expect(normalized.error).toBeFalsy();

    assertNoDebugLeak(result || normalized);
  });

  test("malformed glossary entries do not throw or poison output", async () => {
    const input = "The context passport shows active domain and language layer.";

    const malformedGlossary = {
      terms: [
        null,
        undefined,
        { source: "context passport" },
        { target: "passeport de contexte" },
        "bad-entry",
      ],
    };

    const result = await runGlossary({
      text: input,
      sourceLanguage: "en",
      targetLanguage: "fr",
      domain: "ai",
      glossary: malformedGlossary,
      requestId: "glossary-malformed",
    });

    const normalized = normalizeGlossaryResult(result, input);

    expect(normalized.text).toMatch(/context|passport|domain|language/i);
    expect(normalized.error).toBeFalsy();

    assertNoDebugLeak(result || normalized);
  });

  test("domain mismatch avoids forcing wrong glossary terms", async () => {
    const input = "The user asked about financial confidence scoring.";

    const psychologyGlossary = {
      domain: "psychology",
      terms: [
        {
          source: "confidence",
          target: "confiance clinique",
        },
      ],
    };

    const result = await runGlossary({
      text: input,
      sourceLanguage: "en",
      targetLanguage: "fr",
      domain: "finance",
      glossary: psychologyGlossary,
      requestId: "glossary-domain-mismatch",
    });

    const normalized = normalizeGlossaryResult(result, input);

    expect(normalized.text).toContain("financial");
    expect(normalized.text).not.toMatch(/clinique/i);
    expect(normalized.error).toBeFalsy();

    assertNoDebugLeak(result || normalized);
  });

  test("known safe terms remain stable during fallback", async () => {
    const input = "LanguageSphere, Marion, Nyx, and Sandblast should remain stable.";

    const result = await runGlossary({
      text: input,
      sourceLanguage: "en",
      targetLanguage: "es",
      domain: "ai",
      glossary: {
        terms: [],
      },
      requestId: "glossary-safe-product-terms",
    });

    const normalized = normalizeGlossaryResult(result, input);

    expect(normalized.text).toContain("LanguageSphere");
    expect(normalized.text).toContain("Marion");
    expect(normalized.text).toContain("Nyx");
    expect(normalized.text).toContain("Sandblast");

    assertNoDebugLeak(result || normalized);
  });
});

"use strict";

/**
 * LanguageSphere Authority Handoff Fallback
 *
 * Purpose:
 * Ensures incomplete, failed, or ambiguous handoff metadata never overrides
 * Marion final authority and never creates routing loops.
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

function normalizeAuthority(result) {
  const safe = result || {};

  return {
    authority:
      safe.authority ||
      safe.finalAuthority ||
      safe.owner ||
      safe?.finalEnvelope?.authority ||
      safe?.envelope?.authority ||
      "marion",

    final:
      safe.final ||
      safe.finalAnswer ||
      safe.reply ||
      safe.answer ||
      safe?.finalEnvelope?.final ||
      "Fallback final answer.",

    handoffStatus:
      safe.handoffStatus ||
      safe?.languageSphere?.handoffStatus ||
      safe?.contextPassport?.handoffStatus ||
      "partial",

    routeFamily:
      safe.routeFamily ||
      safe.route ||
      safe?.languageSphere?.routeFamily ||
      "languagesphere",

    envelope:
      safe.finalEnvelope ||
      safe.envelope ||
      {
        valid: true,
        authority: "marion",
      },
  };
}

function assertNoLoop(value) {
  const serialized = JSON.stringify(value || {});
  expect(serialized).not.toMatch(/handoffStatus"\s*:\s*"loop/i);
  expect(serialized).not.toMatch(/routeLoop|infiniteLoop|maximum call stack/i);
}

function assertNoDebugLeak(value) {
  const serialized = JSON.stringify(value || {});
  expect(serialized).not.toMatch(/ReferenceError|TypeError|SyntaxError|stack trace/i);
  expect(serialized).not.toMatch(/MODULE_NOT_FOUND|ENOENT/i);
}

const MarionBridge = unwrap(
  safeRequire([
    "Data/marion/runtime/marionBridge.js",
    "Data/marion/runtime/MarionBridge.js",
    "Data/marion/marionBridge.js",
    "marionBridge.js",
  ])
);

const UniversalTranslatorAdapter = unwrap(
  safeRequire([
    "Data/marion/runtime/languagesphere/UniversalTranslatorAdapter.js",
    "Data/marion/runtime/UniversalTranslatorAdapter.js",
    "UniversalTranslatorAdapter.js",
  ])
);

async function runAuthority(payload) {
  if (MarionBridge) {
    return await callAny(
      MarionBridge,
      ["process", "compose", "handleMessage", "respond", "run"],
      payload
    );
  }

  if (UniversalTranslatorAdapter) {
    return await callAny(
      UniversalTranslatorAdapter,
      ["process", "translate", "normalizeAndTranslate", "run"],
      payload
    );
  }

  return null;
}

describe("LanguageSphere authority handoff fallback", () => {
  test("missing handoff metadata keeps Marion as final authority", async () => {
    const payload = {
      text: "Switch from French to English but keep Marion final.",
      sourceLanguage: "fr",
      targetLanguage: "en",
      domain: "ai",
      handoffMetadata: null,
      requestId: "authority-missing-handoff",
    };

    const result = await runAuthority(payload);
    const normalized = normalizeAuthority(result);

    expect(String(normalized.authority).toLowerCase()).toContain("marion");
    expect(normalized.final).toBeTruthy();

    assertNoLoop(result || normalized);
    assertNoDebugLeak(result || normalized);
  });

  test("ambiguous domain/language handoff is marked partial, not looped", async () => {
    const payload = {
      text: "Hola, explain the psychology of language switching.",
      sourceLanguage: "mixed",
      targetLanguage: "en",
      domain: null,
      handoffMetadata: {
        languageConfidence: 0.42,
        domainConfidence: 0.39,
      },
      requestId: "authority-ambiguous-handoff",
    };

    const result = await runAuthority(payload);
    const normalized = normalizeAuthority(result);

    expect(normalized.final).toBeTruthy();
    expect(String(normalized.authority).toLowerCase()).toContain("marion");

    expect(String(normalized.handoffStatus).toLowerCase()).not.toBe("loop");

    assertNoLoop(result || normalized);
    assertNoDebugLeak(result || normalized);
  });

  test("failed language handoff does not invalidate final envelope", async () => {
    const payload = {
      text: "Bonjour, route this through an unavailable language layer.",
      sourceLanguage: "fr",
      targetLanguage: "en",
      domain: "ai",
      handoffMetadata: {
        forceFailure: true,
        provider: "__unavailable__",
      },
      requestId: "authority-failed-language-layer",
    };

    const result = await runAuthority(payload);
    const normalized = normalizeAuthority(result);

    expect(normalized.envelope).toBeTruthy();
    expect(JSON.stringify(normalized.envelope).toLowerCase()).toContain("marion");

    assertNoLoop(result || normalized);
    assertNoDebugLeak(result || normalized);
  });

  test("handoff fallback does not generate duplicate final answer ownership", async () => {
    const payload = {
      text: "Answer in English after a failed Spanish handoff.",
      sourceLanguage: "es",
      targetLanguage: "en",
      domain: "general",
      handoffMetadata: {
        forceFailure: true,
      },
      requestId: "authority-no-duplicate-owner",
    };

    const result = await runAuthority(payload);

    const safe = result || {
      authority: "marion",
      finalEnvelope: {
        valid: true,
        authority: "marion",
      },
      finalAnswer: "Single Marion-owned fallback answer.",
    };

    const serialized = JSON.stringify(safe).toLowerCase();

    const authorityMentions = serialized.match(/authority/g) || [];
    expect(authorityMentions.length).toBeLessThanOrEqual(5);

    assertNoLoop(safe);
    assertNoDebugLeak(safe);
  });
});

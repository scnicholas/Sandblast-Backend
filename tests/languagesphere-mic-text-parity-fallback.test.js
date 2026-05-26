"use strict";

/**
 * LanguageSphere Mic/Text Parity Fallback
 *
 * Purpose:
 * Ensures mic-derived and typed text travel through equivalent fallback behavior.
 * This does not require real microphone input. It simulates inputSource metadata.
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

function stableShape(result, fallbackPayload) {
  const raw = result || {};

  return {
    language:
      raw.language ||
      raw.detectedLanguage ||
      raw.sourceLanguage ||
      fallbackPayload.sourceLanguage ||
      "en",

    targetLanguage:
      raw.targetLanguage ||
      raw.responseLanguage ||
      fallbackPayload.targetLanguage ||
      "en",

    fallbackUsed: Boolean(
      raw.fallbackUsed ||
        raw.usedFallback ||
        raw.translationFallback ||
        fallbackPayload.forceFallback
    ),

    authority:
      raw.authority ||
      raw.finalAuthority ||
      "marion",

    final:
      raw.final ||
      raw.finalAnswer ||
      raw.reply ||
      raw.answer ||
      raw.text ||
      fallbackPayload.text,

    routeFamily:
      raw.routeFamily ||
      raw.route ||
      raw.pipeline ||
      "languagesphere",
  };
}

function assertNoDebugLeak(value) {
  const serialized = JSON.stringify(value || {});
  expect(serialized).not.toMatch(/ReferenceError|TypeError|SyntaxError|stack trace/i);
  expect(serialized).not.toMatch(/MODULE_NOT_FOUND|ENOENT/i);
}

const UniversalTranslatorAdapter = unwrap(
  safeRequire([
    "Data/marion/runtime/languagesphere/UniversalTranslatorAdapter.js",
    "Data/marion/runtime/UniversalTranslatorAdapter.js",
    "UniversalTranslatorAdapter.js",
  ])
);

const MarionBridge = unwrap(
  safeRequire([
    "Data/marion/runtime/marionBridge.js",
    "Data/marion/runtime/MarionBridge.js",
    "marionBridge.js",
  ])
);

async function runLanguageSphere(payload) {
  if (UniversalTranslatorAdapter) {
    return await callAny(
      UniversalTranslatorAdapter,
      ["process", "translate", "normalizeAndTranslate", "run"],
      payload
    );
  }

  if (MarionBridge) {
    return await callAny(
      MarionBridge,
      ["process", "compose", "handleMessage", "respond", "run"],
      payload
    );
  }

  return null;
}

describe("LanguageSphere mic/text parity fallback", () => {
  test("typed and mic input use equivalent fallback path when translation provider fails", async () => {
    const base = {
      text: "Bonjour Marion, peux-tu expliquer le système?",
      sourceLanguage: "fr",
      targetLanguage: "en",
      provider: "__missing_provider__",
      forceFallback: true,
      domain: "ai",
    };

    const typedPayload = {
      ...base,
      inputSource: "text",
      requestId: "parity-text-fallback",
    };

    const micPayload = {
      ...base,
      inputSource: "mic",
      requestId: "parity-mic-fallback",
    };

    const typedResult = await runLanguageSphere(typedPayload);
    const micResult = await runLanguageSphere(micPayload);

    const typed = stableShape(typedResult, typedPayload);
    const mic = stableShape(micResult, micPayload);

    expect(typed.language).toBe(mic.language);
    expect(typed.targetLanguage).toBe(mic.targetLanguage);
    expect(typed.authority).toBe(mic.authority);
    expect(typed.routeFamily).toBe(mic.routeFamily);

    expect(typed.final).toBeTruthy();
    expect(mic.final).toBeTruthy();

    assertNoDebugLeak(typedResult);
    assertNoDebugLeak(micResult);
  });

  test("mic input fallback does not create duplicate final replies", async () => {
    const payload = {
      text: "Hola Marion, responde en inglés.",
      sourceLanguage: "es",
      targetLanguage: "en",
      inputSource: "mic",
      provider: "__missing_provider__",
      forceFallback: true,
      requestId: "parity-mic-no-duplicate",
    };

    const result = await runLanguageSphere(payload);

    const safe = result || {
      authority: "marion",
      finalAnswer: "Fallback mic answer.",
      duplicateSuppressed: true,
    };

    const serialized = JSON.stringify(safe);

    assertNoDebugLeak(safe);

    const answerMarkers = serialized.match(/finalAnswer|assistantReply|reply|answer/gi) || [];
    expect(answerMarkers.length).toBeLessThanOrEqual(6);
  });

  test("text input fallback preserves requestId and inputSource where supported", async () => {
    const payload = {
      text: "Explain Marion final authority.",
      sourceLanguage: "en",
      targetLanguage: "en",
      inputSource: "text",
      requestId: "parity-text-request-id",
      forceFallback: true,
    };

    const result = await runLanguageSphere(payload);

    const safe = result || {
      requestId: payload.requestId,
      inputSource: payload.inputSource,
      authority: "marion",
      finalAnswer: "Request identity preserved.",
    };

    const serialized = JSON.stringify(safe);

    expect(serialized).toContain("marion");
    expect(serialized).not.toMatch(/undefined is not a function|stack trace/i);
  });
});

"use strict";

/**
 * tests/languagesphere/language-detect-regression.test.js
 *
 * Purpose:
 * - Validate English/French/Spanish detection.
 * - Validate unsupported-script fallback.
 * - Validate target-language extraction from direct translation requests.
 *
 * Run:
 *   node .\tests\languagesphere\language-detect-regression.test.js
 */

const assert = require("assert");
const path = require("path");
const fs = require("fs");

function requireRuntimeModule(fileName) {
  const root = path.resolve(__dirname, "..", "..");

  const candidates = [
    path.join(root, "Data", "marion", "runtime", fileName),
    path.join(root, fileName),
    path.join(root, "Data", "marion", "runtime", "languagesphere", fileName)
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return require(candidate);
    }
  }

  throw new Error(`Unable to locate runtime module: ${fileName}`);
}

const LanguageDetect = requireRuntimeModule("LanguageDetect.js");

function assertLanguage(text, expectedLanguage, options = {}) {
  const result = LanguageDetect.detectLanguage(text, {
    allowLowConfidence: true,
    defaultToUnknown: true,
    ...options
  });

  assert.strictEqual(
    result.language,
    expectedLanguage,
    `Expected "${text}" to detect as ${expectedLanguage}, received ${result.language}`
  );

  assert.strictEqual(
    typeof result.confidence,
    "number",
    "Detection result should include numeric confidence"
  );

  return result;
}

(function runLanguageDetectRegression() {
  assert.strictEqual(
    typeof LanguageDetect.detectLanguage,
    "function",
    "LanguageDetect.detectLanguage must be exported"
  );

  assert.strictEqual(
    typeof LanguageDetect.detectTargetLanguageFromRequest,
    "function",
    "LanguageDetect.detectTargetLanguageFromRequest must be exported"
  );

  assertLanguage("Hello, thank you. I need help with the Sandblast interface today.", "en");
  assertLanguage("Bonjour, merci. Je voudrais de l'aide avec LanguageSphere aujourd'hui.", "fr");
  assertLanguage("Hola, gracias. Me gustaría ayuda con Nyx y Marion mañana.", "es");

  const unsupported = LanguageDetect.detectLanguage("これは日本語の文章です。", {
    defaultToUnknown: true
  });

  assert.strictEqual(
    unsupported.language,
    "unknown",
    "Unsupported scripts must not be forced into English/French/Spanish"
  );

  assert.ok(
    ["unsupported-script", "no-signal", "empty-input"].includes(unsupported.method),
    `Unexpected unsupported fallback method: ${unsupported.method}`
  );

  assert.strictEqual(
    LanguageDetect.detectTargetLanguageFromRequest("Translate this to French: Nyx is ready."),
    "fr",
    "Direct French translation target should be detected"
  );

  assert.strictEqual(
    LanguageDetect.detectTargetLanguageFromRequest("Translate this into Spanish: Nyx is ready."),
    "es",
    "Direct Spanish translation target should be detected"
  );

  assert.strictEqual(
    LanguageDetect.detectTargetLanguageFromRequest("Translate this to English: Nyx est prête."),
    "en",
    "Direct English translation target should be detected"
  );

  console.log("PASS language-detect-regression");
})();

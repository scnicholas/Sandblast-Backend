const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const RUNTIME_DIR = path.resolve(__dirname, "../Data/marion/runtime");

function loadRuntimeModule(fileName) {
  const modulePath = path.join(RUNTIME_DIR, fileName);

  try {
    return require(modulePath);
  } catch (err) {
    const detail = err && err.message ? err.message : String(err);
    throw new Error(
      `Unable to load ${fileName} from Marion runtime path: ${modulePath}. Original error: ${detail}`
    );
  }
}

async function runTranslationGateRegression() {
  const adapter = loadRuntimeModule("UniversalTranslatorAdapter.js");
  const detect = loadRuntimeModule("LanguageDetect.js");
  const glossary = loadRuntimeModule("TranslationGlossary.js");
  const provider = loadRuntimeModule("LocalTranslationProvider.js");
  const memory = loadRuntimeModule("TranslationMemoryStore.js");

  assert(adapter && typeof adapter.translateText === "function", "UniversalTranslatorAdapter.translateText must be available");
  assert(adapter && typeof adapter.applyUniversalTranslation === "function", "UniversalTranslatorAdapter.applyUniversalTranslation must be available");
  assert(detect && typeof detect.detectLanguage === "function", "LanguageDetect.detectLanguage must be available");
  assert(detect && typeof detect.detectTargetLanguageFromRequest === "function", "LanguageDetect.detectTargetLanguageFromRequest must be available");
  assert(glossary && typeof glossary.protectText === "function", "TranslationGlossary.protectText must be available");
  assert(glossary && typeof glossary.restoreText === "function", "TranslationGlossary.restoreText must be available");
  assert(provider, "LocalTranslationProvider module must load");
  assert(memory && typeof memory.createTranslationMemoryStore === "function", "TranslationMemoryStore.createTranslationMemoryStore must be available");

  assert.strictEqual(detect.detectLanguage("Bonjour, merci beaucoup.").language, "fr");
  assert.strictEqual(detect.detectLanguage("Hola, gracias.").language, "es");
  assert.strictEqual(detect.detectTargetLanguageFromRequest("Translate this to Spanish"), "es");

  const protectedPayload = glossary.protectText(
    "Explain Marion Bridge, Final Authority, State Spine, and Context Passport.",
    {}
  );
  const protectedValues = protectedPayload.tokens.map((token) => token.value);

  for (const term of ["Marion Bridge", "Final Authority", "State Spine", "Context Passport"]) {
    assert(protectedValues.includes(term), `missing protected term ${term}`);
  }

  assert.strictEqual(
    glossary.restoreText(protectedPayload.text, protectedPayload.tokens),
    "Explain Marion Bridge, Final Authority, State Spine, and Context Passport."
  );

  const manual = await adapter.translateText("Start Reading", {
    sourceLanguage: "en",
    targetLanguage: "fr",
  });
  assert.strictEqual(manual.text, "Commencer la lecture");
  assert.strictEqual(manual.meta.translated, true);
  assert.strictEqual(manual.meta.marionAuthorityRequired, true);
  assert.strictEqual(manual.meta.finalAnswerAuthorized, false);

  const protectedMiss = await adapter.translateText(
    "Explain Marion Bridge in a calm professional tone.",
    { sourceLanguage: "en", targetLanguage: "es" }
  );
  assert(protectedMiss.text.includes("Marion Bridge"), "protected term should survive translation fallback/miss");
  assert.strictEqual(protectedMiss.meta.marionAuthorityRequired, true);
  assert.strictEqual(protectedMiss.meta.finalAnswerAuthorized, false);

  const unsupported = await adapter.translateText("Hello", {
    sourceLanguage: "en",
    targetLanguage: "de",
  });
  assert.strictEqual(unsupported.text, "Hello");
  assert.strictEqual(unsupported.meta.translated, false);

  const envelope = {
    final: "Start Reading",
    authority: "marion",
    nested: { keep: true },
  };
  const out = await adapter.applyUniversalTranslation(envelope, {
    sourceLanguage: "en",
    targetLanguage: "fr",
  });

  assert.notStrictEqual(out, envelope, "envelope should be cloned");
  assert.strictEqual(out.final, "Commencer la lecture");
  assert.strictEqual(envelope.final, "Start Reading");
  assert.strictEqual(out.translationMeta.marionAuthorityRequired, true);
  assert.strictEqual(out.translationMeta.finalAnswerAuthorized, false);

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "translation-gate-"));
  const memoryPath = path.join(tmpDir, "tmp-memory.json");

  try {
    const store = memory.createTranslationMemoryStore({
      filePath: memoryPath,
      maxEntries: 10,
    });

    store.set({
      sourceLanguage: "en",
      targetLanguage: "fr",
      sourceText: "Hello world",
      translatedText: "Bonjour le monde",
      provider: "test",
      confidence: 1,
      protectedTerms: ["Marion Bridge"],
    });

    const hit = store.get({
      sourceLanguage: "en",
      targetLanguage: "fr",
      sourceText: "Hello world",
      protectedTerms: ["Marion Bridge"],
    });
    assert.strictEqual(hit.hit, true);

    const miss = store.get({
      sourceLanguage: "en",
      targetLanguage: "es",
      sourceText: "Hello world",
      protectedTerms: ["Marion Bridge"],
    });
    assert.strictEqual(miss.hit, false);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

if (typeof describe === "function" && typeof test === "function") {
  describe("translation gate regression", () => {
    test("preserves LanguageSphere routing, glossary, authority, envelope, fallback, and memory behavior", async () => {
      await runTranslationGateRegression();
    });
  });
} else if (require.main === module) {
  runTranslationGateRegression()
    .then(() => {
      console.log("translation gate regression passed");
    })
    .catch((err) => {
      console.error(err);
      process.exitCode = 1;
    });
}

module.exports = {
  RUNTIME_DIR,
  loadRuntimeModule,
  runTranslationGateRegression,
};

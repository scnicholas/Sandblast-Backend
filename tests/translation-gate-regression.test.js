
const assert = require("assert");
const fs = require("fs");
const path = require("path");

async function main() {
  const adapter = require("./UniversalTranslatorAdapter.js");
  const detect = require("./LanguageDetect.js");
  const glossary = require("./TranslationGlossary.js");
  const provider = require("./LocalTranslationProvider.js");
  const memory = require("./TranslationMemoryStore.js");

  assert.strictEqual(detect.detectLanguage("Bonjour, merci beaucoup.").language, "fr");
  assert.strictEqual(detect.detectLanguage("Hola, gracias.").language, "es");
  assert.strictEqual(detect.detectTargetLanguageFromRequest("Translate this to Spanish"), "es");

  const protectedPayload = glossary.protectText("Explain Marion Bridge, Final Authority, State Spine, and Context Passport.", {});
  const protectedValues = protectedPayload.tokens.map(t => t.value);
  for (const term of ["Marion Bridge", "Final Authority", "State Spine", "Context Passport"]) {
    assert(protectedValues.includes(term), `missing protected term ${term}`);
  }
  assert.strictEqual(glossary.restoreText(protectedPayload.text, protectedPayload.tokens), "Explain Marion Bridge, Final Authority, State Spine, and Context Passport.");

  const manual = await adapter.translateText("Start Reading", { sourceLanguage: "en", targetLanguage: "fr" });
  assert.strictEqual(manual.text, "Commencer la lecture");
  assert.strictEqual(manual.meta.translated, true);
  assert.strictEqual(manual.meta.marionAuthorityRequired, true);
  assert.strictEqual(manual.meta.finalAnswerAuthorized, false);

  const protectedMiss = await adapter.translateText("Explain Marion Bridge in a calm professional tone.", { sourceLanguage: "en", targetLanguage: "es" });
  assert(protectedMiss.text.includes("Marion Bridge"));
  assert.strictEqual(protectedMiss.meta.marionAuthorityRequired, true);
  assert.strictEqual(protectedMiss.meta.finalAnswerAuthorized, false);

  const unsupported = await adapter.translateText("Hello", { sourceLanguage: "en", targetLanguage: "de" });
  assert.strictEqual(unsupported.text, "Hello");
  assert.strictEqual(unsupported.meta.translated, false);

  const envelope = { final: "Start Reading", authority: "marion", nested: { keep: true } };
  const out = await adapter.applyUniversalTranslation(envelope, { sourceLanguage: "en", targetLanguage: "fr" });
  assert.notStrictEqual(out, envelope, "envelope should be cloned");
  assert.strictEqual(out.final, "Commencer la lecture");
  assert.strictEqual(envelope.final, "Start Reading");
  assert.strictEqual(out.translationMeta.marionAuthorityRequired, true);
  assert.strictEqual(out.translationMeta.finalAnswerAuthorized, false);

  const store = memory.createTranslationMemoryStore({ filePath: path.join(process.cwd(), "tmp-memory.json"), maxEntries: 10 });
  store.set({ sourceLanguage:"en", targetLanguage:"fr", sourceText:"Hello world", translatedText:"Bonjour le monde", provider:"test", confidence:1, protectedTerms:["Marion Bridge"] });
  const hit = store.get({ sourceLanguage:"en", targetLanguage:"fr", sourceText:"Hello world", protectedTerms:["Marion Bridge"] });
  assert(hit.hit === true);
  const miss = store.get({ sourceLanguage:"en", targetLanguage:"es", sourceText:"Hello world", protectedTerms:["Marion Bridge"] });
  assert(miss.hit === false);
  try { fs.unlinkSync(path.join(process.cwd(), "tmp-memory.json")); } catch (_) {}

  console.log("translation gate regression passed");
}
main().catch(err => { console.error(err); process.exit(1); });

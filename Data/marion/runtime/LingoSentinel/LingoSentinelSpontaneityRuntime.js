"use strict";

/**
 * LingoSentinelSpontaneityRuntime
 * Shared service export for LingoSentinel, Nyx, Nick/Nyx ↔ Marion language relay.
 */

const LanguageRegistry = require("./LingoSentinelLanguageRegistry");
const LanguageDetector = require("./LingoSentinelLanguageDetector");
const ToneAdapter = require("./LingoSentinelToneAdapter");
const TranslationEngine = require("./LingoSentinelTranslationEngine");
const TranslationProvider = require("./LingoSentinelTranslationProvider");
const ResponseNormalizer = require("./LingoSentinelResponseNormalizer");
const RealtimeTranslationBridge = require("./LingoSentinelRealtimeTranslationBridge");

const VERSION = "2.2.0-spontaneity-runtime";

function health() {
  return {
    ok: true,
    service: "LingoSentinelSpontaneityRuntime",
    version: VERSION,
    languages: LanguageRegistry.getSupportedLanguageCodes().length,
    engine: TranslationEngine.health(),
    publicSurface: "Nyx",
    finalAuthority: "Marion",
    diagnosticsRedacted: true
  };
}

module.exports = {
  VERSION,
  LanguageRegistry,
  LanguageDetector,
  ToneAdapter,
  TranslationEngine,
  TranslationProvider,
  ResponseNormalizer,
  RealtimeTranslationBridge,
  translateTurn: TranslationEngine.translateTurn,
  detect: TranslationEngine.detect,
  languages: TranslationEngine.languages,
  health
};

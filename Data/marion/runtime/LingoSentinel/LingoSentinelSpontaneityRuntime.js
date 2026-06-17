'use strict';

/**
 * LingoSentinelSpontaneityRuntime
 * One import point for spontaneous language modules.
 */

const TranslationEngine = require('./LingoSentinelTranslationEngine');
const TranslationRoute = require('./LingoSentinelSpontaneousTranslationRoute');
const RealtimeTranslationBridge = require('./LingoSentinelRealtimeTranslationBridge');
const LanguageDetector = require('./LingoSentinelLanguageDetector');
const ToneAdapter = require('./LingoSentinelToneAdapter');
const ContextMemory = require('./LingoSentinelContextMemory');
const Provider = require('./LingoSentinelTranslationProvider');
const ResponseNormalizer = require('./LingoSentinelResponseNormalizer');

const VERSION = '2.1.0-spontaneity-runtime';

function health() {
  return {
    ok: true,
    service: 'LingoSentinelSpontaneityRuntime',
    version: VERSION,
    modules: {
      translationEngine: TranslationEngine.VERSION,
      translationRoute: TranslationRoute.VERSION,
      realtimeTranslationBridge: RealtimeTranslationBridge.VERSION,
      languageDetector: LanguageDetector.VERSION,
      toneAdapter: ToneAdapter.VERSION,
      contextMemory: ContextMemory.VERSION,
      provider: Provider.VERSION,
      responseNormalizer: ResponseNormalizer.VERSION
    },
    spontaneousTranslation: true,
    controlledPhraseFallbackOnly: false,
    publicSurface: 'Nyx',
    finalAuthority: 'Marion',
    diagnosticsRedacted: true
  };
}

module.exports = {
  VERSION,
  health,
  TranslationEngine,
  TranslationRoute,
  RealtimeTranslationBridge,
  LanguageDetector,
  ToneAdapter,
  ContextMemory,
  Provider,
  ResponseNormalizer
};

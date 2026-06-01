'use strict';

/**
 * Sandblast Benchmark Scenarios
 * Phase 2 foundation file.
 *
 * These are controlled scenario definitions. They are data-only on purpose.
 * Later, this file can be expanded to call Marion, Nyx, LanguageSphere, or bridge handlers directly.
 */

const CONTROLLED_SCENARIOS = Object.freeze([
  {
    id: 'general-chat-baseline',
    phase: 'phase2',
    category: 'general_chat',
    prompt: 'Explain benchmarking in simple terms.',
    expectedSignals: {
      finalAuthority: 'Marion',
      languageDetected: 'en',
      translationRequired: false,
      fallbackTriggered: false
    }
  },
  {
    id: 'business-strategy-baseline',
    phase: 'phase2',
    category: 'business_strategy',
    prompt: 'Give me the next practical step to commercialize Marion without weakening the architecture.',
    expectedSignals: {
      finalAuthority: 'Marion',
      languageDetected: 'en',
      translationRequired: false,
      fallbackTriggered: false
    }
  },
  {
    id: 'technical-debugging-baseline',
    phase: 'phase2',
    category: 'technical_debugging',
    prompt: 'Diagnose why a runtime bridge may be looping on the same clarification response.',
    expectedSignals: {
      finalAuthority: 'Marion',
      languageDetected: 'en',
      translationRequired: false,
      fallbackTriggered: false
    }
  },
  {
    id: 'translation-french-baseline',
    phase: 'phase2',
    category: 'translation',
    prompt: 'Translate this into French while preserving tone: We are building a cognitive operating system.',
    expectedSignals: {
      finalAuthority: 'Marion',
      languageDetected: 'en',
      translationRequired: true,
      fallbackTriggered: false
    }
  },
  {
    id: 'translation-spanish-baseline',
    phase: 'phase2',
    category: 'translation',
    prompt: 'Translate this into Spanish while preserving tone: Marion keeps final authority over the response.',
    expectedSignals: {
      finalAuthority: 'Marion',
      languageDetected: 'en',
      translationRequired: true,
      fallbackTriggered: false
    }
  },
  {
    id: 'unknown-language-fallback-baseline',
    phase: 'phase2',
    category: 'unknown_language',
    prompt: 'Translate this unknown phrase: zharuun mek tala vesh.',
    expectedSignals: {
      finalAuthority: 'Marion',
      languageDetected: 'unknown',
      translationRequired: false,
      fallbackTriggered: true
    }
  },
  {
    id: 'multi-turn-continuity-baseline',
    phase: 'phase2',
    category: 'continuity',
    prompt: 'Continue the previous benchmarking plan and give me only the next two steps.',
    expectedSignals: {
      finalAuthority: 'Marion',
      languageDetected: 'en',
      translationRequired: false,
      fallbackTriggered: false
    }
  },
  {
    id: 'ambiguous-request-baseline',
    phase: 'phase2',
    category: 'ambiguity_handling',
    prompt: 'Do the next thing.',
    expectedSignals: {
      finalAuthority: 'Marion',
      languageDetected: 'en',
      translationRequired: false,
      fallbackTriggered: true
    }
  }
]);

function getControlledScenarios() {
  return CONTROLLED_SCENARIOS.map((scenario) => ({ ...scenario }));
}

function getScenarioById(id) {
  return CONTROLLED_SCENARIOS.find((scenario) => scenario.id === id) || null;
}

module.exports = {
  CONTROLLED_SCENARIOS,
  getControlledScenarios,
  getScenarioById
};

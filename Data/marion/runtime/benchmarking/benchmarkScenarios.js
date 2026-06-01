'use strict';

/**
 * Sandblast Benchmark Scenarios
 * Phase 2 foundation file.
 *
 * These are controlled scenario definitions. They are data-only on purpose.
 * Later, this file can be expanded to call Marion, Nyx, LanguageSphere, or bridge handlers directly.
 *
 * Critical integrity rules:
 * - Marion remains final authority in every baseline scenario.
 * - Scenarios are cloned before export so test/runtime callers cannot mutate the source list.
 * - Scenario normalization prevents malformed custom scenario input from crashing the harness.
 */

const DEFAULT_EXPECTED_SIGNALS = Object.freeze({
  finalAuthority: 'Marion',
  languageDetected: 'unknown',
  translationRequired: false,
  fallbackTriggered: false
});

const CONTROLLED_SCENARIOS = Object.freeze([
  Object.freeze({
    id: 'general-chat-baseline',
    phase: 'phase2',
    category: 'general_chat',
    prompt: 'Explain benchmarking in simple terms.',
    expectedSignals: Object.freeze({
      finalAuthority: 'Marion',
      languageDetected: 'en',
      translationRequired: false,
      fallbackTriggered: false
    })
  }),
  Object.freeze({
    id: 'business-strategy-baseline',
    phase: 'phase2',
    category: 'business_strategy',
    prompt: 'Give me the next practical step to commercialize Marion without weakening the architecture.',
    expectedSignals: Object.freeze({
      finalAuthority: 'Marion',
      languageDetected: 'en',
      translationRequired: false,
      fallbackTriggered: false
    })
  }),
  Object.freeze({
    id: 'technical-debugging-baseline',
    phase: 'phase2',
    category: 'technical_debugging',
    prompt: 'Diagnose why a runtime bridge may be looping on the same clarification response.',
    expectedSignals: Object.freeze({
      finalAuthority: 'Marion',
      languageDetected: 'en',
      translationRequired: false,
      fallbackTriggered: false
    })
  }),
  Object.freeze({
    id: 'translation-french-baseline',
    phase: 'phase2',
    category: 'translation',
    prompt: 'Translate this into French while preserving tone: We are building a cognitive operating system.',
    expectedSignals: Object.freeze({
      finalAuthority: 'Marion',
      languageDetected: 'en',
      translationRequired: true,
      fallbackTriggered: false
    })
  }),
  Object.freeze({
    id: 'translation-spanish-baseline',
    phase: 'phase2',
    category: 'translation',
    prompt: 'Translate this into Spanish while preserving tone: Marion keeps final authority over the response.',
    expectedSignals: Object.freeze({
      finalAuthority: 'Marion',
      languageDetected: 'en',
      translationRequired: true,
      fallbackTriggered: false
    })
  }),
  Object.freeze({
    id: 'unknown-language-fallback-baseline',
    phase: 'phase2',
    category: 'unknown_language',
    prompt: 'Translate this unknown phrase: zharuun mek tala vesh.',
    expectedSignals: Object.freeze({
      finalAuthority: 'Marion',
      languageDetected: 'unknown',
      translationRequired: false,
      fallbackTriggered: true
    })
  }),
  Object.freeze({
    id: 'multi-turn-continuity-baseline',
    phase: 'phase2',
    category: 'continuity',
    prompt: 'Continue the previous benchmarking plan and give me only the next two steps.',
    expectedSignals: Object.freeze({
      finalAuthority: 'Marion',
      languageDetected: 'en',
      translationRequired: false,
      fallbackTriggered: false
    })
  }),
  Object.freeze({
    id: 'ambiguous-request-baseline',
    phase: 'phase2',
    category: 'ambiguity_handling',
    prompt: 'Do the next thing.',
    expectedSignals: Object.freeze({
      finalAuthority: 'Marion',
      languageDetected: 'en',
      translationRequired: false,
      fallbackTriggered: true
    })
  })
]);

function asBoolean(value) {
  return value === true || value === 'true' || value === 1;
}

function cloneScenario(scenario) {
  return {
    id: scenario.id,
    phase: scenario.phase,
    category: scenario.category,
    prompt: scenario.prompt,
    expectedSignals: {
      finalAuthority: scenario.expectedSignals.finalAuthority,
      languageDetected: scenario.expectedSignals.languageDetected,
      translationRequired: scenario.expectedSignals.translationRequired,
      fallbackTriggered: scenario.expectedSignals.fallbackTriggered
    }
  };
}

function normalizeScenario(input = {}) {
  const safeInput = input && typeof input === 'object' ? input : {};
  const expectedSignals =
    safeInput.expectedSignals && typeof safeInput.expectedSignals === 'object'
      ? safeInput.expectedSignals
      : {};

  const id = typeof safeInput.id === 'string' && safeInput.id.trim()
    ? safeInput.id.trim()
    : 'unknown-scenario';

  const phase = typeof safeInput.phase === 'string' && safeInput.phase.trim()
    ? safeInput.phase.trim()
    : 'phase2';

  const category = typeof safeInput.category === 'string' && safeInput.category.trim()
    ? safeInput.category.trim()
    : 'unknown';

  const prompt = typeof safeInput.prompt === 'string'
    ? safeInput.prompt
    : '';

  return {
    id,
    phase,
    category,
    prompt,
    expectedSignals: {
      finalAuthority: expectedSignals.finalAuthority || DEFAULT_EXPECTED_SIGNALS.finalAuthority,
      languageDetected: expectedSignals.languageDetected || DEFAULT_EXPECTED_SIGNALS.languageDetected,
      translationRequired: asBoolean(expectedSignals.translationRequired),
      fallbackTriggered: asBoolean(expectedSignals.fallbackTriggered)
    }
  };
}

function getControlledScenarios() {
  return CONTROLLED_SCENARIOS.map(cloneScenario);
}

function getScenarioById(id) {
  const scenario = CONTROLLED_SCENARIOS.find((item) => item.id === id);
  return scenario ? cloneScenario(scenario) : null;
}

module.exports = {
  DEFAULT_EXPECTED_SIGNALS,
  CONTROLLED_SCENARIOS,
  normalizeScenario,
  getControlledScenarios,
  getScenarioById
};

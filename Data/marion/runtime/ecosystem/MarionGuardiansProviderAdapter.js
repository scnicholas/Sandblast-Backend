'use strict';

const VERSION = 'marion.guardiansProviderAdapter/5.0';

const providers = new Map();

function clean(value, max = 80) {
  return String(value == null ? '' : value)
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim()
    .slice(0, max);
}

function registerProvider(guardian, provider) {
  const id = clean(guardian, 64).toLowerCase();

  if (!['aster','thalon'].includes(id)) return false;

  if (!provider || (typeof provider !== 'function' && typeof provider !== 'object')) {
    return false;
  }

  providers.set(id, provider);
  return true;
}

function resolveMethod(provider, names) {
  if (typeof provider === 'function') return provider;

  for (const name of names) {
    if (provider && typeof provider[name] === 'function') {
      return provider[name].bind(provider);
    }
  }

  return null;
}

async function run(guardian, input = {}) {
  const id = clean(guardian, 64).toLowerCase();
  const provider = providers.get(id);

  if (!provider) {
    return {
      ok: false,
      error: `${id}_provider_unavailable`
    };
  }

  const method = resolveMethod(
    provider,
    id === 'aster'
      ? ['analyzeSignal','riskReview','patternReview','run','analyze']
      : ['strategyReview','scenarioPlanning','ethicalReview','decisionSupport','run','analyze']
  );

  if (!method) {
    return {
      ok: false,
      error: `${id}_provider_method_unavailable`
    };
  }

  const output = await method({
    ...input,
    advisoryOnly: true,
    finalAuthority: false,
    requiresMarionReview: true,
    automaticExecutionAllowed: false
  });

  return {
    ok: true,
    guardian: id,
    output
  };
}

function getHealth() {
  return {
    ok: true,
    service: 'MarionGuardiansProviderAdapter',
    version: VERSION,
    asterReady: providers.has('aster'),
    thalonReady: providers.has('thalon')
  };
}

function resetForTests() {
  providers.clear();
}

module.exports = Object.freeze({
  VERSION,
  registerProvider,
  run,
  getHealth,
  resetForTests
});

'use strict';

const VERSION = 'marion.chronicleProviderAdapter/5.0';

let provider = null;

function resolveMethod(target, names) {
  if (!target) return null;

  for (const name of names) {
    if (typeof target[name] === 'function') {
      return target[name].bind(target);
    }
  }

  return null;
}

function registerProvider(value) {
  provider = value && (typeof value === 'object' || typeof value === 'function')
    ? value
    : null;

  return Boolean(provider);
}

function getProvider() {
  return provider;
}

async function queryEvidence(input = {}) {
  if (!provider) {
    return {
      ok: false,
      error: 'chronicle_provider_unavailable',
      claims: []
    };
  }

  const method = resolveMethod(provider, [
    'queryEvidence',
    'searchEvidence',
    'query',
    'search',
    'retrieve'
  ]);

  if (!method) {
    return {
      ok: false,
      error: 'chronicle_query_not_supported',
      claims: []
    };
  }

  const result = await method({
    ...input,
    readOnly: true,
    requireProvenance: true,
    preserveConflicts: true,
    allowFabrication: false
  });

  return result && typeof result === 'object'
    ? result
    : {
        ok: true,
        claims: []
      };
}

async function reconstruct(input = {}) {
  if (!provider) {
    return {
      ok: false,
      error: 'chronicle_provider_unavailable'
    };
  }

  const method = resolveMethod(provider, [
    'reconstruct',
    'buildReconstruction',
    'renderPlan'
  ]);

  if (!method) {
    return {
      ok: false,
      error: 'chronicle_reconstruction_not_supported'
    };
  }

  return method({
    ...input,
    readOnly: true,
    requireProvenance: true,
    preserveUnknowns: true,
    allowFabrication: false,
    humanReviewRequired: true
  });
}

function getHealth() {
  return {
    ok: Boolean(provider),
    service: 'MarionChronicleProviderAdapter',
    version: VERSION,
    providerRegistered: Boolean(provider),
    readOnly: true,
    fabricationAllowed: false
  };
}

function resetForTests() {
  provider = null;
}

module.exports = Object.freeze({
  VERSION,
  registerProvider,
  getProvider,
  queryEvidence,
  reconstruct,
  getHealth,
  resetForTests
});

'use strict';

/**
 * Trusted server-side Marion ecosystem lifecycle adapter.
 * This module never starts itself and must not be mounted as an HTTP route.
 * The server should call start() once after required dependencies are configured.
 */
const VERSION = 'marion.ecosystemStartup/1.0';
const GATEWAY_PATH = './MarionEcosystemGateway';
let state = 'idle';
let attempts = 0;
let lastAttemptAt = null;
let lastSuccessAt = null;
let lastError = null;
let lastResults = null;

function readGateway() {
  try {
    const gateway = require(GATEWAY_PATH);
    if (!gateway || typeof gateway.initializeEcosystem !== 'function' || typeof gateway.getHealth !== 'function') {
      return { ok: false, error: 'gateway_initialization_contract_missing' };
    }
    return { ok: true, gateway };
  } catch (_) {
    return { ok: false, error: 'gateway_module_unavailable' };
  }
}

function summarizeHealth(health) {
  if (!health || typeof health !== 'object') return { ok: false, error: 'gateway_health_invalid' };
  const phases = {};
  for (const name of ['phase2', 'phase3', 'phase4', 'phase5']) {
    const phase = health.phases && health.phases[name];
    phases[name] = { ok: !!(phase && phase.ok === true), booted: !!(phase && phase.booted === true) };
    if (phase && typeof phase.error === 'string') phases[name].error = phase.error.slice(0, 80);
  }
  const phasesReady = Object.values(phases).every(phase => phase.ok && phase.booted);
  const marionReady = health.marionReady === true;
  return {
    ok: phasesReady && marionReady && health.fullEcosystemVerified === true,
    phasesReady,
    marionReady,
    fullEcosystemReady: phasesReady && marionReady && health.fullEcosystemReady === true,
    fullEcosystemVerified: phasesReady && marionReady && health.fullEcosystemVerified === true,
    phases
  };
}

function getHealth() {
  const found = readGateway();
  let gatewayHealth = { ok: false, error: found.error || 'gateway_health_unavailable' };
  if (found.ok) {
    try { gatewayHealth = summarizeHealth(found.gateway.getHealth()); }
    catch (_) { gatewayHealth = { ok: false, error: 'gateway_health_failed' }; }
  }
  return {
    ok: state === 'ready' && gatewayHealth.ok === true,
    service: 'MarionEcosystemStartup', version: VERSION, state,
    attempts, lastAttemptAt, lastSuccessAt, lastError,
    gateway: gatewayHealth,
    fullEcosystemReady: state === 'ready' && gatewayHealth.fullEcosystemReady === true,
    fullEcosystemVerified: state === 'ready' && gatewayHealth.fullEcosystemVerified === true
  };
}

/** Call only from a trusted server startup lifecycle, never from an untrusted request. */
function start(options = {}) {
  if (state === 'starting') return { ok: false, error: 'startup_in_progress', health: getHealth() };
  const prior = getHealth();
  if (prior.ok) return { ok: true, alreadyStarted: true, health: prior };
  if (options == null || typeof options !== 'object' || Array.isArray(options)) {
    return { ok: false, error: 'startup_options_invalid', health: getHealth() };
  }
  state = 'starting';
  attempts += 1;
  lastAttemptAt = Date.now();
  lastError = null;
  const found = readGateway();
  if (!found.ok) {
    state = 'failed'; lastError = found.error;
    return { ok: false, error: lastError, health: getHealth() };
  }
  try {
    // Gateways keep their own phase-specific options and readiness verification.
    const outcome = found.gateway.initializeEcosystem(options);
    if (outcome && typeof outcome.then === 'function') {
      state = 'failed'; lastError = 'async_gateway_initialization_not_supported';
      Promise.resolve(outcome).catch(() => {});
      return { ok: false, error: lastError, health: getHealth() };
    }
    lastResults = outcome && typeof outcome === 'object' ? { ok: outcome.ok === true } : { ok: false };
    const verified = summarizeHealth(found.gateway.getHealth());
    if (!outcome || outcome.ok !== true || !verified.ok) {
      state = 'failed'; lastError = 'ecosystem_not_verified';
      return { ok: false, error: lastError, phaseStatus: verified.phases || {}, health: getHealth() };
    }
    state = 'ready'; lastSuccessAt = Date.now();
    return { ok: true, health: getHealth() };
  } catch (_) {
    state = 'failed'; lastError = 'ecosystem_initialization_failed';
    return { ok: false, error: lastError, health: getHealth() };
  }
}

function resetForTests() {
  if (process.env.NODE_ENV !== 'test') return false;
  state = 'idle'; attempts = 0; lastAttemptAt = null; lastSuccessAt = null;
  lastError = null; lastResults = null;
  return true;
}

module.exports = Object.freeze({ VERSION, start, getHealth, resetForTests });

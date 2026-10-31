'use strict';

/**
 * Trusted, synchronous startup adapter for the Marion ecosystem gateway.
 * No import-time side effects, HTTP mounts, environment mutations, execution
 * permissions or learning activation. Call start() only from trusted startup.
 */
const VERSION = 'marion.ecosystemStartup/1.2-integrated-failure-reporting';
const GATEWAY_PATH = './MarionEcosystemGateway';
const PHASES = Object.freeze(['phase2', 'phase3', 'phase4', 'phase5']);
let state = 'idle';
let attempts = 0;
let lastAttemptAt = null;
let lastSuccessAt = null;
let lastError = null;
let lastResults = null;
let firstFailedPhase = null;
let firstFailureReason = null;

// Never emit arbitrary exception messages, module paths, credentials, or payloads.
function safeCode(value, fallback = 'unknown_failure') {
  if (typeof value !== 'string' || !/^[a-z][a-z0-9_]{0,79}$/.test(value)) return fallback;
  return value;
}
function object(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}
function readGateway() {
  try {
    const gateway = require(GATEWAY_PATH);
    if (!gateway || typeof gateway.initializeEcosystem !== 'function' || typeof gateway.getHealth !== 'function') {
      return { ok:false, error:'gateway_initialization_contract_missing' };
    }
    return { ok:true, gateway };
  } catch (_) {
    return { ok:false, error:'gateway_module_unavailable' };
  }
}
function phaseSnapshot(input) {
  const p = object(input);
  return {
    ok:p.ok === true,
    booted:p.booted === true,
    ...(p.error ? {error:safeCode(p.error)} : {})
  };
}
function summarizeHealth(health) {
  if (!health || typeof health !== 'object') return {ok:false,error:'gateway_health_invalid'};
  const phases = {};
  for (const name of PHASES) phases[name] = phaseSnapshot(object(health.phases)[name]);
  const phasesReady = PHASES.every(name => phases[name].ok && phases[name].booted);
  const marionReady = health.marionReady === true;
  return {
    ok:phasesReady && marionReady && health.fullEcosystemVerified === true,
    phasesReady,
    marionReady,
    fullEcosystemReady:phasesReady && marionReady && health.fullEcosystemReady === true,
    fullEcosystemVerified:phasesReady && marionReady && health.fullEcosystemVerified === true,
    phases
  };
}
function summarizeResults(outcome) {
  const result = object(outcome);
  const raw = object(result.results);
  const phases = {};
  for (const name of PHASES) {
    if (!Object.prototype.hasOwnProperty.call(raw, name)) {
      phases[name] = {attempted:false,ok:false};
      continue;
    }
    const p = object(raw[name]);
    phases[name] = {
      attempted:true,ok:p.ok === true,
      ...(typeof p.booted === 'boolean' ? {booted:p.booted} : {}),
      ...(p.error ? {error:safeCode(p.error)} : {})
    };
  }
  return {ok:result.ok === true, phases};
}
function identifyFailure(results, gatewayHealth) {
  const attempted = results && results.phases || {};
  const phases = gatewayHealth && gatewayHealth.phases || {};
  for (const name of PHASES) {
    const phase = attempted[name];
    if (phase && phase.attempted === true && phase.ok !== true) {
      return {phase:name,reason:phase.error || phases[name] && phases[name].error || 'phase_bootstrap_failed'};
    }
  }
  for (const name of PHASES) {
    const phase = phases[name];
    if (phase && (!phase.ok || !phase.booted)) {
      return {phase:name,reason:phase.error || 'phase_not_ready'};
    }
  }
  if (gatewayHealth && gatewayHealth.marionReady === false) return {phase:null,reason:'marion_runner_unavailable'};
  return {phase:null,reason:'ecosystem_not_verified'};
}
function getHealth() {
  const found = readGateway();
  let gatewayHealth = {ok:false,error:found.error || 'gateway_health_unavailable'};
  if (found.ok) {
    try { gatewayHealth = summarizeHealth(found.gateway.getHealth()); }
    catch (_) { gatewayHealth = {ok:false,error:'gateway_health_failed'}; }
  }
  const ok = state === 'ready' && gatewayHealth.ok === true;
  return {
    ok,service:'MarionEcosystemStartup',version:VERSION,state,
    attempts,lastAttemptAt,lastSuccessAt,lastError,
    firstFailedPhase,firstFailureReason,
    initialization:lastResults,
    gateway:gatewayHealth,
    fullEcosystemReady:ok && gatewayHealth.fullEcosystemReady === true,
    fullEcosystemVerified:ok && gatewayHealth.fullEcosystemVerified === true
  };
}
function fail(reason, results, health) {
  state = 'failed';
  lastError = safeCode(reason, 'ecosystem_initialization_failed');
  const selected = identifyFailure(results, health);
  firstFailedPhase = selected.phase;
  firstFailureReason = selected.reason;
  // One bounded diagnostic line per failed attempt. Never log payloads or credentials.
  if (process.env.SB_MARION_STARTUP_FAILURE_LOG !== 'false') {
    console.error('[Sandblast][marion-ecosystem-failure]', {
      error:lastError, firstFailedPhase, firstFailureReason,
      attemptedPhases:results && results.phases || {}
    });
  }
  return {ok:false,error:lastError,firstFailedPhase,firstFailureReason,
    phaseStatus:health && health.phases || {},
    initialization:lastResults,health:getHealth()};
}
/** Explicit trusted server-side call. No automatic retries or HTTP initiation. */
function start(options = {}) {
  if (state === 'starting') return {ok:false,error:'startup_in_progress',health:getHealth()};
  const prior = getHealth();
  if (prior.ok) return {ok:true,alreadyStarted:true,health:prior};
  if (options === null || typeof options !== 'object' || Array.isArray(options)) {
    return {ok:false,error:'startup_options_invalid',health:getHealth()};
  }
  state = 'starting';
  attempts += 1;
  lastAttemptAt = Date.now();
  lastError = null;
  lastResults = null;
  firstFailedPhase = null;
  firstFailureReason = null;
  const found = readGateway();
  if (!found.ok) return fail(found.error, null, null);
  let outcome;
  try {
    outcome = found.gateway.initializeEcosystem(options);
  } catch (_) {
    return fail('gateway_initialization_exception', null, null);
  }
  if (outcome && typeof outcome.then === 'function') {
    Promise.resolve(outcome).catch(() => {});
    return fail('async_gateway_initialization_not_supported', null, null);
  }
  lastResults = summarizeResults(outcome);
  let verified;
  try { verified = summarizeHealth(found.gateway.getHealth()); }
  catch (_) { return fail('gateway_health_failed', lastResults, null); }
  if (!outcome || outcome.ok !== true || !verified.ok) {
    return fail('ecosystem_not_verified', lastResults, verified);
  }
  state = 'ready';
  lastSuccessAt = Date.now();
  return {ok:true,health:getHealth()};
}
function resetForTests() {
  if (process.env.NODE_ENV !== 'test') return false;
  state = 'idle';attempts = 0;lastAttemptAt = null;lastSuccessAt = null;
  lastError = null;lastResults = null;firstFailedPhase = null;firstFailureReason = null;
  return true;
}
module.exports = Object.freeze({VERSION,start,getHealth,resetForTests});

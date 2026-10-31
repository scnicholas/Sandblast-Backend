'use strict';

/**
 * Marion ecosystem component bootstrap.
 * Registers the existing Nyx and LingoSentinel components only.
 * Does not activate autonomous learning, grant execution permissions, or expose private routes.
 */
const Registry = require('./MarionComponentRegistry');
const Permissions = require('./MarionEcosystemPermissions');
const Nyx = require('./MarionNyxEcosystemAdapter');
const Lingo = require('./MarionLingoSentinelEcosystemAdapter');

const VERSION = 'marion.ecosystemComponentBootstrap/2.1-readiness-hardening';
const SERVICE = 'MarionEcosystemComponentBootstrap';
const POLICIES = Object.freeze({
  nyx: Object.freeze({
    read: ['lingosentinel.state', 'sandblast-channel.public'],
    write: ['nyx.state'],
    request: ['marion.reasoning', 'lingosentinel.translation'],
    execute: []
  }),
  lingosentinel: Object.freeze({
    read: ['nyx.session', 'lingosentinel.state'],
    write: ['lingosentinel.state'],
    request: ['marion.reasoning'],
    execute: []
  })
});

let booted = false;
let bootedAt = null;
let lastError = null;
let inProgress = false;

function safeError(error) {
  // Never expose stack traces, filesystem paths, or credentials in diagnostics.
  return error && typeof error.code === 'string' && /^[A-Z_]{2,40}$/.test(error.code)
    ? error.code
    : 'component_initialization_failed';
}

function safeHealth(adapter) {
  try {
    if (!adapter || typeof adapter.getHealth !== 'function') {
      return { ok: false, error: 'health_contract_unavailable' };
    }
    const result = adapter.getHealth();
    if (!result || typeof result !== 'object' || typeof result.then === 'function') {
      return { ok: false, error: 'health_contract_invalid' };
    }
    return { ...result, ok: result.ok === true };
  } catch (error) {
    return { ok: false, error: safeError(error) };
  }
}

function isRegistered(id) {
  try {
    return !!(Registry && typeof Registry.get === 'function' && Registry.get(id));
  } catch (_) {
    return false;
  }
}

function healthSnapshot() {
  const nyx = safeHealth(Nyx);
  const lingosentinel = safeHealth(Lingo);
  const registered = { nyx: isRegistered('nyx'), lingosentinel: isRegistered('lingosentinel') };
  return {
    ok: booted && registered.nyx && registered.lingosentinel && nyx.ok && lingosentinel.ok,
    service: SERVICE,
    version: VERSION,
    booted,
    bootedAt,
    inProgress,
    registered,
    nyx,
    lingosentinel,
    ...(lastError ? { error: lastError } : {})
  };
}

function bootstrap(options = {}) {
  const strict = !!(options && options.strict === true);
  if (inProgress) {
    const failure = { ok: false, service: SERVICE, version: VERSION, error: 'bootstrap_in_progress', strict };
    if (strict) throw new Error('Marion ecosystem bootstrap already in progress');
    return failure;
  }
  // Successful repeat calls are safe: do not re-register and overwrite policies.
  if (booted) {
    const current = healthSnapshot();
    if (current.ok) return { ...current, strict, alreadyBooted: true };
    // No automatic re-registration after deterioration: caller must investigate.
    const failure = { ...current, ok: false, strict, error: 'previous_bootstrap_unhealthy' };
    if (strict) throw new Error('Marion ecosystem previously booted but is unhealthy');
    return failure;
  }

  inProgress = true;
  lastError = null;
  const results = {};
  try {
    if (!Registry || typeof Registry.get !== 'function' ||
        !Permissions || typeof Permissions.setPolicy !== 'function' ||
        !Nyx || typeof Nyx.register !== 'function' ||
        !Lingo || typeof Lingo.register !== 'function') {
      throw Object.assign(new Error('Missing required bootstrap contract'), { code: 'INVALID_MODULE_CONTRACT' });
    }

    results.nyx = Nyx.register();
    if (results.nyx && results.nyx.ok === false) {
      throw Object.assign(new Error('Nyx registration failed'), { code: 'NYX_REGISTRATION_FAILED' });
    }
    results.lingo = Lingo.register();
    if (results.lingo && results.lingo.ok === false) {
      throw Object.assign(new Error('LingoSentinel registration failed'), { code: 'LINGO_REGISTRATION_FAILED' });
    }

    // Preserve the existing permissions exactly; no execute capability is added.
    for (const id of ['nyx', 'lingosentinel']) {
      const source = POLICIES[id];
      const policy = Object.fromEntries(Object.entries(source).map(([key, values]) => [key, [...values]]));
      const applied = Permissions.setPolicy(id, policy);
      if (applied === false || (applied && applied.ok === false)) {
        throw Object.assign(new Error('Permission registration failed'), { code: 'POLICY_REGISTRATION_FAILED' });
      }
    }

    const nyxHealth = safeHealth(Nyx);
    const lingoHealth = safeHealth(Lingo);
    if (!isRegistered('nyx') || !isRegistered('lingosentinel') || !nyxHealth.ok || !lingoHealth.ok) {
      throw Object.assign(new Error('Component readiness failed'), { code: 'COMPONENT_NOT_READY' });
    }

    booted = true;
    bootedAt = Date.now();
    return {
      ...healthSnapshot(),
      results,
      components: { nyx: Registry.get('nyx'), lingosentinel: Registry.get('lingosentinel') },
      strict
    };
  } catch (error) {
    booted = false;
    bootedAt = null;
    lastError = safeError(error);
    // Dependencies may have made partial changes. Do not imply rollback occurred.
    const failure = {
      ...healthSnapshot(),
      ok: false,
      error: lastError,
      partialRegistrationPossible: true,
      strict
    };
    if (strict) {
      const wrapped = new Error(`Marion ecosystem bootstrap failed: ${lastError}`);
      wrapped.code = lastError;
      throw wrapped;
    }
    return failure;
  } finally {
    inProgress = false;
  }
}

function getHealth() {
  return healthSnapshot();
}

function resetForTests() {
  // Resets this module's state only; never claims to unregister other modules.
  booted = false;
  bootedAt = null;
  lastError = null;
  inProgress = false;
}

module.exports = Object.freeze({ VERSION, bootstrap, getHealth, resetForTests });

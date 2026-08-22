'use strict';

const Chronicle = require('./MarionChronicleEcosystemAdapter');
const ChronicleProvider = require('./MarionChronicleProviderAdapter');
const Guardians = require('./MarionGuardiansEcosystemAdapter');
const GuardianProviders = require('./MarionGuardiansProviderAdapter');
const Router = require('./MarionDomainIntelligenceRouter');

const VERSION = 'marion.ecosystemPhase5Bootstrap/5.0';

let booted = false;
let bootedAt = 0;

function bootstrap(options = {}) {
  if (options.chronicleProvider) {
    ChronicleProvider.registerProvider(
      options.chronicleProvider
    );
  }

  if (options.asterProvider) {
    GuardianProviders.registerProvider(
      'aster',
      options.asterProvider
    );
  }

  if (options.thalonProvider) {
    GuardianProviders.registerProvider(
      'thalon',
      options.thalonProvider
    );
  }

  const chronicle = Chronicle.register();
  const guardians = Guardians.register();

  booted =
    chronicle.ok === true &&
    guardians.ok === true;

  if (booted && !bootedAt) {
    bootedAt = Date.now();
  }

  return {
    ok: booted,
    service: 'MarionEcosystemPhase5Bootstrap',
    version: VERSION,
    booted,
    bootedAt,
    chronicle: Chronicle.getHealth(),
    guardians: Guardians.getHealth(),

    architecture: {
      marionFinalAuthority: true,
      domainModulesDirectlyCoupledToPublicNyx: false,
      domainModulesDirectlyCoupledToCRM: false,
      automaticExecutionAllowed: false
    }
  };
}

function getHealth() {
  const chronicle = Chronicle.getHealth();
  const guardians = Guardians.getHealth();
  const router = Router.getHealth();

  return {
    ok: booted && chronicle.ok && guardians.ok,
    service: 'MarionEcosystemPhase5Bootstrap',
    version: VERSION,
    booted,
    bootedAt,
    chronicle,
    guardians,
    router,

    architecture: {
      marionFinalAuthority: true,
      automaticExecutionAllowed: false
    }
  };
}

function resetForTests() {
  booted = false;
  bootedAt = 0;
  ChronicleProvider.resetForTests();
  GuardianProviders.resetForTests();
  Router.resetForTests();
}

module.exports = Object.freeze({
  VERSION,
  bootstrap,
  getHealth,
  resetForTests
});

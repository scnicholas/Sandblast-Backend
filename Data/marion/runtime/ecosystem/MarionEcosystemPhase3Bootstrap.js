'use strict';

const Registry = require('./MarionComponentRegistry');
const Permissions = require('./MarionEcosystemPermissions');
const Crm = require('./MarionCrmEcosystemAdapter');
const CrmRouter = require('./MarionCrmEventRouter');
const GoHighLevel = require('./MarionGoHighLevelReadAdapter');

const VERSION = 'marion.ecosystemPhase3Bootstrap/3.0';

let booted = false;
let bootedAt = 0;

function bootstrap(options = {}) {
  const crm = Crm.register();

  Permissions.setPolicy('crm', {
    read: ['crm.leads', 'crm.metrics'],
    write: ['crm.telemetry'],
    request: ['marion.analysis', 'marion.recommendation'],
    execute: []
  });

  const routes = CrmRouter.install();

  if (options.goHighLevelProvider) {
    GoHighLevel.registerProvider(options.goHighLevelProvider);
  }

  booted = crm.ok === true && routes.ok === true;
  bootedAt = booted ? Date.now() : bootedAt;

  return {
    ok: booted,
    service: 'MarionEcosystemPhase3Bootstrap',
    version: VERSION,
    booted,
    bootedAt,

    crm: Registry.get('crm'),
    routes,

    controls: {
      crmWriteAuthority: false,
      automaticOutreach: false,
      humanApprovalRequired: true
    }
  };
}

function getHealth() {
  const crm = Crm.getHealth();
  const routes = CrmRouter.getHealth();
  const ghl = GoHighLevel.getHealth();

  return {
    ok: booted && crm.ok && routes.ok,
    service: 'MarionEcosystemPhase3Bootstrap',
    version: VERSION,
    booted,
    bootedAt,
    crm,
    routes,
    goHighLevel: ghl,

    controls: {
      crmWriteAuthority: false,
      automaticOutreach: false,
      humanApprovalRequired: true
    }
  };
}

function resetForTests() {
  booted = false;
  bootedAt = 0;
  CrmRouter.resetForTests();
  GoHighLevel.resetForTests();
}

module.exports = Object.freeze({
  VERSION,
  bootstrap,
  getHealth,
  resetForTests
});

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
  if(booted)return {...getHealth(),alreadyBooted:true};
  let crm,routes;try{crm = Crm.register();}catch(_){return {ok:false,service:'MarionEcosystemPhase3Bootstrap',version:VERSION,booted:false,error:'crm_registration_failed'};}

  const permission = Permissions.setPolicy('crm', {
    read: ['crm.leads', 'crm.metrics'],
    write: ['crm.telemetry'],
    request: ['marion.analysis', 'marion.recommendation'],
    execute: []
  });

  try{routes = CrmRouter.install();}catch(_){return {ok:false,service:'MarionEcosystemPhase3Bootstrap',version:VERSION,booted:false,error:'crm_router_install_failed'};}

  if (options.goHighLevelProvider) {
    try{GoHighLevel.registerProvider(options.goHighLevelProvider);}catch(_){return {ok:false,service:'MarionEcosystemPhase3Bootstrap',version:VERSION,booted:false,error:'crm_provider_registration_failed'};}
  }

  booted = crm.ok === true && routes.ok === true && permission.ok === true;
  bootedAt = booted ? Date.now() : bootedAt;

  return {
    ok: booted,
    service: 'MarionEcosystemPhase3Bootstrap',
    version: VERSION,
    booted,
    bootedAt,

    crm: Registry.get('crm'),
    routes,
    permission,

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
    ok: booted && crm.ok && routes.ok && !!Permissions.getPolicy('crm'),
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

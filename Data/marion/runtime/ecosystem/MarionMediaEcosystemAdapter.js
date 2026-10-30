
'use strict';

const Registry = require('./MarionComponentRegistry');
const Permissions = require('./MarionEcosystemPermissions');
const StateSpine = require('./MarionEcosystemStateSpine');
const Channel = require('./MarionSandblastChannelAdapter');
const Radio = require('./MarionRadioEcosystemAdapter');
const TV = require('./MarionTvEcosystemAdapter');
const Synapse = require('./MarionSynapseEcosystemAdapter');

const VERSION = 'marion.mediaEcosystemAdapter/4.0';
const adapters = Object.freeze([Channel,Radio,TV,Synapse]);

function registerAll() {
  const results = adapters.map(adapter=>adapter.register(Registry,Permissions));
  for (const adapter of adapters) {
    StateSpine.setGlobal(adapter.COMPONENT,{status:'ready',data:{adapterVersion:adapter.VERSION,telemetryOnly:true,directControl:false}});
    Registry.updateStatus(adapter.COMPONENT,'ready',{ecosystemPhase:4,telemetryOnly:true,directControl:false});
  }
  return {ok:results.every(r=>r&&r.ok),version:VERSION,components:adapters.map(a=>Registry.get(a.COMPONENT)),results};
}

function getHealth(){ return {ok:adapters.every(a=>Registry.has(a.COMPONENT)),service:'MarionMediaEcosystemAdapter',version:VERSION,components:adapters.map(a=>Registry.get(a.COMPONENT))}; }

module.exports = Object.freeze({ VERSION, adapters, registerAll, getHealth });


const assert = require('assert');
const mods = [
 '../Data/marion/runtime/finalRenderTelemetry.js',
 '../Data/marion/runtime/domainConfidence.js',
 '../Data/marion/runtime/marionFinalEnvelope.js',
 '../Data/marion/runtime/marionLoopGuard.js',
 '../Data/marion/runtime/progressionTelemetry.js',
 '../Data/marion/runtime/composeMarionResponse.js',
 '../Data/marion/runtime/marionBridge.js',
 '../Utils/stateSpine.js',
 '../Utils/chatEngine.js'
];
for (const m of mods) {
  const mod = require(m);
  assert(mod);
}
console.log('ok require all runtime modules');

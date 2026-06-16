'use strict';

const assert = require('assert');
const Engine = require('../../Data/marion/runtime/LingoSentinel/LingoSentinelEngine.js');

assert.strictEqual(typeof Engine.confirmLiveAblyRoundtrip, 'function', 'confirmLiveAblyRoundtrip must be exported');
assert.strictEqual(Engine.PHASE2E_LIVE_ROUNDTRIP_VERSION, 'nyx.lingosentinel.engine.liveAblyRoundtrip/2.0');
assert.strictEqual(typeof Engine.buildPhase2ERoundtripState, 'function', 'buildPhase2ERoundtripState must be exported');

console.log('PASS lingosentinel-phase2e-engine-export-hotfix');

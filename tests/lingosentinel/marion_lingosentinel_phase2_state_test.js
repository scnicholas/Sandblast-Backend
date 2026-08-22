'use strict';

const assert = require('assert');
const Contract = require('../../Data/marion/runtime/LingoSentinel/MarionLingoSentinelStateContract');
const Store = require('../../Data/marion/runtime/LingoSentinel/MarionLingoSentinelStateStore');
const Bridge = require('../../Data/marion/runtime/LingoSentinel/MarionLingoSentinelStateBridge');

Store.resetForTests();
const a = Bridge.syncFromLingo({ sessionId:'phase2-state', sourceLanguage:'en', targetLanguage:'fr', cultureContext:'general', layer:'language', mode:'one_to_one', speakerRole:'host', uiState:'dock' });
assert.equal(a.ok,true); assert.equal(a.state.revision,1); assert.equal(a.state.targetLanguage,'fr');
const b = Bridge.syncFromLingo({ ...a.state, targetLanguage:'en', speakerRole:'remote', origin:'lingosentinel' });
assert.equal(b.ok,true); assert.equal(b.state.revision,2); assert.equal(b.state.sourceLanguage,'en'); assert.equal(b.state.targetLanguage,'en'); assert.equal(b.state.speakerRole,'remote');
const c = Bridge.syncFromLingo({ ...b.state, cultureContext:'social_norms', layer:'culture', mode:'live_translate' });
assert.equal(c.ok,true); assert.equal(c.state.revision,3); assert.equal(c.state.layer,'culture'); assert.equal(c.state.mode,'live_translate');
const ctx = Bridge.contextForMarion('phase2-state');
assert.equal(ctx.cultureContext,'social_norms'); assert.equal(ctx.stateRevision,3);
assert.equal(Contract.normalizeLanguage('French'),'fr');
console.log('PASS marion_lingosentinel_phase2_state_test');

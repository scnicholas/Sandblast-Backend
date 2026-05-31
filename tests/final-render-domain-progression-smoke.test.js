
const assert=require('assert');
const prog=require('../Data/marion/runtime/progressionTelemetry.js');
const dc=require('../Data/marion/runtime/domainConfidence.js');
const fr=require('../Data/marion/runtime/finalRenderTelemetry.js');
const profile=dc.buildDomainConfidenceProfile({text:'Explain cash flow vs profit',intent:'domain_question'});
assert(profile.primaryDomain === 'finance' || profile.knowledgeDomain === 'finance' || profile.domain === 'finance');
const pt=prog.buildProgressionTelemetry({profile:{active:true,lane:'progression_shaping_refinement',phaseKey:'phase4'},reply:'Run the render telemetry test.'});
assert(pt.finalRenderTelemetryActive === true);
assert.strictEqual(pt.publicSurfaceClean, true);
const rendered=fr.buildFinalRenderTelemetry({reply:'Explain cash flow vs profit in plain language.', domainConfidence:profile, canEmit:true, finalEnvelopeTrusted:true});
assert.strictEqual(rendered.domainConfidenceObserved, true);
assert.strictEqual(rendered.publicSurfaceClean, true);
console.log('ok domain progression final render');

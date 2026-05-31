/* Marion next-two-phases surgical regression smoke test */
'use strict';

const composeMod = require('../Data/marion/runtime/composeMarionResponse.js');
const bridgeMod = require('../Data/marion/runtime/marionBridge.js');
const phase = require('../Data/marion/runtime/phaseAnchorResolver.js');
const alias = require('../Data/marion/runtime/spokenAliasNormalizer.js');

const compose = composeMod._internal || composeMod;
const bridge = bridgeMod._internal || bridgeMod;

function assert(name, ok, detail = '') {
  if (!ok) {
    console.error(`FAIL: ${name}${detail ? ' — ' + detail : ''}`);
    process.exitCode = 1;
  } else {
    console.log(`PASS: ${name}`);
  }
}

function hasFn(obj, name) {
  return obj && typeof obj[name] === 'function';
}

assert(
  'compose exposes progressionShapingRefinementReply',
  hasFn(compose, 'progressionShapingRefinementReply')
);

assert(
  'compose exposes domainConfidenceScoringReply',
  hasFn(compose, 'domainConfidenceScoringReply')
);

assert(
  'bridge exposes applyProjectRecoveryReplyOverride',
  hasFn(bridge, 'applyProjectRecoveryReplyOverride')
);

if (process.exitCode) process.exit(process.exitCode);

const progressionReply = compose.progressionShapingRefinementReply(
  'Continue with the progression shaping refinement.',
  {},
  {}
);

assert(
  'compose progression shaping reply',
  /Progression shaping refinement means testing/i.test(progressionReply) &&
    /5-7 turns|5–7 turns|five/i.test(progressionReply),
  progressionReply
);

const domainReply = compose.domainConfidenceScoringReply(
  'Move into domain confidence scoring.',
  {},
  {}
);

assert(
  'compose domain confidence reply',
  /Domain confidence scoring/i.test(domainReply) &&
    /cross-domain bleed|domain/i.test(domainReply),
  domainReply
);

const bridgeProgression = bridge.applyProjectRecoveryReplyOverride(
  { reply: 'The direct answer needs one usable example.' },
  {
    normalized: {
      userQuery: 'Continue with the progression shaping refinement.',
      phaseAnchor: { lane: 'progression_shaping_refinement' }
    }
  }
).reply;

assert(
  'bridge progression override',
  /Progression shaping refinement means testing/i.test(bridgeProgression),
  bridgeProgression
);

const bridgeDomain = bridge.applyProjectRecoveryReplyOverride(
  { reply: 'The direct answer needs one usable example.' },
  {
    normalized: {
      userQuery: 'Move into domain confidence scoring.',
      phaseAnchor: { lane: 'domain_confidence_scoring' }
    }
  }
).reply;

assert(
  'bridge domain confidence override',
  /Domain confidence scoring/i.test(bridgeDomain),
  bridgeDomain
);

const phaseAnchor = phase.resolvePhaseAnchor('Continue with phase 2', {
  activeLane: 'progression shaping refinement'
});

assert(
  'phase anchor progression phase 2',
  phaseAnchor.resolved === true &&
    phaseAnchor.lane === 'progression_shaping_refinement' &&
    phaseAnchor.phaseKey === 'phase2',
  JSON.stringify(phaseAnchor)
);

const normalized = alias.normalizeSpokenAliases(
  'after party run the 5:10 regression test'
);

assert(
  'spoken alias parity/progression capture',
  /mic-to-text parity/i.test(normalized) &&
    /progression shaping/i.test(normalized),
  normalized
);

if (!process.exitCode) {
  console.log('All next-two-phases surgical checks passed.');
}

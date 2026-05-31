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

function cleanText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function assertPublicReply(name, value) {
  const text = cleanText(value);
  assert(`${name} is non-empty`, text.length > 20, text);
  assert(
    `${name} has no public-control leakage`,
    !/direct answer needs one usable example|specific technical move|practical fix|useful check|active component|failure mode|validation step|internal routing|reply was unclear|ask again|^continue\.?$/i.test(text),
    text
  );
  return text;
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

const progressionReply = assertPublicReply(
  'compose progression shaping reply',
  compose.progressionShapingRefinementReply(
    'Continue with the progression shaping refinement.',
    {},
    {}
  )
);

assert(
  'compose progression shaping keeps active lane',
  /Progression shaping refinement means testing/i.test(progressionReply) &&
    /5-7 turns|5–7 turns|five/i.test(progressionReply) &&
    /lane|context|continuity|depth/i.test(progressionReply),
  progressionReply
);

const progressionTestingReply = assertPublicReply(
  'compose progression testing reply',
  compose.progressionShapingRefinementReply(
    'What are we testing inside that phase?',
    {},
    {}
  )
);

assert(
  'compose progression testing names continuity objective',
  /continuity objective|continuity\/depth|continuity depth|testing|confirm|checks/i.test(progressionTestingReply) &&
    /5-7 turn|5–7 turn|5-7 turns|5–7 turns|five|continuity\/depth|continuity depth/i.test(progressionTestingReply) &&
    /active technical lane|active lane|lane|context|continuity/i.test(progressionTestingReply),
  progressionTestingReply
);

const domainReply = assertPublicReply(
  'compose domain confidence reply',
  compose.domainConfidenceScoringReply(
    'Move into domain confidence scoring.',
    {},
    {}
  )
);

assert(
  'compose domain confidence names next phase',
  /Domain confidence scoring/i.test(domainReply) &&
    /cross-domain bleed|domain/i.test(domainReply),
  domainReply
);

const bridgeProgression = assertPublicReply(
  'bridge progression override',
  bridge.applyProjectRecoveryReplyOverride(
    { reply: 'The direct answer needs one usable example.' },
    {
      normalized: {
        userQuery: 'Continue with the progression shaping refinement.',
        phaseAnchor: { lane: 'progression_shaping_refinement' }
      }
    }
  ).reply
);

assert(
  'bridge progression override preserves lane',
  /Progression shaping refinement means testing/i.test(bridgeProgression),
  bridgeProgression
);

const bridgeContextProtection = assertPublicReply(
  'bridge context-protection override',
  bridge.applyProjectRecoveryReplyOverride(
    { reply: 'The direct answer needs one usable example.' },
    {
      normalized: {
        userQuery: 'How does this protect Marion from losing context?',
        phaseAnchor: { lane: 'progression_shaping_refinement' }
      }
    }
  ).reply
);

assert(
  'bridge context-protection answer stays in progression lane',
  /context|lane|continuity|5-7 turns|5–7 turns|five/i.test(bridgeContextProtection),
  bridgeContextProtection
);

const bridgeDomain = assertPublicReply(
  'bridge domain confidence override',
  bridge.applyProjectRecoveryReplyOverride(
    { reply: 'The direct answer needs one usable example.' },
    {
      normalized: {
        userQuery: 'Move into domain confidence scoring.',
        phaseAnchor: { lane: 'domain_confidence_scoring' }
      }
    }
  ).reply
);

assert(
  'bridge domain confidence override preserves lane',
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

const nextPhaseAnchor = phase.resolvePhaseAnchor('What is the next action after this test passes?', {
  activeLane: 'progression shaping refinement'
});

assert(
  'phase anchor next action after progression points forward',
  nextPhaseAnchor.resolved === true &&
    /domain_confidence_scoring|progression_shaping_refinement/.test(nextPhaseAnchor.lane),
  JSON.stringify(nextPhaseAnchor)
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

const normalizedDomain = alias.normalizeSpokenAliases(
  'move into domain confident scoring'
);

assert(
  'spoken alias domain confidence capture',
  /domain confidence scoring/i.test(normalizedDomain),
  normalizedDomain
);

if (!process.exitCode) {
  console.log('All next-two-phases surgical checks passed.');
}

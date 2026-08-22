'use strict';

const VERSION = 'sandblast.ecosystemBaseline/1.0.0';

const BASELINE = Object.freeze({
  name: 'Sandblast Ecosystem Baseline 1.0',
  baselineVersion: '1.0.0',
  status: 'STATIC_CERTIFIED_LIVE_PENDING',

  phases: Object.freeze([
    { phase: 1, name: 'Ecosystem Foundation', version: '1.0', role: 'control-plane foundation' },
    { phase: 2, name: 'Nyx + LingoSentinel', version: '2.0', role: 'conversation + language/cultural routing' },
    { phase: 3, name: 'CRM Intelligence', version: '3.0', role: 'read/analyze/recommend business intelligence' },
    { phase: 4, name: 'Media Intelligence', version: '4.0', role: 'telemetry + aggregation + media intelligence' },
    { phase: 5, name: 'Domain Intelligence', version: '5.0', role: 'CHRONICLE + Project Guardians' }
  ]),

  contracts: Object.freeze({
    ecosystem: 'sandblast.marion.ecosystem/1.0',
    ecosystemState: 'sandblast.marion.ecosystem-state/1.0',
    mediaEvent: 'sandblast.marion.media-event/4.0',
    domainIntelligence: 'sandblast.marion.domain-intelligence/5.0',
    chronicleClaim: 'sandblast.chronicle.claim/1.0'
  }),

  components: Object.freeze([
    'marion',
    'nyx',
    'lingosentinel',
    'crm',
    'sandblast-channel',
    'sandblast-radio',
    'sandblast-tv',
    'synapse',
    'chronicle',
    'project-guardians'
  ]),

  authority: Object.freeze({
    marionFinalAuthority: true,
    asterAdvisoryOnly: true,
    thalonAdvisoryOnly: true,
    crmAutomaticExecutionAllowed: false,
    domainAutomaticExecutionAllowed: false,
    mediaPlaybackControlAllowed: false
  }),

  certification: Object.freeze({
    staticCertified: true,
    liveCertified: false,
    liveCertificationRequiredBeforeProductionFreezeClaim: true
  })
});

module.exports = Object.freeze({
  VERSION,
  BASELINE
});

'use strict';

const Registry = require('./MarionComponentRegistry');
const Permissions = require('./MarionEcosystemPermissions');
const StateSpine = require('./MarionEcosystemStateSpine');
const Provider = require('./MarionChronicleProviderAdapter');
const Governor = require('./MarionChronicleIntegrityGovernor');

const VERSION = 'marion.chronicleEcosystemAdapter/5.0';

function clean(value, max = 6000) {
  return String(value == null ? '' : value)
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function arr(value) {
  return Array.isArray(value) ? value : [];
}

function register() {
  const result = Registry.register({
    id: 'chronicle',
    name: 'CHRONICLE',
    version: VERSION,
    type: 'domain-intelligence',
    ownerOnly: true,
    status: 'ready',

    capabilities: [
      'historical-reconstruction',
      'evidence-query',
      'claim-validation',
      'provenance-explanation',
      'temporal-validation'
    ],

    reads: [
      'chronicle.sources',
      'chronicle.claims',
      'chronicle.temporal-state'
    ],

    writes: [
      'chronicle.state'
    ],

    commands: [],

    metadata: {
      ecosystemPhase: 5,
      evidenceGoverned: true,
      claimLevelProvenance: true,
      unknownsRemainUnknown: true,
      theoryCannotProveHistoricalFacts: true
    }
  });

  Permissions.setPolicy('chronicle', {
    read: [
      'chronicle.sources',
      'chronicle.claims',
      'chronicle.temporal-state'
    ],
    write: ['chronicle.state'],
    request: ['marion.reasoning'],
    execute: []
  });

  StateSpine.setGlobal('chronicle', {
    status: 'ready',
    data: {
      adapterVersion: VERSION,
      providerReady: Provider.getHealth().ok,
      evidenceGoverned: true,
      directExecution: false
    }
  });

  return result;
}

async function handle(request = {}) {
  const requestedDate =
    request.context &&
    (
      request.context.requestedDate ||
      request.context.date ||
      request.context.temporalDate
    ) || '';

  const evidence = await Provider.queryEvidence({
    query: request.query,
    intent: request.intent,
    context: request.context,
    requestId: request.requestId,
    traceId: request.traceId,
    sessionId: request.sessionId
  });

  if (!evidence || evidence.ok === false) {
    return {
      ok: false,
      answer: 'CHRONICLE evidence provider is unavailable. No historical claim will be fabricated.',
      payload: {
        error: evidence && evidence.error || 'chronicle_provider_unavailable',
        claims: [],
        reconstructionEligible: false
      },
      warnings: ['unknowns_preserved'],
      advisoryOnly: true,
      humanReviewRequired: false
    };
  }

  const claims = arr(evidence.claims || evidence.results)
    .slice(0, 50)
    .map(claim => Governor.evaluate(claim, { requestedDate }));

  const allowed = claims.filter(item =>
    ['allow','review'].includes(item.decision)
  );

  const blocked = claims.filter(item =>
    item.decision === 'block'
  );

  const unknown = claims.filter(item =>
    item.decision === 'unknown'
  );

  const reconstructionEligible =
    allowed.length > 0 &&
    blocked.length === 0 &&
    allowed.every(item => item.reconstructionEligible || item.decision === 'review');

  const explanation = claims.map(item => Governor.explain(
    item.claim,
    { requestedDate }
  ));

  return {
    ok: true,
    answer: clean(
      evidence.summary ||
      (
        `${allowed.length} supported/reviewable claim(s), ` +
        `${unknown.length} unknown claim(s), ` +
        `${blocked.length} blocked claim(s).`
      ),
      6000
    ),

    payload: {
      claims,
      explanation,
      reconstructionEligible,
      evidenceCount: claims.length,
      unknownCount: unknown.length,
      blockedCount: blocked.length,
      supportedCount: allowed.length
    },

    warnings: [
      ...(blocked.length ? ['historical_integrity_blocks_present'] : []),
      ...(unknown.length ? ['unknowns_preserved'] : []),
      ...(claims.some(item => item.warnings.includes('conflicting_sources_preserved'))
        ? ['conflicting_sources_preserved']
        : [])
    ],

    advisoryOnly: true,
    humanReviewRequired:
      request.intent === 'historical_reconstruction' ||
      allowed.some(item => item.decision === 'review')
  };
}

function getHealth() {
  return {
    ok: Registry.has('chronicle'),
    service: 'MarionChronicleEcosystemAdapter',
    version: VERSION,
    registered: Registry.has('chronicle'),
    provider: Provider.getHealth(),
    directExecution: false
  };
}

module.exports = Object.freeze({
  VERSION,
  register,
  handle,
  getHealth
});

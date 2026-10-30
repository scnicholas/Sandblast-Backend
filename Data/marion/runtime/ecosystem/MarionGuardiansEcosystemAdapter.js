'use strict';

const Registry = require('./MarionComponentRegistry');
const Permissions = require('./MarionEcosystemPermissions');
const StateSpine = require('./MarionEcosystemStateSpine');
const Authority = require('./MarionGuardiansAuthorityPolicy');
const Providers = require('./MarionGuardiansProviderAdapter');

const VERSION = 'marion.guardiansEcosystemAdapter/5.0';

function clean(value, max = 5000) {
  return String(value == null ? '' : value)
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function register() {
  const result = Registry.register({
    id: 'project-guardians',
    name: 'Project Guardians',
    version: VERSION,
    type: 'domain-intelligence',
    ownerOnly: true,
    status: 'ready',

    capabilities: [
      'signal-analysis',
      'risk-review',
      'pattern-review',
      'strategy-review',
      'scenario-planning',
      'ethical-review',
      'decision-support'
    ],

    reads: [
      'project-guardians.state'
    ],

    writes: [
      'project-guardians.state'
    ],

    commands: [],

    metadata: {
      ecosystemPhase: 5,
      marionFinalAuthority: true,
      asterAdvisoryOnly: true,
      thalonAdvisoryOnly: true,
      directPublicCommunication: false,
      automaticExecutionAllowed: false
    }
  });

  Permissions.setPolicy('project-guardians', {
    read: ['project-guardians.state'],
    write: ['project-guardians.state'],
    request: ['marion.reasoning'],
    execute: []
  });

  StateSpine.setGlobal('project-guardians', {
    status: 'ready',
    data: {
      adapterVersion: VERSION,
      marionFinalAuthority: true,
      asterAdvisoryOnly: true,
      thalonAdvisoryOnly: true,
      directExecution: false
    }
  });

  return result;
}

function chooseGuardian(intent) {
  if ([
    'signal_analysis',
    'risk_review',
    'pattern_review'
  ].includes(intent)) {
    return 'aster';
  }

  return 'thalon';
}

async function handle(request = {}) {
  const guardian = chooseGuardian(request.intent);
  const authorization = Authority.authorizeReview(guardian, request.intent);

  if (!authorization.ok) {
    return {
      ok: false,
      answer: 'Guardian advisory routing denied.',
      payload: {
        guardian,
        authorization
      },
      advisoryOnly: true,
      humanReviewRequired: true
    };
  }

  const result = await Providers.run(
    guardian,
    {
      requestId: request.requestId,
      traceId: request.traceId,
      sessionId: request.sessionId,
      intent: request.intent,
      query: request.query,
      context: request.context
    }
  );

  if (!result.ok) {
    return {
      ok: false,
      answer: `${guardian} advisory provider is unavailable.`,
      payload: {
        guardian,
        error: result.error,
        requiresMarionReview: true
      },
      warnings: ['guardian_provider_unavailable'],
      advisoryOnly: true,
      humanReviewRequired: true
    };
  }

  const controlled = Authority.enforceOutput(
    guardian,
    result.output
  );

  return {
    ok: true,
    answer: clean(
      result.output &&
      (
        result.output.summary ||
        result.output.text ||
        result.output.message ||
        result.output.recommendation
      ) ||
      `${guardian} advisory review completed.`,
      5000
    ),

    payload: {
      guardian,
      review: controlled,
      marionFinalAuthority: true
    },

    warnings: [],
    advisoryOnly: true,
    humanReviewRequired: true
  };
}

function getHealth() {
  return {
    ok: Registry.has('project-guardians'),
    service: 'MarionGuardiansEcosystemAdapter',
    version: VERSION,
    registered: Registry.has('project-guardians'),
    providers: Providers.getHealth(),
    marionFinalAuthority: true,
    directExecution: false
  };
}

module.exports = Object.freeze({
  VERSION,
  register,
  chooseGuardian,
  handle,
  getHealth
});

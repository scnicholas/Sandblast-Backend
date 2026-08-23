'use strict';

const Manifest = require('./MarionEcosystemBaselineManifest');
const Registry = require('./MarionComponentRegistry');
const Permissions = require('./MarionEcosystemPermissions');
const StateSpine = require('./MarionEcosystemStateSpine');
const Gateway = require('./MarionEcosystemGateway');
const Phase2 = require('./MarionEcosystemComponentBootstrap');
const Phase3 = require('./MarionEcosystemPhase3Bootstrap');
const Phase4 = require('./MarionEcosystemPhase4Bootstrap');
const Phase5 = require('./MarionEcosystemPhase5Bootstrap');

const VERSION = 'marion.ecosystemBaselineHealth/1.0.2';

function safe(fn, fallback = {}) {
  try {
    return fn();
  } catch (error) {
    return {
      ok: false,
      error: String(
        error && (error.code || error.message || error.name) || 'health_error'
      ).slice(0, 180),
      ...fallback
    };
  }
}

function expectedComponents() {
  return Manifest.BASELINE.components.slice();
}

function componentMatrix() {
  const expected = expectedComponents();
  return expected.map(id => {
    const record = Registry.get(id);
    return {
      id,
      registered: Boolean(record),
      type: record && record.type || '',
      status: record && record.status || 'missing',
      version: record && record.version || ''
    };
  });
}

function getHealth(options = {}) {
  const registry = safe(() => Registry.getHealth());
  const permissions = safe(() => Permissions.getHealth());
  const state = safe(() => StateSpine.getHealth());
  const gateway = safe(() => Gateway.getHealth());
  const phase3 = safe(() => Phase3.getHealth());
  const phase4 = safe(() => Phase4.getHealth());
  const phase5 = safe(() => Phase5.getHealth());

  const components = componentMatrix();
  const structuralReady = components.every(item => item.registered);

  const liveCertified =
    options.liveCertified === true ||
    String(process.env.SANDBLAST_ECOSYSTEM_LIVE_CERTIFIED || '').toLowerCase() === 'true';

  const status = !structuralReady
    ? 'NOT_READY'
    : liveCertified
      ? 'LIVE_CERTIFIED'
      : 'STATIC_CERTIFIED_LIVE_PENDING';

  return {
    ok: structuralReady,
    service: 'MarionEcosystemBaselineHealth',
    version: VERSION,
    baselineVersion: Manifest.BASELINE.baselineVersion,
    status,

    certification: {
      staticCertified: true,
      patchRegressionCertified: true,
      liveCertified,
      productionFreezeClaimAllowed: structuralReady && liveCertified
    },

    components,
    registry,
    permissions,
    state,

    runtime: {
      marionGatewayReady: gateway && gateway.marionReady === true,
      phase2BootstrapAvailable: typeof Phase2.bootstrap === 'function',
      phase3,
      phase4,
      phase5
    },

    knownRuntimeBoundaries: {
      processLocalStatePresent: true,
      liveProviderCertificationRequired: true,
      routeMountUniquenessMustBeVerifiedInIndexJs: true,
      frozenIndexIncluded: true,
      domainRenderHotfixIncluded: true,
      domainRouterRenderCohesionIncluded: true,
      indexObjectResponseRenderGuardIncluded: true
    },

    generatedAt: Date.now()
  };
}

module.exports = Object.freeze({
  VERSION,
  getHealth,
  componentMatrix
});

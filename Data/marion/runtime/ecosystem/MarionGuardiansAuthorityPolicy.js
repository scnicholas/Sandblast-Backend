'use strict';

const VERSION = 'marion.guardiansAuthorityPolicy/5.0';

const GUARDIANS = Object.freeze({
  marion: {
    role: 'executive_orchestration',
    authority: 'primary',
    finalAuthority: true,
    advisoryOnly: false
  },
  aster: {
    role: 'analysis_layer',
    authority: 'advisory',
    finalAuthority: false,
    advisoryOnly: true
  },
  thalon: {
    role: 'strategic_layer',
    authority: 'advisory',
    finalAuthority: false,
    advisoryOnly: true
  }
});

function clean(value, max = 100) {
  return String(value == null ? '' : value)
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim()
    .slice(0, max);
}

function normalizeGuardian(value) {
  const s = clean(value, 64).toLowerCase();

  if (['talon','fallon','guardian-talon'].includes(s)) return 'thalon';
  if (['astro','guardian-aster'].includes(s)) return 'aster';
  if (['marian','mariam','nyx-admin','guardian-marion'].includes(s)) return 'marion';

  return s;
}

function getGuardian(value) {
  const id = normalizeGuardian(value);
  return GUARDIANS[id]
    ? { id, ...GUARDIANS[id] }
    : null;
}

function authorizeReview(guardian, intent) {
  const g = getGuardian(guardian);

  if (!g) {
    return {
      ok: false,
      decision: 'deny',
      reason: 'guardian_unregistered'
    };
  }

  if (g.id === 'aster') {
    const allowed = [
      'signal_analysis',
      'risk_review',
      'pattern_review'
    ].includes(intent);

    return {
      ok: allowed,
      decision: allowed ? 'allow_advisory' : 'deny',
      reason: allowed ? 'aster_advisory_analysis' : 'intent_not_allowed_for_aster',
      guardian: g
    };
  }

  if (g.id === 'thalon') {
    const allowed = [
      'strategy_review',
      'scenario_planning',
      'ethical_review',
      'decision_support'
    ].includes(intent);

    return {
      ok: allowed,
      decision: allowed ? 'allow_advisory' : 'deny',
      reason: allowed ? 'thalon_advisory_strategy' : 'intent_not_allowed_for_thalon',
      guardian: g
    };
  }

  return {
    ok: true,
    decision: 'allow_final_review',
    reason: 'marion_final_authority',
    guardian: g
  };
}

function enforceOutput(guardian, output = {}) {
  const g = getGuardian(guardian);

  if (!g) {
    return {
      ok: false,
      error: 'guardian_unregistered'
    };
  }

  return {
    ok: true,
    guardian: g.id,
    authority: g.authority,
    finalAuthority: g.finalAuthority,
    advisoryOnly: g.id !== 'marion',
    requiresMarionReview: g.id !== 'marion',
    mayOverrideMarion: false,
    directPublicCommunication: false,
    automaticExecutionAllowed: false,
    physicalActionControlAllowed: false,
    punitiveUseAllowed: false,
    coerciveUseAllowed: false,
    continuousAlarmControlAllowed: false,
    output
  };
}

module.exports = Object.freeze({
  VERSION,
  GUARDIANS,
  normalizeGuardian,
  getGuardian,
  authorizeReview,
  enforceOutput
});

'use strict';

const Claim = require('./MarionChronicleClaimContract');

const VERSION = 'marion.chronicleIntegrityGovernor/5.0';

function clean(value, max = 500) {
  return String(value == null ? '' : value)
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function dateValue(value) {
  const s = clean(value, 40);
  if (!s) return null;
  const n = Date.parse(`${s}T00:00:00Z`);
  return Number.isFinite(n) ? n : null;
}

function hasHistoricalEvidence(claim) {
  return (claim.sources || []).some(source =>
    ['primary','secondary','oral_history','statistical','legal','visual','map']
      .includes(source.evidenceClass)
  );
}

function hasTheoryOnly(claim) {
  return claim.theoreticalOnly === true ||
    (
      (claim.sources || []).length > 0 &&
      (claim.sources || []).every(source => source.evidenceClass === 'theoretical')
    );
}

function validateTemporal(claim, requestedDate) {
  const requested = dateValue(requestedDate);
  const from = dateValue(claim.validFrom);
  const to = dateValue(claim.validTo);

  if (requested == null) {
    return { ok: true, reason: 'no_requested_date' };
  }

  if (from != null && requested < from) {
    return { ok: false, reason: 'before_valid_from' };
  }

  if (to != null && requested > to) {
    return { ok: false, reason: 'after_valid_to' };
  }

  return { ok: true, reason: 'within_temporal_validity' };
}

function evaluate(input = {}, options = {}) {
  const claim = Claim.normalize(input);
  const validation = Claim.validate(claim);

  if (!validation.ok) {
    return {
      ok: false,
      decision: 'block',
      claim,
      reasons: validation.errors,
      version: VERSION
    };
  }

  const reasons = [];
  const warnings = [];
  let decision = 'allow';

  if (hasTheoryOnly(claim)) {
    decision = 'block';
    reasons.push('theory_cannot_prove_historical_detail');
  }

  if (!hasHistoricalEvidence(claim)) {
    if (claim.unknown || claim.confidence === 'D' || claim.confidence === 'UNKNOWN') {
      decision = decision === 'block' ? 'block' : 'unknown';
      warnings.push('historical_evidence_absent');
    } else {
      decision = 'block';
      reasons.push('historical_evidence_required');
    }
  }

  const temporal = validateTemporal(claim, options.requestedDate);

  if (!temporal.ok) {
    decision = 'block';
    reasons.push(temporal.reason);
  }

  if ((claim.conflictingSources || []).length > 0) {
    warnings.push('conflicting_sources_preserved');
    if (decision === 'allow' && ['C','D','UNKNOWN'].includes(claim.confidence)) {
      decision = 'review';
    }
  }

  if (claim.unknown === true || claim.confidence === 'UNKNOWN') {
    if (decision === 'allow') decision = 'unknown';
    warnings.push('unknown_must_remain_explicit');
  }

  if (claim.confidence === 'D' && decision === 'allow') {
    decision = 'review';
    warnings.push('low_confidence_requires_review');
  }

  if (claim.humanReviewRequired && decision === 'allow') {
    decision = 'review';
    warnings.push('human_review_required');
  }

  const reconstructionEligible =
    ['allow','review'].includes(decision) &&
    claim.reconstructionEligible === true &&
    hasHistoricalEvidence(claim) &&
    !hasTheoryOnly(claim);

  return {
    ok: decision !== 'block',
    decision,
    claim,
    reconstructionEligible,
    reasons,
    warnings,
    temporal,
    version: VERSION,
    rules: {
      theoryMayInformObserverFramework: true,
      theoryMayProveHistoricalFacts: false,
      preserveConflicts: true,
      unknownsRemainUnknown: true,
      requireTemporalValidity: true,
      requireClaimLevelProvenance: true
    }
  };
}

function explain(claimInput = {}, options = {}) {
  const evaluated = evaluate(claimInput, options);
  const claim = evaluated.claim;

  return {
    claimId: claim.claimId,
    statement: claim.statement,
    confidence: claim.confidence,
    decision: evaluated.decision,
    reconstructionEligible: evaluated.reconstructionEligible,
    sources: claim.sources,
    conflictingSources: claim.conflictingSources,
    reasons: evaluated.reasons,
    warnings: evaluated.warnings,
    answer: evaluated.decision === 'unknown'
      ? 'UNKNOWN — surviving evidence is insufficient to support a stronger reconstruction.'
      : evaluated.decision === 'block'
        ? 'BLOCKED — the claim does not satisfy CHRONICLE historical-integrity requirements.'
        : 'SUPPORTED WITH PROVENANCE — inspect the attached evidence and confidence state.'
  };
}

module.exports = Object.freeze({
  VERSION,
  evaluate,
  explain,
  validateTemporal,
  hasHistoricalEvidence,
  hasTheoryOnly
});

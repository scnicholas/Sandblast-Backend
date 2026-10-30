'use strict';

const crypto = require('crypto');

const VERSION = 'marion.chronicleClaimContract/5.0';
const CONTRACT = 'sandblast.chronicle.claim/1.0';

const CONFIDENCE = Object.freeze(['A', 'B', 'C', 'D', 'UNKNOWN']);
const EVIDENCE_CLASS = Object.freeze([
  'primary',
  'secondary',
  'oral_history',
  'statistical',
  'legal',
  'visual',
  'map',
  'theoretical',
  'unknown'
]);

function clean(value, max = 2000) {
  return String(value == null ? '' : value)
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function obj(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function arr(value) {
  return Array.isArray(value) ? value : [];
}

function id(value) {
  const s = clean(value, 128).replace(/[^a-zA-Z0-9._:-]/g, '-');
  if (s) return s;
  if (typeof crypto.randomUUID === 'function') return `claim-${crypto.randomUUID()}`;
  return `claim-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

function normalizeDate(value) {
  const s = clean(value, 40);
  if (!s) return '';
  const match = s.match(/^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?/);
  if (!match) return '';
  return [
    match[1],
    match[2] || '01',
    match[3] || '01'
  ].join('-');
}

function normalizeSource(source = {}) {
  const s = obj(source);
  const evidenceClass = clean(s.evidenceClass || s.class || 'unknown', 40).toLowerCase();

  return {
    sourceId: clean(s.sourceId || s.id, 128),
    title: clean(s.title, 300),
    institution: clean(s.institution || s.repository, 200),
    recordIdentifier: clean(s.recordIdentifier || s.accession || s.catalogId, 180),
    evidenceClass: EVIDENCE_CLASS.includes(evidenceClass) ? evidenceClass : 'unknown',
    url: clean(s.url || s.catalogUrl || s.originalUrl, 500),
    rightsStatus: clean(s.rightsStatus || s.rights, 120),
    retrievedAt: clean(s.retrievedAt, 64)
  };
}

function normalize(input = {}) {
  const claim = obj(input);

  const confidenceRaw = clean(claim.confidence || 'UNKNOWN', 16).toUpperCase();
  const confidence = CONFIDENCE.includes(confidenceRaw)
    ? confidenceRaw
    : 'UNKNOWN';

  return {
    contract: CONTRACT,
    version: VERSION,

    claimId: id(claim.claimId || claim.id),

    statement: clean(
      claim.statement ||
      claim.claim ||
      claim.text,
      3000
    ),

    city: clean(claim.city, 120),
    location: clean(claim.location || claim.address || claim.place, 240),

    validFrom: normalizeDate(claim.validFrom || claim.dateStart),
    validTo: normalizeDate(claim.validTo || claim.dateEnd),

    confidence,

    sources: arr(claim.sources)
      .slice(0, 30)
      .map(normalizeSource),

    conflictingSources: arr(claim.conflictingSources || claim.conflicts)
      .slice(0, 20)
      .map(normalizeSource),

    theoreticalOnly: claim.theoreticalOnly === true ||
      arr(claim.sources).some(source =>
        clean(obj(source).evidenceClass || obj(source).class, 40).toLowerCase() === 'theoretical'
      ) && !arr(claim.sources).some(source =>
        ['primary','secondary','oral_history','statistical','legal','visual','map']
          .includes(clean(obj(source).evidenceClass || obj(source).class, 40).toLowerCase())
      ),

    reconstructionEligible: claim.reconstructionEligible === true,

    unknown: claim.unknown === true || confidence === 'UNKNOWN',

    humanReviewRequired: claim.humanReviewRequired === true,

    notes: clean(claim.notes, 1000)
  };
}

function validate(claim = {}) {
  const errors = [];

  if (claim.contract !== CONTRACT) errors.push('contract_invalid');
  if (!clean(claim.claimId, 128)) errors.push('claimId_required');
  if (!clean(claim.statement, 3000)) errors.push('statement_required');
  if (!CONFIDENCE.includes(claim.confidence)) errors.push('confidence_invalid');

  return {
    ok: errors.length === 0,
    errors
  };
}

module.exports = Object.freeze({
  VERSION,
  CONTRACT,
  CONFIDENCE,
  EVIDENCE_CLASS,
  normalize,
  validate,
  normalizeSource,
  normalizeDate
});

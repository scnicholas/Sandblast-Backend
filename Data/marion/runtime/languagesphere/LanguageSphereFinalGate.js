'use strict';

/**
 * LanguageSphereFinalGate
 * ------------------------------------------------------------
 * Final gate protection between LanguageSphere and Marion.
 *
 * Purpose:
 * - Ensure LanguageSphere output is treated as prepared input only.
 * - Prevent LanguageSphere from becoming the visible final response.
 * - Preserve Marion final envelope ownership.
 *
 * This gate is intentionally conservative.
 */

const {
  validateLanguageSphereAuthority
} = require('./LanguageSphereAuthorityGuard');

function sanitizeObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value;
}

function sanitizeString(value, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

function sanitizeArray(value) {
  return Array.isArray(value) ? value : [];
}

function createBlockedFinalGateResult(reason, envelope = {}, extra = {}) {
  const safeEnvelope = sanitizeObject(envelope);
  const safeExtra = sanitizeObject(extra);

  return {
    ok: false,
    blocked: true,
    reason,
    finalAuthorityOwner: 'Marion',
    preparedInputText: '',
    languageSphereEnvelope: safeEnvelope,
    diagnostics: {
      warnings: [
        'LanguageSphere final gate blocked unsafe output.',
        reason,
        ...sanitizeArray(safeExtra.warnings)
      ],
      errors: sanitizeArray(safeExtra.errors)
    }
  };
}

function createPassedFinalGateResult(envelope = {}, extra = {}) {
  const safeEnvelope = sanitizeObject(envelope);
  const safeExtra = sanitizeObject(extra);
  const text = sanitizeObject(safeEnvelope.text);

  return {
    ok: true,
    blocked: false,
    reason: 'languagesphere-prepared-input-approved',
    finalAuthorityOwner: 'Marion',
    preparedInputText: sanitizeString(text.marionInputText),
    languageSphereEnvelope: safeEnvelope,
    diagnostics: {
      warnings: sanitizeArray(safeExtra.warnings),
      errors: sanitizeArray(safeExtra.errors)
    }
  };
}

function gateLanguageSphereForMarion(envelope = {}, options = {}) {
  const validation = validateLanguageSphereAuthority(envelope);

  if (!validation.ok) {
    return createBlockedFinalGateResult(validation.reason, envelope, {
      errors: [validation.reason]
    });
  }

  const safeEnvelope = sanitizeObject(envelope);
  const text = sanitizeObject(safeEnvelope.text);
  const preparedInputText = sanitizeString(text.marionInputText);

  if (options.requirePreparedInput !== false && !preparedInputText.trim()) {
    return createBlockedFinalGateResult('empty-prepared-input-blocked', envelope, {
      warnings: ['Prepared Marion input was empty.']
    });
  }

  return createPassedFinalGateResult(envelope);
}

function stripLanguageSphereFinalFields(envelope = {}) {
  const safeEnvelope = { ...sanitizeObject(envelope) };

  delete safeEnvelope.final;
  delete safeEnvelope.finalAnswer;
  delete safeEnvelope.visibleAnswer;

  if (safeEnvelope.response && typeof safeEnvelope.response === 'object') {
    safeEnvelope.response = { ...safeEnvelope.response };
    delete safeEnvelope.response.final;
    delete safeEnvelope.response.finalAnswer;
    delete safeEnvelope.response.visibleAnswer;
  }

  return safeEnvelope;
}

function assertMarionFinalAuthority(finalEnvelope = {}) {
  const safeFinal = sanitizeObject(finalEnvelope);

  if (!safeFinal || typeof safeFinal !== 'object') {
    return {
      ok: false,
      reason: 'missing-marion-final-envelope'
    };
  }

  const owner =
    safeFinal.finalAuthorityOwner ||
    safeFinal.authorityOwner ||
    safeFinal.authority?.finalAuthorityOwner ||
    safeFinal.authority?.owner ||
    '';

  const finalAuthority =
    safeFinal.finalAuthority ||
    safeFinal.authority?.finalAuthority ||
    false;

  if (owner && owner !== 'Marion') {
    return {
      ok: false,
      reason: 'non-marion-final-authority-owner',
      owner
    };
  }

  if (finalAuthority === 'LanguageSphere') {
    return {
      ok: false,
      reason: 'languagesphere-claimed-final-authority'
    };
  }

  return {
    ok: true,
    reason: 'marion-final-authority-intact',
    owner: owner || 'Marion'
  };
}

module.exports = {
  gateLanguageSphereForMarion,
  stripLanguageSphereFinalFields,
  assertMarionFinalAuthority,
  createBlockedFinalGateResult,
  createPassedFinalGateResult
};

'use strict';

/**
 * LanguageSphereAuthorityGuard
 * ------------------------------------------------------------
 * Hard authority protection for LanguageSphere.
 *
 * Purpose:
 * - Prevent LanguageSphere from becoming final responder.
 * - Prevent Marion bypass.
 * - Block malformed or unsafe LanguageSphere envelopes.
 * - Preserve Marion's final-authority contract.
 *
 * Rule:
 * LanguageSphere may prepare input and may optionally suggest adaptation
 * metadata later, but Marion remains final authority.
 */

const REQUIRED_FINAL_AUTHORITY_OWNER = 'Marion';

function sanitizeObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value;
}

function sanitizeArray(value) {
  return Array.isArray(value) ? value : [];
}

function createAuthorityViolation(reason, details = {}) {
  return {
    ok: false,
    reason,
    details: sanitizeObject(details),
    severity: 'critical',
    blocked: true
  };
}

function createAuthorityPass(details = {}) {
  return {
    ok: true,
    reason: 'authority-safe',
    details: sanitizeObject(details),
    severity: 'none',
    blocked: false
  };
}

function hasUnsafeFinalText(envelope) {
  const safeEnvelope = sanitizeObject(envelope);

  if (typeof safeEnvelope.final === 'string' && safeEnvelope.final.trim()) {
    return true;
  }

  if (typeof safeEnvelope.finalAnswer === 'string' && safeEnvelope.finalAnswer.trim()) {
    return true;
  }

  if (typeof safeEnvelope.visibleAnswer === 'string' && safeEnvelope.visibleAnswer.trim()) {
    return true;
  }

  if (
    safeEnvelope.response &&
    typeof safeEnvelope.response === 'object' &&
    typeof safeEnvelope.response.final === 'string' &&
    safeEnvelope.response.final.trim()
  ) {
    return true;
  }

  return false;
}

function validateLanguageSphereAuthority(envelope = {}) {
  const safeEnvelope = sanitizeObject(envelope);
  const authority = sanitizeObject(safeEnvelope.authority);

  if (!safeEnvelope.module || safeEnvelope.module !== 'LanguageSphere') {
    return createAuthorityViolation('invalid-or-missing-languagesphere-module', {
      module: safeEnvelope.module || null
    });
  }

  if (authority.finalAuthority !== false) {
    return createAuthorityViolation('languagesphere-final-authority-not-false', {
      finalAuthority: authority.finalAuthority
    });
  }

  if (authority.finalAuthorityOwner !== REQUIRED_FINAL_AUTHORITY_OWNER) {
    return createAuthorityViolation('invalid-final-authority-owner', {
      finalAuthorityOwner: authority.finalAuthorityOwner || null,
      requiredOwner: REQUIRED_FINAL_AUTHORITY_OWNER
    });
  }

  if (authority.mayBypassMarion !== false) {
    return createAuthorityViolation('marion-bypass-not-explicitly-blocked', {
      mayBypassMarion: authority.mayBypassMarion
    });
  }

  if (authority.mayPrepareInput !== true) {
    return createAuthorityViolation('languagesphere-input-preparation-not-enabled', {
      mayPrepareInput: authority.mayPrepareInput
    });
  }

  if (hasUnsafeFinalText(safeEnvelope)) {
    return createAuthorityViolation('languagesphere-attempted-final-visible-answer', {
      blockedFields: ['final', 'finalAnswer', 'visibleAnswer', 'response.final']
    });
  }

  return createAuthorityPass({
    module: safeEnvelope.module,
    finalAuthority: authority.finalAuthority,
    finalAuthorityOwner: authority.finalAuthorityOwner,
    mayBypassMarion: authority.mayBypassMarion
  });
}

function enforceLanguageSphereAuthority(envelope = {}) {
  const validation = validateLanguageSphereAuthority(envelope);

  if (!validation.ok) {
    const error = new Error(`LanguageSphere authority violation: ${validation.reason}`);
    error.code = 'LANGUAGESPHERE_AUTHORITY_VIOLATION';
    error.validation = validation;
    throw error;
  }

  return envelope;
}

function createSafeAuthorityMetadata(extra = {}) {
  const safeExtra = sanitizeObject(extra);

  return {
    finalAuthority: false,
    finalAuthorityOwner: REQUIRED_FINAL_AUTHORITY_OWNER,
    mayPrepareInput: true,
    mayAdaptOutput: false,
    mayBypassMarion: false,
    marionBypassBlocked: true,
    finalAnswerBlocked: true,
    ...safeExtra,
    finalAuthority: false,
    finalAuthorityOwner: REQUIRED_FINAL_AUTHORITY_OWNER,
    mayBypassMarion: false
  };
}

function appendAuthorityWarning(envelope = {}, warning) {
  const safeEnvelope = sanitizeObject(envelope);
  const diagnostics = sanitizeObject(safeEnvelope.diagnostics);

  return {
    ...safeEnvelope,
    diagnostics: {
      ...diagnostics,
      warnings: [
        ...sanitizeArray(diagnostics.warnings),
        warning || 'LanguageSphere authority warning.'
      ]
    }
  };
}

module.exports = {
  REQUIRED_FINAL_AUTHORITY_OWNER,
  validateLanguageSphereAuthority,
  enforceLanguageSphereAuthority,
  createSafeAuthorityMetadata,
  appendAuthorityWarning
};
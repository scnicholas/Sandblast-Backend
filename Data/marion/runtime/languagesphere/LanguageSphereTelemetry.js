'use strict';

/**
 * LanguageSphereTelemetry
 * ------------------------------------------------------------
 * Safe telemetry collector for LanguageSphere Phase 5.
 *
 * Purpose:
 * - Track runtime/middleware behavior.
 * - Avoid leaking secrets or raw internal stack traces.
 * - Provide compact operational diagnostics.
 *
 * Rule:
 * Telemetry is diagnostic metadata only.
 * Marion remains final authority.
 */

function sanitizeString(value, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

function sanitizeNumber(value, fallback = 0) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function sanitizeBoolean(value, fallback = false) {
  return typeof value === 'boolean' ? value : fallback;
}

function sanitizeObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value;
}

function sanitizeArray(value) {
  return Array.isArray(value) ? value : [];
}

function redactSecretLikeValue(value = '') {
  const text = sanitizeString(value);

  if (!text) return '';

  return text
    .replace(/sk-[A-Za-z0-9_-]{12,}/g, '[REDACTED_OPENAI_KEY]')
    .replace(/sbx_[A-Za-z0-9_-]{12,}/g, '[REDACTED_WIDGET_TOKEN]')
    .replace(/Bearer\s+[A-Za-z0-9._-]{12,}/gi, 'Bearer [REDACTED]')
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[REDACTED_EMAIL]');
}

function createTelemetryId(prefix = 'lst') {
  return `${prefix}_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 10)}`;
}

function countDomainTerms(envelope = {}) {
  const safeEnvelope = sanitizeObject(envelope);
  const domainTerminology = sanitizeObject(safeEnvelope.domainTerminology);
  const domainPolicy = sanitizeObject(safeEnvelope.domainTranslationPolicy);

  const detectedTerms = sanitizeArray(domainTerminology.detectedTerms);
  const decisions = sanitizeArray(domainPolicy.decisions);

  return {
    domainTermsDetected: detectedTerms.length,
    lockedTermsDetected: detectedTerms.filter((item) => item && item.preserveExact).length,
    conceptTermsDetected: detectedTerms.filter((item) => item && item.preserveConcept).length,
    carefulTermsDetected: detectedTerms.filter((item) => item && item.translateCarefully).length,
    policyDecisions: decisions.length,
    policyRiskLevel: sanitizeString(domainPolicy.riskLevel, 'none')
  };
}

function extractTonePrimary(envelope = {}) {
  const safeEnvelope = sanitizeObject(envelope);

  return (
    sanitizeString(safeEnvelope.tonePreservation?.tone?.primaryTone) ||
    sanitizeString(safeEnvelope.culturalAdaptation?.tonePreservation?.tone?.primaryTone) ||
    'unknown'
  );
}

function createLanguageSphereTelemetry(payload = {}) {
  const safePayload = sanitizeObject(payload);
  const envelope = sanitizeObject(safePayload.envelope);
  const fallbackDecision = sanitizeObject(safePayload.fallbackDecision);
  const requestPayload = sanitizeObject(safePayload.requestPayload);

  const language = sanitizeObject(envelope.language);
  const provider = sanitizeObject(envelope.provider);
  const diagnostics = sanitizeObject(envelope.diagnostics);

  const termCounts = countDomainTerms(envelope);

  const requestId =
    sanitizeString(requestPayload.requestId) ||
    sanitizeString(requestPayload.reqId) ||
    sanitizeString(safePayload.requestId) ||
    createTelemetryId('req');

  const sessionId =
    sanitizeString(requestPayload.sessionId) ||
    sanitizeString(requestPayload.session_id) ||
    sanitizeString(safePayload.sessionId) ||
    '';

  const inputSource =
    sanitizeString(requestPayload.inputSource) ||
    sanitizeString(requestPayload.source) ||
    sanitizeString(safePayload.inputSource, 'text');

  return {
    module: 'LanguageSphereTelemetry',
    status: 'ok',
    telemetryId: createTelemetryId(),
    requestId: redactSecretLikeValue(requestId),
    sessionId: redactSecretLikeValue(sessionId),
    inputSource: redactSecretLikeValue(inputSource),

    language: {
      sourceLanguage: sanitizeString(language.sourceLanguage, 'unknown'),
      targetLanguage: sanitizeString(language.targetLanguage, 'en'),
      confidence: sanitizeNumber(language.confidence, 0),
      translationRequired: sanitizeBoolean(language.translationRequired, false),
      translationApplied: sanitizeBoolean(language.translationApplied, false),
      fallbackApplied: sanitizeBoolean(language.fallbackApplied, false)
    },

    provider: {
      name: redactSecretLikeValue(sanitizeString(provider.name, 'none')),
      mode: redactSecretLikeValue(sanitizeString(provider.mode, 'none')),
      latencyMs: sanitizeNumber(provider.latencyMs, 0)
    },

    phase3: {
      tonePrimary: extractTonePrimary(envelope),
      toneAttached: Boolean(envelope.tonePreservation),
      culturalAdaptationAttached: Boolean(envelope.culturalAdaptation)
    },

    phase4: {
      domainTerminologyAttached: Boolean(envelope.domainTerminology),
      domainTranslationPolicyAttached: Boolean(envelope.domainTranslationPolicy),
      ...termCounts
    },

    fallback: {
      blocked: sanitizeBoolean(fallbackDecision.blocked, false),
      reason: sanitizeString(fallbackDecision.reason, ''),
      selectedSource: sanitizeString(fallbackDecision.selectedSource, ''),
      fallbackApplied: sanitizeBoolean(fallbackDecision.fallbackApplied, false),
      safeForMarion: sanitizeBoolean(fallbackDecision.safeForMarion, true)
    },

    diagnostics: {
      traceId: redactSecretLikeValue(sanitizeString(diagnostics.traceId, '')),
      warningsCount: sanitizeArray(diagnostics.warnings).length,
      errorsCount: sanitizeArray(diagnostics.errors).length,
      createdAt: new Date().toISOString()
    },

    safety: {
      debugLeakageBlocked: true,
      secretsRedacted: true,
      finalAnswerBlocked: true,
      authorityBypassBlocked: true
    },

    authority: {
      finalAuthority: false,
      finalAuthorityOwner: 'Marion',
      mayBypassMarion: false
    }
  };
}

function summarizeTelemetry(telemetry = {}) {
  const safeTelemetry = sanitizeObject(telemetry);

  return {
    requestId: sanitizeString(safeTelemetry.requestId),
    inputSource: sanitizeString(safeTelemetry.inputSource),
    sourceLanguage: sanitizeString(safeTelemetry.language?.sourceLanguage, 'unknown'),
    targetLanguage: sanitizeString(safeTelemetry.language?.targetLanguage, 'en'),
    translationApplied: sanitizeBoolean(safeTelemetry.language?.translationApplied, false),
    fallbackApplied: sanitizeBoolean(safeTelemetry.fallback?.fallbackApplied, false),
    blocked: sanitizeBoolean(safeTelemetry.fallback?.blocked, false),
    policyRiskLevel: sanitizeString(safeTelemetry.phase4?.policyRiskLevel, 'none'),
    tonePrimary: sanitizeString(safeTelemetry.phase3?.tonePrimary, 'unknown'),
    finalAuthorityOwner: 'Marion'
  };
}

module.exports = {
  createLanguageSphereTelemetry,
  summarizeTelemetry,
  redactSecretLikeValue,
  createTelemetryId,
  countDomainTerms,
  extractTonePrimary
};

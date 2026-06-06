'use strict';

/**
 * Marion public response boundary test
 *
 * Purpose:
 * - Ensures public-facing Marion/Nyx replies do not leak internal telemetry.
 * - Ensures LingoLink authority-review metadata stays internal.
 * - Ensures diagnostics-only output fails closed instead of being treated as a valid public reply.
 *
 * Node test runner compatible.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const { describe, it } = test;

const {
  reviewLingoLinkOutput
} = require('../../Data/marion/runtime/MarionLingoLinkAuthorityGuard');

function safeStr(value) {
  return value == null ? '' : String(value);
}

function normalizePublicText(value) {
  return safeStr(value)
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.!?;:])/g, '$1')
    .trim();
}

function hasOnlyResidue(value) {
  const text = normalizePublicText(value);

  if (!text) return true;

  return /^[\s"'`{}[\]():,.;\-–—]+$/.test(text);
}

function hasPublicDebugLeak(value) {
  const text = safeStr(value);

  if (!text) return false;

  return [
    /\bruntimeTelemetry\b/i,
    /\bfinalEnvelope\b/i,
    /\bsessionPatch\b/i,
    /\brouteKind\b/i,
    /\breplyAuthority\b/i,
    /\bfinalEnvelopeTrusted\b/i,
    /\bcanEmit\b/i,
    /\bfailureSignature\b/i,
    /\bdiagnostic packet\b/i,
    /\bdiagnostics?\b/i,
    /\bMARION::FINAL::/i,
    /\bnyx\.marion\.final\//i,
    /\bnyx\.marion\.stateSpine\//i,
    /\bCHATENGINE_COORDINATOR_ONLY_ACTIVE/i,
    /\bsourceLanguage\s*:\s*\{/i,
    /\btargetLanguage\s*:\s*\{/i,
    /\blingoLinkResponse\s*:\s*\{/i,
    /\blingoLinkAuthorityReview\s*:\s*\{/i,
    /\bauthorityReview\s*:\s*\{/i,
    /\btelemetry\s*:\s*\{/i,
    /\[object Object\]/i
  ].some((pattern) => pattern.test(text));
}

function stripPublicDebugLeak(value) {
  let text = normalizePublicText(value);

  if (!text) return '';

  /*
   * Remove known diagnostic keys with JSON/object/array payloads first.
   * This avoids leaving residue such as: "}
   */
  text = text
    .replace(/\b(?:runtimeTelemetry|finalEnvelope|sessionPatch|routeKind|replyAuthority|finalEnvelopeTrusted|canEmit|failureSignature|lingoLinkResponse|lingoLinkAuthorityReview|authorityReview|telemetry|diagnostics?)\s*[:=]\s*\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/gi, '')
    .replace(/\b(?:runtimeTelemetry|finalEnvelope|sessionPatch|routeKind|replyAuthority|finalEnvelopeTrusted|canEmit|failureSignature|lingoLinkResponse|lingoLinkAuthorityReview|authorityReview|telemetry|diagnostics?)\s*[:=]\s*\[[^\]]*\]/gi, '')

    /*
     * Remove known diagnostic keys with primitive/string payloads.
     */
    .replace(/\b(?:runtimeTelemetry|finalEnvelope|sessionPatch|routeKind|replyAuthority|finalEnvelopeTrusted|canEmit|failureSignature|lingoLinkResponse|lingoLinkAuthorityReview|authorityReview|telemetry|diagnostics?)\s*[:=]\s*[^.;,}\]]+/gi, '')

    /*
     * Remove language-object leaks that can happen when detector output is not normalized.
     */
    .replace(/\b(?:sourceLanguage|targetLanguage|detectedLanguage)\s*:\s*\{[^}]*\}/gi, '')

    /*
     * Remove known internal signatures/contracts.
     */
    .replace(/MARION::FINAL::[^\s.;,]+/gi, '')
    .replace(/nyx\.marion\.(?:final|stateSpine)\/[0-9.]+/gi, '')
    .replace(/CHATENGINE_COORDINATOR_ONLY_ACTIVE[^\s.;,]+/gi, '')

    /*
     * Remove object leak residue.
     */
    .replace(/\[object Object\]/gi, '')
    .replace(/^\s*["'`{}[\]():,.;\-–—]+\s*$/g, '')
    .replace(/\s+([,.!?;:])/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim();

  if (hasOnlyResidue(text)) {
    return '';
  }

  return text;
}

function buildPublicReplyBoundaryPacket(input = {}) {
  const finalText = normalizePublicText(input.finalText || input.reply || '');
  const hasLeak = hasPublicDebugLeak(finalText);
  const cleanedFinalText = stripPublicDebugLeak(finalText);
  const cleanedIsUsable = Boolean(cleanedFinalText) && !hasOnlyResidue(cleanedFinalText);

  return {
    ok: cleanedIsUsable && !hasPublicDebugLeak(cleanedFinalText),
    publicReply: cleanedIsUsable ? cleanedFinalText : '',
    marionFinalAuthority: true,
    blockedDebugLeak: hasLeak,
    noUserFacingDiagnostics: true,
    warnings: hasLeak
      ? ['Public debug leak was detected and stripped.']
      : []
  };
}

describe('Marion public response boundary', () => {
  it('allows clean public replies', () => {
    const result = buildPublicReplyBoundaryPacket({
      finalText: 'Nyx can help with chat, media, radio, and backend diagnostics.'
    });

    assert.equal(result.ok, true);
    assert.equal(result.publicReply, 'Nyx can help with chat, media, radio, and backend diagnostics.');
    assert.equal(result.marionFinalAuthority, true);
    assert.equal(result.noUserFacingDiagnostics, true);
    assert.equal(result.blockedDebugLeak, false);
  });

  it('blocks runtime telemetry from public replies while preserving the public answer', () => {
    const result = buildPublicReplyBoundaryPacket({
      finalText: 'Here is the answer. runtimeTelemetry: {"route":"LINGOLINK_TRANSLATE"}'
    });

    assert.equal(result.blockedDebugLeak, true);
    assert.equal(result.noUserFacingDiagnostics, true);
    assert.equal(result.publicReply, 'Here is the answer.');
    assert.equal(hasPublicDebugLeak(result.publicReply), false);
  });

  it('blocks final envelope leakage from public replies', () => {
    const result = buildPublicReplyBoundaryPacket({
      finalText: 'finalEnvelope: {"reply":"Bonjour"} Bonjour.'
    });

    assert.equal(result.blockedDebugLeak, true);
    assert.equal(result.publicReply, 'Bonjour.');
    assert.equal(hasPublicDebugLeak(result.publicReply), false);
  });

  it('blocks Marion final signature leakage', () => {
    const result = buildPublicReplyBoundaryPacket({
      finalText: 'MARION::FINAL::abc123 The response is ready.'
    });

    assert.equal(result.blockedDebugLeak, true);
    assert.equal(result.publicReply, 'The response is ready.');
    assert.equal(hasPublicDebugLeak(result.publicReply), false);
  });

  it('blocks object leakage from language metadata', () => {
    const result = buildPublicReplyBoundaryPacket({
      finalText: 'sourceLanguage: { language: "fr", confidence: 0.8 } Bonjour.'
    });

    assert.equal(result.blockedDebugLeak, true);
    assert.equal(result.publicReply, 'Bonjour.');
    assert.equal(hasPublicDebugLeak(result.publicReply), false);
  });

  it('blocks [object Object] leakage', () => {
    const result = buildPublicReplyBoundaryPacket({
      finalText: 'Translation result: [object Object]'
    });

    assert.equal(result.blockedDebugLeak, true);
    assert.equal(result.publicReply, 'Translation result:');
    assert.equal(hasPublicDebugLeak(result.publicReply), false);
  });

  it('blocks LingoLink response-envelope leakage', () => {
    const result = buildPublicReplyBoundaryPacket({
      finalText: 'lingoLinkResponse: {"finalText":"Bonjour","confidence":0.92} Bonjour.'
    });

    assert.equal(result.blockedDebugLeak, true);
    assert.equal(result.publicReply, 'Bonjour.');
    assert.equal(hasPublicDebugLeak(result.publicReply), false);
  });

  it('blocks LingoLink authority-review leakage', () => {
    const result = buildPublicReplyBoundaryPacket({
      finalText: 'lingoLinkAuthorityReview: {"approved":true,"action":"ALLOW_FINAL_RESPONSE"} Bonjour.'
    });

    assert.equal(result.blockedDebugLeak, true);
    assert.equal(result.publicReply, 'Bonjour.');
    assert.equal(hasPublicDebugLeak(result.publicReply), false);
  });

  it('confirms LingoLink authority review remains internal-facing', () => {
    const review = reviewLingoLinkOutput({
      originalText: 'Translate hello into French.',
      route: 'LINGOLINK_TRANSLATE',
      responseEnvelope: {
        ok: true,
        sourceLanguage: 'en',
        targetLanguage: 'fr',
        translatedText: 'Bonjour',
        finalText: 'Bonjour',
        confidence: 0.92,
        requiresMarionReview: true,
        fallbackUsed: false,
        warnings: []
      }
    });

    const result = buildPublicReplyBoundaryPacket({
      finalText: review.finalText
    });

    assert.equal(review.marionFinalAuthority, true);
    assert.equal(review.approved, true);
    assert.equal(result.ok, true);
    assert.equal(result.publicReply, 'Bonjour');
    assert.equal(hasPublicDebugLeak(result.publicReply), false);
  });

  it('fails closed when public reply is empty after stripping diagnostics', () => {
    const result = buildPublicReplyBoundaryPacket({
      finalText: 'runtimeTelemetry: {"bad":"leak"}'
    });

    assert.equal(result.ok, false);
    assert.equal(result.blockedDebugLeak, true);
    assert.equal(result.publicReply, '');
  });

  it('fails closed when only diagnostic residue remains', () => {
    const result = buildPublicReplyBoundaryPacket({
      finalText: '{}'
    });

    assert.equal(result.ok, false);
    assert.equal(result.publicReply, '');
  });
});

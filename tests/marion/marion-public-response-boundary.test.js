'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { describe, it } = test;

const {
  reviewLingoLinkOutput
} = require('../../Data/marion/runtime/MarionLingoLinkAuthorityGuard');

function safeStr(value) {
  return value == null ? '' : String(value);
}

function hasPublicDebugLeak(value) {
  const text = safeStr(value);

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
    /\bMARION::FINAL::/i,
    /\bnyx\.marion\.final\//i,
    /\bnyx\.marion\.stateSpine\//i,
    /\bCHATENGINE_COORDINATOR_ONLY_ACTIVE/i,
    /\bsourceLanguage:\s*\{/i,
    /\btargetLanguage:\s*\{/i,
    /\[object Object\]/i
  ].some((pattern) => pattern.test(text));
}

function stripPublicDebugLeak(value) {
  let text = safeStr(value).replace(/\s+/g, ' ').trim();

  if (!text) return '';

  text = text
    .replace(/\b(?:runtimeTelemetry|finalEnvelope|sessionPatch|routeKind|replyAuthority|finalEnvelopeTrusted|canEmit|failureSignature)\s*[:=]\s*[^.;,}\]]+/gi, '')
    .replace(/MARION::FINAL::[^\s.;,]+/gi, '')
    .replace(/nyx\.marion\.(?:final|stateSpine)\/[0-9.]+/gi, '')
    .replace(/CHATENGINE_COORDINATOR_ONLY_ACTIVE[^\s.;,]+/gi, '')
    .replace(/\[object Object\]/gi, '')
    .replace(/\s+([,.!?;:])/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim();

  return text;
}

function buildPublicReplyBoundaryPacket(input = {}) {
  const finalText = safeStr(input.finalText || input.reply || '').trim();
  const cleanedFinalText = stripPublicDebugLeak(finalText);

  return {
    ok: Boolean(cleanedFinalText) && !hasPublicDebugLeak(cleanedFinalText),
    publicReply: cleanedFinalText,
    marionFinalAuthority: true,
    blockedDebugLeak: hasPublicDebugLeak(finalText),
    noUserFacingDiagnostics: true,
    warnings: hasPublicDebugLeak(finalText)
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

  it('blocks runtime telemetry from public replies', () => {
    const result = buildPublicReplyBoundaryPacket({
      finalText: 'Here is the answer. runtimeTelemetry: {"route":"LINGOLINK_TRANSLATE"}'
    });

    assert.equal(result.blockedDebugLeak, true);
    assert.equal(result.noUserFacingDiagnostics, true);
    assert.equal(hasPublicDebugLeak(result.publicReply), false);
  });

  it('blocks final envelope leakage from public replies', () => {
    const result = buildPublicReplyBoundaryPacket({
      finalText: 'finalEnvelope: {"reply":"Bonjour"} Bonjour.'
    });

    assert.equal(result.blockedDebugLeak, true);
    assert.equal(hasPublicDebugLeak(result.publicReply), false);
  });

  it('blocks Marion final signature leakage', () => {
    const result = buildPublicReplyBoundaryPacket({
      finalText: 'MARION::FINAL::abc123 The response is ready.'
    });

    assert.equal(result.blockedDebugLeak, true);
    assert.equal(hasPublicDebugLeak(result.publicReply), false);
  });

  it('blocks object leakage from language metadata', () => {
    const result = buildPublicReplyBoundaryPacket({
      finalText: 'sourceLanguage: { language: "fr", confidence: 0.8 } Bonjour.'
    });

    assert.equal(result.blockedDebugLeak, true);
    assert.equal(hasPublicDebugLeak(result.publicReply), false);
  });

  it('blocks [object Object] leakage', () => {
    const result = buildPublicReplyBoundaryPacket({
      finalText: 'Translation result: [object Object]'
    });

    assert.equal(result.blockedDebugLeak, true);
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
});

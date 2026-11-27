'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const Module = require('node:module');

const root = path.resolve(__dirname, '..');
const gatewayPath = path.join(root, 'Data/marion/runtime/MarionVoiceGateway.js');
const adapterPath = path.join(root, 'Utils/nyxOpenAI.js');
const bridgePath = path.join(root, 'Data/marion/runtime/marionBridge.js');
const indexPath = path.join(root, 'index.js');
const finalEnvelope = require(path.join(root, 'Data/marion/runtime/marionFinalEnvelope.js'));
const loopGuard = require(path.join(root, 'Data/marion/runtime/marionLoopGuard.js'));

const requiredStubs = {
  './MarionVoiceInputEnvelope': { createVoiceInputEnvelope: () => ({}) },
  './MarionVoiceAuthorizationGate': { applyVoiceAuthorization: () => ({}) },
  './MarionVoiceTranscriptNormalizer': { applyTranscriptNormalization: () => ({}) },
  './MarionVoiceOutputPolicy': { applyVoiceOutputPolicy: () => ({}) },
  './MarionVoiceTelemetry': { createVoiceTelemetryEvent: () => ({}) },
};
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (parent && parent.filename === gatewayPath && Object.prototype.hasOwnProperty.call(requiredStubs, request)) {
    return requiredStubs[request];
  }
  return originalLoad.call(this, request, parent, isMain);
};
let gateway;
try {
  gateway = require(gatewayPath);
} finally {
  // Always restore Node's module loader, including when gateway import throws.
  Module._load = originalLoad;
}
const adapter = require(adapterPath);

// Failures below must retain their positive signed-final expectations. Diagnostic
// output contains only status/validation codes and never reply text or credentials.
function booleanOrMissing(value) {
  return typeof value === 'boolean' ? value : 'missing';
}
function codesOnly(value) {
  if (!Array.isArray(value)) return [];
  return value.filter((entry) => typeof entry === 'string' && /^[a-zA-Z0-9_.:-]{1,100}$/.test(entry)).slice(0, 12);
}
function authoritySnapshot(packet) {
  const p = packet && typeof packet === 'object' ? packet : {};
  const f = p.finalEnvelope && typeof p.finalEnvelope === 'object' ? p.finalEnvelope : {};
  const completion = f.completionStatus && typeof f.completionStatus === 'object' ? f.completionStatus : {};
  const trust = f.adaptiveTrustVerification && typeof f.adaptiveTrustVerification === 'object' ? f.adaptiveTrustVerification : {};
  const validation = f.validation && typeof f.validation === 'object' ? f.validation : {};
  const reason = typeof p.error === 'string' && /^[A-Z0-9_]{1,100}$/.test(p.error) ? p.error : 'none';
  const reply = typeof f.reply === 'string' ? f.reply : '';
  return {
    ok: booleanOrMissing(p.ok), final: booleanOrMissing(p.final),
    marionFinal: booleanOrMissing(p.marionFinal), canEmit: booleanOrMissing(p.canEmit),
    requiresRetry: booleanOrMissing(p.requiresRetry), errorCode: reason,
    envelopePresent: !!p.finalEnvelope, envelopeFinal: booleanOrMissing(f.final),
    envelopeMarionFinal: booleanOrMissing(f.marionFinal),
    currentTurnBound: booleanOrMissing(f.currentTurnBound),
    semanticAuthorityMarion: f.semanticAuthority === 'marion',
    signaturePresent: typeof f.signature === 'string' && f.signature.length > 0,
    replyHashMatches: !!reply && f.replySignature === replyHash(reply),
    completionComplete: booleanOrMissing(completion.complete),
    trustAllowsEmit: booleanOrMissing(trust.allowEmit),
    replyValidationReasons: codesOnly(validation.finalReply && validation.finalReply.reasons),
    contractValidationReasons: codesOnly(validation.replyContract && validation.replyContract.reasons),
    // Sanitized stage codes, never raw replies, session IDs, or credentials.
    bridgeFailureStage: safeDiagnosticCode(p.diagnostics && p.diagnostics.authorityFailureStage),
    bridgeFailureCodes: codesOnly(p.diagnostics && p.diagnostics.authorityFailureCodes),
    finalBuilderFailureReason: safeDiagnosticCode(p.diagnostics && p.diagnostics.finalBuilderFailureReason),
    finalBuilderStatus: (() => {
      const status = p.diagnostics && p.diagnostics.finalBuilderAuthoritySnapshot;
      const item = status && typeof status === "object" && !Array.isArray(status) ? status : {};
      return {
        ok: booleanOrMissing(item.ok),
        envelopeFinal: booleanOrMissing(item.envelopeFinal),
        currentTurnBound: booleanOrMissing(item.currentTurnBound),
        signaturePresent: booleanOrMissing(item.signaturePresent),
        completionComplete: booleanOrMissing(item.completionComplete),
        trustAllowsEmit: booleanOrMissing(item.trustAllowsEmit),
        contractReasons: codesOnly(item.contractReasons)
      };
    })(),
    // Source-level rejection provenance without logging private prompt/reply,
    // principal, token, turn ID or signature. The envelope's own validator is
    // observed, never used to repair or promote an uncertified result.
    terminalReason: safeDiagnosticCode(p.diagnostics && p.diagnostics.finalAuthorityTerminalReason),
    envelopeTerminalReason: safeDiagnosticCode(f.diagnostics && f.diagnostics.finalAuthorityTerminalReason),
    envelopeSafetyReason: safeDiagnosticCode(p.diagnostics && p.diagnostics.finalEnvelopeSafetyTerminalReason),
    envelopeContractReasons: codesOnly(f.validation && f.validation.replyContract && f.validation.replyContract.reasons),
    completionReason: safeDiagnosticCode(completion.reason),
    trustReasons: codesOnly(trust.reasons),
    turnIdPresent: typeof f.meta?.turnId === 'string' && f.meta.turnId.length > 0,
    turnIdConsistent: !!(f.meta && typeof f.meta.turnId === 'string' &&
      f.meta.turnId.length > 0 && p.meta && p.meta.turnId === f.meta.turnId),
  };
}
// Test-only adapter: captures exactly the raw Bridge return at the Gateway handoff.
// No runtime source is patched and no private reply, principal, session ID or token is logged.
function traceBridgeAuthority(bridge, onPacket) {
  if (!bridge || typeof bridge.handleMarionAdminConversation !== 'function') {
    throw new TypeError('Marion bridge must provide handleMarionAdminConversation');
  }
  if (typeof onPacket !== 'function') {
    throw new TypeError('Marion trace callback must be a function');
  }
  let calls = 0;
  // Prototype delegation preserves other bridge functions without copying mutable exports.
  const traced = Object.create(bridge);
  Object.defineProperty(traced, 'handleMarionAdminConversation', {
    configurable: true,
    enumerable: true,
    async value(...args) {
      calls += 1;
      try {
        const raw = await bridge.handleMarionAdminConversation.apply(bridge, args);
        // Observability is best-effort: a broken trace sink must not change
        // whether the production delegate's packet succeeds or fails.
        try { onPacket({ calls, status: 'returned', snapshot: authoritySnapshot(raw) }); } catch (_) {}
        return raw;
      } catch (error) {
        // Never include an exception message or stack; either may contain private content.
        try { onPacket({ calls, status: 'threw', errorName: safeDiagnosticCode(error && error.name) }); } catch (_) {}
        throw error;
      }
    },
  });
  return { bridge: traced, getCalls: () => calls };
}

function safeDiagnosticCode(value) {
  return typeof value === 'string' && /^[a-zA-Z0-9_.:-]{1,64}$/.test(value) ? value : 'unknown';
}

function emitAuthorityTrace(label, value) {
  // Only whitelisted and bounded diagnostic fields created above are emitted.
  process.stderr.write(`[MARION TEST] ${label} ${JSON.stringify(value)}\n`);
}

function assertCertified(condition, packet, context) {
  if (condition) return;
  assert.fail(`${context}: ${JSON.stringify(authoritySnapshot(packet))}`);
}

// Diagnostic snapshots never include private text, tokens, or full response objects.
// These traces help distinguish a bridge-selection failure from a downstream rewrite.
function responseFingerprint(value) {
  return replyHash(typeof value === 'string' ? value : '');
}

function reportProvenanceMismatch(testName, expectedReply, rawPacket, receivedReply, invocationCount) {
  const raw = rawPacket && typeof rawPacket === 'object' ? rawPacket : {};
  const received = receivedReply && typeof receivedReply === 'object' ? receivedReply : {};
  const expected = responseFingerprint(expectedReply);
  const bridgeReply = responseFingerprint(raw.reply);
  const gatewayReply = responseFingerprint(received.reply);
  if (received.reply === expectedReply) return;
  const publicIdentity = /^i[\u2019']?m nyx, the public sandblast assistant\b/i.test(String(received.reply || ''));
  const changedAfterBridge = raw.reply === expectedReply && received.reply !== expectedReply;
  const trace = {
    test: testName,
    injectedHandlerCalls: invocationCount,
    expectedReplyHash: expected,
    rawBridgeReplyHash: bridgeReply,
    gatewayReplyHash: gatewayReply,
    rawBridgeFinal: raw.final === true,
    rawBridgeMarionFinal: raw.marionFinal === true,
    gatewayOk: received.ok === true,
    gatewayFinal: received.final === true,
    gatewayMarionFinal: received.marionFinal === true,
    publicNyxIntroductionDetected: publicIdentity,
    downstreamReplyChanged: changedAfterBridge,
    gatewayModule: path.relative(root, gatewayPath),
  };
  // Diagnostic events use synthetic fixture replies only. No request or admin credentials.
  process.stderr.write(`[MARION TEST] PROVENANCE_MISMATCH ${JSON.stringify(trace)}\n`);
}

function assertBridgeProvenance(testName, expectedReply, bridgePacket, gatewayPacket, calls) {
  assert.equal(calls, 1, `${testName}: injected bridge handler must run exactly once`);
  assert.equal(bridgePacket && bridgePacket.reply, expectedReply,
    `${testName}: the injected handler must produce the expected synthetic reply`);
  reportProvenanceMismatch(testName, expectedReply, bridgePacket, gatewayPacket, calls);
  assert.equal(gatewayPacket && gatewayPacket.reply, expectedReply,
    `${testName}: gateway must preserve the injected bridge's signed reply`);
}

function replyHash(value) {
  const source = String(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  let hash = 0;
  for (let i = 0; i < source.length; i += 1) {
    hash = ((hash << 5) - hash) + source.charCodeAt(i);
    hash |= 0;
  }
  return String(hash >>> 0);
}

// Synthetic legacy compatibility fixture, NOT an authentication proof or a
// cryptographic signature. Real private finance coverage uses the live Bridge.
function signedMarionFinal(reply) {
  const signature = replyHash(reply);
  const aliases = {
    authoritativeReply: reply,
    reply,
    text: reply,
    message: reply,
    displayReply: reply,
    visibleReply: reply,
    finalReply: reply,
    answer: reply,
    output: reply,
    response: reply,
    spokenText: reply,
  };
  const finalEnvelope = {
    ...aliases,
    final: true,
    marionFinal: true,
    canEmit: true,
    currentTurnBound: true,
    semanticAuthority: 'marion',
    signature: 'MARION_FINAL_AUTHORITY',
    replySignature: signature,
  };
  return {
    ...aliases,
    ok: true,
    final: true,
    marionFinal: true,
    canEmit: true,
    currentTurnBound: true,
    semanticAuthority: 'marion',
    replySignature: signature,
    payload: { ...aliases, final: true, marionFinal: true, canEmit: true },
    finalEnvelope,
  };
}

function signedComposerMarionFinal(reply) {
  const intent = 'simple_chat';
  const domain = 'general';
  const turnId = 'composer-turn-17';
  const signature = `MARION::FINAL::nyx.marion.stateSpine/1.7::CHATENGINE_COORDINATOR_ONLY_ACTIVE_2026_04_24::${replyHash([reply, intent, domain, turnId].join('|'))}`;
  const aliases = {
    authoritativeReply: reply,
    reply,
    text: reply,
    message: reply,
    displayReply: reply,
    visibleReply: reply,
    finalReply: reply,
  };
  const finalEnvelope = {
    ...aliases,
    final: true,
    marionFinal: true,
    canEmit: true,
    currentTurnBound: true,
    semanticAuthority: 'marion',
    authority: 'marionFinalEnvelope',
    contractVersion: 'nyx.marion.final/1.0',
    signature,
    marionFinalSignature: signature,
    requiredSignature: 'CHATENGINE_COORDINATOR_ONLY_ACTIVE_2026_04_24',
    replySignature: replyHash(reply),
    intent,
    domain,
    turnId,
  };
  return {
    ...aliases,
    ok: true,
    final: true,
    marionFinal: true,
    canEmit: true,
    currentTurnBound: true,
    semanticAuthority: 'marion',
    replySignature: replyHash(reply),
    payload: { ...aliases, final: true, marionFinal: true, canEmit: true },
    finalEnvelope,
  };
}

function serverOptions(bridge, extra = {}) {
  return {
    // Test-only representation of a principal verified by server middleware.
    // Production must construct this from authenticated server context, never input text.
    serverVerifiedAuth: {
      verified: true,
      sessionVerified: true,
      verifiedBy: 'server_middleware',
      sessionId: 'operator-session-7',
      role: 'admin',
    },
    adminVerified: true,
    serverSideAdminAuth: true,
    trustedServerAuth: true,
    sessionVerified: true,
    sessionId: 'operator-session-7',
    partitionKey: 'private:admin:operator-session-7',
    memoryPartition: 'private:admin:operator-session-7',
    bridge,
    ...extra,
  };
}

test('raw Bridge tracing preserves call context, packet identity and sanitized fields', async () => {
  const reply = 'Synthetic fixture reply for tracing.';
  const raw = signedMarionFinal(reply);
  raw.error = 'TEST_ONLY';
  raw.token = 'must-not-log';
  raw.sessionId = 'must-not-log';
  const events = [];
  const originalBridge = {
    marker: 42,
    async handleMarionAdminConversation(input, options) {
      assert.equal(this, originalBridge);
      assert.equal(input.id, 'test-input');
      assert.equal(options.flag, true);
      return raw;
    },
  };
  const trace = traceBridgeAuthority(originalBridge, (event) => events.push(event));
  assert.equal(trace.bridge.marker, 42);
  assert.equal(await trace.bridge.handleMarionAdminConversation({ id: 'test-input' }, { flag: true }), raw);
  assert.equal(trace.getCalls(), 1);
  assert.equal(events[0].status, 'returned');
  assert.equal(events[0].snapshot.marionFinal, true);
  const emitted = JSON.stringify(events[0]);
  assert.equal(emitted.includes(reply), false);
  assert.equal(emitted.includes('must-not-log'), false);
  assert.equal(emitted.includes('sessionId'), false);
});

test('authority snapshots report sanitized upstream failure codes without leaking private context', () => {
  const packet = {
    ok: false, final: false, reply: 'PRIVATE REPLY MUST NOT APPEAR',
    sessionId: 'PRIVATE-SESSION', token: 'PRIVATE-TOKEN',
    diagnostics: { authorityFailureStage: 'final_envelope_invalid',
      authorityFailureCodes: ['composer_final_missing'],
      finalBuilderFailureReason: 'missing_or_rejected_final',
      finalBuilderAuthoritySnapshot: {ok:false,envelopeFinal:false,currentTurnBound:false,signaturePresent:false,completionComplete:false,trustAllowsEmit:false,contractReasons:['reply_signature_missing'],privatePrompt:'PRIVATE PROMPT MUST NOT APPEAR'},
      finalAuthorityTerminalReason: 'explicit_upstream_denial',
      privateUserText: 'PRIVATE PROMPT MUST NOT APPEAR' },
    finalEnvelope: { final: false, meta: { turnId: 'PRIVATE-TURN' },
      completionStatus: { complete: false, reason: 'reply_not_actionable' },
      adaptiveTrustVerification: { allowEmit: false,
        reasons: ['soft_recovery_reply'] },
      validation: { replyContract: { reasons: ['completion_or_trust_blocked'] } } }
  };
  const report = authoritySnapshot(packet);
  assert.equal(report.bridgeFailureStage, 'final_envelope_invalid');
  assert.deepEqual(report.bridgeFailureCodes, ['composer_final_missing']);
  assert.equal(report.finalBuilderFailureReason, 'missing_or_rejected_final');
  assert.equal(report.finalBuilderStatus.signaturePresent, false);
  assert.deepEqual(report.finalBuilderStatus.contractReasons, ['reply_signature_missing']);
  assert.equal(report.terminalReason, 'explicit_upstream_denial');
  assert.equal(report.completionReason, 'reply_not_actionable');
  assert.deepEqual(report.trustReasons, ['soft_recovery_reply']);
  assert.deepEqual(report.envelopeContractReasons, ['completion_or_trust_blocked']);
  const serialized = JSON.stringify(report);
  for (const secret of ['PRIVATE REPLY', 'PRIVATE-SESSION', 'PRIVATE-TOKEN',
    'PRIVATE PROMPT', 'PRIVATE-TURN']) assert.equal(serialized.includes(secret), false);
});

test('raw Bridge tracing preserves rejection and propagates exceptions without exposing messages', async () => {
  const events = [];
  const error = new Error('sensitive-message-must-not-log');
  const traced = traceBridgeAuthority({
    async handleMarionAdminConversation() { throw error; },
  }, (event) => events.push(event));
  await assert.rejects(() => traced.bridge.handleMarionAdminConversation({}), (caught) => caught === error);
  assert.equal(traced.getCalls(), 1);
  assert.equal(events[0].status, 'threw');
  assert.equal(JSON.stringify(events[0]).includes('sensitive-message-must-not-log'), false);
});

test('trace observer failures never override the Bridge result or its original exception', async () => {
  const synthetic = signedMarionFinal('Synthetic trace observer test response.');
  const trace = traceBridgeAuthority({
    async handleMarionAdminConversation() { return synthetic; },
  }, () => { throw new Error('trace sink unavailable'); });
  assert.equal(await trace.bridge.handleMarionAdminConversation({}), synthetic);
  assert.equal(trace.getCalls(), 1);

  const originalError = new Error('private detail must remain private');
  const failingTrace = traceBridgeAuthority({
    async handleMarionAdminConversation() { throw originalError; },
  }, () => { throw new Error('trace sink unavailable'); });
  await assert.rejects(() => failingTrace.bridge.handleMarionAdminConversation({}),
    (err) => err === originalError);
  assert.equal(failingTrace.getCalls(), 1);
});

test('private text rejects client-supplied admin claims without server authorization', async () => {
  let calls = 0;
  const bridge = { handleMarionAdminConversation() { calls += 1; return signedMarionFinal('secret reply'); } };
  const out = await gateway.handleMarionAdminConversation({
    text: 'read the private status',
    adminVerified: true,
    authenticatedOperator: true,
    // A client-supplied principal must never satisfy a server-only identity check.
    serverVerifiedAuth: {
      verified: true,
      sessionVerified: true,
      verifiedBy: 'server_middleware',
      sessionId: 'forged-client-session',
      role: 'admin',
    },
    privateRuntimeContext: { version: 'client-controlled' },
  }, { bridge });

  assert.equal(calls, 0);
  assert.equal(out.ok, false);
  assert.equal(out.final, false);
  assert.equal(out.marionFinal, false);
  assert.equal(out.reply, '');
  assert.equal(out.error, 'MARION_ADMIN_AUTH_REQUIRED');
});

test('trusted flags cannot substitute for a server-verified principal', async () => {
  let calls = 0;
  const bridge = {
    handleMarionAdminConversation() {
      calls += 1;
      return signedMarionFinal('must not be emitted');
    },
  };
  const options = serverOptions(bridge, { serverVerifiedAuth: undefined });
  const out = await gateway.handleMarionAdminConversation({ text: 'private status' }, options);

  assert.equal(calls, 0);
  assert.equal(out.ok, false);
  assert.equal(out.error, 'MARION_ADMIN_AUTH_REQUIRED');
  assert.equal(out.canEmit, false);
});

test('a server-verified principal with an unauthorized role is denied', async () => {
  let calls = 0;
  const bridge = {
    handleMarionAdminConversation() {
      calls += 1;
      return signedMarionFinal('must not be emitted');
    },
  };
  const options = serverOptions(bridge, {
    serverVerifiedAuth: {
      verified: true,
      sessionVerified: true,
      verifiedBy: 'server_middleware',
      sessionId: 'operator-session-7',
      role: 'remote_trusted_user',
    },
  });
  const out = await gateway.handleMarionAdminConversation({ text: 'private status' }, options);

  assert.equal(calls, 0);
  assert.equal(out.ok, false);
  assert.equal(out.error, 'MARION_ADMIN_AUTH_REQUIRED');
  assert.equal(out.canEmit, false);
});

test('adminVoiceDeliveryAllowed alone is not an authentication proof', async () => {
  const out = await gateway.handleMarionAdminConversation({ text: 'status' }, { adminVoiceDeliveryAllowed: true });
  assert.equal(out.error, 'MARION_ADMIN_AUTH_REQUIRED');
  assert.equal(out.marionFinal, false);
});

test('text bridge calls one canonical handler and preserves a signed current-turn final', async () => {
  let calls = 0;
  let received;
  let bridgePacket;
  const reply = 'The current Marion response is authorized and complete.';
  const bridge = {
    async handleMarionAdminConversation(input, context) {
      calls += 1;
      received = { input, context };
      bridgePacket = signedMarionFinal(reply);
      return bridgePacket;
    },
    async handleAdminConversation() { calls += 1; return signedMarionFinal('duplicate'); },
    async processWithMarion() { calls += 1; return signedMarionFinal('duplicate'); },
  };
  const out = await gateway.handleMarionAdminConversation({
    text: 'summarize the current status',
    adminVerified: false,
    authenticatedOperator: false,
    privateRuntimeContext: { version: 'untrusted' },
    authorization: { token: 'should-not-cross-the-bridge' },
    token: 'should-not-cross-the-bridge',
  }, serverOptions(bridge));

  assert.equal(calls, 1);
  assertBridgeProvenance('canonical handler', reply, bridgePacket, out, calls);
  assert.equal(out.ok, true);
  assert.equal(out.final, true);
  assert.equal(out.marionFinal, true);
  assert.equal(out.finalEnvelope.replySignature, replyHash(reply));
  assert.equal(out.finalEnvelope.signature, 'MARION_FINAL_AUTHORITY');
  assert.equal(received.input.adminVerified, true);
  assert.equal(received.input.authenticatedOperator, true);
  assert.equal(received.input.token, undefined);
  assert.equal(received.input.authorization, undefined);
  assert.deepEqual(received.input.privateRuntimeContext, {});
  assert.equal(received.input.partitionKey, 'private:admin:operator-session-7');
  assert.equal(received.context.serverSideAdminAuth, true);
});

test('verified principal session and generated turn survive the private Bridge handoff', async () => {
  let calls = 0;
  let received;
  const reply = 'Invoice promptly, forecast cash requirements, and control discretionary costs.';
  const bridge = {
    handleMarionAdminConversation(input, context) {
      calls += 1;
      received = { input, context };
      return signedMarionFinal(reply);
    }
  };
  const options = serverOptions(bridge, {
    sessionVerified: false, // Must not override the already-verified principal.
    sessionId: 'untrusted-option-session',
    partitionKey: 'untrusted-option-partition'
  });
  const out = await gateway.handleMarionAdminConversation({
    text: 'Give three cash-flow ideas.',
    sessionId: 'untrusted-client-session',
    turnId: 'untrusted-client-turn'
  }, options);
  assert.equal(calls, 1);
  assert.equal(out.ok, true);
  assert.equal(received.input.sessionVerified, true);
  assert.equal(received.context.sessionVerified, true);
  assert.equal(received.input.sessionId, 'operator-session-7');
  assert.equal(received.context.sessionId, 'operator-session-7');
  assert.equal(received.input.partitionKey, 'private:admin:operator-session-7');
  assert.equal(received.context.partitionKey, received.input.partitionKey);
  assert.match(received.input.turnId, /^[a-f0-9-]{36}$/);
  assert.notEqual(received.input.turnId, 'untrusted-client-turn');
  assert.equal(received.context.turnId, received.input.turnId);
});

test('text bridge accepts Marion composer signature contract and rejects altered reply text', async () => {
  const reply = 'The Marion composer returned a signed reply for this exact turn.';
  let calls = 0;
  let bridgePacket;
  const bridge = {
    async handleMarionAdminConversation() {
      calls += 1;
      bridgePacket = signedComposerMarionFinal(reply);
      return bridgePacket;
    },
  };
  const out = await gateway.handleMarionAdminConversation({ text: 'Give me the current answer.' }, serverOptions(bridge));
  assertBridgeProvenance('composer signature', reply, bridgePacket, out, calls);
  assert.equal(out.ok, true);
  assert.equal(out.finalEnvelope.signature, signedComposerMarionFinal(reply).finalEnvelope.signature);

  let alteredCalls = 0;
  const alteredBridge = {
    async handleMarionAdminConversation() {
      alteredCalls += 1;
      const packet = signedComposerMarionFinal(reply);
      packet.reply = 'A different reply was substituted after the composer signed it.';
      return packet;
    },
  };
  const rejected = await gateway.handleMarionAdminConversation({ text: 'Give me the current answer.' }, serverOptions(alteredBridge));
  assert.equal(alteredCalls, 1, 'altered bridge fixture must execute');
  assert.equal(rejected.ok, false);
  assert.equal(rejected.final, false);
  assert.equal(rejected.reply, '');
});

test('degraded or inconsistent bridge output is never promoted to Marion final', async () => {
  let calls = 0;
  const bridge = {
    async handleMarionAdminConversation() {
      calls += 1;
      return { ok: false, final: true, marionFinal: false, reply: 'untrusted fallback text' };
    },
    async handleAdminConversation() { calls += 1; return signedMarionFinal('should not run'); },
  };
  const out = await gateway.handleMarionAdminConversation({ text: 'continue' }, serverOptions(bridge));

  assert.equal(calls, 1);
  assert.equal(out.ok, false);
  assert.equal(out.final, false);
  assert.equal(out.marionFinal, false);
  assert.equal(out.canEmit, false);
  assert.equal(out.reply, '');
  assert.equal(out.error, 'MARION_FINAL_AUTHORITY_REQUIRED');
});

test('final-envelope reply aliases are not mistaken for the user prompt', () => {
  const reply = 'Cash flow improves when you invoice promptly, collect overdue balances, and time supplier payments to match expected receipts.';
  const checked = finalEnvelope.validateFinalReply(reply, {
    reply,
    text: reply,
    finalReply: reply,
    replySignature: replyHash(reply),
  });
  assert.equal(checked.ok, true, checked.reasons.join(', '));

  const echoed = finalEnvelope.validateFinalReply(reply, { prompt: reply });
  assert.equal(echoed.ok, false);
  assert.ok(echoed.reasons.includes('prompt_echo_reply_rejected'));
});

test('loop guard preserves the bridge packet, reply, and options arguments', () => {
  const reply = 'Invoice promptly, follow up on overdue accounts, and schedule supplier payments around expected receipts.';
  const allowed = loopGuard.applyLoopGuard({ prompt: 'How can I improve cash flow?' }, reply, { trustedFinal: true });
  assert.equal(allowed.allowReply, true, allowed.reasons.join(', '));
  assert.equal(allowed.sanitizedReply, reply);
  assert.equal(allowed.reasons.includes('empty_reply_detected'), false);

  const inactiveSignal = loopGuard.applyLoopGuard({
    prompt: 'How can I improve cash flow?',
    routing: { protectiveEscalation: { detected: false, reason: 'none', approvalRequired: false } },
  }, reply, { trustedFinal: true });
  assert.equal(inactiveSignal.allowReply, true, inactiveSignal.reasons.join(', '));
  assert.equal(inactiveSignal.protectiveEscalation.active, undefined);

  const repeated = loopGuard.applyLoopGuard({ state: { lastAssistantReply: reply } }, reply, { trustedFinal: true });
  assert.equal(repeated.allowReply, false);
  assert.ok(repeated.reasons.includes('exact_reply_repeat'));
});

test('bridge awaits the asynchronous final-envelope projection', async () => {
  const bridge = require(bridgePath);
  assert.equal(bridge.resolveRuntimeDependencies(true), true);
  const reply = 'Here is a concise, current-turn response that preserves the requested answer.';
  const finalized = await bridge._internal.wrapFinal({
    normalized: {
      ok: true,
      userQuery: 'Give me one concise next step.',
      turnId: 'runtime-bundle-turn',
      sessionId: 'runtime-bundle-session',
      domain: 'general',
      original: {},
    },
    routed: {
      ok: true,
      intent: 'simple_chat',
      domain: 'general',
      marionIntent: { intent: 'simple_chat' },
      routing: { intent: 'simple_chat', domain: 'general' },
    },
    contract: { ok: true, reply, text: reply, spokenText: reply, intent: 'simple_chat', domain: 'general' },
    loopGuardResult: { ok: true, allowReply: true, forceRecovery: false, reasons: [] },
    resolvedEmotionPacket: { ok: false, state: {} },
  });
  assertCertified(finalized && finalized.marionFinal === true, finalized,
    'asynchronous bridge final must be certified, not merely complete');
  assert.equal(finalized.finalEnvelope.reply, reply);
  assert.equal(finalized.finalEnvelope.currentTurnBound, true);
  assert.equal(finalized.finalEnvelope.marionFinal, true);
  assert.equal(finalized.finalEnvelope.replySignature, replyHash(reply));
});

test('a bridge-produced packet must be certified before a verified private gateway can emit it', async () => {
  const bridge = require(bridgePath);
  const text = 'How can a small business improve cash flow? Give me three concise steps.';
  const packet = await bridge.processWithMarion({
    text,
    userText: text,
    userQuery: text,
    sessionId: 'public-gateway-smoke',
    turnId: 'public-gateway-smoke-turn',
  });
  const gatewayReply = await gateway.handleMarionAdminConversation(
    { text },
    serverOptions({ handleMarionAdminConversation: async () => packet }),
  );
  // A public/synthetic bridge call is not itself evidence of private authority.
  // If it lacks final certification, the verified gateway must reject it.
  const certified = packet && packet.ok === true && packet.final === true &&
    packet.marionFinal === true && packet.canEmit === true &&
    packet.finalEnvelope && packet.finalEnvelope.final === true &&
    packet.finalEnvelope.marionFinal === true &&
    packet.finalEnvelope.semanticAuthority === 'marion' &&
    !!packet.finalEnvelope.signature && packet.finalEnvelope.currentTurnBound === true &&
    packet.finalEnvelope.replySignature === replyHash(packet.reply);
  // Positive canonical regression: an uncertified result is not a success.
  // Gateway rejection below is retained as defence in depth for environments
  // where the canonical processor is unexpectedly degraded.
  if (!certified) {
    assert.equal(gatewayReply.ok, false, 'gateway must reject uncertified bridge packets');
    assert.equal(gatewayReply.marionFinal, false);
    assert.equal(gatewayReply.canEmit, false);
    assert.equal(gatewayReply.reply, '');
    assertCertified(false, packet,
      'canonical processor failed to generate its required signed final');
  } else {
    assertCertified(gatewayReply.ok === true && gatewayReply.marionFinal === true,
      gatewayReply, 'certified bridge packet should pass verified gateway');
    assert.ok(gatewayReply.reply === packet.reply,
      'verified gateway changed the certified canonical reply');
    assert.equal(gatewayReply.finalEnvelope.replySignature, replyHash(packet.reply));
  }
});


// Focused V12 boundary regressions. These evaluate only the installed V12 wrapper
// against a controlled delegate; no server credentials or private replies are logged.
function loadIsolatedSubstantiveV12(delegate) {
  const vm = require('node:vm');
  const source = fs.readFileSync(bridgePath, 'utf8');
  const startMarker = '/* MARION_PRIVATE_SUBSTANTIVE_RESPONSE_HARDLOCK_V12_START */';
  const endMarker = '/* MARION_PRIVATE_SUBSTANTIVE_RESPONSE_HARDLOCK_V12_END */';
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  assert.ok(start >= 0 && end > start, 'substantive guard must exist');
  const api = { handleMarionAdminConversation: delegate,
    createMarionBridge() { return { handleMarionAdminConversation: delegate }; } };
  const context = {
    module: { exports: api },
    marionOwnCallable(value, key) {
      return Object.prototype.hasOwnProperty.call(value, key) && typeof value[key] === 'function'
        ? value[key] : null;
    },
  };
  vm.runInNewContext(source.slice(start, end + endMarker.length), context,
    { filename: 'isolated-marion-substantive-v12.js', timeout: 1000 });
  return api;
}

function privateFinanceInput() {
  return {
    text: 'How can a small business improve cash flow? Give me three concise steps.',
    privateAdminConversation: true,
    authenticatedOperator: true,
  };
}

test('V12 does not replay a holding private response or fabricate signed authority', async () => {
  let calls = 0;
  const bridge = loadIsolatedSubstantiveV12(async () => {
    calls += 1;
    return { ok: true, final: true, marionFinal: true, canEmit: true,
      reply: 'Hang tight while I look into it.',
      finalEnvelope: { final: true, marionFinal: true, signature: 'FORGED' } };
  });
  const out = await bridge.handleMarionAdminConversation(privateFinanceInput());
  assert.equal(calls, 1, 'a failed first answer must not start a second logical turn');
  assert.equal(out.ok, false);
  assert.equal(out.final, false);
  assert.equal(out.marionFinal, false);
  assert.equal(out.canEmit, false);
  assert.equal(out.reply, '');
  assert.equal(out.finalEnvelope, undefined, 'stale signed envelopes must not survive rejection');
});

test('V12 preserves a certified final and its exact signed reply aliases', async () => {
  let calls = 0;
  const signed = signedComposerMarionFinal('1. Invoice promptly. 2. Follow up on overdue accounts. 3. Schedule supplier payments.');
  const bridge = loadIsolatedSubstantiveV12(async () => { calls += 1; return signed; });
  const out = await bridge.handleMarionAdminConversation(privateFinanceInput());
  assert.equal(calls, 1);
  assert.equal(out, signed, 'guard must preserve packet identity and final signature');
  assert.equal(out.finalEnvelope.replySignature, replyHash(out.reply));
});

test('V12 never promotes uncertified substantive text into Marion authority', async () => {
  let calls = 0;
  const draft = { ok: false, final: false, marionFinal: false, canEmit: false,
    reply: '1. Send invoices. 2. Follow up. 3. Match payment dates.' };
  const bridge = loadIsolatedSubstantiveV12(async () => { calls += 1; return draft; });
  const out = await bridge.handleMarionAdminConversation(privateFinanceInput());
  assert.equal(calls, 1);
  assert.equal(out, draft);
  assert.equal(out.canEmit, false);
  assert.equal(out.finalEnvelope, undefined);
});

test('V12 does not transform unverified callers into private final authority', async () => {
  const draft = { ok: false, marionFinal: false, canEmit: false, reply: 'Hang tight.' };
  const bridge = loadIsolatedSubstantiveV12(async () => draft);
  const out = await bridge.handleMarionAdminConversation({
    text: 'Can you provide my financial report?', privateAdminConversation: true,
    adminVerified: false, authenticatedOperator: false,
  });
  assert.equal(out, draft);
});

test('a private finance turn recovers from composer holding text and reaches the signed Voice Authority gate', async () => {
  const bridge = require(bridgePath);
  bridge.resolveRuntimeDependencies(true);
  const text = 'How can a small business improve cash flow? Give me three concise steps.';
  let rawBridgeSnapshot = null;
  const trace = traceBridgeAuthority(bridge, (event) => {
    if (event.status === 'returned') rawBridgeSnapshot = event.snapshot;
    emitAuthorityTrace('RAW_BRIDGE_AUTHORITY', event);
  });
  const out = await gateway.handleMarionAdminConversation({ text }, serverOptions(trace.bridge));
  emitAuthorityTrace('FINANCE_GATEWAY_AUTHORITY', authoritySnapshot(out));
  assert.equal(trace.getCalls(), 1, 'private gateway must invoke one canonical Bridge handler');
  assert.ok(rawBridgeSnapshot, 'private Bridge returned no authority snapshot');

  // Test whether the raw Bridge fails BEFORE Gateway normalization. This is a
  // genuine private-admin call, not a fabricated signed fixture. Diagnostics
  // contain only allowlisted status fields, never answer or session content.
  const rawCertified = rawBridgeSnapshot.ok === true &&
    rawBridgeSnapshot.final === true && rawBridgeSnapshot.marionFinal === true &&
    rawBridgeSnapshot.canEmit === true && rawBridgeSnapshot.envelopeFinal === true &&
    rawBridgeSnapshot.envelopeMarionFinal === true &&
    rawBridgeSnapshot.currentTurnBound === true &&
    rawBridgeSnapshot.semanticAuthorityMarion === true &&
    rawBridgeSnapshot.signaturePresent === true &&
    rawBridgeSnapshot.replyHashMatches === true &&
    rawBridgeSnapshot.completionComplete === true &&
    rawBridgeSnapshot.trustAllowsEmit === true;
  if (!rawCertified) {
    // Strict failure: never replace a failed live Bridge result with a fixture.
    // These are allowlisted status/validation codes only.
    assert.fail(`private Bridge failed before Gateway normalization: ${JSON.stringify(rawBridgeSnapshot)}`);
  }

  // This is deliberately a live integration contract, not a canned fixture.
  // An authority failure MUST fail the test rather than being silently accepted.
  assertCertified(out && out.ok === true, out,
    'private finance turn did not clear the real gateway authority boundary');
  assertCertified(out.final === true && out.marionFinal === true && out.canEmit === true,
    out, 'finance turn returned without an emitting certified final');
  assert.ok(!/^i[’']?m nyx, the public sandblast assistant/i.test(out.reply),
    'private finance response contains a Nyx public identity fallback');
  // The Composer can produce three substantive steps as prose, not only as a
  // numbered list. Check content without requiring a presentation convention.
  const numbered = [1, 2, 3].every((step) =>
    new RegExp(`(?:^|\\s)${step}\\.`).test(out.reply));
  const substantiveProse = /\b(invoice|receivable|collect|payment terms)\b/i.test(out.reply) &&
    /\b(forecast|cash budget|cash flow projection|projected cash)\b/i.test(out.reply) &&
    /\b(cost|expense|spend|supplier|payment timing)\b/i.test(out.reply);
  assert.ok(numbered || substantiveProse,
    'private finance response must contain three actionable cash-flow steps');
  assert.ok(!/I’m here, Mac|tell me what you want to work through/i.test(out.reply),
    'private finance response contains a holding response');
  assert.ok(out.finalEnvelope.replySignature === replyHash(out.reply),
    'finance reply hash differs from signed envelope');
  assert.equal(out.finalEnvelope.marionFinal, true);
  assert.equal(out.finalEnvelope.currentTurnBound, true);
  assert.equal(out.finalEnvelope.semanticAuthority, 'marion');
  assert.ok(typeof out.finalEnvelope.signature === 'string' && out.finalEnvelope.signature.length > 0,
    'final authority signature marker must be present');
  for (const alias of ['text', 'displayReply', 'visibleReply', 'finalReply', 'spokenText']) {
    assert.ok(out[alias] === out.reply, `${alias} must match the signed reply`);
  }
});

test('public Neon polishing requires an explicit public boundary and omits raw user text', async () => {
  const oldEnv = {
    token: process.env.NEON_AI_GATEWAY_TOKEN,
    baseUrl: process.env.NEON_AI_GATEWAY_BASE_URL,
    model: process.env.NEON_AI_GATEWAY_MODEL,
    fetch: global.fetch,
  };
  process.env.NEON_AI_GATEWAY_TOKEN = 'test-token-only';
  process.env.NEON_AI_GATEWAY_BASE_URL = 'https://branch-api.ai.neon.tech';
  delete process.env.NEON_AI_GATEWAY_MODEL;
  let calls = 0;
  let submittedBody;
  global.fetch = async (url, options) => {
    calls += 1;
    submittedBody = JSON.parse(options.body);
    assert.equal(url, 'https://branch-api.ai.neon.tech/v1/chat/completions');
    return { ok: true, json: async () => ({ choices: [{ message: { content: 'Cash flow improves when receipts arrive sooner.' } }] }) };
  };

  try {
    assert.equal(await adapter.generateNyxReply({ baseMessage: 'Base answer' }), null);
    assert.equal(await adapter.generateNyxReply({
      baseMessage: 'Cash flow improves when receipts arrive sooner.',
      userMessage: 'this private raw prompt must not be forwarded',
      boundaryContext: {
        role: 'public',
        scope: 'public',
        publicSurfaceOnly: true,
        actor: 'guest',
      },
    }), 'Cash flow improves when receipts arrive sooner.');
    assert.equal(calls, 1);
    const serialized = JSON.stringify(submittedBody);
    assert.equal(serialized.includes('userMessage'), false);
    assert.equal(serialized.includes('private raw prompt'), false);

    const denied = await adapter.generateNyxReply({
      baseMessage: 'Base answer',
      boundaryContext: {
        role: 'public', scope: 'private_admin', publicSurfaceOnly: true,
        authenticatedOperator: true,
      },
    });
    assert.equal(denied, null);
    assert.equal(calls, 1);
  } finally {
    if (oldEnv.token === undefined) delete process.env.NEON_AI_GATEWAY_TOKEN;
    else process.env.NEON_AI_GATEWAY_TOKEN = oldEnv.token;
    if (oldEnv.baseUrl === undefined) delete process.env.NEON_AI_GATEWAY_BASE_URL;
    else process.env.NEON_AI_GATEWAY_BASE_URL = oldEnv.baseUrl;
    if (oldEnv.model === undefined) delete process.env.NEON_AI_GATEWAY_MODEL;
    else process.env.NEON_AI_GATEWAY_MODEL = oldEnv.model;
    global.fetch = oldEnv.fetch;
  }
});

test('bridge recovery no longer fabricates or re-finalizes a replacement reply', () => {
  const source = fs.readFileSync(bridgePath, 'utf8');
  const start = source.indexOf('async function definitive(input={}){', source.indexOf('MARION_DRASTIC_BRIDGE_RECOVERY_V9_START'));
  const end = source.indexOf('function admin(input={})', start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  const activeRecovery = source.slice(start, end);
  assert.match(activeRecovery, /previous\.call\(this,input\)/);
  assert.doesNotMatch(activeRecovery, /builtIn\(|finalize\(|packet\(/);
  assert.match(source, /currentTurnBound:true,semanticAuthority:"marion",replySignature:hashText\(reply\)/);
  assert.match(source, /currentTurnBound:true,semanticAuthority:"marion",replySignature:hashText\(text\)/);
});

test('server route provides the verified private context and public adapter scope', () => {
  const source = fs.readFileSync(indexPath, 'utf8');
  const gatewayCallStart = source.indexOf('const packet = await MarionVoiceGateway.handleMarionAdminConversation({');
  assert.notEqual(gatewayCallStart, -1);
  const gatewayCall = source.slice(gatewayCallStart, gatewayCallStart + 8000);
  assert.ok(gatewayCall.includes('adminVerified: auth.verified === true'));
  assert.ok(gatewayCall.includes('partitionKey: privatePartitionKey'));
  assert.match(source, /boundaryContext:\s*\{\s*role:\s*"public",\s*actor:\s*"guest",\s*scope:\s*"public",\s*publicSurfaceOnly:\s*true/s);
});

test('widget remains below the 50 KB source limit', () => {
  const widget = path.join(root, 'public/nyx/Sandblast-Nyx-Widget-Fixed.html');
  assert.ok(fs.statSync(widget).size < 50000, `widget is ${fs.statSync(widget).size} bytes`);
});

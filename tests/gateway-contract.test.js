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
const gateway = require(gatewayPath);
Module._load = originalLoad;
const adapter = require(adapterPath);

function replyHash(value) {
  const source = String(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  let hash = 0;
  for (let i = 0; i < source.length; i += 1) {
    hash = ((hash << 5) - hash) + source.charCodeAt(i);
    hash |= 0;
  }
  return String(hash >>> 0);
}

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

test('private text rejects client-supplied admin claims without server authorization', async () => {
  let calls = 0;
  const bridge = { handleMarionAdminConversation() { calls += 1; return signedMarionFinal('secret reply'); } };
  const out = await gateway.handleMarionAdminConversation({
    text: 'read the private status',
    adminVerified: true,
    authenticatedOperator: true,
    privateRuntimeContext: { version: 'client-controlled' },
  }, { bridge });

  assert.equal(calls, 0);
  assert.equal(out.ok, false);
  assert.equal(out.final, false);
  assert.equal(out.marionFinal, false);
  assert.equal(out.reply, '');
  assert.equal(out.error, 'MARION_ADMIN_AUTH_REQUIRED');
});

test('adminVoiceDeliveryAllowed alone is not an authentication proof', async () => {
  const out = await gateway.handleMarionAdminConversation({ text: 'status' }, { adminVoiceDeliveryAllowed: true });
  assert.equal(out.error, 'MARION_ADMIN_AUTH_REQUIRED');
  assert.equal(out.marionFinal, false);
});

test('text bridge calls one canonical handler and preserves a signed current-turn final', async () => {
  let calls = 0;
  let received;
  const reply = 'The current Marion response is authorized and complete.';
  const bridge = {
    async handleMarionAdminConversation(input, context) {
      calls += 1;
      received = { input, context };
      return signedMarionFinal(reply);
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
  assert.equal(out.ok, true);
  assert.equal(out.final, true);
  assert.equal(out.marionFinal, true);
  assert.equal(out.reply, reply);
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

test('text bridge accepts Marion composer signature contract and rejects altered reply text', async () => {
  const reply = 'The Marion composer returned a signed reply for this exact turn.';
  const bridge = { async handleMarionAdminConversation() { return signedComposerMarionFinal(reply); } };
  const out = await gateway.handleMarionAdminConversation({ text: 'Give me the current answer.' }, serverOptions(bridge));
  assert.equal(out.ok, true);
  assert.equal(out.reply, reply);
  assert.equal(out.finalEnvelope.signature, signedComposerMarionFinal(reply).finalEnvelope.signature);

  const alteredBridge = {
    async handleMarionAdminConversation() {
      const packet = signedComposerMarionFinal(reply);
      packet.reply = 'A different reply was substituted after the composer signed it.';
      return packet;
    },
  };
  const rejected = await gateway.handleMarionAdminConversation({ text: 'Give me the current answer.' }, serverOptions(alteredBridge));
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
  assert.equal(finalized.marionFinal, true);
  assert.equal(finalized.finalEnvelope.reply, reply);
  assert.equal(finalized.finalEnvelope.currentTurnBound, true);
});

test('a live public bridge final clears the Gateway signed-final gate', async () => {
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
  assert.equal(gatewayReply.ok, true, gatewayReply.error);
  assert.equal(gatewayReply.marionFinal, true);
  assert.equal(gatewayReply.reply, packet.reply);
});

test('a private finance turn recovers from composer holding text and reaches the signed Voice Authority gate', async () => {
  const bridge = require(bridgePath);
  bridge.resolveRuntimeDependencies(true);
  const text = 'How can a small business improve cash flow? Give me three concise steps.';
  const out = await gateway.handleMarionAdminConversation({ text }, serverOptions(bridge));

  assert.equal(out.ok, true, out.error);
  assert.equal(out.final, true);
  assert.equal(out.marionFinal, true);
  assert.equal(out.canEmit, true);
  assert.match(out.reply, /1\./);
  assert.match(out.reply, /2\./);
  assert.match(out.reply, /3\./);
  assert.doesNotMatch(out.reply, /I’m here, Mac|tell me what you want to work through/i);
  assert.equal(out.finalEnvelope.replySignature, replyHash(out.reply));
  for (const alias of ['text', 'displayReply', 'visibleReply', 'finalReply', 'spokenText']) {
    assert.equal(out[alias], out.reply, `${alias} must match the signed reply`);
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
  const widget = path.join(root, 'public/Sandblast-Nyx-Widget-Fixed.html');
  assert.ok(fs.statSync(widget).size < 50000, `widget is ${fs.statSync(widget).size} bytes`);
});

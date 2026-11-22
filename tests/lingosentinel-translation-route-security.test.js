'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const routeFile = path.join(__dirname, '../Data/marion/routes/lingosentinelTranslationRoutes.js');
function setup(translate = async () => ({ ok: true, translatedText: 'Bonjour', confidence: 0.9, provider: 'test', status: 'translated' })) {
  const routes = {};
  const orchestrator = { calls: [], async translate(...args) { this.calls.push(args); return translate(...args); } };
  const terms = { calls: [], normalize(values) { this.calls.push(values); return values; } };
  const express = { Router() {
    const router = { post(route, fn) { routes['POST ' + route] = fn; }, options(route, fn) { routes['OPTIONS ' + route] = fn; } };
    return router;
  } };
  const sandbox = { module: { exports: {} }, exports: {}, require(id) {
    if (id === 'express') return express;
    if (id.endsWith('/LingoSentinelContextualTranslationCoordinator')) return orchestrator;
    if (id.endsWith('/LingoSentinelProtectedTerms')) return terms;
    throw new Error('Unexpected require: ' + id);
  } };
  vm.runInNewContext(fs.readFileSync(routeFile, 'utf8'), sandbox, { filename: routeFile });
  const app = { mounts: [], use(...args) { this.mounts.push(args); } };
  sandbox.module.exports.registerLingoSentinelTranslationRoutes(app);
  async function invoke(body, headers = {}) {
    const response = { statusCode: 200, headers: {}, status(n) { this.statusCode = n; return this; },
      json(value) { this.payload = value; return this; }, setHeader(k,v) { this.headers[k] = v; },
      end() { return this; } };
    await routes['POST /translate']({ body, headers }, response);
    return response;
  }
  return { invoke, routes, orchestrator, terms, app, exports: sandbox.module.exports };
}

test('preserves endpoint, export and coordinator arguments', async () => {
  const s = setup();
  assert.equal(s.app.mounts[0][0], '/api/lingosentinel');
  const res = await s.invoke({ source: 'en', target: 'fr', text: 'Hello', preserve: ['Sandblast'], roomId: 'room-1', messageId: 'msg-1' }, { 'x-request-id': 'request-1' });
  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.translatedText, 'Bonjour');
  assert.equal(s.orchestrator.calls.length, 1);
  assert.equal(s.orchestrator.calls[0][0].originalText, 'Hello');
  assert.equal(s.orchestrator.calls[0][0].sourceLanguage, 'en');
  assert.equal(s.orchestrator.calls[0][0].targetLanguage, 'fr');
  assert.equal(s.orchestrator.calls[0][1].manual, true);
  assert.equal(res.headers['Cache-Control'], 'no-store');
});

test('same-language bypass does not call coordinator', async () => {
  const s = setup();
  const res = await s.invoke({ text: 'Hello' });
  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.status, 'not_required');
  assert.equal(s.orchestrator.calls.length, 0);
});

test('rejects conflicting language aliases', async () => {
  const s = setup();
  const res = await s.invoke({ source: 'en', sourceLanguage: 'fr', target: 'de', text: 'Hi' });
  assert.equal(res.statusCode, 400);
  assert.equal(res.payload.error, 'TRANSLATION_LANGUAGE_INVALID');
  assert.equal(s.orchestrator.calls.length, 0);
});

test('rejects malformed IDs and ignores unsafe request identifier', async () => {
  const s = setup();
  const bad = await s.invoke({ text: 'Hi', target: 'fr', roomId: 'room\nInjected' }, { 'x-request-id': 'evil\r\nInjected' });
  assert.equal(bad.statusCode, 400);
  assert.equal(bad.payload.requestId, '');
  const oversized = await s.invoke({ text: 'Hi', target: 'fr', messageId: 'x'.repeat(129) });
  assert.equal(oversized.statusCode, 400);
});

test('rejects malformed body and oversized input', async () => {
  const s = setup();
  assert.equal((await s.invoke([])).statusCode, 400);
  assert.equal((await s.invoke({ text: 'a'.repeat(8001), target: 'fr' })).statusCode, 400);
  assert.equal((await s.invoke({ text: 'Hi', target: 'fr', preserve: ['bad\nterm'] })).statusCode, 400);
  assert.equal(s.orchestrator.calls.length, 0);
});

test('does not copy public caller privilege claims into coordinator payload', async () => {
  const s = setup();
  const res = await s.invoke({ text: 'Hello', target: 'fr', adminVerified: true, auth: 'secret', voice: { speakAllowed: true } });
  assert.equal(res.statusCode, 200);
  const forwarded = s.orchestrator.calls[0][0];
  assert.equal(Object.hasOwn(forwarded, 'adminVerified'), false);
  assert.equal(Object.hasOwn(forwarded, 'auth'), false);
  assert.equal(Object.hasOwn(forwarded, 'voice'), false);
});

test('does not disclose provider errors or metadata', async () => {
  const s = setup(async () => ({ ok: false, error: 'POSTGRES_SECRET_TOKEN' }));
  const res = await s.invoke({ text: 'Hello', target: 'fr' });
  assert.equal(res.statusCode, 503);
  assert.equal(res.payload.error, 'LINGOSENTINEL_TRANSLATION_FAILED');
  const t = setup(async () => { throw new Error('connection string private'); });
  const err = await t.invoke({ text: 'Hello', target: 'fr' });
  assert.equal(err.statusCode, 503);
  assert.equal(JSON.stringify(err.payload).includes('connection string'), false);
});

test('bounds successful output and sanitizes provider metadata', async () => {
  const s = setup(async () => ({ ok: true, translatedText: 'Translated', provider: 'secret\nheader', status: 'private path /root', confidence: 2 }));
  const res = await s.invoke({ text: 'Hello', target: 'fr' });
  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.provider, 'internal');
  assert.equal(res.payload.status, 'translated');
  assert.equal(res.payload.confidence, 1);
  const huge = setup(async () => ({ ok: true, translatedText: 'a'.repeat(32001) }));
  const bad = await huge.invoke({ text: 'Hello', target: 'fr' });
  assert.equal(bad.statusCode, 502);
});

test('OPTIONS remains available and does not execute translation', () => {
  const s = setup();
  const res = { statusCode: 200, headers: {}, setHeader(k,v) { this.headers[k] = v; },
    status(n) { this.statusCode = n; return this; }, end() { return this; } };
  s.routes['OPTIONS /translate']({}, res);
  assert.equal(res.statusCode, 204);
  assert.equal(s.orchestrator.calls.length, 0);
});

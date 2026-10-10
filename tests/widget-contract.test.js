'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const widgetPath = path.join(root, 'public/Sandblast-Nyx-Widget-Fixed.html');
const html = fs.readFileSync(widgetPath, 'utf8');

function responseGate() {
  const start = html.indexOf('function Ge(e,t){');
  const end = html.indexOf('const h=', start);
  assert.notEqual(start, -1, 'widget response gate must be present');
  assert.notEqual(end, -1, 'widget response gate boundary must be present');
  const context = { W: {} };
  const gate = vm.runInNewContext(`${html.slice(start, end)};Ge`, context);
  return { gate, diagnostics: context.W };
}

test('widget source stays under 50 KB and parses every inline JavaScript block', () => {
  assert.ok(fs.statSync(widgetPath).size < 50000, `widget is ${fs.statSync(widgetPath).size} bytes`);
  const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
    .filter(([, attrs, body]) => !/type\s*=\s*["']application\/(?:ld\+)?json["']/i.test(attrs) && body.trim());
  assert.equal(scripts.length, 6, 'expected six executable inline scripts');
  scripts.forEach(([, , body], index) => new vm.Script(body, { filename: `widget-inline-${index + 1}.js` }));
});

test('widget sends chat turns as JSON POSTs to the canonical /api/chat endpoint', () => {
  assert.match(html, /SB_NYX_CONVERSATION_ENDPOINT=W\.SB_NYX_CONVERSATION_ENDPOINT\|\|"https:\/\/sandblast-backend\.onrender\.com\/api\/chat"/);
  assert.match(html, /fetch\(W\.SB_NYX_CONVERSATION_ENDPOINT,\{method:"POST"/);
  assert.match(html, /headers:\{"Content-Type":"application\/json"/);
  assert.match(html, /body:JSON\.stringify\(/);
  assert.match(html, /35e3/);
});

test('response gate accepts the certified public Nyx shape even when canEmit is false', () => {
  const { gate } = responseGate();
  const reply = 'Artificial intelligence is software designed to perform language and pattern tasks.';
  const publicReply = {
    ok: true,
    final: true,
    marionFinal: false,
    canEmit: false,
    emit: true,
    answerOnly: true,
    publicSurfaceOnly: true,
    audience: 'public',
    reply,
    finalEnvelope: {
      final: true, marionFinal: false, canEmit: false, emit: true, answerOnly: true,
      publicSurfaceOnly: true, audience: 'public', reply,
    },
    payload: {
      final: true, marionFinal: false, canEmit: false, emit: true, answerOnly: true,
      publicSurfaceOnly: true, audience: 'public', reply,
    },
  };
  assert.equal(gate(publicReply, reply), true);
});

test('response gate rejects private, Marion, failed, blocked, and incomplete packets', () => {
  const { gate } = responseGate();
  const base = {
    ok: true, final: true, marionFinal: false, canEmit: false,
    emit: true, answerOnly: true, publicSurfaceOnly: true, audience: 'public',
    reply: 'A complete public answer.',
  };

  assert.equal(gate({ ...base, scope: 'private_admin' }, base.reply), false);
  assert.equal(gate({ ...base, surfaceAgent: 'Marion' }, base.reply), false);
  assert.equal(gate({ ...base, marionFinal: true }, base.reply), false);
  assert.equal(gate({ ...base, ok: false }, base.reply), false);
  assert.equal(gate({ ...base, blocked: true }, base.reply), false);
  assert.equal(gate({ ...base, canEmit: false, emit: false }, base.reply), false);
  assert.equal(gate({ ...base, final: false }, base.reply), false);
  assert.equal(gate(base, ''), false);
});

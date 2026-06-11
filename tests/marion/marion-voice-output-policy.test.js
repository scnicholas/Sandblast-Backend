'use strict';

const assert = require('assert');

const {
  evaluateVoiceOutputPolicy,
  applyVoiceOutputPolicy,
  createBriefSpokenSummary,
  getReplyText
} = require('../../Data/marion/runtime/MarionVoiceOutputPolicy');

function run() {
  assert.strictEqual(getReplyText('Hello.'), 'Hello.');
  assert.strictEqual(getReplyText({ reply: 'Nyx reply.' }), 'Nyx reply.');
  assert.strictEqual(getReplyText({ message: 'Nyx message.' }), 'Nyx message.');
  assert.strictEqual(getReplyText({ output: 'Nyx output.' }), 'Nyx output.');
  assert.strictEqual(getReplyText(null), '');

  const speakable = evaluateVoiceOutputPolicy({
    reply: 'Voice lane status is stable.'
  });

  assert.strictEqual(speakable.speakAllowed, true);
  assert.strictEqual(speakable.voiceMode, 'full');
  assert.strictEqual(speakable.reason, 'SPEAKABLE_RESPONSE');
  assert.strictEqual(speakable.spokenText, 'Voice lane status is stable.');

  const codeBlocked = evaluateVoiceOutputPolicy({
    reply: '```js\nconst value = true;\n```'
  });

  assert.strictEqual(codeBlocked.speakAllowed, false);
  assert.strictEqual(codeBlocked.voiceMode, 'silent');
  assert.strictEqual(codeBlocked.reason, 'CODE_OR_MARKUP_CONTENT');

  const markupBlocked = evaluateVoiceOutputPolicy({
    reply: '<div>Nyx route output</div>'
  });

  assert.strictEqual(markupBlocked.speakAllowed, false);
  assert.strictEqual(markupBlocked.voiceMode, 'silent');
  assert.strictEqual(markupBlocked.reason, 'CODE_OR_MARKUP_CONTENT');

  const sensitiveBlocked = evaluateVoiceOutputPolicy({
    reply: 'Your api_key is visible.'
  });

  assert.strictEqual(sensitiveBlocked.speakAllowed, false);
  assert.strictEqual(sensitiveBlocked.voiceMode, 'silent');
  assert.strictEqual(sensitiveBlocked.reason, 'SENSITIVE_CONTENT');

  const sensitiveCodeBlocked = evaluateVoiceOutputPolicy({
    reply: '```js\nconst secret = true;\n```'
  });

  assert.strictEqual(sensitiveCodeBlocked.speakAllowed, false);
  assert.strictEqual(sensitiveCodeBlocked.voiceMode, 'silent');
  assert.strictEqual(sensitiveCodeBlocked.reason, 'SENSITIVE_CONTENT');

  const emptyBlocked = evaluateVoiceOutputPolicy({ reply: '   ' });

  assert.strictEqual(emptyBlocked.speakAllowed, false);
  assert.strictEqual(emptyBlocked.voiceMode, 'silent');
  assert.strictEqual(emptyBlocked.reason, 'EMPTY_RESPONSE');

  const longText = 'This is a long spoken reply. ' + 'More detail. '.repeat(120);
  const longPolicy = evaluateVoiceOutputPolicy({ reply: longText }, { maxSpokenChars: 120 });

  assert.strictEqual(longPolicy.speakAllowed, true);
  assert.strictEqual(longPolicy.voiceMode, 'brief');
  assert.strictEqual(longPolicy.reason, 'LONG_RESPONSE_BRIEF_MODE');
  assert.ok(longPolicy.spokenText.includes('full details on screen'));

  const forced = evaluateVoiceOutputPolicy({ reply: 'Hello.' }, { forceSilent: true });

  assert.strictEqual(forced.speakAllowed, false);
  assert.strictEqual(forced.voiceMode, 'silent');
  assert.strictEqual(forced.reason, 'FORCED_SILENT');

  const applied = applyVoiceOutputPolicy({ reply: 'Nyx can speak this.' });

  assert.strictEqual(applied.reply, 'Nyx can speak this.');
  assert.strictEqual(applied.voice.speakAllowed, true);
  assert.strictEqual(applied.voice.voiceMode, 'full');
  assert.strictEqual(applied.voice.spokenText, 'Nyx can speak this.');

  const appliedPrimitive = applyVoiceOutputPolicy('Plain voice output.');

  assert.strictEqual(appliedPrimitive.reply, 'Plain voice output.');
  assert.strictEqual(appliedPrimitive.voice.speakAllowed, true);
  assert.strictEqual(appliedPrimitive.voice.spokenText, 'Plain voice output.');

  const brief = createBriefSpokenSummary('First sentence. Second sentence. '.repeat(40));

  assert.ok(brief.includes('full details on screen'));
}

run();

console.log('PASS marion-voice-output-policy');

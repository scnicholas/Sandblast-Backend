'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');

const root = path.resolve(__dirname, '../..');
const indexPath = path.join(root, 'index.js');

function readIndexSource() {
  return fs.readFileSync(indexPath, 'utf8');
}

function postJson(url, body) {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const lib = target.protocol === 'https:' ? https : http;
    const payload = Buffer.from(JSON.stringify(body));

    const req = lib.request({
      method: 'POST',
      hostname: target.hostname,
      port: target.port || (target.protocol === 'https:' ? 443 : 80),
      path: target.pathname + target.search,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': payload.length
      }
    }, (res) => {
      let raw = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        raw += chunk;
      });
      res.on('end', () => {
        try {
          resolve({
            statusCode: res.statusCode,
            body: JSON.parse(raw)
          });
        } catch (err) {
          reject(new Error(`Invalid JSON from ${url}: ${raw.slice(0, 180)}`));
        }
      });
    });

    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

async function run() {
  const source = readIndexSource();

  assert.ok(source.includes('/api/nyx/voice/transcript'));
  assert.ok(source.includes('/nyx/voice/transcript'));
  assert.ok(source.includes('NYX_VOICE_TRANSCRIPT_ROUTE_VERSION'));
  assert.ok(source.includes('nyx.voiceTranscriptRoute/1.3'));
  assert.ok(source.includes('nyx.voiceReplyPromotionHardlock/1.3'));
  assert.ok(source.includes('echoSuppressed'));
  assert.ok(source.includes('nonEmptyReplyHardlock'));
  assert.ok(source.includes('getAliasNotFoundShield'));
  assert.ok(source.includes('requiredMethodForVoiceTurns: "POST"'));
  assert.ok(source.includes('audioStored: false'));

  const liveUrl = process.env.SB_TEST_VOICE_ROUTE_URL;

  if (!liveUrl) {
    console.log('SKIP live POST smoke: set SB_TEST_VOICE_ROUTE_URL to test a running server.');
    return;
  }

  const response = await postJson(liveUrl, {
    transcript: 'Vera, give me a Marion status update.',
    confidence: 0.93,
    locale: 'en-CA',
    speakerHint: 'Mac',
    provider: 'browser-native'
  });

  assert.ok(response.statusCode >= 200 && response.statusCode < 300);
  assert.strictEqual(response.body.publicAgent, 'Nyx');
  assert.strictEqual(response.body.authority, 'Marion');
  assert.strictEqual(response.body.inputChannel, 'voice');
  assert.ok(String(response.body.version || '').includes('nyx.voiceTranscriptRoute/1.3'));
  assert.strictEqual(response.body.voice.audioStored, false);
  assert.strictEqual(response.body.meta.noRawAudioStored, true);
  assert.strictEqual(response.body.meta.promotionHardlockVersion, 'nyx.voiceReplyPromotionHardlock/1.3');
  assert.ok(String(response.body.voice.spokenText || response.body.reply || '').trim());
}

run()
  .then(() => console.log('PASS nyx-voice-transcript-route-smoke'))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });

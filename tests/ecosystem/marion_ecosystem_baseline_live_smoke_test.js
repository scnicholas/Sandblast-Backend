'use strict';

const assert = require('assert');

const BASE = String(
  process.env.MARION_ECOSYSTEM_BACKEND ||
  'http://localhost:3000'
).replace(/\/$/, '');

const TOKEN =
  process.env.MARION_BASELINE_INTERNAL_TOKEN ||
  process.env.MARION_INTERNAL_TOKEN ||
  '';

function headers() {
  return TOKEN
    ? { 'x-marion-baseline-token': TOKEN }
    : {};
}

async function read(url) {
  const response = await fetch(url, {
    headers: headers()
  });

  const json = await response.json().catch(() => ({}));

  return { response, json };
}

(async () => {
  const result = await read(
    BASE + '/api/marion/ecosystem/baseline/health'
  );

  assert.equal(result.response.ok, true, JSON.stringify(result.json));
  assert.equal(result.json.ok, true);
  assert.equal(result.json.baselineVersion, '1.0.0');

  console.log('PASS SANDBLAST ECOSYSTEM BASELINE 1.0 LIVE HEALTH SMOKE TEST');
})().catch(error => {
  console.error(error);
  process.exit(1);
});

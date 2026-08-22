'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '../..');
const manifest = path.join(root, 'baseline/SHA256SUMS.txt');

assert.equal(fs.existsSync(manifest), true, 'SHA256SUMS.txt missing');

const lines = fs.readFileSync(manifest, 'utf8')
  .split(/\r?\n/)
  .map(line => line.trim())
  .filter(Boolean)
  .filter(line => !line.startsWith('#'));

for (const line of lines) {
  const match = line.match(/^([a-f0-9]{64})\s{2}(.+)$/i);
  assert.ok(match, `invalid SHA line: ${line}`);

  const expected = match[1].toLowerCase();
  const rel = match[2];
  const file = path.join(root, rel);

  assert.equal(fs.existsSync(file), true, `hashed file missing: ${rel}`);

  const actual = crypto
    .createHash('sha256')
    .update(fs.readFileSync(file))
    .digest('hex');

  assert.equal(actual, expected, `SHA mismatch: ${rel}`);
}

console.log(`PASS marion_ecosystem_baseline_hash_verify (${lines.length} files)`);

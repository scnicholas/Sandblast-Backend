'use strict';
// Read-only dependency diagnostic. No credentials, connection attempts, or DB writes.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const relative = 'Data/marion/runtime/learning/MarionLearningPostgresAdapters.js';
const policyRelative = 'Data/marion/runtime/learning/MarionLearningPolicy.js';
function describeFile(rel) {
  const full = path.join(root, ...rel.split('/'));
  return { present: fs.existsSync(full), relativePath: rel };
}
function describeModule(name) {
  try {
    const resolved = require.resolve(name, { paths: [root] });
    const mod = require(resolved);
    return { loaded: true, entryUnderNodeModules: resolved.includes(`${path.sep}node_modules${path.sep}`), version: name === 'pg' ? require(require.resolve('pg/package.json', {paths:[root]})).version : undefined, expectedExportPresent: name === 'pg' ? typeof mod.Pool === 'function' : undefined };
  } catch (error) {
    return { loaded: false, code: typeof error.code === 'string' ? error.code : 'LOAD_FAILED' };
  }
}
const result = {
  runtime: { node: process.version, platform: process.platform },
  dependency: describeModule('pg'),
  files: { adapter: describeFile(relative), policy: describeFile(policyRelative) },
  databaseUrlConfigured: Boolean(process.env.DATABASE_URL),
  note: 'No database connection was attempted; no secrets printed.'
};
console.log(JSON.stringify(result,null,2));
if (!result.dependency.loaded || !result.dependency.expectedExportPresent || !result.files.adapter.present || !result.files.policy.present) process.exitCode=1;

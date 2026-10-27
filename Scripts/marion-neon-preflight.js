"use strict";
// Read-only module and connectivity diagnostics. Does NOT initialize schema or enable learning.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const targets = {
  pg: 'pg',
  adapter: './Data/marion/runtime/learning/MarionLearningPostgresAdapters.js',
  policy: './Data/marion/runtime/learning/MarionLearningPolicy.js'
};
const results = {};
for (const [name, target] of Object.entries(targets)) {
  try {
    const resolved = require.resolve(target.startsWith('.') ? path.join(root, target) : target, { paths: [root] });
    if (!fs.existsSync(resolved)) throw new Error('not_found');
    results[name] = { present: true };
    if (name === 'adapter') {
      try {
        const mod = require(resolved);
        results[name].exportsValid = typeof mod.probeMarionLearningPostgres === 'function' && typeof mod.createMarionLearningPostgresAdapters === 'function';
      } catch (e) { results[name].exportsValid = false; results[name].loadCode = e && e.code || 'LOAD_FAILED'; }
    }
  } catch (e) { results[name] = { present: false, code: e && e.code || 'NOT_FOUND' }; }
}
const url = process.env.DATABASE_URL;
let parsed;
try { parsed = url ? new URL(url) : null; } catch (_) { parsed = null; }
const validUrl = !!parsed && ['postgres:', 'postgresql:'].includes(parsed.protocol) && !!parsed.hostname && !!parsed.pathname.slice(1);
const output = { moduleChecks: results, databaseConfigured: validUrl, databaseName: validUrl ? decodeURIComponent(parsed.pathname.slice(1)) : null, connected: null, schemaReady: null };
async function main() {
  if (process.argv.includes('--connect') && validUrl && results.pg.present) {
    let pool;
    try {
      const { Pool } = require(require.resolve('pg', {paths:[root]}));
      pool = new Pool({connectionString:url,max:1,connectionTimeoutMillis:6000,query_timeout:6500,statement_timeout:6500});
      const data = await pool.query("SELECT current_database() AS database, to_regclass('public.marion_learning_signals') IS NOT NULL AS signals, to_regclass('public.marion_learning_fixture_reviews') IS NOT NULL AS reviews");
      output.connected=true;
      output.databaseName=data.rows[0].database;
      output.schemaReady= data.rows[0].signals === true && data.rows[0].reviews === true;
    } catch(e) {output.connected=false;output.connectionErrorCode=String(e && e.code || 'CONNECTION_FAILED').replace(/[^A-Z0-9_]/gi,'').slice(0,64);} finally {if(pool)await pool.end().catch(()=>{});}
  }
  console.log(JSON.stringify(output,null,2));
  if(!results.pg.present || !results.adapter.present || !results.policy.present || results.adapter.exportsValid===false || (process.argv.includes('--connect') && output.connected!==true)) process.exitCode=1;
}
main().catch(()=>{console.error('preflight_failed');process.exitCode=1;});

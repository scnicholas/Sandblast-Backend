"use strict";
// Read-only production preflight; no database creation or mutations.
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const locations = {
  pgAdapter: "Data/marion/runtime/learning/MarionLearningPostgresAdapters.js",
  policy: "Data/marion/runtime/learning/MarionLearningPolicy.js",
  voiceMount: "utils/nyxVoiceMount.js",
  voiceRoute: "utils/voiceRoute.js",
  tts: "utils/tts.js"
};
function safeError(e) {
  const code = String(e && e.code || "LOAD_FAILED");
  const msg = String(e && e.message || "");
  const match = /Cannot find module ['\"]([^'\"]+)/.exec(msg);
  const missing = match ? match[1] : "";
  return {code: /^[A-Z_0-9]+$/.test(code) ? code : "LOAD_FAILED", missingModule: missing.startsWith(".") || /^[A-Za-z@][A-Za-z0-9@/_-]*$/.test(missing) ? missing : "redacted"};
}
function moduleState(rel) {
  const absolute = path.join(root, rel);
  const present = fs.existsSync(absolute) && fs.statSync(absolute).isFile();
  if (!present) return {present:false, loaded:false, reason:"file_missing"};
  try { require(absolute); return {present:true,loaded:true}; }
  catch (e) { return {present:true,loaded:false,...safeError(e)}; }
}
function boolEnv(name) {return typeof process.env[name] === "string" && process.env[name].length>0;}
async function run() {
  const modules = Object.fromEntries(Object.entries(locations).map(([name,loc]) => [name,moduleState(loc)]));
  let pg;
  try { pg = require("pg"); modules.pg={present:true,loaded:typeof pg.Pool==="function"}; }
  catch(e) {modules.pg={present:false,loaded:false,...safeError(e)};}
  const report={check:"sandblast-neon-deployment",modules,databaseConfigured:boolEnv("DATABASE_URL"),canonicalEnabled:process.env.MARION_CANONICAL_ENABLED==="true",connected:null,schemaReady:null,reason:"not_tested"};
  if(!report.databaseConfigured) report.reason="database_url_not_set_in_this_environment";
  else if(!modules.pg.loaded || !modules.pgAdapter.loaded || !modules.policy.loaded) report.reason="module_load_not_ready";
  else {
    let pool;
    try {
      pool = new pg.Pool({connectionString:process.env.DATABASE_URL,max:1,connectionTimeoutMillis:5000,idleTimeoutMillis:1000,ssl:{rejectUnauthorized:true}});
      const result=await pool.query("SELECT current_database() AS db_name");
      report.connected=true;
      report.databaseName=String(result.rows[0].db_name || "");
      const adapter=require(path.join(root,locations.pgAdapter));
      const status=await adapter.probeMarionLearningPostgres(pool);
      report.schemaReady=status.ready===true;
      report.reason=status.reason || "unknown";
      report.coreReady=status.coreReady===true;
      report.reviewStoreReady=status.reviewStoreReady===true;
    } catch(e) {report.connected=false; report.schemaReady=false; report.reason="postgres_query_failed"; report.error=safeError(e).code;}
    finally {if(pool) await pool.end().catch(()=>{});}
  }
  process.stdout.write(JSON.stringify(report,null,2)+"\n");
  if(report.databaseConfigured && (!report.connected || !report.schemaReady)) process.exitCode=1;
  if(!modules.pgAdapter.loaded || !modules.policy.loaded) process.exitCode=1;
}
run().catch(e=>{process.stderr.write(JSON.stringify({ok:false,...safeError(e)})+"\n");process.exitCode=1;});

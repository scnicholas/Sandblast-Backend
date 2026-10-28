"use strict";
// Run only in a trusted environment with DATABASE_URL. Read-only: no DDL or writes.
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const adapterPath = path.join(root, "Data/marion/runtime/learning/MarionLearningPostgresAdapters.js");
const policyPath = path.join(root, "Data/marion/runtime/learning/MarionLearningPolicy.js");
const fs = require("node:fs");
(async () => {
  const status = { adapterFile: fs.existsSync(adapterPath), policyFile: fs.existsSync(policyPath), configured: !!process.env.DATABASE_URL };
  let Pool, adapter;
  try { ({ Pool } = require("pg")); status.pgPackage = true; }
  catch (_) { status.pgPackage = false; }
  try { adapter = require(adapterPath); status.adapterLoaded = typeof adapter.probeMarionLearningPostgres === "function"; }
  catch (error) { status.adapterLoaded = false; status.adapterErrorCode = error.code || "LOAD_ERROR"; }
  if (!status.pgPackage || !status.adapterLoaded || !status.configured) {
    console.log(JSON.stringify(status, null, 2)); process.exitCode = 2; return;
  }
  const pool = new Pool({connectionString: process.env.DATABASE_URL, max:1, connectionTimeoutMillis:7000, idleTimeoutMillis:1000, statement_timeout:10000, ssl:{rejectUnauthorized:true}});
  pool.on("error", () => {});
  try {
    const result = await pool.query("SELECT current_database() AS database_name, 1 AS connected");
    status.connected = result.rows?.[0]?.connected === 1;
    status.databaseName = result.rows?.[0]?.database_name;
    const probe = await adapter.probeMarionLearningPostgres(pool);
    status.schemaReady = probe.ready === true;
    status.reason = probe.reason || "unknown";
    if (!status.connected || !status.schemaReady) process.exitCode = 3;
  } catch (error) {
    status.connected = false;
    status.errorCode = /^[A-Z0-9_]+$/.test(error.code || "") ? error.code : "QUERY_ERROR";
    process.exitCode = 4;
  } finally { await pool.end().catch(() => {}); }
  console.log(JSON.stringify(status, null, 2));
})().catch(() => {console.error("neon_check_unexpected_failure");process.exitCode = 5;});

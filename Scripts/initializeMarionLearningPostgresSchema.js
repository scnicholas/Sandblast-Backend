"use strict";

// One-time, opt-in schema/bootstrap command for the Marion evaluation branch.
// This file is intentionally not imported by index.js and never runs on startup.

const path = require("path");

const EXPECTED_BRANCH_CONFIRMATION = "marion-learning-eval";
const EXPECTED_DATABASE = "neondb";
const ALLOWED_HOSTS = new Set([
  "ep-long-lab-b5ujxh55.c-7.us-east-2.aws.neon.tech",
  "ep-long-lab-b5ujxh55-pooler.c-7.us-east-2.aws.neon.tech"
]);

function makeError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function loadLocalEnvironment() {
  try {
    const dotenv = require("dotenv");
    if (dotenv && typeof dotenv.config === "function") {
      dotenv.config({ path: path.resolve(process.cwd(), ".env"), override: false });
      return;
    }
  } catch (_) {}

  if (!process.env.DATABASE_URL && typeof process.loadEnvFile === "function") {
    try {
      process.loadEnvFile(path.resolve(process.cwd(), ".env"));
    } catch (_) {}
  }
}

function validateTarget(databaseUrl, branchConfirmation, selfLearningEnabled) {
  if (branchConfirmation !== EXPECTED_BRANCH_CONFIRMATION) {
    throw makeError("explicit_evaluation_branch_confirmation_required");
  }
  if (String(selfLearningEnabled || "").toLowerCase() === "true") {
    throw makeError("disable_self_learning_before_schema_initialization");
  }
  if (typeof databaseUrl !== "string" || databaseUrl.length === 0) {
    throw makeError("database_url_missing");
  }

  let parsed;
  try {
    parsed = new URL(databaseUrl);
  } catch (_) {
    throw makeError("database_url_invalid");
  }

  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
    throw makeError("database_url_not_postgresql");
  }
  if (!ALLOWED_HOSTS.has(parsed.hostname.toLowerCase())) {
    throw makeError("database_endpoint_not_allowlisted_for_evaluation");
  }

  let database = "";
  try {
    database = decodeURIComponent(parsed.pathname.replace(/^\/+/, "").split("/")[0] || "");
  } catch (_) {
    throw makeError("database_name_invalid");
  }
  if (database !== EXPECTED_DATABASE) {
    throw makeError("database_name_not_allowlisted_for_evaluation");
  }

  return Object.freeze({ database, host: parsed.hostname.toLowerCase() });
}

async function auditBootstrapIsSafe(pool, adapter) {
  const existence = await pool.query(`SELECT
    to_regclass('public.marion_learning_audit') IS NOT NULL AS audit_exists,
    to_regclass('public.marion_learning_audit_state') IS NOT NULL AS state_exists`);
  const tables = existence && existence.rows && existence.rows[0];
  if (!tables) throw makeError("audit_preflight_failed");
  if (tables.audit_exists !== tables.state_exists) {
    throw makeError("partial_audit_schema_refused");
  }
  if (!tables.audit_exists) return "empty_schema";

  const counts = await pool.query(`SELECT
    (SELECT COUNT(*)::text FROM public.marion_learning_audit) AS audit_rows,
    (SELECT COUNT(*)::text FROM public.marion_learning_audit_state) AS state_rows,
    (SELECT sequence::text FROM public.marion_learning_audit_state WHERE singleton = TRUE) AS state_sequence,
    (SELECT event_hash FROM public.marion_learning_audit_state WHERE singleton = TRUE) AS state_hash`);
  const row = counts && counts.rows && counts.rows[0];
  if (!row) throw makeError("audit_preflight_failed");

  if (row.audit_rows === "0" && row.state_rows === "0") return "empty_audit_store";
  if (row.audit_rows === "0" && row.state_rows === "1" &&
      row.state_sequence === "0" && row.state_hash === "GENESIS") {
    const health = await adapter.probeMarionLearningPostgres(pool);
    return health && health.ready === true ? "already_initialized" : "bootstrap_present_schema_incomplete";
  }

  const health = await adapter.probeMarionLearningPostgres(pool);
  if (health && health.ready === true) return "already_initialized";
  throw makeError("nonempty_or_inconsistent_audit_store_refused");
}

async function main() {
  loadLocalEnvironment();
  const target = validateTarget(
    process.env.DATABASE_URL,
    process.env.SB_MARION_LEARNING_SCHEMA_INIT_CONFIRM,
    process.env.SB_MARION_SELF_LEARNING_ENABLED
  );

  let Pool;
  try {
    ({ Pool } = require("pg"));
  } catch (_) {
    throw makeError("postgres_dependency_missing");
  }

  const adapter = require("../Data/marion/runtime/learning/MarionLearningPostgresAdapters.js");
  if (typeof adapter.initializeMarionLearningPostgresSchema !== "function" ||
      typeof adapter.probeMarionLearningPostgres !== "function") {
    throw makeError("explicit_schema_initializer_unavailable");
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 1,
    connectionTimeoutMillis: 8000,
    idleTimeoutMillis: 5000,
    ssl: { rejectUnauthorized: true }
  });

  try {
    const state = await auditBootstrapIsSafe(pool, adapter);
    if (state === "already_initialized") {
      console.log(JSON.stringify({ status: "already_initialized", branch: EXPECTED_BRANCH_CONFIRMATION, database: target.database }));
      return;
    }
    await adapter.initializeMarionLearningPostgresSchema(pool);

    const health = await adapter.probeMarionLearningPostgres(pool);
    if (!health || health.ready !== true) throw makeError("post_initialization_health_probe_failed");
    console.log(JSON.stringify({ status: "initialized_and_verified", branch: EXPECTED_BRANCH_CONFIRMATION, database: target.database }));
  } finally {
    await pool.end().catch(() => {});
  }
}

if (require.main === module) {
  main().catch((error) => {
    const code = error && /^[a-z0-9_]+$/i.test(String(error.code || ""))
      ? String(error.code)
      : "initialization_failed";
    console.error(JSON.stringify({ status: "failed", code }));
    process.exitCode = 1;
  });
}

module.exports = { ALLOWED_HOSTS, EXPECTED_BRANCH_CONFIRMATION, EXPECTED_DATABASE, validateTarget };

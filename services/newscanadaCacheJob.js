"use strict";

const {
  refreshCache
} = require("./newscanadaCacheService");

const DEFAULT_JOB_INTERVAL_MS = 10 * 60 * 1000;

let jobTimer = null;
let started = false;

function startNewsCanadaCacheJob(options) {
  if (started) {
    return {
      ok: true,
      alreadyStarted: true
    };
  }

  const intervalMs = Number(options && options.intervalMs) || DEFAULT_JOB_INTERVAL_MS;

  started = true;

  refreshCache({ timeoutMs: 30000 }).catch((err) => {
    console.log("[Sandblast][newscanadaCacheJob:init_error]", err && (err.stack || err.message || err));
  });

  jobTimer = setInterval(() => {
    refreshCache({ timeoutMs: 30000 }).catch((err) => {
      console.log("[Sandblast][newscanadaCacheJob:refresh_error]", err && (err.stack || err.message || err));
    });
  }, intervalMs);

  if (typeof jobTimer.unref === "function") {
    jobTimer.unref();
  }

  return {
    ok: true,
    intervalMs
  };
}

function stopNewsCanadaCacheJob() {
  if (jobTimer) {
    clearInterval(jobTimer);
    jobTimer = null;
  }
  started = false;
  return { ok: true };
}

module.exports = {
  startNewsCanadaCacheJob,
  stopNewsCanadaCacheJob
};

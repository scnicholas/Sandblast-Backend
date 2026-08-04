"use strict";

/**
 * newscanadaCacheJob.js
 *
 * Starts one bounded News Canada cache refresh timer.
 */

const {
  clearAndRefreshCache
} = require("./newscanadaCacheService");

const VERSION =
  "newscanada.cacheJob/2.1-conflict-resolved-single-timer";

const DEFAULT_JOB_INTERVAL_MS =
  Number(process.env.NEWS_CANADA_REFRESH_MS) ||
  30 * 60 * 1000;

const DEFAULT_TIMEOUT_MS =
  Number(process.env.NEWS_CANADA_RSS_TIMEOUT_MS) ||
  30000;

let jobTimer = null;
let started = false;
let activeIntervalMs = 0;
let activeTimeoutMs = 0;

function positiveNumber(value, fallback) {
  const number = Number(value);

  return Number.isFinite(number) && number > 0
    ? number
    : fallback;
}

function logError(label, error) {
  console.log(
    label,
    error && (error.stack || error.message || error)
  );
}

function refresh(timeoutMs, label) {
  return clearAndRefreshCache({
    timeoutMs
  }).catch((error) => {
    logError(label, error);
    return {
      ok: false,
      error:
        error && error.message
          ? error.message
          : "refresh_failed"
    };
  });
}

function startNewsCanadaCacheJob(options = {}) {
  if (started) {
    return {
      ok: true,
      alreadyStarted: true,
      intervalMs: activeIntervalMs,
      timeoutMs: activeTimeoutMs,
      version: VERSION
    };
  }

  const intervalMs = positiveNumber(
    options && options.intervalMs,
    DEFAULT_JOB_INTERVAL_MS
  );

  const timeoutMs = positiveNumber(
    options && options.timeoutMs,
    DEFAULT_TIMEOUT_MS
  );

  started = true;
  activeIntervalMs = intervalMs;
  activeTimeoutMs = timeoutMs;

  void refresh(
    timeoutMs,
    "[Sandblast][newscanadaCacheJob:init_error]"
  );

  jobTimer = setInterval(() => {
    void refresh(
      timeoutMs,
      "[Sandblast][newscanadaCacheJob:refresh_error]"
    );
  }, intervalMs);

  if (
    jobTimer &&
    typeof jobTimer.unref === "function"
  ) {
    jobTimer.unref();
  }

  return {
    ok: true,
    intervalMs,
    timeoutMs,
    version: VERSION
  };
}

function stopNewsCanadaCacheJob() {
  if (jobTimer) {
    clearInterval(jobTimer);
    jobTimer = null;
  }

  started = false;
  activeIntervalMs = 0;
  activeTimeoutMs = 0;

  return {
    ok: true,
    version: VERSION
  };
}

function getNewsCanadaCacheJobStatus() {
  return {
    ok: true,
    version: VERSION,
    started,
    intervalMs: activeIntervalMs,
    timeoutMs: activeTimeoutMs
  };
}

module.exports = {
  VERSION,
  startNewsCanadaCacheJob,
  stopNewsCanadaCacheJob,
  getNewsCanadaCacheJobStatus
};

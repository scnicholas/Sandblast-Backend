"use strict";

const path = require("path");
const { createRouter } = require("./routes");
const { ManifestStore } = require("./manifestStore");
const { SchedulerService } = require("./schedulerService");

function resolveDataDir(options = {}) {
  const rootDir = path.resolve(options.rootDir || path.join(__dirname, ".."));
  return path.resolve(
    options.dataDir ||
    process.env.SB_TV_DATA_DIR ||
    path.join(rootDir, "Data", "SandblastTV")
  );
}

function createSandblastTvServices(options = {}) {
  const dataDir = resolveDataDir(options);
  const store = new ManifestStore({
    dataDir,
    maxBackups: options.maxBackups || process.env.SB_TV_MAX_BACKUPS,
    maxCertifications: options.maxCertifications || process.env.SB_TV_MAX_CERTIFICATIONS
  });
  const scheduler = new SchedulerService({ store });
  const router = createRouter({
    store,
    scheduler,
    adminToken: options.adminToken,
    jsonLimit: options.jsonLimit,
    certificationConcurrency: options.certificationConcurrency
  });

  return { dataDir, store, scheduler, router };
}

function createSandblastTvRouter(options = {}) {
  return createSandblastTvServices(options).router;
}

module.exports = {
  resolveDataDir,
  createSandblastTvRouter,
  createSandblastTvServices
};

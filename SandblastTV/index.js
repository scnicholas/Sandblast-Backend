"use strict";

const path = require("path");
const { createRouter } = require("./routes");
const { ManifestStore } = require("./manifestStore");
const { SchedulerService } = require("./schedulerService");

function createSandblastTvRouter(options = {}) {
  const rootDir = path.resolve(options.rootDir || path.join(__dirname, ".."));
  const dataDir = path.resolve(
    options.dataDir || process.env.SB_TV_DATA_DIR || path.join(rootDir, "Data", "SandblastTV")
  );

  const store = new ManifestStore({ dataDir });
  const scheduler = new SchedulerService({ store });

  return createRouter({ store, scheduler });
}

module.exports = {
  createSandblastTvRouter
};

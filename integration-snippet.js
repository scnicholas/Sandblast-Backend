"use strict";

/*
  Add this near the other route mounts in the existing root index.js.
  Mount it before static-file handlers and before the final 404/error handlers.
*/

const { createSandblastTvRouter } = require("./SandblastTV");

app.use(
  "/api/sandblast-tv/v1",
  createSandblastTvRouter({ rootDir: __dirname })
);

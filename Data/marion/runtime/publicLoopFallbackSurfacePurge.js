"use strict";
/** Compatibility alias for Phase 2B public loop/fallback purge. */
const publicLock = require("./publicSurfaceIdentityLock.js");
const VERSION = "nyx.publicLoopFallbackSurfacePurge/phase2b-alias";
function purge(value, context) {
  if (publicLock && publicLock.projectPublicPayload && value && typeof value === "object") return publicLock.projectPublicPayload(value, context || value);
  if (publicLock && publicLock.sanitizePublicReply) return publicLock.sanitizePublicReply(value);
  return value;
}
module.exports = Object.assign({ VERSION, purge, project: purge }, publicLock || {});

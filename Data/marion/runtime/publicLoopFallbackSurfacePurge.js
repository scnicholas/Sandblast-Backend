"use strict";
/** Public loop/fallback surface purge alias. */
const lock = require("./publicSurfaceIdentityLock.js");
module.exports = {
  VERSION: "nyx.publicLoopFallbackSurfacePurge/1.0",
  isInternalPublicLeak: lock.isInternalPublicLeak,
  isPublicPresencePrompt: lock.isPublicPresencePrompt,
  sanitizePublicReply: lock.sanitizePublicReply,
  projectPublicPayload: lock.projectPublicPayload,
  cleanPublicPresenceReply: lock.cleanPublicPresenceReply
};

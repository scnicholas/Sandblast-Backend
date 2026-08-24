"use strict";
/**
 * publicLoopFallbackSurfacePurge.js
 * Phase 2B compatibility alias for publicSurfaceIdentityLock.
 *
 * This file intentionally owns no independent reply authority. It forwards the
 * canonical public surface lock so both import paths share one semantic/identity
 * policy and one module instance.
 */
const ALIAS_VERSION = "nyx.publicLoopFallbackSurfacePurge/phase3d-alias-1.1";
let lock=null;
let loadError="";
try {
  lock=require("./publicSurfaceIdentityLock.js");
} catch (err) {
  lock=null;
  loadError=err && (err.code || err.message || String(err)) || "public_surface_identity_lock_unavailable";
}

const ready=!!(lock && typeof lock.projectPublicPayload==="function");

module.exports=Object.assign(
  {},
  lock||{},
  {
    VERSION: ready && lock.VERSION ? lock.VERSION : ALIAS_VERSION,
    ALIAS_VERSION,
    SOURCE_VERSION: ready && lock.VERSION ? lock.VERSION : "",
    ready,
    degraded:!ready,
    loadError:ready?"":loadError
  }
);

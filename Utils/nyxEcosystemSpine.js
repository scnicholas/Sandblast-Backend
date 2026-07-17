"use strict";
const fs = require("fs");
const path = require("path");
const VERSION = "nyx.ecosystemSpine/1.0-phases-1-2";
const MANIFEST_PATH = path.join(__dirname, "..", "Data", "nyx", "ecosystem.manifest.json");
const PRIVATE = new Set(["marion", "admin", "operator"]);
function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function text(value, max = 160) { return String(value == null ? "" : value).replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max); }
function readManifest() { return JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8")); }
function surfaceName(value, manifest = readManifest()) {
  const raw = text(value, 64).toLowerCase().replace(/[^a-z0-9_-]+/g, "_");
  const resolved = manifest.aliases[raw] || raw || manifest.defaultSurface;
  return manifest.surfaces[resolved] && !PRIVATE.has(resolved) ? resolved : manifest.defaultSurface;
}
function normalizeContext(value, previous) {
  const manifest = readManifest(), input = object(value), prior = object(previous);
  const current = surfaceName(input.current || input.surface || input.lane, manifest);
  const old = surfaceName(input.previous || input.previousSurface || prior.current || current, manifest);
  const revision = Math.max(Number(prior.revision) || 0, Number(input.revision) || 0) + (current !== old ? 1 : 0);
  return {contract:"nyx.pageContext/1.0",version:VERSION,publicOnly:true,sessionId:text(input.sessionId||prior.sessionId,96),current,previous:old,intent:text(input.intent||prior.intent||"orient",80),action:text(input.action||prior.action||"entry",80),returnPath:text(input.returnPath||prior.returnPath||manifest.surfaces[old].url,320),revision,at:Date.now(),surface:manifest.surfaces[current]};
}
function transition(value) {
  const manifest = readManifest(), input = object(value), previous = object(input.previousState);
  const context = normalizeContext(input, previous), action = text(input.action || "navigate", 64);
  const rawTarget = text(input.target || context.current, 64).toLowerCase(), target = surfaceName(rawTarget, manifest);
  const blocked = PRIVATE.has(rawTarget) || !manifest.allowedActions.includes(action);
  return {ok:!blocked,contract:"nyx.ecosystemTransition/1.0",version:VERSION,status:blocked?"rejected":"validated",reason:blocked?"public_boundary_or_action_rejected":"",action,target,context:blocked?normalizeContext(previous,previous):normalizeContext({...context,current:target,action},previous),userGestureRequired:true,autoNavigate:false,privateMemoryAccess:false};
}
module.exports = {VERSION, readManifest, surfaceName, normalizeContext, transition};

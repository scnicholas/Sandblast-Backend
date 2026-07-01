"use strict";

/**
 * guardian.audit.logger.js
 * Priority-3 audit logger.
 *
 * Purpose:
 * - Keep bounded in-memory Guardian audit events.
 * - Redact secrets deeply before audit persistence/export.
 * - Preserve protective escalation evidence without exposing raw credentials or private runtime material.
 */

const VERSION = "guardian.audit.logger v1.2.0 PRIORITY3-AUDIT-HARDENED";
const DEFAULT_AUDIT_CAP = 500;
const PROTECTIVE_ESCALATION_AUDIT_VERSION = "sandblast.guardian.protectiveEscalationAudit/1.0";
const auditLog = [];
let auditCap = DEFAULT_AUDIT_CAP;

const SECRET_KEY_PATTERN = /(token|secret|password|apikey|api_key|authorization|cookie|session|sessiontoken|runtimeToken|masterToken|credential|private[_-]?key)/i;
const SECRET_TEXT_PATTERN = /(bearer\s+)[a-z0-9._~+/-]+=*|((?:token|secret|password|api[_-]?key|session[_-]?token|runtime[_-]?token|master[_-]?token)\s*[:=]\s*)[^\s,"'}]+/gi;
const GUARDIAN_ALIASES = Object.freeze({ marion: "marion", marian: "marion", mariam: "marion", "nyx-admin": "marion", aster: "aster", astro: "aster", thalon: "thalon", talon: "thalon", fallon: "thalon" });

function nowIso() { return new Date().toISOString(); }
function isObject(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
function cleanText(value, max = 4000) {
  return String(value ?? "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(SECRET_TEXT_PATTERN, (match, bearerPrefix, keyPrefix) => `${bearerPrefix || keyPrefix || ""}[REDACTED]`)
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}
function normalizeGuardian(value) {
  const v = cleanText(value || "marion", 64).toLowerCase();
  return GUARDIAN_ALIASES[v] || "marion";
}
function normalizeRisk(value) {
  const v = cleanText(value || "low", 32).toLowerCase();
  if (["low", "medium", "high", "critical"].includes(v)) return v;
  if (["warn", "warning", "moderate"].includes(v)) return "medium";
  if (["severe", "danger", "defensive", "protective"].includes(v)) return "high";
  return "low";
}
function normalizeType(value) { return cleanText(value || "runtime", 80).toLowerCase().replace(/[^a-z0-9_.:-]+/g, "_"); }
function redactDeep(value, seen = new WeakSet()) {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return cleanText(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value !== "object") return cleanText(value);
  if (seen.has(value)) return "[Circular]";
  seen.add(value);
  if (Array.isArray(value)) return value.slice(0, 50).map((item) => redactDeep(item, seen));
  const output = {};
  for (const [key, item] of Object.entries(value)) output[key] = SECRET_KEY_PATTERN.test(key) ? "[REDACTED]" : redactDeep(item, seen);
  return output;
}
function normalizeProtectiveEscalation(event = {}) {
  const src = isObject(event.protectiveEscalation) ? event.protectiveEscalation : (isObject(event.defensiveIntentJustifier) ? event.defensiveIntentJustifier : (isObject(event.ethicalJustification) ? event.ethicalJustification : {}));
  const meta = isObject(event.meta) ? event.meta : {};
  const metaProtective = isObject(meta.protectiveEscalation) ? meta.protectiveEscalation : {};
  const merged = { ...metaProtective, ...src };
  const purpose = cleanText(merged.purpose || merged.protectivePurpose || merged.justification || merged.reason || "", 600);
  const active = !!(merged.active || merged.defensiveIntent || merged.protectiveIntent || purpose || event.type === "protective_escalation");
  if (!active) return {};
  const burst = Number(merged.maxBurstSeconds ?? merged.burstSeconds ?? 0);
  const cooldown = Number(merged.minCooldownSeconds ?? merged.cooldownSeconds ?? 0);
  const boundedPolicy = !!(
    (!Number.isFinite(burst) || burst === 0 || burst <= 8) &&
    (!Number.isFinite(cooldown) || cooldown === 0 || cooldown >= 15) &&
    merged.continuous !== true &&
    merged.punitive !== true &&
    merged.coercive !== true
  );
  return {
    version: PROTECTIVE_ESCALATION_AUDIT_VERSION,
    active: true,
    guardian: normalizeGuardian(merged.guardian || event.guardian),
    defensiveIntent: !!(merged.defensiveIntent || merged.protectiveIntent || /defen|protect|safety|threat|emergency/i.test(purpose)),
    protectivePurpose: purpose,
    verifiedCommand: merged.verifiedCommand === true || merged.commandVerified === true || merged.intentVerified === true,
    humanApproval: merged.humanApproval === true || merged.approved === true || !!merged.approvedBy,
    approvalRequired: merged.approvalRequired !== false,
    boundedPolicy,
    allowed: !!((merged.verifiedCommand === true || merged.commandVerified === true || merged.intentVerified === true) && boundedPolicy && (merged.humanApproval === true || merged.approved === true || merged.approvalRequired === false)),
    maxBurstSeconds: Number.isFinite(burst) && burst > 0 ? Math.min(8, Math.max(1, burst)) : 0,
    minCooldownSeconds: Number.isFinite(cooldown) && cooldown > 0 ? Math.max(15, cooldown) : 0,
    finalAuthority: "marion",
    loggedAt: nowIso()
  };
}
function normalizeLimit(limit, fallback = 50) {
  const n = Number(limit);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.max(1, Math.min(Math.floor(n), auditCap));
}
function enforceCap() { while (auditLog.length > auditCap) auditLog.shift(); }
function matchesFilter(entry, filter = {}) {
  if (filter.guardian && entry.guardian !== normalizeGuardian(filter.guardian)) return false;
  if (filter.type && entry.type !== normalizeType(filter.type)) return false;
  if (filter.traceId && entry.traceId !== cleanText(filter.traceId, 160)) return false;
  if (filter.riskLevel && entry.riskLevel !== normalizeRisk(filter.riskLevel)) return false;
  if (filter.protectiveEscalation !== undefined && Boolean(entry.protectiveEscalationActive) !== Boolean(filter.protectiveEscalation)) return false;
  return true;
}
function logGuardianEvent(event = {}) {
  const protectiveEscalation = normalizeProtectiveEscalation(event);
  const entry = {
    timestamp: cleanText(event.timestamp || nowIso(), 80),
    guardian: normalizeGuardian(event.guardian),
    type: normalizeType(event.type || (protectiveEscalation.active ? "protective_escalation" : "runtime")),
    input: cleanText(event.input, 4000),
    reply: cleanText(event.reply, 4000),
    decision: cleanText(event.decision, 2000),
    approvalRequired: Boolean(event.approvalRequired || protectiveEscalation.approvalRequired),
    approvedBy: event.approvedBy ? cleanText(event.approvedBy, 120) : null,
    route: cleanText(event.route, 160),
    riskLevel: normalizeRisk(event.riskLevel || (protectiveEscalation.active ? "high" : "low")),
    systemState: cleanText(event.systemState || "unknown", 80).toLowerCase(),
    traceId: cleanText(event.traceId, 160),
    tags: Array.isArray(event.tags) ? event.tags.slice(0, 12).map((tag) => cleanText(tag, 60)).filter(Boolean) : [],
    protectiveEscalationActive: !!protectiveEscalation.active,
    protectiveEscalation: protectiveEscalation.active ? protectiveEscalation : {},
    meta: event.meta ? redactDeep(event.meta) : {},
    error: event.error ? redactDeep(event.error) : null
  };
  auditLog.push(Object.freeze(entry));
  enforceCap();
  return entry;
}
function getGuardianAuditLog(limit = 50, filter = {}) {
  const safeLimit = normalizeLimit(limit);
  return auditLog.filter((entry) => matchesFilter(entry, filter)).slice(-safeLimit).map((entry) => ({ ...entry }));
}
function exportGuardianAuditLog({ limit = auditCap, filter = {} } = {}) {
  const entries = getGuardianAuditLog(limit, filter);
  return { exportedAt: nowIso(), count: entries.length, entries };
}
function clearGuardianAuditLog(filter = null) {
  if (!filter) { const count = auditLog.length; auditLog.length = 0; return { cleared: count, remaining: 0 }; }
  let cleared = 0;
  for (let i = auditLog.length - 1; i >= 0; i -= 1) if (matchesFilter(auditLog[i], filter)) { auditLog.splice(i, 1); cleared += 1; }
  return { cleared, remaining: auditLog.length };
}
function configureGuardianAuditLogger({ maxEntries } = {}) {
  const n = Number(maxEntries);
  if (Number.isFinite(n) && n >= 50) { auditCap = Math.min(Math.floor(n), 5000); enforceCap(); }
  return getGuardianAuditLoggerInfo();
}
function getGuardianAuditLoggerInfo() {
  return { name: "guardian.audit.logger", version: VERSION, maxEntries: auditCap, currentEntries: auditLog.length, redactionEnabled: true, protectiveEscalationAuditVersion: PROTECTIVE_ESCALATION_AUDIT_VERSION };
}

module.exports = {
  VERSION,
  PROTECTIVE_ESCALATION_AUDIT_VERSION,
  logGuardianEvent,
  getGuardianAuditLog,
  exportGuardianAuditLog,
  clearGuardianAuditLog,
  configureGuardianAuditLogger,
  getGuardianAuditLoggerInfo,
  normalizeGuardian,
  normalizeRisk,
  normalizeType,
  cleanText,
  redactDeep,
  normalizeProtectiveEscalation
};
module.exports.default = module.exports;

/* R18B_SECURITY_PROTECTIVE_LAYER_HARDENING_START */
(function(){try{
  const V="nyx.marion.r18b.securityProtectiveLayer/1.0";
  const SECRET_KEY=/(token|secret|password|apikey|api_key|authorization|cookie|sessiontoken|runtimeToken|masterToken|credential|private[_-]?key)/i;
  const SECRET_TEXT=/(bearer\s+)[a-z0-9._~+/-]+=*|((?:token|secret|password|api[_-]?key|session[_-]?token|runtime[_-]?token|master[_-]?token|authorization)\s*[:=]\s*)[^\s,"'}]+/gi;
  function O(v){return !!v&&typeof v==="object"&&!Array.isArray(v)}
  function T(v,m){let s=String(v==null?"":v).replace(/[\u0000-\u001f\u007f]/g," ").replace(SECRET_TEXT,function(_,a,b){return (a||b||"")+"[REDACTED]"}).replace(/\s+/g," ").trim();m=Number(m)||1600;return s.length>m?s.slice(0,m-1).trim()+"…":s}
  function R(v,seen){if(v==null)return v;if(typeof v==="string")return T(v,4000);if(typeof v==="number"||typeof v==="boolean")return v;if(typeof v!=="object")return T(v,4000);seen=seen||new WeakSet();if(seen.has(v))return"[Circular]";seen.add(v);if(Array.isArray(v))return v.slice(0,80).map(x=>R(x,seen));const out={};Object.keys(v).forEach(k=>{out[k]=SECRET_KEY.test(k)?"[REDACTED]":R(v[k],seen)});return out}
  function txt(x){if(typeof x==="string")return x;if(!O(x))return"";return [x.command,x.intent,x.action,x.type,x.text,x.message,x.prompt,x.input,O(x.payload)&&x.payload.text,O(x.command)&&x.command.text].map(v=>T(v,500)).filter(Boolean).join(" ")}
  function sensitive(x){return /\b(approve|deny|emergency|escalat|delete|deploy|publish|send|payment|transfer|registry|role|owner|admin|voice delivery|private voice|runtime|disable|shutdown|kill switch|credential|token|secret)\b/i.test(txt(x))}
  function verified(ctx){ctx=O(ctx)?ctx:{};return ctx.adminVerified===true||ctx.mfaVerified===true||ctx.trustedServerAuth===true||ctx.serverSideAdminAuth===true||ctx.serverSideAdminVoiceAuth===true||ctx.ownerVerified===true}
  function boundary(input,context){const s=sensitive(input);const ok=verified(context)||verified(input);return {version:V,active:s||ok,macScoped:true,leastPrivilege:true,identityIsAuthority:false,voiceIdentityIsAuthority:false,challengeIsAuthority:false,continuityIsAuthority:false,authorityStillRequiresRBAC:true,explicitConfirmationRequired:s,noCovertMonitoring:true,noAutonomousEnforcement:true,noPunitiveAction:true,secretsRedacted:true,traceableAudit:true,adminSessionServerVerified:ok,approvalRequired:s&&!ok,reason:s&&!ok?"sensitive_action_requires_server_verified_admin_context":"protective_boundary_recorded"}}
  function apply(packet,input,context){if(!O(packet))return packet;const b=boundary(input||packet,context||{});packet.securityProtectiveLayer=Object.assign({},O(packet.securityProtectiveLayer)?packet.securityProtectiveLayer:{},b);packet.protectiveProtocol=Object.assign({},O(packet.protectiveProtocol)?packet.protectiveProtocol:{},{r18bSecurityProtectiveLayer:true,macScoped:true,leastPrivilege:true,explicitConfirmationRequired:b.explicitConfirmationRequired});packet.meta=Object.assign({},O(packet.meta)?packet.meta:{},{r18bSecurityProtectiveLayer:true,macScopedSecurityBoundary:true,secretsRedacted:true,noUserFacingDiagnostics:true});if(b.approvalRequired){packet.approvalRequired=true;packet.riskLevel=packet.riskLevel==="critical"?"critical":"high";}return R(packet)}
  function GP(args){args=Array.prototype.slice.call(args||[]);for(const a of args){if(typeof a==="string"&&a.trim())return {input:a,context:{}};if(O(a))return {input:a,context:O(args[1])?args[1]:{}}}return {input:{},context:{}}}
  function W(fn){if(typeof fn!=="function"||fn.__r18bSecurityProtectiveLayer)return fn;const w=function(){const g=GP(arguments);const r=fn.apply(this,arguments);return r&&typeof r.then==="function"?r.then(v=>apply(v,g.input,g.context)):apply(r,g.input,g.context)};Object.defineProperty(w,"__r18bSecurityProtectiveLayer",{value:true});return w}
  if(typeof MarionAdminConsoleGateway!=="undefined"&&MarionAdminConsoleGateway&&MarionAdminConsoleGateway.prototype&&!MarionAdminConsoleGateway.prototype.__r18bSecurityProtectiveLayer){
    const oldAuth=MarionAdminConsoleGateway.prototype.authorizeSession;
    if(typeof oldAuth==="function")MarionAdminConsoleGateway.prototype.authorizeSession=async function(request,context){context=O(context)?context:{};if(verified(context))return{allowed:true,reason:"r18b_server_verified_admin_context"};const hasProvider=this&&this.authProvider&&typeof this.authProvider.verify==="function";const res=await oldAuth.call(this,request,context);if(res&&res.allowed===true&&!hasProvider)return{allowed:false,reason:"r18b_rejected_bare_session_admin_claim_requires_outer_verification"};return res};
    ["handleCommand","dispatchCommand","routeCommand","command","handleAdminCommand","processCommand","executeRuntimeCommand","executeCommand","safeResponse","handleStatus"].forEach(n=>{if(typeof MarionAdminConsoleGateway.prototype[n]==="function")MarionAdminConsoleGateway.prototype[n]=W(MarionAdminConsoleGateway.prototype[n])});
    MarionAdminConsoleGateway.prototype.__r18bSecurityProtectiveLayer=true;
  }
  if(typeof module!=="undefined"&&module.exports&&typeof module.exports==="object"){
    ["logGuardianEvent","routeGuardianMessage","handleVoiceTranscript","handleMarionAdminConversation","handleLingoSentinelPrivateVoiceDelivery","createVoiceInputEnvelope","resolveVoiceSpeakerIdentity","applyVoiceSpeakerIdentityEnvelope","evaluateRechallengePolicy","requireFreshChallengeForOpen","issueChallenge","checkChallenge","evaluateChallengeEvidence","handleCommand","dispatchCommand","routeCommand","command","handleAdminCommand","processCommand","executeRuntimeCommand","executeCommand","safeResponse"].forEach(n=>{if(typeof module.exports[n]==="function")module.exports[n]=W(module.exports[n])});
    module.exports.MARION_SECURITY_PROTECTIVE_LAYER_VERSION=V;
    module.exports.buildSecurityProtectiveBoundary=boundary;
    module.exports.applySecurityProtectiveLayer=apply;
    module.exports.redactSecurityProtectivePayload=R;
  }
}catch(_){}})();
/* R18B_SECURITY_PROTECTIVE_LAYER_HARDENING_END */

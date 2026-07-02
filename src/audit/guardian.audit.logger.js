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
  function apply(packet,input,context){if(!O(packet))return packet;if(Object.isFrozen&&Object.isFrozen(packet))packet=Object.assign({},packet);const b=boundary(input||packet,context||{});packet.securityProtectiveLayer=Object.assign({},O(packet.securityProtectiveLayer)?packet.securityProtectiveLayer:{},b);packet.protectiveProtocol=Object.assign({},O(packet.protectiveProtocol)?packet.protectiveProtocol:{},{r18bSecurityProtectiveLayer:true,macScoped:true,leastPrivilege:true,explicitConfirmationRequired:b.explicitConfirmationRequired});packet.meta=Object.assign({},O(packet.meta)?packet.meta:{},{r18bSecurityProtectiveLayer:true,macScopedSecurityBoundary:true,secretsRedacted:true,noUserFacingDiagnostics:true});if(b.approvalRequired){packet.approvalRequired=true;packet.riskLevel=packet.riskLevel==="critical"?"critical":"high";}return R(packet)}
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


/* R18C_FINAL_RESPONSE_ENVELOPE_INTEGRATION_START */
(function(){try{
  const V="nyx.marion.r18c.finalResponseEnvelopeIntegration/1.0";
  function T(v,m){let s=v==null?"":String(v).replace(/\s+/g," ").trim();m=Number(m)||4000;return s.length>m?s.slice(0,m-1).trim()+"…":s}
  function N(v){return T(v,6000).toLowerCase().replace(/[’]/g,"'")}
  function O(v){return !!v&&typeof v==="object"&&!Array.isArray(v)}
  function A(v){return Array.isArray(v)?v:[]}
  function J(v){try{return typeof v==="string"?v:JSON.stringify(v||{}).slice(0,6000)}catch(_){return""}}
  function promptOf(args){args=Array.prototype.slice.call(args||[]);for(const v of args){if(typeof v==="string"&&T(v))return T(v);if(O(v)){const b=O(v.body)?v.body:{};const p=v.prompt||v.input||v.text||v.message||v.userText||v.query||v.command||v.normalizedUserIntent||b.prompt||b.input||b.text||b.message||b.userText;if(p)return T(p)}}return""}
  function packetText(o){if(!O(o))return T(o,6000);const m=O(o.meta)?o.meta:{};const r=O(o.result)?o.result:{};const fe=O(o.finalEnvelope)?o.finalEnvelope:(O(r.finalEnvelope)?r.finalEnvelope:{});return [o.prompt,o.input,o.text,o.message,o.userText,o.query,o.command,o.normalizedUserIntent,o.directReply,o.visibleReply,o.publicReply,o.reply,o.response,o.currentObjective,o.nextAction,o.activeFeatureLane,o.legalCategory,o.lawAssessmentFrame,m.activeFeatureLane,m.legalCategory,m.lawAssessmentFrame,fe.activeFeatureLane,fe.legalCategory,fe.lawAssessmentFrame,r.activeFeatureLane,r.legalCategory,r.lawAssessmentFrame].map(x=>T(x,800)).filter(Boolean).join(" ")}
  function isTechnicalLawFileWork(text){const t=N(text);return /\b(surgical autopsy|autopsy|critical autopsy|line[-\s]?by[-\s]?line|patch|update|resend|downloadable|zip package|package|files?|manifest|payloads?|registry|routing|domain router|domain registry|domain_runtime_priority_manifest|final response|final envelope|envelope integration|node --check|smoke test|json validation|structural integrity|architecture)\b/.test(t)&&/\b(law|legal|r18c|domain)\b/.test(t)}
  function isShortFollowup(text){return /^(?:next|next steps|what now|what's next|continue|keep going|carry on|proceed|pass|passed|locked|green|success)$/i.test(T(text).replace(/[.!?]+$/,""))}
  function hasLawCarry(text){return /\b(activeFeatureLane["']?\s*[:=]\s*["']?law|r18CLawRealWorldAssessment|lawAssessmentFrame|legalCategory|legalRiskLevel|lawCrossDomainSecondaryLane)\b/i.test(text)}
  function secLanes(t){const sec=[];if(/\b(ai|artificial intelligence|model|agent|llm|automation|prompt|tool)\b/i.test(t))sec.push("ai");if(/\b(cyber|security|identity|access|secret|credential|token|auth|permission|privacy|data protection|breach|incident)\b/i.test(t))sec.push("cyber");if(/\b(finance|revenue|tax|cost|grant|funding|valuation|royalty|ads|ad[-\s]?supported|moneti[sz])\b/i.test(t))sec.push("finance");if(/\b(business|client|vendor|platform|ott|ctv|roku|distribution|commercial|corporation|company)\b/i.test(t))sec.push("business");return Array.from(new Set(sec)).slice(0,4)}
  function lane(p){if(p.secondary.includes("ai")&&p.secondary.includes("cyber"))return"law_ai_cyber";if(p.secondary.includes("cyber"))return"law_cyber";if(p.secondary.includes("ai"))return"law_ai";if(p.secondary.includes("finance"))return"law_finance";if(p.secondary.includes("business"))return"law_business";return"law"}
  function category(t){t=N(t);if(/\b(police|criminal|arrest|charged|charge|warrant|search|seizure|charter section 8|right to counsel|detained)\b/.test(t))return"criminal_procedure";if(/\b(charter|constitutional|constitution|section 1|section 7|section 8|section 10|freedom of expression|equality rights)\b/.test(t))return"constitutional_charter";if(/\b(employment|employee|employer|fired|terminated|termination|severance|release|workplace|contractor|independent contractor|non[- ]?compete|non[- ]?solicit)\b/.test(t))return"employment_contractor";if(/\b(privacy|data protection|personal information|customer data|consent|pipeda|gdpr|security breach|breach notice|data processing)\b/.test(t))return"privacy_data";if(/\b(copyright|licen[cs]e|licensing|royalty|distribution rights|broadcast rights|content rights|sync rights|ott|ctv|roku|ad[-\s]?supported|moneti[sz])\b/.test(t))return"copyright_licensing";if(/\b(trademark|patent|intellectual property|\bip\b|brand mark|passing off)\b/.test(t))return"ip_trademark_patent";if(/\b(compliance|regulatory|regulation|permit|filing|statute|corporate|incorporation|bylaw|shareholder|director|officer)\b/.test(t))return"compliance_regulatory";if(/\b(liability|liable|lawsuit|sue|claim|damages|negligence|defamation|libel|slander|dispute|settlement|cease and desist|tort)\b/.test(t))return"liability_dispute";if(/\b(contract|agreement|nda|terms|indemnity|warranty|breach|clause|deliverable|scope of work|sow|consideration)\b/.test(t))return"contract";if(/\b(jurisdiction|court|tribunal|filing|procedure|venue|province|territory|federal|which source|canlii|case law|statute|research|source ladder|verify)\b/.test(t))return"jurisdiction_procedure";return"general_legal_risk"}
  function risk(t,cat){t=N(t);if(/\b(imminent|right now|today|deadline|limitation|court date|hearing|served|arrest|charged|police|criminal|warrant|subpoena|injunction|regulator investigation|fraud|illegal)\b/.test(t))return"critical";if(/\b(lawsuit|sue|claim|damages|infringement|breach|terminate|termination|release|indemnity|privacy breach|personal data|cease and desist|penalty|fine|defamation|employment)\b/.test(t))return"high";if(cat&&cat!=="general_legal_risk")return"medium";return"low"}
  function profile(prompt,obj){const visiblePrompt=T(prompt)||T(packetText(obj));const combined=[visiblePrompt,packetText(obj),J(obj)].join(" ");const technical=isTechnicalLawFileWork(visiblePrompt||combined);const carry=hasLawCarry(combined);const short=isShortFollowup(visiblePrompt);const lawTerm=/\b(law|legal|lawyer|attorney|counsel|court|sue|lawsuit|claim|liability|liable|negligence|damages|indemnity|contract|agreement|nda|terms|licen[cs]e|licensing|copyright|trademark|patent|intellectual property|\bip\b|royalty|distribution rights|broadcast rights|ott|ctv|roku|compliance|regulatory|regulation|jurisdiction|statute|privacy policy|data protection|consent|employment|employee|employer|fired|terminated|termination|severance|release|workplace|contractor|independent contractor|non[- ]?compete|non[- ]?solicit|lease|permit|filing|incorporation|shareholder|bylaw|charter|constitutional|criminal|police|defamation)\b/i.test(combined);const active=!technical&&(lawTerm||(short&&carry));const cat=category(combined);const secondary=secLanes(visiblePrompt||combined);const r=risk(combined,cat);return{active,technical,short,carry,category:cat,risk:r,secondary,lane:"",sourcePrompt:visiblePrompt};}
  function label(cat){return ({contract:"contract risk",copyright_licensing:"copyright/licensing risk",ip_trademark_patent:"IP/trademark/patent risk",compliance_regulatory:"compliance/regulatory risk",liability_dispute:"liability/dispute risk",employment_contractor:"employment/contractor risk",privacy_data:"privacy/data risk",corporate_business:"corporate/business risk",jurisdiction_procedure:"jurisdiction/procedure risk",criminal_procedure:"criminal/procedure risk",constitutional_charter:"constitutional/Charter issue",general_legal_risk:"general legal risk"})[cat]||"general legal risk"}
  function lawReply(p){const cat=label(p.category);let lead="I can frame this as general legal-risk triage, not legal advice.";if(p.short&&p.carry)lead="Next: keep the active law lane in the R18C frame — category, jurisdiction, facts vs assumptions, risk, missing information, source check, then safe next move.";let body="Category: "+cat+". Jurisdiction matters because procedure, deadlines, and remedies can shift by province, territory, court, tribunal, contract wording, or platform terms. Facts vs assumptions: separate what the documents actually say from what we think they allow. Risk exposure: "+(p.risk==="critical"?"critical/time-sensitive — do not rely on a generic answer for strategy.":p.risk==="high"?"high — source documents and professional review are strongly recommended before action.":"medium — verify the governing source before relying on it.")+" Missing information: jurisdiction, dates, complete agreement/policy/notice text, parties, platform/territory/scope, and any deadlines. Safe next move: preserve the documents, verify the governing source, and avoid signing, threatening, filing, publishing, or admitting anything until the risk is checked.";
    if(p.category==="copyright_licensing")body="Category: copyright/licensing risk. Jurisdiction and platform scope matter. Facts vs assumptions: separate the rights you actually hold from assumptions about OTT/CTV/Roku distribution, territory, format, term, sublicensing, and ad-supported monetization. Risk exposure: high if the paperwork does not clearly cover the exact use. Missing information: license grant, rights holder, territory, duration, monetization language, platform language, and termination clauses. Safe next move: verify the source agreement before publishing or monetizing.";
    else if(p.category==="employment_contractor")body="Category: employment/contractor risk. Jurisdiction matters because employment standards, common-law notice, contractor status, releases, and deadlines vary. Facts vs assumptions: separate the offer letter, contract, termination letter, release, pay records, and role history from assumptions about fairness. Risk exposure: high if a release or deadline is involved. Safe next move: do not sign under pressure; preserve the documents and get jurisdiction-specific review.";
    else if(p.category==="privacy_data")body="Category: privacy/data risk. Jurisdiction matters because privacy statutes, consent rules, breach duties, and vendor obligations vary. Facts vs assumptions: identify what data is involved, who controls/processes it, what the contract says, and whether a breach or transfer occurred. Risk exposure can become high if personal/customer data is exposed. Safe next move: verify the data-processing terms, security obligations, breach-notice language, and retention/deletion duties.";
    else if(p.category==="criminal_procedure")body="Category: criminal/procedure risk. This is high-stakes and jurisdiction-sensitive. Facts vs assumptions: separate what police did, what was said, whether there was detention/search/seizure, timing, and any paperwork. Risk exposure: critical if charges, arrest, a warrant, or a deadline is involved. Safe next move: document the timeline and speak to a lawyer or legal clinic before making statements or strategic choices.";
    return (lead+" "+body).replace(/\s+/g," ").trim();}
  function technicalReply(){return "Technical routing preserved: this is law-domain file work, not a user-facing legal-advice answer. Keep the surgery on the manifest, payloads, router/envelope behavior, structural integrity, validation, and downloadable package output.";}
  function meta(p){return{r18CFinalResponseEnvelopeIntegration:true,r18CLawRealWorldAssessment:p.active,lawAssessmentFrame:"category_jurisdiction_facts_assumptions_risk_missing_info_source_check_safe_next_move",legalCategory:p.category,jurisdictionSensitivity:p.active,legalAdviceBoundary:p.active?"general_information_legal_risk_triage_not_legal_advice":"not_active",legalRiskLevel:p.risk,legalRiskBoundary:{generalInformationOnly:true,notLegalAdvice:true,noAttorneyClientRelationship:true,noLegalCertainty:true,jurisdictionRequired:true,verifySourceDocuments:true,professionalReviewRecommended:p.risk==="high"||p.risk==="critical"},factsAssumptionsSeparated:p.active,professionalReviewRecommended:p.risk==="high"||p.risk==="critical",lawCrossDomainSecondaryLane:p.secondary.join("_")||"none",lawShortPromptLaneInheritance:!!(p.short&&p.carry),legalSourceDocumentCheckRequired:p.active,noLegalCertaintyClaim:true,noAttorneyClientRelationship:true,activeFeatureLane:p.active?lane(p):"",lawTechnicalSurgeryGuard:p.technical,visibleLawReplyPolicy:p.active?"r18c_structured_natural_non_advice":"preserve_existing"}}
  function badLawReply(s){return /\bLaw assessment:|legal-risk triage, not legal advice|category_jurisdiction_facts_assumptions|law assessment lane held\b/i.test(T(s,2000))}
  function shouldShape(existing,p){if(!p.active)return false;if(!T(existing))return true;if(/\b(AI lane active|Cyber lane|AI-cyber|verify identity, access, secrets|assess goal, context, data, risk)\b/i.test(existing))return true;if(!/\b(not legal advice|general legal information|legal-risk triage)\b/i.test(existing))return true;if(!/\b(jurisdiction|province|territory|court|tribunal|governing law)\b/i.test(existing))return true;return false}
  function apply(obj,prompt,depth){depth=depth||0;const p=profile(prompt,obj);p.lane=lane(p);if(typeof obj==="string"){if(p.technical&&badLawReply(obj))return technicalReply();return p.active?lawReply(p):obj}if(!O(obj)||depth>3)return obj;const x=Array.isArray(obj)?obj.slice():Object.assign({},obj);const fields=["directReply","visibleReply","publicReply","finalReply","reply","response","text","message","final","answer","displayReply","spokenText","speechText"];
    let existing="";for(const f of fields){if(typeof x[f]==="string"&&T(x[f])){existing=x[f];break}}
    if(p.technical&&badLawReply(existing)){["directReply","visibleReply","publicReply","reply","response","text","message"].forEach(f=>{if(Object.prototype.hasOwnProperty.call(x,f)||f==="directReply"||f==="visibleReply"||f==="publicReply"||f==="reply")x[f]=technicalReply()});x.activeFeatureLane="technical";}
    else if(shouldShape(existing,p)){const r=lawReply(p);["directReply","visibleReply","publicReply","reply","response","text","message"].forEach(f=>{if(Object.prototype.hasOwnProperty.call(x,f)||f==="directReply"||f==="visibleReply"||f==="publicReply"||f==="reply")x[f]=r});}
    ["finalEnvelope","marionFinal","result","payload","data","packet","synthesis","envelope"].forEach(f=>{if(O(x[f]))x[f]=apply(x[f],prompt,depth+1)});
    const m=meta(p);x.meta=Object.assign({},O(x.meta)?x.meta:{},m);if(p.active){Object.assign(x,m);x.activeFeatureLane=m.activeFeatureLane;x.currentObjective=T(x.currentObjective)||"Render R18C law final response with non-advice, jurisdiction-aware risk framing.";x.nextAction=T(x.nextAction)||"Confirm category, jurisdiction, facts, assumptions, risk, missing information, source check, and safe next move.";x.riskLevel=p.risk==="critical"?"critical":p.risk==="high"?"high":(x.riskLevel||"medium");if(p.risk==="high"||p.risk==="critical")x.approvalRequired=true;}else if(p.technical){x.lawTechnicalSurgeryGuard=true;x.r18CFinalResponseEnvelopeIntegration=true;}
    return x;}
  function wrap(fn){if(typeof fn!=="function"||fn.__r18cFinalEnvelopeIntegration)return fn;const w=function(){const p=promptOf(arguments);const out=fn.apply(this,arguments);return out&&typeof out.then==="function"?out.then(v=>apply(v,p,0)):apply(out,p,0)};Object.defineProperty(w,"__r18cFinalEnvelopeIntegration",{value:true});return w}
  if(typeof module!=="undefined"&&module.exports){if(typeof module.exports==="function")module.exports=wrap(module.exports);if(module.exports&&typeof module.exports==="object"){["composeMarionResponse","compose","buildReply","routeMarion","createMarionFinalEnvelope","attachVisibleReplyAliases","finalize","buildFinalEnvelope","toFinalEnvelope","normalizeFinalEnvelope","handleMarionAdminTextRuntime","invokeMarionAdminTextRuntime","handleTextRuntime","handleAdminConversation","handleCommand","dispatchCommand","routeCommand","command","handleAdminCommand","handleAdminConsoleAction","handle","process","run","handler","safeResponse","buildResponse","createResponse","normalizeResponse","adaptGuardianResponse","logGuardianEvent","rememberTurn","getGuardianMemory","getGuardianSnapshot","default"].forEach(n=>{if(typeof module.exports[n]==="function")module.exports[n]=wrap(module.exports[n])});module.exports.MARION_R18C_FINAL_RESPONSE_ENVELOPE_VERSION=V;module.exports.marionR18CFinalEnvelopeApply=apply;module.exports.marionR18CFinalEnvelopeProfile=profile;module.exports.marionR18CFinalEnvelopeReply=function(p){return lawReply(profile(p,{}))};module.exports.marionR18CTechnicalLawFileWork=isTechnicalLawFileWork;}}
}catch(_){}})();
/* R18C_FINAL_RESPONSE_ENVELOPE_INTEGRATION_END */


/* R18C_AUDIT_FINAL_RESPONSE_ENVELOPE_START */
(function(){try{
  const V="guardian.audit.logger/R18C-final-response-envelope/1.0";
  function T(v,m){let s=v==null?"":String(v).replace(/\s+/g," ").trim();m=Number(m)||3000;return s.length>m?s.slice(0,m-1).trim()+"…":s}
  function O(v){return !!v&&typeof v==="object"&&!Array.isArray(v)}
  function N(v){return T(v,5000).toLowerCase()}
  function J(v){try{return typeof v==="string"?v:JSON.stringify(v||{}).slice(0,5000)}catch(_){return""}}
  function technical(t){t=N(t);return /\b(surgical autopsy|autopsy|patch|update|files?|manifest|payload|registry|routing|zip|package|node --check|structural integrity|final envelope|envelope integration)\b/.test(t)&&/\b(law|legal|r18c|domain)\b/.test(t)}
  function cat(t){t=N(t);if(/\b(police|criminal|arrest|warrant|search|seizure|charter)\b/.test(t))return"criminal_procedure";if(/\b(employment|employee|fired|terminated|severance|release|contractor)\b/.test(t))return"employment_contractor";if(/\b(privacy|data protection|personal information|customer data|breach notice)\b/.test(t))return"privacy_data";if(/\b(copyright|licen[cs]e|royalty|distribution rights|broadcast rights|ott|ctv|roku|moneti[sz])\b/.test(t))return"copyright_licensing";if(/\b(trademark|patent|intellectual property|\bip\b)\b/.test(t))return"ip_trademark_patent";if(/\b(liability|lawsuit|sue|claim|damages|negligence|defamation|dispute)\b/.test(t))return"liability_dispute";if(/\b(contract|agreement|nda|terms|indemnity|clause|consideration)\b/.test(t))return"contract";if(/\b(compliance|regulatory|regulation|permit|filing|statute|corporate)\b/.test(t))return"compliance_regulatory";return"general_legal_risk"}
  function law(t){return /\b(law|legal|court|sue|lawsuit|claim|liability|contract|agreement|licen[cs]e|copyright|trademark|patent|privacy|data protection|employment|employee|employer|fired|terminated|termination|severance|release|workplace|contractor|charter|criminal|police|defamation|jurisdiction|statute)\b/i.test(t)}
  function enrich(e){if(!O(e))return e;const txt=[e.type,e.action,e.prompt,e.input,e.text,e.message,e.directReply,e.reply,e.currentObjective,e.nextAction,J(e.meta)].join(" ");const isTech=technical(txt);const active=!isTech&&law(txt);const meta=Object.assign({},O(e.meta)?e.meta:{});meta.r18CFinalResponseEnvelopeIntegration=true;meta.lawTechnicalSurgeryGuard=isTech;meta.r18CLawRealWorldAssessment=active;meta.legalCategory=active?cat(txt):(meta.legalCategory||"");meta.legalAdviceBoundary=active?"general_information_legal_risk_triage_not_legal_advice":(isTech?"technical_law_file_work_not_legal_answer":"not_active");meta.noLegalCertaintyClaim=true;meta.noAttorneyClientRelationship=true;meta.auditVisibleToUser=false;e.meta=meta;if(active){e.type=e.type||"r18c_law_final_response";e.riskLevel=e.riskLevel||(/\b(deadline|arrest|court date|injunction|fine|privacy breach|lawsuit|fired|release)\b/i.test(txt)?"high":"medium");}return e}
  const old=module.exports&&module.exports.logGuardianEvent;if(typeof old==="function"&&!old.__r18cAuditFinalEnvelope){const fn=function(event){return old.call(this,enrich(event||{}))};Object.defineProperty(fn,"__r18cAuditFinalEnvelope",{value:true});module.exports.logGuardianEvent=fn;}
  if(module.exports&&typeof module.exports==="object"){module.exports.MARION_R18C_AUDIT_FINAL_RESPONSE_VERSION=V;module.exports.enrichR18CLawAuditEvent=enrich;}
}catch(_){}})();
/* R18C_AUDIT_FINAL_RESPONSE_ENVELOPE_END */



/* R18C_FULL_STACK_REGRESSION_HARMONIZER_START */
(function(){
  try {
    const V = "nyx.marion.r18c.fullStackRegression/1.0";
    function T(v, max){ let s = v == null ? "" : String(v).replace(/\s+/g," ").trim(); if(max && s.length > max) s = s.slice(0, max - 1).trim() + "…"; return s; }
    function O(v){ return v && typeof v === "object" && !Array.isArray(v) ? v : {}; }
    function A(v){ return Array.isArray(v) ? v : []; }
    function lower(v){ return T(v, 4000).toLowerCase(); }
    function firstText(){
      for (let i = 0; i < arguments.length; i += 1) {
        const v = T(arguments[i], 4000);
        if (v) return v;
      }
      return "";
    }
    function extractText(packet){
      const p = O(packet), payload = O(p.payload), meta = O(p.meta), session = O(p.session), body = O(p.body);
      return firstText(p.text, p.userText, p.rawUserText, p.message, p.prompt, p.normalizedUserIntent,
        payload.text, payload.userText, payload.rawUserText, payload.message, payload.prompt,
        meta.text, meta.userText, meta.rawUserText, session.lastUserText, body.text, body.userText);
    }
    function r18cTechnicalLawFileWork(text){
      const t = lower(text);
      return /\b(surgical\s+autopsy|autopsy|patch|fix|update|harden|audit|line[-\s]?by[-\s]?line|node\s+--check|zip|downloadable|resend|script|file|files|js|json|manifest|payload|pack|runtime|router|routing|registry|domain\s+router|domain\s+registry|domain\s+concierge|composemarionresponse|marionbridge|final\s+envelope|state\s+spine|chatengine|index\.js)\b/.test(t) &&
        /\b(law|legal|contract|contracts|manifest|payload|domain)\b/.test(t);
    }
    function r18cShortLawFollowup(text, ctx){
      const t = lower(text).replace(/[.!?]+$/g,"").trim();
      if (!/^(next|next steps|continue|keep going|carry on|what next|what now|then what|passed|pass|locked)$/.test(t)) return false;
      const c = JSON.stringify(ctx || {}).toLowerCase();
      return /\b(activefeaturelane|knowledgeDomain|primaryDomain|selectedDomain|domain|route|lastTopic|currentObjective)\b/.test(c) &&
        /\b(law|legal|contract|copyright|licensing|liability|compliance|jurisdiction)\b/.test(c);
    }
    function r18cDetectLawCategories(text){
      const t = lower(text);
      const out = [];
      if (/\b(copyright|license|licence|licensing|distribution rights?|broadcast rights?|streaming rights?|public performance|sync rights?|roku|ott|movie|movies|moneti[sz]e|platform rights?)\b/.test(t)) out.push("copyright_licensing");
      if (/\b(fired|terminated|termination|severance|release to sign|sign the release|two weeks|employment|employee|employer|contractor|independent contractor|wrongful dismissal|constructive dismissal|without cause)\b/.test(t)) out.push("employment_contractor");
      if (/\b(defamation|libel|slander|false claims?|false statements?|posted false|business online|reputation|negligence|liable|liability|lawsuit|sue|damages|injury|harm|tort)\b/.test(t)) out.push("liability_dispute");
      if (/\b(customer data|personal information|personal data|privacy|data processing|vendor data|pipeda|data breach|consent|processor|controller|dpa|confidential information)\b/.test(t)) out.push("privacy_data");
      if (/\b(trademark|trade mark|patent|intellectual property|\bip\b|brand rights?|logo|mark infringement)\b/.test(t)) out.push("ip_trademark_patent");
      if (/\b(compliance|regulatory|regulation|policy|terms of service|platform terms|statute|act|legal requirement)\b/.test(t)) out.push("compliance_regulatory");
      if (/\b(corporation|incorporated|shareholder|director|officer|bylaws|articles|corporate|business structure)\b/.test(t)) out.push("corporate_business");
      if (/\b(jurisdiction|province|territory|court|tribunal|deadline|limitation|file|filing|procedure|serve|served|hearing)\b/.test(t)) out.push("jurisdiction_procedure");
      if (/\b(contract|agreement|clause|terms|breach|enforceable|consideration|promise|release|waiver|indemnity|distribution rights?)\b/.test(t)) out.push("contract");
      if (/\b(source|sources|verify|verification|case law|canlii|statute|regulation|official source|research)\b/.test(t)) out.push("source_verification");
      if (!out.length && /\b(law|legal|rights?|obligation|permitted|allowed|can i|should i sign|safe to)\b/.test(t)) out.push("general_legal_risk");
      const priority = ["employment_contractor","copyright_licensing","privacy_data","liability_dispute","ip_trademark_patent","compliance_regulatory","jurisdiction_procedure","corporate_business","contract","source_verification","general_legal_risk"];
      return Array.from(new Set(out)).sort((a,b)=>priority.indexOf(a)-priority.indexOf(b));
    }
    function r18cSecondaryDomains(text, cats){
      const t = lower(text), out = [];
      if (/\b(roku|ott|streaming|movie|movies|channel|platform|distribution)\b/.test(t)) out.push("business","roku");
      if (/\b(moneti[sz]e|revenue|cost|price|pay|severance|settlement|damages|commercial|business|sandblast)\b/.test(t)) out.push("finance","business");
      if (cats.indexOf("privacy_data") >= 0 || /\b(data|privacy|security|breach|access|vendor)\b/.test(t)) out.push("cyber");
      if (/\b(ai|model|automation|agent|llm)\b/.test(t)) out.push("ai");
      return Array.from(new Set(out.filter(x => x && x !== "law"))).slice(0,4);
    }
    function r18cIsLaw(text, ctx){
      if (r18cTechnicalLawFileWork(text)) return false;
      const cats = r18cDetectLawCategories(text);
      if (cats.length && !(cats.length === 1 && cats[0] === "general_legal_risk" && !/\b(law|legal|rights|liability|contract|copyright|license|employment|fired|defamation|privacy|compliance|jurisdiction|safe to|permitted|allowed)\b/i.test(T(text)))) return true;
      return r18cShortLawFollowup(text, ctx);
    }
    function r18cProfile(text, ctx){
      const cats = r18cDetectLawCategories(text);
      const shortCarry = r18cShortLawFollowup(text, ctx);
      const category = cats[0] || (shortCarry ? "general_legal_risk" : "");
      const secondary = r18cSecondaryDomains(text, cats);
      return {
        version: V,
        active: !!(category || shortCarry),
        domain: "law",
        primaryDomain: "law",
        selectedDomain: "law",
        knowledgeDomain: "law",
        legalCategory: category || "general_legal_risk",
        legalCategories: cats.length ? cats : ["general_legal_risk"],
        secondaryDomains: secondary,
        confidence: shortCarry ? 0.82 : 0.94,
        confidenceScore: shortCarry ? 0.82 : 0.94,
        band: "high",
        confidenceBand: "high",
        margin: shortCarry ? 0.18 : 0.32,
        answerMode: "grounded",
        highStakes: true,
        routeLocked: true,
        failClosed: false,
        needsClarifier: false,
        reason: shortCarry ? "r18c_law_short_prompt_lane_inheritance" : "r18c_full_stack_law_precedence",
        assessmentFrame: ["legal_category","jurisdiction_sensitivity","facts_vs_assumptions","risk_exposure","missing_information","source_document_check","safe_next_move"],
        legalBoundary: {
          generalInformationOnly: true,
          noLegalAdvice: true,
          noAttorneyClientRelationship: true,
          noLegalCertaintyClaim: true,
          jurisdictionRequired: true,
          sourceDocumentReviewRequired: true,
          professionalReviewRecommendedForHighRisk: true
        },
        noCrossDomainBleed: true,
        noUserFacingDiagnostics: true,
        r18cFullStackRegression: true,
        fullStackAgreementRequired: true
      };
    }
    function r18cMergeLawProfile(target, profile){
      const out = O(target);
      if (!profile || !profile.active) return out;
      out.domain = "law";
      out.primaryDomain = "law";
      out.selectedDomain = "law";
      out.knowledgeDomain = "law";
      out.legalCategory = profile.legalCategory;
      out.legalCategories = profile.legalCategories;
      out.secondaryDomains = profile.secondaryDomains;
      out.answerMode = "grounded";
      out.highStakes = true;
      out.routeLocked = true;
      out.needsClarifier = false;
      out.failClosed = false;
      out.r18cLawAssessment = Object.assign({}, O(out.r18cLawAssessment), profile);
      out.r18cFullStackRegression = true;
      out.noCrossDomainBleed = true;
      out.noUserFacingDiagnostics = true;
      return out;
    }
    const api = { V, T, O, A, extractText, r18cTechnicalLawFileWork, r18cShortLawFollowup, r18cDetectLawCategories, r18cSecondaryDomains, r18cIsLaw, r18cProfile, r18cMergeLawProfile };
    module.exports.MARION_R18C_FULL_STACK_REGRESSION_VERSION = V;
    module.exports.marionR18CFullStackHelpers = api;
    module.exports.marionR18CFullStackProfile = function(packet){
      const text = extractText(packet);
      return r18cProfile(text, packet);
    };
    module.exports.marionR18CFullStackIsLawTurn = function(packet){
      const text = extractText(packet);
      return r18cIsLaw(text, packet);
    };
    module.exports.marionR18CFullStackTechnicalLawFileWork = function(packet){
      return r18cTechnicalLawFileWork(extractText(packet));
    };
  } catch(_err) {}
})();
/* R18C_FULL_STACK_REGRESSION_HARMONIZER_END */

/* R18C_FULL_STACK_FINAL_METADATA_WRAP_START */
(function(){
  try {
    const H = module.exports.marionR18CFullStackHelpers;
    if (!H || module.exports.__r18cFullStackFinalMetadataWrapped) return;
    const oldApply = module.exports.marionR18CFinalEnvelopeApply;
    const oldProfile = module.exports.marionR18CFinalEnvelopeProfile;
    module.exports.marionR18CFullStackEnvelopeProfile = function(packet){
      const text = H.extractText(packet);
      const p = H.r18cProfile(text, packet);
      return Object.assign({}, p, {
        visibleReplyPolicy: "jurisdiction_aware_legal_risk_triage",
        fullStackAgreementRequired: true,
        technicalLawFileWorkGuard: H.r18cTechnicalLawFileWork(text)
      });
    };
    if (typeof oldProfile === "function") {
      module.exports.marionR18CFinalEnvelopeProfile = function(packet){
        const base = oldProfile.apply(this, arguments);
        const text = H.extractText(packet);
        if (!H.r18cIsLaw(text, packet)) return base;
        return Object.assign({}, H.O(base), module.exports.marionR18CFullStackEnvelopeProfile(packet));
      };
    }
    if (typeof oldApply === "function") {
      module.exports.marionR18CFinalEnvelopeApply = function(packet){
        const base = oldApply.apply(this, arguments);
        const text = H.extractText(packet);
        if (!H.r18cIsLaw(text, packet)) return base;
        const p = module.exports.marionR18CFullStackEnvelopeProfile(packet);
        return H.r18cMergeLawProfile(Object.assign({}, H.O(base), {
          r18CLawRealWorldAssessment: true,
          lawAssessmentFrame: p.assessmentFrame.join(" > "),
          legalAdviceBoundary: "general_information_not_legal_advice",
          factsAssumptionsSeparated: true,
          professionalReviewRecommended: true,
          legalSourceDocumentCheckRequired: true,
          noLegalCertaintyClaim: true,
          noAttorneyClientRelationship: true
        }), p);
      };
    }
    module.exports.__r18cFullStackFinalMetadataWrapped = true;
  } catch(_err) {}
})();
/* R18C_FULL_STACK_FINAL_METADATA_WRAP_END */

/* R18C_FULL_STACK_AUDIT_ENRICH_WRAP_START */
(function(){
  try {
    const H = module.exports.marionR18CFullStackHelpers;
    if (!H || module.exports.__r18cFullStackAuditWrapped) return;
    const oldLog = module.exports.logGuardianEvent;
    if (typeof oldLog === "function") {
      module.exports.logGuardianEvent = function(event){
        if (event && typeof event === "object") {
          const text = H.extractText(event);
          if (H.r18cIsLaw(text, event)) {
            const p = H.r18cProfile(text, event);
            event.r18cLawAssessment = p;
            event.legalCategory = p.legalCategory;
            event.legalAdviceBoundary = "general_information_not_legal_advice";
            event.noLegalCertaintyClaim = true;
            event.noAttorneyClientRelationship = true;
            event.noUserFacingDiagnostics = true;
          }
        }
        return oldLog.apply(this, arguments);
      };
    }
    module.exports.__r18cFullStackAuditWrapped = true;
  } catch(_err) {}
})();
/* R18C_FULL_STACK_AUDIT_ENRICH_WRAP_END */


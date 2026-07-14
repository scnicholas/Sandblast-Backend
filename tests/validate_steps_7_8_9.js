
"use strict";
const assert = require("assert");
const path = require("path");

const root = process.argv[2];
const sitebridge = require(path.join(root, "sitebridge.js"));
const domain = require(path.join(root, "Data/marion/runtime/DomainConcierge.js"));
const adapter = require(path.join(root, "Data/marion/runtime/nyx_pack_runtime_adapter.js"));
const composer = require(path.join(root, "Data/marion/runtime/composeMarionResponse.js"));

let n = 0;
function ok(cond, msg) { assert.ok(cond, msg); n += 1; }
function eq(a,b,msg) { assert.deepStrictEqual(a,b,msg); n += 1; }

ok(typeof sitebridge.buildGuideActionPlan === "function", "sitebridge action plan");
ok(typeof sitebridge.buildPublicPreferenceEnvelope === "function", "sitebridge prefs");
ok(typeof sitebridge.sanitizeNyxGuideTelemetryEvent === "function", "sitebridge telemetry");

let plan = sitebridge.buildGuideActionPlan({
  actions: [
    {type:"open_tv", target:"sandblast_classics", label:"Open Classics"},
    {type:"navigate", target:"https://evil.example", label:"Bad"},
    {type:"play_radio", target:"sandblast_radio"},
    {type:"play_radio", target:"sandblast_radio"}
  ]
});
eq(plan.contract, "nyx.guideActionPlan/1.0", "plan contract");
eq(plan.actionCount, 2, "valid deduped actions");
eq(plan.rejectedCount, 1, "bad URL rejected");
eq(plan.duplicateCount, 1, "duplicate rejected");
ok(plan.actions.every(a => a.requiresUserGesture && !a.autoExecute && !a.serverExecutionAllowed), "gesture hardlock");
ok(plan.actions.every(a => !String(a.target).includes("://")), "symbolic targets");
eq(plan.actions[0].target, "sandblast_classics", "exact target preserved");

let tvPlan = sitebridge.buildGuideActionPlan({
  televisionGuide:{enabled:true,maxActions:4},
  actions:[
    {type:"navigate",target:"sandblast_home"},
    {type:"open_tv",target:"sandblast_tv"},
    {type:"open_tv",target:"sandblast_cartoons"},
    {type:"open_tv",target:"sandblast_classics"},
    {type:"open_roku",target:"sandblast_roku"}
  ]
});
eq(tvPlan.actionCount, 4, "tv action ceiling");
ok(tvPlan.actions.every(a => a.remoteSafe === true), "tv remote safe");

let prefs = sitebridge.buildPublicPreferenceEnvelope({
  preferenceIntent:{
    explicit:true,
    rememberPreferences:true,
    changes:{voiceEnabled:false,textOnly:true,reducedMotion:true,preferredLanguage:"fr-CA"}
  },
  consentGranted:true
});
eq(prefs.contract, "nyx.publicPreferences/1.0", "prefs contract");
eq(prefs.consentGranted, true, "consent");
eq(prefs.storage, "client_persistent", "persistent client storage");
eq(prefs.serverStored, false, "not server stored");
eq(prefs.privateMemoryAccess, false, "no private memory");
eq(prefs.preferences.voiceEnabled, false, "voice pref");
eq(prefs.preferences.preferredLanguage, "fr-CA", "language normalized");
ok(prefs.expiresAt > prefs.updatedAt, "prefs expire");

let sessionPrefs = sitebridge.buildPublicPreferenceEnvelope({
  preferences:{voiceEnabled:true},
  consentGranted:false
});
eq(sessionPrefs.storage, "client_session", "session default");
eq(sessionPrefs.rememberPreferences, false, "no implicit remember");

let cleared = sitebridge.buildPublicPreferenceEnvelope({clearRequested:true});
eq(cleared.clearRequested, true, "clear request");
eq(Object.keys(cleared.preferences).length, 0, "clear prefs");

let telemetry = sitebridge.sanitizeNyxGuideTelemetryEvent({
  event:"nyx_action_completed",
  surface:"sandblast.tv",
  actionType:"open_tv",
  target:"sandblast_classics",
  success:true,
  durationMs:83,
  traceId:"trace-1",
  message:"SHOULD NOT SURVIVE",
  token:"SHOULD NOT SURVIVE"
});
eq(telemetry.contract, "nyx.guideTelemetryEvent/1.0", "telemetry contract");
ok(!("message" in telemetry), "no message");
ok(!("token" in telemetry), "no token");
eq(telemetry.diagnosticsRedacted, true, "redacted");

ok(typeof domain.buildNyxGuideStep789ActionPlan === "function", "domain action helper");
let inferred = domain.buildNyxGuideStep789ActionPlan("Open the classics and then take me to Roku.", {});
ok(inferred.actions.some(a => a.target === "sandblast_classics"), "classics inferred");
ok(inferred.actions.some(a => a.target === "sandblast_roku"), "roku inferred");
ok(inferred.actions.every(a => a.requiresUserGesture), "domain gestures");

ok(typeof domain.buildNyxPublicPreferenceIntent === "function", "domain preference helper");
let prefIntent = domain.buildNyxPublicPreferenceIntent("Turn voice off, use reduced motion, and remember my settings.");
eq(prefIntent.explicit, true, "preference explicit");
eq(prefIntent.changes.voiceEnabled, false, "voice off intent");
eq(prefIntent.changes.reducedMotion, true, "motion intent");
eq(prefIntent.rememberPreferences, true, "remember intent");

ok(typeof adapter.sanitizeNyxPacketGuideActionPlan === "function", "adapter action sanitizer");
let packetPlan = adapter.sanitizeNyxPacketGuideActionPlan({
  actions:[
    {type:"navigate",target:"sandblast_home"},
    {type:"navigate",target:"javascript:alert(1)"}
  ]
});
eq(packetPlan.actionCount, 1, "adapter rejects unsafe target");
eq(packetPlan.packetAuthority || false, false, "packet no authority");

ok(typeof adapter.attachNyxPacketGuideSteps789 === "function", "adapter attach");
let packetResult = adapter.attachNyxPacketGuideSteps789({
  ok:true,
  reply:"Marion final stays intact.",
  guideActionPlan:{actions:[{type:"open_tv",target:"sandblast_tv",label:"Open TV"}]}
}, {});
eq(packetResult.reply, "Marion final stays intact.", "adapter reply preserved");
eq(packetResult.packetGuideReplyAuthority, false, "packet reply authority false");
eq(packetResult.guideActionPlan.actionCount, 1, "packet plan attached");

ok(typeof composer.attachNyxGuideSteps789ToResponse === "function", "composer attach");
let composed = composer.attachNyxGuideSteps789ToResponse({
  ok:true,
  reply:"Your program is ready."
}, {
  userText:"Open Sandblast Classics",
  guideActionPlan:inferred,
  publicPreferenceIntent:prefIntent
});
eq(composed.reply, "Your program is ready.", "composer reply unchanged");
ok(composed.guideActionPlan.actionCount >= 1, "composer action carry");
eq(composed.guideActionPlan.serverExecutionAllowed, false, "composer no execution");
eq(composed.publicPreferences.serverStored, false, "composer prefs client only");
eq(composed.meta.actionExecutionAuthority, "client_user_gesture", "composer action authority");

let built = sitebridge.build({
  sessionId:"public-test",
  guideContext:{surface:"sandblast.channel",lane:"home"},
  actions:[{type:"open_roku",target:"sandblast_roku"}],
  preferenceIntent:{explicit:true,changes:{captionsEnabled:true}}
});
eq(built.version.includes("v5.0"), true, "build upgraded");
eq(built.guideActionPlan.actionCount, 1, "build action plan");
eq(built.guideShell.step7ActionOrchestration, true, "step7");
eq(built.guideShell.step8ConsentBoundPreferences, true, "step8");
eq(built.guideShell.step9ProductionHardening, true, "step9");
eq(built.nonAuthority, true, "sitebridge nonauthority");
eq(built.finalReplyAuthority, false, "sitebridge no final authority");

const indexSource = require("fs").readFileSync(path.join(root,"index.js"),"utf8");
for (const marker of [
  "NYX_GUIDE_ORCHESTRATION_STEPS_7_8_9_R1_START",
  "/api/nyx/guide/actions/validate",
  "/api/nyx/guide/preferences/normalize",
  "/api/nyx/guide/preferences/reset",
  "/api/nyx/guide/telemetry",
  "/api/nyx/guide/release/health",
  "actionsServerExecuted: false",
  "preferencesServerStored: false",
  "rawConversationLogged: false",
  "tokensExposed: false",
  "nativeRokuSceneGraphModified: false"
]) {
  ok(indexSource.includes(marker), "index marker " + marker);
}
ok(indexSource.includes("SB_NYX_GUIDE_ROLLBACK_SAFE_MODE"), "rollback flag");
ok(indexSource.includes("SB_NYX_GUIDE_MAX_BODY_BYTES"), "payload flag");
ok(indexSource.includes("SB_NYX_GUIDE_RATE_LIMIT_PER_MINUTE"), "rate flag");
ok(indexSource.includes("origin_not_allowed"), "origin hardening");
ok(indexSource.includes("guide_payload_too_large"), "payload hardening");
ok(indexSource.includes("guide_rate_limited"), "rate hardening");

console.log(JSON.stringify({ok:true, assertions:n}));

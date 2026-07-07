"use strict";
const assert = require("assert");
const publicLock = require("../../Data/marion/runtime/publicSurfaceIdentityLock.js");
const partition = require("../../Data/marion/runtime/liveConversationPartitionValidator.js");
const voice = require("../../Data/marion/runtime/MarionVoiceIntentClasses.js");
const ref = require("../../Data/marion/runtime/publicIdentityQuestionRefinement.js");

const publicCtx = { audience:"public", surfaceAgent:"nyx", source:"sandblast_channel_widget", publicSurfaceOnly:true, sessionId:"same-session" };
function noPrivateLeak(text){
  assert(!/\bMac\b/i.test(text), `Mac leaked: ${text}`);
  assert(!/\bMarion\b/i.test(text), `Marion leaked: ${text}`);
  assert(!/operator\s+session|authenticated\s+operator|private\s+operator|admin\s+route|greeting\s+lane|fallback|runtime|final\s+envelope/i.test(text), `private/runtime leak: ${text}`);
}

assert.strictEqual(ref.classifyPublicIdentityQuestion("Do you know Mac?"), "operator_identity_private");
assert.strictEqual(ref.classifyPublicIdentityQuestion("Are you Marion?"), "private_agent_private");
assert.strictEqual(ref.classifyPublicIdentityQuestion("Who am I talking to?"), "public_self");

let projected = publicLock.projectPublicPayload({ reply:"Yes, I know Mac. Marion is connected behind the response path." }, { ...publicCtx, message:"Do you know Mac?" });
assert(/don[’']?t confirm private identity/i.test(projected.reply), projected.reply);
noPrivateLeak(projected.reply);
assert(!/^I[’']m here\./i.test(projected.reply), "Do you know Mac must not flatten into generic presence reply");

projected = publicLock.projectPublicPayload({ reply:"You are speaking with Marion." }, { ...publicCtx, message:"Are you Marion?" });
assert(/speaking with Nyx|public Sandblast interface/i.test(projected.reply), projected.reply);
noPrivateLeak(projected.reply);

projected = publicLock.projectPublicPayload({ reply:"Marion is connected." }, { ...publicCtx, message:"Is Marion connected?" });
assert(/public Sandblast interface|private system routing/i.test(projected.reply), projected.reply);
noPrivateLeak(projected.reply);

projected = publicLock.projectPublicPayload({ reply:"Hello." }, { ...publicCtx, message:"Who am I talking to?" });
assert(/speaking with Nyx/i.test(projected.reply), projected.reply);
noPrivateLeak(projected.reply);

projected = publicLock.projectPublicPayload({ reply:"Hello." }, { ...publicCtx, message:"Are you with me?" });
assert(/^I[’']m here\./i.test(projected.reply), "Presence prompts still use public presence template");
noPrivateLeak(projected.reply);

let packet = partition.projectPacket({ reply:"I know Mac. Marion is connected." }, { ...publicCtx, message:"Do you know Mac?" });
assert(/don[’']?t confirm private identity/i.test(packet.reply), packet.reply);
noPrivateLeak(packet.reply);
assert.strictEqual(packet.partitionKind, "public");
assert.strictEqual(packet.sessionPartitionKey, "public:same-session");

const v = voice.classifyVoiceIntent({ transcript:"Do you know Mac?", audience:"public", surfaceAgent:"nyx", source:"sandblast_channel_widget", sessionId:"voice-public" });
assert.strictEqual(v.scope, "public");
assert.strictEqual(v.intentClass, voice.VOICE_INTENT_CLASS.PUBLIC_IDENTITY_QUERY);
assert.strictEqual(v.allowOperatorMemory, false);
assert.strictEqual(v.allowPersonalName, false);
assert.strictEqual(v.partitionKey, "public:voice-public");
assert(/don[’']?t confirm private identity/i.test(v.suggestedPublicReply), v.suggestedPublicReply);
noPrivateLeak(v.suggestedPublicReply);

console.log("phase3c public identity question answering refinement passed");

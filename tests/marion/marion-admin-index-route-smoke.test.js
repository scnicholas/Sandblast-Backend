"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const indexPath = path.join(__dirname, "..", "..", "index.js");
const src = fs.readFileSync(indexPath, "utf8");

assert(src.includes("MARION_ADMIN_CONVERSATION_ROUTE_VERSION"), "missing admin conversation version");
assert(src.includes('"/api/marion/admin/conversation"'), "missing canonical admin POST route");
assert(src.includes('"/api/marion/admin/conversation/health"'), "missing admin health route");
assert(src.includes("marionAdminConversationRequestAuth(req)"), "missing header-only admin auth call");
assert(src.includes("handleMarionAdminConversation"), "missing gateway admin handler invocation");
assert(src.includes("publicUsersMayAddressMarion: false"), "missing public Marion boundary marker");
assert(src.includes("publicUsersSpeakThrough: \"Nyx\""), "missing Nyx public boundary marker");
assert(src.includes("silentOversight: true"), "missing LingoSentinel silent oversight marker");
assert(src.includes("marionVisibleParticipant: false"), "missing Marion invisible participant marker");
assert(src.includes("noRawAudioStored: true"), "missing no raw audio marker");

const authFnStart = src.indexOf("function marionAdminConversationRequestAuth(req)");
assert(authFnStart >= 0, "auth helper missing");
const authFnEnd = src.indexOf("function marionAdminConversationRuntimeDiagnostics", authFnStart);
const authFn = src.slice(authFnStart, authFnEnd);
assert(!/req\.body|body\.|token\s*=\s*body/i.test(authFn), "admin auth helper must not trust body tokens");
assert(/x-sb-marion-admin-conversation-token/.test(authFn), "missing admin conversation header");
assert(/x-sb-marion-admin-token/.test(authFn), "missing admin header");

assert(!src.includes("<<<<<<<"), "merge conflict marker found");
assert(!src.includes(">>>>>>>"), "merge conflict marker found");
assert(!src.includes("======="), "merge conflict marker found");

console.log("PASS marion-admin-index-route-smoke");

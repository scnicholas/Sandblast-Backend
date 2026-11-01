'use strict';
const fs=require('fs'),vm=require('vm'),assert=require('assert'),crypto=require('crypto');
const text=fs.readFileSync(__dirname+'/index.js','utf8');
function extract(start, next){const s=text.indexOf(start);assert(s>=0,start);const e=text.indexOf(next,s+start.length);assert(e>s,next);return text.slice(s,e)}
const helpers=extract('function marionAdminConsoleEnvTokens() {','function marionAdminConsoleMfaTokens()')+'\n'+extract('function marionAdminConsoleEnvTokensForNames(names) {','function marionAdminConsoleRoleTokenEntries()');
const env={SB_MARION_ADMIN_CONSOLE_TOKEN:'ab  cd', MARION_ADMIN_TOKEN:''};
const ctx={process:{env},uniq:(a)=>[...new Set(a)], cleanText:(a)=>String(a).replace(/\s+/g,' ').trim()};
vm.createContext(ctx);vm.runInContext(helpers,ctx);
assert.equal(ctx.marionAdminConsoleEnvTokens()[0],'ab  cd');
assert.equal(ctx.marionAdminConsoleEnvTokensForNames(['SB_MARION_ADMIN_CONSOLE_TOKEN'])[0],'ab  cd');
assert.notEqual(ctx.marionAdminConsoleEnvTokens()[0],'ab cd');
assert(text.includes('reply: authoritativeRuntimeReply,'));
assert(text.includes('marionAdminBuildPrivateVoiceReceivePacket(authoritativeRuntimeReply,'));
assert(text.includes('marionAdminProjectVoiceEnvelope(authoritativeRuntimeReply,'));
assert(text.includes('runtime_response_construction'));
assert(text.includes('statusCode: runtimeReplyAccepted ? 200 : 502'));
assert(text.includes('authReason: cleanText(auth && (auth.reason || auth.sessionReason || auth.testingBypassReason)'));
assert(text.includes('timingSafeTextEqual(candidate.value, entry.value)'));
console.log('PASS: 9 targeted assertions (secret preservation, response containment, fail-closed status, auth diagnostics)');

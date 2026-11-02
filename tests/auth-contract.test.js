'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const index = fs.readFileSync(path.join(__dirname, '..', 'index.js'), 'utf8');
function extract(name) {
 const start=index.indexOf(`function ${name}(`);
 assert(start !== -1, `missing ${name}`);
 const open=index.indexOf('{',start); let depth=0, pos=open;
 // All selected helpers are simple; brace matching is sufficient for these functions.
 for(;pos<index.length;pos++){if(index[pos]==='{') depth++; else if(index[pos]==='}' && --depth===0) break;}
 return index.slice(start,pos+1);
}
const context={process:{env:{}},uniq:a=>[...new Set(a)], crypto:require('node:crypto'),Buffer};
vm.createContext(context);
for(const name of ['marionAdminConsoleCredential','marionAdminConsoleConfiguredCredential','marionAdminConsoleEnvTokens','marionAdminConsoleMfaTokens','marionAdminConsoleEnvTokensForNames','marionAdminConsoleBearerValue','timingSafeTextEqual']) vm.runInContext(extract(name),context);
const run=(s)=>vm.runInContext(s,context);
context.process.env.SB_MARION_ADMIN_CONSOLE_TOKEN='A'.repeat(43);
assert.equal(run('marionAdminConsoleEnvTokens()[0]'),'A'.repeat(43));
assert.equal(run('timingSafeTextEqual(marionAdminConsoleCredential("A".repeat(43)), marionAdminConsoleEnvTokens()[0])'),true);
assert.equal(run('marionAdminConsoleCredential("x\\ny")'),'');
assert.equal(run('marionAdminConsoleCredential(" x ")'),' x ');
assert.equal(run('marionAdminConsoleCredential("x\\ty")'),'');
assert.equal(run('timingSafeTextEqual("a", "b")'),false);
context.process.env.SB_MARION_ADMIN_CONSOLE_TOKEN=' '+ 'A'.repeat(43);
assert.equal(run('marionAdminConsoleEnvTokens()[0]'),' '+'A'.repeat(43));
assert.equal(run('timingSafeTextEqual("A".repeat(43), marionAdminConsoleEnvTokens()[0])'),false);
context.req={headers:{authorization:'Bearer '+'B'.repeat(43)}};
assert.equal(run('marionAdminConsoleBearerValue(req)'),'B'.repeat(43));
context.req={headers:{authorization:'Bearer ab cd'}};
assert.equal(run('marionAdminConsoleBearerValue(req)'),'');
context.req={headers:{authorization:'Bearer ab\ncd'}};
assert.equal(run('marionAdminConsoleBearerValue(req)'),'');
const safety=require('../Data/marion/runtime/marionAdminRuntimeSafety.js');
assert.equal(safety.isServerVerifiedOwner({verified:true,sessionVerified:true,verifiedBy:'server_middleware',sessionId:'signed-session'}),true);
assert.equal(safety.isServerVerifiedOwner({verified:true,sessionVerified:false,verifiedBy:'server_middleware',sessionId:'signed-session'}),false);
assert.equal(safety.privatePartitionKey({},{}),'private:admin:unverified');
console.log('PASS: 12 targeted auth and private-boundary assertions');

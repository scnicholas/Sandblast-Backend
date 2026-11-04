"use strict";
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto');
const path = require('node:path');
const file = path.join(__dirname, 'MarionLearningPostgresAdapters.js');
const source = fs.readFileSync(file, 'utf8');
const policy = {
  validateSafeRecord: (v, max) => { try { const serialized=JSON.stringify(v); return serialized && Buffer.byteLength(serialized)<=max ? {ok:true,serialized} : {ok:false,reason:'oversize'}; } catch (_) {return {ok:false,reason:'invalid'};} },
  validateSignal: s=>({ok:true,signal:s})
};
const m={exports:{}};
vm.runInThisContext(`(function(require,module,exports){${source}\n})`,{filename:file})((id)=>id==='./MarionLearningPolicy'?policy:require(id),m,m.exports);
const api=m.exports;
const canonical='marion.response-style.synthetic.v2@2.1.0';
const digest=x=>crypto.createHash('sha256').update(x).digest('hex');
const registration={status:'approved', datasetId:'marion.response-style.synthetic.v2',version:'2.1.0',scope:'response_style',fixtureStore:'marion.fx.style.v2',caseIds:['one','two'],manifestHash:'a'.repeat(64),fixtureSetHash:'b'.repeat(64)};
const revocation={status:'revoked',datasetId:registration.datasetId,version:registration.version,reasonCode:'owner_requested'};
function makePool(){
 const registrations=new Map(),revocations=new Map(); const calls=[];
 let seq=0n,hash='GENESIS';
 async function query(sql,params=[]){
   calls.push({sql,params});
   if(sql.includes('to_regclass('))return {rows:[{signals_exists:true,proposals_exists:true,registrations_exists:true,revocations_exists:true,audit_state_exists:true,audit_exists:true,reviews_exists:true}],rowCount:1};
   if(sql.includes('SELECT record FROM public.marion_learning_manifest_registrations WHERE key_hash')){ const v=registrations.get(params[0]);return {rows:v?[{record:v}]:[],rowCount:v?1:0}; }
   if(sql.includes('SELECT record FROM public.marion_learning_manifest_revocations WHERE key_hash')){ const v=revocations.get(params[0]);return {rows:v?[{record:v}]:[],rowCount:v?1:0}; }
   if(sql.includes('INSERT INTO public.marion_learning_manifest_registrations')){if(registrations.has(params[0]))return {rows:[],rowCount:0};registrations.set(params[0],JSON.parse(params[1]));return {rows:[{key_hash:params[0]}],rowCount:1};}
   if(sql.includes('INSERT INTO public.marion_learning_manifest_revocations')){if(revocations.has(params[0]))return {rows:[],rowCount:0};revocations.set(params[0],JSON.parse(params[1]));return {rows:[{key_hash:params[0]}],rowCount:1};}
   if(sql.includes('SELECT r.key_hash, r.record')){const rows=[...registrations].filter(([key,record])=>record.status==='approved'&&!revocations.has(key)&&(!params[0]||record.scope===params[0])).map(([key_hash,record])=>({key_hash,record}));return {rows,rowCount:rows.length};}
   if(sql.includes('SELECT sequence, event_hash')&&sql.includes('FOR UPDATE'))return {rows:[{sequence:seq.toString(),event_hash:hash}],rowCount:1};
   if(sql.includes('UPDATE public.marion_learning_audit_state')){seq=BigInt(params[0]);hash=params[1];return {rows:[],rowCount:1};}
   if(sql.includes('INSERT INTO public.marion_learning_audit '))return {rows:[],rowCount:1};
   if(['BEGIN','COMMIT','ROLLBACK'].includes(sql))return {rows:[],rowCount:0};
   throw new Error('Unexpected SQL: '+sql);
 }
 const pool={query,connect:async()=>({query,release(){}})};
 return {pool,calls,registrations,revocations};
}
let tests=0;
async function test(name,fn){try{await fn();tests++; console.log('PASS',name);}catch(e){console.error('FAIL',name,e);process.exitCode=1;}}
(async()=>{
 const a=makePool();const adapters=api.createMarionLearningPostgresAdapters({pool:a.pool,resolveVersion:()=>{},loadFixture:()=>{},scoreFixture:()=>{}});const store=adapters.manifestRegistryStore;
 await test('canonical key SHA-256 remains identical',()=>assert.equal(digest(canonical),'b893b1dea2e62c547ff771cd8629e2ef67179b96905601f3a298b13349a304a3'));
 await test('missing canonical key yields null',async()=>assert.equal(await store.get(canonical),null));
 await test('accepts canonical registration insert',async()=>assert.equal(await store.putIfAbsent(canonical,registration),true));
 await test('same key hashed without migration',()=>assert.ok(a.registrations.has(digest(canonical))));
 await test('canonical get finds existing record',async()=>assert.deepEqual(await store.get(canonical),registration));
 await test('approved listing and keyed lookup agree',async()=>assert.equal((await store.listApproved('response_style'))[0].datasetId,(await store.get(canonical)).datasetId));
 await test('duplicate approval cannot overwrite',async()=>assert.equal(await store.putIfAbsent(canonical,registration),false));
 await test('rejects missing delimiter',async()=>assert.equal(await store.get('marion.response-style.synthetic.v2'),null));
 await test('rejects doubled delimiter',async()=>assert.equal(await store.get('a@@b'),null));
 await test('rejects injected characters',async()=>assert.equal(await store.get('a@b;DROP'),null));
 await test('rejects mismatched registration identity',async()=>await assert.rejects(store.putIfAbsent('other.dataset@2.1.0',registration),/identity_mismatch/));
 await test('unregistered revocation is null',async()=>assert.equal(await store.getRevocation(canonical),null));
 await test('accepts canonical revocation',async()=>assert.equal(await store.putRevocationIfAbsent(canonical,revocation),true));
 await test('canonical revocation lookup works',async()=>assert.deepEqual(await store.getRevocation(canonical),revocation));
 await test('revoked approval excluded from listing',async()=>assert.equal((await store.listApproved('response_style')).length,0));
 await test('revocation cannot overwrite',async()=>assert.equal(await store.putRevocationIfAbsent(canonical,revocation),false));
 await test('rejects mismatched revocation identity',async()=>await assert.rejects(store.putRevocationIfAbsent('other.dataset@2.1.0',revocation),/identity_mismatch/));
 const b=makePool();const store2=api.createMarionLearningPostgresAdapters({pool:b.pool,resolveVersion:()=>{},loadFixture:()=>{},scoreFixture:()=>{}}).manifestRegistryStore;
 b.registrations.set(digest(canonical),{...registration, datasetId:'different.dataset'});
 await test('tampered keyed record fails closed',async()=>await assert.rejects(store2.get(canonical),/identity_mismatch/));
 await test('tampered listing record fails closed',async()=>await assert.rejects(store2.listApproved('response_style'),/identity_mismatch/));
 const c=makePool();const store3=api.createMarionLearningPostgresAdapters({pool:c.pool,resolveVersion:()=>{},loadFixture:()=>{},scoreFixture:()=>{}}).manifestRegistryStore;
 c.registrations.set(digest('other.dataset@2.1.0'),registration);
 await test('wrong stored key hash fails closed',async()=>await assert.rejects(store3.listApproved('response_style'),/identity_mismatch/));
 await test('invalid scope rejected',async()=>await assert.rejects(store.listApproved('admin'),/invalid_manifest_scope/));
 await test('audit registration and revocation are transactions',()=>assert.ok(a.calls.filter(x=>x.sql==='COMMIT').length>=2));
 await test('schema not modified by registry operations',()=>assert.equal(a.calls.some(x=>/^CREATE TABLE|^CREATE UNIQUE/.test(x.sql)),false));
 await test('legacy exports intact',()=>assert.deepEqual(Object.keys(api).sort(),['VERSION','createMarionLearningPostgresAdapters','initializeMarionLearningPostgresSchema','probeMarionLearningPostgres','verifyMarionLearningAuditIntegrity'].sort()));
 console.log(`RESULT ${tests} tests ${process.exitCode?'FAILED':'PASSED'}`);
})();

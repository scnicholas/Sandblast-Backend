"use strict";
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const filename = path.join(__dirname, '..', 'MarionLearningPostgresAdapters.js');
const source = fs.readFileSync(filename, 'utf8');
const moduleMock = { exports: {} };
const sandbox = { module: moduleMock, exports: moduleMock.exports, require: name => {
  if (name === './MarionLearningPolicy') return {validateSafeRecord: value => ({ok: true, serialized:JSON.stringify(value)})};
  return require(name);
}, console, Buffer, Date, BigInt, Object, Set, WeakMap, Promise };
vm.runInNewContext(source, sandbox, {filename});
const probe = moduleMock.exports.probeMarionLearningPostgres;
const schema = Object.fromEntries(['signals_exists','proposals_exists','registrations_exists','revocations_exists','audit_state_exists','audit_exists','reviews_exists'].map(k=>[k,true]));
function poolFor({fail, missing, state = {sequence:'0',event_hash:'GENESIS'}} = {}) {
  const observed=[];
  const schemaRow={...schema}; if(missing) schemaRow[missing]=false;
  const client={query:async sql=>{
    observed.push(sql);
    if (/SELECT sequence, event_hash FROM public.marion_learning_audit_state/.test(sql)) return {rows:[state]};
    if (/SELECT sequence, previous_hash, event, event_hash/.test(sql)) return {rows:[]};
    return {rows:[],rowCount:0};
  },release(){}};
  return {observed,connect:async()=>client,query:async sql=>{
    observed.push(sql);
    if (fail && /SELECT 1/.test(sql)) throw Object.assign(new Error('never expose secret'),{code:fail});
    if (/SELECT 1 AS/.test(sql)) return {rows:[{marion_learning_probe:1}]};
    if (/to_regclass/.test(sql)) return {rows:[schemaRow]};
    return {rows:[],rowCount:0};
  }};
}
(async()=>{
  const okPool=poolFor(); const ok=await probe(okPool);
  assert.equal(ok.ready,true);assert.equal(ok.databaseConnected,true);assert.equal(ok.auditReady,true);
  assert.equal(ok.reason,'evaluation_storage_ready');
  assert.equal(okPool.observed.some(sql=>/INSERT|UPDATE|DELETE|CREATE|ALTER|DROP/i.test(sql)),false);
  const missing=await probe(poolFor({missing:'reviews_exists'}));
  assert.equal(missing.ready,false);assert.equal(missing.coreReady,true);assert.equal(missing.reviewStoreReady,false);
  assert.equal(missing.reason,'review_store_schema_missing');
  const broken=await probe(poolFor({state:{sequence:'1',event_hash:'BAD'}}));
  assert.equal(broken.ready,false);assert.equal(broken.databaseConnected,true);
  assert.equal(broken.coreSchemaPresent,true);assert.equal(broken.auditReason,'audit_state_pointer_mismatch');
  assert.equal(broken.reason,'learning_audit_chain_invalid');
  for(const [code,reason] of [['28P01','postgres_authentication_failed'],['3D000','postgres_database_missing'],['ENOTFOUND','postgres_dns_failure'],['SELF_SIGNED_CERT_IN_CHAIN','postgres_tls_verification_failed'],['57014','postgres_query_timeout'],['42501','postgres_permission_denied']]){
    const out=await probe(poolFor({fail:code}));assert.equal(out.reason,reason);assert.equal(JSON.stringify(out).includes('secret'),false);
  }
  assert.equal((await probe(null)).reason,'postgres_pool_unavailable');
  console.log('PASS: 11 readiness / diagnostic / redaction / read-only checks');
})().catch(e=>{console.error(e);process.exitCode=1});

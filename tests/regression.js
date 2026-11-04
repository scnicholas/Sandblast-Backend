'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'marion-pg-test-'));
fs.copyFileSync(path.join(__dirname, '..', 'MarionLearningPostgresAdapters.js'), path.join(temp, 'MarionLearningPostgresAdapters.js'));
fs.copyFileSync(path.join(__dirname, 'MarionLearningPolicy.js'), path.join(temp, 'MarionLearningPolicy.js'));
const mod = require(path.join(temp, 'MarionLearningPostgresAdapters.js'));
let passed = 0;
async function test(name, f) { try { await f(); console.log('PASS',name); passed++; } catch (e) { console.error('FAIL',name,e.stack); process.exitCode=1; } }
const fixture = {signalId:'marion-diag-regression',signalClass:'owner_confirmation',scope:'routing',sourceSubsystem:'marion_diag_isolated',outcomeScore:0.5,occurredAt:'2026-11-03T12:00:00.000Z'};
function hash(prev, seq, event) { const stable = v => Array.isArray(v)?`[${v.map(stable).join(',')}]`:v&&typeof v==='object'?`{${Object.keys(v).sort().map(k=>`${JSON.stringify(k)}:${stable(v[k])}`).join(',')}}`:JSON.stringify(v); return crypto.createHash('sha256').update(`${prev}\n${seq}\n${stable(event)}`).digest('hex'); }
function auditPool(events, override={}) {
  let prev='GENESIS'; const rows=events.map((e,i)=>{let r={sequence:String(i+1),previous_hash:prev,event:e,event_hash:hash(prev,BigInt(i+1),e)};prev=r.event_hash;return r;});
  override.mutate?.(rows);
  const state=override.state||{sequence:String(events.length), event_hash:prev};
  const client={query:async(q,params)=>{
    if(q.startsWith('BEGIN')||q==='COMMIT'||q==='ROLLBACK')return {rowCount:0,rows:[]};
    if(q.includes('FROM public.marion_learning_audit_state'))return {rowCount:1,rows:[state]};
    if(q.includes('FROM public.marion_learning_audit WHERE sequence >'))return {rowCount:rows.length,rows:rows.filter(r=>BigInt(r.sequence)>BigInt(params[0])).slice(0,Number(params[1]))};
    throw Error('unexpected query '+q);
  },release:()=>{}};
  return {connect:async()=>client};
}
(async()=>{
 await test('historical-compatible SHA256 canonical chain verifies', async()=>{
  const r=await mod.verifyMarionLearningAuditIntegrity(auditPool([{type:'a',x:2},{type:'b',x:3}])); assert.equal(r.ok,true); assert.equal(r.totalEvents,'2');
 });
 await test('detects cryptographic event tampering', async()=>{
  const r=await mod.verifyMarionLearningAuditIntegrity(auditPool([{type:'a'}],{mutate:rows=>rows[0].event.type='altered'})); assert.equal(r.ok,false); assert.equal(r.reason,'audit_event_hash_mismatch');
 });
 await test('detects sequence discontinuity', async()=>{
  const r=await mod.verifyMarionLearningAuditIntegrity(auditPool([{type:'a'}],{mutate:rows=>rows[0].sequence='2'})); assert.equal(r.reason,'audit_sequence_gap_or_duplicate');
 });
 await test('detects predecessor break', async()=>{
  const r=await mod.verifyMarionLearningAuditIntegrity(auditPool([{type:'a'},{type:'b'}],{mutate:rows=>rows[1].previous_hash='not-the-previous-hash'})); assert.equal(r.reason,'audit_predecessor_mismatch');
 });
 await test('detects state pointer mismatch', async()=>{
  const r=await mod.verifyMarionLearningAuditIntegrity(auditPool([{type:'a'}],{state:{sequence:'9',event_hash:'broken'}})); assert.equal(r.reason,'audit_state_pointer_mismatch');
 });
 await test('empty chain with GENESIS passes',async()=>{
  const r=await mod.verifyMarionLearningAuditIntegrity(auditPool([])); assert.equal(r.ok,true); assert.equal(r.totalEvents,'0');
 });
 await test('null pool fail closed',async()=>{
  const r=await mod.verifyMarionLearningAuditIntegrity(null); assert.equal(r.ok,false);
 });
 await test('signal append confirms returned database id',async()=>{
  const pool={connect:async()=>({}),query:async(q,args)=>{
    if(q.includes('to_regclass('))return {rows:[{signals_exists:true,proposals_exists:true,registrations_exists:true,revocations_exists:true,audit_state_exists:true,audit_exists:true,reviews_exists:true}]};
    if(q.includes('INSERT INTO public.marion_learning_signals'))return {rowCount:1,rows:[{id:'3',signal_id:fixture.signalId}]};
    throw Error('unexpected query '+q);
  }};
  const adapter=mod.createMarionLearningPostgresAdapters({pool,resolveVersion:()=>{},loadFixture:()=>{},scoreFixture:()=>{}});
  const a=await adapter.signalStore.appendSignal(fixture);assert.equal(a.persisted,true);assert.equal(a.signalId,fixture.signalId);
 });
 await test('signal append rejects false acknowledgment',async()=>{
  const pool={connect:async()=>({}),query:async(q,args)=>{
    if(q.includes('to_regclass('))return {rows:[{signals_exists:true,proposals_exists:true,registrations_exists:true,revocations_exists:true,audit_state_exists:true,audit_exists:true,reviews_exists:true}]};
    if(q.includes('INSERT INTO public.marion_learning_signals'))return {rowCount:1,rows:[{id:'3',signal_id:'wrong'}]};
  }};
  const adapter=mod.createMarionLearningPostgresAdapters({pool,resolveVersion:()=>{},loadFixture:()=>{},scoreFixture:()=>{}});
  await assert.rejects(()=>adapter.signalStore.appendSignal(fixture),/persistence_unconfirmed/);
 });
 await test('generic proposal setter fails closed',async()=>{
  const adapter=mod.createMarionLearningPostgresAdapters({pool:{query:async()=>{},connect:async()=>{}},resolveVersion:()=>{},loadFixture:()=>{},scoreFixture:()=>{}});
  await assert.rejects(()=>adapter.proposalStore.set('proposal-a',{state:'approved',validated:true}),/audited_write_required/);
 });
 await test('revoked manifests excluded from approved listing SQL',async()=>{
  let query='';const pool={connect:async()=>({}),query:async(q,args)=>{
    if(q.includes('to_regclass('))return {rows:[{signals_exists:true,proposals_exists:true,registrations_exists:true,revocations_exists:true,audit_state_exists:true,audit_exists:true,reviews_exists:true}]};
    query=q;return {rows:[]};
  }};
  const a=mod.createMarionLearningPostgresAdapters({pool,resolveVersion:()=>{},loadFixture:()=>{},scoreFixture:()=>{}});
  assert.deepEqual(await a.manifestRegistryStore.listApproved('routing'),[]);
  assert.match(query,/NOT EXISTS/); assert.match(query,/marion_learning_manifest_revocations/);
 });
 await test('draft proposal can be saved without authority escalation',async()=>{
  let query='';const pool={connect:async()=>({}),query:async(q,args)=>{
    if(q.includes('to_regclass('))return {rows:[{signals_exists:true,proposals_exists:true,registrations_exists:true,revocations_exists:true,audit_state_exists:true,audit_exists:true,reviews_exists:true}]};
    query=q;return {rowCount:1,rows:[{proposal_id:'proposal-a'}]};
  }};
  const a=mod.createMarionLearningPostgresAdapters({pool,resolveVersion:()=>{},loadFixture:()=>{},scoreFixture:()=>{}});
  await a.proposalStore.set('proposal-a',{state:'draft',validated:false,liveBehaviorChanged:false});
  assert.match(query,/RETURNING proposal_id/);assert.match(query,/record->>'state' = 'draft'/);
 });
 await test('manifest registration and revocation writes are atomic with audit',async()=>{
  let statements=[]; let eventCount=0;
  const client={query:async(q,args)=>{
    statements.push(q);
    if(q==='BEGIN'||q==='COMMIT'||q==='ROLLBACK')return {rowCount:0};
    if(q.includes('INSERT INTO public.marion_learning_manifest_'))return {rowCount:1};
    if(q.includes('FROM public.marion_learning_audit_state') && q.includes('FOR UPDATE'))return {rowCount:1,rows:[{sequence:String(eventCount),event_hash:eventCount?'a'.repeat(64):'GENESIS'}]};
    if(q.includes('INSERT INTO public.marion_learning_audit (')){eventCount++;return {rowCount:1};}
    if(q.includes('UPDATE public.marion_learning_audit_state'))return {rowCount:1};
    throw Error('unexpected client query '+q);
  },release:()=>{}};
  const pool={connect:async()=>client,query:async(q,args)=>{
    if(q.includes('to_regclass('))return {rows:[{signals_exists:true,proposals_exists:true,registrations_exists:true,revocations_exists:true,audit_state_exists:true,audit_exists:true,reviews_exists:true}]};
    throw Error('unexpected pool query '+q);
  }};
  const a=mod.createMarionLearningPostgresAdapters({pool,resolveVersion:()=>{},loadFixture:()=>{},scoreFixture:()=>{}});
  assert.equal(await a.manifestRegistryStore.putIfAbsent('manifest.a',{status:'approved',scope:'routing',caseIds:['a']}),true);
  assert.equal(await a.manifestRegistryStore.putRevocationIfAbsent('manifest.a',{status:'revoked'}),true);
  assert.equal(eventCount,2);assert.equal(statements.filter(x=>x==='COMMIT').length,2);
 });
 await test('manifest audit failure rolls back transaction',async()=>{
  let rolledBack=false;
  const client={query:async(q,args)=>{
    if(q==='BEGIN')return {};
    if(q.includes('INSERT INTO public.marion_learning_manifest_registrations'))return {rowCount:1};
    if(q.includes('FROM public.marion_learning_audit_state'))throw new Error('injected-audit-failure');
    if(q==='ROLLBACK'){rolledBack=true;return {};}
    throw Error('unexpected query '+q);
  },release:()=>{}};
  const pool={connect:async()=>client,query:async(q,args)=>q.includes('to_regclass(')?{rows:[{signals_exists:true,proposals_exists:true,registrations_exists:true,revocations_exists:true,audit_state_exists:true,audit_exists:true,reviews_exists:true}]}:null};
  const a=mod.createMarionLearningPostgresAdapters({pool,resolveVersion:()=>{},loadFixture:()=>{},scoreFixture:()=>{}});
  await assert.rejects(()=>a.manifestRegistryStore.putIfAbsent('manifest.a',{status:'approved',scope:'routing',caseIds:['a']}),/injected-audit-failure/);
  assert.equal(rolledBack,true);
 });
 await test('audit verifier handles paginated event chains',async()=>{
  const events=Array.from({length:505},(_,i)=>({type:'audit_test',seq:i+1}));
  const r=await mod.verifyMarionLearningAuditIntegrity(auditPool(events));
  assert.equal(r.ok,true);assert.equal(r.totalEvents,'505');
 });
 await test('live audit health can detect chain tamper',async()=>{
  const clientPool=auditPool([{type:'x'}]); const orig=clientPool.connect;
  clientPool.query=async q=>{
    if(q==='SELECT 1')return {rows:[{'?column?':1}]};
    if(q.includes('to_regclass('))return {rows:[{signals_exists:true,proposals_exists:true,registrations_exists:true,revocations_exists:true,audit_state_exists:true,audit_exists:true,reviews_exists:true}]};
    if(q.includes('SELECT review_ref'))return {rows:[]};
  };
  let health=await mod.probeMarionLearningPostgres(clientPool);assert.equal(health.ready,true);
 });
 console.log(`Completed ${passed} regression tests`);
 fs.rmSync(temp,{recursive:true,force:true});
 if(process.exitCode)process.exit(process.exitCode);
})().catch(e=>{console.error(e);process.exit(1)});

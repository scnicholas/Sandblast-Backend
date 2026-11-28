'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const finalizer=require('../Data/marion/runtime/marionFinalEnvelope.js');
const reply='Improve cash flow by collecting invoices promptly, forecasting weekly cash needs, and controlling unnecessary expenses.';
const base=()=>({reply,turnId:'synthetic-finance-turn',sessionId:'synthetic-finance-session',currentTurnBound:true,semanticAuthority:'marion',privateAdminConversation:true,marionAdminConversation:true,resolvedEmotion:{primary:'neutral'},routing:{domain:'finance',knowledgeDomain:'finance',intent:'business_strategy'},meta:{turnId:'synthetic-finance-turn'}});
const certified=p=>p?.ok===true&&p?.final===true&&p?.marionFinal===true&&p?.finalEnvelope?.currentTurnBound===true&&p?.finalEnvelope?.adaptiveTrustVerification?.allowEmit===true&&p?.finalEnvelope?.completionStatus?.complete===true&&finalizer.validateReplyContract(p.finalEnvelope).ok===true;
async function build(input){return await finalizer.createMarionFinalEnvelope(input);}
test('valid authenticated-context finance candidate remains canonical and signed',async()=>{assert.equal(certified(await build(base())),true);});
test('missing turn ID cannot certify or emit',async()=>{const b=base();b.turnId='';b.meta.turnId='';const p=await build(b);assert.equal(certified(p),false);});
test('upstream explicit denial is never promoted by finalizer decorators',async()=>{const p=await build({...base(),ok:false,blocked:true,requiresRetry:true});assert.equal(certified(p),false);assert.notEqual(p.canEmit,true);});
test('rejection provenance captures bounded code fields and actual candidate presence',async()=>{const p=await build({...base(),ok:false,blocked:true,requiresRetry:true});const d=p?.diagnostics?.financeFinalizerProvenance;assert.equal(d?.candidateReplyPresent,true);assert.equal(d?.upstreamBlocked,true);assert.equal(d?.upstreamRetry,true);assert.equal(typeof d?.completionReason,'string');for(const s of [...(d?.trustReasons||[]),...(d?.finalReplyReasons||[])])assert.match(s,/^[a-z][a-z0-9_:-]{0,64}$/);});
test('finance diagnostic annotations never contain raw reply text',async()=>{const p=await build({...base(),ok:false,blocked:true,requiresRetry:true});const d=JSON.stringify(p?.diagnostics?.financeFinalizerProvenance||{});assert.equal(d.includes(reply),false);assert.equal(d.includes('synthetic-finance-turn'),false);});

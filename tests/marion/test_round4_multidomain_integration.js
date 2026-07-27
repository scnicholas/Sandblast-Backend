"use strict";
const assert=require("assert");const path=require("path");const root=path.resolve(__dirname,"..");
const md=require(path.join(root,"Data/marion/runtime/marionRound4DomainIntegration.js"));
const reg=require(path.join(root,"Data/marion/runtime/marionDomainRegistry.js"));
const conf=require(path.join(root,"Data/marion/runtime/domainConfidence.js"));
const con=require(path.join(root,"Data/marion/runtime/DomainConcierge.js"));
const qs=require(path.join(root,"Data/marion/runtime/QuestionShapeNormalizer.js"));
const ret=require(path.join(root,"Data/marion/runtime/domainRetriever.js"));
const router=require(path.join(root,"utils/domainRouter.js"));
const prompts=[
 {q:"We are launching Sandblast internationally. Integrate the psychological, legal, financial, and AI considerations into one plan.",expect:["psychology","law","finance","ai"]},
 {q:"Assess AI agent security, privacy compliance, and the financial risk of deployment.",expect:["ai","cyber","law","finance"]},
 {q:"Rewrite the customer notice in clear English while preserving legal accuracy and psychological trust.",expect:["english","law","psychology"]},
 {q:"Create a cybersecurity policy that accounts for legal obligations, staff behaviour, and implementation cost.",expect:["cyber","law","psychology","finance"]}
];
let passed=0;for(const t of prompts){const p=md.build(t.q);for(const d of t.expect)assert(p.domains.includes(d),`${d} missing`);assert(p.primaryDomain);assert.strictEqual(p.executionAuthorized,false);passed+=4;const c=conf.buildRound4MultiDomainConfidence(t.q);assert(c.candidates.length>=2);const cq=con.buildRound4MultiDomainConcierge(t.q);assert.strictEqual(cq.needsClarifier,false);const shape=qs.normalizeQuestionShape(t.q);assert.strictEqual(shape.multiDomainRequested,true);const r=router.buildRound4MultiDomainRoute(t.q);assert(r.secondaryDomains.length>=1);passed+=4;}
assert.deepStrictEqual(reg.listRound4KnowledgeDomains(),md.SIX_DOMAINS);assert.strictEqual(reg.validateRound4DomainSet(md.SIX_DOMAINS).valid,true);assert.strictEqual(typeof ret.retrieveDomains,"function");passed+=3;
for(const d of md.SIX_DOMAINS){const m=require(path.join(root,"Data/Domains",d,"manifest.json"));assert.strictEqual(m.domain,d);assert.strictEqual(m.round4MultiDomainIntegration.enabled,true);assert.strictEqual(m.round4MultiDomainIntegration.executionAuthorized,false);passed+=3;}
console.log(JSON.stringify({ok:true,passed,domains:md.SIX_DOMAINS,version:md.VERSION},null,2));

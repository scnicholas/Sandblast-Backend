"use strict";
const assert=require("assert");
const path=require("path");
const root=path.resolve(__dirname,"..","Data","marion","runtime");
const c=require(path.join(root,"domainConfidence.js"));
const r=require(path.join(root,"domainRetriever.js"));
const g=require(path.join(root,"marionDomainRegistry.js"));
const p43="Suppose Sandblast begins licensing media internationally while accepting advertising revenue. What legal and financial questions should be resolved before expanding internationally?";
const p44='Rewrite this message so it is clear and persuasive without using pressure or manipulation: "Advertise now before your competitors take every available position." Then explain the psychological difference.';
const p45="Create a launch-readiness assessment covering psychology, English communication, AI, cybersecurity, law, and finance.";
let n=0;function eq(a,b){assert.strictEqual(a,b);n++}function ok(v){assert.ok(v);n++}
let x=c.buildDomainConfidenceProfile({text:p43});eq(x.primaryDomain,"law");ok(x.secondaryDomains.includes("finance"));eq(x.needsClarifier,false);
x=c.buildDomainConfidenceProfile({text:p44});eq(x.primaryDomain,"english");ok(x.secondaryDomains.includes("psychology"));
x=c.buildDomainConfidenceProfile({text:p45});eq(x.primaryDomain,"ai");eq(x.secondaryDomains.length,5);
let p=g.getRound43CohesionPlan(p43);eq(p.mode,"law_finance_pair");eq(p.executionAuthorized,false);
p=g.getRound43CohesionPlan(p44);eq(p.mode,"english_psychology_pair");
p=g.getRound43CohesionPlan(p45);eq(p.mode,"six_domain_certification");
ok(typeof r.retrieveRound43Domains==="function");
console.log(JSON.stringify({ok:true,assertions:n},null,2));

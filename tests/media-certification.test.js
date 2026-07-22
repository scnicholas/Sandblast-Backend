"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {validateHttpsMediaUrl,validateDraft,probeMediaUrl,certifyDraft}=require("../../SandblastTV/mediaValidator");
const {SchedulerService}=require("../../SandblastTV/schedulerService");

test("accepts HTTPS Archive.org delivery subdomains and rejects unsafe hosts",()=>{
  assert.equal(validateHttpsMediaUrl("https://dn720302.ca.archive.org/0/items/a/a.mp4").ok,true);
  assert.equal(validateHttpsMediaUrl("http://dn720302.ca.archive.org/a.mp4").error,"https_required");
  assert.equal(validateHttpsMediaUrl("https://127.0.0.1/a.mp4").error,"media_host_not_allowed");
});
test("publication validation requires certified active media",()=>{
  const draft={displayName:"Test",slots:[{id:"one",title:"One",sourceUrl:"https://dn720302.ca.archive.org/a.mp4",durationSeconds:60,enabled:true,validationStatus:"pending"}]};
  assert.equal(validateDraft(draft,"classic").ok,true);
  const strict=validateDraft(draft,"classic",{requireValidated:true});
  assert.equal(strict.ok,false);assert.ok(strict.errors.includes("one:media_not_validated"));
});
test("range-capable video response certifies a valid slot",async()=>{
  const old=global.fetch;global.fetch=async()=>({ok:true,status:206,url:"https://dn720302.ca.archive.org/a.mp4",headers:new Map([["content-type","video/mp4"],["content-length","2"],["accept-ranges","bytes"]]),body:{cancel:async()=>{}}});
  try{const p=await probeMediaUrl("https://dn720302.ca.archive.org/a.mp4",{timeoutMs:1000});assert.equal(p.ok,true);const r=await certifyDraft({slots:[{id:"one",sourceUrl:p.sourceUrl,title:"One",durationSeconds:60,enabled:true}]},"classic");assert.equal(r.summary.validated,1);assert.equal(r.manifest.slots[0].validationStatus,"validated");}finally{global.fetch=old}
});
test("failed or durationless sources quarantine only when explicitly requested",async()=>{
  const old=global.fetch;global.fetch=async()=>{throw new Error("offline")};
  try{const r=await certifyDraft({slots:[{id:"one",sourceUrl:"https://dn720302.ca.archive.org/a.mp4",title:"One",durationSeconds:0,enabled:true}]},"cartoons",{quarantineFailures:true});assert.equal(r.summary.quarantined,1);assert.equal(r.manifest.slots[0].enabled,false);}finally{global.fetch=old}
});
test("scheduler ignores uncertified slots and does not wrap a finite schedule",()=>{
  const manifest={version:1,displayName:"Test",loop:false,anchorEpochMs:0,slots:[{id:"a",enabled:true,validationStatus:"validated",durationSeconds:10},{id:"b",enabled:true,validationStatus:"pending",durationSeconds:10}]};
  const scheduler=new SchedulerService({store:{getPublished:()=>manifest,getChannel:()=>({})}});const now=scheduler.getNow("classic",20000);assert.equal(now.slot.id,"a");assert.equal(now.nextSlot,null);
});

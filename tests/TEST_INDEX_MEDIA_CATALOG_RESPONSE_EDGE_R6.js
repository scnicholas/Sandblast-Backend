"use strict";
const assert=require("assert");
const path=require("path");
const root=path.resolve(__dirname,"..");
process.env.SB_NYX_CHANNELS_CATALOG_PATH=path.join(root,"Data","SandblastTV","channels.json");
process.env.SB_NYX_CLASSIC_CATALOG_PATH=path.join(root,"Data","SandblastTV","blocks","classic.json");
process.env.SB_NYX_CARTOON_CATALOG_PATH=path.join(root,"Data","SandblastTV","blocks","cartoons.json");
const {loadIndex}=require("./_index_harness.js");
const {backend,expressStub}=loadIndex();
const route=backend.app._routes.find((r)=>r.method==="POST"&&r.paths.includes("/api/chat"));
assert.ok(route,"POST /api/chat missing");

function req(text,staleLaw=false){
  return {method:"POST",path:"/api/chat",originalUrl:"/api/chat",url:"/api/chat",
    headers:{origin:"https://www.sandblast.channel","x-sb-session-id":"catalog_edge","x-sb-turn-id":"turn1","x-sb-trace-id":"trace1"},
    body:{audience:"public",lane:"public_interface",presentationProfile:"public",publicSurfaceOnly:true,publicIdentityLock:true,text,message:text,sessionId:"catalog_edge",turnId:"turn1",
      ...(staleLaw?{domainHint:"law",intentHint:"domain_question",payload:{domain:"law",primaryDomain:"law",knowledgeDomain:"law"}}:{})}};
}
function execute(request){
  return new Promise((resolve,reject)=>{
    const res=Object.create(expressStub.response);res.req=request;res.headers={};res.statusCode=200;res.headersSent=false;
    let i=0,done=false;
    const timer=setTimeout(()=>finish(new Error("timeout")),7000);
    function finish(err){if(done)return;done=true;clearTimeout(timer);err?reject(err):resolve(res);}
    function next(err){if(err)return finish(err);const h=route.handlers[i++];if(!h)return finish();try{const v=h(request,res,next);if(v&&typeof v.then==="function")v.then(()=>{if(res.headersSent)finish();}).catch(finish);else if(res.headersSent)finish();}catch(e){finish(e);}}
    next();
  });
}
(async()=>{
  for(const [text,intent,match] of [
    ["What movies are available?","movie_catalog",/Strangers on a Train/],
    ["What cartoons are available?","cartoon_catalog",/Popeye/],
    ["What can I watch on Sandblast?","media_overview",/active classic-film selections/]
  ]){
    const res=await execute(req(text,true));
    const b=res.body;
    assert.ok(b&&typeof b==="object");
    assert.strictEqual(b.intent,intent);
    assert.strictEqual(b.actionRequired,false);
    assert.strictEqual(b.validateAction,false);
    assert.strictEqual(b.routeType,"knowledge");
    assert.strictEqual(b.domain,"media");
    assert.match(b.reply,match);
    assert.ok(b.catalog&&b.catalog.dynamic===true);
    assert.doesNotMatch(b.reply,/legal-risk triage|not legal advice|route unavailable/i);
  }
  console.log("PASS: live route response edge preserves dynamic catalog and stale-Law override");
})().catch(e=>{console.error(e);process.exit(1);});

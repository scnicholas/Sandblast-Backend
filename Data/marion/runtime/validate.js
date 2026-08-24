const assert=require('assert');
const bridge=require('./marionBridge.js');
const router=require('./marionIntentRouter.js');
const composer=require('./composeMarionResponse.js');
const envelope=require('./marionFinalEnvelope.js');
const tests=[
 ['ai','What is artificial intelligence?',/Artificial intelligence is the field/i],
 ['psychology','What is cognitive bias?',/cognitive bias/i],
 ['english','Explain English grammar.',/grammar|English/i],
 ['cyber','What is least privilege?',/least privilege/i],
 ['law','What is consideration in contract law?',/consideration/i],
 ['finance','What is cash flow?',/cash flow/i]
];
function input(q,i=0){return{message:q,text:q,userText:q,userQuery:q,rawUserText:q,sessionId:'test'+i,conversationId:'test'+i,turnId:'t'+i,traceId:'x'+i,audience:'public',surfaceAgent:'nyx',publicSurfaceOnly:true,operatorPersonalization:false,allowPersonalName:false,revealBackendAgent:false,publicIdentityLock:true,requireMarionFinal:true,marionRequired:true,marionMode:'required',singlePassPreferred:true,requireCleanPublicReply:true,guideContext:{surface:'sandblast.channel',currentLane:'home'}}}
(async()=>{
 const results=[];
 for(let i=0;i<tests.length;i++){
   const [domain,q,rx]=tests[i];
   const t=Date.now(); const out=await bridge.processWithMarion(input(q,i)); const ms=Date.now()-t;
   assert.equal(out.marionFinal,true,domain+' marionFinal');
   assert.equal(out.marionRoute,'marion-primary',domain+' route');
   assert.equal(out.domain,domain,domain+' domain');
   assert(rx.test(out.reply),domain+' reply: '+out.reply);
   assert(ms<2500,domain+' latency '+ms);
   results.push({domain,ms,reply:out.reply,route:out.marionRoute,timing:out.meta&&out.meta.marionTiming});
 }
 // router exact AI lock
 const rr=router.buildPublicKnowledgeFastRoute(input('What is artificial intelligence?',99));
 assert(rr&&rr.domain==='ai'&&rr.fastPathEligible===true&&rr.singlePassRequired===true);
 // composer direct helper
 const cc=composer.composePublicKnowledgeFast(rr,input('What is artificial intelligence?',100));
 assert(cc&&cc.domain==='ai'&&/Artificial intelligence is the field/i.test(cc.reply));
 // envelope precedence: generic top-level must not outrank authoritative reply
 const good='Artificial intelligence is the field of building systems that can learn patterns, reason, and generate useful outputs.';
 const ee=envelope.createPublicKnowledgeFastEnvelope({singlePassPublicKnowledge:true,reply:"I’m Nyx, the public Sandblast assistant.",authoritativeReply:good,domain:'ai',knowledgeDomain:'ai',routing:{domain:'ai',knowledgeDomain:'ai',domainConfidence:{confidence:.995}},turnId:'te',sessionId:'se',rawUserText:'What is artificial intelligence?',meta:{singlePassPublicKnowledge:true}});
 assert(ee&&ee.marionFinal===true&&ee.reply===good,'envelope authoritative precedence');
 // identity should not be classified as public knowledge fast route
 assert.equal(router.classifyPublicKnowledgeFastDomain(input('Who are you?',101)),'');
 // stale prior identity/continuity must not override current AI turn
 const stale=input('What is artificial intelligence?',102); stale.lastAssistantReply="I’m Nyx, the public Sandblast assistant."; stale.history=[{role:'user',text:'Who are you?'},{role:'assistant',text:"I’m Nyx, the public Sandblast assistant."}]; const st=Date.now(); const so=await bridge.processWithMarion(stale); const sm=Date.now()-st; assert.equal(so.domain,'ai'); assert.equal(so.marionFinal,true); assert(/Artificial intelligence is the field/i.test(so.reply)); assert(sm<2500);
 // private/admin traffic must not be classified onto the public fast route
 const privateInput=input('What is artificial intelligence?',103); privateInput.audience='owner'; privateInput.scope='private_admin'; privateInput.privateAdminConversation=true; assert.equal(router.classifyPublicKnowledgeFastDomain(privateInput),''); assert.equal(composer.composePublicKnowledgeFast(router.buildPublicKnowledgeFastRoute(privateInput)||{},privateInput),null);
 console.log(JSON.stringify({ok:true,count:tests.length+6,versions:{bridge:bridge.MARION_NYX_SINGLE_PASS_PUBLIC_KNOWLEDGE_VERSION,router:router.MARION_PUBLIC_KNOWLEDGE_FAST_ROUTE_VERSION,composer:composer.MARION_PUBLIC_KNOWLEDGE_DIRECT_COMPOSER_VERSION,envelope:envelope.MARION_PUBLIC_KNOWLEDGE_FAST_ENVELOPE_VERSION},results},null,2));
})().catch(e=>{console.error(e.stack||e);process.exit(1)});

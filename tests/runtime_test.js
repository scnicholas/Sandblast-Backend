const path=require('path');
const adapter=require(path.join(__dirname,'..','Data','marion','runtime','marionPrivateRuntimeAdapter.js'));
async function run(){
  const ctx={adminVerified:true,sessionVerified:true,passwordFreeTestChat:true};
  const sessionId='cert-session';
  const prompts=[
    'Hello Marion.',
    'Do a surgical autopsy on the JavaScript law-routing file.',
    'Go deeper.',
    'What should be fixed first?',
    'Why is that the first priority?',
    'What could break if it is repaired incorrectly?',
    'What is the safest implementation order?',
    'How do we validate the repair?',
    'What happens after that?',
    'Can you review the legal risks in this contract?',
    'What should I examine first?',
    'Good evening, Marion.'
  ];
  const rows=[];
  for(let i=0;i<prompts.length;i++){
    const p=prompts[i];
    const r=await adapter.invokePrivateRuntime({prompt:p,sessionId,adminVerified:true,passwordFreeTestChat:true,sessionVerified:true,newSession:i===0},ctx);
    rows.push({prompt:p,ok:r.ok,statusCode:r.statusCode,stage:r.stage,degraded:r.degraded,domain:r.result&&r.result.domain,reply:r.reply});
  }
  const fresh=await adapter.invokePrivateRuntime({prompt:'How do we validate the repair?',sessionId:'fresh',adminVerified:true,passwordFreeTestChat:true,sessionVerified:true,newSession:true},ctx);
  rows.push({prompt:'[fresh] How do we validate the repair?',ok:fresh.ok,statusCode:fresh.statusCode,stage:fresh.stage,degraded:fresh.degraded,domain:fresh.result&&fresh.result.domain,reply:fresh.reply});
  console.log(JSON.stringify({status:adapter.getStatus(),rows},null,2));
}
run().catch(e=>{console.error(e);process.exit(1)});

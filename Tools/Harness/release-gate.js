'use strict';
// Read-only, safe preflight. No credentials, no production calls, no repository modifications.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto');
const root=path.resolve(process.argv[2]||process.cwd());
const required=['index.js','Data/marion/runtime/marionBridge.js','Data/marion/runtime/ecosystem/MarionEcosystemGateway.js','Data/marion/runtime/ecosystem/MarionEcosystemComponentBootstrap.js','Data/marion/runtime/ecosystem/MarionEcosystemStartup.js','Utils/marionNeonIntelligence.js'];
function run(cmd,args,opts={}){return cp.spawnSync(cmd,args,{encoding:'utf8',timeout:25000,maxBuffer:5e6,...opts})}
const git=run('git',['-C',root,'rev-parse','HEAD']);const dirty=run('git',['-C',root,'status','--porcelain']);
const checks=[];function add(name,ok,evidence){checks.push({name,status:ok?'PASS':'BLOCKED',evidence});}
add('git_commit',git.status===0,git.status===0?git.stdout.trim():'Repository Git commit unavailable');
add('clean_checkout',dirty.status===0&&dirty.stdout.trim()==='',dirty.status===0?(dirty.stdout.trim()||'clean'):'Git status unavailable');
for(const f of required){const full=path.join(root,f);add('present:'+f,fs.existsSync(full),f);if(fs.existsSync(full)){const syn=run(process.execPath,['--check',full]);add('syntax:'+f,syn.status===0,syn.status===0?'valid':syn.stderr.slice(0,350));}}
const route='Data/marion/routes/lingosentinelPublicTranslationBoundaryRoutes.js';add('public_translation_route',fs.existsSync(path.join(root,route)),route);
const adapter=path.join(root,'Utils/marionNeonIntelligence.js');if(fs.existsSync(adapter)){const s=fs.readFileSync(adapter,'utf8');add('private_authorization_guard',/trustedPrivateSession|server-verified-session/.test(s),'server-verified authorization marker');add('model_response_validation',/choices|output/.test(s),'gateway response decoding marker');}
const results={schema:'sandblast.parallel_release_gate/1',generatedAt:new Date().toISOString(),revision:git.status===0?git.stdout.trim():null,root,checks,blocked:checks.filter(x=>x.status==='BLOCKED').map(x=>x.name),certification:{phaseA_MarionNeon:'LIVE_TEST_REQUIRED',phaseB_LingoSentinel:'LIVE_TEST_REQUIRED',phaseC_Ecosystem:'LIVE_TEST_REQUIRED'},decision:'DO_NOT_DEPLOY_UNTIL_ALL_REQUIRED_GATES_PASS'};
console.log(JSON.stringify(results,null,2));process.exitCode=results.blocked.length?1:0;

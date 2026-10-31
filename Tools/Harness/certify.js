'use strict';
// Read-only checks against a checkout. Does not invoke protected production services.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(process.argv[2]||process.cwd());
const exists=p=>fs.existsSync(path.join(root,p));
const read=p=>exists(p)?fs.readFileSync(path.join(root,p),'utf8'):'';
const findings=[];
function check(id,ok,detail,priority='required'){findings.push({id,status:ok?'PASS':'BLOCKED',priority,detail});}
const marion='Data/marion/runtime/marionBridge.js';
const neon='Utils/marionNeonIntelligence.js';
const lingo='Data/marion/routes/lingosentinelPublicTranslationBoundaryRoutes.js';
const index=read('index.js');
check('marion.bridge.exists',exists(marion),marion);
check('neon.adapter.exists',exists(neon),neon);
check('neon.adapter.auth.guard',/trustedPrivateSession|server-verified-session/.test(read(neon)), 'Server-verified session required');
check('neon.adapter.model',/NEON_AI_GATEWAY_MODEL|MARION_NEON_MODEL/.test(read(neon)), 'Configurable model identifier');
check('neon.adapter.invocation',/requestIntelligence/.test(read(neon)), 'Private advisory method');
const match=[...index.matchAll(/(?:require\s*\(\s*['"])([^'"]*lingosentinel[^'"]*)['"]\s*\)/gi)].map(x=>x[1]);
check('lingosentinel.route.exists',exists(lingo),exists(lingo)?'Expected public boundary file exists':'Missing expected public boundary file');
check('lingosentinel.route.reference',match.length>0,'Index LingoSentinel require references: '+JSON.stringify(match),'informational');
for(const f of ['MarionEcosystemGateway','MarionEcosystemComponentBootstrap','MarionEcosystemStartup']){
 const p=`Data/marion/runtime/ecosystem/${f}.js`;check('ecosystem.'+f,exists(p),p);
}
const bridge=read(marion);
check('bridge.neon.handoff.reference',/neonModelAdvisory|privateNeonAdvisory|marionNeonIntelligence/.test(bridge),'Code reference to private Neon advisory');
check('bridge.final.envelope.reference',/marionFinalEnvelope|finalEnvelope/i.test(bridge),'Final-answer envelope reference');
const report={schema:'sandblast.certification/1',checkedAt:new Date().toISOString(),checkout:root,checkoutFingerprint:crypto.createHash('sha256').update([index,read(marion),read(neon)].join('\n')).digest('hex').slice(0,16),findings,summary:{passed:findings.filter(x=>x.status==='PASS').length,blocked:findings.filter(x=>x.status==='BLOCKED'&&x.priority==='required').length},live:{marionPrivateRequest:'NOT_RUN',neonGatewayInvocation:'NOT_RUN',modelIdFromGateway:'NOT_RUN',finalAnswerHandoff:'NOT_RUN',lingoTranslation:'NOT_RUN',crmMediaChronicleGuardians:'NOT_RUN'}};
console.log(JSON.stringify(report,null,2));
if(process.env.SANDBLAST_CERT_REPORT)fs.writeFileSync(process.env.SANDBLAST_CERT_REPORT,JSON.stringify(report,null,2));
process.exitCode=report.summary.blocked?1:0;

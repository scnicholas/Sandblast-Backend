'use strict';
// Standalone safe connectivity diagnostic. Does not edit backend, database or GitHub.
const https = require('node:https');
const token = process.env.NEON_AI_GATEWAY_TOKEN;
const rawBase = process.env.NEON_AI_GATEWAY_BASE_URL;
const model = process.env.NEON_AI_GATEWAY_MODEL || 'gpt-5-mini';
function report(status, detail) { console.log(`[${status}] ${detail}`); }
if (!token || !rawBase) { report('BLOCKED','Missing NEON_AI_GATEWAY_TOKEN or NEON_AI_GATEWAY_BASE_URL in this process.'); process.exit(2); }
let url;
try { url = new URL(rawBase); } catch { report('BLOCKED','Invalid Gateway base URL.'); process.exit(2); }
if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || (url.pathname && url.pathname !== '/')) {
  report('BLOCKED','Gateway base URL must be an HTTPS origin without credentials, query or path.'); process.exit(2);
}
if (!/^[A-Za-z0-9._:/-]{1,120}$/.test(model)) { report('BLOCKED','Invalid model identifier.'); process.exit(2); }
const endpoint = new URL('/v1/chat/completions', url.origin);
const body = JSON.stringify({ model, max_completion_tokens: 120, messages: [
  {role:'system', content:'You are a connectivity tester. Reply with exactly the word READY.'},
  {role:'user', content:'Connectivity test. Respond READY.'}
] });
report('CHECK','Using configured HTTPS gateway origin; credentials will never be displayed.');
report('CHECK',`Model: ${model}`);
const req = https.request(endpoint, {method:'POST', timeout:12000,headers:{'Authorization':`Bearer ${token}`,'Content-Type':'application/json','Content-Length':Buffer.byteLength(body)}}, res => {
  let buf=''; res.on('data',chunk=>{if(buf.length<262144)buf+=chunk;}); res.on('end',()=>{
    if(res.statusCode!==200){report('FAIL',`Gateway returned HTTP ${res.statusCode}. Response body suppressed to avoid secrets.`);process.exitCode=1;return;}
    let parsed;try{parsed=JSON.parse(buf);}catch{report('FAIL','HTTP 200 but response is not valid JSON.');process.exitCode=1;return;}
    const content=parsed?.choices?.[0]?.message?.content;
    if(typeof content!=='string'||!content.trim()){report('FAIL','HTTP 200 but no nonempty chat reply found.');process.exitCode=1;return;}
    report('PASS','Gateway authenticated and returned a nonempty model reply.');
    report(content.trim()==='READY'?'PASS':'CHECK',content.trim()==='READY'?'Model returned expected sentinel.':'Model response was nonempty but did not match sentinel (contents suppressed).');
    report('NEXT','This proves gateway/model connectivity only, not Marion private-route integration.');
  });
});
req.on('timeout',()=>req.destroy(new Error('timeout')));
req.on('error',err=>{report('FAIL',err.message==='timeout'?'Gateway request timed out.':'Gateway request failed; network/TLS/configuration should be checked.');process.exitCode=1;});
req.end(body);

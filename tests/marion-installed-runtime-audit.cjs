"use strict";
/** Read-only installed runtime inventory. Never imports private code, reads credentials,
 * or logs text/IDs. Run from the backend root. */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const targets = [
 'Data/marion/runtime/MarionVoiceGateway.js',
 'Data/marion/runtime/marionBridge.js',
 'Data/marion/runtime/composeMarionResponse.js',
 'Data/marion/runtime/marionFinalEnvelope.js',
 'Data/marion/runtime/marionCurrentTurnAuthority.js',
 'Data/marion/runtime/marionIntentRouter.js',
 'Data/marion/runtime/marionCommandNormalizer.js',
 'Data/marion/runtime/marionLoopGuard.js',
 'Data/marion/runtime/emotion/emotionRuntime.js',
 'Data/marion/runtime/marionAdminRuntimeSafety.js',
 'tests/gateway-contract.test.js',
 'tests/marion-private-finance-boundary.test.cjs'
];
const sha = b=>crypto.createHash('sha256').update(b).digest('hex');
function fingerprint(rel) {const name=path.join(root,rel);try {
const st=fs.statSync(name);if(!st.isFile())return {file:rel,present:false};
return {file:rel,present:true,bytes:st.size,sha256:sha(fs.readFileSync(name))};
}catch(_){return {file:rel,present:false};}}
const report={kind:'marion_installed_runtime_inventory_v1',rootDescriptor:'cwd_backend',files:targets.map(fingerprint)};
process.stdout.write(JSON.stringify(report,null,2)+'\n');

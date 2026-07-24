'use strict';
const assert=require('assert');const fs=require('fs');const path=require('path');const root=path.resolve(__dirname,'..','..');
const index=fs.readFileSync(path.join(root,'index.js'),'utf8');
['LingoSentinelDeliveryRoute','LingoSentinelRecoveryRoute','lingosentinel-public-delivery-client.js','lingosentinel-public-message-integrity.js','lingosentinel-public-recovery-client.js','lingosentinel-widget-message-state-controller.js','lingosentinel-widget-conversation-recovery.js','LINGOSENTINEL_LAYERS_8_10_CRITICAL_VERSION'].forEach(x=>assert.ok(index.includes(x),x));
assert.ok(index.includes('/api/lingosentinel/delivery/health'));assert.ok(index.includes('/api/lingosentinel/recovery/health'));assert.ok(index.includes('x-lingosentinel-membership'));
const DeliveryRoute=require(path.join(root,'Data','marion','runtime','LingoSentinel','LingoSentinelDeliveryRoute'));const RecoveryRoute=require(path.join(root,'Data','marion','runtime','LingoSentinel','LingoSentinelRecoveryRoute'));assert.ok(DeliveryRoute.stack.length>=5);assert.ok(RecoveryRoute.stack.length>=5);
console.log(JSON.stringify({ok:true,passed:12,suite:'LingoSentinel Layers 8-10 route contracts'},null,2));

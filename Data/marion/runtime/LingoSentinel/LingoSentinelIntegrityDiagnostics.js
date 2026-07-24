'use strict';
const VERSION='nyx.lingosentinel.integrityDiagnostics/9.0-redacted';
const counters={duplicatePublications:0,replayBlocked:0,sequenceGaps:0,reordered:0,idempotencyConflicts:0};
function record(name,count=1){if(Object.prototype.hasOwnProperty.call(counters,name))counters[name]+=Math.max(1,Number(count)||1);}
function snapshot(){return{ok:true,service:'LingoSentinelIntegrityDiagnostics',version:VERSION,counters:{...counters},messageContentStored:false,identityDetailsStored:false};}
function reset(){Object.keys(counters).forEach(k=>counters[k]=0);}
module.exports=Object.freeze({VERSION,record,snapshot,reset});

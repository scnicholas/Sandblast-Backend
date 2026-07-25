'use strict';
const VERSION='nyx.lingosentinel.contextDiagnostics/12.0-redacted';
const counters={ambiguityFlags:0,protectedTermFailures:0,lowConfidence:0,originalOnly:0,translationFailures:0};
function record(name,n=1){if(Object.prototype.hasOwnProperty.call(counters,name))counters[name]+=Number(n)||1;return counters[name];}
function snapshot(){return {version:VERSION,counters:{...counters},messageContentStored:false,credentialsStored:false,public:false};}
function reset(){Object.keys(counters).forEach(k=>counters[k]=0);}
module.exports=Object.freeze({VERSION,record,snapshot,reset,getHealth:()=>({ok:true,service:'LingoSentinelContextDiagnostics',...snapshot()})});

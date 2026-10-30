
'use strict';
const VERSION='marion.radioEcosystemAdapter/4.0';
const COMPONENT='sandblast-radio';
const EVENTS=Object.freeze(['radio.play','radio.stop','radio.session']);
function register(Registry,Permissions){
  const r=Registry.register({id:COMPONENT,name:'Sandblast Radio',version:VERSION,type:'media-service',publicSurface:true,status:'ready',capabilities:['radio-events','session-signals'],reads:[COMPONENT+'.public'],writes:[COMPONENT+'.telemetry'],commands:[],metadata:{ecosystemPhase:4,telemetryOnly:true,playbackIndependent:true,directMediaControl:false}});
  Permissions.setPolicy(COMPONENT,{read:[COMPONENT+'.public'],write:[COMPONENT+'.telemetry'],request:['marion.analysis'],execute:[]});
  return r;
}
module.exports=Object.freeze({VERSION,COMPONENT,EVENTS,register});

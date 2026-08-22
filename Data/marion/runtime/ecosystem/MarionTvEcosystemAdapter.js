
'use strict';
const VERSION='marion.tvEcosystemAdapter/4.0';
const COMPONENT='sandblast-tv';
const EVENTS=Object.freeze(['tv.content_open','tv.content_complete','tv.watch_duration']);
function register(Registry,Permissions){
  const r=Registry.register({id:COMPONENT,name:'Sandblast TV',version:VERSION,type:'media-service',publicSurface:true,status:'ready',capabilities:['television-events','content-engagement','watch-duration'],reads:[COMPONENT+'.public'],writes:[COMPONENT+'.telemetry'],commands:[],metadata:{ecosystemPhase:4,telemetryOnly:true,playbackIndependent:true,directMediaControl:false}});
  Permissions.setPolicy(COMPONENT,{read:[COMPONENT+'.public'],write:[COMPONENT+'.telemetry'],request:['marion.analysis'],execute:[]});
  return r;
}
module.exports=Object.freeze({VERSION,COMPONENT,EVENTS,register});

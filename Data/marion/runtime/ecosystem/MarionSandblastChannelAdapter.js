
'use strict';
const VERSION='marion.sandblastChannelAdapter/4.0';
const COMPONENT='sandblast-channel';
const EVENTS=Object.freeze(['page.view','page.cta_click','advertising.inquiry','roku.outbound_click','apple.outbound_click']);
function register(Registry,Permissions){
  const r=Registry.register({id:COMPONENT,name:'Sandblast Channel',version:VERSION,type:'media-platform',publicSurface:true,status:'ready',capabilities:['page-events','cta-events','advertising-signals','outbound-platform-events'],reads:[COMPONENT+'.public'],writes:[COMPONENT+'.telemetry'],commands:[],metadata:{ecosystemPhase:4,telemetryOnly:true,directMediaControl:false}});
  Permissions.setPolicy(COMPONENT,{read:[COMPONENT+'.public'],write:[COMPONENT+'.telemetry'],request:['marion.analysis'],execute:[]});
  return r;
}
module.exports=Object.freeze({VERSION,COMPONENT,EVENTS,register});

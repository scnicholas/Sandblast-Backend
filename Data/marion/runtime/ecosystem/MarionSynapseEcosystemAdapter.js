
'use strict';
const VERSION='marion.synapseEcosystemAdapter/4.0';
const COMPONENT='synapse';
const EVENTS=Object.freeze(['synapse.story_open','synapse.category_open']);
function register(Registry,Permissions){
  const r=Registry.register({id:COMPONENT,name:'Synapse',version:VERSION,type:'content-intelligence',publicSurface:true,status:'ready',capabilities:['news-events','content-events','category-signals'],reads:[COMPONENT+'.public'],writes:[COMPONENT+'.telemetry'],commands:[],metadata:{ecosystemPhase:4,telemetryOnly:true,directContentControl:false}});
  Permissions.setPolicy(COMPONENT,{read:[COMPONENT+'.public'],write:[COMPONENT+'.telemetry'],request:['marion.analysis'],execute:[]});
  return r;
}
module.exports=Object.freeze({VERSION,COMPONENT,EVENTS,register});

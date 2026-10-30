'use strict';

const Contract = require('./MarionEcosystemContract');
const Registry = require('./MarionComponentRegistry');

const VERSION = 'marion.ecosystemPermissions/1.0';
const DEFAULT_POLICY = Object.freeze({
  nyx:{read:['lingosentinel.state','sandblast-channel.public'],write:['nyx.state'],request:['marion.reasoning','lingosentinel.translation'],execute:[]},
  lingosentinel:{read:['nyx.session','lingosentinel.state'],write:['lingosentinel.state'],request:['marion.reasoning'],execute:[]},
  crm:{read:['crm.leads','crm.metrics'],write:[],request:['marion.analysis','marion.recommendation'],execute:[]},
  'sandblast-channel':{read:['sandblast-channel.public'],write:['sandblast-channel.telemetry'],request:['marion.analysis'],execute:[]},
  'sandblast-radio':{read:['sandblast-radio.public'],write:['sandblast-radio.telemetry'],request:['marion.analysis'],execute:[]},
  'sandblast-tv':{read:['sandblast-tv.public'],write:['sandblast-tv.telemetry'],request:['marion.analysis'],execute:[]},
  synapse:{read:['synapse.public'],write:['synapse.telemetry'],request:['marion.analysis'],execute:[]},
  chronicle:{read:['chronicle.sources','lingosentinel.context'],write:['chronicle.state'],request:['marion.reasoning','lingosentinel.translation'],execute:[]},
  'project-guardians':{read:['project-guardians.state'],write:['project-guardians.state'],request:['marion.reasoning'],execute:[]},
  marion:{read:['*'],write:['marion.state'],request:['*'],execute:[]}
});
const policy=new Map();
function clean(value,max=120){return String(value==null?'':value).replace(/[\u0000-\u001f\u007f]/g,'').trim().slice(0,max);}
function unique(values){return Array.from(new Set((Array.isArray(values)?values:[]).map(value=>clean(value,120)).filter(Boolean)));}
function normalizeRule(rule={}){return{read:unique(rule.read),write:unique(rule.write),request:unique(rule.request),execute:unique(rule.execute)};}
function setPolicy(component,rule={}){
  const id=Contract.normalizeComponent(component);
  if(!Registry.has(id))return{ok:false,error:'component_not_registered'};
  const normalized=normalizeRule(rule);policy.set(id,normalized);return{ok:true,component:id,policy:{...normalized}};
}
function getPolicy(component){const value=policy.get(Contract.normalizeComponent(component));return value?{read:[...value.read],write:[...value.write],request:[...value.request],execute:[...value.execute]}:null;}
function matches(granted,requested){if(granted==='*'||granted===requested)return true;if(granted.endsWith('.*'))return requested.startsWith(granted.slice(0,-1));return false;}
function authorize(component,action,resource){
  const id=Contract.normalizeComponent(component),act=clean(action,24).toLowerCase(),target=clean(resource,120);
  if(!Registry.has(id))return{ok:false,decision:'deny',reason:'component_not_registered'};
  if(!['read','write','request','execute'].includes(act))return{ok:false,decision:'deny',reason:'action_invalid'};
  const rules=policy.get(id)||normalizeRule({}),allowed=rules[act].some(grant=>matches(grant,target));
  return{ok:allowed,decision:allowed?'allow':'deny',component:id,action:act,resource:target,reason:allowed?'policy_match':'policy_no_match'};
}
function bootstrapDefaults(){for(const [component,rule] of Object.entries(DEFAULT_POLICY))setPolicy(component,rule);return true;}
function getHealth(){return{ok:true,service:'MarionEcosystemPermissions',version:VERSION,policies:policy.size};}
function resetForTests(){policy.clear();bootstrapDefaults();}
bootstrapDefaults();
module.exports=Object.freeze({VERSION,DEFAULT_POLICY,setPolicy,getPolicy,authorize,bootstrapDefaults,getHealth,resetForTests});

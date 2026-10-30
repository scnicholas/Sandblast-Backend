
'use strict';

const Media = require('./MarionMediaEcosystemAdapter');
const Router = require('./MarionMediaEventRouter');
const Intelligence = require('./MarionMediaIntelligenceAggregator');
const Registry = require('./MarionComponentRegistry');
const Permissions = require('./MarionEcosystemPermissions');

const VERSION='marion.ecosystemPhase4Bootstrap/4.0';
let booted=false,bootedAt=0;

function bootstrap(){
  if(booted)return {...getHealth(),alreadyBooted:true};
  let media,routes;try{media=Media.registerAll();routes=Router.install();}catch(_){booted=false;return{ok:false,service:'MarionEcosystemPhase4Bootstrap',version:VERSION,booted:false,error:'media_bootstrap_failed'};}
  booted=media.ok===true&&routes.ok===true&&['sandblast-channel','sandblast-radio','sandblast-tv','synapse'].every(id=>!!Registry.get(id)&&!!Permissions.getPolicy(id));
  if(booted&&!bootedAt)bootedAt=Date.now();
  return{ok:booted,service:'MarionEcosystemPhase4Bootstrap',version:VERSION,booted,bootedAt,media,routes,controls:{telemetryOnly:true,directMediaControl:false,rawEventMarionStreaming:false,aggregatedAnalysis:true}};
}

function getHealth(){return{ok:booted&&Media.getHealth().ok&&Router.getHealth().ok&&['sandblast-channel','sandblast-radio','sandblast-tv','synapse'].every(id=>!!Registry.get(id)&&!!Permissions.getPolicy(id)),service:'MarionEcosystemPhase4Bootstrap',version:VERSION,booted,bootedAt,media:Media.getHealth(),routes:Router.getHealth(),components:['sandblast-channel','sandblast-radio','sandblast-tv','synapse'].map(id=>Registry.get(id)),permissions:['sandblast-channel','sandblast-radio','sandblast-tv','synapse'].map(id=>({id,policy:Permissions.getPolicy(id)})),controls:{telemetryOnly:true,directMediaControl:false,rawEventMarionStreaming:false,aggregatedAnalysis:true}};}

function resetForTests(){booted=false;bootedAt=0;Router.resetForTests();}

module.exports=Object.freeze({VERSION,bootstrap,getHealth,resetForTests});


'use strict';

const Media = require('./MarionMediaEcosystemAdapter');
const Router = require('./MarionMediaEventRouter');
const Intelligence = require('./MarionMediaIntelligenceAggregator');
const Registry = require('./MarionComponentRegistry');
const Permissions = require('./MarionEcosystemPermissions');

const VERSION='marion.ecosystemPhase4Bootstrap/4.0';
let booted=false,bootedAt=0;

function bootstrap(){
  const media=Media.registerAll(), routes=Router.install();
  booted=media.ok===true&&routes.ok===true;
  if(booted&&!bootedAt)bootedAt=Date.now();
  return{ok:booted,service:'MarionEcosystemPhase4Bootstrap',version:VERSION,booted,bootedAt,media,routes,controls:{telemetryOnly:true,directMediaControl:false,rawEventMarionStreaming:false,aggregatedAnalysis:true}};
}

function getHealth(){return{ok:booted&&Media.getHealth().ok&&Router.getHealth().ok,service:'MarionEcosystemPhase4Bootstrap',version:VERSION,booted,bootedAt,media:Media.getHealth(),routes:Router.getHealth(),components:['sandblast-channel','sandblast-radio','sandblast-tv','synapse'].map(id=>Registry.get(id)),permissions:['sandblast-channel','sandblast-radio','sandblast-tv','synapse'].map(id=>({id,policy:Permissions.getPolicy(id)})),controls:{telemetryOnly:true,directMediaControl:false,rawEventMarionStreaming:false,aggregatedAnalysis:true}};}

function resetForTests(){booted=false;bootedAt=0;Router.resetForTests();}

module.exports=Object.freeze({VERSION,bootstrap,getHealth,resetForTests});

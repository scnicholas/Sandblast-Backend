'use strict';

const Registry=require('./MarionComponentRegistry');
const Permissions=require('./MarionEcosystemPermissions');
const Nyx=require('./MarionNyxEcosystemAdapter');
const Lingo=require('./MarionLingoSentinelEcosystemAdapter');

const VERSION='marion.ecosystemComponentBootstrap/2.0';
let booted=false;

function bootstrap(options={}){
  const nyx=Nyx.register();
  const lingo=Lingo.register();
  Permissions.setPolicy('nyx',{read:['lingosentinel.state','sandblast-channel.public'],write:['nyx.state'],request:['marion.reasoning','lingosentinel.translation'],execute:[]});
  Permissions.setPolicy('lingosentinel',{read:['nyx.session','lingosentinel.state'],write:['lingosentinel.state'],request:['marion.reasoning'],execute:[]});
  booted=true;
  return{ok:true,service:'MarionEcosystemComponentBootstrap',version:VERSION,bootedAt:Date.now(),components:{nyx:Registry.get('nyx'),lingosentinel:Registry.get('lingosentinel')},results:{nyx,lingo},strict:options.strict===true};
}
function getHealth(){const nyx=Nyx.getHealth(),lingo=Lingo.getHealth();return{ok:booted&&nyx.ok,service:'MarionEcosystemComponentBootstrap',version:VERSION,booted,nyx,lingosentinel:lingo};}
function resetForTests(){booted=false;}
module.exports=Object.freeze({VERSION,bootstrap,getHealth,resetForTests});

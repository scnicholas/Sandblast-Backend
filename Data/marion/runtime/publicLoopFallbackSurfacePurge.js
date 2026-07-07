"use strict";
/** Phase 2B compatibility alias. */
let lock=null;try{lock=require("./publicSurfaceIdentityLock.js");}catch(_){lock={};}
module.exports=Object.assign({VERSION:"nyx.publicLoopFallbackSurfacePurge/phase3d-alias"},lock);

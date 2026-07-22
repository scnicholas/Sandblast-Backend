"use strict";
const assert=require("assert");
const path=require("path");
for(const file of ["composeMarionResponse.js","marionBridge.js","marionFinalEnvelope.js"]){
  const mod=require(path.join(__dirname,"..","Data","marion","runtime",file));
  assert.equal(mod.MARION_LAYERS_7_8_ACTIVE_PATH_REPAIR_VERSION,"marion.layers78.activePathRepair/2.0");
  assert.equal(typeof mod.projectMarionLayers78ActivePath,"function");
  const input={
    directMarionAdminInterface:true,
    deliveryChannel:"marion-admin-console",
    userText:"Focus on the mobile layout.",
    previousMemory:{activeTopic:"advertising page architecture",activeObjective:"review the advertising page architecture",lastUserText:"Review the advertising page architecture.",lastAssistantReply:"Still with you, Mac."}
  };
  const projected=mod.projectMarionLayers78ActivePath({reply:"I'm here, Mac.",payload:{reply:"I'm here, Mac."},finalEnvelope:{reply:"I'm here, Mac."}},input);
  assert.match(projected.reply,/focus on the mobile layout/i);
  assert.equal(projected.layer7.relation,"refinement");
  assert.equal(projected.layer8.conversationalNeed,"continuation");
  assert.equal(projected.privateBoundary.agent,"marion");
  assert.equal(projected.privateBoundary.nyxVisibleIdentityAllowed,false);
  assert.equal(projected.final,true);
  assert.equal(projected.canEmit,true);
}
console.log("Marion Layers 7-8 active-path repair tests passed.");

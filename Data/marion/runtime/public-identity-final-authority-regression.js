"use strict";
const fs=require("fs"),path=require("path"),assert=require("assert");
const root=__dirname;
const backendRoot=path.resolve(root,"..","..","..");
const chatPath=path.join(backendRoot,"utils","chatEngine.js");
const routerPath=path.join(root,"marionIntentRouter.js");

assert.ok(fs.existsSync(chatPath),`Required file missing: ${chatPath}`);
assert.ok(fs.existsSync(routerPath),`Required file missing: ${routerPath}`);

const chat=fs.readFileSync(chatPath,"utf8");
const router=fs.readFileSync(routerPath,"utf8");
const reply="Marion is Sandblast’s private cognitive coordination layer. She supports deeper reasoning, context continuity, routing, and response shaping behind the scenes, while I remain Nyx, the public-facing Sandblast assistant. Private operator functions and owner-only information are not exposed through this interface.";
assert.ok(chat.includes("NYX_PUBLIC_MARION_IDENTITY_FINAL_AUTHORITY_R2_START"));
assert.ok(chat.includes("nyx_public_marion_identity_final_authority"));
assert.ok(chat.includes(reply));
assert.ok(router.includes("MARION_PUBLIC_IDENTITY_ROUTE_FINAL_LOCK_R2_START"));
assert.ok(router.includes('subIntent:"public_marion_identity"'));
assert.ok(router.includes('confidence:0.99'));
assert.ok(chat.lastIndexOf("NYX_PUBLIC_MARION_IDENTITY_FINAL_AUTHORITY_R2_START") > chat.lastIndexOf("MARION_LEAN_UI_PRESENCE_CONTRACT_V1_END"));
assert.ok(router.lastIndexOf("MARION_PUBLIC_IDENTITY_ROUTE_FINAL_LOCK_R2_START") > router.lastIndexOf("MARION_ROUND3_COGNITIVE_RESILIENCE_COHESION_V1_END"));
console.log("PASS Nyx/Marion public identity final-authority regression");
console.log(`chatEngine: ${chatPath}`);
console.log(`marionIntentRouter: ${routerPath}`);

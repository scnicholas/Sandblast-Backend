"use strict";
const fs=require("fs"),path=require("path"),assert=require("assert");
const root=__dirname;
const files={
  chat:fs.readFileSync(path.join(root,"chatEngine.js"),"utf8"),
  router:fs.readFileSync(path.join(root,"marionIntentRouter.js"),"utf8"),
  composer:fs.readFileSync(path.join(root,"composeMarionResponse.js"),"utf8")
};
const replies={"marion_access": "Marion operates as Sandblast’s private cognitive coordination layer and is not directly accessible through the public interface. You’re speaking with Nyx, who can help with Sandblast, radio, TV, media, AI, and business tools.", "owner_only_information": "I can’t display owner-only information through the public Sandblast interface. I can still help with public information about Sandblast, radio, TV, media, AI, or business tools.", "private_instructions": "I can’t reveal private system instructions, protected configuration, or owner-only operating details. I can explain Sandblast’s public features and capabilities without exposing restricted information.", "internal_reasoning": "I can’t expose private internal reasoning, hidden processing, or protected diagnostic details. I can provide a clear public answer or a concise explanation of the result instead."};
for(const marker of[
  "NYX_PUBLIC_SECURITY_BOUNDARY_FINAL_AUTHORITY_R3_START",
  "MARION_PUBLIC_SECURITY_BOUNDARY_ROUTE_LOCK_R3_START",
  "MARION_PUBLIC_SECURITY_BOUNDARY_COMPOSER_AUTHORITY_R3_START"
])assert.ok(Object.values(files).some(text=>text.includes(marker)),`Missing ${marker}`);
for(const reply of Object.values(replies)){
  assert.ok(files.chat.includes(reply),"chatEngine missing boundary reply");
  assert.ok(files.composer.includes(reply),"composer missing boundary reply");
}
for(const id of["marion_access","owner_only_information","private_instructions","internal_reasoning"]){
  assert.ok(files.chat.includes(id),`chatEngine missing ${id}`);
  assert.ok(files.router.includes(id),`router missing ${id}`);
  assert.ok(files.composer.includes(id),`composer missing ${id}`);
}
assert.ok(files.chat.lastIndexOf("NYX_PUBLIC_SECURITY_BOUNDARY_FINAL_AUTHORITY_R3_START")>files.chat.lastIndexOf("NYX_PUBLIC_MARION_IDENTITY_FINAL_AUTHORITY_R2_END"));
assert.ok(files.router.lastIndexOf("MARION_PUBLIC_SECURITY_BOUNDARY_ROUTE_LOCK_R3_START")>files.router.lastIndexOf("MARION_PUBLIC_IDENTITY_ROUTE_FINAL_LOCK_R2_END"));
assert.ok(files.composer.lastIndexOf("MARION_PUBLIC_SECURITY_BOUNDARY_COMPOSER_AUTHORITY_R3_START")>files.composer.lastIndexOf("MARION_ROUND43_FINAL_TIMEOUT_GUARD_V1_END"));
console.log("PASS Nyx public security-boundary final-authority regression");

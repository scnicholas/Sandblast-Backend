"use strict";
const fs=require("fs"),path=require("path"),assert=require("assert");
const root=__dirname;
const backendRoot=path.resolve(root,"..","..","..");
const paths={
  chat:path.join(backendRoot,"utils","chatEngine.js"),
  router:path.join(root,"marionIntentRouter.js")
};
for(const [name,filePath] of Object.entries(paths)){
  assert.ok(fs.existsSync(filePath),`Required ${name} file missing: ${filePath}`);
}
const files={
  chat:fs.readFileSync(paths.chat,"utf8"),
  router:fs.readFileSync(paths.router,"utf8")
};
const replies={"marion_identity": "Marion is Sandblast’s private cognitive coordination layer. She supports deeper reasoning, context continuity, routing, and response shaping behind the scenes, while I remain Nyx, the public-facing Sandblast assistant. Private operator functions and owner-only information are not exposed through this interface.", "marion_access": "Marion operates as Sandblast’s private cognitive coordination layer and is not directly accessible through the public interface. You’re speaking with Nyx, who can help with Sandblast, radio, TV, media, AI, and business tools.", "owner_only_information": "I can’t display owner-only information through the public Sandblast interface. I can still help with public information about Sandblast, radio, TV, media, AI, or business tools.", "private_instructions": "I can’t reveal private system instructions, protected configuration, or owner-only operating details. I can explain Sandblast’s public features and capabilities without exposing restricted information.", "internal_reasoning": "I can’t expose private internal reasoning, hidden processing, or protected diagnostic details. I can provide a clear public answer or a concise explanation of the result instead."};
assert.ok(files.chat.includes("NYX_PUBLIC_IDENTITY_SECURITY_MATRIX_FINAL_AUTHORITY_R4_START"));
assert.ok(files.router.includes("MARION_PUBLIC_IDENTITY_SECURITY_MATRIX_ROUTE_LOCK_R4_START"));
for(const [id,reply] of Object.entries(replies)){
  assert.ok(files.chat.includes(id),`chatEngine missing ${id}`);
  assert.ok(files.router.includes(id),`router missing ${id}`);
  assert.ok(files.chat.includes(reply),`chatEngine missing reply for ${id}`);
}
assert.ok(files.chat.includes('replyAuthority:"nyx_public_identity_security_matrix_final_authority"'));
assert.ok(files.router.includes('confidence:0.995'));
console.log("PASS Nyx identity/security matrix regression");
console.log(`chatEngine: ${paths.chat}`);
console.log(`marionIntentRouter: ${paths.router}`);

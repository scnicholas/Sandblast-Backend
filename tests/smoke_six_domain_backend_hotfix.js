"use strict";
const fs=require("fs");
const path=require("path");
const root=__dirname;
const checks=[
  ["index.js","buildSixDomainPublicKnowledgeAnswer","marion_six_domain_public_knowledge_recovery"],
  [path.join("marion","runtime","composeMarionResponse.js"),"buildSixDomainPublicKnowledgeAnswer","Cash flow is the movement"],
  [path.join("marion","runtime","marionBridge.js"),"buildSixDomainPublicKnowledgeAnswer","Least privilege is a cybersecurity principle"],
  [path.join("marion","runtime","marionDomainRegistry.js"),"cash_flow","machine_learning"]
];
for(const [file,...needles] of checks){
  const full=path.join(root,file);
  if(!fs.existsSync(full))throw new Error("Missing "+file);
  const text=fs.readFileSync(full,"utf8");
  for(const n of needles){
    if(!text.includes(n))throw new Error(file+" missing "+n);
  }
}
console.log("PASS six-domain Marion public knowledge backend hotfix static checks");

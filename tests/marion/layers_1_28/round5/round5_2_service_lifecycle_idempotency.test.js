"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {CORE_SERVICES,runIsolated}=require("./_round5_common.js");
function sourceFor(files,twice){return `"use strict";const assert=require("assert");const files=${JSON.stringify(files)};const loaded=[];for(const file of files){const a=require("./"+file);assert.ok(a&&(typeof a==="object"||typeof a==="function"),file+" failed CommonJS load");if(${twice?'true':'false'}){const b=require("./"+file);assert.strictEqual(a,b,file+" did not preserve CommonJS module identity");}loaded.push(file);}console.log(JSON.stringify({ok:true,loaded}));`;}
test("Round 5.2 service modules load idempotently in canonical order without circular warnings",()=>{const r=runIsolated("round5-2-canonical",sourceFor(CORE_SERVICES,true));assert.ok(r.durationMs<20000,"Canonical service load exceeded safety bound.");});
test("Round 5.2 service modules tolerate reverse load order without circular warnings",()=>{const r=runIsolated("round5-2-reverse",sourceFor([...CORE_SERVICES].reverse(),false));assert.ok(r.durationMs<20000,"Reverse service load exceeded safety bound.");});

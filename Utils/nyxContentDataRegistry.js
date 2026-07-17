"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const VERSION = "nyx.contentDataRegistry/1.0-phase3";
const ROOT = path.join(__dirname, "..", "Data");
const DEFINITIONS = Object.freeze({
  channels: {required:true, paths:["SandblastTV/channels.json","sandblasttv/channels.json","channels.json"]},
  cartoons: {required:true, paths:["SandblastTV/blocks/cartoons.json","sandblasttv/blocks/cartoons.json","cartoons.json"]},
  classic: {required:true, paths:["SandblastTV/blocks/classic.json","sandblasttv/blocks/classic.json","classic.json"]},
  radio: {required:false, paths:["Radio/programming.json","radio/programming.json","radio.json"]},
  synapse: {required:false, paths:["Synapse/feed.json","synapse/feed.json","synapse.json"]},
  lingosentinel: {required:false, paths:["LingoSentinel/languages.json","lingosentinel/languages.json","languages.json"]},
  apps: {required:false, paths:["Apps/catalog.json","apps/catalog.json","apps.json"]}
});
function object(v){return v&&typeof v==="object"&&!Array.isArray(v)?v:{}}
function resolveSource(name){const d=DEFINITIONS[name];if(!d)return null;for(const rel of d.paths){const file=path.join(ROOT,rel);if(fs.existsSync(file)&&fs.statSync(file).isFile())return{file,relativePath:rel}}return null}
function rows(value){const v=object(value),nested=object(v.data);for(const key of["items","programs","entries","schedule","channels","movies","cartoons","classics","languages","apps"]){if(Array.isArray(v[key]))return v[key];if(Array.isArray(nested[key]))return nested[key]}return Array.isArray(value)?value:[]}
function inspect(name){const definition=DEFINITIONS[name];if(!definition)return{source:name,status:"invalid",reason:"unknown_source"};const found=resolveSource(name);if(!found)return{source:name,required:definition.required,status:"pending",reason:"file_not_supplied",expectedPaths:definition.paths};try{const raw=fs.readFileSync(found.file,"utf8"),data=JSON.parse(raw),list=rows(data),valid=!!(data&&typeof data==="object"&&list.length);return{source:name,required:definition.required,status:valid?"ready":"invalid",reason:valid?"":"empty_or_unrecognized_catalog",relativePath:found.relativePath,itemCount:list.length,bytes:Buffer.byteLength(raw),checksum:crypto.createHash("sha256").update(raw).digest("hex").slice(0,16),updatedAt:String(object(data).updatedAt||object(data).lastStructuredAt||"")}}catch(error){return{source:name,required:definition.required,status:"invalid",reason:error instanceof SyntaxError?"json_parse_failed":"read_failed",relativePath:found.relativePath}}
}
function status(){const sources=Object.keys(DEFINITIONS).map(inspect),required=sources.filter(x=>x.required),ready=required.length>0&&required.every(x=>x.status==="ready");return{contract:"nyx.contentReadiness/1.0",version:VERSION,status:ready?"ready":"pending",releaseReady:ready,requiredReady:required.filter(x=>x.status==="ready").length,requiredTotal:required.length,sources,checkedAt:Date.now(),publicOnly:true}}
function catalog(name){const report=inspect(name);if(report.status!=="ready")return{...report,contract:"nyx.publicCatalog/1.0",items:[]};const found=resolveSource(name),data=JSON.parse(fs.readFileSync(found.file,"utf8"));return{contract:"nyx.publicCatalog/1.0",version:VERSION,source:name,status:"ready",items:rows(data),meta:{itemCount:report.itemCount,checksum:report.checksum,updatedAt:report.updatedAt}}}
function releaseValidation(){const content=status(),failures=content.sources.filter(x=>x.required&&x.status!=="ready").map(x=>({gate:"content:"+x.source,status:x.status,reason:x.reason}));return{contract:"nyx.releaseValidation/1.0",version:VERSION,status:failures.length?"blocked":"ready",releaseReady:failures.length===0,content,failures,privateSurfaceExposure:false,checkedAt:Date.now()}}
module.exports={VERSION,DEFINITIONS,resolveSource,rows,inspect,status,catalog,releaseValidation};

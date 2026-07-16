"use strict";
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const root = path.resolve(__dirname, "..");
process.env.SB_NYX_CHANNELS_CATALOG_PATH = path.join(root, "Data", "SandblastTV", "channels.json");
process.env.SB_NYX_CLASSIC_CATALOG_PATH = path.join(root, "Data", "SandblastTV", "blocks", "classic.json");
process.env.SB_NYX_CARTOON_CATALOG_PATH = path.join(root, "Data", "SandblastTV", "blocks", "cartoons.json");
process.env.SB_NYX_CATALOG_PREVIEW_LIMIT = "5";
process.env.SB_NYX_CATALOG_FULL_LIMIT = "50";

const { loadIndex } = require("./_index_harness.js");
const { backend } = loadIndex();

function publicInput(text){
  return {audience:"public",lane:"public_interface",presentationProfile:"public",publicSurfaceOnly:true,publicIdentityLock:true,text,message:text};
}

const movie = backend.buildNyxPublicFastPathDecision(publicInput("What movies are available?"));
assert.ok(movie);
assert.strictEqual(movie.intent,"movie_catalog");
assert.strictEqual(movie.routeType,"knowledge");
assert.strictEqual(movie.actionRequired,false);
assert.strictEqual(movie.validateAction,false);
assert.strictEqual(movie.catalog.activeCount,10);
assert.match(movie.reply,/Strangers on a Train/);
assert.match(movie.reply,/Alaska Seas/);
assert.match(movie.reply,/Crime Inc\./);
assert.doesNotMatch(movie.reply,/Detour|D\.O\.A\.|The Stranger,/);

const cartoon = backend.buildNyxPublicFastPathDecision(publicInput("What cartoons are available?"));
assert.ok(cartoon);
assert.strictEqual(cartoon.intent,"cartoon_catalog");
assert.strictEqual(cartoon.catalog.activeCount,10);
assert.match(cartoon.reply,/Superman/);
assert.match(cartoon.reply,/Popeye/);

const overview = backend.buildNyxPublicFastPathDecision(publicInput("What can I watch on Sandblast?"));
assert.ok(overview);
assert.strictEqual(overview.intent,"media_overview");
assert.match(overview.reply,/10 active classic-film selections/);
assert.match(overview.reply,/10 active cartoon selections/);

const response = backend.buildNyxPublicFastPathResponse(publicInput("What movies are available?"),"catalog_test",Date.now(),movie);
assert.strictEqual(response.actionRequired,false);
assert.strictEqual(response.validateAction,false);
assert.strictEqual(response.catalog.activeCount,10);
assert.strictEqual(response.payload.catalog.activeCount,10);
assert.strictEqual(response.finalEnvelope.catalog.activeCount,10);

const legal = backend.buildNyxPublicFastPathDecision(publicInput("Can I legally distribute copyrighted movies on Roku?"));
assert.ok(!legal || legal.intent !== "movie_catalog");

const navigation = backend.buildNyxPublicFastPathDecision(publicInput("Open Sandblast TV."));
assert.ok(navigation);
assert.strictEqual(navigation.intent,"navigation");
assert.ok(navigation.target);

// Prove future additions are discovered without code changes or a fixed slot ceiling.
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(),"nyx-catalog-r6-"));
const tempClassic = path.join(tempDir,"classic.json");
const manifest = JSON.parse(fs.readFileSync(process.env.SB_NYX_CLASSIC_CATALOG_PATH,"utf8"));
fs.writeFileSync(tempClassic,JSON.stringify(manifest,null,2));
process.env.SB_NYX_CLASSIC_CATALOG_PATH = tempClassic;

const before = backend.readNyxMediaCatalogR6("classic");
assert.strictEqual(before.activeCount,10);

manifest.slots.push({
  id:"classic-future-101",
  position:101,
  title:"Future Feature Test",
  sourceUrl:"https://example.invalid/future-feature-test.mp4",
  durationSeconds:5400,
  enabled:true,
  validationStatus:"pending",
  notes:""
});
fs.writeFileSync(tempClassic,JSON.stringify(manifest,null,2));
const now = new Date(Date.now()+2000);
fs.utimesSync(tempClassic,now,now);

const after = backend.readNyxMediaCatalogR6("classic");
assert.strictEqual(after.activeCount,11);
assert.ok(after.items.some((item)=>item.label==="Future Feature Test"));

const futureDecision = backend.buildNyxPublicFastPathDecision(publicInput("List all movies available."));
assert.strictEqual(futureDecision.intent,"movie_catalog");
assert.match(futureDecision.reply,/Future Feature Test/);
assert.strictEqual(futureDecision.catalog.activeCount,11);

fs.rmSync(tempDir,{recursive:true,force:true});
console.log("PASS: index dynamic media catalog retrieval and future-growth refresh");

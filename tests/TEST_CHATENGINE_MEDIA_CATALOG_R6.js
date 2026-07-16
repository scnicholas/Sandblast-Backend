"use strict";
const assert = require("assert");
const path = require("path");
const root = path.resolve(__dirname,"..");
process.env.SB_NYX_CHANNELS_CATALOG_PATH=path.join(root,"Data","SandblastTV","channels.json");
process.env.SB_NYX_CLASSIC_CATALOG_PATH=path.join(root,"Data","SandblastTV","blocks","classic.json");
process.env.SB_NYX_CARTOON_CATALOG_PATH=path.join(root,"Data","SandblastTV","blocks","cartoons.json");
process.env.SB_NYX_CATALOG_PREVIEW_LIMIT="5";

const chat=require("../Utils/chatEngine.js");
const input=(text)=>({audience:"public",lane:"public_interface",presentationProfile:"public",publicSurfaceOnly:true,publicIdentityLock:true,text,message:text});

const movie=chat.buildNyxPublicMediaDiscoveryFastReply(input("What movies are available?"));
assert.ok(movie);
assert.strictEqual(movie.meta.intent,"movie_catalog");
assert.strictEqual(movie.actionRequired,false);
assert.strictEqual(movie.validateAction,false);
assert.strictEqual(movie.catalog.activeCount,10);
assert.match(movie.reply,/Strangers on a Train/);
assert.match(movie.reply,/Crime Inc\./);

const cartoon=chat.buildNyxPublicMediaDiscoveryFastReply(input("What cartoons are available?"));
assert.ok(cartoon);
assert.strictEqual(cartoon.meta.intent,"cartoon_catalog");
assert.strictEqual(cartoon.catalog.activeCount,10);
assert.match(cartoon.reply,/Popeye/);

const legal=chat.buildNyxPublicMediaDiscoveryFastReply(input("Can I legally distribute copyrighted movies on Roku?"));
assert.strictEqual(legal,null);

console.log("PASS: ChatEngine dynamic media catalog coordinator");

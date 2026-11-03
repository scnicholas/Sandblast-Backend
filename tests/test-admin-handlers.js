"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const filename = path.resolve(__dirname, "../MarionLearningAdminHandlers.js");
const moduleObj = {exports:{}};
vm.runInNewContext(fs.readFileSync(filename, "utf8"), {
  require(name) {
    if (name === "node:crypto") return require("node:crypto");
    if (name === "./MarionLearningRuntime") return {isVerifiedOwner: ctx => !!ctx && ctx.authenticated === true && ctx.verifiedBy === "server_middleware" && ctx.role === "owner"};
    throw Error("unexpected_dependency:" + name);
  }, module:moduleObj, exports:moduleObj.exports, Buffer, Object, TypeError, Number, Promise
}, {filename});
const {createMarionLearningAdminHandlers} = moduleObj.exports;
let calls = [];
const runtime = {
  listAvailableManifests: async auth => {calls.push(["listAvailable",auth]);return {ok:true,manifests:[]}},
  issueFixtureReview: async (request,auth) => {calls.push(["issue",request,auth]);return {ok:true,reviewRef:request.reviewRef}},
  approveManifest: async (request,auth) => {calls.push(["approve",request,auth]);return {ok:true}},
  revokeManifest: async (request,auth) => {calls.push(["revoke",request,auth]);return {ok:true}},
  listApprovedManifests: async (scope,auth) => {calls.push(["approved",scope,auth]);return {ok:true,registrations:[]}},
  evaluateCandidate: async (candidate,manifest,auth) => {calls.push(["evaluate",candidate,manifest,auth]);return {ok:true,accepted:true}}
};
const owner = {authenticated:true,role:"owner",verifiedBy:"server_middleware"};
const handlers = createMarionLearningAdminHandlers({runtime,getVerifiedOwnerContext:async req=>req.serverOwner?owner:null});
const body = {datasetId:"synthetic",version:"v1",scope:"retrieval",ownerConsent:true};
(async()=>{
  assert.equal((await handlers.issueReview({body,serverOwner:false})).status,403);
  assert.equal(calls.length,0,"unauthorized action must not reach runtime");
  assert.equal((await handlers.issueReview({body:{...body,ownerConsent:false},serverOwner:true})).status,422);
  assert.equal(calls.length,0,"no review without consent");
  assert.equal((await handlers.issueReview({body,serverOwner:true})).status,200);
  assert.match(calls[0][1].reviewRef,/^review_[a-f0-9]{32}$/);
  assert.notEqual(calls[0][1].reviewRef,calls[0][1].reviewId);
  assert.equal((await handlers.listApproved({serverOwner:true,query:{scope:"routing"}})).status,200);
  assert.equal(calls[1][1],"routing");
  assert.equal((await handlers.listApproved({serverOwner:true,query:{scope:"bad"}})).status,422);
  assert.equal((await handlers.approve({serverOwner:true,body:{...body,reviewRef:"@"}})).status,422);
  assert.equal((await handlers.approve({serverOwner:true,body:{...body,reviewRef:"review_123"}})).status,200);
  assert.equal((await handlers.revoke({serverOwner:true,body:{datasetId:"synthetic",version:"v1",reasonCode:"obsolete"}})).status,200);
  assert.equal((await handlers.evaluate({serverOwner:true,body:{candidate:{test:true},manifest:body}})).status,200);
  assert.equal((await handlers.evaluate({serverOwner:true,body:{candidate:{test:true},manifest:{...body,scope:"bad"}}})).status,422);
  assert.equal((await handlers.evaluate({serverOwner:true,body:{candidate:{blob:"x".repeat(66000)},manifest:body}})).status,422);
  assert.equal(Object.prototype.hasOwnProperty.call(handlers,"capture"),false,"no capture authority added");
  console.log("PASS: owner verification, consent, ID/scope validation, GET query filtering, safe evaluation, no capture route");
})().catch(error=>{console.error(error);process.exitCode=1});

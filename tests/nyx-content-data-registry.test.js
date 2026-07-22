"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const registry=require("../Utils/nyxContentDataRegistry");
test("registry declares required programming sources",()=>{for(const name of["channels","cartoons","classic"])assert.equal(registry.DEFINITIONS[name].required,true)});
test("missing JSON remains pending and blocks release",()=>{const s=registry.status();assert.equal(s.contract,"nyx.contentReadiness/1.0");assert.equal(s.releaseReady,false);assert.equal(registry.releaseValidation().status,"blocked")});
test("catalog access is allowlisted and safe",()=>{assert.equal(registry.catalog("operator").status,"invalid");assert.deepEqual(registry.catalog("operator").items,[])});
test("release report never exposes a private surface",()=>{const r=registry.releaseValidation();assert.equal(r.privateSurfaceExposure,false);assert.ok(Array.isArray(r.failures))});

'use strict';

const assert=require('assert');
const {createCircuitBreaker}=require('../../Data/marion/runtime/LingoSentinel/MarionLingoSentinelCircuitBreaker');

let now=0;
const b=createCircuitBreaker({failureThreshold:2,cooldownMs:1000,clock:()=>now});
assert.equal(b.allow().ok,true);
b.failure();
assert.equal(b.snapshot().state,'closed');
b.failure();
assert.equal(b.snapshot().state,'open');
assert.equal(b.allow().ok,false);
now=1001;
const probe=b.allow();
assert.equal(probe.ok,true);
assert.equal(probe.state,'half_open');
b.success();
assert.equal(b.snapshot().state,'closed');
console.log('PASS marion_lingosentinel_phase4_circuit_test');

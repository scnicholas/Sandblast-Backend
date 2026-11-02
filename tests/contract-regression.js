'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const envelope = require('../Data/marion/runtime/marionFinalEnvelope.js');
const substantive = 'Marion treats external AI output as untrusted evidence, checks the claims against independent observations, and retains final decision authority.';
const input = {reply: substantive, prompt: 'Explain how Marion retains final decision authority.'};
const result = envelope.createMarionFinalEnvelope(input);
assert.equal(envelope.validateReplyContract(result.finalEnvelope).ok, true, 'canonical contract must validate');
assert.equal(result.finalEnvelope.completionStatus.complete, true, 'completion required');
assert.equal(result.finalEnvelope.reply, substantive, 'no synthesized substitute');
assert.equal(envelope.validateReplyContract({...result.finalEnvelope, reply:'tampered text'}).ok, false, 'tamper rejected');
assert.equal(envelope.validateReplyContract({...result.finalEnvelope, replySignature:'123'}).ok, false, 'signature mismatch rejected');
assert.equal(envelope.validateReplyContract({...result.finalEnvelope, completionStatus:{complete:false}}).ok, false, 'incomplete rejected');
for (const candidate of ['', 'I am here and tracking the turn.', 'Marion did not return a valid final.']) {
 const res = envelope.createMarionFinalEnvelope({reply:candidate, prompt:'Explain how Marion retains final decision authority.'});
 assert.notEqual(envelope.validateReplyContract(res && res.finalEnvelope).ok, true, 'invalid must not receive accepted final');
}
const blocked = envelope.createMarionFinalEnvelope({...input, blocked:true});
assert.notEqual(envelope.validateReplyContract(blocked && blocked.finalEnvelope).ok, true, 'blocked source not promoted');
const index = fs.readFileSync(path.join(root,'index.js'),'utf8');
assert(index.includes('authorityMatches') && index.includes('envelopeContractReasons'));
assert(!index.includes('    finalEnvelope.final, finalEnvelope.finalAnswer,'), 'boolean final not used as text candidate');
const composer = fs.readFileSync(path.join(root, 'Data/marion/runtime/composeMarionResponse.js'),'utf8');
assert(composer.includes('privateComposerFinalRejected') && composer.includes('privateNeonAdvisoryUsed:false'));
console.log('PASS: 12 critical contract assertions and private authority checks');

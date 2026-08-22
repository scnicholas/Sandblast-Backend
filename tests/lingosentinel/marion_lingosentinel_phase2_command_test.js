'use strict';

const assert = require('assert');
const Store = require('../../Data/marion/runtime/LingoSentinel/MarionLingoSentinelStateStore');
const Bridge = require('../../Data/marion/runtime/LingoSentinel/MarionLingoSentinelStateBridge');

Store.resetForTests();
Bridge.syncFromLingo({ sessionId:'phase2-command', sourceLanguage:'en', targetLanguage:'fr', layer:'language', mode:'one_to_one', speakerRole:'host', uiState:'dock' });
const q1 = Bridge.queueMarionCommand('phase2-command','setLanguage','es',{reason:'test'}); assert.equal(q1.ok,true);
const q2 = Bridge.queueMarionCommand('phase2-command','setCulture','traditions'); assert.equal(q2.ok,true);
const q3 = Bridge.queueMarionCommand('phase2-command','setSpeaker','remote'); assert.equal(q3.ok,true);
const list = Bridge.getCommands('phase2-command',0,20); assert.equal(list.commands.length,3); assert.equal(list.commands[0].action,'setLanguage');
const ack = Bridge.acknowledgeCommand({ sessionId:'phase2-command', commandId:list.commands[0].commandId, ok:true, appliedRevision:1 }); assert.equal(ack.ok,true); assert.equal(ack.command.status,'acked');
const remaining = Bridge.getCommands('phase2-command',0,20); assert.equal(remaining.commands.length,2);
console.log('PASS marion_lingosentinel_phase2_command_test');

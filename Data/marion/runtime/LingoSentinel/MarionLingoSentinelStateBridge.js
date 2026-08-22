'use strict';

const Contract = require('./MarionLingoSentinelStateContract');
const Store = require('./MarionLingoSentinelStateStore');

const VERSION = 'marion.lingosentinel.stateBridge/2.0';

function syncFromLingo(input = {}) {
  const state = Contract.normalizeState({ ...input, origin:input.origin || 'lingosentinel' });
  const valid = Contract.validateState(state);
  if (!valid.ok) return { ok:false, stage:'contract', errors:valid.errors };
  const result = Store.upsert(state);
  return { ...result, version:VERSION, contract:Contract.STATE_CONTRACT };
}

function getState(sessionId) {
  const state = Store.get(sessionId);
  return state ? { ok:true, state, version:VERSION } : { ok:false, errors:['session_not_found'], version:VERSION };
}

function queueMarionCommand(sessionId, action, value, options = {}) {
  const current = Store.get(sessionId);
  if (!current) return { ok:false, errors:['session_not_found'], version:VERSION };
  const result = Store.enqueue({
    sessionId, action, value, source:'marion', reason:options.reason,
    metadata:{ expectedRevision:current.revision, ...options.metadata }
  });
  return { ...result, version:VERSION };
}

function getCommands(sessionId, after = 0, limit = 20) {
  return { ...Store.list(sessionId, after, limit), version:VERSION };
}

function acknowledgeCommand(input = {}) {
  const result = Store.ack(input.sessionId, input.commandId, input);
  return { ...result, version:VERSION };
}

function contextForMarion(sessionId) {
  const state = Store.get(sessionId);
  if (!state) return null;
  return {
    sessionId:state.sessionId,
    conversationId:state.conversationId,
    roomId:state.roomId,
    sourceLanguage:state.sourceLanguage,
    targetLanguage:state.targetLanguage,
    cultureContext:state.cultureContext,
    layer:state.layer,
    mode:state.mode,
    speakerRole:state.speakerRole,
    participantId:state.participantId,
    translationStatus:state.translationStatus,
    marionStatus:state.marionStatus,
    uiState:state.uiState,
    stateRevision:state.revision
  };
}

function getHealth() { return { ...Store.getHealth(), service:'MarionLingoSentinelStateBridge', version:VERSION, contract:Contract.STATE_CONTRACT, commandContract:Contract.COMMAND_CONTRACT }; }

module.exports = Object.freeze({ VERSION, syncFromLingo, getState, queueMarionCommand, getCommands, acknowledgeCommand, contextForMarion, getHealth });

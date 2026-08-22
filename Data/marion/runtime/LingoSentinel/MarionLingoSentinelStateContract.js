'use strict';

const crypto = require('crypto');
const STATE_CONTRACT = 'marion.lingosentinel.state/2.0';
const COMMAND_CONTRACT = 'marion.lingosentinel.command/2.0';
const VALID_LAYERS = Object.freeze(['language','culture']);
const VALID_MODES = Object.freeze(['one_to_one','group_room','live_translate','delivered']);
const VALID_SPEAKERS = Object.freeze(['host','remote','intelligence']);
const VALID_UI_STATES = Object.freeze(['closed','dock','expanded']);
const VALID_COMMANDS = Object.freeze(['setLanguage','setCulture','setLayer','setMode','setSpeaker','open','close','expand']);

function text(v, max = 160) {
  return String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,max);
}
function obj(v) { return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; }
function id(v, prefix) {
  const s = text(v,128).replace(/[^a-zA-Z0-9._:-]/g,'-');
  return s || `${prefix}-${crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36)}`;
}
function oneOf(v, allowed, fallback) { const s = text(v,48); return allowed.includes(s) ? s : fallback; }
function bool(v, fallback = false) { return typeof v === 'boolean' ? v : fallback; }
function language(v, fallback = 'en') {
  const s = text(v || fallback,32).toLowerCase().replace(/_/g,'-');
  if (/^(en|eng|english|en-ca|en-us|en-gb)/.test(s)) return 'en';
  if (/^(fr|fre|fra|french|français|francais|fr-ca|fr-fr)/.test(s)) return 'fr';
  if (/^(es|spa|spanish|español|espanol|es-mx|es-es|es-419)/.test(s)) return 'es';
  return s.slice(0,16) || fallback;
}

function normalizeState(input = {}) {
  const p = obj(input.payload);
  const sourceLanguage = language(input.sourceLanguage || p.sourceLanguage || 'en');
  const targetLanguage = language(input.targetLanguage || p.targetLanguage || sourceLanguage);
  const uiState = oneOf(input.uiState || p.uiState, VALID_UI_STATES, bool(input.expanded || p.expanded) ? 'expanded' : bool(input.open || p.open) ? 'dock' : 'closed');
  return {
    contract: STATE_CONTRACT,
    sessionId: text(input.sessionId || p.sessionId,128),
    conversationId: text(input.conversationId || p.conversationId,128),
    roomId: text(input.roomId || p.roomId || 'lingosentinel-main',128),
    sourceLanguage,
    targetLanguage,
    cultureContext: text(input.cultureContext || p.cultureContext || 'general',80),
    layer: oneOf(input.layer || p.layer, VALID_LAYERS, 'language'),
    mode: oneOf(input.mode || p.mode, VALID_MODES, 'one_to_one'),
    speakerRole: oneOf(input.speakerRole || input.speaker || p.speakerRole || p.speaker, VALID_SPEAKERS, 'host'),
    participantId: text(input.participantId || p.participantId || 'host',128),
    translationStatus: text(input.translationStatus || p.translationStatus || 'ready',48),
    marionStatus: text(input.marionStatus || p.marionStatus || 'standby',48),
    uiState,
    connected: bool(input.connected ?? p.connected, true),
    origin: text(input.origin || p.origin || 'lingosentinel',32),
    observedRevision: Math.max(0, Number(input.observedRevision || p.observedRevision || 0) || 0),
    timestamp: Number.isFinite(+input.timestamp) ? +input.timestamp : Date.now(),
    metadata: obj(input.metadata)
  };
}

function validateState(value = {}) {
  const errors = [];
  if (!value || typeof value !== 'object') return { ok:false, errors:['state_required'] };
  if (value.contract !== STATE_CONTRACT) errors.push('contract_invalid');
  if (!text(value.sessionId,128)) errors.push('sessionId_required');
  if (!VALID_LAYERS.includes(value.layer)) errors.push('layer_invalid');
  if (!VALID_MODES.includes(value.mode)) errors.push('mode_invalid');
  if (!VALID_SPEAKERS.includes(value.speakerRole)) errors.push('speakerRole_invalid');
  if (!VALID_UI_STATES.includes(value.uiState)) errors.push('uiState_invalid');
  return { ok:!errors.length, errors };
}

function createCommand(input = {}) {
  const action = text(input.action,48);
  const command = {
    contract: COMMAND_CONTRACT,
    commandId: id(input.commandId,'cmd'),
    sessionId: text(input.sessionId,128),
    action,
    value: input.value == null ? '' : text(input.value,160),
    source: text(input.source || 'marion',32),
    reason: text(input.reason,240),
    issuedAt: Number.isFinite(+input.issuedAt) ? +input.issuedAt : Date.now(),
    metadata: obj(input.metadata)
  };
  if (action === 'setLanguage') command.value = language(command.value,'en');
  if (action === 'setLayer') command.value = oneOf(command.value, VALID_LAYERS, 'language');
  if (action === 'setMode') command.value = oneOf(command.value, VALID_MODES, 'one_to_one');
  if (action === 'setSpeaker') command.value = oneOf(command.value, VALID_SPEAKERS, 'host');
  return command;
}

function validateCommand(value = {}) {
  const errors = [];
  if (!value || typeof value !== 'object') return { ok:false, errors:['command_required'] };
  if (value.contract !== COMMAND_CONTRACT) errors.push('contract_invalid');
  if (!text(value.commandId,128)) errors.push('commandId_required');
  if (!text(value.sessionId,128)) errors.push('sessionId_required');
  if (!VALID_COMMANDS.includes(value.action)) errors.push('action_invalid');
  if (!['open','close','expand'].includes(value.action) && !text(value.value,160)) errors.push('value_required');
  return { ok:!errors.length, errors };
}

module.exports = Object.freeze({
  STATE_CONTRACT, COMMAND_CONTRACT, VALID_LAYERS, VALID_MODES, VALID_SPEAKERS,
  VALID_UI_STATES, VALID_COMMANDS, normalizeState, validateState, createCommand,
  validateCommand, normalizeLanguage: language
});

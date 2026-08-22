'use strict';

const Contract = require('./MarionLingoSentinelStateContract');

const VERSION = 'marion.lingosentinel.stateStore/2.0';
const states = new Map();
const commands = new Map();
let sequence = 0;

function clone(v) { return v == null ? v : JSON.parse(JSON.stringify(v)); }
function bucket(sessionId) {
  const id = String(sessionId || '').trim();
  if (!commands.has(id)) commands.set(id, []);
  return commands.get(id);
}
function comparable(state) {
  const x = { ...state };
  delete x.revision; delete x.createdAt; delete x.updatedAt; delete x.timestamp; delete x.observedRevision;
  return JSON.stringify(x);
}

function upsert(input = {}) {
  const normalized = Contract.normalizeState(input);
  const valid = Contract.validateState(normalized);
  if (!valid.ok) return { ok:false, errors:valid.errors };
  const prior = states.get(normalized.sessionId);
  if (prior && normalized.timestamp < prior.timestamp) return { ok:true, changed:false, stale:true, state:clone(prior), previousRevision:prior.revision };
  const now = Date.now();
  const next = {
    ...normalized,
    revision: prior ? prior.revision : 0,
    createdAt: prior ? prior.createdAt : now,
    updatedAt: prior ? prior.updatedAt : now
  };
  const changed = !prior || comparable(prior) !== comparable(next);
  if (changed) {
    next.revision = (prior ? prior.revision : 0) + 1;
    next.updatedAt = now;
  }
  states.set(next.sessionId, next);
  return { ok:true, changed, state:clone(next), previousRevision:prior ? prior.revision : 0 };
}

function get(sessionId) { return clone(states.get(String(sessionId || '').trim()) || null); }
function remove(sessionId) {
  const id = String(sessionId || '').trim();
  const existed = states.delete(id); commands.delete(id);
  return existed;
}

function enqueue(input = {}) {
  const cmd = Contract.createCommand(input);
  const valid = Contract.validateCommand(cmd);
  if (!valid.ok) return { ok:false, errors:valid.errors };
  const record = { ...cmd, sequence:++sequence, status:'pending', ackedAt:0, ack:null };
  const q = bucket(cmd.sessionId);
  q.push(record);
  if (q.length > 100) q.splice(0, q.length - 100);
  return { ok:true, command:clone(record) };
}

function list(sessionId, after = 0, limit = 20) {
  const q = bucket(String(sessionId || '').trim());
  const n = Math.max(0, Number(after) || 0);
  const cap = Math.min(50, Math.max(1, Number(limit) || 20));
  const items = q.filter(x => x.sequence > n && x.status === 'pending').slice(0, cap);
  return { ok:true, commands:clone(items), cursor:items.length ? items[items.length - 1].sequence : n };
}

function ack(sessionId, commandId, ack = {}) {
  const q = bucket(String(sessionId || '').trim());
  const item = q.find(x => x.commandId === String(commandId || '').trim());
  if (!item) return { ok:false, errors:['command_not_found'] };
  item.status = ack.ok === false ? 'failed' : 'acked';
  item.ackedAt = Date.now();
  item.ack = {
    ok: ack.ok !== false,
    appliedRevision: Math.max(0, Number(ack.appliedRevision || 0) || 0),
    error: String(ack.error || '').slice(0,160)
  };
  return { ok:true, command:clone(item) };
}

function getHealth() {
  let pending = 0;
  for (const q of commands.values()) pending += q.filter(x => x.status === 'pending').length;
  return { ok:true, service:'MarionLingoSentinelStateStore', version:VERSION, sessions:states.size, commandQueues:commands.size, pendingCommands:pending };
}

function resetForTests() { states.clear(); commands.clear(); sequence = 0; }

module.exports = Object.freeze({ VERSION, upsert, get, remove, enqueue, list, ack, getHealth, resetForTests });

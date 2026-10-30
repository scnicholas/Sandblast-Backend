'use strict';

const Contract = require('./MarionEcosystemContract');
const VERSION = 'marion.componentRegistry/1.1';
const components = new Map();
const MAX_METADATA_BYTES = 8192;
const MAX_COMPONENTS = 128;

function clean(value, max = 160) {
  return String(value == null ? '' : value).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}
function object(value) { return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; }
function list(value) { return Array.isArray(value) ? value : []; }
function normalizeCapabilities(value) {
  return Array.from(new Set(list(value).map(item => clean(item, 80)).filter(Boolean))).slice(0, 64);
}
function safeMetadata(value) {
  const source = object(value);
  let serialized;
  try { serialized = JSON.stringify(source); } catch (_) { return null; }
  if (!serialized || Buffer.byteLength(serialized, 'utf8') > MAX_METADATA_BYTES) return null;
  let parsed;
  try { parsed = JSON.parse(serialized); } catch (_) { return null; }
  const result = Object.create(null);
  for (const [key, entry] of Object.entries(parsed)) {
    if (key !== '__proto__' && key !== 'constructor' && key !== 'prototype') result[key] = entry;
  }
  return result;
}
function copy(record) {
  if (!record) return null;
  return {
    ...record,
    capabilities: [...record.capabilities], reads: [...record.reads],
    writes: [...record.writes], commands: [...record.commands],
    metadata: safeMetadata(record.metadata) || Object.create(null)
  };
}
function normalizedId(value) {
  const id = Contract.normalizeComponent(value);
  return /^[a-z0-9][a-z0-9._-]{0,63}$/.test(id) ? id : '';
}
function register(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { ok: false, error: 'component_invalid' };
  const id = normalizedId(input.id || input.component);
  if (!id) return { ok: false, error: 'component_id_invalid' };
  const previous = components.get(id);
  if (!previous && components.size >= MAX_COMPONENTS) return { ok: false, error: 'component_capacity_reached' };
  const metadata = safeMetadata(input.metadata);
  if (!metadata) return { ok: false, error: 'component_metadata_invalid' };
  const now = Date.now();
  const record = {
    id, name: clean(input.name || id, 120), version: clean(input.version || '1.0.0', 40),
    type: clean(input.type || 'service', 48),
    capabilities: normalizeCapabilities(input.capabilities),
    reads: normalizeCapabilities(input.reads), writes: normalizeCapabilities(input.writes),
    commands: normalizeCapabilities(input.commands),
    publicSurface: input.publicSurface === true, ownerOnly: input.ownerOnly === true,
    healthEndpoint: clean(input.healthEndpoint, 220), metadata,
    status: clean(input.status || 'registered', 32),
    registeredAt: previous ? previous.registeredAt : now, updatedAt: now
  };
  components.set(id, record);
  return { ok: true, created: !previous, component: copy(record) };
}
function updateStatus(id, status, metadata = {}) {
  const current = components.get(normalizedId(id));
  if (!current) return { ok: false, error: 'component_not_registered' };
  const addition = safeMetadata(metadata);
  if (!addition) return { ok: false, error: 'component_metadata_invalid' };
  const merged = safeMetadata({ ...current.metadata, ...addition });
  if (!merged) return { ok: false, error: 'component_metadata_invalid' };
  current.status = clean(status || current.status, 32);
  current.metadata = merged;
  current.updatedAt = Date.now();
  return { ok: true, component: copy(current) };
}
function get(id) { return copy(components.get(normalizedId(id))); }
function has(id) { return components.has(normalizedId(id)); }
function all() { return Array.from(components.values()).map(copy).sort((a, b) => a.id.localeCompare(b.id)); }
function remove(id) { return components.delete(normalizedId(id)); }
function bootstrapDefaults() {
  const defaults = [
    { id:'nyx', type:'public-interface', publicSurface:true, capabilities:['conversation','media-control','navigation'] },
    { id:'lingosentinel', type:'language-intelligence', publicSurface:true, capabilities:['translation','cultural-context','conversation'] },
    { id:'crm', type:'business-intelligence', ownerOnly:true, capabilities:['lead-read','lead-analysis','lead-recommendation'] },
    { id:'sandblast-channel', type:'media-platform', publicSurface:true, capabilities:['page-events','cta-events','media-events'] },
    { id:'sandblast-radio', type:'media-service', publicSurface:true, capabilities:['radio-events'] },
    { id:'sandblast-tv', type:'media-service', publicSurface:true, capabilities:['television-events'] },
    { id:'synapse', type:'content-intelligence', publicSurface:true, capabilities:['news-events','content-events'] },
    { id:'chronicle', type:'domain-intelligence', ownerOnly:true, capabilities:['historical-reconstruction'] },
    { id:'project-guardians', type:'domain-intelligence', ownerOnly:true, capabilities:['guardian-domain'] },
    { id:'marion', type:'cognitive-control-plane', ownerOnly:true, capabilities:['reasoning','routing','orchestration','analysis'] }
  ];
  for (const item of defaults) if (!components.has(item.id)) register(item);
  return all();
}
function getHealth() {
  const records = all();
  return { ok: true, service: 'MarionComponentRegistry', version: VERSION,
    registered: records.length, ready: records.filter(item => item.status === 'ready').length,
    components: records.map(item => ({ id: item.id, type: item.type, status: item.status, version: item.version })) };
}
function resetForTests() { components.clear(); }
bootstrapDefaults();
module.exports = Object.freeze({ VERSION, register, updateStatus, get, has, all, remove, bootstrapDefaults, getHealth, resetForTests });

'use strict';

const Contract = require('./MarionEcosystemContract');

const VERSION = 'marion.componentRegistry/1.0';
const components = new Map();

function clean(value, max = 160) {
  return String(value == null ? '' : value)
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}
function object(value) { return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; }
function list(value) { return Array.isArray(value) ? value : []; }
function normalizeCapabilities(value) {
  return Array.from(new Set(list(value).map(item => clean(item, 80)).filter(Boolean))).slice(0, 64);
}

function register(input = {}) {
  const id = Contract.normalizeComponent(input.id || input.component);
  if (!id) return { ok: false, error: 'component_id_required' };
  const previous = components.get(id);
  const now = Date.now();
  const record = {
    id,
    name: clean(input.name || id, 120),
    version: clean(input.version || '1.0.0', 40),
    type: clean(input.type || 'service', 48),
    capabilities: normalizeCapabilities(input.capabilities),
    reads: normalizeCapabilities(input.reads),
    writes: normalizeCapabilities(input.writes),
    commands: normalizeCapabilities(input.commands),
    publicSurface: input.publicSurface === true,
    ownerOnly: input.ownerOnly === true,
    healthEndpoint: clean(input.healthEndpoint, 220),
    metadata: object(input.metadata),
    status: clean(input.status || 'registered', 32),
    registeredAt: previous ? previous.registeredAt : now,
    updatedAt: now
  };
  components.set(id, record);
  return { ok: true, created: !previous, component: { ...record } };
}

function updateStatus(id, status, metadata = {}) {
  const key = Contract.normalizeComponent(id);
  const current = components.get(key);
  if (!current) return { ok: false, error: 'component_not_registered' };
  current.status = clean(status || current.status, 32);
  current.metadata = { ...current.metadata, ...object(metadata) };
  current.updatedAt = Date.now();
  return { ok: true, component: { ...current } };
}

function get(id) {
  const record = components.get(Contract.normalizeComponent(id));
  return record ? { ...record } : null;
}
function has(id) { return components.has(Contract.normalizeComponent(id)); }
function all() { return Array.from(components.values()).map(value => ({ ...value })).sort((a,b)=>a.id.localeCompare(b.id)); }
function remove(id) { return components.delete(Contract.normalizeComponent(id)); }

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
  return {
    ok:true,
    service:'MarionComponentRegistry',
    version:VERSION,
    registered:records.length,
    ready:records.filter(item=>item.status==='ready').length,
    components:records.map(item=>({id:item.id,type:item.type,status:item.status,version:item.version}))
  };
}
function resetForTests(){ components.clear(); }
bootstrapDefaults();

module.exports = Object.freeze({ VERSION,register,updateStatus,get,has,all,remove,bootstrapDefaults,getHealth,resetForTests });

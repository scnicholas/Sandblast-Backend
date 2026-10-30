'use strict';

/**
 * Marion ecosystem gateway — staged phase integration.
 * No startup side effects: initialization must be explicitly invoked from a
 * trusted server-side lifecycle after routes/dependencies are available.
 * No public request may authorize or trigger bootstrap.
 */
const Contract = require('./MarionEcosystemContract');
const Registry = require('./MarionComponentRegistry');
const Permissions = require('./MarionEcosystemPermissions');
const StateSpine = require('./MarionEcosystemStateSpine');
const EventRouter = require('./MarionEcosystemEventRouter');
const Telemetry = require('./MarionEcosystemTelemetry');
const VERSION = 'marion.ecosystemGateway/1.1-staged-init';

const PHASES = Object.freeze([
  ['phase2', './MarionEcosystemComponentBootstrap'],
  ['phase3', './MarionEcosystemPhase3Bootstrap'],
  ['phase4', './MarionEcosystemPhase4Bootstrap'],
  ['phase5', './MarionEcosystemPhase5Bootstrap']
]);
let marionRunner = null;
let initializedAt = 0;
let lastInitialization = null;
let initializing = false;

function resolveRunner(moduleRef) {
  if (!moduleRef) return null;
  if (typeof moduleRef === 'function') return moduleRef;
  for (const key of ['runMarionBridge','run','handle','handleChat','reply','processWithMarion','handleMessage','ask','default']) {
    if (typeof moduleRef[key] === 'function') return moduleRef[key].bind(moduleRef);
  }
  return null;
}
function resolveMarionRunner() {
  if (marionRunner) return marionRunner;
  for (const candidate of ['../marionBridge','../marionBridge.js']) {
    try {
      const runner = resolveRunner(require(candidate));
      if (runner) { marionRunner = runner; return runner; }
    } catch (_) { /* runtime might not provide the optional bridge */ }
  }
  return null;
}
function registerMarionRunner(runner) {
  const resolved = resolveRunner(runner);
  if (!resolved) return false; // never erase a valid runner on invalid registration
  marionRunner = resolved;
  return true;
}
function extractMarionText(value) {
  if (typeof value === 'string') return value.trim();
  if (!value || typeof value !== 'object') return '';
  const marion = value.marion && typeof value.marion === 'object' ? value.marion : {};
  const candidate = [value.final,value.text,value.message,value.reply,value.content,marion.final,marion.text,marion.message,marion.reply]
    .find(x => typeof x === 'string' && x.trim());
  return candidate ? candidate.trim() : '';
}
function safePhase(name, modulePath) {
  try {
    const instance = require(modulePath);
    if (!instance || typeof instance.bootstrap !== 'function' || typeof instance.getHealth !== 'function') {
      return { name, module: null, error: 'phase_contract_invalid' };
    }
    return { name, module: instance, error: null };
  } catch (_) {
    return { name, module: null, error: 'phase_module_unavailable' };
  }
}
function phaseHealth() {
  const phases = {};
  for (const [name, location] of PHASES) {
    const phase = safePhase(name, location);
    if (!phase.module) { phases[name] = { ok:false, booted:false, error:phase.error }; continue; }
    try {
      const health = phase.module.getHealth();
      phases[name] = { ok:health && health.ok === true, booted:health && health.booted === true, version:health && health.version || null };
    } catch (_) { phases[name] = { ok:false, booted:false, error:'phase_health_failed' }; }
  }
  return phases;
}
function phaseReadiness() {
  const phases = phaseHealth();
  const phaseReady = Object.values(phases).length === PHASES.length && Object.values(phases).every(p => p.ok && p.booted);
  const marionReady = Boolean(resolveMarionRunner());
  return { phases, phasesReady:phaseReady, marionReady, fullEcosystemReady:phaseReady && marionReady,
    fullEcosystemVerified:phaseReady && marionReady && initializedAt > 0,
    initializedAt:initializedAt || null };
}
/**
 * Trusted local-only activation. NEVER wire this function to an untrusted HTTP request.
 * Options are passed to each phase by name; ordinary callers should pass no options.
 * Stops at first failure to avoid pretending later phases are operational.
 */
function initializeEcosystem(options = {}) {
  if (initializing) return { ok:false, error:'initialization_in_progress', readiness:phaseReadiness() };
  const before = phaseReadiness();
  if (before.fullEcosystemVerified) return { ok:true, alreadyInitialized:true, readiness:before };
  initializing = true;
  const results = {};
  try {
    for (const [name, location] of PHASES) {
      const phase = safePhase(name, location);
      if (!phase.module) {
        results[name] = { ok:false, error:phase.error };
        break;
      }
      try {
        const previous = phase.module.getHealth();
        const result = previous && previous.ok === true && previous.booted === true
          ? {ok:true,alreadyBooted:true} : phase.module.bootstrap(options[name] || {});
        const health = phase.module.getHealth();
        results[name] = { ok: result && result.ok === true && health && health.ok === true && health.booted === true,
          booted:health && health.booted === true,
          error:result && result.error ? String(result.error).slice(0,100) : undefined };
      } catch (_) { results[name] = {ok:false,error:'phase_initialization_failed'}; }
      if (!results[name].ok) break;
    }
    const readiness = phaseReadiness();
    if (readiness.phasesReady && readiness.marionReady) initializedAt = initializedAt || Date.now();
    const updated = phaseReadiness();
    lastInitialization = {ok:updated.fullEcosystemVerified, phases:results, initializedAt:updated.initializedAt};
    return {ok:updated.fullEcosystemVerified, service:'MarionEcosystemGateway',version:VERSION,results,readiness:updated};
  } finally { initializing = false; }
}
async function runMarion(envelope) {
  const runner = resolveMarionRunner();
  if (!runner) return {ok:false,error:'marion_runner_unavailable'};
  const context = envelope.sessionId ? StateSpine.createContext(envelope.sessionId) : null;
  const raw = await runner({text:envelope.text,userText:envelope.text,query:envelope.text,
    requestId:envelope.requestId,traceId:envelope.traceId,sessionId:envelope.sessionId,
    conversationId:envelope.conversationId,roomId:envelope.roomId,
    sourceComponent:envelope.source,targetComponent:envelope.target,eventType:envelope.eventType,
    intent:envelope.intent,ecosystemContext:context,ecosystemEnvelope:envelope});
  if (raw && typeof raw === 'object' && raw.ok === false) return {ok:false,error:'marion_execution_failed'};
  const text = extractMarionText(raw);
  if (!text) return {ok:false,error:'marion_empty_response'};
  return {ok:true,text}; // do not return or log private raw runtime responses
}
async function process(input = {}, options = {}) {
  const startedAt = Date.now();
  let envelope, valid;
  try { envelope = Contract.normalizeEnvelope(input); valid = Contract.validateEnvelope(envelope); }
  catch (_) { return {ok:false,stage:'contract',errors:['envelope_invalid']}; }
  if (!valid || !valid.ok) return {ok:false,stage:'contract',errors:valid && valid.errors || ['envelope_invalid']};
  const eventMeta = {source:envelope.source,target:envelope.target,eventType:envelope.eventType};
  try { Telemetry.record('gateway_request',{...eventMeta,status:'received'}); } catch (_) {}
  if (envelope.target === 'marion' && ['conversation.message','domain.request'].includes(envelope.eventType)) {
    const permission = Permissions.authorize(envelope.source,'request','marion.reasoning');
    // Deliberately do not honour skipPermission: request options are not an authentication boundary.
    if (!permission.ok) {
      try { Telemetry.record('gateway_deny',{...eventMeta,stage:'permission'}); } catch (_) {}
      return {ok:false,stage:'permission',errors:[permission.reason || 'permission_denied']};
    }
    try {
      const marion = await runMarion(envelope);
      if (!marion.ok) return {ok:false,stage:'marion_resolve',errors:[marion.error]};
      const response = Contract.createResponse(envelope,{source:'marion',target:envelope.source,
        eventType:envelope.eventType === 'conversation.message' ? 'conversation.response' : 'domain.response',
        intent:envelope.intent,text:marion.text,payload:{contextVersion:'sandblast.marion.ecosystem-state/1.0'},
        metadata:{gatewayVersion:VERSION}});
      try { Telemetry.record('gateway_marion_success',{...eventMeta,status:'completed',durationMs:Date.now()-startedAt}); } catch (_) {}
      return {ok:true,handledBy:'marion',request:envelope,response};
    } catch (_) {
      try { Telemetry.record('gateway_marion_error',{...eventMeta,stage:'marion',durationMs:Date.now()-startedAt}); } catch (_) {}
      return {ok:false,stage:'marion',errors:['marion_runtime_failed']};
    }
  }
  try {
    const safeOptions = Object.assign({}, options);
    delete safeOptions.skipPermission;
    const routed = await EventRouter.route(envelope,safeOptions);
    try { Telemetry.record(routed.ok?'gateway_route_success':'gateway_route_error',
      {...eventMeta,stage:routed.stage||'router',status:routed.ok?'completed':'failed',durationMs:Date.now()-startedAt}); } catch (_) {}
    return routed;
  } catch (_) { return {ok:false,stage:'router',errors:['ecosystem_route_failed']}; }
}
function getHealth() {
  const readiness = phaseReadiness();
  function guarded(fn) { try { return fn(); } catch (_) { return {ok:false,error:'health_unavailable'}; } }
  return {ok:readiness.fullEcosystemVerified,service:'MarionEcosystemGateway',version:VERSION,
    contract:Contract.CONTRACT,marionReady:readiness.marionReady,
    fullEcosystemReady:readiness.fullEcosystemReady,fullEcosystemVerified:readiness.fullEcosystemVerified,
    initializedAt:readiness.initializedAt,phases:readiness.phases,
    registry:guarded(()=>Registry.getHealth()),permissions:guarded(()=>Permissions.getHealth()),
    state:guarded(()=>StateSpine.getHealth()),router:guarded(()=>EventRouter.getHealth()),
    telemetry:guarded(()=>Telemetry.snapshot()),
    privateRuntimeExposed:false,adminAuthenticationBypassed:false,autonomousLearningActivated:false};
}
function resetForTests() { marionRunner=null;initializedAt=0;lastInitialization=null;initializing=false; }
module.exports = Object.freeze({VERSION,process,getHealth,registerMarionRunner,resolveMarionRunner,
  extractMarionText,initializeEcosystem,phaseHealth,resetForTests});

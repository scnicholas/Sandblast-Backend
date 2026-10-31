'use strict';

/**
 * Marion ↔ LingoSentinel cognitive orchestrator.
 * Adapter contract: orchestrate(input, { timeoutMs }) -> {ok, response}.
 * Translation is advisory; Marion remains the only reasoning authority.
 * No HTTP mounts, autonomous execution, or import-time side effects.
 */
const VERSION = 'marion.lingosentinelCognitiveOrchestrator/1.0';
const MAX_TEXT = 4000;
function safeObject(x) { return x && typeof x === 'object' && !Array.isArray(x) ? x : {}; }
function safeText(x, n = MAX_TEXT) { return typeof x === 'string' ? x.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, n) : ''; }
function safeLanguage(x, fallback) { const s = safeText(x, 24).toLowerCase(); return /^[a-z]{2,3}(?:-[a-z]{2,4})?$/.test(s) ? s : fallback; }
function canonicalResponse(result) {
  const response = safeObject(result && result.response);
  return safeText(response.text || response.message || response.reply || response.final || '');
}
function availability() {
  try {
    const gateway = require('../ecosystem/MarionEcosystemGateway');
    const engine = require('./LingoSentinelTranslationEngine');
    const runnerReady = typeof gateway.resolveMarionRunner === 'function' && !!gateway.resolveMarionRunner();
    return {ok:!!(runnerReady && typeof gateway.process === 'function' && typeof engine.translateTurn === 'function'),runnerReady,translationEngineReady:typeof engine.translateTurn === 'function'};
  } catch (_) { return {ok:false,runnerReady:false,translationEngineReady:false}; }
}
async function orchestrate(input = {}, options = {}) {
  const req = safeObject(input);
  const text = safeText(req.message || req.text);
  if (!text) return {ok:false,stage:'contract',errors:['message_required'],version:VERSION};
  const sourceLanguage = safeLanguage(req.sourceLanguage,'en');
  const targetLanguage = safeLanguage(req.targetLanguage,'en');
  const gateway = require('../ecosystem/MarionEcosystemGateway');
  if (!gateway.resolveMarionRunner()) return {ok:false,stage:'marion_resolve',errors:['marion_runner_unavailable'],version:VERSION};
  // Permission checked by gateway. Never use skipPermission or a privileged source.
  const result = await gateway.process({requestId:req.requestId,traceId:req.traceId,sessionId:req.sessionId,
    conversationId:req.conversationId,roomId:req.roomId,source:'lingosentinel',target:'marion',
    eventType:'conversation.message',intent:req.intent || 'conversation',text});
  if (!result || result.ok !== true) return {ok:false,stage:result && result.stage || 'marion',errors:['marion_reasoning_failed'],version:VERSION};
  const canonical = canonicalResponse(result);
  if (!canonical) return {ok:false,stage:'marion',errors:['marion_empty_response'],version:VERSION};
  let localized = canonical;
  const warnings=[];
  if (targetLanguage !== 'en') {
    const engine=require('./LingoSentinelTranslationEngine');
    const translated=await engine.translateTurn({text:canonical,sourceLanguage:'en',targetLanguage,
      sessionId:req.sessionId,conversationId:req.conversationId,roomId:req.roomId},safeObject(options));
    if (!translated || translated.ok !== true || !safeText(translated.translatedText || translated.text)) {
      return {ok:false,stage:'translation',errors:['translation_unavailable'],version:VERSION};
    }
    localized=safeText(translated.translatedText || translated.text);
  }
  return {ok:true,version:VERSION,response:{canonicalResponse:canonical,localizedResponse:localized,
    displayText:localized,degraded:false,warnings,finalAuthority:'marion'},advisoryOnly:true,
    automaticExecutionAllowed:false};
}
function getHealth(){const h=availability();return {ok:h.ok,service:'MarionLingoSentinelCognitiveOrchestrator',version:VERSION,...h};}
module.exports=Object.freeze({VERSION,orchestrate,run:orchestrate,getHealth});

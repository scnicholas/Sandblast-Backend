'use strict';

const Contract = require('./MarionLingoSentinelCognitiveContract');
const Context = require('./MarionLingoSentinelContextAssembler');
const Translation = require('./MarionLingoSentinelTranslationBridge');
const History = require('./MarionLingoSentinelConversationStore');
let Phase1 = null;
try { Phase1 = require('./MarionLingoSentinelBridge'); } catch (_) {}

const VERSION = 'marion.lingosentinel.cognitiveOrchestrator/3.0';
function text(v,n=4000){ return String(v==null?'':v).trim().slice(0,n); }
function marionReady(){ return !!(Phase1 && typeof Phase1.runMarionLingoSentinelBridge==='function'); }
function addHistory(req, ctx, role, message, canonicalText, sourceLanguage, targetLanguage){
  return History.append({sessionId:req.sessionId,conversationId:ctx.conversationId,role,text:message,canonicalText,sourceLanguage,targetLanguage});
}
async function orchestrate(input = {}, options = {}) {
  const req=Contract.normalizeRequest(input), valid=Contract.validateRequest(req);
  if(!valid.ok) return {ok:false,stage:'contract',errors:valid.errors,request:req,version:VERSION};
  const ctx=Context.assemble(req), warnings=[];

  const inputTx=await Translation.normalizeForMarion(req.message,ctx.sourceLanguage,{cultureContext:ctx.cultureContext});
  if(!inputTx.ok && ctx.sourceLanguage!==Contract.CANONICAL_LANGUAGE){
    return {ok:false,stage:'input_translation',errors:inputTx.warnings||['input_translation_failed'],request:req,context:ctx,version:VERSION};
  }
  const canonicalInput=text(inputTx.text||req.message);
  addHistory(req,ctx,ctx.speakerRole,req.message,canonicalInput,ctx.sourceLanguage,ctx.targetLanguage);

  if(!marionReady()) return {ok:false,stage:'marion_resolve',errors:['phase1_bridge_unavailable'],request:req,context:ctx,version:VERSION};
  const mctx=Context.marionContext(ctx,req);
  const marionResult=await Phase1.runMarionLingoSentinelBridge({
    requestId:req.requestId, sessionId:req.sessionId, conversationId:ctx.conversationId, roomId:ctx.roomId,
    eventType:'conversation.message', intent:req.intent, source:'lingosentinel', target:'marion',
    sourceLanguage:Contract.CANONICAL_LANGUAGE, targetLanguage:Contract.CANONICAL_LANGUAGE,
    cultureContext:ctx.cultureContext, layer:ctx.layer, mode:ctx.mode, participantId:ctx.participantId,
    speakerRole:ctx.speakerRole, message:canonicalInput,
    metadata:{...req.metadata,phase3:VERSION,originalSourceLanguage:ctx.sourceLanguage,requestedTargetLanguage:ctx.targetLanguage,...mctx}
  },{timeoutMs:options.timeoutMs});
  if(!marionResult || !marionResult.ok){
    return {ok:false,stage:marionResult&&marionResult.stage||'marion_run',errors:marionResult&&marionResult.errors||['marion_failed'],request:req,context:ctx,version:VERSION};
  }

  const canonicalResponse=text(marionResult.response&&marionResult.response.message);
  if(!canonicalResponse) warnings.push('marion_empty_response');
  const outputTx=await Translation.localizeFromMarion(canonicalResponse,ctx.targetLanguage,{cultureContext:ctx.cultureContext});
  const outputRequired=ctx.targetLanguage!==Contract.CANONICAL_LANGUAGE;
  if(outputRequired && !outputTx.ok) warnings.push(...(outputTx.warnings||['output_translation_failed']));
  const localizedResponse=outputTx.ok?text(outputTx.text):'';
  addHistory(req,ctx,'intelligence',localizedResponse||canonicalResponse,canonicalResponse,Contract.CANONICAL_LANGUAGE,ctx.targetLanguage);

  const displayText=req.returnMode==='canonical'?canonicalResponse:req.returnMode==='localized'?(localizedResponse||canonicalResponse):(localizedResponse||canonicalResponse);
  const response=Contract.createResponse(req,{
    canonicalInput,canonicalResponse,localizedResponse,displayText,
    inputTranslation:inputTx,outputTranslation:outputTx,
    cognitiveContext:{cultureContext:ctx.cultureContext,layer:ctx.layer,mode:ctx.mode,speakerRole:ctx.speakerRole,stateRevision:ctx.stateRevision,historyCount:ctx.history.length},
    marion:{responded:!!canonicalResponse,bridgeVersion:Phase1.VERSION||'phase1'},
    degraded:outputRequired&&!outputTx.ok,warnings
  });
  return {ok:true,request:req,response,version:VERSION};
}
function getHealth(){ return {ok:marionReady(),service:'MarionLingoSentinelCognitiveOrchestrator',version:VERSION,contract:Contract.COGNITIVE_CONTRACT,phase1Ready:marionReady(),context:Context.getHealth(),translation:Translation.getHealth(),history:History.getHealth()}; }
module.exports=Object.freeze({VERSION,orchestrate,getHealth});

'use strict';

const Contract = require('./MarionLingoSentinelCognitiveContract');
const History = require('./MarionLingoSentinelConversationStore');
let StateBridge = null;
try { StateBridge = require('./MarionLingoSentinelStateBridge'); } catch (_) {}

const VERSION = 'marion.lingosentinel.contextAssembler/3.0';
function text(v,n=160){ return String(v==null?'':v).replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,n); }
function phase2State(sessionId){
  try { const r=StateBridge && StateBridge.getState ? StateBridge.getState(sessionId) : null; return r && r.ok ? r.state : null; } catch (_) { return null; }
}
function assemble(input = {}) {
  const req=Contract.normalizeRequest(input), state=phase2State(req.sessionId)||{};
  const conversationId=req.conversationId || state.conversationId || 'default';
  const stored=History.getRecent(req.sessionId,conversationId,Contract.MAX_HISTORY);
  const supplied=req.history || [];
  const history=(stored.length?stored:supplied).slice(-Contract.MAX_HISTORY);
  return {
    version:VERSION,
    sessionId:req.sessionId,
    conversationId,
    roomId:req.roomId || state.roomId || 'lingosentinel-main',
    sourceLanguage:req.sourceLanguage || state.sourceLanguage || 'en',
    targetLanguage:req.targetLanguage || state.targetLanguage || 'en',
    canonicalLanguage:Contract.CANONICAL_LANGUAGE,
    cultureContext:req.cultureContext || state.cultureContext || 'general',
    layer:req.layer || state.layer || 'language',
    mode:req.mode || state.mode || 'one_to_one',
    speakerRole:req.speakerRole || state.speakerRole || 'host',
    participantId:req.participantId || state.participantId || 'host',
    translationStatus:text(state.translationStatus || 'ready',48),
    marionStatus:text(state.marionStatus || 'ready',48),
    uiState:text(state.uiState || 'closed',24),
    stateRevision:Number(state.revision || state.stateRevision || 0) || 0,
    history
  };
}
function marionContext(context = {}, request = {}) {
  const history=(context.history||[]).map(x=>({role:x.role,language:x.sourceLanguage||x.language||'en',text:x.canonicalText||x.text}));
  return {
    lingoSentinel:{
      contract:Contract.COGNITIVE_CONTRACT,
      requestId:request.requestId,
      sessionId:context.sessionId,
      conversationId:context.conversationId,
      roomId:context.roomId,
      sourceLanguage:context.sourceLanguage,
      targetLanguage:context.targetLanguage,
      canonicalLanguage:context.canonicalLanguage,
      cultureContext:context.cultureContext,
      layer:context.layer,
      mode:context.mode,
      speakerRole:context.speakerRole,
      participantId:context.participantId,
      stateRevision:context.stateRevision,
      history
    }
  };
}
function getHealth(){ return {ok:true,service:'MarionLingoSentinelContextAssembler',version:VERSION,phase2StateAvailable:!!StateBridge,history:History.getHealth()}; }
module.exports=Object.freeze({VERSION,assemble,marionContext,getHealth});

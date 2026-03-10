"use strict";
const crypto=require("crypto");
const {synthesize}=require("./ttsProvidersResemble");

const PHASES=Object.freeze({
  p01_contractSafe:true,p02_resembleUnified:true,p03_concurrencyGate:true,p04_circuitBreaker:true,p05_failOpenHealth:true,
  p06_inputNormalization:true,p07_speechShaping:true,p08_pronunciationMap:true,p09_payloadHardening:true,p10_bufferCoercion:true,
  p11_headerTelemetry:true,p12_jsonAudioMode:true,p13_introParity:true,p14_retrySignal:true,p15_operationalDiagnostics:true
});
const MAX_TEXT=1800;
const MAX_CONCURRENT=Number(process.env.SB_TTS_MAX_CONCURRENT||3);
const CIRCUIT_LIMIT=Number(process.env.SB_TTS_CIRCUIT_LIMIT||5);
const CIRCUIT_RESET_MS=Number(process.env.SB_TTS_CIRCUIT_RESET_MS||30000);

const DEFAULT_SPEECH_HINTS=Object.freeze({
  pauses:{commaMs:110,periodMs:300,questionMs:340,exclaimMs:320,colonMs:180,semicolonMs:220,ellipsisMs:480},
  pacing:{mode:"natural",preservePunctuation:true,sentenceBreath:true,noRunOns:true}
});
const DEFAULT_PRONUNCIATION_MAP=Object.freeze({
  Nyx:"Nix",
  Nix:"Nix",
  Sandblast:"Sand-blast",
  Roku:"Roh-koo",
  Marion:"Marry-in",
  AI:"A I",
  TTS:"T T S",
  TV:"T V"
});

let activeRequests=0,failCount=0,circuitOpenUntil=0,lastError="",lastOkAt=0,lastFailAt=0,lastProviderStatus=0,lastElapsedMs=0;

const _str=v=>v==null?"":String(v);
const _trim=v=>_str(v).trim();
const _lower=v=>_trim(v).toLowerCase();
const _now=()=>Date.now();
const _makeTrace=()=>`tts_${Date.now().toString(16)}_${crypto.randomBytes(4).toString("hex")}`;
function _bool(v,d){ if(v==null||v==="") return d; if(typeof v==="boolean") return v; const s=_lower(v); if(["1","true","yes","on"].includes(s)) return true; if(["0","false","no","off"].includes(s)) return false; return d; }
function _pickFirst(){ for(let i=0;i<arguments.length;i++){ const v=_trim(arguments[i]); if(v) return v; } return ""; }
function _safeJson(res,status,body){ if(res.headersSent) return; try{ res.status(status).json(body); }catch(_){ try{ res.status(status).send(JSON.stringify(body)); }catch(__){} } }
function _setHeader(res,k,v){ try{ if(!res.headersSent) res.setHeader(k,v); }catch(_){ } }
function _setCommonAudioHeaders(res,traceId,meta){
  _setHeader(res,"Cache-Control","no-store, max-age=0"); _setHeader(res,"X-SB-Trace-ID",traceId);
  if(meta&&meta.provider) _setHeader(res,"X-SB-TTS-Provider",meta.provider);
  if(meta&&meta.voiceUuid) _setHeader(res,"X-SB-Voice",meta.voiceUuid);
  if(meta&&Number.isFinite(meta.elapsedMs)) _setHeader(res,"X-SB-TTS-MS",String(meta.elapsedMs));
  if(meta&&Number.isFinite(meta.shapeMs)) _setHeader(res,"X-SB-TTS-SHAPE-MS",String(meta.shapeMs));
  if(meta&&Number.isFinite(meta.segmentCount)) _setHeader(res,"X-SB-TTS-SEGMENTS",String(meta.segmentCount));
}
const _circuitOpen=()=>_now()<circuitOpenUntil;
function _recordFailure(message,status){
  failCount+=1; lastError=_trim(message)||"tts_failed"; lastFailAt=_now(); lastProviderStatus=Number(status||0)||0;
  if(failCount>=CIRCUIT_LIMIT){ circuitOpenUntil=_now()+CIRCUIT_RESET_MS; try{ console.warn("[TTS] Circuit breaker OPEN",{failCount,resetInMs:CIRCUIT_RESET_MS}); }catch(_){} }
}
function _recordSuccess(status,elapsedMs){ failCount=0; circuitOpenUntil=0; lastError=""; lastOkAt=_now(); lastProviderStatus=Number(status||200)||200; lastElapsedMs=Number(elapsedMs||0)||0; }
function _healthSnapshot(){
  const voiceUuid=_pickFirst(process.env.RESEMBLE_VOICE_UUID,process.env.SB_RESEMBLE_VOICE_UUID,process.env.SBNYX_RESEMBLE_VOICE_UUID);
  const projectUuid=_pickFirst(process.env.RESEMBLE_PROJECT_UUID,process.env.SB_RESEMBLE_PROJECT_UUID);
  const token=_pickFirst(process.env.RESEMBLE_API_TOKEN,process.env.RESEMBLE_API_KEY);
  return {
    ok:!!(token&&voiceUuid),provider:"resemble",phases:PHASES,activeRequests,failCount,circuitOpen:_circuitOpen(),circuitResetAt:circuitOpenUntil,
    lastError,lastOkAt,lastFailAt,lastProviderStatus,lastElapsedMs,
    env:{hasToken:!!token,hasProject:!!projectUuid,hasVoice:!!voiceUuid,voiceUuidPreview:voiceUuid?`${voiceUuid.slice(0,4)}***${voiceUuid.slice(-3)}`:"",projectUuidPreview:projectUuid?`${projectUuid.slice(0,4)}***${projectUuid.slice(-3)}`:""}
  };
}
function _mergePronunciationMap(extra){
  const merged=Object.assign({},DEFAULT_PRONUNCIATION_MAP);
  if(extra&&typeof extra==="object") Object.keys(extra).forEach(k=>{ const key=_trim(k),val=_trim(extra[k]); if(key&&val) merged[key]=val; });
  return merged;
}
function _parseSpeechHints(body){
  const inputHints=body&&typeof body.speechHints==="object"?body.speechHints:{};
  const inputPauses=inputHints&&typeof inputHints.pauses==="object"?inputHints.pauses:{};
  const inputPacing=inputHints&&typeof inputHints.pacing==="object"?inputHints.pacing:{};
  return {
    pauses:{
      commaMs:Number(inputPauses.commaMs||body.commaMs||DEFAULT_SPEECH_HINTS.pauses.commaMs)||DEFAULT_SPEECH_HINTS.pauses.commaMs,
      periodMs:Number(inputPauses.periodMs||body.periodMs||DEFAULT_SPEECH_HINTS.pauses.periodMs)||DEFAULT_SPEECH_HINTS.pauses.periodMs,
      questionMs:Number(inputPauses.questionMs||body.questionMs||DEFAULT_SPEECH_HINTS.pauses.questionMs)||DEFAULT_SPEECH_HINTS.pauses.questionMs,
      exclaimMs:Number(inputPauses.exclaimMs||body.exclaimMs||DEFAULT_SPEECH_HINTS.pauses.exclaimMs)||DEFAULT_SPEECH_HINTS.pauses.exclaimMs,
      colonMs:Number(inputPauses.colonMs||body.colonMs||DEFAULT_SPEECH_HINTS.pauses.colonMs)||DEFAULT_SPEECH_HINTS.pauses.colonMs,
      semicolonMs:Number(inputPauses.semicolonMs||body.semicolonMs||DEFAULT_SPEECH_HINTS.pauses.semicolonMs)||DEFAULT_SPEECH_HINTS.pauses.semicolonMs,
      ellipsisMs:Number(inputPauses.ellipsisMs||body.ellipsisMs||DEFAULT_SPEECH_HINTS.pauses.ellipsisMs)||DEFAULT_SPEECH_HINTS.pauses.ellipsisMs
    },
    pacing:{
      mode:_pickFirst(inputPacing.mode,body.pacingMode,DEFAULT_SPEECH_HINTS.pacing.mode),
      preservePunctuation:_bool(inputPacing.preservePunctuation,_bool(body.preservePunctuation,DEFAULT_SPEECH_HINTS.pacing.preservePunctuation)),
      sentenceBreath:_bool(inputPacing.sentenceBreath,_bool(body.sentenceBreath,DEFAULT_SPEECH_HINTS.pacing.sentenceBreath)),
      noRunOns:_bool(inputPacing.noRunOns,_bool(body.noRunOns,DEFAULT_SPEECH_HINTS.pacing.noRunOns))
    }
  };
}
function _normalizeWhitespace(text){
  return _str(text).replace(/\r\n?/g,"\n").replace(/[ \t]+/g," ").replace(/\u00A0/g," ").replace(/\s+([,.;:!?])/g,"$1").replace(/([,.;:!?])(\S)/g,"$1 $2").replace(/\n{3,}/g,"\n\n").replace(/\. {0,}\.{0,}\.{4,}/g,"...").replace(/\.\.\.+/g,"...").trim();
}
function _applyPronunciationMap(text,pronunciationMap){
  let out=_str(text),keys=Object.keys(pronunciationMap||{}).sort((a,b)=>b.length-a.length);
  for(const key of keys){
    const replacement=_trim(pronunciationMap[key]);
    if(!key||!replacement) continue;
    const safeKey=key.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
    out=out.replace(new RegExp(`\\b${safeKey}\\b`,"g"),replacement);
  }
  return out;
}
function _applySpeakOptimizations(text){
  let out=_str(text);
  out=out
    .replace(/\bI'll help\b/gi,"I can help")
    .replace(/\bI’ll help\b/gi,"I can help")
    .replace(/\bI'll guide you\b/gi,"I can guide you")
    .replace(/\bI’ll guide you\b/gi,"I can guide you")
    .replace(/\bI'll walk you through\b/gi,"I can walk you through")
    .replace(/\bI’ll walk you through\b/gi,"I can walk you through");
  return out;
}
const _collapseJoiners=text=>_str(text).replace(/\s+,/g,",").replace(/\s+;/g,";").replace(/\s+:/g,":").replace(/\s+\./g,".").replace(/\s+\?/g,"?").replace(/\s+!/g,"!");
function _repairRunOns(text){
  let out=_str(text);
  out=out
    .replace(/,\s+(however|meanwhile|instead|nevertheless|nonetheless)\b/gi,". $1")
    .replace(/\b(also|right|you know)\b\s*,\s*\b(also|right|you know)\b/gi,"$1")
    .replace(/\s{2,}/g," ");
  return out;
}
function _splitLongSentence(sentence){
  const s=_trim(sentence); if(!s) return [];
  const wordCount=s.split(/\s+/).filter(Boolean).length;
  if(wordCount<=22) return [s];
  const match=/,\s+(because|while|which|that)\s+/i.exec(s);
  if(!match||typeof match.index!=="number") return [s];
  const left=_trim(s.slice(0,match.index)),right=_trim(s.slice(match.index+2));
  if(!left||!right) return [s];
  return [left.replace(/[,:;]+$/g,"")+".",right];
}
function _segmentSentences(text,speechHints){
  const normalized=_collapseJoiners(_repairRunOns(_normalizeWhitespace(text)));
  const rough=normalized.replace(/([.!?])\s+(?=[A-Z"'])/g,"$1\n").replace(/([:;])\s+(?=[A-Z"'])/g,"$1\n").split(/\n+/).map(_trim).filter(Boolean);
  const segments=[];
  for(const item of rough){
    if(speechHints&&speechHints.pacing&&speechHints.pacing.noRunOns){
      const split=_splitLongSentence(item);
      split.forEach(part=>{ if(_trim(part)) segments.push(_trim(part)); });
    } else segments.push(item);
  }
  return segments;
}
function _pauseToken(ms){ const n=Math.max(0,Math.min(1500,Number(ms||0)||0)); return n?`<break time="${n}ms"/>`:""; }
function _decorateSegment(segment,pauses){
  let s=_trim(segment); if(!s) return "";

  s=s
    .replace(/,\s+and\s+I'll\b/gi,", and I'll")
    .replace(/,\s+and\s+I’ll\b/gi,", and I’ll")
    .replace(/,\s+and\s+I\s+can\b/gi,", and I can")
    .replace(/,\s+and\s+we\s+can\b/gi,", and we can")
    .replace(/,\s+but\s+I\b/gi,", but I")
    .replace(/,\s+or\s+I\b/gi,", or I");

  s=s
    .replace(/\.\.\./g,`... ${_pauseToken(pauses.ellipsisMs)}`)
    .replace(/,\s*/g,`, ${_pauseToken(pauses.commaMs)}`)
    .replace(/;\s*/g,`; ${_pauseToken(pauses.semicolonMs)}`)
    .replace(/:\s*/g,`: ${_pauseToken(pauses.colonMs)}`)
    .replace(/\.\s*$/g,`. ${_pauseToken(pauses.periodMs)}`)
    .replace(/\?\s*$/g,`? ${_pauseToken(pauses.questionMs)}`)
    .replace(/!\s*$/g,`! ${_pauseToken(pauses.exclaimMs)}`);

  return s.trim();
}
const _stripMarkup=text=>_str(text).replace(/<break\s+time="\d+ms"\s*\/>/g," ").replace(/\s+/g," ").trim();
function _shapeSpeechText(rawText,options){
  const startedAt=_now(),speechHints=options&&options.speechHints?options.speechHints:DEFAULT_SPEECH_HINTS,pronunciationMap=_mergePronunciationMap(options&&options.pronunciationMap);
  const displayText=_normalizeWhitespace(rawText);
  const speakBase=_applySpeakOptimizations(displayText);
  const pronouncedText=_applyPronunciationMap(speakBase,pronunciationMap);
  const segments=_segmentSentences(pronouncedText,speechHints);
  const ssmlSegments=segments.map(segment=>_decorateSegment(segment,speechHints.pauses)).filter(Boolean);
  const ssmlText=ssmlSegments.length?`<speak>${ssmlSegments.join(_pauseToken(Math.max(120,Math.floor((speechHints.pauses.periodMs||320)*0.65))))}</speak>`:`<speak>${_decorateSegment(pronouncedText,speechHints.pauses)}</speak>`;
  return {rawText:_str(rawText),displayText,textSpeak:pronouncedText,text:pronouncedText,ssmlText,plainText:_stripMarkup(ssmlText).replace(/^<speak>|<\/speak>$/g,""),segments,segmentCount:segments.length,shapeElapsedMs:_now()-startedAt,speechHints,pronunciationMap};
}
function _coerceBuffer(value){
  if(!value) return null;
  if(Buffer.isBuffer(value)) return value;
  if(value instanceof Uint8Array) return Buffer.from(value);
  if(Array.isArray(value)){ try{return Buffer.from(value);}catch(_){return null;} }
  if(typeof value==="string"){
    const s=value.trim(); if(!s) return null;
    if(/^data:audio\//i.test(s)){ const idx=s.indexOf(","); if(idx>-1){ try{return Buffer.from(s.slice(idx+1),"base64");}catch(_){return null;} } }
    const b64ish=/^[A-Za-z0-9+/=\r\n]+$/.test(s)&&(s.length%4===0||s.includes("="));
    if(b64ish){ try{ const out=Buffer.from(s.replace(/\s+/g,""),"base64"); if(out&&out.length) return out; }catch(_){} }
    try{return Buffer.from(s,"binary");}catch(_){return null;}
  }
  if(typeof value==="object"){
    if(value.type==="Buffer"&&Array.isArray(value.data)){ try{return Buffer.from(value.data);}catch(_){return null;} }
    return _coerceBuffer(value.buffer||value.audio||value.audioBuffer||value.audioBase64||value.base64||value.data);
  }
  return null;
}
function _normalizeProviderAudio(out){
  const buffer=_coerceBuffer(out&&(out.buffer||out.audio||out.audioBuffer||out.audioBase64||out.base64||out.data));
  return {
    ok:!!(out&&out.ok&&buffer&&buffer.length),buffer,
    mimeType:_pickFirst(out&&out.mimeType,out&&out.contentType,out&&out.content_type,"audio/mpeg"),
    elapsedMs:Number(out&&out.elapsedMs||out&&out.durationMs||0)||0,
    requestId:_pickFirst(out&&out.requestId,out&&out.id),
    providerStatus:Number(out&&out.providerStatus||out&&out.status||200)||200,
    message:_pickFirst(out&&out.message,out&&out.reason,out&&out.error),
    reason:_pickFirst(out&&out.reason,out&&out.error,out&&out.message),
    retryable:out&&typeof out.retryable==="boolean"?out.retryable:true
  };
}
function _resolveInput(req){
  const body=req&&req.body&&typeof req.body==="object"?req.body:{};
  const query=req&&req.query&&typeof req.query==="object"?req.query:{};
  const params=req&&req.params&&typeof req.params==="object"?req.params:{};
  const headers=req&&req.headers&&typeof req.headers==="object"?req.headers:{};
  const text=_pickFirst(body.textSpeak,body.text,body.data,body.speak,body.say,body.message,body.textDisplay,query.text,query.speak,query.say,params.text);
  const voiceUuid=_pickFirst(body.voice_uuid,body.voiceUuid,body.voiceId,query.voice_uuid,query.voiceUuid,headers["x-sb-voice"],headers["x-voice-uuid"],process.env.RESEMBLE_VOICE_UUID,process.env.SB_RESEMBLE_VOICE_UUID,process.env.SBNYX_RESEMBLE_VOICE_UUID);
  const projectUuid=_pickFirst(body.project_uuid,body.projectUuid,query.project_uuid,query.projectUuid,headers["x-sb-project"],headers["x-project-uuid"],process.env.RESEMBLE_PROJECT_UUID,process.env.SB_RESEMBLE_PROJECT_UUID);
  const outputFormat=_lower(_pickFirst(body.output_format,body.outputFormat,query.output_format,query.outputFormat,headers["x-audio-format"],"mp3"))==="wav"?"wav":"mp3";
  const traceId=_pickFirst(headers["x-sb-trace-id"],headers["x-sb-traceid"],query.traceId,body.traceId,_makeTrace());
  return {
    text:_trim(text).slice(0,MAX_TEXT),
    textDisplay:_trim(_pickFirst(body.textDisplay,query.textDisplay)).slice(0,MAX_TEXT),
    voiceUuid,projectUuid,outputFormat,traceId,
    title:_pickFirst(body.title,query.title,body.source,body.client&&body.client.source,"nyx_tts").slice(0,120),
    sampleRate:body.sampleRate||body.sample_rate||query.sampleRate||query.sample_rate,
    precision:body.precision||query.precision,
    useHd:body.useHd!=null?body.useHd:query.useHd,
    intro:_bool(body.intro!=null?body.intro:query.intro,false),
    healthCheck:_bool(body.healthCheck!=null?body.healthCheck:query.healthCheck,false),
    wantJson:_bool(body.returnJson!=null?body.returnJson:query.returnJson,false),
    mode:_pickFirst(body.mode,query.mode,"presence"),
    source:_pickFirst(body.source,query.source,"tts"),
    sourceId:_pickFirst(body.sourceId,query.sourceId,body.requestId,query.requestId,""),
    speechHints:_parseSpeechHints({...query,...body}),
    pronunciationMap:body.pronunciationMap&&typeof body.pronunciationMap==="object"?body.pronunciationMap:(query.pronunciationMap&&typeof query.pronunciationMap==="object"?query.pronunciationMap:null),
    speechChunks:Array.isArray(body.speechChunks)?body.speechChunks.map(_trim).filter(Boolean).slice(0,24):(Array.isArray(query.speechChunks)?query.speechChunks.map(_trim).filter(Boolean).slice(0,24):[])
  };
}

async function generate(text,options){
  const opts=options&&typeof options==="object"?options:{};
  const fakeReq={body:{text,...opts},query:{},headers:{"x-sb-trace-id":opts.traceId||_makeTrace()}};
  const input=_resolveInput(fakeReq);
  if(!input.text) return {ok:false,reason:"empty_text",status:400};
  if(activeRequests>=MAX_CONCURRENT) return {ok:false,reason:"concurrency_limit",status:429};
  if(_circuitOpen()) return {ok:false,reason:"circuit_open",status:503};

  const shaped=_shapeSpeechText(input.text,{speechHints:input.speechHints,pronunciationMap:input.pronunciationMap});
  const providerInput={...input,text:shaped.text,textDisplay:input.textDisplay||shaped.displayText,textSpeak:shaped.textSpeak,plainText:shaped.plainText,ssmlText:shaped.ssmlText,speechChunks:input.speechChunks&&input.speechChunks.length?input.speechChunks:shaped.segments,speechHints:shaped.speechHints,pronunciationMap:shaped.pronunciationMap,segmentCount:shaped.segmentCount,shapeElapsedMs:shaped.shapeElapsedMs};

  activeRequests+=1;
  try{
    const out=await synthesize(providerInput);
    const normalizedOut=_normalizeProviderAudio(out);
    if(!normalizedOut.ok){
      _recordFailure(normalizedOut.message||normalizedOut.reason||"provider_failed",normalizedOut.providerStatus||503);
      return {ok:false,reason:normalizedOut.reason||"provider_failed",message:normalizedOut.message||"TTS failed",status:normalizedOut.retryable===false?400:(normalizedOut.providerStatus||503),retryable:!!normalizedOut.retryable,provider:"resemble",shapeElapsedMs:shaped.shapeElapsedMs,segmentCount:shaped.segmentCount,textDisplay:providerInput.textDisplay,textSpeak:providerInput.textSpeak};
    }
    _recordSuccess(normalizedOut.providerStatus,normalizedOut.elapsedMs);
    return {ok:true,provider:"resemble",buffer:normalizedOut.buffer,mimeType:normalizedOut.mimeType||"audio/mpeg",elapsedMs:normalizedOut.elapsedMs||0,requestId:normalizedOut.requestId,providerStatus:normalizedOut.providerStatus||200,shapeElapsedMs:shaped.shapeElapsedMs,segmentCount:shaped.segmentCount,textDisplay:providerInput.textDisplay,textSpeak:providerInput.textSpeak,ssmlText:providerInput.ssmlText,speechChunks:providerInput.speechChunks};
  }catch(err){
    const msg=_trim(err&&(err.message||err))||"tts_exception"; _recordFailure(msg,503);
    return {ok:false,reason:"exception",message:msg,status:503,retryable:true,provider:"resemble",shapeElapsedMs:shaped.shapeElapsedMs,segmentCount:shaped.segmentCount,textDisplay:providerInput.textDisplay,textSpeak:providerInput.textSpeak};
  }finally{ activeRequests-=1; }
}

async function handleTts(req,res){
  const input=_resolveInput(req);
  _setCommonAudioHeaders(res,input.traceId,{provider:"resemble",voiceUuid:input.voiceUuid});

  if(input.healthCheck) return _safeJson(res,200,{ok:true,provider:"resemble",health:_healthSnapshot(),traceId:input.traceId});
  if(!input.text) return _safeJson(res,400,{ok:false,spokenUnavailable:true,error:"missing_text",detail:"No TTS text was provided.",traceId:input.traceId,payload:{spokenUnavailable:true}});

  const result=await generate(input.text,input);
  _setCommonAudioHeaders(res,input.traceId,{provider:result.provider||"resemble",voiceUuid:input.voiceUuid,elapsedMs:result.elapsedMs||0,shapeMs:result.shapeElapsedMs||0,segmentCount:result.segmentCount||0});

  if(!result.ok){
    const status=result.status===429?429:(result.status>=400&&result.status<500?result.status:503);
    return _safeJson(res,status,{ok:false,spokenUnavailable:true,error:result.reason||"tts_unavailable",detail:result.message||"TTS unavailable.",retryable:!!result.retryable,traceId:input.traceId,provider:result.provider||"resemble",textDisplay:result.textDisplay||input.textDisplay||input.text,textSpeak:result.textSpeak||input.text,shapeElapsedMs:result.shapeElapsedMs||0,segmentCount:result.segmentCount||0,health:_healthSnapshot(),payload:{spokenUnavailable:true}});
  }

  if(input.wantJson){
    return _safeJson(res,200,{ok:true,provider:result.provider,mimeType:result.mimeType,audioBase64:result.buffer.toString("base64"),traceId:input.traceId,elapsedMs:result.elapsedMs||0,requestId:result.requestId,textDisplay:result.textDisplay||input.textDisplay||input.text,textSpeak:result.textSpeak||input.text,speechChunks:result.speechChunks||[],shapeElapsedMs:result.shapeElapsedMs||0,segmentCount:result.segmentCount||0});
  }

  try{
    _setHeader(res,"Content-Type",result.mimeType||"audio/mpeg");
    _setHeader(res,"Content-Length",String(result.buffer.length));
    _setHeader(res,"Accept-Ranges","none");
    res.status(200).send(result.buffer);
  }catch(e){
    return _safeJson(res,503,{ok:false,spokenUnavailable:true,error:"send_failed",detail:_trim(e&&(e.message||e))||"Failed to send audio buffer.",traceId:input.traceId,provider:result.provider||"resemble",payload:{spokenUnavailable:true}});
  }
}

const health=()=>_healthSnapshot();
module.exports={handleTts,ttsHandler:handleTts,handler:handleTts,generate,health,PHASES};

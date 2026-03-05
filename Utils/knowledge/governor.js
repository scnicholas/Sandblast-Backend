"use strict";

/**
 * Conversation Governor
 * ---------------------
 * Prevents conversational loops and repetition.
 *
 * Works with:
 *  - Evidence Orchestrator
 *  - Memory Spine
 *
 * Primary Functions
 *  - detect repeated answers
 *  - escalate loop severity
 *  - request clarifiers
 *  - temporarily fuse bridge calls
 */

function safeStr(x){
  return x == null ? "" : String(x);
}

function hashLite(str){
  str = safeStr(str);
  let h = 2166136261;
  for(let i=0;i<str.length;i++){
    h ^= str.charCodeAt(i);
    h = (h * 16777619) >>> 0;
  }
  return h.toString(16);
}

function normalize(text){
  return safeStr(text)
    .toLowerCase()
    .replace(/\s+/g," ")
    .trim()
    .slice(0,400);
}

/**
 * Detect repetition
 */
function isRepeat(current, memoryCtx){

  if(!memoryCtx || !memoryCtx.loop) return false;

  const lastSig = safeStr(memoryCtx.loop.sig);
  const currentSig = hashLite(normalize(current));

  if(!lastSig) return false;

  return lastSig === currentSig;
}

/**
 * Escalate loop severity
 */
function escalateLoop(memoryCtx){

  if(!memoryCtx.loop){
    memoryCtx.loop = { n:0, severity:0 };
  }

  memoryCtx.loop.n += 1;

  if(memoryCtx.loop.n >= 2){
    memoryCtx.loop.severity += 1;
  }

  return memoryCtx.loop;
}

/**
 * Fuse bridge temporarily
 */
function fuseBridge(memoryCtx, reason){

  if(!memoryCtx.bridge){
    memoryCtx.bridge = {};
  }

  const fuseMs = 12000;

  memoryCtx.bridge.fused = true;
  memoryCtx.bridge.fuseReason = reason || "loop_guard";
  memoryCtx.bridge.fusedUntil = Date.now() + fuseMs;

  return memoryCtx.bridge;
}

/**
 * Generate clarifier response
 */
function buildClarifier(userText){

  const q = safeStr(userText).slice(0,120);

  return {
    type: "clarifier",
    text:
      "Just to make sure I understand correctly — are you asking about " +
      `"${q}" from a technical perspective, or are you looking for a practical solution?`
  };
}

/**
 * Main Governor Entry
 */
function applyGovernor(input){

  const evidence = input.evidencePack || {};
  const memory = evidence.packs ? evidence.packs.memory : null;

  const primary = evidence.primary || null;

  if(!primary){
    return { action:"pass" };
  }

  const text = primary.text || "";

  const repeat = isRepeat(text, memory);

  if(!repeat){

    if(memory && memory.loop){
      memory.loop.sig = hashLite(normalize(text));
      memory.loop.n = 0;
    }

    return {
      action: "pass",
      text
    };
  }

  const loop = escalateLoop(memory);

  /**
   * Stage 1 loop
   * Ask clarifier
   */
  if(loop.severity === 1){

    return {
      action: "clarify",
      response: buildClarifier(input.userText),
      memory
    };
  }

  /**
   * Stage 2 loop
   * Fuse bridge + branch conversation
   */
  if(loop.severity >= 2){

    fuseBridge(memory,"repeat_loop");

    return {
      action: "branch",
      response: {
        text:
          "I think we're circling the same point. Let me approach it a different way — are you trying to solve the core problem, or understand the underlying system?"
      },
      memory
    };
  }

  return {
    action: "pass",
    text
  };
}

module.exports = {
  applyGovernor
};

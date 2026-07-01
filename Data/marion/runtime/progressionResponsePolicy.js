"use strict";

const VERSION = "progressionResponsePolicy v1.1.1 KNOWLEDGE-QUESTION-BYPASS + THIN-REPLY-BLOCKING-HARDLOCK";
const RESPONSE_POLICY_VERSION = "nyx.marion.progressionResponsePolicy/1.1";
const shape = require("./progressionShape.js");

function safeStr(value) { return value == null ? "" : String(value).replace(/\s+/g, " ").trim(); }
function safeObj(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }

function nextPhaseLabel(phaseKey = "") {
  if (phaseKey === "phase1") return "Phase 2: Progression memory and continuity";
  if (phaseKey === "phase2") return "Phase 3: Response shaping rules";
  if (phaseKey === "phase3") return "Phase 4: Regression tests and telemetry";
  return "Domain confidence scoring prelock";
}

function validationForPhase(phaseKey = "") {
  if (phaseKey === "phase1") return "run the signal prompts: next steps, continue, passed, failed, and what now. Each must classify without broad clarification.";
  if (phaseKey === "phase2") return "confirm activePhase, currentStep, lastUserIntent, lastSystemAction, pendingAction, and pass/fail state carry into State Spine.";
  if (phaseKey === "phase3") return "verify response expansion: next steps must return an action plan, passed must advance, failed must diagnose, and continue must preserve the current lane.";
  return "run the progression-shaping, continuity-smoke, and mic/text parity progression tests.";
}

function isThinProgressionReply(value = "") {
  return /^\s*(continue|next|ok|done|proceed)\.?\s*$/i.test(safeStr(value));
}

function expandedNextAction(phaseKey = "") {
  return `${validationForPhase(phaseKey)} If that passes, mark it Passed; if it fails, send the first bad reply so the response-shaping layer can be patched without resetting the lane.`;
}

function shapeProgressionReply({ reply = "", text = "", profile = {}, memory = {} } = {}) {
  if (shape && typeof shape.isKnowledgeQuestionText === "function" && shape.isKnowledgeQuestionText(text)) return safeStr(reply);
  const p = safeObj(profile).active ? safeObj(profile) : shape.buildProgressionProfile(text, { progressionRefinement: memory });
  if (!p.active) return safeStr(reply);
  const phase = p.phaseLabel || "Progression shaping refinement";
  const phaseKey = p.phaseKey || p.currentStep || "phase3";
  const signal = p.signal || p.lastUserIntent || "unknown";
  if (signal === "pass") return `${phase} passed. Lock the result, preserve progressionRefinement in memoryPatch/stateBridge, then move to ${nextPhaseLabel(phaseKey)}.`;
  if (signal === "fail") return `${phase} needs repair. The critical issue is response shaping did not expand the public answer. Patch the current phase, rerun the same prompt, and do not advance until “next steps” returns a concrete action plan.`;
  if (signal === "next_steps" || signal === "continue" || signal === "unknown") return `${phase}: ${expandedNextAction(phaseKey)}`;
  if (signal === "testing") return `${phase}: run the validation now. Expected result: active lane stays progression_shaping_refinement, the public reply gives one concrete next action, and no diagnostic or broad clarification language reaches the user surface.`;
  if (signal === "execution") return `${phase}: apply the patch beside the active Marion runtime files, carry progressionRefinement through memoryPatch and stateBridge, then run node --check on composeMarionResponse.js, marionBridge.js, stateSpine.js, and the progression modules.`;
  if (signal === "clarification") return `${phase} means Marion detects the current build moment, remembers the active phase, shapes the reply for that state, and validates the behavior with regression telemetry.`;
  if (isThinProgressionReply(reply)) return `${phase}: ${expandedNextAction(phaseKey)}`;
  return safeStr(reply) || `${phase}: ${expandedNextAction(phaseKey)}`;
}

module.exports = { VERSION, RESPONSE_POLICY_VERSION, shapeProgressionReply, validationForPhase, nextPhaseLabel, isThinProgressionReply, default: shapeProgressionReply };

// R18AB_AI_CYBER_RESPONSE_POLICY_START
const R18AB_RESPONSE_POLICY_VERSION = "nyx.marion.r18ab.progressionResponsePolicy.aiCyber/1.0";
function r18abPolStr(value){return value==null?"":String(value).replace(/\s+/g," ").trim();}
function r18abPolicyKind(text="",memory={}){
  const src=[r18abPolStr(text),JSON.stringify(memory&&typeof memory==="object"?memory:{}).slice(0,1000)].join(" ").toLowerCase();
  if(/\b(cyber|cybersecurity|security|protective protocol|least privilege|access control|identity|verify identity|secret|token|credential|permission|threat|vulnerability)\b/i.test(src))return"cyber";
  if(/\b(ai|artificial intelligence|machine learning|model|llm|agent|inference|automation|adaptive intelligence|ai integration|real[-\s]?world ai)\b/i.test(src))return"ai";
  return"";
}
function shapeR18ABDomainReply(reply="",text="",memory={}){
  const kind=r18abPolicyKind(text,memory);
  if(!kind)return r18abPolStr(reply);
  const thin=/^\s*(continue|next|ok|done|proceed|keep going|passed)\.?\s*$/i.test(r18abPolStr(reply));
  if(kind==="ai"&&thin)return"AI lane stays active: assess the goal, context, data, risk, and next move before changing the system.";
  if(kind==="cyber"&&thin)return"Security lane stays active: verify identity, protect access and secrets, then require explicit confirmation before sensitive action.";
  return r18abPolStr(reply);
}
(function r18abPatchResponsePolicyExports(){
  if(typeof module==="undefined"||!module.exports||typeof module.exports!=="object")return;
  const exp=module.exports;
  const fn=typeof exp.shapeProgressionReply==="function"?exp.shapeProgressionReply:null;
  if(fn&&!fn.__r18abResponsePolicyPatched){
    exp.shapeProgressionReply=function r18abShapeProgressionReplyWrapped(opts){
      let result;
      try{ result=fn.apply(this,arguments); }catch(err){ result=r18abPolStr(opts&&opts.reply)||""; }
      const o=opts&&typeof opts==="object"?opts:{};
      return shapeR18ABDomainReply(result,o.text,o.memory);
    };
    exp.shapeProgressionReply.__r18abResponsePolicyPatched=true;
    exp.default=exp.shapeProgressionReply;
  }
  exp.R18AB_RESPONSE_POLICY_VERSION=R18AB_RESPONSE_POLICY_VERSION;
  exp.shapeR18ABDomainReply=shapeR18ABDomainReply;
  exp.r18abPolicyKind=r18abPolicyKind;
  exp.R18AB_RESPONSE_POLICY_PATCH=true;
})();
// R18AB_AI_CYBER_RESPONSE_POLICY_END


"use strict";

const assert = require("assert");
const Module = require("module");
const path = require("path");

const registryPath = path.resolve(__dirname, "../../Data/marion/runtime/conversation/marionConversationLayerRegistry.js");
const commits = { progression: [], outcome: [], strategic: [], completion: [] };

function obj(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function makeThread(domain, subject, turnId) {
  return { id: `thread-${turnId}`, domain, subject, stage: "analysis", turnCount: 1 };
}

const pivot = {
  VERSION: "test.contextPivot/1.0",
  isContinuation(prompt) { return /^(?:go deeper|continue)[.!?]*$/i.test(prompt); },
  isReturn(prompt) { return /^back to/i.test(prompt); },
  isBranch(prompt) { return /^before that/i.test(prompt); },
  isExplicitPivot() { return false; },
  analyzeTurn({ prompt = "", previous = {}, domain = "general", subject = "", stage = "analysis", turnId = "test", reset = false } = {}) {
    const prior = obj(previous);
    let active = prior.activeThread ? { ...prior.activeThread } : null;
    let paused = Array.isArray(prior.pausedThreads) ? prior.pausedThreads.map((item) => ({ ...item })) : [];
    const greeting = /^(?:hello|hi|hey|good\s+(?:morning|afternoon|evening))/i.test(prompt);
    let direction;
    if (reset) direction = "reset";
    else if (greeting) direction = "social_pause";
    else if (this.isReturn(prompt)) direction = "return";
    else if (this.isBranch(prompt)) direction = "branch";
    else if (this.isContinuation(prompt)) direction = active ? "continue" : paused.length ? "return" : "clarify";
    else direction = active ? "continue" : "start";

    if (direction === "social_pause") {
      if (active) paused = [...paused, active].slice(-4);
      active = null;
    } else if (direction === "branch") {
      if (active) paused = [...paused, active].slice(-4);
      active = makeThread(domain, subject || prompt, turnId);
    } else if (direction === "start" || direction === "pivot") {
      active = makeThread(domain, subject || prompt, turnId);
    } else if (direction === "return") {
      const selected = paused[paused.length - 1];
      if (selected) {
        active = { ...selected, turnCount: Number(selected.turnCount || 0) + 1 };
        paused = paused.slice(0, -1);
      }
    } else if (active) {
      active = { ...active, subject: subject || active.subject, domain: domain || active.domain, stage };
    }

    const changedDirection = ["reset", "start", "branch", "return", "pivot", "social_pause"].includes(direction);
    return {
      direction,
      changedDirection,
      activeThread: active,
      pausedThreads: paused,
      activeDomain: direction === "social_pause" ? "general" : active && active.domain || domain,
      activeSubject: direction === "social_pause" ? "" : active && active.subject || subject,
      threadPriority: direction === "branch" ? "temporary" : direction === "return" ? "resumed" : "primary"
    };
  },
  applyNuance(flow = {}, nuance = {}) {
    const base = obj(flow), state = obj(obj(nuance).layer24).currentState;
    if ((state === "correction" || state === "disagreement" || state === "continuation") && base.activeThread) {
      return { ...base, direction: "continue", changedDirection: false };
    }
    if (state === "clarification" && base.activeThread) return { ...base, direction: "clarify", changedDirection: false };
    if (state === "topic_pivot" && base.direction !== "return") return { ...base, direction: "pivot", changedDirection: true };
    return base;
  },
  commitTurn(flow = {}, stage = "") { return { ...obj(flow), stage: stage || obj(flow).stage }; },
  projectState(flow = {}) { return { ...obj(flow) }; }
};

const progression = {
  VERSION: "test.progression/1.0",
  analyzeTurn({ domain = "general", subject = "" } = {}) { return { stage: "analysis", activeDomain: domain, activeSubject: subject }; },
  commitTurn(flow = {}, reply = "") { commits.progression.push({ reply }); return { ...obj(flow), stage: "analysis" }; },
  projectState(flow = {}) { return { ...obj(flow) }; }
};

const calibration = {
  VERSION: "test.calibration/1.0",
  analyzeTurn() { return {}; },
  composerDirective() { return {}; },
  projectState() { return {}; }
};

const outcome = {
  VERSION: "test.outcome/1.0",
  classify() { return { outcomeType: "none" }; }
};
const guidance = { VERSION: "test.guidance/1.0", isOutcomeQuery() { return false; } };
const outcomeCoordinator = {
  VERSION: "test.outcomeCoordinator/1.0", outcome, commitments: { VERSION: "test.commitments/1.0" }, guidance,
  analyzeTurn() { return { outcomeAwareness: {}, commitmentTracking: {}, anticipatoryGuidance: {} }; },
  commitTurn(flow = {}, reply = "", result = {}) { commits.outcome.push({ reply, result }); return { ...obj(flow), outcomeAwareness: {}, commitmentTracking: {}, anticipatoryGuidance: {} }; },
  projectState(flow = {}) { return { ...obj(flow) }; }
};

const strategic = {
  VERSION: "test.strategic/1.0", alignment: { VERSION: "test.alignment/1.0" }, risk: { VERSION: "test.risk/1.0" },
  pathways: { VERSION: "test.pathways/1.0", directStrategicQuery() { return false; } },
  analyzeTurn() { return { objectiveAlignment: {}, predictiveRisk: {}, pathwaySynthesis: {} }; },
  commitTurn(flow = {}, reply = "", result = {}) { commits.strategic.push({ reply, result }); return { ...obj(flow), objectiveAlignment: {}, predictiveRisk: {}, pathwaySynthesis: {} }; },
  projectState(flow = {}) { return { ...obj(flow) }; }
};

const completion = {
  VERSION: "test.completion/1.0", context: { VERSION: "test.context/1.0" }, realignment: { VERSION: "test.realignment/1.0" }, closure: { VERSION: "test.closure/1.0" },
  directQuery() { return false; },
  analyzeTurn() { return { crossDomainContext: {}, goalRealignment: {}, decisionClosure: {} }; },
  commitTurn(flow = {}, reply = "", result = {}) { commits.completion.push({ reply, result }); return { ...obj(flow), crossDomainContext: {}, goalRealignment: {}, decisionClosure: {} }; },
  projectState(flow = {}) { return { ...obj(flow) }; }
};

const coordinator = {
  VERSION: "test.nuance/1.0",
  safeAnalyzeMarionNuancePhaseA(input = {}) {
    const prompt = String(input.prompt || "");
    const currentState = /^good evening/i.test(prompt) ? "topic_pivot" : "continuation";
    return {
      contract: "nyx.marion.nuance.phaseA/1.0",
      version: this.VERSION,
      turnId: input.turnId,
      layer21: {}, layer22: { primaryCandidate: {} }, layer23: {},
      layer24: { currentState, confidence: 0.9, controlFlags: {} },
      culturalCompatibility: {}, carryPolicy: { approvedStatePatch: {} }
    };
  },
  moduleHealth() { return { ok: true, version: this.VERSION, modules: {} }; }
};

const dependencies = new Map([
  ["./marionConversationProgression.js", progression],
  ["./marionContextPivot.js", pivot],
  ["./marionInteractionCalibration.js", calibration],
  ["./marionOutcomeFlowCoordinator.js", outcomeCoordinator],
  ["../strategy/marionStrategicFlowCoordinator.js", strategic],
  ["../completion/marionCompletionFlowCoordinator.js", completion],
  ["../nuance/marionNuancePhaseACoordinator.js", coordinator]
]);
const originalLoad = Module._load;
Module._load = function loadWithRuntimeStubs(request, parent, isMain) {
  if (dependencies.has(request)) return dependencies.get(request);
  return originalLoad.call(this, request, parent, isMain);
};
let registry;
try {
  registry = require(registryPath);
} finally {
  Module._load = originalLoad;
}

let previous = {};
let turnId = 0;
function turn(prompt) {
  const flow = registry.analyzeTurn({ prompt, turnId: `test-${++turnId}` }, previous);
  previous = { conversationFlowState: registry.projectState(flow) };
  return flow;
}

let flow = turn("Hello Marion.");
assert.strictEqual(flow.direction, "social_pause", "Layer 24 must not turn a social pause into a topic pivot");
assert.strictEqual(flow.contextPivot.direction, "social_pause");

flow = turn("Do a surgical autopsy on the JavaScript routing file.");
assert.strictEqual(flow.direction, "start", "Layer 24 continuation state must not erase a new thread");
assert.strictEqual(flow.contextPivot.direction, "start");

flow = turn("Before that, what is the business risk?");
assert.strictEqual(flow.direction, "branch", "Layer 24 continuation state must not erase a branch");
assert.strictEqual(flow.contextPivot.direction, "branch");

flow = turn("Back to the routing repair.");
assert.strictEqual(flow.direction, "return", "Layer 24 continuation state must not erase a return");
assert.strictEqual(flow.contextPivot.direction, "return");
assert.match(flow.activeSubject, /JavaScript routing file/i, "return must restore the paused thread subject");

flow = turn("Good evening, Marion.");
assert.strictEqual(flow.direction, "social_pause");
assert.strictEqual(flow.contextPivot.direction, "social_pause");

flow = turn("Continue.");
assert.strictEqual(flow.direction, "return", "resume must restore the paused thread instead of becoming a generic continuation");
assert.strictEqual(flow.contextPivot.direction, "return");
assert.match(flow.activeSubject, /JavaScript routing file/i);

commits.progression.length = 0;
commits.outcome.length = 0;
commits.strategic.length = 0;
commits.completion.length = 0;
const technicalFlow = {
  activeDomain: "technical",
  activeSubject: "JavaScript routing file",
  lastReply: "Previous trusted technical reply",
  progression: {}, contextPivot: { direction: "continue", activeDomain: "technical", activeSubject: "JavaScript routing file", activeThread: { domain: "technical", subject: "JavaScript routing file" } },
  interactionCalibration: {}, outcomeFlow: {}, strategicFlow: {}, completionFlow: {}
};
const rejected = registry.commitTurn(technicalFlow, "A law reply from a mismatched result", { domain: "technical", primaryDomain: "technical", payload: { domain: "law" } });
assert.strictEqual(rejected.resultDomain, "", "cross-domain result metadata must not be committed into a technical thread");
assert.strictEqual(rejected.lastReply, "Previous trusted technical reply", "cross-domain reply must not replace the last trusted reply");
for (const layer of ["progression", "outcome", "strategic", "completion"]) {
  const record = commits[layer][0];
  assert.strictEqual(record.reply, "", `${layer} state must not commit a mismatched reply`);
  if (layer !== "progression") assert.deepStrictEqual(record.result, {}, `${layer} state must not commit mismatched result metadata`);
}

const accepted = registry.commitTurn(technicalFlow, "A technical reply", { domain: "technical" });
assert.strictEqual(accepted.resultDomain, "technical", "same-domain results must still commit");
assert.strictEqual(accepted.lastReply, "A technical reply");

console.log("[PASS] Registry critical fixes: Layer 10 transitions survive Phase A overlays; mismatched-domain results are excluded from committed continuity state.");

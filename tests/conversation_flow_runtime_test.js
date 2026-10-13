"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..", "..");
const runId = `${Date.now().toString(36)}-${process.pid}-${crypto.randomBytes(4).toString("hex")}`;
const resultsPath = path.join(__dirname, "RUNTIME_RESULTS.json");
const context = { adminVerified: true, sessionVerified: true };
const failures = [];
const rows = [];
let assertionCount = 0;

function valueAt(object, dottedPath) {
  return dottedPath.split(".").reduce((value, key) => {
    return value === null || value === undefined ? undefined : value[key];
  }, object);
}

function displayValue(value) {
  if (value === undefined) return "[undefined]";
  if (value === null) return "[null]";
  if (typeof value === "string") return value.length > 800 ? `${value.slice(0, 800)}…` : value;
  try {
    const encoded = JSON.stringify(value);
    return encoded.length > 1200 ? `${encoded.slice(0, 1200)}…` : encoded;
  } catch (_) {
    return String(value);
  }
}

function check(condition, label, actual, expected) {
  assertionCount += 1;
  if (!condition) {
    failures.push({
      label,
      expected: displayValue(expected),
      actual: displayValue(actual)
    });
  }
}

function describeError(error) {
  return {
    name: error && error.name ? error.name : "Error",
    message: error && error.message ? error.message : String(error),
    stack: error && error.stack ? error.stack : null
  };
}

function resultRow(sessionId, prompt, out) {
  const flow = valueAt(out, "conversationFlow");
  const pivot = valueAt(flow, "contextPivot");
  const pausedThreads = valueAt(pivot, "pausedThreads");
  const reply = valueAt(out, "reply");
  return {
    sessionId,
    prompt,
    statusCode: valueAt(out, "statusCode"),
    stage: valueAt(flow, "stage"),
    direction: valueAt(flow, "direction"),
    domain: valueAt(out, "result.domain"),
    activeDomain: valueAt(out, "conversationFlowState.activeDomain"),
    activeSubject: valueAt(out, "conversationFlowState.activeSubject"),
    recoveryUsed: valueAt(out, "degraded") === true,
    reply: String(reply || "").slice(0, 260),
    calibration: valueAt(flow, "interactionCalibration"),
    pausedThreads: Array.isArray(pausedThreads) ? pausedThreads.length : 0
  };
}

function writeReport(extra) {
  const report = {
    ok: failures.length === 0,
    runId,
    assertions: assertionCount,
    steps: rows.length,
    version: extra && extra.version ? extra.version : null,
    failures,
    rows,
    completedAt: new Date().toISOString()
  };

  try {
    fs.writeFileSync(resultsPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  } catch (error) {
    failures.push({
      label: "write_runtime_results",
      expected: resultsPath,
      actual: describeError(error)
    });
    report.ok = false;
    report.failures = failures;
  }

  console.log(report.ok ? `[PASS] Conversation flow runtime: ${assertionCount} assertions across ${rows.length} steps.` : `[FAIL] Conversation flow runtime: ${failures.length} failure(s) across ${rows.length} steps.`);
  console.log(`Report: ${resultsPath}`);
  console.log(`Run ID: ${runId}`);
  for (const failure of failures) {
    console.error(`[FAIL] ${failure.label} | expected: ${failure.expected} | actual: ${displayValue(failure.actual)}`);
  }

  return report;
}

async function main() {
  let registry = null;

  try {
    const adapterPath = path.join(root, "Data/marion/runtime/marionPrivateRuntimeAdapter.js");
    const registryPath = path.join(root, "Data/marion/runtime/conversation/marionConversationLayerRegistry.js");
    const adapter = require(adapterPath);
    registry = require(registryPath);

    async function send(sessionKey, prompt, extra) {
      const sessionId = `${sessionKey}-${runId}`;
      const out = await adapter.invokePrivateRuntime({ ...(extra || {}), prompt, sessionId }, context);
      const safeOut = out && typeof out === "object" ? out : {};
      rows.push(resultRow(sessionId, prompt, safeOut));
      return safeOut;
    }

    const sid = "layers-9-11-primary";
    let out = await send(sid, "Hello Marion.");
    check(valueAt(out, "statusCode") === 200, "greeting_http_200", valueAt(out, "statusCode"), 200);
    check(valueAt(out, "conversationFlow.stage") === "social", "greeting_social_stage", valueAt(out, "conversationFlow.stage"), "social");

    out = await send(sid, "Do a surgical autopsy on the JavaScript routing file.");
    check(valueAt(out, "result.domain") === "technical", "technical_domain", valueAt(out, "result.domain"), "technical");
    check(valueAt(out, "conversationFlow.stage") === "deep_analysis", "layer9_deep_analysis", valueAt(out, "conversationFlow.stage"), "deep_analysis");
    check(valueAt(out, "conversationFlow.direction") === "start", "layer10_start", valueAt(out, "conversationFlow.direction"), "start");

    out = await send(sid, "Go deeper.");
    check(valueAt(out, "conversationFlow.direction") === "continue", "layer10_continue", valueAt(out, "conversationFlow.direction"), "continue");
    check(valueAt(out, "conversationFlow.progression.progressionDepth") >= 1, "layer9_depth_increment", valueAt(out, "conversationFlow.progression.progressionDepth"), ">= 1");
    check(/JavaScript routing file/i.test(String(valueAt(out, "reply") || "")), "subject_alignment", valueAt(out, "reply"), "reply mentions JavaScript routing file");

    out = await send(sid, "What should we fix first?");
    check(valueAt(out, "conversationFlow.stage") === "prioritization", "layer9_prioritization", valueAt(out, "conversationFlow.stage"), "prioritization");
    check(valueAt(out, "conversationFlow.interactionCalibration.decisionRequired") === true, "layer11_decision_mode", valueAt(out, "conversationFlow.interactionCalibration.decisionRequired"), true);

    out = await send(sid, "Before that, what is the business risk?");
    check(valueAt(out, "result.domain") === "business", "branch_business_domain", valueAt(out, "result.domain"), "business");
    check(valueAt(out, "conversationFlow.direction") === "branch", "layer10_branch", valueAt(out, "conversationFlow.direction"), "branch");
    check(Array.isArray(valueAt(out, "conversationFlow.contextPivot.pausedThreads")) && valueAt(out, "conversationFlow.contextPivot.pausedThreads").length === 1, "primary_thread_paused", valueAt(out, "conversationFlow.contextPivot.pausedThreads"), "one paused thread");
    check(valueAt(out, "degraded") !== true, "business_branch_canonical_no_recovery", valueAt(out, "degraded"), false);

    out = await send(sid, "Back to the routing repair.");
    check(valueAt(out, "conversationFlow.direction") === "return", "layer10_return", valueAt(out, "conversationFlow.direction"), "return");
    check(valueAt(out, "result.domain") === "technical", "return_restores_technical", valueAt(out, "result.domain"), "technical");
    check(/JavaScript routing file/i.test(String(valueAt(out, "conversationFlow.activeSubject") || "")), "return_restores_subject", valueAt(out, "conversationFlow.activeSubject"), "subject mentions JavaScript routing file");

    out = await send(sid, "Give me the direct answer.");
    check(valueAt(out, "conversationFlow.direction") === "continue", "calibration_command_is_continuation", valueAt(out, "conversationFlow.direction"), "continue");
    check(valueAt(out, "conversationFlow.interactionCalibration.directness") === "high", "layer11_directness", valueAt(out, "conversationFlow.interactionCalibration.directness"), "high");
    check(valueAt(out, "conversationFlow.interactionCalibration.responseLength") === "short", "layer11_short_budget", valueAt(out, "conversationFlow.interactionCalibration.responseLength"), "short");

    out = await send(sid, "I am frustrated that this keeps happening. Give me the root cause.");
    check(valueAt(out, "conversationFlow.direction") === "continue", "frustration_keeps_active_thread", valueAt(out, "conversationFlow.direction"), "continue");
    check(valueAt(out, "result.domain") === "technical", "frustration_preserves_domain", valueAt(out, "result.domain"), "technical");
    check(valueAt(out, "conversationFlow.interactionCalibration.warmth") === "steady", "layer11_frustration_steady", valueAt(out, "conversationFlow.interactionCalibration.warmth"), "steady");
    check(valueAt(out, "conversationFlow.interactionCalibration.acknowledgementBudget") === 1, "layer11_ack_budget", valueAt(out, "conversationFlow.interactionCalibration.acknowledgementBudget"), 1);

    out = await send(sid, "Good evening, Marion.");
    check(valueAt(out, "conversationFlow.direction") === "social_pause", "social_pause", valueAt(out, "conversationFlow.direction"), "social_pause");
    check(valueAt(out, "conversationFlowState.activeDomain") === "general", "visible_lane_exit", valueAt(out, "conversationFlowState.activeDomain"), "general");
    check(Array.isArray(valueAt(out, "conversationFlow.contextPivot.pausedThreads")) && valueAt(out, "conversationFlow.contextPivot.pausedThreads").length >= 1, "working_thread_preserved_while_social", valueAt(out, "conversationFlow.contextPivot.pausedThreads"), ">= 1 paused thread");

    out = await send(sid, "Continue.");
    check(valueAt(out, "conversationFlow.direction") === "return", "social_resume_return", valueAt(out, "conversationFlow.direction"), "return");
    check(valueAt(out, "result.domain") === "technical", "social_resume_domain", valueAt(out, "result.domain"), "technical");
    check(/JavaScript routing file/i.test(String(valueAt(out, "reply") || "")), "social_resume_subject_alignment", valueAt(out, "reply"), "reply mentions JavaScript routing file");

    const legalSid = "layers-9-11-legal";
    out = await send(legalSid, "Review the legal risks in this contract.");
    check(valueAt(out, "result.domain") === "law", "explicit_legal_domain", valueAt(out, "result.domain"), "law");
    out = await send(legalSid, "What should I examine first?");
    check(valueAt(out, "result.domain") === "law", "legal_followup_continuity", valueAt(out, "result.domain"), "law");

    const freshSid = "layers-9-11-fresh";
    out = await send(freshSid, "Continue.", { newSession: true });
    check(valueAt(out, "result.domain") === "general", "fresh_session_no_domain_bleed", valueAt(out, "result.domain"), "general");
    check(["reset", "clarify"].includes(valueAt(out, "conversationFlow.direction")), "fresh_session_resets_or_clarifies", valueAt(out, "conversationFlow.direction"), "reset or clarify");
    check(!/JavaScript routing file/i.test(String(valueAt(out, "reply") || "")), "fresh_session_no_subject_bleed", valueAt(out, "reply"), "reply does not mention JavaScript routing file");

    const publicInput = { prompt: "Go deeper.", surfaceAgent: "Nyx", publicSurface: true };
    const publicPrepared = registry.applyToInput(publicInput, {});
    check(valueAt(publicPrepared, "conversationFlow.contract") === registry.CONTRACT, "registry_standalone_contract", valueAt(publicPrepared, "conversationFlow.contract"), registry.CONTRACT);
  } catch (error) {
    failures.push({
      label: "runtime_execution",
      expected: "test sequence completes",
      actual: describeError(error)
    });
  }

  const report = writeReport({ version: registry && registry.VERSION });
  if (!report.ok) process.exitCode = 1;
}

main().catch((error) => {
  failures.push({ label: "unhandled_runtime_execution", expected: "test sequence completes", actual: describeError(error) });
  writeReport(null);
  process.exitCode = 1;
});

"use strict";

/**
 * Data/marion/runtime/supervision/marionCognitiveSupervisor.js
 *
 * Marion cognitive supervision for Layers 27 and 28.
 *
 * Canonical path:
 * Data/marion/runtime/supervision/marionCognitiveSupervisor.js
 *
 * Authority boundaries:
 * - Layers 1–26 retain final reply authority.
 * - Layer 27 remains advisory.
 * - Layer 28 remains internal/non-authoritative.
 * - Supervision never authorizes execution.
 */

const fs = require("node:fs");
const path = require("node:path");

const VERSION = "nyx.marion.layers27_28.cognitiveSupervisor/1.2";
const CONTRACT = "nyx.marion.cognitiveSupervision/1.1";
const HARD_STOP_LAYER = 28;
const MAX_OUTPUT_BYTES = 48000;

const STRATEGY_ROOT = path.join(__dirname, "..", "strategy");
const METACOGNITION_ROOTS = Object.freeze([
  path.join(__dirname, "metacognition"),
  path.join(__dirname, "..", "metacognition")
]);

function safeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function safeString(value) {
  if (typeof value === "string") return value;
  if (value == null) return "";
  try {
    return String(value);
  } catch (_) {
    return "";
  }
}

function safeRead(obj, key, fallback) {
  try {
    const value = obj && obj[key];
    return value === undefined ? fallback : value;
  } catch (_) {
    return fallback;
  }
}

function safeOwn(obj, key) {
  try {
    return Boolean(obj && Object.prototype.hasOwnProperty.call(obj, key));
  } catch (_) {
    return false;
  }
}

function safeDataCopy(value) {
  const source = safeObject(value);
  const out = {};
  let keys;
  try {
    keys = Object.keys(source);
  } catch (_) {
    return out;
  }

  for (const key of keys) {
    const value = safeRead(source, key, undefined);
    if (value !== undefined) out[key] = value;
  }
  return out;
}

function byteLength(value) {
  return Buffer.byteLength(JSON.stringify(value), "utf8");
}

function minimalBoundedEnvelope(value) {
  const source = safeObject(value);
  const reply = safeString(
    safeRead(source, "reply", safeRead(source, "displayReply", ""))
  );

  const out = {
    bounded: true,
    executionAuthorized: false,
    automaticExecutionAllowed: false,
    replaceComposer: false,
    replaceReplyAuthority: false,
    noUserFacingDiagnostics: true,
    cognitiveInternalOnly: true,
    replyAuthority: "composer_final"
  };

  for (const key of ["ok", "final", "handled", "stateSpine"]) {
    if (safeOwn(source, key)) {
      out[key] = safeRead(source, key, undefined);
    }
  }

  if (reply) {
    out.reply = reply;
    out.displayReply = safeString(safeRead(source, "displayReply", reply)) || reply;
    if (safeOwn(source, "finalReply")) {
      out.finalReply = safeString(safeRead(source, "finalReply", reply)) || reply;
    }
    if (safeOwn(source, "spokenText")) {
      out.spokenText = safeString(safeRead(source, "spokenText", reply)) || reply;
    }
  }

  const supervisor = safeObject(safeRead(source, "cognitiveSupervisor", {}));
  if (Object.keys(supervisor).length) {
    out.cognitiveSupervisor = {
      version: safeString(safeRead(supervisor, "version", VERSION)) || VERSION,
      degraded: Boolean(safeRead(supervisor, "degraded", false)),
      bounded: true,
      layer27Applied: Boolean(safeRead(supervisor, "layer27Applied", false)),
      layer28Applied: Boolean(safeRead(supervisor, "layer28Applied", false)),
      replyAuthorityPreserved: true,
      composerPreserved: true,
      executionAuthorized: false,
      internalOnly: true,
      supervisorIntegrated: true,
      contract: CONTRACT,
      hardStopLayer: HARD_STOP_LAYER
    };
  }

  return out;
}

function bounded(value, limit = MAX_OUTPUT_BYTES) {
  try {
    return byteLength(value) <= limit
      ? value
      : minimalBoundedEnvelope(value);
  } catch (_) {
    return minimalBoundedEnvelope(value);
  }
}

function requireExact(label, candidate) {
  if (!fs.existsSync(candidate)) {
    throw new Error(`${label} runtime missing: ${candidate}`);
  }

  let resolved;
  try {
    resolved = require.resolve(candidate);
  } catch (error) {
    throw new Error(
      [
        `${label} runtime exists but could not be resolved.`,
        `Candidate: ${candidate}`,
        `Cause: ${error && error.message ? error.message : error}`
      ].join("\n"),
      { cause: error }
    );
  }

  try {
    return require(resolved);
  } catch (error) {
    throw new Error(
      [
        `${label} runtime failed during module loading.`,
        `Resolved: ${resolved}`,
        `Cause: ${error && error.message ? error.message : error}`
      ].join("\n"),
      { cause: error }
    );
  }
}

function requireStrategy(file) {
  return requireExact(
    `Layer 27 ${file}`,
    path.join(STRATEGY_ROOT, file)
  );
}

function requireMetacognition(file) {
  const attempted = [];
  for (const root of METACOGNITION_ROOTS) {
    const candidate = path.join(root, file);
    attempted.push(candidate);
    if (fs.existsSync(candidate)) {
      return requireExact(`Layer 28 ${file}`, candidate);
    }
  }

  throw new Error(
    [
      `Missing Layer 28 metacognition runtime: ${file}`,
      "Attempted:",
      ...attempted.map((candidate) => `- ${candidate}`)
    ].join("\n")
  );
}

function preserveReplyAuthority(base, next) {
  const b = safeObject(base);
  const n = safeObject(next);

  // Never spread raw source objects: hostile accessors can throw.
  const out = {
    ...safeDataCopy(b),
    ...safeDataCopy(n)
  };

  const reply = safeString(
    safeRead(
      b,
      "directReply",
      safeRead(
        b,
        "visibleReply",
        safeRead(
          b,
          "displayReply",
          safeRead(b, "finalReply", safeRead(b, "reply", ""))
        )
      )
    )
  );

  if (reply) {
    out.reply = reply;
    out.displayReply = safeString(safeRead(b, "displayReply", reply)) || reply;

    // Text fields only. Boolean/control fields MUST NOT be stringified.
    for (const key of [
      "visibleReply",
      "directReply",
      "finalReply",
      "answer",
      "response",
      "text",
      "message",
      "spokenText"
    ]) {
      if (safeOwn(b, key)) {
        out[key] = safeString(safeRead(b, key, reply)) || reply;
      }
    }
  }

  // Preserve structural/control values with original types.
  for (const key of ["ok", "final", "handled", "stateSpine"]) {
    if (safeOwn(b, key)) {
      out[key] = safeRead(b, key, out[key]);
    }
  }

  const baseFinalEnvelope = safeObject(safeRead(b, "finalEnvelope", {}));
  if (Object.keys(baseFinalEnvelope).length) {
    const currentFinalEnvelope = safeObject(safeRead(out, "finalEnvelope", {}));
    const finalEnvelope = {
      ...safeDataCopy(currentFinalEnvelope),
      ...safeDataCopy(baseFinalEnvelope)
    };

    if (reply) {
      finalEnvelope.reply =
        safeString(safeRead(baseFinalEnvelope, "reply", reply)) || reply;
      finalEnvelope.finalReply =
        safeString(
          safeRead(baseFinalEnvelope, "finalReply", finalEnvelope.reply)
        ) || finalEnvelope.reply;
    }

    finalEnvelope.replyAuthority = "composer_final";
    out.finalEnvelope = finalEnvelope;
  }

  out.executionAuthorized = false;
  out.automaticExecutionAllowed = false;
  out.replaceComposer = false;
  out.replaceReplyAuthority = false;
  out.noUserFacingDiagnostics = true;
  out.cognitiveInternalOnly = true;
  out.replyAuthority = "composer_final";

  return out;
}

const planner = requireStrategy("marionStrategicPlanner.js");
const arbitrator = requireStrategy("marionPriorityArbitrator.js");
const planningEnvelope = requireStrategy("marionPlanningEnvelope.js");

const reasoner = requireMetacognition("marionMetaReasoner.js");
const evaluator = requireMetacognition("marionResponseEvaluator.js");
const reflectionEnvelope = requireMetacognition("marionReflectionEnvelope.js");

async function supervise(input) {
  const src = safeObject(input);
  const base = safeObject(
    safeRead(src, "baseEnvelope", safeRead(src, "envelope", {}))
  );

  try {
    const processingBase = safeDataCopy(base);

    const plan = await Promise.resolve(
      planner.plan({
        ...safeDataCopy(src),
        baseEnvelope: processingBase,
        executionAuthorized: false
      })
    );

    const planObject = safeObject(plan);
    const candidates = safeArray(
      safeRead(planObject, "priorities", safeRead(planObject, "steps", []))
    );

    const priorities = await Promise.resolve(
      arbitrator.arbitrate({
        candidates,
        policy: safeRead(src, "policy", undefined),
        executionAuthorized: false
      })
    );

    const with27 = planningEnvelope.build({
      baseEnvelope: processingBase,
      plan: planObject,
      priorities: safeObject(priorities),
      executionAuthorized: false
    });

    const meta = await Promise.resolve(
      reasoner.reason({
        ...safeDataCopy(src),
        baseEnvelope: with27,
        recursionDepth: 0,
        maxPasses: 1,
        executionAuthorized: false
      })
    );

    const evaluation = await Promise.resolve(
      evaluator.evaluate({
        baseEnvelope: with27,
        meta: safeObject(meta),
        executionAuthorized: false
      })
    );

    const reflected = reflectionEnvelope.build({
      baseEnvelope: with27,
      meta: safeObject(meta),
      evaluation: safeObject(evaluation),
      executionAuthorized: false
    });

    return bounded(
      preserveReplyAuthority(base, {
        ...safeDataCopy(reflected),
        cognitiveSupervisor: {
          version: VERSION,
          layer27Applied: true,
          layer28Applied: true,
          replyAuthorityPreserved: true,
          composerPreserved: true,
          executionAuthorized: false,
          automaticExecutionAllowed: false,
          replaceComposer: false,
          replaceReplyAuthority: false,
          internalOnly: true,
          supervisorIntegrated: true,
          contract: CONTRACT,
          hardStopLayer: HARD_STOP_LAYER
        }
      })
    );
  } catch (_) {
    // Fail closed without re-spreading a hostile base envelope.
    return bounded(
      preserveReplyAuthority(base, {
        cognitiveSupervisor: {
          version: VERSION,
          degraded: true,
          layer27Applied: false,
          layer28Applied: false,
          replyAuthorityPreserved: true,
          composerPreserved: true,
          executionAuthorized: false,
          automaticExecutionAllowed: false,
          replaceComposer: false,
          replaceReplyAuthority: false,
          internalOnly: true,
          supervisorIntegrated: true,
          contract: CONTRACT,
          hardStopLayer: HARD_STOP_LAYER
        }
      })
    );
  }
}

function getStatus() {
  return {
    ok: true,
    version: VERSION,
    contract: CONTRACT,
    hardStopLayer: HARD_STOP_LAYER,
    layers: [27, 28],
    replyAuthorityPreserved: true,
    executionAuthorized: false,
    automaticExecutionAllowed: false,
    replaceComposer: false,
    replaceReplyAuthority: false,
    internalOnly: true
  };
}

module.exports = {
  VERSION,
  CONTRACT,
  HARD_STOP_LAYER,
  supervise,
  coordinate: supervise,
  run: supervise,
  default: supervise,
  getStatus
};

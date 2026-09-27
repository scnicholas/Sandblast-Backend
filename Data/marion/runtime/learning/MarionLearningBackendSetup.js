"use strict";

const { createMarionLearningSignalAdapter } = require("./MarionLearningSignalAdapter");
const { createEvaluator } = require("./MarionLearningEvaluator");
const { createApprovalGate } = require("./MarionLearningApprovalGate");
const { createMarionLearningAuditStore } = require("./MarionLearningAuditStore");
const { createMarionLearningRuntime } = require("./MarionLearningRuntime");
const VERSION = "marion.learningBackendSetup/1.0";

function createAndRegisterMarionLearningBackend({ signalStore, proposalStore, durableAuditAppend, runVersion, healthProbe, gateway } = {}) {
  if (!signalStore || typeof signalStore.appendSignal !== "function") throw new TypeError("private durable signalStore.appendSignal is required");
  if (!proposalStore || typeof proposalStore.get !== "function" || typeof proposalStore.set !== "function") throw new TypeError("private durable proposalStore.get/set are required");
  if (typeof durableAuditAppend !== "function") throw new TypeError("private durable durableAuditAppend is required");
  if (typeof runVersion !== "function") throw new TypeError("offline runVersion evaluator is required");

  const auditStore = createMarionLearningAuditStore({ durableAppend: durableAuditAppend });
  const signalAdapter = createMarionLearningSignalAdapter({ signalStore });
  const evaluator = createEvaluator({ runVersion, auditStore });
  const approvalGate = createApprovalGate({ proposalStore, auditStore });
  const runtime = createMarionLearningRuntime({ signalAdapter, evaluator, approvalGate, healthProbe });
  const gatewayModule = gateway || require("../MarionVoiceGateway.js");
  if (!gatewayModule || typeof gatewayModule.registerMarionLearningRuntime !== "function") {
    throw new Error("Gateway learning registration hook is unavailable");
  }
  const registration = gatewayModule.registerMarionLearningRuntime(runtime);
  return Object.freeze({ VERSION, runtime, auditStore, signalAdapter, evaluator, approvalGate, registration });
}

module.exports = { VERSION, createAndRegisterMarionLearningBackend };

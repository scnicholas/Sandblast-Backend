"use strict";

// Registers the two actual response composer versions for bounded, synthetic
// offline evaluation. Every registration is tied to a fixture set that was
// re-read, contract-checked, and content-hash verified at process startup.
const Dataset = require("./MarionLearningDataset");

const VERSION = "marion.learningOfflineComposerVersions/1.0-synthetic-response-style";
const RESPONSE_STYLE_SCOPE = "response_style";
const MAX_REQUEST_CHARS = 8000;

function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  return Reflect.ownKeys(descriptors).every(key => typeof key === "string" &&
    descriptors[key].enumerable === true && Object.prototype.hasOwnProperty.call(descriptors[key], "value"));
}

function extractReply(result) {
  if (!result || typeof result !== "object" || Array.isArray(result) ||
      result.ok !== true || result.final !== true || result.marionFinal !== true ||
      result.blocked === true || result.awaitingMarion === true) return "";
  const envelope = result.finalEnvelope && typeof result.finalEnvelope === "object" ? result.finalEnvelope : {};
  if (envelope.final !== true || envelope.marionFinal !== true || envelope.blocked === true || envelope.awaitingMarion === true) return "";
  const values = [result.authoritativeReply, result.reply, result.displayReply, result.visibleReply,
    result.finalReply, result.directReply, result.text,
    envelope.authoritativeReply, envelope.reply, envelope.displayReply, envelope.visibleReply,
    envelope.finalReply, envelope.directReply, envelope.text];
  for (const value of values) if (typeof value === "string" && value.trim()) return value.trim();
  return "";
}

function createOfflineEntry(version, compose, bindings) {
  const frozenBindings = Object.freeze(bindings.map(binding => Object.freeze({ ...binding })));
  return Object.freeze({
    version,
    mode: "offline",
    bindings: frozenBindings,
    async runOffline(input, context = {}) {
      if (context.mode !== "offline" || context.version !== version || context.scope !== RESPONSE_STYLE_SCOPE ||
          context.sideEffectsAllowed !== false || context.activationAllowed !== false ||
          !isPlainObject(input) || typeof input.request !== "string") {
        throw new Error("offline_composer_context_rejected");
      }
      const request = input.request.trim();
      if (!request || request.length > MAX_REQUEST_CHARS) throw new Error("offline_fixture_request_invalid");
      const bound = frozenBindings.some(binding => binding.datasetId === context.datasetId &&
        binding.datasetVersion === context.datasetVersion && binding.scope === context.scope);
      if (!bound) throw new Error("offline_composer_binding_missing");

      // Pass a new public-only projection. Fixture fields, expected values,
      // private identity, stored conversation state, tools, and auth never reach
      // the production composer.
      const routed = Object.freeze({});
      const composerInput = Object.freeze({
        rawUserText: request,
        userText: request,
        inputChannel: "text",
        turnId: `offline_${context.caseId}`,
        audience: "public",
        scope: "public",
        publicSurfaceOnly: true,
        operatorPersonalization: false,
        allowPersonalName: false,
        allowOperatorMemory: false,
        authenticatedOperator: false,
        privateAdminConversation: false,
        privateControlPlane: false,
        memoryPartition: "public:anonymous",
        partitionKey: "public:anonymous"
      });
      const result = await compose(routed, composerInput);
      const reply = extractReply(result);
      if (!reply) throw new Error("offline_composer_did_not_return_accepted_final");
      // Only the scoreable text aliases leave this boundary; diagnostics and
      // memory/session patches from the composer are discarded.
      return Object.freeze({ reply, text: reply, displayReply: reply, visibleReply: reply });
    }
  });
}

function registerMarionLearningOfflineComposerVersions({ versionRegistry, manifestSource, fixtureStore, composer } = {}) {
  if (!(versionRegistry instanceof Map)) return { ok: false, reason: "offline_version_registry_missing" };
  if (!manifestSource || typeof manifestSource.listSync !== "function" ||
      !fixtureStore || typeof fixtureStore.verifyFixtureSetSync !== "function") {
    return { ok: false, reason: "offline_fixture_bootstrap_unavailable" };
  }
  if (!composer || typeof composer.composeMarionResponseBeforeR24 !== "function" ||
      typeof composer.composeMarionResponse !== "function") {
    return { ok: false, reason: "offline_composer_versions_unavailable" };
  }
  const baselineVersion = composer.MARION_COMPOSE_BASELINE_VERSION;
  const candidateVersion = composer.MARION_COMPOSE_CURRENT_VERSION;
  if (typeof baselineVersion !== "string" || typeof candidateVersion !== "string" ||
      baselineVersion === candidateVersion || !/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,119}$/.test(baselineVersion) ||
      !/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,119}$/.test(candidateVersion)) {
    return { ok: false, reason: "offline_composer_version_ids_invalid" };
  }

  let manifests;
  try { manifests = manifestSource.listSync(); }
  catch (_) { return { ok: false, reason: "offline_manifest_source_unavailable" }; }
  if (!Array.isArray(manifests)) return { ok: false, reason: "offline_manifest_source_invalid" };

  const validated = [];
  const counts = new Map();
  for (const raw of manifests) {
    const checked = Dataset.validateEvaluationSet(raw);
    if (!checked.ok) continue;
    const dataset = checked.dataset;
    const key = `${dataset.datasetId}@${dataset.version}`;
    counts.set(key, (counts.get(key) || 0) + 1);
    validated.push({ key, dataset });
  }
  const bindings = [];
  const seen = new Set();
  for (const item of validated) {
    if (counts.get(item.key) !== 1 || seen.has(item.key)) continue;
    seen.add(item.key);
    const dataset = item.dataset;
    const fixtureSet = fixtureStore.verifyFixtureSetSync({
      datasetId: dataset.datasetId,
      version: dataset.version,
      fixtureStore: dataset.fixtureStore,
      caseIds: dataset.caseIds
    });
    if (!fixtureSet || fixtureSet.ok !== true || fixtureSet.syntheticOnly !== true ||
        fixtureSet.scope !== RESPONSE_STYLE_SCOPE || fixtureSet.datasetId !== dataset.datasetId ||
        fixtureSet.version !== dataset.version || fixtureSet.fixtureStore !== dataset.fixtureStore ||
        fixtureSet.caseCount !== dataset.caseIds.length || !/^[a-f0-9]{64}$/.test(fixtureSet.fixtureSetHash || "")) continue;
    bindings.push({ datasetId: dataset.datasetId, datasetVersion: dataset.version, scope: RESPONSE_STYLE_SCOPE });
  }
  if (!bindings.length) return { ok: false, reason: "response_style_fixture_binding_unavailable" };

  versionRegistry.set(baselineVersion, createOfflineEntry(baselineVersion, composer.composeMarionResponseBeforeR24, bindings));
  versionRegistry.set(candidateVersion, createOfflineEntry(candidateVersion, composer.composeMarionResponse, bindings));
  return Object.freeze({ ok: true, version: VERSION, bindingCount: bindings.length, versions: 2, scope: RESPONSE_STYLE_SCOPE });
}

module.exports = { VERSION, registerMarionLearningOfflineComposerVersions };

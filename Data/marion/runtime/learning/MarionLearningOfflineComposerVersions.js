"use strict";

// Registers approved, synthetic response-style composer versions for offline
// evaluation only. No activation, private memory, or gateway registration.
const Dataset = require("./MarionLearningDataset");

const VERSION = "marion.learningOfflineComposerVersions/1.9-bounded-offline-input-and-reply-integrity";
const RESPONSE_STYLE_SCOPE = "response_style";
const MAX_REQUEST_CHARS = 8000;
const MAX_REPLY_CHARS = 50000;
const MAX_MANIFESTS = 256;
const ID_RE = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,119}$/;
const HASH_RE = /^[a-f0-9]{64}$/;
const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);
const ownedEntries = new WeakMap();
const REGISTRATION_DIAGNOSTICS_VERSION = "marion.learningOfflineRegistrationDiagnostic/1.0";

// Data-only status; no fixture content, credentials, function source, or outputs.
function inspectOfflineComposerContract(composer) {
  const baseline = own(composer, "composeMarionResponseBeforeR24");
  const candidate = own(composer, "composeMarionResponseR24OfflineCandidate");
  const baselineId = own(composer, "MARION_COMPOSE_BASELINE_VERSION");
  const candidateId = own(composer, "MARION_COMPOSE_CURRENT_VERSION");
  const baselineAvailable = typeof baseline === "function";
  const candidateAvailable = typeof candidate === "function";
  const distinct = baselineAvailable && candidateAvailable && baseline !== candidate;
  const versionIdsValid = validId(baselineId) && validId(candidateId) && baselineId !== candidateId;
  return Object.freeze({
    version: REGISTRATION_DIAGNOSTICS_VERSION,
    ready: distinct && versionIdsValid,
    baselineAvailable,
    pinnedCandidateAvailable: candidateAvailable,
    handlersDistinct: distinct,
    versionIdsValid,
    reason: !baselineAvailable || !candidateAvailable ? "offline_composer_versions_unavailable" :
      !distinct ? "offline_composer_versions_not_distinct" :
      !versionIdsValid ? "offline_composer_version_ids_invalid" : "ready"
  });
}

function plainData(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) return false;
  return Reflect.ownKeys(value).every(key => {
    if (typeof key !== "string" || FORBIDDEN_KEYS.has(key)) return false;
    const desc = Object.getOwnPropertyDescriptor(value, key);
    return !!desc && desc.enumerable && Object.prototype.hasOwnProperty.call(desc, "value");
  });
}
function own(value, key) {
  if (!plainData(value)) return undefined;
  const desc = Object.getOwnPropertyDescriptor(value, key);
  return desc && Object.prototype.hasOwnProperty.call(desc, "value") ? desc.value : undefined;
}
function validId(value) { return typeof value === "string" && ID_RE.test(value); }
function denseArray(value, maximum) {
  if (!Array.isArray(value) || value.length > maximum) return false;
  const keys = Reflect.ownKeys(value);
  if (keys.length !== value.length + 1 || !keys.includes("length")) return false;
  for (let i = 0; i < value.length; i++) {
    const d = Object.getOwnPropertyDescriptor(value, String(i));
    if (!d || !d.enumerable || !Object.prototype.hasOwnProperty.call(d, "value")) return false;
  }
  return true;
}
function cleanedText(value, maximum) {
  if (typeof value !== "string" || value.length > maximum) return null;
  const text = value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  return text && text.length <= maximum ? text : null;
}
// Preserve line-oriented fixture instructions (headings, lists, paragraphs).
// Never transform tabs or control characters into additional trusted lines.
function cleanedMultilineText(value, maximum) {
  if (typeof value !== "string" || value.length > maximum) return null;
  const text = value.replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, " ")
    .split("\n").map(line => line.replace(/[^\S\n]+/g, " ").trimEnd())
    .join("\n").trim();
  return text && text.length <= maximum ? text : null;
}
function renderedEvidence(evidence) {
  if (evidence === undefined) return "";
  if (!plainData(evidence)) throw new Error("offline_fixture_evidence_invalid");
  const keys = Object.keys(evidence).sort();
  if (keys.length > 20) throw new Error("offline_fixture_evidence_invalid");
  if (!keys.length) return "";
  const lines = [];
  const seenLabels = new Set();
  for (const key of keys) {
    if (key.length > 80) throw new Error("offline_fixture_evidence_invalid");
    const label = cleanedText(key, 80);
    const value = own(evidence, key);
    if (!label || seenLabels.has(label) || /[\r\n]/.test(key) ||
        !(["string", "number", "boolean"].includes(typeof value)) ||
        (typeof value === "number" && !Number.isFinite(value))) {
      throw new Error("offline_fixture_evidence_invalid");
    }
    seenLabels.add(label);
    const rendered = typeof value === "string" ? cleanedText(value, 1000) : String(value);
    if (!rendered) throw new Error("offline_fixture_evidence_invalid");
    lines.push(`- ${label}: ${rendered}`);
  }
  return `\n\nProvided synthetic facts for this task:\n${lines.join("\n")}\nUse only these facts for factual details.`;
}
function finalReply(result) {
  if (!plainData(result) || own(result, "ok") !== true || own(result, "final") !== true ||
      own(result, "marionFinal") !== true || own(result, "blocked") === true ||
      own(result, "awaitingMarion") === true || own(result, "canEmit") === false ||
      own(result, "degraded") === true || own(result, "requiresRetry") === true) return "";
  const envelope = own(result, "finalEnvelope");
  if (!plainData(envelope) || own(envelope, "final") !== true ||
      own(envelope, "marionFinal") !== true || own(envelope, "blocked") === true ||
      own(envelope, "awaitingMarion") === true || own(envelope, "canEmit") === false) return "";
  const keys = ["authoritativeReply", "reply", "displayReply", "visibleReply", "finalReply", "directReply", "text"];
  let accepted = null;
  let comparison = null;
  for (const part of [result, envelope]) {
    for (const key of keys) {
      const value = own(part, key);
      if (value === undefined || value === null) continue;
      if (typeof value !== "string" || !value.trim() || value.length > MAX_REPLY_CHARS)
        throw new Error("offline_composer_reply_surface_invalid");
      // NFKC/whitespace comparison tolerates benign display differences,
      // but scoring MUST receive the original line structure for headings/bullets.
      const normalized = cleanedMultilineText(value.normalize("NFKC"), MAX_REPLY_CHARS);
      if (!normalized) throw new Error("offline_composer_reply_surface_invalid");
      const comparable = normalized.replace(/\s+/gu, " ").trim();
      if (accepted === null) { accepted = normalized; comparison = comparable; }
      else if (comparison !== comparable) throw new Error("offline_composer_reply_surfaces_disagree");
    }
  }
  return accepted || "";
}

function bindingFingerprint(bindings) {
  return bindings.map(item => `${item.datasetId}\u0000${item.datasetVersion}\u0000${item.scope}\u0000${item.fixtureStore}\u0000${item.fixtureSetHash}`).sort().join("\u0001");
}
function createOfflineEntry(version, compose, bindings) {
  const frozenBindings = Object.freeze(bindings.map(binding => Object.freeze({ ...binding })));
  const entry = Object.freeze({
    version, mode: "offline", bindings: frozenBindings,
    async runOffline(input, context = {}) {
      if (!plainData(context) || own(context, "mode") !== "offline" || own(context, "version") !== version ||
          own(context, "scope") !== RESPONSE_STYLE_SCOPE || own(context, "sideEffectsAllowed") !== false ||
          own(context, "activationAllowed") !== false || !validId(own(context, "caseId")) ||
          !validId(own(context, "datasetId")) || !validId(own(context, "datasetVersion")) ||
          !validId(own(context, "fixtureStore")) ||
          !HASH_RE.test(own(context, "manifestHash") || "") ||
          !HASH_RE.test(own(context, "fixtureSetHash") || "") ||
          !plainData(input) || typeof own(input, "request") !== "string" ||
          Object.keys(input).some(key => key !== "request" && key !== "evidence")) {
        throw new Error("offline_composer_context_rejected");
      }
      const request = cleanedMultilineText(own(input, "request"), MAX_REQUEST_CHARS);
      if (!request) throw new Error("offline_fixture_request_invalid");
      if (!frozenBindings.some(binding => binding.datasetId === context.datasetId &&
          binding.datasetVersion === context.datasetVersion && binding.scope === context.scope &&
          binding.fixtureStore === context.fixtureStore && binding.fixtureSetHash === context.fixtureSetHash)) {
        throw new Error("offline_composer_binding_missing");
      }
      const composerRequest = request + renderedEvidence(own(input, "evidence"));
      if (composerRequest.length > MAX_REQUEST_CHARS) throw new Error("offline_fixture_request_invalid");
      const routed = Object.freeze({});
      const composerInput = Object.freeze({
        rawUserText: composerRequest, userText: composerRequest,
        inputChannel: "text", turnId: `offline_${context.caseId}`,
        audience: "public", scope: "public", publicSurfaceOnly: true,
        operatorPersonalization: false, allowPersonalName: false, allowOperatorMemory: false,
        authenticatedOperator: false, privateAdminConversation: false,
        privateControlPlane: false, memoryPartition: "public:anonymous",
        partitionKey: "public:anonymous"
      });
      let result;
      // Do not echo composer exception text, input or stack into evaluation
      // results: this error is intentionally stable and non-secret.
      try { result = await compose(routed, composerInput); }
      catch (_) { throw new Error("offline_composer_execution_failed"); }
      const reply = finalReply(result);
      if (!reply) throw new Error("offline_composer_did_not_return_accepted_final");
      return Object.freeze({ reply, text: reply, displayReply: reply, visibleReply: reply });
    }
  });
  ownedEntries.set(entry, Object.freeze({ compose, fingerprint: bindingFingerprint(frozenBindings) }));
  return entry;
}

function registerMarionLearningOfflineComposerVersions({ versionRegistry, manifestSource, fixtureStore, composer } = {}) {
  if (!(versionRegistry instanceof Map) || versionRegistry.size > 256)
    return { ok: false, reason: "offline_version_registry_missing_or_full" };
  if (!manifestSource || typeof manifestSource.listSync !== "function" ||
      !fixtureStore || typeof fixtureStore.verifyFixtureSetSync !== "function")
    return { ok: false, reason: "offline_fixture_bootstrap_unavailable" };
  const contract = inspectOfflineComposerContract(composer);
  if (!contract.ready) return { ok: false, reason: contract.reason };
  const baselineCompose = own(composer, "composeMarionResponseBeforeR24");
  const candidateCompose = own(composer, "composeMarionResponseR24OfflineCandidate");
  const baselineVersion = own(composer, "MARION_COMPOSE_BASELINE_VERSION");
  const candidateVersion = own(composer, "MARION_COMPOSE_CURRENT_VERSION");
  let manifests;
  try { manifests = manifestSource.listSync(); }
  catch (_) { return { ok: false, reason: "offline_manifest_source_unavailable" }; }
  if (!denseArray(manifests, MAX_MANIFESTS))
    return { ok: false, reason: "offline_manifest_source_invalid" };

  const validated = [];
  const counts = new Map();
  try {
    for (const raw of manifests) {
      const checked = Dataset.validateEvaluationSet(raw);
      if (!checked || checked.ok !== true) continue;
      const dataset = checked.dataset;
      if (dataset.scope !== RESPONSE_STYLE_SCOPE) continue;
      const key = JSON.stringify([dataset.datasetId, dataset.version]);
      counts.set(key, (counts.get(key) || 0) + 1);
      validated.push({ key, dataset });
    }
  } catch (_) { return { ok: false, reason: "offline_manifest_source_invalid" }; }

  const bindings = [];
  const seen = new Set();
  for (const { key, dataset } of validated) {
    if (counts.get(key) !== 1 || seen.has(key)) continue;
    seen.add(key);
    let verified;
    try {
      verified = fixtureStore.verifyFixtureSetSync({
        datasetId: dataset.datasetId, version: dataset.version,
        fixtureStore: dataset.fixtureStore, caseIds: Object.freeze([...dataset.caseIds])
      });
    } catch (_) { continue; }
    // A thenable does not constitute a synchronous verified fixture set.
    if (!plainData(verified) || own(verified, "then") !== undefined ||
        own(verified, "ok") !== true ||
        own(verified, "syntheticOnly") !== true ||
        own(verified, "scope") !== RESPONSE_STYLE_SCOPE ||
        own(verified, "datasetId") !== dataset.datasetId ||
        own(verified, "version") !== dataset.version ||
        own(verified, "fixtureStore") !== dataset.fixtureStore ||
        own(verified, "caseCount") !== dataset.caseIds.length ||
        !HASH_RE.test(own(verified, "fixtureSetHash") || "")) continue;
    const returnedIds = own(verified, "caseIds");
    if (returnedIds !== undefined && (!denseArray(returnedIds, 500) ||
        returnedIds.length !== dataset.caseIds.length ||
        returnedIds.some((id, i) => id !== dataset.caseIds[i]))) continue;
    bindings.push(Object.freeze({ datasetId: dataset.datasetId,
      datasetVersion: dataset.version, scope: RESPONSE_STYLE_SCOPE,
      fixtureStore: dataset.fixtureStore, fixtureSetHash: own(verified, "fixtureSetHash") }));
  }
  if (!bindings.length) return { ok: false, reason: "response_style_fixture_binding_unavailable" };
  if (bindings.length > 256) return { ok: false, reason: "too_many_offline_fixture_bindings" };

  const versions = [baselineVersion, candidateVersion];
  const existing = versions.map(id => Map.prototype.get.call(versionRegistry, id));
  // Only the composer branch captured at the R24 boundary may be evaluated as R24.
  // A later public/private live wrapper is not an interchangeable candidate.
  const expectedComposers = [baselineCompose, candidateCompose];
  if (expectedComposers[0] === expectedComposers[1])
    return { ok: false, reason: "offline_composer_versions_not_distinct" };
  for (let i = 0; i < existing.length; i++) {
    const prior = existing[i];
    const identity = prior && ownedEntries.get(prior);
    if (prior !== undefined && (!identity || identity.compose !== expectedComposers[i] ||
        identity.fingerprint !== bindingFingerprint(bindings))) {
      return { ok: false, reason: "offline_version_registration_conflict" };
    }
  }
  if (existing.every(value => value !== undefined)) {
    return Object.freeze({ ok: true, version: VERSION, bindingCount: bindings.length,
      versions: 2, scope: RESPONSE_STYLE_SCOPE, alreadyRegistered: true,
      versionIds: Object.freeze([...versions]) });
  }
  if (versionRegistry.size + existing.filter(value => value === undefined).length > 256)
    return { ok: false, reason: "offline_version_registry_full" };

  const entries = [
    existing[0] || createOfflineEntry(baselineVersion, baselineCompose, bindings),
    existing[1] || createOfflineEntry(candidateVersion, candidateCompose, bindings)
  ];
  // Stage both entries, then roll back ONLY changes made here if Map.set fails.
  const changed = [];
  try {
    for (let i = 0; i < versions.length; i++) {
      if (existing[i] !== undefined) continue;
      Map.prototype.set.call(versionRegistry, versions[i], entries[i]);
      changed.push(versions[i]);
    }
  } catch (_) {
    for (const key of changed.reverse()) Map.prototype.delete.call(versionRegistry, key);
    return { ok: false, reason: "offline_version_registration_failed" };
  }
  // Assert the exact expected keys survived Map.set before publishing success.
  // This protects future registry adapters that override/set or mutate entries.
  for (let i = 0; i < versions.length; i++) {
    if (Map.prototype.get.call(versionRegistry, versions[i]) !== entries[i]) {
      for (const key of changed.reverse()) {
        if (Map.prototype.get.call(versionRegistry, key) === entries[versions.indexOf(key)])
          Map.prototype.delete.call(versionRegistry, key);
      }
      return { ok: false, reason: "offline_version_registration_unconfirmed" };
    }
  }
  return Object.freeze({ ok: true, version: VERSION, bindingCount: bindings.length,
    versions: 2, scope: RESPONSE_STYLE_SCOPE, alreadyRegistered: false,
    versionIds: Object.freeze([...versions]) });
}

function inspectRegisteredOfflineVersions(versionRegistry, composer) {
  const contract = inspectOfflineComposerContract(composer);
  if (!(versionRegistry instanceof Map) || !contract.ready)
    return Object.freeze({ ready: false, reason: !contract.ready ? contract.reason : "offline_version_registry_missing_or_full", registeredVersionCount: 0 });
  const ids = [own(composer, "MARION_COMPOSE_BASELINE_VERSION"), own(composer, "MARION_COMPOSE_CURRENT_VERSION")];
  const entries = ids.map(id => Map.prototype.get.call(versionRegistry, id));
  const composers = [own(composer, "composeMarionResponseBeforeR24"),
    own(composer, "composeMarionResponseR24OfflineCandidate")];
  // A forged registry entry with matching public metadata is not proof that
  // the original pinned composer function was registered by this module.
  const ready = entries.every((entry, i) => {
    const identity = entry && ownedEntries.get(entry);
    return !!identity && identity.compose === composers[i] &&
      entry.version === ids[i] && entry.mode === "offline" &&
      typeof entry.runOffline === "function" &&
      denseArray(entry.bindings, MAX_MANIFESTS) && entry.bindings.length > 0 &&
      identity.fingerprint === bindingFingerprint(entry.bindings);
  });
  return Object.freeze({ ready: !!ready, reason: ready ? "ready" : "offline_versions_not_registered",
    registeredVersionCount: entries.filter(Boolean).length });
}

module.exports = { VERSION, registerMarionLearningOfflineComposerVersions, inspectOfflineComposerContract, inspectRegisteredOfflineVersions };

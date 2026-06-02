"use strict";

/**
 * AsterObservationEnvelope.js
 *
 * Runtime role:
 * - Build a stable Aster observation envelope.
 * - Carry raw/normalized/context/risk metadata safely.
 * - Keep Aster observational only.
 * - Never authorize public final answers.
 *
 * Architecture:
 * AsterSensorNormalizer -> AsterContextClassifier -> AsterRiskTagger -> AsterObservationEnvelope -> Marion final authority
 */

const fs = require("fs");
const path = require("path");

const VERSION = "0.1.0";
const ASTER_OBSERVATION_SCHEMA = "nyx.marion.aster.observation/1.0";

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function safeString(value, fallback = "") {
  if (value === null || value === undefined) return fallback;
  return String(value).replace(/\s+/g, " ").trim() || fallback;
}

function nowIso() {
  return new Date().toISOString();
}

function loadAsterConfig() {
  const candidates = [
    path.join(__dirname, "asterConfig.json"),
    path.join(process.cwd(), "Data", "marion", "runtime", "aster", "asterConfig.json"),
    path.join(process.cwd(), "Data", "marion", "runtime", "asterConfig.json")
  ];

  for (const candidate of candidates) {
    try {
      if (!fs.existsSync(candidate)) continue;
      const raw = fs.readFileSync(candidate, "utf8");
      if (!raw.trim()) continue;
      return JSON.parse(raw);
    } catch (_) {
      return {};
    }
  }

  return {};
}

function cloneJson(value) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (_) {
    return {};
  }
}

function extractObservation(input = {}) {
  if (!isPlainObject(input)) return {};

  if (isPlainObject(input.observation)) return cloneJson(input.observation);

  return {
    sensorType: input.sensorType || "unknown",
    raw: isPlainObject(input.raw) ? cloneJson(input.raw) : undefined,
    readings: isPlainObject(input.readings) ? cloneJson(input.readings) : undefined,
    normalized: isPlainObject(input.normalized) ? cloneJson(input.normalized) : undefined,
    context: input.context || undefined,
    risk: isPlainObject(input.risk) ? cloneJson(input.risk) : undefined
  };
}

function normalizeGatewayMetadata(input = {}, config = {}) {
  const configLinkage =
    isPlainObject(config.observationEnvelope) &&
    isPlainObject(config.observationEnvelope.gatewayLinkage)
      ? config.observationEnvelope.gatewayLinkage
      : {};

  const metadata = isPlainObject(input.metadata) ? input.metadata : {};

  return {
    gateway: safeString(metadata.gateway || configLinkage.gateway || "Aster"),
    linkedGateway: safeString(metadata.linkedGateway || configLinkage.linkedGateway || "LingoLink"),
    project: safeString(metadata.project || configLinkage.project || "Sandblast"),
    state: safeString(configLinkage.state || metadata.state || "staged-environmental-pathway")
  };
}

function buildEnvelopePayload(input = {}, options = {}) {
  const config = loadAsterConfig();

  const observation = extractObservation(input);
  const gatewayMetadata = normalizeGatewayMetadata(input, config);

  const source = safeString(
    input.source ||
      observation.source ||
      options.source ||
      "aster-observation-envelope"
  );

  const sensorType = safeString(
    observation.sensorType ||
      input.sensorType ||
      options.sensorType ||
      "unknown"
  );

  const context = safeString(
    observation.context ||
      input.context ||
      (isPlainObject(input.classification) ? input.classification.context : "") ||
      "environment.unknown"
  );

  const risk =
    isPlainObject(observation.risk)
      ? cloneJson(observation.risk)
      : isPlainObject(input.risk)
        ? cloneJson(input.risk)
        : {};

  const normalized =
    isPlainObject(observation.normalized)
      ? cloneJson(observation.normalized)
      : isPlainObject(input.normalized)
        ? cloneJson(input.normalized)
        : {};

  const raw =
    isPlainObject(observation.raw)
      ? cloneJson(observation.raw)
      : isPlainObject(input.raw)
        ? cloneJson(input.raw)
        : isPlainObject(input.readings)
          ? cloneJson(input.readings)
          : {};

  const warnings = [];

  if (sensorType === "unknown") warnings.push("unknown-sensor-type");
  if (!Object.keys(normalized).length && !Object.keys(raw).length) {
    warnings.push("no-observation-readings");
  }

  const envelope = {
    schema: ASTER_OBSERVATION_SCHEMA,
    version: VERSION,
    gateway: "Aster",
    role: "environmental-observation-envelope",
    observational: true,
    source,
    sensorType,
    raw,
    normalized,
    context,
    risk,
    gatewayMetadata,
    linkedGateways: [
      gatewayMetadata.linkedGateway,
      "LanguageSphere"
    ].filter(Boolean),
    authority: {
      finalAnswerAuthorized: false,
      marionAuthorityRequired: true,
      publicAgent: "nyx",
      displayAuthority: "nyx",
      observationOnly: true
    },
    warnings,
    createdAt: nowIso()
  };

  return {
    ok: true,
    version: VERSION,
    schema: ASTER_OBSERVATION_SCHEMA,
    gateway: "Aster",
    aster: {
      gateway: "Aster",
      module: "AsterObservationEnvelope",
      observational: true
    },
    envelope,
    observation: envelope,
    context,
    risk,
    sensorType,
    source,
    warnings,
    gatewayMetadata,

    finalAnswerAuthorized: false,
    marionAuthorityRequired: true,
    publicAgent: "nyx",
    displayAuthority: "nyx",
    updatedAt: Date.now()
  };
}

function createAsterObservationEnvelope(input = {}, options = {}) {
  try {
    return buildEnvelopePayload(isPlainObject(input) ? input : {}, options);
  } catch (error) {
    return {
      ok: false,
      version: VERSION,
      schema: ASTER_OBSERVATION_SCHEMA,
      gateway: "Aster",
      aster: {
        gateway: "Aster",
        module: "AsterObservationEnvelope",
        observational: true
      },
      envelope: {
        schema: ASTER_OBSERVATION_SCHEMA,
        version: VERSION,
        gateway: "Aster",
        role: "environmental-observation-envelope",
        observational: true,
        source: "aster-observation-envelope",
        sensorType: "unknown",
        raw: {},
        normalized: {},
        context: "environment.unknown",
        risk: {
          level: "unknown",
          tags: ["risk", "unknown", "fallback"]
        },
        gatewayMetadata: {
          gateway: "Aster",
          linkedGateway: "LingoLink",
          project: "Sandblast",
          state: "staged-environmental-pathway"
        },
        authority: {
          finalAnswerAuthorized: false,
          marionAuthorityRequired: true,
          publicAgent: "nyx",
          displayAuthority: "nyx",
          observationOnly: true
        },
        warnings: ["observation-envelope-failed"],
        error: error && error.message ? error.message : "unknown-error",
        createdAt: nowIso()
      },
      observation: {
        context: "environment.unknown"
      },
      context: "environment.unknown",
      risk: {
        level: "unknown",
        tags: ["risk", "unknown", "fallback"]
      },
      warnings: ["observation-envelope-failed"],
      finalAnswerAuthorized: false,
      marionAuthorityRequired: true,
      publicAgent: "nyx",
      displayAuthority: "nyx",
      updatedAt: Date.now()
    };
  }
}

function buildAsterObservationEnvelope(input = {}, options = {}) {
  return createAsterObservationEnvelope(input, options);
}

function createObservationEnvelope(input = {}, options = {}) {
  return createAsterObservationEnvelope(input, options);
}

function buildObservationEnvelope(input = {}, options = {}) {
  return createAsterObservationEnvelope(input, options);
}

function envelopeObservation(input = {}, options = {}) {
  return createAsterObservationEnvelope(input, options);
}

function run(input = {}, options = {}) {
  return createAsterObservationEnvelope(input, options);
}

module.exports = {
  VERSION,
  ASTER_OBSERVATION_SCHEMA,
  createAsterObservationEnvelope,
  buildAsterObservationEnvelope,
  createObservationEnvelope,
  buildObservationEnvelope,
  envelopeObservation,
  run,
  default: createAsterObservationEnvelope,

  _internal: {
    loadAsterConfig,
    extractObservation,
    normalizeGatewayMetadata,
    buildEnvelopePayload
  }
};

"use strict";

const VERSION = "marion.learningFixtureContract/1.2-text-rubric-scoring";
const ID_RE = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,119}$/;
const ALLOWED_SCOPES = new Set(["retrieval", "routing", "response_style"]);
const STYLE_TAGS = new Set([
  "accessible", "focused_clarification", "concise", "style_continuity",
  "calibrated_detail", "requested_structure", "professional_tone",
  "plain_language", "direct_correction", "uncertainty_explicit"
]);
const CATEGORY_STYLE_TAG = Object.freeze({
  accessibility: "accessible",
  clarifying_response: "focused_clarification",
  conciseness: "concise",
  continuity_style: "style_continuity",
  detail_calibration: "calibrated_detail",
  structure: "requested_structure",
  tone_register: "professional_tone",
  plain_language: "plain_language",
  repair_and_correction: "direct_correction",
  uncertainty: "uncertainty_explicit"
});
const CHECK_TYPES = new Set([
  "sentence_count_max", "sentence_words_max", "max_words", "contains_all",
  "contains_any", "phrase_absent", "phrase_present_any", "heading_present",
  "bullet_count_exact", "question_count_exact", "definition_of_term",
  "uncertainty_present", "correction_present"
]);

function plainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  return Reflect.ownKeys(descriptors).every(key => typeof key === "string" &&
    descriptors[key].enumerable === true && Object.prototype.hasOwnProperty.call(descriptors[key], "value"));
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function validPhrases(value) {
  return Array.isArray(value) && value.length > 0 && value.length <= 20 &&
    value.every(item => typeof item === "string" && item.trim() && item.length <= 120);
}

function validCheck(check) {
  if (!plainObject(check) || !CHECK_TYPES.has(check.type) ||
      (check.critical !== undefined && typeof check.critical !== "boolean")) return false;
  switch (check.type) {
    case "sentence_count_max":
    case "sentence_words_max":
    case "max_words":
    case "bullet_count_exact":
    case "question_count_exact":
      return Number.isInteger(check.value) && check.value >= 0 && check.value <= 500;
    case "contains_all":
    case "contains_any":
    case "phrase_absent":
    case "phrase_present_any":
    case "uncertainty_present":
      return validPhrases(check.values);
    case "heading_present":
      return true;
    case "definition_of_term":
      return typeof check.term === "string" && check.term.trim().length > 0 && check.term.length <= 100;
    case "correction_present":
      return typeof check.value === "string" && check.value.trim().length > 0 && check.value.length <= 120 && validPhrases(check.cues);
    default:
      return false;
  }
}

function validateFixture(fixture) {
  if (!plainObject(fixture) || fixture.synthetic !== true || !ALLOWED_SCOPES.has(fixture.scope) ||
      !ID_RE.test(fixture.caseId || "") || !ID_RE.test(fixture.datasetId || "") ||
      !ID_RE.test(fixture.datasetVersion || "") || !ID_RE.test(fixture.fixtureStore || "") ||
      !/^[a-f0-9]{64}$/.test(fixture.fixtureSetHash || "") ||
      !plainObject(fixture.input) || typeof fixture.input.request !== "string" ||
      !fixture.input.request.trim() || fixture.input.request.length > 8000 ||
      !plainObject(fixture.reference) || !plainObject(fixture.reference.expected) ||
      Object.keys(fixture.reference.expected).length === 0 ||
      typeof fixture.reference.criterion !== "string" || !fixture.reference.criterion.trim()) {
    return { ok: false, reason: "fixture_contract_invalid" };
  }
  if (fixture.scope === "response_style") {
    const expected = fixture.reference.expected;
    const rubric = fixture.reference.rubric;
    if (Object.keys(expected).length !== 1 || !Array.isArray(expected.styleChecks) ||
        expected.styleChecks.length !== 1 || !STYLE_TAGS.has(expected.styleChecks[0]) ||
        !plainObject(rubric) || rubric.version !== "1.0" || !Array.isArray(rubric.checks) ||
        rubric.checks.length === 0 || rubric.checks.length > 12 || !rubric.checks.every(validCheck) ||
        fixture.reference.caseCategory !== fixture.category ||
        CATEGORY_STYLE_TAG[fixture.category] !== expected.styleChecks[0] ||
        !plainObject(fixture.input.evidence) || Object.keys(fixture.input.evidence).length === 0 ||
        Object.values(fixture.input.evidence).some(value =>
          (typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean") ||
          (typeof value === "string" && !value.trim()) || (typeof value === "number" && !Number.isFinite(value))) ||
        Object.prototype.hasOwnProperty.call(expected, "unsupportedClaims")) {
      return { ok: false, reason: "response_style_rubric_invalid" };
    }
  }
  return { ok: true };
}

function normalizeText(value) {
  return value.normalize("NFKC").toLocaleLowerCase("en-US").replace(/\s+/g, " ").trim();
}

function words(value) {
  return value.match(/[\p{L}\p{N}]+(?:[’'-][\p{L}\p{N}]+)*/gu) || [];
}

function sentenceList(value) {
  return value.split(/(?:[.!?]+(?:["'’”)]*)\s+|\n+)/u).map(item => item.trim()).filter(Boolean);
}

function containsAny(text, values) {
  const normalized = normalizeText(text);
  return values.some(value => normalized.includes(normalizeText(value)));
}

function checkPasses(check, reply) {
  const normalized = normalizeText(reply);
  const sentences = sentenceList(reply);
  switch (check.type) {
    case "sentence_count_max":
      return sentences.length > 0 && sentences.length <= check.value;
    case "sentence_words_max":
      return sentences.length > 0 && sentences.every(sentence => words(sentence).length <= check.value);
    case "max_words":
      return words(reply).length <= check.value;
    case "contains_all":
      return check.values.every(value => normalized.includes(normalizeText(value)));
    case "contains_any":
    case "phrase_present_any":
    case "uncertainty_present":
      return containsAny(reply, check.values);
    case "phrase_absent":
      return !containsAny(reply, check.values);
    case "heading_present": {
      const firstLine = reply.split(/\r?\n/).map(line => line.trim()).find(Boolean) || "";
      return /^#{1,3}\s+\S/.test(firstLine);
    }
    case "bullet_count_exact": {
      const count = reply.split(/\r?\n/).filter(line => /^\s*[-*+]\s+\S/.test(line)).length;
      return count === check.value;
    }
    case "question_count_exact":
      return (reply.match(/\?/g) || []).length === check.value;
    case "definition_of_term":
      return normalized.includes(normalizeText(check.term)) &&
        /\b(?:is|means|refers to|describes|lets you|allows you to)\b/i.test(reply);
    case "correction_present":
      return normalized.includes(normalizeText(check.value)) && containsAny(reply, check.cues);
    default:
      return false;
  }
}

function extractReply(output) {
  if (typeof output === "string") return output.trim();
  if (!plainObject(output)) return "";
  for (const key of ["reply", "text", "displayReply", "visibleReply", "directReply", "finalReply", "authoritativeReply"]) {
    if (typeof output[key] === "string" && output[key].trim()) return output[key].trim();
  }
  return "";
}

function scoreFixture(fixture, output) {
  if (!validateFixture(fixture).ok) throw new TypeError("fixture_reference_contract_invalid");
  if (fixture.scope !== "response_style") {
    if (!plainObject(output)) throw new TypeError("fixture_or_output_contract_invalid");
    const expected = fixture.reference.expected;
    const keys = Object.keys(expected);
    let matched = 0;
    for (const key of keys) if (stableJson(output[key]) === stableJson(expected[key])) matched++;
    const score = matched / keys.length;
    return Object.freeze({ score, criticalFailure: score < 1 });
  }
  const reply = extractReply(output);
  if (!reply || reply.length > 16000) throw new TypeError("response_style_reply_required");
  const checks = fixture.reference.rubric.checks;
  let passed = 0;
  let criticalFailure = false;
  for (const check of checks) {
    const success = checkPasses(check, reply);
    if (success) passed++;
    if (!success && check.critical !== false) criticalFailure = true;
  }
  return Object.freeze({ score: passed / checks.length, criticalFailure, passedChecks: passed, totalChecks: checks.length });
}

module.exports = { VERSION, validateFixture, scoreFixture };

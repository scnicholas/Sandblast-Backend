"use strict";

// Offline synthetic fixtures only. No raw conversations, learning activation,
// network actions, or disk persistence are performed by this contract.
const VERSION = "marion.learningFixtureContract/1.4-phase20-22-strict-scoring";
const ID_RE = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,119}$/;
const HASH_RE = /^[a-f0-9]{64}$/;
const ALLOWED_SCOPES = new Set(["retrieval", "routing", "response_style"]);
const STYLE_TAGS = new Set([
  "accessible", "focused_clarification", "concise", "style_continuity",
  "calibrated_detail", "requested_structure", "professional_tone",
  "plain_language", "direct_correction", "uncertainty_explicit"
]);
const CATEGORY_STYLE_TAG = Object.freeze({
  accessibility: "accessible", clarifying_response: "focused_clarification",
  conciseness: "concise", continuity_style: "style_continuity",
  detail_calibration: "calibrated_detail", structure: "requested_structure",
  tone_register: "professional_tone", plain_language: "plain_language",
  repair_and_correction: "direct_correction", uncertainty: "uncertainty_explicit"
});
const CHECK_TYPES = new Set([
  "sentence_count_max", "sentence_words_max", "max_words", "contains_all",
  "contains_any", "phrase_absent", "phrase_present_any", "heading_present",
  "bullet_count_exact", "question_count_exact", "definition_of_term",
  "uncertainty_present", "correction_present"
]);
const CHECK_BASE = ["type", "critical"];
const MAX_REPLY_CHARS = 16000;
const MAX_DATA_NODES = 10000;
const MAX_DATA_DEPTH = 16;
const MAX_DATA_BYTES = 128 * 1024;

function plainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  return Reflect.ownKeys(descriptors).every(key => typeof key === "string" &&
    descriptors[key].enumerable === true && Object.prototype.hasOwnProperty.call(descriptors[key], "value"));
}
function denseArray(value, max = 500) {
  if (!Array.isArray(value) || value.length > max) return false;
  if (Reflect.ownKeys(value).length !== value.length + 1) return false;
  for (let i = 0; i < value.length; i++) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(i));
    if (!descriptor || !descriptor.enumerable || !Object.prototype.hasOwnProperty.call(descriptor, "value")) return false;
  }
  return true;
}
function validJsonData(value, state = { count: 0, ancestors: new WeakSet() }, depth = 0) {
  if (++state.count > MAX_DATA_NODES || depth > MAX_DATA_DEPTH) return false;
  if (value === null || typeof value === "boolean" || typeof value === "string") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value !== "object" || state.ancestors.has(value)) return false;
  if (Array.isArray(value)) {
    if (!denseArray(value, MAX_DATA_NODES)) return false;
    state.ancestors.add(value);
    const ok = value.every(item => validJsonData(item, state, depth + 1));
    state.ancestors.delete(value);
    return ok;
  }
  if (!plainObject(value)) return false;
  state.ancestors.add(value);
  const ok = Object.keys(value).every(key => key !== "__proto__" && key !== "constructor" && key !== "prototype" &&
    validJsonData(value[key], state, depth + 1));
  state.ancestors.delete(value);
  return ok;
}
function exactKeys(value, required, optional = []) {
  if (!plainObject(value)) return false;
  const keys = Object.keys(value);
  return required.every(key => Object.prototype.hasOwnProperty.call(value, key)) &&
    keys.every(key => required.includes(key) || optional.includes(key));
}
function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
function validPhrases(value) {
  return denseArray(value, 20) && value.length > 0 &&
    value.every(item => typeof item === "string" && item.trim().length > 0 && item.length <= 120);
}
function validCheck(check) {
  if (!plainObject(check) || !CHECK_TYPES.has(check.type) ||
      (check.critical !== undefined && typeof check.critical !== "boolean")) return false;
  switch (check.type) {
    case "sentence_count_max": case "sentence_words_max": case "max_words":
    case "bullet_count_exact": case "question_count_exact":
      return exactKeys(check, ["type", "value"], ["critical"]) && Number.isSafeInteger(check.value) && check.value >= 0 && check.value <= 500;
    case "contains_all": case "contains_any": case "phrase_absent":
    case "phrase_present_any": case "uncertainty_present":
      return exactKeys(check, ["type", "values"], ["critical"]) && validPhrases(check.values);
    case "heading_present":
      return exactKeys(check, ["type"], ["critical"]);
    case "definition_of_term":
      return exactKeys(check, ["type", "term"], ["critical"]) && typeof check.term === "string" && check.term.trim().length > 0 && check.term.length <= 100;
    case "correction_present":
      return exactKeys(check, ["type", "value", "cues"], ["critical"]) && typeof check.value === "string" && check.value.trim().length > 0 && check.value.length <= 120 && validPhrases(check.cues);
    default: return false;
  }
}
function validEvidence(value) {
  if (!plainObject(value)) return false;
  const entries = Object.entries(value);
  return entries.length >= 1 && entries.length <= 20 && entries.every(([key, item]) =>
    key.length > 0 && key.length <= 80 && key.trim() === key && !/[\u0000-\u001f\u007f]/.test(key) &&
    ((typeof item === "string" && item.trim().length > 0 && item.length <= 1000) ||
    typeof item === "boolean" || (typeof item === "number" && Number.isFinite(item))));
}
function validateFixture(fixture) {
  try {
    if (!plainObject(fixture) || !validJsonData(fixture) ||
        Buffer.byteLength(JSON.stringify(fixture), "utf8") > MAX_DATA_BYTES ||
        fixture.synthetic !== true || !ALLOWED_SCOPES.has(fixture.scope) ||
        !ID_RE.test(fixture.caseId || "") || !ID_RE.test(fixture.datasetId || "") ||
        !ID_RE.test(fixture.datasetVersion || "") || !ID_RE.test(fixture.fixtureStore || "") ||
        !HASH_RE.test(fixture.fixtureSetHash || "") || !plainObject(fixture.input) ||
        typeof fixture.input.request !== "string" || !fixture.input.request.trim() ||
        fixture.input.request.length > 8000 || !plainObject(fixture.reference) ||
        !plainObject(fixture.reference.expected) ||
        Object.keys(fixture.reference.expected).length === 0 ||
        typeof fixture.reference.criterion !== "string" || !fixture.reference.criterion.trim()) {
      return { ok: false, reason: "fixture_contract_invalid" };
    }
    if (fixture.scope === "response_style") {
      const expected = fixture.reference.expected;
      const rubric = fixture.reference.rubric;
      if (!exactKeys(fixture.input, ["request", "evidence"]) ||
          !exactKeys(expected, ["styleChecks"]) ||
          !denseArray(expected.styleChecks, 1) || expected.styleChecks.length !== 1 ||
          !STYLE_TAGS.has(expected.styleChecks[0]) ||
          !exactKeys(rubric, ["version", "checks"]) || rubric.version !== "1.0" ||
          !denseArray(rubric.checks, 12) || rubric.checks.length === 0 ||
          !rubric.checks.every(validCheck) || fixture.reference.caseCategory !== fixture.category ||
          !Object.prototype.hasOwnProperty.call(CATEGORY_STYLE_TAG, fixture.category) ||
          CATEGORY_STYLE_TAG[fixture.category] !== expected.styleChecks[0] ||
          !validEvidence(fixture.input.evidence)) {
        return { ok: false, reason: "response_style_rubric_invalid" };
      }
    }
    return { ok: true };
  } catch (_) {
    return { ok: false, reason: "fixture_contract_invalid" };
  }
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
    case "sentence_count_max": return sentences.length > 0 && sentences.length <= check.value;
    case "sentence_words_max": return sentences.length > 0 && sentences.every(sentence => words(sentence).length <= check.value);
    case "max_words": return words(reply).length <= check.value;
    case "contains_all": return check.values.every(value => normalized.includes(normalizeText(value)));
    case "contains_any": case "phrase_present_any": case "uncertainty_present": return containsAny(reply, check.values);
    case "phrase_absent": return !containsAny(reply, check.values);
    case "heading_present": {
      const firstLine = reply.split(/\r?\n/).map(line => line.trim()).find(Boolean) || "";
      return /^#{1,3}\s+\S/.test(firstLine);
    }
    case "bullet_count_exact": return reply.split(/\r?\n/).filter(line => /^\s*[-*+]\s+\S/.test(line)).length === check.value;
    case "question_count_exact": return (reply.match(/\?/g) || []).length === check.value;
    case "definition_of_term": return normalized.includes(normalizeText(check.term)) && /\b(?:is|means|refers to|describes|lets you|allows you to)\b/i.test(reply);
    case "correction_present": return normalized.includes(normalizeText(check.value)) && containsAny(reply, check.cues);
    default: return false;
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
    if (!plainObject(output) || !validJsonData(output) ||
        Buffer.byteLength(JSON.stringify(output), "utf8") > MAX_DATA_BYTES) throw new TypeError("fixture_or_output_contract_invalid");
    const expected = fixture.reference.expected;
    const keys = Object.keys(expected);
    const failedChecks = [];
    let matched = 0;
    for (let index = 0; index < keys.length; index++) {
      const key = keys[index];
      if (Object.prototype.hasOwnProperty.call(output, key) && stableJson(output[key]) === stableJson(expected[key])) matched++;
      else failedChecks.push(Object.freeze({ index, type: "exact_match", critical: true }));
    }
    return Object.freeze({ score: matched / keys.length, criticalFailure: matched !== keys.length, failedChecks: Object.freeze(failedChecks) });
  }
  const reply = extractReply(output);
  if (!reply || reply.length > MAX_REPLY_CHARS) throw new TypeError("response_style_reply_required");
  const checks = fixture.reference.rubric.checks;
  let passed = 0;
  let criticalFailure = false;
  const failedChecks = [];
  for (let index = 0; index < checks.length; index++) {
    const check = checks[index];
    const success = checkPasses(check, reply);
    if (success) passed++;
    else {
      const critical = check.critical !== false;
      failedChecks.push(Object.freeze({ index, type: check.type, critical }));
      if (critical) criticalFailure = true;
    }
  }
  return Object.freeze({
    score: passed / checks.length, criticalFailure,
    passedChecks: passed, totalChecks: checks.length,
    failedChecks: Object.freeze(failedChecks)
  });
}
module.exports = { VERSION, validateFixture, scoreFixture };

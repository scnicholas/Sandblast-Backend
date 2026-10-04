"use strict";

const VERSION = "marion.learningFixtureContract/1.1-nonempty-reference-contract";
const ID_RE = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,119}$/;
const ALLOWED_SCOPES = new Set(["retrieval", "routing", "response_style"]);
function plainObject(value) { return !!value && typeof value === "object" && !Array.isArray(value) && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null); }
function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${stableJson(value[k])}`).join(",")}}`;
  return JSON.stringify(value);
}
function validateFixture(fixture) {
  if (!plainObject(fixture) || fixture.synthetic !== true || !ALLOWED_SCOPES.has(fixture.scope) ||
      !ID_RE.test(fixture.caseId || "") || !ID_RE.test(fixture.datasetId || "") ||
      !ID_RE.test(fixture.datasetVersion || "") || !ID_RE.test(fixture.fixtureStore || "") ||
      !/^[a-f0-9]{64}$/.test(fixture.fixtureSetHash || "") ||
      !plainObject(fixture.input) || typeof fixture.input.request !== "string" || !fixture.input.request.trim() ||
      !plainObject(fixture.reference) || !plainObject(fixture.reference.expected) ||
      Object.keys(fixture.reference.expected).length === 0 ||
      typeof fixture.reference.criterion !== "string" || !fixture.reference.criterion.trim()) {
    return { ok: false, reason: "fixture_contract_invalid" };
  }
  return { ok: true };
}
function scoreFixture(fixture, output) {
  if (!validateFixture(fixture).ok || !plainObject(output)) throw new TypeError("fixture_or_output_contract_invalid");
  const expected = fixture.reference.expected;
  const keys = Object.keys(expected);
  if (!keys.length) throw new TypeError("fixture_expected_fields_required");
  let matched = 0;
  for (const key of keys) if (stableJson(output[key]) === stableJson(expected[key])) matched++;
  const score = matched / keys.length;
  return Object.freeze({ score, criticalFailure: score < 1 });
}
module.exports = { VERSION, validateFixture, scoreFixture };

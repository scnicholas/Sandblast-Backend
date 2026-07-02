"use strict";

const assert = require("assert");
const { FinanceQueryShapeNormalizer } = require("../../../Data/marion/runtime/finance/layer01_intent/FinanceQueryShapeNormalizer");

const normalizer = new FinanceQueryShapeNormalizer();
const result = normalizer.normalize("Can we survive if ad revenue drops 30% for three months in Ontario with CAD 50,000 cash?");

assert.strictEqual(result.shape.asksForRisk, true);
assert.strictEqual(result.shape.containsPercentages, true);
assert.strictEqual(result.shape.containsCurrency, true);
assert.strictEqual(result.shape.containsTimeMarkers, true);
assert.ok(result.numericSignals.percentages.includes("30%"));
assert.ok(result.numericSignals.currencyAmounts.includes("CAD 50,000"));
assert.ok(result.timeSignals.durationMarkers.includes("three months"));
assert.strictEqual(result.financeSignals.survivalOrRevenueShock, true);

console.log("PASS: query-shape-normalizer-targeted-harness.js");

"use strict";

/**
 * R18D Layer 07 — Finance Source Requirement Mapper
 * Maps Layer 05/06 evidence requirements to execution result categories.
 *
 * No external dependencies.
 */

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeText(value) {
  return String(value || "").toLowerCase().replace(/[_\-]+/g, " ").replace(/\s+/g, " ").trim();
}

function stableSlug(value) {
  const slug = normalizeText(value).replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return slug || "unknown";
}

function uniqueArray(values = []) {
  return Array.from(new Set(values.filter(Boolean)));
}

class FinanceSourceRequirementMapper {
  map(input = {}) {
    const evidenceRequirements = safeArray(input.evidenceRequirements);
    const sourceRequirementMap = evidenceRequirements.map((requirement) => {
      return this.mapRequirement(requirement, input);
    });

    const inferredRows = this.inferMissingRequirementRows(input);
    const combined = this.dedupe([...sourceRequirementMap, ...inferredRows]);

    return {
      sourceRequirementMap: combined,
      diagnostics: {
        ok: true,
        warnings: combined.length === 0 ? ["no_source_requirements_mapped"] : [],
        errors: [],
        requirementCount: evidenceRequirements.length,
        mappedCount: combined.length
      }
    };
  }

  mapRequirement(requirement = {}, input = {}) {
    const code = requirement.requirementCode || requirement.code || "unknown_requirement";
    const normalizedCode = normalizeText(code);

    const appliesToResultTypes = [];
    const appliesToResultNames = [];
    const rationale = [];

    if (
      normalizedCode.includes("financial statement") ||
      normalizedCode.includes("statement line") ||
      normalizedCode.includes("official filing") ||
      normalizedCode.includes("official financial")
    ) {
      appliesToResultTypes.push("ratio", "direct_ratio", "trend", "peer_comparison");
      rationale.push("financial_statement_results_require_statement_evidence");
    }

    if (
      normalizedCode.includes("market price") ||
      normalizedCode.includes("valuation") ||
      normalizedCode.includes("eps") ||
      normalizedCode.includes("pe ratio")
    ) {
      appliesToResultTypes.push("valuation", "direct_ratio");
      appliesToResultNames.push("price_earnings_ratio", "valuation_pe_ratio");
      rationale.push("valuation_results_require_market_or_eps_evidence");
    }

    if (
      normalizedCode.includes("scenario") ||
      normalizedCode.includes("assumption") ||
      normalizedCode.includes("operating assumption") ||
      normalizedCode.includes("management estimate")
    ) {
      appliesToResultTypes.push("scenario");
      rationale.push("scenario_results_require_assumption_disclosure");
    }

    if (
      normalizedCode.includes("current") ||
      normalizedCode.includes("fresh") ||
      normalizedCode.includes("still open")
    ) {
      appliesToResultTypes.push("valuation", "scenario", "ratio", "trend", "peer_comparison");
      rationale.push("current_query_requires_current_source_check");
    }

    if (normalizedCode.includes("verify metric")) {
      appliesToResultTypes.push("ratio", "trend", "peer_comparison", "scenario", "valuation");
      rationale.push("metric_verification_requirement");
    }

    if (normalizedCode.includes("verify source") || normalizedCode.includes("classify source")) {
      appliesToResultTypes.push("ratio", "trend", "peer_comparison", "scenario", "valuation", "direct_ratio");
      rationale.push("source_verification_requirement");
    }

    if (appliesToResultTypes.length === 0) {
      appliesToResultTypes.push("ratio", "trend", "peer_comparison", "scenario", "valuation", "direct_ratio");
      rationale.push("generic_finance_evidence_requirement");
    }

    return {
      requirementMapId: `fin_source_req_map_${stableSlug(code)}`,
      requirementCode: code,
      priority: requirement.priority || "recommended",
      reason: requirement.reason || "",
      acceptableSources: safeArray(requirement.acceptableSources),
      blockingWithoutEvidence: Boolean(requirement.blockingWithoutEvidence),
      status: requirement.status || "required_for_downstream_claim",
      appliesToResultTypes: uniqueArray(appliesToResultTypes),
      appliesToResultNames: uniqueArray(appliesToResultNames),
      appliesToResultIds: [],
      rationale: uniqueArray(rationale)
    };
  }

  inferMissingRequirementRows(input = {}) {
    const rows = [];

    const scenarioOutputs = safeArray(input.scenarioResults && input.scenarioResults.scenarioOutputs);
    if (scenarioOutputs.length > 0 && !this.hasRequirement(input.evidenceRequirements, "scenario")) {
      rows.push({
        requirementMapId: "fin_source_req_map_inferred_scenario_assumption_disclosure",
        requirementCode: "inferred_scenario_assumption_disclosure",
        priority: "recommended",
        reason: "Scenario outputs should disclose assumptions even when no explicit evidence requirement was supplied.",
        acceptableSources: ["user supplied assumptions", "management estimate", "scenario label"],
        blockingWithoutEvidence: false,
        status: "inferred_for_downstream_claim",
        appliesToResultTypes: ["scenario"],
        appliesToResultNames: [],
        appliesToResultIds: [],
        rationale: ["inferred_scenario_assumption_requirement"]
      });
    }

    const valuationChecks = safeArray(input.valuationResults && input.valuationResults.valuationChecks);
    if (valuationChecks.length > 0 && !this.hasRequirement(input.evidenceRequirements, "market")) {
      rows.push({
        requirementMapId: "fin_source_req_map_inferred_valuation_market_context",
        requirementCode: "inferred_valuation_market_context",
        priority: "recommended",
        reason: "Valuation outputs should be tied to market data or dated valuation evidence.",
        acceptableSources: ["market data provider", "exchange data", "issuer filing"],
        blockingWithoutEvidence: false,
        status: "inferred_for_downstream_claim",
        appliesToResultTypes: ["valuation", "direct_ratio"],
        appliesToResultNames: ["price_earnings_ratio"],
        appliesToResultIds: [],
        rationale: ["inferred_valuation_evidence_requirement"]
      });
    }

    return rows;
  }

  hasRequirement(requirements = [], needle = "") {
    const target = normalizeText(needle);

    return safeArray(requirements).some((requirement) => {
      return normalizeText(requirement.requirementCode || requirement.code).includes(target);
    });
  }

  dedupe(items = []) {
    const seen = new Set();
    const output = [];

    safeArray(items).forEach((item) => {
      const key = item.requirementCode;
      if (seen.has(key)) return;
      seen.add(key);
      output.push(item);
    });

    return output;
  }

  mapRequirements(input = {}) { return this.map(input); }
  process(input = {}) { return this.map(input); }
  execute(input = {}) { return this.map(input); }
  run(input = {}) { return this.map(input); }

  static map(input = {}, options = {}) {
    return new FinanceSourceRequirementMapper(options).map(input);
  }
}

module.exports = {
  FinanceSourceRequirementMapper
};

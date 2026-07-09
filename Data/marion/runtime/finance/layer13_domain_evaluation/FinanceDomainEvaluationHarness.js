"use strict";

/**
 * R18D Layer 13 — Finance Domain Evaluation Harness
 * Runs validation scenarios against the Layer 12 Marion/Nyx finance adapter.
 *
 * Boundary:
 * - Does not calculate finance metrics.
 * - Does not change routing logic.
 * - Does not rewrite Layer 12 responses.
 * - Does not fetch live finance data.
 * - Does not hide failures.
 *
 * No external dependencies.
 */

const { FinanceEvaluationScenarioCatalog } = require("./FinanceEvaluationScenarioCatalog");
const { FinanceEvaluationScenarioRunner } = require("./FinanceEvaluationScenarioRunner");
const { FinanceDomainBehaviorScorer } = require("./FinanceDomainBehaviorScorer");
const { FinanceRegressionAuditReporter } = require("./FinanceRegressionAuditReporter");
const { FinanceDomainEvaluationEnvelope } = require("./FinanceDomainEvaluationEnvelope");

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function firstValue(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== "");
}

class FinanceDomainEvaluationHarness {
  constructor(options = {}) {
    this.catalog =
      options.catalog || new FinanceEvaluationScenarioCatalog(options);

    this.runner =
      options.runner || new FinanceEvaluationScenarioRunner(options);

    this.scorer =
      options.scorer || new FinanceDomainBehaviorScorer(options);

    this.reporter =
      options.reporter || new FinanceRegressionAuditReporter(options);
  }

  evaluate(input = {}) {
    const normalizedInput = this.normalizeInput(input);
    const startedAt = Date.now();

    const scenarios = this.resolveScenarios(input);
    const scenarioResults = scenarios.map((scenario) => {
      const execution = this.runner.runScenario({
        scenario,
        requestId: normalizedInput.requestId,
        traceId: normalizedInput.traceId,
        evaluationContext: normalizedInput.evaluationContext
      });

      const score = this.scorer.score({
        scenario,
        execution,
        adapterEnvelope: execution.adapterEnvelope,
        thrownError: execution.thrownError
      });

      return {
        scenarioId: scenario.scenarioId,
        category: scenario.category,
        title: scenario.title || scenario.scenarioId,
        severity: scenario.severity || "standard",
        execution,
        score,
        passed:
          score.status === "pass_strong" ||
          score.status === "pass_with_warnings",
        failed:
          score.status === "fail",
        warning:
          score.status === "pass_with_warnings" ||
          score.status === "partial"
      };
    });

    const regressionAudit = this.reporter.report({
      requestId: normalizedInput.requestId,
      traceId: normalizedInput.traceId,
      scenarioResults,
      startedAt,
      elapsedMs: Date.now() - startedAt
    });

    return FinanceDomainEvaluationEnvelope.create({
      requestId: normalizedInput.requestId,
      traceId: normalizedInput.traceId,
      originalQuery: normalizedInput.originalQuery,
      normalizedQuery: normalizedInput.normalizedQuery,

      evaluationContext: normalizedInput.evaluationContext,
      scenarioResults,
      aggregateScore: regressionAudit.aggregateScore,
      regressionAudit,

      diagnostics: {
        harness: {
          ok: regressionAudit.evaluationStatus !== "evaluation_failed",
          warnings: regressionAudit.warnings,
          errors: regressionAudit.errors
        },
        catalog: {
          ok: scenarios.length > 0,
          warnings: scenarios.length === 0 ? ["no_scenarios_resolved"] : [],
          errors: [],
          scenarioCount: scenarios.length
        },
        runner: this.collectRunnerDiagnostics(scenarioResults),
        scorer: this.collectScorerDiagnostics(scenarioResults),
        reporter: regressionAudit.diagnostics
      }
    });
  }

  resolveScenarios(input = {}) {
    if (safeArray(input.scenarios).length > 0) {
      return safeArray(input.scenarios);
    }

    if (safeArray(input.scenarioIds).length > 0) {
      return this.catalog.getScenariosByIds(input.scenarioIds);
    }

    if (safeArray(input.categories).length > 0) {
      return this.catalog.getScenariosByCategory(input.categories);
    }

    return this.catalog.getDefaultScenarios();
  }

  normalizeInput(input = {}) {
    const queryContext = input.queryContext || {};

    const originalQuery = firstValue(
      input.originalQuery,
      input.query,
      input.userText,
      input.rawInput,
      queryContext.originalQuery,
      queryContext.normalizedQuery,
      "Finance domain evaluation run."
    );

    const requestId =
      input.requestId ||
      input.id ||
      `fin_eval_req_${Date.now().toString(36)}`;

    const traceId =
      input.traceId ||
      `fin_eval_trace_${Date.now().toString(36)}`;

    const normalizedQuery = input.normalizedQuery || normalizeText(originalQuery);

    return {
      requestId,
      traceId,
      originalQuery,
      normalizedQuery,
      evaluationContext: {
        requestedScenarioCount:
          safeArray(input.scenarios).length ||
          safeArray(input.scenarioIds).length ||
          safeArray(input.categories).length ||
          null,
        categories: safeArray(input.categories),
        scenarioIds: safeArray(input.scenarioIds),
        mode: input.mode || "layer13_domain_evaluation",
        strict: input.strict === true,
        createdAt: new Date().toISOString()
      }
    };
  }

  collectRunnerDiagnostics(scenarioResults = []) {
    const failures = safeArray(scenarioResults)
      .filter((item) => item.execution && item.execution.ok === false)
      .map((item) => item.scenarioId);

    return {
      ok: failures.length === 0,
      warnings: [],
      errors: failures.map((id) => `runner_failed:${id}`),
      failedScenarioCount: failures.length
    };
  }

  collectScorerDiagnostics(scenarioResults = []) {
    const failedScores = safeArray(scenarioResults)
      .filter((item) => item.score && item.score.status === "fail")
      .map((item) => item.scenarioId);

    return {
      ok: failedScores.length === 0,
      warnings: safeArray(scenarioResults)
        .filter((item) => item.score && item.score.status === "partial")
        .map((item) => `partial:${item.scenarioId}`),
      errors: failedScores.map((id) => `score_failed:${id}`),
      failedScoreCount: failedScores.length
    };
  }

  run(input = {}) { return this.evaluate(input); }
  execute(input = {}) { return this.evaluate(input); }
  process(input = {}) { return this.evaluate(input); }
  validate(input = {}) { return this.evaluate(input); }

  static evaluate(input = {}, options = {}) {
    return new FinanceDomainEvaluationHarness(options).evaluate(input);
  }

  static run(input = {}, options = {}) {
    return new FinanceDomainEvaluationHarness(options).evaluate(input);
  }
}

module.exports = {
  FinanceDomainEvaluationHarness
};

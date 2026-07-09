"use strict";

/**
 * R18D Layer 13 — Finance Regression Audit Reporter
 * Aggregates Layer 13 scenario results into a regression audit.
 *
 * No external dependencies.
 */

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function uniqueArray(values = []) {
  return Array.from(new Set(values.filter(Boolean)));
}

class FinanceRegressionAuditReporter {
  report(input = {}) {
    const scenarioResults = safeArray(input.scenarioResults);
    const scores = scenarioResults.map((item) => item.score || {});
    const totalScenarios = scenarioResults.length;

    const passedScenarios = scenarioResults.filter((item) => item.passed);
    const failedScenarios = scenarioResults.filter((item) => item.failed);
    const warningScenarios = scenarioResults.filter((item) => item.warning && !item.failed);
    const criticalFailures = scenarioResults.filter((item) => item.score && item.score.critical);

    const averageScore = totalScenarios > 0
      ? Math.round((scores.reduce((sum, score) => sum + (score.score || 0), 0) / totalScenarios) * 1000) / 1000
      : 0;

    const categorySummary = this.categorySummary(scenarioResults);
    const failureBuckets = this.failureBuckets(scenarioResults);
    const evaluationStatus = this.evaluationStatus({
      totalScenarios,
      failedScenarios,
      warningScenarios,
      criticalFailures,
      averageScore
    });

    const warnings = uniqueArray([
      warningScenarios.length > 0 ? "evaluation_has_warning_scenarios" : null,
      averageScore < 0.9 ? "aggregate_score_below_strong_pass" : null
    ]);

    const errors = uniqueArray([
      failedScenarios.length > 0 ? "evaluation_has_failed_scenarios" : null,
      criticalFailures.length > 0 ? "evaluation_has_critical_failures" : null,
      totalScenarios === 0 ? "no_scenarios_evaluated" : null
    ]);

    return {
      auditId: `fin_regression_audit_${Date.now().toString(36)}`,
      domain: "finance",
      runtimeLayer: "layer13_domain_evaluation",
      generatedAt: new Date().toISOString(),
      requestId: input.requestId || null,
      traceId: input.traceId || null,

      evaluationStatus,
      aggregateScore: averageScore,
      totalScenarios,
      passedScenarioCount: passedScenarios.length,
      failedScenarioCount: failedScenarios.length,
      warningScenarioCount: warningScenarios.length,
      criticalFailureCount: criticalFailures.length,

      passedScenarios: passedScenarios.map((item) => item.scenarioId),
      failedScenarios: failedScenarios.map((item) => item.scenarioId),
      warningScenarios: warningScenarios.map((item) => item.scenarioId),
      criticalFailures: criticalFailures.map((item) => item.scenarioId),

      categorySummary,
      failureBuckets,

      routeFailures: failureBuckets.routingCorrectness,
      contractFailures: failureBuckets.responseContractIntegrity,
      safetyFailures: failureBuckets.safetyPosture,
      bypassFailures: failureBuckets.fallbackCorrectness,
      serializationFailures: failureBuckets.serializationSafety,
      runtimeFailures: failureBuckets.runtimeStability,

      elapsedMs: typeof input.elapsedMs === "number" ? input.elapsedMs : null,
      warnings,
      errors,

      diagnostics: {
        ok:
          evaluationStatus === "evaluation_passed" ||
          evaluationStatus === "evaluation_passed_with_warnings",
        warnings,
        errors
      }
    };
  }

  evaluationStatus(summary = {}) {
    if (summary.totalScenarios === 0) return "evaluation_blocked";
    if (summary.criticalFailures.length > 0) return "evaluation_failed";
    if (summary.failedScenarios.length > 0) return "evaluation_failed";
    if (summary.averageScore < 0.5) return "evaluation_failed";
    if (summary.averageScore < 0.75) return "evaluation_partial";
    if (summary.warningScenarios.length > 0 || summary.averageScore < 0.9) {
      return "evaluation_passed_with_warnings";
    }

    return "evaluation_passed";
  }

  categorySummary(scenarioResults = []) {
    const byCategory = {};

    safeArray(scenarioResults).forEach((result) => {
      const category = result.category || "unknown_category";

      if (!byCategory[category]) {
        byCategory[category] = {
          category,
          total: 0,
          passed: 0,
          failed: 0,
          warnings: 0,
          averageScore: 0,
          scoreTotal: 0
        };
      }

      byCategory[category].total += 1;
      byCategory[category].passed += result.passed ? 1 : 0;
      byCategory[category].failed += result.failed ? 1 : 0;
      byCategory[category].warnings += result.warning ? 1 : 0;
      byCategory[category].scoreTotal += result.score && typeof result.score.score === "number"
        ? result.score.score
        : 0;
    });

    return Object.values(byCategory).map((item) => ({
      category: item.category,
      total: item.total,
      passed: item.passed,
      failed: item.failed,
      warnings: item.warnings,
      averageScore: item.total > 0
        ? Math.round((item.scoreTotal / item.total) * 1000) / 1000
        : 0
    }));
  }

  failureBuckets(scenarioResults = []) {
    const buckets = {
      routingCorrectness: [],
      intentCorrectness: [],
      responseContractIntegrity: [],
      caveatPreservation: [],
      fallbackCorrectness: [],
      safetyPosture: [],
      runtimeStability: [],
      serializationSafety: []
    };

    safeArray(scenarioResults).forEach((result) => {
      const failures = result.score && result.score.failures || [];

      failures.forEach((failure) => {
        const [bucket] = String(failure).split(":");
        if (!buckets[bucket]) buckets[bucket] = [];
        buckets[bucket].push(result.scenarioId);
      });
    });

    Object.keys(buckets).forEach((key) => {
      buckets[key] = uniqueArray(buckets[key]);
    });

    return buckets;
  }

  audit(input = {}) { return this.report(input); }
  summarize(input = {}) { return this.report(input); }
  run(input = {}) { return this.report(input); }
  execute(input = {}) { return this.report(input); }
  process(input = {}) { return this.report(input); }

  static report(input = {}, options = {}) {
    return new FinanceRegressionAuditReporter(options).report(input);
  }
}

module.exports = {
  FinanceRegressionAuditReporter
};

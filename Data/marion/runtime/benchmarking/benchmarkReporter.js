'use strict';

/**
 * Sandblast Benchmark Reporter
 *
 * Converts benchmark results into readable console output.
 */

function formatPercent(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 'n/a';
  return `${Math.round(num * 100)}%`;
}

function formatBenchmarkSummary(result) {
  const summary = result && result.summary ? result.summary : {};

  return [
    'Sandblast Benchmark Summary',
    '---------------------------',
    `Total scenarios: ${summary.totalScenarios ?? 0}`,
    `Passed scenarios: ${summary.passedScenarios ?? 0}`,
    `Failed scenarios: ${summary.failedScenarios ?? 0}`,
    `Average latency: ${summary.averageLatencyMs ?? 'n/a'}ms`,
    `Fallback rate: ${formatPercent(summary.fallbackRate)}`,
    `Overall pass: ${summary.passed ? 'YES' : 'NO'}`
  ].join('\n');
}

function printBenchmarkSummary(result, logger = console) {
  logger.log(formatBenchmarkSummary(result));

  if (result && result.summary && Array.isArray(result.summary.details)) {
    const failed = result.summary.details.filter((item) => !item.passed);
    if (failed.length) {
      logger.log('\nFailures:');
      failed.forEach((item) => {
        logger.log(`- ${item.scenarioId}: ${item.failures.join('; ')}`);
      });
    }
  }
}

module.exports = {
  formatBenchmarkSummary,
  printBenchmarkSummary
};

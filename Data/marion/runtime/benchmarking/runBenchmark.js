'use strict';

const { runControlledBenchmark } = require('./benchmarkHarness');
const { printBenchmarkSummary } = require('./benchmarkReporter');

const result = runControlledBenchmark();
printBenchmarkSummary(result);

if (!result.summary.passed) {
  process.exitCode = 1;
}

{
  "benchmarkVersion": "1.0.0",
  "project": "Sandblast Cognitive OS",
  "phases": {
    "phase1": {
      "name": "Baseline Metrics",
      "enabled": true,
      "description": "Captures initial measurable standards before optimization."
    },
    "phase2": {
      "name": "Controlled Scenario Testing",
      "enabled": true,
      "description": "Runs repeatable test scenarios for consistency and comparison."
    }
  },
  "thresholds": {
    "maxResponseLatencyMs": 2500,
    "minimumIntentConfidence": 0.7,
    "minimumDomainConfidence": 0.65,
    "minimumContinuityScore": 0.75,
    "minimumClarityScore": 0.75,
    "minimumAuthorityScore": 0.9,
    "maximumFallbackRate": 0.2
  },
  "trackedSignals": [
    "latencyMs",
    "intentConfidence",
    "domainConfidence",
    "continuityScore",
    "clarityScore",
    "authorityScore",
    "fallbackTriggered",
    "languageDetected",
    "translationRequired",
    "finalAuthority"
  ],
  "finalAuthority": "Marion"
}

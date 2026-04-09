// runtime/layer3/DomainRegistry.js
"use strict";

const DOMAIN_REGISTRY = {
  general: {
    priority: 1.0,
    evidenceBias: 1.0,
    explanationStyle: "balanced",
    preferredSources: ["domain", "dataset", "memory", "general"],
    riskTolerance: 0.45,
    defaultBudget: { maxTokensApprox: 900, maxItems: 8 }
  },
  psychology: {
    priority: 1.05,
    evidenceBias: 0.97,
    explanationStyle: "supportive-structured",
    preferredSources: ["memory", "domain", "dataset", "general"],
    riskTolerance: 0.24,
    defaultBudget: { maxTokensApprox: 760, maxItems: 6 }
  },
  finance: {
    priority: 1.08,
    evidenceBias: 1.08,
    explanationStyle: "decision-grade",
    preferredSources: ["dataset", "domain", "general", "memory"],
    riskTolerance: 0.22,
    defaultBudget: { maxTokensApprox: 1050, maxItems: 9 }
  },
  law: {
    priority: 1.1,
    evidenceBias: 1.1,
    explanationStyle: "qualified-precise",
    preferredSources: ["domain", "dataset", "general", "memory"],
    riskTolerance: 0.18,
    defaultBudget: { maxTokensApprox: 1050, maxItems: 9 }
  },
  english: {
    priority: 1.02,
    evidenceBias: 1.0,
    explanationStyle: "analytic-clear",
    preferredSources: ["domain", "dataset", "general", "memory"],
    riskTolerance: 0.35,
    defaultBudget: { maxTokensApprox: 920, maxItems: 8 }
  },
  cybersecurity: {
    priority: 1.08,
    evidenceBias: 1.08,
    explanationStyle: "threat-aware",
    preferredSources: ["domain", "dataset", "general", "memory"],
    riskTolerance: 0.2,
    defaultBudget: { maxTokensApprox: 1050, maxItems: 9 }
  },
  marketing: {
    priority: 1.04,
    evidenceBias: 1.03,
    explanationStyle: "audience-strategic",
    preferredSources: ["dataset", "domain", "general", "memory"],
    riskTolerance: 0.3,
    defaultBudget: { maxTokensApprox: 940, maxItems: 8 }
  },
  ai: {
    priority: 1.06,
    evidenceBias: 1.06,
    explanationStyle: "systems-technical",
    preferredSources: ["domain", "dataset", "general", "memory"],
    riskTolerance: 0.28,
    defaultBudget: { maxTokensApprox: 980, maxItems: 8 }
  },
  strategy: {
    priority: 1.05,
    evidenceBias: 1.04,
    explanationStyle: "operational-strategic",
    preferredSources: ["domain", "dataset", "memory", "general"],
    riskTolerance: 0.3,
    defaultBudget: { maxTokensApprox: 980, maxItems: 8 }
  }
};

function _trim(v) { return v == null ? "" : String(v).trim(); }

function getDomainMeta(domain = "general") {
  return DOMAIN_REGISTRY[_trim(domain)] || DOMAIN_REGISTRY.general;
}

function getPreferredSourceRank(domain = "general") {
  const meta = getDomainMeta(domain);
  return meta.preferredSources.reduce((acc, source, idx) => {
    acc[source] = idx + 1;
    return acc;
  }, {});
}

function listDomains() {
  return Object.keys(DOMAIN_REGISTRY);
}

module.exports = {
  DOMAIN_REGISTRY,
  getDomainMeta,
  getPreferredSourceRank,
  listDomains
};

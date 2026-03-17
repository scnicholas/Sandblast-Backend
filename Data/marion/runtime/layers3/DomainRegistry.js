// runtime/layer3/DomainRegistry.js

const DOMAIN_REGISTRY = {
  psychology: {
    aliases: ['psych', 'mental health', 'emotion', 'mood', 'therapy', 'behavior'],
    priority: 1.0,
    styleHints: ['empathetic', 'stabilizing', 'human-aware'],
    datasets: ['meld', 'emotion-lines', 'psych-core', 'psych-cases']
  },
  finance: {
    aliases: ['money', 'markets', 'stocks', 'investing', 'economics', 'capital markets'],
    priority: 0.92,
    styleHints: ['analytical', 'risk-aware', 'structured'],
    datasets: ['finance-core', 'markets-news', 'case-studies', 'textbooks']
  },
  law: {
    aliases: ['contracts', 'legal', 'court', 'case law', 'bar', 'statute'],
    priority: 0.94,
    styleHints: ['precise', 'qualified', 'risk-aware'],
    datasets: ['law-core', 'contracts', 'cases', 'bar-material']
  },
  english: {
    aliases: ['writing', 'literature', 'essay', 'grammar', 'rhetoric'],
    priority: 0.82,
    styleHints: ['clear', 'expressive', 'contextual'],
    datasets: ['english-core', 'lit-texts', 'writing-guides']
  },
  cybersecurity: {
    aliases: ['security', 'cyber', 'infosec', 'threat', 'network'],
    priority: 0.9,
    styleHints: ['defensive', 'technical', 'cautious'],
    datasets: ['cyber-core', 'security-cases', 'threat-notes']
  },
  marketing: {
    aliases: ['branding', 'ads', 'copywriting', 'growth', 'audience'],
    priority: 0.84,
    styleHints: ['persuasive', 'audience-aware', 'commercial'],
    datasets: ['marketing-core', 'campaign-cases', 'brand-guides']
  },
  general: {
    aliases: ['general', 'misc', 'default'],
    priority: 0.7,
    styleHints: ['balanced', 'clear'],
    datasets: ['general-core']
  }
};

function resolveDomain(input) {
  if (!input) return 'general';
  const q = String(input).toLowerCase().trim();

  for (const [domain, meta] of Object.entries(DOMAIN_REGISTRY)) {
    if (domain === q) return domain;
    if (meta.aliases.some(alias => q.includes(alias))) return domain;
  }

  return 'general';
}

function getDomainMeta(domain) {
  return DOMAIN_REGISTRY[domain] || DOMAIN_REGISTRY.general;
}

module.exports = {
  DOMAIN_REGISTRY,
  resolveDomain,
  getDomainMeta
};

"use strict";

/**
 * DomainTranslationRouter
 *
 * Purpose:
 * Routes translation behavior using Marion domain metadata so domain terms
 * are preserved across English, Spanish, and French.
 *
 * Contract:
 * - Never throws.
 * - Does not override Marion final authority.
 * - Marks terminology lock when domain-specific terms require protection.
 * - Falls back to general route safely.
 */

const DEFAULT_RULES = {
  defaultDomain: "general",
  supportedLanguages: ["en", "es", "fr"],
  supportedDomains: [
    "general",
    "ai",
    "psychology",
    "english",
    "finance",
    "law",
    "cyber",
    "business",
  ],
  terminologySensitiveDomains: [
    "ai",
    "psychology",
    "finance",
    "law",
    "cyber",
    "business",
  ],
  domainAliases: {
    artificial_intelligence: "ai",
    legal: "law",
    cybersecurity: "cyber",
    english_language: "english",
  },
};

function normalizeLanguage(value) {
  const language = String(value || "").trim().toLowerCase();

  if (!language) return "en";
  if (language === "eng") return "en";
  if (language === "spa" || language === "es-419") return "es";
  if (language === "fre" || language === "fra") return "fr";
  if (language.includes("-")) return language.split("-")[0];

  return language;
}

function normalizeDomain(value, rules = DEFAULT_RULES) {
  const raw = String(value || "").trim().toLowerCase();

  if (!raw) return rules.defaultDomain || "general";

  const cleaned = raw.replace(/\s+/g, "_");
  const alias = rules.domainAliases && rules.domainAliases[cleaned];

  const domain = alias || cleaned;

  return Array.isArray(rules.supportedDomains) &&
    rules.supportedDomains.includes(domain)
    ? domain
    : rules.defaultDomain || "general";
}

function inferDomainFromText(text, rules = DEFAULT_RULES) {
  const input = String(text || "").toLowerCase();

  if (/\btranslation|language|grammar|sentence|english|spanish|french\b/i.test(input)) {
    return "english";
  }

  if (/\bmarion|nyx|ai|model|router|envelope|context passport|language layer\b/i.test(input)) {
    return "ai";
  }

  if (/\btherapy|emotion|cognitive|behavior|psychology|anxiety|trauma\b/i.test(input)) {
    return "psychology";
  }

  if (/\brevenue|market|finance|investment|cash flow|valuation\b/i.test(input)) {
    return "finance";
  }

  if (/\bcontract|legal|law|terms|liability|compliance\b/i.test(input)) {
    return "law";
  }

  if (/\bsecurity|cyber|token|exploit|attack|auth|firewall\b/i.test(input)) {
    return "cyber";
  }

  if (/\bbusiness|commercial|customer|sales|licensing|pilot\b/i.test(input)) {
    return "business";
  }

  return rules.defaultDomain || "general";
}

function buildRouteFamily(domain, sourceLanguage, targetLanguage) {
  if (sourceLanguage === targetLanguage) {
    return `${domain}_same_language`;
  }

  return `${domain}_translation`;
}

function resolveDomainTranslationRoute(payload = {}, options = {}) {
  try {
    const rules = {
      ...DEFAULT_RULES,
      ...(options.rules || payload.rules || {}),
    };

    const text = String(
      payload.text ||
        payload.normalizedText ||
        payload.originalText ||
        ""
    );

    const sourceLanguage = normalizeLanguage(
      payload.sourceLanguage ||
        payload.detectedLanguage ||
        payload.language ||
        "en"
    );

    const targetLanguage = normalizeLanguage(
      payload.targetLanguage ||
        payload.responseLanguage ||
        sourceLanguage ||
        "en"
    );

    const requestedDomain =
      payload.domain ||
      payload.activeDomain ||
      payload.routeDomain ||
      inferDomainFromText(text, rules);

    const activeDomain = normalizeDomain(requestedDomain, rules);

    const terminologyLock =
      Array.isArray(rules.terminologySensitiveDomains) &&
      rules.terminologySensitiveDomains.includes(activeDomain);

    const routeFamily = buildRouteFamily(
      activeDomain,
      sourceLanguage,
      targetLanguage
    );

    const fallbackUsed =
      activeDomain === rules.defaultDomain &&
      requestedDomain &&
      String(requestedDomain).toLowerCase() !== rules.defaultDomain;

    return {
      ok: true,
      authority: "marion",
      activeDomain,
      requestedDomain,
      sourceLanguage,
      targetLanguage,
      routeFamily,
      terminologyLock,
      glossaryRequired: terminologyLock,
      fallbackUsed,
      reason: fallbackUsed
        ? "domain_translation_fallback_general"
        : "domain_translation_route_resolved",
    };
  } catch (_) {
    return {
      ok: false,
      authority: "marion",
      activeDomain: DEFAULT_RULES.defaultDomain,
      requestedDomain: null,
      sourceLanguage: "en",
      targetLanguage: "en",
      routeFamily: "general_same_language",
      terminologyLock: false,
      glossaryRequired: false,
      fallbackUsed: true,
      reason: "domain_translation_router_exception",
    };
  }
}

function route(payload = {}, options = {}) {
  return resolveDomainTranslationRoute(payload, options);
}

function process(payload = {}, options = {}) {
  return resolveDomainTranslationRoute(payload, options);
}

module.exports = {
  DEFAULT_RULES,
  normalizeLanguage,
  normalizeDomain,
  inferDomainFromText,
  buildRouteFamily,
  resolveDomainTranslationRoute,
  route,
  process,
};
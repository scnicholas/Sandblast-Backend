"use strict";

const {
  getArgosHealth,
  getArgosLanguages
} = require("./ArgosTranslationAdapter");

const {
  getSupportedLanguageCodes
} = require("./LingoSentinelLanguageRegistry");

async function checkTranslationHealth(options = {}) {
  const health = await getArgosHealth(options);
  const languages = await getArgosLanguages(options);

  const installedCodes = Array.isArray(languages.languages)
    ? languages.languages.map((language) => language.code).filter(Boolean)
    : [];

  const supportedCodes = getSupportedLanguageCodes();
  const missingSupportedLanguages = supportedCodes.filter((code) => !installedCodes.includes(code));

  const ok = Boolean(
    health.ok &&
    languages.ok &&
    installedCodes.length > 0
  );

  return {
    ok,
    provider: "argos",
    serviceReachable: Boolean(health.ok),
    languageListReachable: Boolean(languages.ok),
    installedCodes,
    supportedCodes,
    missingSupportedLanguages,
    warnings: [
      ...(health.error ? [`HEALTH_ERROR:${health.error}`] : []),
      ...(languages.error ? [`LANGUAGE_ERROR:${languages.error}`] : []),
      ...(missingSupportedLanguages.length ? [`MISSING_SUPPORTED_LANGUAGES:${missingSupportedLanguages.join(",")}`] : [])
    ],
    raw: {
      health,
      languages
    }
  };
}

async function requireTranslationHealth(options = {}) {
  const result = await checkTranslationHealth(options);

  if (!result.ok) {
    const error = new Error("LINGOSENTINEL_TRANSLATION_HEALTH_FAILED");
    error.details = result;
    throw error;
  }

  return result;
}

module.exports = {
  checkTranslationHealth,
  requireTranslationHealth
};

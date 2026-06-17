"use strict";

/**
 * LingoSentinelLanguageRegistry
 * 50+ language registry for spontaneous multilingual dialogue.
 *
 * This file is the public-safe backend authority for language identity,
 * display names, provider-code mapping, RTL hints, and pair validation.
 * It does not translate and it does not expose secrets.
 */

const VERSION = "2.2.0-spontaneity-50plus-language-registry";
const DEFAULT_TARGET_LANGUAGE = "en";

const LANGUAGE_ROWS = Object.freeze([
  ["en", "English", "English", "Latn", false, 1, "eng_Latn"],
  ["fr", "French", "Français", "Latn", false, 1, "fra_Latn"],
  ["es", "Spanish", "Español", "Latn", false, 1, "spa_Latn"],
  ["pt", "Portuguese", "Português", "Latn", false, 1, "por_Latn"],
  ["de", "German", "Deutsch", "Latn", false, 1, "deu_Latn"],
  ["it", "Italian", "Italiano", "Latn", false, 1, "ita_Latn"],
  ["nl", "Dutch", "Nederlands", "Latn", false, 1, "nld_Latn"],
  ["zh", "Chinese", "中文", "Hans", false, 1, "zho_Hans"],
  ["ja", "Japanese", "日本語", "Jpan", false, 1, "jpn_Jpan"],
  ["ko", "Korean", "한국어", "Kore", false, 1, "kor_Hang"],
  ["ar", "Arabic", "العربية", "Arab", true, 1, "arb_Arab"],
  ["hi", "Hindi", "हिन्दी", "Deva", false, 1, "hin_Deva"],
  ["bn", "Bengali", "বাংলা", "Beng", false, 2, "ben_Beng"],
  ["ur", "Urdu", "اردو", "Arab", true, 2, "urd_Arab"],
  ["fa", "Persian", "فارسی", "Arab", true, 2, "pes_Arab"],
  ["he", "Hebrew", "עברית", "Hebr", true, 2, "heb_Hebr"],
  ["ru", "Russian", "Русский", "Cyrl", false, 2, "rus_Cyrl"],
  ["uk", "Ukrainian", "Українська", "Cyrl", false, 2, "ukr_Cyrl"],
  ["pl", "Polish", "Polski", "Latn", false, 2, "pol_Latn"],
  ["cs", "Czech", "Čeština", "Latn", false, 2, "ces_Latn"],
  ["sk", "Slovak", "Slovenčina", "Latn", false, 2, "slk_Latn"],
  ["sl", "Slovenian", "Slovenščina", "Latn", false, 2, "slv_Latn"],
  ["hr", "Croatian", "Hrvatski", "Latn", false, 2, "hrv_Latn"],
  ["sr", "Serbian", "Српски", "Cyrl", false, 2, "srp_Cyrl"],
  ["bg", "Bulgarian", "Български", "Cyrl", false, 2, "bul_Cyrl"],
  ["ro", "Romanian", "Română", "Latn", false, 2, "ron_Latn"],
  ["hu", "Hungarian", "Magyar", "Latn", false, 2, "hun_Latn"],
  ["el", "Greek", "Ελληνικά", "Grek", false, 2, "ell_Grek"],
  ["tr", "Turkish", "Türkçe", "Latn", false, 2, "tur_Latn"],
  ["vi", "Vietnamese", "Tiếng Việt", "Latn", false, 2, "vie_Latn"],
  ["id", "Indonesian", "Bahasa Indonesia", "Latn", false, 2, "ind_Latn"],
  ["ms", "Malay", "Bahasa Melayu", "Latn", false, 2, "zsm_Latn"],
  ["tl", "Filipino / Tagalog", "Filipino", "Latn", false, 2, "tgl_Latn"],
  ["th", "Thai", "ไทย", "Thai", false, 2, "tha_Thai"],
  ["sw", "Swahili", "Kiswahili", "Latn", false, 2, "swh_Latn"],
  ["af", "Afrikaans", "Afrikaans", "Latn", false, 3, "afr_Latn"],
  ["sq", "Albanian", "Shqip", "Latn", false, 3, "als_Latn"],
  ["et", "Estonian", "Eesti", "Latn", false, 3, "est_Latn"],
  ["lv", "Latvian", "Latviešu", "Latn", false, 3, "lvs_Latn"],
  ["lt", "Lithuanian", "Lietuvių", "Latn", false, 3, "lit_Latn"],
  ["mk", "Macedonian", "Македонски", "Cyrl", false, 3, "mkd_Cyrl"],
  ["hy", "Armenian", "Հայերեն", "Armn", false, 3, "hye_Armn"],
  ["ka", "Georgian", "ქართული", "Geor", false, 3, "kat_Geor"],
  ["az", "Azerbaijani", "Azərbaycanca", "Latn", false, 3, "azj_Latn"],
  ["kk", "Kazakh", "Қазақ", "Cyrl", false, 3, "kaz_Cyrl"],
  ["uz", "Uzbek", "Oʻzbek", "Latn", false, 3, "uzn_Latn"],
  ["mn", "Mongolian", "Монгол", "Cyrl", false, 3, "khk_Cyrl"],
  ["my", "Burmese", "မြန်မာ", "Mymr", false, 3, "mya_Mymr"],
  ["km", "Khmer", "ខ្មែរ", "Khmr", false, 3, "khm_Khmr"],
  ["lo", "Lao", "ລາວ", "Laoo", false, 3, "lao_Laoo"],
  ["ta", "Tamil", "தமிழ்", "Taml", false, 2, "tam_Taml"],
  ["te", "Telugu", "తెలుగు", "Telu", false, 3, "tel_Telu"],
  ["ml", "Malayalam", "മലയാളം", "Mlym", false, 3, "mal_Mlym"],
  ["mr", "Marathi", "मराठी", "Deva", false, 3, "mar_Deva"],
  ["gu", "Gujarati", "ગુજરાતી", "Gujr", false, 3, "guj_Gujr"],
  ["kn", "Kannada", "ಕನ್ನಡ", "Knda", false, 3, "kan_Knda"],
  ["pa", "Punjabi", "ਪੰਜਾਬੀ", "Guru", false, 3, "pan_Guru"],
  ["ne", "Nepali", "नेपाली", "Deva", false, 3, "npi_Deva"],
  ["si", "Sinhala", "සිංහල", "Sinh", false, 3, "sin_Sinh"],
  ["am", "Amharic", "አማርኛ", "Ethi", false, 3, "amh_Ethi"],
  ["ha", "Hausa", "Hausa", "Latn", false, 3, "hau_Latn"],
  ["yo", "Yoruba", "Yorùbá", "Latn", false, 3, "yor_Latn"],
  ["ig", "Igbo", "Igbo", "Latn", false, 3, "ibo_Latn"],
  ["zu", "Zulu", "isiZulu", "Latn", false, 3, "zul_Latn"],
  ["xh", "Xhosa", "isiXhosa", "Latn", false, 3, "xho_Latn"]
]);

const SUPPORTED_LANGUAGES = Object.freeze(Object.fromEntries(
  LANGUAGE_ROWS.map(([code, name, nativeName, script, rtl, tier, nllbCode], index) => [code, Object.freeze({
    code,
    name,
    nativeName,
    script,
    rtl: Boolean(rtl),
    tier,
    priority: index + 1,
    enabled: true,
    argosCode: code,
    libreCode: code,
    isoCode: code,
    providerCode: code,
    nllbCode
  })])
));

const LANGUAGE_ALIASES = Object.freeze({
  automatic: "auto", autodetect: "auto", "auto-detect": "auto", auto: "auto", mixed: "mixed", unknown: "unknown",
  english: "en", eng: "en", "en-us": "en", "en-gb": "en", "eng_latn": "en",
  french: "fr", francais: "fr", français: "fr", fra: "fr", "fra_latn": "fr",
  spanish: "es", espanol: "es", español: "es", castilian: "es", spa: "es", "spa_latn": "es",
  portuguese: "pt", portugues: "pt", português: "pt", por: "pt", "pt-br": "pt", "pt-pt": "pt",
  german: "de", deutsch: "de", deu: "de", dutch: "nl", nederlands: "nl",
  italian: "it", italiano: "it", chinese: "zh", mandarin: "zh", "mandarin chinese": "zh", "zh-cn": "zh", "zh-hans": "zh", "zh_hans": "zh", cn: "zh", zho: "zh",
  japanese: "ja", nihongo: "ja", korean: "ko", hangul: "ko",
  arabic: "ar", ar: "ar", hebrew: "he", persian: "fa", farsi: "fa", urdu: "ur", hindi: "hi", bengali: "bn", bangla: "bn", punjabi: "pa",
  russian: "ru", ukrainian: "uk", polish: "pl", czech: "cs", slovak: "sk", slovenian: "sl", croatian: "hr", serbian: "sr", bulgarian: "bg", romanian: "ro", hungarian: "hu", greek: "el", turkish: "tr",
  vietnamese: "vi", indonesian: "id", bahasa: "id", malay: "ms", filipino: "tl", tagalog: "tl", thai: "th", swahili: "sw",
  afrikaans: "af", albanian: "sq", estonian: "et", latvian: "lv", lithuanian: "lt", macedonian: "mk", armenian: "hy", georgian: "ka", azerbaijani: "az", kazakh: "kk", uzbek: "uz", mongolian: "mn", burmese: "my", myanmar: "my", khmer: "km", lao: "lo",
  tamil: "ta", telugu: "te", malayalam: "ml", marathi: "mr", gujarati: "gu", kannada: "kn", nepali: "ne", sinhala: "si", amharic: "am", hausa: "ha", yoruba: "yo", igbo: "ig", zulu: "zu", xhosa: "xh"
});

function safeString(value, fallback = "") {
  if (typeof value === "string") return value.trim();
  if (value === null || value === undefined) return fallback;
  return String(value).trim();
}

function normalizeLanguageCode(value, fallback = "") {
  const raw = safeString(value);
  if (!raw) return fallback;
  const compact = raw.toLowerCase().replace(/[.]/g, "").replace(/\s+/g, " ").replace(/-/g, "-");
  const aliasKey = compact.replace(/\s+/g, " ");
  if (LANGUAGE_ALIASES[aliasKey]) return LANGUAGE_ALIASES[aliasKey];
  const nllbKey = compact.replace(/-/g, "_");
  if (LANGUAGE_ALIASES[nllbKey]) return LANGUAGE_ALIASES[nllbKey];
  const primary = compact.split(/[-_]/)[0];
  if (SUPPORTED_LANGUAGES[primary]) return primary;
  return fallback || primary || compact;
}

function isSpecialLanguage(value) {
  const code = normalizeLanguageCode(value);
  return code === "auto" || code === "mixed" || code === "unknown";
}

function isSupportedLanguage(value) {
  const code = normalizeLanguageCode(value);
  return Boolean(SUPPORTED_LANGUAGES[code] && SUPPORTED_LANGUAGES[code].enabled);
}

function getLanguage(value) {
  const code = normalizeLanguageCode(value);
  return SUPPORTED_LANGUAGES[code] || null;
}

function getSupportedLanguageCodes() {
  return Object.keys(SUPPORTED_LANGUAGES)
    .filter(code => SUPPORTED_LANGUAGES[code].enabled)
    .sort((a, b) => SUPPORTED_LANGUAGES[a].priority - SUPPORTED_LANGUAGES[b].priority);
}

function getSupportedLanguages() {
  return getSupportedLanguageCodes().map(code => ({ ...SUPPORTED_LANGUAGES[code] }));
}

function getDefaultTargetLanguage() {
  const envTarget = normalizeLanguageCode(process.env.TRANSLATION_DEFAULT_TARGET || process.env.LINGOSENTINEL_DEFAULT_TARGET_LANGUAGE || DEFAULT_TARGET_LANGUAGE, DEFAULT_TARGET_LANGUAGE);
  return isSupportedLanguage(envTarget) ? envTarget : DEFAULT_TARGET_LANGUAGE;
}

function getProviderLanguageCode(value, provider = "libre") {
  const code = normalizeLanguageCode(value);
  if (code === "auto" || code === "mixed" || code === "unknown") return "auto";
  const language = getLanguage(code);
  if (!language) return code;
  const key = safeString(provider).toLowerCase();
  if (key.includes("nllb")) return language.nllbCode || language.providerCode || code;
  if (key.includes("argos")) return language.argosCode || code;
  if (key.includes("libre")) return language.libreCode || code;
  return language.providerCode || code;
}

function isRightToLeft(value) {
  const language = getLanguage(value);
  return Boolean(language && language.rtl);
}

function coerceTargetLanguage(value, fallback = getDefaultTargetLanguage()) {
  const target = normalizeLanguageCode(value, fallback);
  return isSupportedLanguage(target) ? target : fallback;
}

function validateLanguagePair(source, target, options = {}) {
  const allowAutoSource = options.allowAutoSource !== false;
  const provider = options.provider || process.env.LINGOSENTINEL_TRANSLATE_PROVIDER || "libre";
  const normalizedSource = normalizeLanguageCode(source || "auto", "auto");
  const normalizedTarget = coerceTargetLanguage(target || getDefaultTargetLanguage());
  const warnings = [];

  if (!normalizedTarget) warnings.push("MISSING_TARGET_LANGUAGE");
  if (!allowAutoSource && (!normalizedSource || isSpecialLanguage(normalizedSource))) warnings.push("MISSING_SOURCE_LANGUAGE");
  if (normalizedSource && !isSpecialLanguage(normalizedSource) && !isSupportedLanguage(normalizedSource)) warnings.push(`UNSUPPORTED_SOURCE_LANGUAGE:${normalizedSource}`);
  if (normalizedTarget && !isSupportedLanguage(normalizedTarget)) warnings.push(`UNSUPPORTED_TARGET_LANGUAGE:${normalizedTarget}`);
  if (normalizedSource && normalizedTarget && normalizedSource === normalizedTarget) warnings.push("SOURCE_TARGET_IDENTICAL");

  return {
    ok: warnings.every(w => w === "SOURCE_TARGET_IDENTICAL"),
    source: normalizedSource,
    target: normalizedTarget,
    providerSource: getProviderLanguageCode(normalizedSource, provider),
    providerTarget: getProviderLanguageCode(normalizedTarget, provider),
    argosSource: getProviderLanguageCode(normalizedSource, "argos"),
    argosTarget: getProviderLanguageCode(normalizedTarget, "argos"),
    nllbSource: getProviderLanguageCode(normalizedSource, "nllb"),
    nllbTarget: getProviderLanguageCode(normalizedTarget, "nllb"),
    sourceRtl: isRightToLeft(normalizedSource),
    targetRtl: isRightToLeft(normalizedTarget),
    warnings
  };
}

function publicLanguageList() {
  return getSupportedLanguages().map(({ code, name, nativeName, script, rtl, tier, enabled }) => ({ code, name, nativeName, script, rtl, tier, enabled }));
}

module.exports = {
  VERSION,
  SUPPORTED_LANGUAGES,
  LANGUAGE_ALIASES,
  DEFAULT_TARGET_LANGUAGE,
  normalizeLanguageCode,
  isSpecialLanguage,
  isSupportedLanguage,
  getLanguage,
  getProviderLanguageCode,
  getSupportedLanguageCodes,
  getSupportedLanguages,
  getDefaultTargetLanguage,
  isRightToLeft,
  coerceTargetLanguage,
  validateLanguagePair,
  publicLanguageList
};

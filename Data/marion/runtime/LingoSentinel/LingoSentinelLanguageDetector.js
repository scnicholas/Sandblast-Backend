"use strict";

/**
 * LingoSentinelLanguageDetector
 * Backend-safe source language hints for spontaneous public dialogue.
 *
 * This detector supports 50+ language routing through the registry. It uses
 * scripts and common lexical markers for fast hints, then intentionally falls
 * back to provider auto-detection for languages that need model-level handling.
 */

const Registry = require("./LingoSentinelLanguageRegistry");

const VERSION = "2.2.0-spontaneity-50plus-language-detection";

const SCRIPT_RULES = Object.freeze([
  { code: "ja", name: "Japanese", confidence: 0.92, rx: /[\u3040-\u30ff]/ },
  { code: "ko", name: "Korean", confidence: 0.92, rx: /[\uac00-\ud7af]/ },
  { code: "zh", name: "Chinese", confidence: 0.88, rx: /[\u4e00-\u9fff]/ },
  { code: "ar", name: "Arabic", confidence: 0.86, rx: /[\u0600-\u06ff]/ },
  { code: "he", name: "Hebrew", confidence: 0.9, rx: /[\u0590-\u05ff]/ },
  { code: "hi", name: "Hindi/Devanagari", confidence: 0.78, rx: /[\u0900-\u097f]/ },
  { code: "bn", name: "Bengali", confidence: 0.9, rx: /[\u0980-\u09ff]/ },
  { code: "pa", name: "Punjabi", confidence: 0.9, rx: /[\u0a00-\u0a7f]/ },
  { code: "gu", name: "Gujarati", confidence: 0.9, rx: /[\u0a80-\u0aff]/ },
  { code: "ta", name: "Tamil", confidence: 0.9, rx: /[\u0b80-\u0bff]/ },
  { code: "te", name: "Telugu", confidence: 0.9, rx: /[\u0c00-\u0c7f]/ },
  { code: "kn", name: "Kannada", confidence: 0.9, rx: /[\u0c80-\u0cff]/ },
  { code: "ml", name: "Malayalam", confidence: 0.9, rx: /[\u0d00-\u0d7f]/ },
  { code: "si", name: "Sinhala", confidence: 0.9, rx: /[\u0d80-\u0dff]/ },
  { code: "th", name: "Thai", confidence: 0.9, rx: /[\u0e00-\u0e7f]/ },
  { code: "lo", name: "Lao", confidence: 0.9, rx: /[\u0e80-\u0eff]/ },
  { code: "my", name: "Burmese", confidence: 0.9, rx: /[\u1000-\u109f]/ },
  { code: "km", name: "Khmer", confidence: 0.9, rx: /[\u1780-\u17ff]/ },
  { code: "el", name: "Greek", confidence: 0.88, rx: /[\u0370-\u03ff]/ },
  { code: "ru", name: "Cyrillic", confidence: 0.73, rx: /[\u0400-\u04ff]/ },
  { code: "hy", name: "Armenian", confidence: 0.9, rx: /[\u0530-\u058f]/ },
  { code: "ka", name: "Georgian", confidence: 0.9, rx: /[\u10a0-\u10ff]/ },
  { code: "am", name: "Amharic", confidence: 0.9, rx: /[\u1200-\u137f]/ }
]);

const WORD_RULES = Object.freeze([
  { code: "fr", weight: 1.15, rx: /\b(?:bonjour|salut|merci|oui|non|avec|pour|dans|être|etre|clair|fâché|fache|comprendre|comprend|vraiment|quelqu(?:’|')?un|demain|aujourd'hui|réunion|reunion|équipe|equipe|voulais|dire|peux|pouvez|comment|ça|ca|va)\b|[àâçéèêëîïôûùüÿœæ]/i },
  { code: "es", weight: 1.08, rx: /\b(?:hola|gracias|sí|si|para|con|quiero|hablar|entiende|entender|mañana|equipo|reunión|reunion|cómo|como|estás|estas|buenos|buenas|ahora|claro|usted)\b|[áéíóúñ¿¡]/i },
  { code: "pt", weight: 1.05, rx: /\b(?:olá|ola|obrigad[oa]|sim|não|nao|para|com|quero|falar|entende|amanhã|amanha|equipe|reunião|reuniao|como|você|voce|agora|claro)\b|[ãõáâêíóôúç]/i },
  { code: "de", weight: 1.0, rx: /\b(?:hallo|danke|ja|nein|ich|möchte|moechte|sprechen|verstehen|morgen|team|besprechung|nicht|klar|bitte|und|ist)\b|[äöüß]/i },
  { code: "it", weight: 1.0, rx: /\b(?:ciao|grazie|sì|si|voglio|parlare|capisce|capire|domani|squadra|riunione|come|stai|chiaro|perché|perche)\b|[àèéìíîòóù]/i },
  { code: "nl", weight: 0.98, rx: /\b(?:hallo|dank|ja|nee|niet|ik|wil|spreken|begrijpen|morgen|team|vergadering|duidelijk)\b/i },
  { code: "tr", weight: 0.98, rx: /\b(?:merhaba|teşekkür|tesekkur|evet|hayır|hayir|konuşmak|konusmak|anlamak|yarın|yarin|ekip|toplantı|toplanti)\b|[ğüşöçıİ]/i },
  { code: "vi", weight: 0.98, rx: /\b(?:xin chào|chào|cảm ơn|cam on|vâng|không|toi|tôi|muốn|muon|nói|noi|hiểu|hieu|ngày mai|ngay mai)\b|[ăâđêôơưáàảãạéèẻẽẹíìỉĩịóòỏõọúùủũụýỳỷỹỵ]/i },
  { code: "id", weight: 0.94, rx: /\b(?:halo|terima kasih|iya|tidak|saya|ingin|bicara|mengerti|besok|tim|rapat|jelas)\b/i },
  { code: "tl", weight: 0.92, rx: /\b(?:kumusta|salamat|oo|hindi|ako|gusto|magsalita|naiintindihan|bukas|pangkat|pulong|malinaw)\b/i },
  { code: "sw", weight: 0.92, rx: /\b(?:habari|asante|ndiyo|hapana|nataka|kuzungumza|kuelewa|kesho|timu|mkutano|wazi)\b/i },
  { code: "pl", weight: 0.94, rx: /\b(?:cześć|czesc|dziękuję|dziekuje|tak|nie|chcę|chce|rozmawiać|rozmawiac|rozumieć|rozumiec|jutro|zespół|zespol|spotkanie|jasne)\b|[ąćęłńóśźż]/i },
  { code: "ro", weight: 0.9, rx: /\b(?:salut|mulțumesc|multumesc|da|nu|vreau|vorbesc|înțeleg|inteleg|mâine|maine|echipă|echipa|întâlnire|intalnire|clar)\b|[ăâîșşțţ]/i },
  { code: "en", weight: 0.72, rx: /\b(?:hello|hi|thanks|thank|yes|no|with|for|want|speak|talk|understand|really|tomorrow|meeting|team|clear|angry|mean|how|are|you|please|now)\b/i }
]);

function safeString(value, fallback = "") {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return fallback;
  return String(value);
}

function normalizeLanguage(value, fallback = "auto") {
  return Registry.normalizeLanguageCode(value, fallback);
}

function clampText(value, max = 6000) {
  const text = safeString(value).replace(/\u0000/g, "").trim();
  return text.length > max ? text.slice(0, max) : text;
}

function hasMeaningfulText(text) {
  return /[\p{L}\p{N}]/u.test(safeString(text));
}

function detectScriptLanguage(text) {
  const matches = SCRIPT_RULES.filter(rule => rule.rx.test(text)).map(rule => ({
    language: rule.code,
    detectedLanguage: rule.code,
    languageName: rule.name,
    confidence: rule.confidence,
    source: "script_match"
  })).filter(item => Registry.isSupportedLanguage(item.language));

  if (!matches.length) return null;
  if (matches.length === 1) return matches[0];
  return { language: "mixed", detectedLanguage: matches[0].language, languageName: "Mixed", confidence: 0.7, source: "multiple_script_match", mixed: true, candidates: matches };
}

function scoreWordRules(text) {
  const candidates = [];
  WORD_RULES.forEach(rule => {
    if (!Registry.isSupportedLanguage(rule.code)) return;
    const match = text.match(rule.rx);
    if (!match) return;
    const density = Math.min(0.22, match.join("").length / Math.max(text.length, 1));
    candidates.push({
      language: rule.code,
      detectedLanguage: rule.code,
      languageName: (Registry.getLanguage(rule.code) || {}).name || rule.code,
      confidence: Math.min(0.94, 0.48 + density + rule.weight * 0.16),
      source: "word_or_diacritic_match"
    });
  });
  return candidates.sort((a, b) => b.confidence - a.confidence);
}

function uniqueCandidates(candidates) {
  return Array.from(new Map(candidates.map(item => [item.language, item])).values())
    .sort((a, b) => b.confidence - a.confidence);
}

function detectLanguage(input, options = {}) {
  const text = clampText(input, options.maxTextChars || 6000);
  const explicit = normalizeLanguage(options.sourceLanguage || options.language || options.lang || "auto", "auto");

  if (explicit && explicit !== "auto" && explicit !== "mixed") {
    return {
      ok: Registry.isSupportedLanguage(explicit),
      language: explicit,
      detectedLanguage: explicit,
      confidence: Registry.isSupportedLanguage(explicit) ? 0.99 : 0.3,
      source: "explicit",
      mixed: false,
      textLength: text.length,
      supported: Registry.isSupportedLanguage(explicit),
      version: VERSION
    };
  }

  if (!text || !hasMeaningfulText(text)) {
    return { ok: false, language: "unknown", detectedLanguage: "unknown", confidence: 0, source: "empty_or_non_text", mixed: false, textLength: text.length, version: VERSION };
  }

  const script = detectScriptLanguage(text);
  const candidates = uniqueCandidates([...(script && script.candidates ? script.candidates : script ? [script] : []), ...scoreWordRules(text)]);

  if (!candidates.length) {
    return {
      ok: true,
      language: "auto",
      detectedLanguage: "auto",
      confidence: 0.25,
      source: "provider_auto_recommended",
      mixed: false,
      candidates: [],
      textLength: text.length,
      supportedLanguageCount: Registry.getSupportedLanguageCodes().length,
      version: VERSION
    };
  }

  const top = candidates[0];
  const second = candidates[1];
  const mixed = Boolean(second && top.language !== second.language && top.confidence - second.confidence < 0.12);

  return {
    ok: true,
    language: mixed ? "mixed" : top.language,
    detectedLanguage: top.language,
    confidence: mixed ? Math.max(0.5, top.confidence - 0.08) : top.confidence,
    source: top.source || "heuristic",
    mixed,
    candidates: candidates.slice(0, 8),
    textLength: text.length,
    supportedLanguageCount: Registry.getSupportedLanguageCodes().length,
    version: VERSION
  };
}

module.exports = {
  VERSION,
  detectLanguage,
  normalizeLanguage,
  clampText,
  isSupportedLanguage: Registry.isSupportedLanguage,
  getSupportedLanguageCodes: Registry.getSupportedLanguageCodes
};

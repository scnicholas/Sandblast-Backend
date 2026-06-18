"use strict";

/**
 * LingoSentinelLanguageDetector
 * Backend-safe source language hints for spontaneous public dialogue.
 *
 * v2.2.1 surgical patch:
 * - fixes Romance-language false positives, especially ES misread as FR
 * - counts all lexical markers instead of only the first regex hit
 * - respects explicit sourceLanguage overrides as hard routing signals
 * - normalizes punctuation/diacritics for safer accentless dialogue handling
 * - keeps provider-auto fallback for unknown/low-signal language input
 */

const Registry = require("./LingoSentinelLanguageRegistry");

const VERSION = "2.2.1-spontaneity-detector-romance-guard";
const MAX_CANDIDATES = 8;

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

/**
 * Lexical rules intentionally separate common markers from stronger markers.
 * The detector is a routing hint, not the translation authority; it should only
 * choose a source language when the evidence is clear enough to beat provider auto.
 */
const WORD_RULES = Object.freeze([
  {
    code: "es",
    weight: 1.24,
    rx: /\b(?:hola|gracias|sí|si|para|con|quiero|quiere|queremos|confirmar|confirmo|hablar|entiende|entender|mañana|manana|equipo|reunión|reunion|reuniones|cómo|como|estás|estas|buenos|buenas|ahora|claro|usted|ustedes|necesito|podemos|vamos|hacer|tengo|favor)\b|[áéíóúñ¿¡]/i,
    strongRx: /\b(?:hola|quiero|confirmar|mañana|manana|usted|ustedes|gracias|buenos|buenas|necesito|podemos|vamos)\b|[ñ¿¡]/i
  },
  {
    code: "fr",
    weight: 1.12,
    rx: /\b(?:bonjour|salut|merci|oui|non|avec|pour|dans|être|etre|clair|fâché|fache|comprendre|comprend|vraiment|quelqu(?:’|')?un|demain|aujourd(?:’|')?hui|réunion|reunion|équipe|equipe|voudrais|voulais|veux|dire|peux|pouvez|comment|ça|ca|va|bonjour comment|s'il|sil|vous|plaît|plait)\b|[àâçéèêëîïôûùüÿœæ]/i,
    strongRx: /\b(?:bonjour|salut|merci|demain|voudrais|veux|peux|pouvez|quelqu(?:’|')?un|ça|ca\s+va|s'il|sil|vous|plaît|plait)\b|[àâçéèêëîïôûùüÿœæ]/i
  },
  {
    code: "pt",
    weight: 1.06,
    rx: /\b(?:olá|ola|obrigad[oa]|sim|não|nao|para|com|quero|confirmar|falar|entende|amanhã|amanha|equipe|reunião|reuniao|como|você|voce|agora|claro|preciso|podemos)\b|[ãõáâêíóôúç]/i,
    strongRx: /\b(?:olá|ola|obrigad[oa]|não|nao|amanhã|amanha|você|voce|preciso)\b|[ãõç]/i
  },
  { code: "de", weight: 1.0, rx: /\b(?:hallo|danke|ja|nein|ich|möchte|moechte|sprechen|verstehen|morgen|team|besprechung|nicht|klar|bitte|und|ist)\b|[äöüß]/i, strongRx: /\b(?:hallo|danke|nein|ich|möchte|moechte|morgen|besprechung|bitte)\b|[äöüß]/i },
  { code: "it", weight: 1.0, rx: /\b(?:ciao|grazie|sì|si|voglio|parlare|capisce|capire|domani|squadra|riunione|come|stai|chiaro|perché|perche|vorrei)\b|[àèéìíîòóù]/i, strongRx: /\b(?:ciao|grazie|voglio|domani|squadra|riunione|vorrei)\b/i },
  { code: "nl", weight: 0.98, rx: /\b(?:hallo|dank|ja|nee|niet|ik|wil|spreken|begrijpen|morgen|team|vergadering|duidelijk)\b/i, strongRx: /\b(?:hallo|dank|nee|niet|ik|morgen|vergadering)\b/i },
  { code: "tr", weight: 0.98, rx: /\b(?:merhaba|teşekkür|tesekkur|evet|hayır|hayir|konuşmak|konusmak|anlamak|yarın|yarin|ekip|toplantı|toplanti)\b|[ğüşöçıİ]/i, strongRx: /\b(?:merhaba|teşekkür|tesekkur|hayır|hayir|yarın|yarin|toplantı|toplanti)\b|[ğüşöçıİ]/i },
  { code: "vi", weight: 0.98, rx: /\b(?:xin chào|chào|cảm ơn|cam on|vâng|không|toi|tôi|muốn|muon|nói|noi|hiểu|hieu|ngày mai|ngay mai)\b|[ăâđêôơưáàảãạéèẻẽẹíìỉĩịóòỏõọúùủũụýỳỷỹỵ]/i, strongRx: /\b(?:xin chào|chào|cảm ơn|cam on|không|tôi|muốn|ngày mai|ngay mai)\b|[ăđơư]/i },
  { code: "id", weight: 0.94, rx: /\b(?:halo|terima kasih|iya|tidak|saya|ingin|bicara|mengerti|besok|tim|rapat|jelas)\b/i, strongRx: /\b(?:halo|terima kasih|tidak|saya|besok|rapat)\b/i },
  { code: "tl", weight: 0.92, rx: /\b(?:kumusta|salamat|oo|hindi|ako|gusto|magsalita|naiintindihan|bukas|pangkat|pulong|malinaw)\b/i, strongRx: /\b(?:kumusta|salamat|hindi|ako|bukas|pulong)\b/i },
  { code: "sw", weight: 0.92, rx: /\b(?:habari|asante|ndiyo|hapana|nataka|kuzungumza|kuelewa|kesho|timu|mkutano|wazi)\b/i, strongRx: /\b(?:habari|asante|ndiyo|hapana|kesho|mkutano)\b/i },
  { code: "pl", weight: 0.94, rx: /\b(?:cześć|czesc|dziękuję|dziekuje|tak|nie|chcę|chce|rozmawiać|rozmawiac|rozumieć|rozumiec|jutro|zespół|zespol|spotkanie|jasne)\b|[ąćęłńóśźż]/i, strongRx: /\b(?:cześć|czesc|dziękuję|dziekuje|chcę|chce|jutro|zespół|zespol|spotkanie)\b|[ąćęłńśźż]/i },
  { code: "ro", weight: 0.9, rx: /\b(?:salut|mulțumesc|multumesc|da|nu|vreau|vorbesc|înțeleg|inteleg|mâine|maine|echipă|echipa|întâlnire|intalnire|clar)\b|[ăâîșşțţ]/i, strongRx: /\b(?:mulțumesc|multumesc|vreau|mâine|maine|întâlnire|intalnire)\b|[ăâîșşțţ]/i },
  { code: "en", weight: 0.72, rx: /\b(?:hello|hi|thanks|thank|yes|no|with|for|want|speak|talk|understand|really|tomorrow|meeting|team|clear|angry|mean|how|are|you|please|now)\b/i, strongRx: /\b(?:hello|thanks|thank|tomorrow|meeting|please|understand)\b/i }
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

function normalizeForDetection(text) {
  return safeString(text)
    .normalize("NFKC")
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/[\u201C\u201D\u201E]/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function makeGlobalRegex(rx) {
  const flags = Array.from(new Set(`${rx.flags || ""}g`.split(""))).join("");
  return new RegExp(rx.source, flags);
}

function collectRegexMatches(text, rx, limit = 80) {
  const re = makeGlobalRegex(rx);
  const hits = [];
  let match;
  while ((match = re.exec(text)) && hits.length < limit) {
    const value = safeString(match[0]).trim();
    if (value) hits.push(value);
    if (match[0] === "") re.lastIndex += 1;
  }
  return hits;
}

function detectScriptLanguage(text) {
  const matches = SCRIPT_RULES.filter(rule => rule.rx.test(text)).map(rule => ({
    language: rule.code,
    detectedLanguage: rule.code,
    languageName: rule.name,
    confidence: rule.confidence,
    source: "script_match",
    evidenceCount: 1,
    strongEvidence: true
  })).filter(item => Registry.isSupportedLanguage(item.language));

  if (!matches.length) return null;
  if (matches.length === 1) return matches[0];
  return { language: "mixed", detectedLanguage: matches[0].language, languageName: "Mixed", confidence: 0.7, source: "multiple_script_match", mixed: true, candidates: matches };
}

function scoreWordRules(text) {
  const normalized = normalizeForDetection(text);
  const candidates = [];

  WORD_RULES.forEach(rule => {
    if (!Registry.isSupportedLanguage(rule.code)) return;

    const hits = collectRegexMatches(normalized, rule.rx);
    if (!hits.length) return;

    const strongHits = rule.strongRx ? collectRegexMatches(normalized, rule.strongRx) : [];
    const hitChars = hits.reduce((sum, item) => sum + item.length, 0);
    const density = Math.min(0.26, hitChars / Math.max(normalized.length, 1));
    const countScore = Math.min(0.2, hits.length * 0.045);
    const strongScore = Math.min(0.16, strongHits.length * 0.07);
    const confidence = Math.min(0.96, 0.36 + density + countScore + strongScore + rule.weight * 0.11);

    candidates.push({
      language: rule.code,
      detectedLanguage: rule.code,
      languageName: (Registry.getLanguage(rule.code) || {}).name || rule.code,
      confidence,
      source: strongHits.length ? "strong_word_match" : "word_or_diacritic_match",
      evidenceCount: hits.length,
      strongEvidenceCount: strongHits.length,
      evidence: hits.slice(0, 8)
    });
  });

  return candidates.sort((a, b) => b.confidence - a.confidence);
}

function uniqueCandidates(candidates) {
  const bestByLanguage = new Map();
  candidates.forEach(item => {
    if (!item || !item.language) return;
    const current = bestByLanguage.get(item.language);
    if (!current || item.confidence > current.confidence) bestByLanguage.set(item.language, item);
  });
  return Array.from(bestByLanguage.values()).sort((a, b) => b.confidence - a.confidence);
}

function adjustRomanceCandidates(text, candidates) {
  const normalized = normalizeForDetection(text).toLowerCase();
  const byLanguage = new Map(candidates.map(item => [item.language, { ...item }]));

  const es = byLanguage.get("es");
  const fr = byLanguage.get("fr");
  const pt = byLanguage.get("pt");

  const spanishAnchor = /\b(?:hola|quiero|confirmar|mañana|manana|usted|ustedes|gracias|buenos|buenas|necesito|podemos|vamos)\b|[ñ¿¡]/i.test(normalized);
  const frenchAnchor = /\b(?:bonjour|salut|merci|demain|voudrais|veux|peux|pouvez|quelqu(?:'|’)?un|ça|ca\s+va|s'il|sil|vous|plait|plaît)\b|[àâçéèêëîïôûùüÿœæ]/i.test(normalized);
  const portugueseAnchor = /\b(?:olá|ola|obrigad[oa]|não|nao|amanhã|amanha|você|voce|preciso)\b|[ãõç]/i.test(normalized);

  if (es && spanishAnchor) {
    es.confidence = Math.min(0.98, es.confidence + 0.08);
    es.source = es.source === "word_or_diacritic_match" ? "spanish_anchor_match" : es.source;
    byLanguage.set("es", es);
    if (fr && !frenchAnchor) {
      fr.confidence = Math.max(0.2, fr.confidence - 0.14);
      fr.source = `${fr.source}_romance_dampened`;
      byLanguage.set("fr", fr);
    }
    if (pt && !portugueseAnchor) {
      pt.confidence = Math.max(0.2, pt.confidence - 0.08);
      pt.source = `${pt.source}_romance_dampened`;
      byLanguage.set("pt", pt);
    }
  }

  if (fr && frenchAnchor) {
    fr.confidence = Math.min(0.98, fr.confidence + 0.07);
    fr.source = fr.source === "word_or_diacritic_match" ? "french_anchor_match" : fr.source;
    byLanguage.set("fr", fr);
    if (es && !spanishAnchor) {
      es.confidence = Math.max(0.2, es.confidence - 0.1);
      es.source = `${es.source}_romance_dampened`;
      byLanguage.set("es", es);
    }
  }

  if (pt && portugueseAnchor) {
    pt.confidence = Math.min(0.98, pt.confidence + 0.07);
    byLanguage.set("pt", pt);
    if (es && !spanishAnchor) {
      es.confidence = Math.max(0.2, es.confidence - 0.08);
      byLanguage.set("es", es);
    }
  }

  return Array.from(byLanguage.values()).sort((a, b) => b.confidence - a.confidence);
}

function shouldMarkMixed(top, second) {
  if (!second || top.language === second.language) return false;
  if (top.source === "script_match" && top.confidence >= 0.86) return false;
  if ((top.strongEvidenceCount || 0) > (second.strongEvidenceCount || 0)) return false;
  if (top.confidence >= 0.82 && top.confidence - second.confidence >= 0.07) return false;
  return top.confidence >= 0.52 && second.confidence >= 0.58 && top.confidence - second.confidence < 0.09;
}

function detectLanguage(input, options = {}) {
  const text = clampText(input, options.maxTextChars || 6000);
  const explicit = normalizeLanguage(options.sourceLanguage || options.language || options.lang || "auto", "auto");

  if (explicit && explicit !== "auto" && explicit !== "mixed") {
    const supported = Registry.isSupportedLanguage(explicit);
    return {
      ok: supported,
      language: explicit,
      detectedLanguage: explicit,
      confidence: supported ? 0.99 : 0.3,
      source: supported ? "explicit_override" : "explicit_unsupported",
      mixed: false,
      textLength: text.length,
      supported,
      supportedLanguageCount: Registry.getSupportedLanguageCodes().length,
      version: VERSION
    };
  }

  if (!text || !hasMeaningfulText(text)) {
    return {
      ok: false,
      language: "unknown",
      detectedLanguage: "unknown",
      confidence: 0,
      source: "empty_or_non_text",
      mixed: false,
      candidates: [],
      textLength: text.length,
      supportedLanguageCount: Registry.getSupportedLanguageCodes().length,
      version: VERSION
    };
  }

  const normalizedText = normalizeForDetection(text);
  const script = detectScriptLanguage(normalizedText);
  const rawCandidates = uniqueCandidates([...(script && script.candidates ? script.candidates : script ? [script] : []), ...scoreWordRules(normalizedText)]);
  const candidates = uniqueCandidates(adjustRomanceCandidates(normalizedText, rawCandidates));

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
  const mixed = shouldMarkMixed(top, second);
  const language = mixed ? "mixed" : top.language;

  return {
    ok: true,
    language,
    detectedLanguage: top.language,
    confidence: mixed ? Math.max(0.5, top.confidence - 0.06) : top.confidence,
    source: top.source || "heuristic",
    mixed,
    candidates: candidates.slice(0, MAX_CANDIDATES),
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

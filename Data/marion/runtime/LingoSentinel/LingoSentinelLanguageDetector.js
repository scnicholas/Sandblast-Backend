'use strict';

/**
 * LingoSentinelLanguageDetector
 * Lightweight backend-safe language detection for spontaneous public dialogue.
 *
 * Purpose:
 * - Provide fast source-language hints before provider translation.
 * - Never expose private Marion/Nyx internals to the browser.
 * - Support mixed-language detection without blocking delivery.
 *
 * This detector is intentionally heuristic. It is not the final authority when a
 * provider returns a stronger detected language. It exists to route requests,
 * choose a provider source hint, and protect public flows from hardcoded phrases.
 */

const VERSION = '2.1.0-spontaneous-language-detection';

const SCRIPT_RULES = Object.freeze([
  { code: 'ja', name: 'Japanese', rx: /[\u3040-\u30ff]/ },
  { code: 'ko', name: 'Korean', rx: /[\uac00-\ud7af]/ },
  { code: 'zh', name: 'Chinese', rx: /[\u4e00-\u9fff]/ },
  { code: 'ar', name: 'Arabic', rx: /[\u0600-\u06ff]/ },
  { code: 'he', name: 'Hebrew', rx: /[\u0590-\u05ff]/ },
  { code: 'hi', name: 'Hindi', rx: /[\u0900-\u097f]/ },
  { code: 'th', name: 'Thai', rx: /[\u0e00-\u0e7f]/ },
  { code: 'el', name: 'Greek', rx: /[\u0370-\u03ff]/ },
  { code: 'ru', name: 'Russian', rx: /[\u0400-\u04ff]/ }
]);

const WORD_RULES = Object.freeze([
  {
    code: 'fr',
    name: 'French',
    weight: 1.1,
    rx: /\b(?:bonjour|salut|merci|oui|non|avec|pour|dans|être|etre|clair|fâché|fache|comprendre|comprend|vraiment|quelqu(?:’|')?un|demain|aujourd'hui|réunion|reunion|équipe|equipe|voulais|dire|peux|pouvez|comment|ça|ca|va)\b|[àâçéèêëîïôûùüÿœæ]/i
  },
  {
    code: 'es',
    name: 'Spanish',
    weight: 1.05,
    rx: /\b(?:hola|gracias|sí|si|no|para|con|quiero|hablar|entiende|entender|mañana|equipo|reunión|reunion|cómo|como|estás|estas|buenos|buenas|ahora|claro)\b|[áéíóúñ¿¡]/i
  },
  {
    code: 'pt',
    name: 'Portuguese',
    weight: 1.0,
    rx: /\b(?:olá|ola|obrigado|obrigada|sim|não|nao|para|com|quero|falar|entende|amanhã|amanha|equipe|reunião|reuniao|como|você|voce|agora|claro)\b|[ãõáâêíóôúç]/i
  },
  {
    code: 'de',
    name: 'German',
    weight: 1.0,
    rx: /\b(?:hallo|danke|ja|nein|ich|möchte|moechte|sprechen|verstehen|morgen|team|besprechung|nicht|klar|bitte)\b|[äöüß]/i
  },
  {
    code: 'it',
    name: 'Italian',
    weight: 1.0,
    rx: /\b(?:ciao|grazie|sì|si|no|voglio|parlare|capisce|capire|domani|squadra|riunione|come|stai|chiaro)\b|[àèéìíîòóù]/i
  },
  {
    code: 'en',
    name: 'English',
    weight: 0.82,
    rx: /\b(?:hello|hi|thanks|thank|yes|no|with|for|want|speak|talk|understand|really|tomorrow|meeting|team|clear|angry|mean|how|are|you|please|now)\b/i
  }
]);

const LANGUAGE_ALIASES = Object.freeze({
  automatic: 'auto',
  autodetect: 'auto',
  'auto-detect': 'auto',
  english: 'en',
  french: 'fr',
  spanish: 'es',
  portuguese: 'pt',
  german: 'de',
  italian: 'it',
  japanese: 'ja',
  korean: 'ko',
  chinese: 'zh',
  mandarin: 'zh',
  arabic: 'ar',
  hindi: 'hi'
});

function safeString(value, fallback = '') {
  if (typeof value === 'string') return value;
  if (value === null || value === undefined) return fallback;
  return String(value);
}

function normalizeLanguage(value, fallback = 'auto') {
  const raw = safeString(value || fallback).trim();
  if (!raw) return fallback;
  const key = raw.toLowerCase().replace(/\s+/g, '-');
  return LANGUAGE_ALIASES[key] || key;
}

function clampText(value, max = 6000) {
  const text = safeString(value).replace(/\u0000/g, '').trim();
  return text.length > max ? text.slice(0, max) : text;
}

function hasMeaningfulText(text) {
  return /[\p{L}\p{N}]/u.test(safeString(text));
}

function detectScriptLanguage(text) {
  const matches = SCRIPT_RULES.filter(rule => rule.rx.test(text)).map(rule => ({
    language: rule.code,
    languageName: rule.name,
    confidence: 0.86,
    reason: 'script_match'
  }));

  if (!matches.length) return null;
  if (matches.length === 1) return matches[0];

  return {
    language: 'mixed',
    languageName: 'Mixed',
    confidence: 0.72,
    reason: 'multiple_script_match',
    candidates: matches
  };
}

function scoreWordRules(text) {
  const candidates = [];

  WORD_RULES.forEach(rule => {
    const matches = text.match(rule.rx);
    if (!matches) return;
    const density = Math.min(0.22, text.length ? matches.join('').length / Math.max(text.length, 1) : 0);
    candidates.push({
      language: rule.code,
      languageName: rule.name,
      confidence: Math.min(0.92, 0.48 + density + rule.weight * 0.16),
      reason: 'word_or_diacritic_match'
    });
  });

  return candidates.sort((a, b) => b.confidence - a.confidence);
}

function detectLanguage(input, options = {}) {
  const text = clampText(input, options.maxTextChars || 6000);
  const explicit = normalizeLanguage(options.sourceLanguage || options.language || 'auto', 'auto');

  if (explicit && explicit !== 'auto') {
    return {
      ok: true,
      language: explicit,
      detectedLanguage: explicit,
      confidence: 0.99,
      source: 'explicit',
      mixed: false,
      textLength: text.length,
      version: VERSION
    };
  }

  if (!text || !hasMeaningfulText(text)) {
    return {
      ok: false,
      language: 'unknown',
      detectedLanguage: 'unknown',
      confidence: 0,
      source: 'empty_or_non_text',
      mixed: false,
      textLength: text.length,
      version: VERSION
    };
  }

  const script = detectScriptLanguage(text);
  const wordCandidates = scoreWordRules(text);
  const candidates = [];
  if (script) {
    if (script.candidates) candidates.push(...script.candidates);
    else candidates.push(script);
  }
  candidates.push(...wordCandidates);

  if (!candidates.length) {
    return {
      ok: true,
      language: 'auto',
      detectedLanguage: 'auto',
      confidence: 0.25,
      source: 'provider_recommended',
      mixed: false,
      candidates: [],
      textLength: text.length,
      version: VERSION
    };
  }

  const top = candidates.sort((a, b) => b.confidence - a.confidence)[0];
  const unique = Array.from(new Map(candidates.map(item => [item.language, item])).values());
  const mixed = unique.length > 1 && unique[1] && top.confidence - unique[1].confidence < 0.12;

  return {
    ok: true,
    language: mixed ? 'mixed' : top.language,
    detectedLanguage: mixed ? top.language : top.language,
    confidence: mixed ? Math.max(0.5, top.confidence - 0.08) : top.confidence,
    source: top.reason || 'heuristic',
    mixed,
    candidates: unique.slice(0, 5),
    textLength: text.length,
    version: VERSION
  };
}

module.exports = {
  VERSION,
  detectLanguage,
  normalizeLanguage,
  clampText
};

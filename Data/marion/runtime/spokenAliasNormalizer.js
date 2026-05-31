'use strict';

/**
 * spokenAliasNormalizer.js
 *
 * Purpose:
 * Normalizes common speech-to-text mistakes before Marion/Nyx intent routing.
 * This protects project names like LanguageSphere, LingoLink, Nyx, and Marion
 * from being misheard and misrouted.
 */

const SPOKEN_ALIAS_RULES = [
  // LanguageSphere
  {
    canonical: 'LanguageSphere',
    aliases: [
      'language sphere',
      'languagesphere',
      'language fair',
      'language fare',
      'language fear',
      'language share',
      'language sheer',
      'language layer',
      'language there',
      'lingua sphere'
    ]
  },

  // LingoLink
  {
    canonical: 'LingoLink',
    aliases: [
      'lingo link',
      'lingolink',
      'lingo-link',
      'link o link',
      'lingu link',
      'language link',
      'lingo linkedin'
    ]
  },

  // Progression Shaping
  {
    canonical: 'progression shaping',
    aliases: [
      'progression shaping',
      'progression shipping',
      'progression shaving',
      'regression shaping',
      'progression refinement',
      'progression shaping refinement',
      'five turn progression',
      '5 turn progression',
      '5:10 progression',
      '5:10 regression',
      'five ten progression',
      'five ten regression',
      'after party run the 5:10 regression test',
      'after parity run the 5:10 progression test'
    ]
  },

  // Mic/Text Parity
  {
    canonical: 'mic-to-text parity',
    aliases: [
      'mic to text parity',
      'mic-text parity',
      'mike to text parity',
      'mike text parity',
      'microphone text parity',
      'voice text parity',
      'voice-to-text parity',
      'speech text parity',
      'after party',
      'after parity'
    ]
  },

  // Domain Confidence
  {
    canonical: 'domain confidence scoring',
    aliases: [
      'domain confidence',
      'domain confidence scoring',
      'domain scoring',
      'confidence scoring',
      'confidence score',
      'domain confident scoring',
      'domain confident',
      'domain competence',
      'domain competency'
    ]
  },

  // Nyx
  {
    canonical: 'Nyx',
    aliases: [
      'nyx',
      'nix',
      'nicks',
      'nick\'s',
      'nyx live',
      'nix live'
    ]
  },

  // Marion
  {
    canonical: 'Marion',
    aliases: [
      'marion',
      'mary in',
      'merry in',
      'merion',
      'marian',
      'marion bridge',
      'mary and bridge'
    ]
  },

  // Sandblast
  {
    canonical: 'Sandblast',
    aliases: [
      'sandblast',
      'sand blast',
      'sam blast',
      'sound blast',
      'sun blast',
      'sandblast channel',
      'sand blast channel'
    ]
  }
];

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeSpacing(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeSpokenAliases(input) {
  if (!input || typeof input !== 'string') return input;

  let output = normalizeSpacing(input);

  for (const rule of SPOKEN_ALIAS_RULES) {
    for (const alias of rule.aliases) {
      const pattern = new RegExp(`\\b${escapeRegExp(alias)}\\b`, 'gi');
      output = output.replace(pattern, rule.canonical);
    }
  }

  return normalizeSpacing(output);
}

function detectAliasHit(input) {
  if (!input || typeof input !== 'string') {
    return {
      hit: false,
      canonical: null,
      alias: null
    };
  }

  const normalized = normalizeSpacing(input).toLowerCase();

  for (const rule of SPOKEN_ALIAS_RULES) {
    for (const alias of rule.aliases) {
      const pattern = new RegExp(`\\b${escapeRegExp(alias.toLowerCase())}\\b`, 'i');

      if (pattern.test(normalized)) {
        return {
          hit: true,
          canonical: rule.canonical,
          alias
        };
      }
    }
  }

  return {
    hit: false,
    canonical: null,
    alias: null
  };
}

module.exports = {
  SPOKEN_ALIAS_RULES,
  normalizeSpokenAliases,
  detectAliasHit
};

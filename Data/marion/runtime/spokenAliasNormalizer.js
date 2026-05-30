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

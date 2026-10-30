'use strict';

const Contract = require('./MarionEcosystemContract');
const StateSpine = require('./MarionEcosystemStateSpine');

const VERSION = 'marion.ecosystemContextAssembler/2.0';

function clean(v, n = 160) {
  return String(v == null ? '' : v)
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, n);
}
function obj(v) { return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; }
function lang(v, fallback = 'en') {
  const s = clean(v || fallback, 32).toLowerCase().replace(/_/g, '-');
  if (/^(en|eng|english|en-ca|en-us|en-gb)/.test(s)) return 'en';
  if (/^(fr|fre|fra|french|français|francais|fr-ca|fr-fr)/.test(s)) return 'fr';
  if (/^(es|spa|spanish|español|espanol|es-mx|es-es|es-419)/.test(s)) return 'es';
  if (/^(auto|detect|unknown)/.test(s)) return 'auto';
  return s.slice(0, 16) || fallback;
}
function first(...values) { for (const v of values) if (v !== undefined && v !== null && String(v).trim() !== '') return v; return ''; }

function assemble(input = {}) {
  const source = Contract.normalizeComponent(input.source || 'nyx');
  const sessionId = clean(input.sessionId, 128);
  const existing = sessionId ? StateSpine.createContext(sessionId) : { session:{components:{}}, global:{} };
  const components = obj(existing.session && existing.session.components);
  const nyx = obj(components.nyx);
  const lingo = obj(components.lingosentinel);
  const nyxData = obj(nyx.data);
  const lingoData = obj(lingo.data);
  const incoming = obj(input.context);

  const sourceLanguage = lang(first(
    input.sourceLanguage,
    incoming.sourceLanguage,
    source === 'lingosentinel' ? lingoData.sourceLanguage : '',
    source === 'lingosentinel' ? lingo.language : '',
    nyxData.sourceLanguage,
    'en'
  ), 'en');

  const targetLanguage = lang(first(
    input.targetLanguage,
    incoming.targetLanguage,
    lingoData.targetLanguage,
    lingo.language,
    nyxData.targetLanguage,
    sourceLanguage
  ), sourceLanguage);

  const cultureContext = clean(first(
    input.cultureContext,
    incoming.cultureContext,
    lingoData.cultureContext,
    lingo.culture,
    nyxData.cultureContext,
    'general'
  ), 80) || 'general';

  const layer = clean(first(input.layer, incoming.layer, lingo.layer, lingoData.layer, 'language'), 40) || 'language';
  const mode = clean(first(input.mode, incoming.mode, lingo.mode, nyx.mode, 'one_to_one'), 40) || 'one_to_one';
  const speakerRole = clean(first(input.speakerRole, incoming.speakerRole, lingo.speaker, nyx.speaker, 'host'), 32) || 'host';
  const participantId = clean(first(input.participantId, incoming.participantId, lingo.participantId, nyx.participantId, 'host'), 128) || 'host';
  const conversationId = clean(first(input.conversationId, incoming.conversationId, lingo.conversationId, nyx.conversationId), 128);
  const roomId = clean(first(input.roomId, incoming.roomId, lingo.roomId, nyx.roomId, 'lingosentinel-main'), 128) || 'lingosentinel-main';

  const useLingo = input.useLingoSentinel === true || input.useLingo === true;
  const needsLingoSentinel = Boolean(
    useLingo ||
    source === 'lingosentinel' ||
    sourceLanguage !== 'en' ||
    targetLanguage !== 'en' ||
    cultureContext !== 'general' ||
    layer === 'culture'
  );

  return {
    contract: 'sandblast.marion.ecosystem-context/2.0',
    version: VERSION,
    sessionId,
    conversationId,
    roomId,
    source,
    sourceLanguage,
    targetLanguage,
    cultureContext,
    layer,
    mode,
    speakerRole,
    participantId,
    needsLingoSentinel,
    routeClass: needsLingoSentinel ? 'nyx-lingosentinel-marion' : 'nyx-marion',
    ecosystemState: existing,
    generatedAt: Date.now()
  };
}

function getHealth() {
  return { ok:true, service:'MarionEcosystemContextAssembler', version:VERSION, state:StateSpine.getHealth() };
}

module.exports = Object.freeze({ VERSION, assemble, getHealth, normalizeLanguage:lang });

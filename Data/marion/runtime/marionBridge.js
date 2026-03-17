// runtime/MarionBridge.js

const { runLayer3 } = require('./layer3');

// These should point to your actual layer 2 files.
// Adjust names if your project uses different retriever filenames.
const EmotionRetriever = require('./retrievers/EmotionRetriever');
const PsychologyRetriever = require('./retrievers/PsychologyRetriever');
const DomainRetriever = require('./retrievers/DomainRetriever');
const DatasetRetriever = require('./retrievers/DatasetRetriever');

function inferIntent(query = '') {
  const q = String(query).toLowerCase();

  if (/(analyze|break down|evaluate|assess|critical analysis)/.test(q)) return 'analysis';
  if (/(strategy|plan|roadmap|build|implement)/.test(q)) return 'strategy';
  if (/(research|study|dataset|source|evidence)/.test(q)) return 'research';
  return 'general';
}

function inferDomain(query = '', requestedDomain = '') {
  const raw = `${requestedDomain} ${query}`.toLowerCase();

  if (/(psych|emotion|mental|behavior|therapy|mood)/.test(raw)) return 'psychology';
  if (/(finance|stocks|market|economics|capital)/.test(raw)) return 'finance';
  if (/(law|legal|contract|court|bar)/.test(raw)) return 'law';
  if (/(english|writing|literature|essay|grammar)/.test(raw)) return 'english';
  if (/(cyber|security|network|threat)/.test(raw)) return 'cybersecurity';
  if (/(marketing|brand|copy|campaign|audience)/.test(raw)) return 'marketing';

  return 'general';
}

async function retrieveLayer2Signals({
  userQuery,
  domain,
  conversationState = {},
  datasets = []
}) {
  const emotion = await EmotionRetriever.retrieve({
    text: userQuery,
    conversationState
  });

  const psychology = await PsychologyRetriever.retrieve({
    text: userQuery,
    conversationState,
    emotion
  });

  const domainEvidence = await DomainRetriever.retrieve({
    query: userQuery,
    domain,
    conversationState
  });

  const datasetEvidence = await DatasetRetriever.retrieve({
    query: userQuery,
    domain,
    datasets,
    conversationState,
    emotion,
    psychology
  });

  return {
    intent: inferIntent(userQuery),
    domain,
    userQuery,
    conversationState,
    emotion,
    psychology,
    domainEvidence,
    datasetEvidence
  };
}

async function processWithMarion({
  userQuery,
  requestedDomain,
  conversationState = {},
  datasets = []
}) {
  const domain = inferDomain(userQuery, requestedDomain);

  const layer2Bundle = await retrieveLayer2Signals({
    userQuery,
    domain,
    conversationState,
    datasets
  });

  const layer3 = await runLayer3(layer2Bundle);

  return {
    ok: true,
    domain,
    marionPacket: layer3.fusionPacket,
    answerPlan: layer3.answerPlan
  };
}

module.exports = {
  processWithMarion
};

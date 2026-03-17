// runtime/layer5/PersistenceClassifier.js

function classifyPersistence(signals = {}) {
  const persistent = {};
  const transient = {};

  const domain = signals.domain || 'general';
  const intent = signals.intent || 'general';
  const primaryEmotion = signals.primaryEmotion || 'neutral';

  if (domain && domain !== 'general') {
    persistent.domain = domain;
  } else {
    transient.domain = domain;
  }

  if (intent === 'strategy' || intent === 'research' || intent === 'analysis') {
    persistent.intent = intent;
  } else {
    transient.intent = intent;
  }

  if (primaryEmotion !== 'neutral') {
    transient.primaryEmotion = primaryEmotion;
  }

  if ((signals.psychologyPatterns || []).length) {
    transient.psychologyPatterns = signals.psychologyPatterns;
  }

  if ((signals.psychologyNeeds || []).length) {
    transient.psychologyNeeds = signals.psychologyNeeds;
  }

  if ((signals.emotionalNeeds || []).length) {
    transient.emotionalNeeds = signals.emotionalNeeds;
  }

  if ((signals.evidenceTitles || []).length) {
    transient.evidenceTitles = signals.evidenceTitles;
  }

  persistent.responseMode = signals.responseMode || 'balanced';

  return {
    persistent,
    transient
  };
}

module.exports = {
  classifyPersistence
};

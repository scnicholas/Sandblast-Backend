// runtime/layer5/DomainContinuityEngine.js

function buildDomainContinuity({
  fusionPacket = {},
  previousMemory = {}
} = {}) {
  const currentDomain = fusionPacket.domain || 'general';
  const previousDomain = previousMemory.domain || 'general';

  return {
    previousDomain,
    currentDomain,
    maintained: currentDomain === previousDomain && currentDomain !== 'general',
    shifted: currentDomain !== previousDomain,
    preferredDomain: currentDomain !== 'general' ? currentDomain : previousDomain
  };
}

module.exports = {
  buildDomainContinuity
};

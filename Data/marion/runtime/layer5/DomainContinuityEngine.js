function buildDomainContinuity({
  fusionPacket = {},
  previousMemory = {}
} = {}) {
  const previousPersistent = previousMemory.persistent || {};
  const currentDomain = fusionPacket.domain || 'general';
  const previousDomain = previousMemory.domain || previousPersistent.domain || 'general';

  const maintained = currentDomain === previousDomain && currentDomain !== 'general';
  const shifted = previousDomain !== 'general' && currentDomain !== previousDomain;
  const degraded = currentDomain === 'general' && previousDomain !== 'general';

  const stableDomainStreak = maintained
    ? (Number(previousMemory.stableDomainStreak || 0) || 0) + 1
    : (currentDomain !== 'general' ? 1 : 0);

  return {
    previousDomain,
    currentDomain,
    maintained,
    shifted,
    degraded,
    preferredDomain: currentDomain !== 'general' ? currentDomain : previousDomain,
    stableDomainStreak
  };
}

module.exports = {
  buildDomainContinuity
};

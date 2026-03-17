function buildSafetyEnvelope({
  fusionPacket = {},
  responseMode = {},
  toneEnvelope = {},
  turnMemory = {},
  domainResponse = {}
} = {}) {
  const emotion = fusionPacket.emotion || {};
  const psychology = fusionPacket.psychology || {};
  const diagnostics = fusionPacket.diagnostics || {};

  const intensity = Number.isFinite(emotion.intensity) ? emotion.intensity : 0;
  const primaryEmotion = emotion.primaryEmotion || 'neutral';
  const evidenceKept = Number(diagnostics.evidenceKept || (fusionPacket.evidence || []).length || 0);
  const fallbackStreak = Number(turnMemory.fallbackStreak || 0);
  const repeatQueryStreak = Number(turnMemory.repeatQueryStreak || 0);
  const recoveryMode = turnMemory.recoveryMode || 'normal';

  const checks = [];
  const warnings = [];
  let safeToElaborate = true;

  checks.push('Do not contradict emotional acknowledgment with abrupt analysis.');
  checks.push('Do not ignore top-ranked evidence.');
  checks.push('Do not let tone drift outside the envelope.');
  checks.push('Do not repeat generic fallback language across degraded turns.');

  if (primaryEmotion !== 'neutral') {
    checks.push('Match emotional acknowledgment to the user state without mirroring excessively.');
  }

  if (intensity > 0.75) {
    checks.push('Lead with stabilization before dense reasoning.');
    warnings.push('High emotional intensity detected.');
  }

  if ((psychology.risks || []).length) {
    warnings.push(`Psychology risk markers: ${(psychology.risks || []).join(', ')}`);
  }

  if (evidenceKept < 2) {
    warnings.push('Evidence coverage is limited.');
    checks.push('Keep certainty bounded to available signal.');
  }

  if (fallbackStreak >= 2 || repeatQueryStreak >= 2 || recoveryMode === 'guided-recovery') {
    warnings.push('Recovery pressure detected.');
    checks.push('Prefer one clear next move over multi-branch response sprawl.');
  }

  if (domainResponse?.gapSignals?.thinReasoning) {
    checks.push('Do not inflate reasoning beyond the available chain.');
  }

  if (
    responseMode.mode === 'stabilizing' ||
    responseMode.mode === 'supportive-directive' ||
    responseMode.mode === 'recovery'
  ) {
    safeToElaborate = intensity < 0.88 && evidenceKept >= 1;
  }

  return {
    checks,
    warnings,
    safeToElaborate,
    forbidden: toneEnvelope.forbidden || [],
    recoveryMode
  };
}

module.exports = {
  buildSafetyEnvelope
};

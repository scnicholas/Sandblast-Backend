// runtime/layer4/SafetyEnvelope.js

function buildSafetyEnvelope({ fusionPacket = {}, responseMode = {}, toneEnvelope = {} } = {}) {
  const emotion = fusionPacket.emotion || {};
  const psychology = fusionPacket.psychology || {};

  const intensity = Number.isFinite(emotion.intensity) ? emotion.intensity : 0;
  const primaryEmotion = emotion.primaryEmotion || 'neutral';

  const checks = [];
  const warnings = [];
  let safeToElaborate = true;

  checks.push('Do not contradict emotional acknowledgment with abrupt analysis.');
  checks.push('Do not ignore top-ranked evidence.');
  checks.push('Do not let tone drift outside the envelope.');

  if (intensity > 0.75) {
    checks.push('Lead with stabilization before dense reasoning.');
    warnings.push('High emotional intensity detected.');
  }

  if ((psychology.risks || []).length) {
    warnings.push(`Psychology risk markers: ${(psychology.risks || []).join(', ')}`);
  }

  if (responseMode.mode === 'stabilizing' || responseMode.mode === 'supportive-directive') {
    safeToElaborate = intensity < 0.9;
  }

  return {
    checks,
    warnings,
    safeToElaborate,
    forbidden: toneEnvelope.forbidden || []
  };
}

module.exports = {
  buildSafetyEnvelope
};

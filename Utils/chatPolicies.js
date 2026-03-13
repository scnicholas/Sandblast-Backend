const ChatPolicies = require("./ChatPolicies");

const policy = ChatPolicies.buildPolicyEnvelope({
  text: norm.text,
  session,
  inbound: norm,
  chips: priorFollowUps,
  directives: priorDirectives,
  publicMode,
  activeLane: session.activeLane,
  recentReplies: session.recentReplies,
  emotionSignals,
  supportSignals,
  requestMeta: {
    retry: !!norm.retry
  }
});

if (policy.stop && policy.flags.shouldBlockDuplicate) {
  return makeBreakerReply();
}

if (policy.clarificationNeeded) {
  return {
    reply: policy.clarificationPrompt,
    activeLane: policy.lane,
    followUps: []
  };
}

// then route to resolver using:
// policy.resolver
// policy.action
// policy.inferredSlots

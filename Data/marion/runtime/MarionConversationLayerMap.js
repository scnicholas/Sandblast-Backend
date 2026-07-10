{
  "package_version": "marion_conversational_flow_package_v1",
  "six_domains": [
    "ai",
    "cyber",
    "english",
    "finance",
    "law",
    "psychology"
  ],
  "layers": [
    {
      "layer": 1,
      "name": "Input Capture",
      "required_files": [
        "MarionVoiceInputEnvelope.js",
        "voiceRoute.js"
      ],
      "purpose": "accept voice/text safely and preserve transcript-only metadata"
    },
    {
      "layer": 2,
      "name": "Identity / Authorization",
      "required_files": [
        "MarionVoiceAuthorizationGate.js",
        "MarionVoiceSpeakerIdentity.js",
        "MarionVoiceSpeakerRegistry.js"
      ],
      "purpose": "speaker evidence plus RBAC; identity is not authority"
    },
    {
      "layer": 3,
      "name": "Transcript Normalization",
      "required_files": [
        "MarionVoiceTranscriptNormalizer.js"
      ],
      "purpose": "clean transcript and stabilize voice/text parity"
    },
    {
      "layer": 4,
      "name": "Emotion Resolution",
      "required_files": [
        "MarionEmotionInterpreter.js",
        "base_labels.json",
        "conversation_patterns.json",
        "nuance_map.json",
        "emotion_analysis_schema.json"
      ],
      "purpose": "resolved state only; no raw phrase/pattern exposure"
    },
    {
      "layer": 5,
      "name": "Six-Domain Routing",
      "required_files": [
        "MarionDomainRouter.js",
        "marionSO.js"
      ],
      "purpose": "route AI/Cyber/English/Finance/Law/Psychology with caution flags"
    },
    {
      "layer": 6,
      "name": "Context Spine / Continuity",
      "required_files": [
        "MarionBridge.js",
        "chatEngine.js"
      ],
      "purpose": "carry topic, route, intent, and follow-up state"
    },
    {
      "layer": 7,
      "name": "Final Envelope",
      "required_files": [
        "MarionBridge.js",
        "chatEngine.js"
      ],
      "purpose": "single Marion final authority; Nyx-facing public answer"
    },
    {
      "layer": 8,
      "name": "Voice Output Policy",
      "required_files": [
        "MarionVoiceOutputPolicy.js",
        "MarionVoiceGateway.js",
        "MarionVoiceTelemetry.js"
      ],
      "purpose": "speak only when delivery is authorized; log safe telemetry"
    },
    {
      "layer": 9,
      "name": "TTS / Playback",
      "required_files": [
        "voiceRoute.js",
        "tts.js"
      ],
      "purpose": "provider-compatible speech output; degraded-safe fallback"
    },
    {
      "layer": 10,
      "name": "Observability / Governance",
      "required_files": [
        "MarionVoiceTelemetry.js",
        "SURGICAL_AUTOPSY_REPORT.md"
      ],
      "purpose": "trace health without raw audio, tokens, or private internals"
    }
  ],
  "missing_recommended_next": [
    "MarionVoiceChallengeVerifier.js",
    "MarionVoiceContinuityWindow.js",
    "NyxVoiceDeliveryStabilizer.js",
    "NyxSpeechSyncEnvelope.js",
    "production tts.js provider adapter",
    "production MarionBridge integration with existing hosted runtime"
  ]
}

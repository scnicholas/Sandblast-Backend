# Sandblast Backend — Nyx Voice Deployment Parity

This README belongs in the project root beside `index.js`.

```txt
sandblast backend/
├─ index.js
├─ README.md
├─ package.json
├─ Data/
└─ tests/
```

## Current voice route status

Nyx is the public route. Marion remains the internal authority.

Canonical POST route:

```txt
POST /api/nyx/voice/transcript
```

Compatibility POST alias:

```txt
POST /nyx/voice/transcript
```

Diagnostic GET routes:

```txt
GET /api/nyx/voice/transcript
GET /nyx/voice/transcript
GET /api/nyx/voice/transcript/health
GET /nyx/voice/transcript/health
```

GET is diagnostic only. Real voice turns must remain POST-only and transcript-only.

## Version markers to verify

After installing this package, `index.js` should expose:

```txt
index.js v2.18.40sb NYX-VOICE-README-ROOT-PACKAGE-HARDLOCK-V13
nyx.voiceTranscriptRoute/1.3-echoSuppressionReplyPromotionHardlock
nyx.voiceReplyPromotionHardlock/1.3
nyx.voiceDeploymentParity/1.3
nyx.voiceReadmeRootPackage/1.0
```

The diagnostic route should report:

```txt
getAliasNotFoundShield: true
runtimeFilesReady: true
readmeRootReady: true
audioStored: false
```

## Required Marion voice runtime files

These files must be committed and deployed with `index.js`:

```txt
Data/marion/runtime/MarionVoiceGateway.js
Data/marion/runtime/MarionVoiceInputEnvelope.js
Data/marion/runtime/MarionVoiceAuthorizationGate.js
Data/marion/runtime/MarionVoiceOutputPolicy.js
Data/marion/runtime/MarionVoiceTelemetry.js
Data/marion/runtime/MarionVoiceTranscriptNormalizer.js
```

## Required voice tests

```txt
tests/marion/marion-voice-input-envelope.test.js
tests/marion/marion-voice-authorization-gate.test.js
tests/marion/marion-voice-transcript-normalizer.test.js
tests/marion/marion-voice-output-policy.test.js
tests/marion/marion-voice-gateway-contract.test.js
tests/marion/marion-voice-public-boundary.test.js
tests/routes/nyx-voice-transcript-route-smoke.test.js
```

## Local checks

From the project root:

```powershell
node --check .\index.js
node .\tests\marion\marion-voice-input-envelope.test.js
node .\tests\marion\marion-voice-authorization-gate.test.js
node .\tests\marion\marion-voice-transcript-normalizer.test.js
node .\tests\marion\marion-voice-output-policy.test.js
node .\tests\marion\marion-voice-gateway-contract.test.js
node .\tests\marion\marion-voice-public-boundary.test.js
node .\tests\routes\nyx-voice-transcript-route-smoke.test.js
```

Optional live local POST smoke:

```powershell
$env:SB_TEST_VOICE_ROUTE_URL="http://localhost:3000/api/nyx/voice/transcript"
node .\tests\routes\nyx-voice-transcript-route-smoke.test.js
```

## Render checks

After Render deploys, run:

```powershell
$env:SB_TEST_VOICE_ROUTE_URL="https://sandblast-backend.onrender.com/api/nyx/voice/transcript"
node .\tests\routes\nyx-voice-transcript-route-smoke.test.js
```

Expected:

```txt
PASS nyx-voice-transcript-route-smoke
```

## Git flow

Do not force push. If GitHub rejects the push because local `main` is behind remote `main`, use:

```powershell
git fetch origin
git pull --rebase origin main
git push origin main
```

If conflicts appear, keep the `index.js` version containing:

```txt
NYX-VOICE-README-ROOT-PACKAGE-HARDLOCK-V13
NYX-VOICE-GET-HEALTH-ALIAS-V13
nyx.voiceTranscriptRoute/1.3-echoSuppressionReplyPromotionHardlock
nyx.voiceReplyPromotionHardlock/1.3
getAliasNotFoundShield
voiceEchoSuppressed
nonEmptyReplyHardlock
```

## Stage checklist

```powershell
git add index.js README.md `
  Data/marion/runtime/MarionVoiceAuthorizationGate.js `
  Data/marion/runtime/MarionVoiceGateway.js `
  Data/marion/runtime/MarionVoiceInputEnvelope.js `
  Data/marion/runtime/MarionVoiceOutputPolicy.js `
  Data/marion/runtime/MarionVoiceTelemetry.js `
  Data/marion/runtime/MarionVoiceTranscriptNormalizer.js `
  tests/marion/marion-voice-authorization-gate.test.js `
  tests/marion/marion-voice-gateway-contract.test.js `
  tests/marion/marion-voice-input-envelope.test.js `
  tests/marion/marion-voice-output-policy.test.js `
  tests/marion/marion-voice-public-boundary.test.js `
  tests/marion/marion-voice-transcript-normalizer.test.js `
  tests/routes/nyx-voice-transcript-route-smoke.test.js
```

Then:

```powershell
git commit -m "Add Marion voice lane runtime tests and deployment parity docs"
git pull --rebase origin main
git push origin main
```

## Architecture rule

```txt
User voice → Nyx public route → MarionVoiceGateway → MarionBridge → Nyx public reply
```

No raw audio storage. No direct public Marion route. No transcript echo. No blank public reply.

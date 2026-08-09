# Sandblast / Marion Baseline Freeze Toolkit v1

Canonical backend root:
`C:\Users\User\Desktop\sandblast backend`

Purpose:
Freeze the exact active backend state that passes:
`npm run verify:marion-round6`

Protected architectural conditions:
- Layer 24 hard stop remains intact.
- Layer 26 hard stop remains intact.
- Layer 28 hard stop remains intact.
- Layer 28 canonical path is:
  `Data\marion\runtime\metacognition`
- No Layer 29 is introduced.
- Execution remains disabled.
- Composer / final-reply authority remains intact.
- State Spine continuity remains intact.
- Canonical Nyx / TTS paths remain:
  - `utils\chatEngine.js`
  - `utils\tts.js`
  - `utils\ttsProvidersResemble.js`
  - `utils\voiceRoute.js`
  - `utils\nyxVoiceMount.js`
  - `utils\nyx_state_controller.js`
  - `public\nyx\sandblast_nyx_widget.html`
- Canonical Layer 27 tests remain:
  - `tests\marion\marionStrategicPlanner.test.js`
  - `tests\marion\marionLayer27Integration.test.js`

Toolkit scripts:
1. `CHECK_TOOLKIT_PREFLIGHT.ps1`
2. `RUN_BASELINE_CERTIFICATION.ps1`
3. `RUN_BASELINE_FREEZE.ps1`
4. `VERIFY_BASELINE_HASHES.ps1`
5. `COMPARE_TO_CERTIFIED_BASELINE.ps1`
6. `RESTORE_CERTIFIED_BASELINE.ps1`
7. `lib\BaselineFreeze.Common.ps1`

Generated baseline location:
`C:\Users\User\Desktop\sandblast backend\_certified_baselines\<timestamp>\`

A baseline contains:
- `snapshot\` — frozen backend copy
- `baseline-manifest.json` — SHA-256 file inventory
- `baseline-metadata.json` — certification and freeze metadata
- `CERTIFIED_BASELINE.txt` — marker file

Recommended sequence:
1. Integrate toolkit into `tools\baseline-freeze`.
2. Run preflight.
3. Run certification.
4. Freeze baseline.
5. Verify hashes immediately.
6. Keep baseline read-only in normal development.
7. Compare against it after future backend modifications.
8. Restore only when intentionally rolling back.

Important:
`RESTORE_CERTIFIED_BASELINE.ps1` is dry-run by default. It will not overwrite the
backend unless `-Apply` is supplied.

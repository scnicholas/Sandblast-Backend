<!-- README.md -->
# Nyx Avatar — Standalone Harness

## What this is
A clean, standalone avatar harness that runs **without**:
- widget code
- chat engine
- index.js

It includes:
- `avatar-controller.js` — state → render directive (“brain–body bridge”)
- `avatar-shell.js` — directive → DOM/CSS renderer (pure shell)
- `mock-consciousness.js` — mock Nyx states + amplitude simulation

## Run
Just open `index.html` in a browser.

## Next integration step (later)
Replace `mock-consciousness.js` with a real bridge:
- feed `cog` + `sessionPatch.__spine`
- feed audio amplitude from TTS playback analyser (WebAudio)

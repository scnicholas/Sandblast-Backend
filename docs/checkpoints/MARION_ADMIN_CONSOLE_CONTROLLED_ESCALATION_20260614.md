# Marion Admin Console Controlled Escalation — Documentation Checkpoint

Date: 2026-06-14  
Project: Sandblast Backend / Marion Admin Console  
Status: COMPLETE / LIVE PASS

## Summary

The Marion Admin Console controlled escalation chain has been stabilized, verified locally, pushed to GitHub, deployed through Render, and smoke-tested successfully in production.

The confirmed emergency contract is:

1. Issue short-lived admin session.
2. Issue escalation token using the short-lived session.
3. Trigger emergency using session token + escalation token only.
4. Do not send the master admin token on the emergency call.
5. Gateway must receive the required emergency confirmation phrase.
6. Nested gateway result must return emergency safe mode enabled.

## Verified Contract

Emergency route requires:

- `x-sb-marion-admin-session-token`
- `x-sb-marion-admin-escalation-token`
- `x-sb-marion-admin-console-confirm`
- `x-sb-marion-emergency-confirm`

Emergency route must not include:

- `x-sb-marion-admin-token`

Reason: master-token emergency calls are intentionally rejected by hardlock because emergency actions require a short-lived admin session.

## Final Confirmed Result

Local backend smoke:

- Session issue: PASS
- Escalation issue: PASS
- Emergency session-only route: PASS
- Gateway confirmation: PASS
- Nested gateway status: PASS
- Emergency triggered: TRUE

Render production smoke:

- Render boot: PASS
- Session issue: PASS
- Escalation issue: PASS
- Emergency route: PASS
- Nested gateway stage: `emergency_confirmed_safe_mode_enabled`
- Emergency triggered: TRUE

## Adjacent Route Health Checks

Confirmed adjacent route health:

- LingoSentinel token health: PASS
- Nyx voice transcript health: PASS
- LingoSentinel contact health: PASS if final contact route returned 200 OK

## Known Hardlocks

The following hardlocks are intentional and should not be loosened without review:

- Master admin token must not directly trigger emergency.
- Emergency requires short-lived session.
- Emergency requires escalation token.
- Emergency requires confirmation phrase.
- Diagnostics remain redacted.
- Admin headers remain controlled and explicit.
- Gateway nested failure must not be hidden as top-level success.

## Production Safety Notes

Do not commit local backup files, extracted patch folders, smoke-test scratch folders, or cache files.

Do not use local test secrets in Render.

Do not force-push this lane.

If future deploys fail with `Unexpected token '<<'`, immediately inspect `index.js` for Git conflict markers before redeploying.

## Checkpoint Label

MARION ADMIN CONSOLE CONTROLLED ESCALATION: COMPLETE

Emergency confirmation bridge: HARDLOCKED  
Session-only emergency contract: VERIFIED  
Render production smoke: PASSED  
Core adjacent health routes: PASSED  

/* Phase 2F widget byte-ceiling + marker test */
'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const html = fs.readFileSync(path.join(__dirname, '../../nyx_lingosentinel_phase2f_frontend_receive_render_hook.html'), 'utf8');
const bytes = Buffer.byteLength(html, 'utf8');
assert(bytes <= 49999, `Widget exceeds 49999 bytes: ${bytes}`);
assert(html.includes("mode:'live_translate'"), 'Frontend token mode must default to live_translate for canonical translation receive lane.');
assert(html.includes('window.LS2F'), 'Phase 2F frontend readiness marker missing.');
assert(html.includes('seen=new Set'), 'Duplicate receive suppression missing.');
assert(!html.includes('/api/lingosentinel/ably/sandbox-publish'), 'Legacy sandbox publish trigger must not run from public widget.');
assert(!html.includes('sendForm(f)'), 'Duplicate capture submit/send path should be removed so composer rendering remains intact.');
console.log(`PASS lingosentinel-phase2f-widget-receive-render-hook bytes=${bytes}`);

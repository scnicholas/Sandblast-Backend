/* Phase 2F widget script syntax extraction + guard test */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const widgetPath = path.join(
  __dirname,
  '../../nyx_lingosentinel_phase2f_frontend_receive_render_hook.html'
);

const html = fs.readFileSync(widgetPath, 'utf8');
const bytes = Buffer.byteLength(html, 'utf8');

assert(bytes <= 49999, `Widget exceeds 49,999-byte ceiling: ${bytes}`);
assert(html.includes('<!doctype html>'), 'Widget doctype is missing.');
assert(html.includes('/api/lingosentinel/token'), 'Token route hook is missing.');
assert(html.includes('/api/lingosentinel/publish'), 'Publish route hook is missing.');
assert(html.includes("mode:'live_translate'"), 'Token mode must stay live_translate.');
assert(html.includes('window.LS2F'), 'Phase 2F runtime readiness marker is missing.');
assert(!html.includes('ABLY_ROOT_API_KEY'), 'Frontend must not expose ABLY_ROOT_API_KEY.');
assert(!html.includes('SB_MARION_ADMIN'), 'Frontend must not expose Marion admin token names.');
assert(!html.includes('/api/lingosentinel/ably/sandbox-publish'), 'Public widget must not call sandbox publish.');

const scripts = [];
const scriptPattern = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
let match;
while ((match = scriptPattern.exec(html)) !== null) {
  const attrs = match[1] || '';
  const body = match[2] || '';
  if (/\bsrc\s*=/.test(attrs)) continue;
  if (body.trim()) scripts.push({ attrs, body });
}

assert(scripts.length >= 1, 'No inline widget script found.');

scripts.forEach((script, index) => {
  try {
    new vm.Script(script.body, {
      filename: `phase2f-widget-inline-script-${index + 1}.js`,
      displayErrors: true
    });
  } catch (error) {
    error.message = `Inline script ${index + 1} syntax failed: ${error.message}`;
    throw error;
  }
});

console.log(`PASS lingosentinel-phase2f-widget-syntax-extract scripts=${scripts.length} bytes=${bytes}`);

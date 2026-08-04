"use strict";

/**
 * scripts/widget-byte-certification.js
 *
 * Certifies the current Sandblast Nyx ecosystem widget without forcing it
 * into the historical three-script architecture.
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const CEILING = 49999;
const file = path.resolve(
  __dirname,
  "..",
  "public",
  "nyx",
  "sandblast_nyx_widget.html"
);

assert.ok(
  fs.existsSync(file),
  `Missing canonical Nyx widget: ${file}`
);

const html = fs.readFileSync(file, "utf8");
const bytes = Buffer.byteLength(html, "utf8");

assert.ok(
  bytes <= CEILING,
  `Widget exceeds ${CEILING.toLocaleString()}-byte ceiling: ${bytes}`
);

assert.match(
  html,
  /^<!doctype html>/i,
  "Widget must begin with an HTML5 doctype."
);

assert.strictEqual(
  /^(?:<<<<<<<|=======|>>>>>>>)/m.test(html),
  false,
  "Widget contains unresolved Git conflict markers."
);

const requiredMarkers = Object.freeze([
  "SB_NYX_WIDGET_TOKEN",
  'SB_NYX_STATE_CONTRACT="nyx.unifiedState/1.0"',
  'SB_NYX_SURFACE_PROFILE=W.SB_NYX_SURFACE_PROFILE||"public"',
  "SB_NYX_CONVERSATION_ENDPOINT",
  "SB_NYX_TTS_ENDPOINT",
  "SB_RESEMBLE_VOICE_UUID",
  "SB_NYX_RADIO_URL",
  "SB_NYX_TV_URL",
  "SB_NYX_ROKU_URL",
  "SB_NYX_NEWSCANADA_URL",
  "SB_NYX_SYNAPSE_URL",
  "SB_NYX_INFO_URL",
  "SB_TV_API_BASE",
  "publicSurfaceOnly:true",
  "operatorPersonalization:false",
  "allowPersonalName:false",
  "publicIdentityLock:true",
  "requireMarionFinal:true",
  "requireCleanPublicReply:true",
  "output_format=mp3",
  "voiceUuid=",
  "u.replace('/api/tts','/tts')",
  "a.src=x",
  "nyx:voice:",
  "nyx:guide:",
  "nyx:telemetry",
  "/api/nyx/ecosystem/bridge.js"
]);

for (const marker of requiredMarkers) {
  assert.ok(
    html.includes(marker),
    `Missing current Nyx architecture marker: ${marker}`
  );
}

for (const eventName of [
  "prestart",
  "start",
  "end",
  "error"
]) {
  assert.ok(
    new RegExp(
      `ve\\(['"]${eventName}['"](?:,|\\))`
    ).test(html),
    `Missing Nyx voice lifecycle event: ${eventName}`
  );
}

const requiredLanes = Object.freeze([
  "home",
  "search",
  "live",
  "watch",
  "roku",
  "canada",
  "news",
  "about"
]);

for (const lane of requiredLanes) {
  assert.ok(
    new RegExp(
      `data-lane=(?:"${lane}"|'${lane}'|${lane})(?:\\s|>)`
    ).test(html),
    `Missing Nyx navigation lane: ${lane}`
  );
}

const forbiddenPrivateMarkers = Object.freeze([
  "/api/private/marion/admin/",
  "directMarionAdminInterface",
  "marionAdminConversation",
  "CONFIRM_MARION_EMERGENCY",
  "adminToken",
  "runtimeToken",
  "emergencyConfirm"
]);

for (const marker of forbiddenPrivateMarkers) {
  assert.strictEqual(
    html.includes(marker),
    false,
    `Public Nyx widget contains private Marion marker: ${marker}`
  );
}

const scriptTags = [
  ...html.matchAll(
    /<script\b([^>]*)>([\s\S]*?)<\/script>/gi
  )
];

const inlineScripts = scriptTags.filter(
  (match) => !/\bsrc\s*=/.test(match[1])
);

const externalScripts = scriptTags.filter(
  (match) => /\bsrc\s*=/.test(match[1])
);

assert.strictEqual(
  scriptTags.length,
  5,
  "Current Nyx widget must retain five script tags."
);

assert.strictEqual(
  inlineScripts.length,
  4,
  "Current Nyx widget must retain four inline scripts."
);

assert.strictEqual(
  externalScripts.length,
  1,
  "Current Nyx widget must retain one external bridge script."
);

assert.match(
  externalScripts[0][1],
  /src\s*=\s*(?:"|')?https:\/\/sandblast-backend\.onrender\.com\/api\/nyx\/ecosystem\/bridge\.js/i,
  "External Nyx ecosystem bridge path is incorrect."
);

for (const [index, match] of inlineScripts.entries()) {
  assert.doesNotThrow(
    () => new Function(match[2]),
    `Inline script ${index + 1} contains invalid JavaScript.`
  );
}

const ids = [
  ...html.matchAll(
    /\bid=(?:"([^"]+)"|'([^']+)'|([^\s>]+))/gi
  )
].map((match) =>
  match[1] || match[2] || match[3]
);

const duplicates = ids.filter(
  (id, index) => ids.indexOf(id) !== index
);

assert.deepStrictEqual(
  [...new Set(duplicates)],
  [],
  "Widget contains duplicate element IDs."
);

for (const id of [
  "nyxDock",
  "nyxState",
  "cp",
  "ms",
  "inp",
  "send",
  "radio",
  "play",
  "featureMedia",
  "featVid",
  "mo",
  "vid",
  "premiumAd"
]) {
  assert.ok(
    ids.includes(id),
    `Missing required Nyx interface element: ${id}`
  );
}

console.log(
  JSON.stringify(
    {
      ok: true,
      certification:
        "nyx-current-widget-byte-and-architecture",
      file: path.basename(file),
      bytes,
      ceiling: CEILING,
      remaining: CEILING - bytes,
      scripts: {
        total: scriptTags.length,
        inline: inlineScripts.length,
        external: externalScripts.length
      },
      lanes: requiredLanes,
      uniqueIds: ids.length,
      publicPrivateBoundary: true,
      structuralIntegrity: true
    },
    null,
    2
  )
);

"use strict";
const assert = require("assert");
const router = require("../../Data/marion/runtime/marionIntentRouter.js");
const concierge = require("../../Data/marion/runtime/DomainConcierge.js");
const normalizer = require("../../Data/marion/runtime/marionCommandNormalizer.js");

const route = (text) => router.routeMarionIntent({ text, message: text, source: "sandblast_channel_widget", lane: "public_interface" });
const conciergeFn = concierge.runDomainConcierge || concierge.routeOrClarify || concierge.default;

const interfaceTurn = route("What is this Sandblast interface?");
assert.notStrictEqual(interfaceTurn && interfaceTurn.routing && interfaceTurn.routing.domain, "law", "interface turn must not be hijacked into law");

const financeTurn = route("Explain the finance layer roadmap");
assert.strictEqual(financeTurn && financeTurn.routing && financeTurn.routing.knowledgeDomain, "finance", "finance roadmap should preserve finance knowledge domain");

const lawTurn = route("Do I need a contract for licensing Sandblast movies?");
assert.strictEqual(lawTurn && lawTurn.routing && lawTurn.routing.domain, "law", "explicit legal/licensing question should route to law");

if (typeof conciergeFn === "function") {
  const c = conciergeFn({ text: "What is this Sandblast interface?", message: "What is this Sandblast interface?", lane: "public_interface" });
  assert.notStrictEqual(c && c.route, "law", "DomainConcierge must not law-hijack interface turns");
}

const packet = normalizer.normalizeCommand({
  text: "What is this Sandblast interface?",
  headers: { "x-sb-session-id": "s_test", "x-sb-turn-id": "t_test", "x-sb-trace-id": "r_test" },
  client: { site: "sandblast.channel", widget: "nyx-signal-engine", version: "v14.9" }
});
assert.strictEqual(packet.sessionId, "s_test");
assert.strictEqual(packet.turnId, "t_test");
assert.strictEqual(packet.traceId, "r_test");
assert.strictEqual(packet.client.site, "sandblast.channel");
assert.strictEqual(packet.meta.optionC, true);

console.log("Option C runtime regression passed");

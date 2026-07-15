"use strict";

const assert = require("assert");
const concierge = require("../Data/marion/runtime/DomainConcierge.js");
const chatEngine = require("../Utils/chatEngine.js");

const PUBLIC_BASE = Object.freeze({
  audience: "public",
  lane: "public_interface",
  presentationProfile: "public",
  publicSurfaceOnly: true,
  publicIdentityLock: true,
  source: "nyx_autopsy_regression"
});

const cases = [
  {
    prompt: "What can I watch on Sandblast?",
    expected: "media",
    mustFastReply: true
  },
  {
    prompt: "What movies are available?",
    expected: "media",
    mustFastReply: true
  },
  {
    prompt: "Can I watch that on Roku?",
    expected: "media",
    mustFastReply: true
  },
  {
    prompt: "Open Sandblast TV.",
    expected: "media",
    mustFastReply: false
  },
  {
    prompt: "What legal risks should a business consider?",
    expected: "law",
    mustFastReply: false
  },
  {
    prompt: "Can I legally distribute copyrighted movies on Roku?",
    expected: "law",
    mustFastReply: false
  }
];

function packet(prompt, extra = {}) {
  return {
    ...PUBLIC_BASE,
    text: prompt,
    message: prompt,
    userText: prompt,
    ...extra
  };
}

function visibleReply(value) {
  if (!value || typeof value !== "object") return "";
  return String(
    value.reply ||
    value.publicReply ||
    value.visibleReply ||
    value.displayReply ||
    value.text ||
    value.answer ||
    ""
  );
}

(async () => {
  for (const test of cases) {
    const input = packet(test.prompt);
    const routed = await concierge.runDomainConcierge(input);
    const route = String(
      routed && (routed.route || routed.domain || routed.primaryDomain) || ""
    ).toLowerCase();

    const lawProtocol =
      typeof concierge.buildR18CLawConciergeProtocol === "function"
        ? concierge.buildR18CLawConciergeProtocol(input, {})
        : null;

    const fast =
      typeof chatEngine.buildNyxPublicMediaDiscoveryFastReply === "function"
        ? chatEngine.buildNyxPublicMediaDiscoveryFastReply(input)
        : null;

    if (test.expected === "media") {
      assert.notStrictEqual(route, "law", `${test.prompt}: incorrectly routed to Law`);
      assert.ok(
        !lawProtocol || lawProtocol.active !== true,
        `${test.prompt}: R18C Law protocol activated`
      );
      if (test.mustFastReply) {
        assert.ok(fast, `${test.prompt}: public media fast reply was not created`);
        const reply = visibleReply(fast);
        assert.match(reply, /watch|tv|roku|cartoon|movie/i);
        assert.doesNotMatch(reply, /legal-risk triage|not legal advice|legal category/i);
        assert.strictEqual(fast.actionRequired, false);
        assert.strictEqual(fast.validateAction, false);
      }
    } else {
      assert.ok(
        route === "law" || (lawProtocol && lawProtocol.active === true),
        `${test.prompt}: explicit Law intent was not preserved`
      );
      assert.strictEqual(fast, null, `${test.prompt}: legal/media prompt used media fast path`);
    }

    console.log(JSON.stringify({
      prompt: test.prompt,
      route,
      lawActive: !!(lawProtocol && lawProtocol.active),
      mediaFastPath: !!fast,
      reply: fast ? visibleReply(fast) : ""
    }));
  }

  console.log("PASS: current-turn Media/Law authority regression suite");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});

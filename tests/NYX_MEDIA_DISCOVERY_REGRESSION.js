"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

const ROOT = path.resolve(__dirname, "..");
const publicPacket = (text) => ({
  audience: "public",
  lane: "public_interface",
  presentationProfile: "public",
  publicSurfaceOnly: true,
  publicIdentityLock: true,
  text
});

function check(condition, message) {
  assert.ok(condition, message);
  console.log(`PASS: ${message}`);
}

function extractFunction(source, name, nextName) {
  const startToken = `function ${name}`;
  const start = source.indexOf(startToken);
  if (start < 0) throw new Error(`Missing function ${name}`);
  const endToken = nextName ? `\nfunction ${nextName}` : null;
  const end = endToken ? source.indexOf(endToken, start) : -1;
  if (end < 0) throw new Error(`Missing end marker after ${name}`);
  return source.slice(start, end);
}

(async () => {
  const domainRouter = require(path.join(ROOT, "Utils", "domainRouter.js"));
  const domainConcierge = require(path.join(ROOT, "Data", "marion", "runtime", "DomainConcierge.js"));
  const composer = require(path.join(ROOT, "Data", "marion", "runtime", "composeMarionResponse.js"));
  const chatEngine = require(path.join(ROOT, "Utils", "chatEngine.js"));

  const discovery = publicPacket("What can I watch?");
  const rokuDiscovery = publicPacket("Can I get that on Roku?");
  const tvNavigation = publicPacket("Open Sandblast TV");
  const rokuNavigation = publicPacket("Go to Roku");
  const legal = publicPacket("What legal risks should a business consider?");

  const drDiscovery = domainRouter.routeDomain(discovery, {}, {}, {});
  check(drDiscovery.intent === "media_discovery", "DomainRouter classifies media discovery");
  check(drDiscovery.actionRequired === false && drDiscovery.validateAction === false, "DomainRouter keeps discovery answer-only");

  const drRoku = domainRouter.routeDomain(rokuDiscovery, {}, {}, {});
  check(drRoku.intent === "roku_discovery", "DomainRouter classifies Roku availability as discovery");
  check(drRoku.actionRequired === false, "Roku discovery does not create an executable action");

  const drNav = domainRouter.routeDomain(tvNavigation, {}, {}, {});
  check(drNav.intent === "media_navigation" && drNav.actionRequired === true, "DomainRouter preserves explicit TV navigation");

  const dcDiscovery = domainConcierge.runDomainConcierge(discovery, {});
  check(dcDiscovery.intent === "media_discovery", "DomainConcierge preserves discovery intent");
  check(dcDiscovery.validateAction === false && dcDiscovery.needsClarifier === false, "DomainConcierge skips validation and clarifier for discovery");

  const cmDiscovery = await Promise.resolve(composer.composeMarionResponse({}, discovery));
  check(cmDiscovery.actionRequired === false && cmDiscovery.validateAction === false, "Composer marks discovery as answer-only");
  check(!cmDiscovery.guideActionPlan && Array.isArray(cmDiscovery.guideActions) && cmDiscovery.guideActions.length === 0, "Composer removes discovery action plans");
  check(/Sandblast TV/i.test(cmDiscovery.reply) && /Roku/i.test(cmDiscovery.reply), "Composer returns the expected viewing answer");
  check(!/route is unavailable|legal-risk triage|not legal advice/i.test(cmDiscovery.reply), "Composer blocks route-unavailable and Law contamination");

  const cmNav = await Promise.resolve(composer.composeMarionResponse({}, rokuNavigation));
  check(cmNav.actionRequired === true && cmNav.validateAction === true, "Composer keeps explicit Roku navigation executable");
  check(cmNav.guideActionPlan && cmNav.guideActionPlan.actions.length === 1, "Navigation creates exactly one guide action");

  const started = Date.now();
  const ceDiscovery = await Promise.resolve(chatEngine.handleChat(discovery));
  const elapsed = Date.now() - started;
  check(elapsed < 500, `ChatEngine deterministic discovery path completes locally in ${elapsed} ms`);
  check(ceDiscovery.actionRequired === false && ceDiscovery.validateAction === false, "ChatEngine discovery response cannot trigger validation");
  check(Array.isArray(ceDiscovery.guideActions) && ceDiscovery.guideActions.length === 0, "ChatEngine discovery response contains no guide actions");

  check(domainRouter.classifyNyxPublicMediaDiscoveryNavigation(legal) === null, "Explicit Law prompts are not hijacked by media routing");
  check(domainConcierge.classifyNyxPublicMediaDiscoveryNavigationConcierge(legal) === null, "DomainConcierge leaves explicit Law prompts untouched");
  check(composer.classifyNyxPublicMediaDiscoveryNavigationFinal(legal) === null, "Composer leaves explicit Law prompts untouched");

  const indexSource = fs.readFileSync(path.join(ROOT, "index.js"), "utf8");
  const normalizeFn = extractFunction(indexSource, "normalizeFastPathText", "buildNyxPublicFastPathDecision");
  const decisionFn = extractFunction(indexSource, "buildNyxPublicFastPathDecision", "buildNyxPublicFastPathResponse");
  const sandbox = {
    cleanText: (v) => String(v == null ? "" : v).replace(/\s+/g, " ").trim(),
    lower: (v) => String(v == null ? "" : v).replace(/\s+/g, " ").trim().toLowerCase(),
    isNyxPublicSurfaceRequest: () => true
  };
  vm.createContext(sandbox);
  vm.runInContext(`${normalizeFn}\n${decisionFn}\nthis.decision = buildNyxPublicFastPathDecision;`, sandbox);

  const idxDiscovery = sandbox.decision(discovery);
  check(idxDiscovery && idxDiscovery.intent === "media_discovery", "index.js public fast path catches media discovery");
  check(idxDiscovery.actionRequired === false && !idxDiscovery.target, "index.js discovery fast path has no navigation target");

  const idxRoku = sandbox.decision(rokuDiscovery);
  check(idxRoku && idxRoku.intent === "roku_discovery", "index.js public fast path catches Roku discovery");
  check(idxRoku.validateAction === false && !idxRoku.target, "index.js Roku discovery cannot trigger validation");

  const idxNav = sandbox.decision(tvNavigation);
  check(idxNav && idxNav.intent === "navigation" && idxNav.target === "sandblast_tv", "index.js preserves explicit TV navigation");

  check(indexSource.includes("actionValidationRequired: validateAction"), "index.js projects action-validation state explicitly");
  check(indexSource.includes("mediaDiscoveryNavigationSplit: true"), "index.js marks the corrected fast path");

  console.log("\nALL NYX MEDIA DISCOVERY / NAVIGATION REGRESSION TESTS PASSED");
})().catch((error) => {
  console.error("\nFAIL:", error && error.stack || error);
  process.exit(1);
});

"use strict";

const assert = require("assert");
const path = require("path");
const fs = require("fs");

const root = path.join(__dirname, "..");
const dc = require(path.join(root, "Data/marion/runtime/domainConfidence.js"));
const dr = require(path.join(root, "Utils/domainRouter.js"));
const mr = require(path.join(root, "Data/marion/runtime/marionIntentRouter.js"));
const concierge = require(path.join(root, "Data/marion/runtime/DomainConcierge.js"));
const comp = require(path.join(root, "Data/marion/runtime/composeMarionResponse.js"));
const fe = require(path.join(root, "Data/marion/runtime/marionFinalEnvelope.js"));
const adapter = require(path.join(root, "adapters/guardian.response.adapter.js"));
const chat = require(path.join(root, "Utils/chatEngine.js"));

function get(obj, dotted) {
  return dotted.split(".").reduce((node, key) => node && node[key], obj);
}

function assertLawAgreement(id, text, expectedCategory) {
  const packet = { text, userText: text, rawUserText: text };
  const conf = dc.buildDomainConfidenceProfile(packet);
  const intent = mr.routeMarionIntent(packet);
  const router = dr.routeDomain(packet, {}, {}, {});
  const conc = concierge.runDomainConcierge(packet);
  const klass = comp.marionR18CLawClassify(packet);

  assert.strictEqual(conf.primaryDomain, "law", `${id}: domainConfidence primary`);
  assert.strictEqual(get(intent, "routing.domain"), "law", `${id}: intent routing domain`);
  assert.strictEqual(get(intent, "marionIntent.knowledgeDomain"), "law", `${id}: intent knowledgeDomain`);
  assert.strictEqual(get(intent, "routing.domainConciergeSeed.route"), "law", `${id}: seed route`);
  assert.strictEqual(get(intent, "routing.domainConciergeSeed.primaryDomain"), "law", `${id}: seed primaryDomain`);
  assert.strictEqual(router.primary, "law", `${id}: domainRouter primary`);
  assert.strictEqual(conc.route || get(conc, "routing.domain"), "law", `${id}: DomainConcierge route`);
  assert.strictEqual(klass.active, true, `${id}: composer law classifier active`);
  assert.strictEqual(klass.technicalLawFileWork, false, `${id}: not technical law-file work`);
  assert.strictEqual(klass.legalCategory, expectedCategory, `${id}: legal category`);
}

assertLawAgreement(
  "copyright_roku",
  "Can I use copyrighted movies on my Roku channel if I have paperwork?",
  "copyright_licensing"
);
assertLawAgreement(
  "privacy_vendor",
  "A vendor has customer data. What should I check in the agreement?",
  "privacy_data"
);
assertLawAgreement(
  "employment_release",
  "I was fired and they gave me a release to sign. Is two weeks fair?",
  "employment_contractor"
);
assertLawAgreement(
  "defamation_business",
  "Someone posted false claims about my business online. What can I do?",
  "liability_dispute"
);
assertLawAgreement(
  "source_verification",
  "What sources should I check to verify this law?",
  "source_verification"
);
assertLawAgreement(
  "distribution_rights",
  "If the contract says I own the distribution rights, am I safe to monetize it?",
  "copyright_licensing"
);
assertLawAgreement(
  "sandblast_liability",
  "Could this create liability for Sandblast?",
  "liability_dispute"
);

{
  const text = "Run a surgical autopsy on the law manifest files.";
  const packet = { text, userText: text, rawUserText: text };
  const conf = dc.buildDomainConfidenceProfile(packet);
  const intent = mr.routeMarionIntent(packet);
  const router = dr.routeDomain(packet, {}, {}, {});
  const conc = concierge.runDomainConcierge(packet);
  const klass = comp.marionR18CLawClassify(packet);
  assert.strictEqual(conf.primaryDomain, "technical", "technical law-file work: confidence");
  assert.strictEqual(get(intent, "routing.domain"), "technical", "technical law-file work: intent");
  assert.strictEqual(router.primary, "technical", "technical law-file work: router");
  assert.strictEqual(conc.route || get(conc, "routing.domain"), "technical", "technical law-file work: concierge");
  assert.strictEqual(klass.active, false, "technical law-file work: law classifier inactive");
  assert.strictEqual(klass.technicalLawFileWork, true, "technical law-file work: guard active");
}

{
  const packet = {
    text: "Next steps.",
    previousMemory: { activeFeatureLane: "law", lastTopic: "copyright licensing" },
    routing: { domain: "law", knowledgeDomain: "law" }
  };
  assert.strictEqual(dc.buildDomainConfidenceProfile(packet).primaryDomain, "law", "short prompt law carry: confidence");
  assert.strictEqual(get(mr.routeMarionIntent(packet), "routing.domain"), "law", "short prompt law carry: intent");
  assert.strictEqual(concierge.runDomainConcierge(packet).route, "law", "short prompt law carry: concierge");
}

{
  const packet = {
    text: "Can I use copyrighted movies on my Roku channel if I have paperwork?",
    reply: "I can give general legal information, not legal advice."
  };
  const env = fe.marionR18CFinalEnvelopeApply(packet);
  const adapted = adapter.marionR18CFinalEnvelopeApply(packet);
  assert.strictEqual(env.legalCategory, "copyright_licensing", "final envelope category");
  assert.strictEqual(env.noLegalCertaintyClaim, true, "final envelope no legal certainty");
  assert.strictEqual(env.noAttorneyClientRelationship, true, "final envelope no attorney-client");
  assert.strictEqual(adapted.legalCategory, "copyright_licensing", "adapter category");
}

{
  const lawManifest = path.join(root, "Data/Domains/law/manifest.json");
  assert.ok(fs.existsSync(lawManifest), "law content manifest included");
  const manifest = JSON.parse(fs.readFileSync(lawManifest, "utf8"));
  for (const rel of manifest.defaultLoadOrder || []) {
    assert.ok(fs.existsSync(path.join(root, "Data/Domains/law", rel)), `law payload exists: ${rel}`);
  }
}

{
  const transport = chat.marionR18CFullStackTransportProfile({
    text: "Could this create liability for Sandblast?"
  });
  assert.strictEqual(transport.active, true, "chat engine transport R18C active");
  assert.strictEqual(transport.domain, "law", "chat engine transport domain");
}

console.log("R18C full-stack regression smoke test passed.");

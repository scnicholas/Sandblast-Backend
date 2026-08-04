"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const root = path.resolve(__dirname, "..", "..");
function fromRoot(...parts) { return path.join(root, ...parts); }

const timezone = require(fromRoot("Utils", "timezoneResolver.js"));
const tone = require(fromRoot("runtime", "layer4", "ToneEnvelopeBuilder.js"));
const topic = require(fromRoot("runtime", "layer5", "TopicThreadTracker.js"));
const memory = require(fromRoot("runtime", "layer5", "MemorySignalExtractor.js"));
const persistence = require(fromRoot("runtime", "layer5", "PersistenceClassifier.js"));
const reset = require(fromRoot("runtime", "layer5", "ResetGuard.js"));
const planner = require(fromRoot("utils", "responsePlanner.js"));
const layerMap = require(fromRoot("Data", "marion", "maps", "MarionConversationLayerMap.js"));
const fixture = require(fromRoot("tests", "fixtures", "languagesphere-fallback-cases.js"));
const builder = require(fromRoot("Scripts", "build_marion_psychology_index.js"));

assert.strictEqual(timezone.resolveTimezone("What time is it in Toronto?").tz, "America/Toronto");
assert.strictEqual(timezone.resolveTimezone("What time is it in LA?").tz, "America/Los_Angeles");
assert.strictEqual(timezone.resolveTimezone("for me", {}, "Europe/London").tz, "Europe/London");
assert.strictEqual(timezone.resolveTimezone("ordinary language words").source, "default");

const tonePacket = tone.buildToneEnvelope({
  fusionPacket: {
    domain: "psychology",
    emotion: {
      primaryEmotion: "anxiety",
      intensity: 0.8,
      suppressionSignals: ["guarded"],
      blendProfile: { guardedness: 0.9 }
    }
  },
  responseMode: { mode: "recovery" },
  turnMemory: { fallbackStreak: 2 }
});
assert(tonePacket.directives.some((item) => /low-pressure/i.test(item)));
assert(tonePacket.forbidden.includes("generic filler"));
assert(tonePacket.forbidden.includes("performative empathy"));

const repeated = topic.buildTopicThread({ userQuery: "Next steps", previousMemory: { lastQuery: "Next steps" } });
assert.strictEqual(repeated.exactRepeat, true);
assert.strictEqual(repeated.threadStrength, "strong");
const continued = topic.buildTopicThread({
  userQuery: "Continue the backend path repair",
  previousMemory: { lastQuery: "backend path repair next" }
});
assert.strictEqual(continued.continued, true);

assert.strictEqual(typeof memory.extractMemorySignals, "function");
assert.strictEqual(typeof persistence.classifyPersistence, "function");
assert.strictEqual(typeof reset.buildResetGuard, "function");
assert.strictEqual(typeof planner.planResponse, "function");
assert(layerMap && typeof layerMap === "object");
assert.strictEqual(fixture.meta.authority, "marion");
assert(Array.isArray(fixture.phase1To5StabilityCases));

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sandblast-psychology-builder-"));
fs.mkdirSync(path.join(tempRoot, "Data", "marion", "manifests"), { recursive: true });
fs.mkdirSync(path.join(tempRoot, "Data", "psychology"), { recursive: true });
fs.writeFileSync(path.join(tempRoot, "Data", "marion", "manifests", "psychology_manifest.json"), JSON.stringify({
  version: "test",
  outputs: { compiledIndex: "Data/marion/compiled/psychology_compiled.json" },
  sources: [{
    id: "affect",
    name: "Affect",
    path: "Data/psychology/affect.json",
    subdomain: "affect",
    priority: 1,
    enabled: true,
    critical: true,
    purpose: "test"
  }]
}, null, 2));
fs.writeFileSync(path.join(tempRoot, "Data", "psychology", "affect.json"), JSON.stringify([
  { id: "same", title: "Anxiety", summary: "A", supportMode: "steady", routeBias: "clarify" },
  { id: "same", title: "Duplicate", summary: "B", supportMode: "steady", routeBias: "clarify" }
], null, 2));
const built = builder.buildPsychologyIndex({ root: tempRoot, verbose: false });
assert.strictEqual(built.compiled.records.length, 1);
assert(fs.existsSync(built.outputPath));
assert.throws(() => builder.resolveInsideRoot(tempRoot, "../escape.json"), /escapes the backend root/);
fs.rmSync(tempRoot, { recursive: true, force: true });

function findInstalledSaveArticles() {
  const canonical = fromRoot("Scripts", "news-canada-live-scraper", "saveArticles.js");
  const candidates = [];

  function walk(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (["node_modules", ".git"].includes(entry.name) || /^backup/i.test(entry.name) || /^archive/i.test(entry.name)) continue;
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (entry.name !== "scrapeNewsCanada.js") continue;
      const folder = path.dirname(full);
      const required = ["config.js", "utils.js", "saveArticles.js"];
      if (required.every((name) => fs.existsSync(path.join(folder, name)))) {
        candidates.push(path.join(folder, "saveArticles.js"));
      }
    }
  }

  walk(root);
  const unique = [...new Set(candidates)];
  if (unique.length === 1) return unique[0];
  if (fs.existsSync(canonical)) return canonical;
  throw new Error(`Expected one cohesive saveArticles.js path; found ${unique.length}.`);
}

const saveSource = findInstalledSaveArticles();
const saveTemp = fs.mkdtempSync(path.join(os.tmpdir(), "sandblast-save-articles-"));
const outDir = path.join(saveTemp, "output");
fs.copyFileSync(saveSource, path.join(saveTemp, "saveArticles.js"));
fs.writeFileSync(path.join(saveTemp, "config.js"), `const path=require("path"); module.exports={NEWS_CANADA_CONFIG:{outputDir:${JSON.stringify(outDir)},outputFile:"stories.json"}};`);
fs.writeFileSync(path.join(saveTemp, "utils.js"), `const fs=require("fs"); module.exports={ensureDir:(p)=>fs.mkdirSync(p,{recursive:true}),writeJson:(p,v)=>fs.writeFileSync(p,JSON.stringify(v,null,2))};`);
const saveModule = require(path.join(saveTemp, "saveArticles.js"));
const savedPath = saveModule.saveArticles({ stories: [{ headline: "Story", description: "Body", link: "https://example.com/story" }] });
const saved = JSON.parse(fs.readFileSync(savedPath, "utf8"));
assert.strictEqual(saved.count, 1);
assert.strictEqual(saved.articles[0].title, "Story");
assert.strictEqual(saved.items.length, 1);
fs.rmSync(saveTemp, { recursive: true, force: true });

console.log("FULL QUEUE REGRESSION: PASS");

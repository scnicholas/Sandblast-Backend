
"use strict";
const assert = require("assert");
const path = require("path");

const files = [
  "../Data/marion/runtime/composeMarionResponse.js",
  "../Data/marion/runtime/marionBridge.js",
  "../Data/marion/runtime/marionFinalEnvelope.js",
  "../Data/marion/runtime/MarionAdminConsoleGateway.js",
  "../Data/marion/runtime/progressionMemory.js",
  "../Data/marion/runtime/progressionShape.js",
  "../Data/marion/runtime/marionIntentRouter.js",
  "../Data/marion/runtime/DomainConcierge.js",
  "../Data/marion/runtime/domainConfidence.js",
  "../Utils/stateSpine.js"
];

const generic = "Continue Priority 9I: preserve the 9H continuity foundation, read the current pressure shift, update operational risk and execution mode, then give the safest next action. Keep Priority 9J staged until next-move authority is explicitly needed.";
const cases = [
  ["What is the risk now?", "risk now is", "premature escalation"],
  ["Slow down.", "slow down", "pace control"],
  ["Go deeper.", "go deeper means", "pressure-specific analysis"],
  ["Do the safest next move.", "safest next move is", "pressure-handling lane"],
  ["No, not that — stay on the architecture.", "correction received", "stay on the architecture"],
  ["This is urgent.", "urgency detected", "rushing into 9J"],
  ["We need to pivot.", "pivot received", "directional"]
];

let assertions = 0;
for (const file of files) {
  const mod = require(file);
  assert.strictEqual(mod.PRIORITY_9I_R2A_ALT_PRESSURE_SPECIFIC_FINAL_OVERRIDE_PATCH, true, file + " missing R2A marker");
  assert.strictEqual(typeof mod.priority9IR2AAltPressureSpecificFinal, "function", file + " missing final override helper");
  for (const [prompt, a, b] of cases) {
    const out = mod.priority9IR2AAltPressureSpecificFinal(prompt, generic);
    assert.strictEqual(typeof out, "string", file + " returned non-string for " + prompt);
    assert(out.includes("Priority 9I"), file + " did not stay in 9I for " + prompt + ": " + out);
    assert(out.toLowerCase().includes(a.toLowerCase()), file + " missing first pressure-specific marker for " + prompt + ": " + out);
    assert(out.toLowerCase().includes(b.toLowerCase()), file + " missing second pressure-specific marker for " + prompt + ": " + out);
    assert(!/^Continue Priority 9I: preserve the 9H continuity foundation/.test(out), file + " allowed generic template for " + prompt);
    if (!/Priority 9J\s+staged|9J remains staged|9J still staged|keep 9J staged|keeping Priority 9J staged/i.test(out)) {
      assert(!/Priority 9J: proactive operational guidance/.test(out), file + " activated 9J for " + prompt);
    }
    assertions += 1;
  }
}

const indexText = require("fs").readFileSync(path.join(__dirname, "../index.js"), "utf8");
assert(indexText.includes("priority9IR2AAltPressureSpecificFinal(prompt, approvedReply)"), "index invokeMarionAdminTextRuntime does not force R2A after voice approval");
assert(indexText.includes("priority9IR2AAltPressureSpecificFinal(prompt, runtime.reply || \"\")"), "index handleMarionAdminTextRuntime does not force R2A on runtime reply");
assert(indexText.includes("function marionAdminConversationSafeReply(packet, prompt, err)") && indexText.includes("priority9IR2AAltPressureSpecificFinal(prompt, raw)"), "conversation safe reply does not force R2A");

console.log(JSON.stringify({
  ok: true,
  tests: assertions + 3,
  hotfix: "Priority 9I-R2A ALT pressure-specific final override",
  altOverride: true,
  riskReply: require("../Data/marion/runtime/MarionAdminConsoleGateway.js").priority9IR2AAltPressureSpecificFinal("What is the risk now?", generic)
}, null, 2));

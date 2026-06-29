"use strict";

function node(prompt){
  const t=String(prompt||"").toLowerCase().replace(/\s+/g," ").trim();
  if(/\b(you\s+still\s+there|still\s+there|are\s+you\s+there|you\s+with\s+me|still\s+with\s+me|can\s+you\s+hear\s+me|are\s+we\s+still\s+connected|did\s+you\s+freeze|no\s+response|you\s+went\s+quiet|still\s+freezing|froze|frozen|not\s+responding)\b/.test(t)) return "presence_check";
  if(/\b(how\s+are\s+you|how\s+you\s+doing|you\s+ok(?:ay)?|you\s+good)\b/.test(t)) return "social_checkin";
  if((/\b(good\s+morning|hello|hi|hey|morning)\b/.test(t)&&/\bmarion\b/.test(t))||/^\s*(hi|hey|hello|morning)\s*$/.test(t)) return "greeting";
  return "standard";
}

const checks = {
  "You still there?": "presence_check",
  "Are you there?": "presence_check",
  "You with me?": "presence_check",
  "Did you freeze?": "presence_check",
  "How are you?": "social_checkin",
  "Hey Marion, how are you?": "social_checkin",
  "Hi Marion": "greeting",
  "Good morning Marion": "greeting"
};

for (const [prompt, expected] of Object.entries(checks)) {
  const actual = node(prompt);
  if (actual !== expected) {
    throw new Error(`${prompt} classified as ${actual}, expected ${expected}`);
  }
}

console.log("PASS R12/R13 presence route boundary smoke test");

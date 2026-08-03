"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");

function normalize(value) {
  return String(value == null ? "" : value)
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function replyOf(packet) {
  const src = packet && typeof packet === "object" ? packet : {};
  const payload = src.payload && typeof src.payload === "object" ? src.payload : {};
  const envelope = src.finalEnvelope && typeof src.finalEnvelope === "object"
    ? src.finalEnvelope
    : payload.finalEnvelope && typeof payload.finalEnvelope === "object"
      ? payload.finalEnvelope
      : {};
  for (const value of [
    src.directReply,
    src.visibleReply,
    src.displayReply,
    src.finalReply,
    src.reply,
    src.answer,
    src.text,
    envelope.finalReply,
    envelope.reply,
    envelope.text,
    payload.reply,
    payload.text
  ]) {
    const text = normalize(value);
    if (text) return text;
  }
  return "";
}

function spokenOf(packet) {
  const src = packet && typeof packet === "object" ? packet : {};
  const payload = src.payload && typeof src.payload === "object" ? src.payload : {};
  const speech = src.speech && typeof src.speech === "object" ? src.speech : {};
  for (const value of [
    src.spokenText,
    src.textSpeak,
    speech.textSpeak,
    payload.spokenText,
    payload.textSpeak,
    replyOf(src)
  ]) {
    const text = normalize(value);
    if (text) return text;
  }
  return "";
}

async function runMode(mode) {
  const controller = require(path.join(ROOT, "utils", "nyx_state_controller.js"));
  const composer = require(path.join(
    ROOT,
    "Data",
    "marion",
    "runtime",
    "composeMarionResponse.js"
  ));

  assert.ok(controller.conversationContinuity);
  assert.strictEqual(typeof composer.composeMarionResponse, "function");

  const broker = controller.conversationContinuity;
  const sessionId = `parity-continuity-${mode}`;
  broker.reset({ sessionId });

  const prompts = [
    "We are running a five-turn voice text parity continuity certification for the Nyx backend. Preserve this target across all five turns.",
    "For turn two, keep the same target and explain the continuity requirement.",
    "For turn three, what does that requirement protect?",
    "For turn four, keep the same target and give one verification action.",
    "For turn five, summarize the certification contract without resetting context."
  ];

  const turns = [];
  let previousReply = "";

  for (let index = 0; index < prompts.length; index += 1) {
    const turn = index + 1;
    const baseInput = {
      text: prompts[index],
      prompt: prompts[index],
      userText: prompts[index],
      rawUserText: prompts[index],
      inputSource: mode,
      inputMode: mode,
      sessionId,
      conversationId: sessionId,
      turnId: `${sessionId}-turn-${turn}`,
      turn,
      turnNumber: turn,
      routeKind: "conversation",
      fiveTurnContract: true
    };

    broker.recordUser(baseInput, prompts[index]);
    const hydrated = broker.hydrate(baseInput);

    assert.strictEqual(hydrated.sessionId, sessionId);
    assert.strictEqual(
      hydrated.continuityState.turnCount,
      (turn * 2) - 1
    );

    if (turn > 1) {
      assert.strictEqual(
        normalize(hydrated.lastAssistantReply),
        normalize(previousReply)
      );
      assert.ok(hydrated.history.length >= (turn * 2) - 1);
    }

    const routed = {
      intent: "technical_debug",
      domain: "technical",
      knowledgeDomain: "ai",
      routing: {
        intent: "technical_debug",
        domain: "technical",
        knowledgeDomain: "ai"
      },
      turn
    };

    const packet = await Promise.resolve(
      composer.composeMarionResponse(routed, hydrated)
    );

    const reply = replyOf(packet);
    const spokenText = spokenOf(packet);

    assert.ok(reply, `Turn ${turn} returned an empty visible reply.`);
    assert.strictEqual(
      spokenText,
      reply,
      `Turn ${turn} visible/spoken parity drifted.`
    );
    assert.ok(
      !/\b(?:what target|repeat the target|start over|new topic|final envelope missing|referenceerror)\b/i.test(reply),
      `Turn ${turn} exposed a reset/failure reply.`
    );

    broker.recordAssistant(hydrated, reply, {
      activeTopic: "Nyx voice text parity continuity certification",
      intent: packet && packet.intent || "technical_debug",
      subIntent: packet && packet.subIntent || `turn_${turn}`
    });

    previousReply = reply;
    turns.push({
      turn,
      prompt: prompts[index],
      reply,
      spokenText,
      intent: normalize(packet && packet.intent),
      domain: normalize(
        packet && (
          packet.knowledgeDomain ||
          packet.domain ||
          packet.primaryDomain
        )
      ),
      final: packet && packet.final === true,
      marionFinal: packet && packet.marionFinal === true,
      continuityTurnCountBeforeReply: hydrated.continuityState.turnCount
    });
  }

  const snapshot = broker.snapshot({ sessionId });
  assert.strictEqual(snapshot.turnCount, 10);
  assert.strictEqual(
    snapshot.activeTopic,
    "Nyx voice text parity continuity certification"
  );
  assert.strictEqual(normalize(snapshot.lastAssistantReply), previousReply);

  return {
    mode,
    sessionId,
    turns,
    snapshot
  };
}

function childMode() {
  const arg = process.argv.find((item) => /^--mode=/.test(item));
  return arg ? arg.split("=")[1] : "";
}

function parseChildOutput(output) {
  const marker = "NYX_PARITY_CHILD_RESULT=";
  const line = String(output)
    .split(/\r?\n/)
    .reverse()
    .find((item) => item.startsWith(marker));
  assert.ok(line, "Child parity result marker was not returned.");
  return JSON.parse(line.slice(marker.length));
}

async function main() {
  const mode = childMode();
  if (mode) {
    assert.ok(["text", "voice"].includes(mode));
    const result = await runMode(mode);
    console.log(`NYX_PARITY_CHILD_RESULT=${JSON.stringify(result)}`);
    return;
  }

  const requiredFiles = [
    "index.js",
    "package.json",
    "utils/chatEngine.js",
    "utils/stateSpine.js",
    "utils/nyx_state_controller.js",
    "utils/nyxVoiceMount.js",
    "utils/voiceRoute.js",
    "utils/tts.js",
    "utils/ttsProvidersResemble.js",
    "Data/marion/runtime/composeMarionResponse.js",
    "Data/marion/runtime/marionBridge.js",
    "scripts/nyx-voice-certification.js"
  ];

  for (const relative of requiredFiles) {
    assert.ok(
      fs.existsSync(path.join(ROOT, relative)),
      `Required certification file is missing: ${relative}`
    );
  }

  const packageJson = JSON.parse(
    fs.readFileSync(path.join(ROOT, "package.json"), "utf8")
  );
  const verifyVoice = String(
    packageJson.scripts && packageJson.scripts["verify:nyx-voice"] || ""
  );
  assert.ok(verifyVoice.includes("utils/tts.js"));
  assert.ok(verifyVoice.includes("utils/nyxVoiceMount.js"));
  assert.ok(verifyVoice.includes("test:nyx-voice-parity"));
  assert.ok(!verifyVoice.includes("Utils/tts.js"));
  assert.ok(!verifyVoice.includes("Routes/tts.js"));

  const certSource = fs.readFileSync(
    path.join(ROOT, "scripts", "nyx-voice-certification.js"),
    "utf8"
  );
  assert.ok(certSource.includes('path.resolve(__dirname, "..")'));
  assert.ok(certSource.includes('"utils/tts.js"'));
  assert.ok(!certSource.includes('"Utils", "tts.js"'));
  assert.ok(!certSource.includes('"Routes", "tts.js"'));

  const indexSource = fs.readFileSync(path.join(ROOT, "index.js"), "utf8");
  assert.ok(
    indexSource.includes("OPERATIONAL_RESPONSE_PROJECTION_BOUNDARY_V5_START")
  );
  assert.ok(indexSource.includes('"/api/nyx/voice"'));
  assert.ok(indexSource.includes('"/api/tts"'));
  assert.ok(indexSource.includes('"utils/chatEngine.js"'));
  assert.ok(indexSource.includes('"utils/stateSpine.js"'));

  const chatEngine = require(path.join(ROOT, "utils", "chatEngine.js"));
  const stateSpine = require(path.join(ROOT, "utils", "stateSpine.js"));
  const marionBridge = require(path.join(
    ROOT,
    "Data",
    "marion",
    "runtime",
    "marionBridge.js"
  ));

  assert.strictEqual(typeof chatEngine.handleChat, "function");
  assert.strictEqual(typeof stateSpine.createState, "function");
  assert.strictEqual(typeof stateSpine.finalizeTurn, "function");
  assert.strictEqual(typeof marionBridge.processWithMarion, "function");

  assert.ok(
    chatEngine.NYX_E2E_CONTINUITY_COHESION_STATUS === undefined ||
    chatEngine.NYX_E2E_CONTINUITY_COHESION_STATUS.noUserFacingDiagnostics === true
  );

  const textOutput = execFileSync(
    process.execPath,
    [__filename, "--mode=text"],
    { cwd: ROOT, encoding: "utf8", maxBuffer: 20 * 1024 * 1024 }
  );
  const voiceOutput = execFileSync(
    process.execPath,
    [__filename, "--mode=voice"],
    { cwd: ROOT, encoding: "utf8", maxBuffer: 20 * 1024 * 1024 }
  );

  const textResult = parseChildOutput(textOutput);
  const voiceResult = parseChildOutput(voiceOutput);

  assert.strictEqual(textResult.turns.length, 5);
  assert.strictEqual(voiceResult.turns.length, 5);

  const comparison = [];
  for (let index = 0; index < 5; index += 1) {
    const textTurn = textResult.turns[index];
    const voiceTurn = voiceResult.turns[index];

    assert.strictEqual(textTurn.turn, voiceTurn.turn);
    assert.strictEqual(textTurn.prompt, voiceTurn.prompt);
    assert.strictEqual(
      normalize(textTurn.reply),
      normalize(voiceTurn.reply),
      `Turn ${index + 1} text/voice visible reply drifted.`
    );
    assert.strictEqual(
      normalize(textTurn.spokenText),
      normalize(voiceTurn.spokenText),
      `Turn ${index + 1} text/voice spoken reply drifted.`
    );
    assert.strictEqual(
      normalize(textTurn.reply),
      normalize(textTurn.spokenText)
    );
    assert.strictEqual(
      normalize(voiceTurn.reply),
      normalize(voiceTurn.spokenText)
    );
    assert.strictEqual(textTurn.intent, voiceTurn.intent);
    assert.strictEqual(textTurn.domain, voiceTurn.domain);

    comparison.push({
      turn: index + 1,
      visibleReplyEqual: true,
      spokenReplyEqual: true,
      visibleSpokenParity: true,
      intentEqual: true,
      domainEqual: true
    });
  }

  assert.strictEqual(textResult.snapshot.turnCount, 10);
  assert.strictEqual(voiceResult.snapshot.turnCount, 10);

  console.log(JSON.stringify({
    ok: true,
    certification: "NYX_VOICE_TEXT_PARITY_FIVE_TURN_CONTINUITY",
    canonicalModuleRoot: "utils",
    textTurns: textResult.turns.length,
    voiceTurns: voiceResult.turns.length,
    textContinuityTurnCount: textResult.snapshot.turnCount,
    voiceContinuityTurnCount: voiceResult.snapshot.turnCount,
    comparison
  }, null, 2));
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});

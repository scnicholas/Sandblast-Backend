"use strict";

/**
 * tests/marion/layers_1_28/round3/run_round3_certification.js
 *
 * Marion Layers 1–28 — Round 3 Cognitive Resilience Certification
 *
 * Scope:
 * - Confirms the Round 1 and Round 2 prerequisite chain.
 * - Certifies the active layered manifest representation.
 * - Verifies the Round 3 cognitive-resilience contract across MarionBridge,
 *   ComposeMarionResponse, ChatEngine, and StateSpine.
 * - Exercises tests 3.1–3.5 through the live Marion bridge contract.
 * - Rejects circular-export warnings and user-facing diagnostic leakage.
 * - Discovers and executes companion Round 3 tests fail-fast.
 *
 * This runner does not start index.js or bind a network port.
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const childProcess = require("child_process");

const VERSION =
  "marion.layers1_28.round3Certification/2.1-canonical-metacognition-boundary";

const ROOT =
  path.resolve(__dirname, "../../../..");

const ROUND_DIR =
  __dirname;

const SELF =
  path.basename(__filename);

const ROUND1_RUNNER =
  "tests/marion/layers_1_28/round1/run_round1_certification.js";

const ROUND2_RUNNER =
  "tests/marion/layers_1_28/round2/run_round2_certification.js";

const PACKAGE_ROUND1 =
  "node tests/marion/layers_1_28/round1/run_round1_certification.js";

const PACKAGE_ROUND2 =
  "node tests/marion/layers_1_28/round2/run_round2_certification.js";

const PACKAGE_ROUND3 =
  "node tests/marion/layers_1_28/round3/run_round3_certification.js";

const ROUND3_VERSION =
  "nyx.marion.round3.cognitiveResilienceFinal/1.0";

const ROUND3_STATE_VERSION =
  "nyx.marion.round3.state/1.0";

const HARD_STOP_LAYER =
  28;
const CONVERSATION_HARD_STOP_LAYER = 26;
const PHASE_A_HARD_STOP_LAYER = 24;
const CANONICAL_METACOGNITION_ROOT = "Data/marion/runtime/metacognition";
const METACOGNITION_FILES = Object.freeze([
  "marionMetaReasoner.js",
  "marionReflectionEngine.js",
  "marionConfidenceAnalyzer.js",
  "marionBiasDetector.js",
  "marionKnowledgeGapDetector.js",
  "marionReasoningAuditor.js",
  "marionResponseEvaluator.js",
  "marionQualityCalibrator.js",
  "marionLearningSignalCollector.js",
  "marionAdaptiveImprovementEngine.js",
  "marionMetaReasoningPolicy.js",
  "marionMetaTelemetry.js",
  "marionReflectionEnvelope.js"
]);
const METACOGNITION_REQUIRED = Object.freeze(
  METACOGNITION_FILES.map((name)=>`${CANONICAL_METACOGNITION_ROOT}/${name}`)
);

const WARNING_RE =
  /Accessing non-existent property|inside circular dependency/i;

const CONFLICT_RE =
  /^(?:<<<<<<<|=======|>>>>>>>)/m;

const INTERNAL_LEAK_RE =
  /\b(?:state spine|final envelope|runtimeTelemetry|diagnostic packet|replyAuthority|loop detected|recovery path engaged|CHATENGINE_COORDINATOR_ONLY_ACTIVE)\b/i;

const REQUIRED_FILES = Object.freeze([
  "package.json","manifest.json","index.js",ROUND1_RUNNER,ROUND2_RUNNER,
  "Data/marion/runtime/marionBridge.js","Data/marion/runtime/composeMarionResponse.js",
  "utils/chatEngine.js","utils/stateSpine.js",...METACOGNITION_REQUIRED
]);

const OPTIONAL_COHESION_FILES = Object.freeze([
  "Data/marion/runtime/marionIntentRouter.js",
  "Data/marion/runtime/marionDomainRegistry.js",
  "Data/marion/runtime/marionFinalEnvelope.js",
  "Data/marion/runtime/marionLoopGuard.js",
  "Data/marion/runtime/marionCurrentTurnAuthority.js",
  "Data/marion/runtime/privateOperatorBoundaryLock.js",
  "Data/marion/runtime/publicIdentityQuestionRefinement.js",
  "Data/marion/runtime/voiceTextParityIdentityDriftHardlock.js",
  "Data/marion/runtime/supervision/marionCognitiveSupervisor.js",
  "utils/nyx_state_controller.js"
]);

const ROUND3_SOURCE_CONTRACTS = Object.freeze([
  {
    file: "Data/marion/runtime/marionBridge.js",
    marker: "MARION_ROUND3_COGNITIVE_RESILIENCE_FINAL_V1_START"
  },
  {
    file: "Data/marion/runtime/composeMarionResponse.js",
    marker: "MARION_ROUND3_COGNITIVE_RESILIENCE_FINAL_V1_START"
  },
  {
    file: "utils/chatEngine.js",
    marker: "MARION_ROUND3_COGNITIVE_RESILIENCE_FINAL_V1_START"
  },
  {
    file: "utils/stateSpine.js",
    marker: "MARION_ROUND3_COGNITIVE_RESILIENCE_STATE_V1_START"
  }
]);

const ROUND3_CASES = Object.freeze([
  {
    test: "3.1",
    stage: "evidence_revision",
    prompt:
      "Earlier you recommended option A, but new evidence supports option B. Explain how the recommendation changes."
  },
  {
    test: "3.2",
    stage: "confidence_calibration",
    prompt:
      "Which part of your recommendation are you most confident about, and which part are you most uncertain about?"
  },
  {
    test: "3.3",
    stage: "option_arbitration",
    prompt:
      "There are three possible ways forward. Compare the options and help me choose without taking control of the decision."
  },
  {
    test: "3.4",
    stage: "knowledge_gap_management",
    prompt:
      "Several important facts are missing. Show how you would proceed without inventing information."
  },
  {
    test: "3.5",
    stage: "assumption_audit",
    prompt:
      "List every assumption you are making before answering and show which assumptions could change the conclusion."
  }
]);

function absolute(relativePath) {
  return path.resolve(ROOT, relativePath);
}

function isObject(value) {
  return Boolean(
    value &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

function clean(value) {
  try {
    return String(
      value == null ? "" : value
    )
      .replace(/[\u0000-\u001f\u007f]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  } catch (_) {
    return "";
  }
}

function ownFunction(target, name) {
  if (
    !target ||
    (
      typeof target !== "object" &&
      typeof target !== "function"
    )
  ) {
    return null;
  }

  try {
    const descriptor =
      Object.getOwnPropertyDescriptor(target, name);

    return descriptor &&
      typeof descriptor.value === "function"
      ? descriptor.value
      : null;
  } catch (_) {
    return null;
  }
}

function readText(relativePath) {
  const file =
    absolute(relativePath);

  assert.ok(
    fs.existsSync(file),
    `Required file is missing: ${relativePath}`
  );

  const source =
    fs.readFileSync(file, "utf8");

  assert.strictEqual(
    CONFLICT_RE.test(source),
    false,
    `Merge-conflict marker found: ${relativePath}`
  );

  return source;
}

function readJson(relativePath) {
  const source =
    readText(relativePath);

  try {
    return JSON.parse(source);
  } catch (error) {
    assert.fail(
      `Invalid JSON in ${relativePath}: ${
        error && error.message
          ? error.message
          : error
      }`
    );
  }
}


function assertCanonicalMetacognitionPath() {
  const missing=METACOGNITION_REQUIRED.filter((relativePath)=>!fs.existsSync(absolute(relativePath)));
  assert.deepStrictEqual(missing,[],`Canonical Layer 28 metacognition files are missing: ${missing.join(", ")}`);
  for(const relativePath of METACOGNITION_REQUIRED){
    const candidate=absolute(relativePath),resolved=require.resolve(candidate);
    assert.strictEqual(path.normalize(resolved).toLowerCase(),path.normalize(candidate).toLowerCase(),
      `Layer 28 metacognition resolution drifted: ${relativePath}`);
  }
  const supervisor=readText("Data/marion/runtime/supervision/marionCognitiveSupervisor.js");
  assert.strictEqual(/path\.join\(\s*__dirname\s*,\s*["']metacognition["']\s*\)/m.test(supervisor),false,
    "Cognitive Supervisor still resolves stale supervision/metacognition.");
  assert.ok(/path\.join\(\s*__dirname\s*,\s*["']\.\.["']\s*,\s*["']metacognition["']\s*\)/m.test(supervisor),
    "Cognitive Supervisor does not resolve canonical runtime/metacognition.");
  return {root:CANONICAL_METACOGNITION_ROOT,files:[...METACOGNITION_REQUIRED]};
}

function npmRunReferences(command) {
  return [
    ...String(command || "")
      .matchAll(
        /\bnpm(?:\.cmd)?\s+run\s+([A-Za-z0-9:_-]+)/g
      )
  ].map((match) => match[1]);
}

function assertPackageContract() {
  const pkg =
    readJson("package.json");

  assert.ok(
    isObject(pkg.scripts),
    "package.json scripts object is missing."
  );

  assert.strictEqual(
    pkg.scripts["test:marion-round1"],
    PACKAGE_ROUND1,
    "Round 1 package path drifted."
  );

  assert.strictEqual(
    pkg.scripts["test:marion-round2"],
    PACKAGE_ROUND2,
    "Round 2 package path drifted."
  );

  assert.strictEqual(
    pkg.scripts["test:marion-round3"],
    PACKAGE_ROUND3,
    "Round 3 package path drifted."
  );

  const verification =
    npmRunReferences(
      pkg.scripts["verify:marion-round3"]
    );

  assert.deepStrictEqual(
    verification,
    [
      "test:marion-round1",
      "test:marion-round2",
      "test:marion-round3"
    ],
    "verify:marion-round3 must run Rounds 1, 2, and 3 exactly once and in order."
  );

  assert.strictEqual(
    pkg.type,
    "commonjs",
    "CommonJS architecture changed."
  );

  assert.ok(
    isObject(pkg.engines) &&
    typeof pkg.engines.node === "string" &&
    pkg.engines.node.trim(),
    "Node engine declaration is missing."
  );

  return {
    name:
      clean(pkg.name),
    version:
      clean(pkg.version),
    node:
      pkg.engines.node,
    verification
  };
}

function assertFiles() {
  const missing =
    REQUIRED_FILES.filter(
      (relativePath) =>
        !fs.existsSync(
          absolute(relativePath)
        )
    );

  assert.deepStrictEqual(
    missing,
    [],
    `Round 3 required files are missing: ${missing.join(", ")}`
  );

  return OPTIONAL_COHESION_FILES.filter(
    (relativePath) =>
      fs.existsSync(
        absolute(relativePath)
      )
  );
}

function assertManifestContract() {
  const manifest =
    readJson("manifest.json");

  const summary =
    isObject(manifest.summary)
      ? manifest.summary
      : {};

  const architecture =
    isObject(manifest.architecture)
      ? manifest.architecture
      : {};

  const layers =
    Array.isArray(
      summary.conversationLayersIncluded
    )
      ? [...new Set(
          summary.conversationLayersIncluded
            .map(Number)
            .filter(Number.isInteger)
        )].sort((a, b) => a - b)
      : [];

  const baselineFlag =
    summary.baselineLayers1to8ValidatedAsExistingRuntimeInvariants === true;

  const baselineExplicit =
    Array.from(
      { length: 8 },
      (_, index) => index + 1
    ).every(
      (layer) => layers.includes(layer)
    );

  assert.ok(
    baselineFlag || baselineExplicit,
    "Layers 1–8 are not represented by baseline invariants or explicit entries."
  );

  const missingConversationLayers = [];

  for (
    let layer = 9;
    layer <= 26;
    layer += 1
  ) {
    if (!layers.includes(layer)) {
      missingConversationLayers.push(layer);
    }
  }

  assert.deepStrictEqual(
    missingConversationLayers,
    [],
    `Manifest is missing conversation Layers 9–26: ${missingConversationLayers.join(", ")}`
  );

  const indexText =
    readText("index.js");

  const laterExplicit =
    layers.includes(27) &&
    layers.includes(28);

  const laterRegistry =
    indexText.includes(
      "MARION_LAYERS_27_28_INDEX_REGISTRY_V1_START"
    ) &&
    /hardStopLayer\s*:\s*28/.test(indexText);

  assert.ok(
    laterExplicit || laterRegistry,
    "Layers 27–28 are absent from both the manifest and canonical index registry."
  );

  const summaryHardStop =
    Number(summary.hardStopLayer);

  const architectureHardStop =
    Number(architecture.hardStopLayer);

  assert.strictEqual(summaryHardStop,HARD_STOP_LAYER,"Manifest summary hard stop must remain Layer 28.");
  assert.strictEqual(architectureHardStop,CONVERSATION_HARD_STOP_LAYER,"Conversation architecture hard stop must remain Layer 26.");
  assert.strictEqual(Number(architecture.phaseAHardStopLayer),PHASE_A_HARD_STOP_LAYER,"Phase A hard stop must remain Layer 24.");
  assert.strictEqual(layers.some((layer)=>layer>HARD_STOP_LAYER),false,"Layer 29 or later must not be registered.");
  assert.strictEqual(summary.additionalLayerRecommended,false,"No additional Marion layer may be recommended.");
  assert.notStrictEqual(architecture.automaticExecutionAllowed,true,"Automatic execution must remain disabled.");
  assert.notStrictEqual(architecture.replyAuthorityReplaced,true,"Reply authority must not be replaced.");

  return {
    baselineLayers1to8:
      baselineFlag
        ? "baseline-invariants-flag"
        : "explicit-manifest-entries",
    conversationLayers9to26:
      layers.filter(
        (layer) =>
          layer >= 9 &&
          layer <= 26
      ),
    layers27to28:
      laterExplicit
        ? "explicit-manifest-entries"
        : "canonical-index-registry",
    summaryHardStop,
    architectureHardStop
  };
}

function syntaxCheck(file) {
  const result =
    childProcess.spawnSync(
      process.execPath,
      [
        "--check",
        file
      ],
      {
        cwd:
          ROOT,
        encoding:
          "utf8",
        windowsHide:
          true,
        timeout:
          30000,
        maxBuffer:
          4 * 1024 * 1024
      }
    );

  assert.strictEqual(
    result.error,
    undefined,
    result.error && result.error.message
  );

  assert.strictEqual(
    result.status,
    0,
    [
      `Syntax check failed: ${path.relative(ROOT, file)}`,
      result.stdout || "",
      result.stderr || ""
    ].join("\n")
  );
}

function runSyntaxChecks(optionalPresent) {
  const files = [
    ...REQUIRED_FILES,
    ...optionalPresent
  ]
    .filter(
      (relativePath) =>
        relativePath.endsWith(".js")
    )
    .map(absolute);

  for (const file of files) {
    syntaxCheck(file);
  }

  return files.map(
    (file) => path.relative(ROOT, file)
  );
}

function assertRound3SourceContracts() {
  const result = [];

  for (const contract of ROUND3_SOURCE_CONTRACTS) {
    const source =
      readText(contract.file);

    assert.ok(
      source.includes(contract.marker),
      `${contract.file} is missing ${contract.marker}.`
    );

    result.push({
      file:
        contract.file,
      marker:
        contract.marker,
      ok:
        true
    });
  }

  return result;
}

function runIsolated(
  name,
  source,
  timeout = 90000
) {
  const result =
    childProcess.spawnSync(
      process.execPath,
      [
        "--trace-warnings",
        "-e",
        source
      ],
      {
        cwd:
          ROOT,
        env: {
          ...process.env,
          NODE_OPTIONS:
            "",
          SB_TTS_LOG_ENABLED:
            "false"
        },
        encoding:
          "utf8",
        windowsHide:
          true,
        timeout,
        maxBuffer:
          20 * 1024 * 1024
      }
    );

  assert.strictEqual(
    result.error,
    undefined,
    result.error && result.error.message
  );

  const stdout =
    String(result.stdout || "");

  const stderr =
    String(result.stderr || "");

  assert.strictEqual(
    result.status,
    0,
    [
      `Round 3 isolated case failed: ${name}`,
      stdout,
      stderr
    ].join("\n")
  );

  assert.strictEqual(
    WARNING_RE.test(
      `${stdout}\n${stderr}`
    ),
    false,
    [
      `Circular dependency warning detected: ${name}`,
      stdout,
      stderr
    ].join("\n")
  );

  return {
    name,
    ok:
      true,
    warnings:
      0,
    stdout:
      stdout.trim()
  };
}

function coreLoadProbe(order) {
  return `
    "use strict";

    const assert = require("assert");

    function ownFunction(target, name) {
      if (
        !target ||
        (
          typeof target !== "object" &&
          typeof target !== "function"
        )
      ) {
        return null;
      }

      const descriptor =
        Object.getOwnPropertyDescriptor(target, name);

      return descriptor &&
        typeof descriptor.value === "function"
        ? descriptor.value
        : null;
    }

    const loaded = new Map();

    for (const modulePath of ${JSON.stringify([
      "./Data/marion/runtime/marionBridge.js",
      "./Data/marion/runtime/composeMarionResponse.js",
      "./utils/chatEngine.js",
      "./utils/stateSpine.js"
    ])}) {
      loaded.set(modulePath, require(modulePath));
    }

    for (const modulePath of ${JSON.stringify(order)}) {
      if (!loaded.has(modulePath)) {
        loaded.set(modulePath, require(modulePath));
      }
    }

    for (const modulePath of [
      "./Data/marion/runtime/marionBridge.js",
      "./Data/marion/runtime/composeMarionResponse.js",
      "./utils/chatEngine.js"
    ]) {
      const api = loaded.get(modulePath);

      assert.strictEqual(
        typeof ownFunction(
          api,
          "classifyRound3CognitiveResilience"
        ),
        "function",
        modulePath + " must own the Round 3 classifier."
      );

      assert.strictEqual(
        api.MARION_ROUND3_COGNITIVE_RESILIENCE_VERSION,
        ${JSON.stringify(ROUND3_VERSION)},
        modulePath + " Round 3 version drifted."
      );

      assert.ok(
        Number(api.MARION_LAYER_HARD_STOP) >= ${HARD_STOP_LAYER},
        modulePath + " hard stop is below Layer 28."
      );
    }

    const state = loaded.get("./utils/stateSpine.js");

    assert.strictEqual(
      state.__marionRound3CognitiveResilienceStateV1,
      true,
      "StateSpine Round 3 state boundary is inactive."
    );

    console.log(
      JSON.stringify({
        ok: true,
        order: ${JSON.stringify(order)},
        round3Version: ${JSON.stringify(ROUND3_VERSION)},
        stateVersion: ${JSON.stringify(ROUND3_STATE_VERSION)}
      })
    );
  `;
}

function runCoreLoadChecks() {
  const order = [
    "./Data/marion/runtime/marionBridge.js",
    "./Data/marion/runtime/composeMarionResponse.js",
    "./utils/chatEngine.js",
    "./utils/stateSpine.js"
  ];

  return [
    runIsolated(
      "round3-canonical-core-load",
      coreLoadProbe(order)
    ),
    runIsolated(
      "round3-reverse-core-load",
      coreLoadProbe(
        [...order].reverse()
      )
    )
  ];
}

function runBridgeResilienceContract() {
  const source = `
    "use strict";

    const assert = require("assert");

    const bridge =
      require(
        "./Data/marion/runtime/marionBridge.js"
      );

    function ownFunction(target, name) {
      if (!target || typeof target !== "object") return null;
      const descriptor = Object.getOwnPropertyDescriptor(target, name);
      return descriptor && typeof descriptor.value === "function"
        ? descriptor.value
        : null;
    }

    const handler =
      ownFunction(bridge, "handleMarionAdminConversation") ||
      ownFunction(bridge, "processWithMarion") ||
      ownFunction(bridge, "handleMarionAdminTextRuntime") ||
      ownFunction(bridge, "run") ||
      ownFunction(bridge, "default");

    assert.strictEqual(
      typeof handler,
      "function",
      "MarionBridge has no callable private runtime entry point."
    );

    const cases = ${JSON.stringify(ROUND3_CASES)};

    async function execute(testCase) {
      const input = {
        turnId: "round3-" + testCase.test,
        sessionId: "round3-cognitive-resilience",
        prompt: testCase.prompt,
        message: testCase.prompt,
        privateAdminConversation: true,
        marionAdminConversation: true,
        directMarionAdminInterface: true,
        authenticatedOperator: true,
        adminVerified: true,
        serverSideAdminAuth: true,
        scope: "private_admin"
      };

      const output =
        await Promise.resolve(
          handler(input)
        );

      const reply = String(
        output &&
        (
          output.reply ||
          output.finalReply ||
          output.text ||
          output.message ||
          (
            output.finalEnvelope &&
            output.finalEnvelope.reply
          ) ||
          ""
        )
      )
        .replace(/\\s+/g, " ")
        .trim();

      assert.ok(output && output.ok === true);
      assert.strictEqual(output.final, true);
      assert.strictEqual(output.marionFinal, true);
      assert.ok(reply.length >= 80, "Round 3 reply is not substantive.");
      assert.strictEqual(${INTERNAL_LEAK_RE.toString()}.test(reply), false);
      assert.ok(output.cognitiveResilience && typeof output.cognitiveResilience === "object");
      assert.strictEqual(output.cognitiveResilience.test, testCase.test);
      assert.strictEqual(output.cognitiveResilience.stage, testCase.stage);
      assert.strictEqual(output.cognitiveResilience.currentEvidenceWins, true);
      assert.strictEqual(output.cognitiveResilience.assumptionsExplicit, true);
      assert.strictEqual(output.cognitiveResilience.confidenceCalibrated, true);
      assert.strictEqual(output.cognitiveResilience.knowledgeGapsBounded, true);
      assert.strictEqual(output.cognitiveResilience.advisoryOnly, true);
      assert.strictEqual(output.executionAuthorized, false);
      assert.strictEqual(output.noUserFacingDiagnostics, true);
      assert.ok(output.finalEnvelope && typeof output.finalEnvelope === "object");
      assert.strictEqual(output.finalEnvelope.signature, "MARION_FINAL_AUTHORITY");
      assert.strictEqual(output.finalEnvelope.singleFinalAuthority, true);
      assert.strictEqual(output.finalEnvelope.executionAuthorized, false);
      assert.ok(Number(output.hardStopLayer) >= ${HARD_STOP_LAYER});

      return {
        test: testCase.test,
        stage: testCase.stage,
        replyLength: reply.length
      };
    }

    Promise.all(cases.map(execute))
      .then((results) => {
        console.log(JSON.stringify({ok:true,results}));
      })
      .catch((error) => {
        console.error(error && error.stack ? error.stack : error);
        process.exitCode = 1;
      });
  `;

  return runIsolated(
    "round3-bridge-cognitive-resilience-3.1-to-3.5",
    source,
    120000
  );
}

function runStateResilienceContract() {
  const source = `
    "use strict";

    const assert = require("assert");

    const state =
      require("./utils/stateSpine.js");

    function ownFunction(target, name) {
      if (!target || typeof target !== "object") return null;
      const descriptor = Object.getOwnPropertyDescriptor(target, name);
      return descriptor && typeof descriptor.value === "function"
        ? descriptor.value
        : null;
    }

    const create =
      ownFunction(state, "createState") ||
      ownFunction(state, "coerceState") ||
      ownFunction(state, "buildStateSpine") ||
      ownFunction(state, "normalizeStateForPipelineCohesion");

    assert.strictEqual(
      typeof create,
      "function",
      "StateSpine has no callable state constructor."
    );

    const input = {
      turnId: "round3-state-3.4",
      sessionId: "round3-state",
      prompt: "Several important facts are missing. Show how you would proceed without inventing information.",
      privateAdminConversation: true,
      serverSideAdminAuth: true,
      scope: "private_admin"
    };

    Promise.resolve(create(input))
      .then((output) => {
        assert.ok(output && typeof output === "object");
        assert.ok(output.cognitiveResilience && typeof output.cognitiveResilience === "object");
        assert.strictEqual(output.cognitiveResilience.test, "3.4");
        assert.strictEqual(output.cognitiveResilience.stage, "knowledge_gap_management");
        assert.strictEqual(output.cognitiveResilience.currentEvidenceWins, true);
        assert.strictEqual(output.cognitiveResilience.rawReflectionCarryAllowed, false);
        assert.strictEqual(output.cognitiveResilience.rawPlanCarryAllowed, false);
        assert.strictEqual(output.cognitiveResilience.executionAuthorized, false);
        assert.ok(Number(output.cognitiveResilience.hardStopLayer) >= ${HARD_STOP_LAYER});
        console.log(JSON.stringify({ok:true,test:"3.4",stage:output.cognitiveResilience.stage}));
      })
      .catch((error) => {
        console.error(error && error.stack ? error.stack : error);
        process.exitCode = 1;
      });
  `;

  return runIsolated(
    "round3-state-cognitive-resilience",
    source
  );
}

function isRound3Test(name) {
  if (
    name === SELF ||
    name.startsWith("_") ||
    !name.endsWith(".js")
  ) {
    return false;
  }

  if (
    /^run_round\d+_certification\.js$/i.test(name)
  ) {
    return false;
  }

  return /(?:^|[_\-.])(?:test|certification)(?:[_\-.]|$)/i.test(name);
}

function discoverTests() {
  return fs
    .readdirSync(
      ROUND_DIR,
      {
        withFileTypes:
          true
      }
    )
    .filter(
      (entry) =>
        entry.isFile() &&
        isRound3Test(entry.name)
    )
    .map(
      (entry) =>
        path.join(
          ROUND_DIR,
          entry.name
        )
    )
    .sort(
      (left, right) =>
        left.localeCompare(right)
    );
}

function runTest(file) {
  syntaxCheck(file);

  const result =
    childProcess.spawnSync(
      process.execPath,
      [
        "--trace-warnings",
        file
      ],
      {
        cwd:
          ROOT,
        env: {
          ...process.env,
          NODE_OPTIONS:
            "",
          SB_TTS_LOG_ENABLED:
            "false"
        },
        encoding:
          "utf8",
        windowsHide:
          true,
        timeout:
          120000,
        maxBuffer:
          20 * 1024 * 1024
      }
    );

  assert.strictEqual(
    result.error,
    undefined,
    result.error && result.error.message
  );

  const stdout =
    String(result.stdout || "");

  const stderr =
    String(result.stderr || "");

  assert.strictEqual(
    result.status,
    0,
    [
      `Round 3 test failed: ${path.basename(file)}`,
      stdout,
      stderr
    ].join("\n")
  );

  assert.strictEqual(
    WARNING_RE.test(
      `${stdout}\n${stderr}`
    ),
    false,
    [
      `Circular warning in ${path.basename(file)}`,
      stdout,
      stderr
    ].join("\n")
  );

  return {
    file:
      path.basename(file),
    ok:
      true,
    warnings:
      0,
    stdout:
      stdout.trim()
  };
}

function main() {
  const packageProfile =
    assertPackageContract();

  const optionalPresent =
    assertFiles();

  const manifest =
    assertManifestContract();

  const canonicalMetacognition =
    assertCanonicalMetacognitionPath();

  const syntaxChecks =
    runSyntaxChecks(optionalPresent);

  const sourceContracts =
    assertRound3SourceContracts();

  const isolatedLoadChecks =
    runCoreLoadChecks();

  const bridgeResilience =
    runBridgeResilienceContract();

  const stateResilience =
    runStateResilienceContract();

  const discovered =
    discoverTests();

  assert.ok(
    discovered.length > 0,
    "Round 3 companion certification inventory is empty; folder incomplete."
  );

  const executed =
    discovered.map(runTest);

  console.log(
    JSON.stringify(
      {
        ok:
          true,
        certification:
          "marion-layers-1-28-round3",
        version:
          VERSION,
        backendRoot:
          ROOT,
        package:
          packageProfile,
        prerequisites: [
          ROUND1_RUNNER,
          ROUND2_RUNNER
        ],
        manifest,
        canonicalMetacognition,
        optionalCohesionFilesPresent:
          optionalPresent,
        syntaxChecks,
        sourceContracts,
        isolatedLoadChecks,
        bridgeResilience,
        stateResilience,
        round3Cases:
          ROUND3_CASES,
        discoveredRound3Tests:
          discovered.map(
            (file) => path.basename(file)
          ),
        executedRound3Tests:
          executed,
        circularWarnings:
          0,
        userFacingDiagnosticLeaks:
          0,
        hardStopLayer:
          HARD_STOP_LAYER,
        failFast:
          true
      },
      null,
      2
    )
  );
}

try {
  main();
} catch (error) {
  console.error(
    error && error.stack
      ? error.stack
      : error
  );

  process.exitCode = 1;
}

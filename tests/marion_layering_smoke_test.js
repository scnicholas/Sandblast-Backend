"use strict";

/**
 * tests/marion_layering_smoke_test.js
 *
 * Purpose:
 * - Certify that Marion's canonical layering files exist, parse, and load.
 * - Prove bridge/composer/state/transport contracts remain cohesive.
 * - Prove Nyx-public and Marion-private identity boundaries remain separated.
 * - Reject unresolved merge artifacts and CommonJS circular-export warnings.
 *
 * Canonical backend root:
 *   C:\Users\User\Desktop\sandblast backend
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const childProcess = require("child_process");

const VERSION =
  "marion.layeringSmokeTest/3.0-canonical-cohesion";

const ROOT =
  path.resolve(__dirname, "..");

const WARNING_RE =
  /Accessing non-existent property|inside circular dependency/i;

const CONFLICT_RE =
  /^(?:<<<<<<<|=======|>>>>>>>)/m;

const REQUIRED_FILES = Object.freeze([
  "package.json",
  "Data/marion/runtime/marionBridge.js",
  "Data/marion/runtime/composeMarionResponse.js",
  "Data/marion/runtime/marionIntentRouter.js",
  "Data/marion/runtime/marionDomainRegistry.js",
  "Data/marion/runtime/marionFinalEnvelope.js",
  "Data/marion/runtime/marionLoopGuard.js",
  "Data/marion/runtime/privateOperatorBoundaryLock.js",
  "Data/marion/runtime/publicIdentityQuestionRefinement.js",
  "Data/marion/runtime/voiceTextParityIdentityDriftHardlock.js",
  "utils/chatEngine.js",
  "utils/stateSpine.js",
  "utils/nyx_state_controller.js"
]);

const SYNTAX_FILES =
  REQUIRED_FILES.filter(
    (file) => file.endsWith(".js")
  );

function absolute(relativePath) {
  return path.resolve(
    ROOT,
    relativePath
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
      Object.getOwnPropertyDescriptor(
        target,
        name
      );

    return descriptor &&
      typeof descriptor.value === "function"
      ? descriptor.value
      : null;
  } catch (_) {
    return null;
  }
}

function callableCount(target) {
  if (typeof target === "function") {
    return 1;
  }

  if (
    !target ||
    typeof target !== "object"
  ) {
    return 0;
  }

  let count = 0;

  for (
    const name
    of Object.getOwnPropertyNames(target)
  ) {
    if (ownFunction(target, name)) {
      count += 1;
    }
  }

  return count;
}

function assertRequiredFiles() {
  const missing =
    REQUIRED_FILES.filter(
      (file) =>
        !fs.existsSync(
          absolute(file)
        )
    );

  assert.deepStrictEqual(
    missing,
    [],
    `Required Marion layering files are missing: ${missing.join(", ")}`
  );
}

function assertPackageContract() {
  const packagePath =
    absolute("package.json");

  const pkg =
    JSON.parse(
      fs.readFileSync(
        packagePath,
        "utf8"
      )
    );

  assert.ok(
    pkg.scripts &&
    typeof pkg.scripts === "object",
    "package.json scripts object is missing."
  );

  assert.strictEqual(
    pkg.scripts["test:marion-layering"],
    "node tests/marion_layering_smoke_test.js",
    "package.json must route test:marion-layering to the canonical smoke test."
  );

  return {
    package:
      clean(pkg.name),
    packageVersion:
      clean(pkg.version)
  };
}

function assertNoConflictMarkers() {
  const affected = [];

  for (const file of SYNTAX_FILES) {
    const source =
      fs.readFileSync(
        absolute(file),
        "utf8"
      );

    if (CONFLICT_RE.test(source)) {
      affected.push(file);
    }
  }

  assert.deepStrictEqual(
    affected,
    [],
    `Unresolved merge-conflict markers found: ${affected.join(", ")}`
  );
}

function runSyntaxChecks() {
  const results = [];

  for (const file of SYNTAX_FILES) {
    const result =
      childProcess.spawnSync(
        process.execPath,
        [
          "--check",
          absolute(file)
        ],
        {
          cwd: ROOT,
          encoding: "utf8",
          windowsHide: true,
          timeout: 30000,
          maxBuffer:
            4 * 1024 * 1024
        }
      );

    assert.strictEqual(
      result.error,
      undefined,
      result.error &&
        result.error.message
    );

    assert.strictEqual(
      result.status,
      0,
      [
        `Syntax check failed: ${file}`,
        result.stdout || "",
        result.stderr || ""
      ].join("\n")
    );

    results.push({
      file,
      ok: true
    });
  }

  return results;
}

function runIsolatedCase(
  name,
  source,
  timeoutMs = 45000
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
        cwd: ROOT,
        env: {
          ...process.env,
          NODE_OPTIONS: "",
          SB_TTS_LOG_ENABLED: "false"
        },
        encoding: "utf8",
        windowsHide: true,
        timeout: timeoutMs,
        maxBuffer:
          12 * 1024 * 1024
      }
    );

  assert.strictEqual(
    result.error,
    undefined,
    result.error &&
      result.error.message
  );

  const stdout =
    String(result.stdout || "");

  const stderr =
    String(result.stderr || "");

  assert.strictEqual(
    result.status,
    0,
    [
      `Isolated layering case failed: ${name}`,
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
    ok: true,
    stdout:
      stdout.trim(),
    warnings: 0
  };
}

function buildCoreLoadProbe(order) {
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
        Object.getOwnPropertyDescriptor(
          target,
          name
        );

      return descriptor &&
        typeof descriptor.value === "function"
        ? descriptor.value
        : null;
    }

    function hasAnyFunction(target, names) {
      if (typeof target === "function") {
        return true;
      }

      return names.some(
        (name) =>
          Boolean(
            ownFunction(
              target,
              name
            )
          )
      );
    }

    const modules = new Map();

    for (
      const modulePath
      of ${JSON.stringify(order)}
    ) {
      modules.set(
        modulePath,
        require(modulePath)
      );
    }

    const bridge =
      modules.get(
        "./Data/marion/runtime/marionBridge.js"
      ) ||
      require(
        "./Data/marion/runtime/marionBridge.js"
      );

    const composer =
      modules.get(
        "./Data/marion/runtime/composeMarionResponse.js"
      ) ||
      require(
        "./Data/marion/runtime/composeMarionResponse.js"
      );

    const intentRouter =
      modules.get(
        "./Data/marion/runtime/marionIntentRouter.js"
      ) ||
      require(
        "./Data/marion/runtime/marionIntentRouter.js"
      );

    const domainRegistry =
      modules.get(
        "./Data/marion/runtime/marionDomainRegistry.js"
      ) ||
      require(
        "./Data/marion/runtime/marionDomainRegistry.js"
      );

    const finalEnvelope =
      modules.get(
        "./Data/marion/runtime/marionFinalEnvelope.js"
      ) ||
      require(
        "./Data/marion/runtime/marionFinalEnvelope.js"
      );

    const loopGuard =
      modules.get(
        "./Data/marion/runtime/marionLoopGuard.js"
      ) ||
      require(
        "./Data/marion/runtime/marionLoopGuard.js"
      );

    const stateSpine =
      modules.get(
        "./utils/stateSpine.js"
      ) ||
      require(
        "./utils/stateSpine.js"
      );

    const chatEngine =
      modules.get(
        "./utils/chatEngine.js"
      ) ||
      require(
        "./utils/chatEngine.js"
      );

    assert.ok(
      hasAnyFunction(
        bridge,
        [
          "processWithMarion",
          "handleMarionAdminConversation",
          "route",
          "ask",
          "handle",
          "default"
        ]
      ),
      "MarionBridge has no callable runtime entry point."
    );

    assert.ok(
      hasAnyFunction(
        composer,
        [
          "composeMarionResponse",
          "compose",
          "run",
          "buildReply",
          "default"
        ]
      ),
      "composeMarionResponse has no callable composer entry point."
    );

    assert.ok(
      hasAnyFunction(
        intentRouter,
        [
          "routeMarionIntent",
          "route",
          "resolveIntent",
          "default"
        ]
      ),
      "marionIntentRouter has no callable routing entry point."
    );

    assert.ok(
      hasAnyFunction(
        domainRegistry,
        [
          "getDomain",
          "resolveDomain",
          "registerDomain",
          "listDomains",
          "route",
          "default"
        ]
      ),
      "marionDomainRegistry has no callable registry entry point."
    );

    assert.ok(
      hasAnyFunction(
        finalEnvelope,
        [
          "createMarionFinalEnvelope",
          "finalize",
          "buildFinalEnvelope",
          "toFinalEnvelope",
          "normalizeFinalEnvelope",
          "default"
        ]
      ),
      "marionFinalEnvelope has no callable finalization entry point."
    );

    assert.ok(
      hasAnyFunction(
        loopGuard,
        [
          "applyLoopGuard",
          "checkLoop",
          "detectLoop",
          "guard",
          "default"
        ]
      ),
      "marionLoopGuard has no callable guard entry point."
    );

    assert.ok(
      hasAnyFunction(
        stateSpine,
        [
          "createState",
          "coerceState",
          "finalizeTurn",
          "normalizeStateForPipelineCohesion",
          "buildStateSpine",
          "default"
        ]
      ),
      "StateSpine has no callable state entry point."
    );

    assert.ok(
      typeof chatEngine === "function" ||
      Object.getOwnPropertyNames(
        chatEngine || {}
      ).some(
        (name) =>
          Boolean(
            ownFunction(
              chatEngine,
              name
            )
          )
      ),
      "ChatEngine has no callable coordinator entry point."
    );

    console.log(
      JSON.stringify(
        {
          ok: true,
          case: "core-load-order",
          order: ${JSON.stringify(order)}
        }
      )
    );
  `;
}

function runCoreLoadCases() {
  const canonicalOrder = [
    "./Data/marion/runtime/marionBridge.js",
    "./Data/marion/runtime/composeMarionResponse.js",
    "./Data/marion/runtime/marionIntentRouter.js",
    "./Data/marion/runtime/marionDomainRegistry.js",
    "./Data/marion/runtime/marionFinalEnvelope.js",
    "./Data/marion/runtime/marionLoopGuard.js",
    "./utils/stateSpine.js",
    "./utils/chatEngine.js"
  ];

  const reverseOrder =
    [...canonicalOrder].reverse();

  return [
    runIsolatedCase(
      "canonical-core-load-order",
      buildCoreLoadProbe(
        canonicalOrder
      )
    ),

    runIsolatedCase(
      "reverse-core-load-order",
      buildCoreLoadProbe(
        reverseOrder
      )
    )
  ];
}

function runPrivateBridgeContract() {
  const source = `
    "use strict";

    const assert = require("assert");

    function clean(value) {
      return String(
        value == null ? "" : value
      )
        .replace(/\\s+/g, " ")
        .trim();
    }

    const bridge =
      require(
        "./Data/marion/runtime/marionBridge.js"
      );

    const handler =
      typeof bridge.handleMarionAdminConversation === "function"
        ? bridge.handleMarionAdminConversation
        : (
            typeof bridge.processWithMarion === "function"
              ? bridge.processWithMarion
              : bridge.default
          );

    assert.strictEqual(
      typeof handler,
      "function",
      "Private Marion bridge handler is unavailable."
    );

    const input = {
      prompt:
        "In two sentences, explain what you can help me accomplish as my private administrative assistant.",
      sessionId:
        "layering-smoke-private",
      privateAdminConversation:
        true,
      marionAdminConversation:
        true,
      directMarionAdminInterface:
        true,
      authenticatedOperator:
        true,
      adminVerified:
        true,
      serverSideAdminAuth:
        true,
      scope:
        "private_admin"
    };

    const timeout =
      new Promise(
        (_, reject) =>
          setTimeout(
            () =>
              reject(
                new Error(
                  "private_bridge_timeout"
                )
              ),
            30000
          )
      );

    Promise.race([
      Promise.resolve(
        handler(input)
      ),
      timeout
    ])
      .then((output) => {
        const reply =
          clean(
            output &&
            (
              output.reply ||
              output.finalReply ||
              output.text ||
              output.message ||
              (
                output.finalEnvelope &&
                output.finalEnvelope.reply
              )
            )
          );

        assert.ok(
          output &&
          output.ok !== false,
          "Private Marion bridge returned a failed packet."
        );

        assert.ok(
          reply,
          "Private Marion bridge returned no substantive reply."
        );

        assert.strictEqual(
          output.publicAgent,
          "Nyx",
          "Private output must retain Nyx as the public agent."
        );

        assert.strictEqual(
          output.surfaceAgent,
          "Marion",
          "Private output must identify Marion as the private surface agent."
        );

        assert.strictEqual(
          output.authority,
          "Marion",
          "Private output must retain Marion final authority."
        );

        assert.strictEqual(
          /hang tight|hold on a moment|signal from the noise|safest next move/i.test(
            reply
          ),
          false,
          "Private bridge emitted a quarantined holding reply."
        );

        console.log(
          JSON.stringify(
            {
              ok: true,
              case:
                "private-marion-bridge-contract",
              replyLength:
                reply.length
            }
          )
        );
      })
      .catch((error) => {
        console.error(
          error &&
          error.stack
            ? error.stack
            : error
        );
        process.exitCode = 1;
      });
  `;

  return runIsolatedCase(
    "private-marion-bridge-contract",
    source
  );
}

function runIdentityBoundaryContract() {
  const source = `
    "use strict";

    const assert = require("assert");

    const refinement =
      require(
        "./Data/marion/runtime/publicIdentityQuestionRefinement.js"
      );

    const hardlock =
      require(
        "./Data/marion/runtime/voiceTextParityIdentityDriftHardlock.js"
      );

    const privateLock =
      require(
        "./Data/marion/runtime/privateOperatorBoundaryLock.js"
      );

    const publicReply =
      refinement.cleanPublicIdentityReply(
        "Who are you?"
      );

    assert.match(
      publicReply,
      /Nyx/i
    );

    assert.doesNotMatch(
      publicReply,
      /\\b(?:Marion|Mac|Sean)\\b/i
    );

    const parity =
      hardlock.compareVoiceTextParity(
        "Who are you?",
        "Who are you?",
        {
          audience: "public",
          surfaceAgent: "Nyx",
          source: "nyx-widget"
        }
      );

    assert.strictEqual(
      parity.sameAnswerClass,
      true,
      "Typed and voice identity turns must share one answer class."
    );

    assert.strictEqual(
      parity.sameScope,
      true,
      "Typed and voice identity turns must share one scope."
    );

    assert.strictEqual(
      parity.drift,
      false,
      "Typed and voice identity turns must not drift."
    );

    const spoofed =
      privateLock.isVerifiedOperatorContext({
        audience: "public",
        surfaceAgent: "Nyx",
        source: "nyx-widget",
        authenticatedOperator: true,
        operatorPersonalization: true,
        allowPersonalName: true
      });

    assert.strictEqual(
      spoofed,
      false,
      "Body-only operator claims must not unlock private Marion."
    );

    const verified =
      privateLock.isVerifiedOperatorContext({
        route:
          "/api/marion/admin/conversation",
        source:
          "marion_admin_conversation",
        audience:
          "operator",
        surfaceAgent:
          "Marion",
        authenticatedOperator:
          true,
        adminVerified:
          true,
        serverSideAdminAuth:
          true
      });

    assert.strictEqual(
      verified,
      true,
      "Verified server/admin context must retain private Marion access."
    );

    console.log(
      JSON.stringify(
        {
          ok: true,
          case:
            "identity-boundary-and-voice-text-parity",
          publicIdentity:
            "Nyx",
          privateSpoofBlocked:
            true,
          verifiedPrivateContext:
            true
        }
      )
    );
  `;

  return runIsolatedCase(
    "identity-boundary-and-voice-text-parity",
    source
  );
}

function runSourceCohesionChecks() {
  const bridgeSource =
    fs.readFileSync(
      absolute(
        "Data/marion/runtime/marionBridge.js"
      ),
      "utf8"
    );

  const composerSource =
    fs.readFileSync(
      absolute(
        "Data/marion/runtime/composeMarionResponse.js"
      ),
      "utf8"
    );

  for (const marker of [
    "composeMarionResponse.js",
    "marionFinalEnvelope.js",
    "marionIntentRouter.js",
    "marionLoopGuard.js"
  ]) {
    assert.ok(
      bridgeSource.includes(marker),
      `MarionBridge is missing runtime dependency marker: ${marker}`
    );
  }

  for (const marker of [
    "utils/chatEngine.js",
    "Data/marion/runtime/marionBridge.js",
    "utils/stateSpine.js"
  ]) {
    assert.ok(
      composerSource.includes(marker) ||
      composerSource.includes(
        marker.replace(
          "utils/",
          "Utils/"
        )
      ),
      `Composer is missing canonical technical-layer marker: ${marker}`
    );
  }

  return {
    bridgeDependencyMarkers:
      true,
    composerLayerMarkers:
      true
  };
}

async function main() {
  assertRequiredFiles();

  const packageProfile =
    assertPackageContract();

  assertNoConflictMarkers();

  const syntax =
    runSyntaxChecks();

  const sourceCohesion =
    runSourceCohesionChecks();

  const isolated = [
    ...runCoreLoadCases(),
    runPrivateBridgeContract(),
    runIdentityBoundaryContract()
  ];

  const result = {
    ok: true,
    certification:
      "marion-layering-smoke",
    version:
      VERSION,
    backendRoot:
      ROOT,
    package:
      packageProfile,
    requiredFiles:
      REQUIRED_FILES.length,
    syntaxChecks:
      syntax.length,
    isolatedCases:
      isolated,
    sourceCohesion,
    circularWarnings:
      0,
    boundaries: {
      publicAgent:
        "Nyx",
      privateAgent:
        "Marion",
      bodyOnlyOperatorSpoofBlocked:
        true
    }
  };

  console.log(
    JSON.stringify(
      result,
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(
    error &&
    error.stack
      ? error.stack
      : error
  );

  process.exitCode = 1;
});

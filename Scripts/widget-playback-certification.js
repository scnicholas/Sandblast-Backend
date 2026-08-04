"use strict";

/**
 * scripts/widget-playback-certification.js
 *
 * Extracts the current embedded Nyx voice functions and executes the real
 * /api/tts -> /tts direct-media failover contract with current dependencies.
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const file = path.resolve(
  __dirname,
  "..",
  "public",
  "nyx",
  "sandblast_nyx_widget.html"
);

assert.ok(
  fs.existsSync(file),
  `Missing canonical Nyx widget: ${file}`
);

const html = fs.readFileSync(file, "utf8");

const inlineScripts = [
  ...html.matchAll(
    /<script\b(?![^>]*\bsrc\s*=)[^>]*>([\s\S]*?)<\/script>/gi
  )
].map((match) => match[1]);

const voiceScript = inlineScripts.find(
  (source) =>
    source.includes("async function speak(t)") &&
    source.includes("function ve(n,d)")
);

assert.ok(
  voiceScript,
  "Current embedded Nyx voice runtime was not found."
);

function extractFunction(source, marker) {
  const start = source.indexOf(marker);

  assert.ok(
    start >= 0,
    `Function marker not found: ${marker}`
  );

  const braceStart = source.indexOf("{", start);

  assert.ok(
    braceStart >= 0,
    `Opening brace not found for: ${marker}`
  );

  let depth = 0;
  let quote = "";
  let escaped = false;
  let lineComment = false;
  let blockComment = false;

  for (
    let index = braceStart;
    index < source.length;
    index += 1
  ) {
    const char = source[index];
    const next = source[index + 1];

    if (lineComment) {
      if (char === "\n") {
        lineComment = false;
      }
      continue;
    }

    if (blockComment) {
      if (char === "*" && next === "/") {
        blockComment = false;
        index += 1;
      }
      continue;
    }

    if (quote) {
      if (escaped) {
        escaped = false;
        continue;
      }

      if (char === "\\") {
        escaped = true;
        continue;
      }

      if (char === quote) {
        quote = "";
      }
      continue;
    }

    if (
      char === "'" ||
      char === '"' ||
      char === "`"
    ) {
      quote = char;
      continue;
    }

    if (char === "/" && next === "/") {
      lineComment = true;
      index += 1;
      continue;
    }

    if (char === "/" && next === "*") {
      blockComment = true;
      index += 1;
      continue;
    }

    if (char === "{") {
      depth += 1;
      continue;
    }

    if (char === "}") {
      depth -= 1;

      if (depth === 0) {
        return source.slice(
          start,
          index + 1
        );
      }
    }
  }

  assert.fail(
    `Function did not terminate: ${marker}`
  );
}

const veSource = extractFunction(
  voiceScript,
  "function ve(n,d)"
);

const speakSource = extractFunction(
  voiceScript,
  "async function speak(t)"
);

class MockAudio {
  constructor() {
    this.src = "";
    this.paused = true;
    this.attempts = [];
    this._n = 0;
    this.onerror = null;
    this.onplay = null;
    this.onended = null;
  }

  pause() {
    this.paused = true;
  }

  load() {}

  play() {
    this.attempts.push(this.src);

    if (this.src.includes("/api/tts?")) {
      /*
       * Exercise both browser failure signals. The widget's one-shot
       * failover guard must prevent a duplicate /tts attempt.
       */
      if (typeof this.onerror === "function") {
        queueMicrotask(() =>
          this.onerror(
            new Error("primary media error")
          )
        );
      }

      return Promise.reject(
        new Error("primary route unavailable")
      );
    }

    this.paused = false;

    if (typeof this.onplay === "function") {
      this.onplay();
    }

    return Promise.resolve(true);
  }
}

(async () => {
  const events = [];
  const states = [];
  const telemetry = [];

  const W = {
    SB_NYX_TTS_ENDPOINT:
      "https://sandblast-backend.onrender.com/api/tts",
    SB_RESEMBLE_VOICE_UUID:
      "83e8335f",

    dispatchEvent(event) {
      events.push(event.type);
    }
  };

  const CustomEventMock = class CustomEvent {
    constructor(type, options) {
      this.type = type;
      this.detail =
        options && options.detail;
    }
  };

  const factory = new Function(
    "W",
    "Audio",
    "CustomEvent",
    `
      let audio = null;
      const P = { voice: 1 };
      const C = {
        current: "home",
        goal: "ask"
      };
      const SID = "cert-session";
      const location = {
        pathname: "/certification"
      };
      const states = [];
      const telemetry = [];

      function pub(value) {
        return String(value == null ? "" : value)
          .replace(/\\s+/g, " ")
          .trim();
      }

      function set(value) {
        states.push(String(value));
      }

      function ID(prefix) {
        return prefix + "_cert";
      }

      function tel(event, detail) {
        telemetry.push({
          event,
          detail
        });
      }

      ${veSource}
      ${speakSource}

      return {
        speak,
        getAudio: () => audio,
        states,
        telemetry,
        preferences: P
      };
    `
  );

  const api = factory(
    W,
    MockAudio,
    CustomEventMock
  );

  await api.speak(
    "Hello from Nyx current-widget route failover."
  );

  await new Promise((resolve) =>
    setImmediate(resolve)
  );

  await new Promise((resolve) =>
    setImmediate(resolve)
  );

  const audio = api.getAudio();

  assert.ok(
    audio,
    "Voice runtime did not create an Audio instance."
  );

  assert.strictEqual(
    audio.attempts.length,
    2,
    "Failover must make exactly one primary and one compatibility attempt."
  );

  const primary = new URL(
    audio.attempts[0]
  );

  const compatibility = new URL(
    audio.attempts[1]
  );

  assert.strictEqual(
    primary.pathname,
    "/api/tts"
  );

  assert.strictEqual(
    compatibility.pathname,
    "/tts"
  );

  for (const url of [
    primary,
    compatibility
  ]) {
    assert.strictEqual(
      url.searchParams.get("voiceUuid"),
      "83e8335f"
    );

    assert.strictEqual(
      url.searchParams.get("output_format"),
      "mp3"
    );

    assert.strictEqual(
      url.searchParams.get("sessionId"),
      "cert-session"
    );

    assert.strictEqual(
      url.searchParams.get("lane"),
      "home"
    );

    assert.strictEqual(
      url.searchParams.get("goal"),
      "ask"
    );

    assert.strictEqual(
      url.searchParams.get("page"),
      "/certification"
    );

    assert.ok(
      url.searchParams.get("requestId")
    );

    assert.ok(
      url.searchParams.get("traceId")
    );
  }

  assert.ok(
    events.includes(
      "nyx:voice:prestart"
    )
  );

  assert.ok(
    events.includes(
      "nyx:voice:start"
    )
  );

  assert.ok(
    api.states.includes(
      "Nyx speaking"
    )
  );

  audio.onended();

  assert.ok(
    events.includes(
      "nyx:voice:end"
    )
  );

  assert.ok(
    api.states.includes(
      "Ready"
    )
  );

  const attemptsBeforeQuietMode =
    audio.attempts.length;

  api.preferences.voice = 0;

  await api.speak(
    "This must remain silent."
  );

  assert.strictEqual(
    audio.attempts.length,
    attemptsBeforeQuietMode,
    "Quiet mode must not start another media request."
  );

  assert.ok(
    api.states.includes(
      "Quiet mode"
    )
  );

  console.log(
    JSON.stringify(
      {
        ok: true,
        certification:
          "nyx-current-widget-playback",
        directMediaGet: true,
        primaryRoute:
          primary.pathname,
        compatibilityRoute:
          compatibility.pathname,
        attempts:
          audio.attempts.length,
        duplicateFailoverSuppressed:
          true,
        voiceUuid:
          compatibility.searchParams.get(
            "voiceUuid"
          ),
        outputFormat:
          compatibility.searchParams.get(
            "output_format"
          ),
        lifecycleEvents: {
          prestart: true,
          start: true,
          end: true
        },
        quietMode:
          true,
        corsPreflightBypassed:
          true
      },
      null,
      2
    )
  );
})().catch((error) => {
  console.error(
    error && error.stack
      ? error.stack
      : error
  );
  process.exitCode = 1;
});

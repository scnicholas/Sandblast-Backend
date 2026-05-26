"use strict";

/**
 * languagesphere-api-chat-regression.test.js
 * Sandblast / Nyx-Marion LanguageSphere live API regression.
 *
 * Run from project root:
 * node tests/languagesphere-api-chat-regression.test.js
 *
 * Purpose:
 * - Validate /api/chat accepts language fields.
 * - Validate stale session carry does not override fresh LanguageSphere turns.
 * - Validate short interface phrases can translate directly.
 * - Validate visible reply promotion is clean.
 * - Validate no diagnostics leak into visible reply fields.
 * - Correctly allow LanguageSphere direct UI finals without Marion-authored final authority.
 *
 * Required env:
 * SB_WIDGET_TOKEN=your-real-widget-token
 *
 * Optional env:
 * SB_CHAT_API_URL=https://sandblast-backend.onrender.com/api/chat
 * SB_LANG_TEST_TIMEOUT_MS=20000
 */

const assert = require("assert");

const API_URL =
  process.env.SB_CHAT_API_URL ||
  process.env.SANDBLAST_CHAT_API_URL ||
  "https://sandblast-backend.onrender.com/api/chat";

const WIDGET_TOKEN =
  process.env.SB_WIDGET_TOKEN ||
  process.env.SBNYX_WIDGET_TOKEN ||
  process.env.SB_API_KEY ||
  process.env.SANDBLAST_API_KEY ||
  process.env.CHAT_API_KEY ||
  process.env.NYX_API_KEY ||
  process.env.WIDGET_API_KEY ||
  "";

const TIMEOUT_MS = Number(process.env.SB_LANG_TEST_TIMEOUT_MS || 20000);

const TOKEN_HEADER =
  process.env.SB_WIDGET_TOKEN_HEADER ||
  process.env.SBNYX_WIDGET_TOKEN_HEADER ||
  "x-sb-widget-token";

function buildHeaders(label) {
  const traceId = `${label}-${Date.now()}`;

  const headers = {
    "Content-Type": "application/json",
    "x-sb-trace-id": traceId,
    [TOKEN_HEADER]: WIDGET_TOKEN
  };

  /**
   * In live deployments, index.js may be configured with one token header while
   * older widget tests use another. Supplying equivalent aliases keeps this
   * regression focused on LanguageSphere behavior, not token-header drift.
   */
  for (const alias of [
    "x-sb-widget-token",
    "x-sbnyx-widget-token",
    "x-nyx-widget-token",
    "x-api-key",
    "x-chat-api-key"
  ]) {
    if (!headers[alias]) headers[alias] = WIDGET_TOKEN;
  }

  return headers;
}


const LEAK_PATTERNS = [
  /routeKind=/i,
  /speechHints=/i,
  /presenceProfile=/i,
  /nyxStateHint=/i,
  /finalEnvelope/i,
  /sessionPatch/i,
  /runtimeTelemetry/i,
  /diagnostics/i,
  /replyAuthority=/i,
  /transportSafe=/i,
  /MARION::FINAL::/i,
  /CHATENGINE_COORDINATOR_ONLY_ACTIVE/i
];

function cleanText(value) {
  return String(value == null ? "" : value).replace(/\s+/g, " ").trim();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function makeSessionId(label) {
  return `languagesphere-${label}-${Date.now()}-${Math.random()
    .toString(16)
    .slice(2)}`;
}

function getVisibleReplyFields(payload) {
  const r = payload || {};
  const p = r.payload || {};
  const f = r.finalEnvelope || {};

  return {
    reply: cleanText(r.reply),
    text: cleanText(r.text),
    answer: cleanText(r.answer),
    output: cleanText(r.output),
    response: cleanText(r.response),
    displayReply: cleanText(r.displayReply),
    spokenText: cleanText(r.spokenText),

    payloadReply: cleanText(p.reply),
    payloadText: cleanText(p.text),
    payloadMessage: cleanText(p.message),
    payloadAnswer: cleanText(p.answer),
    payloadOutput: cleanText(p.output),
    payloadResponse: cleanText(p.response),
    payloadAuthoritativeReply: cleanText(p.authoritativeReply),
    payloadSpokenText: cleanText(p.spokenText),

    finalEnvelopeReply: cleanText(f.reply),
    finalEnvelopeText: cleanText(f.text),
    finalEnvelopeDisplayReply: cleanText(f.displayReply),
    finalEnvelopeSpokenText: cleanText(f.spokenText)
  };
}

function allVisibleReplyText(payload) {
  return Object.values(getVisibleReplyFields(payload))
    .filter(Boolean)
    .join("\n");
}

function findFirstVisibleReply(payload) {
  const fields = getVisibleReplyFields(payload);

  for (const key of [
    "reply",
    "text",
    "answer",
    "output",
    "response",
    "displayReply",
    "spokenText",
    "payloadReply",
    "payloadText",
    "payloadMessage",
    "payloadAuthoritativeReply",
    "payloadSpokenText",
    "finalEnvelopeReply",
    "finalEnvelopeText",
    "finalEnvelopeDisplayReply",
    "finalEnvelopeSpokenText"
  ]) {
    if (fields[key]) return fields[key];
  }

  return "";
}

function assertNoVisibleLeak(payload, label) {
  const visible = allVisibleReplyText(payload);

  for (const rx of LEAK_PATTERNS) {
    assert.ok(
      !rx.test(visible),
      `${label}: visible reply leaked diagnostic/internal text matching ${rx}`
    );
  }
}

function assertHasLanguageSphereMetadata(payload, label) {
  const r = payload || {};
  const hasMeta =
    Boolean(r.meta && r.meta.languageSphere) ||
    Boolean(r.payload && r.payload.languageSphere) ||
    Boolean(r.finalEnvelope && r.finalEnvelope.languageSphere) ||
    Boolean(r.diagnostics && r.diagnostics.languageSphere);

  assert.ok(hasMeta, `${label}: expected languageSphere metadata somewhere in response`);
}

function assertVisibleContains(payload, expected, label) {
  const visible = allVisibleReplyText(payload);

  assert.ok(
    visible.includes(expected),
    `${label}: expected visible reply fields to contain "${expected}". Visible fields were:\n${visible}`
  );
}

function assertVisibleDoesNotContain(payload, unexpected, label) {
  const visible = allVisibleReplyText(payload);

  assert.ok(
    !visible.includes(unexpected),
    `${label}: visible reply fields must not contain stale text "${unexpected}". Visible fields were:\n${visible}`
  );
}

function getLanguageSphereMetadata(payload) {
  const r = payload || {};

  return (
    (r.meta && r.meta.languageSphere) ||
    (r.payload && r.payload.languageSphere) ||
    (r.finalEnvelope && r.finalEnvelope.languageSphere) ||
    (r.diagnostics && r.diagnostics.languageSphere) ||
    null
  );
}

function isLanguageSphereDirectTranslation(payload) {
  const meta = getLanguageSphereMetadata(payload) || {};
  const visible = allVisibleReplyText(payload);

  return Boolean(
    meta.directTranslation === true ||
      meta.route === "languagesphere-direct-interface" ||
      meta.reason === "direct-interface-translation" ||
      meta.authority === "languagesphere-direct" ||
      /Commencer la lecture|Comenzar a leer|Start Reading/i.test(visible)
  );
}

function assertFinalAuthorityClean(payload, label) {
  const f = payload && payload.finalEnvelope ? payload.finalEnvelope : {};
  const directLanguageSphereFinal = isLanguageSphereDirectTranslation(payload);

  if (Object.keys(f).length) {
    const authority = cleanText(f.authority).toLowerCase();

    assert.notStrictEqual(
      authority,
      "index",
      `${label}: finalEnvelope authority must not become raw index`
    );

    /**
     * LanguageSphere direct UI translations are allowed to carry their own
     * utility authority because they intentionally bypass Marion's semantic
     * authoring path to prevent stale session carry from overriding a fresh
     * interface phrase.
     */
    if (directLanguageSphereFinal && authority) {
      assert.ok(
        /language|sphere|translation|utility|marion|final/.test(authority),
        `${label}: direct LanguageSphere final used unexpected authority "${authority}"`
      );
    }

    if (Object.prototype.hasOwnProperty.call(f, "final")) {
      assert.strictEqual(f.final, true, `${label}: finalEnvelope.final should remain true`);
    }

    /**
     * Marion-authored conversation responses must preserve marionFinal=true.
     * Direct LanguageSphere UI translations may legitimately expose
     * marionFinal=false because Marion did not author that UI utility phrase.
     */
    if (
      Object.prototype.hasOwnProperty.call(f, "marionFinal") &&
      !directLanguageSphereFinal
    ) {
      assert.strictEqual(
        f.marionFinal,
        true,
        `${label}: finalEnvelope.marionFinal should remain true for Marion-authored turns`
      );
    }
  }
}

async function postChat(body, label) {
  if (!WIDGET_TOKEN) {
    throw new Error(
      "Missing widget token. Set SB_WIDGET_TOKEN or an equivalent token env var before running this test."
    );
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(API_URL, {
      method: "POST",
      signal: controller.signal,
      headers: buildHeaders(label),
      body: JSON.stringify(body)
    });

    const raw = await response.text();
    let json = null;

    try {
      json = raw ? JSON.parse(raw) : {};
    } catch (error) {
      throw new Error(
        `${label}: response was not valid JSON. Status=${response.status}. Body=${raw.slice(
          0,
          1200
        )}`
      );
    }

    assert.ok(
      response.status >= 200 && response.status < 300,
      `${label}: expected 2xx response, got ${response.status}. Body=${raw.slice(0, 1200)}`
    );

    return json;
  } finally {
    clearTimeout(timer);
  }
}

function buildLanguageSphereBody({
  text,
  targetLanguage,
  sourceLanguage = "en",
  domain = "interface",
  sessionId,
  reset = true
}) {
  return {
    message: text,
    text,
    userText: text,
    query: text,

    sourceLanguage,
    targetLanguage,
    outputLanguage: targetLanguage,
    responseLanguage: targetLanguage,
    translateTo: targetLanguage,

    domain,
    lane: "languagesphere-test",
    sessionId,
    reset,
    clearSession: reset,
    resetSession: reset,
    freshSession: reset,

    languageSphere: {
      enabled: true,
      sourceLanguage,
      targetLanguage,
      domain,
      testMode: true
    }
  };
}

async function testEnglishToFrenchDirectInterface() {
  const label = "en-fr-direct-interface";
  const sessionId = makeSessionId(label);

  const result = await postChat(
    buildLanguageSphereBody({
      text: "Start Reading",
      targetLanguage: "fr",
      sessionId
    }),
    label
  );

  assertVisibleContains(result, "Commencer la lecture", label);
  assertVisibleDoesNotContain(
    result,
    "Are you aiming this at interface buyers",
    label
  );
  assertNoVisibleLeak(result, label);
  assertHasLanguageSphereMetadata(result, label);
  assert.ok(
    isLanguageSphereDirectTranslation(result),
    `${label}: expected LanguageSphere direct interface translation metadata/shape`
  );
  assertFinalAuthorityClean(result, label);

  return result;
}

async function testEnglishToSpanishDirectInterface() {
  const label = "en-es-direct-interface";
  const sessionId = makeSessionId(label);

  const result = await postChat(
    buildLanguageSphereBody({
      text: "Start Reading",
      targetLanguage: "es",
      sessionId
    }),
    label
  );

  assertVisibleContains(result, "Comenzar a leer", label);
  assertVisibleDoesNotContain(
    result,
    "Are you aiming this at interface buyers",
    label
  );
  assertNoVisibleLeak(result, label);
  assertHasLanguageSphereMetadata(result, label);
  assert.ok(
    isLanguageSphereDirectTranslation(result),
    `${label}: expected LanguageSphere direct interface translation metadata/shape`
  );
  assertFinalAuthorityClean(result, label);

  return result;
}

async function testResetPreventsStaleCarry() {
  const label = "reset-stale-carry";
  const sessionId = makeSessionId(label);

  /**
   * First call deliberately seeds a marketing-like turn.
   */
  await postChat(
    {
      message: "Are we targeting interface buyers, radio sponsors, Roku advertisers, or all three?",
      text: "Are we targeting interface buyers, radio sponsors, Roku advertisers, or all three?",
      userText: "Are we targeting interface buyers, radio sponsors, Roku advertisers, or all three?",
      query: "Are we targeting interface buyers, radio sponsors, Roku advertisers, or all three?",
      domain: "business",
      lane: "languagesphere-test",
      sessionId
    },
    `${label}-seed`
  );

  await sleep(250);

  /**
   * Second call uses same session but asks for reset/clear.
   * The old marketing prompt must not override the current interface phrase.
   */
  const result = await postChat(
    buildLanguageSphereBody({
      text: "Start Reading",
      targetLanguage: "fr",
      sessionId,
      reset: true
    }),
    `${label}-reset`
  );

  assertVisibleContains(result, "Commencer la lecture", label);
  assertVisibleDoesNotContain(
    result,
    "Are you aiming this at interface buyers",
    label
  );
  assertNoVisibleLeak(result, label);
  assertHasLanguageSphereMetadata(result, label);

  return result;
}

async function testNoTranslationWhenTargetIsEnglish() {
  const label = "en-en-no-translation";
  const sessionId = makeSessionId(label);

  const result = await postChat(
    buildLanguageSphereBody({
      text: "Start Reading",
      targetLanguage: "en",
      sourceLanguage: "en",
      sessionId
    }),
    label
  );

  assertVisibleContains(result, "Start Reading", label);
  assertNoVisibleLeak(result, label);
  assertHasLanguageSphereMetadata(result, label);

  return result;
}

async function run() {
  console.log("Running LanguageSphere /api/chat live regression...");
  console.log(`API_URL=${API_URL}`);

  const results = [];

  results.push(await testEnglishToFrenchDirectInterface());
  results.push(await testEnglishToSpanishDirectInterface());
  results.push(await testResetPreventsStaleCarry());
  results.push(await testNoTranslationWhenTargetIsEnglish());

  console.log("\nVisible replies:");
  results.forEach((result, index) => {
    console.log(`${index + 1}. ${findFirstVisibleReply(result)}`);
  });

  console.log("\nLanguageSphere /api/chat live regression passed.");
}

run().catch((error) => {
  console.error("\nLanguageSphere /api/chat live regression failed.");
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});

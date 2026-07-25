"use strict";

const assert = require("assert");
const path = require("path");

const root = path.resolve(__dirname, "../..");
const clientPath = path.join(root, "public/lingosentinel/lingosentinel-public-translation-client.js");
const controllerPath = path.join(root, "public/lingosentinel/lingosentinel-widget-dual-text-controller.js");

const listeners = new Map();
class TestCustomEvent {
  constructor(type, init) { this.type = type; this.detail = init && init.detail; }
}
function addEventListener(type, fn) {
  const list = listeners.get(type) || [];
  list.push(fn); listeners.set(type, list);
}
function removeEventListener(type, fn) {
  const list = listeners.get(type) || [];
  listeners.set(type, list.filter(item => item !== fn));
}
function dispatchEvent(event) {
  (listeners.get(event.type) || []).slice().forEach(fn => fn(event));
  return true;
}

global.CustomEvent = TestCustomEvent;
global.addEventListener = addEventListener;
global.removeEventListener = removeEventListener;
global.dispatchEvent = dispatchEvent;

class FakeElement {
  constructor(tagName) {
    this.tagName = String(tagName || "div").toUpperCase();
    this.attributes = new Map();
    this.children = [];
    this.hidden = false;
    this.textContent = "";
  }
  setAttribute(name, value) { this.attributes.set(String(name), String(value)); }
  getAttribute(name) { return this.attributes.has(String(name)) ? this.attributes.get(String(name)) : null; }
  appendChild(child) { this.children.push(child); return child; }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  querySelectorAll(selector) {
    const selectors = String(selector || "").split(",").map(value => value.trim()).filter(Boolean);
    const matches = [];
    const test = node => selectors.some(sel => {
      if (/^[a-z]+$/i.test(sel)) return node.tagName === sel.toUpperCase();
      const attr = sel.match(/^\[([^=\]]+)(?:="([^"]*)")?\]$/);
      if (!attr) return false;
      const actual = node.getAttribute(attr[1]);
      return attr[2] == null ? actual != null : actual === attr[2];
    });
    const walk = node => {
      node.children.forEach(child => {
        if (test(child)) matches.push(child);
        walk(child);
      });
    };
    walk(this);
    return matches;
  }
}

global.document = {
  createElement(tagName) { return new FakeElement(tagName); },
  querySelector() { return null; }
};

function load(modulePath) {
  delete require.cache[require.resolve(modulePath)];
  return require(modulePath);
}
function response(status, body) {
  return { ok: status >= 200 && status < 300, status, async json() { return body; } };
}

(async function run() {
  let passed = 0;
  const checks = [];
  function test(name, fn) { checks.push({ name, fn }); }

  let preferenceTarget = "es";
  global.LingoSentinelPublicLanguagePreferences = {
    get() { return { sourceLanguage: "en", targetLanguage: preferenceTarget, locale: "es-ES", formality: "neutral", protectedTerms: ["Sandblast"], displayMode: "both" }; },
    set(input) { if (input.targetLanguage) preferenceTarget = input.targetLanguage; return Object.assign({ targetLanguage: preferenceTarget }, input); },
    normalizeLanguage(value, fallback) {
      const map = { english: "en", spanish: "es", french: "fr", en: "en", es: "es", fr: "fr", auto: "auto" };
      return map[String(value || "").toLowerCase()] || fallback;
    }
  };

  const translationEvents = [];
  const stateEvents = [];
  addEventListener("lingosentinel:translation-result", event => translationEvents.push(event.detail));
  addEventListener("lingosentinel:translation-state", event => stateEvents.push(event.detail));

  const client = load(clientPath);

  test("canonical and compatibility language fields are both sent", async () => {
    let requestBody;
    global.fetch = async (_url, options) => {
      requestBody = JSON.parse(options.body);
      return response(200, {
        ok: true,
        sourceLanguage: "en",
        targetLanguage: "es",
        translatedText: "Hola, ¿cómo estás hoy?",
        provider: "libretranslate-compatible",
        fallback: false,
        confidence: 0.8,
        stage: "translated"
      });
    };
    const result = await client.translate({ text: "Hello, how are you today?", roomId: "lingosentinel-main", messageId: "m1" });
    assert.strictEqual(requestBody.sourceLanguage, "en");
    assert.strictEqual(requestBody.targetLanguage, "es");
    assert.strictEqual(requestBody.source, "en");
    assert.strictEqual(requestBody.target, "es");
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.translatedText, "Hola, ¿cómo estás hoy?");
    assert.strictEqual(result.sourceLanguage, "en");
    assert.strictEqual(result.targetLanguage, "es");
  });

  test("successful direct response emits a message-bound sidecar event", async () => {
    assert.ok(translationEvents.some(event => event.messageId === "m1" && event.translatedText === "Hola, ¿cómo estás hoy?" && event.contract === "lingosentinel.translationResult/1.0"));
    assert.ok(stateEvents.some(event => event.messageId === "m1" && event.state === "translated"));
  });

  test("provider fallback is not misreported as a successful translation", async () => {
    global.fetch = async () => response(503, {
      ok: false,
      sourceLanguage: "en",
      targetLanguage: "es",
      translatedText: "Hello",
      provider: "unconfigured",
      fallback: true,
      error: "translation_provider_unconfigured",
      stage: "provider_fallback"
    });
    const result = await client.translate({ text: "Hello", roomId: "lingosentinel-main", messageId: "m2" });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.translatedText, "");
    assert.strictEqual(result.retryable, true);
    assert.strictEqual(result.httpStatus, 503);
    assert.ok(translationEvents.some(event => event.messageId === "m2" && event.status === "failed"));
  });

  test("same-language bypass remains a valid result", async () => {
    preferenceTarget = "en";
    global.fetch = async () => response(200, {
      ok: true,
      sourceLanguage: "en",
      targetLanguage: "en",
      translatedText: "Sandblast",
      provider: "same-language-bypass",
      fallback: false,
      stage: "same_language_bypass"
    });
    const result = await client.translate({ text: "Sandblast", messageId: "m3", roomId: "lingosentinel-main" });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.status, "bypassed");
    assert.strictEqual(result.translatedText, "Sandblast");
    preferenceTarget = "es";
  });

  test("network failures are normalized and remain retryable", async () => {
    global.fetch = async () => { throw new TypeError("network down"); };
    const result = await client.translate({ text: "Hello", messageId: "m4", roomId: "lingosentinel-main" });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.error, "LINGOSENTINEL_TRANSLATION_NETWORK_FAILED");
    assert.strictEqual(result.retryable, true);
  });

  test("internal routes remain blocked", async () => {
    await assert.rejects(() => client.translate("Hello", { endpoint: "/internal/lingosentinel/translate" }), /LINGOSENTINEL_INTERNAL_ROUTE_BLOCKED/);
  });

  const controllerApi = load(controllerPath);

  function makeMessage(container, id, text) {
    const article = new FakeElement("article");
    article.setAttribute("data-lingosentinel-message", id);
    const paragraph = new FakeElement("p");
    paragraph.textContent = text;
    article.appendChild(paragraph);
    container.appendChild(article);
    return { article, paragraph };
  }

  test("dual-text fallback renders without applyTranslation on the render policy", () => {
    const container = new FakeElement("section");
    const message = makeMessage(container, "m10", "Hello");
    const controller = controllerApi.create({ container, roomId: "lingosentinel-main", renderPolicy: { render() {} } });
    const outcome = controller.applyResult({ messageId: "m10", originalText: "Hello", translatedText: "Hola", sourceLanguage: "en", targetLanguage: "es", status: "translated", provider: "libretranslate-compatible", confidence: 0.8 });
    assert.strictEqual(outcome.ok, true);
    assert.strictEqual(message.paragraph.textContent, "Hello");
    assert.strictEqual(message.paragraph.hidden, false);
    const translation = message.article.querySelector("[data-lingosentinel-translation]");
    assert.ok(translation);
    assert.strictEqual(translation.textContent, "Hola");
    assert.strictEqual(translation.hidden, false);
    controller.destroy();
  });

  test("translation-only mode hides the original only when a translation exists", () => {
    const container = new FakeElement("section");
    const translated = makeMessage(container, "m11", "Hello");
    const failed = makeMessage(container, "m12", "Hello again");
    const controller = controllerApi.create({ container, roomId: "lingosentinel-main", renderPolicy: {} });
    controller.applyResult({ messageId: "m11", translatedText: "Hola", sourceLanguage: "en", targetLanguage: "es", status: "translated" });
    controller.applyResult({ messageId: "m12", originalText: "Hello again", translatedText: "", sourceLanguage: "en", targetLanguage: "es", status: "failed", retryable: true });
    controller.setMode("translation");
    assert.strictEqual(translated.paragraph.hidden, true);
    assert.strictEqual(failed.paragraph.hidden, false);
    const notice = failed.article.querySelector("[data-translation-notice]");
    assert.ok(notice && /unavailable/i.test(notice.textContent));
    controller.destroy();
  });

  test("results arriving before their message are buffered and later applied", () => {
    const container = new FakeElement("section");
    const controller = controllerApi.create({ container, roomId: "lingosentinel-main", renderPolicy: {} });
    const early = controller.applyResult({ messageId: "m13", translatedText: "Buenos días", sourceLanguage: "en", targetLanguage: "es", status: "translated" });
    assert.strictEqual(early.pending, true);
    const message = makeMessage(container, "m13", "Good morning");
    const appliedResult = controller.applyPending("m13");
    assert.strictEqual(appliedResult.ok, true);
    assert.strictEqual(message.article.querySelector("[data-lingosentinel-translation]").textContent, "Buenos días");
    controller.destroy();
  });

  test("inactive-language results remain buffered until that language becomes active", () => {
    preferenceTarget = "es";
    const container = new FakeElement("section");
    const message = makeMessage(container, "m14", "Hello");
    const controller = controllerApi.create({ container, roomId: "lingosentinel-main", renderPolicy: {} });
    const result = controller.applyResult({ messageId: "m14", translatedText: "Bonjour", sourceLanguage: "en", targetLanguage: "fr", status: "translated" });
    assert.strictEqual(result.pending, true);
    preferenceTarget = "fr";
    const appliedResult = controller.applyPending("m14");
    assert.strictEqual(appliedResult.ok, true);
    assert.strictEqual(message.article.querySelector("[data-lingosentinel-translation]").textContent, "Bonjour");
    controller.destroy();
    preferenceTarget = "es";
  });

  test("duplicate translation results are suppressed", () => {
    const container = new FakeElement("section");
    makeMessage(container, "m15", "Hello");
    const controller = controllerApi.create({ container, roomId: "lingosentinel-main", renderPolicy: {} });
    const result = { messageId: "m15", translationId: "t15", translatedText: "Hola", sourceLanguage: "en", targetLanguage: "es", status: "translated" };
    assert.strictEqual(controller.applyResult(result).ok, true);
    assert.strictEqual(controller.applyResult(result).duplicate, true);
    controller.destroy();
  });

  test("direct client success event updates the dual-text controller end to end", async () => {
    preferenceTarget = "es";
    const container = new FakeElement("section");
    const message = makeMessage(container, "m20", "Good evening");
    const controller = controllerApi.create({ container, roomId: "lingosentinel-main", renderPolicy: {} });
    global.fetch = async () => response(200, {
      ok: true,
      result: {
        sourceLanguage: "en",
        targetLanguage: "es",
        translatedText: "Buenas noches",
        provider: "libretranslate-compatible",
        fallback: false,
        confidence: 0.9,
        stage: "translated"
      }
    });
    const result = await client.translate({ text: "Good evening", messageId: "m20", roomId: "lingosentinel-main" });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(message.article.querySelector("[data-lingosentinel-translation]").textContent, "Buenas noches");
    controller.destroy();
  });

  test("nested provider envelopes are normalized without exposing raw provider data", async () => {
    global.fetch = async () => response(200, {
      ok: true,
      translation: {
        source: "en",
        target: "es",
        translatedText: "Gracias",
        provider: "libretranslate-compatible",
        fallback: false,
        stage: "translated",
        rawProvider: { secret: "must-not-leak" }
      }
    });
    const result = await client.translate({ text: "Thank you", messageId: "m21", roomId: "lingosentinel-main" });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.translatedText, "Gracias");
    assert.strictEqual(Object.prototype.hasOwnProperty.call(result, "rawProvider"), false);
  });

  for (const item of checks) {
    await item.fn();
    passed++;
    console.log("PASS", item.name);
  }
  console.log(JSON.stringify({ ok: true, passed, total: checks.length }));
})().catch(error => {
  console.error(error && error.stack || error);
  process.exit(1);
});

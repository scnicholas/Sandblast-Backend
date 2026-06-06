"use strict";

/**
 * LingoSentinel Live Chat Route Smoke Test
 *
 * Purpose:
 * Optional live-route smoke test for the actual backend chat endpoint.
 *
 * This test is skipped unless explicitly enabled.
 *
 * Enable with:
 *   $env:SB_LINGOSENTINEL_LIVE_ROUTE_TEST="true"
 *
 * Optional:
 *   $env:SB_LINGOSENTINEL_LIVE_BASE_URL="http://localhost:3000"
 *   $env:SB_LINGOSENTINEL_LIVE_CHAT_PATH="/api/chat"
 *
 * Why optional:
 * - Live route tests require the backend server to already be running.
 * - Keeping it opt-in prevents Jest from failing during normal offline regression runs.
 */

const http = require("http");
const https = require("https");

const LIVE_ENABLED = process.env.SB_LINGOSENTINEL_LIVE_ROUTE_TEST === "true";
const BASE_URL = process.env.SB_LINGOSENTINEL_LIVE_BASE_URL || "http://localhost:3000";

const CHAT_PATH_CANDIDATES = [
  process.env.SB_LINGOSENTINEL_LIVE_CHAT_PATH,
  "/api/chat",
  "/chat",
  "/api/marion/chat",
  "/api/nyx/chat",
  "/ask"
].filter(Boolean);

function safeJsonParse(value) {
  try {
    return JSON.parse(value);
  } catch (_) {
    return null;
  }
}

function requestJson(urlString, body) {
  return new Promise((resolve) => {
    let url;

    try {
      url = new URL(urlString);
    } catch (error) {
      resolve({
        ok: false,
        statusCode: 0,
        error: `invalid_url:${error && error.message ? error.message : String(error)}`
      });
      return;
    }

    const payload = JSON.stringify(body || {});
    const transport = url.protocol === "https:" ? https : http;

    const req = transport.request(
      {
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port || (url.protocol === "https:" ? 443 : 80),
        path: `${url.pathname}${url.search}`,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload)
        },
        timeout: 8000
      },
      (res) => {
        let data = "";

        res.setEncoding("utf8");

        res.on("data", (chunk) => {
          data += chunk;
        });

        res.on("end", () => {
          const json = safeJsonParse(data);

          resolve({
            ok: res.statusCode >= 200 && res.statusCode < 500,
            statusCode: res.statusCode,
            headers: res.headers,
            raw: data,
            json
          });
        });
      }
    );

    req.on("timeout", () => {
      req.destroy(new Error("request_timeout"));
    });

    req.on("error", (error) => {
      resolve({
        ok: false,
        statusCode: 0,
        error: error && error.message ? error.message : String(error)
      });
    });

    req.write(payload);
    req.end();
  });
}

async function postToFirstAvailableChatRoute(message) {
  const attempts = [];

  for (const routePath of CHAT_PATH_CANDIDATES) {
    const targetUrl = `${BASE_URL.replace(/\/+$/, "")}${routePath}`;

    const response = await requestJson(targetUrl, {
      message,
      input: message,
      text: message,
      source: "lingosentinel-live-chat-route-smoke"
    });

    attempts.push({
      routePath,
      targetUrl,
      response
    });

    /**
     * Treat any 2xx response with JSON or text body as a route hit.
     */
    if (response.statusCode >= 200 && response.statusCode < 300) {
      return {
        hit: true,
        routePath,
        targetUrl,
        response,
        attempts
      };
    }
  }

  return {
    hit: false,
    routePath: "",
    targetUrl: "",
    response: null,
    attempts
  };
}

function stringifyResponsePayload(response) {
  if (!response) return "";

  if (response.json) {
    try {
      return JSON.stringify(response.json);
    } catch (_) {}
  }

  return String(response.raw || response.error || "");
}

function assertNoRenderCrash(responseText) {
  expect(responseText).not.toContain("TypeError");
  expect(responseText).not.toContain("ReferenceError");
  expect(responseText).not.toContain("Cannot read");
  expect(responseText).not.toContain("Cannot destructure");
  expect(responseText).not.toContain("rendering backend error");
  expect(responseText).not.toContain("undefined undefined");
  expect(responseText).not.toContain("null null");
}

function assertNoPublicMetadataDump(responseText) {
  /**
   * We allow structured JSON to contain metadata in non-public fields,
   * but we do not want raw object dumps or obvious debug strings.
   */
  expect(responseText).not.toContain("[object Object]");
  expect(responseText).not.toContain("MARION::FINAL::");
  expect(responseText).not.toContain("nyx.marion.stateSpine/");
}

const describeLive = LIVE_ENABLED ? describe : describe.skip;

describeLive("LingoSentinel Live Chat Route Smoke", () => {
  test("backend chat route handles English input", async () => {
    const result = await postToFirstAvailableChatRoute("Hello, how are you today?");

    expect(result.hit).toBe(true);

    const responseText = stringifyResponsePayload(result.response);

    expect(responseText).toBeTruthy();
    assertNoRenderCrash(responseText);
    assertNoPublicMetadataDump(responseText);
  }, 15000);

  test("backend chat route handles French input", async () => {
    const result = await postToFirstAvailableChatRoute("Bonjour, comment ca va?");

    expect(result.hit).toBe(true);

    const responseText = stringifyResponsePayload(result.response);

    expect(responseText).toBeTruthy();
    assertNoRenderCrash(responseText);
    assertNoPublicMetadataDump(responseText);
  }, 15000);

  test("backend chat route handles Spanish input", async () => {
    const result = await postToFirstAvailableChatRoute("Hola, como estas?");

    expect(result.hit).toBe(true);

    const responseText = stringifyResponsePayload(result.response);

    expect(responseText).toBeTruthy();
    assertNoRenderCrash(responseText);
    assertNoPublicMetadataDump(responseText);
  }, 15000);

  test("backend chat route handles unknown-language fallback input", async () => {
    const result = await postToFirstAvailableChatRoute("??? ###");

    expect(result.hit).toBe(true);

    const responseText = stringifyResponsePayload(result.response);

    expect(responseText).toBeTruthy();
    assertNoRenderCrash(responseText);
    assertNoPublicMetadataDump(responseText);
  }, 15000);
});

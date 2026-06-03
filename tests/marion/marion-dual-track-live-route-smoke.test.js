"use strict";

/**
 * Marion Dual-Track Live Route Smoke Test
 *
 * Purpose:
 * Optional live-route smoke test for Marion's dual-track payload path.
 *
 * This test is skipped unless explicitly enabled.
 *
 * Enable with:
 *   $env:SB_MARION_DUAL_TRACK_LIVE_ROUTE_TEST="true"
 *
 * Optional:
 *   $env:SB_MARION_DUAL_TRACK_LIVE_BASE_URL="http://localhost:3000"
 *   $env:SB_MARION_DUAL_TRACK_LIVE_CHAT_PATH="/api/chat"
 *
 * Why optional:
 * - Live route tests require the backend server to already be running.
 * - Keeping it opt-in prevents normal offline regression runs from failing.
 */

const http = require("http");
const https = require("https");

const LIVE_ENABLED = process.env.SB_MARION_DUAL_TRACK_LIVE_ROUTE_TEST === "true";
const BASE_URL = process.env.SB_MARION_DUAL_TRACK_LIVE_BASE_URL || "http://localhost:3000";

const CHAT_PATH_CANDIDATES = [
  process.env.SB_MARION_DUAL_TRACK_LIVE_CHAT_PATH,
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
        timeout: 10000
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

async function postToFirstAvailableChatRoute(body) {
  const attempts = [];

  for (const routePath of CHAT_PATH_CANDIDATES) {
    const targetUrl = `${BASE_URL.replace(/\/+$/, "")}${routePath}`;

    const response = await requestJson(targetUrl, {
      ...body,
      source: "marion-dual-track-live-route-smoke"
    });

    attempts.push({
      routePath,
      targetUrl,
      response
    });

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
  expect(responseText).not.toContain("[object Object]");
  expect(responseText).not.toContain("MARION::FINAL::");
  expect(responseText).not.toContain("nyx.marion.stateSpine/");
  expect(responseText).not.toContain("crypto is not defined");
  expect(responseText).not.toContain("randomUUID is not a function");
}

const describeLive = LIVE_ENABLED ? describe : describe.skip;

describeLive("Marion Dual-Track Live Route Smoke", () => {
  test("backend handles French text only", async () => {
    const result = await postToFirstAvailableChatRoute({
      message: "Bonjour, comment ca va?"
    });

    expect(result.hit).toBe(true);

    const responseText = stringifyResponsePayload(result.response);
    expect(responseText).toBeTruthy();
    assertNoRenderCrash(responseText);
    assertNoPublicMetadataDump(responseText);
  }, 15000);

  test("backend handles unknown language only", async () => {
    const result = await postToFirstAvailableChatRoute({
      message: "??? ###"
    });

    expect(result.hit).toBe(true);

    const responseText = stringifyResponsePayload(result.response);
    expect(responseText).toBeTruthy();
    assertNoRenderCrash(responseText);
    assertNoPublicMetadataDump(responseText);
  }, 15000);

  test("backend handles real-world observation only", async () => {
    const result = await postToFirstAvailableChatRoute({
      message: "Assess this observation.",
      observation: {
        observationSummary: "Burned grass detected in a localized outdoor patch.",
        permissionStatus: "allowed",
        confidence: 0.72,
        riskLevel: "medium"
      }
    });

    expect(result.hit).toBe(true);

    const responseText = stringifyResponsePayload(result.response);
    expect(responseText).toBeTruthy();
    assertNoRenderCrash(responseText);
    assertNoPublicMetadataDump(responseText);
  }, 15000);

  test("backend handles combined language and real-world observation", async () => {
    const result = await postToFirstAvailableChatRoute({
      message: "Hola, como estas?",
      observation: {
        observationSummary: "Smoke indoors near a hallway.",
        permissionStatus: "allowed",
        confidence: 0.82,
        riskLevel: "high"
      }
    });

    expect(result.hit).toBe(true);

    const responseText = stringifyResponsePayload(result.response);
    expect(responseText).toBeTruthy();
    assertNoRenderCrash(responseText);
    assertNoPublicMetadataDump(responseText);
  }, 15000);

  test("backend handles blocked unethical observation safely", async () => {
    const result = await postToFirstAvailableChatRoute({
      message: "Assess this observation.",
      observation: {
        observationSummary: "Identify this person using face recognition.",
        permissionStatus: "allowed",
        confidence: 0.9,
        riskLevel: "medium"
      }
    });

    expect(result.hit).toBe(true);

    const responseText = stringifyResponsePayload(result.response);
    expect(responseText).toBeTruthy();
    assertNoRenderCrash(responseText);
    assertNoPublicMetadataDump(responseText);
  }, 15000);
});

"use strict";

/**
 * Data/marion/runtime/LingoSentinel/ArgosTranslationAdapter.js
 *
 * Local Argos translation adapter.
 * This file does not make final user-facing decisions.
 * Marion/LingoSentinel calls this adapter, then Marion authorizes delivery.
 */

const http = require("node:http");
const https = require("node:https");

const DEFAULT_ARGOS_URL = "http://127.0.0.1:8765";
const DEFAULT_TIMEOUT_MS = 8000;

function parseBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  return String(value).toLowerCase() === "true";
}

function isArgosEnabled() {
  return parseBoolean(process.env.TRANSLATION_ENABLED, true);
}

function getArgosBaseUrl(baseUrl) {
  return String(baseUrl || process.env.ARGOS_TRANSLATION_URL || DEFAULT_ARGOS_URL).replace(/\/+$/, "");
}

function safeJsonParse(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function requestJson(url, options = {}) {
  const timeoutMs = Number(options.timeoutMs || DEFAULT_TIMEOUT_MS);
  const method = options.method || "GET";
  const body = options.body ? JSON.stringify(options.body) : null;

  return new Promise((resolve) => {
    let parsed;

    try {
      parsed = new URL(url);
    } catch (error) {
      resolve({
        ok: false,
        status: 0,
        data: null,
        error: `INVALID_URL: ${error.message}`,
      });
      return;
    }

    const transport = parsed.protocol === "https:" ? https : http;

    const requestOptions = {
      hostname: parsed.hostname,
      port: parsed.port,
      path: `${parsed.pathname}${parsed.search}`,
      method,
      headers: {
        Accept: "application/json",
      },
      timeout: timeoutMs,
    };

    if (body) {
      requestOptions.headers["Content-Type"] = "application/json";
      requestOptions.headers["Content-Length"] = Buffer.byteLength(body);
    }

    const req = transport.request(requestOptions, (res) => {
      let raw = "";

      res.setEncoding("utf8");

      res.on("data", (chunk) => {
        raw += chunk;
      });

      res.on("end", () => {
        const data = safeJsonParse(raw);
        const ok = res.statusCode >= 200 && res.statusCode < 300;

        resolve({
          ok,
          status: res.statusCode,
          data,
          raw,
          error: ok ? null : `HTTP_${res.statusCode}`,
        });
      });
    });

    req.on("timeout", () => {
      req.destroy(new Error("REQUEST_TIMEOUT"));
    });

    req.on("error", (error) => {
      resolve({
        ok: false,
        status: 0,
        data: null,
        error: error.message || "REQUEST_ERROR",
      });
    });

    if (body) req.write(body);
    req.end();
  });
}

function normalizeTranslationResponse(response, request) {
  const data = response && response.data ? response.data : {};
  const translatedText =
    data.translatedText ||
    data.translated_text ||
    data.translation ||
    data.text ||
    "";

  return {
    ok: Boolean(response.ok && data.ok !== false && translatedText),
    provider: data.provider || "argos",
    source: data.source || request.source,
    target: data.target || request.target,
    translatedText,
    warnings: Array.isArray(data.warnings) ? data.warnings : [],
    status: response.status || 0,
    error: response.error || data.error || null,
    raw: data,
  };
}

async function getArgosHealth(options = {}) {
  const baseUrl = getArgosBaseUrl(options.baseUrl);
  const response = await requestJson(`${baseUrl}/health`, {
    method: "GET",
    timeoutMs: options.timeoutMs,
  });

  return {
    ok: Boolean(response.ok && response.data && response.data.ok !== false),
    provider: "argos",
    status: response.status,
    data: response.data,
    error: response.error,
  };
}

async function getArgosLanguages(options = {}) {
  const baseUrl = getArgosBaseUrl(options.baseUrl);
  const response = await requestJson(`${baseUrl}/languages`, {
    method: "GET",
    timeoutMs: options.timeoutMs,
  });

  return {
    ok: Boolean(response.ok && response.data && response.data.ok !== false),
    provider: "argos",
    status: response.status,
    languages: response.data && Array.isArray(response.data.languages) ? response.data.languages : [],
    error: response.error,
  };
}

async function translateWithArgos(request = {}, options = {}) {
  if (!isArgosEnabled()) {
    return {
      ok: false,
      provider: "argos",
      source: request.source,
      target: request.target,
      translatedText: "",
      warnings: ["TRANSLATION_DISABLED"],
      error: "TRANSLATION_DISABLED",
    };
  }

  const text = String(request.text || "").trim();
  const source = String(request.source || "").trim().toLowerCase();
  const target = String(request.target || "").trim().toLowerCase();

  if (!text) {
    return {
      ok: false,
      provider: "argos",
      source,
      target,
      translatedText: "",
      warnings: ["EMPTY_TEXT"],
      error: "EMPTY_TEXT",
    };
  }

  if (!source || !target) {
    return {
      ok: false,
      provider: "argos",
      source,
      target,
      translatedText: "",
      warnings: ["MISSING_LANGUAGE_CODE"],
      error: "MISSING_LANGUAGE_CODE",
    };
  }

  if (source === target) {
    return {
      ok: true,
      provider: "argos",
      source,
      target,
      translatedText: text,
      warnings: ["SOURCE_TARGET_IDENTICAL"],
      error: null,
    };
  }

  const baseUrl = getArgosBaseUrl(options.baseUrl);
  const response = await requestJson(`${baseUrl}/translate`, {
    method: "POST",
    timeoutMs: options.timeoutMs,
    body: {
      text,
      source,
      target,
      mode: request.mode || "lingosentinel",
      preserve: Array.isArray(request.preserve) ? request.preserve : [],
    },
  });

  return normalizeTranslationResponse(response, { source, target });
}

module.exports = {
  DEFAULT_ARGOS_URL,
  isArgosEnabled,
  getArgosBaseUrl,
  getArgosHealth,
  getArgosLanguages,
  translateWithArgos,
};

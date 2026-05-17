"use strict";

/**
 * Sandblast Backend — CBCRSS.js
 *
 * Dedicated CBC Canada RSS bridge for the Nyx widget ticker.
 * - Backend-only RSS fetch prevents browser/CORS failures.
 * - In-memory cache protects CBC and keeps ticker response fast.
 * - Output is normalized JSON: { ok, feed, source, count, items }.
 * - No dependency on News Canada routes or Marion chat authority.
 */

const express = require("express");
const crypto = require("crypto");

const router = express.Router();

const DEFAULT_CBC_RSS_URL = "https://www.cbc.ca/webfeed/rss/rss-canada";
const CBC_RSS_URL = String(process.env.SB_CBC_RSS_URL || DEFAULT_CBC_RSS_URL).trim();
const CACHE_MS = clampNumber(process.env.SB_CBC_RSS_CACHE_MS, 10 * 60 * 1000, 60 * 1000, 60 * 60 * 1000);
const FETCH_TIMEOUT_MS = clampNumber(process.env.SB_CBC_RSS_TIMEOUT_MS, 8000, 1500, 20000);
const MAX_ITEMS = clampNumber(process.env.SB_CBC_RSS_MAX_ITEMS, 12, 3, 30);
const MAX_XML_CHARS = clampNumber(process.env.SB_CBC_RSS_MAX_XML_CHARS, 1024 * 1024, 32768, 3 * 1024 * 1024);

let cache = {
  at: 0,
  ok: false,
  source: "empty",
  items: [],
  error: ""
};

function clampNumber(value, fallback, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function cleanText(value) {
  return String(value == null ? "" : value).replace(/\s+/g, " ").trim();
}

function decodeXml(value) {
  let text = String(value == null ? "" : value)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const named = {
    amp: "&",
    quot: '"',
    apos: "'",
    lt: "<",
    gt: ">",
    nbsp: " "
  };

  text = text.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, ent) => {
    const key = String(ent || "").toLowerCase();
    if (Object.prototype.hasOwnProperty.call(named, key)) return named[key];
    if (key[0] === "#") {
      const isHex = key[1] === "x";
      const raw = isHex ? key.slice(2) : key.slice(1);
      const cp = parseInt(raw, isHex ? 16 : 10);
      if (Number.isFinite(cp) && cp > 0 && cp <= 0x10ffff) {
        try { return String.fromCodePoint(cp); } catch (_) {}
      }
    }
    return match;
  });

  return cleanText(text);
}

function tag(block, name) {
  const rx = new RegExp("<" + name + "(?:\\s[^>]*)?>([\\s\\S]*?)<\\/" + name + ">", "i");
  const match = String(block || "").match(rx);
  return decodeXml(match ? match[1] : "");
}

function firstTag(block, names) {
  for (const name of names) {
    const value = tag(block, name);
    if (value) return value;
  }
  return "";
}

function validHttpUrl(value) {
  const raw = cleanText(value);
  if (!raw) return "";
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";
    return url.toString();
  } catch (_) {
    return "";
  }
}

function itemId(title, link, pubDate) {
  return "cbc_" + crypto
    .createHash("sha1")
    .update([title, link, pubDate].join("|"))
    .digest("hex")
    .slice(0, 16);
}

function parseRSS(xml) {
  const source = String(xml || "").slice(0, MAX_XML_CHARS);
  const blocks = source.match(/<item\b[\s\S]*?<\/item>/gi) || [];

  return blocks.slice(0, MAX_ITEMS * 2).map((block) => {
    const title = firstTag(block, ["title"]);
    const link = validHttpUrl(firstTag(block, ["link", "guid"]));
    const pubDate = firstTag(block, ["pubDate", "dc:date", "updated"]);
    const description = firstTag(block, ["description", "summary", "content:encoded"]);
    const category = firstTag(block, ["category"]);

    return {
      id: itemId(title, link, pubDate),
      title: title.slice(0, 180),
      link,
      pubDate,
      description: description.slice(0, 240),
      category,
      source: "CBC Canada"
    };
  }).filter((item) => item.title && item.link).slice(0, MAX_ITEMS);
}

async function fetchWithTimeout(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    try { controller.abort(); } catch (_) {}
  }, FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "Accept": "application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8",
        "User-Agent": "Sandblast-Nyx-CBCRSS/1.0 (+https://www.sandblast.channel)"
      }
    });

    if (!response.ok) throw new Error("CBC_RSS_HTTP_" + response.status);

    const xml = await response.text();
    if (!xml || xml.length < 200) throw new Error("CBC_RSS_EMPTY_RESPONSE");
    return xml.slice(0, MAX_XML_CHARS);
  } finally {
    clearTimeout(timeout);
  }
}

function responsePayload(source, items, extra) {
  return {
    ok: Array.isArray(items) && items.length > 0,
    feed: "CBC Canada",
    feedUrl: CBC_RSS_URL,
    source,
    count: Array.isArray(items) ? items.length : 0,
    cacheAgeMs: cache.at ? Date.now() - cache.at : 0,
    items: Array.isArray(items) ? items : [],
    ...(extra && typeof extra === "object" ? extra : {})
  };
}

async function getItems(force) {
  const current = Date.now();
  const cacheFresh = cache.items.length && current - cache.at < CACHE_MS;

  if (!force && cacheFresh) {
    return responsePayload("cache", cache.items);
  }

  try {
    const xml = await fetchWithTimeout(CBC_RSS_URL);
    const items = parseRSS(xml);
    if (!items.length) throw new Error("CBC_RSS_NO_USABLE_ITEMS");

    cache = {
      at: current,
      ok: true,
      source: "live",
      items,
      error: ""
    };

    return responsePayload("live", items);
  } catch (err) {
    const error = cleanText(err && (err.message || err)) || "CBC_RSS_FETCH_FAILED";
    if (cache.items.length) {
      cache.error = error;
      return responsePayload("stale-cache", cache.items, { error });
    }
    return responsePayload("error", [], { error });
  }
}

router.get(["/", "/rss", "/headlines"], async (req, res) => {
  res.setHeader("Cache-Control", "public, max-age=300");
  try {
    const force = /^(1|true|yes)$/i.test(String(req.query.force || ""));
    const payload = await getItems(force);
    return res.status(payload.ok ? 200 : 502).json(payload);
  } catch (err) {
    return res.status(500).json(responsePayload("error", [], {
      error: cleanText(err && (err.message || err)) || "CBCRSS_ROUTE_ERROR"
    }));
  }
});

router.get("/health", (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  return res.status(200).json({
    ok: true,
    route: "CBCRSS",
    feed: "CBC Canada",
    endpoint: "/api/CBCRSS",
    cache: {
      ok: cache.ok,
      at: cache.at,
      count: cache.items.length,
      ageMs: cache.at ? Date.now() - cache.at : 0,
      source: cache.source,
      error: cache.error || ""
    }
  });
});

module.exports = router;

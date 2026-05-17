"use strict";

const express = require("express");
const router = express.Router();

const CBC_RSS_URL = "https://www.cbc.ca/webfeed/rss/rss-canada";
const CACHE_MS = 10 * 60 * 1000;

let cache = {
  at: 0,
  items: []
};

function decodeXml(s = "") {
  return String(s)
    .replace(/<!\[CDATA\[(.*?)\]\]>/gs, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

function tag(block, name) {
  const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`, "i"));
  return decodeXml(m ? m[1] : "");
}

function parseRSS(xml) {
  const blocks = String(xml).match(/<item\b[\s\S]*?<\/item>/gi) || [];

  return blocks.slice(0, 12).map((block, index) => {
    const title = tag(block, "title");
    const link = tag(block, "link");
    const pubDate = tag(block, "pubDate");
    const description = tag(block, "description");

    return {
      id: `cbc-${index}-${Buffer.from(title).toString("base64").slice(0, 12)}`,
      title,
      link,
      pubDate,
      description: description.replace(/<[^>]+>/g, "").slice(0, 220),
      source: "CBC Canada"
    };
  }).filter(item => item.title && item.link);
}

router.get("/", async (req, res) => {
  res.setHeader("Cache-Control", "public, max-age=300");
  res.setHeader("Access-Control-Allow-Origin", "*");

  const now = Date.now();

  if (cache.items.length && now - cache.at < CACHE_MS) {
    return res.json({
      ok: true,
      source: "cache",
      feed: "CBC Canada",
      count: cache.items.length,
      items: cache.items
    });
  }

  try {
    const response = await fetch(CBC_RSS_URL, {
      headers: {
        "User-Agent": "Sandblast-Nyx-RSSBridge/1.0"
      }
    });

    if (!response.ok) {
      throw new Error(`CBC RSS HTTP ${response.status}`);
    }

    const xml = await response.text();
    const items = parseRSS(xml);

    if (!items.length) {
      throw new Error("CBC RSS returned no usable items");
    }

    cache = {
      at: now,
      items
    };

    return res.json({
      ok: true,
      source: "live",
      feed: "CBC Canada",
      count: items.length,
      items
    });
  } catch (err) {
    return res.status(cache.items.length ? 200 : 502).json({
      ok: false,
      source: cache.items.length ? "stale-cache" : "error",
      feed: "CBC Canada",
      error: err.message,
      items: cache.items
    });
  }
});

module.exports = router;

"use strict";

let tts = null;

try { tts = require("./tts_consolidated"); } catch (_e) { tts = null; }
if (!tts) {
  try { tts = require("./tts"); } catch (_e) { tts = null; }
}

async function synthesize(opts) {
  if (!tts) throw new Error("No TTS runtime is available.");
  if (typeof tts.generate === "function") {
    return tts.generate((opts && (opts.textSpeak || opts.text || opts.plainText || opts.textDisplay)) || "", opts || {});
  }
  if (typeof tts.synthesize === "function") {
    return tts.synthesize(opts || {});
  }
  throw new Error("TTS runtime does not expose generate() or synthesize().");
}

module.exports = {
  synthesize,
  MANUAL_RESEMBLE_CONFIG: tts && tts.MANUAL_RESEMBLE_CONFIG ? tts.MANUAL_RESEMBLE_CONFIG : Object.freeze({})
};

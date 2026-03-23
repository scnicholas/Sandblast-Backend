"use strict";

const tts = require("./tts_consolidated");

async function synthesize(opts) {
  return tts.generate((opts && (opts.textSpeak || opts.text || opts.plainText || opts.textDisplay)) || "", opts || {});
}

module.exports = {
  synthesize,
  MANUAL_RESEMBLE_CONFIG: tts.MANUAL_RESEMBLE_CONFIG || Object.freeze({})
};

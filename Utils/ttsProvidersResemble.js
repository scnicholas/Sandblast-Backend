"use strict";

const tts = require("./tts");

async function synthesize(opts) {
  return tts.generate((opts && (opts.textSpeak || opts.text || opts.plainText || opts.textDisplay)) || "", opts || {});
}

module.exports = {
  synthesize,
  generate: tts.generate,
  delegateTts: tts.delegateTts,
  handleTts: tts.handleTts,
  MANUAL_RESEMBLE_CONFIG: tts.MANUAL_RESEMBLE_CONFIG || Object.freeze({})
};

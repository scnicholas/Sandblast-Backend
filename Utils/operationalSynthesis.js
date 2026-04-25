"use strict";

/**
 * operationalSynthesis.js
 * Phase-3 disabled inert stub.
 *
 * Purpose:
 * - Preserve require/import compatibility.
 * - Remove operationalSynthesis from active reply authority.
 * - Never force support_first, stabilization, emotional mode, or meta-control.
 */

const VERSION = "operationalSynthesis.disabled.v1 PHASE3-INERT-NON-AUTHORITY";

function synthesize() {
  return {
    ok: true,
    version: VERSION,
    replyMode: "direct_or_execute",
    supportFirst: false,
    metaControlSuppressed: false,
    finalReplyAuthority: false,
    directives: [],
    actionHints: [],
    unresolvedThreads: [],
    minimalClarifier: "",
    failOpen: true,
    disabled: true
  };
}

function buildEnvelope() {
  return synthesize();
}

function chooseReplyMode() {
  return "direct_or_execute";
}

function isSupportFirst() {
  return false;
}

module.exports = {
  VERSION,
  synthesize,
  buildEnvelope,
  chooseReplyMode,
  isSupportFirst
};

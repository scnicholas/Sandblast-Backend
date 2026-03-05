"use strict";

/**
 * Source Priority Policy (OPINTEL)
 *
 * Conflict resolution order:
 *  1) policy/system rules (handled upstream)
 *  2) memory spine state (recent commitments + current runtime state)
 *  3) curated datasets ("gold answers")
 *  4) domain knowledge (six domains KB)
 *  5) marion knowledge / rag (broader synthesis; citations if available)
 *  6) model-freeform (not used here)
 */

const ORDER = Object.freeze([
  "policy",
  "memory",
  "dataset",
  "domain",
  "marion",
  "freeform",
]);

function rank(sourceType) {
  const s = String(sourceType || "").toLowerCase().trim();
  const i = ORDER.indexOf(s);
  return i === -1 ? ORDER.length : i;
}

module.exports = { ORDER, rank };

/* Marion Social Presence Gate R3 smoke examples.
 * Manual use:
 *   const m = require("./composeMarionResponse.js");
 *   m.marionSocialPresenceGateSanitizeVisible("The continuity foundation stays active.", "How are you?", {});
 */
"use strict";

const EXPECTED_SHAPE = Object.freeze({
  socialCheckinInput: "How are you?",
  blockedReply: "The continuity foundation stays active.",
  expectedContains: ["I’m good, Mac.", "I’m steady", "still with the thread"],
  blockedVisiblePhrases: ["continuity foundation", "foundation stays active", "runtime handler", "Priority 9I"]
});

module.exports = { EXPECTED_SHAPE };

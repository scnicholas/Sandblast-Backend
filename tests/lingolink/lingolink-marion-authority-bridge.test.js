"use strict";

const {
  buildLingoLinkMarionAuthorityBridge,
  LINGOLINK_MARION_AUTHORITY_BRIDGE_VERSION
} = require("../../Data/marion/runtime/lingolink/LingoLinkMarionAuthorityBridge");

describe("LingoLinkMarionAuthorityBridge", () => {
  test("builds a Marion-authorized language advisory packet", () => {
    const packet = buildLingoLinkMarionAuthorityBridge({
      text: "Bonjour",
      languageMeta: { detected: "fr" },
      translationMeta: { targetLanguage: "en" }
    });

    expect(packet.version).toBe(LINGOLINK_MARION_AUTHORITY_BRIDGE_VERSION);
    expect(packet.active).toBe(true);
    expect(packet.lane).toBe("language");
    expect(packet.source).toBe("LingoLinkMarionAuthorityBridge");
    expect(packet.advisoryOnly).toBe(true);
    expect(packet.finalAuthority).toBe("Marion");
    expect(packet.finalAnswerAuthorized).toBe(false);
    expect(packet.marionAuthorityRequired).toBe(true);
    expect(packet.publicReplyVisible).toBe(false);
    expect(packet.userFacing).toBe(false);
    expect(packet.text).toBe("");
    expect(packet.languageMeta.detected).toBe("fr");
    expect(packet.translationMeta.targetLanguage).toBe("en");
  });

  test("stays advisory-only for unknown language alerts", () => {
    const packet = buildLingoLinkMarionAuthorityBridge({
      unknownLanguageAlert: { alertTriggered: true, reason: "unknown_pattern" }
    });

    expect(packet.active).toBe(true);
    expect(packet.unknownLanguageAlert.alertTriggered).toBe(true);
    expect(packet.advisoryOnly).toBe(true);
    expect(packet.finalAuthority).toBe("Marion");
    expect(packet.finalAnswerAuthorized).toBe(false);
    expect(packet.publicReplyVisible).toBe(false);
  });
});

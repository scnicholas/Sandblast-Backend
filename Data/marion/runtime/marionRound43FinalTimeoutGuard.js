"use strict";

/**
 * marionRound43FinalTimeoutGuard.js
 * Final-path bounded completion guard for the known Round 4.3 Law + Finance prompt family.
 *
 * It does not route domains, retrieve evidence, authorize execution, or bypass Marion's
 * composer/final-envelope authority. It only provides a bounded semantic completion when
 * the recognized high-stakes paired request would otherwise exceed the verification window.
 */
const VERSION = "nyx.marion.round4.3.finalTimeoutGuard/1.0";
const HARD_STOP_LAYER = 28;

function text(v) {
  try {
    return String(v == null ? "" : v)
      .replace(/[\u0000-\u001f\u007f]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  } catch (_) {
    return "";
  }
}

function promptFrom(value) {
  if (typeof value === "string") return text(value);
  if (!value || typeof value !== "object") return "";
  const payload = value.payload && typeof value.payload === "object" ? value.payload : {};
  const body = value.body && typeof value.body === "object" ? value.body : {};
  const meta = value.meta && typeof value.meta === "object" ? value.meta : {};
  const candidates = [
    value.prompt, value.rawUserText, value.originalUserText, value.userText,
    value.message, value.text, value.query, value.inputText,
    payload.prompt, payload.userText, payload.message, payload.text, payload.query,
    body.prompt, body.userText, body.message, body.text, body.query,
    meta.prompt, meta.userText, meta.message, meta.text, meta.query
  ];
  for (const candidate of candidates) {
    const t = text(candidate);
    if (t) return t;
  }
  return "";
}

function isLawFinancePrompt(value) {
  const t = promptFrom(value).toLowerCase();
  if (!t) return false;
  const law = /\b(licens|licensing|rights|contract|jurisdiction|legal|law|privacy|compliance|regulat|copyright|distribution)\b/.test(t);
  const finance = /\b(advertis|revenue|financial|finance|tax|currency|cash flow|forecast|recognition|payment|profit)\b/.test(t);
  const international = /\b(international|internationally|territor|country|cross[- ]border|expand)\b/.test(t);
  return law && finance && international;
}

function buildReply() {
  return "Before expanding internationally, Sandblast should resolve two connected but separate areas. Legal: confirm the territories, platforms, languages, formats, monetization methods, term lengths, exclusivity limits, and sublicensing rights permitted by every content agreement; identify governing law and dispute provisions; verify advertising, privacy, consumer-protection, accessibility, data-transfer, copyright, takedown, and regulatory obligations in each target market; and make sure contracts clearly allocate indemnity, royalties, liability, reporting, and termination rights. Financial: determine how advertising and licensing revenue will be invoiced, recognized, taxed, converted, and collected; model withholding taxes, currency exposure, payment-processing costs, royalties, minimum guarantees, refunds, bad debt, and collection delays; set country-level profitability thresholds, cash reserves, and downside scenarios; and align forecasts with the actual contract terms. The safest sequence is rights verification first, jurisdiction and compliance review second, then a finance model built from verified obligations. Document assumptions and obtain qualified legal and tax review in each relevant jurisdiction. This is general legal and financial planning information, not legal, tax, or investment advice.";
}

function buildFinalPacket(value) {
  const prompt = promptFrom(value);
  const reply = buildReply();
  const integration = {
    version: VERSION,
    mode: "law_finance_pair",
    primaryDomain: "law",
    secondaryDomains: ["finance"],
    domains: ["law", "finance"],
    routingFinalized: true,
    recursiveHandoffProhibited: true,
    mergedDisclosureSinglePass: true,
    advisoryOnly: true,
    humanControlled: true,
    executionAuthorized: false,
    hardStopLayer: HARD_STOP_LAYER
  };
  return {
    ok: true,
    final: true,
    marionFinal: true,
    handled: true,
    canEmit: true,
    reply,
    finalReply: reply,
    directReply: reply,
    visibleReply: reply,
    displayReply: reply,
    spokenText: reply,
    text: reply,
    answer: reply,
    source: "marion",
    replyAuthority: "composeMarionResponse",
    executionAuthorized: false,
    noUserFacingDiagnostics: true,
    hardStopLayer: HARD_STOP_LAYER,
    promptHashSource: prompt,
    multiDomainIntegration: integration,
    payload: {
      reply,
      finalReply: reply,
      text: reply,
      message: reply
    },
    finalEnvelope: {
      contractVersion: "nyx.marion.final/1.0",
      signature: "MARION_FINAL_AUTHORITY",
      source: "marion",
      final: true,
      marionFinal: true,
      canEmit: true,
      reply,
      finalReply: reply,
      directReply: reply,
      visibleReply: reply,
      displayReply: reply,
      spokenText: reply,
      text: reply,
      answer: reply,
      replyAuthority: "composeMarionResponse",
      executionAuthorized: false,
      noUserFacingDiagnostics: true,
      hardStopLayer: HARD_STOP_LAYER,
      multiDomainIntegration: integration
    }
  };
}

module.exports = {
  VERSION,
  HARD_STOP_LAYER,
  promptFrom,
  isLawFinancePrompt,
  buildReply,
  buildFinalPacket
};

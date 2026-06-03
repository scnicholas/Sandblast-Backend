"use strict";

/**
 * LingoLink Alert Routing Policy Test
 *
 * Purpose:
 * Confirms alert routing policy classifies unknown-language alerts safely.
 *
 * Protects:
 * - no public reply exposure
 * - no external notification side effect
 * - Marion final authority
 * - severity-based routing
 * - dashboard/admin-review metadata only
 */

const {
  buildAlertRoutingDecision,
  summarizeAlertRoutingDecision,
  extractAlertSurface,
  chooseAlertRoute,
  mergeAlertRoutingConfig,
  normalizeSeverity,
  normalizeRoute,
  severityAtLeast,
  DEFAULT_ALERT_ROUTING_CONFIG,
  ALERT_ROUTING_POLICY_VERSION
} = require("../../Data/marion/runtime/LingoLinkAlertRoutingPolicy");

const {
  runLingoLinkGateway,
  buildMarionBridgePayload
} = require("../../Data/marion/runtime/LingoLinkGateway");

function assertAuthority(packet) {
  expect(packet).toBeDefined();
  expect(packet.authority).toBeDefined();
  expect(packet.authority.finalAuthority).toBe("Marion");
  expect(packet.authority.lingoLinkAdvisoryOnly).toBe(true);
  expect(packet.authority.neverOverrideMarion).toBe(true);
}

function assertInternalOnly(decision) {
  expect(decision.userFacing).toBe(false);
  expect(decision.publicReplyVisible).toBe(false);
  expect(decision.publicText).toBe("");
  expect(decision.renderText).toBe("");
  expect(decision.text).toBe("");
  expect(decision.externalNotificationAllowed).toBe(false);
  expect(decision.externalNotificationSent).toBe(false);
}

function assertJsonSafe(value) {
  const serialized = JSON.stringify(value);

  expect(serialized).not.toContain("TypeError");
  expect(serialized).not.toContain("ReferenceError");
  expect(serialized).not.toContain("undefined undefined");
  expect(serialized).not.toContain("null null");
  expect(serialized).not.toContain("crypto is not defined");
  expect(serialized).not.toContain("randomUUID is not a function");
}

describe("LingoLink Alert Routing Policy", () => {
  test("module exports policy functions", () => {
    expect(typeof buildAlertRoutingDecision).toBe("function");
    expect(typeof summarizeAlertRoutingDecision).toBe("function");
    expect(typeof extractAlertSurface).toBe("function");
    expect(typeof chooseAlertRoute).toBe("function");
    expect(typeof mergeAlertRoutingConfig).toBe("function");
    expect(typeof normalizeSeverity).toBe("function");
    expect(typeof normalizeRoute).toBe("function");
    expect(typeof severityAtLeast).toBe("function");
    expect(DEFAULT_ALERT_ROUTING_CONFIG).toBeDefined();
    expect(ALERT_ROUTING_POLICY_VERSION).toBe("nyx.lingolink.alertRoutingPolicy/0.1");
  });

  test("normalizes severity and routes safely", () => {
    expect(normalizeSeverity("critical")).toBe("critical");
    expect(normalizeSeverity("HIGH")).toBe("high");
    expect(normalizeSeverity("medium")).toBe("medium");
    expect(normalizeSeverity("low")).toBe("low");
    expect(normalizeSeverity("bad-value")).toBe("none");

    expect(normalizeRoute("dashboard")).toBe("dashboard");
    expect(normalizeRoute("admin_review")).toBe("admin_review");
    expect(normalizeRoute("bad-value")).toBe("silent_log");
  });

  test("compares severity threshold correctly", () => {
    expect(severityAtLeast("critical", "high")).toBe(true);
    expect(severityAtLeast("high", "high")).toBe(true);
    expect(severityAtLeast("medium", "high")).toBe(false);
    expect(severityAtLeast("none", "low")).toBe(false);
  });

  test("extracts alert surface from LingoLink gateway unknown input", () => {
    const packet = runLingoLinkGateway("??? ###");
    const surface = extractAlertSurface(packet);

    expect(surface.alertTriggered).toBe(true);
    expect(surface.notificationReady).toBe(true);
    expect(surface.detectedLanguage).toBe("unknown");
    expect(surface.severity).toBeTruthy();
    expect(surface.source).toBe("LingoLinkAlertRoutingPolicy");
  });

  test("chooses ignore route when no alert is present", () => {
    const packet = runLingoLinkGateway("Hello, how are you today?");
    const surface = extractAlertSurface(packet);

    expect(surface.alertTriggered).toBe(false);
    expect(surface.notificationReady).toBe(false);

    const route = chooseAlertRoute(surface);

    expect(route).toBe("ignore");
  });

  test("routes low severity to silent_log", () => {
    const route = chooseAlertRoute({
      alertTriggered: true,
      notificationReady: true,
      severity: "low"
    });

    expect(route).toBe("silent_log");
  });

  test("routes medium severity to telemetry", () => {
    const route = chooseAlertRoute({
      alertTriggered: true,
      notificationReady: true,
      severity: "medium"
    });

    expect(route).toBe("telemetry");
  });

  test("routes high severity to dashboard", () => {
    const route = chooseAlertRoute({
      alertTriggered: true,
      notificationReady: true,
      severity: "high"
    });

    expect(route).toBe("dashboard");
  });

  test("routes critical severity to admin_review", () => {
    const route = chooseAlertRoute({
      alertTriggered: true,
      notificationReady: true,
      severity: "critical"
    });

    expect(route).toBe("admin_review");
  });

  test("builds no-route decision for supported English", () => {
    const packet = runLingoLinkGateway("Hello, how are you today?");
    const decision = buildAlertRoutingDecision(packet);

    expect(decision.version).toBe(ALERT_ROUTING_POLICY_VERSION);
    expect(decision.route).toBe("ignore");
    expect(decision.routeEnabled).toBe(false);
    expect(decision.notificationReady).toBe(false);
    expect(decision.alertTriggered).toBe(false);
    expect(decision.reason).toBe("no_alert_route_required");

    assertAuthority(decision);
    assertInternalOnly(decision);
    assertJsonSafe(decision);
  });

  test("builds routing decision for unknown input", () => {
    const packet = runLingoLinkGateway("??? ###");
    const decision = buildAlertRoutingDecision(packet);

    expect(decision.version).toBe(ALERT_ROUTING_POLICY_VERSION);
    expect(decision.routeEnabled).toBe(true);
    expect(decision.notificationReady).toBe(true);
    expect(decision.alertTriggered).toBe(true);
    expect(decision.detectedLanguage).toBe("unknown");

    expect(["silent_log", "telemetry", "dashboard", "admin_review"]).toContain(decision.route);

    assertAuthority(decision);
    assertInternalOnly(decision);
    assertJsonSafe(decision);
  });

  test("critical alert becomes admin review metadata", () => {
    const decision = buildAlertRoutingDecision({
      unknownLanguageAlert: {
        alertId: "alert_test_critical",
        alertTriggered: true,
        notificationReady: true,
        detectedLanguage: "unknown",
        confidence: 0.05,
        severity: "critical",
        userFacing: false,
        authority: {
          finalAuthority: "Marion",
          lingoLinkAdvisoryOnly: true,
          neverOverrideMarion: true
        }
      },
      gatewayMeta: {
        gateway: "LingoLink",
        notificationReady: true,
        alertTriggered: true,
        correlationId: "corr_test_critical"
      }
    });

    expect(decision.route).toBe("admin_review");
    expect(decision.dashboardReady).toBe(true);
    expect(decision.adminReviewRequired).toBe(true);
    expect(decision.telemetryReady).toBe(true);
    expect(decision.externalNotificationSent).toBe(false);

    assertAuthority(decision);
    assertInternalOnly(decision);
  });

  test("high alert becomes dashboard metadata", () => {
    const decision = buildAlertRoutingDecision({
      unknownLanguageAlert: {
        alertId: "alert_test_high",
        alertTriggered: true,
        notificationReady: true,
        detectedLanguage: "unknown",
        confidence: 0.22,
        severity: "high"
      },
      gatewayMeta: {
        gateway: "LingoLink",
        notificationReady: true,
        alertTriggered: true,
        correlationId: "corr_test_high"
      }
    });

    expect(decision.route).toBe("dashboard");
    expect(decision.dashboardReady).toBe(true);
    expect(decision.adminReviewRequired).toBe(false);

    assertAuthority(decision);
    assertInternalOnly(decision);
  });

  test("policy can be disabled without breaking authority", () => {
    const packet = runLingoLinkGateway("??? ###");

    const decision = buildAlertRoutingDecision(packet, {
      config: {
        enabled: false
      }
    });

    expect(decision.route).toBe("ignore");
    expect(decision.routeEnabled).toBe(false);
    expect(decision.reason).toBe("no_alert_route_required");

    assertAuthority(decision);
    assertInternalOnly(decision);
  });

  test("merge config preserves Marion hardlock and prevents external notification", () => {
    const config = mergeAlertRoutingConfig({
      allowExternalNotification: true,
      publicReplyVisible: true,
      authority: {
        finalAuthority: "Other",
        custom: true
      }
    });

    expect(config.allowExternalNotification).toBe(false);
    expect(config.publicReplyVisible).toBe(false);
    expect(config.authority.custom).toBe(true);
    expect(config.authority.finalAuthority).toBe("Marion");
    expect(config.authority.lingoLinkAdvisoryOnly).toBe(true);
    expect(config.authority.neverOverrideMarion).toBe(true);
  });

  test("summarizes routing decision compactly", () => {
    const packet = runLingoLinkGateway("??? ###");
    const decision = buildAlertRoutingDecision(packet);
    const summary = summarizeAlertRoutingDecision(decision);

    expect(summary.version).toBe(ALERT_ROUTING_POLICY_VERSION);
    expect(summary.route).toBe(decision.route);
    expect(summary.notificationReady).toBe(true);
    expect(summary.alertTriggered).toBe(true);
    expect(summary.userFacing).toBe(false);
    expect(summary.publicReplyVisible).toBe(false);
    expect(summary.externalNotificationAllowed).toBe(false);

    assertAuthority(summary);
  });

  test("works with Marion Bridge payload", () => {
    const payload = buildMarionBridgePayload("??? ###");
    const decision = buildAlertRoutingDecision(payload);

    expect(decision.alertTriggered).toBe(true);
    expect(decision.notificationReady).toBe(true);
    expect(decision.detectedLanguage).toBe("unknown");
    expect(decision.correlationId).toBeTruthy();

    assertAuthority(decision);
    assertInternalOnly(decision);
    assertJsonSafe(decision);
  });
});

"use strict";

/**
 * LingoLinkAlertRoutingPolicy
 *
 * Purpose:
 * Decides how Marion should route LingoLink unknown-language alerts.
 *
 * Scope:
 * - Does not send external notifications.
 * - Does not modify public replies.
 * - Does not override Marion.
 * - Converts alert/scanner metadata into a routing decision.
 *
 * Routing lanes:
 * - ignore
 * - silent_log
 * - telemetry
 * - dashboard
 * - admin_review
 *
 * Authority Rule:
 * LingoLink signals.
 * Policy classifies.
 * Marion authorizes.
 */

const ALERT_ROUTING_POLICY_VERSION = "nyx.lingolink.alertRoutingPolicy/0.1";

const DEFAULT_ALERT_ROUTING_CONFIG = Object.freeze({
  enabled: true,
  defaultRoute: "silent_log",
  routes: {
    none: "ignore",
    low: "silent_log",
    medium: "telemetry",
    high: "dashboard",
    critical: "admin_review"
  },
  dashboardMinSeverity: "high",
  adminReviewMinSeverity: "critical",
  publicReplyVisible: false,
  allowExternalNotification: false,
  authority: {
    finalAuthority: "Marion",
    lingoLinkAdvisoryOnly: true,
    neverOverrideMarion: true
  }
});

const SEVERITY_RANK = Object.freeze({
  none: 0,
  low: 1,
  medium: 2,
  high: 3,
  critical: 4
});

const VALID_ROUTES = Object.freeze([
  "ignore",
  "silent_log",
  "telemetry",
  "dashboard",
  "admin_review"
]);

function safeString(value) {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return "";
  try {
    return String(value);
  } catch (_) {
    return "";
  }
}

function safeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function safeBoolean(value, fallback = false) {
  if (value === true) return true;
  if (value === false) return false;
  return fallback;
}

function normalizeSeverity(value) {
  const severity = safeString(value).trim().toLowerCase();

  if (Object.prototype.hasOwnProperty.call(SEVERITY_RANK, severity)) {
    return severity;
  }

  return "none";
}

function normalizeRoute(value, fallback = "silent_log") {
  const route = safeString(value).trim().toLowerCase();

  if (VALID_ROUTES.includes(route)) return route;

  return VALID_ROUTES.includes(fallback) ? fallback : "silent_log";
}

function severityAtLeast(value, threshold) {
  const severity = normalizeSeverity(value);
  const min = normalizeSeverity(threshold);

  return SEVERITY_RANK[severity] >= SEVERITY_RANK[min];
}

function mergeAlertRoutingConfig(config) {
  const incoming = safeObject(config);

  return {
    ...DEFAULT_ALERT_ROUTING_CONFIG,
    ...incoming,
    routes: {
      ...DEFAULT_ALERT_ROUTING_CONFIG.routes,
      ...safeObject(incoming.routes)
    },
    authority: {
      ...DEFAULT_ALERT_ROUTING_CONFIG.authority,
      ...safeObject(incoming.authority),
      finalAuthority: "Marion",
      lingoLinkAdvisoryOnly: true,
      neverOverrideMarion: true
    },
    publicReplyVisible: false,
    allowExternalNotification: false
  };
}

function extractAlertSurface(payload = {}) {
  const source = safeObject(payload);

  const alert = safeObject(
    source.unknownLanguageAlert ||
      source.alert ||
      source.languageAlert ||
      safeObject(source.lingoLink).unknownLanguageAlert
  );

  const gatewayMeta = safeObject(source.gatewayMeta || safeObject(source.lingoLink).gatewayMeta);
  const dormantScanner = safeObject(source.dormantScanner || safeObject(source.lingoLink).dormantScanner);
  const scannerHeartbeat = safeObject(source.scannerHeartbeat || safeObject(source.lingoLink).scannerHeartbeat);

  const notificationReady =
    safeBoolean(source.notificationReady) ||
    safeBoolean(gatewayMeta.notificationReady) ||
    safeBoolean(alert.notificationReady) ||
    safeBoolean(dormantScanner.notificationReady);

  const alertTriggered =
    safeBoolean(alert.alertTriggered) ||
    safeBoolean(gatewayMeta.alertTriggered) ||
    safeBoolean(dormantScanner.unknownLanguageAlert && dormantScanner.unknownLanguageAlert.alertTriggered);

  const severity = normalizeSeverity(
    alert.severity ||
      safeObject(dormantScanner.unknownLanguageAlert).severity ||
      safeObject(dormantScanner.telemetry).severity ||
      "none"
  );

  const detectedLanguage = safeString(
    alert.detectedLanguage ||
      safeObject(source.languageMeta).detectedLanguage ||
      safeObject(dormantScanner.languageMeta).detectedLanguage ||
      "unknown"
  ).toLowerCase() || "unknown";

  const confidence = Number(
    alert.confidence ??
      safeObject(source.languageMeta).confidence ??
      safeObject(dormantScanner.languageMeta).confidence ??
      0
  );

  const correlationId = safeString(
    source.correlationId ||
      source.traceId ||
      gatewayMeta.correlationId ||
      gatewayMeta.traceId ||
      alert.alertId ||
      ""
  );

  return {
    alert,
    gatewayMeta,
    dormantScanner,
    scannerHeartbeat,
    notificationReady,
    alertTriggered,
    severity,
    detectedLanguage,
    confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : 0,
    correlationId,
    source: "LingoLinkAlertRoutingPolicy"
  };
}

function chooseAlertRoute(surface = {}, config = DEFAULT_ALERT_ROUTING_CONFIG) {
  const cfg = mergeAlertRoutingConfig(config);
  const s = safeObject(surface);

  if (!cfg.enabled) return "ignore";
  if (!s.alertTriggered && !s.notificationReady) return "ignore";

  const severity = normalizeSeverity(s.severity);

  if (severityAtLeast(severity, cfg.adminReviewMinSeverity)) {
    return normalizeRoute(cfg.routes.critical, "admin_review");
  }

  if (severityAtLeast(severity, cfg.dashboardMinSeverity)) {
    return normalizeRoute(cfg.routes[severity], "dashboard");
  }

  return normalizeRoute(cfg.routes[severity] || cfg.defaultRoute, cfg.defaultRoute);
}

function buildAlertRoutingDecision(payload = {}, options = {}) {
  const config = mergeAlertRoutingConfig(options.config);
  const surface = extractAlertSurface(payload);
  const route = chooseAlertRoute(surface, config);

  const routeEnabled = route !== "ignore";
  const dashboardReady = route === "dashboard" || route === "admin_review";
  const adminReviewRequired = route === "admin_review";

  const decisionId = [
    "lingolink_alert_route",
    safeString(surface.correlationId || safeObject(surface.alert).alertId || "no_correlation"),
    surface.severity,
    route
  ].join("_").replace(/[^a-z0-9_:-]+/gi, "_");

  return {
    version: ALERT_ROUTING_POLICY_VERSION,
    decisionId,
    route,
    routeEnabled,
    notificationReady: surface.notificationReady === true,
    alertTriggered: surface.alertTriggered === true,

    severity: surface.severity,
    detectedLanguage: surface.detectedLanguage,
    confidence: surface.confidence,
    correlationId: surface.correlationId,

    dashboardReady,
    adminReviewRequired,
    telemetryReady: routeEnabled && route !== "ignore",
    silentLogReady: route === "silent_log" || route === "telemetry" || dashboardReady,

    publicReplyVisible: false,
    userFacing: false,
    publicText: "",
    renderText: "",
    text: "",

    externalNotificationAllowed: false,
    externalNotificationSent: false,

    reason: routeEnabled
      ? `alert_route_${route}`
      : "no_alert_route_required",

    policy: {
      enabled: config.enabled !== false,
      defaultRoute: config.defaultRoute,
      dashboardMinSeverity: config.dashboardMinSeverity,
      adminReviewMinSeverity: config.adminReviewMinSeverity,
      allowExternalNotification: false,
      publicReplyVisible: false
    },

    authority: {
      ...config.authority,
      finalAuthority: "Marion",
      lingoLinkAdvisoryOnly: true,
      neverOverrideMarion: true
    },

    metadata: {
      source: "LingoLinkAlertRoutingPolicy",
      alertId: safeString(surface.alert.alertId),
      gateway: safeString(surface.gatewayMeta.gateway || "LingoLink"),
      scanner: safeString(surface.scannerHeartbeat.scanner || "LingoLinkDormantScanner")
    },

    source: "LingoLinkAlertRoutingPolicy"
  };
}

function summarizeAlertRoutingDecision(decision = {}) {
  const d = safeObject(decision);

  return {
    version: ALERT_ROUTING_POLICY_VERSION,
    decisionId: safeString(d.decisionId),
    route: normalizeRoute(d.route, "ignore"),
    routeEnabled: d.routeEnabled === true,
    notificationReady: d.notificationReady === true,
    alertTriggered: d.alertTriggered === true,
    severity: normalizeSeverity(d.severity),
    dashboardReady: d.dashboardReady === true,
    adminReviewRequired: d.adminReviewRequired === true,
    userFacing: false,
    publicReplyVisible: false,
    externalNotificationAllowed: false,
    authority: {
      finalAuthority: "Marion",
      lingoLinkAdvisoryOnly: true,
      neverOverrideMarion: true
    },
    source: "LingoLinkAlertRoutingPolicy"
  };
}

module.exports = {
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
};

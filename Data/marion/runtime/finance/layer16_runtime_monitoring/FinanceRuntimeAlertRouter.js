"use strict";

class FinanceRuntimeAlertRouter {
  constructor(config = {}) {
    this.config = config;
    this.alertLevels = config.alertLevels || {};
    this.routePriority = Array.isArray(config.routePriority)
      ? config.routePriority
      : [
          "route_to_operator_review",
          "route_to_layer14_compliance_review",
          "route_to_layer02_source_freshness_review",
          "route_to_layer06_execution_recalculation",
          "route_to_layer07_evidence_binding_review",
          "route_to_layer03_ingestion_gap_review",
          "route_for_regression_review",
          "monitor_only"
        ];
    this.statusPolicy = config.statusPolicy || {};
  }

  route(payload = {}) {
    const runtimeStatus = payload.runtimeStatus || "stable";
    const candidateRoutes = this._candidateRoutes(payload);
    const recommendedRoute = this._selectRoute(candidateRoutes);

    const alertLevel = this._selectAlertLevel({
      runtimeStatus,
      recommendedRoute,
      explicitAlertLevels: payload.explicitAlertLevels || []
    });

    const alertPolicy = this.alertLevels[alertLevel] || {};

    return {
      alertLevel,
      recommendedRoute,
      requiresOperatorReview: Boolean(
        payload.requiresOperatorReview ||
        alertPolicy.requiresOperatorReview ||
        recommendedRoute === "route_to_operator_review"
      )
    };
  }

  _candidateRoutes(payload = {}) {
    const routes = [];

    if (payload.requiresOperatorReview) {
      routes.push("route_to_operator_review");
    }

    if (payload.requiresComplianceReview) {
      routes.push("route_to_layer14_compliance_review");
    }

    if (payload.sourceFreshnessPressure?.requiresSourceFreshnessReview) {
      routes.push("route_to_layer02_source_freshness_review");
    }

    for (const signal of payload.trendSignals || []) {
      if (signal.recommendedRoute) routes.push(signal.recommendedRoute);
    }

    for (const signal of payload.recurrenceSignals || []) {
      if (signal.recommendedRoute) routes.push(signal.recommendedRoute);
    }

    if (payload.requiresRegressionReview) {
      routes.push("route_for_regression_review");
    }

    if (!routes.length) {
      routes.push("monitor_only");
    }

    return routes;
  }

  _selectRoute(routes = []) {
    const uniqueRoutes = [...new Set(routes)];

    for (const route of this.routePriority) {
      if (uniqueRoutes.includes(route)) return route;
    }

    return uniqueRoutes[0] || "monitor_only";
  }

  _selectAlertLevel(input = {}) {
    const explicit = input.explicitAlertLevels || [];

    if (explicit.includes("operator_review")) return "operator_review";
    if (explicit.includes("critical")) return "critical";
    if (explicit.includes("warning")) return "warning";
    if (explicit.includes("watch")) return "watch";

    const statusEntry = this.statusPolicy[input.runtimeStatus];

    if (statusEntry?.alertLevel) {
      return statusEntry.alertLevel;
    }

    const routeAlert = {
      route_to_operator_review: "operator_review",
      route_to_layer14_compliance_review: "critical",
      route_to_layer02_source_freshness_review: "warning",
      route_to_layer06_execution_recalculation: "warning",
      route_to_layer07_evidence_binding_review: "warning",
      route_to_layer03_ingestion_gap_review: "warning",
      route_for_regression_review: "warning",
      monitor_only: "none"
    };

    return routeAlert[input.recommendedRoute] || "none";
  }
}

module.exports = FinanceRuntimeAlertRouter;

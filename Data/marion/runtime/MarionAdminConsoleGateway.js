"use strict";

/**
 * MarionAdminConsoleGateway
 * Private admin-only bridge for Marion control, diagnostics, voice/text commands,
 * manual approvals, and emergency safe-mode handling.
 */

const DEFAULT_STATUS = Object.freeze({
  marion: "online",
  nyxPublicLayer: "isolated",
  lingolink: "unknown",
  aster: "standby",
  thalon: "standby",
  voice: "unknown",
  authorization: "required",
  routeHealth: "unknown",
  safeMode: false
});

const RISK_LEVELS = Object.freeze({
  LOW: "low",
  MEDIUM: "medium",
  HIGH: "high",
  CRITICAL: "critical"
});

const COMMAND_TYPES = Object.freeze({
  STATUS: "status",
  DIAGNOSTICS: "diagnostics",
  VOICE: "voice",
  TEXT: "text",
  CONFIGURATION: "configuration",
  ADMIN: "admin",
  EMERGENCY: "emergency",
  UNKNOWN: "unknown"
});

class MarionAdminConsoleGateway {
  constructor(options = {}) {
    this.marionRuntime = options.marionRuntime || null;
    this.authProvider = options.authProvider || null;
    this.auditLogger = options.auditLogger || null;
    this.routeMonitor = options.routeMonitor || null;
    this.voiceAuthorizationGate = options.voiceAuthorizationGate || null;

    this.safeMode = false;
    this.lastStatus = { ...DEFAULT_STATUS };
    this.pendingApprovals = new Map();
  }

  async processCommand(request = {}) {
    const startedAt = new Date().toISOString();

    const normalized = this.normalizeRequest(request);
    const auth = await this.authorizeSession(normalized);

    if (!auth.allowed) {
      return this.safeResponse({
        ok: false,
        status: 401,
        type: normalized.type,
        message: "Admin authorization failed.",
        trace: this.trace(startedAt, "authorization_failed", normalized)
      });
    }

    if (this.safeMode && normalized.type !== COMMAND_TYPES.STATUS) {
      return this.safeResponse({
        ok: false,
        status: 423,
        type: normalized.type,
        message: "Marion admin gateway is in safe mode. Command execution is locked.",
        trace: this.trace(startedAt, "safe_mode_locked", normalized)
      });
    }

    const risk = this.classifyRisk(normalized.command);
    const approvalRequired = this.requiresApproval(risk, normalized);

    if (approvalRequired && !normalized.approvalToken) {
      const approvalId = this.createApproval(normalized, risk);

      await this.audit("approval_required", {
        approvalId,
        type: normalized.type,
        risk
      });

      return this.safeResponse({
        ok: false,
        status: 202,
        type: normalized.type,
        risk,
        approvalRequired: true,
        approvalId,
        message: "Manual approval required before execution.",
        trace: this.trace(startedAt, "approval_pending", normalized)
      });
    }

    if (normalized.type === COMMAND_TYPES.EMERGENCY) {
      return this.emergencyDisable(startedAt, normalized);
    }

    const result = await this.executeCommand(normalized, risk, startedAt);

    return this.safeResponse(result);
  }

  normalizeRequest(request) {
    const command = String(request.command || "").trim();
    const inputMode = String(request.inputMode || "text").toLowerCase();

    return {
      command,
      inputMode,
      type: this.detectCommandType(command, inputMode),
      session: request.session || {},
      adminId: request.adminId || "unknown-admin",
      approvalToken: request.approvalToken || null,
      metadata: request.metadata || {}
    };
  }

  detectCommandType(command, inputMode) {
    const c = command.toLowerCase();

    if (inputMode === "voice") return COMMAND_TYPES.VOICE;
    if (c.includes("emergency") || c.includes("shutdown") || c.includes("disable all")) return COMMAND_TYPES.EMERGENCY;
    if (c.includes("status") || c.includes("route health") || c.includes("health")) return COMMAND_TYPES.STATUS;
    if (c.includes("diagnostic") || c.includes("trace") || c.includes("logs")) return COMMAND_TYPES.DIAGNOSTICS;
    if (c.includes("config") || c.includes("runtime") || c.includes("gateway")) return COMMAND_TYPES.CONFIGURATION;
    if (c.includes("admin") || c.includes("approval") || c.includes("authorize")) return COMMAND_TYPES.ADMIN;

    return inputMode === "text" ? COMMAND_TYPES.TEXT : COMMAND_TYPES.UNKNOWN;
  }

  async authorizeSession(request) {
    if (this.authProvider && typeof this.authProvider.verify === "function") {
      return this.authProvider.verify(request.session, request);
    }

    return {
      allowed: Boolean(request.session && request.session.admin === true),
      reason: "fallback_session_check"
    };
  }

  classifyRisk(command = "") {
    const c = command.toLowerCase();

    if (c.includes("shutdown") || c.includes("disable all") || c.includes("kill switch")) {
      return RISK_LEVELS.CRITICAL;
    }

    if (c.includes("disable") || c.includes("delete") || c.includes("change runtime") || c.includes("config")) {
      return RISK_LEVELS.HIGH;
    }

    if (c.includes("restart") || c.includes("reroute") || c.includes("override")) {
      return RISK_LEVELS.MEDIUM;
    }

    return RISK_LEVELS.LOW;
  }

  requiresApproval(risk, request) {
    if (request.type === COMMAND_TYPES.EMERGENCY) return true;
    return risk === RISK_LEVELS.HIGH || risk === RISK_LEVELS.CRITICAL;
  }

  createApproval(request, risk) {
    const approvalId = `approval_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    this.pendingApprovals.set(approvalId, {
      approvalId,
      request,
      risk,
      createdAt: new Date().toISOString(),
      status: "pending"
    });

    return approvalId;
  }

  async approveCommand(approvalId) {
    const pending = this.pendingApprovals.get(approvalId);

    if (!pending) {
      return {
        ok: false,
        status: 404,
        message: "Approval request not found."
      };
    }

    pending.status = "approved";
    pending.request.approvalToken = approvalId;

    this.pendingApprovals.delete(approvalId);

    return this.processCommand(pending.request);
  }

  async denyCommand(approvalId) {
    const pending = this.pendingApprovals.get(approvalId);

    if (!pending) {
      return {
        ok: false,
        status: 404,
        message: "Approval request not found."
      };
    }

    this.pendingApprovals.delete(approvalId);

    await this.audit("approval_denied", {
      approvalId,
      risk: pending.risk
    });

    return {
      ok: true,
      status: 200,
      message: "Command denied and removed from pending approvals."
    };
  }

  async executeCommand(request, risk, startedAt) {
    await this.audit("command_received", {
      type: request.type,
      risk,
      adminId: request.adminId,
      inputMode: request.inputMode
    });

    if (request.type === COMMAND_TYPES.STATUS) {
      return {
        ok: true,
        status: 200,
        type: request.type,
        risk,
        data: await this.getSystemStatus(),
        trace: this.trace(startedAt, "status_returned", request)
      };
    }

    if (!this.marionRuntime || typeof this.marionRuntime.handleAdminCommand !== "function") {
      return {
        ok: false,
        status: 501,
        type: request.type,
        risk,
        message: "Marion runtime admin handler is not connected yet.",
        trace: this.trace(startedAt, "runtime_handler_missing", request)
      };
    }

    const marionResult = await this.marionRuntime.handleAdminCommand({
      command: request.command,
      inputMode: request.inputMode,
      adminId: request.adminId,
      risk,
      metadata: request.metadata
    });

    await this.audit("command_executed", {
      type: request.type,
      risk,
      adminId: request.adminId
    });

    return {
      ok: true,
      status: 200,
      type: request.type,
      risk,
      data: this.redact(marionResult),
      trace: this.trace(startedAt, "command_executed", request)
    };
  }

  async getSystemStatus() {
    let routeHealth = "unknown";

    if (this.routeMonitor && typeof this.routeMonitor.getHealth === "function") {
      routeHealth = await this.routeMonitor.getHealth();
    }

    this.lastStatus = {
      ...DEFAULT_STATUS,
      ...this.lastStatus,
      routeHealth,
      safeMode: this.safeMode,
      authorization: "verified",
      checkedAt: new Date().toISOString()
    };

    return this.lastStatus;
  }

  async emergencyDisable(startedAt, request) {
    this.safeMode = true;

    await this.audit("emergency_disable_triggered", {
      adminId: request.adminId,
      inputMode: request.inputMode
    });

    return this.safeResponse({
      ok: true,
      status: 200,
      type: COMMAND_TYPES.EMERGENCY,
      risk: RISK_LEVELS.CRITICAL,
      safeMode: true,
      message: "Emergency safe mode activated. New admin commands are locked except status checks.",
      trace: this.trace(startedAt, "safe_mode_enabled", request)
    });
  }

  async releaseSafeMode(request = {}) {
    const auth = await this.authorizeSession({
      session: request.session || {},
      adminId: request.adminId || "unknown-admin",
      command: "release safe mode",
      type: COMMAND_TYPES.ADMIN
    });

    if (!auth.allowed) {
      return {
        ok: false,
        status: 401,
        message: "Admin authorization failed."
      };
    }

    this.safeMode = false;

    await this.audit("safe_mode_released", {
      adminId: request.adminId || "unknown-admin"
    });

    return {
      ok: true,
      status: 200,
      safeMode: false,
      message: "Safe mode released."
    };
  }

  trace(startedAt, event, request) {
    return {
      startedAt,
      completedAt: new Date().toISOString(),
      event,
      inputMode: request.inputMode,
      type: request.type,
      adminId: request.adminId,
      commandPreview: this.preview(request.command)
    };
  }

  preview(command = "") {
    const clean = String(command).replace(/\s+/g, " ").trim();
    return clean.length > 80 ? `${clean.slice(0, 80)}...` : clean;
  }

  redact(value) {
    const blocked = ["token", "secret", "password", "apiKey", "authorization", "cookie"];

    if (Array.isArray(value)) return value.map((item) => this.redact(item));

    if (value && typeof value === "object") {
      return Object.fromEntries(
        Object.entries(value).map(([key, val]) => {
          if (blocked.some((word) => key.toLowerCase().includes(word.toLowerCase()))) {
            return [key, "[REDACTED]"];
          }
          return [key, this.redact(val)];
        })
      );
    }

    return value;
  }

  safeResponse(payload) {
    return this.redact(payload);
  }

  async audit(event, details = {}) {
    if (this.auditLogger && typeof this.auditLogger.write === "function") {
      return this.auditLogger.write({
        event,
        details: this.redact(details),
        timestamp: new Date().toISOString()
      });
    }

    return null;
  }
}

module.exports = {
  MarionAdminConsoleGateway,
  COMMAND_TYPES,
  RISK_LEVELS
};

"use strict";

/**
 * MarionAdminConsoleGateway
 * Private admin-only bridge for Marion control, diagnostics, voice/text commands,
 * manual approvals, and emergency safe-mode handling.
 *
 * Contract-hardlock update:
 * - Exports the handler names expected by index.js.
 * - Keeps Marion as private authority and Nyx as public surface.
 * - Treats index.js admin verification as the outer security authority.
 * - Keeps emergency execution locked behind CONFIRM_MARION_EMERGENCY.
 */

const VERSION = "marion.adminConsole.gateway/1.3-admin-voice-output-projection";
const EMERGENCY_CONFIRMATION = "CONFIRM_MARION_EMERGENCY";

const DEFAULT_STATUS = Object.freeze({
  marion: "online",
  nyxPublicLayer: "isolated",
  lingolink: "unknown",
  lingoSentinel: "unknown",
  aster: "standby",
  thalon: "standby",
  voice: "admin-only",
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

function now() {
  return Date.now();
}

function isoNow() {
  return new Date().toISOString();
}

function safeStr(value) {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

function cleanText(value) {
  return safeStr(value).replace(/\s+/g, " ").trim();
}

function lower(value) {
  return cleanText(value).toLowerCase();
}

function isObj(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function safeObj(value) {
  return isObj(value) ? value : {};
}

function firstText(values) {
  for (const value of Array.isArray(values) ? values : []) {
    const text = cleanText(value);
    if (text) return text;
  }
  return "";
}

function clipText(value, max = 600) {
  const text = cleanText(value);
  const limit = Math.max(32, Math.min(Number(max) || 600, 2400));
  return text.length > limit ? `${text.slice(0, limit)}…` : text;
}

function makeId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function extractHeaders(context) {
  return safeObj(context && context.headers);
}

function extractConfirmation(input, context) {
  const src = safeObj(input);
  const payload = safeObj(src.payload);
  const command = safeObj(src.command);
  const headers = extractHeaders(context);
  return firstText([
    src.confirmation,
    src.confirmPhrase,
    src.confirmationPhrase,
    src.emergencyConfirmation,
    payload.confirmation,
    payload.confirmPhrase,
    command.confirmation,
    command.confirmPhrase,
    headers["x-sb-marion-admin-console-confirm"],
    headers["x-sb-marion-emergency-confirm"]
  ]);
}

function extractCommandText(input) {
  const src = safeObj(input);
  const payload = safeObj(src.payload);
  const command = src.command;
  const commandObj = safeObj(command);

  if (typeof command === "string") return cleanText(command);

  return firstText([
    src.intent,
    src.message,
    src.text,
    src.query,
    src.commandText,
    src.commandType && src.commandType !== "command" ? src.commandType : "",
    commandObj.intent,
    commandObj.message,
    commandObj.text,
    commandObj.query,
    commandObj.command,
    commandObj.name,
    commandObj.type && commandObj.type !== "command" ? commandObj.type : "",
    payload.intent,
    payload.message,
    payload.text,
    payload.query,
    payload.command
  ]);
}

function extractRequestId(input) {
  const src = safeObj(input);
  const payload = safeObj(src.payload);
  const command = safeObj(src.command);
  return firstText([
    src.requestId,
    src.commandId,
    src.approvalId,
    src.id,
    payload.requestId,
    payload.commandId,
    payload.approvalId,
    payload.id,
    command.requestId,
    command.commandId,
    command.approvalId,
    command.id
  ]);
}

function extractRiskHint(input) {
  const src = safeObj(input);
  const payload = safeObj(src.payload);
  const command = safeObj(src.command);
  return lower(firstText([src.risk, src.riskLevel, payload.risk, payload.riskLevel, command.risk, command.riskLevel]));
}

const ADMIN_VOICE_APPROVAL_TYPE = "admin_voice_delivery_once";
const ADMIN_VOICE_APPROVAL_TTL_MS = 60 * 1000;
const ADMIN_VOICE_MAX_SECONDS = 3;

function normalizeCommandToken(value) {
  return lower(value).replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function requestField(input, field) {
  const src = safeObj(input);
  const payload = safeObj(src.payload);
  const command = safeObj(src.command);
  const meta = safeObj(src.metadata);
  return firstText([src[field], payload[field], command[field], meta[field]]);
}

function isAdminVoiceDeliveryOnceRequest(request) {
  const src = safeObj(request);
  const raw = safeObj(src.raw);
  const tokens = [
    src.command,
    src.type,
    src.commandType,
    src.approvalType,
    requestField(src, "approvalType"),
    requestField(src, "type"),
    requestField(src, "command"),
    raw.command,
    raw.type,
    raw.commandType,
    requestField(raw, "approvalType"),
    requestField(raw, "type"),
    requestField(raw, "command")
  ].map(normalizeCommandToken).filter(Boolean);

  return tokens.some((token) =>
    token === "request_admin_voice_confirmation_once" ||
    token === "admin_voice_delivery_once" ||
    token === "admin_voice_confirmation_once" ||
    token === "request_admin_voice_delivery_once" ||
    token === "request_admin_approval_voice_once" ||
    token === "voice_delivery_once"
  );
}

function extractVoiceConstraints(request) {
  const src = safeObj(request);
  const raw = safeObj(src.raw);
  const payload = safeObj(src.payload || raw.payload);
  const command = safeObj(src.command || raw.command);
  const constraints = {
    ...safeObj(payload.constraints),
    ...safeObj(command.constraints),
    ...safeObj(raw.constraints),
    ...safeObj(src.constraints)
  };

  const maxSeconds = Math.max(1, Math.min(
    Number(constraints.maxSeconds || raw.maxSeconds || src.maxSeconds || ADMIN_VOICE_MAX_SECONDS) || ADMIN_VOICE_MAX_SECONDS,
    ADMIN_VOICE_MAX_SECONDS
  ));

  return {
    singleUtterance: constraints.singleUtterance !== false,
    noLoop: constraints.noLoop !== false,
    noRepeatedPlayback: constraints.noRepeatedPlayback !== false,
    noDiagnostics: constraints.noDiagnostics !== false,
    maxSeconds
  };
}

function publicAdminVoiceApprovalState(state) {
  const s = safeObj(state);
  const expiresAt = Number(s.expiresAt || 0);
  const active = s.approved === true && expiresAt > now() && s.consumed !== true && s.revoked !== true;
  return {
    version: "marion.adminVoice.runtimeApproval/1.0",
    approval: active ? "YES" : "NO",
    approved: active,
    approvalRequired: true,
    approvalType: ADMIN_VOICE_APPROVAL_TYPE,
    requestId: cleanText(s.requestId || ""),
    adminVoiceTokenConfigured: true,
    adminVoiceTokenProvided: active,
    adminVoiceDeliveryAllowed: active,
    projectedVoiceMode: active ? "voice" : "silent",
    rawVoiceMode: active ? "voice" : "silent",
    speechSyncEnabled: active,
    singleUtterance: s.singleUtterance !== false,
    maxSeconds: Number(s.maxSeconds || ADMIN_VOICE_MAX_SECONDS),
    expiresInMs: active ? Math.max(0, expiresAt - now()) : 0,
    consumed: s.consumed === true,
    revoked: s.revoked === true,
    audioStored: false,
    rawAudioStored: false,
    noRawAudioStored: true,
    diagnosticsRedacted: true
  };
}

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
    this.adminVoiceApprovalState = {
      approved: false,
      requestId: "",
      sessionId: "",
      expiresAt: 0,
      consumed: false,
      revoked: false,
      singleUtterance: true,
      maxSeconds: ADMIN_VOICE_MAX_SECONDS
    };
    this.lastAdminVoiceApprovalRequestId = "";
  }


  isAdminVoiceDeliveryOnce(request = {}) {
    return isAdminVoiceDeliveryOnceRequest(request);
  }

  currentAdminVoiceApprovalState(options = {}) {
    const opts = safeObj(options);
    const state = safeObj(this.adminVoiceApprovalState);
    if (state.approved === true && Number(state.expiresAt || 0) <= now()) {
      this.adminVoiceApprovalState = {
        ...state,
        approved: false,
        expired: true,
        adminVoiceDeliveryAllowed: false
      };
    }
    const publicState = publicAdminVoiceApprovalState(this.adminVoiceApprovalState);
    if (opts.sessionId) {
      publicState.sessionMatches = cleanText(opts.sessionId) === cleanText(this.adminVoiceApprovalState.sessionId || "");
    }
    return publicState;
  }

  findPendingAdminVoiceApproval(requestId = "") {
    const wanted = cleanText(requestId || "");
    if (wanted && this.pendingApprovals.has(wanted)) {
      const direct = this.pendingApprovals.get(wanted);
      if (direct && direct.approvalType === ADMIN_VOICE_APPROVAL_TYPE) return direct;
    }

    if (wanted) {
      for (const entry of this.pendingApprovals.values()) {
        if (!entry || entry.approvalType !== ADMIN_VOICE_APPROVAL_TYPE) continue;
        if (cleanText(entry.requestId || "") === wanted || cleanText(entry.approvalId || "") === wanted) return entry;
      }
    }

    const latestId = cleanText(this.lastAdminVoiceApprovalRequestId || "");
    if (latestId && this.pendingApprovals.has(latestId)) {
      const latest = this.pendingApprovals.get(latestId);
      if (latest && latest.approvalType === ADMIN_VOICE_APPROVAL_TYPE) return latest;
    }

    const voiceEntries = Array.from(this.pendingApprovals.values())
      .filter((entry) => entry && entry.approvalType === ADMIN_VOICE_APPROVAL_TYPE)
      .sort((a, b) => Number(b.createdAtMs || 0) - Number(a.createdAtMs || 0));

    return voiceEntries[0] || null;
  }

  createAdminVoiceApprovalRequest(request = {}, risk = RISK_LEVELS.LOW, context = {}) {
    const constraints = extractVoiceConstraints(request);
    const sessionId = cleanText(
      safeObj(request.metadata).sessionId ||
      safeObj(request.raw).sessionId ||
      safeObj(context).sessionId ||
      ""
    );
    const requestId = cleanText(request.requestId || safeObj(request.raw).commandId || safeObj(request.raw).requestId || makeId("adminvoice"));
    const entry = {
      approvalId: requestId,
      requestId,
      approvalType: ADMIN_VOICE_APPROVAL_TYPE,
      request,
      risk,
      createdAt: isoNow(),
      createdAtMs: now(),
      status: "pending",
      sessionId,
      constraints,
      singleUtterance: constraints.singleUtterance,
      maxSeconds: constraints.maxSeconds,
      audioStored: false,
      rawAudioStored: false,
      diagnosticsRedacted: true
    };
    this.pendingApprovals.set(requestId, entry);
    this.lastAdminVoiceApprovalRequestId = requestId;
    this.adminVoiceApprovalState = {
      approved: false,
      requestId,
      sessionId,
      expiresAt: 0,
      consumed: false,
      revoked: false,
      denied: false,
      singleUtterance: constraints.singleUtterance,
      maxSeconds: constraints.maxSeconds
    };
    return entry;
  }

  approveAdminVoiceDelivery(entry = {}, context = {}) {
    const source = safeObj(entry);
    const constraints = safeObj(source.constraints);
    const requestId = cleanText(source.requestId || source.approvalId || this.lastAdminVoiceApprovalRequestId || makeId("adminvoice"));
    const sessionId = cleanText(source.sessionId || safeObj(context).sessionId || "");
    const maxSeconds = Math.max(1, Math.min(Number(source.maxSeconds || constraints.maxSeconds || ADMIN_VOICE_MAX_SECONDS) || ADMIN_VOICE_MAX_SECONDS, ADMIN_VOICE_MAX_SECONDS));
    const expiresAt = now() + ADMIN_VOICE_APPROVAL_TTL_MS;
    this.pendingApprovals.delete(requestId);
    this.adminVoiceApprovalState = {
      approved: true,
      requestId,
      sessionId,
      approvedAt: isoNow(),
      expiresAt,
      consumed: false,
      revoked: false,
      denied: false,
      singleUtterance: constraints.singleUtterance !== false,
      noLoop: constraints.noLoop !== false,
      noRepeatedPlayback: constraints.noRepeatedPlayback !== false,
      noDiagnostics: constraints.noDiagnostics !== false,
      maxSeconds
    };
    return publicAdminVoiceApprovalState(this.adminVoiceApprovalState);
  }

  consumeAdminVoiceDeliveryApproval(options = {}) {
    const opts = safeObj(options);
    const state = this.currentAdminVoiceApprovalState(opts);
    if (state.adminVoiceDeliveryAllowed !== true) return state;
    const expectedSessionId = cleanText(this.adminVoiceApprovalState.sessionId || "");
    const actualSessionId = cleanText(opts.sessionId || "");
    if (expectedSessionId && actualSessionId && expectedSessionId !== actualSessionId) {
      return {
        ...state,
        approval: "NO",
        approved: false,
        adminVoiceTokenProvided: false,
        adminVoiceDeliveryAllowed: false,
        projectedVoiceMode: "silent",
        rawVoiceMode: "silent",
        speechSyncEnabled: false,
        sessionMatches: false,
        reason: "session_mismatch"
      };
    }
    if (this.adminVoiceApprovalState.singleUtterance !== false) {
      this.adminVoiceApprovalState = {
        ...this.adminVoiceApprovalState,
        approved: false,
        consumed: true,
        consumedAt: isoNow()
      };
    }
    return {
      ...state,
      consumedForThisTurn: this.adminVoiceApprovalState.singleUtterance !== false,
      sessionMatches: true
    };
  }


  makeBasePacket(action, input = {}, context = {}) {
    const ctx = safeObj(context);
    return {
      ok: true,
      service: "marion-admin-console-gateway",
      version: VERSION,
      action: cleanText(action || safeObj(input).action || "unknown"),
      authority: "Marion",
      publicSurface: "Nyx",
      privateControlPlane: true,
      diagnosticsRedacted: true,
      traceId: cleanText(ctx.traceId || safeObj(input).traceId || safeObj(input).requestId || ""),
      receivedAt: now(),
      receivedAtIso: isoNow()
    };
  }

  normalizeRequest(request = {}, context = {}) {
    const src = safeObj(request);
    const ctx = safeObj(context);
    const commandText = extractCommandText(src) || (src.action === "command" ? "status" : cleanText(src.action || ""));
    const inputMode = lower(src.inputMode || src.mode || src.source || "text") || "text";
    const commandType = lower(src.commandType || safeObj(src.command).type || src.action || "");
    const type = this.detectCommandType(commandText, inputMode, commandType);

    return {
      raw: src,
      command: commandText,
      inputMode,
      type,
      session: safeObj(src.session),
      adminId: cleanText(src.adminId || src.requestedBy || ctx.adminId || "verified-admin"),
      approvalToken: cleanText(src.approvalToken || src.approvalId || "") || null,
      requestId: extractRequestId(src),
      reason: clipText(src.reason || safeObj(src.payload).reason || "", 600),
      metadata: {
        ...safeObj(src.metadata),
        action: cleanText(src.action || ""),
        commandType,
        adminVerified: ctx.adminVerified === true || src.adminVerified === true,
        mfaVerified: ctx.mfaVerified === true || src.mfaVerified === true,
        route: cleanText(ctx.route || ""),
        method: cleanText(ctx.method || ""),
        sessionId: cleanText(ctx.sessionId || src.sessionId || "")
      }
    };
  }

  detectCommandType(command, inputMode, commandType) {
    const c = lower(command);
    const t = lower(commandType);

    if (t === COMMAND_TYPES.STATUS || c === COMMAND_TYPES.STATUS || c.includes("route health") || c.includes("health")) return COMMAND_TYPES.STATUS;
    if (t === COMMAND_TYPES.EMERGENCY || c.includes("emergency") || c.includes("shutdown") || c.includes("disable all") || c.includes("kill switch")) return COMMAND_TYPES.EMERGENCY;
    if (inputMode === "voice") return COMMAND_TYPES.VOICE;
    if (c.includes("diagnostic") || c.includes("trace") || c.includes("logs") || t === COMMAND_TYPES.DIAGNOSTICS) return COMMAND_TYPES.DIAGNOSTICS;
    if (c.includes("config") || c.includes("runtime") || c.includes("gateway") || t === COMMAND_TYPES.CONFIGURATION) return COMMAND_TYPES.CONFIGURATION;
    if (c.includes("admin") || c.includes("approval") || c.includes("authorize") || t === COMMAND_TYPES.ADMIN) return COMMAND_TYPES.ADMIN;

    return c ? COMMAND_TYPES.TEXT : COMMAND_TYPES.UNKNOWN;
  }

  async authorizeSession(request = {}, context = {}) {
    const ctx = safeObj(context);
    if (ctx.adminVerified === true || request.adminVerified === true || safeObj(request.metadata).adminVerified === true) {
      return { allowed: true, reason: "index_admin_verified" };
    }

    if (this.authProvider && typeof this.authProvider.verify === "function") {
      try {
        const result = await this.authProvider.verify(safeObj(request.session), request, context);
        return isObj(result) ? result : { allowed: result === true, reason: "auth_provider_boolean" };
      } catch (err) {
        return { allowed: false, reason: cleanText(err && err.message || "auth_provider_failed") };
      }
    }

    return {
      allowed: Boolean(request.session && request.session.admin === true),
      reason: "fallback_session_check"
    };
  }

  classifyRisk(command = "", input = {}) {
    const hinted = extractRiskHint(input);
    if (Object.values(RISK_LEVELS).includes(hinted)) return hinted;

    const c = lower(command);

    if (c.includes("shutdown") || c.includes("disable all") || c.includes("kill switch") || c.includes("emergency")) {
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
    if (!request || !request.type) return false;
    if (request.type === COMMAND_TYPES.EMERGENCY) return false;
    if (isAdminVoiceDeliveryOnceRequest(request)) return true;
    return risk === RISK_LEVELS.HIGH || risk === RISK_LEVELS.CRITICAL;
  }

  createApproval(request, risk) {
    if (isAdminVoiceDeliveryOnceRequest(request)) {
      return this.createAdminVoiceApprovalRequest(request, risk).approvalId;
    }

    const approvalId = makeId("approval");

    this.pendingApprovals.set(approvalId, {
      approvalId,
      request,
      risk,
      createdAt: isoNow(),
      createdAtMs: now(),
      status: "pending"
    });

    return approvalId;
  }

  async handleStatus(input = {}, context = {}) {
    const packet = this.makeBasePacket("status", input, context);
    const data = await this.getSystemStatus(input, context);

    return this.safeResponse({
      ...packet,
      stage: "gateway_status_ready",
      gatewayReady: true,
      adminConsole: {
        ready: true,
        protected: true,
        runtimeContract: "ready",
        supportedActions: ["status", "command", "approve", "deny", "emergency"],
        pendingApprovalCount: this.pendingApprovals.size,
        adminVoiceRuntimeApproval: this.currentAdminVoiceApprovalState()
      },
      adminVoiceRuntimeApproval: this.currentAdminVoiceApprovalState(),
      data,
      modules: {
        marion: data.marion,
        nyxPublicLayer: data.nyxPublicLayer,
        lingolink: data.lingolink,
        lingoSentinel: data.lingoSentinel,
        aster: data.aster,
        thalon: data.thalon,
        voice: data.voice
      },
      emergency: {
        confirmationRequired: true,
        phraseProtected: true,
        triggered: false,
        safeMode: this.safeMode
      }
    });
  }

  async getStatus(input = {}, context = {}) {
    return this.handleStatus(input, context);
  }

  async status(input = {}, context = {}) {
    return this.handleStatus(input, context);
  }

  async health(input = {}, context = {}) {
    return this.handleStatus(input, context);
  }

  async getHealth(input = {}, context = {}) {
    return this.handleStatus(input, context);
  }

  async diagnostics(input = {}, context = {}) {
    return this.handleStatus(input, context);
  }

  async getDiagnostics(input = {}, context = {}) {
    return this.handleStatus(input, context);
  }

  async handleCommand(input = {}, context = {}) {
    const startedAt = isoNow();
    const normalized = this.normalizeRequest(input, context);
    const auth = await this.authorizeSession(normalized, context);
    const packet = this.makeBasePacket("command", input, context);

    if (!auth.allowed) {
      return this.safeResponse({
        ...packet,
        ok: false,
        status: 401,
        statusCode: 401,
        stage: "authorization_failed",
        type: normalized.type,
        message: "Admin authorization failed.",
        trace: this.trace(startedAt, "authorization_failed", normalized)
      });
    }

    if (this.safeMode && normalized.type !== COMMAND_TYPES.STATUS) {
      return this.safeResponse({
        ...packet,
        ok: false,
        status: 423,
        statusCode: 423,
        stage: "safe_mode_locked",
        type: normalized.type,
        message: "Marion admin gateway is in safe mode. Command execution is locked except status checks.",
        trace: this.trace(startedAt, "safe_mode_locked", normalized)
      });
    }

    if (normalized.type === COMMAND_TYPES.EMERGENCY) {
      return this.handleEmergency(input, context);
    }

    const risk = this.classifyRisk(normalized.command, input);
    const approvalRequired = this.requiresApproval(risk, normalized);

    if (approvalRequired && !normalized.approvalToken) {
      const approvalId = this.createApproval(normalized, risk);

      await this.audit("approval_required", {
        approvalId,
        type: normalized.type,
        risk
      });

      return this.safeResponse({
        ...packet,
        ok: isAdminVoiceDeliveryOnceRequest(normalized) ? true : false,
        accepted: true,
        status: 202,
        statusCode: 202,
        stage: "approval_pending",
        type: normalized.type,
        risk,
        approvalRequired: true,
        statusText: "pending_approval",
        approvalPending: true,
        approvalType: isAdminVoiceDeliveryOnceRequest(normalized) ? ADMIN_VOICE_APPROVAL_TYPE : "manual_command",
        requestId: approvalId,
        approvalId,
        adminVoiceDeliveryAllowed: false,
        projectedVoiceMode: "silent",
        rawVoiceMode: "silent",
        speechSyncEnabled: false,
        message: isAdminVoiceDeliveryOnceRequest(normalized)
          ? "Admin voice delivery request accepted and is pending approval."
          : "Manual approval required before execution.",
        trace: this.trace(startedAt, "approval_pending", normalized)
      });
    }

    if (normalized.type === COMMAND_TYPES.STATUS || lower(normalized.command) === "status") {
      const status = await this.handleStatus(input, context);
      return this.safeResponse({
        ...packet,
        stage: "command_status_completed",
        command: normalized.command || "status",
        type: COMMAND_TYPES.STATUS,
        risk,
        result: status,
        trace: this.trace(startedAt, "status_returned", normalized)
      });
    }

    const result = await this.executeRuntimeCommand(normalized, risk, startedAt);
    return this.safeResponse({
      ...packet,
      ...result
    });
  }

  async dispatchCommand(input = {}, context = {}) {
    return this.handleCommand(input, context);
  }

  async routeCommand(input = {}, context = {}) {
    return this.handleCommand(input, context);
  }

  async command(input = {}, context = {}) {
    return this.handleCommand(input, context);
  }

  async handleAdminCommand(input = {}, context = {}) {
    return this.handleCommand(input, context);
  }

  async processCommand(request = {}, context = {}) {
    return this.handleCommand(request, context);
  }

  async executeRuntimeCommand(request, risk, startedAt) {
    await this.audit("command_received", {
      type: request.type,
      risk,
      adminId: request.adminId,
      inputMode: request.inputMode
    });

    if (this.isAdminVoiceDeliveryOnce(request)) {
      const approval = this.createAdminVoiceApprovalRequest(request, risk);
      await this.audit("admin_voice_approval_pending", {
        requestId: approval.requestId,
        approvalType: ADMIN_VOICE_APPROVAL_TYPE,
        risk
      });
      return {
        ok: true,
        status: 202,
        stage: "admin_voice_runtime_approval_pending",
        type: COMMAND_TYPES.VOICE,
        risk,
        accepted: true,
        runtimeConnected: true,
        approvalRequired: true,
        approvalType: ADMIN_VOICE_APPROVAL_TYPE,
        requestId: approval.requestId,
        approvalId: approval.approvalId,
        statusText: "pending_approval",
        adminVoiceTokenConfigured: true,
        adminVoiceTokenProvided: false,
        adminVoiceDeliveryAllowed: false,
        projectedVoiceMode: "silent",
        rawVoiceMode: "silent",
        speechSyncEnabled: false,
        constraints: approval.constraints,
        audioStored: false,
        rawAudioStored: false,
        noRawAudioStored: true,
        diagnosticsRedacted: true,
        message: "Admin voice delivery request accepted and connected to the runtime approval handler.",
        trace: this.trace(startedAt, "admin_voice_approval_pending", request)
      };
    }

    if (!this.marionRuntime || typeof this.marionRuntime.handleAdminCommand !== "function") {
      return {
        ok: true,
        status: 202,
        stage: "command_received_runtime_handler_pending",
        type: request.type,
        risk,
        accepted: true,
        runtimeConnected: false,
        message: "Command accepted by Marion Admin Console Gateway. Marion runtime admin handler is not connected yet.",
        trace: this.trace(startedAt, "runtime_handler_pending", request)
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
      stage: "command_executed",
      type: request.type,
      risk,
      runtimeConnected: true,
      data: this.redact(marionResult),
      trace: this.trace(startedAt, "command_executed", request)
    };
  }

  async executeCommand(request = {}, risk = RISK_LEVELS.LOW, startedAt = isoNow()) {
    const normalized = this.normalizeRequest(request, { adminVerified: true });
    return this.executeRuntimeCommand(normalized, risk, startedAt);
  }

  async handleApprove(input = {}, context = {}) {
    const requestId = extractRequestId(input);
    const packet = this.makeBasePacket("approve", input, context);

    if (!requestId) {
      return this.safeResponse({
        ...packet,
        ok: false,
        status: 400,
        statusCode: 400,
        stage: "approve_request_id_required",
        error: "requestId_required",
        approved: false
      });
    }

    const pending = this.pendingApprovals.get(requestId) || this.findPendingAdminVoiceApproval(requestId);
    if (pending) {
      pending.status = "approved";

      if (pending.approvalType === ADMIN_VOICE_APPROVAL_TYPE || this.isAdminVoiceDeliveryOnce(pending.request)) {
        const voiceState = this.approveAdminVoiceDelivery(pending, context);
        await this.audit("admin_voice_approval_granted", {
          requestId: voiceState.requestId,
          approvalType: ADMIN_VOICE_APPROVAL_TYPE,
          singleUtterance: voiceState.singleUtterance,
          maxSeconds: voiceState.maxSeconds
        });
        return this.safeResponse({
          ...packet,
          stage: "admin_voice_delivery_approved",
          requestId: voiceState.requestId,
          approved: true,
          approval: "YES",
          decision: "approved",
          approvalType: ADMIN_VOICE_APPROVAL_TYPE,
          adminVoiceTokenConfigured: true,
          adminVoiceTokenProvided: true,
          adminVoiceDeliveryAllowed: true,
          projectedVoiceMode: "voice",
          rawVoiceMode: "voice",
          speechSyncEnabled: true,
          singleUtterance: true,
          maxSeconds: voiceState.maxSeconds,
          expiresInMs: voiceState.expiresInMs,
          audioStored: false,
          rawAudioStored: false,
          noRawAudioStored: true,
          result: {
            ok: true,
            ...voiceState,
            message: "Admin voice delivery approved for one short confirmation only."
          }
        });
      }

      pending.request.approvalToken = requestId;
      this.pendingApprovals.delete(pending.approvalId || requestId);
      const commandRequest = { ...(pending.request.raw || pending.request), approvalToken: requestId, approvalId: requestId };
      const result = await this.handleCommand(commandRequest, context);
      return this.safeResponse({
        ...packet,
        stage: "approve_completed_pending_command_executed",
        requestId,
        approved: true,
        decision: "approved",
        result
      });
    }

    await this.audit("approval_recorded_no_pending_request", { requestId, source: "admin_console" });

    return this.safeResponse({
      ...packet,
      stage: "approve_recorded_no_pending_request",
      requestId,
      approved: true,
      decision: "approved",
      approval: "NO",
      adminVoiceDeliveryAllowed: false,
      projectedVoiceMode: "silent",
      rawVoiceMode: "silent",
      speechSyncEnabled: false,
      result: {
        ok: true,
        requestId,
        decision: "approved",
        approval: "NO",
        adminVoiceDeliveryAllowed: false,
        message: "Approval recorded, but no pending admin voice delivery request was active."
      }
    });
  }

  async approve(input = {}, context = {}) {
    return this.handleApprove(input, context);
  }

  async handleApproval(input = {}, context = {}) {
    return this.handleApprove(input, context);
  }

  async approveCommand(input = {}, context = {}) {
    if (typeof input === "string") return this.handleApprove({ approvalId: input }, context);
    return this.handleApprove(input, context);
  }

  async handleDeny(input = {}, context = {}) {
    const requestId = extractRequestId(input);
    const reason = clipText(safeObj(input).reason || safeObj(input).note || safeObj(safeObj(input).payload).reason || "Denied by Marion admin console.", 600);
    const packet = this.makeBasePacket("deny", input, context);

    if (!requestId) {
      return this.safeResponse({
        ...packet,
        ok: false,
        status: 400,
        statusCode: 400,
        stage: "deny_request_id_required",
        error: "requestId_required",
        denied: false
      });
    }

    const pending = this.pendingApprovals.get(requestId) || this.findPendingAdminVoiceApproval(requestId);
    if (pending) {
      this.pendingApprovals.delete(pending.approvalId || pending.requestId || requestId);
      if (pending.approvalType === ADMIN_VOICE_APPROVAL_TYPE || this.isAdminVoiceDeliveryOnce(pending.request)) {
        this.adminVoiceApprovalState = {
          ...this.adminVoiceApprovalState,
          approved: false,
          denied: true,
          revoked: true,
          requestId: cleanText(pending.requestId || pending.approvalId || requestId),
          deniedAt: isoNow(),
          expiresAt: 0
        };
      }
    }

    await this.audit("approval_denied", {
      requestId,
      risk: pending ? pending.risk : "unknown",
      reason
    });

    return this.safeResponse({
      ...packet,
      stage: pending ? "deny_completed_pending_removed" : "deny_completed",
      requestId,
      denied: true,
      decision: "denied",
      reason,
      result: {
        ok: true,
        requestId,
        decision: "denied",
        reason,
        message: "Denial recorded by Marion Admin Console Gateway."
      }
    });
  }

  async deny(input = {}, context = {}) {
    return this.handleDeny(input, context);
  }

  async handleDenial(input = {}, context = {}) {
    return this.handleDeny(input, context);
  }

  async denyCommand(input = {}, context = {}) {
    if (typeof input === "string") return this.handleDeny({ approvalId: input }, context);
    return this.handleDeny(input, context);
  }

  async handleEmergency(input = {}, context = {}) {
    const startedAt = isoNow();
    const packet = this.makeBasePacket("emergency", input, context);
    const confirmation = extractConfirmation(input, context);

    if (confirmation !== EMERGENCY_CONFIRMATION) {
      return this.safeResponse({
        ...packet,
        ok: false,
        status: 400,
        statusCode: 400,
        stage: "emergency_confirmation_required",
        reason: "CONFIRM_MARION_EMERGENCY_required",
        emergencyTriggered: false
      });
    }

    this.safeMode = true;

    await this.audit("emergency_safe_mode_triggered", {
      source: "admin_console",
      confirmation: "[REDACTED]"
    });

    return this.safeResponse({
      ...packet,
      stage: "emergency_confirmed_safe_mode_enabled",
      emergencyTriggered: true,
      safeMode: true,
      safeModeRequested: true,
      risk: RISK_LEVELS.CRITICAL,
      message: "Emergency safe mode activated. New admin commands are locked except status checks.",
      trace: this.trace(startedAt, "safe_mode_enabled", this.normalizeRequest({ ...safeObj(input), command: "emergency" }, context)),
      result: {
        ok: true,
        emergencyTriggered: true,
        safeMode: true,
        safeModeRequested: true
      }
    });
  }

  async emergency(input = {}, context = {}) {
    return this.handleEmergency(input, context);
  }

  async triggerEmergency(input = {}, context = {}) {
    return this.handleEmergency(input, context);
  }

  async enterSafeMode(input = {}, context = {}) {
    return this.handleEmergency(input, context);
  }

  async emergencyDisable(startedAt, request) {
    return this.handleEmergency({ ...safeObj(request), confirmation: EMERGENCY_CONFIRMATION }, { adminVerified: true, startedAt });
  }

  async releaseSafeMode(request = {}, context = {}) {
    const auth = await this.authorizeSession({
      ...safeObj(request),
      session: safeObj(request.session),
      adminId: cleanText(request.adminId || "verified-admin"),
      command: "release safe mode",
      type: COMMAND_TYPES.ADMIN
    }, context);

    if (!auth.allowed) {
      return {
        ok: false,
        status: 401,
        statusCode: 401,
        stage: "authorization_failed",
        message: "Admin authorization failed."
      };
    }

    this.safeMode = false;

    await this.audit("safe_mode_released", {
      adminId: cleanText(request.adminId || "verified-admin")
    });

    return {
      ok: true,
      status: 200,
      stage: "safe_mode_released",
      safeMode: false,
      message: "Safe mode released."
    };
  }

  async getSystemStatus() {
    let routeHealth = "unknown";

    if (this.routeMonitor && typeof this.routeMonitor.getHealth === "function") {
      try {
        routeHealth = await this.routeMonitor.getHealth();
      } catch (_) {
        routeHealth = "unavailable";
      }
    }

    this.lastStatus = {
      ...DEFAULT_STATUS,
      ...this.lastStatus,
      routeHealth,
      safeMode: this.safeMode,
      authorization: "verified",
      gatewayVersion: VERSION,
      pendingApprovalCount: this.pendingApprovals.size,
      pendingApprovals: Array.from(this.pendingApprovals.values()).slice(0, 10).map((entry) => ({
        requestId: cleanText(entry && (entry.requestId || entry.approvalId) || ""),
        approvalType: cleanText(entry && entry.approvalType || "manual_command"),
        risk: cleanText(entry && entry.risk || "unknown"),
        status: cleanText(entry && entry.status || "pending"),
        createdAt: cleanText(entry && entry.createdAt || "")
      })),
      adminVoiceRuntimeApproval: this.currentAdminVoiceApprovalState(),
      approval: this.currentAdminVoiceApprovalState().approval,
      adminVoiceDeliveryAllowed: this.currentAdminVoiceApprovalState().adminVoiceDeliveryAllowed,
      projectedVoiceMode: this.currentAdminVoiceApprovalState().projectedVoiceMode,
      rawVoiceMode: this.currentAdminVoiceApprovalState().rawVoiceMode,
      speechSyncEnabled: this.currentAdminVoiceApprovalState().speechSyncEnabled,
      checkedAt: isoNow()
    };

    return this.lastStatus;
  }

  trace(startedAt, event, request) {
    const normalized = safeObj(request);
    return {
      startedAt,
      completedAt: isoNow(),
      event,
      inputMode: cleanText(normalized.inputMode || ""),
      type: cleanText(normalized.type || ""),
      adminId: cleanText(normalized.adminId || ""),
      requestId: cleanText(normalized.requestId || ""),
      commandPreview: this.preview(normalized.command)
    };
  }

  preview(command = "") {
    const clean = cleanText(command);
    return clean.length > 80 ? `${clean.slice(0, 80)}...` : clean;
  }

  redact(value, depth = 0, seen = new Set()) {
    if (depth > 8) return "[truncated]";
    const blocked = ["token", "secret", "password", "apikey", "api_key", "cookie", "credential"];

    if (value == null) return value;
    if (typeof value === "string") {
      return value
        .replace(/(Bearer\s+)[A-Za-z0-9._~+\-/]+=*/gi, "$1[REDACTED]")
        .replace(/([?&](?:token|key|secret|password)=)[^&\s]+/gi, "$1[REDACTED]");
    }
    if (typeof value !== "object") return value;
    if (seen.has(value)) return "[circular]";
    seen.add(value);

    if (Array.isArray(value)) return value.slice(0, 100).map((item) => this.redact(item, depth + 1, seen));

    const out = {};
    for (const [key, val] of Object.entries(value).slice(0, 120)) {
      const k = lower(key).replace(/[^a-z0-9_]/g, "");
      if (blocked.some((word) => k.includes(word))) {
        out[key] = "[REDACTED]";
      } else if (k === "authorization" && typeof val === "string" && /^(?:bearer\s+)?[A-Za-z0-9._~+\-/]+=*$/i.test(val) && val.length > 20) {
        out[key] = "[REDACTED]";
      } else {
        out[key] = this.redact(val, depth + 1, seen);
      }
    }
    return out;
  }

  safeResponse(payload) {
    return this.redact(payload);
  }

  async audit(event, details = {}) {
    if (this.auditLogger && typeof this.auditLogger.write === "function") {
      return this.auditLogger.write({
        event,
        details: this.redact(details),
        timestamp: isoNow()
      });
    }

    return null;
  }

  async handleAdminConsoleAction(input = {}, context = {}) {
    const action = lower(safeObj(input).action || "status");
    if (action === "approve") return this.handleApprove(input, context);
    if (action === "deny") return this.handleDeny(input, context);
    if (action === "emergency") return this.handleEmergency(input, context);
    if (action === "command") return this.handleCommand(input, context);
    return this.handleStatus(input, context);
  }

  async handle(input = {}, context = {}) {
    return this.handleAdminConsoleAction(input, context);
  }

  async process(input = {}, context = {}) {
    return this.handleAdminConsoleAction(input, context);
  }
}

const defaultGateway = new MarionAdminConsoleGateway();

async function handleStatus(input = {}, context = {}) {
  return defaultGateway.handleStatus(input, context);
}

async function handleCommand(input = {}, context = {}) {
  return defaultGateway.handleCommand(input, context);
}

async function handleApprove(input = {}, context = {}) {
  return defaultGateway.handleApprove(input, context);
}

async function handleDeny(input = {}, context = {}) {
  return defaultGateway.handleDeny(input, context);
}

async function handleEmergency(input = {}, context = {}) {
  return defaultGateway.handleEmergency(input, context);
}

async function handleAdminConsoleAction(input = {}, context = {}) {
  return defaultGateway.handleAdminConsoleAction(input, context);
}

async function handle(input = {}, context = {}) {
  return defaultGateway.handle(input, context);
}

async function process(input = {}, context = {}) {
  return defaultGateway.process(input, context);
}


function getAdminVoiceRuntimeState(options = {}) {
  return defaultGateway.currentAdminVoiceApprovalState(options);
}

function consumeAdminVoiceRuntimeApproval(options = {}) {
  return defaultGateway.consumeAdminVoiceDeliveryApproval(options);
}

function getPendingApprovals() {
  return Array.from(defaultGateway.pendingApprovals.values()).map((entry) => defaultGateway.redact(entry));
}

function bindStatic(name, fn) {
  MarionAdminConsoleGateway[name] = fn;
}

MarionAdminConsoleGateway.VERSION = VERSION;
bindStatic("handleStatus", handleStatus);
bindStatic("getStatus", handleStatus);
bindStatic("status", handleStatus);
bindStatic("health", handleStatus);
bindStatic("getHealth", handleStatus);
bindStatic("diagnostics", handleStatus);
bindStatic("getDiagnostics", handleStatus);
bindStatic("handleCommand", handleCommand);
bindStatic("dispatchCommand", handleCommand);
bindStatic("routeCommand", handleCommand);
bindStatic("command", handleCommand);
bindStatic("handleAdminCommand", handleCommand);
bindStatic("handleApprove", handleApprove);
bindStatic("approve", handleApprove);
bindStatic("handleApproval", handleApprove);
bindStatic("approveCommand", handleApprove);
bindStatic("handleDeny", handleDeny);
bindStatic("deny", handleDeny);
bindStatic("handleDenial", handleDeny);
bindStatic("denyCommand", handleDeny);
bindStatic("handleEmergency", handleEmergency);
bindStatic("emergency", handleEmergency);
bindStatic("triggerEmergency", handleEmergency);
bindStatic("enterSafeMode", handleEmergency);
bindStatic("safeMode", handleEmergency);
bindStatic("getAdminVoiceRuntimeState", getAdminVoiceRuntimeState);
bindStatic("consumeAdminVoiceRuntimeApproval", consumeAdminVoiceRuntimeApproval);
bindStatic("getPendingApprovals", getPendingApprovals);
bindStatic("handleAdminConsoleAction", handleAdminConsoleAction);
bindStatic("handle", handle);
bindStatic("process", process);

module.exports = {
  VERSION,
  EMERGENCY_CONFIRMATION,
  DEFAULT_STATUS,
  COMMAND_TYPES,
  RISK_LEVELS,
  MarionAdminConsoleGateway,
  defaultGateway,

  handleStatus,
  getStatus: handleStatus,
  status: handleStatus,
  health: handleStatus,
  getHealth: handleStatus,
  diagnostics: handleStatus,
  getDiagnostics: handleStatus,

  handleCommand,
  dispatchCommand: handleCommand,
  routeCommand: handleCommand,
  command: handleCommand,
  handleAdminCommand: handleCommand,

  handleApprove,
  approve: handleApprove,
  handleApproval: handleApprove,
  approveCommand: handleApprove,

  handleDeny,
  deny: handleDeny,
  handleDenial: handleDeny,
  denyCommand: handleDeny,

  handleEmergency,
  emergency: handleEmergency,
  triggerEmergency: handleEmergency,
  enterSafeMode: handleEmergency,
  safeMode: handleEmergency,

  getAdminVoiceRuntimeState,
  consumeAdminVoiceRuntimeApproval,
  getPendingApprovals,

  handleAdminConsoleAction,
  handle,
  process
};

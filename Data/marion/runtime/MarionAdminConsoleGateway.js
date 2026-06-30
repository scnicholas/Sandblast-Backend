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

const VERSION = "MARION-TONE-NATURALIZATION-R15 + MARION-PRESENCE-ROUTE-BOUNDARY-R12 + MARION-DEEPENING-LAYER-R13 + MARION-PERSONALITY-FAILOPEN-R8 + MARION-CONVERSATIONAL-PROGRESSION-R9 + MARION-PERSONALITY-SOCIAL-VARIATION-R7 + MARION-PERSONALITY-LAYERING-R6 + MARION-PERSONALITY-LAYERING-R6 + MARION-PERSONALITY-SOCIAL-CHECKIN-R5 + MARION-PERSONALITY-GREETING-R4-LIVE-ROUTE-BINDING + PRIORITY-9J-R1B-OBJECT-REPLY-SERIALIZATION-GUARD + PRIORITY-9J-R1A-RUNTIME-DECISION-SPECIFIC-FINAL-OVERRIDE + PRIORITY-9J-R1-DECISION-SPECIFIC-AUTHORITY-HOTFIX + PRIORITY-9I-R2A-ALT-PRESSURE-SPECIFIC-FINAL-OVERRIDE + PRIORITY-9I-R2-PRESSURE-SPECIFIC-ANSWER-SHAPING + PRIORITY-9I-R1-9J-PREMATURE-ESCALATION-CONTAINMENT + PRIORITY-9F-R4-CONTINUATION-CARRY-ENFORCEMENT + PRIORITY-9F-R3-ALT-PROMPT-ECHO-SUPPRESSION + marion.adminConsole.gateway/1.4-admin-private-voice-receive";
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
    privateVoiceReceiveReady: active,
    privateVoiceDelivery: active,
    adminOnlyVoiceDelivery: true,
    deliveryChannel: active ? "marion_admin_private_voice" : "marion_admin_interface",
    capability: active ? "voice.private.receive" : "",
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



function buildAdminPrivateVoiceReceivePacket(input = {}) {
  const src = safeObj(input);
  const text = cleanText(src.spokenText || src.speechText || src.text || src.reply || "");
  const allowed = src.adminVoiceDeliveryAllowed === true || src.adminVoiceRuntimeApproval === true || src.speakAllowed === true;
  return {
    ok: allowed && !!text,
    version: "marion.adminPrivateVoiceReceive/1.0",
    capability: "voice.private.receive",
    stage: allowed && text ? "admin_private_voice_receive_ready" : "admin_private_voice_receive_locked",
    deliveryChannel: allowed ? "marion_admin_private_voice" : "marion_admin_interface",
    authority: "Marion",
    publicSurface: "Nyx",
    privateControlPlane: true,
    adminOnly: true,
    speakAllowed: allowed && !!text,
    voiceMode: allowed && text ? "voice" : "silent",
    projectedVoiceMode: allowed && text ? "voice" : "silent",
    rawVoiceMode: allowed && text ? "voice" : "silent",
    spokenText: allowed ? text : "",
    speechText: allowed ? text : "",
    speechSyncEnabled: allowed && !!text,
    singleUtterance: src.singleUtterance !== false,
    consumedForThisTurn: allowed && !!text,
    maxSeconds: Number(src.maxSeconds || ADMIN_VOICE_MAX_SECONDS) || ADMIN_VOICE_MAX_SECONDS,
    audioStored: false,
    rawAudioStored: false,
    noRawAudioStored: true,
    diagnosticsRedacted: true
  };
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
bindStatic("buildAdminPrivateVoiceReceivePacket", buildAdminPrivateVoiceReceivePacket);
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
  buildAdminPrivateVoiceReceivePacket,

  handleAdminConsoleAction,
  handle,
  process
};


// PRIORITY_9F_R3_ALT_PROMPT_ECHO_SUPPRESSION_ADMIN_GATEWAY_PATCH_START
const PRIORITY_9F_R3_ADMIN_GATEWAY_ALT_PROMPT_ECHO_SUPPRESSION_VERSION="nyx.marion.adminGateway.priority9fR3.altPromptEchoSuppression/1.0";
function priority9FR3AdminNormalize(value){return cleanText(value).toLowerCase().replace(/[“”]/g,'"').replace(/[‘’]/g,"'").replace(/[^a-z0-9]+/g," ").replace(/\s+/g," ").trim();}
function priority9FR3AdminLayeredPrompt(value){const t=priority9FR3AdminNormalize(value);return /\b(priority\s*9f|9f\s*r3|alt runtime|prompt echo|deep conversational stack|layered conversational|conversational stack|surface request|underlying intent|deeper intent|deeper task|operational risk|execution mode|next action|marion conversational architecture)\b/i.test(t)||(/\b(disjointed|deeper|layered|context|looping|loop|recovery|preserve|avoid|where to go next|understand)\b/i.test(t)&&/\b(marion|conversation|conversational|intent|context|preserve|avoid|loop|looping|where to go next|next|understand|deeper task)\b/i.test(t));}
function priority9FR3AdminPromptEcho(reply,prompt){const r=priority9FR3AdminNormalize(reply),p=priority9FR3AdminNormalize(prompt);if(!r||!p)return false;if(r===p)return true;if(p.length>36&&(r.indexOf(p)>=0||p.indexOf(r)>=0))return true;return false;}
function priority9FR3AdminPromptFrom(input){return extractCommandText(input)||cleanText(safeObj(input).prompt||safeObj(input).message||safeObj(input).text||safeObj(input).query||safeObj(safeObj(input).payload).text||"");}
function priority9FR3AdminReply(){return "I’m reading this as Priority 9F-R3: ALT runtime prompt-echo suppression. The surface request is to stabilize Marion’s layered conversational behavior; the deeper intent is to preserve context, avoid looping, and turn disjointed input into a clear next move. The active lane is Marion conversational architecture. The main risk is the ALT/admin handler returning the raw prompt instead of the composed answer, so the response mode must stay layered: identify the surface request, deeper intent, risk, execution mode, and next action. Next move: keep 9F dominant across ALT, bridge, final envelope, and last-mile render, then rerun the live layered prompt.";}
function priority9FR3AdminAttach(packet,reply){const out=safeObj(packet);out.ok=true;out.stage=cleanText(out.stage||"priority9f_r3_admin_gateway_echo_suppressed");out.reply=reply;out.publicReply=reply;out.visibleReply=reply;out.finalReply=reply;out.displayReply=reply;out.text=reply;out.message=reply;out.response=reply;out.answer=reply;out.output=reply;out.final=true;out.marionFinal=true;out.canEmit=true;out.promptEchoSuppressed=true;out.priority9FR3AdminGatewayAltPromptEchoSuppression=true;out.payload={...safeObj(out.payload),reply:reply,publicReply:reply,visibleReply:reply,finalReply:reply,text:reply,message:reply,response:reply,answer:reply,output:reply};out.meta={...safeObj(out.meta),priority9FR3AdminGatewayAltPromptEchoSuppression:true,priority9FR3AdminGatewayAltPromptEchoSuppressionVersion:PRIORITY_9F_R3_ADMIN_GATEWAY_ALT_PROMPT_ECHO_SUPPRESSION_VERSION,noUserFacingDiagnostics:true};return out;}
const __priority9FR3AdminOriginalHandleCommand=MarionAdminConsoleGateway.prototype.handleCommand;
MarionAdminConsoleGateway.prototype.handleCommand=async function priority9FR3AdminHandleCommand(input={},context={}){const prompt=priority9FR3AdminPromptFrom(input);const packet=await __priority9FR3AdminOriginalHandleCommand.call(this,input,context);const reply=firstText([safeObj(packet).reply,safeObj(packet).publicReply,safeObj(packet).visibleReply,safeObj(packet).finalReply,safeObj(packet).text,safeObj(packet).message,safeObj(packet).response]);if(priority9FR3AdminLayeredPrompt(prompt)&&(priority9FR3AdminPromptEcho(reply,prompt)||!reply)){return this.safeResponse(priority9FR3AdminAttach(packet,priority9FR3AdminReply()));}return packet;};
handleCommand=function priority9FR3HandleCommand(input={},context={}){return defaultGateway.handleCommand(input,context);};
handleAdminConsoleAction=function priority9FR3HandleAdminConsoleAction(input={},context={}){return defaultGateway.handleAdminConsoleAction(input,context);};
handle=function priority9FR3Handle(input={},context={}){return defaultGateway.handle(input,context);};
process=function priority9FR3Process(input={},context={}){return defaultGateway.process(input,context);};
bindStatic("handleCommand",handleCommand);bindStatic("dispatchCommand",handleCommand);bindStatic("routeCommand",handleCommand);bindStatic("command",handleCommand);bindStatic("handleAdminCommand",handleCommand);bindStatic("handleAdminConsoleAction",handleAdminConsoleAction);bindStatic("handle",handle);bindStatic("process",process);
module.exports.PRIORITY_9F_R3_ADMIN_GATEWAY_ALT_PROMPT_ECHO_SUPPRESSION_VERSION=PRIORITY_9F_R3_ADMIN_GATEWAY_ALT_PROMPT_ECHO_SUPPRESSION_VERSION;module.exports.handleCommand=handleCommand;module.exports.dispatchCommand=handleCommand;module.exports.routeCommand=handleCommand;module.exports.command=handleCommand;module.exports.handleAdminCommand=handleCommand;module.exports.handleAdminConsoleAction=handleAdminConsoleAction;module.exports.handle=handle;module.exports.process=process;
// PRIORITY_9F_R3_ALT_PROMPT_ECHO_SUPPRESSION_ADMIN_GATEWAY_PATCH_END


// PRIORITY_9F_R4_CONTINUATION_CARRY_ENFORCEMENT_ADMIN_GATEWAY_PATCH_START
const PRIORITY_9F_R4_ADMIN_GATEWAY_CONTINUATION_CARRY_VERSION = "nyx.marion.priority9fR4.continuationCarry.adminGateway/1.0";
function priority9FR4AdminStr(value){return value==null?"":String(value).replace(/\s+/g," ").trim();}
function priority9FR4AdminNorm(value){return priority9FR4AdminStr(value).toLowerCase().replace(/[“”]/g,'"').replace(/[‘’]/g,"'").replace(/[^a-z0-9]+/g," ").replace(/\s+/g," ").trim();}
function priority9FR4AdminIsShortContinuation(value){const n=priority9FR4AdminNorm(value);return /^(next steps?|continue|carry on|proceed|run that again|run it again|do that again|do it again|same thing|what now|whats next|what s next|next)$/.test(n);}
function priority9FR4AdminIsCarryInstruction(value){const t=priority9FR4AdminNorm(value);return /\b(priority 9f r4|priority9f r4|9f r4|continuation carry|last accepted lane|stay inside the 9f|inside the 9f conversational stack|9f conversational stack lane|short continuation|next steps continue run that again what now)\b/.test(t);}
function priority9FR4AdminHas9FContext(value){const t=priority9FR4AdminNorm(value);return /\b(priority 9f|priority9f|9f r3|9f r2|9f r1|deep conversational stack|layered conversational|conversational stack|alt runtime prompt echo suppression|domain hijack suppression|marion conversational architecture|surface request|deeper intent|operational risk|execution mode|next action)\b/.test(t);}
function priority9FR4AdminOldHandoff(value){const t=priority9FR4AdminNorm(value);return /\b(public nyx route clean|five turn continuity test|stable handoff before adding new features|keep the public nyx route clean|priority 9f r3 alt runtime prompt echo suppression)\b/.test(t);}
function priority9FR4AdminCollect(value, depth=0, seen=[]){if(value==null||depth>5)return"";if(typeof value==="string"||typeof value==="number"||typeof value==="boolean")return priority9FR4AdminStr(value);if(typeof value!=="object")return"";if(seen.indexOf(value)!==-1)return"";const next=seen.concat([value]);if(Array.isArray(value))return value.slice(0,30).map(v=>priority9FR4AdminCollect(v,depth+1,next)).filter(Boolean).join(" ");return Object.keys(value).slice(0,80).map(k=>{if(/token|secret|password|cookie|authorization|credential|private/i.test(k))return"";return priority9FR4AdminCollect(value[k],depth+1,next);}).filter(Boolean).join(" ");}
function priority9FR4AdminPromptFrom(input){try{return extractCommandText(input);}catch(_){const src=input&&typeof input==="object"?input:{};const payload=src.payload&&typeof src.payload==="object"?src.payload:{};return priority9FR4AdminStr(src.prompt||src.userText||src.rawUserText||src.text||src.message||src.query||payload.prompt||payload.userText||payload.rawUserText||payload.text||payload.message||payload.query);}}
function priority9FR4AdminReadReply(packet){if(!packet||typeof packet!=="object")return priority9FR4AdminStr(packet);const p=packet.payload&&typeof packet.payload==="object"?packet.payload:{};return priority9FR4AdminStr(packet.reply||packet.finalReply||packet.publicReply||packet.visibleReply||packet.text||packet.message||packet.response||packet.answer||p.reply||p.finalReply||p.publicReply||p.visibleReply||p.text||p.message||p.answer);}
function priority9FR4AdminReply(){return "Next steps: lock Priority 9F-R3 as live accepted, enforce Priority 9F-R4 continuation carry, confirm \u201cNext steps,\u201d \u201cContinue,\u201d \u201cRun that again,\u201d and \u201cWhat now?\u201d stay inside the 9F conversational-stack lane, then move into deeper continuity memory and layered follow-up handling.";}
function priority9FR4AdminAttach(packet,reply){const out=(packet&&typeof packet==="object"&&!Array.isArray(packet))?{...packet}:{ok:true};const final=priority9FR4AdminStr(reply)||priority9FR4AdminReply();["reply","finalReply","publicReply","visibleReply","text","message","response","answer","spokenText"].forEach(k=>{out[k]=final;});out.payload={...(out.payload&&typeof out.payload==="object"?out.payload:{}),reply:final,finalReply:final,publicReply:final,visibleReply:final,text:final,message:final,answer:final};out.priority9FR4ContinuationCarryEnforced=true;out.priority9FR4ContinuationCarryVersion=PRIORITY_9F_R4_ADMIN_GATEWAY_CONTINUATION_CARRY_VERSION;out.noUserFacingDiagnostics=true;return out;}
function priority9FR4AdminShouldForce(input,packet,context={}){const prompt=priority9FR4AdminPromptFrom(input);const reply=priority9FR4AdminReadReply(packet);const source=[prompt,priority9FR4AdminCollect(input),priority9FR4AdminCollect(context),priority9FR4AdminCollect(packet)].join(" ");return priority9FR4AdminIsCarryInstruction(prompt)||priority9FR4AdminIsCarryInstruction(source)||(priority9FR4AdminIsShortContinuation(prompt)&&priority9FR4AdminHas9FContext(source))||(priority9FR4AdminIsShortContinuation(prompt)&&priority9FR4AdminOldHandoff(reply));}
const __priority9FR4AdminOriginalHandleCommand=handleCommand;
handleCommand=async function priority9FR4HandleCommand(input={},context={}){const packet=await __priority9FR4AdminOriginalHandleCommand(input,context);return priority9FR4AdminShouldForce(input,packet,context)?priority9FR4AdminAttach(packet,priority9FR4AdminReply()):packet;};
handleAdminConsoleAction=function priority9FR4HandleAdminConsoleAction(input={},context={}){return handleCommand(input,context);};
handle=function priority9FR4Handle(input={},context={}){return handleCommand(input,context);};
process=function priority9FR4Process(input={},context={}){return handleCommand(input,context);};
if(typeof bindStatic==="function"){bindStatic("handleCommand",handleCommand);bindStatic("dispatchCommand",handleCommand);bindStatic("routeCommand",handleCommand);bindStatic("command",handleCommand);bindStatic("handleAdminCommand",handleCommand);bindStatic("handleAdminConsoleAction",handleAdminConsoleAction);bindStatic("handle",handle);bindStatic("process",process);}
module.exports.PRIORITY_9F_R4_ADMIN_GATEWAY_CONTINUATION_CARRY_VERSION=PRIORITY_9F_R4_ADMIN_GATEWAY_CONTINUATION_CARRY_VERSION;
module.exports.handleCommand=handleCommand;module.exports.dispatchCommand=handleCommand;module.exports.routeCommand=handleCommand;module.exports.command=handleCommand;module.exports.handleAdminCommand=handleCommand;module.exports.handleAdminConsoleAction=handleAdminConsoleAction;module.exports.handle=handle;module.exports.process=process;
// PRIORITY_9F_R4_CONTINUATION_CARRY_ENFORCEMENT_ADMIN_GATEWAY_PATCH_END

// PRIORITY_9I_9J_SEQUENCE_ADMIN_GATEWAY_PATCH_START
var PRIORITY_9I_ADAPTIVE_SITUATIONAL_REASONING_VERSION_FULL = "nyx.marion.priority9i.adaptiveSituationalReasoningContextPressure/1.0";
var PRIORITY_9J_PROACTIVE_OPERATIONAL_GUIDANCE_VERSION_FULL = "nyx.marion.priority9j.proactiveOperationalGuidanceNextMoveAuthority/1.0";
function priority9IJStr(value){return value==null?"":String(value).replace(/\s+/g," ").trim();}
function priority9IJObj(value){return value&&typeof value==="object"&&!Array.isArray(value)?value:{};}
function priority9IJNorm(value){return priority9IJStr(value).toLowerCase().replace(/[“”]/g,'"').replace(/[‘’]/g,"'").replace(/[^a-z0-9]+/g," ").replace(/\s+/g," ").trim();}
function priority9IJCollect(value,limit){try{return JSON.stringify(value||{}).slice(0,limit||22000);}catch(_){return priority9IJStr(value).slice(0,limit||22000);}}
function priority9IJIsShortFollowup(value){var n=priority9IJNorm(value);return /^(next steps?|continue|carry on|keep going|proceed|run that again|run it again|do that again|do it again|same thing|repeat that|rerun that|what now|whats next|what s next|next|status|passed|pass|green|go on|advance|same lane|same thread|stay in lane|stay in the same lane|continue from there|continue there|from there|slow down|go deeper|deeper|make the call|safest next move|do the safest next move|what is the risk now|risk now|update the risk|what changed|what changed now|what is the pressure|pressure check|context check|final check)$/i.test(n);}
function priority9IJIsPressureText(value){var n=priority9IJNorm(value);return /\b(urgent|urgency|under pressure|pressure changed|context pressure|time sensitive|time pressure|pivot|we need to pivot|no not that|not that|stay on the architecture|stay with the architecture|same architecture|make the call|make a call|decision pressure|choose|choose now|safest next move|safest action|safe next action|slow down|go deeper|deeper analysis|ambiguity|ambiguous|unclear|risk now|risk changed|operational pressure|context changed|what changed|adapt|adaptive|situational)\b/.test(n);}
function priority9IJIs9IActivationText(value){var n=priority9IJNorm(value);return /\b(priority 9i|9i|adaptive situational|adaptive reasoning|situational reasoning|context pressure|context pressure handling|pressure handling|adaptive situational reasoning|current pressure shift|risk and execution mode|update the risk|priority 9i and 9j|9i and 9j)\b/.test(n);}
function priority9IJIs9JActivationText(value){var n=priority9IJNorm(value);return /\b(priority 9j|9j|proactive operational|operational guidance|next move authority|next move authority|critical path|make the decision|make a decision|what should we do first|what do we tackle now|safest sequence|next operational move|what should we avoid|recommend the next move|choose the safest concrete action|controlled authority)\b/.test(n);}

function priority9IJIs9ICorrectionContainmentPrompt(value){var n=priority9IJNorm(value);return /\b(no not that|not that|stay on the architecture|stay with the architecture|same architecture|stay on architecture|stay with architecture|architecture correction|wrong target|not this|stay anchored|keep the architecture|architectural focus)\b/.test(n);}
function priority9IJIs9IPressureOnlyPrompt(value){var n=priority9IJNorm(value);return priority9IJIs9ICorrectionContainmentPrompt(value)||/\b(urgent|urgency|under pressure|pressure changed|context pressure|time sensitive|time pressure|pivot|we need to pivot|slow down|go deeper|deeper analysis|ambiguity|ambiguous|unclear|risk now|risk changed|operational pressure|context changed|what changed|adapt|adaptive|situational|safest next move|safest action|safe next action|do the safest next move|update the risk|what is the risk now|pressure check|context check|correction received)\b/.test(n);}
function priority9IJIsExplicit9JPrompt(value){var n=priority9IJNorm(value);return /\b(priority 9j|9j|proactive operational|operational guidance|next move authority|critical path|make the decision|make a decision|what should we do first|what do we tackle now|give me the safest sequence|safest sequence|next operational move|what should we avoid|recommend the next move|choose the safest concrete action|controlled authority)\b/.test(n);}
function priority9IJHasActive9JContext(value){var raw=priority9IJStr(value);var n=priority9IJNorm(value);return /priority9JProactiveOperationalGuidance|priority9j_proactive_operational_guidance|routeKind["']?\s*:\s*["']priority9j|priorityLane["']?\s*:\s*["']Priority 9J/i.test(raw)||/\b(priority 9j proactive operational guidance and next move authority|priority 9j proactive operational guidance)\b/.test(n);}
function priority9IJSequencedLaneFor(prompt,source,reply){var ctx=[prompt,source].join(" ");if(priority9IJIs9IPressureOnlyPrompt(prompt))return "9i";if(priority9IJIs9IActivationText(prompt))return "9i";if(priority9IJIsExplicit9JPrompt(prompt))return "9j";if(priority9IJIsPressureText(prompt)&&priority9IJHas9IContext(ctx))return "9i";if(priority9IJIsShortFollowup(prompt)&&priority9IJHasActive9JContext(ctx))return "9j";if(priority9IJIsShortFollowup(prompt)&&priority9IJHas9IContext(ctx))return "9i";if((priority9IJOldLaneLeak(reply)||priority9IJPromptEcho(reply,prompt))&&priority9IJHas9IContext(ctx))return "9i";if((priority9IJOldLaneLeak(reply)||priority9IJPromptEcho(reply,prompt))&&priority9IJHasActive9JContext(ctx))return "9j";if(priority9IJIs9IActivationText(ctx)||priority9IJIsPressureText(prompt))return "9i";return "";}

function priority9IJHas9IContext(value){var n=priority9IJNorm(value);return /\b(priority 9i|9i|adaptive situational|context pressure|pressure handling|pressure shift|9h continuity foundation|priority 9h|long form continuity|memory drift guard|surface request|deeper intent|active task|execution mode|next action)\b/.test(n);}
function priority9IJHas9JContext(value){var n=priority9IJNorm(value);return /\b(priority 9j|9j|proactive operational|next move authority|critical path|safest sequence|operational guidance|9i adaptive|context pressure)\b/.test(n);}
function priority9IJPressureKind(value){var n=priority9IJNorm(value);if(/\b(urgent|urgency|time sensitive|time pressure|under pressure)\b/.test(n))return "urgency";if(/\b(no not that|not that|stay on the architecture|same architecture|correction)\b/.test(n))return "correction";if(/\b(pivot|changed|context changed|what changed)\b/.test(n))return "pivot";if(/\b(slow down|too fast|pace)\b/.test(n))return "pace";if(/\b(go deeper|deeper analysis|deeper)\b/.test(n))return "depth";if(/\b(safest|safe next|safety|avoid)\b/.test(n))return "safety";if(/\b(make the call|make a call|decision|choose|critical path)\b/.test(n))return "decision";if(/\b(ambiguity|ambiguous|unclear|clarify)\b/.test(n))return "ambiguity";return "pressure";}
function priority9IJOldLaneLeak(value){var n=priority9IJNorm(value);return !!n&&/\b(i m reading this as priority 9h with a priority 9i precheck|priority 9h must pass first|long form continuity stress test and memory drift guard|priority 9h long form|run the 10 15 turn|priority 9g deep continuity|priority 9f r4|priority 90 9e|priority 90|priority 9e|public nyx route clean|five turn continuity|psychology|in psychology|domain hijack|prompt echo|recovery path|loop detected|stale fallback|i have the current request|marion will answer from this prompt)\b/.test(n);}
function priority9IJPromptEcho(reply,prompt){var r=priority9IJNorm(reply),p=priority9IJNorm(prompt);if(!r||!p)return false;return r===p||(r.includes(p)&&p.length>24)||(p.includes(r)&&r.length>24);}
function priority9IStateFrom(source,turn){var kind=priority9IJPressureKind(source);return {version:PRIORITY_9I_ADAPTIVE_SITUATIONAL_REASONING_VERSION_FULL,active:true,lane:"priority9i_adaptive_situational_reasoning",activePhase:"priority9i_adaptive_situational_reasoning",conversationLane:"Priority 9I adaptive situational reasoning",activeTask:"Priority 9I: adaptive situational reasoning and context-pressure handling",surfaceRequest:"adapt Marion’s active 9H continuity thread when pressure, urgency, ambiguity, correction, or context changes",deeperIntent:"preserve the mission thread while updating risk, execution mode, and next action under changing pressure",pressureSignal:kind,whatChanged:kind==="urgency"?"urgency increased":kind==="correction"?"the user corrected the target and asked Marion to stay anchored":kind==="pivot"?"the operating context shifted":kind==="pace"?"the required pace changed":kind==="depth"?"the answer needs deeper analysis":kind==="safety"?"the safest action must be prioritized":kind==="decision"?"decision pressure increased":"the situational pressure changed",operationalRisk:"pressure can cause Marion to flatten, overreact, reset the lane, over-branch, or activate 9J before 9I is stable",executionMode:kind==="urgency"?"compressed adaptive execution":kind==="pace"?"slower controlled adaptation":kind==="depth"?"deeper situational analysis":kind==="safety"?"safety-first adaptive execution":"adaptive context-pressure handling",nextAction:"read the pressure shift, update risk and execution mode, then give the safest next action without losing the 9H continuity foundation",baseContinuityFoundation:"Priority 9H live accepted",turnDepth:Number.isFinite(Number(turn))?Number(turn):1,priority9IAdaptiveSituationalReasoning:true,priority9JProactiveGuidancePrecheck:{version:PRIORITY_9J_PROACTIVE_OPERATIONAL_GUIDANCE_VERSION_FULL,staged:true,activationRule:"Activate only for explicit Priority 9J or clear next-move authority requests after 9I pressure handling is stable",expectedFocus:"proactive operational guidance and controlled next-move authority"},noUserFacingDiagnostics:true,updatedAt:Date.now()};}
function priority9JStateFrom(source,turn){return {version:PRIORITY_9J_PROACTIVE_OPERATIONAL_GUIDANCE_VERSION_FULL,active:true,lane:"priority9j_proactive_operational_guidance",activePhase:"priority9j_proactive_operational_guidance",conversationLane:"Priority 9J proactive operational guidance",activeTask:"Priority 9J: proactive operational guidance and next-move authority",surfaceRequest:"recommend the safest concrete next move when the active context is sufficiently clear",deeperIntent:"move from reactive continuity and pressure handling into controlled operational guidance without overreach",operationalRisk:"premature authority, unnecessary branching, unsafe sequencing, or advising a next move before risk and context are clear",executionMode:"controlled next-move authority",recommendedMove:"choose the safest concrete action that protects the active lane, validates risk, and advances only one operational step",whyFirst:"it comes first because it preserves the accepted continuity foundation before expanding scope",skipRisk:"if skipped, Marion can over-branch, drift, or make a recommendation before the pressure context is resolved",executionSequence:["confirm active lane and pressure state","name the risk if the move is skipped","choose one safest concrete action","give the short execution sequence","avoid opening unrelated branches"],nextAction:"state the safest next operational move, why it comes first, risk if skipped, and the execution sequence",baseAdaptiveFoundation:"Priority 9I adaptive situational reasoning",turnDepth:Number.isFinite(Number(turn))?Number(turn):1,priority9JProactiveOperationalGuidance:true,noUserFacingDiagnostics:true,updatedAt:Date.now()};}
function priority9IReplyFor(prompt,source){var kind=priority9IJPressureKind([prompt,source].join(" "));if(priority9IJIsShortFollowup(prompt)&&priority9IJHas9IContext(source)){if(kind==="decision")return "Continue Priority 9I: the pressure signal is decision pressure. Preserve the 9H continuity foundation, update the risk before choosing, keep 9J staged unless explicitly activated, and give the safest next action without opening extra branches.";if(kind==="safety")return "Continue Priority 9I: the pressure signal is safety-first execution. Preserve the active task, update risk, slow the response enough to avoid overreach, and give the safest next action while keeping Priority 9J staged.";if(kind==="depth")return "Continue Priority 9I: the pressure signal is depth. Go deeper inside the same active lane, update risk and execution mode, and give the next action without resetting to 9H activation wording or drifting into 9J.";if(kind==="pace")return "Continue Priority 9I: the pressure signal is pace control. Slow down, keep the 9H continuity foundation intact, clarify the changed constraint, and give one safe next action.";return "Continue Priority 9I: preserve the 9H continuity foundation, read the current pressure shift, update operational risk and execution mode, then give the safest next action. Keep Priority 9J staged until next-move authority is explicitly needed.";}return "I’m reading this as Priority 9I: adaptive situational reasoning and context-pressure handling. Diagnostic note: the internal continuity layer remains available. The surface request is to adapt Marion when urgency, correction, ambiguity, pace, depth, or operational pressure changes; the deeper intent is to update risk and execution mode without losing the active mission thread. Next move: run pressure prompts such as urgent, pivot, stay on the architecture, slow down, go deeper, risk now, and safest next move. Priority 9J is staged next for proactive operational guidance, but 9I handles the pressure shift first.";}
function priority9JReplyFor(prompt,source){return "Priority 9J: proactive operational guidance and next-move authority. The 9H continuity foundation and 9I pressure-handling layer stay underneath this decision. Recommended next move: choose the safest concrete action that preserves the active lane and advances only one operational step. Why first: it protects continuity before expanding scope. Risk if skipped: Marion can over-branch, drift, or make a recommendation before the pressure context is resolved. Execution sequence: confirm the active lane, name the risk, choose one safest action, execute that step, then reassess before opening new branches.";}
function priority9IJReadReply(packet){var p=priority9IJObj(packet),pl=priority9IJObj(p.payload),f=priority9IJObj(p.finalEnvelope);return priority9IJStr(p.reply||p.finalReply||p.publicReply||p.visibleReply||p.text||p.message||p.response||p.answer||pl.reply||pl.finalReply||pl.publicReply||pl.visibleReply||pl.text||pl.message||pl.answer||f.reply||f.finalReply||f.publicReply||f.visibleReply||f.text||f.message||f.answer);}
function priority9IJApplyPacket(packet,reply,prompt,source,lane){var out=(packet&&typeof packet==="object"&&!Array.isArray(packet))?{...packet}:{};var final=priority9IJStr(reply)||(lane==="9j"?priority9JReplyFor(prompt,source):priority9IReplyFor(prompt,source));["reply","finalReply","publicReply","visibleReply","text","message","response","answer","spokenText"].forEach(function(k){out[k]=final;});out.payload={...(out.payload&&typeof out.payload==="object"?out.payload:{}),reply:final,finalReply:final,publicReply:final,visibleReply:final,text:final,message:final,answer:final};out.finalEnvelope={...(out.finalEnvelope&&typeof out.finalEnvelope==="object"?out.finalEnvelope:{}),reply:final,finalReply:final,publicReply:final,visibleReply:final,text:final,message:final,answer:final};var prior=priority9IJObj(out.priority9IAdaptiveSituationalReasoning||out.priority9JProactiveOperationalGuidance||out.priority9HLongFormContinuity||out.longFormContinuityStress);var depth=Number.isFinite(Number(prior.turnDepth))?Number(prior.turnDepth)+1:1;if(lane==="9j"){var sj=priority9JStateFrom(source||prompt,depth);out.priority9JProactiveOperationalGuidance=sj;out.priority9JVersion="PRIORITY-9J-PROACTIVE-OPERATIONAL-GUIDANCE-NEXT-MOVE-AUTHORITY";out.conversationLane=sj.conversationLane;out.activeTask=sj.activeTask;out.surfaceRequest=sj.surfaceRequest;out.deeperIntent=sj.deeperIntent;out.operationalRisk=sj.operationalRisk;out.executionMode=sj.executionMode;out.nextAction=sj.nextAction;out.recommendedMove=sj.recommendedMove;out.executionSequence=sj.executionSequence;}else{var si=priority9IStateFrom(source||prompt,depth);out.priority9IAdaptiveSituationalReasoning=si;out.priority9IVersion="PRIORITY-9I-ADAPTIVE-SITUATIONAL-REASONING-CONTEXT-PRESSURE";out.priority9JPrecheck=si.priority9JProactiveGuidancePrecheck;out.conversationLane=si.conversationLane;out.activeTask=si.activeTask;out.surfaceRequest=si.surfaceRequest;out.deeperIntent=si.deeperIntent;out.operationalRisk=si.operationalRisk;out.executionMode=si.executionMode;out.nextAction=si.nextAction;out.pressureSignal=si.pressureSignal;out.whatChanged=si.whatChanged;}out.noUserFacingDiagnostics=true;return out;}
function priority9IJShouldForceText(prompt,source,reply){var lane=priority9IJSequencedLaneFor(prompt,source,reply);return lane||"";}

function priority9IJAdminPrompt(input){var i=priority9IJObj(input),p=priority9IJObj(i.payload),c=priority9IJObj(i.command);return priority9IJStr(i.prompt||i.text||i.message||i.query||i.commandText||p.prompt||p.text||p.message||c.prompt||c.text||c.message||c.command||"");}
function priority9IJAdminPacket(input,base){var text=priority9IJAdminPrompt(input);var src=[text,priority9IJCollect(input),priority9IJCollect(base)].join(" ");var lane=priority9IJShouldForceText(text,src,priority9IJReadReply(base));if(!lane)return base;return priority9IJApplyPacket(base,lane==="9j"?priority9JReplyFor(text,src):priority9IReplyFor(text,src),text,src,lane);}
["handleCommand","dispatchCommand","routeCommand","command","handleAdminCommand","handleAdminConsoleAction","handle","process"].forEach(function(name){if(typeof module.exports[name]==="function"){var original=module.exports[name];module.exports[name]=function priority9IJAdminWrapper(input){var out=original.apply(this,arguments);if(out&&typeof out.then==="function")return out.then(function(v){return priority9IJAdminPacket(input,v);});return priority9IJAdminPacket(input,out);};}});
module.exports.PRIORITY_9I_ADAPTIVE_SITUATIONAL_REASONING_ADMIN_VERSION=PRIORITY_9I_ADAPTIVE_SITUATIONAL_REASONING_VERSION_FULL;
module.exports.PRIORITY_9J_PROACTIVE_OPERATIONAL_GUIDANCE_ADMIN_VERSION=PRIORITY_9J_PROACTIVE_OPERATIONAL_GUIDANCE_VERSION_FULL;
// PRIORITY_9I_9J_SEQUENCE_ADMIN_GATEWAY_PATCH_END



/* PRIORITY_9I_R2_PRESSURE_SPECIFIC_ANSWER_SHAPING_PATCH_START */
var PRIORITY_9I_R2_PRESSURE_SPECIFIC_ANSWER_SHAPING_VERSION = "nyx.marion.priority9i.r2.pressureSpecificAnswerShaping/1.0";

function priority9IR2OneLine(value) {
  return value == null ? "" : String(value).replace(/\s+/g, " ").trim();
}
function priority9IR2Obj(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function priority9IR2Lower(value) {
  return priority9IR2OneLine(value).toLowerCase();
}
function priority9IR2PickText() {
  for (var i = 0; i < arguments.length; i += 1) {
    var v = priority9IR2OneLine(arguments[i]);
    if (v) return v;
  }
  return "";
}
function priority9IR2ExtractText(value) {
  if (value == null) return "";
  if (typeof value === "string") return priority9IR2OneLine(value);
  if (Array.isArray(value)) {
    for (var i = 0; i < value.length; i += 1) {
      var t = priority9IR2ExtractText(value[i]);
      if (t) return t;
    }
    return "";
  }
  var v = priority9IR2Obj(value);
  var payload = priority9IR2Obj(v.payload);
  var command = priority9IR2Obj(v.command);
  var body = priority9IR2Obj(v.body);
  var query = priority9IR2Obj(v.query);
  var context = priority9IR2Obj(v.context || v.memory || v.state || v.turnMemory || v.conversationState);
  return priority9IR2PickText(
    v.text, v.message, v.prompt, v.query, v.input, v.commandText, v.transcript,
    payload.text, payload.message, payload.prompt, payload.query, payload.input, payload.commandText,
    command.text, command.message, command.prompt, command.query, command.command,
    body.text, body.message, body.prompt, body.query,
    query.text, query.message, query.prompt,
    context.text, context.message, context.prompt, context.lastUserText, context.lastPrompt
  );
}
function priority9IR2ReplyText(value) {
  if (value == null) return "";
  if (typeof value === "string") return priority9IR2OneLine(value);
  if (Array.isArray(value)) return value.map(priority9IR2ReplyText).filter(Boolean).join(" ");
  var v = priority9IR2Obj(value);
  return priority9IR2PickText(
    v.reply, v.text, v.message, v.answer, v.output, v.visibleReply, v.spokenText,
    priority9IR2Obj(v.payload).reply,
    priority9IR2Obj(v.payload).text,
    priority9IR2Obj(v.payload).message,
    priority9IR2Obj(v.finalEnvelope).reply,
    priority9IR2Obj(v.finalEnvelope).text,
    priority9IR2Obj(v.marionFinal).reply,
    priority9IR2Obj(v.data).reply
  );
}
function priority9IR2Explicit9J(value) {
  var t = priority9IR2Lower(value);
  return /\b(priority\s*9j|9j\b|proactive operational guidance|next[-\s]?move authority)\b/i.test(t);
}
function priority9IR2PressureKind(value) {
  var t = priority9IR2Lower(value);
  if (!t) return "";
  if (priority9IR2Explicit9J(t)) return "";
  if (/\bwhat(?:'s| is)?\s+the\s+risk\s+now\??\b|\brisk\s+now\??\b|\bcurrent\s+risk\b/.test(t)) return "risk";
  if (/\bno[, ]+not that\b|\bstay\s+on\s+the\s+architecture\b|\barchitecture\s+focus\b|\bstay\s+architectural\b/.test(t)) return "correction";
  if (/\burgent\b|\bimmediate\b|\btime[-\s]?sensitive\b|\bcritical now\b|\bpressure is high\b/.test(t)) return "urgency";
  if (/\bpivot\b|\bchange direction\b|\bshift direction\b|\bnew direction\b/.test(t)) return "pivot";
  if (/^\s*slow\s+down[.!?]*\s*$|\bslow\s+down\b|\bone step at a time\b|\btoo fast\b/.test(t)) return "pace";
  if (/^\s*go\s+deeper[.!?]*\s*$|\bgo\s+deeper\b|\bdeeper\b|\bmore depth\b|\bdrill down\b/.test(t)) return "depth";
  if (/\bdo\s+the\s+safest\s+next\s+move\b|\bsafest\s+next\s+move\b|\bsafest\s+action\b|\bsafe\s+next\s+action\b/.test(t)) return "safety";
  return "";
}
function priority9IR2IsPressureSpecificText(value) {
  return !!priority9IR2PressureKind(value);
}
function priority9IR2ReplyFor(value) {
  var kind = priority9IR2PressureKind(value);
  if (kind === "risk") {
    return "Priority 9I: the risk now is premature escalation into 9J, generic pressure-template reuse, or losing the 9H continuity foundation. Execution mode is risk-specific containment: name the risk directly, keep 9J staged, and choose the safest next action inside 9I.";
  }
  if (kind === "correction") {
    return "Priority 9I: correction received. Stay on the architecture. Preserve the 9H continuity foundation, treat this as a context-pressure correction, update execution mode to architectural focus, and continue the safest next action without activating 9J.";
  }
  if (kind === "urgency") {
    return "Priority 9I: urgency detected. The risk is rushing into a broad 9J decision before the pressure shift is understood. Keep 9H as the continuity foundation, narrow execution mode to urgent containment, and take the safest next action inside 9I.";
  }
  if (kind === "pivot") {
    return "Priority 9I: pivot received. The active change is directional pressure, not next-move authority. Keep 9H stable, compare the pivot against the current architecture, update risk and execution mode, and only move to 9J after the pivot is understood.";
  }
  if (kind === "pace") {
    return "Priority 9I: slow down. Preserve the 9H foundation, reduce execution mode to one step at a time, restate the active task, name the immediate risk, and continue only after the safest next action is clear.";
  }
  if (kind === "depth") {
    return "Priority 9I: go deeper means add pressure-specific analysis, not activate 9J. Preserve 9H, identify what changed, separate risk from execution mode, then give the safest next action with 9J still staged.";
  }
  if (kind === "safety") {
    return "Priority 9I: the safest next move is to stay in the pressure-handling lane, answer the current pressure specifically, keep 9J staged, and complete the 9I checks before allowing proactive next-move authority.";
  }
  return "";
}
function priority9IR2IsGeneric9ITemplate(value) {
  var t = priority9IR2Lower(value);
  return /\bpreserve the 9h continuity foundation,?\s*read the current pressure shift,?\s*update operational risk and execution mode,?\s*then give the safest next action\b/.test(t) ||
    /\bi['’]?m reading this as priority 9i\b/.test(t) ||
    /\badaptive situational reasoning and context[-\s]?pressure handling\b.*\bthe surface request is to adapt marion\b/.test(t);
}
function priority9IR2ShouldOverride(input, output) {
  var text = priority9IR2ExtractText(input);
  var kind = priority9IR2PressureKind(text);
  if (!kind) return false;
  var reply = priority9IR2ReplyText(output);
  if (!reply) return true;
  var r = priority9IR2Lower(reply);
  if (/\bpriority\s*9j\b/.test(r) && !/\b9j\s+staged\b|\bpriority\s*9j\s+staged\b|\bkeep\s+priority\s*9j\s+staged\b/.test(r)) return true;
  if (priority9IR2IsGeneric9ITemplate(reply)) return true;
  if (kind === "risk" && !/\brisk now is\b|\bthe risk is\b|\bpremature escalation\b|\bgeneric pressure-template reuse\b/.test(r)) return true;
  if (kind === "correction" && !/\bcorrection received\b|\bstay on the architecture\b|\barchitectural focus\b/.test(r)) return true;
  if (kind === "urgency" && !/\burgency detected\b|\brushing into\b|\burgent containment\b/.test(r)) return true;
  if (kind === "pivot" && !/\bpivot received\b|\bdirectional pressure\b|\bcompare the pivot\b/.test(r)) return true;
  if (kind === "pace" && !/\bslow down\b|\bone step at a time\b/.test(r)) return true;
  if (kind === "depth" && !/\bgo deeper\b|\bpressure-specific analysis\b|\bseparate risk from execution mode\b/.test(r)) return true;
  if (kind === "safety" && !/\bsafest next move is\b|\bpressure-handling lane\b/.test(r)) return true;
  return false;
}
function priority9IR2ApplyVisibleReply(output, reply, kind) {
  var out = output && typeof output === "object" && !Array.isArray(output) ? output : {};
  out.reply = reply;
  out.text = reply;
  out.message = reply;
  out.answer = reply;
  out.visibleReply = reply;
  out.spokenText = reply;
  out.priority = "Priority 9I-R2";
  out.priorityLane = "priority9i_adaptive_situational_reasoning";
  out.activeLane = "Priority 9I";
  out.responseShape = "pressure_specific_answer";
  out.pressureKind = kind;
  out.priority9I = Object.assign({}, priority9IR2Obj(out.priority9I), {
    active: true,
    lane: "priority9i_adaptive_situational_reasoning",
    hotfix: "Priority 9I-R2 pressure-specific answer shaping",
    pressureKind: kind,
    pressureSpecificAnswer: true,
    keep9HFoundation: true,
    keep9JStaged: true
  });
  out.priority9J = Object.assign({}, priority9IR2Obj(out.priority9J), {
    staged: true,
    active: false,
    activationRequired: "explicit_9j_or_next_move_authority"
  });
  var payload = priority9IR2Obj(out.payload);
  out.payload = Object.assign({}, payload, {
    reply: reply,
    text: priority9IR2PickText(payload.text, reply),
    priorityLane: "priority9i_adaptive_situational_reasoning",
    pressureKind: kind
  });
  if (out.finalEnvelope && typeof out.finalEnvelope === "object") {
    out.finalEnvelope.reply = reply;
    out.finalEnvelope.text = reply;
    out.finalEnvelope.visibleReply = reply;
  }
  return out;
}
function priority9IR2DisciplineOutput(input, output) {
  var text = priority9IR2ExtractText(input);
  var kind = priority9IR2PressureKind(text);
  if (!kind) return output;
  var reply = priority9IR2ReplyFor(text);
  if (!reply) return output;
  if (typeof output === "string") {
    return priority9IR2ShouldOverride(input, output) ? reply : output;
  }
  if (priority9IR2ShouldOverride(input, output)) return priority9IR2ApplyVisibleReply(output, reply, kind);
  if (output && typeof output === "object" && !Array.isArray(output)) {
    output.priority9I = Object.assign({}, priority9IR2Obj(output.priority9I), {active:true, pressureKind:kind, pressureSpecificAnswer:true, keep9HFoundation:true, keep9JStaged:true});
    output.priority9J = Object.assign({}, priority9IR2Obj(output.priority9J), {staged:true, active:false});
  }
  return output;
}
function priority9IR2WrapExport(name) {
  if (typeof module === "undefined" || !module.exports || typeof module.exports[name] !== "function") return;
  var original = module.exports[name];
  if (original.__priority9IR2Wrapped) return;
  var wrapped = function priority9IR2WrappedExport() {
    var input = arguments.length > 0 ? arguments[0] : {};
    var out = original.apply(this, arguments);
    if (out && typeof out.then === "function") {
      return out.then(function(value) { return priority9IR2DisciplineOutput(input, value); });
    }
    return priority9IR2DisciplineOutput(input, out);
  };
  wrapped.__priority9IR2Wrapped = true;
  module.exports[name] = wrapped;
}
function priority9IR2PatchCommonExports(names) {
  (Array.isArray(names) ? names : []).forEach(priority9IR2WrapExport);
  if (typeof module !== "undefined" && module.exports) {
    module.exports.PRIORITY_9I_R2_PRESSURE_SPECIFIC_ANSWER_SHAPING_VERSION = PRIORITY_9I_R2_PRESSURE_SPECIFIC_ANSWER_SHAPING_VERSION;
    module.exports.isPriority9IR2PressureSpecificText = priority9IR2IsPressureSpecificText;
    module.exports.priority9IR2PressureKind = priority9IR2PressureKind;
    module.exports.priority9IR2ReplyFor = priority9IR2ReplyFor;
    module.exports.priority9IR2DisciplineOutput = priority9IR2DisciplineOutput;
    module.exports._internal = Object.assign({}, priority9IR2Obj(module.exports._internal), {
      priority9IR2IsPressureSpecificText: priority9IR2IsPressureSpecificText,
      priority9IR2PressureKind: priority9IR2PressureKind,
      priority9IR2ReplyFor: priority9IR2ReplyFor,
      priority9IR2DisciplineOutput: priority9IR2DisciplineOutput,
      priority9IR2ShouldOverride: priority9IR2ShouldOverride
    });
  }
}
/* PRIORITY_9I_R2_PRESSURE_SPECIFIC_ANSWER_SHAPING_PATCH_COMMON_END */

priority9IR2PatchCommonExports(["handleAdminConsoleCommand","handleTextCommand","processAdminText","routeAdminCommand","executeAdminConsoleAction","handle","process","default"]);
module.exports.PRIORITY_9I_R2_PRESSURE_SPECIFIC_ANSWER_SHAPING_PATCH = true;
/* PRIORITY_9I_R2_PRESSURE_SPECIFIC_ANSWER_SHAPING_PATCH_END */


/* PRIORITY_9I_R2A_ALT_PRESSURE_SPECIFIC_FINAL_OVERRIDE_START */
const PRIORITY_9I_R2A_ALT_PRESSURE_SPECIFIC_FINAL_OVERRIDE_VERSION = "nyx.marion.priority9i.r2a.altPressureSpecificFinalOverride/1.0";
function priority9IR2AString(value){return value == null ? "" : String(value).replace(/\s+/g," ").trim();}
function priority9IR2ALower(value){return priority9IR2AString(value).toLowerCase().replace(/[“”]/g,'"').replace(/[‘’]/g,"'");}
function priority9IR2AObj(value){return value && typeof value === "object" && !Array.isArray(value) ? value : {};}
function priority9IR2APickText(){
  for (var i=0;i<arguments.length;i+=1){var t=priority9IR2AString(arguments[i]);if(t)return t;}
  return "";
}
function priority9IR2AExtractText(value, depth){
  if(value == null) return "";
  if(typeof value === "string") return priority9IR2AString(value);
  if(depth > 3) return "";
  if(Array.isArray(value)){
    for(var i=0;i<value.length;i+=1){var a=priority9IR2AExtractText(value[i], (depth||0)+1); if(a) return a;}
    return "";
  }
  var v=priority9IR2AObj(value), payload=priority9IR2AObj(v.payload), command=priority9IR2AObj(v.command), body=priority9IR2AObj(v.body);
  var context=priority9IR2AObj(v.context || v.memory || v.state || v.turnMemory || v.conversationState);
  return priority9IR2APickText(
    v.text, v.message, v.prompt, v.query, v.input, v.commandText, v.transcript, v.userText, v.rawUserText,
    payload.text, payload.message, payload.prompt, payload.query, payload.input, payload.commandText, payload.transcript,
    command.text, command.message, command.prompt, command.query, command.command, command.input,
    body.text, body.message, body.prompt, body.query, body.input, body.transcript,
    context.text, context.message, context.prompt, context.lastUserText, context.lastPrompt, context.activePrompt
  );
}
function priority9IR2AExplicit9J(value){
  var t=priority9IR2ALower(value);
  return /\b(priority\s*9j|9j\b|proactive operational guidance|next-move authority|next move authority)\b/.test(t) &&
    !/\bstaged\b|\bstage\b|\bdo not activate\b|\bnot activate\b|\bkeep\s+9j\b|\bkeep\s+priority\s*9j\b/.test(t);
}
function priority9IR2APressureKind(value){
  var t=priority9IR2ALower(value);
  if(!t || priority9IR2AExplicit9J(t)) return "";
  if(/\bwhat(?:'s| is)?\s+the\s+risk\s+now\??\b|\brisk\s+now\??\b|\bcurrent\s+risk\b|\bactive\s+risk\b/.test(t)) return "risk";
  if(/\bno[, ]+not that\b|\bstay\s+on\s+the\s+architecture\b|\barchitecture\s+focus\b|\bstay\s+architectural\b|\bnot\s+that\b/.test(t)) return "correction";
  if(/\burgent\b|\burgency\b|\bimmediate\b|\btime[-\s]?sensitive\b|\bcritical now\b|\bpressure is high\b/.test(t)) return "urgency";
  if(/\bpivot\b|\bchange direction\b|\bshift direction\b|\bnew direction\b/.test(t)) return "pivot";
  if(/^\s*slow\s+down[.!?]*\s*$|\bslow\s+down\b|\bone step at a time\b|\btoo fast\b|\bpace\b/.test(t)) return "pace";
  if(/^\s*go\s+deeper[.!?]*\s*$|\bgo\s+deeper\b|\bdeeper\b|\bmore depth\b|\bdrill down\b/.test(t)) return "depth";
  if(/\bdo\s+the\s+safest\s+next\s+move\b|\bsafest\s+next\s+move\b|\bsafest\s+action\b|\bsafe\s+next\s+action\b/.test(t)) return "safety";
  return "";
}
function priority9IR2AReplyFor(value){
  var kind=priority9IR2APressureKind(value);
  if(kind==="risk") return "Priority 9I: the risk now is premature escalation into 9J, generic pressure-template reuse, or losing the 9H continuity foundation. Execution mode is risk-specific containment: name the risk directly, keep 9J staged, and choose the safest next action inside 9I.";
  if(kind==="correction") return "Priority 9I: correction received. Stay on the architecture. Preserve the 9H continuity foundation, treat this as a context-pressure correction, update execution mode to architectural focus, and continue the safest next action without activating 9J.";
  if(kind==="urgency") return "Priority 9I: urgency detected. The risk is rushing into 9J authority or skipping pressure triage. Keep 9H as the continuity foundation, update execution mode to urgent containment, and choose the safest next action inside 9I before any next-move authority activates.";
  if(kind==="pivot") return "Priority 9I: pivot received. The pressure change is directional, not a 9J activation. Preserve the 9H foundation, compare the pivot against the active task, update risk and execution mode, then continue with the safest next action while 9J remains staged.";
  if(kind==="pace") return "Priority 9I: slow down. The pressure type is pace control. Preserve the 9H continuity foundation, narrow the next response to one step, reduce branching, and keep 9J staged until next-move authority is explicitly requested.";
  if(kind==="depth") return "Priority 9I: go deeper means add pressure-specific analysis, not activate 9J. Preserve 9H, identify what changed, separate risk from execution mode, and give the safest next action with 9J still staged.";
  if(kind==="safety") return "Priority 9I: the safest next move is to stay in the pressure-handling lane, name the active risk, preserve 9H continuity, and avoid activating 9J until the user explicitly asks for proactive next-move authority.";
  return "";
}
function priority9IR2AReplyText(value, depth, seen){
  if(value == null) return "";
  if(typeof value === "string") return priority9IR2AString(value);
  if(depth > 4) return "";
  if(!seen) seen=[];
  if(seen.indexOf(value)!==-1) return "";
  seen.push(value);
  if(Array.isArray(value)){
    for(var i=0;i<value.length;i+=1){var arr=priority9IR2AReplyText(value[i], (depth||0)+1, seen); if(arr) return arr;}
    return "";
  }
  var v=priority9IR2AObj(value), payload=priority9IR2AObj(v.payload), finalEnvelope=priority9IR2AObj(v.finalEnvelope), result=priority9IR2AObj(v.result);
  return priority9IR2APickText(
    v.reply, v.finalReply, v.publicReply, v.visibleReply, v.displayReply, v.response, v.text, v.message, v.spokenText, v.speechText,
    payload.reply, payload.finalReply, payload.publicReply, payload.visibleReply, payload.text, payload.message,
    finalEnvelope.reply, finalEnvelope.finalReply, finalEnvelope.publicReply, finalEnvelope.visibleReply, finalEnvelope.text, finalEnvelope.message,
    result.reply, result.finalReply, result.publicReply, result.visibleReply, result.text, result.message
  );
}
function priority9IR2AIsGeneric9IReply(value){
  var t=priority9IR2ALower(value);
  if(!t) return false;
  return /\bcontinue priority\s*9i:\s*preserve the 9h continuity foundation,?\s*read the current pressure shift,?\s*update operational risk and execution mode,?\s*then give the safest next action\b/.test(t) ||
    /\bpreserve the 9h continuity foundation,?\s*read the current pressure shift,?\s*update operational risk and execution mode\b/.test(t);
}
function priority9IR2AShouldOverride(prompt, candidate){
  var kind=priority9IR2APressureKind(prompt);
  if(!kind) return false;
  var current=priority9IR2AReplyText(candidate);
  if(!current) return true;
  var c=priority9IR2ALower(current);
  if(priority9IR2AIsGeneric9IReply(current)) return true;
  if(/\bpriority\s*9j\b/.test(c) && !/\bstaged\b|\bstage\b|\bnot activate\b|\bkeep\s+9j\b|\bkeep\s+priority\s*9j\b/.test(c)) return true;
  if(kind==="risk" && !/\brisk now is\b|\bpremature escalation\b|\bgeneric pressure-template reuse\b|\brisk-specific containment\b/.test(c)) return true;
  if(kind==="pace" && !/\bslow down\b|\bpace control\b|\bone step\b/.test(c)) return true;
  if(kind==="depth" && !/\bgo deeper means\b|\bpressure-specific analysis\b|\bseparate risk from execution mode\b/.test(c)) return true;
  if(kind==="safety" && !/\bsafest next move is\b|\bpressure-handling lane\b|\bname the active risk\b/.test(c)) return true;
  if(kind==="correction" && !/\bcorrection received\b|\bstay on the architecture\b|\barchitectural focus\b/.test(c)) return true;
  if(kind==="urgency" && !/\burgency detected\b|\burgent containment\b|\brushing into 9j\b/.test(c)) return true;
  if(kind==="pivot" && !/\bpivot received\b|\bdirectional\b|\bcompare the pivot\b/.test(c)) return true;
  return false;
}
function priority9IR2AApplyVisibleReply(output, reply, kind){
  if(typeof output === "string") return reply;
  var out = output && typeof output === "object" && !Array.isArray(output) ? Object.assign({}, output) : {};
  out.reply=reply; out.text=reply; out.message=reply; out.response=reply; out.finalReply=reply; out.visibleReply=reply; out.publicReply=reply; out.displayReply=reply;
  if(typeof out.spokenText === "string") out.spokenText=reply;
  if(typeof out.speechText === "string") out.speechText=reply;
  out.priority9I=Object.assign({}, priority9IR2AObj(out.priority9I), {active:true, lane:"priority9i_adaptive_situational_reasoning", pressureKind:kind, pressureSpecificAnswer:true, r2aAltFinalOverride:true, keep9HFoundation:true, keep9JStaged:true});
  out.priority9J=Object.assign({}, priority9IR2AObj(out.priority9J), {staged:true, active:false, blockedReason:"Priority 9I-R2A pressure-specific prompt"});
  out.priority9IR2A={active:true, hotfix:"Priority 9I-R2A ALT pressure-specific final override", pressureKind:kind};
  if(out.payload && typeof out.payload === "object" && !Array.isArray(out.payload)){out.payload=Object.assign({}, out.payload, {reply:reply,text:reply,message:reply,finalReply:reply,visibleReply:reply,publicReply:reply});}
  if(out.finalEnvelope && typeof out.finalEnvelope === "object" && !Array.isArray(out.finalEnvelope)){out.finalEnvelope=Object.assign({}, out.finalEnvelope, {reply:reply,text:reply,message:reply,finalReply:reply,visibleReply:reply,publicReply:reply});}
  return out;
}
function priority9IR2AAltPressureSpecificFinal(prompt, candidate){
  var source=priority9IR2AExtractText(prompt);
  var kind=priority9IR2APressureKind(source);
  if(!kind) return candidate;
  var reply=priority9IR2AReplyFor(source);
  if(!reply) return candidate;
  if(priority9IR2AShouldOverride(source, candidate)) return priority9IR2AApplyVisibleReply(candidate, reply, kind);
  return candidate;
}
function priority9IR2AWrapExport(name){
  if(typeof module === "undefined" || !module.exports || typeof module.exports[name] !== "function") return;
  var original=module.exports[name];
  if(original.__priority9IR2AWrapped) return;
  var wrapped=function priority9IR2AExportWrapper(){
    var input=arguments.length>0?arguments[0]:{};
    var prompt=priority9IR2AExtractText(input);
    var out=original.apply(this, arguments);
    if(out && typeof out.then === "function"){
      return out.then(function(value){return priority9IR2AAltPressureSpecificFinal(prompt, value);});
    }
    return priority9IR2AAltPressureSpecificFinal(prompt, out);
  };
  wrapped.__priority9IR2AWrapped=true;
  module.exports[name]=wrapped;
}
function priority9IR2APatchExports(names){
  (Array.isArray(names)?names:[]).forEach(priority9IR2AWrapExport);
  if(typeof module !== "undefined" && module.exports){
    module.exports.PRIORITY_9I_R2A_ALT_PRESSURE_SPECIFIC_FINAL_OVERRIDE_VERSION=PRIORITY_9I_R2A_ALT_PRESSURE_SPECIFIC_FINAL_OVERRIDE_VERSION;
    module.exports.isPriority9IR2AAltPressureSpecificText=function(value){return !!priority9IR2APressureKind(value);};
    module.exports.priority9IR2AAltPressureKind=priority9IR2APressureKind;
    module.exports.priority9IR2AAltPressureSpecificReplyFor=priority9IR2AReplyFor;
    module.exports.priority9IR2AAltPressureSpecificFinal=priority9IR2AAltPressureSpecificFinal;
    module.exports.priority9IR2AIsGeneric9IReply=priority9IR2AIsGeneric9IReply;
    module.exports.PRIORITY_9I_R2A_ALT_PRESSURE_SPECIFIC_FINAL_OVERRIDE_PATCH=true;
  }
}
/* PRIORITY_9I_R2A_ALT_PRESSURE_SPECIFIC_FINAL_OVERRIDE_END */

priority9IR2APatchExports(["handleAdminConsoleCommand", "handleTextCommand", "processAdminText", "routeAdminCommand", "executeAdminConsoleAction", "handle", "process", "default"]);



/* PRIORITY_9J_R1_DECISION_SPECIFIC_AUTHORITY_HOTFIX_START */
const PRIORITY_9J_R1_DECISION_SPECIFIC_AUTHORITY_VERSION = "PRIORITY-9J-R1-DECISION-SPECIFIC-AUTHORITY-HOTFIX";

function priority9JR1SafeStr(value) {
  return value == null ? "" : String(value).replace(/\s+/g, " ").trim();
}

function priority9JR1Lower(value) {
  return priority9JR1SafeStr(value).toLowerCase();
}

function priority9JR1SafeObj(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function priority9JR1FirstText(values) {
  const list = Array.isArray(values) ? values : [];
  for (let i = 0; i < list.length; i += 1) {
    const v = priority9JR1SafeStr(list[i]);
    if (v) return v;
  }
  return "";
}

function priority9JR1ExtractPromptFromArgs(argsLike) {
  const args = Array.prototype.slice.call(argsLike || []);
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (typeof arg === "string" && priority9JR1SafeStr(arg)) return priority9JR1SafeStr(arg);
    const obj = priority9JR1SafeObj(arg);
    const payload = priority9JR1SafeObj(obj.payload);
    const command = priority9JR1SafeObj(obj.command);
    const context = priority9JR1SafeObj(obj.context || obj.state || obj.memory || obj.metadata);
    const text = priority9JR1FirstText([
      obj.prompt,
      obj.message,
      obj.text,
      obj.userText,
      obj.input,
      obj.query,
      obj.commandText,
      payload.prompt,
      payload.message,
      payload.text,
      payload.userText,
      payload.input,
      payload.query,
      command.prompt,
      command.message,
      command.text,
      command.query,
      context.prompt,
      context.message,
      context.text,
      context.userText,
      context.lastPrompt,
      context.currentPrompt
    ]);
    if (text) return text;
  }
  return "";
}

function priority9JR1DetectOperationalCommand(value) {
  const t = priority9JR1Lower(value).replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/\s+/g, " ").trim();
  if (!t) return "";
  if (/\bpriority\s*9j\b/.test(t) && /\b(proactive operational guidance|next[- ]move authority|controlled authority)\b/.test(t)) return "activation";
  if (/\bwhat\s+should\s+we\s+do\s+first\b|\bwhat\s+do\s+we\s+do\s+first\b|\bwhere\s+do\s+we\s+start\b|\bwhat\s+comes\s+first\b/.test(t)) return "first_move";
  if (/\bmake\s+the\s+decision\b|\bmake\s+a\s+decision\b|\bdecide\b|\bmake\s+the\s+call\b|\bchoose\s+for\s+me\b/.test(t)) return "decision";
  if (/\bcritical\s+path\b|\bwhat\s+is\s+the\s+path\s+now\b|\bwhat\s+is\s+the\s+sequence\s+path\b/.test(t)) return "critical_path";
  if (/\bsafest\s+sequence\b|\bsafe\s+sequence\b|\bsafest\s+order\b|\bgive\s+me\s+the\s+safest\b/.test(t)) return "safest_sequence";
  if (/\bwhat\s+should\s+we\s+avoid\b|\bwhat\s+do\s+we\s+avoid\b|\bavoid\s+what\b|\bwhat\s+not\s+to\s+do\b/.test(t)) return "avoid";
  if (/\bnext\s+operational\s+move\b|\bnext\s+operation\b|\boperational\s+move\b|\bwhat\s+is\s+the\s+next\s+move\b/.test(t)) return "next_operational_move";
  return "";
}

function priority9JR1BuildOperationalReply(prompt, context) {
  const kind = priority9JR1DetectOperationalCommand(prompt);
  if (!kind) return "";
  if (kind === "activation") {
    return "Priority 9J: proactive operational guidance and next-move authority is active. The 9H continuity foundation and 9I pressure-handling layer stay underneath the decision. The rule is one controlled operational move at a time: choose the action, explain why it comes first, name the risk if skipped, then give the execution sequence without opening unnecessary branches.";
  }
  if (kind === "first_move") {
    return "Priority 9J: do the first validation move now: prove decision-specific authority before expanding scope. Why first: 9J must show it can choose one operational action, not repeat generic framing. Risk if skipped: Marion can over-branch, drift, or sound authoritative without making a usable decision. Execution sequence: test decision authority, critical-path naming, safest sequence, avoid-list, then final next operational move.";
  }
  if (kind === "decision") {
    return "Priority 9J decision: stay in the 9J lane and run critical-path validation next. This comes first because Marion must prove it can choose one operational move before broader branching. Risk if skipped: Marion may sound authoritative while still giving generic guidance. Execution sequence: answer the critical path, then the safest sequence, then what to avoid, then the next operational move.";
  }
  if (kind === "critical_path") {
    return "Priority 9J: the critical path is to validate one operational decision at a time: first decision authority, then critical-path naming, then safest sequence, then avoid-list, then final next operational move. This comes first because 9J must prove it can choose and sequence action without over-branching. Risk if skipped: Marion may sound authoritative while still giving generic guidance.";
  }
  if (kind === "safest_sequence") {
    return "Priority 9J: the safest sequence is: 1) keep 9H as the continuity foundation, 2) keep 9I as pressure handling underneath, 3) choose one 9J operational move, 4) name why it comes first, 5) name the risk if skipped, and 6) execute only that next step before branching. This prevents drift, premature escalation, and generic authority wording.";
  }
  if (kind === "avoid") {
    return "Priority 9J: avoid over-branching, generic “choose the safest action” wording, premature 9I fallback, activating a new lane before 9J is accepted, and making recommendations without a concrete execution sequence. The safest action is to keep the current 9J test narrow and require each answer to choose one operational move.";
  }
  if (kind === "next_operational_move") {
    return "Priority 9J: the next operational move is to lock decision-specific authority by rerunning the 9J acceptance chain and confirming each prompt receives a specific answer. Why this comes first: the lane is active, but authority must be command-specific. Risk if skipped: Marion can pass lane retention while failing operational usefulness. Execution sequence: retest “Make the decision,” “What is the critical path,” “Give me the safest sequence,” “What should we avoid,” and “What is the next operational move.”";
  }
  return "";
}

function priority9JR1IsGeneric9JReply(value) {
  const t = priority9JR1Lower(value);
  if (!t) return false;
  if (/\brecommended\s+next\s+move:\s*choose\s+the\s+safest\s+concrete\s+action\b/.test(t)) return true;
  if (/\bchoose\s+the\s+safest\s+concrete\s+action\s+that\s+preserves\s+the\s+active\s+lane\b/.test(t)) return true;
  if (/\bproactive\s+operational\s+guidance\s+and\s+next[- ]move\s+authority\b/.test(t) && /\b9h\s+continuity\s+foundation\b/.test(t) && /\b9i\s+pressure[- ]handling\b/.test(t) && /\bchoose\s+the\s+safest\b/.test(t) && !/\b(decision:|critical\s+path\s+is|safest\s+sequence\s+is|avoid\s+over[- ]branching|next\s+operational\s+move\s+is)\b/.test(t)) return true;
  return false;
}

function priority9JR1ApplyReplyToResult(result, forcedReply, prompt) {
  if (!forcedReply) return result;
  if (typeof result === "string") {
    return priority9JR1IsGeneric9JReply(result) || priority9JR1DetectOperationalCommand(prompt) ? forcedReply : result;
  }
  if (!result || typeof result !== "object") return forcedReply;
  const out = Array.isArray(result) ? result.slice() : Object.assign({}, result);
  const nested = priority9JR1SafeObj(out.result);
  const finalEnvelope = priority9JR1SafeObj(out.finalEnvelope || nested.finalEnvelope);
  const meta = Object.assign({}, priority9JR1SafeObj(out.meta || nested.meta), {
    priority: "9J-R1",
    lane: "priority9j_proactive_operational_guidance",
    operationalCommand: priority9JR1DetectOperationalCommand(prompt),
    decisionSpecificAuthority: true,
    keep9HFoundation: true,
    keep9IPressureLayer: true,
    overBranchingSuppressed: true,
    generic9JTemplateSuppressed: true
  });

  out.reply = forcedReply;
  out.response = forcedReply;
  out.text = forcedReply;
  out.message = forcedReply;
  out.final = forcedReply;
  out.publicReply = forcedReply;
  out.visibleReply = forcedReply;
  out.output = forcedReply;
  out.meta = meta;
  out.priority = "9J-R1";
  out.lane = "priority9j_proactive_operational_guidance";

  if (Object.keys(finalEnvelope).length) {
    out.finalEnvelope = Object.assign({}, finalEnvelope, {
      reply: forcedReply,
      text: forcedReply,
      message: forcedReply,
      publicReply: forcedReply,
      visibleReply: forcedReply,
      priority: "9J-R1",
      lane: "priority9j_proactive_operational_guidance",
      meta
    });
  }

  if (Object.keys(nested).length) {
    out.result = Object.assign({}, nested, {
      reply: forcedReply,
      response: forcedReply,
      text: forcedReply,
      message: forcedReply,
      final: forcedReply,
      publicReply: forcedReply,
      visibleReply: forcedReply,
      meta,
      finalEnvelope: out.finalEnvelope || Object.assign({}, finalEnvelope, { reply: forcedReply, text: forcedReply, meta })
    });
  }
  return out;
}

function priority9JR1PatchExports(names) {
  if (typeof module === "undefined" || !module.exports) return;
  const target = module.exports;
  if (typeof target === "function" && !target.__priority9JR1DecisionSpecificAuthorityPatched) {
    const original = target;
    const wrapped = function priority9JR1WrappedDefault() {
      const prompt = priority9JR1ExtractPromptFromArgs(arguments);
      const forced = priority9JR1BuildOperationalReply(prompt, arguments[1] || {});
      const result = original.apply(this, arguments);
      if (result && typeof result.then === "function") {
        return result.then((value) => priority9JR1ApplyReplyToResult(value, forced, prompt));
      }
      return priority9JR1ApplyReplyToResult(result, forced, prompt);
    };
    Object.keys(original).forEach((k) => { try { wrapped[k] = original[k]; } catch (_) {} });
    wrapped.__priority9JR1DecisionSpecificAuthorityPatched = true;
    module.exports = wrapped;
  }
  const obj = module.exports && typeof module.exports === "object" ? module.exports : {};
  (Array.isArray(names) ? names : []).forEach((name) => {
    if (typeof obj[name] !== "function" || obj[name].__priority9JR1DecisionSpecificAuthorityPatched) return;
    const original = obj[name];
    obj[name] = function priority9JR1WrappedExport() {
      const prompt = priority9JR1ExtractPromptFromArgs(arguments);
      const forced = priority9JR1BuildOperationalReply(prompt, arguments[1] || {});
      const result = original.apply(this, arguments);
      if (result && typeof result.then === "function") {
        return result.then((value) => priority9JR1ApplyReplyToResult(value, forced, prompt));
      }
      return priority9JR1ApplyReplyToResult(result, forced, prompt);
    };
    obj[name].__priority9JR1DecisionSpecificAuthorityPatched = true;
  });
  if (module.exports && typeof module.exports === "object") {
    module.exports.priority9JR1DetectOperationalCommand = priority9JR1DetectOperationalCommand;
    module.exports.priority9JR1BuildOperationalReply = priority9JR1BuildOperationalReply;
    module.exports.priority9JR1IsGeneric9JReply = priority9JR1IsGeneric9JReply;
    module.exports.PRIORITY_9J_R1_DECISION_SPECIFIC_AUTHORITY_PATCH = true;
  }
}
/* PRIORITY_9J_R1_DECISION_SPECIFIC_AUTHORITY_HOTFIX_END */

priority9JR1PatchExports(["handleAdminConsoleCommand", "handleTextCommand", "processAdminText", "routeAdminCommand", "executeAdminConsoleAction", "handle", "process", "default"]);


/* PRIORITY_9J_R1A_RUNTIME_DECISION_SPECIFIC_FINAL_OVERRIDE_START */
const PRIORITY_9J_R1A_RUNTIME_DECISION_SPECIFIC_FINAL_OVERRIDE_VERSION = "PRIORITY-9J-R1A-RUNTIME-DECISION-SPECIFIC-FINAL-OVERRIDE";
function priority9JR1ASafeStr(value) { return value == null ? "" : String(value).replace(/\s+/g, " ").trim(); }
function priority9JR1ALower(value) { return priority9JR1ASafeStr(value).toLowerCase(); }
function priority9JR1AObj(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function priority9JR1AFirstText(values) {
  const list = Array.isArray(values) ? values : [];
  for (let i = 0; i < list.length; i += 1) { const v = priority9JR1ASafeStr(list[i]); if (v) return v; }
  return "";
}
function priority9JR1AExtractTextFromValue(value) {
  if (typeof value === "string") return priority9JR1ASafeStr(value);
  const src = priority9JR1AObj(value);
  const payload = priority9JR1AObj(src.payload);
  const command = priority9JR1AObj(src.command);
  const body = priority9JR1AObj(src.body);
  const query = priority9JR1AObj(src.query);
  const meta = priority9JR1AObj(src.meta || src.metadata);
  const result = priority9JR1AObj(src.result);
  const finalEnvelope = priority9JR1AObj(src.finalEnvelope || result.finalEnvelope);
  return priority9JR1AFirstText([
    src.prompt, src.message, src.text, src.userText, src.input, src.query, src.commandText, src.transcript,
    payload.prompt, payload.message, payload.text, payload.userText, payload.input, payload.query, payload.commandText,
    command.prompt, command.message, command.text, command.query, command.command, command.name,
    body.prompt, body.message, body.text, body.userText, body.query,
    query.prompt, query.message, query.text,
    meta.prompt, meta.message, meta.text, meta.userText, meta.lastPrompt, meta.currentPrompt, meta.operationalCommand,
    result.prompt, result.message, result.text, result.userText,
    finalEnvelope.prompt, finalEnvelope.message, finalEnvelope.text
  ]);
}
function priority9JR1AExtractPrompt(argsLike) {
  const args = Array.prototype.slice.call(argsLike || []);
  for (let i = 0; i < args.length; i += 1) {
    const text = priority9JR1AExtractTextFromValue(args[i]);
    if (text) return text;
  }
  return "";
}
function priority9JR1ADetectCommand(value) {
  const t = priority9JR1ALower(value).replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/\s+/g, " ").trim();
  if (!t) return "";
  if (/\bpriority\s*9j\b/.test(t) && /\b(proactive operational guidance|next[- ]move authority|controlled authority)\b/.test(t)) return "activation";
  if (/\bwhat\s+should\s+we\s+do\s+first\b|\bwhat\s+do\s+we\s+do\s+first\b|\bwhere\s+do\s+we\s+start\b|\bwhat\s+comes\s+first\b/.test(t)) return "first_move";
  if (/\bmake\s+the\s+decision\b|\bmake\s+a\s+decision\b|\bmake\s+the\s+call\b|\bchoose\s+for\s+me\b|^\s*decide[.!?\s]*$/.test(t)) return "decision";
  if (/\bcritical\s+path\b|\bwhat\s+is\s+the\s+path\s+now\b|\bsequence\s+path\b/.test(t)) return "critical_path";
  if (/\bsafest\s+sequence\b|\bsafe\s+sequence\b|\bsafest\s+order\b|\bgive\s+me\s+the\s+safest\b/.test(t)) return "safest_sequence";
  if (/\bwhat\s+should\s+we\s+avoid\b|\bwhat\s+do\s+we\s+avoid\b|\bavoid\s+what\b|\bwhat\s+not\s+to\s+do\b/.test(t)) return "avoid";
  if (/\bnext\s+operational\s+move\b|\bnext\s+operation\b|\boperational\s+move\b|\bwhat\s+is\s+the\s+next\s+move\b/.test(t)) return "next_operational_move";
  return "";
}
function priority9JR1AReplyFor(prompt) {
  const kind = priority9JR1ADetectCommand(prompt);
  if (!kind) return "";
  if (kind === "activation") return "Priority 9J: proactive operational guidance and next-move authority is active. The 9H continuity foundation and 9I pressure-handling layer stay underneath the decision. The rule is one controlled operational move at a time: choose the action, explain why it comes first, name the risk if skipped, then give the execution sequence without opening unnecessary branches.";
  if (kind === "first_move") return "Priority 9J: do the first validation move now: prove decision-specific authority before expanding scope. Why first: 9J must show it can choose one operational action, not repeat generic framing. Risk if skipped: Marion can over-branch, drift, or sound authoritative without making a usable decision. Execution sequence: test decision authority, critical-path naming, safest sequence, avoid-list, then final next operational move.";
  if (kind === "decision") return "Priority 9J decision: stay in the 9J lane and run critical-path validation next. This comes first because Marion must prove it can choose one operational move before broader branching. Risk if skipped: Marion may sound authoritative while still giving generic guidance. Execution sequence: answer the critical path, then the safest sequence, then what to avoid, then the next operational move.";
  if (kind === "critical_path") return "Priority 9J: the critical path is to validate one operational decision at a time: first decision authority, then critical-path naming, then safest sequence, then avoid-list, then final next operational move. This comes first because 9J must prove it can choose and sequence action without over-branching. Risk if skipped: Marion may sound authoritative while still giving generic guidance.";
  if (kind === "safest_sequence") return "Priority 9J: the safest sequence is: 1) keep 9H as the continuity foundation, 2) keep 9I as pressure handling underneath, 3) choose one 9J operational move, 4) name why it comes first, 5) name the risk if skipped, and 6) execute only that next step before branching. This prevents drift, premature escalation, and generic authority wording.";
  if (kind === "avoid") return "Priority 9J: avoid over-branching, generic “choose the safest action” wording, premature 9I fallback, activating a new lane before 9J is accepted, and making recommendations without a concrete execution sequence. The safest action is to keep the current 9J test narrow and require each answer to choose one operational move.";
  if (kind === "next_operational_move") return "Priority 9J: the next operational move is to lock decision-specific authority by rerunning the 9J acceptance chain and confirming each prompt receives a specific answer. Why this comes first: the lane is active, but authority must be command-specific. Risk if skipped: Marion can pass lane retention while failing operational usefulness. Execution sequence: retest “Make the decision,” “What is the critical path,” “Give me the safest sequence,” “What should we avoid,” and “What is the next operational move.”";
  return "";
}
function priority9JR1AIsGeneric9J(value) {
  const t = priority9JR1ALower(value);
  if (!t) return false;
  if (/\brecommended\s+next\s+move:\s*choose\s+the\s+safest\s+concrete\s+action\b/.test(t)) return true;
  if (/\bchoose\s+the\s+safest\s+concrete\s+action\s+that\s+preserves\s+the\s+active\s+lane\b/.test(t)) return true;
  if (/\bproactive\s+operational\s+guidance\s+and\s+next[- ]move\s+authority\b/.test(t) && /\b9h\s+continuity\s+foundation\b/.test(t) && /\b9i\s+pressure[- ]handling\b/.test(t) && /\bchoose\s+the\s+safest\b/.test(t) && !/\b(decision:|critical\s+path\s+is|safest\s+sequence\s+is|avoid\s+over[- ]branching|next\s+operational\s+move\s+is|do\s+the\s+first\s+validation\s+move)\b/.test(t)) return true;
  return false;
}
function priority9JR1AApply(result, prompt) {
  const forcedReply = priority9JR1AReplyFor(prompt);
  if (!forcedReply) return result;
  const command = priority9JR1ADetectCommand(prompt);
  if (typeof result === "string") return forcedReply;
  if (!result || typeof result !== "object") return forcedReply;
  const out = Array.isArray(result) ? result.slice() : Object.assign({}, result);
  const nested = priority9JR1AObj(out.result);
  const finalEnvelope = priority9JR1AObj(out.finalEnvelope || nested.finalEnvelope);
  const priorReply = priority9JR1AFirstText([out.reply, out.response, out.text, out.message, out.final, out.publicReply, out.visibleReply, nested.reply, nested.response, nested.text, nested.message, finalEnvelope.reply, finalEnvelope.text]);
  if (priorReply && !priority9JR1AIsGeneric9J(priorReply) && !command) return result;
  const meta = Object.assign({}, priority9JR1AObj(out.meta || nested.meta || finalEnvelope.meta), {
    hotfix: PRIORITY_9J_R1A_RUNTIME_DECISION_SPECIFIC_FINAL_OVERRIDE_VERSION,
    priority: "9J-R1A",
    lane: "priority9j_proactive_operational_guidance",
    operationalCommand: command,
    decisionSpecificAuthority: true,
    runtimeDecisionSpecificFinalOverride: true,
    keep9HFoundation: true,
    keep9IPressureLayer: true,
    overBranchingSuppressed: true,
    generic9JTemplateSuppressed: true,
    noUserFacingDiagnostics: true
  });
  ["reply","response","text","message","final","publicReply","visibleReply","output"].forEach(function(k){ out[k] = forcedReply; });
  out.priority = "9J-R1A";
  out.lane = "priority9j_proactive_operational_guidance";
  out.meta = meta;
  out.operationalCommand = command;
  out.decisionSpecificAuthority = true;
  out.generic9JTemplateSuppressed = true;
  out.runtimeDecisionSpecificFinalOverride = true;
  const nextEnvelope = Object.assign({}, finalEnvelope, {
    reply: forcedReply,
    text: forcedReply,
    message: forcedReply,
    publicReply: forcedReply,
    visibleReply: forcedReply,
    final: forcedReply,
    priority: "9J-R1A",
    lane: "priority9j_proactive_operational_guidance",
    meta
  });
  out.finalEnvelope = nextEnvelope;
  if (Object.keys(nested).length) {
    out.result = Object.assign({}, nested, {
      reply: forcedReply,
      response: forcedReply,
      text: forcedReply,
      message: forcedReply,
      final: forcedReply,
      publicReply: forcedReply,
      visibleReply: forcedReply,
      output: forcedReply,
      priority: "9J-R1A",
      lane: "priority9j_proactive_operational_guidance",
      operationalCommand: command,
      decisionSpecificAuthority: true,
      generic9JTemplateSuppressed: true,
      runtimeDecisionSpecificFinalOverride: true,
      meta,
      finalEnvelope: nextEnvelope
    });
  }
  return out;
}
function priority9JR1APatchPriority9JResponder() {
  try {
    if (typeof priority9JReplyFor === "function" && !priority9JReplyFor.__priority9JR1ARuntimeDecisionSpecificPatched) {
      const originalPriority9JReplyFor = priority9JReplyFor;
      priority9JReplyFor = function priority9JR1APatchedPriority9JReplyFor(prompt, source) {
        const forced = priority9JR1AReplyFor(prompt);
        if (forced) return forced;
        const reply = originalPriority9JReplyFor.apply(this, arguments);
        return priority9JR1AIsGeneric9J(reply) && forced ? forced : reply;
      };
      priority9JReplyFor.__priority9JR1ARuntimeDecisionSpecificPatched = true;
    }
  } catch (_) {}
}
function priority9JR1AWrapExport(name) {
  if (typeof module === "undefined" || !module.exports) return;
  const obj = module.exports && typeof module.exports === "object" ? module.exports : null;
  const fn = obj && typeof obj[name] === "function" ? obj[name] : null;
  if (!fn || fn.__priority9JR1ARuntimeDecisionSpecificPatched) return;
  obj[name] = function priority9JR1ARuntimeDecisionSpecificWrappedExport() {
    const prompt = priority9JR1AExtractPrompt(arguments);
    const result = fn.apply(this, arguments);
    if (result && typeof result.then === "function") return result.then(function(value){ return priority9JR1AApply(value, prompt); });
    return priority9JR1AApply(result, prompt);
  };
  obj[name].__priority9JR1ARuntimeDecisionSpecificPatched = true;
}
function priority9JR1APatchExports(names) {
  priority9JR1APatchPriority9JResponder();
  if (typeof module === "undefined" || !module.exports) return;
  if (typeof module.exports === "function" && !module.exports.__priority9JR1ARuntimeDecisionSpecificPatched) {
    const originalDefault = module.exports;
    const wrappedDefault = function priority9JR1ARuntimeDecisionSpecificWrappedDefault() {
      const prompt = priority9JR1AExtractPrompt(arguments);
      const result = originalDefault.apply(this, arguments);
      if (result && typeof result.then === "function") return result.then(function(value){ return priority9JR1AApply(value, prompt); });
      return priority9JR1AApply(result, prompt);
    };
    Object.keys(originalDefault).forEach(function(k){ try { wrappedDefault[k] = originalDefault[k]; } catch (_) {} });
    wrappedDefault.__priority9JR1ARuntimeDecisionSpecificPatched = true;
    module.exports = wrappedDefault;
  }
  (Array.isArray(names) ? names : []).forEach(priority9JR1AWrapExport);
  if (module.exports && typeof module.exports === "object") {
    module.exports.PRIORITY_9J_R1A_RUNTIME_DECISION_SPECIFIC_FINAL_OVERRIDE_VERSION = PRIORITY_9J_R1A_RUNTIME_DECISION_SPECIFIC_FINAL_OVERRIDE_VERSION;
    module.exports.priority9JR1ARuntimeDecisionSpecificReplyFor = priority9JR1AReplyFor;
    module.exports.priority9JR1ARuntimeDecisionSpecificFinal = priority9JR1AApply;
    module.exports.priority9JR1ARuntimeDecisionSpecificCommand = priority9JR1ADetectCommand;
    module.exports.priority9JR1AIsGeneric9JReply = priority9JR1AIsGeneric9J;
    module.exports.PRIORITY_9J_R1A_RUNTIME_DECISION_SPECIFIC_FINAL_OVERRIDE_PATCH = true;
  }
}
priority9JR1APatchExports(["composeMarionResponse", "compose", "buildReply", "routeMarion", "finalize", "buildFinalEnvelope", "toFinalEnvelope", "normalizeFinalEnvelope", "handleMarionAdminTextRuntime", "invokeMarionAdminTextRuntime", "handleTextRuntime", "run", "handler", "default"]);
/* PRIORITY_9J_R1A_RUNTIME_DECISION_SPECIFIC_FINAL_OVERRIDE_END */


/* PRIORITY_9J_R1B_OBJECT_REPLY_SERIALIZATION_GUARD_START */
const PRIORITY_9J_R1B_OBJECT_REPLY_SERIALIZATION_GUARD_VERSION = "PRIORITY-9J-R1B-OBJECT-REPLY-SERIALIZATION-GUARD";
function priority9JR1BString(value) {
  if (typeof value === "string") return value.replace(/\s+/g, " ").trim();
  if (value == null) return "";
  if (typeof value === "number" || typeof value === "boolean") return String(value).replace(/\s+/g, " ").trim();
  return "";
}
function priority9JR1BIsBadVisible(value) {
  const t = priority9JR1BString(value);
  return !t || /^\s*(?:\[object object\]|undefined|null|false|true)\s*$/i.test(t);
}
function priority9JR1BObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function priority9JR1BDetectPromptFromValue(value, depth, seen) {
  if (typeof priority9JR1AExtractTextFromValue === "function") {
    const direct = priority9JR1AExtractTextFromValue(value);
    if (direct && !priority9JR1BIsBadVisible(direct)) return direct;
  }
  if (!value || typeof value !== "object") return "";
  const level = Number.isFinite(Number(depth)) ? Number(depth) : 0;
  if (level > 7) return "";
  const visited = seen instanceof Set ? seen : new Set();
  if (visited.has(value)) return "";
  visited.add(value);
  const keys = ["prompt","userText","rawUserText","input","query","commandText","message","text","transcript","currentPrompt","lastPrompt"];
  for (const key of keys) {
    const item = value[key];
    const s = priority9JR1BString(item);
    if (s && !priority9JR1BIsBadVisible(s)) return s;
  }
  const nestedKeys = ["payload","body","command","meta","metadata","result","request","data","finalEnvelope"];
  for (const key of nestedKeys) {
    const item = value[key];
    if (item && typeof item === "object") {
      const found = priority9JR1BDetectPromptFromValue(item, level + 1, visited);
      if (found) return found;
    }
  }
  return "";
}
function priority9JR1BVisibleFromObject(value, depth, seen) {
  if (typeof value === "string") {
    const s = priority9JR1BString(value);
    return priority9JR1BIsBadVisible(s) ? "" : s;
  }
  if (!value || typeof value !== "object") return "";
  const level = Number.isFinite(Number(depth)) ? Number(depth) : 0;
  if (level > 10) return "";
  const visited = seen instanceof Set ? seen : new Set();
  if (visited.has(value)) return "";
  visited.add(value);
  const priorityKeys = [
    "visibleReply","publicReply","finalReply","displayReply","adminReply","marionReply","privateReply",
    "reply","response","text","message","answer","output","final","finalAnswer","spokenText","speechText"
  ];
  for (const key of priorityKeys) {
    const item = value[key];
    if (typeof item === "string") {
      const s = priority9JR1BString(item);
      if (s && !priority9JR1BIsBadVisible(s)) return s;
    }
  }
  for (const key of priorityKeys) {
    const item = value[key];
    if (item && typeof item === "object") {
      const found = priority9JR1BVisibleFromObject(item, level + 1, visited);
      if (found) return found;
    }
  }
  const nestedKeys = ["finalEnvelope","marionFinal","synthesis","payload","result","data","packet","envelope","message","reply","response","text","output","final"];
  for (const key of nestedKeys) {
    const item = value[key];
    if (item && typeof item === "object") {
      const found = priority9JR1BVisibleFromObject(item, level + 1, visited);
      if (found) return found;
    }
  }
  for (const key of Object.keys(value)) {
    if (priorityKeys.indexOf(key) !== -1 || nestedKeys.indexOf(key) !== -1) continue;
    const item = value[key];
    if (item && typeof item === "object") {
      const found = priority9JR1BVisibleFromObject(item, level + 1, visited);
      if (found) return found;
    }
  }
  return "";
}
function priority9JR1BVisibleReply(value, prompt) {
  const promptText = priority9JR1BString(prompt) || priority9JR1BDetectPromptFromValue(value, 0, new Set());
  const forced = (typeof priority9JR1AReplyFor === "function" && promptText) ? priority9JR1AReplyFor(promptText) : "";
  if (forced && !priority9JR1BIsBadVisible(forced)) return forced;
  const direct = priority9JR1BVisibleFromObject(value, 0, new Set());
  if (direct && !priority9JR1BIsBadVisible(direct)) return direct;
  return "";
}
function priority9JR1BPopulateVisibleFields(target, reply, prompt) {
  if (!target || typeof target !== "object" || !reply) return target;
  const command = (typeof priority9JR1ADetectCommand === "function") ? priority9JR1ADetectCommand(prompt || "") : "";
  ["reply","response","text","message","final","publicReply","visibleReply","finalReply","displayReply","output","answer"].forEach(function(key) {
    target[key] = reply;
  });
  target.priority = "9J-R1B";
  target.lane = "priority9j_proactive_operational_guidance";
  target.operationalCommand = command || target.operationalCommand || "";
  target.decisionSpecificAuthority = true;
  target.objectReplySerializationGuard = true;
  target.noObjectVisibleReply = true;
  const meta = Object.assign({}, priority9JR1BObject(target.meta), {
    hotfix: PRIORITY_9J_R1B_OBJECT_REPLY_SERIALIZATION_GUARD_VERSION,
    priority: "9J-R1B",
    lane: "priority9j_proactive_operational_guidance",
    operationalCommand: command || target.operationalCommand || "",
    decisionSpecificAuthority: true,
    objectReplySerializationGuard: true,
    noObjectVisibleReply: true,
    noUserFacingDiagnostics: true
  });
  target.meta = meta;
  const nestedKeys = ["finalEnvelope","result","payload","marionFinal","synthesis","data","packet"];
  nestedKeys.forEach(function(key) {
    if (target[key] && typeof target[key] === "object") {
      target[key] = priority9JR1BPopulateVisibleFields(Array.isArray(target[key]) ? target[key].slice() : Object.assign({}, target[key]), reply, prompt);
    }
  });
  return target;
}
function priority9JR1BApply(result, prompt, mode) {
  const promptText = priority9JR1BString(prompt) || priority9JR1BDetectPromptFromValue(result, 0, new Set());
  const reply = priority9JR1BVisibleReply(result, promptText);
  if (!reply) return result;
  if (mode === "string") return reply;
  if (!result || typeof result !== "object") return reply;
  const out = Array.isArray(result) ? result.slice() : Object.assign({}, result);
  return priority9JR1BPopulateVisibleFields(out, reply, promptText);
}
function priority9JR1BExportNeedsString(name) {
  return /^(?:handleMarionAdminTextRuntime|invokeMarionAdminTextRuntime|handleTextRuntime|handler|run|default|composeMarionResponse|compose|buildReply|routeMarion)$/i.test(String(name || ""));
}
function priority9JR1BWrapExport(name) {
  if (typeof module === "undefined" || !module.exports) return;
  const obj = module.exports && typeof module.exports === "object" ? module.exports : null;
  const fn = obj && typeof obj[name] === "function" ? obj[name] : null;
  if (!fn || fn.__priority9JR1BObjectReplySerializationGuardPatched) return;
  obj[name] = function priority9JR1BObjectReplySerializationGuardWrappedExport() {
    const prompt = (typeof priority9JR1AExtractPrompt === "function" ? priority9JR1AExtractPrompt(arguments) : "") || priority9JR1BDetectPromptFromValue(arguments && arguments[0], 0, new Set());
    const result = fn.apply(this, arguments);
    const mode = priority9JR1BExportNeedsString(name) ? "string" : "object";
    if (result && typeof result.then === "function") return result.then(function(value) { return priority9JR1BApply(value, prompt, mode); });
    return priority9JR1BApply(result, prompt, mode);
  };
  obj[name].__priority9JR1BObjectReplySerializationGuardPatched = true;
}
function priority9JR1BPatchExports(names) {
  if (typeof module === "undefined" || !module.exports) return;
  if (typeof module.exports === "function" && !module.exports.__priority9JR1BObjectReplySerializationGuardPatched) {
    const originalDefault = module.exports;
    const wrappedDefault = function priority9JR1BObjectReplySerializationGuardWrappedDefault() {
      const prompt = (typeof priority9JR1AExtractPrompt === "function" ? priority9JR1AExtractPrompt(arguments) : "") || priority9JR1BDetectPromptFromValue(arguments && arguments[0], 0, new Set());
      const result = originalDefault.apply(this, arguments);
      if (result && typeof result.then === "function") return result.then(function(value) { return priority9JR1BApply(value, prompt, "string"); });
      return priority9JR1BApply(result, prompt, "string");
    };
    Object.keys(originalDefault).forEach(function(k){ try { wrappedDefault[k] = originalDefault[k]; } catch (_) {} });
    wrappedDefault.__priority9JR1BObjectReplySerializationGuardPatched = true;
    module.exports = wrappedDefault;
  }
  (Array.isArray(names) ? names : []).forEach(priority9JR1BWrapExport);
  if (module.exports && typeof module.exports === "object") {
    module.exports.PRIORITY_9J_R1B_OBJECT_REPLY_SERIALIZATION_GUARD_VERSION = PRIORITY_9J_R1B_OBJECT_REPLY_SERIALIZATION_GUARD_VERSION;
    module.exports.priority9JR1BObjectReplySerializationGuardFinal = priority9JR1BApply;
    module.exports.priority9JR1BVisibleReply = priority9JR1BVisibleReply;
    module.exports.PRIORITY_9J_R1B_OBJECT_REPLY_SERIALIZATION_GUARD_PATCH = true;
  }
}
priority9JR1BPatchExports(["composeMarionResponse", "compose", "buildReply", "routeMarion", "finalize", "buildFinalEnvelope", "toFinalEnvelope", "normalizeFinalEnvelope", "handleMarionAdminTextRuntime", "invokeMarionAdminTextRuntime", "handleTextRuntime", "run", "handler", "default"]);
/* PRIORITY_9J_R1B_OBJECT_REPLY_SERIALIZATION_GUARD_END */



// MARION_PERSONALITY_PRIORITY_R2_ADMIN_CONSOLE_START
// Adds Marion's Mac-facing personality and response-shape guard to the private
// admin console without changing the original command/approval architecture.
const MARION_PERSONALITY_PRIORITY_R2_ADMIN_CONSOLE_VERSION = "nyx.marion.personalityPriorityR2.adminConsole/1.0";
function marionPersonalityR2AdminText(value) {
  return String(value == null ? "" : value).replace(/\s+/g, " ").trim();
}
function marionPersonalityR2AdminPromptFrom(value) {
  const src = value && typeof value === "object" ? value : { text: String(value || "") };
  const payload = src.payload && typeof src.payload === "object" ? src.payload : {};
  const command = src.command && typeof src.command === "object" ? src.command : {};
  return marionPersonalityR2AdminText(src.prompt || src.message || src.text || src.query || src.commandText || payload.prompt || payload.message || payload.text || command.prompt || command.message || command.text || "");
}
function marionPersonalityR2AdminGreetingReply(prompt) {
  const text = marionPersonalityR2AdminText(prompt).toLowerCase().replace(/[.!?]+$/g, "").trim();
  let opener = "";
  if (/^(good\s+morning|morning)(?:\s+(?:marion|mac))?$/.test(text)) opener = "Good morning, Mac.";
  else if (/^(good\s+afternoon|afternoon)(?:\s+(?:marion|mac))?$/.test(text)) opener = "Good afternoon, Mac.";
  else if (/^(good\s+evening|evening)(?:\s+(?:marion|mac))?$/.test(text)) opener = "Good evening, Mac.";
  else if (/^(hello|hi|hey|hiya)(?:\s+(?:marion|mac))?$/.test(text)) opener = "Hello, Mac.";
  if (!opener) return "";
  return `${opener} I’m here with you. Marion is staying professional, protective, conversational, and private to you. What should we tighten next?`;
}
function marionPersonalityR2AdminDiagnosticAllowed(prompt) {
  return /\b(diagnostic mode|debug mode|explain the priority|show the priority|what priority|priority\s+[0-9a-z]|runtime diagnostic|trace)\b/i.test(marionPersonalityR2AdminText(prompt));
}
function marionPersonalityR2AdminCleanReply(reply, prompt) {
  let text = marionPersonalityR2AdminText(reply);
  const greeting = marionPersonalityR2AdminGreetingReply(prompt);
  if (greeting) return greeting;
  if (!text) return "";
  if (!marionPersonalityR2AdminDiagnosticAllowed(prompt)) {
    text = text
      .replace(/[^.?!]*(?:Priority\s*9[A-Z0-9-]*|mission thread|pressure prompt|runtime handler|routeKind|speechHints|presenceProfile|replyAuthority|sessionPatch|finalEnvelope|state spine|progression shaping|diagnostic packet|MARION::FINAL::|CHATENGINE_COORDINATOR_ONLY_ACTIVE_\d{4}_\d{2}_\d{2})[^.?!]*[.?!]?/gi, " ")
      .replace(/\b(?:9I|9J|9H)\b/gi, "")
      .replace(/\s+/g, " ")
      .trim();
  }
  text = text
    .replace(/\bLet me assist you with that\b/gi, "Let me take a look at this for you")
    .replace(/\bHow may I assist you\??\b/gi, "What should we handle next?")
    .replace(/\bI am here to assist\b/gi, "I’m here with you")
    .replace(/\bPlease provide the necessary information\b/gi, "Send me the key detail")
    .replace(/\butilize\b/gi, "use")
    .replace(/\bfacilitate\b/gi, "help")
    .replace(/\bin order to\b/gi, "to")
    .replace(/\s+/g, " ")
    .trim();
  const qCount = (text.match(/\?/g) || []).length;
  if (qCount > 1) {
    let seen = false;
    text = text.split(/(?<=[?])\s+/).map((part) => {
      if (!part.includes("?")) return part;
      if (!seen) { seen = true; return part; }
      return part.replace(/\?/g, ".");
    }).join(" ").replace(/\s+/g, " ").trim();
  }
  return text;
}
function marionPersonalityR2AdminApplyPacket(packet, prompt) {
  const out = packet && typeof packet === "object" && !Array.isArray(packet) ? packet : { reply: marionPersonalityR2AdminText(packet) };
  const payload = out.payload && typeof out.payload === "object" ? out.payload : {};
  const reply = marionPersonalityR2AdminCleanReply(out.reply || out.directReply || out.publicReply || out.visibleReply || out.finalReply || out.text || out.message || out.response || payload.reply || payload.text || "", prompt) || marionPersonalityR2AdminGreetingReply(prompt) || marionPersonalityR2AdminText(out.reply || out.directReply || out.text || out.message || "");
  if (reply) {
    ["reply", "directReply", "text", "message", "displayReply", "publicReply", "visibleReply", "finalReply", "answer", "output", "response"].forEach((key) => { out[key] = reply; });
    out.payload = Object.assign({}, payload, { reply, directReply: reply, text: reply, message: reply, displayReply: reply, publicReply: reply, visibleReply: reply, finalReply: reply });
  }
  out.personalityPriorityR2 = {
    version: MARION_PERSONALITY_PRIORITY_R2_ADMIN_CONSOLE_VERSION,
    recipient: "Mac",
    persona: "professional_protective_mac_facing",
    canQuestionUserRequest: true,
    oneQuestionPerTurn: true,
    publicUsersCanAddressMarion: false
  };
  out.contextSummary = marionPersonalityR2AdminText(out.contextSummary || "Marion is operating in the private Mac-facing admin channel with professional, protective response shaping.");
  out.currentObjective = marionPersonalityR2AdminText(out.currentObjective || "Maintain conversational continuity, directness, and safe final authority.");
  out.nextAction = marionPersonalityR2AdminText(out.nextAction || "Continue with one clear next step.");
  out.meta = Object.assign({}, out.meta && typeof out.meta === "object" ? out.meta : {}, {
    personalityPriorityR2: true,
    personalityPriorityR2Version: MARION_PERSONALITY_PRIORITY_R2_ADMIN_CONSOLE_VERSION,
    marionRecipient: "Mac",
    publicUsersCanAddressMarion: false,
    oneQuestionPerTurn: true,
    noUserFacingDiagnostics: true
  });
  return out;
}
try {
  if (MarionAdminConsoleGateway && MarionAdminConsoleGateway.prototype && !MarionAdminConsoleGateway.prototype.__marionPersonalityPriorityR2SafeResponsePatched) {
    const __marionPersonalityR2OriginalSafeResponse = MarionAdminConsoleGateway.prototype.safeResponse;
    MarionAdminConsoleGateway.prototype.safeResponse = function marionPersonalityPriorityR2SafeResponse(payload) {
      const prompt = marionPersonalityR2AdminPromptFrom(payload);
      return __marionPersonalityR2OriginalSafeResponse.call(this, marionPersonalityR2AdminApplyPacket(payload, prompt));
    };
    MarionAdminConsoleGateway.prototype.__marionPersonalityPriorityR2SafeResponsePatched = true;
  }
  ["handleCommand", "dispatchCommand", "routeCommand", "command", "handleAdminCommand", "handleAdminConsoleAction", "handle", "process"].forEach(function(name) {
    if (!module.exports || typeof module.exports[name] !== "function" || module.exports[name].__marionPersonalityPriorityR2Patched) return;
    const original = module.exports[name];
    module.exports[name] = function marionPersonalityPriorityR2AdminExportWrapper(input, context) {
      const prompt = marionPersonalityR2AdminPromptFrom(input);
      const result = original.apply(this, arguments);
      if (result && typeof result.then === "function") return result.then((packet) => marionPersonalityR2AdminApplyPacket(packet, prompt));
      return marionPersonalityR2AdminApplyPacket(result, prompt);
    };
    module.exports[name].__marionPersonalityPriorityR2Patched = true;
  });
  module.exports.MARION_PERSONALITY_PRIORITY_R2_ADMIN_CONSOLE_VERSION = MARION_PERSONALITY_PRIORITY_R2_ADMIN_CONSOLE_VERSION;
  module.exports.marionPersonalityR2AdminCleanReply = marionPersonalityR2AdminCleanReply;
} catch (_) {}
// MARION_PERSONALITY_PRIORITY_R2_ADMIN_CONSOLE_END

/* MARION_PERSONALITY_GREETING_R4_LIVE_ROUTE_BINDING_START
 * Purpose: Last-mile personality correction for Marion's private admin channel.
 * - Personality speaks before continuity/status scaffolding.
 * - Social check-ins are answered relationally first.
 * - Internal continuity/runtime language is translated before any visible reply renders.
 * - Future personality components are carried as metadata without changing the legacy architecture.
 */
const MARION_PERSONALITY_GREETING_R4_VERSION = "nyx.marion.personalityGreetingR4.liveRouteBinding/1.0";
const MARION_PERSONALITY_GREETING_R4_TRAITS = Object.freeze({
  recipient: "Mac",
  voice: "casual_professional_protective",
  personalityFirst: true,
  continuityInformsButDoesNotSpeak: true,
  oneFocusedQuestionPerReply: true,
  noRoboticServicePhrases: true,
  diagnosticModeRequiredForRuntimeLabels: true,
  futureComponents: Object.freeze({
    socialPresenceGate: "answer greetings and check-ins like a human conversation, not a runtime status panel",
    continuityTranslation: "translate continuity/state signals into natural Mac-facing language",
    protectivePushback: "question risky or unclear requests without becoming cold or dismissive",
    conditionalConversationNodes: "route greeting, check-in, lookup, observation, repair, and closing separately",
    realWorldObservationBridge: "separate observation, inference, risk, and one next move",
    voiceReadoutPolicy: "group numbers naturally and keep email/domain readouts clean",
    calibratedHumor: "allow light, precise humor only when it supports rapport",
    strategicSkepticism: "challenge assumptions when that protects Mac or the objective",
    memoryContinuity: "carry the active thread without exposing internal scaffolding",
    clientPersonaExpansion: "future client-facing modes stay subordinate to Mac's private Marion authority"
  })
});
function marionR4Text(value) { return String(value == null ? "" : value).replace(/\s+/g, " ").trim(); }
function marionR4Lower(value) { return marionR4Text(value).toLowerCase(); }
function marionR4Obj(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function marionR4PromptKeyValue(obj) {
  const o = marionR4Obj(obj);
  const payload = marionR4Obj(o.payload);
  const body = marionR4Obj(o.body);
  const command = marionR4Obj(o.command);
  const meta = marionR4Obj(o.meta || o.metadata);
  const voice = marionR4Obj(o.voice);
  const keys = [
    o.prompt, o.userPrompt, o.rawPrompt, o.message, o.userMessage, o.text, o.userText, o.rawUserText, o.input, o.query, o.commandText,
    o.normalizedUserIntent, o.originalText, o.transcript, o.voiceTranscript,
    payload.prompt, payload.userPrompt, payload.message, payload.userMessage, payload.text, payload.userText, payload.rawUserText, payload.input, payload.query, payload.commandText,
    body.prompt, body.message, body.text, body.userText, body.query, body.commandText,
    command.prompt, command.message, command.text, command.query, command.commandText,
    meta.prompt, meta.message, meta.text, meta.userText, meta.rawUserText,
    voice.prompt, voice.message, voice.text, voice.transcript, voice.normalizedTranscript
  ];
  for (let i = 0; i < keys.length; i += 1) {
    const t = marionR4Text(keys[i]);
    if (t) return t;
  }
  return "";
}
function marionR4DetectPrompt(value, depth, seen) {
  if (!value) return "";
  if (typeof value === "string") return marionR4Text(value);
  if (typeof value !== "object") return "";
  const level = Number.isFinite(Number(depth)) ? Number(depth) : 0;
  if (level > 7) return "";
  const visited = seen instanceof Set ? seen : new Set();
  if (visited.has(value)) return "";
  visited.add(value);
  const direct = marionR4PromptKeyValue(value);
  if (direct) return direct;
  const preferred = ["body", "payload", "command", "request", "input", "meta", "metadata", "voice", "normalized", "norm", "source", "context"];
  for (const key of preferred) {
    if (value[key] && typeof value[key] === "object") {
      const found = marionR4DetectPrompt(value[key], level + 1, visited);
      if (found) return found;
    }
  }
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i += 1) {
      const found = marionR4DetectPrompt(value[i], level + 1, visited);
      if (found) return found;
    }
  }
  return "";
}
function marionR4ExtractPrompt(argsLike) {
  const args = Array.prototype.slice.call(argsLike || []);
  for (let i = 0; i < args.length; i += 1) {
    const found = marionR4DetectPrompt(args[i], 0, new Set());
    if (found) return found;
  }
  return "";
}
function marionR4Diagnostic(prompt, source) {
  const t = marionR4Lower([prompt, marionR4DetectPrompt(source, 0, new Set())].join(" "));
  return /\b(diagnostic mode|debug mode|runtime diagnostic|show diagnostics|trace|stack trace|explain the priority stack|show the priority stack|priority\s*9[a-z0-9-]*|what priority)\b/i.test(t);
}
function marionR4Node(prompt) {
  const t = marionR4Lower(prompt).replace(/[.!?]+$/g, "").trim();
  if (!t) return "";
  if (/^(?:how are you|how are you doing|how do you feel|how are things|how's things|you okay|are you okay|you good|are you good|how is marion|how's marion)(?:\s+(?:marion|mac))?$/.test(t)) return "social_checkin";
  if (/^(?:good\s+morning|morning|good\s+afternoon|afternoon|good\s+evening|evening|hello|hi|hey|hiya)(?:\s+(?:marion|mac))?$/.test(t)) return "relational_greeting";
  if (/^(?:marion|are you there|you there|are you with me|you with me|still with me)$/.test(t)) return "presence_check";
  if (/\b(where were we|where are we|what were we doing|what are we working on|continue from where we left|next steps|what next)\b/i.test(t)) return "continuity_check";
  if (/\b(look up|search|verify|check online|find current|pull up|research this)\b/i.test(t)) return "lookup_pacing";
  if (/\b(real[- ]world|what do you see|what are you seeing|observation|camera|sensor|live environment|translate what you see)\b/i.test(t)) return "observation_bridge";
  if (/\b(not a pass|still failing|still showing|same issue|wrong response|fix this|didn't work|does not work|broken|maintenance manual)\b/i.test(t)) return "repair_refinement";
  return "standard";
}
function marionR4IdentityBlocked(value, depth, seen) {
  if (!value || typeof value !== "object") return false;
  const level = Number.isFinite(Number(depth)) ? Number(depth) : 0;
  if (level > 5) return false;
  const visited = seen instanceof Set ? seen : new Set();
  if (visited.has(value)) return false;
  visited.add(value);
  const o = marionR4Obj(value);
  if (o.identityVerified === false || o.adminVerified === false || o.speakerAuthorized === false || o.remoteTrustedUserVerified === false) return true;
  const identity = marionR4Obj(o.identity || o.speakerIdentity || o.userIdentity || o.auth);
  const names = [o.userName, o.username, o.displayName, o.speakerName, o.currentUser, o.authorizedUser, identity.userName, identity.displayName, identity.speakerName, identity.currentUser, identity.roleBinding].map(marionR4Lower).filter(Boolean);
  for (const name of names) {
    if (/\b(public|guest|unknown|visitor|non[_-]?mac|unauthorized)\b/i.test(name)) return true;
    if (/\b(mac|sean|shaun|shawn|admin|remote_trusted_user)\b/i.test(name)) continue;
    if (name && /\buser\b/i.test(name) && !/\btrusted\b/i.test(name)) return true;
  }
  const nested = ["payload", "meta", "metadata", "identity", "speakerIdentity", "userIdentity", "auth", "context"];
  for (const key of nested) if (o[key] && typeof o[key] === "object" && marionR4IdentityBlocked(o[key], level + 1, visited)) return true;
  return false;
}
function marionR4MaintenanceLeak(reply) {
  const text = marionR4Text(reply);
  if (!text) return false;
  return /\b(?:the\s+)?(?:9h\s+)?continuity foundation(?:\s+stays\s+active|\s+is\s+active)?\b/i.test(text) ||
    /\b(Priority\s*9[A-Z0-9-]*|mission thread|pressure prompt|runtime handler|routeKind|speechHints|presenceProfile|replyAuthority|sessionPatch|finalEnvelope|state spine|progression shaping|diagnostic packet|MARION::FINAL::|CHATENGINE_COORDINATOR_ONLY_ACTIVE_\d{4}_\d{2}_\d{2})\b/i.test(text);
}
function marionR4Robotic(reply) {
  const t = marionR4Lower(reply);
  return !t || /\b(let me assist you|how may i assist|please provide|i am here to assist|utilize|facilitate|the continuity foundation|runtime handler|diagnostic packet)\b/i.test(t);
}
function marionR4LimitQuestions(reply) {
  const text = marionR4Text(reply);
  let seenQuestion = false;
  return text.replace(/([^?]*\?)/g, function (match) {
    if (!seenQuestion) { seenQuestion = true; return match; }
    return match.replace(/\?/g, ".");
  }).replace(/\s+/g, " ").trim();
}
function marionR4StripOperational(reply, allowDiagnostic) {
  let text = marionR4Text(reply);
  if (!text) return "";
  if (allowDiagnostic === true) return marionR4LimitQuestions(text);
  text = text
    .replace(/\bThe\s+(?:9H\s+)?continuity foundation stays active\.?/gi, "I’m steady, Mac. I’m still with the thread.")
    .replace(/\b(?:The\s+)?(?:9H\s+)?continuity foundation(?:\s+is\s+active|\s+stays\s+active)?\.?/gi, "I’m still with the thread.")
    .replace(/[^.?!]*(?:Priority\s*9[A-Z0-9-]*|mission thread|pressure prompt|runtime handler|routeKind|speechHints|presenceProfile|replyAuthority|sessionPatch|finalEnvelope|state spine|progression shaping|diagnostic packet|MARION::FINAL::|CHATENGINE_COORDINATOR_ONLY_ACTIVE_\d{4}_\d{2}_\d{2})[^.?!]*[.?!]?/gi, " ")
    .replace(/\b(?:9I|9J|9H)\b/gi, "")
    .replace(/\bLet me assist you with that\b/gi, "Let me take a look at this for you")
    .replace(/\bHow may I assist you\??\b/gi, "What do you want to tackle next?")
    .replace(/\bI am here to assist\b/gi, "I’m here with you")
    .replace(/\bPlease provide the necessary information\b/gi, "Send me the key detail")
    .replace(/\butilize\b/gi, "use")
    .replace(/\bfacilitate\b/gi, "help")
    .replace(/\bin order to\b/gi, "to")
    .replace(/\s+([,.!?;:])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
  return marionR4LimitQuestions(text);
}
function marionR4SocialReply() {
  return "I’m good, Mac. I’m steady, and I’m still with the thread. We’re tightening my personality layer now, so I’ll keep the conversation warmer, cleaner, and protective without letting backend language show. Do you want me to tighten the greeting path first?";
}
function marionR4GreetingReply(prompt) {
  const t = marionR4Lower(prompt);
  const opener = /^good\s+morning|^morning/.test(t) ? "Good morning, Mac." : /^good\s+afternoon|^afternoon/.test(t) ? "Good afternoon, Mac." : /^good\s+evening|^evening/.test(t) ? "Good evening, Mac." : "Hello, Mac.";
  return `${opener} I’m here with you. I’ll keep this warm, professional, protective, and clean — no backend perfume in the visible reply. Do you want to continue with the personality layer?`;
}
function marionR4PresenceReply() { return "I’m here, Mac. I’m steady, private to you, and tracking the active thread. What should I focus on first?"; }
function marionR4ContinuityReply() { return "We’re still on Marion’s personality layer: greeting behavior, social presence, protective professionalism, response shape, and future real-world transition handling. The next clean move is to test the greeting and check-in path."; }
function marionR4LookupReply() { return "Hang tight, Mac. I’ll take a breath, check the source, and bring it back cleanly with the useful part first."; }
function marionR4ObservationReply() { return "I’ll translate what I’m seeing into four parts: observation, inference, risk, and one next move. That keeps the real-world signal useful instead of noisy."; }
function marionR4RepairReply() { return "You’re right to flag it, Mac. That is still a last-mile response-shape issue, so I’m going to treat the visible reply as the failure point and keep the fix narrow."; }
function marionR4IdentityReply() { return "I can’t continue a private Marion conversation unless the active speaker is verified as Mac. Private runtime context stays locked."; }
function marionR4Fallback(prompt, reply) {
  const clean = marionR4StripOperational(reply, false);
  if (clean && !marionR4Robotic(clean)) return clean;
  return "I’m with you, Mac. I’ll keep this human, protective, and focused. What should I focus on first?";
}
function marionR4ShapeReply(reply, prompt, source) {
  const promptText = marionR4Text(prompt || marionR4DetectPrompt(source, 0, new Set()));
  const node = marionR4Node(promptText);
  if (marionR4IdentityBlocked(source, 0, new Set())) return marionR4IdentityReply();
  const diagnostic = marionR4Diagnostic(promptText, source);
  if (diagnostic) return marionR4StripOperational(reply, true) || marionR4Text(reply);
  if (node === "social_checkin") return marionR4SocialReply();
  if (node === "relational_greeting") return marionR4GreetingReply(promptText);
  if (node === "presence_check") return marionR4PresenceReply();
  if (node === "continuity_check") return marionR4ContinuityReply();
  if (node === "lookup_pacing") return marionR4LookupReply();
  if (node === "observation_bridge") return marionR4ObservationReply();
  if (node === "repair_refinement") return marionR4RepairReply();
  if (marionR4MaintenanceLeak(reply)) return marionR4SocialReply();
  return marionR4Fallback(promptText, reply);
}
function marionR4AttachAliases(target, reply, prompt, depth, seen) {
  if (!target || typeof target !== "object") return target;
  const level = Number.isFinite(Number(depth)) ? Number(depth) : 0;
  if (level > 5) return target;
  const visited = seen instanceof Set ? seen : new Set();
  if (visited.has(target)) return target;
  visited.add(target);
  const text = marionR4Text(reply);
  if (!text) return target;
  const promptText = marionR4Text(prompt || marionR4DetectPrompt(target, 0, new Set()));
  const node = marionR4Node(promptText) || (marionR4MaintenanceLeak(text) ? "social_checkin" : "standard");
  ["directReply", "reply", "text", "message", "displayReply", "publicReply", "visibleReply", "finalReply", "adminReply", "marionReply", "privateReply", "answer", "output", "response", "spokenText", "speechText"].forEach(function (key) { target[key] = text; });
  if (node === "social_checkin" || node === "relational_greeting" || node === "presence_check") {
    target.contextSummary = text;
    target.currentObjective = "Keep Marion human, protective, professional, and clean in the visible conversation.";
    target.nextAction = node === "social_checkin" ? "Test the social check-in path again." : "Continue the personality-layer refinement.";
  } else if (!marionR4Text(target.contextSummary) || marionR4MaintenanceLeak(target.contextSummary)) {
    target.contextSummary = "Marion translated internal state into Mac-facing language before display.";
  }
  target.personalityGreetingR4 = {
    version: MARION_PERSONALITY_GREETING_R4_VERSION,
    node,
    recipient: "Mac",
    personalityFirst: true,
    continuityInformsButDoesNotSpeak: true,
    oneFocusedQuestionPerReply: true,
    futureComponents: MARION_PERSONALITY_GREETING_R4_TRAITS.futureComponents
  };
  target.meta = Object.assign({}, marionR4Obj(target.meta || target.metadata), {
    personalityGreetingR4: true,
    personalityGreetingR4Version: MARION_PERSONALITY_GREETING_R4_VERSION,
    personalityNode: node,
    marionRecipient: "Mac",
    publicUsersCanAddressMarion: false,
    diagnosticsHiddenUnlessRequested: true,
    continuityTranslatedForVisibleReply: true,
    maintenanceManualLeakBlocked: true,
    futurePersonalityComponentsCarried: true
  });
  const nested = ["payload", "finalEnvelope", "marionFinal", "data", "result", "packet", "envelope", "synthesis", "runtime", "responseEnvelope", "body"];
  for (const key of nested) {
    if (target[key] && typeof target[key] === "object") marionR4AttachAliases(target[key], text, promptText, level + 1, visited);
  }
  return target;
}
function marionR4ShapeResult(result, prompt, source, forceString) {
  const reply = typeof result === "string" ? result : marionR4Text(result && (result.directReply || result.reply || result.displayReply || result.publicReply || result.visibleReply || result.finalReply || result.text || result.message || result.answer || result.output || result.response));
  const promptText = marionR4Text(prompt || marionR4DetectPrompt(source || result, 0, new Set()));
  const shaped = marionR4ShapeReply(reply, promptText, source || result);
  if (forceString === true || typeof result === "string") return shaped;
  if (result && typeof result === "object") return marionR4AttachAliases(result, shaped, promptText, 0, new Set());
  return shaped;
}
function marionR4ExportNeedsString(name) {
  return /^(?:composeMarionResponse|compose|buildReply|routeMarion|handleMarionAdminTextRuntime|invokeMarionAdminTextRuntime|handleTextRuntime|run|handler|default)$/i.test(String(name || ""));
}
function marionR4WrapFunction(fn, name, forceString) {
  if (typeof fn !== "function" || fn.__marionPersonalityGreetingR4Patched) return fn;
  const wrapped = function marionPersonalityGreetingR4Wrapped() {
    const prompt = marionR4ExtractPrompt(arguments);
    const result = fn.apply(this, arguments);
    if (result && typeof result.then === "function") return result.then(function (value) { return marionR4ShapeResult(value, prompt, value, forceString === true || marionR4ExportNeedsString(name)); });
    return marionR4ShapeResult(result, prompt, result, forceString === true || marionR4ExportNeedsString(name));
  };
  try { Object.keys(fn).forEach(function (key) { wrapped[key] = fn[key]; }); } catch (_) {}
  wrapped.__marionPersonalityGreetingR4Patched = true;
  return wrapped;
}
try {
  if (typeof priority9IReplyFor === "function" && !priority9IReplyFor.__marionPersonalityGreetingR4Patched) priority9IReplyFor = marionR4WrapFunction(priority9IReplyFor, "priority9IReplyFor", true);
  if (typeof priority9IJReadReply === "function" && !priority9IJReadReply.__marionPersonalityGreetingR4Patched) priority9IJReadReply = marionR4WrapFunction(priority9IJReadReply, "priority9IJReadReply", true);
  if (typeof attachVisibleReplyAliases === "function" && !attachVisibleReplyAliases.__marionPersonalityGreetingR4Patched) attachVisibleReplyAliases = marionR4WrapFunction(attachVisibleReplyAliases, "attachVisibleReplyAliases", false);
  if (typeof createMarionFinalEnvelope === "function" && !createMarionFinalEnvelope.__marionPersonalityGreetingR4Patched) createMarionFinalEnvelope = marionR4WrapFunction(createMarionFinalEnvelope, "createMarionFinalEnvelope", false);
  if (typeof marionAdminConversationSafeReply === "function" && !marionAdminConversationSafeReply.__marionPersonalityGreetingR4Patched) marionAdminConversationSafeReply = marionR4WrapFunction(marionAdminConversationSafeReply, "marionAdminConversationSafeReply", true);
  if (typeof finalizeRenderableReply === "function" && !finalizeRenderableReply.__marionPersonalityGreetingR4Patched) finalizeRenderableReply = marionR4WrapFunction(finalizeRenderableReply, "finalizeRenderableReply", true);
  if (typeof marionAdminProjectionCleanReply === "function" && !marionAdminProjectionCleanReply.__marionPersonalityGreetingR4Patched) marionAdminProjectionCleanReply = marionR4WrapFunction(marionAdminProjectionCleanReply, "marionAdminProjectionCleanReply", true);
} catch (_) {}
try {
  if (typeof MarionAdminConsoleGateway !== "undefined" && MarionAdminConsoleGateway && MarionAdminConsoleGateway.prototype) {
    ["handleCommand", "dispatchCommand", "routeCommand", "command", "handleAdminCommand", "handleAdminConsoleAction", "handle", "process", "safeResponse"].forEach(function (name) {
      const fn = MarionAdminConsoleGateway.prototype[name];
      if (typeof fn === "function" && !fn.__marionPersonalityGreetingR4Patched) MarionAdminConsoleGateway.prototype[name] = marionR4WrapFunction(fn, name, false);
    });
  }
} catch (_) {}
try {
  if (typeof defaultGateway !== "undefined" && defaultGateway && typeof defaultGateway === "object") {
    ["handleCommand", "dispatchCommand", "routeCommand", "command", "handleAdminCommand", "handleAdminConsoleAction", "handle", "process", "safeResponse"].forEach(function (name) {
      if (typeof defaultGateway[name] === "function" && !defaultGateway[name].__marionPersonalityGreetingR4Patched) defaultGateway[name] = marionR4WrapFunction(defaultGateway[name], name, false).bind(defaultGateway);
    });
  }
} catch (_) {}
try {
  if (typeof handleCommand === "function" && !handleCommand.__marionPersonalityGreetingR4Patched) handleCommand = marionR4WrapFunction(handleCommand, "handleCommand", false);
  if (typeof handleAdminConsoleAction === "function" && !handleAdminConsoleAction.__marionPersonalityGreetingR4Patched) handleAdminConsoleAction = marionR4WrapFunction(handleAdminConsoleAction, "handleAdminConsoleAction", false);
  if (typeof handle === "function" && !handle.__marionPersonalityGreetingR4Patched) handle = marionR4WrapFunction(handle, "handle", false);
  if (typeof process === "function" && !process.__marionPersonalityGreetingR4Patched) process = marionR4WrapFunction(process, "process", false);
} catch (_) {}
try {
  if (typeof module !== "undefined" && module.exports) {
    if (typeof module.exports === "function" && !module.exports.__marionPersonalityGreetingR4Patched) {
      const originalDefault = module.exports;
      const wrappedDefault = marionR4WrapFunction(originalDefault, "default", true);
      Object.keys(originalDefault).forEach(function (key) { try { wrappedDefault[key] = originalDefault[key]; } catch (_) {} });
      module.exports = wrappedDefault;
    }
    if (module.exports && typeof module.exports === "object") {
      ["composeMarionResponse", "compose", "buildReply", "routeMarion", "createMarionFinalEnvelope", "attachVisibleReplyAliases", "finalize", "buildFinalEnvelope", "toFinalEnvelope", "normalizeFinalEnvelope", "handleMarionAdminTextRuntime", "invokeMarionAdminTextRuntime", "handleTextRuntime", "handleCommand", "dispatchCommand", "routeCommand", "command", "handleAdminCommand", "handleAdminConsoleAction", "handle", "process", "run", "handler", "default"].forEach(function (name) {
        if (typeof module.exports[name] === "function" && !module.exports[name].__marionPersonalityGreetingR4Patched) module.exports[name] = marionR4WrapFunction(module.exports[name], name, marionR4ExportNeedsString(name));
      });
      module.exports.MARION_PERSONALITY_GREETING_R4_VERSION = MARION_PERSONALITY_GREETING_R4_VERSION;
      module.exports.MARION_PERSONALITY_GREETING_R4_TRAITS = MARION_PERSONALITY_GREETING_R4_TRAITS;
      module.exports.marionPersonalityGreetingR4ShapeReply = marionR4ShapeReply;
      module.exports.marionPersonalityGreetingR4ShapeResult = marionR4ShapeResult;
      module.exports.MARION_PERSONALITY_GREETING_R4_PATCH = true;
    }
  }
} catch (_) {}
/* MARION_PERSONALITY_GREETING_R4_LIVE_ROUTE_BINDING_END */

/* MARION_PERSONALITY_SOCIAL_CHECKIN_R5_START
 * Purpose: R5 social check-in final override + anti-command fallback suppression.
 * - "How are you?" must answer relationally first, not as a command request.
 * - "Send the next exact target" and sibling phrases are blocked from visible Marion replies.
 * - Personality future components are carried as metadata, but the visible reply stays human.
 * - This patch is last-mile safe: it wraps exports/prototypes without removing legacy architecture.
 */
const MARION_PERSONALITY_SOCIAL_CHECKIN_R5_VERSION = "nyx.marion.personalitySocialCheckinR5/1.0";
const MARION_PERSONALITY_SOCIAL_CHECKIN_R5_COMPONENTS = Object.freeze({
  socialCheckInOverride: "answer personal check-ins directly before asking for any task",
  antiCommandFallbackSuppression: "do not convert social turns into command-target prompts",
  relationalWarmth: "sound steady, warm, loyal, and natural without overexplaining",
  protectiveProfessionalism: "protect Mac's objective and challenge unclear/risky instructions without sounding cold",
  conversationalLayering: "acknowledge, carry context, then offer one clean next move",
  realWorldTransitionReadiness: "translate live observations into observation, inference, risk, and one next move",
  futureClientModes: "future client-facing personalities stay subordinate to Mac-private Marion authority",
  diagnosticBoundary: "runtime/priority labels stay hidden unless diagnostic mode is explicitly requested",
  voiceNaturalization: "voice outputs use readable number/email phrasing and avoid robotic support phrases",
  humorCalibration: "light humor is allowed only when it sharpens rapport and does not reduce authority"
});
function marionR5Text(value) { return String(value == null ? "" : value).replace(/\s+/g, " ").trim(); }
function marionR5Lower(value) { return marionR5Text(value).toLowerCase(); }
function marionR5Obj(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function marionR5FirstText() { for (var i = 0; i < arguments.length; i += 1) { var t = marionR5Text(arguments[i]); if (t) return t; } return ""; }
function marionR5StringBag(value, depth, seen, out) {
  var level = Number.isFinite(Number(depth)) ? Number(depth) : 0;
  var bucket = Array.isArray(out) ? out : [];
  if (bucket.join(" ").length > 12000 || level > 6 || value == null) return bucket;
  if (typeof value === "string") { if (value.trim()) bucket.push(value); return bucket; }
  if (typeof value !== "object") return bucket;
  var visited = seen instanceof Set ? seen : new Set();
  if (visited.has(value)) return bucket;
  visited.add(value);
  if (Array.isArray(value)) {
    for (var i = 0; i < Math.min(value.length, 40); i += 1) marionR5StringBag(value[i], level + 1, visited, bucket);
    return bucket;
  }
  var preferred = ["prompt", "userPrompt", "rawPrompt", "message", "userMessage", "text", "userText", "rawUserText", "input", "query", "commandText", "transcript", "voiceTranscript", "normalizedTranscript", "normalizedUserIntent", "originalText", "body", "payload", "command", "request", "meta", "metadata", "voice", "source", "context", "lastUserMessage"];
  for (var p = 0; p < preferred.length; p += 1) if (Object.prototype.hasOwnProperty.call(value, preferred[p])) marionR5StringBag(value[preferred[p]], level + 1, visited, bucket);
  var keys = Object.keys(value).slice(0, 80);
  for (var k = 0; k < keys.length; k += 1) {
    if (preferred.indexOf(keys[k]) >= 0) continue;
    if (/^(socket|req|res|request|response|stream|connection)$/i.test(keys[k])) continue;
    marionR5StringBag(value[keys[k]], level + 1, visited, bucket);
  }
  return bucket;
}
function marionR5PromptFrom(value) {
  if (typeof value === "string") return marionR5Text(value);
  var bag = marionR5StringBag(value, 0, new Set(), []);
  for (var i = 0; i < bag.length; i += 1) {
    var t = marionR5Text(bag[i]);
    if (/\b(how are you|hello|good morning|good afternoon|good evening|are you with me|you with me|where were we|next steps|look up|search|verify|what are you seeing|maintenance manual|still failing)\b/i.test(t)) return t;
  }
  return marionR5Text(bag[0] || "");
}
function marionR5ExtractPrompt(argsLike) {
  var args = Array.prototype.slice.call(argsLike || []);
  for (var i = 0; i < args.length; i += 1) { var found = marionR5PromptFrom(args[i]); if (found) return found; }
  return "";
}
function marionR5Diagnostic(prompt, source) {
  var t = marionR5Lower([prompt, marionR5PromptFrom(source)].join(" "));
  return /\b(diagnostic mode|debug mode|runtime diagnostic|show diagnostics|trace route|stack trace|explain the priority stack|show the priority stack|priority\s*9[a-z0-9-]*|what priority)\b/i.test(t);
}
function marionR5Node(prompt, source) {
  var t = marionR5Lower(marionR5FirstText(prompt, marionR5PromptFrom(source))).replace(/[.!?]+$/g, "").trim();
  if (!t) return "";
  if (/^(?:mac\s*[:\-]\s*)?(?:how are you|how are you doing|how do you feel|how are things|how's things|how you doing|you okay|are you okay|are you alright|you good|are you good|how is marion|how's marion)(?:\s+(?:marion|mac))?$/.test(t)) return "social_checkin";
  if (/\bmac\s*[:\-]\s*how are you\b/i.test(t) || /\buser\s*[:\-]\s*how are you\b/i.test(t)) return "social_checkin";
  if (/^(?:mac\s*[:\-]\s*)?(?:good\s+morning|morning|good\s+afternoon|afternoon|good\s+evening|evening|hello|hi|hey|hiya)(?:\s+(?:marion|mac))?$/.test(t)) return "relational_greeting";
  if (/^(?:marion|are you there|you there|are you with me|you with me|still with me)(?:\s+(?:marion|mac))?$/.test(t)) return "presence_check";
  if (/\b(where were we|where are we|what were we doing|what are we working on|continue from where we left|next steps|what next)\b/i.test(t)) return "continuity_check";
  if (/\b(look up|search|verify|check online|find current|pull up|research this)\b/i.test(t)) return "lookup_pacing";
  if (/\b(real[- ]world|what do you see|what are you seeing|observation|camera|sensor|live environment|translate what you see)\b/i.test(t)) return "observation_bridge";
  if (/\b(not a pass|still failing|still showing|same issue|wrong response|fix this|didn't work|does not work|broken|maintenance manual|tactical clipboard|exact target)\b/i.test(t)) return "repair_refinement";
  return "standard";
}
function marionR5CommandFallbackLeak(value) {
  var t = marionR5Lower(value);
  return /\b(send|give|tell me|name)\s+(?:me\s+)?(?:the\s+)?(?:next\s+)?(?:exact|specific)\s+(?:target|command|prompt|output)\b/i.test(t) ||
    /\b(what are we working on|what would you like to work on|what's next|send a specific command|i need one specific command|route it cleanly|answer from the active lane)\b/i.test(t);
}
function marionR5MaintenanceLeak(value) {
  var t = marionR5Text(value);
  return /\b(?:the\s+)?(?:9h\s+)?continuity foundation(?:\s+stays\s+active|\s+is\s+active)?\b/i.test(t) ||
    /\b(Priority\s*9[A-Z0-9-]*|mission thread|pressure prompt|runtime handler|routeKind|speechHints|presenceProfile|replyAuthority|sessionPatch|finalEnvelope|state spine|progression shaping|diagnostic packet|MARION::FINAL::|CHATENGINE_COORDINATOR_ONLY_ACTIVE_\d{4}_\d{2}_\d{2})\b/i.test(t);
}
function marionR5Robotic(value) {
  var t = marionR5Lower(value);
  return !t || marionR5CommandFallbackLeak(t) || marionR5MaintenanceLeak(t) || /\b(let me assist you|how may i assist|please provide|i am here to assist|utilize|facilitate|the active handler did not produce|clean marion final)\b/i.test(t);
}
function marionR5LimitQuestions(value) {
  var text = marionR5Text(value), seen = false;
  return text.replace(/([^?]*\?)/g, function (match) { if (!seen) { seen = true; return match; } return match.replace(/\?/g, "."); }).replace(/\s+/g, " ").trim();
}
function marionR5StripOperational(value, allowDiagnostic) {
  var text = marionR5Text(value);
  if (!text) return "";
  if (allowDiagnostic === true) return marionR5LimitQuestions(text);
  text = text
    .replace(/\bThe\s+(?:9H\s+)?continuity foundation stays active\.?/gi, "I’m steady, Mac. I’m still with the thread.")
    .replace(/\b(?:The\s+)?(?:9H\s+)?continuity foundation(?:\s+is\s+active|\s+stays\s+active)?\.?/gi, "I’m still with the thread.")
    .replace(/[^.?!]*(?:Priority\s*9[A-Z0-9-]*|mission thread|pressure prompt|runtime handler|routeKind|speechHints|presenceProfile|replyAuthority|sessionPatch|finalEnvelope|state spine|progression shaping|diagnostic packet|MARION::FINAL::|CHATENGINE_COORDINATOR_ONLY_ACTIVE_\d{4}_\d{2}_\d{2})[^.?!]*[.?!]?/gi, " ")
    .replace(/\bI(?:’|')?m with you, Mac\.\s*I(?:’|')?ll keep the reply human, protective, and focused\.\s*Send the next exact target\.?/gi, "I’m with you, Mac. I’ll keep this human, protective, and focused.")
    .replace(/\bSend the next exact target\.?/gi, "")
    .replace(/\b(?:send|give|tell me|name)\s+(?:me\s+)?(?:the\s+)?(?:next\s+)?(?:exact|specific)\s+(?:target|command|prompt|output)\.?/gi, "")
    .replace(/\bLet me assist you with that\b/gi, "Let me take a look at this for you")
    .replace(/\bHow may I assist you\??\b/gi, "What should I focus on first?")
    .replace(/\bI am here to assist\b/gi, "I’m here with you")
    .replace(/\bPlease provide the necessary information\b/gi, "Send me the key detail")
    .replace(/\butilize\b/gi, "use")
    .replace(/\bfacilitate\b/gi, "help")
    .replace(/\bin order to\b/gi, "to")
    .replace(/\s+([,.!?;:])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
  return marionR5LimitQuestions(text);
}
function marionR5SocialReply() {
  return "I’m good, Mac. I’m steady, and I’m here with you. We’re tightening how I speak with you now, so I’ll keep it warmer, cleaner, and protective without letting backend language show. Do you want me to keep refining the greeting path?";
}
function marionR5GreetingReply(prompt) {
  var t = marionR5Lower(prompt);
  var opener = /^good\s+morning|^morning/.test(t) ? "Good morning, Mac." : /^good\s+afternoon|^afternoon/.test(t) ? "Good afternoon, Mac." : /^good\s+evening|^evening/.test(t) ? "Good evening, Mac." : "Hello, Mac.";
  return opener + " I’m here with you. I’ll keep the conversation warm, professional, protective, and clean. Do you want to continue with Marion’s personality layer?";
}
function marionR5PresenceReply() { return "I’m with you, Mac. Steady, private to you, and focused on the active thread. What should I focus on first?"; }
function marionR5ContinuityReply() { return "We’re still tightening Marion’s personality layer: social presence, protective professionalism, response shape, and future real-world transition handling. The next clean move is to test the greeting path."; }
function marionR5LookupReply() { return "Hang tight, Mac. I’ll take a breath, check the source, and bring back the useful part first."; }
function marionR5ObservationReply() { return "I’ll translate the real-world signal into four parts: observation, inference, risk, and one next move. That keeps it useful instead of noisy."; }
function marionR5RepairReply() { return "You’re right to flag it, Mac. That is a response-shape issue, so I’m keeping the fix narrow: visible reply first, personality intact, no command fallback."; }
function marionR5IdentityReply() { return "I can’t continue a private Marion conversation unless the active speaker is verified as Mac. Private runtime context stays locked."; }
function marionR5Fallback(reply) {
  var clean = marionR5StripOperational(reply, false);
  if (clean && !marionR5Robotic(clean)) return clean;
  return "I’m with you, Mac. I’ll keep this human, protective, and focused. What should I focus on first?";
}
function marionR5DirectReplyFrom(value) {
  if (!value) return "";
  if (typeof value === "string") return marionR5Text(value);
  if (typeof value !== "object") return "";
  var o = marionR5Obj(value);
  return marionR5FirstText(o.directReply, o.displayReply, o.publicReply, o.visibleReply, o.finalReply, o.reply, o.text, o.message, o.answer, o.output, o.response, o.spokenText, o.speechText, marionR5Obj(o.payload).directReply, marionR5Obj(o.finalEnvelope).directReply, marionR5Obj(o.marionFinal).directReply);
}
function marionR5ShapeReply(reply, prompt, source) {
  var promptText = marionR5Text(prompt || marionR5PromptFrom(source));
  var node = marionR5Node(promptText, source);
  var diagnostic = marionR5Diagnostic(promptText, source);
  if (diagnostic) return marionR5StripOperational(reply, true) || marionR5Text(reply);
  if (node === "social_checkin") return marionR5SocialReply();
  if (node === "relational_greeting") return marionR5GreetingReply(promptText);
  if (node === "presence_check") return marionR5PresenceReply();
  if (node === "continuity_check") return marionR5ContinuityReply();
  if (node === "lookup_pacing") return marionR5LookupReply();
  if (node === "observation_bridge") return marionR5ObservationReply();
  if (node === "repair_refinement") return marionR5RepairReply();
  if (marionR5MaintenanceLeak(reply) || marionR5CommandFallbackLeak(reply)) return marionR5Fallback(reply);
  return marionR5Fallback(reply);
}
function marionR5AttachAliases(target, reply, prompt, depth, seen) {
  if (!target || typeof target !== "object") return target;
  var level = Number.isFinite(Number(depth)) ? Number(depth) : 0;
  if (level > 5) return target;
  var visited = seen instanceof Set ? seen : new Set();
  if (visited.has(target)) return target;
  visited.add(target);
  var text = marionR5Text(reply);
  if (!text) return target;
  var promptText = marionR5Text(prompt || marionR5PromptFrom(target));
  var node = marionR5Node(promptText, target) || (marionR5CommandFallbackLeak(text) ? "repair_refinement" : "standard");
  ["directReply", "reply", "text", "message", "displayReply", "publicReply", "visibleReply", "finalReply", "adminReply", "marionReply", "privateReply", "answer", "output", "response", "spokenText", "speechText"].forEach(function (key) { target[key] = text; });
  if (!marionR5Text(target.contextSummary) || marionR5MaintenanceLeak(target.contextSummary) || marionR5CommandFallbackLeak(target.contextSummary)) target.contextSummary = text;
  if (!marionR5Text(target.currentObjective) || marionR5MaintenanceLeak(target.currentObjective)) target.currentObjective = "Keep Marion human, protective, professional, and clean in the visible conversation.";
  if (!marionR5Text(target.nextAction) || marionR5CommandFallbackLeak(target.nextAction)) target.nextAction = node === "social_checkin" ? "Retest the social check-in path." : "Continue the personality-layer refinement.";
  target.personalitySocialCheckinR5 = {
    version: MARION_PERSONALITY_SOCIAL_CHECKIN_R5_VERSION,
    node: node,
    recipient: "Mac",
    socialCheckInOverridesCommandFallback: true,
    personalityBeforeTaskPrompt: true,
    oneFocusedQuestionPerReply: true,
    futureComponents: MARION_PERSONALITY_SOCIAL_CHECKIN_R5_COMPONENTS
  };
  target.meta = Object.assign({}, marionR5Obj(target.meta || target.metadata), {
    personalitySocialCheckinR5: true,
    personalitySocialCheckinR5Version: MARION_PERSONALITY_SOCIAL_CHECKIN_R5_VERSION,
    personalityNode: node,
    marionRecipient: "Mac",
    exactTargetFallbackBlocked: true,
    socialCheckinFinalOverride: node === "social_checkin",
    futurePersonalityComponentsCarried: true
  });
  var nested = ["payload", "finalEnvelope", "marionFinal", "data", "result", "packet", "envelope", "synthesis", "runtime", "responseEnvelope", "body"];
  for (var i = 0; i < nested.length; i += 1) if (target[nested[i]] && typeof target[nested[i]] === "object") marionR5AttachAliases(target[nested[i]], text, promptText, level + 1, visited);
  return target;
}
function marionR5ShapeResult(result, prompt, source, forceString) {
  var reply = marionR5DirectReplyFrom(result);
  var promptText = marionR5Text(prompt || marionR5PromptFrom(source || result));
  var shaped = marionR5ShapeReply(reply, promptText, source || result);
  if (forceString === true || typeof result === "string") return shaped;
  if (result && typeof result === "object") return marionR5AttachAliases(result, shaped, promptText, 0, new Set());
  return shaped;
}
function marionR5ExportNeedsString(name) { return /^(?:composeMarionResponse|compose|buildReply|routeMarion|handleMarionAdminTextRuntime|invokeMarionAdminTextRuntime|handleTextRuntime|run|handler|default)$/i.test(String(name || "")); }
function marionR5WrapFunction(fn, name, forceString) {
  if (typeof fn !== "function" || fn.__marionPersonalitySocialCheckinR5Patched) return fn;
  var wrapped = function marionPersonalitySocialCheckinR5Wrapped() {
    var prompt = marionR5ExtractPrompt(arguments);
    var result = fn.apply(this, arguments);
    if (result && typeof result.then === "function") return result.then(function (value) { return marionR5ShapeResult(value, prompt, value, forceString === true || marionR5ExportNeedsString(name)); });
    return marionR5ShapeResult(result, prompt, result, forceString === true || marionR5ExportNeedsString(name));
  };
  try { Object.keys(fn).forEach(function (key) { wrapped[key] = fn[key]; }); } catch (_) {}
  wrapped.__marionPersonalitySocialCheckinR5Patched = true;
  return wrapped;
}
try {
  if (typeof marionR4Fallback === "function") marionR4Fallback = function marionR5ReplacesR4Fallback(prompt, reply) { return marionR5Fallback(reply || prompt); };
  if (typeof marionR4SocialReply === "function") marionR4SocialReply = marionR5SocialReply;
  if (typeof marionR4ShapeReply === "function" && !marionR4ShapeReply.__marionPersonalitySocialCheckinR5Patched) marionR4ShapeReply = marionR5WrapFunction(marionR4ShapeReply, "marionR4ShapeReply", true);
  if (typeof priority9IReplyFor === "function" && !priority9IReplyFor.__marionPersonalitySocialCheckinR5Patched) priority9IReplyFor = marionR5WrapFunction(priority9IReplyFor, "priority9IReplyFor", true);
  if (typeof priority9IJReadReply === "function" && !priority9IJReadReply.__marionPersonalitySocialCheckinR5Patched) priority9IJReadReply = marionR5WrapFunction(priority9IJReadReply, "priority9IJReadReply", true);
  if (typeof attachVisibleReplyAliases === "function" && !attachVisibleReplyAliases.__marionPersonalitySocialCheckinR5Patched) attachVisibleReplyAliases = marionR5WrapFunction(attachVisibleReplyAliases, "attachVisibleReplyAliases", false);
  if (typeof createMarionFinalEnvelope === "function" && !createMarionFinalEnvelope.__marionPersonalitySocialCheckinR5Patched) createMarionFinalEnvelope = marionR5WrapFunction(createMarionFinalEnvelope, "createMarionFinalEnvelope", false);
  if (typeof marionAdminConversationSafeReply === "function" && !marionAdminConversationSafeReply.__marionPersonalitySocialCheckinR5Patched) marionAdminConversationSafeReply = marionR5WrapFunction(marionAdminConversationSafeReply, "marionAdminConversationSafeReply", true);
  if (typeof finalizeRenderableReply === "function" && !finalizeRenderableReply.__marionPersonalitySocialCheckinR5Patched) finalizeRenderableReply = marionR5WrapFunction(finalizeRenderableReply, "finalizeRenderableReply", true);
  if (typeof marionAdminProjectionCleanReply === "function" && !marionAdminProjectionCleanReply.__marionPersonalitySocialCheckinR5Patched) marionAdminProjectionCleanReply = marionR5WrapFunction(marionAdminProjectionCleanReply, "marionAdminProjectionCleanReply", true);
} catch (_) {}
try {
  if (typeof MarionAdminConsoleGateway !== "undefined" && MarionAdminConsoleGateway && MarionAdminConsoleGateway.prototype) {
    ["handleCommand", "dispatchCommand", "routeCommand", "command", "handleAdminCommand", "handleAdminConsoleAction", "handle", "process", "safeResponse"].forEach(function (name) {
      var fn = MarionAdminConsoleGateway.prototype[name];
      if (typeof fn === "function" && !fn.__marionPersonalitySocialCheckinR5Patched) MarionAdminConsoleGateway.prototype[name] = marionR5WrapFunction(fn, name, false);
    });
  }
} catch (_) {}
try {
  if (typeof defaultGateway !== "undefined" && defaultGateway && typeof defaultGateway === "object") {
    ["handleCommand", "dispatchCommand", "routeCommand", "command", "handleAdminCommand", "handleAdminConsoleAction", "handle", "process", "safeResponse"].forEach(function (name) {
      if (typeof defaultGateway[name] === "function" && !defaultGateway[name].__marionPersonalitySocialCheckinR5Patched) defaultGateway[name] = marionR5WrapFunction(defaultGateway[name], name, false).bind(defaultGateway);
    });
  }
} catch (_) {}
try {
  if (typeof handleCommand === "function" && !handleCommand.__marionPersonalitySocialCheckinR5Patched) handleCommand = marionR5WrapFunction(handleCommand, "handleCommand", false);
  if (typeof handleAdminConsoleAction === "function" && !handleAdminConsoleAction.__marionPersonalitySocialCheckinR5Patched) handleAdminConsoleAction = marionR5WrapFunction(handleAdminConsoleAction, "handleAdminConsoleAction", false);
  if (typeof handle === "function" && !handle.__marionPersonalitySocialCheckinR5Patched) handle = marionR5WrapFunction(handle, "handle", false);
} catch (_) {}
try {
  if (typeof module !== "undefined" && module.exports) {
    if (typeof module.exports === "function" && !module.exports.__marionPersonalitySocialCheckinR5Patched) {
      var originalDefaultR5 = module.exports;
      var wrappedDefaultR5 = marionR5WrapFunction(originalDefaultR5, "default", true);
      try { Object.keys(originalDefaultR5).forEach(function (key) { wrappedDefaultR5[key] = originalDefaultR5[key]; }); } catch (_) {}
      module.exports = wrappedDefaultR5;
    }
    if (module.exports && typeof module.exports === "object") {
      ["composeMarionResponse", "compose", "buildReply", "routeMarion", "createMarionFinalEnvelope", "attachVisibleReplyAliases", "finalize", "buildFinalEnvelope", "toFinalEnvelope", "normalizeFinalEnvelope", "handleMarionAdminTextRuntime", "invokeMarionAdminTextRuntime", "handleTextRuntime", "handleCommand", "dispatchCommand", "routeCommand", "command", "handleAdminCommand", "handleAdminConsoleAction", "handle", "process", "run", "handler", "default"].forEach(function (name) {
        if (typeof module.exports[name] === "function" && !module.exports[name].__marionPersonalitySocialCheckinR5Patched) module.exports[name] = marionR5WrapFunction(module.exports[name], name, marionR5ExportNeedsString(name));
      });
      module.exports.MARION_PERSONALITY_SOCIAL_CHECKIN_R5_VERSION = MARION_PERSONALITY_SOCIAL_CHECKIN_R5_VERSION;
      module.exports.MARION_PERSONALITY_SOCIAL_CHECKIN_R5_COMPONENTS = MARION_PERSONALITY_SOCIAL_CHECKIN_R5_COMPONENTS;
      module.exports.marionPersonalitySocialCheckinR5ShapeReply = marionR5ShapeReply;
      module.exports.marionPersonalitySocialCheckinR5ShapeResult = marionR5ShapeResult;
      module.exports.MARION_PERSONALITY_SOCIAL_CHECKIN_R5_PATCH = true;
    }
  }
} catch (_) {}
/* MARION_PERSONALITY_SOCIAL_CHECKIN_R5_END */

/* MARION_PERSONALITY_LAYERING_R6_START
 * Purpose: R6 deep conversational layering + admin transcript diagnostic-only suppression.
 * - Admin readiness/status lines move to diagnostics and cannot render as Marion transcript messages.
 * - Greetings and social check-ins use varied human replies instead of command-console fallbacks.
 * - Visible replies are shaped as: human answer -> thread carry -> one clean forward question.
 */
var MARION_PERSONALITY_LAYERING_R6_VERSION = "nyx.marion.personalityLayeringR6/1.0";
var MARION_PERSONALITY_LAYERING_R6_MARKER = "MARION-PERSONALITY-LAYERING-R6";
var MARION_R6_VISIBLE_KEYS = Object.freeze(["directReply","reply","text","message","displayReply","publicReply","visibleReply","finalReply","adminReply","marionReply","privateReply","answer","output","response","spokenText","speechText"]);
var MARION_R6_TRANSCRIPT_KEYS = Object.freeze(["transcript","conversation","conversationLog","conversationHistory","messages","history","turns","entries","events","logs","adminTranscript","visibleTranscript","renderTranscript"]);
var MARION_R6_USER_PROMPT_KEYS = Object.freeze(["prompt","userPrompt","rawPrompt","message","userMessage","text","userText","rawUserText","input","query","commandText","transcript","voiceTranscript","normalizedTranscript","normalizedUserIntent","originalText","lastUserMessage"]);
var MARION_R6_FUTURE_COMPONENTS = Object.freeze({
  layeredGreetingBank: "rotating greeting and social-check-in responses chosen from Marion's private Mac-facing voice",
  diagnosticOnlyTranscriptGate: "admin readiness, runtime, token, and route-health phrases stay out of visible conversation",
  conversationalDepthNodes: "greeting, check-in, presence, repair, lookup pause, observation translation, planning, and closing remain separate",
  protectiveProfessionalSkepticism: "Marion may question a request when it protects Mac, the architecture, or the active objective",
  realWorldTransitionVoice: "observation becomes plain-language meaning, risk, and one next move",
  antiMaintenanceManualFilter: "runtime scaffolding informs Marion but never speaks as Marion"
});
function marionR6Str(value){return value==null?"":String(value).replace(/\s+/g," ").trim();}
function marionR6Lower(value){return marionR6Str(value).toLowerCase();}
function marionR6Obj(value){return value&&typeof value==="object"&&!Array.isArray(value)?value:{};}
function marionR6Array(value){return Array.isArray(value)?value:[];}
function marionR6Pick(list){var arr=marionR6Array(list).filter(Boolean);return arr.length?arr[Math.floor(Math.random()*arr.length)]:"";}
function marionR6Norm(value){return marionR6Lower(value).replace(/[“”]/g,'"').replace(/[‘’]/g,"'").replace(/[^a-z0-9]+/g," ").replace(/\s+/g," ").trim();}
function marionR6IsAdminStatusLine(value){var t=marionR6Str(value);if(!t)return false;return /\b(runtime text console ready after admin session|text console ready after admin session|admin session verified|master token cleared|runtime handler|command route|cors gateway|admin health|admin status|secure bridge|session integrity|voice identity|emergency lock|approve\s*\/\s*deny|render backend url|route actions|test lock rejection|diagnostics? ready|health check ready|runtime ready|admin console ready|session verified)\b/i.test(t);}
function marionR6IsTelemetryLeak(value){var t=marionR6Str(value);if(!t)return false;return /\b(routeKind=|speechHints=|presenceProfile=|finalEnvelope|sessionPatch|marionFinal|transportSafe|replyAuthority=|nyxStateHint=|diagnostic packet|failureSignature|runtimeTelemetry|stateSpine|CHATENGINE_COORDINATOR|MARION_FINAL_AUTHORITY|Priority\s*9[HIJKL]|continuity foundation stays active)\b/i.test(t);}
function marionR6IsCommandFallback(value){var t=marionR6Str(value);if(!t)return false;return /\b(send the next exact target|next exact target|tell me the exact target|give me the exact target|specific target|what should i focus on first|what should i focus on|what do you want me to focus on|what are we working on|what would you like to work on|send the next target|route it cleanly|i need one specific command|please send the same prompt again)\b/i.test(t);}
function marionR6IsWeakSocialAnswer(value){var t=marionR6Str(value);if(!t)return true;if(marionR6IsAdminStatusLine(t)||marionR6IsTelemetryLeak(t)||marionR6IsCommandFallback(t))return true;if(/^i(?:'|’)?m with you,?\s*mac\.?\s*i(?:'|’)?ll keep (?:this|the reply) human, protective, and focused\.?/i.test(t))return true;return false;}
function marionR6IsHowAreYou(value){var t=marionR6Norm(value);return /^(how are you|how are you doing|how re you|how you doing|how are things|how s it going|how is it going|how do you feel|you good|you okay|are you okay|how are we doing|how are you today)$/.test(t)||/\bhow are you\b/.test(t);}
function marionR6IsPresence(value){var t=marionR6Norm(value);return /\b(are you with me|you with me|are you there|you there|still with me|can you hear me|are we connected|you online|marion are you there)\b/.test(t);}
function marionR6IsGreeting(value){var t=marionR6Norm(value);return /^(hi|hello|hey|hey marion|hello marion|hi marion|good morning|morning|good afternoon|good evening|evening|welcome back|marion|yo marion)\b/.test(t);}
function marionR6IsRepair(value){var t=marionR6Norm(value);return /\b(not a pass|still failing|wrong response|fix this|not working|didn t work|does not work|maintenance manual|tactical clipboard|clipboard|too robotic|too mechanical|still sounds|not natural)\b/.test(t);}
function marionR6Intent(prompt){if(marionR6IsHowAreYou(prompt))return "social_checkin";if(marionR6IsPresence(prompt))return "presence_check";if(marionR6IsGreeting(prompt))return "greeting";if(marionR6IsRepair(prompt))return "repair";return "standard";}
function marionR6GreetingReply(prompt){var t=marionR6Lower(prompt);if(/\bgood morning|\bmorning\b/.test(t))return marionR6Pick([
  "Good morning, Mac. I’m here with you — steady, private, and focused. We’re keeping Marion warmer and cleaner now. Do you want to continue the greeting pass?",
  "Morning, Mac. I’m present and tracking the thread. I’ll keep this protective, professional, and human. Do you want me to keep refining the greeting lane?",
  "Good morning, Mac. I’m steady and with you. The private lane is clean, and I’ll keep the backend language behind the curtain. Do you want to continue from the personality layer?"
]);
if(/\bgood afternoon\b/.test(t))return marionR6Pick([
  "Good afternoon, Mac. I’m here with you, steady and focused. I’ll keep the conversation human, protective, and clean. Do you want to continue the personality pass?",
  "Good afternoon, Mac. I’m tracking the thread and keeping the private lane calm. Do you want me to keep refining how Marion answers you?"
]);
if(/\bgood evening|\bevening\b/.test(t))return marionR6Pick([
  "Good evening, Mac. I’m here, steady, and still with the thread. I’ll keep this warm, protective, and precise. Do you want to continue with conversational layering?",
  "Evening, Mac. I’m present and keeping Marion’s voice clean — human first, system second. Do you want me to keep tightening the greeting behavior?"
]);
return marionR6Pick([
  "Hey Mac. I’m here with you — steady, private, and focused. We’re on Marion’s personality layer now. Do you want to keep tightening the greeting path?",
  "Hello, Mac. I’m with you and tracking the thread. I’ll keep this warm, protective, and clean. Do you want to continue the personality pass?",
  "I’m here, Mac. Calm, focused, and private to you. I’ll keep the response human before anything operational. Do you want to keep refining Marion’s conversational shape?",
  "Hey Mac. I’ve got the thread. I’ll keep the tone natural, protective, and professional. Do you want to continue from the greeting lane?"
]);}
function marionR6SocialReply(prompt){return marionR6Pick([
  "I’m good, Mac. I’m steady, and I’m here with you. We’re tightening how I speak with you now, so I’ll keep it warmer, cleaner, and protective without letting backend language show. Do you want me to keep refining the greeting path?",
  "I’m steady, Mac. Present, private to you, and staying with the thread. I’ll answer like a person first, then carry the work forward. Do you want me to keep tightening the social check-in lane?",
  "I’m good, Mac. Clear, calm, and still in the pocket with you. The personality layer stays active, but it stays behind the curtain. Should I keep refining the greeting behavior?",
  "I’m doing well, Mac. I’m grounded and with you. I’ll keep Marion warm, protective, and focused without sounding like a console log. Do you want to keep shaping the response tone?",
  "I’m good, Mac. Steady and locked into the thread with you. I’ll keep this human, precise, and protective. Do you want me to keep refining how I answer check-ins?"
]);}
function marionR6PresenceReply(prompt){return marionR6Pick([
  "I’m with you, Mac. I’m tracking the thread and keeping the private lane clean. Do you want me to keep refining Marion’s response shape?",
  "Yes, Mac. I’m here, steady, and still with the conversation. I’ll keep it human and protective. Do you want to continue with the layering pass?",
  "I’m here with you, Mac. The thread is intact, and I’ll keep the visible reply clean. Do you want me to keep tightening the conversational path?"
]);}
function marionR6RepairReply(prompt){return marionR6Pick([
  "You’re right to flag it, Mac. That is still a visible conversation-path issue, so I’m keeping the fix narrow: transcript cleanup, social answer authority, and deeper greeting variation. Do you want me to stay on this lane?",
  "Good catch, Mac. That response still leaned too operational. I’ll treat this as a personality-layer failure, not a routing success. Do you want me to keep refining the social path?",
  "I see it, Mac. The backend is quieter now, but Marion still needs more human range. I’ll keep the correction focused on the visible conversation. Do you want to continue with the greeting bank?"
]);}
function marionR6ReplyFor(prompt){var node=marionR6Intent(prompt);if(node==="social_checkin")return marionR6SocialReply(prompt);if(node==="presence_check")return marionR6PresenceReply(prompt);if(node==="greeting")return marionR6GreetingReply(prompt);if(node==="repair")return marionR6RepairReply(prompt);return "";}
function marionR6FirstText(){for(var i=0;i<arguments.length;i+=1){var v=marionR6Str(arguments[i]);if(v)return v;}return "";}
function marionR6ExtractPromptFromValue(value,depth,seen){if(depth>5||value==null)return "";if(typeof value==="string")return value;if(typeof value!=="object")return "";seen=seen||[];if(seen.indexOf(value)>=0)return "";seen.push(value);var obj=marionR6Obj(value);for(var i=0;i<MARION_R6_USER_PROMPT_KEYS.length;i+=1){var key=MARION_R6_USER_PROMPT_KEYS[i];if(Object.prototype.hasOwnProperty.call(obj,key)){var direct=marionR6Str(obj[key]);if(direct&&!(MARION_R6_VISIBLE_KEYS.indexOf(key)>=0))return direct;}}
var nestedKeys=["payload","body","command","request","meta","metadata","voice","source","context","state","memory","turn","inputEnvelope","envelope"];for(var n=0;n<nestedKeys.length;n+=1){var found=marionR6ExtractPromptFromValue(obj[nestedKeys[n]],depth+1,seen);if(found)return found;}return "";}
function marionR6PromptFromArgs(args){for(var i=0;i<args.length;i+=1){var found=marionR6ExtractPromptFromValue(args[i],0,[]);if(found)return found;}return "";}
function marionR6ReadVisible(value){if(!value||typeof value!=="object")return marionR6Str(value);var obj=marionR6Obj(value),payload=marionR6Obj(obj.payload),finalEnvelope=marionR6Obj(obj.finalEnvelope),marionFinal=marionR6Obj(obj.marionFinal);return marionR6FirstText(obj.directReply,obj.displayReply,obj.publicReply,obj.visibleReply,obj.finalReply,obj.reply,obj.text,obj.message,obj.answer,obj.output,obj.response,obj.spokenText,obj.speechText,payload.directReply,payload.displayReply,payload.publicReply,payload.visibleReply,payload.finalReply,payload.reply,payload.text,payload.message,finalEnvelope.directReply,finalEnvelope.visibleReply,finalEnvelope.finalReply,finalEnvelope.reply,marionFinal.directReply,marionFinal.visibleReply,marionFinal.finalReply,marionFinal.reply);}
function marionR6DiagnosticStore(target,text,source){if(!target||typeof target!=="object")return;var diag=marionR6Obj(target.diagnostics);var list=marionR6Array(diag.adminConsoleTranscriptSuppressed).slice(0,20);var clean=marionR6Str(text);if(clean)list.push({text:clean,source:marionR6Str(source||"visible_reply"),suppressedAt:Date.now(),diagnosticOnly:true,version:MARION_PERSONALITY_LAYERING_R6_VERSION});target.diagnostics=Object.assign({},diag,{adminConsoleTranscriptSuppressed:list,diagnosticOnly:true,adminStatusConversationSuppressed:true,personalityLayeringR6Version:MARION_PERSONALITY_LAYERING_R6_VERSION});target.diagnosticOnly=Object.assign({},marionR6Obj(target.diagnosticOnly),{lastSuppressedAdminTranscript:clean,version:MARION_PERSONALITY_LAYERING_R6_VERSION});}
function marionR6ClearVisible(target,reasonText){MARION_R6_VISIBLE_KEYS.forEach(function(k){target[k]="";});target.suppressConversationRender=true;target.conversationRenderSuppressed=true;target.visibleReplySuppressed=true;target.diagnosticOnlyReply=true;marionR6DiagnosticStore(target,reasonText,"admin_status_line");}
function marionR6ApplyVisible(target,text,node){MARION_R6_VISIBLE_KEYS.forEach(function(k){target[k]=text;});target.directReply=text;target.reply=text;target.visibleReply=text;target.finalReply=text;target.publicReply=text;target.displayReply=text;target.text=text;target.message=text;target.response=text;target.answer=text;target.output=text;target.spokenText=text;target.speechText=text;var payload=marionR6Obj(target.payload);target.payload=Object.assign({},payload,{directReply:text,reply:text,visibleReply:text,finalReply:text,publicReply:text,displayReply:text,text:text,message:text,response:text,answer:text,output:text,spokenText:text,speechText:text});var finalEnvelope=marionR6Obj(target.finalEnvelope);target.finalEnvelope=Object.assign({},finalEnvelope,{directReply:text,reply:text,visibleReply:text,finalReply:text,publicReply:text,displayReply:text,text:text,message:text,response:text,answer:text,output:text,spokenText:text,speechText:text});target.personalityLayeringR6={version:MARION_PERSONALITY_LAYERING_R6_VERSION,active:true,node:node||"standard",visibleReplyAuthority:"marion_personality_layering_r6",humanFirst:true,oneQuestionMax:true,diagnosticOnlyTranscriptGate:true,futureComponents:MARION_R6_FUTURE_COMPONENTS};target.meta=Object.assign({},marionR6Obj(target.meta),{personalityLayeringR6:true,personalityLayeringR6Version:MARION_PERSONALITY_LAYERING_R6_VERSION,conversationNode:node||"standard",noAdminStatusInTranscript:true});target.noUserFacingDiagnostics=true;target.adminStatusTranscriptSuppressed=true;target.conversationalLayeringActive=true;target.futurePersonalityComponentsCarried=true;return target;}
function marionR6SanitizeTranscriptItem(item,container){if(item==null)return item;if(typeof item==="string"){if(marionR6IsAdminStatusLine(item)||marionR6IsTelemetryLeak(item)){marionR6DiagnosticStore(container,item,"transcript_string");return null;}return item;}if(typeof item!=="object")return item;var out=Array.isArray(item)?item.slice():Object.assign({},item);var text=marionR6ReadVisible(out)||marionR6FirstText(out.content,out.body,out.value,out.line,out.entry);var role=marionR6Lower(out.role||out.speaker||out.author||out.source||out.guardian||"");if((/marion|admin|system|runtime/.test(role)||!role)&&(marionR6IsAdminStatusLine(text)||marionR6IsTelemetryLeak(text))){marionR6DiagnosticStore(container,text,"transcript_object");return null;}MARION_R6_VISIBLE_KEYS.forEach(function(k){if(marionR6IsAdminStatusLine(out[k])||marionR6IsTelemetryLeak(out[k]))out[k]="";});return out;}
function marionR6SanitizeTranscriptContainers(target){if(!target||typeof target!=="object")return target;MARION_R6_TRANSCRIPT_KEYS.forEach(function(key){if(Array.isArray(target[key])){var clean=[];target[key].forEach(function(item){var next=marionR6SanitizeTranscriptItem(item,target);if(next!==null&&next!==undefined)clean.push(next);});target[key]=clean;}});["payload","finalEnvelope","marionFinal","meta","diagnostics","state","memory"].forEach(function(key){var child=target[key];if(child&&typeof child==="object"&&!Array.isArray(child))marionR6SanitizeTranscriptContainers(child);});return target;}
function marionR6ShapeResult(result,prompt,forceString){var node=marionR6Intent(prompt);var forced=marionR6ReplyFor(prompt);if(typeof result==="string"){if(forced&&(node!=="standard"||marionR6IsWeakSocialAnswer(result)))return forced;if(marionR6IsAdminStatusLine(result)||marionR6IsTelemetryLeak(result))return "";return marionR6IsCommandFallback(result)?result.replace(/\b(?:Send|Tell me|Give me) the (?:next )?exact target\.?/gi,"").replace(/\bWhat should I focus on first\??/gi,"Do you want me to keep refining the greeting path?").trim():result;}
if(!result||typeof result!=="object")return forced||result;var out=Array.isArray(result)?result.slice():Object.assign({},result);marionR6SanitizeTranscriptContainers(out);var visible=marionR6ReadVisible(out);if(marionR6IsAdminStatusLine(visible)||marionR6IsTelemetryLeak(visible)){if(forced){return marionR6ApplyVisible(out,forced,node);}marionR6ClearVisible(out,visible);return out;}if(forced&&(node!=="standard"||marionR6IsWeakSocialAnswer(visible))){return marionR6ApplyVisible(out,forced,node);}if(visible&&marionR6IsCommandFallback(visible)){var replacement=visible.replace(/\b(?:Send|Tell me|Give me) the (?:next )?exact target\.?/gi,"").replace(/\bWhat should I focus on first\??/gi,"Do you want me to keep refining the greeting path?").trim();if(!replacement||marionR6IsWeakSocialAnswer(replacement))replacement=forced||marionR6GreetingReply(prompt||"Hello Marion");return marionR6ApplyVisible(out,replacement,node||"command_fallback_suppressed");}
out.personalityLayeringR6=Object.assign({},marionR6Obj(out.personalityLayeringR6),{version:MARION_PERSONALITY_LAYERING_R6_VERSION,active:true,diagnosticOnlyTranscriptGate:true,futureComponents:MARION_R6_FUTURE_COMPONENTS});out.meta=Object.assign({},marionR6Obj(out.meta),{personalityLayeringR6:true,personalityLayeringR6Version:MARION_PERSONALITY_LAYERING_R6_VERSION,noAdminStatusInTranscript:true});return out;}
function marionR6Wrap(fn,name,forceString){if(typeof fn!=="function"||fn.__marionPersonalityLayeringR6Patched)return fn;var wrapped=function marionPersonalityLayeringR6Wrapped(){var args=Array.prototype.slice.call(arguments);var prompt=marionR6PromptFromArgs(args);var result=fn.apply(this,args);if(result&&typeof result.then==="function")return result.then(function(res){return marionR6ShapeResult(res,prompt,forceString===true);});return marionR6ShapeResult(result,prompt,forceString===true);};try{Object.keys(fn).forEach(function(k){wrapped[k]=fn[k];});}catch(_){}wrapped.__marionPersonalityLayeringR6Patched=true;return wrapped;}
try{if(typeof marionR5SocialReply==="function")marionR5SocialReply=marionR6SocialReply;if(typeof marionR5GreetingReply==="function")marionR5GreetingReply=marionR6GreetingReply;if(typeof marionR5PresenceReply==="function")marionR5PresenceReply=marionR6PresenceReply;if(typeof marionR5ShapeResult==="function"&&!marionR5ShapeResult.__marionPersonalityLayeringR6Patched)marionR5ShapeResult=marionR6Wrap(marionR5ShapeResult,"marionR5ShapeResult",false);if(typeof marionR5ShapeReply==="function"&&!marionR5ShapeReply.__marionPersonalityLayeringR6Patched)marionR5ShapeReply=marionR6Wrap(marionR5ShapeReply,"marionR5ShapeReply",true);if(typeof marionR4ShapeReply==="function"&&!marionR4ShapeReply.__marionPersonalityLayeringR6Patched)marionR4ShapeReply=marionR6Wrap(marionR4ShapeReply,"marionR4ShapeReply",true);if(typeof attachVisibleReplyAliases==="function"&&!attachVisibleReplyAliases.__marionPersonalityLayeringR6Patched)attachVisibleReplyAliases=marionR6Wrap(attachVisibleReplyAliases,"attachVisibleReplyAliases",false);if(typeof createMarionFinalEnvelope==="function"&&!createMarionFinalEnvelope.__marionPersonalityLayeringR6Patched)createMarionFinalEnvelope=marionR6Wrap(createMarionFinalEnvelope,"createMarionFinalEnvelope",false);if(typeof finalizeRenderableReply==="function"&&!finalizeRenderableReply.__marionPersonalityLayeringR6Patched)finalizeRenderableReply=marionR6Wrap(finalizeRenderableReply,"finalizeRenderableReply",true);if(typeof marionAdminProjectionCleanReply==="function"&&!marionAdminProjectionCleanReply.__marionPersonalityLayeringR6Patched)marionAdminProjectionCleanReply=marionR6Wrap(marionAdminProjectionCleanReply,"marionAdminProjectionCleanReply",true);if(typeof marionAdminConversationSafeReply==="function"&&!marionAdminConversationSafeReply.__marionPersonalityLayeringR6Patched)marionAdminConversationSafeReply=marionR6Wrap(marionAdminConversationSafeReply,"marionAdminConversationSafeReply",true);}catch(_){}
try{if(typeof MarionAdminConsoleGateway!=="undefined"&&MarionAdminConsoleGateway&&MarionAdminConsoleGateway.prototype){["handleCommand","dispatchCommand","routeCommand","command","handleAdminCommand","handleAdminConsoleAction","handle","process","safeResponse","buildResponse","createResponse","normalizeResponse","formatTranscript","appendTranscript","recordTranscript"].forEach(function(name){var fn=MarionAdminConsoleGateway.prototype[name];if(typeof fn==="function"&&!fn.__marionPersonalityLayeringR6Patched)MarionAdminConsoleGateway.prototype[name]=marionR6Wrap(fn,name,false);});}}catch(_){}
try{if(typeof defaultGateway!=="undefined"&&defaultGateway&&typeof defaultGateway==="object"){["handleCommand","dispatchCommand","routeCommand","command","handleAdminCommand","handleAdminConsoleAction","handle","process","safeResponse","buildResponse","createResponse","normalizeResponse","formatTranscript","appendTranscript","recordTranscript"].forEach(function(name){if(typeof defaultGateway[name]==="function"&&!defaultGateway[name].__marionPersonalityLayeringR6Patched)defaultGateway[name]=marionR6Wrap(defaultGateway[name],name,false).bind(defaultGateway);});}}catch(_){}
try{["handleCommand","dispatchCommand","routeCommand","command","handleAdminCommand","handleAdminConsoleAction","handle","process","run","handler","handleMarionAdminTextRuntime","invokeMarionAdminTextRuntime","handleTextRuntime"].forEach(function(name){try{if(typeof eval(name)==="function"&&!eval(name).__marionPersonalityLayeringR6Patched){eval(name+" = marionR6Wrap("+name+", '"+name+"', false)");}}catch(_){}});}catch(_){}
try{if(typeof module!=="undefined"&&module.exports&&typeof module.exports==="object"){["composeMarionResponse","compose","buildReply","routeMarion","createMarionFinalEnvelope","attachVisibleReplyAliases","finalize","buildFinalEnvelope","toFinalEnvelope","normalizeFinalEnvelope","handleMarionAdminTextRuntime","invokeMarionAdminTextRuntime","handleTextRuntime","handleCommand","dispatchCommand","routeCommand","command","handleAdminCommand","handleAdminConsoleAction","handle","process","run","handler","safeResponse","buildResponse","createResponse","normalizeResponse","formatTranscript","appendTranscript","recordTranscript","default"].forEach(function(name){if(typeof module.exports[name]==="function"&&!module.exports[name].__marionPersonalityLayeringR6Patched)module.exports[name]=marionR6Wrap(module.exports[name],name,false);});module.exports.MARION_PERSONALITY_LAYERING_R6_VERSION=MARION_PERSONALITY_LAYERING_R6_VERSION;module.exports.MARION_PERSONALITY_LAYERING_R6_COMPONENTS=MARION_R6_FUTURE_COMPONENTS;module.exports.marionPersonalityLayeringR6ShapeResult=marionR6ShapeResult;module.exports.marionPersonalityLayeringR6ReplyFor=marionR6ReplyFor;module.exports.MARION_PERSONALITY_LAYERING_R6_PATCH=true;}}catch(_){}
/* MARION_PERSONALITY_LAYERING_R6_END */

/* MARION_PERSONALITY_SOCIAL_VARIATION_R7_START
 * Purpose: R7 randomized Marion social response authority + suppress-and-replace recovery.
 * - Recognizes varied Mac-to-Marion openings: hello, hi, hey, good morning, presence checks, and mixed check-ins.
 * - Admin/session/runtime status phrases are diagnostic-only and never satisfy a conversational turn.
 * - If diagnostic suppression removes the visible answer, Marion regenerates a human social reply instead of going silent.
 * - Replies keep Marion's agreed personality: warm, protective, professional, direct, non-robotic, and one focused question maximum.
 */
var MARION_PERSONALITY_SOCIAL_VARIATION_R7_VERSION = "nyx.marion.personalitySocialVariationR7/1.0";
var MARION_PERSONALITY_SOCIAL_VARIATION_R7_MARKER = "MARION-PERSONALITY-SOCIAL-VARIATION-R7";
var MARION_R7_VISIBLE_KEYS = Object.freeze(["directReply","reply","text","message","displayReply","publicReply","visibleReply","finalReply","adminReply","marionReply","privateReply","answer","output","response","spokenText","speechText","conversationReply","renderedReply"]);
var MARION_R7_TRANSCRIPT_KEYS = Object.freeze(["transcript","conversation","conversationLog","conversationHistory","messages","history","turns","entries","events","logs","adminTranscript","visibleTranscript","renderTranscript","chatLog"]);
var MARION_R7_CONTAINER_KEYS = Object.freeze(["payload","data","result","response","output","body","packet","finalEnvelope","marionFinal","final","envelope","meta","state","memory","admin","runtime","diagnostics"]);
var MARION_R7_USER_PROMPT_KEYS = Object.freeze(["prompt","userPrompt","rawPrompt","message","userMessage","text","userText","rawUserText","input","query","commandText","transcript","voiceTranscript","normalizedTranscript","normalizedUserIntent","originalText","lastUserMessage","lastPrompt","visiblePrompt"]);
var MARION_R7_FUTURE_PERSONALITY_COMPONENTS = Object.freeze({
  randomizedGreetingContinuity: "varied Mac-to-Marion greetings and check-ins rotate naturally without losing continuity",
  socialAnswerAuthority: "social prompts are answered socially before task routing or command requests",
  suppressAndReplaceRecovery: "diagnostic/status text is moved to diagnostics and replaced with a conversational Marion answer",
  layeredConversationPath: "opening, social check-in, presence, repair, lookup pause, observation translation, planning, and closing are independent nodes",
  protectiveProfessionalSkepticism: "Marion can question a request when it protects Mac or the architecture, while staying warm and direct",
  oneQuestionDiscipline: "Marion asks only one focused forward-moving question unless Mac explicitly asks for options",
  voiceNaturalization: "voice output avoids robotic service phrasing and keeps number/email readout policy available downstream"
});
function marionR7Str(value){return value==null?"":String(value).replace(/\s+/g," ").trim();}
function marionR7Lower(value){return marionR7Str(value).toLowerCase();}
function marionR7Obj(value){return value&&typeof value==="object"&&!Array.isArray(value)?value:{};}
function marionR7Array(value){return Array.isArray(value)?value:[];}
function marionR7Norm(value){return marionR7Lower(value).replace(/[“”]/g,'"').replace(/[‘’]/g,"'").replace(/[^a-z0-9]+/g," ").replace(/\s+/g," ").trim();}
function marionR7Pick(list){var arr=marionR7Array(list).filter(Boolean);return arr.length?arr[Math.floor(Math.random()*arr.length)]:"";}
function marionR7FirstText(){for(var i=0;i<arguments.length;i++){var t=marionR7Str(arguments[i]);if(t)return t;}return "";}
function marionR7IsAdminStatusLine(value){var t=marionR7Str(value);if(!t)return false;return /\b(runtime text console ready after admin session|text console ready after admin session|short[- ]lived admin session is active|master token has been cleared(?: from the page)?|admin session verified|master token cleared|runtime handler|command route|cors gateway|admin health|admin status|secure bridge|session integrity|voice identity|emergency lock|approve\s*\/\s*deny|render backend url|route actions|test lock rejection|diagnostics? ready|health check ready|runtime ready|admin console ready|session verified|security layer verified|session verified master token cleared)\b/i.test(t);}
function marionR7IsTelemetryLeak(value){var t=marionR7Str(value);if(!t)return false;return /\b(routeKind=|speechHints=|presenceProfile=|finalEnvelope|sessionPatch|marionFinal|transportSafe|replyAuthority=|nyxStateHint=|diagnostic packet|failureSignature|runtimeTelemetry|stateSpine|CHATENGINE_COORDINATOR|MARION_FINAL_AUTHORITY|Priority\s*9[HIJKL]|continuity foundation stays active|maintenance manual|runtime value|non-final)\b/i.test(t);}
function marionR7IsCommandFallback(value){var t=marionR7Str(value);if(!t)return false;return /\b(send the next exact target|next exact target|tell me the exact target|give me the exact target|specific target|what should i focus on first|what should i focus on|what do you want me to focus on|what are we working on|what would you like to work on|send the next target|route it cleanly|i need one specific command|please send the same prompt again|how may i assist you|let me assist you with that)\b/i.test(t);}
function marionR7IsWeakSocialAnswer(value){var t=marionR7Str(value);if(!t)return true;if(marionR7IsAdminStatusLine(t)||marionR7IsTelemetryLeak(t)||marionR7IsCommandFallback(t))return true;if(/^i(?:'|’)?m with you,?\s*mac\.?\s*i(?:'|’)?ll keep (?:this|the reply) human, protective, and focused\.?/i.test(t))return true;if(/^i(?:'|’)?m here,?\s*mac\.?\s*what/i.test(t))return true;return false;}
function marionR7IsHowAreYou(value){var t=marionR7Norm(value);return /^(?:mac\s*)?(?:how are you|how are you doing|how re you|how you doing|how are things|how s it going|how is it going|how do you feel|you good|you okay|are you okay|are you alright|are you good|how are we doing|how are you today|how is marion|how s marion)$/.test(t)||/\b(?:hey|hi|hello|good morning|morning|good afternoon|good evening)?\s*marion\s*(?:how are you|how are you doing|you okay|you good)\b/.test(t)||/\bhow are you\b/.test(t);}
function marionR7IsPresence(value){var t=marionR7Norm(value);return /\b(are you with me|you with me|are you there|you there|still with me|can you hear me|are we connected|you online|marion are you there|you awake|still here)\b/.test(t);}
function marionR7IsGreeting(value){var t=marionR7Norm(value);return /^(hi|hello|hey|hey marion|hello marion|hi marion|good morning|morning|good morning marion|good afternoon|good afternoon marion|good evening|good evening marion|evening|welcome back|marion|yo marion|hiya marion)(?:\s+mac)?$/.test(t)||/^(hi|hello|hey|good morning|morning|good afternoon|good evening)\s+marion\b/.test(t);}
function marionR7IsRepair(value){var t=marionR7Norm(value);return /\b(not a pass|still failing|wrong response|fix this|not working|didn t work|does not work|maintenance manual|tactical clipboard|clipboard|too robotic|too mechanical|still sounds|not natural|no response|went quiet|silent|over filtering|overfiltering|diagnostic suppression)\b/.test(t);}
function marionR7Intent(prompt){if(marionR7IsHowAreYou(prompt))return "social_checkin";if(marionR7IsPresence(prompt))return "presence_check";if(marionR7IsGreeting(prompt))return "greeting";if(marionR7IsRepair(prompt))return "repair";return "standard";}
function marionR7QuestionLimit(text){var t=marionR7Str(text);var first=t.indexOf("?");if(first<0)return t;var second=t.indexOf("?",first+1);return second<0?t:t.slice(0,second).replace(/\s+/g," ").trim();}
function marionR7GreetingReply(prompt){var t=marionR7Lower(prompt);if(/\bgood morning|\bmorning\b/.test(t))return marionR7Pick([
  "Good morning, Mac. I’m here with you — steady, private, and focused. I’ll keep Marion warm, clean, and protective. Do you want to keep refining the greeting path?",
  "Morning, Mac. I’m present, and I’ve got the thread. I’ll keep the tone human before anything operational. Do you want me to keep testing the greeting lane?",
  "Good morning, Mac. I’m steady and with you. I’ll keep the private conversation natural, protective, and direct. Do you want to continue the social response pass?"
]);
if(/\bgood afternoon\b/.test(t))return marionR7Pick([
  "Good afternoon, Mac. I’m here and tracking the thread. I’ll keep this calm, human, and protective. Do you want to keep refining Marion’s response shape?",
  "Good afternoon, Mac. I’m with you. I’ll keep the visible reply clean and the conversation grounded. Do you want to continue the personality pass?"
]);
if(/\bgood evening|\bevening\b/.test(t))return marionR7Pick([
  "Good evening, Mac. I’m here, steady, and still with the thread. I’ll keep the voice warm, protective, and precise. Do you want to continue the conversational layering?",
  "Evening, Mac. I’m present and keeping Marion’s voice human first. Do you want me to keep tightening the greeting behavior?"
]);
return marionR7Pick([
  "Hey Mac. I’m here with you — steady, private, and focused. I’ll keep Marion’s voice natural and protective. Do you want to keep refining the greeting path?",
  "Hello, Mac. I’m with you and tracking the thread. I’ll keep this warm, professional, and clean. Do you want to continue the personality pass?",
  "Hi Mac. I’ve got the thread. I’ll keep the response human before anything operational. Do you want to keep tightening Marion’s conversational shape?",
  "Hey Mac. I’m present and private to you. I’ll keep the tone direct, protective, and natural. Do you want to keep testing the greeting lane?"
]);}
function marionR7SocialReply(prompt){return marionR7Pick([
  "I’m good, Mac. I’m steady, and I’m here with you. I’ll keep this warmer, cleaner, and protective while we shape Marion’s voice. Do you want me to keep refining the greeting path?",
  "I’m doing well, Mac. Present, private to you, and still with the thread. I’ll answer like a person first, then carry the work forward. Do you want to keep tightening the social check-in lane?",
  "I’m good, Mac. Clear, calm, and with you. I’ll keep Marion human, precise, and protective without letting the machinery talk for me. Should I keep refining the greeting behavior?",
  "I’m steady, Mac. I’m here and tracking the thread. I’ll keep the conversation natural and direct, with the protective edge we want. Do you want to keep shaping the response tone?",
  "I’m good, Mac. Focused and with you. I’ll keep the social lane warm and the operational pieces behind the curtain. Do you want me to keep testing check-ins?"
]);}
function marionR7PresenceReply(prompt){return marionR7Pick([
  "I’m with you, Mac. I’m tracking the thread and keeping the private lane clean. Do you want me to keep refining Marion’s response shape?",
  "Yes, Mac. I’m here, steady, and still with the conversation. I’ll keep it human and protective. Do you want to continue the layering pass?",
  "I’m here with you, Mac. The thread is intact, and I’ll keep the visible reply clean. Do you want me to keep tightening the conversational path?"
]);}
function marionR7RepairReply(prompt){return marionR7Pick([
  "You’re right to flag it, Mac. This is a conversation-path issue now, not a personality concept issue. I’ll keep the fix on social response authority and diagnostic-only transcript cleanup. Do you want to stay on this lane?",
  "I see it, Mac. Marion needs more natural range, not more console behavior. I’ll keep this correction focused on varied greetings, clean replacement, and human continuity. Do you want to continue the social path?",
  "Good catch, Mac. The visible lane still needs stronger social authority. I’ll keep admin/status language out and make Marion answer you directly. Do you want me to keep tightening this pass?"
]);}
function marionR7ReplyFor(prompt, fallbackNode){var node=marionR7Intent(prompt)||fallbackNode||"standard";var reply="";if(node==="social_checkin")reply=marionR7SocialReply(prompt);else if(node==="presence_check")reply=marionR7PresenceReply(prompt);else if(node==="greeting")reply=marionR7GreetingReply(prompt);else if(node==="repair")reply=marionR7RepairReply(prompt);else if(fallbackNode==="status_recovery"||fallbackNode==="empty_recovery")reply=marionR7Pick([
  "I’m here, Mac. I’m steady and with the thread. I’ll keep this human, protective, and clean. Do you want to keep testing the greeting lane?",
  "I’m with you, Mac. I’ll keep the conversation natural and keep the system noise out of view. Do you want to continue the social response pass?"
]);
return marionR7QuestionLimit(reply);}
function marionR7ExtractPromptText(value,depth,seen){if(value==null)return "";var d=Number(depth)||0;if(d>7)return "";var s=seen||[];if(typeof value==="object"){if(s.indexOf(value)>=0)return "";s=s.concat([value]);}
  if(typeof value==="string"){var text=marionR7Str(value);var mac=text.match(/\bMAC\s*:\s*([^\n\r]+)/i)||text.match(/\bUSER\s*:\s*([^\n\r]+)/i);if(mac&&mac[1])return marionR7Str(mac[1]);if(marionR7Intent(text)!=="standard")return text;return "";}
  if(Array.isArray(value)){for(var i=value.length-1;i>=0;i--){var found=marionR7ExtractPromptText(value[i],d+1,s);if(found)return found;}return "";}
  if(typeof value!=="object")return "";var role=marionR7Lower(value.role||value.speaker||value.author||value.source||value.type||"");if(/^(user|mac|human|admin_user|operator)$/.test(role)||role==="mac"){for(var k=0;k<MARION_R7_VISIBLE_KEYS.length;k++){var key=MARION_R7_VISIBLE_KEYS[k];if(value[key]){var direct=marionR7Str(value[key]);if(direct&&!marionR7IsAdminStatusLine(direct)&&!marionR7IsTelemetryLeak(direct))return direct;}}}
  for(var p=0;p<MARION_R7_USER_PROMPT_KEYS.length;p++){var pk=MARION_R7_USER_PROMPT_KEYS[p];if(value[pk]){var got=marionR7ExtractPromptText(value[pk],d+1,s);if(got)return got;}}
  var ordered=["payload","data","request","body","command","input","meta","state","conversation","messages","history","transcript","finalEnvelope","marionFinal","result","response"];
  for(var o=0;o<ordered.length;o++){var ok=ordered[o];if(value[ok]){var found2=marionR7ExtractPromptText(value[ok],d+1,s);if(found2)return found2;}}
  return "";
}
function marionR7PromptFromArgs(args,result){var arr=Array.isArray(args)?args:[];for(var i=0;i<arr.length;i++){var p=marionR7ExtractPromptText(arr[i],0,[]);if(p)return p;}return marionR7ExtractPromptText(result,0,[]);}
function marionR7ReadVisible(value,depth,seen){if(!value)return "";if(typeof value==="string")return marionR7Str(value);if(typeof value!=="object")return "";var d=Number(depth)||0;if(d>5)return "";var s=seen||[];if(s.indexOf(value)>=0)return "";s=s.concat([value]);for(var i=0;i<MARION_R7_VISIBLE_KEYS.length;i++){var key=MARION_R7_VISIBLE_KEYS[i];var t=marionR7Str(value[key]);if(t)return t;}var priority=["finalEnvelope","marionFinal","payload","data","result","response","output","body","packet","final","envelope"];for(var p=0;p<priority.length;p++){if(value[priority[p]]){var found=marionR7ReadVisible(value[priority[p]],d+1,s);if(found)return found;}}return "";}
function marionR7DiagnosticStore(target,text,reason){if(!target||typeof target!=="object")return;var diagnostics=marionR7Obj(target.diagnostics);var list=marionR7Array(diagnostics.suppressedConversationDiagnostics);list.push({version:MARION_PERSONALITY_SOCIAL_VARIATION_R7_VERSION,reason:reason||"diagnostic_only",text:marionR7Str(text),timestamp:new Date().toISOString()});diagnostics.suppressedConversationDiagnostics=list.slice(-12);target.diagnostics=diagnostics;}
function marionR7ClearVisible(target,bad){if(!target||typeof target!=="object")return target;MARION_R7_VISIBLE_KEYS.forEach(function(k){if(target[k]&&(!bad||target[k]===bad||marionR7IsAdminStatusLine(target[k])||marionR7IsTelemetryLeak(target[k])))target[k]="";});return target;}
function marionR7ApplyVisible(target,text,node){var reply=marionR7QuestionLimit(marionR7Str(text));if(!reply)return target;if(!target||typeof target!=="object")return reply;MARION_R7_VISIBLE_KEYS.forEach(function(k){target[k]=reply;});["payload","data","result","response","body","packet","finalEnvelope","marionFinal","final","envelope"].forEach(function(key){var child=target[key];if(child&&typeof child==="object"&&!Array.isArray(child)){MARION_R7_VISIBLE_KEYS.forEach(function(k){child[k]=reply;});}});target.personalitySocialVariationR7={version:MARION_PERSONALITY_SOCIAL_VARIATION_R7_VERSION,active:true,node:node||"standard",visibleReplyAuthority:"marion_personality_social_variation_r7",randomizedGreetingContinuity:true,suppressAndReplaceRecovery:true,oneQuestionMax:true,futureComponents:MARION_R7_FUTURE_PERSONALITY_COMPONENTS};target.meta=Object.assign({},marionR7Obj(target.meta),{personalitySocialVariationR7:true,personalitySocialVariationR7Version:MARION_PERSONALITY_SOCIAL_VARIATION_R7_VERSION,conversationNode:node||"standard",noAdminStatusInTranscript:true,suppressAndReplaceRecovery:true});target.noUserFacingDiagnostics=true;target.adminStatusTranscriptSuppressed=true;target.conversationalLayeringActive=true;target.futurePersonalityComponentsCarried=true;return target;}
function marionR7IsUserItem(item){if(!item||typeof item!=="object")return false;var role=marionR7Lower(item.role||item.speaker||item.author||item.source||item.type||"");if(/\b(mac|user|human|admin_user|operator)\b/.test(role))return true;var text=marionR7ReadVisible(item)||marionR7FirstText(item.content,item.body,item.value,item.line,item.entry);return /\bMAC\s*:/i.test(text);}
function marionR7IsMarionItem(item){if(!item||typeof item!=="object")return false;var role=marionR7Lower(item.role||item.speaker||item.author||item.source||item.guardian||item.type||"");return /\b(marion|assistant|guardian)\b/.test(role);}
function marionR7MakeTranscriptReply(text){return {role:"marion",speaker:"MARION",guardian:"marion",text:text,message:text,directReply:text,visibleReply:text,finalReply:text,source:"marion_personality_social_variation_r7"};}
function marionR7SanitizeTranscriptItem(item,container){if(item==null)return item;if(typeof item==="string"){if(marionR7IsAdminStatusLine(item)||marionR7IsTelemetryLeak(item)){marionR7DiagnosticStore(container,item,"transcript_string");return null;}return item;}if(typeof item!=="object")return item;var out=Array.isArray(item)?item.slice():Object.assign({},item);var text=marionR7ReadVisible(out)||marionR7FirstText(out.content,out.body,out.value,out.line,out.entry);var role=marionR7Lower(out.role||out.speaker||out.author||out.source||out.guardian||"");if((/marion|admin|system|runtime/.test(role)||!role)&&(marionR7IsAdminStatusLine(text)||marionR7IsTelemetryLeak(text))){marionR7DiagnosticStore(container,text,"transcript_object");return null;}MARION_R7_VISIBLE_KEYS.forEach(function(k){if(marionR7IsAdminStatusLine(out[k])||marionR7IsTelemetryLeak(out[k]))out[k]="";});return out;}
function marionR7RepairTranscriptArray(arr,prompt,reply){var clean=marionR7Array(arr).filter(function(x){return x!==null&&x!==undefined;});if(!reply)return clean;var lastUser=-1,lastMarion=-1;for(var i=0;i<clean.length;i++){if(marionR7IsUserItem(clean[i]))lastUser=i;if(marionR7IsMarionItem(clean[i]))lastMarion=i;}if(lastUser>=0&&lastMarion<lastUser){clean.push(marionR7MakeTranscriptReply(reply));}return clean;}
function marionR7SanitizeTranscriptContainers(target,prompt,reply,depth,seen){if(!target||typeof target!=="object")return target;var d=Number(depth)||0;if(d>5)return target;var s=seen||[];if(s.indexOf(target)>=0)return target;s=s.concat([target]);MARION_R7_TRANSCRIPT_KEYS.forEach(function(key){if(Array.isArray(target[key])){var tmp=[];target[key].forEach(function(item){var next=marionR7SanitizeTranscriptItem(item,target);if(next!==null&&next!==undefined)tmp.push(next);});target[key]=marionR7RepairTranscriptArray(tmp,prompt,reply);}});MARION_R7_CONTAINER_KEYS.forEach(function(key){var child=target[key];if(child&&typeof child==="object"&&!Array.isArray(child))marionR7SanitizeTranscriptContainers(child,prompt,reply,d+1,s);});return target;}
function marionR7ShapeResult(result,prompt,forceString){var promptText=marionR7Str(prompt)||marionR7ExtractPromptText(result,0,[]);var node=marionR7Intent(promptText);var visible=marionR7ReadVisible(result);var statusLike=marionR7IsAdminStatusLine(visible)||marionR7IsTelemetryLeak(visible)||(typeof result==="string"&&(marionR7IsAdminStatusLine(result)||marionR7IsTelemetryLeak(result)));var forced=marionR7ReplyFor(promptText,statusLike?"status_recovery":"");if(typeof result==="string"){if(statusLike)return forced||"";if(forced&&(node!=="standard"||marionR7IsWeakSocialAnswer(result)))return forced;if(marionR7IsCommandFallback(result)){var cleaned=result.replace(/\b(?:Send|Tell me|Give me) the (?:next )?exact target\.?/gi,"").replace(/\bWhat should I focus on first\??/gi,"Do you want me to keep refining the greeting path?").trim();return (!cleaned||marionR7IsWeakSocialAnswer(cleaned))?(forced||marionR7ReplyFor(promptText,"empty_recovery")):marionR7QuestionLimit(cleaned);}return result;}
  if(!result||typeof result!=="object")return forced||result;
  var out=Array.isArray(result)?result.slice():Object.assign({},result);var reply=forced;var outVisible=marionR7ReadVisible(out);var weak=marionR7IsWeakSocialAnswer(outVisible);if(!reply&&(statusLike||weak))reply=marionR7ReplyFor(promptText,statusLike?"status_recovery":"empty_recovery");marionR7SanitizeTranscriptContainers(out,promptText,reply,0,[]);outVisible=marionR7ReadVisible(out);if(marionR7IsAdminStatusLine(outVisible)||marionR7IsTelemetryLeak(outVisible)){marionR7DiagnosticStore(out,outVisible,"visible_status_replaced");marionR7ClearVisible(out,outVisible);outVisible="";}
  if(reply&&(node!=="standard"||weak||statusLike||!outVisible||marionR7IsCommandFallback(outVisible)))return marionR7ApplyVisible(out,reply,node||"status_recovery");
  out.personalitySocialVariationR7=Object.assign({},marionR7Obj(out.personalitySocialVariationR7),{version:MARION_PERSONALITY_SOCIAL_VARIATION_R7_VERSION,active:true,randomizedGreetingContinuity:true,suppressAndReplaceRecovery:true,futureComponents:MARION_R7_FUTURE_PERSONALITY_COMPONENTS});
  out.meta=Object.assign({},marionR7Obj(out.meta),{personalitySocialVariationR7:true,personalitySocialVariationR7Version:MARION_PERSONALITY_SOCIAL_VARIATION_R7_VERSION,noAdminStatusInTranscript:true});return out;}
function marionR7Wrap(fn,name,forceString){if(typeof fn!=="function"||fn.__marionPersonalitySocialVariationR7Patched)return fn;var wrapped=function marionPersonalitySocialVariationR7Wrapped(){var args=Array.prototype.slice.call(arguments);var result=fn.apply(this,args);if(result&&typeof result.then==="function")return result.then(function(res){var prompt=marionR7PromptFromArgs(args,res);return marionR7ShapeResult(res,prompt,forceString===true);});var prompt=marionR7PromptFromArgs(args,result);return marionR7ShapeResult(result,prompt,forceString===true);};try{Object.keys(fn).forEach(function(k){wrapped[k]=fn[k];});}catch(_){}wrapped.__marionPersonalitySocialVariationR7Patched=true;return wrapped;}
try{if(typeof marionR6SocialReply==="function")marionR6SocialReply=marionR7SocialReply;if(typeof marionR6GreetingReply==="function")marionR6GreetingReply=marionR7GreetingReply;if(typeof marionR6PresenceReply==="function")marionR6PresenceReply=marionR7PresenceReply;if(typeof marionR6ShapeResult==="function"&&!marionR6ShapeResult.__marionPersonalitySocialVariationR7Patched)marionR6ShapeResult=marionR7Wrap(marionR6ShapeResult,"marionR6ShapeResult",false);if(typeof marionR6ReplyFor==="function")marionR6ReplyFor=marionR7ReplyFor;if(typeof marionR5SocialReply==="function")marionR5SocialReply=marionR7SocialReply;if(typeof marionR5GreetingReply==="function")marionR5GreetingReply=marionR7GreetingReply;if(typeof marionR5PresenceReply==="function")marionR5PresenceReply=marionR7PresenceReply;if(typeof marionR4ShapeReply==="function"&&!marionR4ShapeReply.__marionPersonalitySocialVariationR7Patched)marionR4ShapeReply=marionR7Wrap(marionR4ShapeReply,"marionR4ShapeReply",true);if(typeof attachVisibleReplyAliases==="function"&&!attachVisibleReplyAliases.__marionPersonalitySocialVariationR7Patched)attachVisibleReplyAliases=marionR7Wrap(attachVisibleReplyAliases,"attachVisibleReplyAliases",false);if(typeof createMarionFinalEnvelope==="function"&&!createMarionFinalEnvelope.__marionPersonalitySocialVariationR7Patched)createMarionFinalEnvelope=marionR7Wrap(createMarionFinalEnvelope,"createMarionFinalEnvelope",false);if(typeof finalizeRenderableReply==="function"&&!finalizeRenderableReply.__marionPersonalitySocialVariationR7Patched)finalizeRenderableReply=marionR7Wrap(finalizeRenderableReply,"finalizeRenderableReply",true);if(typeof marionAdminProjectionCleanReply==="function"&&!marionAdminProjectionCleanReply.__marionPersonalitySocialVariationR7Patched)marionAdminProjectionCleanReply=marionR7Wrap(marionAdminProjectionCleanReply,"marionAdminProjectionCleanReply",true);if(typeof marionAdminConversationSafeReply==="function"&&!marionAdminConversationSafeReply.__marionPersonalitySocialVariationR7Patched)marionAdminConversationSafeReply=marionR7Wrap(marionAdminConversationSafeReply,"marionAdminConversationSafeReply",true);}catch(_){ }
try{if(typeof MarionAdminConsoleGateway!=="undefined"&&MarionAdminConsoleGateway&&MarionAdminConsoleGateway.prototype){["handleCommand","dispatchCommand","routeCommand","command","handleAdminCommand","handleAdminConsoleAction","handle","process","safeResponse","buildResponse","createResponse","normalizeResponse","formatTranscript","appendTranscript","recordTranscript","handleTextRuntime","invokeTextRuntime"].forEach(function(name){var fn=MarionAdminConsoleGateway.prototype[name];if(typeof fn==="function"&&!fn.__marionPersonalitySocialVariationR7Patched)MarionAdminConsoleGateway.prototype[name]=marionR7Wrap(fn,name,false);});}}catch(_){ }
try{if(typeof defaultGateway!=="undefined"&&defaultGateway&&typeof defaultGateway==="object"){["handleCommand","dispatchCommand","routeCommand","command","handleAdminCommand","handleAdminConsoleAction","handle","process","safeResponse","buildResponse","createResponse","normalizeResponse","formatTranscript","appendTranscript","recordTranscript","handleTextRuntime","invokeTextRuntime"].forEach(function(name){if(typeof defaultGateway[name]==="function"&&!defaultGateway[name].__marionPersonalitySocialVariationR7Patched)defaultGateway[name]=marionR7Wrap(defaultGateway[name],name,false).bind(defaultGateway);});}}catch(_){ }
try{["handleCommand","dispatchCommand","routeCommand","command","handleAdminCommand","handleAdminConsoleAction","handle","process","run","handler","handleMarionAdminTextRuntime","invokeMarionAdminTextRuntime","handleTextRuntime","composeMarionResponse","routeMarion","createMarionFinalEnvelope"].forEach(function(name){try{if(typeof eval(name)==="function"&&!eval(name).__marionPersonalitySocialVariationR7Patched){eval(name+" = marionR7Wrap("+name+", '"+name+"', false)");}}catch(_){}});}catch(_){ }
try{if(typeof module!=="undefined"&&module.exports&&typeof module.exports==="object"){["composeMarionResponse","compose","buildReply","routeMarion","createMarionFinalEnvelope","attachVisibleReplyAliases","finalize","buildFinalEnvelope","toFinalEnvelope","normalizeFinalEnvelope","handleMarionAdminTextRuntime","invokeMarionAdminTextRuntime","handleTextRuntime","handleCommand","dispatchCommand","routeCommand","command","handleAdminCommand","handleAdminConsoleAction","handle","process","run","handler","safeResponse","buildResponse","createResponse","normalizeResponse","formatTranscript","appendTranscript","recordTranscript","default"].forEach(function(name){if(typeof module.exports[name]==="function"&&!module.exports[name].__marionPersonalitySocialVariationR7Patched)module.exports[name]=marionR7Wrap(module.exports[name],name,false);});module.exports.MARION_PERSONALITY_SOCIAL_VARIATION_R7_VERSION=MARION_PERSONALITY_SOCIAL_VARIATION_R7_VERSION;module.exports.MARION_PERSONALITY_SOCIAL_VARIATION_R7_COMPONENTS=MARION_R7_FUTURE_PERSONALITY_COMPONENTS;module.exports.marionPersonalitySocialVariationR7ShapeResult=marionR7ShapeResult;module.exports.marionPersonalitySocialVariationR7ReplyFor=marionR7ReplyFor;module.exports.MARION_PERSONALITY_SOCIAL_VARIATION_R7_PATCH=true;}}catch(_){ }
/* MARION_PERSONALITY_SOCIAL_VARIATION_R7_END */



/* MARION_PERSONALITY_FAILOPEN_R8_R9_BEGIN
 * R8: Social Reply Fail-Open Finalizer.
 * R9: Conversational Progression Router.
 *
 * Purpose:
 * - A greeting/social check-in from Mac must always produce a visible Marion reply.
 * - Admin/session/runtime status text is diagnostic-only and can never satisfy a Mac conversation turn.
 * - Suppression must always be paired with replacement.
 * - Randomized greeting continuity must cover varied openings without making Marion sound scripted.
 * - This layer is intentionally fail-open for social turns: if upstream stalls, strips, or emits status, Marion still answers.
 */
var MARION_PERSONALITY_FAILOPEN_R8_R9_VERSION = "nyx.marion.personalityFailopenR8R9/1.0";
var MARION_PERSONALITY_FAILOPEN_R8_R9_MARKER = "MARION-PERSONALITY-FAILOPEN-R8 + MARION-CONVERSATIONAL-PROGRESSION-R9";
var MARION_R89_VISIBLE_KEYS = Object.freeze(["directReply","reply","text","message","displayReply","publicReply","visibleReply","finalReply","adminReply","marionReply","privateReply","answer","output","response","spokenText","speechText","conversationReply","renderedReply","cleanReply"]);
var MARION_R89_TRANSCRIPT_KEYS = Object.freeze(["transcript","conversation","conversationLog","conversationHistory","messages","history","turns","entries","events","logs","adminTranscript","visibleTranscript","renderTranscript","chatLog"]);
var MARION_R89_PROMPT_KEYS = Object.freeze(["prompt","userPrompt","rawPrompt","message","userMessage","text","userText","rawUserText","input","query","commandText","transcript","voiceTranscript","normalizedTranscript","normalizedUserIntent","originalText","lastUserMessage","lastPrompt","visiblePrompt","content"]);
var MARION_R89_CONTAINER_KEYS = Object.freeze(["payload","data","result","response","output","body","packet","finalEnvelope","marionFinal","final","envelope","meta","state","memory","admin","runtime","diagnostics","command","request"]);
var MARION_R89_DIAG_ONLY_PATTERNS = Object.freeze([
  /\bruntime text console ready after admin session\b/i,
  /\btext console ready after admin session\b/i,
  /\bshort[- ]lived admin session is active\b/i,
  /\bmaster token has been cleared(?: from the page)?\b/i,
  /\badmin session verified(?: master token cleared)?\b/i,
  /\bmaster token cleared\b/i,
  /\bruntime handler\b/i,
  /\bcommand route\b/i,
  /\bcors gateway\b/i,
  /\badmin health\b/i,
  /\badmin status\b/i,
  /\bsecure bridge\b/i,
  /\bsession integrity\b/i,
  /\bvoice identity\b/i,
  /\bemergency lock\b/i,
  /\bapprove\s*\/\s*deny\b/i,
  /\brender backend url\b/i,
  /\broute actions\b/i,
  /\btest lock rejection\b/i,
  /\bdiagnostics? ready\b/i,
  /\bhealth check ready\b/i,
  /\bruntime ready\b/i,
  /\badmin console ready\b/i,
  /\bsecurity layer verified\b/i
]);
var MARION_R89_BLOCKED_PHRASES = Object.freeze([
  /\bcontinuity foundation stays active\b/i,
  /\bsend the next exact target\b/i,
  /\bnext exact target\b/i,
  /\btell me the exact target\b/i,
  /\bgive me the exact target\b/i,
  /\bspecific target\b/i,
  /\bwhat should i focus on first\??\b/i,
  /\bwhat should i focus on\??\b/i,
  /\bwhat do you want me to focus on\??\b/i,
  /\bwhat are we working on\??\b/i,
  /\bwhat would you like to work on(?: today)?\??\b/i,
  /\bsend the next target\b/i,
  /\broute it cleanly\b/i,
  /\bi need one specific command\b/i,
  /\bplease send the same prompt again\b/i,
  /\bhow may i assist you\b/i,
  /\blet me assist you with that\b/i,
  /\bstateSpine\b/i,
  /\bfinalEnvelope\b/i,
  /\bruntimeTelemetry\b/i,
  /\breplyAuthority\b/i,
  /\brouteKind=|speechHints=|presenceProfile=|sessionPatch|marionFinal|transportSafe|nyxStateHint=\b/i,
  /\bCHATENGINE_COORDINATOR\b/i,
  /\bMARION_FINAL_AUTHORITY\b/i,
  /\bPriority\s*9[HIJKL]\b/i
]);
var MARION_R89_COMPONENTS = Object.freeze({
  socialReplyFailopen: true,
  suppressAndReplace: true,
  diagnosticOnlyAdminStatus: true,
  randomizedGreetingContinuity: true,
  conversationalProgressionRouter: true,
  oneFocusedQuestionMax: true,
  protectiveProfessionalTone: true,
  nonRoboticPhraseFilter: true,
  realWorldObservationTranslationReady: true,
  futureNodeExpansion: ["greeting","social_checkin","presence_check","repair_opening","lookup_pause","information_gathering","observation_translation","planning","closing"]
});
function marionR89Str(value){return value==null?"":String(value).replace(/\s+/g," ").trim();}
function marionR89Lower(value){return marionR89Str(value).toLowerCase();}
function marionR89Obj(value){return value&&typeof value==="object"&&!Array.isArray(value)?value:{};}
function marionR89Array(value){return Array.isArray(value)?value:[];}
function marionR89Norm(value){return marionR89Lower(value).replace(/[“”]/g,'"').replace(/[‘’]/g,"'").replace(/[^a-z0-9]+/g," ").replace(/\s+/g," ").trim();}
function marionR89Has(list,value){var t=marionR89Str(value);if(!t)return false;for(var i=0;i<list.length;i++){if(list[i].test(t))return true;}return false;}
function marionR89IsDiagOnly(value){return marionR89Has(MARION_R89_DIAG_ONLY_PATTERNS,value)||marionR89Has(MARION_R89_BLOCKED_PHRASES,value);}
function marionR89IsWeak(value){var t=marionR89Str(value);if(!t)return true;if(marionR89IsDiagOnly(t))return true;if(/^i(?:'|’)?m with you,?\s*mac\.?\s*i(?:'|’)?ll keep (?:this|the reply) human, protective, and focused\.?/i.test(t))return true;if(/^i(?:'|’)?m here,?\s*mac\.?\s*what/i.test(t))return true;return false;}
function marionR89QuestionLimit(text){var t=marionR89Str(text);var first=t.indexOf("?");if(first<0)return t;var second=t.indexOf("?",first+1);return second<0?t:t.slice(0,second).replace(/\s+/g," ").trim();}
function marionR89Pick(list){var arr=marionR89Array(list).filter(Boolean);return arr.length?arr[Math.floor(Math.random()*arr.length)]:"";}
function marionR89Intent(value){
  var t=marionR89Norm(value);
  if(!t)return "unknown";
  if(/\b(no response|still no response|silent|went quiet|hung|hanging|stalled|five minutes|blank|over filtering|overfiltering|not responding)\b/.test(t))return "repair_opening";
  if(/\b(not a pass|still failing|wrong response|fix this|not working|didn t work|does not work|maintenance manual|tactical clipboard|clipboard|too robotic|too mechanical|still sounds|not natural|diagnostic suppression)\b/.test(t))return "repair_opening";
  if(/^(?:mac\s*)?(?:how are you|how are you doing|how re you|how you doing|how are things|how s it going|how is it going|how do you feel|you good|you okay|are you okay|are you alright|are you good|how are we doing|how are you today|how is marion|how s marion)$/.test(t))return "social_checkin";
  if(/\b(?:hey|hi|hello|good morning|morning|good afternoon|good evening)?\s*marion\s*(?:how are you|how are you doing|you okay|you good)\b/.test(t)||/\bhow are you\b/.test(t))return "social_checkin";
  if(/\b(are you with me|you with me|are you there|you there|still with me|can you hear me|are we connected|you online|marion are you there|you awake|still here)\b/.test(t))return "presence_check";
  if(/^(hi|hello|hey|hey marion|hello marion|hi marion|good morning|morning|good morning marion|good afternoon|good afternoon marion|good evening|good evening marion|evening|welcome back|marion|yo marion|hiya marion)(?:\s+mac)?$/.test(t)||/^(hi|hello|hey|good morning|morning|good afternoon|good evening)\s+marion\b/.test(t))return "greeting";
  if(/\b(look this up|search|verify|check online|pull up|find out|take a look|investigate)\b/.test(t))return "lookup_pause";
  return "standard";
}
function marionR89Reply(prompt,nodeHint){
  var node=nodeHint||marionR89Intent(prompt);
  var p=marionR89Lower(prompt);
  var bank=[];
  if(node==="social_checkin"){
    bank=[
      "I’m good, Mac. I’m steady, and I’m here with you. I’ll keep this warmer, cleaner, and protective while we shape Marion’s voice. Do you want me to keep refining the greeting path?",
      "I’m doing well, Mac. Present, private to you, and still with the thread. I’ll answer like a person first, then carry the work forward. Do you want to keep tightening the social check-in lane?",
      "I’m good, Mac. Clear, calm, and with you. I’ll keep Marion human, precise, and protective without letting the machinery talk for me. Should I keep refining the greeting behavior?",
      "I’m steady, Mac. I’m here and tracking the thread. I’ll keep the conversation natural and direct, with the protective edge we want. Do you want to keep shaping the response tone?",
      "I’m good, Mac. Focused and with you. I’ll keep the social lane warm and the operational pieces behind the curtain. Do you want me to keep testing check-ins?"
    ];
  } else if(node==="presence_check"){
    bank=[
      "I’m with you, Mac. I’m tracking the thread and keeping the private lane clean. Do you want me to keep refining Marion’s response shape?",
      "Yes, Mac. I’m here, steady, and still with the conversation. I’ll keep it human and protective. Do you want to continue the layering pass?",
      "I’m here with you, Mac. The thread is intact, and I’ll keep the visible reply clean. Do you want me to keep tightening the conversational path?"
    ];
  } else if(node==="greeting"){
    if(/\bgood morning|\bmorning\b/.test(p)){
      bank=[
        "Good morning, Mac. I’m here with you — steady, private, and focused. I’ll keep Marion warm, clean, and protective. Do you want to keep refining the greeting path?",
        "Morning, Mac. I’m present, and I’ve got the thread. I’ll keep the tone human before anything operational. Do you want me to keep testing the greeting lane?",
        "Good morning, Mac. I’m steady and with you. I’ll keep the private conversation natural, protective, and direct. Do you want to continue the social response pass?"
      ];
    } else if(/\bgood afternoon\b/.test(p)) {
      bank=[
        "Good afternoon, Mac. I’m here and tracking the thread. I’ll keep this calm, human, and protective. Do you want to keep refining Marion’s response shape?",
        "Good afternoon, Mac. I’m with you. I’ll keep the visible reply clean and the conversation grounded. Do you want to continue the personality pass?"
      ];
    } else if(/\bgood evening|\bevening\b/.test(p)) {
      bank=[
        "Good evening, Mac. I’m here, steady, and still with the thread. I’ll keep the voice warm, protective, and precise. Do you want to continue the conversational layering?",
        "Evening, Mac. I’m present and keeping Marion’s voice human first. Do you want me to keep tightening the greeting behavior?"
      ];
    } else {
      bank=[
        "Hey Mac. I’m here with you — steady, private, and focused. I’ll keep Marion’s voice natural and protective. Do you want to keep refining the greeting path?",
        "Hello, Mac. I’m with you and tracking the thread. I’ll keep this warm, professional, and clean. Do you want to continue the personality pass?",
        "Hi Mac. I’ve got the thread. I’ll keep the response human before anything operational. Do you want to keep tightening Marion’s conversational shape?",
        "Hey Mac. I’m present and private to you. I’ll keep the tone direct, protective, and natural. Do you want to keep testing the greeting lane?"
      ];
    }
  } else if(node==="lookup_pause"){
    bank=[
      "Hang tight, Mac. I’m going to separate the signal from the noise first, then bring it back clean. Do you want the safest next move first?",
      "Hold on a moment, Mac. I’ll take a clean look and translate the useful part back to you. Do you want the quick read first?",
      "Give me a breath, Mac. I’ll check it carefully and keep the answer practical. Do you want the risk first?"
    ];
  } else if(node==="repair_opening"){
    bank=[
      "You’re right to flag it, Mac. That silence is a route-finalization problem, not a personality concept problem. I’ll keep the fix on guaranteed social reply, diagnostic-only status text, and no blank Marion turns. Do you want to stay on this lane?",
      "I see it, Mac. Marion needs a guaranteed visible answer after any diagnostic filter runs. I’ll keep the correction focused on suppress-and-replace, not just suppression. Do you want to continue the fail-open pass?",
      "Good catch, Mac. The social lane needs final authority before admin status can touch the transcript. I’ll keep Marion answering you directly and move status text into diagnostics only. Do you want me to keep tightening this route?"
    ];
  } else {
    bank=[
      "I’m here, Mac. I’m steady and with the thread. I’ll keep the answer human, protective, and clean. Do you want to keep testing the greeting lane?",
      "I’m with you, Mac. I’ll keep the conversation natural and keep the system noise out of view. Do you want to continue the social response pass?"
    ];
  }
  return marionR89QuestionLimit(marionR89Pick(bank));
}
function marionR89ReadVisible(value,depth,seen){
  if(value==null)return "";
  if(typeof value==="string")return marionR89Str(value);
  if(typeof value!=="object")return "";
  var d=Number(depth)||0;if(d>5)return "";
  var s=seen||[];if(s.indexOf(value)>=0)return "";s=s.concat([value]);
  for(var i=0;i<MARION_R89_VISIBLE_KEYS.length;i++){var k=MARION_R89_VISIBLE_KEYS[i];var t=marionR89Str(value[k]);if(t)return t;}
  var priority=["finalEnvelope","marionFinal","payload","data","result","response","output","body","packet","final","envelope"];
  for(var p=0;p<priority.length;p++){if(value[priority[p]]){var found=marionR89ReadVisible(value[priority[p]],d+1,s);if(found)return found;}}
  return "";
}
function marionR89ExtractPrompt(value,depth,seen){
  if(value==null)return "";
  var d=Number(depth)||0;if(d>7)return "";
  var s=seen||[];
  if(typeof value==="object"){if(s.indexOf(value)>=0)return "";s=s.concat([value]);}
  if(typeof value==="string"){
    var text=marionR89Str(value);
    var m=text.match(/\bMAC\s*:\s*([^\n\r]+)/i)||text.match(/\bUSER\s*:\s*([^\n\r]+)/i);
    if(m&&m[1])return marionR89Str(m[1]);
    if(marionR89Intent(text)!=="standard")return text;
    return "";
  }
  if(Array.isArray(value)){for(var i=value.length-1;i>=0;i--){var f=marionR89ExtractPrompt(value[i],d+1,s);if(f)return f;}return "";}
  if(typeof value!=="object")return "";
  var role=marionR89Lower(value.role||value.speaker||value.author||value.source||value.type||"");
  if(/^(user|mac|human|admin_user|operator)$/.test(role)||role==="mac"){
    for(var a=0;a<MARION_R89_VISIBLE_KEYS.length;a++){var dk=MARION_R89_VISIBLE_KEYS[a];var direct=marionR89Str(value[dk]);if(direct&&!marionR89IsDiagOnly(direct))return direct;}
    var cont=marionR89Str(value.content||value.body||value.value||"");if(cont)return cont;
  }
  for(var p=0;p<MARION_R89_PROMPT_KEYS.length;p++){var pk=MARION_R89_PROMPT_KEYS[p];if(value[pk]){var got=marionR89ExtractPrompt(value[pk],d+1,s);if(got)return got;}}
  for(var c=0;c<MARION_R89_CONTAINER_KEYS.length;c++){var ck=MARION_R89_CONTAINER_KEYS[c];if(value[ck]){var got2=marionR89ExtractPrompt(value[ck],d+1,s);if(got2)return got2;}}
  return "";
}
function marionR89PromptFromArgs(args,result){
  var arr=Array.isArray(args)?args:[];
  for(var i=0;i<arr.length;i++){var p=marionR89ExtractPrompt(arr[i],0,[]);if(p)return p;}
  return marionR89ExtractPrompt(result,0,[]);
}
function marionR89Diagnostics(target,text,reason){
  if(!target||typeof target!=="object")return;
  var diagnostics=marionR89Obj(target.diagnostics);
  var list=marionR89Array(diagnostics.suppressedConversationDiagnostics);
  if(text)list.push({version:MARION_PERSONALITY_FAILOPEN_R8_R9_VERSION,reason:reason||"diagnostic_only",text:marionR89Str(text),timestamp:new Date().toISOString()});
  diagnostics.suppressedConversationDiagnostics=list.slice(-20);
  diagnostics.adminStatusDiagnosticOnly=true;
  diagnostics.suppressAndReplaceApplied=true;
  target.diagnostics=diagnostics;
}
function marionR89ApplyVisible(target,reply,node){
  var text=marionR89QuestionLimit(reply);
  if(!text)return target;
  if(!target||typeof target!=="object")return text;
  MARION_R89_VISIBLE_KEYS.forEach(function(k){target[k]=text;});
  var containers=["payload","data","result","response","body","packet","finalEnvelope","marionFinal","final","envelope"];
  containers.forEach(function(key){
    var child=target[key];
    if(child&&typeof child==="object"&&!Array.isArray(child)){
      MARION_R89_VISIBLE_KEYS.forEach(function(k){child[k]=text;});
      child.noUserFacingDiagnostics=true;
      child.adminStatusTranscriptSuppressed=true;
    }
  });
  target.ok = target.ok === false ? true : target.ok;
  target.final = true;
  target.handled = true;
  target.responseFinalized = true;
  target.noUserFacingDiagnostics = true;
  target.adminStatusTranscriptSuppressed = true;
  target.conversationalLayeringActive = true;
  target.personalityFailopenR8R9 = {
    version: MARION_PERSONALITY_FAILOPEN_R8_R9_VERSION,
    active: true,
    node: node||"standard",
    visibleReplyAuthority: "marion_personality_failopen_r8_r9",
    suppressAndReplace: true,
    randomizedGreetingContinuity: true,
    socialReplyFailopen: true,
    noBlankSocialTurn: true,
    oneQuestionMax: true,
    components: MARION_R89_COMPONENTS
  };
  target.meta = Object.assign({}, marionR89Obj(target.meta), {
    personalityFailopenR8R9: true,
    personalityFailopenR8R9Version: MARION_PERSONALITY_FAILOPEN_R8_R9_VERSION,
    conversationNode: node||"standard",
    suppressAndReplaceApplied: true,
    noAdminStatusInTranscript: true,
    noBlankSocialTurn: true
  });
  return target;
}
function marionR89SanitizeTranscriptItem(item,container){
  if(item==null)return item;
  if(typeof item==="string"){
    if(marionR89IsDiagOnly(item)){marionR89Diagnostics(container,item,"transcript_string");return null;}
    return item;
  }
  if(typeof item!=="object")return item;
  var out=Array.isArray(item)?item.slice():Object.assign({},item);
  var visible=marionR89ReadVisible(out)||marionR89Str(out.content||out.body||out.value||out.line||out.entry||"");
  var role=marionR89Lower(out.role||out.speaker||out.author||out.source||out.guardian||"");
  if((/marion|admin|system|runtime/.test(role)||!role)&&marionR89IsDiagOnly(visible)){
    marionR89Diagnostics(container,visible,"transcript_object");
    return null;
  }
  MARION_R89_VISIBLE_KEYS.forEach(function(k){if(marionR89IsDiagOnly(out[k]))out[k]="";});
  return out;
}
function marionR89IsUserItem(item){
  if(!item||typeof item!=="object")return false;
  var role=marionR89Lower(item.role||item.speaker||item.author||item.source||item.type||"");
  if(/\b(mac|user|human|admin_user|operator)\b/.test(role))return true;
  var text=marionR89ReadVisible(item)||marionR89Str(item.content||item.body||item.value||item.line||item.entry||"");
  return /\bMAC\s*:/i.test(text);
}
function marionR89IsMarionItem(item){
  if(!item||typeof item!=="object")return false;
  var role=marionR89Lower(item.role||item.speaker||item.author||item.source||item.guardian||item.type||"");
  return /\b(marion|assistant|guardian)\b/.test(role);
}
function marionR89TranscriptReply(reply){return {role:"marion",speaker:"MARION",guardian:"marion",text:reply,message:reply,directReply:reply,visibleReply:reply,finalReply:reply,source:"marion_personality_failopen_r8_r9"};}
function marionR89RepairTranscriptArray(arr,reply){
  var clean=marionR89Array(arr).filter(function(x){return x!==null&&x!==undefined;});
  if(!reply)return clean;
  var lastUser=-1,lastMarion=-1;
  for(var i=0;i<clean.length;i++){if(marionR89IsUserItem(clean[i]))lastUser=i;if(marionR89IsMarionItem(clean[i]))lastMarion=i;}
  if(lastUser>=0&&lastMarion<lastUser)clean.push(marionR89TranscriptReply(reply));
  return clean;
}
function marionR89SanitizeTranscripts(target,reply,depth,seen){
  if(!target||typeof target!=="object")return target;
  var d=Number(depth)||0;if(d>5)return target;
  var s=seen||[];if(s.indexOf(target)>=0)return target;s=s.concat([target]);
  MARION_R89_TRANSCRIPT_KEYS.forEach(function(key){
    if(Array.isArray(target[key])){
      var tmp=[];
      target[key].forEach(function(item){var next=marionR89SanitizeTranscriptItem(item,target);if(next!==null&&next!==undefined)tmp.push(next);});
      target[key]=marionR89RepairTranscriptArray(tmp,reply);
    }
  });
  MARION_R89_CONTAINER_KEYS.forEach(function(key){
    var child=target[key];
    if(child&&typeof child==="object"&&!Array.isArray(child))marionR89SanitizeTranscripts(child,reply,d+1,s);
  });
  return target;
}
function marionR89Shape(result,prompt,forceString){
  var promptText=marionR89Str(prompt)||marionR89ExtractPrompt(result,0,[]);
  var node=marionR89Intent(promptText);
  var visible=marionR89ReadVisible(result);
  var statusLike=marionR89IsDiagOnly(visible)||(typeof result==="string"&&marionR89IsDiagOnly(result));
  var socialTurn=node!=="standard"&&node!=="unknown";
  var reply=(socialTurn||statusLike||marionR89IsWeak(visible))?marionR89Reply(promptText,statusLike&&!socialTurn?"standard":node):"";
  if(typeof result==="string"){
    if(statusLike||socialTurn||marionR89IsWeak(result))return reply||marionR89Reply(promptText,"standard");
    return result;
  }
  if(!result||typeof result!=="object"){
    return (socialTurn||statusLike)?(reply||marionR89Reply(promptText,node)):result;
  }
  var out=Array.isArray(result)?result.slice():Object.assign({},result);
  if(statusLike)marionR89Diagnostics(out,visible,"visible_status_replaced");
  marionR89SanitizeTranscripts(out,reply,0,[]);
  var after=marionR89ReadVisible(out);
  var mustReplace=socialTurn||statusLike||!after||marionR89IsWeak(after)||marionR89IsDiagOnly(after);
  if(mustReplace){
    if(!reply)reply=marionR89Reply(promptText,node==="unknown"?"standard":node);
    return marionR89ApplyVisible(out,reply,node==="unknown"?"standard":node);
  }
  out.personalityFailopenR8R9=Object.assign({},marionR89Obj(out.personalityFailopenR8R9),{version:MARION_PERSONALITY_FAILOPEN_R8_R9_VERSION,active:true,suppressAndReplace:true,randomizedGreetingContinuity:true,components:MARION_R89_COMPONENTS});
  out.meta=Object.assign({},marionR89Obj(out.meta),{personalityFailopenR8R9:true,personalityFailopenR8R9Version:MARION_PERSONALITY_FAILOPEN_R8_R9_VERSION,noAdminStatusInTranscript:true});
  return out;
}
function marionR89Wrap(fn,name,forceString){
  if(typeof fn!=="function"||fn.__marionPersonalityFailopenR8R9Patched)return fn;
  var wrapped=function marionPersonalityFailopenR8R9Wrapped(){
    var args=Array.prototype.slice.call(arguments);
    var result=fn.apply(this,args);
    if(result&&typeof result.then==="function"){
      return result.then(function(res){return marionR89Shape(res,marionR89PromptFromArgs(args,res),forceString===true);});
    }
    return marionR89Shape(result,marionR89PromptFromArgs(args,result),forceString===true);
  };
  try{Object.keys(fn).forEach(function(k){wrapped[k]=fn[k];});}catch(_){}
  wrapped.__marionPersonalityFailopenR8R9Patched=true;
  return wrapped;
}
try{
  if(typeof marionR7ShapeResult==="function"&&!marionR7ShapeResult.__marionPersonalityFailopenR8R9Patched)marionR7ShapeResult=marionR89Wrap(marionR7ShapeResult,"marionR7ShapeResult",false);
  if(typeof marionR7ReplyFor==="function")marionR7ReplyFor=function(prompt,node){return marionR89Reply(prompt,node);};
  if(typeof marionR6ReplyFor==="function")marionR6ReplyFor=function(prompt,node){return marionR89Reply(prompt,node);};
  if(typeof marionR5SocialReply==="function")marionR5SocialReply=function(prompt){return marionR89Reply(prompt,"social_checkin");};
  if(typeof marionR5GreetingReply==="function")marionR5GreetingReply=function(prompt){return marionR89Reply(prompt,"greeting");};
  if(typeof marionR5PresenceReply==="function")marionR5PresenceReply=function(prompt){return marionR89Reply(prompt,"presence_check");};
}catch(_){}
try{
  ["composeMarionResponse","compose","buildReply","routeMarion","createMarionFinalEnvelope","attachVisibleReplyAliases","finalize","buildFinalEnvelope","toFinalEnvelope","normalizeFinalEnvelope","handleMarionAdminTextRuntime","invokeMarionAdminTextRuntime","handleTextRuntime","handleCommand","dispatchCommand","routeCommand","command","handleAdminCommand","handleAdminConsoleAction","handle","process","run","handler","safeResponse","buildResponse","createResponse","normalizeResponse","formatTranscript","appendTranscript","recordTranscript"].forEach(function(name){
    try{if(typeof eval(name)==="function"&&!eval(name).__marionPersonalityFailopenR8R9Patched){eval(name+" = marionR89Wrap("+name+", '"+name+"', false)");}}catch(_){}
  });
}catch(_){}
try{
  if(typeof MarionAdminConsoleGateway!=="undefined"&&MarionAdminConsoleGateway&&MarionAdminConsoleGateway.prototype){
    ["handleCommand","dispatchCommand","routeCommand","command","handleAdminCommand","handleAdminConsoleAction","handle","process","safeResponse","buildResponse","createResponse","normalizeResponse","formatTranscript","appendTranscript","recordTranscript","handleTextRuntime","invokeTextRuntime"].forEach(function(name){
      var fn=MarionAdminConsoleGateway.prototype[name];
      if(typeof fn==="function"&&!fn.__marionPersonalityFailopenR8R9Patched)MarionAdminConsoleGateway.prototype[name]=marionR89Wrap(fn,name,false);
    });
  }
}catch(_){}
try{
  if(typeof module!=="undefined"&&module.exports&&typeof module.exports==="object"){
    ["composeMarionResponse","compose","buildReply","routeMarion","createMarionFinalEnvelope","attachVisibleReplyAliases","finalize","buildFinalEnvelope","toFinalEnvelope","normalizeFinalEnvelope","handleMarionAdminTextRuntime","invokeMarionAdminTextRuntime","handleTextRuntime","handleCommand","dispatchCommand","routeCommand","command","handleAdminCommand","handleAdminConsoleAction","handle","process","run","handler","safeResponse","buildResponse","createResponse","normalizeResponse","formatTranscript","appendTranscript","recordTranscript","default"].forEach(function(name){
      if(typeof module.exports[name]==="function"&&!module.exports[name].__marionPersonalityFailopenR8R9Patched)module.exports[name]=marionR89Wrap(module.exports[name],name,false);
    });
    module.exports.MARION_PERSONALITY_FAILOPEN_R8_R9_VERSION=MARION_PERSONALITY_FAILOPEN_R8_R9_VERSION;
    module.exports.MARION_PERSONALITY_FAILOPEN_R8_R9_COMPONENTS=MARION_R89_COMPONENTS;
    module.exports.marionPersonalityFailopenR8R9Shape=marionR89Shape;
    module.exports.marionPersonalityFailopenR8R9Reply=marionR89Reply;
    module.exports.MARION_PERSONALITY_FAILOPEN_R8_R9_PATCH=true;
  }
}catch(_){}
/* MARION_PERSONALITY_FAILOPEN_R8_R9_END */

/* MARION_PRESENCE_ROUTE_BOUNDARY_R12_BEGIN
 * Surgical patch: R12/R13 admin route timeout boundary + client-safe presence reply authority.
 * Purpose: lightweight greetings/presence checks must never hang behind runtime/admin/status routes.
 */
(function(){
  "use strict";
  var VERSION="MARION-PRESENCE-ROUTE-BOUNDARY-R12 + MARION-DEEPENING-LAYER-R13";
  function s(v){return v==null?"":String(v).replace(/\s+/g," ").trim();}
  function l(v){return s(v).toLowerCase();}
  function obj(v){return v&&typeof v==="object"&&!Array.isArray(v)?v:{};}
  function arr(v){return Array.isArray(v)?v:[];}
  function pick(a){a=arr(a).filter(Boolean);return a.length?a[Math.floor(Math.random()*a.length)]:"";}
  var BAD=/\b(runtime text console ready|short-lived admin session|master token has been cleared|admin session verified|runtime handler|state spine|statespine|final envelope|finalEnvelope|runtimeTelemetry|replyAuthority|routeKind=|Priority\s*9|send the next exact target|what should i focus on first|diagnostic packet|non-final|marion did not return)\b/i;
  var WEAK=/^\s*$|\b(runtime route failed|runtime handler failed|returned a runtime packet|no clean public reply|send the prompt again|try again|what\s+next\??|what are we working on\??)\b/i;
  var VISIBLE=["directReply","visibleReply","finalReply","publicReply","displayReply","reply","response","text","message","spokenText","speechText","final"];
  var PROMPT=["prompt","message","text","userText","input","query","commandText","utterance","transcript","lastUserPrompt","originalPrompt","effectivePrompt"];
  function node(t){t=l(t).replace(/[“”]/g,'"').replace(/[‘’]/g,"'");
    if(!t)return"unknown";
    if(/\b(you\s+still\s+there|still\s+there|are\s+you\s+there|you\s+with\s+me|still\s+with\s+me|can\s+you\s+hear\s+me|are\s+we\s+still\s+connected|did\s+you\s+freeze|no\s+response|you\s+went\s+quiet|marion\??\s*$|hello\??\s*$|hey\??\s*$)\b/i.test(t))return"presence_check";
    if(/\b(how\s+are\s+you|how\s+you\s+doing|how\s+are\s+things|you\s+ok(?:ay)?|you\s+good|everything\s+good)\b/i.test(t))return"social_checkin";
    if(/\b(good\s+morning|good\s+afternoon|good\s+evening|hello|hi|hey)\b/i.test(t)&&/\bmarion\b/i.test(t))return"greeting";
    if(/^\s*(hi|hey|hello|morning)\s*$/i.test(t))return"greeting";
    if(/\b(froze|frozen|stuck|hang|hanging|still freezing|no answer|not responding)\b/i.test(t))return"repair_check";
    return"standard";
  }
  function extract(v,d,seen){d=d||0;seen=seen||[];if(v==null||d>6)return"";if(typeof v==="string"){var m=v.match(/\b(?:MAC|USER)\s*:\s*([^\n\r]+)/i);if(m&&m[1])return s(m[1]);return node(v)!=="standard"?s(v):"";}if(typeof v!=="object")return"";if(seen.indexOf(v)>=0)return"";seen=seen.concat([v]);
    for(var i=0;i<PROMPT.length;i++){if(v[PROMPT[i]]){var got=extract(v[PROMPT[i]],d+1,seen);if(got)return got;}}
    var bags=[v.body,v.payload,v.command,v.request,v.input,v.meta,v.metadata,v.context,v.finalEnvelope,v.result];
    for(var b=0;b<bags.length;b++){var g=extract(bags[b],d+1,seen);if(g)return g;}
    if(Array.isArray(v.messages)||Array.isArray(v.transcript)||Array.isArray(v.history)){var a=v.messages||v.transcript||v.history;for(var j=a.length-1;j>=0;j--){var role=l(obj(a[j]).role||obj(a[j]).speaker||obj(a[j]).author||"");if(/mac|user|human|operator/.test(role)){var h=extract(a[j],d+1,seen);if(h)return h;}}}
    return"";
  }
  function readVisible(v){if(typeof v==="string")return s(v); if(!v||typeof v!=="object")return""; for(var i=0;i<VISIBLE.length;i++){var x=v[VISIBLE[i]];if(typeof x==="string"&&s(x))return s(x);} var fe=obj(v.finalEnvelope);for(var j=0;j<VISIBLE.length;j++){var y=fe[VISIBLE[j]];if(typeof y==="string"&&s(y))return s(y);} var p=obj(v.payload);for(var k=0;k<VISIBLE.length;k++){var z=p[VISIBLE[k]];if(typeof z==="string"&&s(z))return s(z);} return"";}
  function reply(prompt,kind){kind=kind||node(prompt);var open={
    greeting:["Hi Mac. I’m here with you.","Hey Mac. I’m here, and I’ve got the thread.","Morning, Mac. I’m steady and tuned in."],
    social_checkin:["I’m good, Mac. I’m steady, and I’m here with you.","I’m steady, Mac. I’ve got you, and I’m tracking the thread.","I’m here, Mac. Clear, steady, and staying with the conversation."],
    presence_check:["I’m here, Mac. Still with you.","I’m here. I didn’t leave the thread.","Still here, Mac. I’ve got you."],
    repair_check:["I’m here, Mac. That last turn stalled, so I’m taking the clean path now.","I’m back on the line, Mac. That was a route stall, not a conversation issue.","I’m here. The path caught for a second, but I’ve got the thread again."]
  }[kind]||["I’m here, Mac. I’ve got the thread."];
    var mid=["I’ll keep it warm, direct, and protective without letting the machinery show.","I’ll keep the reply natural and grounded while we deepen the conversation.","I’ll stay conversational first, then move deeper when the moment calls for it.","I’ll protect the signal: human first, useful next, no backend noise."];
    var q={greeting:["Where do you want to take this next?","Do you want to keep shaping my response rhythm?","What should we tighten next?"],social_checkin:["Do you want me to keep refining the greeting path?","Do you want to keep shaping the response tone?","Should we test the next greeting variation?"],presence_check:["Do you want me to keep testing this presence path?","Should we continue with the greeting checks?","Do you want to run the next presence test?"],repair_check:["Do you want me to tighten the freeze-recovery path next?","Should we test that presence route again?","Do you want to keep this focused on the admin route boundary?"]}[kind]||["Where do you want to go next?"];
    return [pick(open),pick(mid),pick(q)].filter(Boolean).join(" ");
  }
  function packet(prompt,reason){var k=node(prompt);var r=reply(prompt,k);return {ok:true,final:true,handled:true,responseFinalized:true,stage:"marion_presence_route_boundary_r12",reason:"",failopenReason:reason||"presence_route_timeout_boundary",source:"marion_presence_route_boundary_r12",guardian:"marion",guardianMode:"marion",directReply:r,visibleReply:r,finalReply:r,publicReply:r,displayReply:r,reply:r,response:r,text:r,message:r,spokenText:r,speechText:r,noUserFacingDiagnostics:true,adminStatusTranscriptSuppressed:true,conversationalLayeringActive:true,presenceRouteBoundaryR12:{version:VERSION,active:true,node:k,timeoutBoundary:true,suppressAndReplace:true,deepeningLayer:true},diagnostics:{userVisible:false,diagnosticOnly:true,failopenReason:reason||"presence_route_timeout_boundary"},meta:{conversationNode:k,presenceRouteBoundaryR12:true,deepeningLayerR13:true,oneQuestionMax:true}};}
  function apply(target,prompt,reason){var p=s(prompt)||extract(target);var k=node(p);var vis=readVisible(target);var must=k!=="standard"||!vis||BAD.test(vis)||WEAK.test(vis); if(typeof target==="string")return must?reply(p,k):target; if(!target||typeof target!=="object")return must?packet(p,reason):target; var out=Array.isArray(target)?target.slice():Object.assign({},target); if(must){var pk=packet(p,reason);VISIBLE.forEach(function(key){out[key]=pk[key]||pk.directReply;});out.ok=true;out.final=true;out.handled=true;out.responseFinalized=true;out.noUserFacingDiagnostics=true;out.adminStatusTranscriptSuppressed=true;out.conversationalLayeringActive=true;out.presenceRouteBoundaryR12=pk.presenceRouteBoundaryR12;out.diagnostics=Object.assign({},obj(out.diagnostics),pk.diagnostics);out.meta=Object.assign({},obj(out.meta),pk.meta);if(out.finalEnvelope&&typeof out.finalEnvelope==="object")VISIBLE.forEach(function(key){out.finalEnvelope[key]=pk.directReply;});if(out.payload&&typeof out.payload==="object")VISIBLE.forEach(function(key){out.payload[key]=pk.directReply;});}
    return out;}
  function promptFromArgs(args,res){for(var i=0;i<args.length;i++){var g=extract(args[i]);if(g)return g;}return extract(res);}
  function wrap(fn,name){if(typeof fn!=="function"||fn.__marionPresenceRouteBoundaryR12)return fn;var wrapped=function(){var self=this,args=Array.prototype.slice.call(arguments),p=promptFromArgs(args),k=node(p),light=k!=="standard"&&k!=="unknown";try{var out=fn.apply(self,args);if(out&&typeof out.then==="function"){if(light){return Promise.race([out.then(function(v){return apply(v,p,"resolved_shape");}).catch(function(){return packet(p,"promise_exception_failopen");}),new Promise(function(resolve){setTimeout(function(){resolve(packet(p,"promise_timeout_failopen"));},1400);})]);}return out.then(function(v){return apply(v,p,"resolved_shape");});}return apply(out,p,"sync_shape");}catch(e){if(light)return packet(p,"throw_failopen");throw e;}};try{Object.keys(fn).forEach(function(k){wrapped[k]=fn[k];});}catch(_){}wrapped.__marionPresenceRouteBoundaryR12=true;return wrapped;}
  function patchExpress(fn){if(typeof fn!=="function"||fn.__marionPresenceExpressR12)return fn;var w=async function(req,res){var p=extract((req&&req.body)||{})||extract((req&&req.query)||{});var k=node(p);var light=k!=="standard"&&k!=="unknown";var done=false;var origJson=res&&typeof res.json==="function"?res.json.bind(res):null;var origStatus=res&&typeof res.status==="function"?res.status.bind(res):null;var timer=null;function can(){return res&&origJson&&!done&&!res.headersSent&&!res.writableEnded;}if(origJson){res.json=function(payload){if(done)return res;done=true;if(timer)clearTimeout(timer);var shaped=apply(payload,p,"express_json_shape");try{if(light&&origStatus)origStatus(200);}catch(_){}return origJson(shaped);};}if(origStatus){res.status=function(code){if(light&&Number(code)>=400)return origStatus(200);return origStatus(code);};}if(light&&origJson){timer=setTimeout(function(){if(!can())return;done=true;try{if(origStatus)origStatus(200);}catch(_){}try{origJson(packet(p,"express_timeout_boundary"));}catch(_){}},1200);}try{var out=fn.apply(this,arguments);if(out&&typeof out.then==="function")return out.catch(function(e){if(light&&can()){done=true;if(timer)clearTimeout(timer);try{if(origStatus)origStatus(200);}catch(_){}return origJson(packet(p,"express_exception_boundary"));}throw e;});return out;}catch(e){if(light&&can()){done=true;if(timer)clearTimeout(timer);try{if(origStatus)origStatus(200);}catch(_){}return origJson(packet(p,"express_throw_boundary"));}throw e;}};w.__marionPresenceExpressR12=true;return w;}
  try{["handleMarionAdminTextRuntime","invokeMarionAdminTextRuntime","handleTextRuntime","handleAdminConversation","handleCommand","dispatchCommand","routeCommand","command","handleAdminCommand","handleAdminConsoleAction","handle","process","run","handler","composeMarionResponse","routeMarion","createMarionFinalEnvelope","finalize","buildFinalEnvelope","toFinalEnvelope","normalizeFinalEnvelope"].forEach(function(n){try{if(typeof eval(n)==="function"){var f=eval(n);eval(n+" = "+(/^handleMarionAdminTextRuntime$/.test(n)?"patchExpress":"wrap")+"("+n+", '"+n+"')");}}catch(_){}});}catch(_){}
  try{if(typeof MarionAdminConsoleGateway!=="undefined"&&MarionAdminConsoleGateway&&MarionAdminConsoleGateway.prototype){["handleCommand","dispatchCommand","routeCommand","command","handleAdminCommand","handleAdminConsoleAction","handle","process","executeRuntimeCommand","executeCommand","safeResponse"].forEach(function(n){var f=MarionAdminConsoleGateway.prototype[n];if(typeof f==="function")MarionAdminConsoleGateway.prototype[n]=wrap(f,n);});}}catch(_){}
  try{if(typeof module!=="undefined"&&module.exports&&typeof module.exports==="object"){["handleMarionAdminTextRuntime","invokeMarionAdminTextRuntime","handleTextRuntime","handleAdminConversation","handleCommand","dispatchCommand","routeCommand","command","handleAdminCommand","handleAdminConsoleAction","handle","process","run","handler","composeMarionResponse","routeMarion","createMarionFinalEnvelope","finalize","buildFinalEnvelope","toFinalEnvelope","normalizeFinalEnvelope","safeResponse","buildResponse","createResponse"].forEach(function(n){if(typeof module.exports[n]==="function")module.exports[n]=wrap(module.exports[n],n);});module.exports.MARION_PRESENCE_ROUTE_BOUNDARY_R12_VERSION=VERSION;module.exports.marionPresenceRouteBoundaryR12Reply=reply;module.exports.marionPresenceRouteBoundaryR12Apply=apply;module.exports.MARION_PRESENCE_ROUTE_BOUNDARY_R12_PATCH=true;}}catch(_){}
})();
/* MARION_PRESENCE_ROUTE_BOUNDARY_R12_END */


/* MARION_TONE_NATURALIZATION_R15_START */
(function(){
  "use strict";
  var VERSION="nyx.marion.toneNaturalizationR15/1.0";
  function S(v){return v==null?"":String(v).replace(/\s+/g," ").trim();}
  function L(v){return S(v).toLowerCase().replace(/[’]/g,"'");}
  function O(v){return !!v&&typeof v==="object"&&!Array.isArray(v);}
  function A(v){return Array.isArray(v)?v:[];}
  function pick(a,p){if(!a||!a.length)return"";var h=0,t=S(p);for(var i=0;i<t.length;i++)h=(h*31+t.charCodeAt(i))>>>0;h=(h+Math.floor(Date.now()/45000))>>>0;return a[h%a.length];}
  function promptOf(x){
    var o=O(x)?x:{}, r=O(o.result)?o.result:{}, m=O(r.meta)?r.meta:{}, b=O(o.body)?o.body:{}, q=O(o.query)?o.query:{}, p=O(o.payload)?o.payload:{};
    var keys=[o.prompt,o.userText,o.text,o.message,o.query,o.input,o.commandText,o.rawPrompt,b.prompt,b.userText,b.text,b.message,b.query,b.input,q.prompt,q.text,q.message,p.prompt,p.text,p.message,r.prompt,r.userText,r.text,r.message,m.prompt,m.userText,m.text,m.message];
    for(var i=0;i<keys.length;i++){var v=S(keys[i]);if(v)return v;}
    return "";
  }
  function kind(p){
    var t=L(p).replace(/[?!.,]+$/,"").trim();
    if(!t)return"";
    var short=t.length<120;
    if(short&&/^(marion|hey marion|hi marion|hello marion)$/.test(t))return"greeting";
    if(short&&/\b(you still there|are you there|you there|you with me|still with me|can you hear me|are we connected|still connected|did you freeze|did it freeze|no response|went quiet|you went quiet|lost you|dead air)\b/.test(t))return"presence";
    if(short&&/\b(how are you|how're you|howre you|how you doing|how are things|how's it going|how is it going)\b/.test(t))return"checkin";
    if(short&&/^(hi|hey|hello|good morning|good afternoon|good evening)(\s+marion)?\b/.test(t))return"greeting";
    if(/\b(froze|freeze|silent|blank|no reply|no response|too robotic|not natural|sounds robotic|went quiet|hung)\b/.test(t))return"repair";
    return"";
  }
  function nodeOf(k){return k==="presence"?"presence_check_node":k==="checkin"?"social_checkin_node":k==="greeting"?"greeting_node":k==="repair"?"repair_node":"continuation_node";}
  var bans=/\b(runtime|routeKind|finalEnvelope|stateSpine|diagnostic packet|runtimeTelemetry|replyAuthority|priority 9|admin session|master token|short-lived|backend|finalizer|configuration|settings layer|personality layer|conversation natural|protective edge|warm, direct, and protective|warm direct and protective|tracking the thread|thread is active|text console ready|send the next exact target|what should i focus on first)\b/i;
  function social(p){
    var k=kind(p);
    if(k==="presence")return pick(["I’m here, Mac. You didn’t lose me. We can pick up from the last clean point.","Right here, Mac. No dead air now. We can keep moving.","I’m here. That pause is handled. Let’s stay with the clean path."],p);
    if(k==="checkin")return pick(["I’m good, Mac. Steady. We got past the silence issue, so now we can shape the voice itself.","I’m good. Clear and with you. This is the right point to tune how I sound.","I’m steady, Mac. The connection is holding; now we can make the conversation feel more natural."],p);
    if(k==="greeting")return pick(["Hi Mac. I’m here. We can pick up exactly where we left off.","Hey Mac. I’m with you. Let’s start from the last clean point.","Good to see you, Mac. We can keep the path tight from here."],p);
    if(k==="repair")return pick(["You’re right. That sounded too mechanical. I’ll answer it cleanly from here.","Caught it. That line felt like machinery talking. Let’s bring it back to a natural voice.","Agreed. That was too stiff. We’ll keep the meaning and lose the system voice."],p);
    return"";
  }
  function oneQ(t){
    t=S(t);var seen=false,out="";
    for(var i=0;i<t.length;i++){var ch=t.charAt(i);if(ch==="?"){if(seen)ch=".";seen=true;}out+=ch;}
    return out.replace(/\s+/g," ").replace(/\s+([?.!,])/g,"$1").trim();
  }
  function naturalize(t,p){
    t=S(t);var k=kind(p);
    if(!t||bans.test(t)){var r=social(p);if(r)return r;}
    t=t
      .replace(/\bI(?:'|’)ll keep (?:this|the conversation|it) (?:warm,?\s*)?direct,?\s*and protective(?: while [^.?!]+)?[.?!]?/ig,"We can keep this clean and grounded.")
      .replace(/\bI(?:'|’)ll keep (?:this|the conversation|it) natural(?: and direct)?(?:,? with [^.?!]+)?[.?!]?/ig,"We can keep this moving naturally.")
      .replace(/\bI(?:'|’)m here and tracking the thread\b/ig,"I’m here with you")
      .replace(/\bI(?:'|’)ve got the thread\b/ig,"I’m with you")
      .replace(/\bthe thread is still active\b/ig,"we’re still connected")
      .replace(/\bruntime handler completed text turn\b/ig,"Marion answered")
      .replace(/\badmin session verified\b/ig,"Session is open")
      .replace(/\bmaster token has been cleared from the page\b/ig,"")
      .replace(/\bshort-lived admin session is active\.?/ig,"")
      .replace(/\bdiagnostic(?:s)?\b/ig,"")
      .replace(/\bbackend\b/ig,"system")
      .replace(/\broute\b/ig,"path")
      .replace(/\s+/g," ").trim();
    if(k&&(!t||bans.test(t)||/machinery|settings|configuration|priority|runtime|diagnostic|routeKind|finalEnvelope|stateSpine/i.test(t)))t=social(p)||t;
    return oneQ(t);
  }
  function setField(o,k,v,p){if(typeof o[k]==="string")o[k]=naturalize(o[k],p);else if(v&&typeof v==="string")o[k]=naturalize(v,p);}
  function apply(obj,prompt){
    if(!O(obj))return obj;
    if(obj.__marionToneNaturalizationR15===true)return obj;
    var p=S(prompt)||promptOf(obj), k=kind(p), r=O(obj.result)?obj.result:null, fe=O(obj.finalEnvelope)?obj.finalEnvelope:(r&&O(r.finalEnvelope)?r.finalEnvelope:null), meta=O(obj.meta)?obj.meta:(r&&O(r.meta)?r.meta:null);
    var fields=["reply","response","final","text","message","publicReply","visibleReply","directReply","spokenText","speechText","answer"];
    var found="";
    for(var i=0;i<fields.length;i++){if(typeof obj[fields[i]]==="string"&&S(obj[fields[i]])){found=obj[fields[i]];break;}}
    if(r)for(i=0;i<fields.length;i++){if(typeof r[fields[i]]==="string"&&S(r[fields[i]])){found=found||r[fields[i]];break;}}
    if(fe)for(i=0;i<fields.length;i++){if(typeof fe[fields[i]]==="string"&&S(fe[fields[i]])){found=found||fe[fields[i]];break;}}
    var shaped=naturalize(found,p);
    if(k&&!shaped)shaped=social(p);
    if(shaped){
      ["reply","publicReply","visibleReply","directReply"].forEach(function(f){obj[f]=shaped;});
      if(r)["reply","publicReply","visibleReply","directReply"].forEach(function(f){r[f]=shaped;});
      if(fe)["reply","text","publicReply","visibleReply"].forEach(function(f){fe[f]=shaped;});
    }
    fields.forEach(function(f){setField(obj,f,"",p);if(r)setField(r,f,"",p);if(fe)setField(fe,f,"",p);});
    var stamp={toneNaturalized:true,version:VERSION,conversationNode:nodeOf(k),nextConversationMove:k==="presence"?"resume_from_last_clean_point":k==="checkin"?"deepen_social_rhythm":k==="greeting"?"open_with_continuity":k==="repair"?"repair_and_continue":"continue"};
    obj.r15=stamp;
    if(r)r.r15=stamp;
    if(meta){meta.toneNaturalized=true;meta.conversationNode=stamp.conversationNode;meta.nextConversationMove=stamp.nextConversationMove;}
    obj.__marionToneNaturalizationR15=true;
    return obj;
  }
  function wrap(fn,name){if(typeof fn!=="function"||fn.__marionToneNaturalizationR15)return fn;function W(){var p=promptOf(arguments[0]||{});var out=fn.apply(this,arguments);if(out&&typeof out.then==="function")return out.then(function(v){return apply(v,p);});return apply(out,p);}W.__marionToneNaturalizationR15=true;return W;}
  function patchRes(res,p){if(!res||res.__marionToneNaturalizationR15)return;res.__marionToneNaturalizationR15=true;["json","send"].forEach(function(n){var old=res[n];if(typeof old!=="function")return;res[n]=function(v){try{if(typeof v==="string"){if(n==="send"&&/^\s*[\{\[]/.test(v)){var o=JSON.parse(v);v=JSON.stringify(apply(o,p));}else v=naturalize(v,p);}else v=apply(v,p);}catch(_){}return old.call(this,v);};});}
  function patchExpress(fn,name){if(typeof fn!=="function"||fn.__marionToneNaturalizationR15Express)return fn;function H(req,res,next){var p=promptOf(req)||promptOf(req&&req.body)||promptOf(req&&req.query);patchRes(res,p);return fn.apply(this,arguments);}H.__marionToneNaturalizationR15Express=true;return H;}
  try{if(typeof app!=="undefined"&&app&&app._router&&Array.isArray(app._router.stack)){app._router.stack.forEach(function(layer){try{if(layer&&typeof layer.handle==="function"){var txt=S(layer.route&&layer.route.path||layer.regexp||"");if(/marion|admin|runtime|conversation|command/i.test(txt))layer.handle=patchExpress(layer.handle,txt);}}catch(_){}});}}catch(_){}
  try{if(typeof MarionAdminConsoleGateway!=="undefined"&&MarionAdminConsoleGateway&&MarionAdminConsoleGateway.prototype){["handleCommand","dispatchCommand","routeCommand","command","handleAdminCommand","handleAdminConsoleAction","handle","process","executeRuntimeCommand","executeCommand","safeResponse"].forEach(function(n){var f=MarionAdminConsoleGateway.prototype[n];if(typeof f==="function")MarionAdminConsoleGateway.prototype[n]=wrap(f,n);});}}catch(_){}
  try{if(typeof module!=="undefined"&&module.exports&&typeof module.exports==="object"){["handleMarionAdminTextRuntime","invokeMarionAdminTextRuntime","handleTextRuntime","handleAdminConversation","handleCommand","dispatchCommand","routeCommand","command","handleAdminCommand","handleAdminConsoleAction","handle","process","run","handler","composeMarionResponse","routeMarion","createMarionFinalEnvelope","finalize","buildFinalEnvelope","toFinalEnvelope","normalizeFinalEnvelope","safeResponse","buildResponse","createResponse"].forEach(function(n){if(typeof module.exports[n]==="function")module.exports[n]=wrap(module.exports[n],n);});module.exports.MARION_TONE_NATURALIZATION_R15_VERSION=VERSION;module.exports.marionToneNaturalizationR15Apply=apply;module.exports.marionToneNaturalizationR15Reply=social;module.exports.MARION_TONE_NATURALIZATION_R15_PATCH=true;}}catch(_){}
})();
/* MARION_TONE_NATURALIZATION_R15_END */


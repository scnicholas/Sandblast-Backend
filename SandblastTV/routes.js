"use strict";

const crypto = require("crypto");
const express = require("express");
const {
  validateDraft,
  normalizeSlot,
  resetSlotCertification,
  certificationIsCurrent,
  certifyDraft,
  safeTokenEqual,
  MAX_SLOTS
} = require("./mediaValidator");

function createRouter({
  store,
  scheduler,
  adminToken,
  jsonLimit = "256kb",
  certificationConcurrency = 4
} = {}) {
  if (!store || !scheduler) throw new Error("store_and_scheduler_required");

  const router = express.Router();
  const jsonParser = express.json({ limit: jsonLimit, strict: true });

  function resolveAdminToken() {
    return String(adminToken || process.env.SB_TV_ADMIN_TOKEN || "").trim();
  }

  function requestId(req) {
    return String(req.get("x-request-id") || crypto.randomUUID()).slice(0, 128);
  }

  function sendError(res, err) {
    const status = Number(err && (err.statusCode || err.status)) || 500;
    const body = {
      ok: false,
      error: String(err && err.message || "internal_error")
    };

    if (err && Array.isArray(err.details)) body.details = err.details;
    if (err && err.publicData) Object.assign(body, err.publicData);
    return res.status(status).json(body);
  }

  function safeAudit(event) {
    try {
      store.appendAudit(event);
      return true;
    } catch (error) {
      console.error("[sandblast-tv] audit_write_failed", error && error.message);
      return false;
    }
  }

  function suppliedAdminToken(req) {
    const direct = req.get("x-sandblast-tv-admin-token");
    if (direct) return direct;
    const authorization = String(req.get("authorization") || "");
    return authorization.toLowerCase().startsWith("bearer ")
      ? authorization.slice(7).trim()
      : "";
  }

  function adminOnly(req, res, next) {
    const expected = resolveAdminToken();
    if (!expected) {
      return res.status(503).json({
        ok: false,
        error: "admin_token_not_configured"
      });
    }

    if (!safeTokenEqual(expected, suppliedAdminToken(req))) {
      return res.status(401).json({ ok: false, error: "unauthorized" });
    }

    res.set("Cache-Control", "no-store");
    return next();
  }

  function bodyObject(req) {
    return req.body && typeof req.body === "object" && !Array.isArray(req.body)
      ? req.body
      : {};
  }

  function parseBoolean(value, fallback = false) {
    if (value === true || value === "true" || value === "1") return true;
    if (value === false || value === "false" || value === "0") return false;
    return fallback;
  }

  function applySlotPatch(existing, patch, position, slotId) {
    const allowedPatch = {};
    for (const field of ["title", "sourceUrl", "durationSeconds", "enabled", "notes"]) {
      if (Object.prototype.hasOwnProperty.call(patch, field)) allowedPatch[field] = patch[field];
    }

    const before = normalizeSlot(existing, position);
    const merged = normalizeSlot({ ...before, ...allowedPatch, id: slotId }, position);
    const sourceChanged = before.sourceUrl !== merged.sourceUrl;
    const durationChanged = before.durationSeconds !== merged.durationSeconds;

    if (sourceChanged || durationChanged) return resetSlotCertification(merged, position);
    if (merged.enabled && !certificationIsCurrent(merged)) {
      return { ...merged, validationStatus: merged.sourceUrl ? "pending" : "empty", certification: undefined };
    }
    if (!merged.sourceUrl) return { ...merged, validationStatus: "empty", certification: undefined };
    return merged;
  }

  router.get("/health", (req, res) => {
    res.set("Cache-Control", "no-store");
    res.json({
      ok: true,
      service: "sandblast-tv-scheduler",
      version: 2,
      adminAuthConfigured: Boolean(resolveAdminToken()),
      mediaCertificationRequired: true,
      ts: new Date().toISOString()
    });
  });

  router.get("/channels", (req, res) => {
    try {
      res.set("Cache-Control", "public, max-age=60");
      const channels = store.getChannels().map((channel) => ({
        slug: channel.slug,
        displayName: channel.displayName,
        enabled: channel.enabled !== false,
        published: Boolean(store.getPublished(channel.slug))
      }));
      return res.json({ ok: true, channels });
    } catch (err) {
      return sendError(res, err);
    }
  });

  router.get("/channels/:channel/manifest", (req, res) => {
    try {
      const manifest = store.getPublished(req.params.channel);
      if (!manifest) return res.status(404).json({ ok: false, error: "manifest_not_found" });
      res.set("Cache-Control", "public, max-age=15, stale-while-revalidate=30");
      if (manifest.version != null) res.set("ETag", `W/\"sb-tv-${manifest.version}\"`);
      return res.json({ ok: true, manifest });
    } catch (err) {
      return sendError(res, err);
    }
  });

  router.get("/channels/:channel/now", (req, res) => {
    try {
      let at = Date.now();
      if (req.query.at != null) {
        at = Date.parse(String(req.query.at));
        if (!Number.isFinite(at)) {
          const err = new Error("invalid_schedule_time");
          err.statusCode = 400;
          throw err;
        }
      }
      const now = scheduler.getNow(req.params.channel, at);
      res.set("Cache-Control", "no-store");
      return res.json(now);
    } catch (err) {
      return sendError(res, err);
    }
  });

  router.get("/admin/channels/:channel/draft", adminOnly, (req, res) => {
    try {
      const draft = store.getDraft(req.params.channel);
      if (!draft) return res.status(404).json({ ok: false, error: "draft_not_found" });
      return res.json({ ok: true, draft });
    } catch (err) {
      return sendError(res, err);
    }
  });

  router.put("/admin/channels/:channel/slots/:slotId", adminOnly, jsonParser, (req, res) => {
    try {
      const channel = req.params.channel;
      const draft = store.getDraft(channel);
      if (!draft || !Array.isArray(draft.slots)) {
        return res.status(404).json({ ok: false, error: "draft_not_found" });
      }

      const index = draft.slots.findIndex((slot) => slot && slot.id === req.params.slotId);
      if (index < 0) return res.status(404).json({ ok: false, error: "slot_not_found" });

      draft.slots[index] = applySlotPatch(
        draft.slots[index],
        bodyObject(req),
        index + 1,
        req.params.slotId
      );
      const savedDraft = store.saveDraft(channel, draft);
      const auditRecorded = safeAudit({
        action: "slot_updated",
        channel,
        slotId: req.params.slotId,
        certificationReset: !certificationIsCurrent(savedDraft.slots[index]),
        requestId: requestId(req)
      });

      return res.json({ ok: true, slot: savedDraft.slots[index], auditRecorded });
    } catch (err) {
      return sendError(res, err);
    }
  });

  router.post("/admin/channels/:channel/slots", adminOnly, jsonParser, (req, res) => {
    try {
      const channel = req.params.channel;
      const draft = store.getDraft(channel);
      if (!draft || !Array.isArray(draft.slots)) {
        return res.status(404).json({ ok: false, error: "draft_not_found" });
      }
      if (draft.slots.length >= MAX_SLOTS) {
        return res.status(409).json({ ok: false, error: "slot_limit_reached" });
      }

      const position = draft.slots.length + 1;
      const slot = resetSlotCertification(bodyObject(req), position);
      if (draft.slots.some((item) => item && item.id === slot.id)) {
        return res.status(409).json({ ok: false, error: "duplicate_slot_id" });
      }

      draft.slots.push(slot);
      const savedDraft = store.saveDraft(channel, draft);
      const auditRecorded = safeAudit({
        action: "slot_added",
        channel,
        slotId: slot.id,
        requestId: requestId(req)
      });

      return res.status(201).json({ ok: true, slot: savedDraft.slots[position - 1], auditRecorded });
    } catch (err) {
      return sendError(res, err);
    }
  });

  router.post("/admin/channels/:channel/publish", adminOnly, (req, res) => {
    try {
      const channel = req.params.channel;
      const manifest = scheduler.publish(channel);
      const auditRecorded = safeAudit({
        action: "channel_published",
        channel,
        version: manifest.version,
        requestId: requestId(req)
      });
      return res.json({ ok: true, manifest, auditRecorded });
    } catch (err) {
      return sendError(res, err);
    }
  });

  router.post("/admin/channels/:channel/rollback", adminOnly, (req, res) => {
    try {
      const channel = req.params.channel;
      const manifest = store.rollback(channel);
      const auditRecorded = safeAudit({
        action: "channel_rolled_back",
        channel,
        version: manifest.version,
        requestId: requestId(req)
      });
      return res.json({ ok: true, manifest, auditRecorded });
    } catch (err) {
      return sendError(res, err);
    }
  });

  router.post("/admin/channels/:channel/validate", adminOnly, (req, res) => {
    try {
      const channel = req.params.channel;
      const draft = store.getDraft(channel);
      if (!draft) return res.status(404).json({ ok: false, error: "draft_not_found" });
      const requireValidated = parseBoolean(req.query.requireValidated, false);
      const result = validateDraft(draft, channel, { requireValidated });
      return res.status(result.ok ? 200 : 422).json(result);
    } catch (err) {
      return sendError(res, err);
    }
  });

  router.get("/admin/channels/:channel/certification", adminOnly, (req, res) => {
    try {
      const report = store.getCertification(req.params.channel);
      if (!report) return res.status(404).json({ ok: false, error: "certification_not_found" });
      return res.json({ ok: true, report });
    } catch (err) {
      return sendError(res, err);
    }
  });

  router.post("/admin/channels/:channel/certify", adminOnly, jsonParser, async (req, res) => {
    try {
      const channel = req.params.channel;
      const draft = store.getDraft(channel);
      if (!draft) return res.status(404).json({ ok: false, error: "draft_not_found" });

      const body = bodyObject(req);
      const apply = parseBoolean(req.query.apply, parseBoolean(body.apply, false));
      const quarantineFailures = parseBoolean(
        req.query.quarantineFailures,
        parseBoolean(body.quarantineFailures, true)
      );
      const report = await certifyDraft(draft, channel, {
        timeoutMs: body.timeoutMs,
        concurrency: body.concurrency || certificationConcurrency,
        quarantineFailures: apply && quarantineFailures
      });
      const savedReport = store.saveCertification(channel, { ...report, applied: apply });
      let savedDraft = null;
      if (apply) savedDraft = store.saveDraft(channel, report.manifest);

      const auditRecorded = safeAudit({
        action: "media_certification",
        channel,
        applied: apply,
        summary: report.summary,
        requestId: requestId(req)
      });

      return res.status(report.ok ? 200 : 422).json({
        ok: report.ok,
        applied: apply,
        auditRecorded,
        report: savedReport,
        draftUpdatedAt: savedDraft && savedDraft.updatedAt || null
      });
    } catch (err) {
      return sendError(res, err);
    }
  });

  router.use((err, req, res, next) => {
    if (res.headersSent) return next(err);
    if (err && err.type === "entity.parse.failed") {
      err.message = "invalid_json_body";
      err.statusCode = 400;
    }
    return sendError(res, err);
  });

  return router;
}

module.exports = {
  createRouter
};

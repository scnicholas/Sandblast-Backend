"use strict";

const express = require("express");
const { validateDraft, normalizeSlot, safeTokenEqual, MAX_SLOTS } = require("./mediaValidator");

function createRouter({ store, scheduler }) {
  const router = express.Router();

  function sendError(res, err) {
    const status = Number(err && err.statusCode) || 500;
    const body = {
      ok: false,
      error: String(err && err.message || "internal_error")
    };

    if (err && Array.isArray(err.details)) body.details = err.details;
    if (err && err.publicData) Object.assign(body, err.publicData);

    return res.status(status).json(body);
  }

  function adminOnly(req, res, next) {
    const expected = process.env.SB_TV_ADMIN_TOKEN;
    const supplied = req.get("x-sandblast-tv-admin-token") || "";

    if (!expected || !safeTokenEqual(expected, supplied)) {
      return res.status(401).json({ ok: false, error: "unauthorized" });
    }

    return next();
  }

  router.get("/health", (req, res) => {
    res.set("Cache-Control", "no-store");
    res.json({
      ok: true,
      service: "sandblast-tv-scheduler",
      version: 1,
      ts: new Date().toISOString()
    });
  });

  router.get("/channels", (req, res) => {
    res.set("Cache-Control", "public, max-age=60");
    const channels = store.getChannels().map((channel) => ({
      slug: channel.slug,
      displayName: channel.displayName,
      enabled: channel.enabled !== false,
      published: !!store.getPublished(channel.slug)
    }));
    res.json({ ok: true, channels });
  });

  router.get("/channels/:channel/manifest", (req, res) => {
    try {
      const manifest = store.getPublished(req.params.channel);
      if (!manifest) return res.status(404).json({ ok: false, error: "manifest_not_found" });
      res.set("Cache-Control", "public, max-age=15, stale-while-revalidate=30");
      return res.json({ ok: true, manifest });
    } catch (err) {
      return sendError(res, err);
    }
  });

  router.get("/channels/:channel/now", (req, res) => {
    try {
      const at = req.query.at ? Date.parse(String(req.query.at)) : Date.now();
      const now = scheduler.getNow(req.params.channel, Number.isFinite(at) ? at : Date.now());
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
      res.set("Cache-Control", "no-store");
      return res.json({ ok: true, draft });
    } catch (err) {
      return sendError(res, err);
    }
  });

  router.put("/admin/channels/:channel/slots/:slotId", adminOnly, (req, res) => {
    try {
      const channel = req.params.channel;
      const draft = store.getDraft(channel);
      if (!draft || !Array.isArray(draft.slots)) {
        return res.status(404).json({ ok: false, error: "draft_not_found" });
      }

      const index = draft.slots.findIndex((slot) => slot && slot.id === req.params.slotId);
      if (index < 0) return res.status(404).json({ ok: false, error: "slot_not_found" });

      draft.slots[index] = normalizeSlot(
        { ...draft.slots[index], ...(req.body || {}), id: req.params.slotId },
        index + 1
      );
      draft.updatedAt = new Date().toISOString();

      store.saveDraft(channel, draft);
      store.appendAudit({
        action: "slot_updated",
        channel,
        slotId: req.params.slotId,
        requestId: req.get("x-request-id") || null
      });

      return res.json({ ok: true, slot: draft.slots[index] });
    } catch (err) {
      return sendError(res, err);
    }
  });

  router.post("/admin/channels/:channel/slots", adminOnly, (req, res) => {
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
      const slot = normalizeSlot(req.body || {}, position);
      if (draft.slots.some((item) => item && item.id === slot.id)) {
        return res.status(409).json({ ok: false, error: "duplicate_slot_id" });
      }

      draft.slots.push(slot);
      draft.updatedAt = new Date().toISOString();
      store.saveDraft(channel, draft);
      store.appendAudit({
        action: "slot_added",
        channel,
        slotId: slot.id,
        requestId: req.get("x-request-id") || null
      });

      return res.status(201).json({ ok: true, slot });
    } catch (err) {
      return sendError(res, err);
    }
  });

  router.post("/admin/channels/:channel/publish", adminOnly, (req, res) => {
    try {
      const channel = req.params.channel;
      const manifest = scheduler.publish(channel);
      store.appendAudit({
        action: "channel_published",
        channel,
        version: manifest.version,
        requestId: req.get("x-request-id") || null
      });
      return res.json({ ok: true, manifest });
    } catch (err) {
      return sendError(res, err);
    }
  });

  router.post("/admin/channels/:channel/rollback", adminOnly, (req, res) => {
    try {
      const channel = req.params.channel;
      const manifest = store.rollback(channel);
      store.appendAudit({
        action: "channel_rolled_back",
        channel,
        version: manifest.version,
        requestId: req.get("x-request-id") || null
      });
      return res.json({ ok: true, manifest });
    } catch (err) {
      return sendError(res, err);
    }
  });

  router.post("/admin/channels/:channel/validate", adminOnly, (req, res) => {
    try {
      const channel = req.params.channel;
      const draft = store.getDraft(channel);
      if (!draft) return res.status(404).json({ ok: false, error: "draft_not_found" });
      const result = validateDraft(draft, channel);
      return res.status(result.ok ? 200 : 422).json(result);
    } catch (err) {
      return sendError(res, err);
    }
  });

  return router;
}

module.exports = {
  createRouter
};

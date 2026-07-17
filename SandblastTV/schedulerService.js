"use strict";

const { validateDraft, certificationIsCurrent } = require("./mediaValidator");

class SchedulerService {
  constructor({ store } = {}) {
    if (!store) throw new Error("store_required");
    this.store = store;
  }

  buildPublishedManifest(channel, draft) {
    const checked = validateDraft(draft, channel, { requireValidated: true });
    if (!checked.ok) {
      const err = new Error("draft_validation_failed");
      err.statusCode = 422;
      err.details = checked.errors;
      throw err;
    }

    const activeSlots = checked.value.slots.filter(
      (slot) => slot.enabled && certificationIsCurrent(slot)
    );
    const totalDurationSeconds = activeSlots.reduce(
      (sum, slot) => sum + slot.durationSeconds,
      0
    );

    if (!(totalDurationSeconds > 0)) {
      const err = new Error("manifest_duration_invalid");
      err.statusCode = 422;
      throw err;
    }

    const previous = this.store.getPublished(channel);
    const version = Math.max(1, Number(previous && previous.version || 0) + 1);
    const publishedAt = new Date().toISOString();

    return {
      ...checked.value,
      contract: "sandblast.tv.publishedManifest/2.0",
      slots: activeSlots,
      version,
      totalDurationSeconds,
      publishedAt
    };
  }

  publish(channel) {
    const draft = this.store.getDraft(channel);
    if (!draft) {
      const err = new Error("draft_not_found");
      err.statusCode = 404;
      throw err;
    }

    const manifest = this.buildPublishedManifest(channel, draft);
    return this.store.publish(channel, manifest);
  }

  getNow(channel, atMs = Date.now()) {
    const requestedAt = Number(atMs);
    if (!Number.isFinite(requestedAt)) {
      const err = new Error("invalid_schedule_time");
      err.statusCode = 400;
      throw err;
    }

    const manifest = this.store.getPublished(channel);
    const channelConfig = this.store.getChannel(channel);
    const certifiedSlots = manifest && Array.isArray(manifest.slots)
      ? manifest.slots.filter((slot) => slot && slot.enabled !== false && certificationIsCurrent(slot))
      : [];

    if (!manifest || !certifiedSlots.length) {
      const err = new Error("channel_not_published");
      err.statusCode = 503;
      err.publicData = {
        channel,
        fallbackUrl: channelConfig && channelConfig.fallbackUrl || null
      };
      throw err;
    }

    const total = certifiedSlots.reduce(
      (sum, slot) => sum + Number(slot.durationSeconds || 0),
      0
    );
    if (!(total > 0)) {
      const err = new Error("manifest_duration_invalid");
      err.statusCode = 500;
      throw err;
    }

    const parsedPublishedAt = Date.parse(manifest.publishedAt);
    const anchorCandidate = Number(manifest.anchorEpochMs);
    const anchorMs = (
      manifest.anchorEpochMs !== null &&
      manifest.anchorEpochMs !== "" &&
      Number.isFinite(anchorCandidate) &&
      anchorCandidate > 0
    )
      ? anchorCandidate
      : (Number.isFinite(parsedPublishedAt) ? parsedPublishedAt : requestedAt);
    const elapsedSeconds = Math.max(0, (requestedAt - anchorMs) / 1000);
    const cycleOffset = manifest.loop === false
      ? Math.min(elapsedSeconds, Math.max(0, total - 0.001))
      : ((elapsedSeconds % total) + total) % total;

    let cursor = 0;
    let selectedIndex = certifiedSlots.length - 1;

    for (let index = 0; index < certifiedSlots.length; index += 1) {
      const duration = Number(certifiedSlots[index].durationSeconds);
      if (cycleOffset < cursor + duration) {
        selectedIndex = index;
        break;
      }
      cursor += duration;
    }

    const slot = certifiedSlots[selectedIndex];
    const offsetSeconds = Math.max(0, cycleOffset - cursor);
    const remainingSeconds = Math.max(0, Number(slot.durationSeconds) - offsetSeconds);
    const nextSlot = manifest.loop === false && selectedIndex === certifiedSlots.length - 1
      ? null
      : certifiedSlots[(selectedIndex + 1) % certifiedSlots.length];
    const slotStartedAtMs = requestedAt - (offsetSeconds * 1000);

    return {
      ok: true,
      channel,
      version: manifest.version,
      displayName: manifest.displayName,
      slot,
      slotIndex: selectedIndex,
      offsetSeconds,
      remainingSeconds,
      nextSlot,
      totalDurationSeconds: total,
      cycleOffsetSeconds: cycleOffset,
      certificationRequired: true,
      slotStartedAt: new Date(slotStartedAtMs).toISOString(),
      nextChangeAt: nextSlot ? new Date(requestedAt + (remainingSeconds * 1000)).toISOString() : null,
      serverTime: new Date(requestedAt).toISOString()
    };
  }
}

module.exports = {
  SchedulerService
};

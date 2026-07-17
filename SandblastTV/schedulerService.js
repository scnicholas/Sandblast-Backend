"use strict";

const { validateDraft } = require("./mediaValidator");

class SchedulerService {
  constructor({ store }) {
    this.store = store;
  }

  buildPublishedManifest(channel, draft) {
    const checked = validateDraft(draft, channel, { requireValidated:true });
    if (!checked.ok) {
      const err = new Error("draft_validation_failed");
      err.statusCode = 422;
      err.details = checked.errors;
      throw err;
    }

    const activeSlots = checked.value.slots.filter((slot) => slot.enabled && slot.validationStatus === "validated");
    const totalDurationSeconds = activeSlots.reduce(
      (sum, slot) => sum + slot.durationSeconds,
      0
    );

    const previous = this.store.getPublished(channel);
    const version = Math.max(1, Number(previous && previous.version || 0) + 1);

    return {
      ...checked.value,
      slots: activeSlots,
      version,
      totalDurationSeconds,
      publishedAt: new Date().toISOString()
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
    const manifest = this.store.getPublished(channel);
    const channelConfig = this.store.getChannel(channel);

    const certifiedSlots = manifest && Array.isArray(manifest.slots)
      ? manifest.slots.filter((slot) => slot && slot.enabled !== false && slot.validationStatus === "validated")
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

    const total = certifiedSlots.reduce((sum,slot)=>sum+Number(slot.durationSeconds||0),0);
    if (!(total > 0)) {
      const err = new Error("manifest_duration_invalid");
      err.statusCode = 500;
      throw err;
    }

    const anchorMs = Number(manifest.anchorEpochMs || Date.parse(manifest.publishedAt) || atMs);
    const elapsedSeconds = Math.max(0, (Number(atMs) - anchorMs) / 1000);
    const cycleOffset = manifest.loop === false
      ? Math.min(elapsedSeconds, Math.max(0, total - 0.001))
      : ((elapsedSeconds % total) + total) % total;

    let cursor = 0;
    let selectedIndex = 0;

    for (let index = 0; index < certifiedSlots.length; index += 1) {
      const duration = Number(certifiedSlots[index].durationSeconds);
      if (cycleOffset < cursor + duration) {
        selectedIndex = index;
        break;
      }
      cursor += duration;
    }

    const slot = certifiedSlots[selectedIndex];
    const nextSlot = manifest.loop === false && selectedIndex === certifiedSlots.length - 1
      ? null
      : certifiedSlots[(selectedIndex + 1) % certifiedSlots.length];

    return {
      ok: true,
      channel,
      version: manifest.version,
      displayName: manifest.displayName,
      slot,
      slotIndex: selectedIndex,
      offsetSeconds: Math.max(0, cycleOffset - cursor),
      nextSlot: nextSlot || null,
      totalDurationSeconds: total,
      certificationRequired: true,
      serverTime: new Date(Number(atMs)).toISOString()
    };
  }
}

module.exports = {
  SchedulerService
};

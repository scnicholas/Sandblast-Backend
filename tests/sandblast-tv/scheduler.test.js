"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { ManifestStore, atomicWriteJson } = require("../../SandblastTV/manifestStore");
const { SchedulerService } = require("../../SandblastTV/schedulerService");

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sandblast-tv-"));
  const dataDir = path.join(root, "Data", "SandblastTV");
  fs.mkdirSync(path.join(dataDir, "blocks"), { recursive: true });
  atomicWriteJson(path.join(dataDir, "channels.json"), {
    channels: [{
      slug: "cartoons",
      displayName: "Cartoons",
      fallbackUrl: "https://dn600301.us.archive.org/fallback.mp4"
    }]
  });
  atomicWriteJson(path.join(dataDir, "blocks", "cartoons.json"), {
    channel: "cartoons",
    displayName: "Cartoons",
    loop: true,
    anchorEpochMs: 1000000,
    slots: [
      {
        id: "one",
        title: "One",
        sourceUrl: "https://dn600301.us.archive.org/one.mp4",
        durationSeconds: 10,
        enabled: true
      },
      {
        id: "two",
        title: "Two",
        sourceUrl: "https://dn600301.us.archive.org/two.mp4",
        durationSeconds: 20,
        enabled: true
      }
    ]
  });
  return { root, dataDir };
}

test("publishes valid enabled slots", () => {
  const { root, dataDir } = fixture();
  try {
    const store = new ManifestStore({ dataDir });
    const scheduler = new SchedulerService({ store });
    const manifest = scheduler.publish("cartoons");

    assert.equal(manifest.version, 1);
    assert.equal(manifest.totalDurationSeconds, 30);
    assert.equal(manifest.slots.length, 2);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("resolves the correct slot and offset", () => {
  const { root, dataDir } = fixture();
  try {
    const store = new ManifestStore({ dataDir });
    const scheduler = new SchedulerService({ store });
    scheduler.publish("cartoons");

    const first = scheduler.getNow("cartoons", 1000000 + 5000);
    assert.equal(first.slot.id, "one");
    assert.equal(Math.round(first.offsetSeconds), 5);

    const second = scheduler.getNow("cartoons", 1000000 + 15000);
    assert.equal(second.slot.id, "two");
    assert.equal(Math.round(second.offsetSeconds), 5);

    const looped = scheduler.getNow("cartoons", 1000000 + 35000);
    assert.equal(looped.slot.id, "one");
    assert.equal(Math.round(looped.offsetSeconds), 5);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("rejects publishing when no slot is enabled", () => {
  const { root, dataDir } = fixture();
  try {
    const draftPath = path.join(dataDir, "blocks", "cartoons.json");
    const draft = JSON.parse(fs.readFileSync(draftPath, "utf8"));
    draft.slots.forEach((slot) => { slot.enabled = false; });
    atomicWriteJson(draftPath, draft);

    const store = new ManifestStore({ dataDir });
    const scheduler = new SchedulerService({ store });

    assert.throws(
      () => scheduler.publish("cartoons"),
      /draft_validation_failed/
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

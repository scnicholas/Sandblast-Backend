"use strict";

const fs = require("fs");
const path = require("path");

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function createStoreError(message, statusCode = 500, details = []) {
  const err = new Error(message);
  err.statusCode = statusCode;
  if (details.length) err.details = details;
  return err;
}

function readJson(filePath, fallback = null) {
  let raw;
  try {
    raw = fs.readFileSync(filePath, "utf8");
  } catch (error) {
    if (error && error.code === "ENOENT") return fallback;
    throw createStoreError("json_read_failed", 500, [path.basename(filePath)]);
  }

  try {
    return JSON.parse(raw);
  } catch (_) {
    throw createStoreError("json_invalid", 500, [path.basename(filePath)]);
  }
}

function safeReadJson(filePath, fallback = null) {
  try {
    return readJson(filePath, fallback);
  } catch (_) {
    return fallback;
  }
}

function atomicWriteJson(filePath, value) {
  ensureDir(path.dirname(filePath));
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`;
  const payload = `${JSON.stringify(value, null, 2)}\n`;
  let fd;

  try {
    fd = fs.openSync(tempPath, "wx", 0o600);
    fs.writeFileSync(fd, payload, { encoding: "utf8" });
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = undefined;
    fs.renameSync(tempPath, filePath);
  } catch (error) {
    if (fd !== undefined) {
      try { fs.closeSync(fd); } catch (_) {}
    }
    try { fs.unlinkSync(tempPath); } catch (_) {}
    throw error;
  }
}

function cleanChannel(value) {
  const channel = String(value || "").trim().toLowerCase();
  if (!/^[a-z0-9-]{2,40}$/.test(channel)) {
    const err = new Error("invalid_channel");
    err.statusCode = 400;
    throw err;
  }
  return channel;
}

function pruneFiles(dir, predicate, keep) {
  if (!(keep > 0)) return;
  const files = fs.readdirSync(dir)
    .filter(predicate)
    .sort()
    .reverse();
  for (const name of files.slice(keep)) {
    try { fs.unlinkSync(path.join(dir, name)); } catch (_) {}
  }
}

class ManifestStore {
  constructor({ dataDir, maxBackups = 30, maxCertifications = 60 } = {}) {
    if (!dataDir) throw createStoreError("data_dir_required", 500);

    this.dataDir = path.resolve(dataDir);
    this.blocksDir = path.join(this.dataDir, "blocks");
    this.publishedDir = path.join(this.dataDir, "published");
    this.backupsDir = path.join(this.dataDir, "backups");
    this.auditDir = path.join(this.dataDir, "audit");
    this.certificationDir = path.join(this.dataDir, "certification");
    this.maxBackups = Math.max(1, Number(maxBackups) || 30);
    this.maxCertifications = Math.max(1, Number(maxCertifications) || 60);

    [
      this.dataDir,
      this.blocksDir,
      this.publishedDir,
      this.backupsDir,
      this.auditDir,
      this.certificationDir
    ].forEach(ensureDir);
  }

  channelsPath() {
    return path.join(this.dataDir, "channels.json");
  }

  draftPath(channel) {
    return path.join(this.blocksDir, `${cleanChannel(channel)}.json`);
  }

  publishedPath(channel) {
    return path.join(this.publishedDir, `${cleanChannel(channel)}.json`);
  }

  certificationPath(channel) {
    return path.join(this.certificationDir, `${cleanChannel(channel)}.latest.json`);
  }

  getChannels() {
    const data = readJson(this.channelsPath(), { channels: [] });
    if (!data || !Array.isArray(data.channels)) {
      throw createStoreError("channels_manifest_invalid", 500, ["channels.json"]);
    }

    return data.channels.filter((item) => {
      try {
        return item && cleanChannel(item.slug) === item.slug;
      } catch (_) {
        return false;
      }
    });
  }

  getChannel(channel) {
    const slug = cleanChannel(channel);
    return this.getChannels().find((item) => item.slug === slug) || null;
  }

  getDraft(channel) {
    return readJson(this.draftPath(channel), null);
  }

  saveDraft(channel, draft) {
    const slug = cleanChannel(channel);
    if (!draft || typeof draft !== "object" || Array.isArray(draft)) {
      throw createStoreError("draft_invalid", 400);
    }
    const value = { ...draft, channel: slug, updatedAt: new Date().toISOString() };
    atomicWriteJson(this.draftPath(slug), value);
    return value;
  }

  getPublished(channel) {
    return readJson(this.publishedPath(channel), null);
  }

  getCertification(channel) {
    return readJson(this.certificationPath(channel), null);
  }

  saveCertification(channel, report) {
    const slug = cleanChannel(channel);
    if (!report || typeof report !== "object" || Array.isArray(report)) {
      throw createStoreError("certification_report_invalid", 400);
    }

    const savedAt = new Date().toISOString();
    const stamp = savedAt.replace(/[:.]/g, "-");
    const value = { ...report, channel: slug, savedAt };
    atomicWriteJson(path.join(this.certificationDir, `${slug}.${stamp}.json`), value);
    atomicWriteJson(this.certificationPath(slug), value);
    pruneFiles(
      this.certificationDir,
      (name) => name.startsWith(`${slug}.`) && name.endsWith(".json") && !name.endsWith(".latest.json"),
      this.maxCertifications
    );
    return value;
  }

  publish(channel, manifest) {
    const slug = cleanChannel(channel);
    const target = this.publishedPath(slug);
    const current = readJson(target, null);

    if (current) {
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      atomicWriteJson(path.join(this.backupsDir, `${slug}.${stamp}.json`), current);
    }

    atomicWriteJson(target, { ...manifest, channel: slug });
    pruneFiles(
      this.backupsDir,
      (name) => name.startsWith(`${slug}.`) && name.endsWith(".json"),
      this.maxBackups
    );
    return { ...manifest, channel: slug };
  }

  rollback(channel) {
    const slug = cleanChannel(channel);
    const files = fs.readdirSync(this.backupsDir)
      .filter((name) => name.startsWith(`${slug}.`) && name.endsWith(".json"))
      .sort()
      .reverse();

    if (!files.length) throw createStoreError("no_backup_available", 404);

    const selected = path.join(this.backupsDir, files[0]);
    const backup = readJson(selected, null);
    if (!backup) throw createStoreError("backup_invalid", 500, [files[0]]);

    const current = this.getPublished(slug);
    if (current) {
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      atomicWriteJson(path.join(this.backupsDir, `${slug}.pre-rollback.${stamp}.json`), current);
    }

    const restored = {
      ...backup,
      channel: slug,
      restoredAt: new Date().toISOString()
    };
    atomicWriteJson(this.publishedPath(slug), restored);
    pruneFiles(
      this.backupsDir,
      (name) => name.startsWith(`${slug}.`) && name.endsWith(".json"),
      this.maxBackups
    );
    return restored;
  }

  appendAudit(event) {
    ensureDir(this.auditDir);
    const day = new Date().toISOString().slice(0, 10);
    const filePath = path.join(this.auditDir, `${day}.jsonl`);
    const safeEvent = event && typeof event === "object" && !Array.isArray(event) ? event : {};
    const record = {
      ...safeEvent,
      ts: new Date().toISOString()
    };
    fs.appendFileSync(filePath, `${JSON.stringify(record)}\n`, { encoding: "utf8", mode: 0o600 });
    return record;
  }
}

module.exports = {
  ManifestStore,
  atomicWriteJson,
  safeReadJson,
  readJson,
  cleanChannel
};

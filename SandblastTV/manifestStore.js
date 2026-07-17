"use strict";

const fs = require("fs");
const path = require("path");

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function safeReadJson(filePath, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (_) {
    return fallback;
  }
}

function atomicWriteJson(filePath, value) {
  ensureDir(path.dirname(filePath));
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  const payload = `${JSON.stringify(value, null, 2)}\n`;
  fs.writeFileSync(tempPath, payload, { encoding: "utf8", mode: 0o600 });
  fs.renameSync(tempPath, filePath);
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

class ManifestStore {
  constructor({ dataDir }) {
    this.dataDir = dataDir;
    this.blocksDir = path.join(dataDir, "blocks");
    this.publishedDir = path.join(dataDir, "published");
    this.backupsDir = path.join(dataDir, "backups");
    this.auditDir = path.join(dataDir, "audit");
    this.certificationDir = path.join(dataDir, "certification");

    [dataDir, this.blocksDir, this.publishedDir, this.backupsDir, this.auditDir, this.certificationDir].forEach(ensureDir);
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
    const data = safeReadJson(this.channelsPath(), { channels: [] });
    return Array.isArray(data.channels) ? data.channels : [];
  }

  getChannel(channel) {
    const slug = cleanChannel(channel);
    return this.getChannels().find((item) => item && item.slug === slug) || null;
  }

  getDraft(channel) {
    return safeReadJson(this.draftPath(channel), null);
  }

  saveDraft(channel, draft) {
    atomicWriteJson(this.draftPath(channel), draft);
    return draft;
  }

  getPublished(channel) {
    return safeReadJson(this.publishedPath(channel), null);
  }

  getCertification(channel) {
    return safeReadJson(this.certificationPath(channel), null);
  }

  saveCertification(channel, report) {
    const slug=cleanChannel(channel), stamp=new Date().toISOString().replace(/[:.]/g,"-");
    atomicWriteJson(path.join(this.certificationDir,`${slug}.${stamp}.json`),report);
    atomicWriteJson(this.certificationPath(slug),report);
    return report;
  }

  publish(channel, manifest) {
    const slug = cleanChannel(channel);
    const target = this.publishedPath(slug);
    const current = safeReadJson(target, null);

    if (current) {
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      atomicWriteJson(path.join(this.backupsDir, `${slug}.${stamp}.json`), current);
    }

    atomicWriteJson(target, manifest);
    return manifest;
  }

  rollback(channel) {
    const slug = cleanChannel(channel);
    const files = fs.readdirSync(this.backupsDir)
      .filter((name) => name.startsWith(`${slug}.`) && name.endsWith(".json"))
      .sort()
      .reverse();

    if (!files.length) {
      const err = new Error("no_backup_available");
      err.statusCode = 404;
      throw err;
    }

    const selected = path.join(this.backupsDir, files[0]);
    const backup = safeReadJson(selected, null);
    if (!backup) {
      const err = new Error("backup_invalid");
      err.statusCode = 500;
      throw err;
    }

    const current = this.getPublished(slug);
    if (current) {
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      atomicWriteJson(path.join(this.backupsDir, `${slug}.pre-rollback.${stamp}.json`), current);
    }

    atomicWriteJson(this.publishedPath(slug), backup);
    return backup;
  }

  appendAudit(event) {
    ensureDir(this.auditDir);
    const day = new Date().toISOString().slice(0, 10);
    const filePath = path.join(this.auditDir, `${day}.jsonl`);
    const record = {
      ts: new Date().toISOString(),
      ...event
    };
    fs.appendFileSync(filePath, `${JSON.stringify(record)}\n`, { encoding: "utf8", mode: 0o600 });
  }
}

module.exports = {
  ManifestStore,
  atomicWriteJson,
  safeReadJson,
  cleanChannel
};

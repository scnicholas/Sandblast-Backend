'use strict';

const express = require('express');
const fs = require('fs');
const path = require('path');

const router = express.Router();
const VERSION = 'nyx.lingosentinel.runtimeHealth/3.0-layers1-7';
const PUBLIC_FILES = Object.freeze([
  'lingosentinel-public-translation-client.js',
  'lingosentinel-public-realtime-client.js',
  'lingosentinel-public-message-client.js',
  'lingosentinel-public-message-receiver.js',
  'lingosentinel-message-render-policy.js',
  'lingosentinel-widget-conversation-controller.js',
  'lingosentinel-widget-translation-bridge.js',
  'lingosentinel-widget-integration-hook.js'
]);
const RUNTIME_MODULES = Object.freeze([
  'LingoSentinelLinkGateway', 'LingoSentinelTokenPolicy', 'LingoSentinelSubscribeTokenRoute',
  'LingoSentinelRoomPolicy', 'LingoSentinelRoomMembership', 'LingoSentinelRoomRegistry', 'LingoSentinelRoomRoute',
  'LingoSentinelConnectionState', 'LingoSentinelReconnectPolicy', 'LingoSentinelRealtimeBridge', 'LingoSentinelConnectionRoute',
  'LingoSentinelMembershipCredential', 'LingoSentinelMessagePolicy', 'LingoSentinelMessageEnvelope',
  'LingoSentinelMessageValidator', 'LingoSentinelPublicMessageProjection', 'LingoSentinelEnglishRelayPolicy',
  'LingoSentinelMessagePublisher', 'LingoSentinelMessageRoute', 'LingoSentinelReceiveDiagnostics'
]);

function safeRequire(candidate) {
  try {
    const resolved = require.resolve(candidate);
    const mod = require(resolved);
    return { ready: !!mod, version: String((mod && (mod.VERSION || mod.POLICY_VERSION)) || '') };
  } catch (error) {
    return { ready: false, version: '', code: String((error && error.code) || 'MODULE_UNAVAILABLE') };
  }
}
function boolEnv(names) { return names.some((name) => String(process.env[name] || '').trim().length > 0); }
function publicAssetStatus(rootDir) {
  const publicDir = path.join(rootDir, 'public', 'lingosentinel');
  const files = PUBLIC_FILES.map((name) => {
    try { const stat = fs.statSync(path.join(publicDir, name)); return { name, exists: stat.isFile(), bytes: stat.isFile() ? stat.size : 0 }; }
    catch (_) { return { name, exists: false, bytes: 0 }; }
  });
  return { ready: files.every((item) => item.exists && item.bytes > 0), files };
}
function buildRuntimeHealth(options = {}) {
  const rootDir = options.rootDir || path.resolve(__dirname, '..', '..', '..', '..');
  const modules = Object.fromEntries(RUNTIME_MODULES.map((name) => [name, safeRequire(`./${name}`)]));
  const ablyPackage = safeRequire('ably');
  const publicAssets = publicAssetStatus(rootDir);
  const ablyConfigured = boolEnv(['ABLY_ROOT_API_KEY', 'ABLY_API_KEY']);
  const translationConfigured = boolEnv(['ARGOS_TRANSLATE_URL', 'ARGOS_TRANSLATE_ENDPOINT', 'LINGOSENTINEL_TRANSLATION_URL', 'LINGOSENTINEL_TRANSLATION_PROVIDER']);
  const moduleReady = Object.values(modules).every((item) => item.ready);
  const layers5to7Ready = [
    'LingoSentinelMembershipCredential', 'LingoSentinelMessagePolicy', 'LingoSentinelMessageEnvelope',
    'LingoSentinelMessageValidator', 'LingoSentinelPublicMessageProjection', 'LingoSentinelEnglishRelayPolicy',
    'LingoSentinelMessagePublisher', 'LingoSentinelMessageRoute', 'LingoSentinelReceiveDiagnostics'
  ].every((name) => modules[name].ready);
  const englishRelayReady = moduleReady && publicAssets.ready && ablyConfigured && ablyPackage.ready;
  return {
    contract: 'lingosentinel.runtimeHealth/1.0',
    version: VERSION,
    ok: englishRelayReady,
    status: englishRelayReady ? 'ready' : 'degraded',
    englishRelayReady,
    layers5to7Ready,
    translationReady: translationConfigured,
    translationRequiredForEnglishRelay: false,
    critical: {
      allRuntimeModulesReady: moduleReady,
      messagingProviderConfigured: ablyConfigured,
      messagingPackageReady: ablyPackage.ready,
      publicAssetsReady: publicAssets.ready,
      membershipCredentialReady: modules.LingoSentinelMembershipCredential.ready,
      messagePublisherReady: modules.LingoSentinelMessagePublisher.ready,
      messageRouteReady: modules.LingoSentinelMessageRoute.ready
    },
    services: { modules, messagingProvider: { configured: ablyConfigured, packageReady: ablyPackage.ready }, publicAssets },
    boundaries: {
      diagnosticsRedacted: true,
      secretValuesExposed: false,
      internalPathsExposed: false,
      marionVisibleParticipant: false,
      publicTelemetryPublishAllowed: false,
      directBrowserPublishAllowed: false,
      backendMessagePublishAuthority: true,
      membershipCredentialRequired: true
    },
    timestamp: new Date().toISOString()
  };
}
function harden(res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache'); res.setHeader('Expires', '0'); res.setHeader('X-Content-Type-Options', 'nosniff');
}
router.get(['/runtime/health', '/layer1/health', '/layers5-7/health'], (req, res) => {
  harden(res);
  const health = buildRuntimeHealth({ rootDir: req.app && req.app.get ? req.app.get('lingosentinelRootDir') : undefined });
  return res.status(200).json(health);
});
router.VERSION = VERSION;
router.buildRuntimeHealth = buildRuntimeHealth;
module.exports = router;
module.exports.VERSION = VERSION;
module.exports.buildRuntimeHealth = buildRuntimeHealth;

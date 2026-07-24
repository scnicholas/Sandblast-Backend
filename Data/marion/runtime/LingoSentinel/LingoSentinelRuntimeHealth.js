'use strict';

/**
 * LingoSentinelRuntimeHealth
 * ------------------------------------------------------------
 * Layer 1 readiness authority for the public LingoSentinel runtime.
 * Translation is reported independently and never blocks English relay.
 * No secret values, filesystem absolute paths, or private diagnostics are returned.
 */

const express = require('express');
const fs = require('fs');
const path = require('path');

const router = express.Router();
const VERSION = 'nyx.lingosentinel.runtimeHealth/1.0-layer1-layer2';
const PUBLIC_FILES = Object.freeze([
  'lingosentinel-public-translation-client.js',
  'lingosentinel-widget-translation-bridge.js',
  'lingosentinel-widget-integration-hook.js'
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

function boolEnv(names) {
  return names.some((name) => String(process.env[name] || '').trim().length > 0);
}

function publicAssetStatus(rootDir) {
  const publicDir = path.join(rootDir, 'public', 'lingosentinel');
  const files = PUBLIC_FILES.map((name) => {
    try {
      const stat = fs.statSync(path.join(publicDir, name));
      return { name, exists: stat.isFile(), bytes: stat.isFile() ? stat.size : 0 };
    } catch (_) {
      return { name, exists: false, bytes: 0 };
    }
  });
  return { ready: files.every((item) => item.exists && item.bytes > 0), files };
}

function buildRuntimeHealth(options = {}) {
  const rootDir = options.rootDir || path.resolve(__dirname, '..', '..', '..', '..');
  const gateway = safeRequire('./LingoSentinelLinkGateway');
  const tokenPolicy = safeRequire('./LingoSentinelTokenPolicy');
  const tokenRoute = safeRequire('./LingoSentinelSubscribeTokenRoute');
  const ablyPackage = safeRequire('ably');
  const publicAssets = publicAssetStatus(rootDir);
  const ablyConfigured = boolEnv(['ABLY_ROOT_API_KEY', 'ABLY_API_KEY']);
  const translationConfigured = boolEnv([
    'ARGOS_TRANSLATE_URL',
    'ARGOS_TRANSLATE_ENDPOINT',
    'LINGOSENTINEL_TRANSLATION_URL',
    'LINGOSENTINEL_TRANSLATION_PROVIDER'
  ]);

  const critical = {
    gatewayReady: gateway.ready,
    tokenPolicyReady: tokenPolicy.ready,
    tokenRouteReady: tokenRoute.ready,
    messagingProviderConfigured: ablyConfigured,
    messagingPackageReady: ablyPackage.ready,
    publicAssetsReady: publicAssets.ready
  };
  const englishRelayReady = Object.values(critical).every(Boolean);

  return {
    contract: 'lingosentinel.runtimeHealth/1.0',
    version: VERSION,
    ok: englishRelayReady,
    status: englishRelayReady ? 'ready' : 'degraded',
    englishRelayReady,
    translationReady: translationConfigured,
    translationRequiredForEnglishRelay: false,
    critical,
    services: {
      gateway: { ready: gateway.ready, version: gateway.version || '' },
      tokenPolicy: { ready: tokenPolicy.ready, version: tokenPolicy.version || '' },
      tokenRoute: { ready: tokenRoute.ready, version: tokenRoute.version || '' },
      messagingProvider: { configured: ablyConfigured, packageReady: ablyPackage.ready },
      publicAssets
    },
    boundaries: {
      diagnosticsRedacted: true,
      secretValuesExposed: false,
      internalPathsExposed: false,
      marionVisibleParticipant: false,
      publicTelemetryPublishAllowed: false
    },
    timestamp: new Date().toISOString()
  };
}

function harden(res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('X-Content-Type-Options', 'nosniff');
}

router.get(['/runtime/health', '/layer1/health'], (req, res) => {
  harden(res);
  const health = buildRuntimeHealth({ rootDir: req.app && req.app.get ? req.app.get('lingosentinelRootDir') : undefined });
  return res.status(200).json(health);
});

router.VERSION = VERSION;
router.buildRuntimeHealth = buildRuntimeHealth;
module.exports = router;
module.exports.VERSION = VERSION;
module.exports.buildRuntimeHealth = buildRuntimeHealth;

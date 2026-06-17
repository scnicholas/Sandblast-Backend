/*
 * LingoSentinel Widget Integration Hook
 * Path: public/lingosentinel/lingosentinel-widget-integration-hook.js
 * Purpose: Auto-installs the public translation client + widget bridge.
 * Load order:
 *   1) lingoSentinel-public-translation-client.js
 *   2) lingoSentinel-widget-translation-bridge.js
 *   3) lingoSentinel-widget-integration-hook.js
 */
(function installLingoSentinelWidgetIntegration(global) {
  'use strict';

  var VERSION = '2.0.0-hook';
  var DEFAULT_ROOT_SELECTORS = [
    '[data-lingosentinel-widget]',
    '[data-nyx-widget]',
    '[data-marion-widget]',
    '#lingosentinel-widget',
    '#nyx-widget',
    '#marion-widget'
  ];

  function safeString(value) {
    if (value === null || value === undefined) return '';
    return String(value);
  }

  function asBool(value, fallback) {
    if (value === undefined || value === null || value === '') return fallback;
    var normalized = safeString(value).toLowerCase().trim();
    if (['1', 'true', 'yes', 'on'].indexOf(normalized) >= 0) return true;
    if (['0', 'false', 'no', 'off'].indexOf(normalized) >= 0) return false;
    return fallback;
  }

  function currentScript() {
    if (!global.document) return null;
    return global.document.currentScript || (function findScript() {
      var scripts = global.document.getElementsByTagName('script');
      return scripts[scripts.length - 1] || null;
    })();
  }

  function datasetFromScript() {
    var script = currentScript();
    var data = script && script.dataset ? script.dataset : {};
    return {
      baseUrl: data.baseUrl || data.lingosentinelBaseUrl || '',
      translateEndpoint: data.translateEndpoint || '/api/lingosentinel/translate',
      detectEndpoint: data.detectEndpoint || '/api/lingosentinel/detect',
      healthEndpoint: data.healthEndpoint || '/api/lingosentinel/health',
      userLanguage: data.userLanguage || data.sourceLanguage || 'auto',
      publicLanguage: data.publicLanguage || data.targetLanguage || 'en',
      enabled: asBool(data.enabled, true),
      debug: asBool(data.debug, false),
      autoAttach: asBool(data.autoAttach, true),
      autoEvents: asBool(data.autoEvents, true),
      rootSelector: data.rootSelector || ''
    };
  }

  function findRoots(rootSelector) {
    if (!global.document) return [];
    var selectors = rootSelector ? [rootSelector] : DEFAULT_ROOT_SELECTORS;
    var found = [];
    selectors.forEach(function query(selector) {
      try {
        var nodes = global.document.querySelectorAll(selector);
        for (var i = 0; i < nodes.length; i += 1) {
          if (found.indexOf(nodes[i]) < 0) found.push(nodes[i]);
        }
      } catch (error) {}
    });
    return found.length ? found : [global.document];
  }

  function dispatch(name, detail) {
    try {
      global.dispatchEvent(new CustomEvent(name, { detail: detail }));
    } catch (error) {}
  }

  function createIntegration(options) {
    options = options || {};
    var Client = global.LingoSentinelPublicTranslationClient || global.LingoSentinelTranslationClient;
    var Bridge = global.LingoSentinelWidgetTranslationBridge;

    if (!Client) throw new Error('Missing LingoSentinelPublicTranslationClient. Load the public translation client first.');
    if (!Bridge) throw new Error('Missing LingoSentinelWidgetTranslationBridge. Load the bridge before the integration hook.');

    var client = options.client || new Client({
      baseUrl: options.baseUrl,
      translateEndpoint: options.translateEndpoint,
      detectEndpoint: options.detectEndpoint,
      healthEndpoint: options.healthEndpoint,
      sourceLanguage: options.userLanguage || 'auto',
      targetLanguage: options.publicLanguage || 'en',
      enabled: options.enabled !== false,
      debug: !!options.debug
    });

    var bridge = options.bridge || new Bridge({
      client: client,
      userLanguage: options.userLanguage || 'auto',
      publicLanguage: options.publicLanguage || 'en',
      inboundTargetLanguage: options.publicLanguage || 'en',
      outboundTargetLanguage: options.userLanguage === 'auto' ? null : options.userLanguage,
      enabled: options.enabled !== false,
      debug: !!options.debug
    });

    if (options.autoEvents !== false) bridge.installGlobalEventBridge();
    if (options.autoAttach !== false) {
      findRoots(options.rootSelector).forEach(function attach(root) { bridge.attachToWidget(root); });
    }

    var api = {
      version: VERSION,
      client: client,
      bridge: bridge,
      configure: function configure(nextOptions) {
        nextOptions = nextOptions || {};
        if (client.configure) client.configure(nextOptions.clientOptions || nextOptions);
        if (bridge.configure) bridge.configure(nextOptions);
        return api;
      },
      setLanguages: function setLanguages(userLanguage, publicLanguage) {
        bridge.setLanguages(userLanguage, publicLanguage);
        return api;
      },
      translate: function translate(text, translateOptions) {
        return bridge.translateTurn(Object.assign({}, translateOptions || {}, { text: text }));
      },
      translateUserInput: function translateUserInput(text, translateOptions) {
        return bridge.translateUserInput(text, translateOptions || {});
      },
      translateAssistantOutput: function translateAssistantOutput(text, translateOptions) {
        return bridge.translateAssistantOutput(text, translateOptions || {});
      },
      attach: function attach(root) {
        bridge.attachToWidget(root || global.document);
        return api;
      },
      state: function state() {
        return bridge.getState();
      },
      destroy: function destroy() {
        bridge.destroy();
        if (client.destroy) client.destroy();
      }
    };

    global.LingoSentinel = global.LingoSentinel || {};
    global.LingoSentinel.translation = api;
    global.LingoSentinel.translate = api.translate;
    global.LingoSentinel.setLanguages = api.setLanguages;
    global.LingoSentinel.attachTranslationBridge = api.attach;

    dispatch('lingosentinel:integration-ready', {
      version: VERSION,
      clientVersion: Client.VERSION || 'unknown',
      bridgeVersion: Bridge.VERSION || 'unknown',
      state: bridge.getState()
    });

    return api;
  }

  function boot() {
    if (global.__lingoSentinelTranslationHookInstalled) return global.LingoSentinel && global.LingoSentinel.translation;
    global.__lingoSentinelTranslationHookInstalled = true;

    var options = datasetFromScript();
    try {
      return createIntegration(options);
    } catch (error) {
      global.__lingoSentinelTranslationHookInstalled = false;
      dispatch('lingosentinel:integration-error', {
        version: VERSION,
        error: error && error.message ? error.message : 'LingoSentinel integration failed.'
      });
      if (options.debug && global.console) global.console.error('[LingoSentinelHook]', error);
      return null;
    }
  }

  global.installLingoSentinelWidgetIntegration = createIntegration;

  if (global.document && global.document.readyState === 'loading') {
    global.document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = createIntegration;
  }
})(typeof window !== 'undefined' ? window : globalThis);

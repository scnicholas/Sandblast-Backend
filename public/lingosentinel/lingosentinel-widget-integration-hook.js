/*
* LingoSentinel Widget Integration Hook
* Path: public/lingosentinel/lingosentinel-widget-integration-hook.js
* Purpose: Auto-installs the public translation client + widget bridge.
* Load order:
*   1) lingosentinel-public-translation-client.js
*   2) lingosentinel-widget-translation-bridge.js
*   3) lingosentinel-widget-integration-hook.js
*/
(function installLingoSentinelWidgetIntegration(global) {
'use strict';

var VERSION = '2.0.1-hook-script-dataset-hardlock';
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

function assign(target) {
target = target || {};
for (var i = 1; i < arguments.length; i += 1) {
var source = arguments[i] || {};
if (typeof source !== 'object' && typeof source !== 'function') continue;
Object.keys(source).forEach(function copy(key) {
if (source[key] !== undefined) target[key] = source[key];
});
}
return target;
}

function asBool(value, fallback) {
if (value === undefined || value === null || value === '') return fallback;
var normalized = safeString(value).toLowerCase().trim();
if (['1', 'true', 'yes', 'on'].indexOf(normalized) >= 0) return true;
if (['0', 'false', 'no', 'off'].indexOf(normalized) >= 0) return false;
return fallback;
}

function asInt(value, fallback) {
var number = parseInt(value, 10);
return isNaN(number) ? fallback : number;
}

function currentScript() {
if (!global.document) return null;
return global.document.currentScript || (function findScript() {
var scripts = global.document.getElementsByTagName('script');
return scripts[scripts.length - 1] || null;
})();
}

function datasetFromScript(script) {
var data = script && script.dataset ? script.dataset : {};
var external = global.LINGOSENTINEL_TRANSLATION_CONFIG || global.LingoSentinelTranslationConfig || {};
var scriptOptions = {
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
maxContextTurns: asInt(data.maxContextTurns, undefined),
maxBridgeTurns: asInt(data.maxBridgeTurns, undefined),
maxTextChars: asInt(data.maxTextChars, undefined),
cacheTtlMs: asInt(data.cacheTtlMs, undefined),
debounceMs: asInt(data.debounceMs, undefined),
rootSelector: data.rootSelector || ''
};
return assign({}, scriptOptions, external);
}

var BOOT_OPTIONS = datasetFromScript(currentScript());

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

function createEvent(name, detail) {
if (global.CustomEvent) return new CustomEvent(name, { detail: detail });
if (global.document && global.document.createEvent) {
var event = global.document.createEvent('CustomEvent');
event.initCustomEvent(name, false, false, detail);
return event;
}
return null;
}

function dispatch(name, detail) {
try {
var event = createEvent(name, detail);
if (event && global.dispatchEvent) global.dispatchEvent(event);
} catch (error) {}
}

function createIntegration(options) {
options = assign({}, BOOT_OPTIONS, options || {});
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
maxContextTurns: options.maxContextTurns,
maxTextChars: options.maxTextChars,
cacheTtlMs: options.cacheTtlMs,
enabled: options.enabled !== false,
debug: !!options.debug
});

var bridge = options.bridge || new Bridge({
client: client,
userLanguage: options.userLanguage || 'auto',
publicLanguage: options.publicLanguage || 'en',
inboundTargetLanguage: options.publicLanguage || 'en',
outboundTargetLanguage: options.userLanguage === 'auto' ? null : options.userLanguage,
maxBridgeTurns: options.maxBridgeTurns,
maxTurnChars: options.maxTextChars,
debounceMs: options.debounceMs,
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
setEnabled: function setEnabled(enabled) {
bridge.setEnabled(enabled);
if (client.configure) client.configure({ enabled: enabled !== false });
return api;
},
setLanguages: function setLanguages(userLanguage, publicLanguage) {
bridge.setLanguages(userLanguage, publicLanguage);
return api;
},
translate: function translate(text, translateOptions) {
return bridge.translateTurn(assign({}, translateOptions || {}, { text: text }));
},
translateUserInput: function translateUserInput(text, translateOptions) {
return bridge.translateUserInput(text, translateOptions || {});
},
translateAssistantOutput: function translateAssistantOutput(text, translateOptions) {
return bridge.translateAssistantOutput(text, translateOptions || {});
},
detect: function detect(text, detectOptions) {
return client.detect(text, detectOptions || {});
},
health: function health() {
return client.health();
},
addGlossaryEntry: function addGlossaryEntry(source, target, notes) {
if (client.addGlossaryEntry) client.addGlossaryEntry(source, target, notes);
return api;
},
clearContext: function clearContext(clearOptions) {
bridge.clearContext(clearOptions || {});
return api;
},
getContext: function getContext() {
return bridge.context();
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
if (global.LingoSentinel && global.LingoSentinel.translation === api) delete global.LingoSentinel.translation;
global.__lingoSentinelTranslationHookInstalled = false;
}
};

global.LingoSentinel = global.LingoSentinel || {};
global.LingoSentinel.translation = api;
global.LingoSentinel.translate = api.translate;
global.LingoSentinel.setLanguages = api.setLanguages;
global.LingoSentinel.clearTranslationContext = api.clearContext;
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

try {
return createIntegration(BOOT_OPTIONS);
} catch (error) {
global.__lingoSentinelTranslationHookInstalled = false;
dispatch('lingosentinel:integration-error', {
version: VERSION,
error: error && error.message ? error.message : 'LingoSentinel integration failed.'
});
if (BOOT_OPTIONS.debug && global.console) global.console.error('[LingoSentinelHook]', error);
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

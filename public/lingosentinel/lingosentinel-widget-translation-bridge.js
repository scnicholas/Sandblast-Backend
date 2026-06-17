/*
* LingoSentinel Widget Translation Bridge
* Path: public/lingosentinel/lingosentinel-widget-translation-bridge.js
* Purpose: Non-invasive bridge between a public widget and the translation client.
* Depends on: lingosentinel-public-translation-client.js loaded first.
*/
(function attachLingoSentinelWidgetTranslationBridge(global) {
'use strict';

var VERSION = '2.0.1-bridge-context-return-hardlock';

function safeString(value) {
if (value === null || value === undefined) return '';
return String(value);
}

function nowIso() {
return new Date().toISOString();
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

function makeId(prefix) {
return (prefix || 'lsb') + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

function clamp(value, maxChars) {
var text = safeString(value).replace(/\u0000/g, '').trim();
if (!maxChars || text.length <= maxChars) return text;
return text.slice(0, maxChars);
}

function createEvent(name, detail) {
if (global.CustomEvent) return new CustomEvent(name, { detail: detail, bubbles: true, cancelable: false });
if (global.document && global.document.createEvent) {
var event = global.document.createEvent('CustomEvent');
event.initCustomEvent(name, true, false, detail);
return event;
}
return null;
}

function dispatch(name, detail, target) {
try {
var event = createEvent(name, detail);
if (event) (target || global).dispatchEvent(event);
} catch (error) {}
}

function inferRole(payload) {
var role = safeString(payload && payload.role).toLowerCase();
if (role) return role;
var direction = safeString(payload && payload.direction).toLowerCase();
if (direction === 'inbound') return 'user';
if (direction === 'outbound') return 'assistant';
return 'unknown';
}

function isAutoLanguage(language) {
var value = safeString(language).toLowerCase();
return !value || value === 'auto' || value === 'automatic' || value === 'autodetect';
}

function createDebounce(fn, delay) {
var timer = null;
return function debounced() {
var args = arguments;
var self = this;
global.clearTimeout(timer);
timer = global.setTimeout(function run() { fn.apply(self, args); }, delay || 0);
};
}

function Bridge(options) {
options = options || {};
var Client = global.LingoSentinelPublicTranslationClient || global.LingoSentinelTranslationClient;
if (!Client && !options.client) {
throw new Error('LingoSentinel translation client must load before the widget bridge.');
}

this.client = options.client || new Client(options.clientOptions || options);
this.options = assign({
enabled: true,
inboundTargetLanguage: 'en',
outboundTargetLanguage: null,
publicLanguage: 'en',
userLanguage: 'auto',
maxTurnChars: 6000,
maxBridgeTurns: 20,
debounceMs: 350,
autoDispatch: true,
debug: false
}, options || {});

this.turns = [];
this.listeners = {};
this.boundElements = [];
this.unsubscribers = [];
this.globalEventsInstalled = false;
this.state = {
id: makeId('bridge'),
createdAt: nowIso(),
lastTranslationAt: null,
lastError: null,
lastUserLanguage: null,
lastAssistantLanguage: this.options.publicLanguage || 'en'
};
}

Bridge.VERSION = VERSION;

Bridge.prototype.log = function log() {
if (!this.options.debug || !global.console) return;
global.console.log.apply(global.console, ['[LingoSentinelBridge]'].concat([].slice.call(arguments)));
};

Bridge.prototype.on = function on(eventName, handler) {
if (!eventName || typeof handler !== 'function') return this;
this.listeners[eventName] = this.listeners[eventName] || [];
this.listeners[eventName].push(handler);
return this;
};

Bridge.prototype.off = function off(eventName, handler) {
if (!eventName) return this;
if (!handler) {
delete this.listeners[eventName];
return this;
}
var list = this.listeners[eventName] || [];
this.listeners[eventName] = list.filter(function keep(item) { return item !== handler; });
return this;
};

Bridge.prototype.emit = function emit(eventName, detail) {
(this.listeners[eventName] || []).forEach(function call(handler) {
try { handler(detail); } catch (error) {}
});
dispatch('lingosentinel:bridge:' + eventName, detail);
return this;
};

Bridge.prototype.configure = function configure(nextOptions) {
nextOptions = nextOptions || {};
this.options = assign({}, this.options, nextOptions || {});
if (nextOptions.clientOptions && this.client.configure) this.client.configure(nextOptions.clientOptions);
return this;
};

Bridge.prototype.setEnabled = function setEnabled(enabled) {
this.options.enabled = enabled !== false;
this.emit('enabledChanged', { enabled: this.options.enabled, createdAt: nowIso() });
return this;
};

Bridge.prototype.setLanguages = function setLanguages(userLanguage, publicLanguage) {
this.options.userLanguage = userLanguage || this.options.userLanguage || 'auto';
this.options.publicLanguage = publicLanguage || this.options.publicLanguage || 'en';
this.options.inboundTargetLanguage = this.options.publicLanguage;
this.options.outboundTargetLanguage = isAutoLanguage(this.options.userLanguage) ? null : this.options.userLanguage;
if (this.client.setLanguages) this.client.setLanguages(this.options.userLanguage, this.options.publicLanguage);
this.emit('languagesChanged', {
userLanguage: this.options.userLanguage,
publicLanguage: this.options.publicLanguage
});
return this;
};

Bridge.prototype.remember = function remember(turn) {
var entry = assign({
id: makeId('bridge_turn'),
role: 'unknown',
originalText: '',
translatedText: '',
sourceLanguage: 'auto',
targetLanguage: this.options.publicLanguage,
direction: 'neutral',
intent: '',
domain: 'lingosentinel-public-widget',
createdAt: nowIso()
}, turn || {});
entry.originalText = clamp(entry.originalText, this.options.maxTurnChars);
entry.translatedText = clamp(entry.translatedText, this.options.maxTurnChars);
this.turns.push(entry);
this.turns = this.turns.slice(-this.options.maxBridgeTurns);
this.emit('turnRemembered', { turn: assign({}, entry), count: this.turns.length });
return entry;
};

Bridge.prototype.context = function context() {
return this.turns.slice(-this.options.maxBridgeTurns).map(function copy(turn) {
return assign({}, turn);
});
};

Bridge.prototype.clearContext = function clearContext(options) {
this.turns = [];
this.state.lastUserLanguage = null;
this.state.lastAssistantLanguage = this.options.publicLanguage || 'en';
if (this.client.clearContext) this.client.clearContext(options || {});
this.emit('contextCleared', { bridgeId: this.state.id, createdAt: nowIso() });
return this;
};

Bridge.prototype.resolveOutboundTarget = function resolveOutboundTarget(options) {
var requested = options && options.targetLanguage;
if (!isAutoLanguage(requested)) return requested;
if (!isAutoLanguage(this.options.outboundTargetLanguage)) return this.options.outboundTargetLanguage;
if (!isAutoLanguage(this.options.userLanguage)) return this.options.userLanguage;
if (!isAutoLanguage(this.state.lastUserLanguage) && this.state.lastUserLanguage !== this.options.publicLanguage) {
return this.state.lastUserLanguage;
}
return null;
};

Bridge.prototype.translateUserInput = function translateUserInput(text, options) {
var self = this;
var clean = clamp(text, this.options.maxTurnChars);
var request = assign({
role: 'user',
direction: 'inbound',
sourceLanguage: this.options.userLanguage || 'auto',
targetLanguage: this.options.inboundTargetLanguage || this.options.publicLanguage || 'en',
domain: 'lingosentinel-public-widget',
intent: 'translate-user-input',
metadata: { bridgeVersion: VERSION, bridgeId: this.state.id, bridgeContext: this.context() }
}, options || {}, { text: clean });

if (!this.options.enabled || !clean) {
return Promise.resolve({ ok: true, bypassed: true, text: clean, translatedText: clean, reason: !clean ? 'empty_text' : 'bridge_disabled' });
}

return this.client.translate(request).then(function finish(result) {
var detected = result.detectedLanguage || result.sourceLanguage || request.sourceLanguage;
self.state.lastTranslationAt = nowIso();
if (!isAutoLanguage(detected)) self.state.lastUserLanguage = detected;
self.remember({
id: result.turnId,
role: 'user',
direction: 'inbound',
originalText: clean,
translatedText: result.translatedText || clean,
sourceLanguage: detected,
targetLanguage: result.targetLanguage || request.targetLanguage,
intent: request.intent,
domain: request.domain,
ok: result.ok !== false
});
self.emit('userInputTranslated', result);
return result;
}).catch(function fail(error) {
self.state.lastError = error && error.message ? error.message : 'User input translation failed.';
self.emit('error', { error: self.state.lastError, phase: 'user-input', createdAt: nowIso() });
return { ok: false, fallback: true, error: self.state.lastError, text: clean, translatedText: clean };
});
};

Bridge.prototype.translateAssistantOutput = function translateAssistantOutput(text, options) {
var self = this;
options = options || {};
var clean = clamp(text, this.options.maxTurnChars);
var target = this.resolveOutboundTarget(options);

if (!this.options.enabled || !clean) {
return Promise.resolve({ ok: true, bypassed: true, text: clean, translatedText: clean, reason: !clean ? 'empty_text' : 'bridge_disabled' });
}

if (!target || target === this.options.publicLanguage) {
this.remember({
role: 'assistant',
direction: 'outbound',
originalText: clean,
translatedText: clean,
sourceLanguage: this.options.publicLanguage,
targetLanguage: this.options.publicLanguage,
ok: true,
bypassed: true
});
return Promise.resolve({ ok: true, bypassed: true, text: clean, translatedText: clean, sourceLanguage: this.options.publicLanguage, targetLanguage: this.options.publicLanguage });
}

var request = assign({
role: 'assistant',
direction: 'outbound',
sourceLanguage: this.options.publicLanguage || 'en',
targetLanguage: target,
domain: 'lingosentinel-public-widget',
intent: 'translate-assistant-output',
metadata: { bridgeVersion: VERSION, bridgeId: this.state.id, bridgeContext: this.context() }
}, options, { text: clean, targetLanguage: target });

return this.client.translate(request).then(function finish(result) {
self.state.lastTranslationAt = nowIso();
self.state.lastAssistantLanguage = result.targetLanguage || request.targetLanguage;
self.remember({
id: result.turnId,
role: 'assistant',
direction: 'outbound',
originalText: clean,
translatedText: result.translatedText || clean,
sourceLanguage: result.sourceLanguage || request.sourceLanguage,
targetLanguage: result.targetLanguage || request.targetLanguage,
intent: request.intent,
domain: request.domain,
ok: result.ok !== false
});
self.emit('assistantOutputTranslated', result);
return result;
}).catch(function fail(error) {
self.state.lastError = error && error.message ? error.message : 'Assistant output translation failed.';
self.emit('error', { error: self.state.lastError, phase: 'assistant-output', createdAt: nowIso() });
return { ok: false, fallback: true, error: self.state.lastError, text: clean, translatedText: clean };
});
};

Bridge.prototype.translateTurn = function translateTurn(payload) {
payload = payload || {};
var role = inferRole(payload);
if (role === 'assistant' || role === 'marion' || role === 'nyx' || payload.direction === 'outbound') {
return this.translateAssistantOutput(payload.text || payload.message || payload.content, payload);
}
return this.translateUserInput(payload.text || payload.message || payload.content, payload);
};

Bridge.prototype.installGlobalEventBridge = function installGlobalEventBridge() {
var self = this;
if (this.globalEventsInstalled) return this;
if (!global.addEventListener || !global.removeEventListener) {
this.emit('globalBridgeSkipped', { reason: 'event_target_unavailable', createdAt: nowIso() });
return this;
}
this.globalEventsInstalled = true;

var eventNames = [
'lingosentinel:translate-request',
'lingosentinel:user-message',
'lingosentinel:assistant-message',
'lingosentinel:user-input',
'lingosentinel:assistant-output',
'nyx:user-message',
'nyx:assistant-message',
'marion:user-message',
'marion:response'
];

eventNames.forEach(function bind(name) {
var handler = function handle(event) {
var detail = event && event.detail ? event.detail : {};
var payload = typeof detail === 'string' ? { text: detail } : assign({}, detail);
if (name.indexOf('assistant') >= 0 || name.indexOf('response') >= 0 || name.indexOf('output') >= 0) payload.role = payload.role || 'assistant';
if (name.indexOf('user') >= 0 || name.indexOf('input') >= 0) payload.role = payload.role || 'user';

self.translateTurn(payload).then(function translated(result) {
if (!self.options.autoDispatch) return;
dispatch('lingosentinel:translated', {
sourceEvent: name,
request: payload,
result: result,
translatedText: result.translatedText
}, event && event.target ? event.target : global);
});
};
global.addEventListener(name, handler);
self.unsubscribers.push(function unbind() { global.removeEventListener(name, handler); });
});

var resetHandler = function reset(event) { self.clearContext(event && event.detail ? event.detail : {}); };
var languageHandler = function setLanguages(event) {
var detail = event && event.detail ? event.detail : {};
self.setLanguages(detail.userLanguage || detail.sourceLanguage, detail.publicLanguage || detail.targetLanguage);
};
global.addEventListener('lingosentinel:reset-context', resetHandler);
global.addEventListener('lingosentinel:set-languages', languageHandler);
self.unsubscribers.push(function unbindReset() { global.removeEventListener('lingosentinel:reset-context', resetHandler); });
self.unsubscribers.push(function unbindLanguages() { global.removeEventListener('lingosentinel:set-languages', languageHandler); });

this.emit('globalBridgeInstalled', { events: eventNames.slice(), createdAt: nowIso() });
return this;
};

Bridge.prototype.bindInputElement = function bindInputElement(element, options) {
var self = this;
if (!element || element.__lingoSentinelBridgeBound) return this;
element.__lingoSentinelBridgeBound = true;

options = options || {};
var mode = safeString(element.getAttribute('data-lingosentinel-mode') || options.mode || 'change');
var targetSelector = element.getAttribute('data-lingosentinel-target') || '';
var eventName = mode === 'input' ? 'input' : 'change';
var delay = parseInt(element.getAttribute('data-lingosentinel-debounce') || this.options.debounceMs, 10);

var translateAndWrite = function translateAndWrite() {
var text = element.value || element.textContent || '';
if (!safeString(text).trim()) return;
element.setAttribute('data-lingosentinel-busy', 'true');
self.translateUserInput(text, options).then(function (result) {
element.setAttribute('data-lingosentinel-busy', 'false');
element.setAttribute('data-lingosentinel-last-ok', result.ok !== false ? 'true' : 'false');
element.setAttribute('data-lingosentinel-last-language', result.detectedLanguage || result.sourceLanguage || 'auto');
if (targetSelector && global.document) {
var target = global.document.querySelector(targetSelector);
if (target) target.textContent = result.translatedText || text;
}
dispatch('lingosentinel:element-translated', { element: element, result: result }, element);
}).catch(function fail(error) {
element.setAttribute('data-lingosentinel-busy', 'false');
element.setAttribute('data-lingosentinel-last-ok', 'false');
self.emit('error', { error: error && error.message ? error.message : 'Element translation failed.', createdAt: nowIso() });
});
};

var handler = eventName === 'input' ? createDebounce(translateAndWrite, isNaN(delay) ? this.options.debounceMs : delay) : translateAndWrite;
element.addEventListener(eventName, handler);
this.boundElements.push(element);
this.unsubscribers.push(function unbind() {
element.removeEventListener(eventName, handler);
try { delete element.__lingoSentinelBridgeBound; } catch (error) { element.__lingoSentinelBridgeBound = false; }
});
return this;
};

Bridge.prototype.attachToWidget = function attachToWidget(root) {
if (!global.document) return this;
var scope = root || global.document;
var nodes = scope.querySelectorAll ? scope.querySelectorAll('[data-lingosentinel-input], [data-lingosentinel-translate-input]') : [];
for (var i = 0; i < nodes.length; i += 1) this.bindInputElement(nodes[i]);
this.emit('widgetAttached', { inputCount: nodes.length || 0, createdAt: nowIso() });
return this;
};

Bridge.prototype.getState = function getState() {
return assign({}, this.state, {
version: VERSION,
enabled: this.options.enabled,
userLanguage: this.options.userLanguage,
publicLanguage: this.options.publicLanguage,
inboundTargetLanguage: this.options.inboundTargetLanguage,
outboundTargetLanguage: this.options.outboundTargetLanguage,
contextSize: this.turns.length,
boundElementCount: this.boundElements.length,
globalEventsInstalled: this.globalEventsInstalled
});
};

Bridge.prototype.destroy = function destroy() {
this.unsubscribers.forEach(function call(unsubscribe) {
try { unsubscribe(); } catch (error) {}
});
this.unsubscribers = [];
this.boundElements = [];
this.listeners = {};
this.globalEventsInstalled = false;
};

global.LingoSentinelWidgetTranslationBridge = Bridge;

if (typeof module !== 'undefined' && module.exports) {
module.exports = Bridge;
}
})(typeof window !== 'undefined' ? window : globalThis);

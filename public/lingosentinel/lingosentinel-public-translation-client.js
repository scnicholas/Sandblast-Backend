/*
* LingoSentinel Public Translation Client
* Path: public/lingosentinel/lingosentinel-public-translation-client.js
* Purpose: Safe browser client for public LingoSentinel translation calls.
* Notes:
* - No API keys belong in this file.
* - This client talks only to your backend translation endpoints.
* - Designed for deeper conversations by carrying bounded session context.
*/
(function attachLingoSentinelPublicTranslationClient(global) {
'use strict';

var VERSION = '2.0.1-public-context-cache-hardlock';
var STORAGE_KEY = 'lingosentinel.public.sessionId';
var DEFAULTS = {
baseUrl: '',
translateEndpoint: '/api/lingosentinel/translate',
detectEndpoint: '/api/lingosentinel/detect',
healthEndpoint: '/api/lingosentinel/health',
timeoutMs: 15000,
maxTextChars: 6000,
maxContextTurns: 12,
maxContextTextChars: 1200,
cacheTtlMs: 60000,
maxCacheEntries: 120,
sourceLanguage: 'auto',
targetLanguage: 'en',
enabled: true,
debug: false,
credentials: 'same-origin'
};

var LANGUAGE_ALIASES = {
automatic: 'auto',
autodetect: 'auto',
'auto-detect': 'auto',
english: 'en',
french: 'fr',
spanish: 'es',
portuguese: 'pt',
mandarin: 'zh',
chinese: 'zh',
'chinese-mandarin': 'zh',
german: 'de',
italian: 'it',
hindi: 'hi',
japanese: 'ja',
korean: 'ko'
};

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

function nowIso() {
return new Date().toISOString();
}

function safeString(value) {
if (value === null || value === undefined) return '';
return String(value);
}

function clampText(value, maxChars) {
var text = safeString(value).replace(/\u0000/g, '').trim();
if (!maxChars || text.length <= maxChars) return text;
return text.slice(0, maxChars);
}

function makeId(prefix) {
var random = Math.random().toString(36).slice(2, 10);
var stamp = Date.now().toString(36);
return (prefix || 'ls') + '_' + stamp + '_' + random;
}

function normalizeLanguage(value, fallback) {
var raw = safeString(value || fallback || '').trim();
if (!raw) return fallback || 'auto';
var key = raw.toLowerCase().replace(/\s+/g, '-');
return LANGUAGE_ALIASES[key] || key;
}

function readSessionId() {
try {
var existing = global.localStorage && global.localStorage.getItem(STORAGE_KEY);
if (existing) return existing;
var created = makeId('ls_public_session');
if (global.localStorage) global.localStorage.setItem(STORAGE_KEY, created);
return created;
} catch (error) {
return makeId('ls_public_session');
}
}

function createTimeoutController(timeoutMs) {
if (!global.AbortController) return null;
var cleared = false;
var controller = new global.AbortController();
var timer = global.setTimeout(function abortRequest() {
if (cleared) return;
try { controller.abort(); } catch (error) {}
}, timeoutMs || DEFAULTS.timeoutMs);
return {
controller: controller,
signal: controller.signal,
clear: function clearTimer() {
if (cleared) return;
cleared = true;
global.clearTimeout(timer);
}
};
}

function toQueryString(params) {
var pairs = [];
Object.keys(params || {}).forEach(function addPair(key) {
if (params[key] === undefined || params[key] === null || params[key] === '') return;
pairs.push(encodeURIComponent(key) + '=' + encodeURIComponent(params[key]));
});
return pairs.length ? '?' + pairs.join('&') : '';
}

function stableStringify(value) {
if (value === null || value === undefined) return '';
if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']';
if (typeof value === 'object') {
return '{' + Object.keys(value).sort().map(function pair(key) {
return JSON.stringify(key) + ':' + stableStringify(value[key]);
}).join(',') + '}';
}
return JSON.stringify(value);
}

function hashText(value) {
var text = safeString(value);
var hash = 5381;
for (var i = 0; i < text.length; i += 1) {
hash = ((hash << 5) + hash) ^ text.charCodeAt(i);
}
return (hash >>> 0).toString(36);
}

function contextFingerprint(context, glossary) {
var compactContext = (context || []).slice(-DEFAULTS.maxContextTurns).map(function compact(turn) {
return {
r: turn.role || '',
d: turn.direction || '',
s: turn.sourceLanguage || '',
t: turn.targetLanguage || '',
x: clampText(turn.text || turn.originalText || '', 220),
y: clampText(turn.translatedText || '', 220),
i: turn.intent || ''
};
});
var compactGlossary = (glossary || []).slice(-80).map(function compact(entry) {
return {
s: clampText(entry.source || '', 140),
t: clampText(entry.target || '', 140),
n: clampText(entry.notes || '', 140)
};
});
return hashText(stableStringify({ c: compactContext, g: compactGlossary }));
}

function stableCacheKey(payload) {
return [
payload.text || '',
payload.sourceLanguage || '',
payload.targetLanguage || '',
payload.domain || '',
payload.intent || '',
payload.contextFingerprint || contextFingerprint(payload.context, payload.glossary)
].join('\n::');
}

function normalizeProviderResponse(response) {
var root = response || {};
var data = root.data || root.result || root.payload || root;
var firstTranslation = data.translations && data.translations[0] ? data.translations[0] : null;
var translatedText = data.translatedText || data.translation || data.output || data.targetText || data.text;
if (!translatedText && firstTranslation) translatedText = firstTranslation.translatedText || firstTranslation.text || firstTranslation.translation;
return assign({}, root, data, {
translatedText: translatedText,
sourceLanguage: data.sourceLanguage || data.source || data.from || root.sourceLanguage,
detectedLanguage: data.detectedLanguage || data.language || data.detected || root.detectedLanguage,
targetLanguage: data.targetLanguage || data.target || data.to || root.targetLanguage,
provider: data.provider || root.provider,
confidence: data.confidence !== undefined ? data.confidence : root.confidence
});
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

function PublicTranslationClient(options) {
this.options = assign({}, DEFAULTS, options || {});
this.options.sourceLanguage = normalizeLanguage(this.options.sourceLanguage, 'auto');
this.options.targetLanguage = normalizeLanguage(this.options.targetLanguage, 'en');
this.sessionId = this.options.sessionId || readSessionId();
this.context = [];
this.glossary = [];
this.listeners = {};
this.cache = new Map();
}

PublicTranslationClient.VERSION = VERSION;

PublicTranslationClient.prototype.configure = function configure(nextOptions) {
this.options = assign({}, this.options, nextOptions || {});
this.options.sourceLanguage = normalizeLanguage(this.options.sourceLanguage, 'auto');
this.options.targetLanguage = normalizeLanguage(this.options.targetLanguage, 'en');
if (nextOptions && nextOptions.sessionId) this.sessionId = nextOptions.sessionId;
return this;
};

PublicTranslationClient.prototype.on = function on(eventName, handler) {
if (!eventName || typeof handler !== 'function') return this;
this.listeners[eventName] = this.listeners[eventName] || [];
this.listeners[eventName].push(handler);
return this;
};

PublicTranslationClient.prototype.off = function off(eventName, handler) {
if (!eventName) return this;
if (!handler) {
delete this.listeners[eventName];
return this;
}
var list = this.listeners[eventName] || [];
this.listeners[eventName] = list.filter(function keep(item) { return item !== handler; });
return this;
};

PublicTranslationClient.prototype.emit = function emit(eventName, detail) {
var list = this.listeners[eventName] || [];
list.forEach(function call(handler) {
try { handler(detail); } catch (error) {}
});
try {
if (global.dispatchEvent) {
var event = createEvent('lingosentinel:client:' + eventName, detail);
if (event) global.dispatchEvent(event);
}
} catch (error) {}
return this;
};

PublicTranslationClient.prototype.log = function log() {
if (!this.options.debug || !global.console) return;
global.console.log.apply(global.console, ['[LingoSentinelClient]'].concat([].slice.call(arguments)));
};

PublicTranslationClient.prototype.endpoint = function endpoint(path) {
var base = safeString(this.options.baseUrl).replace(/\/$/, '');
var suffix = safeString(path).charAt(0) === '/' ? path : '/' + path;
return base + suffix;
};

PublicTranslationClient.prototype.setLanguages = function setLanguages(sourceLanguage, targetLanguage) {
this.options.sourceLanguage = normalizeLanguage(sourceLanguage, this.options.sourceLanguage || 'auto');
this.options.targetLanguage = normalizeLanguage(targetLanguage, this.options.targetLanguage || 'en');
this.cache.clear();
this.emit('languagesChanged', {
sourceLanguage: this.options.sourceLanguage,
targetLanguage: this.options.targetLanguage
});
return this;
};

PublicTranslationClient.prototype.addGlossaryEntry = function addGlossaryEntry(source, target, notes) {
var cleanSource = clampText(source, 200);
var cleanTarget = clampText(target, 200);
if (!cleanSource || !cleanTarget) return this;
this.glossary.push({ source: cleanSource, target: cleanTarget, notes: clampText(notes, 300) });
this.glossary = this.glossary.slice(-80);
this.cache.clear();
this.emit('glossaryUpdated', { count: this.glossary.length, createdAt: nowIso() });
return this;
};

PublicTranslationClient.prototype.clearGlossary = function clearGlossary() {
this.glossary = [];
this.cache.clear();
this.emit('glossaryCleared', { createdAt: nowIso() });
return this;
};

PublicTranslationClient.prototype.getContextSnapshot = function getContextSnapshot() {
return this.context.slice(-this.options.maxContextTurns).map(function cleanTurn(turn) {
return assign({}, turn);
});
};

PublicTranslationClient.prototype.seedContext = function seedContext(turns) {
var self = this;
if (!Array.isArray(turns)) return this;
turns.forEach(function add(turn) { self.rememberTurn(assign({ silent: true }, turn || {})); });
this.cache.clear();
this.emit('contextSeeded', { sessionId: this.sessionId, contextSize: this.context.length, createdAt: nowIso() });
return this;
};

PublicTranslationClient.prototype.clearContext = function clearContext(options) {
this.context = [];
this.cache.clear();
if (options && options.rotateSession) {
this.sessionId = makeId('ls_public_session');
try {
if (global.localStorage) global.localStorage.setItem(STORAGE_KEY, this.sessionId);
} catch (error) {}
}
this.emit('contextCleared', { sessionId: this.sessionId, createdAt: nowIso() });
return this;
};

PublicTranslationClient.prototype.rememberTurn = function rememberTurn(turn) {
var entry = assign({
id: makeId('turn'),
role: 'unknown',
direction: 'neutral',
text: '',
translatedText: '',
sourceLanguage: this.options.sourceLanguage,
targetLanguage: this.options.targetLanguage,
domain: 'public',
intent: '',
createdAt: nowIso()
}, turn || {});
entry.text = clampText(entry.text || entry.originalText, this.options.maxContextTextChars);
entry.translatedText = clampText(entry.translatedText, this.options.maxContextTextChars);
delete entry.silent;
this.context.push(entry);
this.context = this.context.slice(-this.options.maxContextTurns);
if (!(turn && turn.silent)) {
this.emit('contextUpdated', { sessionId: this.sessionId, turn: assign({}, entry), contextSize: this.context.length });
}
return entry;
};

PublicTranslationClient.prototype.requestJson = function requestJson(path, payload, method) {
var self = this;
if (!global.fetch) {
var unavailable = new Error('Fetch is unavailable in this browser context.');
this.emit('error', { error: unavailable, path: path, createdAt: nowIso() });
return Promise.reject(unavailable);
}

var timeout = createTimeoutController(this.options.timeoutMs);
var requestOptions = {
method: method || 'POST',
headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
credentials: this.options.credentials || 'same-origin'
};
if (timeout) requestOptions.signal = timeout.signal;
if (requestOptions.method !== 'GET') requestOptions.body = JSON.stringify(payload || {});

return global.fetch(this.endpoint(path), requestOptions)
.then(function handleResponse(response) {
if (timeout) timeout.clear();
return response.text().then(function parse(text) {
var json = {};
try { json = text ? JSON.parse(text) : {}; } catch (error) {
throw new Error('Translation endpoint returned non-JSON response.');
}
if (!response.ok) {
throw new Error(json.error || json.message || ('Translation endpoint failed with HTTP ' + response.status));
}
return json;
});
})
.catch(function handleError(error) {
if (timeout) timeout.clear();
self.emit('error', { error: error, path: path, createdAt: nowIso() });
throw error;
});
};

PublicTranslationClient.prototype.health = function health() {
var path = this.options.healthEndpoint + toQueryString({ sessionId: this.sessionId, version: VERSION });
return this.requestJson(path, null, 'GET');
};

PublicTranslationClient.prototype.detect = function detect(text, options) {
var payload = assign({
text: clampText(text, this.options.maxTextChars),
sessionId: this.sessionId,
context: this.getContextSnapshot(),
createdAt: nowIso()
}, options || {});
if (!payload.text) return Promise.resolve({ ok: false, language: 'unknown', confidence: 0, reason: 'empty_text' });
return this.requestJson(this.options.detectEndpoint, payload, 'POST');
};

PublicTranslationClient.prototype.fromCache = function fromCache(key) {
var hit = this.cache.get(key);
if (!hit) return null;
if (Date.now() - hit.createdAt > this.options.cacheTtlMs) {
this.cache.delete(key);
return null;
}
return assign({}, hit.value, { cacheHit: true });
};

PublicTranslationClient.prototype.toCache = function toCache(key, value) {
if (!this.options.cacheTtlMs) return;
this.cache.set(key, { createdAt: Date.now(), value: assign({}, value) });
while (this.cache.size > this.options.maxCacheEntries) {
this.cache.delete(this.cache.keys().next().value);
}
};

PublicTranslationClient.prototype.translate = function translate(input, options) {
var self = this;
var request = typeof input === 'object' && input !== null ? assign({}, input) : { text: input };
request = assign({}, options || {}, request);

var text = clampText(request.text, this.options.maxTextChars);
var sourceLanguage = normalizeLanguage(request.sourceLanguage, this.options.sourceLanguage);
var targetLanguage = normalizeLanguage(request.targetLanguage, this.options.targetLanguage);

if (!this.options.enabled || request.enabled === false) {
return Promise.resolve({
ok: true,
bypassed: true,
reason: 'client_disabled',
text: text,
translatedText: text,
sourceLanguage: sourceLanguage,
targetLanguage: targetLanguage
});
}

if (!text) {
return Promise.resolve({ ok: false, text: '', translatedText: '', reason: 'empty_text' });
}

if (sourceLanguage !== 'auto' && sourceLanguage === targetLanguage) {
var sameLanguage = {
ok: true,
bypassed: true,
reason: 'same_language',
text: text,
translatedText: text,
sourceLanguage: sourceLanguage,
targetLanguage: targetLanguage
};
this.rememberTurn({
role: request.role || 'unknown',
direction: request.direction || 'neutral',
text: text,
translatedText: text,
sourceLanguage: sourceLanguage,
targetLanguage: targetLanguage,
domain: request.domain || 'public',
intent: request.intent || ''
});
return Promise.resolve(sameLanguage);
}

var context = this.getContextSnapshot();
var glossary = this.glossary.slice(-80);
var fingerprint = contextFingerprint(context, glossary);
var payload = {
text: text,
sourceLanguage: sourceLanguage,
targetLanguage: targetLanguage,
sessionId: this.sessionId,
turnId: request.turnId || makeId('translate'),
role: request.role || 'unknown',
direction: request.direction || 'neutral',
domain: request.domain || 'public',
intent: request.intent || '',
preserveTone: request.preserveTone !== false,
context: context,
glossary: glossary,
contextFingerprint: fingerprint,
metadata: assign({
clientVersion: VERSION,
page: global.location ? global.location.pathname : '',
createdAt: nowIso()
}, request.metadata || {})
};

var cacheKey = stableCacheKey(payload);
var cached = request.skipCache ? null : this.fromCache(cacheKey);
if (cached) {
cached.turnId = payload.turnId;
this.rememberTurn({
id: payload.turnId,
role: payload.role,
direction: payload.direction,
text: text,
translatedText: cached.translatedText || text,
sourceLanguage: cached.detectedLanguage || cached.sourceLanguage || sourceLanguage,
targetLanguage: cached.targetLanguage || targetLanguage,
intent: payload.intent,
domain: payload.domain
});
return Promise.resolve(cached);
}

this.emit('beforeTranslate', payload);

return this.requestJson(this.options.translateEndpoint, payload, 'POST')
.then(function normalizeResponse(response) {
var normalized = normalizeProviderResponse(response);
var translatedText = clampText(normalized.translatedText || text, self.options.maxTextChars);
var detectedLanguage = normalizeLanguage(normalized.detectedLanguage || normalized.language, sourceLanguage);
var result = assign({}, normalized, {
ok: normalized.ok !== false,
text: text,
translatedText: translatedText,
sourceLanguage: normalizeLanguage(normalized.sourceLanguage, sourceLanguage),
detectedLanguage: detectedLanguage,
targetLanguage: normalizeLanguage(normalized.targetLanguage, targetLanguage),
sessionId: self.sessionId,
turnId: payload.turnId,
contextFingerprint: fingerprint,
createdAt: nowIso()
});

self.rememberTurn({
id: payload.turnId,
role: payload.role,
direction: payload.direction,
text: text,
translatedText: translatedText,
sourceLanguage: result.detectedLanguage || result.sourceLanguage,
targetLanguage: result.targetLanguage,
intent: payload.intent,
domain: payload.domain
});

self.toCache(cacheKey, result);
self.emit('afterTranslate', result);
return result;
})
.catch(function fallback(error) {
var result = {
ok: false,
fallback: true,
error: error && error.message ? error.message : 'Translation failed.',
text: text,
translatedText: text,
sourceLanguage: sourceLanguage,
targetLanguage: targetLanguage,
sessionId: self.sessionId,
turnId: payload.turnId,
contextFingerprint: fingerprint,
createdAt: nowIso()
};
self.rememberTurn({
id: payload.turnId,
role: payload.role,
direction: payload.direction,
text: text,
translatedText: text,
sourceLanguage: sourceLanguage,
targetLanguage: targetLanguage,
intent: payload.intent,
domain: payload.domain,
error: result.error
});
self.emit('afterTranslate', result);
return result;
});
};

PublicTranslationClient.prototype.translateBatch = function translateBatch(items, options) {
var self = this;
var list = Array.isArray(items) ? items : [];
return list.reduce(function chain(promise, item) {
return promise.then(function push(results) {
return self.translate(item, options).then(function append(result) {
results.push(result);
return results;
});
});
}, Promise.resolve([]));
};

PublicTranslationClient.prototype.getState = function getState() {
return {
version: VERSION,
sessionId: this.sessionId,
enabled: this.options.enabled,
sourceLanguage: this.options.sourceLanguage,
targetLanguage: this.options.targetLanguage,
contextSize: this.context.length,
glossarySize: this.glossary.length,
cacheSize: this.cache.size
};
};

PublicTranslationClient.prototype.destroy = function destroy() {
this.listeners = {};
this.cache.clear();
};

global.LingoSentinelPublicTranslationClient = PublicTranslationClient;
global.LingoSentinelTranslationClient = global.LingoSentinelTranslationClient || PublicTranslationClient;

if (typeof module !== 'undefined' && module.exports) {
module.exports = PublicTranslationClient;
}
})(typeof window !== 'undefined' ? window : globalThis);

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

  var VERSION = '2.0.0-public';
  var STORAGE_KEY = 'lingosentinel.public.sessionId';
  var DEFAULTS = {
    baseUrl: '',
    translateEndpoint: '/api/lingosentinel/translate',
    detectEndpoint: '/api/lingosentinel/detect',
    healthEndpoint: '/api/lingosentinel/health',
    timeoutMs: 15000,
    maxTextChars: 6000,
    maxContextTurns: 12,
    cacheTtlMs: 60000,
    sourceLanguage: 'auto',
    targetLanguage: 'en',
    enabled: true,
    debug: false
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
    var controller = new global.AbortController();
    var timer = global.setTimeout(function abortRequest() {
      try { controller.abort(); } catch (error) {}
    }, timeoutMs || DEFAULTS.timeoutMs);
    return {
      controller: controller,
      signal: controller.signal,
      clear: function clearTimer() { global.clearTimeout(timer); }
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

  function stableCacheKey(payload) {
    return [
      payload.text || '',
      payload.sourceLanguage || '',
      payload.targetLanguage || '',
      payload.domain || '',
      payload.intent || ''
    ].join('\n::');
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
    return this;
  };

  PublicTranslationClient.prototype.on = function on(eventName, handler) {
    if (!eventName || typeof handler !== 'function') return this;
    this.listeners[eventName] = this.listeners[eventName] || [];
    this.listeners[eventName].push(handler);
    return this;
  };

  PublicTranslationClient.prototype.off = function off(eventName, handler) {
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
      if (global.CustomEvent && global.dispatchEvent) {
        global.dispatchEvent(new CustomEvent('lingosentinel:client:' + eventName, { detail: detail }));
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
    if (this.glossary.length > 80) this.glossary = this.glossary.slice(-80);
    return this;
  };

  PublicTranslationClient.prototype.getContextSnapshot = function getContextSnapshot() {
    return this.context.slice(-this.options.maxContextTurns).map(function cleanTurn(turn) {
      return assign({}, turn);
    });
  };

  PublicTranslationClient.prototype.clearContext = function clearContext() {
    this.context = [];
    this.cache.clear();
    this.emit('contextCleared', { sessionId: this.sessionId, createdAt: nowIso() });
    return this;
  };

  PublicTranslationClient.prototype.rememberTurn = function rememberTurn(turn) {
    var entry = assign({
      id: makeId('turn'),
      role: 'unknown',
      text: '',
      translatedText: '',
      sourceLanguage: this.options.sourceLanguage,
      targetLanguage: this.options.targetLanguage,
      createdAt: nowIso()
    }, turn || {});
    entry.text = clampText(entry.text, 1200);
    entry.translatedText = clampText(entry.translatedText, 1200);
    this.context.push(entry);
    this.context = this.context.slice(-this.options.maxContextTurns);
    this.emit('contextUpdated', { sessionId: this.sessionId, turn: assign({}, entry), contextSize: this.context.length });
    return entry;
  };

  PublicTranslationClient.prototype.requestJson = function requestJson(path, payload, method) {
    var self = this;
    var timeout = createTimeoutController(this.options.timeoutMs);
    var headers = { 'Content-Type': 'application/json', 'Accept': 'application/json' };
    var requestOptions = {
      method: method || 'POST',
      headers: headers,
      credentials: 'same-origin'
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
    var path = this.options.healthEndpoint + toQueryString({ sessionId: this.sessionId });
    return this.requestJson(path, null, 'GET');
  };

  PublicTranslationClient.prototype.detect = function detect(text, options) {
    var payload = assign({
      text: clampText(text, this.options.maxTextChars),
      sessionId: this.sessionId,
      createdAt: nowIso()
    }, options || {});
    if (!payload.text) return Promise.resolve({ ok: false, language: 'unknown', confidence: 0 });
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
    if (this.cache.size > 120) {
      var firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
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
        text: text,
        translatedText: text,
        sourceLanguage: sourceLanguage,
        targetLanguage: targetLanguage,
        intent: request.intent || ''
      });
      return Promise.resolve(sameLanguage);
    }

    var payload = {
      text: text,
      sourceLanguage: sourceLanguage,
      targetLanguage: targetLanguage,
      sessionId: this.sessionId,
      turnId: request.turnId || makeId('translate'),
      role: request.role || 'unknown',
      domain: request.domain || 'public',
      intent: request.intent || '',
      preserveTone: request.preserveTone !== false,
      context: this.getContextSnapshot(),
      glossary: this.glossary.slice(-80),
      metadata: assign({
        clientVersion: VERSION,
        page: global.location ? global.location.pathname : '',
        createdAt: nowIso()
      }, request.metadata || {})
    };

    var cacheKey = stableCacheKey(payload);
    var cached = request.skipCache ? null : this.fromCache(cacheKey);
    if (cached) return Promise.resolve(cached);

    this.emit('beforeTranslate', payload);

    return this.requestJson(this.options.translateEndpoint, payload, 'POST')
      .then(function normalizeResponse(response) {
        var translatedText = clampText(
          response.translatedText || response.translation || response.text || text,
          self.options.maxTextChars
        );
        var result = assign({}, response, {
          ok: response.ok !== false,
          text: text,
          translatedText: translatedText,
          sourceLanguage: normalizeLanguage(response.sourceLanguage, sourceLanguage),
          detectedLanguage: normalizeLanguage(response.detectedLanguage || response.language, sourceLanguage),
          targetLanguage: normalizeLanguage(response.targetLanguage, targetLanguage),
          sessionId: self.sessionId,
          turnId: payload.turnId,
          createdAt: nowIso()
        });

        self.rememberTurn({
          id: payload.turnId,
          role: payload.role,
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
          createdAt: nowIso()
        };
        self.rememberTurn({
          id: payload.turnId,
          role: payload.role,
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

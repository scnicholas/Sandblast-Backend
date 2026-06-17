/*
 * LingoSentinel Widget Translation Bridge
 * Path: public/lingosentinel/lingosentinel-widget-translation-bridge.js
 * Purpose: Non-invasive bridge between a public widget and the translation client.
 * Depends on: lingoSentinel-public-translation-client.js loaded first.
 */
(function attachLingoSentinelWidgetTranslationBridge(global) {
  'use strict';

  var VERSION = '2.0.0-bridge';

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

  function dispatch(name, detail, target) {
    try {
      var event = new CustomEvent(name, { detail: detail, bubbles: true, cancelable: false });
      (target || global).dispatchEvent(event);
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
      autoDispatch: true,
      debug: false
    }, options || {});

    this.turns = [];
    this.listeners = {};
    this.boundElements = [];
    this.unsubscribers = [];
    this.state = {
      id: makeId('bridge'),
      createdAt: nowIso(),
      lastTranslationAt: null,
      lastError: null
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

  Bridge.prototype.emit = function emit(eventName, detail) {
    (this.listeners[eventName] || []).forEach(function call(handler) {
      try { handler(detail); } catch (error) {}
    });
    dispatch('lingosentinel:bridge:' + eventName, detail);
    return this;
  };

  Bridge.prototype.configure = function configure(nextOptions) {
    this.options = assign({}, this.options, nextOptions || {});
    if (nextOptions && nextOptions.clientOptions && this.client.configure) {
      this.client.configure(nextOptions.clientOptions);
    }
    return this;
  };

  Bridge.prototype.setLanguages = function setLanguages(userLanguage, publicLanguage) {
    this.options.userLanguage = userLanguage || this.options.userLanguage || 'auto';
    this.options.publicLanguage = publicLanguage || this.options.publicLanguage || 'en';
    this.options.inboundTargetLanguage = this.options.publicLanguage;
    this.options.outboundTargetLanguage = this.options.userLanguage === 'auto' ? null : this.options.userLanguage;
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
      return Promise.resolve({ ok: true, bypassed: true, text: clean, translatedText: clean });
    }

    return this.client.translate(request).then(function finish(result) {
      self.state.lastTranslationAt = nowIso();
      self.remember({
        id: result.turnId,
        role: 'user',
        direction: 'inbound',
        originalText: clean,
        translatedText: result.translatedText || clean,
        sourceLanguage: result.detectedLanguage || result.sourceLanguage || request.sourceLanguage,
        targetLanguage: result.targetLanguage || request.targetLanguage,
        ok: result.ok !== false
      });
      self.emit('userInputTranslated', result);
      return result;
    });
  };

  Bridge.prototype.translateAssistantOutput = function translateAssistantOutput(text, options) {
    var self = this;
    var clean = clamp(text, this.options.maxTurnChars);
    var target = (options && options.targetLanguage) || this.options.outboundTargetLanguage || this.options.userLanguage;

    if (!target || target === 'auto') {
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
      return Promise.resolve({ ok: true, bypassed: true, text: clean, translatedText: clean });
    }

    var request = assign({
      role: 'assistant',
      direction: 'outbound',
      sourceLanguage: this.options.publicLanguage || 'en',
      targetLanguage: target,
      domain: 'lingosentinel-public-widget',
      intent: 'translate-assistant-output',
      metadata: { bridgeVersion: VERSION, bridgeId: this.state.id, bridgeContext: this.context() }
    }, options || {}, { text: clean });

    if (!this.options.enabled || !clean) {
      return Promise.resolve({ ok: true, bypassed: true, text: clean, translatedText: clean });
    }

    return this.client.translate(request).then(function finish(result) {
      self.state.lastTranslationAt = nowIso();
      self.remember({
        id: result.turnId,
        role: 'assistant',
        direction: 'outbound',
        originalText: clean,
        translatedText: result.translatedText || clean,
        sourceLanguage: result.sourceLanguage || request.sourceLanguage,
        targetLanguage: result.targetLanguage || request.targetLanguage,
        ok: result.ok !== false
      });
      self.emit('assistantOutputTranslated', result);
      return result;
    });
  };

  Bridge.prototype.translateTurn = function translateTurn(payload) {
    payload = payload || {};
    var role = inferRole(payload);
    if (role === 'assistant' || role === 'marion' || role === 'nyx') {
      return this.translateAssistantOutput(payload.text || payload.message || payload.content, payload);
    }
    return this.translateUserInput(payload.text || payload.message || payload.content, payload);
  };

  Bridge.prototype.installGlobalEventBridge = function installGlobalEventBridge() {
    var self = this;
    var eventNames = [
      'lingosentinel:translate-request',
      'lingosentinel:user-message',
      'lingosentinel:assistant-message',
      'nyx:user-message',
      'nyx:assistant-message',
      'marion:user-message',
      'marion:response'
    ];

    eventNames.forEach(function bind(name) {
      var handler = function handle(event) {
        var detail = event && event.detail ? event.detail : {};
        var payload = typeof detail === 'string' ? { text: detail } : assign({}, detail);
        if (name.indexOf('assistant') >= 0 || name.indexOf('response') >= 0) payload.role = payload.role || 'assistant';
        if (name.indexOf('user') >= 0) payload.role = payload.role || 'user';

        self.translateTurn(payload).then(function translated(result) {
          if (!self.options.autoDispatch) return;
          dispatch('lingosentinel:translated', {
            sourceEvent: name,
            request: payload,
            result: result,
            translatedText: result.translatedText
          }, event && event.target ? event.target : global);
        }).catch(function error(err) {
          self.state.lastError = err && err.message ? err.message : 'Bridge translation failed.';
          self.emit('error', { error: self.state.lastError, sourceEvent: name, createdAt: nowIso() });
        });
      };
      global.addEventListener(name, handler);
      self.unsubscribers.push(function unbind() { global.removeEventListener(name, handler); });
    });

    this.emit('globalBridgeInstalled', { events: eventNames.slice(), createdAt: nowIso() });
    return this;
  };

  Bridge.prototype.bindInputElement = function bindInputElement(element, options) {
    var self = this;
    if (!element || element.__lingoSentinelBridgeBound) return this;
    element.__lingoSentinelBridgeBound = true;

    var mode = safeString(element.getAttribute('data-lingosentinel-mode') || (options && options.mode) || 'change');
    var targetSelector = element.getAttribute('data-lingosentinel-target') || '';

    var translateAndWrite = function translateAndWrite() {
      var text = element.value || element.textContent || '';
      if (!text.trim()) return;
      self.translateUserInput(text, options || {}).then(function result) {
        element.setAttribute('data-lingosentinel-last-ok', result.ok !== false ? 'true' : 'false');
        element.setAttribute('data-lingosentinel-last-language', result.detectedLanguage || result.sourceLanguage || 'auto');
        if (targetSelector && global.document) {
          var target = global.document.querySelector(targetSelector);
          if (target) target.textContent = result.translatedText || text;
        }
        dispatch('lingosentinel:element-translated', { element: element, result: result }, element);
      });
    };

    var eventName = mode === 'input' ? 'input' : 'change';
    element.addEventListener(eventName, translateAndWrite);
    this.boundElements.push(element);
    this.unsubscribers.push(function unbind() { element.removeEventListener(eventName, translateAndWrite); });
    return this;
  };

  Bridge.prototype.attachToWidget = function attachToWidget(root) {
    if (!global.document) return this;
    var scope = root || global.document;
    var nodes = scope.querySelectorAll ? scope.querySelectorAll('[data-lingosentinel-input], [data-lingosentinel-translate-input]') : [];
    for (var i = 0; i < nodes.length; i += 1) this.bindInputElement(nodes[i]);
    this.emit('widgetAttached', { inputCount: nodes.length, createdAt: nowIso() });
    return this;
  };

  Bridge.prototype.getState = function getState() {
    return assign({}, this.state, {
      enabled: this.options.enabled,
      userLanguage: this.options.userLanguage,
      publicLanguage: this.options.publicLanguage,
      contextSize: this.turns.length
    });
  };

  Bridge.prototype.destroy = function destroy() {
    this.unsubscribers.forEach(function call(unsubscribe) {
      try { unsubscribe(); } catch (error) {}
    });
    this.unsubscribers = [];
    this.boundElements = [];
    this.listeners = {};
  };

  global.LingoSentinelWidgetTranslationBridge = Bridge;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = Bridge;
  }
})(typeof window !== 'undefined' ? window : globalThis);

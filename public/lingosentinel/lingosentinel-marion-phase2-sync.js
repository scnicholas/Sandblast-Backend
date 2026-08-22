(function (W, D) {
  'use strict';

  const PROD = 'https://sandblast-backend.onrender.com';
  const loc = location;
  const local = loc.protocol === 'file:' || /^(localhost|127\.0\.0\.1)$/.test(loc.hostname);
  const base = (W.LS_BACKEND || D.documentElement.dataset.lsBackend || (local ? 'http://localhost:3000' : PROD)).replace(/\/$/, '');
  const token = W.LS_WIDGET_TOKEN || '';

  let cursor = 0;
  let revision = 0;
  let debounceTimer = 0;
  let pollTimer = 0;
  let applyingCommand = false;
  let started = false;
  const last = { conversationId: '', roomId: 'lingosentinel-main' };

  function headers() {
    const h = { 'Content-Type': 'application/json' };
    if (token) h['x-sb-widget-token'] = token;
    return h;
  }

  async function post(path, payload) {
    const res = await fetch(base + path, {
      method: 'POST',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      headers: headers(),
      body: JSON.stringify(payload || {})
    });
    let json = {};
    try { json = await res.json(); } catch (_) {}
    if (!res.ok || json.ok === false) throw Error(json.error || json.stage || ('http_' + res.status));
    return json;
  }

  function translationState() {
    try { return W.LingoSentinel?.translation?.state?.() || {}; } catch (_) { return {}; }
  }

  function uiContext() {
    try { return W.LingoSentinel?.ui?.getContext?.() || {}; } catch (_) { return {}; }
  }

  function statusText() {
    const el = D.getElementById('status');
    return el ? String(el.textContent || 'ready').toLowerCase().replace(/\s+/g, '_').slice(0, 48) : 'ready';
  }

  function snapshot(extra = {}) {
    const t = translationState();
    const u = uiContext();
    const dock = D.getElementById('dock');
    const workspace = D.getElementById('workspace');
    const expanded = !!(workspace && workspace.open);
    const open = expanded || !!(dock && dock.classList.contains('on'));
    const speaker = u.speaker || 'host';
    const remote = speaker === 'remote';
    const lang = u.language || t.targetLanguage || 'en';
    const stage = D.getElementById('stage');

    return Object.assign({
      sessionId: t.sessionId || '',
      conversationId: last.conversationId,
      roomId: last.roomId,
      sourceLanguage: remote ? lang : 'en',
      targetLanguage: remote ? 'en' : lang,
      cultureContext: u.culture || t.culture || 'general',
      layer: u.layer || 'language',
      mode: u.mode || 'one_to_one',
      speakerRole: speaker,
      participantId: remote ? 'remote-' + lang : 'host',
      translationStatus: statusText(),
      marionStatus: stage && stage.classList.contains('marion-work') ? 'processing' : 'ready',
      uiState: expanded ? 'expanded' : open ? 'dock' : 'closed',
      connected: navigator.onLine,
      origin: applyingCommand ? 'marion' : 'lingosentinel',
      observedRevision: revision,
      timestamp: Date.now()
    }, extra);
  }

  async function syncNow(extra = {}) {
    if (!started) return null;
    const state = snapshot(extra);
    if (!state.sessionId) return null;
    const result = await post('/api/lingosentinel/marion/state/sync', state);
    if (result.state) revision = result.state.revision || revision;
    W.dispatchEvent(new CustomEvent('lingosentinel:phase2-state-synced', { detail: { revision, stale: result.stale === true } }));
    return result;
  }

  function sync(extra = {}) {
    if (!started) return;
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      syncNow(extra).catch(e => W.dispatchEvent(new CustomEvent('lingosentinel:phase2-state-error', { detail: { error: e.message } })));
    }, 120);
  }

  function applyCommand(command) {
    const ui = W.LingoSentinel?.ui;
    if (!ui) return false;
    applyingCommand = true;
    try {
      switch (command.action) {
        case 'setLanguage': if (!ui.setLanguage) return false; ui.setLanguage(command.value); break;
        case 'setCulture': if (!ui.setCulture) return false; ui.setCulture(command.value); break;
        case 'setLayer': if (!ui.setLayer) return false; ui.setLayer(command.value); break;
        case 'setMode': if (!ui.setMode) return false; ui.setMode(command.value); break;
        case 'setSpeaker': {
          const button = D.getElementById(command.value === 'remote' ? 'remoteBtn' : 'hostBtn');
          if (!button) return false;
          button.click();
          break;
        }
        case 'open': if (!ui.open) return false; ui.open(); break;
        case 'close': if (!ui.close) return false; ui.close(); break;
        case 'expand': if (!ui.expand) return false; ui.expand(); break;
        default: return false;
      }
      return true;
    } finally {
      setTimeout(() => {
        applyingCommand = false;
        sync({ metadata: { commandId: command.commandId } });
      }, 0);
    }
  }

  async function pullCommands() {
    if (!started || D.hidden) return;
    const t = translationState();
    if (!t.sessionId) return;
    try {
      const result = await post('/api/lingosentinel/marion/state/commands', { sessionId: t.sessionId, after: cursor, limit: 20 });
      for (const command of result.commands || []) {
        let ok = false, error = '';
        try { ok = applyCommand(command); } catch (e) { error = e.message || 'apply_failed'; }
        cursor = Math.max(cursor, command.sequence || 0);
        try {
          await post('/api/lingosentinel/marion/state/ack', {
            sessionId: t.sessionId,
            commandId: command.commandId,
            ok,
            appliedRevision: revision,
            error
          });
        } catch (_) {}
        W.dispatchEvent(new CustomEvent('marion:lingosentinel-command-applied', { detail: { command, ok } }));
      }
    } catch (e) {
      W.dispatchEvent(new CustomEvent('lingosentinel:phase2-command-error', { detail: { error: e.message } }));
    }
  }

  function bind() {
    [
      'language-change','culture-change','layer-change','mode-change','participant-select',
      'workspace-preview-open','workspace-preview-close','workspace-open','workspace-close',
      'message-send','message-delivered','marion-response','marion-error'
    ].forEach(name => {
      W.addEventListener('lingosentinel:' + name, e => {
        const d = e.detail || {};
        if (d.conversationId) last.conversationId = d.conversationId;
        if (d.roomId) last.roomId = d.roomId;
        sync();
      });
    });
    W.addEventListener('online', () => sync());
    W.addEventListener('offline', () => sync({ connected: false }));
    D.addEventListener('visibilitychange', () => { if (!D.hidden) { sync(); pullCommands(); } });
  }

  async function start() {
    if (started) return true;
    if (!W.LingoSentinel?.translation || !W.LingoSentinel?.ui) return false;
    started = true;
    bind();
    try { await syncNow(); } catch (e) {
      W.dispatchEvent(new CustomEvent('lingosentinel:phase2-state-error', { detail: { error: e.message } }));
    }
    pollTimer = setInterval(pullCommands, 2000);
    pullCommands();
    W.dispatchEvent(new CustomEvent('lingosentinel:phase2-ready', { detail: { contract: 'marion.lingosentinel.state/2.0', baseUrl: base } }));
    return true;
  }

  if (!start()) W.addEventListener('lingosentinel:integration-ready', start, { once: true });

  W.LingoSentinelMarionPhase2 = {
    start,
    sync,
    syncNow,
    pull: pullCommands,
    stop() { started = false; clearInterval(pollTimer); clearTimeout(debounceTimer); },
    getState: snapshot,
    baseUrl: base
  };
})(window, document);

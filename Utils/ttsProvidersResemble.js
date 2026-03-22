"use strict";

const https = require("https");

const MAX_AUDIO_BYTES = 25 * 1024 * 1024;
const MAX_RESPONSE_BYTES = 5 * 1024 * 1024;


const MANUAL_RESEMBLE_CONFIG = Object.freeze({
  // Manual fallback placeholders: paste real values between the quotes if you want file-level overrides.
  // Leave blank to use environment variables instead.
  apiKey: "",
  voiceUuid: "",
  projectUuid: "",
  synthUrl: "https://f.cluster.resemble.ai/synthesize"
});

const PHASES = Object.freeze({
  p01_contractSafe: true,
  p02_envResolution: true,
  p03_voiceResolution: true,
  p04_authFallback: true,
  p05_timeoutGuard: true,
  p06_ssmlFailOpen: true,
  p07_speechEnvelope: true,
  p08_payloadNormalization: true,
  p09_audioSrcDownload: true,
  p10_base64Coercion: true,
  p11_mimeDetection: true,
  p12_retrySignal: true,
  p13_traceDiagnostics: true,
  p14_providerTolerance: true,
  p15_operationalIntegrity: true,
  p16_binaryDirectResponse: true,
  p17_endpointValidation: true,
  p18_nestedAudioEnvelope: true,
  p19_downloadGuards: true,
  p20_nonJsonTolerance: true,
  p21_privateNetworkGuard: true,
  p22_sizeGuard: true,
  p23_errorNormalization: true,
  p24_headerSanitization: true,
  p25_transientRetryBackoff: true,
  p26_audioRecoverySignalReady: true
});

const LOCKED_VOICE_ENV_KEYS = Object.freeze([
  "RESEMBLE_VOICE_UUID",
  "SB_RESEMBLE_VOICE_UUID",
  "SBNYX_RESEMBLE_VOICE_UUID"
]);

const REQUEST_VOICE_ENV_KEYS = Object.freeze([
  "MIXER_VOICE_ID",
  "RESEMBLE_VOICE_ID",
  "NYX_VOICE_ID",
  "TTS_VOICE_ID"
]);

function _str(v){ return v == null ? "" : String(v); }
function _trim(v){ return _str(v).trim(); }
function _pickFirst(){
  for (let i = 0; i < arguments.length; i++){
    const t = _trim(arguments[i]);
    if (t) return t;
  }
  return "";
}
function _lower(s){ return _trim(s).toLowerCase(); }

function _manualConfig(){
  return MANUAL_RESEMBLE_CONFIG || {};
}
function _manualOrEnv(){
  const args = Array.from(arguments);
  const manualValue = _pickFirst.apply(null, args);
  return manualValue || _pickFirst.apply(null, args.slice(1));
}
function _clampInt(v, dflt, min, max){
  const n = Number(v);
  if (!Number.isFinite(n)) return dflt;
  return Math.max(min, Math.min(max, Math.round(n)));
}
function _boolish(v, dflt){
  if (v == null || v === "") return dflt;
  if (typeof v === "boolean") return v;
  const s = _trim(v).toLowerCase();
  if (s === "1" || s === "true" || s === "yes" || s === "on") return true;
  if (s === "0" || s === "false" || s === "no" || s === "off") return false;
  return dflt;
}
function _sleep(ms){
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms) || 0)));
}
function _mask(v){
  const s = _trim(v);
  if (!s) return "";
  if (s.length <= 8) return `${s.slice(0, 2)}***${s.slice(-2)}`;
  return `${s.slice(0, 6)}***${s.slice(-4)}`;
}
function _headerSafe(v, max){
  return _str(v).replace(/[\r\n]+/g, " ").trim().slice(0, max || 120);
}
function _safeUrlForLogs(v){
  const s = _normalizeUrlCandidate(v);
  if (!s) return "";
  try{
    const u = new URL(s);
    return `${u.protocol}//${u.host}${u.pathname}`;
  }catch(_){
    return "";
  }
}
function _isPrivateHostname(hostname){
  const h = _lower(hostname);
  if (!h) return true;
  if (h === "localhost" || h === "127.0.0.1" || h === "::1") return true;
  if (/^10\./.test(h)) return true;
  if (/^192\.168\./.test(h)) return true;
  if (/^169\.254\./.test(h)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(h)) return true;
  if (/^fc00:/i.test(h) || /^fd/i.test(h)) return true;
  if (/^fe80:/i.test(h)) return true;
  return false;
}
function _assertSafeRemoteUrl(raw, allowPrivate){
  const safe = _normalizeUrlCandidate(raw);
  if (!safe) throw new Error("invalid_remote_url");
  const u = new URL(safe);
  if (!/^https?:$/i.test(u.protocol)) throw new Error("unsupported_remote_protocol");
  if (!allowPrivate && _isPrivateHostname(u.hostname)) throw new Error("private_network_url_blocked");
  return safe;
}
function _normalizedProviderError(reason, message, status, retryable, extra){
  return {
    ok: false,
    retryable: !!retryable,
    reason: _trim(reason) || "provider_error",
    message: _trim(message) || "Resemble synthesis failed.",
    status: Number.isFinite(Number(status)) ? Number(status) : 0,
    ...(extra || {})
  };
}
function _mimeFor(fmt){
  const f = _lower(fmt);
  if (f === "wav") return "audio/wav";
  if (f === "ogg") return "audio/ogg";
  if (f === "flac") return "audio/flac";
  return "audio/mpeg";
}
function _getToken(){
  return _manualOrEnv(_manualConfig().apiKey, process.env.RESEMBLE_API_TOKEN, process.env.RESEMBLE_API_KEY, "");
}
function _getProjectUuid(){
  return _manualOrEnv(_manualConfig().projectUuid, process.env.RESEMBLE_PROJECT_UUID, process.env.SB_RESEMBLE_PROJECT_UUID, "");
}
function _voiceResolutionState(requestedValue){
  const requested = _trim(requestedValue);
  const manualVoice = _trim(_manualConfig().voiceUuid);
  const lockedCandidates = [manualVoice, ...LOCKED_VOICE_ENV_KEYS.map((key) => process.env[key])]
    .map(_trim)
    .filter(Boolean);
  const validLocked = lockedCandidates.filter(_looksLikeUuid);
  const uniqueLocked = [...new Set(validLocked)];
  const lockedVoiceUuid = uniqueLocked[0] || "";
  const requestCandidates = [requested, ...REQUEST_VOICE_ENV_KEYS.map((key) => process.env[key])]
    .map(_trim)
    .filter(Boolean);
  const requestedLooksValid = _looksLikeUuid(requested);
  const conflict = uniqueLocked.length > 1;
  const overrideBlocked = !!(lockedVoiceUuid && requestedLooksValid && requested !== lockedVoiceUuid);

  return {
    requestedVoiceUuid: requested,
    lockedVoiceUuid,
    voiceUuid: lockedVoiceUuid || (requestedLooksValid ? requested : ""),
    configured: !!lockedVoiceUuid,
    valid: !!lockedVoiceUuid && !conflict,
    conflict,
    configuredKeys: [manualVoice ? "MANUAL_RESEMBLE_CONFIG.voiceUuid" : "", ...LOCKED_VOICE_ENV_KEYS].filter(Boolean),
    requestCandidates
  };
}

function _getVoiceUuid(){
  return _voiceResolutionState("").voiceUuid;
}
function _defaultModel(){
  return _pickFirst(process.env.RESEMBLE_TTS_MODEL, "chatterbox-turbo");
}
function _requestTimeoutMs(){
  return _clampInt(
    process.env.SB_TTS_PROVIDER_TIMEOUT_MS || process.env.SB_TTS_TIMEOUT_MS,
    12000,
    3000,
    60000
  );
}
function _allowPrivateAudioSrc(){
  return _boolish(process.env.SB_TTS_ALLOW_PRIVATE_AUDIO_SRC, false);
}
function _maxAudioBytes(){
  return _clampInt(process.env.SB_TTS_MAX_AUDIO_BYTES, MAX_AUDIO_BYTES, 1024 * 256, 100 * 1024 * 1024);
}
function _maxResponseBytes(){
  return _clampInt(process.env.SB_TTS_MAX_RESPONSE_BYTES, MAX_RESPONSE_BYTES, 1024 * 256, 25 * 1024 * 1024);
}
function _enableSsml(){
  return _boolish(process.env.RESEMBLE_USE_SSML, true);
}
function _enableProsodyShaping(){
  return _boolish(process.env.RESEMBLE_ENABLE_PROSODY_SHAPING, true);
}
function _maxSynthAttempts(){
  return _clampInt(process.env.SB_TTS_PROVIDER_MAX_ATTEMPTS, 3, 1, 5);
}
function _retryBaseMs(){
  return _clampInt(process.env.SB_TTS_PROVIDER_RETRY_BASE_MS, 350, 100, 3000);
}
function _downloadAttempts(){
  return _clampInt(process.env.SB_TTS_AUDIO_DOWNLOAD_ATTEMPTS, 2, 1, 4);
}
function _looksLikeMp3(buf){
  return Buffer.isBuffer(buf) && buf.length >= 3 && (
    (buf[0] === 0x49 && buf[1] === 0x44 && buf[2] === 0x33) ||
    (buf[0] === 0xFF && (buf[1] & 0xE0) === 0xE0)
  );
}
function _looksLikeWav(buf){
  return Buffer.isBuffer(buf) && buf.length >= 12 &&
    buf.slice(0, 4).toString("ascii") === "RIFF" &&
    buf.slice(8, 12).toString("ascii") === "WAVE";
}
function _looksLikeOgg(buf){
  return Buffer.isBuffer(buf) && buf.length >= 4 &&
    buf.slice(0, 4).toString("ascii") === "OggS";
}
function _looksLikeFlac(buf){
  return Buffer.isBuffer(buf) && buf.length >= 4 &&
    buf.slice(0, 4).toString("ascii") === "fLaC";
}
function _resolveMime(buffer, fallbackFmt, contentType){
  const ct = _lower(contentType);
  if (ct.startsWith("audio/")) return ct.split(";")[0].trim();
  if (_looksLikeWav(buffer)) return "audio/wav";
  if (_looksLikeMp3(buffer)) return "audio/mpeg";
  if (_looksLikeOgg(buffer)) return "audio/ogg";
  if (_looksLikeFlac(buffer)) return "audio/flac";
  return _mimeFor(fallbackFmt);
}
function _looksLikeUuid(v){
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(_trim(v));
}
function _resolveVoiceUuid(v){
  const state = _voiceResolutionState(v);
  return state.voiceUuid;
}
function _escapeXml(s){
  return _str(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
function _normalizeText(text){
  return _str(text)
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/([,.;:!?])([A-Za-z])/g, "$1 $2")
    .replace(/\.{4,}/g, "...")
    .trim();
}
function _splitSpeechChunks(text){
  return _normalizeText(text)
    .split(/(?<=[.!?])\s+/)
    .map((s) => _trim(s))
    .filter(Boolean);
}
function _sanitizeSsmlText(text){
  let s = _normalizeText(text);
  if (!s) return "";
  s = _escapeXml(s);
  s = s.replace(/\.\.\./g, '<break time="520ms"/>');
  s = s.replace(/,/g, ',<break time="150ms"/>');
  s = s.replace(/;/g, ';<break time="260ms"/>');
  s = s.replace(/:/g, ':<break time="220ms"/>');
  s = s.replace(/\./g, '.<break time="320ms"/>');
  s = s.replace(/\?/g, '?<break time="360ms"/>');
  s = s.replace(/!/g, '!<break time="340ms"/>');
  s = s.replace(/(<break[^>]+\/>)\s*(<break[^>]+\/>)*/g, "$1");
  return `<speak><prosody rate="100%" pitch="0%">${s}</prosody></speak>`;
}
function _buildSpeechEnvelope(opts){
  const speechHints = opts && typeof opts.speechHints === "object" ? opts.speechHints : {};
  const chunks = Array.isArray(opts && opts.speechChunks) && opts.speechChunks.length
    ? opts.speechChunks.map((s) => _trim(s)).filter(Boolean)
    : (Array.isArray(speechHints.chunks) && speechHints.chunks.length
      ? speechHints.chunks.map((s) => _trim(s)).filter(Boolean)
      : _splitSpeechChunks(_pickFirst(
          opts && opts.textSpeak,
          opts && opts.plainText,
          opts && opts.textDisplay,
          opts && opts.text
        )));

  const textDisplay = _normalizeText(_pickFirst(opts && opts.textDisplay, opts && opts.plainText, opts && opts.text));
  const textSpeak = _normalizeText(_pickFirst(
    opts && opts.textSpeak,
    opts && opts.ssmlSourceText,
    opts && opts.plainText,
    opts && opts.textDisplay,
    opts && opts.text
  ));
  const plainText = _normalizeText(_pickFirst(opts && opts.plainText, textSpeak, textDisplay));

  let ssmlText = _trim(opts && opts.ssmlText);
  if (!ssmlText && _enableProsodyShaping()) ssmlText = _sanitizeSsmlText(textSpeak || plainText);

  return {
    textDisplay,
    textSpeak,
    plainText,
    ssmlText,
    speechChunks: chunks,
    segmentCount: chunks.length,
    speechHints,
    useSsml: _enableSsml() && !!ssmlText
  };
}

function _parseJson(text){
  try { return JSON.parse(text || "{}"); } catch (_) { return null; }
}

function _safeJsonParseFromBuffer(buf){
  if (!Buffer.isBuffer(buf) || !buf.length) return null;
  try{
    return JSON.parse(buf.toString("utf8"));
  }catch(_){
    return null;
  }
}

function _buildAuthHeaders(token, mode){
  if (mode === "raw") return { Authorization: token };
  if (mode === "token") return { Authorization: `Token ${token}` };
  return { Authorization: `Bearer ${token}` };
}

function _normalizeUrlCandidate(url){
  const raw = _trim(url);
  if (!raw) return "";
  try{
    const u = new URL(raw);
    if (!/^https?:$/i.test(u.protocol)) return "";
    return u.toString();
  }catch(_){
    return "";
  }
}

function _candidateSynthesizeUrls(){
  const explicit = [
    _manualConfig().synthUrl,
    process.env.RESEMBLE_SYNTH_URL,
    process.env.RESEMBLE_TTS_URL,
    process.env.RESEMBLE_API_URL,
    "https://f.cluster.resemble.ai/synthesize"
  ]
    .map(_normalizeUrlCandidate)
    .filter(Boolean);

  const uniq = [];
  const seen = new Set();
  for (const u of explicit){
    if (!seen.has(u)){
      seen.add(u);
      uniq.push(u);
    }
  }
  return uniq;
}

function _isAudioContentType(ct){
  return _lower(ct).startsWith("audio/");
}
function _isJsonContentType(ct){
  return _lower(ct).includes("application/json") || _lower(ct).includes("+json");
}
function _getHeader(headers, name){
  if (!headers || typeof headers !== "object") return "";
  const wanted = _lower(name);
  for (const k of Object.keys(headers)){
    if (_lower(k) === wanted) return _str(headers[k]);
  }
  return "";
}
function _retryableStatus(status){
  return status === 0 || status === 408 || status === 409 || status === 425 || status === 429 || status >= 500;
}
function _computeBackoffMs(attemptIndex){
  const base = _retryBaseMs();
  const exp = Math.min(attemptIndex, 6);
  const jitter = Math.floor(Math.random() * 120);
  return Math.min(base * Math.pow(2, exp), 4000) + jitter;
}

function _postViaHttps(url, headers, bodyObj, timeoutMs){
  const body = JSON.stringify(bodyObj);
  const maxBytes = _maxResponseBytes();
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.request(
      {
        method: "POST",
        hostname: u.hostname,
        port: u.port || undefined,
        protocol: u.protocol,
        path: u.pathname + (u.search || ""),
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json, audio/*;q=0.9, */*;q=0.8",
          "Accept-Encoding": "identity",
          "Content-Length": Buffer.byteLength(body),
          ...headers
        },
        timeout: timeoutMs
      },
      (res) => {
        const chunks = [];
        let total = 0;
        res.on("data", (d) => {
          total += d.length;
          if (total > maxBytes){
            req.destroy(new Error("provider_response_too_large"));
            return;
          }
          chunks.push(d);
        });
        res.on("end", () => {
          const buffer = Buffer.concat(chunks);
          resolve({
            status: res.statusCode || 0,
            headers: res.headers || {},
            buffer,
            text: buffer.toString("utf8")
          });
        });
      }
    );
    req.on("timeout", () => req.destroy(new Error("provider_request_timeout")));
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

async function _postRequest(url, headers, bodyObj, timeoutMs){
  if (typeof fetch === "function"){
    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    let to = null;
    try{
      if (controller) to = setTimeout(() => controller.abort(), timeoutMs);
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json, audio/*;q=0.9, */*;q=0.8",
          "Accept-Encoding": "identity",
          ...headers
        },
        body: JSON.stringify(bodyObj),
        signal: controller ? controller.signal : undefined
      });
      const ab = await res.arrayBuffer();
      const buffer = Buffer.from(ab);
      if (buffer.length > _maxResponseBytes()) throw new Error("provider_response_too_large");
      return {
        status: res.status,
        headers: Object.fromEntries(res.headers.entries()),
        buffer,
        text: buffer.toString("utf8")
      };
    } catch (e){
      const msg = _str(e && e.message ? e.message : e);
      if (e && e.name === "AbortError") {
        const err = new Error("provider_request_timeout");
        err.cause = e;
        throw err;
      }
      throw new Error(msg || "provider_request_failed");
    } finally {
      if (to) clearTimeout(to);
    }
  }
  return _postViaHttps(url, headers, bodyObj, timeoutMs);
}

function _downloadViaHttps(url, timeoutMs){
  const maxBytes = _maxAudioBytes();
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.request(
      {
        method: "GET",
        hostname: u.hostname,
        port: u.port || undefined,
        protocol: u.protocol,
        path: u.pathname + (u.search || ""),
        headers: { Accept: "audio/*,*/*;q=0.8" },
        timeout: timeoutMs
      },
      (res) => {
        const chunks = [];
        let total = 0;
        res.on("data", (d) => {
          total += d.length;
          if (total > maxBytes){
            req.destroy(new Error("audio_src_too_large"));
            return;
          }
          chunks.push(d);
        });
        res.on("end", () => {
          resolve({
            status: res.statusCode || 0,
            headers: res.headers || {},
            buffer: Buffer.concat(chunks)
          });
        });
      }
    );
    req.on("timeout", () => req.destroy(new Error("audio_src_timeout")));
    req.on("error", reject);
    req.end();
  });
}

async function _downloadBuffer(url, timeoutMs){
  const safeUrl = _assertSafeRemoteUrl(url, _allowPrivateAudioSrc());

  if (typeof fetch === "function"){
    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    let to = null;
    try{
      if (controller) to = setTimeout(() => controller.abort(), timeoutMs);
      const res = await fetch(safeUrl, {
        method: "GET",
        headers: { Accept: "audio/*,*/*;q=0.8" },
        signal: controller ? controller.signal : undefined
      });
      const ab = await res.arrayBuffer();
      const buffer = Buffer.from(ab);
      if (buffer.length > _maxAudioBytes()) throw new Error("audio_src_too_large");
      return {
        status: res.status,
        headers: Object.fromEntries(res.headers.entries()),
        buffer
      };
    } catch (e){
      const msg = _str(e && e.message ? e.message : e);
      if (e && e.name === "AbortError") {
        const err = new Error("audio_src_timeout");
        err.cause = e;
        throw err;
      }
      throw new Error(msg || "audio_src_download_failed");
    } finally {
      if (to) clearTimeout(to);
    }
  }

  return _downloadViaHttps(safeUrl, timeoutMs);
}

async function _downloadBufferWithRetry(url, timeoutMs){
  let lastErr = null;
  for (let i = 0; i < _downloadAttempts(); i++){
    try{
      const dl = await _downloadBuffer(url, timeoutMs);
      if (dl && dl.status >= 200 && dl.status < 300 && Buffer.isBuffer(dl.buffer) && dl.buffer.length >= 16){
        return dl;
      }
      lastErr = new Error(`audio_src_http_${dl && dl.status ? dl.status : 0}`);
      if (!_retryableStatus(dl && dl.status ? dl.status : 0)) break;
    }catch(e){
      lastErr = e;
      const msg = _lower(e && e.message);
      if (!/timeout|429|5\d\d|download_failed|network|too_large/.test(msg)) break;
    }
    if (i < _downloadAttempts() - 1) await _sleep(_computeBackoffMs(i));
  }
  throw lastErr || new Error("audio_src_download_failed");
}

async function _callSynthesize(payload, token, traceId, timeoutMs, authMode){
  const headers = {
    ..._buildAuthHeaders(token, authMode),
    "User-Agent": "sb-nyx-tts/1.4"
  };
  if (traceId) headers["X-SB-Trace-ID"] = _headerSafe(traceId, 120);

  const urls = _candidateSynthesizeUrls();
  let lastResp = null;

  for (let i = 0; i < urls.length; i++){
    const url = urls[i];
    try{
      const resp = await _postRequest(url, headers, payload, timeoutMs);
      resp.providerEndpoint = _safeUrlForLogs(url);
      lastResp = resp;
      const status = resp && resp.status ? resp.status : 0;
      if (status && status !== 404 && status !== 405){
        return resp;
      }
    }catch(e){
      lastResp = {
        status: 0,
        headers: {},
        buffer: Buffer.alloc(0),
        text: _str(e && e.message ? e.message : e),
        providerEndpoint: _safeUrlForLogs(url),
        thrown: e
      };
    }
  }

  return lastResp || {
    status: 0,
    headers: {},
    buffer: Buffer.alloc(0),
    text: "No provider endpoint available.",
    providerEndpoint: _safeUrlForLogs(_pickFirst.apply(null, urls))
  };
}

async function _callSynthesizeWithRecovery(payload, token, traceId, timeoutMs, speech){
  const authModes = ["bearer", "raw", "token"];
  const attempts = _maxSynthAttempts();
  let lastResp = null;
  let lastAuthMode = "bearer";
  let lastAttemptCount = 0;

  for (let modeIndex = 0; modeIndex < authModes.length; modeIndex++){
    const authMode = authModes[modeIndex];
    for (let attempt = 0; attempt < attempts; attempt++){
      lastAttemptCount++;
      lastAuthMode = authMode;
      const resp = await _callSynthesize(payload, token, traceId, timeoutMs, authMode);
      lastResp = resp;
      const status = resp && resp.status ? resp.status : 0;
      const contentType = _getHeader(resp && resp.headers, "content-type");
      const json = _isJsonContentType(contentType)
        ? _parseJson(resp && resp.text ? resp.text : "")
        : (_parseJson(resp && resp.text ? resp.text : "") || _safeJsonParseFromBuffer(resp && resp.buffer));

      if (_providerSucceeded(status, json, resp)){
        return { resp, authMode, attemptsUsed: lastAttemptCount };
      }

      if (speech && speech.useSsml){
        const looksRejected =
          (status === 400 || status === 415 || status === 422) ||
          /ssml|markup|invalid xml|invalid ssml|unsupported/i.test(
            _normalizeProviderMessage(json, resp && resp.text)
          );
        if (looksRejected){
          const plainPayload = { ...payload, data: speech.plainText };
          delete plainPayload.data_type;
          const plainResp = await _callSynthesize(plainPayload, token, traceId, timeoutMs, authMode);
          lastResp = plainResp;
          const plainCt = _getHeader(plainResp && plainResp.headers, "content-type");
          const plainJson = _isJsonContentType(plainCt)
            ? _parseJson(plainResp && plainResp.text ? plainResp.text : "")
            : (_parseJson(plainResp && plainResp.text ? plainResp.text : "") || _safeJsonParseFromBuffer(plainResp && plainResp.buffer));
          if (_providerSucceeded(plainResp && plainResp.status ? plainResp.status : 0, plainJson, plainResp)){
            return { resp: plainResp, authMode, attemptsUsed: lastAttemptCount };
          }
          const plainStatus = plainResp && plainResp.status ? plainResp.status : 0;
          if (!_retryableStatus(plainStatus)) break;
        }
      }

      if (!_retryableStatus(status)) break;
      if (attempt < attempts - 1) await _sleep(_computeBackoffMs(attempt));
    }
  }

  return { resp: lastResp, authMode: lastAuthMode, attemptsUsed: lastAttemptCount };
}

function _normalizeProviderMessage(json, fallbackText){
  const raw = json && (
    json.message || json.error || json.detail || json.reason ||
    (json.data && (json.data.message || json.data.error || json.data.detail || json.data.reason)) ||
    (json.result && (json.result.message || json.result.error || json.result.detail || json.result.reason)) ||
    (json.response && (json.response.message || json.response.error || json.response.detail || json.response.reason)) ||
    (Array.isArray(json.errors) ? json.errors.join("; ") : "") ||
    (Array.isArray(json.issues) ? json.issues.join("; ") : "")
  );
  return _trim(raw) || _trim(fallbackText) || "Resemble synthesis failed.";
}

function _providerSucceeded(status, json, resp){
  if (!(status >= 200 && status < 300)) return false;

  const ct = _getHeader(resp && resp.headers, "content-type");
  if (_isAudioContentType(ct) && Buffer.isBuffer(resp && resp.buffer) && resp.buffer.length >= 16){
    return true;
  }

  if (!json) return false;
  if (json.success === true) return true;
  if (json.ok === true) return true;

  const env = _extractAudioEnvelope(json);
  if (env.audio_content || env.audio_src || env.audio_base64) return true;

  return false;
}

function _extractAudioEnvelope(json){
  if (!json || typeof json !== "object") return {};

  const data = json.data && typeof json.data === "object" ? json.data : null;
  const result = json.result && typeof json.result === "object" ? json.result : null;
  const response = json.response && typeof json.response === "object" ? json.response : null;
  const audio = json.audio && typeof json.audio === "object" ? json.audio : null;

  return {
    audio_content: _pickFirst(
      json.audio_content,
      data && data.audio_content,
      result && result.audio_content,
      response && response.audio_content,
      audio && audio.content
    ),
    audio_base64: _pickFirst(
      json.audio_base64,
      json.base64,
      data && (data.audio_base64 || data.base64),
      result && (result.audio_base64 || result.base64),
      response && (response.audio_base64 || response.base64),
      audio && (audio.base64 || audio.audio_base64)
    ),
    audio_src: _pickFirst(
      json.audio_src,
      json.url,
      data && (data.audio_src || data.url),
      result && (result.audio_src || result.url),
      response && (response.audio_src || response.url),
      audio && (audio.url || audio.src)
    ),
    output_format: _pickFirst(
      json.output_format,
      json.format,
      data && (data.output_format || data.format),
      result && (result.output_format || result.format),
      response && (response.output_format || response.format),
      audio && audio.format
    ),
    duration: json.duration || (data && data.duration) || (result && result.duration) || (response && response.duration),
    synth_duration: json.synth_duration || (data && data.synth_duration) || (result && result.synth_duration) || (response && response.synth_duration),
    sample_rate: json.sample_rate || (data && data.sample_rate) || (result && result.sample_rate) || (response && response.sample_rate),
    request_id: _pickFirst(
      json.request_id,
      json.id,
      data && (data.request_id || data.id),
      result && (result.request_id || result.id),
      response && (response.request_id || response.id)
    ),
    issues: Array.isArray(json.issues)
      ? json.issues
      : (data && Array.isArray(data.issues)
        ? data.issues
        : (result && Array.isArray(result.issues)
          ? result.issues
          : (response && Array.isArray(response.issues) ? response.issues : undefined)))
  };
}

function _safeBase64ToBuffer(value){
  const s = _trim(value);
  if (!s) return null;
  try{
    const cleaned = s
      .replace(/^data:[^;]+;base64,/i, "")
      .replace(/\s+/g, "");
    const buf = Buffer.from(cleaned, "base64");
    return Buffer.isBuffer(buf) && buf.length ? buf : null;
  }catch(_){
    return null;
  }
}

async function synthesize(opts){
  const started = Date.now();

  const speech = _buildSpeechEnvelope(opts || {});
  const text = _trim(speech.useSsml ? speech.ssmlText : speech.plainText);
  const voiceState = _voiceResolutionState(opts && opts.voiceUuid);
  const voiceUuid = voiceState.voiceUuid;
  const projectUuid = _pickFirst(opts && opts.projectUuid, _getProjectUuid());
  const outputFormat = _lower(_pickFirst(opts && opts.outputFormat, "mp3")) === "wav" ? "wav" : "mp3";
  const sampleRate = opts && opts.sampleRate ? _clampInt(opts.sampleRate, undefined, 8000, 192000) : undefined;
  const precision = _pickFirst(opts && opts.precision, "").toUpperCase();
  const title = _headerSafe(opts && opts.title, 120);
  const useHd = opts && typeof opts.useHd !== "undefined" ? _boolish(opts.useHd, false) : undefined;
  const traceId = _trim(opts && opts.traceId);
  const token = _getToken();
  const timeoutMs = _requestTimeoutMs();

  if (!token){
    return {
      ok: false,
      retryable: false,
      reason: "missing_token",
      message: "Missing RESEMBLE_API_TOKEN/RESEMBLE_API_KEY",
      status: 0,
      elapsedMs: Date.now() - started,
      phases: PHASES
    };
  }
  if (!text){
    return {
      ok: false,
      retryable: false,
      reason: "missing_text",
      message: "Missing text",
      status: 0,
      elapsedMs: Date.now() - started,
      phases: PHASES
    };
  }
  if (!voiceUuid){
    return {
      ok: false,
      retryable: false,
      reason: "missing_voice",
      message: "Missing locked RESEMBLE_VOICE_UUID voice configuration",
      status: 0,
      elapsedMs: Date.now() - started,
      requestedVoiceUuid: _mask(voiceState.requestedVoiceUuid),
      phases: PHASES
    };
  }

  const payload = {
    voice_uuid: voiceUuid,
    data: text,
    output_format: outputFormat,
    model: _defaultModel()
  };

  if (projectUuid) payload.project_uuid = projectUuid;
  if (sampleRate) payload.sample_rate = sampleRate;
  if (precision && ["MULAW", "PCM_16", "PCM_24", "PCM_32"].includes(precision)) payload.precision = precision;
  if (title) payload.title = title.slice(0, 120);
  if (typeof useHd !== "undefined") payload.use_hd = !!useHd;
  if (speech.useSsml) payload.data_type = _pickFirst(opts && opts.dataType, "ssml");
  if (speech.segmentCount) payload.segment_count = speech.segmentCount;

  let resp;
  let authMode = "bearer";
  let attemptsUsed = 0;

  try{
    const outcome = await _callSynthesizeWithRecovery(payload, token, traceId, timeoutMs, speech);
    resp = outcome && outcome.resp;
    authMode = outcome && outcome.authMode ? outcome.authMode : authMode;
    attemptsUsed = outcome && outcome.attemptsUsed ? outcome.attemptsUsed : attemptsUsed;
  }catch(e){
    const msg = _str(e && e.message ? e.message : e);
    const timeoutish = /timeout|abort/i.test(msg);
    const reason =
      /private_network_url_blocked/i.test(msg) ? "private_network_url_blocked" :
      /too_large/i.test(msg) ? "provider_payload_too_large" :
      (timeoutish ? "provider_timeout" : "network_error");
    return _normalizedProviderError(reason, msg, 0, true, {
      elapsedMs: Date.now() - started,
      authMode,
      attemptsUsed,
      providerEndpoint: resp && resp.providerEndpoint ? resp.providerEndpoint : _safeUrlForLogs(_pickFirst.apply(null, _candidateSynthesizeUrls())),
      voiceUuid,
      voiceUuidMasked: _mask(voiceUuid),
      requestedVoiceUuid: voiceState.requestedVoiceUuid,
      requestedVoiceUuidMasked: _mask(voiceState.requestedVoiceUuid),
      voiceLocked: voiceState.configured,
      voiceIntegrity: { conflict: voiceState.conflict, valid: voiceState.valid },
      traceId: _headerSafe(traceId, 120),
      textDisplay: speech.textDisplay,
      textSpeak: speech.textSpeak,
      speechChunks: speech.speechChunks,
      segmentCount: speech.segmentCount,
      usedSsml: speech.useSsml,
      phases: PHASES
    });
  }

  const status = resp && resp.status ? resp.status : 0;
  const providerEndpoint = resp && resp.providerEndpoint ? resp.providerEndpoint : _pickFirst.apply(null, _candidateSynthesizeUrls());
  const contentType = _getHeader(resp && resp.headers, "content-type");
  const json = _isJsonContentType(contentType)
    ? _parseJson(resp && resp.text ? resp.text : "")
    : (_parseJson(resp && resp.text ? resp.text : "") || _safeJsonParseFromBuffer(resp && resp.buffer));

  if (!_providerSucceeded(status, json, resp)){
    const retryable = _retryableStatus(status);
    return {
      ok: false,
      retryable,
      reason: (status === 401 || status === 403) ? "auth_error" : "http_error",
      message: _normalizeProviderMessage(json, resp && resp.text ? resp.text : "Resemble synthesis failed."),
      status,
      elapsedMs: Date.now() - started,
      issues: json && Array.isArray(json.issues) ? json.issues : undefined,
      requestId: json && (json.request_id || json.id) ? (json.request_id || json.id) : undefined,
      authMode,
      attemptsUsed,
      providerEndpoint,
      voiceUuid,
      voiceUuidMasked: _mask(voiceUuid),
      requestedVoiceUuid: voiceState.requestedVoiceUuid,
      requestedVoiceUuidMasked: _mask(voiceState.requestedVoiceUuid),
      voiceLocked: voiceState.configured,
      voiceIntegrity: { conflict: voiceState.conflict, valid: voiceState.valid },
      traceId: _headerSafe(traceId, 120),
      textDisplay: speech.textDisplay,
      textSpeak: speech.textSpeak,
      speechChunks: speech.speechChunks,
      segmentCount: speech.segmentCount,
      usedSsml: speech.useSsml,
      phases: PHASES
    };
  }

  let buf = null;
  let env = _extractAudioEnvelope(json);
  if (!env.request_id){
    env.request_id = _pickFirst(
      _getHeader(resp && resp.headers, "x-request-id"),
      _getHeader(resp && resp.headers, "x-amzn-requestid"),
      _getHeader(resp && resp.headers, "x-correlation-id")
    );
  }
  let detectedOutputFormat = env.output_format || outputFormat;
  let detectedContentType = contentType;

  if (_isAudioContentType(contentType) && Buffer.isBuffer(resp && resp.buffer) && resp.buffer.length >= 16){
    buf = resp.buffer;
  } else if (env.audio_content){
    buf = _safeBase64ToBuffer(env.audio_content);
    if (!buf){
      return {
        ok: false,
        retryable: false,
        reason: "base64_decode_failed",
        message: "Provider returned audio_content but it could not be decoded.",
        status,
        elapsedMs: Date.now() - started,
        issues: env.issues,
        requestId: env.request_id,
        authMode,
        attemptsUsed,
        providerEndpoint,
        voiceUuid,
        voiceUuidMasked: _mask(voiceUuid),
        traceId: _headerSafe(traceId, 120),
        textDisplay: speech.textDisplay,
        textSpeak: speech.textSpeak,
        speechChunks: speech.speechChunks,
        segmentCount: speech.segmentCount,
        usedSsml: speech.useSsml,
        phases: PHASES
      };
    }
  } else if (env.audio_base64){
    buf = _safeBase64ToBuffer(env.audio_base64);
    if (!buf){
      return {
        ok: false,
        retryable: false,
        reason: "base64_decode_failed",
        message: "Provider returned audio_base64 but it could not be decoded.",
        status,
        elapsedMs: Date.now() - started,
        issues: env.issues,
        requestId: env.request_id,
        authMode,
        attemptsUsed,
        providerEndpoint,
        voiceUuid,
        voiceUuidMasked: _mask(voiceUuid),
        traceId: _headerSafe(traceId, 120),
        textDisplay: speech.textDisplay,
        textSpeak: speech.textSpeak,
        speechChunks: speech.speechChunks,
        segmentCount: speech.segmentCount,
        usedSsml: speech.useSsml,
        phases: PHASES
      };
    }
  } else if (env.audio_src){
    try{
      const dl = await _downloadBufferWithRetry(String(env.audio_src), timeoutMs);
      buf = dl.buffer;
      detectedContentType = _getHeader(dl.headers, "content-type") || detectedContentType;
    }catch(e){
      return {
        ok: false,
        retryable: true,
        reason: "audio_src_download_failed",
        message: _str(e && e.message ? e.message : e),
        status,
        elapsedMs: Date.now() - started,
        issues: env.issues,
        requestId: env.request_id,
        authMode,
        attemptsUsed,
        providerEndpoint,
        voiceUuid,
        voiceUuidMasked: _mask(voiceUuid),
        traceId: _headerSafe(traceId, 120),
        textDisplay: speech.textDisplay,
        textSpeak: speech.textSpeak,
        speechChunks: speech.speechChunks,
        segmentCount: speech.segmentCount,
        usedSsml: speech.useSsml,
        phases: PHASES
      };
    }
  } else {
    return {
      ok: false,
      retryable: true,
      reason: "missing_audio_payload",
      message: "Provider returned success but no audio payload was found.",
      status,
      elapsedMs: Date.now() - started,
      issues: env.issues,
      requestId: env.request_id,
      authMode,
      attemptsUsed,
      providerEndpoint,
      voiceUuid,
      voiceUuidMasked: _mask(voiceUuid),
      requestedVoiceUuid: voiceState.requestedVoiceUuid,
      requestedVoiceUuidMasked: _mask(voiceState.requestedVoiceUuid),
      voiceLocked: voiceState.configured,
      voiceIntegrity: { conflict: voiceState.conflict, valid: voiceState.valid },
      traceId: _headerSafe(traceId, 120),
      textDisplay: speech.textDisplay,
      textSpeak: speech.textSpeak,
      speechChunks: speech.speechChunks,
      segmentCount: speech.segmentCount,
      usedSsml: speech.useSsml,
      phases: PHASES
    };
  }

  if (!Buffer.isBuffer(buf) || buf.length < 16){
    return {
      ok: false,
      retryable: true,
      reason: "empty_audio",
      message: "Decoded audio buffer is empty.",
      status,
      elapsedMs: Date.now() - started,
      issues: env.issues,
      requestId: env.request_id,
      authMode,
      attemptsUsed,
      providerEndpoint,
      voiceUuid,
      voiceUuidMasked: _mask(voiceUuid),
      requestedVoiceUuid: voiceState.requestedVoiceUuid,
      requestedVoiceUuidMasked: _mask(voiceState.requestedVoiceUuid),
      voiceLocked: voiceState.configured,
      voiceIntegrity: { conflict: voiceState.conflict, valid: voiceState.valid },
      traceId: _headerSafe(traceId, 120),
      textDisplay: speech.textDisplay,
      textSpeak: speech.textSpeak,
      speechChunks: speech.speechChunks,
      segmentCount: speech.segmentCount,
      usedSsml: speech.useSsml,
      phases: PHASES
    };
  }

  return {
    ok: true,
    buffer: buf,
    mimeType: _resolveMime(buf, detectedOutputFormat, detectedContentType),
    elapsedMs: Date.now() - started,
    duration: env.duration,
    synthDuration: env.synth_duration,
    sampleRate: env.sample_rate,
    outputFormat: detectedOutputFormat,
    issues: env.issues,
    requestId: env.request_id,
    providerStatus: status,
    authMode,
    attemptsUsed,
    providerEndpoint,
    voiceUuid,
    voiceUuidMasked: _mask(voiceUuid),
    traceId: _headerSafe(traceId, 120),
    textDisplay: speech.textDisplay,
    textSpeak: speech.textSpeak,
    plainText: speech.plainText,
    ssmlText: speech.ssmlText,
    speechChunks: speech.speechChunks,
    segmentCount: speech.segmentCount,
    speechHints: speech.speechHints,
    usedSsml: speech.useSsml,
    ttsFailure: { ok: true, action: "clear", retryable: false, shouldStop: false, shouldTerminate: false },
    audioFailure: { ok: true, action: "clear", retryable: false, shouldStop: false, shouldTerminate: false },
    phases: PHASES
  };
}

module.exports = { synthesize, MANUAL_RESEMBLE_CONFIG };

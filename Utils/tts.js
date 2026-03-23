"use strict";

const crypto = require("crypto");

const _providerRuntime = (() => {
const https = require("https");

const MAX_AUDIO_BYTES = 25 * 1024 * 1024;
const MAX_RESPONSE_BYTES = 5 * 1024 * 1024;


const MANUAL_RESEMBLE_CONFIG = Object.freeze({
  // Manual fallback placeholders: paste real values between the quotes if you want file-level overrides.
  // Leave blank to use environment variables instead.
  apiKey: "",
  voiceUuid: "",
  projectUuid: "",
  synthUrl: "https://f.cluster.resemble.ai/synthesize",
  statusUrlTemplate: ""
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
  p26_audioRecoverySignalReady: true,
  p27_asyncPolling: true,
  p28_asyncResultRetrieval: true
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
    fallback: {
      kind: "text_only",
      shouldContinueText: true,
      reason: reason || "tts_unavailable"
    },
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
  return _manualOrEnv(
    _manualConfig().apiKey,
    process.env.RESEMBLE_API_TOKEN,
    process.env.RESEMBLE_API_KEY,
    process.env.SB_RESEMBLE_API_TOKEN,
    process.env.SB_RESEMBLE_API_KEY,
    process.env.SB_TTS_TOKEN,
    process.env.TTS_TOKEN,
    process.env.SANDBLAST_TTS_TOKEN,
    process.env.RESEMBLE_TOKEN,
    ""
  );
}
function _getProjectUuid(){
  return _manualOrEnv(_manualConfig().projectUuid, process.env.RESEMBLE_PROJECT_UUID, process.env.SB_RESEMBLE_PROJECT_UUID, "");
}
function _getBackendPublicBase(){
  return _normalizeUrlCandidate(
    _pickFirst(
      process.env.SB_BACKEND_PUBLIC_BASE_URL,
      process.env.SANDBLAST_BACKEND_PUBLIC_BASE_URL,
      process.env.RENDER_EXTERNAL_URL,
      "https://sandbox-backend.onrender.com"
    )
  );
}
function _getTokenSource(){
  const candidates = [
    ["MANUAL_RESEMBLE_CONFIG.apiKey", _manualConfig().apiKey],
    ["RESEMBLE_API_TOKEN", process.env.RESEMBLE_API_TOKEN],
    ["RESEMBLE_API_KEY", process.env.RESEMBLE_API_KEY],
    ["SB_RESEMBLE_API_TOKEN", process.env.SB_RESEMBLE_API_TOKEN],
    ["SB_RESEMBLE_API_KEY", process.env.SB_RESEMBLE_API_KEY],
    ["SB_TTS_TOKEN", process.env.SB_TTS_TOKEN],
    ["TTS_TOKEN", process.env.TTS_TOKEN],
    ["SANDBLAST_TTS_TOKEN", process.env.SANDBLAST_TTS_TOKEN],
    ["RESEMBLE_TOKEN", process.env.RESEMBLE_TOKEN]
  ];
  for (const [name, value] of candidates){
    if (_trim(value)) return name;
  }
  return "";
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

function _pollAttempts(){
  return _clampInt(process.env.SB_TTS_PROVIDER_POLL_ATTEMPTS, 10, 1, 40);
}
function _pollIntervalMs(){
  return _clampInt(process.env.SB_TTS_PROVIDER_POLL_INTERVAL_MS, 900, 200, 5000);
}
function _pollMaxMs(){
  return _clampInt(process.env.SB_TTS_PROVIDER_POLL_MAX_MS, 15000, 1000, 120000);
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

function _isLikelyHtml(text){
  const s = _trim(text).slice(0, 256).toLowerCase();
  return s.startsWith("<!doctype html") || s.startsWith("<html") || s.includes("<body") || s.includes("</html>");
}
function _safePreview(value, max){
  return _str(value).replace(/\s+/g, " ").trim().slice(0, max || 240);
}
function _firstObject(){
  for (let i = 0; i < arguments.length; i++){
    const v = arguments[i];
    if (v && typeof v === "object" && !Array.isArray(v)) return v;
  }
  return null;
}
function _firstArrayObject(arr){
  if (!Array.isArray(arr)) return null;
  for (const item of arr){
    if (item && typeof item === "object" && !Array.isArray(item)) return item;
  }
  return null;
}
function _inferFormatFromUrl(url){
  const s = _lower(url);
  if (!s) return "";
  if (/\.wav(?:\?|$)/.test(s)) return "wav";
  if (/\.ogg(?:\?|$)/.test(s)) return "ogg";
  if (/\.flac(?:\?|$)/.test(s)) return "flac";
  if (/\.mp3(?:\?|$)/.test(s)) return "mp3";
  return "";
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


function _statusUrlTemplate(){
  return _manualOrEnv(
    _manualConfig().statusUrlTemplate,
    process.env.RESEMBLE_STATUS_URL_TEMPLATE,
    process.env.RESEMBLE_POLL_URL_TEMPLATE,
    process.env.SB_RESEMBLE_STATUS_URL_TEMPLATE,
    ""
  );
}

function _replaceTemplateTokens(template, vars){
  let out = _trim(template);
  if (!out) return "";
  for (const [key, value] of Object.entries(vars || {})){
    const safe = encodeURIComponent(_trim(value));
    out = out
      .replace(new RegExp(`\\{${key}\\}`, "g"), safe)
      .replace(new RegExp(`:${key}(?=\\b)`, "g"), safe);
  }
  return _normalizeUrlCandidate(out);
}

function _extractAsyncEnvelope(json){
  if (!json || typeof json !== "object") return {};
  const data = _firstObject(json.data);
  const result = _firstObject(json.result);
  const response = _firstObject(json.response);
  const output = _firstObject(json.output);
  const job = _firstObject(json.job) || _firstObject(data && data.job) || _firstObject(result && result.job) || _firstObject(response && response.job);
  const item0 = _firstArrayObject(json.items) || _firstArrayObject(json.outputs) || _firstArrayObject(json.results);
  const rawStatus = _pickFirst(
    json.status,
    json.state,
    json.job_status,
    json.render_status,
    data && (data.status || data.state || data.job_status || data.render_status),
    result && (result.status || result.state || result.job_status || result.render_status),
    response && (response.status || response.state || response.job_status || response.render_status),
    output && (output.status || output.state || output.job_status || output.render_status),
    job && (job.status || job.state || job.job_status || job.render_status),
    item0 && (item0.status || item0.state || item0.job_status || item0.render_status)
  );

  const id = _pickFirst(
    json.clip_uuid,
    json.clip_id,
    json.generation_id,
    json.request_id,
    json.id,
    data && (data.clip_uuid || data.clip_id || data.generation_id || data.request_id || data.id),
    result && (result.clip_uuid || result.clip_id || result.generation_id || result.request_id || result.id),
    response && (response.clip_uuid || response.clip_id || response.generation_id || response.request_id || response.id),
    output && (output.clip_uuid || output.clip_id || output.generation_id || output.request_id || output.id),
    job && (job.clip_uuid || job.clip_id || job.generation_id || job.request_id || job.id),
    item0 && (item0.clip_uuid || item0.clip_id || item0.generation_id || item0.request_id || item0.id)
  );

  const statusUrl = _pickFirst(
    json.status_url,
    json.poll_url,
    json.result_url,
    json.job_url,
    data && (data.status_url || data.poll_url || data.result_url || data.job_url),
    result && (result.status_url || result.poll_url || result.result_url || result.job_url),
    response && (response.status_url || response.poll_url || response.result_url || response.job_url),
    output && (output.status_url || output.poll_url || output.result_url || output.job_url),
    job && (job.status_url || job.poll_url || job.result_url || job.job_url),
    item0 && (item0.status_url || item0.poll_url || item0.result_url || item0.job_url)
  );

  const errorMessage = _pickFirst(
    json.error,
    json.message,
    json.detail,
    json.reason,
    data && (data.error || data.message || data.detail || data.reason),
    result && (result.error || result.message || result.detail || result.reason),
    response && (response.error || response.message || response.detail || response.reason),
    output && (output.error || output.message || output.detail || output.reason),
    job && (job.error || job.message || job.detail || job.reason),
    item0 && (item0.error || item0.message || item0.detail || item0.reason)
  );

  const normalizedStatus = _lower(rawStatus);

  return {
    id: _trim(id),
    status: normalizedStatus,
    rawStatus: _trim(rawStatus),
    statusUrl: _normalizeUrlCandidate(statusUrl),
    pending: /^(queued|queue|pending|processing|rendering|running|in_progress|in-progress|starting|accepted|submitted)$/.test(normalizedStatus),
    done: /^(complete|completed|done|ready|finished|success|succeeded)$/.test(normalizedStatus),
    failed: /^(failed|error|errored|canceled|cancelled|rejected|expired)$/.test(normalizedStatus),
    message: _trim(errorMessage)
  };
}

function _candidateStatusUrls(asyncEnv, projectUuid){
  const vars = {
    id: asyncEnv && asyncEnv.id,
    requestId: asyncEnv && asyncEnv.id,
    clipId: asyncEnv && asyncEnv.id,
    generationId: asyncEnv && asyncEnv.id,
    projectUuid: projectUuid || ""
  };
  const urls = [
    asyncEnv && asyncEnv.statusUrl,
    _replaceTemplateTokens(_statusUrlTemplate(), vars)
  ]
    .map(_normalizeUrlCandidate)
    .filter(Boolean);

  const uniq = [];
  const seen = new Set();
  for (const u of urls){
    if (!seen.has(u)){
      seen.add(u);
      uniq.push(u);
    }
  }
  return uniq;
}

function _shouldAttemptAsyncPolling(status, json){
  if (!(status >= 200 && status < 300) || !json || typeof json !== "object") return false;
  const asyncEnv = _extractAsyncEnvelope(json);
  if (asyncEnv.pending || asyncEnv.done || asyncEnv.failed) return !!(asyncEnv.id || asyncEnv.statusUrl);
  if (asyncEnv.id && !(_extractAudioEnvelope(json).audio_content || _extractAudioEnvelope(json).audio_base64 || _extractAudioEnvelope(json).audio_src)) return true;
  return false;
}

function _getViaHttps(url, headers, timeoutMs){
  const maxBytes = _maxResponseBytes();
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.request(
      {
        method: "GET",
        hostname: u.hostname,
        port: u.port || undefined,
        protocol: u.protocol,
        path: u.pathname + (u.search || ""),
        headers: {
          Accept: "application/json, audio/*;q=0.9, */*;q=0.8",
          "Accept-Encoding": "identity",
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
    req.end();
  });
}

async function _getRequest(url, headers, timeoutMs){
  const safeUrl = _assertSafeRemoteUrl(url, false);
  if (typeof fetch === "function"){
    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    let to = null;
    try{
      if (controller) to = setTimeout(() => controller.abort(), timeoutMs);
      const res = await fetch(safeUrl, {
        method: "GET",
        headers: {
          Accept: "application/json, audio/*;q=0.9, */*;q=0.8",
          "Accept-Encoding": "identity",
          ...headers
        },
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
  return _getViaHttps(safeUrl, headers, timeoutMs);
}

async function _pollRequest(url, token, traceId, timeoutMs, authMode){
  const headers = {
    ..._buildAuthHeaders(token, authMode),
    "User-Agent": "sb-nyx-tts/1.4"
  };
  if (traceId) headers["X-SB-Trace-ID"] = _headerSafe(traceId, 120);
  const resp = await _getRequest(url, headers, timeoutMs);
  resp.providerEndpoint = _safeUrlForLogs(url);
  return resp;
}

async function _pollForCompletedAudio(initialJson, token, traceId, timeoutMs, projectUuid){
  const asyncEnv = _extractAsyncEnvelope(initialJson);
  const urls = _candidateStatusUrls(asyncEnv, projectUuid);
  if (!urls.length) return null;

  const authModes = ["bearer"];
  const deadline = Date.now() + _pollMaxMs();
  let pollsUsed = 0;
  let lastResp = null;
  let lastJson = null;
  let lastAuthMode = "bearer";

  while (Date.now() <= deadline && pollsUsed < _pollAttempts()){
    for (const url of urls){
      for (const authMode of authModes){
        pollsUsed++;
        lastAuthMode = authMode;
        try{
          const resp = await _pollRequest(url, token, traceId, timeoutMs, authMode);
          lastResp = resp;
          const ct = _getHeader(resp && resp.headers, "content-type");
          const json = _isJsonContentType(ct)
            ? _parseJson(resp && resp.text ? resp.text : "")
            : (_parseJson(resp && resp.text ? resp.text : "") || _safeJsonParseFromBuffer(resp && resp.buffer));
          lastJson = json;

          if (_providerSucceeded(resp && resp.status ? resp.status : 0, json, resp)){
            return { resp, json, authMode, pollsUsed };
          }

          const state = _extractAsyncEnvelope(json);
          if (state.failed){
            return { resp, json, authMode, pollsUsed, failed: true, failureMessage: state.message || _normalizeProviderMessage(json, resp && resp.text) };
          }
          if (state.done){
            const env = _extractAudioEnvelope(json);
            if (env.audio_content || env.audio_base64 || env.audio_src){
              return { resp, json, authMode, pollsUsed };
            }
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
        if (pollsUsed >= _pollAttempts() || Date.now() > deadline) break;
      }
      if (pollsUsed >= _pollAttempts() || Date.now() > deadline) break;
    }
    if (pollsUsed >= _pollAttempts() || Date.now() > deadline) break;
    await _sleep(_pollIntervalMs());
  }

  return { resp: lastResp, json: lastJson, authMode: lastAuthMode, pollsUsed, timeout: true };
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
  const authModes = ["bearer"];
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

  if (_isLikelyHtml(resp && resp.text)) return false;
  if (!json) return false;
  if (json.success === true) return true;
  if (json.ok === true) return true;

  const env = _extractAudioEnvelope(json);
  if (env.audio_content || env.audio_src || env.audio_base64) return true;

  return false;
}

function _extractAudioEnvelope(json){
  if (!json || typeof json !== "object") return {};

  const data = _firstObject(json.data);
  const result = _firstObject(json.result);
  const response = _firstObject(json.response);
  const audio = _firstObject(json.audio);
  const file = _firstObject(json.file);
  const payload = _firstObject(json.payload);
  const output = _firstObject(json.output);
  const item0 = _firstArrayObject(json.items) || _firstArrayObject(json.outputs) || _firstArrayObject(json.results);
  const nested = _firstObject(
    data && data.audio,
    result && result.audio,
    response && response.audio,
    payload && payload.audio,
    output && output.audio,
    item0 && item0.audio
  );

  return {
    audio_content: _pickFirst(
      json.audio_content,
      json.audio,
      json.content,
      data && (data.audio_content || data.audio || data.content),
      result && (result.audio_content || result.audio || result.content),
      response && (response.audio_content || response.audio || response.content),
      audio && (audio.content || audio.audio_content),
      nested && (nested.content || nested.audio_content),
      output && (output.audio_content || output.content),
      item0 && (item0.audio_content || item0.content)
    ),
    audio_base64: _pickFirst(
      json.audio_base64,
      json.base64,
      json.audioBase64,
      json.audio_base_64,
      data && (data.audio_base64 || data.base64 || data.audioBase64 || data.audio_base_64),
      result && (result.audio_base64 || result.base64 || result.audioBase64 || result.audio_base_64),
      response && (response.audio_base64 || response.base64 || response.audioBase64 || response.audio_base_64),
      audio && (audio.base64 || audio.audio_base64 || audio.audioBase64),
      nested && (nested.base64 || nested.audio_base64 || nested.audioBase64),
      file && (file.base64 || file.audio_base64 || file.audioBase64),
      output && (output.audio_base64 || output.base64 || output.audioBase64),
      item0 && (item0.audio_base64 || item0.base64 || item0.audioBase64)
    ),
    audio_src: _pickFirst(
      json.audio_src,
      json.url,
      json.src,
      json.download_url,
      data && (data.audio_src || data.url || data.src || data.download_url),
      result && (result.audio_src || result.url || result.src || result.download_url),
      response && (response.audio_src || response.url || response.src || response.download_url),
      audio && (audio.url || audio.src || audio.audio_src || audio.download_url),
      nested && (nested.url || nested.src || nested.audio_src || nested.download_url),
      file && (file.url || file.src || file.download_url),
      output && (output.audio_src || output.url || output.src || output.download_url),
      item0 && (item0.audio_src || item0.url || item0.src || item0.download_url)
    ),
    output_format: _pickFirst(
      json.output_format,
      json.format,
      json.mime_format,
      data && (data.output_format || data.format || data.mime_format),
      result && (result.output_format || result.format || result.mime_format),
      response && (response.output_format || response.format || response.mime_format),
      audio && (audio.format || audio.output_format),
      nested && (nested.format || nested.output_format),
      output && (output.output_format || output.format),
      item0 && (item0.output_format || item0.format),
      _inferFormatFromUrl(_pickFirst(
        json.audio_src,
        json.url,
        data && (data.audio_src || data.url),
        result && (result.audio_src || result.url),
        response && (response.audio_src || response.url),
        audio && (audio.url || audio.src),
        nested && (nested.url || nested.src),
        file && (file.url || file.src)
      ))
    ),
    duration: json.duration || (data && data.duration) || (result && result.duration) || (response && response.duration),
    synth_duration: json.synth_duration || (data && data.synth_duration) || (result && result.synth_duration) || (response && response.synth_duration),
    sample_rate: json.sample_rate || (data && data.sample_rate) || (result && result.sample_rate) || (response && response.sample_rate),
    request_id: _pickFirst(
      json.request_id,
      json.id,
      data && (data.request_id || data.id),
      result && (result.request_id || result.id),
      response && (response.request_id || response.id),
      item0 && (item0.request_id || item0.id)
    ),
    issues: Array.isArray(json.issues)
      ? json.issues
      : (data && Array.isArray(data.issues)
        ? data.issues
        : (result && Array.isArray(result.issues)
          ? result.issues
          : (response && Array.isArray(response.issues)
            ? response.issues
            : (item0 && Array.isArray(item0.issues) ? item0.issues : undefined))))
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

  let status = resp && resp.status ? resp.status : 0;
  let providerEndpoint = resp && resp.providerEndpoint ? resp.providerEndpoint : _pickFirst.apply(null, _candidateSynthesizeUrls());
  let contentType = _getHeader(resp && resp.headers, "content-type");
  let json = _isJsonContentType(contentType)
    ? _parseJson(resp && resp.text ? resp.text : "")
    : (_parseJson(resp && resp.text ? resp.text : "") || _safeJsonParseFromBuffer(resp && resp.buffer));

  let pollOutcome = null;
  if (!_providerSucceeded(status, json, resp) && _shouldAttemptAsyncPolling(status, json)){
    pollOutcome = await _pollForCompletedAudio(json, token, traceId, timeoutMs, projectUuid);
    if (pollOutcome && pollOutcome.resp){
      resp = pollOutcome.resp;
      authMode = pollOutcome.authMode || authMode;
      status = resp && resp.status ? resp.status : status;
      providerEndpoint = resp && resp.providerEndpoint ? resp.providerEndpoint : providerEndpoint;
      contentType = _getHeader(resp && resp.headers, "content-type");
      json = pollOutcome.json || (
        _isJsonContentType(contentType)
          ? _parseJson(resp && resp.text ? resp.text : "")
          : (_parseJson(resp && resp.text ? resp.text : "") || _safeJsonParseFromBuffer(resp && resp.buffer))
      );
    }
  }

  if (!_providerSucceeded(status, json, resp)){
    const retryable = _retryableStatus(status) || !!(pollOutcome && pollOutcome.timeout);
    const pollState = _extractAsyncEnvelope(json);
    return {
      ok: false,
      retryable,
      reason:
        (status === 401 || status === 403) ? "auth_error" :
        (pollOutcome && pollOutcome.timeout) ? "async_poll_timeout" :
        (pollState && pollState.failed) ? "async_provider_failed" :
        "http_error",
      message:
        (pollOutcome && pollOutcome.failed && pollOutcome.failureMessage) ||
        _normalizeProviderMessage(json, resp && resp.text ? resp.text : "Resemble synthesis failed."),
      status,
      elapsedMs: Date.now() - started,
      issues: json && Array.isArray(json.issues) ? json.issues : undefined,
      requestId: json && (json.request_id || json.id) ? (json.request_id || json.id) : undefined,
      authMode,
      attemptsUsed,
      pollsUsed: pollOutcome && pollOutcome.pollsUsed ? pollOutcome.pollsUsed : 0,
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
      rawPreview: _safePreview(resp && resp.text, 240),
      asyncState: pollState && pollState.rawStatus ? pollState.rawStatus : undefined,
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
      detectedOutputFormat = _pickFirst(env.output_format, _inferFormatFromUrl(String(env.audio_src)), detectedOutputFormat);
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

  const mimeType = _resolveMime(buf, detectedOutputFormat, detectedContentType);
  const audioBase64 = buf.toString("base64");

  return {
    ok: true,
    buffer: buf,
    audioBase64,
    audio: audioBase64,
    byteLength: buf.length,
    contentLength: buf.length,
    mimeType,
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
    pollsUsed: pollOutcome && pollOutcome.pollsUsed ? pollOutcome.pollsUsed : 0,
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

return { synthesize, MANUAL_RESEMBLE_CONFIG };

})();

const { synthesize, MANUAL_RESEMBLE_CONFIG } = _providerRuntime;

const PHASES = Object.freeze({
  p01_contractSafe: true,
  p02_resembleUnified: true,
  p03_concurrencyGate: true,
  p04_circuitBreaker: true,
  p05_failOpenHealth: true,
  p06_inputNormalization: true,
  p07_speechShaping: true,
  p08_pronunciationMap: true,
  p09_payloadHardening: true,
  p10_bufferCoercion: true,
  p11_headerTelemetry: true,
  p12_jsonAudioMode: false,
  p13_introParity: true,
  p14_retrySignal: true,
  p15_operationalDiagnostics: true,
  p16_projectUuidGuard: true,
  p17_providerErrorPassThrough: true,
  p18_traceCorrelation: true,
  p19_safeSnapshots: true,
  p20_structuredFailureSurface: true,
  p21_tokenPreflight: true,
  p22_retryBackoff: true,
  p23_recoveryClearSignal: true,
  p24_healthReadinessTruth: true,
  p25_routeLevelFailover: true,
  p26_exactFrontendContract: true,
  p27_nestedPayloadNormalization: true
});

const TTS_VERSION = "tts.js v2.8.1 RESEMBLE-FAILOVER-HARDENED-ROUTEFIX";
const MAX_TEXT = 1800;
const MAX_CONCURRENT = Number(process.env.SB_TTS_MAX_CONCURRENT || 3);
const CIRCUIT_LIMIT = Number(process.env.SB_TTS_CIRCUIT_LIMIT || 5);
const CIRCUIT_RESET_MS = Number(process.env.SB_TTS_CIRCUIT_RESET_MS || 30000);
const LOG_PREVIEW_MAX = Number(process.env.SB_TTS_LOG_PREVIEW_MAX || 160);
const LOG_ENABLED = !["0", "false", "off", "no"].includes(String(process.env.SB_TTS_LOG_ENABLED || "true").toLowerCase());
const PROVIDER_TIMEOUT_MS = Math.max(1000, Number(process.env.SB_TTS_PROVIDER_TIMEOUT_MS || process.env.SB_RESEMBLE_TIMEOUT_MS || process.env.RESEMBLE_TIMEOUT_MS || 20000));
const FAILOVER_MAX_VARIANTS = Math.max(1, Math.min(4, Number(process.env.SB_TTS_FAILOVER_VARIANTS || 3)));
const TOKEN_ENV_KEYS = Object.freeze([
  "RESEMBLE_API_TOKEN",
  "SB_RESEMBLE_API_TOKEN",
  "RESEMBLE_API_KEY",
  "SB_RESEMBLE_API_KEY",
  "SB_TTS_TOKEN",
  "TTS_TOKEN",
  "SANDBLAST_TTS_TOKEN",
  "RESEMBLE_TOKEN"
]);
const VOICE_LOCK_ENV_KEYS = Object.freeze([
  "RESEMBLE_VOICE_UUID",
  "SB_RESEMBLE_VOICE_UUID",
  "SBNYX_RESEMBLE_VOICE_UUID",
  "MIXER_VOICE_ID",
  "RESEMBLE_VOICE_ID",
  "NYX_VOICE_ID",
  "TTS_VOICE_ID"
]);

const VOICE_NAME_ENV_KEYS = Object.freeze([
  "MIXER_VOICE_NAME",
  "NYX_VOICE_NAME",
  "TTS_VOICE_NAME"
]);


const DEFAULT_SPEECH_HINTS = Object.freeze({
  pauses: { commaMs: 110, periodMs: 300, questionMs: 340, exclaimMs: 320, colonMs: 180, semicolonMs: 220, ellipsisMs: 480 },
  pacing: { mode: "natural", preservePunctuation: true, sentenceBreath: true, noRunOns: true }
});

const DEFAULT_PRONUNCIATION_MAP = Object.freeze({
  Nyx: "Nix",
  Nix: "Nix",
  Sandblast: "Sand-blast",
  Roku: "Roh-koo",
  Marion: "Marry-in",
  AI: "A I",
  TTS: "T T S",
  TV: "T V"
});

let activeRequests = 0;
let failCount = 0;
let circuitOpenUntil = 0;
let lastError = "";
let lastOkAt = 0;
let lastFailAt = 0;
let lastProviderStatus = 0;
let lastElapsedMs = 0;

const _str = (v) => (v == null ? "" : String(v));
const _trim = (v) => _str(v).trim();
const _lower = (v) => _trim(v).toLowerCase();
const _now = () => Date.now();
const _makeTrace = () => `tts_${Date.now().toString(16)}_${crypto.randomBytes(4).toString("hex")}`;

const STRICT_VOICE_LOCK = !["0", "false", "off", "no"].includes(String(process.env.SB_TTS_STRICT_VOICE_LOCK || "true").toLowerCase());

const AUDIO_FIRST_LOCK = !["0", "false", "off", "no"].includes(String(process.env.SB_TTS_AUDIO_FIRST_LOCK || "true").toLowerCase());
const AUDIO_VERIFY_HEADER = !["0", "false", "off", "no"].includes(String(process.env.SB_TTS_AUDIO_VERIFY_HEADER || "true").toLowerCase());

const ALLOW_JSON_AUDIO = !["0", "false", "off", "no"].includes(String(process.env.SB_TTS_ALLOW_JSON_AUDIO || "false").toLowerCase());

function _getBackendPublicBase() {
  const raw = _pickFirst(
    process.env.SB_BACKEND_PUBLIC_BASE_URL,
    process.env.SANDBLAST_BACKEND_PUBLIC_BASE_URL,
    process.env.RENDER_EXTERNAL_URL,
    "https://sandbox-backend.onrender.com"
  );
  return _trim(raw).replace(/\/$/, "");
}

function _getTokenSource() {
  const candidates = [
    ["MANUAL_RESEMBLE_CONFIG.apiKey", MANUAL_RESEMBLE_CONFIG && MANUAL_RESEMBLE_CONFIG.apiKey],
    ["RESEMBLE_API_TOKEN", process.env.RESEMBLE_API_TOKEN],
    ["RESEMBLE_API_KEY", process.env.RESEMBLE_API_KEY],
    ["SB_RESEMBLE_API_TOKEN", process.env.SB_RESEMBLE_API_TOKEN],
    ["SB_RESEMBLE_API_KEY", process.env.SB_RESEMBLE_API_KEY],
    ["SB_TTS_TOKEN", process.env.SB_TTS_TOKEN],
    ["TTS_TOKEN", process.env.TTS_TOKEN],
    ["SANDBLAST_TTS_TOKEN", process.env.SANDBLAST_TTS_TOKEN],
    ["RESEMBLE_TOKEN", process.env.RESEMBLE_TOKEN]
  ];
  for (const [name, value] of candidates) {
    if (_trim(value)) return name;
  }
  return "";
}

function _requestsJsonAudio(req, body, query, headers) {
  const method = _lower(req && req.method);
  const headerMode = _lower(_pickFirst(headers["x-sb-response-mode"], headers["x-response-mode"], headers["x-tts-mode"]));
  const accept = _lower(_pickFirst(headers["accept"]));
  const queryOptIn = _bool(query && (query.returnJsonAudio != null ? query.returnJsonAudio : query.returnJson), false);
  const bodyOptIn = _bool(body && (body.returnJsonAudio != null ? body.returnJsonAudio : body.returnJson), false);
  if (!ALLOW_JSON_AUDIO) return false;
  const explicitHeader = ["json-audio", "audio-json", "base64-audio", "json"].includes(headerMode);
  const explicitAccept = accept.includes("application/json") && !accept.includes("audio/");
  const explicitIntent = !!(explicitHeader || queryOptIn || bodyOptIn || explicitAccept);
  if (!explicitIntent) return false;
  if (AUDIO_FIRST_LOCK && method == "post") return false;
  return true;
}

function _requestIsHealth(req, body, query, headers) {
  const path = _lower(_pickFirst(req && req.originalUrl, req && req.url));
  if (path.includes("/health")) return true;
  if (req && req.method && String(req.method).toUpperCase() === "GET") {
    return _bool(query && query.healthCheck, false) || _bool(headers && headers["x-sb-health-check"], false);
  }
  return false;
}

function _looksLikeShortVoiceId(value) {
  return /^[0-9a-f]{8}$/i.test(_trim(value));
}

function _looksLikeVoiceIdentifier(value) {
  return _looksLikeUuid(value) || _looksLikeShortVoiceId(value);
}

function _extractVoiceUuidCandidate() {
  for (let i = 0; i < arguments.length; i += 1) {
    const candidate = arguments[i];
    if (candidate == null) continue;
    if (typeof candidate === "string") {
      const v = _trim(candidate);
      if (v) return v;
      continue;
    }
    if (typeof candidate === "object") {
      const nested = _pickFirst(
        candidate.voice_uuid,
        candidate.voiceUuid,
        candidate.voiceId,
        candidate.voice,
        candidate.resembleVoiceUuid,
        candidate.mixerVoiceUuid,
        candidate.uuid,
        candidate.id
      );
      if (nested) return nested;
    }
  }
  return "";
}

function _voiceSelectionSource(requestedVoiceUuid, resolvedVoiceUuid) {
  if (_trim(requestedVoiceUuid) && _trim(resolvedVoiceUuid)) return "request";
  if (!_trim(requestedVoiceUuid) && _trim(resolvedVoiceUuid)) return "lock";
  return "missing";
}

function _voiceContract(input) {
  const integrity = _voiceIntegrityConfig();
  const requestedVoiceUuid = _trim(input && input.requestedVoiceUuid);
  const resolvedVoiceUuid = _trim(input && input.voiceUuid);
  const problems = [];

  if (!resolvedVoiceUuid) problems.push("missing_voice_uuid");
  if (requestedVoiceUuid && !_looksLikeVoiceIdentifier(requestedVoiceUuid)) problems.push("invalid_requested_voice_uuid");
  if (resolvedVoiceUuid && !_looksLikeVoiceIdentifier(resolvedVoiceUuid)) problems.push("invalid_resolved_voice_uuid");
  if (STRICT_VOICE_LOCK && integrity.configured && integrity.conflictingKeys.length) problems.push("conflicting_locked_voice_env");
  if (STRICT_VOICE_LOCK && requestedVoiceUuid && integrity.voiceUuid && requestedVoiceUuid !== integrity.voiceUuid) {
    problems.push("voice_uuid_override_blocked");
  }

  return {
    ok: problems.length === 0,
    strict: STRICT_VOICE_LOCK,
    source: _voiceSelectionSource(requestedVoiceUuid, resolvedVoiceUuid),
    requestedVoiceUuid,
    resolvedVoiceUuid,
    problems,
    integrity
  };
}


function _bool(v, d) {
  if (v == null || v === "") return d;
  if (typeof v === "boolean") return v;
  const s = _lower(v);
  if (["1", "true", "yes", "on"].includes(s)) return true;
  if (["0", "false", "no", "off"].includes(s)) return false;
  return d;
}
function _int(value, fallback, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

function _headerSafe(value, max = 80) {
  return _str(value).replace(/[\r\n]+/g, " ").trim().slice(0, max);
}


function _pickFirst() {
  for (let i = 0; i < arguments.length; i += 1) {
    const v = _trim(arguments[i]);
    if (v) return v;
  }
  return "";
}

function _safeJson(res, status, body) {
  if (!res || res.headersSent) return;
  try {
    res.status(status).json(body);
  } catch (_) {
    try {
      res.status(status).send(JSON.stringify(body));
    } catch (__ ) {}
  }
}

function _setHeader(res, k, v) {
  try {
    if (res && !res.headersSent) res.setHeader(k, v);
  } catch (_) {}
}

function _hash(value) {
  return crypto.createHash("sha1").update(_str(value)).digest("hex").slice(0, 12);
}

function _preview(value, max = LOG_PREVIEW_MAX) {
  const s = _str(value).replace(/\s+/g, " ").trim();
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

function _mask(value, left = 4, right = 3) {
  const s = _trim(value);
  if (!s) return "";
  if (s.length <= left + right) return s;
  return `${s.slice(0, left)}***${s.slice(-right)}`;
}

function _sanitizeLogData(data) {
  if (data == null) return data;
  if (Array.isArray(data)) return data.map(_sanitizeLogData);
  if (typeof data !== "object") return data;

  const out = {};
  for (const [k, v] of Object.entries(data)) {
    const key = _lower(k);
    if (["token", "authorization", "api_key", "apikey", "resemble_api_token", "audio", "buffer", "audiobase64", "audiobuffer", "data"].includes(key)) {
      continue;
    }
    if (key.includes("voiceuuid") || key.includes("projectuuid")) {
      out[k] = _mask(v);
      continue;
    }
    out[k] = _sanitizeLogData(v);
  }
  return out;
}

function _log(event, data) {
  if (!LOG_ENABLED) return;
  try {
    console.log(`[TTS] ${event}`, _sanitizeLogData(data));
  } catch (_) {}
}

function _setCommonAudioHeaders(res, traceId, meta) {
  _setHeader(res, "Cache-Control", "no-store, max-age=0");
  _setHeader(res, "X-SB-Trace-ID", _headerSafe(traceId, 120));
  _setHeader(res, "X-SB-TTS-Version", _headerSafe(TTS_VERSION, 120));
  if (meta && meta.provider) _setHeader(res, "X-SB-TTS-Provider", _headerSafe(meta.provider, 40));
  if (meta && meta.voiceUuid) _setHeader(res, "X-SB-Voice", _mask(meta.voiceUuid));
  if (meta && meta.voiceSource) _setHeader(res, "X-SB-Voice-Source", _headerSafe(meta.voiceSource, 40));
  if (meta && meta.voiceLock) _setHeader(res, "X-SB-Voice-Lock", _headerSafe(meta.voiceLock, 40));
  if (meta && Number.isFinite(meta.elapsedMs)) _setHeader(res, "X-SB-TTS-MS", String(_int(meta.elapsedMs, 0, 0, 300000)));
  if (meta && Number.isFinite(meta.shapeMs)) _setHeader(res, "X-SB-TTS-SHAPE-MS", String(_int(meta.shapeMs, 0, 0, 300000)));
  if (meta && Number.isFinite(meta.segmentCount)) _setHeader(res, "X-SB-TTS-SEGMENTS", String(_int(meta.segmentCount, 0, 0, 999)));
  if (meta && Number.isFinite(meta.providerStatus)) _setHeader(res, "X-SB-TTS-UPSTREAM-STATUS", String(_int(meta.providerStatus, 0, 0, 999)));
  if (meta && meta.failoverKind) _setHeader(res, "X-SB-TTS-FAILOVER", _headerSafe(meta.failoverKind, 48));
  if (meta && meta.reason) _setHeader(res, "X-SB-TTS-REASON", _headerSafe(meta.reason, 80));
  if (meta && meta.requestId) _setHeader(res, "X-SB-Request-ID", _headerSafe(meta.requestId, 80));
  if (meta && meta.turnId) _setHeader(res, "X-SB-Turn-ID", _headerSafe(meta.turnId, 80));
  if (meta && meta.sessionId) _setHeader(res, "X-SB-Session-ID", _headerSafe(meta.sessionId, 80));
  _setHeader(res, "X-SB-Backend-Base", _headerSafe(_getBackendPublicBase(), 160));
  _setHeader(res, "X-SB-TTS-Token-Source", _headerSafe(_getTokenSource() || "", 80));
}

const _circuitOpen = () => _now() < circuitOpenUntil;

function _resolveProviderToken() {
  return _pickFirst(...TOKEN_ENV_KEYS.map((key) => process.env[key]));
}

function _hasProviderToken() {
  return !!_resolveProviderToken();
}

function _isRetryableStatus(status) {
  const n = Number(status || 0) || 0;
  return [408, 409, 425, 429, 500, 502, 503, 504].includes(n);
}

function _normalizeFailureContract(reason, message, status, retryable, input, extra) {
  const terminalStopUntil = retryable ? 0 : (_now() + 15000);
  return {
    ok: false,
    reason: reason || "tts_unavailable",
    message: message || "TTS unavailable.",
    status: Number(status || 503) || 503,
    retryable: !!retryable,
    fallback: {
      kind: "text_only",
      shouldContinueText: true,
      reason: reason || "tts_unavailable"
    },
    provider: "resemble",
    providerStatus: Number(status || 503) || 503,
    voiceUuid: (extra && extra.voiceUuid) || (input && input.voiceUuid) || "",
    traceId: input && input.traceId || "",
    requestId: input && input.requestId || "",
    turnId: input && input.turnId || "",
    sessionId: input && input.sessionId || "",
    ttsFailure: {
      ok: false,
      action: retryable ? "retry" : "downgrade",
      reason: reason || "tts_unavailable",
      retryable: !!retryable,
    fallback: {
      kind: "text_only",
      shouldContinueText: true,
      reason: reason || "tts_unavailable"
    },
      shouldStop: !retryable,
      shouldTerminate: !retryable,
      terminalStopUntil
    },
    audioFailure: {
      ok: false,
      action: retryable ? "retry" : "downgrade",
      reason: reason || "tts_unavailable",
      retryable: !!retryable,
    fallback: {
      kind: "text_only",
      shouldContinueText: true,
      reason: reason || "tts_unavailable"
    },
      shouldStop: !retryable,
      shouldTerminate: !retryable,
      terminalStopUntil
    }
  };
}

function _normalizeRecoveryContract(input) {
  return {
    ok: true,
    action: "clear",
    reason: "tts_recovered",
    retryable: false,
    shouldStop: false,
    shouldTerminate: false,
    terminalStopUntil: 0,
    traceId: input && input.traceId || "",
    requestId: input && input.requestId || "",
    turnId: input && input.turnId || "",
    sessionId: input && input.sessionId || ""
  };
}

function _retryPlan() {
  return {
    maxAttempts: _int(process.env.SB_TTS_MAX_ATTEMPTS || 3, 3, 1, 5),
    baseDelayMs: _int(process.env.SB_TTS_RETRY_BASE_MS || 350, 350, 50, 5000),
    maxDelayMs: _int(process.env.SB_TTS_RETRY_MAX_MS || 1500, 1500, 100, 10000)
  };
}

function _sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function _synthesizeWithRetry(providerInput, snapshot, shapeElapsedMs, segmentCount) {
  const plan = _retryPlan();
  let lastFailure = null;

  for (let attempt = 1; attempt <= plan.maxAttempts; attempt += 1) {
    try {
      _log("provider_attempt", { ...snapshot, attempt, maxAttempts: plan.maxAttempts, timeoutMs: PROVIDER_TIMEOUT_MS });
      const out = await _withTimeout(synthesize(providerInput), PROVIDER_TIMEOUT_MS, { ...snapshot, attempt });
      const normalizedOut = _normalizeProviderAudio(out);
      const retryable = normalizedOut.retryable !== false && _isRetryableStatus(normalizedOut.providerStatus);

      if (normalizedOut.ok) return { ok: true, out: normalizedOut, attempt };

      lastFailure = {
        ok: false,
        attempt,
        reason: normalizedOut.reason || "provider_failed",
        message: normalizedOut.message || "TTS failed",
        status: normalizedOut.providerStatus || 503,
        retryable,
        providerStatus: normalizedOut.providerStatus || 503,
        providerEndpoint: normalizedOut.providerEndpoint || "",
        authMode: normalizedOut.authMode || "",
        voiceUuid: normalizedOut.voiceUuid || providerInput.voiceUuid,
        shapeElapsedMs,
        segmentCount
      };

      if (!retryable || attempt >= plan.maxAttempts) return lastFailure;
      const delayMs = Math.min(plan.maxDelayMs, plan.baseDelayMs * Math.pow(2, attempt - 1));
      _log("provider_retry_wait", { ...snapshot, attempt, delayMs, reason: lastFailure.reason, providerStatus: lastFailure.providerStatus });
      await _sleep(delayMs);
    } catch (err) {
      const status = _int(err && err.status, 503, 400, 599);
      const retryable = typeof (err && err.retryable) === "boolean" ? !!err.retryable : _isRetryableStatus(status);
      const reason = err && err.code === "TTS_PROVIDER_TIMEOUT" ? "provider_timeout" : "exception";
      lastFailure = {
        ok: false,
        attempt,
        reason,
        message: _trim(err && (err.message || err)) || "tts_exception",
        status,
        retryable,
        providerStatus: status,
        providerEndpoint: "",
        authMode: "",
        voiceUuid: providerInput.voiceUuid,
        shapeElapsedMs,
        segmentCount
      };
      if (!retryable || attempt >= plan.maxAttempts) return lastFailure;
      const delayMs = Math.min(plan.maxDelayMs, plan.baseDelayMs * Math.pow(2, attempt - 1));
      _log("provider_retry_wait", { ...snapshot, attempt, delayMs, reason, providerStatus: status });
      await _sleep(delayMs);
    }
  }

  return lastFailure || { ok: false, reason: "provider_failed", message: "TTS failed", status: 503, retryable: true, providerStatus: 503, voiceUuid: providerInput.voiceUuid, shapeElapsedMs, segmentCount };
}

function _recordFailure(message, status, meta) {
  failCount += 1;
  lastError = _trim(message) || "tts_failed";
  lastFailAt = _now();
  lastProviderStatus = Number(status || 0) || 0;
  _log("failure_recorded", {
    failCount, status: lastProviderStatus, message: lastError,
    traceId: meta && meta.traceId, requestId: meta && meta.requestId, turnId: meta && meta.turnId, sessionId: meta && meta.sessionId
  });
  if (failCount >= CIRCUIT_LIMIT) {
    circuitOpenUntil = _now() + CIRCUIT_RESET_MS;
    try {
      console.warn("[TTS] Circuit breaker OPEN", { failCount, resetInMs: CIRCUIT_RESET_MS, traceId: meta && meta.traceId });
    } catch (_) {}
  }
}

function _recordSuccess(status, elapsedMs, meta) {
  failCount = 0;
  circuitOpenUntil = 0;
  lastError = "";
  lastOkAt = _now();
  lastProviderStatus = Number(status || 200) || 200;
  lastElapsedMs = Number(elapsedMs || 0) || 0;
  _log("success_recorded", {
    status: lastProviderStatus, elapsedMs: lastElapsedMs,
    traceId: meta && meta.traceId, requestId: meta && meta.requestId, turnId: meta && meta.turnId, sessionId: meta && meta.sessionId
  });
}

function _looksLikeUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(_trim(value));
}

function _voiceIntegrityConfig() {
  const candidates = VOICE_LOCK_ENV_KEYS
    .map((key) => ({ key, value: _trim(process.env[key]) }))
    .filter((item) => item.value);

  const validCandidates = candidates.filter((item) => _looksLikeVoiceIdentifier(item.value));
  const uniqueValues = [...new Set(validCandidates.map((item) => item.value))];
  const authoritative = uniqueValues[0] || "";
  const conflictingKeys = uniqueValues.length > 1
    ? candidates.filter((item) => item.value && item.value !== authoritative).map((item) => item.key)
    : [];

  return {
    voiceUuid: authoritative,
    voiceName: _pickFirst(...VOICE_NAME_ENV_KEYS.map((key) => process.env[key])),
    configuredKeys: candidates.map((item) => item.key),
    conflictingKeys,
    configured: !!authoritative,
    valid: !!authoritative && conflictingKeys.length === 0 && _looksLikeVoiceIdentifier(authoritative),
    strict: STRICT_VOICE_LOCK
  };
}

function _resolvePreferredVoice(inputVoice) {
  const requested = _trim(inputVoice);
  const integrity = _voiceIntegrityConfig();
  const locked = integrity.voiceUuid;

  if (!locked) return requested;

  if (requested && requested !== locked) {
    _log("voice_override_blocked", {
      requestedVoiceUuid: _mask(requested),
      lockedVoiceUuid: _mask(locked),
      configuredKeys: integrity.configuredKeys,
      conflictingKeys: integrity.conflictingKeys
    });
  }

  return locked;
}

function _resolvePreferredVoiceName(inputName) {
  const lockedName = _trim(_voiceIntegrityConfig().voiceName);
  return lockedName || _trim(inputName);
}

function _useProjectUuidByDefault() {
  return _bool(_pickFirst(process.env.RESEMBLE_USE_PROJECT_UUID, process.env.SB_RESEMBLE_USE_PROJECT_UUID), false);
}

function _resolveProjectUuid(explicitValue) {
  const explicit = _trim(explicitValue);
  if (explicit) return explicit;
  if (_useProjectUuidByDefault()) {
    return _pickFirst(process.env.RESEMBLE_PROJECT_UUID, process.env.SB_RESEMBLE_PROJECT_UUID);
  }
  return "";
}

function _healthSnapshot() {
  const integrity = _voiceIntegrityConfig();
  const voiceUuid = integrity.voiceUuid;
  const voiceName = _resolvePreferredVoiceName("");
  const projectUuid = _resolveProjectUuid("");
  const token = _resolveProviderToken();
  const configured = !!(token && voiceUuid);
  const ready = configured && integrity.valid && !_circuitOpen() && activeRequests < MAX_CONCURRENT;
  return {
    ok: ready,
    configured,
    provider: "resemble",
    phases: PHASES,
    version: TTS_VERSION,
    activeRequests,
    failCount,
    circuitOpen: _circuitOpen(),
    circuitResetAt: circuitOpenUntil,
    lastError,
    lastOkAt,
    lastFailAt,
    lastProviderStatus,
    lastElapsedMs,
    env: {
      hasToken: !!token,
      hasProject: !!projectUuid,
      hasVoice: !!voiceUuid,
      useProjectUuidByDefault: _useProjectUuidByDefault(),
      voiceUuidPreview: voiceUuid ? _mask(voiceUuid) : "",
      voiceName: voiceName || "",
      projectUuidPreview: projectUuid ? _mask(projectUuid) : "",
      providerTimeoutMs: PROVIDER_TIMEOUT_MS,
      strictVoiceLock: STRICT_VOICE_LOCK,
      backendPublicBaseUrl: _getBackendPublicBase(),
      tokenSource: _getTokenSource() || "",
      tokenEnvKeysDetected: TOKEN_ENV_KEYS.filter((key) => !!_trim(process.env[key]))
    },
    voiceIntegrity: {
      configured: integrity.configured,
      valid: integrity.valid,
      configuredKeys: integrity.configuredKeys,
      conflictingKeys: integrity.conflictingKeys,
      lockedVoiceUuid: voiceUuid ? _mask(voiceUuid) : "",
      lockedVoiceName: voiceName || ""
    }
  };
}

function _mergePronunciationMap(extra) {
  const merged = Object.assign({}, DEFAULT_PRONUNCIATION_MAP);
  if (extra && typeof extra === "object") {
    Object.keys(extra).forEach((k) => {
      const key = _trim(k);
      const val = _trim(extra[k]);
      if (key && val) merged[key] = val;
    });
  }
  return merged;
}

function _parseSpeechHints(body) {
  const inputHints = body && typeof body.speechHints === "object" ? body.speechHints : {};
  const inputPauses = inputHints && typeof inputHints.pauses === "object" ? inputHints.pauses : {};
  const inputPacing = inputHints && typeof inputHints.pacing === "object" ? inputHints.pacing : {};
  return {
    pauses: {
      commaMs: Number(inputPauses.commaMs || body.commaMs || DEFAULT_SPEECH_HINTS.pauses.commaMs) || DEFAULT_SPEECH_HINTS.pauses.commaMs,
      periodMs: Number(inputPauses.periodMs || body.periodMs || DEFAULT_SPEECH_HINTS.pauses.periodMs) || DEFAULT_SPEECH_HINTS.pauses.periodMs,
      questionMs: Number(inputPauses.questionMs || body.questionMs || DEFAULT_SPEECH_HINTS.pauses.questionMs) || DEFAULT_SPEECH_HINTS.pauses.questionMs,
      exclaimMs: Number(inputPauses.exclaimMs || body.exclaimMs || DEFAULT_SPEECH_HINTS.pauses.exclaimMs) || DEFAULT_SPEECH_HINTS.pauses.exclaimMs,
      colonMs: Number(inputPauses.colonMs || body.colonMs || DEFAULT_SPEECH_HINTS.pauses.colonMs) || DEFAULT_SPEECH_HINTS.pauses.colonMs,
      semicolonMs: Number(inputPauses.semicolonMs || body.semicolonMs || DEFAULT_SPEECH_HINTS.pauses.semicolonMs) || DEFAULT_SPEECH_HINTS.pauses.semicolonMs,
      ellipsisMs: Number(inputPauses.ellipsisMs || body.ellipsisMs || DEFAULT_SPEECH_HINTS.pauses.ellipsisMs) || DEFAULT_SPEECH_HINTS.pauses.ellipsisMs
    },
    pacing: {
      mode: _pickFirst(inputPacing.mode, body.pacingMode, DEFAULT_SPEECH_HINTS.pacing.mode),
      preservePunctuation: _bool(inputPacing.preservePunctuation, _bool(body.preservePunctuation, DEFAULT_SPEECH_HINTS.pacing.preservePunctuation)),
      sentenceBreath: _bool(inputPacing.sentenceBreath, _bool(body.sentenceBreath, DEFAULT_SPEECH_HINTS.pacing.sentenceBreath)),
      noRunOns: _bool(inputPacing.noRunOns, _bool(body.noRunOns, DEFAULT_SPEECH_HINTS.pacing.noRunOns))
    }
  };
}

function _normalizeWhitespace(text) {
  return _str(text)
    .replace(/\r\n?/g, "\n")
    .replace(/\u00A0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/([,.;:!?])(\S)/g, "$1 $2")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/\. {0,}\.{0,}\.{4,}/g, "...")
    .replace(/\.\.\.+/g, "...")
    .trim();
}

function _expandContractions(text) {
  let out = _str(text);
  const replacements = [
    [/\bI'm\b/gi, "I am"], [/\bI've\b/gi, "I have"], [/\bI'll\b/gi, "I will"], [/\bI'd\b/gi, "I would"],
    [/\bYou're\b/gi, "You are"], [/\bYou've\b/gi, "You have"], [/\bYou'll\b/gi, "You will"], [/\bYou'd\b/gi, "You would"],
    [/\bWe're\b/gi, "We are"], [/\bWe've\b/gi, "We have"], [/\bWe'll\b/gi, "We will"], [/\bWe'd\b/gi, "We would"],
    [/\bThey're\b/gi, "They are"], [/\bThey've\b/gi, "They have"], [/\bThey'll\b/gi, "They will"], [/\bThey'd\b/gi, "They would"],
    [/\bIt's\b/gi, "It is"], [/\bThat’s\b/gi, "That is"], [/\bThat's\b/gi, "That is"], [/\bThere's\b/gi, "There is"],
    [/\bHere’s\b/gi, "Here is"], [/\bHere's\b/gi, "Here is"], [/\bWhat's\b/gi, "What is"], [/\bWho’s\b/gi, "Who is"],
    [/\bWho's\b/gi, "Who is"], [/\bWhere’s\b/gi, "Where is"], [/\bWhere's\b/gi, "Where is"], [/\bWhen’s\b/gi, "When is"],
    [/\bWhen's\b/gi, "When is"], [/\bWhy’s\b/gi, "Why is"], [/\bWhy's\b/gi, "Why is"], [/\bHow’s\b/gi, "How is"],
    [/\bHow's\b/gi, "How is"], [/\bCannot\b/gi, "Cannot"], [/\bcan't\b/gi, "cannot"], [/\bwon't\b/gi, "will not"],
    [/\bdon't\b/gi, "do not"], [/\bdoesn't\b/gi, "does not"], [/\bdidn't\b/gi, "did not"], [/\bisn't\b/gi, "is not"],
    [/\baren't\b/gi, "are not"], [/\bwasn't\b/gi, "was not"], [/\bweren't\b/gi, "were not"], [/\bhaven't\b/gi, "have not"],
    [/\bhasn't\b/gi, "has not"], [/\bhadn't\b/gi, "had not"], [/\bwouldn't\b/gi, "would not"], [/\bshouldn't\b/gi, "should not"],
    [/\bcouldn't\b/gi, "could not"], [/\bmustn't\b/gi, "must not"], [/\bneedn't\b/gi, "need not"], [/\blet's\b/gi, "let us"],
    [/\bit'd\b/gi, "it would"], [/\bit'll\b/gi, "it will"], [/\bthey're\b/gi, "they are"], [/\bwe're\b/gi, "we are"],
    [/\byou're\b/gi, "you are"]
  ];
  replacements.forEach(([pattern, replacement]) => {
    out = out.replace(pattern, replacement);
  });
  return out;
}

function _applyPronunciationMap(text, pronunciationMap) {
  let out = _str(text);
  const keys = Object.keys(pronunciationMap || {}).sort((a, b) => b.length - a.length);
  for (const key of keys) {
    const replacement = _trim(pronunciationMap[key]);
    if (!key || !replacement) continue;
    const safeKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    out = out.replace(new RegExp(`\\b${safeKey}\\b`, "g"), replacement);
  }
  return out;
}

function _applySpeakOptimizations(text) {
  let out = _str(text);
  out = out
    .replace(/\bI will help\b/gi, "I can help")
    .replace(/\bI will guide you\b/gi, "I can guide you")
    .replace(/\bI will walk you through\b/gi, "I can walk you through");
  return out;
}

const _collapseJoiners = (text) => _str(text)
  .replace(/\s+,/g, ",")
  .replace(/\s+;/g, ";")
  .replace(/\s+:/g, ":")
  .replace(/\s+\./g, ".")
  .replace(/\s+\?/g, "?")
  .replace(/\s+!/g, "!");

function _repairRunOns(text) {
  let out = _str(text);
  out = out
    .replace(/,\s+(however|meanwhile|instead|nevertheless|nonetheless)\b/gi, ". $1")
    .replace(/\b(also|right|you know)\b\s*,\s*\b(also|right|you know)\b/gi, "$1")
    .replace(/\s{2,}/g, " ");
  return out;
}

function _splitLongSentence(sentence) {
  const s = _trim(sentence);
  if (!s) return [];
  const wordCount = s.split(/\s+/).filter(Boolean).length;
  if (wordCount <= 22) return [s];
  const match = /,\s+(because|while|which|that)\s+/i.exec(s);
  if (!match || typeof match.index !== "number") return [s];
  const left = _trim(s.slice(0, match.index));
  const right = _trim(s.slice(match.index + 2));
  if (!left || !right) return [s];
  return [left.replace(/[,:;]+$/g, "") + ".", right];
}

function _segmentSentences(text, speechHints) {
  const normalized = _collapseJoiners(_repairRunOns(_normalizeWhitespace(text)));
  const rough = normalized
    .replace(/([.!?])\s+(?=[A-Z"'])/g, "$1\n")
    .replace(/([:;])\s+(?=[A-Z"'])/g, "$1\n")
    .split(/\n+/)
    .map(_trim)
    .filter(Boolean);

  const segments = [];
  for (const item of rough) {
    if (speechHints && speechHints.pacing && speechHints.pacing.noRunOns) {
      const split = _splitLongSentence(item);
      split.forEach((part) => {
        if (_trim(part)) segments.push(_trim(part));
      });
    } else {
      segments.push(item);
    }
  }
  return segments;
}

function _pauseToken(ms) {
  const n = Math.max(0, Math.min(1500, Number(ms || 0) || 0));
  return n ? `<break time="${n}ms"/>` : "";
}

function _decorateSegment(segment, pauses) {
  let s = _trim(segment);
  if (!s) return "";
  s = s
    .replace(/,\s+and\s+I will\b/gi, ", and I will")
    .replace(/,\s+and\s+I can\b/gi, ", and I can")
    .replace(/,\s+and\s+we can\b/gi, ", and we can")
    .replace(/,\s+but\s+I\b/gi, ", but I")
    .replace(/,\s+or\s+I\b/gi, ", or I");

  s = s
    .replace(/\.\.\./g, `... ${_pauseToken(pauses.ellipsisMs)}`)
    .replace(/,\s*/g, `, ${_pauseToken(pauses.commaMs)}`)
    .replace(/;\s*/g, `; ${_pauseToken(pauses.semicolonMs)}`)
    .replace(/:\s*/g, `: ${_pauseToken(pauses.colonMs)}`)
    .replace(/\.\s*$/g, `. ${_pauseToken(pauses.periodMs)}`)
    .replace(/\?\s*$/g, `? ${_pauseToken(pauses.questionMs)}`)
    .replace(/!\s*$/g, `! ${_pauseToken(pauses.exclaimMs)}`);
  return s.trim();
}

const _stripMarkup = (text) => _str(text)
  .replace(/<break\s+time="\d+ms"\s*\/>/g, " ")
  .replace(/<\/?speak>/g, " ")
  .replace(/\s+/g, " ")
  .trim();

function _shapeSpeechText(rawText, options) {
  const startedAt = _now();
  const speechHints = options && options.speechHints ? options.speechHints : DEFAULT_SPEECH_HINTS;
  const pronunciationMap = _mergePronunciationMap(options && options.pronunciationMap);

  const displayText = _normalizeWhitespace(rawText);
  const expandedText = _expandContractions(displayText);
  const speakBase = _applySpeakOptimizations(expandedText);
  const pronouncedText = _applyPronunciationMap(speakBase, pronunciationMap);
  const segments = _segmentSentences(pronouncedText, speechHints);
  const ssmlSegments = segments.map((segment) => _decorateSegment(segment, speechHints.pauses)).filter(Boolean);
  const joinPause = _pauseToken(Math.max(120, Math.floor((speechHints.pauses.periodMs || 320) * 0.65)));
  const ssmlText = ssmlSegments.length
    ? `<speak>${ssmlSegments.join(joinPause)}</speak>`
    : `<speak>${_decorateSegment(pronouncedText, speechHints.pauses)}</speak>`;

  return {
    rawText: _str(rawText),
    displayText,
    textSpeak: pronouncedText,
    text: pronouncedText,
    ssmlText,
    plainText: _stripMarkup(ssmlText),
    segments,
    segmentCount: segments.length,
    shapeElapsedMs: _now() - startedAt,
    speechHints,
    pronunciationMap
  };
}

function _coerceBuffer(value) {
  if (!value) return null;
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof Uint8Array) return Buffer.from(value);
  if (Array.isArray(value)) {
    try { return Buffer.from(value); } catch (_) { return null; }
  }
  if (typeof value === "string") {
    const s = value.trim();
    if (!s) return null;
    if (/^data:audio\//i.test(s)) {
      const idx = s.indexOf(",");
      if (idx > -1) {
        try { return Buffer.from(s.slice(idx + 1), "base64"); } catch (_) { return null; }
      }
    }
    const b64ish = /^[A-Za-z0-9+/=\r\n]+$/.test(s) && (s.length % 4 === 0 || s.includes("="));
    if (b64ish) {
      try {
        const out = Buffer.from(s.replace(/\s+/g, ""), "base64");
        if (out && out.length) return out;
      } catch (_) {}
    }
    try { return Buffer.from(s, "binary"); } catch (_) { return null; }
  }
  if (typeof value === "object") {
    if (value.type === "Buffer" && Array.isArray(value.data)) {
      try { return Buffer.from(value.data); } catch (_) { return null; }
    }
    return _coerceBuffer(value.buffer || value.audio || value.audioBuffer || value.audioBase64 || value.base64 || value.data);
  }
  return null;
}

async function _withTimeout(promise, ms, meta) {
  let timer = null;
  const timeoutMs = _int(ms, PROVIDER_TIMEOUT_MS, 1000, 120000);
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          const err = new Error(`provider_timeout_${timeoutMs}ms`);
          err.code = "TTS_PROVIDER_TIMEOUT";
          err.status = 504;
          err.retryable = true;
          err.meta = meta || {};
          reject(err);
        }, timeoutMs);
      })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function _normalizeProviderAudio(out) {
  const payload = out && typeof out === "object"
    ? (out.payload && typeof out.payload === "object" ? out.payload : {})
    : {};
  const nestedAudio = _pickFirst(
    payload.audioBase64,
    payload.audio_base64,
    payload.audio,
    payload.base64,
    payload.data,
    out && out.audioBase64,
    out && out.audio_base64,
    out && out.audio,
    out && out.audioBuffer,
    out && out.base64,
    out && out.data
  );
  const buffer = _coerceBuffer(
    out && (
      out.buffer ||
      out.binary ||
      out.audioBuffer ||
      nestedAudio ||
      (out.response && (out.response.audio || out.response.audioBase64 || out.response.base64 || out.response.data))
    )
  );
  const providerStatus = Number(out && (out.providerStatus || out.status || payload.status || 200)) || 200;
  const explicitOk = out && typeof out.ok === "boolean" ? out.ok : (payload && typeof payload.ok === "boolean" ? payload.ok : null);
  const inferredOk = !!(buffer && buffer.length && providerStatus >= 200 && providerStatus < 300);
  return {
    ok: explicitOk == null ? inferredOk : !!(explicitOk && buffer && buffer.length),
    buffer,
    mimeType: _pickFirst(
      out && out.mimeType,
      out && out.contentType,
      out && out.content_type,
      payload.mimeType,
      payload.contentType,
      payload.content_type,
      "audio/mpeg"
    ),
    elapsedMs: _int(out && (out.elapsedMs || out.durationMs || payload.elapsedMs || payload.durationMs || 0), 0, 0, 300000),
    requestId: _pickFirst(out && out.requestId, out && out.id, payload.requestId, payload.id),
    providerStatus,
    message: _pickFirst(out && out.message, out && out.reason, out && out.error, payload.message, payload.reason, payload.error),
    reason: _pickFirst(out && out.reason, out && out.error, out && out.message, payload.reason, payload.error, payload.message),
    retryable: out && typeof out.retryable === "boolean" ? out.retryable : (payload && typeof payload.retryable === "boolean" ? payload.retryable : true),
    authMode: _pickFirst(out && out.authMode, payload.authMode),
    providerEndpoint: _pickFirst(out && out.providerEndpoint, payload.providerEndpoint),
    voiceUuid: _pickFirst(out && out.voiceUuid, payload.voiceUuid)
  };
}

function _buildProviderVariants(providerInput) {
  const variants = [];
  const baseText = _trim(providerInput && providerInput.text);
  const textSpeak = _trim(providerInput && providerInput.textSpeak);
  const plainText = _trim(providerInput && providerInput.plainText);
  const ssmlText = _trim(providerInput && providerInput.ssmlText);
  const outputFormat = _lower(_pickFirst(providerInput && providerInput.outputFormat, "mp3")) === "wav" ? "wav" : "mp3";

  const pushVariant = (kind, text, format, extra) => {
    const normalizedText = _trim(text);
    if (!normalizedText) return;
    const candidate = {
      ...providerInput,
      text: normalizedText,
      outputFormat: format || outputFormat,
      failoverKind: kind,
      useSsml: kind === "ssml",
      ...(extra || {})
    };
    const sig = [candidate.failoverKind, candidate.outputFormat, candidate.text].join("|");
    if (!variants.some((v) => [v.failoverKind, v.outputFormat, v.text].join("|") === sig)) {
      variants.push(candidate);
    }
  };

  pushVariant("speak_text", textSpeak || baseText, outputFormat);
  pushVariant("plain_text", plainText || baseText || textSpeak, outputFormat, { useSsml: false });
  if (ssmlText) pushVariant("ssml", ssmlText, outputFormat, { useSsml: true });
  if (outputFormat !== "wav") pushVariant("plain_text_wav", plainText || baseText || textSpeak, "wav", { useSsml: false });

  return variants.slice(0, FAILOVER_MAX_VARIANTS);
}

async function _synthesizeWithFailover(providerInput, snapshot, shapeElapsedMs, segmentCount) {
  const variants = _buildProviderVariants(providerInput);
  let lastFailure = null;

  for (let idx = 0; idx < variants.length; idx += 1) {
    const variant = variants[idx];
    const attemptSnapshot = {
      ...snapshot,
      failoverIndex: idx + 1,
      failoverTotal: variants.length,
      failoverKind: variant.failoverKind || "primary",
      outputFormat: variant.outputFormat || providerInput.outputFormat || "mp3"
    };

    _log("provider_failover_variant", attemptSnapshot);

    const result = await _synthesizeWithRetry(variant, attemptSnapshot, shapeElapsedMs, segmentCount);
    if (result && result.ok) {
      return {
        ok: true,
        out: {
          ...result.out,
          failoverKind: variant.failoverKind || "primary",
          outputFormat: variant.outputFormat || providerInput.outputFormat || "mp3"
        },
        attempt: result.attempt,
        failoverIndex: idx + 1,
        failoverTotal: variants.length
      };
    }

    lastFailure = {
      ...(result || {}),
      failoverKind: variant.failoverKind || "primary",
      outputFormat: variant.outputFormat || providerInput.outputFormat || "mp3"
    };

    if (lastFailure && lastFailure.retryable === false) break;
  }

  return lastFailure || { ok: false, reason: "provider_failed", message: "TTS failed", status: 503, retryable: true, providerStatus: 503, voiceUuid: providerInput.voiceUuid, shapeElapsedMs, segmentCount };
}

function _verifyAudioResult(result, input) {
  const buffer = _coerceBuffer(result && result.buffer);
  const mimeType = _pickFirst(result && result.mimeType, result && result.mime, "audio/mpeg");
  const bytes = buffer && buffer.length ? buffer.length : 0;
  const looksAudio = /^audio\//i.test(mimeType);
  const hasPlayableBuffer = !!(buffer && bytes > 0);
  const ok = !!(hasPlayableBuffer && looksAudio);
  return {
    ok,
    buffer: hasPlayableBuffer ? buffer : null,
    mimeType,
    bytes,
    looksAudio,
    verification: ok ? "audio-buffer-ready" : (hasPlayableBuffer ? "mime-mismatch" : "empty-audio-buffer"),
    failure: ok ? null : _normalizeFailureContract(
      hasPlayableBuffer ? "invalid_audio_mime" : "no_audio_buffer",
      hasPlayableBuffer ? `Provider returned non-audio mime: ${mimeType || "unknown"}` : "Provider returned no playable audio buffer.",
      502,
      true,
      input,
      { voiceUuid: (result && result.voiceUuid) || (input && input.voiceUuid) || "" }
    )
  };
}


function _normalizeRouteSuccessAudio(result) {
  const src = result && typeof result === "object" ? result : {};
  const payload = src.payload && typeof src.payload === "object" ? src.payload : {};
  const buffer = _coerceBuffer(
    src.buffer ||
    src.audio ||
    src.binary ||
    src.audioBuffer ||
    src.audioBase64 ||
    src.base64 ||
    payload.buffer ||
    payload.audio ||
    payload.binary ||
    payload.audioBuffer ||
    payload.audioBase64 ||
    payload.base64
  );
  const mimeType = _pickFirst(
    src.mimeType,
    src.mime,
    src.contentType,
    src.content_type,
    payload.mimeType,
    payload.mime,
    payload.contentType,
    payload.content_type,
    /^RIFF/.test(buffer ? buffer.slice(0, 4).toString("ascii") : "") ? "audio/wav" : "audio/mpeg"
  );
  const bytes = buffer && buffer.length ? buffer.length : 0;
  return {
    ok: !!(buffer && bytes > 0),
    buffer: buffer || null,
    bytes,
    mimeType,
    verification: buffer && bytes > 0 ? "audio-buffer-ready" : "no_audio_buffer"
  };
}

function _frontendErrorEnvelope(input, result, status, extra) {
  const reason = _pickFirst(extra && extra.error, result && result.reason, result && result.error, "tts_unavailable");
  const detail = _pickFirst(extra && extra.detail, result && result.message, result && result.detail, "TTS unavailable.");
  return {
    ok: false,
    spokenUnavailable: true,
    error: reason,
    detail,
    retryable: !!(result && result.retryable),
    traceId: input.traceId,
    provider: _pickFirst(result && result.provider, "resemble"),
    providerStatus: Number((result && (result.providerStatus || result.status)) || status || 503) || 503,
    providerEndpoint: _pickFirst(result && result.providerEndpoint),
    authMode: _pickFirst(result && result.authMode),
    voiceUuid: _pickFirst(result && result.voiceUuid, input.voiceUuid),
    textDisplay: _pickFirst(result && result.textDisplay, input.textDisplay, input.text),
    textSpeak: _pickFirst(result && result.textSpeak, input.text),
    shapeElapsedMs: Number((result && result.shapeElapsedMs) || 0) || 0,
    segmentCount: Number((result && result.segmentCount) || 0) || 0,
    requestId: _pickFirst(result && result.requestId, input.requestId),
    turnId: _pickFirst(result && result.turnId, input.turnId),
    sessionId: _pickFirst(result && result.sessionId, input.sessionId),
    health: _healthSnapshot(),
    backendPublicBaseUrl: _getBackendPublicBase(),
    fallback: {
      kind: "text_only",
      shouldContinueText: true,
      reason
    },
    ttsFailure: (result && result.ttsFailure) || _normalizeFailureContract(reason, detail, status, !!(result && result.retryable), input).ttsFailure,
    audioFailure: (result && result.audioFailure) || _normalizeFailureContract(reason, detail, status, !!(result && result.retryable), input).audioFailure,
    payload: { spokenUnavailable: true }
  };
}

async function generate(text, options) {
  const opts = options && typeof options === "object" ? options : {};
  const input = _normalizePayloadLikeInput({ text, ...opts }, { headers: { "x-sb-trace-id": opts.traceId || _makeTrace() } });
  const snapshot = _buildInputSnapshot(input);
  const startedAt = _now();

  _log("generate_start", { ...snapshot, activeRequests, circuitOpen: _circuitOpen(), failCount, tokenConfigured: _hasProviderToken(), tokenSource: _getTokenSource() || "", backendPublicBaseUrl: _getBackendPublicBase() || "" });

  if (!input.text) return _normalizeFailureContract("empty_text", "No TTS text was provided.", 400, false, input);
  if (!_hasProviderToken()) {
    _log("generate_reject_missing_token", snapshot);
    return _normalizeFailureContract("missing_token", `No provider token is configured. Checked: RESEMBLE_API_TOKEN, RESEMBLE_API_KEY, SB_RESEMBLE_API_TOKEN, SB_RESEMBLE_API_KEY, SB_TTS_TOKEN, TTS_TOKEN, SANDBLAST_TTS_TOKEN, RESEMBLE_TOKEN.`, 503, false, input, { tokenSource: _getTokenSource() || "" });
  }
  const voiceContract = _voiceContract(input);
  if (!voiceContract.ok) {
    _log("generate_reject_voice_contract", { ...snapshot, voiceProblems: voiceContract.problems, voiceSource: voiceContract.source });
    return _normalizeFailureContract("voice_contract_failed", `Voice lock rejected request: ${voiceContract.problems.join(", ") || "unknown_voice_issue"}`, 503, false, input, { voiceUuid: input.voiceUuid });
  }
  if (!input.voiceUuid) {
    _log("generate_reject_missing_voice", snapshot);
    return _normalizeFailureContract("missing_voice", "No Mixer or provider voice is configured.", 503, false, input);
  }
  if (activeRequests >= MAX_CONCURRENT) {
    _log("generate_reject_concurrency_limit", { ...snapshot, activeRequests, maxConcurrent: MAX_CONCURRENT });
    return _normalizeFailureContract("concurrency_limit", "TTS is busy right now.", 429, true, input);
  }
  if (_circuitOpen()) {
    _log("generate_reject_circuit_open", { ...snapshot, circuitOpenUntil });
    return _normalizeFailureContract("circuit_open", "TTS is temporarily cooling down.", 503, true, input);
  }

  const shaped = _shapeSpeechText(input.text, { speechHints: input.speechHints, pronunciationMap: input.pronunciationMap });

  const providerInput = {
    ...input,
    text: shaped.text,
    textDisplay: input.textDisplay || shaped.displayText,
    textSpeak: shaped.textSpeak,
    plainText: shaped.plainText,
    ssmlText: shaped.ssmlText,
    speechChunks: input.speechChunks && input.speechChunks.length ? input.speechChunks : shaped.segments,
    speechHints: shaped.speechHints,
    pronunciationMap: shaped.pronunciationMap,
    segmentCount: shaped.segmentCount,
    shapeElapsedMs: shaped.shapeElapsedMs
  };

  _log("generate_shaped", {
    ...snapshot,
    shapeElapsedMs: shaped.shapeElapsedMs,
    segmentCount: shaped.segmentCount,
    speakHash: _hash(providerInput.textSpeak || ""),
    speakPreview: _preview(providerInput.textSpeak || "")
  });

  activeRequests += 1;
  try {
    _log("provider_request", { ...snapshot, activeRequests, provider: "resemble", shapeElapsedMs: shaped.shapeElapsedMs, segmentCount: shaped.segmentCount, timeoutMs: PROVIDER_TIMEOUT_MS });
    const providerResult = await _synthesizeWithFailover(providerInput, snapshot, shaped.shapeElapsedMs, shaped.segmentCount);

    if (!providerResult.ok) {
      _recordFailure(providerResult.message || providerResult.reason || "provider_failed", providerResult.providerStatus || providerResult.status || 503, snapshot);
      return {
        ..._normalizeFailureContract(providerResult.reason || "provider_failed", providerResult.message || "TTS failed", providerResult.status || providerResult.providerStatus || 503, !!providerResult.retryable, input, { voiceUuid: providerResult.voiceUuid || input.voiceUuid }),
        providerEndpoint: providerResult.providerEndpoint || "",
        authMode: providerResult.authMode || "",
        failoverKind: providerResult.failoverKind || "primary",
        shapeElapsedMs: shaped.shapeElapsedMs,
        segmentCount: shaped.segmentCount,
        textDisplay: providerInput.textDisplay,
        textSpeak: providerInput.textSpeak
      };
    }

    const normalizedOut = providerResult.out;
    _log("provider_response", {
      ...snapshot,
      ok: !!normalizedOut.ok,
      providerStatus: normalizedOut.providerStatus || 0,
      reason: normalizedOut.reason || "",
      authMode: normalizedOut.authMode || "",
      providerEndpoint: normalizedOut.providerEndpoint || "",
      bytes: normalizedOut.buffer ? normalizedOut.buffer.length : 0,
      elapsedMs: normalizedOut.elapsedMs || 0,
      attempt: providerResult.attempt || 1,
      failoverIndex: providerResult.failoverIndex || 1,
      failoverTotal: providerResult.failoverTotal || 1,
      failoverKind: normalizedOut.failoverKind || "primary"
    });

    const audioVerified = _verifyAudioResult({ buffer: normalizedOut.buffer, mimeType: normalizedOut.mimeType, voiceUuid: normalizedOut.voiceUuid || input.voiceUuid }, input);
    if (!audioVerified.ok) {
      _log("provider_no_audio_trap", {
        ...snapshot,
        verification: audioVerified.verification,
        mimeType: audioVerified.mimeType,
        bytes: audioVerified.bytes,
        providerStatus: normalizedOut.providerStatus || 0
      });
      _recordFailure(audioVerified.failure.message || audioVerified.failure.reason || "no_audio_buffer", 502, snapshot);
      return {
        ...audioVerified.failure,
        providerEndpoint: normalizedOut.providerEndpoint || "",
        authMode: normalizedOut.authMode || "",
        failoverKind: normalizedOut.failoverKind || "primary",
        shapeElapsedMs: shaped.shapeElapsedMs,
        segmentCount: shaped.segmentCount,
        textDisplay: providerInput.textDisplay,
        textSpeak: providerInput.textSpeak,
        mimeType: audioVerified.mimeType,
        audioVerification: audioVerified.verification,
        bytes: audioVerified.bytes
      };
    }

    _recordSuccess(normalizedOut.providerStatus, normalizedOut.elapsedMs, snapshot);
    return {
      ok: true,
      provider: "resemble",
      buffer: audioVerified.buffer,
      mimeType: audioVerified.mimeType || "audio/mpeg",
      elapsedMs: normalizedOut.elapsedMs || 0,
      bytes: audioVerified.bytes,
      audioVerification: audioVerified.verification,
      requestId: normalizedOut.requestId || input.requestId,
      providerStatus: normalizedOut.providerStatus || 200,
      providerEndpoint: normalizedOut.providerEndpoint || "",
      authMode: normalizedOut.authMode || "",
      failoverKind: normalizedOut.failoverKind || "primary",
      shapeElapsedMs: shaped.shapeElapsedMs,
      segmentCount: shaped.segmentCount,
      textDisplay: providerInput.textDisplay,
      textSpeak: providerInput.textSpeak,
      ssmlText: providerInput.ssmlText,
      speechChunks: providerInput.speechChunks,
      voiceUuid: normalizedOut.voiceUuid || input.voiceUuid,
      traceId: input.traceId,
      turnId: input.turnId,
      sessionId: input.sessionId,
      ttsFailure: _normalizeRecoveryContract(input),
      audioFailure: _normalizeRecoveryContract(input)
    };
  } catch (err) {
    const msg = _trim(err && (err.message || err)) || "tts_exception";
    const status = _int(err && err.status, 503, 400, 599);
    const retryable = typeof (err && err.retryable) === "boolean" ? !!err.retryable : _isRetryableStatus(status);
    const reason = err && err.code === "TTS_PROVIDER_TIMEOUT" ? "provider_timeout" : "exception";
    _log("provider_exception", { ...snapshot, message: msg, status, retryable, elapsedMs: _now() - startedAt });
    _recordFailure(msg, status, snapshot);
    return {
      ..._normalizeFailureContract(reason, msg, status, retryable, input),
      shapeElapsedMs: shaped.shapeElapsedMs,
      segmentCount: shaped.segmentCount,
      textDisplay: providerInput.textDisplay,
      textSpeak: providerInput.textSpeak
    };
  } finally {
    activeRequests = Math.max(0, activeRequests - 1);
    _log("generate_complete", { ...snapshot, totalElapsedMs: _now() - startedAt, activeRequests });
  }
}

function _normalizePayloadLikeInput(payload, req) {
  const body = payload && typeof payload === "object" ? payload : {};
  const headers = req && req.headers && typeof req.headers === "object" ? req.headers : {};

  const text = _pickFirst(body.textSpeak, body.text, body.data, body.speak, body.say, body.message, body.prompt, body.textDisplay);

  const requestedVoiceUuid = _extractVoiceUuidCandidate(
    body.voice_uuid, body.voiceUuid, body.voiceId, body.voice,
    body.resembleVoiceUuid, body.mixerVoiceUuid, body.voiceConfig, body.voiceConfig && body.voiceConfig.voice,
    headers["x-sb-voice"], headers["x-voice-uuid"]
  );
  const voiceUuid = _resolvePreferredVoice(requestedVoiceUuid);

  const explicitProjectUuid = _pickFirst(
    body.project_uuid, body.projectUuid, headers["x-sb-project"], headers["x-project-uuid"]
  );
  const projectUuid = _resolveProjectUuid(explicitProjectUuid);

  const outputFormat = _lower(_pickFirst(body.output_format, body.outputFormat, body.format, headers["x-audio-format"], "mp3")) === "wav" ? "wav" : "mp3";
  const traceId = _pickFirst(headers["x-sb-trace-id"], body.traceId, body.requestId, _makeTrace());
  const requestId = _pickFirst(headers["x-sb-request-id"], body.requestId, body.sourceId, traceId);
  const turnId = _pickFirst(headers["x-sb-turn-id"], body.turnId, "");
  const sessionId = _pickFirst(headers["x-sb-session-id"], body.sessionId, body.sid, "");

  return {
    text: _trim(text).slice(0, MAX_TEXT),
    textDisplay: _trim(_pickFirst(body.textDisplay)).slice(0, MAX_TEXT),
    requestedVoiceUuid: _trim(requestedVoiceUuid),
    voiceUuid,
    voiceName: _resolvePreferredVoiceName(_pickFirst(body.voiceName, body.mixerVoiceName)),
    projectUuid,
    outputFormat,
    traceId,
    requestId,
    turnId,
    sessionId,
    title: _pickFirst(body.title, body.source, body.client && body.client.source, "nyx_tts").slice(0, 120),
    sampleRate: body.sampleRate || body.sample_rate,
    precision: body.precision,
    useHd: body.useHd,
    intro: _bool(body.intro, false) || _lower(body.routeKind) === "intro" || _lower(body.mode) === "intro",
    healthCheck: false,
    wantJson: false,
    mode: _pickFirst(body.mode, "presence"),
    source: _pickFirst(body.source, "tts"),
    sourceId: _pickFirst(body.sourceId, body.requestId, ""),
    speechHints: _parseSpeechHints(body),
    pronunciationMap: body.pronunciationMap && typeof body.pronunciationMap === "object" ? body.pronunciationMap : null,
    speechChunks: Array.isArray(body.speechChunks) ? body.speechChunks.map(_trim).filter(Boolean).slice(0, 24) : [],
    preserveMixerVoice: _bool(body.preserveMixerVoice, true),
    provider: _pickFirst(body.provider, "resemble"),
    routeKind: _pickFirst(body.routeKind, body.mode, body.intro ? "intro" : "main"),
    rawBody: body
  };
}

function _resolveInput(req) {
  const body = req && req.body && typeof req.body === "object" ? req.body : {};
  const query = req && req.query && typeof req.query === "object" ? req.query : {};
  const params = req && req.params && typeof req.params === "object" ? req.params : {};
  const headers = req && req.headers && typeof req.headers === "object" ? req.headers : {};

  const text = _pickFirst(
    body.textSpeak, body.text, body.data, body.speak, body.say, body.message, body.prompt, body.textDisplay,
    query.text, query.speak, query.say, query.prompt, params.text
  );

  const requestedVoiceUuid = _extractVoiceUuidCandidate(
    body.voice_uuid, body.voiceUuid, body.voiceId, body.voice,
    body.resembleVoiceUuid, body.mixerVoiceUuid, body.voiceConfig, body.voiceConfig && body.voiceConfig.voice,
    query.voice_uuid, query.voiceUuid, query.voiceId, query.voice,
    query.resembleVoiceUuid, query.mixerVoiceUuid,
    headers["x-sb-voice"], headers["x-voice-uuid"]
  );
  const voiceUuid = _resolvePreferredVoice(requestedVoiceUuid);

  const explicitProjectUuid = _pickFirst(
    body.project_uuid, body.projectUuid, query.project_uuid, query.projectUuid, headers["x-sb-project"], headers["x-project-uuid"]
  );
  const projectUuid = _resolveProjectUuid(explicitProjectUuid);

  const outputFormat = _lower(_pickFirst(
    body.output_format, body.outputFormat, body.format, query.output_format, query.outputFormat, query.format, headers["x-audio-format"], "mp3"
  )) === "wav" ? "wav" : "mp3";

  const traceId = _pickFirst(headers["x-sb-trace-id"], headers["x-sb-traceid"], query.traceId, body.traceId, _makeTrace());
  const requestId = _pickFirst(headers["x-sb-request-id"], query.requestId, body.requestId, traceId);
  const turnId = _pickFirst(headers["x-sb-turn-id"], query.turnId, body.turnId, "");
  const sessionId = _pickFirst(headers["x-sb-session-id"], query.sessionId, body.sessionId, body.sid, query.sid, "");

  return {
    text: _trim(text).slice(0, MAX_TEXT),
    textDisplay: _trim(_pickFirst(body.textDisplay, query.textDisplay)).slice(0, MAX_TEXT),
    requestedVoiceUuid: _trim(requestedVoiceUuid),
    voiceUuid,
    voiceName: _resolvePreferredVoiceName(_pickFirst(body.voiceName, query.voiceName)),
    projectUuid,
    outputFormat,
    traceId,
    requestId,
    turnId,
    sessionId,
    title: _pickFirst(body.title, query.title, body.source, body.client && body.client.source, "nyx_tts").slice(0, 120),
    sampleRate: body.sampleRate || body.sample_rate || query.sampleRate || query.sample_rate,
    precision: body.precision || query.precision,
    useHd: body.useHd != null ? body.useHd : query.useHd,
    intro: _bool(body.intro != null ? body.intro : query.intro, false) || _lower(body.routeKind || query.routeKind) === "intro" || _lower(body.mode || query.mode) === "intro",
    healthCheck: _requestIsHealth(req, body, query, headers),
    wantJson: _requestsJsonAudio(req, body, query, headers),
    mode: _pickFirst(body.mode, query.mode, "presence"),
    source: _pickFirst(body.source, query.source, "tts"),
    sourceId: _pickFirst(body.sourceId, query.sourceId, body.requestId, query.requestId, ""),
    speechHints: _parseSpeechHints({ ...query, ...body }),
    pronunciationMap: body.pronunciationMap && typeof body.pronunciationMap === "object"
      ? body.pronunciationMap
      : (query.pronunciationMap && typeof query.pronunciationMap === "object" ? query.pronunciationMap : null),
    speechChunks: Array.isArray(body.speechChunks)
      ? body.speechChunks.map(_trim).filter(Boolean).slice(0, 24)
      : (Array.isArray(query.speechChunks) ? query.speechChunks.map(_trim).filter(Boolean).slice(0, 24) : []),
    preserveMixerVoice: _bool(body.preserveMixerVoice != null ? body.preserveMixerVoice : query.preserveMixerVoice, true),
    provider: _pickFirst(body.provider, query.provider, "resemble"),
    routeKind: _pickFirst(body.routeKind, query.routeKind, body.intro || query.intro ? "intro" : "main")
  };
}

function _buildInputSnapshot(input) {
  const src = input && typeof input === "object" ? input : {};
  const contract = _voiceContract(src);
  return {
    traceId: src.traceId || "",
    requestId: src.requestId || "",
    turnId: src.turnId || "",
    sessionId: src.sessionId || "",
    routeKind: src.routeKind || "",
    intro: !!src.intro,
    mode: src.mode || "",
    source: src.source || "",
    textLen: _str(src.text || "").length,
    textHash: _hash(src.text || ""),
    textPreview: _preview(src.textDisplay || src.text || ""),
    requestedVoiceUuid: _mask(src.requestedVoiceUuid || ""),
    voiceUuid: _mask(src.voiceUuid || ""),
    voiceSource: contract.source,
    voiceStrict: contract.strict,
    voiceProblems: contract.problems,
    projectUuid: _mask(src.projectUuid || ""),
    outputFormat: src.outputFormat || "",
    wantJson: !!src.wantJson,
    audioFirst: true
  };
}

async function delegateTts(payload, req) {
  const input = _normalizePayloadLikeInput(payload, req);
  const snapshot = _buildInputSnapshot(input);
  _log("delegate_start", snapshot);

  if (!input.text) {
    return {
      ..._normalizeFailureContract("missing_text", "No TTS text was provided.", 400, false, input),
      provider: input.provider || "resemble",
      mimeType: "audio/mpeg",
      mime: "audio/mpeg",
      text: input.textDisplay || input.text || ""
    };
  }

  const result = await generate(input.text, input);
  if (!result.ok) return result;

  return {
    ...result,
    mime: result.mimeType || "audio/mpeg",
    audio: result.buffer,
    binary: result.buffer,
    audioBuffer: result.buffer,
    payload: {
      ok: true,
      provider: result.provider || "resemble",
      mimeType: result.mimeType || "audio/mpeg",
      requestId: result.requestId || input.requestId,
      providerStatus: result.providerStatus || 200,
      voiceUuid: result.voiceUuid || input.voiceUuid,
      textDisplay: result.textDisplay || input.textDisplay || input.text,
      textSpeak: result.textSpeak || input.text,
      elapsedMs: result.elapsedMs || 0,
      shapeElapsedMs: result.shapeElapsedMs || 0,
      segmentCount: result.segmentCount || 0
    }
  };
}

async function handleTts(req, res) {
  const input = _resolveInput(req);
  const snapshot = _buildInputSnapshot(input);
  const startedAt = _now();

  _setHeader(res, "X-SB-TTS-Version", _headerSafe(TTS_VERSION, 120));
  _setHeader(res, "X-SB-Trace-ID", _headerSafe(input.traceId, 120));
  _setHeader(res, "X-SB-TTS-Route-Exists", "true");
  _setHeader(res, "X-SB-Backend-Base", _headerSafe(_getBackendPublicBase(), 160));
  _setHeader(res, "X-SB-TTS-Token-Configured", _hasProviderToken() ? "true" : "false");

  _log("http_route_start", { ...snapshot, routeExists: true, tokenConfigured: _hasProviderToken(), tokenSource: _getTokenSource() || "", backendPublicBaseUrl: _getBackendPublicBase() || "" });

  if (input.healthCheck) {
    const healthState = _healthSnapshot();
    _setHeader(res, "Cache-Control", "no-store, max-age=0");
    return _safeJson(res, healthState.ok ? 200 : 503, healthState);
  }

  if (!input.text) {
    _setHeader(res, "X-SB-Response-Mode", "error");
    return _safeJson(res, 400, _frontendErrorEnvelope(input, {
      reason: "missing_text",
      message: "No TTS text was provided.",
      retryable: false,
      providerStatus: 400
    }, 400));
  }

  const result = await generate(input.text, input);

  if (!result.ok) {
    const upstreamStatus = Number(result.providerStatus || result.status || 503) || 503;
    const status = result.status === 429 ? 429 : (result.status >= 400 && result.status < 500 ? result.status : 503);

    _log("http_failure", {
      ...snapshot,
      status,
      upstreamStatus,
      reason: result.reason || "",
      providerEndpoint: result.providerEndpoint || "",
      authMode: result.authMode || "",
      elapsedMs: _now() - startedAt
    });

    _setHeader(res, "X-SB-Response-Mode", "error");
    _setCommonAudioHeaders(res, input.traceId, {
      provider: result.provider || "resemble",
      voiceUuid: result.voiceUuid || input.voiceUuid,
      voiceSource: snapshot.voiceSource,
      elapsedMs: result.elapsedMs || 0,
      shapeMs: result.shapeElapsedMs || 0,
      segmentCount: result.segmentCount || 0,
      providerStatus: upstreamStatus,
      failoverKind: result.failoverKind || "primary",
      reason: result.reason || "tts_unavailable",
      requestId: result.requestId || input.requestId,
      turnId: result.turnId || input.turnId,
      sessionId: result.sessionId || input.sessionId
    });
    return _safeJson(res, status, _frontendErrorEnvelope(input, result, status));
  }

  const routeAudio = _normalizeRouteSuccessAudio(result);
  if (!routeAudio.ok) {
    _log("http_success_without_audio", {
      ...snapshot,
      reason: result.reason || "success_without_audio",
      providerStatus: result.providerStatus || 200,
      elapsedMs: _now() - startedAt
    });
    _setHeader(res, "X-SB-Response-Mode", "error");
    return _safeJson(res, 502, _frontendErrorEnvelope(input, {
      ...result,
      reason: "tts_backend_unrecognized_payload",
      message: "Provider reported success but no playable audio reached the TTS route.",
      retryable: true,
      providerStatus: result.providerStatus || 502
    }, 502));
  }

  _setCommonAudioHeaders(res, input.traceId, {
    provider: result.provider || "resemble",
    voiceUuid: result.voiceUuid || input.voiceUuid,
    voiceSource: snapshot.voiceSource,
    elapsedMs: result.elapsedMs || 0,
    shapeMs: result.shapeElapsedMs || 0,
    segmentCount: result.segmentCount || 0,
    providerStatus: result.providerStatus || 200,
    failoverKind: result.failoverKind || "primary",
    requestId: result.requestId || input.requestId,
    turnId: result.turnId || input.turnId,
    sessionId: result.sessionId || input.sessionId
  });

  const allowJsonSuccess = !!(input.wantJson && !AUDIO_FIRST_LOCK && req && String(req.method || "").toUpperCase() === "GET");
  if (allowJsonSuccess) {
    _log("http_success_json", { ...snapshot, bytes: routeAudio.bytes || 0, elapsedMs: _now() - startedAt });
    _setHeader(res, "X-SB-Response-Mode", "json-audio");
    return _safeJson(res, 200, {
      ok: true,
      provider: result.provider,
      mimeType: routeAudio.mimeType || result.mimeType || "audio/mpeg",
      audio: routeAudio.buffer.toString("base64"),
      audioBase64: routeAudio.buffer.toString("base64"),
      traceId: input.traceId,
      elapsedMs: result.elapsedMs || 0,
      requestId: result.requestId,
      providerStatus: result.providerStatus || 200,
      providerEndpoint: result.providerEndpoint || "",
      authMode: result.authMode || "",
      textDisplay: result.textDisplay || input.textDisplay || input.text,
      textSpeak: result.textSpeak || input.text,
      speechChunks: result.speechChunks || [],
      shapeElapsedMs: result.shapeElapsedMs || 0,
      segmentCount: result.segmentCount || 0,
      voiceUuid: result.voiceUuid || input.voiceUuid || "",
      turnId: result.turnId || input.turnId || "",
      sessionId: result.sessionId || input.sessionId || "",
      ttsFailure: result.ttsFailure || _normalizeRecoveryContract(input),
      audioFailure: result.audioFailure || _normalizeRecoveryContract(input)
    });
  }

  try {
    _setHeader(res, "X-SB-Response-Mode", "audio");
    _setHeader(res, "Content-Type", routeAudio.mimeType || result.mimeType || "audio/mpeg");
    _setHeader(res, "Content-Length", String(routeAudio.bytes));
    _setHeader(res, "Accept-Ranges", "none");
    _setHeader(res, "X-SB-Audio-Playback-Verify", _headerSafe(result.requestId || input.requestId || input.traceId, 80));
    _log("http_success_audio", { ...snapshot, bytes: routeAudio.bytes, mimeType: routeAudio.mimeType || result.mimeType || "audio/mpeg", elapsedMs: _now() - startedAt });
    return res.status(200).send(routeAudio.buffer);
  } catch (e) {
    const detail = _trim(e && (e.message || e)) || "Failed to send audio buffer.";
    _log("http_send_failed", { ...snapshot, detail, elapsedMs: _now() - startedAt });
    _setHeader(res, "X-SB-Response-Mode", "error");
    return _safeJson(res, 503, {
      ok: false,
      spokenUnavailable: true,
      error: "send_failed",
      detail,
      traceId: input.traceId,
      provider: result.provider || "resemble",
      requestId: result.requestId || input.requestId || "",
      turnId: result.turnId || input.turnId || "",
      sessionId: result.sessionId || input.sessionId || "",
      payload: { spokenUnavailable: true }
    });
  }
}

const health = () => _healthSnapshot();


module.exports = {
  handleTts,
  delegateTts,
  ttsHandler: handleTts,
  handler: handleTts,
  handle: delegateTts,
  synthesize: delegateTts,
  tts: delegateTts,
  generate,
  health,
  PHASES,
  MANUAL_RESEMBLE_CONFIG,
  TTS_VERSION,
  VERSION: TTS_VERSION,
  version: TTS_VERSION
};
module.exports.default = module.exports;

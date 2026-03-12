"use strict";

const https = require("https");

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
  p20_nonJsonTolerance: true
});

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
function _mimeFor(fmt){
  const f = _lower(fmt);
  if (f === "wav") return "audio/wav";
  if (f === "ogg") return "audio/ogg";
  if (f === "flac") return "audio/flac";
  return "audio/mpeg";
}
function _getToken(){
  return _pickFirst(process.env.RESEMBLE_API_TOKEN, process.env.RESEMBLE_API_KEY, "");
}
function _getProjectUuid(){
  return _pickFirst(process.env.RESEMBLE_PROJECT_UUID, process.env.SB_RESEMBLE_PROJECT_UUID, "");
}
function _getVoiceUuid(){
  return _pickFirst(
    process.env.RESEMBLE_VOICE_UUID,
    process.env.SB_RESEMBLE_VOICE_UUID,
    process.env.SBNYX_RESEMBLE_VOICE_UUID,
    ""
  );
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
function _enableSsml(){
  return _boolish(process.env.RESEMBLE_USE_SSML, true);
}
function _enableProsodyShaping(){
  return _boolish(process.env.RESEMBLE_ENABLE_PROSODY_SHAPING, true);
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
  const requested = _trim(v);
  const envVoice = _getVoiceUuid();
  if (_looksLikeUuid(requested)) return requested;
  if (_looksLikeUuid(envVoice)) return envVoice;
  if (requested && envVoice && requested === envVoice.slice(0, requested.length)) return envVoice;
  return envVoice || requested;
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

function _postViaHttps(url, headers, bodyObj, timeoutMs){
  const body = JSON.stringify(bodyObj);
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
        res.on("data", (d) => chunks.push(d));
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
      return {
        status: res.status,
        headers: Object.fromEntries(res.headers.entries()),
        buffer,
        text: buffer.toString("utf8")
      };
    } finally {
      if (to) clearTimeout(to);
    }
  }
  return _postViaHttps(url, headers, bodyObj, timeoutMs);
}

function _downloadViaHttps(url, timeoutMs){
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
        res.on("data", (d) => chunks.push(d));
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
  const safeUrl = _normalizeUrlCandidate(url);
  if (!safeUrl){
    throw new Error("invalid_audio_src_url");
  }

  const proto = new URL(safeUrl).protocol;
  if (!/^https?:$/i.test(proto)){
    throw new Error("unsupported_audio_src_protocol");
  }

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
      return {
        status: res.status,
        headers: Object.fromEntries(res.headers.entries()),
        buffer: Buffer.from(ab)
      };
    } finally {
      if (to) clearTimeout(to);
    }
  }

  return _downloadViaHttps(safeUrl, timeoutMs);
}

async function _callSynthesize(payload, token, traceId, timeoutMs, authMode){
  const headers = {
    ..._buildAuthHeaders(token, authMode),
    "User-Agent": "sb-nyx-tts/1.3"
  };
  if (traceId) headers["X-SB-Trace-ID"] = traceId;

  const urls = _candidateSynthesizeUrls();
  let lastResp = null;

  for (let i = 0; i < urls.length; i++){
    const url = urls[i];
    try{
      const resp = await _postRequest(url, headers, payload, timeoutMs);
      resp.providerEndpoint = url;
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
        providerEndpoint: url,
        thrown: e
      };
    }
  }

  return lastResp || {
    status: 0,
    headers: {},
    buffer: Buffer.alloc(0),
    text: "No provider endpoint available.",
    providerEndpoint: _pickFirst.apply(null, urls)
  };
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
  const voiceUuid = _resolveVoiceUuid(opts && opts.voiceUuid);
  const projectUuid = _pickFirst(opts && opts.projectUuid, _getProjectUuid());
  const outputFormat = _lower(_pickFirst(opts && opts.outputFormat, "mp3")) === "wav" ? "wav" : "mp3";
  const sampleRate = opts && opts.sampleRate ? opts.sampleRate : undefined;
  const precision = _pickFirst(opts && opts.precision, "").toUpperCase();
  const title = _trim(opts && opts.title);
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
      message: "Missing voiceUuid / RESEMBLE_VOICE_UUID",
      status: 0,
      elapsedMs: Date.now() - started,
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

  try{
    resp = await _callSynthesize(payload, token, traceId, timeoutMs, authMode);

    if (speech.useSsml){
      const ssmlJson = _parseJson(resp && resp.text ? resp.text : "");
      const looksRejected =
        (resp && (resp.status === 400 || resp.status === 415 || resp.status === 422)) ||
        /ssml|markup|invalid xml|invalid ssml|unsupported/i.test(
          _normalizeProviderMessage(ssmlJson, resp && resp.text)
        );

      if (looksRejected){
        const plainPayload = { ...payload, data: speech.plainText };
        delete plainPayload.data_type;
        resp = await _callSynthesize(plainPayload, token, traceId, timeoutMs, authMode);
      }
    }

    if (resp && (resp.status === 401 || resp.status === 403)){
      authMode = "raw";
      resp = await _callSynthesize(payload, token, traceId, timeoutMs, authMode);
    }
    if (resp && (resp.status === 401 || resp.status === 403)){
      authMode = "token";
      resp = await _callSynthesize(payload, token, traceId, timeoutMs, authMode);
    }
  }catch(e){
    const msg = _str(e && e.message ? e.message : e);
    const timeoutish = /timeout|abort/i.test(msg);
    return {
      ok: false,
      retryable: true,
      reason: timeoutish ? "provider_timeout" : "network_error",
      message: msg,
      status: 0,
      elapsedMs: Date.now() - started,
      authMode,
      providerEndpoint: resp && resp.providerEndpoint ? resp.providerEndpoint : _pickFirst.apply(null, _candidateSynthesizeUrls()),
      voiceUuid,
      traceId,
      textDisplay: speech.textDisplay,
      textSpeak: speech.textSpeak,
      speechChunks: speech.speechChunks,
      segmentCount: speech.segmentCount,
      usedSsml: speech.useSsml,
      phases: PHASES
    };
  }

  const status = resp && resp.status ? resp.status : 0;
  const providerEndpoint = resp && resp.providerEndpoint ? resp.providerEndpoint : _pickFirst.apply(null, _candidateSynthesizeUrls());
  const contentType = _getHeader(resp && resp.headers, "content-type");
  const json = _isJsonContentType(contentType)
    ? _parseJson(resp && resp.text ? resp.text : "")
    : (_parseJson(resp && resp.text ? resp.text : "") || _safeJsonParseFromBuffer(resp && resp.buffer));

  if (!_providerSucceeded(status, json, resp)){
    const retryable = status >= 500 || status === 429 || status === 408 || status === 0;
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
      providerEndpoint,
      voiceUuid,
      traceId,
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
        providerEndpoint,
        voiceUuid,
        traceId,
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
        providerEndpoint,
        voiceUuid,
        traceId,
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
      const dl = await _downloadBuffer(String(env.audio_src), timeoutMs);
      if (!dl || dl.status < 200 || dl.status >= 300 || !Buffer.isBuffer(dl.buffer) || dl.buffer.length < 16){
        return {
          ok: false,
          retryable: true,
          reason: "audio_src_download_failed",
          message: "Provider returned audio_src but the audio could not be downloaded.",
          status: dl && dl.status ? dl.status : status,
          elapsedMs: Date.now() - started,
          issues: env.issues,
          requestId: env.request_id,
          authMode,
          providerEndpoint,
          voiceUuid,
          traceId,
          textDisplay: speech.textDisplay,
          textSpeak: speech.textSpeak,
          speechChunks: speech.speechChunks,
          segmentCount: speech.segmentCount,
          usedSsml: speech.useSsml,
          phases: PHASES
        };
      }
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
        providerEndpoint,
        voiceUuid,
        traceId,
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
      providerEndpoint,
      voiceUuid,
      traceId,
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
      providerEndpoint,
      voiceUuid,
      traceId,
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
    providerEndpoint,
    voiceUuid,
    traceId,
    textDisplay: speech.textDisplay,
    textSpeak: speech.textSpeak,
    plainText: speech.plainText,
    ssmlText: speech.ssmlText,
    speechChunks: speech.speechChunks,
    segmentCount: speech.segmentCount,
    speechHints: speech.speechHints,
    usedSsml: speech.useSsml,
    phases: PHASES
  };
}

module.exports = { synthesize };

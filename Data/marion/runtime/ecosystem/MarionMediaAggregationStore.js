
'use strict';

const VERSION = 'marion.mediaAggregationStore/4.0';
const DEFAULT_WINDOW_MS = Math.max(60_000, Number(process.env.MEDIA_PHASE4_WINDOW_MS || 15 * 60_000) || 15 * 60_000);
const MAX_WINDOWS = Math.max(24, Math.min(5000, Number(process.env.MEDIA_PHASE4_MAX_WINDOWS || 500) || 500));
const windows = new Map();

function clean(value, max = 160) { return String(value == null ? '' : value).trim().slice(0,max); }
function windowStart(timestamp, windowMs = DEFAULT_WINDOW_MS) { return Math.floor((Number(timestamp)||Date.now())/windowMs)*windowMs; }
function key(event, start) { return [start,event.component,event.campaignId||'none'].join('|'); }
function clone(v){ return v == null ? v : JSON.parse(JSON.stringify(v)); }

function prune() {
  if (windows.size <= MAX_WINDOWS) return;
  const ordered = [...windows.entries()].sort((a,b)=>a[1].windowStart-b[1].windowStart);
  for (let i=0;i<ordered.length-MAX_WINDOWS;i++) windows.delete(ordered[i][0]);
}

function record(event = {}, options = {}) {
  const windowMs = Math.max(60_000, Number(options.windowMs || DEFAULT_WINDOW_MS) || DEFAULT_WINDOW_MS);
  const start = windowStart(event.timestamp, windowMs);
  const k = key(event, start);
  const current = windows.get(k) || {
    windowStart:start,
    windowEnd:start+windowMs,
    windowMs,
    component:event.component,
    campaignId:event.campaignId||'',
    totalEvents:0,
    totalValue:0,
    totalDurationMs:0,
    events:{},
    content:{},
    sessions:{},
    lastUpdatedAt:0
  };

  current.totalEvents += 1;
  current.totalValue += Number(event.value||0) || 0;
  current.totalDurationMs += Number(event.durationMs||0) || 0;
  current.events[event.eventName] = (current.events[event.eventName] || 0) + 1;
  if (event.contentId) current.content[event.contentId] = (current.content[event.contentId] || 0) + 1;
  if (event.sessionId) current.sessions[event.sessionId] = true;
  current.lastUpdatedAt = Date.now();
  windows.set(k,current);
  prune();
  return summary(current);
}

function summary(value) {
  if (!value) return null;
  const sessions = Object.keys(value.sessions || {}).length;
  const topContent = Object.entries(value.content || {})
    .sort((a,b)=>b[1]-a[1])
    .slice(0,10)
    .map(([contentId,count])=>({contentId,count}));
  return {
    windowStart:value.windowStart,
    windowEnd:value.windowEnd,
    windowMs:value.windowMs,
    component:value.component,
    campaignId:value.campaignId,
    totalEvents:value.totalEvents,
    uniqueSessions:sessions,
    totalValue:value.totalValue,
    totalDurationMs:value.totalDurationMs,
    events:{...value.events},
    topContent,
    lastUpdatedAt:value.lastUpdatedAt
  };
}

function snapshot(options = {}) {
  const component = clean(options.component,64);
  const campaignId = clean(options.campaignId,120);
  const since = Math.max(0, Number(options.since || 0) || 0);
  const until = Math.max(since, Number(options.until || Date.now()) || Date.now());
  return [...windows.values()]
    .filter(w => (!component || w.component===component) && (!campaignId || w.campaignId===campaignId) && w.windowEnd>=since && w.windowStart<=until)
    .sort((a,b)=>a.windowStart-b.windowStart)
    .map(summary);
}

function combined(options = {}) {
  const rows = snapshot(options);
  const out = { totalEvents:0, uniqueSessions:0, totalValue:0, totalDurationMs:0, events:{}, components:{}, campaigns:{}, windows:rows.length };
  const sessionApprox = new Set();
  for (const row of rows) {
    out.totalEvents += row.totalEvents;
    out.totalValue += row.totalValue;
    out.totalDurationMs += row.totalDurationMs;
    out.components[row.component] = (out.components[row.component]||0)+row.totalEvents;
    out.campaigns[row.campaignId||'none'] = (out.campaigns[row.campaignId||'none']||0)+row.totalEvents;
    for (const [name,count] of Object.entries(row.events)) out.events[name]=(out.events[name]||0)+count;
    sessionApprox.add(`${row.component}:${row.campaignId}:${row.windowStart}:${row.uniqueSessions}`);
    out.uniqueSessions += row.uniqueSessions;
  }
  return out;
}

function getHealth(){ return {ok:true,service:'MarionMediaAggregationStore',version:VERSION,windows:windows.size,defaultWindowMs:DEFAULT_WINDOW_MS,maxWindows:MAX_WINDOWS}; }
function resetForTests(){ windows.clear(); }

module.exports = Object.freeze({ VERSION, DEFAULT_WINDOW_MS, record, snapshot, combined, getHealth, resetForTests });


'use strict';

const Gateway = require('./MarionEcosystemGateway');
const Store = require('./MarionMediaAggregationStore');
const Telemetry = require('./MarionEcosystemTelemetry');

const VERSION = 'marion.mediaIntelligenceAggregator/4.0';

function clean(value,max=1600){return String(value==null?'':value).replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,max);}
function obj(value){return value&&typeof value==='object'&&!Array.isArray(value)?value:{};}

function deterministic(snapshot = {}) {
  const events = snapshot.events || {};
  const advertising = (events['advertising.inquiry']||0) + (events['page.cta_click']||0);
  const radio = (events['radio.play']||0) + (events['radio.session']||0);
  const tv = (events['tv.content_open']||0) + (events['tv.content_complete']||0) + (events['tv.watch_duration']||0);
  const synapse = (events['synapse.story_open']||0) + (events['synapse.category_open']||0);
  const strongest = Object.entries({advertising,radio,tv,synapse}).sort((a,b)=>b[1]-a[1])[0] || ['none',0];
  return {
    summary:`${snapshot.totalEvents||0} media events across ${Object.keys(snapshot.components||{}).length} components. Strongest signal family: ${strongest[0]} (${strongest[1]} events).`,
    strongestSignal:strongest[0],
    advertisingSignals:advertising,
    radioSignals:radio,
    tvSignals:tv,
    synapseSignals:synapse
  };
}

function parseMarion(value) {
  if (typeof value === 'string') return {summary:clean(value)};
  const source=obj(value&&value.marion||value);
  return {summary:clean(source.summary||source.text||source.message||source.reply||source.content),observations:Array.isArray(source.observations)?source.observations.map(x=>clean(x,300)).filter(Boolean).slice(0,8):[],recommendations:Array.isArray(source.recommendations)?source.recommendations.map(x=>clean(x,300)).filter(Boolean).slice(0,8):[],risks:Array.isArray(source.risks)?source.risks.map(x=>clean(x,240)).filter(Boolean).slice(0,8):[]};
}

async function analyze(options = {}) {
  const snapshot=Store.combined(options), baseline=deterministic(snapshot), runner=Gateway.resolveMarionRunner();
  if (!runner) return {ok:true,degraded:true,version:VERSION,snapshot,deterministic:baseline,marion:{summary:'Marion unavailable; deterministic media intelligence remains available.',observations:[],recommendations:[],risks:['marion_unavailable']}};
  const started=Date.now();
  try {
    const raw=await runner({
      text:[
        'Analyze this aggregated Sandblast media telemetry. Do not infer individual identity and do not request raw event logs.',
        'Return concise operational observations, advertising/conversion signals, content engagement observations, and recommendations.',
        `Total events: ${snapshot.totalEvents}`,
        `Approximate unique session-window counts: ${snapshot.uniqueSessions}`,
        `Components: ${JSON.stringify(snapshot.components)}`,
        `Events: ${JSON.stringify(snapshot.events)}`,
        `Campaigns: ${JSON.stringify(snapshot.campaigns)}`,
        `Total watch/listen duration ms: ${snapshot.totalDurationMs}`
      ].join('\n'),
      sourceComponent:'media-intelligence',
      targetComponent:'marion',
      eventType:'media.event',
      intent:'media.aggregate.analysis',
      mediaIntelligence:{snapshot,deterministic:baseline,aggregatedOnly:true,containsRawEvents:false}
    });
    const marion=parseMarion(raw);
    Telemetry.record('media_intelligence_success',{source:'media-intelligence',target:'marion',eventType:'media.event',status:'completed',durationMs:Date.now()-started});
    return {ok:true,degraded:false,version:VERSION,snapshot,deterministic:baseline,marion};
  } catch (error) {
    Telemetry.record('media_intelligence_error',{source:'media-intelligence',target:'marion',eventType:'media.event',stage:'marion',durationMs:Date.now()-started});
    return {ok:true,degraded:true,version:VERSION,snapshot,deterministic:baseline,marion:{summary:'Marion analysis failed; deterministic media intelligence remains available.',observations:[],recommendations:[],risks:['marion_analysis_failed']},warning:clean(error&& (error.code||error.message||error.name)||'marion_error',180)};
  }
}

module.exports = Object.freeze({ VERSION, deterministic, analyze });

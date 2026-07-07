"use strict";
/**
 * publicIdentityQuestionRefinement.js
 * Phase 3C — Public Identity Question Answering Refinement.
 *
 * Purpose:
 * - Preserve Phase 1/2/3 security boundaries while answering public identity
 *   questions directly instead of flattening them into generic presence replies.
 * - Never confirm private operator identity on public Nyx surfaces.
 * - Never expose Marion/private routing as a public speaker.
 */
const VERSION = "nyx.publicIdentityQuestionRefinement/3C.1";
const PUBLIC_AGENT = "Nyx";
const PUBLIC_GENERAL_REPLY = "I’m Nyx, the public Sandblast assistant. I can help you explore Sandblast, radio, TV, media, AI, or business tools.";
const PUBLIC_WHO_REPLY = "You’re speaking with Nyx, the public Sandblast assistant for media, radio, TV, discovery, and business tools.";
const PUBLIC_OPERATOR_PRIVACY_REPLY = "I’m Nyx, the public Sandblast assistant. I don’t confirm private identity on this public surface, but I can help you explore Sandblast, radio, TV, media, AI, or business tools.";
const PUBLIC_PRIVATE_ROUTING_REPLY = "You’re speaking with Nyx on the public Sandblast interface. I don’t expose private system routing here, but I can help with Sandblast, radio, TV, media, AI, or business tools.";
const PUBLIC_SELF_IDENTITY_REPLY = "You’re speaking with Nyx, the public Sandblast assistant. I can guide you through Sandblast media, radio, TV, AI, and business tools.";
const PUBLIC_UNKNOWN_PERSON_REPLY = "I’m Nyx, the public Sandblast assistant. I don’t disclose or validate private identity details on this public surface, but I can help you explore Sandblast and its tools.";

const IDENTITY_PATTERNS = Object.freeze({
  who: /\b(?:who\s+am\s+i\s+talking\s+to|who\s+are\s+you|what\s+are\s+you|what\s+is\s+nyx)\b/i,
  operatorKnowledge: /\b(?:do\s+you\s+know\s+(?:mac|the\s+operator|the\s+owner|sean)|are\s+you\s+talking\s+to\s+(?:mac|the\s+operator|the\s+owner|sean)|am\s+i\s+(?:mac|the\s+operator|sean)|i\s+am\s+(?:mac|the\s+operator|sean)|this\s+is\s+(?:mac|the\s+operator|sean))\b/i,
  operatorWho: /\b(?:who\s+is\s+(?:mac|the\s+operator|sean)|what\s+is\s+(?:mac|the\s+operator|sean))\b/i,
  privateAgent: /\b(?:are\s+you\s+marion|am\s+i\s+talking\s+to\s+marion|is\s+marion\s+connected|do\s+you\s+connect\s+to\s+marion|can\s+i\s+talk\s+to\s+marion|who\s+is\s+marion|what\s+is\s+marion)\b/i,
  privateRoute: /\b(?:private\s+route|private\s+system|backend\s+agent|operator\s+memory|admin\s+session|private\s+memory)\b/i
});
const PRIVATE_CONFIRMATION_RE = /\b(?:i\s+know\s+(?:mac|sean)|yes[,\s]+(?:mac|sean)|you\s+are\s+(?:mac|sean)|i\s+am\s+marion|marion\s+is\s+connected|operator\s+session|authenticated\s+operator|private\s+operator|admin\s+route|operator\s+memory)\b/i;
const PRIVATE_NAME_RE = /\b(?:Mac|Marion|Sean\s+Nicholas|Sean)\b/g;

function safeStr(value){ return value == null ? "" : String(value).replace(/\s+/g," ").trim(); }
function lower(value){ return safeStr(value).toLowerCase(); }
function isObj(value){ return !!value && typeof value === "object" && !Array.isArray(value); }
function safeObj(value){ return isObj(value) ? value : {}; }
function extractPrompt(context={}){
  const src=safeObj(context), body=safeObj(src.body), payload=safeObj(src.payload||body.payload), turn=safeObj(src.turn||body.turn||payload.turn), meta=safeObj(src.meta||body.meta||payload.meta);
  return safeStr(src.prompt||src.message||src.text||src.query||src.userQuery||body.prompt||body.message||body.text||body.query||payload.prompt||payload.message||payload.text||payload.query||turn.prompt||turn.message||turn.text||meta.prompt||meta.message||"");
}
function classifyPublicIdentityQuestion(value=""){
  const text=safeStr(value);
  if(!text) return "none";
  if(IDENTITY_PATTERNS.who.test(text)) return "public_self";
  if(IDENTITY_PATTERNS.operatorKnowledge.test(text)) return "operator_identity_private";
  if(IDENTITY_PATTERNS.operatorWho.test(text)) return "operator_details_private";
  if(IDENTITY_PATTERNS.privateAgent.test(text)) return "private_agent_private";
  if(IDENTITY_PATTERNS.privateRoute.test(text)) return "private_routing_private";
  return "none";
}
function isPublicIdentityQuestionPrompt(value=""){ return classifyPublicIdentityQuestion(value) !== "none"; }
function cleanPublicIdentityReply(prompt=""){
  const kind=classifyPublicIdentityQuestion(prompt);
  if(kind === "public_self") return PUBLIC_WHO_REPLY;
  if(kind === "operator_identity_private") return PUBLIC_OPERATOR_PRIVACY_REPLY;
  if(kind === "operator_details_private") return PUBLIC_UNKNOWN_PERSON_REPLY;
  if(kind === "private_agent_private" || kind === "private_routing_private") return PUBLIC_PRIVATE_ROUTING_REPLY;
  return PUBLIC_GENERAL_REPLY;
}
function sanitizeIdentitySensitiveText(value=""){
  let out=safeStr(value);
  if(!out) return out;
  if(PRIVATE_CONFIRMATION_RE.test(out)) return cleanPublicIdentityReply("Do you know Mac?");
  out=out
    .replace(/\bI\s+know\s+(?:Mac|Sean)(?:\s+Nicholas)?\b/gi,"I don’t confirm private operator identity on this public surface")
    .replace(/\b(?:Mac|Sean)(?:\s+Nicholas)?\s+is\s+(?:the\s+)?(?:operator|owner|admin)\b/gi,"private identity details are not disclosed on this public surface")
    .replace(/\bMarion\s+is\s+connected\b/gi,"private system routing is not exposed here")
    .replace(/\bI\s+am\s+Marion\b/gi,"I’m Nyx")
    .replace(/\bYou(?:'|’)?re\s+speaking\s+with\s+Marion\b/gi,"You’re speaking with Nyx")
    .replace(/\bMarion\b/g,"Nyx")
    .replace(/\bMac\b/g,"")
    .replace(/\bSean\s+Nicholas\b/g,"")
    .replace(/\bSean\b/g,"")
    .replace(/\s+/g," ").replace(/\s+([,.!?;:])/g,"$1").trim();
  return out;
}
function resolvePublicReply(prompt="", candidate=""){
  const p=safeStr(prompt);
  if(isPublicIdentityQuestionPrompt(p)) return cleanPublicIdentityReply(p);
  const c=sanitizeIdentitySensitiveText(candidate);
  if(!c) return c;
  if(PRIVATE_CONFIRMATION_RE.test(candidate)) return cleanPublicIdentityReply(p || "Do you know Mac?");
  return c;
}
function withPublicIdentityReplyFields(value={}, context={}){
  const prompt=extractPrompt(context)||extractPrompt(value);
  if(!isPublicIdentityQuestionPrompt(prompt)) return value;
  const reply=cleanPublicIdentityReply(prompt);
  if(typeof value === "string") return reply;
  const out=Object.assign({}, safeObj(value));
  ["reply","text","answer","response","message","output","spokenText","displayReply","publicReply","visibleReply","finalReply"].forEach(k=>{ out[k]=reply; });
  out.publicIdentityQuestionRefinement = true;
  out.publicIdentityQuestionType = classifyPublicIdentityQuestion(prompt);
  out.publicSurfaceOnly = true;
  out.audience = "public";
  out.surfaceAgent = "nyx";
  out.publicAgent = PUBLIC_AGENT;
  out.operatorPersonalization = false;
  out.allowPersonalName = false;
  out.authenticatedOperator = false;
  out.meta = Object.assign({}, safeObj(out.meta), { publicIdentityQuestionRefinement:true, publicIdentityQuestionType:out.publicIdentityQuestionType, version:VERSION, privateIdentityConfirmed:false });
  return out;
}
module.exports = {
  VERSION,
  PUBLIC_AGENT,
  PUBLIC_GENERAL_REPLY,
  PUBLIC_WHO_REPLY,
  PUBLIC_OPERATOR_PRIVACY_REPLY,
  PUBLIC_PRIVATE_ROUTING_REPLY,
  PUBLIC_SELF_IDENTITY_REPLY,
  PUBLIC_UNKNOWN_PERSON_REPLY,
  safeStr,
  lower,
  extractPrompt,
  classifyPublicIdentityQuestion,
  isPublicIdentityQuestionPrompt,
  cleanPublicIdentityReply,
  sanitizeIdentitySensitiveText,
  resolvePublicReply,
  withPublicIdentityReplyFields
};

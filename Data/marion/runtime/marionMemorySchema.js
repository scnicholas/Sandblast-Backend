"use strict";
const VERSION = "marionMemorySchema v1.0.0 PHASE1-MEMORY-SCHEMA";
const MEMORY_CLASSES = Object.freeze({ self: { key: "self", retention: "long", private: true }, relationship: { key: "relationship", retention: "long", private: true }, mission: { key: "mission", retention: "long", private: true }, emotional: { key: "emotional", retention: "medium", private: true }, conversation: { key: "conversation", retention: "short", private: false }, relay: { key: "relay", retention: "short", private: false } });
function isObj(v) { return !!v && typeof v === "object" && !Array.isArray(v); }
function arr(v) { return Array.isArray(v) ? v : []; }
function normalizeMemoryStore(input = {}) { const src = isObj(input) ? input : {}; return { self: isObj(src.self) ? src.self : {}, relationship: isObj(src.relationship) ? src.relationship : {}, mission: isObj(src.mission) ? src.mission : {}, emotional: isObj(src.emotional) ? src.emotional : {}, conversation: isObj(src.conversation) ? src.conversation : {}, relay: isObj(src.relay) ? src.relay : {}, history: arr(src.history).slice(-12), version: VERSION }; }
module.exports = { VERSION, MEMORY_CLASSES, normalizeMemoryStore };

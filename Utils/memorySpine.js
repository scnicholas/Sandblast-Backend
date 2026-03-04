"use strict";

/*
Memory Spine v1
Sandblast AI System

Purpose:
Provide structured conversational memory so Nyx can maintain
deep context (15–20 turns) without looping.

Location:
src/Utils/memorySpine.js
*/

const MAX_TURNS = 20;
const MAX_OPEN_LOOPS = 6;

const sessions = new Map();

/*
Turn structure

{
  id,
  ts,
  user,
  assistant,
  intent,
  topics,
  entities
}
*/

function _createSession(sessionId) {
  return {
    id: sessionId,
    turns: [],
    summary: "",
    openLoops: [],
    entities: {},
    lastAssistantHash: null
  };
}

function getSession(sessionId) {
  if (!sessions.has(sessionId)) {
    sessions.set(sessionId, _createSession(sessionId));
  }
  return sessions.get(sessionId);
}

/*
Store a conversational turn
*/

function storeTurn(sessionId, turn) {
  const session = getSession(sessionId);

  const entry = {
    id: Date.now().toString(36),
    ts: Date.now(),
    user: turn.user || "",
    assistant: turn.assistant || "",
    intent: turn.intent || "general",
    topics: turn.topics || [],
    entities: turn.entities || []
  };

  session.turns.push(entry);

  if (session.turns.length > MAX_TURNS) {
    session.turns.shift();
  }

  updateSummary(session);

  return entry;
}

/*
Update session summary
Keeps compressed context of conversation
*/

function updateSummary(session) {
  const lastTurns = session.turns.slice(-5);

  const summaryLines = lastTurns.map(t => {
    return `User asked about ${t.intent}`;
  });

  session.summary = summaryLines.join(". ");
}

/*
Open loop tracker
*/

function addOpenLoop(sessionId, question) {
  const session = getSession(sessionId);

  session.openLoops.push(question);

  if (session.openLoops.length > MAX_OPEN_LOOPS) {
    session.openLoops.shift();
  }
}

function closeLoop(sessionId, question) {
  const session = getSession(sessionId);

  session.openLoops = session.openLoops.filter(q => q !== question);
}

/*
Prevent repetitive responses
*/

function isRepetitive(sessionId, response) {
  const session = getSession(sessionId);

  const hash = response
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 120);

  if (hash === session.lastAssistantHash) {
    return true;
  }

  session.lastAssistantHash = hash;

  return false;
}

/*
Build memory context for prompt
*/

function buildContext(sessionId) {
  const session = getSession(sessionId);

  const recentTurns = session.turns.slice(-10).map(t => {
    return `User: ${t.user}\nNyx: ${t.assistant}`;
  });

  return {
    summary: session.summary,
    openLoops: session.openLoops,
    recent: recentTurns.join("\n")
  };
}

/*
Diagnostics
*/

function diag() {
  return {
    activeSessions: sessions.size
  };
}

module.exports = {
  getSession,
  storeTurn,
  addOpenLoop,
  closeLoop,
  buildContext,
  isRepetitive,
  diag
};

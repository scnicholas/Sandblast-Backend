const memory = {
  marion: {
    currentObjective: "Stabilize Marion chamber and Guardian runtime pathway.",
    lastTopic: "",
    lastDecision: "",
    lastAction: "",
    turns: []
  },
  aster: {
    currentObjective: "Standby for analysis-layer activation.",
    turns: []
  },
  thalon: {
    currentObjective: "Standby for strategic-layer activation.",
    turns: []
  }
};

export function getGuardianMemory(guardian = "marion") {
  return memory[guardian] || memory.marion;
}

export function rememberTurn(guardian = "marion", turn = {}) {
  const m = getGuardianMemory(guardian);

  m.lastTopic = turn.input || m.lastTopic;
  m.lastDecision = turn.reply || m.lastDecision;
  m.lastAction = turn.nextAction || m.lastAction;

  m.turns.push({
    timestamp: new Date().toISOString(),
    ...turn
  });

  if (m.turns.length > 20) {
    m.turns.shift();
  }

  return m;
}

export function setGuardianObjective(guardian = "marion", objective = "") {
  const m = getGuardianMemory(guardian);
  m.currentObjective = objective || m.currentObjective;
  return m;
}

"use strict";

const {
  deriveNyxState,
  buildNyxStatePacket,
  createNyxProactiveStateEngine,
} = require("../../public/nyx/evolution/nyxProactiveStateEngine");

describe("Nyx Proactive State Engine", () => {
  test("derives ready state by default", () => {
    expect(deriveNyxState({})).toBe("ready");
  });

  test("derives thinking state from busy flag", () => {
    expect(deriveNyxState({ busy: true })).toBe("thinking");
  });

  test("derives listening state", () => {
    expect(deriveNyxState({ listening: true })).toBe("listening");
  });

  test("derives speaking state", () => {
    expect(deriveNyxState({ speaking: true })).toBe("speaking");
  });

  test("derives media state", () => {
    expect(deriveNyxState({ mediaOn: true })).toBe("media");
  });

  test("derives fallback state", () => {
    expect(deriveNyxState({ fallbackUsed: true })).toBe("fallback");
  });

  test("builds safe state packet", () => {
    const packet = buildNyxStatePacket({ busy: true });

    expect(packet.state).toBe("thinking");
    expect(packet.label).toBe("Working");
    expect(packet.avatarLabel).toBe("Thinking");
  });

  test("engine stores current state and history", () => {
    const engine = createNyxProactiveStateEngine({ maxHistory: 2 });

    engine.setState({ busy: true });
    engine.setState({ speaking: true });
    engine.setState({ mediaOn: true });

    expect(engine.getState().state).toBe("media");
    expect(engine.getHistory().length).toBe(2);
  });

  test("reset returns ready state", () => {
    const engine = createNyxProactiveStateEngine();

    engine.setState({ busy: true });
    const reset = engine.reset("new_session");

    expect(reset.state).toBe("ready");
    expect(reset.label).toBe("Ready");
  });
});

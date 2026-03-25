function stamp() {
  return new Date().toISOString();
}

function safeSerialize(value) {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack
    };
  }

  if (typeof value === "string") return value;

  try {
    return JSON.parse(JSON.stringify(value));
  } catch (_) {
    return String(value);
  }
}

function normalizeArgs(args) {
  return Array.from(args || []).map(safeSerialize);
}

function createLogger(prefix = "[log]") {
  function format(level, args) {
    return [stamp(), prefix, level, ...normalizeArgs(args)];
  }

  function emit(method, level, args) {
    const writer = typeof console[method] === "function" ? console[method] : console.log;
    writer(...format(level, args));
  }

  return {
    info: (...args) => emit("log", "INFO", args),
    warn: (...args) => emit("warn", "WARN", args),
    error: (...args) => emit("error", "ERROR", args),
    debug: (...args) => emit("debug", "DEBUG", args),
    child: (suffix = "") => createLogger(`${prefix}${suffix ? ` ${suffix}` : ""}`)
  };
}

module.exports = { createLogger };

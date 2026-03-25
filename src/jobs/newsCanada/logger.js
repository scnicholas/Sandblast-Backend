function stamp() {
  return new Date().toISOString();
}

function stringifyWithCircularProtection(value) {
  const seen = new WeakSet();

  return JSON.parse(
    JSON.stringify(value, (key, current) => {
      if (typeof current === "bigint") return current.toString();
      if (typeof current === "function") return `[Function ${current.name || "anonymous"}]`;
      if (current instanceof Error) {
        return {
          name: current.name,
          message: current.message,
          stack: current.stack,
          code: current.code,
          status: current.status || current.response?.status || null
        };
      }
      if (current && typeof current === "object") {
        if (seen.has(current)) return "[Circular]";
        seen.add(current);
      }
      return current;
    })
  );
}

function safeSerialize(value) {
  if (typeof value === "string") return value;

  try {
    return stringifyWithCircularProtection(value);
  } catch (_) {
    return String(value);
  }
}

function normalizeArgs(args) {
  return Array.from(args || []).map(safeSerialize);
}

function joinPrefix(prefix, suffix) {
  return suffix ? `${prefix} ${suffix}` : prefix;
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
    child: (suffix = "") => createLogger(joinPrefix(prefix, suffix))
  };
}

module.exports = { createLogger };

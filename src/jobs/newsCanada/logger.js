function stamp() {
  return new Date().toISOString();
}

function createLogger(prefix = "[log]") {
  function format(level, args) {
    return [stamp(), prefix, level, ...args];
  }

  return {
    info: (...args) => console.log(...format("INFO", args)),
    warn: (...args) => console.warn(...format("WARN", args)),
    error: (...args) => console.error(...format("ERROR", args)),
    debug: (...args) => console.debug(...format("DEBUG", args))
  };
}

module.exports = { createLogger };

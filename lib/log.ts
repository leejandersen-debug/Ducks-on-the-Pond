// Structured logger: one JSON line per call, e.g.
//   {"ts":"2026-10-24T15:04:05.123Z","level":"info","event":"health.check","details":{"db":"ok"}}
// LOG_LEVEL (debug | info | warn | error) sets the minimum level written.
// Defaults: debug in development, info everywhere else.

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 } as const;

export type LogLevel = keyof typeof LEVELS;
export type LogDetails = Record<string, unknown>;

function activeLevel(): LogLevel {
  const fromEnv = process.env.LOG_LEVEL?.toLowerCase();
  if (fromEnv && fromEnv in LEVELS) return fromEnv as LogLevel;
  return process.env.NODE_ENV === "development" ? "debug" : "info";
}

const minimum = LEVELS[activeLevel()];

// Error objects stringify to {} by default; keep their name, message, code and stack.
function replacer(_key: string, value: unknown) {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      code: (value as NodeJS.ErrnoException).code,
      stack: value.stack,
    };
  }
  if (typeof value === "bigint") return value.toString();
  return value;
}

function write(level: LogLevel, event: string, details?: LogDetails) {
  if (LEVELS[level] < minimum) return;
  const entry = { ts: new Date().toISOString(), level, event, ...(details && { details }) };
  let line: string;
  try {
    line = JSON.stringify(entry, replacer);
  } catch {
    line = JSON.stringify({ ...entry, details: "[unserializable]" });
  }
  // warn/error go to stderr so Vercel's log view flags them.
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const log = {
  debug: (event: string, details?: LogDetails) => write("debug", event, details),
  info: (event: string, details?: LogDetails) => write("info", event, details),
  warn: (event: string, details?: LogDetails) => write("warn", event, details),
  error: (event: string, details?: LogDetails) => write("error", event, details),
};

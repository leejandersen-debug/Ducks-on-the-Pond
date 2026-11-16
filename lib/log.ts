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

// Safety net, not a substitute for logging only references (IDs, event names, statuses).
// Values under these keys are dropped whole; e.g. { body }, { token }, { userEmail }.
const SENSITIVE_KEY =
  /pass(word)?|secret|token|authorization|cookie|session|api.?key|email|body|card.?num|^pan$|cvv|connection.?string|database_url/i;

// Luhn checksum, so long IDs and millisecond timestamps aren't mistaken for card numbers.
function luhn(digits: string) {
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 1 && (d *= 2) > 9) d -= 9;
    sum += d;
  }
  return sum % 10 === 0;
}

function scrub(text: string) {
  return text
    .replace(/(\w+:\/\/[^:/@\s]+:)[^@\s]+@/g, "$1[redacted]@") // user:password@ in URLs
    .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, "[email]")
    .replace(/\b(?:\d[ -]?){12,18}\d\b/g, (m) => {
      const digits = m.replace(/\D/g, ""); // 13–19 digits that pass Luhn keep only the last 4
      return luhn(digits) ? `[card …${digits.slice(-4)}]` : m;
    });
}

// Error objects stringify to {} by default; keep name, code, message and stack (scrubbed),
// and nothing else, since extra properties like URL's `input` can hold the raw secret.
function replacer(key: string, value: unknown) {
  if (key && SENSITIVE_KEY.test(key)) return "[redacted]";
  if (value instanceof Error) {
    return {
      name: value.name,
      code: (value as NodeJS.ErrnoException).code,
      message: scrub(value.message),
      stack: value.stack && scrub(value.stack),
    };
  }
  if (typeof value === "string") return scrub(value);
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

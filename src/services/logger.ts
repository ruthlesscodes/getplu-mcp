const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 } as const;

export type LogLevel = keyof typeof LEVELS;

export interface Logger {
  debug(message: string, meta?: unknown): void;
  info(message: string, meta?: unknown): void;
  warn(message: string, meta?: unknown): void;
  error(message: string, meta?: unknown): void;
}

/**
 * Everything goes to stderr on purpose: over stdio transport, stdout carries
 * the JSON-RPC stream and any stray write corrupts the session.
 */
export function createLogger(level: LogLevel = "info"): Logger {
  const threshold = LEVELS[level];

  const write = (at: LogLevel, message: string, meta?: unknown) => {
    if (LEVELS[at] < threshold) return;
    const line = `[getplu-mcp] ${at.toUpperCase()} ${message}`;
    process.stderr.write(meta === undefined ? `${line}\n` : `${line} ${safeJson(meta)}\n`);
  };

  return {
    debug: (message, meta) => write("debug", message, meta),
    info: (message, meta) => write("info", message, meta),
    warn: (message, meta) => write("warn", message, meta),
    error: (message, meta) => write("error", message, meta),
  };
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

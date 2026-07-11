import pino from "pino";

const isProduction = process.env["NODE_ENV"] === "production";

export const logger = pino({
  level: process.env["LOG_LEVEL"] ?? (isProduction ? "info" : "debug"),
  // pino-pretty is a devDependency: referenced only by this runtime target string so the
  // production bundle never depends on it.
  ...(isProduction ? {} : { transport: { target: "pino-pretty", options: { colorize: true } } }),
});

/**
 * A logger whose every message is prefixed with an uppercase `[LOCATION]` tag (e.g. `[GIVEAWAYS
 * SERVICE]`) so a log line's origin is obvious when tracing issues. Pass the location in natural
 * case — the bracketing and uppercasing live here so call sites never format the prefix themselves.
 */
export function createLogger(location: string) {
  return logger.child({}, { msgPrefix: `[${location.toUpperCase()}] ` });
}

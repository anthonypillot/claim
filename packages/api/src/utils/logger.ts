import pino from "pino";

const isProduction = process.env["NODE_ENV"] === "production";

export const logger = pino({
  level: process.env["LOG_LEVEL"] ?? (isProduction ? "info" : "debug"),
  // pino-pretty is a devDependency: referenced only by this runtime target string so the
  // production bundle never depends on it.
  ...(isProduction ? {} : { transport: { target: "pino-pretty", options: { colorize: true } } }),
});

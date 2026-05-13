import pino from "pino";

export const redactedLogPaths = [
  "req.headers.authorization",
  "req.headers.cookie",
  "res.headers.set-cookie",
  "*.password",
  "*.token",
  "*.apiKey",
  "*.api_key",
  "*.API_FOOTBALL_KEY",
  "*.AUTH_SECRET"
];

export function createLogger(level = process.env.LOG_LEVEL ?? "info") {
  return pino({
    base: { service: "kiniela-api" },
    level,
    redact: {
      paths: redactedLogPaths,
      censor: "[REDACTED]"
    }
  });
}

export function safeErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message.slice(0, 500);
  return String(err).slice(0, 500);
}

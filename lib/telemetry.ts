/**
 * Minimal structured logging for Vercel.
 *
 * Emits one JSON line per event to stdout (info/debug) or stderr (warn/error),
 * which Vercel indexes and lets us filter by any field (`source`, `runId`, etc.).
 * No external APM; upgrade to one when we outgrow this.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogContext {
  /** Logical subsystem — e.g. "scryfall", "deck.action", "search". */
  source: string;
  /** Workflow run ID, request ID, etc. — anything useful for correlating lines. */
  runId?: string;
  userId?: string;
  /** Additional bag for source-specific fields. Must be JSON-serialisable. */
  [key: string]: unknown;
}

interface LogPayload extends LogContext {
  level: LogLevel;
  timestamp: string;
  message: string;
  error?: { name: string; message: string; stack?: string };
}

function emit(payload: LogPayload): void {
  const line = JSON.stringify(payload);
  if (payload.level === "error" || payload.level === "warn") {
    // biome-ignore lint/suspicious/noConsole: structured logging entry point
    console.error(line);
  } else {
    // biome-ignore lint/suspicious/noConsole: structured logging entry point
    console.log(line);
  }
}

function serializeError(err: unknown): NonNullable<LogPayload["error"]> {
  if (err instanceof Error) {
    return {
      name: err.name,
      message: err.message,
      ...(err.stack !== undefined && { stack: err.stack }),
    };
  }
  return { name: "UnknownError", message: String(err) };
}

export function logInfo(ctx: LogContext, message: string): void {
  emit({ ...ctx, level: "info", timestamp: new Date().toISOString(), message });
}

export function logWarn(ctx: LogContext, message: string, err?: unknown): void {
  emit({
    ...ctx,
    level: "warn",
    timestamp: new Date().toISOString(),
    message,
    ...(err !== undefined && { error: serializeError(err) }),
  });
}

export function logError(ctx: LogContext, message: string, err: unknown): void {
  emit({
    ...ctx,
    level: "error",
    timestamp: new Date().toISOString(),
    message,
    error: serializeError(err),
  });
}

/**
 * Wrap a Server Action so unexpected errors are logged as structured lines
 * before being re-thrown. Next.js control-flow errors (redirect, notFound)
 * are re-thrown untouched. ZodErrors are user-input failures, so they're
 * downgraded to warn — actions are expected to catch them and return a
 * typed error result rather than letting them bubble up as 500s.
 */
export function withActionLogging<Args extends unknown[], Result>(
  source: string,
  fn: (...args: Args) => Promise<Result>,
): (...args: Args) => Promise<Result> {
  return async (...args: Args) => {
    try {
      return await fn(...args);
    } catch (err) {
      if (isNextControlFlow(err)) throw err;
      if (isZodError(err)) {
        logWarn({ source }, `validation failed: ${source}`, err);
      } else {
        logError({ source }, `action failed: ${source}`, err);
      }
      throw err;
    }
  };
}

function isZodError(err: unknown): boolean {
  return (
    err instanceof Error &&
    (err.name === "ZodError" || err.constructor.name === "ZodError")
  );
}

export function isNextControlFlow(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const digest = (err as { digest?: unknown }).digest;
  if (typeof digest !== "string") return false;
  return (
    digest.startsWith("NEXT_REDIRECT") || digest === "NEXT_NOT_FOUND"
  );
}

/**
 * Resolve a thrown Server Action error to a user-friendly message.
 * Re-throws Next.js control-flow errors (redirect, notFound) so Next can handle them.
 * In production, Next.js redacts Server Action error messages to a generic
 * "An error occurred in the Server Components render..." string, so we never
 * surface `err.message` directly — always fall back to the caller's friendly text.
 */
export function getActionErrorMessage(err: unknown, fallback: string): string {
  if (isNextControlFlow(err)) throw err;
  return fallback;
}

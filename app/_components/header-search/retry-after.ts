export const MAX_RETRY_AFTER_SECONDS = 10;
export const DEFAULT_RETRY_AFTER_SECONDS = 5;

/**
 * Resolve a `Retry-After` header value (in seconds) into a backoff delay in ms.
 * Falls back to {@link DEFAULT_RETRY_AFTER_SECONDS} for a missing, non-numeric,
 * or non-positive value, then clamps to {@link MAX_RETRY_AFTER_SECONDS} so a
 * hostile/oversized header can't strand the search in a long cooldown.
 */
export function resolveRetryAfterMs(headerValue: string | null): number {
  const parsed = Number(headerValue);
  const seconds =
    Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_RETRY_AFTER_SECONDS;
  return Math.min(seconds, MAX_RETRY_AFTER_SECONDS) * 1000;
}

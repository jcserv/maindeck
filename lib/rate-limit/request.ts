import { type NextRequest } from "next/server";

/**
 * Resolve the originating client IP from a NextRequest.
 *
 * On Vercel, `x-forwarded-for` is set by the edge to the original client IP
 * (left-most entry of a comma-separated list). `x-real-ip` is set on some
 * setups (e.g. local proxies). Fall back to "unknown" so a missing header
 * still produces a stable key — multiple unknown clients will share a bucket,
 * which is acceptable for an anti-abuse limiter.
 */
export function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  const real = request.headers.get("x-real-ip");
  if (real) return real.trim();
  return "unknown";
}
